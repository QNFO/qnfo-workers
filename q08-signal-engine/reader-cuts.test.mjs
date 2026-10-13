// Q08-READER-CUTS-1 (0.15.0): the paragraph cuts readers name are applied deterministically before the model editor.
const mod = await import("./worker.js");
const C = mod.__cuts, Q = mod.__quality;
let passes = 0, fails = 0;
function check(name, cond, info) { if (cond) passes++; else { fails++; console.log("FAIL " + name + (info !== undefined ? " -- " + JSON.stringify(info) : "")); } }
const I = C.readerCutIndices;
check("run 355: 'Delete paragraphs 4, 6, and 7, which restate paragraph 3'", JSON.stringify(I("Delete paragraphs 4, 6, and 7, which restate paragraph 3 in role-words and summary", 9)) === "[3,5,6]", I("Delete paragraphs 4, 6, and 7, which restate paragraph 3", 9));
check("'Cut paragraphs two through four'", JSON.stringify(I("Cut paragraphs two through four, which restate the opening quote", 8)) === "[1,2,3]");
check("'Cut the last two paragraphs'", JSON.stringify(I("Cut the last two paragraphs - they restate the trade-off", 8)) === "[6,7]");
check("'Delete the final paragraph and the first sentence of the fifth'", JSON.stringify(I("Delete the final paragraph and the first sentence of the fifth", 8)) === "[7]");
check("'Delete the final two paragraphs and every sentence that restates'", JSON.stringify(I("Delete the final two paragraphs and every sentence that merely restates the quote", 8)) === "[6,7]");
check("advice without a cut verb cuts nothing", I("Open with a specific example of a researcher's challenge", 8).length === 0);
check("'remove the abstract framing' names no paragraph", I("remove the abstract framing and start with the quote", 8).length === 0);
check("an out-of-range paragraph is ignored", JSON.stringify(I("Delete paragraph 12", 8)) === "[]");
const para = (i) => "Paragraph " + i + " tells how the operator watched the queue grow while the dashboard stayed green, because it measured the database and not the disk under it.";
const essay = "# The queue nobody measured\n\n" + [1, 2, 3, 4, 5, 6, 7, 8].map(para).join("\n\n") + "\n\nworth your time: yes - names the mechanism";
const cut = C.applyReaderCuts(essay, "Delete paragraphs 4, 6, and 7.");
check("applyReaderCuts removes exactly those body paragraphs and keeps title and verdict", cut && cut.cut.join() === "4,6,7" && !/Paragraph 4 |Paragraph 6 |Paragraph 7 /.test(cut.text) && /Paragraph 5 /.test(cut.text) && /^# The queue/.test(cut.text) && /worth your time: yes/.test(cut.text), cut);
check("more than half the body is never cut", C.applyReaderCuts(essay, "Delete paragraphs 1 through 5.") === null);
// runLevels: the first panel names cuts, the deterministic cut is used, no editor model call is made
const W = "@cf/nvidia/nemotron-3-120b-a12b";
const longPara = (i) => para(i) + " " + para(i) + " " + para(i);
const long = "# The queue nobody measured\n\n" + [1, 2, 3, 4, 5, 6, 7, 8].map(longPara).join("\n\n") + "\n\nworth your time: yes - names the mechanism";
let editorCalls = 0, judge = 0;
const env = { AI: { run: async (model, args) => {
  const prompt = args.messages[0].content;
  if (/busy, intelligent reader/.test(prompt)) { judge++; return { response: JSON.stringify(judge <= 2 ? { would_read_to_end: false, score: 2, slop_tells: [], fix: "Delete paragraphs 4, 6, and 7, which restate paragraph 3" } : { would_read_to_end: true, score: 4, slop_tells: [], fix: "" }) }; }
  editorCalls++; return { response: long };
} } };
const r = await Q.runLevels(env, { piece: { text: long, model: W }, prompt: "P", banned: [], seedText: "s", gateResult: { ok: true, problems: [] } });
check("runLevels publishes the reader-cut draft without an editor model call", r.gateResult.ok && editorCalls === 0 && !/Paragraph 4 /.test(r.piece.text) && r.rows.some((x) => x.role === "reader_cuts"), { ok: r.gateResult.ok, editorCalls, rows: r.rows.map((x) => x.role) });
console.log("reader-cuts.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
