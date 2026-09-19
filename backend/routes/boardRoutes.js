const express = require("express");
const Board = require("../models/Board");
const Todo = require("../models/Todo");
const User = require("../models/User");
const FriendRequest = require("../models/FriendRequest");
const auth = require("../middleware/auth");
const { deleteReminderEvent } = require("../utils/googleCalendar");
const microsoftCalendar = require("../utils/microsoftCalendar");

const router = express.Router();
router.use(auth);

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

router.get("/", async (req, res) => {
  try {
    await ensureDefaultBoard(req.userId);

    const boards = await Board.find({
      $or: [{ user: req.userId }, { "sharedWith.user": req.userId }],
    }).populate("user", "name username avatar").populate("sharedWith.user", "name username avatar").sort({ createdAt: 1 });

    res.json(boards.map((board) => {
      const object = board.toObject();
      const isOwner = String(board.user._id) === String(req.userId);
      return {
        ...object,
        access: isOwner ? "owner" : "shared",
        owner: board.user,
        notes: isOwner ? object.notes : undefined,
        scratchpad: isOwner ? object.scratchpad : undefined,
        sharedWith: isOwner ? object.sharedWith : [],
      };
    }));
  } catch (err) {
    console.error("Fetch boards error:", err);

    res.status(500).json({
      message: "Failed to fetch boards",
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({
        message: "Board name is required",
      });
    }

    const board = await Board.create({
      user: req.userId,
      name,
    });

    res.status(201).json(board);
  } catch (err) {
    console.error("Create board error:", err);

    if (err.code === 11000) {
      return res.status(409).json({
        message: "A board with that name already exists",
      });
    }

    res.status(500).json({
      message: "Failed to create board",
    });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({
        message: "Board name is required",
      });
    }

    const board = await Board.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.userId,
      },
      { name },
      { new: true }
    );

    if (!board) {
      return res.status(404).json({
        message: "Board not found",
      });
    }

    res.json(board);
  } catch (err) {
    console.error("Update board error:", err);

    if (err.code === 11000) {
      return res.status(409).json({
        message: "A board with that name already exists",
      });
    }

    res.status(500).json({
      message: "Failed to update board",
    });
  }
});

router.post("/:id/share", async (req, res) => {
  try {
    const friendUserId = req.body.userId;
    const friendship = await FriendRequest.findOne({
      status: "accepted",
      $or: [{ requester: req.userId, recipient: friendUserId }, { requester: friendUserId, recipient: req.userId }],
    });
    if (!friendship) return res.status(403).json({ message: "Boards can only be shared with friends" });

    const board = await Board.findOne({ _id: req.params.id, user: req.userId });
    if (!board) return res.status(404).json({ message: "Board not found" });
    if (!board.sharedWith.some((share) => String(share.user) === String(friendUserId))) {
      board.sharedWith.push({ user: friendUserId });
      await board.save();
    }
    await board.populate("sharedWith.user", "name username avatar");
    res.json(board);
  } catch (err) {
    console.error("Share board error:", err.message);
    res.status(500).json({ message: "Failed to share board" });
  }
});

router.delete("/:id/share/:userId", async (req, res) => {
  const board = await Board.findOneAndUpdate(
    { _id: req.params.id, user: req.userId },
    { $pull: { sharedWith: { user: req.params.userId } } },
    { new: true }
  ).populate("sharedWith.user", "name username avatar");
  if (!board) return res.status(404).json({ message: "Board not found" });
  res.json(board);
});

router.patch("/:id/scratchpad", async (req, res) => {
  try {
    const body = String(req.body.body || "").slice(0, 50000);
    const board = await Board.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { scratchpad: { body, updatedAt: new Date() } },
      { new: true }
    );

    if (!board) return res.status(404).json({ message: "Board not found" });
    res.json(board);
  } catch (err) {
    console.error("Save scratchpad error:", err);
    res.status(500).json({ message: "Failed to save scratchpad" });
  }
});

router.patch("/:id/notes", async (req, res) => {
  try {
    const title = String(req.body.title || "").slice(0, 120);
    const body = String(req.body.body || "").slice(0, 100000);
    const board = await Board.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { notes: { title, body, updatedAt: new Date() } },
      { new: true }
    );
    if (!board) return res.status(404).json({ message: "Board not found" });
    res.json(board);
  } catch (err) {
    console.error("Save notes error:", err);
    res.status(500).json({ message: "Failed to save notes" });
  }
});

router.patch("/:id/layout", async (req, res) => {
  try {
    const allowedWidgets = new Set(["metrics", "sprints", "calendar", "workspace", "tasks", "upcoming", "progress"]);
    if (!Array.isArray(req.body.layout)) return res.status(400).json({ message: "Layout must be an array" });
    const seen = new Set();
    const layout = req.body.layout.slice(0, 12).map((item, index) => {
      const id = String(item.id || "");
      if (!allowedWidgets.has(id) || seen.has(id)) throw new Error("Invalid dashboard widget");
      seen.add(id);
      return {
        id,
        width: Math.max(3, Math.min(12, Number(item.width) || 6)),
        height: Math.max(1, Math.min(8, Number(item.height) || 3)),
        visible: item.visible !== false,
        order: index,
      };
    });
    const board = await Board.findOneAndUpdate({ _id: req.params.id, user: req.userId }, { dashboardLayout: layout }, { new: true });
    if (!board) return res.status(404).json({ message: "Board not found" });
    res.json(board);
  } catch (err) {
    if (err.message === "Invalid dashboard widget") return res.status(400).json({ message: err.message });
    console.error("Save board layout error:", err.message);
    res.status(500).json({ message: "Failed to save board layout" });
  }
});

