import {modes, createResponder, transcript, replyLabel} from "./comedy.mjs";
import {variants, displayText, preferredLanguage} from "./locale.mjs";

import {errors, recentHistory, requestReply} from "./ai-chat.mjs";

const $ = id => document.getElementById(id);
const answer = createResponder();
const histories = {};
for (const [mode, config] of Object.entries(modes)) {
  for (const source of ["offline","ai"]) histories[source + "/" + mode] = [{user:false, text:config.greeting}];
}
const requests = new Map();
let source = "offline";
const sessionKey = () => source + "/" + current;
const drafts = {};
const preferenceKey = "trumpgpt.displayLanguage";
let language = "both";
try { language = preferredLanguage(localStorage.getItem(preferenceKey)); } catch {}
let current = "qa";
let statusText = "";
let installPrompt;
const labels = Array.from(document.querySelectorAll("[data-i18n]"), node => [node, node.textContent]);

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS(svg.namespaceURI, "use");
  use.setAttribute("href", "#" + name);
  svg.setAttribute("aria-hidden", "true");
  svg.append(use);
  return svg;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderText(node, text, authored = true, translation) {
  const parts = variants(text, language, authored, translation).map(({lang, text}) => {
    const part = element("span", "variant", text);
    part.lang = lang;
    return part;
  });
  node.replaceChildren(...parts);
}

function setStatus(text) {
  statusText = text;
  renderText($("notice"), text);
}

function showMessage({user, text, preset, translation, provider}) {
  const row = element("div", user ? "msg user" : "msg");
  const avatar = element("span", "avatar");
  avatar.setAttribute("aria-hidden", "true");
  avatar.append(user ? (language === "zh" ? "问" : "Q") : icon("mic"));
  const content = element("div", "content");
  const who = element("span", "who", "TRUMPGPT");
  if (user) renderText(who, "YOU");
  if (provider) renderText(who, replyLabel(provider));
  const body = element("p", "answer");
  renderText(body, text, !user || preset === true, translation);
  content.append(who, body);
  row.append(avatar, content);
  $("thread").append(row);
}

function renderThread() {
  $("thread").replaceChildren();
  histories[sessionKey()].forEach(showMessage);
}

function renderPrompts() {
  $("prompts").replaceChildren();
  for (const prompt of modes[current].prompts) {
    const button = element("button", "");
    renderText(button, prompt);
    button.onclick = () => submit(prompt, true);
    $("prompts").append(button);
  }
}

function selectMode(key, nextSource = source) {
  drafts[sessionKey()] = $("question").value;
  current = key;
  source = nextSource;
  $("ai-settings").hidden = source !== "ai";
  for (const button of document.querySelectorAll("[data-source]")) {
    button.setAttribute("aria-pressed", String(button.dataset.source === source));
  }
  $("question").value = drafts[sessionKey()] || "";
  for (const button of $("modes").children) button.setAttribute("aria-pressed", String(button.dataset.mode === key));
  renderPrompts();
  renderThread();
  $("thread").scrollTop = $("thread").scrollHeight;
  setStatus("");
  renderRequest();
}

function renderRequest() {
  const job = requests.get(sessionKey());
  const busy = job?.busy === true;
  $("composer").querySelector(".send").disabled = busy;
  for (const button of $("prompts").children) button.disabled = busy;
  $("retry").hidden = !job || busy;
  renderText($("ai-state"), job ? (busy ? "Waiting for a reply…" : errors[job.error]) : "");
}

async function runRequest(key, job) {
  if (job.busy) return;
  job.busy = true;
  renderRequest();
  try {
    const message = await requestReply(job.mode, job.text, job.history, $("test-pass").value);
    histories[key].push(message);
    requests.delete(key);
    if (sessionKey() === key) {
      showMessage(message);
      $("thread").scrollTop = $("thread").scrollHeight;
    }
  } catch (error) {
    job.error = error.message;
  } finally {
    job.busy = false;
    if (sessionKey() === key) renderRequest();
  }
}
$("retry").onclick = () => {
  const key = sessionKey();
  const job = requests.get(key);
  if (job) void runRequest(key, job);
};
for (const button of document.querySelectorAll("[data-source]")) {
  button.onclick = () => selectMode(current, button.dataset.source);
}

