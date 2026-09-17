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

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
