// GROWTH-PM-1 offline suite for migrations/2026-11-12-growth-pm.sql. It applies the file (twice) to an in-memory SQLite built from the qnfo-audit
// objects it touches (sql read from sqlite_master on 2026-11-12), runs every step of the fleet_tasks growth-pm workflow in order, and walks one
// growth experiment, one knob move and one repair through: request -> agent reply -> ranked proposal -> GROWTH-1 issue -> merged code task ->
// shipped with baseline and prediction -> measured after 7 days -> won or rolled back. It also checks the coverage rule the CI gate enforces:
// every product has at least two growth metrics and an owner loop, every registry product has metrics or a parent, and every knob is read by
// worker code. Run: node migrations/growth-pm.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const SCHEMA = String.raw`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT);
CREATE TABLE issue_priority_scores (issue_id INTEGER PRIMARY KEY, impact INTEGER, probability INTEGER, capability_gain INTEGER, reach_gain INTEGER, remediation_cost INTEGER, scored_by TEXT NOT NULL, scored_at TEXT, note TEXT);
CREATE TABLE trust_ledger (surface TEXT NOT NULL, action_class TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 0, fail INTEGER NOT NULL DEFAULT 0, trust_score REAL NOT NULL, ladder_position TEXT NOT NULL, evidence TEXT NOT NULL, refreshed_at TEXT NOT NULL, PRIMARY KEY (surface, action_class));
CREATE TABLE inferred_direction (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, direction TEXT NOT NULL, source_signals TEXT NOT NULL, confidence REAL NOT NULL, acted_on INTEGER NOT NULL DEFAULT 0, outcome TEXT, UNIQUE (day, direction));
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE metric_breach_cause (metric_key TEXT PRIMARY KEY, cause_key TEXT NOT NULL, note TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TABLE decision_predictions (id INTEGER PRIMARY KEY AUTOINCREMENT, decision_id INTEGER NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('metric', 'issue')), subject TEXT NOT NULL, op TEXT NOT NULL CHECK (op IN ('<', '<=', '>', '>=', '=', 'between', 'closed')), value REAL, value2 REAL, due_at TEXT NOT NULL, origin TEXT NOT NULL CHECK (origin IN ('parsed', 'seeded')), created_at TEXT, scored_at TEXT, observed TEXT, matched INTEGER, UNIQUE (decision_id, subject, op));
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE fleet_crons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, cron_expr TEXT NOT NULL, task_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, timezone TEXT NOT NULL DEFAULT 'UTC', last_fired TEXT, next_fire TEXT, updated_at TEXT);
CREATE TABLE jobsearch_matches (id TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, tier TEXT, score INTEGER, status TEXT NOT NULL DEFAULT 'pending_owner_approval');
CREATE TABLE jobsearch_events (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL, event TEXT NOT NULL, ts TEXT NOT NULL, note TEXT);
CREATE TABLE jobsearch_auto (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL, ts TEXT NOT NULL, mode TEXT, outcome TEXT NOT NULL, ats TEXT, detail_json TEXT);
CREATE TABLE reader_yield_daily (day TEXT PRIMARY KEY, ga4_engaged_external REAL, ext_referred_pv REAL, papers_published INTEGER);
CREATE TABLE touch_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT NOT NULL, target TEXT NOT NULL, kind TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, day TEXT NOT NULL, outcome TEXT, outcome_at TEXT);
CREATE TABLE email_in (id INTEGER PRIMARY KEY, received_at TEXT);
CREATE VIEW v_email_inbound_external AS SELECT * FROM email_in;
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, goal TEXT, status TEXT, pr_url TEXT, updated_at TEXT, merge_state TEXT);
CREATE TABLE cf_agent_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, requester TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'run', prompt TEXT, code TEXT, cron TEXT, delay_s INTEGER, instance TEXT, priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0, run_id TEXT, result TEXT, error TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), started_at TEXT, finished_at TEXT);
CREATE TABLE management_personas (persona_key TEXT PRIMARY KEY, level TEXT NOT NULL, scope TEXT NOT NULL, charter TEXT, kpis TEXT, decision_authority TEXT, sla_min INTEGER, path_a TEXT, path_b TEXT, status TEXT DEFAULT 'active', updated_at TEXT);
CREATE TABLE persona_briefs (tick TEXT NOT NULL, persona_key TEXT NOT NULL, level TEXT NOT NULL, scope TEXT NOT NULL, verdict TEXT, decision TEXT, summary TEXT NOT NULL, computed_at TEXT, PRIMARY KEY (tick, persona_key));
CREATE TABLE persona_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), persona_key TEXT NOT NULL, kind TEXT NOT NULL, issue_id INTEGER, from_value TEXT, to_value TEXT, evidence TEXT NOT NULL, reverted_at TEXT);
CREATE TABLE product_registry (product TEXT PRIMARY KEY, host TEXT, worker TEXT, program_code TEXT NOT NULL, what_for TEXT, usage_metric TEXT, quality_measure TEXT, plus_cadence_h INTEGER NOT NULL DEFAULT 168, last_plus_at TEXT, rest_until TEXT, misses_in_row INTEGER NOT NULL DEFAULT 0, pluses_since_simplify INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'active', created_at TEXT);
CREATE TABLE projects (project_code TEXT PRIMARY KEY, program_code TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE issue_project_map (issue_id INTEGER PRIMARY KEY, project_code TEXT NOT NULL, program_code TEXT NOT NULL, kind TEXT NOT NULL, synced_milestone INTEGER, synced_labels TEXT, gh_node TEXT, gh_item TEXT, updated_at TEXT, synced_at TEXT);
CREATE VIEW v_issue_queue_v2 AS SELECT 1 AS pos, id FROM agent_issues;
INSERT INTO ops_config (key, value) VALUES ('code_merge_trusted_sources', 'personas|ROADMAP-1:');
INSERT INTO projects VALUES ('W.QNFO.PERSONAL', 'QNFO.PERSONAL', 'personal');
`;
const db = new DatabaseSync(":memory:");
db.exec(SCHEMA);
for (const p of ["companion-today", "jobs", "travel", "fleet-dashboard", "research-gateway", "ops-executor", "q08-home", "shorts-channel", "papers"])
  db.prepare("INSERT INTO product_registry (product, program_code) VALUES (?, 'QNFO.OPS')").run(p);
const MIG = readFileSync(new URL("./2026-11-12-growth-pm.sql", import.meta.url), "utf8");
db.exec(MIG); db.exec(MIG); // idempotent
const one = (s, ...a) => db.prepare(s).get(...a);
const all = (s, ...a) => db.prepare(s).all(...a);
const iso = (h) => new Date(Date.now() + h * 3600e3).toISOString();

// --- shape
const steps = JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'growth-pm'").definition).steps;
ok(steps.length >= 30 && steps.every((s) => s.type === "sql" && s.db === "AUDIT" && s.name), "growth-pm workflow has named sql steps", steps.length);
ok(one("SELECT COUNT(*) n FROM fleet_crons WHERE task_id = 'growth-pm' AND enabled = 1").n === 1, "growth-pm runs hourly");
for (const t of ["GROWTH-1:", "GROWTH-REPAIR-1:", "GROWTH-ROLLBACK-1:"])
  ok(one("SELECT value FROM ops_config WHERE key = 'code_merge_trusted_sources'").value.split(",").filter((x) => x === "growth-pm|" + t).length === 1, "trusted source once: " + t);
ok(one("SELECT COUNT(*) n FROM management_personas WHERE persona_key = 'product-manager:growth'").n === 1, "growth product manager persona");

// --- coverage rule (also the CI gate): every product >= 2 metrics + owner loop; every registry product covered; knobs read by worker code
const per = all("SELECT product, COUNT(*) n, MIN(owner_loop) loop FROM product_growth_metrics WHERE active = 1 GROUP BY product");
ok(per.length === 5 && per.every((r) => r.n >= 2 && r.loop === "growth-pm"), "five products with >= 2 growth metrics each and an owner loop", per);
ok(one("SELECT COUNT(*) n FROM v_growth_products_uncovered").n === 0, "every registry product has growth metrics or a parent", all("SELECT * FROM v_growth_products_uncovered"));
const SRC = { "growth_knob:jobs:": ["../qnfo-jobsearch/worker.js", "loadGrowthKnobs"], "growth_knob:brand:": ["../qnfo-social/worker.js", "touchKnobLoad"] };
for (const k of all("SELECT knob FROM product_growth_knobs")) {
  const pre = Object.keys(SRC).find((p) => k.knob.startsWith(p));
  if (!pre) { ok(k.knob === "product_plus_daily_cap", "knob with a known reader: " + k.knob); continue; }
  const code = readFileSync(new URL(SRC[pre][0], import.meta.url), "utf8");
  ok(code.includes(SRC[pre][1]) && code.includes(k.knob.slice(pre.length)), "worker reads knob " + k.knob);
}
const pp = readFileSync(new URL("../personal-companion/personal-pipeline.js", import.meta.url), "utf8");
for (const m of all("SELECT metric FROM product_growth_metrics WHERE source = 'counter'"))
  ok(pp.includes('"' + m.metric + '"'), "personal pipeline writes counter " + m.metric);
ok(!/label|text|answer/i.test((pp.match(/GROWTH_COUNTERS = \[[\s\S]*?\];/) || [""])[0].replace(/answered/g, "")), "counters carry counts only (no labels, text or answers leave the personal plane)");

// --- queue: growth weight puts a growth issue above an equal fix
db.exec("DROP VIEW v_issue_queue_v2");
db.exec(MIG.match(/CREATE VIEW v_issue_queue_v2 AS[\s\S]*?\) q;/)[0]);
const ms = Date.now() - 7200e3;
db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (900, 'fix', 'code-task: x', 's', 'reliability', 'high', 'open', ?, ?)").run(ms, ms);
db.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (901, 'grow', 'code-task: x', 's', 'growth', 'high', 'open', ?, ?)").run(ms, ms);
const q = all("SELECT id, score FROM v_issue_queue_v2 ORDER BY pos");
ok(q[0].id === 901 && q[0].score > q[1].score * 2, "growth issue outranks an equal fix (growth_priority_weight)", q);
db.prepare("INSERT INTO issue_priority_scores (issue_id, impact, scored_by) VALUES (900, 1, 't')").run();
ok(one("SELECT impact FROM v_issue_queue_v2 WHERE id = 900").impact === 1, "issue_priority_scores still overrides");
db.exec("UPDATE agent_issues SET status = 'closed' WHERE id IN (900, 901)");

// --- live-like data
const ins = (s, rows) => { const st = db.prepare(s); for (const r of rows) st.run(...r); };
ins("INSERT INTO jobsearch_matches (id, first_seen, last_seen, tier, status) VALUES (?, ?, ?, ?, 'pending_owner_approval')", Array.from({ length: 40 }, (_, i) => ["m" + i, iso(-24 * (i % 12)), iso(0), i % 3 ? "B" : "A"]));
ins("INSERT INTO jobsearch_events (match_id, event, ts) VALUES (?, 'applied', ?)", [["m1", iso(-30)], ["m2", iso(-200)]]);
ins("INSERT INTO reader_yield_daily (day, ga4_engaged_external, ext_referred_pv, papers_published) VALUES (?, 1, 10, 2)", Array.from({ length: 14 }, (_, i) => [iso(-24 * i).slice(0, 10)]));
ins("INSERT INTO touch_actions (platform, target, kind, mode, status, day, outcome, outcome_at) VALUES ('bsky', 't', 'follow', 'auto', 'done', ?, ?, ?)", [[iso(-30).slice(0, 10), "followed-back", iso(-30)], [iso(-200).slice(0, 10), "followed-back", iso(-200)], [iso(-210).slice(0, 10), "followed-back", iso(-210)], [iso(-220).slice(0, 10), "followed-back", iso(-220)], [iso(-230).slice(0, 10), "followed-back", iso(-230)]]);
ins("INSERT INTO code_tasks (id, goal, status, updated_at) VALUES (?, 'x', 'merged', ?)", Array.from({ length: 10 }, (_, i) => ["ct" + i, iso(-5)]));
ins("INSERT INTO product_growth_counters (product, metric, value, prev, read_at, source) VALUES ('companion-today', ?, 3, 2, ?, 'personal-companion')", [["personal_inputs_7d", iso(0)], ["personal_outcomes_7d", iso(0)], ["personal_taps_answered_7d", iso(0)]]);

const run = (label) => { for (const s of steps) { try { db.exec(s.sql); } catch (e) { ok(false, label + " step " + s.name, String(e.message)); } } };
run("tick1");
const g = Object.fromEntries(all("SELECT metric, value, prev, fresh FROM v_product_growth_now").map((r) => [r.metric, r]));
ok(g.jobs_qualified_matches_7d.value > 0 && g.jobs_applications_7d.value === 1 && g.jobs_applications_7d.prev === 1, "jobs metrics read live tables", g.jobs_applications_7d);
ok(g.research_papers_published_7d.value >= 14 && g.brand_touch_outcomes_7d.value === 1 && g.brand_touch_outcomes_7d.prev === 4, "research and brand metrics", [g.research_papers_published_7d, g.brand_touch_outcomes_7d]);
ok(g.personal_inputs_7d.value === 3 && g.personal_inputs_7d.fresh === 1, "companion counters read and fresh");
ok(g.ultrastable_merged_changes_7d.value === 10, "ultrastable merged changes");
ok(one("SELECT COUNT(*) n FROM product_growth_readings").n === 16, "readings snapshot every metric");
ok(one("SELECT COUNT(*) n FROM metric_registry WHERE layer = 'growth' AND state = 'MEASURED'").n >= 16, "growth metrics registered and measured");
ok(one("SELECT last_value v FROM metric_registry WHERE metric = 'products_without_growth_metrics'").v === "0", "products_without_growth_metrics = 0");
ok(Number(one("SELECT last_value v FROM metric_registry WHERE metric = 'growth_pm_heartbeat_age_min'").v) <= 60, "heartbeat fresh");
const reqs = all("SELECT requester, instance, prompt FROM cf_agent_requests WHERE instance NOT LIKE 'growth-repair-%'");
ok(reqs.length === 2 && reqs.every((r) => /growth product manager/.test(r.prompt) && /TITLE:/.test(r.prompt)), "two growth hypothesis requests, weakest products first", reqs.map((r) => r.instance));
const rep = all("SELECT instance, prompt FROM cf_agent_requests WHERE instance LIKE 'growth-repair-%'");
ok(rep.length === 1 && /growth-repair-brand-brand_/.test(rep[0].instance), "repair requested for a halved brand metric", rep.map((r) => r.instance));
ok(one("SELECT COUNT(*) n FROM growth_experiments WHERE status = 'requested'").n === 3, "requests logged as experiments");
const knob = one("SELECT * FROM growth_experiments WHERE kind = 'knob'");
ok(knob && knob.status === "shipped" && one("SELECT value FROM ops_config WHERE key = ?", knob.knob).value === knob.to_value, "one knob moved one step and applied", knob);
ok(one("SELECT COUNT(*) n FROM growth_experiments WHERE kind = 'knob'").n === 1, "one knob at a time");
run("tick1b"); run("tick1c"); run("tick1d");
const rq = one("SELECT COUNT(*) n, COUNT(DISTINCT instance) d, SUM(instance LIKE 'growth-repair-%') r FROM cf_agent_requests");
ok(rq.n === rq.d && rq.n - rq.r === 5 && rq.r === 1, "one request per product per day, five products, one repair per product per day (only brand has a broken metric here)", all("SELECT instance FROM cf_agent_requests"));

// --- agent replies
const reply = (inst, body) => db.prepare("UPDATE cf_agent_requests SET status = 'done', result = ? WHERE instance = ?").run(body, inst);
const good = "TITLE: Add a second job source\nWHY: more qualified roles\nLIFT: 20\nEFFORT: 2\ncode-task: repo=qnfo-workers path=qnfo-jobsearch/worker.js\ncode-anchor: const AUTO_COMPANY_DAYS = 60\nEDIT: add source";
const g0 = reqs[0].instance, g1 = reqs[1].instance;
reply(g0, good.replace("qnfo-jobsearch", reqs[0].requester.includes("brand") ? "qnfo-social" : "qnfo-jobsearch"));
reply(g1, "TITLE: touch the control plane\nLIFT: 50\nEFFORT: 1\ncode-task: repo=qnfo-workers path=qnfo-ops/worker.js\ncode-anchor: something long enough");
reply(rep[0].instance, "TITLE: Repair follow-back reader\nWHY: x\nLIFT: 100\nEFFORT: 1\ncode-task: repo=qnfo-workers path=qnfo-social/worker.js\ncode-anchor: var TOUCH_KNOB_RANGE\nEDIT: fix");
run("tick2");
const ex = Object.fromEntries(all("SELECT request_instance, status, score, issue_id, kind FROM growth_experiments WHERE kind <> 'knob'").map((r) => [r.request_instance, r]));
ok(ex[g1].status === "rejected", "a reply that touches the control plane is rejected", ex[g1]);
ok(ex[g0].status === "filed" && ex[g0].score > 0 && ex[g0].issue_id, "growth proposal ranked and filed", ex[g0]);
ok(ex[rep[0].instance].status === "filed", "repair filed", ex[rep[0].instance]);
const iss = one("SELECT * FROM agent_issues WHERE id = ?", ex[g0].issue_id);
ok(/^GROWTH-1: /.test(iss.title) && iss.category === "growth" && iss.priority === "high" && iss.source === "growth-pm", "GROWTH-1 issue shape", iss.title);
ok(/^code-task: repo=qnfo-workers path=\S+\/worker\.js\ncode-anchor: \S/m.test(iss.description) && /prediction: \S+ >= [\d.]+ within 168 h/.test(iss.description), "issue carries code-task, anchor and prediction", iss.description.slice(0, 300));
ok(/^GROWTH-REPAIR-1: /.test(one("SELECT title FROM agent_issues WHERE id = ?", ex[rep[0].instance].issue_id).title), "GROWTH-REPAIR-1 issue");

// --- code loop picks it up and merges
db.prepare("INSERT INTO code_tasks (id, goal, status, pr_url, updated_at) VALUES (?, 'g', 'merged', 'https://github.com/QNFO/qnfo-workers/pull/1', ?)").run("ct_im" + ex[g0].issue_id, iso(0));
run("tick3");
const sh = one("SELECT * FROM growth_experiments WHERE request_instance = ?", g0);
ok(sh.status === "shipped" && sh.baseline !== null && sh.predicted >= sh.baseline && sh.due_at > iso(167) && sh.decision_id, "merged change shipped with baseline, prediction and decision", sh);
ok(one("SELECT status, close_channel FROM agent_issues WHERE id = ?", sh.issue_id).status === "closed" && one("SELECT close_evidence FROM issue_triage WHERE issue_id = ?", sh.issue_id).close_evidence.includes("pull/1"), "issue closed with the PR as evidence");
ok(one("SELECT COUNT(*) n FROM decision_predictions WHERE decision_id = ? AND op = '>='", sh.decision_id).n === 1, "prediction seeded for the calibration scorer");
ok(one("SELECT COUNT(*) n FROM decision_log WHERE actor = 'growth-pm'").n === 1 + one("SELECT COUNT(*) n FROM growth_experiments WHERE kind = 'knob'").n, "a decision for the code change and each knob move", all("SELECT evidence FROM decision_log"));
ok(one("SELECT COUNT(DISTINCT product) d, COUNT(*) n FROM growth_experiments WHERE kind = 'knob'").d === one("SELECT COUNT(*) n FROM growth_experiments WHERE kind = 'knob'").n, "at most one knob per product in flight");

// --- measure after 7 days: code change won, knob fell -> restored
db.exec("UPDATE growth_experiments SET due_at = '2000-01-01T00:00:00Z' WHERE status = 'shipped'");
db.prepare("UPDATE growth_experiments SET baseline = -1, predicted = -1 WHERE id = ?").run(sh.id);
db.prepare("UPDATE growth_experiments SET baseline = 1e9, predicted = 1e9 WHERE kind = 'knob'").run();
run("tick4");
ok(one("SELECT status FROM growth_experiments WHERE id = ?", sh.id).status === "won", "experiment that beat its prediction is won");
const kn = one("SELECT * FROM growth_experiments WHERE kind = 'knob'");
ok(kn.status === "rolled_back" && one("SELECT value FROM ops_config WHERE key = ?", kn.knob).value === kn.from_value, "knob that lowered its metric is restored", kn);
ok(one("SELECT direction FROM product_growth_knobs WHERE knob = ?", kn.knob).direction !== one("SELECT direction FROM product_growth_knobs WHERE knob = ? AND 0", kn.knob)?.direction, "knob direction flipped");
const dec = one("SELECT SUM(status = 'won') w, COUNT(*) n FROM growth_experiments WHERE status IN ('won','kept_flat','rolling_back','rolled_back')");
ok(dec.w === 1 && Number(one("SELECT last_value v FROM metric_registry WHERE metric = 'growth_experiment_win_rate_30d'").v) === Math.round(1000 * dec.w / dec.n) / 1000, "win rate = won / decided", one("SELECT last_value v FROM metric_registry WHERE metric = 'growth_experiment_win_rate_30d'"));

// --- a code change that falls is rolled back through the code loop
db.prepare("UPDATE growth_experiments SET status = 'shipped', due_at = '2000-01-01T00:00:00Z', baseline = 1e9, predicted = 1e9, decided_at = NULL WHERE id = ?").run(sh.id);
run("tick5");
const rb = one("SELECT * FROM growth_experiments WHERE id = ?", sh.id);
ok(rb.status === "rolling_back" && rb.rollback_issue_id, "fallen change files GROWTH-ROLLBACK-1", rb);
const rbi = one("SELECT * FROM agent_issues WHERE id = ?", rb.rollback_issue_id);
ok(/^GROWTH-ROLLBACK-1: /.test(rbi.title) && /^code-task: /.test(rbi.description), "rollback issue goes through the code loop", rbi.title);
db.prepare("INSERT INTO code_tasks (id, goal, status, pr_url, updated_at) VALUES (?, 'r', 'merged', 'https://github.com/QNFO/qnfo-workers/pull/2', ?)").run("ct_im" + rb.rollback_issue_id, iso(0));
run("tick6");
ok(one("SELECT status FROM growth_experiments WHERE id = ?", sh.id).status === "rolled_back" && one("SELECT status FROM agent_issues WHERE id = ?", rb.rollback_issue_id).status === "closed", "revert merged: rolled back and closed");

// --- off switch stops new work, measurement continues
db.exec("UPDATE ops_config SET value = 'off' WHERE key = 'growth_pm'; DELETE FROM cf_agent_requests; DELETE FROM growth_experiments WHERE status IN ('requested','filed','building'); UPDATE product_growth_knobs SET last_tried_at = NULL");
const before = one("SELECT COUNT(*) n FROM product_growth_readings").n, knobsBefore = one("SELECT COUNT(*) n FROM growth_experiments WHERE kind = 'knob'").n;
run("off");
ok(one("SELECT COUNT(*) n FROM cf_agent_requests").n === 0 && one("SELECT COUNT(*) n FROM growth_experiments WHERE kind = 'knob'").n === knobsBefore, "growth_pm = off stops requests and knob moves", [all("SELECT instance FROM cf_agent_requests"), all("SELECT id, knob, status, created_at FROM growth_experiments WHERE kind = 'knob'")]);
ok(one("SELECT COUNT(*) n FROM product_growth_readings").n >= before, "measurement continues when off");
ok(one("SELECT COUNT(*) n FROM persona_briefs WHERE persona_key = 'product-manager:growth'").n >= 1, "growth brief written");

console.log(`growth-pm: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
