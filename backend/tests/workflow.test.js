const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Board = require("../models/Board");
const Todo = require("../models/Todo");
const microsoftCalendar = require("../utils/microsoftCalendar");
const todoRouter = require("../routes/todoRoutes");
const boardRouter = require("../routes/boardRoutes");
const { resolveWorkflow, validateWorkItemInput, validateSprintTransition } = require("../utils/workflow");

const owner = "111111111111111111111111";
const viewer = "222222222222222222222222";
const boardId = "333333333333333333333333";
const sprintId = "444444444444444444444444";
const todoId = "555555555555555555555555";
const otherId = "666666666666666666666666";
const stages = ["Ready", "Building", "Review", "Shipped"];
const board = () => new Board({ _id: boardId, user: owner, name: "Project", sharedWith: [{ user: viewer }], sprints: [{ _id: sprintId, name: "Sprint 1", startDate: new Date(), endDate: new Date(), stages }] });
const item = () => ({ _id: todoId, user: owner, board: boardId, sprint: sprintId, workflowStage: "Building", completed: false });
const originals = { boardFind: Board.findOne, todoFind: Todo.findOne, update: Todo.findOneAndUpdate, byId: Todo.findById, find: Todo.find, create: Todo.create, sync: microsoftCalendar.syncReminder, collectionUpdate: Board.collection.updateOne };
afterEach(() => {
  Board.findOne = originals.boardFind; Todo.findOne = originals.todoFind; Todo.findOneAndUpdate = originals.update;
  Todo.findById = originals.byId; Todo.find = originals.find; Todo.create = originals.create;
  microsoftCalendar.syncReminder = originals.sync; Board.collection.updateOne = originals.collectionUpdate;
});
function handler(router, method, path) { return router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route.stack[0].handle; }
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } }; }
async function patch(body, userId = owner) {
  const res = response();
  await handler(todoRouter, "patch", "/:id")({ userId, params: { id: todoId }, body }, res);
  return res;
}
function mockUpdates() {
  let current = item();
  let writes = 0;
  Board.findOne = async (query) => query.user === owner && String(query._id) === boardId ? board() : null;
  Todo.findOne = async (query) => query.user === owner ? { ...current } : null;
  Todo.findOneAndUpdate = async (query, updates, options) => {
    assert.equal(query.user, owner);
    assert.equal(options.runValidators, true);
    current = { ...current, ...updates }; writes++;
    return current;
  };
  Todo.findById = async () => current;
  microsoftCalendar.syncReminder = async () => {};
  return { writes: () => writes, current: () => current };
}

test("stage-only updates complete and reopen work through the actual route", async () => {
  mockUpdates();
  let result = await patch({ workflowStage: "Shipped" });
  assert.equal(result.statusCode, 200); assert.equal(result.body.completed, true);
  result = await patch({ workflowStage: "Review" });
  assert.equal(result.body.completed, false); assert.equal(result.body.workflowStage, "Review");
});

test("completion toggles use custom first/final stages and sync the calendar", async () => {
  mockUpdates(); let syncs = 0;
  microsoftCalendar.syncReminder = async () => { syncs++; };
  assert.equal((await patch({ completed: true })).body.workflowStage, "Shipped");
  assert.equal((await patch({ completed: false })).body.workflowStage, "Ready");
  await patch({ workflowStage: "Shipped" });
  assert.equal(syncs, 3);
});

test("invalid stages, contradictory completion, and foreign sprints never write", async () => {
  const mock = mockUpdates();
  for (const body of [{ workflowStage: "Unknown" }, { workflowStage: "Shipped", completed: false }, { sprintId: otherId }]) assert.equal((await patch(body)).statusCode, 400);
  assert.equal(mock.writes(), 0);
});

test("invalid work item inputs are rejected before writing", async () => {
  const mock = mockUpdates();
  for (const body of [{ workType: "other" }, { priority: "critical" }, { storyPoints: -1 }, { storyPoints: 101 }, { storyPoints: "3" }, { completed: "false" }, { labels: "api" }, { labels: [{}] }, { labels: [" "] }, { text: " " }, { boardId: null }, { sprintId: {} }]) assert.equal((await patch(body)).statusCode, 400, JSON.stringify(body));
  assert.equal(mock.writes(), 0);
});

