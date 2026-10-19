// REMEDY-EFFICACY-PER-TRIGGER-1 offline suite (agent_issues 2244, metric trigger 371). Builds the minimum live qnfo-audit schema on SQLite
// (live trigger texts read from sqlite_master on 2026-10-19), loads the LIVE pre-change definition of fleet_tasks 'metric-refresh'
// (migrations/remedy-efficacy-per-trigger.fixture.json: 11306 characters, identical to D1 by length and two character sums), runs
// migrations/2026-10-19-remedy-efficacy-per-trigger.sql and proves:
//   - the defect: before the apply, 60 deduped re-logs of one still-hit trigger plus 3 single firings of cleared triggers read 0.05
//     (63 votes, 60 of them one trigger); after it, step 3 reads 0.75 (one vote per trigger, 3 of 4) and the new continuity step reads
//     the old 0.05 as remedy_efficacy_firing_30d; perf_experiments still vote; firings outside 7-30 days or not dispatched/deduped do not;
//   - the replace hit: the change to step 3 is a pure insertion between the two branches, the other nine steps are untouched, the
//     appended step is the eleventh, the text is byte-exact what json_insert gives, version 1 -> 2, the canonical row follows;
//   - drift safety: a definition without the anchor, or with the anchor twice, makes the file fail loudly (malformed JSON from the
//     assertion) and nothing after the assertion ran;
//   - the lever on trigger 371 is replaced and its query runs and lists the still-hit remedies with owner and firing counts;
//   - the closing probe of issue 2244 reads 0 on the old state and 1 on the new state with the value at the line, 0 without the marker;
//   - the fm detector passes with the marker and fails without it; the new metric is registered with a first value, a cadence the live
//     triggers accept, an authorship row and (named exemption) no trigger;
//   - the monitoring twin 2665 of 2244 is NOT written by this file (F): migrations/2026-10-19-metric-twin-supersede.sql owns every twin;
//   - re-applying changes nothing; the Rollback header restores every row it touches; the decision prediction is machine-readable;
//   - (repair round 1) the latest dispatched/deduped firing decides whatever status follows it (K, exact votes 1.0 and 0.0 per status);
//     the lever query returns one row per still-hit trigger, oldest first (L); the continuity step keeps the old per-firing figure with
//     its window, status filter and first value, on a fixture whose 2-decimal figure moves when any of them is removed (M); the
//     successor's contract is left alone when its guard says so (N); the file names the statement position D1 reports (J).
// Run: node migrations/remedy-efficacy-per-trigger.test.mjs   (REMEDY_EFF_MIGRATION=<file> runs it against another file, e.g. an empty one,
// to show the suite fails on the pre-fix state)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const here = (f) => new URL("./" + f, import.meta.url);
const MIG_FILE = process.env.REMEDY_EFF_MIGRATION || fileURLToPath(here("2026-10-19-remedy-efficacy-per-trigger.sql"));
const REAL_MIG = fileURLToPath(here("2026-10-19-remedy-efficacy-per-trigger.sql"));
const sql = readFileSync(MIG_FILE, "utf8");
const realSql = readFileSync(REAL_MIG, "utf8");
const fixture = JSON.parse(readFileSync(here("remedy-efficacy-per-trigger.fixture.json"), "utf8"));
const PRE = fixture.definition;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const eq = (a, b, m) => ok(a === b, m, { got: a, want: b });
const MARK = "REMEDY-EFFICACY-PER-TRIGGER-1";
const ANCHOR = "'deduped') UNION ALL SELECT CASE e.decision";
const TITLE = "METRIC-TRIGGER-371-REMEDY-EFFICACY-30D: Autonomy gap: fleet remedies are not moving their metrics";
const OLD_ACTION = "Pillar autonomy. Under half of the metric-trigger remedies fired 7-30 days ago brought their metric back. Run: SELECT s.metric_key, s.val, s.threshold, t.action FROM analytics_action_log a JOIN v_metric_trigger_state s ON s.id = a.trigger_id JOIN analytics_metric_triggers t ON t.id = s.id WHERE s.hit = 1 AND a.fired_at < datetime('now', '-7 days'). For each, the remedy did not work: write a different, concrete lever into analytics_metric_triggers.action (with a code-task if it needs code), or correct a wrong target with evidence. Definition of done: the metric is back inside its threshold in metric_registry (or analytics_dash_meta); record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).";
const OLD_FORMULA = "mean over (a) analytics_action_log firings 7-30 days old (dispatched or deduped): 1 if their trigger is no longer hit now (v_metric_trigger_state.hit = 0), 0 if it still is, and (b) PERFORMANCE-LOOP-1 lever experiments decided in the last 30 days: 1 if kept (the metric improved beyond noise), 0 if reverted; n/a when there are none";
const PROBE_STANDIN = "SELECT '1' AS expected, '0' AS observed";

