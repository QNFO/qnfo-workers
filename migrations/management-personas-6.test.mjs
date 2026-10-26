// MANAGEMENT-PERSONAS-6 / ROADMAP-ORIGINATE-1 offline suite: applies migrations/2026-10-26-management-personas.sql through -6 on SQLite with the
// shapes of the earlier suites, and runs the new workflow steps the way fleet-exec does. Proves: each active program except QNFO.PERSONAL asks the
// Cloudflare agent for one roadmap item a day; a well-formed answer becomes a proposal and a malformed or control-plane one is rejected; nothing is
// filed until management-personas ROADMAP-1 items are a trusted merge source, then one high issue per proposal is filed with its code-task and
// code-anchor lines first; the managers follow the code task and close the issue with the pull request once merged and verified live; the metric
// and the brief read the ledger; roadmap_originate = off stops the research; a re-apply is a no-op.
// Run: node migrations/management-personas-6.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const suite5 = rd("./management-personas-5.test.mjs");
// reuse suite 5's database preparation (schema of suite 1 plus its additions) verbatim
const prep = suite5.slice(suite5.indexOf("const db = new DatabaseSync"), suite5.indexOf("const run = (s"));
const sqls = ["./2026-10-26-management-personas.sql", "./2026-10-26-management-personas-2.sql", "./2026-10-26-management-personas-3.sql"].map(rd);
const sql4 = rd("./2026-10-26-management-personas-4.sql"), sql5 = rd("./2026-10-26-management-personas-5.sql"), sql6 = rd("./2026-10-26-management-personas-6.sql");
const suite1 = rd("./management-personas.test.mjs");
const schema = suite1.slice(suite1.indexOf("db.exec(`") + 9, suite1.indexOf("`);", suite1.indexOf("db.exec(`")));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
let db;
eval(prep.replace("const db = ", "db = "));
const run = (s, ...a) => db.prepare(s).run(...a);
const q = (s, ...a) => db.prepare(s).all(...a);
const one = (s, ...a) => db.prepare(s).get(...a);
db.exec(sql4); db.exec(sql5);
const before = JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps;
db.exec(sql6);
ok(true, "the six migrations apply");
const def = () => JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps;
const NEW = ["rm-research", "rm-parse", "rm-reject", "rm-file", "rm-filed", "rm-map", "rm-filed-log", "rm-track", "rm-deployed-evidence", "rm-deployed-log", "rm-deployed-contracts", "rm-deployed-close", "rm-deployed", "rm-metric", "rm-brief"];
const names = def().map((s) => s.name);
ok(names.length === before.length + NEW.length && names.slice(-NEW.length).join() === NEW.join(), "fifteen roadmap steps are appended after the earlier ones", names.slice(-16));
db.exec(sql6.slice(0, sql6.lastIndexOf("\nINSERT INTO decision_log")));
ok(def().length === names.length, "a re-apply changes nothing");
ok(!/UPDATE ops_config/i.test(sql6) && !/code_merge_trusted_sources'\s*,/.test(sql6), "the migration does not change the trusted merge sources");
ok(one("SELECT value FROM ops_config WHERE key = 'roadmap_originate'").value === "on" && one("SELECT COUNT(*) AS n FROM metric_registry WHERE metric = 'roadmap_items_deployed_7d'").n === 1, "the switch and the metric are registered");

const progs = ["QNFO.OPS", "QNFO.RSCH", "QNFO.PERSONAL"];
for (const p of progs) run("INSERT OR IGNORE INTO program_charters (program_code, objective, definition_of_done, manager_persona, status) VALUES (?, ?, 'dod', ?, 'active')", p, "aim of " + p, "program-manager:" + p);
run("UPDATE program_charters SET status = 'active' WHERE program_code IN ('QNFO.OPS', 'QNFO.RSCH', 'QNFO.PERSONAL')");
const active = q("SELECT program_code FROM program_charters WHERE status = 'active' AND program_code <> 'QNFO.PERSONAL'").map((r) => r.program_code);
run("INSERT INTO portfolio_allocations (tick, program_code, verdict, risk_score, decision, slots, manager_persona) VALUES ('2026-10-26T09:35Z', 'QNFO.OPS', 'RED', 50, 'steady', 5, 'program-manager:QNFO.OPS')");
run("INSERT INTO persona_briefs (tick, persona_key, level, scope, verdict, decision, summary) VALUES ('2026-10-26T09:35Z', 'portfolio-manager', 'portfolio', 'QNFO', 'RED', 'allocate', 'Brief.')");
const steps = () => def().filter((s) => NEW.includes(s.name));
const tick = () => { for (const s of steps()) { try { db.prepare(s.sql).all(); } catch (e) { ok(false, "step " + s.name + " runs", String(e)); throw e; } } };
tick();
const reqs = q("SELECT * FROM cf_agent_requests WHERE instance LIKE 'roadmap-%' ORDER BY id");
ok(reqs.length === active.length && !reqs.some((r) => /PERSONAL/.test(r.instance)) && reqs.every((r) => /TITLE: <under 80 characters>/.test(r.prompt) && /code-anchor: </.test(r.prompt)), "each active program except QNFO.PERSONAL asks for one roadmap item", reqs.map((r) => r.instance));
tick();
ok(q("SELECT * FROM cf_agent_requests WHERE instance LIKE 'roadmap-%'").length === reqs.length, "a second tick the same day asks nothing new");

const ops = reqs.find((r) => /QNFO\.OPS/.test(r.instance)), rsch = reqs.find((r) => /QNFO\.RSCH/.test(r.instance));
run("UPDATE persona_briefs SET summary = 'Brief.'");
run("UPDATE cf_agent_requests SET status = 'done', result = ? WHERE id = ?", "Here it is.\n**TITLE:** Show weekly paper count on the status page\nWHY: readers see output\ncode-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js\ncode-anchor: `var FLEET_HANDLED_SOURCES = [\"code-loop\", \"issue-loop\"];`\nEDIT: add a counter", ops.id);
run("UPDATE cf_agent_requests SET status = 'done', result = ? WHERE id = ?", "TITLE: Faster planner\nWHY: x\ncode-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js\ncode-anchor: function evaluateMetricTriggers(env) {\nEDIT: y", rsch.id);
tick();
const props = q("SELECT * FROM roadmap_proposals ORDER BY id");
const pOps = props.find((p) => p.program_code === "QNFO.OPS"), pR = props.find((p) => p.program_code === "QNFO.RSCH");
ok(pOps && pOps.status === "proposed" && pOps.title === "Show weekly paper count on the status page" && pOps.path === "qnfo-fleet-dashboard/worker.js" && pOps.anchor_line === 'code-anchor: var FLEET_HANDLED_SOURCES = ["code-loop", "issue-loop"];', "a well-formed answer becomes a proposal with its title, path and anchor", pOps);
ok(pR && pR.status === "rejected" && /qnfo-fleet-control/.test(pR.outcome), "a control-plane path is rejected with the reason", pR);
ok(!/code-task:/.test(pOps.rationale), "the stored rationale carries no second code-task line");
ok(one("SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE 'ROADMAP-1:%'").n === 0, "nothing is filed while ROADMAP-1 items are not a trusted merge source");
ok(/1 proposed \(waiting for merge admission of management-personas ROADMAP-1 items in code_merge_trusted_sources\), 0 filed, 0 in build, 0 deployed in 7 days\./.test(one("SELECT summary FROM persona_briefs WHERE persona_key = 'portfolio-manager'").summary), "the brief says the proposals wait for admission", one("SELECT summary FROM persona_briefs WHERE persona_key = 'portfolio-manager'").summary);

run("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('code_merge_trusted_sources', 'qnfo-fleet-control|METRIC-TRIGGER-')");
const sql7 = rd("./2026-10-26-management-personas-7.sql");
db.exec(sql7); db.exec(sql7.slice(0, sql7.indexOf("INSERT INTO decision_log")));
ok(one("SELECT value FROM ops_config WHERE key = 'code_merge_trusted_sources'").value === "qnfo-fleet-control|METRIC-TRIGGER-,management-personas|ROADMAP-1:", "migration -7 admits ROADMAP-1 items once, keeping the other sources");
run("UPDATE persona_briefs SET summary = 'Brief.'");
tick();
const iss = q("SELECT * FROM agent_issues WHERE title LIKE 'ROADMAP-1:%'");
ok(iss.length === 1 && iss[0].title === "ROADMAP-1: QNFO.OPS #" + pOps.id + ": Show weekly paper count on the status page" && iss[0].priority === "high" && iss[0].source === "management-personas" && iss[0].category === "feature", "once admitted, the proposal is filed as one high feature issue", iss);
const lines = iss[0].description.split("\n");
ok(lines[0] === "code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js" && lines[1] === pOps.anchor_line && (iss[0].description.match(/code-task:/g) || []).length === 1, "the issue starts with its code-task and code-anchor lines", lines.slice(0, 2));
ok(one("SELECT status FROM roadmap_proposals WHERE id = ?", pOps.id).status === "filed" && one("SELECT COUNT(*) AS n FROM persona_actions WHERE kind = 'roadmap-originate'").n === 1 && one("SELECT program_code FROM issue_project_map WHERE issue_id = ?", iss[0].id).program_code === "QNFO.OPS", "the proposal is marked filed, logged and mapped to its program");
tick();
ok(one("SELECT COUNT(*) AS n FROM agent_issues WHERE title LIKE 'ROADMAP-1:%'").n === 1 && one("SELECT COUNT(*) AS n FROM persona_actions WHERE kind = 'roadmap-originate'").n === 1, "a second tick files and logs nothing twice");

run("INSERT INTO code_tasks (id, repo, path, goal, status, pr_url, updated_at) VALUES (?, 'qnfo-workers', 'qnfo-fleet-dashboard/worker.js', 'g', 'running', NULL, '2026-10-26T10:00Z')", "ct_im" + iss[0].id);
tick();
ok(one("SELECT status, task_id FROM roadmap_proposals WHERE id = ?", pOps.id).status === "building" && one("SELECT task_id FROM roadmap_proposals WHERE id = ?", pOps.id).task_id === "ct_im" + iss[0].id, "the managers follow the code task");
run("UPDATE code_tasks SET status = 'merged', merge_state = 'merged', pr_url = 'https://github.com/QNFO/qnfo-workers/pull/9999' WHERE id = ?", "ct_im" + iss[0].id);
tick();
ok(one("SELECT status FROM agent_issues WHERE id = ?", iss[0].id).status === "open", "a merge not yet verified live closes nothing");
run("INSERT INTO remediation_contracts (class, issue_id, status) VALUES (?, ?, 'active')", "issue-" + iss[0].id, iss[0].id);
run("UPDATE code_tasks SET merge_state = 'verified' WHERE id = ?", "ct_im" + iss[0].id);
run("UPDATE persona_briefs SET summary = 'Brief.'");
tick();
ok(one("SELECT status FROM agent_issues WHERE id = ?", iss[0].id).status === "closed" && /pull\/9999/.test(one("SELECT close_evidence FROM issue_triage WHERE issue_id = ?", iss[0].id).close_evidence), "once verified live the issue closes with the pull request as evidence");
const p2 = one("SELECT * FROM roadmap_proposals WHERE id = ?", pOps.id);
ok(p2.status === "deployed" && p2.pr_url === "https://github.com/QNFO/qnfo-workers/pull/9999" && p2.deployed_at, "the proposal records the deploy", p2);
ok(one("SELECT status FROM remediation_contracts WHERE class = ?", "issue-" + iss[0].id).status === "superseded" && one("SELECT COUNT(*) AS n FROM persona_actions WHERE kind = 'roadmap-deployed'").n === 1, "the contract is superseded and the deploy logged once");
ok(one("SELECT last_value FROM metric_registry WHERE metric = 'roadmap_items_deployed_7d'").last_value === "1", "the metric counts the deployed item");
ok(/0 proposed, 0 filed, 0 in build, 1 deployed in 7 days \(latest: Show weekly paper count on the status page\)\./.test(one("SELECT summary FROM persona_briefs WHERE persona_key = 'portfolio-manager'").summary), "the brief states the deployed item", one("SELECT summary FROM persona_briefs WHERE persona_key = 'portfolio-manager'").summary);
ok(q("SELECT * FROM v_roadmap_originated").length === 2, "v_roadmap_originated lists every proposal");

run("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('roadmap_originate', 'off')");
run("DELETE FROM cf_agent_requests");
tick();
ok(one("SELECT COUNT(*) AS n FROM cf_agent_requests").n === 0, "roadmap_originate = off stops the research");
ok(/^-- APPLY-BY: ci$/m.test(sql6) && /^-- DB: qnfo-audit$/m.test(sql6) && /^-- BACKUP: bak_20261026_mp6_workflow$/m.test(sql6) && /^-- Rollback: /m.test(sql6), "the header opts in to the runner");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
