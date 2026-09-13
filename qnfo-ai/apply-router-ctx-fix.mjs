#!/usr/bin/env node
// apply-router-ctx-fix.mjs — one-token production fix for qnfo-ai's context overflow path
//
// Implements ROUTER-CTX-GAP-2 §3 (qnfo-ai/ROUTER-CTX-GAP-2.md), which documented this defect on
// 2026-09-11 as "CONFIRMED IN SOURCE, NOT DEPLOYED". Re-verified 2026-09-13 against the live
// bundle (qnfo-ai/deployed-current.worker.js, sha 9b536969240684bea3acc017b5877c6d05d7488c,
// VERSION 5.21.3): STILL PRESENT. The bundle sha has changed since the doc was written
// (32380028… -> 9b536969…), i.e. the router was redeployed and this fix still did not land.
//
// THE DEFECT
//   const big = MODELS["glm-5.3-flash"];
//   if (big && spec.wa !== big.wa && estInput + out <= modelCtx(big) - CTX_SAFETY_MARGIN) {
//     return "qwq-32b";        // <-- guard tests glm-5.3-flash (1,310,720 ctx)
//   }                          //     return ships qwq-32b (24,000 ctx, tools:false)
//
//   Any request whose estimated total exceeds its tier-0 target's window but fits 1.31M is routed
//   to a 24,000-token model. Per the doc, 12 of 15 tier-0 targets enter the branch and 11 are
//   already over qwq-32b's window on entry; smallest guaranteed overflow 8,257 tokens.
//
// SAFETY
//   This script edits files on disk only; it does not deploy. But note:
//   - `deployed-current.worker.js` IS the artifact qnfo-fleet-deploy reads first (candidate #1 in
//     canonical()), so committing it to main deploys on the next hourly scan.
//   - README-deploy.md step 4 requires the two files to stay in sync (`cp worker.js deployed-current.worker.js`).
//   Apply to BOTH, on a branch, review, then merge.
//
// USAGE
//   node apply-router-ctx-fix.mjs                          # dry run
//   node apply-router-ctx-fix.mjs --write                  # apply (both files, cwd-relative)
//   node apply-router-ctx-fix.mjs --file <path> [--write]
//   node apply-router-ctx-fix.mjs --science-tools --write   # also apply the §4 secondary hunk
//
// NOT EXECUTED BY qnfo-ops: this endpoint has no filesystem and no node runtime.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const SCIENCE = args.includes("--science-tools");
const fi = args.indexOf("--file");

const FILES = fi >= 0
  ? [args[fi + 1]]
  : ["qnfo-ai/worker.js", "qnfo-ai/deployed-current.worker.js"];

// --- P0: the one-token fix ------------------------------------------------------
const EDIT_MAIN = {
  id: "ROUTER-CTX-GAP-2 §3 — overflow target qwq-32b -> glm-5.3-flash",
  find: 'return "qwq-32b";',
  replace: 'return "glm-5.3-flash";',
  marker: 'return "glm-5.3-flash";',
};

// --- §4 secondary hunk (behaviour-changing; opt-in) -----------------------------
// Minimal fix only: always return the tier-1 model, which has ctx 1048576 AND tools:true.
// The correct fix threads a hasTools flag into contextAwareTarget; that call site was never read,
// so it is NOT attempted here (ROUTER-CTX-GAP-2 §4: "do not write blind").
const EDIT_SCIENCE = {
  id: "ROUTER-CTX-GAP-2 §4 — science overflow loses tools (flash-thinking is tools:false)",
  find: 'return cls.domain === "science" ? "deepseek-v4-flash-thinking" : "deepseek-v4-flash";',
  replace: 'return "deepseek-v4-flash"; // tier 1, ctx 1048576, tools:true - see ROUTER-CTX-GAP-2 §4',
  marker: 'return "deepseek-v4-flash"; // tier 1, ctx 1048576, tools:true',
};

function countOccurrences(hay, needle) {
  let n = 0, i = 0;
  for (;;) {
    const j = hay.indexOf(needle, i);
    if (j < 0) break;
    n++; i = j + needle.length;
  }
  return n;
}

let totalApplied = 0;
let hardFail = false;

for (const FILE of FILES) {
  console.log("=".repeat(72));
  if (!existsSync(FILE)) {
    console.log("MISSING " + FILE + " — skipping");
    hardFail = true;
    continue;
  }
  let src;
  try {
    src = readFileSync(FILE, "utf8");
  } catch (e) {
    console.log("FAIL: cannot read " + FILE + " — " + String(e && e.message || e));
    hardFail = true;
    continue;
  }
  console.log("target : " + FILE + "  (" + src.length + " bytes)");
  console.log("mode   : " + (WRITE ? "WRITE" : "dry run"));

  // Bundle guard: this file is hand-maintained source OR a build artifact. Both are edited here
  // because both are shipped, but flag it so nobody mistakes which is which.
  const isBundle = src.indexOf("__defProp") >= 0 || src.indexOf("__name(") >= 0;
  console.log("format : " + (isBundle ? "esbuild bundle (deployed artifact)" : "hand-written source"));

  const edits = [EDIT_MAIN];
  if (SCIENCE) edits.push(EDIT_SCIENCE);

  let out = src;
  for (const e of edits) {
    if (out.indexOf(e.marker) >= 0) {
      console.log("  SKIP    " + e.id + "  (already applied)");
      continue;
    }
    const n = countOccurrences(out, e.find);
    if (n !== 1) {
      console.log("  ABORT   " + e.id + "  (anchor found " + n + " time(s), need exactly 1)");
      hardFail = true;
      continue;
    }
    out = out.replace(e.find, e.replace);
    console.log("  APPLY   " + e.id);
    totalApplied++;
  }

  if (out !== src) {
    // VERSION bump (DEPLOY-VERIFY-VERSION-1): 5.21.3 -> 5.21.4
    if (out.indexOf('var VERSION = "5.21.3";') >= 0) {
      out = out.replace('var VERSION = "5.21.3";', 'var VERSION = "5.21.4";');
      console.log('  APPLY   VERSION 5.21.3 -> 5.21.4');
    } else if (out.indexOf('var VERSION = "5.21.4";') >= 0) {
      console.log("  SKIP    VERSION already 5.21.4");
    } else {
      console.log("  WARN    no 'var VERSION = \"5.21.3\";' anchor — bump VERSION manually");
    }
  }

  if (WRITE && out !== src) {
    try {
      writeFileSync(FILE, out, "utf8");
      console.log("  written: " + src.length + " -> " + out.length + " bytes");
    } catch (e) {
      console.log("  FAIL: cannot write " + FILE + " — " + String(e && e.message || e));
      hardFail = true;
    }
  } else if (!WRITE) {
    console.log("  (dry run — not written)");
  }
}

console.log("=".repeat(72));
console.log("edits applied: " + totalApplied);

if (hardFail) {
  console.log("RESULT: at least one anchor failed — resolve against the current files before deploying.");
  process.exit(1);
}
if (totalApplied === 0) {
  console.log("RESULT: nothing to do; both files already carry the fix.");
  process.exit(0);
}
if (!WRITE) {
  console.log("RESULT: dry run complete. Re-run with --write to modify.");
  process.exit(0);
}
console.log("RESULT: written. NEXT: commit on a BRANCH and review.");
console.log("Committing qnfo-ai/deployed-current.worker.js to main IS a production deploy");
console.log("(qnfo-fleet-deploy candidate #1). Keep worker.js and deployed-current.worker.js in sync.");
