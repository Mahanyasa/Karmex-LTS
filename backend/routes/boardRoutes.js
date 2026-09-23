const express = require("express");
const Board = require("../models/Board");
const Todo = require("../models/Todo");
const User = require("../models/User");
const FriendRequest = require("../models/FriendRequest");
const auth = require("../middleware/auth");
const { validateId, validateSprintTransition, validateSprintInput, workflowError } = require("../utils/workflow");
const { accessFilter, findProject, serializeProject, projectRole, idOf } = require("../utils/projectAccess");
const router = express.Router();
router.use(auth);
const publicUser = "name username avatar";
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const route = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Project name or key already exists" });
    if (workflowError(res, err)) return;
    console.error("Project request failed:", err.message);
    res.status(500).json({ message: "Project request failed" });
  }
};
async function requireProject(req, mode = "read") {
  const project = await findProject(req.userId, req.params.id, mode);
  if (!project) throw fail("Project not found or access denied", 404);
  return project;
}
async function present(project, userId) {
  await project.populate([{ path: "user", select: publicUser }, { path: "members.user", select: publicUser }, { path: "sharedWith.user", select: publicUser }, { path: "invitations.recipient", select: publicUser }]);
  return serializeProject(project, userId);
}
async function listProjects(userId) {
  const boards = await Board.find(accessFilter(userId)).populate("user", publicUser).populate("members.user", publicUser).populate("sharedWith.user", publicUser).sort({ createdAt: 1 });
  return boards.map((board) => serializeProject(board, userId));
}

router.get("/invitations", route(async (req, res) => {
  const projects = await Board.find({ archivedAt: null, invitations: { $elemMatch: { recipient: req.userId, status: "pending", expiresAt: { $gt: new Date() } } } }).select("name projectKey invitations user").populate("user", publicUser);
  res.json(projects.flatMap((project) => project.invitations.filter((invite) => idOf(invite.recipient) === req.userId && invite.status === "pending" && invite.expiresAt > new Date()).map((invite) => ({ _id: invite._id, projectId: project._id, projectName: project.name, projectKey: project.projectKey, role: invite.role, expiresAt: invite.expiresAt, owner: project.user }))));
}));

router.get("/", route(async (req, res) => {
  let main = await Board.findOne({ user: req.userId, name: "Main" });
  if (!main) main = await Board.create({ user: req.userId, name: "Main" });
  await Todo.updateMany({ user: req.userId, $or: [{ board: { $exists: false } }, { board: null }] }, { $set: { board: main._id } });
  res.json(await listProjects(req.userId));
}));

router.post("/", route(async (req, res) => {
  if (typeof req.body.name !== "string" || !req.body.name.trim()) throw fail("Project name is required");
  if (req.body.projectKey !== undefined && (typeof req.body.projectKey !== "string" || !/^[A-Z][A-Z0-9]{1,15}$/.test(req.body.projectKey))) throw fail("Project key must be 2–16 uppercase letters or digits, starting with a letter");
  const board = await Board.create({ user: req.userId, name: req.body.name.trim(), ...(req.body.projectKey ? { projectKey: req.body.projectKey } : {}) });
  res.status(201).json(await present(board, req.userId));
}));

router.get("/:id", route(async (req, res) => res.json(await present(await requireProject(req), req.userId))));

router.patch("/:id", route(async (req, res) => {
  const board = await requireProject(req, "archive");
  if (req.body.projectKey !== undefined && req.body.projectKey !== board.projectKey) throw fail("Project keys cannot be changed");
  if (req.body.name !== undefined) {
    if (board.archivedAt) throw fail("Restore the project before renaming it", 409);
    if (typeof req.body.name !== "string" || !req.body.name.trim()) throw fail("Project name is required");
    board.name = req.body.name.trim();
  }
  if (req.body.archived !== undefined) {
    if (typeof req.body.archived !== "boolean") throw fail("Archived must be a boolean");
    board.archivedAt = req.body.archived ? board.archivedAt || new Date() : null;
    if (req.body.archived) board.invitations.forEach((invite) => { if (invite.status === "pending") invite.status = "revoked"; });
  }
  await board.save(); res.json(await present(board, req.userId));
}));

