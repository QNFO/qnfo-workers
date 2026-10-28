// CLUSTER-E-C offline suite for migrations/2026-10-28-cluster-e-c-failure-modes.sql (agent_issues 1000713 to 1000721).
// Replays the migration on node:sqlite against workflow definitions that carry the exact live fragments (read from qnfo-audit fleet_tasks on 2026-10-28) and proves:
// the three rc-agent steps treat a markup answer as unanswered and the request step is capped; the prompt gains the anchor rule; issue-probe-agent selects the vacuous
// issues of the two families; a second apply changes nothing; the shadow view counts single-pass closes; the re-armed probes return expected and observed;
// every code-task line names a file that exists. State-independent: no assertion reads the live code of the named files.
// Run: node --no-warnings migrations/cluster-e-c-failure-modes.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";

const here = new URL("./", import.meta.url);
const sql = readFileSync(new URL("2026-10-28-cluster-e-c-failure-modes.sql", here), "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+/m.test(sql) && /^-- BACKUP: bak_\w+$/m.test(sql), "migration headers present");
ok(!/\b(DELETE|DROP)\b/i.test(sql.replace(/^--.*$/gm, "")), "no DELETE or DROP in the body");

const A = "r.instance = 'root-cause-' || a.id AND COALESCE(r.result, '') NOT LIKE '(the model returned no text)%'";
const B = "r.instance = 'root-cause-' || agent_issues.id AND r.status IN ('done', 'failed', 'error') AND COALESCE(r.result, '') NOT LIKE '(the model returned no text)%'";
const C = "r.instance = 'root-cause-' || persona_actions.issue_id AND r.status IN ('done', 'failed', 'error') AND COALESCE(r.result, '') NOT LIKE '(the model returned no text)%'";
const OTHER = "p.kind = 'replan' AND r.status IN ('done', 'failed', 'error') AND COALESCE(r.result, '') NOT LIKE '(the model returned no text)%'";
const PROMPT = "Answer in under 300 words: the producer, as a code-task proposal with repo, path and the exact edit. If you can file it, file one agent_issues row with a code-task line.";
const mpDef = JSON.stringify({ steps: [
  { type: "sql", name: "rc-agent-request", db: "AUDIT", sql: "INSERT INTO cf_agent_requests (requester, kind, prompt, instance, priority) SELECT 'pm', 'run', '" + PROMPT + "', 'root-cause-' || a.id, 'high' FROM agent_issues a WHERE a.status = 'open' AND a.title LIKE 'ROOT-CAUSE-1:%' AND NOT EXISTS (SELECT 1 FROM cf_agent_requests r WHERE " + A + ") AND COALESCE((SELECT value FROM ops_config WHERE key = 'persona_actions'), 'on') <> 'off' ORDER BY a.id LIMIT 3" },
  { type: "sql", name: "rc-agent-report", db: "AUDIT", sql: "UPDATE agent_issues SET description = description || ' answered' WHERE status = 'open' AND id IN (SELECT p.issue_id FROM persona_actions p WHERE p.kind = 'agent-diagnose' AND p.to_value = 'requested') AND EXISTS (SELECT 1 FROM cf_agent_requests r WHERE " + B + ")" },
  { type: "sql", name: "rc-agent-mark", db: "AUDIT", sql: "UPDATE persona_actions SET to_value = 'reported' WHERE kind = 'agent-diagnose' AND to_value = 'requested' AND EXISTS (SELECT 1 FROM cf_agent_requests r WHERE " + C + ")" },
  { type: "sql", name: "other", db: "AUDIT", sql: "SELECT 1 FROM cf_agent_requests r WHERE " + OTHER },
] });
const ipaDef = JSON.stringify({ steps: [
  { type: "sql", name: "probe-request", db: "AUDIT", sql: "INSERT INTO cf_agent_requests (requester, kind, prompt, instance, priority) SELECT 'issue-probe-agent', 'run', 'p', 'probe-issue-' || a.id, 'medium' FROM agent_issues a LEFT JOIN remediation_contracts c ON c.class = 'issue-' || a.id WHERE a.status = 'open' AND COALESCE(c.status, 'none') NOT IN ('active', 'monitoring', 'holding') AND a.created_at < 0 AND a.title NOT LIKE 'PROBE-NEEDED-1%'" },
] });

const mk = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, definition TEXT, version INTEGER, updated_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT, created_at INTEGER DEFAULT 0);
CREATE TABLE persona_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, issue_id INTEGER, to_value TEXT);
CREATE TABLE cf_agent_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, requester TEXT, kind TEXT, prompt TEXT, instance TEXT, priority TEXT, status TEXT DEFAULT 'done', result TEXT, error TEXT, finished_at TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, status TEXT, attempts INTEGER, next_due_at TEXT, action TEXT, precondition TEXT, last_verdict TEXT, verify_probe TEXT, verify_transport TEXT);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, class TEXT, issue_id INTEGER, pass INTEGER, observed TEXT, verified_at TEXT, transport TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, reopened_count INTEGER, close_evidence TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, surfaces_tested TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY);
`);
  db.prepare("INSERT INTO fleet_tasks VALUES ('management-personas', ?, 11, 'x')").run(mpDef);
  db.prepare("INSERT INTO fleet_tasks VALUES ('issue-probe-agent', ?, 1, 'x')").run(ipaDef);
  const ins = db.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (?, ?, ?, 'open')");
  for (const [id, t] of [[1000301, "ROOT-CAUSE-1: A keeps recurring"], [1000302, "ROOT-CAUSE-1: B keeps recurring"], [1000303, "ROOT-CAUSE-1: C keeps recurring"]]) ins.run(id, t, "d");
  db.prepare("UPDATE agent_issues SET description = 'd ... no answer yet; the managers ask again' WHERE id = 1000301").run();
  for (const id of [1000713, 1000714, 1000715, 1000716, 1000717, 1000718, 1000719, 1000720, 1000721]) ins.run(id, "ROADMAP-1: x", "text");
  db.prepare("INSERT INTO persona_actions (kind, issue_id, to_value) VALUES ('agent-diagnose', 1000301, 'reported')").run();
  db.prepare("INSERT INTO cf_agent_requests (instance, status, result) VALUES ('root-cause-1000301', 'done', 'Producer: the lifecycle rule. Fix: change the probe.')").run();
  for (const id of [1000717, 1000718, 1000719, 1000720, 1000721]) db.prepare("INSERT INTO remediation_contracts (class, issue_id, status, last_verdict) VALUES (?, ?, 'superseded', 'superseded:x')").run("issue-" + id, id);
  return db;
};

const db = mk();
db.exec(sql);
const mp = db.prepare("SELECT definition, version FROM fleet_tasks WHERE id = 'management-personas'").get();
const steps = JSON.parse(mp.definition).steps;
const step = n => steps.find(s => s.name === n).sql;
ok(mp.version === 12, "management-personas version moved once", mp.version);
for (const n of ["rc-agent-request", "rc-agent-report", "rc-agent-mark"]) ok(/NOT LIKE '%tool_call%'/.test(step(n)) && /NOT LIKE '%DSML%'/.test(step(n)), n + " excludes markup answers");
ok(step("other") === "SELECT 1 FROM cf_agent_requests r WHERE " + OTHER, "a step outside the root-cause path is byte for byte unchanged");
ok(/confirmed that the code-anchor text occurs exactly once in it/.test(step("rc-agent-request")) && /D1 trigger, view, migration or fleet_tasks step/.test(step("rc-agent-request")), "the prompt carries the anchor and layer rule");
ok(JSON.parse(db.prepare("SELECT definition FROM fleet_tasks WHERE id = 'issue-probe-agent'").get().definition).steps[0].sql.includes("c.action LIKE 'VACUOUS-PROBE%'"), "issue-probe-agent selects vacuous-probe issues of the two families");
db.exec(sql);
{
  const again = db.prepare("SELECT version FROM fleet_tasks WHERE id = 'management-personas'").get().version;
  ok(again === 12, "a second apply changes nothing (version stays)", again);
  ok(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM failure_modes").get().n === 3, "decision_log and failure_modes are written once");
}
ok(db.prepare("SELECT to_value v FROM persona_actions WHERE issue_id = 1000301").get().v === "requested", "the stale reported row is set back to requested");

// behaviour of the edited request step: a markup answer is re-asked, a clean one is not, six requests stop it
const run = (stepName) => db.exec(step(stepName));
const cnt = id => db.prepare("SELECT COUNT(*) n FROM cf_agent_requests WHERE instance = 'root-cause-' || ?").get(String(id)).n;
const before = cnt(1000302);
run("rc-agent-request");
ok(cnt(1000302) === before + 1 && cnt(1000303) === 1 && cnt(1000301) === 1, "request step asks issues with no clean answer and leaves 1000301 (clean answer) alone", [cnt(1000301), cnt(1000302), cnt(1000303)]);
db.prepare("UPDATE cf_agent_requests SET result = '<|tool_calls_section_begin|><|tool_call_begin|>functions.x' WHERE instance = 'root-cause-1000302'").run();
db.prepare("UPDATE cf_agent_requests SET result = 'x <invoke name=y>' WHERE instance = 'root-cause-1000303'").run();
run("rc-agent-request");
ok(cnt(1000302) === 2 && cnt(1000303) === 2, "a markup answer is re-asked", [cnt(1000302), cnt(1000303)]);
for (let i = 0; i < 6; i++) { db.prepare("UPDATE cf_agent_requests SET result = '<tool_call>' WHERE instance IN ('root-cause-1000302', 'root-cause-1000303')").run(); run("rc-agent-request"); }
ok(cnt(1000302) === 6 && cnt(1000303) === 6, "the request step stops at six requests per issue", [cnt(1000302), cnt(1000303)]);
db.prepare("INSERT INTO persona_actions (kind, issue_id, to_value) VALUES ('agent-diagnose', 1000302, 'requested')").run();
run("rc-agent-report");
ok(!/answered/.test(db.prepare("SELECT description d FROM agent_issues WHERE id = 1000302").get().d), "the report step writes no markup answer");
run("rc-agent-report");
ok(/answered/.test(db.prepare("SELECT description d FROM agent_issues WHERE id = 1000301").get().d), "the report step appends the clean answer for the stale issue");

// shadow view
db.exec(`INSERT INTO remediation_verifications (class, issue_id, pass, observed, verified_at) VALUES
 ('issue-7', 7, 1, '0', '2026-10-28 10:00:00'), ('issue-7', 7, 1, '0', '2026-10-28 10:30:00'), ('issue-7', 7, 1, '0', '2026-10-28 11:00:00'),
 ('issue-8', 8, 1, '0', '2026-10-28 12:00:00');
 INSERT INTO issue_triage VALUES (7, 3, 'remediation_verifications#3 pass=1 class=issue-7'), (8, 2, 'remediation_verifications#4 pass=1 class=issue-8'), (9, 1, 'remediation_verifications#4 pass=1 class=issue-8');`);
const sv = db.prepare("SELECT issue_id, prior_passes_60m p, single_pass_close s FROM v_close_dwell_shadow ORDER BY issue_id").all();
ok(sv.length === 2 && sv[0].issue_id === 7 && sv[0].p === 2 && sv[0].s === 0 && sv[1].issue_id === 8 && sv[1].s === 1, "shadow view: dwell of two prior passes is not single, a lone pass is single, reopened_count < 2 is excluded", sv);
ok(db.prepare("SELECT open_issues, on_vacuous_probe FROM v_vacuous_probe_share").get().open_issues >= 12, "vacuous share view answers");

// probes
for (const id of [1000717, 1000718, 1000719, 1000720, 1000721]) {
  const c = db.prepare("SELECT status, verify_probe p FROM remediation_contracts WHERE class = ?").get("issue-" + id);
  ok(c.status === "active", id + " contract re-armed");
  let row; try { row = db.prepare(c.p).get(); } catch (e) { row = { err: String(e.message) }; }
  ok(row && "expected" in row && "observed" in row, id + " probe returns expected and observed", row);
  ok(!/\b(insert|update|delete|drop|alter|create|replace)\s/i.test(c.p), id + " probe is read-only");
}
ok(db.prepare(db.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = 'issue-1000718'").get().p).get().observed === "1", "FM-2 probe passes on the migrated prompt");
ok(db.prepare(db.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = 'issue-1000721'").get().p).get().observed === "1", "FM-5 probe passes on a small table");

// doers
let withTask = 0;
for (const r of db.prepare("SELECT id, description FROM agent_issues WHERE id BETWEEN 1000713 AND 1000716").all()) {
  const path = /^code-task: repo=qnfo-workers path=(\S+)$/m.exec(r.description), anchor = /^code-anchor: (.+)$/m.exec(r.description);
  ok(!!path && !!anchor, r.id + ": code-task and code-anchor lines");
  if (path) { withTask++; ok(existsSync(new URL("../" + path[1], here)), r.id + ": " + path[1] + " exists"); }
}
ok(withTask === 4, "four EK issues carry a code-task");
for (const id of [1000717, 1000718, 1000719, 1000720, 1000721]) ok(/DOER cluster-e-c/.test(db.prepare("SELECT description d FROM agent_issues WHERE id = ?").get(id).d), id + " names its doer");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
