// personal-companion/personal-pipeline.test.mjs: PERSONAL-PIPELINE-1. Run: node personal-companion/personal-pipeline.test.mjs
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import * as PP from "./personal-pipeline.js";
import { buildBlock } from "../scripts/inline-pipeline-modules.mjs";

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok   " + n); } else { fail++; console.log("  FAIL " + n + (x !== undefined ? "  -> " + JSON.stringify(x) : "")); } };
function d1(raw) {
  return { prepare(sql) { let a = []; const api = { bind(...x) { a = x; return api; },
    async run() { const r = raw.prepare(sql).run(...a); return { success: true, meta: { changes: r.changes } }; },
    async all() { return { results: raw.prepare(sql).all(...a) }; }, async first() { return raw.prepare(sql).get(...a) ?? null; } }; return api; }, raw };
}
const P = new DatabaseSync(":memory:"), A = new DatabaseSync(":memory:");
P.exec("CREATE TABLE wellbeing_checkins (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, day TEXT, mood INTEGER, energy INTEGER, source TEXT)");
P.exec("CREATE TABLE cmp_mood (id TEXT PRIMARY KEY, ts TEXT, day TEXT, score INTEGER, energy INTEGER, tags TEXT, note TEXT)");
P.exec("CREATE TABLE cmp_moments (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, day TEXT, kind TEXT, place TEXT, place_kind TEXT, valence INTEGER, energy INTEGER, feelings TEXT)");
P.exec("CREATE TABLE cmp_activity_log (id TEXT PRIMARY KEY, ts TEXT, day TEXT, title TEXT, pleasure INTEGER)");
A.exec("CREATE TABLE jobsearch_matches (id TEXT PRIMARY KEY, company TEXT, title TEXT, status TEXT, first_seen TEXT)");
A.exec("CREATE TABLE jobsearch_events (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT, event TEXT, ts TEXT, note TEXT)");
A.exec("CREATE TABLE research_queue (id INTEGER PRIMARY KEY, status TEXT, created_at TEXT)");
A.exec("INSERT INTO research_queue (status, created_at) VALUES ('queued','2026-11-01'),('published','2026-10-01')");
const env = { PERSONAL: d1(P), AUDIT: d1(A) };

let t = Date.parse("2026-11-12T17:30:00Z"); // 18:30 in Amsterdam
const now = () => new Date(t).toISOString();
const hours = (h) => { t += h * 36e5; };
const ask = (kind) => P.prepare("SELECT * FROM cmp_asks WHERE kind = ? AND answered_at IS NULL ORDER BY id DESC").get(kind);
const answer = (id, key) => P.prepare("UPDATE cmp_asks SET answered_at = ?, answer = ?, answer_label = ? WHERE id = ?").run(now(), key, key, id);
const run = (ref) => P.prepare("SELECT * FROM pipeline_runs WHERE subject_ref = ?").get(ref);

console.log("[the evening tap and a job milestone become inputs]");
A.exec("INSERT INTO jobsearch_matches VALUES ('m1','Magic','Member of Technical Staff, Evals','applied','2026-11-12')");
A.exec("INSERT INTO jobsearch_events (match_id, event, ts) VALUES ('m1','applied','2026-11-12T07:59:00Z'), ('m1','rejected','2026-11-12T08:00:00Z')");
let r = await PP.tick(env, { now });
ok("one evening question, from 18:00 local", r.asked === 1 && ask("pp-day"), r);
ok("the application opens one personal run; an owner dismissal does not", r.opened === 1 && run("job:1") && !run("job:2"), r);
const feel = ask("pp-feel");
ok("it waits for one tap on how sending it felt", run("job:1").status === "waiting" && feel && /Magic/.test(feel.question) && JSON.parse(feel.options_json).length === 5, feel && feel.question);
ok("the tap card offers Great, Good, Mixed, Hard, Not sure", JSON.parse(feel.options_json).map((o) => o.label).join(",") === "Great,Good,Mixed,Hard,Not sure");
const ev = P.prepare("SELECT * FROM personal_events").get();
ok("capture wrote the event in personal-life", ev && ev.kind === "job_applied" && ev.domain === "work" && ev.valence === null);
answer(feel.id, "4"); hours(1);
r = await PP.tick(env, { now });
let row = run("job:1");
ok("the answer finishes the run", row.status === "done" && JSON.parse(row.output_json).valence === 4, row);
ok("the win is counted", P.prepare("SELECT text FROM personal_outcomes WHERE kind = 'win'").get().text.indexOf("You sent an application") === 0);
ok("valence written back to the event", P.prepare("SELECT valence FROM personal_events WHERE id = ?").get(row.id).valence === 4);