router.post("/:id/invitations", route(async (req, res) => {
  const board = await requireProject(req, "owner");
  if (!["member", "viewer"].includes(req.body.role)) throw fail("Choose member or viewer");
  if (typeof req.body.username !== "string") throw fail("Username is required");
  const recipient = await User.findOne({ username: req.body.username.trim().toLowerCase().replace(/^@/, "") }).select(publicUser);
  if (!recipient) throw fail("No account found with that username", 404);
  if (projectRole(board, recipient._id)) throw fail("This account already has project access", 409);
  if (board.invitations.some((invite) => idOf(invite.recipient) === idOf(recipient._id) && invite.status === "pending" && invite.expiresAt > new Date())) throw fail("An invitation is already pending", 409);
  board.invitations.push({ recipient: recipient._id, role: req.body.role, expiresAt: new Date(Date.now() + 7 * 86400000) });
  await board.save(); res.status(201).json(await present(board, req.userId));
}));

router.patch("/:id/invitations/:invitationId", route(async (req, res) => {
  const { action } = req.body;
  if (!["accept", "decline", "revoke"].includes(action)) throw fail("Invalid invitation action");
  validateId(req.params.invitationId, "invitation ID");
  validateId(req.params.id, "project ID");
  const board = action === "revoke" ? await requireProject(req, "owner") : await Board.findOne({ _id: req.params.id, archivedAt: null, invitations: { $elemMatch: { _id: req.params.invitationId, recipient: req.userId } } });
  if (!board) throw fail("Invitation not found", 404);
  const invite = board.invitations.id(req.params.invitationId);
  if (!invite || (action !== "revoke" && idOf(invite.recipient) !== req.userId)) throw fail("Invitation not found", 404);
  if (invite.status !== "pending" || invite.expiresAt <= new Date()) throw fail("Invitation is expired or no longer pending", 409);
  if (action === "accept") {
    if (!projectRole(board, req.userId)) board.members.push({ user: req.userId, role: invite.role });
    invite.status = "accepted";
  } else invite.status = action === "decline" ? "declined" : "revoked";
  await board.save();
  res.json({ success: true });
}));

router.patch("/:id/members/:userId", route(async (req, res) => {
  const board = await requireProject(req, "owner");
  validateId(req.params.userId, "member ID");
  if (idOf(board.user) === req.params.userId) throw fail("The project owner cannot be demoted");
  if (!["member", "viewer"].includes(req.body.role)) throw fail("Choose member or viewer");
  if (!projectRole(board, req.params.userId)) throw fail("Member not found", 404);
  const entry = board.members.find((member) => idOf(member.user) === req.params.userId);
  if (entry) entry.role = req.body.role;
  else board.members.push({ user: req.params.userId, role: req.body.role });
  await board.save(); res.json(await present(board, req.userId));
}));

async function removeMember(req, res) {
  const board = await requireProject(req, "owner");
  validateId(req.params.userId, "member ID");
  if (idOf(board.user) === req.params.userId) throw fail("The project owner cannot be removed");
  board.members = board.members.filter((member) => idOf(member.user) !== req.params.userId);
  board.sharedWith = board.sharedWith.filter((member) => idOf(member.user) !== req.params.userId);
  board.invitations.forEach((invite) => { if (idOf(invite.recipient) === req.params.userId && invite.status === "pending") invite.status = "revoked"; });
  await board.save(); res.json(await present(board, req.userId));
}
router.delete("/:id/members/:userId", route(removeMember));
router.delete("/:id/share/:userId", route(removeMember));

