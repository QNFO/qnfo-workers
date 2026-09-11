--90836cedc261436b9f6c0a3e12698edbebdb6ff14ed29910c5cb79ccfd9d
Content-Disposition: form-data; name="worker.js"; filename="worker.js"
Content-Type: application/javascript+module

var jnlWatchMod = (function(){
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
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
__name2(ensureSchema, "ensureSchema");
var BUILD = "selfexclude-2026-09-10";
var SELF_ORCIDS = ["0009-0002-4317-5604"];
var SELF_NAME_PATTERNS = [/quni-?gudzinas/i, /rowan\s+brad\s+quni/i];
var SELF_ORG_PATTERNS = [/qnfo\s+ai\s+referee/i, /^qnfo$/i];
var OWN_REPORT_TITLE = "AI Referee Report";
function creatorList(h) {
  var md = h && h.metadata || {};
  var cr = md.creators || [];
  var out = [];
  for (var i = 0; i < cr.length; i++) {
    out.push({ name: String(cr[i].name || ""), orcid: String(cr[i].orcid || ""), affiliation: String(cr[i].affiliation || cr[i].affiliations && cr[i].affiliations[0] && cr[i].affiliations[0].name || "") });
  }
  return out;
}
__name(creatorList, "creatorList");
function isSelfRecord(h) {
  var title = String(h && h.metadata && h.metadata.title || "");
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
__name(isSelfRecord, "isSelfRecord");
function creatorsText(h) {
  return creatorList(h).map(function(c) {
    return c.name + (c.orcid ? " [" + c.orcid + "]" : "");
  }).join("; ").slice(0, 900);
}
__name(creatorsText, "creatorsText");
async function migrate(env) {
  var adds = [
    "ALTER TABLE jnl_records ADD COLUMN self_authored INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE jnl_records ADD COLUMN self_kind TEXT",
    "ALTER TABLE jnl_records ADD COLUMN creators TEXT",
    "ALTER TABLE jnl_polls ADD COLUMN skipped_self INTEGER DEFAULT 0"
  ];
  var out = [];
  for (var i = 0; i < adds.length; i++) {
    try {
      await env.AUDIT.prepare(adds[i]).run();
      out.push("added");
    } catch (e) {
      out.push("exists");
    }
  }
  return out;
}
__name(migrate, "migrate");
async function zenodoFetch(url) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": UA }, signal: AbortSignal.timeout(3e4) });
  const txt = await res.text();
  if (!res.ok) throw new Error(`zenodo HTTP ${res.status} :: ${txt.slice(0, 180)}`);
  return JSON.parse(txt);
}
__name(zenodoFetch, "zenodoFetch");
__name2(zenodoFetch, "zenodoFetch");
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
__name2(zenodoRecords, "zenodoRecords");
async function kpis(env) {
  const out = { intended: {}, actual: {} };
  const recs = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM jnl_records").first();
  out.actual.tracked_records = recs.n || 0;
  const kvList = await env.STATE.list({ prefix: "zenodo:review:" });
  const reviews = [];
  for (const k of kvList.keys) {
    const v = await env.STATE.get(k.name);
    try {
      const o = JSON.parse(v);
      reviews.push(o);
    } catch (e) {
    }
  }
  out.actual.published_review_records = reviews.length;
  let visible = null;
  try {
    const res = await fetch(`${COMMUNITY}?size=25`, { headers: { accept: "application/json", "user-agent": "jnl-watch/0.1.7-kpi" }, signal: AbortSignal.timeout(2e4) });
    if (res.ok) {
      const body = await res.json();
      const hits = body.hits?.hits || [];
      visible = { feed_total: body.hits?.total ?? hits.length, review_visible: hits.filter((h) => (h.metadata?.title || "").startsWith("AI Referee Report")).length };
    } else {
      visible = { error: "HTTP " + res.status };
    }
  } catch (e) {
    visible = { error: String(e && e.message || e) };
  }
  out.actual.community_feed = visible;
  out.intended.community_reviews_visible = "all published review records should appear under the aiscience community listing";
  const vis = visible && typeof visible.review_visible === "number" ? visible.review_visible : 0;
  out.deltas = { published_vs_community_visible: out.actual.published_review_records - vis };
  out.generated_at = (/* @__PURE__ */ new Date()).toISOString();
  return out;
}
__name(kpis, "kpis");
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
      const hTitle = h.metadata && h.metadata.title || "";
      const hCreators = (h.metadata && h.metadata.creators || []).map((c) => c.name || "");
      const selfInfo = isSelfRecord(h);
      if (selfInfo.kind === "own-review-report") {
        skippedOwn++;
        continue;
      }
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
__name2(poll, "poll");
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 1), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
}
__name(json, "json");
__name2(json, "json");
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
            updated++;
            if (infoB.self) selfN++;
            if (sample.length < 10) sample.push({ recid: rid, self: infoB.self, kind: infoB.kind, why: infoB.why });
          } catch (e) {
            errs++;
            if (sample.length < 10) sample.push({ recid: rid, error: String(e && e.message || e).slice(0, 120) });
          }
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
return { default: index_default };
})();


