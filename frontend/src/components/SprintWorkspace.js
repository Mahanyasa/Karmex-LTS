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
  const sprints = board?.sprints || [];
  const activeSprint = sprints.find((sprint) => sprint._id === selectedId) || sprints.find((sprint) => sprint.status === "active") || sprints[0];

  useEffect(() => { if (activeSprint && !selectedId) setSelectedId(activeSprint._id); }, [activeSprint, selectedId]);

  const sprintTasks = useMemo(() => todos.filter((todo) => String(todo.sprint || "") === String(activeSprint?._id || "")), [todos, activeSprint]);
  const backlog = useMemo(() => todos.filter((todo) => !todo.sprint && !todo.completed), [todos]);
  const points = sprintTasks.reduce((sum, todo) => sum + (Number(todo.storyPoints) || 0), 0);
  const doneStage = activeSprint?.stages?.[activeSprint.stages.length - 1];
  const donePoints = sprintTasks.filter((todo) => todo.completed || todo.workflowStage === doneStage).reduce((sum, todo) => sum + (Number(todo.storyPoints) || 0), 0);

  async function createSprint(event) {
    event.preventDefault();
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
    try {
      const { data } = await api.patch(`/boards/${board._id}/sprints/${activeSprint._id}`, changes);
      onBoardSaved(data);
      notify(changes.status === "active" ? "Sprint started." : changes.status === "completed" ? "Sprint completed." : "Sprint updated.", "success");
    } catch (err) { notify(err.response?.data?.message || "Failed to update sprint", "error"); }
  }

  async function deleteSprint() {
    const approved = await confirm({ title: `Delete ${activeSprint.name}?`, message: "Its work items will return to the backlog.", confirmLabel: "Delete sprint", danger: true });
    if (!approved) return;
    try {
      const { data } = await api.delete(`/boards/${board._id}/sprints/${activeSprint._id}`);
      onBoardSaved(data); setSelectedId(data.sprints[0]?._id || ""); await onTodosChanged(); notify("Sprint deleted.", "success");
    } catch (err) { notify(err.response?.data?.message || "Failed to delete sprint", "error"); }
  }

  async function updateTask(todo, changes) {
    try {
      await api.patch(`/todos/${todo._id}`, changes);
      await onTodosChanged();
      if (selectedTask?._id === todo._id) setSelectedTask((current) => ({ ...current, ...changes, sprint: changes.sprintId ?? current.sprint }));
    } catch (err) { notify(err.response?.data?.message || "Failed to update work item", "error"); }
  }

  if (!canEdit) return <div className="shared-board-notice"><strong>Shared sprint view</strong><span>The board owner controls sprint planning and execution.</span></div>;

  return <div className="sprint-workspace">
    <div className="sprint-commandbar">
      <select value={activeSprint?._id || ""} onChange={(event) => setSelectedId(event.target.value)}><option value="">No sprint selected</option>{sprints.map((sprint) => <option key={sprint._id} value={sprint._id}>{sprint.name} · {sprint.status}</option>)}</select>
      <button type="button" className="secondary-btn" onClick={() => setCreating(!creating)}>{creating ? "Cancel" : "New sprint"}</button>
      {activeSprint && <><button type="button" className="secondary-btn" onClick={() => updateSprint({ status: "active" })} disabled={activeSprint.status === "active"}>Start</button><button type="button" className="secondary-btn" onClick={() => updateSprint({ status: "completed" })} disabled={activeSprint.status === "completed"}>Complete</button><button type="button" className="sprint-delete" onClick={deleteSprint}>Delete</button></>}
    </div>

    {creating && <form className="sprint-form" onSubmit={createSprint}>
      <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Sprint 24" required /></label>
      <label>Start<input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} required /></label>
      <label>End<input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} required /></label>
      <label>Capacity (points)<input type="number" min="0" value={draft.capacity} onChange={(event) => setDraft({ ...draft, capacity: event.target.value })} /></label>
      <label className="wide">Sprint goal<input value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} placeholder="What outcome should this sprint deliver?" /></label>
      <label className="wide">Workflow stages<input value={draft.stages} onChange={(event) => setDraft({ ...draft, stages: event.target.value })} placeholder="To do, In progress, Review, Done" /></label>
      <button type="submit" className="accent-btn" disabled={busy}>Create sprint</button>
    </form>}

    {!activeSprint ? <div className="sprint-empty"><strong>Design your first sprint</strong><span>Choose dates, capacity, a delivery goal, and your own workflow stages.</span></div> : <>
      <div className="sprint-summary"><div><span>Goal</span><strong>{activeSprint.goal || "No goal set"}</strong></div><div><span>Timeline</span><strong>{new Date(activeSprint.startDate).toLocaleDateString()} - {new Date(activeSprint.endDate).toLocaleDateString()}</strong></div><div><span>Committed</span><strong>{points} / {activeSprint.capacity || "∞"} pts</strong></div><div><span>Delivered</span><strong>{donePoints} pts</strong></div></div>
      <div className="sprint-planning-grid">
        <aside className="sprint-backlog"><header><strong>Backlog</strong><span>{backlog.length}</span></header>{backlog.map((todo) => <button type="button" key={todo._id} onClick={() => updateTask(todo, { sprintId: activeSprint._id, workflowStage: activeSprint.stages[0] })}><span>{todo.text}</span><small>Add to sprint +</small></button>)}{!backlog.length && <p>Backlog is clear.</p>}</aside>
        <div className="sprint-kanban">{activeSprint.stages.map((stage) => { const items = sprintTasks.filter((todo) => (todo.workflowStage || activeSprint.stages[0]) === stage); return <section key={stage} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const todo = sprintTasks.find((item) => item._id === event.dataTransfer.getData("text/task")); if (todo) updateTask(todo, { workflowStage: stage, completed: stage === doneStage }); }}><header><strong>{stage}</strong><span>{items.length}</span></header>{items.map((todo) => <article key={todo._id} draggable onDragStart={(event) => event.dataTransfer.setData("text/task", todo._id)} onClick={() => setSelectedTask(todo)} className={todo.blockedReason ? "blocked" : ""}><div><b>{todo.workType || "task"}</b><em>{todo.storyPoints || 0} pts</em></div><strong>{todo.text}</strong>{todo.labels?.length > 0 && <small>{todo.labels.join(" · ")}</small>}{todo.source?.repository && <a href={todo.source.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{todo.source.repository} #{todo.source.issueNumber}</a>}</article>)}</section>; })}</div>
      </div>
    </>}

    {selectedTask && <WorkItemEditor todo={selectedTask} sprint={activeSprint} onClose={() => setSelectedTask(null)} onSave={async (changes) => { await updateTask(selectedTask, changes); setSelectedTask(null); notify("Work item updated.", "success"); }} onBacklog={async () => { await updateTask(selectedTask, { sprintId: null }); setSelectedTask(null); }} />}
  </div>;
}

function WorkItemEditor({ todo, sprint, onClose, onSave, onBacklog }) {
  const [draft, setDraft] = useState({ text: todo.text, workType: todo.workType || "task", storyPoints: todo.storyPoints || 0, priority: todo.priority || "medium", workflowStage: todo.workflowStage || sprint.stages[0], labels: (todo.labels || []).join(", "), acceptanceCriteria: todo.acceptanceCriteria || "", blockedReason: todo.blockedReason || "" });
  return <div className="work-item-backdrop" onMouseDown={onClose}><form className="work-item-editor" onSubmit={(event) => { event.preventDefault(); onSave({ ...draft, labels: draft.labels.split(",").map((label) => label.trim()).filter(Boolean) }); }} onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span className="eyebrow">WORK ITEM</span><h3>Edit delivery details</h3></div><button type="button" onClick={onClose}>×</button></header>
    <label className="wide">Title<input value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} required /></label>
    <div className="work-item-fields"><label>Type<select value={draft.workType} onChange={(event) => setDraft({ ...draft, workType: event.target.value })}><option value="story">Story</option><option value="task">Task</option><option value="bug">Bug</option><option value="spike">Spike</option></select></label><label>Points<input type="number" min="0" max="100" value={draft.storyPoints} onChange={(event) => setDraft({ ...draft, storyPoints: Number(event.target.value) })} /></label><label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label><label>Stage<select value={draft.workflowStage} onChange={(event) => setDraft({ ...draft, workflowStage: event.target.value })}>{sprint.stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label></div>
    <label>Labels<input value={draft.labels} onChange={(event) => setDraft({ ...draft, labels: event.target.value })} placeholder="frontend, api, security" /></label>
    <label>Acceptance criteria<textarea value={draft.acceptanceCriteria} onChange={(event) => setDraft({ ...draft, acceptanceCriteria: event.target.value })} placeholder="Definition of done for this work item" /></label>
    <label>Blocked reason<textarea value={draft.blockedReason} onChange={(event) => setDraft({ ...draft, blockedReason: event.target.value })} placeholder="Leave empty when unblocked" /></label>
    <footer><button type="button" className="secondary-btn" onClick={onBacklog}>Move to backlog</button><button type="submit" className="accent-btn">Save work item</button></footer>
  </form></div>;
}
