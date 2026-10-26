// BREACH-SELFHEAL-1 offline suite: replays migrations/2026-10-26-breach-selfheal.sql on SQLite.
// Proves: v_breach_selfheal names an errata confirm stall, an old errata backlog, a research stall, a publishing collapse with its
// diagnosis, a budget member over its share and a worker error spike; a fleet_tick insert raises errata_confirm_max (12 -> 24, once an
// hour) only while the backlog is old and today's spend is under pace, lowers it to 12 once the day's budget is spent, requeues a dead
// research claim at its stage only while the stall check hits, and refreshes the five metrics; breach_selfheal = off stops the
// remediation; a second apply changes nothing; the Rollback line removes what the file added.
// Run: node migrations/breach-selfheal.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-breach-selfheal.sql", import.meta.url), "utf8");
const sqlWindow = readFileSync(new URL("./2026-10-26-breach-selfheal-post-deploy-window.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE errata_queue (id INTEGER PRIMARY KEY, status TEXT, created_at TEXT, updated_at TEXT);
  CREATE TABLE cloud_ops_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, job TEXT, status TEXT, text TEXT);
  CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, stage TEXT, claimed_at TEXT, recover_count INTEGER, error TEXT, published_at TEXT);
  CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, neurons REAL);
  CREATE TABLE worker_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, script_name TEXT, outcome TEXT, ts_ms INTEGER, exceptions_json TEXT);
  CREATE TABLE fleet_deploys (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT, ok INTEGER, ts TEXT);
  CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
  CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
  CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, expected_cadence_h INTEGER, status TEXT, precondition TEXT, action TEXT, escalate_to TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
const H = 3600000, now = Date.now();
const iso = (agoH) => new Date(now - agoH * H).toISOString();
const dt = (agoH) => iso(agoH).slice(0, 19).replace("T", " ");
const today = new Date(now).toISOString().slice(0, 10);
d.exec(sql);
d.exec(sqlWindow);
const row = (cls, subj) => d.prepare("SELECT hit, diagnosis, evidence FROM v_breach_selfheal WHERE check_class = ? AND subject = ?").get(cls, subj);
const cfg = (k) => (d.prepare("SELECT value FROM ops_config WHERE key = ?").get(k) || {}).value;
const metric = (m) => (d.prepare("SELECT last_value FROM metric_registry WHERE metric = ?").get(m) || {}).last_value;
const tick = () => d.prepare("INSERT INTO fleet_tick (source) VALUES ('test')").run();

