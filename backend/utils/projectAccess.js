const Board = require("../models/Board");
const { validateId } = require("./workflow");

const idOf = (value) => String(value?._id || value || "");
function projectRole(board, userId) {
  if (idOf(board.user) === idOf(userId)) return "owner";
  const member = board.members?.find((entry) => idOf(entry.user) === idOf(userId));
  if (member) return member.role;
  return board.sharedWith?.some((entry) => idOf(entry.user) === idOf(userId)) ? "viewer" : null;
}
function accessFilter(userId, mode = "read") {
  if (mode === "owner" || mode === "archive") return { user: userId, ...(mode === "owner" ? { archivedAt: null } : {}) };
  const alternatives = [{ user: userId }, { members: { $elemMatch: { user: userId, role: mode === "write" ? "member" : { $in: ["member", "viewer"] } } } }];
  if (mode === "read") alternatives.push({ "sharedWith.user": userId });
  return { $or: alternatives, ...(mode === "write" ? { archivedAt: null } : {}) };
}
async function findProject(userId, id, mode = "read") {
  validateId(idOf(id), "project ID");
  return Board.findOne({ _id: id, ...accessFilter(userId, mode) });
}
function serializeProject(board, userId) {
  const object = board.toObject ? board.toObject() : { ...board };
  const role = projectRole(board, userId);
  const canEdit = !board.archivedAt && ["owner", "member"].includes(role);
  return { ...object, role, access: role === "owner" ? "owner" : role === "member" ? "member" : "shared", owner: board.user,
    permissions: { canEdit, canManage: role === "owner" && !board.archivedAt, canArchive: role === "owner" },
    notes: role === "owner" ? object.notes : undefined, scratchpad: role === "owner" ? object.scratchpad : undefined,
    invitations: role === "owner" ? object.invitations : undefined,
    sharedWith: role === "owner" ? object.sharedWith : [] };
}
function assertAssignee(board, assignee) {
  if (assignee === null) return;
  validateId(assignee, "assignee ID");
  if (!["owner", "member"].includes(projectRole(board, assignee))) throw Object.assign(new Error("Assignee must be an active project owner or member"), { status: 400 });
}
module.exports = { idOf, projectRole, accessFilter, findProject, serializeProject, assertAssignee };
