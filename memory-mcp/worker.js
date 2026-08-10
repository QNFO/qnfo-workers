// qnfo-memory-mcp v2.0 — REAL implementation (replaces the v1.2.0 stub that returned "OK" for every tool)
// Authoritative source: QNFO/qnfo-workers (git). Deploy: wrangler deploy from this directory.
// Transport: MCP Streamable HTTP (POST /mcp), SSE alias (/mcp/sse), /health.
// Bindings: LIVING_PAPER (D1 papers), GRAPH_DB (D1 qnfo-graph nodes/edges/agent_memories),
//           PAPER_VZ (Vectorize qwav-research-v2), AI (embeddings).

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "qnfo-memory-mcp";
const SERVER_VERSION = "2.0.1";
const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";

const TOOLS = [
  { name: "search_papers", description: "Semantic search across QWAV research papers using Vectorize.", inputSchema: { type: "object", properties: { query: { type: "string", description: "Natural language search query" }, limit: { type: "number", description: "Maximum results (1-20, default 10)", default: 10 } }, required: ["query"] } },
  { name: "search_papers_enriched", description: "Semantic search papers AND return full body content. Searches Vectorize then enriches with D1 body_md, doi, authors.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number", default: 5 }, includeBody: { type: "boolean", default: true }, bodyLimitChars: { type: "number", default: 3000 } }, required: ["query"] } },
  { name: "resolve_paper_id", description: "Resolve a paper identifier (slug, Vectorize ID, KG ID, DOI) into ALL cross-system identifiers.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "search_memories", description: "Semantic search across persistent agent memories in Vectorize + D1.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number", default: 5 }, category: { type: "string" } }, required: ["query"] } },
  { name: "remember_fact", description: "Store a durable fact with vector embedding. D1 + Vectorize + optional KG bridge.", inputSchema: { type: "object", properties: { content: { type: "string" }, category: { type: "string", enum: ["user_preference", "project_fact", "task_outcome", "heuristic", "anti_pattern"] }, importance: { type: "number", default: 0.7 }, summary: { type: "string" }, session_id: { type: "string" } }, required: ["content", "category"] } },
  { name: "recall_facts", description: "Recall stored facts from D1 by category or keyword match.", inputSchema: { type: "object", properties: { category: { type: "string" }, keyword: { type: "string" }, limit: { type: "number", default: 10 } }, required: [] } },
  { name: "query_graph", description: "Query the QNFO Knowledge Graph. stats, nodes, neighbors, impact, raw SQL.", inputSchema: { type: "object", properties: { endpoint: { type: "string", enum: ["stats", "nodes", "neighbors", "impact", "query"] }, params: { type: "object" } }, required: ["endpoint"] } },
  { name: "get_paper_context", description: "Get full paper body content from D1 living-paper database by slug.", inputSchema: { type: "object", properties: { slug: { type: "string" }, limit_chars: { type: "number", default: 5000 } }, required: ["slug"] } }
];

function corsHeaders() {
  return { "Access-Control-Allow-Origin": "https://qnfo.org", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id" };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders() } });
}
function sanitize(s) {
  return String(s == null ? "" : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uD800-\uDFFF]/g, "")
    .trim()
    .substring(0, 800);
}

async function embed(env, text) {
  const result = await env.AI.run(EMBED_MODEL, { text: [text] });
  return result.data[0];
}
function sha256hex(str) {
  const enc = new TextEncoder().encode(str);
  return crypto.subtle.digest("SHA-256", enc).then(buf =>
    Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
  );
}

// ---------- Tool handlers ----------

