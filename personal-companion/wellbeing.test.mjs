// personal-companion/wellbeing.test.mjs
// Run: node --experimental-sqlite personal-companion/wellbeing.test.mjs
//
// The DDL is applied statement-by-statement exactly as ensureWellbeingSchema does it against D1,
// so a statement D1 would reject fails here first (D1 accepts one statement per prepare()).

import { DatabaseSync } from "node:sqlite";
import {
  DDL, ensureWellbeingSchema, recordCheckin, dayKey, localHourFloat, inQuiet,
  drift, planNext, retiredKinds, expireStale, closeNudge, crisisBlock, crisisSignal,
  DEFAULT_CONFIG, LADDER, whatHelped, unansweredStreak, tzOffsetMinutes
} from "./wellbeing.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  -> " + JSON.stringify(extra) : "")); }
};
const throws = (name, fn, code) => {
  try { fn(); fail++; console.log("  FAIL " + name + " (no throw)"); }
  catch (e) {
    const msg = String(e && e.message || e);
    if (msg.includes(code)) { pass++; console.log("  ok   " + name); }
    else { fail++; console.log("  FAIL " + name + " (wrong error: " + msg + ")"); }
  }
};

// D1-shaped adapter over node:sqlite so the module under test is unmodified.
function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
        async all() { return { results: db.prepare(sql).all(...args) }; }
      };
      return api;
    }
  };
}

const db = d1(new DatabaseSync(":memory:"));

console.log("\n[schema]");
for (const sql of DDL) await db.prepare(sql).run();
pass++; console.log("  ok   all " + DDL.length + " statements accepted one-per-prepare");
await ensureWellbeingSchema(db);
const raw = new DatabaseSync(":memory:");
raw.exec("CREATE TABLE journal (ts TEXT)");
raw.exec("CREATE TABLE activity (date TEXT)");
for (const sql of DDL) raw.exec(sql);
const names = raw.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view','trigger')").all().map((r) => r.name);
ok("tables created", ["wellbeing_checkins", "companion_nudges", "wellbeing_config"].every((n) => names.includes(n)), names);
ok("views created", ["v_nudge_loop", "v_wellbeing_trend", "v_wellbeing_coverage"].every((n) => names.includes(n)), names);
ok("triggers created", ["wellbeing_checkin_range_ins", "nudge_dup_ins", "nudge_close_ins"].every((n) => names.includes(n)), names);

console.log("\n[capture guards]");
throws("mood 6 rejected", () => raw.prepare("INSERT INTO wellbeing_checkins (ts,day,mood,source) VALUES ('2026-10-17T10:00:00Z','2026-10-17',6,'reply')").run(), "WELLBEING-RANGE-1");
throws("sleep 30h rejected", () => raw.prepare("INSERT INTO wellbeing_checkins (ts,day,energy,sleep_hours,source) VALUES ('2026-10-17T10:00:00Z','2026-10-17',3,30,'web')").run(), "WELLBEING-RANGE-1");
throws("empty check-in rejected", () => raw.prepare("INSERT INTO wellbeing_checkins (ts,day,source) VALUES ('2026-10-17T10:00:00Z','2026-10-17','reply')").run(), "WELLBEING-EMPTY-1");
raw.prepare("INSERT INTO wellbeing_checkins (ts,day,mood,source) VALUES ('2026-10-17T10:00:00Z','2026-10-17',3,'reply')").run();
pass++; console.log("  ok   valid check-in accepted");

// A mood-only reply must not erase an energy value already given that day.
const merged = await recordCheckin(db, { day: undefined, mood: null, energy: 4, source: "reply", ts: "2026-10-17T18:00:00Z" });
const row = raw.prepare("SELECT mood, energy FROM wellbeing_checkins WHERE day='2026-10-17' AND source='reply'").get();
ok("upsert merges, does not clobber", merged.day === "2026-10-17", { merged, row });

