const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const auth = require("../middleware/auth");
const { getConfig, hash, getAuthUrl, exchangeToken } = require("../config/microsoftClient");
const router = express.Router();
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api" });

router.get("/auth-url", auth, async (req, res) => {
  try {
    const state = crypto.randomBytes(32).toString("base64url");
    const verifier = crypto.randomBytes(48).toString("base64url");
    const url = getAuthUrl(state, verifier);
    await User.findByIdAndUpdate(req.userId, { microsoftOAuth: { stateHash: hash(state), verifier, expiresAt: new Date(Date.now() + 600000) } });
    res.cookie("karmex_ms_oauth", state, { ...cookieOptions(), maxAge: 600000 });
    res.json({ url });
  } catch (error) { res.status(503).json({ message: error.message }); }
});

router.get("/callback", async (req, res) => {
  const origin = (process.env.CLIENT_ORIGIN || "http://localhost:3000").split(",")[0].trim().replace(/\/$/, "");
  const redirect = (status) => res.redirect(`${origin}/?microsoft=${status}`);
  const { state, code, error } = req.query;
  const cookie = (req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith("karmex_ms_oauth="))?.slice("karmex_ms_oauth=".length);
  res.clearCookie("karmex_ms_oauth", cookieOptions());
  try {
    if (typeof state !== "string" || !cookie || cookie !== state) return redirect("error");
    // Atomically consume the short-lived state; a callback cannot be replayed.
    const user = await User.findOneAndUpdate({ "microsoftOAuth.stateHash": hash(state), "microsoftOAuth.expiresAt": { $gt: new Date() } }, { $unset: { microsoftOAuth: 1 } }, { new: false }).select("+microsoftOAuth");
    if (!user) return redirect("error");
    if (error) return redirect("denied");
    if (typeof code !== "string") return redirect("error");
    const tokens = await exchangeToken({ grant_type: "authorization_code", code, code_verifier: user.microsoftOAuth.verifier });
    if (!tokens.refresh_token) return redirect("error");
    await User.findByIdAndUpdate(user._id, { microsoftTokens: tokens, microsoftConnected: true });
    return redirect("connected");
  } catch { return redirect("error"); }
});

router.get("/status", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    let message = null;
    try { getConfig(); } catch (error) { message = error.message; }
    res.json({ connected: !!user?.microsoftConnected, configured: !message, message });
  } catch { res.status(500).json({ message: "Unable to check Microsoft Calendar." }); }
});

router.post("/disconnect", auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, { $set: { microsoftConnected: false }, $unset: { microsoftTokens: 1, microsoftOAuth: 1 } });
    res.clearCookie("karmex_ms_oauth", cookieOptions());
    res.json({ connected: false });
  } catch { res.status(500).json({ message: "Unable to disconnect Microsoft Calendar." }); }
});
module.exports = router;
