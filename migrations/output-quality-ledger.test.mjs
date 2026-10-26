// OUTPUT-QUALITY-LEDGER-1 offline suite: runs migrations/2026-10-26-output-quality-ledger.sql on SQLite with the live table definitions. Proves: the migration
// is idempotent; the heavy tick computes the five measures from fixtures whose answers are known; each statement is gated on its metric's age; an empty input
// is not written; the verdict marks better, worse, flat, insufficient_history and stale with the right polarity and tolerance; proxies and validity measures never
// move the headline; fewer than three measured outcomes is insufficient_history, never a pass; the two code-task actions are in the form the code loop reads; and the
// Rollback line runs. It does not pin the text of any worker: a source anchor goes stale when the doer edits the file, and a suite must not block that PR.
// Run: node migrations/output-quality-ledger.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-output-quality-ledger.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const near = (a, b, eps = 1e-6) => a !== null && a !== undefined && Math.abs(Number(a) - b) < eps;

const SCHEMA = `
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE metric_history (metric TEXT NOT NULL, day TEXT NOT NULL, value REAL, meets INTEGER, target TEXT, ts TEXT, PRIMARY KEY (metric, day));
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE belief_registry (belief_key TEXT PRIMARY KEY, claim TEXT NOT NULL, confidence REAL, evidence TEXT NOT NULL, probe_class TEXT NOT NULL, built_on TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE fleet_tick_heavy (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL);
CREATE TABLE quality_scores (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, slug TEXT, status TEXT, body_len INTEGER, refs INTEGER, lit INTEGER, verif INTEGER, score INTEGER, flag TEXT);
CREATE TABLE internal_errata (id TEXT PRIMARY KEY, target_kind TEXT NOT NULL, target_ref TEXT NOT NULL, detected_at TEXT NOT NULL, detected_by TEXT, severity TEXT DEFAULT 'high', claim_text TEXT, falsification TEXT, evidence TEXT, remediation TEXT, status TEXT DEFAULT 'open', owner TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE research_golden_runs (row_id TEXT PRIMARY KEY, catch_rate REAL, false_positive_rate REAL, model_version TEXT, prompt_version TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
`;

function fresh() { const db = new DatabaseSync(":memory:"); db.exec(SCHEMA); return db; }
const one = (db, q, ...a) => db.prepare(q).get(...a);
const all = (db, q, ...a) => db.prepare(q).all(...a);
const day = (db, offset) => one(db, "SELECT date('now', ?) AS d", offset + " days").d;
const metric = (db, m) => one(db, "SELECT * FROM metric_registry WHERE metric = ?", m);
const tick = (db) => db.prepare("INSERT INTO fleet_tick_heavy (source) VALUES ('test')").run();
const age = (db, m, minutes) => db.prepare("UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?) WHERE metric = ?").run("-" + minutes + " minutes", m);

