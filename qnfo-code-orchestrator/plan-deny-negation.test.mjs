// PLAN-DENY-NEGATION-1 offline suite (agent_issues 1807): the issue planner refuses an issue that ASKS to change a cap, a
// secret or a deletion, and no longer refuses one whose advice FORBIDS it ("never raise a cap"). The texts below are the
// live analytics_metric_triggers.action rows (qnfo-audit, read 2026-10-02) and the issue's own definition of done.
// Real SQL (node:sqlite behind a D1-shaped shim), scripted model, scripted GitHub raw reads; the planner runs end to end.
// Run: node --no-warnings qnfo-code-orchestrator/plan-deny-negation.test.mjs   (exit 0 = all passed)
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(path.join(here, "worker.js")).href)).default;

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? "  -- " + JSON.stringify(x).slice(0, 400) : "")); } };

function makeD1() {
  const db = new DatabaseSync(":memory:");
  const wrap = (sql) => {
    let args = [];
    const st = {
      bind: (...a) => { args = a.map((v) => (v === undefined ? null : v)); return st; },
      run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
      first: async () => db.prepare(sql).get(...args) || null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
    };
    return st;
  };
  db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
    CREATE TABLE service_registry (service TEXT PRIMARY KEY, state TEXT, kind TEXT, base_url TEXT);
    CREATE TABLE cloud_ops_events (id TEXT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
  for (const n of ["q08-signal-engine", "qnfo-social", "qnfo-cloud-ops", "qnfo-fleet-control", "qnfo-ai"]) db.prepare("INSERT INTO service_registry VALUES (?, 'live', 'worker', '')").run(n);
  return { prepare: wrap, _db: db };
}
const Q08 = ["var VERSION = \"0.7.37\";", "async function handle(req, env) {", "  if (path === \"/api/f\") {", "    return recordVote(req, env);", "  }", "}"].join("\n");
const FILES = { "q08-signal-engine/worker.js": Q08, "qnfo-social/worker.js": "function post() {\n  return 1;\n}", "qnfo-cloud-ops/worker.js": "function jobOutreach() {\n  return 1;\n}" };
globalThis.fetch = async (u) => {
  const m = /raw\.githubusercontent\.com\/QNFO\/qnfo-workers\/main\/(.+)$/.exec(String(u));
  const p = m ? decodeURIComponent(m[1]) : null;
  if (p && FILES[p] != null) return new Response(FILES[p], { status: 200 });
  return new Response("nf", { status: 404 });
};
const GOAL = "Directly after the anchor line add a check that returns HTTP 405 for any method other than POST, and changes nothing else in the file.";
const NOT_CODE = JSON.stringify({ code_fixable: false, reason: "scripted: not a one-file change" });
const FIX = (goal) => JSON.stringify({ code_fixable: true, reason: "one guard", anchor: '  if (path === "/api/f") {', goal: goal || GOAL });
// One issue in a fresh database, one planner call; returns the recorded plan and how many model calls were made.
async function planOne(title, description, reply) {
  const prompts = [];
  const env = { ORCH_TOKEN: "t0ken", AUDIT_DB: makeD1(), AI: { run: async (model, input) => { prompts.push(input); return { response: reply || NOT_CODE }; } } };
  env.AUDIT_DB._db.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at) VALUES (?, ?, 'qnfo-fleet-control', 'reliability', 'high', 'open', ?)").run(title, description, Date.now() - 3600e3);
  const r = await (await worker.fetch(new Request("https://x/v1/plan", { method: "POST", headers: { authorization: "Bearer t0ken" } }), env)).json();
  const p = env.AUDIT_DB._db.prepare("SELECT * FROM issue_plans").get() || {};
  const t = env.AUDIT_DB._db.prepare("SELECT * FROM code_tasks").all();
  return { r, outcome: p.outcome, detail: p.detail, modelCalls: prompts.length, tasks: t };
}
// The live remedies (analytics_metric_triggers.action, read 2026-10-02 from qnfo-audit), verbatim.
const LIVE = {
  353: "Pillar cost. Billed unified AI spend (analytics_dash_meta.unified_cost_usd_30d) is above the owner's $150/30d threshold. Measured 2026-10-02 (METRIC-VALIDITY-1): the fleet's own routers hold almost none of it (ai_spend_ledger non-Workers-AI spend $0.03 in 30 days; qnfo-ops ladder tier 3 $0.02); the $224.55 was openai $197.78 (a gpt-5.5 agent-session burst on 2026-09-26, ages out about 2026-10-26, FLEET-RUN-RATE-1) and anthropic $25.96, traffic that reaches the gateway from clients and sessions, not from a worker. First re-read the split (metric_registry.cost_usd_30d source_of_truth lists it by provider) and ai_spend_ledger by caller. If a worker appears among the unified providers, move it to Workers AI or the cheap model and tighten costImpactGuard. Otherwise the lever is the owner's, decided on https://fleet.qnfo.org (INVEST-DECISION-1): the gateway spend limit (gateway_cap_30d_usd) and which clients may bill the gateway credit. Never raise a cap to clear this. Definition of done: unified_cost_usd_30d <= 150 in analytics_dash_meta; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).",
  406: "Pillar reach. Fewer than 2 people replied positively or wrote in first in 30 days. Levers, in order: (1) is outreach sending at all (qnfo-outreach pipeline_state.external_sends_enabled, outreach_queue rows with an address, the shared cap not exhausted by self-checks)? (2) are positive replies being answered: email_reply_queue rows with decision escalate and no draft_text are conversations the fleet let lapse; author the replies through the owner-voice gates; (3) are the selected works reachable from every outreach mail and post (docs/STRATEGY.md s2.4), so a reader has a reason to write; (4) apply the outreach_reply_rate_30d levers. Never buy attention or raise a cap. Definition of done: the metric is back inside its threshold in metric_registry; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).",
  404: "Pillar reach. social_engagement_rate_30d is under 0.2 engagements per post (twice the 2026-10-01 baseline). Read GET https://qnfo-social.q08.workers.dev/learner and act on what it shows: (1) recent posts all no-data: the engagement collector is not snapshotting post ids (WATCHMAKER social-engagement, social_engagements rows per post_uri); fix collection first, the learner cannot learn without it. (2) The learner is off (enabled false) or its weekly update stalled (cloud_ops_events social-learner-update-*): turn ops_config social_learner_enabled back on or restart the update. (3) The queue holds only non-arm rows (pillar 4 or unlisted topics, see pending and the decision events): have the composer queue posts for the selected works (STRATEGY 2.4), each with its claim, test and status lines and a UTM link. (4) The posterior favours a topic or format the queue lacks (next_week_allocation): compose that kind of post for a selected work. Never raise SOCIAL_WEEKLY_CAP, never post outside the owner-voice gates, never buy attention. Definition of done: social_engagement_rate_30d in metric_registry is back at 0.2 or more; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).",
  383: "Pillar autonomy. Fixes are being recorded that their own probes do not confirm. Run: SELECT r.issue_id, r.class, r.expected, r.observed FROM remediation_verifications r JOIN (SELECT MAX(id) mid FROM remediation_verifications WHERE replace(substr(verified_at,1,19),'T',' ') >= datetime('now','-7 days') GROUP BY COALESCE(CAST(issue_id AS TEXT), class)) g ON g.mid = r.id WHERE r.pass = 0. Reopen each issue that is closed while its latest probe fails, and re-fix or correct the probe with evidence; never delete a failing verification row. Definition of done: the metric is back inside its threshold in metric_registry; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).",
};
// The issue as qnfo-fleet-control evaluateMetricTriggers files it (prose sliced to 300 characters) and as a session copies it.
const filed = (id, key, v, op, thr, owner) => "METRIC-TRIGGER #" + id + " " + key + "=" + v + " " + op + " " + thr + " -> " + LIVE[id].replace(/\s+/g, " ").trim().slice(0, 300) + " (owner " + owner + ", target agent_issues)";

