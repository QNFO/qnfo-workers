// RESEARCH-TERMINAL-HARD-REVIEW-SELFCLOSE-1 offline suite: replays migrations/2026-10-20-research-terminal-hard-review.sql on SQLite.
// Proves: an open RESEARCH-TERMINAL notice for "review: N HARD findings unresolved after M revise cycles" whose queue row is parked with that reason (and unambiguous) gets the self-closing contract; the probe passes
// when the row is parked and the queue advances and reads pending otherwise; a re-armed (queued) row, another terminal reason and an ambiguous 8-character prefix get none; the unreachable published-probe of an issue
// that gains the contract is superseded and that of one that does not is left active; no LIKE literal in the probe exceeds D1's 50 bytes; a second apply changes nothing; the Rollback line restores the contracts.
// Run: node migrations/research-terminal-hard-review.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-20-research-terminal-hard-review.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT);
  CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, stage TEXT, error TEXT);
  CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, text TEXT, job TEXT, status TEXT);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, last_verdict TEXT, next_due_at TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
const HARD = "PARKED-POISON-1: recover_count exhausted (3); last error: review: 6 HARD findings unresolved after 7 revise cycles (H1,H2)";
const issue = (id, rid, reason) => d.prepare("INSERT INTO agent_issues VALUES (?, ?, 'open')").run(id, "RESEARCH-TERMINAL " + rid + ": " + reason);
const row = (id, status, stage, err) => d.prepare("INSERT INTO research_queue VALUES (?, ?, ?, ?)").run(id, status, stage, err);
const contract = (cls, issueId, probe, status) => d.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, status) VALUES (?, ?, 'x', 'x', ?, 'd1-query', ?)").run(cls, issueId, probe, status);
// A: qualifies (monitoring contract only); B: qualifies and holds the unreachable published probe; C: row re-armed; D: no applicable edit; E: ambiguous prefix
issue(1, "aaaa1111", "review: 6 HARD findings unresolved after 7 revise cycles (H1,H2)"); row("aaaa1111-0000-4000-8000-000000000001", "wontfix", "parked", HARD); contract("issue-1", 1, "SELECT 'ok' AS expected, 'pending' AS observed", "monitoring");
issue(2, "bbbb2222", "review: 6 HARD findings unresolved after 6 revise cycles (H1)"); row("bbbb2222-0000-4000-8000-000000000002", "wontfix", "parked", HARD); contract("issue-2", 2, "SELECT 'published' AS expected, COALESCE((SELECT status FROM research_queue WHERE id = 'bbbb2222-0000-4000-8000-000000000002'), 'x') AS observed", "active");
issue(3, "cccc3333", "review: 6 HARD findings unresolved after 7 revise cycles (H1)"); row("cccc3333-0000-4000-8000-000000000003", "queued", "ground", "PARK-REARM-1 re-arm 1 of 1: prior stage review"); contract("issue-3", 3, "SELECT 'published' AS expected, 'queued' AS observed", "active");
issue(4, "dddd4444", "revise: no applicable edit for 5 HARD fixes (H1,H2) from two models"); row("dddd4444-0000-4000-8000-000000000004", "wontfix", "parked", "PARKED-POISON-1: recover_count exhausted (3); last error: revise: no applicable edit for 5 HARD fixes");
issue(5, "eeee5555", "review: 6 HARD findings unresolved after 7 revise cycles (H1)"); row("eeee5555-0000-4000-8000-000000000005", "wontfix", "parked", HARD); row("eeee5555-0000-4000-8000-000000000006", "wontfix", "parked", HARD);
d.exec(sql);
const cls = (c) => d.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(c);
const a = cls("research-terminal-aaaa1111"), b = cls("research-terminal-bbbb2222");
ok(a && a.issue_id === 1 && a.status === "active" && a.verify_transport === "d1-query" && /HARD review findings/.test(a.precondition), "A (parked, unambiguous, monitoring only) gets the self-closing contract", a);
ok(b && b.issue_id === 2, "B gets it too");
ok(!cls("research-terminal-cccc3333") && !cls("research-terminal-dddd4444") && !cls("research-terminal-eeee5555"), "a re-armed row, another reason and an ambiguous prefix get none");
ok(cls("issue-2").status === "superseded" && /HARD-REVIEW-SELFCLOSE-1/.test(cls("issue-2").last_verdict), "B's unreachable published probe is superseded");
ok(cls("issue-3").status === "active" && cls("issue-1").status === "monitoring", "an issue that gains no contract keeps its own, a monitoring contract is left alone");
ok(!/LIKE '[^']{50,}'/.test(a.verify_probe) && /^SELECT /.test(a.verify_probe) && !a.verify_probe.includes(";"), "the probe is a literal SELECT with no LIKE literal over 50 bytes");
const probe = (c) => d.prepare(c.verify_probe).get();
ok(probe(a).observed === "pending", "no advancing queue yet: pending", probe(a));
d.prepare("INSERT INTO cloud_ops_events VALUES ('e1', strftime('%Y-%m-%dT%H:%M:%SZ','now'), '{\"stage\":\"ground->ensemble\"}', 'qnfo-research-exec', 'ok')").run();
ok(probe(a).observed === probe(a).expected, "parked row plus an advancing queue passes", probe(a));
d.exec("UPDATE research_queue SET stage = 'ground', status = 'queued' WHERE id LIKE 'aaaa1111%'");
ok(probe(a).observed === "pending", "a row that was re-armed no longer passes", probe(a));
const n = () => [d.prepare("SELECT COUNT(*) AS n FROM remediation_contracts").get().n, d.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n].join();
const before = n();
d.exec(sql);
ok(n() === before, "a second apply changes nothing", [before, n()]);
d.exec(rollback);
ok(!cls("research-terminal-aaaa1111") && !cls("research-terminal-bbbb2222") && cls("issue-2").status === "active", "Rollback removes the new contracts and restores the superseded one");
console.log("research-terminal-hard-review: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