var jnlRefereeMod = (function(){
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "0.9.1";
var MODELS_DEFAULT = "@cf/openai/gpt-oss-120b,@cf/moonshotai/kimi-k2.6";
var UA = "jnl-referee/0.1.0 (QNFO AI-referee overlay; open-science)";
var FETCH_TIMEOUT_MS = 2e4;
var TEXT_CAP = 18e3;
var MAX_TOKENS = 2400;
var DDL = [
  "CREATE TABLE IF NOT EXISTS jnl_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, recid INTEGER NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'queued', decision TEXT, model TEXT, score_soundness INTEGER, score_novelty INTEGER, score_clarity INTEGER, score_reproducibility INTEGER, avg_score REAL, basis TEXT, text_chars INTEGER, fatal_flaws INTEGER DEFAULT 0, disagreement INTEGER DEFAULT 0, report_md TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), ran_at TEXT)",
  "CREATE TABLE IF NOT EXISTS jnl_decisions (id INTEGER PRIMARY KEY AUTOINCREMENT, recid INTEGER NOT NULL UNIQUE, decision TEXT NOT NULL, rationale TEXT, avg_score REAL, basis TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS jnl_review_log (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT DEFAULT (datetime('now')), recid INTEGER, kind TEXT, detail TEXT)",
  "CREATE TABLE IF NOT EXISTS jnl_submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, recid INTEGER NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'queued', note TEXT, source TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS jnl_links (id INTEGER PRIMARY KEY AUTOINCREMENT, a INTEGER NOT NULL, b INTEGER NOT NULL, shared INTEGER DEFAULT 1, concepts TEXT, created_at TEXT DEFAULT (datetime('now')), UNIQUE(a, b))"
];
function json(data, status) {
  return new Response(JSON.stringify(data, null, 1), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" }
  });
}
__name(json, "json");
async function ensureSchema(env) {
  var out = [];
  for (var i = 0; i < DDL.length; i++) {
    try {
      await env.AUDIT.prepare(DDL[i]).run();
      out.push("ok");
    } catch (e) {
      out.push(String(e && e.message || e));
    }
  }
  var mig = await migrate(env);
  out.push("migrate:" + mig.join(","));
  return out;
}
__name(ensureSchema, "ensureSchema");
function log(env, recid, kind, detail) {
  try {
    return env.AUDIT.prepare("INSERT INTO jnl_review_log (recid, kind, detail) VALUES (?, ?, ?)").bind(recid || null, kind, String(detail || "").slice(0, 1e3)).run();
  } catch (e) {
    return null;
  }
}
__name(log, "log");
function normalizeId(input) {
  var s = String(input || "").trim();
  var m = s.match(/[0-9]{5,9}/);
  return m ? Number(m[0]) : 0;
}
__name(normalizeId, "normalizeId");
async function whoHash(header) {
  try {
    var h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(header || "anon"));
    var arr = new Uint8Array(h);
    return Array.prototype.slice.call(arr, 0, 8).map(function(b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  } catch (e) {
    return "anon";
  }
}
__name(whoHash, "whoHash");
async function submitRateOk(env, who) {
  var cap = Number(env.JNL_SUBMIT_DAILY_CAP || 10);
  var key = "submit:" + dateKey(/* @__PURE__ */ new Date()) + ":" + who;
  var cur = Number(await env.STATE.get(key) || 0);
  return { ok: cur < cap, cur, cap, key };
}
__name(submitRateOk, "submitRateOk");
async function submitBump(env, who) {
  var key = "submit:" + dateKey(/* @__PURE__ */ new Date()) + ":" + who;
  var cur = Number(await env.STATE.get(key) || 0) + 1;
  await env.STATE.put(key, String(cur), { expirationTtl: 9e4 });
  return cur;
}
__name(submitBump, "submitBump");
async function submitNew(env, recid, note, who) {
  await ensureSchema(env);
  var rec = await zenodoGet("https://zenodo.org/api/records/" + recid);
  var meta = rec.metadata || {};
  var dup = await env.AUDIT.prepare("SELECT recid FROM jnl_submissions WHERE recid = ?").bind(recid).first();
  var dupR = await env.AUDIT.prepare("SELECT recid FROM jnl_reviews WHERE recid = ?").bind(recid).first();
  if (dup || dupR) return { dup: true };
  var selfInfoS = isSelfRecord({ metadata: meta, id: rec.id });
  await env.AUDIT.prepare("INSERT INTO jnl_records (recid, conceptrecid, doi, conceptdoi, version, title, modified, first_seen, last_checked, self_authored, self_kind, creators) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'), ?, ?, ?) ON CONFLICT(recid) DO UPDATE SET title=excluded.title, doi=excluded.doi, self_authored=excluded.self_authored, self_kind=excluded.self_kind, creators=excluded.creators").bind(rec.id, rec.conceptrecid || null, rec.doi || null, rec.conceptdoi || null, meta.version || null, meta.title || null, selfInfoS.self ? 1 : 0, selfInfoS.kind, creatorsText({ metadata: meta })).run();
  if (selfInfoS.self) {
    await log(env, recid, "self_excluded", "intake refused review: " + selfInfoS.why);
    return { dup: false, self: true, queued: false, recid, doi: rec.doi || null, why: selfInfoS.why, note: "self-authored record recorded but NOT queued (JNL-SELF-EXCLUDE-1)" };
  }
  await env.AUDIT.prepare("INSERT OR IGNORE INTO jnl_reviews (recid, status) VALUES (?, 'queued')").bind(recid).run();
  await env.AUDIT.prepare("INSERT INTO jnl_submissions (recid, note, source, status) VALUES (?, ?, ?, 'queued')").bind(recid, String(note || "").slice(0, 300), String(who).slice(0, 40)).run();
  await log(env, recid, "submitted", "author submission queued via intake (P9)");
  return { dup: false, doi: rec.doi || null, title: meta.title || null };
}
__name(submitNew, "submitNew");
function stopSet() {
  return { the: 1, of: 1, and: 1, a: 1, an: 1, for: 1, in: 1, on: 1, to: 1, from: 1, by: 1, with: 1, at: 1, or: 1, as: 1, into: 1, its: 1, their: 1, this: 1, that: 1, is: 1, are: 1, be: 1, was: 1, were: 1, not: 1, no: 1, how: 1, what: 1, why: 1, when: 1, which: 1, via: 1, per: 1, under: 1, over: 1, between: 1, across: 1, new: 1, one: 1, two: 1, three: 1, model: 1, models: 1, study: 1, studies: 1, paper: 1, using: 1, use: 1, used: 1, first: 1, second: 1, case: 1, cases: 1, concept: 1, concepts: 1, towards: 1, toward: 1, framework: 1, frameworks: 1 };
}
__name(stopSet, "stopSet");
function conceptsOf(title) {
  var s = String(title || "").toLowerCase();
  s = s.replace(/[^a-z0-9 ]/g, " ");
  var toks = s.split(/ +/);
  var stop = stopSet();
  var acc = {};
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (t.length < 3) continue;
    if (stop[t]) continue;
    acc[t] = 1;
  }
  return Object.keys(acc).sort();
}
__name(conceptsOf, "conceptsOf");
function sharedConcepts(a, b) {
  var i = 0;
  var j = 0;
  var shared = [];
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      shared.push(a[i]);
      i++;
      j++;
    } else if (a[i] < b[j]) i++;
    else j++;
  }
  return shared;
}
__name(sharedConcepts, "sharedConcepts");
async function buildGraph(env) {
  await ensureSchema(env);
  var rows = await env.AUDIT.prepare("SELECT recid, title FROM jnl_records ORDER BY recid").all();
  var recs = rows.results || [];
  var concepts = {};
  for (var r = 0; r < recs.length; r++) {
    concepts[recs[r].recid] = conceptsOf(recs[r].title);
  }
  var added = 0;
  for (var i = 0; i < recs.length; i++) {
    for (var j = i + 1; j < recs.length; j++) {
      var shared = sharedConcepts(concepts[recs[i].recid], concepts[recs[j].recid]);
      if (!shared.length) continue;
      await env.AUDIT.prepare("INSERT OR IGNORE INTO jnl_links (a, b, shared, concepts) VALUES (?, ?, ?, ?)").bind(recs[i].recid, recs[j].recid, shared.length, shared.join(",")).run();
      added++;
    }
  }
  return { nodes: recs.length, edges: added };
}
__name(buildGraph, "buildGraph");
async function zenodoGet(url) {
  var res = await fetch(url, { headers: { accept: "application/json", "user-agent": UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  var txt = await res.text();
  if (!res.ok) throw new Error("zenodo HTTP " + res.status + " :: " + txt.slice(0, 180));
  return JSON.parse(txt);
}
__name(zenodoGet, "zenodoGet");
function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}
__name(stripHtml, "stripHtml");
async function fetchRecord(recid) {
  var rec = await zenodoGet("https://zenodo.org/api/records/" + recid);
  var meta = rec.metadata || {};
  var desc = stripHtml(meta.description);
  var creators = (meta.creators || []).map(function(c) {
    return (c.name || "") + (c.affiliations && c.affiliations.length ? " (" + c.affiliations[0].name + ")" : "");
  }).join("; ");
  var files = rec.files || [];
  var text = "";
  var fetchedKey = null;
  var textFiles = files.filter(function(f2) {
    return /\.(md|markdown|txt|rst|tex|html?|json)$/i.test(f2.key || "");
  }).sort(function(a, b) {
    return (b.size || 0) - (a.size || 0);
  });
  if (textFiles.length) {
    var f = textFiles[0];
    try {
      var fres = await fetch(f.links && f.links.content ? f.links.content : f.links.self, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (fres.ok) {
        text = (await fres.text()).slice(0, TEXT_CAP);
        fetchedKey = f.key;
      }
    } catch (e) {
      text = "";
    }
  }
  var hasPdf = files.some(function(f2) {
    return /\.pdf$/i.test(f2.key || "");
  });
  return {
    recid: rec.id,
    doi: rec.doi || null,
    conceptdoi: rec.conceptdoi || null,
    version: meta.version || rec.metadata.version || null,
    title: meta.title || null,
    publication_date: meta.publication_date || null,
    license: meta.license && meta.license.id || null,
    creators,
    description: desc,
    keywords: (meta.keywords || []).join(", "),
    file_keys: files.map(function(f2) {
      return f2.key;
    }),
    text,
    fetched_key: fetchedKey,
    text_chars: text.length,
    has_pdf: !!hasPdf,
    raw_size_chars: JSON.stringify(rec).length
  };
}
__name(fetchRecord, "fetchRecord");
function extractText(out) {
  if (!out) return "";
  if (typeof out === "string") return out;
  if (out.choices && out.choices[0] && out.choices[0].message) return out.choices[0].message.content || "";
  if (out.response) return out.response;
  if (out.result && typeof out.result === "object") {
    if (out.result.response) return out.result.response;
    if (out.result.choices && out.result.choices[0] && out.result.choices[0].message) return out.result.choices[0].message.content || "";
  }
  if (Array.isArray(out) && out[0] && out[0].response) return out[0].response;
  return "";
}
__name(extractText, "extractText");
function parseJsonObject(s) {
  var txt = String(s || "").trim();
  var a = txt.indexOf("{");
  var b = txt.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  var cand = txt.slice(a, b + 1);
  try {
    return JSON.parse(cand);
  } catch (e) {
    return null;
  }
}
__name(parseJsonObject, "parseJsonObject");
function num(v, dflt) {
  var n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}
__name(num, "num");
function clampScore(v) {
  return Math.max(1, Math.min(10, Math.round(num(v, 5))));
}
__name(clampScore, "clampScore");
function arrOf(v) {
  return Array.isArray(v) ? v.filter(function(x) {
    return typeof x === "string" && x.trim();
  }).map(function(x) {
    return x.trim();
  }) : [];
}
__name(arrOf, "arrOf");
async function aiRun(env, model, sys, usr) {
  var r = await env.AI.run(model, { messages: [{ role: "system", content: sys }, { role: "user", content: usr }], max_tokens: MAX_TOKENS });
  return extractText(r);
}
__name(aiRun, "aiRun");
function reviewerSystem(role) {
  return "You are " + role + ' for an open AI-reviewed journal that overlays Zenodo (no gatekeeping; content judged on merit). You review ONLY the provided record content. Never fabricate quotes, citations, or external facts; quote only text present in the input and mark recalled items as uncertain. Be fair to non-traditional and interdisciplinary work: judge internal consistency, clarity, evidence quality, novelty of framing, reproducibility, and honesty, not conformity to one field. Return ONLY one JSON object (no markdown fences, no commentary) with exactly these keys: score_soundness (integer 1-10), score_novelty (integer 1-10), score_clarity (integer 1-10), score_reproducibility (integer 1-10), strengths (array of strings), weaknesses (array of strings), fatal_flaws (array of strings; empty array if none), disconfirming_evidence (array of strings; empty if none found), limitations_of_review (array of strings), confidence ("high"|"medium"|"low" with reason inside rationale), verdict ("PUBLISH"|"REVISE"|"REJECT"), rationale (string).';
}
__name(reviewerSystem, "reviewerSystem");
function userPrompt(rec, withText) {
  var head = "RECORD METADATA\ntitle: " + (rec.title || "(none)") + "\ndoi: " + (rec.doi || "(none)") + "\nversion: " + (rec.version || "(none)") + "\npublication_date: " + (rec.publication_date || "(none)") + "\nlicense: " + (rec.license || "(none)") + "\ncreators: " + (rec.creators || "(none)") + "\nkeywords: " + (rec.keywords || "(none)") + "\n\nABSTRACT/DESCRIPTION:\n" + (rec.description || "(none)").slice(0, 6e3) + "\n\n";
  if (withText && rec.text) {
    head = head + "FULL TEXT (file: " + (rec.fetched_key || "unknown") + ", first " + rec.text.length + " chars):\n" + rec.text + "\n\n";
  } else {
    head = head + "NOTE: full-text file was not machine-readable in this pass (PDF or absent). Review on metadata/abstract only and say so in limitations_of_review.\n";
  }
  head = head + "Now produce the review JSON.";
  return head;
}
__name(userPrompt, "userPrompt");
function decisionFrom(parsedList, basis) {
  var avgs = [];
  var fatal = false;
  var fatalTexts = [];
  var anyLowConfidence = false;
  for (var i = 0; i < parsedList.length; i++) {
    var p = parsedList[i];
    if (!p) continue;
    var sc = (clampScore(p.score_soundness) + clampScore(p.score_novelty) + clampScore(p.score_clarity) + clampScore(p.score_reproducibility)) / 4;
    avgs.push(sc);
    if (arrOf(p.fatal_flaws).length) {
      fatal = true;
      var ff = arrOf(p.fatal_flaws);
      for (var fj = 0; fj < ff.length; fj++) fatalTexts.push(String(ff[fj]));
    }
    if (String(p.confidence || "") === "low") anyLowConfidence = true;
  }
  if (!avgs.length) return { decision: "ERROR", avg: 0, fatal: false, disagreement: false, reason: "no model output parsed" };
  var avg = avgs.reduce(function(a, b) {
    return a + b;
  }, 0) / avgs.length;
  var disagreement = avgs.length > 1 && Math.abs(avgs[0] - avgs[1]) >= 2.5;
  var fatalSpecOnly = fatal && fatalTexts.length > 0 && fatalTexts.every(function(t) {
    return SPECULATIVE_RE.test(t);
  });
  var decision;
  var minAvg = Math.min.apply(null, avgs);
  var maxAvg = Math.max.apply(null, avgs);
  var speculative = parsedList.some(function(p2) {
    if (!p2) return false;
    var txt = arrOf(p2.weaknesses).concat(arrOf(p2.limitations_of_review), arrOf(p2.fatal_flaws)).join(" ").toLowerCase();
    return SPECULATIVE_RE.test(txt);
  });
  if (fatal || avg < 4) decision = "REJECT";
  else if (basis !== "text") decision = "REVISE";
  else if (avg >= 7.5 && minAvg >= 6 && !anyLowConfidence && !speculative) decision = "PUBLISH";
  else decision = "REVISE";
  return { decision, avg: Math.round(avg * 100) / 100, fatal, fatal_spec_only: fatalSpecOnly, disagreement, speculative, min_avg: minAvg, max_avg: maxAvg, low_confidence: anyLowConfidence, reason: "avg=" + Math.round(avg * 100) / 100 + " min=" + minAvg + " max=" + maxAvg + " fatal=" + fatal + " fatal_spec_only=" + fatalSpecOnly + " speculative=" + speculative + " basis=" + basis + " lowconf=" + anyLowConfidence };
}
__name(decisionFrom, "decisionFrom");
function buildReport(rec, parsedList, dec, modelsUsed, basis) {
  var lines = [];
  lines.push("# AI Referee Report");
  lines.push("");
  lines.push("- Record: " + (rec.title || "(untitled)") + " (Zenodo recid " + rec.recid + ", doi " + (rec.doi || "n/a") + ", version " + (rec.version || "n/a") + ")");
  lines.push("- Review basis: " + (basis === "text" ? "metadata + full text (" + rec.text_chars + " chars, file " + rec.fetched_key + ")" : "metadata/abstract only (PDF or no textual file)"));
  lines.push("- Models: " + modelsUsed.join(", "));
  lines.push("- Decision (deterministic thresholds): **" + dec.decision + "** (mean score " + dec.avg + "/10)");
  if (dec.disagreement) lines.push("- Flag: reviewers disagreed by >= 2.5 points; decision follows pooled thresholds.");
  lines.push("");
  for (var i = 0; i < parsedList.length; i++) {
    var p = parsedList[i];
    if (!p) continue;
    lines.push("## Reviewer " + (i + 1) + " (" + (modelsUsed[i] || "model") + ")");
    lines.push("- Soundness " + clampScore(p.score_soundness) + " | Novelty " + clampScore(p.score_novelty) + " | Clarity " + clampScore(p.score_clarity) + " | Reproducibility " + clampScore(p.score_reproducibility) + " | Confidence " + (p.confidence || "n/a"));
    lines.push("- Verdict requested: " + (p.verdict || "n/a"));
    if (arrOf(p.strengths).length) {
      lines.push("- Strengths:");
      arrOf(p.strengths).forEach(function(x) {
        lines.push("  - " + x.slice(0, 400));
      });
    }
    if (arrOf(p.weaknesses).length) {
      lines.push("- Weaknesses:");
      arrOf(p.weaknesses).forEach(function(x) {
        lines.push("  - " + x.slice(0, 400));
      });
    }
    if (arrOf(p.fatal_flaws).length) {
      lines.push("- Fatal flaws:");
      arrOf(p.fatal_flaws).forEach(function(x) {
        lines.push("  - " + x.slice(0, 400));
      });
    }
    if (arrOf(p.disconfirming_evidence).length) {
      lines.push("- Disconfirming evidence sought/found:");
      arrOf(p.disconfirming_evidence).forEach(function(x) {
        lines.push("  - " + x.slice(0, 300));
      });
    }
    if (arrOf(p.limitations_of_review).length) {
      lines.push("- Limitations of this review:");
      arrOf(p.limitations_of_review).forEach(function(x) {
        lines.push("  - " + x.slice(0, 300));
      });
    }
    lines.push("- Rationale: " + String(p.rationale || "").slice(0, 1200));
    lines.push("");
  }
  lines.push("## Decision rationale");
  lines.push(dec.reason);
  lines.push("");
  lines.push("## Honesty notes");
  lines.push('- These AI referee reports are advisory. They are not endorsements, certifications of correctness, or statements that a record is "proven". They are structured adversarial critiques produced by language models, with the failure modes each reviewer listed above.');
  lines.push("- Review basis is disclosed: metadata-only reviews never receive PUBLISH.");
  lines.push("- The overlay does not store paper bodies and does not write to Zenodo (curator write-back requires separate authorization).");
  return lines.join("\n");
}
__name(buildReport, "buildReport");
async function runReview(env, recid, manual) {
  var schema = await ensureSchema(env);
  var models = String(env.JNL_MODELS || MODELS_DEFAULT).split(",").map(function(x) {
    return x.trim();
  }).filter(Boolean);
  var nowIso = (/* @__PURE__ */ new Date()).toISOString();
  var rec;
  try {
    rec = await fetchRecord(recid);
  } catch (e) {
    await env.AUDIT.prepare("INSERT INTO jnl_reviews (recid, status, error, ran_at) VALUES (?, 'error', ?, ?) ON CONFLICT(recid) DO UPDATE SET status='error', error=excluded.error, ran_at=excluded.ran_at").bind(recid, "record fetch failed: " + String(e && e.message || e).slice(0, 500), nowIso).run();
    await log(env, recid, "run", "record fetch failed");
    return { ok: false, recid, error: String(e && e.message || e).slice(0, 300) };
  }
  var scored = await scoreOnce(env, rec, models, recid);
  var basis = scored.basis;
  var parsedList = scored.parsedList;
  var modelsUsed = scored.modelsUsed;
  if (!parsedList.length) {
    await env.AUDIT.prepare("INSERT INTO jnl_reviews (recid, status, basis, text_chars, error, ran_at) VALUES (?, 'error', ?, ?, ?, ?) ON CONFLICT(recid) DO UPDATE SET status='error', basis=excluded.basis, text_chars=excluded.text_chars, error=excluded.error, ran_at=excluded.ran_at").bind(recid, basis, rec.text_chars, "no model produced parseable JSON", nowIso).run();
    return { ok: false, recid, error: "no model produced parseable JSON" };
  }
  var NL = String.fromCharCode(10);
  var dec = decisionFrom(parsedList, basis);
  var esc = await applySpecAckEscape(env, rec, dec, models, recid, basis);
  dec = esc.dec;
  var specPath = esc.specPath;
  var report = buildReport(rec, parsedList, dec, modelsUsed, basis);
  if (specPath.used) report = report + specAckReportSection(specPath, NL);
  var p0 = parsedList[0] || {};
  var sound = Math.round(parsedList.map(function(p) {
    return clampScore(p.score_soundness);
  }).reduce(function(a, b) {
    return a + b;
  }, 0) / parsedList.length);
  var novel = Math.round(parsedList.map(function(p) {
    return clampScore(p.score_novelty);
  }).reduce(function(a, b) {
    return a + b;
  }, 0) / parsedList.length);
  var clar = Math.round(parsedList.map(function(p) {
    return clampScore(p.score_clarity);
  }).reduce(function(a, b) {
    return a + b;
  }, 0) / parsedList.length);
  var repro = Math.round(parsedList.map(function(p) {
    return clampScore(p.score_reproducibility);
  }).reduce(function(a, b) {
    return a + b;
  }, 0) / parsedList.length);
  var fatalCount = parsedList.map(function(p) {
    return arrOf(p.fatal_flaws).length;
  }).reduce(function(a, b) {
    return a + b;
  }, 0);
  await env.AUDIT.prepare(
    "INSERT INTO jnl_reviews (recid, status, decision, model, score_soundness, score_novelty, score_clarity, score_reproducibility, avg_score, basis, text_chars, fatal_flaws, disagreement, report_md, ran_at) VALUES (?, 'done', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(recid) DO UPDATE SET status='done', decision=excluded.decision, model=excluded.model, score_soundness=excluded.score_soundness, score_novelty=excluded.score_novelty, score_clarity=excluded.score_clarity, score_reproducibility=excluded.score_reproducibility, avg_score=excluded.avg_score, basis=excluded.basis, text_chars=excluded.text_chars, fatal_flaws=excluded.fatal_flaws, disagreement=excluded.disagreement, report_md=excluded.report_md, ran_at=excluded.ran_at, error=NULL"
  ).bind(recid, dec.decision, modelsUsed.join(","), sound, novel, clar, repro, dec.avg, basis, rec.text_chars, fatalCount, dec.disagreement ? 1 : 0, report, nowIso).run();
  var selfRow = await env.AUDIT.prepare("SELECT COALESCE(self_authored,0) AS s FROM jnl_records WHERE recid = ?").bind(recid).first().catch(function() {
    return null;
  });
  await env.AUDIT.prepare(
    "INSERT INTO jnl_decisions (recid, decision, rationale, avg_score, basis, speculative, spec_ack, self_review, path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(recid) DO UPDATE SET decision=excluded.decision, rationale=excluded.rationale, avg_score=excluded.avg_score, basis=excluded.basis, speculative=excluded.speculative, spec_ack=excluded.spec_ack, self_review=excluded.self_review, path=excluded.path"
  ).bind(recid, dec.decision, (dec.reason + " | " + (p0.rationale || "")).slice(0, 1500), dec.avg, basis, dec.speculative ? 1 : 0, specPath.acknowledged ? 1 : 0, selfRow && selfRow.s ? 1 : 0, dec.path).run();
  await log(env, recid, "done", dec.decision + " avg=" + dec.avg + " basis=" + basis);
  return { ok: true, recid, decision: dec.decision, avg_score: dec.avg, basis, path: dec.path, speculative: dec.speculative, spec_ack: specPath.acknowledged, text_chars: rec.text_chars, models: modelsUsed, fatal_flaws: fatalCount, disagreement: dec.disagreement };
}
__name(runReview, "runReview");
async function enqueueNew(env, limit) {
  var schema = await ensureSchema(env);
  var rows = await env.AUDIT.prepare(
    "SELECT r.recid FROM jnl_records r LEFT JOIN jnl_reviews v ON v.recid = r.recid WHERE v.recid IS NULL AND COALESCE(r.self_authored,0) = 0 ORDER BY r.modified DESC LIMIT ?"
  ).bind(limit).all();
  var added = 0;
  for (var i = 0; i < rows.results.length; i++) {
    try {
      await env.AUDIT.prepare("INSERT OR IGNORE INTO jnl_reviews (recid, status) VALUES (?, 'queued')").bind(rows.results[i].recid).run();
      added++;
    } catch (e) {
    }
  }
  return { scanned: rows.results.length, added };
}
__name(enqueueNew, "enqueueNew");
async function pickQueued(env) {
  var row = await env.AUDIT.prepare("SELECT v.recid AS recid FROM jnl_reviews v LEFT JOIN jnl_records r ON r.recid = v.recid WHERE (v.status='queued' OR (v.status='error' AND v.ran_at IS NOT NULL AND v.ran_at < datetime('now','-30 minutes'))) AND COALESCE(r.self_authored,0) = 0 ORDER BY v.id ASC LIMIT 1").first();
  return row ? row.recid : null;
}
__name(pickQueued, "pickQueued");
function dateKey(d) {
  return d.toISOString().slice(0, 10);
}
__name(dateKey, "dateKey");
async function dailyBudgetOk(env) {
  var key = "referee:daily:" + dateKey(/* @__PURE__ */ new Date());
  var cap = Number(env.JNL_DAILY_CAP || 60);
  var cur = Number(await env.STATE.get(key) || 0);
  return { ok: cur < cap, cur, cap, key };
}
__name(dailyBudgetOk, "dailyBudgetOk");
async function bumpDaily(env) {
  var key = "referee:daily:" + dateKey(/* @__PURE__ */ new Date());
  var cur = Number(await env.STATE.get(key) || 0) + 1;
  await env.STATE.put(key, String(cur), { expirationTtl: 172800 });
  return cur;
}
__name(bumpDaily, "bumpDaily");
async function authOk(request, env) {
  var secret = env.JNL_TOKEN || "";
  if (!secret) return false;
  var header = request.headers.get("x-jnl-token") || "";
  if (!header) return false;
  try {
    var enc = new TextEncoder();
    var a = await crypto.subtle.digest("SHA-256", enc.encode(secret));
    var b = await crypto.subtle.digest("SHA-256", enc.encode(header));
    var ab = new Uint8Array(a), bb = new Uint8Array(b);
    if (ab.length !== bb.length) return false;
    var diff = 0;
    for (var i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
    return diff === 0;
  } catch (e) {
    return false;
  }
}
__name(authOk, "authOk");
async function handleScheduled(env) {
  try {
    var schema = await ensureSchema(env);
    var seeded = await enqueueNew(env, 50);
    var budget = await dailyBudgetOk(env);
    var ran = [];
    var processed = 0;
    while (processed < 2) {
      var again = await dailyBudgetOk(env);
      if (!again.ok) break;
      var recid = await pickQueued(env);
      if (!recid) break;
      var res = await runReview(env, recid, false);
      await bumpDaily(env);
      ran.push({ recid, ok: !!res.ok, decision: res.decision || null });
      processed++;
    }
    var drift = null;
    try {
      var nowD = /* @__PURE__ */ new Date();
      if (nowD.getUTCDay() === 1 && nowD.getUTCHours() === 3) {
        var bd = await dailyBudgetOk(env);
        if (bd.ok) drift = await driftSample(env, 3);
      }
    } catch (e) {
      drift = { error: String(e && e.message || e).slice(0, 200) };
    }
    var citations = null;
    try {
      var wkN = (/* @__PURE__ */ new Date()).getUTCDay() === 1 && (/* @__PURE__ */ new Date()).getUTCHours() === 3 ? 25 : 6;
      citations = await citationSample(env, wkN);
    } catch (e) {
      citations = { error: String(e && e.message || e).slice(0, 200) };
    }
    return { ok: true, seeded, ran, budget, drift, citations };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 300) };
  }
}
__name(handleScheduled, "handleScheduled");
var index_default = {
  async scheduled(event, env, ctx) {
    var r = await handleScheduled(env);
    console.log("jnl-referee scheduled", JSON.stringify(r).slice(0, 800));
  },
  async fetch(request, env) {
    var url = new URL(request.url);
    var path = url.pathname;
    var method = request.method;
    try {
      if (path === "/health") {
        var schema = await ensureSchema(env);
        var counts = await env.AUDIT.prepare("SELECT (SELECT COUNT(*) FROM jnl_records) AS records, (SELECT COUNT(*) FROM jnl_records WHERE self_authored=1) AS self_records, (SELECT COUNT(*) FROM jnl_reviews) AS reviews, (SELECT COUNT(*) FROM jnl_reviews WHERE status='queued') AS queued, (SELECT COUNT(*) FROM jnl_decisions) AS decisions, (SELECT COUNT(*) FROM jnl_decisions WHERE self_review=1) AS self_review_decisions, (SELECT COUNT(*) FROM jnl_decisions WHERE path='speculation-acknowledged') AS spec_ack_publishes, (SELECT COUNT(*) FROM jnl_decisions WHERE speculative=1) AS speculative_flagged, (SELECT COUNT(*) FROM jnl_drift) AS drift_runs, (SELECT COUNT(*) FROM jnl_drift WHERE decision_changed=1) AS drift_flips, (SELECT COALESCE(SUM(citation_count),0) FROM jnl_records) AS total_citations, (SELECT MAX(ran_at) FROM jnl_reviews) AS last_run").first();
        return json({ ok: true, service: "jnl-referee", version: VERSION, build: BUILD, schema, counts, models: String(env.JNL_MODELS || MODELS_DEFAULT) });
      }
      if (path === "/queue") {
        var limitQ = Math.min(Number(url.searchParams.get("limit") || 20), 100);
        var qrows = await env.AUDIT.prepare("SELECT recid, status, decision, created_at FROM jnl_reviews ORDER BY id DESC LIMIT ?").bind(limitQ).all();
        return json({ ok: true, count: qrows.results.length, rows: qrows.results });
      }
      if (path === "/reviews") {
        var rid = Number(url.searchParams.get("recid") || 0);
        var rowsR;
        if (rid) rowsR = await env.AUDIT.prepare("SELECT * FROM jnl_reviews WHERE recid = ?").bind(rid).all();
        else {
          var limR = Math.min(Number(url.searchParams.get("limit") || 20), 100);
          rowsR = await env.AUDIT.prepare("SELECT recid, status, decision, avg_score, basis, model, created_at, ran_at FROM jnl_reviews ORDER BY id DESC LIMIT ?").bind(limR).all();
        }
        return json({ ok: true, count: rowsR.results.length, rows: rowsR.results });
      }
      if (path === "/decisions") {
        var ridD = Number(url.searchParams.get("recid") || 0);
        var limD = Math.min(Number(url.searchParams.get("limit") || 20), 100);
        var rowsD = ridD ? await env.AUDIT.prepare("SELECT recid, decision, avg_score, basis, rationale, created_at FROM jnl_decisions WHERE recid = ?").bind(ridD).all() : await env.AUDIT.prepare("SELECT recid, decision, avg_score, basis, rationale, created_at FROM jnl_decisions ORDER BY id DESC LIMIT ?").bind(limD).all();
        return json({ ok: true, count: rowsD.results.length, rows: rowsD.results });
      }
      if (path === "/graph") {
        var gNodes = await env.AUDIT.prepare("SELECT recid, title, COALESCE(citation_count,0) AS citation_count, citation_source FROM jnl_records ORDER BY recid").all();
        var gEdges = await env.AUDIT.prepare("SELECT a, b, shared, concepts FROM jnl_links ORDER BY shared DESC LIMIT 300").all();
        var gTot = 0;
        for (var gi = 0; gi < gNodes.results.length; gi++) gTot += Number(gNodes.results[gi].citation_count || 0);
        var cStatus = gTot > 0 ? "external-citations-present" : "no-external-citations";
        return json({ ok: true, node_count: gNodes.results.length, edge_count: gEdges.results.length, total_citations: gTot, citation_status: cStatus, edge_semantics: gTot > 0 ? "concept overlap plus external citations" : "concept overlap only (title-term overlap); NOT citation support or contrast", nodes: gNodes.results, edges: gEdges.results });
      }
      if (path === "/self-audit") {
        var sa = await env.AUDIT.prepare("SELECT (SELECT COUNT(*) FROM jnl_records) AS records, (SELECT COUNT(*) FROM jnl_records WHERE self_authored=1) AS self_records, (SELECT COUNT(*) FROM jnl_decisions) AS decisions, (SELECT COUNT(*) FROM jnl_decisions WHERE self_review=1) AS self_review_decisions, (SELECT COUNT(*) FROM jnl_decisions WHERE decision='PUBLISH') AS publishes, (SELECT COUNT(*) FROM jnl_decisions WHERE path='speculation-acknowledged') AS spec_ack_publishes, (SELECT COUNT(*) FROM jnl_reviews WHERE status='queued') AS queued").first();
        var pct = /* @__PURE__ */ __name(function(a, b) {
          return b ? Math.round(1e3 * a / b) / 10 + "%" : null;
        }, "pct");
        return json({ ok: true, service: "jnl-referee", version: VERSION, build: BUILD, counts: sa, contamination: { self_records_share: pct(sa.self_records, sa.records), self_review_decisions_share: pct(sa.self_review_decisions, sa.decisions) }, guard: "self-authored records are excluded from the review queue (JNL-SELF-EXCLUDE-1); historical decisions are flagged, never deleted" });
      }
      if (path === "/backfill-flags" && method === "POST") {
        var authedF = await authOk(request, env);
        if (!authedF) return json({ ok: false, error: "unauthorized" }, 401);
        var f1 = await env.AUDIT.prepare("UPDATE jnl_decisions SET self_review = 1 WHERE recid IN (SELECT recid FROM jnl_records WHERE self_authored = 1)").run();
        var f2 = await env.AUDIT.prepare("UPDATE jnl_decisions SET speculative = 1 WHERE rationale LIKE '%speculative=true%'").run();
        var f3 = await env.AUDIT.prepare("UPDATE jnl_decisions SET path = 'threshold' WHERE path IS NULL").run();
        return json({ ok: true, self_review_flagged: f1.meta && f1.meta.changes || 0, speculative_flagged: f2.meta && f2.meta.changes || 0, path_defaulted: f3.meta && f3.meta.changes || 0, build: BUILD });
      }
      if (path === "/drift") {
        var limDr = Math.min(Number(url.searchParams.get("limit") || 30), 200);
        var dRows = await env.AUDIT.prepare("SELECT recid, checked_at, stored_decision, stored_avg, fresh_decision, fresh_avg, delta_avg, decision_changed, models, basis FROM jnl_drift ORDER BY id DESC LIMIT ?").bind(limDr).all();
        var dSum = await env.AUDIT.prepare("SELECT COUNT(*) AS runs, SUM(decision_changed) AS flips, ROUND(AVG(delta_avg), 3) AS mean_delta FROM jnl_drift").first();
        return json({ ok: true, summary: dSum, count: dRows.results.length, rows: dRows.results, meaning: "A stored decision that flips under an unchanged record is model-behaviour drift, not a change in the submission. Treat stored decisions as time-stamped under a model version, not as reproducible ground truth." });
      }
      if (path === "/submissions") {
        var limS = Math.min(Number(url.searchParams.get("limit") || 30), 100);
        var subR = await env.AUDIT.prepare("SELECT recid, status, note, created_at FROM jnl_submissions ORDER BY id DESC LIMIT ?").bind(limS).all();
        return json({ ok: true, count: subR.results.length, rows: subR.results });
      }
      if (path === "/" || path === "/index.html") {
        var escH = /* @__PURE__ */ __name(function(s) {
          return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }, "escH");
        var recParam = Number(url.searchParams.get("recid") || 0);
        if (recParam) {
          var repR = await env.AUDIT.prepare("SELECT decision, avg_score, basis, report_md, created_at FROM jnl_reviews WHERE recid = ?").bind(recParam).first();
          if (!repR) return new Response("No review found for recid " + recParam, { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
          var repHtml = "<!doctype html><html><head><meta charset='utf-8'><title>AI Referee Report " + recParam + "</title></head><body style='font-family:system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.5'><p><a href='/'>\u2190 index</a></p><h1>AI Referee Report \u2014 Zenodo recid " + recParam + "</h1><p>Decision: <strong>" + escH(repR.decision) + "</strong> \xB7 avg " + escH(String(repR.avg_score)) + " \xB7 basis " + escH(repR.basis) + " \xB7 " + escH(repR.created_at) + "</p><p><a href='https://zenodo.org/records/" + recParam + "'>Zenodo record</a></p><pre style='white-space:pre-wrap;background:#f7f7f7;padding:1rem;border-radius:6px'>" + escH(repR.report_md) + "</pre><footer style='opacity:.6;margin-top:2rem;border-top:1px solid #ddd;padding-top:.6rem'>Advisory AI referee report \u2014 not an endorsement or proof. Overlay stores no content.</footer></body></html>";
          return new Response(repHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
        }
        var idxRows = await env.AUDIT.prepare("SELECT d.recid, d.decision, d.avg_score, d.basis, d.created_at, r.title, r.doi FROM jnl_decisions d LEFT JOIN jnl_records r ON r.recid = d.recid ORDER BY d.id DESC LIMIT 100").all();
        var cards = "";
        for (var xi = 0; xi < idxRows.results.length; xi++) {
          var xr = idxRows.results[xi];
          cards = cards + "<li><a href='/?recid=" + xr.recid + "'>" + escH(xr.title || "recid " + xr.recid) + "</a> \u2014 <strong>" + escH(xr.decision) + "</strong> (avg " + escH(String(xr.avg_score)) + ", " + escH(xr.basis) + ", " + escH(xr.created_at) + ")" + (xr.doi ? " \xB7 <a href='https://doi.org/" + escH(xr.doi) + "'>DOI</a>" : "") + "</li>";
        }
        var idxStats = await env.AUDIT.prepare("SELECT (SELECT COUNT(*) FROM jnl_records) AS records, (SELECT COUNT(*) FROM jnl_records WHERE self_authored=1) AS self_records, (SELECT COUNT(*) FROM jnl_decisions) AS decisions, (SELECT COUNT(*) FROM jnl_decisions WHERE self_review=1) AS self_review, (SELECT COUNT(*) FROM jnl_drift) AS drift_runs, (SELECT COUNT(*) FROM jnl_drift WHERE decision_changed=1) AS drift_flips, (SELECT COALESCE(SUM(citation_count),0) FROM jnl_records) AS citations, (SELECT COUNT(*) FROM jnl_submissions) AS submissions").first().catch(function() {
          return null;
        });
        var st = idxStats || { records: 0, self_records: 0, decisions: 0, self_review: 0, drift_runs: 0, drift_flips: 0, citations: 0, submissions: 0 };
        var selfShare = st.records ? Math.round(1e3 * st.self_records / st.records) / 10 + "%" : "n/a";
        var idxHtml = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>QNFO AI-Reviewed Journal \u2014 open overlay on Zenodo aiscience</title></head><body style='font-family:system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.5'><h1>QNFO AI-Reviewed Journal</h1><p>An open, AI-refereed overlay on the Zenodo <code>aiscience</code> community. Referee reports and decisions below are <strong>advisory</strong> \u2014 structured adversarial critiques by language models, not endorsements or proof. Paper bodies stay on Zenodo; this overlay stores no content.</p><details open style='background:#f6f6f6;padding:.6rem 1rem;border-radius:6px'><summary><strong>Status (machine-counted, not asserted)</strong></summary><ul><li>Tracked records: " + escH(String(st.records)) + " \u2014 self-authored: " + escH(String(st.self_records)) + " (" + escH(selfShare) + ")</li><li>Decisions: " + escH(String(st.decisions)) + " \u2014 flagged as self-review: " + escH(String(st.self_review)) + "</li><li>Reproducibility re-scores: " + escH(String(st.drift_runs)) + " run(s), " + escH(String(st.drift_flips)) + " decision flip(s) on identical content (model drift)</li><li>External citations across the corpus: " + escH(String(st.citations)) + " \u2014 link edges are concept-overlap only while this is zero</li><li>External submissions received: " + escH(String(st.submissions)) + "</li></ul></details><h2>Decisions</h2><ul>" + cards + "</ul><h2>Submitting a record</h2><p>Any Zenodo record can be submitted for review: send <code>POST /submit</code> with JSON <code>{&#34;id&#34;:&#34;&lt;recid, DOI, or Zenodo URL&gt;&#34;}</code> and an <code>x-jnl-token</code> header. Submissions are rate-limited per source. Records authored by this journal's own operator are recorded but are <strong>not</strong> queued for review, to prevent self-review. A review is advisory: a structured adversarial critique, never an endorsement and never a claim that a result is proven.</p><h2>Review integrity notes</h2><p>Decisions are deterministic thresholds applied to model verdicts, and model behaviour changes over time, so a stored decision is time-stamped under the models that produced it rather than a reproducible fact about the record. The <code>/drift</code> endpoint publishes re-score outcomes, including decision flips, and <code>/self-audit</code> publishes the self-review share. Every report states its review basis; metadata-only reviews can never reach PUBLISH.</p><footer style='opacity:.6;margin-top:2rem;border-top:1px solid #ddd;padding-top:.6rem'>Deterministic decision thresholds \xB7 metadata-only reviews never PUBLISH \xB7 overlay-only (no Zenodo write-back) \xB7 read API: /health /self-audit /drift /graph /decisions /submissions</footer></body></html>";
        return new Response(idxHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (method === "POST" && (path === "/enqueue" || path === "/seed" || path === "/run" || path === "/run-next" || path === "/cal" || path === "/submit" || path === "/rebuild-graph" || path === "/drift-check" || path === "/citation-probe")) {
        var authed = await authOk(request, env);
        if (!authed) return json({ ok: false, error: "unauthorized" }, 401);
        if (path === "/rebuild-graph") {
          var gRes = await buildGraph(env);
          return json({ ok: true, graph: gRes });
        }
        if (path === "/drift-check") {
          var bodyD = {};
          try {
            bodyD = await request.json();
          } catch (e) {
          }
          var modelsD = String(env.JNL_MODELS || MODELS_DEFAULT).split(",").map(function(x) {
            return x.trim();
          }).filter(Boolean);
          if (bodyD.recid) return json(await driftCheck(env, Number(bodyD.recid), modelsD));
          var nD = Math.min(Math.max(Number(bodyD.n || 3), 1), 10);
          return json(await driftSample(env, nD));
        }
        if (path === "/citation-probe") {
          var bodyP = {};
          try {
            bodyP = await request.json();
          } catch (e) {
          }
          if (bodyP.recid) return json(await citationProbe(env, Number(bodyP.recid)));
          return json(await citationSample(env, Math.min(Math.max(Number(bodyP.n || 25), 1), 25)));
        }
        if (path === "/submit") {
          var bodyS = {};
          try {
            bodyS = await request.json();
          } catch (e) {
          }
          var recidS = normalizeId(bodyS.id || url.searchParams.get("id") || "");
          if (!recidS) return json({ ok: false, error: "id required (recid, zenodo DOI, or zenodo URL)" }, 400);
          var whoS = await whoHash(request.headers.get("x-jnl-token") || "");
          var rlS = await submitRateOk(env, whoS);
          if (!rlS.ok) return json({ ok: false, error: "submission rate limit reached", limit: rlS }, 429);
          var resS;
          try {
            resS = await submitNew(env, recidS, bodyS.note, whoS);
          } catch (e2) {
            return json({ ok: false, error: "zenodo lookup failed: " + String(e2 && e2.message || e2).slice(0, 200) }, 502);
          }
          if (resS.dup) return json({ ok: true, duplicate: true, recid: recidS, note: "already queued or reviewed" });
          await submitBump(env, whoS);
          return json({ ok: true, accepted: true, recid: recidS, doi: resS.doi, title: resS.title, note: "queued for AI referee; runs on the cron cycle (review is advisory)" });
        }
        if (path === "/enqueue" || path === "/seed") {
          var body = {};
          try {
            body = await request.json();
          } catch (e) {
          }
          var lim = path === "/seed" ? 200 : Math.min(Number(body.limit || 20), 200);
          var seedRes = await enqueueNew(env, lim);
          return json({ ok: true, seeded: seedRes });
        }
        if (path === "/run") {
          var bodyR = {};
          try {
            bodyR = await request.json();
          } catch (e) {
          }
          var recidR = Number(bodyR.recid || url.searchParams.get("recid") || 0);
          if (!recidR) return json({ ok: false, error: "recid required" }, 400);
          var budgetRun = await dailyBudgetOk(env);
          if (!budgetRun.ok) return json({ ok: false, error: "daily budget reached", budget: budgetRun }, 429);
          var resRun = await runReview(env, recidR, true);
          if (resRun.ok) await bumpDaily(env);
          return json(resRun, resRun.ok ? 200 : 500);
        }
        if (path === "/run-next") {
          var bodyN = {};
          try {
            bodyN = await request.json();
          } catch (e) {
          }
          var n = Math.min(Math.max(Number(bodyN.n || 1), 1), 3);
          var outN = [];
          for (var k = 0; k < n; k++) {
            var b2 = await dailyBudgetOk(env);
            if (!b2.ok) {
              outN.push({ skipped: "daily budget reached" });
              break;
            }
            var rec = await pickQueued(env);
            if (!rec) break;
            var rr = await runReview(env, rec, true);
            if (rr.ok) await bumpDaily(env);
            outN.push({ recid: rec, ok: !!rr.ok, decision: rr.decision || null, error: rr.error || null });
          }
          return json({ ok: true, ran: outN });
        }
        if (path === "/cal") {
          var bodyC = {};
          try {
            bodyC = await request.json();
          } catch (e) {
          }
          var calTitle = String(bodyC.title || "calibration control").slice(0, 200);
          var calText = String(bodyC.text || "").slice(0, TEXT_CAP);
          if (!calText) return json({ ok: false, error: "text required" }, 400);
          var bCal = await dailyBudgetOk(env);
          if (!bCal.ok) return json({ ok: false, error: "daily budget reached", budget: bCal }, 429);
          var modelsC = String(env.JNL_MODELS || MODELS_DEFAULT).split(",").map(function(x) {
            return x.trim();
          }).filter(Boolean);
          var recC = { recid: null, doi: String(bodyC.doi || "(calibration)"), conceptdoi: null, version: String(bodyC.version || "(calibration)"), title: calTitle, publication_date: null, license: null, creators: String(bodyC.creators || "(calibration control)"), description: calText.slice(0, 6e3), keywords: String(bodyC.keywords || "(calibration)"), text: calText, text_chars: calText.length, fetched_key: "(calibration)" };
          var sysC = reviewerSystem("an adversarial-but-fair referee");
          var usrC = userPrompt(recC, true);
          var parsedC = [];
          var usedC = [];
          for (var ci = 0; ci < modelsC.length; ci++) {
            try {
              var outCTxt = await aiRun(env, modelsC[ci], sysC, usrC);
              var pC = parseJsonObject(outCTxt);
              if (pC) {
                parsedC.push(pC);
                usedC.push(modelsC[ci]);
              }
            } catch (e) {
              await log(env, null, "cal_model_error", String(e && e.message || e).slice(0, 300));
            }
          }
          if (!parsedC.length) return json({ ok: false, error: "no model produced parseable JSON" }, 500);
          var decC = decisionFrom(parsedC, "text");
          var ov = bodyC.dec_override || null;
          if (ov && typeof ov === "object") {
            decC = Object.assign({}, decC, {
              avg: typeof ov.avg === "number" ? ov.avg : decC.avg,
              min_avg: typeof ov.min_avg === "number" ? ov.min_avg : typeof decC.min_avg === "number" ? decC.min_avg : decC.avg,
              fatal: typeof ov.fatal === "boolean" ? ov.fatal : decC.fatal,
              fatal_spec_only: typeof ov.spec_only_fatal === "boolean" ? ov.spec_only_fatal : decC.fatal_spec_only,
              speculative: typeof ov.speculative === "boolean" ? ov.speculative : decC.speculative,
              low_confidence: typeof ov.low_confidence === "boolean" ? ov.low_confidence : decC.low_confidence,
              decision: String(ov.decision || decC.decision),
              reason: decC.reason + " | dec_override applied (decision-path calibration at a specified operating point)"
            });
          }
          var escC = await applySpecAckEscape(env, { title: calTitle, text: calText, description: calText.slice(0, 4e3), creators: "(calibration control)" }, decC, modelsC, null, "text");
          decC = escC.dec;
          await log(env, null, "cal", decC.decision + " avg=" + decC.avg + " path=" + decC.path + " title=" + calTitle.slice(0, 80));
          await bumpDaily(env);
          return json({ ok: true, title: calTitle, decision: decC.decision, avg_score: decC.avg, models: usedC, reason: decC.reason, path: decC.path, speculative: decC.speculative, spec_ack: escC.specPath.acknowledged, spec_votes: escC.specPath.votes, spec_criteria: escC.specPath.criteria, spec_rationale: escC.specPath.rationale });
        }
      }
      return json({ ok: true, service: "jnl-referee", version: VERSION, path, method, endpoints: ["GET /health", "GET /queue", "GET /reviews?recid=", "GET /decisions?recid=", "POST /enqueue (x-jnl-token)", "POST /seed (x-jnl-token)", "POST /run {recid} (x-jnl-token)", "POST /run-next {n} (x-jnl-token)"], note: "AI referee overlay for Zenodo community aiscience; isolated jnl-* stack; overlay-only (no Zenodo write-back)" });
    } catch (err) {
      return json({ ok: false, path, error: String(err && err.message || err) }, 500);
    }
  }
};
var BUILD = "specack-selfexclude-2026-09-10";
var SELF_ORCIDS = ["0009-0002-4317-5604"];
var SELF_NAME_PATTERNS = [/quni-?gudzinas/i, /rowan\s+brad\s+quni/i];
var SELF_ORG_PATTERNS = [/qnfo\s+ai\s+referee/i];
var OWN_REPORT_TITLE = "AI Referee Report";
function creatorList(h) {
  var md = h && h.metadata || {};
  var cr = md.creators || [];
  var out = [];
  for (var i = 0; i < cr.length; i++) {
    out.push({ name: String(cr[i].name || ""), orcid: String(cr[i].orcid || ""), affiliation: String(cr[i].affiliation || cr[i].affiliations && cr[i].affiliations[0] && cr[i].affiliations[0].name || "") });
  }
  return out;
}
__name(creatorList, "creatorList");
function isSelfRecord(h) {
  var title = String(h && h.metadata && h.metadata.title || "");
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
__name(isSelfRecord, "isSelfRecord");
function creatorsText(h) {
  return creatorList(h).map(function(c) {
    return c.name + (c.orcid ? " [" + c.orcid + "]" : "");
  }).join("; ").slice(0, 900);
}
__name(creatorsText, "creatorsText");
async function migrate(env) {
  var adds = [
    "ALTER TABLE jnl_records ADD COLUMN self_authored INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE jnl_records ADD COLUMN self_kind TEXT",
    "ALTER TABLE jnl_records ADD COLUMN friends INTEGER",
    "ALTER TABLE jnl_decisions ADD COLUMN speculative INTEGER DEFAULT 0",
    "ALTER TABLE jnl_decisions ADD COLUMN spec_ack INTEGER DEFAULT 0",
    "ALTER TABLE jnl_decisions ADD COLUMN self_review INTEGER DEFAULT 0",
    "ALTER TABLE jnl_decisions ADD COLUMN path TEXT",
    "ALTER TABLE jnl_decisions ADD COLUMN fatal_spec_only INTEGER DEFAULT 0",
    "CREATE TABLE IF NOT EXISTS jnl_drift (id INTEGER PRIMARY KEY AUTOINCREMENT, recid INTEGER NOT NULL, checked_at TEXT DEFAULT (datetime('now')), stored_decision TEXT, stored_avg REAL, fresh_decision TEXT, fresh_avg REAL, delta_avg REAL, decision_changed INTEGER DEFAULT 0, models TEXT, basis TEXT, note TEXT)",
    "ALTER TABLE jnl_records ADD COLUMN citation_count INTEGER DEFAULT 0",
    "ALTER TABLE jnl_records ADD COLUMN citation_checked_at TEXT",
    "ALTER TABLE jnl_records ADD COLUMN citation_source TEXT"
  ];
  var out = [];
  for (var i = 0; i < adds.length; i++) {
    try {
      await env.AUDIT.prepare(adds[i]).run();
      out.push("added");
    } catch (e) {
      out.push("exists");
    }
  }
  return out;
}
__name(migrate, "migrate");
function specAckSystem() {
  return "You are a second-pass reviewer for an open AI-reviewed journal whose stated ethos welcomes theoretical and philosophical work. A first-pass review flagged this record as speculative or lacking empirical evidence, which alone blocks publication. Your ONLY question: does the record handle its own speculation honestly and rigorously - does it state explicitly that its claims are theoretical/speculative, and does it offer falsifiable or disconfirming criteria a reader could actually test? Do NOT judge whether the claims are true. Do NOT reward confident tone. Absence of empirical evidence is expected and is not by itself a reason to answer false. Return ONLY one JSON object (no markdown fences, no commentary) with exactly these keys: acknowledged (boolean), disconfirmation_criteria (array of strings quoted or paraphrased from the record; empty array if none), rationale (string), confidence (high|medium|low).";
}
__name(specAckSystem, "specAckSystem");
async function speculationAckPass(env, rec, models) {
  var sys = specAckSystem();
  var usr = "RECORD METADATA\ntitle: " + (rec.title || "(none)") + "\ndoi: " + (rec.doi || "(none)") + "\ncreators: " + (rec.creators || "(none)") + "\n\nABSTRACT/DESCRIPTION:\n" + String(rec.description || "").slice(0, 4e3) + "\n\nFULL TEXT (first " + String(rec.text || "").length + " chars):\n" + String(rec.text || "").slice(0, 12e3) + "\n\nNow produce the acknowledgment JSON.";
  var votes = [], modelsUsed = [], criteria = [], rationale = "";
  for (var i = 0; i < models.length; i++) {
    try {
      var outTxt = await aiRun(env, models[i], sys, usr);
      var p = parseJsonObject(outTxt);
      if (p) {
        modelsUsed.push(models[i]);
        votes.push(p.acknowledged === true);
        var cc = arrOf(p.disconfirmation_criteria);
        for (var j = 0; j < cc.length && criteria.length < 8; j++) criteria.push(cc[j]);
        if (!rationale && p.rationale) rationale = String(p.rationale);
      }
    } catch (e) {
    }
  }
  var yes = votes.filter(function(x) {
    return x;
  }).length;
  var ack = votes.length > 0 && yes * 2 > votes.length && criteria.length > 0;
  return { used: true, acknowledged: ack, votes, models: modelsUsed, criteria, rationale: rationale || "(no second-pass model returned parseable JSON)" };
}
__name(speculationAckPass, "speculationAckPass");
function specEscapeEligible(dec, basis) {
  var fatalOk = !dec || !dec.fatal || dec.fatal_spec_only === true || dec.spec_only_fatal === true;
  return !!(dec && dec.decision === "REVISE" && dec.speculative && fatalOk && basis === "text" && dec.avg >= 7.5 && (typeof dec.min_avg !== "number" || dec.min_avg >= 6) && !dec.low_confidence);
}
__name(specEscapeEligible, "specEscapeEligible");
async function applySpecAckEscape(env, rec, dec, models, recid, basis) {
  var specPath = { used: false, acknowledged: false, votes: [], models: [], criteria: [], rationale: "" };
  if (!specEscapeEligible(dec, basis)) {
    if (!dec.path) dec.path = "threshold";
    return { dec, specPath };
  }
  specPath = await speculationAckPass(env, rec, models);
  if (specPath.acknowledged) {
    dec = Object.assign({}, dec, { decision: "PUBLISH", path: "speculation-acknowledged", reason: dec.reason + " | escape: speculation acknowledged on second pass (" + String(specPath.rationale).slice(0, 200) + ")" });
    await log(env, recid, "spec_ack", "speculation acknowledged -> PUBLISH (escape path)");
  } else {
    await log(env, recid, "spec_ack", "second pass did not acknowledge speculation; REVISE stands");
  }
  return { dec, specPath };
}
__name(applySpecAckEscape, "applySpecAckEscape");
function specAckReportSection(specPath, NL) {
  var specLines = [];
  specLines.push("");
  specLines.push("## Second-pass check: speculation acknowledgment (escape path, register row 124)");
  specLines.push("- The first pass flagged this record as speculative / lacking empirical evidence, which alone blocks publication. The second pass asked ONLY whether the record states its speculative status explicitly and offers falsifiable or disconfirming criteria. It did not judge whether the claims are true.");
  specLines.push("- Second-pass models returning a parseable verdict: " + (specPath.models.join(", ") || "(none)") + "; votes=" + JSON.stringify(specPath.votes));
  specLines.push("- Outcome: " + (specPath.acknowledged ? "acknowledged -> PUBLISH" : "not acknowledged -> REVISE stands"));
  specLines.push("- Disconfirming criteria offered by the record: " + (specPath.criteria.length ? specPath.criteria.map(function(x) {
    return String(x).slice(0, 200);
  }).join(" | ") : "(none extracted)"));
  specLines.push("- Second-pass rationale: " + String(specPath.rationale).slice(0, 700));
  return specLines.join(NL) + NL;
}
__name(specAckReportSection, "specAckReportSection");
async function scoreOnce(env, rec, models, recidForLog) {
  var basis = rec.text && rec.text.length >= 200 ? "text" : "metadata";
  var parsedList = [];
  var modelsUsed = [];
  var sys = reviewerSystem("an adversarial-but-fair referee");
  var usr = userPrompt(rec, basis === "text");
  for (var i = 0; i < models.length; i++) {
    try {
      var outTxt = await aiRun(env, models[i], sys, usr);
      var p = parseJsonObject(outTxt);
      if (p) {
        parsedList.push(p);
        modelsUsed.push(models[i]);
      } else {
        await log(env, recidForLog, "parse", "model " + models[i] + " returned non-JSON len=" + outTxt.length);
      }
    } catch (e) {
      await log(env, recidForLog, "model_error", "model " + models[i] + " :: " + String(e && e.message || e).slice(0, 300));
    }
  }
  return { basis, parsedList, modelsUsed };
}
__name(scoreOnce, "scoreOnce");
async function driftCheck(env, recid, models) {
  var stored = await env.AUDIT.prepare("SELECT decision, avg_score, basis FROM jnl_reviews WHERE recid = ?").bind(recid).first();
  if (!stored || !stored.decision) return { ok: false, recid, error: "no stored decision to compare against" };
  var rec = await fetchRecord(recid);
  var scored = await scoreOnce(env, rec, models, recid);
  if (!scored.parsedList.length) return { ok: false, recid, error: "no parseable output on re-score" };
  var fresh = decisionFrom(scored.parsedList, scored.basis);
  var delta = Math.round((fresh.avg - Number(stored.avg_score || 0)) * 100) / 100;
  var changed = fresh.decision !== stored.decision ? 1 : 0;
  await env.AUDIT.prepare("INSERT INTO jnl_drift (recid, stored_decision, stored_avg, fresh_decision, fresh_avg, delta_avg, decision_changed, models, basis, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(recid, stored.decision, stored.avg_score, fresh.decision, fresh.avg, delta, changed, scored.modelsUsed.join(","), scored.basis, changed ? "DECISION CHANGED on identical stored text and current models" : "stable").run();
  if (changed) await log(env, recid, "drift", "decision changed " + stored.decision + " -> " + fresh.decision + " (avg " + stored.avg_score + " -> " + fresh.avg + ")");
  return { ok: true, recid, stored_decision: stored.decision, stored_avg: stored.avg_score, fresh_decision: fresh.decision, fresh_avg: fresh.avg, delta_avg: delta, decision_changed: !!changed, basis: scored.basis };
}
__name(driftCheck, "driftCheck");
async function driftSample(env, n) {
  var models = String(env.JNL_MODELS || MODELS_DEFAULT).split(",").map(function(x) {
    return x.trim();
  }).filter(Boolean);
  var rows = await env.AUDIT.prepare("SELECT recid FROM jnl_reviews WHERE status = 'done' AND decision IS NOT NULL ORDER BY COALESCE(ran_at, created_at) ASC LIMIT ?").bind(Math.max(1, Math.min(n, 10))).all();
  var out = [];
  for (var i = 0; i < rows.results.length; i++) {
    try {
      out.push(await driftCheck(env, rows.results[i].recid, models));
    } catch (e) {
      out.push({ ok: false, recid: rows.results[i].recid, error: String(e && e.message || e).slice(0, 200) });
    }
  }
  var flips = out.filter(function(x) {
    return x && x.decision_changed;
  }).length;
  return { ok: true, checked: out.length, flips, rows: out };
}
__name(driftSample, "driftSample");
async function citationProbe(env, recid) {
  var row = await env.AUDIT.prepare("SELECT doi FROM jnl_records WHERE recid = ?").bind(recid).first();
  var doi = row && row.doi ? String(row.doi).replace(/^https?:\/\/doi.org\//, "") : null;
  if (!doi) return { ok: false, recid, error: "no doi on record" };
  var count = 0, source = "datacite", nota = null;
  try {
    var res = await fetch("https://api.datacite.org/dois/" + encodeURIComponent(doi), { headers: { accept: "application/vnd.api+json", "user-agent": UA }, signal: AbortSignal.timeout(2e4) });
    if (!res.ok) {
      nota = "HTTP " + res.status;
    } else {
      var body = await res.json();
      var attrs = body && body.data && body.data.attributes || {};
      if (typeof attrs.citationCount === "number") count = attrs.citationCount;
      else if (typeof attrs.citationsCount === "number") count = attrs.citationsCount;
      else {
        nota = "citationCount absent in DataCite response";
      }
    }
  } catch (e) {
    nota = String(e && e.message || e).slice(0, 160);
  }
  await env.AUDIT.prepare("UPDATE jnl_records SET citation_count = ?, citation_checked_at = datetime('now'), citation_source = ? WHERE recid = ?").bind(count, source, recid).run();
  return { ok: true, recid, doi, citation_count: count, source, note: nota };
}
__name(citationProbe, "citationProbe");
async function citationSample(env, n) {
  var rows = await env.AUDIT.prepare("SELECT recid FROM jnl_records WHERE citation_checked_at IS NULL OR citation_checked_at < datetime('now', '-14 days') ORDER BY (citation_checked_at IS NOT NULL) ASC, citation_checked_at ASC LIMIT ?").bind(Math.max(1, Math.min(n, 25))).all();
  var out = [];
  for (var i = 0; i < rows.results.length; i++) {
    try {
      out.push(await citationProbe(env, rows.results[i].recid));
    } catch (e) {
      out.push({ ok: false, recid: rows.results[i].recid, error: String(e && e.message || e).slice(0, 160) });
    }
  }
  var nonzero = out.filter(function(x) {
    return x && Number(x.citation_count) > 0;
  }).length;
  return { ok: true, probed: out.length, records_with_citations: nonzero, rows: out };
}
__name(citationSample, "citationSample");
var SPECULATIVE_RE = /speculative|no (empirical|experimental|direct) (evidence|validation|test|support)|lacks (empirical|experimental) evidence|lack[s]? .{0,24}empirical (evidence|validation)|unfalsifiable|not (empirically|experimentally) (tested|validated|verified)|no (data|measurements?) (supporting|to support)/;
return { default: index_default };
})();


var jnlReviserMod = (function(){
const QNFO_VERSION = "jnl-reviser/fabric-20260910";
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var REF = "jnl-referee";
var ZENODO = "https://zenodo.org/api";
var OWNER_QNFO = 1328013;
var MODEL = "@cf/deepseek-ai/deepseek-v4-flash-0731";
var UA = "jnl-reviser/0.2 (QNFO AI-Reviewed Journal revision loop)";
var MAX_EDITS = 6;
var MIN_FIND = 30;
function json(d, s = 200) {
  return new Response(JSON.stringify(d, null, 1), { status: s, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
}
__name(json, "json");
async function zf(url, opts = {}, tok) {
  const r = await fetch(url, { ...opts, headers: { "user-agent": UA, accept: "application/json", "content-type": "application/json", ...tok ? { authorization: `Bearer ${tok}` } : {}, ...opts.headers || {} }, signal: AbortSignal.timeout(12e4) });
  const t = await r.text();
  let b = null;
  try {
    b = t ? JSON.parse(t) : null;
  } catch (e) {
    b = { raw: t.slice(0, 200) };
  }
  return { status: r.status, body: b };
}
__name(zf, "zf");
function looseJson(t) {
  try {
    return JSON.parse(t);
  } catch (e) {
  }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch (e2) {
    }
  }
  return null;
}
__name(looseJson, "looseJson");
async function ensureToken(env) {
  if (!env.ZENODO_TOKEN) throw new Error("missing ZENODO_TOKEN");
  return env.ZENODO_TOKEN;
}
__name(ensureToken, "ensureToken");
function extractText(o) {
  if (typeof o === "string") return o;
  if (!o || typeof o !== "object") return "";
  if (o.response) return extractText(o.response);
  if (o.output_text) return String(o.output_text);
  if (o.output) return extractText(o.output);
  if (o.result) return extractText(o.result);
  if (Array.isArray(o)) return o.map(extractText).filter(Boolean).join(" ");
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === "string" && v.length > 40) return v;
  }
  return JSON.stringify(o);
}
__name(extractText, "extractText");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/health") return json({ ok: true, service: "jnl-reviser", version: "0.2.0", model: MODEL, zenodo_token_set: !!env.ZENODO_TOKEN });
      if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
      if (request.headers.get("x-ops-token") !== env.JNL_OPS_TOKEN) return json({ ok: false, error: "unauthorized" }, 401);
      const tok = await ensureToken(env);
      const body = await request.json().catch(() => ({}));
      const recid = Number(body.recid);
      const publish = body.publish === true;
      if (!recid) return json({ ok: false, error: "recid required" }, 400);
      const rr = await jnlRefCall(env).fetch(`https://${REF}/reviews?recid=${recid}`, { headers: { "user-agent": UA, accept: "application/json" } });
      const rt = await rr.text();
      let rj = null;
      try {
        rj = JSON.parse(rt);
      } catch (e) {
      }
      if (!rj?.rows?.length) return json({ ok: false, error: "no referee report", detail: rt.slice(0, 150) }, 404);
      const review = rj.rows[0];
      const pr = await zf(`${ZENODO}/records/${recid}`);
      if (pr.status !== 200) return json({ ok: false, error: "record fetch failed" }, 404);
      const paper = pr.body;
      const owners = (paper.owners || []).map((o) => Number(typeof o === "object" ? o.id : o));
      if (!owners.includes(OWNER_QNFO)) return json({ ok: false, error: "not self-published (owner not QNFO)" }, 403);
      const concept = paper.conceptrecid;
      const kvKey = `zenodo:draft:${recid}`;
      let draftId = null;
      const kvRaw = await env.STATE.get(kvKey);
      if (kvRaw) {
        try {
          const kv = JSON.parse(kvRaw);
          draftId = kv.draft_id;
        } catch (e) {
        }
      }
      if (!draftId) {
        const vr = await zf(`${ZENODO}/deposit/depositions/${recid}/actions/newversion`, { method: "POST", body: "{}" }, tok);
        if (vr.status !== 201) return json({ ok: false, error: "newversion failed", detail: vr.body }, 502);
        draftId = vr.body.id;
        const bucket2 = vr.body.links?.bucket;
        const dr2 = await zf(`${ZENODO}/deposit/depositions/${draftId}`, {}, tok);
        for (const f of paper.files || []) {
          const fr = await fetch(f.links.self, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(9e4) });
          if (fr.ok) {
            const c = await fr.text();
            await fetch(`${bucket2}/${encodeURIComponent(f.key)}`, { method: "PUT", headers: { authorization: `Bearer ${tok}`, "content-type": "application/octet-stream", "user-agent": UA }, body: c, signal: AbortSignal.timeout(12e4) });
          }
        }
        await env.STATE.put(kvKey, JSON.stringify({ draft_id: draftId, conceptrecid: concept, source_recid: recid }));
      }
      const dr = await zf(`${ZENODO}/deposit/depositions/${draftId}`, {}, tok);
      if (dr.status !== 200) return json({ ok: false, error: "draft fetch failed" }, 502);
      const draft = dr.body;
      const bucket = draft.links.bucket;
      const mdKey = (paper.files || []).find((f) => /\.(md|txt|markdown)$/i.test(f.key))?.key || (draft.files || []).find((f) => /\.(md|txt|markdown)$/i.test(f.filename))?.filename;
      if (!mdKey) return json({ ok: false, error: "no markdown file" }, 422);
      const mres = await fetch(`${bucket}/${encodeURIComponent(mdKey)}`, { headers: { authorization: `Bearer ${tok}`, "user-agent": UA }, signal: AbortSignal.timeout(9e4) });
      if (!mres.ok) return json({ ok: false, error: "md fetch from draft failed" }, 502);
      const mdText = await mres.text();
      const mdLimited = mdText.length > 3e4 ? mdText.slice(0, 3e4) : mdText;
      const weak = [];
      for (const sec of ["Weaknesses:", "Weaknesses", "weaknesses"]) {
      }
      const lines = (review.report_md || "").split("\n");
      let inW = false;
      for (const ln of lines) {
        const t = ln.trim();
        if (/^- Weaknesses:/i.test(t)) {
          inW = true;
          continue;
        }
        if (/^- (Strengths|Rationale|Limitations|Verdict|Soundness)/i.test(t)) {
          inW = false;
          continue;
        }
        if (inW && /^  - /.test(ln)) weak.push(t.replace(/^  - /, ""));
      }
      const weakText = weak.slice(0, 6).map((w, i) => `${i + 1}. ${w}`).join("\n") || "No explicit weaknesses listed; address clarity and evidence gaps.";
      const sysP = `You are an expert copyeditor improving a scholarly preprint in response to referee feedback. Return STRICT JSON only: {"edits":[{"find":"exact unique substring from the paper (>= ${MIN_FIND} chars, verbatim, incl. surrounding words)","replace":"improved replacement preserving meaning and author voice","reason":"which referee point this addresses"}]}. Rules: max ${MAX_EDITS} edits; NEVER alter title/frontmatter/first 300 chars; NEVER invent citations, data, or results; make conservative clarity/evidence-flagging/hedging improvements only; if no safe edit exists return {"edits":[]}.`;
      const userP = `REFEREE WEAKNESSES:
${weakText}

DECISION: ${review.decision} (avg ${review.avg_score}/10)

PAPER (${mdLimited.length} chars shown of ${mdText.length}):
${mdLimited}`;
      const ar = await env.AI.run(MODEL, { prompt: `${sysP}

${userP}`, max_tokens: 1500 });
      const raw = extractText(ar).slice(0, 6e3);
      const edits = looseJson(raw)?.edits || [];
      const applied = [];
      const skipped = [];
      let out = mdText;
      for (const e of edits.slice(0, MAX_EDITS)) {
        const f = String(e.find || "");
        const r = String(e.replace ?? "");
        if (f.length < MIN_FIND) {
          skipped.push({ reason: "find too short", find: f.slice(0, 60) });
          continue;
        }
        const idx = out.indexOf(f);
        const idx2 = idx >= 0 ? out.indexOf(f, idx + 1) : -1;
        if (idx < 0) {
          skipped.push({ reason: "not found", find: f.slice(0, 60) });
          continue;
        }
        if (idx2 >= 0) {
          skipped.push({ reason: "not unique", find: f.slice(0, 60) });
          continue;
        }
        if (idx < 300) {
          skipped.push({ reason: "frontmatter protected", find: f.slice(0, 60) });
          continue;
        }
        out = out.slice(0, idx) + r + out.slice(idx + f.length);
        applied.push({ find: f.slice(0, 80), replace: r.slice(0, 120), reason: e.reason });
      }
      if (applied.length === 0) {
        const sysB = `You are an expert copyeditor. Referee feedback asks for clarity on empirical status and accessibility. Add a small number of INSERTIONS ONLY (never alter existing wording, never invent citations/data/results/experiments). Return STRICT JSON: {"edits":[{"find":"exact unique substring >= 30 chars to anchor after (verbatim from paper)","insert":"1-3 sentences to append right after the anchor","reason":"which referee point this addresses"}]}. Each insert must truthfully clarify scope, empirical status, or define a dense term for non-experts (e.g. "In this work, X is presented as a theoretical proposal; experimental validation is left to future work."). Max 3 edits. If none are safe return {"edits":[]}.`;
        const arB = await env.AI.run(MODEL, { prompt: `${sysB}

REFEREE WEAKNESSES:
${weakText}

PAPER:
${mdLimited}`, max_tokens: 1200 });
        const rawB = extractText(arB).slice(0, 6e3);
        const editsB = looseJson(rawB)?.edits || [];
        for (const e of editsB.slice(0, 3)) {
          const f = String(e.find || "");
          const ins = String(e.insert || "").trim();
          if (f.length < 30 || !ins) continue;
          const idx = mdText.indexOf(f);
          if (idx < 0 || mdText.indexOf(f, idx + 1) >= 0 || idx < 300) continue;
          const sp = /\s$/;
          const joiner = sp.test(mdText.slice(0, idx + f.length)) ? " " : " ";
          out = mdText.slice(0, idx + f.length) + "\n\n" + ins + mdText.slice(idx + f.length);
          applied.push({ find: f.slice(0, 80), insert: ins.slice(0, 150), reason: e.reason, type: "insertion" });
          break;
        }
        if (applied.length === 0) return json({ ok: false, error: "no safe edits applied", applied, skipped, weaknesses: weak.slice(0, 6), model_raw: raw.slice(0, 800), model_raw_b: rawB.slice(0, 800), text_chars: mdText.length, text_preview_chars: mdLimited.length }, 422);
      }
      await fetch(`${bucket}/${encodeURIComponent(mdKey)}`, { method: "PUT", headers: { authorization: `Bearer ${tok}`, "content-type": "application/octet-stream", "user-agent": UA }, body: out, signal: AbortSignal.timeout(12e4) });
      const curVer = paper.metadata?.version || "1.0";
      const bump = /* @__PURE__ */ __name((v) => {
        const m = String(v).match(/^v?(\d+)\.(\d+)(.*)$/i);
        if (!m) return `v1.1`;
        const nv = `${m[1]}.${Number(m[2]) + 1}`;
        return m[3] ? `v${nv}` : v.startsWith("v") || /^v/i.test(v) ? `v${nv}` : nv;
      }, "bump");
      const newVer = curVer === "1.0" ? "1.1" : bump(curVer);
      const notes = `AI-assisted revision (${newVer}) addressing AI referee report: ${applied.length} targeted edits (${applied.map((a) => (a.reason || "").slice(0, 60)).filter(Boolean).join("; ").slice(0, 300) || "clarity/evidence hardening"}). Full referee report: see aiscience community review record.`;
      const existingMeta = draft.metadata && Object.keys(draft.metadata).length > 2 ? draft.metadata : paper.metadata || {};
      const merged = JSON.parse(JSON.stringify(existingMeta));
      delete merged.prereserve_doi;
      merged.version = newVer;
      merged.notes = merged.notes ? `${merged.notes} | ${notes}` : notes;
      merged.publication_date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      if (Array.isArray(merged.communities)) merged.communities = merged.communities.map((c) => ({ identifier: typeof c === "string" ? c : c.identifier || c.id }));
      const meta = { metadata: merged };
      const mur = await zf(`${ZENODO}/deposit/depositions/${draftId}`, { method: "PUT", body: JSON.stringify(meta) }, tok);
      if (mur.status !== 200) return json({ ok: false, error: "metadata update failed", detail: mur.body }, 502);
      const outObj = { ok: true, recid, draft_id: draftId, conceptrecid: concept, file: mdKey, version: newVer, applied, skipped, weaknesses: weak.slice(0, 6), published: false };
      if (publish) {
        const pub = await zf(`${ZENODO}/deposit/depositions/${draftId}/actions/publish`, { method: "POST", body: "{}" }, tok);
        if (pub.status < 200 || pub.status >= 300) return json({ ok: false, error: "publish failed", detail: pub.body }, 502);
        const rec = pub.body;
        outObj.published = true;
        outObj.new_recid = rec.id;
        outObj.new_doi = rec.doi || rec.metadata?.doi;
        await env.STATE.put(`zenodo:published:${recid}`, JSON.stringify({ new_recid: rec.id, new_doi: rec.doi, draft_id: draftId }));
      }
      return json(outObj);
    } catch (err) {
      return json({ ok: false, error: String(err && err.stack || err.message || err) }, 500);
    }
  }
};
return { default: worker_default };
})();


var jnlZenodoMod = (function(){
const QNFO_VERSION = "jnl-zenodo/fabric-20260910";
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var REFEREE = null;
var ZENODO_API = "https://zenodo.org/api";
var OWNER_QNFO = 1328013;
var COMMUNITY_UUID = "87f14e85-7156-4146-84e9-9e3a11e29c1d";
var UA = "jnl-zenodo/0.1 (QNFO AI-Reviewed Journal overlay; contact qnfo.org)";
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 1), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
}
__name(json, "json");
async function zfetch(url, opts = {}, token) {
  const res = await fetch(url, { ...opts, headers: { "user-agent": UA, accept: "application/json", "content-type": "application/json", ...token ? { authorization: `Bearer ${token}` } : {}, ...opts.headers || {} }, signal: AbortSignal.timeout(9e4) });
  const txt = await res.text();
  let body = null;
  try {
    body = txt ? JSON.parse(txt) : null;
  } catch (e) {
    body = { raw: txt.slice(0, 200) };
  }
  return { status: res.status, body };
}
__name(zfetch, "zfetch");
function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
__name(stripHtml, "stripHtml");
async function tryCommunitySubmission(draftId, token) {
  const attempts = [];
  const bodies = [
    { type: "community-submission", community: COMMUNITY_UUID },
    { type: "community-submission", payload: { community: COMMUNITY_UUID } }
  ];
  for (const body of bodies) {
    const tag = body.payload ? "payload-shape" : "flat-shape";
    try {
      const put = await fetch(ZENODO_API + "/records/" + draftId + "/draft/review", {
        method: "PUT",
        headers: { authorization: "Bearer " + token, "content-type": "application/json", "user-agent": UA, accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(6e4)
      });
      const pt = await put.text();
      let parsed = null;
      try {
        parsed = pt ? JSON.parse(pt) : null;
      } catch (e) {
      }
      attempts.push({ step: "review-put", shape: tag, status: put.status, request_id: parsed && parsed.id || null, head: pt.slice(0, 140) });
      if (put.ok && parsed && parsed.id) {
        const sub = await fetch(ZENODO_API + "/records/" + draftId + "/draft/actions/submit-review", {
          method: "POST",
          headers: { authorization: "Bearer " + token, "content-type": "application/json", "user-agent": UA, accept: "application/json" },
          body: "{}",
          signal: AbortSignal.timeout(6e4)
        });
        const st = await sub.text();
        attempts.push({ step: "submit-review", status: sub.status, head: st.slice(0, 140) });
        if (sub.ok) return { ok: true, attempts, request_id: parsed.id };
      }
    } catch (e) {
      attempts.push({ step: "review-put", shape: tag, error: String(e && e.message || e) });
    }
  }
  return { ok: false, attempts };
}
__name(tryCommunitySubmission, "tryCommunitySubmission");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/diag") {
        const probes = [];
        for (const u of [`${REFEREE}/health`, `${REFEREE}/reviews?recid=21993116`, `${ZENODO_API}/records/21993116`, `https://example.com`]) {
          try {
            const res = await fetch(u, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(3e4) });
            const txt = await res.text();
            probes.push({ url: u, status: res.status, head: txt.slice(0, 160) });
          } catch (e) {
            probes.push({ url: u, error: String(e && e.message || e) });
          }
        }
        return json({ ok: true, version: "0.1.1-diag", probes });
      }
      if (path === "/submissions") {
        const kvList = await env.STATE.list({ prefix: "zenodo:submission:" });
        const out = [];
        for (const k of kvList.keys) {
          const v = await env.STATE.get(k.name);
          try {
            out.push(JSON.parse(v));
          } catch (e) {
          }
        }
        return json({ ok: true, count: out.length, submissions: out });
      }
      if (path === "/health") {
        return json({ ok: true, service: "jnl-zenodo", version: "0.1.3", zenodo_token_set: !!env.ZENODO_TOKEN });
      }
      if (request.method !== "POST") return json({ ok: false, error: "method not allowed; POST only" }, 405);
      if (request.headers.get("x-ops-token") !== env.JNL_OPS_TOKEN) return json({ ok: false, error: "unauthorized" }, 401);
      const body = await request.json().catch(() => ({}));
      if (path === "/publish-review") {
        const recid = Number(body.recid);
        if (!recid) return json({ ok: false, error: "recid required" }, 400);
        const kvKey = `zenodo:review:${recid}`;
        const existing = await env.STATE.get(kvKey);
        if (existing) return json({ ok: true, already_published: JSON.parse(existing) });
        const rr = await (async () => {
          const res = await jnlRefCall(env).fetch(`https://jnl-referee/reviews?recid=${recid}`, { headers: { "user-agent": UA, accept: "application/json" } });
          const txt = await res.text();
          let b = null;
          try {
            b = txt ? JSON.parse(txt) : null;
          } catch (e) {
          }
          return { status: res.status, body: b };
        })();
        if (rr.status !== 200 || !rr.body?.rows?.length) return json({ ok: false, error: `referee report not found (${rr.status})` }, 404);
        const review = rr.body.rows[0];
        const pr = await zfetch(`${ZENODO_API}/records/${recid}`);
        if (pr.status !== 200) return json({ ok: false, error: `zenodo record fetch failed (${pr.status})` }, 404);
        const paper = pr.body;
        const title = paper.metadata?.title || `Zenodo record ${recid}`;
        const paperDoi = paper.doi || paper.metadata?.doi;
        const dr = await zfetch(`${ZENODO_API}/deposit/depositions`, { method: "POST", body: "{}" }, env.ZENODO_TOKEN);
        if (dr.status !== 201) return json({ ok: false, error: `draft create failed (${dr.status})`, detail: dr.body }, 502);
        const draft = dr.body;
        const draftId = draft.id;
        const bucket = draft.links?.bucket;
        const desc = `AI-generated referee report for "${stripHtml(title)}" (Zenodo ${paperDoi}). Produced automatically by the QNFO AI-Reviewed Journal overlay on the Zenodo 'aiscience' community. Advisory machine review; not endorsement. Full report in file. Models: ${review.model || "workers-ai"}. Decision: ${review.decision || "n/a"} (avg ${review.avg_score ?? "n/a"}/10).`;
        const meta = {
          metadata: {
            title: `AI Referee Report \u2014 ${stripHtml(title).slice(0, 240)}`,
            upload_type: "publication",
            publication_type: "report",
            description: desc,
            creators: [{ name: "QNFO AI Referee", affiliation: "QNFO" }],
            access_right: "open",
            license: "cc-by-4.0",
            communities: [{ identifier: "aiscience" }],
            related_identifiers: paperDoi ? [{ identifier: paperDoi, relation: "reviews", scheme: "doi" }] : []
          }
        };
        const mr = await zfetch(`${ZENODO_API}/deposit/depositions/${draftId}`, { method: "PUT", body: JSON.stringify(meta) }, env.ZENODO_TOKEN);
        if (mr.status !== 200) return json({ ok: false, error: `metadata update failed (${mr.status})`, detail: mr.body }, 502);
        const submit = await tryCommunitySubmission(draftId, env.ZENODO_TOKEN);
        await env.STATE.put("zenodo:submission:" + recid, JSON.stringify({ recid, draft_id: draftId, ok: submit.ok, attempts: submit.attempts, at: (/* @__PURE__ */ new Date()).toISOString() }));
        const fname = `ai-referee-report-${recid}.md`;
        let ur = { status: 0 };
        try {
          const fres = await fetch(`${bucket}/${encodeURIComponent(fname)}`, { method: "PUT", headers: { authorization: `Bearer ${env.ZENODO_TOKEN}`, "content-type": "application/octet-stream", "user-agent": UA }, body: review.report_md || desc, signal: AbortSignal.timeout(9e4) });
          ur = { status: fres.status };
        } catch (e) {
          ur = { status: 0, error: String(e.message) };
        }
        if (ur.status < 200 || ur.status >= 300) return json({ ok: false, error: `file upload failed (${ur.status})`, detail: ur }, 502);
        const pub = await zfetch(`${ZENODO_API}/deposit/depositions/${draftId}/actions/publish`, { method: "POST", body: "{}" }, env.ZENODO_TOKEN);
        if (pub.status < 200 || pub.status >= 300) return json({ ok: false, error: `publish failed (${pub.status})`, detail: pub.body }, 502);
        const rec = pub.body;
        const out = { zenodo_recid: rec.id, submission: { attempted: true, ok: submit.ok, request_id: submit.request_id || null }, conceptrecid: rec.conceptrecid, doi: rec.doi || rec.metadata?.doi, decision: review.decision, avg_score: review.avg_score, paper_recid: recid, paper_doi: paperDoi, published_at: (/* @__PURE__ */ new Date()).toISOString() };
        await env.STATE.put(kvKey, JSON.stringify(out));
        return json({ ok: true, published: out });
      }
      if (path === "/revise-draft") {
        const recid = Number(body.recid);
        if (!recid) return json({ ok: false, error: "recid required" }, 400);
        const pr = await zfetch(`${ZENODO_API}/records/${recid}`);
        if (pr.status !== 200) return json({ ok: false, error: `zenodo record fetch failed (${pr.status})` }, 404);
        const paper = pr.body;
        const owners = (paper.owners || []).map((o) => Number(typeof o === "object" ? o.id : o));
        if (!owners.length && paper.owner != null) owners.push(Number(paper.owner));
        if (!owners.includes(OWNER_QNFO)) return json({ ok: false, error: "not self-published (owner not QNFO); revisions only for own records", owner: owners }, 403);
        const concept = paper.conceptrecid;
        if (!concept) return json({ ok: false, error: "no conceptrecid" }, 400);
        const vr = await zfetch(`${ZENODO_API}/deposit/depositions/${recid}/actions/newversion`, { method: "POST", body: "{}" }, env.ZENODO_TOKEN);
        if (vr.status < 200 || vr.status >= 300) return json({ ok: false, error: `new version failed (${vr.status})`, detail: vr.body }, 502);
        const draft = vr.body;
        const draftId = draft.id;
        const bucket = draft.links?.bucket;
        const mdFile = (paper.files || []).find((f) => /\.(md|txt|markdown)$/i.test(f.key));
        let copied = [];
        if (mdFile) {
          const fr = await fetch(mdFile.links.self, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(6e4) });
          if (fr.ok) {
            const content = await fr.text();
            await fetch(`${bucket}/${encodeURIComponent(mdFile.key)}`, { method: "PUT", headers: { authorization: `Bearer ${env.ZENODO_TOKEN}`, "content-type": "application/octet-stream", "user-agent": UA }, body: content, signal: AbortSignal.timeout(9e4) });
            copied.push(mdFile.key);
          }
        }
        const out = { draft_id: draftId, conceptrecid: concept, source_recid: recid, copied_files: copied, next: `PUT ${ZENODO_API}/deposit/depositions/${draftId} to edit metadata; POST .../actions/publish to publish`, status: "draft-not-published" };
        await env.STATE.put(`zenodo:draft:${recid}`, JSON.stringify(out));
        return json({ ok: true, draft: out });
      }
      return json({ ok: false, error: `unknown path ${path}` }, 404);
    } catch (err) {
      return json({ ok: false, error: String(err && err.stack || err.message || err) }, 500);
    }
  }
};
return { default: index_default };
})();



