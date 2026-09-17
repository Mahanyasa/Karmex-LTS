const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      match: /^[a-z0-9_]+$/,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 6 },
    avatar: { type: String, default: null, maxlength: 750000 },
    profile: {
      bio: { type: String, default: "", maxlength: 280 },
      website: { type: String, default: "", maxlength: 300 },
      youtube: { type: String, default: "", maxlength: 300 },
      facebook: { type: String, default: "", maxlength: 300 },
      instagram: { type: String, default: "", maxlength: 300 },
      linkedin: { type: String, default: "", maxlength: 300 },
      x: { type: String, default: "", maxlength: 300 },
    },
    legalAcceptance: {
      termsVersion: { type: String, default: null },
      privacyVersion: { type: String, default: null },
      acceptedAt: { type: Date, default: null },
    },
    preferences: {
      operatingMode: { type: String, enum: ["focus", "sprint", "team", "briefing"], default: "briefing" },
    },
    // OAuth tokens for the user's OWN Google account, obtained via consent
    // screen (never their password). Used to create Calendar reminder events.
    googleTokens: {
      access_token: { type: String, default: null },
      refresh_token: { type: String, default: null },
      scope: { type: String, default: null },
      token_type: { type: String, default: null },
      expiry_date: { type: Number, default: null },
    },
    googleConnected: { type: Boolean, default: false },
    githubConnection: {
      accessToken: { type: String, default: null },
      scope: { type: String, default: null },
      tokenType: { type: String, default: null },
      login: { type: String, default: null },
      avatarUrl: { type: String, default: null },
    },
    githubConnected: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("User", userSchema);
