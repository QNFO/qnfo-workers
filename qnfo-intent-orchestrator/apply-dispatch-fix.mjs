#!/usr/bin/env node
// qnfo-intent-orchestrator/apply-dispatch-fix.mjs — added 2026-09-13 by qnfo-ops. Idempotent. Fails closed.
//
//   node apply-dispatch-fix.mjs --check     # report, change nothing
//   node apply-dispatch-fix.mjs --apply     # patch worker.js in place
//
// WHY A PATCHER: worker.js is 36,452 B, over the 32,768-char read cap, so a full-file
// rewrite would ship reconstructed, guessed code. Anchors are verbatim (sha 4f70fc49).
//
// ============================ DEFECT 1 (F10, medium) ============================
// THE PROMOTION -> DISPATCH PATH FAILS SILENTLY, SO NO CANDIDATE EVER DISPATCHES.
// triageIntent() inserts a candidate with status='promoted' and never sets agent_task_id
// (the column is absent from its INSERT list). autoDispatch() then picks the top 'promoted'
// row and calls dispatchCandidate(). That function's FIRST line is:
//
//     if (!env.DISPATCH_TOKEN) return { dispatched: false, error: 'DISPATCH_TOKEN not configured' };
//
// The return value goes only to a console.log inside the '30 6 * * *' cron handler. No
// agent_issues row, no alerts row. If DISPATCH_TOKEN is unset, the entire autonomous
// dispatch loop no-ops once a day, invisibly, forever.
//
// LIVE EVIDENCE (D1 qnfo-audit.research_candidates, 2026-09-13):
//   4 candidates exist in total. Statuses: promoted 2, promoted-queued 1, cancelled 1.
//   'dispatched': 0. 'research_completed': 0. Every row has agent_task_id = NULL.
//   The oldest promoted row dates from 2026-09-03, the newest from 2026-09-06 — across
//   ~10 daily cron firings there has never been a single successful dispatch.
//
// ============================ DEFECT 2 (medium) ============================
// THE 'promoted-queued' STATE IS INVISIBLE TO THE DISPATCHER.
// autoDispatch() queries `WHERE status='promoted'`, and dispatchCandidate()'s update guard is
// `WHERE id=? AND status='promoted'`. The status 'promoted-queued' appears nowhere in this
// worker — it is written by another component — and matches neither query. Any candidate
// that reaches it is unreachable by the dispatcher permanently.
//
// LIVE CONFIRMATION: cand-bfabe346mtmu0sje holds status='promoted-queued', agent_task_id
// NULL, processed_at 2026-09-06T20:31:42.187Z, and is invisible to both queries. It is the
// ultrametric / discrete-geometry unification question ("Can ultrametric/discrete geometry
// unify quantum theory and gravity where smooth manifolds fail?") — the highest-value item
// in the queue, stalled by a state-machine gap rather than by anything scientific.
//
// FIXES: make dispatch failures visible (alerts row), accept both promoted states, and let
// the update guard accept both.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKER = path.join(HERE, 'worker.js');
const NEW_VERSION = '1.3.6';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

let src = fs.readFileSync(WORKER, 'utf8');
const problems = [];
const applied = [];
let changed = 0;

const count = (s, lit) => s.split(lit).length - 1;
function swap(label, oldLit, newLit, expect) {
  const n = count(src, oldLit);
  if (n === 0 && count(src, newLit) > 0) { console.log('  skip  ' + label + ' (already applied)'); return; }
  if (n !== expect) { problems.push(label + ': anchor matched ' + n + 'x, expected ' + expect); return; }
  src = src.split(oldLit).join(newLit);
  applied.push(label); changed++;
  console.log('  fix   ' + label);
}

// ---------------------------------------------------------------- FIX 1: visible failure
const T1_OLD = String.raw`async function dispatchCandidate(env, c) {
  if (!env.DISPATCH_TOKEN) return { dispatched: false, error: 'DISPATCH_TOKEN not configured' };`;
