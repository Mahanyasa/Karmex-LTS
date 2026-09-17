import axios from "axios";
import { API_VERSION } from "./version";

function versionedApiUrl(value) {
  const base = value.replace(/\/$/, "");
  if (/\/api\/v\d+$/i.test(base)) return base;
  if (/\/api$/i.test(base)) return `${base}/${API_VERSION}`;
  return `${base}/api/${API_VERSION}`;
}

const api = axios.create({
  baseURL: versionedApiUrl(process.env.REACT_APP_API_URL || "http://localhost:3001/api"),
});

function operationLabel(config) {
  const method = String(config.method || "get").toUpperCase();
  const url = String(config.url || "");
  if (/utilization/.test(url)) return method === "GET" ? "ANALYZING RESOURCES" : "PROCESSING WORKBOOK";
  if (/github/.test(url)) return "SYNCING GITHUB";
  if (/files/.test(url)) return "SYNCING STORAGE";
  if (/boards|todos/.test(url)) return method === "GET" ? "ANALYZING WORKSPACE" : "UPDATING WORKSPACE";
  if (/auth|social/.test(url)) return method === "GET" ? "VERIFYING IDENTITY" : "UPDATING IDENTITY";
  return method === "GET" ? "ANALYZING" : "SYNCING";
}

function emitOperation(detail) {
  window.dispatchEvent(new CustomEvent("karmex:operation", { detail }));
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.operationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  emitOperation({ id: config.operationId, state: "running", label: operationLabel(config) });
  return config;
});

api.interceptors.response.use((response) => {
  emitOperation({ id: response.config.operationId, state: "complete", label: "COMPLETE" });
  return response;
}, (error) => {
  if (error.config?.operationId) emitOperation({ id: error.config.operationId, state: "failed", label: "FAILED" });
  return Promise.reject(error);
});

export default api;
