// calendar-api Worker - QNFO.OPS.010
// v0.2.1 (2026-09-02): fix v0.2.0 defect - CRLF was declared outside the worker source
//   (ReferenceError at buildICS); route regex rebuilt backslash-free via new RegExp.
// v0.2.0 (2026-09-02): QNFO.OPS.010 Stage C part 1 - R2 .ics publish.
//   - refactored the RFC5545 export into buildICS(env, plane, from); /events.ics unchanged.
//   - publishICS(env): writes BOTH planes to R2 qnfo-assets with UNGUESSABLE token paths
//     (calendar/<plane>-<token>.ics). Calendar subscription URLs are bearer credentials by
//     design (Google/Apple secret-calendar practice); the token is generated once and stored
//     in D1 qnfo-audit.calendar_meta so the URL is stable across publishes/restarts.
//   - scheduled (cron 17 * * * *): hourly republish; GET /publish: on-demand.
//   - public base: pub-7e5e6cd48f4b43ebb55a5ee25093cb71.r2.dev (r2.dev managed domain of
//     qnfo-assets; public access enabled 2026-09-02; ADR files migrated to qnfo-audit/adr/
//     so qnfo-assets holds public-ready assets only).
// v0.1.0 (2026-09-02): canonical cloud-native calendar store for BOTH planes.
// PURPOSE: single write-authoritative calendar (D1 qnfo-audit.calendar) that the QNFO and
//   Personal twin planes, events-radar, and personal-events-radar all read/write.
// REST CRUD: GET/POST/PUT/DELETE /events?plane=qnfo|personal&from=&to=
// RFC5545 export: GET /events.ics?plane=.. (subscribe URL for Outlook/Apple/Google)
// R2 publish: GET /publish | scheduled (hourly) -> calendar/<plane>-<token>.ics in qnfo-assets
// Health: GET /health
// DEPLOY: cd qnfo-workers/calendar && wrangler deploy  (CAL_DB D1 qnfo-audit, ICS_R2 qnfo-assets)
// CANONICAL SOURCE (remote): github.com/QNFO/qnfo-workers -> calendar/worker.js
const VERSION = "0.2.1";
const WORKER = "calendar-api";
const PLANES = ["qnfo", "personal"];
const ALLOWED_SOURCES = ["radar", "catalog", "manual", "personal-radar", "personal-profile"];
const R2_PUBLIC = "https://pub-7e5e6cd48f4b43ebb55a5ee25093cb71.r2.dev";
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const CRLF = CR + LF;
const BS = String.fromCharCode(92);

function toIso(dt) { return dt ? new Date(dt).toISOString() : null; }
function escICal(s) {
  return String(s == null ? "" : s)
    .split(BS).join(BS + BS)
    .split(";").join(BS + ";")
    .split(",").join(BS + ",")
    .replace(new RegExp("[" + CR + LF + "]+", "g"), BS + "n");
}
function fmtDate(iso, allDay) {
  if (!iso) return null;
  if (allDay) return iso.slice(0, 10).replace(/-/g, "");
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}
function uidFor(plane, id) { return plane + "-" + id + "@qnfo.cloud"; }
function cors() { return { "content-type": "application/json", "access-control-allow-origin": "*" }; }
function json(body, status) { return new Response(JSON.stringify(body), { status: status || 200, headers: cors() }); }

async function ensureSchema(env) {
  await env.CAL_DB.prepare(
    "CREATE TABLE IF NOT EXISTS calendar (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, plane TEXT NOT NULL, uid TEXT UNIQUE, " +
      "title TEXT NOT NULL, description TEXT, location TEXT, dtstart TEXT NOT NULL, dtend TEXT, all_day INTEGER DEFAULT 0, " +
      "url TEXT, source TEXT DEFAULT 'manual', domain TEXT, relevance REAL, friction REAL, status TEXT DEFAULT 'confirmed', " +
      "created TEXT DEFAULT (datetime('now')), updated TEXT DEFAULT (datetime('now')))"
  ).run();
  await env.CAL_DB.prepare("CREATE TABLE IF NOT EXISTS calendar_meta (k TEXT PRIMARY KEY, v TEXT)").run();
}

async function runQuery(env, sql, params) {
  const r = await env.CAL_DB.prepare(sql).bind(...(params || [])).all();
  return r.results || [];
}

