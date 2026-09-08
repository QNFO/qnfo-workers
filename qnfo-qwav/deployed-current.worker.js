var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// qnfo-qwav.js
var MAX_QUERY_CHARS = 500;
var EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
var CHAT_MODEL = "@cf/deepseek-ai/deepseek-v4-flash-0731";
var SYSTEM_PROMPT = "Answer questions using ONLY the provided QNFO/QWAV research corpus context. Cite paper titles when you draw on them. If the corpus does not contain an answer, say so plainly. Keep answers concise, precise, and faithful to the source papers.";
var worker_default = {
  async fetch(request, env) {
    const u = new URL(request.url), p = u.pathname;
    const h = corsHeaders();
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (p === "/health") return json({ status: "ok", worker: "qnfo-qwav", version: "2.1.0", bindings: { d1: !!env.LIVING_PAPER, vz: !!env.QWAV_VZ, ai: !!env.AI }, routes: ["/health", "/ask", "/ai/ask", "/ai/search"] }, 200, h);
    if (p === "/ask" && request.method === "POST") return handleAsk(request, env, h);
    if (p === "/ai/ask" && request.method === "POST") return handleAiAsk(request, env, h);
    if (p === "/ai/search" && request.method === "POST") return handleAiSearch(request, env, h);
    return json({ error: "Not found" }, 404, h);
  }
};
function corsHeaders() {
  return { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
}
__name(corsHeaders, "corsHeaders");
function json(obj, status, h) {
  status = status || 200;
  return new Response(JSON.stringify(obj), { status, headers: h || corsHeaders() });
}
__name(json, "json");
async function readQuery(request) {
  const body = await request.json().catch(function() {
    return {};
  });
  const query = (body.query || "").toString().trim();
  if (!query) return { error: "Missing query" };
  if (query.length > MAX_QUERY_CHARS) return { error: "Query too long (max " + MAX_QUERY_CHARS + " chars)" };
  return { query, body };
}
__name(readQuery, "readQuery");
async function searchCorpus(query, env, topK) {
  const embedResult = await env.AI.run(EMBED_MODEL, { text: [query] });
  const vector = embedResult && embedResult.data && embedResult.data[0] || (Array.isArray(embedResult) ? embedResult[0] : null);
  if (!vector) return [];
  const matches = await env.QWAV_VZ.query(vector, { topK, returnMetadata: "all" });
  const out = [];
  for (const m of matches.matches || []) {
    const slug = m.metadata && (m.metadata.slug || m.metadata.path || m.metadata.key) || null;
    let title = null, body = "";
    if (slug) {
      try {
        const row = await env.LIVING_PAPER.prepare("SELECT title, abstract, body_md FROM papers WHERE slug = ? LIMIT 1").bind(String(slug).replace(/\.md$/, "")).first();
        if (row) {
          title = row.title;
          body = (row.body_md || row.abstract || "").replace(/^---[\s\S]*?---\s*/, "").slice(0, 2500);
        }
      } catch (e) {
      }
    }
    if (!title && m.metadata && m.metadata.title) title = m.metadata.title;
    if (!body && m.metadata && (m.metadata.text || m.metadata.abstract)) body = String(m.metadata.text || m.metadata.abstract || "").slice(0, 2500);
    out.push({ id: m.id, score: m.score ?? null, slug: slug ? String(slug).replace(/\.md$/, "") : null, file: title || slug || m.id, title: title || slug || m.id, text: body });
  }
  return out;
}
__name(searchCorpus, "searchCorpus");
async function handleAsk(request, env, h) {
  try {
    var _a = await readQuery(request), query = _a.query, _b = _a.error, error = _b === void 0 ? null : _b, body = _a.body;
    if (error) return json({ error }, 400, h);
    var topK = Math.min(parseInt(body.limit) || 5, 25);
    if (env.AI && env.QWAV_VZ) {
      try {
        var results = await searchCorpus(query, env, topK);
        if (results.length) return json({ query, mode: "vector", count: results.length, results: results.map(function(r) {
          return { id: r.id, score: r.score, title: r.title, abstract: r.text.slice(0, 600), slug: r.slug };
        }) }, 200, h);
      } catch (e) {
      }
    }
    var ref = await env.LIVING_PAPER.prepare("SELECT title,abstract FROM papers WHERE title LIKE ? OR abstract LIKE ? LIMIT ?").bind("%" + query + "%", "%" + query + "%", topK).all();
    return json({ query, mode: "like_fallback", results: ref.results, count: ref.results.length }, 200, h);
  } catch (e) {
    return json({ error: e.message }, 500, h);
  }
}
__name(handleAsk, "handleAsk");
function parseChat(resp) {
  let c = "";
  if (resp && typeof resp.response === "string") c = resp.response;
  else if (resp && resp.choices && resp.choices[0]) c = resp.choices[0].message && resp.choices[0].message.content || resp.choices[0].text || "";
  else if (resp && resp.result && resp.result.response) c = resp.result.response;
  else if (resp && resp.result && resp.result.choices && resp.result.choices[0]) c = resp.result.choices[0].message && resp.result.choices[0].message.content || "";
  return String(c || "").trim();
}
__name(parseChat, "parseChat");
async function handleAiAsk(request, env, h) {
  var _a = await readQuery(request), query = _a.query, _b = _a.error, error = _b === void 0 ? null : _b;
  if (error) return json({ error }, 400, h);
  if (!env.AI || !env.QWAV_VZ) return json({ error: "Corpus Q&A unavailable (bindings)" }, 503, h);
  try {
    var results = await searchCorpus(query, env, 6);
    var sources = results.map(function(r) {
      return { file: r.file, slug: r.slug, score: r.score };
    });
    if (!results.length) {
      return json({ query, mode: "corpus_chat", answer: "The corpus has no matching research on that question yet.", sources: [], model: CHAT_MODEL }, 200, h);
    }
    var context = results.map(function(r, i) {
      return "[" + (i + 1) + "] " + (r.title || "untitled") + (r.slug ? " (slug: " + r.slug + ")" : "") + "\n" + r.text;
    }).join("\n\n");
    var userPrompt = "QUESTION:\n" + query + "\n\nCORPUS CONTEXT (use ONLY this; if it does not answer the question, say so plainly):\n" + context;
    var aiResp;
    try {
      aiResp = await env.AI.run(CHAT_MODEL, {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 1024,
        temperature: 0.3
      }, { gateway: { id: "default" } });
    } catch (e) {
      return json({ query, mode: "corpus_chat_fallback", answer: "Found " + results.length + " matching research sources (semantic search worked, answer model unavailable).", sources, model: null, error: e.message }, 200, h);
    }
    var answer = parseChat(aiResp) || "(no answer returned)";
    return json({ query, mode: "corpus_chat", answer, sources, model: CHAT_MODEL }, 200, h);
  } catch (e) {
    return json({ error: "AI answer failed: " + e.message }, 502, h);
  }
}
__name(handleAiAsk, "handleAiAsk");
async function handleAiSearch(request, env, h) {
  var _a = await readQuery(request), query = _a.query, _b = _a.error, error = _b === void 0 ? null : _b;
  if (error) return json({ error }, 400, h);
  if (!env.AI || !env.QWAV_VZ) return json({ error: "Corpus Q&A unavailable (bindings)" }, 503, h);
  try {
    var results = await searchCorpus(query, env, Math.min(parseInt(_a.body && _a.body.limit || 6, 10) || 6, 20));
    return json({ query, mode: "corpus_search", count: results.length, results: results.map(function(r) {
      return { file: r.file, slug: r.slug, score: r.score, content: r.text.slice(0, 600) };
    }) }, 200, h);
  } catch (e) {
    return json({ error: "Search failed: " + e.message }, 502, h);
  }
}
__name(handleAiSearch, "handleAiSearch");
export {
  worker_default as default
};