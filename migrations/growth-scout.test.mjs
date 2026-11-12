// MARKET-SCOUT-1 offline suite for migrations/2026-11-12-growth-scout.sql. It builds the growth-pm test's schema, applies growth-pm and the scout file (twice),
// runs the growth-scout workflow steps in order and walks one finding from agent reply to ranked, promoted to a growth experiment, filed by growth-pm as GROWTH-1,
// shipped, measured and fed back (finding status, signals row, area cadence). It also checks the accuracy gate (no source, no finding) and the self-repair of a stuck request.
// Run: node migrations/growth-scout.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const pmTest = readFileSync(new URL("./growth-pm.test.mjs", import.meta.url), "utf8");
const SCHEMA = /const SCHEMA = String\.raw`([\s\S]*?)`;/.exec(pmTest)[1];
const db = new DatabaseSync(":memory:");
db.exec(SCHEMA);
db.exec("CREATE TABLE signals (id TEXT PRIMARY KEY, ts TEXT, source TEXT, source_ref TEXT, content TEXT, open_questions TEXT, evidential_weight REAL, domain TEXT, status TEXT DEFAULT 'new', decision TEXT, score REAL, created_at TEXT)");
for (const p of ["companion-today", "jobs", "travel", "fleet-dashboard", "research-gateway", "ops-executor", "q08-home", "shorts-channel", "papers"])
  db.prepare("INSERT INTO product_registry (product, program_code) VALUES (?, 'QNFO.OPS')").run(p);
const PM = readFileSync(new URL("./2026-11-12-growth-pm.sql", import.meta.url), "utf8");
const MIG = readFileSync(new URL("./2026-11-12-growth-scout.sql", import.meta.url), "utf8");
db.exec(PM);
db.exec(MIG); db.exec(MIG); // idempotent
const one = (s, ...a) => db.prepare(s).get(...a);
const all = (s, ...a) => db.prepare(s).all(...a);
const iso = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const steps = JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'growth-scout'").definition).steps;
const pmSteps = JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'growth-pm'").definition).steps;
const runSteps = (ss, label) => { for (const s of ss) { try { db.exec(s.sql); } catch (e) { ok(false, label + " step " + s.name, String(e.message)); } } };

