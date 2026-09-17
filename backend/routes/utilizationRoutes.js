const express = require("express");
const UtilizationReport = require("../models/UtilizationReport");
const auth = require("../middleware/auth");

const router = express.Router();
router.use(auth);

const ELEMENTS = [
  ["Meeting", 1, ["meeting", "attended a", "walkthrough", "discussion"]],
  ["Research / R&D", 2, ["r&d", "rnd", "research", "explore", "investigat", "feasibility", "prototype"]],
  ["API Integration", 2, ["api integration", "integrating api", "integrated api", "api", "endpoint"]],
  ["Database Work", 2, ["database", "db function", "db architecture", "schema", "table structure", "query"]],
  ["UI / Frontend Design", 2.5, ["ui", "screen", "page", "layout", "dashboard", "responsive", "design"]],
  ["Bug Fixing", 1.5, ["bug", "fix", "debug", "resolve", "issue", "error"]],
  ["Testing / QA", 1.5, ["testing", "test", "qa", "validate", "verified", "verification"]],
  ["Build / Release", 1, ["apk", "build file", "deployment", "release", "generated a build"]],
  ["Documentation", 2, ["documentation", "handbook", "manual", "user guide"]],
  ["Code Review", 1, ["review", "pr review", "code review"]],
  ["Refactoring", 1.5, ["refactor", "reusable component", "restructur", "clean code"]],
];

function dayKey(value) { return new Date(value).toISOString().slice(0, 10); }
function workingDaysBetween(start, end, workingDays) {
  let count = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) if (workingDays.includes(cursor.getUTCDay())) count += 1;
  return count;
}
function elementEstimate(description) {
  const value = String(description || "").toLowerCase();
  const matches = ELEMENTS.filter(([, , keywords]) => keywords.some((keyword) => value.includes(keyword))).slice(0, 4);
  if (!matches.length) return { hours: 2, elements: ["General Development"] };
  return { hours: matches.reduce((sum, [, hours]) => sum + hours, 0), elements: matches.map(([name]) => name) };
}

function buildReport(document) {
  const entries = document.entries || [];
  const settings = document.settings || { hoursPerDay: 8, workingDays: [1, 2, 3, 4, 5, 6] };
  const groups = new Map();
  const projectTotals = new Map();
  const monthlyTotals = new Map();
  entries.forEach((entry) => {
    const estimate = elementEstimate(entry.description);
    const key = entry.member;
    if (!groups.has(key)) groups.set(key, { member: key, entries: [], dates: new Set(), loggedExplicit: 0, explicitCount: 0, standardHours: 0, elements: {} });
    const group = groups.get(key);
    const rawEntry = typeof entry.toObject === "function" ? entry.toObject() : entry;
    group.entries.push({ ...rawEntry, standardHours: estimate.hours, elements: estimate.elements });
    group.dates.add(dayKey(entry.date));
    if (Number.isFinite(entry.hours)) { group.loggedExplicit += entry.hours; group.explicitCount += 1; }
    group.standardHours += estimate.hours;
    estimate.elements.forEach((element) => { group.elements[element] = (group.elements[element] || 0) + 1; });
    const project = entry.classification || "Unclassified";
    projectTotals.set(project, (projectTotals.get(project) || 0) + (Number.isFinite(entry.hours) ? entry.hours : settings.hoursPerDay));
    const month = dayKey(entry.date).slice(0, 7);
    monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + (Number.isFinite(entry.hours) ? entry.hours : settings.hoursPerDay));
  });
  const members = [...groups.values()].map((group) => {
    const dates = [...group.dates].sort();
    const firstDate = dates[0]; const lastDate = dates[dates.length - 1];
    const workingDays = firstDate ? workingDaysBetween(new Date(`${firstDate}T00:00:00Z`), new Date(`${lastDate}T00:00:00Z`), settings.workingDays) : 0;
    const capacityHours = workingDays * settings.hoursPerDay;
    const loggedHours = group.explicitCount ? group.loggedExplicit : dates.length * settings.hoursPerDay;
    return { member: group.member, firstDate, lastDate, workingDays, capacityHours, loggedHours, utilization: capacityHours ? loggedHours / capacityHours : 0, standardHours: group.standardHours, efficiency: loggedHours ? group.standardHours / loggedHours : 0, taskCount: group.entries.length, projectCount: new Set(group.entries.map((entry) => entry.classification)).size, elements: group.elements, entries: group.entries.sort((a, b) => new Date(b.date) - new Date(a.date)) };
  }).sort((a, b) => b.utilization - a.utilization);
  const totals = members.reduce((result, member) => ({ capacityHours: result.capacityHours + member.capacityHours, loggedHours: result.loggedHours + member.loggedHours, standardHours: result.standardHours + member.standardHours, taskCount: result.taskCount + member.taskCount }), { capacityHours: 0, loggedHours: 0, standardHours: 0, taskCount: 0 });
  return { id: document._id, sourceName: document.sourceName, updatedAt: document.updatedAt, settings, totals: { ...totals, utilization: totals.capacityHours ? totals.loggedHours / totals.capacityHours : 0, efficiency: totals.loggedHours ? totals.standardHours / totals.loggedHours : 0 }, members, projects: [...projectTotals].map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours), months: [...monthlyTotals].map(([month, hours]) => ({ month, hours })).sort((a, b) => a.month.localeCompare(b.month)) };
}

router.get("/", async (req, res) => {
  const report = await UtilizationReport.findOne({ user: req.userId });
  res.json(report ? buildReport(report) : null);
});

router.post("/import", async (req, res) => {
  try {
    if (!Array.isArray(req.body.entries) || !req.body.entries.length) return res.status(400).json({ message: "No valid daily-update rows were found" });
    if (req.body.entries.length > 15000) return res.status(400).json({ message: "The workbook exceeds the 15,000-row import limit" });
    const entries = req.body.entries.map((entry) => ({ member: String(entry.member || "").trim().slice(0, 100), date: new Date(entry.date), classification: String(entry.classification || "Unclassified").trim().slice(0, 150), description: String(entry.description || "").trim().slice(0, 2000), status: String(entry.status || "").trim().slice(0, 80), hours: entry.hours === null || entry.hours === "" ? null : Math.max(0, Math.min(24, Number(entry.hours))) })).filter((entry) => entry.member && !Number.isNaN(entry.date.getTime()));
    if (!entries.length) return res.status(400).json({ message: "No dated employee records were found" });
    const report = await UtilizationReport.findOneAndUpdate({ user: req.userId }, { sourceName: String(req.body.sourceName || "Daily Update.xlsx").slice(0, 255), settings: { hoursPerDay: 8, workingDays: [1, 2, 3, 4, 5, 6] }, entries }, { new: true, upsert: true, setDefaultsOnInsert: true });
    res.status(201).json(buildReport(report));
  } catch (err) { console.error("Utilization import error:", err); res.status(500).json({ message: "Failed to import utilization data" }); }
});

module.exports = router;