async function getIcsToken(env, plane) {
  const row = await env.CAL_DB.prepare("SELECT v FROM calendar_meta WHERE k=?").bind("ics_token_" + plane).first();
  if (row && row.v) return row.v;
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  await env.CAL_DB.prepare("INSERT OR REPLACE INTO calendar_meta (k, v) VALUES (?, ?)").bind("ics_token_" + plane, token).run();
  return token;
}

async function buildICS(env, plane, fromIso) {
  const rows = await runQuery(env, "SELECT * FROM calendar WHERE plane=? AND status!='cancelled' AND dtstart>=? ORDER BY dtstart LIMIT 500", [plane, fromIso]);
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//QNFO//calendar-api//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  L.push("X-WR-CALNAME:" + (plane === "qnfo" ? "QNFO Research Calendar" : "Personal Calendar"));
  for (const e of rows) {
    L.push("BEGIN:VEVENT");
    L.push("UID:" + (e.uid || uidFor(e.plane, e.id)));
    L.push("DTSTAMP:" + fmtDate(e.created || new Date().toISOString(), 0));
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

async function publishICS(env) {
  const fromIso = new Date(Date.now() - 86400000).toISOString();
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

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(publishICS(env).catch((e) => console.log("calendar-api publish error:", e && e.message || e))); },
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
      return json({ ok: true, worker: WORKER, version: VERSION, planes: PLANES, ics_publish: { bucket: "qnfo-assets", base: R2_PUBLIC, urls } });
    }

    if (path === "/publish") {
      const out = await publishICS(env);
      return json({ ok: true, published: out });
    }

    if (path === "/events.ics") {
      const fromIso = toIso(url.searchParams.get("from")) || new Date(Date.now() - 86400000).toISOString();
      const ics = await buildICS(env, plane, fromIso);
      return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8" } });
    }

    if (path === "/events" && method === "GET") {
      const from = url.searchParams.get("from"); const to = url.searchParams.get("to");
      let sql = "SELECT * FROM calendar WHERE plane=?";
      const params = [plane];
      if (from) { sql += " AND dtstart>=?"; params.push(from); }
      if (to) { sql += " AND dtstart<=?"; params.push(to); }
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
      ).bind(plane, uid, b.title, b.description || null, b.location || null, b.dtstart, b.dtend || null, b.all_day ? 1 : 0, b.url || null, (ALLOWED_SOURCES.includes(b.source) ? b.source : "manual"), b.domain || null, b.relevance != null ? b.relevance : null, b.friction != null ? b.friction : null, b.status || "confirmed").run();
      return json({ ok: true, id: r.meta.last_row_id, uid, plane }, 201);
    }
    const m = path.match(new RegExp("^/events/([0-9]+)$"));
    if (m) {
      const id = parseInt(m[1], 10);
      if (method === "PUT") {
        const b = await request.json().catch(() => null);
        if (!b) return json({ error: "body required" }, 400);
        const sets = []; const params = [];
        for (const k of ["title", "description", "location", "dtstart", "dtend", "url", "source", "domain", "status"]) {
          if (b[k] !== undefined) { sets.push(k + "=?"); params.push(b[k]); }
        }
        if (b.all_day !== undefined) { sets.push("all_day=?"); params.push(b.all_day ? 1 : 0); }
        if (b.relevance !== undefined) { sets.push("relevance=?"); params.push(b.relevance); }
        if (b.friction !== undefined) { sets.push("friction=?"); params.push(b.friction); }
        sets.push("updated=datetime('now')");
        params.push(id);
        if (!sets.length) return json({ error: "no fields" }, 400);
        await env.CAL_DB.prepare("UPDATE calendar SET " + sets.join(",") + " WHERE id=?").bind(...params).run();
        return json({ ok: true, id });
      }
      if (method === "DELETE") {
        await env.CAL_DB.prepare("DELETE FROM calendar WHERE id=?").bind(id).run();
        return json({ ok: true, deleted: id });
      }
      if (method === "GET") {
        const rows = await runQuery(env, "SELECT * FROM calendar WHERE id=? AND plane=?", [id, plane]);
        return json({ ok: true, event: rows[0] || null });
      }
    }

    return json({ error: "not found: " + path + " (" + method + ")" }, 404);
  }
};
