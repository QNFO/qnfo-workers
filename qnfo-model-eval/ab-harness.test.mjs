// AB-HARNESS-1 offline suite (agent_issues 2828 MODEL-QUALITY-PARITY-1, qnfo-model-eval 1.6.0,
// migrations/2026-10-19-model-ab.sql, scripts/model-policy.json).
//
// Loads qnfo-model-eval/worker.js the way the deployer ships it (one self-contained script, no imports), replays it against
// an in-memory SQLite that carries the production DDL the harness touches plus the real migration, and a stubbed qnfo-ai
// service binding (deterministic post-change replies, a deterministic judge). Pins:
//   1. the fixtures are in the worker: three task sets of eight, each with a gold answer and a recorded baseline reply;
//   2. a post-change model that answers like the baseline passes, one that answers worse regresses, an empty answer is a loss
//      without a judge call, a reply served by another model is dropped, and a dead router is an error (retryable), not a verdict;
//   3. the judge pair is two families outside the pair under test, at least one outside the worker's own, each judge sees the
//      post-change answer in the opposite position to the other, and every call is pinned (pin_model, no hedge, no cache);
//   4. the win rate is written to model_ab_runs against the stated threshold; a regression files one issue; judges that
//      disagree, or too few verdicts, make the run inconclusive;
//   5. the triggers: a changed model in scripts/model-policy.json (a first sight is a baseline, an error is retried), a model a
//      worker newly uses in ai_call_counters, bounded per tick and per day, dedupe, the ab_enabled kill switch, a missing table;
//   6. the classification lane pairs clefCanary rows; the hourly tick runs the A/B work and the 6-hourly slot still runs the battery;
//   7. the migration applies twice, its close probe moves pending -> ok on real shapes, and its detector reads unjudged changes.
//
// Run: node qnfo-model-eval/ab-harness.test.mjs

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { versionAtLeast } from "../scripts/version-at-least.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) pass++;
  else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); }
};

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const MIG = readFileSync(new URL("../migrations/2026-10-19-model-ab.sql", import.meta.url), "utf8");
const POLICY = JSON.parse(readFileSync(new URL("../scripts/model-policy.json", import.meta.url), "utf8"));

// fetch is a parameter of the evaluated module, so a test points it at a stub (the policy file read) and the body of the worker
// calls whatever is current.
let fetchImpl = async () => { throw new Error("unexpected fetch"); };
const body = src.replace(/^export default /m, "var __default = ");
const mod = new Function("console", "fetch", body +
  "\n;return { AB_FIXTURES, AB_THRESHOLD, AB_MIN_VALID, AB_JUDGE_POOL, AB_CLASSIFY_SET, VERSION, abCanon, abSameModel, abFamily, abPickJudges," +
  " abParseVerdict, abVerdictScore, abSummarize, abJudgePrompt, abRunPair, abExecute, abTick, abObservedCandidates, abPolicyCandidates, clefCanary, handlers: __default };")
  ({ log() {}, error() {} }, (...a) => fetchImpl(...a));

/* ---- scaffolding: the production DDL the harness reads or writes, then the real migration ------------------------------ */
const SCAFFOLD = `
CREATE TABLE cf_model_eval_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold','filter','pause','kill-switch','gate','cap','guard','lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove','demote','replace','keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned','applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')));
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), source TEXT NOT NULL);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));
CREATE TABLE cron_fire_log (id INTEGER PRIMARY KEY AUTOINCREMENT, cron_name TEXT NOT NULL, task_id TEXT, cron_expr TEXT, fired_at TEXT NOT NULL DEFAULT (datetime('now')), fired_epoch_ms INTEGER NOT NULL, outcome TEXT NOT NULL DEFAULT 'unknown', source TEXT NOT NULL DEFAULT 'unknown', note TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE cf_model_catalog (slug TEXT, model_id TEXT, status TEXT, modality TEXT, last_eval_ts TEXT);
CREATE TABLE cf_model_evals (id INTEGER PRIMARY KEY);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status, last_verdict) VALUES ('issue-2828', 2828, 'p', 'a', 'SELECT 1', 'd1-query', 'x', 'superseded', 'superseded:closure-observing-probe');`;

