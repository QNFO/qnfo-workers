#!/usr/bin/env node
// qnfo-social/PATCH-2026-09-13-checker-idrace.mjs
// Written by qnfo-ops 2026-09-13. Idempotent. Fails closed (refuses to write on a
// mismatched anchor). Small and asserted by design: qnfo-social/worker.js is 21,753 B
// and hand-reproducing it is a worse risk than patching it.
//
//   node PATCH-2026-09-13-checker-idrace.mjs --check
//   node PATCH-2026-09-13-checker-idrace.mjs --apply
//
// ===========================================================================
// WHY THIS PATCH EXISTS
// ===========================================================================
//
// (1) CHECKER-IDRACE-1 - latent, LOW severity, real.
//     The escalation INSERT hand-assigned the primary key:
//         const mx = await env.DB.prepare("SELECT COALESCE(MAX(id),0) m FROM agent_issues").first();
//         ... VALUES (?,?,...) .bind(Number(mx.m) + 1, ...)
//     but agent_issues.id is declared
//         id INTEGER PRIMARY KEY AUTOINCREMENT
//     (verified this session: SELECT sql FROM sqlite_master WHERE name='agent_issues').
//     Read-then-write on a value the database already owns: two concurrent filers compute
//     the same id and the loser's INSERT dies on a PK conflict inside `catch (eE) {}`, so
//     the escalation vanishes silently. Dropping the explicit id lets SQLite assign it.
//
//     HONEST SCOPE: I have NOT observed this race fire. The dup-check immediately above
//     permits at most one open SOCIAL-CHECKER-FAILOPEN ticket, and the scheduled handler is
//     serial per cron, so concurrent filing is unlikely. This is a latent correctness
//     defect and a consistency fix (qnfo-backlog-exec and qnfo-fleet-advisor both insert
//     without an id), not a demonstrated failure. Do not sell it as more than that.
//
// (2) The header records the deploy state, because the LIVE build is not the fixed one.
//
// ===========================================================================
// THE LIVE DEFECT THIS DOES *NOT* FIX (already fixed in source, never deployed)
// ===========================================================================
//
// GET https://qnfo-social.q08.workers.dev/health
//   -> {"ok":true,"worker":"qnfo-social","version":"0.5.2-checker-heal","handle":"qnfo.bsky.social"}
//
// So v0.5.3-failclosed is COMMITTED BUT NOT DEPLOYED, and the fail-open is LIVE. The
// deployed v0.5.2 documents its own behaviour, verbatim, in qnfo-audit.alerts:
//
//   source='checker' level='warn'
//     "checker output unusable after retry; posting without fact-check (fail-open): "
//        2026-09-09 06:01:01, 06:01:43, 06:03:14 and 2026-09-13 06:02:05
//     "checker returned empty output; posting without fact-check (fail-open)"
//        2026-09-05 06:01:26, 06:02:19; 2026-09-06 06:00:35, 06:01:01;
//        2026-09-07 06:02:18, 06:02:57
//   15 checker warns total. Every one is a checkThread failure that returned [] and
//   therefore mapped to status='queued' via `issues.length === 0 ? 'queued' : 'draft'`.
//
// Each failure pairs with a social_threads row to the SECOND - 10 confirmed pairings:
//   warn 09-05 06:01:26 -> thread id 25 created 06:01:27 -> POSTED 2026-09-12 14:30:45
//   warn 09-05 06:02:19 -> thread id 26 created 06:02:19 -> queued
//   warn 09-06 06:00:35 -> thread id 27 created 06:00:35 -> queued
//   warn 09-06 06:01:01 -> thread id 28 created 06:01:01 -> queued
//   warn 09-07 06:02:18 -> thread id 34 created 06:02:19 -> queued
//   warn 09-07 06:02:57 -> thread id 35 created 06:02:57 -> queued
//   warn 09-09 06:01:01 -> thread id 36 created 06:01:02 -> queued
//   warn 09-09 06:01:43 -> thread id 37 created 06:01:44 -> queued
//   warn 09-09 06:03:14 -> thread id 39 created 06:03:15 -> queued
//   warn 09-13 06:02:05 -> thread id 41 created 06:02:06 -> queued
//
// CONSEQUENCE, stated plainly: thread 25 (scan-zenodo.22306739) was PUBLISHED to
// @qnfo.bsky.social after failing its faithfulness check. 15 threads sit at
// status='queued' AND notes IS NULL, which under v0.5.2 is indistinguishable from
// "checked and faithful". The posting cron takes the oldest queued row each run, so the
// remainder will publish unless v0.5.3 lands first. From v0.5.3 onward a failed check
// yields status='draft' and notes=[{"post":0,"issue":"checker unavailable - unverified,
// held as draft"}], which is exactly the distinction the deployed build lacks.
//
// The v0.5.3 source fix is already present. DEPLOY IT. Nothing in this script addresses
// the fail-open; it is a deploy problem, and this endpoint has no deploy route.
//
// ===========================================================================
// SUGGESTED REMEDIATION FOR THE ALREADY-QUEUED 15 (needs a D1 WRITE path)
// ===========================================================================
// qnfo-ops is SELECT/WITH only, so this is a proposal, not something I ran. Review first.
//   -- quarantine the ambiguous queue rather than letting it publish
//   UPDATE social_threads SET status='draft'
//    WHERE status='queued' AND notes IS NULL AND created_at < '2026-09-13 06:03:00';
//   -- then re-verify each and /approve individually.
// Deliberately not a DELETE: the rows are the only record of what was composed.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKER = path.join(HERE, 'worker.js');
const NEW_VERSION = '0.5.4-checker-idfix';

