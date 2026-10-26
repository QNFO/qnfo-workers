// BP26-PROMPT-INJECTION-1 part 2 offline suite: replays migrations/2026-10-26-bp26-agent-security-2.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped by the body); the command-channel guard is registered in control_registry with a tested alternate;
// the decision is logged once and decision_log is only inserted into; a replay changes nothing; the Rollback line removes the control row.
// Output MUST contain "0 failed" on success.   node migrations/bp26-agent-security-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-bp26-agent-security-2.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "decision_log is only inserted into");
ok(!/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "no write to fleet_tick and no claude.ai link");

const rollback = header.find((l) => /^-- Rollback:/.test(l)).replace(/^-- Rollback:\s*/, "");
const w = new DatabaseSync(":memory:");
w.exec(`CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));`);
const q1 = (s, ...p) => w.prepare(s).get(...p);
w.exec(sql);
const c = q1("SELECT * FROM control_registry WHERE control = 'email-command-injection-scan'");
ok(c && c.kind === "guard" && c.disposition === "keep" && c.disposition_state === "applied" && c.alternate_tested_at === "2026-10-26" && c.issue_id === 1000359 && c.critical_path === 0, "the command-channel guard is registered with a tested alternate", c);
ok(/cmdAgent/.test(c.location) && /ops-exec/.test(c.guards_against), "it names where it lives and what it guards against");
ok(q1("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'BP26-PROMPT-INJECTION-1 (command channel):%'").n === 1, "the decision is logged once");
w.exec(sql);
ok(q1("SELECT COUNT(*) n FROM decision_log").n === 1 && q1("SELECT COUNT(*) n FROM control_registry").n === 1, "a replay changes nothing");
w.exec(rollback);
ok(q1("SELECT COUNT(*) n FROM control_registry").n === 0 && q1("SELECT COUNT(*) n FROM decision_log").n === 1, "the Rollback line removes the control row and leaves the append-only decision");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