function submit(question, preset = false) {
  const key = sessionKey();
  if (requests.get(key)?.busy) return false;
  const text = question.trim();
  if (!text) {
    setStatus("Enter a question first.");
    $("question").focus();
    return false;
  }
  setStatus("");
  if (source === "ai" && !$("test-pass").value) {
    setStatus(errors.access);
    $("test-pass").focus();
    return false;
  }
  const userMessage = {user:true, text, preset};
  const history = histories[key];
  history.push(userMessage);
  showMessage(userMessage);
  if (source === "offline") {
    const reply = {user:false, text:answer(current, text)};
    history.push(reply);
    showMessage(reply);
  } else {
    const job = {mode:current, text, history:recentHistory(history)};
    requests.set(key,job);
    void runRequest(key,job);
  }
  $("thread").scrollTop = $("thread").scrollHeight;
  return true;
}

for (const [key, mode] of Object.entries(modes)) {
  const button = element("button", "mode");
  button.dataset.mode = key;
  button.setAttribute("aria-pressed", String(key === current));
  const badge = element("span", "mode-icon");
  badge.append(icon(mode.icon));
  const names = element("span", "mode-text");
  for (const [style, text] of [["name", mode.name], ["desc", mode.description]]) {
    const label = element("span", style);
    labels.push([label, text]);
    names.append(label);
  }
  button.append(badge, names);
  button.onclick = () => selectMode(key);
  $("modes").append(button);
}

function renderLanguage() {
  const thread = $("thread");
  const atEnd = thread.scrollHeight - thread.scrollTop - thread.clientHeight <= 2;
  // Keep the same turn in view when the translated paragraphs change height.
  const anchor = Array.from(thread.children).findIndex(row =>
    row.getBoundingClientRect().bottom > thread.getBoundingClientRect().top);
  document.documentElement.lang = language === "zh" ? "zh-Hans" : "en";
  document.documentElement.dataset.language = language;
  for (const button of $("languages").querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.lang === language));
  }
  for (const [node, text] of labels) renderText(node, text);
  $("question").placeholder = displayText("Ask the fictional president…", language, "\n");
  $("question").rows = language === "both" ? 2 : 1;
  thread.setAttribute("aria-label", displayText("Fictional conversation", language));
  renderPrompts();
  renderThread();
  if (atEnd) thread.scrollTop = thread.scrollHeight;
  else if (anchor >= 0) thread.scrollTop += thread.children[anchor].getBoundingClientRect().top - thread.getBoundingClientRect().top;
  setStatus(statusText);
  renderRequest();
}
for (const button of $("languages").querySelectorAll("button")) {
  button.onclick = () => {
    if (language === button.dataset.lang) return;
    language = button.dataset.lang;
    try { localStorage.setItem(preferenceKey, language); } catch {}
    renderLanguage();
  };
}
renderLanguage();

$("composer").onsubmit = event => {
  event.preventDefault();
  if (submit($("question").value)) $("question").value = "";
};
$("question").onkeydown = event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    $("composer").requestSubmit();
  }
};

$("copyBtn").onclick = async () => {
  const text = transcript(current, histories[sessionKey()], language);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const field = element("textarea", "sr");
    field.value = text;
    document.body.append(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch {}
    field.remove();
    $("copyBtn").focus();
    if (!copied) {
      window.prompt(displayText("Copy this fictional transcript to share on X.", language), text);
      return;
    }
  }
  setStatus("Conversation copied. Ready to paste into X.");
};

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
});
$("install").onclick = async () => {
  if (!installPrompt) return $("help").showModal();
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
};
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    setStatus("Offline setup unavailable. You can still chat here.");
  });
}
