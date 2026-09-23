const express = require("express");
const Board = require("../models/Board");
const Todo = require("../models/Todo");
const { accessFilter, findProject, serializeProject } = require("../utils/projectAccess");
const { validateId, workflowError } = require("../utils/workflow");
const router = express.Router();
const populatePeople = (query) => query.populate("creator reporter assignee", "name username avatar");
const fail = (message) => Object.assign(new Error(message), { status: 400 });
const handle = (fn) => async (req, res) => { try { await fn(req, res); } catch (err) { if (!workflowError(res, err)) { console.error("Issue request failed:", err.message); res.status(500).json({ message: "Issue request failed" }); } } };

router.get("/search", handle(async (req, res) => {
  const { boardId, q, assignee, sprint, workType, priority, label, blocked, mine, completed, archived } = req.query;
  const page = Number(req.query.page || 1), pageSize = Number(req.query.pageSize || 25);
  if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw fail("Invalid pagination");
  let ids;
  if (boardId) { const project = await findProject(req.userId, boardId); if (!project) return res.status(404).json({ message: "Project not found" }); ids = [project._id]; }
  else ids = (await Board.find({ ...accessFilter(req.userId), archivedAt: null }).select("_id")).map((project) => project._id);
  const filter = { board: { $in: ids }, archivedAt: archived === "true" ? { $ne: null } : null };
  if (q !== undefined) {
    if (typeof q !== "string" || q.length > 100) throw fail("Search must be at most 100 characters");
    const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ issueKey: { $regex: escaped, $options: "i" } }, { text: { $regex: escaped, $options: "i" } }];
  }
  if (mine === "true") filter.assignee = req.userId;
  else if (assignee) { if (assignee !== "unassigned") validateId(assignee, "assignee ID"); filter.assignee = assignee === "unassigned" ? null : assignee; }
  if (sprint) { if (sprint !== "backlog") validateId(sprint, "sprint ID"); filter.sprint = sprint === "backlog" ? null : sprint; }
  if (workType) { if (!["task", "story", "bug", "spike"].includes(workType)) throw fail("Invalid work type"); filter.workType = workType; }
  if (priority) { if (!["high", "medium", "low"].includes(priority)) throw fail("Invalid priority"); filter.priority = priority; }
  if (label) { if (typeof label !== "string" || label.length > 60) throw fail("Invalid label"); filter.labels = label; }
  if (blocked === "true") filter.blockedReason = { $exists: true, $nin: ["", null] };
  if (completed === "true" || completed === "false") filter.completed = completed === "true";
  const [items, total] = await Promise.all([populatePeople(Todo.find(filter)).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize), Todo.countDocuments(filter)]);
  res.json({ items, total, page, pageSize });
}));

router.get("/by-key/:key", handle(async (req, res) => {
  if (!/^[A-Z][A-Z0-9]{1,15}-[1-9]\d*$/.test(req.params.key)) return res.status(404).json({ message: "Issue not found" });
  const issue = await populatePeople(Todo.findOne({ issueKey: req.params.key }));
  if (!issue) return res.status(404).json({ message: "Issue not found" });
  const board = await findProject(req.userId, issue.board);
  if (!board) return res.status(404).json({ message: "Issue not found" });
  await board.populate([{ path: "user", select: "name username avatar" }, { path: "members.user", select: "name username avatar" }]);
  res.json({ issue, project: serializeProject(board, req.userId) });
}));
module.exports = router;
