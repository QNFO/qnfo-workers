// JOBSEARCH-JUDGE-1 / PDF-1 / ANSWERS-1 / PREP-1 suite: the text PDF, protected questions, answer checking, model-JSON parsing and fail-soft behaviour.
// Run: node qnfo-jobsearch/jobs-judge-pdf.test.mjs
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
db.exec("CREATE TABLE IF NOT EXISTS jobsearch_calib (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, title TEXT, company TEXT, rubric_fit INTEGER, judge_fit INTEGER, owner TEXT NOT NULL)");
let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; };

// 1. the PDF is a real, one-column text PDF
const md = "# Rowan Quni-Gudzinas\nAmsterdam | a@b.org\n\n## Experience\n\n**Founder**, QNFO (2024 to present)\n- Built a pipeline that checks every claim against a verified record, with a long line that has to wrap across the page width so the wrapper is exercised properly.\n- Second bullet with café and an en–dash and (parentheses) and a back\\slash.\n\n## Skills\nPython · Statistics · Policy research\n";
const pdf = T.pdfOf(md, "Test resume");
const txt = Buffer.from(pdf).toString("latin1");
ok(txt.startsWith("%PDF-1.4") && txt.trimEnd().endsWith("%%EOF"), "pdf header and trailer");
ok(/\/BaseFont \/Helvetica /.test(txt) && !/\/Subtype \/Image/.test(txt), "standard font, no images");
ok(txt.includes("(Rowan Quni-Gudzinas) Tj"), "name is selectable text");
ok(txt.includes("(EXPERIENCE) Tj") && txt.includes("(SKILLS) Tj"), "standard headings");
ok(txt.includes("caf\xe9") && txt.includes("(parentheses)".replace(/[()]/g, (c) => "\\" + c)) && txt.includes("back\\\\slash"), "latin-1 text and escapes");
const sx = txt.indexOf("startxref"), off = Number(txt.slice(sx + 10, txt.indexOf("\n", sx + 10)));
ok(txt.slice(off, off + 4) === "xref", "startxref points at the xref table");
const objs = [...txt.matchAll(/^(\d+) 0 obj/gm)].length, size = Number(/\/Size (\d+)/.exec(txt)[1]);
ok(size === objs + 1, "xref size matches objects");
const many = T.pdfOf(Array.from({ length: 140 }, (_, i) => `- line ${i} ` + "word ".repeat(12)).join("\n"), "long");
ok(/\/Count (\d+)/.exec(Buffer.from(many).toString("latin1"))[1] >= 2, "long resume paginates");

// 2. protected questions are never drafted
for (const q of ["What are your salary expectations?", "Are you legally authorized to work in the EU?", "Will you require visa sponsorship?", "Gender identity (optional)", "Do you have a criminal record?"]) ok(T.PROTECTED_Q.test(q), "protected: " + q);
ok(!T.PROTECTED_Q.test("Why do you want to work here?") && !T.PROTECTED_Q.test("Describe a research programme you led."), "ordinary questions pass");

// 3. model JSON parsing is tolerant, and garbage is null
ok(T.jsonLoose('Sure! {"fit": 71, "verdict":"good"} hope that helps').fit === 71, "json inside prose");
ok(T.jsonLoose("no json here") === null && T.jsonLoose("{broken") === null, "garbage is null");

// 4. fail-soft: no AI binding means a clear error or null, never a crash
const env = { JOBS_DB: { prepare: (sql) => { const mk = (args) => ({ bind: (...v) => mk(v), run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid) } }; }, first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }) }); return mk([]); }, batch: async () => [] } };
let failed = false; try { await T.judgeJob(env, { title: "x", company: "y", location: "Amsterdam", desc: "z" }); } catch (e) { failed = true; }
ok(failed, "judge throws without a model (analyzeJob catches it)");
const ans = await T.draftAnswers(env, { input: "Research Manager\nWe need program management.", questions: ["What are your salary expectations?", "Why this role?"] });
ok(ans.answers[0].status === "owner_only" && ans.answers[0].answer === null, "pay question left to the owner");
ok(ans.answers[1].status === "model_unavailable", "ordinary question degrades to model_unavailable");