// ---- the minimum live schema (column lists and trigger texts as read from qnfo-audit sqlite_master on 2026-10-19)
const SCHEMA = `
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE fleet_tasks_canonical (id TEXT PRIMARY KEY, definition TEXT NOT NULL, repo_path TEXT, exported_at TEXT DEFAULT (datetime('now')));
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE metric_authorship (metric TEXT PRIMARY KEY, formula TEXT, authored_by TEXT NOT NULL, authored_at TEXT NOT NULL, probation_until TEXT NOT NULL, graduation TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'probation' CHECK (status IN ('probation', 'graduated', 'retired')), graduated_at TEXT);
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE analytics_action_log(id INTEGER PRIMARY KEY AUTOINCREMENT, trigger_id INTEGER, fired_at TEXT DEFAULT (datetime('now')), metric_value REAL, action TEXT, queue_target TEXT, status TEXT DEFAULT 'fired', notes TEXT);
CREATE TABLE v_metric_trigger_state (id INTEGER PRIMARY KEY, metric_key TEXT, title TEXT, operator TEXT, threshold REAL, owner TEXT, queue_target TEXT, priority INTEGER, val REAL, hit INTEGER);
CREATE TABLE perf_experiments (id INTEGER PRIMARY KEY AUTOINCREMENT, decision TEXT, decided_at TEXT);
CREATE TABLE cmd_log (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, status TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER metric_registry_cadence_canonical_ins BEFORE INSERT ON metric_registry FOR EACH ROW WHEN NEW.refresh_cadence IS NOT NULL AND trim(NEW.refresh_cadence) <> '' AND ( instr(trim(NEW.refresh_cadence),' ') > 0 OR NOT ( lower(trim(NEW.refresh_cadence)) IN ('hourly','daily','weekly','monthly') OR trim(NEW.refresh_cadence) GLOB '*/[0-9]*' OR trim(NEW.refresh_cadence) GLOB '[0-9]*m' OR trim(NEW.refresh_cadence) GLOB '[0-9]*h' ) ) BEGIN SELECT RAISE(ABORT,'METRIC-CADENCE-CANONICAL-1'); END;
CREATE TRIGGER metric_registry_cadence_canonical_upd BEFORE UPDATE ON metric_registry FOR EACH ROW WHEN NEW.refresh_cadence IS NOT NULL AND trim(NEW.refresh_cadence) <> '' AND ( instr(trim(NEW.refresh_cadence),' ') > 0 OR NOT ( lower(trim(NEW.refresh_cadence)) IN ('hourly','daily','weekly','monthly') OR trim(NEW.refresh_cadence) GLOB '*/[0-9]*' OR trim(NEW.refresh_cadence) GLOB '[0-9]*m' OR trim(NEW.refresh_cadence) GLOB '[0-9]*h' ) ) BEGIN SELECT RAISE(ABORT,'METRIC-CADENCE-CANONICAL-1'); END;
CREATE TRIGGER metric_registry_source_required_ins BEFORE INSERT ON metric_registry FOR EACH ROW WHEN NEW.source_of_truth IS NULL OR trim(NEW.source_of_truth)='' OR NEW.disposition_actor IS NULL OR trim(NEW.disposition_actor)='' OR NEW.refresh_cadence IS NULL OR trim(NEW.refresh_cadence)='' BEGIN SELECT RAISE(ABORT,'METRIC-INTEGRITY-1'); END;
CREATE TRIGGER metric_authorship_birth AFTER INSERT ON metric_registry
BEGIN
  INSERT OR IGNORE INTO metric_authorship (metric, formula, authored_by, authored_at, probation_until, graduation, status)
  VALUES (NEW.metric, NEW.formula, COALESCE(NEW.owner, 'unknown'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+7 days'),
    'a value at a refresh after probation_until, with its analytics_metric_triggers row or a named exemption', 'probation');
END;
CREATE TRIGGER remediation_probe_edit_rerun AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_probe IS NOT OLD.verify_probe OR NEW.verify_transport IS NOT OLD.verify_transport
BEGIN
  UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = NEW.class;
END;
CREATE TRIGGER remediation_probe_semicolon_ins AFTER INSERT ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END;
CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END;
CREATE TRIGGER issue_close_evidence_required
BEFORE UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix')
BEGIN
  SELECT RAISE(ABORT,'close-without-evidence')
    WHERE NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '');
  SELECT RAISE(ABORT,'close-while-contract-fails')
    WHERE NEW.status IN ('closed','resolved')
      AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id
                    AND c.status IN ('active','holding')
                    AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error','probe-not-machine-executable','probe-same-account-host'));
END;
CREATE TRIGGER agent_issues_superseded_contracts_upd AFTER UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed', 'resolved') AND COALESCE(OLD.status, '') NOT IN ('closed', 'resolved')
  AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id
              AND (lower(substr(COALESCE(t.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(t.close_evidence, ''), 1, 4)) = 'moot'))
BEGIN
  UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now')
  WHERE issue_id = NEW.id AND status IN ('active', 'holding', 'needs-machine-probe', 'probe-review-refused');
END;
CREATE TRIGGER issue_lifecycle_au AFTER UPDATE OF status ON agent_issues
WHEN COALESCE(OLD.status, '') <> COALESCE(NEW.status, '')
BEGIN
  INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence)
  VALUES (NEW.id, CASE WHEN NEW.status IN ('closed', 'resolved', 'wontfix') THEN 'dispositioned' ELSE 'reopened' END, OLD.status, NEW.status,
    CASE WHEN EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '') THEN 1 ELSE 0 END);
END;
CREATE TRIGGER agent_issues_reopen_open_twin_guard
BEFORE UPDATE OF status ON agent_issues
WHEN NEW.status = 'open'
  AND COALESCE(OLD.status, '') <> 'open'
  AND EXISTS (SELECT 1 FROM agent_issues o WHERE o.id <> NEW.id AND o.status = 'open' AND lower(trim(o.title)) = lower(trim(NEW.title)))
BEGIN
  SELECT RAISE(IGNORE);
END;
CREATE TRIGGER triage_close_sync_issue_upd AFTER UPDATE OF triage_state ON issue_triage WHEN NEW.triage_state IN ('closed','closed-refuted','wontfix') BEGIN UPDATE agent_issues SET status = CASE WHEN NEW.triage_state='wontfix' THEN 'wontfix' ELSE 'closed' END, updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status='open'; END;
CREATE TRIGGER triage_superseded_contracts_upd AFTER UPDATE OF triage_state, close_evidence ON issue_triage
WHEN NEW.triage_state = 'closed' AND (lower(substr(COALESCE(NEW.close_evidence, ''), 1, 10)) = 'superseded' OR lower(substr(COALESCE(NEW.close_evidence, ''), 1, 4)) = 'moot')
BEGIN
  UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now')
  WHERE issue_id = NEW.issue_id AND status IN ('active', 'holding', 'needs-machine-probe', 'probe-review-refused');
END;`;

