/**
 * vault-indexer v0.1.0
 * Semantic (Vectorize) indexer for the Obsidian vault (single source of truth = obsidian-vault R2).
 * Reads note docs -> chunk -> embed (@cf/baai/bge-base-en-v1.5, 768d) -> upsert Vectorize personal-life
 * + personal-life D1 files/chunks. Feeds the personal-twin RAG. Runs on cron every 5 minutes.
 * CPU-safe: full GET bounded, chunks max 24 per doc, docs max 250 per run, parallel embed (8x), batched upserts.
 * v0.1.3: parallel embedding; stale-row reconcile (legacy orphans removed); vault_indexer_runs log; POST /drain.
 * Canonical source: QNFO/qnfo-workers vault-indexer/
 */
var VERSION = "0.1.5";
var WORKER = "vault-indexer";
var MAX_LIST_PAGES = 20;
var MAX_DOCS = 250;
var MAX_BYTES = 262144;
var CHUNK_SIZE = 900;
var CHUNK_OVERLAP = 120;
var MAX_CHUNKS = 24;
var GET_CONCURRENCY = 16;
var EMBED_CONCURRENCY = 8;
var PATH_PREFIX = "obsidian/";
var SKIP_PREFIXES = [".obsidian/", "releases/", "Attachments/", "Archive/", ".git/"];
var INGEST_ROOTS = ["notes/", "Inbox/", "Projects/", "Areas/", "Resources/"];
var MD_RE = /\.(md|markdown|mdx|txt)$/i;