ok(steps.length >= 12 && steps.every((s) => s.type === "sql" && s.db === "AUDIT" && s.name), "growth-scout workflow has named sql steps", steps.length);
ok(one("SELECT COUNT(*) n FROM fleet_crons WHERE task_id = 'growth-scout' AND enabled = 1").n === 1, "growth-scout runs hourly");
const areas = all("SELECT * FROM market_scout_areas");
ok(areas.length === 6, "six scout areas (jobs, companion, research, signals, Ultrastable, brand)", areas.map((a) => a.area));
const gm = new Set(all("SELECT metric FROM product_growth_metrics").map((r) => r.metric));
ok(areas.every((a) => gm.has(a.metric)), "every area serves an existing growth metric", areas.filter((a) => !gm.has(a.metric)));
ok(areas.every((a) => /^[a-z0-9-]+$/.test(a.worker) && a.players.length > 10), "areas name a worker and leading players");
for (const m of ["scout_heartbeat_age_min", "scout_reply_accuracy_7d", "scout_areas_overdue", "scout_competitors_unchecked"]) {
  ok(one("SELECT COUNT(*) n FROM analytics_metric_triggers WHERE metric_key = ?", m).n === 1 && one("SELECT COUNT(*) n FROM metric_breach_cause WHERE metric_key = ?", m).n === 1, "metric with trigger and cause: " + m);
}
ok(!/\|\| ?'?\$\{/.test(MIG) && /APPLY-BY: ci/.test(MIG) && /-- Rollback: /.test(MIG) && !/\bDROP TABLE|DELETE FROM/i.test(MIG), "migration header ok, no table drops or deletes");

// live-like state so growth-pm has metrics
db.prepare("INSERT INTO jobsearch_matches (id, first_seen, last_seen, tier, status) VALUES ('m1', ?, ?, 'A', 'pending_owner_approval')").run(iso(-5), iso(0));
runSteps(pmSteps, "pm0");
db.exec("DELETE FROM growth_experiments; DELETE FROM cf_agent_requests;"); // test-only reset of growth-pm's own output

// --- tick 1: one request per tick, oldest-first, capped per day
runSteps(steps, "scout1");
let reqs = all("SELECT requester, instance, prompt FROM cf_agent_requests WHERE instance LIKE 'scout-%' AND instance NOT LIKE 'scout-comp-%' AND instance NOT LIKE 'scout-rnd-%'");
const kinds = Object.fromEntries(all("SELECT kind, COUNT(*) n FROM market_scout_findings GROUP BY kind").map((r) => [r.kind, r.n]));
ok(kinds.practice === 1 && kinds.competitor === 1 && kinds.rnd === 1, "one practice, one competitor and one R&D request in the first tick", kinds);
const comp = all("SELECT instance, prompt FROM cf_agent_requests WHERE instance LIKE 'scout-comp-%'")[0], rnd = all("SELECT instance, prompt FROM cf_agent_requests WHERE instance LIKE 'scout-rnd-%'")[0];
ok(/competitive analyst/.test(comp.prompt) && /changelog, pricing/.test(comp.prompt) && /https:\/\//.test(comp.prompt) && /research and development lead/.test(rnd.prompt) && /arXiv, GitHub/.test(rnd.prompt), "competitor and R&D prompts name their method and demand a source");
ok(one("SELECT COUNT(*) n FROM market_scout_competitors").n === 18 && all("SELECT area FROM market_scout_competitors GROUP BY area HAVING COUNT(*) = 3").length === 6, "18 competitors, three per area");
ok(reqs.length === 1 && /web_search and web_fetch/.test(reqs[0].prompt) && /SOURCE:/.test(reqs[0].prompt) && /Only report what a page you fetched actually says/.test(reqs[0].prompt), "one scout request that demands a fetched source", reqs.map((r) => r.instance));
ok(one("SELECT COUNT(*) n FROM market_scout_findings WHERE status = 'requested' AND kind = 'practice'").n === 1, "request logged as a finding");
const first = reqs[0];
runSteps(steps, "scout1b");
ok(all("SELECT 1 FROM cf_agent_requests WHERE requester = ? AND instance NOT LIKE 'scout-comp-%' AND instance NOT LIKE 'scout-rnd-%'", first.requester).length === 1 && all("SELECT 1 FROM cf_agent_requests WHERE requester = ? AND instance NOT LIKE 'scout-comp-%' AND instance NOT LIKE 'scout-rnd-%'", first.requester).length === 1, "no second request for the same area while one is pending");
db.exec("UPDATE market_scout_findings SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ','now','-2 hours')");
for (let i = 0; i < 4; i++) { db.exec("UPDATE market_scout_findings SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ','now','-2 hours') WHERE status <> 'requested'"); runSteps(steps, "cap" + i); }
ok(all("SELECT DISTINCT instance FROM cf_agent_requests WHERE instance LIKE 'scout-%'").length <= 6, "daily request cap (6) holds", all("SELECT instance FROM cf_agent_requests WHERE instance LIKE 'scout-%'"));

// --- competitor and R&D replies become ranked experiments too
const cf = (inst) => one("SELECT * FROM market_scout_findings WHERE request_instance = ?", inst);
db.prepare("UPDATE cf_agent_requests SET status = 'done', result = ? WHERE instance = ?").run("PRACTICE: Teal ships a resume score\nPLAYERS: Teal\nSOURCE: https://www.tealhq.com/tools/resume-builder\nEVIDENCE: The builder page scores a resume against a posting and lists missing keywords.\nNEED: know the gap before applying; ours shows none\nTITLE: Show missing posting keywords on each match\nLIFT: 15\nEFFORT: 2\ncode-task: repo=qnfo-workers path=qnfo-jobsearch/worker.js\ncode-anchor: const MISSING_KEYWORDS = 0\nEDIT: list them", comp.instance);
db.prepare("UPDATE cf_agent_requests SET status = 'done', result = ? WHERE instance = ?").run("PRACTICE: Reranking with a cross-encoder lifts job-to-resume matching\nPLAYERS: Reimers, Gurevych\nSOURCE: https://arxiv.org/abs/1908.10084\nEVIDENCE: The paper shows sentence embeddings with a pairwise reranker improve semantic matching quality.\nNEED: better matches\nTITLE: Rerank the top matches with a second pass\nLIFT: 10\nEFFORT: 3\ncode-task: repo=qnfo-workers path=qnfo-jobsearch/worker.js\ncode-anchor: const RERANK_TOP = 0\nEDIT: second pass", rnd.instance);
db.exec("UPDATE market_scout_findings SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ','now','-3 hours') WHERE kind <> 'practice'");
runSteps(steps, "kinds");
ok(cf(comp.instance).kind === "competitor" && ["ranked", "experiment"].includes(cf(comp.instance).status) && cf(comp.instance).players === "Teal", "competitor finding parsed and ranked", cf(comp.instance));
ok(["ranked", "experiment"].includes(cf(rnd.instance).status) && cf(rnd.instance).kind === "rnd", "R&D finding parsed and ranked", cf(rnd.instance));
ok(one("SELECT checks, last_checked FROM market_scout_competitors WHERE id = 'simplify'").checks >= 1, "the analysed competitor is marked checked");
ok(one("SELECT COUNT(*) n FROM signals WHERE content LIKE 'Competitor Teal%'").n === 1 && one("SELECT COUNT(*) n FROM signals WHERE content LIKE 'R&D: Reimers%'").n === 1, "competitor and R&D findings enter the signals table");
ok(one("SELECT COUNT(*) n FROM growth_experiments WHERE hypothesis LIKE 'MARKET-SCOUT-1 competitor finding%' OR hypothesis LIKE 'MARKET-SCOUT-1 rnd finding%'").n >= 1, "a competitor or R&D finding is promoted to a growth experiment");
// one experiment per product at a time: free the jobs slot so the practice finding below is promoted
db.exec("UPDATE growth_experiments SET status = 'abandoned'; UPDATE market_scout_findings SET status = 'dropped' WHERE status = 'experiment'");
// --- replies: one good, one without a source, one touching the control plane
const area = one("SELECT * FROM market_scout_areas WHERE area = ?", first.requester.slice(6));
const reply = (inst, body) => db.prepare("UPDATE cf_agent_requests SET status = 'done', result = ? WHERE instance = ?").run(body, inst);
const good = (path) => "PRACTICE: **Simplify** autofills applications and tracks each one in a board\nPLAYERS: Simplify, Teal\nSOURCE: https://simplify.jobs/copilot\nEVIDENCE: The page says autofill covers most ATS forms and a tracker records each stage of an application.\nNEED: spend less time on forms\nTITLE: Add a stage tracker to each application\nLIFT: 25\nEFFORT: 2\ncode-task: repo=qnfo-workers path=" + path + "\ncode-anchor: const TRACKER_STAGES = 4\nEDIT: add a stage column";
reply(first.instance, good(area.worker + "/worker.js"));
runSteps(steps, "scout2");
let f = one("SELECT * FROM market_scout_findings WHERE request_instance = ?", first.instance);
ok(f.status === "experiment" && f.experiment_id && f.source_url === "https://simplify.jobs/copilot" && f.players === "Simplify, Teal" && f.score > 0 && f.path === area.worker + "/worker.js", "good reply parsed, ranked and promoted", f);
const ex = one("SELECT * FROM growth_experiments WHERE id = ?", f.experiment_id);
ok(ex.status === "proposed" && ex.kind === "growth" && ex.product === area.product && ex.metric === area.metric && /Source: https:\/\/simplify.jobs\/copilot/.test(ex.hypothesis), "promoted to a growth experiment with its source", ex);
ok(one("SELECT COUNT(*) n FROM signals WHERE source = 'market-scout' AND source_ref = 'https://simplify.jobs/copilot'").n === 1, "ranked practice enters the signals table");

// accuracy gate
db.exec("UPDATE market_scout_findings SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ','now','-3 days'); UPDATE market_scout_areas SET cadence_days = 1");
db.exec("INSERT INTO market_scout_findings (area, product, metric, request_instance, status) VALUES ('" + area.area + "', '" + area.product + "', '" + area.metric + "', 'scout-bad1', 'requested'), ('" + area.area + "', '" + area.product + "', '" + area.metric + "', 'scout-bad2', 'requested'), ('" + area.area + "', '" + area.product + "', '" + area.metric + "', 'scout-bad3', 'requested')");
for (const i of ["scout-bad1", "scout-bad2", "scout-bad3"]) db.prepare("INSERT INTO cf_agent_requests (requester, instance, status, result) VALUES (?, ?, 'queued', NULL)").run("scout:" + area.area, i);
reply("scout-bad1", good(area.worker + "/worker.js").replace(/SOURCE: .*/, "SOURCE: none"));
reply("scout-bad2", good("qnfo-ops/worker.js"));
reply("scout-bad3", good(area.worker + "/worker.js").replace(/PLAYERS: .*/, "PLAYERS: "));
runSteps(steps, "scout3");
const bad = all("SELECT request_instance, status, note FROM market_scout_findings WHERE request_instance LIKE 'scout-bad%'");
ok(bad.length === 3 && bad.every((r) => r.status === "rejected"), "no source, control-plane path or no named player: all rejected", bad);
ok(one("SELECT COUNT(*) n FROM growth_experiments WHERE request_instance IN ('scout-exp-' || (SELECT id FROM market_scout_findings WHERE request_instance = 'scout-bad1'))").n === 0, "a rejected finding never becomes an experiment");
ok(Number(one("SELECT last_value v FROM metric_registry WHERE metric = 'scout_reply_accuracy_7d'").v) < 1, "accuracy metric sees the rejections");

// --- self-repair of a stuck request
db.prepare("INSERT INTO cf_agent_requests (requester, instance, status, created_at) VALUES (?, 'scout-stuck', 'running', ?)").run("scout:" + area.area, iso(-8));
db.exec("INSERT INTO market_scout_findings (area, product, metric, request_instance, status, created_at) VALUES ('" + area.area + "', '" + area.product + "', '" + area.metric + "', 'scout-stuck', 'requested', strftime('%Y-%m-%dT%H:%M:%SZ','now','-8 hours'))");
runSteps(steps, "repair");
ok(one("SELECT status FROM cf_agent_requests WHERE instance = 'scout-stuck'").status === "failed" && one("SELECT status FROM market_scout_findings WHERE request_instance = 'scout-stuck'").status === "rejected", "a stuck request is failed and its finding closed, so the area is scouted again");

// --- growth-pm takes the promoted experiment through filing, shipping, measuring
db.exec("UPDATE ops_config SET value = '4' WHERE key = 'growth_pm_max_in_flight'");
runSteps(pmSteps, "pm1");
const ex2 = one("SELECT * FROM growth_experiments WHERE id = ?", f.experiment_id);
ok(ex2.status === "filed" && ex2.issue_id, "growth-pm files the scouted experiment as GROWTH-1", ex2);
const iss = one("SELECT * FROM agent_issues WHERE id = ?", ex2.issue_id);
ok(/^GROWTH-1: /.test(iss.title) && /^code-task: repo=qnfo-workers path=\S+\/worker\.js\ncode-anchor: \S/m.test(iss.description) && /https:\/\/simplify\.jobs\/copilot/.test(iss.description) && /prediction: \S+ >= /.test(iss.description), "issue carries code-task, anchor, prediction and the market source", iss.description.slice(0, 400));
db.prepare("INSERT INTO code_tasks (id, goal, status, pr_url, updated_at) VALUES (?, 'x', 'merged', 'https://github.com/x/y/pull/1', ?)").run("ct_im" + ex2.issue_id, iso(0));
runSteps(pmSteps, "pm2");
ok(one("SELECT status FROM growth_experiments WHERE id = ?", f.experiment_id).status === "shipped", "merged code task ships the experiment");
db.exec("UPDATE growth_experiments SET due_at = strftime('%Y-%m-%dT%H:%M:%SZ','now','-1 hour'), baseline = 0.0001, predicted = 0.0002 WHERE id = " + f.experiment_id);
runSteps(pmSteps, "pm3");
const verdict = one("SELECT status FROM growth_experiments WHERE id = ?", f.experiment_id).status;
ok(["won", "kept_flat", "rolling_back"].includes(verdict), "experiment decided after its window", verdict);
db.exec("UPDATE growth_experiments SET status = 'won' WHERE id = " + f.experiment_id);

// --- feedback: verdict returns to the finding, signals and the area cadence
db.exec("UPDATE market_scout_areas SET cadence_days = 4, last_tuned_at = NULL");
runSteps(steps, "feedback");
f = one("SELECT * FROM market_scout_findings WHERE id = ?", f.id);
ok(f.status === "won" && f.decided_at, "the experiment verdict returns to the finding", f);
ok(one("SELECT COUNT(*) n FROM signals WHERE id = 'scout-" + f.id + "-won' AND evidential_weight = 0.8").n === 1, "outcome enters the signals table with weight 0.8");
ok(one("SELECT cadence_days c FROM market_scout_areas WHERE area = ?", f.area).c === 1, "an area whose finding won is scouted daily");
for (let i = 0; i < 3; i++) db.prepare("INSERT INTO market_scout_findings (area, product, metric, status, request_instance) VALUES ('personal-brand', 'brand', 'brand_touch_outcomes_7d', 'kept_flat', ?)").run("flat" + i);
db.exec("UPDATE market_scout_areas SET last_tuned_at = NULL");
runSteps(steps, "slow");
ok(one("SELECT cadence_days c FROM market_scout_areas WHERE area = 'personal-brand'").c === 5, "an area with three decided and no win slows by one day (4 to 5)");

// --- heartbeat, switch
ok(Number(one("SELECT last_value v FROM metric_registry WHERE metric = 'scout_heartbeat_age_min'").v) <= 60, "heartbeat fresh");
ok(one("SELECT COUNT(*) n FROM market_scout_beats").n >= 1 && one("SELECT COUNT(*) n FROM persona_briefs WHERE persona_key = 'product-manager:market-scout'").n === 1, "beat and persona brief written");
db.exec("DELETE FROM cf_agent_requests; DELETE FROM market_scout_findings; UPDATE ops_config SET value = 'off' WHERE key = 'growth_scout'");
runSteps(steps, "off");
ok(one("SELECT COUNT(*) n FROM cf_agent_requests").n === 0, "growth_scout = off stops requests");
console.log(fail ? fail + " FAILED, " + pass + " passed" : "ok: " + pass + " passed");
process.exit(fail ? 1 : 0);
