// CORRUPTION-GUARD-1 (2026-10-18): the code loop merged a corrupt SEARCH/REPLACE and nothing failed.
//
// MEASURED STATE BEFORE THIS FILE
//   PR #1693 (merged 2026-10-18T10:50:56Z) duplicated a ~128-character run inside the 2.7.0
//   NOTICE-REPLY-COLD-HUMAN-1 version comment of qnfo-email/worker.js: it reads
//   "...whose mail is a repl" followed immediately by the same sentence again. It is inert
//   (comment text only, the file still parses, every suite passed) which is exactly why it
//   merged: syntax checks and unit suites cannot see mangled prose inside a comment.
//   A second shape, CT_xo808yx0h3ieeh, replaced a 47-line module docstring with the literal
//   text "... (docstring unchanged) ...", i.e. a model emitting a placeholder instead of the
//   file. That one was caught only because it never became a PR.
//
// CONTRACT (do not weaken)
//   1. No worker source may carry a placeholder standing in for real content: "(docstring
//      unchanged)", "(rest of file unchanged)", "... (omitted) ...", "<remainder of file>".
//      Such text is a model telling you it did not write the file.
//   2. No source may carry an adjacent duplicated run: a stretch of >= 96 characters that
//      repeats starting within the next 240 characters. Prose and code do not do this; a
//      SEARCH/REPLACE that matched mid-token does. Checked on worker.js files.
//   3. The guard is deliberately narrow. A false positive blocks every code task on the
//      worker it names, so both shapes are things no human writes on purpose.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d ? " :: " + JSON.stringify(d) : "")); } };

