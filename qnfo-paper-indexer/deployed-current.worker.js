// MERGED qnfo-paper-indexer <- qnfo-impact (absorbed 2026-09-13)
// v3.0.3-status-filter-purge (2026-09-26) - completes #1153 PUBLICATION-INDEXER-NO-STATUS-FILTER-1
//   Merges peer v3.0.2 (write-side status guard, FLAGGED_STATUSES denylist) and adds the
//   missing remediation half: the ~1563 vectors ALREADY embedded from non-canonical
//   records were never removed by v3.0.2, which only stopped NEW writes.
//   CHANGES ON TOP OF v3.0.2:
//     (1) CORPUS_STATUSES allowlist replaces the denylist as the primary gate. A denylist
//         leaks any future status value that is not on it; an allowlist fails closed.
//         Today both give the identical set (published 452 + distributed 2 +
//         external_preprint 2 = 456 rows with body_md).
//     (2) /purge (token-guarded, ?commit=1 to apply, default dry-run) deletes contaminated
//         vectors via PAPER_VZ.deleteByIds and their index_state rows, plus stale
//         index_state rows whose slug has no papers row.
//     (3) the daily 06:05Z cron runs purge BEFORE reindexing -> corpus self-heals with no
//         operator action.
//     (4) /count reports corpus_total and contaminated counts for drift detection.
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

