// PROMPT-CACHE-PREFIX-1 (#2116) offline test.
// Proves: RESEARCH_SHARED_PREAMBLE is at least 4096 chars and names every stage task; every stage prompt constant and
// stagePrompt for different stages and different papers agree on the first 4096 chars, so the PROMPT-CACHE-1 affinity key
// (model + first 4 KB) is one per model and the preamble is a shared, cacheable prefix; the per-call label each stage
// used to end with still precedes the per-call text.
// Run: node qnfo-research-exec/prompt-prefix.test.mjs   -> prints "prompt-prefix tests passed"
import assert from "node:assert/strict";
import { RESEARCH_SHARED_PREAMBLE, stagePrompt, stageContextPrompt, WRITER_PROMPT, RECONCILE_PROMPT, REVIEW_PROMPT, REVISE_PROMPT, REVISE_PATCH_PROMPT, VERIFY_EXTRACT_PROMPT, VERIFY_GEN_PROMPT } from "./worker.js";

assert.ok(RESEARCH_SHARED_PREAMBLE.length >= 4096, "preamble >= 4096 chars: " + RESEARCH_SHARED_PREAMBLE.length);
const names = ["WRITER", "RECONCILE", "REVIEW", "REVISE", "REVISE_PATCH", "VERIFY_EXTRACT", "VERIFY_GEN"];
for (const n of names) assert.ok(RESEARCH_SHARED_PREAMBLE.includes("### TASK " + n + "\n"), "preamble names task " + n);
assert.ok(!/(INPUT BLOCK|DRAFTS|PAPER|FIXES \(JSON\)|CLAIMS \(JSON\)):\s*$/.test(RESEARCH_SHARED_PREAMBLE), "no per-call label left at the end of the preamble");

const a = stagePrompt("WRITER", "INPUT BLOCK:\nPaper one about qubits.");
const b = stagePrompt("REVIEW", "PAPER:\nA completely different paper about networks.");
assert.equal(a.slice(0, 4096), b.slice(0, 4096), "two stages, two papers: same first 4096 chars");
assert.ok(a.includes("=== TASK: WRITER ===") && b.includes("=== TASK: REVIEW ==="), "task selector present");

const consts = { WRITER: [WRITER_PROMPT, "INPUT BLOCK:"], RECONCILE: [RECONCILE_PROMPT, "DRAFTS:"], REVIEW: [REVIEW_PROMPT, "PAPER:"], REVISE: [REVISE_PROMPT, "FIXES (JSON):"], REVISE_PATCH: [REVISE_PATCH_PROMPT, "FIXES (JSON):"], VERIFY_EXTRACT: [VERIFY_EXTRACT_PROMPT, "PAPER:"], VERIFY_GEN: [VERIFY_GEN_PROMPT, "CLAIMS (JSON):"] };
for (const [n, [p, label]] of Object.entries(consts)) {
  assert.ok(p.startsWith(RESEARCH_SHARED_PREAMBLE), n + "_PROMPT starts with the shared preamble");
  assert.ok(p.includes("=== TASK: " + n + " ===\nDo ONLY task " + n + " "), n + "_PROMPT selects its task");
  assert.ok(p.trimEnd().endsWith(label), n + "_PROMPT still ends with " + label);
  assert.equal((p + "\n\nper-call text " + n).slice(0, 4096), WRITER_PROMPT.slice(0, 4096), n + " shares the first 4096 chars");
}

// PROMPT-CACHE-PREFIX-2: the stages that read one paper share preamble + paper as a prefix, and the task selector and the
// per-call text come after the paper.
const paper = "# A paper\n\n" + "Body sentence about qubits. ".repeat(900);
const rv = stageContextPrompt("REVIEW", "PAPER", paper, "BIBLIOGRAPHY (numbered; the paper may cite only these):\n[1] x");
const rp = stageContextPrompt("REVISE_PATCH", "PAPER", paper, "FIXES (JSON):\n[{\"id\":\"h1\"}]");
const rf = stageContextPrompt("REVISE", "PAPER", paper, "FIXES (JSON):\n[]");
const ve = stageContextPrompt("VERIFY_EXTRACT", "PAPER", paper, "");
const vg = stageContextPrompt("VERIFY_GEN", "PAPER", paper.slice(0, 2e4), "CLAIMS (JSON):\n[]");
const common = (x, y) => { let i = 0; while (i < x.length && i < y.length && x[i] === y[i]) i++; return i; };
const shared = RESEARCH_SHARED_PREAMBLE.length + paper.length;
for (const [n, p] of Object.entries({ rp, rf, ve })) assert.ok(common(rv, p) >= shared, n + " shares preamble + paper with REVIEW: " + common(rv, p) + " < " + shared);
assert.ok(common(ve, vg) >= RESEARCH_SHARED_PREAMBLE.length + 2e4, "VERIFY_GEN shares preamble + 20k paper chars with VERIFY_EXTRACT");
for (const [n, p] of Object.entries({ REVIEW: rv, REVISE_PATCH: rp, REVISE: rf, VERIFY_EXTRACT: ve, VERIFY_GEN: vg })) {
  assert.equal(p.slice(0, 4096), WRITER_PROMPT.slice(0, 4096), n + " keeps the one-per-model affinity key");
  const t = p.indexOf("=== TASK: " + n + " ===\nDo ONLY task " + n + " ");
  assert.ok(t > p.indexOf("=== END PAPER ==="), n + ": task selector follows the paper");
}
assert.ok(rp.endsWith("FIXES (JSON):\n[{\"id\":\"h1\"}]") && rv.includes("=== END PAPER ===\n\n=== TASK: REVIEW"), "per-call text follows the task selector");

