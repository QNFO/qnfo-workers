// ANALYSIS-RULE-REREAD-1 offline suite (personal-companion 1.26.0, charter pillar: personal; agent_issues 2552).
// Proves: a critic grounding rejection whose quoted passages all lie after the <!-- analysis --> line gets one re-read by the same
// critic with its own rubric for that section put back to it; a quote before the line, a draft without the line or a rejection with no
// quote gets no re-read; the re-read note carries the passages and the rule; the re-read runs before the critic prune (which would delete
// the analysis) and at the final read; the critic rubric itself is unchanged.
// Run: node personal-companion/rubric-reread.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
const V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };

const report = "The Indian Removal Act was signed into law on May 28, 1830, by President Andrew Jackson. Congress authorised the exchange of lands west of the Mississippi for lands held in the east. ".repeat(4);
const analysis = "The central mechanism is that the act priced a sovereign claim as a property transfer. That feedback loop rewarded each removal with the next. The load-bearing element was the promise of permanence.";
const piece = { title: "T", lede: "The Indian Removal Act was signed on May 28, 1830.", body_md: report + "\n\n" + V.ANALYSIS_MARK + "\n\n" + analysis };

// 1. every quote after the line: re-read
ok(V.quotesAllInAnalysis(piece, ["The central mechanism is that the act priced", "That feedback loop rewarded each removal"]) === true, "quotes that all lie after the line call for a re-read");
// 2. one quote before the line: no re-read (the full rule holds there)
ok(V.quotesAllInAnalysis(piece, ["Congress authorised the exchange of lands", "That feedback loop rewarded each removal"]) === false, "a quote before the line keeps the rejection as it is");
// 3. no quotes, or no line: no re-read
ok(V.quotesAllInAnalysis(piece, []) === false, "a rejection with no quoted passage gets no re-read");
ok(V.quotesAllInAnalysis({ title: "T", lede: piece.lede, body_md: report + "\n\n" + analysis }, ["That feedback loop rewarded each removal"]) === false, "a draft without the analysis line gets no re-read");
// 4. a quote found in neither part (the critic quoted something the draft does not hold) is not in the analysis
ok(V.quotesAllInAnalysis(piece, ["a passage the draft never contained at all"]) === false, "a quote the draft does not contain is not counted as analysis");

// 5. the note carries the passages and the rubric's own rule
const note = V.rubricRereadNote(["That feedback loop rewarded each removal"]);
ok(/after the <!-- analysis --> line/.test(note) && /"That feedback loop rewarded each removal"/.test(note) && /never grounding/.test(note) && /only a concrete invented fact/.test(note), "the note quotes the passages and the rubric rule for the section", note.slice(0, 200));
ok(/Text after a line <!-- analysis --> is the writer's marked analysis: there, count under grounding only a concrete invented fact/.test(V.prompts.P_CRITIQUE), "the critic rubric itself is unchanged");

// 6. critiquePiece appends the note to what the critic reads; without it the message is as before
const sink = [];
const env = { AI: { run: async (model, input) => { sink.push({ model, input }); return { response: JSON.stringify({ specificity: 7, argument: 7, objection: 7, voice: 7, grounding: 8, systems: 7, invented: [], verdict: "accept", why: "ok" }) }; } } };
const q1 = await V.critiquePiece(env, piece, "essay", "SOURCE TEXT");
const q2 = await V.critiquePiece(env, piece, "essay", "SOURCE TEXT", note);
const u1 = sink[0] && sink[0].input.messages[1].content, u2 = sink[1] && sink[1].input.messages[1].content;
ok(q1 && q2 && u2 === u1 + "\n\n" + note, "the re-read is the same critic call with the note appended", [u1 && u1.length, u2 && u2.length]);
ok(sink.length === 2 && sink[0].model === sink[1].model, "the re-read asks the same critic model", sink.map((s) => s.model));

// 7. wiring: before the critic prune in generate, and at the final read
const gen = src.slice(src.indexOf("async function generate("), src.indexOf("__name(generate"));
const iRR = gen.indexOf("rubricRereadNote(rq)"), iP = gen.indexOf("for (var cround = 1; cround <= CRITIC_PRUNE_ROUNDS");
ok(iRR > 0 && iP > iRR, "the re-read runs before the critic prune deletes the analysis", [iRR, iP]);
ok(/var rrNote = !rq\.length \? rubricNoQuoteNote\(\) : analysisSplitOk\(splitText\(piece\)\) && quotesAllInAnalysis\(piece, rq\) \? rubricRereadNote\(rq\) : rqSrc \? sourcedRereadNote\(rqSrc\) : "";/.test(gen), "a grounding rejection is re-read only when it quotes nothing the piece contains, only the marked analysis, or only passages the source states (CRITIC-QUOTE-SOURCED-1, 1.26.2)");
// RUBRIC-NO-QUOTE-1 (1.26.1)
const nq = V.rubricNoQuoteNote();
ok(/quoted no passage of the piece as invented/.test(nq) && /a source detail the piece leaves out is not a grounding failure/.test(nq) && /score grounding 0 only if you can quote one/.test(nq), "the no-quote note states the rule: only a quotable invented claim scores grounding 0", nq);
ok((gen.match(/rubricNoQuoteNote\(\)/g) || []).length === 2, "the no-quote re-read runs at the critique and at the final read");
ok(/rubricRereadNote\(rqf\)/.test(gen) && /final rubric re-read: /.test(gen), "the final read gets the same one re-read");
ok((gen.match(/rubricRereadNote\(/g) || []).length === 2, "one re-read per reading, never a loop");

const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 1 || (ver[0] === 1 && (ver[1] > 26 || (ver[1] === 26 && ver[2] >= 1)))), "VERSION is at least 1.26.1", ver);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
