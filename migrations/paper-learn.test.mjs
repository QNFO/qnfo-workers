// PAPER-LEARN-1 offline suite: runs migrations/2026-10-19-paper-learn.sql on SQLite with the live table shapes (read from
// qnfo-audit sqlite_master on 2026-10-19). Proves: the ledger tables exist and match the worker's DDL; the Gödelian-boundary
// seed holds nine learnings (two refuted, one unverified, one applied) and four internal_errata rows owned by
// qnfo-research-exec; the fleet tick refreshes closure_branching_ratio_24h = reopened / dispositioned and
// closure_avalanche_mean_24h = 1 / (1 - m) only in the first ten minutes of an hour (or from a migration); the belief probe
// holds below 0.5 and fails above; the triggers, belief, capability, decision and follow-up issue are written once; a
// second apply changes nothing.
// Run: node migrations/paper-learn.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-paper-learn.sql", import.meta.url), "utf8");
const W = (await import("../qnfo-lifecycle/worker.js")).default;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE belief_registry (belief_key TEXT PRIMARY KEY, claim TEXT NOT NULL, confidence REAL, evidence TEXT NOT NULL, probe_class TEXT NOT NULL, built_on TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE internal_errata (id TEXT PRIMARY KEY, target_kind TEXT NOT NULL, target_ref TEXT NOT NULL, detected_at TEXT NOT NULL, detected_by TEXT, severity TEXT DEFAULT 'high', claim_text TEXT, falsification TEXT, evidence TEXT, remediation TEXT, status TEXT DEFAULT 'open', owner TEXT, updated_at TEXT DEFAULT (datetime('now')));`);
const q = (s, ...a) => db.prepare(s).all(...a);
const one = (s, ...a) => db.prepare(s).get(...a);

// 24 h of closure history: 560 dispositioned, 211 reopened (the 2026-10-19 measurement), plus older rows outside the window.
const ins = db.prepare("INSERT INTO issue_lifecycle (issue_id, event, ts) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?))");
for (let i = 0; i < 560; i++) ins.run(i, "dispositioned", "-" + (i % 1400) + " minutes");
for (let i = 0; i < 211; i++) ins.run(i, "reopened", "-" + (i % 1400) + " minutes");
for (let i = 0; i < 300; i++) ins.run(i, "reopened", "-2000 minutes");

db.exec(sql);
const cols = (t) => q("SELECT name FROM pragma_table_info('" + t + "')").map((r) => r.name).join(",");
const probe = new DatabaseSync(":memory:");
W.__paperLearn.ddl.forEach((s) => probe.exec(s));
const pcols = (t) => probe.prepare("SELECT name FROM pragma_table_info('" + t + "')").all().map((r) => r.name).join(",");
ok(cols("paper_learnings") === pcols("paper_learnings") && cols("paper_learn_state") === pcols("paper_learn_state"), "migration and worker DDL create the same tables");

const L = q("SELECT * FROM paper_learnings");
ok(L.length === 9, "nine seeded learnings", L.length);
ok(L.filter((x) => x.verification === "refuted").length === 2, "two derived results refuted");
ok(L.filter((x) => x.verification === "unverified").length === 1, "one unverified empirical claim");
ok(L.filter((x) => x.verification === "checked").length === 4, "four recomputed and checked");
ok(L.find((x) => /cascade size/i.test(x.claim) || /1\/\(1 - m\)/.test(x.claim)).fleet_status === "applied", "the branching learning is applied");
ok(L.every((x) => x.fleet_status !== "proposed"), "no seeded learning is left proposed (nothing for a follow-up to wait on)");
const st = one("SELECT * FROM paper_learn_state");
ok(st && st.version === "1.0.1" && st.status === "ok" && st.n_learnings === L.length, "the paper's version is marked read, so the loop does not read it again", st);
const E = q("SELECT * FROM internal_errata ORDER BY id");
ok(E.length === 4 && E.every((e) => e.owner === "qnfo-research-exec" && e.status === "open" && e.target_kind === "paper"), "four open internal_errata rows for the research pipeline", E.map((e) => e.id));
ok(E.filter((e) => e.severity === "high").length === 3, "three high, one low (reference numbering)");

const m = Number(one("SELECT last_value FROM metric_registry WHERE metric = 'closure_branching_ratio_24h'").last_value);
const s = Number(one("SELECT last_value FROM metric_registry WHERE metric = 'closure_avalanche_mean_24h'").last_value);
ok(m === 0.377, "closure_branching_ratio_24h = 211 / 560 from the migration tick", m);
ok(Math.abs(s - 1 / (1 - 0.377)) < 0.002, "closure_avalanche_mean_24h = 1 / (1 - m)", s);
ok(one("SELECT state FROM metric_registry WHERE metric = 'papers_unlearned_over_120m'").state === "UNMEASURED", "papers_unlearned_over_120m waits for the worker");

const belief = one("SELECT verify_probe FROM remediation_contracts WHERE class = 'belief-fleet-closure-subcritical'").verify_probe;
ok(one(belief).observed === "1", "the belief holds at m = 0.377");
for (let i = 0; i < 200; i++) ins.run(1000 + i, "reopened", "-5 minutes");
db.exec("INSERT INTO fleet_tick (source) VALUES ('migration:test')");
ok(Number(one("SELECT last_value FROM metric_registry WHERE metric = 'closure_branching_ratio_24h'").last_value) === 0.734, "a later tick refreshes m");
ok(one(belief).observed === "0", "the belief is falsified above 0.5");
for (let i = 0; i < 400; i++) ins.run(2000 + i, "reopened", "-5 minutes");
db.exec("INSERT INTO fleet_tick (source) VALUES ('migration:test')");
ok(Number(one("SELECT last_value FROM metric_registry WHERE metric = 'closure_avalanche_mean_24h'").last_value) === 999, "a supercritical m >= 1 reads 999");

const T = q("SELECT metric_key, operator, threshold FROM analytics_metric_triggers ORDER BY metric_key");
ok(T.length === 2 && T[0].metric_key === "closure_branching_ratio_24h" && T[0].threshold === 0.5 && T[1].metric_key === "papers_unlearned_over_120m" && T[1].threshold === 10, "two triggers", T);
const I = q("SELECT * FROM agent_issues");
ok(I.length === 1 && /^PAPER-LEARN-WATCHMAKER-1:/.test(I[0].title) && /\ncode-task: repo=qnfo-workers path=qnfo-fleet-dashboard\/worker.js\n/.test(I[0].description) && /\ncode-anchor: var WATCHMAKER_OPS = \[\n/.test(I[0].description) && I[0].created_at > 1.7e12, "the watchmaker follow-up carries its code-task, anchor and probe", I);
const anchor = readFileSync(new URL("../qnfo-fleet-dashboard/worker.js", import.meta.url), "utf8").split("var WATCHMAKER_OPS = [").length - 1;
ok(anchor === 1, "the code-anchor occurs exactly once in qnfo-fleet-dashboard/worker.js", anchor);
ok(one("SELECT value FROM ops_config WHERE key = 'paper_learn_mode'").value === "on" && one("SELECT value FROM ops_config WHERE key = 'paper_learn_per_tick'").value === "4", "ops_config defaults");

// Re-apply: nothing doubles.
const counts = () => ["paper_learnings", "internal_errata", "analytics_metric_triggers", "agent_issues", "decision_log", "belief_registry", "capability_ledger", "metric_registry", "ops_config"].map((t) => one("SELECT COUNT(*) AS n FROM " + t).n).join(",");
const before = counts();
db.exec(sql.replace(/INSERT INTO fleet_tick[^;]*;/, ""));
ok(counts() === before, "a second apply changes nothing", [before, counts()]);

// The trigger runs only in the first ten minutes of an hour unless a migration ticks.
const trg = one("SELECT sql FROM sqlite_master WHERE name = 'paper_learn_branching_tick'").sql;
ok(/strftime\('%M', 'now'\) < '10' OR NEW\.source LIKE 'migration:%'/.test(trg), "hourly gate on the fleet tick");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
