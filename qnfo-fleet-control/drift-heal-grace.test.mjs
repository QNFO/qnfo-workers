// DRIFT-HEAL-GRACE-1 offline suite (qnfo-fleet-control 0.31.0, charter pillar: autonomy; agent_issues 2391, 2547).
// Proves: the drift scan redeploys a worker that main is ahead of only after main has been ahead for DRIFT_HEAL_GRACE_MIN, measured from
// the first canonical-ahead report of that version, so the canonical deploy of a push is not raced for the deploy-guard lock; a read
// failure of the report is logged and lets the heal run (a stuck worker is never left behind for want of the grace record).
// Run: node qnfo-fleet-control/drift-heal-grace.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

const scan = src.slice(src.indexOf("async function scan(env, heal) {"), src.indexOf("__name(scan, \"scan\")") > 0 ? src.indexOf("__name(scan, \"scan\")") : src.indexOf("async function scan(env, heal) {") + 9000);
ok(/var DRIFT_HEAL_GRACE_MIN = 20;/.test(src), "the grace is 20 minutes (two 10-minute scans)");
ok(/await report\(env, n, depV, canV, c\.path, "canonical-ahead"\);[\s\S]{0,200}if \(heal && !usedHealth\) \{/.test(scan), "the canonical-ahead report is written before the heal decision, so the first scan starts the clock");
ok(/SELECT MIN\(ts\) AS t FROM fleet_drift_report WHERE worker = \?1 AND canonical_version = \?2 AND note = 'canonical-ahead'"\)\.bind\(n, canV\)/.test(scan), "the clock is the first canonical-ahead report of this worker and this version, read with bound parameters");
ok(/if \(isFinite\(sinceMs\) && Date\.now\(\) - sinceMs < DRIFT_HEAL_GRACE_MIN \* 6e4\) \{[\s\S]{0,200}out\.graced = \(out\.graced \|\| 0\) \+ 1;/.test(scan), "inside the grace the worker is counted as graced, not redeployed");
ok(/\} else \{\s*var res = await redeploy\(env, n\);\s*if \(res\.ok\) out\.healed\+\+;\s*\}/.test(scan), "after the grace (or with no readable clock) the redeploy runs as before");
ok(/catch \(e\) \{ console\.error\(JSON\.stringify\(\{ evt: "fleet-control:scan:drift-grace"/.test(scan), "a failed read of the clock is logged, never swallowed");

// the decision itself, replayed: the same arithmetic on the D1 timestamp format datetime('now') writes
const graced = (ts, nowMs, min) => { const t = Date.parse(String(ts).replace(" ", "T") + "Z"); return isFinite(t) && nowMs - t < min * 6e4; };
const now = Date.parse("2026-10-14T03:01:31Z");
ok(graced("2026-10-14 03:01:20", now, 20) === true, "11 s after the first report (the 03:01 race): graced");
ok(graced("2026-10-14 02:41:00", now, 20) === false, "21 minutes after the first report: healed");
ok(graced(null, now, 20) === false && graced("garbage", now, 20) === false, "no readable clock: healed (never stuck)");

const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 0 || ver[1] >= 31), "VERSION is at least 0.31.0", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
