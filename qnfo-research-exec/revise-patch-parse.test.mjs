// REVISE-PATCH-PARSE-1 (agent_issues 2211) and PUBLISH-RECORD-UNDEFINED-1 (agent_issues 2137) offline suite.
// Runs the worker's own parsePatchEdits / applyRevisePatch on the model outputs that lost every edit (LaTeX backslashes, a
// cited "[12]" before the array, a code fence, a truncated tail), and checks that no publish bind can pass undefined.
// Run: node qnfo-research-exec/revise-patch-parse.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const grab = (sig) => { const start = src.indexOf(sig); const end = src.indexOf("\n}\n", start); if (start < 0 || end < 0) throw new Error("not found " + sig); return src.slice(start, end + 2); };
const api = new Function(grab("function repairJsonBackslashes(") + "\n" + grab("function topLevelJsonValues(") + "\n" + grab("function patchFlexTokens(") + "\n" + grab("function findFlexible(") + "\n" + grab("function parsePatchEdits(") + "\n" + grab("function patchNewIdentifiers(") + "\n" + grab("function applyRevisePatch(") + "\nreturn { parsePatchEdits, applyRevisePatch }; ")();
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const P = (s) => api.parsePatchEdits(s);
ok(P('[{"find":"abc","replace":"x"}]').length === 1, "plain array parses");
let e = P('Here: [{"find":"the value $\\alpha$ is three units","replace":"the value $\\alpha = \\frac{1}{2}$ and $\\nu$\\nNext"}]');
ok(e.length === 1 && e[0].find === "the value $\\alpha$ is three units" && e[0].replace === "the value $\\alpha = \\frac{1}{2}$ and $\\nu$\nNext", "LaTeX backslashes survive; \\n before a capital stays a newline", e);
e = P('Per ref [12] we fix:\n```json\n[{"find":"one","replace":"two"}]\n```');
ok(e.length === 1 && e[0].replace === "two", "a cited [12] and a code fence before the array", e);
e = P('[{"find":"one","replace":"two"},{"find":"three","replace":"fo');
ok(e.length === 1 && e[0].find === "one", "a truncated tail costs only the last edit", e);
e = P('[{"find":"say \\"hi\\" now","replace":"\\theta and \\tau"}]');
ok(e[0].find === 'say "hi" now' && e[0].replace === "\\theta and \\tau", "escaped quotes kept; \\theta and \\tau are LaTeX, not a tab", e);
ok(P("[]").length === 0 && P("no json here").length === 0 && P("").length === 0, "empty and non-JSON answers give no edits");
// REVISE-PATCH-PARSE-2 (0.16.0, agent_issues 2211): the shapes the model answers in besides one bare array.
e = P('```json\n[{"find":"abcdefghij abcdefghij","replace":"x"}]\n```');
ok(e.length === 1 && e[0].find === "abcdefghij abcdefghij", "a fenced json block alone", e);
e = P('{"edits":[{"find":"a","replace":"b"},{"find":"c","replace":"d"}]}');
ok(e.length === 2 && e[1].replace === "d", "an object whose edits array holds the edits", e);
e = P('[{"find":"a","replace":"b"}]\nAnd the second fix:\n[{"find":"c","replace":"d"}]');
ok(e.length === 2 && e[0].find === "a" && e[1].find === "c", "several top-level arrays are read whole, not first-[ to last-]", e);
e = P('Note [3] applies.\n```json\n{"edits":[{"find":"a","replace":"b [x] {y}"}]}\n```\nDone.');
ok(e.length === 1 && e[0].replace === "b [x] {y}", "brackets and braces inside strings do not split a value; a cited [3] is dropped", e);
e = P('[{"find":"f(x) = {a}","replace":"g[1]"}, 7, "s"]');
ok(e.length === 1 && e[0].replace === "g[1]", "non-object entries never count as proposed edits", e);
ok(P("[]").length === 0 && P('{"edits":[]}').length === 0 && P("```json\n[]\n```").length === 0, "an empty array in any wrapping is zero edits (the strict retry is the caller's job)");
const paper = "Intro. The coupling $\\alpha$ equals 0.5 in the model we study here today. End.";
const r = api.applyRevisePatch(paper, '[{"find":"The coupling $\\alpha$ equals 0.5 in the model","replace":"The coupling $\\alpha$ equals $\\frac{1}{2}$ in the model"}]');
ok(r.applied === 1 && r.proposed === 1 && r.text.includes("$\\frac{1}{2}$"), "a LaTeX patch applies to the paper", r);
const r2 = api.applyRevisePatch(paper, '[{"find":"text that is not in the paper at all","replace":"x"}]');
ok(r2.applied === 0 && r2.proposed === 1 && r2.text === paper, "the exact-once find check still guards every edit", r2);
ok(!/\.bind\(pub\.doi, pub\.record/.test(src) && !/0, pub\.record, "https/.test(src), "no publish bind passes pub.record or pub.doi bare (undefined throws D1_TYPE_ERROR)");
ok(/inhouse: true, doi: null, conceptdoi: null, record: null/.test(src), "the in-house branch returns an explicit null record (INHOUSE-PUBLISH-3)");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
