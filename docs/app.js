import {modes, createResponder, transcript} from "./comedy.mjs";

const $ = id => document.getElementById(id);
const answer = createResponder();
const histories = Object.fromEntries(Object.entries(modes).map(([key, mode]) => [key, [{user:false, text:mode.greeting}]]));
const drafts = {};
let current = "qa";
let installPrompt;

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

function showMessage({user, text}) {
  const row = element("div", user ? "msg user" : "msg");
  const avatar = element("span", "avatar");
  avatar.setAttribute("aria-hidden", "true");
  avatar.append(user ? "Q" : icon("mic"));
  const content = element("div", "content");
  content.append(element("span", "who", user ? "YOU" : "TRUMPGPT"), element("p", "answer", text));
  row.append(avatar, content);
  $("thread").append(row);
}

function selectMode(key) {
  drafts[current] = $("question").value;
  current = key;
  $("question").value = drafts[key] || "";
  for (const button of $("modes").children) button.setAttribute("aria-pressed", String(button.dataset.mode === key));
  $("thread").replaceChildren();
  histories[key].forEach(showMessage);
  $("thread").scrollTop = $("thread").scrollHeight;
  $("notice").textContent = "";
  $("prompts").replaceChildren();
  for (const prompt of modes[key].prompts) {
    const button = element("button", "", prompt);
    button.onclick = () => submit(prompt);
    $("prompts").append(button);
  }
}

function submit(question) {
  const text = question.trim();
  if (!text) {
    $("notice").textContent = "Enter a question first.";
    $("question").focus();
    return;
  }
  $("notice").textContent = "";
  for (const message of [{user:true, text}, {user:false, text:answer(current, text)}]) {
    histories[current].push(message);
    showMessage(message);
  }
  $("thread").scrollTop = $("thread").scrollHeight;
}

for (const [key, mode] of Object.entries(modes)) {
  const button = element("button", "mode");
  button.dataset.mode = key;
  const badge = element("span", "mode-icon");
  badge.append(icon(mode.icon));
  const names = element("span", "mode-text");
  names.append(element("span", "name", mode.name), element("span", "desc", mode.description));
  button.append(badge, names);
  button.onclick = () => selectMode(key);
  $("modes").append(button);
}
selectMode(current);

$("composer").onsubmit = event => {
  event.preventDefault();
  submit($("question").value);
  $("question").value = "";
};
$("question").onkeydown = event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    $("composer").requestSubmit();
  }
};

$("copyBtn").onclick = async () => {
  const text = transcript(current, histories[current]);
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
      window.prompt("Copy this fictional transcript to share on X.", text);
      return;
    }
  }
  $("notice").textContent = "Conversation copied. Ready to paste into X.";
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
    $("notice").textContent = "Offline setup unavailable. You can still chat here.";
  });
}
