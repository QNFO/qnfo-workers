// REM-A7-REACH-1 offline suite: replays migrations/2026-10-26-rem-a7-reach.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback, nothing deleted or dropped); the born-superseded contract of issue 1000179 becomes an active
// code-read contract whose probe text is valid JSON, passes against the real qnfo-fleet-dashboard/worker.js of this checkout and fails against the old bare 405 body; the findings
// are appended once to issues 2373 and 2924; EMAIL-TIER2-GATE-1 is filed once with a code probe that fails on the real qnfo-email/worker.js today and a code-anchor that occurs
// exactly once there; the IDENTITY-BOUND card gsc-service-account-user is filed once; the 2924 contract keeps its probe and loses the false "vacuous" text; one decision_log row;
// a replay changes nothing; the Rollback line restores the contract and dismisses the card.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-reach.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-reach.sql"), "utf8");
const engineTest = readFileSync(here("../qnfo-fleet-control/breach-doctor.test.mjs"), "utf8");
const dashSrc = readFileSync(here("../qnfo-fleet-dashboard/worker.js"), "utf8");
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

const BORN = "SELECT 'closed' AS expected, (SELECT CASE WHEN status IN ('closed', 'resolved') THEN 'closed' ELSE NULL END FROM agent_issues WHERE id = 1000179) AS observed";
const GSC_PROBE = "SELECT '1' AS expected, CASE WHEN (SELECT COUNT(*) FROM reach_signals WHERE source='gsc')>=1 THEN '1' ELSE '0: no gsc rows in reach_signals' END AS observed";
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  const issue = (id, title, desc) => w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, ?, 'x', 'medium', 'open', 1, 1)").run(id, title, desc);
  issue(1000179, "DASH-API-405-OPAQUE-1: GET /api/cmd answers 405 with no path", "defect text");
  issue(2373, "EMAIL-VOICE-DRAFTER-1: qnfo-email drafts and sends replies as Rowan in his voice, tiered by commitment", "spec text");
  issue(2924, "INTEG-GSC-1: Search Console + Bing Webmaster ingestion", "gsc text");
  const c = w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict, module, attempts) VALUES (?, ?, 'p', ?, ?, 'd1-query', 'qnfo-ops', ?, ?, ?, ?)");
  c.run("issue-1000179", 1000179, "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open", BORN, "superseded", "superseded:closure-observing-probe-at-birth", "probe-template-v3-generic", 0);
  c.run("issue-2924", 2924, "VACUOUS-PROBE-V3-1: no verdict while the issue is open (nothing here measures its defect)", GSC_PROBE, "active", "fail", "probe-template-v3-generic", 368);
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);

// the consumer's code-read judge, in JS: every path must exist, contain the text and not contain the absent text
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
const c1 = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000179'");
ok(c1.status === "active" && c1.verify_transport === "code-read" && c1.module === "rem-a7-reach-v1" && c1.attempts === 0 && c1.last_verdict === null && c1.expected_cadence_h === 1, "issue 1000179: the born-superseded contract is an active hourly code-read contract", c1);
let spec = null;
try { spec = JSON.parse(c1.verify_probe); } catch (e) { spec = null; }
ok(spec && Array.isArray(spec.paths) && spec.paths.length === 1 && spec.paths[0] === "qnfo-fleet-dashboard/worker.js" && typeof spec.contains === "string" && spec.contains.length > 0 && spec.contains.length <= 200 && Object.keys(spec).every((k) => ["paths", "contains", "absent"].includes(k)), "the probe is valid JSON in the shape the consumer accepts", c1.verify_probe);
ok(codeProbe(c1.verify_probe, { "qnfo-fleet-dashboard/worker.js": dashSrc }) === "ok", "the probe passes against the real qnfo-fleet-dashboard/worker.js (the self-describing 405 is on this checkout)");
ok(dashSrc.split(spec.contains).length - 1 === 1, "the probe text occurs exactly once in worker.js (the 405 site of cmdRoutes)");
ok(codeProbe(c1.verify_probe, { "qnfo-fleet-dashboard/worker.js": dashSrc.split(spec.contains).join('error: "method"') }) === "missing-marker:qnfo-fleet-dashboard/worker.js", "the same probe fails when the 405 site is the old bare body (it would catch a regression)");
ok(!/\b(update|insert|delete|drop)\s/i.test(c1.verify_probe), "the probe text carries no write keyword");

