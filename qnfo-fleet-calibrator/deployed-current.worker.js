// qnfo-fleet-calibrator v1.0.0 - Autonomous fleet calibration/stress controller.
// Purpose: scheduled server-side calibration + stress-testing of fleet performance with
// self-auditing, self-correcting, self-improving loops + reversible autonomous adjustments.
// Canonical source: QNFO/qnfo-workers/qnfo-fleet-calibrator (FLEET-SELF-DOC-1)
// Runbook: QNFO/qnfo-ops/docs/FLEET-CALIBRATION.md
// deploy: wrangler deploy; cp worker.js deployed-current.worker.js
// Traffic label: all probe traffic is self-generated calibration (IMPRESSIONS-ZONE-NOT-WORKER-1).
// Cost guard: probes are tiny fetches; AI chat probe omitted (no valid router key in env).
// Sibling workers are probed via service bindings (SVC_*) - CF error 1042 blocks worker->workers.dev fetches.

const VERSION = '1.0.0';
const WORKER = 'qnfo-fleet-calibrator';
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const PROBE_MS = 12000;
const EXTREME_MS = 60000;
const RETENTION_METRICS_DAYS = 90;
const RETENTION_ANOMALY_DAYS = 30;
const RETENTION_R2_DAYS = 7;

function nowIso() { return new Date().toISOString(); }
function uid() { try { return crypto.randomUUID(); } catch (e) { return 'r' + Date.now() + Math.random().toString(16).slice(2); } }
function jp(s, fb) { if (s === null || s === undefined) return fb; try { return JSON.parse(s); } catch (e) { return fb; } }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function sjs(v) { try { return JSON.stringify(v); } catch (e) { return '{}'; } }
function safeEqual(a, b) { if (!a || !b || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

// ---- static probe plan -----------------------------------------------------
// kind: http|d1|r2|vectorize. soft: failures recorded but not alarmed.
// http probes: binding=SVC_* means fetch via service binding (internal), url is fallback/display.
const PROBES = [
  { id: 'qnfo-ai-health', kind: 'http', url: 'https://qnfo-ai.q08.workers.dev/health', binding: 'SVC_QNFO_AI', expect: 200 },
  { id: 'qnfo-ai-models', kind: 'http', url: 'https://qnfo-ai.q08.workers.dev/v1/models', binding: 'SVC_QNFO_AI', expect: 200 },
  { id: 'qnfo-infra-health', kind: 'http', url: 'https://qnfo-infra.q08.workers.dev/health', binding: 'SVC_QNFO_INFRA', expect: 200 },
  { id: 'qnfo-auditor-health', kind: 'http', url: 'https://qnfo-auditor.q08.workers.dev/health', binding: 'SVC_QNFO_AUDITOR', expect: 200 },
  { id: 'personal-api-health', kind: 'http', url: 'https://personal-api.q08.workers.dev/health', binding: 'SVC_PERSONAL_API', expect: 200, soft: true },
  { id: 'qnfo-intent-health', kind: 'http', url: 'https://qnfo-intent-orchestrator.q08.workers.dev/health', binding: 'SVC_QNFO_INTENT', expect: 200, soft: true },
  { id: 'papers-home', kind: 'http', url: 'https://papers.qnfo.org/', expect: 200, soft: true },
  { id: 'qnfo-org-home', kind: 'http', url: 'https://qnfo.org/', expect: 200, soft: true },
  { id: 'd1-audit', kind: 'd1' },
  { id: 'r2-audit', kind: 'r2' },
  { id: 'vectorize-cal', kind: 'vectorize' }
];

// Adversarial input battery (stress only): malformed/oversized/wrong-shape requests must be
// rejected gracefully (4xx), never 5xx. Fail = status>=500 or network error.
const BATTERY = [
  { id: 'adv-chat-invalid-json', url: 'https://qnfo-ai.q08.workers.dev/v1/chat/completions', method: 'POST', body: '{invalid', ct: 'application/json', binding: 'SVC_QNFO_AI' },
  { id: 'adv-chat-empty-json', url: 'https://qnfo-ai.q08.workers.dev/v1/chat/completions', method: 'POST', body: '', ct: 'application/json', binding: 'SVC_QNFO_AI' },
  { id: 'adv-chat-wrong-ctype', url: 'https://qnfo-ai.q08.workers.dev/v1/chat/completions', method: 'POST', body: 'hello', ct: 'text/plain', binding: 'SVC_QNFO_AI' },
  { id: 'adv-models-post', url: 'https://qnfo-ai.q08.workers.dev/v1/models', method: 'POST', body: '{}', ct: 'application/json', binding: 'SVC_QNFO_AI' },
  { id: 'adv-papers-404', url: 'https://papers.qnfo.org/papers/nonexistent-calib-xyz', method: 'GET', body: null, ct: null },
  { id: 'adv-home-bad-query', url: 'https://qnfo.org/?q=%00%FF', method: 'GET', body: null, ct: null }
];
const BURST_TARGET = 'https://qnfo-ai.q08.workers.dev/health';
const BURST_BINDING = 'SVC_QNFO_AI';
const BURST_N = 8;

// ---- schema (idempotent) ----------------------------------------------------
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS fleet_cal_runs (run_id TEXT PRIMARY KEY, run_type TEXT NOT NULL, trigger TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL DEFAULT \'running\', probe_total INTEGER DEFAULT 0, probe_ok INTEGER DEFAULT 0, probe_fail INTEGER DEFAULT 0, anomalies_found INTEGER DEFAULT 0, actions_applied INTEGER DEFAULT 0, verdict_score REAL, verdict_json TEXT, audit_json TEXT)',
  'CREATE TABLE IF NOT EXISTS fleet_cal_metrics (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, probe_id TEXT NOT NULL, kind TEXT NOT NULL, target TEXT, metric TEXT NOT NULL, value REAL, ok INTEGER NOT NULL DEFAULT 1, detail TEXT, measured_at TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_fcm_run ON fleet_cal_metrics(run_id)',
  'CREATE INDEX IF NOT EXISTS idx_fcm_probe_time ON fleet_cal_metrics(probe_id, measured_at)',
  'CREATE TABLE IF NOT EXISTS fleet_cal_baselines (probe_id TEXT NOT NULL, metric TEXT NOT NULL, n INTEGER DEFAULT 0, ema REAL DEFAULT 0, ema2 REAL DEFAULT 0, p95 REAL DEFAULT 0, min REAL DEFAULT 0, max REAL DEFAULT 0, threshold_mult REAL DEFAULT 2.0, updated_at TEXT NOT NULL, PRIMARY KEY (probe_id, metric))',
  'CREATE TABLE IF NOT EXISTS fleet_cal_anomalies (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, probe_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, baseline REAL, threshold REAL, severity TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'open\', detail TEXT, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_fca_open ON fleet_cal_anomalies(status, probe_id)',
  'CREATE TABLE IF NOT EXISTS fleet_cal_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, action_type TEXT NOT NULL, target TEXT, reason TEXT, before_json TEXT, after_json TEXT, applied_at TEXT NOT NULL, verified INTEGER DEFAULT 0, verified_at TEXT, rolled_back INTEGER DEFAULT 0, rollback_at TEXT, rollback_reason TEXT)',
  'CREATE INDEX IF NOT EXISTS idx_fcal_unv ON fleet_cal_actions(verified, rolled_back)',
  'CREATE TABLE IF NOT EXISTS fleet_cal_learnings (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, topic TEXT NOT NULL, insight TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS fleet_cal_state (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT NOT NULL)'
];
// ---- small helpers --------------------------------------------------------
async function ensureSchema(env) {
  for (let i = 0; i < SCHEMA.length; i++) { await env.DB_AUDIT.prepare(SCHEMA[i]).run(); }
}
async function stateGet(env, k) { try { const r = await env.DB_AUDIT.prepare('SELECT v FROM fleet_cal_state WHERE k=?1').bind(k).first(); return r ? r.v : null; } catch (e) { return null; } }
async function stateSet(env, k, v) { await env.DB_AUDIT.prepare('INSERT INTO fleet_cal_state (k,v,updated_at) VALUES (?1,?2,?3) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at').bind(k, v, nowIso()).run(); }
async function learn(env, runId, topic, insight) { try { await env.DB_AUDIT.prepare('INSERT INTO fleet_cal_learnings (run_id,topic,insight,created_at) VALUES (?1,?2,?3,?4)').bind(runId, topic, String(insight).slice(0, 600), nowIso()).run(); } catch (e) {} }
async function act(env, runId, at, target, reason, before, after) { try { await env.DB_AUDIT.prepare('INSERT INTO fleet_cal_actions (run_id,action_type,target,reason,before_json,after_json,applied_at) VALUES (?1,?2,?3,?4,?5,?6,?7)').bind(runId, at, target, String(reason||'').slice(0,400), sjs(before), sjs(after), nowIso()).run(); return 1; } catch (e) { return 0; } }
function ua() { return { 'User-Agent': 'qnfo-fleet-calibrator/' + VERSION + ' (self-calibration)' }; }
async function fetcher(url, method, headers, body, ms) {
  const ac = new AbortController();
  const t = setTimeout(function () { ac.abort(); }, ms || PROBE_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: method || 'GET', headers: headers || ua(), body: body, signal: ac.signal, redirect: 'follow' });
    return { ms: Date.now() - t0, status: res.status, text: await res.text() };
  } catch (e) { return { ms: Date.now() - t0, status: -1, text: '', err: String((e && e.message) || e).slice(0, 120) }; }
  finally { clearTimeout(t); }
}
// fetch via service binding when binding present (CF 1042 blocks worker->workers.dev)
async function svcFetch(env, p, method, headers, body, ms) {
  const svc = p.binding ? env[p.binding] : null;
  const ac = new AbortController();
  const t = setTimeout(function () { ac.abort(); }, ms || PROBE_MS);
  const t0 = Date.now();
  try {
    let res;
    if (svc) {
      res = await svc.fetch(p.url, { method: method || 'GET', headers: headers || ua(), body: body, signal: ac.signal });
    } else {
      res = await fetch(p.url, { method: method || 'GET', headers: headers || ua(), body: body, signal: ac.signal, redirect: 'follow' });
    }
    return { ms: Date.now() - t0, status: res.status, text: await res.text() };
  } catch (e) { return { ms: Date.now() - t0, status: -1, text: '', err: String((e && e.message) || e).slice(0, 120) }; }
  finally { clearTimeout(t); }
}