// the live state this migration meets (opts vary the cases)
function build(opts = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, enabled, updated_at) VALUES ('metric-refresh', 'METRIC-REFRESH-1', 'workflow', ?, 1, 1, '2026-10-06T11:48:40Z')").run(opts.definition || PRE);
  db.prepare("INSERT INTO fleet_tasks_canonical (id, definition, repo_path) VALUES ('metric-refresh', ?, NULL)").run(opts.canonical || opts.definition || PRE);
  const reg = db.prepare("INSERT INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES (?, 'system', ?, ?, 'qnfo-audit.analytics_action_log + v_metric_trigger_state + perf_experiments', 'n/a', ?, 'qnfo-fleet-control', 'its own trigger', 'hourly', '< 0.5', '< 0.2', ?, '2026-10-19T11:01:03Z', 'MEASURED', 'computed')");
  reg.run("remedy_efficacy_30d", "lagging", OLD_FORMULA, ">= 0.5", "0.22");
  reg.run("metrics_in_breach", "lagging", "x", "0 (falling)", "52");
  db.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes) VALUES (371, 'remedy_efficacy_30d', 'Autonomy gap: fleet remedies are not moving their metrics', 'registry', 'lt', 0.5, 8, ?, 'qnfo-fleet-control', 'agent_issues', 2, 1, 'METRIC-CLOSED-LOOP-1 2026-10-02')").run(OLD_ACTION);
  const iss = db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, linked_session, created_at, updated_at) VALUES (?, ?, 'METRIC-TRIGGER #371 remedy_efficacy_30d', 'qnfo-fleet-control', 'reliability', ?, ?, ?, 1792000000000, 1792000000000)");
  iss.run(2244, TITLE, "high", opts.s2244 || "open", "session_01QpQv19uh1padRwZ3u1r766");
  iss.run(2665, opts.t2665 || TITLE, "medium", opts.s2665 || "monitoring", null);
  const tri = db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, triaged_at, remediation, close_evidence) VALUES (?, 'AUTOTRIAGE-2', ?, 'qnfo-fleet-control', '2026-10-15 18:01:01', '2026-10-15 18:01:01', ?, ?)");
  tri.run(2244, "triaged", "RESOLVE-ALL-OPEN-1 2026-10-19", "remediation_verifications#6919 pass=1 class=issue-2244 transport=d1-query verified_at=2026-10-09 17:07:27");
  tri.run(2665, opts.t2665state || "triaged", null, opts.e2665 || null);
  const rc = db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, last_verdict, module, next_due_at, attempts) VALUES (?, ?, 'born with the issue', 'x', ?, 'd1-query', 3, 'qnfo-fleet-control', 1, ?, ?, 'probe-template-v1h', '2026-10-18 12:18:30', 4)");
  rc.run("issue-2244", 2244, PROBE_STANDIN, "superseded", "superseded:contract-on-closed-issue (issue already closed/resolved/wontfix; no doer, no definition of done)");
  rc.run("issue-2665", 2665, PROBE_STANDIN, opts.c2665 || "monitoring", "monitoring:metric-condition (the probe reads a live metric; the card closes when the metric converges, not by retrying)");
  return db;
}

// the headline fixture: one hit trigger re-logged 60 times plus three single firings of cleared triggers, and noise that must not vote
function seedFirings(db) {
  const st = db.prepare("INSERT INTO v_metric_trigger_state (id, metric_key, operator, threshold, owner, val, hit) VALUES (?, ?, 'gt', 0, ?, 1, ?)");
  const fire1 = db.prepare("INSERT INTO analytics_action_log (trigger_id, fired_at, status) VALUES (?, datetime('now', ?, ?), ?)");
  const fire = (id, m1, status, m2) => fire1.run(id, m1, m2 || "+0 hours", status);
  st.run(371, "remedy_efficacy_30d", "qnfo-fleet-control", 1);
  st.run(3059, "stuck_items_over_sla", "qnfo-fleet-control", 1);
  for (let i = 0; i < 60; i++) fire(3059, "-8 days", "deduped", "-" + i + " hours");
  for (const id of [11, 12, 13]) { st.run(id, "cleared_" + id, "owner-" + id, 0); fire(id, "-10 days", "dispatched"); }
  st.run(14, "recent_only", "qnfo-ops", 1); fire(14, "-3 days", "deduped");            // inside the 7-day grace: no vote
  st.run(15, "too_old", "qnfo-ops", 0); fire(15, "-40 days", "dispatched");              // older than 30 days: no vote
  st.run(16, "never_dispatched", "qnfo-ops", 1); fire(16, "-10 days", "fired");          // status not dispatched/deduped: no vote
}
const stepSql = (db, i) => JSON.parse(db.prepare("SELECT definition FROM fleet_tasks WHERE id = 'metric-refresh'").get().definition).steps[i].sql;
const val = (db, m) => db.prepare("SELECT last_value FROM metric_registry WHERE metric = ?").get(m)?.last_value;
const apply = (db) => db.exec(sql);
// the runnable query the replaced lever on trigger 371 carries ("Run: SELECT ... ORDER BY last_fired. Each row ...")
const leverQuery = (db) => /Run: (SELECT .* ORDER BY last_fired)\. Each row/s.exec(db.prepare("SELECT action FROM analytics_metric_triggers WHERE id = 371").get().action)?.[1];
// one more voter in the fixture: a trigger with its current state (hit 0 = cleared) and firings given as [offset, status] pairs
function addTrigger(db, id, hit, firings, owner) {
  db.prepare("INSERT INTO v_metric_trigger_state (id, metric_key, operator, threshold, owner, val, hit) VALUES (?, ?, 'gt', 0, ?, ?, ?)").run(id, "k_" + id, owner || "owner-" + id, hit, hit);
  const f = db.prepare("INSERT INTO analytics_action_log (trigger_id, fired_at, status) VALUES (?, datetime('now', ?), ?)");
  for (const [off, status] of firings) f.run(id, off, status);
}
function sect(f) { try { f(); } catch (e) { fail++; console.log("FAIL a section threw :: " + String(e && e.message).slice(0, 200) + " @ " + String(e && e.stack).split("\n").find((l) => l.includes(".test.mjs")) ); } }

// ---- A. the defect on the pre-change state: 60 re-logs outvote three cleared remedies
sect(() => {
  const db = build(); seedFirings(db);
  const step3 = stepSql(db, 3);
  ok(step3.includes("'remedy_efficacy_30d' THEN COALESCE(CAST((SELECT ROUND(AVG(o), 2)"), "the fixture is the live step 3");
  ok(!PRE.includes(MARK), "the pre-change definition carries no marker");
  eq(PRE.length, 11306, "the fixture is the 11306-character live definition");
  eq(PRE.split(ANCHOR).length - 1, 1, "the anchor occurs exactly once in the live definition");
  db.exec(step3);
  eq(val(db, "remedy_efficacy_30d"), "0.05", "BEFORE: 3 cleared remedies and 1 standing breach read 0.05 because the breach is re-logged 60 times (the defect)");
  const probe = "SELECT '1' AS expected, CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric='remedy_efficacy_30d') AS REAL) >= 0.5 AND instr((SELECT definition FROM fleet_tasks WHERE id='metric-refresh'),'REMEDY-EFFICACY-PER-TRIGGER-1')>0 THEN '1' ELSE '0' END AS observed";
  eq(db.prepare(probe).get().observed, "0", "BEFORE: the closing probe reads 0");
});

