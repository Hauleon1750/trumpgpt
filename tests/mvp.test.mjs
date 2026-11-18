import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {createResponder, modes, transcript, disclaimer} from "../docs/comedy.mjs";

const read = path => readFile(new URL("../docs/" + path, import.meta.url));
const samples = {food: "WHAT'S FOR LUNCH?", tech: "Wi-fi?", work: "Are there any meetings?", general: "What about clouds?"};

test("36 distinct authored answers across three modes and four topics", () => {
  assert.equal(Object.keys(modes).length, 3);
  const lines = Object.values(modes).flatMap(mode => Object.keys(samples).flatMap(topic => mode[topic]));
  assert.equal(new Set(lines).size, 36);
});
for (const mode of Object.keys(modes)) {
  test(mode + " matches keywords and exhausts each pool before repeating", () => {
    const respond = createResponder();
    for (const [topic, question] of Object.entries(samples)) {
      let last;
      for (let cycle = 0; cycle < 10; cycle++) {
        const batch = Array.from({length:3}, () => respond(mode, question));
        assert.notEqual(batch[0], last);
        assert.deepEqual(new Set(batch), new Set(modes[mode][topic]));
        last = batch.at(-1);
      }
    }
  });
}
test("shared transcript starts with fiction disclosure and preserves turn order", () => {
  const turns = [{user:true, text:"One?"}, {user:false,text:"Two."}];
  assert.equal(transcript("press", turns), "TrumpGPT — " + disclaimer + "\n\nPress Conference\n\nQuestion: One?\n\nFictional president: Two.");
});
test("PWA manifest resolves under a Pages project and has valid PNG dimensions", async () => {
  const manifest = JSON.parse(await read("manifest.webmanifest"));
  const root = "https://example.github.io/trumpgpt/";
  for (const key of ["id","start_url","scope"]) assert.equal(new URL(manifest[key],root).href, root);
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    const png = await read(icon.src);
    assert.equal(png.subarray(1,4).toString(),"PNG");
    assert.equal(png.readUInt32BE(16) + "x" + png.readUInt32BE(20),icon.sizes);
  }
});
test("service worker installs local assets, serves an offline launch, and isolates cache cleanup", async () => {
  const scope = "https://example.github.io/trumpgpt/";
  const prefix = "trumpgpt:" + encodeURIComponent(scope) + ":";
  const entries = new Map();
  const handlers = {};
  let deleted = [];
  const cache = {
    async addAll(paths) {
      for (const path of paths) entries.set(new URL(path,scope).href, await read(path === "./" ? "index.html" : path));
    },
    match(request) {return entries.get(request.url || request);}
  };
  const caches = {
    open: async () => cache, keys: async () => [prefix + "v1", prefix + "old", "other-project"],
    delete: async key => deleted.push(key)
  };
  const self = {registration:{scope}, clients:{claim() {}}, addEventListener(type,fn){handlers[type] = fn;}};
  vm.runInNewContext((await read("sw.js")).toString(), {self, caches, URL, fetch:async () => {throw Error("offline");}});
  await new Promise((resolve,reject) => handlers.install({waitUntil: promise => promise.then(resolve,reject)}));
  await new Promise((resolve,reject) => handlers.activate({waitUntil: promise => promise.then(resolve,reject)}));
  assert.deepEqual(deleted,[prefix + "old"]);
  for (const path of ["","?from=homescreen","app.js","comedy.mjs","style.css","assets/press-mics.png"]) {
    const request = {url:scope + path, method:"GET", mode:path.includes(".") ? "cors" : "navigate"};
    const body = await new Promise(resolve => handlers.fetch({request, respondWith:resolve}));
    assert.ok(body.length);
  }
  handlers.fetch({request:{url:"https://example.github.io/phonetics/",method:"GET"}, respondWith(){assert.fail("intercepted unrelated app");}});
});
