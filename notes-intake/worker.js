/**
 * notes-intake v0.1.3
 * Server-side Obsidian vault notes pipeline.
 * INGEST vault -> notes_intake registry | TRIAGE -> needs_triage | EXECUTE dated -> calendar |
 * PUBLISH -> notes_publish_queue | IMPLEMENT -> regenerate notes/v1/_index.md.
 * Runs on cron every 15 minutes. Idempotent (registry sig dedupe; calendar UNIQUE uid). CPU-safe: range-GET head + D1 batch.
 * v0.1.3: non-blocking POST /run (ctx.waitUntil); INGEST_ROOTS scope (skip vault-root site files);
 *         stale-row reconcile; parallel head GETs; MAX_CHANGED 500.
 * Canonical source: QNFO/qnfo-workers notes-intake/
 */
var VERSION = "0.1.5";
var WORKER = "notes-intake";
var MAX_LIST_PAGES = 30;
var MAX_CHANGED = 500;
var MAX_EVENTS_PER_RUN = 100;
var FUTURE_WINDOW_DAYS = 7;
var HEAD_BYTES = 32768;
var GET_CONCURRENCY = 16;
var SKIP_PREFIXES = [".obsidian/", "releases/", "Attachments/", "Archive/", ".git/"];
var INGEST_ROOTS = ["notes/", "Inbox/", "Projects/", "Areas/", "Resources/"];
var MD_RE = /\.(md|markdown|mdx)$/i;

