// PROMPT-CACHE-AFFINITY-1 (agent_issues 2116, PROMPT-CACHE-PREFIX-4) offline suite. Runs the worker's own paperAffinityKey,
// researchAffinityScope and aiRunOpts against the real RESEARCH_SHARED_PREAMBLE and stage prompt builders: the stages of one
// paper share one x-session-affinity key, two papers get two keys, the switch restores the old hash, and aiText passes the key.
// Run: node qnfo-research-exec/paper-affinity.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const cut = (name) => { const s = src.indexOf(name); if (s < 0) throw new Error("missing " + name); return src.slice(s, src.indexOf("\n}\n", s) + 2); };
const varDef = (name) => { const s = src.indexOf("var " + name + " = "); if (s < 0) throw new Error("missing var " + name); return src.slice(s, src.indexOf(";\n", s) + 2); };
const mathRule = varDef("MATH_RULE");
const pre = src.slice(src.indexOf("var RESEARCH_SHARED_PREAMBLE = "), src.indexOf('].join("\\n");', src.indexOf("var RESEARCH_SHARED_PREAMBLE = ")) + 13);
const build = new Function([
  mathRule, varDef("SOURCE_VOICE_RULE"), pre, varDef("RESEARCH_AFFINITY_TTL_MS"), "var _researchAffinityScope = null; var _researchAffinityAt = 0;",
  cut("function stagePrompt("), cut("function stageContextPrompt("), cut("async function researchAffinityScope("),
  cut("function paperAffinityKey("), cut("async function aiRunOpts("),
  "return { RESEARCH_SHARED_PREAMBLE, stagePrompt, stageContextPrompt, researchAffinityScope, paperAffinityKey, aiRunOpts, reset: function () { _researchAffinityScope = null; _researchAffinityAt = 0; } };"
].join("\n"));
const W = build();
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const M = "@cf/zai-org/glm-5.3-flash";
const paperA = "# Paper A\n\n" + "Alpha results on lattice spin chains. ".repeat(400);
const paperB = "# Paper B\n\n" + "Beta results on photonic crystals. ".repeat(400);
const fixes = '[{"id":"F1","fix":"cite [3]"}]';
const review = W.stageContextPrompt("REVIEW", "PAPER", paperA, "BIBLIOGRAPHY:\n[1] x");
const patch = W.stageContextPrompt("REVISE_PATCH", "PAPER", paperA, "FIXES (JSON):\n" + fixes);
const revise = W.stageContextPrompt("REVISE", "PAPER", paperA, "FIXES (JSON):\n" + fixes);
const vex = W.stageContextPrompt("VERIFY_EXTRACT", "PAPER", paperA, "");
const reviewB = W.stageContextPrompt("REVIEW", "PAPER", paperB, "BIBLIOGRAPHY:\n[1] x");
const kA = W.paperAffinityKey(M, review);
ok(typeof kA === "string" && /^pp-[0-9a-z]+$/.test(kA), "a stage prompt gets a pp- key", kA);
ok(W.paperAffinityKey(M, patch) === kA && W.paperAffinityKey(M, revise) === kA && W.paperAffinityKey(M, vex) === kA, "review, revise-patch, revise and verify of one paper share the key");
ok(W.paperAffinityKey(M, reviewB) !== kA, "two papers get two keys");
ok(W.paperAffinityKey("@cf/openai/gpt-oss-120b", review) !== kA, "two models get two keys");
const writer = W.stagePrompt("WRITER", "INPUT BLOCK:\n") + "\n\n" + "Grounding for topic X. ".repeat(300);
ok(W.paperAffinityKey(M, writer) === W.paperAffinityKey(M, writer + "") && W.paperAffinityKey(M, writer) !== kA, "the writer legs of one grounding share a key of their own");
ok(W.paperAffinityKey(M, "short prompt") === null, "a short prompt keeps the old hash (null)");
ok(W.paperAffinityKey(M, "x".repeat(20000)) === null, "a prompt without the preamble keeps the old hash (null)");
ok(W.paperAffinityKey(M, W.RESEARCH_SHARED_PREAMBLE + "tiny") === null, "the preamble alone keeps the old hash (null)");
const db = (v, boom) => { let reads = 0; return { reads: () => reads, QNFO_AUDIT: { prepare() { reads++; if (boom) throw new Error("no such table"); return { async first() { return v === undefined ? null : { value: v }; } }; } } }; };
W.reset(); let e = db(undefined);
ok(await W.researchAffinityScope(e) === "paper", "default scope is paper when ops_config has no row");
await W.researchAffinityScope(e);
ok(e.reads() === 1, "the scope is read once per isolate inside the TTL", e.reads());
W.reset(); ok(await W.researchAffinityScope(db("prefix")) === "prefix", "ops_config prefix restores the old key");
W.reset(); ok(await W.researchAffinityScope(db(" PREFIX ")) === "prefix", "the switch ignores case and spaces");
W.reset(); ok(await W.researchAffinityScope(db("bogus")) === "paper", "an unknown value keeps paper");
W.reset(); ok(await W.researchAffinityScope(db(null, true)) === "paper", "an unreadable ops_config keeps paper");
W.reset(); const o = await W.aiRunOpts(db(undefined), M, review);
ok(o && o.extraHeaders && o.extraHeaders["x-session-affinity"] === kA, "aiRunOpts sets the paper key as x-session-affinity", o);
W.reset(); ok(await W.aiRunOpts(db("prefix"), M, review) === undefined, "aiRunOpts adds nothing under prefix scope");
W.reset(); ok(await W.aiRunOpts(db(undefined), M, "short") === undefined, "aiRunOpts adds nothing for a non-stage prompt");
const ai = cut("async function aiText(env, model, prompt, maxTokens, effort)");
ok(/const _runOpts = await aiRunOpts\(env, model, prompt\);/.test(ai), "aiText computes the affinity options");
ok((ai.match(/env\.AI\.run\(model, _opts, _runOpts\)/g) || []).length === 2, "both aiText model calls pass them");
// 0.16.0 AI-STAGE-ATTRIBUTION-2: the wrapped binding is built by __aiAttrBinding (one per env or slot); the PROMPT-CACHE-1 key logic lives there.
const wrap = cut("function __aiAttrBinding(");
ok(/opts\.extraHeaders\["x-session-affinity"\]\) return opts;/.test(wrap), "the attribution wrapper keeps a key the caller set");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