// ---- B. the apply
sect(() => {
  const db = build(); seedFirings(db);
  apply(db);
  const t = db.prepare("SELECT version, definition, updated_at FROM fleet_tasks WHERE id = 'metric-refresh'").get();
  ok(t.definition.includes(MARK), "AFTER: the definition carries the marker", t.version);
  eq(t.version, 2, "AFTER: version 1 -> 2");
  const before = JSON.parse(PRE), after = JSON.parse(t.definition);
  eq(after.steps.length, 11, "AFTER: the new step is appended (11 steps)");
  let others = true;
  for (let i = 0; i < 10; i++) if (i !== 3 && JSON.stringify(after.steps[i]) !== JSON.stringify(before.steps[i])) others = false;
  ok(others, "AFTER: the nine other original steps are untouched");
  // step 3 differs only by an insertion between the two branches
  const b3 = before.steps[3].sql, a3 = after.steps[3].sql, cut = b3.indexOf(ANCHOR) + "'deduped')".length;
  const head = b3.slice(0, cut), tail = b3.slice(cut);
  ok(a3.startsWith(head) && a3.endsWith(tail) && a3.length > b3.length, "AFTER: step 3 changed only by an insertion before ' UNION ALL SELECT CASE e.decision'", { cut });
  const ins = a3.slice(head.length, a3.length - tail.length);
  ok(ins.includes("ORDER BY b.fired_at DESC, b.id DESC LIMIT 1") && ins.includes(MARK) && ins.includes("b.trigger_id = a.trigger_id"), "AFTER: the insertion is the latest-firing-per-trigger predicate with the marker", ins);
  // byte exactness: textual replace of the old definition + the appended step, nothing else moved
  const textual = PRE.replace(ANCHOR, () => head.slice(head.lastIndexOf("'deduped')")) + ins + " UNION ALL SELECT CASE e.decision");
  eq(t.definition, textual.slice(0, -2) + "," + JSON.stringify(after.steps[10]) + "]}", "AFTER: byte-exact (old text with the insertion, the new step last)");
  eq(after.steps[10].type, "sql", "AFTER: the new step has a type");
  eq(after.steps[10].db, "AUDIT", "AFTER: the new step has a db");
  ok(!/\bLIKE\b|\bGLOB\b/.test(after.steps[10].sql + ins), "no LIKE or GLOB pattern in the new SQL (D1 50-byte limit)");
  eq((after.steps[10].sql.match(/UNION ALL/g) || []).length, 1, "one compound operator (D1 limit is 5 terms)");
  eq(db.prepare("SELECT definition FROM fleet_tasks_canonical WHERE id = 'metric-refresh'").get().definition, t.definition, "the canonical row follows (the drift gate stays quiet)");
  eq(db.prepare("SELECT repo_path FROM fleet_tasks_canonical WHERE id = 'metric-refresh'").get().repo_path, "migrations/2026-10-19-remedy-efficacy-per-trigger.sql", "the canonical row names its source file");
  eq(db.prepare("SELECT definition FROM bak_20261019_remedy_eff_task").get().definition, PRE, "the backup holds the live definition of 2026-10-19");

  // the new step 3 and the new step 10 on the headline fixture
  db.exec(stepSql(db, 3));
  eq(val(db, "remedy_efficacy_30d"), "0.75", "AFTER: one vote per trigger reads 0.75 (3 of 4)");
  db.exec(stepSql(db, 10));
  eq(val(db, "remedy_efficacy_firing_30d"), "0.05", "AFTER: the continuity step keeps the per-firing figure (0.05)");
  eq(val(db, "metrics_in_breach"), "4", "the other branches of step 3 still run (4 hit triggers: 371, 3059, 14, 16)");

  // the registered continuity metric
  const m = db.prepare("SELECT * FROM metric_registry WHERE metric = 'remedy_efficacy_firing_30d'").get();
  ok(m && m.kind === "lagging" && m.refresh_cadence === "hourly" && m.refresh_class === "computed" && m.state === "MEASURED" && m.owner === "qnfo-fleet-control", "the continuity metric is registered with the live columns", m);
  ok(/^n\/a/.test(m.target), "its target starts with n/a (the improvement loop reads no direction from it)", m.target);
  ok(db.prepare("SELECT status FROM metric_authorship WHERE metric = 'remedy_efficacy_firing_30d'").get()?.status === "probation", "authorship row born by the registry trigger");
  eq(db.prepare("SELECT COUNT(*) AS n FROM analytics_metric_triggers WHERE metric_key = 'remedy_efficacy_firing_30d'").get().n, 0, "no trigger on the continuity metric (the named exemption)");
  ok(/EXEMPT from a metric trigger/.test(realSql), "the exemption is named in the migration");
  ok(db.prepare("SELECT formula FROM metric_registry WHERE metric = 'remedy_efficacy_30d'").get().formula.includes(MARK), "the formula text of remedy_efficacy_30d describes the per-trigger vote");
  // its first value is computed at apply time with the old formula (the apply ran on the seeded firings before the step ran)
  const m2 = build(); seedFirings(m2); apply(m2);
  eq(m2.prepare("SELECT last_value FROM metric_registry WHERE metric = 'remedy_efficacy_firing_30d'").get().last_value, "0.05", "its first value is the old per-firing figure");

  // the lever on trigger 371
  const tr = db.prepare("SELECT * FROM analytics_metric_triggers WHERE id = 371").get();
  ok(tr.action !== OLD_ACTION && tr.action.includes(MARK), "the lever on trigger 371 is replaced (not repeated)");
  ok(tr.operator === "lt" && tr.threshold === 0.5 && tr.owner === "qnfo-fleet-control" && tr.enabled === 1 && tr.cooldown_hours === 2, "the trigger itself (operator, threshold, owner, cooldown) is untouched");
  ok(tr.action.includes("Definition of done") && tr.action.includes("owner") && tr.action.includes("code-task line"), "the lever keeps its definition of done and names owner and code-task");
  ok(!/code-task: repo=/.test(tr.action) && !/claude\.ai/i.test(tr.action), "the lever carries no code-task line of its own (the code loop would act on it) and no link to the claude host");
  ok(tr.notes.includes(MARK) && tr.notes.startsWith("METRIC-CLOSED-LOOP-1 2026-10-02"), "the notes keep their history and add the change");
  const q = leverQuery(db);
  ok(!!q, "the lever carries a runnable query");
  const rows = db.prepare(q).all();
  const ids = rows.map((r) => r.id).sort((a, b) => a - b);
  eq(JSON.stringify(ids), JSON.stringify([3059]), "the query lists the still-hit remedy behind the failing vote (3059) and none of the cleared, recent, old or undispatched ones");
  ok(rows[0].owner === "qnfo-fleet-control" && rows[0].firings === 60 && /^\d{4}-\d{2}-\d{2} /.test(rows[0].last_fired), "each row carries owner, last firing and firings", rows[0]);
});

