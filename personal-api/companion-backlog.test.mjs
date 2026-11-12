// personal-api/companion-backlog.test.mjs (COMPANION-RECAP-1, -TRANSITION-1, -FORECAST-1, -ONE-TRUTH-1, -SILENCE-1, -PLAIN-1, -SELFFIX-1)
// Run: node personal-api/companion-backlog.test.mjs
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import * as C from "./companion.js";

// --- COMPANION-FORECAST-1: fixed rule, own data
assert.equal(C.lowMoodForecast([{ m: 2 }, { m: 2.5 }], 5).level, "watch");
assert.equal(C.lowMoodForecast([{ m: 2 }, { m: 2.5 }], 7), null, "enough sleep: no forecast");
assert.equal(C.lowMoodForecast([{ m: 2 }, { m: 4 }], 4), null, "one good day: no forecast");
assert.equal(C.lowMoodForecast([{ m: 2 }], 4), null, "one day of data is not a pattern");
assert.equal(C.lowMoodForecast([{ m: 2 }, { m: 2 }], null), null, "unknown sleep is not short sleep");
{ const f = C.lowMoodForecast([{ m: 1 }, { m: 1 }], 3); assert.ok(f && !C.PLAIN_BAD.test(f.text)); }
console.log("ok   low-mood forecast: two low days plus a short night, nothing else");

// --- COMPANION-TRANSITION-1: heads-up shortly before an event, once a day, in plain words
const now = "2026-11-12T13:40:00Z", nowMs = Date.parse(now);
const ev = (title, startMin, where) => ({ title, startMs: nowMs + startMin * 60000, endMs: nowMs + (startMin + 45) * 60000, where, allDay: false });
const st = { nowIso: now, day: "2026-11-12", hour: 14.67, tz: "Europe/Amsterdam", pushReady: true, cfg: {}, mood: {}, nextActions: [], todays: [], recent: [], events: [ev("Huisarts", 15, "Overtoom 10"), ev("Foam", 120)] };
const p = C.planNudge(st);
assert.equal(p.kind, "cmp-soon");
assert.match(p.ask, /^Next up in about 15 minutes: Huisarts at \d\d:\d\d, Overtoom 10\. After that: Foam at \d\d:\d\d\.$/);
assert.ok(!C.PLAIN_BAD.test(p.ask));
assert.notEqual(C.planNudge({ ...st, todays: [{ kind: "cmp-soon", state: "sent" }] }).kind, "cmp-soon", "once a day");
assert.notEqual(C.planNudge({ ...st, events: [ev("Later", 90)] }).kind, "cmp-soon", "not 90 minutes ahead");
assert.equal(C.planNudge({ ...st, cfg: { pause_until: "2099-01-01" } }).skip, "paused", "a pause holds it");
assert.equal(C.planNudge({ ...st, hour: 23 }).skip, "quiet-hours");
assert.ok(C.NUDGE_KINDS.includes("cmp-soon"));
console.log("ok   heads-up before an appointment names it and what follows");

