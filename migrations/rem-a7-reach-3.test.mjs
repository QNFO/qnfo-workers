// REM-A7-REACH-3 offline suite: replays migrations/2026-10-26-rem-a7-reach-3.sql on node:sqlite over the live-shaped base schema of qnfo-fleet-control/breach-doctor.test.mjs.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback, nothing deleted or dropped); the Search Console owner card keeps its IDENTITY-BOUND line and gets the two
// steps in order with Google's own project number and the page that shows the service account address, and asks for no token or key; the code-task line of issues 2924 and 100190 becomes
// code-task-done (no loop reads it) and a dated note is appended once to each; an issue that is closed, a card that is not the one, and a line already retired are not touched; one decision_log
// row; a replay changes nothing; the Rollback line restores the code-task line.
// Output MUST contain "0 failed" on success.   node migrations/rem-a7-reach-3.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const sql = readFileSync(here("./2026-10-26-rem-a7-reach-3.sql"), "utf8");
const first = readFileSync(here("./2026-10-26-rem-a7-reach.sql"), "utf8");
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

const LINE = "code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js";
// the card text exactly as the first migration wrote it (the sentence this file replaces must occur in it)
const oldAction = (/'(In Search Console \(the qnfo\.org property\)[\s\S]*?)',\s*\n\s*'https:\/\/search\.google\.com/.exec(first) || [])[1];
ok(oldAction && oldAction.indexOf("the entry that ends in iam.gserviceaccount.com") > 0, "the first migration's card text carries the sentence this file guards on");
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(BASE_DDL);
  const issue = (id, title, desc, status) => w.prepare("INSERT INTO agent_issues (id, title, description, source, priority, status, created_at, updated_at) VALUES (?, ?, ?, 'x', 'medium', ?, 1, 1)").run(id, title, desc, status || "open");
  issue(2924, "INTEG-GSC-1: Search Console + Bing Webmaster ingestion", "gsc text\n" + LINE);
  issue(100190, "SOCIAL-YIELD-ATTENTION-2: the attention verdict holds bluesky at share 0", "yield text\n" + LINE + "\ncode-anchor: var AT_SHARE = {};");
  issue(1000999, "OTHER: unrelated", "other text\n" + LINE);
  issue(1000998, "CLOSED-ONE: a closed issue with the line", "closed text\n" + LINE, "closed");
  w.prepare("INSERT INTO human_actions (slug, title, why, default_in_effect, action, sev, status, source) VALUES ('gsc-service-account-user', 't', 'IDENTITY-BOUND: your own Google account', 'nothing blocked', ?, 'normal', 'open', 'session:rem-a7-f1')").run(oldAction || "x");
  w.prepare("INSERT INTO human_actions (slug, title, why, default_in_effect, action, sev, status, source) VALUES ('other-card', 't', 'w', 'd', 'the entry that ends in iam.gserviceaccount.com', 'normal', 'open', 'x')").run();
  return w;
}
const q1 = (w, s, ...p) => w.prepare(s).get(...p);

const w = world();
w.exec(sql);
const card = q1(w, "SELECT * FROM human_actions WHERE slug = 'gsc-service-account-user'");
ok(/IDENTITY-BOUND:/.test(card.why) && card.status === "open" && card.default_in_effect === "nothing blocked", "the card keeps its IDENTITY-BOUND line, stays open and keeps its default", card);
ok(card.action.indexOf("Step 1") >= 0 && card.action.indexOf("Step 1") < card.action.indexOf("Step 2") && /project 254457120993/.test(card.action) && /Google Search Console API/.test(card.action) && /sa_email at https:\/\/fleet\.qnfo\.org\/api\/ga4/.test(card.action), "two steps in order, Google's project number, and where the service account address is shown", card.action.slice(0, 300));
ok(!/the entry that ends in iam\.gserviceaccount\.com/.test(card.action) && /reach_signals WHERE source = 'gsc'/.test(card.action) && /Bing Webmaster is a separate, later step/.test(card.action), "the old sentence is gone and the closing condition and the Bing note stay");
ok(!/\b(token|password|secret value|private key)\b/i.test(card.action) && !/claude\.ai|anthropic\.com/i.test(card.action) && !/@[a-z0-9-]+\.iam\.gserviceaccount\.com/i.test(card.action), "the card asks for no token or key and carries no secret or address");
ok(q1(w, "SELECT action a FROM human_actions WHERE slug = 'other-card'").a === "the entry that ends in iam.gserviceaccount.com", "another card is not touched");
for (const id of [2924, 100190]) {
  const d = q1(w, "SELECT description d FROM agent_issues WHERE id = ?", id).d;
  ok(d.indexOf(LINE) < 0 && /code-task-done \(qnfo-fleet-dashboard 1\.72\.0, PR 4830\): repo=qnfo-workers path=qnfo-fleet-dashboard\/worker\.js/.test(d) && (d.match(/REM-A7-F1 2026-10-26 19:47Z/g) || []).length === 1, "issue " + id + ": the code-task line is retired and one dated note is appended", d.slice(0, 200));
}
ok(/Google Search Console API has not been used in project 254457120993/.test(q1(w, "SELECT description d FROM agent_issues WHERE id = 2924").d) && /02:00Z/.test(q1(w, "SELECT description d FROM agent_issues WHERE id = 100190").d), "each note says what was measured");
ok(q1(w, "SELECT description d FROM agent_issues WHERE id = 1000999").d.indexOf(LINE) > 0 && q1(w, "SELECT description d FROM agent_issues WHERE id = 1000998").d.indexOf(LINE) > 0, "another issue and a closed issue keep the line");
ok(w.prepare("SELECT COUNT(*) n FROM decision_log WHERE actor = 'rem-a7-f1:gsc-live-read'").get().n === 1, "one decision_log row");

const snap = () => JSON.stringify([w.prepare("SELECT * FROM agent_issues ORDER BY id").all(), w.prepare("SELECT * FROM human_actions ORDER BY id").all(), w.prepare("SELECT COUNT(*) n FROM decision_log").get()]);
const s1b = snap();
w.exec(sql);
ok(snap() === s1b, "a replay changes nothing");

w.exec(sql.split("\n").find((l) => l.startsWith("-- Rollback: ")).slice("-- Rollback: ".length));
ok(q1(w, "SELECT description d FROM agent_issues WHERE id = 2924").d.indexOf(LINE) > 0 && q1(w, "SELECT description d FROM agent_issues WHERE id = 100190").d.indexOf(LINE) > 0, "Rollback restores the code-task line of both issues");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
