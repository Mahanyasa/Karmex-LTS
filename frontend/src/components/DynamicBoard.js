import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import BoardScratchpad from "./BoardScratchpad";
import SprintWorkspace from "./SprintWorkspace";
import { useNotifications } from "../context/NotificationContext";

const DEFAULT_LAYOUT = [
  { id: "metrics", width: 6, height: 1, visible: true },
  { id: "progress", width: 6, height: 1, visible: true },
  { id: "sprints", width: 12, height: 6, visible: true },
  { id: "calendar", width: 8, height: 4, visible: true },
  { id: "upcoming", width: 4, height: 4, visible: true },
  { id: "workspace", width: 12, height: 6, visible: true },
  { id: "tasks", width: 12, height: 4, visible: true },
];

const TITLES = { metrics: "Board metrics", progress: "Completion", sprints: "Sprint planning & delivery", calendar: "Calendar", upcoming: "Upcoming", workspace: "Notes & scratchpad", tasks: "Tasks" };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function normalizeLayout(saved = []) {
  const map = new Map(saved.map((item) => [item.id, item]));
  return DEFAULT_LAYOUT.map((fallback, order) => {
    const stored = map.get(fallback.id);
    return { ...fallback, ...(stored || {}), order: stored?.order ?? order };
  }).sort((a, b) => a.order - b.order);
}