function json(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } }); }
function basename(k) { var p = k.split("/"); return p[p.length - 1] || k; }
function chunkArr(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
function extOf(key) { var i = key.lastIndexOf("."); return i >= 0 ? key.slice(i + 1).toLowerCase() : ""; }
function sanitize(s, max) { return String(s || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/[\uD800-\uDFFF]/g, "").trim().slice(0, max || 800); }

function chunkText(text, size, overlap) {
  size = size || CHUNK_SIZE; overlap = overlap || CHUNK_OVERLAP;
  var out = [];
  var clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  var n = clean.length;
  if (n < 60) return out;
  var i = 0;
  while (i < n) {
    var end = i + size;
    if (end > n) end = n;
    else {
      var lastNl = clean.lastIndexOf("\n", end);
      if (lastNl > i + size * 0.5) end = lastNl;
      else { var lastSp = clean.lastIndexOf(" ", end); if (lastSp > i + size * 0.5) end = lastSp; }
    }
    var c = clean.slice(i, end).trim();
    if (c.length >= 40) out.push(c);
    if (end >= n) break;
    if (end <= i) break;
    i = end - overlap;
    if (out.length >= MAX_CHUNKS) break;
  }
  return out;
}

var CATEGORY_KEYWORDS = [
  ["finance", ["bank", "statement", "tax", "invoice", "receipt", "mortgage", "rent", "insurance", "salary"]],
  ["health", ["medical", "doctor", "clinic", "prescription", "vaccin", "hospital", "therapy"]],
  ["legal", ["contract", "agreement", "will", "power of attorney", "court", "lawsuit", "notary"]],
  ["housing", ["apartment", "lease", "landlord", "property", "utilities", "electricity"]],
  ["identity", ["passport", "driving license", "residence permit", "visa", "birth certificate"]],
  ["work", ["resume", "cv", "interview", "offer letter", "employment", "reference"]],
  ["travel", ["flight", "boarding", "itinerary", "hotel", "booking", "ticket"]],
  ["education", ["diploma", "transcript", "degree", "course", "university", "certificate"]],
  ["personal", ["family", "photo", "journal", "diary", "letter"]]
];
function categorize(text, key) {
  var hay = (text + " " + key).toLowerCase();
  var best = "general", bestScore = 0;
  for (var i = 0; i < CATEGORY_KEYWORDS.length; i++) {
    var cat = CATEGORY_KEYWORDS[i][0], kws = CATEGORY_KEYWORDS[i][1], score = 0;
    for (var j = 0; j < kws.length; j++) if (hay.indexOf(kws[j]) >= 0) score++;
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return bestScore > 0 ? best : "general";
}

async function sha256hex(s) {
  var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d.slice(0, 16))).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

function inScope(key) {
  if (SKIP_PREFIXES.some(function (p) { return key.indexOf(p) === 0; })) return false;
  if (!MD_RE.test(key)) return false;
  return INGEST_ROOTS.some(function (p) { return key.indexOf(p) === 0; });
}

async function getFull(env, key) {
  try {
    if (!MD_RE.test(key)) return null;
    var head = await env.VAULT.head(key);
    if (head && head.size > MAX_BYTES) return null;
    var o = await env.VAULT.get(key);
    if (!o) return null;
    return await o.text();
  } catch (e) { return null; }
}

async function run(env, cap) {
  var t0 = Date.now();
  var s = { scanned: 0, changed: 0, indexed: 0, chunks: 0, vectors: 0, skipped: 0, reconciled: 0, errors: 0, notes: [] };

  var reg = new Map();
  try {
    var r0 = await env.PERSONAL.prepare("SELECT path,size,modified FROM files WHERE path LIKE 'obsidian/%'").all();
    (r0.results || []).forEach(function (x) { reg.set(x.path, x.size + "|" + x.modified); });
  } catch (e) { s.errors++; s.notes.push("registry-read-fail"); }

  var all = [], cursor = undefined, pages = 0;
  do {
    var listed;
    try { listed = await env.VAULT.list({ cursor: cursor, limit: 1000 }); }
    catch (e) { s.errors++; s.notes.push("list-fail"); break; }
    cursor = listed.truncated ? listed.cursor : undefined;
    pages++;
    var objs = listed.objects || [];
    for (var i = 0; i < objs.length; i++) { all.push(objs[i]); s.scanned++; }
  } while (cursor && pages < MAX_LIST_PAGES);

  var completeList = !cursor;
  var changed = [];
  var seenPaths = new Set();
  for (var a = 0; a < all.length; a++) {
    var o = all[a];
    if (!inScope(o.key)) continue;
    var path = PATH_PREFIX + o.key;
    seenPaths.add(path);
    var sig = o.size + "|" + (o.uploaded ? o.uploaded.toISOString() : "");
    if (reg.get(path) === sig) continue;
    changed.push({ key: o.key, obj: o, path: path });
  }
  s.changed = changed.length;

  if (completeList) {
    var stale = [];
    reg.forEach(function (_v, p) { if (!seenPaths.has(p)) stale.push(p); });
    var staleGroups = chunkArr(stale, 50);
    for (var dg2 = 0; dg2 < staleGroups.length; dg2++) {
      try {
        var dstmts = [];
        for (var gi = 0; gi < staleGroups[dg2].length; gi++) {
          dstmts.push(env.PERSONAL.prepare("DELETE FROM chunks WHERE path=?1").bind(staleGroups[dg2][gi]));
          dstmts.push(env.PERSONAL.prepare("DELETE FROM files WHERE path=?1").bind(staleGroups[dg2][gi]));
        }
        await env.PERSONAL.batch(dstmts);
        s.reconciled += staleGroups[dg2].length;
      } catch (e) { s.errors++; }
    }
  }

  var work = changed.slice(0, cap || MAX_DOCS);
  var texts = new Array(work.length);
  for (var b = 0; b < work.length; b += GET_CONCURRENCY) {
    var slice = work.slice(b, b + GET_CONCURRENCY);
    var ts = await Promise.all(slice.map(function (w) { return getFull(env, w.key); }));
    for (var j = 0; j < slice.length; j++) texts[b + j] = ts[j];
  }

  var prepared = new Array(work.length);
  for (var eb = 0; eb < work.length; eb += EMBED_CONCURRENCY) {
    var eslice = work.slice(eb, eb + EMBED_CONCURRENCY);
    await Promise.all(eslice.map(async function (w, k) {
      var idx = eb + k;
      var text = texts[idx];
      if (text === null) { prepared[idx] = null; return; }
      var chs = chunkText(text);
      if (chs.length === 0) { prepared[idx] = null; return; }
      var resp;
      try { resp = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: chs }, { gateway: { id: "default" } }); }
      catch (e) { prepared[idx] = { error: true }; return; }
      var vectors = (resp && resp.data) || [];
      var valid = vectors.filter(function (v) { return Array.isArray(v) && v.length === 768; }).map(function (v) { return v.map(function (z) { return Number.isFinite(z) ? z : 0; }); });
      if (valid.length === 0) { prepared[idx] = { error: true }; return; }
      prepared[idx] = { w: w, chs: chs, valid: valid, cat: categorize(chs.join(" "), w.key) };
    }));
  }

  for (var x = 0; x < work.length; x++) {
    var p = prepared[x];
    if (p === null) { s.skipped++; continue; }
    if (p.error) { s.errors++; continue; }
    var w = p.w;
    var dg = await sha256hex(w.path);
    var vecBatch = [], chunkStmts = [];
    for (var ci = 0; ci < p.valid.length; ci++) {
      var id = dg + ":" + ci;
      vecBatch.push({ id: id, values: p.valid[ci], metadata: { path: w.path, type: extOf(w.key), chunk: String(ci), category: String(p.cat), modified: String(w.obj.uploaded ? w.obj.uploaded.toISOString() : ""), text: sanitize(p.chs[ci], 800) } });
      chunkStmts.push(env.PERSONAL.prepare("INSERT INTO chunks (id,path,chunk_idx,text_len) VALUES (?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET path=?2,chunk_idx=?3,text_len=?4").bind(id, w.path, ci, p.chs[ci].length));
    }
    try { await env.VZ.upsert(vecBatch); s.vectors += vecBatch.length; s.chunks += vecBatch.length; }
    catch (e) { s.errors++; continue; }
    try { await env.PERSONAL.batch(chunkStmts); } catch (e) { }
    try {
      var mod = w.obj.uploaded ? w.obj.uploaded.toISOString() : new Date().toISOString();
      await env.PERSONAL.prepare("INSERT INTO files (path,type,size,modified,indexed_at,chunks,title,category,wbs,qnfo_link) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,NULL,NULL) ON CONFLICT(path) DO UPDATE SET type=?2,size=?3,modified=?4,indexed_at=?5,chunks=?6,title=?7,category=?8").bind(w.path, extOf(w.key), w.obj.size, mod, new Date().toISOString(), p.valid.length, basename(w.key), p.cat).run();
      s.indexed++;
    } catch (e) { s.errors++; }
  }

  try {
    await env.PERSONAL.prepare("INSERT INTO vault_indexer_runs (started,finished,scanned,changed,indexed,chunks,skipped,reconciled,errors) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(new Date(t0).toISOString(), new Date().toISOString(), s.scanned, s.changed, s.indexed, s.chunks, s.skipped, s.reconciled, s.errors).run();
  } catch (e) { }

  s.elapsedMs = Date.now() - t0;
  return s;
}

