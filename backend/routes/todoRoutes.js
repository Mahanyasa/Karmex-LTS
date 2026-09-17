const express = require("express");
const Todo = require("../models/Todo");
const User = require("../models/User");
const auth = require("../middleware/auth");
const { parseDictation, organizeTasks } = require("../utils/organizer");
const {
  createReminderEvent,
  deleteReminderEvent,
} = require("../utils/googleCalendar");

// Best-effort: create a Calendar reminder if the user has connected Google.
// Never blocks/throws the main request if this fails.
async function maybeCreateReminder(userId, todo) {
  try {
    const user = await User.findById(userId);
    if (!user?.googleConnected) return;
    const eventId = await createReminderEvent(user, todo);
    if (eventId) {
      await Todo.findByIdAndUpdate(todo._id, { googleEventId: eventId });
    }
  } catch (err) {
    console.error("[google] Failed to create reminder:", err.message);
  }
}

const router = express.Router();
router.use(auth);

function todayBucket() {
  // YYYY-MM-DD in server local time; the cron reset uses the same bucketing
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// GET /api/todos - today's todos for the logged-in user, organized
router.get("/", async (req, res) => {
  try {
    const todos = await Todo.find({
      user: req.userId,
      createdForDate: todayBucket(),
    }).sort({ sortOrder: 1, createdAt: 1 });
    res.json(todos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch todos" });
  }
});

// POST /api/todos - create a single manual todo
router.post("/", async (req, res) => {
  try {
    const { text, priority } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Task text is required" });
    }

    const todo = await Todo.create({
      user: req.userId,
      text: text.trim(),
      priority: priority || "medium",
      createdForDate: todayBucket(),
    });
    maybeCreateReminder(req.userId, todo);
    res.status(201).json(todo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create todo" });
  }
});

// POST /api/todos/dictate
// Body: { transcript: "call mom at 5pm, then finish report urgent for 1 hour" }
// Parses the dictated transcript into multiple tasks, saves them, organizes
// the whole day's list, and returns the reordered list. No external AI call.
router.post("/dictate", async (req, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ message: "transcript is required" });
    }

    const parsedTasks = parseDictation(transcript);
    if (parsedTasks.length === 0) {
      return res
        .status(400)
        .json({ message: "Could not extract any tasks from that dictation" });
    }

    const bucket = todayBucket();
    const created = await Todo.insertMany(
      parsedTasks.map((p) => ({
        user: req.userId,
        text: p.text,
        priority: p.priority,
        timeHint: p.timeHint,
        duration: p.duration,
        createdForDate: bucket,
      }))
    );

    created.forEach((todo) => maybeCreateReminder(req.userId, todo));

    const organized = await reorganizeAndSave(req.userId, bucket);
    res.status(201).json({ created: created.length, todos: organized });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to process dictation" });
  }
});

// POST /api/todos/organize - re-run the local organizer over today's list
router.post("/organize", async (req, res) => {
  try {
    const organized = await reorganizeAndSave(req.userId, todayBucket());
    res.json(organized);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to organize todos" });
  }
});

async function reorganizeAndSave(userId, bucket) {
  const todos = await Todo.find({
    user: userId,
    createdForDate: bucket,
    completed: false,
  });

  const organized = organizeTasks(
    todos.map((t) => ({
      _id: t._id,
      text: t.text,
      priority: t.priority,
      timeHint: t.timeHint,
      duration: t.duration,
    }))
  );

  await Promise.all(
    organized.map((t) =>
      Todo.findByIdAndUpdate(t._id, { sortOrder: t.sortOrder })
    )
  );

  return Todo.find({ user: userId, createdForDate: bucket }).sort({
    sortOrder: 1,
    createdAt: 1,
  });
}

// PATCH /api/todos/:id
router.patch("/:id", async (req, res) => {
  try {
    const updates = {};
    ["text", "priority", "completed", "timeHint", "duration"].forEach(
      (key) => {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
    );

    const todo = await Todo.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      updates,
      { new: true }
    );

    if (!todo) return res.status(404).json({ message: "Todo not found" });
    res.json(todo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update todo" });
  }
});

// DELETE /api/todos/:id
router.delete("/:id", async (req, res) => {
  try {
    const todo = await Todo.findOneAndDelete({
      _id: req.params.id,
      user: req.userId,
    });
    if (!todo) return res.status(404).json({ message: "Todo not found" });

    if (todo.googleEventId) {
      const user = await User.findById(req.userId);
      if (user?.googleConnected) {
        deleteReminderEvent(user, todo.googleEventId).catch(() => {});
      }
    }

    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to delete todo" });
  }
});

module.exports = router;
