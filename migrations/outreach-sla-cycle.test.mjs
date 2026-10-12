// OUTREACH-SLA-CYCLE-1 offline suite: runs migrations/2026-10-12-outreach-sla-cycle.sql on SQLite and replays the
// QUEUE-SLA-1 outreach step of queue_sla_tick_10m. Proves: an untried candidate younger than 73 h survives the tick, a row
// the job already tried (attempts >= 1) or older than 73 h is still skipped, the week's untried skips are restored, the
// queue_sla row carries the daily cycle, and the detector passes.
// Run: node migrations/outreach-sla-cycle.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-12-outreach-sla-cycle.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE outreach_queue (id TEXT PRIMARY KEY, paper_id TEXT, author TEXT, email TEXT, reason TEXT, status TEXT, created_at TEXT, attempts INTEGER, error TEXT);
CREATE TABLE queue_sla (stuck_type TEXT PRIMARY KEY, queue TEXT, definition TEXT, cycle_min INTEGER, sla_min INTEGER, auto_fix TEXT, owner TEXT, summary_column TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER);
INSERT INTO queue_sla VALUES ('outreach-needs-email', 'outreach_queue', 'status needs-email or needs-contact for more than 180 min', 60, 180, 'skip', 'qnfo-cloud-ops', 'outreach_waiting');
INSERT INTO outreach_queue VALUES ('aq-old-skip', '2610.1', '', NULL, 'r', 'skipped-no-email', datetime('now', '-2 days'), 0, 'QUEUE-SLA-1 skipped after 180 min (was needs-contact; revert: that status). ');
INSERT INTO outreach_queue VALUES ('aq-tried', '2610.2', '', NULL, 'r', 'skipped-no-email', datetime('now', '-2 days'), 3, 'email lookup failed (HTML+e-print), attempt 3 - terminal');
INSERT INTO outreach_queue VALUES ('aq-ancient', '2609.9', '', NULL, 'r', 'skipped-no-email', datetime('now', '-20 days'), 0, 'QUEUE-SLA-1 skipped after 180 min (was needs-contact; revert: that status). ');`);
db.exec(sql);
const q = (s, ...a) => db.prepare(s).all(...a);
ok(q("SELECT status FROM outreach_queue WHERE id = 'aq-old-skip'")[0].status === "needs-contact", "an untried candidate skipped this week is restored");
ok(q("SELECT status FROM outreach_queue WHERE id = 'aq-tried'")[0].status === "skipped-no-email", "a candidate that failed three lookups stays skipped");
ok(q("SELECT status FROM outreach_queue WHERE id = 'aq-ancient'")[0].status === "skipped-no-email", "skips older than 7 days are left as they are");
const sla = q("SELECT cycle_min, sla_min FROM queue_sla WHERE stuck_type = 'outreach-needs-email'")[0];
ok(sla.cycle_min === 1440 && sla.sla_min === 4380, "queue_sla carries the daily cycle and a 73 h SLA", sla);
db.exec(`INSERT INTO outreach_queue VALUES ('aq-new', '2610.3', '', NULL, 'r', 'needs-contact', datetime('now', '-4 hours'), 0, NULL);
INSERT INTO outreach_queue VALUES ('aq-new-tried', '2610.4', '', NULL, 'r', 'needs-email', datetime('now', '-4 hours'), 1, 'attempt 1');
INSERT INTO outreach_queue VALUES ('aq-stale', '2610.5', '', NULL, 'r', 'needs-contact', datetime('now', '-80 hours'), 0, NULL);`);
// the QUEUE-SLA-1 step of queue_sla_tick_10m, verbatim in effect
db.exec(`UPDATE outreach_queue SET error = substr('QUEUE-SLA-1 skipped after 180 min (was ' || status || '; revert: that status). ' || COALESCE(error, ''), 1, 500), status = 'skipped-no-email'
  WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off' AND status IN ('needs-email', 'needs-contact') AND datetime(created_at) < datetime('now', '-180 minutes')`);
const st = Object.fromEntries(q("SELECT id, status FROM outreach_queue").map((r) => [r.id, r.status]));
ok(st["aq-new"] === "needs-contact" && st["aq-old-skip"] === "needs-contact", "the tick no longer skips a candidate the daily job has not tried", st);
ok(st["aq-new-tried"] === "skipped-no-email" && st["aq-stale"] === "skipped-no-email", "a tried row, or one older than 73 h, is still skipped by the tick", st);
const probe = q("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-sla-shorter-than-consumer-cycle'")[0].p;
ok(q(probe)[0].observed === "1", "the detector passes");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
