#!/usr/bin/env node
// qnfo-ops/scripts/normalize-version-semver.mjs
//
// Added 2026-09-13 by qnfo-ops for F12 in audits/2026-09-13-fix-queue.json.
// EXECUTABLE BY THE DEPLOY RUNNER. Idempotent. Fails closed.
//
//   node qnfo-ops/scripts/normalize-version-semver.mjs --check
//   node qnfo-ops/scripts/normalize-version-semver.mjs --apply
//   node qnfo-ops/scripts/normalize-version-semver.mjs --apply qnfo-social/worker.js ...
//
// ---------------------------------------------------------------------------
// WHY
// ---------------------------------------------------------------------------
// HUB-VERSIONING-1 requires strict X.Y.Z. Three live workers serve a hyphenated
// suffix instead, measured 2026-09-13 via /health:
//
//   qnfo-social       0.5.2-checker-heal      (repo source: 0.5.3-failclosed)
//   qnfo-paper-reviser 1.0.4-deepseek-flash
//   qnfo-kaizen        0.3.2-glm53
//
// THE REGISTRY CANNOT SEE THIS. It reports the stripped forms (0.5.2 / 1.0.4 /
// 0.3.2), so a registry-based semver audit launders the violation. An earlier
// revision of docs/REMEDIATION-HANDOFF-2026-09-13.md declared F12 "already
// resolved" on exactly that basis; it was wrong. Verify with /health, never the
// registry row.
//
// ---------------------------------------------------------------------------
// THE TRANSFORMATION, AND WHY `+` RATHER THAN DELETION
// ---------------------------------------------------------------------------
//   VERSION = "0.5.2-checker-heal"  ->  VERSION = "0.5.2+checker-heal"
//
// `0.5.2-checker-heal` is *technically* valid semver as a prerelease, so this is
// a convention fix, not a syntax fix: the fleet's own precedent treats these
// suffixes as BUILD metadata, not prereleases. deployment_history #52/#53
// (2026-09-11) standardised six workers to `1.0.x+fabric.20260910` and recorded
// the rule as "semver; meaning preserved via +build tag". This script applies
// that same rule.
//
// Deleting the suffix would also satisfy "strict X.Y.Z" but would lose the
// meaning the suffix carries (which heal/checker build is live) - so it is the
// wrong fix, even though it is the smaller diff.
//
// NOTE: this script does NOT decide whether a suffix is a prerelease or build
// metadata. It converts `X.Y.Z-<anything>` to `X.Y.Z+<anything>`, matching the
// established fleet convention. If a worker ever needs a real prerelease, it must
// be excluded from this script's target list deliberately.
//
// ---------------------------------------------------------------------------
// SCOPE
// ---------------------------------------------------------------------------
// Only the VERSION declaration is touched. Behaviour is unchanged; this is a
// label fix. It therefore cannot break a worker, which is why it is safe to run
// across several targets at once.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import process from 'node:process';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const explicit = args.filter(a => !a.startsWith('--'));

const DEFAULT_TARGETS = [
  'qnfo-social/worker.js',
  'qnfo-paper-reviser/worker.js',
  'qnfo-kaizen/worker.js'
];
const targets = explicit.length ? explicit : DEFAULT_TARGETS;

// Matches: var|let|const VERSION = "X.Y.Z-suffix";
const RE = /\b(var|let|const)(\s+)VERSION(\s*)=(\s*)"(\d+\.\d+\.\d+)-([^"]+)"/g;

let changed = 0, problems = 0;

for (const f of targets) {
  if (!existsSync(f)) {
    console.error('missing file: ' + f);
    problems++;
    continue;
  }
  const src = readFileSync(f, 'utf8');
  const hits = [...src.matchAll(RE)];

  if (hits.length === 0) {
    // Distinguish "already normalised" from "declaration not found at all".
    const anyDecl = /\b(var|let|const)\s+VERSION\s*=\s*"([^"]+)"/.exec(src);
    if (anyDecl && /^\d+\.\d+\.\d+(\+[^"]+)?$/.test(anyDecl[2])) {
      console.log('  skip  ' + f + ' (VERSION already strict: ' + anyDecl[2] + ')');
    } else if (anyDecl) {
      console.error('  FAIL  ' + f + ' VERSION="' + anyDecl[2] + '" matched neither the '
        + 'X.Y.Z-suffix pattern nor strict semver - inspect manually, no write');
      problems++;
    } else {
      console.error('  FAIL  ' + f + ' no VERSION declaration found - no write');
      problems++;
    }
    continue;
  }

  if (hits.length !== 1) {
    console.error('  FAIL  ' + f + ' matched ' + hits.length + ' VERSION declarations (need 1) - no write');
    problems++;
    continue;
  }

  const h = hits[0];
  const before = h[5] + '-' + h[6];
  const after = h[5] + '+' + h[6];
  console.log('  fix   ' + f + ': ' + before + ' -> ' + after);

  if (apply) {
    const out = src.replace(RE, (m, kw, sp1, sp2, sp3, ver, suf) => kw + sp1 + 'VERSION' + sp2 + '=' + sp3 + '"' + ver + '+' + suf + '"');
    writeFileSync(f, out, 'utf8');
    changed++;
  } else {
    changed++;
  }
}

console.log('\n' + changed + ' change(s) ' + (apply ? 'written' : 'pending') + ', ' + problems + ' problem(s)');

if (problems) {
  console.error('\nREFUSING TO WRITE (at least one target failed):');
  process.exit(2);
}
if (!apply) {
  console.log('--check only; nothing written. Re-run with --apply.');
  process.exit(0);
}

console.log('\nPost-deploy acceptance — read /health, NOT the registry:');
console.log('  curl -s https://qnfo-social.q08.workers.dev/health');
console.log('  curl -s https://qnfo-paper-reviser.q08.workers.dev/health');
console.log('  curl -s https://qnfo-kaizen.q08.workers.dev/health');
console.log('  Expect X.Y.Z+<suffix> and NO hyphenated suffix.');
console.log('');
console.log('SEPARATE FINDING, do not lose it: the repo qnfo-social/worker.js header reads');
console.log('  "v0.5.3-failclosed (2026-09-13): the fact-checker ..."');
console.log('while live serves 0.5.2-checker-heal. The repo is AHEAD of production, and the');
console.log('un-deployed change concerns the fact-checker - which is open issue #676');
console.log('  "SOCIAL-CHECKER-FAILOPEN: fact-checker unusable after retry" (2026-09-13T06:02).');
console.log('Deploying qnfo-social therefore lands a fix for #676 as well as this label fix.');
console.log('Read the diff before deploying; that is a behaviour change, not a label change.');
