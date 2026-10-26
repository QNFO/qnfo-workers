// PR-MERGE-SLA-10M-1 (lane half) offline suite: runs migrations/2026-10-26-pr-merge-sla-10m-lane.sql on SQLite with the live table definitions. Proves: the migration
// is idempotent; v_pr_merge_sla counts a pull request open past 10 minutes and not one younger, not one the lane stopped seeing for 30 minutes, not a merged or closed
// one; merged_within_10m_24h splits merges by GitHub created_at to closed_at; the extension view carries the column queue_sla names; the heavy tick refreshes the metric
// only when it is 50 minutes old; the idle-window upsert moves 10 and 20 to 3 and leaves an owner's other value alone; the three failure-mode probes read 0 on an empty
// table and 1 on a breach; the decision row carries a parseable prediction; and the Rollback line runs. It does not pin the text of any worker.
// Run: node migrations/pr-merge-sla-lane.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-pr-merge-sla-10m-lane.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };

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
INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, evidence, reviewed_at) VALUES ('stale-pr-merge-idle-window', 'x', 'hold', 'g', 0, 'demote', 'applied', 'old evidence', '2026-10-01T00:00:00Z');
`;

const one = (db, q, ...a) => db.prepare(q).get(...a);
const all = (db, q, ...a) => db.prepare(q).all(...a);
const agoIso = (db, minutes) => one(db, "SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?) AS t", "-" + minutes + " minutes").t;
const addPr = (db, pr, { openedMin, state = "open", seenMin = 1, closedMin = null }) =>
  db.prepare("INSERT OR REPLACE INTO pr_sla_state (pr, opened_at, head_ref, draft, state, last_seen, closed_at) VALUES (?, ?, 'b', 1, ?, ?, ?)")
    .run(pr, agoIso(db, openedMin), state, agoIso(db, seenMin), closedMin === null ? null : agoIso(db, closedMin));
const tick = (db) => db.prepare("INSERT INTO fleet_tick_heavy (source) VALUES ('test')").run();
const fresh = () => { const d = new DatabaseSync(":memory:"); d.exec(SCHEMA); return d; };

// ---- 1. apply and shape
const db = fresh();
db.exec(sql);
const empty = one(db, "SELECT * FROM v_pr_merge_sla");
ok(empty.open_n === 0 && empty.over_10m === 0 && empty.oldest_min === 0 && empty.merged_24h === 0 && empty.merged_within_10m_24h === 0, "an empty table reads zeros, never NULL", empty);
const qs = one(db, "SELECT * FROM queue_sla WHERE stuck_type = 'pr-open-over-10m'");
ok(qs && qs.sla_min === 10 && qs.cycle_min === 10 && qs.sla_min % 10 === 0, "queue_sla row at SLA 10 on the 10-minute grid", qs);
const [view, col] = (qs.summary_column || "").split(".");
ok(view === "v_stuck_summary_pr_merge_sla" && !!one(db, "SELECT " + col + " AS v FROM " + view), "summary_column names a column the extension view serves", qs.summary_column);
ok(one(db, "SELECT COUNT(*) AS n FROM v_stuck_summary_pr_merge_sla").n === 1, "the extension view joins v_stuck_summary to exactly one row");

// ---- 2. the view
addPr(db, 1, { openedMin: 4 });
addPr(db, 2, { openedMin: 11 });
addPr(db, 3, { openedMin: 90 });
addPr(db, 4, { openedMin: 120, seenMin: 45 });
addPr(db, 5, { openedMin: 30, state: "merged", closedMin: 25 });
addPr(db, 6, { openedMin: 30, state: "merged", closedMin: 15 });
addPr(db, 7, { openedMin: 30, state: "closed", closedMin: 20 });
addPr(db, 8, { openedMin: 3000, state: "merged", closedMin: 2900 });
const v = one(db, "SELECT * FROM v_pr_merge_sla");
ok(v.open_n === 3, "open counts the three the lane saw in the last 30 minutes", v);
ok(v.over_10m === 2, "over_10m counts the 11-minute and 90-minute pull requests, not the 4-minute one, not the one unseen for 45 minutes", v);
ok(v.oldest_min >= 89 && v.oldest_min <= 91, "oldest_min is the 90-minute pull request", v);
ok(v.merged_24h === 2, "merged_24h counts the two merged inside 24 hours, not the old one or the closed one", v);
ok(v.merged_within_10m_24h === 1, "merged_within_10m_24h counts only the pull request merged 5 minutes after it opened", v);
ok(one(db, "SELECT pr_open_over_10m AS n FROM v_stuck_summary_pr_merge_sla").n === 2, "the extension view column agrees with the view");

// ---- 3. the metric and its heavy-tick refresh
const m = () => one(db, "SELECT * FROM metric_registry WHERE metric = 'pr_open_over_10m'");
ok(m().target.startsWith("0") && m().state === "MEASURED" && m().last_value === null, "metric registered with target 0 and no value yet", m());
tick(db);
ok(m().last_value === "2" && !!m().last_refreshed, "the first heavy tick writes the value", m());
addPr(db, 9, { openedMin: 15 });
tick(db);
ok(m().last_value === "2", "a second heavy tick inside 50 minutes writes nothing (the gate)", m());
db.prepare("UPDATE metric_registry SET last_refreshed = ? WHERE metric = 'pr_open_over_10m'").run(agoIso(db, 55));
tick(db);
ok(m().last_value === "3", "a heavy tick on a 55-minute-old metric refreshes it", m());
const trg = one(db, "SELECT * FROM analytics_metric_triggers WHERE metric_key = 'pr_open_over_10m'");
ok(trg && trg.operator === "gt" && trg.threshold === 0 && trg.source_table === "registry" && trg.queue_target === "agent_issues", "trigger: gt 0 on the registry, queue agent_issues", trg);
ok(/pr_sla_state/.test(trg.action) && /conflict_repair\.py/.test(trg.action) && /gh-poke/.test(trg.action), "the trigger action names the table, the repair script and the poke row to read");

// ---- 4. switches
const cfg = Object.fromEntries(all(db, "SELECT key, value FROM ops_config").map((r) => [r.key, r.value]));
ok(cfg.stale_pr_merge_drafts === "on" && cfg.gh_poke_enabled === "on" && cfg.stale_pr_merge_idle_min === "3", "switches on and the idle window 3 on a fresh table", cfg);
for (const [before, want] of [["10", "3"], ["20", "3"], ["15", "15"]]) {
  const d = fresh();
  d.prepare("INSERT INTO ops_config (key, value) VALUES ('stale_pr_merge_idle_min', ?)").run(before);
  d.exec(sql);
  ok(one(d, "SELECT value FROM ops_config WHERE key = 'stale_pr_merge_idle_min'").value === want, "idle window " + before + " becomes " + want, before);
}
const dOff = fresh();
dOff.prepare("INSERT INTO ops_config (key, value) VALUES ('stale_pr_merge_drafts', 'off')").run();
dOff.exec(sql);
ok(one(dOff, "SELECT value FROM ops_config WHERE key = 'stale_pr_merge_drafts'").value === "off", "an owner's off survives the apply (INSERT OR IGNORE)");

// ---- 5. failure modes and their probes
ok(all(db, "SELECT fm_key FROM failure_modes ORDER BY fm_key").map((r) => r.fm_key).join() === "gh-poke-silent,pr-open-over-10m", "two failure modes");
const contract = (klass) => one(db, "SELECT * FROM remediation_contracts WHERE class = ?", klass);
const probe = (d, klass) => one(d, contract(klass).verify_probe);
ok(["fm-pr-open-over-10m", "fm-gh-poke-silent"].every((k) => contract(k) && contract(k).verify_transport === "d1-query" && contract(k).status === "active"), "both detector contracts are active d1-query probes");
const p1 = probe(db, "fm-pr-open-over-10m");
ok(p1.expected === "0" && p1.observed === "3", "fm-pr-open-over-10m reads the breach count (PR 9 opened 15 minutes ago joined the two earlier ones)", p1);
const clean = fresh(); clean.exec(sql);
ok(probe(clean, "fm-pr-open-over-10m").observed === "0", "fm-pr-open-over-10m reads 0 on an empty table");
ok(probe(clean, "fm-gh-poke-silent").observed === "0", "fm-gh-poke-silent reads 0 when no pull request opened (nothing to poke)");
ok(probe(db, "fm-gh-poke-silent").observed === "1", "fm-gh-poke-silent reads 1 when pull requests opened and no poke was recorded", probe(db, "fm-gh-poke-silent"));
db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text) VALUES ('poke-1', ?, 'gh-poke', 'poke')").run(agoIso(db, 3));
ok(probe(db, "fm-gh-poke-silent").observed === "0", "fm-gh-poke-silent reads 0 once a poke is recorded in the last 24 hours");
db.prepare("UPDATE cloud_ops_events SET ts = ? WHERE id = 'poke-1'").run(agoIso(db, 60 * 30));
ok(probe(db, "fm-gh-poke-silent").observed === "1", "a poke older than 24 hours no longer counts");

// ---- 6. controls, ledger, decision
const ctl = Object.fromEntries(all(db, "SELECT control, disposition, disposition_state, issue_id, evidence, reviewed_at FROM control_registry").map((r) => [r.control, r]));
ok(/PR-MERGE-SLA-10M-1/.test(ctl["stale-pr-merge-idle-window"].evidence) && ctl["stale-pr-merge-idle-window"].disposition === "demote" && ctl["stale-pr-merge-idle-window"].reviewed_at > "2026-10-02", "the idle-window control is re-reviewed with new evidence", ctl["stale-pr-merge-idle-window"]);
ok(ctl["stale-pr-draft-refusal"] && ctl["stale-pr-draft-refusal"].disposition === "replace" && ctl["gh-poke-switch"] && ctl["gh-poke-switch"].disposition === "keep", "the draft refusal is replaced and the poke switch is kept, both recorded");
ok(one(db, "SELECT COUNT(*) AS n FROM capability_ledger").n === 1, "one capability row");
const dl = one(db, "SELECT * FROM decision_log");
ok(/^[a-z0-9_]+ (>=|<=|>|<) [0-9.]+ within [0-9]+ h$/.test(dl.predicted_outcome) && dl.rollback_path && dl.capability_gain && dl.blast_radius && dl.surfaces_tested, "decision_log row carries a parseable prediction, rollback, gain, blast radius and surfaces", dl);

// ---- 7. idempotence
const snap = (d) => JSON.stringify([all(d, "SELECT * FROM queue_sla"), all(d, "SELECT metric FROM metric_registry"), all(d, "SELECT metric_key FROM analytics_metric_triggers"), all(d, "SELECT fm_key FROM failure_modes"), all(d, "SELECT class FROM remediation_contracts"), all(d, "SELECT control FROM control_registry ORDER BY control"), all(d, "SELECT capability FROM capability_ledger"), all(d, "SELECT id FROM decision_log"), all(d, "SELECT key, value FROM ops_config ORDER BY key")]);
const before = snap(db);
db.exec(sql);
ok(snap(db) === before, "applying twice changes nothing");

// ---- 8. the Rollback line and the header rules
const rb = (sql.match(/^-- Rollback: (.*)$/m) || [])[1];
ok(!!rb, "a Rollback line exists");
if (rb) {
  db.exec(rb);
  ok(one(db, "SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('pr_sla_state','v_pr_merge_sla','v_stuck_summary_pr_merge_sla','pr_merge_sla_heavy_tick')").n === 0, "the Rollback line removes the table, both views and the trigger");
  ok(one(db, "SELECT COUNT(*) AS n FROM metric_registry").n === 0 && one(db, "SELECT COUNT(*) AS n FROM analytics_metric_triggers").n === 0 && one(db, "SELECT COUNT(*) AS n FROM queue_sla").n === 0, "the Rollback line removes the metric, its trigger and the queue_sla row");
  ok(one(db, "SELECT value FROM ops_config WHERE key = 'stale_pr_merge_idle_min'").value === "10" && one(db, "SELECT COUNT(*) AS n FROM decision_log").n === 1, "the Rollback line restores the 10-minute window and keeps the decision row");
  tick(db);
  ok(true, "a heavy tick after the Rollback still inserts");
}
const body = sql.replace(/^--.*$/gm, "");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "APPLY-BY and DB headers");
ok(!/\bON fleet_tick\b/i.test(body), "no trigger on fleet_tick: the 10-minute heartbeat is untouched (FLEET-TICK-SPLIT-1)");
ok(!/\b(DELETE|DROP)\b/i.test(body), "no DELETE or DROP in the body, so no BACKUP header is owed");
console.log(`pr-merge-sla-lane: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