function json(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } }); }
function basename(k) { var p = k.split("/"); return p[p.length - 1] || k; }
function numOrNull(v) { if (v === undefined || v === null || v === "") return null; var n = Number(v); return Number.isFinite(n) ? n : null; }
function bearer(r) { return String(r.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim(); }
function chunk(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

function parseFrontmatter(text) {
  var out = {};
  if (text.slice(0, 3) !== "---") return out;
  var end = text.indexOf("\n---", 3);
  if (end < 0) return out;
  var lines = text.slice(3, end).split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/\s+$/, "");
    if (!line || line.charAt(0) === "#" || line.charAt(0) === " ") continue;
    var c = line.indexOf(":");
    if (c < 0) continue;
    var k = line.slice(0, c).trim();
    var v = line.slice(c + 1).trim();
    if ((v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') || (v.charAt(0) === "'" && v.charAt(v.length - 1) === "'")) v = v.slice(1, -1);
    else if (v.charAt(0) === "[" && v.charAt(v.length - 1) === "]") v = v.slice(1, -1).split(",").map(function (x) { return x.trim().replace(/^["']|["']$/g, ""); }).filter(Boolean);
    out[k] = v;
  }
  return out;
}

function inferType(key, fm) {
  if (fm.type) return String(fm.type);
  if (key.indexOf("Inbox/") === 0) return "capture";
  if (key.indexOf("Projects/") === 0) return "project";
  if (key.indexOf("Areas/") === 0) return "area";
  if (key.indexOf("Resources/") === 0) return "resource";
  if (/^_\d{2}\.md$/.test(basename(key))) return "daily";
  return "note";
}

function extractDatedActions(text) {
  var res = [];
  var re = /^[ \t]*[-*][ \t]*\[ \][ \t]*(\d{4}-\d{2}-\d{2})(?:[ \t]+(\d{2}:\d{2}))?[^\n]*?[\u2014\-:][ \t]*(.+)$/gm;
  var m, guard = 0;
  while ((m = re.exec(text)) !== null && guard++ < 200) res.push({ date: m[1], time: m[2] || null, text: m[3].trim().slice(0, 300) });
  return res;
}

async function getHead(env, key) {
  try {
    if (!MD_RE.test(key)) return null;
    var o = await env.VAULT.get(key, { range: { offset: 0, length: HEAD_BYTES } });
    if (!o) return null;
    return await o.text();
  } catch (e) { return null; }
}

async function digest16(s) {
  var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d.slice(0, 8))).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

function inScope(key) {
  if (SKIP_PREFIXES.some(function (p) { return key.indexOf(p) === 0; })) return false;
  if (!MD_RE.test(key)) return false;
  return INGEST_ROOTS.some(function (p) { return key.indexOf(p) === 0; });
}

async function run(env) {
  var t0 = Date.now();
  var s = { scanned: 0, changed: 0, ingested: 0, triaged: 0, eventsCreated: 0, eventsExisting: 0, publishQueued: 0, reconciled: 0, indexRegenerated: false, errors: 0, notes: [] };

  var regMap = new Map();
  try {
    var r0 = await env.AUDIT.prepare("SELECT path,sig FROM notes_intake").all();
    (r0.results || []).forEach(function (x) { regMap.set(x.path, x.sig); });
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

  var seen = new Set();
  var changed = [];
  var nowMs = Date.now();
  for (var a = 0; a < all.length; a++) {
    var o = all[a]; var key = o.key;
    if (!inScope(key)) continue;
    seen.add(key);
    var sig = o.size + "|" + (o.uploaded ? o.uploaded.getTime() : 0);
    if (regMap.get(key) === sig) continue;
    changed.push({ key: key, obj: o, sig: sig });
  }
  s.changed = changed.length;

  if (completeList) {
    var stale = [];
    regMap.forEach(function (_sig, path) {
      if (!seen.has(path)) stale.push(path);
    });
    var delChunks = chunk(stale, 50);
    for (var d = 0; d < delChunks.length; d++) {
      try {
        var ds = delChunks[d].map(function (p) { return env.AUDIT.prepare("DELETE FROM notes_intake WHERE path=?1").bind(p); });
        await env.AUDIT.batch(ds);
        s.reconciled += delChunks[d].length;
      } catch (e) { s.errors++; }
    }
  }

  var work = changed.slice(0, MAX_CHANGED);
  var heads = new Array(work.length);
  for (var b = 0; b < work.length; b += GET_CONCURRENCY) {
    var slice = work.slice(b, b + GET_CONCURRENCY);
    var texts = await Promise.all(slice.map(function (w) { return getHead(env, w.key); }));
    for (var j = 0; j < slice.length; j++) heads[b + j] = texts[j];
  }

  var upserts = [], datedActions = [], publishFlags = [];
  for (var x = 0; x < work.length; x++) {
    var text = heads[x];
    if (text === null) continue;
    var w = work[x], wkey = w.key, wobj = w.obj, wsig = w.sig;
    var fm = parseFrontmatter(text);
    var type = inferType(wkey, fm);
    var title = (fm.title && String(fm.title)) || basename(wkey);
    var status = fm.status ? String(fm.status) : "active";
    var triage = (wkey.indexOf("Inbox/") === 0 || String(fm.triage).toLowerCase() === "true") ? "needs_triage" : null;
    upserts.push({ path: wkey, type: type, title: title, status: status, priority: numOrNull(fm.priority), due: fm.due ? String(fm.due).slice(0, 10) : null, next_action: fm.next_action ? String(fm.next_action).slice(0, 500) : null, project: fm.project ? String(fm.project) : null, area: fm.area ? String(fm.area) : null, energy: numOrNull(fm.energy), source: fm.source ? String(fm.source) : null, modified: new Date(wobj.uploaded || nowMs).toISOString(), sig: wsig, triage_state: triage, raw_fm: JSON.stringify(fm) });
    if (triage) s.triaged++;
    if (fm.due && (fm.next_action || fm.title)) datedActions.push({ path: wkey, title: (fm.next_action ? String(fm.next_action) : title).slice(0, 180), date: String(fm.due).slice(0, 10), time: null });
    if (type === "daily" || /_personal-gtd/i.test(wkey)) extractDatedActions(text).forEach(function (act) { datedActions.push({ path: wkey, title: act.text, date: act.date, time: act.time }); });
    if (String(fm.publish).toLowerCase() === "true" || String(fm.source || "").toLowerCase() === "publish") publishFlags.push({ path: wkey, title: title });
  }

  var upStmts = upserts.map(function (u) {
    return env.AUDIT.prepare("INSERT INTO notes_intake (path,type,title,status,priority,due,next_action,project,area,energy,source,modified,ingested_at,sig,triage_state,raw_fm) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16) ON CONFLICT(path) DO UPDATE SET type=?2,title=?3,status=?4,priority=?5,due=?6,next_action=?7,project=?8,area=?9,energy=?10,source=?11,modified=?12,ingested_at=?13,sig=?14,triage_state=?15,raw_fm=?16").bind(u.path, u.type, u.title, u.status, u.priority, u.due, u.next_action, u.project, u.area, u.energy, u.source, u.modified, new Date().toISOString(), u.sig, u.triage_state, u.raw_fm);
  });
  var upChunks = chunk(upStmts, 50);
  for (var k = 0; k < upChunks.length; k++) {
    try { await env.AUDIT.batch(upChunks[k]); s.ingested += upChunks[k].length; }
    catch (e) { s.errors++; }
  }

  var cutoff = new Date(nowMs - FUTURE_WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
  var calStmts = [];
  for (var c = 0; c < datedActions.length && calStmts.length < MAX_EVENTS_PER_RUN; c++) {
    var act = datedActions[c];
    if (!act.date || act.date < cutoff) continue;
    var uid = "notes-intake-" + await digest16(act.path + "|" + act.date + "|" + (act.time || "")) + "@qnfo.cloud";
    var dtstart = act.time ? (act.date + "T" + act.time + ":00") : act.date;
    var allDay = act.time ? 0 : 1;
    calStmts.push(env.AUDIT.prepare("INSERT OR IGNORE INTO calendar (plane,uid,title,description,location,dtstart,dtend,all_day,url,source,domain,relevance,friction,status) VALUES ('personal',?1,?2,?3,NULL,?4,NULL,?5,NULL,'notes-intake','personal',NULL,NULL,'confirmed')").bind(uid, act.title, "From notes: " + act.path, dtstart, allDay));
  }
  var calChunks = chunk(calStmts, 50);
  for (var c2 = 0; c2 < calChunks.length; c2++) {
    try {
      var cres = await env.AUDIT.batch(calChunks[c2]);
      for (var ri = 0; ri < cres.length; ri++) { if (cres[ri].meta && cres[ri].meta.changes === 1) s.eventsCreated++; else s.eventsExisting++; }
    } catch (e) { s.errors++; }
  }

  for (var p = 0; p < publishFlags.length; p++) {
    try {
      await env.AUDIT.prepare("INSERT INTO notes_publish_queue (path,title,status,created,note) VALUES (?1,?2,'pending',?3,'flagged in frontmatter') ON CONFLICT(path) DO UPDATE SET title=?2").bind(publishFlags[p].path, publishFlags[p].title, new Date().toISOString()).run();
      s.publishQueued++;
    } catch (e) { s.errors++; }
  }

  try { s.indexRegenerated = await regenIndex(env); }
  catch (e) { s.errors++; s.notes.push("index-fail"); }

  try {
    await env.AUDIT.prepare("INSERT INTO notes_intake_runs (started,finished,scanned,changed,ingested,events_created,publish_queued,index_regenerated,errors,note) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)").bind(new Date(t0).toISOString(), new Date().toISOString(), s.scanned, s.changed, s.ingested, s.eventsCreated, s.publishQueued, s.indexRegenerated ? 1 : 0, s.errors, s.notes.join("|").slice(0, 300)).run();
  } catch (e) { }

  try {
    await env.VAULT.put("_meta/notes-intake.status.json", JSON.stringify({ ts: new Date().toISOString(), scanned: s.scanned, changed: s.changed, ingested: s.ingested, triaged: s.triaged, eventsCreated: s.eventsCreated, reconciled: s.reconciled, errors: s.errors }), { httpMetadata: { contentType: "application/json" } });
  } catch (e) { }

  s.elapsedMs = Date.now() - t0;
  return s;
}

async function regenIndex(env) {
  async function rows(sql) {
    try { var r = await env.AUDIT.prepare(sql).all(); return r.results || []; } catch (e) { return []; }
  }
  var proj = await rows("SELECT title,path,status FROM notes_intake WHERE type='project' AND status NOT IN ('done','archived') ORDER BY (priority IS NULL), priority LIMIT 50");
  var nas = await rows("SELECT title,next_action,due,path FROM notes_intake WHERE next_action IS NOT NULL AND status='active' ORDER BY (due IS NULL), due LIMIT 50");
  var waiting = await rows("SELECT title,path FROM notes_intake WHERE status='waiting' LIMIT 50");
  var areas = await rows("SELECT title,path FROM notes_intake WHERE type='area' AND status!='archived' LIMIT 50");
  var triage = await rows("SELECT path,title FROM notes_intake WHERE triage_state='needs_triage' LIMIT 50");
  var now = new Date().toISOString();
  var L = ["---", "type: log", 'title: "Master Index"', "status: active", 'created: "' + now + '"', 'modified: "' + now + '"', "tags: [index]", "---", "", "# Master Index", "", "> Auto-maintained by notes-intake (server-side). Source of truth = the individual notes.", ""];
  function wl(p) { return "[[" + p.replace(/\.md$/, "") + "|"; }
  function sec(h, arr, fmt) { L.push("## " + h); if (!arr.length) { L.push("_(none)_", ""); return; } for (var i = 0; i < arr.length; i++) L.push(fmt(arr[i])); L.push(""); }
  sec("Active projects", proj, function (r) { return "- " + wl(r.path) + r.title + "]] (" + r.status + ")"; });
  sec("Open next actions", nas, function (r) { return "- " + (r.due ? "[" + r.due + "] " : "") + r.next_action + "  -> " + wl(r.path) + "note]]"; });
  sec("Waiting on", waiting, function (r) { return "- " + wl(r.path) + r.title + "]]"; });
  sec("Active areas", areas, function (r) { return "- " + wl(r.path) + r.title + "]]"; });
  sec("Needs triage", triage, function (r) { return "- " + wl(r.path) + r.title + "]]"; });
  await env.VAULT.put("notes/v1/_index.md", L.join("\n") + "\n", { httpMetadata: { contentType: "text/markdown" } });
  return true;
}

async function handle(request, env, ctx) {
  try {
    var url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, worker: WORKER, version: VERSION });
    if (request.method === "OPTIONS") return new Response("ok", { status: 204 });
    if (url.pathname === "/run" && request.method === "POST") {
      var need = env.RUN_TOKEN;
      if (need && bearer(request) !== need) return json({ ok: false, error: "unauthorized" }, 401);
      ctx.waitUntil(run(env));
      return json({ ok: true, version: VERSION, queued: true });
    }
    if (url.pathname === "/drain" && request.method === "POST") {
      var need2 = env.RUN_TOKEN;
      if (need2 && bearer(request) !== need2) return json({ ok: false, error: "unauthorized" }, 401);
      var n = Math.min(4, Math.max(1, Number(url.searchParams.get("n") || 2)));
      var agg = { runs: 0, ingested: 0, reconciled: 0, eventsCreated: 0, errors: 0, lastChanged: null };
      for (var i = 0; i < n; i++) {
        var r = await run(env);
        agg.runs++; agg.ingested += r.ingested; agg.reconciled += r.reconciled; agg.eventsCreated += r.eventsCreated; agg.errors += r.errors; agg.lastChanged = r.changed;
        if (r.changed === 0) break;
      }
      return json({ ok: true, version: VERSION, result: agg });
    }
    if (url.pathname === "/stats" && request.method === "GET") {
      var t = await env.AUDIT.prepare("SELECT COUNT(*) c FROM notes_intake").first();
      var q = await env.AUDIT.prepare("SELECT COUNT(*) c FROM notes_publish_queue WHERE status='pending'").first();
      var tt = await env.AUDIT.prepare("SELECT COUNT(*) c FROM notes_intake WHERE triage_state='needs_triage'").first();
      var runs = await env.AUDIT.prepare("SELECT * FROM notes_intake_runs ORDER BY id DESC LIMIT 5").all();
      async function statusOf(k) { try { var o = await env.VAULT.get("_meta/" + k + ".status.json"); return o ? JSON.parse(await o.text()) : null; } catch (e) { return null; } }
      var peer = await statusOf("vault-indexer");
      var self = await statusOf("notes-intake");
      return json({ ok: true, version: VERSION, notes: t && t.c || 0, triage: tt && tt.c || 0, publish_pending: q && q.c || 0, recent_runs: runs.results || [], peer: peer, self: self });
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
