



// qnfo-observability v1.2.2 — v1.2.1 + ingest fixes: (a) restore LOGS R2 binding (was missing after a prior deploy, freezing trace ingest), (b) startAfter cursor in R2 list (once backlog >1000 keys the filter-only list() returned 0 files and the cursor froze).
// qnfo-observability v1.2.0 — merged: audit-hub + qnfo-events
// PURPOSE: makes the QNFO fleet observable to itself.
//   (1) INGEST  — scheduled trace ingest: Cloudflare Logpush workers_trace_events (R2 qnfo-audit/workers_trace/*.log.gz)
//                 parsed into structured D1 table worker_logs. Covers ALL workers with zero per-worker code changes.
//   (2) LOG API — POST /log direct structured events (optional client snippet), GET /workers/logs query.
//   (3) SUMMARY — GET /fleet/summary joins worker_logs + fleet_probe_log + worker_invocations into one view.
//   (4) DIGEST  — hourly digest writes cloud_ops_events (kind=fleet-observability-digest) + alerts on error-ratio anomalies.
//   (5) JOBS    — GET /jobs + GET /jobs/<id>: keyless read-only view of the qnfo-ops async-job ledger
//                 (qnfo-audit.ops_jobs). STATUS METADATA ONLY — never the response body (JOBS-STATUS-PUBLIC-1).
// CANONICAL SOURCE: QNFO/qnfo-workers/qnfo-observability/worker.js
// DEPLOY: wrangler deploy (from this dir); bindings AUDIT (qnfo-audit D1) + LOGS (R2 qnfo-audit); cron 17 * * * *.
//
// v1.1.6-single-module (2026-09-13, ops-endpoint session). STRUCTURAL DEPLOY BLOCKER FIXED.
//   v1.1.4 and earlier did `import { FLEET } from './fleet.js'`, making this a MULTI-MODULE worker.
//   The control plane deploys from a single R2 key (r2:qnfo-canonical/qnfo-observability.js), and one
//   key cannot carry two modules — so every deploy failed with:
//     HTTP 400 code 10021 "No such module \"fleet.js\". imported from \"worker.js\""
//   (observed: fleet_deploys id 76, 2026-09-13T14:04:01Z, ok:0.)
//   This was NOT transient and could not be fixed by re-running the deploy: the worker's module
//   topology was incompatible with the deploy transport. FLEET is now inlined below and the import
//   is removed. fleet.js is retained in the repo as the human-readable registry snapshot, but it is
//   no longer a runtime dependency. Any worker that imports a sibling module cannot deploy through a
//   single-key canonical and must be inlined the same way.
//
// v1.1.5-false-clean-fix (2026-09-13). The integration monitor could report `healthy, n=0` for a chain
//   whose pending predicate matched NO rows because the status enum in the medium had changed.
//   Verified against live D1 — five chains were false-clean:
//     alerts    predicate `digested = 0`      -> 0 rows; actual: 'auto' 914, 1 141, NULL 45
//     outreach  predicate `status='pending'`  -> 0 rows; actual: 'needs-contact' 20, sent 3, skipped 18
//     revisions predicate `status='queued'`   -> 0 rows; actual: 'needs-substantive-revision' 38, quarantined 23
//     intents   predicate `status='pending'`  -> 0 rows; actual: 'triaged' 34, deduped 10, done 106
//     email     predicate `status='received'` -> 0 rows; actual: processed 226, archived 110, spam 45
//   A monitor that cannot see backlog is worse than no monitor, because it reports health.
//   Two changes: (a) corrected the two predicates whose target enum is unambiguous from live data
//   (alerts -> NULL/''/0; outreach -> 'needs-contact'); (b) added `total` to every chain — when the
//   pending predicate matches 0 rows while the medium holds >= 20 rows the chain now reports
//   `empty-match` and raises an `enum-check` opportunity instead of asserting `healthy`. Chains where
//   empty genuinely IS success (ideas, errata, version-drain, issues, alerts) set expectEmpty.
//   empty-match is excluded from chainScore: it is an UNKNOWN, not a pass. Counting it as healthy is
//   what let five stale predicates report green for days.

// FLEET registry snapshot, INLINED (was ./fleet.js).
// REGENERATED 2026-09-13 from qnfo-audit.service_registry (55 rows), cross-checked against
// qnfo-fleet-dashboard's own Cloudflare API read:
//   fleet_dashboard_state.fleet.workers      = 55
//   fleet_dashboard_state.integration.ghost  = []
//   fleet_dashboard_state.integration.unregistered = []
// PRIOR VERSION: captured 2026-09-10 with 81 entries; the fleet then underwent a ghost-retirement
// reconciliation on 2026-09-12 ("dropped 25 ghost scheduled entries, 39 ghost probes, 2 fully-ghost
// chains"). The stale 81-name list made digest() report ~26 workers as silent that no longer existed.
// MAINTENANCE: regenerate from service_registry. Do not hand-append. A worker merged into a hub is
// retired even if its code still runs inside the hub under its own WORKER constant (cf.
// qnfo-fleet-control bundling qnfo-fleet-advisor + qnfo-fleet-calibrator).
const FLEET = [
  "ai-health-prober",
  "audit-hub",
  "calendar-api",
  "companion-hub",
  "errata-hub",
  "fleet-exec",
  "idea-hub",
  "jnl-pipeline",
  "obsidian-writer",
  "osf-integrity-check",
  "personal-api",
  "personal-companion",
  "qnfo-agent-orchestrator",
  "qnfo-agent-ws",
  "qnfo-ai",
  "qnfo-ai-calibration",
  "qnfo-ai-search",
  "qnfo-archive",
  "qnfo-autopilot",
  "qnfo-backlog-exec",
  "qnfo-chat-canary",
  "qnfo-cloud-ops",
  "qnfo-ddocs-indexer",
  "qnfo-email",
  "qnfo-email-orchestrator",
  "qnfo-events",
  "qnfo-fleet-control",
  "qnfo-fleet-dashboard",
  "qnfo-gateway",
  "qnfo-impact",
  "qnfo-infra",
  "qnfo-intent-orchestrator",
  "qnfo-ipatent",
  "qnfo-kaizen",
  "qnfo-lifecycle",
  "qnfo-memory-mcp",
  "qnfo-observability",
  "qnfo-ops",
  "qnfo-outreach",
  "qnfo-paper-explainer",
  "qnfo-paper-indexer",
  "qnfo-paper-reviser",
  "qnfo-pdf",
  "qnfo-proof",
  "qnfo-qwav",
  "qnfo-research-exec",
  "qnfo-research-supervisor",
  "qnfo-signal-loop",
  "qnfo-skill-sync",
  "qnfo-social",
  "qnfo-subscribers",
  "qnfo-tools-mcp",
  "qnfo-twin-maintain",
  "radar-hub",
  "research-daily-brief"
];

