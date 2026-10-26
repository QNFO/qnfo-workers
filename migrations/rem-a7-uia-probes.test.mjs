// REM-A7-UIA-FIXES-1 closing-machinery suite: replays migrations/2026-10-26-rem-a7-uia-probes.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs, and runs the stored probes
// against a living-paper fixture (the shared fixture of the three Ignorance Audit papers before and after the mechanical fixes).
// Proves: the widened probe of issue 100140 keeps its three original conditions verbatim; on the papers before the fixes the original probe reads 3 and the widened one 13; after the mechanical fixes the ORIGINAL probe would read 0
// (and close the issue with items 2 and 4 open) while the widened probe reads 2; after items 2 and 4 are applied it reads 0; issue 100576 gets three contracts (100140 closed, the ignorance-audit README on main carries the address,
// no page reproduces the registered abstract) that parse under the consumers' rules and read what they should; the status paragraphs are appended once, carry the drafts and no probe marker that a D1 trigger would turn into
// a contract; a replay changes nothing; Rollback restores the old probe, supersedes the new contracts and trims the paragraphs.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-uia-probes.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { AI, AI_AFTER, SY, SY_AFTER, UN, UN_AFTER, ITEM2, ITEM2B, SIB } from "./rem-a7-uia-fixture.mjs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-uia-probes.sql"), "utf8");
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
ok(!/runtime-probe: \{|code-probe: \{/.test(sql.replace(/^--.*$/gm, "")), "the appended paragraphs carry no probe marker that a D1 trigger would turn into a contract");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);
const WRITE_KW = (consumer.match(/WRITE_KW = \(([\s\S]*?)\n\)/) || [, ""])[1].match(/"([^"]+)"/g).map((x) => x.slice(1, -1));
const OLD_PROBE = "SELECT '0' AS expected, CAST((SELECT (instr(body_md, 'Quni-Gudzinas 2026b, https://papers.qnfo.org/papers/the-ultrametric-foundation') > 0) + (instr(body_md, 'papers/qwave-qudit-advantage') = 0) + (instr(body_md, '13, 1' || char(8211) || '29') > 0) FROM papers WHERE slug = 'ai4metascience-ignorance-audit' ORDER BY rowid DESC LIMIT 1) AS TEXT) AS observed";
const VACUOUS = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open.";

