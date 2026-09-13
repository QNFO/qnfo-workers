#!/usr/bin/env node
/**
 * diagnose-telemetry-hours.mjs
 *
 * Defect B1 (confirmed live 2026-09-13): `telemetry_report` ignores its `hours`
 * argument and always returns `windowHours: 24`. Probes: hours=1/24/168 all -> 24.
 * Control: telemetry_analyze(hours=1) -> 1, so the bug is local to telemetry_report's
 * handler (not a shared window helper).
 *
 * Why this script exists: the handler could not be read from the qnfo-ops endpoint,
 * because every read tool caps below the file size:
 *   - github_repo_read: 32,768 chars regardless of maxChars (verified maxChars=200000)
 *   - web_fetch:       30,000 chars (verified; raw.githubusercontent.com route)
 * while qnfo-ops/worker.js is 161,339 bytes. So the handler region is unreachable
 * from the endpoint that needs fixing.
 *
 * This script runs where the full file is available and does exactly two things:
 *   1. Prints the telemetry_report handler region with line numbers.   (diagnosis)
 *   2. With --apply, performs a GUARDED exact-string replacement - but ONLY if the
 *      target string matches one of the EXPECTED patterns configured below.
 *
 * It never guesses. If no EXPECTED pattern matches, it refuses and exits non-zero
 * without writing. A wrong auto-patch on a live worker is worse than no patch.
 *
 * Usage:
 *   node qnfo-ops/scripts/diagnose-telemetry-hours.mjs [path/to/worker.js]
 *   node qnfo-ops/scripts/diagnose-telemetry-hours.mjs [path] --apply
 *
 * Exit codes:
 *   0 = diagnosis printed (dry run) or patch applied successfully
 *   2 = 'windowHours' not found (wrong file)
 *   3 = --apply requested but no EXPECTED pattern matched (nothing written)
 *   4 = --apply matched more than one occurrence (ambiguous, nothing written)
 */

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FILE = args.find((a) => !a.startsWith("--")) || "qnfo-ops/worker.js";

const src = readFileSync(FILE, "utf8");
const lines = src.split("\n");

console.log(`file:  ${FILE}`);
console.log(`bytes: ${Buffer.byteLength(src)}   lines: ${lines.length}`);
console.log(`mode:  ${APPLY ? "APPLY" : "dry run"}`);

/* ------------------------------------------------------------------ *
 * 1. locate the handler
 * ------------------------------------------------------------------ */

const hits = [];
lines.forEach((l, i) => {
  if (l.includes("windowHours")) hits.push(i);
});

if (!hits.length) {
  console.error("\nFAIL: no occurrence of 'windowHours' in this file. Wrong path?");
  process.exit(2);
}

console.log(`\n'windowHours' occurrences: ${hits.length} (lines ${hits.map((h) => h + 1).join(", ")})`);

const from = Math.max(0, Math.min(...hits) - 45);
const to = Math.min(lines.length, Math.max(...hits) + 20);

console.log(`\n--- telemetry handler region (lines ${from + 1}-${to}) ---`);
for (let i = from; i < to; i++) {
  console.log(String(i + 1).padStart(6) + " | " + lines[i]);
}
console.log("--- end region ---");

/* ------------------------------------------------------------------ *
 * 2. candidate hard-coded 24s (the likely bug)
 * ------------------------------------------------------------------ */

const candidates = [];
for (let i = from; i < to; i++) {
  const l = lines[i];
  if (/^\s*(\/\/|\*|\/\*)/.test(l)) continue;                 // comment
  if (!/(?<![\d.])24(?![\d.])/.test(l)) continue;             // not a standalone 24
  candidates.push({ line: i + 1, text: l.trim() });
}

console.log(`\ncandidate hard-coded 24s in region: ${candidates.length}`);
for (const c of candidates) console.log(`  L${c.line}: ${c.text}`);

/* ------------------------------------------------------------------ *
 * 3. guarded apply
 * ------------------------------------------------------------------ */

// Add the exact confirmed from -> to string pair here AFTER reviewing the region
// printed above. Both must be unique in the file.
const EXPECTED = [
  // { from: "const hours = 24;", to: "const hours = clampHours(Number(url.searchParams.get('hours')));" },
];

if (!APPLY) {
  console.log("\nDry run complete. Nothing written.");
  console.log("Next: review the region above, then add the confirmed from/to pair to EXPECTED[]");
  console.log("and re-run with --apply. Acceptance criteria are in");
  console.log("qnfo-ops/docs/FIX-telemetry-hours-2026-09-12.md");
  process.exit(0);
}

if (!EXPECTED.length) {
  console.error("\nREFUSED: EXPECTED[] is empty - no confirmed target pattern configured.");
  console.error("Review the handler region printed above and add the exact string pair first.");
  console.error("Nothing was written.");
  process.exit(3);
}

let out = src;
let applied = 0;

for (const { from: f, to: t } of EXPECTED) {
  const count = out.split(f).length - 1;
  if (count === 0) continue;
  if (count > 1) {
    console.error(`\nREFUSED: pattern occurs ${count} times (ambiguous), expected exactly 1:`);
    console.error(`  ${f}`);
    console.error("Nothing was written.");
    process.exit(4);
  }
  out = out.replace(f, t);
  applied++;
  console.log(`\napplied (1 occurrence): ${f}\n                    ->  ${t}`);
}

if (!applied) {
  console.error("\nREFUSED: none of the EXPECTED patterns matched. Nothing was written.");
  process.exit(3);
}

copyFileSync(FILE, FILE + ".bak");
writeFileSync(FILE, out);
console.log(`\nwrote ${FILE} (backup at ${FILE}.bak)`);
console.log("Next: deploy, then verify the acceptance criteria:");
console.log("  telemetry_report(hours=1)   -> windowHours: 1");
console.log("  telemetry_report(hours=168) -> windowHours: 168");
console.log("  telemetry_report()          -> windowHours: 24");
console.log("  top_failing_tools changes with the window");
