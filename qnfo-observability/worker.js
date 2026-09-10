// qnfo-observability v1.0.0 — canonical fleet observability layer
// PURPOSE: makes the QNFO fleet observable to itself.
//   (1) INGEST  — scheduled trace ingest: Cloudflare Logpush workers_trace_events (R2 qnfo-audit/workers_trace/*.log.gz)
//                 parsed into structured D1 table worker_logs. Covers ALL workers with zero per-worker code changes.
//   (2) LOG API — POST /log direct structured events (optional client snippet), GET /workers/logs query.
//   (3) SUMMARY — GET /fleet/summary joins worker_logs + fleet_probe_log + worker_invocations into one view.
//   (4) DIGEST  — hourly digest writes cloud_ops_events (kind=fleet-observability-digest) + alerts on error-ratio anomalies.
// CANONICAL SOURCE: QNFO/qnfo-workers/qnfo-observability/worker.js
// DEPLOY: wrangler deploy (from this dir); bindings AUDIT (qnfo-audit D1) + LOGS (R2 qnfo-audit); cron 17 * * * *.

import { FLEET } from './fleet.js';

const VERSION = '1.1.1';
const NAME = 'qnfo-observability';
const KNOWN = new Set(FLEET);
const INGEST_CAP_FILES = 300;   // max R2 files processed per run (CPU bound)
const RETENTION_DAYS = 30;      // worker_logs retention window
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
  try { listed = await env.LOGS.list({ prefix: 'workers_trace/', limit: 1000 }); } catch (e) { return { files: 0, inserted: 0, dupes: 0, errors: 1, lastKey: cursor, note: 'list failed: ' + e.message }; }
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
  const id = 'fleet-obs-' + new Date().toISOString().slice(0, 13) + '-digest';
  await env.AUDIT.prepare('INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
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

// Chain definitions: { id, name, producer, consumer, medium, sql, max, minOk, want }
// max: pending-items ceiling (above = backpressure/stuck); minOk: minimum expected activity (below = degraded);
// sql must return at least {n} and may return {oldest} or {latest} as timestamp text.
const INTEGRATION_CHAINS = [
  { id: 'fleet-pulse', name: 'Scheduler -> Executor pulse', producer: 'fleet-scheduler', consumer: 'fleet-executor', medium: 'fleet_runs',
    sql: "SELECT COUNT(*) n, MAX(started_at) latest FROM fleet_runs WHERE started_at >= datetime('now','-15 minutes')",
    max: null, minOk: 3, want: '>=3 pulse runs / 15min (heartbeat closed loop)' },
  { id: 'errata', name: 'Errata watch -> respond -> publish', producer: 'errata-watch / email', consumer: 'errata-respond / errata-publish', medium: 'errata_queue',
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM errata_queue WHERE status NOT IN ('done','published','resolved','superseded','implemented')",
    max: 10, minOk: null, want: 'pending <= 10' },
  { id: 'ideas', name: 'Idea intake -> triage', producer: 'edge form / idea-miner / auto-scan', consumer: 'idea-triage', medium: 'idea_proposals',
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM idea_proposals WHERE status = 'new'",
    max: 30, minOk: null, want: 'new <= 30' },
  { id: 'intents', name: 'Intent intake -> orchestrator', producer: 'calendar-api / edge', consumer: 'qnfo-intent-orchestrator', medium: 'intents',
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM intents WHERE status = 'pending'",
    max: 20, minOk: null, want: 'pending <= 20' },
  { id: 'version-drain', name: 'Reviser -> research-exec publish drain', producer: 'qnfo-paper-reviser', consumer: 'qnfo-research-exec', medium: 'version_queue',
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM version_queue WHERE status = 'drafted'",
    max: 5, minOk: null, want: 'drafted <= 5' },
  { id: 'outreach', name: 'Outreach queue -> campaign engine', producer: 'register / ops', consumer: 'qnfo-outreach', medium: 'outreach_queue',
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM outreach_queue WHERE status = 'pending'",
    max: 20, minOk: null, want: 'pending <= 20' },
  { id: 'issues', name: 'Chat failures -> kaizen digest', producer: 'ops gateway', consumer: 'qnfo-kaizen', medium: 'agent_issues',
    sql: "SELECT COUNT(*) n FROM agent_issues WHERE status = 'open'",
    max: 10, minOk: null, want: 'open <= 10' },
  { id: 'alerts', name: 'Alerts -> digest consumer', producer: 'qnfo-observability', consumer: 'ops digest', medium: 'alerts',
    sql: "SELECT COUNT(*) n FROM alerts WHERE digested = 0",
    max: 5, minOk: null, want: 'undigested <= 5' },
  { id: 'email', name: 'Inbound email -> triage', producer: 'SMTP gateway', consumer: 'qnfo-email workers', medium: 'emails',
    sql: "SELECT COUNT(*) n FROM emails WHERE status = 'received'",
    max: 10, minOk: null, want: 'unprocessed <= 10' },
  { id: 'research', name: 'Research queue -> execution', producer: 'supervisor / radars', consumer: 'qnfo-research-exec', medium: 'research_queue',
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM research_queue WHERE status IN ('pending','ensemble-draft','claimed')",
    max: 10, minOk: null, want: 'queued/active <= 10' },
  { id: 'revisions', name: 'Revision log -> publish drain', producer: 'qnfo-paper-reviser', consumer: 'qnfo-research-exec', medium: 'paper_revision_log',
    sql: "SELECT COUNT(*) n FROM paper_revision_log WHERE status = 'queued'",
    max: 8, minOk: null, want: 'queued <= 8' },
];

// PRECONDITION: schema ensured. POSTCONDITION: integration_state row appended with latest assessment.
async function assessIntegration(env) {
  const chains = [];
  for (let i = 0; i < INTEGRATION_CHAINS.length; i++) {
    const c = INTEGRATION_CHAINS[i];
    const st = { id: c.id, name: c.name, producer: c.producer, consumer: c.consumer, medium: c.medium, status: 'unknown', n: null, oldest_h: null, detail: '' };
    try {
      const r = await env.AUDIT.prepare(c.sql).first();
      if (r) {
        st.n = r.n == null ? null : Number(r.n);
        st.oldest_h = ageHours(r.oldest || r.latest);
        if (c.max != null && st.n > c.max) { st.status = 'stuck'; st.detail = 'backpressure: ' + st.n + ' waiting (' + c.want + ')'; }
        else if (c.minOk != null && st.n < c.minOk) { st.status = 'degraded'; st.detail = 'below expected activity (' + c.want + ')'; }
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
  const fleetSize = FLEET.length;
  const coverage = {
    fleet_size: fleetSize,
    probed: probedSet.size,
    invocated: invocatedSet.size,
    traced: tracedSet.size,
    probe_gap: FLEET.filter(function (w) { return !probedSet.has(w); }).length,
    trace_gap: FLEET.filter(function (w) { return !tracedSet.has(w); }).length,
  };
  const decaySignals = [
    ['cloud_ops_events', 'SELECT MAX(ts) latest FROM cloud_ops_events'],
    ['fleet_probe_log', 'SELECT MAX(ts) latest FROM fleet_probe_log'],
    ['ops_ai_log', 'SELECT MAX(ts) latest FROM ops_ai_log'],
    ['deployment_history', 'SELECT MAX(ts) latest FROM deployment_history'],
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
    if (c.oldest_h != null && c.oldest_h > 72 && c.status === 'healthy') opportunities.push({ kind: 'stale-item', chain: c.id, text: c.name + ': oldest pending item ' + c.oldest_h.toFixed(1) + 'h old (under count ceiling but stale)' });
  }
  if (coverage.probe_gap > 0) opportunities.push({ kind: 'coverage', text: coverage.probe_gap + ' of ' + fleetSize + ' workers have no liveness probe' });
  if (coverage.trace_gap > 0) opportunities.push({ kind: 'trace-gap', text: 'Logpush trace coverage: ' + coverage.traced + '/' + fleetSize + ' workers emit trace events' });
  const noSignal = FLEET.filter(function (w) { return !probedSet.has(w) && !tracedSet.has(w) && !invocatedSet.has(w); });
  if (noSignal.length > 0) opportunities.push({ kind: 'integration-candidate', text: noSignal.length + ' workers emit no probe/trace/invocation signal: ' + noSignal.slice(0, 8).join(', ') + (noSignal.length > 8 ? ', ...' : '') });
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

export default {
  // PRECONDITION: cron trigger 17 * * * *. POSTCONDITION: ingest + digest executed hourly, server-side.
  async scheduled(controller, env, ctx) {
    await ensureSchema(env);
    const r = await ingestTrace(env);
    const summary = await digest(env, r);
    await assessIntegration(env);
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
    if (p === '/run/ingest') {
      const r = await ingestTrace(env);
      const summary = await digest(env, r);
      return json({ ok: true, ingest: r, summary: { workers_seen_24h: summary.workers_seen_24h, anomalies: summary.anomalies.length } });
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
    return json({ ok: false, error: 'not found', endpoints: ['/health', '/run/ingest', '/log', '/workers/logs', '/fleet/summary'] }, 404);
  }
};
