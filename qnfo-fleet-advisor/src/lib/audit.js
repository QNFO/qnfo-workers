// qnfo-fleet-advisor/src/lib/audit.js
// Deterministic AI Gateway audit + Tier-1 autonomous fix loop.
// Lemma contract: PRECONDITION env.CF_API_TOKEN + env.ACCOUNT_ID + env.QNFO_AUDIT valid;
// POSTCONDITION: ai_advisor_runs row written, Tier-1 actions applied (<=MAX_TIER1 per cycle,
// 24h-deduped via ai_advisor_actions), Tier-2 agent_issues filed with open-title dedupe.
// Gate refs: CLOUD-AUTONOMY-100-1 ($90/30d spend guard), GW-FAIL-DEDUP-1, RECURRENCE-ZERO-1.

export const AUDIT_VERSION = '1.0.0';
export const TARGET_SPEND_LIMIT = 90;              // mandate: AI Gateway $90 / 30d spend guard
export const MAX_TIER1 = 2;                        // hard cap on autonomous mutations per cycle
export const DEDUPE_MS = 24 * 3600 * 1000;         // action dedupe window
export const LOGS_PER_PAGE = 50;

const CF_BASE = 'https://api.cloudflare.com/client/v4';

async function cfFetch(env, path, opts = {}) {
  const res = await fetch(CF_BASE + path, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + env.CF_API_TOKEN,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(path + ' -> HTTP ' + res.status + ': ' + text.slice(0, 200));
  try { return JSON.parse(text); } catch (e) { return { raw: text.slice(0, 300) }; }
}

async function ensureSchema(env) {
  await env.QNFO_AUDIT.prepare('CREATE TABLE IF NOT EXISTS ai_advisor_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, mode TEXT, metrics TEXT, findings TEXT, actions TEXT, digest TEXT)').run();
  await env.QNFO_AUDIT.prepare('CREATE TABLE IF NOT EXISTS ai_advisor_insights (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, source TEXT, title TEXT, body TEXT, category TEXT, severity TEXT, status TEXT)').run();
  await env.QNFO_AUDIT.prepare('CREATE TABLE IF NOT EXISTS ai_advisor_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, code TEXT, detail TEXT, ok INTEGER, result TEXT)').run();
}

async function alreadyApplied(env, code) {
  const r = await env.QNFO_AUDIT.prepare('SELECT COUNT(*) AS c FROM ai_advisor_actions WHERE code = ? AND ts > ?')
    .bind(code, Date.now() - DEDUPE_MS).first();
  return (r && r.c) ? r.c : 0;
}

async function recordAction(env, code, detail, ok, result) {
  await env.QNFO_AUDIT.prepare('INSERT INTO ai_advisor_actions (ts, code, detail, ok, result) VALUES (?,?,?,?,?)')
    .bind(Date.now(), code, String(detail || '').slice(0, 500), ok ? 1 : 0, String(result || '').slice(0, 800)).run();
}

// Tier-1: align gateway spend-limit rule to the $90/30d mandate (GET -> modify -> PUT full config).
// Verified 2026-09-08: PUT /ai-gateway/gateways/default accepts the full config object; the
// dedicated /spend-limits sub-paths 404.
async function applySpendAlign(env) {
  const path = '/accounts/' + env.ACCOUNT_ID + '/ai-gateway/gateways/default';
  const cfg = await cfFetch(env, path);
  const rules = (cfg.result && cfg.result.spend_limits && cfg.result.spend_limits.rules) || [];
  const rule = rules[0];
  if (!rule) return { ok: false, error: 'no spend rule present' };
  if (rule.limit === TARGET_SPEND_LIMIT) return { ok: true, changed: false, note: 'already ' + TARGET_SPEND_LIMIT };
  const updated = JSON.parse(JSON.stringify(cfg.result));
  updated.spend_limits.rules[0].limit = TARGET_SPEND_LIMIT;
  const put = await cfFetch(env, path, { method: 'PUT', body: JSON.stringify(updated) });
  return { ok: !!(put && put.success !== false), changed: true, ruleId: rule.id, from: rule.limit, to: TARGET_SPEND_LIMIT };
}

function configFindings(cfg, findings) {
  if (!cfg) return;
  const s = cfg.spend_limits || {};
  const rule = (s.rules || [])[0];
  if (rule && rule.limit !== TARGET_SPEND_LIMIT) {
    findings.push({ severity: 'high', code: 'SPEND-LIMIT-DRIFT', detail: 'rule ' + rule.id + ' limit=' + rule.limit + ' vs mandate ' + TARGET_SPEND_LIMIT + '/30d' });
  }
  if (!cfg.collect_logs) findings.push({ severity: 'high', code: 'LOGS-DISABLED', detail: 'collect_logs=false' });
  if (!(cfg.cache_ttl > 0)) findings.push({ severity: 'medium', code: 'CACHE-DISABLED', detail: 'cache_ttl=' + cfg.cache_ttl });
  if (!(cfg.retry_max_attempts >= 1)) findings.push({ severity: 'medium', code: 'NO-RETRIES', detail: 'retry_max_attempts=' + cfg.retry_max_attempts });
  if (cfg.cache_ttl > 86400 * 7) findings.push({ severity: 'info', code: 'CACHE-TTL-LONG', detail: 'cache_ttl=' + cfg.cache_ttl + 's (~' + Math.round(cfg.cache_ttl / 86400) + 'd); invalidate_on_update=' + cfg.cache_invalidate_on_update });
}

async function fileIssue(env, model, statusCode, detail) {
  const title = '[gw-fail] ' + statusCode + ' ' + model;
  const dup = await env.QNFO_AUDIT.prepare("SELECT id FROM agent_issues WHERE title = ? AND status IN ('open','new','in_progress') LIMIT 1").bind(title).first();
  if (dup) return { dup: true, id: dup.id };
  await env.QNFO_AUDIT.prepare('INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(title, String(detail || '').slice(0, 1500), 'qnfo-fleet-advisor', 'ai-gateway', 'P2', 'open', Date.now(), Date.now()).run();
  return { dup: false };
}

export async function runGatewayAudit(env, mode = 'scheduled') {
  const t0 = Date.now();
  const findings = [];
  const actions = [];
  try { await ensureSchema(env); } catch (e) { findings.push({ severity: 'critical', code: 'SCHEMA-FAIL', detail: String(e.message || e).slice(0, 200) }); }

  let cfg = null;
  try {
    const r = await cfFetch(env, '/accounts/' + env.ACCOUNT_ID + '/ai-gateway/gateways/default');
    cfg = r.result || null;
    configFindings(cfg, findings);
  } catch (e) {
    findings.push({ severity: 'critical', code: 'GW-CONFIG-FETCH-FAIL', detail: String(e.message || e).slice(0, 200) });
  }

  let logs = [];
  try {
    const r = await cfFetch(env, '/accounts/' + env.ACCOUNT_ID + '/ai-gateway/gateways/default/logs?per_page=' + LOGS_PER_PAGE + '&page=1&order_by=created_at&order=desc');
    logs = (r && r.result) || [];
  } catch (e) {
    findings.push({ severity: 'critical', code: 'GW-LOGS-FETCH-FAIL', detail: String(e.message || e).slice(0, 200) });
  }

  const byModel = {};
  let cached = 0, failed = 0, costTotal = 0;
  for (const l of logs) {
    const m = l.model || 'unknown';
    byModel[m] = byModel[m] || { req: 0, cached: 0, fail: 0, cost: 0, dur_ms: 0 };
    byModel[m].req++;
    if (l.cached) { byModel[m].cached++; cached++; }
    if (l.success === false || (l.status_code && l.status_code >= 400)) { byModel[m].fail++; failed++; }
    byModel[m].cost += (l.cost || 0);
    byModel[m].dur_ms += (l.duration || 0);
    costTotal += (l.cost || 0);
  }
  const metrics = {
    ts: new Date().toISOString(),
    gateway: cfg ? {
      cache_ttl_s: cfg.cache_ttl,
      cache_invalidate_on_update: cfg.cache_invalidate_on_update,
      collect_logs: cfg.collect_logs,
      rate_limit: cfg.rate_limiting_limit + '/' + cfg.rate_limiting_interval + 's ' + cfg.rate_limiting_technique,
      retries: cfg.retry_max_attempts + 'x ' + cfg.retry_delay + 'ms ' + cfg.retry_backoff,
      spend_rules: (cfg.spend_limits && cfg.spend_limits.rules) || [],
    } : null,
    logs: {
      n: logs.length,
      cache_hit_ratio: logs.length ? Math.round((cached / logs.length) * 1000) / 1000 : null,
      failures: failed,
      cost_window_usd: Math.round(costTotal * 1e6) / 1e6,
      by_model: byModel,
    },
  };

  // ---- Tier-1 autonomous fixes (safe + reversible + capped + deduped) ----
  if (cfg && metrics.gateway.spend_rules.length && actions.length < MAX_TIER1 && (await alreadyApplied(env, 'SPEND-LIMIT-ALIGN')) === 0) {
    try {
      const r = await applySpendAlign(env);
      await recordAction(env, 'SPEND-LIMIT-ALIGN', JSON.stringify(r).slice(0, 400), r.ok, r.error || r.note || ('rule ' + r.ruleId + ' ' + r.from + '->' + r.to));
      actions.push({ tier: 1, code: 'SPEND-LIMIT-ALIGN', applied: r.ok, result: r });
      if (!r.ok) findings.push({ severity: 'high', code: 'SPEND-ALIGN-FAIL', detail: String(r.error || '').slice(0, 200) });
    } catch (e) {
      await recordAction(env, 'SPEND-LIMIT-ALIGN', 'exception', false, String(e.message || e).slice(0, 300));
      actions.push({ tier: 1, code: 'SPEND-LIMIT-ALIGN', applied: false, result: { error: String(e.message || e).slice(0, 200) } });
    }
  }

  // ---- Tier-2: file/dedupe agent_issues for persistent gateway failure patterns ----
  const failGroups = {};
  for (const l of logs) {
    if (l.success === false || (l.status_code && l.status_code >= 400)) {
      const key = l.model + '|' + (l.status_code || 'err');
      failGroups[key] = failGroups[key] || { model: l.model, status: l.status_code, n: 0, sample: '' };
      failGroups[key].n++;
      if (!failGroups[key].sample) failGroups[key].sample = String(l.error || l.errors || l.outcome || '').slice(0, 200);
    }
  }
  for (const key of Object.keys(failGroups)) {
    const g = failGroups[key];
    if (g.n >= 2) {
      const filed = await fileIssue(env, g.model, g.status, 'advisor saw ' + g.n + ' failures in last ' + LOGS_PER_PAGE + ' gateway logs. sample: ' + g.sample);
      actions.push({ tier: 2, code: 'GW-FAIL-ISSUE', model: g.model, status: g.status, n: g.n, filed: filed });
    }
  }

  const digest = { mode, version: AUDIT_VERSION, dur_ms: Date.now() - t0, tier1_cap: MAX_TIER1 };
  try {
    await env.QNFO_AUDIT.prepare('INSERT INTO ai_advisor_runs (ts, mode, metrics, findings, actions, digest) VALUES (?,?,?,?,?,?)')
      .bind(Date.now(), mode, JSON.stringify(metrics), JSON.stringify(findings), JSON.stringify(actions), JSON.stringify(digest)).run();
  } catch (e) {
    findings.push({ severity: 'critical', code: 'D1-WRITE-FAIL', detail: String(e.message || e).slice(0, 200) });
  }

  return { version: AUDIT_VERSION, mode, metrics, findings, actions, digest };
}
