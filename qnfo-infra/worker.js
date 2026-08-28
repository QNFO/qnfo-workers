// qnfo-infra - Cloudflare infrastructure + analytics knowledge layer
// Daily snapshots (06:30 + 18:00 UTC) + on-demand POST /refresh:
//   full account state (workers, D1, Vectorize, R2, KV, Web Analytics, AI Gateway + log aggregates),
//   30d GraphQL analytics (AI neurons, worker invocations), records fleet (papers, KG).
// Stored in D1 qnfo-audit.infra_state + embedded into Vectorize qnfo-infra (doc=infra)
// so any agent (twin RAG, MCP tools) can answer infra/analytics/cost questions.
const NL = String.fromCharCode(10);
const VERSION = '1.0.0';
const ACCT = null;

function auth(token, env) {
  const exp = env.INFRA_TOKEN;
  if (!exp || !token) return false;
  const a = new TextEncoder().encode(token);
  const b = new TextEncoder().encode(exp);
  if (a.byteLength !== b.byteLength) return false;
  let d = 0;
  for (let i = 0; i < a.byteLength; i++) d |= a[i] ^ b[i];
  return d === 0;
}

async function cf(env, path) {
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + env.CF_ACCOUNT + path, {
    headers: { Authorization: 'Bearer ' + env.CF_TOKEN, 'User-Agent': 'Mozilla/5.0 (qnfo-infra)' }
  });
  return r.json();
}

async function cfRaw(env, path) {
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + env.CF_ACCOUNT + path, {
    headers: { Authorization: 'Bearer ' + env.CF_TOKEN, 'User-Agent': 'Mozilla/5.0 (qnfo-infra)' }
  });
  return r;
}

async function gql(env, query) {
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.CF_TOKEN, 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (qnfo-infra)' },
    body: JSON.stringify({ query })
  });
  return r.json();
}

async function collectState(env) {
  const out = { ts: new Date().toISOString() };
  try {
    const w = await cf(env, '/workers/scripts?per_page=100');
    const names = (w.result || []).map(x => x.id);
    out.workers = { count: names.length, names: names.slice(0, 30) };
  } catch (e) { out.workers = { error: String(e) }; }
  try {
    const d = await cf(env, '/d1/database?per_page=100');
    const dbs = (d.result || []).map(x => ({ name: x.name, size: x.file_size }));
    out.d1 = { count: dbs.length, total_bytes: dbs.reduce((a, x) => a + (x.size || 0), 0), dbs: dbs.slice(0, 10) };
  } catch (e) { out.d1 = { error: String(e) }; }
  try {
    const v = await cf(env, '/vectorize/v2/indexes?per_page=100');
    const indexes = (v.result || []).slice(0, 10);
    const withCounts = [];
    for (const idx of indexes) {
      try {
        const info = await cf(env, '/vectorize/v2/indexes/' + encodeURIComponent(idx.name) + '/info');
        withCounts.push({ name: idx.name, vectors: (info.result || {}).vectorCount || 0 });
      } catch (e) {
        withCounts.push({ name: idx.name, vectors: -1 });
      }
    }
    out.vectorize = { count: withCounts.length, indexes: withCounts };
  } catch (e) { out.vectorize = { error: String(e) }; }
  try {
    const b = await cfRaw(env, '/r2/buckets?per_page=100');
    const txt = await b.text();
    let j = null;
    try { j = JSON.parse(txt); } catch (e) {}
    const arr = j && j.result && Array.isArray(j.result.buckets) ? j.result.buckets : (j && Array.isArray(j.result) ? j.result : []);
    if (arr.length) {
      out.r2 = { count: arr.length, buckets: arr.map(x => x.name) };
    } else {
      out.r2 = { count: 0, buckets: [], raw: txt.slice(0, 200) };
    }
  } catch (e) { out.r2 = { error: String(e) }; }
  try {
    const k = await cf(env, '/storage/kv/namespaces?per_page=100');
    out.kv = { count: (k.result || []).length, namespaces: (k.result || []).map(x => x.title) };
  } catch (e) { out.kv = { error: String(e) }; }
  try {
    const rum = await cf(env, '/rum/site_info/list?per_page=50');
    out.web_analytics = { count: (rum.result || []).length, sites: (rum.result || []).map(x => x.auto_install ? x.auto_install.host : x.zone_name) };
  } catch (e) { out.web_analytics = { error: String(e) }; }
  try {
    const g = await cf(env, '/ai-gateway/gateways/default');
    out.ai_gateway = { collect_logs: (g.result || {}).collect_logs, log_management: (g.result || {}).log_management, spend_limit: ((g.result || {}).spend_limits || {}).rules || [] };
  } catch (e) { out.ai_gateway = { error: String(e) }; }
  try {
    const r = await cfRaw(env, '/ai-gateway/gateways/default/logs?max_results=1000');
    const j = await r.json();
    const logs = j.result || [];
    let requests = 0, tokensIn = 0, tokensOut = 0, cost = 0;
    const byModel = {};
    for (const l of logs) {
      requests++;
      tokensIn += (l.usage_metadata && l.usage_metadata.input_tokens) || 0;
      tokensOut += (l.usage_metadata && l.usage_metadata.output_tokens) || 0;
      cost += l.cost || 0;
      const m = l.model || 'unknown';
      byModel[m] = byModel[m] || { requests: 0, cost: 0 };
      byModel[m].requests++;
      byModel[m].cost += l.cost || 0;
    }
    out.gateway_logs = { events: logs.length, requests, tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: Math.round(cost * 1e6) / 1e6, by_model: Object.entries(byModel).slice(0, 8).map(([m, s]) => ({ model: m, requests: s.requests, cost_usd: Math.round(s.cost * 1e6) / 1e6 })) };
  } catch (e) { out.gateway_logs = { error: String(e) }; }
  return out;
}

