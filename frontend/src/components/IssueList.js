import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";

const emptyFilters = { q: "", assignee: "", sprint: "", workType: "", priority: "", label: "", blocked: "", completed: "", archived: "" };
export default function IssueList({ project, mine = false, onCreated }) {
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pageSize: 25 });
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [title, setTitle] = useState(""), [creating, setCreating] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => { setPage(1); setFilters(emptyFilters); }, [project?._id, mine]);
  useEffect(() => {
    let live = true; setLoading(true); setError("");
    if (!mine && !project?._id) { setData({ items: [], total: 0, pageSize: 25 }); setLoading(false); return; }
    const timer = setTimeout(() => {
      api.get("/todos/search", { params: { ...filters, page, ...(mine ? { mine: "true", completed: filters.completed || "false" } : { boardId: project._id }) } }).then(({ data: result }) => { if (live) setData(result); }).catch((err) => { if (live) { setData({ items: [], total: 0, pageSize: 25 }); setError(err.response?.data?.message || "Could not load issues"); } }).finally(() => { if (live) setLoading(false); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [filters, page, project?._id, mine, revision]);
  const change = (field, value) => { setPage(1); setFilters((current) => ({ ...current, [field]: value })); };
  const people = project ? [{ user: project.owner || project.user, role: "owner" }, ...(project.members || [])].filter((entry) => entry.user && entry.role !== "viewer") : [];
  async function create(event) {
    event.preventDefault(); setCreating(true); setError("");
    try { await api.post("/todos", { boardId: project._id, text: title }); setTitle(""); setPage(1); setRevision((value) => value + 1); await onCreated?.(); }
    catch (err) { setError(err.response?.data?.message || "Could not create issue"); }
    finally { setCreating(false); }
  }
  return <section className="project-panel issue-list"><div className="project-person"><h2>{mine ? "My Work" : "Issues"}</h2><button className="secondary-btn" onClick={() => setRevision((value) => value + 1)}>Refresh</button></div>
    {mine && <p>Your assigned open work across active projects.</p>}
    {!mine && project?.permissions?.canEdit && <form className="issue-quick-create" onSubmit={create}><input aria-label="New issue title" placeholder="Describe the next piece of work" required value={title} onChange={(e) => setTitle(e.target.value)} /><button className="accent-btn" disabled={creating}>Create issue</button></form>}
    <div className="issue-filters"><label>Search<input placeholder="Issue key or title" value={filters.q} maxLength={100} onChange={(e) => change("q", e.target.value)} /></label>
      {!mine && <><label>Assignee<select value={filters.assignee} onChange={(e) => change("assignee", e.target.value)}><option value="">Everyone</option><option value="unassigned">Unassigned</option>{people.map(({ user }) => <option key={user._id || user} value={user._id || user}>{user.name || user.username || "Member"}</option>)}</select></label><label>Sprint<select value={filters.sprint} onChange={(e) => change("sprint", e.target.value)}><option value="">All sprints</option><option value="backlog">Backlog</option>{project?.sprints?.map((sprint) => <option key={sprint._id} value={sprint._id}>{sprint.name}</option>)}</select></label></>}
      <label>Type<select value={filters.workType} onChange={(e) => change("workType", e.target.value)}><option value="">All types</option>{["story", "task", "bug", "spike"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Priority<select value={filters.priority} onChange={(e) => change("priority", e.target.value)}><option value="">All priorities</option>{["high", "medium", "low"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Label<input value={filters.label} maxLength={60} onChange={(e) => change("label", e.target.value)} /></label>
      <label>State<select value={filters.completed} onChange={(e) => change("completed", e.target.value)}>{!mine && <option value="">Any state</option>}<option value="false">Open</option><option value="true">Completed</option></select></label>
      <label>Blocked<select value={filters.blocked} onChange={(e) => change("blocked", e.target.value)}><option value="">All work</option><option value="true">Blocked only</option></select></label>
      <label>Archive<select value={filters.archived} onChange={(e) => change("archived", e.target.value)}><option value="">Active issues</option><option value="true">Archived issues</option></select></label>
    </div>
    {error && <p role="alert" className="error-banner">{error}</p>}{loading ? <p role="status">Loading issues…</p> : <><p>{data.total} issues</p><div className="issue-results">{data.items.map((issue) => <article key={issue._id}><div>{issue.issueKey ? <Link to={`/issues/${issue.issueKey}`}>{issue.issueKey} · {issue.text}</Link> : <strong>{issue.text} · ID pending migration</strong>}<small>{issue.workType} · {issue.priority} · {issue.workflowStage} · {issue.storyPoints || 0} pts{issue.blockedReason ? " · Blocked" : ""}</small></div><span>{issue.assignee?.name || "Unassigned"}</span></article>)}</div>{!data.items.length && <p>No issues match these filters.</p>}<div className="issue-pagination"><button className="secondary-btn" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button className="secondary-btn" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</button></div></>}
  </section>;
}
