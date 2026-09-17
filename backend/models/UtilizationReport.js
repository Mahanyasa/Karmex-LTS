const mongoose = require("mongoose");

const utilizationReportSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  sourceName: { type: String, required: true, maxlength: 255 },
  settings: {
    hoursPerDay: { type: Number, default: 8, min: 1, max: 24 },
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
  },
  entries: [{
    fingerprint: { type: String, required: true },
    member: { type: String, required: true, maxlength: 100 },
    date: { type: Date, required: true },
    classification: { type: String, default: "Unclassified", maxlength: 150 },
    description: { type: String, default: "", maxlength: 2000 },
    status: { type: String, default: "", maxlength: 80 },
    hours: { type: Number, default: null, min: 0, max: 24 },
  }],
}, { timestamps: true });

module.exports = mongoose.model("UtilizationReport", utilizationReportSchema);
