require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const boardRoutes = require("./routes/boardRoutes");
const todoRoutes = require("./routes/todoRoutes");
const googleRoutes = require("./routes/googleRoutes");
const fileRoutes = require("./routes/fileRoutes");
const githubRoutes = require("./routes/githubRoutes");
const vaultRoutes = require("./routes/vaultRoutes");

const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/boards", boardRoutes);
app.use("/api/todos", todoRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/vault", vaultRoutes);

const PORT = process.env.PORT || 3001;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT}`);
  });
});
