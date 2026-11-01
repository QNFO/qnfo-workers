// REM-A7-PLAIN-1 offline suite: replays migrations/2026-10-26-rem-a7-plain.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs plus fixture living-paper tables.
// Proves: PLAIN-STANDARD-1 (qnfo-gateway code-task, corpus probe on d1-query@living-paper) and PAPER-AUDIENCES-1 (qnfo-research-exec code-task and code-probe) are filed once each, their code anchors occur exactly
// once in the worker sources on main, the corpus probe fails on a baseline-shaped corpus and passes only when no summary is above grade 12, none carries a DOI, arXiv id or et al, 75 percent are at grade 9 or below and
// every published paper has a summary; owner card 1000181 closes as superseded by them through the live close-sync trigger; an already closed card, a replay and the Rollback behave; the guideline doc carries the rules.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-plain.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-plain.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const gateway = readFileSync(here("../qnfo-gateway/worker.js"), "utf8");
const researchExec = readFileSync(here("../qnfo-research-exec/worker.js"), "utf8");
const doc = readFileSync(here("../docs/PAPER-AUTHORING-GUIDELINES.md"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };
const count = (hay, needle) => hay.split(needle).length - 1;

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/^\s*(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/im.test(body) && !/claude\.ai|anthropic\.com/i.test(sql + doc), "nothing is deleted or dropped, no claude.ai link in the file or the doc");
ok(!/[^\x00-\x7f]/.test(sql) && !/[^\x00-\x7f]/.test(doc), "the migration and the doc are ASCII");

ok(/R1[\s\S]*R2[\s\S]*R3[\s\S]*R4/.test(doc) && /704/.test(doc) && /PLAIN-STANDARD-1/.test(doc) && /PAPER-AUDIENCES-1/.test(doc) && /plain_summary/.test(doc), "the guideline doc carries the four rules, the audit baseline and the two issues");
ok(count(gateway, "function plainPrompt(paper, digest, strict) {") === 1, "the PLAIN-STANDARD-1 code anchor occurs exactly once in qnfo-gateway/worker.js");
ok(count(researchExec, '"- Write for an adjacent-field expert; define jargon once.",') === 1, "the PAPER-AUDIENCES-1 code anchor occurs exactly once in qnfo-research-exec/worker.js");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);

function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  w.exec("CREATE TABLE papers (slug TEXT PRIMARY KEY, status TEXT)");
  w.exec("CREATE TABLE plain_summary (slug TEXT PRIMARY KEY, rev TEXT, text TEXT NOT NULL, dropped INTEGER DEFAULT 0, grade REAL NOT NULL DEFAULT 0, method TEXT, generated_at TEXT)");
  const issue = (id, title, status = "open", src = "qnfo-fleet-dashboard:owner-request") => {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'text', ?, 'high', ?, 1, 1)").run(id, title, src, status);
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
  };
  issue(1000181, "OWNER-TASK-op-mvnq2nswe765: Update the paper authoring guidelines so every paper's plain language summary", o.closed ? "closed" : "open");
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES ('issue-1000181', 1000181, 'ISSUE-PROBE-AGENT-1', 'VACUOUS-PROBE-V3-1: a doer replaces this probe', 'SELECT 1 AS expected, 0 AS observed', 'd1-query', 'qnfo-fleet-control', ?, ?)").run(o.closed ? "superseded" : "active", o.closed ? "superseded:earlier" : "fail");
  issue(1000999, "SOME-OTHER-ISSUE: unrelated", "open", "qnfo-fleet-control");
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const st = (w, id) => q1(w, "SELECT status s FROM agent_issues WHERE id = ?", id).s;
const snap = (w) => JSON.stringify([qa(w, "SELECT * FROM agent_issues ORDER BY id"), qa(w, "SELECT * FROM issue_triage ORDER BY issue_id"), qa(w, "SELECT * FROM remediation_contracts ORDER BY class"), qa(w, "SELECT actor, action FROM decision_log ORDER BY id")]);
const corpus = (w, rows) => { for (const [slug, grade, text] of rows) { w.prepare("INSERT INTO papers (slug, status) VALUES (?, 'published')").run(slug); if (text !== null) w.prepare("INSERT INTO plain_summary (slug, text, grade, method) VALUES (?, ?, ?, 'model+ground')").run(slug, text, grade); } };

