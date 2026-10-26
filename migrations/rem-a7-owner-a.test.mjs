// REM-A7-OWNER-A-1 offline suite: replays migrations/2026-10-26-rem-a7-owner-a.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs
// (agent_issues, issue_triage, code_tasks, remediation_contracts, human_actions, decision_log, the live close-sync triggers and issue_close_evidence_required) plus owner_prompts,
// email_reply_queue, outreach_queue, integration_state and the human_actions no-vendor-link guard.
// Proves: the header opts in; the five failed code tasks of issue 100596 become superseded with their reason, the four terminal ones are untouched, a task whose issue is still open is left
// failed, and the pre-state is kept in the backup table; the 100596 probe reads blocked_or_unresolved:5 before and :0 after; the placeholder contract of 100487 becomes an active contract
// whose probe reads empty-match / healthy / a waiting row over the 73 hour SLA correctly and passes the consumer's write-keyword rule; the owner prompt of 1000101 is answered with a draft that carries
// the salutation and the paper title read from the queue rows and no address or name literal, nothing is queued for sending, and the contract probe of 1000101 flips from not-acted to acted;
// the credibility card is written once with an IDENTITY-BOUND line and no vendor word; findings are staged as close_evidence without closing anything; a replay changes nothing; Rollback restores the
// tasks, the placeholder contract, the prompt and the card.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-owner-a.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-owner-a.sql"), "utf8");
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

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);
const EXTRA_DDL = `
CREATE TABLE owner_prompts (id TEXT PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), mode TEXT, prompt TEXT, status TEXT, response TEXT, model TEXT, intent_id TEXT, error TEXT, issue_id INTEGER, visitor TEXT, retries INTEGER DEFAULT 0);
CREATE TABLE email_reply_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER NOT NULL, sender TEXT NOT NULL, person_key TEXT, subject TEXT, received_at TEXT, human_score INTEGER, decision TEXT NOT NULL DEFAULT 'pending', skip_reason TEXT, draft_text TEXT, drafted_at TEXT, sent_at TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), tier TEXT, tier_reason TEXT, draft_proposed TEXT);
CREATE TABLE outreach_queue (id TEXT PRIMARY KEY, paper_id TEXT, author TEXT, email TEXT, reason TEXT, status TEXT, created_at TEXT, sent_at TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE integration_state (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, json TEXT);
CREATE TRIGGER human_actions_no_claude_ins BEFORE INSERT ON human_actions WHEN COALESCE(NEW.action,'') LIKE '%Claude%' OR COALESCE(NEW.why,'') LIKE '%Claude%' OR COALESCE(NEW.default_in_effect,'') LIKE '%Claude%' OR COALESCE(NEW.title,'') LIKE '%Claude%' OR COALESCE(NEW.url,'') LIKE '%claude.ai%' OR COALESCE(NEW.url,'') LIKE '%anthropic.com%' BEGIN SELECT RAISE(ABORT, 'NO-VENDOR-LINK'); END;
`;

const WRITE_KW = (consumer.match(/WRITE_KW = \(([\s\S]*?)\n\)/) || [, ""])[1].match(/"([^"]+)"/g).map((x) => x.slice(1, -1));
ok(WRITE_KW.length >= 10, "read the consumer's write-keyword list", WRITE_KW);

const OLD_PROBE = (id) => "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = " + id + ") AS observed";
const VACUOUS = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close.";
const PROBE_100596 = "SELECT 'blocked_or_unresolved:0' AS expected, COALESCE('blocked_or_unresolved:' || COUNT(*) || ' (' || GROUP_CONCAT(id || ':' || status, ', ') || ')', 'blocked_or_unresolved:0') AS observed FROM code_tasks WHERE id IN ('ct_im100345','ct_im100419','ct_im100463','ct_im100438','ct_im100467','ct_im100468','ct_im100442','ct_im100430','ct_im100445') AND status NOT IN ('merged','superseded','closed','published')";
const PROBE_1000101 = "SELECT 'acted' AS expected, CASE WHEN EXISTS (SELECT 1 FROM owner_prompts WHERE id = 'op-mvn8oc5x7129' AND (status <> 'queued' OR response IS NOT NULL OR error IS NOT NULL)) THEN 'acted' ELSE 'not-acted' END AS observed";

