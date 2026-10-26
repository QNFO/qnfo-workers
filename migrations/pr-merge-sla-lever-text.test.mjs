// PR-MERGE-SLA-10M-1 closeout suite: migrations/2026-10-26-pr-merge-sla-10m-lever-text.sql corrects the lever text of the pr_open_over_10m trigger and the auto_fix text of the queue_sla row. Proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback), the file passes apply_migrations.py --check, and it changes text only (two UPDATE statements, nothing else);
//   2. after the lane, groups and lever-text migrations, the trigger's read query is valid SQL on the groups schema, returns the unattended pull requests past 10 minutes and none that wait on 'hold' or 'session';
//   3. the text names the switches that exist (stale_pr_merge_workflows, stale_pr_merge_drafts, stale_pr_merge_idle_min) and no longer says that .github/ changes are never merged;
//   4. the threshold, operator, priority and cooldown of the trigger and the SLA of the queue row are unchanged;
//   5. the Rollback restores the text of migrations/2026-10-26-pr-merge-sla-10m-lane.sql byte for byte.
// Run: node --no-warnings migrations/pr-merge-sla-lever-text.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const rd = (f) => readFileSync(join(here, f), "utf8").replace(/\r\n/g, "\n");
const lane = rd("2026-10-26-pr-merge-sla-10m-lane.sql"), groups = rd("2026-10-26-pr-merge-sla-10m-groups.sql"), sql = rd("2026-10-26-pr-merge-sla-10m-lever-text.sql");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

// ---- 1. header
const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const body = lines.filter((l) => !l.startsWith("--")).join("\n");
const rollback = hdr("Rollback");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit" && lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && rollback.length > 500, "opts in with APPLY-BY and DB and one single-line Rollback");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/\[skip|skip[ -]ci|skip-checks/i.test(sql), "no claude.ai link and no skip-CI token");
const stmts = body.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
ok(stmts.length === 2 && stmts.every((s) => /^UPDATE (analytics_metric_triggers|queue_sla) SET (action|auto_fix) = /.test(s)), "two UPDATE statements and nothing else", stmts.map((s) => s.slice(0, 40)));
const r = spawnSync("python3", [join(root, "scripts", "apply_migrations.py"), "--check", join(here, "2026-10-26-pr-merge-sla-10m-lever-text.sql")], { encoding: "utf8", cwd: root });
ok(r.status === 0 && /"ok": true/.test(r.stdout), "scripts/apply_migrations.py --check passes", String(r.stdout || r.stderr).slice(0, 300));

// ---- 2. fixture
const SCHEMA = `
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT);
CREATE TABLE queue_sla (stuck_type TEXT PRIMARY KEY, queue TEXT NOT NULL, definition TEXT NOT NULL, cycle_min INTEGER NOT NULL, sla_min INTEGER NOT NULL, auto_fix TEXT NOT NULL, owner TEXT NOT NULL, summary_column TEXT NOT NULL, producer_cycle_min INTEGER);
CREATE VIEW v_stuck_summary AS SELECT 0 AS research_review_error, 0 AS code_tasks_stalled;
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT, kind TEXT, guards_against TEXT, critical_path INTEGER, disposition TEXT, disposition_state TEXT, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT, issue_id INTEGER, reviewed_at TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE fleet_tick_heavy (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE branch_hygiene_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, branch TEXT, sha TEXT, action TEXT, why TEXT, pr INTEGER, archive_ref TEXT, ok INTEGER, dry INTEGER);
INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, evidence, reviewed_at) VALUES ('stale-pr-merge-idle-window', 'x', 'hold', 'g', 0, 'demote', 'applied', 'old', '2026-10-01T00:00:00Z');
`;
const one = (db, q, ...a) => db.prepare(q).get(...a);
const all = (db, q, ...a) => db.prepare(q).all(...a);
const agoIso = (db, m) => one(db, "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?) AS t", "-" + m + " minutes").t;
const add = (db, pr, openedMin, waits = null, state = "open") =>
  db.prepare("INSERT INTO pr_sla_state (pr, opened_at, head_ref, draft, state, last_seen, closed_at, waits_on) VALUES (?, ?, 'b', 0, ?, ?, NULL, ?)").run(pr, agoIso(db, openedMin), state, agoIso(db, 1), waits);
