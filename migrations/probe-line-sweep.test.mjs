// PROBE-LINE-SWEEP-1 offline suite: runs migrations/2026-10-19-probe-line-sweep.sql on SQLite. Proves: an open issue whose runtime-probe
// or code-probe line was left with only the vacuous closure-observing contract (the live state of 100039-100056 on 2026-10-19) gets the
// line as an active runner-https or code-read contract at apply; a probe set on purpose is not touched; a closed issue is not touched; an
// unparseable line is not armed but is counted by the new fm-probe-line-unparsed detector once it is 20 minutes old (the old detector read
// 0 on the same rows); the fleet_tasks workflow arms an issue filed after the apply, including one with no contract at all; re-running the
// workflow changes nothing; the Rollback header restores the backed-up contracts.
// Run: node migrations/probe-line-sweep.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-probe-line-sweep.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT, created_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER, retries INTEGER, version INTEGER, enabled INTEGER, updated_at TEXT);
CREATE TABLE fleet_crons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, cron_expr TEXT NOT NULL, task_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, timezone TEXT, last_fired TEXT, next_fire TEXT, updated_at TEXT);`);
const old = Date.now() - 3600e3;
const vac = (id) => "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = " + id + ") AS observed";
const issue = db.prepare("INSERT INTO agent_issues VALUES (?,?,?,?,?)");
const rc = db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, last_verdict) VALUES (?,?,?,?,?,?,?,?,?,?)");
const addVac = (id) => rc.run("issue-" + id, id, "p", "a", vac(id), "d1-query", "x", "superseded", "probe-template-v3-generic", "superseded:closure-observing-probe-at-birth");
issue.run(100039, "rt", 'Done when.\nruntime-probe: {"url": "https://qnfo-memory-mcp.q08.workers.dev/health", "status": 200, "contains": "fleet-graph"}', "open", old); addVac(100039);
issue.run(100040, "cp", 'Edit.\ncode-task: repo=qnfo-workers path=personal-companion/wellbeing.js\ncode-probe: {"paths": ["personal-companion/worker.js"], "contains": "zelfmoord"}', "open", old); addVac(100040);
issue.run(100041, "absent", 'x\ncode-probe: {"paths": ["personal-api/worker.js"], "absent": "if (r === \\"context\\" && m === \\"GET\\")"}', "open", old); addVac(100041);
issue.run(1, "deliberate", 'x\nruntime-probe: {"url": "https://a.example/", "contains": "old"}', "open", old);
rc.run("issue-1", 1, "p", "a", '{"url": "https://b.example/", "contains": "chosen"}', "runner-https", "x", "active", "probe-author", null);
issue.run(2, "closed", 'x\ncode-probe: {"paths": ["a.js"], "contains": "b"}', "closed", old); addVac(2);
issue.run(3, "bad line", 'x\nruntime-probe: {"url": "http://insecure/", "contains": "y"}', "open", old); addVac(3);
issue.run(4, "needs", 'x\ncode-probe: {"paths": ["q.js"], "absent": "z"}', "open", old);
rc.run("issue-4", 4, "p", "a", "needs-machine-probe", "d1-query", "x", "needs-machine-probe", "birth", null);
rc.run("fm-probe-line-unparsed", null, "p", "a", "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE a.status = 'open' AND c.status = 'needs-machine-probe' AND (instr(a.description, 'runtime-probe: {') > 0 OR instr(a.description, 'code-probe: {') > 0)) AS TEXT) AS observed", "d1-query", "x", "active", "failure-mode", null);
const det = () => db.prepare(db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-probe-line-unparsed'").get().verify_probe).get();
ok(det().observed === "1", "BLIND SPOT before the apply: the old detector counts only the needs-machine-probe row, not the 4 superseded ones", det());
const statements = (s) => { const out = []; let cur = ""; for (const line of s.split("\n")) { if (/^\s*--/.test(line)) continue; cur += line + "\n"; if (/;\s*$/.test(line)) { out.push(cur.trim()); cur = ""; } } if (cur.trim()) out.push(cur.trim()); return out; };
for (const st of statements(sql)) db.exec(st);
const row = (c) => db.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(c);
let r = row("issue-100039");
ok(r.status === "active" && r.verify_transport === "runner-https" && JSON.parse(r.verify_probe).contains === "fleet-graph" && r.module === "probe-line-sweep-v1", "runtime-probe line armed as runner-https", r);
r = row("issue-100040");
ok(r.status === "active" && r.verify_transport === "code-read" && JSON.parse(r.verify_probe).contains === "zelfmoord", "code-probe line armed as code-read", r);
r = row("issue-100041");
ok(r.status === "active" && JSON.parse(r.verify_probe).absent === 'if (r === "context" && m === "GET")', "an absent probe with escaped quotes survives the cut", r.verify_probe);
r = row("issue-4");
ok(r.status === "active" && r.verify_transport === "code-read", "a needs-machine-probe contract is armed", r);
r = row("issue-1");
ok(r.verify_probe.indexOf("chosen") > 0 && r.module === "probe-author", "a probe set on purpose is untouched", r);
ok(row("issue-2").status === "superseded", "a closed issue is untouched");
ok(row("issue-3").status === "superseded", "an http:// line does not parse and is not armed");
ok(det().observed === "1", "the new detector reads the one unparseable, hour-old line", det());
ok(db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'probe-line-birth-dropped'").get().n === 1, "failure mode recorded");
const cron = db.prepare("SELECT * FROM fleet_crons WHERE name = 'probe-line-sweep-10m'").get();
ok(cron && cron.cron_expr === "*/10 * * * *" && cron.enabled === 1, "10-minute cron registered", cron);
// the workflow, as fleet-exec runs it
const def = JSON.parse(db.prepare("SELECT definition FROM fleet_tasks WHERE id = 'probe-line-sweep'").get().definition);
ok(def.steps.length === 3 && def.steps.every((s) => s.type === "sql" && s.db === "AUDIT"), "workflow has 3 sql steps", def.steps.map((s) => s.name));
const runWf = () => { for (const s of def.steps) db.exec(s.sql); };
issue.run(100060, "new, no contract", 'x\nruntime-probe: {"url": "https://fleet.qnfo.org/api/x", "absent": "error"}', "open", Date.now());
issue.run(100061, "new, vacuous", 'x\ncode-probe: {"paths": ["w/worker.js"], "contains": "FIX-1"}', "open", Date.now()); addVac(100061);
ok(det().observed === "1", "fresh issues are inside the 20-minute grace", det());
runWf();
r = row("issue-100060");
ok(r && r.status === "active" && r.verify_transport === "runner-https" && r.issue_id === 100060, "the workflow inserts a missing contract", r);
ok(row("issue-100061").status === "active" && row("issue-100061").verify_transport === "code-read", "the workflow arms a vacuous one");
const ev = db.prepare("SELECT * FROM cloud_ops_events WHERE kind = 'probe-line-sweep'").all();
ok(ev.length === 1 && /issue-100060/.test(ev[0].text) && /unparseable: 1/.test(ev[0].text) && ev[0].status === "warn", "one ledger event names what it armed and the unparseable count", ev);
const before = JSON.stringify(db.prepare("SELECT class, status, verify_probe, attempts FROM remediation_contracts ORDER BY class").all());
db.exec("DELETE FROM cloud_ops_events");
runWf();
ok(JSON.stringify(db.prepare("SELECT class, status, verify_probe, attempts FROM remediation_contracts ORDER BY class").all()) === before, "a second run changes no contract");
// rollback
db.exec(/^-- Rollback: (.+)$/m.exec(sql)[1]);
ok(row("issue-100040").status === "superseded" && row("issue-100040").verify_transport === "d1-query", "Rollback restores a backed-up contract");
ok(det().observed === "1" && /needs-machine-probe/.test(row("fm-probe-line-unparsed").verify_probe), "Rollback restores the old detector");
ok(db.prepare("SELECT enabled FROM fleet_crons WHERE name = 'probe-line-sweep-10m'").get().enabled === 0, "Rollback disables the cron");
console.log("probe-line-sweep: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