console.log("[reaching out: feel, meaning, three-day follow-through]");
answer(ask("pp-day").id, "reached_out"); hours(1);
await PP.tick(env, { now });
const ro = P.prepare("SELECT * FROM pipeline_runs WHERE subject_ref LIKE 'ask:%'").get();
ok("the evening answer is an event", ro && JSON.parse(ro.input_json).kind === "reached_out", ro);
answer(ask("pp-feel").id, "5"); hours(1); await PP.tick(env, { now });
const gave = ask("pp-gave");
ok("something good gets one 'what did it give you' tap", gave && JSON.parse(gave.options_json).map((o) => o.key).join(",") === "energy,connection,ideas,calm,unsure");
answer(gave.id, "connection"); hours(1); await PP.tick(env, { now });
ok("then it waits three days before following through", run(ro.subject_ref).stage === "follow" && !ask("pp-follow"));
for (let i = 0; i < 13; i++) { hours(6); await PP.tick(env, { now }); }
const fol = ask("pp-follow");
ok("after three days: did it lead anywhere?", !!fol, run(ro.subject_ref));
answer(fol.id, "plan"); hours(6); await PP.tick(env, { now });
ok("a plan becomes a win and the run ends", run(ro.subject_ref).status === "done" && P.prepare("SELECT 1 FROM personal_outcomes WHERE ref = ?").get("follow:" + ro.id));
ok("gave stored on the event", P.prepare("SELECT gave FROM personal_events WHERE id = ?").get(ro.id).gave === "connection");

console.log("[taps that already carry the feeling, and silence]");
P.prepare("INSERT INTO cmp_mood VALUES ('mood1', ?, '2026-11-15', 2, 1, 'tired,tense', NULL)").run(now());
await PP.tick(env, { now });
ok("a mood tap needs no question and finishes at once", run("mood:mood1").status === "done" && !P.prepare("SELECT 1 FROM cmp_asks WHERE ref = ?").get(run("mood:mood1").id));
P.prepare("INSERT INTO cmp_activity_log VALUES ('a1', ?, '2026-11-15', 'Walk by the canal', NULL)").run(now());
await PP.tick(env, { now });
const aRun = run("activity:a1");
for (let i = 0; i < 37; i++) { hours(1); await PP.tick(env, { now }); }
ok("an unanswered question expires after 36 hours and the run ends on its default", run("activity:a1").status === "done" && P.prepare("SELECT answer FROM cmp_asks WHERE kind = 'pp-feel' AND ref = ?").get(aRun.id).answer === "expired");

console.log("[patterns become insights and next steps]");
const day = (d) => "2026-10-" + String(d).padStart(2, "0");
for (let d = 1; d <= 20; d++) P.prepare("INSERT INTO wellbeing_checkins (ts, day, mood, source) VALUES (?,?,?, 'companion')").run(day(d) + "T20:00:00Z", day(d), [2, 6, 10].includes(d - 1) ? 5 : 3);
for (const d of [2, 6, 10]) P.prepare("INSERT INTO personal_events (id, ts, day, kind, domain, label, valence, source, created_at) VALUES (?,?,?,'outing','culture','A show',5,'test',?)").run("seed" + d, day(d) + "T21:00:00Z", day(d), now());
const pat = await PP.patterns(env.PERSONAL, now());
ok("next-day mood after going out is above the usual", pat.helped[0] && pat.helped[0].domain === "culture" && pat.helped[0].lift > 0.3, pat);
P.prepare("INSERT INTO cmp_mood VALUES ('mood2', ?, '2026-11-16', 1, 1, NULL, NULL)").run(now());
await PP.tick(env, { now });
ok("a hard day gets the thing that has helped before", (P.prepare("SELECT text FROM personal_outcomes WHERE kind = 'next_step'").get() || {}).text === "On days like this, going out to a show or an event has helped you before.");
P.prepare("INSERT INTO cmp_asks (kind, ref, question, options_json, created_at, answered_at, answer, answer_label) VALUES ('pp-day', 'test-outing', 'q', '[]', ?, ?, 'outing', 'Went out (show, concert, event)')").run(now(), now());
await PP.tick(env, { now });
answer(ask("pp-feel").id, "5"); hours(1); await PP.tick(env, { now });
answer(ask("pp-gave").id, "energy"); hours(1); await PP.tick(env, { now });
ok("a good outing while the pattern holds writes the insight", /^After going out, your next-day mood runs \d\.\d points above your usual \(3 times in 90 days\)\.$/.test((P.prepare("SELECT text FROM personal_outcomes WHERE kind = 'insight'").get() || {}).text), P.prepare("SELECT kind, text FROM personal_outcomes").all());