async function tool_search_papers(args, env) {
  const query = sanitize(args.query);
  const limit = Math.min(parseInt(args.limit) || 10, 20);
  if (!query) return { content: [{ type: "text", text: JSON.stringify({ error: "query required" }) }], isError: true };
  const vec = await embed(env, query);
  const res = await env.PAPER_VZ.query(vec, { topK: limit * 3, returnMetadata: "all", returnValues: false });
  const matches = (res.matches || []).filter(m => !m.id.startsWith("mem:"));
  const results = [];
  for (const m of matches.slice(0, limit)) {
    const slug = m.metadata?.slug || null;
    let title = m.metadata?.title || null;
    if (slug && !title) {
      const paper = await env.LIVING_PAPER.prepare(
        "SELECT title FROM papers WHERE slug = ?1 LIMIT 1"
      ).bind(slug).first().catch(() => null);
      title = paper?.title || null;
    }
    results.push({
      id: m.id,
      slug,
      title,
      score: m.score,
      chunk: m.metadata?.chunk ?? m.metadata?.chunk_idx ?? null,
    });
  }
  return { content: [{ type: "text", text: JSON.stringify({ count: results.length, results }) }] };
}

async function tool_search_papers_enriched(args, env) {
  const query = sanitize(args.query);
  const limit = Math.min(parseInt(args.limit) || 5, 20);
  const includeBody = args.includeBody !== false;
  const bodyLimit = Math.min(parseInt(args.bodyLimitChars) || 3000, 50000);
  if (!query) return { content: [{ type: "text", text: JSON.stringify({ error: "query required" }) }], isError: true };
  const vec = await embed(env, query);
  const res = await env.PAPER_VZ.query(vec, { topK: limit * 3, returnMetadata: "all", returnValues: false });
  const matches = (res.matches || []).filter(m => !m.id.startsWith("mem:"));
  const results = [];
  for (const m of matches.slice(0, limit)) {
    const slug = m.metadata?.slug || null;
    let paper = null;
    if (slug) {
      paper = await env.LIVING_PAPER.prepare(
        "SELECT slug, title, doi, authors, abstract, body_md FROM papers WHERE slug = ?1 LIMIT 1"
      ).bind(slug).first().catch(() => null);
    }
    let body = null;
    if (paper?.body_md && includeBody) {
      body = paper.body_md.slice(0, bodyLimit);
    }
    results.push({
      id: m.id,
      slug,
      title: m.metadata?.title || paper?.title || null,
      score: m.score,
      doi: paper?.doi || null,
      authors: paper?.authors || null,
      abstract: paper?.abstract || null,
      body: body,
      body_truncated: paper?.body_md ? paper.body_md.length > bodyLimit : null,
    });
  }
  return { content: [{ type: "text", text: JSON.stringify({ count: results.length, results }) }] };
}

async function tool_resolve_paper_id(args, env) {
  const id = sanitize(args.id);
  if (!id) return { content: [{ type: "text", text: JSON.stringify({ error: "id required" }) }], isError: true };
  const out = { input: id };
  const paper = await env.LIVING_PAPER.prepare(
    "SELECT slug, title, doi, zenodo_doi, identifier, identifier_type, id, status, r2_key FROM papers WHERE slug = ?1 OR doi = ?2 OR zenodo_doi = ?3 OR identifier = ?4 LIMIT 5"
  ).bind(id, id, id, id).all().catch(() => null);
  if (paper?.results?.length) out.papers = paper.results;
  const node = await env.GRAPH_DB.prepare(
    "SELECT id, label, name, properties FROM nodes WHERE id = ?1 OR name = ?2 LIMIT 5"
  ).bind(id, id).all().catch(() => null);
  if (node?.results?.length) out.kg_nodes = node.results;
  try {
    const res = await env.PAPER_VZ.getByIds([id]);
    if (res?.results?.length) out.vector = res.results.map(v => ({ id: v.id, metadata: v.metadata }));
  } catch (e) { /* not a vector id */ }
  return { content: [{ type: "text", text: JSON.stringify(out) }] };
}

