// COLD-HUMAN-ESCALATE-1 offline suite: runs migrations/2026-10-12-cold-human-escalate.sql on an in-memory SQLite and proves
// a first-time person escalates, a journal/conference solicitation stays skipped, a reply ("Re:") always escalates, other
// skip reasons are untouched, email 984 is restored with a backup, and the detector reads 1 after the fix.
// Run: node migrations/cold-human-escalate.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-12-cold-human-escalate.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE emails (id INTEGER PRIMARY KEY, sender TEXT, subject TEXT, body_text TEXT, status TEXT);
CREATE TABLE email_reply_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER, sender TEXT, person_key TEXT, subject TEXT, received_at TEXT, human_score INTEGER, decision TEXT, skip_reason TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER);
CREATE TABLE email_parse_failures (email_id INTEGER PRIMARY KEY, resolved_at TEXT, notes TEXT);
INSERT INTO email_parse_failures VALUES (796, NULL, 'x'), (802, NULL, 'y');
CREATE TABLE email_commands (id INTEGER PRIMARY KEY, status TEXT, result TEXT, updated_at TEXT);
INSERT INTO email_commands VALUES (10, 'error', '{"ok":false}', NULL), (14, 'error', '{"ok":false}', NULL), (15, 'done', '{"ok":true}', NULL);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
INSERT INTO emails VALUES (984, 'kottevarun@gmail.com', 'Your router_calibrate.py in qnfo-workers and the UCCI paper', 'Hi Rowan, I came across qnfo-ops/scripts/router_calibrate.py ... My attorney is preparing a US immigration petition', 'archived');
INSERT INTO emails VALUES (890, 'jmichaelnicky@yahoo.fr', 'Re: Topologically', 'text', 'replied');
INSERT INTO email_reply_queue (id, email_id, sender, decision, skip_reason, created_at) VALUES (63, 984, 'kottevarun@gmail.com', 'skip', 'cold sender not in contact_ledger: no owner notice (NOTICE-REPLY-1)', '2026-10-11 20:01:39');`);
db.exec(sql);
const q = (s, ...a) => db.prepare(s).all(...a);
ok(q("SELECT COUNT(*) n FROM email_parse_failures WHERE resolved_at IS NOT NULL")[0].n === 2, "the two stale parse failures close with their evidence");
ok(q("SELECT COUNT(*) n FROM email_commands WHERE status = 'closed' AND json_extract(result, '$.was') IS NOT NULL")[0].n === 2 && q("SELECT status FROM email_commands WHERE id = 15")[0].status === "done", "the five stale command errors close with the reason kept; done rows untouched");
const r63 = q("SELECT decision, skip_reason FROM email_reply_queue WHERE id = 63")[0];
ok(r63.decision === "escalate" && /restored/.test(r63.skip_reason), "queue row 63 (email 984) is escalated", r63);
ok(q("SELECT status FROM emails WHERE id = 984")[0].status === "processed", "email 984 is back in the owner's pending view");
ok(q("SELECT COUNT(*) n FROM bak_20261012_cold_human_984")[0].n === 2, "both rows were backed up first");
ok(q("SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'NOTICE-REPLY-COLD-HUMAN-1:%'")[0].n === 1 && /code-anchor: cold sender not in contact_ledger/.test(q("SELECT description d FROM agent_issues")[0].d), "the code follow-up is filed with its code-task and anchor");

const add = (id, sender, subject, body, reason = "cold sender not in contact_ledger: no owner notice (NOTICE-REPLY-1)") => {
  db.prepare("INSERT INTO emails VALUES (?, ?, ?, ?, 'processed')").run(id, sender, subject, body);
  db.prepare("INSERT INTO email_reply_queue (email_id, sender, decision, skip_reason) VALUES (?, ?, 'skip', ?)").run(id, sender, reason);
  return q("SELECT decision FROM email_reply_queue WHERE email_id = ?", id)[0].decision;
};
ok(add(1001, "a.person@uni.edu", "Question about your exchange-phase paper", "Dear Rowan, I read your paper and have a question about equation 4.") === "escalate", "a first-time person escalates");
ok(add(1002, "parker.knight@theresearchletters.org", "We Invite Your Research Article for Upcoming Issue", "fits for our journal scope ... ISSN: 3068-9090 ... submit your full-length article") === "skip", "a journal call for papers stays skipped");
ok(add(1003, "info@conferencehq.live", "Sustainability Congress 2027 @ Paris", "Abstract deadline approaching") === "skip", "a conference solicitation stays skipped");
ok(add(1004, "riley.liu@mdpi.com", "Re: IOCPh 2026 - late abstract submission request", "Dear Rowan, regarding your abstract submission") === "escalate", "a reply always escalates, even with conference wording");
ok(add(1005, "x@y.org", "hello", "plain", "db-trigger: machine/marketing sender terminalized on first touch") === "skip", "other skip reasons are untouched");
const probe = q("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-cold-human-silent-drop'")[0].p;
ok(q(probe)[0].observed === "1", "the detector passes after the fix", q(probe));
db.exec("DROP TRIGGER email_reply_queue_cold_human_escalate");
db.prepare("INSERT INTO emails VALUES (1006, 'b@c.org', 'A request', 'please call me', 'processed')").run();
db.prepare("INSERT INTO email_reply_queue (email_id, sender, decision, skip_reason, created_at) VALUES (1006, 'b@c.org', 'skip', 'cold sender not in contact_ledger: no owner notice (NOTICE-REPLY-1)', '2026-10-13 09:00:00')").run();
ok(q(probe)[0].observed === "0", "the detector fails when a person is skipped again");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
