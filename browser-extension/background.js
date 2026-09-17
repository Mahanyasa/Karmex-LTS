chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("apiUrl").then(({ apiUrl }) => {
    if (!apiUrl) chrome.storage.local.set({ apiUrl: "http://localhost:3001/api/v1" });
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "lock-vault") {
    await chrome.storage.session.remove(["vaultEntries", "vaultUnlockedAt"]);
  }
});

function matchesHostname(entry, hostname) {
  if (!entry.url || !hostname) return false;
  try {
    const saved = new URL(entry.url).hostname.replace(/^www\./, "");
    const current = hostname.replace(/^www\./, "");
    return saved === current || current.endsWith(`.${saved}`) || saved.endsWith(`.${current}`);
  } catch { return false; }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OPEN_VAULT") {
    chrome.storage.session.get("vaultEntries").then(({ vaultEntries = [] }) => {
      const matches = vaultEntries.filter((entry) => matchesHostname(entry, message.hostname));
      if (matches.length === 1) sendResponse({ entry: matches[0] });
      else {
        sendResponse({ openPopup: true });
        chrome.action.openPopup().catch(() => {});
      }
    });
    return true;
  }
  if (message?.type === "VAULT_UNLOCKED") {
    chrome.alarms.clear("lock-vault");
    chrome.alarms.create("lock-vault", { delayInMinutes: 5 });
  }
  return false;
});
