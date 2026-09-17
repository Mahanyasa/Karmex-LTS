const express = require("express");
const Board = require("../models/Board");
const Todo = require("../models/Todo");
const User = require("../models/User");
const auth = require("../middleware/auth");
const { parseDictation, organizeTasks } = require("../utils/organizer");
const {
  createReminderEvent,
  deleteReminderEvent,
} = require("../utils/googleCalendar");

const router = express.Router();
router.use(auth);

/* =========================================================
   HELPERS
========================================================= */

function todayBucket() {
  // YYYY-MM-DD
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function ensureDefaultBoard(userId) {
  let board = await Board.findOne({
    user: userId,
    name: "Main",
  });

  if (!board) {
    board = await Board.create({
      user: userId,
      name: "Main",
    });
  }

  await Todo.updateMany(
    {
      user: userId,
      $or: [
        { board: { $exists: false } },
        { board: null },
      ],
    },
    {
      $set: {
        board: board._id,
      },
    }
  );

  return board;
}

async function resolveBoard(userId, boardId, requireOwner = false) {
  if (!boardId) {
    return ensureDefaultBoard(userId);
  }

  const board = await Board.findOne(requireOwner
    ? { _id: boardId, user: userId }
    : { _id: boardId, $or: [{ user: userId }, { "sharedWith.user": userId }] });

  return board;
}

// Convert timeHint such as "17:30" into a real Date
// using the supplied bucket date.
function buildReminderDateTime(bucket, timeHint) {
  if (!bucket || !timeHint) return null;

  // Expected timeHint: HH:mm
  const match = String(timeHint).match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  // Treat task time as Asia/Kolkata (+05:30).
  const paddedHour = String(hours).padStart(2, "0");
  const paddedMinute = String(minutes).padStart(2, "0");

  const date = new Date(
    `${bucket}T${paddedHour}:${paddedMinute}:00+05:30`,
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/* =========================================================
   GOOGLE CALENDAR
========================================================= */

// Best-effort Calendar creation.
// Failure to create a Google event does NOT fail todo creation.
async function maybeCreateReminder(userId, todo) {
  try {
    if (!todo.reminderDateTime) {
      console.log(
        `[google] Todo ${todo._id} has no reminderDateTime. Skipping Calendar.`,
      );
      return null;
    }

    const user = await User.findById(userId);

    if (!user?.googleConnected) {
      console.log(
        `[google] User ${userId} has not connected Google Calendar.`,
      );
      return null;
    }

    const eventId = await createReminderEvent(user, todo);

    if (eventId) {
      await Todo.findByIdAndUpdate(todo._id, {
        googleEventId: eventId,
      });

      console.log(
        `[google] Calendar event created for todo ${todo._id}: ${eventId}`,
      );
    }

    return eventId;
  } catch (err) {
    console.error(
      "[google] Failed to create reminder:",
      err.response?.data || err.message,
    );

    return null;
  }
}

/* =========================================================
   GET TODOS
========================================================= */

// GET /api/todos?boardId=...
router.get("/", async (req, res) => {
  try {
    const board = await resolveBoard(req.userId, req.query.boardId);

    if (!board) {
      return res.status(404).json({
        message: "Board not found",
      });
    }

    const todos = await Todo.find({ board: board._id }).sort({
      sortOrder: 1,
      createdAt: 1,
    });

    res.json(todos);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to fetch todos",
    });
  }
});

/* =========================================================
   CREATE MANUAL TODO
========================================================= */

// POST /api/todos
//
// Example:
// {
//   "boardId": "...",
//   "text": "Meeting with Raju sir",
//   "priority": "high",
//   "reminderDateTime": "2026-09-18T14:30:00+05:30",
//   "duration": 30
// }

router.post("/", async (req, res) => {
  try {
    const {
      boardId,
      text,
      priority,
      reminderDateTime,
      duration,
    } = req.body;

    const board = await resolveBoard(req.userId, boardId, true);

    if (!board) {
      return res.status(404).json({
        message: "Board not found",
      });
    }

    /* -----------------------------
       Validate text
    ----------------------------- */

    if (!text || !text.trim()) {
      return res.status(400).json({
        message: "Task text is required",
      });
    }

    /* -----------------------------
       Validate reminder date/time
    ----------------------------- */

    if (!reminderDateTime) {
      return res.status(400).json({
        message: "Task date and time are required",
      });
    }

    const parsedDateTime = new Date(reminderDateTime);

    if (Number.isNaN(parsedDateTime.getTime())) {
      return res.status(400).json({
        message: "Invalid task date/time",
      });
    }

    /* -----------------------------
       Validate duration
    ----------------------------- */

    let parsedDuration = null;

    if (duration !== undefined && duration !== null && duration !== "") {
      parsedDuration = Number(duration);

      if (
        Number.isNaN(parsedDuration) ||
        parsedDuration <= 0
      ) {
        return res.status(400).json({
          message: "Duration must be greater than 0",
        });
      }
    }

    /* -----------------------------
       Create Todo
    ----------------------------- */

    const todo = await Todo.create({
      user: req.userId,

      board: board._id,

      text: text.trim(),

      priority: priority || "medium",

      reminderDateTime: parsedDateTime,

      duration: parsedDuration,

      createdForDate: todayBucket(),
    });

    /* -----------------------------
       Create Google Calendar event
    ----------------------------- */

    await maybeCreateReminder(
      req.userId,
      todo,
    );

    // Reload because googleEventId may have been added
    const savedTodo = await Todo.findById(todo._id);

    res.status(201).json(savedTodo);
  } catch (err) {
    console.error(
      "Create todo error:",
      err,
    );

    res.status(500).json({
      message: "Failed to create todo",
    });
  }
});

// POST /api/todos/github-issue
router.post("/github-issue", async (req, res) => {
  try {
    const { boardId, title, repository, issueNumber, url } = req.body;
    const board = await resolveBoard(req.userId, boardId, true);

    if (!board) return res.status(404).json({ message: "Board not found" });
    if (!title?.trim() || !repository?.trim() || !Number.isInteger(Number(issueNumber))) {
      return res.status(400).json({ message: "Valid GitHub issue details are required" });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ message: "Valid GitHub issue URL is required" });
    }
    if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "github.com") {
      return res.status(400).json({ message: "GitHub issue URL must use github.com" });
    }

    const existing = await Todo.findOne({
      user: req.userId,
      board: board._id,
      "source.type": "github",
      "source.url": parsedUrl.toString(),
    });
    if (existing) return res.status(409).json({ message: "This issue is already on that board" });

    const todo = await Todo.create({
      user: req.userId,
      board: board._id,
      text: title.trim(),
      priority: "medium",
      reminderDateTime: null,
      createdForDate: todayBucket(),
      source: {
        type: "github",
        url: parsedUrl.toString(),
        repository: repository.trim(),
        issueNumber: Number(issueNumber),
      },
    });

    res.status(201).json(todo);
  } catch (err) {
    console.error("GitHub issue import error:", err);
    res.status(500).json({ message: "Failed to add GitHub issue to workspace" });
  }
});

