import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api";
import { useNotifications } from "../context/NotificationContext";

export default function useProactiveIntelligence({ board, todos, githubConnected }) {
  const { notify } = useNotifications(); const [utilization, setUtilization] = useState(null); const [dismissed, setDismissed] = useState(() => { try { return JSON.parse(localStorage.getItem("karmex-dismissed-intelligence") || "{}"); } catch { return {}; } });
  useEffect(() => { let live = true; async function scan() { try { const { data } = await api.get("/utilization"); if (live) setUtilization(data); } catch {} } scan(); const timer = setInterval(scan, 60000); return () => { live = false; clearInterval(timer); }; }, []);
  const allAlerts = useMemo(() => {
    const result = []; const open = todos.filter((todo) => !todo.completed); const overdue = open.filter((todo) => todo.reminderDateTime && new Date(todo.reminderDateTime) < new Date()); const blocked = open.filter((todo) => todo.blockedReason); const sprint = board?.sprints?.find((item) => item.status === "active"); const sprintTasks = sprint ? todos.filter((todo) => String(todo.sprint || "") === String(sprint._id)) : []; const points = sprintTasks.reduce((sum, todo) => sum + (Number(todo.storyPoints) || 0), 0);
    if (overdue.length) result.push({ id: `overdue-${board?._id}-${overdue.length}`, severity: "danger", title: `${overdue.length} overdue item${overdue.length === 1 ? "" : "s"}`, body: "Review reminders and reset delivery expectations.", action: "Open workspace", view: "workspace" });
    if (blocked.length) result.push({ id: `blocked-${board?._id}-${blocked.length}`, severity: "warning", title: `${blocked.length} blocked work item${blocked.length === 1 ? "" : "s"}`, body: "Resolve blockers before adding more sprint work.", action: "Inspect board", view: "workspace" });
    if (sprint?.capacity && points > sprint.capacity) result.push({ id: `capacity-${sprint._id}-${points}`, severity: "warning", title: "Sprint exceeds capacity", body: `${points} committed points against ${sprint.capacity} planned.`, action: "Rebalance sprint", view: "workspace" });
    if (!sprint && board) result.push({ id: `no-sprint-${board._id}`, severity: "info", title: "No active sprint", body: "Start a planned sprint to enable delivery forecasting.", action: "Plan sprint", view: "workspace" });
    if (!githubConnected) result.push({ id: "github-offline", severity: "info", title: "GitHub is offline", body: "Connect GitHub to include engineering telemetry.", action: "Open settings", view: "settings" });
    const overloaded = utilization?.members?.filter((member) => member.utilization > 1) || [];
    if (overloaded.length) result.push({ id: `resources-${overloaded.map((item) => item.member).join("-")}`, severity: "danger", title: `${overloaded.length} resource${overloaded.length === 1 ? "" : "s"} above capacity`, body: "Inspect workload and active windows before assigning more work.", action: "View utilization", view: "utilization" });
    if (!result.length) result.push({ id: "nominal", severity: "success", title: "Systems nominal", body: "No immediate delivery, capacity, or integration risks detected." });
    return result;
  }, [board, githubConnected, todos, utilization]);
  const alerts = allAlerts.filter((alert) => !dismissed[alert.id]);
  useEffect(() => {
    const announced = JSON.parse(sessionStorage.getItem("karmex-announced-intelligence") || "{}"); const urgent = alerts.find((alert) => ["danger", "warning"].includes(alert.severity) && !announced[alert.id]);
    if (urgent) { notify(`${urgent.title}. ${urgent.body}`, urgent.severity === "danger" ? "error" : "info"); announced[urgent.id] = Date.now(); sessionStorage.setItem("karmex-announced-intelligence", JSON.stringify(announced)); }
  }, [alerts, notify]);
  const dismiss = useCallback((id) => { setDismissed((current) => { const next = { ...current, [id]: Date.now() }; localStorage.setItem("karmex-dismissed-intelligence", JSON.stringify(next)); return next; }); }, []);
  return { alerts, dismiss };
}