const VERSION = '1.2.5';
const NAME = 'qnfo-observability';
const KNOWN = new Set(FLEET);
const INGEST_CAP_FILES = 300;   // max R2 files processed per run (CPU bound)
const RETENTION_DAYS = 30;      // worker_logs retention window
const EMPTY_MATCH_MIN_TOTAL = 20; // rows in the medium before an empty match is suspicious
const UA = 'qnfo-observability/' + VERSION;

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' } }); }
function nowIso() { return new Date().toISOString(); }

// PRECONDITION: str is a raw logpush JSON line. POSTCONDITION: stable base36 hash used as dedupe key.
function fnv1a(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }

// PRECONDITION: env.AUDIT is qnfo-audit D1. POSTCONDITION: worker_logs + trace_ingest_state + unique hash index exist.
async function ensureSchema(env) {
  await env.AUDIT.prepare(`CREATE TABLE IF NOT EXISTS worker_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_hash TEXT UNIQUE NOT NULL,
    ts_ms INTEGER NOT NULL,
    ingested_at TEXT NOT NULL,
    script_name TEXT NOT NULL,
    event_type TEXT,
    outcome TEXT,
    url TEXT,
    method TEXT,
    status INTEGER,
    cpu_ms REAL,
    wall_ms REAL,
    logs_json TEXT,
    exceptions_json TEXT
  )`).run();
  await env.AUDIT.prepare('CREATE INDEX IF NOT EXISTS idx_worker_logs_script_ts ON worker_logs(script_name, ts_ms)').run();
  await env.AUDIT.prepare('CREATE INDEX IF NOT EXISTS idx_worker_logs_ts ON worker_logs(ts_ms)').run();
  await env.AUDIT.prepare('CREATE TABLE IF NOT EXISTS trace_ingest_state (k TEXT PRIMARY KEY, v TEXT)').run();
  await env.AUDIT.prepare('CREATE TABLE IF NOT EXISTS integration_state (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, json TEXT)').run();
}

// PRECONDITION: schema ensured. POSTCONDITION: cursor key persisted.
async function getCursor(env) {
  const r = await env.AUDIT.prepare('SELECT v FROM trace_ingest_state WHERE k = ?').bind('last_key').first();
  return r ? r.v : '';
}

