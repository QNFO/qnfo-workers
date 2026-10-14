// Q08-PRUNE-EXTEND-1 offline suite (q08-signal-engine 0.28.1, charter pillar: reach; agent_issues 2284).
// Proves: when deleting the flagged sentences leaves a clean draft whose only gate problem is the 2800-character body floor (29 of 77
// failed runs in the 48 h to 2026-10-14 13:30 UTC, run 418 at 2701 characters), the one model revision extends THAT pruned draft
// (the flagged sentence is absent from it, the deleted claim is named as not to be restated, every sentence is to be kept) instead of
// rewriting the unpruned draft from the reviewers' list; the extension is re-verified in full and publishes; a block for any other
// reason still takes the fact revision; an extension that stays short fails with the trail.
// Run: node q08-signal-engine/prune-extend.test.mjs   -> prints "N passed, 0 failed"
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
const here = dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(join(here, "worker.js")).href);
const V = Object.assign({ publishBody: mod.__analysis.publishBody }, mod.__verify);
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); } };

// 1. shortOnly: only the body-floor problem counts
ok(V.shortOnly(["too short after pruning (2701 chars of body; floor 2800)"]), "a block by the floor alone is short-only");
ok(!V.shortOnly(["too short after pruning (2701 chars of body; floor 2800)", "stock framing tell: 'x'"]) && !V.shortOnly([]) && !V.shortOnly(["a flagged claim is in the opening paragraph"]), "any other problem, or none, is not");

