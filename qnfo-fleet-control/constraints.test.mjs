/**
 * constraints.test.mjs -- offline regression lock for OBJECTIVE-CONSTRAINTS-1 (goals 41, 43, 57, ratified under the owner's queue delegation).
 * Slices the CHARTER-LOOP-1 block (grader helpers, pillars) and the OBJECTIVE-CONSTRAINTS-1 block out of worker.js,
 * drives the pure half with synthetic facts, then runs the hourly tick against an in-memory SQLite D1 (node:sqlite,
 * Node 22+) with the live triggers that matter: an issue closes only with evidence, a title closed within 24h is not
 * refiled, metric_registry rows need a source, a disposition actor and a canonical cadence.
 * Output MUST contain "0 failed" on success; charter-guard.yml greps for exactly that string.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
function slice(begin, end) {
  const a = src.indexOf(begin), b = src.indexOf(end);
  if (a < 0 || b < 0 || b < a) { console.error("FAIL block markers missing: " + begin); console.log("1 failed"); process.exit(1); }
  return src.slice(a, b + end.length);
}
const charterBlock = slice("// ---- CHARTER-LOOP-1:BEGIN", "// ---- CHARTER-LOOP-1:END ----");
const ocBlock = slice("// ---- OBJECTIVE-CONSTRAINTS-1:BEGIN", "// ---- OBJECTIVE-CONSTRAINTS-1:END ----");
const sandbox = { VERSION: "test", timedFetch: null, b64encode: null, sha256: null, console, Date, Math, JSON, Number, String, Object, Array, RegExp, isNaN, isFinite, TextDecoder, atob, __export: null };
vm.createContext(sandbox);
vm.runInContext(charterBlock + "\n" + ocBlock + "\n__export = { objectiveConstraintsEvaluate, objectiveLimitsReview, objectiveConstraintsTick, ocFacts, ocCapability, ocEnergy, ocUnmanaged, OBJECTIVE_CONSTRAINTS, OC_ISSUE_PREFIX, CHARTER_PILLARS };", sandbox, { filename: "objective-constraints-block.js" });
const C = sandbox.__export;

let passed = 0, failed = 0;
function eq(actual, expected, label) { if (actual === expected) { passed++; return; } failed++; console.error(`FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`); }
function ok(cond, label) { eq(!!cond, true, label); }
const NOW = Date.parse("2026-10-02T12:00:00Z");
const h = (n, base) => new Date((base || NOW) - n * 36e5).toISOString();

// --- the charter grades the three constraints under their pillars ------------------------------------------------
const pillarOf = (m) => (C.CHARTER_PILLARS.find((p) => p.metrics.indexOf(m) >= 0) || {}).key;
eq(pillarOf("capability_contract_conformance"), "autonomy", "goal 41 metric graded under autonomy");
eq(pillarOf("energy_efficiency"), "cost", "goal 43 metric graded under cost");
eq(pillarOf("unmanaged_direct_spend_share"), "cost", "goal 57 metric graded under cost");
eq(C.OBJECTIVE_CONSTRAINTS.map((c) => c.goal).join(","), "41,43,57", "one constraint per ratified goal");

// --- goal 41: capability contract conformance --------------------------------------------------------------------
const cap = (svc, ts, caps, lims) => ({ service: svc, ts, capabilities: caps === undefined ? '["a"]' : caps, limitations: lims === undefined ? '["b"]' : lims });
let p = C.ocCapability({ capability_rows: [cap("w1", h(1)), cap("w2", h(5)), cap("w3", h(20))], live_workers: 3 }, NOW);
eq(p.value, 1, "three fresh conforming rows of three live workers: 1.0");
p = C.ocCapability({ capability_rows: [cap("w1", h(1)), cap("w2", h(30)), cap("w3", h(2), '["a"]', "[]")], live_workers: 3 }, NOW);
eq(p.value, 0.3333, "a stale row and an empty limitations[] both count against the share");
eq(p.stale.join(), "w2", "the stale worker is named");
eq(p.empty.join(), "w3", "the worker with no limitations is named");
p = C.ocCapability({ capability_rows: [cap("w1", h(1)), cap("w2", h(1)), cap("w3", h(1))], live_workers: 4 }, NOW);
eq(p.value, 0.75, "a live worker missing from the snapshot counts against the share");
eq(p.unlisted, 1, "and is reported as unlisted");
eq(C.ocCapability({ capability_rows: null, live_workers: 44 }, NOW).value, null, "an unreadable snapshot is unmeasured, not zero");
eq(C.ocCapability({ capability_rows: [cap("w1", h(1), '[" "]', '["x"]')], live_workers: 1 }, NOW).value, 0, "whitespace-only capabilities are empty");

// --- goal 43: energy efficiency (compute proxy) -------------------------------------------------------------------
p = C.ocEnergy({ ai_rows: [{ calls: 10, errors: 1, neurons: 1000 }, { calls: 10, errors: 0, neurons: 1000 }, { calls: 50, errors: 50, neurons: 0 }] });
eq(p.value, 0.95, "a failed call is charged its row's mean compute: 1 - 100/2000");
eq(p.calls, 20, "rows without neurons are not graded");
eq(C.ocEnergy({ ai_rows: [{ calls: 4, errors: 9, neurons: 100 }] }).value, 0, "errors are clamped to calls");
eq(C.ocEnergy({ ai_rows: [] }).value, null, "no Workers AI compute in the window is unmeasured");
eq(C.ocEnergy({}).value, null, "unreadable counters are unmeasured");
p = C.ocEnergy({ ai_rows: [{ calls: 180, errors: 8, neurons: 51359.68 }, { calls: 16, errors: 0, neurons: 66671.76 }, { calls: 15, errors: 2, neurons: 6263.13 }, { calls: 7, errors: 1, neurons: 3994.79 }] });
ok(p.value > 0.97 && p.value < 0.98, "the 2026-10-01 live counters read about 0.97");

// --- goal 57: unmanaged direct-provider spend share ---------------------------------------------------------------
const spend = (o) => Object.assign({ spend_meta: { ai_est_cost_30d: "450.56", byok_cost_usd_30d: "166.56", last_refresh: h(1) }, plan_usd_month: 200, router_direct_usd_30d: 0.0066, external_declared_usd_month: 450, external_declared_as_of: "2026-09-26" }, o || {});
p = C.ocUnmanaged(spend(), NOW);
eq(p.value, 0.256, "live 2026-10-02 inputs: (166.56 + 0.0066) / (450.56 + 0.0066 + 200) = 0.256");
eq(p.share_if_declared_counted, 0.5602, "the declared external estimate is shown, not graded");
eq(C.ocUnmanaged(spend({ spend_meta: { ai_est_cost_30d: "450", byok_cost_usd_30d: "166", last_refresh: h(30) } }), NOW).value, null, "a stale cost refresh is unmeasured");
eq(C.ocUnmanaged(spend({ plan_usd_month: null }), NOW).value, null, "no plan baseline is unmeasured");
eq(C.ocUnmanaged(spend({ spend_meta: undefined }), NOW).value, null, "no cost keys is unmeasured");
eq(C.ocUnmanaged(spend({ router_direct_usd_30d: null }), NOW).value, 0.256, "an unreadable router ledger counts its pennies as zero");

// --- evaluate: verdicts and findings ------------------------------------------------------------------------------
const healthyFacts = Object.assign(spend(), { capability_rows: [cap("w1", h(1)), cap("w2", h(1))], live_workers: 2, ai_rows: [{ calls: 10, errors: 0, neurons: 500 }] });
let ev = C.objectiveConstraintsEvaluate(healthyFacts, NOW);
eq(ev.healthy, true, "all three constraints met: healthy");
eq(ev.measured, 3, "all three measured");
eq(ev.findings.length, 0, "no findings");
ev = C.objectiveConstraintsEvaluate(Object.assign({}, healthyFacts, { spend_meta: { ai_est_cost_30d: "450", byok_cost_usd_30d: "400", last_refresh: h(1) }, ai_rows: [{ calls: 10, errors: 5, neurons: 1000 }] }), NOW);
eq(ev.findings.map((f) => f.key).sort().join("|"), C.OC_ISSUE_PREFIX + "energy_efficiency|" + C.OC_ISSUE_PREFIX + "unmanaged_direct_spend_share", "two breaches, two deduped titles");
const sf = ev.findings.find((f) => f.metric === "unmanaged_direct_spend_share");
eq(sf.severity, "high", "a spend breach is high");
ok(/goals\.id=57/.test(sf.text) && /\$400/.test(sf.text), "the finding names the goal and the measured dollars");
ev = C.objectiveConstraintsEvaluate({}, NOW);
eq(ev.measured, 0, "empty facts: nothing measured");
eq(ev.findings.length, 0, "empty facts: nothing filed (unknown is not a breach)");
eq(ev.constraints.every((c) => c.meets === null), true, "empty facts: every verdict is null");

// --- OBJECTIVE-LIMITS-REVIEW-1 (goal 41): undecidable and unobserved graded terms ----------------------------------
const reg = (metric, target, value, refreshedH) => ({ metric, target, last_value: value, last_refreshed: refreshedH === undefined ? h(1) : (refreshedH === null ? null : h(refreshedH)) });
const registry = [
  reg("worker_count", "<= 24", "44"), reg("drift_total", "0", "0"), reg("probe_coverage_pct", ">=95", "97.7"), reg("deploy_freshness_h", "< 24h behind repo main", "4"), reg("cron_compliance", "<=144/day each (CRON-MANDATE-1)", "100"), reg("guard_rcs", "all 0", "0"),
  reg("publications_30d", ">=2/30d", "12"), reg("full_reports_live_30d", ">=2 by 2026-10-25", "12"), reg("indexed_surface", "maximize (crawl surface)", "450"),
  reg("distribution_posts_30d", ">=1/day", "139"), reg("subscribers_growth_monthly", "+10 new/month", "1"), reg("pageviews_30d", "maximize", "5960"), reg("referral_30d", "maximize", "70"), reg("external_impact_per_dollar", "maximize (trend)", "0.014"),
  reg("cost_usd_30d", "<= 200", "450"), reg("workers_ai_cost_30d_usd", "<= 7.50", "59"), reg("gateway_cap_30d_usd", "<=150", "150"), reg("cost_per_successful_task_by_class", "<0.05 USD/task", "0.13"), reg("workers_ai_attribution_coverage_pct", ">= 80", "98.5"),
  reg("energy_efficiency", ">= 0.8 (compute proxy)", "0.97"), reg("unmanaged_direct_spend_share", "<= 0.5", "0.256"),
  reg("open_agent_issues", "<=10", "23"), reg("fleet_context_tokens", "<=1000000", "210372"), reg("capability_contract_conformance", ">= 1.0", "1")
];
const objectives = [{ objective_key: "mission", version: 1 }, { objective_key: "objective-function", version: 3 }, { objective_key: "cost-ceiling", version: 2 }, { objective_key: "return-on-spend", version: 3 }];
let rv = C.objectiveLimitsReview({ objectives, metric_registry: registry, impact_thresholds: [] }, NOW);
eq(rv.map((r) => r.objective_key).join(), "return-on-spend", "only the objective graded on undecidable terms is proposed for revision");
eq(rv[0].undecidable.slice().sort().join(","), "external_impact_per_dollar,indexed_surface,pageviews_30d,referral_30d", "the four 'maximize' terms are undecidable");
eq(rv[0].terms, 8, "return-on-spend is graded on eight terms");
ok(rv[0].statement.length <= 220, "the statement fits the dashboard card (" + rv[0].statement.length + " chars)");
ok(!/weight\s+of/i.test(rv[0].statement), "the statement is not mistaken for a weight change by OBJECTIVE-REVISION-APPLY-1");
ok(/goals\.id=41/.test(rv[0].alignment), "the alignment cites the ratified goal");
const key1 = rv[0].goal_key;
eq(C.objectiveLimitsReview({ objectives, metric_registry: registry, impact_thresholds: [] }, NOW + 864e5)[0].goal_key, key1, "the goal_key is stable for the same objective version and limits");
rv = C.objectiveLimitsReview({ objectives, metric_registry: registry, impact_thresholds: [{ metric: "pageviews_30d", target: "RETIRED 2026-10-02" }] }, NOW);
ok(rv[0].undecidable.indexOf("pageviews_30d") < 0 && rv[0].goal_key !== key1, "a retired term is excluded and changes the key");
const reg2 = registry.filter((r) => r.metric !== "energy_efficiency").concat([]).map((r) => (r.metric === "gateway_cap_30d_usd" ? reg("gateway_cap_30d_usd", "<=150", "n/a", 200) : r));
rv = C.objectiveLimitsReview({ objectives, metric_registry: reg2, impact_thresholds: [] }, NOW);
const cc = rv.find((r) => r.objective_key === "cost-ceiling");
eq(cc && cc.unobserved.slice().sort().join(","), "energy_efficiency,gateway_cap_30d_usd", "a term with no row, or no value for over 7 days, is unobserved");
const reg3 = registry.map((r) => (r.metric === "gateway_cap_30d_usd" ? reg("gateway_cap_30d_usd", "<=150", "n/a", 2) : r));
eq(C.objectiveLimitsReview({ objectives, metric_registry: reg3, impact_thresholds: [] }, NOW).some((r) => r.objective_key === "cost-ceiling"), false, "a term refreshed recently is not yet unobserved");
eq(C.objectiveLimitsReview({ objectives: [], metric_registry: registry }, NOW).length, 0, "no active objectives: nothing proposed");

// --- the hourly tick against an in-memory D1 ----------------------------------------------------------------------
let sqlite = null;
try { sqlite = await import("node:sqlite"); } catch (e) { sqlite = null; }
if (!sqlite) {
  console.log("constraints.test: node:sqlite unavailable (Node < 22); D1 replay skipped");
} else {
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE capability_audit_snapshot (service TEXT PRIMARY KEY, version TEXT, capabilities TEXT, limitations TEXT, ts TEXT);
CREATE TABLE fleet_budget (node_class TEXT PRIMARY KEY, cap INTEGER, target INTEGER, current INTEGER, unit TEXT, updated_at TEXT);
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, neurons REAL DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));
CREATE TABLE analytics_dash_meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE ai_spend_ledger (day TEXT, provider TEXT, caller TEXT, model TEXT, calls INTEGER, in_tok INTEGER, out_tok INTEGER, usd REAL, downgraded INTEGER, refused INTEGER, PRIMARY KEY (day, provider, caller, model));
CREATE TABLE cost_daily (date TEXT NOT NULL, source TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'fleet', usd REAL NOT NULL DEFAULT 0, note TEXT, PRIMARY KEY (date, source));
CREATE TABLE objectives (id INTEGER PRIMARY KEY AUTOINCREMENT, objective_key TEXT UNIQUE NOT NULL, statement TEXT, version INTEGER DEFAULT 1, status TEXT DEFAULT 'ACTIVE');
CREATE TABLE impact_thresholds (metric TEXT PRIMARY KEY, target TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TRIGGER metric_registry_source_required_ins BEFORE INSERT ON metric_registry FOR EACH ROW WHEN NEW.source_of_truth IS NULL OR trim(NEW.source_of_truth)='' OR NEW.disposition_actor IS NULL OR trim(NEW.disposition_actor)='' OR NEW.refresh_cadence IS NULL OR trim(NEW.refresh_cadence)='' BEGIN SELECT RAISE(ABORT,'METRIC-INTEGRITY-1'); END;
CREATE TRIGGER metric_registry_cadence_canonical_ins BEFORE INSERT ON metric_registry FOR EACH ROW WHEN NOT (lower(trim(NEW.refresh_cadence)) IN ('hourly','daily','weekly','monthly')) BEGIN SELECT RAISE(ABORT,'METRIC-CADENCE-CANONICAL-1'); END;
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, close_evidence TEXT);
CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix') AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') BEGIN SELECT RAISE(ABORT,'close-without-evidence'); END;
CREATE TRIGGER issue_refile_guard BEFORE INSERT ON agent_issues WHEN EXISTS (SELECT 1 FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved','wontfix','closed') AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s','now') * 1000 - 86400000)) BEGIN SELECT RAISE(IGNORE); END;
CREATE TABLE goals (id INTEGER PRIMARY KEY AUTOINCREMENT, goal_key TEXT UNIQUE NOT NULL, statement TEXT NOT NULL, goal_type TEXT NOT NULL DEFAULT 'instrumental', parent_objective TEXT, alignment TEXT, source TEXT, score REAL, priority INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'proposed', dod TEXT, owner TEXT, adopted_at TEXT, created_at TEXT, updated_at TEXT, program_code TEXT);
`);
  const today = new Date().toISOString().slice(0, 10);
  const rnow = Date.now();
  const rh = (n) => new Date(rnow - n * 36e5).toISOString();
  for (const s of ["w1", "w2", "w3"]) db.prepare("INSERT INTO capability_audit_snapshot VALUES (?, 'v', '[\"x\"]', '[\"y\"]', ?)").run(s, rh(2));
  db.prepare("INSERT INTO fleet_budget VALUES ('workers', 30, 24, 3, 'workers', ?)").run(rh(1));
  db.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, errors, neurons) VALUES (?, 'qnfo-research-exec', 'binding', 'm', 20, 1, 2000)").run(today);
  const setMeta = (k, v) => db.prepare("INSERT INTO analytics_dash_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k, v);
  setMeta("ai_est_cost_30d", "450.56"); setMeta("byok_cost_usd_30d", "166.56"); setMeta("last_refresh", rh(1));
  db.prepare("INSERT INTO ai_spend_ledger VALUES (?, 'deepseek', 'x', 'deepseek-chat', 1, 1, 1, 0.0066, 0, 0)").run(today);
  db.prepare("INSERT INTO cost_daily (date, source, scope, usd) VALUES ('2026-09-26', 'cloudflare_plan', 'fleet', 200), ('2026-09-26', 'direct_providers_external', 'external', 450)").run();
  db.exec("INSERT INTO objectives (objective_key, version) VALUES ('mission', 1), ('objective-function', 3), ('cost-ceiling', 2), ('return-on-spend', 3)");
  const insReg = db.prepare("INSERT INTO metric_registry (metric, layer, kind, source_of_truth, target, disposition_actor, refresh_cadence, last_value, last_refreshed) VALUES (?, 'fleet', 'leading', 's', ?, 'a', 'hourly', ?, ?)");
  for (const r of registry) if (!["energy_efficiency", "unmanaged_direct_spend_share", "capability_contract_conformance"].includes(r.metric)) insReg.run(r.metric, r.target, r.last_value, rh(1));

  function stmtOn(sql) {
    let args = [];
    const self = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
    };
    return self;
  }
  const env = { AUDIT: { prepare: (sql) => stmtOn(sql) } };
  const one = (sql, ...a) => db.prepare(sql).get(...a);

  let t = await C.objectiveConstraintsTick(env);
  eq(t.healthy, true, "tick 1: live-like inputs are healthy");
  eq(t.measured, 3, "tick 1: three constraints measured");
  eq(one("SELECT last_value v FROM metric_registry WHERE metric='capability_contract_conformance'").v, "1", "tick 1: conformance written to metric_registry");
  eq(one("SELECT last_value v FROM metric_registry WHERE metric='energy_efficiency'").v, "0.95", "tick 1: energy_efficiency written (1 - 100/2000)");
  eq(one("SELECT last_value v FROM metric_registry WHERE metric='unmanaged_direct_spend_share'").v, "0.256", "tick 1: unmanaged share written");
  eq(one("SELECT target FROM metric_registry WHERE metric='energy_efficiency'").target.indexOf(">= 0.8"), 0, "the registry target is the ratified threshold");
  eq(one("SELECT COUNT(*) n FROM agent_issues").n, 0, "tick 1: nothing filed");
  eq(one("SELECT COUNT(*) n FROM goals WHERE source='limits-review' AND status='proposed' AND goal_type='objective-revision'").n, 1, "tick 1: the daily review proposes one objective revision");
  eq(one("SELECT parent_objective p FROM goals WHERE source='limits-review'").p, "return-on-spend", "tick 1: for the objective graded on undecidable terms");
  eq(one("SELECT COUNT(*) n FROM objective_constraint_runs").n, 1, "tick 1: one ledger row");

  t = await C.objectiveConstraintsTick(env);
  eq(t.review, null, "tick 2: the review runs once per UTC day");
  eq(one("SELECT COUNT(*) n FROM goals").n, 1, "tick 2: no second proposal");

  setMeta("byok_cost_usd_30d", "400");
  t = await C.objectiveConstraintsTick(env);
  eq(t.filed, 1, "tick 3: a spend breach files one issue");
  const iss = one("SELECT id, priority, status, description FROM agent_issues WHERE title = ?", C.OC_ISSUE_PREFIX + "unmanaged_direct_spend_share");
  ok(iss && iss.priority === "high" && iss.status === "open" && /goals\.id=57/.test(iss.description), "tick 3: the issue is open, high, and cites goal 57");
  t = await C.objectiveConstraintsTick(env);
  eq(t.filed, 0, "tick 4: an open breach is not refiled");
  db.prepare("DELETE FROM analytics_dash_meta WHERE key = 'ai_est_cost_30d'").run();
  t = await C.objectiveConstraintsTick(env);
  eq(t.closed, 0, "tick 5: an unmeasured constraint does not close its issue");
  eq(one("SELECT last_value v FROM metric_registry WHERE metric='unmanaged_direct_spend_share'").v, "0.6149", "tick 5: the last measured value is kept, never zeroed");
  setMeta("ai_est_cost_30d", "450.56"); setMeta("byok_cost_usd_30d", "166.56");
  t = await C.objectiveConstraintsTick(env);
  eq(t.closed, 1, "tick 6: back within target closes the issue");
  const tri = one("SELECT triage_state, close_evidence FROM issue_triage WHERE issue_id = ?", iss.id);
  ok(tri && tri.triage_state === "closed" && /unmanaged_direct_spend_share=0\.256 meets <= 0\.5/.test(tri.close_evidence), "tick 6: close_evidence carries the live measurement");
  eq(one("SELECT status FROM agent_issues WHERE id = ?", iss.id).status, "closed", "tick 6: the issue is closed");
  setMeta("byok_cost_usd_30d", "400");
  t = await C.objectiveConstraintsTick(env);
  eq(one("SELECT COUNT(*) n FROM agent_issues").n, 1, "tick 7: a breach within 24h of the close is not refiled (issue_refile_guard)");
  eq(t.filed, 0, "tick 7: and is not counted as filed");
  setMeta("byok_cost_usd_30d", "166.56");

  // next UTC day (backdate the ledger): a pending proposal blocks another for the same objective
  db.prepare("UPDATE objective_constraint_runs SET ts = ?").run(new Date(rnow - 864e5).toISOString());
  db.prepare("UPDATE metric_registry SET target = 'maximize' WHERE metric = 'distribution_posts_30d'").run();
  t = await C.objectiveConstraintsTick(env);
  ok(t.review && t.review.pending.length === 1 && t.review.proposed.length === 0, "next day: a pending proposal blocks a new one for the same objective");
  db.prepare("UPDATE goals SET status = 'rejected' WHERE source = 'limits-review'").run();
  db.prepare("UPDATE objective_constraint_runs SET ts = ?").run(new Date(rnow - 864e5).toISOString());
  t = await C.objectiveConstraintsTick(env);
  ok(t.review && t.review.proposed.length === 1, "after the owner decides, a changed set of limits is proposed again");
  db.prepare("UPDATE goals SET status = 'rejected' WHERE source = 'limits-review'").run();
  db.prepare("UPDATE objective_constraint_runs SET ts = ?").run(new Date(rnow - 864e5).toISOString());
  t = await C.objectiveConstraintsTick(env);
  ok(t.review && t.review.proposed.length === 0 && t.review.candidates === 1, "a rejected proposal with the same limits is never re-proposed");
  eq(one("SELECT COUNT(*) n FROM goals").n, 2, "two proposals in all");

  // GET /constraints facts are read-only
  const before = one("SELECT COUNT(*) n FROM objective_constraint_runs").n;
  const facts = await C.ocFacts(env);
  eq(one("SELECT COUNT(*) n FROM objective_constraint_runs").n, before, "ocFacts writes nothing");
  eq(C.objectiveConstraintsEvaluate(facts, Date.now()).measured, 3, "ocFacts reads every input the verdict needs");
}

console.log(`constraints.test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
