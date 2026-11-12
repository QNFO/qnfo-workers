// _shared/flow-registry.test.mjs: FLOW-DIRECTIVE-1. Run: node _shared/flow-registry.test.mjs
// Fails when a Cloudflare Workflow or a cron worker has no declared flow, an inflow has no producer, an outflow no consumer, a flow is on no
// feedback cycle without a declared gap, the directive leaves CLAUDE.md or AGENTS.md, or the adaptation ledger stops keeping or rolling back.
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import * as FR from "./flow-registry.js";

const root = new URL("../", import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok   " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x) : "")); } };
function d1(db) {
  return { prepare(sql) { let a = []; const api = { bind(...x) { a = x; return api; },
    async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: r.changes } }; },
    async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) ?? null; } }; return api; } };
}

console.log("[registry]");
const v = FR.validateRegistry();
ok("no schema errors", v.errors.length === 0, v.errors);
ok("no unaccounted open loop (inflow without producer, outflow without consumer, flow off every cycle)", v.open_loops.length === 0, v.open_loops);
ok("every gap names a loop issue and a probe", v.gaps.every((g) => /^FLOW-GAP-/.test(g.loop_issue) && /SELECT/i.test(g.probe)), v.gaps);
ok("most flows are closed loops", v.closed.length >= FR.FLOWS.length - v.gaps.length, { closed: v.closed.length, flows: FR.FLOWS.length });
ok("jobs outcomes reach the scorer: job-apply -> ... -> jobs-sweep is a cycle", v.closed.includes("job-apply") && v.closed.includes("jobs-sweep") && v.closed.includes("job-mail-in"));
const broken = FR.FLOWS.concat([{ id: "dead-end", label: "x", scope: "personal", plane: "x", worker: "x", executor: { kind: "cron", name: "x" }, clock: null, clock_reason: "test",
  inflows: [{ signal: "nobody.makes.this", via: { kind: "d1", name: "x" } }], outflows: [{ signal: "nobody.reads.this", via: { kind: "d1", name: "x" } }], feedback: "none" }]);
const vb = FR.validateRegistry(broken);
ok("a dead-end flow is caught (inflow without producer)", vb.open_loops.some((o) => o.kind === "inflow-without-producer" && o.signal === "nobody.makes.this"));
ok("a dead-end flow is caught (outflow without consumer)", vb.open_loops.some((o) => o.kind === "outflow-without-consumer" && o.signal === "nobody.reads.this"));
ok("a dead-end flow is caught (no feedback cycle)", vb.open_loops.some((o) => o.kind === "no-feedback-cycle" && o.flows[0] === "dead-end"));
const vx = FR.validateRegistry([Object.assign({}, FR.FLOWS[0], { id: "y", outflows: [{ signal: "s", to: "ext.x", via: { kind: "pages", name: "p" } }] })]);
ok("an outflow to the world must name what returns", vx.errors.some((e) => /names no returning signal/.test(e)));

console.log("[every Workflow and cron worker is declared]");
const declaredWorkers = new Set(FR.FLOWS.map((f) => f.worker).filter(Boolean));
const executorText = FR.FLOWS.map((f) => f.executor.name).join(" | ");
const cronWorkers = [], workflows = [];
for (const d of fs.readdirSync(root)) {
  const w = root + d + "/wrangler.toml";
  if (!fs.existsSync(w) || fs.existsSync(root + d + "/RETIRED") || fs.existsSync(root + d + "/FOLDED")) continue;
  const t = fs.readFileSync(w, "utf8").replace(/^\s*#.*$/gm, "");
  if (/^\s*crons\s*=/m.test(t)) cronWorkers.push(d);
  for (const blk of t.split(/\[\[workflows\]\]/).slice(1)) { const m = /^\s*name\s*=\s*"([^"]+)"/m.exec(blk.split(/\n\s*\[/)[0]); if (m) workflows.push({ worker: d, name: m[1] }); }
}
ok("found the fleet's Workflows", workflows.length >= 6, workflows);
for (const wf of workflows) ok("Workflow " + wf.name + " (" + wf.worker + ") has a declared flow", executorText.includes(wf.name));
const undeclared = cronWorkers.filter((w) => !declaredWorkers.has(w) && !FR.UNDECLARED_CRON_WORKERS.includes(w));
ok("every cron worker is declared or listed as still to declare", undeclared.length === 0, undeclared);
const stale = FR.UNDECLARED_CRON_WORKERS.filter((w) => declaredWorkers.has(w) || !cronWorkers.includes(w));
ok("the still-to-declare list holds no declared or cronless worker (shrink it)", stale.length === 0, stale);

