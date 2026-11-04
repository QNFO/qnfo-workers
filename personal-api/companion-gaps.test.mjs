// personal-api/companion-gaps.test.mjs (COMPANION-GAPS-1, 2026-11-04)
// Run: node personal-api/companion-gaps.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import * as C from "./companion.js";

// COMPANION-ONE-THING-PUSH-1: check-ins off, nothing due, no event: an open next action still reaches the phone once, at midday.
const now = "2026-11-04T12:00:00Z";
const base = { nowIso: now, day: "2026-11-04", hour: 13, tz: "Europe/Amsterdam", pushReady: true, cfg: {}, events: [], mood: {} };
const foam = { id: "task-foam", title: "Go to Foam", minutes: 30, energy: "medium", context: "@outside" };
const p = C.planNudge({ ...base, nextActions: [foam] });
assert.equal(p.kind, "cmp-next");
assert.equal(p.action_id, "task-foam");
assert.match(p.ask, /^One thing for now: Go to Foam \(30 min\)/);
assert.ok(!/feel|mood|how are you/i.test(p.ask), "a plain offer, not a feelings question");
assert.equal(C.pushPayloadFor(p).ask, true, "Did it / Not today buttons");
assert.equal(C.planNudge({ ...base, hour: 9, nextActions: [foam] }).skip, "nothing-useful", "not before 11:00");
assert.equal(C.planNudge({ ...base, hour: 18, nextActions: [foam] }).skip, "nothing-useful", "not after 17:00");
assert.equal(C.planNudge({ ...base, lastUserIso: "2026-11-04T11:30:00Z", nextActions: [foam] }).skip, "nothing-useful", "not while in the app");
assert.equal(C.planNudge({ ...base, actionsDoneToday: 1, nextActions: [foam] }).skip, "nothing-useful", "not after something is done");
assert.equal(C.planNudge({ ...base, todays: [{ kind: "cmp-next" }], nextActions: [foam] }).skip, "nothing-useful", "once a day");
assert.equal(C.planNudge({ ...base, retired: new Set(["cmp-next"]), nextActions: [foam] }).skip, "nothing-useful", "a retired kind stays off");
assert.equal(C.planNudge({ ...base, nextActions: [{ ...foam, due: "2027-01-01" }] }).skip, "nothing-useful", "not a future task");
assert.equal(C.planNudge({ ...base, hour: 23, nextActions: [foam] }).skip, "quiet-hours");
assert.equal(C.planNudge({ ...base, cfg: { pause_until: "2099-01-01" }, nextActions: [foam] }).skip, "paused");
console.log("ok   with check-ins off, one open thing reaches the phone once at midday");

// COMPANION-DUE-WORDS-1
assert.equal(C.dueFromWords("Go to Foam today", "2026-11-04"), "2026-11-04");
assert.equal(C.dueFromWords("call the GP tomorrow", "2026-11-04"), "2026-11-05");
assert.equal(C.dueFromWords("boodschappen vanavond", "2026-11-04"), "2026-11-04");
assert.equal(C.dueFromWords("morgen fietsen", "2026-11-30"), "2026-12-01");
assert.equal(C.dueFromWords("jazz hub Badcuyp", "2026-11-04"), "");
assert.equal(C.dueFromWords("today", "bad"), "");
console.log("ok   today / tomorrow / vandaag / morgen become a date");

// COMPANION-CAPTURE-DEDUPE-1: a repeat of the same words in 30 minutes answers with the earlier item and stores nothing.
let inserts = 0, sqls = [];
const prev = { id: "inb-prev", result_json: JSON.stringify({ type: "reference", title: "Contra — restaurant & jazz bar" }) };
const env = { PERSONAL: { prepare: (sql) => { sqls.push(sql); return { bind: (...a) => ({ first: async () => (/FROM cmp_inbox WHERE ts >= \?/.test(sql) ? prev : null), run: async () => { if (/INSERT INTO cmp_inbox/.test(sql)) inserts++; return {}; }, all: async () => ({ results: [] }) }) }; } } };
const r = await C.capture(env, {}, { text: "Contra — restaurant & jazz bar", defer: true });
assert.equal(r.duplicate, true);
assert.equal(r.id, "inb-prev");
assert.equal(r.processed.type, "reference");
assert.equal(inserts, 0);
assert.ok(sqls.some((q) => /json_extract\(result_json, '\$\.title'\)/.test(q)), "matches a just-sorted photo's title too");
console.log("ok   the same note twice is one note, with no second sorting call");

// COMPANION-VOICE-FALLBACK-1 and the cheaper twin fallback.
const page = C.PAGE_HTML;
assert.ok(!/Type it, or use/.test(page), "never asks to type");
assert.ok(page.includes("function qcRec(){") && page.includes("dictate(mic,'qc-text',capText)"), "quick-add mic falls back to recording");
const worker = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
assert.ok(worker.includes('var TWIN_PREVIOUS = "@cf/deepseek-ai/deepseek-v4-flash-0731"'));
assert.ok(worker.indexOf('"@cf/deepseek-ai/deepseek-v4-pro-0813"\n  // 120,000') > worker.indexOf('"@cf/moonshotai/kimi-k2.6",'), "deepseek-v4-pro is the last resort");
assert.ok(worker.includes("COMPANION-ONE-THING-PUSH-1") && worker.includes("dueFromWords"));
assert.equal(worker, fs.readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8"));
console.log("ok   voice never asks to type; twin fallback is the cheaper model; mirror matches");

// COMPANION-NO-TYPING-1:do-tab and :dictate-rest (agent_issues 1001638, 1001639).
assert.ok(page.includes("dictate(this,'a-title')"), "Do tab: Dictate for the title");
for (const t of ["Tidy one surface", "10-minute walk", "Reply to one message", "One Quniverse task"]) assert.ok(page.includes(">" + t + "</button>"), "preset " + t);
assert.ok(page.includes("setMin(this,5)") && page.includes("setMin(this,15)") && page.includes("setMin(this,30)") && !page.includes('id="a-min" aria-label="Minutes" type="number"'), "minutes are 5/15/30 buttons");
assert.ok(page.includes("dictate(this,'c-front')") && page.includes("dictate(this,'c-back')"), "Learn card has Dictate");
assert.ok(page.includes("dictateLine(this,'sp-'+f[0])"), "each safety-plan field has Dictate");
console.log("ok   Do tab, Learn cards and the safety plan need no typing");

// COMPANION-NO-TYPING-1:shortcut (agent_issues 1001642): a home-screen shortcut opens Focus.
assert.ok(C.MANIFEST.shortcuts.some((x) => x.url === "/companion#focus"));
assert.ok(page.includes("if(h==='focus'){history.replaceState(null,'','/companion');go('focus');return}"));
console.log("ok   a home-screen shortcut opens Focus");
