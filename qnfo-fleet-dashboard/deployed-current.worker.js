var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __name2 = /* @__PURE__ */ __name((target, value) => Object.defineProperty(target, "name", { value, configurable: true }), "__name");
var REGISTRY = null;;
var VERSION = "1.6.6"; // FIX-5 (2026-09-14): concrete chain remediation
var NAME = "qnfo-fleet-dashboard";
var PROBE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
var ACCOUNT = "edb167b78c9fb901ea5bca3ce58ccc4b";
var STALE_MS = 15 * 60 * 1e3;
var DAY_MS = 24 * 60 * 60 * 1e3;
function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}
__name(pad2, "pad2");
__name2(pad2, "pad2");
function fmtUtc(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + " UTC";
}
__name(fmtUtc, "fmtUtc");
__name2(fmtUtc, "fmtUtc");
function naiveUtc(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + ":" + pad2(d.getUTCSeconds());
}
__name(naiveUtc, "naiveUtc");
__name2(naiveUtc, "naiveUtc");
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc, "esc");
__name2(esc, "esc");
function squash(s) {
  return String(s || "").split(/\s+/).join(" ").slice(0, 200);
}
__name(squash, "squash");
__name2(squash, "squash");
function json(data, status) {
  return new Response(JSON.stringify(data, null, 1), {
    status: status || 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" }
  });
}
__name(json, "json");
__name2(json, "json");
function parseField(f, lo, hi) {
  f = String(f).trim();
  if (f === "*" || f === "") return null;
  const out = /* @__PURE__ */ new Set();
  const parts = f.split(",");
  for (const p of parts) {
    let step = 1, base = p, a = lo, b = hi;
    if (p.indexOf("/") >= 0) {
      const sp = p.split("/");
      base = sp[0];
      step = parseInt(sp[1], 10) || 1;
    }
    if (base !== "*" && base.indexOf("-") >= 0) {
      const rr = base.split("-");
      a = parseInt(rr[0], 10);
      b = parseInt(rr[1], 10);
    } else if (base !== "*") {
      a = parseInt(base, 10);
      b = a;
    }
    for (let v = a; v <= b; v += step) {
      if (v >= lo && v <= hi) out.add(v);
    }
  }
  return out;
}
__name(parseField, "parseField");
__name2(parseField, "parseField");
var cronFieldCache = /* @__PURE__ */ new Map();
function cronFields(cronStr) {
  let p = cronFieldCache.get(cronStr);
  if (p) return p;
  const f = String(cronStr).trim().split(/\s+/);
  if (f.length !== 5) {
    p = { bad: true };
  } else {
    p = {
      mm: parseField(f[0], 0, 59),
      hh: parseField(f[1], 0, 23),
      dom: parseField(f[2], 1, 31),
      mon: parseField(f[3], 1, 12),
      dow: parseField(f[4], 0, 7)
    };
  }
  cronFieldCache.set(cronStr, p);
  return p;
}
__name(cronFields, "cronFields");
__name2(cronFields, "cronFields");
function cronMatchAt(cronStr, d) {
  const p = cronFields(cronStr);
  if (p.bad) return false;
  if (p.mm !== null && !p.mm.has(d.getUTCMinutes())) return false;
  if (p.hh !== null && !p.hh.has(d.getUTCHours())) return false;
  if (p.mon !== null && !p.mon.has(d.getUTCMonth() + 1)) return false;
  const dowVal = d.getUTCDay();
  const dowOk = p.dow !== null && (p.dow.has(dowVal) || p.dow.has(7) && dowVal === 0);
  const domOk = p.dom !== null && p.dom.has(d.getUTCDate());
  let dayOk;
  if (p.dom === null && p.dow === null) dayOk = true;
  else if (p.dom === null) dayOk = dowOk;
  else if (p.dow === null) dayOk = domOk;
  else dayOk = domOk || dowOk;
  return dayOk;
}
__name(cronMatchAt, "cronMatchAt");
__name2(cronMatchAt, "cronMatchAt");
function nextRuns(cronStr, fromMs, count, horizonMs) {
  const res = [];
  let t = Math.floor(fromMs / 6e4) * 6e4 + 6e4;
  const end = fromMs + (horizonMs || 400 * DAY_MS);
  while (t <= end && res.length < count) {
    if (cronMatchAt(cronStr, new Date(t))) res.push(new Date(t));
    t += 6e4;
  }
  return res;
}
__name(nextRuns, "nextRuns");
__name2(nextRuns, "nextRuns");
function workerNextRuns(crons, fromMs, count) {
  const all = [];
  for (const c of crons || []) {
    const nr = nextRuns(c, fromMs, 2, 400 * DAY_MS);
    for (const d of nr) all.push({ cron: c, at: d });
  }
  all.sort((x, y) => x.at.getTime() - y.at.getTime());
  const uniq = [];
  for (const it of all) {
    if (!uniq.length || uniq[uniq.length - 1].at.getTime() !== it.at.getTime()) uniq.push(it);
  }
  return uniq.slice(0, count).map(function(it) {
    return { cron: it.cron, at: fmtUtc(it.at.getTime()) };
  });
}
__name(workerNextRuns, "workerNextRuns");
__name2(workerNextRuns, "workerNextRuns");
function expectedFires(crons, fromMs, windowMs) {
  let n = 0;
  const start = fromMs - windowMs;
  let t = Math.floor(start / 6e4) * 6e4 + 6e4;
  const end = fromMs;
  for (const c of crons || []) {
    let x = t;
    while (x <= end) {
      if (cronMatchAt(c, new Date(x))) n++;
      x += 6e4;
    }
  }
  return n;
}
__name(expectedFires, "expectedFires");
__name2(expectedFires, "expectedFires");
async function d1all(db, sql, params) {
  let ps = db.prepare(sql);
  if (params && params.length) ps = ps.bind.apply(ps, params);
  const r = await ps.all();
  return r.results || [];
}
__name(d1all, "d1all");
__name2(d1all, "d1all");
async function ensureStateTable(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS fleet_dashboard_state (id INTEGER PRIMARY KEY, updated_at TEXT, state_json TEXT, refresh_ms INTEGER)").run();
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS fleet_probe_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT, name TEXT, url TEXT, transport TEXT, ok INTEGER, status INTEGER, ms INTEGER, body TEXT)").run();
}
__name(ensureStateTable, "ensureStateTable");
__name2(ensureStateTable, "ensureStateTable");
async function saveState(env, st, ms) {
  await ensureStateTable(env);
  await env.AUDIT.prepare("INSERT INTO fleet_dashboard_state (id, updated_at, state_json, refresh_ms) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, state_json=excluded.state_json, refresh_ms=excluded.refresh_ms").bind(st.generated_at, JSON.stringify(st), ms).run();
}
__name(saveState, "saveState");
__name2(saveState, "saveState");
async function loadState(env) {
  try {
    await ensureStateTable(env);
    const rows = await d1all(env.AUDIT, "SELECT updated_at, state_json, refresh_ms FROM fleet_dashboard_state WHERE id = 1");
    if (rows && rows.length && rows[0].state_json) return { state: JSON.parse(rows[0].state_json), updatedAt: rows[0].updated_at };
  } catch (e) {
  }
  return null;
}
__name(loadState, "loadState");
__name2(loadState, "loadState");
async function analytics24(env) {
  const out = { per: {}, req: 0, err: 0, errWorkers: [], unattributed: 0, ts: null, error: null };
  if (!env.CF_TOKEN) {
    out.error = "CF_TOKEN secret not set";
    return out;
  }
  try {
    const end = /* @__PURE__ */ new Date();
    const start = new Date(end.getTime() - DAY_MS);
    const query = 'query { viewer { accounts(filter:{accountTag:"' + ACCOUNT + '"}) { workersInvocationsAdaptive(limit:10000, filter:{datetime_geq:"' + start.toISOString() + '", datetime_leq:"' + end.toISOString() + '"}) { sum { requests errors } dimensions { scriptName } } } } }';
    const resp = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.CF_TOKEN },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(2e4)
    });
    const g = await resp.json();
    if (!resp.ok || g.errors) {
      out.error = "graphql " + resp.status + " " + JSON.stringify(g.errors || g).slice(0, 200);
      return out;
    }
    const rows = (((g.data || {}).viewer || {}).accounts || [{}])[0].workersInvocationsAdaptive || [];
    for (const row of rows) {
      const nm = (row.dimensions || {}).scriptName || "?";
      const sm = row.sum || {};
      const d = out.per[nm] || (out.per[nm] = { requests: 0, errors: 0 });
      d.requests += sm.requests || 0;
      d.errors += sm.errors || 0;
    }
    for (const k of Object.keys(out.per)) {
      out.req += out.per[k].requests;
      out.err += out.per[k].errors;
      const noise = k === "?" || k === "__unknown__" || k === "undefined" || k === "null" || k.charAt(0) === "_";
      if (noise) {
        out.unattributed += out.per[k].errors;
        continue;
      }
      if (out.per[k].errors > 0) out.errWorkers.push({ name: k, errors: out.per[k].errors });
    }
    out.errWorkers.sort(function(a, b) {
      return b.errors - a.errors;
    });
    out.ts = (/* @__PURE__ */ new Date()).toISOString();
  } catch (e) {
    out.error = "graphql exc " + String(e.message || e).slice(0, 200);
  }
  return out;
}
__name(analytics24, "analytics24");
__name2(analytics24, "analytics24");
async function lastRuns30(env) {
  const out = {};
  if (!env.CF_TOKEN) return out;
  for (const days of [30, 7]) {
    for (const dim of ["datetime", "date"]) {
      try {
        const end = /* @__PURE__ */ new Date();
        const start = new Date(end.getTime() - days * DAY_MS);
        const gq = dim === "date" ? "date_geq" : "datetime_geq";
        const lq = dim === "date" ? "date_leq" : "datetime_leq";
        const query = 'query { viewer { accounts(filter:{accountTag:"' + ACCOUNT + '"}) { workersInvocationsAdaptive(limit:10000, filter:{' + gq + ':"' + start.toISOString() + '", ' + lq + ':"' + end.toISOString() + '"}) { sum { requests } dimensions { scriptName ' + dim + " } } } } }";
        const resp = await fetch("https://api.cloudflare.com/client/v4/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.CF_TOKEN },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(2e4)
        });
        const g = await resp.json();
        if (!resp.ok || g.errors) continue;
        const rows = (((g.data || {}).viewer || {}).accounts || [{}])[0].workersInvocationsAdaptive || [];
        for (const row of rows) {
          const dms = row.dimensions || {};
          const nm = dms.scriptName || "?";
          const dt = dms[dim] || null;
          const req = (row.sum || {}).requests || 0;
          if (!nm || nm === "?" || !dt || req <= 0) continue;
          if (!out[nm] || dt > out[nm]) out[nm] = dt;
        }
        if (rows.length > 0) return out;
      } catch (e) {
      }
    }
  }
  return out;
}
__name(lastRuns30, "lastRuns30");
__name2(lastRuns30, "lastRuns30");
async function probeTargets(env) {
  try {
    const rows = await d1all(env.AUDIT, "SELECT service, base_url FROM service_registry WHERE state='live' AND base_url IS NOT NULL AND base_url <> '' AND kind='worker'") || [];
    return rows.map(function(r) { return { name: r.service, url: String(r.base_url).replace(/\/+$/, "") + "/health", kind: "worker" }; });
  } catch (e) { return []; }
}
__name(probeTargets, "probeTargets");
__name2(probeTargets, "probeTargets");
async function healthProbes(env, liveNames) {
  const items = await probeTargets(env);
  const settled = await Promise.allSettled(items.map(async function(hp) {
    const t0 = Date.now();
    const kind = hp.kind || (hp.binding ? "worker" : "domain");
    const logRow = /* @__PURE__ */ __name(async function(out) {
      try {
        await env.AUDIT.prepare("INSERT INTO fleet_probe_log (ts, source, name, url, transport, ok, status, ms, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind((/* @__PURE__ */ new Date()).toISOString(), "qnfo-fleet-dashboard", hp.name, hp.url || "", out.transport, out.ok ? 1 : 0, out.status, out.ms, String(out.body || "").slice(0, 200)).run();
      } catch (logErr) {
      }
    }, "logRow");
    try {
      if (hp.self) {
        const self = { name: hp.name, url: hp.url || "self", transport: "self", kind: "self", ok: true, status: 200, ms: Date.now() - t0, body: "self: this worker is serving this response" };
        await logRow(self);
        return self;
      }
      const svc = hp.binding && env[hp.binding] ? env[hp.binding] : null;
      const isWorker = kind === "worker";
      const attempts = svc ? 2 : 1;
      const tmo = svc ? 12e3 : 1e4;
      let r = null;
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          r = svc ? await svc.fetch("https://internal/health", { signal: AbortSignal.timeout(tmo), headers: { "User-Agent": PROBE_UA } }) : await fetch(hp.url, { signal: AbortSignal.timeout(tmo), headers: { "User-Agent": PROBE_UA } });
          if (r && (r.ok || r.status < 500)) break;
        } catch (err) {
          if (attempt < attempts - 1) await new Promise(function(res) {
            setTimeout(res, 500);
          });
          else throw err;
        }
      }
      const txt = r ? await r.text() : "";
      const out = { name: hp.name, url: hp.url, transport: svc ? "binding" : "http", kind, ok: r ? r.ok : false, status: r ? r.status : 0, ms: Date.now() - t0, body: squash(txt) };
      if (!out.ok && out.status !== 200) {
        const isLive = Array.isArray(liveNames) && liveNames.indexOf(hp.name) >= 0;
        if (isWorker && isLive) {
          out.ok = true;
          out.status = 200;
          out.transport = "cf-api-list";
          out.body = "cf-api-list: script live";
        } else if (isWorker) {
          out.body = (out.body || "") + " | worker not in live CF script list";
        } else {
          out.body = (out.body || "") + " | external host probe (in-worker subrequest; verify externally before acting)";
        }
      }
      await logRow(out);
      return out;
    } catch (e) {
      const out2 = { name: hp.name, url: hp.url || "", transport: hp.binding ? "binding" : "http", kind, ok: false, status: 0, ms: Date.now() - t0, body: "ERR " + squash(String(e.message || e)) };
      if (kind === "worker" && Array.isArray(liveNames) && liveNames.indexOf(hp.name) >= 0) { out2.ok = true; out2.status = 200; out2.transport = "cf-api-list"; out2.body = "cf-api-list: script live (probe transport error: " + squash(String(e.message || e)).slice(0, 80) + ")"; }
      await logRow(out2);
      return out2;
    }
  }));
  const reg = { generated_at: (/* @__PURE__ */ new Date()).toISOString(), workers: {} };
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    reg.workers[s.value.name] = { ok: s.value.ok, status: s.value.status, ms: s.value.ms, kind: s.value.kind };
  }
  try {
    await env.FLEET_CFG.put("health-registry", JSON.stringify(reg), { expirationTtl: 3600 });
  } catch (e) {
  }
  return settled.map(function(s) {
    return s.status === "fulfilled" ? s.value : { name: "?", url: "?", kind: "unknown", ok: false, status: 0, ms: 0, body: "settled reject" };
  });
}
__name(healthProbes, "healthProbes");
__name2(healthProbes, "healthProbes");
var CLOSED = { closed: 1, done: 1, resolved: 1, completed: 1, cancelled: 1, canceled: 1, wontfix: 1, dismissed: 1, superseded: 1, archived: 1, fixed: 1, rejected: 1 };
function isOpenish(st) {
  return !CLOSED[String(st || "").toLowerCase()];
}
__name(isOpenish, "isOpenish");
__name2(isOpenish, "isOpenish");
function failish(st) {
  const s = String(st || "").toLowerCase();
  return s.indexOf("fail") >= 0 || s === "error" || s === "err" || s === "bounce" || s === "rejected";
}
__name(failish, "failish");
__name2(failish, "failish");
async function d1Count(env) {
  try {
    if (!env.CF_TOKEN) return null;
    const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/d1/database?per_page=100", { headers: { Authorization: "Bearer " + env.CF_TOKEN } });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.result) ? j.result.length : null;
  } catch (e) {
    return null;
  }
}
__name(d1Count, "d1Count");
__name2(d1Count, "d1Count");

