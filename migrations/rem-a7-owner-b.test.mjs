// REM-A7-OWNER-B-1 offline suite: replays migrations/2026-10-26-rem-a7-owner-b.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs
// (agent_issues, issue_triage, remediation_contracts, human_actions, decision_log, the live close-sync triggers and issue_close_evidence_required) plus worker_logs and email_send_violations,
// a birth trigger that gives every new issue the generic superseded contract (as the live one does) and the human_actions default-adopt trigger that closes a card with a stated default at birth.
// Proves: the header opts in; the three successor issues are filed once and their born-superseded contracts become active measuring contracts (a code-read probe that parses, two d1 probes that read the
// expected value on the fixed state and the failing count on the defect, carrying no write keyword); the five owner tasks close through the live close-sync trigger with evidence that names the successor ids;
// an issue with a live failing contract is not closed; the card is open after the birth trigger and starts with IDENTITY-BOUND; the table ai_spend_owner_client exists; a replay changes nothing; Rollback reopens
// the five issues and resolves the card.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-owner-b.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-owner-b.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const consumer = readFileSync(here("../scripts/remediation_consumer.py"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no vendor link");
ok(!/\bLIKE\s+'[^']{50,}'/i.test(body), "no LIKE pattern over 50 bytes");
ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(sql.replace(/qnfo@qnfo\.org/g, "")), "no personal address in the file (only the system sender)");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);
const EXTRA_DDL = `
CREATE TABLE worker_logs (event_hash TEXT PRIMARY KEY, ts_ms INTEGER, script_name TEXT, event_type TEXT, outcome TEXT, cpu_ms INTEGER, wall_ms INTEGER);
CREATE TABLE email_send_violations (id INTEGER PRIMARY KEY AUTOINCREMENT, detected_at TEXT DEFAULT (datetime('now')), recipient TEXT, sender TEXT, subject TEXT, message_id TEXT, violation TEXT, detail TEXT, resolved INTEGER DEFAULT 0);
CREATE TRIGGER human_actions_default_adopt_ai AFTER INSERT ON human_actions WHEN NEW.status = 'open' AND TRIM(COALESCE(NEW.default_in_effect, '')) <> '' BEGIN UPDATE human_actions SET status = 'resolved', resolved_at = datetime('now'), resolution = 'DEFAULT-ADOPTED-1: closed at birth on its stated default (owner directive 2026-10-12). Reopen with status=open.' WHERE id = NEW.id; END;
CREATE TRIGGER human_actions_no_claude_ins BEFORE INSERT ON human_actions WHEN COALESCE(NEW.action,'') LIKE '%Claude%' OR COALESCE(NEW.why,'') LIKE '%Claude%' OR COALESCE(NEW.default_in_effect,'') LIKE '%Claude%' OR COALESCE(NEW.title,'') LIKE '%Claude%' OR COALESCE(NEW.url,'') LIKE '%claude.ai%' OR COALESCE(NEW.url,'') LIKE '%anthropic.com%' BEGIN SELECT RAISE(ABORT, 'NO-VENDOR-LINK'); END;
`;
const BIRTH_DDL = `
CREATE TRIGGER t_birth AFTER INSERT ON agent_issues BEGIN
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (NEW.id, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01');
  INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, last_verdict)
  VALUES ('issue-' || NEW.id, NEW.id, 'p', 'VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open.', 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ' || NEW.id || ') AS observed', 'd1-query', 'qnfo-ops', 'superseded', 'probe-template-v3-generic', 'superseded:closure-observing-probe-at-birth');
END;
`;

const WRITE_KW = (consumer.match(/WRITE_KW = \(([\s\S]*?)\n\)/) || [, ""])[1].match(/"([^"]+)"/g).map((x) => x.slice(1, -1));
ok(WRITE_KW.length >= 10, "read the consumer's write-keyword list", WRITE_KW);

const OLD_PROBE = (id) => "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = " + id + ") AS observed";
const VACUOUS = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close.";
const OWNER_ISSUES = [100384, 100406, 1000063, 1000068, 1000079];

