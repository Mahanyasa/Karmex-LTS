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
  },
  {
    timestamps: true,
  }
);

boardSchema.index({ user: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Board", boardSchema);
