import React, { useEffect, useMemo, useState } from "react";
import api from "../api";
import { useNotifications } from "../context/NotificationContext";

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (days) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const freshSprint = () => ({ name: "", goal: "", startDate: today(), endDate: plusDays(13), capacity: 40, stages: "To do, In progress, Review, Done" });

export default function SprintWorkspace({ board, todos, canEdit, onBoardSaved, onTodosChanged }) {
  const { notify, confirm } = useNotifications();
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(freshSprint);
  const [selectedTask, setSelectedTask] = useState(null);
  const [busy, setBusy] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const sprints = board?.sprints || [];
  const activeSprint = sprints.find((sprint) => sprint._id === selectedId) || sprints.find((sprint) => sprint.status === "active") || sprints[0];

  useEffect(() => { setSelectedId(""); setSelectedTask(null); setCreating(false); }, [board?._id]);
  useEffect(() => { if (activeSprint && selectedId !== activeSprint._id) setSelectedId(activeSprint._id); }, [activeSprint, selectedId]);

  const sprintTasks = useMemo(() => todos.filter((todo) => String(todo.sprint || "") === String(activeSprint?._id || "")), [todos, activeSprint]);
  const backlog = useMemo(() => todos.filter((todo) => !todo.sprint && !todo.completed), [todos]);
  const points = sprintTasks.reduce((sum, todo) => sum + (Number(todo.storyPoints) || 0), 0);
  const doneStage = activeSprint?.stages?.[activeSprint.stages.length - 1];
  const donePoints = sprintTasks.filter((todo) => todo.completed || todo.workflowStage === doneStage).reduce((sum, todo) => sum + (Number(todo.storyPoints) || 0), 0);

  async function createSprint(event) {
    event.preventDefault();
    if (!canEdit || busy) return;
    try {
      setBusy(true);
      const { data } = await api.post(`/boards/${board._id}/sprints`, { ...draft, stages: draft.stages.split(",").map((stage) => stage.trim()).filter(Boolean) });
      onBoardSaved(data);
      setSelectedId(data.sprints[data.sprints.length - 1]._id);
      setDraft(freshSprint());
      setCreating(false);
      notify("Sprint created.", "success");
    } catch (err) { notify(err.response?.data?.message || "Failed to create sprint", "error"); }
    finally { setBusy(false); }
  }

  async function updateSprint(changes) {
    if (!canEdit || busy) return;
    try {
      setBusy(true);
      const { data } = await api.patch(`/boards/${board._id}/sprints/${activeSprint._id}`, changes);
      onBoardSaved(data);
      notify(changes.status === "active" ? "Sprint started." : changes.status === "completed" ? "Sprint completed." : "Sprint updated.", "success");
    } catch (err) { notify(err.response?.data?.message || "Failed to update sprint", "error"); }
    finally { setBusy(false); }
  }

  async function deleteSprint() {
    if (!canEdit || busy) return;
    const approved = await confirm({ title: `Delete ${activeSprint.name}?`, message: "Its work items will return to the backlog.", confirmLabel: "Delete sprint", danger: true });
    if (!approved) return;
    try {
      setBusy(true);
      const { data } = await api.delete(`/boards/${board._id}/sprints/${activeSprint._id}`);
      onBoardSaved(data); setSelectedId(data.sprints[0]?._id || ""); await onTodosChanged(); notify("Sprint deleted.", "success");
    } catch (err) { notify(err.response?.data?.message || "Failed to delete sprint", "error"); }
    finally { setBusy(false); }
  }

  async function updateTask(todo, changes, successMessage) {
    if (!canEdit || savingTask) return false;
    setSavingTask(true);
    try {
      const { data } = await api.patch(`/todos/${todo._id}`, changes);
      if (selectedTask?._id === todo._id) setSelectedTask(data);
      try {
        const refreshed = await onTodosChanged();
        if (refreshed === false) throw new Error("Refresh failed");
        if (successMessage) notify(successMessage, "success");
      }
      catch { notify("Work item saved, but the board could not refresh. Reload to see the latest work.", "warning"); }
      return true;
    } catch (err) {
      notify(err.response?.data?.message || "Failed to update work item", "error");
      return false;
    } finally { setSavingTask(false); }
  }

  return <div className="sprint-workspace">
    {!canEdit && <div className="shared-board-notice"><strong>Shared sprint view</strong><span>Read-only access. Select a work item to view its details.</span></div>}
    <div className="sprint-commandbar">
      <select aria-label="Sprint" disabled={busy || savingTask} value={activeSprint?._id || ""} onChange={(event) => { setSelectedId(event.target.value); setSelectedTask(null); }}><option value="">No sprint selected</option>{sprints.map((sprint) => <option key={sprint._id} value={sprint._id}>{sprint.name} · {sprint.status}</option>)}</select>
      {canEdit && <button type="button" className="secondary-btn" disabled={busy} onClick={() => setCreating(!creating)}>{creating ? "Cancel" : "New sprint"}</button>}
      {canEdit && activeSprint && <><button type="button" className="secondary-btn" onClick={() => updateSprint({ status: "active" })} disabled={busy || activeSprint.status !== "planned"}>Start</button><button type="button" className="secondary-btn" onClick={() => updateSprint({ status: "completed" })} disabled={busy || activeSprint.status !== "active"}>Complete</button><button type="button" className="sprint-delete" disabled={busy} onClick={deleteSprint}>Delete</button></>}
    </div>

    {canEdit && creating && <form className="sprint-form" onSubmit={createSprint}>
      <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Sprint 24" required /></label>
      <label>Start<input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} required /></label>
      <label>End<input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} required /></label>
      <label>Capacity (points)<input type="number" min="0" value={draft.capacity} onChange={(event) => setDraft({ ...draft, capacity: event.target.value })} /></label>
      <label className="wide">Sprint goal<input value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} placeholder="What outcome should this sprint deliver?" /></label>
      <label className="wide">Workflow stages<input value={draft.stages} onChange={(event) => setDraft({ ...draft, stages: event.target.value })} placeholder="To do, In progress, Review, Done" /></label>
      <button type="submit" className="accent-btn" disabled={busy}>Create sprint</button>
    </form>}

    {!activeSprint ? <div className="sprint-empty"><strong>{canEdit ? "Design your first sprint" : "No sprints yet"}</strong><span>{canEdit ? "Choose dates, capacity, a delivery goal, and your own workflow stages." : "Sprints will appear here when the owner creates them."}</span></div> : <>
      <div className="sprint-summary"><div><span>Goal</span><strong>{activeSprint.goal || "No goal set"}</strong></div><div><span>Timeline</span><strong>{new Date(activeSprint.startDate).toLocaleDateString()} - {new Date(activeSprint.endDate).toLocaleDateString()}</strong></div><div><span>Committed</span><strong>{points} / {activeSprint.capacity || "∞"} pts</strong></div><div><span>Delivered</span><strong>{donePoints} pts</strong></div></div>
      <div className="sprint-planning-grid">
        <aside className="sprint-backlog"><header><strong>Backlog</strong><span>{backlog.length}</span></header>{backlog.map((todo) => <button type="button" key={todo._id} disabled={savingTask} onClick={() => canEdit ? updateTask(todo, { sprintId: activeSprint._id, workflowStage: activeSprint.stages[0] }) : setSelectedTask(todo)}><span>{todo.text}</span><small>{canEdit ? "Add to sprint +" : "View details"}</small></button>)}{!backlog.length && <p>Backlog is clear.</p>}</aside>
        <div className="sprint-kanban">{activeSprint.stages.map((stage) => { const items = sprintTasks.filter((todo) => (todo.workflowStage || activeSprint.stages[0]) === stage); return <section key={stage} onDragOver={(event) => { if (canEdit) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (!canEdit) return; const todo = sprintTasks.find((item) => item._id === event.dataTransfer.getData("text/task")); if (todo) updateTask(todo, { workflowStage: stage }); }}><header><strong>{stage}</strong><span>{items.length}</span></header>{items.map((todo) => <article key={todo._id} draggable={canEdit && !savingTask} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData("text/task", todo._id); }} className={todo.blockedReason ? "blocked" : ""}><div><b>{todo.workType || "task"}</b><em>{todo.storyPoints || 0} pts</em></div><button type="button" className="work-item-open" onClick={() => setSelectedTask(todo)}><strong>{todo.text}</strong></button>{todo.labels?.length > 0 && <small>{todo.labels.join(" · ")}</small>}{todo.source?.repository && <a href={todo.source.url} target="_blank" rel="noreferrer">{todo.source.repository} #{todo.source.issueNumber}</a>}</article>)}</section>; })}</div>
      </div>
    </>}

    {selectedTask && <WorkItemEditor key={selectedTask._id} todo={selectedTask} sprint={selectedTask.sprint ? activeSprint : null} canEdit={canEdit} saving={savingTask} onClose={() => { if (!savingTask) setSelectedTask(null); }} onSave={async (changes) => { if (await updateTask(selectedTask, changes, "Work item updated.")) setSelectedTask(null); }} onBacklog={async () => { if (await updateTask(selectedTask, { sprintId: null })) setSelectedTask(null); }} />}
  </div>;
}

function WorkItemEditor({ todo, sprint, canEdit, saving, onClose, onSave, onBacklog }) {
  const stages = sprint?.stages || ["To do", "In progress", "Review", "Done"];
  const [draft, setDraft] = useState({ text: todo.text, workType: todo.workType || "task", storyPoints: todo.storyPoints || 0, priority: todo.priority || "medium", workflowStage: todo.workflowStage || stages[0], labels: (todo.labels || []).join(", "), acceptanceCriteria: todo.acceptanceCriteria || "", blockedReason: todo.blockedReason || "" });
  return <div className="work-item-backdrop" onMouseDown={onClose}><form role="dialog" aria-modal="true" aria-label="Work item details" className="work-item-editor" onSubmit={(event) => { event.preventDefault(); if (canEdit && !saving) onSave({ ...draft, labels: draft.labels.split(",").map((label) => label.trim()).filter(Boolean) }); }} onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span className="eyebrow">WORK ITEM</span><h3>{canEdit ? "Edit delivery details" : "Delivery details (read-only)"}</h3></div><button type="button" aria-label="Close work item" disabled={saving} onClick={onClose}>×</button></header>
    <fieldset disabled={!canEdit || saving} className="work-item-inputs">
    <label className="wide">Title<input value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} required /></label>
    <div className="work-item-fields"><label>Type<select value={draft.workType} onChange={(event) => setDraft({ ...draft, workType: event.target.value })}><option value="story">Story</option><option value="task">Task</option><option value="bug">Bug</option><option value="spike">Spike</option></select></label><label>Points<input type="number" min="0" max="100" value={draft.storyPoints} onChange={(event) => setDraft({ ...draft, storyPoints: Number(event.target.value) })} /></label><label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label><label>Stage<select value={draft.workflowStage} onChange={(event) => setDraft({ ...draft, workflowStage: event.target.value })}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label></div>
    <label>Labels<input value={draft.labels} onChange={(event) => setDraft({ ...draft, labels: event.target.value })} placeholder="frontend, api, security" /></label>
    <label>Acceptance criteria<textarea value={draft.acceptanceCriteria} onChange={(event) => setDraft({ ...draft, acceptanceCriteria: event.target.value })} placeholder="Definition of done for this work item" /></label>
    <label>Blocked reason<textarea value={draft.blockedReason} onChange={(event) => setDraft({ ...draft, blockedReason: event.target.value })} placeholder="Leave empty when unblocked" /></label>
    </fieldset>
    {canEdit && <footer><button type="button" className="secondary-btn" disabled={saving} onClick={onBacklog}>Move to backlog</button><button type="submit" className="accent-btn" disabled={saving}>{saving ? "Saving..." : "Save work item"}</button></footer>}
  </form></div>;
}