ok(cfg("breach_selfheal") === "on" && cfg("errata_confirm_max") === "12", "the switch and the confirm rate are seeded");
ok(d.prepare("SELECT COUNT(*) n FROM analytics_metric_triggers").get().n === 5 && d.prepare("SELECT COUNT(*) n FROM failure_modes").get().n === 6 && d.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n === 6, "five triggers, six failure modes, six detector contracts");
ok(/code-task: repo=qnfo-workers path=qnfo-research-exec\/worker\.js\ncode-anchor: async function confirmInternalErrata\(env\) \{/.test(d.prepare("SELECT action FROM analytics_metric_triggers WHERE metric_key = 'errata_confirm_stalled'").get().action), "the errata stall trigger hands the code loop a file and an anchor");
const workerSrc = readFileSync(new URL("../qnfo-research-exec/worker.js", import.meta.url), "utf8");
for (const a of d.prepare("SELECT action FROM analytics_metric_triggers WHERE action LIKE '%code-anchor:%'").all()) {
  const anchor = a.action.split("code-anchor: ")[1].trim();
  ok(workerSrc.split(anchor).length === 2, "each code-anchor occurs exactly once in qnfo-research-exec/worker.js", anchor);
}

// Errata: 60 internal-open rows, oldest 5 days, none settled -> stall and old backlog.
for (let i = 1; i <= 60; i++) d.prepare("INSERT INTO errata_queue VALUES (?, 'internal-open', ?, ?)").run(i, dt(120 - i), dt(120 - i));
ok(row("chain-stall", "errata-confirm").hit === 1 && row("chain-stall", "errata-confirm").diagnosis === "confirm-not-running", "60 waiting and none settled is a stall (no defers: not running)", row("chain-stall", "errata-confirm"));
d.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text) VALUES (?, 'errata_confirm_defer', 'qnfo-research-exec', 'queue row 1: x')").run(iso(0.5));
ok(row("chain-stall", "errata-confirm").diagnosis === "confirm-failing", "a defer event makes it confirm-failing");
ok(row("chain-backlog", "errata-confirm").hit === 1, "an old backlog over 50 is a slow drain");
tick();
ok(cfg("errata_confirm_max") === "12", "no settled row: the rate is not raised while the confirm fails");
d.prepare("INSERT INTO errata_queue VALUES (100, 'rejected', ?, ?)").run(dt(30), dt(0.2));
ok(row("chain-stall", "errata-confirm").hit === 0, "one settled row in 120 minutes clears the stall");
tick();
ok(cfg("errata_confirm_max") === "24", "settling, old backlog, spend under pace: 12 -> 24", cfg("errata_confirm_max"));
tick();
ok(cfg("errata_confirm_max") === "24", "at most one raise an hour");
ok(d.prepare("SELECT COUNT(*) n FROM breach_selfheal_actions WHERE check_class = 'errata-rate'").get().n === 1, "the raise is in the ledger with its revert", d.prepare("SELECT * FROM breach_selfheal_actions").all());
ok(metric("errata_confirm_stalled") === "0", "errata_confirm_stalled refreshes");
// The day's budget is spent: back to 12.
d.prepare("INSERT INTO ai_call_counters VALUES (?, 'qnfo-research-exec', 'binding:review', 'm', 400000)").run(today);
tick();
ok(cfg("errata_confirm_max") === "12", "the day's research budget spent: 24 -> 12", cfg("errata_confirm_max"));
ok(/research budget spent/.test(d.prepare("SELECT evidence FROM breach_selfheal_actions ORDER BY id DESC LIMIT 1").get().evidence), "the lowering names its reason");
// Budget member share.
d.prepare("INSERT INTO ai_call_counters VALUES (?, 'errata-hub', 'binding', 'kimi', 300000)").run(today);
ok(row("budget-share", "errata-hub+qnfo-paper-reviser").hit === 1, "a member over 35% of the day's spend is a hit");
tick();
ok(Number(metric("research_budget_member_share")) > 0.4, "research_budget_member_share refreshes", metric("research_budget_member_share"));

// Research: open work, no ok stage in 60 minutes, not budget-held -> stall; a dead claim is requeued at its stage.
for (let i = 0; i < 12; i++) d.prepare("INSERT INTO research_queue VALUES (?, 'queued', 'ground', NULL, 0, NULL, NULL)").run("q" + i);
d.prepare("INSERT INTO research_queue VALUES ('dead1', 'researching', 'review', ?, 0, 'prior', NULL)").run(iso(3));
d.prepare("INSERT INTO research_queue VALUES ('live1', 'researching', 'verify', ?, 0, NULL, NULL)").run(iso(0.5));
d.prepare("INSERT INTO cloud_ops_events (ts, kind, job, status, text) VALUES (?, 'done', 'qnfo-research-exec', 'ok', '{}')").run(iso(2));
ok(row("chain-stall", "research").hit === 1, "no ok stage in 60 minutes with open work is a stall");
d.prepare("INSERT INTO cloud_ops_events (ts, kind, job, status, text) VALUES (?, 'research-budget', 'qnfo-research-exec', 'warn', 'stages held')").run(iso(0.2));
ok(row("chain-stall", "research").hit === 0, "a budget hold in the last 30 minutes is not a stall");
tick();
ok(d.prepare("SELECT status FROM research_queue WHERE id = 'dead1'").get().status === "researching", "no stall: the dead claim is left alone");
d.prepare("DELETE FROM cloud_ops_events WHERE kind = 'research-budget'").run();
tick();
const dead = d.prepare("SELECT * FROM research_queue WHERE id = 'dead1'").get();
ok(dead.status === "queued" && dead.stage === "review" && dead.recover_count === 1 && dead.claimed_at === null && /^BREACH-SELFHEAL-1 dead claim/.test(dead.error) && /prior$/.test(dead.error), "a stall requeues a dead claim at its stage, error kept", dead);
ok(d.prepare("SELECT status FROM research_queue WHERE id = 'live1'").get().status === "researching", "a claim with a recent heartbeat is untouched");
ok(metric("research_stage_stalled") === "1", "research_stage_stalled refreshes");

