// COMPANION-SYSTEMS-ANALYSIS-1 offline suite (personal-companion 1.20.0, charter pillar: personal; agent_issues 2222).
// Owner 2026-10-13 11:26 UTC: "q08.org content is totally lacking in context and big-picture systems analysis. Fail, not worth publishing."
// Proves: the writer is required to give context and a systems analysis framed as reasoning; the critic scores systems and the score gates
// every form; the fact-check prompt treats framed analysis as not a violation; a FACT item whose reason calls it analysis is reasoning
// when it carries no name, number or quotation (run 5408's shape), while a figure, a named outlet or a quoted reason stays a FACT.
// Run: node personal-companion/systems-analysis.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { importWorker } from "./_harness-import-worker.mjs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await importWorker(() => (src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()), new URL("./", import.meta.url));
const V = mod.__verify, P = V.prompts;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };
{
  const vm = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
  ok(vm && (+vm[1] > 1 || (+vm[1] === 1 && +vm[2] >= 20)), "VERSION is at least 1.20.0", vm && vm[0]);
}
ok(/CONTEXT AND SYSTEMS ANALYSIS \(required/.test(P.P_STYLE) && /who gains and who pays/.test(P.P_STYLE) && /feedback loop/.test(P.P_STYLE) && /only retells its source is rejected/.test(P.P_STYLE), "the writer must give context and a systems analysis");
ok(/introducing no name, date, number, event or quotation the source material does not contain/.test(P.P_STYLE), "the analysis adds no unsourced name, date, number, event or quotation");
ok(/^systems: /m.test(P.P_CRITIQUE) && /A retelling scores at most 3/.test(P.P_CRITIQUE) && /"systems":n/.test(P.P_CRITIQUE), "the critic scores systems and returns it");
ok(/var dims = form === "notes" \? \["specificity", "argument", "voice", "systems"\] : \["specificity", "argument", "objection", "voice", "systems"\];/.test(src), "the systems score gates every form");
ok(/NOT violations: analysis and interpretation the writer frames as such/.test(P.FACTCHECK_PROMPT), "the fact-check prompt treats framed analysis as not a violation");
ok(/Reasoning the writer frames as reasoning .* is not a grounding failure: judge it under argument and systems/.test(P.P_CRITIQUE) && /reports as fact something the source does not state .* counts as such a claim/.test(P.P_CRITIQUE), "CRITIC-REASONING-1: framed reasoning is not a grounding failure, an unsourced reported fact still is (run 5421)");
ok(/never state an inferred arrangement, funding, motive or behaviour as a reported fact/.test(P.P_STYLE), "CRITIC-REASONING-1: the writer frames every unsourced analysis sentence as reasoning");
{
  const sp = V.splitFactItems([
    "FACT: recognizing this bias is the first step in an audit of his later histories -- analytical claims not stated in source",
    "FACT: the incentive keeps the archive closed -- interpretation, not in source",
    "FACT: the ministry fined 3 schools in 2025 -- analysis not in source",
    "FACT: the review was first reported by Le Monde -- analysis not in source",
    "FACT: recognizing this bias is the first step in an 'epistemic audit' -- 'epistemic audit' is not stated in source",
    "FACT: the road was finished early -- not in source"
  ]);
  ok(sp.inferences.length === 2 && /recognizing this bias/.test(sp.inferences[0]) && /incentive keeps/.test(sp.inferences[1]), "analysis-labelled FACT items without a name, number or quotation are reasoning", sp);
  ok(sp.facts.length === 4 && sp.facts.some((f) => /3 schools/.test(f)) && sp.facts.some((f) => /Le Monde/.test(f)) && sp.facts.some((f) => /epistemic audit/.test(f)) && sp.facts.some((f) => /road was finished/.test(f)), "a figure, a named outlet, a quoted reason or a plain 'not in source' stays a FACT", sp);
}
{
  const v = V.parseFactVerdict('{"unsupported":["FACT: the incentive keeps the archive closed -- interpretation, not in source"],"verdict":"fail"}');
  ok(v && v.verdict === "pass" && v.unsupported.length === 0 && v.inferences.length === 1, "a fail that lists only framed analysis is a pass with the sentence to spare", v);
  const w = V.parseFactVerdict('{"unsupported":["FACT: the ministry fined 3 schools in 2025 -- analysis not in source"],"verdict":"pass"}');
  ok(w && w.verdict === "fail" && w.unsupported.length === 1, "a figure called analysis still fails the draft", w);
}
// ---- CRITIC-NOTHINK-1 (1.20.2): a critic call on Workers AI takes the measured reasoning switch; a writer call does not ----------------
{
  const seen = [];
  const env = { AI: { run: async (m, input) => { seen.push({ m, input }); return { response: '{"specificity":8,"argument":8,"objection":8,"voice":8,"grounding":9,"systems":8,"verdict":"accept","why":"ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok ok"}' }; } } };
  const r = await mod.callModel(env, [{ role: "user", content: "x" }], 900, 30000, "deepseek-chat", "critic");
  ok(r && r.text && seen.length === 1 && /kimi/.test(seen[0].m) && seen[0].input.chat_template_kwargs && seen[0].input.chat_template_kwargs.thinking === false, "the critic's first model (kimi) runs with thinking off", seen.map((x) => [x.m, x.input.chat_template_kwargs]));
  const seen2 = [];
  const env2 = { AI: { run: async (m, input) => { seen2.push({ m, input }); return { response: "y".repeat(400) }; } } };
  await mod.callModel(env2, [{ role: "user", content: "x" }], 4000, 30000, "deepseek-chat", "writer");
  ok(seen2.length === 1 && /deepseek-v4-pro/.test(seen2[0].m) && seen2[0].input.chat_template_kwargs && seen2[0].input.chat_template_kwargs.thinking === false && !seen2[0].input.reasoning, "the writer (deepseek-v4-pro, WRITER-FAMILY-1) runs with its reasoning off", seen2.map((x) => [x.m, x.input.chat_template_kwargs]));
  const src2 = src.slice(src.indexOf("var CF_FALLBACK = {"), src.indexOf("var FB_MIN_TOKENS"));
  ok(/critic: \["@cf\/moonshotai\/kimi-k2\.6", "@cf\/deepseek-ai\/deepseek-v4-pro-0813", "@cf\/openai\/gpt-oss-120b", "@cf\/zai-org\/glm-5\.3"\]/.test(src2), "deepseek-v4-pro is second in the critic chain, glm last");
}
// ---- SYSTEMS-TOPIC-1 (1.21.0): the primary article names actors making choices; catalogue entries are skipped -------------------------
{
  const f = V.systemsFit, pad = (s) => s + " " + "filler ".repeat(500);
  ok(f({ text: pad("1065 Amundsenia (prov. designation: A926 PC) is a stony asteroid and Mars-crosser from the innermost regions of the asteroid belt.") }).ok === false, "a minor planet (run 5412's topic) is not a systems topic");
  ok(f({ text: pad("Acleris foo is a species of moth of the family Tortricidae. It is found in Japan.") }).why === "catalogue entry" && f({ text: pad("Westbury is a village in Wiltshire, England.") }).ok === false, "a species and a village are catalogue entries");
  ok(f({ text: pad("The Forth Road Bridge Act was passed by Parliament after the council and the government negotiated funding; the company opposed the tolls and the ministry adopted a policy.") }).ok === true, "an article about institutions deciding is a systems topic");
  ok(f({ text: pad("The quick brown fox is a phrase. It is short.") }).ok === false && /few decision terms/.test(f({ text: pad("A phrase.") }).why), "an article without decision terms does not fit");
  const w = src.slice(src.indexOf("async function wikiAnchors("), src.indexOf("async function paperAnchors("));
  ok(/if \(!primary && fallback\) \{ primary = fallback;/.test(w), "when no candidate fits, the first long-enough article is still used");
}
// ---- QUOTE-GROUND-1 + OBJECTION-OWN-WORDS-1 (1.21.1): quotations are verbatim from the sources; the objection is the writer's ------------
{
  const src0 = "Julius Kahn patented the Kahn system of reinforced concrete in 1903. He said the bar must be rigidly connected to the concrete. Eleanor Roosevelt wrote about Charles Platt that his gardens were a marvel of order.";
  const gp = V.groundingProblems;
  const fake = "# The Kahn system\n\nCritics said that \"the Kahn system was merely a minor improvement on earlier methods\" and little more.";
  const p1 = gp(fake, src0, {});
  ok(p1.some((x) => /^quotation not in the source: "the Kahn system was merely a minor improvement on earlier methods"/.test(x)), "an invented quotation of five or more words is flagged with its text", p1);
  ok(gp("# Kahn\n\nKahn said \u201cthe bar must be rigidly connected to the concrete\u201d in 1903.", src0, {}).filter((x) => /quotation/.test(x)).length === 0, "a quotation that is verbatim in the source (curly quotes) passes");
  ok(gp("# Kahn\n\nThe phrase \"rigid bar\" recurs.", src0, {}).filter((x) => /quotation/.test(x)).length === 0, "a quotation under five words is left to the reviewers");
  const n = V.groundingNeedles(p1.filter((x) => /quotation/.test(x)));
  ok(n.length === 1 && n[0] === "the Kahn system was merely a minor improvement on earlier methods", "the grounding repair receives the quotation as its needle", n);
  ok(V.QUOTE_MIN_WORDS === 5, "quotations of five or more words are checked");
  ok(/stated fairly in your own words as an objection a careful reader could raise/.test(P.P_STYLE) && /Never put it in quotation marks and never attribute it to critics/.test(P.P_STYLE) && !/in the objector's own terms/.test(P.P_STYLE), "the objection is the writer's own, never a quotation or an unnamed critic");
  ok(!/in the objector's terms/.test(P.P_ESSAY) && /never as a quotation or an unnamed critic/.test(P.P_ESSAY), "the essay form says the same");
  ok(/a paragraph that would read the same for any other subject is boilerplate and is rejected/.test(P.P_STYLE) && /quote only words that appear verbatim in the source material, attributed to the person the source attributes them to/.test(P.P_STYLE), "the analysis is specific and quotations keep their attribution");
}
// ---- REVISION-REPAIR-1 (1.21.2): the fact revision is repaired before it is judged; its own problems are logged first ------------------
{
  const loop = src.slice(src.indexOf("async function generate("), src.indexOf("var CRON_TABLE"));
  const i = loop.indexOf("var rv = rp ? validatePiece(rp, form, ground, repairOpts)"), j = loop.indexOf("var rgr = repairGroundingDraft(rp, rv.problems, form, ground, repairOpts);"), k = loop.indexOf("vr = await verifyPiece(env, pieceText(rp), ground, rev.model");
  ok(i > 0 && j > i && k > j, "the revision is repaired after validation and before the fact-check", { i, j, k });
  ok(/problems: \(rv\.problems \|\| \[\]\)\.concat\(vr\.problems \|\| \[\]\)/.test(loop), "a failed revision logs its own problems first");
}
// ---- CRITIC-PRUNE-1 (1.21.3): a grounding rejection that quotes the draft deletes those sentences and is read once more -------------------
{
  const draft = "# The 18th Military Police Brigade\n\nThe battalion is headquartered in Vilseck. Fourteen companies serve under the battalion. The source lists five companies by name.";
  const why = "The piece invents a claim that 'Fourteen companies serve under the battalion' when the source lists exactly five subordinate companies; this concrete numerical claim is false.";
  ok(JSON.stringify(V.criticQuotes(why, draft)) === JSON.stringify(["Fourteen companies serve under the battalion"]), "the critic's quotation of the draft is found", V.criticQuotes(why, draft));
  ok(V.criticQuotes("the source only states '21 October 1977 in Germany' for the inactivation", draft).length === 0, "a quotation of the source that the draft does not contain is ignored");
  ok(V.criticQuotes("it says 'five' twice", draft).length === 0, "a quotation under three words is ignored");
  ok(V.criticQuotes('fabricates \u201cThe battalion is headquartered in Vilseck\u201d and \u201cFourteen companies serve under the battalion\u201d', draft).length === 2, "curly double quotes are read");
  const w = V.critiqueWorst({ specificity: 8, argument: 8, voice: 8, systems: 8, grounding: 0 }, "notes");
  ok(w.worst === 0 && w.worstName === "grounding" && w.missing === false, "a grounding failure is the worst score when every gating score passes", w);
  const w2 = V.critiqueWorst({ specificity: 8, argument: 3, voice: 8, grounding: 9 }, "essay");
  ok(w2.missing === true && w2.worst === 0, "a missing gating score fails closed", w2);
  const loop = src.slice(src.indexOf("async function generate("), src.indexOf("var CRON_TABLE"));
  const a = loop.indexOf("for (var cround = 1; cround <= CRITIC_PRUNE_ROUNDS && worst < floorForForm && worstName === \"grounding\"; cround++) {"), b = loop.indexOf("var crit2 = await critiquePiece(env, cpr.piece, form, ground);"), c = loop.indexOf("if (worst < floorForForm) {"), d = loop.indexOf("await logRun(env, form, model, topic.id, \"stage\", \"fact-check\"");
  ok(V.CRITIC_PRUNE_ROUNDS === 3, "CRITIC-PRUNE-2: up to three critic prune rounds");
  ok(a > 0 && b > a && c > b && d > c, "the critic prune runs before the rejection and before the fact-check", { a, b, c, d });
}
// ---- CONTEXT-LINKS-1 + BLOCKQUOTE-GROUND-1 (1.21.5) ---------------------------------------------------------------------------------
{
  const text = "The book was compiled by Ilya Ehrenburg and Vasily Grossman. Grossman wrote the Treblinka report. Ehrenburg edited the eyewitness texts. The Eastern Orthodox Church is mentioned once. Kiev appears once.";
  const r = V.rankLinked(["Euphoria (2017 film)", "Church (building)", "Vasily Grossman", "Ilya Ehrenburg", "Kiev", "The Black Book of Soviet Jewry (1946)", "Ilya Ehrenburg (disambiguation)"], text, "The Black Book of Soviet Jewry");
  ok(r.length === 3 && r.indexOf("Vasily Grossman") >= 0 && r.indexOf("Ilya Ehrenburg") >= 0 && r.indexOf("Kiev") === 2, "CONTEXT-LINKS-1: the people the source names most rank first, a place named once follows", r);
  ok(r.indexOf("Euphoria (2017 film)") < 0, "a link the source never names is not ranked", r);
  ok(r.indexOf("Church (building)") < 0, "a one-word title counts only where it stands alone, not inside a longer name", r);
  ok(r.indexOf("The Black Book of Soviet Jewry (1946)") < 0, "a variant of the subject's own title is not context", r);
  ok(r.indexOf("Ilya Ehrenburg (disambiguation)") < 0, "one article per name: the plain title wins over its variant", r);
  ok(V.linkMentionScore("Vasily Grossman", text, "The Black Book of Soviet Jewry") === 3, "a full name counts twice, a bare surname once", V.linkMentionScore("Vasily Grossman", text, "The Black Book of Soviet Jewry"));
  ok(V.linkMentionScore("Fur trade", "The fur trade grew. Trade rose. Trade fell.", "Hanseatic League") === 0, "a common-noun title earns no last-word bonus and lowercase text does not count");
  ok(V.linkMentionScore("Time Variance Authority", "The Authority built dams. The Authority sold power.", "Tennessee Valley Authority") === 0, "the subject's own title word earns no bonus");
  const w = src.slice(src.indexOf("async function wikiAnchors(used, cooled, seed) {"), src.indexOf("async function paperAnchors("));
  ok(/var named = rankLinked\(pool, primary\.text, primary\.title\);/.test(w) && /named\.slice\(0, 4\)\.concat\(pickSeeded\(/.test(w), "wikiAnchors reads the named links first and fills with seeded random links");
  const ground = "Ehrenburg recorded the testimony of survivors in Vilnius and Minsk.";
  const bq = "# The Black Book\n\nEhrenburg wrote:\n\n> We must write down every name, so that no one forgets what happened here.\n\nThe book followed.";
  const gq = V.groundingProblems(bq, ground, {});
  ok(gq.some((x) => /^quotation not in the source: "We must write down every name, so that no one forgets what happened here\."/.test(x)), "BLOCKQUOTE-GROUND-1: an invented blockquote is flagged with its text", gq);
  ok(!V.groundingProblems("# B\n\n> Ehrenburg recorded the testimony of survivors in Vilnius and Minsk.\n\nAfter.", ground, {}).some((x) => /quotation/.test(x)), "a verbatim blockquote passes");
  ok(!V.groundingProblems("# B\n\n> Short line here.\n\nAfter.", ground, {}).some((x) => /quotation/.test(x)), "a blockquote under five words is left to the reviewers");
  const piece = { title: "The Black Book", lede: "", body_md: "Ehrenburg recorded the testimony of survivors in Vilnius and Minsk.\n\n> We must write down every name, so that no one forgets what happened here.\n\nThe record stayed." };
  const pr = V.pruneUnsupported(piece, V.groundingNeedles(gq.filter((x) => /quotation/.test(x))).map((x) => "unsupported claim: " + x));
  ok(pr.removed.length === 1 && !/We must write down/.test(pr.piece.body_md) && /The record stayed/.test(pr.piece.body_md), "the blockquote's line is the one the repair deletes", pr);
}
// ---- TOPIC-PRESCREEN-1 (1.21.6): the intros of 20 random articles are screened in one request; the best-fitting are read first ------
{
  ok(V.TOPIC_POOL === 20, "the screen draws 20 random titles");
  ok(V.introScore("Palazzolo v. Rhode Island was a case in which the Supreme Court ruled on a regulation and the rights of the owner; the court decided that the policy of the council...") >= 4, "a court case naming decisions scores high");
  ok(V.introScore("1065 Amundsenia is a stony asteroid and Mars-crosser.") === -1, "a catalogue entry scores below every other candidate");
  ok(V.introScore("") === 0 && V.introScore("Ozren is a mountain range.") === 0, "an intro without decision terms scores 0");
  const intros = { "Ozren": "Ozren is a mountain range.", "1065 Amundsenia": "1065 Amundsenia is a stony asteroid.", "Palazzolo v. Rhode Island": "a case in which the Supreme Court ruled on a regulation and the policy of the council and the rights of the owner" };
  const sc = V.screenTopics(["Ozren", "1065 Amundsenia", "Palazzolo v. Rhode Island", "Unknown Page"], intros);
  ok(sc[0].t === "Palazzolo v. Rhode Island" && sc[sc.length - 1].t === "1065 Amundsenia", "best-fitting first, catalogue last", sc);
  ok(sc.length === 4, "no candidate is dropped by the screen (the fallback can still use any)", sc);
  const raw = V.screenTopics(["B", "A", "C"], {});
  ok(raw.map((x) => x.t).join() === "B,A,C", "with no intros the random order is kept, as before", raw);
  const saved = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("exintro=1")) return new Response(JSON.stringify({ query: { normalized: [{ from: "palazzolo v. Rhode Island", to: "Palazzolo v. Rhode Island" }], redirects: [{ from: "Old Name", to: "New Name" }], pages: { 1: { title: "Palazzolo v. Rhode Island", extract: "The  court ruled." }, 2: { title: "New Name", extract: "A policy." } } } }), { status: 200 });
    return new Response("{}", { status: 404 });
  };
  const got = await V.fetchWikiIntros(["palazzolo v. Rhode Island", "Old Name", "Missing"]);
  globalThis.fetch = saved;
  ok(got["palazzolo v. Rhode Island"] === "The court ruled." && got["Old Name"] === "A policy." && got.Missing === undefined, "intros map back to the requested titles through normalisation and redirects", got);
  const w = src.slice(src.indexOf("async function wikiAnchors(used, cooled, seed) {"), src.indexOf("async function paperAnchors("));
  ok(/var random = await fetchRandomTitles\(TOPIC_POOL - events\.length\);/.test(w) && /var pool = events\.concat\(random\.filter/.test(w) && /intros = await fetchWikiIntros\(fresh\);/.test(w) && /var titles = scored\.map\(function \(x\) \{ return x\.t; \}\);/.test(w), "wikiAnchors screens the pool and reads candidates in screened order");
  ok(/try \{ intros = await fetchWikiIntros\(fresh\); \} catch \(eI\)/.test(w), "a failed intro request leaves the old order and is noted");
}
// ---- STARVED-RETRY-HOURLY-1 (1.21.7): one retry per hourly tick ----------------------------------------------------------------------
{
  ok(V.STARVED_RETRY_QUIET_MS === 10 * 60000, "STARVED-RETRY-SLA-1 (1.26.3): only a run in progress (rows in the last 10 minutes) holds the hourly retry back");
  const sr = src.slice(src.indexOf("async function starvedRetryDue(env) {"), src.indexOf("async function steward(env) {"));
  ok(!/STARVED_RETRY_MAX_24H|STARVED_RETRY_MIN_MS|f\.n < 16/.test(sr) && /run_at > \?"\)\.bind\(new Date\(Date\.now\(\) - STARVED_RETRY_QUIET_MS\)/.test(sr), "no daily failure cap and no fixed bar: the retry waits only for a run in progress");
}
// ---- WRITER-FIT-1 (1.22.1): the fallback writer is asked for the length its floor needs, at a lower temperature -------------------------
{
  ok(JSON.stringify(V.writerBand("essay", false)) === "[2000,2800]" && JSON.stringify(V.writerBand("notes", false)) === "[1800,2400]", "a DeepSeek writer keeps the full band");
  const e = V.writerBand("essay", true), n = V.writerBand("notes", true);
  ok(e[0] === 1150 && e[1] === 1650 && n[0] === 1000 && n[1] === 1500, "the fallback is asked for 15% over its floor, a 500-word band", { e, n });
  ok(e[0] > V.floorFor("essay") / 1 * 0 + 1000 && n[0] > 850, "the band starts above the fallback floor (essay 1000, notes 850)");
  ok(V.writerIsFallback({}) === true && V.writerIsFallback({ DEEPSEEK_API_KEY: "k" }) === false, "no DeepSeek key means the fallback band");
  ok(V.WRITER_TEMPERATURE_FB === 0.35 && V.CRITIC_TEMPERATURE === 0.2, "the writer samples at 0.35 and the critic at 0.2");
  const cw = src.slice(src.indexOf("async function callWorkersAI("), src.indexOf("async function callModel("));
  ok(/temperature: role === "critic"(?: \|\| role === "editor")? \? CRITIC_TEMPERATURE : WRITER_TEMPERATURE_FB/.test(cw), "the Workers AI call picks the temperature by role (the editor of REFRAME-REPAIR-1 samples like the critic)");
  const cp = src.slice(src.indexOf("async function composePiece("), src.indexOf("async function composePiece(") + 4000);
  ok(/var band = writerBand\(form, writerIsFallback\(env\)\)/.test(cp) && /\.replace\(\/\\d\{4\} to \\d\{4\} words\/, bandText\)/.test(cp) && /a shorter piece that adds nothing is better than a longer one that invents/.test(cp), "composePiece puts the band in the form contract and the length rule");
  const cq = src.slice(src.indexOf("async function critiquePiece("), src.indexOf("__name(critiquePiece"));
  ok(/var wb = writerBand\(form, writerIsFallback\(env\)\)/.test(cq), "the critic is told the same band");
}
// ---- CRITIC-LIST-1 (1.22.2): the critic lists every invented claim; one prune round deletes them all -----------------------------------
{
  const text = "# T\n\nThe concession obliged the operator to maintain service levels for oil shipments. The fare structure became market oriented in 1995. The line carried oil and minerals.";
  const inv = ["The concession obliged the operator to maintain service levels for oil shipments", "\u201cThe fare structure became market oriented in 1995.\u201d", "a sentence the piece does not contain at all", 42];
  const q = V.criticQuotes("The piece invents a contractual term.", text, inv);
  ok(q.length === 2 && q[0].indexOf("The concession obliged") === 0 && q[1] === "The fare structure became market oriented in 1995", "the listed quotations the piece contains are taken, trimmed of quote marks; others are dropped", q);
  ok(V.criticQuotes("It invents 'the line carried oil and minerals' here.", text, []).length === 1, "a quotation in the reason still counts when the list is empty");
  const many = Array.from({ length: 24 }, (_, i) => "unique claim number " + i + " stands here");
  ok(V.criticQuotes("", many.join(". ") + ".", many).length === V.CRITIC_INVENTED_MAX && V.CRITIC_INVENTED_MAX === 16, "at most 16 quotations are taken (CRITIC-LIST-16-1, 1.26.4)");
  ok(/\(at most 16; an empty list when there is none\)/.test(P.P_CRITIQUE) && /\], 1600, CRITIQUE_TIMEOUT_MS, CRITIC_MODEL, "critic"\)/.test(src), "the critic is told the same cap and has the reply budget for it");
  ok(/invented: every concrete claim you found that the source material does not support/.test(P.P_CRITIQUE) && /"invented":\["exact quotation", \.\.\.\]/.test(P.P_CRITIQUE), "the critic is asked for the list");
  ok(/var cq = criticQuotes\(q\.why, pieceText\(piece\), q\.invented\);/.test(src), "the critic prune uses the list");
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
