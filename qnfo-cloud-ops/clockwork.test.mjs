// CLOCKWORK-1 (qnfo-cloud-ops 1.51.0): every personal-plane loop has a clock (cadence, a last-run probe, a correct-output probe, a repair),
// the judge tells ok from late, stopped and inaccurate, missed GitHub schedules are re-dispatched once per window, a stuck loop escalates
// to the fleet, and every expected tick is settled by name. This file is also the CI gate: a live worker with charter pillar personal and
// a cron, with no CLOCK_LOOPS row, fails it. Run: node qnfo-cloud-ops/clockwork.test.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "..");
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("// ---- CLOCKWORK-1:BEGIN"), b = src.indexOf("// ---- CLOCKWORK-1:END");
let fails = 0;
const check = (c, m, x) => { console.log((c ? "PASS " : "FAIL ") + m + (!c && x !== undefined ? " -- " + JSON.stringify(x) : "")); if (!c) fails++; };
check(a > 0 && b > a, "the pure block is marked");
const sb = { Date, Math, Number, isNaN, String, JSON };
vm.createContext(sb);
vm.runInContext(src.slice(a, b) + "\n__e = { CLOCK_LOOPS, CLOCK_ESCALATE_TICKS, clockJudge, clockAction, clockFromRuns, clockSummary, clockSettle };", sb);
const { CLOCK_LOOPS, CLOCK_ESCALATE_TICKS, clockJudge, clockAction, clockFromRuns, clockSummary, clockSettle } = sb.__e;

// 1. Every loop is complete.
const ids = new Set();
for (const l of CLOCK_LOOPS) {
  check(!ids.has(l.id), "loop id is unique: " + l.id); ids.add(l.id);
  check(l.cadence_min > 0 && l.grace_min >= 0, l.id + " has a cadence and a grace");
  check(typeof l.accuracy === "string" && l.accuracy.length > 10, l.id + " says what correct output means");
  check(l.probe && (l.probe.kind === "gh" ? !!(l.repo && l.workflow) : /last_run/.test(l.probe.sql) && /last_good/.test(l.probe.sql)), l.id + " has a probe for last run and last correct output");
  check(l.repair && (l.repair.kind === "dispatch" ? l.probe.kind === "gh" : l.repair.kind === "issue"), l.id + " has a repair");
}

// 2. CI gate: every live personal-pillar worker with a cron has a clock.
const clocked = new Set(CLOCK_LOOPS.map((l) => l.worker).filter(Boolean));
for (const d of readdirSync(root)) {
  const f = join(root, d, "wrangler.toml");
  if (!existsSync(f) || existsSync(join(root, d, "RETIRED")) || existsSync(join(root, d, "FOLDED"))) continue;
  const t = readFileSync(f, "utf8");
  if (!/charter-pillar:\s*personal/.test(t) || !/^crons\s*=/m.test(t)) continue;
  check(clocked.has(d), "scheduled personal worker " + d + " has a CLOCK_LOOPS row (heartbeat and accuracy check)");
}
// The GitHub-scheduled loops of the personal plane the fleet knows about.
for (const w of ["rwnq8/personal-life job-apply.yml", "rwnq8/resume confirmed-skills.yml", "rwnq8/resume surface-audit.yml"]) {
  const [repo, wf] = w.split(" ");
  check(CLOCK_LOOPS.some((l) => l.repo === repo && l.workflow === wf), "GitHub-scheduled loop " + w + " has a clock");
}

// 3. The judge.
const now = Date.parse("2026-11-12T15:00:00Z"), ago = (m) => new Date(now - m * 6e4).toISOString();
const hourly = { id: "x", cadence_min: 60, grace_min: 20, repair: { kind: "dispatch" } };
let v = clockJudge(hourly, { last_run: ago(10), last_good: ago(9), runs_24h: 24, good_24h: 24 }, now);
check(v.state === "ok" && v.accuracy === 1 && v.missed_24h === 0, "a loop that ran 10 min ago with correct output is ok", v);
v = clockJudge(hourly, { last_run: ago(70), last_good: ago(69) }, now);
check(v.state === "late" && v.latency_min === 10, "70 min after an hourly run is late, inside the grace", v);
v = clockJudge(hourly, { last_run: ago(90), last_good: ago(89) }, now);
check(v.state === "stopped" && v.missed_24h >= 1, "90 min after an hourly run the clock has stopped", v);
v = clockJudge(hourly, { last_run: null, last_good: null }, now);
check(v.state === "stopped" && /no run/.test(v.why), "a loop with no run on record is stopped", v);
v = clockJudge(hourly, { last_run: ago(5), last_good: ago(300), runs_24h: 24, good_24h: 19 }, now);
check(v.state === "inaccurate" && v.accuracy === 0.792, "a loop that runs but produced no correct output for 5 h is inaccurate (a wrong clock)", v);
v = clockJudge(hourly, { read_error: "HTTP 404" }, now);
check(v.state === "unreadable", "a probe that fails is unreadable, never ok", v);
v = clockJudge(hourly, { last_run: ago(5), last_good: ago(5), runs_24h: 20, good_24h: 20 }, now);
check(v.missed_24h === 4, "missed ticks count expected minus observed runs in 24 h", v);

