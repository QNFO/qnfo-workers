// qnfo-tools-mcp — MCP server on Cloudflare Workers (SSE + streamable HTTP)
// Tools: web_search, web_fetch, papers_search, history_recall, personal_search,
//        express_desire, intents_list, infra_status, infra_analytics, infra_records,
//        email_check, email_stats, email_search, email_respond, email_mark.
// Auth: ?token= or Authorization: Bearer (MCP_TOKEN secret). Outbound calls use RT secret.
// Email: service binding EMAIL -> qnfo-email + EMAIL_API_KEY secret (same key as qnfo-email's API_KEY).
const ROUTER = 'https://qnfo-ai.q08.workers.dev';
const PL_SEARCH = 'https://personal-life-search.q08.workers.dev';
const EMAIL_BASE = 'https://qnfo-email.internal';
const NL = String.fromCharCode(10);
const VERSION = '1.1.1'; // SELF-REGISTER-1 (2026-09-04): self-document to the qnfo-ops machine-readable service registry on /health (QNFO_OPS binding + REGISTRY_TOKEN)

const TOOLS = [
  { name: 'web_search', description: 'Search the web via DuckDuckGo (QNFO router). Returns title/url/snippet.', inputSchema: { type: 'object', properties: { q: { type: 'string', description: 'search query' }, k: { type: 'number', description: 'result count (1-10)' } }, required: ['q'] } },
  { name: 'web_fetch', description: 'Fetch a URL and extract readable text (SSRF-guarded).', inputSchema: { type: 'object', properties: { url: { type: 'string' }, max: { type: 'number', description: 'max chars (500-20000)' } }, required: ['url'] } },
  { name: 'papers_search', description: 'Semantic search over the QNFO research corpus (Vectorize qwav-research-v2).', inputSchema: { type: 'object', properties: { q: { type: 'string' }, k: { type: 'number' } }, required: ['q'] } },
  { name: 'history_recall', description: 'Semantic recall of past QNFO research notes and queries (qnfo-ai-log).', inputSchema: { type: 'object', properties: { q: { type: 'string' }, k: { type: 'number' } }, required: ['q'] } },
  { name: 'personal_search', description: 'Search the personal-life index: notes, files, chat threads.', inputSchema: { type: 'object', properties: { q: { type: 'string' }, topK: { type: 'number' } }, required: ['q'] } },
  { name: 'express_desire', description: 'Express a desire to the QNFO intent orchestrator. It classifies and routes automatically: notes are stored in Vectorize, tasks/events/emails/reminders are queued with due dates, and they appear in the daily digest.', inputSchema: { type: 'object', properties: { desire: { type: 'string', description: 'what you want done' }, source: { type: 'string', description: 'where it comes from (optional)' } }, required: ['desire'] } },
  { name: 'intents_list', description: 'List intents in the orchestrator queue (tasks/events/emails/reminders).', inputSchema: { type: 'object', properties: { status: { type: 'string', description: 'filter: pending/done' }, limit: { type: 'number' } } } },
  { name: 'infra_status', description: 'Cloudflare infrastructure state snapshot (workers, D1, Vectorize, R2, KV, Web Analytics sites, AI Gateway config, gateway logs + cost).', inputSchema: { type: 'object', properties: {} } },
  { name: 'infra_analytics', description: 'Cloudflare analytics over the last 30 days: Workers AI neurons + estimated cost by model, worker invocations by worker.', inputSchema: { type: 'object', properties: {} } },
  { name: 'infra_records', description: 'QNFO records fleet: papers count, knowledge graph nodes/edges, logged queries, intents, personal store counts.', inputSchema: { type: 'object', properties: {} } },
  { name: 'email_check', description: 'Check the qnfo.org (and other QNFO domain) email accounts: list recent inbound/outbound emails with status. Optionally fetch the full body of one email by id (body_id).', inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'max rows (1-100, default 20)' }, status: { type: 'string', description: 'filter: received/processed/sent/replied/archived/spam/read/rejected' }, body_id: { type: 'number', description: 'email id whose full body/headers to fetch' } } } },
  { name: 'email_stats', description: 'Email account stats: total messages, last 24h, by classification, by status.', inputSchema: { type: 'object', properties: {} } },
  { name: 'email_search', description: 'Search email subject/sender/body text across the QNFO domain email accounts.', inputSchema: { type: 'object', properties: { q: { type: 'string', description: 'search query' }, limit: { type: 'number', description: 'max rows (1-100, default 20)' } }, required: ['q'] } },
  { name: 'email_respond', description: 'Send an email reply (or new email) FROM a QNFO domain account via the qnfo-email Worker. Pass reply_to_id to reply to an existing inbound email (worker marks it replied). `from` defaults to qnfo@qnfo.org; pass rowan.quni@qnfo.org for academic outreach. Body field is `body` (plain text) with optional `html`.', inputSchema: { type: 'object', properties: { to: { type: 'string', description: 'recipient email' }, subject: { type: 'string', description: 'subject (use "Re: <original>" for replies)' }, body: { type: 'string', description: 'plain-text body' }, html: { type: 'string', description: 'optional HTML body' }, reply_to_id: { type: 'number', description: 'id of the inbound email being replied to (marks it replied)' }, from: { type: 'string', description: 'QNFO domain sender (default qnfo@qnfo.org; rowan.quni@qnfo.org for outreach)' } }, required: ['to', 'subject', 'body'] } },
  { name: 'email_mark', description: 'Update the status of an email row (received/processed/sent/replied/archived/spam/read/rejected).', inputSchema: { type: 'object', properties: { id: { type: 'number', description: 'email id' }, status: { type: 'string', description: 'new status' } }, required: ['id', 'status'] } },
];

