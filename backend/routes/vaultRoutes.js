const express = require("express");
const auth = require("../middleware/auth");
const Vault = require("../models/Vault");

const router = express.Router();
router.use(auth);

router.get("/", async (req, res) => {
  try {
    const vault = await Vault.findOne({ user: req.userId }).select("-user -__v");
    res.json(vault ? { exists: true, vault } : { exists: false });
  } catch (err) {
    console.error("Load vault error:", err.message);
    res.status(500).json({ message: "Failed to load encrypted vault" });
  }
});

router.put("/", async (req, res) => {
  try {
    const { version = 1, kdf, iterations, salt, iv, ciphertext } = req.body;
    const validBase64 = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max && /^[A-Za-z0-9+/]+={0,2}$/.test(value);

    if (version !== 1 || kdf !== "PBKDF2-SHA256" || !Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) {
      return res.status(400).json({ message: "Unsupported vault encryption settings" });
    }
    if (!validBase64(salt, 128) || !validBase64(iv, 128) || !validBase64(ciphertext, 2000000)) {
      return res.status(400).json({ message: "Invalid encrypted vault payload" });
    }

    const vault = await Vault.findOneAndUpdate(
      { user: req.userId },
      { version, kdf, iterations, salt, iv, ciphertext },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).select("-user -__v");
    res.json({ saved: true, updatedAt: vault.updatedAt });
  } catch (err) {
    console.error("Save vault error:", err.message);
    res.status(500).json({ message: "Failed to save encrypted vault" });
  }
});

module.exports = router;
