// qnfo-fleet-deploy - central self-healing redeploy control plane (v0.3.3)
var VERSION = "0.3.3";
var ACCOUNT = "edb167b78c9fb901ea5bca3ce58ccc4b";
var GH = "https://raw.githubusercontent.com/QNFO/";
var FETCH_TIMEOUT_MS = 8000;
var FRESH_MS = 1800000;
var NO_SELF = ["qnfo-fleet-deploy"];
function json(d, s) { return new Response(JSON.stringify(d), { status: s || 200, headers: { "Content-Type": "application/json" } }); }
function versionOf(code) {
  code = code || "";
  var i = code.indexOf("VERSION");
  while (i >= 0 && i < code.length) {
    var j = code.indexOf("=", i);
    if (j < 0 || j - i > 15) { i = code.indexOf("VERSION", i + 1); continue; }
    var k = j + 1;
    if (code[k] === " ") k++;
    var d = code[k];
    if (d !== '"' && d !== "'") { i = code.indexOf("VERSION", i + 1); continue; }
    var q = code.indexOf(d, k + 1);
    if (q < 0 || q - k > 40) { i = code.indexOf("VERSION", i + 1); continue; }
    return code.slice(k + 1, q);
  }
  return null;
}
function newer(a, b) {
  a = String(a || ""); b = String(b || "");
  function num(s) { var m = s.split("-")[0]; var p = m.split("."); var n = []; for (var i = 0; i < p.length; i++) { var x = parseInt(p[i], 10); n.push(isNaN(x) ? 0 : x); } return n; }
  var ap = num(a), bp = num(b);
  var len = Math.max(ap.length, bp.length);
  for (var i = 0; i < len; i++) { var x = ap[i] || 0, y = bp[i] || 0; if (x !== y) return x > y; }
  return a > b;
}
function isModule(code) { return (code || "").indexOf("export default") >= 0 || (code || "").indexOf("export {") >= 0 || /^\s*import\s/.test(code || ""); }
async function timedFetch(url, opts, ms) {
  var ac = new AbortController();
  var t = setTimeout(function () { ac.abort(); }, ms || FETCH_TIMEOUT_MS);
  try { return await fetch(url, Object.assign({}, opts || {}, { signal: ac.signal })); }
  finally { clearTimeout(t); }
}
async function sha256(str) { var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)); return Array.from(new Uint8Array(d)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
async function stateGet(env, key, fb) { try { var r = await env.AUDIT.prepare("SELECT value FROM fleet_deploy_state WHERE key=?1").bind(key).first(); return r && r.value !== null && r.value !== undefined ? r.value : fb; } catch (e) { return fb; } }
async function stateSet(env, key, value) { try { await env.AUDIT.prepare("INSERT INTO fleet_deploy_state (key,value,updated_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')").bind(key, String(value)).run(); } catch (e) {} }
async function enabled(env) { return (await stateGet(env, "enabled", "0")) === "1"; }
async function autoHeal(env) { return (await stateGet(env, "auto_heal", "0")) === "1"; }
async function audit(env, w, actor, from, to, src2, ok, note) { try { await env.AUDIT.prepare("INSERT INTO fleet_deploys (worker, actor, from_sha, to_sha, source_path, ok, note, ts) VALUES (?1,?2,?3,?4,?5,?6,?7, datetime('now'))").bind(w, actor, from || "", to || "", src2 || "", ok ? 1 : 0, String(note || "").slice(0, 500)).run(); } catch (e) {} }
async function report(env, w, depV, canV, path, note) { try { await env.AUDIT.prepare("INSERT INTO fleet_drift_report (worker, deployed_version, canonical_version, source_path, note, ts) VALUES (?1,?2,?3,?4,?5, datetime('now'))").bind(w, depV || "", canV || "", path || "", String(note || "").slice(0, 200)).run(); } catch (e) {} }
async function r2Read(env, worker) {
  try {
    if (!env.CANONICAL) return null;
    var o = await env.CANONICAL.get(worker + ".js");
    if (!o) return null;
    var t = await o.text();
    if (!t || t.length === 0) return null;
    var ts = o.customMetadata && o.customMetadata.ts ? parseInt(o.customMetadata.ts, 10) : 0;
    var age = isNaN(ts) ? FRESH_MS + 1 : (Date.now() - ts);
    return { code: t, fresh: age < FRESH_MS, path: "r2:qnfo-canonical/" + worker + ".js" };
  } catch (e) { return null; }
}
async function canonical(env, worker) {
  var r2 = await r2Read(env, worker);
  if (r2 && r2.fresh) return r2;
  var names = [worker];
  if (worker.indexOf("qnfo-") === 0) names.push(worker.slice(5));
  var cs = [];
  for (var a = 0; a < names.length; a++) {
    cs.push("qnfo-workers/main/" + names[a] + "/deployed-current.worker.js");
    cs.push("qnfo-ops/main/cloud/" + names[a] + "/deployed-current.worker.js");
  }
  for (var i = 0; i < cs.length; i++) {
    try {
      var r = await timedFetch(GH + cs[i], { headers: { "User-Agent": "Mozilla/5.0 (qnfo-fleet-deploy)" } }, FETCH_TIMEOUT_MS);
      if (r.ok) {
        var c = await r.text();
        if (c && c.length > 0 && c.slice(0, 4) !== "404:") {
          try { if (env.CANONICAL) await env.CANONICAL.put(worker + ".js", c, { httpMetadata: { contentType: "text/plain" }, customMetadata: { ts: String(Date.now()) } }); } catch (e) {}
          return { path: cs[i], code: c };
        }
      }
    } catch (e) {}
  }
  if (r2) return r2;
  return null;
}
async function deployedContent(env, worker) {
  try {
    var r = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/" + worker + "/content/v2", { headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") } }, FETCH_TIMEOUT_MS);
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; }
}
async function cooldown(env, worker) {
  try {
    var r = await env.AUDIT.prepare("SELECT ts FROM fleet_deploys WHERE worker=?1 AND ok=1 ORDER BY id DESC LIMIT 1").bind(worker).first();
    if (r && r.ts) { var age = Date.now() - new Date(String(r.ts).replace(" ", "T") + "Z").getTime(); if (!isNaN(age) && age < 60000) return true; }
  } catch (e) {}
  return false;
}
async function redeploy(env, worker) {
  if (!/^[a-zA-Z0-9-]+$/.test(worker)) return { ok: false, status: 400, note: "invalid name" };
  if (NO_SELF.indexOf(worker) >= 0) return { ok: false, status: 400, note: "self-redeploy refused" };
  if (!(await enabled(env))) return { ok: false, status: 403, note: "kill-switch closed" };
  if (await cooldown(env, worker)) return { ok: false, status: 429, note: "cooldown 60s" };
  var c = await canonical(env, worker);
  if (!c) return { ok: false, status: 404, note: "no canonical source" };
  var canV = versionOf(c.code);
  if (!canV) return { ok: false, status: 422, note: "canonical has no VERSION marker" };
  var dep = await deployedContent(env, worker);
  var depV = dep ? versionOf(dep) : null;
  if (depV === canV) {
    await audit(env, worker, "deploy", depV, canV, c.path, true, "no-op version match");
    return { ok: true, status: 200, note: "no-op", from: depV, to: canV };
  }
  var direction = newer(depV || "", canV) ? "downgrade" : "upgrade";
  var ctype = isModule(c.code) ? "application/javascript+module" : "application/javascript";
  var toSha = await sha256(c.code);
  var r = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/" + worker + "/content", { method: "PUT", headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || ""), "Content-Type": ctype }, body: c.code }, 20000);
  var j = null; try { j = await r.json(); } catch (e) {}
  var putOk = r.ok && !(j && j.success === false);
  var dep2 = await deployedContent(env, worker);
  var depV2 = dep2 ? versionOf(dep2) : null;
  var ok = putOk && depV2 === canV;
  var note = !putOk ? ("HTTP " + r.status + " " + JSON.stringify(j || {}).slice(0, 180)) : (ok ? ("redeployed " + depV + " -> " + canV) : ("PUT-ok but deployed still " + (depV2 || "?") + " (wrangler-managed no-op?)"));
  await audit(env, worker, "deploy", depV || "?", canV, c.path, ok, note);
  return { ok: ok, status: ok ? 200 : 502, note: note, from: depV, to: canV, direction: direction, ctype: ctype, source: c.path, bytes: c.code.length };
}
async function scan(env, heal) {
  var out = { scanned: 0, clean: 0, drifted: 0, ahead: 0, healed: 0, errors: 0, details: [] };
  try {
    var lr = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts?per_page=100", { headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") } }, 20000);
    var lj = await lr.json();
    var names = (lj.result || []).map(function (x) { return x.id; });
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (NO_SELF.indexOf(n) >= 0) continue;
      out.scanned++;
      var c = await canonical(env, n);
      if (!c) { out.errors++; continue; }
      var canV = versionOf(c.code);
      if (!canV) { out.errors++; continue; }
      var dep = await deployedContent(env, n);
      var depV = dep ? versionOf(dep) : null;
      if (!depV) { out.errors++; continue; }
      if (depV === canV) { out.clean++; continue; }
      if (newer(depV, canV)) {
        out.ahead++;
        out.details.push(n + ":ahead " + depV + ">" + canV);
        await report(env, n, depV, canV, c.path, "deployed-ahead");
        continue;
      }
      out.drifted++;
      out.details.push(n + ":behind " + depV + "->" + canV);
      await report(env, n, depV, canV, c.path, "canonical-ahead");
      if (heal) { var res = await redeploy(env, n); if (res.ok) out.healed++; }
    }
  } catch (e) { out.errors++; out.note = String(e && e.message || e).slice(0, 120); }
  return out;
}
export default {
  async fetch(request, env) {
    var u = new URL(request.url);
    var p = u.pathname;
    var ah = request.headers.get("Authorization") || "";
    var auth = ah.indexOf("Bearer ") === 0 ? ah.slice(7) : ah;
    if (p === "/health") return json({ status: "ok", worker: "qnfo-fleet-deploy", version: VERSION, enabled: await enabled(env), auto_heal: await autoHeal(env) });
    var admin = auth && env.DEPLOY_ADMIN_TOKEN && auth === env.DEPLOY_ADMIN_TOKEN;
    var sh = auth && env.SELFHEAL_TOKEN && auth === env.SELFHEAL_TOKEN;
    if (!admin && !sh) return json({ error: "unauthorized" }, 401);
    if (p === "/redeploy" && request.method === "POST") {
      var body = {}; try { body = await request.json(); } catch (e) {}
      var w = body.worker || u.searchParams.get("worker");
      if (!w) return json({ error: "worker required" }, 400);
      var res = await redeploy(env, String(w));
      return json(res, res.ok ? 200 : res.status);
    }
    if (p === "/drift" && request.method === "POST" && admin) {
      var res = await scan(env, false);
      return json({ ok: true, scan: res });
    }
    if (p === "/scan-heal" && request.method === "POST" && admin) {
      var res2 = await scan(env, true);
      return json({ ok: true, scan: res2 });
    }
    return json({ error: "not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    var heal = await autoHeal(env);
    var res = await scan(env, heal);
    await report(env, "SCAN", "", "", "", "cron: scanned=" + res.scanned + " clean=" + res.clean + " drifted=" + res.drifted + " ahead=" + res.ahead + " healed=" + res.healed + " errors=" + res.errors);
  }
};