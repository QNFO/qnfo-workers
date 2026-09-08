var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var INDEX_TOKEN = "chnx-idx-v1-k9m2n4p7r5t8";
var EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
var CHUNK_SIZE = 1e3;
var CHUNK_OVERLAP = 200;
var EMBED_BATCH = 32;
var VZ_BATCH = 100;
var DEFAULT_INDEX_LIMIT = 300;
function sha256hex(str) {
  const enc = new TextEncoder().encode(str);
  return crypto.subtle.digest("SHA-256", enc).then(
    (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}
__name(sha256hex, "sha256hex");
__name2(sha256hex, "sha256hex");
function sanitize(s) {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uD800-\uDFFF]/g, "").trim().substring(0, 800);
}
__name(sanitize, "sanitize");
__name2(sanitize, "sanitize");
function chunkText(text) {
  const chunks = [];
  let start = 0;
  const n = text.length;
  while (start < n) {
    let end = Math.min(start + CHUNK_SIZE, n);
    if (end < n) {
      const period = text.lastIndexOf(".", end);
      if (period > start + CHUNK_SIZE / 2) end = period + 1;
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= n) break;
    start = end - CHUNK_OVERLAP;
    if (start < 0) start = 0;
  }
  return chunks.filter((c) => c.length > 20);
}
__name(chunkText, "chunkText");
__name2(chunkText, "chunkText");
async function handleWebhook(env, slug) {
  if (!slug) return json({ error: "missing slug" }, 400);
  const paper = await env.LIVING_PAPER.prepare(
    "SELECT slug, body_md, updated_at FROM papers WHERE slug = ?1"
  ).bind(slug).first();
  if (!paper) return json({ success: false, error: "slug not found" }, 404);
  if (!paper.body_md) return json({ success: true, indexed: false, skipped: true, reason: "empty_body_md" });
  const hash = await sha256hex(paper.body_md);
  const existing = await env.LIVING_PAPER.prepare(
    "SELECT body_hash FROM index_state WHERE slug = ?1"
  ).bind(slug).first();
  if (existing && existing.body_hash === hash) {
    return json({ success: true, indexed: false, skipped: true, reason: "unchanged" });
  }
  const chunks = chunkText(paper.body_md);
  const vectors = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const result = await env.AI.run(EMBED_MODEL, { text: batch }, { gateway: { id: "default" } });
    for (let j = 0; j < batch.length; j++) {
      const idx = i + j;
      vectors.push({
        id: (await sha256hex(slug + ":" + idx)).slice(0, 32),
        values: result.data[j],
        metadata: {
          slug: sanitize(slug),
          chunk: String(idx),
          total: String(chunks.length)
        }
      });
    }
  }
  for (let i = 0; i < vectors.length; i += VZ_BATCH) {
    await env.PAPER_VZ.upsert(vectors.slice(i, i + VZ_BATCH));
  }
  await env.LIVING_PAPER.prepare(
    "INSERT OR REPLACE INTO index_state (slug, chunks, body_hash, body_len, indexed_at, errors) VALUES (?1, ?2, ?3, ?4, datetime('now'), 0)"
  ).bind(slug, chunks.length, hash, paper.body_md.length).run();
  return json({ success: true, indexed: true, skipped: false, chunks: chunks.length, body_len: paper.body_md.length, errors: 0 });
}
__name(handleWebhook, "handleWebhook");
__name2(handleWebhook, "handleWebhook");
async function handleIndex(env, url) {
  const offset = parseInt(url.searchParams.get("offset") || "0") || 0;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || String(DEFAULT_INDEX_LIMIT)) || DEFAULT_INDEX_LIMIT, 500);
  const rows = await env.LIVING_PAPER.prepare(
    "SELECT slug, body_md FROM papers WHERE body_md IS NOT NULL AND body_md != '' ORDER BY slug LIMIT ?1 OFFSET ?2"
  ).bind(limit, offset).all();
  const total = await env.LIVING_PAPER.prepare(
    "SELECT COUNT(*) AS c FROM papers WHERE body_md IS NOT NULL AND body_md != ''"
  ).first();
  const totalCount = total ? total.c : 0;
  let indexed = 0, skipped = 0, totalChunks = 0, errors = 0;
  const allVectors = [];
  for (const row of rows.results || []) {
    try {
      const hash = await sha256hex(row.body_md);
      const existing = await env.LIVING_PAPER.prepare(
        "SELECT body_hash FROM index_state WHERE slug = ?1"
      ).bind(row.slug).first();
      if (existing && existing.body_hash === hash) {
        skipped++;
        continue;
      }
      const chunks = chunkText(row.body_md);
      for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
        const batch = chunks.slice(i, i + EMBED_BATCH);
        const result = await env.AI.run(EMBED_MODEL, { text: batch }, { gateway: { id: "default" } });
        for (let j = 0; j < batch.length; j++) {
          const idx = i + j;
          allVectors.push({
            id: (await sha256hex(row.slug + ":" + idx)).slice(0, 32),
            values: result.data[j],
            metadata: {
              slug: sanitize(row.slug),
              chunk: String(idx),
              total: String(chunks.length)
            }
          });
        }
      }
      await env.LIVING_PAPER.prepare(
        "INSERT OR REPLACE INTO index_state (slug, chunks, body_hash, body_len, indexed_at, errors) VALUES (?1, ?2, ?3, ?4, datetime('now'), 0)"
      ).bind(row.slug, chunks.length, hash, row.body_md.length).run();
      indexed++;
      totalChunks += chunks.length;
    } catch (e) {
      errors++;
    }
  }
  for (let i = 0; i < allVectors.length; i += VZ_BATCH) {
    await env.PAPER_VZ.upsert(allVectors.slice(i, i + VZ_BATCH));
  }
  const done = offset + limit >= totalCount;
  return json({
    success: true,
    done,
    total: totalCount,
    offset: offset + limit,
    pct: Math.round((offset + limit) / totalCount * 100),
    batch: { indexed, skipped, chunks: totalChunks, errors }
  });
}
__name(handleIndex, "handleIndex");
__name2(handleIndex, "handleIndex");
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
__name(json, "json");
__name2(json, "json");
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const slug = url.searchParams.get("slug");
    if (path === "/webhook" || path === "/index") {
      const token = request.headers.get("X-Index-Token") || (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (token !== env.INDEX_TOKEN && token !== INDEX_TOKEN) {
        return json({ error: "unauthorized \u2014 X-Index-Token required" }, 401);
      }
    }
    try {
      switch (path) {
        case "/health":
          return json({
            status: "ok",
            worker: "qnfo-paper-indexer",
            version: "2.2-scheduled-daily",
            features: ["on-demand-webhook", "on-demand-batch", "scheduled-daily"],
            bindings: { ai: !!env.AI, d1: !!env.LIVING_PAPER, vz: !!env.PAPER_VZ }
          });
        case "/count":
          const c = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS c FROM index_state").first();
          return json({ count: c ? c.c : 0, worker: "qnfo-paper-indexer" });
        case "/webhook":
          return await handleWebhook(env, slug);
        case "/index":
          return await handleIndex(env, url);
        case "/cron/debug":
          return json({ worker: "qnfo-paper-indexer", version: "2.2-scheduled-daily", cron: "0 6 * * *", note: "daily scheduled batch index (dedup-aware)" });
        default:
          return json({ error: "not found" }, 404);
      }
    } catch (e) {
      return json({ error: "internal error", detail: e.message }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    console.log("[qnfo-paper-indexer] cron triggered:", cron);
    try {
      const fakeUrl = new URL("https://internal/?offset=0&limit=300");
      const result = await handleIndex(env, fakeUrl);
      console.log("[qnfo-paper-indexer] scheduled index:", JSON.stringify(result));
    } catch (e) {
      console.error("[qnfo-paper-indexer] scheduled error:", e.message);
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
