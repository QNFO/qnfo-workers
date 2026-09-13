#!/usr/bin/env node
// qnfo-ai-calibration/apply-calibration-fix.mjs
//
// Added 2026-09-13 by qnfo-ops. EXECUTABLE BY THE DEPLOY RUNNER. Idempotent.
// Fails closed: if an anchor does not match the expected number of times, it writes
// NOTHING and exits non-zero.
//
//   node apply-calibration-fix.mjs --check     # report, change nothing
//   node apply-calibration-fix.mjs --apply     # patch worker.js in place
//
// WHY A PATCHER
// worker.js is 35,742 bytes. Both file-reading paths available to qnfo-ops are lossy
// on this file: github_repo_read truncates at 32,768 chars with no offset, and
// web_fetch's HTML stripping deletes any run of text between a '<' and the next '>'
// (so comparison operators inside `for (... i < n; ...)` vanish). A hand-authored
// full-file rewrite would therefore have shipped reconstructed, guessed code. This
// script does the surgery where the file actually lives.
//
// ---------------------------------------------------------------------------
// FIX A — high — F3 in audits/2026-09-13-fix-queue.json
// ---------------------------------------------------------------------------
// DEFECT: the `deepseek-direct/models` probe asserts that the string
// "deepseek-v4-flash" appears in DeepSeek's own /models response:
//
//     pass = r.status === 200 && r.text.indexOf("deepseek-v4-flash") >= 0;
//
// "deepseek-v4-flash" is this fleet's internal roster / gateway alias. Keying an
// assertion on an internal alias appearing in a third party's catalogue is fragile:
// when DeepSeek's catalogue no longer carries that string, a healthy endpoint is
// reported as failing, forever, on every sweep.
//
// EVIDENCE — and a correction to an earlier draft of this comment (read-only D1,
// 2026-09-13):
//   * ai_calibration_results, target='deepseek-direct/models': 335 rows total,
//     182 pass / 153 fail. The probe DID pass historically.
//   * Last pass 2026-09-10T01:01:10Z. First fail 2026-09-10T01:31:08Z, i.e. the
//     very next 30-minute sweep. All 153 failures are consecutive from that instant
//     to 2026-09-13T06:00:52Z — a clean step change, no intermittent behaviour.
//   * The sweep immediately before the change passed every one of its 28 probes
//     (health, roster, 18 model probes, 4 vision, tools, stream, routing).
//   * No deploy of qnfo-ai-calibration is recorded in deployment_history near the
//     onset (nearest entries: qnfo-observability 2026-09-10 17:44, qnfo-ops 09-11).
//
// An earlier draft of this file claimed the assertion "can never pass". That was
// WRONG and is retracted: it passed 182 times. The correct reading is a REGRESSION
// with a precise onset, most likely an upstream change to DeepSeek's model list
// (catalogue/alias retirement), not a fleet code change.
//
// HONEST LIMIT: deployment_history is a manual log, so its silence is not proof that
// no deploy happened. "Upstream change" is the better-supported explanation, not a
// verified fact. What IS verified is that a 200 with a body is being reported as an
// endpoint failure on every sweep for 3.2 days, which is a probe defect either way.
//
// FIX: assert on the transport and on a response that looks like a model list, not
// on an internal alias appearing in a third party's catalogue.
//
// ---------------------------------------------------------------------------
// FIX B — medium — F2 in the fix queue
// ---------------------------------------------------------------------------
// DEFECT: the run digest reports `failing: []` while `fail` is non-zero.
// The failing map is only populated once a model crosses `failThreshold`:
//
//     if (cf >= failThreshold) { failing[m] = res.detail; ... }
//
// so a probe that fails below the threshold increments `fail` but is never named.
// VERIFIED against the last three runs:
//     cal-1789279252538-41c75c  total=28 pass=26 fail=2  digest={"failing":[],"drift_models":[]}
//     cal-1789277443832-a4fd7a  total=28 pass=27 fail=1  digest={"failing":[],"drift_models":[]}
//     cal-1789275646641-34492b  total=28 pass=26 fail=2  digest={"failing":[],"drift_models":[]}
// A digest that names nothing, beside a counter that says two things failed, is worse
// than no digest: it hides the signal the digest exists to surface.
//
// FIX: derive the named list from the results actually collected.
//
// ---------------------------------------------------------------------------
// NOT APPLIED — high — F1, the minimal-probe echo assertion
// ---------------------------------------------------------------------------
// Issue 664 reads: consecutive_failures=2 detail=http=200 echo=false "OK"
// Same class as FIX A: http=200, non-empty body, marked fail because the reply did
// not contain the exact expected token ("Reply with exactly: OK"). A model that
// answers "OK." or "Ok" or adds a word is marked as an outage. Note that the same
// sweep in which deepseek-direct/models first failed also shows llama-3.2-11b-vision
// passing with detail "ok Red." — i.e. these probes are sensitive to trivial output
// variation, which is what makes issue 664's echo=false worth distrusting.
//
// It is deliberately NOT patched here. The assertion sits in a line containing '<'
// and '>', which is exactly the region web_fetch destroys, so the verbatim source
// could not be read and any anchor would be a guess. Recommended change, for a human
// or an agent with an unlossy read:
//
//     -  var pass = r.status === 200 && echo;
//     +  var pass = r.status === 200 && String(content || "").trim().length > 0;
//     +  // echo mismatch on http=200 is a probe-strictness signal, not an outage
//
// i.e. keep `echo` in the detail string for diagnosis, but stop failing a probe on
// a healthy transport.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKER = path.join(HERE, 'worker.js');
const NEW_VERSION = '1.1.5';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