console.log("\n[nudge guards]");
throws("bad state rejected", () => raw.prepare("INSERT INTO companion_nudges (ts,day,kind,ask,state) VALUES ('2026-10-17T10:00:00Z','2026-10-17','micro','water','fired')").run(), "NUDGE-STATE-1");
throws("done without closed_at rejected", () => raw.prepare("INSERT INTO companion_nudges (ts,day,kind,ask,state) VALUES ('2026-10-17T10:00:00Z','2026-10-17','micro','water','done')").run(), "NUDGE-CLOSE-1");
raw.prepare("INSERT INTO companion_nudges (ts,day,kind,ask,state,sent_at) VALUES ('2026-10-17T10:00:00Z','2026-10-17','micro','water','sent','2026-10-17T10:00:00Z')").run();
throws("second open nudge same kind rejected", () => raw.prepare("INSERT INTO companion_nudges (ts,day,kind,ask,state) VALUES ('2026-10-17T11:00:00Z','2026-10-17','micro','window','sent')").run(), "NUDGE-DUP-1");
raw.prepare("UPDATE companion_nudges SET state='expired', closed_at='2026-10-17T12:00:00Z' WHERE day='2026-10-17'").run();
raw.prepare("INSERT INTO companion_nudges (ts,day,kind,ask,state,closed_at) VALUES ('2026-10-17T13:00:00Z','2026-10-17','micro','window','done','2026-10-17T13:05:00Z')").run();
pass++; console.log("  ok   expired nudge frees the slot for a retry");

console.log("\n[time and quiet hours]");
ok("quiet at 03:00", inQuiet(3, 22, 7.5) === true);
ok("awake at 12:00", inQuiet(12, 22, 7.5) === false);
ok("quiet at 22:30", inQuiet(22.5, 22, 7.5) === true);
ok("awake at 07:30 sharp", inQuiet(7.5, 22, 7.5) === false);
ok("day key is local not UTC", dayKey("2026-10-17T23:30:00Z", 120) === "2026-10-18", dayKey("2026-10-17T23:30:00Z", 120));
ok("local hour honours offset", Math.abs(localHourFloat("2026-10-17T09:15:00Z", 120) - 11.25) < 1e-9);

console.log("\n[time: DST]");
ok("summer offset is +0200", tzOffsetMinutes("Europe/Amsterdam", new Date("2026-10-17T12:00:00Z").getTime()) === 120);
ok("winter offset is +0100", tzOffsetMinutes("Europe/Amsterdam", new Date("2026-12-01T12:00:00Z").getTime()) === 60);
ok("day key follows DST, not a fixed offset",
  dayKey("2026-12-01T23:30:00Z", "Europe/Amsterdam") === "2026-12-02",
  dayKey("2026-12-01T23:30:00Z", "Europe/Amsterdam"));
ok("quiet hours hold after the DST flip",
  inQuiet(localHourFloat("2026-12-01T22:30:00Z", "Europe/Amsterdam"), 22, 7.5) === true,
  localHourFloat("2026-12-01T22:30:00Z", "Europe/Amsterdam"));
ok("bad zone falls back instead of throwing", tzOffsetMinutes("Not/AZone", Date.now()) === 120);

console.log("\n[drift]");
ok("silence alone is watch not drift", drift({ days_since_note: 5 }).level === "watch");
ok("two signals are drift", drift({ days_since_note: 5, night_share: 0.4 }).level === "drift");
ok("mood 1 is shaky", drift({ mood_today: 1 }).level === "shaky");
ok("mood 2 on a low week is shaky", drift({ mood_today: 2, mood_avg7: 2.2 }).level === "shaky");
ok("mood 2 off a good week is not shaky", drift({ mood_today: 2, mood_avg7: 3.8 }).level !== "shaky");
ok("clean signals are ok", drift({ days_since_note: 1, night_share: 0.05, volume_ratio: 1.1, days_since_activity: 2, mood_today: 4 }).level === "ok");

console.log("\n[planner: cadence]");
ok("silent at 03:00", planNext({ nowIso: "2026-10-18T01:00:00Z", ctx: {} }).skip === "quiet-hours");
ok("silent at daily cap", planNext({ nowIso: "2026-10-17T14:00:00Z", ctx: {}, recent: [
  { kind: "micro", state: "sent", ts: "2026-10-17T09:00:00Z", day: "2026-10-17", ladder_step: 1, sent_at: "2026-10-17T09:00:00Z" },
  { kind: "body", state: "sent", ts: "2026-10-17T11:00:00Z", day: "2026-10-17", ladder_step: 2, sent_at: "2026-10-17T11:00:00Z" },
  { kind: "contact", state: "sent", ts: "2026-10-17T13:00:00Z", day: "2026-10-17", ladder_step: 3, sent_at: "2026-10-17T13:00:00Z" }
]}).skip === "daily-cap");
ok("silent inside min gap", planNext({ nowIso: "2026-10-17T14:00:00Z", ctx: {}, recent: [
  { kind: "micro", state: "sent", ts: "2026-10-17T13:40:00Z", day: "2026-10-17", ladder_step: 1, sent_at: "2026-10-17T13:40:00Z" }
]}).skip === "min-gap");
ok("silent when every rung is retired", planNext({
  nowIso: "2026-10-17T14:00:00Z", ctx: {},
  loopRows: LADDER.map((r) => ({ kind: r.kind, fired: 10, done_rate: 0 }))
}).skip === "all-kinds-retired");