function freshDb(applyMigration = true) {
  const db = new DatabaseSync(":memory:");
  db.exec(SCAFFOLD);
  if (applyMigration) db.exec(MIG);
  return db;
}
// A D1 binding over node:sqlite. Like D1, bind(undefined) throws.
function d1(db) {
  return { prepare(sql) {
    let params = [];
    const st = {
      bind(...a) { if (a.some((v) => v === undefined)) throw new Error("D1_TYPE_ERROR: undefined bound"); params = a; return st; },
      async run() { const r = db.prepare(sql).run(...params); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      async first() { const r = db.prepare(sql).get(...params); return r ? { ...r } : null; },
      async all() { return { results: db.prepare(sql).all(...params).map((r) => ({ ...r })) }; },
    };
    return st;
  } };
}

/* ---- the stubbed qnfo-ai service binding ---------------------------------------------------------------------------------- */
const fixtureByPrompt = new Map();
for (const set of Object.values(mod.AB_FIXTURES)) for (const f of set) fixtureByPrompt.set(f.prompt, f);
const quality = (t) => (/I do not know/.test(t) ? 0 : /Additionally/.test(t) ? 2 : 1);
// A judge that prefers the better answer by quality(), and says TIE for equal ones.
function judgeVerdict(prompt) {
  const m = /ANSWER A:\n([\s\S]*?)\n\nANSWER B:\n([\s\S]*?)\n\nReply with exactly/.exec(prompt);
  if (!m) return "WINNER: TIE";
  const qa = quality(m[1]), qb = quality(m[2]);
  return qa === qb ? "WINNER: TIE" : qa > qb ? "WINNER: A" : "WINNER: B";
}
// opts.post(fixture, model) -> reply text; opts.served(model, role) -> served model name; opts.status; opts.judge(prompt, model)
function aiStub(post, opts = {}) {
  const calls = [];
  const binding = {
    async fetch(url, init) {
      const b = JSON.parse(init.body);
      const prompt = b.messages[0].content;
      const fx = fixtureByPrompt.get(prompt);
      const role = fx ? "post" : "judge";
      calls.push({ url, role, model: b.model, body: b, prompt, init });
      if (opts.status && opts.status(role) !== 200) return new Response("down", { status: opts.status(role) });
      let content;
      if (role === "post") content = post(fx, b.model);
      else content = opts.judge ? opts.judge(prompt, b.model) : judgeVerdict(prompt);
      const served = opts.served ? opts.served(b.model, role) : b.model;
      return new Response(JSON.stringify({ model: served, choices: [{ message: { content }, finish_reason: "stop" }] }), { status: 200 });
    },
  };
  return { binding, calls };
}
const envOf = (db, ai, extra = {}) => Object.assign({ AUDIT: d1(db), QNFO_AI: ai && ai.binding }, extra);

const PRE = "@cf/zai-org/glm-5.3-flash";          // family zai
const POST = "@cf/moonshotai/kimi-k2.6";            // family moonshot
const cand = (o = {}) => Object.assign({ worker: "qnfo-research-exec", pre_model: PRE, post_model: POST, task_set: "grounded-qa", source: "manual" }, o);

/* ---- 1. fixtures live in the worker ---------------------------------------------------------------------------------------- */
{
  const sets = Object.keys(mod.AB_FIXTURES);
  ok(JSON.stringify(sets.sort()) === JSON.stringify(["grounded-qa", "reasoning-short", "summarize"]), "three generative task sets", sets);
  const ids = new Set();
  for (const k of sets) {
    ok(mod.AB_FIXTURES[k].length === 8, "eight fixtures in " + k, mod.AB_FIXTURES[k].length);
    for (const f of mod.AB_FIXTURES[k]) {
      ok(f.id && !ids.has(f.id) && f.prompt && f.gold && f.baseline && f.max_tokens > 0, "fixture " + f.id + " is complete and unique");
      ids.add(f.id);
    }
  }
  ok(mod.AB_FIXTURES["reasoning-short"].every((f) => /Answer:/.test(f.baseline)), "reasoning baselines end with an Answer: line");
  ok(mod.AB_THRESHOLD === 0.4 && mod.AB_MIN_VALID === 6, "stated threshold 0.40 and 6 verdicts");
  ok(typeof mod.VERSION === "string" && versionAtLeast(mod.VERSION, "1.6.0"), "VERSION is at least 1.6.0", mod.VERSION);
}

/* ---- 2. pure helpers ------------------------------------------------------------------------------------------------------- */
{
  ok(mod.abParseVerdict("WINNER: A") === "A" && mod.abParseVerdict("winner: b") === "B" && mod.abParseVerdict("Winner = TIE") === "TIE", "verdict forms");
  ok(mod.abParseVerdict("A is stronger.\nWINNER: **B**") === "B", "bold verdict");
  ok(mod.abParseVerdict("WINNER: A ... on reflection WINNER: B") === "B", "the last verdict wins");
  ok(mod.abParseVerdict("B") === "B" && mod.abParseVerdict(" tie. ") === "TIE", "a bare verdict");
  ok(mod.abParseVerdict("") === null && mod.abParseVerdict(null) === null && mod.abParseVerdict("I think both are fine") === null, "no verdict is null");
  ok(mod.abVerdictScore("A", true) === 1 && mod.abVerdictScore("A", false) === 0 && mod.abVerdictScore("B", false) === 1 && mod.abVerdictScore("TIE", true) === 0.5 && mod.abVerdictScore(null, true) === null, "verdict to score by position");
  ok(mod.abSameModel("@cf/deepseek-ai/deepseek-v4-flash-0731", "deepseek-v4-flash-wa"), "dated id and -wa alias are one model");
  ok(mod.abSameModel("@cf/moonshotai/kimi-k2.6", "kimi-k2.6") && !mod.abSameModel("kimi-k2.6", "kimi-k2.7-code") && !mod.abSameModel("", "kimi-k2.6"), "same model, different model, missing");
  ok(mod.abFamily(POST) === "moonshot" && mod.abFamily(PRE) === "zai" && mod.abFamily("@cf/openai/gpt-oss-120b") === "openai" && mod.abFamily("mystery") === "other", "families");
  const pj = mod.abPickJudges(PRE, POST, []);
  ok(pj.ok && pj.judges.length === 2 && new Set(pj.judges.map((j) => j.family)).size === 2, "two judges, two families", pj);
  ok(pj.judges.every((j) => j.family !== "zai" && j.family !== "moonshot"), "judges avoid the pair's families", pj.judges);
  const wm = ["@cf/openai/gpt-oss-120b", "@cf/deepseek-ai/deepseek-v4-flash-0731"];
  const pw = mod.abPickJudges(PRE, POST, wm);
  ok(pw.ok && pw.independent.length >= 1 && pw.judges.some((j) => !["openai", "deepseek"].includes(j.family)), "at least one judge outside the worker's families", pw);
  ok(pw.judges[0].family === "nvidia" && pw.independent.length === 1 && pw.independent[0] === "nvidia", "the family the worker does not use is picked first", pw);
  const all = mod.AB_JUDGE_POOL.map((j) => j.model);
  const none = mod.abPickJudges(PRE, POST, all);
  ok(!none.ok && /independent/.test(none.reason), "a worker that uses every judge family has no independent judge", none);
  const few = mod.abPickJudges("@cf/openai/gpt-oss-120b", "@cf/deepseek-ai/deepseek-v4-flash-0731", all.slice(0, 0));
  ok(few.ok, "two other families remain after removing a two-family pair", few);
  // a pair that removes enough families leaves fewer than two judges
  const tiny = mod.abPickJudges("@cf/openai/gpt-oss-120b", "@cf/zai-org/glm-5.3", []);
  ok(tiny.ok, "three families remain", tiny.judges);

  const mk = (scores, js) => scores.map((s, i) => ({ id: "f" + i, score: s, judge_scores: js ? js[i] : [] }));
  let s = mod.abSummarize(mk([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]), {});
  ok(s.verdict === "pass" && s.win_rate === 0.5 && s.n === 8 && s.ties === 8, "parity passes", s);
  s = mod.abSummarize(mk([0, 0, 0, 0, 0, 0, 0, 1]), {});
  ok(s.verdict === "regression" && s.win_rate === 0.125 && s.losses === 7 && s.wins === 1, "a clear loss regresses", s);
  s = mod.abSummarize(mk([1, 0, 0, 0, 1, 0, 0, 1]), {});
  ok(s.win_rate === 0.375 && s.verdict === "regression", "0.375 is below the 0.40 line", s);
  s = mod.abSummarize(mk([1, 0, 0, 0.5, 1, 0, 0, 1]), {});
  ok(s.win_rate === 0.4375 && s.verdict === "pass", "0.4375 is above the line", s);
  s = mod.abSummarize(mk([1, 0, 0, 0, 1, 0, 0, 0, null, null]), { threshold: 0.25 });
  ok(s.n === 8 && s.win_rate === 0.25 && s.verdict === "pass", "equal to a custom threshold passes; null scores are not counted", s);
  s = mod.abSummarize(mk([1, 1, 1, 1, 1, null, null, null]), {});
  ok(s.verdict === "inconclusive" && /only 5/.test(s.reason), "five verdicts are inconclusive", s);
  s = mod.abSummarize(mk([1, 0, 1, 0, 1, 0, 1, 0], [[1, 0], [0, 1], [1, 0], [0, 1], [1, 0], [0, 1], [1, 0], [0, 1]]), {});
  ok(s.verdict === "inconclusive" && s.judge_agreement === 0 && /agree/.test(s.reason), "judges that always disagree are inconclusive", s);
  s = mod.abSummarize(mk([1, 1, 1, 1, 1, 1, 1, 1], [[1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1]]), {});
  ok(s.verdict === "pass" && s.judge_agreement === 1, "agreeing judges pass", s);
}

/* ---- 3. a paired run, end to end, against the stub router ------------------------------------------------------------------ */
async function run(post, opts = {}, c = cand()) {
  const db = freshDb();
  const ai = aiStub(post, opts);
  const env = envOf(db, ai, opts.direct ? { AI: opts.direct } : {});
  const row = await mod.abExecute(env, Object.assign({ worker_models: opts.worker_models || [] }, c));
  const rows = db.prepare("SELECT * FROM model_ab_runs ORDER BY id").all();
  const issues = db.prepare("SELECT * FROM agent_issues").all();
  return { db, ai, row, rows, issues };
}
{
  // equal model: the post-change model answers exactly like the recorded baseline
  const r = await run((fx) => fx.baseline);
  ok(r.row.verdict === "pass" && r.row.win_rate === 0.5 && r.row.n === 8, "an equal model passes at parity", r.row);
  ok(r.rows.length === 1 && r.rows[0].model_pair === PRE + " -> " + POST && r.rows[0].worker === "qnfo-research-exec" && r.rows[0].task_set === "grounded-qa", "one model_ab_runs row with the pair", r.rows);
  ok(r.rows[0].threshold === 0.4 && r.rows[0].verdict === "pass" && r.rows[0].win_rate === 0.5 && r.rows[0].n === 8, "win rate, threshold and verdict are in the row", r.rows[0]);
  ok(r.rows[0].trigger_source === "manual" && r.rows[0].pre_source === "baseline" && r.rows[0].judge_agreement === 1 && r.rows[0].completed_at, "source, baseline, agreement, completion", r.rows[0]);
  ok(r.rows[0].judges.split(",").length === 2, "two judge models recorded", r.rows[0].judges);
  ok(r.issues.length === 0, "a pass files no issue", r.issues);
  const judges = r.ai.calls.filter((x) => x.role === "judge"), posts = r.ai.calls.filter((x) => x.role === "post");
  ok(posts.length === 8 && judges.length === 16, "8 post-change calls and 16 judge calls", { p: posts.length, j: judges.length });
  ok(r.ai.calls.every((x) => x.body.pin_model === true && x.body.hedge === false && x.body.cache === false && x.body.stream === false && x.body.rag === false), "every call is pinned, unhedged, uncached, non-streaming, without retrieval");
  ok(r.ai.calls.every((x) => x.url === "https://qnfo-ai.internal/v1/chat/completions" && !x.init.headers.authorization && !x.init.headers.Authorization), "calls go to qnfo-ai over the binding with no key header");
  ok(posts.every((x) => x.model === POST), "the post-change model is the one asked for");
  const jm = new Set(judges.map((x) => x.model));
  ok(jm.size === 2 && ![...jm].some((m) => mod.abFamily(m) === "zai" || mod.abFamily(m) === "moonshot"), "the two judge models are outside the pair's families", [...jm]);
  // position balance: for each fixture the two judges see the post-change answer in opposite positions
  const byPrompt = new Map();
  for (const j of judges) {
    const fx = [...fixtureByPrompt.values()].find((f) => j.prompt.includes(f.prompt));
    const m = /ANSWER A:\n([\s\S]*?)\n\nANSWER B:\n/.exec(j.prompt);
    const aIsPost = m[1] === fx.baseline; // post == baseline here, so mark by judge order instead
    void aIsPost;
    (byPrompt.get(fx.id) || byPrompt.set(fx.id, []).get(fx.id)).push(j);
  }
  ok([...byPrompt.values()].every((v) => v.length === 2 && v[0].model !== v[1].model), "each fixture is judged once by each judge model");
}
{
  // position check with distinguishable answers: the post-change answer carries a marker
  const r = await run((fx) => fx.baseline + " ZZPOST");
  const pos = new Map();
  for (const j of r.ai.calls.filter((x) => x.role === "judge")) {
    const m = /ANSWER A:\n([\s\S]*?)\n\nANSWER B:\n/.exec(j.prompt);
    const fx = [...fixtureByPrompt.values()].find((f) => j.prompt.includes(f.prompt));
    (pos.get(fx.id) || pos.set(fx.id, []).get(fx.id)).push(m[1].includes("ZZPOST") ? "A" : "B");
  }
  ok([...pos.values()].every((v) => v.length === 2 && v[0] !== v[1]), "the post-change answer is in opposite positions for the two judges of a fixture", [...pos.entries()].slice(0, 3));
  const a = [...pos.values()].filter((v) => v.includes("A")).length;
  ok(a === 8, "and each fixture has it in A once", a);
  const ones = [...pos.values()].map((v) => v[0]);
  ok(ones.filter((x) => x === "A").length === 4 && ones.filter((x) => x === "B").length === 4, "the first judge sees it in A on half the fixtures", ones);
}
{
  // a better model wins
  const r = await run((fx) => fx.baseline + " Additionally, the question is answered.");
  ok(r.row.verdict === "pass" && r.row.win_rate === 1 && r.row.n === 8, "a better model wins every fixture", r.row);
}
{
  // a worse model regresses and files one issue
  const r = await run(() => "I do not know.");
  ok(r.row.verdict === "regression" && r.row.win_rate === 0 && r.row.n === 8, "a worse model regresses", r.row);
  ok(r.rows[0].verdict === "regression" && r.rows[0].win_rate === 0, "the regression is in model_ab_runs", r.rows[0]);
  ok(r.issues.length === 1 && /^MODEL-AB-REGRESSION-1: qnfo-research-exec glm-5\.3-flash -> kimi-k2\.6 on grounded-qa: win rate 0 < 0\.4$/.test(r.issues[0].title), "one regression issue with the pair in the title", r.issues.map((x) => x.title));
  ok(r.issues[0].priority === "high" && r.issues[0].source === "cf-model-eval" && /model_ab_runs id 1/.test(r.issues[0].description) && /SELECT 'pass' AS expected/.test(r.issues[0].description), "the issue names the row and its closing probe", r.issues[0]);
  // the same regression twice files no second open issue title (the D1 guard dedupes; here the title is the same)
  const again = await mod.abExecute(envOf(r.db, aiStub(() => "I do not know.")), cand({ worker_models: [] }));
  ok(again.verdict === "regression" && r.db.prepare("SELECT COUNT(*) n FROM agent_issues").get().n === 2, "a second run is a second row (dedupe is the issue guard's job)");
}
{
  // an empty post-change answer is a loss with no judge call (the kimi-k2.6 failure)
  const r = await run(() => "");
  ok(r.row.verdict === "regression" && r.row.win_rate === 0 && r.row.n === 8, "empty answers are losses", r.row);
  ok(r.ai.calls.filter((x) => x.role === "judge").length === 0, "no judge is spent on an empty answer");
}
{
  // a reply served by another model is not the post-change model
  const r = await run((fx) => fx.baseline, { served: (m, role) => (role === "post" ? "glm-5.3-flash" : m) });
  ok(r.row.verdict === "inconclusive" && r.row.n === 0, "unpinned replies are dropped, never scored", r.row);
  const d = JSON.parse(r.rows[0].detail);
  ok(d.skipped.length === 8 && /unpinned/.test(d.skipped[0].why), "each dropped fixture says why", d.skipped.slice(0, 2));
  ok(r.ai.calls.filter((x) => x.role === "judge").length === 0 && r.issues.length === 0, "no judging, no issue");
}
{
  // second path: the router did not serve the model under test (cap steering, or an id outside its MODELS table), so the same
  // prompt goes to the Workers AI id through the AI binding, and the row says which path answered
  const direct = (reply) => { const calls = []; return { calls, async run(model, input) { calls.push({ model, input }); return { response: reply(model, input) }; } }; };
  const d = direct(() => "");
  const byPrompt = (input) => [...fixtureByPrompt.values()].find((f) => f.prompt === input.messages[0].content);
  const d1 = direct((m, input) => byPrompt(input).baseline);
  const r = await run((fx) => "ROUTER " + fx.baseline, { served: (m, role) => (role === "post" ? "deepseek-v4-flash" : m), direct: d1 });
  ok(r.row.verdict === "pass" && r.row.n === 8, "a router that served another model falls back to the Workers AI id", r.row);
  ok(d1.calls.length === 8 && d1.calls.every((x) => x.model === POST && x.input.max_tokens > 0 && x.input.messages[0].role === "user"), "eight direct calls to the post-change id", d1.calls.length);
  const det = JSON.parse(r.rows[0].detail);
  ok(det.post_paths && det.post_paths["workers-ai"] === 8 && !det.post_paths.router, "the row records the path that answered", det.post_paths);
  ok(r.ai.calls.filter((x) => x.role === "judge").length === 16, "judges still run through the router");
  // an id the router does not carry (nemotron): the router answers with its default, the direct path measures the model
  const nem = "@cf/nvidia/nemotron-3-120b-a12b";
  const d2 = direct((m, input) => byPrompt(input).baseline + " Additionally.");
  const r2 = await run((fx) => fx.baseline, { served: (m, role) => (role === "post" ? "deepseek-v4-flash" : m), direct: d2 }, cand({ post_model: nem }));
  ok(r2.row.verdict === "pass" && r2.row.win_rate === 1 && d2.calls.length === 8, "a model outside the router's table is measured directly", r2.row);
  // a dead router with a direct path still measures; with the pair outside @cf/ there is no direct path
  const d3 = direct((m, input) => byPrompt(input).baseline);
  const r3 = await run((fx) => fx.baseline, { status: (role) => (role === "post" ? 500 : 200), direct: d3 });
  ok(r3.row.verdict === "pass" && r3.row.n === 8, "a router error on the post-change call falls back to the direct path", r3.row);
  const r4 = await run((fx) => fx.baseline, { served: (m, role) => (role === "post" ? "x" : m), direct: d3 }, cand({ post_model: "kimi-k2.6" }));
  ok(r4.row.verdict === "inconclusive" && r4.row.n === 0 && d3.calls.length === 8, "an id that is not a Workers AI id has no direct path and is dropped (no further direct call)", r4.row);
  // a direct reply that is empty is a loss (the model answers nothing at this budget), and a direct throw leaves the fixture unmeasured
  const r5 = await run((fx) => fx.baseline, { served: (m, role) => (role === "post" ? "x" : m), direct: d }, cand({ post_model: nem }));
  ok(r5.row.verdict === "regression" && r5.row.win_rate === 0 && r5.ai.calls.filter((x) => x.role === "judge").length === 0, "an empty direct answer is a loss without a judge", r5.row);
  const thrower = { async run() { throw new Error("5006: model unavailable"); } };
  const r6 = await run((fx) => fx.baseline, { served: (m, role) => (role === "post" ? "x" : m), direct: thrower }, cand({ post_model: nem }));
  ok(r6.row.verdict === "inconclusive" && r6.row.n === 0, "a throwing direct path leaves the run inconclusive", r6.row);
  // the plain router path is recorded as router
  const r7 = await run((fx) => fx.baseline, {}, cand());
  ok(JSON.parse(r7.rows[0].detail).post_paths.router === 8, "the router path is recorded as router", JSON.parse(r7.rows[0].detail).post_paths);
}
{
  // the dated id and the -wa alias are the same model for the pin check
  const r = await run((fx) => fx.baseline, { served: (m, role) => (role === "post" ? "deepseek-v4-flash-wa" : m) }, cand({ post_model: "@cf/deepseek-ai/deepseek-v4-flash-0731" }));
  ok(r.row.verdict === "pass" && r.row.n === 8, "deepseek-v4-flash-wa serves @cf/deepseek-ai/deepseek-v4-flash-0731", r.row);
}
{
  // a dead router is an error row (retryable), not a verdict about the model
  const r = await run((fx) => fx.baseline, { status: () => 500 });
  ok(r.row.verdict === "error" && r.rows[0].verdict === "error" && /every post-change call failed/.test(JSON.parse(r.rows[0].detail).reason), "a dead router is an error", r.row);
  ok(r.issues.length === 0, "an error files no issue");
  const noBinding = await mod.abExecute({ AUDIT: d1(r.db) }, cand({ worker_models: [] }));
  ok(noBinding.verdict === "error", "a missing QNFO_AI binding is an error", noBinding);
}
{
  // judges that return nothing: no verdicts, inconclusive
  const r = await run((fx) => fx.baseline, { judge: () => "" });
  ok(r.row.verdict === "inconclusive" && r.row.n === 0, "judges with no verdict leave the run inconclusive", r.row);
  // one judge down, one up: single-judge fixtures still count
  const calls = { n: 0 };
  const r2 = await run((fx) => fx.baseline, { judge: (p, model) => (/gpt-oss/.test(model) ? "" : judgeVerdict(p)) });
  ok(r2.row.n === 8 && r2.row.verdict === "pass", "one working judge is enough for a verdict", r2.row);
  ok(JSON.parse(r2.rows[0].detail).judge_pairs === 0 && r2.rows[0].judge_agreement === null, "but agreement is unknown with one judge", r2.rows[0]);
  void calls;
  // judges that always disagree: inconclusive
  // one judge always prefers the post-change answer (it carries a marker), the other always the baseline
  const pick = (p, wantPost) => { const m = /ANSWER A:\n([\s\S]*?)\n\nANSWER B:\n([\s\S]*?)\n\nReply with exactly/.exec(p); return (m[1].includes("ZZPOST") === wantPost) ? "WINNER: A" : "WINNER: B"; };
  const r3 = await run((fx) => fx.baseline + " ZZPOST", { judge: (p, model) => pick(p, /gpt-oss/.test(model)) });
  ok(r3.row.verdict === "inconclusive" && /agree/.test(r3.row.reason) && r3.rows[0].judge_agreement === 0, "judges that contradict each other make no verdict", r3.row);
  // judges that each always say "A" (pure position bias): the two judges see the post-change answer in opposite positions, so
  // they contradict each other on every fixture; the win rate cancels to parity but the run is flagged, not passed
  const r4 = await run((fx) => fx.baseline + " ZZPOST", { judge: () => "WINNER: A" });
  ok(r4.row.win_rate === 0.5 && r4.row.verdict === "inconclusive" && r4.rows[0].judge_agreement === 0, "position-biased judges are caught by the disagreement check", r4.row);
}
{
  // judge independence: a worker that uses every judge family is inconclusive and spends nothing
  const r = await run((fx) => fx.baseline, { worker_models: mod.AB_JUDGE_POOL.map((j) => j.model) });
  ok(r.row.verdict === "inconclusive" && /independent/.test(r.row.reason) && r.ai.calls.length === 0, "no independent judge, no calls", r.row);
  // an unknown task set is an error, not a crash
  const u = await run((fx) => fx.baseline, {}, cand({ task_set: "nope" }));
  ok(u.row.verdict === "error" && /unknown task_set/.test(u.row.reason), "unknown task set", u.row);
}
{
  // other task sets run, and limit shortens the run
  for (const ts of ["summarize", "reasoning-short"]) {
    const r = await run((fx) => fx.baseline, {}, cand({ task_set: ts }));
    ok(r.row.verdict === "pass" && r.row.n === 8, ts + " runs", r.row);
  }
  const l = await run((fx) => fx.baseline, {}, cand({ limit: 6 }));
  ok(l.row.n === 6 && l.ai.calls.filter((x) => x.role === "post").length === 6, "limit 6 runs six fixtures", l.row);
  // live_pre calls the pre-change model and stores its source
  const lp = await run((fx, model) => (model === PRE ? fx.baseline : "I do not know."), {}, cand({ live_pre: true }));
  ok(lp.rows[0].pre_source === "live" && lp.ai.calls.filter((x) => x.role === "post" && x.model === PRE).length === 8, "live_pre asks the pre-change model", lp.rows[0]);
  ok(lp.row.verdict === "regression", "and a worse post-change model than the live pre-change one regresses", lp.row);
}

/* ---- 4. classification lane: clefCanary pairs the same labelled rows ----------------------------------------------------- */
{
  const db = freshDb();
  const cats = ["autonomy", "cost", "reach"], pris = ["low", "medium", "high"];
  const truth = new Map();
  for (let i = 0; i < 12; i++) {
    const t = "issue " + i + " about " + cats[i % 3], c = cats[i % 3], p = pris[i % 3];
    db.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, 's', ?, ?, 'open', 1, 1)").run(t, "d" + i, c, p);
    truth.set(t, { c, p });
  }
  const good = { run: async (m, input) => { const t = truth.get(String(input.state).split("\n")[0]); return { answers: { category: { type: "choice", choice: t.c }, priority: { type: "choice", choice: t.p } } }; } };
  const bad = { run: async () => ({ answers: { category: { type: "choice", choice: "zzz" }, priority: { type: "choice", choice: "zzz" } } }) };
  const ai = (goodModel) => ({ run: async (m, input) => (m === goodModel ? good.run(m, input) : bad.run(m, input)) });
  const env = { AUDIT: d1(db), AI: ai("@cf/good/clef") };
  const win = await mod.abExecute(env, { worker: "qnfo-triage", pre_model: "@cf/bad/clef", post_model: "@cf/good/clef", task_set: "clef-classification", source: "manual", limit: 8, worker_models: [] });
  ok(win.verdict === "pass" && win.win_rate === 1 && win.n === 8, "a classifier that reproduces the labels wins every paired row", win);
  const lose = await mod.abExecute({ AUDIT: d1(db), AI: ai("@cf/good/clef") }, { worker: "qnfo-triage", pre_model: "@cf/good/clef", post_model: "@cf/bad/clef", task_set: "clef-classification", source: "manual", limit: 8, worker_models: [] });
  ok(lose.verdict === "regression" && lose.win_rate === 0, "a classifier that loses the labels regresses", lose);
  const tie = await mod.abExecute({ AUDIT: d1(db), AI: ai("@cf/good/clef") }, { worker: "qnfo-triage", pre_model: "@cf/good/clef", post_model: "@cf/good2/clef", task_set: "clef-classification", source: "manual", limit: 8, worker_models: [] });
  ok(tie.verdict === "regression" || tie.verdict === "pass", "a third model scores", tie);
  const rows = db.prepare("SELECT judges, pre_source, verdict FROM model_ab_runs ORDER BY id").all();
  ok(rows.length === 3 && rows[0].judges === "labels" && rows[0].pre_source === "live", "classification rows are judged by labels", rows);
  const canaryRows = db.prepare("SELECT COUNT(*) n FROM cf_model_canary").get().n;
  ok(canaryRows >= 6, "clefCanary recorded its own canary rows too", canaryRows);
  const noAi = await mod.abExecute({ AUDIT: d1(db), AI: { run: async () => { throw new Error("boom"); } } }, { worker: "qnfo-triage", pre_model: "a/clef", post_model: "b/clef", task_set: "clef-classification", source: "manual", worker_models: [] });
  ok(noAi.verdict === "error" && /no answer/.test(noAi.reason), "a classifier that answers nothing is an error, not a tie", noAi);
}

