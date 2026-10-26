// PROMOTE-TICKET-AFTER-RECONCILE-1 offline suite (qnfo-model-eval 1.8.2, agent_issues 1000329). Loads worker.js the way eval-logic.test.mjs and typed-input.test.mjs do and runs decide(), filePromoteTickets() and the
// whole runLoop() against an in-memory SQLite D1 (node:sqlite) with a fake AI binding; the docs fetch is stubbed as down (the catalog sync fails and the pass goes on, as it does live).
// Measured 2026-10-26 (ISSUE-HYGIENE-3): decide() filed "CF-MODEL-EVAL-1: promote <model> on the <lane> battery" at once, and later in the same pass selectClefWinner, reconcileDecisionPromotions and the canary gate
// (blockDecisionPromotion) withdrew the promotion and deleted its ladder row; the ticket stayed. 9 tickets in 8 days, each closed by hand or by the hourly rule model-eval-promote-withdrawn, and the same three titles would be
// filed again after the 7-day re-evaluation. Proves: decide() writes the ladder row and the roadmap item but files no promote ticket and returns it; promotionStands() is the test of that rule (recommended, in
// production or a ladder row); filePromoteTickets() files only for a standing promotion, once per title, and one failed insert does not lose the others; a whole pass files the ticket of a kept winner exactly once,
// none for a model the reconcile supersedes, none for a winner the canary gate blocks (no evidence or low agreement), the ticket of a winner the canary clears, the ticket of a chat promotion (the reconcile
// does not touch the chat lane); a re-evaluation pass after the tickets were closed re-files none for the two models it withdraws; the filing sits after the canary gate in runLoop; VERSION is at least 1.8.2 and
// the mirror is identical.
// Run: node qnfo-model-eval/promote-ticket.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const body = src.replace(/^export default /m, "var __default = ");
const downFetch = async () => ({ ok: false, status: 503, text: async () => "" });
const mod = new Function("console", "fetch", body +
  "\n;return { decide, runLoop, filePromoteTickets, promotionStands, VERSION, BATTERY_VERSION };")({ log() {}, error() {}, warn() {} }, downFetch);

const CTRL_FLASH = "@cf/zai-org/glm-5.3-flash", CTRL_OSS = "@cf/openai/gpt-oss-120b";
const A = "@cf/cloudflare/clef-a", B = "@cf/cloudflare/clef-b", C = "@cf/cloudflare/clef-c";
const promoteTitle = (m, lane = "decision") => `CF-MODEL-EVAL-1: promote ${m} on the ${lane} battery`;

function d1(db) {
  return { prepare(sql) {
    let args = [];
    const self = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
    };
    return self;
  } };
}

