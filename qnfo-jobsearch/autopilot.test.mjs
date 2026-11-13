// JOBSEARCH-AUTOPILOT-1 suite (owner 2026-11-12): one resume template for every PDF, mission-first ranking, truthful auto-apply answers,
// the queue and its self-promotion from rehearsal to submission, keyless runner sign-in, RSS sources, and e-mail only when something happened.
// Run: node qnfo-jobsearch/autopilot.test.mjs
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const T = worker.__test;
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(here, "../migrations/2026-10-27-jobsearch.sql"), "utf8"));
db.exec("CREATE TABLE IF NOT EXISTS owner_asks (id INTEGER PRIMARY KEY AUTOINCREMENT, plane TEXT, kind TEXT, ref TEXT, question TEXT, cue TEXT, options_json TEXT, priority INTEGER, answer TEXT, answer_label TEXT, answered_at TEXT, answered_via TEXT, UNIQUE(kind, ref))");
const stmt = (sql, args = []) => ({
  bind: (...values) => stmt(sql, values),
  run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
  first: async () => db.prepare(sql).get(...args) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...args) }),
});
const mails = [];
const env = { JOBS_DB: { prepare: (sql) => stmt(sql), batch: async (a) => { for (const x of a) await x.run(); return []; } }, LOOP_TOKEN: "test-token",
  EMAIL: { fetch: async (u, init) => { mails.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); } } };
const req = (path, init = {}) => worker.fetch(new Request("https://x" + path, init), env, { waitUntil: () => {} });
let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; };

// 1. one template: every tailored resume has the same header, sections, role headings, earlier roles, education and certifications
const jobs = [
  { title: "Senior AI Governance Lead", company: "GiveDirectly", location: "Remote", desc: "AI governance, oversight, audit and evaluation of autonomous systems; policy research." },
  { title: "Transport Modelling Lead", company: "Sweco", location: "Amsterdam", desc: "Travel demand forecasting, network models, transport planning, GIS, federal programs." },
  { title: "Research Program Manager", company: "Nesta", location: "London", desc: "Research management, grants, survey methods, data products, stakeholder engagement, housing and ageing policy." },
  { title: "Head of Data", company: "Acme", location: "Remote", desc: "Data science leadership, machine learning, predictive analytics, product strategy, dashboards." },
  { title: "Executive Director", company: "Foundation X", location: "Utrecht", desc: "" },
];
await req("/api/ledger");   // loads the bank
const canon = T.canonicalSkeleton();
ok(canon.some((l) => l === "S Experience") && canon.some((l) => l === "S Education"), "the canonical skeleton has the fixed sections");
for (const j of jobs) {
  const a = T.tailoredResume(j, { clusters: [] }), b = T.tailoredResume(j, { clusters: ["transport_modeling", "research_mgmt", "ai_systems", "autonomous_systems", "data_science"] });
  ok(a.verified && b.verified, "drafts verify: " + j.title + " " + (a.blocked || b.blocked || ""));
  ok(JSON.stringify(T.resumeSkeleton(a.resume)) === JSON.stringify(canon), "same structure whatever the posting (no clusters): " + j.title);
  ok(JSON.stringify(T.resumeSkeleton(b.resume)) === JSON.stringify(canon), "same structure whatever the posting (clusters): " + j.title);
}
ok(T.resumeSkeleton("# A\nx\ny\n## Experience\n**R1**, Org | 2020\n- fact").join("|") !== T.resumeSkeleton("# A\nx\ny\n## Experience\n**R2**, Org | 2020\n- fact").join("|"), "a different role heading is a different skeleton");
ok(T.resumeSkeleton("# A\nx\ny\n## Experience\n**R1**, Org | 2020\n- fact one").join("|") === T.resumeSkeleton("# A\nx\ny\n## Experience\n**R1**, Org | 2020\n- fact two").join("|"), "a tailored fact is not structure");

// 2. mission-first ranking
ok(T.orgKind({ company: "givedirectly", desc: "" }).kind === "nonprofit", "a known nonprofit");
ok(T.orgKind({ company: "Acme", desc: "We are a 501(c)(3) working on AI policy." }).bonus > 0, "501(c)(3) in the posting");
ok(T.orgKind({ company: "Acme", desc: "Acme is a Certified B Corporation." }).kind === "bcorp", "B Corp");
ok(T.orgKind({ company: "Acme", desc: "We just raised our seed round and you would be a founding team member." }).kind === "early", "early-stage start-up");
ok(T.orgKind({ company: "Megacorp", desc: "A Fortune 500 company listed on the NYSE." }).bonus < 0, "large profit-driven company ranks lower");
ok(T.orgKind({ company: "Acme", desc: "Work on foundation models." }).kind === "", "'foundation models' is not a foundation");