// ---- individual probes -----------------------------------------------------
async function probeHttp(env, p) {
  const r = await svcFetch(env, p, 'GET', ua(), null, PROBE_MS);
  const statusOk = r.status === p.expect ? 1 : 0;
  const ok = (p.soft || statusOk === 1) ? 1 : 0;
  let det = r.status > 0 ? ('status:' + r.status) : ('err:' + r.err);
  if (r.status > 0 && r.status !== p.expect && r.text) { det += ' body:' + r.text.slice(0, 140).replace(/[\r\n]+/g, ' '); }
  const rows = [
    { probe_id: p.id, kind: 'http', target: p.url, metric: 'latency_ms', value: r.ms, ok: ok, detail: det.slice(0, 220) },
    { probe_id: p.id, kind: 'http', target: p.url, metric: 'status', value: r.status, ok: ok, detail: 'expect:' + p.expect + (p.soft ? ' (soft)' : '') }
  ];
  return rows;
}
async function probeD1(env) {
  const t0 = Date.now();
  try {
    const one = await env.DB_AUDIT.prepare('SELECT 1 AS x').first();
    const cnt = await env.DB_AUDIT.prepare('SELECT COUNT(*) AS n FROM fleet_cal_runs').first();
    const ms = Date.now() - t0;
    const ok = one && one.x === 1 ? 1 : 0;
    return [
      { probe_id: 'd1-audit', kind: 'd1', target: 'qnfo-audit', metric: 'latency_ms', value: ms, ok: ok, detail: 'rows:' + (cnt ? cnt.n : -1) },
      { probe_id: 'd1-audit', kind: 'd1', target: 'qnfo-audit', metric: 'status', value: ok ? 200 : -1, ok: ok, detail: 'select1' }
    ];
  } catch (e) { return [{ probe_id: 'd1-audit', kind: 'd1', target: 'qnfo-audit', metric: 'latency_ms', value: Date.now() - t0, ok: 0, detail: String((e && e.message) || e).slice(0, 150) }]; }
}
async function probeR2(env) {
  const key = 'calibration/selfcheck-' + nowIso().slice(0, 10) + '.json';
  const body = sjs({ ts: nowIso(), worker: WORKER, version: VERSION });
  const t0 = Date.now();
  try {
    await env.R2_AUDIT.put(key, body, { httpMetadata: { contentType: 'application/json' } });
    const got = await env.R2_AUDIT.get(key);
    const txt = got ? await got.text() : '';
    const ok = txt === body ? 1 : 0;
    const ms = Date.now() - t0;
    if (ok) { await env.R2_AUDIT.delete(key); }
    return [
      { probe_id: 'r2-audit', kind: 'r2', target: 'qnfo-audit:' + key, metric: 'latency_ms', value: ms, ok: ok, detail: ok ? 'roundtrip-ok' : 'content-mismatch' },
      { probe_id: 'r2-audit', kind: 'r2', target: 'qnfo-audit:' + key, metric: 'status', value: ok ? 200 : -1, ok: ok, detail: 'put-get-delete' }
    ];
  } catch (e) { return [{ probe_id: 'r2-audit', kind: 'r2', target: 'qnfo-audit:' + key, metric: 'latency_ms', value: Date.now() - t0, ok: 0, detail: String((e && e.message) || e).slice(0, 150) }]; }
}
async function probeVec(env) {
  const t0 = Date.now();
  try {
    if (!env.VEC_CAL) { return [{ probe_id: 'vectorize-cal', kind: 'vectorize', target: 'qnfo-calibration', metric: 'latency_ms', value: Date.now() - t0, ok: 0, detail: 'binding-missing' }]; }
    const dim = 768; const v = [];
    for (let i = 0; i < dim; i++) { v.push(0.01 * Math.sin(i)); }
    const q = await env.VEC_CAL.query(v, { topK: 1 });
    const ms = Date.now() - t0;
    const matches = (q && q.matches) ? q.matches.length : 0;
    return [
      { probe_id: 'vectorize-cal', kind: 'vectorize', target: 'qnfo-calibration', metric: 'latency_ms', value: ms, ok: 1, detail: 'matches:' + matches },
      { probe_id: 'vectorize-cal', kind: 'vectorize', target: 'qnfo-calibration', metric: 'status', value: 200, ok: 1, detail: 'query' }
    ];
  } catch (e) { return [{ probe_id: 'vectorize-cal', kind: 'vectorize', target: 'qnfo-calibration', metric: 'latency_ms', value: Date.now() - t0, ok: 0, detail: String((e && e.message) || e).slice(0, 150) }]; }
}

