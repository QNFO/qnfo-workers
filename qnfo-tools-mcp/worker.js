// qnfo-tools-mcp — MCP server on Cloudflare Workers (SSE + streamable HTTP)
// Tools: web_search, web_fetch, papers_search, history_recall, personal_search.
// Auth: ?token= or Authorization: Bearer (MCP_TOKEN secret). Outbound calls use RT secret.
const ROUTER = 'https://qnfo-ai.q08.workers.dev';
const PL_SEARCH = 'https://personal-life-search.q08.workers.dev';
const NL = String.fromCharCode(10);
const VERSION = '1.0.0';

const TOOLS = [
  { name: 'web_search', description: 'Search the web via DuckDuckGo (QNFO router). Returns title/url/snippet.', inputSchema: { type: 'object', properties: { q: { type: 'string', description: 'search query' }, k: { type: 'number', description: 'result count (1-10)' } }, required: ['q'] } },
  { name: 'web_fetch', description: 'Fetch a URL and extract readable text (SSRF-guarded).', inputSchema: { type: 'object', properties: { url: { type: 'string' }, max: { type: 'number', description: 'max chars (500-20000)' } }, required: ['url'] } },
  { name: 'papers_search', description: 'Semantic search over the QNFO research corpus (Vectorize qwav-research-v2).', inputSchema: { type: 'object', properties: { q: { type: 'string' }, k: { type: 'number' } }, required: ['q'] } },
  { name: 'history_recall', description: 'Semantic recall of past QNFO research notes and queries (qnfo-ai-log).', inputSchema: { type: 'object', properties: { q: { type: 'string' }, k: { type: 'number' } }, required: ['q'] } },
  { name: 'personal_search', description: 'Search the personal-life index: notes, files, chat threads.', inputSchema: { type: 'object', properties: { q: { type: 'string' }, topK: { type: 'number' } }, required: ['q'] } },
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
  if (name === 'personal_search') {
    const r = await env.PL_SEARCH.fetch(PL_SEARCH + '/search?q=' + encodeURIComponent(String(args.q || '').slice(0, 300)) + '&topK=' + k);
    const j = await r.json();
    if (!r.ok) return { error: j.error || ('HTTP ' + r.status) };
    return { count: j.count || 0, files: (j.files || []).map(f => ({ path: f.path, score: f.bestScore, snippet: f.snippet })) };
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
      return ok(msg.id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
    } catch (e) {
      return ok(msg.id, { content: [{ type: 'text', text: 'ERROR: ' + (e && e.message || String(e)) }], isError: true });
    }
  }
  if (m === 'tools/list_changed') return ok(msg.id, {});
  return rpcErr(msg.id, -32601, 'method not found: ' + m);
}

const sessions = new Map();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (path === '/health' && method === 'GET') {
      return new Response(JSON.stringify({ ok: true, worker: 'qnfo-tools-mcp', version: VERSION, tools: TOOLS.map(t => t.name), sessions: sessions.size }), { headers: { 'Content-Type': 'application/json', ...cors } });
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