// 3. truthful answers
const job = { title: "AI Governance Lead", company: "GiveDirectly", location: "Amsterdam, Netherlands", desc: "" };
const R = (label, extra = {}) => T.resolveQuestion({ label, type: "text", options: [], required: true, ...extra }, job, {});
ok(R("First Name").value === "Rowan" && R("Email").value.includes("@"), "name and e-mail from the record");
ok(R("Phone").unresolved, "no phone number in the record: the job is skipped, never invented");
ok(R("Are you legally authorized to work in the Netherlands?", { type: "select", options: ["Yes", "No"] }).option === "Yes", "authorized in NL (owner stated)");
ok(R("Will you now or in the future require visa sponsorship?", { type: "select", options: ["Yes", "No"] }).option === "No", "no sponsorship for an NL role");
ok(R("Are you authorized to work in the European Union?", { type: "select", options: ["Yes", "No"] }).unresolved, "EU-wide authorization is not in the record: unresolved and asked");
ok(R("Are you authorized to work in Germany?", { type: "select", options: ["Yes", "No"] }).option === "No", "another single country: a truthful No");
ok(R("Gender", { type: "select", options: ["Male", "Female", "Decline to self-identify"] }).option === "Decline to self-identify", "demographics: decline");
ok(R("What are your salary expectations?").unresolved && R("Salary expectations", { required: false }).skip, "salary is never guessed");
ok(R("Do you have experience with Kubernetes in production?", { type: "select", options: ["Yes", "No"] }).unresolved, "an unknown yes/no question waits for the owner's tap");
const key = R("Do you have experience with Kubernetes in production?", { type: "select", options: ["Yes", "No"] }).ask;
ok(T.resolveQuestion({ label: "Do you have experience with Kubernetes in production?", type: "select", options: ["Yes", "No"], required: true }, job, { [key]: "no" }).option === "No", "after the tap the answer is reused");
ok(R("Resume/CV", { type: "file" }).file === "resume" && R("Cover Letter", { type: "file", required: false }).file === "cover", "files");
ok(R("I agree to the privacy policy", { type: "checkbox" }).check === true, "consent box");
ok(R("How did you hear about us?", { type: "select", options: ["LinkedIn", "Job board", "Referral"] }).option === "Job board", "source question");

// 4. the queue, rehearsal, promotion to submission, and the record
const now = new Date().toISOString();
const ins = db.prepare("INSERT INTO jobsearch_matches (id, first_seen, last_seen, company, title, location, url, tier, score, why_json, flags_json, verified, resume_md, note_md, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)");
await req("/api/autopilot");   // creates the tables
for (let i = 1; i <= 4; i++) ins.run("ab:org" + i + ":1", now, now, "Org" + i, "Senior AI Governance Lead", "Amsterdam", `https://jobs.ashbyhq.com/org${i}/0a1b2c3d-1111-2222-3333-44445555666${i}`, "A", 80, JSON.stringify(["title in your lane: governance"]), "[]", "# Rowan\nresume", "note", "pending_owner_approval");
ins.run("gh:big:1", now, now, "Big", "Account Executive", "Amsterdam", "https://boards.greenhouse.io/big/jobs/1", "A", 90, "[]", "[]", "# r", "n", "pending_owner_approval");
const unauth = await req("/api/autopilot/queue");
ok(unauth.status === 401, "the queue is closed without the runner's token");
const H = { "x-loop-token": "test-token", "content-type": "application/json" };
let q = await (await req("/api/autopilot/queue", { headers: H })).json();
ok(q.items.length === 4 && q.items.every((x) => x.mode === "dry" && x.ats === "ashby"), "four lane matches queued in rehearsal; the sales title is not: " + JSON.stringify(q.items.map((x) => x.id)));
ok(q.items[0].resume_pdf.includes("/resume.pdf") && q.items[0].fields.email, "an item carries the resume link and the fields");
const res = await (await req("/api/autopilot/resolve", { method: "POST", headers: H, body: JSON.stringify({ id: "ab:org1:1", questions: [{ label: "Name", type: "text", required: true }, { label: "Phone", type: "tel", required: true }] }) })).json();
ok(!res.ready && res.unresolved[0].reason.includes("phone"), "a required phone makes the job not ready");
for (const id of ["ab:org1:1", "ab:org2:1"]) await req("/api/autopilot/result", { method: "POST", headers: H, body: JSON.stringify({ id, mode: "dry", outcome: "dry_ready" }) });
ok((await (await req("/api/autopilot")).json()).modes.ashby === "dry", "LIVE-RELEASE-1: before the owner's release the form type stays a rehearsal");
await env.JOBS_DB.prepare("INSERT OR REPLACE INTO jobsearch_meta (k, v, updated_at) VALUES ('autopilot_live_release','yes','t')").run();
ok((await (await req("/api/autopilot")).json()).modes.ashby === "submit", "two clean rehearsals promote the form type to submission");
q = await (await req("/api/autopilot/queue", { headers: H })).json();
ok(q.items.some((x) => x.id === "ab:org1:1" && x.mode === "submit"), "a rehearsed job comes back for the real submission");
const r = await (await req("/api/autopilot/result", { method: "POST", headers: H, body: JSON.stringify({ id: "ab:org1:1", mode: "submit", outcome: "applied", confirmation: "Thanks for applying", questions: [{ q: "Name", a: "Rowan" }], resume_sha: "abc" }) })).json();
ok(r.ok && db.prepare("SELECT status FROM jobsearch_matches WHERE id='ab:org1:1'").get().status === "applied", "an applied result marks the application applied");
ok(JSON.parse(db.prepare("SELECT qa_json FROM jobsearch_apps WHERE match_id='ab:org1:1'").get().qa_json).length === 1, "every question and answer is kept with the application");
q = await (await req("/api/autopilot/queue", { headers: H })).json();
ok(!q.items.some((x) => x.id === "ab:org1:1"), "an applied job is never queued again");
for (const id of ["ab:org2:1", "ab:org3:1"]) await req("/api/autopilot/result", { method: "POST", headers: H, body: JSON.stringify({ id, mode: "submit", outcome: "unconfirmed" }) });
ok((await (await req("/api/autopilot")).json()).modes.ashby === "dry", "two unconfirmed submissions send the form type back to rehearsal");
await req("/api/autopilot/result", { method: "POST", headers: H, body: JSON.stringify({ id: "ab:org4:1", mode: "submit", outcome: "captcha" }) });
ok(db.prepare("SELECT status FROM jobsearch_matches WHERE id='ab:org4:1'").get().status === "approved", "a CAPTCHA leaves the job ready for one tap");

