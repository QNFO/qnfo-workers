/**
 * charter.test.mjs -- offline regression lock for CHARTER-LOOP-1 (docs/QUNIVERSE-CHARTER.md).
 *
 * The pure half of the loop (charterTarget / charterMeets / charterEvaluate / charterRender /
 * charterSplice) lives inline in worker.js between the CHARTER-LOOP-1:BEGIN/END markers so the
 * bundle stays a single file. This test slices that block out of worker.js, evaluates it in a
 * sandbox with the few bundle helpers it never calls stubbed out, and replays the live-register
 * fixture (charter.fixture.json) through it.
 *
 * Its output MUST contain "0 failed" on success; charter-guard.yml greps for exactly that string,
 * so the two assertions are one contract (same convention as version-compare.test.mjs).
 *
 *   node qnfo-fleet-control/charter.test.mjs            # run the assertions
 *   node qnfo-fleet-control/charter.test.mjs --render   # print the rendered CHARTER-LIVE block
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const BEGIN = "// ---- CHARTER-LOOP-1:BEGIN";
const END = "// ---- CHARTER-LOOP-1:END ----";
const a = src.indexOf(BEGIN);
const b = src.indexOf(END);
if (a < 0 || b < 0 || b < a) {
  console.error("FAIL charter block markers missing from worker.js");
  console.log("1 failed");
  process.exit(1);
}
const block = src.slice(a, b + END.length);
// Bundle symbols the block references only inside the async I/O half (never exercised here).
const sandbox = {
  VERSION: "test", timedFetch: null, b64encode: null, sha256: null,
  console, Date, Math, JSON, Number, String, Object, Array, RegExp, isFinite, TextDecoder, atob,
  __export: null,
};
vm.createContext(sandbox);
vm.runInContext(
  block + "\n__export = { charterTarget, charterMeets, charterNum, charterEvaluate, charterRender, charterSplice, CHARTER_PILLARS, CHARTER_MVP, CHARTER_BEGIN, CHARTER_END, CHARTER_VERSION };",
  sandbox,
  { filename: "charter-block.js" },
);
const C = sandbox.__export;
const fixture = JSON.parse(readFileSync(join(here, "charter.fixture.json"), "utf8"));

let passed = 0;
let failed = 0;
function eq(actual, expected, label) {
  if (actual === expected) { passed++; return; }
  failed++;
  console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}
function ok(cond, label) { eq(!!cond, true, label); }

// --- target parsing -------------------------------------------------------
eq(JSON.stringify(C.charterTarget("<= 24 (solo-manageability band)")), '{"op":"<=","val":24}', "target <= with prose");
eq(JSON.stringify(C.charterTarget(">=95")), '{"op":">=","val":95}', "target >= bare");
eq(JSON.stringify(C.charterTarget("<0.05 USD/task")), '{"op":"<","val":0.05}', "target < decimal");
eq(JSON.stringify(C.charterTarget("+10 new/month")), '{"op":">=","val":10}', "target + means at least");
eq(JSON.stringify(C.charterTarget("0")), '{"op":"<=","val":0}', "target bare zero means at most zero");
eq(JSON.stringify(C.charterTarget("all 0")), '{"op":"<=","val":0}', "target all 0");
eq(C.charterTarget("maximize (trend)"), null, "maximize is not a threshold");
eq(C.charterTarget("RETIRED 2026-10-01 (docs/STRATEGY.md s9)"), null, "retired is not a threshold");
eq(C.charterTarget(null), null, "null target");
eq(C.charterTarget("<=144/day each (CRON-MANDATE-1)"), null, "a per-worker cron rule is not a threshold on a percentage");
eq(C.charterNum("+394.17%"), 394.17, "numeric from percent string");
eq(C.charterNum("$58.15/30d"), 58.15, "numeric from dollar string");
eq(C.charterNum(null), null, "numeric null");
eq(C.charterMeets(45, C.charterTarget("<= 24")), false, "45 workers misses <= 24");
eq(C.charterMeets(97.8, C.charterTarget(">=95")), true, "97.8 meets >= 95");
eq(C.charterMeets(null, C.charterTarget(">=95")), null, "unmeasured is null, not false");

// --- evaluate on the live fixture -------------------------------------------
const ev = C.charterEvaluate(fixture, "2026-10-01T10:33:00.000Z");
eq(ev.charter_version, C.CHARTER_VERSION, "charter version propagated");
eq(ev.mvp.length, C.CHARTER_MVP.length, "one MVP row per component");
eq(ev.mvp_up, C.CHARTER_MVP.length, "fixture: every MVP component serving");
eq(ev.breaches.length, 0, "fixture: no MVP breach");
eq(ev.composite_autonomy, 4.1, "composite autonomy read from the overall row");
ok(ev.health !== null && ev.health > 0 && ev.health < 1, "charter health is a ratio strictly between 0 and 1 on the fixture");
const byKey = Object.fromEntries(ev.pillars.map((p) => [p.key, p]));
eq(byKey.core.missing.includes("worker_count"), true, "core pillar misses worker_count (45 > 24)");
eq(byKey.core.missing.includes("drift_total"), true, "core pillar misses drift_total (2 > 0)");
eq(byKey.cost.missing.includes("cost_usd_30d"), true, "cost pillar misses cost_usd_30d (446.50 > 200)");
eq(byKey.research.met, byKey.research.evaluated, "research pillar meets every evaluated metric");
eq(byKey.security.health, null, "security pillar has no registry metric yet (n/a, not 0)");
const m = Object.fromEntries(ev.metrics.map((r) => [r.metric, r]));
eq(m.impressions_growth_30d.retired, true, "retired metric flagged from impact_thresholds");
eq(m.impressions_growth_30d.meets, null, "retired metric is not graded");
eq(m.workers_ai_attribution_coverage_pct.meets, null, "unmeasured metric is not graded");
eq(ev.budget_over.map((x) => x.node_class).includes("workers"), true, "workers over cap reported");
eq(ev.budget_over.map((x) => x.node_class).includes("ai_spend:openai"), true, "openai spend over cap reported");
eq(ev.budget_over.map((x) => x.node_class).includes("queues"), false, "queues under cap not reported");
eq(ev.horizons.H0 >= 1, true, "H0 horizon populated (broken/violated/gate-verify)");
eq(ev.roadmap[0].score >= ev.roadmap[ev.roadmap.length - 1].score, true, "roadmap sorted by priority desc");
eq(ev.roadmap.filter((r) => r.horizon === "parked").every((r) => ["owner-decision", "deferred", "local-only"].includes(r.status)), true, "parked horizon only holds owner/deferred/local-only");
eq(ev.swot.threats.some((t) => t.indexOf("shutdown_manifest phase 1") === 0), true, "ARMED shutdown row is a threat");
eq(ev.swot.threats.some((t) => t.indexOf("review gate 2026-12-31 OPEN") === 0), true, "open review gate is a threat");
eq(ev.swot.weaknesses.some((w) => w.indexOf("autonomy s5_policy") === 0), true, "weak autonomy dimension is a weakness");
eq(ev.swot.strengths.some((s) => s.indexOf("guard_registry 68/68") === 0), true, "verified guards are a strength");
eq(ev.swot.opportunities.length > 0 && ev.swot.opportunities.length <= 12, true, "opportunities bounded to 12");
eq(ev.security_issues, 0, "no SEC- issue open in the fixture");
eq(ev.high_issues, 10, "ten high-priority issues in the fixture");

// --- a down MVP component becomes a breach and a weakness --------------------
const down = JSON.parse(JSON.stringify(fixture));
down.worker_live_audit = down.worker_live_audit.filter((r) => r.worker !== "qnfo-social");
down.worker_live_audit.push({ worker: "qnfo-social", note: "NOT_DEPLOYED", live_version: null, http: 404 });
const ev2 = C.charterEvaluate(down, "2026-10-01T10:33:00.000Z");
eq(ev2.mvp_up, C.CHARTER_MVP.length - 1, "one MVP component down");
eq(ev2.breaches.length, 1, "exactly one breach");
eq(ev2.breaches[0].key, "CHARTER-MVP-DOWN-1: qnfo-social", "breach key is the dedup title");
eq(ev2.swot.weaknesses.some((w) => w.indexOf("MVP component qnfo-social") === 0), true, "down component listed as a weakness");
const ev3 = C.charterEvaluate({}, "2026-10-01T10:33:00.000Z");
eq(ev3.mvp_up, 0, "empty facts: nothing serving, nothing thrown");
eq(ev3.health, null, "empty facts: health n/a");

// --- render + splice ----------------------------------------------------------
const md = C.charterRender(ev);
ok(md.startsWith(C.CHARTER_BEGIN) && md.endsWith(C.CHARTER_END), "render is wrapped in the live markers");
ok(md.includes("| qnfo-fleet-control | autonomy |"), "MVP table lists the governance kernel");
ok(md.includes("### SWOT, measured today"), "SWOT section rendered");
ok(md.includes("| H0 |"), "horizon table rendered");
ok(md.includes("- **mission** v1"), "terminal objectives rendered");
ok(md.length < 40000, "rendered block stays under 40 kB");
const doc = "# Charter\n\nprose before\n\n" + C.CHARTER_BEGIN + "\nold\n" + C.CHARTER_END + "\n\nprose after\n";
const spliced = C.charterSplice(doc, md);
ok(spliced.startsWith("# Charter\n\nprose before\n\n" + C.CHARTER_BEGIN), "splice keeps the prose before");
ok(spliced.endsWith(C.CHARTER_END + "\n\nprose after\n"), "splice keeps the prose after");
ok(!spliced.includes("\nold\n"), "splice replaces the old block");
eq(C.charterSplice("no markers here", md), null, "splice refuses a doc without markers");
eq(C.charterSplice(spliced, md), spliced, "splice is idempotent");

if (process.argv.includes("--render")) console.log(md);
if (process.argv.includes("--json")) console.log(JSON.stringify(ev));
console.log(`charter.test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