async function tool_search_memories(args, env) {
  const query = sanitize(args.query);
  const limit = Math.min(parseInt(args.limit) || 5, 20);
  const category = sanitize(args.category);
  if (!query) return { content: [{ type: "text", text: JSON.stringify({ error: "query required" }) }], isError: true };
  const vec = await embed(env, query);
  const res = await env.PAPER_VZ.query(vec, { topK: limit * 5, returnMetadata: "all", returnValues: false });
  let matches = (res.matches || []).filter(m => m.id.startsWith("mem:"));
  if (category) matches = matches.filter(m => m.id.startsWith("mem:" + category + ":"));
  const results = [];
  for (const m of matches.slice(0, limit)) {
    const rec = await env.GRAPH_DB.prepare(
      "SELECT id, category, content, summary, importance, session_id, created_at FROM agent_memories WHERE id = ?1"
    ).bind(m.id).first().catch(() => null);
    results.push({
      id: m.id,
      score: m.score,
      category: rec?.category || m.metadata?.category || null,
      content: rec?.content || m.metadata?.content || null,
      summary: rec?.summary || null,
      importance: rec?.importance || null,
      session_id: rec?.session_id || null,
      created_at: rec?.created_at || null,
    });
  }
  return { content: [{ type: "text", text: JSON.stringify({ count: results.length, results }) }] };
}

async function tool_remember_fact(args, env) {
  const content = sanitize(args.content);
  const category = args.category || "project_fact";
  const importance = args.importance != null ? Number(args.importance) : 0.7;
  const summary = args.summary ? sanitize(args.summary) : null;
  const session_id = args.session_id ? sanitize(args.session_id) : null;
  if (!content) return { content: [{ type: "text", text: JSON.stringify({ error: "content required" }) }], isError: true };
  const ts = Date.now();
  const id = "mem:" + category + ":" + ts + ":" + (await sha256hex(content)).slice(0, 8);
  const created_at = new Date().toISOString();
  const metadata_json = JSON.stringify({ source: "qnfo-memory-mcp", timestamp: created_at });
  await env.GRAPH_DB.prepare(
    "INSERT OR REPLACE INTO agent_memories (id, category, content, summary, importance, session_id, created_at, expires_at, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8)"
  ).bind(id, category, content, summary, importance, session_id, created_at, metadata_json).run();
  const vec = await embed(env, content);
  await env.PAPER_VZ.upsert([{
    id: id,
    values: vec,
    metadata: { kind: "memory", category: category, content: sanitize(content).slice(0, 800) },
  }]);
  return { content: [{ type: "text", text: JSON.stringify({ success: true, id, category, importance, created_at }) }] };
}

async function tool_recall_facts(args, env) {
  const category = args.category ? sanitize(args.category) : null;
  const keyword = args.keyword ? sanitize(args.keyword) : null;
  const limit = Math.min(parseInt(args.limit) || 10, 50);
  let rows;
  if (category && keyword) {
    rows = await env.GRAPH_DB.prepare(
      "SELECT id, category, content, summary, importance, session_id, created_at FROM agent_memories WHERE category = ?1 AND content LIKE ?2 ORDER BY importance DESC LIMIT ?3"
    ).bind(category, "%" + keyword + "%", limit).all();
  } else if (category) {
    rows = await env.GRAPH_DB.prepare(
      "SELECT id, category, content, summary, importance, session_id, created_at FROM agent_memories WHERE category = ?1 ORDER BY importance DESC LIMIT ?2"
    ).bind(category, limit).all();
  } else if (keyword) {
    rows = await env.GRAPH_DB.prepare(
      "SELECT id, category, content, summary, importance, session_id, created_at FROM agent_memories WHERE content LIKE ?1 ORDER BY importance DESC LIMIT ?2"
    ).bind("%" + keyword + "%", limit).all();
  } else {
    rows = await env.GRAPH_DB.prepare(
      "SELECT id, category, content, summary, importance, session_id, created_at FROM agent_memories ORDER BY importance DESC, created_at DESC LIMIT ?1"
    ).bind(limit).all();
  }
  return { content: [{ type: "text", text: JSON.stringify({ count: rows.results.length, results: rows.results }) }] };
}