async function handle(request, env, ctx) {
  try {
    var url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, worker: WORKER, version: VERSION });
    if (request.method === "OPTIONS") return new Response("ok", { status: 204 });
    if (url.pathname === "/run" && request.method === "POST") {
      var cap = Math.min(60, Math.max(1, Number(url.searchParams.get("max") || 40)));
      var r = await run(env, cap);
      return json({ ok: true, version: VERSION, result: r });
    }
    if (url.pathname === "/drain" && request.method === "POST") {
      var n = Math.min(6, Math.max(1, Number(url.searchParams.get("n") || 3)));
      var cap2 = Math.min(120, Math.max(10, Number(url.searchParams.get("cap") || 80)));
      var agg = { runs: 0, indexed: 0, chunks: 0, reconciled: 0, errors: 0, lastChanged: null };
      for (var i = 0; i < n; i++) {
        var rr = await run(env, cap2);
        agg.runs++; agg.indexed += rr.indexed; agg.chunks += rr.chunks; agg.reconciled += rr.reconciled; agg.errors += rr.errors; agg.lastChanged = rr.changed;
        if (rr.changed === 0) break;
      }
      return json({ ok: true, version: VERSION, result: agg });
    }
    if (url.pathname === "/stats" && request.method === "GET") {
      var t = await env.PERSONAL.prepare("SELECT COUNT(*) c FROM files WHERE path LIKE 'obsidian/%'").first();
      var ch = await env.PERSONAL.prepare("SELECT COUNT(*) c FROM chunks WHERE path LIKE 'obsidian/%'").first();
      var runs = await env.PERSONAL.prepare("SELECT * FROM vault_indexer_runs ORDER BY id DESC LIMIT 5").all();
      return json({ ok: true, version: VERSION, files: t && t.c || 0, chunks: ch && ch.c || 0, recent_runs: runs.results || [] });
    }
    return json({ ok: false, error: "not found" }, 404);
  } catch (e) {
    return json({ ok: false, error: "EXCEPTION: " + (e && e.message || String(e)) }, 500);
  }
}

var worker_default = {
  async fetch(request, env, ctx) { return handle(request, env, ctx); },
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env)); }
};
export { worker_default as default };