// 5. answer checking catches invented numbers and tools
const job = { title: "Research Manager", company: "Acme", desc: "program management" };
ok(T.checkAnswer("I led a team of 4,312 analysts using Kubernetes.", job).length >= 2, "invented number and tool flagged");
ok(T.checkAnswer("See my resume for details.", job).some((p) => /resume/.test(p)), "see-resume flagged");

// 6. calibration stores and scores verdicts
await T.calibrate(env, { owner: "qualified", title: "Applied Researcher", company: "P", rubric_fit: 31, judge_fit: 78 });
await T.calibrate(env, { owner: "not_qualified", title: "Sales", company: "Q", rubric_fit: 10, judge_fit: 12 });
const cal = await T.calibration(env);
ok(cal.n === 2 && cal.rubric_agreement_pct === 50 && cal.judge_agreement_pct === 100 && cal.misses.length === 1, "agreement is measured");
let bad = false; try { await T.calibrate(env, { owner: "maybe" }); } catch (e) { bad = e.status === 400; }
ok(bad, "bad verdict is a 400");

console.log(`jobs-judge-pdf: ${pass} checks passed`);

// 7. the /prep page is served, links resolve, and its script parses
import vm from "node:vm";
const res = await worker.fetch(new Request("https://x/prep"), env, { waitUntil() {} });
const page = await res.text();
ok(res.status === 200 && /Check fit/.test(page) && /Draft answers/.test(page) && /Build interview brief/.test(page), "prep page served with its three screens");
const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
ok(scripts.length === 1, "one inline script");
new vm.Script(scripts[0]);
ok(true, "prep page script parses");
const home = await (await worker.fetch(new Request("https://x/"), env, { waitUntil() {} })).text();
ok(home.includes('href="/prep"'), "main page links to /prep");
console.log(`jobs-judge-pdf (with page): ${pass} checks passed`);
{ // scorecard attributes: the interview brief names what interviewers will rate and the story that proves each
  const src = (await import("node:fs")).readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  const ok = src.includes("scorecard_attributes") && src.includes("What interviewers will likely rate");
  console.log(ok ? "ok scorecard attributes in brief and page" : "FAIL scorecard attributes missing"); if (!ok) process.exitCode = 1;
}

{ // JOBSEARCH-FUNNEL-1: outcomes carry per-channel and per-score-band stage counts
  const o = await T.outcomes(env);
  const ok = o.by_channel && o.by_score_band && typeof o.funnel.matches === "number";
  console.log(ok ? "ok funnel by channel and score band" : "FAIL funnel groups missing"); if (!ok) process.exitCode = 1;
}

{ // JOBSEARCH-HEADLINE-1: a backed, much higher model reading lifts the headline; an unbacked one does not
  const a = T.headlineVerdict(30, { fit: 75, matched_fact_ids: ["a", "b"] }), b = T.headlineVerdict(30, { fit: 75, matched_fact_ids: ["a"] }), c = T.headlineVerdict(60, null);
  const ok = a.verdict === "strong fit" && /model reading/.test(a.source) && b.verdict === "weak fit" && c.source === "rubric";
  console.log(ok ? "ok headline follows a backed model reading" : "FAIL headline rule"); if (!ok) process.exitCode = 1;
}

{ // JOBSEARCH-FUNNEL-1 review-gate findings: a match with no score or no url gets its own bucket, never the weak band or an "undefined" board
  db.exec("CREATE TABLE IF NOT EXISTS jobsearch_matches (id TEXT PRIMARY KEY, first_seen TEXT, last_seen TEXT, run_id INTEGER, company TEXT, title TEXT, location TEXT, url TEXT, tier TEXT, score INTEGER, why_json TEXT, flags_json TEXT, verified INTEGER DEFAULT 0, blocked_reason TEXT, resume_md TEXT, note_md TEXT, status TEXT DEFAULT 'pending_owner_approval', decided_at TEXT)");
  db.exec("INSERT OR REPLACE INTO jobsearch_matches (id, first_seen, last_seen, url, score) VALUES ('nullcase','x','x',NULL,NULL)");
  const o = await T.outcomes(env);
  const ok = o.by_score_band.unscored && !o.by_score_band.weak_under_60?.matches_null && o.by_channel.unknown && !o.by_channel.undefined;
  console.log(ok ? "ok null score and url get their own buckets" : "FAIL null buckets"); if (!ok) process.exitCode = 1;
}

