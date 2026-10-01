var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "0.4.0-notes-intake";
// NOTES-INTAKE-FOLD-1 (2026-10-01, issue 1639): notes-intake (0.1.5, the server-side Obsidian vault pipeline) disappeared
// unrecorded around 2026-09-25 - last notes_intake_runs row 2026-09-25T10:30Z - and is folded in here instead of being
// recreated as a separate worker. Its EXECUTE leg already wrote this worker's `calendar` table, and both share the
// qnfo-audit database (CAL_DB here, AUDIT there). The pipeline below is notes-intake 0.1.5 verbatim except:
//   * env.AUDIT -> env.CAL_DB (same database), run -> notesIntakeRun, regenIndex -> notesRegenIndex;
//   * it runs on this worker's hourly cron BEFORE the .ics publish (was */15 in its own worker), so note-derived
//     events reach the published calendar in the same cycle; MAX_CHANGED 500 per run drains any backlog;
//   * calendar uids keep the "notes-intake-" prefix, source 'notes-intake' and the _meta/notes-intake.status.json
//     key, so rows written before the fold stay idempotent (INSERT OR IGNORE on uid) and readers keep working;
//   * HTTP: POST /notes/run and GET /notes/stats require CAL_TOKEN (fail closed). notes-intake allowed /run without a
//     token when RUN_TOKEN was unset and exposed /stats publicly; the vault is personal data.
var WORKER = "calendar-api";

// ---- notes intake (folded from notes-intake 0.1.5) ----
var MAX_LIST_PAGES = 30;
var MAX_CHANGED = 500;
var MAX_EVENTS_PER_RUN = 100;
var FUTURE_WINDOW_DAYS = 7;
var HEAD_BYTES = 32768;
var GET_CONCURRENCY = 16;
var SKIP_PREFIXES = [".obsidian/", "releases/", "Attachments/", "Archive/", ".git/"];
var INGEST_ROOTS = ["notes/", "Inbox/", "Projects/", "Areas/", "Resources/"];
var MD_RE = /\.(md|markdown|mdx)$/i;

function basename(k) { var p = k.split("/"); return p[p.length - 1] || k; }
function numOrNull(v) { if (v === undefined || v === null || v === "") return null; var n = Number(v); return Number.isFinite(n) ? n : null; }
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

async function notesIntakeRun(env) {
  var t0 = Date.now();
  var s = { scanned: 0, changed: 0, ingested: 0, triaged: 0, eventsCreated: 0, eventsExisting: 0, publishQueued: 0, reconciled: 0, indexRegenerated: false, errors: 0, notes: [] };

  var regMap = new Map();
  try {
    var r0 = await env.CAL_DB.prepare("SELECT path,sig FROM notes_intake").all();
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
        var ds = delChunks[d].map(function (p) { return env.CAL_DB.prepare("DELETE FROM notes_intake WHERE path=?1").bind(p); });
        await env.CAL_DB.batch(ds);
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
    return env.CAL_DB.prepare("INSERT INTO notes_intake (path,type,title,status,priority,due,next_action,project,area,energy,source,modified,ingested_at,sig,triage_state,raw_fm) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16) ON CONFLICT(path) DO UPDATE SET type=?2,title=?3,status=?4,priority=?5,due=?6,next_action=?7,project=?8,area=?9,energy=?10,source=?11,modified=?12,ingested_at=?13,sig=?14,triage_state=?15,raw_fm=?16").bind(u.path, u.type, u.title, u.status, u.priority, u.due, u.next_action, u.project, u.area, u.energy, u.source, u.modified, new Date().toISOString(), u.sig, u.triage_state, u.raw_fm);
  });
  var upChunks = chunk(upStmts, 50);
  for (var k = 0; k < upChunks.length; k++) {
    try { await env.CAL_DB.batch(upChunks[k]); s.ingested += upChunks[k].length; }
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
    calStmts.push(env.CAL_DB.prepare("INSERT OR IGNORE INTO calendar (plane,uid,title,description,location,dtstart,dtend,all_day,url,source,domain,relevance,friction,status) VALUES ('personal',?1,?2,?3,NULL,?4,NULL,?5,NULL,'notes-intake','personal',NULL,NULL,'confirmed')").bind(uid, act.title, "From notes: " + act.path, dtstart, allDay));
  }
  var calChunks = chunk(calStmts, 50);
  for (var c2 = 0; c2 < calChunks.length; c2++) {
    try {
      var cres = await env.CAL_DB.batch(calChunks[c2]);
      for (var ri = 0; ri < cres.length; ri++) { if (cres[ri].meta && cres[ri].meta.changes === 1) s.eventsCreated++; else s.eventsExisting++; }
    } catch (e) { s.errors++; }
  }

  for (var p = 0; p < publishFlags.length; p++) {
    try {
      await env.CAL_DB.prepare("INSERT INTO notes_publish_queue (path,title,status,created,note) VALUES (?1,?2,'pending',?3,'flagged in frontmatter') ON CONFLICT(path) DO UPDATE SET title=?2").bind(publishFlags[p].path, publishFlags[p].title, new Date().toISOString()).run();
      s.publishQueued++;
    } catch (e) { s.errors++; }
  }

  try { s.indexRegenerated = await notesRegenIndex(env); }
  catch (e) { s.errors++; s.notes.push("index-fail"); }

  try {
    await env.CAL_DB.prepare("INSERT INTO notes_intake_runs (started,finished,scanned,changed,ingested,events_created,publish_queued,index_regenerated,errors,note) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)").bind(new Date(t0).toISOString(), new Date().toISOString(), s.scanned, s.changed, s.ingested, s.eventsCreated, s.publishQueued, s.indexRegenerated ? 1 : 0, s.errors, s.notes.join("|").slice(0, 300)).run();
  } catch (e) { }

  try {
    await env.VAULT.put("_meta/notes-intake.status.json", JSON.stringify({ ts: new Date().toISOString(), scanned: s.scanned, changed: s.changed, ingested: s.ingested, triaged: s.triaged, eventsCreated: s.eventsCreated, reconciled: s.reconciled, errors: s.errors }), { httpMetadata: { contentType: "application/json" } });
  } catch (e) { }

  s.elapsedMs = Date.now() - t0;
  return s;
}

