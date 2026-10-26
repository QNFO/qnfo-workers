// GITHUB-STUCK-RUNS-1 evidence offline suite: migrations/2026-10-26-stuck-runs-evidence.sql records GitHub's refusal on issue 1000275, gives the issue a probe that
// can pass, and files the IDENTITY-BOUND owner card. Proves:
//  * the evidence is appended once (a second apply changes nothing) and the old text is saved; a closed issue is left alone;
//  * the contract is repaired only while it is the superseded probe-unusable one (an active or already-repaired contract is not overwritten);
//  * the probe is valid JSON, hits the dated queued-run filter and expects total_count 0, and its url survives a URL parse;
//  * the owner card carries the IDENTITY-BOUND line, a default in effect, both run filters and all six run ids, and is filed once;
//  * the decision is logged once; the Rollback line restores the description and the contract and dismisses the card;
//  * the file adds no trigger and runs no DELETE or DROP.
// Run: node --no-warnings migrations/stuck-runs-evidence.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-stuck-runs-evidence.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];
const OLD_PROBE = '{"url": "https://api.github.com/repos/QNFO/qnfo-workers/actions/runs?status=queued&per_page=1", "status": 200, "contains": "\\"total_count\\":0"}';
const ORIG_DESC = "GITHUB-STUCK-RUNS-1: six workflow runs are wedged inside GitHub. Doer: the fleet.\n\nruntime-probe: " + OLD_PROBE;

function build({ status = "open", cstatus = "superseded", verdict = "superseded:probe-unusable (no machine-executable probe; the issue stays open and needs a real one)", probe = OLD_PROBE } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, status TEXT, description TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT, verify_transport TEXT, status TEXT, last_verdict TEXT);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT, updated_at TEXT, resolved_at TEXT, resolution TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
  db.prepare("INSERT INTO agent_issues (id, status, description) VALUES (1000275, ?, ?)").run(status, ORIG_DESC);
  db.prepare("INSERT INTO remediation_contracts (class, verify_probe, verify_transport, status, last_verdict) VALUES ('issue-1000275', ?, 'runner-https', ?, ?)").run(probe, cstatus, verdict);
  return db;
}
const q = (db, s, ...a) => db.prepare(s).get(...a);

// 1. fresh apply
let db = build();
db.exec(sql);
let issue = q(db, "SELECT * FROM agent_issues WHERE id = 1000275");
ok(issue.description.startsWith(ORIG_DESC) && /EVIDENCE 2026-10-26 \(DELETE-STUCK-RUNS-1\/-2/.test(issue.description) && /HTTP 403|answered 403 "Could not delete the workflow run"/.test(issue.description) && /answered 409 "Cannot cancel a workflow run that has not been queued yet\."/.test(issue.description), "the evidence is appended after the original text with both refusals quoted", issue.description.slice(-300));
ok(["37655533507", "37642398490", "37642398493", "37642398499", "37642398494", "39698201166"].every((id) => issue.description.includes(id)), "all six run ids are named on the issue");
ok(q(db, "SELECT COUNT(*) n FROM bak_20261026_stuck_runs_issue").n === 1 && q(db, "SELECT description FROM bak_20261026_stuck_runs_issue").description === ORIG_DESC && q(db, "SELECT verify_probe FROM bak_20261026_stuck_runs_contract").verify_probe === OLD_PROBE, "the old issue text and contract are saved before the change");
const c = q(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000275'");
let spec; try { spec = JSON.parse(c.verify_probe); } catch (e) { spec = null; }
ok(spec && c.status === "active" && c.verify_transport === "runner-https" && c.last_verdict === null, "the contract is active, runner-https, with no stale verdict", c);
const u = new URL(spec.url);
ok(u.hostname === "api.github.com" && u.pathname === "/repos/QNFO/qnfo-workers/actions/runs" && u.searchParams.get("status") === "queued" && u.searchParams.get("created") === "<2026-10-20" && spec.status === 200 && spec.contains === '"total_count":0', "the probe counts queued runs created before 2026-10-20 and expects total_count 0", spec);
ok(spec.url !== JSON.parse(OLD_PROBE).url, "it no longer asks for zero queued runs in the whole repository (which any live queued run breaks)");
ok(issue.description.includes("runtime-probe: " + c.verify_probe), "the issue text carries the same runtime-probe line the contract holds");
const card = q(db, "SELECT * FROM human_actions WHERE slug = 'github-wedged-runs-six'");
ok(card && card.status === "open" && card.sev === "low" && /^IDENTITY-BOUND:/m.test(card.why) && card.default_in_effect && card.default_in_effect.length > 20, "the card is open, low, carries an IDENTITY-BOUND line and a default in effect", card && card.why.slice(0, 80));
ok(["37655533507", "37642398490", "37642398493", "37642398499", "37642398494", "39698201166"].every((id) => card.action.includes(id)) && card.action.includes("status=queued&created=%3C2026-10-20") && card.action.includes("status=in_progress&created=%3C2026-10-24"), "the card names every run and both closing filters");
ok(!/claude\.ai|anthropic\.com/i.test(card.title + card.why + card.action + card.url), "the card routes the owner to GitHub only (no claude.ai or anthropic.com link)");
ok(q(db, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'GITHUB-STUCK-RUNS-1: records the refusal evidence') = 1").n === 1, "one decision is logged");
ok(!/\bCREATE\s+TRIGGER\b/i.test(sql) && !/^\s*(DELETE|DROP)\b/im.test(sql.replace(/^--.*$/gm, "")), "the file adds no trigger and runs no DELETE or DROP");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "the opt-in headers are present");

// 2. second apply changes nothing
const snap = () => JSON.stringify([db.prepare("SELECT * FROM agent_issues").all(), db.prepare("SELECT * FROM remediation_contracts").all(), db.prepare("SELECT slug, status, why FROM human_actions").all(), db.prepare("SELECT COUNT(*) n FROM decision_log").get(), db.prepare("SELECT * FROM bak_20261026_stuck_runs_issue").all()]);
const before = snap();
db.exec(sql);
ok(snap() === before, "a second apply changes no row (the evidence is not appended twice, the backup is not overwritten)");

// 3. a closed issue is not touched; an already-active or other contract is not overwritten
db = build({ status: "closed" });
db.exec(sql);
ok(q(db, "SELECT description FROM agent_issues WHERE id = 1000275").description === ORIG_DESC, "a closed issue keeps its text");
db = build({ cstatus: "active", verdict: null, probe: '{"url": "https://example.test/own-probe", "status": 200}' });
db.exec(sql);
const c2 = q(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000275'");
ok(c2.verify_probe === '{"url": "https://example.test/own-probe", "status": 200}' && c2.status === "active", "a contract that already has its own active probe is not overwritten", c2);
db = build({ verdict: "superseded:closure-superseded (ISSUE-HYGIENE-1)" });
db.exec(sql);
ok(q(db, "SELECT verify_probe FROM remediation_contracts").verify_probe === OLD_PROBE, "a contract superseded for another reason is not repaired");

// 4. rollback
db = build();
db.exec(sql);
db.exec(rollback);
ok(q(db, "SELECT description FROM agent_issues WHERE id = 1000275").description === ORIG_DESC, "the Rollback line restores the issue text");
const rc = q(db, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000275'");
ok(rc.verify_probe === OLD_PROBE && rc.status === "superseded" && /probe-unusable/.test(rc.last_verdict), "the Rollback line restores the contract", rc);
ok(q(db, "SELECT status FROM human_actions WHERE slug = 'github-wedged-runs-six'").status === "dismissed", "the Rollback line dismisses the card");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
