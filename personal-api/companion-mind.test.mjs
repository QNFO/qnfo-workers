// personal-api/companion-mind.test.mjs (MIND-IN-COMPANION-1): Mind is part of Today: short static cards, deterministic pick, no typing, no model per view.
import assert from "node:assert/strict";
import * as C from "./companion.js";

for (const c of C.MIND_CARDS) { const l = C.mindLint(c); assert.ok(l.ok, c.id + " fails lint: " + l.why.join(", ")); assert.ok(C.mindWords(c) <= C.MIND_MAX_WORDS, c.id + " too long"); }
assert.ok(C.MIND_CARDS.length >= 20 && new Set(C.MIND_CARDS.map((c) => c.id)).size === C.MIND_CARDS.length, "20+ unique seed cards");
for (const t of C.MIND_TAGS) assert.ok(C.MIND_CARDS.some((c) => c.tags.includes(t)), "a card for " + t);
// lint refuses what a card must never say
for (const bad of ["This cures anxiety and is a proven treatment for depression.", "You should take medication for this.", "See https://example.com now.", "Type your thoughts in the box."]) {
  assert.ok(!C.mindLint({ id: "x1", tags: ["low"], title: "T", what: bad + " ".repeat(1) + "More words so that the explanation is long enough to pass the length check on its own merits.", tries: ["a"] }).ok, bad);
}
// picking follows the moment, deterministically
const pick = (st, o) => C.pickMindCard(C.MIND_CARDS, st, o);
assert.ok(pick({ day: "2026-11-12", hour: 14, feelings: "anxious,tired" }).card.tags.includes("anxious"), "feeling wins");
assert.ok(pick({ day: "2026-11-12", hour: 23 }).card.tags.includes("night"), "late hour");
assert.ok(pick({ day: "2026-11-12", hour: 14, score: 1 }).card.tags.includes("low"), "low score");
assert.ok(pick({ day: "2026-11-12", hour: 14, tag: "calm" }).card.calm, "calm tie-in");
assert.equal(pick({ day: "2026-11-12", hour: 14 }).card.id, pick({ day: "2026-11-12", hour: 14 }).card.id, "stable within a day");
const a = pick({ day: "2026-11-12", hour: 14, feelings: "anxious" });
const b = pick({ day: "2026-11-12", hour: 14, feelings: "anxious" }, { skip: [a.card.id] });
assert.notEqual(a.card.id, b.card.id, "Another one changes the card");
assert.notEqual(pick({ day: "2026-11-12", hour: 14, feelings: "anxious" }, { down: [a.card.id] }).card.id, a.card.id, "Not for me hides it");
assert.ok(pick({ day: "2026-11-12", hour: 14 }), "no data still gives a card");
// books are a go-deeper list with summaries
assert.equal(C.MIND_BOOKS.length, 24);
assert.ok(C.MIND_BOOKS.every((x) => x.t && x.w && x.lane));
// the generator's output is linted before it can be shown
const g = C.mindParseGrown('{"title":"A calm one","what":"' + "word ".repeat(20) + '","tries":["Stand up and stretch."]}', "tired", "g1");
assert.ok(g && C.mindLint(g).ok === true, "a clean generated card passes");
assert.ok(!C.mindLint(C.mindParseGrown('{"title":"x","what":"Therapy and medication will cure you, proven.' + " word".repeat(20) + '","tries":["ok"]}', "low", "g2")).ok, "a risky generated card is refused");
assert.equal(C.mindGrowTag([]), C.MIND_TAGS[0]);
// page: card on Today, no typing, no model call
const html = await C.handleCompanion(new Request("https://me.q08.org/companion"), { PERSONAL: null }, { waitUntil() {} }, {}).then((r) => r.text());
assert.ok(!html.includes("__MIND_JS__") && html.includes("function mindCard") && html.includes("mind-slot") && html.includes("/companion/api/mind"), "Today carries the mind card");
assert.ok(html.includes("Go deeper") && html.includes("This helps") && html.includes("Another one"));
assert.ok(!/<input|<textarea|placeholder/.test(C.MIND_JS), "no typing in the mind flow");
assert.ok(!/\/companion\/api\/(talk|chat|clarify)/.test(C.MIND_JS), "no model call per view");
for (const sc of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])) new Function(sc);
console.log("ok   mind cards: linted, deterministic, on Today, no typing, books under Go deeper");
