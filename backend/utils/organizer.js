// Rule-based dictation parser + day organizer.
// No external AI call - pure local heuristics.

const PRIORITY_WORDS = {
  high: ["urgent", "asap", "important", "critical", "must", "priority"],
  low: ["sometime", "eventually", "whenever", "low priority", "later"],
};

// Very small keyword-based time extractor, e.g. "at 9am", "at 9:30", "by 5pm"
function extractTimeHint(text) {
  const match = text.match(
    /\b(?:at|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i
  );
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const meridian = match[3] ? match[3].toLowerCase() : null;

  if (meridian === "pm" && hour < 12) hour += 12;
  if (meridian === "am" && hour === 12) hour = 0;

  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

// e.g. "for 30 minutes", "for 1 hour", "for 2 hrs"
function extractDuration(text) {
  const match = text.match(
    /\bfor\s+(\d+(?:\.\d+)?)\s*(minute|min|hour|hr)s?\b/i
  );
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  return unit.startsWith("h") ? Math.round(value * 60) : Math.round(value);
}

function extractPriority(text) {
  const lower = text.toLowerCase();
  for (const word of PRIORITY_WORDS.high) {
    if (lower.includes(word)) return "high";
  }
  for (const word of PRIORITY_WORDS.low) {
    if (lower.includes(word)) return "low";
  }
  return "medium";
}

// Splits a raw dictated string into individual task phrases.
// Splits on "and then", "then", commas, "and", or sentence-ending punctuation.
function splitDictationIntoTasks(raw) {
  if (!raw || !raw.trim()) return [];

  const normalized = raw
    .replace(/\band then\b/gi, "|")
    .replace(/\bthen\b/gi, "|")
    .replace(/\. /g, "|")
    .replace(/,\s*and\b/gi, "|")
    .replace(/,/g, "|");

  return normalized
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

function parseDictation(raw) {
  const chunks = splitDictationIntoTasks(raw);
  return chunks.map((text) => ({
    text: text.charAt(0).toUpperCase() + text.slice(1),
    priority: extractPriority(text),
    timeHint: extractTimeHint(text),
    duration: extractDuration(text),
  }));
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

// Sort tasks for the day: timed tasks first (by time), then by priority,
// then by original creation order as a tiebreaker.
function organizeTasks(tasks) {
  const withIndex = tasks.map((t, i) => ({ t, i }));

  withIndex.sort((a, b) => {
    const ta = a.t.timeHint;
    const tb = b.t.timeHint;

    if (ta && tb) {
      if (ta !== tb) return ta < tb ? -1 : 1;
    } else if (ta && !tb) {
      return -1;
    } else if (!ta && tb) {
      return 1;
    }

    const pa = PRIORITY_RANK[a.t.priority] ?? 1;
    const pb = PRIORITY_RANK[b.t.priority] ?? 1;
    if (pa !== pb) return pa - pb;

    return a.i - b.i;
  });

  return withIndex.map(({ t }, idx) => ({ ...t, sortOrder: idx }));
}

module.exports = {
  parseDictation,
  organizeTasks,
  extractTimeHint,
  extractDuration,
  extractPriority,
};
