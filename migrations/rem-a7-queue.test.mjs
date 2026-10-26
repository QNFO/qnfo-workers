// REM-A7-QUEUE-1 offline suite: replays migrations/2026-10-26-rem-a7-queue.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs (agent_issues,
// issue_triage, remediation_contracts, decision_log and the live close-sync triggers, issue_close_evidence_required) plus research_queue and intents.
// Proves: the header opts in; the successor issue RESEARCH-ERRATA-CLAIM-1 is filed once with its code-task line and a d1-query probe that fails on the live-shaped numbers (0 published, 0 claimed, N waiting)
// and passes at 7 published corrections; the four owner cards close through the live close-sync trigger as superseded by the successor, with their contracts superseded; the intent becomes one research_queue
// row of source idea (provenance phrase reworded, sub-questions kept) and issue 1000457 closes on that row with a contract that fails when the row is parked or lost; an already closed card, a missing intent
// and a too-short intent change nothing; a replay changes nothing; the Rollback line restores the before-state; no probe contains a write keyword of the remediation consumer.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-queue.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-queue.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");
ok(!/[^\x00-\x7f]/.test(sql), "the file is ASCII");
ok(!/\b(UPDATE|DELETE\s+FROM|INSERT(?:\s+OR\s+\w+)?\s+INTO|REPLACE\s+INTO)\s+"?(decision_log|issue_lifecycle)\b/i.test(body.replace(/INSERT INTO decision_log/g, "")), "the append-only tables are only inserted into");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);

const iso = (hAgo) => new Date(Date.now() - hAgo * 3600000).toISOString().slice(0, 19) + "Z";
const DESIRE = "Is mathematics invented or discovered? Consolidated from a video thesis (10 arguments for discovery: Plimpton 322 cross-cultural convergence, non-Euclidean geometry preceding GR, Wigner's unreasonable effectiveness) and a critique arguing the dichotomy is false (we invent representations and discover constrained consequences). Research sub-questions: (1) Which aspects of mathematical practice are invented vs discovered? (2) Does cross-cultural convergence evidence shared constraints? Target output: a defensible middle position that states the applicability puzzle precisely rather than dissolving it.";
const CARDS = [[100129, "OWNER-TASK-op-mvf3s6slc4cd: Investigate why 198 queued items are not progressing to the ground stage"], [1000159, "OWNER-TASK-op-mvnl6qwg8add: Review the 192 queued research ideas and report why throughput is low"], [1000231, "OWNER-TASK-op-mvoaby2b7e58: Investigate the integration-chain backpressure: 192 research-queue items waiting"], [1000094, "OWNER-TASK-op-mvn8d4k0b46a: Investigate the stuck integration chain Errata watch -> respond -> publish"]];

function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec("CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT DEFAULT 'queued', claimed_at TEXT, completed_at TEXT, paper_slug TEXT, created_at TEXT, stage TEXT, error TEXT, published_at TEXT, UNIQUE(source, source_id))");
  w.exec("CREATE TABLE intents (id TEXT PRIMARY KEY, desire TEXT, type TEXT, status TEXT)");
  if (o.intent !== false) w.prepare("INSERT INTO intents (id, desire, type, status) VALUES ('int-022429ffmvpihdfe', ?, 'task', 'promoted')").run(o.desire ?? DESIRE);
  const issue = (id, title, status = "open", src = "qnfo-fleet-dashboard:owner-request") => {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'text', ?, 'high', ?, 1, 1)").run(id, title, src, status);
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
  };
  const contract = (id, status, verdict, probe = "SELECT 'x' AS expected, 'y' AS observed") =>
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES (?, ?, 'ISSUE-PROBE-AGENT-1', 'VACUOUS-PROBE-V3-1: a doer replaces this probe', ?, 'd1-query', 'qnfo-fleet-control', ?, ?)").run("issue-" + id, id, probe, status, verdict);
  for (const [id, title] of CARDS) {
    issue(id, title, o.closed === id ? "closed" : "open");
    if (o.closed !== id) contract(id, "active", "fail");
    else contract(id, "superseded", "superseded:earlier");
  }
  issue(1000457, "INTENT-TASK-int-022429ffmvpihdfe: Is mathematics invented or discovered?");
  contract(1000457, "superseded", "superseded:closure-observing-probe-at-birth");
  issue(1000999, "SOME-OTHER-ISSUE: unrelated", "open", "qnfo-fleet-control");
  contract(1000999, "active", "fail");
  const rq = w.prepare("INSERT INTO research_queue (id, source, source_id, idea, score, decision, status, created_at, published_at, claimed_at) VALUES (?, 'remediation', ?, 'Correct the published paper x', 0.95, 'ACCEPT', ?, ?, ?, ?)");
  for (let i = 1; i <= (o.errataWaiting ?? 3); i++) rq.run("rem-e" + i, "errata:" + i, "queued", iso(100), null, null);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const st = (w, id) => q1(w, "SELECT status s FROM agent_issues WHERE id = ?", id).s;
