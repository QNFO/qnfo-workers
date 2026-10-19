// DEAD-END-DOER-1 offline suite: applies 2026-10-19-contract-dead-end-doer.sql on SQLite and proves the view v_issue_dead_end lists exactly the open
// non-metric issues older than 120 minutes that have no active or holding contract, names each one's reason, lane and next actor, leaves the
// metric, young, closed and live-contract issues out, does not confuse issue #10 with the code task of issue #100, that the detector contract
// counts the issues no task is working on, that the apply writes nothing to any existing row (no re-armed contract, no code task, no issue), that
// a second apply is a no-op and that the Rollback header undoes it.
// Run: node migrations/contract-dead-end-doer.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const sql = readFileSync(join(here, "2026-10-19-contract-dead-end-doer.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, priority TEXT, source TEXT, description TEXT, created_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, goal TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE issue_plans (issue_id INTEGER PRIMARY KEY, planned_at TEXT, outcome TEXT NOT NULL);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;`);

const ms = (minutesAgo) => (Math.floor(Date.now() / 1000) - minutesAgo * 60) * 1000;
const issue = db.prepare("INSERT INTO agent_issues (id, title, status, priority, source, description, created_at) VALUES (?, ?, ?, ?, 'session-chatbox', ?, ?)");
const contract = db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict, ts) VALUES (?, ?, 'p', 'a', 'SELECT 1', 'd1-query', 'x', ?, ?, ?)");
const task = db.prepare("INSERT INTO code_tasks (id, goal, status, created_at) VALUES (?, ?, ?, ?)");
const plan = db.prepare("INSERT INTO issue_plans (issue_id, planned_at, outcome) VALUES (?, 'x', ?)");
const SUP = (what) => "superseded:" + what + " (long text)";

issue.run(1, "A", "open", "medium", "", ms(300));
contract.run("issue-1", 1, "superseded", SUP("probe-unusable"), "2026-10-18 10:00:00"); plan.run(1, "untrusted");
issue.run(2, "B", "open", "high", "code-task: repo=qnfo-workers path=x/worker.js", ms(500));
contract.run("issue-2", 2, "superseded", SUP("closure-observing-probe"), "2026-10-18 10:00:00"); task.run("ct_im2", "B -- issue #2 (RED-DRAIN-1 dispatch). Definition of done", "merged", "2026-10-18T10:00:00Z");
issue.run(3, "C", "open", "medium", "", ms(200));
contract.run("issue-3", 3, "superseded", SUP("closure-observing-probe-at-birth"), "2026-10-18 10:00:00"); plan.run(3, "not-code");
issue.run(4, "D", "open", "medium", "", ms(400));
contract.run("issue-4", 4, "needs-machine-probe", null, "2026-10-18 10:00:00");
issue.run(5, "E active", "open", "medium", "", ms(300)); contract.run("issue-5", 5, "active", "fail", "2026-10-18 10:00:00");
issue.run(6, "METRIC-TRIGGER-9-X: a metric", "open", "high", "", ms(300)); contract.run("issue-6", 6, "superseded", SUP("closure-observing-probe"), "2026-10-18 10:00:00");
issue.run(7, "G young", "open", "medium", "", ms(30)); contract.run("issue-7", 7, "superseded", SUP("probe-unusable"), "2026-10-18 10:00:00");
issue.run(8, "H closed", "closed", "medium", "", ms(300)); contract.run("issue-8", 8, "superseded", SUP("probe-unusable"), "2026-10-18 10:00:00");
issue.run(9, "I no contract", "open", "medium", "", ms(600));
issue.run(10, "J task in flight", "open", "medium", "", ms(250));
contract.run("issue-10", 10, "superseded", SUP("closure-observing-probe"), "2026-10-18 10:00:00"); task.run("ct_im10", "J -- issue #10 (RED-DRAIN-1 dispatch). Definition", "queued", "2026-10-19T10:00:00Z");
issue.run(11, "K holding wins", "open", "medium", "", ms(300));
contract.run("issue-11", 11, "superseded", SUP("probe-unusable"), "2026-10-18 10:00:00"); contract.run("issue-11-b", 11, "holding", "pass", "2026-10-17 10:00:00");
issue.run(12, "L task ended", "open", "medium", "", ms(350));
contract.run("issue-12", 12, "superseded", SUP("closure-observing-probe"), "2026-10-18 10:00:00"); task.run("ct_12a", "[issue #12] L", "failed", "2026-10-18T09:00:00Z"); task.run("ct_12b", "[issue #12] L again", "needs_human", "2026-10-18T11:00:00Z");
issue.run(13, "M unrelated task", "open", "medium", "", ms(310));
contract.run("issue-13", 13, "superseded", SUP("closure-superseded"), "2026-10-18 10:00:00"); task.run("ct_130", "[issue #130] something else", "queued", "2026-10-19T10:00:00Z"); task.run("ct_n", "fix #13 elsewhere, no marker", "queued", "2026-10-19T10:00:00Z");
issue.run(14, "N newest contract decides", "open", "high", "", ms(900));
contract.run("issue-14-old", 14, "superseded", SUP("probe-unusable"), "2026-10-10 10:00:00"); contract.run("issue-14", 14, "escalated", "escalated:over-retried (x)", "2026-10-18 10:00:00");

