// SESSION-CLOSEOUT-20261026-REMEDIATE-OPEN-ISSUES offline suite: replays migrations/2026-10-26-session-closeout-remediate-open-issues.sql on node:sqlite.
// Proves: the file is ASCII only and opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, BACKUP table it creates itself, nothing deleted or dropped in the body); six BP26 issues get
// exactly one handoff block with a code-task line and a code-anchor line on lines of their own, an issue that already carries a code-task line is left alone; the contract of issue 1000470 is
// re-pointed once and only while it still names the guessed marker; one session record with honest counts and one decision_log row; a replay changes nothing; the Rollback line restores
// the descriptions and the probe from the backup and deletes the record. It reads no worker source: a test that pins live code state breaks on the next merge (GATE-GREEN-1).
// Output MUST contain "0 failed" on success.   node migrations/session-closeout-remediate-open-issues.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-session-closeout-remediate-open-issues.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

ok(!/[^\x00-\x7F]/.test(sql), "the file is ASCII only (D1-WRITE-ASCII-1)");
const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(header.some((l) => /^-- BACKUP: bak_20261026_remediate_orch\s*$/.test(l)) && /CREATE TABLE IF NOT EXISTS bak_20261026_remediate_orch AS/.test(body), "BACKUP header names the table the file creates first");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai or anthropic.com link in the file");
const likeLits = [...sql.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].map((m) => Buffer.byteLength(m[1]));
ok(likeLits.every((n) => n <= 50), "no LIKE or GLOB pattern above 50 bytes (D1 limit)", likeLits);

const IDS = [1000341, 1000344, 1000347, 1000340, 1000350, 1000351];
const OLD_PROBE = '{"paths": ["qnfo-cloud-ops/worker.js"], "contains": "proof-held"}';
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE session_records (session_id TEXT PRIMARY KEY, wbs_code TEXT NOT NULL, agent_name TEXT, summary TEXT NOT NULL, decisions_made TEXT, files_changed TEXT, commits TEXT, infrastructure_changes TEXT, handoff_notes TEXT, execution_ratio REAL, total_tasks INTEGER, completed_tasks INTEGER, started_at TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT DEFAULT 'open', updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, action TEXT, verify_probe TEXT, verify_transport TEXT, status TEXT, last_verdict TEXT, attempts INTEGER DEFAULT 0, deferred_since TEXT, next_due_at TEXT, module TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  for (const id of IDS) w.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (?, ?, ?, 'open')").run(id, "BP26 issue " + id, "original text " + id);
  w.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (1000470, 'RESEARCH-WATCHDOG-PROOF-HELD-1', 'watchdog text', 'open')").run();
  w.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (777, 'other issue', 'other text', 'open')").run();
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, action, verify_probe, verify_transport, status, last_verdict, attempts, module) VALUES ('issue-1000470', 1000470, 'old action', ?, 'code-read', 'active', 'fail', 3, 'old-module')").run(OLD_PROBE);
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, action, verify_probe, verify_transport, status, last_verdict, attempts, module) VALUES ('issue-777', 777, 'other action', 'SELECT 1', 'd1-query', 'active', 'fail', 2, 'other-module')").run();
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const snap = (w) => JSON.stringify([qa(w, "SELECT * FROM agent_issues ORDER BY id"), qa(w, "SELECT * FROM remediation_contracts ORDER BY class"), qa(w, "SELECT session_id, summary, total_tasks, completed_tasks FROM session_records"), qa(w, "SELECT action FROM decision_log"), qa(w, "SELECT * FROM bak_20261026_remediate_orch ORDER BY id")]);

const w = world();
w.exec(sql);
const bak = qa(w, "SELECT * FROM bak_20261026_remediate_orch ORDER BY id");
ok(bak.length === 7 && bak.find((r) => r.id === 1000470).verify_probe === OLD_PROBE && bak.find((r) => r.id === 1000341).description === "original text 1000341", "the backup holds the six descriptions and the old probe of 1000470", bak.length);