function authToken(token, env) {
  const expected = env.MCP_TOKEN;
  if (!expected || !token) return false;
  const a = new TextEncoder().encode(token);
  const b = new TextEncoder().encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  let d = 0;
  for (let i = 0; i < a.byteLength; i++) d |= a[i] ^ b[i];
  return d === 0;
}

function ok(id, result) { return { jsonrpc: '2.0', id: id, result: result }; }
function rpcErr(id, code, message) { return { jsonrpc: '2.0', id: id, error: { code: code, message: message } }; }

async function callEmail(env, path, opts = {}) {
  if (!env.EMAIL) throw new Error('EMAIL service binding not configured');
  const url = new URL(EMAIL_BASE + path);
  const headers = { 'Authorization': 'Bearer ' + (env.EMAIL_API_KEY || '') };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const resp = await env.EMAIL.fetch(url.toString(), {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let j = null;
  try { j = await resp.json(); } catch (e) { j = null; }
  if (!resp.ok) return { error: (j && j.error) || ('email svc ' + path + ' HTTP ' + resp.status) };
  return j;
}

async function callTool(env, name, args) {
  const H = { Authorization: 'Bearer ' + env.RT };
  const k = Math.min(parseInt(args.k || 5, 10) || 5, 20);
  if (name === 'web_search') {
    const r = await env.QNFO_AI.fetch(ROUTER + '/v1/web/search?q=' + encodeURIComponent(String(args.q || '').slice(0, 300)) + '&k=' + Math.min(k, 10), { headers: H });
    const j = await r.json();
    if (!r.ok) return { error: j.error || ('HTTP ' + r.status) };
    return { engine: j.engine || 'duckduckgo', count: (j.results || []).length, results: (j.results || []).map(x => ({ title: x.title, url: x.url, snippet: x.snippet })) };
  }
  if (name === 'web_fetch') {
    const r = await env.QNFO_AI.fetch(ROUTER + '/v1/web/fetch?url=' + encodeURIComponent(String(args.url || '')) + '&max=' + Math.min(parseInt(args.max || 6000, 10) || 6000, 20000), { headers: H });
    const j = await r.json();
    if (!r.ok) return { error: j.error || ('HTTP ' + r.status) };
    return { url: j.url, text: j.text, truncated: j.truncated };
  }
  if (name === 'papers_search') {
    const r = await env.QNFO_AI.fetch(ROUTER + '/v1/search?q=' + encodeURIComponent(String(args.q || '').slice(0, 300)) + '&k=' + k);
    const j = await r.json();
    if (!r.ok) return { error: j.error || ('HTTP ' + r.status) };
    return { count: j.count || 0, results: (j.results || []).map(x => ({ score: x.score, path: x.metadata && x.metadata.path, text: x.metadata && x.metadata.text })) };
  }
  if (name === 'history_recall') {
    const r = await env.QNFO_AI.fetch(ROUTER + '/v1/history?q=' + encodeURIComponent(String(args.q || '').slice(0, 300)) + '&k=' + k, { headers: H });
    const j = await r.json();
    if (!r.ok) return { error: j.error || ('HTTP ' + r.status) };
    return { count: j.count || 0, results: (j.results || []).map(x => ({ score: x.score, model: x.metadata && x.metadata.model, text: x.metadata && x.metadata.text })) };
  }
  if (name === 'express_desire') {
    const r = await env.QNFO_INTENT.fetch('https://qnfo-intent-orchestrator.q08.workers.dev/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.INTENT_TOKEN },
      body: JSON.stringify({ desire: String(args.desire || '').slice(0, 4000), source: String(args.source || 'mcp') })
    });
    const j = await r.json();
    if (!r.ok) return { error: j.error || ('HTTP ' + r.status) };
    return j;
  }
  if (name === 'infra_status' || name === 'infra_analytics' || name === 'infra_records') {
    const p = name === 'infra_status' ? '/state' : (name === 'infra_analytics' ? '/analytics' : '/records');
    const r = await env.QNFO_INFRA.fetch('https://qnfo-infra.q08.workers.dev' + p, { headers: { Authorization: 'Bearer ' + env.INFRA_TOKEN } });
    const j = await r.json();
    if (!r.ok) return { error: j.error || ('HTTP ' + r.status) };
    return j;
  }
  if (name === 'intents_list') {
    const q = '?limit=' + Math.min(parseInt(args.limit || 20, 10) || 20, 100) + (args.status ? '&status=' + encodeURIComponent(String(args.status)) : '');
    const r = await env.QNFO_INTENT.fetch('https://qnfo-intent-orchestrator.q08.workers.dev/intents' + q, {
      headers: { 'Authorization': 'Bearer ' + env.INTENT_TOKEN }
    });
    const j = await r.json();
    if (!r.ok) return { error: j.error || ('HTTP ' + r.status) };
    return { count: j.count || 0, intents: (j.intents || []).map(x => ({ id: x.id, type: x.type, domain: x.domain, summary: x.summary || x.desire.slice(0, 100), due: x.due, status: x.status, created_at: x.created_at })) };
  }
  if (name === 'personal_search') {
    const r = await env.PL_SEARCH.fetch(PL_SEARCH + '/search?q=' + encodeURIComponent(String(args.q || '').slice(0, 300)) + '&topK=' + k);
    const j = await r.json();
    if (!r.ok) return { error: j.error || ('HTTP ' + r.status) };
    return { count: j.count || 0, files: (j.files || []).map(f => ({ path: f.path, score: f.bestScore, snippet: f.snippet })) };
  }
  // ---- EMAIL TOOLS (via qnfo-email service binding) ----
  if (name === 'email_check') {
    const lim = Math.min(parseInt(args.limit || 20, 10) || 20, 100);
    const st = args.status ? '&status=' + encodeURIComponent(String(args.status)) : '';
    const j = await callEmail(env, '/emails/recent?limit=' + lim + st);
    if (j.error) return { error: j.error };
    if (args.body_id) {
      const b = await callEmail(env, '/emails/body?id=' + parseInt(args.body_id, 10));
      if (b.error) return { error: b.error };
      return { count: j.count || 0, emails: j.emails || [], body: b };
    }
    return { count: j.count || 0, emails: j.emails || [] };
  }
  if (name === 'email_stats') {
    const j = await callEmail(env, '/stats');
    if (j.error) return { error: j.error };
    return j;
  }
  if (name === 'email_search') {
    const lim = Math.min(parseInt(args.limit || 20, 10) || 20, 100);
    const j = await callEmail(env, '/emails/search?q=' + encodeURIComponent(String(args.q || '').slice(0, 200)) + '&limit=' + lim);
    if (j.error) return { error: j.error };
    return j;
  }
  if (name === 'email_respond') {
    if (!String(args.to || '').includes('@')) return { error: 'to is required' };
    if (!String(args.subject || '').trim()) return { error: 'subject is required' };
    if (!String(args.body || '').trim() && !String(args.html || '').trim()) return { error: 'body or html is required' };
    const payload = { to: String(args.to), subject: String(args.subject), body: String(args.body || '') };
    if (args.html) payload.html = String(args.html);
    if (args.reply_to_id) payload.reply_to_id = parseInt(args.reply_to_id, 10);
    if (args.from) payload.from = String(args.from);
    const j = await callEmail(env, '/send', { method: 'POST', body: payload });
    if (j.error) return { error: j.error };
    return { success: !!j.success, message_id: j.message_id || null, to: j.to, subject: j.subject, sent_at: j.sent_at || null };
  }
  if (name === 'email_mark') {
    const id = parseInt(args.id, 10);
    const status = String(args.status || '');
    if (!id || !status) return { error: 'id and status required' };
    const j = await callEmail(env, '/emails/status', { method: 'PATCH', body: { id, status } });
    if (j.error) return { error: j.error };
    return j;
  }
  throw new Error('unknown tool: ' + name);
}

async function handleJsonRpc(msg, env) {
  const m = msg.method;
  if (m === 'initialize') {
    return ok(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'qnfo-tools-mcp', version: VERSION } });
  }
  if (m === 'notifications/initialized' || m === 'initialized') return null;
  if (m === 'ping') return ok(msg.id, {});
  if (m === 'tools/list') return ok(msg.id, { tools: TOOLS });
  if (m === 'tools/call') {
    try {
      const out = await callTool(env, String((msg.params && msg.params.name) || ''), (msg.params && msg.params.arguments) || {});
      try {
        if (env.AUDIT) {
          await env.AUDIT.prepare('CREATE TABLE IF NOT EXISTS mcp_log (id TEXT PRIMARY KEY, ts TEXT, tool TEXT, args TEXT, result TEXT, session TEXT)').run();
          await env.AUDIT.prepare('INSERT INTO mcp_log (id, ts, tool, args, result, session) VALUES (?1,?2,?3,?4,?5,?6)').bind('mcp-' + Date.now().toString(36), new Date().toISOString(), String((msg.params && msg.params.name) || ''), JSON.stringify((msg.params && msg.params.arguments) || {}).slice(0, 2000), JSON.stringify(out).slice(0, 4000), '').run();
        }
      } catch (e2) {}
      return ok(msg.id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
    } catch (e) {
      return ok(msg.id, { content: [{ type: 'text', text: 'ERROR: ' + (e && e.message || String(e)) }], isError: true });
    }
  }
  if (m === 'tools/list_changed') return ok(msg.id, {});
  return rpcErr(msg.id, -32601, 'method not found: ' + m);
}