const snapshot = () => JSON.stringify([db.prepare("SELECT * FROM agent_issues ORDER BY id").all(), db.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), db.prepare("SELECT * FROM code_tasks ORDER BY id").all(), db.prepare("SELECT * FROM issue_plans ORDER BY issue_id").all()]);
const before = snapshot();
db.exec(sql);
const after = JSON.parse(snapshot());
const prior = JSON.parse(before);
ok(JSON.stringify(after[0]) === JSON.stringify(prior[0]) && JSON.stringify(after[2]) === JSON.stringify(prior[2]) && JSON.stringify(after[3]) === JSON.stringify(prior[3]), "the apply changes no issue, code task or plan");
const added = after[1].filter((c) => !prior[1].some((p) => p.class === c.class));
ok(added.length === 1 && added[0].class === "fm-open-issue-no-doer" && after[1].length === prior[1].length + 1 && prior[1].every((p) => JSON.stringify(after[1].find((c) => c.class === p.class)) === JSON.stringify(p)), "the apply adds one detector contract and re-arms or edits none", added.map((c) => c.class));

const v = db.prepare("SELECT * FROM v_issue_dead_end").all();
const byId = Object.fromEntries(v.map((r) => [r.issue_id, r]));
ok(JSON.stringify(v.map((r) => r.issue_id)) === JSON.stringify([14, 2, 9, 4, 12, 13, 1, 10, 3]), "the view lists the dead ends, high before medium then oldest first", v.map((r) => r.issue_id));
ok(!byId[5] && !byId[6] && !byId[7] && !byId[8] && !byId[11], "live-contract, metric, young, closed and holding-contract issues are left out");
ok(byId[1].reason === "probe-unusable" && byId[1].lane === "planner-untrusted" && byId[1].next_actor === "probe-author" && byId[1].contract_class === "issue-1" && byId[1].has_code_task_line === 0, "an untrusted-origin issue with a probe-unusable contract", byId[1]);
ok(byId[2].reason === "closure-observing-probe" && byId[2].lane === "doer-merged-dod-unmeasured" && byId[2].has_code_task_line === 1 && byId[2].code_task_status === "merged" && byId[2].priority === "high", "a merged task whose definition of done nothing measures", byId[2]);
ok(byId[3].reason === "closure-observing-probe" && byId[3].lane === "planner-not-code", "the at-birth closure-observing verdict reads as closure-observing-probe and the planner outcome names the lane", byId[3]);
ok(byId[4].reason === "needs-machine-probe" && byId[4].contract_status === "needs-machine-probe" && byId[4].lane === "unplanned", "a needs-machine-probe contract with no plan", byId[4]);
ok(byId[9].reason === "no-contract" && byId[9].contract_class === null && byId[9].lane === "unplanned", "an issue with no contract at all", byId[9]);
ok(byId[10].lane === "task-in-flight" && byId[10].next_actor === "qnfo-code-orchestrator" && byId[10].code_task_status === "queued", "an unfinished code task makes the code loop the next actor", byId[10]);
ok(byId[12].lane === "task-ended" && byId[12].code_task_status === "needs_human", "the newest code task decides (needs_human after failed)", byId[12]);
ok(byId[13].lane === "unplanned" && byId[13].code_task_status === null && byId[13].reason === "closure-superseded", "issue #13 is not matched to the task of issue #130 or to a goal with no issue marker", byId[13]);
ok(byId[14].reason === "escalated" && byId[14].contract_class === "issue-14", "the newest contract decides the reason (an escalated one reads as its status)", byId[14]);
ok(v.every((r) => r.age_min >= 120), "every row is older than 120 minutes", v.map((r) => r.age_min));
ok(v.find((r) => r.issue_id === 14).age_min >= 899 && v.find((r) => r.issue_id === 14).age_min <= 901, "age_min is whole minutes since the issue was filed", v.find((r) => r.issue_id === 14).age_min);

// the detector
const det = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-open-issue-no-doer'").get();
ok(det.issue_id === null && det.status === "active" && det.verify_transport === "d1-query" && det.expected_cadence_h === 1, "the detector is an active hourly d1-query contract with no issue", det);
const obs = db.prepare(det.verify_probe).get();
ok(obs.expected === "0" && obs.observed === String(v.length - 1), "the detector counts the dead ends no task is working on (9 rows, one in flight)", obs);
ok(!det.verify_probe.includes(";") && /^select /i.test(det.verify_probe) && !/agent_issues|insert into|update |delete from/i.test(det.verify_probe), "the detector is a literal read-only select that reads the view, not the issues");
db.exec("UPDATE code_tasks SET status = 'merged' WHERE id = 'ct_im10'");
ok(db.prepare(det.verify_probe).get().observed === String(v.length), "when the task in flight ends without a probe, the detector counts it");
db.exec("DELETE FROM agent_issues"); // every dead end gone
ok(db.prepare(det.verify_probe).get().observed === "0", "the detector reads 0 when no dead end is left");
const fm = db.prepare("SELECT * FROM failure_modes WHERE fm_key = 'open-issue-no-doer'").get();
ok(fm && fm.probe_class === "fm-open-issue-no-doer" && fm.first_seen === "2026-10-19" && fm.issue_id === null, "the failure mode row names its detector class", fm && fm.probe_class);
const dl = db.prepare("SELECT predicted_outcome, action FROM decision_log").all();
ok(dl.length === 1 && dl[0].action.startsWith("DEAD-END-DOER-1:") && /^[a-z_]+ = 0 within 2 h$/.test(dl[0].predicted_outcome), "one decision_log row with a parsed prediction", dl);

// idempotence and rollback
db.exec(sql);
ok(db.prepare("SELECT COUNT(*) AS n FROM failure_modes").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-open-issue-no-doer'").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "a second apply is a no-op");
const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback:")).slice(12);
db.exec(rb);
ok(!db.prepare("SELECT name FROM sqlite_master WHERE name = 'v_issue_dead_end'").get() && !db.prepare("SELECT 1 FROM failure_modes").get() && !db.prepare("SELECT 1 FROM remediation_contracts WHERE class = 'fm-open-issue-no-doer'").get(), "the Rollback header removes the view, the failure mode and the detector");

console.log(`contract-dead-end-doer: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
