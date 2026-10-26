// MANAGEMENT-PERSONAS-4 / MANAGERS-PARKED-1 offline suite: applies migrations/2026-10-26-management-personas.sql, -2, -3 and -4 on SQLite
// with the table shapes of the earlier suites plus code_tasks (columns read from qnfo-audit on 2026-10-26) and cf_agent_requests, models the
// live close trigger, and runs the managers' workflow steps the way fleet-exec does. Proves: the parked-* steps are appended once; a parked task
// whose issue is closed is superseded with a persona_actions row; a task parked 30 minutes or more on an open issue gets one Cloudflare agent
// request and is returned to the fleet as failed; a task parked under 30 minutes waits; the agent's answer is appended to the issue once;
// persona_actions = off stops the decisions; a re-apply adds no second set of steps.
// Run: node migrations/management-personas-4.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const sqls = ["./2026-10-26-management-personas.sql", "./2026-10-26-management-personas-2.sql", "./2026-10-26-management-personas-3.sql"].map(rd);
const sql4 = rd("./2026-10-26-management-personas-4.sql");
const suite1 = rd("./management-personas.test.mjs");
const schema = suite1.slice(suite1.indexOf("db.exec(`") + 9, suite1.indexOf("`);", suite1.indexOf("db.exec(`")));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(schema);
db.exec(`ALTER TABLE agent_issues ADD COLUMN close_channel TEXT;
ALTER TABLE remediation_contracts ADD COLUMN last_verdict TEXT;
ALTER TABLE remediation_contracts ADD COLUMN last_attempt_at TEXT;
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT, triage_state TEXT, owner TEXT, sla_due_at TEXT, triaged_at TEXT, remediation TEXT, close_evidence TEXT, reopened_count INTEGER);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, event TEXT, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
ALTER TABLE remediation_contracts ADD COLUMN precondition TEXT; ALTER TABLE remediation_contracts ADD COLUMN action TEXT; ALTER TABLE remediation_contracts ADD COLUMN verify_probe TEXT; ALTER TABLE remediation_contracts ADD COLUMN verify_transport TEXT; ALTER TABLE remediation_contracts ADD COLUMN max_attempts INTEGER; ALTER TABLE remediation_contracts ADD COLUMN escalate_to TEXT; ALTER TABLE remediation_contracts ADD COLUMN expected_cadence_h INTEGER;
CREATE VIEW v_output_quality_headline AS SELECT 6 AS better, 0 AS worse, 1 AS flat, 2 AS unmeasured, 'ask' AS gaps, 'improving_with_gaps' AS verdict;
CREATE TABLE cf_agent_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, requester TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'run', prompt TEXT, code TEXT, cron TEXT, delay_s INTEGER, instance TEXT, priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, run_id TEXT, result TEXT, error TEXT, created_at TEXT, started_at TEXT, finished_at TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, repo TEXT, path TEXT, goal TEXT, status TEXT, step TEXT, attempts INTEGER, model TEXT, ctx TEXT, branch TEXT, pr_url TEXT, last_error TEXT, lease_until TEXT, created_at TEXT, updated_at TEXT, merged_by TEXT, merged_sha TEXT, merged_at TEXT, merge_state TEXT, merge_note TEXT);
CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues WHEN NEW.status = 'closed' AND OLD.status = 'open' BEGIN
  SELECT RAISE(ABORT, 'close-without-evidence') WHERE COALESCE((SELECT close_evidence FROM issue_triage WHERE issue_id = NEW.id), '') = '';
END;`);
db.exec("INSERT INTO fleet_tasks (id, name, type, definition, version) VALUES ('portfolio-autopilot', 'ap', 'workflow', '{\"steps\":[]}', 1)");
for (const s of sqls) db.exec(s);
const run = (s, ...a) => db.prepare(s).run(...a);
const q = (s, ...a) => db.prepare(s).all(...a);
const one = (s, ...a) => db.prepare(s).get(...a);
const before = JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps.length;
db.exec(sql4);
ok(true, "the four migrations apply");
const def = () => JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps;
const names = def().map((s) => s.name);
ok(names.length === before + 7 && names.slice(-7).join(",") === "parked-supersede-log,parked-supersede,parked-agent-request,parked-return-log,parked-return,parked-report,parked-report-mark", "seven parked-* steps are appended", names.slice(-8));
ok(one("SELECT definition FROM bak_20261026_mp4_workflow WHERE id = 'management-personas'") && JSON.parse(one("SELECT definition FROM bak_20261026_mp4_workflow").definition).steps.length === before, "the backup keeps the workflow before the change");
db.exec(sql4.slice(0, sql4.lastIndexOf("\nINSERT INTO decision_log")));
ok(def().length === before + 7, "a re-apply adds no second set of steps");