const sessions = new Map();

async function selfRegister(env) {
  const manifest = {
    service: 'qnfo-tools-mcp', kind: 'worker', version: VERSION,
    base_url: 'https://qnfo-tools-mcp.q08.workers.dev',
    purpose: 'MCP server (SSE + streamable HTTP) exposing the QNFO machine tool surface (web, research corpus, personal KB, intent queue, infra/analytics, email) to any MCP-capable LLM client',
    capabilities: ['mcp-server', 'sse', 'streamable-http', 'tools', 'web-search', 'web-fetch', 'research-search', 'personal-search', 'intent-express', 'intent-query', 'infra-state', 'infra-analytics', 'email'],
    routes: ['/health', '/mcp/sse', '/mcp/messages', '/mcp'],
    tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
    models: [], deps: ['qnfo-ai (router RT)', 'qnfo-infra', 'qnfo-intent-orchestrator', 'qnfo-email', 'personal-life-search']
  };
  const resp = await env.QNFO_OPS.fetch('https://qnfo-ops.internal/registry/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (env.REGISTRY_TOKEN || '') },
    body: JSON.stringify(manifest)
  });
  return resp.ok;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (path === '/health' && method === 'GET') {
      if (ctx && ctx.waitUntil && env.QNFO_OPS && env.REGISTRY_TOKEN) {
        ctx.waitUntil(selfRegister(env).catch(e => console.log('self-register err', e && e.message || e)));
      }
      return new Response(JSON.stringify({ ok: true, worker: 'qnfo-tools-mcp', version: VERSION, tools: TOOLS.map(t => t.name), sessions: sessions.size, bindings: { email: !!env.EMAIL, email_key: !!env.EMAIL_API_KEY } }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    const tokenFrom = (u, req) => u.searchParams.get('token') || (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (path === '/mcp/sse' && method === 'GET') {
      if (!authToken(tokenFrom(url, request), env)) return new Response('unauthorized', { status: 401 });
      const sessionId = crypto.randomUUID();
      const encoder = new TextEncoder();
      let keep;
      const stream = new ReadableStream({
        start(controller) {
          sessions.set(sessionId, controller);
          controller.enqueue(encoder.encode('event: endpoint' + NL + 'data: /mcp/messages?sessionId=' + sessionId + NL + NL));
          keep = setInterval(() => {
            try { controller.enqueue(encoder.encode(': keepalive' + NL + NL)); } catch (e) {}
          }, 15000);
        },
        cancel() {
          clearInterval(keep);
          sessions.delete(sessionId);
        }
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', ...cors } });
    }
    if (path === '/mcp/messages' && method === 'POST') {
      const sessionId = url.searchParams.get('sessionId') || '';
      const controller = sessions.get(sessionId);
      let msg;
      try { msg = await request.json(); } catch (e) { return new Response('bad json', { status: 400 }); }
      const out = await handleJsonRpc(msg, env);
      if (out && controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('event: message' + NL + 'data: ' + JSON.stringify(out) + NL + NL));
      }
      return new Response('Accepted', { status: 202, headers: cors });
    }
    if (path === '/mcp' && method === 'POST') {
      if (!authToken(tokenFrom(url, request), env)) return new Response('unauthorized', { status: 401 });
      let msg;
      try { msg = await request.json(); } catch (e) { return new Response('bad json', { status: 400 }); }
      const out = await handleJsonRpc(msg, env);
      if (!out) return new Response('', { status: 202, headers: cors });
      return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    return new Response('not found', { status: 404, headers: cors });
  }
};
