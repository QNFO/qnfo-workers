// ANSWER-BANK-1 suite. Run: node qnfo-jobsearch/answer-bank.test.mjs
// Proves: each of the four question types Rowan answered for Magic (2026-11-12) is recognised in other employers' wording and returns his own words;
// an unrelated or protected question is not matched; the bank stays in step with rwnq8/resume docs/ANSWER-BANK.json types.
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const w = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const { ANSWER_BANK, bankAnswerFor } = w.__test;
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const cases = [
  ["What's an important model capability that you think existing benchmarks fail to measure well?", "benchmark-gap"],
  ["Which capability do current evals measure poorly?", "benchmark-gap"],
  ["What's the most misleading benchmark or metric you've encountered, and how did you discover it was wrong?", "misleading-metric"],
  ["Describe a metric that turned out to be misleading.", "misleading-metric"],
  ["What are your career goals?", "career-goals"],
  ["Where do you see yourself in five years?", "career-goals"],
  ["What else would you like us to know about you?", "anything-else"],
  ["Is there anything else you want to share?", "anything-else"],
];
for (const [q, t] of cases) { const b = bankAnswerFor(q); ok(b && b.type === t, `"${q}" -> ${t} (got ${b && b.type})`); }
for (const q of ["What is your expected salary?", "Are you authorized to work in the US?", "Describe your experience with Kubernetes."]) ok(!bankAnswerFor(q), `"${q}" is not matched`);
ok(ANSWER_BANK.length === 4, "four banked answers");
for (const b of ANSWER_BANK) { ok(b.answer.length > 120 && !/\bI will\b/.test(b.answer), b.type + " holds a full answer"); ok(!/software engineer|developer|programmer/i.test(b.answer), b.type + " never calls Rowan an engineer"); }
console.log(`answer-bank: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
