import {limits, validChat} from "../docs/chat-protocol.mjs";
import {generate, liveLimits, liveProviders, providerFor} from "./providers.mjs";

function reply(status, body) {
  return Response.json(body, {status, headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}

async function authorized(request, secret) {
  const token = request.headers.get("Authorization") || "";
  if (!secret || secret.length < 32 || secret.length > 256 || token.length > 263 || !token.startsWith("Bearer ")) return false;
  const digest = s => crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  const [a,b] = await Promise.all([digest(token.slice(7)),digest(secret)]);
  const expected = new Uint8Array(b);
  let diff = 0;
  new Uint8Array(a).forEach((v,i) => { diff |= v ^ expected[i]; });
  return diff === 0;
}

async function readChat(request) {
  if (!request.body) return reply(400,{error:"invalid"});
  const reader = request.body.getReader();
  const buffer = new Uint8Array(limits.bodyBytes);
  let used = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      if (used + value.length > buffer.length) {
        void reader.cancel().catch(() => {});
        return reply(413,{error:"size"});
      }
      buffer.set(value,used);
      used += value.length;
    }
    const chat = JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(buffer.subarray(0,used)));
    return validChat(chat) ? chat : reply(400,{error:"invalid"});
  } catch { return reply(400,{error:"invalid"}); }
}

// One globally named object across users, modes and providers. Only counters are persisted.
export class Quota {
  constructor(ctx, env) {
    this.storage = ctx.storage;
    this.env = env;
    this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS quota (
      id INTEGER PRIMARY KEY, minute INTEGER, minuteCalls INTEGER, day INTEGER, dayCalls INTEGER,
      liveCalls INTEGER, reservedCents INTEGER)`);
  }
  async fetch() {
    const name = providerFor(this.env);
    if (!name) return reply(503,{error:"disabled"});
    return this.storage.transactionSync(() => {
      const minute = Math.floor(Date.now()/60000);
      const day = Math.floor(minute/1440);
      const row = this.storage.sql.exec("SELECT * FROM quota WHERE id = 1").toArray()[0] || {};
      const minuteCalls = row.minute === minute ? row.minuteCalls : 0;
      const dayCalls = row.day === day ? row.dayCalls : 0;
      let liveCalls = row.liveCalls || 0;
      let reservedCents = row.reservedCents || 0;
      if (minuteCalls >= 10 || dayCalls >= 100) return reply(429,{error:"quota"});
      if (name !== "mock") {
        const budget = liveLimits(this.env);
        liveCalls++;
        reservedCents += liveProviders[name].reserveCents;
        if (liveCalls > budget.calls || reservedCents > budget.cents) return reply(429,{error:"budget"});
      }
      this.storage.sql.exec("INSERT OR REPLACE INTO quota VALUES (1, ?, ?, ?, ?, ?, ?)",
        minute, minuteCalls + 1, day, dayCalls + 1, liveCalls, reservedCents);
      return reply(200,{provider:name});
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/chat") return reply(404,{error:"missing"});
    if (request.method !== "POST") return reply(405,{error:"method"});
    if (request.headers.has("Origin") && request.headers.get("Origin") !== url.origin) return reply(403,{error:"origin"});
    if (!await authorized(request,env.TEST_ACCESS_TOKEN)) return reply(401,{error:"access"});
    if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json")
      return reply(415,{error:"type"});
    if (Number(request.headers.get("Content-Length")) > limits.bodyBytes) return reply(413,{error:"size"});
    const name = providerFor(env);
    if (!name || !env.QUOTA) return reply(503,{error:"disabled"});
    const chat = await readChat(request);
    if (chat instanceof Response) return chat;
    try {
      const gate = env.QUOTA.get(env.QUOTA.idFromName("global-budget-v1"));
      const reservation = await gate.fetch("https://internal/reserve",{method:"POST"});
      if (reservation.status === 429) return reply(429,{error:"quota"});
      if (!reservation.ok || (await reservation.json()).provider !== name) return reply(503,{error:"disabled"});
    } catch { return reply(503,{error:"disabled"}); }
    try {
      const pair = await generate(name,chat,env.PROVIDER_API_KEY);
      return reply(200,{provider:name, ...pair});
    } catch (error) {
      return error.message === "timeout" ? reply(504,{error:"timeout"}) : reply(502,{error:"upstream"});
    }
  }
};
