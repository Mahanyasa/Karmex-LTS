import React, { useCallback, useEffect, useState } from "react";
import api from "../api";
import { useNotifications } from "../context/NotificationContext";
import { Link } from "react-router-dom";

function Person({ person }) {
  return <><span className="social-avatar">{person.avatar ? <img src={person.avatar} alt="" /> : person.name.charAt(0).toUpperCase()}</span><div><Link to={`/u/${person.username}`}>{person.name}</Link><span>@{person.username}</span></div></>;
}

export default function SocialPanel({ boards, reloadBoards }) {
  const { notify, confirm } = useNotifications();
  const [social, setSocial] = useState({ incoming: [], outgoing: [], friends: [] });
  const [username, setUsername] = useState("");
  const [selectedBoard, setSelectedBoard] = useState("");
  const [selectedFriend, setSelectedFriend] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSocial = useCallback(async () => {
    try { const { data } = await api.get("/social"); setSocial(data); }
    catch (err) { notify(err.response?.data?.message || "Failed to load friends", "error"); }
  }, [notify]);

  useEffect(() => { loadSocial(); }, [loadSocial]);

  async function sendRequest(event) {
    event.preventDefault();
    try { setBusy(true); await api.post("/social/requests", { username }); setUsername(""); await loadSocial(); notify("Friend request sent.", "success"); }
    catch (err) { notify(err.response?.data?.message || "Failed to send friend request", "error"); }
    finally { setBusy(false); }
  }

  async function respond(id, action) {
    try { await api.patch(`/social/requests/${id}`, { action }); await loadSocial(); notify(action === "accept" ? "Friend request accepted." : "Friend request declined.", "success"); }
    catch (err) { notify(err.response?.data?.message || "Failed to update request", "error"); }
  }

  async function removeFriend(friend) {
    const approved = await confirm({ title: "Remove friend?", message: `@${friend.username} will be removed. Existing board shares remain until you remove them.`, confirmLabel: "Remove", danger: true });
    if (!approved) return;
    await api.delete(`/social/friends/${friend._id}`); await loadSocial(); notify("Friend removed.", "success");
  }

  async function shareBoard(event) {
    event.preventDefault();
    if (!selectedBoard || !selectedFriend) return notify("Choose a board and friend.", "error");
    try { setBusy(true); await api.post(`/boards/${selectedBoard}/share`, { userId: selectedFriend }); await reloadBoards(); notify("Board shared.", "success"); }
    catch (err) { notify(err.response?.data?.message || "Failed to share board", "error"); }
    finally { setBusy(false); }
  }

  async function stopSharing(board, share) {
    try {
      await api.delete(`/boards/${board._id}/share/${share.user._id}`);
      await reloadBoards();
      notify(`Stopped sharing ${board.name} with @${share.user.username}.`, "success");
    } catch (err) { notify(err.response?.data?.message || "Failed to update sharing", "error"); }
  }

  const ownedBoards = boards.filter((board) => board.permissions?.canManage);

  return (
    <section className="settings-panel social-panel">
      <div className="settings-panel-heading"><div><span className="eyebrow">PEOPLE & SHARING</span><h2>Friends and boards</h2></div><span className="settings-index">03</span></div>
      <form className="friend-search" onSubmit={sendRequest}><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Find by @username" required /><button type="submit" className="accent-btn" disabled={busy}>Add friend</button></form>

      {social.incoming.length > 0 && <div className="social-group"><span className="social-label">Requests</span>{social.incoming.map((request) => <article className="social-row" key={request._id}><Person person={request.requester} /><div className="social-actions"><button type="button" onClick={() => respond(request._id, "accept")}>Accept</button><button type="button" onClick={() => respond(request._id, "decline")}>Decline</button></div></article>)}</div>}

      <div className="social-group"><span className="social-label">Friends · {social.friends.length}</span>{social.friends.map((friend) => <article className="social-row" key={friend._id}><Person person={friend} /><button type="button" className="social-remove" onClick={() => removeFriend(friend)}>×</button></article>)}{!social.friends.length && <p className="social-empty">Add a friend by their unique username to start sharing boards.</p>}</div>

      {social.outgoing.length > 0 && <div className="pending-list"><span>Pending:</span>{social.outgoing.map((request) => <span key={request._id}>@{request.recipient.username}</span>)}</div>}

      <form className="board-share-form" onSubmit={shareBoard}><span className="social-label">Share a board</span><select value={selectedBoard} onChange={(event) => setSelectedBoard(event.target.value)}><option value="">Choose board</option>{ownedBoards.map((board) => <option key={board._id} value={board._id}>{board.name}</option>)}</select><select value={selectedFriend} onChange={(event) => setSelectedFriend(event.target.value)}><option value="">Choose friend</option>{social.friends.map((friend) => <option key={friend._id} value={friend._id}>@{friend.username}</option>)}</select><button type="submit" className="secondary-btn" disabled={busy}>Share read-only</button></form>
      {ownedBoards.some((board) => board.sharedWith?.length) && <div className="shared-access-list"><span className="social-label">Shared access</span>{ownedBoards.flatMap((board) => (board.sharedWith || []).map((share) => <div key={`${board._id}-${share.user._id}`}><span><strong>{board.name}</strong> with @{share.user.username}</span><button type="button" onClick={() => stopSharing(board, share)}>Remove</button></div>))}</div>}
    </section>
  );
}
