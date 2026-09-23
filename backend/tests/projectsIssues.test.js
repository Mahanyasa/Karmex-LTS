const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Board = require("../models/Board");
const Todo = require("../models/Todo");
const User = require("../models/User");
const calendar = require("../utils/microsoftCalendar");
const projects = require("../routes/boardRoutes");
const issues = require("../routes/issueRoutes");
const todos = require("../routes/todoRoutes");
const { matches, query } = require("./projectTestHelpers");
const { accessFilter, projectRole, serializeProject } = require("../utils/projectAccess");
const { planMigration } = require("../utils/projectMigration");
const ids = Array.from({ length: 8 }, (_, i) => String(i + 1).repeat(24));
const [owner, member, viewer, outsider, projectId, todoId, invitationId, secondId] = ids;
const originals = { boardFind: Board.findOne, boardList: Board.find, boardById: Board.findById, boardUpdate: Board.findOneAndUpdate, userFind: User.findOne, todoFind: Todo.findOne, todoUpdate: Todo.findOneAndUpdate, todoById: Todo.findById, todoList: Todo.find, count: Todo.countDocuments, sync: calendar.syncReminder };
afterEach(() => { Board.findOne = originals.boardFind; Board.find = originals.boardList; Board.findById = originals.boardById; Board.findOneAndUpdate = originals.boardUpdate; User.findOne = originals.userFind; Todo.findOne = originals.todoFind; Todo.findOneAndUpdate = originals.todoUpdate; Todo.findById = originals.todoById; Todo.find = originals.todoList; Todo.countDocuments = originals.count; calendar.syncReminder = originals.sync; });
function project(extra = {}) {
  const board = new Board({ _id: projectId, user: owner, name: "Karmex", projectKey: "KAR", members: [{ user: member, role: "member" }, { user: viewer, role: "viewer" }], ...extra });
  board.save = async () => board;
  board.populate = async () => board;
  return board;
}
function mockProject(board) { Board.findOne = (filter) => query(matches(board, filter) ? board : null); }
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
async function call(router, method, path, { userId = owner, body = {}, params = {}, query: paramsQuery = {} } = {}) {
  const res = response();
  await router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route.stack[0].handle({ userId, body, params: { id: projectId, ...params }, query: paramsQuery }, res);
  return res;
}

test("permission matrix includes legacy viewers and rejects archived writes", () => {
  const board = project({ sharedWith: [{ user: outsider }] });
  for (const [user, role, write] of [[owner, "owner", true], [member, "member", true], [viewer, "viewer", false], [outsider, "viewer", false]]) {
    assert.equal(projectRole(board, user), role);
    assert.equal(matches(board, accessFilter(user, "read")), true);
    assert.equal(matches(board, accessFilter(user, "write")), write);
    assert.equal(matches(board, accessFilter(user, "owner")), user === owner);
  }
  board.archivedAt = new Date();
  assert.equal(matches(board, accessFilter(owner, "write")), false);
  assert.equal(matches(board, accessFilter(owner, "archive")), true);
});

test("member responses hide owner notes and invitations", () => {
  const board = project({ notes: { body: "private" }, scratchpad: { body: "private" }, invitations: [{ recipient: outsider, role: "member", expiresAt: new Date() }] });
  const result = serializeProject(board, member);
  assert.equal(result.permissions.canEdit, true); assert.equal(result.permissions.canManage, false);
  assert.equal(result.notes, undefined); assert.equal(result.scratchpad, undefined); assert.equal(result.invitations, undefined);
});

test("only an owner can invite; invitations expire and cannot grant ownership", async () => {
  const board = project(); mockProject(board);
  User.findOne = () => query({ _id: outsider, username: "dev" });
  assert.equal((await call(projects, "post", "/:id/invitations", { userId: member, body: { username: "dev", role: "member" } })).statusCode, 404);
  assert.equal((await call(projects, "post", "/:id/invitations", { body: { username: "dev", role: "owner" } })).statusCode, 400);
  const result = await call(projects, "post", "/:id/invitations", { body: { username: "dev", role: "member" } });
  assert.equal(result.statusCode, 201); assert.equal(board.invitations.length, 1);
  assert.ok(board.invitations[0].expiresAt > new Date());
  assert.equal((await call(projects, "post", "/:id/invitations", { body: { username: "dev", role: "viewer" } })).statusCode, 409);
});

