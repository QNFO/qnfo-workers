// REM-A7-REACH-2 offline suite: replays migrations/2026-10-26-rem-a7-reach-2.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback, nothing deleted or dropped); the born-superseded contract of EMAIL-TIER2-GATE-1 becomes an
// active hourly code-read contract whose probe is valid JSON, fails on the real qnfo-email/worker.js today and passes once the owner switch text exists; a contract that is
// already active, another issue's contract and a card that is not the one closed at birth are not touched; the Search Console card closed at birth by default adoption is open
// again; one decision_log row; a replay changes nothing; the Rollback line restores both.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-reach-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-reach-2.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const emailSrc = readFileSync(here("../qnfo-email/worker.js"), "utf8");
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
const BORN = (id) => "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = " + id + ") AS observed";
const DEFAULT_ADOPTED = "DEFAULT-ADOPTED-1: closed at birth on its stated default (owner directive 2026-10-12). Reopen with status=open.";
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  const issue = (id, title) => w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, 'text', 'claude-session:rem-a7-f1', 'high', 'open', 1, 1)").run(id, title);
  issue(1000469, "EMAIL-TIER2-GATE-1: tier-2 auto-send answered a recipient's complaint");
  issue(1000470, "SOME-OTHER-ISSUE: unrelated");
  const c = w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict, module, attempts) VALUES (?, ?, 'p', 'a', ?, 'd1-query', 'qnfo-ops', 'superseded', 'superseded:closure-observing-probe-at-birth', 'probe-template-v3-generic', 0)");
  c.run("issue-1000469", 1000469, BORN(1000469));
  c.run("issue-1000470", 1000470, BORN(1000470));
  const h = w.prepare("INSERT INTO human_actions (slug, title, why, default_in_effect, action, sev, status, source, resolved_at, resolution) VALUES (?, 't', 'IDENTITY-BOUND: x', 'nothing blocked', 'steps', 'normal', ?, ?, ?, ?)");
  h.run("gsc-service-account-user", "resolved", "session:rem-a7-f1", "2026-10-26 18:30:35", DEFAULT_ADOPTED);
  h.run("some-other-card", "resolved", "session:other", "2026-10-26 18:30:35", DEFAULT_ADOPTED);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);
function codeProbe(spec, files) {
  const p = JSON.parse(spec);
  for (const rel of p.paths) {
    const text = files[rel];
    if (text === undefined) return "missing:" + rel;
    if (p.contains && !text.includes(p.contains)) return "missing-marker:" + rel;
    if (p.absent && text.includes(p.absent)) return "present-marker:" + rel;
  }
  return "ok";
}

const w = world();
w.exec(sql);
const c1 = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000469'");
ok(c1.status === "active" && c1.verify_transport === "code-read" && c1.module === "rem-a7-reach-v1" && c1.attempts === 0 && c1.last_verdict === null && c1.expected_cadence_h === 1, "the EMAIL-TIER2-GATE-1 contract is an active hourly code-read contract", c1);
let spec = null;
try { spec = JSON.parse(c1.verify_probe); } catch (e) { spec = null; }
ok(spec && spec.paths.length === 1 && spec.paths[0] === "qnfo-email/worker.js" && spec.contains === "email_tier2_autosend" && Object.keys(spec).every((k) => ["paths", "contains", "absent"].includes(k)), "the probe is valid JSON in the shape the consumer accepts", c1.verify_probe);
ok(codeProbe(c1.verify_probe, { "qnfo-email/worker.js": emailSrc }) === "missing-marker:qnfo-email/worker.js", "it fails on the real qnfo-email/worker.js today (the owner switch does not exist yet)");
ok(codeProbe(c1.verify_probe, { "qnfo-email/worker.js": emailSrc + "\nvar SW = 'email_tier2_autosend';" }) === "ok", "and passes once the worker carries the switch");
const c2 = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000470'");
ok(c2.status === "superseded" && c2.verify_probe === BORN(1000470), "another issue's contract is not touched");
ok(q1(w, "SELECT status s FROM agent_issues WHERE id = 1000469").s === "open", "the issue stays open");
const card = q1(w, "SELECT * FROM human_actions WHERE slug = 'gsc-service-account-user'");
ok(card.status === "open" && card.resolved_at === null && card.resolution === null && /IDENTITY-BOUND/.test(card.why) && card.default_in_effect === "nothing blocked", "the Search Console card closed at birth by default adoption is open again, text unchanged", card);
ok(q1(w, "SELECT status s FROM human_actions WHERE slug = 'some-other-card'").s === "resolved", "another card is not touched");
ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE actor = 'rem-a7-f1:reach-closeouts-2'").get().n === 1, "one decision_log row");

const snap = () => JSON.stringify([w.prepare("SELECT * FROM agent_issues ORDER BY id").all(), w.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), w.prepare("SELECT * FROM human_actions ORDER BY id").all(), w.prepare("SELECT COUNT(*) n FROM decision_log").get()]);
const s1b = snap();
w.exec(sql);
ok(snap() === s1b, "a replay changes nothing");
// a contract that already ran (attempts > 0, active) is not reset by a replay
w.prepare("UPDATE remediation_contracts SET attempts = 5, last_verdict = 'fail' WHERE class = 'issue-1000469'").run();
w.exec(sql);
ok(q1(w, "SELECT attempts a, last_verdict v FROM remediation_contracts WHERE class = 'issue-1000469'").a === 5, "a replay does not reset a contract the consumer has already run");

w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
const rb = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000469'");
ok(rb.status === "superseded" && rb.verify_transport === "d1-query" && rb.verify_probe === BORN(1000469) && rb.module === "probe-template-v3-generic", "Rollback restores the born-superseded contract", rb);
ok(q1(w, "SELECT status s FROM human_actions WHERE slug = 'gsc-service-account-user'").s === "resolved", "Rollback re-resolves the card");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