// burst concurrency probe: BURST_N parallel fetches, derive p50/p95 of successes.
async function probeBurst(env) {
  const results = [];
  const svc = BURST_BINDING ? env[BURST_BINDING] : null;
  await Promise.all(Array.from({ length: BURST_N }, async function () {
    const t0 = Date.now();
    try {
      let res;
      if (svc) { res = await svc.fetch(BURST_TARGET, { headers: ua() }); }
      else { res = await fetch(BURST_TARGET, { headers: ua() }); }
      results.push(Date.now() - t0);
    } catch (e) { results.push(Date.now() - t0); }
  }));
  const sorted = results.slice().sort(function (a, b) { return a - b; });
  const n = sorted.length;
  const p50 = n ? sorted[Math.floor(n * 0.5)] : 0;
  const p95 = n ? sorted[Math.min(n - 1, Math.ceil(n * 0.95) - 1)] : 0;
  const p99 = n ? sorted[Math.min(n - 1, Math.ceil(n * 0.99) - 1)] : 0;
  return [
    { probe_id: 'burst-qnfo-ai', kind: 'burst', target: BURST_TARGET, metric: 'latency_ms', value: p50, ok: 1, detail: 'p50' },
    { probe_id: 'burst-qnfo-ai', kind: 'burst', target: BURST_TARGET, metric: 'p95_ms', value: p95, ok: 1, detail: 'p95' },
    { probe_id: 'burst-qnfo-ai', kind: 'burst', target: BURST_TARGET, metric: 'p99_ms', value: p99, ok: 1, detail: 'p99' },
    { probe_id: 'burst-qnfo-ai', kind: 'burst', target: BURST_TARGET, metric: 'count', value: n, ok: n > 0 ? 1 : 0, detail: 'n=' + n }
  ];
}
// ---- adversarial battery ---------------------------------------------------
async function probeBattery(env) {
  const rows = [];
  for (let i = 0; i < BATTERY.length; i++) {
    const c = BATTERY[i];
    const h = ua();
    if (c.ct) { h['Content-Type'] = c.ct; }
    const r = await svcFetch(env, c, c.method, h, c.body, PROBE_MS);
    const st = r.status;
    // graceful = no 5xx and no network error: the endpoint survived the malformed input
    const ok = (st > 0 && st < 500) ? 1 : 0;
    const note = st >= 400 ? 'rejected-' + st : 'tolerated-' + st;
    rows.push({ probe_id: c.id, kind: 'adversarial', target: c.url, metric: 'status', value: st, ok: ok, detail: ok ? (note + (r.err ? ' ' + r.err : '')) : 'unexpected-' + st + ' ' + r.err });
  }
  return rows;
}

