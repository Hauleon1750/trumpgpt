import {preferredLanguage} from "./locale.mjs";
import {collection, search} from "./archive-data.mjs";

const $ = id => document.getElementById(id);
const labels = Array.from(document.querySelectorAll("[data-zh]"), el => [el,el.textContent,el.dataset.zh]);
const preference = "trumpgpt.displayLanguage";
const names = {"Donald J. Trump":"唐纳德·特朗普","Mike Pence":"迈克·彭斯","The White House":"白宫"};
const kinds = {
  speech:["Speech transcript","讲话实录"], prepared:["Prepared remarks","预备讲稿"],
  institutional:["White House statement","白宫机构文件"]
};
let language = "both";
try { language = preferredLanguage(localStorage.getItem(preference)); } catch {}
let records = [];
let status = "loading";
const turns = [];
let feed = "closed";

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function localize(el, en, zh) {
  const pieces = language === "both" ? [["en",en],["zh-Hans",zh]] :
    language === "en" ? [["en",en]] : [["zh-Hans",zh]];
  el.replaceChildren(...pieces.map(([lang,value]) => {
    const span = node("span","variant",value);
    span.lang = lang;
    return span;
  }));
  return el;
}
function card(r) {
  const article = node("article","archive-card");
  const [enKind,zhKind] = kinds[r.kind];
  article.append(localize(node("p","doc-type"),"Verified quotation · " + enKind,"真实引言 · " + zhKind));
  if (language !== "zh") {
    const quote = node("blockquote","",r.english);
    quote.lang = "en";
    quote.cite = r.source;
    article.append(quote);
  }
  if (language !== "en") {
    const translation = node("p","translation");
    translation.lang = "zh-Hans";
    translation.append(node("strong","","中文译文"), document.createTextNode(r.translation));
    article.append(translation);
  }
  article.append(localize(node("p","speaker"),r.speaker,names[r.speaker] || r.speaker));
  const meta = node("p","quote-meta");
  const date = node("time","",r.date);
  date.dateTime = r.date;
  const platform = r.platform === "WhiteHouse.gov" ? "WhiteHouse.gov" : "美国国家档案馆保存的白宫旧站";
  meta.append(date," · ",localize(node("span"),r.publisher + " · " + r.platform,"白宫 · " + platform));
  const link = localize(node("a","source-link"),"Source · " + r.document.en + " ↗","原始文献 · " + r.document.zh + " ↗");
  link.href = r.source;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  article.append(meta,localize(node("p","context"),r.context.en,r.context.zh),link);
  return article;
}
function renderResults() {
  const value = $("search").value.trim();
  const hits = value ? search(records,value) : records;
  $("results").replaceChildren(...hits.map(card));
  if (status !== "ready") { $("count").replaceChildren(); return; }
  localize($("count"),hits.length + " verified excerpts",hits.length + " 条已核实引文");
  if (!hits.length) $("results").append(noMatch());
}
function noMatch() {
  return localize(node("p"),"No verified excerpt matches this topic.","没有找到与该主题匹配的已核实引言。");
}
function turnView(turn) {
  const row = node("div");
  row.append(node("p","query-turn",turn.question), turn.hit ? card(turn.hit) : noMatch());
  return row;
}
function renderFeed() {
  const opened = feed === "open";
  localize($("load-feed"),opened ? "Close timeline" : "Load X timeline",opened ? "关闭时间线" : "加载 X 时间线");
  const hint = $("feed-status");
  if (opened) localize(hint,"If X shows no posts, use the account link above.","若 X 未显示动态，可使用上方的官方账号链接。");
  else if (feed === "offline") localize(hint,"X needs a connection. The collection works offline.","查看 X 需要联网。已收录的引文仍可离线使用。");
  else hint.replaceChildren();
}
function render() {
  document.documentElement.lang = language === "zh" ? "zh-Hans" : "en";
  document.documentElement.dataset.language = language;
  for (const [el,en,zh] of labels) localize(el,en,zh);
  for (const btn of document.querySelectorAll("[data-lang]")) btn.setAttribute("aria-pressed",String(btn.dataset.lang === language));
  $("catalog-status").replaceChildren();
  if (status === "loading") localize($("catalog-status"),"Opening the collection…","正在打开档案库…");
  if (status === "failed") localize($("catalog-status"),"The collection could not be opened. Reload to try again.","未能打开档案库。请重新加载后再试。");
  $("search").disabled = $("find").disabled = status !== "ready";
  renderResults();
  $("archive-thread").replaceChildren(...turns.map(turnView));
  renderFeed();
}
function showPanel() {
  const ask = location.hash === "#ask";
  $("ask").hidden = !ask;
  $("browse").hidden = ask;
  if (ask && feed === "open") {
    $("feed-box").replaceChildren();
    feed = "closed";
    renderFeed();
  }
  $(ask ? "ask-tab" : "browse-tab").setAttribute("aria-current","page");
  $(ask ? "browse-tab" : "ask-tab").removeAttribute("aria-current");
}
for (const btn of document.querySelectorAll("[data-lang]")) btn.onclick = () => {
  language = preferredLanguage(btn.dataset.lang);
  try { localStorage.setItem(preference,language); } catch {}
  render();
};
$("load-feed").onclick = () => {
  if (feed === "open") {
    $("feed-box").replaceChildren();
    feed = "closed";
  } else if (!navigator.onLine) feed = "offline";
  else {
    const frame = node("iframe");
    frame.title = "@WhiteHouse · X";
    // The published widget needs a regular document origin to initialize its timeline.
    // Browsers supporting credentialless can isolate cookies for this embedding context.
    frame.setAttribute("credentialless","");
    frame.referrerPolicy = "no-referrer";
    frame.src = "./x-feed.html";
    $("feed-box").replaceChildren(frame);
    feed = "open";
  }
  renderFeed();
};
$("search").oninput = renderResults;
$("archive-form").onsubmit = event => {
  event.preventDefault();
  const question = $("query").value.trim();
  if (!question || status !== "ready") return;
  const turn = {question,hit:search(records,question)[0]};
  turns.push(turn);
  const thread = $("archive-thread");
  thread.append(turnView(turn));
  thread.scrollTop = thread.scrollHeight;
  $("query").value = "";
};
$("query").onkeydown = event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    $("archive-form").requestSubmit();
  }
};
window.addEventListener("hashchange",showPanel);
showPanel();
render();
try {
  const response = await fetch("./data/quotes.json");
  if (!response.ok) throw Error("Catalogue unavailable");
  records = collection(await response.json());
  status = "ready";
} catch { status = "failed"; }
render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