async function collectAnalytics(env) {
  const out = { ts: new Date().toISOString() };
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  try {
    const q = '{ viewer { accounts(filter: {accountTag: "' + env.CF_ACCOUNT + '"}) { aiInferenceAdaptiveGroups(limit: 100, filter: {date_geq: "' + since + '"}) { sum { totalNeurons } dimensions { date modelId } } } } }';
    const j = await gql(env, q);
    const rows = (j.data && j.data.viewer.accounts[0] && j.data.viewer.accounts[0].aiInferenceAdaptiveGroups) || [];
    let neurons = 0;
    const byModel = {};
    for (const r of rows) {
      neurons += (r.sum && r.sum.totalNeurons) || 0;
      const m = r.dimensions && r.dimensions.modelId || 'unknown';
      byModel[m] = (byModel[m] || 0) + ((r.sum && r.sum.totalNeurons) || 0);
    }
    out.ai_30d = { neurons: neurons, est_cost_usd: Math.round(neurons * 0.011 / 1000 * 100) / 100, by_model: Object.entries(byModel).slice(0, 8).map(([m, n]) => ({ model: m, neurons: n })) };
  } catch (e) { out.ai_30d = { error: String(e) }; }
  try {
    const q = '{ viewer { accounts(filter: {accountTag: "' + env.CF_ACCOUNT + '"}) { workersInvocationsAdaptiveGroups(limit: 100, filter: {date_geq: "' + since + '"}) { sum { requests } dimensions { date worker } } } } }';
    const j = await gql(env, q);
    const rows = (j.data && j.data.viewer.accounts[0] && j.data.viewer.accounts[0].workersInvocationsAdaptiveGroups) || [];
    const byWorker = {};
    let total = 0;
    for (const r of rows) {
      const n = (r.sum && r.sum.requests) || 0;
      total += n;
      const w = r.dimensions && r.dimensions.worker || 'unknown';
      byWorker[w] = (byWorker[w] || 0) + n;
    }
    out.workers_30d = { requests: total, by_worker: Object.entries(byWorker).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w, n]) => ({ worker: w, requests: n })) };
  } catch (e) { out.workers_30d = { error: String(e) }; }
  return out;
}

async function collectRecords(env) {
  const out = { ts: new Date().toISOString() };
  try {
    const r = await env.AUDIT.prepare('SELECT COUNT(*) AS n FROM ai_queries').first();
    out.queries_logged = r.n || 0;
  } catch (e) { out.queries_logged = -1; }
  try {
    const r = await env.AUDIT.prepare('SELECT COUNT(*) AS n FROM intents').first();
    out.intents = r.n || 0;
  } catch (e) { out.intents = -1; }
  try {
    const r = await env.PERSONAL.prepare('SELECT COUNT(*) AS n FROM chat').first();
    out.personal_chat_rows = r.n || 0;
  } catch (e) { out.personal_chat_rows = -1; }
  try {
    const r = await env.PERSONAL.prepare('SELECT COUNT(*) AS n FROM events').first();
    out.personal_events = r.n || 0;
  } catch (e) { out.personal_events = -1; }
  try {
    const r = await env.PERSONAL.prepare('SELECT COUNT(*) AS n FROM activity').first();
    out.personal_activity = r.n || 0;
  } catch (e) { out.personal_activity = -1; }
  try {
    const r = await env.LIVING.prepare('SELECT COUNT(*) AS n FROM papers').first();
    out.papers = r.n || 0;
  } catch (e) { out.papers = -1; }
  try {
    const n = await env.GRAPH.prepare('SELECT COUNT(*) AS n FROM nodes').first();
    const e = await env.GRAPH.prepare('SELECT COUNT(*) AS n FROM edges').first();
    out.kg = { nodes: (n && n.n) || 0, edges: (e && e.n) || 0 };
  } catch (e) { out.kg = { error: String(e) }; }
  return out;
}