router.post("/:id/sprints", async (req, res) => {
  try {
    const board = await Board.findOne({ _id: req.params.id, user: req.userId });
    if (!board) return res.status(404).json({ message: "Board not found" });
    const name = String(req.body.name || "").trim();
    const startDate = new Date(req.body.startDate);
    const endDate = new Date(req.body.endDate);
    const stages = [...new Set((req.body.stages || []).map((stage) => String(stage).trim()).filter(Boolean))].slice(0, 8);
    if (!name || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
      return res.status(400).json({ message: "A name and valid sprint dates are required" });
    }
    if (stages.length < 2) return res.status(400).json({ message: "Add at least two workflow stages" });
    board.sprints.push({ name, goal: String(req.body.goal || "").trim(), startDate, endDate, capacity: Math.max(0, Number(req.body.capacity) || 0), stages });
    await board.save();
    res.status(201).json(board);
  } catch (err) {
    console.error("Create sprint error:", err.message);
    res.status(500).json({ message: "Failed to create sprint" });
  }
});

router.patch("/:id/sprints/:sprintId", async (req, res) => {
  try {
    const board = await Board.findOne({ _id: req.params.id, user: req.userId });
    if (!board) return res.status(404).json({ message: "Board not found" });
    const sprint = board.sprints.id(req.params.sprintId);
    if (!sprint) return res.status(404).json({ message: "Sprint not found" });
    if (req.body.status && ["planned", "active", "completed"].includes(req.body.status)) {
      if (req.body.status === "active") board.sprints.forEach((item) => { if (String(item._id) !== String(sprint._id) && item.status === "active") item.status = "planned"; });
      sprint.status = req.body.status;
    }
    ["name", "goal"].forEach((field) => { if (req.body[field] !== undefined) sprint[field] = String(req.body[field]).trim(); });
    if (req.body.capacity !== undefined) sprint.capacity = Math.max(0, Number(req.body.capacity) || 0);
    await board.save();
    res.json(board);
  } catch (err) {
    console.error("Update sprint error:", err.message);
    res.status(500).json({ message: "Failed to update sprint" });
  }
});

router.delete("/:id/sprints/:sprintId", async (req, res) => {
  try {
    const board = await Board.findOne({ _id: req.params.id, user: req.userId });
    if (!board) return res.status(404).json({ message: "Board not found" });
    const sprint = board.sprints.id(req.params.sprintId);
    if (!sprint) return res.status(404).json({ message: "Sprint not found" });
    sprint.deleteOne();
    await board.save();
    await Todo.updateMany({ board: board._id, sprint: req.params.sprintId }, { $set: { sprint: null, workflowStage: "To do" } });
    res.json(board);
  } catch (err) {
    console.error("Delete sprint error:", err.message);
    res.status(500).json({ message: "Failed to delete sprint" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const board = await Board.findOne({
      _id: req.params.id,
      user: req.userId,
    });

    if (!board) {
      return res.status(404).json({ message: "Board not found" });
    }

    const todos = await Todo.find({
      board: board._id,
      user: req.userId,
    });
    const reminderTodos = todos.filter((todo) => todo.googleEventId);

    if (reminderTodos.length) {
      const user = await User.findById(req.userId);
      if (user?.googleConnected) {
        for (const todo of reminderTodos) {
          try {
            await deleteReminderEvent(user, todo.googleEventId);
          } catch (err) {
            console.error("[google] Failed deleting board reminder:", err.message);
          }
        }
      }
    }

    const microsoftTodos = todos.filter((todo) => todo.microsoftEventId);
    let calendarWarning = null;
    if (microsoftTodos.length) {
      const user = await User.findById(req.userId).select("+microsoftTokens");
      for (const todo of microsoftTodos) {
        try {
          if (!user?.microsoftConnected) throw new Error("Disconnected");
          await microsoftCalendar.deleteReminderEvent(user, todo.microsoftEventId);
        } catch { calendarWarning = "Some Outlook reminders could not be removed. Remove them in Outlook."; }
      }
    }
    await Todo.deleteMany({ board: board._id, user: req.userId });
    await board.deleteOne();

    let boards = await Board.find({ user: req.userId }).sort({ createdAt: 1 });
    if (!boards.length) {
      const mainBoard = await Board.create({ user: req.userId, name: "Main" });
      boards = [mainBoard];
    }

    res.json({ deleted: true, boards, calendarWarning });
  } catch (err) {
    console.error("Delete board error:", err);
    res.status(500).json({ message: "Failed to delete board" });
  }
});

module.exports = router;