console.log("[standing directive]");
for (const f of ["CLAUDE.md", "AGENTS.md"]) {
  const t = fs.readFileSync(root + f, "utf8");
  ok(f + " carries FLOW-DIRECTIVE-1", /FLOW-DIRECTIVE-1/.test(t) && /inflows/.test(t) && /_shared\/flow-registry\.js/.test(t));
}
const mig = fs.readdirSync(root + "migrations").filter((f) => /flow-directive/.test(f)).map((f) => fs.readFileSync(root + "migrations/" + f, "utf8")).join("\n");
ok("the migration registers the flow metrics with triggers and the policy row", ["flow_open_loops", "flow_unmapped_clocks", "flow_undeclared_workers", "flow_directive_policy"].every((k) => mig.includes(k)));

console.log("[runtime: publish, clocks, adaptations]");
const raw = new DatabaseSync(":memory:"), db = d1(raw);
raw.exec("CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT)");
raw.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT)");
raw.exec("CREATE TABLE clock_ticks (loop TEXT PRIMARY KEY)");
for (const m of ["flow_open_loops", "flow_unmapped_clocks", "flow_undeclared_workers", "jobsearch_reply_rate_90d", "other_metric"]) raw.prepare("INSERT INTO metric_registry (metric) VALUES (?)").run(m);
for (const l of ["jobs-sweep", "companion-tick", "a-new-loop"]) raw.prepare("INSERT INTO clock_ticks (loop) VALUES (?)").run(l);
const T0 = "2026-11-12T16:00:00.000Z";
await FR.recordAdaptation(db, { flow: "jobs-outcome-learner", knob: "jobs.outcome_weights", hash: "h1", json: "{}", metric: "jobsearch_reply_rate_90d", op: ">=", baseline: 0.05, days: 30 }, T0);
const again = await FR.recordAdaptation(db, { flow: "jobs-outcome-learner", knob: "jobs.outcome_weights", hash: "h1", metric: "jobsearch_reply_rate_90d", baseline: 0.05 }, T0);
ok("an adaptation is recorded once per knob and value", again.recorded === false);
await FR.recordAdaptation(db, { flow: "x", knob: "other.knob", hash: "h2", metric: "other_metric", op: ">=", baseline: 1, days: 1 }, T0);
const T31 = "2026-12-14T16:00:00.000Z";
raw.prepare("UPDATE metric_registry SET last_value = '0.02' WHERE metric = 'jobsearch_reply_rate_90d'").run();
let s = await FR.settleAdaptations(db, "2026-11-14T16:00:00.000Z");
ok("an unmeasured adaptation is re-checked, not judged", s.inconclusive === 1 && s.kept === 0 && s.rolled_back === 0, s);
s = await FR.settleAdaptations(db, T31);
ok("a missed prediction rolls the knob back", s.rolled_back === 1, s);
const knob = raw.prepare("SELECT value FROM ops_config WHERE key = 'flow_knob:jobs.outcome_weights'").get();
ok("the rollback is written where the producer reads it", knob && knob.value === "off", knob);
raw.prepare("UPDATE metric_registry SET last_value = '3' WHERE metric = 'other_metric'").run();
s = await FR.settleAdaptations(db, "2027-01-01T00:00:00.000Z");
ok("a met prediction is kept", s.kept === 1 && s.rolled_back === 0, s);
ok("judge", FR.judge(">=", 0.1, 0.05) === "kept" && FR.judge(">=", 0.01, 0.05) === "rolled-back" && FR.judge(">=", null, 0.05) === "inconclusive");
const r = await FR.flowsTick({ AUDIT: db }, { now: () => T0 });
ok("flowsTick publishes every flow", raw.prepare("SELECT COUNT(*) n FROM flow_registry").get().n === FR.FLOWS.length, r);
ok("flowsTick finds a clock no flow owns", r.unmapped_clocks.length === 1 && r.unmapped_clocks[0] === "a-new-loop", r);
ok("flowsTick writes the metrics", raw.prepare("SELECT last_value FROM metric_registry WHERE metric = 'flow_unmapped_clocks'").get().last_value === "1"
  && raw.prepare("SELECT last_value FROM metric_registry WHERE metric = 'flow_open_loops'").get().last_value === String(v.gaps.length));
const live = await FR.flowsStatus({ AUDIT: db });
const html = FR.flowCard(live);
ok("the flow card renders every flow and the adaptations", (html.match(/class="pp-flow"/g) || []).length === FR.FLOWS.length && /Recent adaptations/.test(html) && !/undefined/.test(html));
ok("every clock the watchdog runs today belongs to a flow", (() => {
  const src = fs.readFileSync(root + "qnfo-cloud-ops/worker.js", "utf8");
  const blk = src.slice(src.indexOf("var CLOCK_LOOPS = ["), src.indexOf("function clockMin("));
  const ids = [...blk.matchAll(/\{ id: "([a-z0-9-]+)"/g)].map((m) => m[1]);
  const known = new Set(FR.FLOWS.map((f) => f.clock).filter(Boolean));
  const miss = ids.filter((i) => !known.has(i));
  if (miss.length) console.log("    unmapped:", miss);
  return ids.length >= 10 && miss.length === 0;
})());

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