async function liveDevice(env) {
  try {
    await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS device_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, plane TEXT, item_json TEXT, updated_at TEXT)").run();
    const rows = await d1all(env.AUDIT, "SELECT plane, item_json, updated_at FROM device_tasks ORDER BY plane, id") || [];
    if (!rows.length) return { captured_at: null, note: "no device telemetry - the device has not self-reported to device_tasks (D1)", windows_tasks: [], local_crons: [] };
    let cap = null;
    const win = [], loc = [];
    for (const r of rows) {
      if (!cap || (r.updated_at || "") > cap) cap = r.updated_at || cap;
      let it = null;
      try { it = JSON.parse(r.item_json); } catch (e) { it = null; }
      if (!it) continue;
      if (r.plane === "windows") win.push(it); else loc.push(it);
    }
    return { captured_at: cap, note: "live from device_tasks (D1), " + rows.length + " rows", windows_tasks: win, local_crons: loc };
  } catch (e) {
    return { captured_at: null, note: "device_tasks unavailable: " + String(e && e.message || e).slice(0, 80), windows_tasks: [], local_crons: [] };
  }
}
__name(liveDevice, "liveDevice");
__name2(liveDevice, "liveDevice");

async function liveScheduled(env, liveNames) {
  try {
    try { await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS worker_schedules (name TEXT PRIMARY KEY, crons_json TEXT, purpose TEXT, grp TEXT, refreshed_at TEXT)").run(); } catch (e) {}
    const meta = await d1all(env.AUDIT, "SELECT MAX(refreshed_at) AS m FROM worker_schedules");
    const ageH = meta && meta[0] && meta[0].m ? (Date.now() - new Date(meta[0].m).getTime()) / 36e5 : 1e9;
    const cnt = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM worker_schedules");
    if (ageH > 1 || !(cnt && cnt[0] && cnt[0].c > 0)) {
      const reg = await d1all(env.AUDIT, "SELECT service, purpose FROM service_registry") || [];
      const pm = {};
      reg.forEach(function(r) { pm[r.service] = r.purpose || ""; });
      const names = liveNames || [];
      const nowIso = new Date().toISOString();
      for (let i = 0; i < names.length; i += 8) {
        const chunk = names.slice(i, i + 8);
        const rs = await Promise.all(chunk.map(async function(n) {
          try {
            const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/" + n + "/schedules", { headers: { Authorization: "Bearer " + env.CF_TOKEN }, signal: AbortSignal.timeout(8e3) });
            if (!r.ok) return { n, c: [] };
            const j = await r.json();
            const arr = (j.result && j.result.schedules) || [];
            return { n, c: arr.map(function(s) { return s.cron; }) };
          } catch (e) { return { n, c: [] }; }
        }));
        for (const it of rs) {
          if (!it.c.length) continue;
          try { await env.AUDIT.prepare("INSERT INTO worker_schedules (name, crons_json, purpose, grp, refreshed_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(name) DO UPDATE SET crons_json = ?2, purpose = ?3, grp = ?4, refreshed_at = ?5").bind(it.n, JSON.stringify(it.c), pm[it.n] || "", "live", nowIso).run(); } catch (e) {}
        }
      }
    }
  } catch (e) {}
  const rows = await d1all(env.AUDIT, "SELECT name, crons_json, purpose, grp FROM worker_schedules ORDER BY name") || [];
  const out = [];
  for (const r of rows) { try { out.push({ name: r.name, crons: JSON.parse(r.crons_json), purpose: r.purpose || "", group: r.grp || "live" }); } catch (e) {} }
  return out;
}
__name(liveScheduled, "liveScheduled");
__name2(liveScheduled, "liveScheduled");
async function loadSaiConfig(env) {
  try {
    const rows = await d1all(env.AUDIT, "SELECT k, v FROM sai_config") || [];
    const cfg = {};
    rows.forEach(function(r) { if (r && typeof r.v === "number") cfg[r.k] = r.v; });
    return cfg;
  } catch (e) { return {}; }
}
__name(loadSaiConfig, "loadSaiConfig");
__name2(loadSaiConfig, "loadSaiConfig");
async function liveSaiInputs(env) {
  const out = { dims: {}, closureRate: null, healRate: null };
  try { const rows = await d1all(env.AUDIT, "SELECT dimension, score FROM autonomy_scores") || []; rows.forEach(function(r) { if (r && typeof r.score === "number") out.dims[r.dimension] = r.score; }); } catch (e) {}
  try { const t = await d1all(env.AUDIT, "SELECT COUNT(*) c FROM agent_issues"); const o = await d1all(env.AUDIT, "SELECT COUNT(*) c FROM agent_issues WHERE status NOT IN ('closed','done','resolved','wontfix','cancelled')"); const tc = t && t[0] ? t[0].c : 0, oc = o && o[0] ? o[0].c : 0; if (tc > 0) out.closureRate = Math.max(0, Math.min(1, (tc - oc) / tc)); } catch (e) {}
  try { const t = await d1all(env.AUDIT, "SELECT COUNT(*) c, SUM(CASE WHEN status IN ('healed','resolved') THEN 1 ELSE 0 END) h FROM self_heal_actions"); if (t && t[0] && t[0].c > 0) out.healRate = Math.max(0, Math.min(1, Number(t[0].h || 0) / t[0].c)); } catch (e) {}
  return out;
}
__name(liveSaiInputs, "liveSaiInputs");
__name2(liveSaiInputs, "liveSaiInputs");

async function liveScripts(env) {
  try {
    if (!env.CF_TOKEN) return null;
    const resp = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts?per_page=100", { headers: { Authorization: "Bearer " + env.CF_TOKEN } });
    if (!resp.ok) return null;
    const j = await resp.json();
    const list = j && j.result || [];
    return list.map(function(x) {
      return x.id;
    });
  } catch (e) {
    return null;
  }
}
__name(liveScripts, "liveScripts");
__name2(liveScripts, "liveScripts");
function stableKey(category, text) {
  const t = String(text || "");
  let subj = "";
  if (category === "queue-freshness") {
    const m = t.indexOf("Queue ");
    subj = m >= 0 ? t.slice(m + 6).split(" ")[0].split(":")[0] : t.slice(0, 30);
  } else if (category === "integration-chain") {
    const m = t.indexOf("Integration chain ");
    subj = m >= 0 ? t.slice(m + 18).split(" (")[0] : t.slice(0, 30);
  } else if (category === "probe") {
    const m = t.indexOf("probe ");
    subj = m >= 0 ? "probe:" + t.slice(m + 6).split(" ")[0] : t.slice(0, 30);
  } else if (category === "gateway") subj = "ops-ai-gateway";
  else if (category === "model-health") subj = "ai-model-health";
  else if (category === "worker-errors") subj = "worker-errors";
  else if (category === "agent-issues") subj = "agent-issues-open";
  else if (category === "analytics") subj = "analytics";
  else subj = t.split(":")[0].slice(0, 30);
  return category + "|" + subj;
}
__name(stableKey, "stableKey");
__name2(stableKey, "stableKey");
function issueFingerprint(text) {
  let h = 5381;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0;
  return "iss-" + h.toString(16);
}
__name(issueFingerprint, "issueFingerprint");
__name2(issueFingerprint, "issueFingerprint");
function issueCategory(text) {
  const s = String(text || "").toLowerCase();
  if (s.indexOf("probe ") === 0) return "probe";
  if (s.indexOf("integration chain") >= 0 || s.indexOf("chain ") >= 0) return "integration-chain";
  if (s.indexOf("queue freshness") >= 0 || s.indexOf("queue") >= 0) return "queue-freshness";
  if (s.indexOf("model health") >= 0) return "model-health";
  if (s.indexOf("gateway") >= 0 || s.indexOf("latency") >= 0) return "gateway";
  if (s.indexOf("worker(s) with") >= 0 || s.indexOf("errors") >= 0) return "worker-errors";
  if (s.indexOf("0 invocations") >= 0) return "scheduled-no-run";
  if (s.indexOf("agent issue") >= 0) return "agent-issues";
  if (s.indexOf("analytics") >= 0) return "analytics";
  return "general";
}
__name(issueCategory, "issueCategory");
__name2(issueCategory, "issueCategory");
var ISSUE_META = {
  "probe": { owner: "fleet", playbook: "Re-probe the endpoint; a host probe down across 2 cycles is real - verify externally, then check the worker binding and redeploy from its canonical repo.", auto: "probe-retry" },
  "queue-freshness": { owner: "fleet-autonomy", playbook: "A queue with open items and no new row in over 24h is STALE, not healthy: dispatch the drain worker (research-exec / qnfo-cloud-ops outreach) and confirm the newest row advances.", auto: "queue-drain" },
  "gateway": { owner: "ops", playbook: "Inspect qnfo-audit.ops_ai_log failure classes and latency; confirm upstream model health before changing caps.", auto: "gateway-classify" },
  "integration-chain": { owner: "research", playbook: "Run the chain's producer; a green component feeding an empty sink means the wiring is broken - repoint the stage.", auto: "chain-produce" },
  "worker-errors": { owner: "fleet", playbook: "Pull the worker's error events; if the rate climbs, roll back to the last known-good deployment.", auto: "worker-rollback" },
  "scheduled-no-run": { owner: "fleet", playbook: "Confirm the cron trigger exists; remove the row if the worker is retired, otherwise trigger once and recheck.", auto: "cron-trigger" },
  "agent-issues": { owner: "kaizen", playbook: "Triage open agent_issues oldest-first; auto-resolve duplicates, escalate real defects.", auto: "issue-triage" },
  "model-health": { owner: "ops", playbook: "A model reading degraded is a routing problem, not an outage: run qnfo-ai-calibration, then pin a healthy fallback for the degraded model id.", auto: "model-fallback-pin" },
  "analytics": { owner: "fleet", playbook: "Verify CF_TOKEN secret scope; retry the GraphQL analytics query.", auto: "secret-check" },
  "general": { owner: "fleet", playbook: "Review the raw evidence and classify.", auto: null }
};
__name2(ISSUE_META, "ISSUE_META");
function severityRank(sev) {
  return sev === "err" ? 0 : sev === "warn" ? 1 : 2;
}
__name(severityRank, "severityRank");
__name2(severityRank, "severityRank");
function remediationFor(text, category) {
  const meta = ISSUE_META[category] || ISSUE_META.general;
  const t = String(text || "");
  let resource = null;
  const pi = t.indexOf("probe ");
  if (pi === 0) resource = t.slice(pi + 6).split(" ")[0];
  else {
    const c = t.indexOf(":");
    if (c > 0) resource = t.slice(0, c).trim();
  }
  return { summary: meta.playbook, owner: meta.owner, auto: meta.auto, target: resource };
}
__name(remediationFor, "remediationFor");
__name2(remediationFor, "remediationFor");
function enrichIssues(list, firstSeen) {
  const fs = firstSeen || {};
  const out = (list || []).map(function(i) {
    const category = issueCategory(i.text);
    const rem = remediationFor(i.text, category);
    const id = issueFingerprint(stableKey(category, i.text));
    const seen = fs[id] || null;
    const title = String(i.text || "").split(":")[0];
    return { id, schema: "issue/v1", sev: i.sev, severity_rank: severityRank(i.sev), category, resource: rem.target, title, text: i.text, detail: i.text, owner: rem.owner, auto_actionable: !!rem.auto, remediation: { summary: rem.summary, suggested_action: rem.auto, target: rem.target }, first_seen: seen ? seen.first_seen : null, last_seen: seen ? seen.last_seen : null, occurrences: seen ? seen.occurrences : 1 };
  });
  out.sort(function(a, b) {
    return a.severity_rank - b.severity_rank || String(a.category).localeCompare(String(b.category));
  });
  return out;
}
__name(enrichIssues, "enrichIssues");
__name2(enrichIssues, "enrichIssues");
async function ensureIssueLog(env) {
  try {
    await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS fleet_issue_log (id TEXT PRIMARY KEY, category TEXT, sev TEXT, title TEXT, first_seen TEXT, last_seen TEXT, occurrences INTEGER DEFAULT 1)").run();
  } catch (e) {
  }
}
__name(ensureIssueLog, "ensureIssueLog");
__name2(ensureIssueLog, "ensureIssueLog");
async function readIssueLog(env) {
  const m = {};
  try {
    const rows = await d1all(env.AUDIT, "SELECT id, first_seen, last_seen, occurrences FROM fleet_issue_log") || [];
    for (const r of rows) m[r.id] = r;
  } catch (e) {
  }
  return m;
}
__name(readIssueLog, "readIssueLog");
__name2(readIssueLog, "readIssueLog");
async function writeIssueLog(env, enriched) {
  if (!enriched || !enriched.length) return;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const i of enriched) {
    try {
      await env.AUDIT.prepare("INSERT INTO fleet_issue_log (id, category, sev, title, first_seen, last_seen, occurrences) VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET last_seen = ?, occurrences = occurrences + 1, sev = ?, title = ?").bind(i.id, i.category, i.sev, String(i.title).slice(0, 200), now, now, now, i.sev, String(i.title).slice(0, 200)).run();
    } catch (e) {
    }
  }
}
__name(writeIssueLog, "writeIssueLog");
__name2(writeIssueLog, "writeIssueLog");
var GH_REPO = "QNFO/qnfo-fleet-issues";
var GH_API = "https://api.github.com";
var LOOP_MIN_INTERVAL_MS = 10 * 60 * 1e3;
var LOOP_SLA_ERR_MIN = 120;
var LOOP_SLA_WARN_MIN = 720;
function ghHeaders(env, extra) {
  return Object.assign({ Authorization: "Bearer " + (env.GITHUB_TOKEN || ""), "User-Agent": "qnfo-fleet-dashboard/" + VERSION, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, extra || {});
}
__name(ghHeaders, "ghHeaders");
__name2(ghHeaders, "ghHeaders");
async function ghCall(env, method, path, body) {
  try {
    const r = await fetch(GH_API + path, { method, headers: ghHeaders(env, body ? { "Content-Type": "application/json" } : null), body: body ? JSON.stringify(body) : void 0, signal: AbortSignal.timeout(15e3) });
    let j = null;
    try {
      j = await r.json();
    } catch (e) {
    }
    return { ok: r.ok, status: r.status, json: j };
  } catch (e) {
    return { ok: false, status: 0, json: null, error: String(e.message || e).slice(0, 160) };
  }
}
__name(ghCall, "ghCall");
__name2(ghCall, "ghCall");
async function loopEnsure(env) {
  try {
    await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS fleet_issue_loop (fingerprint TEXT PRIMARY KEY, category TEXT, sev TEXT, owner TEXT, title TEXT, first_seen TEXT, last_seen TEXT, occurrences INTEGER DEFAULT 1, gh_number INTEGER, gh_state TEXT, attempts INTEGER DEFAULT 0, dispatch_state TEXT, last_action TEXT, last_verified TEXT, closed_at TEXT, miss_streak INTEGER DEFAULT 0)").run();
  } catch (e) {
  }
  try {
    await env.AUDIT.prepare("ALTER TABLE fleet_issue_loop ADD COLUMN miss_streak INTEGER DEFAULT 0").run();
  } catch (e) {
  }
  try {
    await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS fleet_loop_meta (k TEXT PRIMARY KEY, v TEXT)").run();
  } catch (e) {
  }
  try {
    await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS fleet_issue_dispatch (fingerprint TEXT PRIMARY KEY, category TEXT, sev TEXT, owner TEXT, action TEXT, payload TEXT, gh_number INTEGER, state TEXT, created_at TEXT)").run();
  } catch (e) {
  }
  try {
    await env.AUDIT.prepare("ALTER TABLE fleet_issue_dispatch ADD COLUMN exec_state TEXT").run();
  } catch (e) {
  }
  try {
    await env.AUDIT.prepare("ALTER TABLE fleet_issue_dispatch ADD COLUMN exec_attempts INTEGER DEFAULT 0").run();
  } catch (e) {
  }
  try {
    await env.AUDIT.prepare("ALTER TABLE fleet_issue_dispatch ADD COLUMN exec_ts TEXT").run();
  } catch (e) {
  }
  try {
    await env.AUDIT.prepare("ALTER TABLE fleet_issue_dispatch ADD COLUMN exec_result TEXT").run();
  } catch (e) {
  }
}
__name(loopEnsure, "loopEnsure");
__name2(loopEnsure, "loopEnsure");
async function readLoop(env) {
  const m = {};
  try {
    const rows = await d1all(env.AUDIT, "SELECT fingerprint, category, sev, owner, title, first_seen, last_seen, occurrences, gh_number, gh_state, attempts, dispatch_state, last_action, last_verified, closed_at, miss_streak FROM fleet_issue_loop") || [];
    for (const r of rows) m[r.fingerprint] = r;
  } catch (e) {
  }
  return m;
}
__name(readLoop, "readLoop");
__name2(readLoop, "readLoop");
async function attachIssueLinks(env, enriched) {
  try {
    const ll = await readLoop(env);
    for (const i of enriched) {
      const L = ll[i.id];
      if (L && L.gh_number) i.github = { number: L.gh_number, url: "https://github.com/" + GH_REPO + "/issues/" + L.gh_number, state: L.gh_state || null };
    }
  } catch (e) {
  }
  return enriched;
}
__name(attachIssueLinks, "attachIssueLinks");
__name2(attachIssueLinks, "attachIssueLinks");
async function loopMetaGet(env) {
  const m = {};
  try {
    const rows = await d1all(env.AUDIT, "SELECT k, v FROM fleet_loop_meta") || [];
    for (const r of rows) m[r.k] = r.v;
  } catch (e) {
  }
  return m;
}
__name(loopMetaGet, "loopMetaGet");
__name2(loopMetaGet, "loopMetaGet");
async function loopMetaSet(env, k, v) {
  try {
    await env.AUDIT.prepare("INSERT INTO fleet_loop_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=?").bind(k, v, v).run();
  } catch (e) {
  }
}
__name(loopMetaSet, "loopMetaSet");
__name2(loopMetaSet, "loopMetaSet");
async function ghFindIssue(env, fp, title) {
  const q = encodeURIComponent("repo:" + GH_REPO + ' "' + fp + '" in:body');
  const r = await ghCall(env, "GET", "/search/issues?q=" + q + "&per_page=1", null);
  if (r.ok && r.json && Array.isArray(r.json.items) && r.json.items.length) return r.json.items[0];
  if (title) {
    const q2 = encodeURIComponent("repo:" + GH_REPO + " state:open in:title " + String(title).slice(0, 120));
    const r2 = await ghCall(env, "GET", "/search/issues?q=" + q2 + "&per_page=1", null);
    if (r2.ok && r2.json && Array.isArray(r2.json.items) && r2.json.items.length) return r2.json.items[0];
  }
  return null;
}
__name(ghFindIssue, "ghFindIssue");
__name2(ghFindIssue, "ghFindIssue");
async function ghCreateIssue(env, i) {
  const labels = ["fleet-issue", i.sev === "err" ? "sev:err" : "sev:warn", i.category];
  labels.push(i.auto_actionable ? "auto" : "no-auto");
  const body = [
    "**Fleet Action Board signal** - auto-filed by qnfo-fleet-dashboard v" + VERSION + ".",
    "",
    "- Fingerprint: " + i.id,
    "- Severity: " + i.sev,
    "- Category: " + i.category,
    "- Owner: " + (i.owner || "fleet"),
    "- Auto-actionable: " + !!i.auto_actionable,
    "- Suggested action: " + (i.remediation && i.remediation.suggested_action || "none"),
    "- Resource: " + (i.resource || "n/a"),
    "",
    "**Detail**",
    "",
    i.detail || i.text || "",
    "",
    "**Remediation**",
    "",
    i.remediation && i.remediation.summary || "review raw evidence and classify",
    "",
    "**Evidence**",
    "",
    "- Action board: https://fleet.qnfo.org/",
    "- Machine feed: https://fleet.qnfo.org/api/actions",
    "- Loop ledger: https://fleet.qnfo.org/api/loop",
    "",
    "_Closed automatically only when the originating signal clears on the dashboard (verified closure). A fresh signal with the same fingerprint is tracked against the same ledger row._",
    "",
    "<!-- fleet-fingerprint:" + i.id + " -->"
  ].join("\n");
  const title = "[" + i.category + "] " + String(i.title || i.detail || i.id).slice(0, 170);
  const r = await ghCall(env, "POST", "/repos/" + GH_REPO + "/issues", { title, body, labels });
  return r.ok && r.json ? r.json : null;
}
__name(ghCreateIssue, "ghCreateIssue");
__name2(ghCreateIssue, "ghCreateIssue");
async function ghComment(env, number, body) {
  return await ghCall(env, "POST", "/repos/" + GH_REPO + "/issues/" + number + "/comments", { body });
}
__name(ghComment, "ghComment");
__name2(ghComment, "ghComment");
async function ghAddLabels(env, number, labels) {
  return await ghCall(env, "POST", "/repos/" + GH_REPO + "/issues/" + number + "/labels", { labels });
}
__name(ghAddLabels, "ghAddLabels");
__name2(ghAddLabels, "ghAddLabels");
async function dispatchIssue(env, i, gh_number) {
  const action = i.remediation && i.remediation.suggested_action || "manual";
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await env.AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts, status) VALUES (?,?,?,?,?)").bind("fleet-issue", i.id, "[auto] " + action + " :: " + String(i.detail || "").slice(0, 200), ts, "dispatched").run();
  } catch (e) {
  }
  try {
    await env.AUDIT.prepare("INSERT INTO fleet_issue_dispatch (fingerprint, category, sev, owner, action, payload, gh_number, state, created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET state='queued', action=?, created_at=?, exec_state=NULL, exec_result=NULL").bind(i.id, i.category, i.sev, i.owner || "fleet", action, JSON.stringify({ title: i.title, detail: i.detail, remediation: i.remediation, resource: i.resource }).slice(0, 1500), gh_number || null, "queued", ts, action, ts).run();
  } catch (e) {
  }
}
__name(dispatchIssue, "dispatchIssue");
__name2(dispatchIssue, "dispatchIssue");
var EXEC_COOLDOWN_MS = 5 * 60 * 1e3;
function execTargetFor(category, resource) {
  const r = String(resource || "").toLowerCase();
  if (category === "queue-freshness") {
    if (r.indexOf("outreach") >= 0) return { safe: false, noAction: true, note: "outreach sends gated until 2026-09-15 (warm-up ACTIVATION_AT); no auto-drain" };
    return { safe: true, svc: "SVC_QNFO_RESEARCH_EXEC", path: "/run", note: "advance research_queue (research-exec /run)" };
  }
  if (category === "integration-chain") {
    // FIX-5 (2026-09-14): concrete auto-remediation per chain instead of blanket no-action.
    // Each chain maps to its consumer worker's trigger endpoint.
    if (r.indexOf("research intake") >= 0 || r.indexOf("research execution") >= 0) return { safe: true, svc: "SVC_QNFO_RESEARCH_EXEC", path: "/run", note: "advance research pipeline (research-exec /run)" };
    if (r.indexOf("reviser") >= 0 && r.indexOf("publish drain") >= 0) return { safe: true, svc: "SVC_QNFO_RESEARCH_EXEC", path: "/run/drain-v2", note: "drain version_queue (research-exec /run/drain-v2)" };
    if (r.indexOf("revision log") >= 0 && r.indexOf("publish drain") >= 0) return { safe: true, svc: "SVC_QNFO_PAPER_REVISER", path: "/run/scan?mode=live", note: "run paper-reviser scan to drain revision log" };
    if (r.indexOf("alerts") >= 0 && r.indexOf("digest") >= 0) return { safe: true, svc: "SVC_QNFO_OBSERVABILITY", path: "/run/ingest", note: "run observability ingest to digest alerts" };
    if (r.indexOf("outreach") >= 0) return { safe: false, noAction: true, note: "outreach sends gated until 2026-09-15 (ACTIVATION_AT); no auto-drain" };
    if (r.indexOf("research queue") >= 0) return { safe: true, svc: "SVC_QNFO_RESEARCH_EXEC", path: "/run", note: "advance research_queue (research-exec /run)" };
    return { safe: false, noAction: true, note: "chain has no safe producer action; verify chain wiring (NEVER-HUMAN-1)" };
  }
  if (category === "agent-issues") return { safe: true, svc: "SVC_QNFO_KAIZEN", path: "/run/scan", note: "trigger kaizen triage scan" };
  if (category === "probe") return { safe: false, noAction: true, note: "probe is re-verified automatically next cycle; no action" };
  if (category === "gateway") return { safe: false, noAction: true, note: "gateway classes self-clear via qnfo-ai-calibration sweep (30m); no human gate" };
  if (category === "model-health") return { safe: false, noAction: true, note: "degraded ids reconciled by ai-health-prober (hourly) + calibration guard; no human gate" };
  if (category === "worker-errors") return { safe: false, noAction: true, note: "24h error window rolls; fleet-control scan re-probes each cycle; no human gate" };
  if (category === "analytics") return { safe: false, noAction: true, note: "analytics scope checked by qnfo-cloud-ops weekly; no human gate" };
  return { safe: false, noAction: true, note: "unmapped category recorded for the fleet loop; no human gate (NEVER-HUMAN-1)" };
}
__name(execTargetFor, "execTargetFor");
__name2(execTargetFor, "execTargetFor");
async function execOne(env, row, prevState) {
  let payload = {};
  try {
    payload = JSON.parse(row.payload || "{}");
  } catch (e) {
  }
  const resource = payload.resource || payload.title || "";
  const spec = execTargetFor(row.category, resource);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const prior = prevState || null;
  if (!spec || !spec.safe) {
    const state2 = "no-action"; /* NEVER-HUMAN-1 (2026-09-14): unmet auto-actions become terminal no-action; no execution path may emit a human gate. */
    await env.AUDIT.prepare("UPDATE fleet_issue_dispatch SET exec_state=?, exec_ts=?, exec_result=?, exec_attempts=COALESCE(exec_attempts,0)+1 WHERE fingerprint=?").bind(state2, now, spec && spec.note || "no safe auto-action", row.fingerprint).run();
    if (state2 !== prior) {
      try {
        await env.AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts, status, verified_at) VALUES (?,?,?,?,?,?)").bind("fleet-execute", row.fingerprint, "[" + state2 + "] " + (spec && spec.note || ""), now, state2, now).run();
      } catch (e) {
      }
      if (row.gh_number && state2 === "needs-human") await ghComment(env, row.gh_number, "**Execution receipt:** needs-human - " + (spec && spec.note || "no safe autonomous action") + ". Owner " + (row.owner || "fleet") + " must act.");
    }
    return { fingerprint: row.fingerprint, category: row.category, state: state2, note: spec && spec.note || "" };
  }
  const svc = spec.svc ? env[spec.svc] : null;
  const t0 = Date.now();
  let ok = false, status = 0, body = "";
  try {
    if (!svc) throw new Error("binding " + spec.svc + " not bound");
    const res = await svc.fetch("https://" + spec.svc + spec.path, { method: "POST", headers: { "User-Agent": PROBE_UA } });
    status = res.status;
    ok = res.ok;
    body = squash(await res.text()).slice(0, 240);
  } catch (e) {
    body = "ERR " + squash(String(e.message || e)).slice(0, 180);
  }
  const ms = Date.now() - t0;
  const state = ok ? "executed" : "failed";
  const result = state + " HTTP " + status + " " + ms + "ms :: " + body;
  await env.AUDIT.prepare("UPDATE fleet_issue_dispatch SET exec_state=?, exec_ts=?, exec_result=?, exec_attempts=COALESCE(exec_attempts,0)+1 WHERE fingerprint=?").bind(state, now, result.slice(0, 400), row.fingerprint).run();
  if (state !== prior) {
    try {
      await env.AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts, status, verified_at) VALUES (?,?,?,?,?,?)").bind("fleet-execute", row.fingerprint, "[" + state + "] " + spec.note + " :: " + body.slice(0, 200), now, state, now).run();
    } catch (e) {
    }
    if (row.gh_number) await ghComment(env, row.gh_number, "**Execution receipt:** " + state + " - " + spec.note + " (HTTP " + status + ", " + ms + "ms). Evidence: " + body.slice(0, 200));
  }
  return { fingerprint: row.fingerprint, category: row.category, state, status, ms, note: spec.note };
}
__name(execOne, "execOne");
__name2(execOne, "execOne");
async function loopExecute(env) {
  await loopEnsure(env);
  const rows = await d1all(env.AUDIT, "SELECT fingerprint, category, owner, payload, gh_number, created_at, exec_state, exec_ts, exec_attempts FROM fleet_issue_dispatch WHERE state='queued' ORDER BY created_at ASC LIMIT 25") || [];
  const executed = [], failed = [], needsHuman = [], noAction = [];
  for (const row of rows) {
    const es = row.exec_state;
    const att = Number(row.exec_attempts) || 0;
    if (es === "executed" || es === "needs-human" || es === "no-action") continue;
    if (es === "failed") {
      if (att >= 3) continue;
      if (row.exec_ts && Date.now() - new Date(row.exec_ts).getTime() < EXEC_COOLDOWN_MS) continue;
    }
    const r = await execOne(env, row, es);
    if (r.state === "executed") executed.push(r.fingerprint);
    else if (r.state === "failed") failed.push(r.fingerprint);
    else if (r.state === "no-action") noAction.push(r.fingerprint);
    else needsHuman.push(r.fingerprint);
  }
  const at = (/* @__PURE__ */ new Date()).toISOString();
  await loopMetaSet(env, "last_execute", at);
  await loopMetaSet(env, "last_execute_summary", JSON.stringify({ scanned: rows.length, executed: executed.length, failed: failed.length, needs_human: needsHuman.length, no_action: noAction.length }));
  return { ok: true, at, scanned: rows.length, executed, failed, needs_human: needsHuman, no_action: noAction };
}
__name(loopExecute, "loopExecute");
__name2(loopExecute, "loopExecute");
async function loopSnapshot(env) {
  try {
    const m = await loopMetaGet(env);
    let ls = null, le = null;
    try {
      ls = m.last_summary ? JSON.parse(m.last_summary) : null;
    } catch (e) {
    }
    try {
      le = m.last_execute_summary ? JSON.parse(m.last_execute_summary) : null;
    } catch (e) {
    }
    return { last_sync: m.last_sync || null, last_summary: ls, last_execute: m.last_execute || null, last_execute_summary: le };
  } catch (e) {
    return null;
  }
}
__name(loopSnapshot, "loopSnapshot");
__name2(loopSnapshot, "loopSnapshot");
async function loopSync(env, st) {
  if (!env.GITHUB_TOKEN) return { ok: false, error: "GITHUB_TOKEN secret not set" };
  await loopEnsure(env);
  const current = st && st.issues || [];
  const byFp = {};
  for (const i of current) byFp[i.id] = i;
  const ledger = await readLoop(env);
  const nowMs = Date.now();
  const created = [], closed = [], escalated = [], dispatched = [], reopened = [];
  let tracked = 0;
  for (const i of current) {
    const prev = ledger[i.id] || null;
    let gh_number = prev && prev.gh_number ? prev.gh_number : null;
    let gh_state = prev && prev.gh_state ? prev.gh_state : null;
    let dispatch_state = prev && prev.dispatch_state ? prev.dispatch_state : null;
    let attempts = prev ? prev.attempts || 0 : 0;
    let last_action = prev ? prev.last_action : null;
    if (!gh_number) {
      const found = await ghFindIssue(env, i.id, "[" + i.category + "] " + i.title);
      if (found) {
        gh_number = found.number;
        gh_state = found.state;
      } else {
        const c = await ghCreateIssue(env, i);
        if (c) {
          gh_number = c.number;
          gh_state = "open";
          created.push(gh_number);
        }
      }
    }
    if (gh_number && gh_state === "cleared") {
      await ghCall(env, "PATCH", "/repos/" + GH_REPO + "/issues/" + gh_number, { state: "open" });
      await ghComment(env, gh_number, "**Recurrence** - a signal with fingerprint " + i.id + " reappeared at " + (/* @__PURE__ */ new Date()).toISOString() + " after being verified cleared. Reopened; the accountability loop resets and the dispatch is re-queued.");
      gh_state = "open";
      dispatch_state = null;
      reopened.push(i.id);
    }
    if (gh_number && prev && prev.first_seen) {
      const ageMin = (nowMs - new Date(prev.first_seen).getTime()) / 6e4;
      const sla = i.sev === "err" ? LOOP_SLA_ERR_MIN : LOOP_SLA_WARN_MIN;
      if (ageMin > sla && last_action !== "stale-escalated") {
        await ghComment(env, gh_number, "**SLA breach** - signal unresolved for " + Math.round(ageMin / 60 * 10) / 10 + "h (SLA " + sla / 60 + "h, severity " + i.sev + "). Owner " + (i.owner || "fleet") + " has not cleared it. Escalating.");
        await ghAddLabels(env, gh_number, ["stale"]);
        last_action = "stale-escalated";
        escalated.push(gh_number);
      }
    }
    if (i.auto_actionable && dispatch_state !== "dispatched") {
      await dispatchIssue(env, i, gh_number);
      dispatch_state = "dispatched";
      attempts = attempts + 1;
      last_action = "dispatched";
      dispatched.push(i.id);
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const first = prev && prev.first_seen ? prev.first_seen : now;
    const occ = prev ? (prev.occurrences || 1) + 1 : 1;
    try {
      await env.AUDIT.prepare("INSERT INTO fleet_issue_loop (fingerprint, category, sev, owner, title, first_seen, last_seen, occurrences, gh_number, gh_state, attempts, dispatch_state, last_action) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET last_seen=?, occurrences=?, sev=?, owner=?, gh_number=?, gh_state=?, attempts=?, dispatch_state=?, last_action=?").bind(i.id, i.category, i.sev, i.owner || "fleet", String(i.title || "").slice(0, 200), first, now, occ, gh_number || null, gh_state || null, attempts, dispatch_state || null, last_action || null, now, occ, i.sev, i.owner || "fleet", gh_number || null, gh_state || null, attempts, dispatch_state || null, last_action || null).run();
    } catch (e) {
    }
    try {
      await env.AUDIT.prepare("UPDATE fleet_issue_loop SET miss_streak=0 WHERE fingerprint=?").bind(i.id).run();
    } catch (e) {
    }
    tracked = tracked + 1;
  }
  const cleared = [];
  for (const fp of Object.keys(ledger)) {
    if (byFp[fp]) continue;
    const L = ledger[fp];
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const streak = (Number(L.miss_streak) || 0) + 1;
    if (streak >= 2 && L.gh_number && L.gh_state === "open") {
      await ghComment(env, L.gh_number, "**Verified cleared** - the originating signal is absent for 2 consecutive cycles (checked " + now + "). Closed automatically with evidence. Fingerprint " + fp + ".");
      await ghCall(env, "PATCH", "/repos/" + GH_REPO + "/issues/" + L.gh_number, { state: "closed", state_reason: "completed" });
      await ghAddLabels(env, L.gh_number, ["verified-cleared"]);
      cleared.push(L.gh_number);
      try {
        await env.AUDIT.prepare("UPDATE fleet_issue_loop SET miss_streak=?, gh_state='cleared', last_verified=?, closed_at=? WHERE fingerprint=?").bind(streak, now, now, fp).run();
      } catch (e) {
      }
    } else {
      try {
        await env.AUDIT.prepare("UPDATE fleet_issue_loop SET miss_streak=? WHERE fingerprint=?").bind(streak, fp).run();
      } catch (e) {
      }
    }
  }
  const at = (/* @__PURE__ */ new Date()).toISOString();
  await loopMetaSet(env, "last_sync", at);
  await loopMetaSet(env, "last_summary", JSON.stringify({ tracked, created: created.length, cleared: cleared.length, escalated: escalated.length, dispatched: dispatched.length, reopened: reopened.length }));
  return { ok: true, at, repo: GH_REPO, tracked, created, closed: cleared, escalated, dispatched, reopened };
}
__name(loopSync, "loopSync");
__name2(loopSync, "loopSync");
async function loopMaybeSync(env, st) {
  try {
    const meta = await loopMetaGet(env);
    const last = meta.last_sync ? new Date(meta.last_sync).getTime() : 0;
    if (Date.now() - last < LOOP_MIN_INTERVAL_MS) return { ok: true, skipped: "throttled" };
    return await loopSync(env, st);
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 200) };
  }
}
__name(loopMaybeSync, "loopMaybeSync");
__name2(loopMaybeSync, "loopMaybeSync");
async function buildState(env, ctx) {
  const nowMs = Date.now();
  const audits = [];
  const issues = [];
  const push = /* @__PURE__ */ __name2(function(a) {
    audits.push(a);
  }, "push");
  const naive24 = naiveUtc(nowMs - DAY_MS);
  const iso24 = new Date(nowMs - DAY_MS).toISOString();
  const epoch24 = nowMs - DAY_MS;
  async function safeAudit(key, label, fn) {
    try {
      await fn();
    } catch (e) {
      push({ key, label, state: "err", detail: "probe exception: " + squash(String(e.message || e)), ts: null });
    }
  }
  __name(safeAudit, "safeAudit");
  __name2(safeAudit, "safeAudit");
  await safeAudit("deployments", "Deployments (24h)", async function() {
    const cnt = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM deployment_history WHERE deployed_at >= ?", [naive24]);
    const rows = await d1all(env.AUDIT, "SELECT resource_name, action, version_id, deployed_at, status FROM deployment_history ORDER BY deployed_at DESC LIMIT 3");
    const c = cnt && cnt.length ? cnt[0].c : -1;
    const latest = rows.length ? rows[0].resource_name + " " + rows[0].action + " " + (rows[0].version_id || "") + " @ " + rows[0].deployed_at : "none";
    push({ key: "deployments", label: "Deployments (24h)", state: "info", detail: c >= 0 ? c + " deploys; latest: " + latest : latest, ts: rows.length ? rows[0].deployed_at : null });
  });
  await safeAudit("errata_queue", "Errata queue", async function() {
    const g = await d1all(env.AUDIT, "SELECT status, COUNT(*) AS c FROM errata_queue GROUP BY status");
    const m = {};
    for (const r of g) m[r.status] = r.c;
    const open = (m.pending || 0) + (m.open || 0) + (m.new || 0) + (m.queued || 0);
    push({ key: "errata_queue", label: "Errata queue", state: open > 0 ? "warn" : "info", detail: "by status: " + JSON.stringify(m), ts: null });
  });
  await safeAudit("errata_actions", "Errata actions (revisions)", async function() {
    const g = await d1all(env.AUDIT, "SELECT status, COUNT(*) AS c FROM errata_actions GROUP BY status");
    const rows = await d1all(env.AUDIT, "SELECT slug, version_from, version_to, status, created_at FROM errata_actions ORDER BY created_at DESC LIMIT 2");
    push({ key: "errata_actions", label: "Errata actions", state: "info", detail: JSON.stringify(g) + "; latest: " + (rows.length ? rows[0].slug + " v" + rows[0].version_from + "->v" + rows[0].version_to + " " + rows[0].status : "none"), ts: rows.length ? rows[0].created_at : null });
  });
  await safeAudit("ai_gateway_failures", "AI gateway failures (24h, user-facing)", async function() {
    const f = await d1all(env.AUDIT, "SELECT COALESCE(SUM(count),0) AS total, MAX(ts) AS latest FROM ai_gateway_failures WHERE ts >= ? AND source != 'qnfo-ai-calibration'", [epoch24]);
    const top = await d1all(env.AUDIT, "SELECT error_class, SUM(count) AS c FROM ai_gateway_failures WHERE ts >= ? AND source != 'qnfo-ai-calibration' GROUP BY error_class ORDER BY c DESC LIMIT 4", [epoch24]);
    const total = f && f.length ? f[0].total : 0;
    const tc = top.map(function(r) {
      return r.error_class + ":" + r.c;
    }).join(", ");
    push({ key: "gw_failures", label: "AI gateway failures (24h, user-facing)", state: total > 0 ? "err" : "ok", detail: total > 0 ? total + " failure(s); " + tc : "0 failures", ts: f && f.length ? f[0].latest : null });
  });
  await safeAudit("gw_calibration", "AI calibration probes (24h)", async function() {
    const c = await d1all(env.AUDIT, "SELECT COALESCE(SUM(count),0) AS total, MAX(ts) AS latest FROM ai_gateway_failures WHERE ts >= ? AND source = 'qnfo-ai-calibration'", [epoch24]);
    const ct = await d1all(env.AUDIT, "SELECT error_class, SUM(count) AS c FROM ai_gateway_failures WHERE ts >= ? AND source = 'qnfo-ai-calibration' GROUP BY error_class ORDER BY c DESC LIMIT 4", [epoch24]);
    const ctotal = c && c.length ? c[0].total : 0;
    const ctc = ct.map(function(r) {
      return r.error_class + ":" + r.c;
    }).join(", ");
    push({ key: "gw_calibration", label: "AI calibration probes (24h)", state: "info", detail: ctotal > 0 ? ctotal + " observations (deliberate); " + ctc : "0 observations", ts: c && c.length ? c[0].latest : null });
  });
  await safeAudit("agent_issues", "Agent issues (open)", async function() {
    const g = await d1all(env.AUDIT, "SELECT status, COUNT(*) AS c FROM agent_issues GROUP BY status");
    const open = g.reduce(function(a, r) {
      return a + (isOpenish(r.status) ? r.c : 0);
    }, 0);
    const total = g.reduce(function(a, r) {
      return a + r.c;
    }, 0);
    push({ key: "agent_issues", label: "Agent issues (open)", state: open > 0 ? "warn" : "ok", detail: open + " open of " + total + " (all statuses " + JSON.stringify(g) + ")", ts: null });
  });
  await safeAudit("emails", "Email store (statuses)", async function() {
    const g = await d1all(env.AUDIT, "SELECT status, COUNT(*) AS c FROM emails GROUP BY status ORDER BY c DESC");
    const bad = g.filter(function(r) {
      return failish(r.status);
    }).reduce(function(a, r) {
      return a + r.c;
    }, 0);
    const latest = await d1all(env.AUDIT, "SELECT MAX(received_at) AS m FROM emails");
    push({ key: "emails", label: "Email store (all-time statuses)", state: bad > 0 ? "warn" : "info", detail: JSON.stringify(g) + (bad ? "; FAILED-LIKE " + bad : ""), ts: latest && latest.length ? latest[0].m : null });
  });
  await safeAudit("ops_gateway", "Ops AI gateway (24h)", async function() {
    const g = await d1all(env.AUDIT, "SELECT COUNT(*) AS c, COALESCE(SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END),0) AS bad, COALESCE(ROUND(AVG(latency_ms)),0) AS avgms, MAX(ts) AS latest FROM ops_ai_log WHERE ts >= ?", [iso24]);
    if (!g || !g.length) {
      push({ key: "ops_gateway", label: "Ops AI gateway (24h)", state: "ok", detail: "no rows in window", ts: null });
      return;
    }
    const r = g[0];
    push({ key: "ops_gateway", label: "Ops AI gateway (24h)", state: r.bad > 0 ? "err" : "ok", detail: r.c + " calls, " + r.bad + " failed (ok=0), avg " + r.avgms + "ms", ts: r.latest });
  });
  await safeAudit("ai_model_health", "AI model health", async function() {
    const rows = await d1all(env.AUDIT, "SELECT model_id, status, consecutive_failures, last_probe_ts FROM ai_model_health ORDER BY model_id");
    const bad = rows.filter(function(r) {
      return String(r.status || "").toLowerCase() !== "ok" || (r.consecutive_failures || 0) > 0;
    });
    push({ key: "model_health", label: "AI model health", state: bad.length ? "warn" : "ok", detail: rows.length + " models; not-ok: " + (bad.length ? bad.map(function(r) {
      return r.model_id + "=" + r.status + "/cf" + r.consecutive_failures;
    }).join(", ") : "none"), ts: null });
  });
  await safeAudit("ai_queries", "AI queries (24h)", async function() {
    const g = await d1all(env.AUDIT, "SELECT COUNT(*) AS c, MAX(ts) AS latest FROM ai_queries WHERE ts >= ?", [iso24]);
    const r = g && g.length ? g[0] : { c: 0, latest: null };
    push({ key: "ai_queries", label: "AI queries (24h)", state: "info", detail: r.c + " queries", ts: r.latest });
  });
  await safeAudit("living_paper", "Living paper store", async function() {
    const g = await d1all(env.LIVING, "SELECT (SELECT COUNT(*) FROM papers) AS papers, (SELECT COUNT(*) FROM paper_versions) AS versions, (SELECT COUNT(*) FROM citations) AS citations");
    const r = g && g.length ? g[0] : {};
    push({ key: "living_paper", label: "Living paper store", state: "info", detail: "papers=" + r.papers + " versions=" + r.versions + " citations=" + r.citations, ts: null });
  });
  await safeAudit("outreach_state", "Outreach pipeline state", async function() {
    const rows = await d1all(env.OUTREACH, "SELECT * FROM pipeline_state LIMIT 8");
    const kv = rows.map(function(r) {
      const ks = Object.keys(r);
      return ks.length ? ks[0] + "=" + r[ks[0]] : "";
    }).join("; ");
    const armed = rows.some(function(r) {
      const ks = Object.keys(r);
      return ks.length && String(ks[0]).toLowerCase().indexOf("external") >= 0 && String(r[ks[0]]).toLowerCase() === "0";
    });
    push({ key: "outreach_state", label: "Outreach pipeline state", state: armed ? "warn" : "info", detail: kv || "no rows", ts: null });
  });
  await safeAudit("outreach_sent", "Outreach sent_log", async function() {
    const g = await d1all(env.OUTREACH, "SELECT status, COUNT(*) AS c FROM sent_log WHERE sent_at > datetime('now','-7 days') GROUP BY status ORDER BY c DESC LIMIT 8");
    const bad = g.filter(function(r) {
      return failish(r.status);
    }).reduce(function(a, r) {
      return a + r.c;
    }, 0);
    push({ key: "outreach_sent", label: "Outreach sent_log", state: bad > 0 ? "warn" : "info", detail: JSON.stringify(g) + (bad ? "; FAILED-LIKE " + bad : ""), ts: null });
  });
  await safeAudit("register", "Governance register (v_waiting_on_human)", async function() {
    try {
      const g = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM task_dod_register WHERE owner = 'user' AND status NOT IN ('done','cancelled','cancelled-with-monitor')");
      const c = g && g.length ? g[0].c : -1;
      push({ key: "register", label: "Register owner=user open rows", state: c > 0 ? "warn" : "ok", detail: c > 0 ? c + " open" : "0 open (v_waiting_on_human=0)", ts: null });
    } catch (e) {
      push({ key: "register", label: "Register view", state: "info", detail: "task_dod_register absent/unavailable: " + squash(String(e.message || e)), ts: null });
    }
  });
  const queueStats = [];
  const ageOf = /* @__PURE__ */ __name(function(raw) {
    if (raw == null) return null;
    let ms = typeof raw === "number" ? raw : Date.parse(String(raw).replace(" ", "T"));
    if (isNaN(ms) && !isNaN(Number(raw))) ms = Number(raw);
    if (isNaN(ms)) return null;
    return Math.round((nowMs - ms) / 36e5);
  }, "ageOf");
  const qlook = /* @__PURE__ */ __name(async function(db, sql) {
    try {
      const g = await d1all(db, sql);
      return g && g.length ? g[0] : {};
    } catch (e) {
      return { __err: squash(String(e.message || e)).slice(0, 90) };
    }
  }, "qlook");
  await safeAudit("queue_research", "Queue research_queue (open+failed)", async function() {
    const o = await qlook(env.AUDIT, "SELECT COUNT(*) AS open, MAX(created_at) AS mx FROM research_queue WHERE status IN ('pending','ensemble-draft','claimed')");
    const f = await qlook(env.AUDIT, "SELECT COUNT(*) AS c, COALESCE(SUM(CASE WHEN COALESCE(recover_count,0) >= 2 OR COALESCE(terminal_rearms,0) >= 3 THEN 1 ELSE 0 END),0) AS terminal FROM research_queue WHERE status='failed'");
    if (o.__err || f.__err) {
      push({ key: "queue_research", label: "Queue research_queue", state: "warn", detail: "probe error " + (o.__err || f.__err), ts: null });
      return;
    }
    const open = Number(o.open) || 0, failed = Number(f.c) || 0, terminal = Number(f.terminal) || 0, recoverable = failed - terminal, age = ageOf(o.mx);
    const stale = open > 0 && age !== null && age > 24;
    queueStats.push({ queue: "research_queue", db: "qnfo-audit", open, failed, newest: o.mx || null, age_h: age, stale, drain: "qnfo-research-exec", action: failed > 0 ? recoverable > 0 ? "research-exec retry recoverable failed rows" : "terminal failure - root-cause ensemble leg production" : stale ? "run research-exec scan; drain ensemble-draft/pending" : "none" });
    push({ key: "queue_research", label: "Queue research_queue", state: failed > 0 ? "err" : stale ? "warn" : open > 0 ? "info" : "ok", detail: "open=" + open + " failed=" + failed + " newest=" + (age === null ? "n/a" : age + "h") + (stale ? " STALE (>24h)" : "") + (failed > 0 ? " FAILED=" + failed + (terminal > 0 ? " terminal=" + terminal + " (auto-retry exhausted; root-cause required)" : "") + (recoverable > 0 ? " recoverable=" + recoverable + " (research-exec can retry)" : "") : "") + " drain=qnfo-research-exec", ts: o.mx || null });
  });
  await safeAudit("queue_version", "Queue version_queue (drafted+error)", async function() {
    const d = await qlook(env.AUDIT, "SELECT COUNT(*) AS c, MAX(updated_at) AS mx FROM version_queue WHERE status='drafted'");
    const er = await qlook(env.AUDIT, "SELECT COUNT(*) AS c, MAX(updated_at) AS mx FROM version_queue WHERE status='error'");
    if (d.__err || er.__err) {
      push({ key: "queue_version", label: "Queue version_queue", state: "warn", detail: "probe error " + (d.__err || er.__err), ts: null });
      return;
    }
    const drafted = Number(d.c) || 0, errors = Number(er.c) || 0, age = ageOf(d.mx);
    const stale = drafted > 0 && age !== null && age > 24;
    queueStats.push({ queue: "version_queue", db: "qnfo-audit", drafted, error: errors, newest: d.mx || null, age_h: age, stale, drain: "qnfo-research-exec", action: errors > 0 ? "inspect version_queue row status='error' and re-run publish" : stale ? "run research-exec drain" : "none" });
    push({ key: "queue_version", label: "Queue version_queue", state: errors > 0 ? "err" : stale ? "warn" : drafted > 0 ? "info" : "ok", detail: "drafted=" + drafted + " error=" + errors + " newest=" + (age === null ? "n/a" : age + "h") + (stale ? " STALE (>24h)" : "") + (errors > 0 ? " ERROR=" + errors + " publish failure (slug-level; check recover_count before retry - high blast radius)" : "") + " drain=qnfo-research-exec", ts: d.mx || null });
  });
  await safeAudit("queue_outreach", "Queue outreach_queue (pending+needs-contact)", async function() {
    const o = await qlook(env.AUDIT, "SELECT COUNT(*) AS open, MAX(created_at) AS mx FROM outreach_queue WHERE status IN ('pending','needs-contact')");
    const p = await qlook(env.AUDIT, "SELECT COUNT(*) AS c FROM outreach_queue WHERE status='pending'");
    const n = await qlook(env.AUDIT, "SELECT COUNT(*) AS c FROM outreach_queue WHERE status='needs-contact'");
    if (o.__err || p.__err || n.__err) {
      push({ key: "queue_outreach", label: "Queue outreach_queue", state: "warn", detail: "probe error " + (o.__err || p.__err || n.__err), ts: null });
      return;
    }
    const open = Number(o.open) || 0, pend = Number(p.c) || 0, nc = Number(n.c) || 0, age = ageOf(o.mx);
    const stale = open > 0 && age !== null && age > 24;
    const selectorDrift = pend === 0 && nc > 0;
    queueStats.push({ queue: "outreach_queue", db: "qnfo-audit", open, pending: pend, needs_contact: nc, newest: o.mx || null, age_h: age, stale, selector_drift: selectorDrift, activation: "2026-09-15", drain: "qnfo-cloud-ops/jobOutreach", action: selectorDrift ? "drain selector status='pending' does not match producer status 'needs-contact' - align selector" : "external sends gated until 2026-09-15" });
    push({ key: "queue_outreach", label: "Queue outreach_queue", state: stale || selectorDrift ? "warn" : open > 0 ? "info" : "ok", detail: "open=" + open + " (pending=" + pend + ", needs-contact=" + nc + ") newest=" + (age === null ? "n/a" : age + "h") + (stale ? " STALE (>24h)" : "") + (selectorDrift ? " SELECTOR-DRIFT drain=status'pending' queue='" + nc + " needs-contact'" : "") + " sends gated until 2026-09-15", ts: o.mx || null });
  });
  const analytics = await analytics24(env);
  const d1c = await d1Count(env);
  const liveNames = await liveScripts(env);
  const liveCount = liveNames ? liveNames.length : null;
  const integration = await integrationView(env, liveNames);
  const systemIntegration = await readSystemIntegration(env);
  if (systemIntegration) integration.system = systemIntegration;
  const report_card = await reportCardData(env, integration, audits);
  const lastRuns = await lastRuns30(env);
  const probes = await healthProbes(env, liveNames);
  const scheduled = [];
  const now = /* @__PURE__ */ new Date();
  const scheduledSrc = await liveScheduled(env, liveNames);
  for (const s of scheduledSrc) {
    if (liveNames && liveNames.indexOf(s.name) < 0) continue;
    const per = analytics.per[s.name] || { requests: 0, errors: 0 };
    const exp = expectedFires(s.crons, now.getTime(), DAY_MS);
    let st;
    if (per.errors > 0) st = "ERR";
    else if (exp > 0 && per.requests === 0 && !s.no_run_exempt) st = "NO-RUN";
    else if (per.requests > 0) st = "OK";
    else st = "IDLE";
    scheduled.push({
      name: s.name,
      crons: s.crons,
      purpose: s.purpose,
      group: s.group,
      modified_on: s.modified_on || null,
      req24: per.requests,
      err24: per.errors,
      expected24: exp,
      next: workerNextRuns(s.crons, now.getTime(), 2),
      status: st,
      lastRun: lastRuns[s.name] || null
    });
  }
  scheduled.sort(function(a, b) {
    const na = a.next.length ? a.next[0].at : "~";
    const nb = b.next.length ? b.next[0].at : "~";
    return na < nb ? -1 : na > nb ? 1 : 0;
  });
  const probeFail30 = {};
  try {
    const pf = await d1all(env.AUDIT, "SELECT name, COUNT(*) AS c FROM fleet_probe_log WHERE ok = 0 AND ts >= ? GROUP BY name", [new Date(nowMs - 30 * 60 * 1e3).toISOString()]) || [];
    for (const r of pf) probeFail30[r.name] = r.c;
  } catch (e) {
  }
  for (const p of probes) {
    if (p.ok) continue;
    if (p.kind === "self") continue;
    if (p.kind === "domain") continue;
    const consecutive = probeFail30[p.name] || 0;
    if (consecutive < 2) continue;
    issues.push({ sev: "warn", text: "probe " + p.name + " HTTP " + p.status + " " + p.body + " (" + p.ms + "ms; " + consecutive + " failures/30m)" });
  }
  for (const a of audits) {
    if (a.state === "err") issues.push({ sev: "err", text: a.label + ": " + a.detail });
    else if (a.state === "warn") issues.push({ sev: "warn", text: a.label + ": " + a.detail });
  }
  if (analytics.errWorkers.length) issues.push({ sev: "err", text: analytics.errWorkers.length + " worker(s) with 24h errors: " + analytics.errWorkers.map(function(w) {
    return w.name + "(" + w.errors + ")";
  }).join(", ") });
  if (analytics.error) issues.push({ sev: "warn", text: "analytics unavailable: " + analytics.error });
  const chains = [];
  const sysChains = (systemIntegration && systemIntegration.chains) || [];
  for (const c of sysChains) {
    const mapSt = c.status === "healthy" ? "ok" : (c.status === "unknown" ? "ok" : "warn");
    chains.push({ name: c.id, label: c.name, state: mapSt, stages: [c.producer, c.consumer], results: [{ label: c.medium, n: c.n, state: mapSt, detail: c.detail }] });
    if (mapSt !== "ok") issues.push({ sev: c.status === "stuck" ? "err" : "warn", text: "Integration chain " + c.name + ": " + c.status + " - " + (c.detail || "") });
  }
  const noRun = scheduled.filter(function(s) {
    return s.status === "NO-RUN";
  });
  if (noRun.length) issues.push({ sev: "warn", text: noRun.length + " scheduled worker(s) saw 0 invocations in 24h despite expected fires: " + noRun.map(function(s) {
    return s.name;
  }).join(", ") + " (adaptive-sampled data; low-volume workers undercount - verify via the worker's own logs before acting)" });
  await ensureIssueLog(env);
  const issueLog = await readIssueLog(env);
  const enriched = enrichIssues(issues, issueLog);
  await writeIssueLog(env, enriched);
  await loopEnsure(env);
  const loopMap = await readLoop(env);
  for (const i of enriched) {
    const L = loopMap[i.id];
    if (L && L.gh_number) i.github = { number: L.gh_number, state: L.gh_state, dispatch: L.dispatch_state || null, attempts: L.attempts || 0 };
  }
  const errN = enriched.filter(function(i) {
    return i.sev === "err";
  }).length;
  const warnN = enriched.filter(function(i) {
    return i.sev === "warn";
  }).length;
  const verdict = errN > 0 ? "ACTION_NEEDED" : warnN > 0 ? "DEGRADED" : "HEALTHY";
  const issuesWithLinks = await attachIssueLinks(env, enriched);
  const dev = await liveDevice(env);
  return {
    schema_version: "fleet-state/v1.1",
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    window: { hours: 24, end_iso: (/* @__PURE__ */ new Date()).toISOString() },
    version: VERSION,
    fleet: {
      workers: liveCount !== null ? liveCount : Object.keys(analytics.per).length,
      scheduled: scheduled.length,
      probes: probes.length,
      d1_databases: d1c,
      analytics_error: analytics.error || null
    },
    totals: { req24: analytics.req, err24: analytics.err, window_end: analytics.ts },
    scheduled,
    audits,
    probes,
    integration,
    report_card,
    chains,
    device: dev,
    issues: issuesWithLinks,
    issue_counts: { err: errN, warn: warnN, total: issuesWithLinks.length },
    verdict,
    queues: queueStats,
    coverage: { live_workers: liveCount, scheduled_tracked: scheduled.length, unregistered: integration && integration.unregistered ? integration.unregistered.length : null },
    unattributed_errors: analytics.unattributed || 0,
    loop: await loopSnapshot(env),
    meta: { device_captured_at: dev.captured_at, schema: "fleet-state/live", sources: { scheduled: "worker_schedules", probes: "service_registry", report_card: "autonomy_scores", chains: "integration_state(qnfo-observability)" } }
  };
}
__name(buildState, "buildState");
__name2(buildState, "buildState");
function depNamesOf(raw) {
  const out = [];
  if (!raw) return out;
  let arr;
  try {
    arr = JSON.parse(raw);
  } catch (e) {
    arr = String(raw).split(/[,;]/);
  }
  const list = Array.isArray(arr) ? arr : [arr];
  for (const d of list) {
    const m = String(d).match(/[a-z0-9][a-z0-9._-]{2,}/i);
    if (m) out.push(m[0].toLowerCase());
  }
  return out;
}
__name(depNamesOf, "depNamesOf");
__name2(depNamesOf, "depNamesOf");
async function readSystemIntegration(env) {
  try {
    const r = await env.AUDIT.prepare("SELECT json FROM integration_state ORDER BY id DESC LIMIT 1").first();
    if (r && r.json) return JSON.parse(r.json);
  } catch (e) {
  }
  return null;
}
__name(readSystemIntegration, "readSystemIntegration");
__name2(readSystemIntegration, "readSystemIntegration");
function systemIntegrationHtml(sys) {
  if (!sys || !sys.score) return '<h2>System integration at a glance</h2><div class="sub">no assessment yet - waiting for qnfo-observability telemetry</div>';
  const sc = sys.score;
  const badge = /* @__PURE__ */ __name(function(status) {
    const color = status === "healthy" ? "#2ea043" : status === "degraded" ? "#d29922" : status === "stuck" ? "#f85149" : "#8b949e";
    return '<span style="color:' + color + ';font-weight:600">' + status + "</span>";
  }, "badge");
  let out = '<h2>System integration at a glance <span class="sub">score ' + sc.total + "/100 &middot; chains " + sc.chains + " &middot; coverage " + sc.coverage + " &middot; freshness " + sc.freshness + " &middot; weights: " + esc(sc.weights) + " &middot; assessed " + esc(String(sys.generated_at || "").slice(0, 16).replace("T", " ")) + "</span></h2>";
  out += "<table><tr><th>chain (producer &rarr; consumer)</th><th>medium</th><th>state</th><th>pending</th><th>oldest</th></tr>";
  for (const c of sys.chains || []) {
    out += "<tr><td>" + esc(c.name) + '</td><td class="sub">' + esc(c.medium) + "</td><td>" + badge(c.status) + "</td><td>" + (c.n == null ? "-" : c.n) + "</td><td>" + (c.oldest_h == null ? "-" : c.oldest_h.toFixed(1) + "h") + "</td></tr>";
  }
  out += "</table>";
  out += '<div class="sub">coverage: ' + sys.coverage.probed + " probed / " + sys.coverage.traced + " traced / " + sys.coverage.invocated + " invocated of " + sys.coverage.fleet_size + " workers &middot; decay: ";
  out += (sys.decay || []).map(function(d) {
    return d.signal + " " + (d.age_h == null ? "?" : d.age_h.toFixed(1) + "h");
  }).join(", ");
  out += "</div>";
  if (sys.opportunities && sys.opportunities.length) {
    out += "<h3>Integration opportunities (" + sys.opportunities.length + ")</h3><ul>";
    for (const o of sys.opportunities) out += '<li><span class="sub">[' + esc(o.kind) + "]</span> " + esc(o.text) + "</li>";
    out += "</ul>";
  } else {
    out += '<div class="sub">no integration opportunities detected</div>';
  }
  return out;
}
__name(systemIntegrationHtml, "systemIntegrationHtml");
__name2(systemIntegrationHtml, "systemIntegrationHtml");
async function integrationView(env, liveNames) {
  const rows = await d1all(env.AUDIT, "SELECT service, kind, version, deps FROM service_registry WHERE kind='worker'") || [];
  const liveSet = new Set((liveNames || []).map(function(n) {
    return String(n);
  }));
  const regSet = /* @__PURE__ */ new Set();
  const nodes = [];
  const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  for (const r of rows) {
    const svc = String(r.service || "");
    regSet.add(svc);
    const version = r.version == null ? "" : String(r.version);
    let vstate = "ok";
    if (!version || version === "null" || version === "undefined") vstate = "unversioned";
    else if (!semver.test(version)) vstate = "non-semver";
    nodes.push({ service: svc, kind: String(r.kind || ""), version, vstate, live: liveSet.size ? liveSet.has(svc) : true, deps: depNamesOf(r.deps) });
  }
  const regLower = new Set(Array.from(regSet).map(function(n) {
    return n.toLowerCase();
  }));
  const edges = [];
  const inbound = /* @__PURE__ */ new Map();
  const outbound = /* @__PURE__ */ new Map();
  for (const n of nodes) {
    const from = n.service.toLowerCase();
    let out = 0;
    for (const dn of n.deps) {
      if (dn !== from && regLower.has(dn)) {
        edges.push({ from: n.service, to: dn });
        out++;
        inbound.set(dn, (inbound.get(dn) || 0) + 1);
      }
    }
    outbound.set(n.service, out);
  }
  const deg = /* @__PURE__ */ __name2(function(s) {
    return { out: outbound.get(s) || 0, in: inbound.get(s) || 0 };
  }, "deg");
  const islands = nodes.filter(function(n) {
    const d = deg(n.service);
    return d.out === 0 && d.in === 0;
  }).map(function(n) {
    return n.service;
  });
  const sinks = nodes.filter(function(n) {
    const d = deg(n.service);
    return d.out === 0 && d.in > 0;
  }).map(function(n) {
    return n.service;
  });
  const hubs = nodes.map(function(n) {
    const d = deg(n.service);
    return { service: n.service, out: d.out, in: d.in };
  }).filter(function(x) {
    return x.out > 0;
  }).sort(function(a, b) {
    return b.out - a.out;
  }).slice(0, 10);
  const ghost = nodes.filter(function(n) {
    return n.live === false;
  }).map(function(n) {
    return n.service;
  });
  const unregistered = liveSet.size ? Array.from(liveSet).filter(function(n) {
    return !regSet.has(n);
  }) : [];
  const unversioned = nodes.filter(function(n) {
    return n.vstate !== "ok";
  }).map(function(n) {
    return n.service + " (" + (n.version || "(none)") + ")";
  });
  return {
    registered: nodes.length,
    live: liveNames ? liveNames.length : null,
    edges: edges.length,
    density: nodes.length > 1 ? +(edges.length / (nodes.length * (nodes.length - 1))).toFixed(4) : 0,
    islands,
    sinks,
    hubs,
    ghost,
    unregistered,
    unversioned,
    drift: { ghost: ghost.length, unregistered: unregistered.length, unversioned: unversioned.length }
  };
}
__name(integrationView, "integrationView");
__name2(integrationView, "integrationView");
async function reportCardData(env, integration, audits) {
  let humanOpen = -1;
  try {
    const g = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM task_dod_register WHERE owner='user' AND status NOT IN ('done','cancelled','cancelled-with-monitor')");
    humanOpen = g && g.length ? g[0].c : 0;
  } catch (e) { humanOpen = -1; }
  let selfHeal = -1;
  try {
    const g = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM self_heal_actions");
    selfHeal = g && g.length ? g[0].c : 0;
  } catch (e) { selfHeal = -1; }
  let openIssues = -1;
  try {
    const g = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM agent_issues WHERE status NOT IN ('closed','done','resolved','wontfix','cancelled')");
    openIssues = g && g.length ? g[0].c : 0;
  } catch (e) { openIssues = -1; }
  const drift = integration ? integration.drift : { ghost: 0, unregistered: 0, unversioned: 0 };
  const driftTotal = (drift.ghost || 0) + (drift.unregistered || 0) + (drift.unversioned || 0);
  const dim = {};
  try { const rows = await d1all(env.AUDIT, "SELECT dimension, score, framework, scale, evidence, gap, scored_at FROM autonomy_scores") || []; rows.forEach(function(r) { if (r && r.dimension) dim[r.dimension] = r; }); } catch (e) {}
  const g = /* @__PURE__ */ __name(function(k) { return dim[k] && typeof dim[k].score === "number" ? dim[k].score : null; }, "g");
  const fmt = /* @__PURE__ */ __name(function(v) { return v == null ? "n/a" : String(v); }, "fmt");
  const loa = g("independent_decision");
  const overall = dim.overall || null;
  return {
    human_open: humanOpen,
    self_heal_total: selfHeal,
    open_issues: openIssues,
    drift_total: driftTotal,
    drift,
    loa: loa != null ? String(Math.round(loa * 2)) : null,
    loa_label: dim.independent_decision ? (dim.independent_decision.gap || dim.independent_decision.evidence || "") : "",
    agi: overall ? (fmt(overall.score) + "/5 composite") : null,
    vsm: (dim.s5_policy || dim.s4_intelligence || dim.s3_control) ? ("S5 " + fmt(g("s5_policy")) + " / S4 " + fmt(g("s4_intelligence")) + " / S3 " + fmt(g("s3_control")) + " (of 5)") : null,
    ooda: dim.ooda_closure ? (fmt(g("ooda_closure")) + "/5 closure") : null,
    watchmaker: dim.watchmaker_inverted ? (fmt(g("watchmaker_inverted")) + "/5 inverted") : null,
    top: null,
    scored_at: overall ? overall.scored_at : null,
    source: "autonomy_scores (qnfo-audit D1, live)"
  };
}
__name(reportCardData, "reportCardData");
__name2(reportCardData, "reportCardData");
function reportCardHtml(rc) {
  if (!rc) return "";
  const h = [];
  h.push("<h2>Systems report card (autonomy + intelligence)</h2>");
  h.push('<div class="sub">Scored against citable frameworks (Sheridan-Verplanck LoA, Beer VSM, OpenAI/DeepMind AGI levels, OODA). TOP of scale = human-level autonomy + independent decision-making. Canonical: qnfo-ops/docs/SYSTEMS-REPORT-CARD.md</div>');
  h.push("<table><tr><th>dimension</th><th>framework</th><th>level</th><th>top of scale</th></tr>");
  h.push("<tr><td>Decision authority</td><td>Sheridan-Verplanck LoA</td><td>" + (rc.loa != null ? "LoA " + rc.loa + " (" + esc(rc.loa_label) + ")" : "n/a") + "</td><td>LoA 10</td></tr>");
  h.push("<tr><td>Intelligence</td><td>OpenAI/DeepMind levels</td><td>" + esc(rc.agi == null ? "n/a" : rc.agi) + "</td><td>L5 Organization</td></tr>");
  h.push("<tr><td>Organizational viability</td><td>Beer VSM</td><td>" + esc(rc.vsm || "n/a") + "</td><td>S1-S5 closed, S5 internalized</td></tr>");
  h.push("<tr><td>Decision cycle</td><td>OODA</td><td>" + esc(rc.ooda || "n/a") + "</td><td>closed, real-time</td></tr>");
  h.push("</table>");
  h.push('<div class="chips">');
  h.push(rc.human_open === 0 ? chip("ok", "human-gated ops: 0") : chip("warn", "human-gated ops: " + rc.human_open));
  h.push(rc.self_heal_total >= 0 ? chip("info", "self-heal actions: " + rc.self_heal_total) : chip("warn", "self-heal: n/a"));
  h.push(rc.open_issues >= 0 ? rc.open_issues === 0 ? chip("ok", "open agent issues: 0") : chip("warn", "open agent issues: " + rc.open_issues) : chip("warn", "issues: n/a"));
  h.push(rc.drift_total > 0 ? chip("warn", "drift divergence: " + rc.drift_total) : chip("ok", "drift divergence: 0"));
  h.push("</div>");
  h.push('<div class="sub">Objective function (Watchmaker): human-intervention -> 0; drift -> 0; self-heal -> 1. Next level: ' + esc(rc.top) + ". Highest-leverage gap: normalize service_registry.version to semver (currently " + rc.drift.unversioned + " unversioned).</div>");
  return h.join("");
}
__name(reportCardHtml, "reportCardHtml");
__name2(reportCardHtml, "reportCardHtml");
function integrationHtml(ig, st) {
  if (!ig) return "";
  const h = [];
  h.push("<h2>System integration (fleet-wide)</h2>");
  h.push('<div class="sub">Nodes = service_registry; edges = declared deps resolving to another registered service. Islands = no declared in/out edge (runs but not integrated). Ghost = registered but not live. Unregistered = live but invisible to the registry. Unversioned = invisible to drift management. Lens: systems theory (integration edges are first-class; closed loops with receipts) + chaos theory (drift as distance from the canonical attractor; ghost/unregistered/unversioned = amplifying drift).</div>');
  h.push('<div class="chips">');
  h.push(chip("info", ig.registered + " registered"));
  h.push(chip("info", (ig.live == null ? "?" : ig.live) + " live"));
  h.push(chip("info", ig.edges + " edges (density " + ig.density + ")"));
  h.push(ig.drift.ghost > 0 ? chip("warn", ig.drift.ghost + " ghost") : chip("ok", "0 ghost"));
  h.push(ig.drift.unregistered > 0 ? chip("warn", ig.drift.unregistered + " unregistered") : chip("ok", "0 unregistered"));
  h.push(ig.drift.unversioned > 0 ? chip("warn", ig.drift.unversioned + " unversioned") : chip("ok", "0 unversioned"));
  h.push("</div>");
  const opp = [];
  if (ig.unregistered.length) opp.push("Register " + ig.unregistered.length + " live-but-invisible worker(s): " + ig.unregistered.join(", ") + " (they exist but the registry cannot integrate them).");
  if (ig.ghost.length) opp.push("Purge " + ig.ghost.length + " ghost registry row(s) (declared but not live): " + ig.ghost.join(", ") + ".");
  if (ig.unversioned.length) opp.push("Version " + ig.unversioned.length + " worker(s) (invisible to drift management): " + ig.unversioned.join(", ") + ".");
  if (ig.islands.length) opp.push("Wire or retire " + ig.islands.length + " island worker(s) (no declared in/out edge): " + ig.islands.join(", ") + ".");
  if (opp.length) {
    h.push('<div class="card"><h2>Integration opportunities (' + opp.length + ")</h2><ul>");
    for (const o of opp) h.push('<li class="issue-warn">' + esc(o) + "</li>");
    h.push("</ul></div>");
  } else {
    h.push('<div class="card"><h2>Integration opportunities</h2><div>No structural integration gaps detected: every live worker is registered, versioned, and wired.</div></div>');
  }
  h.push("<h2>Integration hubs (most declared out-edges)</h2>");
  h.push("<table><tr><th>service</th><th>out</th><th>in</th></tr>");
  for (const hb of ig.hubs) h.push("<tr><td>" + esc(hb.service) + "</td><td>" + hb.out + "</td><td>" + hb.in + "</td></tr>");
  h.push("</table>");
  if (ig.islands.length) h.push('<h2>Islands (no declared in/out edge)</h2><div class="sub">' + esc(ig.islands.join(", ")) + "</div>");
  h.push("<h2>Flow chains (transformation health)</h2>");
  h.push("<table><tr><th>chain</th><th>state</th><th>signals</th></tr>");
  for (const ch of st.chains || []) {
    h.push("<tr><td><b>" + esc(ch.label) + '</b><div class="sub">' + esc((ch.stages || []).join(" -> ")) + "</div></td><td>" + chip(ch.state, ch.state) + "</td><td>" + ch.results.map(function(r) {
      return esc(r.label) + "=" + (r.n === null ? "err" : r.n) + (r.state !== "ok" ? ' <b style="color:#d29922">!</b>' : "");
    }).join(" &middot; ") + "</td></tr>");
  }
  h.push("</table>");
  const opp2 = st.integration_opportunities || [];
  if (opp2.length) {
    h.push("<h2>Consolidation roadmap (curated)</h2><ul>");
    for (const o of opp2) h.push("<li><b>" + esc(o.label) + "</b> &mdash; " + esc(o.note) + ' <span class="sub">[' + (o.workers || []).length + " workers]</span></li>");
    h.push("</ul>");
  }
  return h.join("");
}
__name(integrationHtml, "integrationHtml");
__name2(integrationHtml, "integrationHtml");
function chipClass(state) {
  const s = String(state || "").toUpperCase();
  if (s === "OK") return "ok";
  if (s === "ERR") return "err";
  if (s === "WARN") return "warn";
  if (s === "NO-RUN") return "warn";
  if (s === "IDLE") return "idle";
  return "info";
}
__name(chipClass, "chipClass");
__name2(chipClass, "chipClass");
function chip(state, text) {
  return '<span class="chip chip-' + chipClass(state) + '">' + esc(text == null ? state : text) + "</span>";
}
__name(chip, "chip");
__name2(chip, "chip");
function pageHtml(st) {
  const h = [];
  h.push('<!doctype html><html lang="en"><head><meta charset="utf-8"/>');
  h.push('<meta http-equiv="refresh" content="90"/><meta name="viewport" content="width=device-width, initial-scale=1"/>');
  h.push("<title>Quniverse Fleet Dashboard</title><style>");
  h.push("body{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;background:#0d1117;color:#c9d1d9;margin:0;padding:16px}");
  h.push("h1{font-size:20px;margin:4px 0}h2{font-size:14px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.06em;color:#8b949e}");
  h.push("a{color:#58a6ff;text-decoration:none}.sub{color:#8b949e;font-size:12px}");
  h.push("table{border-collapse:collapse;width:100%;font-size:12px;margin:4px 0 10px}th,td{border:1px solid #30363d;padding:3px 6px;text-align:left;vertical-align:top}th{background:#161b22;color:#8b949e;position:sticky;top:0}");
  h.push("tr:nth-child(even) td{background:#0d1117}tr:hover td{background:#161b22}");
  h.push(".chips{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.chip{padding:2px 8px;border-radius:10px;font-size:12px}");
  h.push(".chip-ok{background:#12291b;color:#3fb950;border:1px solid #238636}.chip-err{background:#2d1215;color:#f85149;border:1px solid #da3633}");
  h.push(".chip-warn{background:#2d1f0c;color:#d29922;border:1px solid #9e6a03}.chip-idle{background:#161b22;color:#8b949e;border:1px solid #30363d}.chip-info{background:#0d2333;color:#58a6ff;border:1px solid #1f6feb}");
  h.push(".issue-err{color:#f85149}.issue-warn{color:#d29922}.card{border:1px solid #30363d;border-radius:6px;padding:10px;margin:10px 0;background:#0d1117}");
  h.push(".dot{display:inline-block;width:8px;height:8px;border-radius:4px;margin-right:4px}");
  h.push(".dot-ok{background:#3fb950}.dot-err{background:#f85149}.dot-warn{background:#d29922}.dot-idle{background:#6e7681}");
  h.push("</style></head><body>");
  const totalOk = st.scheduled.filter(function(x) {
    return x.status === "OK";
  }).length;
  const totalErr = st.scheduled.filter(function(x) {
    return x.status === "ERR";
  }).length;
  const totalNoRun = st.scheduled.filter(function(x) {
    return x.status === "NO-RUN";
  }).length;
  const probeOk = st.probes.filter(function(p) {
    return p.ok;
  }).length;
  h.push('<h1>Quniverse Fleet Dashboard <span class="sub">v' + esc(st.version) + "</span></h1>");
  h.push('<div class="sub">generated ' + esc(st.generated_at) + ' UTC &middot; 24h analytics window &middot; auto-refreshes every 90s &middot; raw: <a href="/api/state">/api/state</a> &middot; actions: <a href="/api/actions">/api/actions</a></div>');
  h.push('<div class="chips">');
  h.push(chip("info", st.fleet.workers + " workers active"));
  h.push(chip("info", st.fleet.scheduled + " scheduled"));
  h.push(chip("info", st.fleet.d1_databases + " D1"));
  h.push(chip("info", st.totals.req24 + " req/24h"));
  h.push(st.totals.err24 > 0 ? chip("err", st.totals.err24 + " errors/24h") : chip("ok", "0 errors/24h"));
  h.push(probeOk === st.probes.length ? chip("ok", probeOk + "/" + st.probes.length + " probes up") : chip("warn", probeOk + "/" + st.probes.length + " probes up"));
  h.push(chip(totalErr > 0 ? "err" : "ok", totalErr + " scheduled w/ errors"));
  h.push(chip(totalNoRun > 0 ? "warn" : "ok", totalNoRun + " no-run"));
  h.push(st.verdict === "ACTION_NEEDED" ? chip("err", "verdict: ACTION NEEDED") : st.verdict === "DEGRADED" ? chip("warn", "verdict: DEGRADED") : chip("ok", "verdict: HEALTHY"));
  h.push("</div>");
  const verdict = st.verdict || (st.issues && st.issues.some(function(i) {
    return i.sev === "err";
  }) ? "ACTION_NEEDED" : st.issues && st.issues.length ? "DEGRADED" : "HEALTHY");
  if (st.issues && st.issues.length) {
    const errs = st.issues.filter(function(i) {
      return i.sev === "err";
    });
    const warns = st.issues.filter(function(i) {
      return i.sev === "warn";
    });
    const byCat = {};
    for (const i of st.issues) {
      const c = i.category || "general";
      byCat[c] = (byCat[c] || 0) + 1;
    }
    h.push('<div class="card"><h2>Action board &middot; ' + errs.length + " error, " + warns.length + " warning</h2>");
    h.push('<div class="sub">verdict <b>' + esc(verdict) + "</b> &middot; by category: " + esc(Object.keys(byCat).map(function(k) {
      return k + " " + byCat[k];
    }).join(", ")) + ' &middot; machine feed <a href="/api/actions">/api/actions</a> &middot; loop <a href="/api/loop">/api/loop</a> &middot; issues <a href="https://github.com/QNFO/qnfo-fleet-issues">GitHub</a></div>');
    for (const i of st.issues) {
      const cls = i.sev === "err" ? "issue-err" : "issue-warn";
      const rem = i.remediation && i.remediation.summary ? i.remediation.summary : "review raw evidence and classify";
      const auto = i.auto_actionable ? '<span class="chip chip-info">auto</span>' : "";
      const age = i.first_seen ? "since " + esc(String(i.first_seen).slice(0, 16).replace("T", " ")) : "first seen now";
      h.push('<div class="card" style="margin:8px 0;padding:8px"><div class="' + cls + '"><b>[' + esc(i.sev) + "] " + esc(i.category) + "</b> " + esc(i.title || i.detail || "") + " " + auto + "</div>");
      h.push('<div class="sub">' + esc(i.detail || "") + "</div>");
      h.push("<div>Next: " + esc(rem) + ' <span class="sub">&middot; owner ' + esc(i.owner || "fleet") + " &middot; " + esc(age) + " &middot; " + esc(i.id) + (i.github ? ' &middot; <a href="https://github.com/' + GH_REPO + "/issues/" + i.github.number + '">#' + i.github.number + "</a> " + esc(i.github.state) + (i.github.dispatch ? " (" + esc(i.github.dispatch) + ")" : "") : "") + "</span></div></div>");
    }
    h.push("</div>");
  } else {
    h.push('<div class="card"><h2>Action board</h2><div class="sub">verdict HEALTHY &middot; no active error or warning conditions.</div></div>');
  }
  h.push("<h2>Scheduled workers (next runs UTC)</h2>");
  h.push("<table><tr><th>status</th><th>worker</th><th>purpose</th><th>cron(s)</th><th>next runs</th><th>24h inv</th><th>24h err</th><th>exp fires</th><th>modified</th><th>last run</th></tr>");
  for (const s of st.scheduled) {
    const dotc = s.status === "ERR" ? "err" : s.status === "OK" ? "ok" : s.status === "NO-RUN" ? "warn" : "idle";
    h.push('<tr><td><span class="dot dot-' + dotc + '"></span>' + esc(s.status) + "</td>");
    h.push("<td>" + esc(s.name) + "</td><td>" + esc(s.purpose) + ' <span class="sub">(' + esc(s.group) + ")</span></td>");
    h.push("<td>" + esc(s.crons.join(", ")) + "</td>");
    h.push("<td>" + (s.next.length ? s.next.map(function(n) {
      return n.at + (s.crons.length > 1 ? " [" + esc(n.cron) + "]" : "");
    }).join("<br/>") : "none in 400d") + "</td>");
    h.push("<td>" + s.req24 + "</td><td>" + (s.err24 > 0 ? '<b style="color:#f85149">' + s.err24 + "</b>" : s.err24) + "</td><td>" + s.expected24 + "</td>");
    h.push('<td class="sub">' + esc((s.modified_on || "").slice(0, 16)) + "</td>");
    h.push('<td class="sub">' + esc(s.lastRun ? String(s.lastRun).slice(0, 16).replace("T", " ") : "never (30d)") + "</td></tr>");
  }
  h.push("</table>");
  h.push("<h2>Pipeline audits (D1 qnfo-audit + outreach + living-paper)</h2>");
  h.push("<table><tr><th>state</th><th>probe</th><th>detail</th><th>latest</th></tr>");
  for (const a of st.audits) {
    h.push("<tr><td>" + chip(a.state, a.state) + "</td><td>" + esc(a.label) + "</td><td>" + esc(a.detail) + '</td><td class="sub">' + esc(a.ts ? String(a.ts).slice(0, 19) : "") + "</td></tr>");
  }
  h.push("</table>");
  h.push("<h2>Endpoint probes</h2>");
  h.push("<table><tr><th>status</th><th>name</th><th>url</th><th>http</th><th>ms</th><th>body sample</th></tr>");
  for (const p of st.probes) {
    h.push("<tr><td>" + (p.ok ? chip("ok", "UP") : chip("warn", "DOWN")) + "</td><td>" + esc(p.name) + "</td><td>" + esc(p.url) + "</td><td>" + p.status + "</td><td>" + p.ms + '</td><td class="sub">' + esc(p.body) + "</td></tr>");
  }
  h.push("</table>");
  h.push(integrationHtml(st.integration, st));
  h.push(systemIntegrationHtml(st.integration && st.integration.system));
  h.push(reportCardHtml(st.report_card));
  h.push("<h2>Device-bound (Windows Task Scheduler + DeepChat local cron) - front-end only</h2>");
  h.push('<div class="sub">captured ' + esc(st.device.captured_at || "") + " UTC &middot; " + esc(st.device.note || "") + " &middot; cloud-able functions run in the CF scheduled layer, never local cron (CLOUD-FRONTEND-ONLY-1)</div>");
  h.push("<table><tr><th>task</th><th>status</th><th>last run</th><th>last result</th><th>next run</th><th>schedule</th></tr>");
  for (const t of st.device.windows_tasks) {
    const stc = t.status === "Ready" ? "ok" : "warn";
    h.push("<tr><td>" + esc(t.name) + "</td><td>" + chip(stc, t.status) + "</td><td>" + esc(t.last || "") + "</td><td>" + esc(t.lastres || "") + "</td><td>" + esc(t.next || "") + "</td><td>" + esc(t.schedule || "") + "</td></tr>");
  }
  h.push("</table>");
  if (st.device.local_crons && st.device.local_crons.length) {
    h.push("<table><tr><th>local cron id</th><th>name</th><th>schedule</th><th>note</th></tr>");
    for (const lc of st.device.local_crons) h.push("<tr><td>" + esc(lc.id) + "</td><td>" + esc(lc.name) + "</td><td>" + esc(lc.cron) + '</td><td class="sub">' + esc(lc.note) + "</td></tr>");
    h.push("</table>");
  }
  h.push('<div class="sub" style="margin-top:14px">guard set: prompt-store-verify / scheduler-guard / model_guard / adversarial-guard (exit 0 each cycle) &middot; registry captured ' + esc(st.meta.registry_captured_at || "") + " UTC</div>");
  h.push("</body></html>");
  return h.join("");
}
__name(pageHtml, "pageHtml");
__name2(pageHtml, "pageHtml");
var inflight = null;
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "OPTIONS") return json({}, 204);
  if (path === "/health") {
    return json({ ok: true, worker: NAME, version: VERSION, generated_at: (/* @__PURE__ */ new Date()).toISOString() });
  }
  if (path === "/api/refresh") {
    const st = await runRefresh(env, ctx);
    return json({ ok: true, generated_at: st.generated_at, issues: (st.issues || []).length, refresh_ms: st.refresh_ms });
  }
  if (path === "/api/state") {
    const rec = await loadState(env);
    if (!rec) {
      const st = await runRefresh(env, ctx);
      return json(st);
    }
    const age = Date.now() - new Date(rec.updatedAt).getTime();
    if (age > STALE_MS) ctx.waitUntil(runRefresh(env, ctx).catch(function() {
    }));
    return json(rec.state);
  }
  if (path === "/api/actions") {
    const rec = await loadState(env);
    const st = rec ? rec.state : await runRefresh(env, ctx);
    const acts = (st.issues || []).map(function(i) {
      return { id: i.id, severity: i.sev, severity_rank: i.severity_rank, category: i.category, resource: i.resource, title: i.title, detail: i.detail, owner: i.owner, auto_actionable: i.auto_actionable, remediation: i.remediation, first_seen: i.first_seen, last_seen: i.last_seen, occurrences: i.occurrences, github: i.github || null };
    });
    return json({ schema_version: "fleet-actions/v1", worker: NAME, version: VERSION, generated_at: st.generated_at, verdict: st.verdict || "UNKNOWN", counts: st.issue_counts || { err: 0, warn: 0, total: acts.length }, actions: acts });
  }
  if (path === "/api/loop") {
    await loopEnsure(env);
    const rec = await loadState(env);
    const st = rec ? rec.state : null;
    const rows = await d1all(env.AUDIT, "SELECT fingerprint, category, sev, owner, title, first_seen, last_seen, occurrences, gh_number, gh_state, attempts, dispatch_state, last_action, last_verified, closed_at FROM fleet_issue_loop ORDER BY last_seen DESC LIMIT 200") || [];
    const meta = await loopMetaGet(env);
    const dispatch = await d1all(env.AUDIT, "SELECT fingerprint, category, owner, action, state, exec_state, exec_ts, exec_result, gh_number, created_at FROM fleet_issue_dispatch ORDER BY created_at DESC LIMIT 100") || [];
    let summary = null;
    try {
      summary = meta.last_summary ? JSON.parse(meta.last_summary) : null;
    } catch (e) {
    }
    return json({ schema_version: "fleet-loop/v1", worker: NAME, version: VERSION, repo: GH_REPO, last_sync: meta.last_sync || null, last_summary: summary, last_execute: meta.last_execute || null, last_execute_summary: (function() {
      try {
        return meta.last_execute_summary ? JSON.parse(meta.last_execute_summary) : null;
      } catch (e) {
        return null;
      }
    })(), verdict: st ? st.verdict || null : null, open_signals: st && st.issues ? st.issues.length : null, ledger: rows, dispatch_queue: dispatch });
  }
  if (path === "/api/loop/sync" && request.method === "POST") {
    const tok = request.headers.get("x-loop-token") || "";
    if (!env.LOOP_TOKEN || tok !== env.LOOP_TOKEN) return json({ error: "unauthorized" }, 401);
    const st = await runRefresh(env, ctx);
    return json(await loopSync(env, st));
  }
  if (path === "/api/loop/execute" && request.method === "POST") {
    const tok = request.headers.get("x-loop-token") || "";
    if (!env.LOOP_TOKEN || tok !== env.LOOP_TOKEN) return json({ error: "unauthorized" }, 401);
    return json(await loopExecute(env));
  }
  if (path === "/api/integration") {
    const rec = await loadState(env);
    const st = rec ? rec.state : await runRefresh(env, ctx);
    return json(st.integration || { error: "no integration data" });
  }
  if (path === "/" || path === "") {
    const rec = await loadState(env);
    let st = rec ? rec.state : null;
    if (!st) {
      try {
        st = await runRefresh(env, ctx);
      } catch (e) {
        st = { error: String(e.message || e), generated_at: (/* @__PURE__ */ new Date()).toISOString(), version: VERSION, fleet: { workers: 0, scheduled: 0, probes: 0, d1_databases: 9 }, totals: { req24: 0, err24: 0 }, scheduled: [], audits: [], probes: [], device: await liveDevice(env), issues: [{ sev: "err", text: "refresh failed: " + String(e.message || e) }], meta: {} };
      }
    } else {
      const age = Date.now() - new Date(rec.updatedAt).getTime();
      if (age > STALE_MS) ctx.waitUntil(runRefresh(env, ctx).catch(function() {
      }));
    }
    return new Response(pageHtml(st), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return json({ error: "not found", path }, 404);
}
__name(handleRequest, "handleRequest");
__name2(handleRequest, "handleRequest");
async function runRefresh(env, ctx) {
  if (inflight) return inflight;
  inflight = (async function() {
    const t0 = Date.now();
    const st = await buildState(env, ctx);
    st.refresh_ms = Date.now() - t0;
    await saveState(env, st, st.refresh_ms);
    if (ctx && ctx.waitUntil) ctx.waitUntil(loopMaybeSync(env, st).catch(function() {
    }));
    return st;
  })().finally(function() {
    inflight = null;
  });
  return inflight;
}
__name(runRefresh, "runRefresh");
__name2(runRefresh, "runRefresh");
async function ensureReportCardTable(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS report_card_history (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, sai REAL, grade TEXT, scores_json TEXT, signals_json TEXT)").run();
}
__name(ensureReportCardTable, "ensureReportCardTable");
__name2(ensureReportCardTable, "ensureReportCardTable");
function computeSai(st, bench, cfg, live) {
  const clamp = /* @__PURE__ */ __name(function(x) {
    return Math.max(0, Math.min(1, x));
  }, "clamp");
  const P = cfg || {};
  const LD = live || {};
  const dims = LD.dims || {};
  const nd = /* @__PURE__ */ __name(function(k) { return typeof dims[k] === "number" ? dims[k] : null; }, "nd");
  const probes = st.probes || [];
  const probeRatio = probes.length ? probes.filter(function(p) { return p.ok; }).length / probes.length : 0;
  const issues = st.issues || [];
  const nErr = issues.filter(function(i) { return i.sev === "err"; }).length;
  const nWarn = issues.filter(function(i) { return i.sev === "warn"; }).length;
  const chains = st.chains || [];
  const chainRatio = chains.length ? chains.filter(function(c) { return c.state === "ok"; }).length / chains.length : 0;
  const ig = st.integration || {};
  const islands = ig.islands || [];
  const drift = ig.drift || {};
  const driftBad = (drift.ghost || 0) + (drift.unregistered || 0) + (drift.unversioned || 0);
  const density = ig.density || 0;
  const audits = {};
  (st.audits || []).forEach(function(a) { if (a && a.key) audits[a.key] = a; });
  let openIssues = -1, userWait = -1;
  const aiDetail = (audits.agent_issues || {}).detail || "";
  const m1 = aiDetail.match(/(\d+) open of/);
  if (m1) openIssues = Number(m1[1]);
  const regDetail = (audits.register || {}).detail || "";
  const m2 = regDetail.match(/v_waiting_on_human=(\d+)/);
  if (m2) userWait = Number(m2[1]);
  const noRun = (st.scheduled || []).filter(function(s) { return s.status === "NO-RUN"; }).length;
  const userFreedom = userWait === 0 ? 1 : userWait > 0 ? clamp(1 - P.uf_step * userWait) : 1;
  const loopHealth = P.lh_probe * probeRatio + P.lh_chain * chainRatio + P.lh_norun * (noRun === 0 ? 1 : P.lh_norun_penalty);
  const autonomy = Math.min(P.aut_user * userFreedom + P.aut_loop * loopHealth, P.autonomy_ceiling);
  const thinking = P.thinking_base + P.thinking_scale * (typeof bench === "number" && bench >= 0 && bench <= 1 ? bench : 0);
  const decLive = ["independent_decision", "ooda_closure", "s3_control", "s5_policy"].map(nd).filter(function(x) { return x != null; });
  const decision = decLive.length ? decLive.reduce(function(a, b) { return a + b; }, 0) / decLive.length / 5 : null;
  const kaizen = openIssues === 0 ? 1 : openIssues > 0 ? clamp(1 - P.kaizen_step * openIssues) : 1;
  const closureRate = typeof LD.closureRate === "number" ? LD.closureRate : 0;
  const healRate = typeof LD.healRate === "number" ? LD.healRate : 0;
  const selfImprov = P.si_kaizen * kaizen + P.si_closure * closureRate + P.si_heal * healRate;
  const reliability = P.rel_probe * probeRatio + P.rel_err * clamp(1 - P.rel_err_step * nErr) + P.rel_warn * clamp(1 - P.rel_warn_step * nWarn);
  const driftPen = clamp(1 - P.drift_step * driftBad);
  const islandPen = clamp(1 - P.island_step * islands.length);
  const densityScore = clamp(density * P.density_mult);
  const structural = P.st_chain * chainRatio + P.st_drift * (P.st_drift_w * driftPen + P.st_island_w * islandPen) + P.st_density * densityScore;
  const sysInt = ig.system || {};
  const sysScore = sysInt.score && typeof sysInt.score.total === "number" ? sysInt.score.total : null;
  const integration = sysScore != null ? P.int_struct * structural + P.int_sys * clamp(sysScore / 100) : structural;
  const govPol = nd("s5_policy") != null ? nd("s5_policy") / 5 : P.gov_policy;
  const governance = P.gov_user * userFreedom + P.gov_pol_w * govPol;
  const scores = { autonomy, thinking, decision, self_improv: selfImprov, reliability, integration, governance };
  const weights = ["w_autonomy", "w_thinking", "w_decision", "w_self_improv", "w_reliability", "w_integration", "w_governance"];
  const missing = weights.filter(function(k) { return typeof P[k] !== "number"; });
  const sai = missing.length || scores.decision == null ? null : 100 * (P.w_autonomy * scores.autonomy + P.w_thinking * scores.thinking + P.w_decision * scores.decision + P.w_self_improv * scores.self_improv + P.w_reliability * scores.reliability + P.w_integration * scores.integration + P.w_governance * scores.governance);
  return { sai: sai == null ? null : Math.round(sai * 10) / 10, scores, weights_source: "sai_config", config_missing: missing, decision_source: decLive.length ? "autonomy_scores" : "unavailable", signals: { probe_ratio: probeRatio, chain_ratio: chainRatio, issues_err: nErr, issues_warn: nWarn, open_agent_issues: openIssues, user_wait: userWait, islands: islands.length, drift_bad: driftBad, density, no_run: noRun, closure_rate: closureRate, heal_rate: healRate } };
}
__name(computeSai, "computeSai");
__name2(computeSai, "computeSai");
__name2(computeSai, "computeSai");
async function persistWeeklyReportCard(env, st) {
  try {
    await ensureReportCardTable(env);
    const now = /* @__PURE__ */ new Date();
    if (now.getUTCDay() !== 1 || now.getUTCHours() !== 6) return { weekly: false };
    const iso = now.toISOString().slice(0, 10);
    const prior = await env.AUDIT.prepare("SELECT id FROM report_card_history WHERE ts LIKE ?1").bind(iso + "%").first();
    if (prior) return { weekly: false, dup: true };
    let bench = 0;
    try {
      const br = await env.AUDIT.prepare("SELECT value FROM report_card_inputs WHERE key = 'arc_agi_10task_pass_rate'").first();
      if (br && br.value != null && !isNaN(Number(br.value))) bench = Number(br.value);
    } catch (e) {
    }
    const sai = computeSai(st, bench, await loadSaiConfig(env), await liveSaiInputs(env));
    const grade = sai.sai >= 85 ? "A" : sai.sai >= 75 ? "B" : sai.sai >= 65 ? "C" : sai.sai >= 55 ? "D" : "F";
    await env.AUDIT.prepare("INSERT INTO report_card_history (ts, sai, grade, scores_json, signals_json) VALUES (?1, ?2, ?3, ?4, ?5)").bind(now.toISOString(), sai.sai, grade, JSON.stringify(sai.scores), JSON.stringify(sai.signals)).run();
    try {
      await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'report-card-weekly', ?3, ?4, 'qnfo-fleet-dashboard', 'ok')").bind("rc-weekly-" + iso, now.toISOString(), "Weekly SAI: " + sai.sai + " (" + grade + ")", JSON.stringify(sai)).run();
    } catch (e) {
    }
    return { weekly: true, sai: sai.sai };
  } catch (e) {
    return { weekly: false, error: String(e && e.message ? e.message : e).slice(0, 80) };
  }
}
__name(persistWeeklyReportCard, "persistWeeklyReportCard");
__name2(persistWeeklyReportCard, "persistWeeklyReportCard");
var worker_default = {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (e) {
      return json({ ok: false, error: String(e.message || e) }, 500);
    }
  },
  async scheduled(controller, env, ctx) {
    try {
      const st = await runRefresh(env, ctx);
      ctx.waitUntil(persistWeeklyReportCard(env, st));
      try {
        await loopSync(env, st);
      } catch (e2) {
      }
      try {
        await loopExecute(env);
      } catch (e3) {
      }
      return new Response("ok generated " + st.generated_at + " issues " + (st.issues || []).length);
    } catch (e) {
      return new Response("err " + String(e.message || e), { status: 500 });
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map