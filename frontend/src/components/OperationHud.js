import React, { useEffect, useRef, useState } from "react";

export default function OperationHud() {
  const [status, setStatus] = useState({ state: "idle", label: "READY", count: 0 });
  const active = useRef(new Map()); const hideTimer = useRef(null);
  useEffect(() => {
    function update(event) {
      const { id, state, label } = event.detail || {};
      clearTimeout(hideTimer.current);
      if (state === "running") active.current.set(id, label);
      else active.current.delete(id);
      if (active.current.size) {
        const labels = [...active.current.values()];
        setStatus({ state: "running", label: labels[labels.length - 1], count: active.current.size });
      } else {
        setStatus({ state, label, count: 0 });
        hideTimer.current = setTimeout(() => setStatus({ state: "idle", label: "READY", count: 0 }), state === "failed" ? 3500 : 1800);
      }
    }
    window.addEventListener("karmex:operation", update);
    return () => { window.removeEventListener("karmex:operation", update); clearTimeout(hideTimer.current); };
  }, []);
  return <div className={`operation-hud ${status.state}`} tabIndex={0} role="status" aria-live="polite" aria-label={status.label}><span className="operation-core" /><strong>{status.label}</strong>{status.count > 1 && <small>+{status.count - 1}</small>}</div>;
}
