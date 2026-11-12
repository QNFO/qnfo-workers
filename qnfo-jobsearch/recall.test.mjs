// qnfo-jobsearch prompted-recall suite (PROMPTED-RECALL-1). Run: node qnfo-jobsearch/recall.test.mjs
// Proves: a run stores what each posting asks for that the CV cannot back; the questions come before applying; a yes adds exactly the sentence shown
// (and a skill for a tool) and the resume then carries it and still verifies; a no is never asked again; applied jobs leave the default list.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const w = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const T = w.__test;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const pending = [];
const ctxStub = { waitUntil: (p) => { pending.push(Promise.resolve(p).catch(() => {})); return p; } };
const settle = async () => { while (pending.length) await Promise.all(pending.splice(0)); };
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(here, "../migrations/2026-10-27-jobsearch.sql"), "utf8"));
const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
  first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }) });
const env = { JOBS_DB: { prepare: (s) => stmt(s), batch: async (a) => { for (const x of a) await x.run(); return []; } }, LOOP_TOKEN: "secret-test-token", RELEVANCE_GATE: "off" };
const DESC = "Lead our research program and research operations for public sector clients. You will build Tableau dashboards for agency leaders. Experience with travel demand models and agent-based simulation is a plus. LLM evaluation and audit.";
globalThis.fetch = async (u) => {
  const j = (o) => new Response(JSON.stringify(o), { status: 200 });
  if (String(u).includes("api.ashbyhq.com/posting-api/job-board/openai")) return j({ jobs: [{ id: "r1", title: "Research Program Manager, Mobility", location: "Amsterdam", isRemote: false, jobUrl: "https://jobs/r1", descriptionPlain: DESC }] });
  return j(String(u).includes("lever") ? [] : { jobs: [], data: [] });
};
const H = { "x-loop-token": "secret-test-token", "content-type": "application/json" };
const call = async (path, init, e = env) => { const r = await w.fetch(new Request("https://x" + path, init), e, ctxStub); return [r.status, await r.json().catch(() => null), r]; };

// unit: gaps come from the posting body, with its own sentence as the cue; a title-only word is not asked
const g = T.recallGaps({ title: "Research Lead", desc: "You will use Tableau daily." });
ok(g.some((x) => x.term === "tableau" && x.cue === "You will use Tableau daily.") && !g.some((x) => x.term === "research lead"), "gaps carry the posting sentence as the cue", g);
const q0 = T.recallQuestion("term:tableau");
ok(q0 && q0.ask === "Have you used Tableau in your work?" && q0.depths.length === 3 && q0.depths.every((d) => d.draft.endsWith("Tableau.")) && q0.roles.length >= 1, "a tool question is yes/no with three tap drafts and role chips", q0);
ok(T.recallQuestion("term:not-a-vocabulary-term") === null && T.recallQuestion("seed:nope") === null, "only known terms and seeds can be asked");
ok(T.RECALL_SEED.every((s) => T.recallQuestion("seed:" + s.id).roles.length >= 1), "every seed question offers at least one role chip");

await w.scheduled({}, env, ctxStub); await settle();
let list = (await call("/api/matches"))[1];
ok(list.count === 1 && list.matches[0].recall_open >= 2 && !("gaps_json" in list.matches[0]), "the list says how many quick questions a job has", list.matches[0]);
const id = list.matches[0].id;
ok((await call("/api/recall?match=" + encodeURIComponent(id)))[0] === 401, "questions need the owner session");
let rq = (await call("/api/recall?match=" + encodeURIComponent(id), { headers: H }))[1];
const keys = rq.questions.map((q) => q.key);
ok(keys.includes("term:tableau") && keys.includes("term:travel demand"), "the questions for this job name what it asks for", keys);
const tq = rq.questions.find((q) => q.key === "term:tableau");
ok(/build Tableau dashboards/.test(tq.cue), "the cue quotes the posting", tq.cue);

