// SLA-METRICS-1 offline suite: replays migrations/2026-10-19-sla-metrics-disjoint.sql twice on SQLite against the live definitions of every
// view it touches (v_sla_over_120m before the file, v_stuck_summary, v_stuck_summary_kernel, v_issue_age, v_content_pipeline,
// v_cadence_overdue; each read from the migration that last defined it, verified equal to qnfo-audit by length on 2026-10-19).
// Proves: total_over_120m counts each item once (an issue without a doer is inside the aged issues, a research row in the queued or review
// term is not counted again by the content term, an untriaged aged issue and a queued stalled code task are counted once); every other
// column of v_sla_over_120m keeps its name, position and value; the fm-view-alias-capture probe and the new fm-sla-metric-overlap detector
// pass on the new view and the detector fails on the old one; the file creates no trigger and writes no agent_issues row, so the
// AGENT-ISSUES-TRIGGER-DEPTH-1 chain is unchanged; the file is idempotent (one decision, one failure mode, one formula note, one backup).
// SLA_DISJOINT_SQL=<path> replays another file (an empty one shows the suite failing on the base).
// Run: node migrations/sla-120m-disjoint.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const sqlPath = process.env.SLA_DISJOINT_SQL || here("2026-10-19-sla-metrics-disjoint.sql");
const sql = readFileSync(sqlPath, "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };

// the text of "CREATE VIEW <name> AS ..." up to its closing semicolon, as the migration that last defined it wrote it
function viewDdl(file, name) {
  const t = readFileSync(here(file), "utf8");
  const at = t.search(new RegExp("^CREATE VIEW (?:IF NOT EXISTS )?" + name + "\\s+AS", "m"));
  if (at < 0) throw new Error(name + " not found in " + file);
  let q = false, i = at;
  for (; i < t.length; i++) { const c = t[i]; if (c === "'") q = !q; else if (c === ";" && !q) break; }
  return t.slice(at, i).replace(/CREATE VIEW IF NOT EXISTS/, "CREATE VIEW");
}
const ddl = {
  v_issue_age: viewDdl("2026-10-08-11-antifragile.sql", "v_issue_age"),
  v_content_pipeline: viewDdl("2026-10-14-03-content-pipeline.sql", "v_content_pipeline"),
  v_stuck_summary: viewDdl("2026-10-19-resolve-code-task-publish-slug.sql", "v_stuck_summary"),
  v_stuck_summary_kernel: viewDdl("2026-10-19-owner-queue-triggers-versioned.sql", "v_stuck_summary_kernel"),
  v_cadence_overdue: viewDdl("2026-10-19-fleet-graph.sql", "v_cadence_overdue"),
  v_sla_over_120m: viewDdl("2026-10-14-sla-120m-7-cadence-overdue.sql", "v_sla_over_120m"),
};
// the live fm-view-alias-capture probe read from qnfo-audit on 2026-10-19
const LIVE_PROBE = "SELECT '1' AS expected, CASE WHEN total_over_120m = issues_open_over_120m + research_review_error + research_head_stalled + research_queued_180m + intents_pending + outreach_waiting + code_tasks_stalled + issues_without_doer_3h + zenodo_exit_pending_stalled + research_held_over_sla + triage_gap + contracts_cadence_drift + code_tasks_queued_over_120m + predictions_unscored_over_sla + doctrine_proposals_waiting + content_items_over_sla + research_claims_over_120m + cadence_overdue_over_120m AND issues_open_over_120m = (SELECT COUNT(*) FROM v_issue_age WHERE age_min > 120) THEN '1' ELSE '0' END AS observed FROM v_sla_over_120m";
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];

// one frozen clock for every fixture, so the base and migrated databases (two build() calls) hold identical timestamps
const NOW = Date.now();
const iso = (minAgo) => new Date(NOW - minAgo * 6e4).toISOString().replace(/\.\d+Z$/, "Z");
const ms = (minAgo) => NOW - minAgo * 6e4;
// the two age columns grow with the wall clock: the views are read at two different instants, so a minute boundary between the reads moves
// them by one (oldest_open_issue_min read 299 on the base and 300 on the migrated view in the deploy-gate run on 58a8ed35)
const AGE_COLS = ["oldest_open_issue_min", "code_tasks_queued_oldest_min"];

