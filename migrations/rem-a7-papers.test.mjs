// REM-A7-PAPERS-1 offline suite: replays migrations/2026-10-26-rem-a7-papers.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs
// (agent_issues, issue_triage, remediation_contracts, decision_log, the live close-sync triggers and issue_close_evidence_required).
// Proves: the header opts in; the two placeholder contracts (born superseded, VACUOUS-PROBE-V3-1) become active contracts that measure their definition of done
// (issue-100523 a d1-query@living-paper probe, issue-100575 a runner-https probe that the consumer's parser accepts); the control detector is added once; the finding is staged as
// close_evidence without closing anything, and a later close of the issue passes the evidence guard; the d1 probe reads its own expected sentence on a complete living-paper
// fixture and names the failing count when a series record is cut, missing a conclusion, unpublished, unlinked, when a published body is short or a registry identifier is carried;
// the probe text passes the consumer's literal-select rule; a replay changes nothing; Rollback restores the placeholders.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-papers.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-papers.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const consumer = readFileSync(here("../scripts/remediation_consumer.py"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql), "nothing is deleted or dropped, no claude.ai link");
ok(!/\bLIKE\s+'[^']{50,}'/i.test(body), "no LIKE pattern over 50 bytes");

const s0 = engineTest.indexOf("const BASE_DDL = `"), s1 = engineTest.indexOf("END;`;", s0);
ok(s0 > 0 && s1 > s0, "the engine suite carries the live-shaped BASE_DDL");
const BASE_DDL = engineTest.slice(s0 + "const BASE_DDL = `".length, s1 + "END;".length);

const WRITE_KW = (consumer.match(/WRITE_KW = \(([\s\S]*?)\n\)/) || [, ""])[1].match(/"([^"]+)"/g).map((x) => x.slice(1, -1));
ok(WRITE_KW.length >= 10, "read the consumer's write-keyword list", WRITE_KW);

const OLD_PROBE = (id) => "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = " + id + ") AS observed";
const VACUOUS = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close.";
function world(o = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  const issue = (id, title, status = "open") => {
    w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'text', 'qnfo-fleet-dashboard:owner-request', 'critical', ?, 1, 1)").run(id, title, status);
    w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at) VALUES (?, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', '2026-10-01')").run(id);
    w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, module, last_verdict) VALUES (?, ?, 'p', ?, ?, 'd1-query', 'qnfo-fleet-control', 'superseded', 'probe-template-v3-generic', 'superseded:closure-observing-probe-at-birth')")
      .run("issue-" + id, id, VACUOUS, OLD_PROBE(id));
  };
  issue(100523, "OWNER-TASK-op-mvj9cyv5fec0: Implement the smallest fix for gap C-01 (D1 body truncation)", o.status523 ?? "open");
  issue(100575, "OWNER-TASK-op-mvln5gyy89ab: Investigate paper versioning on papers.qnfo.org", o.status575 ?? "open");
  issue(100999, "SOME-OTHER-ISSUE: unrelated");
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
const qa = (w, s, ...p) => w.prepare(s).all(...p);
const contract = (w, c) => q1(w, "SELECT * FROM remediation_contracts WHERE class = ?", c);
const snap = (w) => JSON.stringify([qa(w, "SELECT * FROM agent_issues ORDER BY id"), qa(w, "SELECT * FROM issue_triage ORDER BY issue_id"), qa(w, "SELECT * FROM remediation_contracts ORDER BY class"), qa(w, "SELECT actor, action FROM decision_log ORDER BY id")]);