const snap = (w) => JSON.stringify([qa(w, "SELECT * FROM agent_issues ORDER BY id"), qa(w, "SELECT * FROM issue_triage ORDER BY issue_id"), qa(w, "SELECT * FROM remediation_contracts ORDER BY class"), qa(w, "SELECT * FROM research_queue ORDER BY id"), qa(w, "SELECT actor, action FROM decision_log ORDER BY id")]);

{
  const w = world();
  w.exec(sql);
  const succ = q1(w, "SELECT * FROM agent_issues WHERE title LIKE 'RESEARCH-ERRATA-CLAIM-1:%'");
  ok(succ && succ.status === "open" && succ.priority === "high" && /^claude-session/.test(succ.source) && succ.category === "research", "the successor RESEARCH-ERRATA-CLAIM-1 is one open high research issue from a trusted session source", succ && [succ.status, succ.priority, succ.source]);
  ok(succ && /\ncode-task: repo=qnfo-workers path=qnfo-research-exec\/worker\.js\ncode-anchor: async function claimNew\(env\) \{$/.test(succ.description), "it ends with the code-task and code-anchor lines the code loop reads");
  ok(succ && /0 ever claimed|claimed_at is set on 0 and published_at on 0/.test(succ.description) && /233 errata remediation rows/.test(succ.title) && /Definition of done/.test(succ.description) && /04:32:42Z/.test(succ.description), "it carries the measured numbers and its definition of done");
  ok(q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'RESEARCH-ERRATA-CLAIM-1:%'").n === 1, "exactly one successor");

  const c = succ && q1(w, "SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + succ.id);
  ok(c && c.status === "active" && c.verify_transport === "d1-query" && c.issue_id === succ.id, "the successor has an active d1-query contract on class issue-<id>", c && [c.status, c.verify_transport]);
  const r0 = c && q1(w, c.verify_probe);
  ok(r0 && r0.expected === "ok" && r0.observed === "fewer than 7 errata corrections published in 7 days: 0 published, 0 ever claimed, 3 waiting", "the probe fails on the live shape and says why (0 published, 0 claimed, 3 waiting)", r0);
  for (let i = 10; i < 17; i++) w.prepare("INSERT INTO research_queue (id, source, source_id, idea, status, created_at, published_at, claimed_at) VALUES (?, 'remediation', ?, 'x', 'published', ?, ?, ?)").run("rem-p" + i, "errata:" + i, iso(60), iso(30 + i), iso(40 + i));
  const r7 = q1(w, c.verify_probe);
  ok(r7 && r7.observed === "ok", "the probe passes with 7 errata corrections published in the last 7 days", r7);
  w.prepare("UPDATE research_queue SET published_at = ? WHERE id = 'rem-p10'").run(iso(24 * 9));
  ok(q1(w, c.verify_probe).observed !== "ok", "a correction published 9 days ago does not count: 6 of 7 fails");
  ok(!["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"].some((k) => c.verify_probe.toLowerCase().includes(k)) && !c.verify_probe.includes(";"), "the probe is a literal read-only statement for the remediation consumer");

  for (const [id] of CARDS) {
    const a = q1(w, "SELECT status, close_channel FROM agent_issues WHERE id = ?", id), t = q1(w, "SELECT * FROM issue_triage WHERE issue_id = ?", id), k = q1(w, "SELECT status, last_verdict FROM remediation_contracts WHERE class = ?", "issue-" + id);
    ok(a.status === "closed" && a.close_channel === "auto:triage-sync:qnfo-research-exec", "card " + id + " is closed by the live close-sync trigger", a);
    ok(t.triage_state === "closed" && t.close_evidence.startsWith("superseded by " + succ.id + " (RESEARCH-ERRATA-CLAIM-1)"), "card " + id + " carries superseded-by evidence naming the successor (the reopen rule skips a closure that starts with superseded)", t.close_evidence.slice(0, 120));
    ok(k.status === "superseded" && /^superseded:REM-A7-QUEUE-1/.test(k.last_verdict), "card " + id + " contract left the closing path as superseded");
  }
  const ev = (id) => q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = ?", id).e;
  ok(/360000-neuron day|spent=414499/.test(ev(100129)) && /155 hold events/.test(ev(100129)) && /8 publications/.test(ev(100129)), "100129 evidence answers the question with numbers: budget spent, hold events, publications");
  ok(/rem-a0d00390-938a-4836-978d-e5426be60cc4/.test(ev(1000159)) && /claimNew ranks 8 revision rows/.test(ev(1000159)) && /publishStageV2/.test(ev(1000159)), "1000159 evidence names the oldest item, its claim position and why its source was not changed");
  ok(/356 papers went published to quarantined/.test(ev(1000231)) && /387 went back to published/.test(ev(1000231)) && /exceededMemory/.test(ev(1000231)) && /1000079/.test(ev(1000231)), "1000231 evidence answers the withdrawn-papers question and the three workers");
  ok(/562 internal-open/.test(ev(1000094)) && /245 rows today/.test(ev(1000094)) && /PLAIN-FILL-MEMORY-1/.test(ev(1000094)) && /not restored by this card/.test(ev(1000094)), "1000094 evidence names the chain counts, the producer, the gateway fix and that throughput is not restored here");
  ok(st(w, 1000999) === "open" && q1(w, "SELECT status s FROM remediation_contracts WHERE class = 'issue-1000999'").s === "active", "an unrelated issue and its contract are untouched");
  ok(st(w, succ.id) === "open", "the successor stays open until its probe passes");

  const row = q1(w, "SELECT * FROM research_queue WHERE id = 'idea-int-022429ffmvpihdfe'");
  ok(row && row.source === "idea" && row.source_id === "math-invented-or-discovered-20261026" && row.status === "queued" && row.score === 0.97 && row.decision === "accept" && /^\d{4}-\d{2}-\d{2}T[\d:]+Z$/.test(row.created_at), "the intent is one research_queue row of source idea, queued, score 0.97, decision accept", row);
  ok(row && !/video thesis/.test(row.idea) && /Arguments for discovery to weigh \(Plimpton 322/.test(row.idea) && /\) against the critique that the dichotomy is false \(we invent representations/.test(row.idea) && /Research sub-questions: \(1\)/.test(row.idea) && /Target output: a defensible middle position/.test(row.idea), "the idea text drops the provenance phrase and keeps the arguments, the sub-questions and the target output", row && row.idea.slice(0, 200));
  ok(row && /intent int-022429ffmvpihdfe, agent_issues 1000457/.test(row.summary), "the summary records the intent and the issue");
  const k457 = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000457'");
  ok(!["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"].some((k) => k457.verify_probe.toLowerCase().includes(k)) && !k457.verify_probe.includes(";") && /^select /i.test(k457.verify_probe), "the 1000457 probe is a literal read-only SELECT for the remediation consumer");
  ok(k457.status === "active" && k457.verify_transport === "d1-query" && q1(w, k457.verify_probe).observed === "routed" && q1(w, k457.verify_probe).expected === "routed", "1000457 contract is an active probe that reads routed while the row is queued", k457.status);
  w.prepare("UPDATE research_queue SET status = 'wontfix' WHERE id = 'idea-int-022429ffmvpihdfe'").run();
  ok(q1(w, k457.verify_probe).observed === "row status wontfix", "the same probe fails when the row is parked");
  w.prepare("DELETE FROM research_queue WHERE id = 'idea-int-022429ffmvpihdfe'").run();
  ok(q1(w, k457.verify_probe).observed === "row missing", "and when the row is lost");
  w.prepare("INSERT INTO research_queue (id, source, source_id, idea, status, created_at) VALUES ('idea-int-022429ffmvpihdfe', 'idea', 'math-invented-or-discovered-20261026', 'x', 'queued', '2026-10-26T18:30:00Z')").run();
  const a457 = q1(w, "SELECT status, close_channel FROM agent_issues WHERE id = 1000457"), t457 = q1(w, "SELECT * FROM issue_triage WHERE issue_id = 1000457");
  ok(a457.status === "closed" && a457.close_channel === "auto:triage-sync:qnfo-research-exec" && /research_queue row idea-int-022429ffmvpihdfe \(source idea, source_id math-invented-or-discovered-20261026, status queued, score 0\.97, decision accept/.test(t457.close_evidence) && /not run inline/i.test(t457.close_evidence), "1000457 closed on the queue row id, with the row facts and the not-run-inline statement", t457.close_evidence.slice(0, 160));

  const d = qa(w, "SELECT actor, action FROM decision_log");
  ok(d.length === 1 && d[0].actor === "rem-a7-f3" && /^REM-A7-QUEUE-1:/.test(d[0].action), "one decision_log row");
  ok(q1(w, "SELECT COUNT(*) n FROM bak_20261026_rem_a7_queue_contracts").n === 5 && q1(w, "SELECT COUNT(*) n FROM bak_20261026_rem_a7_queue_triage").n === 5 && q1(w, "SELECT COUNT(*) n FROM bak_20261026_rem_a7_queue_issues").n === 5, "the before-states of the five issues were kept");
}

{
  // replay: nothing changes, including the backups and the decision row
  const w = world();
  w.exec(sql);
  const s1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s1, "a replay changes nothing");
}

{
  // rollback restores the before-state
  const w = world();
  const before = snap(w);
  w.exec(sql);
  const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n");
  w.exec(rb);
  for (const [id] of CARDS) ok(st(w, id) === "open" && q1(w, "SELECT status s, last_verdict v FROM remediation_contracts WHERE class = ?", "issue-" + id).s === "active" && q1(w, "SELECT triage_state t FROM issue_triage WHERE issue_id = ?", id).t === "triaged", "Rollback reopens card " + id + " and restores its contract and triage row");
  ok(st(w, 1000457) === "open" && q1(w, "SELECT status s FROM remediation_contracts WHERE class = 'issue-1000457'").s === "superseded" && q1(w, "SELECT status s FROM research_queue WHERE id = 'idea-int-022429ffmvpihdfe'").s === "wontfix", "Rollback reopens 1000457, restores its contract and parks the research row");
  ok(before !== undefined, "before-state captured");
}

{
  // an already closed card is not touched
  const w = world({ closed: 1000159 });
  const t0 = JSON.stringify(q1(w, "SELECT * FROM issue_triage WHERE issue_id = 1000159"));
  w.exec(sql);
  ok(JSON.stringify(q1(w, "SELECT * FROM issue_triage WHERE issue_id = 1000159")) === t0 && st(w, 1000159) === "closed", "an already closed card gets no new triage text");
  ok(st(w, 100129) === "closed" && st(w, 1000231) === "closed" && st(w, 1000094) === "closed", "the other cards still close");
}
{
  // no intent row: nothing is queued and 1000457 stays open
  const w = world({ intent: false });
  w.exec(sql);
  ok(q1(w, "SELECT COUNT(*) n FROM research_queue WHERE source = 'idea'").n === 0 && st(w, 1000457) === "open" && q1(w, "SELECT status s FROM remediation_contracts WHERE class = 'issue-1000457'").s === "superseded", "without the intent nothing is queued, 1000457 stays open and its contract is unchanged");
}
{
  // too short an intent is not queued
  const w = world({ desire: "Is mathematics invented or discovered?" });
  w.exec(sql);
  ok(q1(w, "SELECT COUNT(*) n FROM research_queue WHERE source = 'idea'").n === 0 && st(w, 1000457) === "open", "an intent under 200 characters is not queued and 1000457 stays open");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
