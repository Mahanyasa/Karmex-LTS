const mongoose = require("mongoose");

const todoSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    board: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Board",
      default: null,
      index: true,
    },

    text: {
      type: String,
      required: true,
      trim: true,
    },

    priority: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },

    // Optional time hint extracted from dictation.
    // Example: "09:30"
    // Used by the organizer for sorting.
    timeHint: {
      type: String,
      default: null,
    },

    // Actual date + time for the task/reminder.
    // This is what should be sent to Google Calendar.
    reminderDateTime: {
      type: Date,
      default: null,
    },

    // Duration in minutes, if mentioned/provided.
    duration: {
      type: Number,
      default: null,
    },

    completed: {
      type: Boolean,
      default: false,
    },

    // Order used for the planner view.
    sortOrder: {
      type: Number,
      default: 0,
    },

    // YYYY-MM-DD bucket kept for existing data compatibility.
    createdForDate: {
      type: String,
      required: true,
    },

    // Google Calendar event ID if a reminder was created.
    googleEventId: {
      type: String,
      default: null,
    },
    microsoftEventId: { type: String, default: null },
    microsoftSyncError: { type: String, default: null },

    source: {
      type: { type: String, enum: ["github"], default: null },
      url: { type: String, default: null },
      repository: { type: String, default: null },
      issueNumber: { type: Number, default: null },
    },

    sprint: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    workflowStage: { type: String, default: "To do", maxlength: 60 },
    workType: { type: String, enum: ["story", "task", "bug", "spike"], default: "task" },
    storyPoints: { type: Number, min: 0, max: 100, default: 0 },
    labels: { type: [String], default: [] },
    acceptanceCriteria: { type: String, default: "", maxlength: 5000 },
    blockedReason: { type: String, default: "", maxlength: 1000 },
  },
  {
    timestamps: true,
  }
);

todoSchema.index({ user: 1, board: 1, sortOrder: 1, createdAt: 1 });

module.exports = mongoose.model("Todo", todoSchema);
