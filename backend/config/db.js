const mongoose = require("mongoose");

async function connectDB() {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error("MONGO_URI is not set in .env");
    }
    await mongoose.connect(uri);
    console.log("[db] Connected to MongoDB Atlas");
  } catch (err) {
    console.error("[db] Connection error:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
