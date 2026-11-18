const types = ["speech", "prepared", "institutional"];
const text = value => typeof value === "string" && value.trim().length > 0;
const bilingual = value => value && text(value.en) && text(value.zh);
const keywords = list => Array.isArray(list) && list.length > 0 && list.every(text);
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(+date) && date.toISOString().startsWith(value);
}

// Unsupported sources and candidate records never enter the published collection.
export function isVerified(r) {
  if (!r || !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(r.id) ||
      !text(r.english) || r.english.length > 350 || !text(r.translation) ||
      !types.includes(r.kind) || !text(r.speaker) || !validDate(r.date) ||
      !bilingual(r.context) || !bilingual(r.document) ||
      !keywords(r.topics?.en) || !keywords(r.topics?.zh) ||
      r.verification?.status !== "verified" || !validDate(r.verification.checked) ||
      r.verification.checked < r.date || r.publisher !== "The White House") return false;
  if ((r.kind === "institutional") !== (r.speaker === "The White House")) return false;
  try {
    const url = new URL(r.source);
    if (url.username || url.password || url.search || url.hash) return false;
    return (url.origin === "https://www.whitehouse.gov" && r.platform === "WhiteHouse.gov" &&
      /^\/(?:remarks|fact-sheets)\/.+/.test(url.pathname)) ||
      (url.origin === "https://trumpwhitehouse.archives.gov" && r.platform === "Trump White House Archives (NARA)" &&
      /^\/briefings-statements\/.+/.test(url.pathname));
  } catch { return false; }
}

export function collection(data) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.records)) throw Error("Unsupported catalogue");
  const seen = new Set();
  return data.records.filter(r => {
    if (!isVerified(r)) return false;
    if (seen.has(r.id)) throw Error("Duplicate archive ID");
    seen.add(r.id);
    return true;
  });
}

function normalize(input) {
  return input.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Match curated topics inside natural questions, using whole words for English.
export function search(records, input) {
  const query = normalize(input);
  if (!query) return [];
  const words = " " + query + " ";
  const claimedSpeakers = [
    ["Donald J. Trump", /\btrump\b|特朗普|川普/u],
    ["Mike Pence", /\bpence\b|彭斯/u],
    ["The White House", /white house (?:statement|fact sheet|said|say|wrote)|白宫(?:声明|文件|说|情况说明)/u]
  ].filter(([,pattern]) => pattern.test(query)).map(([name]) => name);
  return records.filter(r => !claimedSpeakers.length || claimedSpeakers.includes(r.speaker)).map(record => {
    let score = 0;
    for (const tag of record.topics.en) {
      const key = normalize(tag);
      if (words.includes(" " + key + " ")) score += key.split(" ").length;
    }
    for (const tag of record.topics.zh) {
      if (query.includes(normalize(tag))) score += tag.length;
    }
    if (query.length >= 4 && (" " + normalize(record.english) + " ").includes(words)) score += 2;
    if (query.length >= 2 && normalize(record.translation).includes(query)) score += 2;
    return {record, score};
  }).filter(hit => hit.score > 0).sort((a,b) => b.score - a.score).map(hit => hit.record);
}
