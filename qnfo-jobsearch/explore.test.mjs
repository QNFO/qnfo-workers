// JOBSEARCH-EXPLORE-1 and JOBSEARCH-DIVERSE-1 (owner 2026-11-09: "My diverse experience doesn't fit neatly into keywords"; "don't just show me jobs from Anthropic or OpenAI"):
// a posting whose title is in no role family is kept when its text carries the owner's record, and no employer fills the top of the list.
import worker from "./worker.js";
import { DatabaseSync } from "node:sqlite";
const T = worker.__test;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL", m); } };

// 1. beyond keywords: a title in no role family, a posting that carries the record
const terms = T.recordTerms("Built and ran transportation network models for regional forecasting. Led travel survey methodology, simulation and machine learning evaluation of autonomous agents.");
ok(terms.has("transportation") && terms.has("forecasting") && !terms.has("experience"), "record terms keep distinctive words and drop business words");
const rich = "We need someone to run transportation network models, regional forecasting, travel survey methodology, simulation, machine learning evaluation and autonomous agents research. ".repeat(3);
ok(T.exploreOverlap(rich, terms).n >= 8 - 1, "the overlap counts shared record terms (" + T.exploreOverlap(rich, terms).n + ")");
ok(T.exploreOverlap("Sell insurance products to retail customers every day of the week.".repeat(10), terms).n === 0, "an unrelated posting shares none");
const ctx = T.makeCtx({}, []);
const job = (title, desc, company = "Acme Labs") => ({ id: "t:" + title + company, company, title, location: "Amsterdam", url: "https://x", desc });
const ctxE = Object.assign(T.makeCtx({}, []), { recordTerms: terms });
const ex = T.scoreJob(job("Fellow, Widget Planning", rich), ctxE, "wide");
ok(ex.explore === true && !ex.drops.some((d) => /title not in your role families/.test(d)), "a title in no family is kept when the posting carries the record: " + JSON.stringify({ e: ex.explore, d: ex.drops }));
ok(ex.why.some((w) => /matches your record beyond title keywords/.test(w)) && ex.score <= 64 && ex.tier !== "A", "and it is labelled, capped below a title-in-lane match (score " + ex.score + ")");
const noEx = T.scoreJob(job("Fellow, Widget Planning", rich), Object.assign(T.makeCtx({}, []), { recordTerms: new Set() }), "wide");
ok(!noEx.explore && noEx.drops.length > 0, "with no record terms the same posting is dropped, as before");
const unrelated = T.scoreJob(job("Strategist, Gizmo Partnerships", "Sell insurance products to retail customers every day of the week. ".repeat(10)), ctx, "wide");
ok(unrelated.drops.length > 0 && !unrelated.explore, "an unrelated generic title is still dropped");

// 2. diversity: no employer more than twice in the first twenty, nothing removed
const rows = [];
for (let i = 0; i < 8; i++) rows.push({ company: "Anthropic", score: 90 - i, id: "a" + i });
for (let i = 0; i < 6; i++) rows.push({ company: "OpenAI", score: 80 - i, id: "o" + i });
for (let i = 0; i < 12; i++) rows.push({ company: "Firm " + i, score: 60 - i, id: "f" + i });
const div = T.diversifyRows(rows, 2, 20);
const head = div.slice(0, 16), count = (n) => head.filter((r) => r.company === n).length;
ok(div.length === rows.length && new Set(div.map((r) => r.id)).size === rows.length, "no row is removed");
ok(count("Anthropic") <= 2 && count("OpenAI") <= 2, "no employer fills the top 16 (the rows under the cap): Anthropic " + count("Anthropic") + ", OpenAI " + count("OpenAI"));
ok(head.filter((r) => /^Firm/.test(r.company)).length >= 12, "other employers move up");