test("only the intended recipient can accept, and acceptance cannot be replayed", async () => {
  const board = project({ invitations: [{ _id: invitationId, recipient: outsider, role: "member", expiresAt: new Date(Date.now() + 60000) }] }); mockProject(board);
  const request = { params: { invitationId }, body: { action: "accept" } };
  assert.equal((await call(projects, "patch", "/:id/invitations/:invitationId", { ...request, userId: viewer })).statusCode, 404);
  assert.equal((await call(projects, "patch", "/:id/invitations/:invitationId", { ...request, userId: outsider })).statusCode, 200);
  assert.equal(projectRole(board, outsider), "member");
  assert.equal((await call(projects, "patch", "/:id/invitations/:invitationId", { ...request, userId: outsider })).statusCode, 409);
  assert.equal(board.members.filter((entry) => String(entry.user) === outsider).length, 1);
});

test("expired or revoked invitations cannot restore membership", async () => {
  for (const invite of [{ status: "pending", expiresAt: new Date(0) }, { status: "revoked", expiresAt: new Date(Date.now() + 60000) }]) {
    const board = project({ invitations: [{ _id: invitationId, recipient: outsider, role: "member", ...invite }] }); mockProject(board);
    assert.equal((await call(projects, "patch", "/:id/invitations/:invitationId", { userId: outsider, params: { invitationId }, body: { action: "accept" } })).statusCode, 409);
    assert.equal(projectRole(board, outsider), null);
  }
});

test("removal clears both legacy and team access and revokes pending invitations", async () => {
  const board = project({ sharedWith: [{ user: member }], invitations: [{ recipient: member, role: "member", expiresAt: new Date(Date.now() + 60000) }] }); mockProject(board);
  assert.equal((await call(projects, "delete", "/:id/members/:userId", { params: { userId: owner } })).statusCode, 400);
  assert.equal((await call(projects, "delete", "/:id/members/:userId", { params: { userId: member } })).statusCode, 200);
  assert.equal(projectRole(board, member), null); assert.equal(board.invitations[0].status, "revoked");
  assert.equal(matches(board, accessFilter(member)), false);
});

test("archive and restore are owner-only and retain sprint history", async () => {
  const board = project({ sprints: [{ name: "Sprint", startDate: new Date(), endDate: new Date() }] }); mockProject(board);
  assert.equal((await call(projects, "patch", "/:id", { userId: member, body: { archived: true } })).statusCode, 404);
  assert.equal((await call(projects, "patch", "/:id", { body: { archived: true } })).statusCode, 200);
  assert.ok(board.archivedAt); assert.equal(board.sprints.length, 1);
  assert.equal((await call(projects, "patch", "/:id", { body: { archived: false } })).statusCode, 200);
  assert.equal(board.archivedAt, null);
});

test("a member edits another creator's issue, while removed creators and viewers cannot", async () => {
  const board = project(); mockProject(board);
  let issue = { _id: todoId, user: outsider, creator: outsider, reporter: outsider, board: projectId, completed: false, workflowStage: "To do", issueKey: "KAR-1" }, writes = 0;
  Todo.findOne = async () => ({ ...issue });
  Todo.findOneAndUpdate = async (filter, updates) => { assert.equal(String(filter.board), projectId); issue = { ...issue, ...updates }; writes++; return issue; };
  Todo.findById = async () => issue;
  calendar.syncReminder = async (userId) => assert.equal(userId, outsider);
  assert.equal((await call(todos, "patch", "/:id", { userId: member, params: { id: todoId }, body: { completed: true } })).statusCode, 200);
  for (const userId of [viewer, outsider]) assert.equal((await call(todos, "patch", "/:id", { userId, params: { id: todoId }, body: { completed: false } })).statusCode, 404);
  assert.equal(writes, 1); assert.equal(issue.creator, outsider); assert.equal(issue.issueKey, "KAR-1");
});

