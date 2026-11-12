// personal-companion/research-pipeline.test.mjs: PIPELINE-ENGINE-PORT-1. The research pipeline is executed on the shared engine: one
// research-run per idea qnfo-research-exec claims, following research_queue.status and .stage with Workflow sleeps.
// Run: node personal-companion/research-pipeline.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import * as E from "../_shared/pipeline-engine.js";
import * as PD from "../_shared/pipeline-defs.js";
import * as PP from "./personal-pipeline.js";

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok   " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x) : "")); } };
function d1(raw) {
  return { prepare(sql) { let a = []; const api = { bind(...x) { a = x; return api; },
    async run() { const r = raw.prepare(sql).run(...a); return { success: true, meta: { changes: r.changes } }; },
    async all() { return { results: raw.prepare(sql).all(...a) }; }, async first() { return raw.prepare(sql).get(...a) ?? null; } }; return api; } };
}
const A = new DatabaseSync(":memory:"), P = new DatabaseSync(":memory:");
A.exec("CREATE TABLE research_queue (id TEXT PRIMARY KEY, idea TEXT, status TEXT, stage TEXT, claimed_at TEXT, published_at TEXT, created_at TEXT)");
A.exec("CREATE TABLE jobsearch_matches (id TEXT PRIMARY KEY, company TEXT, title TEXT, status TEXT, first_seen TEXT)");
A.exec("CREATE TABLE jobsearch_events (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT, event TEXT, ts TEXT, note TEXT)");
const add = A.prepare("INSERT INTO research_queue (id, idea, status, stage, claimed_at, published_at, created_at) VALUES (?, 'An idea', ?, ?, ?, ?, '2026-11-01')");
add.run("live", "researching", "ground", "2026-11-12T10:00:00Z", null);
add.run("fresh", "published", "done", "2026-11-11T10:00:00Z", "2026-11-12T09:00:00Z");
add.run("waiting", "queued", "ground", null, null);              // still in the queue: no run
add.run("old", "published", "done", "2026-09-01T10:00:00Z", "2026-09-02T10:00:00Z");   // long done: no run
add.run("quiet", "researching", "ground", "2026-11-12T10:00:00Z", null);
const set = (id, status, stage) => A.prepare("UPDATE research_queue SET status = ?, stage = ? WHERE id = ?").run(status, stage, id);
const run = (ref) => A.prepare("SELECT * FROM pipeline_runs WHERE pipeline = 'research-run' AND subject_ref = ?").get(ref);

let t = Date.parse("2026-11-12T12:00:00Z");
const now = () => new Date(t).toISOString();
const hours = (h) => { t += h * 36e5; };
const env = { AUDIT: d1(A), PERSONAL: d1(P) };

console.log("[definition]");
const def = PD.researchRunPipeline(E);
ok("stages research, review, revise, publication, outcome", def.stages.map((s) => s.key).join(",") === "research,review,revise,publication,outcome");
ok("the research funnel is executed and names its runs", PD.researchPipeline(E).mode === "executed" && PD.researchPipeline(E).runs === "research-run");
ok("research_queue is never written by the pipeline", !/(UPDATE|INSERT INTO|DELETE FROM) research_queue/.test(fs.readFileSync(new URL("../_shared/pipeline-defs.js", import.meta.url), "utf8")));

console.log("[inline path]");
let r = await PD.researchTick(E, env, { now });
ok("a run for each claimed or just-published idea, none for the queue or old work", r.opened === 3 && run("live") && run("fresh") && run("quiet") && !run("waiting") && !run("old"), r);
ok("a just-published idea finishes at once as published", run("fresh").status === "done" && JSON.parse(run("fresh").output_json).outcome === "published", run("fresh"));
ok("an idea in research waits", run("live").status === "waiting" && run("live").stage === "research");

console.log("[research -> review -> revise -> published, with stages skipped]");
hours(6); set("live", "researching", "review");
await PD.researchTick(E, env, { now });
ok("moving to review passes the research stage", run("live").stage === "review" && run("live").status === "waiting", run("live"));
hours(6); set("live", "researching", "complete");
await PD.researchTick(E, env, { now });
ok("jumping past revise passes review and revise", run("live").stage === "publication", run("live"));
hours(6); set("live", "published", "done");
await PD.researchTick(E, env, { now });
ok("publication finishes the run", run("live").status === "done" && JSON.parse(run("live").output_json).outcome === "published", run("live"));
const ev = A.prepare("SELECT stage FROM pipeline_evidence WHERE run_id = ? ORDER BY id").all(run("live").id).map((e) => e.stage);
ok("evidence for every stage", ["open", "research", "review", "revise", "publication", "outcome", "finish"].every((s) => ev.includes(s)), ev);

console.log("[a stalled idea moves on by its timeouts and is not marked failed]");
for (let k = 0; k < 4 * 28 + 4; k++) { hours(6); await PD.researchTick(E, env, { now, limit: 0 }); }
ok("a month of silence ends the run as quiet", run("quiet").status === "done" && JSON.parse(run("quiet").output_json).outcome === "quiet", run("quiet"));
ok("the research row is untouched", A.prepare("SELECT status FROM research_queue WHERE id = 'quiet'").get().status === "researching");

console.log("[Workflow path]");
add.run("wf", "researching", "ground", now(), null);
const created = [];
r = await PD.researchTick(E, { AUDIT: d1(A), RESEARCH_FLOW: { async create(x) { created.push(x); } } }, { now });
ok("create() with the run id as instance id", created.length === 1 && created[0].id === run("wf").id && run("wf").mode === "workflow", created);
let n = 0; const step = { async do(a, b, fn) { if (typeof b === "function") fn = b; return fn(); }, async sleep() { n++; if (n === 1) set("wf", "wontfix", "review"); } };
const res = await PD.runResearchWorkflow(E, env, { runId: run("wf").id }, step);
ok("the Workflow body sleeps 6 hours per poll and ends on the outcome", res.status === "done" && res.output.outcome === "dropped" && n === 1, { res, n });
hours(30);
r = await PD.researchTick(E, { AUDIT: d1(A), RESEARCH_FLOW: { async create() {} } }, { now });
ok("a finished Workflow run is not adopted", r.adopted === 0, r);

console.log("[status view]");
const st = await PP.statusAll(env, t);
const rs = st.pipelines.find((p) => p.pipeline === "research");
ok("research reads as executed (the closing probe's string)", JSON.stringify(st).includes('"pipeline":"research","label":"Research: idea to publication","plane":"research","version":"1.0.0","mode":"executed"'), JSON.stringify(rs).slice(0, 200));
ok("research carries its runs, counts only", rs.runs && rs.runs.pipeline === "research-run" && rs.runs.total === 4 && !/An idea/.test(JSON.stringify(rs.runs)), rs.runs);
ok("the page says each claimed idea runs on Workflows", /Each claimed idea runs on Cloudflare Workflows/.test(PP.statusPage(st)) && /Idea runs: 4 in total/.test(PP.statusPage(st)));

console.log("[wiring]");
const w = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
ok("worker exports ResearchRunFlow and ticks the research pipeline", /var ResearchRunFlow = class extends WorkflowEntrypoint/.test(w) && /^  ResearchRunFlow,$/m.test(w) && /PD\.researchTick\(PE, env\)/.test(w));
ok("wrangler declares the research-run Workflow", /name = "research-run"\nbinding = "RESEARCH_FLOW"\nclass_name = "ResearchRunFlow"/.test(fs.readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8")));

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
