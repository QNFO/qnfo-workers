// REM-A7-UIA-FIXES-2 companion suite: replays migrations/2026-10-26-rem-a7-uia-card.sql (DB: qnfo-audit) on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs.
// Proves: the owner card for the one fact the papers do not hold (which of the final fifteen questions came out of the meta-audit) is inserted once, starts its why with the IDENTITY-BOUND line, carries the exact question, a default in effect
// and no claude.ai link; its closing contract parses under the consumer's rule (one literal read-only select on the living-paper transport) and reads 'pending' while the method paper still says 'several' and 'mapped' once it names the questions;
// the contract is attached to no issue, so the card cannot hold 100140 or 100576 open; both issues get one status paragraph that carries no probe marker; one decision_log row; a replay changes nothing; Rollback dismisses the card, supersedes the contract
// and trims the paragraphs. Output MUST contain "0 failed" on success.   node migrations/rem-a7-uia-card.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { UN_AFTER } from "./rem-a7-uia-fixture.mjs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-uia-card.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const consumer = readFileSync(here("../scripts/remediation_consumer.py"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");
ok(!/\bLIKE\s+'[^']{50,}'/i.test(body), "no LIKE pattern over 50 bytes");
ok(!/runtime-probe: \{|code-probe: \{/.test(body), "the appended paragraphs carry no probe marker that a D1 trigger would turn into a contract");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);
const WRITE_KW = (consumer.match(/WRITE_KW = \(([\s\S]*?)\n\)/) || [, ""])[1].match(/"([^"]+)"/g).map((x) => x.slice(1, -1));

function audit() {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  for (const [id, title] of [[100140, "UIA-SOURCE-FIDELITY-1: fix factual inconsistencies in the Ignorance Audit papers"], [100576, "OWNER-TASK-op-mvln7t9l2192: Execute the seven fixes listed in agent issue 100140"]]) {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'original description', 'x', 'high', 'open', 1, 1)").run(id, title);
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
  }
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const snap = (w) => JSON.stringify([qa(w, "SELECT id, description FROM agent_issues ORDER BY id"), qa(w, "SELECT class, status, verify_probe FROM remediation_contracts ORDER BY class"), qa(w, "SELECT slug, status, why FROM human_actions ORDER BY id"), qa(w, "SELECT actor, action FROM decision_log ORDER BY id")]);
const SEVERAL = "several of which were incorporated into the final fifteen-question instrument";

{
  const w = audit();
  const before = snap(w);
  w.exec(sql);
  const card = q1(w, "SELECT * FROM human_actions WHERE slug = 'uia-meta-audit-origin'");
  ok(card && card.status === "open" && card.sev === "normal" && card.source === "session:rem-a7-f4" && qa(w, "SELECT 1 FROM human_actions").length === 1, "one open card is inserted", card && { status: card.status, sev: card.sev, source: card.source });
  ok(card.why.startsWith("IDENTITY-BOUND:"), "the why starts with the IDENTITY-BOUND line (a card that truly needs the owner says so)");
  ok(/which of the final fifteen/i.test(card.title) && /fifteen-question instrument/.test(card.why) && /Author contributions/.test(card.why) && /Section 3 of the method paper/.test(card.action), "the card names the exact question and where its answer is numbered");
  ok(/narrowest wording/.test(card.default_in_effect) && /no loop waits/.test(card.default_in_effect), "a default is in effect and nothing waits on the card");
  ok(/^https:\/\/papers\.qnfo\.org\/papers\/universal-ignorance-audit\/$/.test(card.url) && !/claude\.ai|anthropic\.com|token|key\b/i.test(card.why + card.action + card.default_in_effect), "the card links the paper, never claude.ai, and asks for no token or key (OPEN-ACCESS-1)");
  // the closing contract
  const c = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'ha-uia-meta-audit-origin'");
  const low = c.verify_probe.toLowerCase();
  ok(c.issue_id === null && c.status === "active" && c.verify_transport === "d1-query@living-paper" && c.module === "rem-a7-uia-v1", "the contract is on the living-paper transport and attached to no issue, so the card cannot hold 100140 or 100576 open", c);
  ok(low.startsWith("select") && !WRITE_KW.some((kw) => low.includes(kw)) && !c.verify_probe.replace(/;\s*$/, "").includes(";"), "the probe is one literal read-only select (the consumer's rule)");
  const living = (b) => { const l = new DatabaseSync(":memory:"); l.exec("CREATE TABLE papers (slug TEXT, status TEXT, body_md TEXT)"); l.prepare("INSERT INTO papers VALUES ('universal-ignorance-audit', 'published', ?)").run(b); return qa(l, c.verify_probe)[0]; };
  const pend = living(UN_AFTER), done = living(UN_AFTER.replace(SEVERAL, "questions 4, 7 and 11 of the final fifteen-question instrument"));
  ok(UN_AFTER.includes(SEVERAL) && pend.expected === "mapped" && /^pending: /.test(pend.observed), "while the method paper says 'several' the probe reads pending", pend);
  ok(done.expected === "mapped" && done.observed === "mapped", "once the sentence names the questions it reads mapped", done);
  // descriptions
  for (const id of [100576, 100140]) {
    const d = q1(w, "SELECT description d FROM agent_issues WHERE id = ?", id).d;
    ok(d.startsWith("original description") && (d.match(/REM-A7-UIA-FIXES-2/g) || []).length === 1 && /ignorance-ai-pipeline-synthesis v0\.2\.2/.test(d) && /universal-ignorance-audit v0\.3\.2/.test(d) && /uia-meta-audit-origin/.test(d) && /rule c/.test(d) && /does not hold this issue open/.test(d), "issue " + id + " gets one status paragraph: both versions, the owner card, rule c");
  }
  ok(/listed only as headings/.test(q1(w, "SELECT description d FROM agent_issues WHERE id = 100576").d), "the paragraph says which draft wording was narrowed");
  ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE actor = 'rem-a7-f4' AND action LIKE 'REM-A7-UIA-FIXES-2:%'").n === 1, "one decision_log row");
  // replay
  const s = snap(w);
  w.exec(sql);
  ok(snap(w) === s && s !== before, "a replay changes nothing");
  // rollback
  const w2 = audit();
  w2.exec(sql);
  w2.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
  const r = q1(w2, "SELECT status, resolution FROM human_actions WHERE slug = 'uia-meta-audit-origin'");
  ok(r.status === "dismissed" && /rolled back/.test(r.resolution), "Rollback dismisses the card");
  ok(q1(w2, "SELECT status FROM remediation_contracts WHERE class = 'ha-uia-meta-audit-origin'").status === "superseded", "Rollback supersedes the contract");
  ok(qa(w2, "SELECT description d FROM agent_issues WHERE id IN (100576, 100140)").every((x) => x.d === "original description"), "Rollback trims both descriptions back");
}
{
  // an issue whose title moved on is not annotated
  const w = audit();
  w.exec("UPDATE agent_issues SET title = 'something else' WHERE id = 100140");
  w.exec(sql);
  ok(q1(w, "SELECT description d FROM agent_issues WHERE id = 100140").d === "original description" && q1(w, "SELECT description d FROM agent_issues WHERE id = 100576").d !== "original description", "a title that no longer matches keeps its issue unannotated");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