// ---- C. other voters: two firings of one cleared trigger are one vote; experiments still vote
sect(() => {
  const db = build(); seedFirings(db); apply(db);
  db.prepare("INSERT INTO v_metric_trigger_state (id, metric_key, operator, threshold, owner, val, hit) VALUES (17, 'cleared_17', 'gt', 0, 'o17', 0, 0)").run();
  db.prepare("INSERT INTO analytics_action_log (trigger_id, fired_at, status) VALUES (17, datetime('now', '-20 days'), 'dispatched'), (17, datetime('now', '-9 days'), 'deduped')").run();
  db.exec(stepSql(db, 3)); db.exec(stepSql(db, 10));
  eq(val(db, "remedy_efficacy_30d"), "0.8", "a trigger fired twice cleared counts once: 4 of 5 triggers");
  eq(val(db, "remedy_efficacy_firing_30d"), "0.08", "the per-firing figure counts both firings: 5 of 65");
  // a trigger whose latest firing in the window was long ago and that fired again inside the grace still votes once
  db.prepare("INSERT INTO analytics_action_log (trigger_id, fired_at, status) VALUES (3059, datetime('now', '-1 hours'), 'deduped')").run();
  db.exec(stepSql(db, 3));
  eq(val(db, "remedy_efficacy_30d"), "0.8", "a firing inside the 7-day grace changes nothing");
  db.prepare("INSERT INTO perf_experiments (decision, decided_at) VALUES ('kept', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 days')), ('reverted', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 days')), ('kept', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-45 days')), ('pending', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 days'))").run();
  db.exec(stepSql(db, 3)); db.exec(stepSql(db, 10));
  eq(val(db, "remedy_efficacy_30d"), "0.71", "decided experiments in 30 days vote beside the triggers: (4 + 1) of (5 + 2)");
  eq(val(db, "remedy_efficacy_firing_30d"), "0.09", "and in the per-firing figure: (5 + 1) of (65 + 2) = 0.0896");
  // no firings and no experiments: n/a, not an error
  const e = build(); apply(e); e.exec(stepSql(e, 3)); e.exec(stepSql(e, 10));
  eq(val(e, "remedy_efficacy_30d"), "n/a", "no firings and no experiments read n/a");
  eq(val(e, "remedy_efficacy_firing_30d"), "n/a", "the continuity metric reads n/a too");
});

// ---- D. the closing probe of issue 2244 and the detector
sect(() => {
  const db = build(); seedFirings(db);
  const c0 = db.prepare("SELECT status, last_verdict, attempts FROM remediation_contracts WHERE class = 'issue-2244'").get();
  eq(c0.status, "superseded", "BEFORE: the contract of the reopened issue 2244 was left superseded (never probed)");
  apply(db);
  const c = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'issue-2244'").get();
  ok(c.status === "active" && c.last_verdict === null && c.attempts === 0 && c.verify_transport === "d1-query", "AFTER: the contract is active again with a d1-query probe", c);
  ok(!c.verify_probe.includes(";"), "the probe holds no semicolon (the live semicolon trigger would rewrite it)");
  eq(c.verify_probe, "SELECT '1' AS expected, CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric='remedy_efficacy_30d') AS REAL) >= 0.5 AND instr((SELECT definition FROM fleet_tasks WHERE id='metric-refresh'),'REMEDY-EFFICACY-PER-TRIGGER-1')>0 THEN '1' ELSE '0' END AS observed", "the probe is the one the issue's plan names");
  eq(db.prepare(c.verify_probe).get().observed, "0", "right after the apply, before the first refresh, the value is still 0.22: the probe reads 0");
  db.exec(stepSql(db, 3));
  const r = db.prepare(c.verify_probe).get();
  ok(r.expected === "1" && r.observed === "1", "after the refresh the value is 0.75 and the marker is live: the probe reads 1", r);
  db.prepare("UPDATE metric_registry SET last_value = '0.3' WHERE metric = 'remedy_efficacy_30d'").run();
  eq(db.prepare(c.verify_probe).get().observed, "0", "a value under 0.5 reads 0");
  db.prepare("UPDATE metric_registry SET last_value = '0.75' WHERE metric = 'remedy_efficacy_30d'").run();
  db.prepare("UPDATE fleet_tasks SET definition = replace(definition, 'REMEDY-EFFICACY-PER-TRIGGER-1', 'ZZ_MARK_REMOVED') WHERE id = 'metric-refresh'").run();
  eq(db.prepare(c.verify_probe).get().observed, "0", "a definition that lost the marker reads 0 even with the value at the line");
  db.prepare("UPDATE fleet_tasks SET definition = replace(definition, 'ZZ_MARK_REMOVED', 'REMEDY-EFFICACY-PER-TRIGGER-1') WHERE id = 'metric-refresh'").run();
  eq(db.prepare(c.verify_probe).get().observed, "1", "restoring the marker restores the reading");
  // the failure mode and its detector
  const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'remedy-efficacy-counts-dedupes'").get();
  ok(fm && fm.issue_id === 2244 && fm.probe_class === "fm-remedy-efficacy-counts-dedupes" && fm.first_seen === "2026-10-19" && fm.root_cause && fm.remediation && fm.detector, "the failure mode is recorded with root cause and remediation");
  const d = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-remedy-efficacy-counts-dedupes'").get();
  ok(d && d.status === "active" && d.verify_transport === "d1-query" && d.issue_id === null && d.expected_cadence_h === 1, "the fm- detector contract is active on d1-query", d);
  let dr = db.prepare(d.verify_probe).get();
  ok(dr.expected === "1" && dr.observed === "1", "the detector passes with the marker and the predicate", dr);
  db.prepare("UPDATE fleet_tasks SET definition = replace(definition, 'b.trigger_id = a.trigger_id', 'b.trigger_id = b.trigger_id') WHERE id = 'metric-refresh'").run();
  eq(db.prepare(d.verify_probe).get().observed, "0", "the detector fails when the per-trigger predicate is gone");
  db.prepare("UPDATE fleet_tasks SET definition = ? WHERE id = 'metric-refresh'").run(PRE);
  eq(db.prepare(d.verify_probe).get().observed, "0", "the detector fails on the pre-change definition");
});

