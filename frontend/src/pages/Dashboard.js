import React, { useEffect, useMemo, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import useDictation from "../components/useDictation";
import FileStorage from "../components/FileStorage";
import Settings from "../components/Settings";
import GitHubDashboard from "../components/GitHubDashboard";
import DynamicBoard from "../components/DynamicBoard";
import PasswordVault from "../components/PasswordVault";
import { useNotifications } from "../context/NotificationContext";

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

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { notify, confirm } = useNotifications();
  const [boards, setBoards] = useState([]);
  const [activeBoardId, setActiveBoardId] = useState("");
  const [newBoardName, setNewBoardName] = useState("");
  const [todos, setTodos] = useState([]);
  const [newText, setNewText] = useState("");
  const [newStart, setNewStart] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubProfile, setGithubProfile] = useState(null);
  const [activeView, setActiveView] = useState("workspace");
  const [sidebarMode, setSidebarMode] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const activeBoard = boards.find((board) => board._id === activeBoardId);
  const canEditBoard = activeBoard?.access !== "shared";
  const completedCount = todos.filter((todo) => todo.completed).length;
  const upcomingCount = todos.length - completedCount;
  const progress = todos.length ? Math.round((completedCount / todos.length) * 100) : 0;
  const setMessage = (message) => {
    if (!message) return;
    const type = /failed|error|invalid|required|wrong|cancelled|choose/i.test(message) ? "error" : "success";
    notify(message, type);
  };
  const handleScratchpadSaved = React.useCallback((savedBoard) => {
    setBoards((current) => current.map((board) => board._id === savedBoard._id ? savedBoard : board));
  }, []);

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

  async function loadGitHubStatus() {
    try {
      const { data } = await api.get("/github/status");
      setGithubConnected(Boolean(data.connected));
      setGithubProfile(data.connected ? data : null);
    } catch (err) {
      console.error("GitHub status error:", err);
    }
  }

  useEffect(() => {
    loadBoards();
    loadGoogleStatus();
    loadGitHubStatus();

    const params = new URLSearchParams(window.location.search);
    const googleParam = params.get("google");
    const githubParam = params.get("github");

    if (googleParam === "connected") {
      setMessage("Google connected. New tasks will send phone reminders.");
      setGoogleConnected(true);
    } else if (googleParam === "denied") {
      setMessage("Google connection was cancelled.");
    } else if (googleParam === "error") {
      setMessage("Something went wrong connecting Google. Try again.");
    }

    if (githubParam === "connected") {
      setMessage("GitHub connected. Your personal and organization activity is ready.");
      setGithubConnected(true);
      setActiveView("github");
      loadGitHubStatus();
    } else if (githubParam === "denied") {
      setMessage("GitHub connection was cancelled.");
    } else if (githubParam === "error") {
      setMessage("Something went wrong connecting GitHub. Try again.");
    }

    if (googleParam || githubParam) {
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
      setSidebarMode(null);
      setMessage("Board created.");
    } catch (err) {
      console.error("Create board error:", err);
      setMessage(err.response?.data?.message || "Failed to create board");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBoard(board) {
    const taskCount = board._id === activeBoardId ? todos.length : "all";
    const confirmed = await confirm({
      title: `Delete ${board.name}?`,
      message: `This will permanently delete ${taskCount} task${taskCount === 1 ? "" : "s"} from this board.`,
      confirmLabel: "Delete board",
      danger: true,
    });

    if (!confirmed) return;

    try {
      setBusy(true);
      setMessage("");
      const { data } = await api.delete(`/boards/${board._id}`);
      setBoards(data.boards);
      setActiveBoardId(data.boards[0]?._id || "");
      setMessage(`${board.name} deleted.`);
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to delete board");
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

  async function connectGitHub() {
    try {
      const { data } = await api.get("/github/auth-url");
      if (!data?.url) throw new Error("GitHub authorization URL was not returned");
      window.location.href = data.url;
    } catch (err) {
      setMessage(err.response?.data?.message || err.message || "Failed to start GitHub connection");
    }
  }

  async function disconnectGitHub() {
    try {
      await api.post("/github/disconnect");
      setGithubConnected(false);
      setGithubProfile(null);
      setMessage("GitHub disconnected.");
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to disconnect GitHub");
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
      setMessage("Reminder date and time are required");
      return;
    }

    const startDate = new Date(newStart);
    if (Number.isNaN(startDate.getTime())) {
      setMessage("Invalid start date/time");
      return;
    }

    try {
      setBusy(true);
      const { data } = await api.post("/todos", {
        boardId: activeBoardId,
        text: newText.trim(),
        priority: "medium",
        reminderDateTime: startDate.toISOString(),
        duration: 30,
      });

      setNewText("");
      setNewStart("");
      setSidebarMode(null);
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
      setSidebarMode(null);
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
        <a className="brand" href="/" aria-label="Karmex LTS home">
          <span className="brand-mark">KL</span>
          <span>Karmex LTS</span>
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
          <button
            type="button"
            className={activeView === "github" ? "nav-link active" : "nav-link"}
            onClick={() => setActiveView("github")}
          >
            GitHub
          </button>
          <button
            type="button"
            className={activeView === "vault" ? "nav-link active" : "nav-link"}
            onClick={() => setActiveView("vault")}
          >
            Vault
          </button>
          <button
            type="button"
            className={activeView === "settings" ? "nav-link active" : "nav-link"}
            onClick={() => setActiveView("settings")}
          >
            Settings
          </button>
        </div>

        <div className="account-actions">
          <button type="button" className="navbar-profile" onClick={() => setActiveView("settings")} title="Open settings">
            <span className="user-avatar">
              {user?.avatar ? <img src={user.avatar} alt="" /> : (user?.name || "U").charAt(0).toUpperCase()}
            </span>
            <span className="navbar-profile-name">{user?.name || "Account"}</span>
          </button>
          <button type="button" className="icon-btn logout-btn" onClick={logout} title="Log out">
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </nav>

      <div className={activeView !== "workspace" ? "dashboard-layout storage-layout" : sidebarOpen ? "dashboard-layout" : "dashboard-layout sidebar-collapsed"}>
        {activeView === "workspace" && <button type="button" className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label={sidebarOpen ? "Close workspace sidebar" : "Open workspace sidebar"} title={sidebarOpen ? "Close sidebar" : "Open sidebar"}>{sidebarOpen ? "‹" : "›"}</button>}
        {activeView === "workspace" && <aside className="sidebar">
          <div className="sidebar-heading">
            <span>Boards</span>
            <span className="count-badge">{boards.length}</span>
          </div>

          <div className="board-list">
            {boards.map((board) => (
              <div className="board-nav-row" key={board._id}>
                <button
                  type="button"
                  className={board._id === activeBoardId ? "board-nav active" : "board-nav"}
                  onClick={() => setActiveBoardId(board._id)}
                >
                  <span className="board-icon">{board.name.charAt(0).toUpperCase()}</span>
                  <span className="board-name">{board.name}</span>
                  {board.access === "shared" && <span className="shared-board-mark" title={`Shared by @${board.owner?.username || "user"}`}>S</span>}
                  {board._id === activeBoardId && <span className="active-indicator" />}
                </button>
                {board.access !== "shared" && <button
                  type="button"
                  className="board-delete-btn"
                  onClick={() => handleDeleteBoard(board)}
                  disabled={busy}
                  aria-label={`Delete ${board.name}`}
                  title="Delete board"
                >
                  ×
                </button>}
              </div>
            ))}
          </div>

          <div className="sidebar-create-actions">
            <button type="button" className={sidebarMode === "board" ? "active" : ""} onClick={() => setSidebarMode(sidebarMode === "board" ? null : "board")}><span>+</span> New board</button>
            <button type="button" className={sidebarMode === "task" ? "active" : ""} onClick={() => setSidebarMode(sidebarMode === "task" ? null : "task")} disabled={!activeBoardId || !canEditBoard}><span>+</span> New post-it</button>
          </div>

          {sidebarMode === "board" && (
            <form className="sidebar-create-panel" onSubmit={handleCreateBoard}>
              <div className="sidebar-panel-heading"><strong>Create board</strong><button type="button" onClick={() => setSidebarMode(null)} aria-label="Close">×</button></div>
              <label htmlFor="board-name">Board name</label>
              <input id="board-name" type="text" placeholder="e.g. Product launch" value={newBoardName} onChange={(event) => setNewBoardName(event.target.value)} autoFocus />
              <button type="submit" className="accent-btn" disabled={busy}>{busy ? "Creating..." : "Create board"}</button>
            </form>
          )}

          {sidebarMode === "task" && (
            <form className="sidebar-create-panel" onSubmit={handleAddManual}>
              <div className="sidebar-panel-heading"><strong>New post-it</strong><button type="button" onClick={() => setSidebarMode(null)} aria-label="Close">×</button></div>
              <label htmlFor="post-it-text">Task</label>
              <textarea id="post-it-text" placeholder={`Add to ${activeBoard?.name || "board"}`} value={newText} onChange={(event) => setNewText(event.target.value)} autoFocus required />
              <label htmlFor="post-it-reminder">Remind me</label>
              <input id="post-it-reminder" type="datetime-local" value={newStart} onChange={(event) => setNewStart(event.target.value)} required />
              <button type="submit" className="accent-btn" disabled={busy || !activeBoardId}>{busy ? "Pinning..." : "Pin post-it"}</button>
              <button type="button" className={listening ? "sidebar-voice listening" : "sidebar-voice"} onClick={listening ? stop : start} disabled={!supported || busy}>{listening ? "Stop listening" : "Dictate instead"}</button>
              {transcript && <button type="button" className="sidebar-transcript" onClick={submitDictation} disabled={busy}>Use: “{transcript}”</button>}
            </form>
          )}

          {!sidebarMode && (
            <section className="sidebar-stats" aria-label="Board overview">
              <div><span>Open</span><strong>{upcomingCount}</strong></div>
              <div><span>Done</span><strong>{completedCount}</strong></div>
              <div className="sidebar-progress"><span>Progress</span><strong>{progress}%</strong><i><b style={{ width: `${progress}%` }} /></i></div>
              <div className="sidebar-next"><span>Up next</span><strong>{nextTask?.text || "Nothing scheduled"}</strong><small>{nextTask ? formatDateTime(nextTask.reminderDateTime) : "No reminder set"}</small></div>
            </section>
          )}

          <div className="sidebar-footer">
            <div className="profile-row">
              <span className="user-avatar small">
                {user?.avatar ? <img src={user.avatar} alt="" /> : (user?.name || "U").charAt(0).toUpperCase()}
              </span>
              <div>
                <strong>{user?.name || "Your account"}</strong>
                <span>Personal workspace</span>
              </div>
            </div>
          </div>
        </aside>}

        {activeView === "files" ? <FileStorage /> : activeView === "github" ? (
          <GitHubDashboard connected={githubConnected} connectGitHub={connectGitHub} boards={boards} activeBoardId={activeBoardId} />
        ) : activeView === "vault" ? (
          <PasswordVault />
        ) : activeView === "settings" ? (
          <Settings
            googleConnected={googleConnected}
            connectGoogle={connectGoogle}
            disconnectGoogle={disconnectGoogle}
            githubConnected={githubConnected}
            githubProfile={githubProfile}
            connectGitHub={connectGitHub}
            disconnectGitHub={disconnectGitHub}
            boards={boards}
            reloadBoards={loadBoards}
          />
        ) : <main className="workspace">
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
              disabled={busy || !activeBoardId || !canEditBoard}
            >
              <span aria-hidden="true">↕</span>
              Organize tasks
            </button>
          </header>

          <DynamicBoard board={activeBoard} todos={todos} loading={loading} canEdit={canEditBoard} onToggle={handleToggle} onDelete={handleDelete} onBoardSaved={handleScratchpadSaved} onTodosChanged={() => loadTodos(activeBoardId)} />
        </main>}
      </div>
    </div>
  );
}
