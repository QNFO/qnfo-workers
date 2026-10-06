/**
 * transformation.test.mjs -- offline regression lock for TRANSFORMATION-LOOP-1 (qnfo-fleet-control 0.4.132): the pure
 * half (wave state, scoreboard, lever planning, issue text) on fixtures, then transformationTick over an in-memory D1
 * seeded from migrations/2026-10-06-transformation-loop.sql (so the migration's SQL is parsed too).
 * Output MUST contain "0 failed"; deploy-gate greps for that string.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const BEGIN = "// ---- TRANSFORMATION-LOOP-1:BEGIN", END = "// ---- TRANSFORMATION-LOOP-1:END ----";
const a = src.indexOf(BEGIN), b = src.indexOf(END);
if (a < 0 || b < 0 || b < a) { console.error("FAIL transformation block markers missing"); console.log("1 failed"); process.exit(1); }

// The block reads D1 through charterRows/charterOne (defined elsewhere in the worker); the sandbox carries the same two.
const sb = { VERSION: "0.4.132-test", console, Date, Math, JSON, Number, String, Object, Array, RegExp, isFinite, __export: null };
vm.createContext(sb);
vm.runInContext(
  "async function charterRows(env, sql) { try { var r = await env.AUDIT.prepare(sql).all(); return (r && r.results) || []; } catch (e) { return []; } }\n" +
  "async function charterOne(env, sql) { try { return await env.AUDIT.prepare(sql).first(); } catch (e) { return null; } }\n" +
  src.slice(a, b + END.length) +
  "\n__export = { tpWaveState, tpWaveStall, tpScoreboard, tpKey, tpIssueTitle, tpIssueBody, tpOnControlPlane, tpPlan, tpNum, transformationTick, tpLatest, TP_WAVES, TP_SCOREBOARD, TP_DISPATCH_MAX, TP_SESSION_MAX, TP_STALL_DAYS, TP_CONTROL_PLANE };", sb);
const T = sb.__export;

let passed = 0, failed = 0;
function eq(x, y, l) { if (x === y) { passed++; return; } failed++; console.error(`FAIL ${l}: got ${JSON.stringify(x)}, want ${JSON.stringify(y)}`); }

// ---------- wave state: the first wave whose exit is not met is active; a wave never exits on a date ----------
let w = T.tpWaveState({});
eq(w.active_key, "W0", "with nothing measured W0 is active");
eq(w.waves[0].unmet.length, 2, "unmeasured metrics count as unmet");
eq(/unmeasured/.test(w.waves[0].unmet[0]), true, "the unmet text names the value as unmeasured");
w = T.tpWaveState({ code_task_success_rate_30d: 0.5, worker_count: 37, breach_code_task_pct: 12, contracts_needing_probe: 91 });
eq(w.active_key, "W1", "W0 exits on its metrics and W1 becomes active");
eq(w.waves[0].exited && !w.waves[1].exited, true, "exited flags follow the metrics");
eq(w.waves[1].met.length === 0 && w.waves[1].unmet.length === 3, true, "W1 lists every unmet condition");
w = T.tpWaveState({ code_task_success_rate_30d: 1, worker_count: 20, breach_code_task_pct: 90, contracts_needing_probe: 0, fleet_ai_run_rate_30d_usd: 10, cron_schedules: 30, watchmaker_index: 0 });
eq(w.active_key, "W3", "with every wave exited the last wave stays active (the program never runs past its end state)");
eq(T.tpNum("12.5%"), 12.5, "a percent string reads as a number");
eq(T.tpNum("n/a"), null, "n/a reads as unmeasured");

// ---------- parity with the document's section 4 table (the waves live in code; the document is the owner's text) ----------
const doc = readFileSync(join(here, "..", "docs", "TRANSFORMATION-PROGRAM.md"), "utf8");
const s4 = doc.slice(doc.indexOf("## 4. Sequencing"), doc.indexOf("## 5."));
const docWaves = {};
s4.split("\n").filter((l) => /^\| W\d/.test(l)).forEach((l) => {
  const cells = l.split("|").map((c) => c.trim()).filter(Boolean);
  const key = cells[0].split(" ")[0], exit = cells[cells.length - 1], conds = [];
  const re = /`([a-z][a-z0-9_]+)`\s*(>=|<=|=)?\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(exit))) conds.push([m[1], m[2] || "=", Number(m[3])]);
  docWaves[key] = conds;
});
const norm = (c) => c[0] + " " + ((c[1] === "<=" || c[1] === "=") && c[2] === 0 ? "=" : c[1]) + " " + c[2];
eq(Object.keys(docWaves).join(","), T.TP_WAVES.map((w) => w.key).join(","), "section 4 of the document names the same waves as TP_WAVES");
T.TP_WAVES.forEach((w) => eq(w.exit.map(norm).sort().join("; "), (docWaves[w.key] || []).map(norm).sort().join("; "), w.key + " exit conditions in code equal the document's"));

// ---------- wave stall: an unmet exit metric of the active wave unchanged for TP_STALL_DAYS ----------
const NOWS = Date.parse("2026-10-20T12:00:00Z");
const wv = T.tpWaveState({ code_task_success_rate_30d: 0.5, worker_count: 37, breach_code_task_pct: 12, contracts_needing_probe: 3 });
eq(wv.active_key, "W1", "fixture: W1 active with three unmet metrics");
let ws = T.tpWaveStall(wv, { breach_code_task_pct: [{ day: "2026-10-05", value: "12" }, { day: "2026-10-20", value: "12" }], worker_count: [{ day: "2026-10-05", value: "42" }, { day: "2026-10-20", value: "37" }] }, NOWS);
eq(ws.length === 1 && ws[0].metric === "breach_code_task_pct" && ws[0].since === "2026-10-05" && ws[0].wave === "W1", true, "a metric with the same value 15 days apart is a wave stall; one that moved is not");
eq(T.tpWaveStall(wv, { breach_code_task_pct: [{ day: "2026-10-10", value: "12" }, { day: "2026-10-20", value: "12" }] }, NOWS).length, 0, "a metric with no row old enough is not judged");
eq(T.tpWaveStall(wv, {}, NOWS).length, 0, "a metric with no history (cron_schedules, contract counts) is not judged");
eq(T.tpWaveStall(wv, { breach_code_task_pct: [{ day: "2026-10-06", value: "12" }, { day: "2026-10-20", value: "12" }] }, NOWS).length, 1, "a row exactly TP_STALL_DAYS old counts");

// ---------- scoreboard: section 6 targets; a null target is a direction ----------
const sc = T.tpScoreboard({ worker_count: 30, session_records_30d: 40, security_open_issues: 2, subscribers_growth_monthly: 0 });
const row = (m) => sc.find((r) => r.metric === m);
eq(row("worker_count").meets_w1 === true && row("worker_count").meets_w3 === false, true, "worker_count 30 meets the W1 target (32) and not W3 (24)");
eq(row("session_records_30d").meets_w1 === null && row("session_records_30d").meets_w3 === null, true, "a direction-only metric has no pass/fail");
eq(row("security_open_issues").meets_w1 === null && row("security_open_issues").meets_w3 === false, true, "security_open_issues has only a W3 target");
eq(row("contracts_needing_probe_closed").w1 === 71 && row("contracts_needing_probe_closed").meets_w3 === null, true, "relapse probes on closed issues have a W1 target and no W3 number (document 1.1 section 6)");
eq(row("cron_schedules").value, null, "an unmeasured metric reads null, never 0");
eq(sc.length, T.TP_SCOREBOARD.length, "every section 6 metric is graded");

// ---------- keys, titles, routing ----------
const L = (o) => Object.assign({ id: 1, tp: 1, n: 3, key: "rebase-before-publish", title: "Rebase before publish", kind: "code", wave: "W0", path: "radar-hub/worker.js", anchor: 'var VERSION = "x"', status: "pending", issue_id: null, dispatched_at: null }, o);
eq(T.tpKey(L({})), "TP-1.3-REBASE-BEFORE-PUBLISH-1", "lever key is TP-<tp>.<n>-<KEY>-1");
eq(T.tpIssueTitle(L({})).startsWith("TP-1.3-REBASE-BEFORE-PUBLISH-1: Rebase before publish"), true, "issue title carries the key and the title");
eq(T.tpOnControlPlane("qnfo-fleet-control/worker.js"), true, "fleet-control is control plane");
eq(T.tpOnControlPlane("qnfo-code-orchestrator/worker.js"), true, "the code orchestrator is control plane (CM_DENY)");
eq(T.tpOnControlPlane("radar-hub/worker.js"), false, "radar-hub is not");
const codeBody = T.tpIssueBody(L({ detail: "Re-anchor against main.", dod: "no stale base failures" }), "code");
eq(/\ncode-task: repo=qnfo-workers path=radar-hub\/worker\.js\ncode-anchor: var VERSION = "x"$/.test(codeBody), true, "a code issue ends with the two ACT-BRIDGE-1 lines");
eq(/Charter pillar: autonomy\./.test(codeBody) && /docs\/TRANSFORMATION-PROGRAM\.md T1/.test(codeBody) && /Definition of done: no stale base failures/.test(codeBody), true, "the body names the pillar, the program and the definition of done");
const sessBody = T.tpIssueBody(L({ kind: "refactor", anchor: null }), "session", "a refactor lever: not a single-file edit");
eq(/session-task: repo=qnfo-workers path=radar-hub\/worker\.js/.test(sessBody) && !/code-task:/.test(sessBody), true, "a session issue carries a session-task line and never a code-task line (the code loop's intake must not take it)");
eq(/Routing: a refactor lever/.test(sessBody), true, "the session body says why it was routed to a session");

// ---------- planner ----------
const NOW = Date.parse("2026-10-06T12:00:00Z");
const plan = (levers, active, issues, tasks) => T.tpPlan(levers, active == null ? 0 : active, issues || {}, tasks || {}, NOW);
let p = plan([L({ id: 1, n: 1 }), L({ id: 2, n: 2 }), L({ id: 3, n: 3 })]);
eq(p.dispatch.length, T.TP_DISPATCH_MAX, "at most TP_DISPATCH_MAX code levers are dispatched a tick");
eq(p.session.length, 0, "a dispatchable code lever over the cap waits a tick; it never becomes a session lever");
p = plan([L({ id: 1, path: "qnfo-fleet-control/worker.js" })]);
eq(p.dispatch.length === 0 && p.session.length === 1 && /control-plane/.test(p.session[0].why), true, "a code lever on a control-plane worker goes to a session until T1 lever 8 lands");
p = plan([L({ id: 1, path: "qnfo-fleet-control/worker.js" }), L({ id: 8, tp: 1, n: 8, key: "branch-protection", kind: "platform", status: "landed" })]);
eq(p.dispatch.length, 1, "once T1 lever 8 has landed, control-plane code levers are dispatched to the code loop");
p = plan([L({ id: 1, anchor: null })]);
eq(p.session.length === 1 && /no anchor/.test(p.session[0].why), true, "a code lever without an anchor goes to a session and says so");
p = plan([L({ id: 1, kind: "refactor" }), L({ id: 2, n: 4, kind: "retire" }), L({ id: 3, n: 5, kind: "migration" }), L({ id: 4, n: 6, kind: "platform" })]);
eq(p.session.length, T.TP_SESSION_MAX, "at most TP_SESSION_MAX session levers are open at once");
p = plan([L({ id: 1, kind: "refactor" }), L({ id: 2, n: 4, kind: "refactor", status: "session", dispatched_at: "2026-10-06T00:00:00Z" }), L({ id: 3, n: 5, kind: "refactor", status: "session", dispatched_at: "2026-10-06T00:00:00Z" }), L({ id: 4, n: 6, kind: "refactor", status: "session", dispatched_at: "2026-10-06T00:00:00Z" })]);
eq(p.session.length, 0, "existing session levers fill the session slots");
p = plan([L({ id: 1, kind: "owner" })]);
eq(p.session.length + p.dispatch.length, 0, "an owner-held lever is listed and never dispatched");
p = plan([L({ id: 1, wave: "W2" })], 0);
eq(p.dispatch.length, 0, "a later wave's lever waits for its wave");
p = plan([L({ id: 1, wave: "W2" })], 2);
eq(p.dispatch.length, 1, "it is dispatched once its wave is active");
p = plan([L({ id: 1, wave: "W0" })], 2);
eq(p.dispatch.length, 1, "an earlier wave's lever stays eligible after its wave exits");
// Landing and verification come from the code task or the issue, never from the lever itself.
p = plan([L({ id: 1, status: "dispatched", issue_id: 2005, dispatched_at: "2026-10-06T06:00:00Z" })], 0, { 2005: { status: "open" } }, { 2005: [{ id: "ct1", status: "merged", merge_state: "pending", pr_url: "https://github.com/QNFO/qnfo-workers/pull/700" }] });
eq(p.landed.length === 1 && /ct1 merged/.test(p.landed[0].why) && /pull\/700/.test(p.landed[0].why), true, "a merged code task lands the lever with the PR as evidence");
p = plan([L({ id: 1, status: "landed", issue_id: 2005, landed_at: "2026-10-06T07:00:00Z" })], 0, { 2005: { status: "open" } }, { 2005: [{ id: "ct1", status: "merged", merge_state: "verified" }] });
eq(p.verified.length, 1, "a landed lever is verified when its task's merge_state reads verified");
p = plan([L({ id: 1, status: "verified", issue_id: 2005 })], 0, { 2005: { status: "open" } }, { 2005: [{ id: "ct1", status: "merged", merge_state: "verified" }] });
eq(p.verified.length + p.landed.length, 0, "a verified lever is left alone");
p = plan([L({ id: 1, status: "session", issue_id: 2017, dispatched_at: "2026-10-06T06:00:00Z" })], 0, { 2017: { status: "closed" } });
eq(p.landed.length === 1 && /issue 2017 closed/.test(p.landed[0].why), true, "a closed issue lands a session lever");
p = plan([L({ id: 1, status: "session", issue_id: 2017, dispatched_at: "2026-10-06T06:00:00Z" })], 0, { 2017: { status: "open" } });
eq(p.landed.length, 0, "an open issue does not");
// Session fallback: every code task ended without a merge.
p = plan([L({ id: 1, status: "dispatched", issue_id: 2013, dispatched_at: "2026-10-06T06:00:00Z" })], 0, { 2013: { status: "open" } }, { 2013: [{ id: "ct1", status: "failed", last_error: "merge-runner: not a trusted origin" }, { id: "ct2", status: "needs_human", last_error: "anchor occurs 2 times" }] });
eq(p.fallback.length === 1 && /ct2 ended needs_human: anchor occurs 2 times/.test(p.fallback[0].why), true, "a dispatched lever whose code tasks all ended without a merge falls back to a session with the last error");
p = plan([L({ id: 1, status: "dispatched", issue_id: 2013, dispatched_at: "2026-10-06T06:00:00Z" })], 0, { 2013: { status: "open" } }, { 2013: [{ id: "ct1", status: "failed" }, { id: "ct2", status: "queued" }] });
eq(p.fallback.length, 0, "a queued retry is not a fallback");
p = plan([L({ id: 1, status: "dispatched", issue_id: 2005, dispatched_at: "2026-10-06T06:00:00Z" })], 0, { 2005: { status: "open" } }, { 2005: [{ id: "ct_u4", status: "branch_pushed", merge_state: "rejected", merge_note: "rejected by session review: the patch trusts the wrong source" }] });
eq(p.fallback.length === 1 && /ct_u4 ended rejected: rejected by session review/.test(p.fallback[0].why), true, "a branch_pushed task whose PR a reviewer rejected has ended: the lever falls back with the review note (the live case of 2026-10-06, ct_u4ih8uzgsfxzvm)");
// Stall: TP_STALL_DAYS with no landing, for dispatched and session levers alike; a fallback is judged first.
p = plan([L({ id: 1, status: "dispatched", issue_id: 2013, dispatched_at: "2026-09-10T06:00:00Z" })], 0, { 2013: { status: "open" } }, { 2013: [{ id: "ct2", status: "queued" }] });
eq(p.stalled.length, 1, "a dispatched lever older than TP_STALL_DAYS with no landing is stalled");
p = plan([L({ id: 1, status: "session", kind: "refactor", issue_id: 2017, dispatched_at: "2026-09-10T06:00:00Z" })], 0, { 2017: { status: "open" } });
eq(p.stalled.length, 1, "a session lever older than TP_STALL_DAYS is stalled");
p = plan([L({ id: 1, status: "session", kind: "refactor", issue_id: 2017, dispatched_at: "2026-10-01T06:00:00Z" })], 0, { 2017: { status: "open" } });
eq(p.stalled.length, 0, "a younger one is not");
p = plan([L({ id: 1, status: "superseded" })]);
eq(p.dispatch.length + p.session.length + p.stalled.length, 0, "a superseded lever is done");

// ---------- the tick over an in-memory D1 seeded from the migration ----------
const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT, path TEXT, goal TEXT, status TEXT, merge_state TEXT, merge_note TEXT, pr_url TEXT, last_error TEXT, created_at TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, state TEXT, refresh_class TEXT, last_value TEXT, last_refreshed TEXT);
CREATE TABLE fleet_budget (node_class TEXT PRIMARY KEY, cap REAL, target REAL, current REAL, unit TEXT);
CREATE TABLE remediation_contracts (id INTEGER PRIMARY KEY AUTOINCREMENT, class TEXT UNIQUE, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h REAL, status TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE autonomy_scores (dimension TEXT PRIMARY KEY, score REAL, scored_at TEXT);
INSERT INTO autonomy_scores (dimension, score, scored_at) VALUES ('ooda_observe', 3.8, '2026-10-06'), ('issue_flow', 3.3, '2026-10-06'), ('sai_weighted', 3.39, '2026-10-06'), ('overall', 4.3, '2026-10-06');
INSERT INTO ops_config (key, value) VALUES ('code_merge_trusted_sources', 'qnfo-fleet-control|METRIC-TRIGGER-,session,qnfo-fleet-control|REACH-IDEA-');
INSERT INTO fleet_budget (node_class, current) VALUES ('workers', 37), ('cron_schedules', 46), ('d1_databases', 10);
INSERT INTO metric_registry (metric, last_value) VALUES ('code_task_success_rate_30d', '0.5'), ('breach_code_task_pct', '12'), ('watchmaker_index', '2');
INSERT INTO remediation_contracts (class, issue_id, status) VALUES ('needs-1', 2007, 'needs-machine-probe'), ('needs-2', 1678, 'needs-machine-probe'), ('needs-3', NULL, 'needs-machine-probe');
CREATE TABLE metric_history (metric TEXT, day TEXT, value TEXT, meets INTEGER, target TEXT, ts TEXT);
INSERT INTO agent_issues (id, title, status, created_at) VALUES (2005, 'TP-1.1', 'open', 1), (2013, 'TP-5.5', 'open', 1), (2017, 'TP-1.2', 'open', 1), (2007, 'x', 'open', 1), (2008, 'x', 'open', 1), (2018, 'x', 'open', 1), (2019, 'x', 'open', 1), (2001, 'x', 'open', 1), (1678, 'x', 'closed', 1), (1677, 'x', 'closed', 1);
INSERT INTO agent_issues (title, status, created_at) VALUES ('SEC-OPEN-1: x', 'open', 1);
`);
db.exec(readFileSync(join(here, "..", "migrations", "2026-10-06-transformation-loop.sql"), "utf8"));
const seeded = db.prepare("SELECT COUNT(*) AS n, SUM(status='landed') AS landed, SUM(status='session') AS session, SUM(status='dispatched') AS dispatched, SUM(kind='owner') AS owner FROM transformation_levers").get();
eq(seeded.n >= 48, true, "the migration seeds the program's levers (" + seeded.n + ")");
eq(seeded.landed >= 9 && seeded.session >= 8 && seeded.dispatched === 2 && seeded.owner === 1, true, "seed statuses adopt what the program's author already filed and what main landed on 2026-10-06: " + JSON.stringify(seeded));
eq(db.prepare("SELECT COUNT(*) AS n FROM transformation_levers WHERE status IN ('landed','verified') AND landed_at IS NULL").get().n, 0, "every landed seed row carries a landed_at (the 14-day metric reads it)");
eq(db.prepare("SELECT COUNT(*) AS n FROM transformation_levers WHERE status IN ('landed','verified') AND (note IS NULL OR note = '')").get().n, 0, "every landed seed row names its evidence");
eq(db.prepare("SELECT value FROM ops_config WHERE key='code_merge_trusted_sources'").get().value.endsWith(",qnfo-fleet-control|TP-,TRANSFORMATION-PROGRAM-1|TP-"), true, "the merge runner's trusted origins gain the program's two");
eq(db.prepare("SELECT COUNT(*) AS n FROM ops_config WHERE key LIKE 'code_merge_trusted_sources--bak-%'").get().n, 1, "with a backup key");
db.exec(readFileSync(join(here, "..", "migrations", "2026-10-06-transformation-loop.sql"), "utf8"));
eq(db.prepare("SELECT value FROM ops_config WHERE key='code_merge_trusted_sources'").get().value.split("qnfo-fleet-control|TP-").length, 2, "the migration is idempotent (a second apply appends nothing)");
eq(db.prepare("SELECT COUNT(*) AS n FROM analytics_metric_triggers WHERE metric_key='transformation_levers_landed_14d'").get().n, 1, "one trigger on the loop's metric");
eq(db.prepare("SELECT issue_id FROM transformation_levers WHERE tp=8 AND n=2").get().issue_id, null, "T8.2 is decoupled from its closed issue (re-verified by probe, not assumed landed)");

const env = { AUDIT: { prepare(sql) {
  const mk = (args) => ({
    bind(...a2) { return mk(a2); },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  });
  return mk([]);
} } };

const r1 = await T.transformationTick(env, { force: true });
eq(r1.ok === true && !r1.skipped, true, "the first tick runs");
eq(r1.actions.filed.length, 0, "the seed files no issue on its own: every W0 lever is adopted, landed, anchorless with the session slots full, or waits");
eq(db.prepare("SELECT COUNT(*) AS n FROM transformation_runs").get().n, 1, "a transformation_runs row is written");
const landedWindow = db.prepare("SELECT COUNT(*) AS n FROM transformation_levers WHERE COALESCE(verified_at, landed_at) >= ?").get(new Date(Date.now() - 14 * 864e5).toISOString()).n;
eq(db.prepare("SELECT last_value FROM metric_registry WHERE metric='transformation_levers_landed_14d'").get().last_value, String(landedWindow), "transformation_levers_landed_14d counts the landings of the last 14 days");
eq(r1.scoreboard.find((r) => r.metric === "autonomy_ooda_observe").value === 3.8 && r1.scoreboard.find((r) => r.metric === "autonomy_ooda_observe").meets_w1 === false, true, "the scoreboard reads the autonomy dimensions from autonomy_scores");
eq(r1.scoreboard.find((r) => r.metric === "dangling_bindings").value, null, "dangling_bindings is unmeasured until T9.4 lands, never 0");
const ev = db.prepare("SELECT status, meta FROM cloud_ops_events WHERE id LIKE 'transformation-tick-%'").get();
eq(ev && ev.status === "ok" && JSON.parse(ev.meta).last_ok > "2026", true, "the heartbeat the watchmaker reads is written");
const r2 = await T.transformationTick(env, {});
eq(r2.skipped, "ran within the hour", "a second tick within 55 minutes is skipped");
// Wave W0 exits when its metrics are met, and the record says so.
eq(r1.waves[0].exited, true, "W0's exit (success rate >= 0.45, workers <= 38) is met by the fixture");
eq(r1.waves[1].exited, false, "W1 is not (breach_code_task_pct 12, worker_count 37, contracts needing probe 2)");
eq(r1.wave, "W1", "so W1 is the active wave");
eq(r1.scoreboard.find((r) => r.metric === "contracts_needing_probe").value === 2 && r1.scoreboard.find((r) => r.metric === "contracts_needing_probe_closed").value === 1, true, "needs-machine-probe contracts are counted on open issues (plus issue-less ones) and on closed issues separately");
eq(r1.applied.wave_stalled, 0, "with no metric history nothing is judged a wave stall");

// Landing: the adopted T1.1 task merges.
db.exec("INSERT INTO code_tasks (id, goal, status, merge_state, pr_url, created_at) VALUES ('ct_a', '[issue #2005] trusted origin parity', 'merged', 'verified', 'https://github.com/QNFO/qnfo-workers/pull/701', '2026-10-06T08:00:00Z')");
// Fallback: the adopted T5.5 task fails twice.
db.exec("INSERT INTO code_tasks (id, goal, status, last_error, created_at) VALUES ('ct_b', '[issue #2013] security metric', 'failed', 'merge-runner: control-plane worker, not merged', '2026-10-06T08:00:00Z'), ('ct_c', '[issue #2013] security metric', 'needs_human', 'anchor occurs 0 times', '2026-10-06T09:00:00Z')");
// Wave stall: breach_code_task_pct (unmet, W1) reads 12 today and 12 fifteen days ago; worker_count moved.
db.prepare("INSERT INTO metric_history (metric, day, value) VALUES ('breach_code_task_pct', ?, '12'), ('breach_code_task_pct', ?, '12'), ('worker_count', ?, '42'), ('worker_count', ?, '37')").run(new Date(Date.now() - 15 * 864e5).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10), new Date(Date.now() - 15 * 864e5).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10));
// Dispatch: a lever row gains a path and an anchor (data, no deploy) outside the control plane.
db.exec("INSERT INTO transformation_levers (tp, n, key, title, kind, wave, pillar, path, anchor, detail, dod, status) VALUES (7, 9, 'test-lever', 'A test lever on radar-hub', 'code', 'W0', 'reach', 'radar-hub/worker.js', 'var VERSION = \"1.3.1\"', 'bump it', 'done when bumped', 'pending')");
const r3 = await T.transformationTick(env, { force: true });
eq(r3.applied.verified, 1, "T1.1 is verified from its merged, verified code task");
eq(db.prepare("SELECT status, note FROM transformation_levers WHERE tp=1 AND n=1").get().status, "verified", "and the row says so");
eq(r3.applied.fallback, 1, "T5.5 falls back to a session");
const fb = db.prepare("SELECT title, description FROM agent_issues WHERE title LIKE 'CODE-TASK-NEEDS-SESSION-1:%'").get();
eq(!!fb && /TP-5\.5-SECURITY-METRIC-GRADED-1/.test(fb.title) && /anchor occurs 0 times/.test(fb.description) && /session-task:/.test(fb.description) && !/code-task:/.test(fb.description), true, "CODE-TASK-NEEDS-SESSION-1 names the lever and the last error and carries no code-task line");
eq(db.prepare("SELECT status FROM transformation_levers WHERE tp=5 AND n=5").get().status, "session", "the lever reads session");
eq(r3.applied.dispatched, 1, "the new anchored lever is dispatched");
const di = db.prepare("SELECT id, title, description, source FROM agent_issues WHERE title LIKE 'TP-7.9-TEST-LEVER-1:%'").get();
eq(!!di && di.source === "qnfo-fleet-control" && /\ncode-task: repo=qnfo-workers path=radar-hub\/worker\.js\ncode-anchor: var VERSION = "1\.3\.1"$/.test(di.description), true, "its issue carries the code-task and code-anchor lines the code loop's intake reads");
eq(db.prepare("SELECT status, issue_id FROM transformation_levers WHERE tp=7 AND n=9").get().issue_id, di.id, "the lever row records its issue");
eq(r3.applied.wave_stalled === 1 && r3.actions.wave_stalled[0] === "W1:breach_code_task_pct", true, "the unmoved W1 exit metric is a wave stall; the moved one is not");
const wsIssue = db.prepare("SELECT title, description FROM agent_issues WHERE title LIKE 'TP-WAVE-EXIT-STALLED-1:%'").all();
eq(wsIssue.length === 1 && /W1 exit metric breach_code_task_pct unchanged since/.test(wsIssue[0].title) && /replaced, not repeated/.test(wsIssue[0].description), true, "TP-WAVE-EXIT-STALLED-1 names the wave, the metric and the date, and says to replace the lever");
const r4 = await T.transformationTick(env, { force: true });
eq(r4.applied.dispatched + r4.applied.fallback + r4.applied.verified, 0, "a further tick repeats nothing");
eq(db.prepare("SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE 'CODE-TASK-NEEDS-SESSION-1:%'").get().n, 1, "the fallback issue is filed once");
eq(db.prepare("SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE 'TP-WAVE-EXIT-STALLED-1:%'").get().n, 1, "the wave-stall issue is filed once");
// Stall: a session lever dispatched 35 days ago (T1.4, issue 2007).
db.exec("UPDATE transformation_levers SET dispatched_at = '2026-09-01T00:00:00Z' WHERE tp=1 AND n=4");
const r5 = await T.transformationTick(env, { force: true });
eq(r5.applied.stalled, 1, "a session lever with no landing in 14 days is stalled");
const st = db.prepare("SELECT title FROM agent_issues WHERE title LIKE 'TP-LEVER-STALLED-1:%'").get();
eq(!!st && /TP-1\.4-ANCHOR-REPAIR-1/.test(st.title), true, "TP-LEVER-STALLED-1 names the lever");
db.exec("UPDATE agent_issues SET status='closed' WHERE id=2007");
const r6 = await T.transformationTick(env, { force: true });
const t14 = db.prepare("SELECT status, stalled_at FROM transformation_levers WHERE tp=1 AND n=4").get();
eq(r6.applied.landed === 1 && t14.status === "landed" && t14.stalled_at === null, true, "closing its issue lands the stalled lever and clears the stall");
const latest = await T.tpLatest(env);
eq(latest.ok && latest.last_run && latest.last_run.wave === "W1" && latest.levers.length === seeded.n + 1 && latest.needs_session.length === 1, true, "GET /transformation serves the last run, every lever and the open needs-session rows");
eq(db.prepare("SELECT COUNT(*) AS n FROM transformation_runs").get().n, 5, "every forced tick writes a run row");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
