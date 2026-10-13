// Q08-ANALYSIS-SECTION-1 (0.19.0): the reporting is fact-checked sentence by sentence, the marked analysis only for invented facts.
const mod = await import("./worker.js");
const A = mod.__analysis, V = mod.__verify, Q = mod.__quality, C = mod.__cuts;
let passes = 0, fails = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };
const rep = "Rust's maintainers confirmed this week that two soundness bugs in the borrow checker had gone unnoticed for eleven years, after a contributor reported them on GitHub. ".repeat(4);
const ana = "The incentive is to trust the checker, because when it approves code, nobody looks again. That means a flaw in the checker spreads to every program it approved. ".repeat(3);
const essay = "# Rust's borrow checker missed two bugs for eleven years\n\n" + rep + "\n\n" + A.ANALYSIS_MARK + "\n\n" + ana + "\n\nworth your time: yes - x";
const sp = A.splitAnalysis(essay);
check("the report and the analysis are split at the marker", sp.analysis && /The incentive is to trust the checker/.test(sp.analysis) && !/incentive/.test(sp.report) && /maintainers confirmed/.test(sp.report), sp);
check("the verdict line is not part of the analysis", !/worth your time/.test(sp.analysis));
check("no marker: the whole draft is the report", A.splitAnalysis("# T\n\nBody.").analysis === null);
const greedy = "# T\n\nShort lede.\n\n" + A.ANALYSIS_MARK + "\n\n" + ana.repeat(3);
check("an analysis over 60% of the body, or a report under 600 characters, is checked as report", A.splitAnalysis(greedy).analysis === null && A.splitAnalysis(greedy).rejected === true);
check("stripAnalysisMark removes the line and leaves no gap", A.stripAnalysisMark(essay).indexOf("<!--") < 0 && !/\n\n\n/.test(A.stripAnalysisMark(essay)));
check("the gate does not object to the marker", !Q.gate(essay, []).problems.some((p) => /analysis|<!--|html/i.test(p)), Q.gate(essay, []).problems);
// two checks: the report with the strict prompt, the analysis with the facts-only prompt
const prompts = [];
const env = { AI: { run: async (m, a) => { const body = a.messages[0].content; prompts.push(/You check the ANALYSIS section/.test(body) ? "analysis" : "report"); const draft = body.split("--- DRAFT ---")[1] || ""; if (/You check the ANALYSIS section/.test(body)) return { response: '{"unsupported": [], "verdict": "pass"}' }; return { response: /incentive/.test(draft) ? JSON.stringify({ unsupported: ["FACT: the incentive is to trust the checker -- not in source"], verdict: "fail" }) : '{"unsupported": [], "verdict": "pass"}' }; } } };
const ground = rep;
const vr = await V.verifyPiece(env, essay, ground, "@cf/openai/gpt-oss-120b", "s", {});
check("the analysis goes to the facts-only check, the report to the strict check", prompts.filter((x) => x === "analysis").length === 2 && prompts.filter((x) => x === "report").length === 2, prompts);
check("reasoning in the analysis is not failed by the strict check", vr.ok === true, vr);
const env2 = { AI: { run: async (m, a) => { const body = a.messages[0].content; return { response: /You check the ANALYSIS section/.test(body) ? JSON.stringify({ unsupported: ["FACT: a 2019 audit by Mozilla found the same flaw -- not in source"], verdict: "fail" }) : '{"unsupported": [], "verdict": "pass"}' }; } } };
const vr2 = await V.verifyPiece(env2, essay, ground, "@cf/openai/gpt-oss-120b", "s", {});
check("an invented fact in the analysis still fails the piece", vr2.ok === false && vr2.problems.some((p) => /2019 audit by Mozilla/.test(p)), vr2);
// readers never see the marker; reader cuts number paragraphs without it
let seenByReader = "";
await Q.readerTest({ AI: { run: async (m, a) => { seenByReader = a.messages[0].content; return { response: '{"would_read_to_end": true, "score": 4, "slop_tells": [], "fix": ""}' }; } } }, "@cf/qwen/qwen3-30b-a3b-fp8", essay);
check("readers never see the marker", seenByReader.indexOf("<!--") < 0 && /incentive is to trust/.test(seenByReader));
const five = "# T\n\nP1 lede about the case.\n\nP2 context.\n\n" + A.ANALYSIS_MARK + "\n\nP3 analysis.\n\nP4 more.\n\nworth your time: yes - x";
const cut = C.applyReaderCuts(five, "Delete paragraph 3.");
check("reader cuts count paragraphs as the readers saw them (the marker is not a paragraph)", cut && !/P3 analysis/.test(cut.text) && /P4 more/.test(cut.text) && /<!-- analysis -->/.test(cut.text), cut);
const src = (await import("node:fs")).readFileSync(new URL("./worker.js", import.meta.url), "utf8");
check("every publish path strips the marker", (src.match(/piece\.text = stripAnalysisMark\(piece\.text\.replace\(/g) || []).length === 3);
check("the directive asks for the marker", /Begin the systems analysis with a line of its own that contains exactly <!-- analysis -->/.test(mod.__lede.Q08_DIRECTIVE));
// Q08-ANALYSIS-AUTO-1 (0.19.2, run 378)
{
  const r1 = "Mozilla announced Firefox Enterprise this week, a managed version of its browser for companies, in a post on its blog. ".repeat(3);
  const r2 = "The package adds central policy controls and a longer support window for business customers who deploy it. ".repeat(3);
  const a1 = "The incentive for Mozilla is to sell support, because the browser itself is free; that means the paid tier carries the cost. ".repeat(2);
  const unmarked = "# Mozilla sells a managed Firefox\n\n" + [r1, r2, a1].join("\n\n") + "\n\nworth your time: yes - x";
  const sp = A.splitAnalysis(unmarked);
  check("an unmarked draft gets its analysis found automatically", sp.mode === "auto" && /incentive for Mozilla/.test(sp.analysis) && !/incentive/.test(sp.report), sp);
  const plain = "# T\n\n" + [r1, r2, r2].join("\n\n");
  check("a draft with no reasoning paragraph after the context is not split", A.splitAnalysis(plain).mode === "none");
  check("a marked draft reports marked", A.splitAnalysis(essay).mode === "marked");
  const early = "# T\n\n" + [a1, r1, r2].join("\n\n");
  check("reasoning in the lede or context paragraphs is never the analysis start", A.splitAnalysis(early).mode === "none");
}
// ---- Q08-ANALYSIS-DEPTH-1 / Q08-DANGLING-CUT-1 (0.20.0, run 380) ----------------------------------------------------------------
{
  const A = (await import("./worker.js")).__analysis;
  const V = (await import("./worker.js")).__verify;
  const rep = "Character.ai filed for Chapter 11 bankruptcy protection and said it is pursuing a sale of its assets to Disney, according to The Verge on Oct 13 2026. ".repeat(3) + "\n\n" + "Character.ai is a chatbot service built by former Google developers; Disney offered $20 million for some of its assets and hired its former chief executive. ".repeat(3);
  const thin = "# T\n\n" + rep + "\n\n<!-- analysis -->\n\nThis information gap discourages rival offers, reinforcing the lead bidder's position because the bidder already employs the staff.\n\nworth your time: yes - x";
  const tp = A.analysisDepthProblems(thin);
  check("run 380's two-sentence analysis is held as too thin", tp.some((p) => /^systems analysis too thin/.test(p)), tp);
  check("its opening 'This information gap' is flagged as referring to nothing", tp.some((p) => /opens with 'This information gap/.test(p)), tp);
  const deep = "# T\n\n" + rep + "\n\n<!-- analysis -->\n\n" + "Disney is rewarded for buying the staff it already hired, because the founders' knowledge left with them and a rival bidder would pay for a shell. ".repeat(3) + "\n\n" + "Creditors pay for that arrangement, because the court sees one bid and the users who pay subscriptions have no seat at the table. ".repeat(3) + "\n\nworth your time: yes - x";
  check("a two-paragraph analysis over the floor with a grounded opening passes", A.analysisDepthProblems(deep).length === 0, A.analysisDepthProblems(deep));
  check("a demonstrative whose noun the piece used is not dangling", A.danglingOpening("This bankruptcy leaves users waiting.", "the bankruptcy filing") === false);
  check("'This means' is not dangling", A.danglingOpening("This means the bidder waits.", "") === false);
  check("a piece with no analysis at all is held", A.analysisDepthProblems("# T\n\n" + rep + "\n\nworth your time: yes - x").some((p) => /^no systems analysis section/.test(p)));
  const txt = "# T\n\nLede sentence names the company and the filing date here.\n\nThe filing lists liabilities and names one bidder for the assets. The bidder hides its valuation from rivals. This information gap discourages rival offers. The court sets a date.\n\nworth your time: yes - x";
  const pr = V.pruneUnsupported(txt, ["unsupported claim: The bidder hides its valuation from rivals."]);
  check("a 'This <noun>' sentence left after a cut goes with it", pr.removed.length === 2 && !pr.text.includes("information gap") && pr.text.includes("The court sets a date"), pr);
}
// ---- Q08-MARK-SHIFT-1 (0.20.1, run 381) -----------------------------------------------------------------------------------------
{
  const A = (await import("./worker.js")).__analysis;
  const rp = "The paper by the grid team reports a detector trained on cost rather than accuracy, published on arXiv this week with its full method. ".repeat(2);
  const an = "Operators are rewarded for low cost, so a detector graded on accuracy optimises the wrong target, and the expensive misses go unpunished. ".repeat(3);
  const early = "# T\n\n" + rp + "\n\n<!-- analysis -->\n\n" + rp + "\n\n" + rp + "\n\n" + an + "\n\n" + an + "\n\nworth your time: yes - x";
  const sp = A.splitAnalysis(early);
  check("a marker placed before 600 characters of reporting moves later instead of being dropped", sp.mode === "marked-shifted" && sp.analysis && sp.analysis.includes("Operators are rewarded") && sp.report.length >= 600, { mode: sp.mode, rl: sp.report.length });
  check("a marker that is already valid is kept where the writer put it", A.splitAnalysis("# T\n\n" + rp + "\n\n" + rp + "\n\n" + rp + "\n\n<!-- analysis -->\n\n" + an + "\n\nworth your time: yes - x").mode === "marked");
}
// ---- Q08-ANALYSIS-CONCRETE-1 (0.20.3, run 383) ------------------------------------------------------------------------------
{
  const A = (await import("./worker.js")).__analysis;
  check("abstract reasoning is not a concrete analysis item", !A.concreteClaim("'Adopting the platform, however, requires learning a new workflow and integrating its outputs into existing practices.' -- source does not mention adoption"));
  check("an open question is not a concrete analysis item", !A.concreteClaim("'Whether the perceived benefit of a verifiable configuration hash will motivate enough users to adopt the platform remains unresolved.' -- not discussed"));
  check("a named organisation doing something is concrete", A.concreteClaim("FACT: the platform was adopted by Google for its swarm lab -- not in source"));
  check("a figure is concrete", A.concreteClaim("simulation cuts cost by 40 percent -- not in source"));
  check("a quotation is concrete", A.concreteClaim("the authors call it \u201ca turning point for the field\u201d -- quote not in source"));
  check("a bare reviewer fail stays (fail-closed)", A.concreteClaim("the reviewer rejected the draft without naming a claim"));
  const fa = A.concreteAnalysisItems({ ok: false, unavailable: false, unsupported: ["'Adopting the platform requires learning a new workflow.' -- not in source"], inferences: [], judges: [] });
  check("a check that listed only abstract reasoning passes", fa.ok === true && fa.unsupported.length === 0 && fa.droppedAbstract === 1, fa);
}
// ---- Q08-PARAPHRASE-ITEMS-1 (0.24.1, run 387) ---------------------------------------------------------------------------------
{
  const A = (await import("./worker.js")).__analysis;
  const fc = { ok: false, unavailable: false, inferences: [], judges: [], unsupported: [
    "Next-generation applications need both high data rate and low latency -- not explicitly stated in source",
    "Current transport protocols fall short -- phrasing not in source",
    "TCP Cubic, chasing maximum throughput, filled buffers and suffered the latency penalty -- not explicitly stated in source",
    "the base station cut latency 72x -- figure not in source" ] };
  const r = A.paraphraseItemsDropped(fc);
  check("conceded paraphrases without concrete content are dropped", r.droppedParaphrase === 2 && r.unsupported.length === 2, r);
  check("a named thing still counts even with a paraphrase reason", r.unsupported.some((u) => /TCP Cubic/.test(u)));
  check("a figure with a plain 'not in source' reason still counts", r.unsupported.some((u) => /72x/.test(u)) && r.ok === false);
  const onlyPara = A.paraphraseItemsDropped({ ok: false, unavailable: false, unsupported: ["Current transport protocols fall short -- wording not in source"] });
  check("a check failed only on a conceded paraphrase passes", onlyPara.ok === true && onlyPara.unsupported.length === 0);
}
console.log("analysis.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
