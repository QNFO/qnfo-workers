// qnfo-deploy-guard v1.3.1 - deploy lock + concurrent-mutation detector + cost watchdog + heartbeat
// Worker Contract v1: VERSION constant + GET /health
// Data: https://ops.qnfo.org/fleet (modified_on per worker) + https://ops.qnfo.org/cost (spend)
// NOTE: source of truth is this file; GET /workers/scripts/<name> TRUNCATES large bodies - never patch from a GET.
var VERSION = "1.3.1";
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
async function readLock(env, w) { var v = await env.FLEET_CONFIG.get(LOCK_PREFIX + w); if (!v) return null; try { return JSON.parse(v); } catch (e) { return null; } }
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
  try { var lk = await env.FLEET_CONFIG.list({ prefix: LOCK_PREFIX }); for (var j = 0; j < lk.keys.length; j++) { var w = lk.keys[j].name.slice(LOCK_PREFIX.length); var rc = await readLock(env, w); if (rc && rc.expires_at > Date.now()) active[w] = rc; } } catch (e) {}
  var denials = [];
  try { var dn = await env.FLEET_CONFIG.list({ prefix: DENY_PREFIX }); for (var d = 0; d < dn.keys.length; d++) { var dv = await env.FLEET_CONFIG.get(dn.keys[d].name); if (dv) { try { denials.push(JSON.parse(dv)); } catch (e) {} } } } catch (e) {}
  var fleet = (fp.ok && fp.j && fp.j.fleet) ? fp.j.fleet : [];
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
  var report = { ts: nowIso(), version: VERSION, fleet_probe_ok: fp.ok, fleet_url: fp.url, workers_seen: fleet.length, changed_since_last: changed.length, anomalies: uniq, filed: filed, active_locks: Object.keys(active), recent_denials: denials.length, cost: cost, baseline: Object.keys(prev).length === 0, elapsed_ms: Date.now() - t0 };
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
    if (p === "/locks" && request.method === "GET") { var lk2 = await env.FLEET_CONFIG.list({ prefix: LOCK_PREFIX }); var o2 = []; for (var i2 = 0; i2 < lk2.keys.length; i2++) { var w2 = lk2.keys[i2].name.slice(LOCK_PREFIX.length); var r2 = await readLock(env, w2); if (r2) o2.push(r2); } return json({ locks: o2, now: nowIso() }); }
    if (p.indexOf("/lock/") === 0 && request.method === "GET") { var w3 = decodeURIComponent(p.slice(6)); return json({ worker: w3, lock: await readLock(env, w3), now: nowIso() }); }
    if (p === "/lock/acquire" && request.method === "POST") {
      var b = await request.json().catch(function () { return {}; }); var w4 = String(b.worker || "");
      if (!w4) return json({ error: "worker required" }, 400);
      var ttl = Math.min(Math.max(Number(b.ttl_sec || DEFAULT_TTL), 60), MAX_TTL);
      var cur = await readLock(env, w4);
      if (cur && cur.expires_at > Date.now()) {
        try { await env.FLEET_CONFIG.put(DENY_PREFIX + Date.now() + "-" + tok(), JSON.stringify({ worker: w4, owner: String(b.owner || "unknown"), held_by: cur.owner, at: nowIso() }), { expirationTtl: 3600 }); } catch (e) {}
        return json({ acquired: false, held_by: cur.owner, held_since: cur.since, expires_at: new Date(cur.expires_at).toISOString() }, 409);
      }
      var rec3 = { worker: w4, owner: String(b.owner || "unknown"), token: tok(), since: nowIso(), expires_at: Date.now() + ttl * 1000, ttl_sec: ttl, expected_version: b.expected_version || null };
      await env.FLEET_CONFIG.put(LOCK_PREFIX + w4, JSON.stringify(rec3), { expirationTtl: ttl });
      return json({ acquired: true, token: rec3.token, expires_at: new Date(rec3.expires_at).toISOString() });
    }
    if (p === "/lock/release" && request.method === "POST") {
      var b5 = await request.json().catch(function () { return {}; }); var w5 = String(b5.worker || ""); var tk = String(b5.token || "");
      if (!w5 || !tk) return json({ error: "worker and token required" }, 400);
      var cur5 = await readLock(env, w5); if (!cur5 || cur5.token !== tk) return json({ released: false, reason: "token mismatch or no lock" }, 409);
      await env.FLEET_CONFIG.delete(LOCK_PREFIX + w5); return json({ released: true });
    }
    if (p === "/ledger" && request.method === "POST") {
      var bl = await request.json().catch(function () { return {}; }); if (!bl.worker) return json({ error: "worker required" }, 400);
      var rl = await auditRun(env, "INSERT INTO fleet_deploys (worker, actor, from_sha, to_sha, source_path, ok, note, ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)", [String(bl.worker), String(bl.actor || "unknown"), bl.from || null, bl.to || null, bl.source_path || null, bl.ok === false ? 0 : 1, String(bl.note || "").slice(0, 400), nowIso()]);
      return json({ logged: true, ok: rl && rl.ok !== false, error: rl && rl.error });
    }
    if (p === "/thresholds" && request.method === "POST") { var bt = await request.json().catch(function () { return {}; }); await env.FLEET_CONFIG.put(THR_KEY, JSON.stringify({ day_usd: Number(bt.day_usd || 10), month_usd: Number(bt.month_usd || 150) })); return json({ set: true }); }
    if (p === "/scan" && (request.method === "POST" || request.method === "GET")) { return json(await scan(env)); }
    return json({ error: "not_found", worker: WORKER }, 404);
  }
};