// ---- baselines (EMA + adaptive threshold) -----------------------------------
function baselineKey(metric) { return metric === 'latency_ms' || metric === 'p95_ms' || metric === 'p99_ms'; }
async function updateBaselines(env, runId, metrics) {
  const tuned = [];
  const seen = {};
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    if (m.probe_id.indexOf('sim') === 0) continue;
    if (!baselineKey(m.metric)) continue;
    if (m.ok !== 1 || !(m.value > 0)) continue;
    const key = m.probe_id + '|' + m.metric;
    if (seen[key]) continue;
    seen[key] = 1;
    const row = await env.DB_AUDIT.prepare('SELECT * FROM fleet_cal_baselines WHERE probe_id=?1 AND metric=?2').bind(m.probe_id, m.metric).first();
    const v = m.value;
    let n = 1, ema = v, ema2 = v * v, mn = v, mx = v, mult = 2.0;
    if (row) {
      n = row.n + 1;
      ema = row.ema * 0.8 + v * 0.2;
      ema2 = row.ema2 * 0.8 + v * v * 0.2;
      mn = Math.min(row.min, v); mx = Math.max(row.max, v);
      mult = row.threshold_mult;
    }
    const sd = Math.sqrt(Math.max(0, ema2 - ema * ema));
    const p95 = ema + 2 * sd;
    const newMult = clamp(1.5 + 1.5 * (sd / Math.max(ema, 1)), 1.8, 6.0);
    if (Math.abs(newMult - mult) > 0.15) {
      tuned.push({ probe_id: m.probe_id, metric: m.metric, before: row ? { n: row.n, ema: row.ema, ema2: row.ema2, p95: row.p95, min: row.min, max: row.max, threshold_mult: row.threshold_mult } : null, after: { n: n, ema: Math.round(ema * 100) / 100, threshold_mult: Math.round(newMult * 100) / 100 } });
      mult = newMult;
    }
    await env.DB_AUDIT.prepare('INSERT INTO fleet_cal_baselines (probe_id,metric,n,ema,ema2,p95,min,max,threshold_mult,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(probe_id,metric) DO UPDATE SET n=excluded.n, ema=excluded.ema, ema2=excluded.ema2, p95=excluded.p95, min=excluded.min, max=excluded.max, threshold_mult=excluded.threshold_mult, updated_at=excluded.updated_at')
      .bind(m.probe_id, m.metric, n, Math.round(ema * 100) / 100, ema2, Math.round(p95 * 100) / 100, mn, mx, Math.round(mult * 100) / 100, nowIso()).run();
  }
  for (let i = 0; i < tuned.length; i++) {
    const t = tuned[i];
    await act(env, runId, 'tune-threshold', t.probe_id + '/' + t.metric, 'adaptive threshold recalibration', t.before, t.after);
  }
  return tuned.length;
}

