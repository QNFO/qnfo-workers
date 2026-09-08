var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "1.0.2";
var DEFAULT_INSTANCE = "qnfo-corpus";
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }
    const isAuthorized = /* @__PURE__ */ __name((req, e) => {
      const tok = req.headers.get("X-Sync-Token") || "";
      return e.SYNC_TOKEN && tok === e.SYNC_TOKEN;
    }, "isAuthorized");
    if (path === "/health" && method === "GET") {
      return json({
        status: "ok",
        worker: "qnfo-ai-search",
        version: VERSION,
        bindings: {
          ai_search: !!env.AI_SEARCH,
          sync_token: !!env.SYNC_TOKEN
        }
      });
    }
    if (path === "/instances" && method === "GET") {
      try {
        const instances = await env.AI_SEARCH.list();
        return json({ instances: instances?.map?.((i) => i?.name || i) || instances || [] });
      } catch (e) {
        return json({ error: e?.message || String(e) }, 500);
      }
    }
    if (path === "/ingest" && method === "POST") {
      if (!isAuthorized(request, env)) {
        return json({ error: "Unauthorized: missing or invalid X-Sync-Token" }, 401);
      }
      try {
        const body = await request.json();
        const name = body.instance || DEFAULT_INSTANCE;
        const docId = body.id || "doc-" + Date.now();
        const content = body.content || "";
        if (!content) return json({ error: "content required" }, 400);
        const instance = env.AI_SEARCH.get(name);
        await instance.items.upload(docId + ".md", content, { metadata: body.metadata || {} });
        return json({ ok: true, instance: name, id: docId, indexed: "async", note: "indexing in progress" });
      } catch (e) {
        return json({ error: e?.message || String(e) }, 500);
      }
    }
    if (path === "/search" && method === "POST") {
      try {
        const body = await request.json();
        const query = body.query || body.q || "";
        if (!query) return json({ error: "query required" }, 400);
        const name = body.instance || DEFAULT_INSTANCE;
        const limit = Math.min(body.limit || 5, 20);
        const instance = env.AI_SEARCH.get(name);
        const results = await instance.search({
          query,
          limit,
          returnMetadata: body.returnMetadata !== false
        });
        return json({ ok: true, instance: name, count: results?.chunks?.length || results?.results?.length || results?.count || 0, results });
      } catch (e) {
        return json({ error: e?.message || String(e) }, 500);
      }
    }
    return json({ error: "Not found", path }, 404);
  }
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
__name(json, "json");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
