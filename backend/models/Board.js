const mongoose = require("mongoose");
const { randomBytes } = require("crypto");

const boardSchema = new mongoose.Schema(
  {
    projectKey: { type: String, uppercase: true, trim: true, match: /^[A-Z][A-Z0-9]{1,15}$/ },
    archivedAt: { type: Date, default: null },
    issueSequence: { type: Number, default: 0 },
    members: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      role: { type: String, enum: ["member", "viewer"], required: true },
      joinedAt: { type: Date, default: Date.now },
    }],
    invitations: [{
      recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      role: { type: String, enum: ["member", "viewer"], required: true },
      status: { type: String, enum: ["pending", "accepted", "revoked", "declined"], default: "pending" },
      expiresAt: { type: Date, required: true },
      createdAt: { type: Date, default: Date.now },
    }],
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },

    scratchpad: {
      body: { type: String, default: "", maxlength: 50000 },
      updatedAt: { type: Date, default: null },
    },

    notes: {
      title: { type: String, default: "", maxlength: 120 },
      body: { type: String, default: "", maxlength: 100000 },
      updatedAt: { type: Date, default: null },
    },

    sharedWith: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      sharedAt: { type: Date, default: Date.now },
    }],

    dashboardLayout: [{
      id: { type: String, required: true },
      width: { type: Number, min: 3, max: 12, default: 6 },
      height: { type: Number, min: 1, max: 8, default: 3 },
      visible: { type: Boolean, default: true },
      order: { type: Number, default: 0 },
    }],

    sprints: [{
      name: { type: String, required: true, trim: true, maxlength: 80 },
      goal: { type: String, default: "", maxlength: 500 },
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      status: { type: String, enum: ["planned", "active", "completed"], default: "planned" },
      capacity: { type: Number, min: 0, max: 10000, default: 0 },
      stages: { type: [String], default: ["To do", "In progress", "Review", "Done"] },
      createdAt: { type: Date, default: Date.now },
    }],
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  }
);

boardSchema.index({ user: 1, name: 1 }, { unique: true });
boardSchema.index({ projectKey: 1 }, { unique: true, sparse: true });
boardSchema.index({ "members.user": 1, archivedAt: 1 });
boardSchema.index({ "sharedWith.user": 1 });
boardSchema.index({ "invitations.recipient": 1, "invitations.status": 1 });
boardSchema.pre("validate", function () {
  if (!this.projectKey) this.projectKey = `${this.name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "PRJ"}${randomBytes(4).toString("hex").toUpperCase()}`;
});

module.exports = mongoose.model("Board", boardSchema);