const apply = process.argv.slice(2).includes('--apply');
let src = fs.readFileSync(WORKER, 'utf8');

const count = (s, lit) => s.split(lit).length - 1;
const problems = [];
let changed = 0;

function swap(label, oldLit, newLit, expect) {
  const n = count(src, oldLit);
  if (n === 0 && count(src, newLit) > 0) { console.log('  skip  ' + label + ' (already applied)'); return; }
  if (n !== expect) { problems.push(label + ': anchor matched ' + n + 'x, expected ' + expect); return; }
  src = src.split(oldLit).join(newLit);
  changed++;
  console.log('  fix   ' + label);
}

// --- 1. VERSION -----------------------------------------------------------
swap('VERSION 0.5.3-failclosed -> ' + NEW_VERSION,
  "var VERSION = '0.5.3-failclosed';",
  "var VERSION = '" + NEW_VERSION + "';",
  1);

// --- 2. CHECKER-IDRACE-1: drop the hand-assigned primary key --------------
const OLD_INSERT = [
  '          const mx = await env.DB.prepare("SELECT COALESCE(MAX(id),0) m FROM agent_issues").first();',
  '          await env.DB.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, linked_session, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,datetime(\'now\'),datetime(\'now\'))").bind(Number(mx.m) + 1, \'SOCIAL-CHECKER-FAILOPEN: fact-checker unusable after retry\', \'checker empty or unparseable: \' + diag, \'qnfo-social\', \'fleet-self-improve\', \'medium\', \'open\', null).run();'
].join('\n');
const NEW_INSERT = [
  '          // v0.5.4 CHECKER-IDRACE-1: let SQLite assign the id. agent_issues.id is',
  '          // INTEGER PRIMARY KEY AUTOINCREMENT; the previous SELECT COALESCE(MAX(id),0)+1',
  '          // followed by an explicit id INSERT was a read-then-write race whose loser was',
  '          // swallowed by the surrounding catch, silently dropping the escalation exactly',
  '          // when the checker is failing. Matches how qnfo-backlog-exec and',
  '          // qnfo-fleet-advisor insert.',
  '          await env.DB.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, linked_session, created_at, updated_at) VALUES (?,?,?,?,?,?,?,datetime(\'now\'),datetime(\'now\'))").bind(\'SOCIAL-CHECKER-FAILOPEN: fact-checker unusable after retry\', \'checker empty or unparseable: \' + diag, \'qnfo-social\', \'fleet-self-improve\', \'medium\', \'open\', null).run();'
].join('\n');
swap('CHECKER-IDRACE-1: drop hand-assigned agent_issues.id', OLD_INSERT, NEW_INSERT, 1);

// --- 3. Record the deploy state in the header ----------------------------
const HDR_ANCHOR = "// Secrets: BSKY_HANDLE, BSKY_APP_PASS, SOCIAL_TOKEN. D1: DB (qnfo-audit.social_threads). AI: env.AI.";
const HDR_NEW = [
  HDR_ANCHOR,
  '//',
  '// v0.5.4 DEPLOY-STATE (measured 2026-09-13 by qnfo-ops, read-only):',
  '//   GET /health -> version "0.5.2-checker-heal"  =>  v0.5.3-failclosed is COMMITTED BUT NOT',
  '//   DEPLOYED, so the fail-open is LIVE. The deployed build logs its own behaviour in',
  '//   qnfo-audit.alerts (source=checker, level=warn), 15 rows:',
  '//     "checker output unusable after retry; posting without fact-check (fail-open): "',
  '//     "checker returned empty output; posting without fact-check (fail-open)"',
  '//   Each failure returned [] and so mapped to status=\'queued\'. 10 of them pair with a',
  '//   social_threads row to the second; thread 25 (scan-zenodo.22306739, warn 09-05 06:01:26,',
  '//   created 06:01:27) was POSTED 2026-09-12 14:30:45 after failing its check. 15 threads',
  '//   remain queued with notes IS NULL, which v0.5.2 cannot distinguish from "faithful"; the',
  '//   posting cron takes the oldest queued row each run, so they will publish. v0.5.3 is the',
  '//   fix. Nothing in v0.5.4 addresses it.'
].join('\n');
swap('header: record live deploy state + fail-open publication', HDR_ANCHOR, HDR_NEW, 1);

// --- outcome -------------------------------------------------------------
console.log('\n' + changed + ' change(s) pending, ' + problems.length + ' problem(s)');
if (problems.length) {
  console.error('\nREFUSING TO WRITE:');
  problems.forEach(p => console.error('  ! ' + p));
  process.exit(2);
}
if (!apply) { console.log('--check only; nothing written. Re-run with --apply.'); process.exit(0); }
if (!changed) { console.error('nothing to write.'); process.exit(1); }
fs.writeFileSync(WORKER, src, 'utf8');
console.log('WROTE ' + WORKER);
console.log('\nPost-deploy acceptance:');
console.log('  1. GET /health -> version ' + NEW_VERSION + ' (this ALSO proves v0.5.3 landed,');
console.log('     since v0.5.4 patches the v0.5.3 source).');
console.log('  2. a failed check must log "holding as draft (fail-closed, NOT queued)".');
console.log('  3. a failed check must create a social_threads row with status=draft and');
console.log('     notes=[{"post":0,"issue":"checker unavailable - unverified, held as draft"}].');
console.log('  4. no new social_threads row may reach status=queued with notes IS NULL while a');
console.log('     checker warn lands in the same second.');
