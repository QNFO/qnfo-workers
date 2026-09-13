#!/usr/bin/env node
// qnfo-observability/apply-observability-ingest-fix.mjs
//
// Added 2026-09-13 by qnfo-ops. EXECUTABLE BY THE DEPLOY RUNNER. Idempotent.
// Fails closed: if a REQUIRED anchor does not match the expected number of times, it writes
// NOTHING and exits non-zero.
//
//   node apply-observability-ingest-fix.mjs --check
//   node apply-observability-ingest-fix.mjs --apply
//   node apply-observability-ingest-fix.mjs --apply --target /path/to/deployed-bundle.js
//
// ---------------------------------------------------------------------------
// WHY A PATCHER
// ---------------------------------------------------------------------------
// qnfo-observability/worker.js is 37,386 bytes. `github_repo_read` hard-caps at 32,768 chars
// with no offset, and `github_file_write` needs full content, so a hand-authored full-file
// rewrite would ship guessed code for the ~5KB nobody can see. Same constraint that forced
// qnfo-research-exec/apply-research-exec-fix.mjs.
//
// NOTE ON WHICH FILE TO PATCH: fleet_drift_report id 1702 (2026-09-13 14:03:55) reads
//   qnfo-observability  deployed 1.1.3  canonical 1.1.4  source_path
//   qnfo-workers/main/qnfo-observability/worker.js
// while the repo copy of that path now declares 1.1.6-single-module. The drift scanner's
// canonical therefore lags the repo. Patch the file the deploy path actually reads.
//
// ---------------------------------------------------------------------------
// FIX A — CRITICAL — trace ingest stalled since 2026-09-10T10:17:25Z
// ---------------------------------------------------------------------------
// PROOF, from the live worker's own diagnostic (cloud_ops_events,
// kind='fleet-observability-digest', meta.ingest — identical on its last three runs):
//
//   {"version":"1.1.3",
//    "ingest":{"files":0,"inserted":0,"dupes":0,"errors":0,
//              "lastKey":"workers_trace/20260910/20260910T101640Z_20260910T101725Z_a05671da.log.gz"},
//    "total_events_24h":0,"workers_seen_24h":0}
//
//   list() SUCCEEDED      -> errors: 0
//   NOTHING passed filter -> files: 0
//   yet R2 holds keys beyond the cursor (workers_trace/20260913/...T140653Z..., uploaded
//   2026-09-13T14:06:53Z).
//   Therefore the listed page never reached the cursor's position.
//
// The code lists ONE page with no pagination:
//
//   listed = await env.LOGS.list({ prefix: 'workers_trace/', limit: 1000 });
//   const files = (listed.objects || [])
//     .map(o => o.key)
//     .filter(k => k.endsWith('.log.gz') && !k.includes('/test'))
//     .filter(k => k > cursor)          // <-- cursor is PAST THE END of this page
//     .sort().slice(0, INGEST_CAP_FILES);
//
// R2 list is lexicographic ascending, so `limit: 1000` returns the FIRST 1000 keys in the
// bucket — all of which are <= the cursor. Measured object counts:
//   workers_trace/20260910/ -> 500, truncated   (i.e. >500 in one day)
//   workers_trace/20260912/ -> 500, truncated
// so the >=1000-object premise is satisfied. The stall is PERMANENT AND MONOTONIC: every new
// day of trace objects pushes the cursor further past the first page, so it can never
// self-recover.
//
// CONSEQUENCE: worker_logs (1578 rows) holds a single 5-hour window,
// 2026-09-10T06:18:30Z .. 2026-09-10T11:17:40Z. There has been no per-request wall/cpu/status
// telemetry for ~75h.
//
// FIX: start the page AT the cursor instead of at the bucket head.
//   list({ prefix: 'workers_trace/', startAfter: cursor, limit: 300 })
//
// NO CURSOR RESET IS NEEDED OR DESIRABLE: `startAfter` resumes from the pinned key and the loop
// catches up at INGEST_CAP_FILES (300) per hourly run, i.e. ~5 runs for the current backlog.
// The existing dedupe (UNIQUE event_hash + INSERT OR IGNORE) makes re-processing harmless.
//
// ---------------------------------------------------------------------------
// FIX B — the watchdog that should have caught FIX A is itself frozen
// ---------------------------------------------------------------------------
// fleet_logpush_sweep's newest row is 2026-09-10 07:51:05 (78.3h stale) yet every row asserts
// status="on". That table is written elsewhere; this patcher cannot fix it. What it CAN do is
// make the ingest's own failure loud: the digest already records `ingest.errors` and
// `ingest.files` into cloud_ops_events.meta, but nothing alarms on `files: 0` for >2h. The
// recommended follow-up (not applied here, because it needs a new route + threshold) is a
// cursor-age alarm on GET /health, which already returns the cursor.
//
// ---------------------------------------------------------------------------
// NOT COVERED HERE
// ---------------------------------------------------------------------------
// 1. The digest stopped after 2026-09-12T06:58:50Z (~35h) while the dashboard reports the cron
//    lastRun 2026-09-13T13:30:57Z. Cause undiagnosed — the live 1.1.3 `scheduled` handler is not
//    readable from the ops endpoint.
// 2. The stale FLEET list: live 1.1.3 reports workers_seen_24h: 0 and names ~26 RETIRED workers
//    as workers_silent_24h. The repo's 1.1.6 inlines a regenerated 55-name list; not live.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ti = argv.indexOf('--target');
const TARGET = ti >= 0 && argv[ti + 1] ? argv[ti + 1] : 'worker.js';

