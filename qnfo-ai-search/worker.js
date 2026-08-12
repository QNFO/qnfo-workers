// qnfo-ai-search — QNFO AI Search Worker
// Cloudflare AI Search (FREE open beta): built-in storage + vector index + namespace binding.
// Routes:
//   GET  /health                 — health + binding check
//   POST /search                 — semantic search across the corpus instance
//   POST /ingest                — upload a document to the corpus instance (auth-gated)
//   GET  /instances              — list instances in the default namespace
//
// Auth: mutating endpoints require X-Sync-Token (shared secret), matching the
// qnfo-agent-ws pattern. Read endpoints are open.
//
// AI Search instance names: lowercase alphanumeric + hyphens only.
// Namespace binding: ai_search_namespaces -> env.AI_SEARCH (default namespace).
// Cost: FREE during open beta; Workers AI (embeddings/LLM) billed separately —
// stay inside the 10,000 free Neurons/day budget.

const VERSION = '1.0.2';
const DEFAULT_INSTANCE = 'qnfo-corpus';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const isAuthorized = (req, e) => {
      const tok = req.headers.get('X-Sync-Token') || '';
      return e.SYNC_TOKEN && tok === e.SYNC_TOKEN;
    };

    // Health — open
    if (path === '/health' && method === 'GET') {
      return json({
        status: 'ok',
        worker: 'qnfo-ai-search',
        version: VERSION,
        bindings: {
          ai_search: !!env.AI_SEARCH,
          sync_token: !!env.SYNC_TOKEN,
        },
      });
    }

    // List instances — open (read-only)
    if (path === '/instances' && method === 'GET') {
      try {
        const instances = await env.AI_SEARCH.list();
        return json({ instances: instances?.map?.((i) => i?.name || i) || instances || [] });
      } catch (e) {
        return json({ error: e?.message || String(e) }, 500);
      }
    }

    // Ingest a document into the corpus instance — auth-gated
    if (path === '/ingest' && method === 'POST') {
      if (!isAuthorized(request, env)) {
        return json({ error: 'Unauthorized: missing or invalid X-Sync-Token' }, 401);
      }
      try {
        const body = await request.json();
        const name = body.instance || DEFAULT_INSTANCE;
        const docId = body.id || ('doc-' + Date.now());
        const content = body.content || '';
        if (!content) return json({ error: 'content required' }, 400);
        const instance = env.AI_SEARCH.get(name);
        // uploadAndPoll() blocks until the full index completes -> request timeout on
        // first/large ingest. Use fire-and-forget upload(); indexing finishes in seconds
        // and /search will return the doc once indexed.
        await instance.items.upload(docId + '.md', content, { metadata: body.metadata || {} });
        return json({ ok: true, instance: name, id: docId, indexed: 'async', note: 'indexing in progress' });
      } catch (e) {
        return json({ error: e?.message || String(e) }, 500);
      }
    }

    // Search the corpus — open (read-only)
    if (path === '/search' && method === 'POST') {
      try {
        const body = await request.json();
        const query = body.query || body.q || '';
        if (!query) return json({ error: 'query required' }, 400);
        const name = body.instance || DEFAULT_INSTANCE;
        const limit = Math.min(body.limit || 5, 20);
        const instance = env.AI_SEARCH.get(name);
        const results = await instance.search({
          query,
          limit,
          returnMetadata: body.returnMetadata !== false,
        });
        return json({ ok: true, instance: name, count: results?.chunks?.length || results?.results?.length || results?.count || 0, results });
      } catch (e) {
        return json({ error: e?.message || String(e) }, 500);
      }
    }

    return json({ error: 'Not found', path }, 404);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
