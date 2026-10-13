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
console.log("analysis.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
