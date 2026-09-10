var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var COMMUNITY_ID = "87f14e85-7156-4146-84e9-9e3a11e29c1d";
var COMMUNITY = `https://zenodo.org/api/communities/${COMMUNITY_ID}/records`;
var CURSOR_KEY = "cursor:lastModified";
var VERSION = "0.1.9";
var PAGE_SIZE = 25;
var MAX_PAGES = 40;
var UA = "jnl-watch/0.1.9 (QNFO AI-referee overlay for Zenodo community aiscience)";
var DDL = [
  `CREATE TABLE IF NOT EXISTS jnl_records (
    recid INTEGER PRIMARY KEY, conceptrecid INTEGER,
    doi TEXT, conceptdoi TEXT, version TEXT, title TEXT,
    modified TEXT, first_seen TEXT DEFAULT (datetime('now')), last_checked TEXT,
    self_authored INTEGER NOT NULL DEFAULT 0, self_kind TEXT, creators TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS jnl_polls (
    id INTEGER PRIMARY KEY, ran_at TEXT DEFAULT (datetime('now')),
    fetched INTEGER, new_records INTEGER, updated_records INTEGER, cursor TEXT, skipped_self INTEGER DEFAULT 0
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
  const mig = await migrate(env);
  out.push("migrate:" + mig.join(","));
  return out;
}
__name(ensureSchema, "ensureSchema");
// ---- JNL-SELF-EXCLUDE-1 (register row 125) helpers + build marker ------------
var BUILD = "selfexclude-2026-09-10";
var SELF_ORCIDS = ["0009-0002-4317-5604"];
var SELF_NAME_PATTERNS = [/quni-?gudzinas/i, /rowan\s+brad\s+quni/i];
var SELF_ORG_PATTERNS = [/qnfo\s+ai\s+referee/i, /^qnfo$/i];
var OWN_REPORT_TITLE = "AI Referee Report";
function creatorList(h) {
  var md = (h && h.metadata) || {};
  var cr = md.creators || [];
  var out = [];
  for (var i = 0; i < cr.length; i++) {
    out.push({ name: String(cr[i].name || ""), orcid: String(cr[i].orcid || ""), affiliation: String(cr[i].affiliation || (cr[i].affiliations && cr[i].affiliations[0] && cr[i].affiliations[0].name) || "") });
  }
  return out;
}
// WHAT: classify a Zenodo hit as QNFO-self (own review report vs own research record). WHY: register row 125.
function isSelfRecord(h) {
  var title = String((h && h.metadata && h.metadata.title) || "");
  if (title.indexOf(OWN_REPORT_TITLE) === 0) return { self: true, kind: "own-review-report", why: "title prefix " + OWN_REPORT_TITLE };
  var cr = creatorList(h);
  for (var i = 0; i < cr.length; i++) {
    var c = cr[i];
    if (c.orcid && SELF_ORCIDS.indexOf(c.orcid) >= 0) return { self: true, kind: "self-authored", why: "orcid " + c.orcid };
    for (var j = 0; j < SELF_NAME_PATTERNS.length; j++) if (SELF_NAME_PATTERNS[j].test(c.name)) return { self: true, kind: "self-authored", why: "creator " + c.name };
    for (var k = 0; k < SELF_ORG_PATTERNS.length; k++) if (SELF_ORG_PATTERNS[k].test(c.name) || SELF_ORG_PATTERNS[k].test(c.affiliation)) return { self: true, kind: "own-review-report", why: "org marker " + (c.name || c.affiliation) };
  }
  return { self: false, kind: null, why: null };
}
function creatorsText(h) {
  return creatorList(h).map(function (c) { return c.name + (c.orcid ? " [" + c.orcid + "]" : ""); }).join("; ").slice(0, 900);
}
// PRECONDITION: only called from ensureSchema. POSTCONDITION: guard columns exist (idempotent).
async function migrate(env) {
  var adds = [
    "ALTER TABLE jnl_records ADD COLUMN self_authored INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE jnl_records ADD COLUMN self_kind TEXT",
    "ALTER TABLE jnl_records ADD COLUMN creators TEXT",
    "ALTER TABLE jnl_polls ADD COLUMN skipped_self INTEGER DEFAULT 0"
  ];
  var out = [];
  for (var i = 0; i < adds.length; i++) {
    try { await env.AUDIT.prepare(adds[i]).run(); out.push("added"); }
    catch (e) { out.push("exists"); }
  }
  return out;
}

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
  let newRecs = 0, updRecs = 0, skippedOwn = 0, skippedSelf = 0;
  for (const h of hits) {
    const mod = new Date(h.modified).toISOString();
    if (mod > newest) newest = mod;
    if (!prev || mod > prev) {
      const hTitle = (h.metadata && h.metadata.title) || "";
      const hCreators = ((h.metadata && h.metadata.creators) || []).map((c) => c.name || "");
      const selfInfo = isSelfRecord(h);
      if (selfInfo.kind === "own-review-report") { skippedOwn++; continue; }
      if (selfInfo.self) skippedSelf++;
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
  await env.AUDIT.prepare("INSERT INTO jnl_polls (fetched, new_records, updated_records, cursor, skipped_self) VALUES (?, ?, ?, ?, ?)").bind(hits.length, newRecs, updRecs, newest, skippedSelf).run();
  return { ok: true, schema, community_total: total, fetched: hits.length, new_records: newRecs, updated_records: updRecs, skipped_own_reviews: skippedOwn, skipped_self_authored: skippedSelf, build: BUILD, cursor: newest, prev_cursor: prev };
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
        const selfCounts = await env.AUDIT.prepare("SELECT COUNT(*) AS total_records, SUM(self_authored) AS self_records FROM jnl_records").first().catch((e) => null);
        return json({ ok: true, service: "jnl-watch", version: VERSION, build: BUILD, community: "aiscience", cursor, schema, self: selfCounts, last_poll: last });
      }
      if (path === "/poll") return json(await poll(env));

      if (path === "/backfill-self" && request.method === "POST") {
        const lim = Math.min(Number(url.searchParams.get("limit") || 25), 100);
        const off = Math.max(Number(url.searchParams.get("offset") || 0), 0);
        const rowsB = await env.AUDIT.prepare("SELECT recid FROM jnl_records ORDER BY recid LIMIT ? OFFSET ?").bind(lim, off).all();
        let updated = 0, selfN = 0, errs = 0;
        const sample = [];
        for (let bi = 0; bi < rowsB.results.length; bi++) {
          const rid = rowsB.results[bi].recid;
          try {
            const recB = await zenodoFetch("https://zenodo.org/api/records/" + rid);
            const hit = { id: rid, metadata: recB.metadata || {} };
            const infoB = isSelfRecord(hit);
            await env.AUDIT.prepare("UPDATE jnl_records SET self_authored=?, self_kind=?, creators=?, last_checked=datetime('now') WHERE recid=?").bind(infoB.self ? 1 : 0, infoB.kind, creatorsText(hit), rid).run();
            updated++; if (infoB.self) selfN++;
            if (sample.length < 10) sample.push({ recid: rid, self: infoB.self, kind: infoB.kind, why: infoB.why });
          } catch (e) { errs++; if (sample.length < 10) sample.push({ recid: rid, error: String(e && e.message || e).slice(0, 120) }); }
        }
        return json({ ok: true, scanned: rowsB.results.length, updated, self_authored: selfN, errors: errs, offset: off, limit: lim, build: BUILD, sample });
      }
      if (path === "/kpis") return json(await kpis(env));
      if (path === "/records") {
        const limit = Math.min(Number(url.searchParams.get("limit") || 10), 100);
        const rows = await env.AUDIT.prepare("SELECT recid, conceptdoi, doi, version, title, modified, first_seen, self_authored, self_kind FROM jnl_records ORDER BY modified DESC LIMIT ?").bind(limit).all();
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