async function setCursor(env, key) {
  await env.AUDIT.prepare('INSERT INTO trace_ingest_state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('last_key', key).run();
}

// PRECONDITION: gz Uint8Array from R2. POSTCONDITION: decompressed UTF-8 text (DecompressionStream is Workers-runtime native).
async function gunzip(buf) {
  const ds = new DecompressionStream('gzip');
  const stream = new Response(new Blob([buf])).body.pipeThrough(ds);
  return await new Response(stream).text();
}

// PRECONDITION: line = one logpush record JSON. POSTCONDITION: normalized row params or null on parse failure.
function parseLine(line, ingestedAt) {
  if (!line || !line.trim()) return null;
  let r; try { r = JSON.parse(line); } catch (e) { return null; }
  const ev = r.Event || {};
  const req = ev.Request || {};
  const resp = ev.Response || {};
  const hash = fnv1a(line);
  return {
    hash,
    ts: Number(r.EventTimestampMs) || 0,
    ingestedAt,
    script: String(r.ScriptName || '').slice(0, 120),
    type: String(r.EventType || '').slice(0, 60),
    outcome: String(r.Outcome || '').slice(0, 60),
    url: String(req.URL || '').slice(0, 400),
    method: String(req.Method || '').slice(0, 12),
    status: resp.Status == null ? null : Number(resp.Status),
    cpu: r.CPUTimeMs == null ? null : Number(r.CPUTimeMs),
    wall: r.WallTimeMs == null ? null : Number(r.WallTimeMs),
    logs: (r.Logs && r.Logs.length) ? JSON.stringify(r.Logs).slice(0, 2000) : null,
    exc: (r.Exceptions && r.Exceptions.length) ? JSON.stringify(r.Exceptions).slice(0, 2000) : null,
  };
}

// PRECONDITION: R2 binding LOGS -> bucket qnfo-audit. POSTCONDITION: returns {files, inserted, dupes, errors, lastKey}.
// INVARIANT: cursor advances only past fully-processed files; dedupe via UNIQUE event_hash + INSERT OR IGNORE.
async function ingestTrace(env) {
  await ensureSchema(env);
  const cursor0 = await getCursor(env);
  // v1.0.1: first run starts at the 72h-ago boundary so the backlog drains fast (older raw gz stay in R2)
  const cutoff = 'workers_trace/' + new Date(Date.now() - 72 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
  const cursor = cursor0 || cutoff;
  let listed;
  try { listed = await env.LOGS.list({ prefix: 'workers_trace/', limit: 1000, startAfter: cursor }); } catch (e) { return { files: 0, inserted: 0, dupes: 0, errors: 1, lastKey: cursor, note: 'list failed: ' + e.message }; }
  const files = (listed.objects || [])
    .map(o => o.key)
    .filter(k => k.endsWith('.log.gz') && !k.includes('/test'))
    .filter(k => k > cursor)
    .sort()
    .slice(0, INGEST_CAP_FILES);
  let inserted = 0, dupes = 0, errors = 0, filesDone = 0, lastKey = cursor;
  const ingestedAt = nowIso();
  for (const key of files) {
    try {
      const obj = await env.LOGS.get(key);
      if (!obj) { continue; }
      const buf = new Uint8Array(await obj.arrayBuffer());
      const text = await gunzip(buf);
      for (const line of text.split('\n')) {
        const row = parseLine(line, ingestedAt);
        if (!row) continue;
        const res = await env.AUDIT.prepare('INSERT OR IGNORE INTO worker_logs (event_hash, ts_ms, ingested_at, script_name, event_type, outcome, url, method, status, cpu_ms, wall_ms, logs_json, exceptions_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(row.hash, row.ts, row.ingestedAt, row.script, row.type, row.outcome, row.url, row.method, row.status, row.cpu, row.wall, row.logs, row.exc).run();
        if (res.meta && res.meta.changes) inserted++; else dupes++;
      }
      lastKey = key;
      filesDone++;
      // v1.0.1: persist cursor every 25 files so interrupted runs retain progress
      if (filesDone % 25 === 0 && lastKey !== cursor) await setCursor(env, lastKey);
    } catch (e) {
      errors++;
    }
  }
  if (lastKey !== cursor) await setCursor(env, lastKey);
  // RETENTION: delete rows older than window (cheap on indexed ts_ms).
  await env.AUDIT.prepare('DELETE FROM worker_logs WHERE ts_ms < ?').bind(Date.now() - RETENTION_DAYS * 86400000).run();
  return { files: files.length, inserted, dupes, errors, lastKey };
}

// PRECONDITION: worker_logs populated. POSTCONDITION: cloud_ops_events digest row + alerts for error-ratio anomalies.
async function digest(env, ingestResult) {
  const dayAgo = Date.now() - 86400000;
  const agg = await env.AUDIT.prepare(`SELECT script_name, COUNT(*) n, SUM(CASE WHEN outcome != 'ok' OR status >= 500 THEN 1 ELSE 0 END) bad, MAX(ts_ms) last_ts, MAX(status) max_status
    FROM worker_logs WHERE ts_ms >= ? GROUP BY script_name`).bind(dayAgo).all();
  const rows = (agg.results || []);
  const seen = new Set(rows.map(r => r.script_name));
  const summary = {
    generated_at: nowIso(),
    version: VERSION,
    ingest: ingestResult,
    total_events_24h: rows.reduce((a, r) => a + r.n, 0),
    workers_seen_24h: rows.length,
    workers_silent_24h: FLEET.filter(w => !seen.has(w)),
    anomalies: [],
  };
  for (const r of rows) {
    const ratio = r.bad / r.n;
    if (r.n >= 20 && ratio > 0.5) {
      summary.anomalies.push({ worker: r.script_name, events: r.n, bad: r.bad, ratio: Math.round(ratio * 100) / 100 });
      await env.AUDIT.prepare('INSERT INTO alerts (source, level, message, digested) VALUES (?, ?, ?, 0)').bind(NAME, 'warning', NAME + ': ' + r.script_name + ' error ratio ' + Math.round(ratio * 100) + '% (' + r.bad + '/' + r.n + ' last 24h)').run();
    }
  }
  // RECURRENCE-FIX (2026-09-14): id was hour-granular ('fleet-obs-<YYYY-MM-DDTHH>-digest'), so any
  // second call to digest() within the same hour hit a TEXT PRIMARY KEY collision on cloud_ops_events
  // and threw (scriptThrewException x95/24h: cron + repeated /run/ingest). Minute-unique + INSERT OR
  // REPLACE makes the digest idempotent and collision-free.
  const id = 'fleet-obs-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + '-digest';
  await env.AUDIT.prepare('INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, nowIso(), 'fleet-observability-digest', 'Fleet observability digest: ' + rows.length + ' workers logged ' + summary.total_events_24h + ' events in 24h; ' + summary.anomalies.length + ' anomalies', JSON.stringify(summary), NAME, 'ok').run();
  return summary;
}

// PRECONDITION: POST body JSON {worker, event, level?, message?, data?}. POSTCONDITION: worker_logs row with event_type='custom'.
async function logEvent(env, body, req) {
  const w = String(body.worker || '').slice(0, 120);
  if (!w) return json({ ok: false, error: 'worker required' }, 400);
  const row = {
    hash: 'c' + fnv1a(nowIso() + '|' + w + '|' + String(body.event || '') + '|' + Math.random().toString(36).slice(2)),
    ts: Date.now(),
    ingestedAt: nowIso(),
    script: w,
    type: 'custom:' + String(body.event || 'event').slice(0, 40),
    outcome: 'log',
    url: null, method: null, status: null, cpu: null, wall: null,
    logs: JSON.stringify({ level: String(body.level || 'info').slice(0, 20), message: String(body.message || '').slice(0, 1000), data: body.data ?? null, registered: KNOWN.has(w) }).slice(0, 2000),
    exc: null,
  };
  await ensureSchema(env);
  await env.AUDIT.prepare('INSERT OR IGNORE INTO worker_logs (event_hash, ts_ms, ingested_at, script_name, event_type, outcome, url, method, status, cpu_ms, wall_ms, logs_json, exceptions_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(row.hash, row.ts, row.ingestedAt, row.script, row.type, row.outcome, row.url, row.method, row.status, row.cpu, row.wall, row.logs, row.exc).run();
  return json({ ok: true, hash: row.hash });
}

// === SYSTEM INTEGRATION ASSESSMENT (v1.1.0) ===
// Purpose: measure the fleet as a SYSTEM - cross-worker chains (producer -> consumer -> medium),
// feedback-loop closure, entropy/decay of the system's own bookkeeping, and integration opportunities.
// A worker can be alive while its chain is broken; this layer makes that visible.

function ageHours(iso) {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  if (isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / 3600000);
}

// Chain definitions: { id, name, producer, consumer, medium, sql, total, max, minOk, want, expectEmpty }
// sql:   counts rows in the PENDING state (must return {n} and optionally {oldest}|{latest}).
// total: counts ALL rows in the medium. Used by the v1.1.5 empty-match guard: if sql matches 0 rows
//        while total >= EMPTY_MATCH_MIN_TOTAL, the chain reports `empty-match` rather than `healthy`,
//        because the pending predicate is more likely stale than the medium is drained.
// max:   pending-items ceiling (above = backpressure/stuck). minOk: minimum expected activity.
// expectEmpty: true when zero pending rows IS the success condition (drained queue), suppressing the
//        empty-match opportunity for that chain.
const INTEGRATION_CHAINS = [
  { id: 'fleet-pulse', name: 'Scheduler -> Executor pulse', producer: 'fleet-scheduler', consumer: 'fleet-executor', medium: 'fleet_runs',
    sql: "SELECT COUNT(*) n, MAX(started_at) latest FROM fleet_runs WHERE julianday(started_at) >= julianday('now','-75 minutes')",
    total: "SELECT COUNT(*) n FROM fleet_runs",
    max: null, minOk: 1, expectEmpty: false, want: '>=1 pulse run / 75min (hourly heartbeat)' },
  { id: 'errata', name: 'Errata watch -> respond -> publish', producer: 'errata-watch / email', consumer: 'errata-respond / errata-publish', medium: 'errata_queue',
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM errata_queue WHERE status NOT IN ('done','published','resolved','superseded','implemented')",
    total: "SELECT COUNT(*) n FROM errata_queue",
    max: 10, minOk: null, expectEmpty: true, want: 'pending <= 10' },
  { id: 'ideas', name: 'Idea intake -> triage', producer: 'edge form / idea-miner / auto-scan', consumer: 'idea-triage', medium: 'idea_proposals',
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM idea_proposals WHERE status = 'new'",
    total: "SELECT COUNT(*) n FROM idea_proposals",
    max: 30, minOk: null, expectEmpty: true, want: 'new <= 30' },
  { id: 'intents', name: 'Intent intake -> orchestrator', producer: 'calendar-api / edge', consumer: 'qnfo-intent-orchestrator', medium: 'intents',
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM intents WHERE status = 'pending'",
    total: "SELECT COUNT(*) n FROM intents",
    max: 20, minOk: null, expectEmpty: true, want: 'pending <= 20 (0 = drained)' },
  { id: 'version-drain', name: 'Reviser -> research-exec publish drain', producer: 'qnfo-paper-reviser', consumer: 'qnfo-research-exec', medium: 'version_queue',
    // v1.2.4: gate-blocked rows are STUCK (QUALITY-GATE-1), not drained. They were invisible because the
    // chain only counted 'drafted' — a 23-row gate-blocked backlog reported "none". Include them.
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM version_queue WHERE status IN ('drafted','gate-blocked')",
    total: "SELECT COUNT(*) n FROM version_queue",
    max: 5, minOk: null, expectEmpty: true, want: 'drafted+gate-blocked <= 5 (gate-blocked = stuck, QUALITY-GATE-1)' },
  { id: 'outreach', name: 'Outreach queue -> send drain', producer: 'radar-hub / idea-hub / qnfo-cloud-ops', consumer: 'qnfo-cloud-ops (jobOutreach)', medium: 'outreach_queue',
    // STATUS-DRIFT-FIX (2026-09-14): the chain watched 'needs-contact', which NO writer emits. Live writers
    // emit 'pending' (radar-hub, qnfo-cloud-ops) or 'queued' (idea-hub, qnfo-idea-triage — drifted); the
    // consumer (qnfo-cloud-ops jobOutreach) drains 'pending','needs-email'. Watch the real enum.
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM outreach_queue WHERE status IN ('pending','needs-email','queued')",
    total: "SELECT COUNT(*) n FROM outreach_queue",
    max: 20, minOk: null, expectEmpty: false, want: 'pending+needs-email <= 20 (sends gated until 2026-09-15)' },
  { id: 'issues', name: 'Chat failures -> kaizen digest', producer: 'ops gateway', consumer: 'qnfo-kaizen', medium: 'agent_issues',
    sql: "SELECT COUNT(*) n FROM agent_issues WHERE status = 'open'",
    total: "SELECT COUNT(*) n FROM agent_issues",
    max: 10, minOk: null, expectEmpty: true, want: 'open <= 10' },
  { id: 'alerts', name: 'Alerts -> digest consumer', producer: 'qnfo-observability', consumer: 'ops digest', medium: 'alerts',
    // v1.1.5: was `digested = 0` (0 rows). Live values are TEXT 'auto' (914), INTEGER 1 (141), NULL (45).
    // The column is declared INTEGER but producers write TEXT, so an equality test on 0 can never match.
    sql: "SELECT COUNT(*) n FROM alerts WHERE digested IS NULL OR digested = '' OR digested = 0",
    total: "SELECT COUNT(*) n FROM alerts",
    max: 5, minOk: null, expectEmpty: true, want: 'undigested <= 5' },
  { id: 'email', name: 'Inbound email -> triage', producer: 'SMTP gateway', consumer: 'qnfo-email workers', medium: 'emails',
    sql: "SELECT COUNT(*) n FROM emails WHERE status = 'received'",
    total: "SELECT COUNT(*) n FROM emails",
    max: 10, minOk: null, expectEmpty: true, want: 'unprocessed <= 10 (received unused; 0 = drained)' },
  { id: 'research', name: 'Research queue -> execution', producer: 'supervisor / radars', consumer: 'qnfo-research-exec', medium: 'research_queue',
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM research_queue WHERE status IN ('pending','researching','ensemble-draft','claimed')",
    total: "SELECT COUNT(*) n FROM research_queue",
    max: 10, minOk: null, expectEmpty: false, want: 'queued/active <= 10' },
  { id: 'revisions', name: 'Revision log -> publish drain', producer: 'qnfo-paper-reviser', consumer: 'qnfo-research-exec', medium: 'paper_revision_log',
    sql: "SELECT COUNT(*) n FROM paper_revision_log WHERE status = 'queued'",
    total: "SELECT COUNT(*) n FROM paper_revision_log",
    max: 8, minOk: null, expectEmpty: false, want: 'queued <= 8' },
];

// PRECONDITION: schema ensured. POSTCONDITION: integration_state row appended with latest assessment.
async function assessIntegration(env) {
  const chains = [];
  for (let i = 0; i < INTEGRATION_CHAINS.length; i++) {
    const c = INTEGRATION_CHAINS[i];
    const st = { id: c.id, name: c.name, producer: c.producer, consumer: c.consumer, medium: c.medium, status: 'unknown', n: null, total: null, oldest_h: null, detail: '', metric: (c.id === 'fleet-pulse' ? 'rate' : 'queue') };
    try {
      const r = await env.AUDIT.prepare(c.sql).first();
      // v1.1.5: read the medium size so an empty pending match can be distinguished from a drained queue.
      if (c.total) {
        try { const tr = await env.AUDIT.prepare(c.total).first(); st.total = tr ? Number(tr.n) || 0 : null; } catch (eT) { st.total = null; }
      }
      if (r) {
        st.n = r.n == null ? null : Number(r.n);
        st.oldest_h = ageHours(r.oldest || r.latest);
        if (c.max != null && st.n > c.max) { st.status = 'stuck'; st.detail = 'backpressure: ' + st.n + ' waiting (' + c.want + ')'; }
        else if (c.minOk != null && st.n < c.minOk) { st.status = 'degraded'; st.detail = 'below expected activity (' + c.want + ')'; }
        else if (st.n === 0 && st.total != null && st.total >= EMPTY_MATCH_MIN_TOTAL && !c.expectEmpty) {
          // The pending predicate matched nothing, but the medium is not empty. Either the queue drained
          // or the status enum moved. We cannot tell from here, so we must not assert health.
          st.status = 'empty-match';
          st.detail = '0 of ' + st.total + ' rows matched the pending predicate (' + c.want + ') - verify the status enum, or confirm the queue is genuinely drained';
        }
        else { st.status = 'healthy'; st.detail = c.want; }
      } else {
        st.n = 0; st.status = c.minOk != null ? 'degraded' : 'healthy';
        st.detail = c.minOk != null ? 'no activity in window (' + c.want + ')' : c.want;
      }
    } catch (e) {
      st.detail = 'query error: ' + String(e && e.message ? e.message : e).slice(0, 70);
    }
    chains.push(st);
  }
  let probed = [], traced = [], invocated = [];
  try { const r = await env.AUDIT.prepare("SELECT DISTINCT name FROM fleet_probe_log").all(); probed = (r.results || []).map(function (x) { return x.name; }); } catch (e) {}
  try { const r = await env.AUDIT.prepare("SELECT DISTINCT script_name FROM worker_logs").all(); traced = (r.results || []).map(function (x) { return x.script_name; }); } catch (e) {}
  try { const r = await env.AUDIT.prepare("SELECT DISTINCT worker_name FROM worker_invocations").all(); invocated = (r.results || []).map(function (x) { return x.worker_name; }); } catch (e) {}
  const probedSet = new Set(probed), tracedSet = new Set(traced), invocatedSet = new Set(invocated);
  // FLEET-SIZE-LIVE-1 (2026-09-13): use live service_registry count instead of hardcoded FLEET array
  var liveFleetNames = FLEET;
  try {
    const lf = await env.AUDIT.prepare("SELECT service FROM service_registry WHERE state='live'").all();
    if (lf && lf.results && lf.results.length) liveFleetNames = lf.results.map(function (x) { return x.service; });
  } catch (e) {}
  const liveSet = new Set(liveFleetNames);
  const fleetSize = liveFleetNames.length;
  const coverage = {
    fleet_size: fleetSize,
    probed: [...probedSet].filter(function (w) { return liveSet.has(w); }).length,
    invocated: [...invocatedSet].filter(function (w) { return liveSet.has(w); }).length,
    traced: [...tracedSet].filter(function (w) { return liveSet.has(w); }).length,
    probe_gap: liveFleetNames.filter(function (w) { return !probedSet.has(w); }).length,
    trace_gap: liveFleetNames.filter(function (w) { return !tracedSet.has(w); }).length,
  };
  const decaySignals = [
    ['cloud_ops_events', 'SELECT MAX(ts) latest FROM cloud_ops_events'],
    ['fleet_probe_log', 'SELECT MAX(ts) latest FROM fleet_probe_log'],
    ['ops_ai_log', 'SELECT MAX(ts) latest FROM ops_ai_log'],
    ['deployment_history', 'SELECT MAX(deployed_at) latest FROM deployment_history'],
    ['self_heal_actions', 'SELECT MAX(ts) latest FROM self_heal_actions'],
    ['issue_ledger', 'SELECT MAX(last_seen) latest FROM issue_ledger'],
  ];
  const decay = [];
  for (let i = 0; i < decaySignals.length; i++) {
    const ds = decaySignals[i];
    try {
      const r = await env.AUDIT.prepare(ds[1]).first();
      decay.push({ signal: ds[0], age_h: ageHours(r && r.latest) });
    } catch (e) {
      decay.push({ signal: ds[0], age_h: null, error: String(e && e.message ? e.message : e).slice(0, 50) });
    }
  }
  const opportunities = [];
  for (let i = 0; i < chains.length; i++) {
    const c = chains[i];
    if (c.status === 'stuck') opportunities.push({ kind: 'backpressure', chain: c.id, text: c.name + ': ' + c.detail + ' (oldest ' + (c.oldest_h == null ? '?' : c.oldest_h.toFixed(1)) + 'h)' });
    if (c.status === 'degraded') opportunities.push({ kind: 'low-activity', chain: c.id, text: c.name + ': ' + c.detail });
    // v1.1.5: surface enum drift as its own signal class, unless empty is the success condition.
    if (c.status === 'empty-match' && !INTEGRATION_CHAINS[i].expectEmpty) opportunities.push({ kind: 'enum-check', chain: c.id, text: c.name + ': ' + c.detail });
    if (c.oldest_h != null && c.oldest_h > 72 && c.status === 'healthy') opportunities.push({ kind: 'stale-item', chain: c.id, text: c.name + ': oldest pending item ' + c.oldest_h.toFixed(1) + 'h old (under count ceiling but stale)' });
  }
  if (coverage.probe_gap > 0) opportunities.push({ kind: 'coverage', text: coverage.probe_gap + ' of ' + fleetSize + ' workers have no liveness probe' });
  if (coverage.trace_gap > 0) opportunities.push({ kind: 'trace-gap', text: 'Logpush trace coverage: ' + coverage.traced + '/' + fleetSize + ' workers emit trace events' });
  const noSignal = liveFleetNames.filter(function (w) { return !probedSet.has(w) && !tracedSet.has(w) && !invocatedSet.has(w); });
  if (noSignal.length > 0) opportunities.push({ kind: 'integration-candidate', text: noSignal.length + ' workers emit no probe/trace/invocation signal: ' + noSignal.slice(0, 8).join(', ') + (noSignal.length > 8 ? ', ...' : '') });
  // v1.1.5: empty-match is deliberately excluded from chainScore - it is an UNKNOWN, not a pass and not
  // a failure. Counting it as healthy is what let five stale predicates report green for days.
  const chainVals = chains.filter(function (c) { return c.status === 'healthy' || c.status === 'stuck' || c.status === 'degraded'; });
  const chainScore = chainVals.length ? chainVals.reduce(function (a, c) { return a + (c.status === 'healthy' ? 1 : c.status === 'degraded' ? 0.5 : 0); }, 0) / chainVals.length : null;
  const coverageScore = Math.min(1, (coverage.probed / Math.max(1, fleetSize)) * 0.6 + (coverage.traced / Math.max(1, fleetSize)) * 0.4);
  const decVals = decay.filter(function (d) { return d.age_h != null; });
  const freshnessScore = decVals.length ? decVals.reduce(function (a, d) { return a + Math.max(0, 1 - d.age_h / 48); }, 0) / decVals.length : null;
  let total = null;
  if (chainScore != null && freshnessScore != null) {
    total = Math.round(100 * (0.5 * chainScore + 0.3 * coverageScore + 0.2 * freshnessScore));
  }
  const score = {
    total: total,
    chains: chainScore == null ? null : Math.round(chainScore * 100),
    coverage: Math.round(coverageScore * 100),
    freshness: freshnessScore == null ? null : Math.round(freshnessScore * 100),
    weights: 'chains 50% / coverage 30% / freshness 20%',
    note: 'v1.1.5: chains in empty-match are excluded from chainScore (unknown, not healthy)',
  };
  const summary = { generated_at: new Date().toISOString(), version: VERSION, fleet_size: fleetSize, chains: chains, coverage: coverage, decay: decay, opportunities: opportunities, score: score };
  try {
    await env.AUDIT.prepare('INSERT INTO integration_state (ts, json) VALUES (?, ?)').bind(summary.generated_at, JSON.stringify(summary)).run();
  } catch (e) {}
  // PROACTIVE (v1.1.1): score-regression self-alert - the objective function polices its own drops.
  try {
    const prev = await env.AUDIT.prepare('SELECT json FROM integration_state ORDER BY id DESC LIMIT 1 OFFSET 1').first();
    if (prev && prev.json) {
      const prevS = JSON.parse(prev.json);
      const prevTotal = prevS && prevS.score && typeof prevS.score.total === 'number' ? prevS.score.total : null;
      if (prevTotal != null && score.total != null && prevTotal - score.total >= 5) {
        const id = 'proactive-sai-drop-' + new Date().toISOString().slice(0, 13);
        const exists = await env.AUDIT.prepare("SELECT id FROM cloud_ops_events WHERE id = ?1").bind(id).first();
        if (!exists) {
          await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'proactive-alert', ?3, ?4, 'qnfo-observability', 'ok')").bind(id, new Date().toISOString(), 'System integration score dropped ' + prevTotal + ' -> ' + score.total + ' (>=5 points). Investigate chains/coverage/decay regression.', JSON.stringify({ prev: prevTotal, now: score.total })).run();
        }
      }
    }
  } catch (e) {}
  return summary;
}

// === MERGED: qnfo-events v1.1.0 (issue ledger + event ingest) ===
function evNorm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function evHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
function evFingerprint(ev) { return ev.fingerprint && String(ev.fingerprint).trim() || evHash(evNorm(ev.source) + '|' + evNorm(ev.category) + '|' + evNorm(ev.title)); }
async function evEnsureSchema(env) {
  await env.AUDIT.prepare('CREATE TABLE IF NOT EXISTS issue_ledger (fingerprint TEXT PRIMARY KEY, source TEXT, level TEXT, category TEXT, title TEXT, status TEXT DEFAULT \'open\', first_seen TEXT, last_seen TEXT, occurrences INTEGER DEFAULT 1, last_detail TEXT, updated_at TEXT)').run();
  await env.AUDIT.prepare('CREATE TABLE IF NOT EXISTS issue_events (id INTEGER PRIMARY KEY AUTOINCREMENT, fingerprint TEXT, source TEXT, level TEXT, category TEXT, title TEXT, detail TEXT, ts TEXT)').run();
  await env.AUDIT.prepare('CREATE INDEX IF NOT EXISTS idx_issue_ledger_status ON issue_ledger(status)').run();
}
function evOkAuth(req, env) {
  const t = env.EVENTS_TOKEN || ''; if (!t) return true;
  const h = req.headers.get('Authorization') || ''; if (!h.startsWith('Bearer ')) return false;
  const a = h.slice(7), b = t; if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
async function evIngest(env, ev) {
  await evEnsureSchema(env);
  const fp = evFingerprint(ev); const now = new Date().toISOString();
  const level = String(ev.level || 'info').toLowerCase();
  const source = String(ev.source || 'unknown').slice(0, 80);
  const category = String(ev.category || 'general').slice(0, 60);
  const title = String(ev.title || '').slice(0, 300);
  const detail = String(ev.detail || '').slice(0, 4000);
  const ts = String(ev.ts || now).slice(0, 40);
  const exist = await env.AUDIT.prepare('SELECT fingerprint FROM issue_ledger WHERE fingerprint=?1').bind(fp).first();
  let created = false;
  if (!exist) { created = true; await env.AUDIT.prepare('INSERT INTO issue_ledger (fingerprint, source, level, category, title, status, first_seen, last_seen, occurrences, last_detail, updated_at) VALUES (?1,?2,?3,?4,?5,\'open\',?6,?6,1,?7,?6)').bind(fp, source, level, category, title, ts, detail).run(); }
  else { await env.AUDIT.prepare('UPDATE issue_ledger SET occurrences = occurrences + 1, last_seen = ?1, last_detail = ?2, updated_at = ?1 WHERE fingerprint = ?3').bind(ts, detail, fp).run(); }
  await env.AUDIT.prepare('INSERT INTO issue_events (fingerprint, source, level, category, title, detail, ts) VALUES (?1,?2,?3,?4,?5,?6,?7)').bind(fp, source, level, category, title, detail, ts).run();
  const row = await env.AUDIT.prepare('SELECT fingerprint, source, level, category, title, status, first_seen, last_seen, occurrences FROM issue_ledger WHERE fingerprint=?1').bind(fp).first();
  return { created, issue: row };
}
async function evSetStatus(env, fp, status, note) {
  await evEnsureSchema(env);
  const row = await env.AUDIT.prepare('SELECT fingerprint FROM issue_ledger WHERE fingerprint=?1').bind(fp).first();
  if (!row) return { error: 'not found' };
  await env.AUDIT.prepare('UPDATE issue_ledger SET status=?1, last_detail=COALESCE(?2,last_detail), updated_at=?3 WHERE fingerprint=?4').bind(status, String(note || '').slice(0, 1000) || null, new Date().toISOString(), fp).run();
  return { ok: true };
}
async function evSweep(env) {
  await evEnsureSchema(env); let alertsN = 0, coeN = 0;
  try {
    const alerts = await env.AUDIT.prepare("SELECT id, source, level, message, created_at FROM alerts WHERE julianday(created_at) > julianday('now','-2 day') ORDER BY id ASC").all();
    for (const a of alerts.results || []) {
      const key = 'src:alert:' + a.id; const seen = await env.AUDIT.prepare('SELECT id FROM issue_events WHERE detail=?1 LIMIT 1').bind(key).first(); if (seen) continue;
      const fp = 'alert:' + evHash(evNorm(a.source || 'unknown') + '|' + evNorm(a.message || '').slice(0, 180));
      const lvl = a.level === 'HIGH' ? 'high' : String(a.level || 'warning').toLowerCase(); const now = new Date().toISOString();
      const ex = await env.AUDIT.prepare('SELECT fingerprint FROM issue_ledger WHERE fingerprint=?1').bind(fp).first();
      if (!ex) await env.AUDIT.prepare("INSERT INTO issue_ledger (fingerprint, source, level, category, title, status, first_seen, last_seen, occurrences, last_detail, updated_at) VALUES (?1,?2,?3,'alert','AUTO-SWEEP: ' || substr(?4,1,220),'open',?5,?5,1,?4,?5)").bind(fp, String(a.source || 'unknown').slice(0, 80), lvl, String(a.message || ''), now).run();
      else await env.AUDIT.prepare('UPDATE issue_ledger SET occurrences=occurrences+1, last_seen=?1, last_detail=?2, updated_at=?1 WHERE fingerprint=?3').bind(now, String(a.message || '').slice(0, 1000), fp).run();
      await env.AUDIT.prepare("INSERT INTO issue_events (fingerprint, source, level, category, title, detail, ts) VALUES (?1,?2,?3,'alert','AUTO-SWEEP',?4,?5)").bind(fp, String(a.source || 'unknown').slice(0, 80), lvl, key, now).run(); alertsN++;
    }
  } catch (e) { alertsN = -1; }
  try {
    const coe = await env.AUDIT.prepare("SELECT id, kind, text, job, status, ts FROM cloud_ops_events WHERE julianday(ts) > julianday('now','-2 day') AND status IN ('error','partial','failed') ORDER BY ts ASC").all();
    for (const c of coe.results || []) {
      const key = 'src:coe:' + c.id; const seen = await env.AUDIT.prepare('SELECT id FROM issue_events WHERE detail=?1 LIMIT 1').bind(key).first(); if (seen) continue;
      const fp = 'coe:' + evHash(evNorm(c.job || c.kind || 'unknown') + '|' + evNorm(c.text || '').slice(0, 180)); const now = new Date().toISOString();
      const ex = await env.AUDIT.prepare('SELECT fingerprint FROM issue_ledger WHERE fingerprint=?1').bind(fp).first();
      if (!ex) await env.AUDIT.prepare("INSERT INTO issue_ledger (fingerprint, source, level, category, title, status, first_seen, last_seen, occurrences, last_detail, updated_at) VALUES (?1,?2,'error','cloud-ops','AUTO-SWEEP: ' || substr(?3,1,220),'open',?4,?4,1,?3,?4)").bind(fp, String(c.job || c.kind || 'unknown').slice(0, 80), String(c.text || ''), now).run();
      else await env.AUDIT.prepare('UPDATE issue_ledger SET occurrences=occurrences+1, last_seen=?1, last_detail=?2, updated_at=?1 WHERE fingerprint=?3').bind(now, String(c.text || '').slice(0, 1000), fp).run();
      await env.AUDIT.prepare("INSERT INTO issue_events (fingerprint, source, level, category, title, detail, ts) VALUES (?1,?2,'error','cloud-ops','AUTO-SWEEP',?3,?4)").bind(fp, String(c.job || c.kind || 'unknown').slice(0, 80), key, now).run(); coeN++;
    }
  } catch (e) { coeN = -1; }
  return { alertsN, coeN };
}
async function evReview(env) {
  await evEnsureSchema(env); const now = new Date().toISOString(); const out = { reviewed: 0, escalated: 0, staleResolved: 0 };
  try {
    const open = await env.AUDIT.prepare("SELECT fingerprint, source, level, category, title, status, first_seen, last_seen, occurrences FROM issue_ledger WHERE status IN ('open','acknowledged') ORDER BY last_seen ASC").all();
    const rows = open.results || []; out.reviewed = rows.length;
    const ago = (iso, hours) => { try { return Date.now() - new Date(iso).getTime() > hours * 3600000; } catch (e) { return false; } };
    for (const it of rows) {
      const fp = it.fingerprint; const occ = it.occurrences || 1; const src = String(it.source || '');
      if (occ >= 3 && (it.level === 'high' || it.level === 'error')) {
        const dup = await env.AUDIT.prepare('SELECT id FROM agent_issues WHERE title = ?1').bind(String(it.title || '').slice(0, 180)).first();
        if (!dup) { await env.AUDIT.prepare("INSERT INTO agent_issues (priority, status, title, description, created_at, updated_at) VALUES ('high','open',?1,?2,?3,?3)").bind(String(it.title || '').slice(0, 180), ('AUTO-ESCALATION from evReview ' + now + ' - ' + occ + 'x, src ' + src).slice(0, 500), Date.now()).run(); out.escalated++; }
      } else if (it.status === 'acknowledged' && ago(it.last_seen, 24) && occ <= 2) {
        await env.AUDIT.prepare("UPDATE issue_ledger SET status='resolved', resolved_at=?1, last_detail='auto-resolved (stale acknowledged)', updated_at=?1 WHERE fingerprint=?2").bind(now, fp).run(); out.staleResolved++;
      } else if (ago(it.last_seen, 72) && occ <= 2 && (it.level === 'info' || it.level === 'warning')) {
        await env.AUDIT.prepare("UPDATE issue_ledger SET status='resolved', resolved_at=?1, last_detail='auto-resolved (stale, no repeat)', updated_at=?1 WHERE fingerprint=?2").bind(now, fp).run(); out.staleResolved++;
      }
    }
  } catch (e) { out.error = String(e && e.message || e).slice(0, 300); }
  return out;
}

export default {
  // PRECONDITION: cron trigger 17 * * * *. POSTCONDITION: ingest + digest executed hourly, server-side.
  async scheduled(controller, env, ctx) {
    try {
      await ensureSchema(env);
      const r = await ingestTrace(env);
      const summary = await digest(env, r);
      await assessIntegration(env);
    } catch (e) { console.error('scheduled failed', String(e && e.message || e)); }
    ctx.waitUntil(Promise.resolve());
  },

  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    await ensureSchema(env);
    if (p === '/health') {
      const cursor = await getCursor(env);
      const agg = await env.AUDIT.prepare('SELECT COUNT(*) n, MAX(ingested_at) latest FROM worker_logs').first();
      return json({ ok: true, name: NAME, version: VERSION, cursor, log_rows: agg ? agg.n : 0, latest_ingest: agg ? agg.latest : null });
    }
    if (p === '/integration') {
      const summary = await assessIntegration(env);
      return json({ ok: true, integration: summary });
    }
    if (p === '/trend') {
      // Trend analysis (v1.1.2): score delta + per-chain depth velocity = bifurcation early-warning.
      // Chaos lesson: monitor the DERIVATIVE of queue depth, not depth alone (arrival vs drain crossing).
      try {
        const rows = await env.AUDIT.prepare('SELECT ts, json FROM integration_state ORDER BY id DESC LIMIT 24').all();
        const pts = (rows.results || []).map(function (x) { try { return JSON.parse(x.json); } catch (e) { return null; } }).filter(function (x) { return x != null; });
        const latest = pts[0] || null;
        const prev = pts[1] || null;
        const chainVel = [];
        if (latest && prev) {
          const prevChains = {};
          (prev.chains || []).forEach(function (c) { prevChains[c.id] = c.n == null ? 0 : c.n; });
          (latest.chains || []).forEach(function (c) {
            const pn = prevChains[c.id] == null ? null : prevChains[c.id];
            const cn = c.n == null ? 0 : c.n;
            const vel = pn == null ? null : cn - pn;
            let warn = null;
            if (c.status === 'stuck') warn = 'stuck';
            else if (c.status === 'empty-match') warn = 'empty-match (verify enum)';
            else if (c.metric !== 'rate' && vel != null && vel > 0 && cn >= 1) warn = 'depth growing (+' + vel + ')';
            chainVel.push({ id: c.id, n: cn, prev_n: pn, velocity: vel, state: c.status, warn: warn });
          });
        }
        const scNow = latest && latest.score ? latest.score.total : null;
        const scPrev = prev && prev.score ? prev.score.total : null;
        const delta = (scNow != null && scPrev != null) ? Math.round((scNow - scPrev) * 10) / 10 : null;
        const warnings = [];
        chainVel.forEach(function (c) { if (c.warn) warnings.push(c.id + ': ' + c.warn); });
        if (delta != null && delta <= -3) warnings.push('score declining ' + delta + ' (prev ' + scPrev + ')');
        return json({ ok: true, generated_at: new Date().toISOString(), points: pts.length, span_h: pts.length > 1 ? Math.round(((Date.parse(latest.generated_at) - Date.parse(pts[pts.length - 1].generated_at)) / 3600000) * 10) / 10 : null, score_now: scNow, score_prev: scPrev, score_delta: delta, chain_velocity: chainVel, warnings: warnings });
      } catch (e) {
        return json({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 80) }, 500);
      }
    }
    if (p === '/run/ingest') {
      try {
        const r = await ingestTrace(env);
        const summary = await digest(env, r);
        return json({ ok: true, ingest: r, summary: { workers_seen_24h: summary.workers_seen_24h, anomalies: summary.anomalies.length } });
      } catch (e) { return json({ ok: false, error: String(e && e.message || e).slice(0, 200) }, 500); }
    }
    if (p === '/log' && req.method === 'POST') {
      let body = {}; try { body = await req.json(); } catch (e) { return json({ ok: false, error: 'invalid json' }, 400); }
      return await logEvent(env, body, req);
    }
    if (p === '/workers/logs') {
      const worker = url.searchParams.get('worker') || '';
      const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
      const since = Number(url.searchParams.get('since') || 0);
      let rows;
      if (worker) {
        rows = await env.AUDIT.prepare('SELECT ts_ms, ingested_at, script_name, event_type, outcome, url, method, status, cpu_ms, wall_ms, logs_json, exceptions_json FROM worker_logs WHERE script_name = ? AND ts_ms >= ? ORDER BY ts_ms DESC LIMIT ?').bind(worker, since, limit).all();
      } else {
        rows = await env.AUDIT.prepare('SELECT ts_ms, ingested_at, script_name, event_type, outcome, url, method, status, cpu_ms, wall_ms, logs_json, exceptions_json FROM worker_logs WHERE ts_ms >= ? ORDER BY ts_ms DESC LIMIT ?').bind(since, limit).all();
      }
      return json({ ok: true, count: rows.results.length, logs: rows.results });
    }
    if (p === '/fleet/summary') {
      const probes = await env.AUDIT.prepare(`SELECT name, url, ok, status, ms, ts, body FROM fleet_probe_log WHERE ts >= ? ORDER BY ts DESC LIMIT 400`).bind(new Date(Date.now() - 86400000).toISOString()).all();
      const latestProbe = {};
      for (const row of (probes.results || [])) { if (!latestProbe[row.name] || row.ts > latestProbe[row.name].ts) latestProbe[row.name] = row; }
      const agg = await env.AUDIT.prepare(`SELECT script_name, COUNT(*) n, SUM(CASE WHEN outcome != 'ok' OR status >= 500 THEN 1 ELSE 0 END) bad, MAX(ts_ms) last_ts FROM worker_logs WHERE ts_ms >= ? GROUP BY script_name`).bind(Date.now() - 86400000).all();
      return json({ ok: true, generated_at: nowIso(), version: VERSION, fleet_size: FLEET.length, probes: latestProbe, log_stats: agg.results || [] });
    }
    // JOBS-STATUS-PUBLIC-1 (2026-09-13, v1.1.4): keyless read-only view of the qnfo-ops async-job ledger.
    // WHY: the operator requirement is that a job status link be visible WITHOUT a key. The ops bearer is the
    // master key for chats + job creation, so requiring it to read a status code is wrong. This surface is the
    // status half; the deliverable body stays bearer-gated on qnfo-ops because ops_jobs.response can contain
    // mailbox contents and D1 rows. SCOPE: additive, after all existing routes, wrapped fail-closed.
    if (p === '/jobs' || p.startsWith('/jobs/')) {
      try {
        const cols = 'id, status, model, strategy, created_at, updated_at, length(response) AS response_len, length(tool_log) AS tool_log_len, substr(error,1,200) AS error';
        const id = p.startsWith('/jobs/') ? decodeURIComponent(p.slice(6)) : (url.searchParams.get('id') || '');
        if (id) {
          const row = await env.AUDIT.prepare('SELECT ' + cols + ' FROM ops_jobs WHERE id = ?').bind(id).first();
          if (!row) return json({ ok: false, error: 'no such job', id: id }, 404);
          return json({ ok: true, source: NAME, version: VERSION, note: 'status metadata only; the response body is bearer-gated on qnfo-ops', job: row });
        }
        const limit = Math.min(Number(url.searchParams.get('limit') || 25), 100);
        const st = url.searchParams.get('status') || '';
        const rows = st
          ? await env.AUDIT.prepare('SELECT ' + cols + ' FROM ops_jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?').bind(st, limit).all()
          : await env.AUDIT.prepare('SELECT ' + cols + ' FROM ops_jobs ORDER BY created_at DESC LIMIT ?').bind(limit).all();
        const agg = await env.AUDIT.prepare('SELECT status, COUNT(*) n FROM ops_jobs GROUP BY status').all();
        return json({ ok: true, source: NAME, version: VERSION, note: 'status metadata only; the response body is bearer-gated on qnfo-ops', counts: agg.results || [], jobs: rows.results || [] });
      } catch (e) {
        return json({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 200) }, 500);
      }
    }

    if (p === '/v1/events' && req.method === 'POST') { if (!evOkAuth(req, env)) return json({ error: 'unauthorized' }, 401); let ev = {}; try { ev = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); } return json(await evIngest(env, ev)); }
    if (p === '/v1/issues' && req.method === 'GET') {
      if (!evOkAuth(req, env)) return json({ error: 'unauthorized' }, 401); await evEnsureSchema(env);
      const evSt = url.searchParams.get('status'); const evSrc = url.searchParams.get('source'); const evLv = url.searchParams.get('level');
      let sql = 'SELECT fingerprint, source, level, category, title, status, first_seen, last_seen, occurrences FROM issue_ledger WHERE 1=1'; const binds = [];
      if (evSt) { sql += ' AND status=?'; binds.push(evSt); } if (evSrc) { sql += ' AND source=?'; binds.push(evSrc); } if (evLv) { sql += ' AND level=?'; binds.push(evLv); }
      sql += ' ORDER BY last_seen DESC LIMIT 100';
      const res = binds.length ? await env.AUDIT.prepare(sql).bind(...binds).all() : await env.AUDIT.prepare(sql).all();
      return json({ issues: res.results || [], count: (res.results || []).length });
    }
    if (p.startsWith('/v1/issues/') && req.method === 'POST') {
      if (!evOkAuth(req, env)) return json({ error: 'unauthorized' }, 401);
      const rest = p.slice('/v1/issues/'.length).split('/'); if (rest.length !== 2) return json({ error: 'expected /v1/issues/:fp/:action' }, 400);
      const fp = decodeURIComponent(rest[0]); const action = rest[1];
      if (!['resolve', 'acknowledge', 'mute', 'reopen'].includes(action)) return json({ error: 'action must be resolve|acknowledge|mute|reopen' }, 400);
      const body = await req.json().catch(() => ({}));
      return json(await evSetStatus(env, fp, { resolve: 'resolved', acknowledge: 'acknowledged', mute: 'muted', reopen: 'open' }[action], body.note || ''));
    }
    if (p === '/v1/sync' && req.method === 'POST') { if (!evOkAuth(req, env)) return json({ error: 'unauthorized' }, 401); return json(await evSweep(env)); }
    if (p === '/v1/review' && req.method === 'POST') { if (!evOkAuth(req, env)) return json({ error: 'unauthorized' }, 401); return json(await evReview(env)); }
        return json({ ok: false, error: 'not found', endpoints: ['/health', '/run/ingest', '/log', '/workers/logs', '/fleet/summary', '/integration', '/trend', '/jobs', '/jobs/<id>', '/v1/events', '/v1/issues', '/v1/sync', '/v1/review'] }, 404);
  }
};