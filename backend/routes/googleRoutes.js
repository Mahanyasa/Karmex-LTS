const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");
const { getAuthUrl, getOAuthClient } = require("../config/googleClient");

const router = express.Router();

// GET /api/google/auth-url - returns the Google consent screen URL
// (frontend redirects the browser here; requires login first)
router.get("/auth-url", auth, (req, res) => {
  try {
    // Short-lived signed state token so /callback knows which user this is,
    // without trusting a raw userId passed through the browser.
    const state = jwt.sign({ userId: req.userId }, process.env.JWT_SECRET, {
      expiresIn: "10m",
    });
    const url = getAuthUrl(state);
    res.json({ url });
  } catch (err) {
    console.error("[google] OAuth configuration error:", err.message);
    res.status(503).json({ message: err.message });
  }
});

// GET /api/google/callback - Google redirects here after consent.
// Not behind auth middleware (Google can't send our Bearer token) -
// the signed `state` param authenticates which user this belongs to.
router.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = (process.env.CLIENT_ORIGIN || "http://localhost:3000")
    .split(",")[0]
    .trim()
    .replace(/\/$/, "");

  if (error) {
    return res.redirect(`${frontendUrl}/?google=denied`);
  }

  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);

    await User.findByIdAndUpdate(decoded.userId, {
      googleTokens: {
        access_token: tokens.access_token || null,
        refresh_token: tokens.refresh_token || null,
        scope: tokens.scope || null,
        token_type: tokens.token_type || null,
        expiry_date: tokens.expiry_date || null,
      },
      googleConnected: true,
    });

    res.redirect(`${frontendUrl}/?google=connected`);
  } catch (err) {
    console.error("[google] OAuth callback failed:", err.message);
    res.redirect(`${frontendUrl}/?google=error`);
  }
});

// GET /api/google/status
router.get("/status", auth, async (req, res) => {
  const user = await User.findById(req.userId);
  res.json({ connected: !!user?.googleConnected });
});

// POST /api/google/disconnect
router.post("/disconnect", auth, async (req, res) => {
  await User.findByIdAndUpdate(req.userId, {
    googleTokens: {
      access_token: null,
      refresh_token: null,
      scope: null,
      token_type: null,
      expiry_date: null,
    },
    googleConnected: false,
  });
  res.json({ connected: false });
});

module.exports = router;

