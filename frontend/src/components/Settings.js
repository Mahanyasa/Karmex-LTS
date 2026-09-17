import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import SocialPanel from "./SocialPanel";
import { API_VERSION, APP_VERSION } from "../version";

function resizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not load that image"));
      image.onload = () => {
        const size = 320;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        const crop = Math.min(image.width, image.height);
        const sourceX = (image.width - crop) / 2;
        const sourceY = (image.height - crop) / 2;
        context.drawImage(image, sourceX, sourceY, crop, crop, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function Settings({ googleConnected, connectGoogle, disconnectGoogle, githubConnected, githubProfile, connectGitHub, disconnectGitHub, boards, reloadBoards }) {
  const { user, updateProfile, logout } = useAuth();
  const { notify } = useNotifications();
  const fileInputRef = useRef(null);
  const [name, setName] = useState(user?.name || "");
  const [username, setUsername] = useState(user?.username || "");
  const [profile, setProfile] = useState({ bio: "", website: "", youtube: "", facebook: "", instagram: "", linkedin: "", x: "", ...(user?.profile || {}) });
  const [avatar, setAvatar] = useState(user?.avatar || null);
  const [storage, setStorage] = useState({ loading: true, connected: false });
  const [saving, setSaving] = useState(false);
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const setMessage = (message) => notify(message, /failed|error|choose/i.test(message) ? "error" : "success");

  useEffect(() => {
    async function loadStorageStatus() {
      try {
        const { data } = await api.get("/files/status");
        setStorage({ loading: false, ...data });
      } catch (err) {
        setStorage({
          loading: false,
          connected: false,
          message: err.response?.data?.message || "Storage unavailable",
        });
      }
    }
    loadStorageStatus();
  }, []);

  async function selectAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Choose a JPG, PNG, or WebP image.");
      return;
    }
    try {
      setAvatar(await resizeAvatar(file));
      setMessage("Photo ready. Save your profile to apply it.");
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    try {
      setSaving(true);
      setMessage("");
      await updateProfile({ name, username, avatar, profile });
      setMessage("Profile updated.");
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  const passwordChecks = {
    length: passwords.next.length >= 10,
    upper: /[A-Z]/.test(passwords.next),
    lower: /[a-z]/.test(passwords.next),
    number: /\d/.test(passwords.next),
    matches: Boolean(passwords.next) && passwords.next === passwords.confirm,
  };

  async function changePassword(event) {
    event.preventDefault();
    if (!Object.values(passwordChecks).every(Boolean)) return notify("Complete all password requirements.", "error");
    try {
      setPasswordBusy(true);
      const { data } = await api.patch("/auth/password", { currentPassword: passwords.current, newPassword: passwords.next });
      setPasswords({ current: "", next: "", confirm: "" });
      setShowPasswords(false);
      notify(data.message || "Password updated successfully.", "success");
    } catch (err) { notify(err.response?.data?.message || "Failed to update password", "error"); }
    finally { setPasswordBusy(false); }
  }

  return (
    <main className="workspace settings-workspace">
      <header className="workspace-header settings-header">
        <div>
          <div className="eyebrow">ACCOUNT CONTROL CENTER</div>
          <h1>Settings</h1>
          <p>Manage your identity, connections, and private workspace services.</p>
        </div>
      </header>

      <div className="settings-grid">
        <section className="settings-panel profile-panel">
          <div className="settings-panel-heading">
            <div><span className="eyebrow">PROFILE</span><h2>Your identity</h2></div>
            <span className="settings-index">01</span>
          </div>

          <form onSubmit={saveProfile}>
            <div className="profile-photo-row">
              <button type="button" className="profile-photo" onClick={() => fileInputRef.current?.click()} title="Change profile photo">
                {avatar ? <img src={avatar} alt="Profile preview" /> : <span>{(name || "U").charAt(0).toUpperCase()}</span>}
                <span className="photo-edit">+</span>
              </button>
              <div><strong>Profile photo</strong><span>JPG, PNG or WebP. Cropped automatically.</span></div>
              <input ref={fileInputRef} className="hidden-file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectAvatar} />
            </div>

            <label className="settings-field"><span>Display name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength="80" required /></label>
            <label className="settings-field"><span>Unique username</span><div className="username-field"><b>@</b><input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} minLength="3" maxLength="24" required /></div></label>
            <label className="settings-field"><span>Email address</span><input value={user?.email || ""} disabled /></label>
            <label className="settings-field"><span>Bio</span><textarea value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} maxLength="280" placeholder="A short introduction for your public profile" /></label>

            <div className="profile-links-grid">
              <label className="settings-field wide"><span>Website</span><input type="url" value={profile.website} onChange={(event) => setProfile({ ...profile, website: event.target.value })} placeholder="https://your-site.com" /></label>
              <label className="settings-field"><span>YouTube</span><input value={profile.youtube} onChange={(event) => setProfile({ ...profile, youtube: event.target.value })} placeholder="@channel or profile URL" /></label>
              <label className="settings-field"><span>Instagram</span><input value={profile.instagram} onChange={(event) => setProfile({ ...profile, instagram: event.target.value })} placeholder="@username or profile URL" /></label>
              <label className="settings-field"><span>Facebook</span><input value={profile.facebook} onChange={(event) => setProfile({ ...profile, facebook: event.target.value })} placeholder="username or profile URL" /></label>
              <label className="settings-field"><span>LinkedIn</span><input value={profile.linkedin} onChange={(event) => setProfile({ ...profile, linkedin: event.target.value })} placeholder="profile ID or URL" /></label>
              <label className="settings-field wide"><span>X</span><input value={profile.x} onChange={(event) => setProfile({ ...profile, x: event.target.value })} placeholder="@username or profile URL" /></label>
            </div>

            <div className="settings-form-actions">
              {avatar && <button type="button" className="text-action" onClick={() => setAvatar(null)}>Remove photo</button>}
              <button type="submit" className="accent-btn" disabled={saving}>{saving ? "Saving..." : "Save profile"}</button>
            </div>
          </form>
        </section>

        <section className="settings-panel connections-panel">
          <div className="settings-panel-heading">
            <div><span className="eyebrow">CONNECTIONS</span><h2>Connected services</h2></div>
            <span className="settings-index">02</span>
          </div>

          <div className="connection-list">
            <article className="connection-row">
              <span className="connection-logo google-logo">G</span>
              <div><strong>Google Calendar</strong><span>Creates reminders for your post-its.</span></div>
              <div className="connection-control">
                <span className={googleConnected ? "connection-state connected" : "connection-state"}>{googleConnected ? "Connected" : "Not connected"}</span>
                <button type="button" className="secondary-btn" onClick={googleConnected ? disconnectGoogle : connectGoogle}>{googleConnected ? "Disconnect" : "Connect"}</button>
              </div>
            </article>

            <article className="connection-row">
              <span className="connection-logo github-logo">GH</span>
              <div><strong>GitHub</strong><span>{githubConnected ? `@${githubProfile?.login || "connected"} · personal and organization activity` : "Track repositories, pull requests, issues, and commits."}</span></div>
              <div className="connection-control">
                <span className={githubConnected ? "connection-state connected" : "connection-state"}>{githubConnected ? "Connected" : "Not connected"}</span>
                <button type="button" className="secondary-btn" onClick={githubConnected ? disconnectGitHub : connectGitHub}>{githubConnected ? "Disconnect" : "Connect"}</button>
              </div>
            </article>

            <article className="connection-row">
              <span className="connection-logo s3-logo">S3</span>
              <div><strong>Private file storage</strong><span>{storage.connected ? `${storage.bucket} · ${storage.region}` : storage.message || "Checking AWS S3"}</span></div>
              <div className="connection-control"><span className={storage.connected ? "connection-state connected" : "connection-state error"}>{storage.loading ? "Checking" : storage.connected ? "Connected" : "Needs attention"}</span></div>
            </article>
          </div>
        </section>

        <SocialPanel boards={boards} reloadBoards={reloadBoards} />

        <section className="settings-panel password-panel">
          <div className="settings-panel-heading">
            <div><span className="eyebrow">SECURITY</span><h2>Change password</h2></div>
            <span className="settings-index">04</span>
          </div>
          <form className="password-form" onSubmit={changePassword}>
            <p>Verify your current password, then choose a stronger replacement.</p>
            <label className="settings-field"><span>Current password</span><input type={showPasswords ? "text" : "password"} value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} autoComplete="current-password" required /></label>
            <div className="password-field-grid">
              <label className="settings-field"><span>New password</span><input type={showPasswords ? "text" : "password"} value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} autoComplete="new-password" required /></label>
              <label className="settings-field"><span>Confirm new password</span><input type={showPasswords ? "text" : "password"} value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} autoComplete="new-password" required /></label>
            </div>
            <div className="password-requirements"><span className={passwordChecks.length ? "met" : ""}>10+ characters</span><span className={passwordChecks.upper ? "met" : ""}>Uppercase</span><span className={passwordChecks.lower ? "met" : ""}>Lowercase</span><span className={passwordChecks.number ? "met" : ""}>Number</span><span className={passwordChecks.matches ? "met" : ""}>Passwords match</span></div>
            <div className="settings-form-actions"><label className="password-visibility"><input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} /> Show passwords</label><button type="submit" className="accent-btn" disabled={passwordBusy}>{passwordBusy ? "Updating..." : "Update password"}</button></div>
          </form>
        </section>

        <section className="settings-panel session-panel">
          <div><span className="eyebrow">SESSION</span><h2>Account access</h2><p>Sign out of Karmex LTS on this device.</p><span className="app-version">Karmex LTS {APP_VERSION} · API {API_VERSION}</span></div>
          <div className="session-actions"><div className="settings-legal-links"><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms & Conditions</Link></div><button type="button" className="danger-btn" onClick={logout}>Log out</button></div>
        </section>
      </div>
    </main>
  );
}
