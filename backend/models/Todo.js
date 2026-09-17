const mongoose = require("mongoose");

const todoSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    text: { type: String, required: true, trim: true },
    priority: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
    // Optional time hint extracted from dictation, e.g. "09:30". Used for sorting.
    timeHint: { type: String, default: null },
    duration: { type: Number, default: null }, // minutes, if mentioned
    completed: { type: Boolean, default: false },
    // Order used for the planner view; recalculated by the organizer
    sortOrder: { type: Number, default: 0 },
    // Set false by the 9am cron reset; true means "carry over" tasks kept
    createdForDate: { type: String, required: true }, // "YYYY-MM-DD" bucket
    // Google Calendar event id, if a reminder was created for this task
    googleEventId: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Todo", todoSchema);