// ---- E. drift: a definition the rewrite cannot take makes the file fail loudly, before anything that depends on it
for (const [name, mutate] of [
  ["anchor absent", (d) => d.replace(ANCHOR, "'deduped') UNION ALL SELECT 1 AS o, CASE e.decision")],
  ["anchor twice", (d) => { const o = JSON.parse(d); o.steps.push({ type: "sql", db: "AUDIT", sql: "SELECT 1 FROM x WHERE a IN ('dispatched', " + ANCHOR + " ) " }); return JSON.stringify(o); }],
  ["definition not JSON", (d) => d.slice(0, -3)],
]) {
  const drifted = mutate(PRE);
  const db = build({ definition: drifted }); seedFirings(db);
  let err = null;
  try { apply(db); } catch (e) { err = e; }
  ok(err && /malformed JSON/i.test(String(err.message)), "drift (" + name + "): the file fails loudly, not silently", err && err.message);
  eq(db.prepare("SELECT definition FROM fleet_tasks WHERE id = 'metric-refresh'").get().definition, drifted, "drift (" + name + "): the definition is untouched");
  eq(db.prepare("SELECT version FROM fleet_tasks WHERE id = 'metric-refresh'").get().version, 1, "drift (" + name + "): the version is untouched");
  eq(db.prepare("SELECT COUNT(*) AS n FROM metric_registry WHERE metric = 'remedy_efficacy_firing_30d'").get().n, 0, "drift (" + name + "): nothing that depends on the new step was registered");
  eq(db.prepare("SELECT action FROM analytics_metric_triggers WHERE id = 371").get().action, OLD_ACTION, "drift (" + name + "): the lever text is untouched");
  eq(db.prepare("SELECT status FROM agent_issues WHERE id = 2665").get().status, "monitoring", "drift (" + name + "): the twin is untouched");
  eq(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 0, "drift (" + name + "): no decision is logged for a change that did not happen");
}
// a missing row is drift too
sect(() => {
  const db = build(); db.exec("DELETE FROM fleet_tasks WHERE id = 'metric-refresh'");
  let err = null; try { apply(db); } catch (e) { err = e; }
  ok(err && /malformed JSON/i.test(String(err.message)), "a missing metric-refresh row fails the file loudly");
});
// the canonical row is left alone when it had already drifted from live (the drift gate reports that, not this file)
sect(() => {
  const db = build({ canonical: PRE + " " }); apply(db);
  eq(db.prepare("SELECT definition FROM fleet_tasks_canonical WHERE id = 'metric-refresh'").get().definition, PRE + " ", "a canonical row that differs from the pre-change live text is not overwritten (the drift gate reports it)");
});

// ---- F. the monitoring twin 2665 is not this file's business: migrations/2026-10-19-metric-twin-supersede.sql supersedes every METRIC-TRIGGER
// twin (2665 among them), so this file must leave it, its triage row, its contract and its lifecycle alone (no double handling)
sect(() => {
  const db = build(); seedFirings(db); apply(db);
  const i = db.prepare("SELECT status, close_channel FROM agent_issues WHERE id = 2665").get();
  ok(i.status === "monitoring" && i.close_channel === null, "2665 is left alone by this file", i);
  eq(db.prepare("SELECT triage_state FROM issue_triage WHERE issue_id = 2665").get().triage_state, "triaged", "its triage row is untouched");
  eq(db.prepare("SELECT status FROM remediation_contracts WHERE class = 'issue-2665'").get().status, "monitoring", "its contract is untouched");
  eq(db.prepare("SELECT COUNT(*) AS n FROM issue_lifecycle WHERE issue_id = 2665").get().n, 0, "no lifecycle row is written for 2665");
  const s = db.prepare("SELECT status, linked_session FROM agent_issues WHERE id = 2244").get();
  ok(s.status === "open" && s.linked_session === "session_01QpQv19uh1padRwZ3u1r766", "the successor 2244 stays open and keeps its claim");
  eq(db.prepare("SELECT COUNT(*) AS n FROM agent_issues WHERE status = 'wontfix'").get().n, 0, "nothing is closed as wontfix");
  eq(db.prepare("SELECT COUNT(*) AS n FROM agent_issues").get().n, 2, "nothing is deleted");
  eq(db.prepare("SELECT close_evidence FROM issue_triage WHERE issue_id = 2244").get().close_evidence.slice(0, 20), "remediation_verifica", "the successor's triage row is untouched");
  ok(!/UPDATE agent_issues|UPDATE issue_triage/.test(sql), "the file has no statement that writes agent_issues or issue_triage");
});

// ---- G. the decision and the prediction
sect(() => {
  const db = build(); apply(db);
  const d = db.prepare("SELECT * FROM decision_log").all();
  eq(d.length, 1, "one decision_log row");
  ok(d[0].action.startsWith(MARK + ":") && d[0].capability_gain && d[0].surfaces_tested && d[0].rollback_path, "it names the change, the capability gain, the surfaces and the rollback", d[0].action.slice(0, 40));
  const p = /^(\S+) (<=|>=|<|>|=) (\d[\d.]*) within (\d+) hours?$/.exec(d[0].predicted_outcome);
  ok(p && db.prepare("SELECT 1 FROM metric_registry WHERE metric = ?").get(p[1]) && Number(p[4]) > 0, "its prediction is in the form decision_predictions_parse reads (metric, operator, value, within N hours)", d[0].predicted_outcome);
});

// ---- H. re-applying changes nothing
sect(() => {
  const db = build(); seedFirings(db); apply(db);
  const snap = () => JSON.stringify({
    t: db.prepare("SELECT definition, version FROM fleet_tasks").all(), c: db.prepare("SELECT definition FROM fleet_tasks_canonical").all(),
    m: db.prepare("SELECT metric, formula, last_value FROM metric_registry ORDER BY metric").all(), a: db.prepare("SELECT * FROM metric_authorship").all(),
    tr: db.prepare("SELECT action, notes FROM analytics_metric_triggers").all(), f: db.prepare("SELECT * FROM failure_modes").all(),
    rc: db.prepare("SELECT class, status, last_verdict, verify_probe, attempts FROM remediation_contracts ORDER BY class").all(),
    i: db.prepare("SELECT id, status, close_channel FROM agent_issues ORDER BY id").all(), tg: db.prepare("SELECT * FROM issue_triage ORDER BY issue_id").all(),
    l: db.prepare("SELECT COUNT(*) AS n FROM issue_lifecycle").get(), d: db.prepare("SELECT COUNT(*) AS n FROM decision_log").get(),
    b: db.prepare("SELECT definition, version FROM bak_20261019_remedy_eff_task").all() });
  const s1 = snap();
  apply(db);
  eq(snap(), s1, "re-applying the file changes nothing (version stays 2, one decision, one failure mode, the first backup kept)");
  eq(db.prepare("SELECT version FROM bak_20261019_remedy_eff_task").get().version, 1, "the backup still holds version 1");
});

