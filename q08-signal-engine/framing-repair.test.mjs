// FRAMING-REPAIR-1 + FACTCHECK-DEGRADE-1 offline suite (q08-signal-engine 0.13.0, agent_issues 2284, 2286, 2288).
// A gate failure made only of phrase-level, body-sentence problems is repaired without a model call: the sentences that hold the
// flagged phrases are removed, the full gate is re-run, and the result is accepted only when it passes and at most a quarter of the
// sentences went. A FACTS/accuracy or fabrication problem, a title problem, or a cut over the cap keeps the model retry. The writer,
// editor and forecaster prompts carry the framing-idiom line, the retry feedback shows the flagged phrase in its sentence, and the
// fact-check panel tries every non-writer family before a draft fails as unavailable.
// Run: node q08-signal-engine/framing-repair.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const mod = await import(pathToFileURL(join(here, "worker.js")).href);
const F = mod.__framing, gate = mod.__quality.gate, V = mod.__verify;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

// ---- a vm sandbox holding only the gate constants, gate() and the phrase-level block: the repair must be self-contained -----------
const constants = src.slice(src.indexOf("var BANNED_BABBLE = ["), src.indexOf("// TITLE-PROMOTE-1 (v0.7.32)"));
const gateSrc = src.slice(src.indexOf("function gate("), src.indexOf("\n}\n", src.indexOf("function gate(")) + 3);
const block = src.slice(src.indexOf("var PHRASE_LEVEL_RE"), src.indexOf("async function runLevels"));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(constants + "\n" + gateSrc + "\n" + block, sandbox);
ok(typeof sandbox.framingRepair === "function" && typeof sandbox.gate === "function" && typeof sandbox.problemsWithSentences === "function", "the slice evaluates on its own (no hidden dependency on the rest of the module)");