function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec(EXTRA_DDL);
  const issue = (id, title, cstatus, verdict, status = "open") => {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'text', 'qnfo-fleet-dashboard:owner-request', 'critical', ?, 1, 1)").run(id, title, status);
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, last_verdict) VALUES (?, ?, 'p', ?, ?, 'd1-query', 'qnfo-fleet-control', ?, 'probe-template-v3-generic', ?)").run("issue-" + id, id, VACUOUS, OLD_PROBE(id), cstatus, verdict);
  };
  issue(100384, "OWNER-TASK-op-mvh2iuolcaa1: Audit fleet cost attribution", "escalated", "escalated:over-retried");
  issue(100406, "OWNER-TASK-op-mvhw5vy4ce86: Audit all owner-local desktop AI clients", "superseded", "superseded:closure-observing-probe-at-birth");
  issue(1000063, "THREAD-HANDOFF-2026-10-24: five unowned items", o.c63 ?? "superseded", o.v63 ?? "superseded:closure-observing-probe-at-birth");
  issue(1000068, "OWNER-TASK-op-mvmtase06307: Run a security/compliance review", "superseded", "superseded:closure-observing-probe-at-birth");
  issue(1000079, "OWNER-TASK-op-mvmtgm5j8fb7: Investigate qnfo-code-orchestrator internalError", "superseded", "superseded:closure-observing-probe-at-birth");
  issue(100999, "SOME-OTHER-ISSUE: unrelated", "superseded", "x");
  // the card of REM-A7-OWNER-A-1 as the live trigger left it: closed at birth on its stated default
  w.prepare("INSERT INTO human_actions (slug, title, why, default_in_effect, action, status, source, resolved_at, resolution) VALUES ('attest-first-credibility-event', 't', 'IDENTITY-BOUND: x', 'd', 'a', 'resolved', 'session:rem-a7', datetime('now'), 'DEFAULT-ADOPTED-1: closed at birth on its stated default (owner directive 2026-10-12). Reopen with status=open.')").run();
  w.exec(BIRTH_DDL);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const st = (w, id) => q1(w, "SELECT status s FROM agent_issues WHERE id = ?", id).s;
