// qnfo-deploy-guard v1.3.3 - deploy lock + concurrent-mutation detector + cost watchdog + heartbeat (expected_version enforcement + per-session attribution)
// Worker Contract v1: VERSION constant + GET /health
// Data: https://ops.qnfo.org/fleet (modified_on per worker) + https://ops.qnfo.org/cost (spend)
// NOTE: source of truth is this file; GET /workers/scripts/<name> TRUNCATES large bodies - never patch from a GET.
var VERSION = "1.3.4";
var WORKER = "qnfo-deploy-guard";
var LOCK_PREFIX = "deploylock:";
var DENY_PREFIX = "deploydeny:";
var SNAP_KEY = "deploywatch:snapshot";
var REPORT_KEY = "deploywatch:report";
var THR_KEY = "guard:cost_thresholds";
var DEFAULT_TTL = 900; var MAX_TTL = 7200;
var FLEET_URLS = ["https://ops.qnfo.org/fleet", "https://qnfo-ops.q08.workers.dev/fleet"];
var COST_URLS = ["https://ops.qnfo.org/cost", "https://qnfo-ops.q08.workers.dev/cost"];
function json(o, s) { return new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } }); }
function nowIso() { return new Date().toISOString(); }
function tok() { return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10); }
function ms(s) { if (!s) return 0; var v = new Date(String(s).replace(" ", "T") + (String(s).indexOf("Z") >= 0 ? "" : "Z")).getTime(); return isNaN(v) ? 0 : v; }
function getJson(urls, tout) {
  return (async function () {
    for (var i = 0; i < urls.length; i++) {
      try {
        var c = new AbortController(); var t = setTimeout(function () { c.abort(); }, tout || 15000);
        var r = await fetch(urls[i], { signal: c.signal, headers: { accept: "application/json" } });
        clearTimeout(t);
        if (r.ok) { var j = await r.json(); if (j) return { ok: true, j: j, url: urls[i] }; }
      } catch (e) {}
    }
    return { ok: false, j: null, url: null };
  })();
}
// DECISION (2026-09-21): the lock is backed by D1 deploy_locks (STRONGLY consistent). It was on KV,
// whose reads are eventually consistent: a release followed by an immediate acquire could still observe
// the stale lock and refuse (live-reproduced: acquire -> release(released:true) -> acquire REFUSED).
async function sha256hex(s) { var b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))); var a = new Uint8Array(b), o = ""; for (var i = 0; i < a.length; i++) o += ("0" + a[i].toString(16)).slice(-2); return o; }
async function readLock(env, w) { var rows = await auditAll(env, "SELECT worker, owner, since, expires_at, expected_version FROM deploy_locks WHERE worker=?1 AND expires_at > ?2 LIMIT 1", [w, Date.now()]); return (rows && rows.length) ? rows[0] : null; }
async function auditRun(env, sql, params) { try { var st = env.AUDIT.prepare(sql); return await st.bind.apply(st, params || []).run(); } catch (e) { return { ok: false, error: String(e && e.message || e) }; } }
async function auditAll(env, sql, params) { try { var st = env.AUDIT.prepare(sql); var b = params && params.length ? st.bind.apply(st, params) : st; var r = await b.all(); return (r && r.results) || []; } catch (e) { return []; } }
async function fileIssue(env, title, desc, priority) {
  var ex = await auditAll(env, "SELECT id FROM agent_issues WHERE status=?1 AND title=?2 LIMIT 1", ["open", title]);
  if (ex && ex.length) return { filed: false, existing: ex[0].id };
  var now = Date.now();
  var res = await auditRun(env, "INSERT INTO agent_issues (title, description, source, category, priority, status, linked_session, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)", [title, String(desc).slice(0, 900), "qnfo-deploy-guard", "reliability", priority || "high", "open", "qnfo-deploy-guard/" + VERSION, now, now]);
  return { filed: true, ok: res && res.ok !== false, error: res && res.error };
}
async function fileAlert(env, level, message) { await auditRun(env, "INSERT INTO alerts (source, level, message, digested, created_at) VALUES (?1,?2,?3,0,?4)", ["qnfo-deploy-guard", level, String(message).slice(0, 500), nowIso()]); }
// REGISTRY-UNREGISTERED-WORKER-2 (2026-09-21): register-at-deploy. Any live worker absent from
// service_registry (the census authority) gets a stub row immediately, cutting the drift window
// from qnfo-register-guard's 24h to <=10min. The daily register-guard still does the full reconcile.
async function ensureRegistry(env, fleet) {
  var added = [];
  try {
    var have = await auditAll(env, "SELECT service FROM service_registry", []);
    var set = {}; for (var i = 0; i < have.length; i++) set[have[i].service] = 1;
    for (var j = 0; j < (fleet || []).length; j++) {
      var w = String((fleet[j] && fleet[j].name) || ""); if (!w || set[w]) continue;
      await auditRun(env, "INSERT OR IGNORE INTO service_registry (service, kind, version, base_url, purpose, capabilities, routes, tools, models, deps, updated_at, state) VALUES (?1,'worker',NULL,?2,'AUTO-REGISTERED by deploy-guard: live worker absent from the registry (register-at-deploy); purpose/bindings pending full reconcile','[]','["/health"]','','','[]',?3,'live')", [w, "https://" + w + ".q08.workers.dev", nowIso()]);
      set[w] = 1; added.push(w);
    }
  } catch (e) {}
  return added;
}
async function scan(env) {
  var t0 = Date.now();
  var fp = await getJson(FLEET_URLS, 15000);
  var ca = await getJson(COST_URLS, 10000);
  var cost = null;
  if (ca.ok && ca.j) {
    var thr = { day_usd: 10, month_usd: 150 };
    try { var tv = await env.FLEET_CONFIG.get(THR_KEY); if (tv) thr = JSON.parse(tv); } catch (e) {}
    var day = (ca.j.utc_day && ca.j.utc_day.cost) || 0;
    var month = (ca.j.last_30d && ca.j.last_30d.cost) || 0;
    cost = { day_usd: day, month_usd: month, cap_per_utc_day: ca.j.cap_per_utc_day, thresholds: thr };
  }
  var ledger = await auditAll(env, "SELECT worker, to_sha, ts FROM fleet_deploys ORDER BY id", []);
  var lastLedger = {}; for (var i = 0; i < ledger.length; i++) { lastLedger[ledger[i].worker] = ledger[i]; }
  var prev = {}; try { var pv = await env.FLEET_CONFIG.get(SNAP_KEY); if (pv) prev = JSON.parse(pv) || {}; } catch (e) {}
  var active = {};
  try { var al = await auditAll(env, "SELECT worker, owner, since, expires_at FROM deploy_locks WHERE expires_at > ?1", [Date.now()]); for (var j = 0; j < al.length; j++) active[al[j].worker] = al[j]; } catch (e) {}
  var denials = [];
  try { var dn = await env.FLEET_CONFIG.list({ prefix: DENY_PREFIX }); for (var d = 0; d < dn.keys.length; d++) { var dv = await env.FLEET_CONFIG.get(dn.keys[d].name); if (dv) { try { denials.push(JSON.parse(dv)); } catch (e) {} } } } catch (e) {}
  var fleet = (fp.ok && fp.j && fp.j.fleet) ? fp.j.fleet : [];
  var regAdded = [];
  try { regAdded = await ensureRegistry(env, fleet); } catch (e) {}
  var snapshot = {}; var changed = []; var anomalies = [];
  for (var k = 0; k < fleet.length; k++) {
    var ww = fleet[k]; var mo = ww.modified_on || null;
    snapshot[ww.name] = { mo: mo, at: nowIso() };
    var was = prev[ww.name];
    if (was && was.mo && mo && String(was.mo) !== String(mo)) {
      var lg = lastLedger[ww.name] || null;
      var logged = !!(lg && lg.ok !== 0 && ms(lg.ts) >= ms(mo) - 180000);
      var rec = { type: logged ? "deploy-observed" : "unlogged-mutation", worker: ww.name, from_mod: was.mo, to_mod: mo, ledger_to: lg ? lg.to_sha : null, ledger_ts: lg ? lg.ts : null, lock_owner: active[ww.name] ? active[ww.name].owner : null, lock_held: !!active[ww.name] };
      changed.push(rec);
      if (!logged) anomalies.push(rec);
      if (!logged && !active[ww.name]) anomalies.push({ type: "uncoordinated-deploy", worker: ww.name, to_mod: mo });
    }
  }
  if (denials.length) anomalies.push({ type: "lock-contention", worker: "fleet", count: denials.length, sample: denials.slice(-3) });
  if (cost && (cost.day_usd > cost.thresholds.day_usd || cost.month_usd > cost.thresholds.month_usd)) anomalies.push({ type: "cost-threshold", worker: "qnfo-ops", day_usd: cost.day_usd, month_usd: cost.month_usd, thresholds: cost.thresholds });
  var seen = {}; var uniq = []; for (var m = 0; m < anomalies.length; m++) { var key = anomalies[m].type + "|" + anomalies[m].worker; if (!seen[key]) { seen[key] = 1; uniq.push(anomalies[m]); } }
  var filed = [];
  for (var n = 0; n < uniq.length; n++) {
    var a = uniq[n]; var title;
    if (a.type === "cost-threshold") title = "COST-THRESHOLD-BREACH: qnfo-ops";
    else title = "DEPLOY-" + String(a.type).toUpperCase() + ": " + (a.worker || "fleet");
    var pr = (a.type === "unlogged-mutation" || a.type === "uncoordinated-deploy" || a.type === "cost-threshold") ? "high" : "medium";
    var res = await fileIssue(env, title, JSON.stringify(a), pr);
    if (res.filed) filed.push({ title: title, ok: res.ok });
  }
  if (filed.length) await fileAlert(env, "warn", "deploy-guard filed " + filed.length + " ticket(s): " + filed.map(function (f) { return f.title; }).join("; "));
  var ok = fp.ok ? 1 : 0;
  try { await auditRun(env, "INSERT INTO fleet_heartbeat (worker,version,ts,ok) VALUES (?1,?2,?3,?4) ON CONFLICT(worker) DO UPDATE SET version=excluded.version, ts=excluded.ts, ok=excluded.ok", [WORKER, VERSION, nowIso(), ok]); } catch (e) {}
  var report = { ts: nowIso(), version: VERSION, fleet_probe_ok: fp.ok, fleet_url: fp.url, workers_seen: fleet.length, changed_since_last: changed.length, anomalies: uniq, filed: filed, active_locks: Object.keys(active), recent_denials: denials.length, registry_added: regAdded, cost: cost, baseline: Object.keys(prev).length === 0, elapsed_ms: Date.now() - t0 };
  try { await env.FLEET_CONFIG.put(SNAP_KEY, JSON.stringify(snapshot), { expirationTtl: 604800 }); } catch (e) {}
  try { await env.FLEET_CONFIG.put(REPORT_KEY, JSON.stringify(report), { expirationTtl: 604800 }); } catch (e) {}
  if (fp.ok) { try { var dn2 = await env.FLEET_CONFIG.list({ prefix: DENY_PREFIX }); for (var z = 0; z < dn2.keys.length; z++) { await env.FLEET_CONFIG.delete(dn2.keys[z].name); } } catch (e) {} }
  return report;
}
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(scan(env).catch(function () {})); },
  async fetch(request, env, ctx) {
    var url = new URL(request.url); var p = url.pathname;
    if (p === "/health") return json({ ok: true, worker: WORKER, version: VERSION, ts: nowIso() });
    if (p === "/report" && request.method === "GET") { var rp = await env.FLEET_CONFIG.get(REPORT_KEY); return json(rp ? JSON.parse(rp) : { ts: null }); }
    if (p === "/locks" && request.method === "GET") { var lr = await auditAll(env, "SELECT worker, owner, since, expires_at, expected_version FROM deploy_locks WHERE expires_at > ?1", [Date.now()]); return json({ locks: lr, now: nowIso() }); }
    if (p.indexOf("/lock/") === 0 && request.method === "GET") { var w3 = decodeURIComponent(p.slice(6)); return json({ worker: w3, lock: await readLock(env, w3), now: nowIso() }); }
    if (p === "/lock/acquire" && request.method === "POST") {
      var b = await request.json().catch(function () { return {}; }); var w4 = String(b.worker || "");
      if (!w4) return json({ error: "worker required" }, 400);
      var ttl = Math.min(Math.max(Number(b.ttl_sec || DEFAULT_TTL), 60), MAX_TTL);
      var now4 = Date.now();
      // expected_version optimistic-concurrency check (registry-as-truth): reject a deploy that
      // assumes a stale current version. Enforced only when the worker is registered.
      if (b.expected_version) {
        var reg = await auditAll(env, "SELECT version FROM service_registry WHERE service=?1 LIMIT 1", [w4]);
        var curVer = reg && reg.length ? reg[0].version : null;
        if (curVer && String(curVer) !== String(b.expected_version)) {
          return json({ acquired: false, reason: "version-mismatch", worker: w4, expected_version: String(b.expected_version), current_version: curVer }, 409);
        }
      }
      var actor4 = String(b.actor || b.owner || "unknown");
      var sid4 = b.session_id ? String(b.session_id) : null;
      await auditRun(env, "DELETE FROM deploy_locks WHERE expires_at <= ?1", [now4]);
      var raw4 = tok(); var th4 = await sha256hex(raw4);
      var ins4 = await auditRun(env, "INSERT INTO deploy_locks (worker, token_hash, owner, actor, session_id, since, expires_at, expected_version) SELECT ?1,?2,?3,?4,?5,?6,?7,?8 WHERE NOT EXISTS (SELECT 1 FROM deploy_locks WHERE worker=?1 AND expires_at > ?6)", [w4, th4, String(b.owner || "unknown"), actor4, sid4, now4, now4 + ttl * 1000, b.expected_version || null]);
      if (ins4 && ins4.ok === false) return json({ error: "lock_db_unavailable", detail: ins4.error }, 500);
      var ch4 = (ins4 && ins4.meta && typeof ins4.meta.changes === "number") ? ins4.meta.changes : (ins4 && typeof ins4.changes === "number" ? ins4.changes : 0);
      if (!ch4) {
        var cur = await readLock(env, w4);
        try { await env.FLEET_CONFIG.put(DENY_PREFIX + Date.now() + "-" + tok(), JSON.stringify({ worker: w4, owner: String(b.owner || "unknown"), held_by: cur ? cur.owner : null, at: nowIso() }), { expirationTtl: 3600 }); } catch (e) {}
        return json({ acquired: false, held_by: cur ? cur.owner : "unknown", held_since: cur ? cur.since : null, expires_at: cur ? new Date(cur.expires_at).toISOString() : null }, 409);
      }
      return json({ acquired: true, token: raw4, expires_at: new Date(now4 + ttl * 1000).toISOString() });
    }
    if (p === "/lock/release" && request.method === "POST") {
      var b5 = await request.json().catch(function () { return {}; }); var w5 = String(b5.worker || ""); var tk = String(b5.token || "");
      if (!w5 || !tk) return json({ error: "worker and token required" }, 400);
      var th5 = await sha256hex(tk);
      var del5 = await auditRun(env, "DELETE FROM deploy_locks WHERE worker=?1 AND token_hash=?2", [w5, th5]);
      if (del5 && del5.ok === false) return json({ released: false, reason: "lock_db_unavailable" }, 500);
      var cd5 = (del5 && del5.meta && typeof del5.meta.changes === "number") ? del5.meta.changes : (del5 && typeof del5.changes === "number" ? del5.changes : 0);
      if (!cd5) return json({ released: false, reason: "token mismatch or no lock" }, 409);
      return json({ released: true });
    }
    if (p === "/ledger" && request.method === "POST") {
      var bl = await request.json().catch(function () { return {}; }); if (!bl.worker) return json({ error: "worker required" }, 400);
      var rl = await auditRun(env, "INSERT INTO fleet_deploys (worker, actor, session_id, from_sha, to_sha, source_path, ok, note, ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)", [String(bl.worker), String(bl.actor || "unknown"), bl.session_id ? String(bl.session_id) : null, bl.from || null, bl.to || null, bl.source_path || null, bl.ok === false ? 0 : 1, String(bl.note || "").slice(0, 400), nowIso()]);
      try { await ensureRegistry(env, [{ name: String(bl.worker) }]); } catch (e) {}
      return json({ logged: true, ok: rl && rl.ok !== false, error: rl && rl.error });
    }
    if (p === "/thresholds" && request.method === "POST") { var bt = await request.json().catch(function () { return {}; }); await env.FLEET_CONFIG.put(THR_KEY, JSON.stringify({ day_usd: Number(bt.day_usd || 10), month_usd: Number(bt.month_usd || 150) })); return json({ set: true }); }
    if (p === "/scan" && (request.method === "POST" || request.method === "GET")) { return json(await scan(env)); }
    return json({ error: "not_found", worker: WORKER }, 404);
  }
};