// yes: the exact sentence shown on the tapped button goes onto the CV, plus a skill
let [st, res] = await call("/api/recall/answer", { method: "POST", headers: H, body: JSON.stringify({ key: "term:tableau", answer: "yes", role: "R05", depth: "hands" }) });
ok(st === 200 && res.added === tq.drafts.hands && res.skill === "Tableau", "a yes adds the drafted line and the skill", res);
ok((await call("/api/recall/answer", { method: "POST", headers: H, body: JSON.stringify({ key: "term:tableau", answer: "maybe" }) }))[0] === 400, "only yes, no or not sure");
[st, res] = await call("/api/recall/answer", { method: "POST", headers: H, body: JSON.stringify({ key: "term:travel demand", answer: "no" }) });
ok(st === 200 && res.added === null, "a no adds nothing", res);
const cv = (await call("/api/cv", { headers: H }))[1];
const fact = cv.facts.find((f) => f.source === "recall:term:tableau");
ok(fact && fact.role === "R05" && fact.status === "verified" && cv.skills.some((s) => s.name === "Tableau"), "the fact is verified and tied to the role", fact);
rq = (await call("/api/recall?match=" + encodeURIComponent(id), { headers: H }))[1];
ok(!rq.questions.some((q) => q.key === "term:tableau" || q.key === "term:travel demand"), "answered questions are not asked again", rq.questions.map((q) => q.key));
list = (await call("/api/matches"))[1];
ok(list.matches[0].recall_open === rq.questions.length, "the count drops as questions are answered", [list.matches[0].recall_open, rq.questions.length]);

// the resume for this job now carries the new line and still passes the checker
const job = { id, company: "OpenAI", title: "Research Program Manager, Mobility", location: "Amsterdam", url: "https://jobs/r1", desc: DESC };
const ctx = await T.loadCtx(env), m = T.evaluate(job, ctx), resume = T.buildResume(job, m);
ok(/tableau/i.test(resume) && T.verify(resume, job).length === 0, "the resume shows the confirmed experience and verifies", T.verify(resume, job));

// changing an answer removes the line it added
await call("/api/recall/answer", { method: "POST", headers: H, body: JSON.stringify({ key: "term:tableau", answer: "no" }) });
const cv2 = (await call("/api/cv", { headers: H }))[1];
ok(!cv2.facts.some((f) => f.source === "recall:term:tableau") && !cv2.skills.some((s) => s.name === "Tableau"), "a changed answer takes its line back out");

// the general queue: questions about the autonomous-systems record plus what open jobs ask for most
const all = (await call("/api/recall?limit=40", { headers: H }))[1];
ok(all.questions.some((q) => q.key === "seed:agent_fleet") && all.questions.some((q) => q.key.startsWith("term:") && q.count >= 1), "the queue mixes record questions and job questions", all.questions.map((q) => q.key));
await call("/api/recall/answer", { method: "POST", headers: H, body: JSON.stringify({ key: "seed:agent_fleet", answer: "unsure" }) });
ok(!(await call("/api/recall?limit=40", { headers: H }))[1].questions.some((q) => q.key === "seed:agent_fleet"), "not sure rests for 14 days");

// applied jobs leave the default list and show under My applications
ok((await call("/api/matches/" + encodeURIComponent(id) + "/status", { method: "POST", headers: H, body: JSON.stringify({ status: "applied" }) }))[0] === 200, "mark applied");
ok((await call("/api/matches"))[1].count === 0, "an applied job is not in the default list");
ok((await call("/api/matches?status=mine"))[1].count === 1 && (await call("/api/matches?status=all"))[1].count === 1, "it is under My applications");
await w.scheduled({}, env, ctxStub); await settle();
ok((await call("/api/matches"))[1].count === 0, "the next run does not bring it back");

const page = await (await w.fetch(new Request("https://x/"), env, ctxStub)).text();
ok(page.includes('id="recallbtn"') && page.includes("function recallGate") && page.includes('value="mine"') && page.includes("Not for me"), "the page has the questions, the gate and the two views");
const api = (await call("/api"))[1];
ok(api.routes["GET /api/recall?match="] && api.routes["POST /api/recall/answer"], "the API index lists the recall routes");
console.log(`qnfo-jobsearch recall: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