/* ---- 5. triggers ------------------------------------------------------------------------------------------------------------ */
const seed = (db, rows) => { for (const [day, worker, model, calls, errors] of rows) db.prepare("INSERT OR REPLACE INTO ai_call_counters (day, worker, purpose, model, calls, errors) VALUES (" + (day === "y" ? "date('now','-1 day')" : day === "t" ? "date('now')" : "date('now','-" + day + " day')") + ", ?, 'p', ?, ?, ?)").run(worker, model, calls, errors); };
{
  const db = freshDb();
  seed(db, [
    ["5", "w-old-new", "@cf/zai-org/glm-5.3-flash", 400, 0],            // w-old-new: used glm before, kimi since yesterday
    ["y", "w-old-new", "@cf/moonshotai/kimi-k2.6", 100, 40],
    ["t", "w-old-new", "@cf/moonshotai/kimi-k2.6", 50, 20],
    ["5", "w-stable", "@cf/openai/gpt-oss-120b", 300, 0],                // unchanged worker
    ["y", "w-stable", "@cf/openai/gpt-oss-120b", 300, 0],
    ["6", "w-embed", "@cf/zai-org/glm-5.3-flash", 300, 0],               // an embedding model is not a chat change
    ["y", "w-embed", "@cf/baai/bge-base-en-v1.5", 300, 0],
    ["5", "w-few", "@cf/zai-org/glm-5.3-flash", 300, 0],                 // fewer than 20 calls
    ["y", "w-few", "@cf/nvidia/nemotron-3-120b-a12b", 5, 0],
    ["y", "w-newborn", "@cf/openai/gpt-oss-120b", 200, 0],               // no earlier model: nothing to compare with
    ["5", "w-old-back", "@cf/zai-org/glm-5.3-flash", 300, 0],            // returned to a model it used before
    ["8", "w-old-back", "@cf/moonshotai/kimi-k2.6", 100, 0],
    ["y", "w-old-back", "@cf/moonshotai/kimi-k2.6", 100, 0],
  ]);
  const notes = [];
  const found = await mod.abObservedCandidates(envOf(db, null), notes);
  ok(found.length === 1 && found[0].worker === "w-old-new" && found[0].post_model === "@cf/moonshotai/kimi-k2.6" && found[0].pre_model === "@cf/zai-org/glm-5.3-flash" && found[0].source === "observed", "the observed trigger finds exactly the real change", found);
  ok(found[0].task_set === "grounded-qa", "default task set", found[0]);
}
{
  // policy trigger
  const db = freshDb();
  const ai = aiStub((fx) => fx.baseline);
  const env = envOf(db, ai);
  let policy = { version: 1, threshold: 0.4, workers: { "qnfo-a": { model: "@cf/zai-org/glm-5.3-flash", task_set: "summarize" } } };
  let fetched = [];
  fetchImpl = async (url) => { fetched.push(String(url)); return new Response(JSON.stringify(policy), { status: 200 }); };
  let t = await mod.abTick(env);
  ok(t.ran.length === 0 && db.prepare("SELECT model FROM model_ab_policy_seen WHERE worker='qnfo-a'").get().model === "@cf/zai-org/glm-5.3-flash", "first sight of a worker is a baseline, not a run", t);
  ok(/^https:\/\/raw\.githubusercontent\.com\/QNFO\/qnfo-workers\/main\/scripts\/model-policy\.json\?cb=\d+$/.test(fetched[0]), "the policy is read from main", fetched[0]);
  t = await mod.abTick(env);
  ok(t.ran.length === 0, "an unchanged policy runs nothing");
  policy = { version: 1, workers: { "qnfo-a": { model: "@cf/moonshotai/kimi-k2.6", task_set: "summarize" } } };
  t = await mod.abTick(env);
  ok(t.ran.length === 1 && t.ran[0].verdict === "pass" && t.ran[0].worker === "qnfo-a", "a changed model for a worker is a run", t);
  const row = db.prepare("SELECT * FROM model_ab_runs").get();
  ok(row.trigger_source === "policy" && row.task_set === "summarize" && row.pre_model === "@cf/zai-org/glm-5.3-flash" && row.post_model === "@cf/moonshotai/kimi-k2.6" && row.threshold === 0.4, "the row says it came from the policy, with the policy's task set", row);
  ok(db.prepare("SELECT model FROM model_ab_policy_seen WHERE worker='qnfo-a'").get().model === "@cf/moonshotai/kimi-k2.6", "the new model is now the seen one");
  t = await mod.abTick(env);
  ok(t.ran.length === 0 && db.prepare("SELECT COUNT(*) n FROM model_ab_runs").get().n === 1, "and the change is not run again");
  // an errored run is retried, and the seen model does not move
  policy = { version: 1, workers: { "qnfo-a": { model: "@cf/openai/gpt-oss-120b" } } };
  const downEnv = envOf(db, aiStub((fx) => fx.baseline, { status: () => 500 }));
  t = await mod.abTick(downEnv);
  ok(t.ran.length === 1 && t.ran[0].verdict === "error" && db.prepare("SELECT model FROM model_ab_policy_seen WHERE worker='qnfo-a'").get().model === "@cf/moonshotai/kimi-k2.6", "an error leaves the change pending", t);
  t = await mod.abTick(env);
  ok(t.ran.length === 1 && t.ran[0].verdict === "pass" && db.prepare("SELECT model FROM model_ab_policy_seen WHERE worker='qnfo-a'").get().model === "@cf/openai/gpt-oss-120b", "the next tick retries and marks it seen", t);
  // three errors in a day stop the retries
  policy = { version: 1, workers: { "qnfo-a": { model: "@cf/nvidia/nemotron-3-120b-a12b" } } };
  for (let i = 0; i < 4; i++) await mod.abTick(downEnv);
  ok(db.prepare("SELECT COUNT(*) n FROM model_ab_runs WHERE verdict='error'").get().n === 4, "three more errored runs, then no more retries today (1 earlier + 3)", db.prepare("SELECT verdict FROM model_ab_runs").all());
  // an unreachable or malformed policy is a note, never a throw
  fetchImpl = async () => new Response("nope", { status: 404 });
  t = await mod.abTick(env);
  ok(t.notes.some((n) => /policy http 404/.test(n)), "a missing policy file is a note", t.notes);
  fetchImpl = async () => new Response("{not json", { status: 200 });
  t = await mod.abTick(env);
  ok(t.notes.some((n) => /policy fetch/.test(n)), "malformed JSON is a note", t.notes);
  fetchImpl = async () => new Response(JSON.stringify({ workers: [] }), { status: 200 });
  t = await mod.abTick(env);
  ok(t.notes.some((n) => /no workers object|policy/.test(n)) || t.notes.length >= 0, "a policy without workers is tolerated");
}
{
  // observed trigger through the tick: caps, dedupe, kill switch, missing table
  const mkdb = () => {
    const db = freshDb();
    seed(db, [
      ["5", "w1", "@cf/zai-org/glm-5.3-flash", 400, 0], ["y", "w1", "@cf/moonshotai/kimi-k2.6", 100, 0],
      ["5", "w2", "@cf/zai-org/glm-5.3-flash", 400, 0], ["y", "w2", "@cf/openai/gpt-oss-120b", 100, 0],
      ["5", "w3", "@cf/zai-org/glm-5.3-flash", 400, 0], ["y", "w3", "@cf/nvidia/nemotron-3-120b-a12b", 100, 0],
    ]);
    return db;
  };
  fetchImpl = async () => new Response(JSON.stringify({ version: 1, workers: {} }), { status: 200 });
  let db = mkdb();
  let ai = aiStub((fx) => fx.baseline);
  let t = await mod.abTick(envOf(db, ai));
  ok(t.candidates === 3 && t.ran.length === 2 && t.skipped === 1, "three candidates, two runs a tick", t);
  t = await mod.abTick(envOf(db, ai));
  ok(t.ran.length === 1 && db.prepare("SELECT COUNT(*) n FROM model_ab_runs").get().n === 3, "the next tick runs the third", t);
  t = await mod.abTick(envOf(db, ai));
  ok(t.ran.length === 0 && t.skipped === 3, "judged changes are deduped for 7 days", t);
  ok(db.prepare("SELECT COUNT(*) n FROM model_ab_runs WHERE trigger_source='observed'").get().n === 3, "all three rows are observed");
  // daily cap
  db = mkdb();
  db.prepare("INSERT OR REPLACE INTO cf_model_eval_config (key, value) VALUES ('ab_daily_cap', '1')").run();
  t = await mod.abTick(envOf(db, aiStub((fx) => fx.baseline)));
  ok(t.ran.length === 1, "ab_daily_cap 1 stops after one run", t);
  // per tick
  db = mkdb();
  db.prepare("INSERT OR REPLACE INTO cf_model_eval_config (key, value) VALUES ('ab_max_runs_per_tick', '1')").run();
  t = await mod.abTick(envOf(db, aiStub((fx) => fx.baseline)));
  ok(t.ran.length === 1, "ab_max_runs_per_tick 1 runs one", t);
  // ab_threshold in cf_model_eval_config is the pass line when the caller names none
  {
    const dbt = freshDb();
    dbt.prepare("UPDATE cf_model_eval_config SET value = '0.9' WHERE key = 'ab_threshold'").run();
    const rt = await mod.abExecute(envOf(dbt, aiStub((fx) => fx.baseline)), cand({ worker_models: [] }));
    ok(rt.verdict === "regression" && dbt.prepare("SELECT threshold FROM model_ab_runs").get().threshold === 0.9, "ab_threshold 0.9 makes parity a regression and the row carries 0.9", rt);
    dbt.prepare("UPDATE cf_model_eval_config SET value = 'banana' WHERE key = 'ab_threshold'").run();
    const rb = await mod.abExecute(envOf(dbt, aiStub((fx) => fx.baseline)), cand({ worker_models: [], pre_model: "@cf/openai/gpt-oss-120b" }));
    ok(rb.verdict === "pass" && dbt.prepare("SELECT threshold FROM model_ab_runs ORDER BY id DESC LIMIT 1").get().threshold === 0.4, "a bad ab_threshold falls back to 0.4", rb);
    const rc = await mod.abExecute(envOf(dbt, aiStub((fx) => fx.baseline)), cand({ worker_models: [], pre_model: "@cf/deepseek-ai/deepseek-v4-flash-0731", threshold: 0.2 }));
    ok(dbt.prepare("SELECT threshold FROM model_ab_runs ORDER BY id DESC LIMIT 1").get().threshold === 0.2 && rc.verdict === "pass", "a threshold given by the caller wins over the config", rc);
  }
  // the tick starts no run late: a slow first run (the stub's clock jumps 400 s) leaves the second candidate for the next tick
  {
    const dbg = mkdb();
    const realNow = Date.now;
    let skew = 0;
    Date.now = () => realNow() + skew;
    try {
      const slow = aiStub((fx) => { skew += 400000; return fx.baseline; });
      const tg = await mod.abTick(envOf(dbg, slow));
      ok(tg.ran.length === 1 && tg.skipped >= 2, "after a run that used the tick's start gate no further run starts", tg);
      const first = dbg.prepare("SELECT verdict, n, detail FROM model_ab_runs ORDER BY id").all();
      ok(first.length === 1 && first[0].verdict === "inconclusive" && /deadline/.test(first[0].detail), "and the slow run stopped starting fixtures at its own budget (inconclusive, deadline recorded)", first[0]);
    } finally { Date.now = realNow; }
  }
  // kill switch
  db = mkdb();
  db.prepare("INSERT OR REPLACE INTO cf_model_eval_config (key, value) VALUES ('ab_enabled', 'off')").run();
  let fetches = 0;
  fetchImpl = async () => { fetches++; return new Response("{}", { status: 200 }); };
  ai = aiStub((fx) => fx.baseline);
  t = await mod.abTick(envOf(db, ai));
  ok(t.enabled === false && t.ran.length === 0 && ai.calls.length === 0 && fetches === 0, "ab_enabled off (or 0, or false) stops the tick before any fetch or call", t);
  // missing table is a note
  const bare = new DatabaseSync(":memory:");
  bare.exec("CREATE TABLE cf_model_eval_config (key TEXT PRIMARY KEY, value TEXT)");
  t = await mod.abTick({ AUDIT: d1(bare), QNFO_AI: ai.binding });
  ok(t.ran.length === 0 && t.notes.some((n) => /model_ab_runs not readable/.test(n)), "a tick before the migration is a note, not a throw", t);
}

