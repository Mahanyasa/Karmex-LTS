const views = ["settingsView", "loginView", "unlockView", "entriesView"];
const $ = (id) => document.getElementById(id);
let pageContext = { hostname: "", hasLoginForm: false };
let vaultPayload = null;
let entries = [];

function showView(id) {
  views.forEach((view) => $(view).classList.toggle("hidden", view !== id));
  $("message").classList.add("hidden");
}

function message(text) {
  $("message").textContent = text;
  $("message").classList.remove("hidden");
}

async function settings() {
  return chrome.storage.local.get({ apiUrl: "http://localhost:3001/api" });
}

async function api(path, options = {}) {
  const { apiUrl } = await settings();
  const { authToken } = await chrome.storage.session.get("authToken");
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function decryptVault(vault, password) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: base64ToBytes(vault.salt), iterations: vault.iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(vault.iv) }, key, base64ToBytes(vault.ciphertext));
  const parsed = JSON.parse(new TextDecoder().decode(plaintext));
  if (!Array.isArray(parsed.entries)) throw new Error("Invalid vault");
  return parsed.entries;
}

function entryMatchesSite(entry) {
  if (!entry.url || !pageContext.hostname) return false;
  try {
    const host = new URL(entry.url).hostname.replace(/^www\./, "");
    const current = pageContext.hostname.replace(/^www\./, "");
    return host === current || current.endsWith(`.${host}`) || host.endsWith(`.${current}`);
  } catch { return false; }
}

function renderEntries(query = "") {
  const normalized = query.toLowerCase();
  const ordered = [...entries].sort((a, b) => Number(entryMatchesSite(b)) - Number(entryMatchesSite(a)));
  const filtered = ordered.filter((entry) => `${entry.title} ${entry.username} ${entry.email} ${entry.phone} ${entry.url}`.toLowerCase().includes(normalized));
  $("entries").replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "No matching credentials"; $("entries").append(empty); return;
  }
  filtered.forEach((entry) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "entry";
    const mark = document.createElement("span"); mark.className = "entry-mark"; mark.textContent = (entry.title || "?").charAt(0).toUpperCase();
    const copy = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = entry.title;
    const identity = document.createElement("small"); identity.textContent = entry.username || entry.email || entry.phone || "Credential";
    copy.append(title, identity); button.append(mark, copy);
    if (entryMatchesSite(entry)) { const badge = document.createElement("span"); badge.className = "match"; badge.textContent = "MATCH"; button.append(badge); }
    button.addEventListener("click", () => fill(entry));
    $("entries").append(button);
  });
}

async function fill(entry) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return message("No active tab found.");
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "FILL_CREDENTIAL", entry: { username: entry.username, email: entry.email, phone: entry.phone, password: entry.password } });
    if (!response?.ok) throw new Error(response?.message || "Could not fill this page");
    window.close();
  } catch (err) { message(err.message); }
}

async function loadPageContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try { pageContext = await chrome.tabs.sendMessage(tab.id, { type: "PAGE_CONTEXT" }); } catch { pageContext = { hostname: new URL(tab.url).hostname, hasLoginForm: false }; }
  $("siteName").textContent = pageContext.hostname || "Current site";
}

async function initialize() {
  await loadPageContext();
  const session = await chrome.storage.session.get(["authToken", "vaultEntries"]);
  if (!session.authToken) return showView("loginView");
  if (session.vaultEntries) {
    entries = session.vaultEntries;
    showView("entriesView"); renderEntries(); return;
  }
  try {
    const result = await api("/vault");
    if (!result.exists) { showView("unlockView"); return message("Create your vault in the Karmex LTS web app first."); }
    vaultPayload = result.vault;
    showView("unlockView");
  } catch (err) {
    await chrome.storage.session.remove("authToken");
    showView("loginView"); message(err.message);
  }
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: $("email").value, password: $("accountPassword").value }) });
    await chrome.storage.session.set({ authToken: result.token });
    const vault = await api("/vault");
    if (!vault.exists) { showView("unlockView"); return message("Create your vault in the web app first."); }
    vaultPayload = vault.vault; showView("unlockView");
  } catch (err) { message(err.message); }
});

$("unlockForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    entries = await decryptVault(vaultPayload, $("masterPassword").value);
    $("masterPassword").value = "";
    await chrome.storage.session.set({ vaultEntries: entries, vaultUnlockedAt: Date.now() });
    chrome.runtime.sendMessage({ type: "VAULT_UNLOCKED" });
    showView("entriesView"); renderEntries();
  } catch { message("Incorrect master password or damaged vault."); }
});

$("search").addEventListener("input", (event) => renderEntries(event.target.value));
$("lockButton").addEventListener("click", async () => { await chrome.storage.session.remove(["vaultEntries", "vaultUnlockedAt"]); entries = []; showView("unlockView"); });
$("signOutButton").addEventListener("click", async () => { await chrome.storage.session.clear(); showView("loginView"); });
$("settingsButton").addEventListener("click", async () => { const { apiUrl } = await settings(); $("apiUrl").value = apiUrl; showView("settingsView"); });
$("saveSettings").addEventListener("click", async () => { const value = $("apiUrl").value.trim().replace(/\/$/, ""); if (!/^https?:\/\//i.test(value)) return message("Enter a valid HTTP or HTTPS API URL."); await chrome.storage.local.set({ apiUrl: value }); await chrome.storage.session.clear(); showView("loginView"); });

initialize();
