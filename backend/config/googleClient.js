const { google } = require("googleapis");

// Scopes: only calendar event access (least privilege needed to create
// reminders). Does NOT request Gmail read/send access.
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

function getRedirectUri() {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI.trim();
  }

  const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3001")
    .trim()
    .replace(/\/$/, "");

  return `${baseUrl}/api/google/callback`;
}

function validateGoogleConfig() {
  const missing = [];

  if (!process.env.GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");

  if (missing.length) {
    throw new Error(`Missing Google OAuth configuration: ${missing.join(", ")}`);
  }

  const redirectUri = getRedirectUri();

  if (process.env.NODE_ENV === "production" && /localhost|127\.0\.0\.1/i.test(redirectUri)) {
    throw new Error(
      "Google OAuth callback cannot use localhost in production. Set APP_BASE_URL to the public backend URL."
    );
  }

  return redirectUri;
}

function getOAuthClient() {
  const redirectUri = validateGoogleConfig();

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

function getAuthUrl(state) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // needed to get a refresh_token
    prompt: "consent", // force refresh_token on repeat connects
    scope: SCOPES,
    state,
  });
}

// Returns an authenticated OAuth2 client for a given user's stored tokens.
// Mutates and persists the user's tokens if googleapis refreshes them.
function getClientForUser(user) {
  const client = getOAuthClient();
  if (!user.googleTokens || !user.googleTokens.access_token) {
    return null;
  }
  client.setCredentials({
    access_token: user.googleTokens.access_token,
    refresh_token: user.googleTokens.refresh_token,
    scope: user.googleTokens.scope,
    token_type: user.googleTokens.token_type,
    expiry_date: user.googleTokens.expiry_date,
  });

  client.on("tokens", async (tokens) => {
    // googleapis calls this automatically when it refreshes an access token
    try {
      const User = require("../models/User");
      const update = {};
      if (tokens.access_token) update["googleTokens.access_token"] = tokens.access_token;
      if (tokens.refresh_token) update["googleTokens.refresh_token"] = tokens.refresh_token;
      if (tokens.expiry_date) update["googleTokens.expiry_date"] = tokens.expiry_date;
      if (Object.keys(update).length) {
        await User.findByIdAndUpdate(user._id, update);
      }
    } catch (err) {
      console.error("[google] Failed to persist refreshed tokens:", err.message);
    }
  });

  return client;
}

module.exports = {
  getOAuthClient,
  getAuthUrl,
  getClientForUser,
  getRedirectUri,
  validateGoogleConfig,
  SCOPES,
};

