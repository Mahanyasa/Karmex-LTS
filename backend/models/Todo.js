const mongoose = require("mongoose");

const todoSchema = new mongoose.Schema(
  {
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    description: { type: String, default: "", maxlength: 30000 },
    issueNumber: { type: Number, min: 1 },
    issueKey: { type: String },
    archivedAt: { type: Date, default: null },
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
todoSchema.index({ issueKey: 1 }, { unique: true, sparse: true });
todoSchema.index({ board: 1, issueNumber: 1 });
todoSchema.index({ board: 1, archivedAt: 1, assignee: 1, updatedAt: -1 });
todoSchema.index({ board: 1, sprint: 1, archivedAt: 1 });
todoSchema.pre("validate", async function () {
  if (!this.creator) this.creator = this.user;
  if (!this.reporter) this.reporter = this.user;
  if (this.isNew && !this.issueKey && this.board) {
    const Board = require("./Board");
    let board = await Board.findById(this.board);
    if (!board) throw new Error("Project not found");
    if (!board.projectKey) await board.save();
    board = await Board.findOneAndUpdate({ _id: this.board }, { $inc: { issueSequence: 1 } }, { new: true });
    this.issueNumber = board.issueSequence;
    this.issueKey = `${board.projectKey}-${board.issueSequence}`;
  }
});

module.exports = mongoose.model("Todo", todoSchema);
