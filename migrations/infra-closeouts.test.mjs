// INFRA-CLOSEOUTS-1 offline suite: replays migrations/2026-10-26-infra-closeouts.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs (issue_triage, the
// live close-sync triggers, issue_close_evidence_required) plus fleet_tick_heavy.
// Proves: the header opts in; issue 1000271 is closed, through the live close-sync trigger and with evidence naming the fleet_tick_heavy row, only when a cron:qnfo-fleet-dashboard row of the last
// 6 hours exists; with no such row, with a row older than 6 hours, with only the primary's rows, with another issue or a closed issue, nothing changes; a replay changes nothing; the existing
// triage row is updated, not duplicated.
// Output MUST contain "0 failed" on success.   node migrations/infra-closeouts.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-infra-closeouts.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);
const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString().slice(0, 19) + "Z";
function world(rows, o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec("CREATE TABLE fleet_tick_heavy (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, source TEXT NOT NULL)");
  for (const [source, min] of rows) w.prepare("INSERT INTO fleet_tick_heavy (ts, source) VALUES (?, ?)").run(iso(min), source);
  const issue = (id, title, status = "open") => {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'text', 'qnfo-fleet-control', 'medium', ?, 1, 1)").run(id, title, status);
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
  };
  issue(1000271, "FLEET-TICK-HEAVY-SECOND-PRODUCER-1: qnfo-fleet-dashboard should also write fleet_tick_heavy", o.status ?? "open");
  issue(1000999, "SOME-OTHER-ISSUE: unrelated");
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const st = (w, id) => q1(w, "SELECT status s FROM agent_issues WHERE id = ?", id).s;
const CO = "cron:qnfo-code-orchestrator", DASH = "cron:qnfo-fleet-dashboard";

{
  const w = world([[CO, 3], [DASH, 12], [CO, 13]]);
  w.exec(sql);
  ok(st(w, 1000271) === "closed", "a dashboard row 12 minutes old closes issue 1000271 through the live close-sync trigger");
  const t = q1(w, "SELECT * FROM issue_triage WHERE issue_id = 1000271");
  ok(t.triage_state === "closed" && t.rc === "infra-closeout:STANDBY-PROOF-2" && /fleet_tick_heavy row 2 \(source cron:qnfo-fleet-dashboard, ts \d{4}-\d{2}-\d{2}T[\d:]+Z\)/.test(t.close_evidence) && /STANDBY-PROOF-2, PR 4702/.test(t.close_evidence), "the evidence names the row, its source and timestamp and the change", t.close_evidence);
  ok(q1(w, "SELECT COUNT(*) n FROM issue_triage WHERE issue_id = 1000271").n === 1, "the existing triage row was updated, not duplicated");
  ok(q1(w, "SELECT close_channel c FROM agent_issues WHERE id = 1000271").c === "auto:triage-sync:qnfo-fleet-dashboard", "close_channel is written by the sync trigger");
  ok(st(w, 1000999) === "open", "another issue is untouched");
  const snap = () => JSON.stringify([w.prepare("SELECT * FROM agent_issues ORDER BY id").all(), w.prepare("SELECT * FROM issue_triage ORDER BY issue_id").all()]);
  const s1 = snap();
  w.exec(sql);
  ok(snap() === s1, "a replay changes nothing");
  w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
  ok(st(w, 1000271) === "open" && q1(w, "SELECT triage_state s FROM issue_triage WHERE issue_id = 1000271").s === "triaged", "Rollback reopens it");
}
ok(st((() => { const w = world([[CO, 3]]); w.exec(sql); return w; })(), 1000271) === "open", "only the primary's rows: the issue stays open (the evidence is the dashboard's own row)");
ok(st((() => { const w = world([[CO, 3], [DASH, 400]]); w.exec(sql); return w; })(), 1000271) === "open", "a dashboard row 400 minutes old is outside the 6 hours: stays open");
ok(st((() => { const w = world([]); w.exec(sql); return w; })(), 1000271) === "open", "an empty table: stays open");
{
  const w = world([[DASH, 5]], { status: "closed" });
  const before = JSON.stringify(w.prepare("SELECT * FROM issue_triage ORDER BY issue_id").all());
  w.exec(sql);
  ok(JSON.stringify(w.prepare("SELECT * FROM issue_triage ORDER BY issue_id").all()) === before, "an issue that is already closed gets no new triage text");
}

// the live failure of the first run: an active contract of the issue with a failing last verdict makes the trigger refuse the close (close-while-contract-fails)
function withContract(verdict, status = "active") {
  const w = world([[DASH, 12]]);
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict, module) VALUES ('issue-1000271', 1000271, 'p', 'a', 'SELECT 1', 'd1-query', 'qnfo-fleet-control', 1, ?, ?, 'probe-template-v3-generic')").run(status, verdict);
  return w;
}
{
  const w = withContract("fail");
  let threw = null;
  try { w.exec(sql); } catch (e) { threw = String(e.message || e); }
  ok(threw === null, "an active contract with a failing verdict does not abort the file (the first run did, on close-while-contract-fails)", threw);
  ok(st(w, 1000271) === "open" && q1(w, "SELECT rc FROM issue_triage WHERE issue_id = 1000271").rc === "AUTOTRIAGE-1", "and the issue is left to its own contract: still open, triage row untouched");
  // control: closing it directly while that contract fails is what the live trigger refuses
  let ctl = null;
  try { w.exec("UPDATE agent_issues SET status = 'closed' WHERE id = 1000271; "); } catch (e) { ctl = String(e.message || e); }
  ok(/close-without-evidence|close-while-contract-fails/.test(String(ctl)), "control: the live trigger refuses a direct close here", ctl);
}
{
  const w = withContract("pass");
  w.exec(sql);
  ok(st(w, 1000271) === "closed", "an active contract whose last verdict passed does not stop the close");
  const w2 = withContract("fail", "superseded");
  w2.exec(sql);
  ok(st(w2, 1000271) === "closed", "a failing contract that is superseded does not stop it either");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