// ---- a draft that passes the gate, then the same draft with two tell sentences added -------------------------------------------
const para = (i) => "The operator in case " + ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][i] + " watched the queue grow for most of the morning while the dashboard stayed green, because the dashboard measured the database and not the disk beneath it. Each hour the gap between what was measured and what was felt widened, and the people paged for it read a graph that said nothing was wrong. Nobody owned the space between the two numbers, so nobody looked there.";
const clean = "# The queue nobody measured\n\n" + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(para).join("\n\n") + "\n\nworth your time: yes - names the mechanism";
ok(gate(clean, []).ok, "the base draft passes the gate", gate(clean, []).problems);
const tell1 = "This episode reveals a recurrent production pattern across every vendor in the thread.";
const tell2 = "The vibe in the thread was hostile from the first reply.";
const bad = clean.replace(para(2), para(2) + " " + tell1).replace(para(5), tell2 + " " + para(5));
const badProblems = gate(bad, []).problems;
ok(badProblems.length === 2 && /^soft register: 'vibe'/.test(badProblems[0]) && /^stock framing tell: 'reveals a recurrent production pattern'/.test(badProblems[1]), "the gate flags exactly the two tells", badProblems);
ok(F.phraseLevelOnly(badProblems), "both problems are phrase-level");
{
  const r = F.framingRepair(bad, badProblems, (t) => gate(t, []).problems);
  ok(r && r.accepted === true, "all-phrase-level problems: the repair is accepted", r && { accepted: r.accepted, reason: r.reason });
  ok(r.removed.length === 2 && r.total === 32 && !r.text.includes("recurrent production pattern") && !r.text.includes("vibe"), "exactly the two tell sentences were removed (32 body sentences counted)", { removed: r.removed, total: r.total });
  ok(gate(r.text, []).ok && /^# The queue nobody measured\n/.test(r.text) && /worth your time: yes - names the mechanism$/.test(r.text) && r.text.includes(para(2)) && r.text.includes(para(5)), "the repaired draft passes the full gate and keeps the title, the other sentences and the verdict line", gate(r.text, []).problems);
  const row = F.framingRepairRow(r, "writer");
  ok(row.role === "framing_repair" && row.pass === true && row.round === 0 && /FRAMING-REPAIR-1 writer: removed 2 of 32 sentences; accepted/.test(row.fix) && row.tells.length === 2, "the stage-log row names the stage, the count and the outcome", row);
  const s = sandbox.framingRepair(bad, badProblems, (t) => sandbox.gate(t, []).problems);
  ok(s && s.accepted && s.text === r.text, "the sandboxed slice produces the same repair");
}
// ---- the quarter cap -----------------------------------------------------------------------------------------------------------
{
  // 8 body sentences, 3 of them tells: 3 > floor(8 * 0.25) = 2, so the repair is refused even when the caller's gate would pass the rest.
  const longSentence = (i) => "The operator in case " + ["one", "two", "three", "four", "five"][i] + " watched the queue grow for most of the morning while the dashboard stayed green, because the dashboard measured the database and never once measured the disk that sat beneath it and filled.";
  const tells = ["This illustrates a broader structural pattern across vendors.", "What it exposes is a recurring tension between teams.", "The whole thing reveals the same dynamic again."];
  const capped = "# The queue nobody measured\n\n" + [0, 1, 2, 3, 4].map(longSentence).join("\n\n") + "\n\n" + tells.join(" ") + "\n\nworth your time: yes - names the mechanism";
  const probs = ["stock framing tell: 'illustrates a broader structural pattern' \u2014 name the mechanism, do not summarise the essay's significance"];
  ok(tells.every((t) => gate("# T\n\n" + t, []).problems.some((p) => /^stock framing tell/.test(p))), "each of the three tells trips the gate's stock-framing regex");
  const r = F.framingRepair(capped, probs, () => []);
  ok(r && r.accepted === false && /over the quarter cap/.test(r.reason) && r.removed.length === 3 && r.total === 8 && r.text === capped, "three tells in eight sentences: over the cap, not accepted, draft unchanged", r && { accepted: r.accepted, reason: r.reason, removed: r.removed.length, total: r.total });
  const two = "# The queue nobody measured\n\n" + [0, 1, 2, 3, 4].map(longSentence).join("\n\n") + "\n\n" + tells.slice(0, 2).join(" ") + " " + longSentence(0) + "\n\nworth your time: yes - names the mechanism";
  const r2 = F.framingRepair(two, probs, () => []);
  ok(r2 && r2.accepted === true && r2.removed.length === 2 && r2.total === 8, "two tells in eight sentences: at the cap, accepted", r2 && { accepted: r2.accepted, reason: r2.reason, removed: r2.removed.length, total: r2.total });
  ok(F.FRAMING_REPAIR_MAX_SHARE === 0.25, "the cap is a quarter");
}
// ---- a FACTS/accuracy or fabrication problem beside the tell: no repair --------------------------------------------------------
{
  ok(F.framingRepair(bad, badProblems.concat(["accuracy: unsupported claim: the vendor had 400 customers -- not in source"]), (t) => gate(t, []).problems) === null, "an accuracy problem present: no repair (null)");
  ok(F.framingRepair(bad, badProblems.concat(["unsupported claim: x -- y"]), () => []) === null, "an unsupported-claim problem present: no repair");
  ok(F.framingRepair(bad, badProblems.concat(["name not in the source: Zorblax"]), () => []) === null, "a grounding problem present: no repair");
  ok(F.framingRepair(bad, badProblems.concat(["invented decimal metric — no fabricated scores"]), () => []) === null, "a fabrication check present: no repair");
  ok(F.framingRepair(bad, badProblems.concat(["too short (2000 chars; 450-1100 words required)"]), () => []) === null, "a length problem present: no repair");
  ok(F.framingRepair(bad, [], () => []) === null, "no problems: nothing to repair");
}
// ---- a title problem is phrase-level but not a body sentence: not repairable, the model retry keeps it --------------------------
{
  const r = F.framingRepair(bad, ["Title Case title reads as a label, not a sentence: 'Selective Redaction Of Site Data'"], () => []);
  ok(r && r.accepted === false && /not a body-sentence problem/.test(r.reason) && r.removed.length === 0, "a title problem alone is not repaired by deletion", r);
  const r2 = F.framingRepair(bad, badProblems.concat(["label title — names a category, not a mechanism: 'Systemic Drift'"]), (t) => gate(t, []).problems);
  ok(r2 && r2.accepted === false && r2.text === bad, "a title problem beside the tells keeps the draft unchanged", r2 && r2.reason);
}
// ---- the repaired draft must pass the full gate the caller passes, floor included -----------------------------------------------
{
  const r = F.framingRepair(bad, badProblems, (t) => ["too short after editing (" + t.length + " chars; floor 99999)"]);
  ok(r && r.accepted === false && /still fails the gate: too short after editing/.test(r.reason) && r.text === bad, "a repaired draft that fails the caller's gate is not accepted", r && r.reason);
  const edOk = F.framingRepair(bad, badProblems, (t) => V.editGateProblems(t, [], false));
  ok(edOk && edOk.accepted, "the editor's gate (EDIT_FLOOR) accepts the same repair", edOk && edOk.reason);
}
// ---- an abstraction-summary problem locates its sentences through the gate's own regex ----------------------------------------
{
  const abs = clean.replace(para(1), para(1) + " A structural dynamic drove it. The systemic failure recurred. An underlying tension stayed.");
  const probs = gate(abs, []).problems;
  ok(probs.length === 1 && /^abstraction-summary phrases x3/.test(probs[0]), "three summary phrases trip the gate", probs);
  const r = F.framingRepair(abs, probs, (t) => gate(t, []).problems);
  ok(r && r.accepted && r.removed.length === 3 && gate(r.text, []).ok, "the three label sentences are removed and the draft passes", r && { removed: r.removed, reason: r.reason });
}
// ---- the retry feedback shows each flagged phrase inside its sentence ----------------------------------------------------------
{
  const shown = F.problemsWithSentences(bad, badProblems);
  ok(shown[0].includes("[in the sentence: \"" + tell2 + "\"]") && shown[1].includes("[in the sentence: \"" + tell1 + "\"]"), "problemsWithSentences appends the sentence that holds each phrase", shown);
  const p = F.retryPromptFor("BASE", bad, badProblems);
  ok(/--- REVISION:/.test(p) && p.includes("[in the sentence: \"" + tell1 + "\"]") && p.endsWith(bad), "the revision prompt carries the phrase with its sentence and the same draft");
  ok(F.problemsWithSentences(bad, ["no H1 title"])[0] === "no H1 title", "a problem without a quoted phrase is passed through unchanged");
}
// ---- the prompts carry the framing-idiom line (process only, no example subject) ---------------------------------------------
{
  const rule = F.FRAMING_RULE;
  ok(/FRAMING IDIOMS/.test(rule) && /'illustrates', 'reveals', 'exposes', 'underscores' or 'foregrounds'/.test(rule) && /'the same logic'/.test(rule) && /'path forward'/.test(rule) && /'ecosystem of'/.test(rule) && /'vibe'/.test(rule) && /concrete mechanism/.test(rule), "the rule names the idioms the gate rejects and the mechanism rule", rule);
  ok(V.Q08_DIRECTIVE.includes(rule), "the writer directive carries the line");
  ok(V.FORECAST_DIRECTIVE.includes(rule), "the forecast directive carries the line");
  ok(/FRAMING_RULE \+ " ---\\n\\n--- DRAFT ---\\n"/.test(src), "the editor pass carries the line", src.match(/FRAMING_RULE[^\n]{0,60}DRAFT/g));
  ok(!/guild|patent[- ]medicine|goldsmith|lender|hospital|logistics|shipping line|rating agenc|medieval|telescope/i.test(rule), "the line names no example subject");
  ok(/FACTS \(hard, non-negotiable, and checked\)/.test(V.Q08_DIRECTIVE) && /Your own memory is NOT a source/.test(V.Q08_DIRECTIVE), "the FACTS rule is untouched");
}
// ---- generate() and runLevels() are wired to the repair ---------------------------------------------------------------------
ok(/tryFramingRepair\(piece, gateResult\.problems, "writer"\)/.test(src) && /tryFramingRepair\(retryPiece, retryGate\.problems, "retry"\)/.test(src), "generate() repairs the writer's draft and the retry draft before and after the model retry");
ok(/var readerRows = repairRows\.concat\(lv\.rows\);/.test(src) && /framing repair: " \+ repairTrail\.join/.test(src), "the stage rows are saved with the panel rows and the trail reaches the gate_failed error");
ok(/framingRepair\(ed\.text, edProblems, function \(t\) \{ return editGateProblems\(t, banned, a\.forecast\); \}\)/.test(src) && /rows\.push\(framingRepairRow\(edFr, "editor"\)\)/.test(src), "runLevels() repairs the editor's draft before the model revision");
ok(/var retryPrompt = retryPromptFor\(prompt, piece\.text, gateResult\.problems\);/.test(src), "the model retry path is still there (phrase-revise suite contract)");
// ---- FACTCHECK-DEGRADE-1: every non-writer family is tried, cheaper sibling first, before a draft fails as unavailable ------------
{
  const fam = mod.__quality.familyOf;
  ok(F.FACTCHECK_POOL.length === 8 && F.MODEL_FAMILY["@cf/openai/gpt-oss-20b"] === "openai" && new Set(F.FACTCHECK_POOL.map(fam)).size === 7, "the pool holds eight models over seven families");
  const o1 = F.factCheckOrder([fam("@cf/openai/gpt-oss-120b")]);
  ok(o1.length === 6 && !o1.some((m) => /gpt-oss/.test(m)) && o1.slice(0, 5).join() === F.FACTCHECK_POOL.slice(0, 5).join() && /nemotron/.test(o1[5]), "a gpt-oss writer: the five proven families in order, then nemotron, never openai", o1);
  const o2 = F.factCheckOrder([fam("@cf/nvidia/nemotron-3-120b-a12b")]);
  ok(o2.length === 7 && o2[5] === "@cf/openai/gpt-oss-20b" && o2[6] === "@cf/openai/gpt-oss-120b", "a nemotron writer: the cheaper gpt-oss sibling is tried before the larger one", o2);
  let calls = [];
  const envFive = { AI: { run: async (model, input) => { calls.push(model); if (/llama|qwen|gemma|glm|deepseek/.test(model)) throw new Error("timeout"); return { response: '{"unsupported":[],"verdict":"pass"}' }; } } };
  const fc = await V.factCheck(envFive, "# T\n\nSome essay text that is long enough.", "Some source text.", "@cf/zzz/writer", "s");
  ok(fc.unavailable === false && fc.ok === true && fc.judges.length === 2 && new Set(fc.judges.map((j) => j.family)).size === 2 && calls.length === 7, "the five proven families down: the two writer families still give two verdicts", { calls, judges: fc.judges.map((j) => j.model) });
  calls = [];
  const envSib = { AI: { run: async (model) => { calls.push(model); if (/llama|qwen|gemma|glm|deepseek|gpt-oss-20b/.test(model)) throw new Error("timeout"); return { response: '{"unsupported":[],"verdict":"pass"}' }; } } };
  const fc2 = await V.factCheck(envSib, "# T\n\nSome essay text.", "Some source text.", "@cf/zzz/writer", "s");
  ok(fc2.ok === true && fc2.judges.length === 2 && calls.length === 8 && fc2.judges.map((j) => j.model).join() === "@cf/nvidia/nemotron-3-120b-a12b,@cf/openai/gpt-oss-120b", "the cheaper sibling down: its larger sibling stands in for the family, two verdicts after all eight calls", { calls, judges: fc2.judges.map((j) => j.model) });
  calls = [];
  const envAll = { AI: { run: async (model) => { calls.push(model); throw new Error("timeout"); } } };
  const fcAll = await V.factCheck(envAll, "# T\n\nSome essay text.", "Some source text.", "@cf/zzz/writer", "s");
  ok(fcAll.unavailable === true && calls.length === 8 && /8 reviewers tried/.test(fcAll.reason) && /fewer than two fact-check verdicts from other model families/.test(fcAll.reason), "every family down: honestly unavailable, with every reviewer tried in the reason", { calls: calls.length, reason: fcAll.reason });
  calls = [];
  const envWriter = { AI: { run: async (model) => { calls.push(model); if (/llama|qwen|gemma|glm|deepseek/.test(model)) throw new Error("timeout"); return { response: '{"unsupported":[],"verdict":"pass"}' }; } } };
  const fc3 = await V.factCheck(envWriter, "# T\n\nSome essay text.", "Some source text.", "@cf/openai/gpt-oss-120b", "s");
  ok(fc3.unavailable === true && !calls.some((m) => /gpt-oss/.test(m)) && calls.length === 6, "the writer's own family is never a reviewer, so a gpt-oss draft with five families down is unavailable", calls);
  calls = [];
  const envOne = { AI: { run: async (model) => { calls.push(model); if (/qwen/.test(model)) throw new Error("timeout"); return { response: '{"unsupported":[],"verdict":"pass"}' }; } } };
  const fc4 = await V.factCheck(envOne, "# T\n\nSome essay text.", "Some source text.", "@cf/openai/gpt-oss-120b", "s");
  ok(fc4.ok && fc4.judges.length === 2 && calls.join() === ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/qwen/qwen3-30b-a3b-fp8", "@cf/google/gemma-4-26b-a4b-it"].join(), "one family fails: the next family is tried, two verdicts, three calls", calls);
}
ok(/^var VERSION = "0\.13\./m.test(src) || /^var VERSION = "0\.(1[4-9]|[2-9][0-9])\./m.test(src), "VERSION is at least 0.13");
ok(typeof mod.default.fetch === "function", "worker module loads");
console.log("framing-repair.test.mjs: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