// ---- 1. apply, shape, idempotence
const db = fresh();
db.exec(sql);
ok(one(db, "SELECT COUNT(*) AS n FROM output_quality_measures").n === 14, "14 measures classified");
const roles = Object.fromEntries(all(db, "SELECT role, COUNT(*) AS n FROM output_quality_measures GROUP BY role").map((r) => [r.role, r.n]));
ok(roles.outcome === 9 && roles.proxy === 2 && roles.validity === 3, "9 outcomes, 2 proxies, 3 validity measures", roles);
ok(one(db, "SELECT COUNT(*) AS n FROM output_quality_measures WHERE metric IN ('paper_same_paper_score_delta_7d','ask_citation_validity_7d') AND role <> 'proxy'").n === 0, "the structural paper score and the citation-number check are proxies");
ok(all(db, "SELECT metric FROM metric_registry ORDER BY metric").length === 7 && all(db, "SELECT metric_key FROM analytics_metric_triggers").length === 3, "7 registry rows and 3 triggers");
ok(all(db, "SELECT metric FROM metric_registry WHERE state <> 'UNMEASURED'").length === 0, "new metrics start UNMEASURED: unknown is never a value");
const trg = Object.fromEntries(all(db, "SELECT * FROM analytics_metric_triggers").map((t) => [t.metric_key, t]));
ok(trg.papers_with_open_high_errata_pct.operator === "gt" && trg.papers_with_open_high_errata_pct.threshold === 10, "errata share trigger: gt 10");
ok(trg.output_quality_outcomes_worse.operator === "gt" && trg.output_quality_outcomes_worse.threshold === 0, "regression trigger: gt 0");
ok(trg.golden_run_complement_share_30d.operator === "gt" && trg.golden_run_complement_share_30d.threshold === 0.1, "golden-run trigger: gt 0.1");
const exempt = ["errata_high_net_inflow_7d", "paper_same_paper_score_delta_7d", "paper_new_score_saturation_14d", "output_quality_outcomes_unmeasured"];
ok(exempt.every((m) => !trg[m] && /exempt/.test(metric(db, m).disposition_actor)), "each metric without a trigger names its exemption", exempt);
ok(one(db, "SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE 'Q08-RETRACTION-METRIC-1:%' AND status = 'open'").n === 1, "one q08 retraction issue");
ok(one(db, "SELECT COUNT(*) AS n FROM failure_modes").n === 2 && one(db, "SELECT COUNT(*) AS n FROM remediation_contracts").n === 3 && one(db, "SELECT COUNT(*) AS n FROM belief_registry").n === 1, "2 failure modes, 3 contracts, 1 belief");
const dl = one(db, "SELECT * FROM decision_log");
ok(/^[a-z0-9_]+ (>=|<=|>|<) [0-9.]+ within [0-9]+ h$/.test(dl.predicted_outcome) && dl.rollback_path && dl.capability_gain && dl.blast_radius, "decision_log row carries a parseable prediction, rollback, gain and blast radius", dl.predicted_outcome);
const before = JSON.stringify([all(db, "SELECT * FROM output_quality_measures"), all(db, "SELECT metric, state FROM metric_registry ORDER BY metric"), all(db, "SELECT id FROM agent_issues"), all(db, "SELECT id FROM decision_log")]);
db.exec(sql);
ok(JSON.stringify([all(db, "SELECT * FROM output_quality_measures"), all(db, "SELECT metric, state FROM metric_registry ORDER BY metric"), all(db, "SELECT id FROM agent_issues"), all(db, "SELECT id FROM decision_log")]) === before, "a second apply writes nothing");