function build(withMigration) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE research_queue (id TEXT PRIMARY KEY, idea TEXT, paper_slug TEXT, status TEXT, stage TEXT, claimed_at TEXT, created_at TEXT, published_at TEXT, completed_at TEXT);
CREATE TABLE research_ready (id TEXT PRIMARY KEY, ready_at TEXT NOT NULL);
CREATE TABLE research_review_seen (id TEXT PRIMARY KEY, first_seen TEXT NOT NULL);
CREATE TABLE research_hold_seen (id TEXT PRIMARY KEY, first_seen TEXT NOT NULL);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE intents (id TEXT PRIMARY KEY, status TEXT, created_at TEXT);
CREATE TABLE outreach_queue (id TEXT PRIMARY KEY, status TEXT, created_at TEXT, attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'queued', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, status TEXT, created_at INTEGER, description TEXT, priority TEXT, title TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT);
CREATE TABLE issue_age_bumps (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, pass INTEGER NOT NULL DEFAULT 1, verified_at TEXT DEFAULT (datetime('now')));
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL DEFAULT '', action TEXT NOT NULL DEFAULT '', verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL DEFAULT '', expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, released_at TEXT, expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now','+2 hours')));
CREATE TABLE zenodo_exit_ledger (doi TEXT PRIMARY KEY, status TEXT);
CREATE TABLE decision_predictions (id INTEGER PRIMARY KEY, scored_at TEXT, due_at TEXT);
CREATE TABLE doctrine_proposals (id INTEGER PRIMARY KEY, status TEXT, ts TEXT);
CREATE TABLE tick_runs (id INTEGER PRIMARY KEY, tick_id INTEGER, ok INTEGER);
CREATE TABLE autonomy_reroute_queue (id INTEGER PRIMARY KEY, drained_at TEXT, created_at TEXT);
CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY, name TEXT, idea TEXT, status TEXT, triaged_at TEXT, created_at TEXT);
CREATE TABLE version_queue (id INTEGER PRIMARY KEY, title TEXT, slug TEXT, status TEXT, updated_at TEXT, created_at TEXT);
CREATE TABLE paper_revision_log (id INTEGER PRIMARY KEY, title TEXT, slug TEXT, status TEXT, updated_at TEXT, created_at TEXT);
CREATE TABLE errata_queue (id INTEGER PRIMARY KEY, subject TEXT, claim TEXT, status TEXT, updated_at TEXT, created_at TEXT);
CREATE TABLE internal_errata (id INTEGER PRIMARY KEY, claim_text TEXT, target_ref TEXT, status TEXT, updated_at TEXT, detected_at TEXT);
CREATE TABLE social_threads (id INTEGER PRIMARY KEY, title TEXT, slug TEXT, status TEXT, posted_at TEXT, updated_at TEXT, created_at TEXT);
CREATE TABLE dissemination_tracker (id INTEGER PRIMARY KEY, channel TEXT, paper_title TEXT, paper_slug TEXT, action TEXT, posted_at TEXT, updated_at TEXT, created_at TEXT);
CREATE TABLE content_stages (stage TEXT PRIMARY KEY, ord INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL DEFAULT '', definition TEXT NOT NULL DEFAULT '', exit_gate TEXT NOT NULL DEFAULT '', enforced_by TEXT NOT NULL DEFAULT '', sla_min INTEGER, terminal INTEGER NOT NULL DEFAULT 0);
CREATE TABLE content_stage_events (id INTEGER PRIMARY KEY AUTOINCREMENT, flow TEXT, item_id TEXT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE cadence_sla (surface TEXT PRIMARY KEY, producer TEXT NOT NULL, interval_min INTEGER NOT NULL, sla_min INTEGER NOT NULL, schedule TEXT, last_output TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, formula TEXT, last_value TEXT, last_refreshed TEXT);
CREATE TABLE social_media_posts (id INTEGER PRIMARY KEY, status TEXT, published_at TEXT);
CREATE TABLE cf_changelog_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, status TEXT);
CREATE TABLE continuity_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, ok INTEGER);
CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
-- the AGENT-ISSUES-TRIGGER-DEPTH-1 chain stand-in: a write to agent_issues reaches issue_lifecycle and a second table
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, event TEXT);
CREATE TABLE issue_lifecycle_echo (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER);
CREATE TRIGGER agent_issues_lifecycle_ins AFTER INSERT ON agent_issues BEGIN INSERT INTO issue_lifecycle (issue_id, event) VALUES (NEW.id, 'open'); END;
CREATE TRIGGER issue_lifecycle_echo_ins AFTER INSERT ON issue_lifecycle BEGIN INSERT INTO issue_lifecycle_echo (issue_id) VALUES (NEW.issue_id); END;`);
  for (const v of ["v_issue_age", "v_content_pipeline", "v_stuck_summary", "v_stuck_summary_kernel", "v_cadence_overdue", "v_sla_over_120m"]) db.exec(ddl[v]);
  db.prepare("INSERT INTO remediation_contracts (class, verify_probe, verify_transport, status, expected_cadence_h) VALUES ('fm-view-alias-capture', ?, 'd1-query', 'active', 1)").run(LIVE_PROBE);
  db.prepare("INSERT INTO metric_registry (metric, formula, last_value) VALUES ('sla_breaches_over_120m', 'v_sla_over_120m.total_over_120m: base formula', '0')").run();
  db.exec("INSERT INTO content_stages (stage, sla_min) VALUES ('queued', 120), ('review', 120), ('research', 120)");
  db.exec("INSERT INTO cloud_ops_events (id, ts, kind, job, status) VALUES ('e1', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'done', 'qnfo-research-exec', 'ok')");

  // issues: i1 aged, no doer, triaged / i2 aged, has a doer, triaged / i3 young, triaged / i4 aged, has a doer, untriaged / i5 young, untriaged
  const iss = db.prepare("INSERT INTO agent_issues (id, status, created_at, description, title) VALUES (?, 'open', ?, '', 't')");
  iss.run(1, ms(300)); iss.run(2, ms(300)); iss.run(3, ms(30)); iss.run(4, ms(200)); iss.run(5, ms(10));
  db.exec("INSERT INTO issue_triage (issue_id, rc, triage_state) VALUES (1, 'x', 'triaged'), (2, 'x', 'triaged'), (3, 'x', 'triaged')");
  db.exec("INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, status) VALUES ('issue-2', 2, 'SELECT 1', 'd1-query', 'active'), ('issue-4', 4, 'SELECT 1', 'd1-query', 'active')");
  // research: r1 queued 300 min / r2 queued 30 min / r3 in review 400 min, seen 200 min ago / r4 deferred 500 min / r5 published
  //           r6 held 400 min, seen 200 min ago / r7 researching, claimed 300 min ago
  const rq = db.prepare("INSERT INTO research_queue (id, status, stage, claimed_at, created_at, published_at) VALUES (?, ?, ?, ?, ?, ?)");
  rq.run("r1", "queued", null, null, iso(300), null);
  rq.run("r2", "queued", null, null, iso(30), null);
  rq.run("r3", "review", "review", iso(400), iso(500), null);
  rq.run("r4", "deferred", null, null, iso(500), null);
  rq.run("r5", "published", "done", iso(600), iso(700), iso(100));
  rq.run("r6", "held", null, iso(400), iso(450), null);
  rq.run("r7", "researching", "ground", iso(300), iso(350), null);
  db.exec("INSERT INTO research_review_seen (id, first_seen) VALUES ('r3', '" + iso(200) + "')");
  db.exec("INSERT INTO research_hold_seen (id, first_seen) VALUES ('r6', '" + iso(200) + "')");
  // code tasks: c1 queued and idle 300 min (stalled AND queued over 120) / c2 in a PR, idle 300 min (stalled only) / c3 merged
  const ct = db.prepare("INSERT INTO code_tasks (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)");
  ct.run("c1", "queued", iso(300), iso(300)); ct.run("c2", "pr_open", iso(400), iso(300)); ct.run("c3", "merged", iso(400), iso(300));
  db.exec("INSERT INTO doctrine_proposals (id, status, ts) VALUES (1, 'proposed', '" + iso(300) + "')");
  if (withMigration) db.exec(sql);
  return db;
}
const q = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);

// ---- base: what the old view reports and why it is wrong
const base = build(false);
const old = { ...one(base, "SELECT * FROM v_sla_over_120m") };
// issues 1,2,4 aged (3) + 5 young untriaged (1) = 4 issue items; research r1,r3,r4,r6,r7 = 5; code c1,c2 = 2; one proposal = 12 distinct items
const DISTINCT = 12;
ok(old.issues_open_over_120m === 3 && old.issues_without_doer_3h === 1 && old.triage_gap === 2, "fixture: 3 aged issues, 1 without a doer, 2 untriaged", old);
ok(old.research_queued_180m === 1 && old.research_review_error === 1 && old.research_held_over_sla === 1 && old.research_claims_over_120m === 1 && old.content_items_over_sla === 5, "fixture: one research row in each dedicated term and five over their content SLA", old);
ok(old.code_tasks_stalled === 2 && old.code_tasks_queued_over_120m === 1 && old.doctrine_proposals_waiting === 1 && old.research_head_stalled === 0, "fixture: two stalled code tasks, one queued over 120, one proposal", old);
ok(old.total_over_120m === 19 && old.total_over_120m > DISTINCT, "base: the old total counts 19 for 12 distinct items (the defect)", old.total_over_120m);

// ---- the file
const db = build(true);
const nw = { ...one(db, "SELECT * FROM v_sla_over_120m") };
ok(Object.keys(nw).join() === Object.keys(old).join(), "v_sla_over_120m keeps every column name in the same position", { old: Object.keys(old), now: Object.keys(nw) });
const same = Object.keys(old).filter((k) => k !== "total_over_120m" && !AGE_COLS.includes(k)).every((k) => old[k] === nw[k]);
ok(same, "every column except the total and the two wall-clock ages keeps its value", { old, nw });
ok(AGE_COLS.every((k) => Math.abs(old[k] - nw[k]) <= 1), "the two age columns keep their value to within the minute that passes between the reads", { old, nw });
ok(nw.total_over_120m === DISTINCT, "the total counts each of the 12 distinct items once", nw.total_over_120m);
const ov = one(db, "SELECT * FROM v_sla_overlap_120m");
ok(ov.research_in_content_over_sla === 4 && ov.triage_gap_in_open_120m === 1 && ov.code_tasks_stalled_and_queued_120m === 1, "the overlap view finds the 4 research rows (queued, review, held, researching), the aged untriaged issue and the queued stalled task", ov);
ok(nw.total_over_120m === old.total_over_120m - old.issues_without_doer_3h - ov.research_in_content_over_sla - ov.triage_gap_in_open_120m - ov.code_tasks_stalled_and_queued_120m, "the drop is exactly the no-doer issue plus the three overlaps");
ok(nw.issues_without_doer_3h <= nw.issues_open_over_120m, "a no-doer issue is an aged issue (the reason the total may leave the column out)");

// a row that only one term counts still counts: the deferred research row (content only) and the young untriaged issue (triage only)
db.exec("DELETE FROM research_queue WHERE id IN ('r1', 'r3', 'r6', 'r7'); DELETE FROM issue_triage; UPDATE code_tasks SET status = 'merged'");
const t2 = one(db, "SELECT total_over_120m t, content_items_over_sla c, triage_gap g, issues_open_over_120m i FROM v_sla_over_120m");
ok(t2.c === 1 && t2.g === 5 && t2.i === 3 && t2.t === 5 + 1 + 0 + 1, "with only r4 left in the content term it is counted once, the 2 young untriaged issues and the 3 aged ones are 5 issues, plus one proposal", t2);

// ---- detectors
const probe = one(db, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-view-alias-capture'").p;
const fmp = (d) => one(d, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-sla-metric-overlap'").p;
const dbFresh = build(true);
const pr = one(dbFresh, one(dbFresh, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-view-alias-capture'").p);
ok(pr.observed === pr.expected, "the alias detector passes on the new view", pr);
ok(one(dbFresh, LIVE_PROBE).observed === "0", "the live alias probe text reads 0 on the new view (why it is updated)");
const det = fmp(dbFresh);
const dr = one(dbFresh, det);
ok(dr.observed === "0" && dr.expected === "0", "fm-sla-metric-overlap passes on the new view: total equals the distinct-key count plus the non-item terms", dr);
const detOnBase = one(base, det);
ok(detOnBase.observed === "7", "fm-sla-metric-overlap fails on the old view: 19 counted against 12 distinct", detOnBase);
ok(!/content_items_over_sla|research_queued_180m|issues_without_doer_3h|v_sla_overlap_120m/.test(det), "the detector reads the tables and the item-less terms, never the drill-down columns it checks (a behavioural check, not a text one)");
for (const p of [probe, det]) {
  const low = p.toLowerCase();
  ok(low.startsWith("select") && !p.includes(";") && WRITE_KW.every((k) => !low.includes(k)), "a probe is a single read-only SELECT the consumer accepts", p.slice(0, 60));
}
// a new overlapping term would fail it: count the no-doer column in the total again
dbFresh.exec("DROP VIEW v_sla_over_120m");
dbFresh.exec(ddl.v_sla_over_120m);
ok(one(dbFresh, det).observed !== "0", "the detector fails when the total double counts again (the old view on the same data)", one(dbFresh, det));

// ---- no trigger, no agent_issues write, no threshold: the depth chain and the alarms are untouched
const body = sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
ok(!/(CREATE|DROP)\s+(TEMP\s+)?TRIGGER/i.test(body), "the file creates or drops no trigger, so the AGENT-ISSUES-TRIGGER-DEPTH-1 canary has nothing to check");
ok(!/(INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+"?(agent_issues|issue_lifecycle|issue_triage)\b/i.test(body), "the file writes no row that reaches the agent_issues trigger chain");
ok(!/analytics_metric_triggers|metric_trigger_ratchets|fleet_budget|queue_sla\b/i.test(body), "no trigger threshold, ratchet, budget or queue_sla row is written");
const trig = (d) => q(d, "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").map((r) => r.name + "|" + r.sql).join("\n");
ok(trig(base) === trig(db), "the trigger set is byte-identical before and after");
db.exec("INSERT INTO agent_issues (id, status, created_at, description, title) VALUES (900, 'open', 0, '', 'canary')");
ok(one(db, "SELECT COUNT(*) n FROM issue_lifecycle_echo WHERE issue_id = 900").n === 1, "an agent_issues insert still runs the whole trigger chain after the file");

// ---- replay: idempotence, backup, bookkeeping
const snap = (d) => JSON.stringify([q(d, "SELECT sql FROM sqlite_master WHERE name IN ('v_sla_over_120m', 'v_sla_overlap_120m') ORDER BY name"), q(d, "SELECT class, verify_probe FROM remediation_contracts ORDER BY class"), q(d, "SELECT * FROM metric_registry"), q(d, "SELECT fm_key FROM failure_modes"), q(d, "SELECT action FROM decision_log ORDER BY id")]);
const r1 = build(true);
const s1 = snap(r1);
r1.exec(sql);
ok(snap(r1) === s1, "a second replay changes nothing");
const bk = q(r1, "SELECT kind, k, v FROM bak_20261019_sla_metrics_disjoint ORDER BY kind");
ok(bk.length === 3 && bk.map((x) => x.kind).join() === "metric,probe,view", "the backup holds the view, the probe and the metric formula once", bk.map((x) => x.kind));
ok(bk.find((x) => x.kind === "view").v === ddl.v_sla_over_120m && bk.find((x) => x.kind === "probe").v === LIVE_PROBE && /base formula/.test(bk.find((x) => x.kind === "metric").v), "the backup keeps the replaced text after the second replay");
ok(one(r1, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'SLA-METRICS-1:') = 1").n === 1, "one decision_log row after two replays");
ok(one(r1, "SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'sla-metric-overlap'").n === 1 && one(r1, "SELECT COUNT(*) n FROM remediation_contracts WHERE class = 'fm-sla-metric-overlap'").n === 1, "one failure mode and one detector contract");
const fml = one(r1, "SELECT formula f FROM metric_registry WHERE metric = 'sla_breaches_over_120m'").f;
ok(fml.split("SLA-METRICS-1").length === 2 && /base formula/.test(fml), "the formula note is appended once", fml);
ok(/Rollback:/.test(sql.split("\n").slice(0, 8).join("\n")) && /^-- APPLY-BY: ci/m.test(sql) && /^-- DB: qnfo-audit/m.test(sql) && /^-- BACKUP: bak_20261019_sla_metrics_disjoint/m.test(sql), "the header carries APPLY-BY, DB, BACKUP and Rollback");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