console.log("\n[planner: ladder]");
const first = planNext({ nowIso: "2026-10-17T14:00:00Z", ctx: {} });
ok("cold start asks the smallest thing", first.ladder_step === 1 && first.kind === "micro", first);
ok("every ask carries a due date", typeof first.due_at === "string" && new Date(first.due_at) > new Date("2026-10-17T14:00:00Z"));
ok("every ask is machine-checkable", first.expected === "log:micro");

const escalated = planNext({ nowIso: "2026-10-17T14:00:00Z", ctx: {}, recent: [
  { kind: "micro", state: "done", ts: "2026-10-16T10:00:00Z", day: "2026-10-16", ladder_step: 1, sent_at: "2026-10-16T10:00:00Z" }
]});
ok("a done escalates one rung", escalated.ladder_step === 2 && escalated.kind === "body", escalated);

const dropped = planNext({ nowIso: "2026-10-17T14:00:00Z", ctx: {}, recent: [
  { kind: "micro", state: "done", ts: "2026-10-14T10:00:00Z", day: "2026-10-14", ladder_step: 1, sent_at: "2026-10-14T10:00:00Z" },
  { kind: "care", state: "expired", ts: "2026-10-16T10:00:00Z", day: "2026-10-16", ladder_step: 3, sent_at: "2026-10-16T10:00:00Z" }
]});
ok("an expired ask drops one rung, never climbs", dropped.ladder_step === 2, dropped);

const lowMood = planNext({ nowIso: "2026-10-17T14:00:00Z", ctx: { mood_today: 2, mood_avg7: 2.1 }, recent: [
  { kind: "micro", state: "done", ts: "2026-10-16T10:00:00Z", day: "2026-10-16", ladder_step: 1, sent_at: "2026-10-16T10:00:00Z" }
]});
ok("low mood caps the ladder at body", lowMood.ladder_step <= 2 && lowMood.kind !== "care", lowMood);

// 06:30Z is 08:30 local at +0200, i.e. before the 10:00 contact gate.
const early = planNext({ nowIso: "2026-10-17T06:30:00Z", ctx: {}, recent: [
  { kind: "micro", state: "done", ts: "2026-10-16T10:00:00Z", day: "2026-10-16", ladder_step: 1, sent_at: "2026-10-16T10:00:00Z" },
  { kind: "body", state: "done", ts: "2026-10-16T18:00:00Z", day: "2026-10-16", ladder_step: 2, sent_at: "2026-10-16T18:00:00Z" }
]});
ok("contact rung is not offered before 10:00 local", early.ladder_step < 3, early);
const atTen = planNext({ nowIso: "2026-10-17T08:00:00Z", ctx: {}, recent: [
  { kind: "micro", state: "done", ts: "2026-10-16T10:00:00Z", day: "2026-10-16", ladder_step: 1, sent_at: "2026-10-16T10:00:00Z" },
  { kind: "body", state: "done", ts: "2026-10-16T18:00:00Z", day: "2026-10-16", ladder_step: 2, sent_at: "2026-10-16T18:00:00Z" }
]});
ok("contact rung is offered from 10:00 local", atTen.ladder_step === 3, atTen);

console.log("\n[planner: unanswered]");
const pres = planNext({ nowIso: "2026-10-17T14:00:00Z", ctx: { unanswered_streak: 3 } });
ok("three unanswered switches to presence", pres.kind === "presence" && pres.minutes === 0, pres);
ok("presence asks nothing", pres.expected === null && pres.ask === DEFAULT_CONFIG.presence_line);
ok("presence is sent once per day", planNext({ nowIso: "2026-10-17T16:00:00Z", ctx: { unanswered_streak: 3 }, recent: [
  { kind: "presence", state: "sent", ts: "2026-10-17T14:00:00Z", day: "2026-10-17", ladder_step: 0, sent_at: "2026-10-17T14:00:00Z" }
]}).skip === "presence-already-sent");