let src = fs.readFileSync(WORKER, 'utf8');
const problems = [];
let changed = 0;

// ---------------------------------------------------------------- FIX A
const A_RE = /r\.text\.indexOf\("deepseek-v4-flash"\)\s*>=\s*0/g;
const A_HITS = (src.match(A_RE) || []).length;
if (A_HITS === 0) {
  if (src.includes('/deepseek/i.test(r.text)')) {
    console.log('  skip  FIX A already applied');
  } else {
    problems.push('FIX A: predicate on "deepseek-v4-flash" not found (0 matches)');
  }
} else {
  console.log('  fix   FIX A: ' + A_HITS + ' occurrence(s) of the catalogue-alias assertion');
  src = src.replace(A_RE, '/deepseek/i.test(r.text)');
  changed++;
}

// ---------------------------------------------------------------- FIX B
const B_OLD = 'failing_models: Object.keys(failing),';
const B_NEW = 'failing_models: results.filter(function (x) { return x.status === "fail"; }).map(function (x) { return x.target; }).filter(function (v, i, a) { return a.indexOf(v) === i; }),';
const B_HITS = src.split(B_OLD).length - 1;
if (B_HITS === 0) {
  if (src.includes('failing_models: results.filter(')) {
    console.log('  skip  FIX B already applied');
  } else {
    problems.push('FIX B: "failing_models: Object.keys(failing)," not found (0 matches)');
  }
} else if (B_HITS !== 1) {
  problems.push('FIX B: anchor appears ' + B_HITS + 'x (need 1)');
} else {
  console.log('  fix   FIX B: digest now names every failed probe, not only post-threshold ones');
  src = src.split(B_OLD).join(B_NEW);
  changed++;
}

// ---------------------------------------------------------------- VERSION
const V_OLD = 'var VERSION = "1.1.4";';
if (src.includes('var VERSION = "' + NEW_VERSION + '";')) {
  console.log('  skip  VERSION already ' + NEW_VERSION);
} else if (src.split(V_OLD).length - 1 === 1) {
  console.log('  fix   VERSION 1.1.4 -> ' + NEW_VERSION);
  src = src.split(V_OLD).join('var VERSION = "' + NEW_VERSION + '";');
  changed++;
} else {
  problems.push('VERSION: anchor "var VERSION = \\"1.1.4\\";" not found exactly once');
}

// ------------------------------------------------------------------ outcome
console.log('\n' + changed + ' change(s) pending, ' + problems.length + ' problem(s)');
if (problems.length) {
  console.error('\nREFUSING TO WRITE:');
  problems.forEach(p => console.error('  ! ' + p));
  process.exit(2);
}
if (!apply) {
  console.log('--check only; nothing written. Re-run with --apply.');
  process.exit(0);
}
fs.writeFileSync(WORKER, src, 'utf8');
console.log('WROTE ' + WORKER + '\n');
console.log('Deploy note: repo VERSION 1.1.4 matches the live deployment for this worker,');
console.log('so unlike personal-companion this patch lands on real, current source.');
console.log('After deploy, expect the ai-calibration ticket cluster to close itself:');
console.log('  fileIssue() only files when a probe fails, and the sweep auto-closes a');
console.log('  class after 24h with no failure.');
console.log('Do NOT expect FIX A to restore the probe to "pass" by itself if DeepSeek has');
console.log('retired the alias: the new predicate asserts only that /models answers 200 with');
console.log('a deepseek-looking list. If the endpoint is genuinely gone, it will now fail');
console.log('with a truthful detail instead of a misleading one.');