async function tool_query_graph(args, env) {
  const endpoint = args.endpoint || "stats";
  const params = args.params || {};
  try {
    switch (endpoint) {
      case "stats": {
        const nodes = await env.GRAPH_DB.prepare("SELECT COUNT(*) AS c FROM nodes").first();
        const edges = await env.GRAPH_DB.prepare("SELECT COUNT(*) AS c FROM edges").first();
        const labels = await env.GRAPH_DB.prepare("SELECT label, COUNT(*) AS count FROM nodes GROUP BY label ORDER BY count DESC LIMIT 30").all();
        const rels = await env.GRAPH_DB.prepare("SELECT relationship_type, COUNT(*) AS count FROM edges GROUP BY relationship_type ORDER BY count DESC LIMIT 30").all();
        return { content: [{ type: "text", text: JSON.stringify({ totalNodes: nodes.c, totalEdges: edges.c, nodeLabels: labels.results, relationshipTypes: rels.results }) }] };
      }
      case "nodes": {
        const label = params.label ? sanitize(params.label) : null;
        const search = params.search ? sanitize(params.search) : null;
        let rows;
        if (label && search) {
          rows = await env.GRAPH_DB.prepare("SELECT id, label, name, properties FROM nodes WHERE label = ?1 AND (name LIKE ?2 OR id LIKE ?2) LIMIT 50").bind(label, "%" + search + "%").all();
        } else if (label) {
          rows = await env.GRAPH_DB.prepare("SELECT id, label, name, properties FROM nodes WHERE label = ?1 LIMIT 100").bind(label).all();
        } else if (search) {
          rows = await env.GRAPH_DB.prepare("SELECT id, label, name, properties FROM nodes WHERE name LIKE ?1 OR id LIKE ?1 LIMIT 50").bind("%" + search + "%").all();
        } else {
          rows = await env.GRAPH_DB.prepare("SELECT id, label, name, properties FROM nodes LIMIT 100").all();
        }
        return { content: [{ type: "text", text: JSON.stringify({ count: rows.results.length, results: rows.results }) }] };
      }
      case "neighbors": {
        const id = sanitize(params.id);
        if (!id) return { content: [{ type: "text", text: JSON.stringify({ error: "id required" }) }], isError: true };
        // Match both node id conventions: "paper:<slug>" (KG sync) and "paper-<slug>" (D1 identifier)
        const bare = id.replace(/^paper[:|-]/, "");
        const alt1 = "paper:" + bare;
        const alt2 = "paper-" + bare;
        const rows = await env.GRAPH_DB.prepare(
          "SELECT e.source_id, e.target_id, e.relationship_type, n.id, n.label, n.name FROM edges e LEFT JOIN nodes n ON (n.id = e.source_id OR n.id = e.target_id) WHERE e.source_id IN (?1, ?2, ?3) OR e.target_id IN (?1, ?2, ?3) LIMIT 100"
        ).bind(id, alt1, alt2).all();
        const neighbors = (rows.results || []).map(r => ({
          source_id: r.source_id, target_id: r.target_id, relationship: r.relationship_type,
          neighbor_id: r.id, label: r.label, name: r.name,
        }));
        return { content: [{ type: "text", text: JSON.stringify({ id, count: neighbors.length, neighbors }) }] };
      }
      case "impact": {
        const id = sanitize(params.id);
        if (!id) return { content: [{ type: "text", text: JSON.stringify({ error: "id required" }) }], isError: true };
        const upstream = await env.GRAPH_DB.prepare(
          "SELECT e.source_id AS id, e.relationship_type, n.label, n.name FROM edges e LEFT JOIN nodes n ON n.id = e.source_id WHERE e.target_id = ?1 LIMIT 50"
        ).bind(id).all();
        const downstream = await env.GRAPH_DB.prepare(
          "SELECT e.target_id AS id, e.relationship_type, n.label, n.name FROM edges e LEFT JOIN nodes n ON n.id = e.target_id WHERE e.source_id = ?1 LIMIT 50"
        ).bind(id).all();
        return { content: [{ type: "text", text: JSON.stringify({ id, upstreamDependencies: upstream.results, downstreamDependents: downstream.results, totalDependents: downstream.results.length }) }] };
      }
      case "query": {
        const sql = sanitize(params.query || params.sql);
        if (!sql || !/^\s*(SELECT|PRAGMA)/i.test(sql)) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "only SELECT/PRAGMA allowed" }) }], isError: true };
        }
        const rows = await env.GRAPH_DB.prepare(sql).all().catch(e => ({ results: [], error: e.message }));
        return { content: [{ type: "text", text: JSON.stringify({ count: rows.results.length, results: rows.results, error: rows.error || null }) }] };
      }
      default:
        return { content: [{ type: "text", text: JSON.stringify({ error: "unknown endpoint: " + endpoint }) }], isError: true };
    }
  } catch (e) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "internal error", detail: e.message }) }], isError: true };
  }
}