const paths = { 1000341: "personal-api/worker.js", 1000344: "personal-api/worker.js", 1000347: "personal-companion/worker.js", 1000340: "qnfo-social/worker.js", 1000350: "qnfo-ops/worker.js", 1000351: "q08-signal-engine/worker.js" };
for (const id of IDS) {
  const d = q1(w, "SELECT description FROM agent_issues WHERE id = ?", id).description;
  const lines = d.split("\n");
  const task = lines.filter((l) => l.startsWith("code-task: ")), anchor = lines.filter((l) => l.startsWith("code-anchor: "));
  ok(d.startsWith("original text " + id) && (d.match(/REM-ORCH 2026-10-26 \(handoff to the code loop/g) || []).length === 1, "issue " + id + ": original text kept and one handoff block appended");
  ok(task.length === 1 && task[0] === "code-task: repo=qnfo-workers path=" + paths[id], "issue " + id + ": one code-task line on a line of its own with path " + paths[id], task);
  ok(anchor.length === 1 && anchor[0].length > 30 && !/\\n/.test(d), "issue " + id + ": one code-anchor line, real newlines", anchor.length);
  ok(!/\b(secret|credential|password|api[ _-]?key|private key|rotate|revoke|drop table)\b/i.test(d.slice(("original text " + id).length)), "issue " + id + ": the appended text holds none of the words the planner refuses");
}
ok(q1(w, "SELECT description FROM agent_issues WHERE id = 777").description === "other text" && q1(w, "SELECT description FROM agent_issues WHERE id = 1000470").description === "watchdog text", "other issues keep their text");

const c = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000470'");
let spec = null;
try { spec = JSON.parse(c.verify_probe); } catch (e) { spec = null; }
ok(spec && spec.paths.length === 1 && spec.paths[0] === "qnfo-cloud-ops/worker.js" && typeof spec.contains === "string" && spec.contains.length > 40 && !/proof-held/.test(spec.contains) && Object.keys(spec).every((k) => ["paths", "contains", "absent"].includes(k)), "the probe of 1000470 is valid code-read JSON naming the added condition", c.verify_probe);
ok(c.status === "active" && c.attempts === 0 && c.last_verdict === null && c.module === "session-remediate-open-issues-1026" && /MEASURES the fix/.test(c.action), "the contract is re-armed active with attempts 0 and a measuring action", c);
const o = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-777'");
ok(o.verify_probe === "SELECT 1" && o.attempts === 2 && o.module === "other-module", "another issue's contract is untouched");

const sr = qa(w, "SELECT * FROM session_records");
ok(sr.length === 1 && sr[0].session_id === "session-remediate-open-issues-1026" && sr[0].wbs_code === "QNFO.OPS", "one session record for the orchestrator", sr.length);
ok(sr[0].total_tasks === 322 && sr[0].completed_tasks === 136 && Math.abs(sr[0].execution_ratio - 136 / 322) < 0.005, "honest counts: 136 of 322 with the matching ratio", [sr[0].total_tasks, sr[0].completed_tasks, sr[0].execution_ratio]);
ok(/REMEDIATE ALL|remediate all open/i.test(sr[0].summary) && /metrics_in_breach 62 to 78/.test(sr[0].summary) && /OPEN, each with its doer/.test(sr[0].handoff_notes) && sr[0].commits.length > 200, "summary, the metric movement and the open items with doers are written");
ok(sr[0].started_at === "2026-10-26T17:40:00Z" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(sr[0].completed_at), "start and completion times are ISO");
const dl = qa(w, "SELECT * FROM decision_log");
const cols = ["actor", "assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "surfaces_tested"];
ok(dl.length === 1 && cols.every((k) => typeof dl[0][k] === "string" && dl[0][k].trim().length > 3) && !cols.some((k) => / within /i.test(dl[0][k])), "one decision_log row with its columns filled and no ' within ' (a prediction form the scorecard parses)", dl.length);

// replay changes nothing
const s1 = snap(w);
w.exec(sql);
ok(snap(w) === s1, "a second apply changes nothing (issues, contracts, record, decision, backup)");
// an issue that already has a code-task line is left alone
{
  const x = world();
  x.prepare("UPDATE agent_issues SET description = description || char(10) || 'code-task: repo=qnfo-workers path=other/worker.js' WHERE id = 1000340").run();
  x.exec(sql);
  ok(q1(x, "SELECT description FROM agent_issues WHERE id = 1000340").description === "original text 1000340\ncode-task: repo=qnfo-workers path=other/worker.js", "an issue that already carries a code-task line is not extended");
  ok(q1(x, "SELECT description FROM agent_issues WHERE id = 1000341").description.includes("path=personal-api/worker.js"), "and the others still are");
}
// a contract that no longer names the guessed marker is not touched
{
  const x = world();
  x.prepare("UPDATE remediation_contracts SET verify_probe = ? WHERE class = 'issue-1000470'").run('{"paths": ["a/b.js"], "contains": "mine"}');
  x.exec(sql);
  ok(q1(x, "SELECT verify_probe v FROM remediation_contracts WHERE class = 'issue-1000470'").v === '{"paths": ["a/b.js"], "contains": "mine"}', "a probe that no longer names proof-held is left alone");
}
// rollback
{
  const r = world();
  r.exec(sql);
  r.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
  ok(IDS.every((id) => q1(r, "SELECT description FROM agent_issues WHERE id = ?", id).description === "original text " + id), "Rollback restores the six descriptions");
  ok(q1(r, "SELECT verify_probe v FROM remediation_contracts WHERE class = 'issue-1000470'").v === OLD_PROBE, "and the probe of 1000470");
  ok(q1(r, "SELECT COUNT(*) n FROM session_records").n === 0, "and deletes the session record");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