const i2373 = q1(w, "SELECT description FROM agent_issues WHERE id = 2373").description, i2924 = q1(w, "SELECT description FROM agent_issues WHERE id = 2924").description;
ok(i2373.startsWith("spec text") && (i2373.match(/REM-A7-F1 2026-10-26/g) || []).length === 1 && /email_reply_queue 75/.test(i2373) && /identity-bound/i.test(i2373), "the finding is appended once to issue 2373 and says sending in the owner's name is identity-bound");
ok(i2924.startsWith("gsc text") && (i2924.match(/REM-A7-F1 2026-10-26/g) || []).length === 1 && /gsc-service-account-user/.test(i2924) && /ct_im2924/.test(i2924), "the finding is appended once to issue 2924 and names the card and the failed code task");

const ni = w.prepare("SELECT * FROM agent_issues WHERE title LIKE 'EMAIL-TIER2-GATE-1:%'").all();
ok(ni.length === 1 && ni[0].status === "open" && ni[0].source === "claude-session:rem-a7-f1" && ni[0].priority === "high", "EMAIL-TIER2-GATE-1 is filed once, open, from a trusted session source", ni.length);
const d = ni[0].description;
const probeLine = (/\ncode-probe: (\{.*\})\n/.exec(d) || [])[1] || "";
ok(codeProbe(probeLine, { "qnfo-email/worker.js": emailSrc }) === "missing-marker:qnfo-email/worker.js", "its code probe fails on the real qnfo-email/worker.js today (the switch does not exist yet) and passes once the text exists");
ok(codeProbe(probeLine, { "qnfo-email/worker.js": emailSrc + "\n// email_tier2_autosend" }) === "ok", "and passes once the worker carries the switch");
const anchor = (/\ncode-anchor: (.*)$/.exec(d) || [])[1] || "";
ok(anchor.length > 20 && emailSrc.split(anchor).length - 1 === 1, "its code-anchor occurs exactly once in qnfo-email/worker.js");
ok(/\ncode-task: repo=qnfo-workers path=qnfo-email\/worker.js\n/.test(d) && !/\\n/.test(d), "it carries the code-task line and real newlines");
ok(/email_reply_queue 75/.test(d) && /76/.test(d) && /identity-bound|IC-GATE-001/i.test(d) && /Nothing is sent or enabled by filing this/.test(d), "it states the evidence, that the send path is identity-bound, and that nothing is sent or enabled");

const card = w.prepare("SELECT * FROM human_actions WHERE slug = 'gsc-service-account-user'").all();
ok(card.length === 1 && card[0].status === "open" && /IDENTITY-BOUND:/.test(card[0].why) && card[0].source === "session:rem-a7-f1" && /Search Console API/.test(card[0].action) && !/claude\.ai|anthropic\.com/i.test(JSON.stringify(card[0])), "the owner card is filed once with an IDENTITY-BOUND line and the exact steps");
ok(!/\b(token|password|secret value|private key)\b/i.test(card[0].action) && !/client_secret|BEGIN PRIVATE/.test(JSON.stringify(card[0])), "the card asks for no token or key and carries no secret");

const c2 = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-2924'");
ok(c2.verify_probe === GSC_PROBE && c2.status === "active" && c2.attempts === 368 && !/^VACUOUS-PROBE-V3-1/.test(c2.action) && /card gsc-service-account-user/.test(c2.action), "the 2924 contract keeps its measuring probe and attempt history, and its action text no longer says vacuous");
const dl = w.prepare("SELECT * FROM decision_log").all();
ok(dl.length === 1 && dl[0].actor === "rem-a7-f1:reach-closeouts" && /1000179/.test(dl[0].action) && /2373/.test(dl[0].action) && /2924/.test(dl[0].action), "one decision_log row names the three issues");
ok(q1(w, "SELECT status s FROM agent_issues WHERE id = 1000179").s === "open" && q1(w, "SELECT status s FROM agent_issues WHERE id = 2373").s === "open" && q1(w, "SELECT status s FROM agent_issues WHERE id = 2924").s === "open", "no issue is closed by the file (1000179 closes through its contract when the consumer reads it)");

const snap = () => JSON.stringify([w.prepare("SELECT * FROM agent_issues ORDER BY id").all(), w.prepare("SELECT * FROM remediation_contracts ORDER BY class").all(), w.prepare("SELECT * FROM human_actions ORDER BY id").all(), w.prepare("SELECT COUNT(*) n FROM decision_log").get()]);
const s1b = snap();
w.exec(sql);
ok(snap() === s1b, "a replay changes nothing");

w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length).split("; ").join(";\n"));
const rb = q1(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000179'");
ok(rb.status === "superseded" && rb.verify_transport === "d1-query" && rb.verify_probe === BORN && rb.module === "probe-template-v3-generic", "Rollback restores the born-superseded contract", rb);
ok(q1(w, "SELECT status s FROM human_actions WHERE slug = 'gsc-service-account-user'").s === "dismissed", "Rollback dismisses the card");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