async function tool_get_paper_context(args, env) {
  const slug = sanitize(args.slug);
  const limit = Math.min(parseInt(args.limit_chars) || 5000, 100000);
  if (!slug) return { content: [{ type: "text", text: JSON.stringify({ error: "slug required" }) }], isError: true };
  const paper = await env.LIVING_PAPER.prepare(
    "SELECT slug, title, doi, authors, abstract, body_md, published, updated_at FROM papers WHERE slug = ?1 LIMIT 1"
  ).bind(slug).first().catch(() => null);
  if (!paper) return { content: [{ type: "text", text: JSON.stringify({ error: "slug not found" }) }], isError: true };
  const body = paper.body_md ? paper.body_md.slice(0, limit) : null;
  return { content: [{ type: "text", text: JSON.stringify({
    slug: paper.slug, title: paper.title, doi: paper.doi, authors: paper.authors,
    abstract: paper.abstract, body, body_truncated: paper.body_md ? paper.body_md.length > limit : null,
    published: paper.published, updated_at: paper.updated_at,
  }) }] };
}

async function callTool(name, args, env) {
  const handlers = {
    search_papers: tool_search_papers,
    search_papers_enriched: tool_search_papers_enriched,
    resolve_paper_id: tool_resolve_paper_id,
    search_memories: tool_search_memories,
    remember_fact: tool_remember_fact,
    recall_facts: tool_recall_facts,
    query_graph: tool_query_graph,
    get_paper_context: tool_get_paper_context,
  };
  const fn = handlers[name];
  return fn ? await fn(args, env) : { content: [{ type: "text", text: "Unknown tool: " + name }], isError: true };
}

// ---------- Transport ----------

function sseResponse() {
  let closed = false;
  const transform = new TransformStream();
  const writer = transform.writable.getWriter();
  const encoder = new TextEncoder();
  function send(data) {
    if (closed) return;
    writer.write(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
  }
  return {
    response: new Response(transform.readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", ...corsHeaders() } }),
    send,
    close: () => { closed = true; writer.close(); },
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

    if (url.pathname === "/health") {
      return json({
        status: "ok", server: SERVER_NAME, version: SERVER_VERSION, protocol: PROTOCOL_VERSION,
        tools: TOOLS.map(t => t.name),
        bindings: { ai: !!env.AI, d1_papers: !!env.LIVING_PAPER, d1_graph: !!env.GRAPH_DB, vz: !!env.PAPER_VZ },
        enhancements: ["search_papers_enriched", "resolve_paper_id", "memory_kg_bridge"],
        endpoints: { mcp_sse: "/mcp/sse", mcp_post: "/mcp" },
      });
    }

    if (url.pathname === "/mcp/sse" && request.method === "GET") {
      const sse = sseResponse();
      sse.send({ jsonrpc: "2.0", method: "endpoint", params: { uri: url.origin + "/mcp" } });
      setTimeout(() => sse.close(), 100);
      return sse.response;
    }

    if (url.pathname === "/mcp" && request.method === "POST") {
      let body;
      try { body = await request.json(); }
      catch (e) { return json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }, 400); }
      const method = body.method, params = body.params, id = body.id;
      if (method === "initialize") {
        return json({ jsonrpc: "2.0", id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } } });
      }
      if (method === "notifications/initialized") return new Response(null, { status: 200, headers: corsHeaders() });
      if (method === "tools/list") return json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      if (method === "tools/call") {
        const toolResult = await callTool(params.name, params.arguments || {}, env);
        return json({ jsonrpc: "2.0", id, result: toolResult });
      }
      if (method === "resources/list") return json({ jsonrpc: "2.0", id, result: { resources: [] } });
      return json({ jsonrpc: "2.0", id: id || null, error: { code: -32601, message: "Method not found: " + method } });
    }

    return json({ error: "Not found", path: url.pathname }, 404);
  }
};