// 5. keyless sign-in: a forged token is refused
const fake = ["eyJhbGciOiJSUzI1NiIsImtpZCI6IngifQ", Buffer.from(JSON.stringify({ iss: "https://token.actions.githubusercontent.com", aud: "qnfo-jobsearch", repository: "rwnq8/personal-life", exp: Date.now() / 1000 + 600 })).toString("base64url"), "c2ln"].join(".");
ok(!(await T.githubOidcOk(new Request("https://x", { headers: { authorization: "Bearer " + fake } }))), "an unsigned token is refused");
ok(!(await T.githubOidcOk(new Request("https://x", { headers: { authorization: "Bearer x.y" } }))), "garbage is refused");

// 6. RSS sources
const rss = `<rss><channel><item><title>Acme Foundation: Director of AI Policy</title><link>https://example.org/jobs/1</link><description>&lt;p&gt;Lead AI governance at a foundation.&lt;/p&gt;</description></item><item><title>No link</title></item></channel></rss>`;
const items = T.parseRss(rss, "pnd");
ok(items.length === 1 && items[0].company === "Acme Foundation" && items[0].title === "Director of AI Policy" && items[0].desc.includes("AI governance"), "RSS item parsed: " + JSON.stringify(items));
const ms = await T.missionSources(env);
ok(ms.probe.length > 0 && ms.probe.length <= 32 && ms.live.length === 0, "a slice of mission sources is probed each run");
const cache = await T.saveMissionProbes(env, ms.cache, [{ feed: ms.probe[0], ok: true, count: 5 }, { feed: ms.probe[1], ok: false, count: 0 }]);
ok(cache[ms.probe[0]].s === "live" && cache[ms.probe[1]].s === "dead", "the probe cache keeps live and dead sources");
ok((await T.missionSources(env)).live.includes(ms.probe[0]), "a live source is fetched every run after it answers");
ok(T.sourceCoverage(cache).mission_live === 1, "coverage counts live mission sources");

// 7. e-mail only when something happened
mails.length = 0;
db.prepare("UPDATE jobsearch_matches SET status='pending_owner_approval' WHERE id='ab:org4:1'").run();
let n = await T.notifyOwner(env);
ok(n.sent && mails.length === 1 && /job match/i.test(mails[0].subject) && mails[0].body.includes("Why it fits"), "one short e-mail lists the new matches: " + JSON.stringify(mails[0] || {}).slice(0, 200));
ok(mails[0].body.includes("submitted automatically"), "the e-mail says what happened to the application");
n = await T.notifyOwner(env);
ok(!n.sent && mails.length === 1, "nothing new, no e-mail");

console.log(`qnfo-jobsearch autopilot: ${pass} passed, 0 failed`);