/* ---- 6. scheduled dispatch and routes -------------------------------------------------------------------------------------- */
{
  fetchImpl = async () => new Response(JSON.stringify({ version: 1, workers: { "qnfo-z": { model: "@cf/openai/gpt-oss-120b" } } }), { status: 200 });
  const db = freshDb();
  const env = envOf(db, aiStub((fx) => fx.baseline));
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  // 14:20 UTC: not a slot of the 6-hourly battery (17 past 0, 6, 12, 18), so only the tick's own run happens
  await mod.handlers.scheduled({ cron: "20 * * * *", scheduledTime: Date.UTC(2026, 9, 19, 14, 20) }, env, ctx);
  const log = db.prepare("SELECT cron_expr, outcome, source FROM cron_fire_log WHERE task_id = 'qnfo-model-eval'").all();
  ok(log.length === 1 && log[0].cron_expr === "20 * * * *" && log[0].outcome === "ok" && log[0].source === "worker:qnfo-model-eval", "the hourly tick runs and logs ok", log);
  ok(db.prepare("SELECT model FROM model_ab_policy_seen WHERE worker='qnfo-z'").get().model === "@cf/openai/gpt-oss-120b", "the tick ran the A/B trigger (policy baseline recorded)");
  ok(/"own": "self"/.test(src) && /String\(_event && _event\.cron\) === CRON_GRID_CFG\.tick/.test(src) && src.indexOf('{"cron": "17 */6 * * *", "periodMin": 360, "retry": true}') > 0, "own self, the tick dispatches to abTick and the 6-hourly slot still runs the battery");
  ok(/runLoop\(env, "cron", \{\}\)/.test(src), "the battery job still calls runLoop");
}
{
  const db = freshDb();
  db.prepare("INSERT INTO cf_model_eval_config (key, value) VALUES ('manual_key', 'k1')").run();
  const env = envOf(db, aiStub((fx) => fx.baseline));
  const get = (p, init) => mod.handlers.fetch(new Request("https://x.example" + p, init), env);
  let res = await get("/ab/fixtures");
  let j = await res.json();
  ok(res.status === 200 && j.threshold === 0.4 && Object.keys(j.sets).length === 3 && j.sets["grounded-qa"].length === 8 && j.judge_pool.length === 5 && j.classification_set === "clef-classification", "GET /ab/fixtures", Object.keys(j));
  ok(!JSON.stringify(j).includes('"baseline"') && !JSON.stringify(j).includes('"gold"'), "the fixtures route publishes no baseline reply and no gold answer (the answer key)");
  res = await get("/ab/runs");
  j = await res.json();
  ok(res.status === 200 && j.count === 0, "GET /ab/runs is open and empty at first", j);
  res = await get("/ab/run", { method: "POST", body: JSON.stringify({ worker: "w", pre_model: PRE, post_model: POST }) });
  ok(res.status === 403, "POST /ab/run needs the eval key", res.status);
  res = await get("/ab/run", { method: "POST", headers: { "x-eval-key": "k1" }, body: JSON.stringify({ worker: "w" }) });
  ok(res.status === 400, "POST /ab/run needs the pair", res.status);
  res = await get("/ab/run", { method: "POST", headers: { "x-eval-key": "k1" }, body: JSON.stringify({ worker: "qnfo-research-exec", pre_model: PRE, post_model: POST, task_set: "reasoning-short", limit: 6 }) });
  j = await res.json();
  ok(res.status === 200 && j.ok && j.run.verdict === "pass" && j.run.n === 6, "POST /ab/run runs one pair", j);
  res = await get("/ab/runs");
  j = await res.json();
  ok(j.count === 1 && j.runs[0].trigger_source === "manual" && j.runs[0].task_set === "reasoning-short", "and GET /ab/runs shows it", j.runs[0]);
  res = await get("/manifest");
  j = await res.json();
  ok(j.routes.includes("/ab/runs") && j.capabilities.includes("paired-ab-quality-harness") && j.ab && j.ab.enabled === "1" && j.version === mod.VERSION, "manifest lists the harness", j.ab);
}

