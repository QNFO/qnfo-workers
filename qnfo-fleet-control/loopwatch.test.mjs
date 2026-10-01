/**
 * loopwatch.test.mjs -- offline regression lock for LOOP-WATCH-1 (CLOUD-ONLY-VERIFICATION-1).
 * Slices the block out of worker.js and drives loopWatchEvaluate with synthetic ledgers.
 * Output MUST contain "0 failed" on success; charter-guard.yml greps for exactly that string.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const BEGIN = "// ---- LOOP-WATCH-1:BEGIN";
const END = "// ---- LOOP-WATCH-1:END ----";
const a = src.indexOf(BEGIN), b = src.indexOf(END);
if (a < 0 || b < 0 || b < a) { console.error("FAIL loop-watch block markers missing"); console.log("1 failed"); process.exit(1); }
const sandbox = { charterSchema: null, pfSchema: null, charterOne: null, charterRows: null, console, Date, Math, JSON, Number, String, Object, Array, RegExp, isNaN, __export: null };
vm.createContext(sandbox);
vm.runInContext(src.slice(a, b + END.length) + "\n__export = { loopWatchEvaluate, LW_STALE_H, LW_GRACE_H };", sandbox, { filename: "loopwatch-block.js" });
const W = sandbox.__export;

let passed = 0, failed = 0;
function eq(actual, expected, label) { if (actual === expected) { passed++; return; } failed++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
const NOW = Date.parse("2026-10-02T12:00:00Z");
const h = (n) => new Date(NOW - n * 3600000).toISOString();
const keys = (f) => W.loopWatchEvaluate(f, NOW).map((x) => x.key).sort().join(",");

eq(keys({}), "", "no ledgers and no first_seen: nothing yet (grace unknown)");
eq(keys({ first_seen: h(2) }), "", "within the grace window nothing is filed");
eq(keys({ first_seen: h(30) }), "CHARTER-TICK-STALE-1,PORTFOLIO-SYNC-STALE-1", "after grace, never-ran loops are stale");
eq(keys({ first_seen: h(30), charter_last: { ts: h(5) }, charter_notes: ["committed: x"], portfolio_last_ok: { ts: h(3) }, portfolio_last: { ts: h(3), status: "ok", writes: "[]" } }), "", "fresh runs are healthy");
eq(keys({ first_seen: h(60), charter_last: { ts: h(30) }, charter_notes: ["committed: x"], portfolio_last_ok: { ts: h(3) }, portfolio_last: { ts: h(3), status: "ok", writes: "[]" } }), "CHARTER-TICK-STALE-1", "a 30h-old charter snapshot is stale");
eq(keys({ first_seen: h(60), charter_last: { ts: h(3) }, charter_notes: ["write-failed: PUT 403", "read-failed: HTTP 500", "markers-missing: x"], portfolio_last_ok: { ts: h(3) }, portfolio_last: { ts: h(3), status: "ok", writes: "[]" } }), "CHARTER-COMMIT-FAILED-1", "three failed commits in a row are a finding");
eq(keys({ first_seen: h(60), charter_last: { ts: h(3) }, charter_notes: ["write-failed: PUT 403", "committed: y", "write-failed: z"], portfolio_last_ok: { ts: h(3) }, portfolio_last: { ts: h(3), status: "ok", writes: "[]" } }), "", "a commit in between is not a finding");
eq(keys({ first_seen: h(60), charter_last: { ts: h(3) }, charter_notes: ["already-today: x"], portfolio_last_ok: { ts: h(40) }, portfolio_last: { ts: h(40), status: "ok", writes: "[]" } }), "PORTFOLIO-SYNC-STALE-1", "a 40h-old portfolio sync is stale");
eq(keys({ first_seen: h(60), charter_last: { ts: h(3) }, charter_notes: ["unchanged: x"], portfolio_last_ok: { ts: h(3) }, portfolio_last: { ts: h(3), status: "partial", writes: JSON.stringify([{ path: "QNFO/.github/profile/README.md", status: "anchor-missing" }, { path: "QNFO/qnfo-workers/docs/PORTFOLIO.md", status: "committed" }]) } }), "PORTFOLIO-WRITE-FAILED-1: QNFO/.github/profile/README.md", "one failed surface is one finding, the committed one is not");
eq(keys({ first_seen: h(60), charter_last: { ts: h(3) }, charter_notes: [], portfolio_last_ok: null, portfolio_last: { ts: h(1), status: "fetch-failed", note: "orgs/repos page 1 HTTP 401", writes: "[]" } }), "PORTFOLIO-SYNC-STALE-1", "fetch failures with no success ever are stale after grace");
const f1 = W.loopWatchEvaluate({ first_seen: h(60), charter_last: { ts: h(3) }, charter_notes: [], portfolio_last_ok: null, portfolio_last: { ts: h(1), status: "fetch-failed", note: "orgs/repos page 1 HTTP 401", writes: "[]" } }, NOW)[0];
eq(f1.text.includes("HTTP 401"), true, "the finding carries the loop's own failure note");
eq(f1.severity, "high", "a stale loop is high");

console.log(`loopwatch.test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
