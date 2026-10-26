// REM-A1-HANDOFF-1 offline suite: replays migrations/2026-10-26-rem-a1-handoff.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped, ASCII only); nine named issues get one dated note each (appended once, a replay adds nothing, other issues are
// untouched) and the Rollback line strips exactly those notes; the two follow-up issues are inserted once, open, with a doer and a closing probe (a parseable code-probe line on the first, a d1-query contract on the second
// that reads 0 until the metric row exists and 1 after); one decision_log row; a replay changes nothing.
// Output MUST contain "0 failed" on success.   node migrations/rem-a1-handoff.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a1-handoff.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)) && header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "header opts in with one Rollback line");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(sql) && !/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body) && !/fleet_tick|claude\.ai|anthropic\.com/i.test(sql), "nothing deleted or dropped, decision_log only inserted into");
ok(/^[\x00-\x7F]*$/.test(sql), "the file is ASCII only");
ok([...sql.matchAll(/LIKE\s+'([^']*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "LIKE patterns stay under 50 bytes");

const MARK = "REM-A1-HANDOFF-1 2026-10-26";
const IDS = [100211, 100408, 1000031, 100456, 1000002, 1000316, 1000317, 100625, 1000012];
const DECOYS = [1, 5, 2402, 1000319];
const w = new DatabaseSync(":memory:");
w.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT);`);
for (const id of IDS.concat(DECOYS)) w.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, 'test', 'research', 'medium', 'open', 1, 1)").run(id, "issue " + id, "original " + id);
const desc = (id) => w.prepare("SELECT description FROM agent_issues WHERE id = ?").get(id).description;
const before = Object.fromEntries(IDS.concat(DECOYS).map((id) => [id, desc(id)]));
w.exec(sql);
for (const id of IDS) ok(desc(id).startsWith("original " + id + "\n\n" + MARK + " (read ") && desc(id).split(MARK).length === 2, "issue " + id + " has its original text and one dated note", desc(id).slice(0, 120));
for (const id of DECOYS) ok(desc(id) === before[id], "issue " + id + " is untouched");
const has = (id, re) => re.test(desc(id));
ok(has(100211, /252,692 of the 290,494/) && has(100211, /2026-10-28/) && has(100211, /09:42Z/), "100211: the share, the deploy time and the first-pass date");
ok(has(100408, /2026-10-29/) && has(100408, /4,243,641/) && has(100408, /14-paper floor/), "100408: the window arithmetic and the first-pass date");
ok(has(1000031, /ct_im1000475/) && has(1000031, /ct_im1000472/) && has(1000031, /46,737\.5/), "1000031: the levers and the metric value");
ok(has(100456, /ct_im1000475/) && has(100456, /154 queued errata remediation rows/) && has(100456, /87 wontfix/), "100456: the capacity numbers and the doers");
ok(has(1000002, /internal-open 572/) && has(1000002, /243 rows routed/) && has(1000002, /notes_publish_queue 0/), "1000002: the three probe clauses");
ok(has(1000316, /research_run_ledger holds no row/) && has(1000316, /07:52Z/), "1000316: the empty ledger and the 0.35.0 merge time");
ok(has(1000317, /252 unattributed/) && has(1000317, /2026-10-27/) && has(1000317, /13 of the 16/), "1000317: the burst, the window date and the site count");
ok(has(100625, /ac9cce13-f637-4a7f-abbe-7a02e5e2d884/) && has(100625, /terminal_rearms 5/), "100625: the one row above the ceiling");
ok(has(1000012, /NOTICE-REPAIR-STALE-METRIC-1/) && has(1000012, /19:31Z, 19:41Z, 19:51Z and 20:01Z/), "1000012: the mirror ticks and the follow-up issue");

const news = w.prepare("SELECT * FROM agent_issues WHERE id > 1000319 OR title LIKE 'TERMINAL-RESOLVE%' OR title LIKE 'NOTICE-REPAIR-STALE%' ORDER BY id").all();
ok(news.length === 2 && news.every((r) => r.status === "open" && r.source === "session-rem-a1"), "two follow-up issues are inserted, open", news.map((r) => r.title.slice(0, 40)));
const t1 = news.find((r) => /^TERMINAL-RESOLVE-PARKED-POISON-1:/.test(r.title)), t2 = news.find((r) => /^NOTICE-REPAIR-STALE-METRIC-1:/.test(r.title));
ok(t1 && t2 && t1.priority === "low" && t2.priority === "medium", "priorities are set");
const probeLine = t1 && t1.description.split("\n").find((l) => l.startsWith("code-probe: "));
let probe = null;
try { probe = JSON.parse(probeLine.slice("code-probe: ".length)); } catch (e) { probe = null; }
ok(probe && probe.paths.join() === "qnfo-research-exec/worker.js" && probe.contains === "TERMINAL-RESOLVE-PARKED-POISON-1", "the first issue carries a parseable code-probe line", probeLine);
ok(t1 && /the doer is a session/.test(t1.description) && /Definition of done/.test(t1.description), "the first issue names its doer and its definition of done");
ok(t2 && /Doer: qnfo-fleet-control/.test(t2.description) && /Definition of done/.test(t2.description) && /owner_papers_retracted_over_24h/.test(t2.description), "the second issue names its doer, its metric and its definition of done");
const c = t2 && w.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get("issue-" + t2.id);
ok(c && c.issue_id === t2.id && c.status === "active" && c.verify_transport === "d1-query" && c.escalate_to === "qnfo-fleet-control" && c.expected_cadence_h === 1, "the second issue has an active hourly d1-query contract", c);
ok(c && !/\b(update|insert|delete|drop|alter)\b/i.test(c.verify_probe) && !/agent_issues|issue_triage/i.test(c.verify_probe), "the probe has no write keyword and never observes the issue");
const run = () => { const r = w.prepare(c.verify_probe).get(); return { e: String(r.expected), o: String(r.observed) }; };
ok(run().e === "1" && run().o === "0", "the contract reads 0 while the metric row is absent", run());
w.prepare("INSERT INTO metric_registry (metric, last_value) VALUES ('owner_papers_retracted_over_24h', '0')").run();
ok(run().o === "1" && run().e === run().o, "and passes once the metric row exists", run());
ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'REM-A1-HANDOFF-1:%'").get().n === 1, "one decision_log row");

// a replay changes nothing
const snap = JSON.stringify(w.prepare("SELECT id, description FROM agent_issues ORDER BY id").all());
w.prepare("UPDATE remediation_contracts SET attempts = 4 WHERE class = ?").run("issue-" + t2.id);
w.exec(sql);
ok(JSON.stringify(w.prepare("SELECT id, description FROM agent_issues ORDER BY id").all()) === snap, "a replay adds no note and no issue");
ok(w.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1 && w.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n === 1, "a replay adds no decision row and no contract");
ok(w.prepare("SELECT attempts FROM remediation_contracts WHERE class = ?").get("issue-" + t2.id).attempts === 0, "a replay re-arms the contract (attempts back to 0)");

// the Rollback line strips exactly the nine notes
w.exec(header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, ""));
for (const id of IDS) ok(desc(id) === before[id], "after Rollback issue " + id + " has its original text", desc(id).slice(0, 80));
ok(w.prepare("SELECT COUNT(*) n FROM agent_issues").get().n === IDS.length + DECOYS.length + 2, "the two follow-up issues stay after Rollback (no silent drop)");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
