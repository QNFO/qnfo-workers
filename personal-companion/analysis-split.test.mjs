// ANALYSIS-SPLIT-1 offline suite (personal-companion 1.22.0, charter pillar: personal; agent_issues 2222). Pattern of q08-signal-engine 0.19.0.
// Proves: the writer marks its analysis with an invisible line; the critic and the fact-check read the marked draft only when the guard
// rails hold (600 characters of reporting before the line, analysis at most 60% of the body, one line), else the line is removed and the
// whole draft is held to the full rule; the deterministic name/year/figure check reads the text without the line; the line is removed
// before a piece is stored, indexed, filed to media or mailed.
// Run: node personal-companion/analysis-split.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
const V = mod.__verify, P = V.prompts;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };
const report = ("The source reports that the court ruled on the regulation in 2001 and that the owner had bought the land in 1978. ").repeat(8);
const analysis = ("The incentive is that a buyer who knows the rule can still sue, so the state pays for its own delay. ").repeat(4);
const marked = "# Title\n\n" + report + "\n\n" + V.ANALYSIS_MARK + "\n\n" + analysis;
ok(V.ANALYSIS_MARK === "<!-- analysis -->", "the line is an HTML comment readers never see");
ok(V.stripAnalysisMark(marked).indexOf("<!--") < 0 && /The incentive is/.test(V.stripAnalysisMark(marked)) && !/\n{3,}/.test(V.stripAnalysisMark(marked)), "stripping removes only the line");
ok(V.analysisSplitOk(marked) === true, "a draft with 600+ characters of reporting and a minority of analysis may be split");
ok(V.reviewText(marked) === marked, "the reviewers read the marked draft when the guard rails hold");
const early = "# Title\n\nShort report.\n\n" + V.ANALYSIS_MARK + "\n\n" + analysis + analysis;
ok(V.analysisSplitOk(early) === false && V.reviewText(early).indexOf("<!--") < 0, "a line placed before 600 characters of reporting is removed: the whole draft gets the full rule");
const heavy = "# Title\n\n" + report + "\n\n" + V.ANALYSIS_MARK + "\n\n" + analysis.repeat(6);
ok(V.analysisSplitOk(heavy) === false && V.reviewText(heavy).indexOf("<!--") < 0, "analysis over 60% of the body is removed from the split");
const twice = "# Title\n\n" + report + "\n\n" + V.ANALYSIS_MARK + "\n\n" + analysis + "\n\n" + V.ANALYSIS_MARK + "\n\nMore.";
ok(V.analysisSplitOk(twice) === false, "two lines are not a valid split");
ok(V.analysisSplitOk("# T\n\n" + report) === false && V.reviewText("# T\n\n" + report) === "# T\n\n" + report, "an unmarked draft is reviewed as it is");
ok(V.analysisSplitOk("# T\n\n" + report + "\n\n  <!--  analysis -->  \n\n" + analysis) === true, "spacing inside and around the line is tolerated");
ok(/Begin the analysis with a line of its own that contains exactly <!-- analysis --> \(readers never see it\)/.test(P.P_STYLE), "the writer is told to mark its analysis");
ok(/Text after a line <!-- analysis --> is the writer's marked analysis: there, count under grounding only a concrete invented fact/.test(P.P_CRITIQUE) && /Text before that line is held to the full rule/.test(P.P_CRITIQUE), "the critic counts only concrete invented facts after the line, the full rule before it");
ok(/If the DRAFT contains a line <!-- analysis -->/.test(P.FACTCHECK_PROMPT) && /never violations in that section/.test(P.FACTCHECK_PROMPT) && /The text before the line is checked by every rule below/.test(P.FACTCHECK_PROMPT), "the fact-check prompt carries the same split");
const vp = src.slice(src.indexOf("async function verifyPiece(env, text, ground, writerModel, seedText, opts) {"), src.indexOf("// Everything a reader is shown"));
ok(/var det = groundingProblems\(stripAnalysisMark\(text\), ground, opts\);/.test(vp) && /var fc = await factCheck\(env, reviewText\(text\), ground, writerModel, seedText\);/.test(vp), "names, years and figures are checked on the whole text; the reviewers read the review text");
const cp = src.slice(src.indexOf("async function critiquePiece(env, piece, form, ground) {"), src.indexOf("__name(critiquePiece"));
ok(/"LEDE: " \+ stripAnalysisMark\(piece\.lede \|\| ""\)/.test(cp), "the critic reads the lede without the line");
// persistPiece stores, indexes and files the piece without the line
const binds = [], puts = [];
const env = {
  PERSONAL: { prepare() { return { bind(...a) { binds.push(a); return { run: async () => ({}) }; } }; } },
  MEDIA: { put: async (k, v) => { puts.push(String(v)); } },
};
const piece = { title: "Title", subtitle: "", lede: "The lede.", body_md: report + "\n\n" + V.ANALYSIS_MARK + "\n\n" + analysis };
try { await V.persistPiece(env, piece, "essay", { id: "wiki:X", a: "X", anchors: [] }, "m", {}, 900, "ground"); } catch (e) { /* later steps need bindings this stub does not have */ }
ok(binds.length > 0 && String(binds[0][5]).indexOf("<!--") < 0 && /The incentive is/.test(String(binds[0][5])), "the stored body carries no analysis line", binds[0] && String(binds[0][5]).slice(-120));
ok(puts.every((x) => x.indexOf("<!--") < 0), "the media copy carries no analysis line");
ok(V.stripPieceMark({ lede: "<!-- analysis -->\nL", body_md: "B" }).lede === "L", "a line in the lede is removed too");
ok(V.ledeOf({ body_md: "<!-- analysis -->\n\nThe subject is here." }) === "The subject is here.", "the line is never read as the lede");
ok(/^analysis marked \d+% after \d+ chars$/.test(V.analysisSplitInfo(marked)), "ANALYSIS-SPLIT-DIAG-1: a valid split is logged with its share", V.analysisSplitInfo(marked));
ok(V.analysisSplitInfo("# T\n\n" + report) === "analysis unmarked", "an unmarked draft is logged as unmarked");
ok(/^analysis dropped: report \d+ chars < 600$/.test(V.analysisSplitInfo(early)) && /^analysis dropped: analysis \d+% > 60%$/.test(V.analysisSplitInfo(heavy)) && V.analysisSplitInfo(twice) === "analysis dropped: more than one line", "a dropped split names the rail", [V.analysisSplitInfo(early), V.analysisSplitInfo(heavy), V.analysisSplitInfo(twice)]);
ok(/"stage", "critique \(" \+ analysisSplitInfo\(splitText\(piece\)\) \+ "\)"/.test(src), "the critique stage row carries the split diagnosis");
const gen = src.slice(src.indexOf("// FINAL-READ-1 (1.22.4"), src.indexOf("best = { piece: finalPiece, quality: q, words: v.words, vr: vr };"));
ok(/if \(pieceText\(finalPiece\) !== pieceText\(piece\)\) \{/.test(gen) && /var qf = await critiquePiece\(env, finalPiece, form, ground\);/.test(gen), "FINAL-READ-1: a text changed after the critic's last read is read again");
ok(/if \(!qf\) \{[\s\S]{0,200}continue;/.test(gen) && /if \(sfin\.missing \|\| sfin\.worst < floorForForm\) \{[\s\S]{0,500}continue;/.test(gen), "the final read fails closed: no reader or a score below the floor rejects the attempt");
ok(/q = qf;/.test(gen) && gen.indexOf("q = qf;") < gen.length, "the stored scores are the final read's");
{
  const lede = "Polish immigration to the coalfield is the subject. The source reports the arrival of miners in the 1920s and their recruitment by the mining companies of the region, with numbers that grew each year.";
  const facts = ("The companies recruited workers in Westphalia and housed them in company towns near the pits, according to the source. ").repeat(3);
  const reasoning = "The incentive is that a company which houses its workers also controls when they can leave, so the cost of a strike falls on the family as well as the miner.";
  const unmarked = lede + "\n\n" + facts + "\n\n" + facts + "\n\n" + reasoning + "\n\n" + reasoning;
  const am = V.autoMarkAnalysis(unmarked);
  ok(am.indexOf(V.ANALYSIS_MARK) > 0 && am.indexOf(V.ANALYSIS_MARK) < am.indexOf("The incentive is") && V.analysisSplitOk(am), "ANALYSIS-AUTO-1: an unmarked draft gets the line before its first reasoning paragraph", am.slice(0, 80));
  ok(V.autoMarkAnalysis(marked) === marked, "a draft the writer marked is left as it is");
  const tooEarly = "Short lede because of reasons.\n\nThe incentive is everything.\n\nThe system rewards it.";
  ok(V.autoMarkAnalysis(tooEarly) === tooEarly, "no line is placed where the guard rails would not hold");
  ok(V.autoMarkAnalysis(lede + "\n\n" + facts + "\n\n" + facts) === lede + "\n\n" + facts + "\n\n" + facts, "a draft without reasoning language is left unmarked");
  const p0 = { title: "T", body_md: unmarked };
  ok(V.withAutoMark(p0) !== p0 && V.withAutoMark({ title: "T", body_md: lede }).body_md === lede, "withAutoMark returns a new piece only when it placed a line");
  const gl = src.slice(src.indexOf("var split = splitLongLede(piece);"), src.indexOf("var v = validatePiece(piece, form, ground, vopts);"));
  ok(/piece = withAutoMark\(piece\);/.test(gl) && /var rp = rev && rev\.piece \? withAutoMark\(splitLongLede\(rev\.piece\)\) : null;/.test(src), "fresh drafts and revisions are auto-marked before the gate");
}
{
  // SPLIT-LEDE-1: run 5682's shape: a 500-character lede stored apart, 323 characters of body reporting, then the line
  const lede = ("The 2015 Kogi State gubernatorial election chose the governor of Kogi State, Nigeria, on 21 November 2015, as the source reports. ").repeat(4);
  const bodyRep = ("The source records the candidates and the result of the vote in each district. ").repeat(4);
  const ana = "The incentive for a party is to keep a candidate the courts may replace, so the cost of a late death falls on the voters.";
  const p = { title: "T", lede: lede, body_md: bodyRep + "\n\n" + V.ANALYSIS_MARK + "\n\n" + ana };
  ok(V.analysisSplitOk(p.body_md) === false && V.analysisSplitOk(V.splitText(p)) === true, "SPLIT-LEDE-1: the lede counts toward the 600 characters of reporting");
  ok(/^analysis marked \d+% after \d+ chars$/.test(V.analysisSplitInfo(V.splitText(p))), "the diagnosis reads lede and body together", V.analysisSplitInfo(V.splitText(p)));
  const unmarked = { title: "T", lede: lede, body_md: bodyRep + "\n\n" + bodyRep + "\n\n" + ana + "\n\n" + ana };
  ok(V.withAutoMark(unmarked).body_md.indexOf(V.ANALYSIS_MARK) > 0, "the auto-marker counts the lede too");
  const cq = src.slice(src.indexOf("async function critiquePiece("), src.indexOf("__name(critiquePiece"));
  ok(/analysisSplitOk\(splitText\(piece\)\) \? String\(piece\.body_md \|\| ""\) : stripAnalysisMark\(piece\.body_md\)/.test(cq), "the critic reads the marked body when the rails hold on lede and body");
}
const vmx = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vmx && (+vmx[1] > 1 || (+vmx[1] === 1 && +vmx[2] >= 22)), "VERSION is at least 1.22.0", vmx && vmx[0]);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
