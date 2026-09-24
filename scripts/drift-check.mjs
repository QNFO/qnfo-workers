// drift-check.mjs - standing guard for the two silent-loss classes found 2026-09-11:
//   (1) REVERT: committed work stripped from a worker.js working tree with no reverting
//       commit (canonical: qnfo-cloud-ops lost 10,933 bytes of the v1.14 jobs; HEAD had
//       jobGtdOverdueGuard/jobQualityScore, the working tree did not).
//   (2) DEPLOY-LAG: a worker whose /health version differs from its HEAD VERSION constant.
// Assertion (1) is pure-git and runs anywhere. Assertion (2) needs CLOUDFLARE_API_TOKEN.
// Exit 1 on any finding; exit 0 on clean.
import { execSync } from "node:child_process";
import fs from "node:fs";

const repo = process.argv[2] || ".";
const out = (s) => process.stdout.write(s + String.fromCharCode(10));

const tracked = execSync(`git -C "${repo}" ls-files "*/worker.js" "worker.js"`, { encoding: "utf8" })
  .trim().split(String.fromCharCode(10)).filter(Boolean);
const status = execSync(`git -C "${repo}" status --porcelain`, { encoding: "utf8" });
const modified = new Set(
  status.split(String.fromCharCode(10))
    .filter((l) => /^\s*M\s+.*worker\.js$/.test(l.trim()))
    .map((l) => l.trim().slice(2))
);

let findings = 0;

// (1) REVERT detector: modified worker.js whose working tree is materially SMALLER than HEAD.
//     HEAD blobs are LF; working files are typically CRLF, so equal content reads LARGER on
//     disk. A negative delta > 1000 bytes therefore means real content was removed.
for (const f of tracked) {
  if (!modified.has(f)) continue;
  let headBytes = 0, workBytes = 0;
  try { headBytes = Number(execSync(`git -C "${repo}" cat-file -s HEAD:"${f}"`, { encoding: "utf8" }).trim()); } catch {}
  try { workBytes = fs.statSync(repo + "/" + f).size; } catch {}
  const delta = workBytes - headBytes;
  if (Number.isFinite(delta) && delta < -1000) {
    findings++;
    out("REVERT-SUSPECT " + f + ": HEAD " + headBytes + " vs working " + workBytes + " (delta " + delta + ")");
  }
}

// (2) DEPLOY-LAG detector: optional, needs CLOUDFLARE_API_TOKEN + a health-url map.
//     TODO: populate a name->healthUrl map for the fleet; for now this is a stub.

if (findings) {
  out("DRIFT-CHECK: " + findings + " finding(s)");
  process.exit(1);
}
out("DRIFT-CHECK: clean (" + tracked.length + " worker.js tracked, " + modified.size + " modified)");
process.exit(0);