test("assignment rejects outsiders and viewers without changing creator/reporter", async () => {
  const board = project(); mockProject(board);
  let issue = { _id: todoId, board: projectId, user: owner, creator: owner, reporter: owner, completed: false, workflowStage: "To do" };
  Todo.findOne = async () => issue;
  Todo.findOneAndUpdate = async (_, updates) => (issue = { ...issue, ...updates });
  Todo.findById = async () => issue;
  for (const assignee of [outsider, viewer]) assert.equal((await call(todos, "patch", "/:id", { userId: member, params: { id: todoId }, body: { assignee } })).statusCode, 400);
  const result = await call(todos, "patch", "/:id", { userId: member, params: { id: todoId }, body: { assignee: member, creator: member, reporter: member } });
  assert.equal(result.statusCode, 200); assert.equal(issue.assignee, member); assert.equal(issue.creator, owner); assert.equal(issue.reporter, owner);
});

test("atomic issue allocation gives concurrent creators unique stable IDs", async () => {
  const board = project(); let sequence = 0;
  Board.findById = async () => board;
  Board.findOneAndUpdate = async (filter, update) => { assert.equal(String(filter._id), projectId); assert.equal(update.$inc.issueSequence, 1); return { projectKey: "KAR", issueSequence: ++sequence }; };
  const create = () => new Todo({ user: member, board: projectId, text: "Work", createdForDate: "2026-09-23" });
  const values = Array.from({ length: 15 }, create);
  await Promise.all(values.map((value) => value.validate()));
  assert.equal(new Set(values.map((value) => value.issueKey)).size, 15);
  const first = values[0].issueKey; values[0].text = "Edited"; await values[0].validate();
  assert.equal(values[0].issueKey, first); assert.equal(sequence, 15);
  assert.equal(String(values[0].reporter), member);
});

test("permanent issue routes hide issues from non-members", async () => {
  const board = project(); mockProject(board);
  Todo.findOne = () => query({ _id: todoId, issueKey: "KAR-1", board: projectId });
  assert.equal((await call(issues, "get", "/by-key/:key", { userId: outsider, params: { key: "KAR-1" } })).statusCode, 404);
  assert.equal((await call(issues, "get", "/by-key/:key", { userId: viewer, params: { key: "KAR-1" } })).statusCode, 200);
});

test("My Work and filters constrain queries to accessible active projects", async () => {
  const board = project(); let filter;
  Board.find = (search) => { assert.equal(search.archivedAt, null); assert.equal(matches(board, search), true); return query([{ _id: projectId }]); };
  Todo.find = (search) => { filter = search; return query([]); };
  Todo.countDocuments = async () => 0;
  const result = await call(issues, "get", "/search", { userId: member, query: { mine: "true", q: "[test]", label: "api", blocked: "true", pageSize: "10", workType: "bug" } });
  assert.equal(result.statusCode, 200); assert.deepEqual(filter.board.$in, [projectId]); assert.equal(filter.assignee, member); assert.equal(filter.archivedAt, null); assert.equal(filter.labels, "api"); assert.equal(filter.workType, "bug"); assert.equal(filter.$or[0].issueKey.$regex, "\\[test\\]");
  assert.equal((await call(issues, "get", "/search", { query: { pageSize: "1000" } })).statusCode, 400);
});

test("migration is repeatable and preserves ownership, source links, sprints, and explicit roles", () => {
  const O = (value) => new mongoose.Types.ObjectId(value);
  const board = { _id: O(projectId), user: O(owner), name: "Karmex", sharedWith: [{ user: O(viewer) }, { user: O(member) }], members: [{ user: O(member), role: "member" }], sprints: [{ _id: O(secondId), name: "Sprint" }] };
  const issue = { _id: O(todoId), user: O(owner), board: O(projectId), sprint: O(secondId), text: "Legacy work", source: { url: "https://github.com/example/repo/issues/1" } };
  const plan = planMigration([board], [issue]);
  for (const change of plan) Object.assign(change.collection === "boards" ? board : issue, change.after);
  assert.equal(planMigration([board], [issue]).length, 0);
  assert.equal(String(issue.user), owner); assert.equal(String(issue.reporter), owner); assert.equal(String(issue.sprint), secondId); assert.equal(board.sprints.length, 1);
  assert.equal(issue.source.url, "https://github.com/example/repo/issues/1");
  assert.equal(board.members.find((entry) => String(entry.user) === viewer).role, "viewer");
  assert.equal(board.members.find((entry) => String(entry.user) === member).role, "member");
  assert.equal(issue.issueKey, `${board.projectKey}-1`);
});

test("migration aborts on orphan tasks before producing writes", () => {
  assert.throws(() => planMigration([], [{ _id: todoId, user: owner, board: projectId }]), /no valid board/);
});