const succ = (w, prefix) => q1(w, "SELECT id FROM agent_issues WHERE title LIKE ? AND status = 'open'", prefix + "%");
const snap = (w) => JSON.stringify([qa(w, "SELECT * FROM agent_issues ORDER BY id"), qa(w, "SELECT * FROM issue_triage ORDER BY issue_id"), qa(w, "SELECT * FROM remediation_contracts ORDER BY class"), qa(w, "SELECT slug, status FROM human_actions"), qa(w, "SELECT actor, action FROM decision_log ORDER BY id")]);
const probe = (w, c) => q1(w, q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", c).p);

{
  const w = world();
  w.exec(sql);
  for (const id of OWNER_ISSUES) ok(st(w, id) === "closed" && q1(w, "SELECT close_channel c FROM agent_issues WHERE id = ?", id).c === "auto:triage-sync:rem-a7", "A1 issue " + id + " is closed through the sync trigger with a rem-a7 channel");
  ok(st(w, 100999) === "open", "A2 an unrelated issue is untouched");

  const tag = succ(w, "OWNER-LOCAL-CLIENT-TAG-1:"), orch = succ(w, "CODE-ORCH-WALL-STALL-1:"), mail = succ(w, "EMAIL-OWNER-CODE-VIOLATION-NOISE-1:");
  ok(tag && orch && mail && new Set([tag.id, orch.id, mail.id]).size === 3, "B1 the three successor issues are filed, once each", [tag, orch, mail]);
  const issueRow = (id) => q1(w, "SELECT * FROM agent_issues WHERE id = ?", id);
  ok(/code-task: repo=qnfo-workers path=qnfo-fleet-control\/worker\.js/.test(issueRow(tag.id).description) && /code-anchor: if \(!w\) return \{ kind: "owner-local", caller: "owner-local" \};/.test(issueRow(tag.id).description) && issueRow(tag.id).source === "claude-session:rem-a7", "B2 the tag issue names its code task, its anchor and a trusted source");
  ok(/code-task: repo=qnfo-workers path=qnfo-code-orchestrator\/worker\.js/.test(issueRow(orch.id).description) && /code-anchor: async function runFleetExecMember\(event, env\) \{/.test(issueRow(orch.id).description), "B3 the stall issue names its code task and anchor");
  ok(/code-task: repo=qnfo-workers path=qnfo-email\/worker\.js/.test(issueRow(mail.id).description) && /code-anchor: async function sendApi\(req,e,J\)\{/.test(issueRow(mail.id).description), "B4 the mail issue names its code task and anchor");

  const c1 = q1(w, "SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + tag.id), c2 = q1(w, "SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + orch.id), c3 = q1(w, "SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + mail.id);
  for (const [n, c] of [["tag", c1], ["stall", c2], ["mail", c3]]) ok(c.status === "active" && c.module === "rem-a7-owner-v1" && c.last_verdict === null && c.attempts === 0, "C1 the " + n + " contract is active and measuring, no longer the birth template", c);
  let spec; try { spec = JSON.parse(c1.verify_probe); } catch (e) { spec = null; }
  ok(c1.verify_transport === "code-read" && spec && Array.isArray(spec.paths) && spec.paths[0] === "qnfo-fleet-control/worker.js" && spec.contains === "ai_spend_owner_client" && Object.keys(spec).length === 2, "C2 the tag probe is a code-read spec the consumer parses", spec);
  for (const [n, c] of [["stall", c2], ["mail", c3]]) ok(c.verify_transport === "d1-query" && /^\s*SELECT\b/i.test(c.verify_probe) && !WRITE_KW.some((k) => c.verify_probe.toLowerCase().includes(k.toLowerCase())), "C3 the " + n + " probe is a literal select without a write keyword", WRITE_KW.filter((k) => c.verify_probe.toLowerCase().includes(k.toLowerCase())));

  // the stall probe: 13 stalled scheduled invocations in the window read 13, none reads the expected 0; outside the window or short ones do not count
  const now = Date.now(), wl = (hash, ago, script, type, outcome, wall) => w.prepare("INSERT INTO worker_logs (event_hash, ts_ms, script_name, event_type, outcome, cpu_ms, wall_ms) VALUES (?, ?, ?, ?, ?, 50, ?)").run(hash, now - ago, script, type, outcome, wall);
  for (let i = 0; i < 13; i++) wl("s" + i, (i + 1) * 3600000 * 1.5 % 80000000 + 60000, "qnfo-code-orchestrator", "telemetry:scheduled", i % 2 ? "canceled" : "exceededWallTime", 899900);
  wl("old", 3 * 86400000, "qnfo-code-orchestrator", "telemetry:scheduled", "canceled", 899900);
  wl("short", 1000, "qnfo-code-orchestrator", "telemetry:scheduled", "canceled", 9000);
  wl("fetch", 1000, "qnfo-code-orchestrator", "telemetry:fetch", "canceled", 899900);
  wl("other", 1000, "qnfo-gateway", "telemetry:scheduled", "canceled", 899900);
  const p2 = probe(w, "issue-" + orch.id);
  ok(p2.expected === "0" && p2.observed === "13", "D1 the stall probe reads 13 on the defect and not the expected 0", p2);
  w.prepare("DELETE FROM worker_logs WHERE event_hash LIKE 's%'").run();
  ok(probe(w, "issue-" + orch.id).observed === "0", "D2 and reads 0 once no scheduled invocation over 600 seconds is left in the last 24 hours", probe(w, "issue-" + orch.id));
  // the mail probe
  const ev = (subject, daysAgo, violation = "UNGATED-SEND-TO-SUPPRESSED-OR-REPEAT") => w.prepare("INSERT INTO email_send_violations (detected_at, recipient, sender, subject, violation) VALUES (datetime('now', ?), 'r', 'qnfo@qnfo.org', ?, ?)").run("-" + daysAgo + " days", subject, violation);
  for (let i = 0; i < 22; i++) ev("Owner code " + String(100000 + i), 1 + (i % 5));
  ev("Owner code 999999", 30); ev("Hello", 1); ev("Owner code 111111", 1, "UNSUBSCRIBE-HONOURED");
  const p3 = probe(w, "issue-" + mail.id);
  ok(p3.expected === "0" && p3.observed === "22", "D3 the mail probe counts the 22 Owner code rows of the last 7 days, not older rows, other subjects or other violations", p3);
  w.prepare("UPDATE email_send_violations SET detected_at = datetime('now', '-9 days')").run();
  ok(probe(w, "issue-" + mail.id).observed === "0", "D4 and reads 0 when no new row appeared for a week", probe(w, "issue-" + mail.id));

  const ev100384 = q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 100384").e, ev100406 = q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 100406").e;
  ok(new RegExp("successor issue " + tag.id + " \\(OWNER-LOCAL-CLIENT-TAG-1").test(ev100384) && /242\.43 USD/.test(ev100384) && /177\.57/.test(ev100384) && /40383249752/.test(ev100384) && /user_agent node/.test(ev100384), "E1 the 100384 evidence names the successor id, the 30 day total, the opus share and the gateway-log run", ev100384.slice(0, 200));
  ok(/905 USD/.test(ev100406) && /decision to name/.test(ev100406) && /not a measured result/.test(ev100406) && /210\.62 of the 242\.43/.test(ev100406), "E2 the 100406 evidence states the all-in picture, the one decision and marks the quality claim as not measured");
  ok(/63 breaches, qnfo-fleet-control 37/.test(q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 1000063").e) && /21 minutes now/.test(q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 1000063").e), "E3 the 1000063 evidence carries the per-owner breach count and the pinned source");
  const ev68 = q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 1000068").e;
  ok(new RegExp("issue " + mail.id + " \\(new; probe").test(ev68) && /1000469/.test(ev68) && /RANKED FINDINGS/.test(ev68) && /NOT DONE, and why/.test(ev68), "E4 the 1000068 review ranks its findings, names the mail successor and 1000469 and says what was not done");
  ok(new RegExp("CODE-ORCH-WALL-STALL-1 \\(issue " + orch.id).test(q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 1000079").e) && /Not proven: which await stalls/.test(q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 1000079").e), "E5 the 1000079 evidence names the successor and says the stalled await is not proven");

  const card = qa(w, "SELECT * FROM human_actions WHERE slug = 'tag-owner-desktop-clients'");
  ok(card.length === 1 && card[0].status === "open" && /^IDENTITY-BOUND:/.test(card[0].why) && !/claude|anthropic/i.test(JSON.stringify(card[0])) && /cf-aig-metadata/.test(card[0].action) && /owner_client/.test(card[0].action), "F1 the card is open after the birth trigger, IDENTITY-BOUND, names the header and the key, carries no vendor word", card[0] && card[0].status);
  ok(q1(w, "SELECT status s FROM human_actions WHERE slug = 'attest-first-credibility-event'").s === "open" && q1(w, "SELECT resolution r FROM human_actions WHERE slug = 'attest-first-credibility-event'").r === null, "F1b the credibility card of REM-A7-OWNER-A-1, closed at birth, is reopened");
  const cols = qa(w, "PRAGMA table_info(ai_spend_owner_client)").map((c) => c.name);
  ok(["day", "gateway", "provider", "model", "client", "calls", "in_tok", "out_tok", "usd"].every((c) => cols.includes(c)) && qa(w, "PRAGMA table_info(ai_spend_owner_client)").filter((c) => c.pk > 0).length === 5, "F2 ai_spend_owner_client exists with the five column key", cols);
  ok(qa(w, "SELECT * FROM decision_log WHERE action LIKE 'REM-A7-OWNER-B-1:%'").length === 1, "F3 one decision_log row");
  ok(qa(w, "SELECT * FROM agent_issues WHERE title LIKE 'OWNER-LOCAL-CLIENT-TAG-1:%' OR title LIKE 'CODE-ORCH-WALL-STALL-1:%' OR title LIKE 'EMAIL-OWNER-CODE-VIOLATION-NOISE-1:%'").length === 3, "F4 exactly three successor rows");

  const s = snap(w);
  w.exec(sql);
  ok(snap(w) === s, "G1 a replay changes nothing");

  const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n");
  w.exec(rb);
  ok(OWNER_ISSUES.every((id) => st(w, id) === "open"), "H1 Rollback reopens the five issues");
  ok(q1(w, "SELECT status s FROM human_actions WHERE slug = 'tag-owner-desktop-clients'").s === "resolved" && q1(w, "SELECT status s FROM human_actions WHERE slug = 'attest-first-credibility-event'").s === "resolved", "H2 Rollback resolves both cards");
  ok(qa(w, "SELECT status FROM agent_issues WHERE title LIKE 'OWNER-LOCAL-CLIENT-TAG-1:%' OR title LIKE 'CODE-ORCH-WALL-STALL-1:%'").every((r) => r.status === "closed"), "H3 Rollback closes the successors with an evidence text");
}
{
  // an issue whose contract is active and failing is not closed (the evidence guard would abort the close) and the file still runs to the end
  const w = world({ c63: "active", v63: "fail" });
  w.exec(sql);
  ok(st(w, 1000063) === "open" && st(w, 1000068) === "closed", "I1 1000063 stays open while its contract is active and failing; the others close");
  ok(qa(w, "SELECT * FROM decision_log WHERE action LIKE 'REM-A7-OWNER-B-1:%'").length === 1, "I2 the file ran to the end");
}
{
  // already closed issues get no new evidence and no card is duplicated
  const w = world();
  w.prepare("UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'earlier evidence' WHERE issue_id = 100384").run();
  w.exec(sql);
  ok(q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 100384").e === "earlier evidence", "J1 an issue that already closed keeps its own evidence");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