// ---- anomaly detection -------------------------------------------------------
async function detectAnomalies(env, runId, metrics) {
  const found = [];
  const clean = {};
  const sims = [];
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    if (m.probe_id.indexOf('sim') === 0) {
      if (m.metric === 'latency_ms' && m.value > EXTREME_MS) sims.push(m);
      continue;
    }
    if (m.ok === 1 && baselineKey(m.metric)) clean[m.probe_id + '|' + m.metric] = 1;
    if (m.ok === 1 || m.metric !== 'latency_ms') continue;
    found.push({ probe_id: m.probe_id, metric: m.metric, value: m.value || 0, reason: 'probe-failure ' + String(m.detail || '') });
  }
  const seen = {};
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    if (m.probe_id.indexOf('sim') === 0) continue;
    if (!baselineKey(m.metric) || m.ok !== 1 || !(m.value > 0)) continue;
    const key = m.probe_id + '|' + m.metric;
    if (seen[key]) continue;
    seen[key] = 1;
    const row = await env.DB_AUDIT.prepare('SELECT ema, threshold_mult, p95 FROM fleet_cal_baselines WHERE probe_id=?1 AND metric=?2').bind(m.probe_id, m.metric).first();
    if (!row) continue;
    const upper = Math.max(row.ema * row.threshold_mult, row.p95 * 1.5);
    if (m.value > upper) found.push({ probe_id: m.probe_id, metric: m.metric, value: m.value, reason: 'latency-breach ' + Math.round(m.value) + '>' + Math.round(upper) });
  }
  for (let i = 0; i < sims.length; i++) {
    const s = sims[i];
    found.push({ probe_id: s.probe_id, metric: s.metric, value: s.value, reason: 'simulated-extreme' });
  }
  for (let i = 0; i < found.length; i++) {
    const f = found[i];
    const openRow = await env.DB_AUDIT.prepare('SELECT id FROM fleet_cal_anomalies WHERE probe_id=?1 AND metric=?2 AND status=?3').bind(f.probe_id, f.metric, 'open').first();
    const sev = (f.value > EXTREME_MS || f.reason.indexOf('probe-failure') === 0) ? 'high' : 'medium';
    const det = String(f.reason || '').slice(0, 300);
    if (openRow) {
      await env.DB_AUDIT.prepare('UPDATE fleet_cal_anomalies SET last_seen=?1, detail=?2 WHERE id=?3').bind(nowIso(), det, openRow.id).run();
    } else {
      await env.DB_AUDIT.prepare('INSERT INTO fleet_cal_anomalies (run_id,probe_id,metric,value,severity,status,detail,first_seen,last_seen) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)')
        .bind(runId, f.probe_id, f.metric, f.value, sev, 'open', det, nowIso()).run();
    }
  }
  const open = await env.DB_AUDIT.prepare('SELECT id, probe_id, metric FROM fleet_cal_anomalies WHERE status=?1').bind('open').all();
  for (let i = 0; i < (open.results || []).length; i++) {
    const o = open.results[i];
    if (clean[o.probe_id + '|' + o.metric]) {
      await env.DB_AUDIT.prepare('UPDATE fleet_cal_anomalies SET status=?1 WHERE id=?2').bind('resolved', o.id).run();
    }
  }
  return found.length;
}

// ---- autonomous adjustment actions -------------------------------------------
async function publishConfig(env, runId) {
  const rows = await env.DB_AUDIT.prepare('SELECT probe_id, metric, ema, p95, n FROM fleet_cal_baselines ORDER BY n DESC LIMIT 80').all();
  const base = (rows.results || []).filter(function (r) { return r.metric === 'latency_ms'; });
  const pick = function (pid) { const r = base.filter(function (b) { return b.probe_id === pid; }); return r.length ? r[0] : null; };
  const ai = pick('qnfo-ai-health');
  const doc = {
    generated_at: nowIso(), generator: WORKER, version: VERSION,
    note: 'autonomous calibration recommendations; consumers apply with fallback to own defaults',
    recommendations: {
      qnfo_ai_http_timeout_ms: ai ? clamp(Math.round(ai.p95 * 8), 12000, 60000) : PROBE_MS,
      qnfo_ai_burst_warn_ms: ai ? clamp(Math.round(ai.p95 * 4), 1000, 15000) : 3000,
      d1_query_warn_ms: pick('d1-audit') ? clamp(Math.round(pick('d1-audit').p95 * 5), 200, 5000) : 1000
    },
    baselines: base.slice(0, 20).map(function (r) { return { probe: r.probe_id, ema_ms: Math.round(r.ema), p95_ms: Math.round(r.p95), n: r.n }; })
  };
  const prevRaw = await env.KV_CAL.get('latest');
  const prev = jp(prevRaw, null);
  const same = prev && prev.recommendations && JSON.stringify(prev.recommendations) === JSON.stringify(doc.recommendations);
  if (!same) {
    await act(env, runId, 'publish-config', 'latest', 'publish calibration recommendations', prev ? { had: 1 } : { had: 0 }, doc);
    await env.KV_CAL.put('latest', sjs(doc));
    return 1;
  }
  return 0;
}
async function tunePlanWeights(env, runId) {
  const since = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const rows = await env.DB_AUDIT.prepare('SELECT probe_id, COUNT(*) AS n, SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS okn FROM fleet_cal_metrics WHERE measured_at >= ?1 GROUP BY probe_id').bind(since).all();
  const stats = {};
  let tot = 0;
  for (let i = 0; i < (rows.results || []).length; i++) {
    const r = rows.results[i];
    const failRate = r.n > 0 ? 1 - (r.okn || 0) / r.n : 0;
    if (failRate > 0.2) { stats[r.probe_id] = Math.round(failRate * 100) / 100; tot += 1; }
  }
  const prev = jp(await stateGet(env, 'plan_weights'), null);
  if (tot > 0 && JSON.stringify(prev) !== JSON.stringify(stats)) {
    await act(env, runId, 'tune-plan', 'fleet_cal_state.plan_weights', 'weight probes by 7d failure rate', prev, stats);
    await stateSet(env, 'plan_weights', sjs(stats));
    return 1;
  }
  return 0;
}

