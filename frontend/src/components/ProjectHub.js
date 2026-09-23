import React, { useCallback, useEffect, useState } from "react";
import api from "../api";
import { useNotifications } from "../context/NotificationContext";

const idOf = (value) => value?._id || value;
export default function ProjectHub({ projects, reloadProjects, onOpen }) {
  const { notify, confirm } = useNotifications();
  const [selected, setSelected] = useState("");
  const [project, setProject] = useState(null);
  const [invites, setInvites] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [rename, setRename] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("member");
  const [showArchived, setShowArchived] = useState(false);
  const loadInvites = useCallback(async () => {
    try { setInvites((await api.get("/boards/invitations")).data); }
    catch (err) { setError(err.response?.data?.message || "Could not load invitations"); }
  }, []);
  useEffect(() => { loadInvites(); }, [loadInvites]);
  useEffect(() => {
    let live = true; setProject(null);
    if (selected) api.get(`/boards/${selected}`).then(({ data }) => { if (live) { setProject(data); setRename(data.name); } }).catch((err) => { if (live) setError(err.response?.data?.message || "Could not load project"); });
    return () => { live = false; };
  }, [selected]);
  async function mutate(action, success, refreshSelected = true) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await action(); await reloadProjects(); await loadInvites();
      if (refreshSelected && selected) { const { data } = await api.get(`/boards/${selected}`); setProject(data); setRename(data.name); }
      notify(success, "success");
    } catch (err) { setError(err.response?.data?.message || "Project action failed"); }
    finally { setBusy(false); }
  }
  const people = project ? [...(project.members || []), ...(project.sharedWith || []).filter((share) => !project.members?.some((member) => idOf(member.user) === idOf(share.user))).map((share) => ({ ...share, role: "viewer" }))] : [];
  return <main className="workspace project-hub">
    <header className="workspace-header"><div><div className="eyebrow">PROJECTS & TEAM</div><h1>Build together</h1><p>Manage projects, invitations, and access.</p></div><button className="secondary-btn" onClick={() => { reloadProjects(); loadInvites(); }}>Refresh</button></header>
    {error && <p role="alert" className="error-banner">{error}</p>}
    <section className="project-panel"><h2>Invitations</h2>{!invites.length && <p>No pending invitations.</p>}{invites.map((invite) => <div className="project-person" key={invite._id}><span><strong>{invite.projectName}</strong> · {invite.role}<small>From {invite.owner?.name || "project owner"} · Expires {new Date(invite.expiresAt).toLocaleDateString()}</small></span>{["accept", "decline"].map((action) => <button key={action} className="secondary-btn" disabled={busy} onClick={() => mutate(() => api.patch(`/boards/${invite.projectId}/invitations/${invite._id}`, { action }), `Invitation ${action === "accept" ? "accepted" : "declined"}.`, false)}>{action === "accept" ? "Accept" : "Decline"}</button>)}</div>)}</section>
    <form className="project-panel project-form" onSubmit={(event) => { event.preventDefault(); mutate(async () => { const { data } = await api.post("/boards", { name, ...(key ? { projectKey: key } : {}) }); setSelected(data._id); setName(""); setKey(""); }, "Project created.", false); }}>
      <h2>Create a project</h2><label>Name<input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label><label>Project key (optional)<input value={key} maxLength={16} pattern="[A-Z][A-Z0-9]{1,15}" placeholder="KAR" onChange={(e) => setKey(e.target.value.toUpperCase())} /></label><button className="accent-btn" disabled={busy}>Create project</button>
    </form>
    <section className="project-panel"><label className="project-checkbox"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived projects</label><div className="project-grid">{projects.filter((item) => showArchived || !item.archivedAt).map((item) => <button key={item._id} className={`project-card ${selected === item._id ? "selected" : ""}`} onClick={() => { setSelected(item._id); setError(""); }}><strong>{item.name}</strong><small>{item.projectKey || "Key assigned during migration"}</small><span>{item.role || "viewer"}{item.archivedAt ? " · Archived" : ""}</span></button>)}</div></section>
    {project && <section className="project-panel"><div className="project-person"><h2>{project.name}</h2><button className="secondary-btn" onClick={() => onOpen(project._id)}>Open project</button></div><p>{project.projectKey || "Pending migration"} · Your role: {project.role}</p>
      {project.archivedAt && <p>Archived projects are read-only. Existing issues and sprint history are retained.</p>}
      {project.permissions?.canManage && <form className="project-form" onSubmit={(e) => { e.preventDefault(); mutate(() => api.patch(`/boards/${project._id}`, { name: rename }), "Project renamed."); }}><label>Project name<input required maxLength={80} value={rename} onChange={(e) => setRename(e.target.value)} /></label><button className="secondary-btn" disabled={busy}>Rename</button></form>}
      {project.permissions?.canArchive && <button className="secondary-btn" disabled={busy} onClick={async () => { if (await confirm({ title: project.archivedAt ? "Restore project?" : "Archive project?", message: project.archivedAt ? "Members will be able to work in this project again." : "Issues and history will be retained. Pending invitations will be revoked.", confirmLabel: project.archivedAt ? "Restore" : "Archive" })) mutate(() => api.patch(`/boards/${project._id}`, { archived: !project.archivedAt }), project.archivedAt ? "Project restored." : "Project archived."); }}>{project.archivedAt ? "Restore project" : "Archive project"}</button>}
      <h3>People</h3><div className="project-person"><strong>{project.owner?.name || "Project owner"}</strong><span>Owner</span></div>{people.map((member) => <div className="project-person" key={idOf(member.user)}><span>{member.user?.name || member.user?.username || "Former account"}</span>{project.permissions?.canManage ? <><select aria-label={`Role for ${member.user?.name || "member"}`} disabled={busy} value={member.role} onChange={(e) => mutate(() => api.patch(`/boards/${project._id}/members/${idOf(member.user)}`, { role: e.target.value }), "Role updated.")}><option value="member">Member</option><option value="viewer">Viewer</option></select><button className="secondary-btn" disabled={busy} onClick={async () => { if (await confirm({ title: "Remove project access?", message: "This person will lose access, including to issues they created.", confirmLabel: "Remove" })) mutate(() => api.delete(`/boards/${project._id}/members/${idOf(member.user)}`), "Member removed."); }}>Remove</button></> : <span>{member.role}</span>}</div>)}
      {project.permissions?.canManage && <><form className="project-form" onSubmit={(e) => { e.preventDefault(); mutate(async () => { await api.post(`/boards/${project._id}/invitations`, { username, role }); setUsername(""); }, "Invitation created."); }}><label>Invite by username<input required value={username} placeholder="@developer" onChange={(e) => setUsername(e.target.value)} /></label><label>Role<select value={role} onChange={(e) => setRole(e.target.value)}><option value="member">Member — edit work</option><option value="viewer">Viewer — read only</option></select></label><button className="accent-btn" disabled={busy}>Invite</button></form><p>Invitations appear in the recipient’s Projects & Team page and expire after seven days.</p>
      {(project.invitations || []).filter((invite) => invite.status === "pending").map((invite) => <div className="project-person" key={invite._id}><span>{invite.recipient?.name || "Invited account"} · {invite.role} · {new Date(invite.expiresAt) <= new Date() ? "Expired" : "Pending"}</span>{new Date(invite.expiresAt) > new Date() && <button className="secondary-btn" disabled={busy} onClick={() => mutate(() => api.patch(`/boards/${project._id}/invitations/${invite._id}`, { action: "revoke" }), "Invitation revoked.")}>Revoke</button>}</div>)}</>}
    </section>}
  </main>;
}
