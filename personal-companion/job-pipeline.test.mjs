// personal-companion/job-pipeline.test.mjs: PIPELINE-ENGINE-PORT-1. The job pipeline is executed on the shared engine: one
// job-application run per application in qnfo-audit, waits as Workflow sleeps (or inline on the hourly tick).
// Run: node personal-companion/job-pipeline.test.mjs
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
A.exec("CREATE TABLE jobsearch_matches (id TEXT PRIMARY KEY, company TEXT, title TEXT, status TEXT, first_seen TEXT)");
A.exec("CREATE TABLE jobsearch_events (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT, event TEXT, ts TEXT, note TEXT)");
A.exec("CREATE TABLE research_queue (id INTEGER PRIMARY KEY, status TEXT, created_at TEXT)");
const ins = A.prepare("INSERT INTO jobsearch_matches VALUES (?, 'Co', 'Role', ?, '2026-11-01')");
const evt = A.prepare("INSERT INTO jobsearch_events (match_id, event, ts) VALUES (?, ?, '2026-11-10T10:00:00Z')");
ins.run("quiet", "applied"); evt.run("quiet", "applied");
ins.run("hired", "applied"); evt.run("hired", "applied");
ins.run("closed", "rejected"); evt.run("closed", "applied"); evt.run("closed", "rejected");
ins.run("declined", "rejected");                               // a posting the owner turned down: never an application
ins.run("found", "pending_owner_approval");
const setStatus = (id, st) => A.prepare("UPDATE jobsearch_matches SET status = ? WHERE id = ?").run(st, id);
const run = (ref) => A.prepare("SELECT * FROM pipeline_runs WHERE pipeline = 'job-application' AND subject_ref = ?").get(ref);

let t = Date.parse("2026-11-12T12:00:00Z");
const now = () => new Date(t).toISOString();
const days = (d) => { t += d * 864e5; };

console.log("[definition]");
const def = PD.jobApplicationPipeline(E);
ok("stages applied, follow-up, conversation, outcome", def.stages.map((s) => s.key).join(",") === "applied,followup,conversation,outcome");
ok("jobs funnel is executed and names its runs", PD.jobsPipeline(E).mode === "executed" && PD.jobsPipeline(E).runs === "job-application");
ok("the follow-up wait never writes a status: no UPDATE of jobsearch_matches in the defs", !/UPDATE jobsearch_matches/.test(fs.readFileSync(new URL("../_shared/pipeline-defs.js", import.meta.url), "utf8")));

console.log("[inline path: no Workflow binding]");
const env = { AUDIT: d1(A), PERSONAL: d1(P) };
let r = await PD.jobsTick(E, env, { now });
ok("opens one run per application, none for a declined or unapplied posting", r.opened === 3 && run("quiet") && run("hired") && run("closed") && !run("declined") && !run("found"), r);
ok("a second tick opens nothing new", (await PD.jobsTick(E, env, { now })).opened === 0);
ok("an open application waits in follow-up", run("quiet").status === "waiting" && run("quiet").stage === "followup");
ok("a closed application finishes at once with its outcome", run("closed").status === "done" && JSON.parse(run("closed").output_json).outcome === "rejected", run("closed"));

console.log("[applied -> interview -> offer]");
days(3); setStatus("hired", "interview");
await PD.jobsTick(E, env, { now });
ok("a reply moves the run into the conversation wait", run("hired").stage === "conversation" && run("hired").status === "waiting", run("hired"));
days(10); setStatus("hired", "offer");
await PD.jobsTick(E, env, { now });
ok("an offer finishes it", run("hired").status === "done" && JSON.parse(run("hired").output_json).outcome === "offer", run("hired"));
const ev = A.prepare("SELECT stage FROM pipeline_evidence WHERE run_id = ? ORDER BY id").all(run("hired").id).map((e) => e.stage);
ok("evidence for each stage", ["open", "applied", "followup", "conversation", "outcome", "finish"].every((s) => ev.includes(s)), ev);

console.log("[applied -> quiet: no status is written]");
for (let k = 0; k < PD.JOB_FOLLOWUP_DAYS + 2; k++) { days(1); await PD.jobsTick(E, env, { now }); }
const q = run("quiet");
ok("after 45 quiet days the run ends as quiet", q.status === "done" && JSON.parse(q.output_json).outcome === "quiet", q);
ok("the application keeps its status", A.prepare("SELECT status FROM jobsearch_matches WHERE id = 'quiet'").get().status === "applied");

console.log("[Workflow path, fallback and adoption]");
ins.run("wf", "applied"); evt.run("wf", "applied");
ins.run("wf2", "applied"); evt.run("wf2", "applied");
const created = [];
const envWf = { AUDIT: d1(A), JOB_FLOW: { async create(x) { if (x.params.runId === E.runId("job-application", "wf2")) throw new Error("no such workflow"); created.push(x); } } };
r = await PD.jobsTick(E, envWf, { now });
ok("create() is called with the run id as instance id", created.length === 1 && created[0].id === run("wf").id && run("wf").mode === "workflow", created);
ok("a failed create() continues inline with evidence", run("wf2").mode === "inline" && A.prepare("SELECT ok FROM pipeline_evidence WHERE run_id = ? AND stage = 'start'").get(run("wf2").id).ok === 0);
days(4);
r = await PD.jobsTick(E, envWf, { now });
ok("a Workflow run quiet for 3 days is adopted inline", r.adopted === 1 && run("wf").mode === "inline", r);
ins.run("wf3", "applied"); evt.run("wf3", "applied");
const o = await E.openRun(env.AUDIT, def, { match_id: "wf3" }, { subjectRef: "wf3", now: now() });
let n = 0; const step3 = { async do(a, b, fn) { if (typeof b === "function") fn = b; return fn(); }, async sleep() { n++; if (n === 2) setStatus("wf3", "rejected"); } };
const res = await PD.runJobWorkflow(E, env, { runId: o.id }, step3);
ok("the Workflow body sleeps a day per poll and finishes on the reply", res.status === "done" && res.output.outcome === "rejected" && n === 2, { res, n });

console.log("[status view]");
const st = await PP.statusAll({ PERSONAL: d1(P), AUDIT: d1(A) }, t);
const jobs = st.pipelines.find((p) => p.pipeline === "jobs");
const js = JSON.stringify(jobs);
ok("jobs reads as executed (the closing probe's string)", JSON.stringify(st).includes('"pipeline":"jobs","label":"Jobs: posting to offer","plane":"jobs","version":"1.0.0","mode":"executed"'), js.slice(0, 200));
ok("jobs carries its application runs, counts only", jobs.runs && jobs.runs.total === 6 && !/Co|Role|quiet|hired/.test(JSON.stringify(jobs.runs)), jobs.runs);
const html = PP.statusPage(st);
ok("the page says each application runs on Workflows", /Each application runs on Cloudflare Workflows/.test(html) && /Application runs: 6 in total/.test(html));

console.log("[wiring]");
const w = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
ok("worker exports JobApplicationFlow and ticks the job pipeline", /var JobApplicationFlow = class extends WorkflowEntrypoint/.test(w) && /^  JobApplicationFlow,$/m.test(w) && /PD\.jobsTick\(PE, env\)/.test(w));
ok("wrangler declares the job-application Workflow", /name = "job-application"\nbinding = "JOB_FLOW"\nclass_name = "JobApplicationFlow"/.test(fs.readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8")));

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