// --- real SQLite: recap, one truth, silence, plain, self-heal
const raw = new DatabaseSync(":memory:");
const db = { prepare(sql) { let a = []; const api = { bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return api; }, async run() { const r = raw.prepare(sql).run(...a); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; }, async all() { return { results: raw.prepare(sql).all(...a) }; }, async first() { return raw.prepare(sql).get(...a) ?? null; } }; return api; }, async exec(sql) { raw.exec(sql); } };
const env = { PERSONAL: db };
await C.ensureSchema(db, true);
const day = C.localParts(new Date().toISOString(), C.TZ).day, ts = new Date().toISOString();
const task = async (id, title, status, due) => raw.prepare("INSERT INTO tasks (id, ts, kind, title, status, gtd, minutes, due, done_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id, ts, "task", title, status, "next", 10, due || null, status === "done" ? ts : null);
await task("task-aaaa1111", "Call the dentist", "done");
await task("task-bbbb2222", "Tidy the desk", "open", day);
await task("task-cccc3333", "Read a chapter", "open");
raw.prepare("INSERT INTO cmp_activity_log (id, ts, day, title, category) VALUES ('act-1', ?, ?, 'A ten minute walk', 'movement')").run(ts, day);
const nudge = (kind, ask, state, aid) => raw.prepare("INSERT INTO companion_nudges (ts, day, kind, ask, state, sent_at, context_json) VALUES (?,?,?,?,?,?,?)").run(ts, day, kind, ask, state, ts, JSON.stringify({ action_id: aid || null })).lastInsertRowid;
const nDone = Number(nudge("cmp-next", "One thing for now: Call the dentist (10 min).", "sent", "task-aaaa1111"));
const nKeep = Number(nudge("cmp-next", "One thing for now: Tidy the desk (10 min).", "sent", "task-bbbb2222"));
const nSilent = Number(nudge("cmp-checkin", "How are you?", "sent", null));

// ONE-TRUTH: a stale ask for a finished action is healed, not shown, not filed
const healed = await C.selfHeal(env);
assert.equal(healed["stale-ask"], 1);
assert.equal(raw.prepare("SELECT state FROM companion_nudges WHERE id = ?").get(nDone).state, "done");
assert.equal(raw.prepare("SELECT state FROM companion_nudges WHERE id = ?").get(nKeep).state, "sent");
// finishing the action from Do closes the ask that names it, on every screen at once
await C.actionDone(env, "task-bbbb2222");
assert.equal(raw.prepare("SELECT state FROM companion_nudges WHERE id = ?").get(nKeep).state, "done");
// "Did it" on a nudge finishes its action
const nTidy = Number(nudge("cmp-anchor", "Anything small: Read a chapter (10 min).", "sent", "task-cccc3333"));
await C.answerNudge(env, nTidy, "done");
assert.equal(raw.prepare("SELECT status FROM tasks WHERE id = 'task-cccc3333'").get().status, "done");
console.log("ok   one decision updates every ask and task from the same rows; stale asks heal themselves");

// RECAP: after 19:00, from rows, plain
const stNow = { day, tz: C.TZ, hour: 20, mood: { today: 3 } };
const rc = await C.recapFor(env, stNow);
assert.equal(rc.show, true);
assert.deepEqual(rc.lines.slice(0, 2), ["Done: Call the dentist", "Done: Tidy the desk"].slice(0, 2));
assert.ok(rc.lines.includes("Did: A ten minute walk") && rc.lines.includes("Mood today: okay."));
assert.ok(rc.lines.every((l) => !C.PLAIN_BAD.test(l)));
assert.equal((await C.recapFor(env, { ...stNow, hour: 15 })).show, false, "not before 19:00");
await task("task-dddd4444", "Pay the gym", "open", day);
const carried = await C.recapCarry(env, stNow);
assert.equal(carried.cleared, 1);
assert.equal(raw.prepare("SELECT due FROM tasks WHERE id = 'task-dddd4444'").get().due, null, "let today go clears what was due");
assert.equal((await C.recapFor(env, stNow)).show, false, "the card stays gone after Let today go");
console.log("ok   evening recap lists what was done and lets today go");

// SILENCE and PLAIN on the real Today read model
raw.prepare("INSERT INTO cmp_mood (id, ts, day, score, source) VALUES ('mood-1', ?, ?, 3, 'companion')").run(ts, day);
const t = await C.today(env, { weather: async () => null });
assert.ok(!t.open_nudges.some((n) => n.id === nSilent), "a check-in with no button is hidden once the mood is in");
assert.ok(!t.open_nudges.some((n) => n.id === nDone), "an ask for a finished action is hidden");
for (const n of t.open_nudges) assert.ok(!C.PLAIN_BAD.test(n.ask), "plain: " + n.ask);
assert.ok(!C.PLAIN_BAD.test(C.plainAction({ title: "Tidy the desk", minutes: 15, context: "@home" })), "no context tag in the action line");
console.log("ok   Today shows only asks with an action, in plain words");

// SELFFIX: an ugly ask is a code defect: it is reported; healed things are not
nudge("cmp-agenda", "Due task-deadbeef01: undefined", "sent", null);
const sc = await C.selfCheckState(env, ts);
assert.equal(sc["today-plain"].bad, true);
assert.equal(sc["stale-ask"].bad, false);
assert.ok(C.SELF_CHECKS.includes("stale-ask") && C.SELF_CHECKS.includes("today-plain"));
console.log("ok   self-check repairs what it can and reports only what is left");

// the classic and default pages carry the new cards and never the counts footer
const html = await C.handleCompanion(new Request("https://me.q08.org/companion/classic"), { PERSONAL: null }, { waitUntil() {} }, {}).then((r) => r.text());
const v3 = await C.handleCompanion(new Request("https://me.q08.org/companion"), { PERSONAL: null }, { waitUntil() {} }, {}).then((r) => r.text());
assert.ok(html.includes("Let today go") && v3.includes("Let today go") && v3.includes("id:'forecast'"));
assert.ok(!html.includes("Nudges today:"), "no counts footer on Today");
for (const sc2 of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g), ...v3.matchAll(/<script>([\s\S]*?)<\/script>/g)]) new Function(sc2[1]);
console.log("ok   both pages parse and carry the recap and forecast cards");
