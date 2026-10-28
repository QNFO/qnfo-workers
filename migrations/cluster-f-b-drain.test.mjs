// CLUSTER-F-B drain offline suite: replays migrations/2026-10-28-cluster-f-b-drain.sql on SQLite fixtures.
// Proves: the 18 PAPER-LEARN-1 learnings are each settled with a PL-TRIAGE-1 note (so the five closing probes read 0) and rows of other versions or
// already settled are untouched; ten contracts carry a probe that is one read-only SELECT, reads its expected value on a healthy fixture and something else
// on a broken one; two regeneration rows are queued once; the code task of 1000477 is relabelled; a second apply changes nothing; the Rollback line restores.
// Asserts no live state (only fixtures). Run: node --no-warnings migrations/cluster-f-b-drain.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-28-cluster-f-b-drain.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x === undefined ? "" : " :: " + JSON.stringify(x).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
ok(!/[^\x00-\x7F]/.test(sql), "the file is ASCII only (D1-WRITE-ASCII-1)");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- BACKUP: bak_20261028_cfb_paper_learnings$/m.test(sql), "opt-in, DB and BACKUP headers");

const LEARN = [5508, 5509, 5510, 5511, 5512, 5513, 5581, 5586, 5570, 5571, 5572, 5573, 5574, 5575, 5576, 5589, 5526, 5527];
const CONTRACTS = {
  "issue-1000594": 1000594, "issue-1000593": 1000593, "issue-1000569": 1000569, "issue-1000502": 1000502, "issue-1000694": 1000694,
  "issue-1000705": 1000705, "issue-1000701": 1000701, "issue-2373": 2373, "issue-100488": 100488, "issue-1000152": 1000152,
};
const S1 = "a-unified-framework-for-superdeterminism-neurobiology-and-the-mechanics-of-human-meaning";
const S2 = "simulation-inconsistency-detection-via-neurobiological-and-cognitive-interfaces";

