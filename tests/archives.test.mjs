import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {collection,isVerified,search} from "../docs/archive-data.mjs";

const data = JSON.parse(await readFile(new URL("../docs/data/quotes.json",import.meta.url),"utf8"));
const published = collection(data);

test("all published rows pass schema and source checks with unique IDs and excerpts", () => {
  assert.ok(data.records.length >= 10);
  assert.equal(published.length,data.records.length);
  assert.equal(new Set(published.map(r => r.english)).size,published.length);
  for (const r of published) {
    assert.match(r.translation,/\p{Script=Han}/u);
    assert.ok(r.topics.zh.every(tag => /\p{Script=Han}/u.test(tag)));
    assert.ok(r.english.split(/\s+/).length <= 35);
  }
});

test("pending, malformed and misattributed material is excluded before lookup", () => {
  const original = published[0];
  for (const change of [
    {verification:{status:"candidate",checked:"2026-11-18"}}, {speaker:""}, {kind:"repost"},
    {date:"2020-02-31"}, {kind:"institutional"}, {source:"https://example.com/remarks/event/"},
    {source:"https://www.whitehouse.gov@example.org/remarks/event/"}, {translation:""},
    {platform:"X"}, {topics:{en:[],zh:["火鸡"]}}
  ]) {
    assert.deepEqual(collection({...data,records:[{...original,...change}]}),[]);
  }
  assert.throws(()=>collection({...data,records:[original,original]}),/Duplicate/);
  assert.throws(()=>collection({...data,schemaVersion:7}));
});

test("one bilingual topic query returns a complete attributed record", () => {
  for (const q of ["Tell me about a recount.","重新计票是怎么回事？"]) {
    assert.equal(search(published,q)[0].id,"2018-carrots-recount");
  }
  assert.equal(search(published,"Did he mention the planet Mars?")[0].id,"2025-mars");
  assert.equal(search(published,"他对火星怎么说？")[0].id,"2025-mars");
  assert.equal(search(published,"space is a vacuum")[0].speaker,"Mike Pence");
  for (const q of ["photovoltaics", "今天的量子纠缠问题", "marshmallow", "", "？！"]) {
    assert.deepEqual(search(published,q),[]);
  }
});

test("institutional writing, prepared text and other speakers retain their own attribution", () => {
  const [r] = search(published,"白宫文件提到吸管吗？");
  assert.equal(r.speaker,"The White House");
  assert.equal(r.kind,"institutional");
  assert.equal(search(published,"特朗普谈过纸吸管吗？").length,0);
  assert.equal(search(published,"What did Pence say about space?")[0].speaker,"Mike Pence");
  assert.equal(search(published,"特朗普谈就业")[0].kind,"prepared");
  assert.ok(published.every(isVerified));
});


test("publication matches the separately reviewed source attribution and rights record", async () => {
  const reviews = JSON.parse(await readFile(new URL("../review/sources.json",import.meta.url),"utf8"));
  for (const row of published) {
    const reviewed = reviews[row.source];
    assert.ok(reviewed?.attributionNote && reviewed.rights.endsWith("/copyright/"),row.id);
    for (const field of ["date","speaker","kind","publisher","platform"]) {
      assert.equal(row[field],reviewed[field],row.id + " " + field);
    }
  }
});
