// TYPED-INPUT-MODEL-1 offline suite (qnfo-model-eval 1.7.0, issue 100250): loads worker.js the way eval-logic.test.mjs does and runs decide() against an in-memory SQLite D1 (node:sqlite).
// Measured 2026-10-19: @cf/cloudflare/clairic (an extraction model that takes {model, fields} and answers typed values) failed all ten chat probes with
// "5006: Error: required properties at '/' are 'model,fields'", was left a 'candidate', re-evaluated on every sweep, and filed CF-MODEL-EVAL-1: harness cannot run.
// Proves: modalityOf names clairic 'extraction' (and still names clef 'clef', a chat model 'chat', a non-text task 'other'); a chat run whose every probe fails on that schema error sets
// the catalog row to modality 'typed-input', status 'catalogued' with the reason in notes and files no issue; a genuine harness error (system role rejected) still files one and stays
// a 'chat' candidate; a mixed run is not typed-input; a model in production keeps its status and modality; a decision-battery run keeps filing; the ladder pick list only takes chat or clef
// models; VERSION is at least 1.7.0 and the mirror is identical.
// Run: node qnfo-model-eval/typed-input.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const body = src.replace(/^export default /m, "var __default = ");
const mod = new Function("console", body + "\n;return { decide, modalityOf, isNonChatSchema, VERSION, LIMITATIONS };")({ log() {} });