// The consumer's runner-https parser, re-stated from scripts/remediation_consumer.py parse_https_probe (keys, status range, contains length).
function parseHttps(spec) {
  let p; try { p = JSON.parse(spec); } catch (e) { return "not-json"; }
  if (!p || typeof p !== "object" || Array.isArray(p)) return "not-an-object";
  const allowed = new Set(["url", "status", "contains", "absent", "min_version", "max_ms", "redirect_to"]);
  for (const k of Object.keys(p)) if (!allowed.has(k)) return "unknown-key:" + k;
  if (!/^https:\/\/[a-z0-9.-]+\.qnfo\.org\//.test(String(p.url || ""))) return "url";
  if (!Number.isInteger(p.status) || p.status < 100 || p.status > 599) return "bad-status";
  if (p.contains != null && (typeof p.contains !== "string" || !p.contains || p.contains.length > 200)) return "bad-contains";
  return "ok";
}
ok(/unknown = set\(p\) - \{"url", "status", "contains", "absent", "min_version", "max_ms", "redirect_to"\}/.test(consumer), "the parser restated here still matches the consumer's key set");

// A living-paper fixture: the seven records of the audit's table plus an unrelated published paper.
const SERIES = ["shor-assumptions-audit", "paper-manifesto-honest-computation", "paper-the-qubit-delusion", "paper-beyond-the-qubit", "paper-physics-of-computation", "paper-problem-substrate-mapping", "paper-institutional-reform"];
const FLOOR = { "shor-assumptions-audit": 13001, "paper-manifesto-honest-computation": 23797 };
function mkBody(slug, o = {}) {
  const floor = FLOOR[slug] || 20000;
  const parts = ["# Title " + slug, ""];
  for (let i = 1; i <= (o.sections ?? 8); i++) parts.push("## " + i + ". Section " + i, "", "text ".repeat(40), "");
  let b = parts.join("\n");
  b += "word ".repeat(Math.max(0, Math.ceil((o.len ?? floor + 500) - b.length) / 5));
  if (o.noConclusionLate) return "## Conclusion\n\n" + b.slice(0, o.len ?? floor + 500);
  return b + "\n\n## 9. Conclusion\n\nThe paper ends here.\n";
}
function living(o = {}) {
  const l = new DatabaseSync(":memory:");
  l.exec("CREATE TABLE papers (slug TEXT PRIMARY KEY, status TEXT, body_md TEXT, pdf_path TEXT, r2_path TEXT, doi TEXT, zenodo_doi TEXT, zenodo_url TEXT)");
  for (const s of SERIES) {
    const ov = (o.over || {})[s] || {};
    l.prepare("INSERT INTO papers VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)").run(s, ov.status ?? "published", ov.body ?? mkBody(s), ov.pdf ?? "pdf/" + s + ".pdf", ov.r2 ?? "releases/2026/07/" + s + ".md");
  }
  l.prepare("INSERT INTO papers VALUES ('other-paper', 'published', ?, 'pdf/o.pdf', 'releases/o.md', NULL, NULL, NULL)").run(o.otherBody ?? mkBody("other-paper", { len: 21000 }));
  l.prepare("INSERT INTO papers VALUES ('quarantined-short', 'quarantined', 'tiny', NULL, NULL, '10.5281/zenodo.1', NULL, NULL)").run();
  if (o.extra) l.exec(o.extra);
  return l;
}
const runProbe = (l, probe) => qa(l, probe)[0];

{
  const w = world();
  const before = snap(w);
  w.exec(sql);
  const c3 = contract(w, "issue-100523"), c5 = contract(w, "issue-100575"), ctl = contract(w, "fm-reader-history-navigation-control");
  ok(c3.status === "active" && c3.verify_transport === "d1-query@living-paper" && c3.module === "rem-a7-papers-v1" && c3.last_verdict === null && c3.attempts === 0 && c3.issue_id === 100523, "issue-100523 is an active d1-query@living-paper contract of module rem-a7-papers-v1", c3);
  ok(!c3.action.startsWith("VACUOUS-PROBE-V3-1") && !/status\s+IN\s+\('closed'/.test(c3.verify_probe) && !/agent_issues/.test(c3.verify_probe), "the 100523 probe is not the placeholder and does not read the issue's own status", c3.verify_probe.slice(0, 200));
  ok(c5.status === "active" && c5.verify_transport === "runner-https" && c5.module === "rem-a7-papers-v1" && c5.issue_id === 100575, "issue-100575 is an active runner-https contract", c5);
  ok(parseHttps(c5.verify_probe) === "ok" && /\/versions\/146"/.test(c5.verify_probe) && JSON.parse(c5.verify_probe).contains === "Capture time is not a publication date", "the 100575 probe parses under the consumer's rules and reads the stored snapshot page for the capture-date caption", c5.verify_probe);
  ok(ctl && ctl.status === "active" && ctl.verify_transport === "runner-https" && ctl.issue_id === null && parseHttps(ctl.verify_probe) === "ok" && JSON.parse(ctl.verify_probe).contains === '"archived":true', "the control detector is added: a stable published paper's api/paper-context lists archived snapshots", ctl);
  ok(contract(w, "issue-100999").status === "superseded" && q1(w, "SELECT status s FROM agent_issues WHERE id = 100999").s === "open", "another issue and its contract are untouched");
  for (const id of [100523, 100575]) {
    const t = q1(w, "SELECT * FROM issue_triage WHERE issue_id = ?", id);
    ok(t.triage_state === "triaged" && /rem-a7 F4/.test(t.close_evidence) && q1(w, "SELECT status s FROM agent_issues WHERE id = ?", id).s === "open", "issue " + id + ": the finding is staged as close_evidence, nothing is closed by the file", t);
  }
  const e523 = q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 100523").e;
  ok(/4\.1 and 4\.2/.test(e523) && /13,001/.test(e523) && /NOZ-DOI-1/.test(e523), "the 100523 evidence names the audit sections, the measured lengths and the directive that supersedes DOIs");
  ok(/paper_version_history/.test(q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 100575").e) && /handlePaperContext/.test(q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 100575").e) && /archived_at/.test(q1(w, "SELECT close_evidence e FROM issue_triage WHERE issue_id = 100575").e), "the 100575 evidence names the storage, the cause and the date semantics");
  ok(q1(w, "SELECT COUNT(*) n FROM decision_log WHERE actor = 'rem-a7-f4' AND action LIKE 'REM-A7-PAPERS-1:%'").n === 1, "one decision_log row");
  // the close path: with the evidence staged, the issue can close (the auto-close trigger writes its own row only when the staged one is empty); without it the guard refuses.
  w.exec("UPDATE agent_issues SET status = 'closed', close_channel = 'auto:verified-remediation-trigger' WHERE id = 100523");
  ok(q1(w, "SELECT status s FROM agent_issues WHERE id = 100523").s === "closed", "a later close of 100523 passes issue_close_evidence_required (the contract's last_verdict is empty, not failing)");
  const bare = world();
  let refused = "";
  try { bare.exec("UPDATE agent_issues SET status = 'closed' WHERE id = 100523"); } catch (e) { refused = String(e.message); }
  ok(/close-without-evidence/.test(refused), "without the staged evidence the same close is refused", refused);
  // replay
  const s1 = snap(w);
  w.exec(sql);
  ok(snap(w) === s1, "a replay changes nothing");
  // rollback on a fresh apply
  const w2 = world();
  w2.exec(sql);
  w2.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
  for (const id of [100523, 100575]) {
    const c = contract(w2, "issue-" + id);
    ok(c.status === "superseded" && c.verify_probe === OLD_PROBE(id) && c.verify_transport === "d1-query" && c.action.startsWith("VACUOUS-PROBE-V3-1"), "Rollback restores the placeholder of issue-" + id, c);
    ok(q1(w2, "SELECT close_evidence e FROM issue_triage WHERE issue_id = ?", id).e === null, "Rollback clears the staged evidence of " + id);
  }
  ok(contract(w2, "fm-reader-history-navigation-control").status === "superseded", "Rollback supersedes the control detector");
  void before;

  // the d1 probe, as stored
  const probe = c3.verify_probe;
  const lowp = probe.toLowerCase();
  ok(lowp.startsWith("select") && !WRITE_KW.some((kw) => lowp.includes(kw)) && !probe.replace(/;\s*$/, "").includes(";"), "the stored probe is one literal read-only select (the consumer's write-keyword rule)");
  const good = runProbe(living(), probe);
  ok(good.expected === good.observed && /^series 7 of 7 complete/.test(good.observed), "complete series, no short or registry rows: observed equals expected", good);
  const cutManifesto = runProbe(living({ over: { "paper-manifesto-honest-computation": { body: mkBody("paper-manifesto-honest-computation", { sections: 2, len: 8000 }).slice(0, 8000).replace(/## 9\. Conclusion[\s\S]*/, "") } } }), probe);
  ok(cutManifesto.expected !== cutManifesto.observed && /^series 6 of 7 complete/.test(cutManifesto.observed), "the Manifesto cut at section 2 (8,000 chars, no conclusion) fails the probe", cutManifesto);
  const shortShor = runProbe(living({ over: { "shor-assumptions-audit": { body: mkBody("shor-assumptions-audit", { len: 12000 }) } } }), probe);
  ok(shortShor.expected !== shortShor.observed && /^series 6 of 7 complete/.test(shortShor.observed), "Shor below the recovered 13,001 chars fails", shortShor);
  const noConcl = runProbe(living({ over: { "paper-physics-of-computation": { body: mkBody("paper-physics-of-computation", { noConclusionLate: true, len: 25000 }) } } }), probe);
  ok(noConcl.expected !== noConcl.observed && /^series 6 of 7 complete/.test(noConcl.observed), "a body whose only Conclusion sits in the first half fails (cut before the end)", noConcl);
  const fewHeads = runProbe(living({ over: { "paper-beyond-the-qubit": { body: mkBody("paper-beyond-the-qubit", { sections: 3 }) } } }), probe);
  ok(fewHeads.expected !== fewHeads.observed, "fewer than 6 level-2 headings fails", fewHeads);
  const unpub = runProbe(living({ over: { "paper-institutional-reform": { status: "quarantined" } } }), probe);
  ok(unpub.expected !== unpub.observed && /^series 6 of 7 complete/.test(unpub.observed), "a series record that is no longer published fails", unpub);
  const nolink = runProbe(living({ over: { "paper-the-qubit-delusion": { r2: "" } } }), probe);
  ok(nolink.expected !== nolink.observed, "a series record with no r2_path fails (the D1 row must link its full text)", nolink);
  const shortOther = runProbe(living({ otherBody: "x".repeat(1500) }), probe);
  ok(shortOther.expected !== shortOther.observed && /short or empty published bodies 1/.test(shortOther.observed), "a published body under 2,000 chars anywhere fails", shortOther);
  const reg = runProbe(living({ extra: "UPDATE papers SET doi = '10.5281/zenodo.123' WHERE slug = 'other-paper'" }), probe);
  ok(reg.expected !== reg.observed && /registry identifiers 1/.test(reg.observed), "a registry doi on a published paper fails", reg);
  const regUrl = runProbe(living({ extra: "UPDATE papers SET zenodo_url = 'https://x.example/1' WHERE slug = 'other-paper'" }), probe);
  ok(regUrl.expected !== regUrl.observed && /registry identifiers 1/.test(regUrl.observed), "a zenodo_url on a published paper fails", regUrl);
  const thirdParty = runProbe(living({ extra: "UPDATE papers SET doi = '10.1111/phpr.12228' WHERE slug = 'other-paper'" }), probe);
  ok(thirdParty.expected === thirdParty.observed, "a third-party DOI stays allowed (NOZ-DOI-1 amendment)", thirdParty);
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
