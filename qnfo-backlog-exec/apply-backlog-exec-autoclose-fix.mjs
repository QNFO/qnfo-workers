#!/usr/bin/env node
// qnfo-backlog-exec/apply-backlog-exec-autoclose-fix.mjs
// Added 2026-09-13 by qnfo-ops. Fail-closed. Idempotent. EXECUTABLE BY THE DEPLOY RUNNER:
//
//   .github/workflows/apply-staged-patchers.yml
//     workflow_dispatch
//       patcher = qnfo-backlog-exec/apply-backlog-exec-autoclose-fix.mjs
//       mode    = check      (default; writes nothing)
//       commit  = no
//   then re-dispatch with mode=apply, commit=yes.
//
// WHY A PATCHER, NOT A FILE REWRITE
//   qnfo-backlog-exec/worker.js is 31,806 bytes and this endpoint reads at most 32,768 CHARS of
//   JSON-ESCAPED text, so the tail of the file is unreachable. A hand-authored full-file rewrite
//   would ship guessed code for the routes it cannot see. This script does the surgery where the
//   file lives, exactly like qnfo-research-exec/apply-research-exec-fix.mjs.
//
// THE DEFECT (issues 783, 795)
//   run() decided "this is an availability ticket" from the TITLE ALONE:
//       /health|heartbeat|availability|endpoint down|is down|reachable/i  &&  /health|availability|reachable|down/i
//   so merely MENTIONING the word health qualified, and the ticket was then CLOSED when the
//   named target re-probed PASS. For a ticket whose subject is "the prober reports wrongly",
//   the probe passes BY CONSTRUCTION and a live defect is closed forever.
//
//   MEASURED LIVE 2026-09-13 (cloud_ops_events, job=qnfo-backlog-exec):
//     19 drain runs between 14:21:25Z and 14:35:57Z (about 1.4 per minute, driven by concurrent
//     ops-exec jobs - issues 760, 779) closed 5 tickets. Three were defect-class destroyed:
//       #748 closed 14:29:12Z by probing qnfo-fleet-control  (subject: the advisor probeHealth
//            function never calls a health endpoint - source-verified, sha d9d438f0 VERSION 0.3.3)
//       #755 closed 14:31:21Z and again 14:35:57Z by probing qnfo-agent-ws (subject: a MISSING
//            SECRET - an availability probe cannot observe secret presence)
//       #758 closed 14:31:22Z by probing qnfo-lifecycle (subject: scanner deployed_version
//            disagrees with live health for 10 workers - the scanner's own row says healthVer=10)
//
//   CORPUS EVIDENCE THAT THE BRANCH CANNOT BE SALVAGED BY A TITLE TWEAK: all 85 open agent_issues
//   rows carry a DEFECT category (infra 27, observability 12, deploy 11, productivity 5, bug 5,
//   ai-gateway 4, monitoring 8, config 3, security 3, ...) and NOT ONE carries an availability
//   category. A title match on the word health can therefore only ever close a defect.
//
// THE FIX (v1.3.1)
//   Require a POSITIVE unavailability assertion, and exclude monitor-defect framings. Polarity is
//   deliberately fail-closed: an ambiguous title is RECHECKED, never closed.
//   VERIFIED against all 85 open titles with run_code on 2026-09-13:
//     current predicate closes 7 of 85 (693, 755, 758, 770, 791, 792, 795) - all defect-class
//     corrected predicate closes 0 of 85
//     regression set: "qnfo-ai DOWN: /health returns 502, service unreachable",
//     "personal-api heartbeat missing for 3h", "qnfo-gateway availability: endpoint down since
//     09:00Z", "qnfo-pdf not responding after deploy, requests time out",
//     "qnfo-social offline since 06:00Z, outage" - ALL FIVE STILL CLOSE
//
// MIRROR SAFETY (issue 786)
//   The resolver tries qnfo-workers/main/<n>/deployed-current.worker.js BEFORE <n>/worker.js, so a
//   stale mirror SHADOWS the canonical and no committed fix ships. This script REFUSES to run
//   unless the mirror is byte-identical to worker.js before patching (true for qnfo-backlog-exec:
//   both sha fc0eb74548b0eb101061f26ff7eef4c65ebdf9cb, 31,806 bytes), and then writes the SAME
//   patched bytes to BOTH files. It will NOT overwrite a divergent mirror, because a mirror that
//   is legitimately ahead would make the patched worker.js a DOWNGRADE (issues 738, 803).
//
// SCOPE / RESIDUAL RISK, STATED
//   This is a TITLE HEURISTIC. It narrows the wrong-close class, it does not abolish it: a future
//   ticket that asserts unavailability in the title while its real subject is a monitoring defect
//   can still be closed. The complete fix is to stop closing ANY defect-class row on target
//   health - e.g. bind the branch on agent_issues.category instead of the title - which needs the
//   full file and is therefore left to a runner that can see all of it.
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'qnfo-backlog-exec/worker.js';
const MIRROR = 'qnfo-backlog-exec/deployed-current.worker.js';

