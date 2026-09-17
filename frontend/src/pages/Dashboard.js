import React, { useEffect, useMemo, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import useDictation from "../components/useDictation";
import FileStorage from "../components/FileStorage";

function formatDateTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function calculateEndTime(reminderDateTime, duration) {
  if (!reminderDateTime || !duration) return null;
  const start = new Date(reminderDateTime);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + Number(duration) * 60 * 1000).toISOString();
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [boards, setBoards] = useState([]);
  const [activeBoardId, setActiveBoardId] = useState("");
  const [newBoardName, setNewBoardName] = useState("");
  const [todos, setTodos] = useState([]);
  const [newText, setNewText] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [activeView, setActiveView] = useState("workspace");

  const activeBoard = boards.find((board) => board._id === activeBoardId);
  const completedCount = todos.filter((todo) => todo.completed).length;
  const upcomingCount = todos.length - completedCount;
  const progress = todos.length ? Math.round((completedCount / todos.length) * 100) : 0;

  const nextTask = useMemo(
    () =>
      todos
        .filter((todo) => !todo.completed && todo.reminderDateTime)
        .sort((a, b) => new Date(a.reminderDateTime) - new Date(b.reminderDateTime))[0],
    [todos],
  );

  const {
    listening,
    transcript,
    supported,
    error: dictationError,
    start,
    stop,
    reset,
  } = useDictation();

  async function loadBoards() {
    try {
      const { data } = await api.get("/boards");
      setBoards(data);
      setActiveBoardId((current) => current || data[0]?._id || "");
    } catch (err) {
      console.error("Load boards error:", err);
      setMessage(err.response?.data?.message || "Failed to load boards");
      setLoading(false);
    }
  }

  async function loadTodos(boardId = activeBoardId) {
    if (!boardId) {
      setTodos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.get("/todos", { params: { boardId } });
      setTodos(data);
    } catch (err) {
      console.error("Load todos error:", err);
      setMessage(err.response?.data?.message || "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }

  async function loadGoogleStatus() {
    try {
      const { data } = await api.get("/google/status");
      setGoogleConnected(Boolean(data.connected));
    } catch (err) {
      console.error("Google status error:", err);
    }
  }

  useEffect(() => {
    loadBoards();
    loadGoogleStatus();

    const params = new URLSearchParams(window.location.search);
    const googleParam = params.get("google");

    if (googleParam === "connected") {
      setMessage("Google connected. New tasks will send phone reminders.");
      setGoogleConnected(true);
    } else if (googleParam === "denied") {
      setMessage("Google connection was cancelled.");
    } else if (googleParam === "error") {
      setMessage("Something went wrong connecting Google. Try again.");
    }

    if (googleParam) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTodos(activeBoardId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoardId]);

  async function handleCreateBoard(event) {
    event.preventDefault();
    const name = newBoardName.trim();

    if (!name) {
      setMessage("Board name is required");
      return;
    }

    try {
      setBusy(true);
      setMessage("");
      const { data } = await api.post("/boards", { name });
      setBoards((current) => [...current, data]);
      setActiveBoardId(data._id);
      setNewBoardName("");
      setMessage("Board created.");
    } catch (err) {
      console.error("Create board error:", err);
      setMessage(err.response?.data?.message || "Failed to create board");
    } finally {
      setBusy(false);
    }
  }

  async function connectGoogle() {
    try {
      const { data } = await api.get("/google/auth-url");
      if (!data?.url) {
        setMessage("Google authorization URL was not returned.");
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      console.error("Google connect error:", err);
      setMessage(err.response?.data?.message || "Failed to start Google connection");
    }
  }

  async function disconnectGoogle() {
    try {
      await api.post("/google/disconnect");
      setGoogleConnected(false);
      setMessage("Google disconnected.");
    } catch (err) {
      console.error("Google disconnect error:", err);
      setMessage(err.response?.data?.message || "Failed to disconnect Google");
    }
  }

  async function handleAddManual(event) {
    event.preventDefault();
    setMessage("");

    if (!activeBoardId) {
      setMessage("Choose a board first");
      return;
    }

    if (!newText.trim()) {
      setMessage("Task text is required");
      return;
    }

    if (!newStart) {
      setMessage("Start date and time are required");
      return;
    }

    const startDate = new Date(newStart);
    if (Number.isNaN(startDate.getTime())) {
      setMessage("Invalid start date/time");
      return;
    }

    let duration = 30;
    if (newEnd) {
      const endDate = new Date(newEnd);
      if (Number.isNaN(endDate.getTime())) {
        setMessage("Invalid end date/time");
        return;
      }
      if (endDate <= startDate) {
        setMessage("End time must be after start time");
        return;
      }
      duration = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
    }

    try {
      setBusy(true);
      const { data } = await api.post("/todos", {
        boardId: activeBoardId,
        text: newText.trim(),
        priority: "medium",
        reminderDateTime: startDate.toISOString(),
        duration,
      });

      setNewText("");
      setNewStart("");
      setNewEnd("");
      await organize(activeBoardId);

      if (googleConnected && data?.googleEventId) {
        setMessage("Task added and Google Calendar reminder created.");
      } else if (googleConnected) {
        setMessage("Task added. Google reminder was not created.");
      } else {
        setMessage("Task added.");
      }
    } catch (err) {
      console.error("Add todo error:", err);
      setMessage(err.response?.data?.message || "Failed to add task");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(todo) {
    try {
      const { data } = await api.patch(`/todos/${todo._id}`, {
        completed: !todo.completed,
      });
      setTodos((current) =>
        current.map((item) => (item._id === data._id ? data : item)),
      );
    } catch (err) {
      console.error("Toggle todo error:", err);
      setMessage(err.response?.data?.message || "Failed to update task");
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/todos/${id}`);
      setTodos((current) => current.filter((todo) => todo._id !== id));
      setMessage("Task deleted.");
    } catch (err) {
      console.error("Delete todo error:", err);
      setMessage(err.response?.data?.message || "Failed to delete task");
    }
  }

  async function organize(boardId = activeBoardId) {
    if (!boardId) return null;

    try {
      const { data } = await api.post("/todos/organize", { boardId });
      setTodos(data);
      return data;
    } catch (err) {
      console.error("Organize error:", err);
      setMessage(err.response?.data?.message || "Failed to organize tasks");
      return null;
    }
  }

  async function submitDictation() {
    if (!transcript.trim()) return;
    if (!activeBoardId) {
      setMessage("Choose a board first");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const now = new Date();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data } = await api.post("/todos/dictate", {
        boardId: activeBoardId,
        transcript: transcript.trim(),
        clientDateTime: now.toISOString(),
        timezone,
      });

      setTodos(data.todos);
      setMessage(`Added ${data.created} task(s) from dictation.`);
      reset();
    } catch (err) {
      console.error("Dictation error:", err);
      setMessage(err.response?.data?.message || "Failed to process dictation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <nav className="topbar">
        <a className="brand" href="/" aria-label="MK Life home">
          <span className="brand-mark">MK</span>
          <span>MK Life</span>
        </a>

        <div className="topbar-center">
          <button
            type="button"
            className={activeView === "workspace" ? "nav-link active" : "nav-link"}
            onClick={() => setActiveView("workspace")}
          >
            Workspace
          </button>
          <button
            type="button"
            className={activeView === "files" ? "nav-link active" : "nav-link"}
            onClick={() => setActiveView("files")}
          >
            Files
          </button>
        </div>

        <div className="account-actions">
          <button
            type="button"
            className={googleConnected ? "integration-btn connected" : "integration-btn"}
            onClick={googleConnected ? disconnectGoogle : connectGoogle}
          >
            <span className="status-dot" />
            {googleConnected ? "Google connected" : "Connect Google"}
          </button>
          <span className="user-avatar" title={user?.name || "Account"}>
            {(user?.name || "U").charAt(0).toUpperCase()}
          </span>
          <button type="button" className="icon-btn logout-btn" onClick={logout} title="Log out">
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </nav>

      <div className={activeView === "files" ? "dashboard-layout storage-layout" : "dashboard-layout"}>
        {activeView === "workspace" && <aside className="sidebar">
          <div className="sidebar-heading">
            <span>Boards</span>
            <span className="count-badge">{boards.length}</span>
          </div>

          <div className="board-list">
            {boards.map((board) => (
              <button
                key={board._id}
                type="button"
                className={board._id === activeBoardId ? "board-nav active" : "board-nav"}
                onClick={() => setActiveBoardId(board._id)}
              >
                <span className="board-icon">{board.name.charAt(0).toUpperCase()}</span>
                <span className="board-name">{board.name}</span>
                {board._id === activeBoardId && <span className="active-indicator" />}
              </button>
            ))}
          </div>

          <form className="new-board-form" onSubmit={handleCreateBoard}>
            <label htmlFor="board-name">Create board</label>
            <div className="inline-input">
              <input
                id="board-name"
                type="text"
                placeholder="Board name"
                value={newBoardName}
                onChange={(event) => setNewBoardName(event.target.value)}
              />
              <button type="submit" disabled={busy} title="Add board">+</button>
            </div>
          </form>

          <div className="sidebar-footer">
            <div className="profile-row">
              <span className="user-avatar small">
                {(user?.name || "U").charAt(0).toUpperCase()}
              </span>
              <div>
                <strong>{user?.name || "Your account"}</strong>
                <span>Personal workspace</span>
              </div>
            </div>
          </div>
        </aside>}

        {activeView === "files" ? <FileStorage /> : <main className="workspace">
          <header className="workspace-header">
            <div>
              <div className="eyebrow">CURRENT BOARD</div>
              <h1>{activeBoard?.name || "Your workspace"}</h1>
              <p>Plan clearly, protect your time, and finish what matters.</p>
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => organize()}
              disabled={busy || !activeBoardId}
            >
              <span aria-hidden="true">↕</span>
              Organize tasks
            </button>
          </header>

          {message && (
            <button className="info-banner" type="button" onClick={() => setMessage("")}>
              <span>{message}</span>
              <span aria-hidden="true">×</span>
            </button>
          )}

          <section className="stats-grid" aria-label="Board overview">
            <div className="stat-block">
              <span className="stat-label">Open tasks</span>
              <strong>{upcomingCount}</strong>
              <span className="stat-detail">{todos.length} total on this board</span>
            </div>
            <div className="stat-block">
              <span className="stat-label">Completed</span>
              <strong>{completedCount}</strong>
              <span className="stat-detail">{progress}% board progress</span>
            </div>
            <div className="stat-block wide">
              <span className="stat-label">Up next</span>
              <strong className="next-task-name">{nextTask?.text || "Nothing scheduled"}</strong>
              <span className="stat-detail">
                {nextTask ? formatDateTime(nextTask.reminderDateTime) : "Add a time to your next task"}
              </span>
            </div>
          </section>

          <section className="composer-section">
            <div className="section-title-row">
              <div>
                <span className="eyebrow">QUICK CAPTURE</span>
                <h2>Add to {activeBoard?.name || "board"}</h2>
              </div>
              <div className="capture-mode">
                <span className="mode active">Task</span>
                <span className="mode">Schedule</span>
              </div>
            </div>

            <form className="task-composer" onSubmit={handleAddManual}>
              <div className="task-input-wrap">
                <span className="input-plus">+</span>
                <input
                  type="text"
                  placeholder="What needs to get done?"
                  value={newText}
                  onChange={(event) => setNewText(event.target.value)}
                  required
                />
              </div>
              <div className="schedule-fields">
                <label>
                  <span>Starts</span>
                  <input
                    type="datetime-local"
                    value={newStart}
                    onChange={(event) => setNewStart(event.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Ends</span>
                  <input
                    type="datetime-local"
                    value={newEnd}
                    onChange={(event) => setNewEnd(event.target.value)}
                    min={newStart || undefined}
                  />
                </label>
                <button type="submit" className="accent-btn" disabled={busy || !activeBoardId}>
                  {busy ? "Adding..." : "Add task"}
                </button>
              </div>
            </form>

            <div className="dictation-strip">
              <div className="dictation-copy">
                <span className={listening ? "mic-orb listening" : "mic-orb"} aria-hidden="true">●</span>
                <div>
                  <strong>{listening ? "Listening now" : "Capture with your voice"}</strong>
                  <span>Speak naturally and MK Life will build your tasks.</span>
                </div>
              </div>
              <div className="dictation-actions">
                {transcript && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={submitDictation}
                    disabled={busy || !activeBoardId}
                  >
                    Add transcript
                  </button>
                )}
                <button
                  type="button"
                  className={listening ? "voice-btn listening" : "voice-btn"}
                  onClick={listening ? stop : start}
                  disabled={!supported || busy || !activeBoardId}
                >
                  {listening ? "Stop" : "Start dictation"}
                </button>
              </div>
            </div>

            {transcript && <div className="transcript-box"><strong>Heard:</strong> {transcript}</div>}
            {!supported && <p className="error-banner">Voice dictation is not supported in this browser. Try Chrome or Edge.</p>}
            {dictationError && <p className="error-banner">Mic error: {dictationError}</p>}
          </section>

          <section className="tasks-section">
            <div className="section-title-row">
              <div>
                <span className="eyebrow">BOARD TASKS</span>
                <h2>Focus list</h2>
              </div>
              <span className="task-summary">{upcomingCount} remaining</span>
            </div>

            {loading ? (
              <div className="empty-state">Loading your tasks...</div>
            ) : todos.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">+</span>
                <h3>This board is ready</h3>
                <p>Add your first task above or capture a few by voice.</p>
              </div>
            ) : (
              <div className="task-list">
                {todos.map((todo) => {
                  const endDateTime = calculateEndTime(todo.reminderDateTime, todo.duration);
                  return (
                    <article
                      key={todo._id}
                      className={todo.completed ? "task-row completed" : "task-row"}
                    >
                      <label className="task-check">
                        <input
                          type="checkbox"
                          checked={Boolean(todo.completed)}
                          onChange={() => handleToggle(todo)}
                        />
                        <span className="custom-check" />
                      </label>
                      <div className="task-content">
                        <strong>{todo.text}</strong>
                        <div className="task-meta">
                          {todo.reminderDateTime && (
                            <span>
                              {formatDateTime(todo.reminderDateTime)}
                              {endDateTime ? ` – ${formatDateTime(endDateTime)}` : ""}
                            </span>
                          )}
                          {!todo.reminderDateTime && todo.timeHint && <span>{todo.timeHint}</span>}
                          {todo.duration && <span>{todo.duration} min</span>}
                          <span className={`priority ${todo.priority}`}>{todo.priority}</span>
                          {todo.googleEventId && <span className="calendar-status">Calendar set</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="icon-btn delete-task"
                        onClick={() => handleDelete(todo._id)}
                        aria-label="Delete task"
                        title="Delete task"
                      >
                        ×
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </main>}
      </div>
    </div>
  );
}

