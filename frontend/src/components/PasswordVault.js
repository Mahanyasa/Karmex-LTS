import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import { useNotifications } from "../context/NotificationContext";

const ITERATIONS = 310000;
const WEB_CRYPTO_AVAILABLE = Boolean(window.isSecureContext && window.crypto?.subtle);
const randomId = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const emptyEntry = () => ({ id: randomId(), title: "", username: "", email: "", phone: "", password: "", url: "", notes: "", updatedAt: new Date().toISOString() });

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(password, salt, iterations = ITERATIONS) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encryptVault(entries, key, salt) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({ entries }));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { version: 1, kdf: "PBKDF2-SHA256", iterations: ITERATIONS, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

async function decryptVault(vault, password) {
  const salt = base64ToBytes(vault.salt);
  const key = await deriveKey(password, salt, vault.iterations);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(vault.iv) }, key, base64ToBytes(vault.ciphertext));
  const parsed = JSON.parse(new TextDecoder().decode(plaintext));
  if (!Array.isArray(parsed.entries)) throw new Error("Invalid vault data");
  return { entries: parsed.entries, key, salt };
}

function generatePassword(length = 24) {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (value) => characters[value % characters.length]).join("");
}

export default function PasswordVault() {
  const { notify, confirm } = useNotifications();
  const keyRef = useRef(null);
  const saltRef = useRef(null);
  const [remoteVault, setRemoteVault] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [entries, setEntries] = useState([]);
  const [draft, setDraft] = useState(emptyEntry());
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/vault").then(({ data }) => setRemoteVault(data.exists ? data.vault : null)).catch((err) => notify(err.response?.data?.message || "Failed to load vault", "error")).finally(() => setLoading(false));
  }, [notify]);

  useEffect(() => {
    if (!unlocked) return undefined;
    const timer = setTimeout(() => lockVault(true), 5 * 60 * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, entries]);

  function lockVault(automatic = false) {
    keyRef.current = null;
    saltRef.current = null;
    setEntries([]);
    setDraft(emptyEntry());
    setEditingId(null);
    setMasterPassword("");
    setConfirmPassword("");
    setUnlocked(false);
    if (automatic) notify("Vault locked after five minutes.", "info");
  }

  async function setupVault(event) {
    event.preventDefault();
    if (masterPassword.length < 12) return notify("Use a master password with at least 12 characters.", "error");
    if (masterPassword !== confirmPassword) return notify("Master passwords do not match.", "error");
    try {
      setBusy(true);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(masterPassword, salt);
      const payload = await encryptVault([], key, salt);
      await api.put("/vault", payload);
      keyRef.current = key;
      saltRef.current = salt;
      setRemoteVault(payload);
      setEntries([]);
      setMasterPassword("");
      setConfirmPassword("");
      setUnlocked(true);
      notify("Encrypted vault created.", "success");
    } catch (err) {
      notify(err.response?.data?.message || "Failed to create vault", "error");
    } finally { setBusy(false); }
  }

  async function unlockVault(event) {
    event.preventDefault();
    try {
      setBusy(true);
      const result = await decryptVault(remoteVault, masterPassword);
      keyRef.current = result.key;
      saltRef.current = result.salt;
      setEntries(result.entries);
      setMasterPassword("");
      setUnlocked(true);
      notify("Vault unlocked.", "success");
    } catch {
      notify("Incorrect master password or damaged vault data.", "error");
    } finally { setBusy(false); }
  }

  async function persist(nextEntries) {
    const payload = await encryptVault(nextEntries, keyRef.current, saltRef.current);
    await api.put("/vault", payload);
    setRemoteVault(payload);
    setEntries(nextEntries);
  }

  async function saveEntry(event) {
    event.preventDefault();
    if (!draft.title.trim()) return notify("Give this credential a name.", "error");
    try {
      setBusy(true);
      const saved = { ...draft, title: draft.title.trim(), updatedAt: new Date().toISOString() };
      const next = editingId ? entries.map((entry) => entry.id === editingId ? saved : entry) : [saved, ...entries];
      await persist(next);
      setDraft(emptyEntry());
      setEditingId(null);
      setShowPassword(false);
      notify(editingId ? "Credential updated." : "Credential encrypted and saved.", "success");
    } catch (err) {
      notify(err.response?.data?.message || "Failed to save credential", "error");
    } finally { setBusy(false); }
  }

  async function deleteEntry(entry) {
    const approved = await confirm({ title: "Delete credential?", message: `${entry.title} will be permanently removed from the encrypted vault.`, confirmLabel: "Delete", danger: true });
    if (!approved) return;
    try {
      setBusy(true);
      await persist(entries.filter((item) => item.id !== entry.id));
      notify("Credential deleted.", "success");
    } catch (err) { notify(err.response?.data?.message || "Failed to delete credential", "error"); }
    finally { setBusy(false); }
  }

  async function copyValue(value, label) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    notify(`${label} copied. Clipboard will be cleared in 30 seconds.`, "success");
    setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 30000);
  }

  const filtered = useMemo(() => entries.filter((entry) => `${entry.title} ${entry.username} ${entry.email} ${entry.phone}`.toLowerCase().includes(search.toLowerCase())), [entries, search]);

  if (loading) return <main className="workspace vault-workspace"><div className="github-loading">Loading encrypted vault...</div></main>;
  if (!WEB_CRYPTO_AVAILABLE) return <main className="workspace vault-workspace"><div className="vault-lock-screen"><span className="vault-lock-mark">!</span><span className="eyebrow">SECURE CONNECTION REQUIRED</span><h1>Vault unavailable</h1><p>Browser encryption is only available over HTTPS or localhost. Enable HTTPS for Karmex LTS before creating or unlocking the password vault.</p></div></main>;
  if (!unlocked) return (
    <main className="workspace vault-workspace">
      <div className="vault-lock-screen">
        <span className="vault-lock-mark">◆</span><span className="eyebrow">CLIENT-SIDE ENCRYPTED</span>
        <h1>{remoteVault ? "Unlock your vault" : "Create your private vault"}</h1>
        <p>{remoteVault ? "Enter your master password to decrypt credentials on this device." : "Choose a master password that only you know. Karmex LTS cannot recover it or read your vault."}</p>
        <form onSubmit={remoteVault ? unlockVault : setupVault}>
          <label>Master password<input type="password" value={masterPassword} onChange={(event) => setMasterPassword(event.target.value)} autoComplete="current-password" minLength={12} required /></label>
          {!remoteVault && <label>Confirm master password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} required /></label>}
          <button type="submit" className="accent-btn" disabled={busy}>{busy ? "Working..." : remoteVault ? "Unlock vault" : "Create encrypted vault"}</button>
        </form>
        <small>There is no password recovery. Losing the master password permanently locks the encrypted data.</small>
      </div>
    </main>
  );

  return (
    <main className="workspace vault-workspace">
      <header className="workspace-header"><div><span className="eyebrow">ZERO-KNOWLEDGE STORAGE</span><h1>Password vault</h1><p>Credentials are encrypted in your browser before storage.</p></div><button type="button" className="secondary-btn" onClick={() => lockVault(false)}>Lock vault</button></header>
      <div className="vault-layout">
        <section className="vault-list-panel">
          <div className="vault-list-toolbar"><input type="search" placeholder="Search credentials" value={search} onChange={(event) => setSearch(event.target.value)} /><button type="button" className="accent-btn" onClick={() => { setDraft(emptyEntry()); setEditingId(null); }}>+</button></div>
          <div className="vault-list">{filtered.map((entry) => <button type="button" key={entry.id} className={editingId === entry.id ? "vault-entry active" : "vault-entry"} onClick={() => { setDraft(entry); setEditingId(entry.id); setShowPassword(false); }}><span>{entry.title.charAt(0).toUpperCase()}</span><div><strong>{entry.title}</strong><small>{entry.username || entry.email || entry.phone || "Credential"}</small></div></button>)}{!filtered.length && <div className="vault-empty">No credentials found.</div>}</div>
        </section>
        <form className="vault-editor" onSubmit={saveEntry}>
          <div className="vault-editor-heading"><div><span className="eyebrow">{editingId ? "EDIT ENTRY" : "NEW ENTRY"}</span><h2>{editingId ? draft.title : "Add credential"}</h2></div>{editingId && <button type="button" className="danger-btn" onClick={() => deleteEntry(draft)} disabled={busy}>Delete</button>}</div>
          <div className="vault-fields">
            <label className="wide">Name<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="e.g. GitHub" required /></label>
            <label>Username<div className="vault-input-action"><input value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} /><button type="button" onClick={() => copyValue(draft.username, "Username")}>Copy</button></div></label>
            <label>Email<div className="vault-input-action"><input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /><button type="button" onClick={() => copyValue(draft.email, "Email")}>Copy</button></div></label>
            <label>Phone number<input type="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
            <label>Password<div className="vault-input-action"><input type={showPassword ? "text" : "password"} value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button><button type="button" onClick={() => copyValue(draft.password, "Password")}>Copy</button></div></label>
            <label className="wide">Website<input type="url" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://" /></label>
            <label className="wide">Secure notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
          </div>
          <div className="vault-editor-actions"><button type="button" className="secondary-btn" onClick={() => setDraft({ ...draft, password: generatePassword() })}>Generate password</button><button type="submit" className="accent-btn" disabled={busy}>{busy ? "Encrypting..." : "Encrypt & save"}</button></div>
        </form>
      </div>
    </main>
  );
}