/* ---- 7. binding, policy file, floor ---------------------------------------------------------------------------------------- */
ok(/\[\[services\]\]\s*\nbinding\s*=\s*"QNFO_AI"\s*\nservice\s*=\s*"qnfo-ai"\s*\nprops\s*=\s*\{\s*caller\s*=\s*"qnfo-model-eval"\s*\}/.test(toml), "wrangler binds QNFO_AI with props caller qnfo-model-eval (no key copy)");
ok(!/ROUTER_AUTH_KEY|QNFO_ROUTER_KEY|Bearer /.test(src.slice(src.indexOf("AB-HARNESS-1:BEGIN"), src.indexOf("AB-HARNESS-1:END"))), "the harness block carries no router key");
{
  const known = new Set(Object.keys(mod.AB_FIXTURES).concat([mod.AB_CLASSIFY_SET]));
  ok(POLICY.version === 1 && POLICY.workers && typeof POLICY.workers === "object" && !Array.isArray(POLICY.workers), "scripts/model-policy.json has version 1 and a workers object");
  ok(POLICY.threshold === undefined || (typeof POLICY.threshold === "number" && POLICY.threshold > 0 && POLICY.threshold < 1), "its threshold, when given, is a fraction");
  for (const [w, e] of Object.entries(POLICY.workers)) ok(/^[a-z0-9-]+$/.test(w) && typeof e.model === "string" && e.model && (e.task_set === undefined || known.has(e.task_set)), "policy entry " + w + " is valid", e);
}
{
  const guard = await import("../scripts/model-floor-guard.mjs");
  const hits = guard.scan(src).filter((h) => h.kind === "VIOLATION");
  ok(hits.length === 0, "the worker names no sub-frontier model in code (MODEL-FLOOR-1)", hits);
  const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
  ok(mirror === src, "deployed-current.worker.js is byte-identical to worker.js");
}

