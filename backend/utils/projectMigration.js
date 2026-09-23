const id = (value) => String(value?._id || value);
function planMigration(boards, todos) {
  const changes = [], projects = new Map(), keys = new Set();
  for (const board of boards) {
    const projectKey = board.projectKey || `${(board.name || "PRJ").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "PRJ"}${id(board._id).slice(-8).toUpperCase()}`;
    if (keys.has(projectKey)) throw new Error(`Duplicate project key: ${projectKey}`);
    keys.add(projectKey);
    const members = new Map((board.members || []).map((member) => [id(member.user), member]));
    for (const share of board.sharedWith || []) if (!members.has(id(share.user)) && id(share.user) !== id(board.user)) members.set(id(share.user), { user: share.user, role: "viewer", joinedAt: share.sharedAt || board.createdAt || new Date(0) });
    projects.set(id(board._id), { board, projectKey, members: [...members.values()], sequence: Math.max(board.issueSequence || 0, ...todos.filter((todo) => id(todo.board) === id(board._id)).map((todo) => todo.issueNumber || 0)) });
  }
  const issueKeys = new Set(todos.filter((todo) => todo.issueKey).map((todo) => todo.issueKey));
  if (issueKeys.size !== todos.filter((todo) => todo.issueKey).length) throw new Error("Duplicate existing issue keys; resolve before migration");
  const add = (collection, document, values) => {
    const set = {};
    for (const [key, value] of Object.entries(values)) if (JSON.stringify(document[key]) !== JSON.stringify(value)) set[key] = value;
    if (!Object.keys(set).length) return;
    const before = {}, absent = [];
    for (const key of Object.keys(set)) { if (Object.prototype.hasOwnProperty.call(document, key)) before[key] = document[key]; else absent.push(key); }
    changes.push({ collection, _id: document._id, before, absent, after: set, updatedAt: document.updatedAt });
  };
  for (const todo of todos) {
    const project = projects.get(id(todo.board));
    if (!project) throw new Error(`Issue ${id(todo._id)} has no valid board. Repair its board association before migration.`);
    const values = { creator: todo.creator || todo.user, reporter: todo.reporter || todo.user };
    if (todo.assignee === undefined) values.assignee = null;
    if (todo.archivedAt === undefined) values.archivedAt = null;
    if (todo.description === undefined) values.description = "";
    if (!todo.issueKey) {
      values.issueNumber = ++project.sequence;
      values.issueKey = `${project.projectKey}-${values.issueNumber}`;
      if (issueKeys.has(values.issueKey)) throw new Error(`Duplicate issue key: ${values.issueKey}`);
      issueKeys.add(values.issueKey);
    }
    add("todos", todo, values);
  }
  for (const { board, projectKey, members, sequence } of projects.values()) {
    const values = { projectKey, members, issueSequence: sequence };
    if (board.archivedAt === undefined) values.archivedAt = null;
    add("boards", board, values);
  }
  return changes;
}

function changeFilter(change, rollback = false) {
  const filter = { _id: change._id, ...(rollback ? change.after : change.before) };
  if (!rollback) for (const key of change.absent) filter[key] = { $exists: false };
  if (change.updatedAt) filter.updatedAt = change.updatedAt;
  return filter;
}
module.exports = { planMigration, changeFilter };