function mk() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE cf_model_catalog (slug TEXT PRIMARY KEY, model_id TEXT, task_type TEXT, ctx INTEGER, price_in REAL, price_out REAL, modality TEXT, status TEXT, last_eval_ts TEXT, best_score REAL, notes TEXT);
CREATE TABLE cf_model_evals (id INTEGER PRIMARY KEY AUTOINCREMENT, model_id TEXT, verdict TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE UNIQUE INDEX agent_issues_open_title ON agent_issues(title) WHERE status = 'open';`);
  const stmt = (sql) => { let args = []; const self = { bind(...x) { args = x; return self; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async first() { return db.prepare(sql).get(...args) ?? null; }, async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; } }; return self; };
  return { db, env: { AUDIT: { prepare: stmt } } };
}
const model = (db, slug, modelId, modality = "chat", status = "candidate") => {
  db.prepare("INSERT INTO cf_model_catalog (slug, model_id, task_type, ctx, price_in, modality, status) VALUES (?, ?, 'Text Generation', 65536, 0.1, ?, ?)").run(slug, modelId, modality, status);
  db.prepare("INSERT INTO cf_model_evals (model_id) VALUES (?)").run(modelId);
};
const row = (db, slug) => db.prepare("SELECT modality, status, notes FROM cf_model_catalog WHERE slug = ?").get(slug);
const issues = (db) => db.prepare("SELECT title FROM agent_issues").all();
const SCHEMA = "5006: Error: required properties at '/' are 'model,fields'";
const probes = (ids, err) => ids.map((p) => `${p}!${err}`).join(", ");
const ids = ["chat-class", "chat-format", "chat-json", "chat-math", "chat-patch", "chat-ratio", "chat-reverse", "chat-sql", "chat-unit", "chat-unknown"];
const ev = (modelId, failed, kind = "chat") => ({ model_id: modelId, kind, score: 0, passed: 0, n_tasks: 10, mean_latency_ms: 40, harness: true, failed_probes: failed });

{
  ok(mod.modalityOf("@cf/cloudflare/clairic", "Text Generation") === "extraction", "clairic is an extraction model");
  ok(mod.modalityOf("@cf/cloudflare/clairic-flash", "Text Generation") === "extraction", "a clairic variant is an extraction model");
  ok(mod.modalityOf("@cf/cloudflare/clef-flash", "Text Generation") === "clef", "clef stays a decision model");
  ok(mod.modalityOf("@cf/openai/gpt-oss-120b", "Text Generation") === "chat", "a chat model stays chat");
  ok(mod.modalityOf("@cf/cloudflare/clairic", "Text Embeddings") === "other", "a non-text task stays other");
  ok(mod.isNonChatSchema(probes(ids, SCHEMA)), "ten schema failures are a typed-input finding");
  ok(mod.isNonChatSchema("chat-class!" + SCHEMA), "one schema failure alone is too");
  ok(!mod.isNonChatSchema(""), "no failures is not");
  ok(!mod.isNonChatSchema(probes(ids, "5006: Error: enum system not in user,assistant at '/messages/0/role'")), "a system-role rejection is a harness error");
  ok(!mod.isNonChatSchema(probes(ids.slice(0, 9), SCHEMA) + ", chat-unknown!5006: Error: enum system not in user,assistant at '/messages/0/role'"), "one other error keeps it a harness error");
  ok(!mod.isNonChatSchema("chat-class (empty reply)"), "a plain failed probe is not");
}

{
  const { db, env } = mk();
  model(db, "clairic", "@cf/cloudflare/clairic");
  const d = await mod.decide(env, ev("@cf/cloudflare/clairic", probes(ids, SCHEMA)), null);
  const r = row(db, "clairic");
  ok(d.verdict === "harness_error", "the verdict stays harness_error", d);
  ok(r.modality === "typed-input" && r.status === "catalogued", "clairic leaves the chat lane", r);
  ok(/typed-input model/.test(r.notes) && /model,fields/.test(r.notes) && /TYPED-INPUT-MODEL-1/.test(r.notes), "the reason is in notes", r.notes);
  ok(issues(db).length === 0, "no harness issue is filed", issues(db));
  ok(db.prepare("SELECT verdict FROM cf_model_evals WHERE model_id = ?").get("@cf/cloudflare/clairic").verdict === "harness_error", "the eval row records the verdict");
}

{
  const { db, env } = mk();
  model(db, "oddball", "@cf/vendor/oddball");
  await mod.decide(env, ev("@cf/vendor/oddball", probes(ids, "5006: Error: enum system not in user,assistant at '/messages/0/role'")), null);
  const r = row(db, "oddball");
  ok(r.modality === "chat" && r.status === "candidate", "a genuine harness error stays a chat candidate", r);
  ok(issues(db).length === 1 && /harness cannot run @cf\/vendor\/oddball/.test(issues(db)[0].title), "and still files one harness issue", issues(db));

  model(db, "mixed", "@cf/vendor/mixed");
  await mod.decide(env, ev("@cf/vendor/mixed", probes(ids.slice(0, 9), SCHEMA) + ", chat-unknown!5006: Error: enum system not in user,assistant at '/messages/0/role'"), null);
  ok(row(db, "mixed").modality === "chat" && row(db, "mixed").status === "candidate" && issues(db).length === 2, "a mixed run is not typed-input", { r: row(db, "mixed"), n: issues(db).length });
}

{
  const { db, env } = mk();
  model(db, "prod", "@cf/vendor/prod", "chat", "in_production");
  await mod.decide(env, ev("@cf/vendor/prod", probes(ids, SCHEMA)), null);
  ok(row(db, "prod").modality === "chat" && row(db, "prod").status === "in_production", "a model in production keeps its status and modality", row(db, "prod"));

  model(db, "clef-x", "@cf/cloudflare/clef-x", "clef", "candidate");
  await mod.decide(env, ev("@cf/cloudflare/clef-x", probes(ids, SCHEMA), "clef"), null);
  ok(row(db, "clef-x").modality === "clef" && row(db, "clef-x").status === "candidate", "a decision-battery run is never reclassified", row(db, "clef-x"));
  ok(issues(db).some((i) => /harness cannot run @cf\/cloudflare\/clef-x/.test(i.title)), "and still files its harness issue", issues(db));
}

{
  ok(/FROM cf_model_catalog c\s+JOIN model_ladder_models m ON m\.id = c\.model_id\s+WHERE c\.model_id NOT IN \(\$\{ctrlList\}\) AND c\.modality IN \('chat','clef'\)/.test(src), "the ladder pick list takes only chat or clef models");
  ok(mod.LIMITATIONS.some((l) => /typed schema and not chat messages/.test(l) && /typed-input/.test(l)), "the limitation is declared");
  const v = /^(\d+)\.(\d+)\.(\d+)/.exec(mod.VERSION);
  ok(v && (Number(v[1]) > 1 || Number(v[2]) > 7 || (Number(v[2]) === 7 && Number(v[3]) >= 0)), "VERSION is at least 1.7.0", mod.VERSION);
  ok(mirror === src, "deployed-current.worker.js is identical to worker.js");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
