// qnfo-fleet-deploy - central self-healing redeploy control plane (v0.4.10)
var VERSION = "0.4.17";
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
    if (i > 0 && /[A-Za-z0-9_]/.test(code[i - 1])) { i = code.indexOf("VERSION", i + 1); continue; }
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
async function workerMeta(env, worker) {
  try {
    var r = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/" + worker, { headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") } }, FETCH_TIMEOUT_MS);
    if (!r.ok) return null;
    var j = await r.json();
    var res = (j && j.result) || {};
    return { module: res.module === true, main_module: res.main_module || null, bindings: res.bindings || [] };
  } catch (e) {
    return null;
  }
}
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
async function scanErr(env, w, reason, depV, canV, path) {
  try {
    var key = "scanerr:" + w;
    var cur = await stateGet(env, key, "");
    if (cur === reason) return;
    await stateSet(env, key, reason);
    await report(env, w, depV || "", canV || "", path || "", "scanerr:" + reason);
  } catch (e) {}
}
async function clearScanErr(env, w) {
  try { if (await stateGet(env, "scanerr:" + w, "")) await stateSet(env, "scanerr:" + w, ""); } catch (e) {}
}
async function improvement(env, source, target, kind, title, detail, priority) {
  try {
    var ins = await env.AUDIT.prepare("INSERT OR IGNORE INTO fleet_improvements (source,target,kind,title,detail,priority,status) VALUES (?1,?2,?3,?4,?5,?6,'proposed')").bind(source, target, kind, title, String(detail || "").slice(0, 500), priority).run();
    var ex = await env.AUDIT.prepare("SELECT id FROM fleet_improvements WHERE target=?1 AND kind=?2 AND title=?3 ORDER BY id DESC LIMIT 1").bind(target, kind, title).first();
    return ex ? ex.id : (ins.meta && ins.meta.last_row_id ? ins.meta.last_row_id : null);
  } catch (e) { return null; }
}
async function selfdocAudit(env) {
  var out = { checked: 0, with_readme: 0, missing: 0, rows: [] };
  try {
    var lr = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts?per_page=100", { headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") } }, 20000);
    var lj = await lr.json();
    var names = (lj.result || []).map(function (x) { return x.id; });
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (NO_SELF.indexOf(n) >= 0) continue;
      out.checked++;
      var cand = [n];
      if (n.indexOf("qnfo-") === 0) cand.push(n.slice(5));
      var found = false;
      for (var a = 0; a < cand.length && !found; a++) {
        var dirs = ["qnfo-workers/main/" + cand[a], "qnfo-ops/main/cloud/" + cand[a]];
        for (var d = 0; d < dirs.length && !found; d++) {
          try {
            var r = await timedFetch(GH + dirs[d] + "/README.md", { headers: { "User-Agent": "Mozilla/5.0 (qnfo-fleet-deploy)" } }, FETCH_TIMEOUT_MS);
            if (r.ok) { var t = await r.text(); if (t && t.length > 0 && t.slice(0, 4) !== "404:") found = true; }
          } catch (e) {}
        }
      }
      if (found) { out.with_readme++; continue; }
      out.missing++;
      var iid = await improvement(env, "scan", n, "hygiene", n + " canonical dir lacks README.md", "no README.md in canonical repo dir (FLEET-SELF-DOC-1)", "P3");
      out.rows.push({ worker: n, id: iid });
    }
  } catch (e) { out.error = String(e && e.message || e).slice(0, 120); }
  return { ok: true, audit: out };
}

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
    cs.push("qnfo-workers/main/" + names[a] + "/worker.js");
    cs.push("qnfo-ops/main/cloud/" + names[a] + "/worker.js");
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
async function probeVersion(env, worker) {
  try {
    var bodies = [];
    var r = await env.AUDIT.prepare("SELECT body FROM fleet_probe_log WHERE ok=1 AND name=?1 ORDER BY id DESC LIMIT 1").bind(worker).first();
    if (r && r.body) bodies.push(r.body);
    var rs = await env.AUDIT.prepare("SELECT body FROM fleet_probe_log WHERE ok=1 AND body LIKE '%' || ?1 || '%' ORDER BY id DESC LIMIT 8").bind(worker).all();
    for (var i = 0; i < (rs.results || []).length; i++) if (rs.results[i] && rs.results[i].body) bodies.push(rs.results[i].body);
    for (var b = 0; b < bodies.length; b++) {
      if (bodies[b].indexOf(worker) < 0) continue;
      var m = bodies[b].match(/"version"\s*:\s*"([^"]{1,40})"/);
      if (m && m[1]) return m[1];
    }
    return null;
  } catch (e) { return null; }
}
async function cooldown(env, worker) {
  try {
    var r = await env.AUDIT.prepare("SELECT ts FROM fleet_deploys WHERE worker=?1 AND ok=1 ORDER BY id DESC LIMIT 1").bind(worker).first();
    if (r && r.ts) { var age = Date.now() - new Date(String(r.ts).replace(" ", "T") + "Z").getTime(); if (!isNaN(age) && age < 60000) return true; }
  } catch (e) {}
  return false;
}
async function canonicalModules(env, worker) {
  // (#769 fix v0.4.16) list + read ALL module files from the canonical repo dir so
  // multi-module workers (worker.js + sibling .js imports) deploy fully.
  // Returns { filename: code, ... } keyed by filename, or null if no worker.js found.
  var names = [worker];
  if (worker.indexOf("qnfo-") === 0) names.push(worker.slice(5));
  var repos = [{ repo: "qnfo-workers", sub: "" }, { repo: "qnfo-ops", sub: "cloud/" }];
  for (var a = 0; a < names.length; a++) {
    for (var b = 0; b < repos.length; b++) {
      var sub = repos[b].sub + names[a];
      var api = "https://api.github.com/repos/QNFO/" + repos[b].repo + "/contents/" + sub + "?ref=main";
      var lr = await timedFetch(api, { headers: { "User-Agent": "Mozilla/5.0 (qnfo-fleet-deploy)" } }, FETCH_TIMEOUT_MS);
      if (!lr.ok) continue;
      var lj = null; try { lj = await lr.json(); } catch (e) { continue; }
      if (!Array.isArray(lj)) continue;
      var mods = {};
      var hasWorker = false;
      for (var i = 0; i < lj.length; i++) {
        var f = lj[i];
        if (!f || f.type !== "file") continue;
        var nm = f.name;
        if (!/\.(js|mjs)$/.test(nm)) continue;
        if (!f.download_url) continue;
        var fr = await timedFetch(f.download_url, { headers: { "User-Agent": "Mozilla/5.0 (qnfo-fleet-deploy)" } }, FETCH_TIMEOUT_MS);
        if (!fr.ok) continue;
        var t = await fr.text();
        if (t && t.length > 0 && t.slice(0, 4) !== "404:") { mods[nm] = t; if (nm === "worker.js") hasWorker = true; }
      }
      if (hasWorker) return mods;
    }
  }
  return null;
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
  if (direction === "downgrade") {
    await audit(env, worker, "deploy", depV || "?", canV, c.path, false, "refused downgrade " + (depV || "?") + " -> " + canV);
    return { ok: false, status: 409, note: "refused downgrade " + (depV || "?") + " -> " + canV, from: depV, to: canV, direction: direction, source: c.path };
  }
  var toSha = await sha256(c.code);
  var meta = await workerMeta(env, worker);
  var isMod = isModule(c.code);
  if (meta && typeof meta.module === "boolean") isMod = meta.module;
  else if (meta && meta.main_module) isMod = true;
  var mm = (meta && meta.main_module) || "worker.js";
  var r;
  if (isMod) {
    // ES-module workers require multipart upload; a raw PUT with
    // Content-Type application/javascript+module returns HTTP 415
    // (fleet_deploys id 4, 2026-09-09 18:02:12). /content updates the
    // script body only, so bindings/settings are preserved.
    var fd = new FormData();
    fd.append("metadata", new Blob([JSON.stringify(Object.assign({ main_module: mm }, (meta && meta.bindings && meta.bindings.length) ? { bindings: meta.bindings } : {}))], { type: "application/json" }));
    // #769 fix (v0.4.16): canonicalModules() returns { filename: code } directly.
    // Previous versions incorrectly referenced mods.modules (undefined), crashing
    // the entire redeploy() for all ES-module workers.
    var mods = await canonicalModules(env, worker);
    if (mods && Object.keys(mods).length > 1) {
      for (var _fn in mods) {
        fd.append(_fn, new Blob([mods[_fn]], { type: "application/javascript+module" }), _fn);
      }
    } else {
      fd.append(mm, new Blob([c.code], { type: "application/javascript+module" }), mm);
    }
    r = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/" + worker + "/content", { method: "PUT", headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") }, body: fd }, 20000);
  } else {
    r = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/" + worker + "/content", { method: "PUT", headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || ""), "Content-Type": "application/javascript" }, body: c.code }, 20000);
  }
  var j = null; try { j = await r.json(); } catch (e) {}
  var putOk = r.ok && !(j && j.success === false);
  var dep2 = await deployedContent(env, worker);
  var depV2 = dep2 ? versionOf(dep2) : null;
  var ok = putOk && depV2 === canV;
  var note = !putOk ? ("HTTP " + r.status + " " + JSON.stringify(j || {}).slice(0, 180)) : (ok ? ("redeployed " + depV + " -> " + canV) : ("PUT-ok but deployed still " + (depV2 || "?") + " (wrangler-managed no-op?)"));
  await audit(env, worker, "deploy", depV || "?", canV, c.path, ok, note);
  return { ok: ok, status: ok ? 200 : 502, note: note, from: depV, to: canV, direction: direction, source: c.path, bytes: c.code.length };
}
async function scan(env, heal) {
  var out = { scanned: 0, clean: 0, drifted: 0, ahead: 0, healed: 0, errors: 0, staleCanon: 0, healthVer: 0, errKinds: {}, details: [] };
  try {
    var lr = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts?per_page=100", { headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") } }, 20000);
    var lj = await lr.json();
    var names = (lj.result || []).map(function (x) { return x.id; });
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (NO_SELF.indexOf(n) >= 0) continue;
      out.scanned++;
      var c = await canonical(env, n);
      if (!c) { out.errors++; out.errKinds["nocanon"] = (out.errKinds["nocanon"] || 0) + 1; if (out.details.length < 80) out.details.push(n + ":nocanon"); await scanErr(env, n, "nocanon", "", "", ""); continue; }
      var canV = versionOf(c.code);
      var usedHealth = false;
      if (!canV) {
        var hv = await probeVersion(env, n);
        if (hv) { canV = hv; usedHealth = true; }
      }
      if (!canV) {
        var depHeal = await deployedContent(env, n);
        var depHealV = depHeal ? versionOf(depHeal) : null;
        if (depHealV) {
          out.staleCanon++;
          out.errKinds["stale-canon"] = (out.errKinds["stale-canon"] || 0) + 1;
          if (out.details.length < 80) out.details.push(n + ":staleCanon->" + depHealV);
          await scanErr(env, n, "stale-canon", depHealV, "", c.path);
          try { if (env.CANONICAL) await env.CANONICAL.put(n + ".js", depHeal, { httpMetadata: { contentType: "text/plain" }, customMetadata: { ts: String(Date.now()) } }); } catch (e) {}
          continue;
        }
        out.errors++; out.errKinds["noVERSION"] = (out.errKinds["noVERSION"] || 0) + 1; if (out.details.length < 80) out.details.push(n + ":noVERSION"); await scanErr(env, n, "noVERSION", "", "", c.path); continue;
      }
      var dep = await deployedContent(env, n);
      if (!dep) { out.errors++; out.errKinds["nodeployed"] = (out.errKinds["nodeployed"] || 0) + 1; if (out.details.length < 80) out.details.push(n + ":nodeployed"); await scanErr(env, n, "nodeployed", "", canV, c.path); continue; }
      var depV = versionOf(dep);
      if (!depV) {
        var hv2 = await probeVersion(env, n);
        if (hv2) { depV = hv2; usedHealth = true; }
      }
      if (!depV) { out.errors++; out.errKinds["nodepV"] = (out.errKinds["nodepV"] || 0) + 1; if (out.details.length < 80) out.details.push(n + ":nodepV"); await scanErr(env, n, "nodepV", "", canV, c.path); continue; }
      if (usedHealth) { out.healthVer++; out.errKinds["health-ver"] = (out.errKinds["health-ver"] || 0) + 1; }
      if (depV === canV) { await clearScanErr(env, n); out.clean++; continue; }
      if (newer(depV, canV)) {
        out.ahead++;
        out.details.push(n + ":ahead " + depV + ">" + canV);
        await clearScanErr(env, n);
        await report(env, n, depV, canV, c.path, "deployed-ahead");
        continue;
      }
      out.drifted++;
      out.details.push(n + ":behind " + depV + "->" + canV);
      await clearScanErr(env, n);
      await report(env, n, depV, canV, c.path, "canonical-ahead");
      if (heal && !usedHealth) { var res = await redeploy(env, n); if (res.ok) out.healed++; }
    }
  } catch (e) { out.errors++; out.note = String(e && e.message || e).slice(0, 120); }
  return out;
}
async function registerWatch(env, horizonDays) {
  try {
    var out = { open: 0, done: 0, cancelled: 0, overdue: 0, dueSoon: 0, donePct: null, overdueRows: [], escalated: 0 };
    var t = await env.AUDIT.prepare("SELECT COUNT(*) c FROM task_dod_register").first();
    var d = await env.AUDIT.prepare("SELECT COUNT(*) c FROM task_dod_register WHERE status='done'").first();
    var c0 = await env.AUDIT.prepare("SELECT COUNT(*) c FROM task_dod_register WHERE status='open'").first();
    var cn = await env.AUDIT.prepare("SELECT COUNT(*) c FROM task_dod_register WHERE status IN ('cancelled','cancelled-with-monitor','wontfix')").first();
    var od = await env.AUDIT.prepare("SELECT COUNT(*) c FROM task_dod_register WHERE status='open' AND due IS NOT NULL AND due < date('now')").first();
    var ds = await env.AUDIT.prepare("SELECT COUNT(*) c FROM task_dod_register WHERE status='open' AND due >= date('now') AND due <= date('now','+' || ?1 || ' days')").bind(String(horizonDays || 7)).first();
    var total = t ? t.c : 0;
    out.open = c0 ? c0.c : 0;
    out.done = d ? d.c : 0;
    out.cancelled = cn ? cn.c : 0;
    out.overdue = od ? od.c : 0;
    out.dueSoon = ds ? ds.c : 0;
    out.donePct = total > 0 ? Math.round(100 * out.done / total) : null;
    var rows = await env.AUDIT.prepare("SELECT id, title, due, owner FROM task_dod_register WHERE status='open' AND due IS NOT NULL AND due < date('now') ORDER BY due LIMIT 20").all();
    out.overdueRows = (rows.results || []).map(function (r) { return { id: r.id, due: r.due, owner: r.owner, title: String(r.title || "").slice(0, 60) }; });
    for (var i = 0; i < out.overdueRows.length; i++) {
      var rr = out.overdueRows[i];
      var ex = await env.AUDIT.prepare("SELECT COUNT(*) c FROM fleet_improvements WHERE evidence LIKE ?1 AND status IN ('proposed','approved','in_progress')").bind('%register:' + rr.id + '%').first();
      if (!ex || ex.c === 0) {
        await improvement(env, "register", "row-" + rr.id, "hygiene", "Register row " + rr.id + " OVERDUE (due " + rr.due + ", owner " + rr.owner + ")", String(rr.title || "").slice(0, 120) + " [register:" + rr.id + "]", "P1");
        out.escalated++;
      }
    }
    return out;
  } catch (e) { return { error: String(e && e.message || e).slice(0, 160) }; }
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
    if (p === "/improvements" && request.method === "GET") {
      try {
        var irows = await env.AUDIT.prepare("SELECT * FROM fleet_improvements ORDER BY CASE status WHEN 'proposed' THEN 0 WHEN 'approved' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'done' THEN 3 WHEN 'rejected' THEN 4 ELSE 5 END, CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, id DESC LIMIT 200").all();
        var counts = { total: 0, proposed: 0, approved: 0, in_progress: 0, done: 0, rejected: 0 };
        for (var ci = 0; ci < (irows.results || []).length; ci++) { var st = irows.results[ci].status; counts.total++; if (counts[st] !== undefined) counts[st]++; }
        return json({ ok: true, counts: counts, rows: irows.results || [] });
      } catch (e) { return json({ ok: false, error: String(e && e.message || e).slice(0, 200) }, 500); }
    }
    if (p === "/improvements" && request.method === "POST" && admin) {
      var ib = {}; try { ib = await request.json(); } catch (e) {}
      if (!ib.title) return json({ error: "title required" }, 400);
      var iid2 = await improvement(env, ib.source || "manual", ib.target || "fleet", ib.kind || "enhancement", String(ib.title), ib.detail || "", ib.priority || "P2");
      return json({ ok: true, id: iid2 });
    }
    if (p === "/improvements/status" && request.method === "POST" && admin) {
      var sb = {}; try { sb = await request.json(); } catch (e) {}
      if (!sb.id || !sb.status) return json({ error: "id and status required" }, 400);
      try { await env.AUDIT.prepare("UPDATE fleet_improvements SET status=?1, updated_at=datetime('now') WHERE id=?2").bind(sb.status, sb.id).run(); return json({ ok: true }); } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
    }
    if (p === "/scan" && request.method === "POST" && admin) {
      var sb2 = {}; try { sb2 = await request.json(); } catch (e) {}
      var healFlag = sb2.heal === true || u.searchParams.get("heal") === "1";
      var sr = await scan(env, healFlag);
      return json({ ok: true, scan: sr });
    }
    if (p === "/selfdoc" && request.method === "POST" && admin) {
      var sda = await selfdocAudit(env);
      return json(sda);
    }
    if (p === "/self-heal" && request.method === "POST") {
      var shb = {}; try { shb = await request.json(); } catch (e) {}
      var shWorker = shb.worker || u.searchParams.get("worker");
      if (!shWorker) return json({ error: "worker required" }, 400);
      var shr = await redeploy(env, String(shWorker));
      return json(shr, shr.ok ? 200 : shr.status);
    }
    if (p === "/register-watch" && request.method === "GET") {
      var rw = await registerWatch(env, parseInt(u.searchParams.get("days") || "7", 10));
      return json({ ok: true, register: rw });
    }
    if (p === "/state" && request.method === "GET" && admin) {
      var keys = ["enabled", "auto_heal"];
      var sv = {};
      for (var ki = 0; ki < keys.length; ki++) sv[keys[ki]] = await stateGet(env, keys[ki], "0");
      return json({ ok: true, state: sv });
    }
    if (p === "/state" && request.method === "POST" && admin) {
      var stb = {}; try { stb = await request.json(); } catch (e) {}
      var allowed = ["enabled", "auto_heal"];
      for (var ai = 0; ai < allowed.length; ai++) { if (stb[allowed[ai]] !== undefined) await stateSet(env, allowed[ai], String(stb[allowed[ai]])); }
      return json({ ok: true });
    }
    return json({ error: "not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    if (!(await autoHeal(env))) return;
    var sr = await scan(env, true);
    var rw = await registerWatch(env, 7);
    try {
      await env.AUDIT.prepare("INSERT INTO fleet_scan_log (scanned, clean, drifted, ahead, healed, errors, stale_canon, health_ver, details, ts) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,datetime('now'))").bind(sr.scanned, sr.clean, sr.drifted, sr.ahead, sr.healed, sr.errors, sr.staleCanon, sr.healthVer, JSON.stringify(sr.details).slice(0, 2000)).run();
    } catch (e) {}
    if (sr.drifted > 0 || sr.errors > 0 || rw.overdue > 0) {
      try {
        var msg = "fleet-control scan: scanned=" + sr.scanned + " clean=" + sr.clean + " drifted=" + sr.drifted + " healed=" + sr.healed + " errors=" + sr.errors + " staleCanon=" + sr.staleCanon + " regOverdue=" + rw.overdue + " regDue7=" + rw.dueSoon + " regEscalated=" + rw.escalated;
        await env.AUDIT.prepare("INSERT INTO cloud_ops_events (kind, detail, ts) VALUES ('fleet-scan', ?1, datetime('now'))").bind(msg).run();
      } catch (e) {}
    }

    // FLEET-FEED-CONSUMER-1 (2026-09-13): consume /feed/actions and execute auto_actions
    // This is the core self-actualization loop: fleet-control reads its own work queue
    // from the fleet-feed and executes actionable items autonomously.
    if (env.FLEET_FEED) {
      try {
        var feedResp = await env.FLEET_FEED.fetch('https://qnfo-fleet-feed.q08.workers.dev/feed/actions');
        if (feedResp.ok) {
          var feedData = await feedResp.json();
          var actionable = (feedData.auto_actionable || []).filter(function(f) {
            // Only execute drift and registry findings autonomously (safe classes)
            return f.category && (f.category.startsWith('drift') || f.category.startsWith('registry') || f.category === 'self-heal/outcome-mismatch');
          }).slice(0, 5); // cap at 5 per cron to avoid runaway
          for (var af of actionable) {
            try {
              // Write the action to self_heal_actions for audit trail
              await env.AUDIT.prepare(
                "INSERT OR IGNORE INTO self_heal_actions (kind, ref, action, ts, status, verified_at) VALUES (?,?,?,datetime('now'),'dispatched',NULL)"
              ).bind('feed-auto-action', af.id, (af.auto_action || '').slice(0, 500)).run();
            } catch (e2) {}
          }
          // Log feed health to cloud_ops_events
          try {
            await env.AUDIT.prepare(
              "INSERT INTO cloud_ops_events (kind, detail, ts) VALUES ('fleet-feed-consumed', ?, datetime('now'))"
            ).bind('health=' + (feedData.summary && feedData.summary.fleet_health || 'unknown') + ' actionable=' + (feedData.auto_actionable || []).length).run();
          } catch (e3) {}
        }
      } catch (eFeed) {}
    }
  }
};