// Publishing: 7-day base 30/day, 2 in 24 h, budget exhausted -> collapse, budget-bound.
for (let i = 0; i < 210; i++) d.prepare("INSERT INTO research_queue VALUES (?, 'published', 'done', NULL, 0, NULL, ?)").run("p" + i, iso(25 + (i % 160)));
for (let i = 0; i < 2; i++) d.prepare("INSERT INTO research_queue VALUES (?, 'published', 'done', NULL, 0, NULL, ?)").run("n" + i, iso(2));
d.prepare("INSERT INTO cloud_ops_events (ts, kind, job, status, text) VALUES (?, 'research-budget', 'qnfo-research-exec', 'warn', 'daily budget exhausted: spent=1 budget=1')").run(iso(5));
let pc = row("publish-collapse", "research");
ok(pc.hit === 1 && pc.diagnosis === "budget-bound", "2 against a 30/day base with the budget exhausted is a budget-bound collapse", pc);
d.prepare("DELETE FROM cloud_ops_events WHERE kind = 'research-budget'").run();
for (let i = 0; i < 10; i++) d.prepare("INSERT INTO cloud_ops_events (ts, kind, job, status, text) VALUES (?, 'done', 'qnfo-research-exec', 'ok', '{\"ok\":true,\"stage\":\"review->revise\"}')").run(iso(0.2));
d.prepare("INSERT INTO cloud_ops_events (ts, kind, job, status, text) VALUES (?, 'done', 'qnfo-research-exec', 'ok', '{\"ok\":true,\"stage\":\"review->verify\"}')").run(iso(0.2));
ok(row("publish-collapse", "research").diagnosis === "gate-loop", "no budget hold and review->revise 10x review->verify is a gate loop");
tick();
ok(Number(metric("publish_rate_ratio_24h")) < 0.1, "publish_rate_ratio_24h refreshes", metric("publish_rate_ratio_24h"));