// ---- I. the Rollback header restores every row the file touches
sect(() => {
  const db = build(); seedFirings(db);
  const snap = () => JSON.stringify({
    t: db.prepare("SELECT definition, version FROM fleet_tasks").all(), c: db.prepare("SELECT definition FROM fleet_tasks_canonical").all(),
    m: db.prepare("SELECT metric, formula FROM metric_registry ORDER BY metric").all(), a: db.prepare("SELECT metric FROM metric_authorship").all(),
    tr: db.prepare("SELECT action, notes FROM analytics_metric_triggers").all(), f: db.prepare("SELECT fm_key FROM failure_modes").all(),
    rc: db.prepare("SELECT class, status, last_verdict, verify_probe, attempts FROM remediation_contracts ORDER BY class").all(),
    i: db.prepare("SELECT id, status, close_channel FROM agent_issues ORDER BY id").all(),
    tg: db.prepare("SELECT issue_id, triage_state, close_evidence FROM issue_triage ORDER BY issue_id").all() });
  const before = snap();
  apply(db);
  ok(snap() !== before, "the apply changed the state");
  const rb = /^-- Rollback: (.*)$/m.exec(realSql)[1];
  ok(!rb.includes("\n") && rb.split(";").length > 8, "the Rollback header is one line of SQL");
  db.exec(rb);
  eq(snap(), before, "the Rollback line restores the definition, version, canonical row, formula, lever, contracts, the twin and its triage row, and drops the new metric, failure mode and detector");
  eq(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "the decision_log row stays (append-only)");
  apply(db);
  ok(db.prepare("SELECT definition FROM fleet_tasks").get().definition.includes(MARK), "the file applies again after a rollback");
});

// ---- K. the latest dispatched/deduped firing in the window decides, whatever status follows it. Live 2026-10-19 (SELECT only): the
// 30-day action log also holds dispatch-failed, recovered, recovering, relapsed and reopened rows, and 26 triggers have a dispatched or
// deduped firing in the 7-30 day window but another status as their latest in-window firing. The real predicate read 0.55; a predicate
// without the inner status filter (the inner SELECT picks the newest row of any status, which is not a dispatched/deduped row, so the
// trigger loses its vote) read 0.44, below the 0.5 line of trigger 371.
const LATER = ["recovered", "recovering", "relapsed", "dispatch-failed", "reopened", "fired"];
sect(() => {
  const one = (hit, first, later) => { const db = build(); apply(db); addTrigger(db, 50, hit, [["-10 days", first], ["-9 days", later]]); db.exec(stepSql(db, 3)); return val(db, "remedy_efficacy_30d"); };
  for (const first of ["dispatched", "deduped"]) for (const later of LATER) {
    eq(one(0, first, later), "1.0", "a CLEARED trigger with a " + first + " firing at -10 days and a later " + later + " firing at -9 days votes 1");
    eq(one(1, first, later), "0.0", "a STILL-HIT trigger with a " + first + " firing at -10 days and a later " + later + " firing at -9 days votes 0");
  }
  // one database, live-shaped: five voters with a later non-voting status, one trigger with no dispatched/deduped firing at all
  const db = build(); apply(db);
  addTrigger(db, 61, 0, [["-10 days", "dispatched"], ["-9 days", "recovered"]]);
  addTrigger(db, 62, 0, [["-12 days", "deduped"], ["-11 days", "relapsed"]]);
  addTrigger(db, 63, 0, [["-10 days", "deduped"], ["-9 days", "dispatch-failed"], ["-8 days", "reopened"]]);
  addTrigger(db, 64, 1, [["-10 days", "dispatched"], ["-9 days", "recovering"]]);
  addTrigger(db, 65, 1, [["-11 days", "deduped"], ["-10 days", "deduped"], ["-10 days", "deduped"], ["-9 days", "relapsed"]]);
  addTrigger(db, 66, 1, [["-10 days", "recovered"]]);
  db.exec(stepSql(db, 3));
  eq(val(db, "remedy_efficacy_30d"), "0.6", "live-shaped: 3 cleared and 2 still-hit voters count once each (3 of 5) and the trigger with only a recovered firing does not vote");
});

// ---- L. the lever query on trigger 371 lists EVERY still-hit remedy, one row per trigger, oldest first (without GROUP BY it collapses to
// one row; live 2026-10-19, SELECT only: 25 rows with GROUP BY, 1 row without)
sect(() => {
  const db = build(); seedFirings(db); apply(db);
  addTrigger(db, 3060, 1, [["-20 days", "deduped"], ["-19 days", "deduped"]], "qnfo-ops");
  addTrigger(db, 3072, 1, [["-16 days", "dispatched"], ["-15 days", "deduped"], ["-14 days", "deduped"], ["-13 days", "deduped"], ["-12 days", "deduped"]], "qnfo-cloud-ops");
  const rows = db.prepare(leverQuery(db)).all();
  eq(JSON.stringify(rows.map((r) => r.id)), JSON.stringify([3060, 3072, 3059]), "the lever query lists three still-hit remedies, one row each, oldest last firing first (3060, 3072, 3059)");
  eq(JSON.stringify(rows.map((r) => r.firings)), JSON.stringify([2, 5, 60]), "each row counts its own firings in the window (2, 5, 60)");
  eq(JSON.stringify(rows.map((r) => r.owner)), JSON.stringify(["qnfo-ops", "qnfo-cloud-ops", "qnfo-fleet-control"]), "each row carries its own owner");
  const maxf = db.prepare("SELECT MAX(fired_at) AS m FROM analytics_action_log WHERE trigger_id = ?");
  ok(rows.every((r) => r.last_fired === maxf.get(r.id).m), "each row's last_fired is that trigger's own newest firing", rows.map((r) => r.last_fired));
  ok(rows[0].last_fired < rows[1].last_fired && rows[1].last_fired < rows[2].last_fired, "the rows run oldest last firing first", rows.map((r) => r.last_fired));
  eq(JSON.stringify(rows.map((r) => r.metric_key)), JSON.stringify(["k_3060", "k_3072", "stuck_items_over_sla"]), "each row names its metric");
});

