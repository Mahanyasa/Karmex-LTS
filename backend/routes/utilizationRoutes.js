const express = require("express");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
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
function cellValue(cell) {
  const value = cell?.value;
  if (value == null) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") return value.result ?? value.text ?? value.richText?.map((part) => part.text).join("") ?? "";
  return value;
}
function normalizeHeader(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""); }
function excelDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  return new Date(value);
}
async function parseWorkbook(base64) {
  const buffer = Buffer.from(String(base64 || ""), "base64");
  if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new Error("Workbook must be smaller than 12 MB");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const entries = [];
  workbook.eachSheet((sheet) => {
    if (/\bfp\b|resource utilization|work timeline|elemental breakdown|customer complain/i.test(sheet.name)) return;
    let headerRow = null; const columns = {};
    for (let rowNumber = 1; rowNumber <= Math.min(12, sheet.rowCount); rowNumber += 1) {
      sheet.getRow(rowNumber).eachCell((cell, columnNumber) => {
        const key = normalizeHeader(cellValue(cell));
        if (key === "date") columns.date = columnNumber;
        if (["classification", "project", "worktypeproject"].includes(key)) columns.classification = columnNumber;
        if (["taskdescription", "workdone", "description"].includes(key)) columns.description = columnNumber;
        if (["done", "status"].includes(key)) columns.status = columnNumber;
        if (["timetakenhours", "actualhours", "hours", "loggedhours"].includes(key)) columns.hours = columnNumber;
      });
      if (columns.date && columns.description) { headerRow = rowNumber; break; }
    }
    if (!headerRow) return;
    for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber); const date = excelDate(cellValue(row.getCell(columns.date)));
      const description = String(cellValue(row.getCell(columns.description)) || "").trim();
      if (Number.isNaN(date.getTime()) || !description) continue;
      const rawHours = columns.hours ? cellValue(row.getCell(columns.hours)) : null; const hours = rawHours === null || rawHours === "" ? null : Number(rawHours);
      entries.push({ member: sheet.name.trim(), date, classification: String(cellValue(row.getCell(columns.classification)) || "Unclassified").trim(), description, status: String(cellValue(row.getCell(columns.status)) || "").trim(), hours: Number.isFinite(hours) && hours >= 0 ? hours : null });
    }
  });
  return entries;
}
function workingDaysBetween(start, end, workingDays) {
  let count = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) if (workingDays.includes(cursor.getUTCDay())) count += 1;
  return count;
}
function fingerprint(entry) {
  const parts = [entry.member, dayKey(entry.date), entry.classification, entry.description].map((value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " "));
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}
function learnedStandards(entries) {
  const observations = new Map();
  entries.forEach((entry) => {
    if (!Number.isFinite(entry.hours) || entry.hours <= 0) return;
    const value = String(entry.description || "").toLowerCase();
    const matches = ELEMENTS.filter(([, , keywords]) => keywords.some((keyword) => value.includes(keyword))).slice(0, 4);
    if (!matches.length) return;
    const allocation = entry.hours / matches.length;
    matches.forEach(([name]) => {
      const current = observations.get(name) || { total: 0, samples: 0 };
      current.total += allocation; current.samples += 1; observations.set(name, current);
    });
  });
  return new Map(ELEMENTS.map(([name, baseline]) => {
    const observed = observations.get(name);
    const calibrated = observed?.samples >= 3 ? Math.max(0.25, Math.min(16, observed.total / observed.samples)) : baseline;
    return [name, { hours: calibrated, baseline, samples: observed?.samples || 0, learned: Boolean(observed?.samples >= 3) }];
  }));
}
function elementEstimate(description, standards) {
  const value = String(description || "").toLowerCase();
  const matches = ELEMENTS.filter(([, , keywords]) => keywords.some((keyword) => value.includes(keyword))).slice(0, 4);
  if (!matches.length) return { hours: 2, elements: ["General Development"] };
  return { hours: matches.reduce((sum, [name, hours]) => sum + (standards.get(name)?.hours || hours), 0), elements: matches.map(([name]) => name) };
}