// ---- 1. placeholder detection -------------------------------------------------
const PLACEHOLDERS = [
  /\(\s*(?:the\s+)?(?:docstring|file|rest|remainder|content|body|code)\s+(?:unchanged|omitted|elided|truncated|abbreviated|identical)\s*\)/i,
  /(?:\.\.\.|…)\s*\(\s*(?:unchanged|omitted|rest|remaining|same as before|as before)/i,
  /<(?:file|rest of file|remainder of file)\s+(?:unchanged|omitted|elided)>/i,
];

export function placeholderHit(text) {
  for (const re of PLACEHOLDERS) {
    const m = text.match(re);
    if (m) return { why: "placeholder text", found: m[0].slice(0, 80) };
  }
  return null;
}

// ---- 2. adjacent duplicated run in comment prose -----------------------------
// Returns a run of >= `len` characters that repeats within `window` characters of where it
// started. O(n) hashing of fixed-length windows, one pass.
// A window only counts when it reads as prose. Code, JSON and disabled samples repeat long
// stretches inside comments all over this repository; prose does not. The merged corruption was
// prose ("...whose mail is a reply or carries no first-contact wording").
export function proseLike(s) {
  if (/[{}="`]/.test(s)) return false;
  const letters = (s.match(/[A-Za-z ]/g) || []).length;
  return letters / s.length >= 0.65;
}

export function duplicateRun(text, len = 96, window = 240) {
  const n = text.length;
  if (n < len + 1) return null;
  const seen = new Map();
  for (let i = 0; i + len <= n; i++) {
    const key = text.slice(i, i + len);
    // A run of one repeated character (a separator, AAAA...) repeats at every offset and means
    // nothing. Only prose-shaped windows can indicate a splice, so skip low-variety windows.
    if (new Set(key).size < 10) continue;
    if (!proseLike(key)) continue;
    const prev = seen.get(key);
    if (prev === undefined) { seen.set(key, i); continue; }
    // A repeat is corruption only when it is close: a licence header repeated 40k characters
    // later is a layout choice, two copies of the same prose 100 characters apart is a splice.
    const gap = i - prev;
    if (gap > 0 && gap <= window) return { why: "adjacent duplicated run", at: i, gap, sample: key.slice(0, 70) };
    seen.set(key, i);
  }
  return null;
}

// ---- 3. self-tests on synthetic fixtures -------------------------------------
ok(placeholderHit("x = 1  # (docstring unchanged)") !== null, "placeholder: (docstring unchanged) is caught");
ok(placeholderHit("... (rest of file unchanged)") !== null, "placeholder: (rest of file unchanged) is caught");
ok(placeholderHit("/* ... (omitted) ... */") !== null, "placeholder: ... (omitted) ... is caught");
ok(placeholderHit("const a = parseDocument(); // ordinary code") === null, "placeholder: clean code passes");

const clean = "the owner voice document is read through the dashboard binding and seeded by this worker when absent";
ok(duplicateRun(clean) === null, "duplicate: ordinary prose passes");
ok(duplicateRun(clean.slice(0, 130) + clean) !== null, "duplicate: a spliced repetition is caught");
// The real shape, reproduced: sentence truncated mid-token then restarted.
const sentence = "2.7.0 NOTICE-REPLY-COLD-HUMAN-1 (2026-10-12, pillar personal; agent_issues 2444): a first-time human sender whose mail is a reply or carries no first-contact wording";
const spliced = "prefix " + sentence.slice(0, 130) + sentence + " suffix";
ok(duplicateRun(spliced) !== null, "duplicate: the PR #1693 splice shape is caught");
// Code and JSON inside a comment must not trip the prose test.
ok(duplicateRun(' = [WRITER_LEAD, "@cf/openai/gpt-oss-120b", "@cf/moonshotai/kimi-k2.6", "@cf/zai-org/glm-5"]; '.repeat(3)) === null, "duplicate: repeated code inside a comment is tolerated");
// A licence block far away must NOT trip the guard.
ok(duplicateRun("A".repeat(96) + "-".repeat(4000) + "A".repeat(96)) === null, "duplicate: homogeneous runs are not splices");

// The corruption that merged (PR #1693) was prose inside a block comment, so the scan is
// deliberately limited to comment text. Running it over code produced dozens of false
// positives (generated tables, repeated await shapes), and a guard that cries wolf blocks
// every code task on the worker it names.
export function commentBodies(src) {
  const out = [];
  const re = /\/\*[\s\S]*?\*\//g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[0]);
  return out;
}

// ---- 4. scan the repository ---------------------------------------------------
// The scan runs only when this file is executed directly, so the detectors above can be
// imported and tested against historical sources without running the repository sweep.
const isMain = process.argv[1] && import.meta.url === new URL("file://" + process.argv[1].replace(/\\/g, "/")).href;
if (!isMain) {
  // imported for reuse: skip the sweep
} else {
const root = fileURLToPath(new URL("..", import.meta.url));
const targets = [];
(function walk(dir, depth) {
  for (const n of readdirSync(dir).sort()) {
    if (n === "node_modules" || n.startsWith(".") || n === "archive") continue;
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory() && depth < 1) walk(p, depth + 1);
    else if (n === "worker.js" || n === "deployed-current.worker.js") targets.push(p);
  }
})(root, 0);

ok(targets.length > 10, "scan: worker files discovered", { n: targets.length });

for (const p of targets) {
  const rel = p.slice(root.length).replace(/^\//, "");
  let text;
  try { text = readFileSync(p, "utf8"); } catch (e) { fail++; console.log("FAIL scan unreadable " + rel); continue; }
  const ph = placeholderHit(text);
  ok(ph === null, "scan: no placeholder in " + rel, ph || undefined);
  let bad = null;
  for (const c of commentBodies(text)) { bad = duplicateRun(c); if (bad) break; }
  ok(bad === null, "scan: no adjacent duplicated run in comments of " + rel, bad || undefined);
}

// ---- 5. worker mirrors are NOT checked here ------------------------------------
// An earlier draft also asserted worker.js === deployed-current.worker.js. That is the job of the
// existing `mirror-guard` CI job, and two workers (personal-companion, qnfo-fleet-calibrator)
// already carry a deliberate divergence this guard would have failed on. One guard, one job.

console.log(`corruption-guard: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
}
