var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "0.7.0-host";
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


var PLANES = ["qnfo", "personal", "host"];
var ALLOWED_SOURCES = ["radar", "catalog", "manual", "personal-radar", "personal-profile", "personal-twin", "email", "host"];
// CAL-HOST-PLANE-1 (2026-10-04, issue 1954, charter pillar: personal; owner decision 2026-10-04: dates only). The host plane is
// open-house availability. Its feed carries all-day "Open for guests" events and nothing else: no address, no names, no
// contact details, no description or url, whatever a row holds. The feed is built from the dates alone (the scrub is at read
// time, so an edited or older row cannot leak), and POST also stores nothing but the dates. Guest records never live here.
var HOST_TITLE = "Open for guests";
function hostDay(v) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
  if (!m) return null;
  var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? m[0] : null;
}
__name(hostDay, "hostDay");
function hostNextDay(day) {
  var d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
__name(hostNextDay, "hostNextDay");
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
  // FEEDBACK-1 (2026-10-03, charter pillar: personal): what Rowan said about a suggested event, written by the /e/<id> page.
  await env.CAL_DB.prepare("CREATE TABLE IF NOT EXISTS calendar_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, cal_id INTEGER NOT NULL, uid TEXT, action TEXT NOT NULL, reason TEXT, met TEXT, note TEXT, title TEXT, location TEXT, domain TEXT, source TEXT, dtstart TEXT, relevance REAL, friction REAL, ts TEXT DEFAULT (datetime('now')), synced_to_ledger INTEGER DEFAULT 0)").run();
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
  L.push("X-WR-CALNAME:" + (plane === "qnfo" ? "QNFO Research Calendar" : plane === "host" ? "Open House Availability" : "Personal Calendar"));
  for (const e of rows) {
    if (plane === "host") {
      const d0 = hostDay(e.dtstart);
      if (!d0) continue;
      let d1 = hostDay(e.dtend);
      if (!d1 || d1 <= d0) d1 = hostNextDay(d0);
      L.push("BEGIN:VEVENT", "UID:" + uidFor("host", e.id), "DTSTAMP:" + fmtDate(e.created || (/* @__PURE__ */ new Date()).toISOString(), 0), "DTSTART;VALUE=DATE:" + d0.replace(/-/g, ""), "DTEND;VALUE=DATE:" + d1.replace(/-/g, ""), "SUMMARY:" + HOST_TITLE, "TRANSP:TRANSPARENT", "END:VEVENT");
      continue;
    }
    L.push("BEGIN:VEVENT");
    L.push("UID:" + (e.uid || uidFor(e.plane, e.id)));
    L.push("DTSTAMP:" + fmtDate(e.created || (/* @__PURE__ */ new Date()).toISOString(), 0));
    L.push("DTSTART" + (e.all_day ? ";VALUE=DATE:" : ":") + fmtDate(e.dtstart, e.all_day));
    if (e.dtend) L.push("DTEND" + (e.all_day ? ";VALUE=DATE:" : ":") + fmtDate(e.dtend, e.all_day));
    L.push("SUMMARY:" + escICal(e.title));
    if (e.location) L.push("LOCATION:" + escICal(e.location));
    let desc = e.description || "";
    let fbUrl = null;
    if (plane === "personal" && FB_SOURCES.indexOf(e.source) >= 0 && e.id != null) {
      fbUrl = await fbLink(env, e.id);
      if (fbUrl) desc = (desc ? desc + "\n\n" : "") + "Not for me / keep / I went: " + fbUrl;
    }
    if (desc) L.push("DESCRIPTION:" + escICal(desc));
    const evUrl = e.url || fbUrl;
    if (evUrl) L.push("URL:" + evUrl);
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
    // CAL-FEED-ROTATE-1 (2026-10-01): a feed is revoked by renaming its calendar_meta token row to ics_token_<plane>_prev.
    // getIcsToken then mints a new token, and this publish deletes the old object so the old URL stops serving at once.
    try {
      const prev = await env.CAL_DB.prepare("SELECT v FROM calendar_meta WHERE k=?").bind("ics_token_" + plane + "_prev").first();
      if (prev && prev.v && prev.v !== token) {
        await env.ICS_R2.delete("calendar/" + plane + "-" + prev.v + ".ics");
        await env.CAL_DB.prepare("DELETE FROM calendar_meta WHERE k=?").bind("ics_token_" + plane + "_prev").run();
      }
    } catch (eRot) {
    }
    out.push({ plane, key, url: R2_PUBLIC + "/" + key, bytes: ics.length });
  }
  return out;
}
__name(publishICS, "publishICS");
// ---- FEEDBACK-1 (2026-10-03, charter pillar: personal) ----
// Every suggested event in the personal feed links to /e/<id>?s=<sig>. The page shows the event and three choices
// (keep, I went, not for me). It runs on this worker, so it works from any calendar app with no session and no login:
// the link carries an HMAC of the event id made with CAL_TOKEN (nothing new to store or rotate). A GET only shows the
// page; a change needs a POST, so a link scanner that prefetches the URL cannot remove an event. "Not for me" sets
// status=cancelled (the radar dedupes on all statuses, so it is not re-suggested); keep and went set confirmed.
// Every answer is also stored in calendar_feedback for the radar to learn from.
var FB_SOURCES = ["personal-radar", "personal-twin"];
var FB_ACTIONS = ["keep", "nope", "went"];
var FB_REASONS = [["not-my-thing", "Not my kind of thing"], ["bad-timing", "Bad timing"], ["too-much-effort", "Too much effort"], ["not-my-crowd", "Not my crowd"]];
var PUBLIC_BASE = "https://calendar-api.q08.workers.dev";
function hexOf(buf, n) {
  return Array.from(new Uint8Array(buf).slice(0, n)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}
__name(hexOf, "hexOf");
async function fbSig(env, id) {
  if (!env.CAL_TOKEN) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("calendar-feedback|" + env.CAL_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hexOf(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("fb|" + id)), 12);
}
__name(fbSig, "fbSig");
async function fbLink(env, id) {
  const s = await fbSig(env, id);
  return s ? PUBLIC_BASE + "/e/" + id + "?s=" + s : null;
}
__name(fbLink, "fbLink");
function htmlEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(htmlEsc, "htmlEsc");
var FB_CSS = "body{font:18px/1.5 system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;color:#1c1c1c;background:#fafafa}h1{font-size:1.25rem}.meta{color:#555}button{font:inherit;padding:.7rem 1rem;margin:.3rem .3rem .3rem 0;border:1px solid #888;border-radius:.5rem;background:#fff;color:#1c1c1c;cursor:pointer}button.main{background:#1c1c1c;color:#fff}fieldset{border:0;border-top:1px solid #ccc;padding:.8rem 0;margin:0}label{display:block;margin:.2rem 0}input[type=text]{font:inherit;width:100%;padding:.5rem;box-sizing:border-box}@media(prefers-color-scheme:dark){body{background:#151515;color:#eee}.meta{color:#aaa}fieldset{border-color:#444}button{background:#222;color:#eee;border-color:#666}button.main{background:#eee;color:#111}}";
function fbPage(title, body, status) {
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>' + htmlEsc(title) + "</title><style>" + FB_CSS + "</style></head><body>" + body + "</body></html>";
  return new Response(html, { status: status || 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'" } });
}
__name(fbPage, "fbPage");
function fbEventHtml(row, sig, message) {
  const when = String(row.dtstart || "").replace("T", " ").slice(0, 16);
  let h = "<h1>" + htmlEsc(row.title) + '</h1><p class="meta">' + htmlEsc(when) + (row.location ? " &middot; " + htmlEsc(row.location) : "") + " &middot; now: " + htmlEsc(row.status) + "</p>";
  if (message) h += "<p><strong>" + htmlEsc(message) + "</strong></p>";
  h += '<form method="post" action="/e/' + row.id + "?s=" + sig + '">';
  h += '<fieldset><button class="main" name="a" value="keep">Interested, keep it</button></fieldset>';
  h += '<fieldset><legend>If you went (both fields optional)</legend><label>Who did you talk to?<input type="text" name="met" maxlength="80" autocomplete="off"></label><label>One line to remember<input type="text" name="note" maxlength="200" autocomplete="off"></label><button name="a" value="went">I went</button></fieldset>';
  h += "<fieldset><legend>Not for me. Why? (optional)</legend>";
  for (const r of FB_REASONS) h += '<label><input type="radio" name="why" value="' + r[0] + '"> ' + htmlEsc(r[1]) + "</label>";
  h += '<button name="a" value="nope">Not for me, remove it</button></fieldset></form>';
  return h;
}
__name(fbEventHtml, "fbEventHtml");
async function fbHandle(request, env, id, sig) {
  const want = await fbSig(env, id);
  if (!want || !tokenEq(String(sig || ""), want)) return fbPage("Link not valid", "<h1>This link is not valid</h1><p>Open the event from your calendar again.</p>", 403);
  const row = await env.CAL_DB.prepare("SELECT * FROM calendar WHERE id=? AND plane='personal'").bind(id).first();
  if (!row || FB_SOURCES.indexOf(row.source) < 0) return fbPage("Not found", "<h1>No such event</h1>", 404);
  if (request.method === "GET") return fbPage(row.title, fbEventHtml(row, want, null));
  if (request.method !== "POST") return fbPage("Method not allowed", "<h1>Use the buttons on the page</h1>", 405);
  let form;
  try { form = await request.formData(); } catch (e) { return fbPage("Bad request", "<h1>Could not read the form</h1>", 400); }
  const action = String(form.get("a") || "");
  if (FB_ACTIONS.indexOf(action) < 0) return fbPage("Bad request", "<h1>Unknown choice</h1>", 400);
  const why = String(form.get("why") || "");
  const reason = action === "nope" && FB_REASONS.some(function (r) { return r[0] === why; }) ? why : null;
  const met = action === "went" ? String(form.get("met") || "").trim().slice(0, 80) || null : null;
  const note = action === "went" ? String(form.get("note") || "").trim().slice(0, 200) || null : null;
  const newStatus = action === "nope" ? "cancelled" : "confirmed";
  await env.CAL_DB.batch([
    env.CAL_DB.prepare("UPDATE calendar SET status=?, updated=datetime('now') WHERE id=?").bind(newStatus, id),
    env.CAL_DB.prepare("INSERT INTO calendar_feedback (cal_id, uid, action, reason, met, note, title, location, domain, source, dtstart, relevance, friction) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, row.uid, action, reason, met, note, row.title, row.location, row.domain, row.source, row.dtstart, row.relevance, row.friction)
  ]);
  await publishICS(env).catch(function () { return null; });
  const say = { keep: "Kept. It stays on your calendar.", went: "Logged that you went." + (met ? " Noted: " + met + "." : ""), nope: "Removed from your calendar. Your answer is saved." };
  return fbPage(row.title, fbEventHtml(Object.assign({}, row, { status: newStatus }), want, say[action]));
}
__name(fbHandle, "fbHandle");
// ---- CONNECTION-PRODUCER-1 (2026-10-04, issue 1950, charter pillar: personal) ----
// The hourly tick queues the owner's questions in qnfo-audit.owner_questions; personal-companion mails them (max 2/day,
// quiet hours 22-08 Amsterdam). Two kinds only, both INSERT OR IGNORE on UNIQUE(kind, ref) so a rerun adds nothing:
//   after-event  ref=<calendar id>  a confirmed timed suggestion whose end passed 1-6h ago: "Did you go to X?" + signed link
//   triage       ref=<ISO week>     on Sundays (Amsterdam), up to 5 tentative personal-radar suggestions within 14 days
// Only FB_SOURCES rows qualify (their signed page refuses every other source); manual rows, trip- uids, all-day or
// date-only rows and places outside Amsterdam are skipped. No model call.
var OQ_DDL = "CREATE TABLE IF NOT EXISTS owner_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref TEXT, subject TEXT NOT NULL, body TEXT NOT NULL, priority INTEGER DEFAULT 5, not_before TEXT, created_at TEXT DEFAULT (datetime('now')), sent_at TEXT, attempts INTEGER DEFAULT 0, last_error TEXT, UNIQUE(kind, ref))";
var OQ_DEFAULT_LEN_MS = 2 * 36e5;
var OQ_OUTSIDE_RE = /\b(poland|polska|krak[oó]w|wroc[łl]aw|warsaw|warszawa|gda[nń]sk|germany|berlin|london|paris|brussels|belgium|rotterdam|utrecht|den haag|the hague|haarlem|leiden|eindhoven|groningen|italy|tuscany|castiglioncello|spain|france|uk)\b/i;
var AMS_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
function amsParts(ms) {
  var o = {};
  AMS_FMT.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
  return o;
}
__name(amsParts, "amsParts");
function amsOffsetMin(ms) {
  var p = amsParts(ms);
  var wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((wall - Math.floor(ms / 1e3) * 1e3) / 6e4);
}
__name(amsOffsetMin, "amsOffsetMin");
function amsDateStr(ms) {
  var p = amsParts(ms);
  return p.year + "-" + p.month + "-" + p.day;
}
__name(amsDateStr, "amsDateStr");
// ISO week label of the Amsterdam calendar date at ms, e.g. 2026-W40
function amsIsoWeek(ms) {
  var p = amsParts(ms);
  var d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  var y = d.getUTCFullYear();
  var jan4 = new Date(Date.UTC(y, 0, 4));
  var wk = 1 + Math.round(((d.getTime() - jan4.getTime()) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return y + "-W" + String(wk).padStart(2, "0");
}
__name(amsIsoWeek, "amsIsoWeek");
// A timed value: with an explicit offset it must be Amsterdam's offset at that instant (else the event is elsewhere);
// without one it is Amsterdam wall-clock time. Returns epoch ms, or null for date-only, unparsable or foreign-offset values.
function oqParseWhen(s) {
  s = String(s || "");
  var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?(?:\.\d+)?(Z|[+-]\d\d:?\d\d)?$/.exec(s);
  if (!m) return null;
  if (m[7] === "Z") return Date.parse(s);
  if (m[7]) {
    var ms = Date.parse(s);
    if (!Number.isFinite(ms)) return null;
    var sign = m[7].charAt(0) === "-" ? -1 : 1;
    var hh = +m[7].slice(1, 3), mm = +m[7].slice(-2);
    return sign * (hh * 60 + mm) === amsOffsetMin(ms) ? ms : null;
  }
  var wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  var guess = wall - amsOffsetMin(wall) * 6e4;
  return wall - amsOffsetMin(guess) * 6e4;
}
__name(oqParseWhen, "oqParseWhen");
function oqCleanTitle(t) {
  t = String(t || "").replace(/\s+/g, " ").trim();
  var i = t.toLowerCase().lastIndexOf("opslaan:");
  if (i >= 0) t = t.slice(i + 8).trim();
  t = t.replace(/^[^:]{1,40}:\s+/, "");
  return t.length > 80 ? t.slice(0, 79).trim() + "…" : t;
}
__name(oqCleanTitle, "oqCleanTitle");
function oqSqlTime(ms) {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}
__name(oqSqlTime, "oqSqlTime");
async function queueOwnerQuestions(env) {
  var out = { after_event: 0, triage: 0, skipped: null };
  await env.CAL_DB.prepare(OQ_DDL).run();
  var probe = await fbLink(env, 0);
  if (!probe) { out.skipped = "no CAL_TOKEN"; return out; }
  var now = Date.now();
  var srcIn = FB_SOURCES.map(function () { return "?"; }).join(",");
  // (a) after-event
  var rows = await runQuery(env, "SELECT id, uid, title, dtstart, dtend, all_day, location, source FROM calendar WHERE plane='personal' AND status='confirmed' AND all_day=0 AND source IN (" + srcIn + ") AND dtstart>=? AND dtstart<=?", FB_SOURCES.concat([new Date(now - 3 * 864e5).toISOString().slice(0, 10), new Date(now + 864e5).toISOString().slice(0, 10)]));
  for (var r of rows) {
    if (r.source === "manual" || String(r.uid || "").indexOf("trip-") === 0 || (r.uid || "").indexOf("-trip-") >= 0) continue;
    if (r.location && OQ_OUTSIDE_RE.test(r.location) && !/amsterdam/i.test(r.location)) continue;
    var st = oqParseWhen(r.dtstart);
    if (st == null) continue;
    var en = oqParseWhen(r.dtend);
    if (en == null || en <= st) en = st + OQ_DEFAULT_LEN_MS;
    if (en > now - 36e5 || en < now - 6 * 36e5) continue;
    var done = await env.CAL_DB.prepare("SELECT 1 x FROM calendar_feedback WHERE cal_id=? AND action IN ('went','nope') LIMIT 1").bind(r.id).first();
    if (done) continue;
    var link = await fbLink(env, r.id);
    var title = r.source === "personal-radar" ? oqCleanTitle(r.title) : String(r.title || "").replace(/\s+/g, " ").trim().slice(0, 100);
    var res = await env.CAL_DB.prepare("INSERT OR IGNORE INTO owner_questions (kind, ref, subject, body, priority, not_before) VALUES ('after-event', ?, ?, ?, 3, ?)")
      .bind(String(r.id), "Did you go to " + title + "?", title + "\n" + link + '\n\nTap "I went" and say who you talked to.', oqSqlTime(en + 36e5)).run();
    out.after_event += res && res.meta ? Number(res.meta.changes) || 0 : 0;
  }
  // (b) Sunday triage
  if (amsParts(now).weekday === "Sun") {
    var today = amsDateStr(now), horizon = amsDateStr(now + 14 * 864e5);
    var cand = await runQuery(env, "SELECT id, title, dtstart, location, relevance FROM calendar WHERE plane='personal' AND status='tentative' AND source='personal-radar' AND substr(dtstart,1,10)>=? AND substr(dtstart,1,10)<=?", [today, horizon]);
    cand.sort(function (a, b) { return (b.relevance == null ? -1 : b.relevance) - (a.relevance == null ? -1 : a.relevance) || String(a.dtstart).localeCompare(String(b.dtstart)); });
    cand = cand.slice(0, 5);
    if (cand.length) {
      var lines = ["These suggestions start in the next two weeks. Tap one to keep it, or remove it with a reason.", ""];
      for (var c of cand) lines.push("- " + oqCleanTitle(c.title) + " (" + String(c.dtstart).slice(0, 10) + (c.location ? ", " + c.location : "") + ")", "  " + await fbLink(env, c.id));
      var wk = amsIsoWeek(now);
      var t2 = await env.CAL_DB.prepare("INSERT OR IGNORE INTO owner_questions (kind, ref, subject, body, priority) VALUES ('triage', ?, ?, ?, 5)")
        .bind(wk, "This week: " + cand.length + " suggestion" + (cand.length === 1 ? "" : "s") + " to sort", lines.join("\n")).run();
      out.triage = t2 && t2.meta ? Number(t2.meta.changes) || 0 : 0;
    }
  }
  return out;
}
__name(queueOwnerQuestions, "queueOwnerQuestions");
var worker_default = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      if (env.VAULT) {
        try { await notesIntakeRun(env); } catch (e) { console.log("calendar-api notes intake error:", e && e.message || e); }
      } else console.log("calendar-api notes intake skipped: VAULT binding missing");
      await publishICS(env).catch((e) => console.log("calendar-api publish error:", e && e.message || e));
      try { await ensureSchema(env); console.log("calendar-api owner questions:", JSON.stringify(await queueOwnerQuestions(env))); } catch (e) { console.log("calendar-api queueOwnerQuestions error:", e && e.message || e); }
    })());
  },
  async fetch(request, env) {
    await ensureSchema(env);
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    const plane = url.searchParams.get("plane") || "qnfo";
    if (!PLANES.includes(plane)) return json({ error: "plane must be qnfo|personal|host" }, 400);
    if (path === "/health") {
      // PERSONAL-ICS-AUTH-1 (2026-10-01): the tokenised feed URLs are capability links, so /health
      // only returns them to a caller holding CAL_TOKEN.
      const urls = [];
      for (const p of authorized(request, env) ? PLANES : []) {
        const tok = await env.CAL_DB.prepare("SELECT v FROM calendar_meta WHERE k=?").bind("ics_token_" + p).first();
        urls.push({ plane: p, url: tok && tok.v ? R2_PUBLIC + "/calendar/" + p + "-" + tok.v + ".ics" : null });
      }
      return json({ ok: true, worker: WORKER, version: VERSION, capabilities: ["calendar-events", "ics-publish", "notes-intake", "event-feedback", "owner-questions", "host-plane"], limitations: ["reads and writes need the CAL_TOKEN bearer; the public /events.ics serves the qnfo plane only (personal needs CAL_TOKEN), and /health lists feed URLs only to a CAL_TOKEN caller", "ICS feeds are republished to R2 by the hourly :17 cron", "three planes: qnfo, personal and host; host (open-house availability) publishes dates only as all-day Open for guests, no address, names or contact details"], planes: PLANES, notes_intake: { vault: !!env.VAULT, folded_from: "notes-intake 0.1.5" }, ics_publish: { bucket: "qnfo-assets", base: R2_PUBLIC, urls } });
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
      // PERSONAL-ICS-AUTH-1: the personal plane needs CAL_TOKEN; subscribe to it via the tokenised R2 URL.
      if (plane !== "qnfo" && !authorized(request, env)) return json({ error: "unauthorized" }, 401);
      const fromIso = toIso(url.searchParams.get("from")) || new Date(Date.now() - 864e5).toISOString();
      const ics = await buildICS(env, plane, fromIso);
      return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8" } });
    }
    const mFb = path.match(new RegExp("^/e/([0-9]+)$"));
    if (mFb) return fbHandle(request, env, parseInt(mFb[1], 10), url.searchParams.get("s"));
    if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
    if (path === "/feedback" && method === "GET") {
      const lim = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10) || 200));
      const since = url.searchParams.get("since") || "1970-01-01";
      const rows = await runQuery(env, "SELECT * FROM calendar_feedback WHERE ts>=? ORDER BY id DESC LIMIT ?", [since, lim]);
      return json({ ok: true, count: rows.length, feedback: rows });
    }
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
      let b = await request.json().catch(() => null);
      if (plane === "host") {
        const d0 = hostDay(b && b.dtstart);
        if (!d0) return json({ error: "host plane needs dtstart as YYYY-MM-DD" }, 400);
        let d1 = hostDay(b.dtend);
        if (!d1 || d1 <= d0) d1 = hostNextDay(d0);
        b = { title: HOST_TITLE, dtstart: d0, dtend: d1, all_day: 1, source: "host", status: b.status === "cancelled" ? "cancelled" : "confirmed" };
      }
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