const A_VERSION_OLD = 'const VERSION = "1.3.0";';
const A_VERSION_NEW = 'const VERSION = "1.3.1";';
const A_PRED_OLD = '    const isHealthAvailability = /health|heartbeat|availability|endpoint down|is down|reachable/i.test(title) && /health|availability|reachable|down/i.test(title);';
const A_PRED_NEW = `    // v1.3.1 (PATCH-2026-09-13-autoclose-defect-class, qnfo-ops): the health-availability branch
    // closed DEFECT tickets. Measured 2026-09-13: 19 drain runs in 14 min closed 5 tickets, of which
    // #748 (advisor probeHealth defect), #755 (missing secret) and #758 (drift conflict) were
    // destroyed - each closed by probing an UNRELATED healthy worker. The old predicate tested the
    // TITLE for /health|heartbeat|availability|endpoint down|is down|reachable/ AND
    // /health|availability|reachable|down/, so merely MENTIONING health qualified. All 85 open rows
    // carry a defect category and NONE carries an availability category, so the branch could only
    // ever close defects. v1.3.1 requires a POSITIVE unavailability assertion and excludes
    // monitor-defect framings. Verified against all 85 open titles: old closes 7, new closes 0, and
    // 5 genuine availability phrasings still close. Polarity is fail-closed on purpose - an
    // ambiguous title is RECHECKED, never closed.
    const isMonitorDefect = /(false[-_ ]?5\\d\\d|\\bfalse\\b|misreport|inaccurate|spurious|predicate|auto-close|disagree|prove[sd]?\\s+\\d{3}|never[- ]was|no outage|not an outage|missing route|unreachable at|refut|retract)/i.test(title);
    const isAvailAssertion = /(\\bdown\\b|unreachable|not reachable|not responding|no response|timed out|timeout|unavailable|outage|offline|5\\d\\d|heartbeat (missing|stopped|stale))/i.test(title);
    const isHealthAvailability = !isMonitorDefect && isAvailAssertion;`;
const A_ORPHAN_OLD = '        if (/orphan|bogus|does not exist/i.test(title)) {';
const A_ORPHAN_NEW = '        if (!isMonitorDefect && /orphan|bogus|does not exist/i.test(title)) {';

const count = (hay, needle) => hay.split(needle).length - 1;
const mode = process.argv.includes('--apply') ? 'apply' : 'check';
const out = [];
const fail = (msg, code) => { console.log('REFUSING: ' + msg); process.exit(code); };

let src;
try { src = readFileSync(SRC, 'utf8'); } catch (e) { fail('cannot read ' + SRC + ' (' + e.message + ')', 3); }
let mirror;
try { mirror = readFileSync(MIRROR, 'utf8'); } catch (e) { fail('cannot read ' + MIRROR + ' (' + e.message + ')', 3); }

out.push('mode=' + mode + '  ' + SRC + ' bytes=' + src.length + '  ' + MIRROR + ' bytes=' + mirror.length);

if (mirror !== src) {
  fail('mirror is NOT byte-identical to worker.js, so the resolver at deployed-current.worker.js would SHADOW this patch and no fix would ship (issue 786). If the mirror is legitimately ahead, patching worker.js would also be a DOWNGRADE (issues 738, 803). Resolve the mirror divergence first.', 3);
}

if (count(src, A_VERSION_OLD) === 0 && count(src, A_VERSION_NEW) === 1 && count(src, A_PRED_OLD) === 0) {
  out.push('already applied (VERSION 1.3.1 present, old predicate absent) - nothing to do');
  console.log(out.join('\n'));
  process.exit(0);
}

const seen = { version: count(src, A_VERSION_OLD), predicate: count(src, A_PRED_OLD), orphan: count(src, A_ORPHAN_OLD) };
out.push('anchors: ' + JSON.stringify(seen) + ' (each must be exactly 1)');
for (const [k, v] of Object.entries(seen)) if (v !== 1) fail('anchor "' + k + '" matched ' + v + ' times, expected exactly 1. Writes nothing.', 2);

const patched = src.split(A_VERSION_OLD).join(A_VERSION_NEW).split(A_PRED_OLD).join(A_PRED_NEW).split(A_ORPHAN_OLD).join(A_ORPHAN_NEW);

const post = {
  version_1_3_1: count(patched, A_VERSION_NEW),
  version_1_3_0: count(patched, A_VERSION_OLD),
  isMonitorDefect: count(patched, 'isMonitorDefect'),
  isAvailAssertion: count(patched, 'isAvailAssertion'),
  old_predicate: count(patched, A_PRED_OLD),
  bytes: patched.length
};
out.push('post-verify: ' + JSON.stringify(post));
if (post.version_1_3_1 !== 1 || post.version_1_3_0 !== 0 || post.old_predicate !== 0 || post.isMonitorDefect < 3 || post.isAvailAssertion < 2) {
  fail('post-verify failed on the patched text. Writes nothing.', 2);
}

if (mode === 'apply') {
  writeFileSync(SRC, patched);
  writeFileSync(MIRROR, patched);
  out.push('WROTE both files. Next: the hourly fleet scan should drift-detect and redeploy once healing is enabled. Verify with:');
  out.push("  SELECT worker, canonical_version, note, ts FROM fleet_drift_report WHERE worker='qnfo-backlog-exec' ORDER BY id DESC LIMIT 1");
  out.push('  expect canonical_version 1.3.1 and the live /health version to advance from 1.2.8');
} else {
  out.push('CHECK ONLY - nothing written. Re-dispatch with mode=apply, commit=yes to land this.');
}
console.log(out.join('\n'));