var VERSION = "3.0.13-doi-scrub"; // 3.0.13 NOZ-DOI-1 (2026-10-10): impact pass measures third-party DOIs only (Crossref, OpenAlex); no repository lookups, no selected-works list. 3.0.12-math-browser-metric: MATH-BROWSER-2 (#1890): publishes paper_math_browser_fail_pages from the gateway browser_sample at 06:05. 3.0.11 RENDER-HEALTH-1 (2026-10-02): publishes paper_render_defect_pages at 06:05 from papers.render_defects (gateway 06:00 sweep).
var EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
var CHUNK_SIZE = 1e3;
var CHUNK_OVERLAP = 200;
var EMBED_BATCH = 32;
var VZ_BATCH = 100;
var DEFAULT_INDEX_LIMIT = 300;
// SECRET-HYGIENE-1 2026-09-22: the token is no longer hardcoded in source; it is read
// from the INDEX_TOKEN secret binding.
// CORPUS_STATUSES = the ONLY papers.status values permitted in qwav-research-v2.
var CORPUS_STATUSES = ["published", "external_preprint", "distributed"];
var CORPUS_IN = "('published','external_preprint','distributed')";
var CORPUS_WHERE = "body_md IS NOT NULL AND body_md != '' AND status IN " + CORPUS_IN;
function auth(req, env) {
  if (!env.IMPACT_TOKEN) return false;
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t) return false;
  const a = new TextEncoder().encode(t), b = new TextEncoder().encode(env.IMPACT_TOKEN);
  if (a.byteLength !== b.byteLength) return false;
  let d = 0;
  for (let i = 0; i < a.byteLength; i++) d |= a[i] ^ b[i];
  return d === 0;
}
async function ensureSchema(env) {
  await env.QNFO_AUDIT.prepare("CREATE TABLE IF NOT EXISTS citation_stats (id TEXT PRIMARY KEY, doi TEXT, source TEXT, metric TEXT, value REAL, collected_at TEXT)").run();
  await env.QNFO_AUDIT.prepare("CREATE TABLE IF NOT EXISTS impact_scores (doi TEXT PRIMARY KEY, score REAL, updated_at TEXT)").run();
}
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
// NOZ-DOI-1 (2026-10-10): every DOI under the owner's closed repository prefix is dead. The pass measures only
// third-party DOIs (Crossref, OpenAlex); a value with that prefix in papers.doi is treated as absent.
var DEAD_DOI = /10\.5281\//;
async function runImpact(env, commit, limit) {
  await ensureSchema(env);
  const out = { papers: 0, stats: [], errors: [] };
  if (!commit) {
    const n2 = await env.LIVING_PAPER.prepare("SELECT COUNT(*) c FROM papers WHERE doi IS NOT NULL AND doi NOT LIKE '10.5281/%'").first();
    return { preview: true, papersWithDoi: n2 ? n2.c : 0 };
  }
  const n = Math.min(limit || 50, 100);
  const papers = await env.LIVING_PAPER.prepare("SELECT slug, doi FROM papers WHERE doi IS NOT NULL AND doi NOT LIKE '10.5281/%' ORDER BY created_at DESC LIMIT ?1").bind(n).all();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const list = (papers.results || []).filter((p) => p.doi && !DEAD_DOI.test(p.doi));
  for (const p of list) {
    const doi = p.doi;
    out.papers++;
    const entry = { slug: p.slug, doi, sources: {} };
    const cr = await fetchJson("https://api.crossref.org/works/" + encodeURIComponent(doi));
    const crCited = cr?.message && cr.message["is-referenced-by-count"];
    if (typeof crCited === "number") entry.sources.crossref = crCited;
    const oa = await fetchJson("https://api.openalex.org/works/doi:" + encodeURIComponent(doi));
    const oaCited = oa?.cited_by_count;
    if (typeof oaCited === "number") entry.sources.openalex = oaCited;
    const cited = (entry.sources.openalex || 0) + (entry.sources.crossref || 0);
    const score = Math.round(cited * 1e3) / 1e3;
    try {
      for (const [src, metric, value] of [["crossref", "is-referenced-by-count", entry.sources.crossref], ["openalex", "cited_by_count", entry.sources.openalex]]) {
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

function sha256hex(str) {
  const enc = new TextEncoder().encode(str);
  return crypto.subtle.digest("SHA-256", enc).then(
    (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}
function sanitize(s) {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uD800-\uDFFF]/g, "").trim().substring(0, 800);
}
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
async function embedVectors(env, slug, chunks) {
  const vectors = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const result = await env.AI.run(EMBED_MODEL, { text: batch }, { gateway: { id: "default" } });
    for (let j = 0; j < batch.length; j++) {
      const idx = i + j;
      vectors.push({
        id: (await sha256hex(slug + ":" + idx)).slice(0, 32),
        values: result.data[j],
        metadata: { slug: sanitize(slug), chunk: String(idx), total: String(chunks.length) }
      });
    }
  }
  return vectors;
}

async function handleWebhook(env, slug) {
  if (!slug) return json({ error: "missing slug" }, 400);
  const paper = await env.LIVING_PAPER.prepare(
    "SELECT slug, body_md, updated_at, status FROM papers WHERE slug = ?1"
  ).bind(slug).first();
  if (!paper) return json({ success: false, error: "slug not found" }, 404);
  if (!CORPUS_STATUSES.includes(String(paper.status))) {
    return json({ success: true, indexed: false, skipped: true, reason: "status_not_in_corpus", status: paper.status }, 409);
  }
  if (!paper.body_md) return json({ success: true, indexed: false, skipped: true, reason: "empty_body_md" });
  const hash = await sha256hex(paper.body_md);
  const existing = await env.LIVING_PAPER.prepare(
    "SELECT body_hash FROM index_state WHERE slug = ?1"
  ).bind(slug).first();
  if (existing && existing.body_hash === hash) {
    return json({ success: true, indexed: false, skipped: true, reason: "unchanged" });
  }
  const chunks = chunkText(paper.body_md);
  const vectors = await embedVectors(env, slug, chunks);
  for (let i = 0; i < vectors.length; i += VZ_BATCH) {
    await env.PAPER_VZ.upsert(vectors.slice(i, i + VZ_BATCH));
  }
  await env.LIVING_PAPER.prepare(
    "INSERT OR REPLACE INTO index_state (slug, chunks, body_hash, body_len, indexed_at, errors) VALUES (?1, ?2, ?3, ?4, datetime('now'), 0)"
  ).bind(slug, chunks.length, hash, paper.body_md.length).run();
  return json({ success: true, indexed: true, skipped: false, chunks: chunks.length, body_len: paper.body_md.length, errors: 0 });
}

async function handleIndex(env, url) {
  const offset = parseInt(url.searchParams.get("offset") || "0") || 0;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || String(DEFAULT_INDEX_LIMIT)) || DEFAULT_INDEX_LIMIT, 500);
  const rows = await env.LIVING_PAPER.prepare(
    "SELECT slug, body_md FROM papers WHERE " + CORPUS_WHERE + " ORDER BY slug LIMIT ?1 OFFSET ?2"
  ).bind(limit, offset).all();
  const total = await env.LIVING_PAPER.prepare(
    "SELECT COUNT(*) AS c FROM papers WHERE " + CORPUS_WHERE
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
      const vs = await embedVectors(env, row.slug, chunks);
      for (const v of vs) allVectors.push(v);
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
    pct: totalCount ? Math.round((offset + limit) / totalCount * 100) : 100,
    batch: { indexed, skipped, chunks: totalChunks, errors }
  });
}

