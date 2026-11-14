#!/usr/bin/env node
/**
 * secret_scan.mjs - repo-wide high-confidence credential scan (zero dependencies).
 *
 * Usage:
 *   node scripts/secret_scan.mjs --selftest     # verify the detector itself
 *   node scripts/secret_scan.mjs [root]         # scan a tree (default: cwd)
 *
 * Exit: 0 clean, 1 violations found, 2 selftest failed.
 * Additive guard only: not wired into CI, so it cannot break the build.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { execSync } from 'node:child_process';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.wrangler', '.next',
  'coverage', '.turbo', '.cache', 'vendor',
]);
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz',
  '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mov', '.wasm', '.lock', '.map',
]);
const MAX_BYTES = 2_000_000;
const IGNORE_MARK = 'secret-scan-ignore';

/**
 * High-confidence credential shapes. Every token pattern requires 20+ contiguous
 * token characters, so regex literals such as /ghp_[A-Za-z0-9]{10,}/ do NOT match
 * (after the prefix comes `[`, which is not in the token class).
 */
const PATTERNS = [
  { name: 'github_token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { name: 'openai_key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'aws_access_key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'slack_token', re: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { name: 'google_api_key', re: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: 'private_key_block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  {
    name: 'assigned_secret',
    re: /\b(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY|CLIENT_SECRET)\b["']?\s*[:=]\s*["']([A-Za-z0-9_\-+/=.]{32,})["']/g,
    valueGroup: 1,
  },
];

const PLACEHOLDER = /(example|placeholder|your[-_]?|redacted|changeme|change-me|dummy|fake|sample|xxxx|\.\.\.|<[^>]*>)/i;

/** Obvious non-secrets: example markers, one repeated char, or near-zero entropy. */
function isPlaceholder(value) {
  if (!value) return false;
  if (PLACEHOLDER.test(value)) return true;
  if (/^(.)\1+$/.test(value)) return true;
  if (new Set(value).size <= 2) return true;
  return false;
}

function redact(s) {
  return s.slice(0, 6) + '\u2026(' + s.length + ' chars)';
}

/** Scan one blob of text; returns [{ file, line, name, preview }]. */
export function scanText(text, file = '<memory>') {
  const found = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(IGNORE_MARK)) continue;
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(line)) !== null) {
        if (m[0].length === 0) { p.re.lastIndex++; continue; }
        const value = p.valueGroup ? m[p.valueGroup] : m[0];
        if (isPlaceholder(value)) continue;
        found.push({ file, line: i + 1, name: p.name, preview: redact(m[0]) });
      }
    }
  }
  return found;
}

function listFiles(root) {
  try {
    const out = execSync('git ls-files -z', { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    const files = out.toString('utf8').split('\0').filter(Boolean);
    if (files.length) return files;
  } catch { /* not a git tree, or git unavailable */ }
  const acc = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p);
      } else {
        acc.push(relative(root, p));
      }
    }
  })(root);
  return acc;
}

function scanTree(root) {
  let scanned = 0;
  const violations = [];
  for (const rel of listFiles(root)) {
    if (SKIP_EXT.has(extname(rel).toLowerCase())) continue;
    const abs = join(root, rel);
    let buf;
    try {
      const st = statSync(abs);
      if (!st.isFile() || st.size === 0 || st.size > MAX_BYTES) continue;
      buf = readFileSync(abs);
    } catch { continue; }
    if (buf.subarray(0, 8000).includes(0)) continue; // binary
    scanned++;
    violations.push(...scanText(buf.toString('utf8'), rel));
  }
  return { scanned, violations };
}

const POSITIVES = [
  ['github_token', 'const t = "ghp_' + 'a1B2'.repeat(9) + '";'],
  ['openai_key', 'const k = "sk-' + 'a1B2c3D4'.repeat(4) + '";'],
  ['aws_access_key', 'const a = "AKIA' + 'ABCD1234EFGH5678' + '";'],
  ['slack_token', 'const s = "xoxb-' + '1234567890-abcdefghij' + '";'],
  ['google_api_key', 'const g = "AIza' + 'B1c2D3e4F5g6H7i8J9k0L1m2N3o4P5q6R7s8' + '";'],
  ['private_key_block', '-----BEGIN RSA PRIVATE KEY-----'],
  ['assigned_secret', 'GITHUB_TOKEN = "' + 'Zx9'.repeat(12) + '"'],
];

const NEGATIVES = [
  // exact shapes already present in migrations/*.test.mjs
  'ok(!/(sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{10,}|Bearer\\s+[A-Za-z0-9]{16,})/.test(sql), "no secret value in the file");',
  '!/ghs_|ghp_|github_pat_/.test(sql)',
  'const re = /AKIA[0-9A-Z]{16}/;',
  'CLIENT_SECRET = "' + 'a'.repeat(40) + '"', // placeholder: one repeated char
  'API_KEY = "your-key-here"',
];

function selftest() {
  let failed = 0;
  for (const [name, sample] of POSITIVES) {
    const hits = scanText(sample, '<selftest>');
    const ok = hits.some((h) => h.name === name);
    console.log((ok ? 'PASS' : 'FAIL') + ' detect ' + name + ' -> ' + JSON.stringify(hits.map((h) => h.preview)));
    if (!ok) failed++;
  }
  for (const sample of NEGATIVES) {
    const hits = scanText(sample, '<selftest>');
    const ok = hits.length === 0;
    console.log((ok ? 'PASS' : 'FAIL') + ' ignore ' + JSON.stringify(sample.slice(0, 60)) + ' -> ' + JSON.stringify(hits.map((h) => h.name)));
    if (!ok) failed++;
  }
  const total = POSITIVES.length + NEGATIVES.length;
  console.log('selftest: ' + (total - failed) + '/' + total + ' passed');
  return failed === 0 ? 0 : 2;
}

function main(argv) {
  if (argv.includes('--selftest')) process.exit(selftest());
  const root = argv.find((a) => !a.startsWith('-')) || process.cwd();
  const { scanned, violations } = scanTree(root);
  for (const v of violations) {
    console.log(v.file + ':' + v.line + '  ' + v.name + '  ' + v.preview);
  }
  console.log('secret_scan: ' + scanned + ' file(s) scanned, ' + violations.length + ' violation(s) in ' + root);
  process.exit(violations.length ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith('secret_scan.mjs')) main(process.argv.slice(2));
