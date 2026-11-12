import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-11-12-product-rd.sql", import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, definition TEXT, version INT, updated_at TEXT);
INSERT INTO fleet_tasks VALUES ('domain-managers', '{"steps":[{"name":"x"}]}', 1, NULL);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE metric_registry (metric TEXT, last_value TEXT, last_refreshed TEXT, state TEXT);
CREATE TABLE product_registry (product TEXT PRIMARY KEY, host TEXT, worker TEXT, program_code TEXT, what_for TEXT, usage_metric TEXT, quality_measure TEXT, state TEXT DEFAULT 'active');
CREATE TABLE program_charters (program_code TEXT, status TEXT);
CREATE TABLE cf_agent_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, requester TEXT, kind TEXT, prompt TEXT, instance TEXT, priority TEXT, status TEXT DEFAULT 'queued', result TEXT, created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
CREATE TABLE roadmap_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, program_code TEXT, request_instance TEXT UNIQUE, title TEXT, rationale TEXT, path TEXT, anchor_line TEXT, status TEXT DEFAULT 'proposed', issue_id INT, task_id TEXT, pr_url TEXT, outcome TEXT, deployed_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE persona_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT CURRENT_TIMESTAMP, persona_key TEXT, kind TEXT, issue_id INT, from_value TEXT, to_value TEXT, evidence TEXT, reverted_at TEXT);
INSERT INTO program_charters VALUES ('QNFO.RSCH','active'),('QNFO.OPS','active');
INSERT INTO metric_registry VALUES ('engaged_reader_sessions_7d','10',NULL,NULL),('worker_requests_7d','500',NULL,NULL);
INSERT INTO product_registry (product, host, worker, program_code, what_for, usage_metric, quality_measure) VALUES
 ('papers','papers.qnfo.org','qnfo-gateway','QNFO.RSCH','reading room','worker_requests_7d','engaged_reader_sessions_7d'),
 ('ops-executor','ops.qnfo.org','qnfo-ops','QNFO.OPS','executor','worker_requests_7d',NULL);
`);
db.exec(sql); db.exec(sql);
const steps = JSON.parse(db.prepare("SELECT definition FROM fleet_tasks WHERE id='domain-managers'").get().definition).steps;
const names = steps.map(s => s.name);
assert.deepEqual(names.slice(1), ["pr-usage","pr-compete-ask","pr-compete-parse","pr-experiment-propose","pr-experiment-open","pr-experiment-track","pr-experiment-deployed","pr-experiment-decide","pr-experiment-revert","pr-experiment-log"]);
const run = () => { for (const s of steps.slice(1)) db.exec(s.sql); };
const one = (q) => db.prepare(q).get();
run();
assert.equal(one("SELECT COUNT(*) c FROM product_usage").c, 2);
assert.equal(one("SELECT COUNT(*) c FROM cf_agent_requests WHERE instance LIKE 'compete-%'").c, 1, "one research run per tick");
run();
assert.equal(one("SELECT COUNT(*) c FROM cf_agent_requests WHERE instance LIKE 'compete-%'").c, 1, "in flight blocks another");
const answer = (instance) => {
  const r = one("SELECT id FROM cf_agent_requests WHERE instance = '" + instance + "'");
  const result = `COMPETITOR: Alpha | https://alpha.example | better search | add facets | SOURCE: https://alpha.example/about
**COMPETITOR:** Beta | https://beta.example | faster | cache | SOURCE: https://beta.example/blog
COMPETITOR: Uncited | https://c.example | x | y | SOURCE: none`;
  db.prepare("UPDATE cf_agent_requests SET status='done', result=? WHERE id=?").run(result, r.id);
};
for (let i = 0; i < 2; i++) {
  const open = db.prepare("SELECT instance FROM cf_agent_requests WHERE instance LIKE 'compete-%' AND status='queued'").all();
  assert.equal(open.length, 1);
  answer(open[0].instance);
  run();
}
const prod = "papers";
const comps = db.prepare("SELECT competitor, source_url FROM product_competitors WHERE product=? ORDER BY competitor").all(prod);
assert.deepEqual(comps.map(c => c.competitor), ["Alpha", "Beta"], "uncited line dropped");
assert.equal(comps[0].source_url, "https://alpha.example/about");
run();
assert.equal(one("SELECT COUNT(*) c FROM product_competitors").c, 4, "reparse is idempotent");
// experiment proposal only for papers (ops-executor is control plane)
const exp = db.prepare("SELECT requester, instance, prompt FROM cf_agent_requests WHERE instance LIKE 'roadmap-%-pr-%'").all();
{
  assert.equal(exp.length, 1);
  assert.ok(exp[0].prompt.includes("Alpha (https://alpha.example/about)"));
  assert.ok(exp[0].prompt.includes("qnfo-gateway/worker.js"));
  assert.ok(!exp.some(e => e.instance.includes("ops-executor")));
  // the roadmap path turns the reply into a proposal
  db.prepare("INSERT INTO roadmap_proposals (program_code, request_instance, title, rationale, path, anchor_line) VALUES ('QNFO.RSCH', ?, 'R&D: papers: facets', 'why', 'qnfo-gateway/worker.js', 'code anchor: some unique anchor text here')").run(exp[0].instance);
  run();
  let e = one("SELECT * FROM product_experiments");
  assert.equal(e.product, "papers"); assert.equal(e.status, "proposed"); assert.equal(e.metric, "engaged_reader_sessions_7d"); assert.equal(e.baseline, 10);
  db.exec("UPDATE roadmap_proposals SET status='building'"); run();
  assert.equal(one("SELECT status s FROM product_experiments").s, "building");
  db.exec("UPDATE metric_registry SET last_value='12' WHERE metric='engaged_reader_sessions_7d'");
  db.exec("UPDATE roadmap_proposals SET status='deployed', pr_url='https://github.com/x/pull/1', deployed_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')"); run();
  e = one("SELECT * FROM product_experiments");
  assert.equal(e.status, "measuring"); assert.equal(e.baseline, 12); assert.equal(e.pr_url, "https://github.com/x/pull/1");
  run();
  assert.equal(one("SELECT status s FROM product_experiments").s, "measuring", "not decided before the window");
  // window passes, metric flat: reverted, revert goes onto the roadmap path
  db.exec("UPDATE product_experiments SET deployed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now','-8 days')"); run();
  e = one("SELECT * FROM product_experiments");
  assert.equal(e.status, "reverted"); assert.equal(e.lift_pct, 0);
  const rv = one("SELECT * FROM roadmap_proposals WHERE request_instance = 'revert-' || " + e.id);
  assert.equal(rv.status, "proposed"); assert.equal(rv.path, "qnfo-gateway/worker.js");
  assert.equal(one("SELECT COUNT(*) c FROM persona_actions WHERE kind='product-experiment'").c, 1);
  run();
  assert.equal(one("SELECT COUNT(*) c FROM persona_actions WHERE kind='product-experiment'").c, 1, "decision logged once");
  const v = one("SELECT * FROM v_product_research WHERE product='papers'");
  assert.equal(v.experiment_status, "reverted"); assert.equal(v.revert_status, "proposed"); assert.equal(v.competitors, 2);
  // a lift keeps the change
  db.exec("UPDATE product_experiments SET status='measuring', baseline=10, after_value=NULL, deployed_at=strftime('%Y-%m-%dT%H:%M:%SZ','now','-8 days')"); run();
  assert.equal(one("SELECT status s FROM product_experiments").s, "kept");
}
console.log("ok");