// ---- M. the continuity step (remedy_efficacy_firing_30d) keeps the OLD per-firing figure exactly: its window, its status filter and its
// first value at apply time. The fixture is built so that each filter, removed, moves the 2-decimal figure (0.60 filtered; 0.82 without
// the status filter; 0.75 with a 3-day grace; 0.71 without the 30-day bound), which the headline fixture's rounding hid.
function seedContinuity(db) {
  addTrigger(db, 21, 0, [["-10 days", "dispatched"], ["-9 days", "deduped"], ["-8 days", "deduped"]]);            // cleared: 3 firings, 3 yes
  addTrigger(db, 22, 1, [["-12 days", "dispatched"], ["-11 days", "deduped"]]);                                   // still hit: 2 firings, 2 no
  addTrigger(db, 23, 0, [["-10 days", "recovered"], ["-10 days", "recovered"], ["-10 days", "recovered"], ["-10 days", "recovered"], ["-9 days", "relapsed"], ["-9 days", "relapsed"]]); // cleared, other statuses: no vote
  addTrigger(db, 24, 0, [["-5 days", "deduped"], ["-5 days", "deduped"], ["-5 days", "deduped"]]);                // cleared, inside the 7-day grace: no vote
  addTrigger(db, 25, 0, [["-40 days", "dispatched"], ["-40 days", "dispatched"]]);                                // cleared, older than 30 days: no vote
}
sect(() => {
  const old = build(); seedContinuity(old); old.exec(stepSql(old, 3));
  eq(val(old, "remedy_efficacy_30d"), "0.6", "the PRE-CHANGE step 3 reads 0.6 on this fixture (3 of 5 firings): the figure the continuity metric must keep");
  const db = build(); seedContinuity(db); apply(db);
  eq(val(db, "remedy_efficacy_firing_30d"), "0.6", "the first value written at apply time is the per-firing figure (0.6)");
  db.prepare("UPDATE metric_registry SET last_value = 'stale' WHERE metric = 'remedy_efficacy_firing_30d'").run();
  db.exec(stepSql(db, 10));
  eq(val(db, "remedy_efficacy_firing_30d"), "0.6", "the appended step reads the same per-firing figure as the pre-change step 3 (window 7-30 days, dispatched/deduped only)");
  db.exec(stepSql(db, 3));
  eq(val(db, "remedy_efficacy_30d"), "0.5", "remedy_efficacy_30d on the same data counts the two voting triggers once (1 of 2)");
  eq(val(db, "remedy_efficacy_firing_30d"), "0.6", "step 3 does not touch the continuity metric");
});

// ---- N. guard of step 4b: the successor's contract is left alone when its issue is not open or monitoring
sect(() => {
  // the contract of 2244 is re-armed only while 2244 is open or monitoring
  for (const st of ["closed", "resolved", "wontfix"]) {
    const d3 = build({ s2244: st }); apply(d3);
    const c = d3.prepare("SELECT status, verify_probe, verify_transport, last_verdict, attempts, next_due_at FROM remediation_contracts WHERE class = 'issue-2244'").get();
    ok(c.status === "superseded" && c.verify_probe === PROBE_STANDIN && c.verify_transport === "d1-query" && /^superseded:contract-on-closed-issue/.test(c.last_verdict) && c.attempts === 4 && c.next_due_at === "2026-10-18 12:18:30",
      "the contract of 2244 is not re-armed when 2244 is " + st, c);
    ok(d3.prepare("SELECT definition FROM fleet_tasks WHERE id = 'metric-refresh'").get().definition.includes(MARK), "the rest of the file still applies when 2244 is " + st);
  }
  const d4 = build({ s2244: "monitoring" }); apply(d4);
  const c4 = d4.prepare("SELECT status, attempts, last_verdict FROM remediation_contracts WHERE class = 'issue-2244'").get();
  ok(c4.status === "active" && c4.attempts === 0 && c4.last_verdict === null, "the contract of 2244 is re-armed while 2244 is monitoring", c4);
});

// ---- J. file hygiene and the runner's own check
sect(() => {
  ok(!/claude\.ai/i.test(realSql) && !/claude\.ai/i.test(readFileSync(fileURLToPath(import.meta.url), "utf8")), "no link to the claude host in the migration or the suite");
  ok(!/#\d/.test(realSql), "no bare number reference with a hash in the migration");
  ok(!/\[skip ci\]|\[ci skip\]|\[no ci\]|\[skip actions\]|\[actions skip\]|skip-checks:/i.test(realSql), "no skip-CI token text");
  ok(/^-- APPLY-BY: ci$/m.test(realSql) && /^-- DB: qnfo-audit$/m.test(realSql) && /^-- Rollback: .+/m.test(realSql), "opt-in header lines are present");
  ok(!/^\s*(DELETE\s+FROM|DROP\s)/im.test(realSql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "no DELETE or DROP statement in the body (so no BACKUP header is owed)");
  // the drift assertion's explanation reaches the operator through the file, so the file must name the position D1 will report: the
  // runner (scripts/apply_migrations.py) writes "statement N: <D1 error>" and "failed after N-1 statement(s)", and D1's error for json() of
  // text is only "malformed JSON: SQLITE_ERROR" (live D1, SELECT only, 2026-10-19), never the literal
  const runner = fileURLToPath(new URL("../scripts/apply_migrations.py", import.meta.url));
  const pos = spawnSync("python3", ["-I", "-c", "import importlib.util, sys\nspec = importlib.util.spec_from_file_location('am', sys.argv[1])\nm = importlib.util.module_from_spec(spec)\nspec.loader.exec_module(m)\nprint([i for i, s in enumerate(m.statements(open(sys.argv[2]).read()), 1) if m.body(s).startswith('SELECT json(')])", runner, REAL_MIG], { encoding: "utf8" });
  if (pos.error) console.log("note: python3 not available, statement position not checked");
  else {
    const at = JSON.parse(pos.stdout || "[]");
    ok(at.length === 1, "exactly one drift assertion statement in the file", pos.stdout + pos.stderr);
    ok(at.length === 1 && realSql.includes("statement " + at[0] + ": malformed JSON: SQLITE_ERROR") && realSql.includes("failed after " + (at[0] - 1) + " statement(s)"),
      "the file says what the operator will read: the failure at statement " + at[0] + " is 'malformed JSON: SQLITE_ERROR' after " + (at[0] - 1) + " statements", at);
    ok(!/with the reason below/.test(realSql), "the file no longer claims the failure carries the literal's reason");
  }
  const chk = spawnSync("python3", ["-I", runner, "--check", REAL_MIG], { encoding: "utf8" });
  if (chk.error) console.log("note: python3 not available, runner --check not run");
  else ok(chk.status === 0 && /"ok": true/.test(chk.stdout), "scripts/apply_migrations.py --check passes", chk.stdout + chk.stderr);
});

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