const T1_NEW = String.raw`async function dispatchCandidate(env, c) {
  // v1.3.6 (F10): a missing token used to return into a console.log and nothing else, so the
  // whole dispatch loop no-opped invisibly once a day. Make it an alerts row instead.
  if (!env.DISPATCH_TOKEN) {
    try {
      await env.D1.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)")
        .bind('qnfo-intent-orchestrator', 'warning', 'dispatch blocked: DISPATCH_TOKEN not configured (candidate ' + c.id + ' stays promoted)').run();
    } catch (e) {}
    return { dispatched: false, error: 'DISPATCH_TOKEN not configured' };
  }`;
swap('FIX 1: missing DISPATCH_TOKEN becomes a visible alerts row', T1_OLD, T1_NEW, 1);

// ---------------------------------------------------------------- FIX 2: accept both states
const T2_OLD = String.raw`  const upd = await env.D1.prepare("UPDATE research_candidates SET status='dispatched', agent_task_id=?, processed_at=? WHERE id=? AND status='promoted'")`;
const T2_NEW = String.raw`  // v1.3.6 (F10): also accept 'promoted-queued' (written by another component; it matched
  // neither this guard nor autoDispatch's SELECT, making such candidates permanently unreachable).
  const upd = await env.D1.prepare("UPDATE research_candidates SET status='dispatched', agent_task_id=?, processed_at=? WHERE id=? AND status IN ('promoted','promoted-queued')")`;
swap("FIX 2: update guard accepts 'promoted-queued'", T2_OLD, T2_NEW, 1);

// ---------------------------------------------------------------- FIX 3: dispatcher sees both
const T3_OLD = String.raw`  const top = await env.D1.prepare("SELECT * FROM research_candidates WHERE status='promoted' ORDER BY score DESC LIMIT 1").first();`;
const T3_NEW = String.raw`  // v1.3.6 (F10): 'promoted-queued' was invisible here, so such candidates were never picked.
  const top = await env.D1.prepare("SELECT * FROM research_candidates WHERE status IN ('promoted','promoted-queued') ORDER BY score DESC LIMIT 1").first();`;
swap("FIX 3: autoDispatch selects both promoted states", T3_OLD, T3_NEW, 1);

// ---------------------------------------------------------------- FIX 4: report dispatch outcome
const T4_OLD = String.raw`  const j = await r.json().catch(() => ({}));
  const tid = j.task_id || null;
  if (!tid) return { dispatched: false, error: 'agent-no-task-id' };`;
const T4_NEW = String.raw`  const j = await r.json().catch(() => ({}));
  const tid = j.task_id || null;
  // v1.3.6 (F10): also surface an orchestrator that accepts the call but returns no task id.
  if (!tid) {
    try {
      await env.D1.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)")
        .bind('qnfo-intent-orchestrator', 'warning', 'dispatch returned no task_id for candidate ' + c.id + ' (agent orchestrator reachable, task not created)').run();
    } catch (e) {}
    return { dispatched: false, error: 'agent-no-task-id' };
  }`;
swap('FIX 4: agent-no-task-id becomes a visible alerts row', T4_OLD, T4_NEW, 1);

// ---------------------------------------------------------------- version
swap('VERSION 1.3.5 -> ' + NEW_VERSION, "const VERSION = '1.3.5';", "const VERSION = '" + NEW_VERSION + "';", 1);

// ---------------------------------------------------------------- outcome
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
console.log('Applied: ' + applied.join(', '));
console.log('\nPost-deploy acceptance (D1 qnfo-audit):');
console.log('  1. GET /health -> version ' + NEW_VERSION);
console.log('  2. SELECT source,message FROM alerts WHERE source=\'qnfo-intent-orchestrator\' ORDER BY id DESC LIMIT 5;');
console.log('     -> if DISPATCH_TOKEN is unset, a row now appears (previously nothing did).');
console.log('  3. POST /triage/dispatch (auth) and confirm research_candidates.agent_task_id is populated.');
console.log("  4. SELECT id,status,agent_task_id FROM research_candidates; -> cand-bfabe346mtmu0sje");
console.log("     ('promoted-queued') must now be reachable; expect status='dispatched' + a task id.");
console.log('  5. After the next 30 6 * * * cron: at least one row with status=\'dispatched\'.');