console.log("[outcomes reach the morning brief once]");
const L = await PP.briefLines(env, now());
ok("brief lines lead with the next step", L[1] === "From your week:" && /On days like this/.test(L[2]), L);
const seen = L.slice(2).filter((x) => !/wins in seven days/.test(x));
for (let k = 0; k < 5; k++) seen.push(...(await PP.briefLines(env, now())).slice(2).filter((x) => !/wins in seven days/.test(x)));
ok("each outcome is shown once, at most four a morning", L.length <= 7 && new Set(seen).size === seen.length && !P.prepare("SELECT 1 FROM personal_outcomes WHERE surfaced_at IS NULL").get(), seen);

console.log("[Workflows path, fallback and adoption]");
const created = [];
const envWf = Object.assign({}, env, { PERSONAL_FLOW: { async create(o) { created.push(o.id); } } });
P.prepare("INSERT INTO cmp_mood VALUES ('mood3', ?, '2026-11-16', 4, 3, NULL, NULL)").run(now());
r = await PP.tick(envWf, { now });
ok("a new input starts as a Workflow instance with the run id", r.workflow === 1 && created[0] === run("mood:mood3").id && run("mood:mood3").mode === "workflow", r);
const cache = new Map();
const step = { async do(n, o, fn) { if (typeof o === "function") fn = o; if (!cache.has(n)) cache.set(n, await fn()); return cache.get(n); }, async sleep() {} };
const wr = await PP.runWorkflow(envWf, { runId: run("mood:mood3").id }, step);
ok("the Workflow body runs the same stages to done", wr.status === "done" && run("mood:mood3").status === "done", wr);
const envBad = Object.assign({}, env, { PERSONAL_FLOW: { async create() { throw new Error("workflow not found"); } } });
P.prepare("INSERT INTO cmp_mood VALUES ('mood4', ?, '2026-11-16', 3, 3, NULL, NULL)").run(now());
r = await PP.tick(envBad, { now });
ok("create() failing falls back inline, with evidence", r.inline === 1 && run("mood:mood4").status === "done" && P.prepare("SELECT 1 FROM pipeline_evidence WHERE run_id = ? AND stage = 'start' AND ok = 0").get(run("mood:mood4").id));
P.prepare("INSERT INTO cmp_mood VALUES ('mood5', ?, '2026-11-16', 3, 3, NULL, NULL)").run(now());
await PP.tick(Object.assign({}, env, { PERSONAL_FLOW: { async create() {} } }), { now });
hours(4);
r = await PP.tick(env, { now });
ok("a Workflow run quiet for 3 hours is adopted inline and finished", r.adopted === 1 && run("mood:mood5").status === "done", r);

console.log("[status view: counts only]");
const st = await PP.statusAll(env, t);
const s = JSON.stringify(st);
ok("three pipelines on one engine", st.pipelines.map((p) => p.pipeline).join(",") === "personal,research,jobs", st.pipelines.map((p) => p.pipeline || p.error));
ok("no label, company or answer leaves the plane", !/Magic|Paradiso|canal|tired|connection/.test(s));
ok("healthy when nothing failed or stuck", st.healthy === true, st.pipelines[0]);
const html = PP.statusPage(st);
ok("status page names every pipeline and stage", /Personal: what happens/.test(html) && /Research: idea to publication/.test(html) && /Jobs: posting to offer/.test(html) && /How it felt/.test(html));

console.log("[PROMPTED-RECALL-1 and inlining]");
let threw = false; try { PP.askOptions([{ key: "a", label: "A" }]); } catch (e) { threw = true; }
ok("a question needs 2 to 4 options", threw);
for (const k of Object.keys(PP.KINDS)) if (!PP.DOMAIN[PP.KINDS[k].domain]) ok("domain for " + k, false);
const w = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const block = buildBlock(new URL("../", import.meta.url));
ok("worker.js carries the current engine and pipeline (run scripts/inline-pipeline-modules.mjs)", w.indexOf(block) >= 0);
ok("deployed-current mirror carries it too", fs.readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8").indexOf(block) >= 0);
ok("wrangler declares the Workflow", /class_name = "PersonalPipelineFlow"/.test(fs.readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8")));

console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
