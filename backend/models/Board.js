const mongoose = require("mongoose");

const boardSchema = new mongoose.Schema(
  {
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
  },
  {
    timestamps: true,
  }
);

boardSchema.index({ user: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Board", boardSchema);
