import React, { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import useDictation from "../components/useDictation";

/* =========================================================
   STICKY NOTE SETTINGS
========================================================= */

const NOTE_COLORS = [
  "pink",
  "blue",
  "yellow",
  "green",
  "purple",
  "orange",
];

// Stable small rotation per note
function rotationFor(id) {
  let hash = 0;

  for (let i = 0; i < id.length; i++) {
    hash =
      (hash * 31 + id.charCodeAt(i)) >>> 0;
  }

  return (hash % 7) - 3;
}

/* =========================================================
   DATE/TIME HELPERS
========================================================= */

// Format ISO datetime into:
// Sep 18, 2:30 PM
function formatDateTime(iso) {
  if (!iso) return "";

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Calculate end time using:
// reminderDateTime + duration
function calculateEndTime(
  reminderDateTime,
  duration,
) {
  if (!reminderDateTime || !duration) {
    return null;
  }

  const start =
    new Date(reminderDateTime);

  if (
    Number.isNaN(start.getTime())
  ) {
    return null;
  }

  return new Date(
    start.getTime() +
      Number(duration) * 60 * 1000,
  ).toISOString();
}

/* =========================================================
   DASHBOARD
========================================================= */

export default function Dashboard() {
  const { user, logout } = useAuth();

  const [boards, setBoards] =
    useState([]);

  const [activeBoardId, setActiveBoardId] =
    useState("");

  const [newBoardName, setNewBoardName] =
    useState("");

  const [todos, setTodos] =
    useState([]);

  const [newText, setNewText] =
    useState("");

  const [newStart, setNewStart] =
    useState("");

  const [newEnd, setNewEnd] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [busy, setBusy] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [
    googleConnected,
    setGoogleConnected,
  ] = useState(false);

  const activeBoard = boards.find(
    (board) => board._id === activeBoardId,
  );

  /* =========================================================
     DICTATION
  ========================================================= */

  const {
    listening,
    transcript,
    supported,
    error: dictationError,
    start,
    stop,
    reset,
  } = useDictation();

  /* =========================================================
     LOAD BOARDS / TODOS
  ========================================================= */

  async function loadBoards() {
    try {
      const { data } =
        await api.get("/boards");

      setBoards(data);

      setActiveBoardId((current) =>
        current || data[0]?._id || "",
      );
    } catch (err) {
      console.error(
        "Load boards error:",
        err,
      );

      setMessage(
        err.response?.data?.message ||
          "Failed to load boards",
      );

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
      const { data } =
        await api.get("/todos", {
          params: { boardId },
        });

      setTodos(data);
    } catch (err) {
      console.error(
        "Load todos error:",
        err,
      );

      setMessage(
        err.response?.data?.message ||
          "Failed to load tasks",
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     GOOGLE STATUS
  ========================================================= */

  async function loadGoogleStatus() {
    try {
      const { data } =
        await api.get(
          "/google/status",
        );

      setGoogleConnected(
        Boolean(data.connected),
      );
    } catch (err) {
      console.error(
        "Google status error:",
        err,
      );

      // Non-fatal
    }
  }

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    loadBoards();
    loadGoogleStatus();

    const params =
      new URLSearchParams(
        window.location.search,
      );

    const googleParam =
      params.get("google");

    if (
      googleParam === "connected"
    ) {
      setMessage(
        "Google connected — new tasks will send phone reminders.",
      );

      setGoogleConnected(true);
    } else if (
      googleParam === "denied"
    ) {
      setMessage(
        "Google connection was cancelled.",
      );
    } else if (
      googleParam === "error"
    ) {
      setMessage(
        "Something went wrong connecting Google. Try again.",
      );
    }

    if (googleParam) {
      window.history.replaceState(
        {},
        "",
        window.location.pathname,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTodos(activeBoardId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoardId]);

  /* =========================================================
     BOARDS
  ========================================================= */

  async function handleCreateBoard(e) {
    e.preventDefault();

    const name = newBoardName.trim();

    if (!name) {
      setMessage("Board name is required");
      return;
    }

    try {
      setBusy(true);
      setMessage("");

      const { data } =
        await api.post("/boards", {
          name,
        });

      setBoards((prev) => [
        ...prev,
        data,
      ]);
      setActiveBoardId(data._id);
      setNewBoardName("");
      setMessage("Board created.");
    } catch (err) {
      console.error(
        "Create board error:",
        err,
      );

      setMessage(
        err.response?.data?.message ||
          "Failed to create board",
      );
    } finally {
      setBusy(false);
    }
  }

  /* =========================================================
     CONNECT GOOGLE
  ========================================================= */

  async function connectGoogle() {
    try {
      const { data } =
        await api.get(
          "/google/auth-url",
        );

      if (!data?.url) {
        setMessage(
          "Google authorization URL was not returned.",
        );

        return;
      }

      window.location.href =
        data.url;
    } catch (err) {
      console.error(
        "Google connect error:",
        err,
      );

      setMessage(
        err.response?.data?.message ||
          "Failed to start Google connection",
      );
    }
  }

  /* =========================================================
     DISCONNECT GOOGLE
  ========================================================= */

  async function disconnectGoogle() {
    try {
      await api.post(
        "/google/disconnect",
      );

      setGoogleConnected(false);

      setMessage(
        "Google disconnected.",
      );
    } catch (err) {
      console.error(
        "Google disconnect error:",
        err,
      );

      setMessage(
        err.response?.data?.message ||
          "Failed to disconnect Google",
      );
    }
  }

  /* =========================================================
     ADD MANUAL TODO
  ========================================================= */

  async function handleAddManual(e) {
    e.preventDefault();

    setMessage("");

    if (!activeBoardId) {
      setMessage("Choose a board first");
      return;
    }

    /* -----------------------------
       Validate task
    ----------------------------- */

    if (!newText.trim()) {
      setMessage(
        "Task text is required",
      );

      return;
    }

    /* -----------------------------
       Start date/time is required
    ----------------------------- */

    if (!newStart) {
      setMessage(
        "Start date and time are required",
      );

      return;
    }

    const startDate =
      new Date(newStart);

    if (
      Number.isNaN(
        startDate.getTime(),
      )
    ) {
      setMessage(
        "Invalid start date/time",
      );

      return;
    }

    /* -----------------------------
       Calculate duration
    ----------------------------- */

    let duration = 30;

    if (newEnd) {
      const endDate =
        new Date(newEnd);

      if (
        Number.isNaN(
          endDate.getTime(),
        )
      ) {
        setMessage(
          "Invalid end date/time",
        );

        return;
      }

      if (
        endDate <= startDate
      ) {
        setMessage(
          "End time must be after start time",
        );

        return;
      }

      duration = Math.round(
        (
          endDate.getTime() -
          startDate.getTime()
        ) /
          (1000 * 60),
      );
    }

    /* -----------------------------
       Create request
    ----------------------------- */

    try {
      setBusy(true);

      const payload = {
        boardId: activeBoardId,

        text:
          newText.trim(),

        priority: "medium",

        // Browser converts local date/time
        // into ISO UTC.
        reminderDateTime:
          startDate.toISOString(),

        duration,
      };

      console.log(
        "Creating todo:",
        payload,
      );

      const { data } =
        await api.post(
          "/todos",
          payload,
        );

      console.log(
        "Created todo:",
        data,
      );

      /* -----------------------------
         Reset form
      ----------------------------- */

      setNewText("");
      setNewStart("");
      setNewEnd("");

      /* -----------------------------
         Refresh organized list
      ----------------------------- */

      await organize(activeBoardId);

      if (
        googleConnected &&
        data?.googleEventId
      ) {
        setMessage(
          "Task added and Google Calendar reminder created.",
        );
      } else if (
        googleConnected
      ) {
        setMessage(
          "Task added. Google reminder was not created.",
        );
      } else {
        setMessage(
          "Task added.",
        );
      }
    } catch (err) {
      console.error(
        "Add todo error:",
        err,
      );

      setMessage(
        err.response?.data
          ?.message ||
          "Failed to add task",
      );
    } finally {
      setBusy(false);
    }
  }

  /* =========================================================
     TOGGLE COMPLETE
  ========================================================= */

  async function handleToggle(
    todo,
  ) {
    try {
      const { data } =
        await api.patch(
          `/todos/${todo._id}`,
          {
            completed:
              !todo.completed,
          },
        );

      setTodos((prev) =>
        prev.map((t) =>
          t._id === data._id
            ? data
            : t,
        ),
      );
    } catch (err) {
      console.error(
        "Toggle todo error:",
        err,
      );

      setMessage(
        err.response?.data
          ?.message ||
          "Failed to update task",
      );
    }
  }

  /* =========================================================
     DELETE TODO
  ========================================================= */

  async function handleDelete(id) {
    try {
      await api.delete(
        `/todos/${id}`,
      );

      setTodos((prev) =>
        prev.filter(
          (t) => t._id !== id,
        ),
      );

      setMessage(
        "Task deleted.",
      );
    } catch (err) {
      console.error(
        "Delete todo error:",
        err,
      );

      setMessage(
        err.response?.data
          ?.message ||
          "Failed to delete task",
      );
    }
  }

  /* =========================================================
     ORGANIZE
  ========================================================= */

  async function organize(boardId = activeBoardId) {
    if (!boardId) {
      return null;
    }

    try {
      const { data } =
        await api.post(
          "/todos/organize",
          { boardId },
        );

      setTodos(data);

      return data;
    } catch (err) {
      console.error(
        "Organize error:",
        err,
      );

      setMessage(
        err.response?.data
          ?.message ||
          "Failed to organize tasks",
      );

      return null;
    }
  }

  /* =========================================================
     DICTATION SUBMIT
  ========================================================= */

  async function submitDictation() {
    if (!transcript.trim()) {
      return;
    }

    if (!activeBoardId) {
      setMessage("Choose a board first");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      /*
       * Send browser's current date/time
       * and timezone.
       *
       * This allows the backend to
       * eventually resolve:
       *
       * "at 5pm"
       * "tomorrow at 10am"
       * etc.
       */

      const now = new Date();

      const timezone =
        Intl.DateTimeFormat()
          .resolvedOptions()
          .timeZone;

      const { data } =
        await api.post(
          "/todos/dictate",
          {
            boardId: activeBoardId,

            transcript:
              transcript.trim(),

            clientDateTime:
              now.toISOString(),

            timezone,
          },
        );

      setTodos(data.todos);

      setMessage(
        `Added ${data.created} task(s) from dictation.`,
      );

      reset();
    } catch (err) {
      console.error(
        "Dictation error:",
        err,
      );

      setMessage(
        err.response?.data
          ?.message ||
          "Failed to process dictation",
      );
    } finally {
      setBusy(false);
    }
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="dashboard">

      {/* ===============================================
          HEADER
      =============================================== */}

      <header className="dashboard-header">
        <div>
          <h1>{activeBoard?.name || "Boards"}</h1>

          <p className="subtitle">
            Hi {user?.name} — choose a board
            and plan from there
          </p>
        </div>

        <div className="header-actions">

          {googleConnected ? (
            <button
              type="button"
              className="ghost-btn"
              onClick={
                disconnectGoogle
              }
            >
              📱 Google connected
            </button>
          ) : (
            <button
              type="button"
              className="primary-btn"
              onClick={
                connectGoogle
              }
            >
              📱 Connect Google
              reminders
            </button>
          )}

          <button
            type="button"
            className="ghost-btn"
            onClick={logout}
          >
            Log out
          </button>

        </div>
      </header>

      {/* ===============================================
          BOARDS
      =============================================== */}

      <section className="board-panel">
        <div className="board-tabs">
          {boards.map((board) => (
            <button
              key={board._id}
              type="button"
              className={
                board._id === activeBoardId
                  ? "board-tab active"
                  : "board-tab"
              }
              onClick={() =>
                setActiveBoardId(board._id)
              }
            >
              {board.name}
            </button>
          ))}
        </div>

        <form
          className="board-form"
          onSubmit={handleCreateBoard}
        >
          <input
            type="text"
            placeholder="New board name"
            value={newBoardName}
            onChange={(e) =>
              setNewBoardName(
                e.target.value,
              )
            }
          />

          <button
            type="submit"
            disabled={busy}
          >
            Add board
          </button>
        </form>
      </section>

      {/* ===============================================
          MESSAGE
      =============================================== */}

      {message && (
        <div className="info-banner">
          {message}
        </div>
      )}

      {/* ===============================================
          DICTATION
      =============================================== */}

      <section className="dictation-panel">

        <h2>Dictate to {activeBoard?.name || "this board"}</h2>

        {!supported && (
          <p className="error-banner">
            Voice dictation isn't
            supported in this browser.
            Try Chrome or Edge.
          </p>
        )}

        {dictationError && (
          <p className="error-banner">
            Mic error:{" "}
            {dictationError}
          </p>
        )}

        <div className="dictation-controls">

          <button
            type="button"
            className={
              listening
                ? "mic-btn listening"
                : "mic-btn"
            }
            onClick={
              listening
                ? stop
                : start
            }
            disabled={
              !supported || busy || !activeBoardId
            }
          >
            {listening
              ? "Stop listening"
              : "Start dictation"}
          </button>

          {transcript && (
            <button
              type="button"
              className="primary-btn"
              onClick={
                submitDictation
              }
              disabled={busy || !activeBoardId}
            >
              {busy
                ? "Organizing..."
                : "Add & organize"}
            </button>
          )}

        </div>

        {transcript && (
          <div className="transcript-box">
            <strong>
              Heard:
            </strong>{" "}
            {transcript}
          </div>
        )}

        <p className="hint">
          Try: "Call mom at 5pm,
          then finish report urgent
          for 1 hour, and buy
          groceries"
        </p>

        {!googleConnected && (
          <p className="hint">
            Connect Google above to
            get these as phone
            reminders.
          </p>
        )}

      </section>

      {/* ===============================================
          MANUAL TASK FORM
      =============================================== */}

      <form
        className="add-form"
        onSubmit={
          handleAddManual
        }
      >

        <input
          type="text"
          placeholder={
            activeBoard
              ? `Add a task to ${activeBoard.name}...`
              : "Add a task..."
          }
          value={newText}
          onChange={(e) =>
            setNewText(
              e.target.value,
            )
          }
          required
        />

        <label className="field-label">
          Start

          <input
            type="datetime-local"
            value={newStart}
            onChange={(e) =>
              setNewStart(
                e.target.value,
              )
            }
            required
          />
        </label>

        <label className="field-label">
          End

          <input
            type="datetime-local"
            value={newEnd}
            onChange={(e) =>
              setNewEnd(
                e.target.value,
              )
            }
            min={
              newStart ||
              undefined
            }
          />
        </label>

        <button
          type="submit"
          disabled={busy || !activeBoardId}
        >
          {busy
            ? "Adding..."
            : "Add"}
        </button>

      </form>

      {/* ===============================================
          ORGANIZE
      =============================================== */}

      <div className="list-actions">

        <button
          type="button"
          className="ghost-btn"
          onClick={() => organize()}
          disabled={busy || !activeBoardId}
        >
          Re-organize board
        </button>

      </div>

      {/* ===============================================
          TODO LIST
      =============================================== */}

      {loading ? (

        <p>
          Loading tasks...
        </p>

      ) : todos.length === 0 ? (

        <p className="empty-state">
          No tasks on this board yet.
          Dictate or add one.
        </p>

      ) : (

        <div className="sticky-board">

          {todos.map(
            (todo, idx) => {

              const color =
                NOTE_COLORS[
                  idx %
                    NOTE_COLORS.length
                ];

              const rotation =
                rotationFor(
                  todo._id,
                );

              const endDateTime =
                calculateEndTime(
                  todo.reminderDateTime,
                  todo.duration,
                );

              return (
                <div
                  key={todo._id}
                  className={`sticky-note note-${color} ${
                    todo.completed
                      ? "completed"
                      : ""
                  }`}
                  style={{
                    "--rotate":
                      `${rotation}deg`,
                  }}
                >

                  {/* DELETE */}

                  <button
                    type="button"
                    className="sticky-delete"
                    onClick={() =>
                      handleDelete(
                        todo._id,
                      )
                    }
                    aria-label="Delete task"
                  >
                    ×
                  </button>

                  {/* CHECKBOX + TEXT */}

                  <label className="sticky-check">

                    <input
                      type="checkbox"
                      checked={
                        Boolean(
                          todo.completed,
                        )
                      }
                      onChange={() =>
                        handleToggle(
                          todo,
                        )
                      }
                    />

                    <span className="sticky-text">
                      {todo.text}
                    </span>

                  </label>

                  {/* =================================
                      META
                  ================================= */}

                  <div className="sticky-meta">

                    {/* REAL REMINDER DATE/TIME */}

                    {todo.reminderDateTime && (
                      <span className="chip time-chip">

                        {formatDateTime(
                          todo.reminderDateTime,
                        )}

                        {endDateTime
                          ? ` - ${formatDateTime(
                              endDateTime,
                            )}`
                          : ""}

                      </span>
                    )}

                    {/* DICTATION TIME HINT */}

                    {!todo.reminderDateTime &&
                      todo.timeHint && (
                        <span className="chip">
                          {
                            todo.timeHint
                          }
                        </span>
                      )}

                    {/* DURATION */}

                    {todo.duration && (
                      <span className="chip">
                        {todo.duration}m
                      </span>
                    )}

                    {/* PRIORITY */}

                    <span
                      className={`chip priority-chip ${
                        todo.priority
                      }`}
                    >
                      {todo.priority}
                    </span>

                    {/* GOOGLE REMINDER */}

                    {todo.googleEventId && (
                      <span
                        className="chip reminder-chip"
                        title="Google Calendar reminder set"
                      >
                        🔔
                      </span>
                    )}

                  </div>

                </div>
              );
            },
          )}

        </div>
      )}

    </div>
  );
}
