const { graphRequest } = require("../config/microsoftClient");

function eventBody(todo) {
  const start = new Date(todo.reminderDateTime);
  const duration = Number(todo.duration || 30);
  if (!todo.reminderDateTime || !Number.isFinite(start.getTime()) || !Number.isFinite(duration) || duration <= 0) throw new Error("Invalid calendar reminder date or duration.");
  return {
    subject: todo.text,
    body: { contentType: "text", content: `Task from Karmex LTS (priority: ${todo.priority})` },
    start: { dateTime: start.toISOString().replace(/Z$/, ""), timeZone: "UTC" },
    end: { dateTime: new Date(start.getTime() + duration * 60000).toISOString().replace(/Z$/, ""), timeZone: "UTC" },
    isReminderOn: !todo.completed, reminderMinutesBeforeStart: 0,
  };
}

async function syncReminder(userId, todo) {
  const User = require("../models/User");
  const Todo = require("../models/Todo");
  try {
    const user = await User.findById(userId).select("+microsoftTokens");
    if (!user?.microsoftConnected) return;
    if (!todo.reminderDateTime) {
      if (todo.microsoftEventId) await deleteReminderEvent(user, todo.microsoftEventId);
      await Todo.findByIdAndUpdate(todo._id, { microsoftEventId: null, microsoftSyncError: null });
      return;
    }
    const body = eventBody(todo);
    if (todo.microsoftEventId) {
      try { await graphRequest(user, "PATCH", `/me/events/${encodeURIComponent(todo.microsoftEventId)}`, body); }
      catch (error) { if (error.status !== 404) throw error; todo.microsoftEventId = null; }
    }
    if (!todo.microsoftEventId) {
      const event = await graphRequest(user, "POST", "/me/events", { ...body, transactionId: `${todo._id}-${new Date(todo.updatedAt || todo.reminderDateTime).getTime()}` });
      todo.microsoftEventId = event.id;
    }
    await Todo.findByIdAndUpdate(todo._id, { microsoftEventId: todo.microsoftEventId, microsoftSyncError: null });
  } catch (error) {
    try { await Todo.findByIdAndUpdate(todo._id, { microsoftSyncError: "Microsoft Calendar could not sync this task. Check the connection and try editing the task again." }); }
    catch { /* A calendar failure must not fail an already saved task. */ }
    console.warn("[microsoft] Reminder sync failed:", error.message);
  }
}

async function deleteReminderEvent(user, eventId) {
  if (user?.microsoftConnected && eventId) await graphRequest(user, "DELETE", `/me/events/${encodeURIComponent(eventId)}`);
}
module.exports = { eventBody, syncReminder, deleteReminderEvent };