async function notesRegenIndex(env) {
  async function rows(sql) {
    try { var r = await env.CAL_DB.prepare(sql).all(); return r.results || []; } catch (e) { return []; }
  }
  var proj = await rows("SELECT title,path,status FROM notes_intake WHERE type='project' AND status NOT IN ('done','archived') ORDER BY (priority IS NULL), priority LIMIT 50");
  var nas = await rows("SELECT title,next_action,due,path FROM notes_intake WHERE next_action IS NOT NULL AND status='active' ORDER BY (due IS NULL), due LIMIT 50");
  var waiting = await rows("SELECT title,path FROM notes_intake WHERE status='waiting' LIMIT 50");
  var areas = await rows("SELECT title,path FROM notes_intake WHERE type='area' AND status!='archived' LIMIT 50");
  var triage = await rows("SELECT path,title FROM notes_intake WHERE triage_state='needs_triage' LIMIT 50");
  var now = new Date().toISOString();
  var L = ["---", "type: log", 'title: "Master Index"', "status: active", 'created: "' + now + '"', 'modified: "' + now + '"', "tags: [index]", "---", "", "# Master Index", "", "> Auto-maintained by calendar-api notes intake (folded from notes-intake 0.1.5; server-side). Source of truth = the individual notes.", ""];
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


var PLANES = ["qnfo", "personal"];
var ALLOWED_SOURCES = ["radar", "catalog", "manual", "personal-radar", "personal-profile", "personal-twin", "email"];
var R2_PUBLIC = "https://pub-7e5e6cd48f4b43ebb55a5ee25093cb71.r2.dev";
var CR = String.fromCharCode(13);
var LF = String.fromCharCode(10);
var CRLF = CR + LF;
var BS = String.fromCharCode(92);
function toIso(dt) {
  return dt ? new Date(dt).toISOString() : null;
}
__name(toIso, "toIso");
function escICal(s) {
  return String(s == null ? "" : s).split(BS).join(BS + BS).split(";").join(BS + ";").split(",").join(BS + ",").replace(new RegExp("[" + CR + LF + "]+", "g"), BS + "n");
}
__name(escICal, "escICal");
function fmtDate(iso, allDay) {
  if (!iso) return null;
  if (allDay) return iso.slice(0, 10).replace(/-/g, "");
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}
__name(fmtDate, "fmtDate");
function uidFor(plane, id) {
  return plane + "-" + id + "@qnfo.cloud";
}
__name(uidFor, "uidFor");
function cors() {
  return { "content-type": "application/json", "access-control-allow-origin": "*" };
}
__name(cors, "cors");
function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: cors() });
}
__name(json, "json");
function bearerToken(request) {
  return String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}