{
  const w = world();
  w.exec(sql);
  const ps = q1(w, "SELECT * FROM agent_issues WHERE title LIKE 'PLAIN-STANDARD-1:%'"), pa = q1(w, "SELECT * FROM agent_issues WHERE title LIKE 'PAPER-AUDIENCES-1:%'");
  ok(ps && ps.status === "open" && ps.priority === "high" && ps.category === "reach" && /^claude-session/.test(ps.source), "PLAIN-STANDARD-1 is one open high reach issue from a trusted session source", ps && [ps.status, ps.priority, ps.category]);
  ok(ps && /\ncode-task: repo=qnfo-workers path=qnfo-gateway\/worker\.js\ncode-anchor: function plainPrompt\(paper, digest, strict\) \{$/.test(ps.description) && /348 above 9, 224 above 12/.test(ps.description) && /Definition of done/.test(ps.description), "it ends with the code-task and anchor lines and carries the audit numbers and a definition of done");
  ok(pa && pa.status === "open" && pa.priority === "medium" && pa.category === "research" && /^claude-session/.test(pa.source), "PAPER-AUDIENCES-1 is one open medium research issue from a trusted session source");
  const lines = pa ? pa.description.split("\n") : [];
  const anchor = lines.find((l) => l.startsWith("code-anchor: ")), probe = lines.find((l) => l.startsWith("code-probe: ")), task = lines.find((l) => l.startsWith("code-task: "));
  ok(task === "code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js" && anchor === 'code-anchor: "- Write for an adjacent-field expert; define jargon once.",' && researchExec.includes(anchor.slice("code-anchor: ".length)), "its code-task path and anchor match the worker text on main", anchor);
  let pj = null; try { pj = JSON.parse(probe.slice("code-probe: ".length)); } catch (e) { pj = null; }
  ok(pj && pj.paths && pj.paths[0] === "qnfo-research-exec/worker.js" && pj.contains === "PAPER-AUDIENCES-1" && researchExec.includes("PAPER-AUDIENCES-1"), "its code-probe matches the implemented writer-prompt requirement", pj);
  ok(q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'PLAIN-STANDARD-1:%'").n === 1 && q1(w, "SELECT COUNT(*) n FROM agent_issues WHERE title LIKE 'PAPER-AUDIENCES-1:%'").n === 1, "each issue is filed once");

  const c = q1(w, "SELECT * FROM remediation_contracts WHERE class = ?", "issue-" + ps.id);
  ok(c && c.status === "active" && c.verify_transport === "d1-query@living-paper" && c.issue_id === ps.id, "PLAIN-STANDARD-1 has an active d1-query@living-paper contract on class issue-<id>", c && [c.status, c.verify_transport]);
  ok(!["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"].some((k) => c.verify_probe.toLowerCase().includes(k)) && !c.verify_probe.includes(";") && /^with /i.test(c.verify_probe), "the probe is a literal read-only WITH statement for the remediation consumer");

  // baseline-shaped corpus: fails and says why
  const base = world(); base.exec(sql);
  const bc = q1(base, "SELECT verify_probe FROM remediation_contracts WHERE class LIKE 'issue-%' AND verify_transport = 'd1-query@living-paper'");
  corpus(base, [["a", 7.5, "Plain text a."], ["b", 8.9, "Plain text b."], ["c", 13.2, "Hard text c."], ["d", 24.5, "Hard text d."]]);
  const r0 = q1(base, bc.verify_probe);
  ok(r0 && r0.expected === "ok" && r0.observed === "4 of 4 published papers have a plain summary: 2 are above grade 12, 0 mention a DOI, arXiv id or et al, 2 are at grade 9 or below (75 percent needed)", "the probe fails on a baseline-shaped corpus and names the counts", r0);
  // good corpus passes
  const good = world(); good.exec(sql);
  corpus(good, [["a", 7.5, "Plain text a."], ["b", 8.9, "Plain text b."], ["c", 9, "Plain text c."], ["d", 11.4, "Slightly harder text d."]]);
  ok(q1(good, bc.verify_probe).observed === "ok", "the probe passes at 3 of 4 at grade 9 or below, none above 12, no reference token, every paper summarised");
  // each condition alone fails it
  const miss = world(); miss.exec(sql); corpus(miss, [["a", 7, "Plain."], ["b", 7, "Plain."], ["c", 7, "Plain."], ["d", 7, null]]);
  ok(q1(miss, bc.verify_probe).observed !== "ok", "a published paper with no summary fails the probe");
  const doi = world(); doi.exec(sql); corpus(doi, [["a", 7, "See the doi 10.1234 for details."], ["b", 7, "Plain."], ["c", 7, "Plain."], ["d", 7, "Plain."]]);
  ok(/1 mention a DOI/.test(q1(doi, bc.verify_probe).observed), "a DOI in a summary fails the probe");
  const android = world(); android.exec(sql); corpus(android, [["a", 7, "The android set all the sensors."], ["b", 7, "Plain."], ["c", 7, "Plain."], ["d", 7, "Plain."]]);
  ok(q1(android, bc.verify_probe).observed === "ok", "the words android and set all do not trip the reference check (word-bounded tokens)");
  const etal = world(); etal.exec(sql); corpus(etal, [["a", 7, "Smith et al found it."], ["b", 7, "Plain."], ["c", 7, "Plain."], ["d", 7, "Plain."]]);
  ok(/1 mention a DOI/.test(q1(etal, bc.verify_probe).observed), "et al fails the probe");
  const arx = world(); arx.exec(sql); corpus(arx, [["a", 7, "Posted on arXiv last year."], ["b", 7, "Plain."], ["c", 7, "Plain."], ["d", 7, "Plain."]]);
  ok(/1 mention a DOI/.test(q1(arx, bc.verify_probe).observed), "an arXiv mention fails the probe");
  const g12 = world(); g12.exec(sql); corpus(g12, [["a", 12.1, "Hard."], ["b", 7, "Plain."], ["c", 7, "Plain."], ["d", 7, "Plain."]]);
  ok(/1 are above grade 12/.test(q1(g12, bc.verify_probe).observed), "one summary above grade 12 fails the probe");
  const share = world(); share.exec(sql); corpus(share, [["a", 10, "Mid."], ["b", 10, "Mid."], ["c", 10, "Mid."], ["d", 7, "Plain."]]);
  ok(/1 are at grade 9 or below/.test(q1(share, bc.verify_probe).observed), "75 percent at grade 9 or below is required");

  const a = q1(w, "SELECT status, close_channel FROM agent_issues WHERE id = 1000181"), t = q1(w, "SELECT * FROM issue_triage WHERE issue_id = 1000181"), k = q1(w, "SELECT status, last_verdict FROM remediation_contracts WHERE class = 'issue-1000181'");
  ok(a.status === "closed" && a.close_channel === "auto:triage-sync:qnfo-gateway", "card 1000181 is closed by the live close-sync trigger", a);
  ok(t.close_evidence.startsWith("superseded by " + ps.id + " (PLAIN-STANDARD-1)") && t.close_evidence.includes("and by " + pa.id + " (PAPER-AUDIENCES-1)") && /docs\/PAPER-AUTHORING-GUIDELINES\.md/.test(t.close_evidence) && /704 papers published and 704 plain summaries/.test(t.close_evidence) && /224/.test(t.close_evidence), "its evidence names both successors, the doc and the audit numbers (and starts with superseded, which the reopen rule skips)", t.close_evidence.slice(0, 140));
  ok(k.status === "superseded" && /^superseded:REM-A7-PLAIN-1/.test(k.last_verdict), "its contract left the closing path as superseded");
  ok(st(w, 1000999) === "open", "an unrelated issue is untouched");
  const d = qa(w, "SELECT actor, action FROM decision_log");
  ok(d.length === 1 && d[0].actor === "rem-a7-f3" && /^REM-A7-PLAIN-1:/.test(d[0].action), "one decision_log row");
}
{
  const w = world();
  w.exec(sql);
  const s1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s1, "a replay changes nothing");
}
{
  const w = world();
  w.exec(sql);
  const rb = sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n");
  w.exec(rb);
  ok(st(w, 1000181) === "open" && q1(w, "SELECT status s, last_verdict v FROM remediation_contracts WHERE class = 'issue-1000181'").s === "active" && q1(w, "SELECT triage_state t FROM issue_triage WHERE issue_id = 1000181").t === "triaged", "Rollback reopens the card and restores its contract and triage row");
}
{
  const w = world({ closed: true });
  const t0 = JSON.stringify(q1(w, "SELECT * FROM issue_triage WHERE issue_id = 1000181"));
  w.exec(sql);
  ok(JSON.stringify(q1(w, "SELECT * FROM issue_triage WHERE issue_id = 1000181")) === t0 && st(w, 1000181) === "closed", "an already closed card gets no new triage text");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
