// Run with the application stopped. Dry-run is the default; never loads model hooks.
require("dotenv").config();
const fs = require("node:fs");
const mongoose = require("mongoose");
const { EJSON } = mongoose.mongo.BSON;
const { planMigration, changeFilter } = require("../utils/projectMigration");

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const backup = args.find((arg) => arg.startsWith("--backup="))?.slice(9);
  const rollback = args.find((arg) => arg.startsWith("--rollback="))?.slice(11);
  if (apply && !backup) throw new Error("--apply requires --backup=<new journal path>");
  if (rollback && apply) throw new Error("Choose apply or rollback, not both");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
  const db = mongoose.connection.db;
  if (rollback) {
    const changes = fs.readFileSync(rollback, "utf8").trim().split("\n").filter(Boolean).map((line) => EJSON.parse(line));
    for (const change of changes.reverse()) {
      if (!["boards", "todos"].includes(change.collection)) throw new Error("Invalid journal collection");
      const update = { ...(Object.keys(change.before).length ? { $set: change.before } : {}), ...(change.absent.length ? { $unset: Object.fromEntries(change.absent.map((key) => [key, ""])) } : {}) };
      const result = await db.collection(change.collection).updateOne(changeFilter(change, true), update);
      if (!result.matchedCount) {
        if (await db.collection(change.collection).findOne(changeFilter(change))) continue;
        throw new Error(`Rollback conflict for ${change.collection}/${change._id}; no subsequent records were changed`);
      }
    }
    console.log(`Rollback checked ${changes.length} records.`); return;
  }
  const boards = await db.collection("boards").find({}).sort({ _id: 1 }).toArray();
  const todos = await db.collection("todos").find({}).sort({ _id: 1 }).toArray();
  const changes = planMigration(boards, todos);
  console.log(JSON.stringify({ dryRun: !apply, boards: boards.length, todos: todos.length, changes: changes.length }));
  if (!apply) return;
  const fd = fs.openSync(backup, "wx", 0o600);
  try {
    for (const change of changes) {
      // Persist recovery data before each write; a failed write can be safely retried/rolled back.
      fs.writeSync(fd, EJSON.stringify(change) + "\n"); fs.fsyncSync(fd);
      const result = await db.collection(change.collection).updateOne(changeFilter(change), { $set: change.after });
      if (!result.matchedCount) throw new Error(`Migration conflict for ${change.collection}/${change._id}. Stop and inspect the journal.`);
    }
    await db.collection("boards").createIndex({ projectKey: 1 }, { unique: true, sparse: true });
    await db.collection("todos").createIndex({ issueKey: 1 }, { unique: true, sparse: true });
    const remaining = planMigration(await db.collection("boards").find({}).toArray(), await db.collection("todos").find({}).toArray());
    if (remaining.length) throw new Error("Verification failed: migration is not yet idempotent");
    console.log("Migration verified; rerun dry-run should report zero changes.");
  } finally { fs.closeSync(fd); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
