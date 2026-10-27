import test from "node:test";
import assert from "node:assert/strict";
import { splitSentences, numTokens, validateBeats, capAllows, nextCandidate, parseSections, jsonFromText, buildMetadata, shapeOk, CRON_TABLE, VERSION } from "./worker.js";

const article = {
  title: "Why scientists stop testing ideas", short: "Safe stories pay better than risky guesses.",
  sections: [{ h: "The catch", paras: ["A guess must be right more than two times in three. At six in ten, the story pays better.", "Only one in ten testers is left."] }]
};

test("number words and digits normalise to the same tokens", () => {
  assert.deepEqual(numTokens("six in ten and 2,000 and 3.50"), ["6", "10", "2000", "3.5"]);
});
test("a beat whose numbers are in the article survives", () => {
  const b = { kind: "points", narr: "A guess must be right more than two times in three.", items: ["Right 2 in 3 times"] };
  assert.equal(validateBeats([b], article, []).kept.length, 1);
});
test("a beat with a number absent from the article is dropped", () => {
  const b = { kind: "stat", narr: "The model found 73 percent.", value: "73%", label: "share" };
  const v = validateBeats([b], article, []);
  assert.equal(v.kept.length, 0);
  assert.equal(v.dropped[0].why, "number-not-in-article");
  assert.deepEqual(v.dropped[0].numbers, ["73"]);
});
test("the checker model's unsupported indexes drop their beats", () => {
  const ok = { kind: "points", narr: "Safe stories pay better.", items: ["Safe stories win"] };
  const v = validateBeats([ok, Object.assign({}, ok)], article, [1]);
  assert.equal(v.kept.length, 1);
  assert.equal(v.dropped[0].why, "claim-not-in-article");
});
test("bad shapes and unknown kinds are dropped, not repaired", () => {
  assert.equal(shapeOk({ kind: "points", narr: "x", items: [] }), false);
  assert.equal(shapeOk({ kind: "bogus", narr: "x" }), false);
  assert.equal(shapeOk({ kind: "meter", narr: "x", need: 2, have: 0.5, need_label: "a", have_label: "b", axis_label: "c", verdict: "d" }), false);
  assert.equal(shapeOk({ kind: "hook", narr: "x", lines: ["a", "b"], hi: [5] }), false);
});
test("narration is capped so the Short stays under a minute", () => {
  const long = { kind: "points", narr: Array(200).fill("safe").join(" ") + ".", items: ["a"] };
  assert.equal(validateBeats([long], article, []).dropped[0].why, "too-long");
});
test("sentences split for TTS", () => {
  assert.deepEqual(splitSentences("One. Two? Three!  Four"), ["One.", "Two?", "Three!", "Four"]);
});
test("weekly cap is 2", () => { assert.equal(capAllows(1), true); assert.equal(capAllows(2), false); });
test("newest paper without a row is chosen", () => {
  const rows = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];
  assert.equal(nextCandidate(rows, ["a"]).slug, "b");
  assert.equal(nextCandidate(rows, ["a", "b", "c"]), null);
});
test("article body JSON parses to sections", () => {
  assert.equal(parseSections(JSON.stringify([{ h: "x", paras: ["y"] }])).length, 1);
  assert.deepEqual(parseSections("not json"), []);
});
test("model JSON is extracted from fenced or thinking output", () => {
  assert.equal(jsonFromText("<think>hm</think>```json\n{\"a\":1}\n```").a, 1);
  assert.throws(() => jsonFromText("no braces"));
});
test("metadata is public by default, synthetic and links the article", () => {
  const m = buildMetadata({ title: "T", short: "S" }, "slug-1", "My title", 48);
  assert.equal(m.privacyStatus, "public");
  assert.equal(m.containsSyntheticMedia, true);
  assert.match(m.title, /#Shorts$/);
  assert.match(m.description, /papers\.qnfo\.org\/papers\/slug-1\/quickread/);
  assert.match(m.description, /synthetic/);
});
test("single hourly cron entry and a versioned worker", () => {
  assert.deepEqual(CRON_TABLE, ["0 * * * *"]);
  assert.match(VERSION, /^\d+\.\d+\.\d+/);
});
import { spendUsd, spendAllows } from "./worker.js";
test("spend ledger arithmetic and the hard stop at 45 USD", () => {
  assert.ok(spendUsd("tts", 1000) > 0 && spendUsd("container", 600) > 0);
  assert.equal(spendAllows(44.99), true);
  assert.equal(spendAllows(45), false);
});
test("videos are public by default (owner directive 2026-10-27)", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  assert.match(src, /var PRIVACY = "public"/);
  assert.equal(buildMetadata({ title: "T", short: "S" }, "s", "t", 1).privacyStatus, "public");
});
