// JOBS-PIPELINE-1 / STYLE-LINT-1 suite. Run: node qnfo-jobsearch/pipeline.test.mjs
// Proves: one intake takes a job from anywhere and never twice; LinkedIn links are tracked and never fetched; the lifecycle keeps dated events and the exact
// application; submitted answers are searchable and prefill new questions; status e-mails update the pipeline; the relevance gate hides what is not in a lane and the
// short list is short; the style lint fails the tells of machine-written prose and passes the owner's own answers.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const w = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const T = w.__test;
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

// ---- style lint
const AI = "I am passionate about leveraging cutting-edge AI to unlock robust, seamless outcomes. It is not just a job, it's a calling — and I am excited to delve in.";
const lint = T.styleLint(AI);
ok(lint.length >= 4, "machine-written prose trips several tells", lint);
ok(T.styleLint("In today's fast-paced world I would bring a holistic approach.").length >= 3, "stock openers and words trip");
for (const b of T.ANSWER_BANK) ok(T.styleLint(b.answer).length === 0, "owner's own answer " + b.type + " passes the lint", T.styleLint(b.answer));
ok(T.styleLint("I ran the model at DVRPC for three years. It broke twice; both times the cause was the input network, which nobody had checked. I fixed the check, not the model.").length === 0, "plain specific prose passes");
ok(T.styleLint("I like maps. I like models. I like data. I like rules. I like tests. I like notes.").some((x) => /start with|same length/.test(x)), "monotone rhythm trips");

// ---- gate
const row = (o) => ({ id: "x", title: "Director of AI Governance", tier: "A", score: 70, why: ["title in your lane: autonomy", "AI read: fit 72 (6 of your facts match)"], ...o });
ok(T.laneGate(row({})).pass, "a governance director role clears the gate");
ok(!T.laneGate(row({ title: "Senior Python Developer" })).pass, "developer titles do not");
ok(!T.laneGate(row({ title: "Commercial Account Executive, DACH" })).pass, "sales titles do not");
ok(!T.laneGate(row({ score: 54 })).pass, "score under 55 does not");
ok(!T.laneGate(row({ tier: "C" })).pass, "stretch matches do not");
ok(!T.laneGate(row({ title: "Domain Researcher, Legal", why: ["AI read: fit 28 (8 of your facts match)"] })).pass, "a low model reading does not");
ok(!T.laneGate(row({ title: "Contract Manager", why: [] })).pass, "no lane no pass");

// ---- mail parsing
ok(T.parseJobMail("no-reply@turing.com", "Turing: Thank you for your interest, Rowan Brad", "Thanks for applying to Turing. We are happy to see that you are interested").event === "applied", "confirmation mail = applied");
ok(T.parseJobMail("a@x.com", "Update on your application to Flexport", "Unfortunately we have decided not to move forward").event === "rejected", "rejection mail = rejected");
ok(T.parseJobMail("a@x.com", "Interview with Tavily", "We would like to schedule a call with you").event === "interview", "invitation mail = interview");
ok(T.parseJobMail("a@x.com", "Weekly digest", "ten new jobs").event === "", "a newsletter is ignored");
ok(T.linkedinJobUrl("https://www.linkedin.com/jobs/view/senior-ai-lead-at-acme-4012345678/?trk=x") === "https://www.linkedin.com/jobs/view/4012345678", "LinkedIn job link is normalised");
ok(T.linkedinJobUrl("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4099999999") === "https://www.linkedin.com/jobs/view/4099999999", "LinkedIn collection link carries the job id");

// ---- pipeline over sqlite
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(here, "../migrations/2026-10-27-jobsearch.sql"), "utf8"));
const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
  first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }) });