// 4. Repair, escalation, recovery.
let act = clockAction(hourly, { state: "stopped" }, {}, now);
check(act.dispatch && !act.escalate && act.bad_ticks === 1, "a stopped GitHub loop is re-dispatched at once", act);
act = clockAction(hourly, { state: "stopped" }, { dispatched_at: ago(30), bad_ticks: 1 }, now);
check(!act.dispatch, "one dispatch per window: a dispatch 30 min ago waits for its run", act);
act = clockAction(hourly, { state: "stopped" }, { dispatched_at: ago(90), bad_ticks: CLOCK_ESCALATE_TICKS - 1 }, now);
check(act.dispatch && act.escalate, "a loop still stopped after " + CLOCK_ESCALATE_TICKS + " ticks escalates to the fleet and is dispatched again", act);
act = clockAction({ ...hourly, repair: { kind: "issue" } }, { state: "inaccurate" }, { bad_ticks: 5 }, now);
check(!act.dispatch && act.escalate, "a worker loop escalates instead of dispatching", act);
act = clockAction(hourly, { state: "ok" }, { bad_ticks: 4 }, now);
check(act.recovered && act.bad_ticks === 0 && !act.escalate, "a loop that is ok again recovers and resets its count", act);
act = clockAction(hourly, { state: "unreadable" }, {}, now);
check(!act.dispatch, "an unreadable probe is never answered with a dispatch", act);

// 5. GitHub runs and the summary.
const runs = [
  { event: "workflow_dispatch", status: "in_progress", created_at: ago(2) },
  { event: "schedule", status: "completed", conclusion: "failure", created_at: ago(70), updated_at: ago(68) },
  { event: "pull_request", status: "completed", conclusion: "success", created_at: ago(30), updated_at: ago(29) },
  { event: "schedule", status: "completed", conclusion: "success", created_at: ago(200), updated_at: ago(198) },
];
const o = clockFromRuns(runs, now);
check(o.last_run === ago(2) && o.last_good === ago(198) && o.runs_24h === 2 && o.good_24h === 1, "GitHub runs: pull-request runs do not count, a queued run is a run, success is correct output", o);
const s = clockSummary([{ state: "ok", missed_24h: 0, latency_min: 0, accuracy: 1 }, { state: "stopped", missed_24h: 3, latency_min: 45, accuracy: 0.5 }, { state: "late", missed_24h: 0, latency_min: 10, accuracy: null }]);
check(s.not_ok === 1 && s.missed_24h === 3 && s.max_latency_min === 45 && s.accuracy === 0.75, "summary: late is not a failure; missed ticks, max latency and mean accuracy", s);

// 6. Settlement by name.
let st = clockSettle(hourly, { last_run: ago(50), last_good: ago(49) }, Date.parse("2026-11-12T15:30:00Z"));
check(st.slot === "x@2026-11-12T14:00:00.000Z" && st.outcome === "ran", "15:30 (past the 20-min grace) settles the 14:00 slot by name: ran", st);
st = clockSettle(hourly, { last_run: ago(200), last_good: ago(200) }, now);
check(st.outcome === "missed", "no run since the slot began settles it missed", st);
st = clockSettle(hourly, { last_run: ago(50), last_good: ago(300) }, now);
check(st.outcome === "ran-inaccurate", "a run with no correct output settles ran-inaccurate", st);
st = clockSettle(hourly, { last_run: ago(50), last_good: ago(49) }, Date.parse("2026-11-12T15:10:00Z"));
check(st.slot === "x@2026-11-12T13:00:00.000Z", "inside the grace of the 14:00 slot, the 13:00 slot is the one settled", st);

// 7. Wiring.
check(/runs\.push\(jobClockwork\(env\)/.test(src), "the 10-minute tick runs the clockwork job");
check(/"clockwork": jobClockwork/.test(src), "POST /run?job=clockwork runs it");
check(/path === "\/clock"/.test(src), "GET /clock serves the clock health");
check(/INSERT INTO fleet_heartbeat \(worker, version, ts, ok\) VALUES \('clockwork'/.test(src), "the watchdog writes its own heartbeat");
console.log(fails ? fails + " failed" : "all passed");
process.exit(fails ? 1 : 0);
