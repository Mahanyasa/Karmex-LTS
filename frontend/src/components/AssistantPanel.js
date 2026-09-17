import React, { useEffect, useMemo, useState } from "react";
import api from "../api";

const VIEW_LABELS = { command: "Command center", workspace: "Workspace", github: "GitHub intelligence", utilization: "Resource utilization", files: "Private storage", vault: "Credential vault", settings: "Account control" };

export default function AssistantPanel({ open, onClose, activeView, board, todos, githubConnected, onNavigate }) {
  const [utilization, setUtilization] = useState(null);
  useEffect(() => { if (open) api.get("/utilization").then(({ data }) => setUtilization(data)).catch(() => {}); }, [open]);
  const insights = useMemo(() => {
    const result = []; const openTasks = todos.filter((todo) => !todo.completed); const overdue = openTasks.filter((todo) => todo.reminderDateTime && new Date(todo.reminderDateTime) < new Date()); const blocked = openTasks.filter((todo) => todo.blockedReason);
    const activeSprint = board?.sprints?.find((sprint) => sprint.status === "active"); const sprintTasks = activeSprint ? todos.filter((todo) => String(todo.sprint || "") === String(activeSprint._id)) : []; const points = sprintTasks.reduce((sum, todo) => sum + (Number(todo.storyPoints) || 0), 0);
    if (overdue.length) result.push({ tone: "danger", title: overdue.length + " overdue item" + (overdue.length === 1 ? "" : "s"), body: "Review reminders and reset delivery expectations.", action: "Open workspace", view: "workspace" });
    if (blocked.length) result.push({ tone: "warning", title: blocked.length + " blocked work item" + (blocked.length === 1 ? "" : "s"), body: "Blocked work is reducing sprint flow.", action: "Inspect board", view: "workspace" });
    if (activeSprint && activeSprint.capacity && points > activeSprint.capacity) result.push({ tone: "warning", title: "Sprint exceeds capacity", body: points + " committed points against " + activeSprint.capacity + " planned.", action: "Rebalance sprint", view: "workspace" });
    if (!activeSprint && board) result.push({ tone: "info", title: "No active sprint", body: "Start a planned sprint to enable delivery tracking.", action: "Plan sprint", view: "workspace" });
    if (!githubConnected) result.push({ tone: "info", title: "GitHub is offline", body: "Connect GitHub to include repository risks and delivery activity.", action: "Open settings", view: "settings" });
    if (utilization?.members?.some((member) => member.utilization > 1)) { const count = utilization.members.filter((member) => member.utilization > 1).length; result.push({ tone: "danger", title: count + " resource" + (count === 1 ? "" : "s") + " above capacity", body: "Inspect active windows and allocation.", action: "View utilization", view: "utilization" }); }
    if (!result.length) result.push({ tone: "success", title: "Systems nominal", body: "No immediate delivery, capacity, or integration risks detected." }); return result.slice(0, 5);
  }, [board, githubConnected, todos, utilization]);
  if (!open) return null;
  return <aside className="assistant-panel"><header><div><span className="assistant-orbit" /><div><strong>KARMEX INTELLIGENCE</strong><small>Context: {VIEW_LABELS[activeView] || activeView}</small></div></div><button type="button" onClick={onClose} aria-label="Close assistant">×</button></header><section className="assistant-brief"><span>LIVE BRIEFING</span><h2>{board?.name || VIEW_LABELS[activeView]}</h2><p>{todos.filter((todo) => !todo.completed).length} open tasks · {todos.filter((todo) => todo.completed).length} complete</p></section><div className="assistant-insights">{insights.map((insight, index) => <article className={insight.tone} key={insight.title + index}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{insight.title}</strong><p>{insight.body}</p>{insight.action && <button type="button" onClick={() => onNavigate(insight.view)}>{insight.action} →</button>}</div></article>)}</div><footer><span className="status-dot" /> Context engine active</footer></aside>;
}
