/**
 * cf-obs-classify.test.mjs -- offline regression lock for cfObsClassify (CF-OBS-SWEEP-1, CF-OBS-NESTED-AGE-1).
 * Slices the CF-OBS-SWEEP-1 block out of worker.js and replays group shapes through the pure classifier.
 * The "triggers nested too deep" rule returned "active" at any age (known open root cause 2785 / 2817); those issues are
 * closed and the fault is fixed, so a group quiet for CF_OBS_STALE_H must classify "resolved" and reach the stale-resolve
 * branch, while a fresh one stays "active".
 * Output MUST contain "0 failed" on success.
 *
 *   node qnfo-fleet-control/cf-obs-classify.test.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const BEGIN = "// ---- CF-OBS-SWEEP-1:BEGIN", END = "// ---- CF-OBS-SWEEP-1:END ----";
const a = src.indexOf(BEGIN), b = src.indexOf(END);
if (a < 0 || b < a) { console.error("FAIL CF-OBS-SWEEP-1 block markers missing"); console.log("1 failed"); process.exit(1); }
const sandbox = { __name: (f) => f, __export: null };
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b + END.length) + "\n__export = { cfObsClassify, CF_OBS_STALE_H };", sandbox);
const C = sandbox.__export;

let passed = 0, failed = 0;
function eq(actual, expected, label) { if (actual === expected) { passed++; return; } failed++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
const NOW = Date.parse("2026-10-19T06:00:00Z");
const ago = (h) => NOW - h * 3600000;
const nested = (h, extra) => Object.assign({ title: "D1_ERROR: too many triggers nested too deep: SQLITE_ERROR", lastObserved: ago(h), count: 12, type: "exception", service: "qnfo-ai" }, extra || {});

eq(C.CF_OBS_STALE_H, 72, "stale window is 72 h");
eq(C.cfObsClassify(nested(1), NOW), "active", "nested too deep seen 1 h ago is active");
eq(C.cfObsClassify(nested(C.CF_OBS_STALE_H - 1), NOW), "active", "nested too deep just inside the window is active");
eq(C.cfObsClassify(nested(C.CF_OBS_STALE_H + 8), NOW), "resolved", "nested too deep quiet 80 h is resolved (stale branch)");
eq(C.cfObsClassify(nested(24 * 30, { count: 1, type: "error" }), NOW), "resolved", "nested too deep quiet 30 days is resolved");
eq(C.cfObsClassify({ title: "Triggers nested too deep", count: 1 }, NOW), "resolved", "no lastObserved reads as infinitely old: resolved");

// siblings are unchanged
eq(C.cfObsClassify({ title: "Potential vulnerability scan · /.env · low risk", lastObserved: ago(1) }, NOW), "ignored", "scan probes stay ignored");
eq(C.cfObsClassify({ title: "UNIQUE constraint failed: x.y", lastObserved: ago(2) }, NOW), "active", "fresh unique-constraint group stays active");
eq(C.cfObsClassify({ title: "UNIQUE constraint failed: x.y", lastObserved: ago(100) }, NOW), "resolved", "old unique-constraint group is resolved");
eq(C.cfObsClassify({ title: "ping fail", lastObserved: ago(100) }, NOW), "active", "ping fail rule is untouched by this change");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
