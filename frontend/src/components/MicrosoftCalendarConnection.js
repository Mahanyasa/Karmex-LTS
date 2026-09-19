import React, { useEffect, useState } from "react";
import api from "../api";
import { useNotifications } from "../context/NotificationContext";

export default function MicrosoftCalendarConnection() {
  const [status, setStatus] = useState({ loading: true, connected: false, configured: false });
  const [busy, setBusy] = useState(false);
  const { notify } = useNotifications();
  useEffect(() => {
    let active = true;
    api.get("/microsoft/status").then(({ data }) => { if (active) setStatus({ ...data, loading: false }); }).catch(() => { if (active) setStatus({ loading: false, connected: false, configured: false, message: "Microsoft Calendar status unavailable. Reload to try again." }); });
    return () => { active = false; };
  }, []);
  async function connect() {
    setBusy(true);
    try {
      if (status.connected) {
        await api.post("/microsoft/disconnect", {}, { withCredentials: true });
        setStatus({ ...status, connected: false });
        notify("Microsoft Calendar disconnected. Existing Outlook events remain.", "success");
      } else {
        const { data } = await api.get("/microsoft/auth-url", { withCredentials: true });
        window.location.assign(data.url);
      }
    } catch (error) { notify(error.response?.data?.message || "Microsoft Calendar connection failed.", "error"); }
    finally { setBusy(false); }
  }
  return <article className="connection-row">
    <span className="connection-logo microsoft-logo">M</span>
    <div><strong>Microsoft Calendar</strong><span>{status.message || "Sync new task reminders and edits to Outlook. If Google is also connected, both receive reminders."}</span></div>
    <div className="connection-control">
      <span className={status.connected ? "connection-state connected" : "connection-state"}>{status.loading ? "Checking" : status.connected ? "Connected" : status.configured ? "Not connected" : "Setup required"}</span>
      <button type="button" className="secondary-btn" disabled={busy || status.loading || (!status.configured && !status.connected)} onClick={connect}>{busy ? "Please wait..." : status.connected ? "Disconnect" : "Connect"}</button>
    </div>
  </article>;
}
