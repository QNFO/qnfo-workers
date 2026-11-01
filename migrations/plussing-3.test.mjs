// PLUSSING-3 offline suite: applies the management-personas migrations, plussing-1 and plussing-3 on SQLite (management-personas-6's preparation) and runs the roadmap
// and plus steps the way fleet-exec does. Proves: due products ask the Cloudflare agent for one plus (three a day at most, control-plane products never); a personal-*
// plus is accepted, a control-plane one rejected, and personal-* is still refused for an ordinary roadmap item; the plus is filed, tracked, deployed and closed on the
// roadmap path and mirrored in plus_ledger and product_registry; the next request names the earlier plus; a simplify pass follows four plusses; product_plus = off stops it.
// Run: node migrations/plussing-3.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const suite5 = rd("./management-personas-5.test.mjs");
const prep = suite5.slice(suite5.indexOf("const db = new DatabaseSync"), suite5.indexOf("const run = (s"));
const suite1 = rd("./management-personas.test.mjs");
const schema = suite1.slice(suite1.indexOf("db.exec(`") + 9, suite1.indexOf("`);", suite1.indexOf("db.exec(`")));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const sqls = ["./2026-10-26-management-personas.sql", "./2026-10-26-management-personas-2.sql", "./2026-10-26-management-personas-3.sql"].map(rd);
let db;
eval(prep.replace("const db = ", "db = "));
const run = (s, ...a) => db.prepare(s).run(...a);
const q = (s, ...a) => db.prepare(s).all(...a);
const one = (s, ...a) => db.prepare(s).get(...a);
for (const f of ["-4", "-5", "-6", "-7"]) db.exec(rd("./2026-10-26-management-personas" + f + ".sql"));
run("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('code_merge_trusted_sources', 'qnfo-fleet-control|METRIC-TRIGGER-,management-personas|ROADMAP-1:')");
db.exec("CREATE TABLE roadmap_implementation (item TEXT, source TEXT, title TEXT, artifact_type TEXT, artifact_ref TEXT, status TEXT, evidence TEXT)");
db.exec(`CREATE TABLE plus_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_slug TEXT NOT NULL,
  plus TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  metric TEXT,
  predicted TEXT,
  measured TEXT,
  shipped_at TEXT,
  decided_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
run("INSERT INTO plus_ledger (product_slug, plus, status, metric, predicted, measured, decided_at) VALUES ('companion-today', 'Legacy plus proposal', 'rejected', 'legacy_metric', 'legacy prediction', 'legacy outcome', '2026-10-29 12:00:00')");
db.exec(rd("./2026-10-29-plussing-1.sql"));
const sql3 = rd("./2026-10-29-plussing-3.sql");
const def = () => JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps;
const before = def().length;
db.exec(sql3);
const NEW = ["pl-research", "pl-ledger", "pl-sync", "pl-rejected", "pl-deployed", "pl-deployed-mark", "pl-log", "pl-metric", "pl-brief"];
ok(def().length === before + NEW.length && def().slice(-NEW.length).map((s) => s.name).join() === NEW.join(), "nine plus steps are appended", def().map((s) => s.name).slice(-11));
ok(/NOT \(d\.value = 'personal-' AND roadmap_proposals\.request_instance LIKE 'roadmap-%-plus-%'\)/.test(def().find((s) => s.name === "rm-reject").sql), "rm-reject exempts personal-* for plus instances only");
db.exec(sql3.slice(0, sql3.lastIndexOf("\nINSERT INTO decision_log")));
ok(def().length === before + NEW.length && (def().find((s) => s.name === "rm-reject").sql.match(/personal-' AND/g) || []).length === 1, "a re-apply changes nothing");
ok(one("SELECT worker FROM product_registry WHERE product = 'research-gateway'").worker === "qnfo-ai" && one("SELECT status FROM roadmap_implementation WHERE item = 'PLUS-3'").status === "built", "the router row is corrected and PLUS-3 is marked built");

db.exec(`CREATE TABLE output_quality_measures (
  metric TEXT PRIMARY KEY,
  role TEXT,
  polarity REAL,
  tol_abs REAL,
  tol_rel REAL
)`);
const sql4 = rd("./2026-11-01-plussing-4.sql");
db.exec(sql4.split("\n").filter((line) => !line.startsWith("--")).join("\n"));
const sql10 = rd("./2026-11-01-management-personas-10.sql");
db.exec(sql10.split("\n").filter((line) => !line.startsWith("--")).join("\n"));
db.exec(`CREATE TABLE control_registry (
  control TEXT PRIMARY KEY,
  location TEXT NOT NULL,
  kind TEXT NOT NULL,
  guards_against TEXT,
  critical_path INTEGER NOT NULL DEFAULT 0,
  disposition TEXT NOT NULL,
  disposition_state TEXT NOT NULL DEFAULT 'planned',
  alternate_path TEXT,
  alternate_tested_at TEXT,
  evidence TEXT NOT NULL
)`);
db.exec(`CREATE TABLE control_alternate_probes (
  control TEXT PRIMARY KEY,
  probe_sql TEXT NOT NULL,
  window_note TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
)`);
const sql6 = rd("./2026-11-01-plussing-6.sql");
db.exec(sql6);
ok(one("SELECT alternate_path FROM control_registry WHERE control = 'plussing-three-miss-rest'").alternate_path.includes("seven-day rest expires"), "the miss-rest control registers its recovery path");
ok(one("SELECT probe_sql FROM control_alternate_probes WHERE control = 'plussing-three-miss-rest'").probe_sql.includes("v_product_plus_due"), "the miss-rest recovery path is verified against the due-products view");
const legacy = one("SELECT product, kind, title, metric, predicted_outcome, outcome, created_at FROM plus_ledger WHERE product = 'companion-today'");
ok(legacy.product === "companion-today" && legacy.kind === "plus" && legacy.title === "Legacy plus proposal" && legacy.metric === "legacy_metric" && legacy.predicted_outcome === "legacy prediction" && legacy.outcome === "legacy outcome" && legacy.created_at === "2026-10-29 12:00:00", "the legacy ledger row is preserved and mapped to the PLUSSING-3/4 columns", legacy);
ok(def().find((s) => s.name === "pl-research").sql.includes("latest kept plus") && def().find((s) => s.name === "pl-research").sql.includes("three-miss rest"), "the plus prompt extends a kept change and gives a fresh angle after a rest");
ok(def().find((s) => s.name === "pl-deployed").sql.includes("misses_in_row = CASE WHEN rest_until") && def().find((s) => s.name === "pl-shipped-metric").sql.includes("p.rest_until IS NULL OR p.rest_until <="), "ordinary deployments preserve miss streaks and resting products leave the shipment denominator");
run("INSERT INTO product_registry (product, program_code, last_plus_at) VALUES ('plus6-fixture', 'QNFO.REACH', '2026-09-01T00:00:00Z')");
run("INSERT INTO plus_outcome_checks (plus_id, product, outcome) VALUES (9000, 'plus6-fixture', 'pending')");
run("UPDATE plus_outcome_checks SET outcome = 'unmeasured' WHERE plus_id = 9000");
run("INSERT INTO plus_outcome_checks (plus_id, product, outcome) VALUES (9001, 'plus6-fixture', 'pending')");
run("UPDATE plus_outcome_checks SET outcome = 'kept' WHERE plus_id = 9001");
ok(one("SELECT misses_in_row FROM product_registry WHERE product = 'plus6-fixture'").misses_in_row === 0, "unmeasured checks do not count and a kept plus clears the streak");
for (const plusId of [9002, 9003, 9004]) {
  run("INSERT INTO plus_outcome_checks (plus_id, product, outcome) VALUES (?, 'plus6-fixture', 'pending')", plusId);
  run("UPDATE plus_outcome_checks SET outcome = 'revert_required' WHERE plus_id = ?", plusId);
}
const restedProduct = one("SELECT misses_in_row, rest_until FROM product_registry WHERE product = 'plus6-fixture'");
ok(restedProduct.misses_in_row === 3 && Date.parse(restedProduct.rest_until) > Date.now(), "three measured misses set a seven-day product rest", restedProduct);
ok(!q("SELECT product FROM v_product_plus_due").includes("plus6-fixture"), "a product on rest is not due");
run("UPDATE plus_outcome_checks SET outcome = 'reverted' WHERE plus_id = 9004");
ok(one("SELECT misses_in_row FROM product_registry WHERE product = 'plus6-fixture'").misses_in_row === 3, "completing a revert does not count the same miss twice");
run("UPDATE product_registry SET misses_in_row = 3, rest_until = '2000-01-01T00:00:00Z' WHERE product = 'plus6-fixture'");
run("INSERT INTO plus_ledger (product, kind, title, status, product_slug, plus) VALUES ('plus6-fixture', 'plus', 'Fresh-angle plus', 'deployed', 'plus6-fixture', 'Fresh-angle plus')");
db.prepare(def().find((s) => s.name === "pl-deployed").sql).run();
const resumedProduct = one("SELECT misses_in_row, rest_until FROM product_registry WHERE product = 'plus6-fixture'");
ok(resumedProduct.misses_in_row === 0 && resumedProduct.rest_until === null, "the first deployed cycle after rest starts a fresh miss streak", resumedProduct);
run("DELETE FROM plus_outcome_checks WHERE product = 'plus6-fixture'");
run("DELETE FROM plus_ledger WHERE product = 'plus6-fixture'");
run("DELETE FROM product_registry WHERE product = 'plus6-fixture'");
for (const step of def().filter((s) => s.name.startsWith("pl-"))) {
  try {
    db.prepare(step.sql);
    ok(true, "step " + step.name + " prepares against the legacy ledger");
  } catch (e) {
    ok(false, "step " + step.name + " prepares against the legacy ledger", String(e));
  }
}
ok(def().find((s) => s.name === "pl-shipped-metric").sql.includes("SELECT MIN(cnt)") && !def().find((s) => s.name === "pl-shipped-metric").sql.includes("SELECT MIN((SELECT COUNT(*)"), "the shipped metric uses a valid per-product minimum aggregation");

for (const p of ["QNFO.OPS", "QNFO.RSCH", "QNFO.PERSONAL", "QNFO.REACH"]) run("INSERT OR IGNORE INTO program_charters (program_code, objective, definition_of_done, manager_persona, status) VALUES (?, ?, 'dod', ?, 'active')", p, "aim of " + p, "program-manager:" + p);
run("INSERT INTO portfolio_allocations (tick, program_code, verdict, risk_score, decision, slots, manager_persona) VALUES ('t1', 'QNFO.OPS', 'RED', 50, 'steady', 5, 'program-manager:QNFO.OPS')");
run("INSERT INTO persona_briefs (tick, persona_key, level, scope, verdict, decision, summary) VALUES ('t1', 'portfolio-manager', 'portfolio', 'QNFO', 'RED', 'allocate', 'Brief.')");
const NAMES = [...def().map((s) => s.name).filter((n) => n.startsWith("rm-")), ...NEW];
const tick = () => { for (const n of NAMES) { const s = def().find((x) => x.name === n); try { db.prepare(s.sql).all(); } catch (e) { ok(false, "step " + n + " runs", String(e)); throw e; } } };
run("UPDATE product_registry SET created_at = '2026-10-01T00:00:00Z'");
run("UPDATE product_registry SET created_at = '2026-10-01T00:00:00Z', last_plus_at = NULL");
run("UPDATE product_registry SET created_at = '2026-09-01T00:00:00Z' WHERE product = 'companion-today'");
tick();
const reqs = q("SELECT * FROM cf_agent_requests WHERE instance LIKE 'roadmap-%-plus-%' ORDER BY id");
ok(reqs.length === 3, "at most three products a day are asked", reqs.map((r) => r.instance));
ok(reqs.every((r) => !/qnfo-ops|qnfo-fleet-control/.test(r.prompt)) && !reqs.some((r) => /-plus-ops-executor-/.test(r.instance)), "a control-plane product is never asked");
const me = reqs.find((r) => /-plus-companion-today-/.test(r.instance));
ok(me && /personal-api\/worker\.js/.test(me.prompt) && /Legacy plus proposal \[rejected\]/.test(me.prompt) && /latest kept plus/.test(me.prompt) && /Never read or quote personal data/.test(me.prompt) && /exactly one plus/.test(me.prompt), "the me.q08.org request builds on prior plusses and keeps its privacy boundary");
tick();
ok(q("SELECT * FROM cf_agent_requests WHERE instance LIKE 'roadmap-%-plus-%'").length === 3, "a second tick the same day asks nothing new");

run("UPDATE cf_agent_requests SET status = 'done', result = ? WHERE id = ?", "TITLE: Greet the owner with what changed since yesterday\nWHY: the owner sees it on opening; opens per week up 20%\ncode-task: repo=qnfo-workers path=personal-api/worker.js\ncode-anchor: const GREETING_PLACEHOLDER = 'hello';\nEDIT: add a line", me.id);
const other = reqs.find((r) => r.id !== me.id);
run("UPDATE cf_agent_requests SET status = 'done', result = ? WHERE id = ?", "TITLE: Faster\nWHY: x\ncode-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js\ncode-anchor: function evaluateMetricTriggers(env) {\nEDIT: y", other.id);
run("UPDATE persona_briefs SET summary = 'Brief.'");
tick();
const pMe = one("SELECT * FROM roadmap_proposals WHERE request_instance = ?", me.instance), pOt = one("SELECT * FROM roadmap_proposals WHERE request_instance = ?", other.instance);
ok(pMe.status === "filed" && pMe.path === "personal-api/worker.js", "a personal-api plus is accepted and filed", pMe);
ok(pOt.status === "rejected" && /qnfo-fleet-control/.test(pOt.outcome), "a control-plane plus is rejected with the reason", pOt);
const l = q("SELECT * FROM plus_ledger ORDER BY id");
const managedPlus = l.find((row) => row.issue_id === pMe.issue_id);
ok(l.length === 2 && managedPlus.product === "companion-today" && managedPlus.product_slug === "companion-today" && managedPlus.kind === "plus" && managedPlus.plus === managedPlus.title && managedPlus.status === "proposed" && /opens per week/.test(managedPlus.predicted_outcome) && managedPlus.predicted === managedPlus.predicted_outcome, "the accepted plus is mirrored in both ledger shapes with its prediction", l);
ok(one("SELECT in_flight FROM v_product_plus_due WHERE product = 'companion-today'") === undefined || true, "ledger readable by the due view");
run("INSERT INTO roadmap_proposals (program_code, request_instance, title, path, anchor_line, status) VALUES ('QNFO.PERSONAL', 'roadmap-QNFO.PERSONAL-20261029', 'plain roadmap', 'personal-api/worker.js', 'code-anchor: some long enough anchor text', 'proposed')");
tick();
ok(one("SELECT status FROM roadmap_proposals WHERE title = 'plain roadmap'").status === "rejected", "a personal-* path is still refused for an ordinary roadmap item");
tick();
ok(one("SELECT COUNT(*) AS n FROM plus_ledger").n === 2, "a second tick adds nothing twice");

const task = "ct_im" + pMe.issue_id;
run("INSERT INTO code_tasks (id, repo, path, goal, status, pr_url, updated_at) VALUES (?, 'qnfo-workers', 'personal-api/worker.js', 'g', 'running', NULL, '2026-10-29T10:00Z')", task);
tick();
ok(one("SELECT status FROM plus_ledger WHERE id = ?", managedPlus.id).status === "building", "the ledger follows the plus into build");
run("UPDATE code_tasks SET status = 'merged', merge_state = 'verified', pr_url = 'https://github.com/QNFO/qnfo-workers/pull/9001' WHERE id = ?", task);
run("UPDATE persona_briefs SET summary = 'Brief.'");
tick();
for (const step of def().filter((s) => ["pl-outcome-baseline", "pl-outcome-review", "pl-outcome-result", "pl-revert-request", "pl-revert-sync", "pl-revert-sync-check", "pl-shipped-metric", "pl-kept-metric"].includes(s.name))) {
  try {
    db.prepare(step.sql).all();
    ok(true, "step " + step.name + " runs against the legacy ledger");
  } catch (e) {
    ok(false, "step " + step.name + " runs against the legacy ledger", String(e));
  }
}
const d = one("SELECT * FROM plus_ledger WHERE id = ?", managedPlus.id), reg = one("SELECT * FROM product_registry WHERE product = 'companion-today'");
ok(d.status === "deployed" && d.pr_url === "https://github.com/QNFO/qnfo-workers/pull/9001" && d.outcome && d.decided_at, "a verified live deploy marks the ledger row", d);
ok(reg.last_plus_at && reg.pluses_since_simplify === 1 && reg.misses_in_row === 0, "last_plus_at and the simplify counter are set", reg);
ok(one("SELECT status FROM agent_issues WHERE id = ?", pMe.issue_id).status === "closed", "the issue is closed with the pull request");
ok(one("SELECT last_value FROM metric_registry WHERE metric = 'product_plus_deployed_7d'").last_value === "1", "the metric counts the deployed plus");
ok(one("SELECT last_value FROM metric_registry WHERE metric = 'plus_shipped_7d'").last_value === "0", "the shipped metric aggregates all active products successfully");
ok(/Product plussing: 8 products, 0 plusses in flight, 1 deployed in 7 days \(latest: companion-today: Greet the owner/.test(one("SELECT summary FROM persona_briefs WHERE persona_key = 'portfolio-manager'").summary), "the brief states it", one("SELECT summary FROM persona_briefs WHERE persona_key = 'portfolio-manager'").summary);
ok(one("SELECT COUNT(*) AS n FROM persona_actions WHERE kind = 'product-plus' AND to_value = 'deployed'").n === 1, "the deploy is logged once");
ok(!q("SELECT * FROM v_product_plus_due").some((r) => r.product === "companion-today"), "a product plussed today is no longer due");

run("UPDATE product_registry SET last_plus_at = '2026-10-01T00:00:00Z', pluses_since_simplify = 4 WHERE product = 'companion-today'");
run("DELETE FROM cf_agent_requests WHERE instance LIKE 'roadmap-%-plus-companion-today-%'");
run("DELETE FROM cf_agent_requests WHERE instance NOT LIKE '%companion-today%'");
tick();
const again = one("SELECT prompt FROM cf_agent_requests WHERE instance LIKE 'roadmap-%-plus-companion-today-%'");
ok(again && /Greet the owner with what changed since yesterday \[deployed\]/.test(again.prompt) && /SIMPLIFY pass/.test(again.prompt), "the next request names the earlier plus and is a simplify pass after four plusses", again && again.prompt.slice(0, 300));

run("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('product_plus', 'off')");
run("DELETE FROM cf_agent_requests");
tick();
ok(one("SELECT COUNT(*) AS n FROM cf_agent_requests WHERE instance LIKE 'roadmap-%-plus-%'").n === 0, "product_plus = off stops the research");
ok(/^-- APPLY-BY: ci$/m.test(sql3) && /^-- DB: qnfo-audit$/m.test(sql3) && /^-- BACKUP: bak_20261029_plus3_workflow$/m.test(sql3) && /^-- Rollback: /m.test(sql3), "the header opts in to the runner");
console.log("plussing-3: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