const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString().replace(/\.\d+Z$/, "Z");
run("INSERT INTO agent_issues (id, title, priority, status, source, created_at) VALUES (501, 'OPEN-1: real defect', 'medium', 'open', 'session', 1), (502, 'CLOSED-1: fixed', 'medium', 'closed', 'session', 1), (503, 'OPEN-2: new', 'medium', 'open', 'session', 1)");
run("INSERT INTO code_tasks (id, path, goal, status, last_error, created_at, updated_at) VALUES ('ct_im501', 'a/worker.js', 'FIX -- issue #501 (dispatch)', 'needs_human', 'file larger than 900000 chars needs an anchor', ?, ?)", iso(90), iso(90));
run("INSERT INTO code_tasks (id, path, goal, status, last_error, created_at, updated_at) VALUES ('ct_x502', 'b/worker.js', '[issue #502] fixed thing', 'needs_human', 'no deterministic verifier for .sql', ?, ?)", iso(5), iso(5));
run("INSERT INTO code_tasks (id, path, goal, status, last_error, created_at, updated_at) VALUES ('ct_im503', 'c/worker.js', 'NEW -- issue #503', 'needs_human', 'model proposed no change', ?, ?)", iso(10), iso(10));
run("INSERT INTO code_tasks (id, path, goal, status, last_error, created_at, updated_at) VALUES ('ct_orphan', 'd/worker.js', 'no issue named here', 'needs_human', 'x', ?, ?)", iso(90), iso(90));
run("INSERT INTO code_tasks (id, path, goal, status, last_error, created_at, updated_at) VALUES ('ct_im504', 'e/worker.js', 'ROUTED -- issue #501', 'failed', 'HUMAN-ITEMS-AUTOMATIC-1: returned to the fleet, not the owner (was needs_human; revert: status needs_human): model proposed no change', ?, ?)", iso(60), iso(60));
run("INSERT INTO code_tasks (id, path, goal, status, last_error, created_at, updated_at) VALUES ('ct_old', 'e/worker.js', 'OLD -- issue #501', 'failed', 'ordinary failure', ?, ?)", iso(60), iso(60));
const steps = def().filter((s) => s.name.startsWith("parked-"));
const tick = () => { for (const s of steps) { try { db.prepare(s.sql).all(); } catch (e) { ok(false, "step " + s.name + " runs", String(e)); throw e; } } };
const st = (id) => one("SELECT status, merge_note FROM code_tasks WHERE id = ?", id);
tick();
ok(st("ct_x502").status === "superseded" && /moot/.test(st("ct_x502").merge_note), "a parked task of a closed issue is superseded", st("ct_x502"));
ok(st("ct_orphan").status === "superseded", "a parked task naming no issue is superseded", st("ct_orphan"));
ok(st("ct_im501").status === "failed" && /returned to the fleet/.test(st("ct_im501").merge_note), "a task parked 90 minutes on an open issue is returned to the fleet", st("ct_im501"));
ok(st("ct_im503").status === "needs_human", "a task parked 10 minutes waits for the grace period", st("ct_im503"));
ok(st("ct_im504").status === "failed" && /^MANAGERS-PARKED-1: returned/.test(st("ct_im504").merge_note || ""), "a task the PR 4444 trigger routed to failed is re-planned by the managers", st("ct_im504"));
ok(st("ct_old").merge_note == null, "an ordinary failed task is left alone", st("ct_old"));
const reqs = q("SELECT instance, requester, priority, prompt FROM cf_agent_requests");
ok(reqs.length === 2 && reqs.some((r) => r.instance === "parked-ct_im504") && reqs[0].instance === "parked-ct_im501" && reqs[0].priority === "medium" && /code-anchor/.test(reqs[0].prompt) && /issue #501/.test(reqs[0].prompt), "one Cloudflare agent re-plan is requested", reqs);
const pa = q("SELECT kind, issue_id, from_value, to_value FROM persona_actions WHERE kind IN ('supersede-task', 'replan') ORDER BY id");
ok(pa.filter((p) => p.kind === "supersede-task").length === 2 && pa.filter((p) => p.kind === "replan" && p.issue_id === 501 && p.to_value === "failed").length === 2, "each decision is a persona_actions row", pa);
tick();
ok(q("SELECT * FROM cf_agent_requests").length === 2 && q("SELECT * FROM persona_actions WHERE kind = 'replan'").length === 2, "a second tick requests and logs nothing twice");
run("UPDATE cf_agent_requests SET status = 'done', result = 'anchor: function foo() {' WHERE instance = 'parked-ct_im501'");
tick();
const d = one("SELECT description FROM agent_issues WHERE id = 501").description || "";
ok(/Re-plan by the Cloudflare agent for parked code task ct_im501: anchor: function foo\(\) \{/.test(d), "the agent's answer is appended to the issue", d);
ok(q("SELECT from_value, to_value FROM persona_actions WHERE kind = 'replan' ORDER BY id").map((r) => r.to_value).join(",") === "reported,failed", "only the replan whose answer was appended is marked reported");
run("UPDATE cf_agent_requests SET status = 'done', result = 'moot: fixed upstream' WHERE instance = 'parked-ct_im504'");
tick();
ok(/task ct_im504: moot: fixed upstream/.test(one("SELECT description FROM agent_issues WHERE id = 501").description) && q("SELECT * FROM persona_actions WHERE kind = 'replan' AND to_value = 'reported'").length === 2, "a second task on the same issue is appended on a later tick");
tick();
ok((one("SELECT description FROM agent_issues WHERE id = 501").description || "").split("Re-plan by").length === 3, "each answer is appended once");
run("INSERT INTO ops_config (key, value) VALUES ('persona_actions', 'off') ON CONFLICT(key) DO UPDATE SET value = 'off'");
run("UPDATE code_tasks SET updated_at = ? WHERE id = 'ct_im503'", iso(60));
run("INSERT INTO code_tasks (id, path, goal, status, created_at, updated_at) VALUES ('ct_y502', 'b/worker.js', 'issue #502 again', 'needs_human', ?, ?)", iso(60), iso(60));
tick();
ok(st("ct_im503").status === "needs_human" && st("ct_y502").status === "needs_human" && q("SELECT * FROM cf_agent_requests").length === 2, "persona_actions = off stops the decisions");
ok(/^-- APPLY-BY: ci$/m.test(sql4) && /^-- DB: qnfo-audit$/m.test(sql4) && /^-- Rollback: /m.test(sql4), "the header opts in to the runner");
console.log("management-personas-4: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
