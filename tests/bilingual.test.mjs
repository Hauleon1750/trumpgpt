import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {modes, createResponder, transcript, disclaimer} from "../docs/comedy.mjs";
import {chinese, displayText, preferredLanguage} from "../docs/locale.mjs";

test("every authored line, suggestion and mode label has a Chinese counterpart", () => {
  for (const {icon, ...fields} of Object.values(modes)) {
    for (const source of Object.values(fields).flat()) {
      assert.match(chinese.get(source), /\p{Script=Han}/u);
      assert.equal(displayText(source, "en"), source);
      assert.equal(displayText(source, "zh"), chinese.get(source));
      assert.equal(displayText(source, "both", "\n"), source + "\n" + chinese.get(source));
    }
  }
});

test("all marked page labels are translated", async () => {
  const html = await readFile(new URL("../docs/index.html", import.meta.url), "utf8");
  for (const [,label] of html.matchAll(/data-i18n>([^<]+)</g)) {
    assert.ok(chinese.has(label), label);
  }
});

test("Chinese, mixed-language, and English questions draw from the same topic bag", () => {
  for (const mode of Object.keys(modes)) {
    const answer = createResponder(() => 0);
    for (const [topic, samples] of Object.entries({
      food: ["午餐吃什么？", "冰箱空了！", "Lunch?"],
      tech: ["Wi-Fi 怎么样？", "打印机卡纸了！", "麦克风能用吗？"],
      work: ["怎么提高工作效率？", "还能追问一句吗？", "Meetings?"],
      general: ["你喜欢云朵吗？", "今天是星期几？", "Hello!"]
    })) {
      assert.deepEqual(new Set(samples.map(q => answer(mode, q))), new Set(modes[mode][topic]));
    }
  }
});

test("displaying and exporting an existing conversation preserves the draw, order and verbatim input", () => {
  let draws = 0;
  const answer = createResponder(() => { draws++; return 0; });
  const suggestion = modes.qa.prompts[0];
  const reply = answer("qa", suggestion);
  const turns = [
    {user:true, text:suggestion, preset:true},
    {user:false, text:reply},
    {user:true, text:"今天 lunch 吃什么？"}
  ];
  const original = structuredClone(turns);
  for (const language of ["both","zh","en","both"]) {
    const text = transcript("qa", turns, language);
    assert.ok(text.startsWith("TrumpGPT — " + displayText(disclaimer, language, "\n")));
    assert.equal(text.includes(reply), language !== "zh");
    assert.equal(text.includes(chinese.get(reply)), language !== "en");
    assert.equal(text.includes(suggestion), language !== "zh");
    assert.equal(text.includes(chinese.get(suggestion)), language !== "en");
    assert.ok(text.indexOf(displayText(suggestion, language, "\n")) < text.indexOf(displayText(reply, language, "\n")));
    assert.ok(text.endsWith("今天 lunch 吃什么？"));
  }
  assert.deepEqual(turns, original);
  assert.equal(draws, 1);
});

test("language defaults to bilingual, tolerates invalid storage, and accepts saved choices", () => {
  for (const value of [null, "", "fr"]) assert.equal(preferredLanguage(value), "both");
  for (const value of ["en", "zh", "both"]) assert.equal(preferredLanguage(value), value);
});
