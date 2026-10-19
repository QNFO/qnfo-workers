// IDEAS-CAP-RATE-1 offline suite: replays migrations/2026-10-19-ideas-cap-rate.sql on SQLite. Proves: the research-admission-cap row is demoted to a
// rate with a review date, a tested alternate and its earlier evidence kept; the failure mode and its fm- detector are created once and the detector
// reads 0 for a 50 h hold and 1 for an 80 h one; the replacement probe of issue 100047 reads the held rows older than 120 minutes while research_queue
// sits far above the cap (the generated probe it replaces returned 'pending' there, so it could not pass); the decision is logged once; re-applying
// changes nothing; the Rollback line restores the old probe and removes the rows; and the constants the migration names are in idea-hub on main.
// Run: node migrations/ideas-cap-rate.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const here = (f) => new URL("./" + f, import.meta.url);
const root = (f) => new URL("../" + f, import.meta.url);
const sql = readFileSync(here("2026-10-19-ideas-cap-rate.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const OLD_PROBE = "SELECT '0' AS expected, CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued','researching','review','deferred')) >= 120 THEN 'pending: research_queue at the admission cap, nothing to release yet' ELSE CAST((SELECT COUNT(*) FROM idea_proposals WHERE decision = 'ACCEPT' AND status = 'triaged_hold' AND rationale LIKE '[research admission cap %' AND created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS TEXT) END AS observed";
const OLD_EVIDENCE = "before 1.10.12 the cap also held owner ideas and nothing re-admitted a held row";
const OLD_ALT = "a generated accept over the cap waits in idea_proposals as triaged_hold with its rationale intact; an owner-authored idea (proposalKind direct) skips the cap and is queued on the same triage run";
const OLD_LOC = "idea-hub/worker.js enqueueAccepted, RESEARCH_ADMISSION_CAP = 120 (RESEARCH-ADMISSION-CAP-1, narrowed by IDEAS-INTAKE-OWNER-1 in 1.10.12)";

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL, guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL, disposition_state TEXT NOT NULL DEFAULT 'planned', alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, idea TEXT, status TEXT, created_at TEXT, decision TEXT, rationale TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;`);
db.prepare("INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES ('research-admission-cap', ?, 'cap', 'the machine producers filling research_queue', 0, 'demote', 'applied', ?, NULL, ?, NULL, '2026-10-19T04:56:02Z')").run(OLD_LOC, OLD_ALT, OLD_EVIDENCE + " (a test row read [research admission cap 300/120])");
db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module, attempts, last_verdict, next_due_at) VALUES ('issue-100047', 100047, 'no earlier birth template matched', 'VACUOUS-PROBE-V3-1 ...', ?, 'd1-query', 'qnfo-fleet-control', 1, 'active', 'probe-template-v3-generic', 19, 'fail', '2099-01-01 00:00:00')").run(OLD_PROBE);

// The live shape: research_queue far above the cap and held rows of several ages.
const rq = db.prepare("INSERT INTO research_queue VALUES (?, 'queued')");
for (let i = 0; i < 473; i++) rq.run("q" + i);
const hoursAgo = (h) => new Date(Date.now() - h * 36e5).toISOString().slice(0, 23) + "Z";
const hold = db.prepare("INSERT INTO idea_proposals (idea, status, created_at, decision, rationale) VALUES (?, 'triaged_hold', ?, 'ACCEPT', '[research admission cap 473/120] x')");
hold.run("fresh", hoursAgo(1));
hold.run("three hours", hoursAgo(3));
hold.run("fifty hours", hoursAgo(50));
db.prepare("INSERT INTO idea_proposals (idea, status, created_at, decision, rationale) VALUES ('other hold', 'triaged_hold', ?, 'HOLD', 'noise/question filter')").run(hoursAgo(200));
db.prepare("INSERT INTO idea_proposals (idea, status, created_at, decision, rationale) VALUES ('accepted long ago', 'triaged_accepted', ?, 'ACCEPT', 'fine')").run(hoursAgo(200));

const observed = (probe) => db.prepare(probe).get();
const probeOf = (cls) => db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = ?").get(cls).verify_probe;
const old = observed(OLD_PROBE);
ok(old.observed.startsWith("pending") && old.expected === "0", "the generated probe is vacuous: it reads 'pending' while the queue is over the cap, whatever is held", old);

db.exec(sql);

// 1. control_registry
const cr = db.prepare("SELECT * FROM control_registry WHERE control = 'research-admission-cap'").get();
ok(cr.disposition === "demote" && cr.disposition_state === "applied", "the cap row is demote / applied", [cr.disposition, cr.disposition_state]);
ok(cr.alternate_tested_at === "2026-10-19" && cr.alternate_path.includes("CAP_TRICKLE_PER_RUN") && cr.alternate_path.includes("idea-cap-trickle"), "the tested alternate names the rate and its log", cr.alternate_path);
ok(cr.evidence.startsWith(OLD_EVIDENCE) && cr.evidence.includes(" | IDEAS-CAP-RATE-1") && cr.evidence.includes("REVIEW BY 2026-10-26"), "the earlier evidence is kept and the new evidence carries a review date", cr.evidence.slice(0, 200));
ok(cr.location.startsWith(OLD_LOC) && cr.location.includes("capRelease trickle CAP_TRICKLE_PER_RUN = 3"), "the location names the trickle", cr.location);
ok(cr.reviewed_at > "2026-10-19T04:56:02Z", "reviewed_at moved", cr.reviewed_at);

// 2. failure mode and detector
const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'ideas-cap-hold-no-expiry'").get();
ok(fm && fm.issue_id === 100047 && fm.probe_class === "fm-ideas-cap-hold-no-expiry" && fm.root_cause && fm.remediation && fm.detector && fm.trigger_condition && fm.symptom && fm.blast_radius, "one fully described failure mode", fm && Object.keys(fm).filter((k) => !fm[k]));
const det = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-ideas-cap-hold-no-expiry'").get();
ok(det && det.verify_transport === "d1-query" && det.module === "failure-mode" && det.status === "active" && det.expected_cadence_h === 1, "one active d1-query detector", det);
let r = observed(det.verify_probe);
ok(r.expected === "0" && r.observed === "0", "the detector reads 0 while the oldest hold is 50 h", r);
hold.run("eighty hours", hoursAgo(80));
r = observed(det.verify_probe);
ok(r.observed === "1", "the detector reads 1 once a cap hold is older than 72 h (only that row, not the other hold)", r);
db.exec("DELETE FROM idea_proposals WHERE idea = 'eighty hours'");

// 3. issue-100047's probe
const ic = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'issue-100047'").get();
ok(ic.verify_probe !== OLD_PROBE && !ic.verify_probe.includes("pending:"), "the vacuous probe is replaced", ic.verify_probe.slice(0, 120));
ok(ic.next_due_at !== "2099-01-01 00:00:00" && ic.verify_transport === "d1-query" && ic.attempts === 19, "due now, transport and attempts untouched", [ic.next_due_at, ic.verify_transport, ic.attempts]);
r = observed(ic.verify_probe);
ok(r.expected === "0" && r.observed === "2", "with 473 rows queued the probe counts the held rows older than 120 minutes (3 h and 50 h)", r);
db.exec("DELETE FROM idea_proposals WHERE idea IN ('three hours', 'fifty hours')");
r = observed(ic.verify_probe);
ok(r.expected === "0" && r.observed === "0", "it passes (0) once no cap hold is older than 120 minutes, though the queue is still over the cap", r);
hold.run("three hours", hoursAgo(3)); hold.run("fifty hours", hoursAgo(50));

// 4. decision and idempotency
const dec = () => db.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'IDEAS-CAP-RATE-1:') = 1").get().n;
ok(dec() === 1, "one decision_log row");
const dl = db.prepare("SELECT * FROM decision_log").get();
ok(dl.capability_gain && dl.predicted_outcome && dl.surfaces_tested && dl.rollback_path, "the decision names capability gain, predicted outcome, surfaces and rollback");
db.prepare("UPDATE remediation_contracts SET verify_probe = verify_probe || ' ' WHERE class = 'issue-100047'").run();
const edited = probeOf("issue-100047");
db.exec(sql);
ok(dec() === 1 && db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class LIKE 'fm-%'").get().n === 1, "re-applying adds no row");
ok((db.prepare("SELECT evidence FROM control_registry WHERE control = 'research-admission-cap'").get().evidence.match(/IDEAS-CAP-RATE-1 \(idea-hub 1\.12\.0/g) || []).length === 1, "the evidence note is appended once");
ok((db.prepare("SELECT location FROM control_registry WHERE control = 'research-admission-cap'").get().location.match(/capRelease trickle/g) || []).length === 1, "the location note is appended once");
ok(probeOf("issue-100047") === edited, "a later probe edit is not overwritten by a re-apply", probeOf("issue-100047").slice(-20));

// 5. rollback
db.exec(/^-- Rollback: (.*)$/m.exec(sql)[1]);
const back = db.prepare("SELECT * FROM control_registry WHERE control = 'research-admission-cap'").get();
ok(back.evidence === OLD_EVIDENCE + " (a test row read [research admission cap 300/120])" && back.location === OLD_LOC && back.alternate_tested_at === null, "the Rollback line restores the evidence, location and tested date", [back.evidence.slice(-60), back.location.slice(-40), back.alternate_tested_at]);
ok(back.alternate_path === OLD_ALT && back.reviewed_at === "2026-10-19T04:56:02Z", "the Rollback line restores the alternate path and the review date", [back.alternate_path.slice(-60), back.reviewed_at]);
ok(probeOf("issue-100047") === OLD_PROBE, "the Rollback line restores the generated probe byte for byte");
ok(db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 0 && db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class LIKE 'fm-%'").get().n === 0 && dec() === 1, "the Rollback line removes the failure mode and detector and leaves the append-only decision (the live triggers abort a DELETE)");

// 5b. decision_predictions_parse (live trigger) scores a predicted_outcome of the form "issue <id> closed within <N> h"; this one must parse.
{
  const po = db.prepare("SELECT predicted_outcome AS p FROM decision_log").get().p;
  const m = /^issue (\d+) closed within (\d+) h$/.exec(po);
  ok(m && m[1] === "100047" && Number(m[2]) > 0, "the predicted outcome is in the form the decision_predictions_parse trigger scores", po);
  let aborted = false;
  try { db.exec("DELETE FROM decision_log"); } catch (e) { aborted = /append-only/.test(String(e.message)); }
  ok(aborted, "the fixture's decision_log is append-only like the live table, so a Rollback DELETE would abort");
}

// 6. what the migration names is in the worker on main, and the mirror is identical
const w = readFileSync(root("idea-hub/worker.js"), "utf8");
ok(w.includes("ideas_cap_trickle_per_run"), "idea-hub reads the ops_config ideas_cap_trickle_per_run revert switch the migration names");
ok(/var CAP_TRICKLE_PER_RUN = 3;/.test(w) && w.includes("'idea-cap-trickle'") && /var RESEARCH_ADMISSION_CAP = 120;/.test(w), "idea-hub carries CAP_TRICKLE_PER_RUN = 3, the idea-cap-trickle kind and the cap of 120");
const ver = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(w);
ok(ver && (Number(ver[1]) > 1 || Number(ver[2]) >= 12), "idea-hub is at 1.12.0 or above", ver && ver[0]);
ok(readFileSync(root("idea-hub/deployed-current.worker.js"), "utf8") === w, "deployed-current.worker.js is byte-identical to worker.js");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link (CLOUDFLARE-ONLY-HOST-1)");
ok(!/(^|[^A-Za-z0-9_])#\d{2,}/.test(sql), "no bare issue-number references");
console.log(`ideas-cap-rate: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
