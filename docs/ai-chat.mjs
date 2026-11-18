import {contextSize, limits, validPair} from "./chat-protocol.mjs";

export const errors = {
  secure: "Open the preview over HTTPS to use AI replies.",
  access: "Check the test passphrase and retry.",
  quota: "The call limit has been reached. Offline replies are available.",
  timeout: "The request timed out. Retry or choose Offline.",
  unavailable: "The AI service is unavailable. Retry or choose Offline.",
  invalid: "The question or context exceeds the allowed limits."
};

export function recentHistory(messages) {
  const turns = [];
  for (let i = messages.length - 1; i > 0 && turns.length < limits.pairs; i--) {
    const question = messages[i-1], answer = messages[i];
    if (!answer.provider || !question.user) continue;
    const pair = {question:question.text, answer:answer.text};
    if (contextSize([pair,...turns]) > limits.contextBytes) break;
    turns.unshift(pair);
  }
  return turns;
}

export async function requestReply(mode, question, history, token) {
  if (!globalThis.isSecureContext) throw new Error("secure");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 24000);
  try {
    const response = await fetch("./api/chat", {
      method:"POST", mode:"same-origin", credentials:"omit", cache:"no-store", redirect:"error",
      headers:{"Content-Type":"application/json", Authorization:"Bearer " + token},
      body:JSON.stringify({mode,question,history}), signal:controller.signal
    });
    if (!response.ok) {
      const reason = {401:"access", 429:"quota", 504:"timeout", 400:"invalid", 413:"invalid"}[response.status];
      throw new Error(reason || "unavailable");
    }
    const {provider,en,zh} = await response.json();
    if (!["mock","openai","gemini"].includes(provider) || !validPair({en,zh})) throw new Error("unavailable");
    return {user:false, text:en, translation:zh, provider};
  } catch (error) {
    if (controller.signal.aborted) throw new Error("timeout");
    throw new Error(Object.hasOwn(errors,error.message) ? error.message : "unavailable");
  } finally { clearTimeout(timer); }
}