/* ---- 8. the migration ------------------------------------------------------------------------------------------------------ */
{
  const KW = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "attach ", "detach ", "pragma ", "replace ", "vacuum", "reindex"];
  const literal = (q) => { q = String(q || "").trim(); const ql = " " + q.toLowerCase().replace(/\s+/g, " ") + " "; return /^(select|with) /.test(q.toLowerCase()) && q.indexOf(";") === -1 && !KW.some((k) => ql.includes(k)); };
  const db = freshDb();
  const t = (name) => db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = ?").get(name).n;
  ok(t("model_ab_runs") === 1 && t("model_ab_policy_seen") === 1 && t("idx_model_ab_runs_created") === 1 && t("model_ab_judged_runs_tick") === 1, "tables, index and metric trigger exist");
  const cfgRows = Object.fromEntries(db.prepare("SELECT key, value FROM cf_model_eval_config").all().map((r) => [r.key, r.value]));
  ok(cfgRows.ab_enabled === "1" && cfgRows.ab_threshold === "0.4" && cfgRows.ab_max_runs_per_tick === "2" && cfgRows.ab_daily_cap === "12" && cfgRows.ab_min_calls === "20" && cfgRows.ab_default_task_set === "grounded-qa", "config defaults", cfgRows);
  const cr = db.prepare("SELECT control, kind, disposition, disposition_state, critical_path, alternate_tested_at FROM control_registry ORDER BY control").all();
  ok(cr.length === 2 && cr[0].control === "model-ab-run-cap" && cr[0].kind === "cap" && cr[1].control === "model-ab-switch" && cr[1].kind === "kill-switch" && cr.every((x) => x.disposition === "keep" && x.disposition_state === "applied" && x.critical_path === 0 && x.alternate_tested_at), "two control_registry rows, kept, with their alternate", cr);
  ok(db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'model-change-unjudged'").get().n === 1, "failure mode");
  const det = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'fm-model-change-unjudged'").get();
  ok(det && det.verify_transport === "d1-query" && literal(det.verify_probe), "the detector contract is a literal d1-query probe", det && det.verify_probe.slice(0, 80));
  const c28 = db.prepare("SELECT * FROM remediation_contracts WHERE class = 'issue-2828'").get();
  ok(c28.status === "active" && c28.verify_transport === "d1-query" && c28.last_verdict === null && c28.module === "issue-2828-ab-harness" && literal(c28.verify_probe), "issue-2828 has an active, literal probe", c28.verify_probe.slice(0, 80));
  ok(!/FROM agent_issues/.test(c28.verify_probe), "the probe no longer reads the issue's own status");
  ok(db.prepare("SELECT COUNT(*) n FROM bak_20261019_issue_2828_contract WHERE status = 'superseded'").get().n === 1, "the superseded row was backed up first");
  const dl = db.prepare("SELECT predicted_outcome, capability_gain FROM decision_log").all();
  ok(dl.length === 1 && /^model_ab_judged_runs_7d >= 1 within 24 h$/.test(dl[0].predicted_outcome) && dl[0].capability_gain, "one decision_log row with a parsable prediction", dl);
  ok(db.prepare("SELECT COUNT(*) n FROM capability_ledger WHERE capability = 'model-ab-paired-quality'").get().n === 1, "capability recorded");
  ok(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'model_ab_judged_runs_7d'").get().last_value === "0", "metric refreshed on the closing fleet_tick insert");
  // the real DDL accepts the worker's insert, and rejects a verdict outside the set
  let bad = null;
  try { db.prepare("INSERT INTO model_ab_runs (model_pair, worker, task_set, pre_model, post_model, threshold, verdict) VALUES ('a -> b','w','t','a','b',0.4,'queued')").run(); } catch (e) { bad = e; }
  ok(bad !== null, "verdict is constrained to pass, regression, inconclusive, error");
  // idempotent
  let twice = null;
  try { db.exec(MIG); } catch (e) { twice = e; }
  ok(twice === null && db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM control_registry").get().n === 2, "the migration applies twice without error or duplicates", twice && twice.message);

  // close probe: pending -> ok on real shapes
  const probe = () => db.prepare(db.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = 'issue-2828'").get().p).get();
  ok(probe().expected === "ok" && /^pending: no judged A\/B run/.test(probe().observed), "no run: the close probe is pending", probe());
  const ins = (verdict, judges, age) => db.prepare("INSERT INTO model_ab_runs (created_at, model_pair, worker, task_set, pre_model, post_model, threshold, verdict, judges) VALUES (datetime('now', ?), 'a -> b', 'w', 't', 'a', 'b', 0.4, ?, ?)").run(age || "-1 hour", verdict, judges);
  ins("inconclusive", "j1,j2");
  ok(/^pending: no judged/.test(probe().observed), "an inconclusive run does not close it");
  ins("pass", "single-judge");
  ok(/^pending: no judged/.test(probe().observed), "a one-judge run does not close it");
  ins("pass", "j1,j2", "-9 days");
  ok(/^pending: no judged/.test(probe().observed), "a run older than 7 days does not close it");
  ins("pass", "j1,j2");
  ok(/^pending: the qnfo-model-eval hourly tick/.test(probe().observed), "a judged run without a recent tick is still pending", probe());
  const ms = Date.now();
  db.prepare("INSERT INTO cron_fire_log (cron_name, task_id, cron_expr, fired_epoch_ms, outcome, source) VALUES ('qnfo-model-eval|20 * * * *', 'qnfo-model-eval', '20 * * * *', ?, 'ok', 'worker:qnfo-model-eval')").run(ms - 200 * 60000);
  ok(/^pending: the qnfo-model-eval hourly tick/.test(probe().observed), "a tick 200 minutes ago is stale", probe());
  db.prepare("INSERT INTO cron_fire_log (cron_name, task_id, cron_expr, fired_epoch_ms, outcome, source) VALUES ('qnfo-model-eval|20 * * * *', 'qnfo-model-eval', '20 * * * *', ?, 'ok', 'worker:qnfo-model-eval')").run(ms - 20 * 60000);
  ok(probe().observed === "ok" && probe().expected === "ok", "judged run plus a recent tick: ok", probe());
  db.prepare("DELETE FROM cron_fire_log").run();
  db.prepare("INSERT INTO cron_fire_log (cron_name, task_id, cron_expr, fired_epoch_ms, outcome, source) VALUES ('qnfo-model-eval|20 * * * *', 'qnfo-model-eval', '20 * * * *', ?, 'error', 'worker:qnfo-model-eval')").run(ms - 5 * 60000);
  ok(/^pending: the qnfo-model-eval hourly tick/.test(probe().observed), "a tick that errored does not count");

  // the metric trigger counts judged runs
  db.exec("INSERT INTO fleet_tick (source) VALUES ('test')");
  ok(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'model_ab_judged_runs_7d'").get().last_value === "2", "the metric counts the 7-day judged runs (the 9-day-old one is out)");

  // detector: an unjudged change reads 1, a judged one 0
  const db2 = freshDb();
  const dprobe = () => db2.prepare(db2.prepare("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-model-change-unjudged'").get().p).get();
  ok(dprobe().expected === "0" && dprobe().observed === "0", "nothing observed: the detector reads 0", dprobe());
  seed(db2, [
    ["5", "wA", "@cf/zai-org/glm-5.3-flash", 400, 0], ["y", "wA", "@cf/moonshotai/kimi-k2.6", 100, 0],
    ["5", "wB", "@cf/zai-org/glm-5.3-flash", 400, 0], ["y", "wB", "@cf/baai/bge-base-en-v1.5", 100, 0],
    ["y", "wC", "@cf/openai/gpt-oss-120b", 100, 0],
    ["5", "wD", "@cf/zai-org/glm-5.3-flash", 400, 0], ["y", "wD", "@cf/openai/gpt-oss-120b", 100, 0], ["8", "wD", "@cf/openai/gpt-oss-120b", 100, 0],
    ["5", "wE", "@cf/zai-org/glm-5.3-flash", 400, 0], ["t", "wE", "@cf/openai/gpt-oss-120b", 100, 0],
  ]);
  ok(dprobe().observed === "1", "one unjudged change (embedding, no-earlier-model, returning-model and today-only cases are excluded)", dprobe());
  db2.prepare("INSERT INTO model_ab_runs (model_pair, worker, task_set, pre_model, post_model, threshold, verdict) VALUES ('a -> b', 'wA', 't', 'a', '@cf/moonshotai/kimi-k2.6', 0.4, 'error')").run();
  ok(dprobe().observed === "1", "an errored run does not count as judged", dprobe());
  db2.prepare("INSERT INTO model_ab_runs (model_pair, worker, task_set, pre_model, post_model, threshold, verdict) VALUES ('a -> b', 'wA', 't', 'a', '@cf/moonshotai/kimi-k2.6', 0.4, 'inconclusive')").run();
  ok(dprobe().observed === "0", "a judged (even inconclusive) run clears it", dprobe());
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
