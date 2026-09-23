import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api";
import MarkdownDescription from "../components/MarkdownDescription";
import "../components/projects.css";

const idOf = (value) => value?._id || value || "";
export default function Issue() {
  const { key } = useParams();
  const [data, setData] = useState(null), [draft, setDraft] = useState(null);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false), [preview, setPreview] = useState(false);
  const load = useCallback(async () => {
    const { data: result } = await api.get(`/todos/by-key/${encodeURIComponent(key)}`);
    setData(result); setDraft({ text: result.issue.text, description: result.issue.description || "", workType: result.issue.workType, priority: result.issue.priority, storyPoints: result.issue.storyPoints || 0, assignee: idOf(result.issue.assignee), sprintId: idOf(result.issue.sprint), workflowStage: result.issue.workflowStage, labels: (result.issue.labels || []).join(", "), acceptanceCriteria: result.issue.acceptanceCriteria || "", blockedReason: result.issue.blockedReason || "" });
  }, [key]);
  useEffect(() => { let live = true; setData(null); setDraft(null); setError(""); load().catch((err) => { if (live) setError(err.response?.data?.message || "Could not load issue"); }); return () => { live = false; }; }, [load]);
  async function save(changes) {
    setBusy(true); setError(""); setMessage("");
    try { await api.patch(`/todos/${data.issue._id}`, changes); setMessage("Issue saved."); try { await load(); } catch { setMessage("Issue saved. Refresh to load the latest details."); } }
    catch (err) { setError(err.response?.data?.message || "Could not save issue"); }
    finally { setBusy(false); }
  }
  const change = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  if (!data || !draft) return <main className="workspace"><Link to="/">Back to workspace</Link><p role={error ? "alert" : "status"}>{error || "Loading issue…"}</p></main>;
  const { issue, project } = data;
  const canEdit = project.permissions.canEdit && !issue.archivedAt;
  const stages = project.sprints.find((sprint) => sprint._id === draft.sprintId)?.stages || ["To do", "In progress", "Review", "Done"];
  const people = [{ user: project.owner, role: "owner" }, ...(project.members || [])].filter((member) => member.user && member.role !== "viewer");
  return <main className="workspace issue-page"><Link to="/">← Back to workspace</Link><header className="workspace-header"><div><div className="eyebrow">{project.name} · {issue.issueKey}</div><h1>{issue.text}</h1><p>Reported by {issue.reporter?.name || issue.creator?.name || "Unknown"} · Created {new Date(issue.createdAt).toLocaleDateString()}</p></div></header>
    {error && <p role="alert" className="error-banner">{error}</p>}{message && <p role="status">{message}</p>}{(issue.archivedAt || project.archivedAt) && <p>This {project.archivedAt ? "project" : "issue"} is archived and read-only.</p>}
    <form className="project-panel issue-detail-form" onSubmit={(event) => { event.preventDefault(); if (canEdit && !busy) save({ ...draft, assignee: draft.assignee || null, sprintId: draft.sprintId || null, labels: draft.labels.split(",").map((label) => label.trim()).filter(Boolean) }); }}>
      <fieldset disabled={!canEdit || busy}><label>Title<input required value={draft.text} onChange={(e) => change("text", e.target.value)} /></label><div className="issue-filters"><label>Type<select value={draft.workType} onChange={(e) => change("workType", e.target.value)}>{["story", "task", "bug", "spike"].map((type) => <option key={type}>{type}</option>)}</select></label><label>Priority<select value={draft.priority} onChange={(e) => change("priority", e.target.value)}>{["high", "medium", "low"].map((priority) => <option key={priority}>{priority}</option>)}</select></label><label>Points<input type="number" min="0" max="100" value={draft.storyPoints} onChange={(e) => change("storyPoints", Number(e.target.value))} /></label><label>Assignee<select value={draft.assignee} onChange={(e) => change("assignee", e.target.value)}><option value="">Unassigned</option>{draft.assignee && !people.some((entry) => idOf(entry.user) === draft.assignee) && <option value={draft.assignee}>{issue.assignee?.name || "Former member"} (no longer eligible)</option>}{people.map(({ user }) => <option key={user._id} value={user._id}>{user.name}</option>)}</select></label><label>Sprint<select value={draft.sprintId} onChange={(e) => { const sprintId = e.target.value; const nextStages = project.sprints.find((sprint) => sprint._id === sprintId)?.stages || ["To do", "In progress", "Review", "Done"]; setDraft((current) => ({ ...current, sprintId, workflowStage: current.workflowStage === stages[stages.length - 1] ? nextStages[nextStages.length - 1] : nextStages[0] })); }}><option value="">Backlog</option>{project.sprints.map((sprint) => <option key={sprint._id} value={sprint._id}>{sprint.name}</option>)}</select></label><label>Stage<select value={draft.workflowStage} onChange={(e) => change("workflowStage", e.target.value)}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label></div><label>Labels<input value={draft.labels} onChange={(e) => change("labels", e.target.value)} /></label><label>Description (Markdown)<textarea maxLength={30000} rows={12} value={draft.description} onChange={(e) => change("description", e.target.value)} /></label><label>Acceptance criteria<textarea maxLength={5000} rows={4} value={draft.acceptanceCriteria} onChange={(e) => change("acceptanceCriteria", e.target.value)} /></label><label>Blocked reason<textarea maxLength={1000} value={draft.blockedReason} onChange={(e) => change("blockedReason", e.target.value)} /></label></fieldset>
      <button type="button" className="secondary-btn" onClick={() => setPreview(!preview)}>{preview ? "Hide description preview" : "Preview description"}</button>{(preview || !canEdit) && <MarkdownDescription text={draft.description} />}
      {canEdit && <button className="accent-btn" disabled={busy}>{busy ? "Saving…" : "Save issue"}</button>}
    </form>
    {issue.source?.url && <p><a href={issue.source.url} target="_blank" rel="noreferrer">Original GitHub issue</a></p>}
    {project.permissions.canEdit && <button className="secondary-btn" disabled={busy} onClick={() => save({ archived: !issue.archivedAt })}>{issue.archivedAt ? "Restore issue" : "Archive issue"}</button>}
  </main>;
}
