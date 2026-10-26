// PR-MERGE-SLA-GROUPS-1 migration suite. Applies migrations/2026-10-26-pr-merge-sla-10m-lane.sql and then 2026-10-26-pr-merge-sla-10m-groups.sql on SQLite (node:sqlite) and proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, a BACKUP table for the DROP VIEW statements, one single-line Rollback that never touches decision_log) and that the file passes apply_migrations.py --check;
//   2. v_pr_merge_sla counts a pull request waiting on 'hold' or 'session' apart (held_over_10m, session_over_10m) and keeps over_10m and oldest_min for the rest; open_n counts all of them;
//      a merged or closed row, a row unseen for 30 minutes and a pull request younger than 10 minutes are in none of the three;
//   3. the extension view serves the column queue_sla names (pr_open_over_10m) and the two new ones, and the heavy-tick refresh of the metric reads the unattended count;
//   4. the file applies again (the ALTER is the one statement the runner tolerates twice) and adds no second decision row;
//   5. the Rollback restores the 0.49.1 views, where a held pull request is counted again, and drops the column.
// Run: node --no-warnings migrations/pr-merge-sla-groups.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const lane = readFileSync(join(here, "2026-10-26-pr-merge-sla-10m-lane.sql"), "utf8");
const sql = readFileSync(join(here, "2026-10-26-pr-merge-sla-10m-groups.sql"), "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

// ---- 1. header
const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const rollback = hdr("Rollback");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit" && hdr("BACKUP") === "pr_sla_state", "opts in with APPLY-BY: ci, DB: qnfo-audit and a BACKUP table for the DROP VIEW statements");
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && rollback.length > 300 && !/decision_log/i.test(rollback), "one single-line Rollback that never touches decision_log");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/\[skip|skip[ -]ci|skip-checks/i.test(sql), "no claude.ai link and no skip-CI token");
const r = spawnSync("python3", [join(root, "scripts", "apply_migrations.py"), "--check", join(here, "2026-10-26-pr-merge-sla-10m-groups.sql")], { encoding: "utf8", cwd: root });
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
INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, evidence, reviewed_at) VALUES ('stale-pr-merge-idle-window', 'x', 'hold', 'g', 0, 'demote', 'applied', 'old', '2026-10-01T00:00:00Z');
`;
const one = (db, q, ...a) => db.prepare(q).get(...a);
const all = (db, q, ...a) => db.prepare(q).all(...a);
const agoIso = (db, m) => one(db, "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?) AS t", "-" + m + " minutes").t;
const add = (db, pr, { openedMin, state = "open", seenMin = 1, closedMin = null, waits = null }) =>
  db.prepare("INSERT OR REPLACE INTO pr_sla_state (pr, opened_at, head_ref, draft, state, last_seen, closed_at, waits_on) VALUES (?, ?, 'b', 1, ?, ?, ?, ?)")
    .run(pr, agoIso(db, openedMin), state, agoIso(db, seenMin), closedMin === null ? null : agoIso(db, closedMin), waits);
const fresh = () => { const d = new DatabaseSync(":memory:"); d.exec(SCHEMA); d.exec(lane); return d; };
const withoutAlter = (t) => t.replace(/^ALTER TABLE pr_sla_state ADD COLUMN waits_on TEXT;$/m, "");

const db = fresh();
db.exec(sql);
const cols = all(db, "PRAGMA table_info(pr_sla_state)").map((c) => c.name);
ok(cols.includes("waits_on"), "pr_sla_state gains waits_on", cols);
const e = one(db, "SELECT * FROM v_pr_merge_sla");
ok(e.open_n === 0 && e.over_10m === 0 && e.oldest_min === 0 && e.held_over_10m === 0 && e.session_over_10m === 0 && e.merged_24h === 0 && e.merged_within_10m_24h === 0, "an empty table reads zeros, never NULL", e);

add(db, 1, { openedMin: 4 });                                        // young, unattended
add(db, 2, { openedMin: 11 });                                       // unattended, over
add(db, 3, { openedMin: 90 });                                       // unattended, over (the oldest)
add(db, 4, { openedMin: 120, waits: "hold" });                       // held, over
add(db, 5, { openedMin: 75, waits: "session" });                     // workflow change, over
add(db, 6, { openedMin: 8, waits: "hold" });                         // held, young
add(db, 7, { openedMin: 200, seenMin: 45 });                         // unseen for 45 minutes: none
add(db, 8, { openedMin: 30, state: "merged", closedMin: 25 });       // merged in 5
add(db, 9, { openedMin: 30, state: "merged", closedMin: 15, waits: "hold" }); // merged in 15, mark left over
add(db, 10, { openedMin: 30, state: "closed", closedMin: 20 });
const v = one(db, "SELECT * FROM v_pr_merge_sla");
ok(v.open_n === 6, "open_n counts the six open pull requests the lane saw in the last 30 minutes, held ones included", v);
ok(v.over_10m === 2, "over_10m counts only the unattended pull requests past 10 minutes (2 and 3)", v);
ok(v.oldest_min >= 89 && v.oldest_min <= 91, "oldest_min is the oldest unattended one (90), not the held 120", v);
ok(v.held_over_10m === 1 && v.session_over_10m === 1, "the held and the session-merge pull request past 10 minutes are counted apart (the young held one is not)", v);
ok(v.merged_24h === 2 && v.merged_within_10m_24h === 1, "merged counts are unchanged by waits_on", v);

// ---- 3. extension view and metric
const x = one(db, "SELECT pr_open_over_10m, pr_open_oldest_min, pr_held_over_10m, pr_session_merge_over_10m FROM v_stuck_summary_pr_merge_sla");
ok(x.pr_open_over_10m === 2 && x.pr_held_over_10m === 1 && x.pr_session_merge_over_10m === 1 && x.pr_open_oldest_min >= 89, "the extension view serves queue_sla's column and the two new ones", x);
const qs = one(db, "SELECT summary_column FROM queue_sla WHERE stuck_type = 'pr-open-over-10m'");
ok(qs.summary_column === "v_stuck_summary_pr_merge_sla.pr_open_over_10m", "queue_sla still names pr_open_over_10m", qs);
db.prepare("INSERT INTO fleet_tick_heavy (source) VALUES ('test')").run();
ok(one(db, "SELECT last_value FROM metric_registry WHERE metric = 'pr_open_over_10m'").last_value === "2", "the heavy-tick refresh of pr_open_over_10m reads the unattended count");
ok(/waits_on hold/.test(one(db, "SELECT formula FROM metric_registry WHERE metric = 'pr_open_over_10m'").formula), "the metric's formula says what it excludes");
const fm = one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-pr-open-over-10m'").verify_probe;
ok(one(db, fm).observed === "2", "fm-pr-open-over-10m reads the unattended count too", one(db, fm));

// ---- 4. replay
const dl = one(db, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'PR-MERGE-SLA-GROUPS-1:%'").n;
db.exec(withoutAlter(sql));
ok(dl === 1 && one(db, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'PR-MERGE-SLA-GROUPS-1:%'").n === 1, "a replay adds no second decision row");
let dup = null;
try { db.exec(sql); } catch (err) { dup = String(err.message); }
ok(dup !== null && /duplicate column name/.test(dup), "only the ALTER fails on a replay, with the error the runner tolerates", dup);

// ---- 5. rollback
db.exec(rollback);
const back = one(db, "SELECT * FROM v_pr_merge_sla");
ok(back.over_10m === 4 && !("held_over_10m" in back), "after the Rollback the 0.49.1 view counts the held and the session pull requests as over 10 minutes again", back);
ok(!all(db, "PRAGMA table_info(pr_sla_state)").some((c) => c.name === "waits_on"), "the Rollback drops waits_on");
ok(one(db, "SELECT pr_open_over_10m FROM v_stuck_summary_pr_merge_sla").pr_open_over_10m === 4, "and the extension view is the 0.49.1 one");
ok(one(db, "SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'PR-MERGE-SLA-GROUPS-1:%'").n === 1, "the decision row stays");
db.exec(sql);
ok(one(db, "SELECT over_10m FROM v_pr_merge_sla").over_10m === 4, "the file applies again after the Rollback (the column is back with no marks, so all four old open pull requests are unattended)");
console.log(`pr-merge-sla-groups: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
