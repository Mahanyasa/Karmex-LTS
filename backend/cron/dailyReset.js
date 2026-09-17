const cron = require("node-cron");
const Todo = require("../models/Todo");

// Runs every day at 09:00 in the configured timezone.
// "Reset" = start a fresh bucket for the new day. Incomplete tasks from
// yesterday are carried forward into today's bucket; completed ones stay
// archived under their original date so history isn't lost.
function scheduleDailyReset() {
  const tz = process.env.RESET_TZ || "UTC";

  cron.schedule(
    "0 9 * * *",
    async () => {
      try {
        const now = new Date();
        const todayBucket = now.toISOString().slice(0, 10);

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayBucket = yesterday.toISOString().slice(0, 10);

        const incomplete = await Todo.find({
          createdForDate: yesterdayBucket,
          completed: false,
        });

        if (incomplete.length > 0) {
          await Promise.all(
            incomplete.map((t) =>
              Todo.findByIdAndUpdate(t._id, { createdForDate: todayBucket })
            )
          );
        }

        console.log(
          `[cron] 9am reset ran for ${todayBucket}. Carried forward ${incomplete.length} incomplete tasks.`
        );
      } catch (err) {
        console.error("[cron] Daily reset failed:", err);
      }
    },
    { timezone: tz }
  );

  console.log(`[cron] Daily 9:00 AM reset scheduled (timezone: ${tz})`);
}

module.exports = scheduleDailyReset;