// Keep existing friend-based read-only sharing compatible.
router.post("/:id/share", route(async (req, res) => {
  const board = await requireProject(req, "owner");
  validateId(req.body.userId, "member ID");
  const friendship = await FriendRequest.findOne({ status: "accepted", $or: [{ requester: req.userId, recipient: req.body.userId }, { requester: req.body.userId, recipient: req.userId }] });
  if (!friendship) throw fail("Boards can only be shared with friends", 403);
  if (!projectRole(board, req.body.userId)) { board.members.push({ user: req.body.userId, role: "viewer" }); board.sharedWith.push({ user: req.body.userId }); }
  await board.save(); res.json(await present(board, req.userId));
}));

for (const kind of ["notes", "scratchpad"]) router.patch(`/:id/${kind}`, route(async (req, res) => {
  const board = await requireProject(req, "owner");
  board[kind] = { ...(kind === "notes" ? { title: String(req.body.title || "").slice(0, 120) } : {}), body: String(req.body.body || "").slice(0, kind === "notes" ? 100000 : 50000), updatedAt: new Date() };
  await board.save(); res.json(await present(board, req.userId));
}));

router.patch("/:id/layout", route(async (req, res) => {
  const board = await requireProject(req, "owner");
  const allowed = new Set(["metrics", "sprints", "calendar", "workspace", "tasks", "upcoming", "progress"]);
  if (!Array.isArray(req.body.layout)) throw fail("Layout must be an array");
  const seen = new Set();
  board.dashboardLayout = req.body.layout.slice(0, 12).map((item, order) => {
    if (!item || !allowed.has(item.id) || seen.has(item.id)) throw fail("Invalid dashboard widget");
    seen.add(item.id);
    return { id: item.id, width: Math.max(3, Math.min(12, Number(item.width) || 6)), height: Math.max(1, Math.min(8, Number(item.height) || 3)), visible: item.visible !== false, order };
  });
  await board.save(); res.json(await present(board, req.userId));
}));

router.post("/:id/sprints", route(async (req, res) => {
  validateSprintInput(req.body, true);
  const board = await requireProject(req, "write");
  board.sprints.push({ name: req.body.name.trim(), goal: (req.body.goal || "").trim(), startDate: req.body.startDate, endDate: req.body.endDate, capacity: Number(req.body.capacity || 0), stages: req.body.stages.map((stage) => stage.trim()) });
  await board.save(); res.status(201).json(await present(board, req.userId));
}));
router.patch("/:id/sprints/:sprintId", route(async (req, res) => {
  validateSprintInput(req.body);
  const board = await requireProject(req, "write");
  const sprint = board.sprints.id(req.params.sprintId);
  if (!sprint) throw fail("Sprint not found", 404);
  if (req.body.status !== undefined) { validateSprintTransition(board, sprint, req.body.status); sprint.status = req.body.status; }
  for (const field of ["name", "goal"]) if (req.body[field] !== undefined) sprint[field] = req.body[field].trim();
  if (req.body.capacity !== undefined) sprint.capacity = Number(req.body.capacity);
  await board.save(); res.json(await present(board, req.userId));
}));
router.delete("/:id/sprints/:sprintId", route(async (req, res) => {
  const board = await requireProject(req, "write");
  const sprint = board.sprints.id(req.params.sprintId);
  if (!sprint) throw fail("Sprint not found", 404);
  sprint.deleteOne(); await board.save();
  await Todo.updateMany({ board: board._id, sprint: req.params.sprintId, completed: true }, { $set: { sprint: null, workflowStage: "Done" } });
  await Todo.updateMany({ board: board._id, sprint: req.params.sprintId, completed: { $ne: true } }, { $set: { sprint: null, workflowStage: "To do" } });
  res.json(await present(board, req.userId));
}));

// Legacy delete clients now archive instead of destroying project history.
router.delete("/:id", route(async (req, res) => {
  const board = await requireProject(req, "archive");
  board.archivedAt = board.archivedAt || new Date();
  board.invitations.forEach((invite) => { if (invite.status === "pending") invite.status = "revoked"; });
  await board.save(); res.json({ archived: true, boards: await listProjects(req.userId) });
}));
module.exports = router;