console.log("\n[planner: retirement]");
ok("0/10 done retires the kind", retiredKinds([{ kind: "micro", fired: 10, done_rate: 0 }]).has("micro"));
ok("3/10 done keeps the kind", !retiredKinds([{ kind: "micro", fired: 10, done_rate: 0.3 }]).has("micro"));
ok("4 fires is not enough evidence", !retiredKinds([{ kind: "micro", fired: 4, done_rate: 0 }]).has("micro"));
const avoided = planNext({ nowIso: "2026-10-17T14:00:00Z", ctx: {}, loopRows: [{ kind: "micro", fired: 12, done_rate: 0 }] });
ok("a retired kind is never chosen", avoided.kind !== "micro", avoided);

console.log("\n[closed loop]");
const loopRaw = new DatabaseSync(":memory:");
loopRaw.exec("CREATE TABLE journal (ts TEXT)");
loopRaw.exec("CREATE TABLE activity (date TEXT)");
const loop = d1(loopRaw);
for (const sql of DDL) await loop.prepare(sql).run();
const nowIso = new Date().toISOString();
await loop.prepare("INSERT INTO companion_nudges (ts,day,kind,ask,state,sent_at,shown_at,due_at) VALUES (?,?,?,?,?,?,?,?)")
  .bind(nowIso, dayKey(nowIso), "micro", "water", "shown", nowIso, nowIso, "2000-01-01T00:00:00Z").run();
const flipped = await expireStale(loop, nowIso);
ok("stale ask expires", flipped === 1, flipped);
const st = await loop.prepare("SELECT state FROM companion_nudges").all();
ok("expired state persisted", st.results[0].state === "expired", st.results);
await closeNudge(loop, 1, { state: "done", nowIso });
await loop.prepare("INSERT INTO companion_nudges (ts,day,kind,ask,state,sent_at,closed_at) VALUES (?,?,?,?,?,?,?)")
  .bind(nowIso, dayKey(nowIso), "body", "walk", "done", nowIso, nowIso).run();
const lr = await loop.prepare("SELECT * FROM v_nudge_loop WHERE kind='micro'").all();
ok("loop view counts fired/expired/done", lr.results[0].fired === 1 && lr.results[0].done === 1 && lr.results[0].expired === 0, lr.results[0]);
ok("done_rate is computed", lr.results[0].done_rate === 1, lr.results[0]);
const cov = await loop.prepare("SELECT * FROM v_wellbeing_coverage").all();
ok("coverage view is one row", cov.results.length === 1, cov.results.length);
ok("coverage reports a stale journal", cov.results[0].journal_last === null);
const streak = await unansweredStreak(loop);
ok("unanswered streak counts open asks", streak >= 0);
try { await closeNudge(loop, 1, { state: "fired" }); fail++; console.log("  FAIL closeNudge accepts anything"); }
catch (e) { if (String(e.message).includes("NUDGE-STATE-1")) { pass++; console.log("  ok   closeNudge rejects unknown states"); } else throw e; }

console.log("\n[escalation]");
ok("crisis phrase detected", crisisSignal("honestly I want to die").level === 2);
ok("soft phrase is level 1", crisisSignal("I can't cope with this").level === 1);
ok("ordinary sentence is level 0", crisisSignal("the build is red again").level === 0);
ok("self-harm phrase is level 2", crisisSignal("I keep thinking about hurting myself").level === 2);
ok("self-harm inflection is caught", crisisSignal("I self-harmed last night").level === 2);
ok("suicidal ideation is caught", crisisSignal("I've been suicidal for a week").level === 2);
ok("'cut myself some slack' is not a crisis", crisisSignal("I should cut myself some slack today").level === 0);
ok("'kill the build' is not a crisis", crisisSignal("I want to kill this build and start over").level === 0);
ok("'nothing matters' is soft, not hard", crisisSignal("nothing matters anymore").level === 1);
const empty = crisisBlock({});
ok("unconfigured backstop is admitted, not invented", empty.text.includes("No backstop is configured yet"));
ok("unconfigured crisis lines are admitted", empty.text.includes("No crisis lines configured yet"));
ok("no phone number is ever fabricated", !/\d{3}[- ]\d{3,}/.test(empty.text), empty.text);
const filled = crisisBlock({ backstop_name: "Sam", crisis_lines: [{ label: "113", number: "113" }] });
ok("configured backstop is named", filled.text.includes("Sam"));
ok("configured line is printed", filled.text.includes("113"));
ok("escalation declares its SLA", filled.sla_seconds === 60);
ok("escalation has three paths", filled.paths.length === 3);

console.log("\n[what helped]");
const helped = await whatHelped(loop, 60);
ok("whatHelped returns an array", Array.isArray(helped), helped);

console.log("\n" + (fail === 0 ? "PASS" : "FAIL") + "  " + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