function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec(EXTRA_DDL);
  const issue = (id, title, status = "open") => {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'text', 'qnfo-fleet-dashboard:owner-request', 'critical', ?, 1, 1)").run(id, title, status);
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
  };
  const contract = (id, status, action, probe, verdict) => w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, last_verdict) VALUES (?, ?, 'p', ?, ?, 'd1-query', 'qnfo-fleet-control', ?, 'probe-template-v3-generic', ?)").run("issue-" + id, id, action, probe, status, verdict);
  const task = (id, status) => w.prepare("INSERT INTO code_tasks (id, repo, path, goal, status, step, attempts, last_error, created_at, updated_at) VALUES (?, 'qnfo-workers', 'x', 'goal', ?, 'read', 3, 'read failed: raw read HTTP 404', '2026-10-24', '2026-10-25')").run(id, status);
  issue(100345, "ERRATA-CONFIRM-THROUGHPUT-1: x", "closed"); issue(100442, "WORKERS-BP-DEBT-1: mind", "closed"); issue(100467, "MIND-Q08-CITE-2: x", "closed"); issue(100468, "MIND-Q08-CITE-1: x", "closed");
  issue(100419, "CLOSE-CHANNEL-REQUIRED-1: x", o.status419 ?? "open"); contract(100419, "active", "closing probe", "SELECT '0' AS expected, '1' AS observed", "fail");
  for (const [id, s] of [["ct_im100345", "failed"], ["ct_im100419", "failed"], ["ct_im100442", "failed"], ["ct_im100467", "failed"], ["ct_im100468", "failed"], ["ct_im100438", "merged"], ["ct_im100430", "superseded"], ["ct_im100445", "superseded"], ["ct_im100463", "superseded"]]) task(id, s);
  issue(100596, "OWNER-TASK-op-mvm2dfshc188: Unblock and merge the parked code tasks", o.status596 ?? "open"); contract(100596, "active", VACUOUS, PROBE_100596, "fail");
  issue(100487, "OWNER-TASK-op-mvihumt4d0ce: Investigate the Outreach queue -> send drain integration chain", o.status487 ?? "open"); contract(100487, "superseded", VACUOUS, OLD_PROBE(100487), "superseded:closure-observing-probe-at-birth");
  issue(1000101, "OWNER-TASK-op-mvn8oc5x7129: Draft a short, human-toned clarification reply", "open"); contract(1000101, "active", VACUOUS, PROBE_1000101, "fail");
  issue(100488, "OWNER-TASK-op-mvihv5rr376f: Owner goal: secure the first attested credibility event", o.status488 ?? "open");
  issue(1000247, "DOCTRINE-AUDIT-2026-W44"); issue(100120, "CLOSEOUT-HANDOFF-20261019: 30 unfinished plans"); issue(100999, "SOME-OTHER-ISSUE: unrelated");
  w.prepare("INSERT INTO owner_prompts (id, mode, prompt, status, issue_id) VALUES ('op-mvn8oc5x7129', 'task', 'draft a reply', 'queued', 1000101)").run();
  w.prepare("INSERT INTO email_reply_queue (id, email_id, sender, decision) VALUES (76, 1096, 'Test.Person@example.org', 'sent')").run();
  w.prepare("INSERT INTO outreach_queue (id, email, reason, status, created_at) VALUES ('aq-1', 'test.person@example.org', 'arxiv-radar widened: An Example Paper On Quantum Things', 'sent', '2026-09-30 18:20:51')").run();
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const tstatus = (w, id) => q1(w, "SELECT status s FROM code_tasks WHERE id = ?", id).s;
const snap = (w) => JSON.stringify([qa(w, "SELECT * FROM agent_issues ORDER BY id"), qa(w, "SELECT * FROM issue_triage ORDER BY issue_id"), qa(w, "SELECT * FROM remediation_contracts ORDER BY class"), qa(w, "SELECT id, status, last_error FROM code_tasks ORDER BY id"), qa(w, "SELECT id, status, response FROM owner_prompts"), qa(w, "SELECT slug, status FROM human_actions"), qa(w, "SELECT actor, action FROM decision_log ORDER BY id")]);
const probe = (w, c) => q1(w, q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = ?", c).p);

{
  const w = world();
  const before = probe(w, "issue-100596");
  ok(before.observed.startsWith("blocked_or_unresolved:5"), "before: the 100596 probe counts the 5 failed tasks", before);
  w.exec(sql);
  for (const id of ["ct_im100345", "ct_im100419", "ct_im100442", "ct_im100467", "ct_im100468"]) ok(tstatus(w, id) === "superseded", "A1 " + id + " is superseded");
  ok(tstatus(w, "ct_im100438") === "merged" && tstatus(w, "ct_im100430") === "superseded" && tstatus(w, "ct_im100445") === "superseded", "A2 the already terminal tasks keep their status");
  ok(/REM-A7-PARKED-1/.test(q1(w, "SELECT last_error e FROM code_tasks WHERE id = 'ct_im100467'").e) && /raw read HTTP 404/.test(q1(w, "SELECT last_error e FROM code_tasks WHERE id = 'ct_im100467'").e), "A3 the reason is appended and the original error stays");
  const after = probe(w, "issue-100596");
  ok(after.observed === "blocked_or_unresolved:0" && after.observed === after.expected, "A4 the 100596 probe now reads blocked_or_unresolved:0", after);
  ok(qa(w, "SELECT * FROM bak_20261026_rem_a7_parked_tasks").length === 5 && qa(w, "SELECT * FROM bak_20261026_rem_a7_parked_tasks").every((r) => r.status === "failed"), "A5 the backup holds the 5 pre-state rows (status failed)");
  ok(/five in status failed are now superseded|Per-task disposition/.test(q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 100596").e) && q1(w, "SELECT status s FROM agent_issues WHERE id = 100596").s === "open", "A6 the finding is staged as close_evidence and the issue is not closed by the file");

  const c = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-100487'");
  ok(c.status === "active" && c.module === "rem-a7-owner-v1" && c.verify_transport === "d1-query" && c.last_verdict === null && c.attempts === 0, "B1 the placeholder contract of 100487 is now an active measuring contract", c);
  ok(!WRITE_KW.some((k) => c.verify_probe.toLowerCase().includes(k.toLowerCase())) && /^\s*SELECT\b/i.test(c.verify_probe), "B2 the probe is a literal select and carries no write keyword", WRITE_KW.filter((k) => c.verify_probe.toLowerCase().includes(k.toLowerCase())));
  const state = (status) => w.prepare("INSERT INTO integration_state (ts, json) VALUES (datetime('now'), ?)").run(JSON.stringify({ chains: [{ id: "errata", status: "draining" }, { id: "outreach", status }] }));
  ok(probe(w, "issue-100487").observed === "no integration_state row / waiting over 73h: 0", "B3 no integration_state row is named, not read as healthy", probe(w, "issue-100487"));
  state("empty-match");
  ok(probe(w, "issue-100487").observed === "empty-match / waiting over 73h: 0" && probe(w, "issue-100487").observed !== probe(w, "issue-100487").expected, "B4 an empty-match chain fails the probe", probe(w, "issue-100487"));
  state("healthy");
  ok(probe(w, "issue-100487").observed === probe(w, "issue-100487").expected, "B5 a healthy chain passes it", probe(w, "issue-100487"));
  w.prepare("INSERT INTO outreach_queue (id, email, reason, status, created_at) VALUES ('aq-2', 'x@example.org', 'r', 'needs-contact', datetime('now', '-80 hours'))").run();
  ok(probe(w, "issue-100487").observed === "healthy / waiting over 73h: 1" && probe(w, "issue-100487").observed !== probe(w, "issue-100487").expected, "B6 a row waiting over the 73 hour SLA fails it even when the chain reads healthy", probe(w, "issue-100487"));
  ok(/PR 4817/.test(q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 100487").e) && q1(w, "SELECT status s FROM agent_issues WHERE id = 100487").s === "open", "B7 the finding is staged and the issue stays open until the probe closes it");

  const p = q1(w, "SELECT status, model, response FROM owner_prompts WHERE id = 'op-mvn8oc5x7129'");
  ok(p.status === "answered" && p.model === "rem-a7:draft-for-owner-review", "C1 the owner prompt is answered", p);
  ok(/^DRAFT FOR YOUR REVIEW\. NOTHING WAS SENT/.test(p.response) && /Dear Test,/.test(p.response) && /An Example Paper On Quantum Things/.test(p.response), "C2 the draft carries the salutation and the paper title read from the queue rows", p.response.slice(0, 400));
  ok(!/@/.test(p.response) && !/example\.org/i.test(p.response) && !/Person/.test(p.response), "C3 no address, domain or surname in the stored text", p.response);
  ok(qa(w, "SELECT * FROM email_reply_queue").length === 1 && q1(w, "SELECT decision d FROM email_reply_queue WHERE id = 76").d === "sent", "C4 nothing is queued for sending: the reply queue is untouched");
  const pr = probe(w, "issue-1000101");
  ok(pr.observed === "acted" && pr.expected === "acted", "C5 the 1000101 contract probe reads acted now", pr);
  ok(/Draft delivered for owner review, nothing sent/.test(q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 1000101").e), "C6 the evidence is staged");

  const h = qa(w, "SELECT * FROM human_actions WHERE slug = 'attest-first-credibility-event'");
  ok(h.length === 1 && h[0].status === "open" && /^IDENTITY-BOUND:/.test(h[0].why) && !/claude|anthropic/i.test(JSON.stringify(h[0])), "D1 the credibility card is open, starts its why with IDENTITY-BOUND and carries no vendor word", h[0] && h[0].why.slice(0, 80));
  ok(/credibility_events_90d reads 1 or more or a confirmed external subscriber/.test(h[0].action), "D2 the card names its closing measure");
  ok(q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE id = 100488 AND instr(description, 'REM-A7-OWNER-A-1 2026-10-26') > 0").n === 1 && q1(w, "SELECT status s FROM agent_issues WHERE id = 100488").s === "open", "D3 the 100488 description carries the measured step once and the issue stays open");
  ok(/root_causes_unremediated 46/.test(q1(w, "SELECT remediation r FROM issue_triage WHERE issue_id = 1000247").r) && /29 are closed and 22 are open/.test(q1(w, "SELECT remediation r FROM issue_triage WHERE issue_id = 100120").r), "E1 the audit and tracker readings are recorded");
  ok(q1(w, "SELECT status s FROM agent_issues WHERE id = 1000247").s === "open" && q1(w, "SELECT status s FROM agent_issues WHERE id = 100120").s === "open" && q1(w, "SELECT status s FROM agent_issues WHERE id = 100999").s === "open", "E2 the two audit tickets stay open, the unrelated issue is untouched");
  ok(qa(w, "SELECT * FROM decision_log WHERE action LIKE 'REM-A7-OWNER-A-1:%'").length === 1, "F1 one decision_log row");

  const s = snap(w);
  w.exec(sql);
  ok(snap(w) === s, "G1 a replay changes nothing");
  // a later close of 100596 passes the evidence guard (its contract reads pass: the guard checks only a failing verdict)
  w.prepare("UPDATE remediation_contracts SET last_verdict = 'pass' WHERE class = 'issue-100596'").run();
  w.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = 100596").run();
  ok(q1(w, "SELECT status s FROM agent_issues WHERE id = 100596").s === "closed", "G2 the staged evidence lets the issue close once its probe passes");

  const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n");
  w.exec(rb);
  ok(["ct_im100345", "ct_im100419", "ct_im100442", "ct_im100467", "ct_im100468"].every((id) => tstatus(w, id) === "failed"), "H1 Rollback restores the five tasks to failed");
  ok(q1(w, "SELECT status s FROM remediation_contracts WHERE class = 'issue-100487'").s === "superseded" && q1(w, "SELECT status s FROM owner_prompts WHERE id = 'op-mvn8oc5x7129'").s === "queued" && q1(w, "SELECT response r FROM owner_prompts WHERE id = 'op-mvn8oc5x7129'").r === null, "H2 Rollback restores the placeholder contract and the queued prompt");
  ok(q1(w, "SELECT status s FROM human_actions WHERE slug = 'attest-first-credibility-event'").s === "resolved", "H3 Rollback resolves the card");
}
{
  const w = world({ status487: "closed", status488: "closed" });
  w.exec(sql);
  ok(q1(w, "SELECT status s FROM remediation_contracts WHERE class = 'issue-100487'").s === "superseded", "I1 an already closed 100487 keeps its contract");
  ok(qa(w, "SELECT * FROM human_actions").length === 0, "I2 no card is written when 100488 is no longer open");
}
{
  const w = world();
  w.prepare("UPDATE code_tasks SET status = 'queued' WHERE id = 'ct_im100345'").run();
  w.exec(sql);
  ok(tstatus(w, "ct_im100345") === "queued", "J1 a task that is no longer failed is left alone");
}
{
  const w = world({ status419: "closed" });
  w.prepare("UPDATE remediation_contracts SET status = 'superseded' WHERE class = 'issue-100419'").run();
  w.exec(sql);
  ok(tstatus(w, "ct_im100419") === "failed", "K1 ct_im100419 is superseded only while its issue is open under a live contract");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
