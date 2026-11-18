import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
import api, {Quota} from "../worker/index.mjs";
import {generate, providerFor, liveProviders} from "../worker/providers.mjs";
import {limits,validChat,contextSize} from "../docs/chat-protocol.mjs";
import {recentHistory} from "../docs/ai-chat.mjs";
import {transcript} from "../docs/comedy.mjs";

const chat = {mode:"press", history:[], question:"Where is the coffee?"};
const secret = randomBytes(32).toString("hex");
function request(data=chat, token=secret, headers={}) {
  return new Request("https://preview.example/api/chat",{method:"POST",
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+token,...headers},
    body:JSON.stringify(data)});
}

// Exercise the real quota SQL and reservation handler against a fresh local SQLite database.
function fixture(vars={}) {
  const db = new DatabaseSync(":memory:");
  const storage = {
    sql:{exec(query,...args) {
      const rows = db.prepare(query).all(...args);
      return {toArray:() => rows};
    }},
    transactionSync(fn) {
      db.exec("BEGIN IMMEDIATE");
      try { const result=fn(); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    }
  };
  const env = {TEST_ACCESS_TOKEN:secret,...vars};
  const quota = new Quota({storage},env);
  env.QUOTA = {idFromName:name => name, get(name) {assert.equal(name,"global-budget-v1"); return quota;}};
  return {env,quota,db};
}

test("access protection applies even without Origin and without any configured secret",async () => {
  const {env}=fixture();
  assert.equal((await api.fetch(request(chat,"wrong"),env)).status,401);
  assert.equal((await api.fetch(request(),{})).status,401);
  assert.equal((await api.fetch(request(chat,secret,{Origin:"https://other.example"}),env)).status,403);
  assert.equal((await api.fetch(new Request("https://preview.example/api/chat"),env)).status,405);
});
test("schema, content type, streaming byte cap and bounded contexts are enforced before admission",async () => {
  const {env,db}=fixture();
  assert.equal((await api.fetch(request(chat,secret,{"Content-Type":"text/plain"}),env)).status,415);
  for (const data of [null,{...chat,model:"custom"},{...chat,url:"https://example.org"},
    {...chat,history:[{role:"system",text:"hello"}]},{...chat,question:" "},
    {...chat,mode:"unknown"},{...chat,question:"x".repeat(1001)},
    {...chat,history:Array(4).fill({question:"q",answer:"a"})}]) {
    assert.equal((await api.fetch(request(data),env)).status,400);
  }
  assert.equal((await api.fetch(request({...chat,question:"x".repeat(25000)}),env)).status,413);
  assert.equal(db.prepare("SELECT count(*) AS n FROM quota").get().n,0);
});
test("parallel requests share one rate limit and daily counts span minutes",async () => {
  const {env,db}=fixture();
  const results=await Promise.all(Array.from({length:15},()=>api.fetch(request(),env)));
  assert.equal(results.filter(r=>r.status===200).length,10);
  assert.equal(results.filter(r=>r.status===429).length,5);
  db.exec("UPDATE quota SET dayCalls=100,minute=-1");
  assert.equal((await api.fetch(request(),env)).status,429);
});
const enabled = {AI_PROVIDER:"openai",ENABLE_LIVE:"true",PROVIDER_API_KEY:secret,LIVE_CALL_LIMIT:"3",LIVE_BUDGET_CENTS:"86"};
test("live use requires a known provider, secret, explicit opt-in and finite budgets",() => {
  assert.equal(providerFor({}),"mock");
  for (const override of [{AI_PROVIDER:"other"},{ENABLE_LIVE:"false"},{PROVIDER_API_KEY:""},
    {LIVE_CALL_LIMIT:"0"},{LIVE_CALL_LIMIT:"Infinity"},{LIVE_BUDGET_CENTS:"-1"}]) {
    assert.equal(providerFor({...enabled,...override}),null);
  }
});
test("lifetime spend reservations and call cap survive day changes and provider switches",async () => {
  const {quota,env,db}=fixture(enabled);
  assert.equal((await quota.fetch()).status,200);
  db.exec("UPDATE quota SET day=-1,minute=-1");
  assert.equal((await quota.fetch()).status,200);
  assert.equal((await quota.fetch()).status,429);
  env.AI_PROVIDER="gemini";
  assert.equal((await quota.fetch()).status,429);
  env.LIVE_BUDGET_CENTS="1000";
  assert.equal((await quota.fetch()).status,200);
  assert.equal((await quota.fetch()).status,429);
  assert.equal(db.prepare("SELECT reservedCents FROM quota").get().reservedCents,97);
});
test("missing, broken or inconsistent quota storage stops the request",async () => {
  for (const binding of [null,{}, {idFromName(){},get(){return {fetch:async()=>Response.json({provider:"other"})};}}]) {
    const {env}=fixture();
    assert.equal((await api.fetch(request(),{...env,QUOTA:binding})).status,503);
  }
});
for (const name of ["openai","gemini"]) {
  test(name+" adapter uses fixed endpoint, bounded output, server role and strict bilingual result",async () => {
    const pair={en:"The chair remembers.",zh:"椅子还记得。"};
    const asResponse = value => name==="openai" ? {choices:[{finish_reason:"stop",message:{content:value}}]} :
      {candidates:[{finishReason:"STOP",content:{parts:[{text:value}]}}]};
    const history=[{question:"A prior question",answer:"A prior answer"}];
    const result=await generate(name,{...chat,history},secret, async (url,init)=>{
      assert.equal(url, liveProviders[name].url);
      assert.equal(init.redirect,"error");
      const payload=JSON.parse(init.body);
      assert.equal(payload.max_completion_tokens??payload.generationConfig.maxOutputTokens,limits.outputTokens);
      assert.ok(init.body.includes(history[0].answer) && init.body.includes("fictional"));
      assert.ok(!init.body.includes(secret));
      return Response.json(asResponse(JSON.stringify(pair)));
    });
    assert.deepEqual(result,pair);
    for (const invalid of [JSON.stringify({en:"x",zh:""}), JSON.stringify({...pair,en:"x".repeat(901)}),"unfinished"]) {
      await assert.rejects(generate(name,chat,secret,async()=>Response.json(asResponse(invalid))),/upstream/);
    }
  });
}
test("AI context selects completed pairs within count and UTF-8 limits",() => {
  const messages=[{user:false,text:"greeting"},{user:true,text:"unanswered"}];
  for(let n=0;n<6;n++) messages.push({user:true,text:String(n)+"中".repeat(999)},
    {user:false,text:"A"+"文".repeat(899),provider:"mock"});
  messages.push({user:true,text:"next?"});
  const history=recentHistory(messages);
  assert.ok(history.length && history.length<=3 && contextSize(history)<=limits.contextBytes);
  assert.equal(history.at(-1).question[0],"5");
  assert.ok(validChat({...chat,history}));
});
test("mock and translated model output retain provenance when shared",async () => {
  const {env}=fixture();
  const response=await api.fetch(request({...chat,history:[{question:"My blue mug?",answer:"Lost."}]}),env);
  const {provider,en,zh}=await response.json();
  assert.equal(provider,"mock");
  assert.ok(en.includes("My blue mug?"));
  for (const language of ["en","both","zh"]) {
    const text=transcript("press",[{user:false,text:en,translation:zh,provider}],language);
    assert.equal(text.includes(en),language!=="zh");
    assert.equal(text.includes(zh),language!=="en");
    assert.ok(text.includes(language==="en"?"Mock reply":"模拟回复"));
  }
});

test("an oversized provider envelope is rejected",async () => {
  await assert.rejects(generate("openai",chat,secret,async()=>new Response("x".repeat(32769))),/upstream/);
});
test("an upstream deadline aborts the single attempt",async t => {
  t.mock.timers.enable({apis:["setTimeout"]});
  let attempts=0;
  const result=generate("openai",chat,secret,(_,init)=>{
    attempts++;
    return new Promise((resolve,reject)=>init.signal.addEventListener("abort",()=>reject(new Error("aborted"))));
  });
  t.mock.timers.tick(18000);
  await assert.rejects(result,/timeout/);
  assert.equal(attempts,1);
});
