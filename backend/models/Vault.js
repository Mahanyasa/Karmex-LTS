const mongoose = require("mongoose");

const vaultSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    version: { type: Number, default: 1 },
    kdf: { type: String, enum: ["PBKDF2-SHA256"], default: "PBKDF2-SHA256" },
    iterations: { type: Number, min: 100000, max: 1000000, required: true },
    salt: { type: String, required: true, maxlength: 128 },
    iv: { type: String, required: true, maxlength: 128 },
    ciphertext: { type: String, required: true, maxlength: 2000000 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vault", vaultSchema);
