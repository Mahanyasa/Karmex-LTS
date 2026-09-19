const crypto = require("crypto");
const SCOPES = "offline_access https://graph.microsoft.com/Calendars.ReadWrite";

function getConfig() {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Microsoft Calendar needs MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET on the server.");
  }
  const tenant = process.env.MICROSOFT_TENANT_ID || "common";
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || `${(process.env.APP_BASE_URL || "http://localhost:3001").replace(/\/$/, "")}/api/microsoft/callback`;
  const parsed = new URL(redirectUri);
  if (process.env.NODE_ENV === "production" && (parsed.protocol !== "https:" || /^(localhost|127\.0\.0\.1)$/.test(parsed.hostname))) throw new Error("Microsoft callback must use a public HTTPS URL in production.");
  return { base: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`, redirectUri };
}

const hash = (value) => crypto.createHash("sha256").update(value).digest("base64url");
function getAuthUrl(state, verifier) {
  const { base, redirectUri } = getConfig();
  const params = new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID, response_type: "code", response_mode: "query", redirect_uri: redirectUri, scope: SCOPES, state, code_challenge: hash(verifier), code_challenge_method: "S256", prompt: "select_account" });
  return `${base}/authorize?${params}`;
}

async function exchangeToken(fields) {
  const { base, redirectUri } = getConfig();
  const response = await fetch(`${base}/token`, {
    method: "POST", signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID, client_secret: process.env.MICROSOFT_CLIENT_SECRET, redirect_uri: redirectUri, scope: SCOPES, ...fields }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    const error = new Error("Microsoft authorization failed. Reconnect Microsoft Calendar.");
    error.code = data.error;
    throw error;
  }
  return { access_token: data.access_token, refresh_token: data.refresh_token, expiry_date: Date.now() + Number(data.expires_in || 3600) * 1000 };
}

// Serialize refreshes per account so simultaneous dictated tasks share one refresh.
const refreshes = new Map();
async function accessToken(user) {
  const key = String(user._id);
  if (!user.microsoftConnected) throw new Error("Microsoft Calendar is disconnected.");
  if (user.microsoftTokens?.access_token && user.microsoftTokens.expiry_date > Date.now() + 60000) return user.microsoftTokens.access_token;
  if (!refreshes.has(key)) refreshes.set(key, (async () => {
    const User = require("../models/User");
    const latest = await User.findById(user._id).select("+microsoftTokens");
    if (!latest?.microsoftConnected || !latest.microsoftTokens?.refresh_token) throw new Error("Reconnect Microsoft Calendar.");
    if (latest.microsoftTokens.expiry_date > Date.now() + 60000) return latest.microsoftTokens.access_token;
    const old = latest.microsoftTokens.refresh_token;
    let tokens;
    try { tokens = await exchangeToken({ grant_type: "refresh_token", refresh_token: old }); }
    catch (error) {
      if (error.code === "invalid_grant") await User.updateOne({ _id: user._id, "microsoftTokens.refresh_token": old }, { $set: { microsoftConnected: false }, $unset: { microsoftTokens: 1 } });
      throw error;
    }
    tokens.refresh_token = tokens.refresh_token || old;
    const result = await User.updateOne({ _id: user._id, microsoftConnected: true, "microsoftTokens.refresh_token": old }, { $set: { microsoftTokens: tokens } });
    if (!result.matchedCount) throw new Error("Microsoft connection changed. Try again.");
    return tokens.access_token;
  })().finally(() => refreshes.delete(key)));
  return refreshes.get(key);
}

async function graphRequest(user, method, path, body) {
  const token = await accessToken(user);
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method, signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204 || (method === "DELETE" && response.status === 404)) return null;
  if (!response.ok) { const error = new Error(`Microsoft Calendar request failed (${response.status}).`); error.status = response.status; throw error; }
  return response.json();
}

module.exports = { getConfig, hash, getAuthUrl, exchangeToken, graphRequest };
