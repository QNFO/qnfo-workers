#!/usr/bin/env node
// qnfo-pipeline-ops/PATCH-2026-09-13-intake-drain.mjs
// Written by qnfo-ops 2026-09-13 during the fleet error audit. Idempotent. Fails closed
// (refuses to write on a mismatched anchor). Committed as a patch script rather than a
// wholesale rewrite of worker.js (16,933 B): hand-reproducing a production worker is a
// worse risk than patching it - same rationale as qnfo-social/PATCH-2026-09-13-checker-idrace.mjs.
//
//   node PATCH-2026-09-13-intake-drain.mjs --check
//   node PATCH-2026-09-13-intake-drain.mjs --apply
//
// ===========================================================================
// FIX 1 - escIssue PK race (IDRACE class). Latent, LOW severity, real.
// ===========================================================================
// escIssue() hand-assigned the primary key:
//     const mx = await env.QNFO_AUDIT.prepare("SELECT COALESCE(MAX(id),0) m FROM agent_issues").first();
//     ... VALUES (?,?,...) .bind(Number(mx.m) + 1, ...)
// but agent_issues.id is declared
//     id INTEGER PRIMARY KEY AUTOINCREMENT
// (verified this session: SELECT sql FROM sqlite_master WHERE name='agent_issues').
// Read-then-write on a value the database already owns: two concurrent filers compute the
// same id and the loser's INSERT dies on a PK conflict inside `catch (e) {}`, so the
// escalation vanishes silently. Dropping the explicit id lets SQLite assign it.
//
// HONEST SCOPE: not observed firing. The scheduled handler is serial per cron, so
// concurrent filing is unlikely. This is a latent correctness/consistency fix - the same
// defect class as CHECKER-IDRACE-1, already documented for qnfo-social. qnfo-backlog-exec
// and qnfo-fleet-advisor already insert without an id. Do not sell it as more than that.
//
// ===========================================================================
// FIX 2 - INTAKE-STALL. Live, HIGH. The claimed auto-remediation does not exist.
// ===========================================================================
// The file header states intakeWatchdog "auto-triggers a triage drain when the triage
// worker is reachable", and the watchdog's own alert text says "Auto-remediation: triage
// drain". The implementation does neither - verified by reading worker.js, it only does:
//     const r = await escIssue(env, title, desc, "research-intake", "high");
//     out.action = "escalated";
//     try { const resp = await fetch(TRIAGE_URL + "/health"); out.triage_health = resp.status; } catch (e) {}
// i.e. it probes /health and records the status. Nothing drains.
//
// MEASURED CONSEQUENCE (qnfo-audit, 2026-09-13 07:16Z):
//   idea_proposals status='new' = 496, all name='auto-reentry', all inserted in a 42-second
//   burst 2026-09-12T09:50:02Z .. 09:50:44Z, triaged_at IS NULL.
//   Last successful proposal triage = 2026-09-11T13:11:45Z (61 rows triaged in total).
//   Last successful intent triage    = 2026-09-10 15:40:44.
//   pipeline-ops heartbeat every 15 min reports intake_new=496 unchanged, and fires a
//   level='critical' alert each time (202 critical alerts in 48h from this worker alone).
//
// The patch performs a real drain POST and records the route + HTTP status into the alert
// body, so the next run self-documents which route is authoritative instead of silently
// doing nothing.
//
// UNCERTAINTY, stated plainly: qnfo-idea-triage's fetch handler could not be read in full
// from this endpoint (worker.js is 39,837 B; the read was truncated before the route table).
// So the patch tries an ordered candidate list and REPORTS the outcome rather than asserting
// success. If every candidate returns 401, the drain requires TRIAGE_TOKEN, which
// qnfo-pipeline-ops does not bind - that is the finding, not a silent no-op.
//
// ===========================================================================
// DEPLOY BLOCKER - NOT FIXABLE FROM qnfo-ops. READ THIS BEFORE EXPECTING EFFECT.
// ===========================================================================
// qnfo-pipeline-ops is ABSENT from the drift/deploy census:
//   - fleet_status reports 55 deployed workers and does not include qnfo-pipeline-ops;
//   - qnfo-observability/fleet.js census = 81 workers (it does include it);
//   - worker_logs observed 58 distinct script_name values.
// Evidence that this worker's committed fixes never deploy:
//   - canonical worker.js VERSION = "0.5.4-summary-dedup";
//   - live alerts still carry the PRE-v0.5.3 wording "INTAKE-STALL escalated -> agent_issues
//     dup: 496 proposals stuck new" (v0.5.3+ only emits on r.inserted and writes "ok");
//   - SELECT * FROM pipeline_state -> D1_ERROR: no such table: pipeline_state, and v0.5.4's
//     ensureSchema is what creates that table.
// Until qnfo-pipeline-ops enters the deploy census (or someone runs `wrangler deploy` in
// this directory), every fix committed here stays undeployed. This patch is STAGED, not live.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKER = path.join(HERE, 'worker.js');
const apply = process.argv.slice(2).includes('--apply');