function summarize(kind, data) {
  const L = [];
  if (kind === 'snapshot') {
    L.push('Cloudflare infrastructure snapshot at ' + data.ts);
    if (data.workers) L.push('Workers: ' + data.workers.count + ' (' + (data.workers.names || []).join(', ') + ')');
    if (data.d1) L.push('D1 databases: ' + data.d1.count + ', total ' + Math.round((data.d1.total_bytes || 0) / 1e6) + ' MB');
    if (data.vectorize) L.push('Vectorize indexes: ' + data.vectorize.indexes.map(x => x.name + '=' + x.vectors).join(', '));
    if (data.r2) L.push('R2 buckets: ' + data.r2.count + ' (' + (data.r2.buckets || []).join(', ') + ')');
    if (data.kv) L.push('KV namespaces: ' + data.kv.count);
    if (data.web_analytics) L.push('Web Analytics sites: ' + data.web_analytics.count);
    if (data.ai_gateway) L.push('AI Gateway: collect_logs=' + data.ai_gateway.collect_logs + ', spend limit rules=' + JSON.stringify(data.ai_gateway.spend_limit));
    if (data.gateway_logs && !data.gateway_logs.error) L.push('Gateway log window (last 1000 events): requests=' + data.gateway_logs.requests + ', tokens in=' + data.gateway_logs.tokens_in + ', out=' + data.gateway_logs.tokens_out + ', cost=$' + data.gateway_logs.cost_usd + '; by model: ' + data.gateway_logs.by_model.map(m => m.model + ' ' + m.requests + ' req $' + m.cost_usd).join('; '));
  } else if (kind === 'analytics') {
    L.push('Cloudflare analytics over the last 30 days ending ' + data.ts);
    if (data.ai_30d && !data.ai_30d.error) L.push('Workers AI inference: ' + data.ai_30d.neurons + ' neurons, estimated cost $' + data.ai_30d.est_cost_usd + '; by model: ' + data.ai_30d.by_model.map(m => m.model + ' ' + m.neurons + ' neurons').join('; '));
    if (data.workers_30d && !data.workers_30d.error) L.push('Worker invocations: ' + data.workers_30d.requests + ' total; top workers: ' + data.workers_30d.by_worker.map(w => w.worker + ' ' + w.requests).join('; '));
  } else if (kind === 'records') {
    L.push('QNFO records fleet at ' + data.ts);
    L.push('Papers in living-paper: ' + data.papers + '; knowledge graph: ' + data.kg.nodes + ' nodes, ' + data.kg.edges + ' edges');
    L.push('Logged AI queries: ' + data.queries_logged + '; intents: ' + data.intents + '; personal chat rows: ' + data.personal_chat_rows + '; personal events: ' + data.personal_events + '; activity entries: ' + data.personal_activity);
  }
  return L.join(NL);
}

async function store(env, kind, data) {
  const id = kind + '-' + Date.now().toString(36);
  const ts = data.ts || new Date().toISOString();
  await env.AUDIT.prepare('CREATE TABLE IF NOT EXISTS infra_state (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, data TEXT)').run();
  await env.AUDIT.prepare('INSERT INTO infra_state (id, ts, kind, data) VALUES (?1,?2,?3,?4)').bind(id, ts, kind, JSON.stringify(data)).run();
  try {
    const text = summarize(kind, data);
    const resp = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [text.slice(0, 1000)] });
    const v = (resp.data || []).find(x => Array.isArray(x) && x.length === 768);
    if (v) await env.VZ.upsert([{ id: 'infra:' + id, values: v, metadata: { doc: 'infra', id: id, kind: kind, ts: ts, text: text.slice(0, 800) } }]);
  } catch (e) {}
  return id;
}

export default {
  async scheduled(event, env) {
    if (event.cron === '30 6 * * *' || event.cron === '0 18 * * *') {
      const s = await collectState(env);
      await store(env, 'snapshot', s);
      const a = await collectAnalytics(env);
      await store(env, 'analytics', a);
      const r = await collectRecords(env);
      await store(env, 'records', r);
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (path === '/health' && method === 'GET') {
      return new Response(JSON.stringify({ ok: true, worker: 'qnfo-infra', version: VERSION }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!auth(token, env)) return new Response('unauthorized', { status: 401, headers: cors });
    if (path === '/refresh' && method === 'POST') {
      const s = await collectState(env);
      const a = await collectAnalytics(env);
      const r = await collectRecords(env);
      const ids = [await store(env, 'snapshot', s), await store(env, 'analytics', a), await store(env, 'records', r)];
      return new Response(JSON.stringify({ ok: true, ids: ids }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    if (path === '/state' && method === 'GET') {
      const row = await env.AUDIT.prepare("SELECT data FROM infra_state WHERE kind='snapshot' ORDER BY ts DESC LIMIT 1").first();
      return new Response(JSON.stringify(row ? JSON.parse(row.data) : { error: 'no snapshot yet' }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    if (path === '/analytics' && method === 'GET') {
      const row = await env.AUDIT.prepare("SELECT data FROM infra_state WHERE kind='analytics' ORDER BY ts DESC LIMIT 1").first();
      return new Response(JSON.stringify(row ? JSON.parse(row.data) : { error: 'no analytics yet' }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    if (path === '/records' && method === 'GET') {
      const row = await env.AUDIT.prepare("SELECT data FROM infra_state WHERE kind='records' ORDER BY ts DESC LIMIT 1").first();
      return new Response(JSON.stringify(row ? JSON.parse(row.data) : { error: 'no records yet' }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    return new Response('not found', { status: 404, headers: cors });
  }
};