// PROMPT-CACHE-PREFIX-1 (0.16.0, agent_issues 2116): every stage builder, the complete-stage tasks (CONTINUE, SECTION) and the
// text-level verification (VERIFY_TEXT) included, gives two different papers the same first 4096 chars, and the preamble
// literal interpolates no row id, date, version or counter, so the static prefix is byte-identical across papers and ticks.
const p1 = "# Paper one\n\n" + "A sentence about qubits and their coherence. ".repeat(600);
const p2 = "# Paper two\n\n" + "A sentence about networks and their routing. ".repeat(700);
for (const [n, label, body] of [["CONTINUE", "PAPER SO FAR", "GROUNDING (the input block and the numbered Bibliography; cite only these):\n[1] a\n\nREMAINING REQUIRED SECTIONS, in order, after finishing the current one: Results; Discussion"], ["SECTION", "PAPER", "GROUNDING (the input block and the numbered Bibliography; cite only these):\n[1] a\n\nSECTION TO WRITE: '## 3. Methods'"], ["VERIFY_TEXT", "PAPER", "CLAIMS (JSON):\n[]"], ["REVIEW", "PAPER", "BIBLIOGRAPHY (numbered; the paper may cite only these):\n[1] a"], ["REVISE_PATCH", "PAPER", "FIXES (JSON):\n[]"], ["REVISE", "PAPER", "FIXES (JSON):\n[]"], ["VERIFY_EXTRACT", "PAPER", ""], ["VERIFY_GEN", "PAPER", "CLAIMS (JSON):\n[]"]]) {
  const x = stageContextPrompt(n, label, p1, body), y = stageContextPrompt(n, label, p2, body);
  assert.equal(x.slice(0, 4096), y.slice(0, 4096), n + ": two papers share the first 4096 chars");
  assert.equal(x.slice(0, 4096), WRITER_PROMPT.slice(0, 4096), n + ": the prefix is the writer's too");
  assert.ok(x.indexOf(p1.slice(0, 200)) > 4096, n + ": the paper starts after the static prefix");
}
assert.equal((WRITER_PROMPT + "\n\n" + "INPUT BLOCK for paper one\n" + p1).slice(0, 4096), (WRITER_PROMPT + "\n\n" + "INPUT BLOCK for paper two\n" + p2).slice(0, 4096), "the writer legs of two groundings share the first 4096 chars");
assert.equal((RECONCILE_PROMPT + "\n\n" + p1).slice(0, 4096), (RECONCILE_PROMPT + "\n\n" + p2).slice(0, 4096), "the reconcile prompts of two papers share the first 4096 chars");
assert.ok(RESEARCH_SHARED_PREAMBLE.includes("### TASK VERIFY_TEXT\n"), "preamble names task VERIFY_TEXT");
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const la = src.indexOf("var RESEARCH_SHARED_PREAMBLE = [");
const lb = src.indexOf("].join(", la);
assert.ok(la > 0 && lb > la, "the preamble is one array literal");
const lit = src.slice(la, lb);
assert.ok(!/row\.|nowIso|new Date|Date\.now|\bVERSION\b|PIPELINE_VERSION|recover_count|attempt|Math\.random|\$\{/.test(lit), "the preamble literal interpolates no row id, date, version, counter or template expression");
assert.ok(!/\bslot\b|\bctx\./.test(lit), "the preamble literal reads no per-slot or per-row context");
console.log("prompt-prefix tests passed");
