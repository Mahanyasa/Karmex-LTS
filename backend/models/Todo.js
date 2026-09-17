const mongoose = require("mongoose");

const todoSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

    // YYYY-MM-DD bucket used by the daily planner.
    createdForDate: {
      type: String,
      required: true,
    },

    // Google Calendar event ID if a reminder was created.
    googleEventId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Todo", todoSchema);