// 2. the prompt
const pruned = "# The queue nobody measured\n\nThe operator watched the queue grow.\n\nworth your time: yes - names the mechanism";
const pp = V.extendRevisionPrompt("P", pruned, ["The queue held 9000 jobs by noon."], "SOURCE TEXT");
ok(/^P\n\n--- LENGTH REVISION: /.test(pp) && /it needs at least 2800 \(aim for about 3600\)/.test(pp) && /Keep every sentence of the draft word for word and in order/.test(pp), "the prompt asks to keep every sentence and reach the floor", pp.slice(0, 600));
ok(/do not restate them or their claims in any form:\n- The queue held 9000 jobs by noon\./.test(pp) && /--- SOURCE MATERIAL \(the only facts you may use\) ---\nSOURCE TEXT/.test(pp) && /--- DRAFT TO EXTEND ---\n# The queue nobody measured/.test(pp), "it names the deleted claim, carries the source and the pruned draft", pp.slice(-400));
ok(!/FACT REVISION/.test(pp), "it is not the fact revision");

// 3. end to end with a mock model: the pruned draft is extended and publishes
const tags = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "twelve"];
const para = (i) => "The operator in case " + tags[i] + " watched the queue grow while the dashboard stayed green, because the dashboard measured the database and not the disk beneath it. In case " + tags[i] + " each hour widened the gap between what was measured and what was felt, and nobody owned the space between the two numbers.";
const bodyParas = tags.map((_, i) => para(i));
const flagged = "In case four each hour widened the gap between what was measured and what was felt, and nobody owned the space between the two numbers.";
const flagged2 = "In case seven each hour widened the gap between what was measured and what was felt, and nobody owned the space between the two numbers.";
const essay = "# The queue nobody measured\n\n" + bodyParas.join("\n\n") + "\n\nworth your time: yes - names the mechanism";
const bodyLen = V.publishBody(essay).length;
const extra = ["The operator in case ten watched the same queue from the other side, because the alert fired on the database and the disk had no alert of its own. In case ten the team learned of the full disk from the customers who could not upload.", "The operator in case eleven moved the alert to the disk, because the disk was what the customers felt. In case eleven the dashboard and the customers finally agreed on what was broken."];
let extendPrompt = null, factRev = false, reviews = 0, extended = false;
const env = { AI: { run: async (m, a2) => {
  const pr = (a2.messages || []).map((x) => x.content).join("\n") + (a2.prompt || "");
  if (/--- LENGTH REVISION/.test(pr)) {
    extendPrompt = pr; extended = true;
    const draft = pr.slice(pr.indexOf("--- DRAFT TO EXTEND ---\n") + 24);
    const body = draft.replace(/^# .*\n\n/, "").replace(/\n\nworth your time:.*$/s, "");
    return { response: "# The queue nobody measured\n\n" + body + "\n\n" + extra.join("\n\n") + "\n\nworth your time: yes - names the mechanism" };
  }
  if (/FACT REVISION/.test(pr)) { factRev = true; return { response: essay }; }
  reviews++;
  return extended ? { response: '{"unsupported": [], "verdict": "pass"}' } : { response: JSON.stringify({ unsupported: ["FACT: " + flagged + " -- not in source", "FACT: " + flagged2 + " -- not in source"], verdict: "fail" }) };
} } };
const ground = essay + "\n\n" + extra.join("\n\n");
const r = await V.verifyAndRevise(env, { piece: { text: essay, model: "@cf/openai/gpt-oss-120b" }, prompt: "P", banned: [], ground, seedText: "s", forecast: false });
ok(extendPrompt && !extendPrompt.slice(extendPrompt.indexOf("--- DRAFT TO EXTEND ---")).includes(flagged), "the extension starts from the pruned draft (the flagged sentence is gone)", extendPrompt && extendPrompt.slice(-300));
ok(extendPrompt && /do not restate them[\s\S]*In case four each hour widened/.test(extendPrompt), "the deleted claim is named as not to be restated");
ok(!factRev, "the unpruned draft is not rewritten by the fact revision");
ok(bodyLen > 2800 && V.publishBody(essay.replace(" " + flagged, "").replace(" " + flagged2, "")).length < 2800, "the draft starts above the floor and the prune takes it under (run 418)", bodyLen);
ok(r.ok === true && !r.piece.text.includes(flagged) && !r.piece.text.includes(flagged2) && r.piece.text.includes("case eleven") && r.piece.text.includes("case three"), "the extension is re-verified and publishes, without the flagged sentence", { ok: r.ok, problems: r.problems });

// 4. a block for another reason still takes the fact revision
const wiring = src.slice(src.indexOf("async function verifyAndRevise"), src.indexOf("var PRUNE_ROUNDS = 5;"));
ok(/if \(shortOnly\(gp\)\) \{ shortPruned = pr\.text; cutClaims = cutClaims\.concat\(pr\.removed\); \}/.test(wiring), "only a short-only block records the pruned draft");
ok(/shortPruned \? extendRevisionPrompt\(a\.prompt, shortPruned, cutClaims, a\.ground\) : factRevisionPrompt\(a\.prompt, cur\.text, revProblems/.test(wiring), "otherwise the fact revision runs as before");
ok(/cand = rev; shortPruned = null;/.test(wiring) && /if \(revised >= 1\) return fail\(\);/.test(wiring), "one model revision per run, as before");

// 5. an extension that stays short fails with its trail
const envShort = { AI: { run: async (m, a2) => {
  const pr = (a2.messages || []).map((x) => x.content).join("\n") + (a2.prompt || "");
  if (/--- LENGTH REVISION/.test(pr)) return { response: "# The queue nobody measured\n\n" + para(0) + "\n\nworth your time: yes - names the mechanism" };
  return { response: JSON.stringify({ unsupported: ["FACT: " + flagged + " -- not in source"], verdict: "fail" }) };
} } };
const r2 = await V.verifyAndRevise(envShort, { piece: { text: essay, model: "@cf/openai/gpt-oss-120b" }, prompt: "P", banned: [], ground, seedText: "s", forecast: false });
ok(r2.ok === false && r2.problems.some((p) => /extending the pruned draft/.test(p) || /repair trail: .*extending the pruned draft/.test(p)), "a short extension fails and the trail names the extension", r2.problems);

const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 0 || ver[1] > 28 || (ver[1] === 28 && ver[2] >= 1)), "VERSION is at least 0.28.1", ver);
console.log(pass + " passed, " + fail + " failed" + " (body " + bodyLen + " chars)");
if (fail) process.exit(1);
