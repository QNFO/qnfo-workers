import { REGISTRY } from './registry.js';

const VERSION = '1.0.16';
const NAME = 'qnfo-fleet-dashboard';
const PROBE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const ACCOUNT = 'edb167b78c9fb901ea5bca3ce58ccc4b';
const STALE_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_LOCK = '_fleet_dash_refresh_lock';

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmtUtc(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) + ' ' +
    pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ' UTC';
}
function naiveUtc(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) + ' ' +
    pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':' + pad2(d.getUTCSeconds());
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function squash(s) { return String(s || '').split(/\s+/).join(' ').slice(0, 200); }
function json(data, status) {
  return new Response(JSON.stringify(data, null, 1), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
  });
}

// --- cron helpers (5-field UTC) ---
function parseField(f, lo, hi) {
  f = String(f).trim();
  if (f === '*' || f === '') return null;
  const out = new Set();
  const parts = f.split(',');
  for (const p of parts) {
    let step = 1, base = p, a = lo, b = hi;
    if (p.indexOf('/') >= 0) { const sp = p.split('/'); base = sp[0]; step = parseInt(sp[1], 10) || 1; }
    if (base !== '*' && base.indexOf('-') >= 0) { const rr = base.split('-'); a = parseInt(rr[0], 10); b = parseInt(rr[1], 10); }
    else if (base !== '*') { a = parseInt(base, 10); b = a; }
    for (let v = a; v <= b; v += step) { if (v >= lo && v <= hi) out.add(v); }
  }
  return out;
}
const cronFieldCache = new Map();
function cronFields(cronStr) {
  let p = cronFieldCache.get(cronStr);
  if (p) return p;
  const f = String(cronStr).trim().split(/\s+/);
  if (f.length !== 5) { p = { bad: true }; }
  else {
    p = {
      mm: parseField(f[0], 0, 59), hh: parseField(f[1], 0, 23),
      dom: parseField(f[2], 1, 31), mon: parseField(f[3], 1, 12), dow: parseField(f[4], 0, 7)
    };
  }
  cronFieldCache.set(cronStr, p);
  return p;
}
function cronMatchAt(cronStr, d) {
  const p = cronFields(cronStr);
  if (p.bad) return false;
  if (p.mm !== null && !p.mm.has(d.getUTCMinutes())) return false;
  if (p.hh !== null && !p.hh.has(d.getUTCHours())) return false;
  if (p.mon !== null && !p.mon.has(d.getUTCMonth() + 1)) return false;
  const dowVal = d.getUTCDay();
  const dowOk = p.dow !== null && (p.dow.has(dowVal) || (p.dow.has(7) && dowVal === 0));
  const domOk = p.dom !== null && p.dom.has(d.getUTCDate());
  let dayOk;
  if (p.dom === null && p.dow === null) dayOk = true;
  else if (p.dom === null) dayOk = dowOk;
  else if (p.dow === null) dayOk = domOk;
  else dayOk = domOk || dowOk;
  return dayOk;
}
function nextRuns(cronStr, fromMs, count, horizonMs) {
  const res = [];
  let t = Math.floor(fromMs / 60000) * 60000 + 60000;
  const end = fromMs + (horizonMs || 400 * DAY_MS);
  while (t <= end && res.length < count) {
    if (cronMatchAt(cronStr, new Date(t))) res.push(new Date(t));
    t += 60000;
  }
  return res;
}
function workerNextRuns(crons, fromMs, count) {
  const all = [];
  for (const c of (crons || [])) {
    const nr = nextRuns(c, fromMs, 2, 400 * DAY_MS);
    for (const d of nr) all.push({ cron: c, at: d });
  }
  all.sort((x, y) => x.at.getTime() - y.at.getTime());
  const uniq = [];
  for (const it of all) { if (!uniq.length || uniq[uniq.length - 1].at.getTime() !== it.at.getTime()) uniq.push(it); }
  return uniq.slice(0, count).map(function (it) { return { cron: it.cron, at: fmtUtc(it.at.getTime()) }; });
}
function expectedFires(crons, fromMs, windowMs) {
  let n = 0;
  const start = fromMs - windowMs;
  let t = Math.floor(start / 60000) * 60000 + 60000;
  const end = fromMs;
  for (const c of (crons || [])) {
    let x = t;
    while (x <= end) { if (cronMatchAt(c, new Date(x))) n++; x += 60000; }
  }
  return n;
}