// `canary`: "off" (default, canary_enabled 0), "perfect" (the fake model answers every labelled issue right) or "wrong" (it answers every one wrong); `labelled` adds labelled open issues for the canary
function world(o = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE cf_model_catalog (slug TEXT PRIMARY KEY, model_id TEXT, author TEXT, task_type TEXT, ctx INTEGER, price_in REAL, price_out REAL, vision INTEGER, description TEXT, modality TEXT, status TEXT, last_seen TEXT, last_eval_ts TEXT, first_seen TEXT DEFAULT (datetime('now')), best_score REAL, notes TEXT);
CREATE TABLE cf_model_evals (id INTEGER PRIMARY KEY AUTOINCREMENT, model_id TEXT, slug TEXT, battery_version TEXT, run_ts TEXT, n_tasks INTEGER, passed INTEGER, score REAL, mean_latency_ms INTEGER, tokens_in INTEGER, tokens_out INTEGER, cost_usd REAL, verdict TEXT, detail TEXT);
CREATE TABLE cf_model_eval_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
CREATE TABLE cf_model_eval_battery (probe_id TEXT, kind TEXT, weight REAL, prompt TEXT, expected TEXT, grader TEXT, options TEXT, enabled INTEGER DEFAULT 1);
CREATE TABLE model_ladder_models (id TEXT PRIMARY KEY, tier INTEGER, family TEXT, provider TEXT, price_in REAL, price_out REAL, cache_in REAL, quality INTEGER, ctx INTEGER, notes TEXT, active INTEGER);
CREATE TABLE roadmap_implementation (item TEXT, source TEXT, title TEXT, artifact_type TEXT, artifact_ref TEXT, status TEXT, evidence TEXT, created_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE UNIQUE INDEX agent_issues_open_title ON agent_issues(title) WHERE status = 'open';
CREATE TABLE cf_model_eval_runs (id TEXT PRIMARY KEY, ts TEXT, trigger TEXT, models INTEGER, probes INTEGER, ok INTEGER, detail TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);`);
  // the incumbents, with a fresh perfect score so the pass does not re-run them
  for (const [slug, id, price] of [["glm-5.3-flash", CTRL_FLASH, 0.15], ["gpt-oss-120b", CTRL_OSS, 0.35]]) {
    db.prepare("INSERT INTO cf_model_catalog (slug, model_id, task_type, price_in, modality, status) VALUES (?, ?, 'Text Generation', ?, 'chat', 'in_production')").run(slug, id, price);
    db.prepare("INSERT INTO cf_model_evals (model_id, battery_version, run_ts, n_tasks, passed, score, verdict) VALUES (?, ?, datetime('now'), 2, 2, 1, 'control')").run(id, mod.BATTERY_VERSION);
  }
  // two probes per lane that the fake AI passes
  const clefOpts = JSON.stringify({ questions: { q1: { type: "noul" } }, expect: { q1: { mode: "prob_gte", v: 0.5 } } });
  for (const n of [1, 2]) {
    db.prepare("INSERT INTO cf_model_eval_battery (probe_id, kind, weight, prompt, expected, grader, options, enabled) VALUES (?, 'chat', 1, 'Say ok', 'ok', 'contains', NULL, 1)").run("chat-" + n);
    db.prepare("INSERT INTO cf_model_eval_battery (probe_id, kind, weight, prompt, expected, grader, options, enabled) VALUES (?, 'clef', 1, 'state', 'q1:0.5', 'prob', ?, 1)").run("clef-" + n, clefOpts);
  }
  if (o.canary === "perfect" || o.canary === "wrong") db.prepare("INSERT INTO cf_model_eval_config (key, value, updated_at) VALUES ('canary_enabled', '1', datetime('now'))").run();
  if (o.labelled) {
    for (const [t, cat, pri] of [["labelled one", "alpha", "high"], ["labelled two", "alpha", "low"], ["labelled three", "beta", "medium"], ["labelled four", "beta", "high"]]) {
      db.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?, 'd', 's', ?, ?, 'open', 1, 1)").run(t, cat, pri);
    }
  }
  const ai = { run: async (modelId, input) => {
    if (input && input.questions && input.questions.category) {            // the canary: answer from the stored label, right or deliberately wrong
      const title = String(input.state).split("\n")[0];
      const r = db.prepare("SELECT category, priority FROM agent_issues WHERE title = ?").get(title) || { category: "optimization", priority: "medium" };
      const wrong = o.canary === "wrong";
      return { answers: { category: { type: "choice", choice: wrong ? "zzz" : String(r.category).toLowerCase() }, priority: { type: "choice", choice: wrong ? "none" : r.priority } }, usage: { input_tokens: 5 } };
    }
    if (input && input.questions) return { answers: { q1: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 10, output_tokens: 4 } };   // a decision-battery probe
    return { response: "ok", usage: { prompt_tokens: 12, completion_tokens: 2 } };                                                          // a chat-battery probe
  } };
  return { db, env: { AUDIT: d1(db), AI: ai } };
}
const model = (db, slug, modelId, modality, price, status = "candidate", lastEval = null) =>
  db.prepare("INSERT INTO cf_model_catalog (slug, model_id, task_type, price_in, price_out, ctx, modality, status, last_eval_ts, first_seen) VALUES (?, ?, 'Text Generation', ?, ?, 65536, ?, ?, ?, datetime('now', ?))").run(slug, modelId, price, price, modality, status, lastEval, "-" + (slug.length) + " minutes");
const issues = (db) => db.prepare("SELECT title, status, priority FROM agent_issues WHERE source = 'cf-model-eval' ORDER BY id").all();
const promoteIssues = (db) => issues(db).filter((i) => /^CF-MODEL-EVAL-1: promote /.test(i.title));
const cat = (db, id) => db.prepare("SELECT status, notes, last_eval_ts FROM cf_model_catalog WHERE model_id = ?").get(id);
const ladder = (db, id) => db.prepare("SELECT id, active, notes FROM model_ladder_models WHERE id = ?").get(id);
const road = (db, id) => db.prepare("SELECT item, evidence FROM roadmap_implementation WHERE item = ?").get("MODEL-" + id);
const ev = (modelId, kind) => ({ model_id: modelId, kind, score: 1, passed: 2, n_tasks: 2, mean_latency_ms: 10, harness: false, failed_probes: "" });

// ---- decide() builds the ticket and does not file it
{
  const { db, env } = world();
  model(db, "cheap-chat", "@cf/vendor/cheap-chat", "chat", 0.05);
  const d = await mod.decide(env, ev("@cf/vendor/cheap-chat", "chat"), { model_id: CTRL_FLASH, score: 1 });
  ok(d.verdict === "promote" && d.status === "recommended", "a cheap chat model at parity with a saturated control promotes", d);
  ok(promoteIssues(db).length === 0 && issues(db).length === 0, "decide() files no promote ticket", issues(db));
  ok(d.promoteTicket && d.promoteTicket.model_id === "@cf/vendor/cheap-chat" && d.promoteTicket.title === promoteTitle("@cf/vendor/cheap-chat", "chat") && d.promoteTicket.priority === "medium" && /Automatic evaluation/.test(d.promoteTicket.description) && /Flip routing only after the canary agrees/.test(d.promoteTicket.description), "it returns the ticket (title, description, priority) for the caller", d.promoteTicket && d.promoteTicket.title);
  ok(ladder(db, "@cf/vendor/cheap-chat") && ladder(db, "@cf/vendor/cheap-chat").active === 0 && /auto-eval promote/.test(ladder(db, "@cf/vendor/cheap-chat").notes) && road(db, "@cf/vendor/cheap-chat"), "the ladder row (active 0) and the roadmap item are still written at once");
  model(db, "weak", "@cf/vendor/weak", "chat", 0.05);
  const k = await mod.decide(env, { ...ev("@cf/vendor/weak", "chat"), score: 0.2, passed: 0 }, { model_id: CTRL_FLASH, score: 1 });
  ok(k.verdict === "reject" && k.promoteTicket === null, "a verdict other than promote returns no ticket", k);
}

// ---- promotionStands: the test the hourly rule model-eval-promote-withdrawn applies
{
  const { db, env } = world();
  model(db, "rec", "@cf/vendor/rec", "chat", 0.1, "recommended");
  model(db, "prod", "@cf/vendor/prod", "chat", 0.1, "in_production");
  model(db, "lad", "@cf/vendor/lad", "clef", 0.1, "passed");
  db.prepare("INSERT INTO model_ladder_models (id, tier, family, provider, price_in, price_out, cache_in, quality, ctx, notes, active) VALUES ('@cf/vendor/lad', 1, 'x', 'workers-ai', 0, 0, 0, 90, NULL, 'auto-eval promote cfmb-2 (cf-model-eval)', 0)").run();
  model(db, "sup", "@cf/vendor/sup", "clef", 0.1, "passed");
  model(db, "blk", "@cf/vendor/blk", "clef", 0.1, "candidate");
  ok(await mod.promotionStands(env, "@cf/vendor/rec") === true, "recommended stands");
  ok(await mod.promotionStands(env, "@cf/vendor/prod") === true, "in production stands");
  ok(await mod.promotionStands(env, "@cf/vendor/lad") === true, "a ladder row stands even when the catalog says passed");
  ok(await mod.promotionStands(env, "@cf/vendor/sup") === false && await mod.promotionStands(env, "@cf/vendor/blk") === false, "a superseded model (passed) and a blocked one (candidate) with no ladder row do not");
  ok(await mod.promotionStands(env, "@cf/vendor/unknown") === false, "an unknown model does not");
}

// ---- filePromoteTickets
{
  const { db, env } = world();
  model(db, "rec", "@cf/vendor/rec", "chat", 0.1, "recommended");
  model(db, "sup", "@cf/vendor/sup", "clef", 0.1, "passed");
  model(db, "rec2", "@cf/vendor/rec2", "chat", 0.1, "recommended");
  const t = (m, lane, title) => ({ model_id: m, title: title || promoteTitle(m, lane), description: "d " + m, priority: "medium" });
  const out = await mod.filePromoteTickets(env, [t("@cf/vendor/rec", "chat"), t("@cf/vendor/sup", "decision"), t("@cf/vendor/rec", "chat"), null, { title: "no model" }]);
  ok(out.filed === 1 && out.withheld.join() === "@cf/vendor/sup" && out.errors.length === 0, "one standing promotion is filed, the withdrawn one is withheld, a duplicate title and malformed entries are skipped", out);
  ok(promoteIssues(db).length === 1 && promoteIssues(db)[0].title === promoteTitle("@cf/vendor/rec", "chat") && promoteIssues(db)[0].status === "open", "exactly one open ticket exists", promoteIssues(db));
  const again = await mod.filePromoteTickets(env, [t("@cf/vendor/rec", "chat")]);
  ok(again.filed === 1 && promoteIssues(db).length === 1, "a second pass with the ticket still open adds none (the unique open title ignores the insert)", { again, n: promoteIssues(db).length });
  db.exec("CREATE TRIGGER boom BEFORE INSERT ON agent_issues WHEN NEW.title LIKE '%rec-bad%' BEGIN SELECT RAISE(ABORT, 'boom'); END;");
  model(db, "rec-bad", "@cf/vendor/rec-bad", "chat", 0.1, "recommended");
  const out2 = await mod.filePromoteTickets(env, [t("@cf/vendor/rec-bad", "chat"), t("@cf/vendor/rec2", "chat")]);
  ok(out2.filed === 1 && out2.errors.length === 1 && /rec-bad/.test(out2.errors[0]) && promoteIssues(db).some((i) => /rec2/.test(i.title)), "one failed insert is reported and does not lose the next ticket", out2);
  const none = await mod.filePromoteTickets(env, undefined);
  ok(none.filed === 0 && none.withheld.length === 0, "no tickets is a no-op");
}

// ---- a whole pass: the winner is kept
{
  const { db, env } = world();
  model(db, "clef-a", A, "clef", 0.04);
  const s = await mod.runLoop(env, "manual", {});
  ok(cat(db, A).status === "recommended" && ladder(db, A) && road(db, A), "the winner stays recommended, on the ladder and on the roadmap");
  ok(promoteIssues(db).length === 1 && promoteIssues(db)[0].title === promoteTitle(A) && promoteIssues(db)[0].status === "open", "a kept winner files exactly one promote ticket, after the pass", promoteIssues(db));
  ok(issues(db).some((i) => i.title === "CF-MODEL-EVAL-1: decision-model winner is " + A), "the winner announcement is unchanged");
  ok(s.promote_tickets && s.promote_tickets.filed === 1 && s.promote_tickets.withheld.length === 0, "the run summary says one filed, none withheld", s.promote_tickets);
  ok(s.evaluated.length === 1 && s.evaluated[0].verdict === "promote", "one model evaluated, verdict promote", s.evaluated);
}

// ---- a whole pass: the reconcile supersedes a dearer decision model
{
  const { db, env } = world();
  model(db, "clef-a", A, "clef", 0.04);
  model(db, "clef-b", B, "clef", 0.2);
  const s = await mod.runLoop(env, "manual", {});
  ok(s.clef_winner && s.clef_winner.model_id === A && s.superseded === 1, "the cheaper decision model wins the tie and the other is superseded", { w: s.clef_winner && s.clef_winner.model_id, sup: s.superseded });
  ok(cat(db, B).status === "passed" && /superseded by decision-battery winner/.test(cat(db, B).notes) && !ladder(db, B) && !road(db, B), "the superseded model is passed, off the ladder and off the roadmap");
  ok(promoteIssues(db).map((i) => i.title).join() === promoteTitle(A), "only the standing winner has a promote ticket; the superseded model has none", promoteIssues(db).map((i) => i.title));
  ok(s.promote_tickets.filed === 1 && s.promote_tickets.withheld.join() === B, "the summary names the withheld model", s.promote_tickets);
}

// ---- a whole pass: the canary gate blocks the winner
for (const [label, opts] of [["no canary evidence", { canary: "perfect" }], ["agreement below the bar", { canary: "wrong", labelled: true }]]) {
  const { db, env } = world(opts);
  model(db, "clef-a", A, "clef", 0.04);
  model(db, "clef-b", B, "clef", 0.2);
  const s = await mod.runLoop(env, "manual", {});
  ok(s.canary_gate && s.canary_gate.ready === false, label + ": the canary gate is not ready", s.canary_gate);
  ok(cat(db, A).status === "candidate" && /^canary gate:/.test(cat(db, A).notes) && !ladder(db, A) && /^BLOCKED:/.test((road(db, A) || {}).evidence || ""), label + ": the blocked winner is a candidate, off the ladder, with the reason on the roadmap");
  ok(promoteIssues(db).length === 0, label + ": a withdrawn winner and a superseded model file no promote ticket", promoteIssues(db));
  ok(issues(db).some((i) => i.title === "CF-MODEL-EVAL-1: decision-model winner is " + A), label + ": the winner announcement is still filed (it asks for the canary and is not a promote ticket)");
  ok(s.promote_tickets.filed === 0 && s.promote_tickets.withheld.length === 2, label + ": both promote tickets are withheld", s.promote_tickets);
}

// ---- a whole pass: the canary clears the winner
{
  const { db, env } = world({ canary: "perfect", labelled: true });
  model(db, "clef-a", A, "clef", 0.04);
  const s = await mod.runLoop(env, "manual", {});
  ok(s.canary_gate && s.canary_gate.ready === true && s.canary && s.canary.agreement === 1, "the canary agrees with the fleet's own labels", s.canary_gate);
  ok(cat(db, A).status === "recommended" && ladder(db, A), "the winner stays recommended on the ladder");
  ok(promoteIssues(db).length === 1 && promoteIssues(db)[0].title === promoteTitle(A), "the ticket is filed after the gate cleared it", promoteIssues(db));
}

// ---- a whole pass: a chat promotion is not touched by the decision-lane reconcile
{
  const { db, env } = world();
  model(db, "cheap-chat", "@cf/vendor/cheap-chat", "chat", 0.05);
  const s = await mod.runLoop(env, "manual", {});
  ok(cat(db, "@cf/vendor/cheap-chat").status === "recommended" && ladder(db, "@cf/vendor/cheap-chat"), "a cheap chat model is recommended");
  ok(promoteIssues(db).map((i) => i.title).join() === promoteTitle("@cf/vendor/cheap-chat", "chat"), "and its promote ticket is filed once", promoteIssues(db).map((i) => i.title));
  ok(s.clef_winner === null && s.promote_tickets.filed === 1, "with no decision model in the pass there is no winner and the ticket is still filed", s.promote_tickets);
}

// ---- the 7-day re-evaluation after the tickets were closed (the three titles of 2026-10-18, 10-19 and 10-25)
{
  const { db, env } = world();
  model(db, "clef-a", A, "clef", 0.04);
  model(db, "clef-b", B, "clef", 0.2);
  await mod.runLoop(env, "manual", {});
  ok(promoteIssues(db).length === 1, "pass one: one promote ticket (for the winner)");
  db.prepare("UPDATE agent_issues SET status = 'closed'").run();                                  // closed by hand or by the hourly rule
  db.prepare("UPDATE cf_model_catalog SET last_eval_ts = datetime('now', '-8 days') WHERE modality = 'clef'").run();
  model(db, "clef-c", C, "clef", 0.02);                                                          // a cheaper decision model arrives: the same pass withdraws A and B
  const s = await mod.runLoop(env, "manual", {});
  ok(s.evaluated.length === 3 && s.evaluated.every((e) => e.verdict === "promote"), "pass two re-evaluates A, B and C and all three score promote", s.evaluated.map((e) => e.model_id + ":" + e.verdict));
  ok(s.clef_winner.model_id === C && s.superseded === 2, "C wins and both others are superseded in the same pass", { w: s.clef_winner && s.clef_winner.model_id, sup: s.superseded });
  const open = promoteIssues(db).filter((i) => i.status === "open").map((i) => i.title);
  ok(open.join() === promoteTitle(C), "the re-evaluation pass files a promote ticket only for the model it keeps", open);
  ok(promoteIssues(db).filter((i) => i.title === promoteTitle(A)).length === 1 && promoteIssues(db).filter((i) => i.title === promoteTitle(B)).length === 0, "the closed ticket of A is not filed again and B never had one", promoteIssues(db).map((i) => i.title + ":" + i.status));
  ok(s.promote_tickets.filed === 1 && s.promote_tickets.withheld.sort().join() === [A, B].join(), "the summary names the two withheld models", s.promote_tickets);
}

// ---- where the filing sits and what ships
{
  ok(!/fileIssue\(env,\s*`CF-MODEL-EVAL-1: promote/.test(src), "no fileIssue call carries the promote title any more");
  const iCanary = src.indexOf("blockDecisionPromotion(env, winner.model_id, gate.reason)"), iReconcile = src.indexOf("reconcileDecisionPromotions(env, winner.model_id)"), iFile = src.indexOf("await filePromoteTickets(env, promoteTickets)");
  ok(iReconcile > 0 && iCanary > iReconcile && iFile > iCanary, "runLoop files the tickets after the reconcile and the canary gate", { iReconcile, iCanary, iFile });
  ok(/PROMOTE-TICKET-AFTER-RECONCILE-1/.test(src), "the tag PROMOTE-TICKET-AFTER-RECONCILE-1 is on main (the issue's code-probe)");
  const v = /^(\d+)\.(\d+)\.(\d+)/.exec(mod.VERSION);
  ok(v && (Number(v[1]) > 1 || Number(v[2]) > 8 || (Number(v[2]) === 8 && Number(v[3]) >= 2)), "VERSION is at least 1.8.2", mod.VERSION);
  ok(mirror === src, "deployed-current.worker.js is identical to worker.js");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