let src = fs.readFileSync(WORKER, 'utf8');
const problems = [];
let changed = 0;
const count = (s, lit) => s.split(lit).length - 1;

function swap(label, oldLit, newLit, expect) {
  const n = count(src, oldLit);
  if (n === 0 && count(src, newLit) > 0) { console.log('  skip  ' + label + ' (already applied)'); return; }
  if (n !== expect) { problems.push(label + ': anchor matched ' + n + 'x, expected ' + expect); return; }
  src = src.split(oldLit).join(newLit);
  changed++;
  console.log('  patch ' + label);
}

// --- FIX 1: let SQLite own the primary key ---------------------------------
swap('escIssue PK race',
`    const mx = await env.QNFO_AUDIT.prepare("SELECT COALESCE(MAX(id),0) m FROM agent_issues").first();
    const nid = (mx && Number(mx.m)) + 1;
    await env.QNFO_AUDIT.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, linked_session, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))").bind(nid, String(title).slice(0, 180), String(desc).slice(0, 600), WORKER, cat, prio, "open", null).run();
    return { inserted: true, id: nid };`,
`    // PATCH-2026-09-13: let SQLite assign the id (INTEGER PRIMARY KEY AUTOINCREMENT). The
    // previous SELECT MAX(id)+1 was a read-then-write on a value the database owns, so a
    // concurrent filer's INSERT died on a PK conflict inside the catch and vanished.
    const ins = await env.QNFO_AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, linked_session, created_at, updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))").bind(String(title).slice(0, 180), String(desc).slice(0, 600), WORKER, cat, prio, "open", null).run();
    return { inserted: true, id: (ins && ins.meta && ins.meta.last_row_id) || null };`, 1);

// --- FIX 2: make the claimed triage drain real ------------------------------
swap('intakeWatchdog real drain',
`    out.action = "escalated";
    try { const resp = await fetch(TRIAGE_URL + "/health"); out.triage_health = resp.status; } catch (e) {}`,
`    out.action = "escalated";
    // PATCH-2026-09-13: the header claimed this watchdog "auto-triggers a triage drain"; it
    // only probed /health. Perform a real drain POST and RECORD the route + status so the next
    // run reveals the authoritative route instead of silently doing nothing. Candidate routes
    // are tried in order; the first 2xx wins and later candidates are not attempted.
    const DRAIN_PATHS = ["/run", "/triage/run", "/triage"];
    out.drain = [];
    for (const p of DRAIN_PATHS) {
      try {
        const resp = await fetch(TRIAGE_URL + p, {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, env.TRIAGE_TOKEN ? { Authorization: "Bearer " + env.TRIAGE_TOKEN } : {}),
          body: JSON.stringify({ commit: true, limit: 25, source: WORKER }),
        });
        let detail = "";
        try { detail = (await resp.text()).slice(0, 160); } catch (eD) {}
        out.drain.push({ path: p, status: resp.status, detail: detail });
        if (resp.ok) break;
      } catch (e) {
        out.drain.push({ path: p, status: 0, detail: String((e && e.message) || e).slice(0, 160) });
      }
    }
    try { const resp = await fetch(TRIAGE_URL + "/health"); out.triage_health = resp.status; } catch (e) {}`, 1);

// --- version bump so drift detection can see canonical-ahead ----------------
swap('VERSION bump', 'var VERSION = "0.5.4-summary-dedup";', 'var VERSION = "0.5.5-intake-drain";', 1);

if (problems.length) {
  console.error('\nREFUSING TO WRITE - anchor mismatch:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(2);
}
if (!changed) { console.log('\nnothing to do (all fixes already present).'); process.exit(0); }
if (!apply) { console.log('\n--check only; ' + changed + ' change(s) staged. Re-run with --apply to write.'); process.exit(0); }
fs.writeFileSync(WORKER, src);
console.log('\napplied ' + changed + ' change(s) to ' + WORKER);
console.log('NOTE: staging only. qnfo-pipeline-ops is not in the deploy census - see the header.');
