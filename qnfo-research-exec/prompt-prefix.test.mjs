// PROMPT-CACHE-PREFIX-1 (#2116) offline test.
// Proves: RESEARCH_SHARED_PREAMBLE is at least 4096 chars and names every stage task; every stage prompt constant and
// stagePrompt for different stages and different papers agree on the first 4096 chars, so the PROMPT-CACHE-1 affinity key
// (model + first 4 KB) is one per model and the preamble is a shared, cacheable prefix; the per-call label each stage
// used to end with still precedes the per-call text.
// Run: node qnfo-research-exec/prompt-prefix.test.mjs   -> prints "prompt-prefix tests passed"
import assert from "node:assert/strict";
import { RESEARCH_SHARED_PREAMBLE, stagePrompt, WRITER_PROMPT, RECONCILE_PROMPT, REVIEW_PROMPT, REVISE_PROMPT, REVISE_PATCH_PROMPT, VERIFY_EXTRACT_PROMPT, VERIFY_GEN_PROMPT } from "./worker.js";

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
console.log("prompt-prefix tests passed");
