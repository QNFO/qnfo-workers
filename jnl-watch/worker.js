var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var COMMUNITY_ID = "87f14e85-7156-4146-84e9-9e3a11e29c1d";
var COMMUNITY = `https://zenodo.org/api/communities/${COMMUNITY_ID}/records`;
var CURSOR_KEY = "cursor:lastModified";
var VERSION = "0.1.7";
var PAGE_SIZE = 25;
var MAX_PAGES = 40;
var UA = "jnl-watch/0.1.6 (QNFO AI-referee overlay for Zenodo community aiscience)";
var DDL = [
  `CREATE TABLE IF NOT EXISTS jnl_records (
    recid INTEGER PRIMARY KEY, conceptrecid INTEGER,
    doi TEXT, conceptdoi TEXT, version TEXT, title TEXT,
    modified TEXT, first_seen TEXT DEFAULT (datetime('now')), last_checked TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS jnl_polls (
    id INTEGER PRIMARY KEY, ran_at TEXT DEFAULT (datetime('now')),
    fetched INTEGER, new_records INTEGER, updated_records INTEGER, cursor TEXT
  )`
];
async function ensureSchema(env) {
  const out = [];
  for (const sql of DDL) {
    try {
      await env.AUDIT.prepare(sql).run();
      out.push("ok");
    } catch (e) {
      out.push(String(e && e.message || e));
    }
  }
  return out;
}
__name(ensureSchema, "ensureSchema");
async function zenodoFetch(url) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": UA }, signal: AbortSignal.timeout(3e4) });
  const txt = await res.text();
  if (!res.ok) throw new Error(`zenodo HTTP ${res.status} :: ${txt.slice(0, 180)}`);
  return JSON.parse(txt);
}
__name(zenodoFetch, "zenodoFetch");
async function zenodoRecords() {
  const hits = [];
  const seen = /* @__PURE__ */ new Set();
  let url = `${COMMUNITY}?size=${PAGE_SIZE}`;
  let total = null;
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const body = await zenodoFetch(url);
    if (!body?.hits?.hits) break;
    if (total === null) total = body.hits.total;
    for (const h of body.hits.hits) {
      if (!seen.has(h.id)) {
        seen.add(h.id);
        hits.push(h);
      }
    }
    url = body.links?.next || null;
  }
  return { hits, total, pages_fetched: Math.min(Math.ceil((total ?? 0) / PAGE_SIZE) || 1, MAX_PAGES) };
}
__name(zenodoRecords, "zenodoRecords");
async function kpis(env) {
  const out = { intended: {}, actual: {} };
  const recs = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM jnl_records").first();
  out.actual.tracked_records = recs.n || 0;
  const kvList = await env.STATE.list({ prefix: "zenodo:review:" });
  const reviews = [];
  for (const k of kvList.keys) {
    const v = await env.STATE.get(k.name);
    try { const o = JSON.parse(v); reviews.push(o); } catch (e) {}
  }
  out.actual.published_review_records = reviews.length;
  let visible = null;
  try {
    const res = await fetch(`${COMMUNITY}?size=25`, { headers: { accept: "application/json", "user-agent": "jnl-watch/0.1.7-kpi" }, signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      const body = await res.json();
      const hits = body.hits?.hits || [];
      visible = { feed_total: body.hits?.total ?? hits.length, review_visible: hits.filter((h) => (h.metadata?.title || "").startsWith("AI Referee Report")).length };
    } else { visible = { error: "HTTP " + res.status }; }
  } catch (e) { visible = { error: String(e && e.message || e) }; }
  out.actual.community_feed = visible;
  out.intended.community_reviews_visible = "all published review records should appear under the aiscience community listing";
  const vis = visible && typeof visible.review_visible === "number" ? visible.review_visible : 0;
  out.deltas = { published_vs_community_visible: out.actual.published_review_records - vis };
  out.generated_at = new Date().toISOString();
  return out;
}
async function poll(env) {
  const schema = await ensureSchema(env);
  const { hits, total } = await zenodoRecords();
  const prev = await env.STATE.get(CURSOR_KEY);
  let newest = prev || "1970-01-01T00:00:00.000Z";
  let newRecs = 0, updRecs = 0;
  for (const h of hits) {
    const mod = new Date(h.modified).toISOString();
    if (mod > newest) newest = mod;
    if (!prev || mod > prev) {
      const existing = await env.AUDIT.prepare("SELECT recid FROM jnl_records WHERE recid = ?").bind(h.id).first();
      await env.AUDIT.prepare(
        `INSERT INTO jnl_records (recid, conceptrecid, doi, conceptdoi, version, title, modified, last_checked)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(recid) DO UPDATE SET modified=excluded.modified, version=excluded.version, title=excluded.title, last_checked=datetime('now')`
      ).bind(h.id, h.conceptrecid, h.doi, h.conceptdoi, h.metadata?.version ?? null, h.metadata?.title ?? null, mod).run();
      if (existing) updRecs++;
      else newRecs++;
    }
  }
  await env.STATE.put(CURSOR_KEY, newest);
  await env.AUDIT.prepare("INSERT INTO jnl_polls (fetched, new_records, updated_records, cursor) VALUES (?, ?, ?, ?)").bind(hits.length, newRecs, updRecs, newest).run();
  return { ok: true, schema, community_total: total, fetched: hits.length, new_records: newRecs, updated_records: updRecs, cursor: newest, prev_cursor: prev };
}
__name(poll, "poll");
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 1), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
}
__name(json, "json");
var index_default = {
  async scheduled(event, env, ctx) {
    try {
      await poll(env);
    } catch (e) {
      console.error("scheduled poll failed", e);
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/health") {
        const schema = await ensureSchema(env);
        const last = await env.AUDIT.prepare("SELECT * FROM jnl_polls ORDER BY id DESC LIMIT 1").first().catch((e) => ({ error: String(e && e.message || e) }));
        const cursor = await env.STATE.get(CURSOR_KEY);
        return json({ ok: true, service: "jnl-watch", version: VERSION, community: "aiscience", cursor, schema, last_poll: last });
      }
      if (path === "/poll") return json(await poll(env));
      if (path === "/kpis") return json(await kpis(env));
      if (path === "/records") {
        const limit = Math.min(Number(url.searchParams.get("limit") || 10), 100);
        const rows = await env.AUDIT.prepare("SELECT recid, conceptdoi, doi, version, title, modified, first_seen FROM jnl_records ORDER BY modified DESC LIMIT ?").bind(limit).all();
        return json({ ok: true, count: rows.results.length, records: rows.results });
      }
      return json({ ok: true, service: "jnl-watch", version: VERSION, path, endpoints: ["/health", "/poll", "/records"], note: "AI-referee overlay for Zenodo community aiscience (isolated jnl-* stack)" });
    } catch (err) {
      return json({ ok: false, path, error: String(err && err.message || err) }, 500);
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