async function retentionCleanup(env, runId) {
  const cutM = new Date(Date.now() - RETENTION_METRICS_DAYS * DAY_MS).toISOString();
  const cutA = new Date(Date.now() - RETENTION_ANOMALY_DAYS * DAY_MS).toISOString();
  const r1 = await env.DB_AUDIT.prepare('DELETE FROM fleet_cal_metrics WHERE measured_at < ?1').bind(cutM).run();
  const r2 = await env.DB_AUDIT.prepare('DELETE FROM fleet_cal_anomalies WHERE status=?1 AND last_seen < ?2').bind('resolved', cutA).run();
  let r2del = 0;
  try {
    const list = await env.R2_AUDIT.list({ prefix: 'calibration/' });
    const cutR2 = Date.now() - RETENTION_R2_DAYS * DAY_MS;
    for (let i = 0; i < (list.objects || []).length; i++) {
      const o = list.objects[i];
      if (new Date(o.uploaded).getTime() < cutR2) { await env.R2_AUDIT.delete(o.key); r2del++; }
    }
  } catch (e) {}
  const meta = { metrics_del: (r1 && r1.meta && r1.meta.changes) || 0, anomalies_del: (r2 && r2.meta && r2.meta.changes) || 0, r2_del: r2del };
  await act(env, runId, 'retention-cleanup', 'fleet_cal_* + R2 calibration/', 'retention policy', null, meta);
}

// ---- rollback engine: verify previous actions, revert regressions -------------
async function rollbackEngine(env, runId) {
  const acts = await env.DB_AUDIT.prepare('SELECT id, action_type, target, before_json, after_json FROM fleet_cal_actions WHERE verified=0 AND rolled_back=0 ORDER BY id ASC').all();
  const res = (acts.results || []);
  let reverted = 0;
  for (let i = 0; i < res.length; i++) {
    const a = res[i];
    let revert = false; let reason = '';
    if (a.action_type === 'tune-threshold') {
      const parts = String(a.target || '').split('/');
      if (parts.length === 2) {
        const row = await env.DB_AUDIT.prepare('SELECT threshold_mult, ema FROM fleet_cal_baselines WHERE probe_id=?1 AND metric=?2').bind(parts[0], parts[1]).first();
        const after = jp(a.after_json, null);
        if (after && after.threshold_mult && row && Math.abs(row.threshold_mult - after.threshold_mult) > 0.001) {
          const before = jp(a.before_json, null);
          if (before) {
            await env.DB_AUDIT.prepare('UPDATE fleet_cal_baselines SET n=?3, ema=?4, ema2=?5, p95=?6, min=?7, max=?8, threshold_mult=?9, updated_at=?10 WHERE probe_id=?1 AND metric=?2')
              .bind(parts[0], parts[1], before.n || 0, before.ema || 0, before.ema2 || 0, before.p95 || 0, before.min || 0, before.max || 0, before.threshold_mult || 2.0, nowIso()).run();
            revert = true; reason = 'threshold drifted after tune';
          }
        }
      }
    } else if (a.action_type === 'publish-config') {
      const cur = jp(await env.KV_CAL.get('latest'), null);
      if (!cur || !cur.generated_at) { revert = true; reason = 'kv config missing after publish'; }
    }
    if (revert) {
      await env.DB_AUDIT.prepare('UPDATE fleet_cal_actions SET rolled_back=1, rollback_at=?1, rollback_reason=?2 WHERE id=?3').bind(nowIso(), reason, a.id).run();
      await learn(env, runId, 'rollback', 'reverted ' + a.action_type + ' on ' + a.target + ': ' + reason);
      reverted++;
    } else {
      await env.DB_AUDIT.prepare('UPDATE fleet_cal_actions SET verified=1, verified_at=?1 WHERE id=?2').bind(nowIso(), a.id).run();
    }
  }
  return { checked: res.length, reverted: reverted };
}
// ---- self-audit ---------------------------------------------------------------
async function selfAudit(env, runId, metrics, expectedProbes, startedAt) {
  const checks = [];
  const have = {};
  metrics.forEach(function (m) { have[m.probe_id] = 1; });
  const missing = expectedProbes.filter(function (p) { return !have[p]; });
  checks.push({ check: 'completeness', pass: missing.length === 0, detail: missing.length ? 'missing:' + missing.join(',') : 'all-probes-present' });
  let bad = 0;
  metrics.forEach(function (m) {
    if (m.metric === 'latency_ms' || m.metric === 'p95_ms' || m.metric === 'p99_ms') {
      if (!(m.value > 0) || isNaN(m.value)) bad++;
    }
  });
  checks.push({ check: 'integrity', pass: bad === 0, detail: bad ? bad + '-bad-latency' : 'latency-sane' });
  let extreme = 0;
  metrics.forEach(function (m) {
    if (m.metric === 'latency_ms' && m.value > PROBE_MS * 5) extreme++;
    if (m.metric === 'status' && m.value > 0 && (m.value < 100 || m.value > 599)) extreme++;
  });
  checks.push({ check: 'plausibility', pass: extreme === 0, detail: extreme ? extreme + '-implausible' : 'values-plausible' });
  const score = Math.round((checks.filter(function (c) { return c.pass; }).length / checks.length) * 1000) / 1000;
  await learn(env, runId, 'self-audit', 'score=' + score + ' ' + checks.map(function (c) { return c.check + ':' + (c.pass ? 'pass' : 'FAIL ' + c.detail); }).join(' '));
  return { score: score, checks: checks };
}

