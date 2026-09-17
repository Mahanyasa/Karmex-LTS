const { google } = require("googleapis");
const { getClientForUser } = require("../config/googleClient");

// Creates a Google Calendar event with popup + notification reminders so it
// pushes an alert to the phone via the Google Calendar app. If the todo has
// no timeHint, defaults to a 30-minute block starting in 10 minutes so it
// still fires a near-term reminder rather than silently doing nothing.
async function createReminderEvent(user, todo) {
  const authClient = getClientForUser(user);
  if (!authClient) return null;

  const calendar = google.calendar({ version: "v3", auth: authClient });

  const start = buildStartDate(todo.timeHint);
  const durationMinutes = todo.duration || 30;
  const end = new Date(start.getTime() + durationMinutes * 60000);

  const event = {
    summary: todo.text,
    description: `Task from your Daily Planner (priority: ${todo.priority})`,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 0 }, // fires at start time -> phone push
        { method: "popup", minutes: 10 },
      ],
    },
  };

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: event,
  });

  return res.data.id;
}

async function deleteReminderEvent(user, eventId) {
  if (!eventId) return;
  const authClient = getClientForUser(user);
  if (!authClient) return;
  const calendar = google.calendar({ version: "v3", auth: authClient });
  try {
    await calendar.events.delete({ calendarId: "primary", eventId });
  } catch (err) {
    // Event may already be gone; not fatal
    console.warn("[google] Failed to delete event:", err.message);
  }
}

function buildStartDate(timeHint) {
  const now = new Date();
  if (!timeHint) {
    return new Date(now.getTime() + 10 * 60000);
  }
  const [hh, mm] = timeHint.split(":").map(Number);
  const start = new Date(now);
  start.setHours(hh, mm, 0, 0);
  if (start.getTime() < now.getTime()) {
    // Time already passed today -> schedule for tomorrow instead
    start.setDate(start.getDate() + 1);
  }
  return start;
}

module.exports = { createReminderEvent, deleteReminderEvent };