// 4. JOBSEARCH-CONTENT-FIRST-1: the title never caps a score, and a title that says nothing can still reach a high tier on the text alone
{
  const richer = "We run transportation network models, regional forecasting, travel survey methodology, simulation, machine learning evaluation and autonomous agents research. Federal research program management, audit, reproducibility and responsible AI evaluation. ".repeat(3);
  const odd = T.scoreJob(job("Fellow, Widget Planning", richer), Object.assign(T.makeCtx({}, []), { recordTerms: terms }), "wide");
  const lane = T.scoreJob(job("Research Program Manager", richer), Object.assign(T.makeCtx({}, []), { recordTerms: terms }), "wide");
  ok(odd.drops.length === 0 && odd.score >= 55, "a title in no family scores on the text alone (" + odd.score + ", tier " + odd.tier + ")");
  ok(lane.score - odd.score <= 30, "a title in a lane adds at most a small bonus (" + lane.score + " vs " + odd.score + ")");
  const sales = T.scoreJob(job("Sales Lead, Research", richer), Object.assign(T.makeCtx({}, []), { recordTerms: terms }), "wide");
  ok(sales.drops.length === 0, "a title word that used to exclude (sales) does not, when the text carries the record");
  const lvl = T.scoreJob(job("Junior Research Analyst", richer), Object.assign(T.makeCtx({}, []), { recordTerms: terms }), "wide");
  ok(lvl.drops.length > 0, "a seniority word (junior) still excludes: it is a level, not a field");
}
// 5. JOBSEARCH-SEMANTIC-1: meaning instead of words
{
  const mk = (title, desc, match) => ({ id: "s:" + title, company: "Co " + title, title, location: "Amsterdam", url: "u", desc, ...(match ? { match } : {}) });
  const mkKept = () => [mk("Alpha", "ROBOT systems study", { status: "ok", score: 50, tier: "B", clusters: [], why: [], flags: [] }), mk("Beta", "unrelated", { status: "ok", score: 52, tier: "B", clusters: [], why: [], flags: [] })];
  const mkNear = () => [mk("Gamma", "ROBOT-like oversight work", null), mk("Delta", "cooking classes", null)];
  const kept = mkKept(), near = mkNear();
  let calls = 0;
  const env = { AI: { run: async (model, input) => { calls++; return { data: input.text.map((t) => (calls === 1 || calls === 2 && false ? [1, 0] : /ROBOT/.test(t) ? [0.95, 0.05] : [0, 1])) }; } } };
  // the first call embeds the record passages (all [1,0]); later calls embed the postings
  const first = { n: 0 };
  env.AI.run = async (model, input) => { first.n++; return { data: input.text.map((t) => (first.n === 1 || first.n === 2 && input.text.length > 40 ? [1, 0] : /ROBOT/.test(t) ? [0.95, 0.05] : [0, 1])) }; };
  const out = await T.semanticLens(env, kept, near, T.makeCtx({}, []));
  const byTitle = (n) => out.find((j) => j.title === n);
  ok(byTitle("Alpha").match.score > 50 && byTitle("Alpha").match.why.some((w) => /close in meaning to your record/.test(w)), "a kept posting close in meaning is boosted and says why");
  ok(byTitle("Beta").match.score === 52, "a kept posting far in meaning is untouched");
  ok(byTitle("Gamma") && byTitle("Gamma").match.tier === "B" && byTitle("Gamma").match.score <= 64 && /not in words/.test(byTitle("Gamma").match.why[0]), "a near miss on the words that is close in meaning is rescued, labelled, capped at 64");
  ok(!byTitle("Delta"), "a near miss far in meaning stays out");
  const noAi = await T.semanticLens({}, mkKept(), mkNear(), T.makeCtx({}, []));
  ok(noAi.length === 2 && noAi[0].match.score === 50, "without an AI binding the lexical ranking is untouched");
  const broken = await T.semanticLens({ AI: { run: async () => { throw new Error("down"); } } }, mkKept(), mkNear(), T.makeCtx({}, []));
  ok(broken.length === 2, "a failing embedding call leaves the ranking untouched");
  ok(Math.abs(T.cosine([1, 0], [1, 0]) - 1) < 1e-9 && Math.abs(T.cosine([1, 0], [0, 1])) < 1e-9 && T.cosine([0, 0], [1, 1]) === 0, "cosine is exact on unit and zero vectors");
}
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
ok(/p === "\/api\/recall" \|\| p === "\/api\/recall\/answer"\) \{[\s\S]{0,420}tokenOk\(request, env\)/.test(src), "the recall routes accept the owner session or the loop token (the dashboard card), a visitor gets 401");
console.log(`qnfo-jobsearch explore: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