const fresh = () => { const d = new DatabaseSync(":memory:"); d.exec(SCHEMA); d.exec(lane); d.exec(groups); return d; };
const db = fresh();
const before = one(db, "SELECT action, operator, threshold, priority, cooldown_hours, enabled FROM analytics_metric_triggers WHERE metric_key = 'pr_open_over_10m'");
const qBefore = one(db, "SELECT auto_fix, sla_min, cycle_min, summary_column FROM queue_sla WHERE stuck_type = 'pr-open-over-10m'");
db.exec(sql);
const t = one(db, "SELECT action, operator, threshold, priority, cooldown_hours, enabled FROM analytics_metric_triggers WHERE metric_key = 'pr_open_over_10m'");
const q = one(db, "SELECT auto_fix, sla_min, cycle_min, summary_column FROM queue_sla WHERE stuck_type = 'pr-open-over-10m'");
ok(t.action !== before.action && q.auto_fix !== qBefore.auto_fix, "both texts changed");

add(db, 1, 4); add(db, 2, 11); add(db, 3, 90); add(db, 4, 120, "hold"); add(db, 5, 75, "session"); add(db, 6, 200, null, "merged");
const lever = (t.action.match(/Read them: (SELECT .*?);/s) || [])[1];
ok(!!lever, "the trigger text carries its read query", t.action.slice(0, 200));
let rows = null, err = null;
try { rows = all(db, lever).map((x) => x.pr).sort((a, b) => a - b); } catch (e) { err = String(e.message); }
ok(err === null && JSON.stringify(rows) === "[2,3]", "the read query is valid SQL and lists the unattended pull requests past 10 minutes, not the young one, the held one, the session one or the merged one", { rows, err });
const v = one(db, "SELECT over_10m FROM v_pr_merge_sla");
ok(v.over_10m === rows.length, "and it agrees with v_pr_merge_sla.over_10m", { view: v.over_10m, rows });

// ---- 3. content
ok(["stale_pr_merge_workflows", "stale_pr_merge_drafts", "stale_pr_merge_idle_min", "held_over_10m", "session_over_10m", "waits_on IS NULL"].every((k) => (t.action + q.auto_fix).includes(k)), "the text names the switches and counts that exist");
ok(!/never merged automatically|never merge/i.test(t.action + q.auto_fix), "and no longer says that .github/ changes are never merged");
ok(/code-task:|code-anchor:/.test(t.action) === false, "no code-task line is added: this is text, not a lever for the code loop");

// ---- 4. nothing else moved
ok(["operator", "threshold", "priority", "cooldown_hours", "enabled"].every((k) => t[k] === before[k]), "operator, threshold, priority, cooldown and enabled of the trigger are unchanged", { t, before });
ok(q.sla_min === 10 && q.cycle_min === qBefore.cycle_min && q.summary_column === qBefore.summary_column, "the queue row keeps its SLA, cycle and summary column", q);

// ---- 5. rollback
db.exec(rollback);
const back = one(db, "SELECT action FROM analytics_metric_triggers WHERE metric_key = 'pr_open_over_10m'").action;
const backFix = one(db, "SELECT auto_fix FROM queue_sla WHERE stuck_type = 'pr-open-over-10m'").auto_fix;
ok(back === before.action && backFix === qBefore.auto_fix, "the Rollback restores both texts byte for byte");
db.exec(sql);
ok(one(db, "SELECT action FROM analytics_metric_triggers WHERE metric_key = 'pr_open_over_10m'").action === t.action, "the file applies again after the Rollback to the same text");
console.log(`pr-merge-sla-lever-text: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