test("shared viewers cannot patch work items or mutate sprints", async () => {
  const mock = mockUpdates();
  assert.equal((await patch({ completed: true }, viewer)).statusCode, 404);
  for (const method of ["patch", "delete"]) {
    const res = response();
    await handler(boardRouter, method, "/:id/sprints/:sprintId")({ userId: viewer, params: { id: boardId, sprintId }, body: { status: "active" } }, res);
    assert.equal(res.statusCode, 404);
  }
  const res = response();
  await handler(boardRouter, "post", "/:id/sprints")({ userId: viewer, params: { id: boardId }, body: { name: "Sprint", startDate: "2026-09-23", endDate: "2026-10-07", stages } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(mock.writes(), 0);
});

test("shared viewers can read sprint work but outsiders cannot", async () => {
  Board.findOne = async (query) => query.$or?.[1]?.["sharedWith.user"] === viewer ? board() : null;
  Todo.find = (query) => { assert.equal(String(query.board), boardId); return { sort: async () => [item()] }; };
  const get = handler(todoRouter, "get", "/");
  const visible = response();
  await get({ userId: viewer, query: { boardId } }, visible);
  assert.equal(visible.statusCode, 200); assert.equal(visible.body[0].sprint, sprintId);
  const hidden = response();
  await get({ userId: otherId, query: { boardId } }, hidden);
  assert.equal(hidden.statusCode, 404);
});

test("moving boards clears old sprint and rejects an explicit foreign sprint", async () => {
  const mock = mockUpdates();
  Board.findOne = async (query) => query.user === owner ? { _id: query._id, sprints: [] } : null;
  assert.equal((await patch({ boardId: otherId, sprintId })).statusCode, 400);
  assert.equal(mock.writes(), 0);
  const moved = await patch({ boardId: otherId });
  assert.equal(moved.body.sprint, null); assert.equal(moved.body.workflowStage, "To do");
});

test("returning completed work to backlog preserves completion", async () => {
  mockUpdates(); await patch({ completed: true });
  const result = await patch({ sprintId: null });
  assert.equal(result.body.sprint, null); assert.equal(result.body.completed, true); assert.equal(result.body.workflowStage, "Done");
});

test("manual creation validates supplied agile fields and sprint membership", async () => {
  mockUpdates(); let creates = 0;
  Todo.create = async () => { creates++; throw new Error("Must not create"); };
  const res = response();
  await handler(todoRouter, "post", "/")({ userId: owner, body: { boardId, text: "Task", reminderDateTime: "2026-09-23T10:00:00Z", sprintId: otherId } }, res);
  assert.equal(res.statusCode, 400); assert.equal(creates, 0);
});

test("sprint starts conflict without silently resetting the active sprint", async () => {
  const value = board(); let saves = 0;
  value.sprints.push({ _id: otherId, name: "Other", startDate: new Date(), endDate: new Date(), status: "active" });
  value.save = async () => { saves++; };
  Board.findOne = async () => value;
  const res = response();
  await handler(boardRouter, "patch", "/:id/sprints/:sprintId")({ userId: owner, params: { id: boardId, sprintId }, body: { status: "active" } }, res);
  assert.equal(res.statusCode, 409); assert.equal(saves, 0); assert.equal(value.sprints.id(otherId).status, "active");
});

test("sprint lifecycle permits only planned to active to completed, with idempotent retries", () => {
  const value = board(); const sprint = value.sprints[0];
  assert.throws(() => validateSprintTransition(value, sprint, "completed"), { status: 409 });
  validateSprintTransition(value, sprint, "active"); sprint.status = "active";
  validateSprintTransition(value, sprint, "active");
  assert.throws(() => validateSprintTransition(value, sprint, "planned"), { status: 409 });
  validateSprintTransition(value, sprint, "completed"); sprint.status = "completed";
  assert.throws(() => validateSprintTransition(value, sprint, "active"), { status: 409 });
  assert.throws(() => validateSprintTransition(value, sprint, "invalid"), { status: 400 });
});

test("simultaneous sprint starts use versioned saves so only one succeeds", async () => {
  const snapshot = board().toObject(); snapshot.__v = 0;
  snapshot.sprints.push({ _id: otherId, name: "Other", startDate: new Date(), endDate: new Date(), status: "planned", stages });
  const first = Board.hydrate(snapshot); const second = Board.hydrate(snapshot);
  let version = 0;
  Board.collection.updateOne = async (filter, update) => {
    assert.equal(update.$inc.__v, 1);
    if (filter.__v !== version) return { matchedCount: 0 };
    version++; return { matchedCount: 1 };
  };
  first.sprints[0].status = "active";
  second.sprints[1].status = "active";
  const results = await Promise.allSettled([first.save(), second.save()]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.name, "VersionError");
});

test("sprint route reports concurrent save conflicts as 409", async () => {
  const value = board(); value.save = async () => { throw Object.assign(new Error("stale"), { name: "VersionError" }); };
  Board.findOne = async () => value;
  const res = response();
  await handler(boardRouter, "patch", "/:id/sprints/:sprintId")({ userId: owner, params: { id: boardId, sprintId }, body: { status: "active" } }, res);
  assert.equal(res.statusCode, 409);
});

test("sprint creation rejects invalid stage arrays and capacity", async () => {
  const create = handler(boardRouter, "post", "/:id/sprints");
  for (const changes of [{ stages: "Ready,Done" }, { stages: ["Ready", "Ready"] }, { capacity: -2 }]) {
    const res = response();
    await create({ userId: owner, params: { id: boardId }, body: { name: "Sprint", startDate: "2026-09-23", endDate: "2026-10-07", stages, ...changes } }, res);
    assert.equal(res.statusCode, 400);
  }
});

test("workflow normalization handles old inconsistent completion records", () => {
  const completed = resolveWorkflow({ ...item(), completed: true }, {}, board());
  assert.equal(completed.workflowStage, "Shipped");
  assert.throws(() => validateWorkItemInput({ storyPoints: NaN }), { status: 400 });
});
