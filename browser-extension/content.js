const BUTTON_CLASS = "karmex-lts-fill-button";

function visible(input) {
  const rect = input.getBoundingClientRect();
  const style = getComputedStyle(input);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function loginFields() {
  const passwords = [...document.querySelectorAll('input[type="password"]')].filter(visible);
  return passwords.map((password) => {
    const form = password.form || password.closest("form") || document;
    const candidates = [...form.querySelectorAll('input[type="email"], input[type="text"], input:not([type])')].filter(visible);
    const username = candidates.find((input) => /user|email|login|account/i.test(`${input.name} ${input.id} ${input.autocomplete} ${input.placeholder}`)) || candidates[0] || null;
    return { username, password };
  });
}

function setValue(input, value) {
  if (!input || value == null) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function addButtons() {
  loginFields().forEach(({ password }) => {
    if (password.dataset.karmexReady) return;
    password.dataset.karmexReady = "true";
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.textContent = "K";
    button.title = "Fill from Karmex LTS";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      password.focus();
      const response = await chrome.runtime.sendMessage({ type: "OPEN_VAULT", hostname: location.hostname });
      if (response?.entry) {
        const fields = loginFields().find((item) => item.password === password) || loginFields()[0];
        setValue(fields?.username, response.entry.username || response.entry.email || response.entry.phone || "");
        setValue(fields?.password, response.entry.password || "");
      }
    });
    password.insertAdjacentElement("afterend", button);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PAGE_CONTEXT") {
    sendResponse({ hostname: location.hostname, url: location.href, hasLoginForm: loginFields().length > 0 });
  }
  if (message?.type === "FILL_CREDENTIAL") {
    const fields = loginFields()[0];
    if (!fields) return sendResponse({ ok: false, message: "No visible login form found" });
    setValue(fields.username, message.entry.username || message.entry.email || message.entry.phone || "");
    setValue(fields.password, message.entry.password || "");
    sendResponse({ ok: true });
  }
  return true;
});

addButtons();
new MutationObserver(addButtons).observe(document.documentElement, { childList: true, subtree: true });