/* =========================================================
   DICTATION
========================================================= */

// POST /api/todos/dictate
//
// {
//   "boardId": "...",
//   "transcript":
//   "call mom at 5pm, then finish report urgent for 1 hour"
// }

router.post("/dictate", async (req, res) => {
  try {
    const { boardId, transcript } = req.body;

    const board = await resolveBoard(req.userId, boardId, true);

    if (!board) {
      return res.status(404).json({
        message: "Board not found",
      });
    }

    if (!transcript || !transcript.trim()) {
      return res.status(400).json({
        message: "transcript is required",
      });
    }

    const parsedTasks = parseDictation(
      transcript,
    );

    if (parsedTasks.length === 0) {
      return res.status(400).json({
        message:
          "Could not extract any tasks from that dictation",
      });
    }

    const bucket = todayBucket();

    /* -----------------------------
       Create tasks
    ----------------------------- */

    const created = await Todo.insertMany(
      parsedTasks.map((p) => {
        const reminderDateTime =
          buildReminderDateTime(
            bucket,
            p.timeHint,
          );

        return {
          user: req.userId,

          board: board._id,

          text: p.text,

          priority:
            p.priority || "medium",

          timeHint:
            p.timeHint || null,

          duration:
            p.duration || null,

          // Convert dictated time into actual date/time
          reminderDateTime,

          createdForDate: bucket,
        };
      }),
    );

    /* -----------------------------
       Google Calendar
    ----------------------------- */

    // Wait for Calendar attempts to complete
    await Promise.all(
      created.map((todo) =>
        maybeCreateReminder(
          req.userId,
          todo,
        ),
      ),
    );

    /* -----------------------------
       Organize
    ----------------------------- */

    const organized =
      await reorganizeAndSave(
        req.userId,
        board._id,
      );

    res.status(201).json({
      created: created.length,
      todos: organized,
    });
  } catch (err) {
    console.error(
      "Dictation error:",
      err,
    );

    res.status(500).json({
      message:
        "Failed to process dictation",
    });
  }
});

/* =========================================================
   ORGANIZE
========================================================= */

// POST /api/todos/organize

router.post("/organize", async (req, res) => {
  try {
    const board = await resolveBoard(req.userId, req.body.boardId, true);

    if (!board) {
      return res.status(404).json({
        message: "Board not found",
      });
    }

    const organized =
      await reorganizeAndSave(
        req.userId,
        board._id,
      );

    res.json(organized);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to organize todos",
    });
  }
});