export default function DynamicBoard({ board, todos, loading, canEdit, canManage = canEdit, onToggle, onDelete, onBoardSaved, onTodosChanged }) {
  const { notify } = useNotifications();
  const [layout, setLayout] = useState(() => normalizeLayout(board?.dashboardLayout));
  const [customizing, setCustomizing] = useState(false);
  const [draggedId, setDraggedId] = useState(null);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const saveTimer = useRef(null);

  // Layout save responses update the board object; reload only when switching boards.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setLayout(normalizeLayout(board?.dashboardLayout)), [board?._id]);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  function commitLayout(next) {
    setLayout(next);
    if (!canManage || !board?._id) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.patch(`/boards/${board._id}/layout`, { layout: next });
        onBoardSaved(data);
      } catch (err) { notify(err.response?.data?.message || "Failed to save board layout", "error"); }
    }, 500);
  }

  function resize(id, dimension, amount) {
    commitLayout(layout.map((item) => item.id === id ? { ...item, [dimension]: clamp(item[dimension] + amount, dimension === "width" ? 3 : 1, dimension === "width" ? 12 : 8) } : item));
  }

  function toggleWidget(id) {
    commitLayout(layout.map((item) => item.id === id ? { ...item, visible: !item.visible } : item));
  }

  function dropOn(targetId) {
    if (!draggedId || draggedId === targetId) return setDraggedId(null);
    const next = [...layout];
    const from = next.findIndex((item) => item.id === draggedId);
    const to = next.findIndex((item) => item.id === targetId);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commitLayout(next.map((item, order) => ({ ...item, order })));
    setDraggedId(null);
  }

  const completed = todos.filter((todo) => todo.completed).length;
  const progress = todos.length ? Math.round((completed / todos.length) * 100) : 0;
  const upcoming = useMemo(() => todos.filter((todo) => !todo.completed && todo.reminderDateTime).sort((a, b) => new Date(a.reminderDateTime) - new Date(b.reminderDateTime)), [todos]);
  const calendarEvents = useMemo(() => todos.reduce((map, todo) => {
    if (todo.reminderDateTime) { const key = dayKey(new Date(todo.reminderDateTime)); map[key] = [...(map[key] || []), todo]; }
    return map;
  }, {}), [todos]);

  const renderWidget = (id) => ({
    metrics: <Metrics todos={todos} completed={completed} upcoming={upcoming} />,
    progress: <Progress value={progress} completed={completed} total={todos.length} />,
    sprints: <SprintWorkspace board={board} todos={todos} canEdit={canEdit} onBoardSaved={onBoardSaved} onTodosChanged={onTodosChanged} />,
    calendar: <Calendar month={month} setMonth={setMonth} events={calendarEvents} />,
    upcoming: <Upcoming todos={upcoming} />,
    workspace: canManage ? <BoardScratchpad board={board} onSaved={onBoardSaved} /> : <ReadOnlyNotice board={board} />,
    tasks: <TaskTable todos={todos} loading={loading} canEdit={canEdit} onToggle={onToggle} onDelete={onDelete} />,
  }[id]);

  return (
    <section className={customizing ? "dynamic-board customizing" : "dynamic-board"}>
      <div className="dynamic-board-toolbar">
        <div><span className="eyebrow">DYNAMIC BOARD</span><h2>{board?.name || "Board"} dashboard</h2></div>
        <div className="board-toolbar-actions">
          {customizing && <div className="widget-library">{layout.map((item) => <button key={item.id} type="button" className={item.visible ? "active" : ""} onClick={() => toggleWidget(item.id)}>{TITLES[item.id]}</button>)}</div>}
          {canManage && <button type="button" className={customizing ? "accent-btn" : "secondary-btn"} onClick={() => setCustomizing(!customizing)}>{customizing ? "Done" : "Customize"}</button>}
        </div>
      </div>

      <div className="widget-grid">
        {layout.filter((item) => item.visible).map((item) => (
          <article key={item.id} className={`dashboard-widget widget-${item.id} ${draggedId === item.id ? "dragging" : ""}`} style={{ "--widget-width": item.width, "--widget-height": item.height }} draggable={customizing} onDragStart={() => setDraggedId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(item.id)}>
            <header className="widget-header"><div><span className="widget-drag">{customizing ? "⠿" : ""}</span><strong>{TITLES[item.id]}</strong></div>{customizing && <div className="widget-size-controls"><button type="button" onClick={() => resize(item.id, "width", -1)} title="Narrower">−W</button><button type="button" onClick={() => resize(item.id, "width", 1)} title="Wider">+W</button><button type="button" onClick={() => resize(item.id, "height", -1)} title="Shorter">−H</button><button type="button" onClick={() => resize(item.id, "height", 1)} title="Taller">+H</button><button type="button" onClick={() => toggleWidget(item.id)} title="Hide widget">×</button></div>}</header>
            <div className="widget-body">{renderWidget(item.id)}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Metrics({ todos, completed, upcoming }) {
  return <div className="metric-widget"><div><span>Total tasks</span><strong>{todos.length}</strong></div><div><span>Open</span><strong>{todos.length - completed}</strong></div><div><span>Completed</span><strong>{completed}</strong></div><div><span>Scheduled</span><strong>{upcoming.length}</strong></div></div>;
}

function Progress({ value, completed, total }) {
  return <div className="progress-widget"><div className="progress-ring" style={{ "--progress": `${value * 3.6}deg` }}><strong>{value}%</strong></div><div><strong>{completed} of {total}</strong><span>tasks completed</span></div></div>;
}

function Calendar({ month, setMonth, events }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  const today = dayKey(new Date());
  return <div className="calendar-widget"><div className="calendar-nav"><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><strong>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div><div className="calendar-weekdays">{"SMTWTFS".split("").map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="calendar-days">{days.map((day) => { const key = dayKey(day); const items = events[key] || []; return <div key={key} className={`${day.getMonth() !== month.getMonth() ? "outside" : ""} ${key === today ? "today" : ""}`}><span>{day.getDate()}</span>{items.slice(0, 2).map((todo) => <i key={todo._id} title={todo.text}>{todo.text}</i>)}{items.length > 2 && <small>+{items.length - 2}</small>}</div>; })}</div></div>;
}

function Upcoming({ todos }) {
  return <div className="upcoming-widget">{todos.slice(0, 12).map((todo) => <div key={todo._id}><time>{new Date(todo.reminderDateTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time><span>{todo.text}</span><small>{new Date(todo.reminderDateTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</small></div>)}{!todos.length && <div className="widget-empty">No upcoming reminders</div>}</div>;
}

function TaskTable({ todos, loading, canEdit, onToggle, onDelete }) {
  const [view, setView] = useState(() => {
    try { return localStorage.getItem("karmex-task-view") === "postits" ? "postits" : "rows"; } catch { return "rows"; }
  });
  function changeView(next) {
    setView(next);
    try { localStorage.setItem("karmex-task-view", next); } catch { /* Keep the view usable when storage is unavailable. */ }
  }
  if (loading) return <div className="widget-empty">Loading tasks...</div>;
  return <><div className="task-view-toggle" role="group" aria-label="Task view"><button type="button" aria-pressed={view === "rows"} onClick={() => changeView("rows")}>Rows</button><button type="button" aria-pressed={view === "postits"} onClick={() => changeView("postits")}>Post-its</button></div><div className={view === "postits" ? "board-task-postits" : "board-task-table"}>{todos.map((todo, index) => <div key={todo._id} className={`${todo.completed ? "completed" : ""} task-color-${index % 6}`}><input type="checkbox" aria-label={`Mark ${todo.text} ${todo.completed ? "incomplete" : "complete"}`} checked={Boolean(todo.completed)} onChange={() => onToggle(todo)} disabled={!canEdit} /><span>{todo.text}{todo.microsoftSyncError && <em className="calendar-sync-error" title={todo.microsoftSyncError}>Outlook sync failed</em>}</span><small>{todo.reminderDateTime ? new Date(todo.reminderDateTime).toLocaleString() : "No reminder"}</small>{todo.source?.url && <a href={todo.source.url} target="_blank" rel="noreferrer">GH</a>}{canEdit && <button type="button" onClick={() => onDelete(todo._id)} title="Delete task" aria-label={`Delete ${todo.text}`}>×</button>}</div>)}</div>{!todos.length && <div className="widget-empty">No tasks on this board</div>}</>;
}

function ReadOnlyNotice({ board }) {
  return <div className="shared-board-notice"><strong>Owner notes</strong><span>Private notes and scratchpad stay with the project owner.</span></div>;
}
