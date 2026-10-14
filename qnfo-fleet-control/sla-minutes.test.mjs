// SLA-120M-7 offline suite (qnfo-fleet-control 0.31.2, charter pillar: autonomy). Owner directive 2026-10-14: "No SLA shall ever exceed
// 120 minutes" and SLAs are measured at 10-minute resolution, never hours or days.
// Proves: the merge runner's check and deploy waits, the evolve CI and deploy waits and the drift redeploy cooldown are minute constants
// of at most 120 and the code reads them as minutes; the drift refusal names its real cooldown (it said "cooldown 60s" over a 6 h wait);
// evaluateMetricTriggers reads the re-fire wait in minutes, clamped to 10..120 (an empty cooldown_hours column was read as 24 h); the
// seeded metric triggers start at a 2 h cooldown; no hour constant of the old waits is left.
// Run: node qnfo-fleet-control/sla-minutes.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

const num = (name) => { const m = src.match(new RegExp("var " + name + " = (\\d+);")); return m ? Number(m[1]) : null; };
for (const name of ["CM_CHECKS_WAIT_MIN", "CM_DEPLOY_WAIT_MIN", "EVOLVE_WAIT_MIN", "DRIFT_REDEPLOY_COOLDOWN_MIN"]) {
  const v = num(name);
  ok(v !== null && v >= 10 && v <= 120 && v % 10 === 0, name + " is a minute constant of at most 120 on the 10-minute grid", v);
}
ok(!/CM_CHECKS_WAIT_H|CM_DEPLOY_WAIT_H|BH_MERGE_IDLE_H|216e5/.test(src), "the old hour constants (3 h waits, the 6 h drift cooldown, the unused 2 h idle) are gone");

// the code reads the minute constants as minutes
ok(/var nAge = \(nowMs - Date\.parse\(t\.nochecks_since \|\| ""\)\) \/ 6e4;/.test(src) && /if \(nAge > CM_CHECKS_WAIT_MIN && !reopened\)/.test(src), "the no-checks clock is minutes against CM_CHECKS_WAIT_MIN");
ok(/- since > CM_DEPLOY_WAIT_MIN \* 6e4\) return \{ state: "unverifiable"/.test(src) && /if \(ageH \* 60 > CM_DEPLOY_WAIT_MIN\)/.test(src), "the deploy waits compare minutes with CM_DEPLOY_WAIT_MIN");
ok((src.match(/if \(ageH \* 60 > EVOLVE_WAIT_MIN\)/g) || []).length === 2 && !/if \(ageH > 3\)/.test(src), "both evolve waits compare minutes with EVOLVE_WAIT_MIN");
ok(/age < DRIFT_REDEPLOY_COOLDOWN_MIN \* 6e4\) return true;/.test(src), "the drift cooldown compares with DRIFT_REDEPLOY_COOLDOWN_MIN");
ok(!/cooldown 60s/.test(src) && /note: "cooldown: deployed within the last " \+ DRIFT_REDEPLOY_COOLDOWN_MIN \+ " minutes"/.test(src), "the drift refusal names the cooldown it applies");

// evaluateMetricTriggers: the re-fire wait in minutes, clamped
const m = src.match(/var cdMin = (Math\.min\(120, Math\.max\(10, Math\.round\(\(Number\(t\.cooldown_hours\) \|\| 2\) \* 60\)\)\));/);
ok(!!m && /\.bind\(t\.id, "-" \+ cdMin \+ " minutes"\)/.test(src) && !/Number\(t\.cooldown_hours\) \|\| 24/.test(src), "the re-fire wait is minutes, bound as a minutes modifier");
if (m) {
  const cd = (h) => new Function("t", "return " + m[1] + ";")({ cooldown_hours: h });
  ok(cd(2) === 120 && cd(1) === 60 && cd(null) === 120 && cd(0) === 120 && cd(168) === 120 && cd(0.1) === 10, "2 h -> 120, 1 h -> 60, empty or zero -> 120 (was 24 h), 168 -> 120, never under 10", [cd(2), cd(1), cd(null), cd(0), cd(168), cd(0.1)]);
}
ok(!/'agent_issues', 168, 1/.test(src) && (src.match(/'agent_issues', 2, 1/g) || []).length >= 2, "the seeded metric triggers start at a 2 h cooldown, not 168");

const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 0 || ver[1] > 31 || (ver[1] === 31 && ver[2] >= 2)), "VERSION is at least 0.31.2", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
