#!/usr/bin/env node
/**
 * check-deploy-provenance.mjs
 *
 * Fails a build when a worker ships a fix that production cannot have received.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-09-13 the fleet's largest alert source (qnfo-pipeline-ops, 931 alerts
 * all-time / 72 in the 24h to 14:08Z) turned out to be a defect whose fix was
 * already written, reviewed and committed in canonical source, and simply never
 * deployed. Nothing in CI could see that, because the only artefact claiming to
 * describe production - `deployed-current.worker.js` - was satisfied by copying
 * the repo source into itself. Every drift comparison therefore compared the repo
 * against the repo and reported "clean".
 *
 * The same shape appeared in qnfo-research-exec: canonical is still
 * `0.8.1-quality-gate-fix` with `logEvent(..., status || "ok")`, its staged
 * patcher is unapplied, and 40/40 v2-drain rows are recorded `status='ok'` while
 * carrying the ReferenceError "NL is not defined". A 100% failure loop ran for ten
 * days because it was filed as a success.
 *
 * WHAT THIS CHECKS (mechanical; no network, no D1, no Cloudflare API)
 * ------------------------------------------------------------------
 * Per worker directory (a directory containing worker.js):
 *   A. STAGED-NOT-DEPLOYED  a patcher (PATCH-*.mjs / apply-*.mjs) exists AND the
 *                           deployed-current snapshot differs from canonical.
 *   B. SNAPSHOT-DUPLICATE   snapshot sha == canonical sha while a patcher exists.
 *                           A fix cannot be both applied and unapplied. PASSES
 *                           only with deployed-current.attest.json whose "sha"
 *                           matches canonical - an actual attestation.
 *   C. SNAPSHOT-MISSING     a patcher exists and no snapshot at all.
 *   D. VERSION-UNBUMPED     a patcher exists and canonical still declares the
 *                           VERSION literal that patcher was written to replace.
 *
 * Exit codes: 0 clean (or warnings only), 1 on any FAIL, 2 on usage error.
 * `--strict` promotes warnings to failures. `--json` emits machine-readable output.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const STRICT = process.argv.includes('--strict');
const AS_JSON = process.argv.includes('--json');
const MAX_DEPTH = 2;

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.github', 'dist', 'build', 'coverage',
  'docs', 'audits', 'scripts', 'skills', 'papers', 'funding',
]);

const sha12 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function firstVersion(text) {
  if (!text) return null;
  const m = text.match(/var\s+VERSION\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function findWorkerDirs(dir, depth = 0, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (fs.existsSync(path.join(p, 'worker.js'))) { out.push(p); continue; }
    if (depth < MAX_DEPTH) findWorkerDirs(p, depth + 1, out);
  }
  return out;
}

function analyse(dir) {
  const rel = path.relative(ROOT, dir) || '.';
  const canonBuf = fs.readFileSync(path.join(dir, 'worker.js'));
  const canonSha = sha12(canonBuf);
  const version = firstVersion(canonBuf.toString('utf8'));

  let files = [];
  try { files = fs.readdirSync(dir); } catch { /* unreadable */ }
  const patchers = files.filter((f) => /^(PATCH-.*|apply-.*)\.mjs$/.test(f));

  const snapName = 'deployed-current.worker.js';
  const snapPath = path.join(dir, snapName);
  const hasSnap = fs.existsSync(snapPath);
  const snapSha = hasSnap ? sha12(fs.readFileSync(snapPath)) : null;

  const attestPath = path.join(dir, 'deployed-current.attest.json');
  let attest = null;
  if (fs.existsSync(attestPath)) {
    try { attest = JSON.parse(readText(attestPath) || '{}'); }
    catch (e) { attest = { parseError: String(e && e.message) }; }
  }
  const attested = !!(attest && !attest.parseError && attest.sha === canonSha);

  let unapplied = null;
  for (const f of patchers) {
    const t = readText(path.join(dir, f)) || '';
    const m = t.match(/VERSION\s*=\s*"([^"]+)"/);
    if (m && version && m[1] === version) { unapplied = { patcher: f, version }; break; }
  }

  const findings = [];
  const add = (level, code, msg) => findings.push({ level, code, msg });

  if (patchers.length && !hasSnap) {
    add('FAIL', 'SNAPSHOT-MISSING', `staged patcher(s) ${patchers.join(', ')} but no ${snapName}`);
  }
  if (hasSnap) {
    if (attested) {
      add('PASS', 'ATTESTED', `snapshot attested against canonical ${canonSha} by ${attest.by || 'unknown'}`);
    } else if (snapSha === canonSha && patchers.length) {
      add('FAIL', 'SNAPSHOT-DUPLICATE',
        `snapshot is byte-identical to canonical (${canonSha}) while a patcher exists; ` +
        `a fix cannot be both applied and unapplied - add ${path.basename(attestPath)} naming the deployed sha`);
    } else if (snapSha === canonSha) {
      add('WARN', 'SNAPSHOT-DUPLICATE', `snapshot is byte-identical to canonical (${canonSha}); no attestation`);
    } else if (patchers.length) {
      add('WARN', 'STAGED-NOT-DEPLOYED',
        `canonical ${canonSha} ahead of snapshot ${snapSha}; staged patcher ${patchers.join(', ')} may be unshipped`);
    } else {
      add('INFO', 'SNAPSHOT-BEHIND', `canonical ${canonSha} differs from snapshot ${snapSha}`);
    }
  }
  if (unapplied) {
    add('WARN', 'VERSION-UNBUMPED',
      `${unapplied.patcher} targets VERSION "${unapplied.version}", which canonical still declares - patch not applied`);
  }

  return { worker: rel, version, canonSha, snapSha, hasSnap, attested, patchers, findings };
}

const dirs = findWorkerDirs(ROOT).sort();
const results = dirs.map(analyse);
const flat = results.flatMap((r) => r.findings.map((f) => ({ ...f, worker: r.worker })));
const fails = flat.filter((f) => f.level === 'FAIL');
const warns = flat.filter((f) => f.level === 'WARN');

if (AS_JSON) {
  console.log(JSON.stringify({ workers: results.length, fails: fails.length, warns: warns.length, results }, null, 2));
} else {
  console.log(`deploy-provenance: ${results.length} worker dirs scanned\n`);
  const order = { FAIL: 0, WARN: 1, INFO: 2, PASS: 3 };
  for (const f of flat.slice().sort((a, b) => order[a.level] - order[b.level])) {
    console.log(`  ${f.level.padEnd(4)}  ${f.worker.padEnd(34)} ${f.code.padEnd(22)} ${f.msg}`);
  }
  const clean = results.filter((r) => !r.findings.some((f) => f.level === 'FAIL' || f.level === 'WARN'));
  console.log(`\n${results.length} scanned · ${clean.length} clean · ${warns.length} warn · ${fails.length} fail`);
  if (!flat.length) console.log('  (no provenance signals found - no worker dirs with worker.js?)');
}

if (fails.length || (STRICT && warns.length)) {
  console.error('\ndeploy-provenance FAILED: a committed fix cannot be shown to be deployed.');
  process.exit(1);
}
process.exit(0);