function buildReport(document) {
  const entries = document.entries || [];
  const standards = learnedStandards(entries);
  const settings = document.settings || { hoursPerDay: 8, workingDays: [1, 2, 3, 4, 5, 6] };
  const groups = new Map();
  const projectTotals = new Map();
  const monthlyTotals = new Map();
  entries.forEach((entry) => {
    const estimate = elementEstimate(entry.description, standards);
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
  return { id: document._id, sourceName: document.sourceName, updatedAt: document.updatedAt, settings, totals: { ...totals, utilization: totals.capacityHours ? totals.loggedHours / totals.capacityHours : 0, efficiency: totals.loggedHours ? totals.standardHours / totals.loggedHours : 0 }, standards: [...standards].map(([name, value]) => ({ name, ...value })), members, projects: [...projectTotals].map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours), months: [...monthlyTotals].map(([month, hours]) => ({ month, hours })).sort((a, b) => a.month.localeCompare(b.month)) };
}

router.get("/", async (req, res) => {
  const report = await UtilizationReport.findOne({ user: req.userId });
  res.json(report ? buildReport(report) : null);
});

router.post("/import", async (req, res) => {
  try {
    const workbookEntries = req.body.workbookBase64 ? await parseWorkbook(req.body.workbookBase64) : req.body.entries;
    if (!Array.isArray(workbookEntries) || !workbookEntries.length) return res.status(400).json({ message: "No valid employee daily-update rows were found" });
    if (workbookEntries.length > 15000) return res.status(400).json({ message: "The workbook exceeds the 15,000-row import limit" });
    const entries = workbookEntries.map((entry) => ({ member: String(entry.member || "").trim().slice(0, 100), date: new Date(entry.date), classification: String(entry.classification || "Unclassified").trim().slice(0, 150), description: String(entry.description || "").trim().slice(0, 2000), status: String(entry.status || "").trim().slice(0, 80), hours: entry.hours === null || entry.hours === "" ? null : Math.max(0, Math.min(24, Number(entry.hours))) })).filter((entry) => entry.member && !Number.isNaN(entry.date.getTime()));
    if (!entries.length) return res.status(400).json({ message: "No dated employee records were found" });
    const existing = await UtilizationReport.findOne({ user: req.userId });
    const merged = new Map((existing?.entries || []).map((entry) => {
      const raw = entry.toObject(); const key = entry.fingerprint || fingerprint(entry);
      return [key, { ...raw, fingerprint: key }];
    }));
    let added = 0; let updated = 0; let duplicates = 0;
    entries.forEach((entry) => {
      const key = fingerprint(entry); const previous = merged.get(key);
      if (!previous) { merged.set(key, { ...entry, fingerprint: key }); added += 1; return; }
      const changed = String(previous.status || "") !== entry.status || (previous.hours ?? null) !== (entry.hours ?? null);
      if (changed) { merged.set(key, { ...previous, ...entry, fingerprint: key }); updated += 1; } else duplicates += 1;
    });
    if (merged.size > 15000) return res.status(400).json({ message: "The combined history exceeds the 15,000-row limit" });
    const report = await UtilizationReport.findOneAndUpdate({ user: req.userId }, { sourceName: String(req.body.sourceName || "Daily Update.xlsx").slice(0, 255), settings: existing?.settings || { hoursPerDay: 8, workingDays: [1, 2, 3, 4, 5, 6] }, entries: [...merged.values()] }, { new: true, upsert: true, setDefaultsOnInsert: true });
    res.status(201).json({ ...buildReport(report), importStats: { added, updated, duplicates, total: merged.size } });
  } catch (err) { console.error("Utilization import error:", err); res.status(400).json({ message: err.message || "Failed to import utilization data" }); }
});

module.exports = router;