function build() {
  const d = new DatabaseSync(":memory:");
  d.exec(`CREATE TABLE paper_learnings (id INTEGER PRIMARY KEY, slug TEXT, version TEXT, claim TEXT, applicability TEXT, fleet_status TEXT DEFAULT 'proposed', status_note TEXT, issue_id INTEGER, updated_at TEXT);
    CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, ts TEXT, status TEXT, verify_probe TEXT, verify_transport TEXT, last_verdict TEXT, module TEXT, attempts INTEGER, max_attempts INTEGER, deferred_since TEXT, next_due_at TEXT, escalate_to TEXT, expected_cadence_h INTEGER);
    CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, status TEXT, description TEXT);
    CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, close_evidence TEXT);
    CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT, paper_slug TEXT, created_at TEXT, stage TEXT, attempt INTEGER, revise_count INTEGER, recover_count INTEGER);
    CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
    CREATE TABLE model_ladder_models (id TEXT PRIMARY KEY, active INTEGER);
    CREATE TABLE cf_model_evals (id INTEGER PRIMARY KEY AUTOINCREMENT, model_id TEXT, battery_version TEXT, verdict TEXT, run_ts TEXT);
    CREATE TABLE routing_capability (model TEXT, task_class TEXT, tool_call_ok INTEGER);
    CREATE TABLE papers (slug TEXT, status TEXT, version TEXT, body_md TEXT);
    CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT);
    CREATE TABLE email_reply_queue (id INTEGER PRIMARY KEY, created_at TEXT, human_score INTEGER, decision TEXT, tier TEXT, draft_proposed TEXT);
    CREATE TABLE subscribers (id INTEGER PRIMARY KEY, confirmed_at TEXT);
    CREATE TABLE owner_prompts (id TEXT, ts TEXT);
    CREATE TABLE human_actions (id INTEGER PRIMARY KEY, slug TEXT, status TEXT);
    CREATE TABLE service_registry (service TEXT, state TEXT);`);
  for (const id of LEARN) d.prepare("INSERT INTO paper_learnings (id, slug, version, claim, applicability, status_note) VALUES (?, 's', 'v', 'c', 'direct', 'PL-TRIAGE-1 apply (one model)')").run(id);
  d.prepare("INSERT INTO paper_learnings (id, slug, version, claim, applicability) VALUES (9001, 's', 'other', 'c', 'direct')").run();
  d.prepare("INSERT INTO paper_learnings (id, slug, version, claim, applicability, fleet_status, status_note) VALUES (9002, 's', 'v', 'c', 'direct', 'applied', 'by hand')").run();
  for (const [cls, iid] of Object.entries(CONTRACTS)) d.prepare("INSERT INTO remediation_contracts (class, issue_id, status, verify_probe, verify_transport, last_verdict, module, attempts, max_attempts) VALUES (?, ?, 'superseded', 'SELECT 1', 'd1-query', 'fail', 'probe-template-v3-generic', 9, 3)").run(cls, iid);
  d.prepare("INSERT INTO agent_issues (id, status, description) VALUES (1000477, 'open', 'text\nsession-task: repo=qnfo-workers path=qnfo-research-exec/worker.js\ncode-anchor: x')").run();
  return d;
}
function healthy(d) {
  for (const m of ["@cf/google/gemma-4-26b-a4b-it", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/zai-org/glm-4.7-flash"]) {
    d.prepare("INSERT INTO model_ladder_models (id, active) VALUES (?, 1)").run(m);
    d.prepare("INSERT INTO cf_model_evals (model_id, battery_version, verdict, run_ts) VALUES (?, 'cfmb-2', 'keep', '2026-10-20 00:00:00')").run(m);
    d.prepare("INSERT INTO cf_model_evals (model_id, battery_version, verdict, run_ts) VALUES (?, 'cfmb-2', 'promote', '2026-10-27 00:00:00')").run(m);
    d.prepare("INSERT INTO routing_capability (model, task_class, tool_call_ok) VALUES (?, 'tool-call-single', 1)").run(m);
  }
  d.prepare("INSERT INTO agent_issues (id, status, description) VALUES (100596, 'closed', 'x')").run();
  d.prepare("INSERT INTO issue_triage (issue_id, close_evidence) VALUES (100596, 'Per-task disposition, measured')").run();
  d.prepare("INSERT INTO papers (slug, status, version, body_md) VALUES ('p1', 'published', '2.0.0', '# T' || char(10) || '## Abstract' || char(10) || 'text')").run();
  d.prepare("INSERT INTO papers (slug, status, version, body_md) VALUES (?, 'published', '2.0.0', '# Title' || char(10) || char(10) || '## Abstract' || char(10) || 'real text')").run(S1);
  d.prepare("INSERT INTO papers (slug, status, version, body_md) VALUES (?, 'published', '2.1.0', '# Title two' || char(13) || char(10) || '## Abstract' || char(10) || 'real text')").run(S2);
  d.prepare("INSERT INTO metric_registry (metric, last_value, last_refreshed) VALUES ('indexed_surface', '715', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))").run();
  d.prepare("INSERT INTO metric_registry (metric, last_value, last_refreshed) VALUES ('seo_indexnow_engines_ok', '3', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 days'))").run();
  for (let i = 1; i <= 4; i++) d.prepare("INSERT INTO email_reply_queue (id, created_at, human_score, decision, tier, draft_proposed) VALUES (?, '2026-10-20 10:00:00', 3, 'open', ?, ?)").run(i, i % 2 ? "2" : "1", i % 2 ? "draft" : null);
  d.prepare("INSERT INTO human_actions (id, slug, status) VALUES (190, 'attest-first-credibility-event', 'dismissed')").run();
  d.prepare("INSERT INTO owner_prompts (id, ts) VALUES ('op-mvihv5rr376f', '2026-10-25 10:00:00')").run();
}
const d = build();
healthy(d);
const nLog0 = d.prepare("SELECT COUNT(*) n FROM decision_log").get().n;
d.exec(sql);
const row = (id) => d.prepare("SELECT * FROM paper_learnings WHERE id = ?").get(id);
const want = {
  "already-in-place": [5508, 5511, 5512, 5574, 5575, 5576, 5589, 5526],
  rejected: [5509, 5510, 5513, 5581, 5586, 5570, 5571, 5527],
  routed: [5572, 5573],
};
let n = 0;
for (const [st, ids] of Object.entries(want)) for (const id of ids) {
  n++;
  const r = row(id);
  ok(r.fleet_status === st && /^PL-TRIAGE-1 /.test(r.status_note) && r.status_note.includes("session-cluster-f-b") && r.status_note.length > 120 && r.status_note.length <= 700, "learning " + id + " is " + st + " with a note", r);
  if (st === "rejected") ok(/\(session-cluster-f-b, 2026-10-28; (?:analogy-only|keyword-proxy|ensemble-review|no-fleet-quantity)\)/.test(r.status_note), "learning " + id + " names why or what reopens it");
  if (st === "routed") ok(/agent_issues 1000459/.test(r.status_note), "learning " + id + " names the successor issue");
}
ok(n === 18 && n === LEARN.length, "every learning has a disposition", n);
ok(d.prepare("SELECT COUNT(*) n FROM paper_learnings WHERE applicability = 'direct' AND fleet_status = 'proposed' AND id IN (" + LEARN.join(",") + ")").get().n === 0, "no learning of the five papers is left proposed");
ok(row(9001).fleet_status === "proposed" && row(9002).status_note === "by hand", "another version and a settled row are untouched");

// contracts
for (const [cls, iid] of Object.entries(CONTRACTS)) {
  const c = d.prepare("SELECT * FROM remediation_contracts WHERE class = ?").get(cls);
  ok(c.module === "cluster-f-b-real-probe" && c.status === "active" && c.last_verdict === null && c.attempts === 0, cls + " is re-armed", c);
  ok(/^SELECT /.test(c.verify_probe) && !/;/.test(c.verify_probe) && !/\b(insert|update|delete|drop|alter)\s/i.test(c.verify_probe), cls + " probe is one read-only SELECT");
  ok(!new RegExp("FROM agent_issues WHERE id = " + iid + "\\b").test(c.verify_probe), cls + " probe does not read its own issue status");
  const r = d.prepare(c.verify_probe).get();
  ok(r.observed === r.expected, cls + " reads its expected value on a healthy fixture", r);
}
ok(d.prepare("SELECT verify_transport t FROM remediation_contracts WHERE class = 'issue-1000694'").get().t === "d1-query@living-paper" && d.prepare("SELECT verify_transport t FROM remediation_contracts WHERE class = 'issue-1000701'").get().t === "d1-query@living-paper", "paper probes run on living-paper");
const probe = (cls) => d.prepare(d.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = ?").get(cls).p).get();
const differs = (cls, why) => { const r = probe(cls); ok(r.observed !== r.expected, cls + " does not read ok when " + why, r); };
// break one thing at a time and put it back
const flip = (setSql, undoSql, cls, why) => { d.exec(setSql); differs(cls, why); d.exec(undoSql); const r = probe(cls); ok(r.observed === r.expected, cls + " recovers", r); };
flip("UPDATE model_ladder_models SET active = 0 WHERE id LIKE '%gemma%'", "UPDATE model_ladder_models SET active = 1", "issue-1000594", "the ladder row is inactive");
flip("UPDATE cf_model_evals SET verdict = 'keep'", "UPDATE cf_model_evals SET verdict = 'promote' WHERE run_ts = '2026-10-27 00:00:00'", "issue-1000593", "the newest verdict is not promote");
flip("UPDATE routing_capability SET tool_call_ok = 0", "UPDATE routing_capability SET tool_call_ok = 1", "issue-1000569", "no tool-call canary passed");
flip("UPDATE agent_issues SET status = 'open' WHERE id = 100596", "UPDATE agent_issues SET status = 'closed' WHERE id = 100596", "issue-1000502", "100596 is open");
flip("UPDATE papers SET body_md = '---' || char(10) || 'title: x' || char(10) || '---' || char(10) || body_md WHERE slug = 'p1'", "UPDATE papers SET body_md = '# T' || char(10) || '## Abstract' || char(10) || 'text' WHERE slug = 'p1'", "issue-1000694", "a revised paper starts with front matter");
flip("UPDATE papers SET body_md = '# T' || char(10) || 'x' || char(10) || '# T' || char(10) || 'y' WHERE slug = 'p1'", "UPDATE papers SET body_md = '# T' || char(10) || '## Abstract' || char(10) || 'text' WHERE slug = 'p1'", "issue-1000694", "a revised paper repeats its title line");
flip("UPDATE papers SET body_md = '**TOPIC COMPLEXITY ASSESSMENT**' || char(10) || '## Abstract' WHERE slug = '" + S1 + "'", "UPDATE papers SET body_md = '# Title' || char(10) || char(10) || '## Abstract' || char(10) || 'real text' WHERE slug = '" + S1 + "'", "issue-1000701", "an outline paper is still an outline");
flip("UPDATE metric_registry SET last_value = '600' WHERE metric = 'indexed_surface'", "UPDATE metric_registry SET last_value = '715' WHERE metric = 'indexed_surface'", "issue-1000705", "the indexed surface is below the published set");
flip("UPDATE metric_registry SET last_refreshed = '2026-01-01T00:00:00Z' WHERE metric = 'seo_indexnow_engines_ok'", "UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')", "issue-1000705", "IndexNow was last checked long ago");
flip("UPDATE email_reply_queue SET tier = NULL WHERE id = 4", "UPDATE email_reply_queue SET tier = '1' WHERE id = 4", "issue-2373", "a reply row is untiered");
flip("UPDATE email_reply_queue SET draft_proposed = NULL WHERE id = 1", "UPDATE email_reply_queue SET draft_proposed = 'draft' WHERE id = 1", "issue-2373", "a tier-2 row has no draft");
flip("UPDATE human_actions SET status = 'open'", "UPDATE human_actions SET status = 'dismissed'", "issue-100488", "the owner card is undecided");
flip("DELETE FROM decision_log WHERE action LIKE 'CLUSTER-F-B-1000152:%'", "INSERT INTO decision_log (actor, action) VALUES ('t', 'CLUSTER-F-B-1000152: restored')", "issue-1000152", "the decision is not recorded");
d.exec("INSERT INTO service_registry (service, state) VALUES ('qnfo-skill-sync', 'live')");
differs("issue-1000152", "the owner worker is live");
d.exec("DELETE FROM service_registry");

// queue rows, relabel, decision, idempotence
const q = d.prepare("SELECT * FROM research_queue ORDER BY id").all();
ok(q.length === 2 && q.every((r) => r.source === "remediation" && r.status === "queued" && r.stage === "ground" && /^revision:.+@\d+\.\d+\.\d+#1$/.test(r.source_id)) && q.map((r) => r.paper_slug).sort().join() === [S1, S2].sort().join(), "two remediation rows are queued in the loop shape", q.map((r) => r.id));
ok(q.every((r) => /write it from scratch/.test(r.idea) && !/[^\x00-\x7F]/.test(r.idea)), "the brief asks for a full rewrite");
const desc = d.prepare("SELECT description FROM agent_issues WHERE id = 1000477").get().description;
ok(/\ncode-task: repo=qnfo-workers path=qnfo-research-exec\/worker\.js\n/.test(desc) && !/session-task:/.test(desc) && /code-anchor: x/.test(desc), "1000477 now hands the code loop its task line", desc);
ok(d.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'CLUSTER-F-B-1000152:%'").get().n >= 1, "the decision is logged");
const snap = () => JSON.stringify([d.prepare("SELECT id, fleet_status, status_note FROM paper_learnings ORDER BY id").all(), d.prepare("SELECT class, verify_probe, module FROM remediation_contracts ORDER BY class").all(), d.prepare("SELECT id FROM research_queue ORDER BY id").all(), d.prepare("SELECT description FROM agent_issues ORDER BY id").all()]);
const before = snap(), logBefore = d.prepare("SELECT COUNT(*) n FROM decision_log").get().n;
d.exec(sql);
ok(snap() === before && d.prepare("SELECT COUNT(*) n FROM decision_log").get().n === logBefore, "a second apply changes nothing and logs no second decision");
d.exec(rollback);
ok([5508, 5509, 5572, 5527].every((id) => row(id).fleet_status === "proposed" && row(id).status_note === "PL-TRIAGE-1 apply (one model)"), "Rollback returns the learnings to proposed with their earlier note");
ok(Object.keys(CONTRACTS).every((c) => d.prepare("SELECT verify_probe p, status s, module m FROM remediation_contracts WHERE class = ?").get(c).p === "SELECT 1" && d.prepare("SELECT status s FROM remediation_contracts WHERE class = ?").get(c).s === "superseded"), "Rollback restores the ten contracts");
ok(d.prepare("SELECT COUNT(*) n FROM research_queue").get().n === 0, "Rollback removes the queued rows");
ok(/session-task:/.test(d.prepare("SELECT description FROM agent_issues WHERE id = 1000477").get().description), "Rollback restores the 1000477 text");
ok(row(9002).status_note === "by hand", "Rollback leaves a row someone else settled");
void nLog0;
console.log("cluster-f-b-drain: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
