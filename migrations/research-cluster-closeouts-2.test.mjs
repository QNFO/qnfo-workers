// RESEARCH-CLUSTER-CLOSEOUTS-2 offline suite: replays migrations/2026-10-26-research-cluster-closeouts-2.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped); the contract of issue 100625 is upserted over the superseded closure-observing one as active on d1-query;
// the probe counts a queued row at a resumable stage that no research_ready entry covers (older than a day), and a live row above the re-arm ceiling, and nothing else (a queued row with a ready entry, a deferred row,
// a ground-stage row, a recent orphan and a parked row above the ceiling do not count); it never observes the issue; a replay changes nothing; the Rollback line supersedes the contract.
// Output MUST contain "0 failed" on success.   node migrations/research-cluster-closeouts-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-research-cluster-closeouts-2.sql"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)) && header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "header opts in with one Rollback line");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body) && !/fleet_tick|claude\.ai|anthropic\.com/i.test(sql), "nothing deleted or dropped, decision_log only inserted into");

const w = new DatabaseSync(":memory:");
w.exec(`CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, status TEXT, stage TEXT, claimed_at TEXT, created_at TEXT, terminal_rearms INTEGER DEFAULT 0);
CREATE TABLE research_ready (id TEXT PRIMARY KEY, ready_at TEXT);`);
w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES ('issue-100625', 100625, 'old', 'old', 'SELECT ''closed'' AS expected, NULL AS observed', 'd1-query', 'qnfo-fleet-control', 'superseded', 'superseded:closure-observing-probe-at-birth')").run();
w.exec(sql);
const c = w.prepare("SELECT * FROM remediation_contracts WHERE class = 'issue-100625'").get();
ok(c.status === "active" && c.verify_transport === "d1-query" && c.attempts === 0 && c.last_verdict === null && c.module === null && c.issue_id === 100625 && c.expected_cadence_h === 1 && /^RESEARCH-CLUSTER-CLOSEOUTS-2/.test(c.precondition), "the superseded contract is replaced by an active hourly d1-query contract", c);
ok(!/\b(update|insert|delete|drop|alter)\b/i.test(c.verify_probe) && !/agent_issues|issue_triage/i.test(c.verify_probe), "the probe has no write keyword and never observes the issue");
const run = () => { const r = w.prepare(c.verify_probe).get(); return { e: String(r.expected), o: String(r.observed) }; };
const old = (h) => new Date(Date.now() - h * 3600000).toISOString().replace(/\.\d+Z$/, "Z");
const q = (id, st, stage, created, tr = 0, claimed = null) => w.prepare("INSERT OR REPLACE INTO research_queue (id, status, stage, claimed_at, created_at, terminal_rearms) VALUES (?, ?, ?, ?, ?, ?)").run(id, st, stage, claimed, created, tr);
ok(run().e === run().o, "an empty queue reads 0", run());
q("covered", "queued", "revise", old(100)); w.prepare("INSERT INTO research_ready VALUES ('covered', ?)").run(old(50));
q("deferred", "deferred", "review", old(100));
q("ground", "queued", "ground", old(100));
q("recent-orphan", "queued", "verify", old(2));
q("parked-over", "wontfix", "parked", old(100), 5);
q("claimed", "queued", "complete", old(100), 0, old(1));
ok(run().o === "0", "a ready-window row, a deferred row, a ground row, a recent orphan, a parked row above the ceiling and a claimed row do not count", run());
q("orphan", "queued", "revise", old(100));
ok(run().o === "1" && run().e !== run().o, "a queued row at revise that no ready entry covers, older than a day, counts", run());
q("orphan", "queued", "revise", old(100)); w.prepare("INSERT INTO research_ready VALUES ('orphan', ?)").run(old(1));
ok(run().o === "0", "and stops counting once the ready window covers it");
q("over", "queued", "ground", old(5), 3);
ok(run().o === "1", "a live row above the re-arm ceiling counts", run());
q("over", "researching", "review", old(5), 3);
ok(run().o === "1", "also while it is being worked");
q("over", "published", "done", old(5), 3);
ok(run().o === "0", "and not once it has published");
ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'RESEARCH-CLUSTER-CLOSEOUTS-2:%'").get().n === 1, "one decision_log row");
w.prepare("UPDATE remediation_contracts SET attempts = 4 WHERE class = 'issue-100625'").run();
w.exec(sql);
ok(w.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1 && w.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n === 1, "a replay adds no row");
w.exec(header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, ""));
ok(w.prepare("SELECT status s FROM remediation_contracts WHERE class = 'issue-100625'").get().s === "superseded", "the Rollback line supersedes the contract");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
