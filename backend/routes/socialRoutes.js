const express = require("express");
const auth = require("../middleware/auth");
const User = require("../models/User");
const FriendRequest = require("../models/FriendRequest");

const router = express.Router();
router.use(auth);
const publicUser = "name username avatar";

router.get("/", async (req, res) => {
  try {
    const [incoming, outgoing, accepted] = await Promise.all([
      FriendRequest.find({ recipient: req.userId, status: "pending" }).populate("requester", publicUser).sort({ createdAt: -1 }),
      FriendRequest.find({ requester: req.userId, status: "pending" }).populate("recipient", publicUser).sort({ createdAt: -1 }),
      FriendRequest.find({ $or: [{ requester: req.userId }, { recipient: req.userId }], status: "accepted" }).populate("requester", publicUser).populate("recipient", publicUser).sort({ updatedAt: -1 }),
    ]);
    const friends = accepted.map((connection) => String(connection.requester._id) === String(req.userId) ? connection.recipient : connection.requester);
    res.json({ incoming, outgoing, friends });
  } catch (err) {
    console.error("Load social data error:", err.message);
    res.status(500).json({ message: "Failed to load friends" });
  }
});

router.post("/requests", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase().replace(/^@/, "");
    const recipient = await User.findOne({ username }).select(publicUser);
    if (!recipient) return res.status(404).json({ message: "No user found with that username" });
    if (String(recipient._id) === String(req.userId)) return res.status(400).json({ message: "You cannot add yourself" });

    const existing = await FriendRequest.findOne({ $or: [{ requester: req.userId, recipient: recipient._id }, { requester: recipient._id, recipient: req.userId }] });
    if (existing?.status === "accepted") return res.status(409).json({ message: "You are already friends" });
    if (existing) return res.status(409).json({ message: "A friend request is already pending" });

    const request = await FriendRequest.create({ requester: req.userId, recipient: recipient._id });
    res.status(201).json(request);
  } catch (err) {
    console.error("Friend request error:", err.message);
    res.status(500).json({ message: "Failed to send friend request" });
  }
});

router.patch("/requests/:id", async (req, res) => {
  try {
    const action = req.body.action;
    const request = await FriendRequest.findOne({ _id: req.params.id, recipient: req.userId, status: "pending" });
    if (!request) return res.status(404).json({ message: "Friend request not found" });
    if (action === "accept") { request.status = "accepted"; await request.save(); }
    else if (action === "decline") await request.deleteOne();
    else return res.status(400).json({ message: "Action must be accept or decline" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to update friend request" });
  }
});

router.delete("/friends/:userId", async (req, res) => {
  await FriendRequest.deleteOne({ status: "accepted", $or: [{ requester: req.userId, recipient: req.params.userId }, { requester: req.params.userId, recipient: req.userId }] });
  res.json({ success: true });
});

module.exports = router;
