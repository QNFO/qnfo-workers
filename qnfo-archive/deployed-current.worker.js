var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
function corsHeaders(origin) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "https://archive.qnfo.org"
  };
}
__name(corsHeaders, "corsHeaders");
__name2(corsHeaders, "corsHeaders");
var GRAPH_API = "https://graph-api.qnfo.org";
var worker_default = {
  async queue(batch, env, ctx) {
    for (var mi = 0; mi < batch.messages.length; mi++) {
      var m = batch.messages[mi];
      try {
        var project = m.body.project;
        var sourcePath = m.body.sourcePath;
        var targetPath = m.body.targetPath;
        console.log("[qnfo-archive] ARCHIVE", project, sourcePath, "->", targetPath);
        var objs = await env.QNFO_BUCKET.list({ prefix: sourcePath });
        for (var oi = 0; oi < (objs.objects || []).length; oi++) {
          var o = objs.objects[oi];
          var orig = await env.QNFO_BUCKET.get(o.key);
          if (!orig) continue;
          var tk = targetPath + o.key.replace(sourcePath, "").replace(/\/\//g, "/");
          await env.QNFO_BUCKET.put(tk, orig.body, {
            httpMetadata: orig.httpMetadata || {},
            customMetadata: Object.assign({}, orig.customMetadata || {}, { archived_at: (/* @__PURE__ */ new Date()).toISOString() })
          });
          await env.QNFO_BUCKET.delete(o.key);
        }
        m.ack();
      } catch (e) {
        console.error("[qnfo-archive] queue error:", e.message);
        m.retry({ delaySeconds: 60 });
      }
    }
  },
  async fetch(request, env) {
    var u = new URL(request.url);
    var p = u.pathname;
    var origin = request.headers.get("Origin") || "https://archive.qnfo.org";
    var h = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (p === "/health") return new Response(JSON.stringify({
      status: "ok",
      worker: "qnfo-archive",
      version: "1.2-cors-fixed",
      capabilities: ["queue-consumer", "archival", "paper-pipeline", "kg-auto-seed", "handoff-search", "task-search"],
      bindings: { d1: ["living-paper", "qnfo-audit", "portfolio-state"], r2: "qnfo", vz: ["qnfo-handoffs", "qnfo-tasks"], ai: true }
    }), { headers: h });
    if (p === "/" || p === "") {
      try {
        var results = await env.LIVING_PAPER.prepare(
          "SELECT slug,title,doi,abstract FROM papers WHERE slug IS NOT NULL ORDER BY created_at DESC LIMIT 50"
        ).all();
        return new Response(JSON.stringify({ papers: results.results, count: results.results.length }), { headers: h });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: h });
      }
    }
    if (p === "/seed-kg") {
      try {
        var dryRun = u.searchParams.get("dry") === "true" || u.searchParams.get("dry") === "1";
        var result = await seedKGFromD1(env, dryRun);
        return new Response(JSON.stringify(result), { headers: h });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message, status: "kg-seed-failed" }), { status: 500, headers: h });
      }
    }
    if (p === "/handoff/search") {
      return handleVzSearch(request, env, "HANDOFFS_VZ", "qnfo-handoffs", origin);
    }
    if (p === "/task/search") {
      return handleVzSearch(request, env, "TASKS_VZ", "qnfo-tasks", origin);
    }
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: h });
  },
  async scheduled(event, env, ctx) {
    if (event.cron === "0 4 * * *") {
      console.log("[qnfo-archive] scheduled KG auto-seed");
      try {
        var result = await seedKGFromD1(env, false);
        console.log("[qnfo-archive] KG seed complete:", JSON.stringify(result));
      } catch (e) {
        console.error("[qnfo-archive] KG seed error:", e.message);
      }
    }
  }
};
async function seedKGFromD1(env, dryRun) {
  if (dryRun === void 0) dryRun = false;
  var papers = await env.LIVING_PAPER.prepare(
    "SELECT pi.slug, pi.kg_id, pi.vectorize_id, pi.doi, pi.zenodo_url, pi.papers_server_url, p.title, p.authors, p.status, p.created_at FROM paper_ids pi LEFT JOIN papers p ON pi.slug = p.slug WHERE pi.slug IS NOT NULL AND pi.kg_id IS NOT NULL"
  ).all();
  var paperRows = papers.results || [];
  var missing = [];
  var BATCH_SIZE = 50;
  var totalSeeded = 0;
  var errors = [];
  for (var i = 0; i < paperRows.length; i += BATCH_SIZE) {
    var batch = paperRows.slice(i, i + BATCH_SIZE);
    var nodes = [];
    for (var j = 0; j < batch.length; j++) {
      var p = batch[j];
      if (!p.title || !p.kg_id) continue;
      nodes.push({
        id: p.kg_id,
        name: p.title.slice(0, 255),
        label: "Paper",
        properties: {
          slug: p.slug,
          doi: p.doi || "",
          authors: p.authors || "",
          status: p.status || "published",
          vectorize_id: p.vectorize_id,
          zenodo_url: p.zenodo_url || "",
          distribution_status: "published",
          last_active: p.created_at || (/* @__PURE__ */ new Date()).toISOString()
        }
      });
    }
    if (nodes.length === 0) continue;
    if (dryRun) {
      for (var k = 0; k < nodes.length; k++) missing.push(nodes[k].id);
      continue;
    }
    try {
      var syncResp = await fetch(GRAPH_API + "/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "qnfo-archive/1.2" },
        body: JSON.stringify({ action: "bulk", nodes, edges: [] })
      });
      if (syncResp.ok) {
        totalSeeded += nodes.length;
      } else {
        errors.push("Batch " + Math.floor(i / BATCH_SIZE) + ": HTTP " + syncResp.status);
      }
    } catch (e) {
      errors.push("Batch " + Math.floor(i / BATCH_SIZE) + ": " + e.message);
    }
  }
  return {
    status: dryRun ? "dry-run" : "kg-seeded",
    totalPapers: paperRows.length,
    batches: Math.ceil(paperRows.length / BATCH_SIZE),
    nodesToSync: dryRun ? missing.length : totalSeeded,
    errors: errors.length > 0 ? errors : void 0,
    dryRun
  };
}
__name(seedKGFromD1, "seedKGFromD1");
__name2(seedKGFromD1, "seedKGFromD1");
__name22(seedKGFromD1, "seedKGFromD1");
async function handleVzSearch(request, env, bindingName, indexName, origin) {
  var h = corsHeaders(origin);
  try {
    var query = "";
    if (request.method === "GET") {
      var u = new URL(request.url);
      query = (u.searchParams.get("q") || u.searchParams.get("query") || "").trim();
    } else if (request.method === "POST") {
      var body = await request.json().catch(function() {
        return {};
      });
      query = (body.q || body.query || "").trim();
    }
    if (!query) {
      return new Response(JSON.stringify({ error: "Missing query (q or query parameter)" }), { status: 400, headers: h });
    }
    if (!env.AI) {
      return new Response(JSON.stringify({ error: "AI binding not configured" }), { status: 503, headers: h });
    }
    var vzBinding = env[bindingName];
    if (!vzBinding) {
      return new Response(JSON.stringify({ error: "Vectorize binding '" + bindingName + "' not configured" }), { status: 503, headers: h });
    }
    var embedResult = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [query] });
    var vector = embedResult && embedResult.data ? embedResult.data[0] : Array.isArray(embedResult) ? embedResult[0] : null;
    if (!vector) {
      return new Response(JSON.stringify({ error: "Failed to generate embedding" }), { status: 500, headers: h });
    }
    var matches = await vzBinding.query(vector, { topK: 10, returnMetadata: "all" });
    var results = (matches.matches || []).map(function(m) {
      return { id: m.id, score: Math.round((m.score || 0) * 1e4) / 1e4, metadata: m.metadata || {} };
    });
    return new Response(JSON.stringify({ index: indexName, query, count: results.length, results }), { headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, index: indexName }), { status: 500, headers: h });
  }
}
__name(handleVzSearch, "handleVzSearch");
__name2(handleVzSearch, "handleVzSearch");
__name22(handleVzSearch, "handleVzSearch");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
