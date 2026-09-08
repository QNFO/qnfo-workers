// qnfo-fleet-deploy - central self-healing redeploy control plane (v0.2.1)
var VERSION = "0.2.1";
var ACCOUNT = "edb167b78c9fb901ea5bca3ce58ccc4b";
var GH = "https://raw.githubusercontent.com/QNFO/";
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
async function sha256(str) { var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)); return Array.from(new Uint8Array(d)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join(""); }
async function stateGet(env, key, fb) { try { var r = await env.AUDIT.prepare("SELECT value FROM fleet_deploy_state WHERE key=?1").bind(key).first(); return r && r.value !== null && r.value !== undefined ? r.value : fb; } catch (e) { return fb; } }
async function stateSet(env, key, value) { try { await env.AUDIT.prepare("INSERT INTO fleet_deploy_state (key,value,updated_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')").bind(key, String(value)).run(); } catch (e) {} }
async function enabled(env) { return (await stateGet(env, "enabled", "0")) === "1"; }
async function autoHeal(env) { return (await stateGet(env, "auto_heal", "0")) === "1"; }
async function audit(env, w, actor, from, to, src, ok, note) { try { await env.AUDIT.prepare("INSERT INTO fleet_deploys (worker, actor, from_sha, to_sha, source_path, ok, note, ts) VALUES (?1,?2,?3,?4,?5,?6,?7, datetime('now'))").bind(w, actor, from || "", to || "", src || "", ok ? 1 : 0, String(note || "").slice(0, 500)).run(); } catch (e) {} }
async function report(env, w, depV, canV, path, note) { try { await env.AUDIT.prepare("INSERT INTO fleet_drift_report (worker, deployed_version, canonical_version, source_path, note, ts) VALUES (?1,?2,?3,?4,?5, datetime('now'))").bind(w, depV || "", canV || "", path || "", String(note || "").slice(0, 200)).run(); } catch (e) {} }
async function canonical(worker) {
  var names = [worker];
  if (worker.indexOf("qnfo-") === 0) names.push(worker.slice(5));
  var cs = [];
  for (var a = 0; a < names.length; a++) {
    cs.push("qnfo-workers/main/" + names[a] + "/deployed-current.worker.js");
    cs.push("qnfo-ops/main/cloud/" + names[a] + "/deployed-current.worker.js");
  }
  for (var i = 0; i < cs.length; i++) {
    var r = await fetch(GH + cs[i]);
    if (r.ok) { var c = await r.text(); if (c && c.length > 0 && c.slice(0, 4) !== "404:") return { path: cs[i], code: c }; }
  }
  return null;
}
async function deployedContent(env, worker) {
  try {
    var r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/" + worker + "/content/v2", { headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") } });
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
  if (!(await enabled(env))) return { ok: false, status: 403, note: "disabled (kill-switch)" };
  if (await cooldown(env, worker)) return { ok: false, status: 429, note: "cooldown 60s" };
  var c = await canonical(worker);
  if (!c) return { ok: false, status: 404, note: "no canonical source" };
  var canV = versionOf(c.code);
  if (!canV) return { ok: false, status: 422, note: "canonical has no VERSION marker" };
  var dep = await deployedContent(env, worker);
  var depV = dep ? versionOf(dep) : null;
  if (depV === canV) {
    await audit(env, worker, "deploy", depV, canV, c.path, true, "no-op version match");
    return { ok: true, status: 200, note: "no-op", from: depV, to: canV };
  }
  var toSha = await sha256(c.code);
  var r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/" + worker + "/content", { method: "PUT", headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || ""), "Content-Type": "application/javascript+module" }, body: c.code });
  var j = null; try { j = await r.json(); } catch (e) {}
  var ok = r.ok && !(j && j.success === false);
  var note = ok ? ("redeployed " + (depV || "?") + " -> " + canV) : ("HTTP " + r.status + " " + JSON.stringify(j || {}).slice(0, 180));
  await audit(env, worker, "deploy", depV || "?", canV, c.path, ok, note);
  return { ok: ok, status: r.status, note: note, from: depV, to: canV, bytes: c.code.length, source: c.path, sha256: toSha.slice(0, 16) };
}
async function scan(env, heal) {
  var out = { scanned: 0, drifted: 0, healed: 0, errors: 0, details: [] };
  try {
    var lr = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts?per_page=100", { headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") } });
    var lj = await lr.json();
    var names = (lj.result || []).map(function (x) { return x.id; });
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (NO_SELF.indexOf(n) >= 0) continue;
      out.scanned++;
      var c = await canonical(n);
      if (!c) { out.errors++; continue; }
      var canV = versionOf(c.code);
      if (!canV) { out.errors++; continue; }
      var dep = await deployedContent(env, n);
      var depV = dep ? versionOf(dep) : null;
      if (depV === canV) continue;
      out.drifted++;
      out.details.push(n + ":" + (depV || "?") + "->" + canV);
      await report(env, n, depV, canV, c.path, "drift");
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
    return json({ error: "not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    var heal = await autoHeal(env);
    var res = await scan(env, heal);
    await report(env, "SCAN", "", "", "", "cron: scanned=" + res.scanned + " drifted=" + res.drifted + " healed=" + res.healed + " errors=" + res.errors);
  }
};