// The exact anchor as it appears in the 1.1.6 source. If the deploy target differs (e.g. the
// live 1.1.3 bundle), this REQUIRED anchor will not match and the patcher writes nothing.
const A_LIST_OLD = "await env.LOGS.list({ prefix: 'workers_trace/', limit: 1000 })";
const A_LIST_NEW = "await env.LOGS.list({ prefix: 'workers_trace/', startAfter: cursor, limit: 300 })";

// Optional: version marker. Not required — a mismatch is reported, not fatal.
const A_VER_RE = /const VERSION = '[^']*';/;

function count(hay, needle) {
  let n = 0, i = 0;
  for (;;) {
    const j = hay.indexOf(needle, i);
    if (j === -1) return n;
    n++; i = j + needle.length;
  }
}

if (!existsSync(TARGET)) {
  console.error(`FAIL: target not found: ${TARGET}`);
  process.exit(2);
}

const src = readFileSync(TARGET, 'utf8');
const already = src.includes('startAfter: cursor');
const nOld = count(src, A_LIST_OLD);
const nNew = count(src, A_LIST_NEW);

console.log(`target:  ${TARGET}  (${src.length} bytes)`);
console.log(`anchor:  ${nOld} match(es) of the unpaginated list call`);
console.log(`already: ${already ? 'YES (startAfter present)' : 'no'}`);

if (already) {
  console.log('RESULT: already applied — nothing to do.');
  process.exit(0);
}

// FAIL CLOSED: a REQUIRED anchor must match exactly once.
if (nOld !== 1) {
  console.error(
    `FAIL (closed): expected exactly 1 match of the list anchor, found ${nOld}.\n` +
    `  anchor: ${A_LIST_OLD}\n` +
    `  Nothing was written. The deploy target is not the 1.1.6 shape; inspect it and add an\n` +
    `  explicit anchor for that revision rather than guessing.`
  );
  process.exit(3);
}

const patched = src.replace(A_LIST_OLD, A_LIST_NEW);
let finalSrc = patched;
let verNote = 'version marker not found (left unchanged)';
const m = finalSrc.match(A_VER_RE);
if (m) {
  finalSrc = finalSrc.replace(A_VER_RE, "const VERSION = '1.1.7-ingest-pagination';");
  verNote = `${m[0]} -> const VERSION = '1.1.7-ingest-pagination';`;
}

// Cheap structural sanity: the replacement must not change the brace/paren balance.
function balance(s, a, b) {
  let d = 0;
  for (const ch of s) { if (ch === a) d++; else if (ch === b) d--; }
  return d;
}
const okBraces = balance(finalSrc, '{', '}') === balance(src, '{', '}');
const okParens = balance(finalSrc, '(', ')') === balance(src, '(', ')');

console.log(`version: ${verNote}`);
console.log(`balance: braces ${okBraces ? 'OK' : 'DRIFT'}, parens ${okParens ? 'OK' : 'DRIFT'}`);
console.log(`delta:   ${finalSrc.length - src.length} bytes`);

if (!okBraces || !okParens) {
  console.error('FAIL (closed): brace/paren balance changed. Nothing written.');
  process.exit(4);
}

if (!APPLY) {
  console.log('RESULT: check only — no files written. Re-run with --apply to write.');
  process.exit(0);
}

copyFileSync(TARGET, TARGET + '.bak');
writeFileSync(TARGET, finalSrc);
console.log(`RESULT: applied. backup at ${TARGET}.bak`);
console.log('');
console.log('VERIFY (after deploy) — worker_logs must start advancing again:');
console.log("  SELECT COUNT(*) n, MAX(ingested_at) newest, MAX(ts_ms) newest_ts FROM worker_logs;");
console.log('  (before: n=1578, newest 2026-09-10T11:17:40.622Z, newest_ts 1789035358174)');
console.log('');
console.log('VERIFY (after deploy) — the ingest result must stop reporting files: 0:');
console.log("  SELECT ts, substr(meta,1,220) FROM cloud_ops_events");
console.log("   WHERE kind='fleet-observability-digest' ORDER BY ts DESC LIMIT 2;");
console.log('');
console.log('ROLLBACK:');
console.log(`  cp ${TARGET}.bak ${TARGET}   # then redeploy`);
console.log('  (the fix is additive and reads only; a rollback cannot lose trace data, because');
console.log('   R2 objects are never deleted by this worker and the dedupe key is the row hash)');