__name(bearerToken, "bearerToken");
function tokenEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
__name(tokenEq, "tokenEq");
function authorized(request, env) {
  const exp = env.CAL_TOKEN;
  if (!exp) return false;
  return tokenEq(bearerToken(request), exp);
}
__name(authorized, "authorized");
async function ensureSchema(env) {
  await env.CAL_DB.prepare(
    "CREATE TABLE IF NOT EXISTS calendar (id INTEGER PRIMARY KEY AUTOINCREMENT, plane TEXT NOT NULL, uid TEXT UNIQUE, title TEXT NOT NULL, description TEXT, location TEXT, dtstart TEXT NOT NULL, dtend TEXT, all_day INTEGER DEFAULT 0, url TEXT, source TEXT DEFAULT 'manual', domain TEXT, relevance REAL, friction REAL, status TEXT DEFAULT 'confirmed', created TEXT DEFAULT (datetime('now')), updated TEXT DEFAULT (datetime('now')))"
  ).run();
  await env.CAL_DB.prepare("CREATE TABLE IF NOT EXISTS calendar_meta (k TEXT PRIMARY KEY, v TEXT)").run();
}
__name(ensureSchema, "ensureSchema");
async function runQuery(env, sql, params) {
  const r = await env.CAL_DB.prepare(sql).bind(...params || []).all();
  return r.results || [];
}
__name(runQuery, "runQuery");
async function getIcsToken(env, plane) {
  const row = await env.CAL_DB.prepare("SELECT v FROM calendar_meta WHERE k=?").bind("ics_token_" + plane).first();
  if (row && row.v) return row.v;
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  await env.CAL_DB.prepare("INSERT OR REPLACE INTO calendar_meta (k, v) VALUES (?, ?)").bind("ics_token_" + plane, token).run();
  return token;
}
__name(getIcsToken, "getIcsToken");
async function buildICS(env, plane, fromIso) {
  const rows = await runQuery(env, "SELECT * FROM calendar WHERE plane=? AND status!='cancelled' AND dtstart>=? ORDER BY dtstart LIMIT 500", [plane, fromIso]);
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//QNFO//calendar-api//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  L.push("X-WR-CALNAME:" + (plane === "qnfo" ? "QNFO Research Calendar" : "Personal Calendar"));
  for (const e of rows) {
    L.push("BEGIN:VEVENT");
    L.push("UID:" + (e.uid || uidFor(e.plane, e.id)));
    L.push("DTSTAMP:" + fmtDate(e.created || (/* @__PURE__ */ new Date()).toISOString(), 0));
    L.push("DTSTART" + (e.all_day ? ";VALUE=DATE:" : ":") + fmtDate(e.dtstart, e.all_day));
    if (e.dtend) L.push("DTEND" + (e.all_day ? ";VALUE=DATE:" : ":") + fmtDate(e.dtend, e.all_day));
    L.push("SUMMARY:" + escICal(e.title));
    if (e.location) L.push("LOCATION:" + escICal(e.location));
    if (e.description) L.push("DESCRIPTION:" + escICal(e.description));
    if (e.url) L.push("URL:" + e.url);
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.join(CRLF);
}
__name(buildICS, "buildICS");
async function publishICS(env) {
  const fromIso = new Date(Date.now() - 864e5).toISOString();
  const out = [];
  for (const plane of PLANES) {
    const token = await getIcsToken(env, plane);
    const ics = await buildICS(env, plane, fromIso);
    const key = "calendar/" + plane + "-" + token + ".ics";
    await env.ICS_R2.put(key, ics, { httpMetadata: { contentType: "text/calendar; charset=utf-8" } });
    out.push({ plane, key, url: R2_PUBLIC + "/" + key, bytes: ics.length });
  }
  return out;
}
__name(publishICS, "publishICS");
var worker_default = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      if (env.VAULT) {
        try { await notesIntakeRun(env); } catch (e) { console.log("calendar-api notes intake error:", e && e.message || e); }
      } else console.log("calendar-api notes intake skipped: VAULT binding missing");
      await publishICS(env).catch((e) => console.log("calendar-api publish error:", e && e.message || e));
    })());
  },
  async fetch(request, env) {
    await ensureSchema(env);
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    const plane = url.searchParams.get("plane") || "qnfo";
    if (!PLANES.includes(plane)) return json({ error: "plane must be qnfo|personal" }, 400);
    if (path === "/health") {
      const urls = [];
      for (const p of PLANES) {
        const tok = await env.CAL_DB.prepare("SELECT v FROM calendar_meta WHERE k=?").bind("ics_token_" + p).first();
        urls.push({ plane: p, url: tok && tok.v ? R2_PUBLIC + "/calendar/" + p + "-" + tok.v + ".ics" : null });
      }
      return json({ ok: true, worker: WORKER, version: VERSION, planes: PLANES, notes_intake: { vault: !!env.VAULT, folded_from: "notes-intake 0.1.5" }, ics_publish: { bucket: "qnfo-assets", base: R2_PUBLIC, urls } });
    }
    if (path === "/publish") {
      if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
      const out = await publishICS(env);
      return json({ ok: true, published: out });
    }
    if (path === "/notes/run" && method === "POST") {
      if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
      if (!env.VAULT) return json({ error: "VAULT binding missing" }, 503);
      const r = await notesIntakeRun(env);
      return json({ ok: true, version: VERSION, result: r });
    }
    if (path === "/notes/stats" && method === "GET") {
      if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
      const t = await env.CAL_DB.prepare("SELECT COUNT(*) c FROM notes_intake").first();
      const tt = await env.CAL_DB.prepare("SELECT COUNT(*) c FROM notes_intake WHERE triage_state='needs_triage'").first();
      const q = await env.CAL_DB.prepare("SELECT COUNT(*) c FROM notes_publish_queue WHERE status='pending'").first();
      const runs = await env.CAL_DB.prepare("SELECT * FROM notes_intake_runs ORDER BY id DESC LIMIT 5").all();
      return json({ ok: true, version: VERSION, vault: !!env.VAULT, notes: t && t.c || 0, triage: tt && tt.c || 0, publish_pending: q && q.c || 0, recent_runs: runs.results || [] });
    }
    if (path === "/events.ics") {
      const fromIso = toIso(url.searchParams.get("from")) || new Date(Date.now() - 864e5).toISOString();
      const ics = await buildICS(env, plane, fromIso);
      return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8" } });
    }
    if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
    if (path === "/events" && method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      let sql = "SELECT * FROM calendar WHERE plane=?";
      const params = [plane];
      if (from) {
        sql += " AND dtstart>=?";
        params.push(from);
      }
      if (to) {
        sql += " AND dtstart<=?";
        params.push(to);
      }
      sql += " ORDER BY dtstart LIMIT 500";
      const rows = await runQuery(env, sql, params);
      return json({ ok: true, plane, count: rows.length, events: rows });
    }
    if (path === "/events" && method === "POST") {
      const b = await request.json().catch(() => null);
      if (!b || !b.title || !b.dtstart) return json({ error: "title and dtstart required" }, 400);
      const uid = uidFor(plane, "t" + Date.now().toString(36));
      const r = await env.CAL_DB.prepare(
        "INSERT INTO calendar (plane, uid, title, description, location, dtstart, dtend, all_day, url, source, domain, relevance, friction, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(plane, uid, b.title, b.description || null, b.location || null, b.dtstart, b.dtend || null, b.all_day ? 1 : 0, b.url || null, ALLOWED_SOURCES.includes(b.source) ? b.source : "manual", b.domain || null, b.relevance != null ? b.relevance : null, b.friction != null ? b.friction : null, b.status || "confirmed").run();
      const published = await publishICS(env).catch((e) => ({ error: e && e.message || String(e) }));
      return json({ ok: true, id: r.meta.last_row_id, uid, plane, published }, 201);
    }
    const m = path.match(new RegExp("^/events/([0-9]+)$"));
    if (m) {
      const id = parseInt(m[1], 10);
      if (method === "PUT") {
        const b = await request.json().catch(() => null);
        if (!b) return json({ error: "body required" }, 400);
        const sets = [];
        const params = [];
        for (const k of ["title", "description", "location", "dtstart", "dtend", "url", "source", "domain", "status"]) {
          if (b[k] !== void 0) {
            sets.push(k + "=?");
            params.push(b[k]);
          }
        }
        if (b.all_day !== void 0) {
          sets.push("all_day=?");
          params.push(b.all_day ? 1 : 0);
        }
        if (b.relevance !== void 0) {
          sets.push("relevance=?");
          params.push(b.relevance);
        }
        if (b.friction !== void 0) {
          sets.push("friction=?");
          params.push(b.friction);
        }
        sets.push("updated=datetime('now')");
        params.push(id);
        if (!sets.length) return json({ error: "no fields" }, 400);
        await env.CAL_DB.prepare("UPDATE calendar SET " + sets.join(",") + " WHERE id=?").bind(...params).run();
        const published = await publishICS(env).catch((e) => ({ error: e && e.message || String(e) }));
        return json({ ok: true, id, published });
      }
      if (method === "DELETE") {
        await env.CAL_DB.prepare("DELETE FROM calendar WHERE id=?").bind(id).run();
        const published = await publishICS(env).catch((e) => ({ error: e && e.message || String(e) }));
        return json({ ok: true, deleted: id, published });
      }
      if (method === "GET") {
        const rows = await runQuery(env, "SELECT * FROM calendar WHERE id=? AND plane=?", [id, plane]);
        return json({ ok: true, event: rows[0] || null });
      }
    }
    return json({ error: "not found: " + path + " (" + method + ")" }, 404);
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map