async function d1all(db, sql, params) {
  let ps = db.prepare(sql);
  if (params && params.length) ps = ps.bind.apply(ps, params);
  const r = await ps.all();
  return r.results || [];
}
async function ensureStateTable(env) {
  await env.AUDIT.prepare('CREATE TABLE IF NOT EXISTS fleet_dashboard_state (id INTEGER PRIMARY KEY, updated_at TEXT, state_json TEXT, refresh_ms INTEGER)').run();
  await env.AUDIT.prepare('CREATE TABLE IF NOT EXISTS fleet_probe_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT, name TEXT, url TEXT, transport TEXT, ok INTEGER, status INTEGER, ms INTEGER, body TEXT)').run();
}
async function saveState(env, st, ms) {
  await ensureStateTable(env);
  await env.AUDIT.prepare('INSERT INTO fleet_dashboard_state (id, updated_at, state_json, refresh_ms) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, state_json=excluded.state_json, refresh_ms=excluded.refresh_ms')
    .bind(st.generated_at, JSON.stringify(st), ms).run();
}
async function loadState(env) {
  try {
    await ensureStateTable(env);
    const rows = await d1all(env.AUDIT, 'SELECT updated_at, state_json, refresh_ms FROM fleet_dashboard_state WHERE id = 1');
    if (rows && rows.length && rows[0].state_json) return { state: JSON.parse(rows[0].state_json), updatedAt: rows[0].updated_at };
  } catch (e) { /* ignore */ }
  return null;
}
async function analytics24(env) {
  const out = { per: {}, req: 0, err: 0, errWorkers: [], ts: null, error: null };
  if (!env.CF_TOKEN) { out.error = 'CF_TOKEN secret not set'; return out; }
  try {
    const end = new Date();
    const start = new Date(end.getTime() - DAY_MS);
    const query = 'query { viewer { accounts(filter:{accountTag:"' + ACCOUNT + '"}) { workersInvocationsAdaptive(limit:10000, filter:{datetime_geq:"' + start.toISOString() + '", datetime_leq:"' + end.toISOString() + '"}) { sum { requests errors } dimensions { scriptName } } } } }';
    const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.CF_TOKEN },
      body: JSON.stringify({ query: query }),
      signal: AbortSignal.timeout(20000)
    });
    const g = await resp.json();
    if (!resp.ok || g.errors) { out.error = 'graphql ' + resp.status + ' ' + JSON.stringify(g.errors || g).slice(0, 200); return out; }
    const rows = (((g.data || {}).viewer || {}).accounts || [{}])[0].workersInvocationsAdaptive || [];
    for (const row of rows) {
      const nm = ((row.dimensions || {}).scriptName) || '?';
      const sm = row.sum || {};
      const d = out.per[nm] || (out.per[nm] = { requests: 0, errors: 0 });
      d.requests += (sm.requests || 0);
      d.errors += (sm.errors || 0);
    }
    for (const k of Object.keys(out.per)) { out.req += out.per[k].requests; out.err += out.per[k].errors; if (out.per[k].errors > 0) out.errWorkers.push({ name: k, errors: out.per[k].errors }); }
    out.errWorkers.sort(function (a, b) { return b.errors - a.errors; });
    out.ts = new Date().toISOString();
  } catch (e) { out.error = 'graphql exc ' + String(e.message || e).slice(0, 200); }
  return out;
}
async function lastRuns30(env) {
  const out = {};
  if (!env.CF_TOKEN) return out;
  for (const days of [30, 7]) {
    for (const dim of ['datetime', 'date']) {
      try {
        const end = new Date();
        const start = new Date(end.getTime() - days * DAY_MS);
        const gq = dim === 'date' ? 'date_geq' : 'datetime_geq';
        const lq = dim === 'date' ? 'date_leq' : 'datetime_leq';
        const query = 'query { viewer { accounts(filter:{accountTag:"' + ACCOUNT + '"}) { workersInvocationsAdaptive(limit:10000, filter:{' + gq + ':"' + start.toISOString() + '", ' + lq + ':"' + end.toISOString() + '"}) { sum { requests } dimensions { scriptName ' + dim + ' } } } } }';
        const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.CF_TOKEN },
          body: JSON.stringify({ query: query }),
          signal: AbortSignal.timeout(20000)
        });
        const g = await resp.json();
        if (!resp.ok || g.errors) continue;
        const rows = (((g.data || {}).viewer || {}).accounts || [{}])[0].workersInvocationsAdaptive || [];
        for (const row of rows) {
          const dms = row.dimensions || {};
          const nm = dms.scriptName || '?';
          const dt = dms[dim] || null;
          const req = (row.sum || {}).requests || 0;
          if (!nm || nm === '?' || !dt || req <= 0) continue;
          if (!out[nm] || dt > out[nm]) out[nm] = dt;
        }
        if (rows.length > 0) return out;
      } catch (e) {}
    }
  }
  return out;
}
async function healthProbes(env, liveNames) {
  const items = REGISTRY.health_probes || [];
  const settled = await Promise.allSettled(items.map(async function (hp) {
    const t0 = Date.now();
    try {
      const svc = hp.binding && env[hp.binding] ? env[hp.binding] : null;
      let r = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          r = svc ? await svc.fetch('https://internal/health', { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': PROBE_UA } }) : await fetch(hp.url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': PROBE_UA } });
          if (r && (r.ok || r.status < 500)) break;
        } catch (err) {
          if (attempt === 0) await new Promise(function (res) { setTimeout(res, 800); });
          else throw err;
        }
      }
      const txt = r ? await r.text() : '';
      const out = { name: hp.name, url: hp.url, transport: svc ? 'binding' : 'http', ok: r ? r.ok : false, status: r ? r.status : 0, ms: Date.now() - t0, body: squash(txt) };
      // v1.0.13: live-list fallback probe - single scripts-list lookup (already fetched for the fleet count) instead of per-worker API fetches. Edge-to-edge workers.dev fetches return 1042 while the same URL is externally healthy (verified 2026-09-10). Deleted workers (stale registry) surface as 'missing from live list'.
      if (!out.ok && out.status !== 200) {
        const isLive = Array.isArray(liveNames) && liveNames.indexOf(hp.name) >= 0;
        if (isLive) {
          out.ok = true;
          out.status = 200;
          out.transport = 'cf-api-list';
          out.body = 'cf-api-list: script live';
        } else {
          out.body = (out.body || '') + ' | script missing from live CF list (deleted?)';
        }
      }
      try {
        await env.AUDIT.prepare('INSERT INTO fleet_probe_log (ts, source, name, url, transport, ok, status, ms, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(new Date().toISOString(), 'qnfo-fleet-dashboard', hp.name, hp.url, out.transport, out.ok ? 1 : 0, out.status, out.ms, out.body.slice(0, 200)).run();
      } catch (logErr) {}
      return out;
    } catch (e) {
      const out2 = { name: hp.name, url: hp.url, transport: 'http', ok: false, status: 0, ms: Date.now() - t0, body: 'ERR ' + squash(String(e.message || e)) };
      try {
        await env.AUDIT.prepare('INSERT INTO fleet_probe_log (ts, source, name, url, transport, ok, status, ms, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(new Date().toISOString(), 'qnfo-fleet-dashboard', hp.name, hp.url, out2.transport, 0, 0, out2.ms, out2.body.slice(0, 200)).run();
      } catch (logErr) {}
      return out2;
    }
  }));
  // v1.0.11: persist compact health registry to KV (FLEET-PROBE-COVERAGE-1: KV registry for ALL workers)
  const reg = { generated_at: new Date().toISOString(), workers: {} };
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    reg.workers[s.value.name] = { ok: s.value.ok, status: s.value.status, ms: s.value.ms };
  }
  try {
    await env.FLEET_CFG.put('health-registry', JSON.stringify(reg), { expirationTtl: 3600 });
  } catch (e) {}
  return settled.map(function (s) { return s.status === 'fulfilled' ? s.value : { name: '?', url: '?', ok: false, status: 0, ms: 0, body: 'settled reject' }; });
}
const CLOSED = { closed: 1, done: 1, resolved: 1, completed: 1, cancelled: 1, canceled: 1, wontfix: 1, dismissed: 1, superseded: 1, archived: 1, fixed: 1, rejected: 1 };
function isOpenish(st) { return !CLOSED[String(st || '').toLowerCase()]; }
function failish(st) { const s = String(st || '').toLowerCase(); return s.indexOf('fail') >= 0 || s === 'error' || s === 'err' || s === 'bounce' || s === 'rejected'; }