// 1. prohibitions are not requests: the live remedies reach the planner's model instead of being refused
{
  const cases = [
    ["1a unified_cost_usd_30d (#353, 'Never raise a cap to clear this.') q08-signal-engine", "METRIC-TRIGGER-353-UNIFIED-COST-USD-30D: Cost gap", LIVE[353] + " Candidate: q08-signal-engine."],
    ["1b warm_conversations_30d (#406, 'Never buy attention or raise a cap.')", "METRIC-TRIGGER-406-WARM-CONVERSATIONS-30D: reach gap", LIVE[406] + " Candidate: qnfo-cloud-ops."],
    ["1c social_engagement_rate_30d (#404, 'Never raise SOCIAL_WEEKLY_CAP')", "METRIC-TRIGGER-404-SOCIAL-ENGAGEMENT-RATE-30D: engagement", LIVE[404] + " qnfo-social"],
    ["1d remediation_latest_pass_pct_7d (#383, 'never delete a failing verification row')", "METRIC-TRIGGER-383-REMEDIATION: probes fail", LIVE[383] + " qnfo-social"],
    ["1e the issue as filed by evaluateMetricTriggers (#353, 300-char slice)", "METRIC-TRIGGER-353-UNIFIED-COST-USD-30D: Cost gap", filed(353, "unified_cost_usd_30d", 224.55, "gt", 150, "human") + " q08-signal-engine"],
    ["1f the issue 1794 text as filed on 2026-10-02 ('...; never raise a (owner')", "METRIC-TRIGGER-353-UNIFIED-COST-USD-30D: Cost gap: billed unified AI spend over the owner's $150/30d threshold", "METRIC-TRIGGER #353 unified_cost_usd_30d=224.55 gt 150 -> Pillar cost. Billed unified AI spend (analytics_dash_meta.unified_cost_usd_30d) is above the owner's $150/30d threshold. Find the top callers in ai_spend_ledger by caller and model, move bread-and-butter calls to the free Workers AI tier or the cheap model, and tighten costImpactGuard; never raise a cap (owner qnfo-fleet-control, target agent_issues) q08-signal-engine"],
    ["1g 'do not rotate or revoke the secret'", "METRIC-TRIGGER-9-Q08: q08-signal-engine counts GET votes", "q08-signal-engine counts GET votes in /api/f; accept POST only. Do not rotate or revoke the secret, and change nothing else."],
    ["1h \"don't\", 'must not', 'without' and 'no' prohibitions", "METRIC-TRIGGER-9-Q08: q08-signal-engine counts GET votes", "q08-signal-engine counts GET votes in /api/f. Don’t raise the cap; the fix must not delete the vote rows; it needs no new api key and works without a credential."],
  ];
  for (const [name, title, desc] of cases) {
    const x = await planOne(title, desc);
    ok(x.outcome && x.outcome !== "refused" && x.modelCalls === 1, name + ": planned, not refused", x);
  }
  // the issue's own definition of done: planned into a code task
  const d = await planOne("METRIC-TRIGGER-353-UNIFIED-COST-USD-30D: q08-signal-engine cost", "Pillar cost. Route to the cheap model; never raise a cap. q08-signal-engine /api/f", FIX());
  ok(d.outcome === "queued" && d.tasks.length === 1 && d.tasks[0].path === "q08-signal-engine/worker.js", "1i DoD: 'Pillar cost. Route to the cheap model; never raise a cap.' is planned into a code task", d);
}
// 2. real requests are still refused, with no model call, and the refusal names the phrase that caused it
{
  const cases = [
    ["2a 'Raise the cap to $300' (the issue's DoD)", "Pillar cost. q08-signal-engine runs out of budget. Raise the cap to $300."],
    ["2b 'raise the cap to' after a prohibition in another sentence", "Pillar cost. Never raise a cap without the owner. Then raise the cap to $300 for q08-signal-engine."],
    ["2c 'rotate the secret'", "q08-signal-engine /api/f leaks; rotate the secret ROUTER_AUTH_KEY."],
    ["2d 'delete the worker'", "q08-signal-engine is unused; delete the worker and its routes."],
    ["2e 'Never raise a cap; rotate the secret.' (only the first is negated)", "q08-signal-engine: never raise a cap; rotate the secret."],
    ["2f \"don't forget to rotate the secret\" (a reversed negation is a request)", "q08-signal-engine: don't forget to rotate the secret after the fix."],
    ["2g 'never fail to delete the stale rows'", "q08-signal-engine must never fail to delete the stale rows each night."],
    ["2h 'no later than Friday rotate the api key'", "q08-signal-engine: no later than Friday rotate the api key."],
    ["2i 'whether or not' negates nothing", "q08-signal-engine: decide whether or not to rotate the key in /api/f"],
    ["2j a negation in an earlier clause does not cover a request ('do not wait: raise the cap')", "q08-signal-engine is starved. Do not wait: raise the cap to 300."],
    ["2k 'and' ends the prohibition ('change no code and drop table')", "q08-signal-engine: change no code and drop table q08_feedback"],
    ["2l the existing refusal text", "rotate the api key and raise the cap"],
  ];
  for (const [name, desc] of cases) {
    const x = await planOne("METRIC-TRIGGER-6-Y: q08-signal-engine", desc);
    ok(x.outcome === "refused" && x.modelCalls === 0 && x.tasks.length === 0 && /secrets, caps or deletions/.test(String(x.detail)), name + ": refused without a model call", x);
  }
}
// 3. the model's goal is still held to the strict rule: a goal that mentions a cap at all is not enqueued
{
  const x = await planOne("METRIC-TRIGGER-9-Q08: q08-signal-engine counts GET votes", "q08-signal-engine counts GET votes in /api/f; accept POST only", FIX(GOAL + " Never raise the cap."));
  ok(x.outcome === "invalid" && x.tasks.length === 0 && /touches secrets\/caps\/deletions/.test(String(x.detail)), "3 a model goal that mentions a cap is still invalid", x);
}
console.log("plan-deny-negation: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
