const DEFAULT_STAGES = ["To do", "In progress", "Review", "Done"];

function invalid(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function validateId(value, name) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) throw invalid(`Invalid ${name}`);
}

function validateWorkItemInput(body) {
  for (const [field, values] of Object.entries({ priority: ["high", "medium", "low"], workType: ["story", "task", "bug", "spike"] })) {
    if (body[field] !== undefined && !values.includes(body[field])) throw invalid(`Invalid ${field}`);
  }
  for (const [field, limit] of Object.entries({ text: Infinity, workflowStage: 60, acceptanceCriteria: 5000, blockedReason: 1000 })) {
    if (body[field] !== undefined && (typeof body[field] !== "string" || body[field].length > limit || (["text", "workflowStage"].includes(field) && !body[field].trim()))) throw invalid(`Invalid ${field}`);
  }
  if (body.completed !== undefined && typeof body.completed !== "boolean") throw invalid("Completed must be a boolean");
  if (body.storyPoints !== undefined && (typeof body.storyPoints !== "number" || !Number.isFinite(body.storyPoints) || body.storyPoints < 0 || body.storyPoints > 100)) throw invalid("Story points must be between 0 and 100");
  if (body.labels !== undefined && (!Array.isArray(body.labels) || body.labels.length > 12 || body.labels.some((label) => typeof label !== "string" || !label.trim() || label.trim().length > 60))) throw invalid("Provide at most 12 non-empty labels of up to 60 characters");
  if (body.boardId !== undefined) validateId(body.boardId, "board ID");
  if (body.sprintId !== undefined && body.sprintId !== null && body.sprintId !== "") validateId(body.sprintId, "sprint ID");
}

// Always resolve against the destination board, including when moving an issue.
function resolveWorkflow(existing, body, board) {
  const boardChanged = String(existing.board || "") !== String(board._id);
  const sprintId = body.sprintId !== undefined ? body.sprintId || null : boardChanged ? null : existing.sprint || null;
  const sprint = sprintId ? board.sprints.find((item) => String(item._id) === String(sprintId)) : null;
  if (sprintId && !sprint) throw invalid("Sprint does not belong to this board");
  const stages = sprint ? sprint.stages : DEFAULT_STAGES;
  const first = stages[0];
  const done = stages[stages.length - 1];
  const sprintChanged = String(existing.sprint || "") !== String(sprintId || "");
  let stage = body.workflowStage;
  let completed = body.completed ?? Boolean(existing.completed);
  if (stage !== undefined) {
    if (!stages.includes(stage)) throw invalid("Stage does not belong to this workflow");
    if (body.completed !== undefined && body.completed !== (stage === done)) throw invalid("Stage and completion disagree");
    completed = stage === done;
  } else if (completed) {
    stage = done;
  } else {
    stage = !boardChanged && !sprintChanged && stages.includes(existing.workflowStage) && existing.workflowStage !== done ? existing.workflowStage : first;
  }
  return { sprint: sprintId, workflowStage: stage, completed };
}

function validateSprintTransition(board, sprint, status) {
  if (!["planned", "active", "completed"].includes(status)) throw invalid("Invalid sprint status");
  const allowed = { planned: ["active"], active: ["completed"], completed: [] };
  if (status !== sprint.status && !(allowed[sprint.status] || []).includes(status)) throw invalid("Sprints must move from planned to active to completed", 409);
  if (status === "active" && board.sprints.some((item) => String(item._id) !== String(sprint._id) && item.status === "active")) throw invalid("Complete the active sprint before starting another", 409);
}

function validateSprintInput(body, creating = false) {
  for (const [field, limit] of Object.entries({ name: 80, goal: 500 })) {
    if ((creating && field === "name") || body[field] !== undefined) {
      if (typeof body[field] !== "string" || body[field].length > limit || (field === "name" && !body[field].trim())) throw invalid(`Invalid sprint ${field}`);
    }
  }
  if (body.capacity !== undefined && ((typeof body.capacity !== "number" && typeof body.capacity !== "string") || String(body.capacity).trim() === "" || !Number.isFinite(Number(body.capacity)) || Number(body.capacity) < 0 || Number(body.capacity) > 10000)) throw invalid("Capacity must be between 0 and 10000");
  if (creating) {
    if (!body.startDate || !body.endDate || !Number.isFinite(new Date(body.startDate).getTime()) || !Number.isFinite(new Date(body.endDate).getTime()) || new Date(body.endDate) < new Date(body.startDate)) throw invalid("Valid sprint dates are required");
    if (!Array.isArray(body.stages) || body.stages.length < 2 || body.stages.length > 8 || body.stages.some((stage) => typeof stage !== "string" || !stage.trim() || stage.trim().length > 60) || new Set(body.stages.map((stage) => stage.trim())).size !== body.stages.length) throw invalid("Provide 2 to 8 distinct workflow stages of up to 60 characters");
  }
}

function workflowError(res, err) {
  if (err.name === "VersionError") { res.status(409).json({ message: "The board changed. Refresh and try again." }); return true; }
  if (err.status || ["ValidationError", "CastError"].includes(err.name)) {
    res.status(err.status || 400).json({ message: err.status ? err.message : "Invalid work item or sprint data" });
    return true;
  }
  return false;
}

module.exports = { DEFAULT_STAGES, validateId, validateWorkItemInput, resolveWorkflow, validateSprintTransition, validateSprintInput, workflowError };