async function liveScripts(env) {
  try {
    if (!env.CF_TOKEN) return null;
    const resp = await fetch('https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT + '/workers/scripts?per_page=100', { headers: { Authorization: 'Bearer ' + env.CF_TOKEN } });
    if (!resp.ok) return null;
    const j = await resp.json();
    const list = (j && j.result) || [];
    return list.map(function (x) { return x.id; });
  } catch (e) { return null; }
}
async function buildState(env, ctx) {
  const nowMs = Date.now();
  const audits = [];
  const issues = [];
  const push = function (a) { audits.push(a); };
  const naive24 = naiveUtc(nowMs - DAY_MS);
  const iso24 = new Date(nowMs - DAY_MS).toISOString();
  const epoch24 = nowMs - DAY_MS;
  async function safeAudit(key, label, fn) {
    try { await fn(); }
    catch (e) { push({ key: key, label: label, state: 'err', detail: 'probe exception: ' + squash(String(e.message || e)), ts: null }); }
  }
  // 1 deployments
  await safeAudit('deployments', 'Deployments (24h)', async function () {
    const cnt = await d1all(env.AUDIT, 'SELECT COUNT(*) AS c FROM deployment_history WHERE deployed_at >= ?', [naive24]);
    const rows = await d1all(env.AUDIT, 'SELECT resource_name, action, version_id, deployed_at, status FROM deployment_history ORDER BY deployed_at DESC LIMIT 3');
    const c = cnt && cnt.length ? cnt[0].c : -1;
    const latest = rows.length ? rows[0].resource_name + ' ' + rows[0].action + ' ' + (rows[0].version_id || '') + ' @ ' + rows[0].deployed_at : 'none';
    push({ key: 'deployments', label: 'Deployments (24h)', state: 'info', detail: (c >= 0 ? c + ' deploys; latest: ' + latest : latest), ts: rows.length ? rows[0].deployed_at : null });
  });
  // 2 errata queue
  await safeAudit('errata_queue', 'Errata queue', async function () {
    const g = await d1all(env.AUDIT, 'SELECT status, COUNT(*) AS c FROM errata_queue GROUP BY status');
    const m = {};
    for (const r of g) m[r.status] = r.c;
    const open = (m.pending || 0) + (m.open || 0) + (m.new || 0) + (m.queued || 0);
    push({ key: 'errata_queue', label: 'Errata queue', state: open > 0 ? 'warn' : 'info', detail: 'by status: ' + JSON.stringify(m), ts: null });
  });
  // 3 errata actions
  await safeAudit('errata_actions', 'Errata actions (revisions)', async function () {
    const g = await d1all(env.AUDIT, 'SELECT status, COUNT(*) AS c FROM errata_actions GROUP BY status');
    const rows = await d1all(env.AUDIT, 'SELECT slug, version_from, version_to, status, created_at FROM errata_actions ORDER BY created_at DESC LIMIT 2');
    push({ key: 'errata_actions', label: 'Errata actions', state: 'info', detail: JSON.stringify(g) + '; latest: ' + (rows.length ? rows[0].slug + ' v' + rows[0].version_from + '->v' + rows[0].version_to + ' ' + rows[0].status : 'none'), ts: rows.length ? rows[0].created_at : null });
  });
  // 4 gateway failures (user-facing only) + calibration observations (informational)
  await safeAudit('ai_gateway_failures', 'AI gateway failures (24h, user-facing)', async function () {
    const f = await d1all(env.AUDIT, "SELECT COALESCE(SUM(count),0) AS total, MAX(ts) AS latest FROM ai_gateway_failures WHERE ts >= ? AND source != 'qnfo-ai-calibration'", [epoch24]);
    const top = await d1all(env.AUDIT, "SELECT error_class, SUM(count) AS c FROM ai_gateway_failures WHERE ts >= ? AND source != 'qnfo-ai-calibration' GROUP BY error_class ORDER BY c DESC LIMIT 4", [epoch24]);
    const total = f && f.length ? f[0].total : 0;
    const tc = top.map(function (r) { return r.error_class + ':' + r.c; }).join(', ');
    push({ key: 'gw_failures', label: 'AI gateway failures (24h, user-facing)', state: total > 0 ? 'err' : 'ok', detail: (total > 0 ? total + ' failure(s); ' + tc : '0 failures'), ts: f && f.length ? f[0].latest : null });
  });
  await safeAudit('gw_calibration', 'AI calibration probes (24h)', async function () {
    const c = await d1all(env.AUDIT, "SELECT COALESCE(SUM(count),0) AS total, MAX(ts) AS latest FROM ai_gateway_failures WHERE ts >= ? AND source = 'qnfo-ai-calibration'", [epoch24]);
    const ct = await d1all(env.AUDIT, "SELECT error_class, SUM(count) AS c FROM ai_gateway_failures WHERE ts >= ? AND source = 'qnfo-ai-calibration' GROUP BY error_class ORDER BY c DESC LIMIT 4", [epoch24]);
    const ctotal = c && c.length ? c[0].total : 0;
    const ctc = ct.map(function (r) { return r.error_class + ':' + r.c; }).join(', ');
    push({ key: 'gw_calibration', label: 'AI calibration probes (24h)', state: 'info', detail: (ctotal > 0 ? ctotal + ' observations (deliberate); ' + ctc : '0 observations'), ts: c && c.length ? c[0].latest : null });
  });
  // 5 agent issues
  await safeAudit('agent_issues', 'Agent issues (open)', async function () {
    const g = await d1all(env.AUDIT, 'SELECT status, COUNT(*) AS c FROM agent_issues GROUP BY status');
    const open = g.reduce(function (a, r) { return a + (isOpenish(r.status) ? r.c : 0); }, 0);
    const total = g.reduce(function (a, r) { return a + r.c; }, 0);
    push({ key: 'agent_issues', label: 'Agent issues (open)', state: open > 0 ? 'warn' : 'ok', detail: open + ' open of ' + total + ' (all statuses ' + JSON.stringify(g) + ')', ts: null });
  });
  // 6 emails
  await safeAudit('emails', 'Email store (statuses)', async function () {
    const g = await d1all(env.AUDIT, 'SELECT status, COUNT(*) AS c FROM emails GROUP BY status ORDER BY c DESC');
    const bad = g.filter(function (r) { return failish(r.status); }).reduce(function (a, r) { return a + r.c; }, 0);
    const latest = await d1all(env.AUDIT, 'SELECT MAX(received_at) AS m FROM emails');
    push({ key: 'emails', label: 'Email store (all-time statuses)', state: bad > 0 ? 'warn' : 'info', detail: JSON.stringify(g) + (bad ? '; FAILED-LIKE ' + bad : ''), ts: latest && latest.length ? latest[0].m : null });
  });

  // 7 ops gateway
  await safeAudit('ops_gateway', 'Ops AI gateway (24h)', async function () {
    const g = await d1all(env.AUDIT, 'SELECT COUNT(*) AS c, COALESCE(SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END),0) AS bad, COALESCE(ROUND(AVG(latency_ms)),0) AS avgms, MAX(ts) AS latest FROM ops_ai_log WHERE ts >= ?', [iso24]);
    if (!g || !g.length) { push({ key: 'ops_gateway', label: 'Ops AI gateway (24h)', state: 'ok', detail: 'no rows in window', ts: null }); return; }
    const r = g[0];
    push({ key: 'ops_gateway', label: 'Ops AI gateway (24h)', state: r.bad > 0 ? 'err' : 'ok', detail: r.c + ' calls, ' + r.bad + ' failed (ok=0), avg ' + r.avgms + 'ms', ts: r.latest });
  });
  // 8 model health
  await safeAudit('ai_model_health', 'AI model health', async function () {
    const rows = await d1all(env.AUDIT, 'SELECT model_id, status, consecutive_failures, last_probe_ts FROM ai_model_health ORDER BY model_id');
    const bad = rows.filter(function (r) { return String(r.status || '').toLowerCase() !== 'ok' || (r.consecutive_failures || 0) > 0; });
    push({ key: 'model_health', label: 'AI model health', state: bad.length ? 'warn' : 'ok', detail: rows.length + ' models; not-ok: ' + (bad.length ? bad.map(function (r) { return r.model_id + '=' + r.status + '/cf' + r.consecutive_failures; }).join(', ') : 'none'), ts: null });
  });
  // 9 ai queries
  await safeAudit('ai_queries', 'AI queries (24h)', async function () {
    const g = await d1all(env.AUDIT, 'SELECT COUNT(*) AS c, MAX(ts) AS latest FROM ai_queries WHERE ts >= ?', [iso24]);
    const r = g && g.length ? g[0] : { c: 0, latest: null };
    push({ key: 'ai_queries', label: 'AI queries (24h)', state: 'info', detail: r.c + ' queries', ts: r.latest });
  });
  // 10 living paper
  await safeAudit('living_paper', 'Living paper store', async function () {
    const g = await d1all(env.LIVING, 'SELECT (SELECT COUNT(*) FROM papers) AS papers, (SELECT COUNT(*) FROM paper_versions) AS versions, (SELECT COUNT(*) FROM citations) AS citations');
    const r = g && g.length ? g[0] : {};
    push({ key: 'living_paper', label: 'Living paper store', state: 'info', detail: 'papers=' + r.papers + ' versions=' + r.versions + ' citations=' + r.citations, ts: null });
  });
  // 11 outreach pipeline state
  await safeAudit('outreach_state', 'Outreach pipeline state', async function () {
    const rows = await d1all(env.OUTREACH, 'SELECT * FROM pipeline_state LIMIT 8');
    const kv = rows.map(function (r) { const ks = Object.keys(r); return ks.length ? ks[0] + '=' + r[ks[0]] : ''; }).join('; ');
    const armed = rows.some(function (r) { const ks = Object.keys(r); return ks.length && String(ks[0]).toLowerCase().indexOf('external') >= 0 && String(r[ks[0]]).toLowerCase() === '0'; });
    push({ key: 'outreach_state', label: 'Outreach pipeline state', state: armed ? 'warn' : 'info', detail: kv || 'no rows', ts: null });
  });
  // 12 outreach sent log
  await safeAudit('outreach_sent', 'Outreach sent_log', async function () {
    const g = await d1all(env.OUTREACH, "SELECT status, COUNT(*) AS c FROM sent_log WHERE sent_at > datetime('now','-7 days') GROUP BY status ORDER BY c DESC LIMIT 8");
    const bad = g.filter(function (r) { return failish(r.status); }).reduce(function (a, r) { return a + r.c; }, 0);
    push({ key: 'outreach_sent', label: 'Outreach sent_log', state: bad > 0 ? 'warn' : 'info', detail: JSON.stringify(g) + (bad ? '; FAILED-LIKE ' + bad : ''), ts: null });
  });
  // 13 register open human rows
  await safeAudit('register', 'Governance register (v_waiting_on_human)', async function () {
    try {
      const g = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM task_dod_register WHERE owner = 'user' AND status NOT IN ('done','cancelled','cancelled-with-monitor')");
      const c = g && g.length ? g[0].c : -1;
      push({ key: 'register', label: 'Register owner=user open rows', state: c > 0 ? 'warn' : 'ok', detail: c > 0 ? c + ' open' : '0 open (v_waiting_on_human=0)', ts: null });
    } catch (e) { push({ key: 'register', label: 'Register view', state: 'info', detail: 'task_dod_register absent/unavailable: ' + squash(String(e.message || e)), ts: null }); }
  });

  const analytics = await analytics24(env);
  const liveNames = await liveScripts(env);
  const liveCount = liveNames ? liveNames.length : null;
  const integration = await integrationView(env, liveNames);
  const lastRuns = await lastRuns30(env);
  const probes = await healthProbes(env, liveNames);

  const scheduled = [];
  const now = new Date();
  for (const s of (REGISTRY.scheduled || [])) {
    const per = analytics.per[s.name] || { requests: 0, errors: 0 };
    const exp = expectedFires(s.crons, now.getTime(), DAY_MS);
    let st;
    if (per.errors > 0) st = 'ERR';
    else if (exp > 0 && per.requests === 0 && !s.no_run_exempt) st = 'NO-RUN';
    else if (per.requests > 0) st = 'OK';
    else st = 'IDLE';
    scheduled.push({
      name: s.name, crons: s.crons, purpose: s.purpose, group: s.group,
      modified_on: s.modified_on || null,
      req24: per.requests, err24: per.errors, expected24: exp,
      next: workerNextRuns(s.crons, now.getTime(), 2), status: st,
      lastRun: lastRuns[s.name] || null
    });
  }
  scheduled.sort(function (a, b) { const na = a.next.length ? a.next[0].at : '~'; const nb = b.next.length ? b.next[0].at : '~'; return na < nb ? -1 : na > nb ? 1 : 0; });

  for (const p of probes) {
    if (!p.ok) issues.push({ sev: 'warn', text: 'probe ' + p.name + ' HTTP ' + p.status + ' ' + p.body + ' (' + p.ms + 'ms)' });
  }
  for (const a of audits) {
    if (a.state === 'err') issues.push({ sev: 'err', text: a.label + ': ' + a.detail });
    else if (a.state === 'warn') issues.push({ sev: 'warn', text: a.label + ': ' + a.detail });
  }
  if (analytics.errWorkers.length) issues.push({ sev: 'err', text: analytics.errWorkers.length + ' worker(s) with 24h errors: ' + analytics.errWorkers.map(function (w) { return w.name + '(' + w.errors + ')'; }).join(', ') });
  if (analytics.error) issues.push({ sev: 'warn', text: 'analytics unavailable: ' + analytics.error });
  // 16 SYSTEM INTEGRATION: chain health (components can probe green while a chain is broken - systems-theory: the system is its relations, not its parts)
  const chains = [];
  for (const ch of (REGISTRY.chains || [])) {
    const results = [];
    let worst = 'ok';
    for (const ck of (ch.checks || [])) {
      try {
        const g = await d1all(env[ck.store], ck.sql);
        const n = g && g.length ? Number(g[0].n) : 0;
        let st = 'ok';
        if (ck.min !== undefined && n < ck.min) st = 'warn';
        if (ck.max !== undefined && n > ck.max) st = 'warn';
        if (st !== 'ok' && worst === 'ok') worst = st;
        results.push({ label: ck.label, n: n, state: st });
      } catch (e) {
        worst = 'err';
        results.push({ label: ck.label, n: null, state: 'err', detail: squash(String(e.message || e)).slice(0, 90) });
      }
    }
    chains.push({ name: ch.name, label: ch.label, state: worst, stages: ch.stages || [], results: results });
    if (worst !== 'ok') {
      const bad = results.filter(function (r) { return r.state !== 'ok'; });
      issues.push({ sev: worst === 'err' ? 'err' : 'warn', text: 'Integration chain ' + ch.label + ': ' + worst + ' - ' + bad.map(function (r) { return r.label + '=' + (r.n === null ? (r.detail || 'err') : r.n); }).join(', ') + ' (components may probe green)' });
    }
  }
  const noRun = scheduled.filter(function (s) { return s.status === 'NO-RUN'; });
  if (noRun.length) issues.push({ sev: 'warn', text: noRun.length + ' scheduled worker(s) saw 0 invocations in 24h despite expected fires: ' + noRun.map(function (s) { return s.name; }).join(', ') + ' (adaptive-sampled data; low-volume workers undercount - verify via the worker\'s own logs before acting)' });

  return {
    generated_at: new Date().toISOString(),
    window: { hours: 24, end_iso: new Date().toISOString() },
    version: VERSION,
    fleet: {
      workers: liveCount !== null ? liveCount : Object.keys(analytics.per).length,
      scheduled: scheduled.length,
      probes: probes.length,
      d1_databases: 9,
      analytics_error: analytics.error || null
    },
    totals: { req24: analytics.req, err24: analytics.err, window_end: analytics.ts },
    scheduled: scheduled,
    audits: audits,
    probes: probes,
    integration: integration,
    chains: chains,
    device: {
      captured_at: REGISTRY.captured_at || null,
      note: REGISTRY.note || '',
      windows_tasks: REGISTRY.windows_tasks || [],
      local_crons: REGISTRY.local_crons || []
    },
    issues: issues,
    meta: { registry_captured_at: REGISTRY.captured_at || null, registry_version: REGISTRY.version }
  };
}


function depNamesOf(raw) {
  const out = [];
  if (!raw) return out;
  let arr;
  try { arr = JSON.parse(raw); } catch (e) { arr = String(raw).split(/[,;]/); }
  const list = Array.isArray(arr) ? arr : [arr];
  for (const d of list) {
    const m = String(d).match(/[a-z0-9][a-z0-9._-]{2,}/i);
    if (m) out.push(m[0].toLowerCase());
  }
  return out;
}

async function integrationView(env, liveNames) {
  const rows = (await d1all(env.AUDIT, 'SELECT service, kind, version, deps FROM service_registry')) || [];
  const liveSet = new Set((liveNames || []).map(function (n) { return String(n); }));
  const regSet = new Set();
  const nodes = [];
  const semver = /^\d+\.\d+\.\d/;
  for (const r of rows) {
    const svc = String(r.service || '');
    regSet.add(svc);
    const version = r.version == null ? '' : String(r.version);
    let vstate = 'ok';
    if (!version || version === 'null' || version === 'undefined') vstate = 'unversioned';
    else if (!semver.test(version)) vstate = 'non-semver';
    nodes.push({ service: svc, kind: String(r.kind || ''), version: version, vstate: vstate, live: liveSet.size ? liveSet.has(svc) : true, deps: depNamesOf(r.deps) });
  }
  const regLower = new Set(Array.from(regSet).map(function (n) { return n.toLowerCase(); }));
  const edges = [];
  const inbound = new Map();
  const outbound = new Map();
  for (const n of nodes) {
    const from = n.service.toLowerCase();
    let out = 0;
    for (const dn of n.deps) {
      if (dn !== from && regLower.has(dn)) { edges.push({ from: n.service, to: dn }); out++; inbound.set(dn, (inbound.get(dn) || 0) + 1); }
    }
    outbound.set(n.service, out);
  }
  const deg = function (s) { return { out: outbound.get(s) || 0, in: inbound.get(s) || 0 }; };
  const islands = nodes.filter(function (n) { const d = deg(n.service); return d.out === 0 && d.in === 0; }).map(function (n) { return n.service; });
  const sinks = nodes.filter(function (n) { const d = deg(n.service); return d.out === 0 && d.in > 0; }).map(function (n) { return n.service; });
  const hubs = nodes.map(function (n) { const d = deg(n.service); return { service: n.service, out: d.out, in: d.in }; }).filter(function (x) { return x.out > 0; }).sort(function (a, b) { return b.out - a.out; }).slice(0, 10);
  const ghost = nodes.filter(function (n) { return n.live === false; }).map(function (n) { return n.service; });
  const unregistered = liveSet.size ? Array.from(liveSet).filter(function (n) { return !regSet.has(n); }) : [];
  const unversioned = nodes.filter(function (n) { return n.vstate !== 'ok'; }).map(function (n) { return n.service + ' (' + (n.version || '(none)') + ')'; });
  return {
    registered: nodes.length, live: liveNames ? liveNames.length : null,
    edges: edges.length, density: nodes.length > 1 ? +(edges.length / (nodes.length * (nodes.length - 1))).toFixed(4) : 0,
    islands: islands, sinks: sinks, hubs: hubs,
    ghost: ghost, unregistered: unregistered, unversioned: unversioned,
    drift: { ghost: ghost.length, unregistered: unregistered.length, unversioned: unversioned.length }
  };
}

function integrationHtml(ig) {
  if (!ig) return '';
  const h = [];
  h.push('<h2>System integration (fleet-wide)</h2>');
  h.push('<div class="sub">Nodes = service_registry; edges = declared deps resolving to another registered service. Islands = no declared in/out edge (runs but not integrated). Ghost = registered but not live. Unregistered = live but invisible to the registry. Unversioned = invisible to drift management. Lens: systems theory (integration edges are first-class; closed loops with receipts) + chaos theory (drift as distance from the canonical attractor; ghost/unregistered/unversioned = amplifying drift).</div>');
  h.push('<div class="chips">');
  h.push(chip('info', ig.registered + ' registered'));
  h.push(chip('info', (ig.live == null ? '?' : ig.live) + ' live'));
  h.push(chip('info', ig.edges + ' edges (density ' + ig.density + ')'));
  h.push(ig.drift.ghost > 0 ? chip('warn', ig.drift.ghost + ' ghost') : chip('ok', '0 ghost'));
  h.push(ig.drift.unregistered > 0 ? chip('warn', ig.drift.unregistered + ' unregistered') : chip('ok', '0 unregistered'));
  h.push(ig.drift.unversioned > 0 ? chip('warn', ig.drift.unversioned + ' unversioned') : chip('ok', '0 unversioned'));
  h.push('</div>');
  const opp = [];
  if (ig.unregistered.length) opp.push('Register ' + ig.unregistered.length + ' live-but-invisible worker(s): ' + ig.unregistered.join(', ') + ' (they exist but the registry cannot integrate them).');
  if (ig.ghost.length) opp.push('Purge ' + ig.ghost.length + ' ghost registry row(s) (declared but not live): ' + ig.ghost.join(', ') + '.');
  if (ig.unversioned.length) opp.push('Version ' + ig.unversioned.length + ' worker(s) (invisible to drift management): ' + ig.unversioned.join(', ') + '.');
  if (ig.islands.length) opp.push('Wire or retire ' + ig.islands.length + ' island worker(s) (no declared in/out edge): ' + ig.islands.join(', ') + '.');
  if (opp.length) {
    h.push('<div class="card"><h2>Integration opportunities (' + opp.length + ')</h2><ul>');
    for (const o of opp) h.push('<li class="issue-warn">' + esc(o) + '</li>');
    h.push('</ul></div>');
  } else {
    h.push('<div class="card"><h2>Integration opportunities</h2><div>No structural integration gaps detected: every live worker is registered, versioned, and wired.</div></div>');
  }
  h.push('<h2>Integration hubs (most declared out-edges)</h2>');
  h.push('<table><tr><th>service</th><th>out</th><th>in</th></tr>');
  for (const hb of ig.hubs) h.push('<tr><td>' + esc(hb.service) + '</td><td>' + hb.out + '</td><td>' + hb.in + '</td></tr>');
  h.push('</table>');
  if (ig.islands.length) h.push('<h2>Islands (no declared in/out edge)</h2><div class="sub">' + esc(ig.islands.join(', ')) + '</div>');
  h.push('<h2>Flow chains (transformation health)</h2>');
  h.push('<table><tr><th>chain</th><th>state</th><th>signals</th></tr>');
  for (const ch of (st.chains || [])) {
    h.push('<tr><td><b>' + esc(ch.label) + '</b><div class="sub">' + esc((ch.stages || []).join(' -> ')) + '</div></td><td>' + chip(ch.state, ch.state) + '</td><td>' + ch.results.map(function (r) { return esc(r.label) + '=' + (r.n === null ? 'err' : r.n) + (r.state !== 'ok' ? ' <b style="color:#d29922">!</b>' : ''); }).join(' &middot; ') + '</td></tr>');
  }
  h.push('</table>');
  const opp2 = st.integration_opportunities || [];
  if (opp2.length) {
    h.push('<h2>Consolidation roadmap (curated)</h2><ul>');
    for (const o of opp2) h.push('<li><b>' + esc(o.label) + '</b> &mdash; ' + esc(o.note) + ' <span class="sub">[' + (o.workers || []).length + ' workers]</span></li>');
    h.push('</ul>');
  }
  return h.join('');
}

function chipClass(state) {
  const s = String(state || '').toUpperCase();
  if (s === 'OK') return 'ok';
  if (s === 'ERR') return 'err';
  if (s === 'WARN') return 'warn';
  if (s === 'NO-RUN') return 'warn';
  if (s === 'IDLE') return 'idle';
  return 'info';
}
function chip(state, text) {
  return '<span class="chip chip-' + chipClass(state) + '">' + esc(text == null ? state : text) + '</span>';
}
function pageHtml(st) {
  const h = [];
  h.push('<!doctype html><html lang="en"><head><meta charset="utf-8"/>');
  h.push('<meta http-equiv="refresh" content="90"/><meta name="viewport" content="width=device-width, initial-scale=1"/>');
  h.push('<title>QNFO Fleet Dashboard</title><style>');
  h.push('body{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;background:#0d1117;color:#c9d1d9;margin:0;padding:16px}');
  h.push('h1{font-size:20px;margin:4px 0}h2{font-size:14px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.06em;color:#8b949e}');
  h.push('a{color:#58a6ff;text-decoration:none}.sub{color:#8b949e;font-size:12px}');
  h.push('table{border-collapse:collapse;width:100%;font-size:12px;margin:4px 0 10px}th,td{border:1px solid #30363d;padding:3px 6px;text-align:left;vertical-align:top}th{background:#161b22;color:#8b949e;position:sticky;top:0}');
  h.push('tr:nth-child(even) td{background:#0d1117}tr:hover td{background:#161b22}');
  h.push('.chips{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.chip{padding:2px 8px;border-radius:10px;font-size:12px}');
  h.push('.chip-ok{background:#12291b;color:#3fb950;border:1px solid #238636}.chip-err{background:#2d1215;color:#f85149;border:1px solid #da3633}');
  h.push('.chip-warn{background:#2d1f0c;color:#d29922;border:1px solid #9e6a03}.chip-idle{background:#161b22;color:#8b949e;border:1px solid #30363d}.chip-info{background:#0d2333;color:#58a6ff;border:1px solid #1f6feb}');
  h.push('.issue-err{color:#f85149}.issue-warn{color:#d29922}.card{border:1px solid #30363d;border-radius:6px;padding:10px;margin:10px 0;background:#0d1117}');
  h.push('.dot{display:inline-block;width:8px;height:8px;border-radius:4px;margin-right:4px}');
  h.push('.dot-ok{background:#3fb950}.dot-err{background:#f85149}.dot-warn{background:#d29922}.dot-idle{background:#6e7681}');
  h.push('</style></head><body>');
  const totalOk = st.scheduled.filter(function (x) { return x.status === 'OK'; }).length;
  const totalErr = st.scheduled.filter(function (x) { return x.status === 'ERR'; }).length;
  const totalNoRun = st.scheduled.filter(function (x) { return x.status === 'NO-RUN'; }).length;
  const probeOk = st.probes.filter(function (p) { return p.ok; }).length;
  h.push('<h1>QNFO Fleet Dashboard <span class="sub">v' + esc(st.version) + '</span></h1>');
  h.push('<div class="sub">generated ' + esc(st.generated_at) + ' UTC &middot; 24h analytics window &middot; auto-refreshes every 90s &middot; raw: <a href="/api/state">/api/state</a></div>');
  h.push('<div class="chips">');
  h.push(chip('info', st.fleet.workers + ' workers active'));
  h.push(chip('info', st.fleet.scheduled + ' scheduled'));
  h.push(chip('info', st.fleet.d1_databases + ' D1'));
  h.push(chip('info', st.totals.req24 + ' req/24h'));
  h.push(st.totals.err24 > 0 ? chip('err', st.totals.err24 + ' errors/24h') : chip('ok', '0 errors/24h'));
  h.push(probeOk === st.probes.length ? chip('ok', probeOk + '/' + st.probes.length + ' probes up') : chip('warn', probeOk + '/' + st.probes.length + ' probes up'));
  h.push(chip(totalErr > 0 ? 'err' : 'ok', totalErr + ' scheduled w/ errors'));
  h.push(chip(totalNoRun > 0 ? 'warn' : 'ok', totalNoRun + ' no-run'));
  h.push('</div>');
  if (st.issues && st.issues.length) {
    h.push('<div class="card"><h2>Attention (' + st.issues.length + ')</h2><ul>');
    for (const i of st.issues) h.push('<li class="issue-' + esc(i.sev) + '">' + esc(i.text) + '</li>');
    h.push('</ul></div>');
  } else {
    h.push('<div class="card"><h2>Attention</h2><div>No active error or warning conditions detected by this cycle.</div></div>');
  }
  h.push('<h2>Scheduled workers (next runs UTC)</h2>');
  h.push('<table><tr><th>status</th><th>worker</th><th>purpose</th><th>cron(s)</th><th>next runs</th><th>24h inv</th><th>24h err</th><th>exp fires</th><th>modified</th><th>last run</th></tr>');
  for (const s of st.scheduled) {
    const dotc = s.status === 'ERR' ? 'err' : s.status === 'OK' ? 'ok' : s.status === 'NO-RUN' ? 'warn' : 'idle';
    h.push('<tr><td><span class="dot dot-' + dotc + '"></span>' + esc(s.status) + '</td>');
    h.push('<td>' + esc(s.name) + '</td><td>' + esc(s.purpose) + ' <span class="sub">(' + esc(s.group) + ')</span></td>');
    h.push('<td>' + esc(s.crons.join(', ')) + '</td>');
    h.push('<td>' + (s.next.length ? s.next.map(function (n) { return n.at + (s.crons.length > 1 ? ' [' + esc(n.cron) + ']' : ''); }).join('<br/>') : 'none in 400d') + '</td>');
    h.push('<td>' + s.req24 + '</td><td>' + (s.err24 > 0 ? '<b style="color:#f85149">' + s.err24 + '</b>' : s.err24) + '</td><td>' + s.expected24 + '</td>');
    h.push('<td class="sub">' + esc((s.modified_on || '').slice(0, 16)) + '</td>');
    h.push('<td class="sub">' + esc(s.lastRun ? String(s.lastRun).slice(0, 16).replace('T', ' ') : 'never (30d)') + '</td></tr>');
  }
  h.push('</table>');
  h.push('<h2>Pipeline audits (D1 qnfo-audit + outreach + living-paper)</h2>');
  h.push('<table><tr><th>state</th><th>probe</th><th>detail</th><th>latest</th></tr>');
  for (const a of st.audits) {
    h.push('<tr><td>' + chip(a.state, a.state) + '</td><td>' + esc(a.label) + '</td><td>' + esc(a.detail) + '</td><td class="sub">' + esc(a.ts ? String(a.ts).slice(0, 19) : '') + '</td></tr>');
  }
  h.push('</table>');
  h.push('<h2>Endpoint probes</h2>');
  h.push('<table><tr><th>status</th><th>name</th><th>url</th><th>http</th><th>ms</th><th>body sample</th></tr>');
  for (const p of st.probes) {
    h.push('<tr><td>' + (p.ok ? chip('ok', 'UP') : chip('warn', 'DOWN')) + '</td><td>' + esc(p.name) + '</td><td>' + esc(p.url) + '</td><td>' + p.status + '</td><td>' + p.ms + '</td><td class="sub">' + esc(p.body) + '</td></tr>');
  }
  h.push('</table>');
  h.push(integrationHtml(st.integration));
  h.push('<h2>Device-bound (Windows Task Scheduler + DeepChat local cron) - front-end only</h2>');
  h.push('<div class="sub">captured ' + esc(st.device.captured_at || '') + ' UTC &middot; ' + esc(st.device.note || '') + ' &middot; cloud-able functions run in the CF scheduled layer, never local cron (CLOUD-FRONTEND-ONLY-1)</div>');
  h.push('<table><tr><th>task</th><th>status</th><th>last run</th><th>last result</th><th>next run</th><th>schedule</th></tr>');
  for (const t of st.device.windows_tasks) {
    const stc = t.status === 'Ready' ? 'ok' : 'warn';
    h.push('<tr><td>' + esc(t.name) + '</td><td>' + chip(stc, t.status) + '</td><td>' + esc(t.last || '') + '</td><td>' + esc(t.lastres || '') + '</td><td>' + esc(t.next || '') + '</td><td>' + esc(t.schedule || '') + '</td></tr>');
  }
  h.push('</table>');
  if (st.device.local_crons && st.device.local_crons.length) {
    h.push('<table><tr><th>local cron id</th><th>name</th><th>schedule</th><th>note</th></tr>');
    for (const lc of st.device.local_crons) h.push('<tr><td>' + esc(lc.id) + '</td><td>' + esc(lc.name) + '</td><td>' + esc(lc.cron) + '</td><td class="sub">' + esc(lc.note) + '</td></tr>');
    h.push('</table>');
  }
  h.push('<div class="sub" style="margin-top:14px">guard set: prompt-store-verify / scheduler-guard / model_guard / adversarial-guard (exit 0 each cycle) &middot; registry captured ' + esc(st.meta.registry_captured_at || '') + ' UTC</div>');
  h.push('</body></html>');
  return h.join('');
}

let inflight = null;

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === 'OPTIONS') return json({}, 204);
  if (path === '/health') {
    return json({ ok: true, worker: NAME, version: VERSION, registry_captured_at: REGISTRY.captured_at || null, generated_at: new Date().toISOString() });
  }
  if (path === '/api/refresh') {
    const st = await runRefresh(env, ctx);
    return json({ ok: true, generated_at: st.generated_at, issues: (st.issues || []).length, refresh_ms: st.refresh_ms });
  }
  if (path === '/api/state') {
    const rec = await loadState(env);
    if (!rec) { const st = await runRefresh(env, ctx); return json(st); }
    const age = Date.now() - new Date(rec.updatedAt).getTime();
    if (age > STALE_MS) ctx.waitUntil(runRefresh(env, ctx).catch(function () { }));
    return json(rec.state);
  }
  if (path === '/api/integration') {
    const rec = await loadState(env);
    const st = rec ? rec.state : await runRefresh(env, ctx);
    return json(st.integration || { error: 'no integration data' });
  }
  if (path === '/' || path === '') {
    const rec = await loadState(env);
    let st = rec ? rec.state : null;
    if (!st) {
      try { st = await runRefresh(env, ctx); }
      catch (e) { st = { error: String(e.message || e), generated_at: new Date().toISOString(), version: VERSION, fleet: { workers: 0, scheduled: 0, probes: 0, d1_databases: 9 }, totals: { req24: 0, err24: 0 }, scheduled: [], audits: [], probes: [], device: { captured_at: REGISTRY.captured_at, note: REGISTRY.note, windows_tasks: REGISTRY.windows_tasks || [], local_crons: REGISTRY.local_crons || [] }, issues: [{ sev: 'err', text: 'refresh failed: ' + String(e.message || e) }], meta: {} }; }
    } else {
      const age = Date.now() - new Date(rec.updatedAt).getTime();
      if (age > STALE_MS) ctx.waitUntil(runRefresh(env, ctx).catch(function () { }));
    }
    return new Response(pageHtml(st), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  return json({ error: 'not found', path: path }, 404);
}

async function runRefresh(env, ctx) {
  if (inflight) return inflight;
  inflight = (async function () {
    const t0 = Date.now();
    const st = await buildState(env, ctx);
    st.refresh_ms = Date.now() - t0;
    await saveState(env, st, st.refresh_ms);
    return st;
  })().finally(function () { inflight = null; });
  return inflight;
}

export default {
  async fetch(request, env, ctx) {
    try { return await handleRequest(request, env, ctx); }
    catch (e) { return json({ ok: false, error: String(e.message || e) }, 500); }
  },
  async scheduled(controller, env, ctx) {
    try {
      const st = await runRefresh(env, ctx);
      return new Response('ok generated ' + st.generated_at + ' issues ' + (st.issues || []).length);
    } catch (e) {
      return new Response('err ' + String(e.message || e), { status: 500 });
    }
  }
};