function audit() {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  const issue = (id, title) => {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'original description', 'x', 'high', 'open', 1, 1)").run(id, title);
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
  };
  issue(100140, "UIA-SOURCE-FIDELITY-1: fix factual inconsistencies in the Ignorance Audit papers");
  issue(100576, "OWNER-TASK-op-mvln7t9l2192: Execute the seven fixes listed in agent issue 100140");
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, last_verdict, attempts) VALUES ('issue-100140', 100140, 'p', 'PROBE-NEEDED-LIVE-PATHS-1: counts items 1 and 3', ?, 'd1-query@living-paper', 'qnfo-fleet-control', 'active', 'x', 'fail', 250)").run(OLD_PROBE);
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, last_verdict) VALUES ('issue-100576', 100576, 'p', ?, 'SELECT ''closed'' AS expected, NULL AS observed', 'd1-query', 'qnfo-fleet-control', 'superseded', 'probe-template-v3-generic', 'superseded:closure-observing-probe-at-birth')").run(VACUOUS);
  return w;
}
function living(bodies, extra) {
  const l = new DatabaseSync(":memory:");
  l.exec("CREATE TABLE papers (slug TEXT, status TEXT, body_md TEXT, abstract TEXT)");
  const ins = l.prepare("INSERT INTO papers (slug, status, body_md) VALUES (?, 'published', ?)");
  ins.run("ai4metascience-ignorance-audit", bodies[0]); ins.run("ignorance-ai-pipeline-synthesis", bodies[1]); ins.run("universal-ignorance-audit", bodies[2]);
  if (extra) l.exec(extra);
  return l;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const observed = (db, probe) => qa(db, probe)[0].observed;
const snap = (w) => JSON.stringify([qa(w, "SELECT id, description FROM agent_issues ORDER BY id"), qa(w, "SELECT class, status, verify_probe, module FROM remediation_contracts ORDER BY class"), qa(w, "SELECT actor, action FROM decision_log ORDER BY id")]);

const ITEM2_NEW = "The human researcher then supplied twelve sharper questions that developed these dimensions further: power analysis, the somatic/tacit dimension, the protected-ignorance probe, and the wobble.";
const ITEM2B_NEW = "the human contributed sharper questions on the dimensions the AI's first extraction listed only as headings (power, body, taboo).";
const SIB_NEW = SIB.replace("discernment between generative and harmful ignorance, the gift of not-knowing)", "discernment between generative and harmful ignorance, willful ignorance, the gift of not-knowing)");
const SY_FULL = SY_AFTER.replace(ITEM2, ITEM2_NEW).replace(ITEM2B, ITEM2B_NEW);
const UN_FULL = UN_AFTER.replace(SIB, SIB_NEW);

{
  const w = audit();
  w.exec(sql);
  const c140 = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-100140'");
  ok(c140.status === "active" && c140.module === "rem-a7-uia-v1" && c140.verify_transport === "d1-query@living-paper" && c140.last_verdict === null && c140.attempts === 0 && c140.verify_probe !== OLD_PROBE, "issue-100140: the probe is replaced, the contract re-armed", c140);
  const inner = OLD_PROBE.slice(OLD_PROBE.indexOf("(SELECT (instr") + 8, OLD_PROBE.indexOf(" FROM papers WHERE slug = 'ai4metascience"));
  ok(c140.verify_probe.includes(inner), "the three original conditions are kept verbatim inside the widened probe (widened, not weakened)");
  const low = c140.verify_probe.toLowerCase();
  ok(low.startsWith("select") && !WRITE_KW.some((kw) => low.includes(kw)) && !c140.verify_probe.replace(/;\s*$/, "").includes(";"), "the widened probe is one literal read-only select (the consumer's rule)");
  // the probe on the three papers at each stage
  const before = living([AI, SY, UN]);
  ok(observed(before, OLD_PROBE) === "3" && observed(before, c140.verify_probe) === "13", "before the fixes: the original probe reads 3, the widened one 13 (6 + 4 + 3)", [observed(before, OLD_PROBE), observed(before, c140.verify_probe)]);
  const mech = living([AI_AFTER, SY_AFTER, UN_AFTER]);
  ok(observed(mech, OLD_PROBE) === "0", "after the mechanical fixes the ORIGINAL probe reads 0: it would have closed the issue with items 2 and 4 open");
  ok(observed(mech, c140.verify_probe) === "2", "after the mechanical fixes the widened probe reads 2 (items 2 and 4)", observed(mech, c140.verify_probe));
  ok(observed(living([AI_AFTER, SY_AFTER.replace(ITEM2, ITEM2_NEW), UN_AFTER]), c140.verify_probe) === "1", "item 2 applied: 1 left");
  ok(observed(living([AI_AFTER, SY_AFTER, UN_AFTER.replace(SIB, SIB_NEW)]), c140.verify_probe) === "1", "item 4 applied: 1 left");
  const done = living([AI_AFTER, SY_FULL, UN_FULL]);
  ok(observed(done, c140.verify_probe) === "0", "with items 2 and 4 applied too the widened probe reads 0");
  ok(observed(living([AI_AFTER.replace("(2026b). *The Qudit", "(2026b). *The Ultrametric Foundation: x*. The Qudit").replace("Quni-Gudzinas 2026b, " + "https://papers.qnfo.org/papers/qwave-qudit-advantage/", "Quni-Gudzinas 2026b, https://papers.qnfo.org/papers/the-ultrametric-foundation-x"), SY_FULL, UN_FULL]), c140.verify_probe) === "1", "item 1 regressing (the old citation back) reads 1");
  // issue 100576
  const cs = qa(w, "SELECT * FROM remediation_contracts WHERE issue_id = 100576 ORDER BY class");
  ok(cs.length === 3 && cs.every((c) => c.status === "active" && c.module === "rem-a7-uia-v1"), "issue 100576 has three active contracts", cs.map((c) => c.class));
  const by = Object.fromEntries(cs.map((c) => [c.class, c]));
  const a = by["issue-100576"];
  ok(a.verify_transport === "d1-query" && observed(w, a.verify_probe) === "open" && a.verify_probe.indexOf("id = 100576") < 0, "contract A reads the status of ANOTHER issue (100140), never its own", observed(w, a.verify_probe));
  w.exec("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (999, 'x', 'triaged', 'x', 'x', 'x') ON CONFLICT(issue_id) DO NOTHING");
  w.exec("UPDATE issue_triage SET close_evidence = 'probe passed' WHERE issue_id = 100140");
  w.exec("UPDATE agent_issues SET status = 'closed' WHERE id = 100140");
  ok(observed(w, a.verify_probe) === "closed" && a.expected_cadence_h !== undefined, "and reads closed once 100140 is closed");
  const bb = by["uia-100576-item6-readme"], p6 = JSON.parse(bb.verify_probe);
  const RT_HTTP_HOSTS = ["raw.githubusercontent.com", "api.github.com", "github.com", "pypi.org", "doi.org", "api.openalex.org", "api.crossref.org", "api.datacite.org", "mstdn.science"];
  ok(bb.verify_transport === "external-https" && RT_HTTP_HOSTS.includes(new URL(p6.url).hostname) && p6.method === "GET" && /^body-contains:.+/.test(p6.check) && p6.expected === "present" && p6.check === "body-contains:papers.qnfo.org/papers/universal-ignorance-audit", "contract B: external-https on the raw README, a positive marker (an error page cannot pass)", p6);
  const cc = by["uia-100576-item7-abstract-not-reproduced"], lowc = cc.verify_probe.toLowerCase();
  ok(cc.verify_transport === "d1-query@living-paper" && lowc.startsWith("select") && !WRITE_KW.some((kw) => lowc.includes(kw)) && observed(done, cc.verify_probe) === "0", "contract C: the abstract phrase count reads 0 on the papers");
  ok(observed(living([AI_AFTER, SY_FULL, UN_FULL], "UPDATE papers SET abstract = 'maps known unknowns and ignorance about ignorance' WHERE slug = 'universal-ignorance-audit'"), cc.verify_probe) === "1" && observed(living([AI_AFTER, SY_FULL, UN_FULL + "\nIgnorance About Ignorance reproduced."]), cc.verify_probe) === "1", "and reads 1 the day an abstract or a body reproduces it (the errata become due)");
  // descriptions
  const d576 = q1(w, "SELECT description d FROM agent_issues WHERE id = 100576").d, d140 = q1(w, "SELECT description d FROM agent_issues WHERE id = 100140").d;
  ok(d576.startsWith("original description") && (d576.match(/REM-A7-UIA-FIXES-1/g) || []).length === 1 && /ITEM 1 RE-CHECK/.test(d576) && /DISCREPANCY/.test(d576) && /P_decode/.test(d576) && /ITEM 7/.test(d576) && /ignorance-audit#5/.test(d576) && /ITEM 2 draft/.test(d576) && /ITEM 4 draft/.test(d576) && /NOT APPLIED/.test(d576), "100576 gets one status paragraph: applied items, re-check and discrepancy, item 7, item 6 pull request, drafts and blocker of items 2 and 4");
  ok(d576.includes(ITEM2_NEW) && d576.includes(ITEM2B_NEW.slice(0, -1)) && d576.includes("willful ignorance"), "the drafts carry the exact replacement sentences of item 2 and the item 4 list");
  ok(d140.startsWith("original description") && /widened, not weakened/.test(d140) && (d140.match(/REM-A7-UIA-FIXES-1/g) || []).length === 1, "100140 gets one pointer paragraph");
  ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE actor = 'rem-a7-f4' AND action LIKE 'REM-A7-UIA-FIXES-1:%'").n === 1, "one decision_log row");
  // replay
  const s1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s1, "a replay changes nothing");
  // rollback
  const w2 = audit();
  const before2 = snap(w2);
  w2.exec(sql);
  w2.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
  ok(q1(w2, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'issue-100140'").p === OLD_PROBE, "Rollback restores the original probe of 100140");
  ok(qa(w2, "SELECT status FROM remediation_contracts WHERE class IN ('issue-100576', 'uia-100576-item6-readme', 'uia-100576-item7-abstract-not-reproduced')").every((r) => r.status === "superseded"), "Rollback supersedes the three contracts of 100576");
  ok(qa(w2, "SELECT description d FROM agent_issues WHERE id IN (100576, 100140)").every((r) => r.d === "original description"), "Rollback trims both descriptions back");
  void before2;
}
{
  // an issue that is no longer open is not re-armed or annotated beyond its description guard
  const w = audit();
  w.exec("UPDATE issue_triage SET close_evidence = 'e' WHERE issue_id = 100140");
  w.exec("UPDATE remediation_contracts SET last_verdict = NULL WHERE class = 'issue-100140'");
  w.exec("UPDATE agent_issues SET status = 'closed' WHERE id = 100140");
  w.exec(sql);
  ok(q1(w, "SELECT verify_probe p FROM remediation_contracts WHERE class = 'issue-100140'").p === OLD_PROBE, "a closed issue 100140 keeps its contract as it was");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