// Remediation half of #1153: remove vectors already embedded from non-canonical records.
async function handlePurge(env, dryRun) {
  // #1272 PURGE-TARGET-SOURCE-GAP-1 (2026-09-28): v3.0.4 enumerated purge targets from
  // index_state ONLY. Residue exists precisely for slugs whose index_state row is ABSENT,
  // because earlier pipelines embedded non-canonical records without writing index_state.
  // Live probe 2026-09-28: vectorize_query returned id "1-from-self-to-society__0"
  // (papers.status=quarantined, index_state rows=0) -> unreachable by both v3.0.4 arms, so
  // the 06:05Z self-heal could never clean it. Enumerate papers directly as well.
  const bySlug = /* @__PURE__ */ new Map();
  const bad = await env.LIVING_PAPER.prepare(
    "SELECT i.slug AS slug, i.chunks AS chunks, p.status AS status FROM index_state i JOIN papers p ON p.slug = i.slug WHERE p.status NOT IN " + CORPUS_IN
  ).all();
  for (const r of bad.results || []) bySlug.set(r.slug, { slug: r.slug, chunks: r.chunks || 0, reason: "status=" + r.status });
  const stale = await env.LIVING_PAPER.prepare(
    "SELECT i.slug AS slug, i.chunks AS chunks FROM index_state i LEFT JOIN papers p ON p.slug = i.slug WHERE p.slug IS NULL"
  ).all();
  for (const r of stale.results || []) bySlug.set(r.slug, { slug: r.slug, chunks: r.chunks || 0, reason: "no_papers_row" });
  const orphan = await env.LIVING_PAPER.prepare(
    "SELECT p.slug AS slug, p.status AS status, p.body_md AS body_md FROM papers p WHERE p.body_md IS NOT NULL AND p.body_md != '' AND p.status NOT IN " + CORPUS_IN
  ).all();
  for (const r of orphan.results || []) {
    if (bySlug.has(r.slug)) continue;
    bySlug.set(r.slug, { slug: r.slug, chunks: chunkText(r.body_md).length, reason: "status_orphan=" + r.status });
  }
  const targets = Array.from(bySlug.values());
  let vectorsDeleted = 0;
  const detail = [];
  for (const t of targets) {
    const ids = [];
    for (let idx = 0; idx < t.chunks; idx++) ids.push((await sha256hex(t.slug + ":" + idx)).slice(0, 32));
    // #1184 VECTOR-PURGE-ID-COVERAGE-GAP-1 (2026-09-27): the canonical scheme only covers
    // sha256(slug:idx). Legacy slug__N and paper:slug:N vectors survive. Collected here,
    // deleted in a separate call below so a failure cannot affect the canonical deletion.
    const legacyIds = [];
    for (let idx = 0; idx < t.chunks; idx++) {
      legacyIds.push(t.slug + "__" + idx);
      legacyIds.push("paper:" + t.slug + ":" + idx);
    }
    if (!dryRun) {
      for (let i = 0; i < ids.length; i += VZ_BATCH) {
        const slice = ids.slice(i, i + VZ_BATCH);
        try {
          await env.PAPER_VZ.deleteByIds(slice);
          vectorsDeleted += slice.length;
        } catch (e) {
        }
      }
      for (let i = 0; i < legacyIds.length; i += VZ_BATCH) {
        const lslice = legacyIds.slice(i, i + VZ_BATCH);
        try {
          await env.PAPER_VZ.deleteByIds(lslice);
          vectorsDeleted += lslice.length;
        } catch (e) {
        }
      }
      try {
        await env.LIVING_PAPER.prepare("DELETE FROM index_state WHERE slug = ?1").bind(t.slug).run();
      } catch (e) {
      }
    }
    detail.push({ slug: t.slug, chunks: t.chunks, reason: t.reason });
  }
  return { success: true, dry_run: !!dryRun, records: targets.length, vectors_deleted: vectorsDeleted, detail };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const slug = url.searchParams.get("slug");
    if (path === "/webhook" || path === "/index" || path === "/purge") {
      const token = request.headers.get("X-Index-Token") || (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (token !== env.INDEX_TOKEN) return json({ error: "unauthorized" }, 401);
    }
    try {
      switch (path) {
        case "/health":
          return json({ status: "ok", worker: "qnfo-paper-indexer", version: VERSION, capabilities: ["paper-indexing", "vectorize-upsert", "citation-impact", "orphan-purge"], limitations: ["indexes only papers in corpus statuses", "scheduled runs at 04:00 and 06:05 daily"], features: ["on-demand-webhook", "on-demand-batch", "scheduled-daily", "citation-impact", "status-filter", "purge", "purge-orphan-sweep", "cron-self-heal"], corpus_statuses: CORPUS_STATUSES, bindings: { ai: !!env.AI, d1_living: !!env.LIVING_PAPER, d1_audit: !!env.QNFO_AUDIT, vz: !!env.PAPER_VZ } });
        case "/count": {
          const c = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS c FROM index_state").first();
          const g = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS c FROM papers WHERE " + CORPUS_WHERE).first();
          const b = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS c FROM index_state i JOIN papers p ON p.slug = i.slug WHERE p.status NOT IN " + CORPUS_IN).first();
          const s = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS c FROM index_state i LEFT JOIN papers p ON p.slug = i.slug WHERE p.slug IS NULL").first();
          const o = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS c FROM papers p WHERE p.body_md IS NOT NULL AND p.body_md != '' AND p.status NOT IN " + CORPUS_IN).first();
          return json({ count: c ? c.c : 0, corpus_total: g ? g.c : 0, contaminated: b ? b.c : 0, stale: s ? s.c : 0, orphan_contaminated: o ? o.c : 0, worker: "qnfo-paper-indexer", version: VERSION });
        }
        case "/purge": return json(await handlePurge(env, url.searchParams.get("commit") !== "1"));
        case "/webhook": return await handleWebhook(env, slug);
        case "/index": return await handleIndex(env, url);
        case "/cron/debug": return json({ worker: "qnfo-paper-indexer", version: VERSION, crons: ["5 6 * * *", "0 4 * * *"], corpus_statuses: CORPUS_STATUSES, purge_in_cron: "5 6 * * *" });
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
        // RENDER-HEALTH-1 (3.0.11, pillar reach): the gateway's 06:00 cron renders every public paper and writes
        // papers.render_defects; this publishes the count of pages with defects as metric paper_render_defect_pages
        // (target 0; trigger in migrations/2026-10-02-render-health.sql). Nothing is written until a sweep has run.
        try {
          const rh = await env.LIVING_PAPER.prepare("SELECT SUM(CASE WHEN render_defects <> 0 THEN 1 ELSE 0 END) AS bad, COUNT(render_checked_at) AS checked FROM papers WHERE status NOT IN ('duplicate','kg-backfill','quarantined') AND render_checked_at >= datetime('now', '-2 days')").first();
          if (rh && rh.checked > 0) await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2 WHERE metric = 'paper_render_defect_pages'").bind(String(rh.bad || 0), new Date().toISOString()).run();
          console.log("[qnfo-paper-indexer] render health:", JSON.stringify(rh));
        } catch (e) { console.error("[qnfo-paper-indexer] render health error:", e.message); }
        // MATH-BROWSER-2 (3.0.12, #1890): the gateway's 06:00 cron loads five live pages in a real browser (qnfo-pdf
        // /math-check) and serves the report as browser_sample in its open /api/render-health. This publishes the failing
        // count as paper_math_browser_fail_pages (trigger 798). A sample older than two days, or none, leaves the metric
        // unmeasured (null) rather than passing.
        try {
          const r = await fetch("https://papers.qnfo.org/api/render-health", { headers: { "User-Agent": "qnfo-paper-indexer/" + VERSION } });
          const bs = r.ok ? ((await r.json()) || {}).browser_sample : null;
          const fresh = bs && bs.pages > 0 && Date.now() - Date.parse(bs.checked_at) < 2 * 86400000;
          await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2 WHERE metric = 'paper_math_browser_fail_pages'").bind(fresh ? String(bs.failing || 0) : null, new Date().toISOString()).run();
          console.log("[qnfo-paper-indexer] browser math sample:", fresh ? JSON.stringify({ pages: bs.pages, failing: bs.failing, errors: bs.errors }) : "none or stale");
        } catch (e) { console.error("[qnfo-paper-indexer] browser math sample error:", e.message); }
        const p = await handlePurge(env, false);
        console.log("[qnfo-paper-indexer] scheduled purge:", JSON.stringify({ records: p.records, vectors_deleted: p.vectors_deleted }));
        // #1188 PAPER-INDEXER-CRON-WINDOW-STARVATION-1 (2026-09-27): the window used to be
        // hardcoded offset=0&limit=300 against a 444-paper canonical corpus, so 144 papers
        // could never be re-indexed. Rotate the window by UTC day so the whole corpus is
        // covered within ceil(total/limit) days.
        const _tot = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS c FROM papers WHERE " + CORPUS_WHERE).first();
        const _total = _tot ? _tot.c : 0;
        const _windows = Math.max(1, Math.ceil(_total / DEFAULT_INDEX_LIMIT));
        const _off = (Math.floor(Date.now() / 86400000) % _windows) * DEFAULT_INDEX_LIMIT;
        const fakeUrl = new URL("https://internal/?offset=" + _off + "&limit=" + DEFAULT_INDEX_LIMIT);
        const result = await handleIndex(env, fakeUrl);
        console.log("[qnfo-paper-indexer] scheduled index:", JSON.stringify(result));
      }
    } catch (e) { console.error("[qnfo-paper-indexer] scheduled error:", e.message); }
  }
};
export { worker_default as default };