// ---- main run orchestration ---------------------------------------------------
async function runCalibration(env, type, trigger, simulate) {
  await ensureSchema(env);
  const runId = uid();
  const startedAt = nowIso();
  let status = 'running';
  try {
    await env.DB_AUDIT.prepare('INSERT INTO fleet_cal_runs (run_id,run_type,trigger,started_at,status) VALUES (?1,?2,?3,?4,?5)').bind(runId, type, trigger, startedAt, 'running').run();
  } catch (e) { return { run_id: runId, error: 'insert-run-failed ' + String((e && e.message) || e).slice(0, 200) }; }
  const roll = await rollbackEngine(env, runId);
  const metrics = [];
  const heavy = type === 'stress' || type === 'monthly';
  const isCatchup = type === 'catchup';

  for (let i = 0; i < PROBES.length; i++) {
    const p = PROBES[i];
    if (isCatchup && p.kind !== 'http' && p.kind !== 'd1') continue;
    let rows = [];
    try {
      if (p.kind === 'http') rows = await probeHttp(env, p);
      else if (p.kind === 'd1') rows = await probeD1(env);
      else if (p.kind === 'r2') rows = await probeR2(env);
      else if (p.kind === 'vectorize') rows = await probeVec(env);
    } catch (e) {
      rows = [{ probe_id: p.id, kind: p.kind, target: p.url || p.kind, metric: 'latency_ms', value: 0, ok: 0, detail: 'probe-threw ' + String((e && e.message) || e).slice(0, 120) }];
    }
    const failed = rows.some(function (r) { return r.ok === 0 && !r.detail.includes('(soft)'); });
    if (failed && p.kind === 'http') {
      const retry = await probeHttp(env, p);
      const retryOk = retry.every(function (r) { return r.ok === 1; });
      if (retryOk) rows = retry;
      else rows.forEach(function (r) { if (r.ok === 0) r.detail = (r.detail || '') + ' retry-failed'; });
    }
    metrics.push.apply(metrics, rows);
  }
  if (heavy) {
    const bat = await probeBattery(env);
    const bur = await probeBurst(env);
    metrics.push.apply(metrics, bat);
    metrics.push.apply(metrics, bur);
  }
  if (simulate === 'anomaly') {
    metrics.push({ probe_id: 'sim-anomaly', kind: 'sim', target: 'sim', metric: 'latency_ms', value: EXTREME_MS + 1000, ok: 1, detail: 'simulated' });
  }
  const ins = [];
  metrics.forEach(function (m) {
    ins.push(env.DB_AUDIT.prepare('INSERT INTO fleet_cal_metrics (run_id,probe_id,kind,target,metric,value,ok,detail,measured_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)')
      .bind(runId, m.probe_id, m.kind, String(m.target || '').slice(0, 200), m.metric, m.value || 0, m.ok, String(m.detail || '').slice(0, 300), startedAt));
  });
  if (ins.length) { await env.DB_AUDIT.batch(ins); }
  const tuned = await updateBaselines(env, runId, metrics);
  const anomalies = await detectAnomalies(env, runId, metrics);
  let actions = 0;
  if (!isCatchup) {
    actions += await publishConfig(env, runId);
    if (heavy) { actions += await tunePlanWeights(env, runId); }
  }
  if (type === 'monthly') { await retentionCleanup(env, runId); }
  const audit = await selfAudit(env, runId, metrics, PROBES.map(function (p) { return p.id; }), startedAt);
  const failN = metrics.filter(function (m) { return m.ok === 0 && m.metric === 'latency_ms'; }).length;
  status = audit.score === 1 ? 'complete' : (audit.score >= 0.66 ? 'degraded' : 'partial');
  await env.DB_AUDIT.prepare('UPDATE fleet_cal_runs SET finished_at=?1, status=?2, probe_total=?3, probe_ok=?4, probe_fail=?5, anomalies_found=?6, actions_applied=?7, verdict_score=?8, verdict_json=?9, audit_json=?10 WHERE run_id=?11')
    .bind(nowIso(), status, metrics.length, metrics.length - failN, failN, anomalies, actions + tuned, audit.score, sjs(audit.checks), sjs({ roll: roll, simulate: simulate || null }), runId).run();
  await stateSet(env, 'last_run', sjs({ run_id: runId, type: type, status: status, at: startedAt }));
  return { run_id: runId, type: type, status: status, metrics: metrics.length, anomalies: anomalies, actions: actions + tuned, tuned: tuned, audit: audit.score, roll: roll };
}

