// BP26-SQL-PRODUCERS-1 offline suite for migrations/2026-10-27-bp26-sql-producers.sql.
// Proves: the file carries the CI headers; at apply, orphaned_leases, compat_date_age_days_max and agent_pr_revert_rate are computed from the
// qnfo-audit tables (never written by hand) and marked MEASURED; a fleet_tick_heavy insert refreshes a metric only when it is 50 minutes old;
// an empty input writes nothing (unknown is never a value); bp26_headline_heavy_tick-style counting sees them as numeric; a second apply
// changes nothing; the Rollback line returns the three metrics to UNMEASURED and removes the trigger.
// Run: node migrations/bp26-sql-producers.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-27-bp26-sql-producers.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

// headers
const header = (k) => { const m = sql.match(new RegExp("^--\\s*" + k + ":\\s*(.+)$", "m")); return m ? m[1].trim() : null; };
ok(header("APPLY-BY") === "ci", "header APPLY-BY: ci");
ok(header("DB") === "qnfo-audit", "header DB: qnfo-audit");
ok(/DROP TRIGGER IF EXISTS bp26_sql_producers_heavy_tick/.test(header("Rollback") || ""), "Rollback line drops the trigger", header("Rollback"));
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "no DELETE or DROP statement, so no BACKUP line is needed");
ok(header("spof-review") && header("spof-review").length > 20, "spof-review header answers the heavy-tick single producer");
ok(!/fleet_tick\b(?!_heavy)/.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "the trigger is on fleet_tick_heavy only, never fleet_tick (FLEET-TICK-SPLIT-1)");

const d = new DatabaseSync(":memory:");
const all = (q, ...p) => d.prepare(q).all(...p);
const one = (q, ...p) => d.prepare(q).get(...p);
const fixture = () => {
  d.exec(`
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL DEFAULT 'x', kind TEXT NOT NULL DEFAULT 'guard', formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
  CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, intent TEXT NOT NULL, holder TEXT NOT NULL, issue_id INTEGER, pr INTEGER, claimed_at TEXT NOT NULL, expires_at TEXT NOT NULL, released_at TEXT, outcome TEXT);
  CREATE TABLE worker_compat_state (worker TEXT NOT NULL, checked_at TEXT NOT NULL, live_date TEXT NOT NULL, days_behind INTEGER, PRIMARY KEY (worker, checked_at));
  CREATE TABLE code_tasks (id TEXT PRIMARY KEY, merged_at TEXT, revert_cid INTEGER);
  CREATE TABLE evolve_candidates (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT NOT NULL, status TEXT, merged_sha TEXT);
  CREATE TABLE fleet_tick_heavy (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL);
  INSERT INTO metric_registry (metric, source_of_truth, state) VALUES
    ('orphaned_leases', 'qnfo-audit.work_claims [BP26]', 'UNMEASURED'),
    ('compat_date_age_days_max', 'qnfo-audit.worker_compat_state (qnfo-ops compatSnapshot) [BP26]', 'UNMEASURED'),
    ('agent_pr_revert_rate', 'code_tasks + revert ledger (to compute) [BP26]', 'UNMEASURED'),
    ('bp26_other', 'something else [BP26]', 'UNMEASURED');
  `);
};
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString().replace(/\.\d+Z$/, "Z");
const isoMs = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const DAY = 86400000;
const dateOnly = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const val = (m) => one("SELECT last_value v, state s, last_refreshed r FROM metric_registry WHERE metric = ?", m);
const tick = () => d.exec("INSERT INTO fleet_tick_heavy (source) VALUES ('test')");

// ---- empty inputs: nothing is written, nothing is invented
fixture();
d.exec(sql);
ok(val("orphaned_leases").v === "0" && val("orphaned_leases").s === "MEASURED", "no claims at all reads 0 and MEASURED (a count of zero is a measurement)", val("orphaned_leases"));
ok(val("compat_date_age_days_max").v === null && val("compat_date_age_days_max").s === "UNMEASURED", "no worker snapshot leaves compat_date_age_days_max unmeasured", val("compat_date_age_days_max"));
ok(val("agent_pr_revert_rate").v === null && val("agent_pr_revert_rate").s === "UNMEASURED", "no merged code task leaves agent_pr_revert_rate unmeasured", val("agent_pr_revert_rate"));
ok(one("SELECT source_of_truth s FROM metric_registry WHERE metric = 'orphaned_leases'").s.includes("[BP26]"), "source_of_truth keeps the [BP26] tag that the headline counts");
ok(val("bp26_other").v === null, "an unrelated BP26 metric is untouched");
d.exec("DROP TABLE metric_registry; DROP TABLE work_claims; DROP TABLE worker_compat_state; DROP TABLE code_tasks; DROP TABLE evolve_candidates; DROP TABLE fleet_tick_heavy;");

