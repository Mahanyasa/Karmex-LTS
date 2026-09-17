const express = require("express");
const Board = require("../models/Board");
const Todo = require("../models/Todo");
const auth = require("../middleware/auth");

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
      user: req.userId,
    }).sort({
      createdAt: 1,
    });

    res.json(boards);
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

module.exports = router;