/* =========================================================
   ORGANIZER
========================================================= */

async function reorganizeAndSave(
  userId,
  boardId,
) {
  const todos = await Todo.find({
    user: userId,
    board: boardId,
    completed: false,
  });

  const organized = organizeTasks(
    todos.map((t) => ({
      _id: t._id,

      text: t.text,

      priority: t.priority,

      timeHint: t.timeHint,

      reminderDateTime:
        t.reminderDateTime,

      duration: t.duration,
    })),
  );

  await Promise.all(
    organized.map((t) =>
      Todo.findByIdAndUpdate(
        t._id,
        {
          sortOrder: t.sortOrder,
        },
      ),
    ),
  );

  return Todo.find({
    user: userId,
    board: boardId,
  }).sort({
    sortOrder: 1,
    createdAt: 1,
  });
}

/* =========================================================
   UPDATE TODO
========================================================= */

// PATCH /api/todos/:id

router.patch("/:id", async (req, res) => {
  try {
    const updates = {};

    const allowedFields = [
      "text",
      "priority",
      "completed",
      "timeHint",
      "duration",
    ];

    allowedFields.forEach((key) => {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    });

    if (req.body.boardId !== undefined) {
      const board = await resolveBoard(req.userId, req.body.boardId, true);

      if (!board) {
        return res.status(404).json({
          message: "Board not found",
        });
      }

      updates.board = board._id;
    }

    /* -----------------------------
       Reminder Date/Time
    ----------------------------- */

    if (
      req.body.reminderDateTime !==
      undefined
    ) {
      if (
        req.body.reminderDateTime ===
        null
      ) {
        updates.reminderDateTime = null;
      } else {
        const parsedDateTime =
          new Date(
            req.body.reminderDateTime,
          );

        if (
          Number.isNaN(
            parsedDateTime.getTime(),
          )
        ) {
          return res.status(400).json({
            message:
              "Invalid reminder date/time",
          });
        }

        updates.reminderDateTime =
          parsedDateTime;
      }
    }

    /* -----------------------------
       Find existing Todo
    ----------------------------- */

    const existingTodo =
      await Todo.findOne({
        _id: req.params.id,
        user: req.userId,
      });

    if (!existingTodo) {
      return res.status(404).json({
        message: "Todo not found",
      });
    }

    /* -----------------------------
       Update Todo
    ----------------------------- */

    const todo =
      await Todo.findOneAndUpdate(
        {
          _id: req.params.id,
          user: req.userId,
        },
        updates,
        {
          new: true,
        },
      );

    /* -----------------------------
       Calendar update handling
    ----------------------------- */

    const reminderChanged =
      req.body.reminderDateTime !==
        undefined ||
      req.body.text !== undefined ||
      req.body.duration !== undefined;

    if (reminderChanged) {
      const user =
        await User.findById(
          req.userId,
        );

      if (user?.googleConnected) {
        // Delete old Calendar event
        if (existingTodo.googleEventId) {
          try {
            await deleteReminderEvent(
              user,
              existingTodo.googleEventId,
            );
          } catch (err) {
            console.error(
              "[google] Failed deleting old event:",
              err.message,
            );
          }

          await Todo.findByIdAndUpdate(
            todo._id,
            {
              googleEventId: null,
            },
          );

          todo.googleEventId = null;
        }

        // Create new event with updated date/time
        if (todo.reminderDateTime) {
          await maybeCreateReminder(
            req.userId,
            todo,
          );
        }
      }
    }

    const savedTodo =
      await Todo.findById(todo._id);

    res.json(savedTodo);
  } catch (err) {
    console.error(
      "Update todo error:",
      err,
    );

    res.status(500).json({
      message: "Failed to update todo",
    });
  }
});

/* =========================================================
   DELETE TODO
========================================================= */

// DELETE /api/todos/:id

router.delete("/:id", async (req, res) => {
  try {
    const todo =
      await Todo.findOneAndDelete({
        _id: req.params.id,
        user: req.userId,
      });

    if (!todo) {
      return res.status(404).json({
        message: "Todo not found",
      });
    }

    /* -----------------------------
       Delete Google Calendar event
    ----------------------------- */

    if (todo.googleEventId) {
      const user =
        await User.findById(
          req.userId,
        );

      if (user?.googleConnected) {
        try {
          await deleteReminderEvent(
            user,
            todo.googleEventId,
          );
        } catch (err) {
          console.error(
            "[google] Failed deleting Calendar event:",
            err.message,
          );
        }
      }
    }

    res.json({
      message: "Deleted",
    });
  } catch (err) {
    console.error(
      "Delete todo error:",
      err,
    );

    res.status(500).json({
      message: "Failed to delete todo",
    });
  }
});

module.exports = router;
