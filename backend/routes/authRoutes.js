const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");
const { TERMS_VERSION, PRIVACY_VERSION } = require("../config/legal");
const crypto = require("crypto");
const cognito = require("../config/cognitoClient");

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
}

async function createUniqueUsername(preferred) {
  let base = normalizeUsername(preferred) || "user";
  if (base.length < 3) base = `${base}user`.slice(0, 24);
  let candidate = base;
  let suffix = 0;
  while (await User.exists({ username: candidate })) {
    suffix += 1;
    candidate = `${base.slice(0, 24 - String(suffix).length)}${suffix}`;
  }
  return candidate;
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, acceptLegal } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    if (acceptLegal !== true) {
      return res.status(400).json({
        message: "You must accept the Terms and Privacy Policy",
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const requestedUsername = normalizeUsername(req.body.username);
    if (req.body.username && !/^[a-z0-9_]{3,24}$/.test(requestedUsername)) {
      return res.status(400).json({ message: "Username must be 3-24 letters, numbers, or underscores" });
    }
    if (requestedUsername && await User.exists({ username: requestedUsername })) {
      return res.status(409).json({ message: "That username is already taken" });
    }
    const username = requestedUsername || await createUniqueUsername(email.split("@")[0] || name);
    let cognitoSub = null;
    if (cognito.isConfigured()) {
      const result = await cognito.signUp({ username, password, email: email.toLowerCase(), name });
      cognitoSub = result.UserSub;
    }
    const user = await User.create({
      name,
      email,
      password: cognito.isConfigured() ? crypto.randomBytes(32).toString("hex") : password,
      username,
      cognitoSub,
      legalAcceptance: {
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        acceptedAt: new Date(),
      },
    });
    if (cognito.isConfigured()) {
      return res.status(201).json({ requiresConfirmation: true, username: user.username, destination: email.replace(/^(.{2}).*(@.*)$/, "$1***$2") });
    }
    const token = signToken(user._id);

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, username: user.username, email: user.email, avatar: user.avatar, profile: user.profile, preferences: user.preferences },
    });
  } catch (err) {
    console.error(err);
    res.status(cognito.isConfigured() ? 400 : 500).json({ message: err.message || "Server error during registration" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const { password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (cognito.isConfigured() && user.cognitoSub) {
      await cognito.authenticate({ username, password });
    } else {
      const match = await user.comparePassword(password);
      if (!match) return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.username) {
      user.username = await createUniqueUsername(user.email.split("@")[0] || user.name);
      await user.save();
    }
    const token = signToken(user._id);
    res.json({
      token,
      user: { id: user._id, name: user.name, username: user.username, email: user.email, avatar: user.avatar, profile: user.profile, preferences: user.preferences },
    });
  } catch (err) {
    console.error(err);
    res.status(cognito.isConfigured() ? 401 : 500).json({ message: err.message || "Server error during login" });
  }
});

router.post("/confirm", async (req, res) => {
  try {
    if (!cognito.isConfigured()) return res.status(400).json({ message: "Cognito is not configured" });
    const username = normalizeUsername(req.body.username);
    const code = String(req.body.code || "").trim();
    if (!username || !/^\d{6}$/.test(code)) return res.status(400).json({ message: "Enter the 6-digit confirmation code" });
    await cognito.confirmSignUp({ username, code });
    res.json({ message: "Account confirmed. You can now log in." });
  } catch (err) {
    console.error("Cognito confirmation error:", err.code || err.message);
    res.status(400).json({ message: err.message || "Confirmation failed" });
  }
});

router.patch("/profile", auth, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const avatar = req.body.avatar || null;
    const username = normalizeUsername(req.body.username);
    const incomingProfile = req.body.profile || {};
    const cleanProfile = {
      bio: String(incomingProfile.bio || "").trim().slice(0, 280),
      website: String(incomingProfile.website || "").trim().slice(0, 300),
      youtube: String(incomingProfile.youtube || "").trim().slice(0, 300),
      facebook: String(incomingProfile.facebook || "").trim().slice(0, 300),
      instagram: String(incomingProfile.instagram || "").trim().slice(0, 300),
      linkedin: String(incomingProfile.linkedin || "").trim().slice(0, 300),
      x: String(incomingProfile.x || "").trim().slice(0, 300),
    };

    if (!name || name.length > 80) {
      return res.status(400).json({ message: "Name must be between 1 and 80 characters" });
    }
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({ message: "Username must be 3-24 letters, numbers, or underscores" });
    }
    const usernameOwner = await User.findOne({ username, _id: { $ne: req.userId } });
    if (usernameOwner) return res.status(409).json({ message: "That username is already taken" });

    if (
      avatar &&
      (typeof avatar !== "string" ||
        avatar.length > 750000 ||
        !/^data:image\/(jpeg|png|webp);base64,/i.test(avatar))
    ) {
      return res.status(400).json({ message: "Profile image must be a valid JPG, PNG, or WebP" });
    }
    if (cleanProfile.website) {
      try {
        const website = new URL(cleanProfile.website);
        if (!["http:", "https:"].includes(website.protocol)) throw new Error();
        cleanProfile.website = website.toString();
      } catch {
        return res.status(400).json({ message: "Website must be a valid HTTP or HTTPS URL" });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { name, username, avatar, profile: cleanProfile },
      { new: true, runValidators: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      profile: user.profile,
      preferences: user.preferences,
    });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

router.patch("/preferences", auth, async (req, res) => {
  try {
    const updates = {};
    if (req.body.operatingMode !== undefined) {
      const operatingMode = String(req.body.operatingMode || "");
      if (!["focus", "sprint", "team", "briefing"].includes(operatingMode)) return res.status(400).json({ message: "Invalid operating mode" });
      updates["preferences.operatingMode"] = operatingMode;
    }
    if (req.body.onboardingComplete !== undefined) updates["preferences.onboardingComplete"] = req.body.onboardingComplete === true;
    if (!Object.keys(updates).length) return res.status(400).json({ message: "No preference changes supplied" });
    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ id: user._id, name: user.name, username: user.username, email: user.email, avatar: user.avatar, profile: user.profile, preferences: user.preferences });
  } catch (err) {
    console.error("Update preferences error:", err);
    res.status(500).json({ message: "Failed to update preferences" });
  }
});

router.patch("/password", auth, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "Current and new passwords are required" });
    if (newPassword.length < 10 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return res.status(400).json({ message: "New password must be at least 10 characters with uppercase, lowercase, and a number" });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (cognito.isConfigured() && user.cognitoSub) {
      await cognito.changePassword({ username: user.username, currentPassword, newPassword });
      return res.json({ message: "Password updated successfully" });
    }
    if (!(await user.comparePassword(currentPassword))) return res.status(401).json({ message: "Current password is incorrect" });
    if (await user.comparePassword(newPassword)) return res.status(400).json({ message: "New password must be different from your current password" });
    user.password = newPassword;
    await user.save();
    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Update password error:", err);
    res.status(500).json({ message: "Failed to update password" });
  }
});

module.exports = router;