function jnlRefCall(env) {
  return { fetch: function (url, init) { return jnlRefereeMod.default.fetch(new Request(url, init), env); } };
}

// ===== MERGED JOURNAL PIPELINE (2026-09-11: watch + referee + reviser + zenodo) =====
export default {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname;
    if (p === "/health") return new Response(JSON.stringify({ ok: true, worker: "jnl-pipeline", version: "merged-2026-09-11" }), { headers: { "content-type": "application/json" } });
    function sub(prefix, mod) {
      const u = new URL(request.url); u.pathname = p.slice(prefix.length) || "/";
      return mod.default.fetch(new Request(u.toString(), request), env, ctx);
    }
    if (p === "/watch" || p.startsWith("/watch/")) return sub("/watch", jnlWatchMod);
    if (p === "/referee" || p.startsWith("/referee/")) return sub("/referee", jnlRefereeMod);
    if (p === "/reviser" || p.startsWith("/reviser/")) return sub("/reviser", jnlReviserMod);
    if (p === "/zenodo" || p.startsWith("/zenodo/")) return sub("/zenodo", jnlZenodoMod);
    return new Response("jnl-pipeline", { status: 200 });
  },
  async scheduled(event, env, ctx) {
    if (event.cron === "*/10 * * * *") return jnlWatchMod.default.scheduled ? jnlWatchMod.default.scheduled(event, env, ctx) : undefined;
    if (event.cron === "23 */2 * * *") return jnlRefereeMod.default.scheduled(event, env, ctx);
  },
};

--90836cedc261436b9f6c0a3e12698edbebdb6ff14ed29910c5cb79ccfd9d--
