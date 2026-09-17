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
const socialRoutes = require("./routes/socialRoutes");
const { API_VERSION, APP_VERSION } = require("./config/version");

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

app.use((req, res, next) => {
  res.setHeader("X-Karmex-API-Version", API_VERSION);
  res.setHeader("X-Karmex-App-Version", APP_VERSION);
  next();
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", apiVersion: API_VERSION, appVersion: APP_VERSION, time: new Date().toISOString() });
});

app.get(`/api/${API_VERSION}/health`, (req, res) => {
  res.json({ status: "ok", apiVersion: API_VERSION, appVersion: APP_VERSION, time: new Date().toISOString() });
});

app.get(`/api/${API_VERSION}/version`, (req, res) => {
  res.json({ product: "Karmex LTS", apiVersion: API_VERSION, appVersion: APP_VERSION });
});

function mountApi(prefix) {
  app.use(`${prefix}/auth`, authRoutes);
  app.use(`${prefix}/boards`, boardRoutes);
  app.use(`${prefix}/todos`, todoRoutes);
  app.use(`${prefix}/google`, googleRoutes);
  app.use(`${prefix}/files`, fileRoutes);
  app.use(`${prefix}/github`, githubRoutes);
  app.use(`${prefix}/vault`, vaultRoutes);
  app.use(`${prefix}/social`, socialRoutes);
}

mountApi(`/api/${API_VERSION}`);
mountApi("/api");

const PORT = process.env.PORT || 3001;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT}`);
  });
});
