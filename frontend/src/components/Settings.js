import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { useAuth } from "../context/AuthContext";

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

export default function Settings({ googleConnected, connectGoogle, disconnectGoogle, githubConnected, githubProfile, connectGitHub, disconnectGitHub }) {
  const { user, updateProfile, logout } = useAuth();
  const fileInputRef = useRef(null);
  const [name, setName] = useState(user?.name || "");
  const [avatar, setAvatar] = useState(user?.avatar || null);
  const [storage, setStorage] = useState({ loading: true, connected: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

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
      await updateProfile({ name, avatar });
      setMessage("Profile updated.");
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
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

      {message && <button className="info-banner" type="button" onClick={() => setMessage("")}><span>{message}</span><span>×</span></button>}

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
            <label className="settings-field"><span>Email address</span><input value={user?.email || ""} disabled /></label>

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

        <section className="settings-panel session-panel">
          <div><span className="eyebrow">SESSION</span><h2>Account access</h2><p>Sign out of MK Life on this device.</p></div>
          <div className="session-actions"><div className="settings-legal-links"><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms & Conditions</Link></div><button type="button" className="danger-btn" onClick={logout}>Log out</button></div>
        </section>
      </div>
    </main>
  );
}
