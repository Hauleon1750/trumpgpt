// The Worker independently applies every limit, even for hand-written requests.
export const limits = Object.freeze({
  question: 1000, answer: 900, pairs: 3, contextBytes: 10000, bodyBytes: 24576,
  outputTokens: 512
});

const bytes = new TextEncoder();
export function contextSize(history) {
  return bytes.encode(JSON.stringify(history)).length;
}

export function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}
function shortText(value, max) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
export function validChat(value) {
  return exactKeys(value, ["mode", "question", "history"]) &&
    ["qa", "press", "crisis"].includes(value.mode) &&
    shortText(value.question, limits.question) && Array.isArray(value.history) &&
    value.history.length <= limits.pairs &&
    value.history.every(pair => exactKeys(pair, ["question","answer"]) &&
      shortText(pair.question, limits.question) && shortText(pair.answer, limits.answer)) &&
    contextSize(value.history) <= limits.contextBytes;
}
export function validPair(value) {
  return exactKeys(value, ["en","zh"]) && shortText(value.en, limits.answer) &&
    shortText(value.zh, limits.answer) && /[A-Za-z]/.test(value.en) && /\p{Script=Han}/u.test(value.zh);
}