// ---- populated inputs
fixture();
d.exec(`
  INSERT INTO work_claims (path, intent, holder, claimed_at, expires_at, released_at, outcome) VALUES
    ('file:a', 'x', 's1', '${iso(-3 * DAY)}', '${iso(-2 * DAY)}', NULL, NULL),                 -- orphaned
    ('file:b', 'x', 's2', '${iso(-3 * DAY)}', '${iso(-1 * 3600000)}', NULL, NULL),             -- orphaned
    ('file:c', 'x', 's3', '${iso(-3 * DAY)}', '${iso(-2 * DAY)}', '${iso(-2 * DAY)}', 'merged'), -- released in time
    ('file:d', 'x', 's4', '${iso(-60000)}', '${iso(3600000)}', NULL, NULL);                    -- live, not yet expired
  INSERT INTO worker_compat_state (worker, checked_at, live_date, days_behind) VALUES
    ('old-snapshot', '${isoMs(-5 * DAY)}', '2025-01-01', 1),                                  -- retired worker, snapshot older than 2 days: ignored
    ('w1', '${isoMs(-3 * 3600000)}', '${dateOnly(-100)}', 1),                                 -- superseded by the newer row below
    ('w1', '${isoMs(-3600000)}', '${dateOnly(-25)}', 1),
    ('w2', '${isoMs(-3600000)}', '${dateOnly(-10)}', 1),
    ('w3', '${isoMs(-3600000)}', 'not-a-date', 1);
  INSERT INTO evolve_candidates (id, worker, status, merged_sha) VALUES (1, 'w', 'revert-failed', 'abc123'), (2, 'w', 'ci-rejected', NULL), (3, 'w', 'x', '');
  INSERT INTO code_tasks (id, merged_at, revert_cid) VALUES
    ('t1', '${isoMs(-1 * DAY)}', NULL), ('t2', '${iso(-2 * DAY)}', 1), ('t3', '${isoMs(-3 * DAY)}', 2), ('t4', '${isoMs(-4 * DAY)}', 3),
    ('t5', '${iso(-40 * DAY)}', 1),   -- merged and reverted but outside the 30-day window
    ('t6', NULL, NULL);               -- never merged
`);
d.exec(sql);
ok(val("orphaned_leases").v === "2" && val("orphaned_leases").s === "MEASURED", "orphaned_leases counts the two unreleased expired claims", val("orphaned_leases"));
ok(val("compat_date_age_days_max").v === "25", "compat_date_age_days_max is the oldest live date in each worker's newest row (25), not the superseded or retired rows", val("compat_date_age_days_max"));
ok(val("agent_pr_revert_rate").v === "0.25", "agent_pr_revert_rate is 1 merged revert of 4 merges in 30 days (a rejected or blank-sha revert does not count)", val("agent_pr_revert_rate"));
ok(/^[0-9.+-]+$/.test(val("orphaned_leases").v) && /^[0-9.+-]+$/.test(val("compat_date_age_days_max").v) && /^[0-9.+-]+$/.test(val("agent_pr_revert_rate").v), "all three values are numeric text, so bp26_headline_heavy_tick counts them as measured");
ok(val("bp26_other").v === null, "the unrelated BP26 metric is still untouched");
ok(one("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'trigger' AND name = 'bp26_sql_producers_heavy_tick'").n === 1, "the heavy-tick trigger exists");

// ---- the trigger honours the 50-minute gate
d.exec("INSERT INTO work_claims (path, intent, holder, claimed_at, expires_at) VALUES ('file:e', 'x', 's5', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')");
tick();
ok(val("orphaned_leases").v === "2", "a heavy tick right after a refresh changes nothing (gate: 50 minutes)", val("orphaned_leases"));
d.exec("UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-51 minutes') WHERE metric IN ('orphaned_leases', 'compat_date_age_days_max', 'agent_pr_revert_rate')");
tick();
ok(val("orphaned_leases").v === "3", "a heavy tick on a 51-minute-old metric recounts (2 -> 3)", val("orphaned_leases"));
ok(Date.parse(val("orphaned_leases").r) > Date.now() - 60000, "and stamps last_refreshed", val("orphaned_leases"));
ok(val("bp26_other").v === null, "the trigger still leaves the unrelated metric alone");

// ---- a source that empties again writes nothing (the last value stays, last_refreshed stays)
d.exec("DELETE FROM code_tasks; UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-51 minutes') WHERE metric = 'agent_pr_revert_rate'");
const before = val("agent_pr_revert_rate");
tick();
ok(val("agent_pr_revert_rate").v === before.v && val("agent_pr_revert_rate").r === before.r, "with no merged code task in 30 days the metric is not overwritten with NULL or 0", val("agent_pr_revert_rate"));

// ---- idempotent second apply
const snapshot = JSON.stringify(all("SELECT metric, source_of_truth, last_value, state FROM metric_registry ORDER BY metric"));
d.exec(sql);
const again = JSON.stringify(all("SELECT metric, source_of_truth, last_value, state FROM metric_registry ORDER BY metric"));
ok(JSON.parse(again).filter((r) => r.metric === "orphaned_leases")[0].last_value === "3", "a second apply recomputes from the same data and keeps one trigger", JSON.parse(again));
ok(one("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'trigger' AND name = 'bp26_sql_producers_heavy_tick'").n === 1, "still exactly one trigger after the second apply");

// ---- the Rollback line puts it back
d.exec(header("Rollback").replace(/--.*$/, ""));
ok(one("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'trigger' AND name = 'bp26_sql_producers_heavy_tick'").n === 0, "Rollback removes the trigger");
ok(["orphaned_leases", "compat_date_age_days_max", "agent_pr_revert_rate"].every((m) => val(m).v === null && val(m).s === "UNMEASURED"), "Rollback returns the three metrics to UNMEASURED", all("SELECT metric, last_value, state FROM metric_registry"));
ok(one("SELECT source_of_truth s FROM metric_registry WHERE metric = 'orphaned_leases'").s === "qnfo-audit.work_claims [BP26]", "Rollback restores the original source_of_truth text");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