// JOBSEARCH-TAILOR-1: the resume follows the posting, not only its cluster tags
{
  const mk = (title, desc) => ({ id: "t", company: "Acme", title, location: "Amsterdam", url: "", desc });
  const a = mk("Quantum software engineer", "Quantum computing, qubit control, Python, research publications, simulation of quantum systems.");
  const b = mk("Transport policy analyst", "Transport modeling, federal policy research, program evaluation, stakeholder reporting.");
  const ra = T.buildResume(a, { clusters: [] }), rb = T.buildResume(b, { clusters: [] });
  const facts = (r) => (r.match(/<!--F:([^>]+?)-->/g) || []).join("|");
  ok(facts(ra) !== facts(rb), "two different postings get different fact selections even with no clusters");
  ok(!T.verify(ra, a).length && !T.verify(rb, b).length, "tailored resumes still pass the verified-only check: " + T.verify(ra, a).join(";"));
  const firstId = (r) => ((r.match(/<!--F:([^>]+?)-->/) || [])[1]);
  const all = (rb.match(/<!--F:([^>]+?)-->/g) || []).map((x) => x.slice(6, -3));
  const pick = ((T.buildResume(a, { clusters: [] }).match(/<!--F:([^>]+?)-->/g) || []).map((x) => x.slice(6, -3)));
  const other = all.find((id) => !pick.includes(id));
  if (other) { const rj = T.buildResume(a, { clusters: [], judge: { matched_fact_ids: [other] } }); ok(rj.includes("<!--F:" + other + "-->"), "a fact the judge matched is on the resume"); }
  ok((ra.match(/<!--F:/g) || []).length <= 12, "at most 12 bullets");
}

// JOBSEARCH-TAILOR-2: judgeTop lifts a backed reading, skips stretch tier and stays fail-soft
{
  const fid = (T.buildResume({ id: "x", company: "A", title: "t", location: "", url: "", desc: "quantum" }, { clusters: [] }).match(/<!--F:([^>]+?)-->/g) || []).slice(0, 2).map((x) => x.slice(6, -3));
  const jobs = [
    { id: "1", company: "A", title: "Generic role", desc: "x", match: { tier: "B", score: 49, why: [] } },
    { id: "2", company: "B", title: "Stretch", desc: "x", match: { tier: "C", score: 40, why: [] } },
  ];
  const envAi = { AI: { run: async () => ({ response: JSON.stringify({ fit: 72, verdict: "strong", reasons: ["a"], gaps: [], matched_fact_ids: fid }) }) } };
  const out = await T.judgeTop(envAi, jobs);
  ok(out[0].id === "1" && out[0].match.score === 69 && out[0].match.judge, "a backed judge reading lifts a capped posting to at most 69: " + JSON.stringify(out[0].match.score));
  ok(!out[1].match.judge, "stretch tier is not judged");
  const out2 = await T.judgeTop({}, [{ id: "3", company: "C", title: "t", desc: "x", match: { tier: "B", score: 49, why: [] } }]);
  ok(out2[0].match.score === 49, "no binding: fail-soft, order and score unchanged");
}

// JOBSEARCH-REFERRAL-1 / STAGE-1: referral kit is verified-facts only, links are people searches, stages are counted in the funnel
{
  const row = { id: "r1", company: "Acme Labs", title: "Research program manager", location: "Amsterdam", url: "https://boards.greenhouse.io/acme/jobs/1" };
  const kit = T.referralKit(row, await T.loadCtx(env));
  ok(kit.message && kit.message.includes("Research program manager") && kit.message.includes("Acme Labs") && !kit.blocked, "referral message names the role and employer and passes verification: " + (kit.blocked || ""));
  ok(kit.search_urls.length === 2 && kit.search_urls.every((u) => u.url.startsWith("https://www.linkedin.com/search/results/people/?keywords=Acme%20Labs")), "people-search links only, no scraping");
  ok(kit.left_for_you.length === 2, "the owner chooses the person and sends it");
  db.prepare("INSERT INTO jobsearch_events (match_id, event, ts, note) VALUES (?,?,?,?)").run("r1", "stage:panel", new Date().toISOString(), "");
  const st = await T.outcomes(env);
  ok(st.by_stage.panel === 1 && st.by_stage.final === 0, "stage events are counted per stage in the funnel: " + JSON.stringify(st.by_stage));
  ok(T.STAGES.includes("recruiter_screen") && T.STAGES.length === 7, "seven interview stages");
}
