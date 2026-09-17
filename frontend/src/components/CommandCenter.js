import React, { useEffect, useState } from "react";
import api from "../api";

const MODE_COPY = {
  focus: ["FOCUS CONTROL", "Current work, deadlines, and completion signal with secondary telemetry reduced."],
  sprint: ["SPRINT REVIEW", "Sprint health, delivery flow, and engineering activity across every planning board."],
  team: ["TEAM OPERATIONS", "Capacity, blockers, ownership, and team delivery signals in one operational view."],
  briefing: ["DAILY BRIEFING", "Unified operational status across planning, engineering, resources, and private systems."],
};

export default function CommandCenter({ user, boards, githubConnected, mode = "briefing", onModeChange, onNavigate, onBoard, onPalette }) {
  const [allTodos, setAllTodos] = useState([]); const [utilization, setUtilization] = useState(null); const [github, setGithub] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    async function load() {
      setLoading(true);
      const taskRequests = boards.map((board) => api.get("/todos", { params: { boardId: board._id } }).then(({ data }) => data.map((todo) => ({ ...todo, boardName: board.name }))));
      const [taskResults, utilResult, githubResult] = await Promise.all([Promise.all(taskRequests).catch(() => []), api.get("/utilization").then(({ data }) => data).catch(() => null), githubConnected ? api.get("/github/dashboard").then(({ data }) => data).catch(() => null) : null]);
      if (live) { setAllTodos(taskResults.flat()); setUtilization(utilResult); setGithub(githubResult); setLoading(false); }
    }
    load(); return () => { live = false; };
  }, [boards, githubConnected]);
  const open = allTodos.filter((todo) => !todo.completed); const completed = allTodos.length - open.length; const progress = allTodos.length ? Math.round(completed / allTodos.length * 100) : 0;
  const activeSprints = boards.flatMap((board) => (board.sprints || []).filter((sprint) => sprint.status === "active").map((sprint) => ({ ...sprint, boardName: board.name, boardId: board._id })));
  const blocked = open.filter((todo) => todo.blockedReason); const overdue = open.filter((todo) => todo.reminderDateTime && new Date(todo.reminderDateTime) < new Date());
  const timeline = open.filter((todo) => todo.reminderDateTime).sort((a, b) => new Date(a.reminderDateTime) - new Date(b.reminderDateTime)).slice(0, 8);
  const repositories = github?.repositories || []; const openIssues = repositories.reduce((sum, repo) => sum + repo.openIssues, 0);
  const modeCopy = MODE_COPY[mode] || MODE_COPY.briefing;
  return <main className={`command-center mode-${mode}`}>
    <header className="command-center-header"><div><span className="eyebrow">{modeCopy[0]}</span><h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {user?.name?.split(" ")[0] || "Operator"}</h1><p>{modeCopy[1]}</p></div><button type="button" className="command-launch" onClick={onPalette}><span>⌘</span><strong>Run command</strong><kbd>Ctrl K</kbd></button></header>
    <nav className="mode-switcher" aria-label="Personal operating mode">{Object.entries(MODE_COPY).map(([key, copy]) => <button key={key} type="button" className={mode === key ? "active" : ""} onClick={() => onModeChange(key)}><i />{copy[0]}</button>)}</nav>
    <section className="system-strip"><span><i className="online" /> Core online</span><span><i className={githubConnected ? "online" : "warning"} /> GitHub {githubConnected ? "linked" : "offline"}</span><span><i className={utilization ? "online" : "warning"} /> Resource data {utilization ? "ready" : "pending"}</span><time>{new Date().toLocaleString()}</time></section>
    <section className="mission-kpis"><Metric label="Open work" value={open.length} detail={overdue.length + " overdue"} tone={overdue.length ? "danger" : ""} /><Metric label="Active sprints" value={activeSprints.length} detail={boards.length + " planning boards"} /><Metric label="Blocked" value={blocked.length} detail="Requires intervention" tone={blocked.length ? "warning" : ""} /><Metric label="GitHub issues" value={githubConnected ? openIssues : "--"} detail={repositories.length + " repositories"} /></section>
    <section className="mission-grid"><article className="mission-panel delivery-core"><PanelHead code="OPS-01" title="Delivery core" action="Workspace" onClick={() => onNavigate("workspace")} /><div className="delivery-orbit"><div className="orbit-ring" style={{ "--mission-progress": progress * 3.6 + "deg" }}><div><strong>{progress}%</strong><span>COMPLETE</span></div></div><div className="delivery-stats"><div><span>Completed</span><strong>{completed}</strong></div><div><span>Remaining</span><strong>{open.length}</strong></div><div><span>Blocked</span><strong>{blocked.length}</strong></div></div></div><div className="active-sprint-list">{activeSprints.map((sprint) => <button type="button" key={sprint._id} onClick={() => onBoard(sprint.boardId)}><span>{sprint.boardName}</span><strong>{sprint.name}</strong><small>{new Date(sprint.endDate).toLocaleDateString()} target</small></button>)}{!activeSprints.length && <p>No active sprint detected</p>}</div></article>
      <article className="mission-panel resource-radar"><PanelHead code="OPS-02" title="Resource radar" action="Utilization" onClick={() => onNavigate("utilization")} />{utilization ? <div className="resource-heatmap">{utilization.members.slice(0, 12).map((member) => <div key={member.member}><span>{member.member}</span><i style={{ "--load": Math.min(100, member.utilization * 100) + "%" }} className={member.utilization > 1 ? "over" : member.utilization > .85 ? "high" : "normal"} /><strong>{Math.round(member.utilization * 100)}%</strong></div>)}</div> : <div className="mission-empty">Upload utilization data to activate resource radar.</div>}</article>
      <article className="mission-panel delivery-timeline"><PanelHead code="OPS-03" title="Delivery timeline" action="Calendar" onClick={() => onNavigate("workspace")} /><div>{timeline.map((todo) => <article key={todo._id}><time>{new Date(todo.reminderDateTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time><i /><div><strong>{todo.text}</strong><span>{todo.boardName} · {todo.priority}</span></div></article>)}{!timeline.length && <div className="mission-empty">No scheduled work detected.</div>}</div></article>
      <article className="mission-panel engineering-radar"><PanelHead code="OPS-04" title="Engineering radar" action="GitHub" onClick={() => onNavigate("github")} />{github ? <><div className="engineering-metrics"><div><span>Repositories</span><strong>{repositories.length}</strong></div><div><span>Pull requests</span><strong>{github.pulls?.length || 0}</strong></div><div><span>Recent commits</span><strong>{github.commits?.length || 0}</strong></div></div><div className="engineering-feed">{github.commits?.slice(0, 5).map((commit) => <a key={commit.sha} href={commit.htmlUrl} target="_blank" rel="noreferrer"><span>{commit.repository}</span><strong>{commit.message}</strong><small>{commit.author}</small></a>)}</div></> : <div className="mission-empty">{githubConnected ? "Engineering telemetry is loading." : "Connect GitHub to activate engineering radar."}</div>}</article>
    </section>{loading && <div className="command-loading">Synchronizing mission data...</div>}
  </main>;
}

function Metric({ label, value, detail, tone = "" }) { return <article className={tone}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function PanelHead({ code, title, action, onClick }) { return <header><div><span>{code}</span><h2>{title}</h2></div><button type="button" onClick={onClick}>{action} →</button></header>; }