// Worker errors: 12 after a deploy 2 h ago with none before -> errors-after-deploy; 25 with no deploy -> sustained; 5 -> none.
d.prepare("INSERT INTO fleet_deploys (worker, ok, ts) VALUES ('w-new', 1, ?)").run(iso(2));
for (let i = 0; i < 12; i++) d.prepare("INSERT INTO worker_logs (script_name, outcome, ts_ms, exceptions_json) VALUES ('w-new', 'exceededMemory', ?, '[]')").run(now - H);
for (let i = 0; i < 25; i++) d.prepare("INSERT INTO worker_logs (script_name, outcome, ts_ms, exceptions_json) VALUES ('w-old', 'exception', ?, '[{\"message\":\"D1_ERROR\"}]')").run(now - H);
for (let i = 0; i < 5; i++) d.prepare("INSERT INTO worker_logs (script_name, outcome, ts_ms, exceptions_json) VALUES ('w-ok', 'exception', ?, '[]')").run(now - H);
for (let i = 0; i < 30; i++) d.prepare("INSERT INTO worker_logs (script_name, outcome, ts_ms, exceptions_json) VALUES ('w-ok', 'canceled', ?, '[]')").run(now - H);
ok(row("post-deploy-errors", "w-new").hit === 1 && row("post-deploy-errors", "w-new").diagnosis === "errors-after-deploy", "errors after a deploy are named", row("post-deploy-errors", "w-new"));
ok(row("post-deploy-errors", "w-old").hit === 1 && row("post-deploy-errors", "w-old").diagnosis === "errors-sustained", "20+ errors without a deploy are sustained");
ok(row("post-deploy-errors", "w-ok").hit === 0, "5 errors (and canceled requests) are not a breach");
// BREACH-SELFHEAL-POST-DEPLOY-WINDOW-1: 25 errors before a deploy 30 minutes ago and none after is a fix, not a breach.
d.prepare("INSERT INTO fleet_deploys (worker, ok, ts) VALUES ('w-fixed', 1, ?)").run(iso(0.5));
for (let i = 0; i < 25; i++) d.prepare("INSERT INTO worker_logs (script_name, outcome, ts_ms, exceptions_json) VALUES ('w-fixed', 'exception', ?, '[]')").run(now - H);
ok(row("post-deploy-errors", "w-fixed").hit === 0, "errors the latest deploy removed are not a breach", row("post-deploy-errors", "w-fixed"));
d.prepare("INSERT INTO worker_logs (script_name, outcome, ts_ms, exceptions_json) VALUES ('w-fixed', 'exception', ?, '[]')").run(now - 0.1 * H);
ok(/errors_since=1 /.test(row("post-deploy-errors", "w-fixed").evidence), "only errors after the deploy are counted", row("post-deploy-errors", "w-fixed"));
tick();
ok(metric("post_deploy_error_workers") === "2", "post_deploy_error_workers counts the two", metric("post_deploy_error_workers"));

// Off switch: no remediation, measurement continues.
d.prepare("UPDATE ops_config SET value = 'off' WHERE key = 'breach_selfheal'").run();
d.prepare("INSERT INTO research_queue VALUES ('dead2', 'researching', 'verify', ?, 0, NULL, NULL)").run(iso(4));
d.prepare("DELETE FROM cloud_ops_events WHERE kind = 'done'").run();
const nAct = d.prepare("SELECT COUNT(*) n FROM breach_selfheal_actions").get().n;
tick();
ok(d.prepare("SELECT status FROM research_queue WHERE id = 'dead2'").get().status === "researching" && d.prepare("SELECT COUNT(*) n FROM breach_selfheal_actions").get().n === nAct, "breach_selfheal = off stops the remediation");
ok(metric("research_stage_stalled") === "1", "and the metrics still refresh");

// Probes and idempotence.
for (const c of d.prepare("SELECT class, verify_probe FROM remediation_contracts").all()) {
  const r = d.prepare(c.verify_probe).get();
  ok(r && r.expected === "0" && typeof r.observed === "string", "detector probe runs: " + c.class, r);
}
const before = JSON.stringify(d.prepare("SELECT COUNT(*) n FROM analytics_metric_triggers").get()) + JSON.stringify(d.prepare("SELECT COUNT(*) n FROM decision_log").get()) + cfg("breach_selfheal");
d.exec(sql);
d.exec(sqlWindow);
ok(before === JSON.stringify(d.prepare("SELECT COUNT(*) n FROM analytics_metric_triggers").get()) + JSON.stringify(d.prepare("SELECT COUNT(*) n FROM decision_log").get()) + cfg("breach_selfheal"), "a second apply changes nothing");
const rollback = sql.match(/^-- Rollback: (.*)$/m)[1];
d.exec(rollback.replace(/; breach_selfheal_actions keeps.*$/, ";"));
ok(!d.prepare("SELECT name FROM sqlite_master WHERE name IN ('v_breach_selfheal', 'v_breach_selfheal_inputs', 'v_breach_selfheal_chains', 'v_breach_selfheal_spend', 'breach_selfheal_tick')").all().length && d.prepare("SELECT COUNT(*) n FROM analytics_metric_triggers").get().n === 0 && !cfg("errata_confirm_max"), "the Rollback line removes what the file added");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