// ---- HTTP + scheduled handlers --------------------------------------------------
export default {
  async scheduled(controller, env, ctx) {
    const cron = controller.cron || '';
    let type = 'daily';
    if (cron === '30 3 * * 0') type = 'stress';
    else if (cron === '0 4 1 * *') type = 'monthly';
    const out = await runCalibration(env, type, 'cron:' + cron, null);
    await stateSet(env, 'last_cron', sjs({ cron: cron, type: type, out: out, at: nowIso() }));
    console.log('calibrator-cron', cron, sjs(out).slice(0, 400));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const j = function (o, st) { return new Response(sjs(o), { status: st || 200, headers: { 'Content-Type': 'application/json' } }); };
    if (p === '/health') {
      const o = { ok: true, worker: WORKER, version: VERSION, at: nowIso() };
      try {
        const last = jp(await stateGet(env, 'last_run'), null);
        o.last_run = last;
        const an = await env.DB_AUDIT.prepare('SELECT COUNT(*) AS n FROM fleet_cal_anomalies WHERE status=?1').bind('open').first();
        o.open_anomalies = an ? an.n : 0;
      } catch (e) { o.detail = 'd1-unavailable'; }
      return j(o);
    }
    if (p === '/run' && request.method === 'POST') {
      const key = request.headers.get('X-Run-Key') || '';
      if (!env.RUN_SECRET || !safeEqual(env.RUN_SECRET, key)) return j({ ok: false, error: 'unauthorized' }, 401);
      const type = url.searchParams.get('type') || 'daily';
      const simulate = url.searchParams.get('simulate') || null;
      const out = await runCalibration(env, type, 'manual:' + type + (simulate ? ':' + simulate : ''), simulate);
      return j({ ok: true, run: out });
    }
    if (p === '/diag' && request.method === 'GET') {
      const key = request.headers.get('X-Run-Key') || '';
      if (!env.RUN_SECRET || !safeEqual(env.RUN_SECRET, key)) return j({ ok: false, error: 'unauthorized' }, 401);
      const target = url.searchParams.get('url') || '';
      if (!target || !/^https:\/\//.test(target)) return j({ ok: false, error: 'https-url-required' }, 400);
      const r = await fetcher(target, 'GET', { 'User-Agent': 'Mozilla/5.0' }, null, PROBE_MS);
      return j({ ok: true, target: target, status: r.status, ms: r.ms, body: r.text ? r.text.slice(0, 400) : '', err: r.err || null });
    }
    if (p === '/report' && request.method === 'GET') {
      const key = request.headers.get('X-Run-Key') || '';
      if (!env.RUN_SECRET || !safeEqual(env.RUN_SECRET, key)) return j({ ok: false, error: 'unauthorized' }, 401);
      const runs = await env.DB_AUDIT.prepare('SELECT run_id, run_type, trigger, status, probe_total, probe_fail, anomalies_found, actions_applied, verdict_score, started_at, finished_at FROM fleet_cal_runs ORDER BY started_at DESC LIMIT 15').all();
      const an = await env.DB_AUDIT.prepare('SELECT probe_id, metric, value, severity, first_seen, last_seen, detail FROM fleet_cal_anomalies WHERE status=?1 ORDER BY last_seen DESC LIMIT 20').bind('open').all();
      const base = await env.DB_AUDIT.prepare('SELECT probe_id, metric, n, ema, p95, threshold_mult, updated_at FROM fleet_cal_baselines ORDER BY n DESC LIMIT 30').all();
      const acts = await env.DB_AUDIT.prepare('SELECT action_type, target, reason, applied_at, verified, rolled_back FROM fleet_cal_actions ORDER BY id DESC LIMIT 12').all();
      const learnRows = await env.DB_AUDIT.prepare('SELECT topic, insight, created_at FROM fleet_cal_learnings ORDER BY id DESC LIMIT 12').all();
      return j({ ok: true, worker: WORKER, version: VERSION, runs: (runs.results || []), open_anomalies: (an.results || []), baselines: (base.results || []), recent_actions: (acts.results || []), learnings: (learnRows.results || []) });
    }
    return j({ ok: false, error: 'not-found', worker: WORKER, version: VERSION }, 404);
  }
};