// ---- 2. the heavy tick on fixtures with known answers
const d1 = day(db, -1), d0 = day(db, -8), dOld = day(db, -20), dNew = day(db, -3);
const qs = db.prepare("INSERT INTO quality_scores (ts, slug, status, score, refs) VALUES (?, ?, 'published', ?, 5)");
// ten old papers seen 20, 8 and 1 days ago: seven rise by 4, three fall by 6 (mean +1.00); four new papers first seen 3 days ago, three at or above 95.
for (let i = 0; i < 10; i++) { const s = "old-" + i, a = 60; qs.run(dOld, s, a); qs.run(d0, s, a); qs.run(d1, s, i < 7 ? a + 4 : a - 6); }
for (const [i, sc] of [96, 98, 100, 90].entries()) qs.run(dNew, "new-" + i, sc), qs.run(d1, "new-" + i, sc);
qs.run(day(db, 0), "today-partial", 10); // today's partial snapshot must not count as the latest complete day
const er = db.prepare("INSERT INTO internal_errata (id, target_kind, target_ref, detected_at, severity, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
const ts = (offsetDays) => one(db, "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?) AS t", offsetDays + " days").t;
// open high on 3 distinct papers (5 rows), 1 open high on a chat_log, 1 open medium, 2 detected in the window, 3 closed in the window, 1 closed long ago
er.run("e1", "paper", "old-1", ts(-30), "high", "open", ts(-30)); er.run("e2", "paper", "old-1", ts(-30), "high", "open", ts(-30));
er.run("e3", "paper", "old-2", ts(-2), "high", "open", ts(-2)); er.run("e4", "paper", "old-3", ts(-1), "high", "open", ts(-1)); er.run("e5", "paper", "old-3", ts(-30), "high", "open", ts(-30));
er.run("e6", "chat_log", "c-1", ts(-1), "high", "open", ts(-1)); er.run("e7", "paper", "old-4", ts(-30), "medium", "open", ts(-30));
er.run("e8", "paper", "old-5", ts(-30), "high", "resolved", ts(-1)); er.run("e9", "paper", "old-6", ts(-30), "high", "closed", ts(-2)); er.run("e10", "paper", "old-7", ts(-30), "high", "rejected", ts(-3));
er.run("e11", "paper", "old-8", ts(-30), "high", "resolved", ts(-30));
const gr = db.prepare("INSERT INTO research_golden_runs (row_id, catch_rate, false_positive_rate, created_at) VALUES (?, ?, ?, ?)");
gr.run("g1", 0.9, 0.1, ts(-1)); gr.run("g2", 0.7, 0.3, ts(-2)); gr.run("g3", 0.8, 0.2, ts(-3)); gr.run("g4", 0.9, 0.05, ts(-4)); gr.run("g5", 0.5, 0.5, ts(-60));
tick(db);
const v = (m) => metric(db, m).last_value;
ok(near(v("papers_with_open_high_errata_pct"), 100 * 3 / 14, 0.051), "errata share: 3 distinct papers with an open high erratum of 14 in the latest complete snapshot (chat_log and medium rows excluded)", v("papers_with_open_high_errata_pct"));
ok(near(v("errata_high_net_inflow_7d"), -1, 1e-9), "net inflow: high paper errata detected in 7 days (e3, e4) minus closed in 7 days (e8, e9, e10)", v("errata_high_net_inflow_7d"));
ok(near(v("paper_same_paper_score_delta_7d"), 1.0, 1e-9), "same-paper delta is the mean over papers on both days: new papers are not in it", v("paper_same_paper_score_delta_7d"));
ok(near(v("paper_new_score_saturation_14d"), 0.75, 1e-9), "saturation: 3 of 4 new papers at or above 95", v("paper_new_score_saturation_14d"));
ok(near(v("golden_run_complement_share_30d"), 0.75, 1e-9), "golden complement share: 3 of 4 rows in 30 days sum to 1", v("golden_run_complement_share_30d"));
ok(metric(db, "papers_with_open_high_errata_pct").state === "MEASURED" && metric(db, "output_quality_outcomes_worse").state === "MEASURED", "measured metrics are marked MEASURED");

// gate: a stored value is left alone until the metric is 50 minutes old
db.prepare("UPDATE metric_registry SET last_value = 'SENTINEL' WHERE metric IN ('papers_with_open_high_errata_pct','golden_run_complement_share_30d')").run();
age(db, "papers_with_open_high_errata_pct", 49); age(db, "golden_run_complement_share_30d", 51);
tick(db);
ok(v("papers_with_open_high_errata_pct") === "SENTINEL", "49 minutes old: not recomputed");
ok(near(v("golden_run_complement_share_30d"), 0.75, 1e-9), "51 minutes old: recomputed");

// ---- 3. an empty input is not written
const empty = fresh();
empty.exec(sql);
const eq = empty.prepare("INSERT INTO quality_scores (ts, slug, status, score) VALUES (?, ?, 'published', 50)");
eq.run(day(empty, -20), "solo"); eq.run(day(empty, -1), "solo"); eq.run(day(empty, -9), "other"); // solo is not new and has no row on the baseline day: no pair, no new paper
tick(empty);
for (const m of ["paper_same_paper_score_delta_7d", "paper_new_score_saturation_14d", "golden_run_complement_share_30d"]) {
  const r = metric(empty, m);
  ok(r.last_value === null && r.state === "UNMEASURED", m + ": no pair, no new papers or no golden rows leaves the metric UNMEASURED", r);
}
ok(metric(empty, "papers_with_open_high_errata_pct").last_value === "0.0" || Number(metric(empty, "papers_with_open_high_errata_pct").last_value) === 0, "an errata share with no errata is a real 0");

// ---- 4. the verdict
const vdb = fresh();
vdb.exec(sql);
const hist = vdb.prepare("INSERT INTO metric_history (metric, day, value) VALUES (?, ?, ?)");
const today = day(vdb, 0), week = day(vdb, -7), old = day(vdb, -9), stale = day(vdb, -4), staleThen = day(vdb, -12);
// better (higher is better): 357 -> 528
hist.run("q08_human_reads_7d", week, 357); hist.run("q08_human_reads_7d", today, 528);
// worse (lower is better): 40 -> 52 percent of papers
hist.run("papers_with_open_high_errata_pct", week, 40); hist.run("papers_with_open_high_errata_pct", today, 52);
// flat inside tolerance: 0.47 -> 0.48 against max(0.03, 0.1 * 0.47)
hist.run("code_task_success_rate_30d", week, 0.47); hist.run("code_task_success_rate_30d", today, 0.48);
// better by the nearest earlier day: history older than seven days is used when the exact day is missing
hist.run("remediation_latest_pass_pct_7d", old, 72); hist.run("remediation_latest_pass_pct_7d", today, 80);
// stale: the latest value is four days old
hist.run("engaged_human_sessions_28d", staleThen, 12000); hist.run("engaged_human_sessions_28d", stale, 16000);
// insufficient: only today
hist.run("errata_high_net_inflow_7d", today, 676);
// a proxy and a validity measure that move do not count
hist.run("ask_citation_validity_7d", week, 1); hist.run("ask_citation_validity_7d", today, 0.5);
hist.run("paper_same_paper_score_delta_7d", week, 5); hist.run("paper_same_paper_score_delta_7d", today, -5);
hist.run("paper_new_score_saturation_14d", week, 0.2); hist.run("paper_new_score_saturation_14d", today, 0.9);
const moved = Object.fromEntries(all(vdb, "SELECT metric, moved FROM v_output_quality_verdict").map((r) => [r.metric, r.moved]));
ok(moved.q08_human_reads_7d === "better", "higher reads: better", moved.q08_human_reads_7d);
ok(moved.papers_with_open_high_errata_pct === "worse", "a higher errata share is worse (polarity -1)", moved.papers_with_open_high_errata_pct);
ok(moved.code_task_success_rate_30d === "flat", "a change inside the tolerance is flat", moved.code_task_success_rate_30d);
ok(moved.remediation_latest_pass_pct_7d === "better", "the nearest day on or before now-7d is the baseline", moved.remediation_latest_pass_pct_7d);
ok(moved.engaged_human_sessions_28d === "stale", "a latest value older than two days is stale, not a verdict", moved.engaged_human_sessions_28d);
ok(moved.errata_high_net_inflow_7d === "insufficient_history" && moved.outreach_human_clicks_7d === "insufficient_history", "no baseline, or no row at all: insufficient_history", moved);
const head = one(vdb, "SELECT * FROM v_output_quality_headline");
ok(head.better === 2 && head.worse === 1 && head.flat === 1 && head.verdict === "mixed", "headline counts outcomes only and says mixed", head);
ok(head.gaps.split(",").sort().join() === "ask,promotion,site", "surfaces without a measured outcome are listed as gaps", head.gaps);
ok(head.unmeasured === 5, "unmeasured outcomes are counted, not passed: inflow, 3 promotion measures... and the stale sessions", head);
const surf = Object.fromEntries(all(vdb, "SELECT surface, verdict FROM v_output_quality_by_surface").map((r) => [r.surface, r.verdict]));
ok(surf.papers === "regressing" && surf.essays === "improving" && surf.code === "improving" && surf.promotion === "unmeasured" && surf.site === "unmeasured", "by surface: papers regressing, essays and code improving, promotion and site unmeasured", surf);
ok(surf.ask === "no_outcome_measure", "a surface with only a proxy says it has no outcome measure", surf.ask);
// better everywhere it is measured, but with gaps: never plain "improving"
const gaps = fresh();
gaps.exec(sql);
const gh = gaps.prepare("INSERT INTO metric_history (metric, day, value) VALUES (?, ?, ?)");
for (const [m, a, b] of [["q08_human_reads_7d", 357, 528], ["outreach_human_clicks_7d", 373, 695], ["code_task_success_rate_30d", 0.4, 0.47], ["remediation_latest_pass_pct_7d", 72.2, 79.9]]) { gh.run(m, day(gaps, -7), a); gh.run(m, day(gaps, 0), b); }
const gHead = one(gaps, "SELECT * FROM v_output_quality_headline");
ok(gHead.better === 4 && gHead.worse === 0 && gHead.verdict === "improving_with_gaps" && /papers/.test(gHead.gaps), "improvement on four outcomes with papers unmeasured is improving_with_gaps, not improving", gHead);
gaps.exec("DELETE FROM output_quality_measures WHERE surface IN ('papers', 'ask', 'site') OR metric IN ('outreach_clicks_per_post_7d', 'social_engagement_rate_30d')");
gh.run("outreach_clicks_per_post_7d", day(gaps, -7), 3.5);
ok(one(gaps, "SELECT verdict FROM v_output_quality_headline").verdict === "improving", "with every remaining surface measured the verdict is improving");
// the composite metrics follow the headline
tick(vdb);
ok(metric(vdb, "output_quality_outcomes_worse").last_value === "1" && metric(vdb, "output_quality_outcomes_unmeasured").last_value === "5", "the registry carries the headline's worse and unmeasured counts", [metric(vdb, "output_quality_outcomes_worse").last_value, metric(vdb, "output_quality_outcomes_unmeasured").last_value]);

// fewer than three measured outcomes is never a verdict
const thin = fresh();
thin.exec(sql);
thin.prepare("INSERT INTO metric_history (metric, day, value) VALUES ('q08_human_reads_7d', ?, 100)").run(day(thin, -7));
thin.prepare("INSERT INTO metric_history (metric, day, value) VALUES ('q08_human_reads_7d', ?, 500)").run(day(thin, 0));
ok(one(thin, "SELECT verdict FROM v_output_quality_headline").verdict === "insufficient_history", "one measured outcome is insufficient_history, not improving");
ok(one(db, "SELECT verdict FROM v_output_quality_headline").verdict === "insufficient_history", "no history at all is insufficient_history");

// ---- 5. code-task form and rollback
const anchorOf = (text) => (text.match(/^code-anchor: (.*)$/m) || [])[1];
const golden = trg.golden_run_complement_share_30d.action;
ok(/\ncode-task: repo=qnfo-workers path=qnfo-research-exec\/worker\.js\ncode-anchor: \S/.test(golden) && /within 2 refreshes|two refreshes/.test(golden), "the golden-run action ends with a code-task and a code-anchor line of their own and states its definition of done");
ok(/const falsePositiveRate = /.test(anchorOf(golden) || ""), "the golden-run anchor names the line that computes the second rate", anchorOf(golden));
const issue = one(db, "SELECT description FROM agent_issues WHERE title LIKE 'Q08-RETRACTION-METRIC-1:%'").description;
ok(/\ncode-task: repo=qnfo-workers path=q08-signal-engine\/worker\.js\ncode-anchor: \S/.test(issue), "the q08 issue carries a code-task and a code-anchor line of their own");
ok(/^code-probe: \{"paths": \["q08-signal-engine\/worker\.js"\], "contains": "q08_retraction_rate_30d"\}$/m.test(issue), "the q08 issue carries a code-probe that fails until the metric is written");

const rb = (sql.match(/^-- Rollback: (.*)$/m) || [])[1];
ok(!!rb, "a Rollback line exists");
if (rb) {
  db.exec(rb);
  ok(one(db, "SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('output_quality_measures','v_output_quality_verdict','v_output_quality_by_surface','v_output_quality_headline','output_quality_heavy_tick')").n === 0, "the Rollback line removes the tables, views and trigger");
  ok(one(db, "SELECT COUNT(*) AS n FROM metric_registry").n === 0 && one(db, "SELECT COUNT(*) AS n FROM analytics_metric_triggers").n === 0, "the Rollback line removes the registry rows and triggers");
  ok(one(db, "SELECT COUNT(*) AS n FROM agent_issues WHERE status = 'open'").n === 1 && one(db, "SELECT COUNT(*) AS n FROM decision_log").n === 1, "the Rollback line keeps the append-only rows and the q08 issue");
  tick(db);
  ok(true, "a heavy tick after the Rollback still inserts (the heartbeat never depended on the ledger)");
}
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "APPLY-BY and DB headers");
ok(!/\b(DELETE|DROP)\b/i.test(sql.replace(/^--.*$/gm, "")), "no DELETE or DROP in the body, so no BACKUP header is owed");
ok(!/\bON fleet_tick\b/i.test(sql.replace(/^--.*$/gm, "")), "no trigger on fleet_tick: the 10-minute heartbeat is untouched (FLEET-TICK-SPLIT-1)");
console.log(`output-quality-ledger: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