const env = { JOBS_DB: { prepare: (s) => stmt(s), batch: async (a) => { for (const x of a) await x.run(); return []; } }, LOOP_TOKEN: "t" };
const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response("", { status: 404 });
const POST = "Director of AI Governance at Acme Assurance. Amsterdam or remote in Europe. You will lead evaluation and oversight of autonomous AI agents, write policy for human oversight, and direct a research programme on AI risk, evaluation and governance. Autonomous systems, assurance, policy research, risk.";
const a = await T.intakeJob(env, { input: POST, title: "Director of AI Governance", company: "Acme Assurance", status: "saved" });
ok(a.id.startsWith("manual:") && !a.duplicate && a.status === "saved", "pasted text becomes a tracked job", a);
const dupe = await T.intakeJob(env, { input: POST, title: "Director of AI Governance", company: "Acme Assurance" });
ok(dupe.duplicate && dupe.id === a.id, "the same job is never added twice");
let err; try { await T.intakeJob(env, { input: "https://www.linkedin.com/jobs/view/4012345678/" }); } catch (e) { err = e; }
ok(err && err.status === 422 && /not fetched/.test(err.message), "a bare LinkedIn link asks for the title instead of fetching", err && err.message);
const li = await T.intakeJob(env, { input: "https://www.linkedin.com/jobs/view/senior-risk-lead-4012345678/", title: "Senior AI Risk Lead", company: "Northwind", status: "saved" });
ok(li.source === "linkedin" && db.prepare("SELECT url FROM jobsearch_matches WHERE id=?").get(li.id).url === "https://www.linkedin.com/jobs/view/4012345678", "LinkedIn share is tracked with its clean link", li);
await T.setPipeStatus(env, a.id, "applied", "owner");
ok(db.prepare("SELECT resume_md FROM jobsearch_apps WHERE match_id=?").get(a.id).resume_md, "marking applied freezes the resume as sent");
const q = await T.saveQa(env, a.id, [{ q: "Why do you want to work at Acme?", a: "I have spent two years running an autonomous platform and want to work on how such systems are overseen." }, { q: "What is the most misleading metric you have met?", a: "Test pass rates." }]);
ok(q.saved === 2, "questions and answers are kept with the job");
const lib = await T.answerLibrary(env, "autonomous");
ok(lib.items.some((i) => i.source === "submitted" && /Acme/.test(i.job)) && lib.types.motivation >= 1, "the library finds a submitted answer by a word in it", lib.types);
const mm = await T.matchQuestions(env, ["Why do you want to join Acme Assurance?", "What is your expected salary?", "What are your career goals?", "Describe your favourite bridge"]);
ok(mm.answers[0].status === "similar_earlier_answer", "a similar question gets the earlier answer", mm.answers[0].status);
ok(mm.answers[1].status === "owner_only" && mm.answers[2].status === "from_bank" && mm.answers[3].status === "new", "pay is yours, banked is banked, the rest is new", mm.answers.map((x) => x.status));
const mail = await T.applyJobMail(env, { from: "jobs@acmeassurance.com", subject: "Interview with Acme Assurance", body: "We would like to schedule a call with you for the Director role at Acme Assurance." });
ok(mail.matched && mail.event === "interview", "an interview mail moves the application", mail);
await T.setPipeStatus(env, a.id, "rejected", "employer");
const pl = await T.pipeline(env);
const it = pl.items.find((x) => x.id === a.id);
ok(it && it.stage === "rejected" && it.questions === 2 && it.events.map((e) => e.event).join(",").includes("applied") && it.events.some((e) => e.event === "interview"), "the pipeline shows the whole lifecycle with dates", it && it.events);
ok(pl.items.find((x) => x.id === li.id).stage === "saved", "a saved job sits in Saved");
// relevance gate + short list
const ins = db.prepare("INSERT INTO jobsearch_matches (id, first_seen, last_seen, company, title, location, url, tier, score, why_json, flags_json, verified, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,'pending_owner_approval')");
const now = new Date().toISOString();
ins.run("g:1", now, now, "Good Co", "Head of AI Evaluation", "Amsterdam", "https://x/1", "A", 80, JSON.stringify(["LLM: Leads evaluation of agent systems, which is the work in your record.", "AI read: fit 74 (9 of your facts match)"]), "[]");
ins.run("g:2", now, now, "Bad Co", "APAC Python Tutor", "Remote", "https://x/2", "B", 52, "[]", "[]");
ins.run("g:3", now, now, "Meh Co", "Contract Manager", "Remote", "https://x/3", "A", 60, "[]", "[]");
const sw = await T.relevanceSweep(env);
ok(sw.hidden === 2 && sw.kept === 1, "the sweep hides what fails the gate", sw);
ok(db.prepare("SELECT status FROM jobsearch_matches WHERE id='g:2'").get().status === "expired" && db.prepare("SELECT note FROM jobsearch_events WHERE match_id='g:2' AND event='hidden'").get().note.length > 5, "a hidden job says why");
ok(db.prepare("SELECT status FROM jobsearch_matches WHERE id=?").get(a.id).status === "rejected", "the sweep never touches a decided job");
const sl = await T.shortlist(env);
ok(sl.size === 1 && sl.items[0].id === "g:1" && /Leads evaluation/.test(sl.items[0].why_it_fits), "the short list holds the one job that clears the bar, with its reason", sl);
// routes
const call = async (path, init) => { const r = await w.fetch(new Request("https://x" + path, init), env, { waitUntil() {} }); return [r.status, await r.json().catch(() => null), r]; };
ok((await call("/api/intake", { method: "POST", body: "{}" }))[0] === 401, "intake needs the owner");
ok((await call("/api/intake", { method: "POST", headers: { "x-loop-token": "t", "content-type": "application/json" }, body: JSON.stringify({ input: POST, title: "Director of AI Governance", company: "Acme Assurance" }) }))[1].duplicate === true, "intake over the API");
ok((await call("/api/shortlist"))[1].size === 1, "short list is a public read");
db.exec("CREATE TABLE IF NOT EXISTS owner_asks (id INTEGER PRIMARY KEY AUTOINCREMENT, plane TEXT, kind TEXT, ref TEXT, question TEXT, cue TEXT, options_json TEXT, priority INTEGER, created_at TEXT, answered_at TEXT, answer TEXT, answer_label TEXT, answered_via TEXT)");
db.prepare("INSERT INTO owner_asks (plane, kind, ref, question, options_json, answer, answered_at) VALUES ('jobs','resume-claim','claim_x','q','[]','no','2026-11-12')").run();
ok((await call("/api/resume-claims"))[1].claims[0].answer === "no", "resume claim answers are readable");
const page = await (await w.fetch(new Request("https://x/"), env, { waitUntil() {} })).text();
ok(/id="addsave"/.test(page) && />Today</.test(page) && />Answers</.test(page) && /manifest\.webmanifest/.test(page), "home shows Today, Answers and the add box");
const sh = await w.fetch(new Request("https://x/add?url=https%3A%2F%2Fwww.linkedin.com%2Fjobs%2Fview%2F4012345678&title=Lead"), env, { waitUntil() {} });
ok(sh.status === 302 && /\?add=/.test(sh.headers.get("location")), "the share target lands on the add box");
globalThis.fetch = realFetch;
console.log(`pipeline: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
