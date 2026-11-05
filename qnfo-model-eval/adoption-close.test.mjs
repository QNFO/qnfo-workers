// ADOPTION-CLOSE-1 and AB-WORKER-MODELS-1 offline suite (agent_issues 1001568, 1001569, 1001233; roadmap items RM-923, RM-1614, RM-1646). In-memory SQLite D1, no network.
// Measured 2026-11-05: all four cf-model-eval roadmap items were still open although three of the models had been in_production with an active ladder row for days (nothing ever closed an item), and
// model_ab_runs 23 listed "v_output_quality_headline" among qnfo-ai's models (qnfo-ai counts its reads of that view in ai_call_counters with the view name in the model column).
// Run: node qnfo-model-eval/adoption-close.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const body = src.replace(/^export default /m, "var __default = ");
const mod = new Function("console", "fetch", body + "\n;return { closeAdoptedRoadmapItems, abWorkerModels, abObservedCandidates, runLoop };")({ log() {}, error() {}, warn() {} }, async () => ({ ok: false, status: 503, text: async () => "" }));

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
function world() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
CREATE TABLE cf_model_catalog (slug TEXT, model_id TEXT, status TEXT, modality TEXT);
CREATE TABLE model_ladder_models (id TEXT PRIMARY KEY, tier INTEGER, active INTEGER);
CREATE TABLE roadmap_implementation (id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT, source TEXT, status TEXT, evidence TEXT, verified_at TEXT);
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model));`);
  const cat = (id, status) => db.prepare("INSERT INTO cf_model_catalog (slug, model_id, status, modality) VALUES (?, ?, ?, 'chat')").run(id.split("/").pop(), id, status);
  const lad = (id, active) => db.prepare("INSERT INTO model_ladder_models (id, tier, active) VALUES (?, 1, ?)").run(id, active);
  const rm = (id, source, status) => db.prepare("INSERT INTO roadmap_implementation (item, source, status, evidence) VALUES (?, ?, ?, 'cfmb-2: cost win')").run("MODEL-" + id, source, status);
  return { db, env: { AUDIT: d1(db) }, cat, lad, rm };
}
const row = (db, id) => db.prepare("SELECT status, evidence, verified_at FROM roadmap_implementation WHERE item = ?").get("MODEL-" + id);

// ---- closeAdoptedRoadmapItems
{
  const w = world();
  w.cat("@cf/a/live", "in_production"); w.lad("@cf/a/live", 1); w.rm("@cf/a/live", "cf-model-eval", "open");
  w.cat("@cf/a/noladder", "in_production"); w.rm("@cf/a/noladder", "cf-model-eval", "open");
  w.cat("@cf/a/inactive", "in_production"); w.lad("@cf/a/inactive", 0); w.rm("@cf/a/inactive", "cf-model-eval", "open");
  w.cat("@cf/a/rec", "recommended"); w.lad("@cf/a/rec", 1); w.rm("@cf/a/rec", "cf-model-eval", "open");
  w.cat("@cf/a/blocked", "candidate"); w.rm("@cf/a/blocked", "cf-model-eval", "open");
  w.cat("@cf/a/other", "in_production"); w.lad("@cf/a/other", 1); w.rm("@cf/a/other", "someone-else", "open");
  w.cat("@cf/a/done", "in_production"); w.lad("@cf/a/done", 1); w.rm("@cf/a/done", "cf-model-eval", "partial");
  const out = await mod.closeAdoptedRoadmapItems(w.env);
  ok(out.closed === 1 && out.candidates === 1, "exactly the item whose model is in_production with an active ladder row is closed", out);
  const live = row(w.db, "@cf/a/live");
  ok(live.status === "verified" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(live.verified_at) && /cfmb-2: cost win \| VERIFIED \(ADOPTION-CLOSE-1\).*tier 1 active/.test(live.evidence), "the item is verified, dated, and keeps its old evidence plus the new facts", live);
  for (const id of ["noladder", "inactive", "rec", "blocked"]) ok(row(w.db, "@cf/a/" + id).status === "open", id + " stays open (a promotion that is not live, withdrawn or blocked is not adopted)", row(w.db, "@cf/a/" + id));
  ok(row(w.db, "@cf/a/other").status === "open", "another source's item with the same name is not touched");
  ok(row(w.db, "@cf/a/done").status === "partial", "an item that is not open is not touched");
  const again = await mod.closeAdoptedRoadmapItems(w.env);
  ok(again.closed === 0 && again.candidates === 0, "a second pass changes nothing", again);
  // more than 20 candidates: 20 a pass
  const m = world();
  for (let i = 0; i < 25; i++) { m.cat("@cf/m/x" + i, "in_production"); m.lad("@cf/m/x" + i, 1); m.rm("@cf/m/x" + i, "cf-model-eval", "open"); }
  const o1 = await mod.closeAdoptedRoadmapItems(m.env);
  const o2 = await mod.closeAdoptedRoadmapItems(m.env);
  ok(o1.closed === 20 && o2.closed === 5, "at most 20 items are closed a pass", [o1, o2]);
}

// ---- the quality-floor counter is not a model
{
  const w = world();
  const ins = (day, worker, purpose, model, calls) => w.db.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls) VALUES (" + (day === "t" ? "date('now')" : "date('now','-5 day')") + ", ?, ?, ?, ?)").run(worker, purpose, model, calls);
  ins("t", "qnfo-ai", "chat", "dynamic/standard", 50);
  ins("t", "qnfo-ai", "quality-floor-read", "v_output_quality_headline", 70);
  ins("t", "qnfo-ai", "quality-floor-lift:spendGovernWA", "@cf/zai-org/glm-5.3-flash", 3);
  ins("p", "qnfo-ai", "chat", "@cf/zai-org/glm-5.3-flash", 60);
  const models = await mod.abWorkerModels(w.env, "qnfo-ai");
  ok(models.includes("dynamic/standard") && models.includes("@cf/zai-org/glm-5.3-flash") && !models.includes("v_output_quality_headline"), "abWorkerModels lists the models a worker calls, not the view its floor reads", models);
  const notes = [];
  const cands = await mod.abObservedCandidates(w.env, notes);
  ok(cands.every((c) => c.post_model !== "v_output_quality_headline" && c.pre_model !== "v_output_quality_headline"), "abObservedCandidates never proposes the view as a model", cands);
  ok(cands.some((c) => c.worker === "qnfo-ai" && c.post_model === "dynamic/standard" && c.pre_model === "@cf/zai-org/glm-5.3-flash"), "and still proposes a real change (a worker newly calling dynamic/standard)", cands);
}

// ---- wiring and mirror
{
  const rl = src.slice(src.indexOf("async function runLoop("));
  ok(/summary\.adopted = await closeAdoptedRoadmapItems\(env\)/.test(rl) && rl.indexOf("closeAdoptedRoadmapItems(env)") > rl.indexOf("filePromoteTickets(env, promoteTickets)"), "runLoop sweeps adopted items after the promote tickets and the canary gate");
  ok(mirror === src, "deployed-current.worker.js is byte-identical to worker.js");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
