import React, { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import useDictation from "../components/useDictation";

// Sticky-note color palette, cycled per card (matches the pink/blue/green/
// yellow/purple assortment look).
const NOTE_COLORS = ["pink", "blue", "yellow", "green", "purple", "orange"];

// Stable small rotation per note so it doesn't jump around on re-render.
function rotationFor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return (hash % 7) - 3; // -3deg to 3deg
}

// Format an ISO datetime string into a compact "Sep 17, 3:00 PM" label.
function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [todos, setTodos] = useState([]);
  const [newText, setNewText] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [googleConnected, setGoogleConnected] = useState(false);

  const {
    listening,
    transcript,
    supported,
    error: dictationError,
    start,
    stop,
    reset,
  } = useDictation();

  async function loadTodos() {
    setLoading(true);
    try {
      const { data } = await api.get("/todos");
      setTodos(data);
    } catch (err) {
      setMessage("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  async function loadGoogleStatus() {
    try {
      const { data } = await api.get("/google/status");
      setGoogleConnected(data.connected);
    } catch (err) {
      // non-fatal
    }
  }

  useEffect(() => {
    loadTodos();
    loadGoogleStatus();

    const params = new URLSearchParams(window.location.search);
    const googleParam = params.get("google");
    if (googleParam === "connected") {
      setMessage("Google connected — new tasks will send phone reminders.");
      setGoogleConnected(true);
    } else if (googleParam === "denied") {
      setMessage("Google connection was cancelled.");
    } else if (googleParam === "error") {
      setMessage("Something went wrong connecting Google. Try again.");
    }
    if (googleParam) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function connectGoogle() {
    try {
      const { data } = await api.get("/google/auth-url");
      window.location.href = data.url;
    } catch (err) {
      setMessage("Failed to start Google connection");
    }
  }

  async function disconnectGoogle() {
    try {
      await api.post("/google/disconnect");
      setGoogleConnected(false);
      setMessage("Google disconnected.");
    } catch (err) {
      setMessage("Failed to disconnect Google");
    }
  }

  async function handleAddManual(e) {
    e.preventDefault();
    if (!newText.trim()) return;

    // Convert local datetime-local values ("YYYY-MM-DDTHH:mm") to ISO strings.
    const startISO = newStart ? new Date(newStart).toISOString() : null;
    const endISO = newEnd ? new Date(newEnd).toISOString() : null;

    if (startISO && endISO && new Date(endISO) <= new Date(startISO)) {
      setMessage("End time must be after start time");
      return;
    }

    try {
      await api.post("/todos", {
        text: newText.trim(),
        start: startISO,
        end: endISO,
      });
      setNewText("");
      setNewStart("");
      setNewEnd("");
      await organize();
    } catch (err) {
      setMessage("Failed to add task");
    }
  }

  async function handleToggle(todo) {
    try {
      const { data } = await api.patch(`/todos/${todo._id}`, {
        completed: !todo.completed,
      });
      setTodos((prev) => prev.map((t) => (t._id === data._id ? data : t)));
    } catch (err) {
      setMessage("Failed to update task");
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/todos/${id}`);
      setTodos((prev) => prev.filter((t) => t._id !== id));
    } catch (err) {
      setMessage("Failed to delete task");
    }
  }

  async function organize() {
    try {
      const { data } = await api.post("/todos/organize");
      setTodos(data);
    } catch (err) {
      setMessage("Failed to organize tasks");
    }
  }

  async function submitDictation() {
    if (!transcript.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      // Send the client's current date/time so the backend can resolve
      // relative phrases in the transcript ("at 5pm", "tomorrow", etc.)
      // against the user's actual local time and timezone.
      const now = new Date();
      const { data } = await api.post("/todos/dictate", {
        transcript,
        clientDateTime: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setTodos(data.todos);
      setMessage(`Added ${data.created} task(s) from dictation.`);
      reset();
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to process dictation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Today's Plan</h1>
          <p className="subtitle">
            Hi {user?.name} — resets daily at 9:00 AM
          </p>
        </div>
        <div className="header-actions">
          {googleConnected ? (
            <button className="ghost-btn" onClick={disconnectGoogle}>
              📱 Google connected
            </button>
          ) : (
            <button className="primary-btn" onClick={connectGoogle}>
              📱 Connect Google reminders
            </button>
          )}
          <button className="ghost-btn" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      {message && <div className="info-banner">{message}</div>}

      <section className="dictation-panel">
        <h2>Dictate your day</h2>
        {!supported && (
          <p className="error-banner">
            Voice dictation isn't supported in this browser. Try Chrome or
            Edge.
          </p>
        )}
        {dictationError && (
          <p className="error-banner">Mic error: {dictationError}</p>
        )}

        <div className="dictation-controls">
          <button
            className={listening ? "mic-btn listening" : "mic-btn"}
            onClick={listening ? stop : start}
            disabled={!supported}
          >
            {listening ? "Stop listening" : "Start dictation"}
          </button>
          {transcript && (
            <button
              className="primary-btn"
              onClick={submitDictation}
              disabled={busy}
            >
              {busy ? "Organizing..." : "Add & organize"}
            </button>
          )}
        </div>

        {transcript && (
          <div className="transcript-box">
            <strong>Heard:</strong> {transcript}
          </div>
        )}
        <p className="hint">
          Try: "Call mom at 5pm, then finish report urgent for 1 hour, and
          buy groceries"
        </p>
        {!googleConnected && (
          <p className="hint">
            Connect Google above to get these as phone reminders.
          </p>
        )}
      </section>

      <form className="add-form" onSubmit={handleAddManual}>
        <input
          type="text"
          placeholder="Add a task manually..."
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
        />
        <label className="field-label">
          Start
          <input
            type="datetime-local"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
          />
        </label>
        <label className="field-label">
          End
          <input
            type="datetime-local"
            value={newEnd}
            onChange={(e) => setNewEnd(e.target.value)}
            min={newStart || undefined}
          />
        </label>
        <button type="submit">Add</button>
      </form>

      <div className="list-actions">
        <button className="ghost-btn" onClick={organize}>
          Re-organize list
        </button>
      </div>

      {loading ? (
        <p>Loading tasks...</p>
      ) : todos.length === 0 ? (
        <p className="empty-state">No tasks yet today. Dictate or add one.</p>
      ) : (
        <div className="sticky-board">
          {todos.map((todo, idx) => {
            const color = NOTE_COLORS[idx % NOTE_COLORS.length];
            const rotation = rotationFor(todo._id);
            return (
              <div
                key={todo._id}
                className={`sticky-note note-${color} ${
                  todo.completed ? "completed" : ""
                }`}
                style={{ "--rotate": `${rotation}deg` }}
              >
                <button
                  className="sticky-delete"
                  onClick={() => handleDelete(todo._id)}
                  aria-label="Delete task"
                >
                  ×
                </button>
                <label className="sticky-check">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => handleToggle(todo)}
                  />
                  <span className="sticky-text">{todo.text}</span>
                </label>
                <div className="sticky-meta">
                  {todo.start && (
                    <span className="chip time-chip">
                      {formatDateTime(todo.start)}
                      {todo.end ? ` – ${formatDateTime(todo.end)}` : ""}
                    </span>
                  )}
                  {!todo.start && todo.timeHint && (
                    <span className="chip">{todo.timeHint}</span>
                  )}
                  {todo.duration && <span className="chip">{todo.duration}m</span>}
                  <span className={`chip priority-chip ${todo.priority}`}>
                    {todo.priority}
                  </span>
                  {todo.googleEventId && (
                    <span className="chip reminder-chip" title="Phone reminder set">
                      🔔
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}