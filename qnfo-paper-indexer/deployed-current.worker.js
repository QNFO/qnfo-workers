// MERGED qnfo-paper-indexer <- qnfo-impact (absorbed 2026-09-13)
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "3.0.1";
function auth(req, env) {
  if (!env.IMPACT_TOKEN) return true;
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t) return false;
  const a = new TextEncoder().encode(t), b = new TextEncoder().encode(env.IMPACT_TOKEN);
  if (a.byteLength !== b.byteLength) return false;
  let d = 0;
  for (let i = 0; i < a.byteLength; i++) d |= a[i] ^ b[i];
  return d === 0;
}
__name(auth, "auth");
async function ensureSchema(env) {
  await env.QNFO_AUDIT.prepare("CREATE TABLE IF NOT EXISTS citation_stats (id TEXT PRIMARY KEY, doi TEXT, source TEXT, metric TEXT, value REAL, collected_at TEXT)").run();
  await env.QNFO_AUDIT.prepare("CREATE TABLE IF NOT EXISTS impact_scores (doi TEXT PRIMARY KEY, score REAL, updated_at TEXT)").run();
}
__name(ensureSchema, "ensureSchema");
async function fetchJson(url, timeoutMs = 2e4) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "QNFO/qnfo-impact/0.1 (mailto:rowan@qnfo.org)" } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}
__name(fetchJson, "fetchJson");
async function runImpact(env, commit, limit) {
  await ensureSchema(env);
  const out = { papers: 0, stats: [], errors: [] };
  if (!commit) {
    const n2 = await env.LIVING_PAPER.prepare("SELECT COUNT(*) c FROM papers WHERE doi IS NOT NULL OR zenodo_doi IS NOT NULL").first();
    return { preview: true, papersWithDoi: n2 ? n2.c : 0 };
  }
  const n = Math.min(limit || 50, 100);
  const papers = await env.LIVING_PAPER.prepare("SELECT slug, doi, zenodo_doi FROM papers WHERE doi IS NOT NULL OR zenodo_doi IS NOT NULL ORDER BY created_at DESC LIMIT ?1").bind(n).all();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const p of papers.results || []) {
    const doi = p.zenodo_doi || p.doi;
    if (!doi) continue;
    out.papers++;
    const entry = { slug: p.slug, doi, sources: {} };
    let crCited;
    if (!doi.startsWith("10.5281/zenodo")) {
      const cr = await fetchJson("https://api.crossref.org/works/" + encodeURIComponent(doi));
      crCited = cr?.message && cr.message["is-referenced-by-count"];
    }
    const crCited2 = typeof crCited === "number" ? crCited : void 0;
    if (typeof crCited2 === "number") entry.sources.crossref = crCited2;
    const oa = await fetchJson("https://api.openalex.org/works/doi:" + encodeURIComponent(doi));
    const oaCited = oa?.cited_by_count;
    if (typeof oaCited === "number") entry.sources.openalex = oaCited;
    const zn = await fetchJson("https://zenodo.org/api/records?q=doi:" + encodeURIComponent('"' + doi + '"') + "&size=1");
    const rec = zn && zn.hits && zn.hits.hits && zn.hits.hits[0];
    if (rec) {
      let views = 0, downloads = 0;
      const st = rec.stats || {};
      if (st.views || st.downloads) {
        views = st.views || 0;
        downloads = st.downloads || 0;
      } else {
        for (const f of rec.files || []) {
          views += f.views || 0;
          downloads += f.downloads || 0;
        }
      }
      if (views || downloads) entry.sources.zenodo = { views, downloads };
    }
    const cited = (entry.sources.openalex || 0) + (entry.sources.crossref || 0);
    const dls = entry.sources.zenodo && entry.sources.zenodo.downloads || 0;
    const vws = entry.sources.zenodo && entry.sources.zenodo.views || 0;
    const score = Math.round((cited + dls / 50 + vws / 500) * 1e3) / 1e3;
    try {
      for (const [src, metric, value] of [["crossref", "is-referenced-by-count", entry.sources.crossref], ["openalex", "cited_by_count", entry.sources.openalex], ["zenodo", "views", entry.sources.zenodo && entry.sources.zenodo.views], ["zenodo", "downloads", entry.sources.zenodo && entry.sources.zenodo.downloads]]) {
        if (value !== void 0 && value !== null) {
          await env.QNFO_AUDIT.prepare("INSERT OR REPLACE INTO citation_stats (id, doi, source, metric, value, collected_at) VALUES (?1,?2,?3,?4,?5,?6)").bind(crypto.randomUUID(), doi, src, metric, value, now).run();
        }
      }
      await env.QNFO_AUDIT.prepare("INSERT OR REPLACE INTO impact_scores (doi, score, updated_at) VALUES (?1,?2,?3)").bind(doi, score, now).run();
    } catch (e) {
      out.errors.push({ slug: p.slug, error: String(e && e.message || e).slice(0, 200) });
    }
    out.stats.push(entry);
  }
  return out;
}
__name(runImpact, "runImpact");

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
// SECRET-HYGIENE-1 2026-09-22: the token is no longer hardcoded in source; it is read
// from the INDEX_TOKEN secret binding. (The value was previously committed here and in
// wrangler.toml; rotate it and treat the old value as burned.)
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
      if (token !== env.INDEX_TOKEN) return json({ error: "unauthorized" }, 401);
    }
    try {
      switch (path) {
        case "/health":
          return json({ status: "ok", worker: "qnfo-paper-indexer", version: "3.0.1", features: ["on-demand-webhook","on-demand-batch","scheduled-daily","citation-impact"], bindings: { ai: !!env.AI, d1_living: !!env.LIVING_PAPER, d1_audit: !!env.QNFO_AUDIT, vz: !!env.PAPER_VZ } });
        case "/count": {
          const c = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS c FROM index_state").first();
          return json({ count: c ? c.c : 0, worker: "qnfo-paper-indexer" });
        }
        case "/webhook": return await handleWebhook(env, slug);
        case "/index": return await handleIndex(env, url);
        case "/cron/debug": return json({ worker: "qnfo-paper-indexer", version: "3.0.1", crons: ["5 6 * * *","0 4 * * *"] });
        case "/run": {
          const commit = url.searchParams.get("commit") === "1";
          if (commit && !auth(request, env)) return json({ error: "unauthorized" }, 401);
          return json(await runImpact(env, commit, parseInt(url.searchParams.get("limit") || "50", 10)));
        }
        case "/stats": {
          const rows = await env.QNFO_AUDIT.prepare("SELECT doi, score, updated_at FROM impact_scores ORDER BY score DESC LIMIT 20").all();
          return json({ top: rows.results });
        }
        default: return json({ error: "not found" }, 404);
      }
    } catch (e) { return json({ error: "internal error", detail: e.message }, 500); }
  },
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    console.log("[qnfo-paper-indexer] cron:", cron);
    try {
      if (cron === "0 4 * * *") {
        const r = await runImpact(env, true, 50);
        console.log("[qnfo-impact] scheduled:", JSON.stringify({ papers: r.papers, errors: r.errors.length }));
      } else {
        const fakeUrl = new URL("https://internal/?offset=0&limit=300");
        const result = await handleIndex(env, fakeUrl);
        console.log("[qnfo-paper-indexer] scheduled index:", JSON.stringify(result));
      }
    } catch (e) { console.error("[qnfo-paper-indexer] scheduled error:", e.message); }
  }
};
export { worker_default as default };