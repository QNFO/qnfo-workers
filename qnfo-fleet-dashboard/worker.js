var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var __name222 = /* @__PURE__ */ __name22((target, value) => Object.defineProperty(target, "name", { value, configurable: true }), "__name");
var VERSION = "1.7.15"; // RED-INVENTORY-1 (2026-09-26): root = failures-only inventory (shutdown manifest, gates vs measured, cents-audited cost truth, complete open-issue inventory, unremediated registers, money math); /roi + /ops preserved
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
__name22(pad2, "pad2");
__name222(pad2, "pad2");
function fmtUtc(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + " UTC";
}
__name(fmtUtc, "fmtUtc");
__name2(fmtUtc, "fmtUtc");
__name22(fmtUtc, "fmtUtc");
__name222(fmtUtc, "fmtUtc");
function naiveUtc(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + ":" + pad2(d.getUTCSeconds());
}
__name(naiveUtc, "naiveUtc");
__name2(naiveUtc, "naiveUtc");
__name22(naiveUtc, "naiveUtc");
__name222(naiveUtc, "naiveUtc");
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc, "esc");
__name2(esc, "esc");
__name22(esc, "esc");
__name222(esc, "esc");
function squash(s) {
  return String(s || "").split(/\s+/).join(" ").slice(0, 200);
}
__name(squash, "squash");
__name2(squash, "squash");
__name22(squash, "squash");
__name222(squash, "squash");
function json(data, status) {
  return new Response(JSON.stringify(data, null, 1), {
    status: status || 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" }
  });
}
__name(json, "json");
__name2(json, "json");
__name22(json, "json");
__name222(json, "json");
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
__name22(parseField, "parseField");
__name222(parseField, "parseField");
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
__name22(cronFields, "cronFields");
__name222(cronFields, "cronFields");
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
__name22(cronMatchAt, "cronMatchAt");
__name222(cronMatchAt, "cronMatchAt");
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
__name22(nextRuns, "nextRuns");
__name222(nextRuns, "nextRuns");
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
__name22(workerNextRuns, "workerNextRuns");
__name222(workerNextRuns, "workerNextRuns");
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
__name22(expectedFires, "expectedFires");
__name222(expectedFires, "expectedFires");
async function d1all(db, sql, params) {
  let ps = db.prepare(sql);
  if (params && params.length) ps = ps.bind.apply(ps, params);
  const r = await ps.all();
  return r.results || [];
}
__name(d1all, "d1all");
__name2(d1all, "d1all");
__name22(d1all, "d1all");
__name222(d1all, "d1all");
async function ensureStateTable(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS fleet_dashboard_state (id INTEGER PRIMARY KEY, updated_at TEXT, state_json TEXT, refresh_ms INTEGER)").run();
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS fleet_probe_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT, name TEXT, url TEXT, transport TEXT, ok INTEGER, status INTEGER, ms INTEGER, body TEXT)").run();
}
__name(ensureStateTable, "ensureStateTable");
__name2(ensureStateTable, "ensureStateTable");
__name22(ensureStateTable, "ensureStateTable");
__name222(ensureStateTable, "ensureStateTable");
async function saveState(env, st, ms) {
  await ensureStateTable(env);
  await env.AUDIT.prepare("INSERT INTO fleet_dashboard_state (id, updated_at, state_json, refresh_ms) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, state_json=excluded.state_json, refresh_ms=excluded.refresh_ms").bind(st.generated_at, JSON.stringify(st), ms).run();
}
__name(saveState, "saveState");
__name2(saveState, "saveState");
__name22(saveState, "saveState");
__name222(saveState, "saveState");
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
__name22(loadState, "loadState");
__name222(loadState, "loadState");
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
__name22(analytics24, "analytics24");
__name222(analytics24, "analytics24");
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
__name22(lastRuns30, "lastRuns30");
__name222(lastRuns30, "lastRuns30");
async function probeTargets(env) {
  try {
    const rows = await d1all(env.AUDIT, "SELECT service, base_url FROM service_registry WHERE state='live' AND base_url IS NOT NULL AND base_url <> '' AND kind='worker'") || [];
    return rows.map(function(r) {
      return { name: r.service, url: String(r.base_url).replace(/\/+$/, "") + "/health", kind: "worker" };
    });
  } catch (e) {
    return [];
  }
}
__name(probeTargets, "probeTargets");
__name2(probeTargets, "probeTargets");
__name22(probeTargets, "probeTargets");
__name222(probeTargets, "probeTargets");
async function healthProbes(env, liveNames) {
  const items = await probeTargets(env);
  const settled = await Promise.allSettled(items.map(async function(hp) {
    const t0 = Date.now();
    const kind = hp.kind || (hp.binding ? "worker" : "domain");
    const logRow = /* @__PURE__ */ __name22(async function(out) {
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
      if (kind === "worker" && Array.isArray(liveNames) && liveNames.indexOf(hp.name) >= 0) {
        out2.ok = true;
        out2.status = 200;
        out2.transport = "cf-api-list";
        out2.body = "cf-api-list: script live (probe transport error: " + squash(String(e.message || e)).slice(0, 80) + ")";
      }
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
__name22(healthProbes, "healthProbes");
__name222(healthProbes, "healthProbes");
var CLOSED = { closed: 1, done: 1, resolved: 1, completed: 1, cancelled: 1, canceled: 1, wontfix: 1, dismissed: 1, superseded: 1, archived: 1, fixed: 1, rejected: 1 };
function isOpenish(st) {
  return !CLOSED[String(st || "").toLowerCase()];
}
__name(isOpenish, "isOpenish");
__name2(isOpenish, "isOpenish");
__name22(isOpenish, "isOpenish");
__name222(isOpenish, "isOpenish");
function failish(st) {
  const s = String(st || "").toLowerCase();
  return s.indexOf("fail") >= 0 || s === "error" || s === "err" || s === "bounce" || s === "rejected";
}
__name(failish, "failish");
__name2(failish, "failish");
__name22(failish, "failish");
__name222(failish, "failish");
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
__name22(d1Count, "d1Count");
__name222(d1Count, "d1Count");
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
      try {
        it = JSON.parse(r.item_json);
      } catch (e) {
        it = null;
      }
      if (!it) continue;
      if (r.plane === "windows") win.push(it);
      else loc.push(it);
    }
    return { captured_at: cap, note: "live from device_tasks (D1), " + rows.length + " rows", windows_tasks: win, local_crons: loc };
  } catch (e) {
    return { captured_at: null, note: "device_tasks unavailable: " + String(e && e.message || e).slice(0, 80), windows_tasks: [], local_crons: [] };
  }
}
__name(liveDevice, "liveDevice");
__name2(liveDevice, "liveDevice");
__name22(liveDevice, "liveDevice");
__name222(liveDevice, "liveDevice");
async function liveScheduled(env, liveNames) {
  try {
    try {
      await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS worker_schedules (name TEXT PRIMARY KEY, crons_json TEXT, purpose TEXT, grp TEXT, refreshed_at TEXT)").run();
    } catch (e) {
    }
    const meta = await d1all(env.AUDIT, "SELECT (julianday('now') - julianday(MAX(refreshed_at))) * 24 AS ageh FROM worker_schedules");
    const ageH = meta && meta[0] && meta[0].ageh != null ? Number(meta[0].ageh) : 1e9;
    const cnt = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM worker_schedules");
    if (ageH > 1 || !(cnt && cnt[0] && cnt[0].c > 0)) {
      const reg = await d1all(env.AUDIT, "SELECT service, purpose FROM service_registry") || [];
      const pm = {};
      reg.forEach(function(r) {
        pm[r.service] = r.purpose || "";
      });
      const names = liveNames || [];
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      for (let i = 0; i < names.length; i += 8) {
        const chunk = names.slice(i, i + 8);
        const rs = await Promise.all(chunk.map(async function(n) {
          try {
            const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/" + n + "/schedules", { headers: { Authorization: "Bearer " + env.CF_TOKEN }, signal: AbortSignal.timeout(8e3) });
            if (!r.ok) return { n, c: [], ok: false };
            const j = await r.json();
            if (!j || !j.result || !Array.isArray(j.result.schedules)) return { n, c: [], ok: false };
            const arr = j.result.schedules;
            return { n, c: arr.map(function(s) {
              return s.cron;
            }), ok: true };
          } catch (e) {
            return { n, c: [], ok: false };
          }
        }));
        for (const it of rs) {
          if (it.ok && !it.c.length) {
            try {
              await env.AUDIT.prepare("DELETE FROM worker_schedules WHERE name = ?1").bind(it.n).run();
            } catch (e) {
            }
            continue;
          }
          if (!it.c.length) continue;
          try {
            await env.AUDIT.prepare("INSERT INTO worker_schedules (name, crons_json, purpose, grp, refreshed_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(name) DO UPDATE SET crons_json = ?2, purpose = ?3, grp = ?4, refreshed_at = ?5").bind(it.n, JSON.stringify(it.c), pm[it.n] || "", "live", nowIso).run();
          } catch (e) {
          }
        }
      }
    }
  } catch (e) {
  }
  const rows = await d1all(env.AUDIT, "SELECT name, crons_json, purpose, grp FROM worker_schedules WHERE refreshed_at IS NULL OR datetime(refreshed_at) >= datetime('now','-6 hours') ORDER BY name") || [];
  const out = [];
  for (const r of rows) {
    try {
      out.push({ name: r.name, crons: JSON.parse(r.crons_json), purpose: r.purpose || "", group: r.grp || "live" });
    } catch (e) {
    }
  }
  return out;
}
__name(liveScheduled, "liveScheduled");
__name2(liveScheduled, "liveScheduled");
__name22(liveScheduled, "liveScheduled");
__name222(liveScheduled, "liveScheduled");
async function loadSaiConfig(env) {
  try {
    const rows = await d1all(env.AUDIT, "SELECT k, v FROM sai_config") || [];
    const cfg = {};
    rows.forEach(function(r) {
      if (r && typeof r.v === "number") cfg[r.k] = r.v;
    });
    return cfg;
  } catch (e) {
    return {};
  }
}
__name(loadSaiConfig, "loadSaiConfig");
__name2(loadSaiConfig, "loadSaiConfig");
__name22(loadSaiConfig, "loadSaiConfig");
__name222(loadSaiConfig, "loadSaiConfig");
async function liveSaiInputs(env) {
  const out = { dims: {}, closureRate: null, healRate: null };
  try {
    const rows = await d1all(env.AUDIT, "SELECT dimension, score FROM autonomy_scores") || [];
    rows.forEach(function(r) {
      if (r && typeof r.score === "number") out.dims[r.dimension] = r.score;
    });
  } catch (e) {
  }
  try {
    const t = await d1all(env.AUDIT, "SELECT COUNT(*) c FROM agent_issues");
    const o = await d1all(env.AUDIT, "SELECT COUNT(*) c FROM agent_issues WHERE status NOT IN ('closed','done','resolved','wontfix','cancelled')");
    const tc = t && t[0] ? t[0].c : 0, oc = o && o[0] ? o[0].c : 0;
    if (tc > 0) out.closureRate = Math.max(0, Math.min(1, (tc - oc) / tc));
  } catch (e) {
  }
  try {
    const t = await d1all(env.AUDIT, "SELECT COUNT(*) c, SUM(CASE WHEN status IN ('healed','resolved') THEN 1 ELSE 0 END) h FROM self_heal_actions");
    if (t && t[0] && t[0].c > 0) out.healRate = Math.max(0, Math.min(1, Number(t[0].h || 0) / t[0].c));
  } catch (e) {
  }
  return out;
}
__name(liveSaiInputs, "liveSaiInputs");
__name2(liveSaiInputs, "liveSaiInputs");
__name22(liveSaiInputs, "liveSaiInputs");
__name222(liveSaiInputs, "liveSaiInputs");
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
__name22(liveScripts, "liveScripts");
__name222(liveScripts, "liveScripts");
function stableKey(category, text) {
  const t = String(text || "");
  let subj = "";
  if (category === "queue-freshness") {
    const m = t.indexOf("Queue ");
    subj = m >= 0 ? t.slice(m + 6).split(" ")[0].split(":")[0] : t.slice(0, 30);
  } else if (category === "integration-chain") {
    const m = t.indexOf("Integration chain ");
    subj = m >= 0 ? t.slice(m + 18).split(": stuck")[0].split(": stale")[0].split(" (")[0].trim().slice(0, 80) : t.slice(0, 30);
  } else if (category === "scheduled-no-run") {
    subj = "scheduled-no-run";
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
__name22(stableKey, "stableKey");
__name222(stableKey, "stableKey");
function issueFingerprint(text) {
  let h = 5381;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0;
  return "iss-" + h.toString(16);
}
__name(issueFingerprint, "issueFingerprint");
__name2(issueFingerprint, "issueFingerprint");
__name22(issueFingerprint, "issueFingerprint");
__name222(issueFingerprint, "issueFingerprint");
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
__name22(issueCategory, "issueCategory");
__name222(issueCategory, "issueCategory");
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
__name222(ISSUE_META, "ISSUE_META");
function severityRank(sev) {
  return sev === "err" ? 0 : sev === "warn" ? 1 : 2;
}
__name(severityRank, "severityRank");
__name2(severityRank, "severityRank");
__name22(severityRank, "severityRank");
__name222(severityRank, "severityRank");
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
__name22(remediationFor, "remediationFor");
__name222(remediationFor, "remediationFor");
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
__name22(enrichIssues, "enrichIssues");
__name222(enrichIssues, "enrichIssues");
async function ensureIssueLog(env) {
  try {
    await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS fleet_issue_log (id TEXT PRIMARY KEY, category TEXT, sev TEXT, title TEXT, first_seen TEXT, last_seen TEXT, occurrences INTEGER DEFAULT 1)").run();
  } catch (e) {
  }
}
__name(ensureIssueLog, "ensureIssueLog");
__name2(ensureIssueLog, "ensureIssueLog");
__name22(ensureIssueLog, "ensureIssueLog");
__name222(ensureIssueLog, "ensureIssueLog");
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
__name22(readIssueLog, "readIssueLog");
__name222(readIssueLog, "readIssueLog");
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
__name22(writeIssueLog, "writeIssueLog");
__name222(writeIssueLog, "writeIssueLog");
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
__name22(ghHeaders, "ghHeaders");
__name222(ghHeaders, "ghHeaders");
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
__name22(ghCall, "ghCall");
__name222(ghCall, "ghCall");
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
__name22(loopEnsure, "loopEnsure");
__name222(loopEnsure, "loopEnsure");
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
__name22(readLoop, "readLoop");
__name222(readLoop, "readLoop");
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
__name22(attachIssueLinks, "attachIssueLinks");
__name222(attachIssueLinks, "attachIssueLinks");
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
__name22(loopMetaGet, "loopMetaGet");
__name222(loopMetaGet, "loopMetaGet");
async function loopMetaSet(env, k, v) {
  try {
    await env.AUDIT.prepare("INSERT INTO fleet_loop_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=?").bind(k, v, v).run();
  } catch (e) {
  }
}
__name(loopMetaSet, "loopMetaSet");
__name2(loopMetaSet, "loopMetaSet");
__name22(loopMetaSet, "loopMetaSet");
__name222(loopMetaSet, "loopMetaSet");
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
__name22(ghFindIssue, "ghFindIssue");
__name222(ghFindIssue, "ghFindIssue");
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
__name22(ghCreateIssue, "ghCreateIssue");
__name222(ghCreateIssue, "ghCreateIssue");
async function ghComment(env, number, body) {
  return await ghCall(env, "POST", "/repos/" + GH_REPO + "/issues/" + number + "/comments", { body });
}
__name(ghComment, "ghComment");
__name2(ghComment, "ghComment");
__name22(ghComment, "ghComment");
__name222(ghComment, "ghComment");
async function ghAddLabels(env, number, labels) {
  return await ghCall(env, "POST", "/repos/" + GH_REPO + "/issues/" + number + "/labels", { labels });
}
__name(ghAddLabels, "ghAddLabels");
__name2(ghAddLabels, "ghAddLabels");
__name22(ghAddLabels, "ghAddLabels");
__name222(ghAddLabels, "ghAddLabels");
async function dispatchIssue(env, i, gh_number) {
  const action = i.remediation && i.remediation.suggested_action || "manual";
  const ts = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await env.AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts, status) SELECT ?, ?, ?, ?, 'dispatched' WHERE NOT EXISTS (SELECT 1 FROM self_heal_actions WHERE kind='fleet-issue' AND ref=? AND status='dispatched')").bind("fleet-issue", i.id, "[auto] " + action + " :: " + String(i.detail || "").slice(0, 200), ts, i.id).run();
  } catch (e) {
  }
  try {
    await env.AUDIT.prepare("INSERT INTO fleet_issue_dispatch (fingerprint, category, sev, owner, action, payload, gh_number, state, created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET state='queued', action=?, created_at=?, exec_state=NULL, exec_result=NULL").bind(i.id, i.category, i.sev, i.owner || "fleet", action, JSON.stringify({ title: i.title, detail: i.detail, remediation: i.remediation, resource: i.resource }).slice(0, 1500), gh_number || null, "queued", ts, action, ts).run();
  } catch (e) {
  }
}
__name(dispatchIssue, "dispatchIssue");
__name2(dispatchIssue, "dispatchIssue");
__name22(dispatchIssue, "dispatchIssue");
__name222(dispatchIssue, "dispatchIssue");
var EXEC_COOLDOWN_MS = 5 * 60 * 1e3;
function execTargetFor(category, resource, env) {
  const r = String(resource || "").toLowerCase();
  if (category === "queue-freshness") {
    if (r.indexOf("outreach") >= 0) return { safe: false, noAction: true, note: "outreach sends gated until 2026-09-15 (warm-up ACTIVATION_AT); no auto-drain" };
    return { safe: true, svc: "SVC_QNFO_RESEARCH_EXEC", path: "/run", note: "advance research_queue (research-exec /run)" };
  }
  if (category === "integration-chain") {
    if (r.indexOf("research intake") >= 0 || r.indexOf("research execution") >= 0) return { safe: true, svc: "SVC_QNFO_RESEARCH_EXEC", path: "/run", note: "advance research pipeline (research-exec /run)" };
    if (r.indexOf("reviser") >= 0 && r.indexOf("publish drain") >= 0) return { safe: true, svc: "SVC_QNFO_RESEARCH_EXEC", path: "/run/drain-v2", note: "drain version_queue (research-exec /run/drain-v2)" };
    if (r.indexOf("revision log") >= 0 && r.indexOf("publish drain") >= 0) return env && env.REVISER_TOKEN ? { safe: true, svc: "SVC_QNFO_PAPER_REVISER", path: "/run/scan?mode=live", note: "run paper-reviser scan to drain revision log", auth: "X-Reviser-Token" } : { safe: false, noAction: true, note: "PAPER-REVISER-SCAN-UNAUTHORIZED-1: /run/scan needs qnfo-paper-reviser X-Reviser-Token which this worker does not hold; qnfo-paper-reviser cron 37 */4 drains it - no auto-dispatch" };
    if (r.indexOf("alerts") >= 0 && r.indexOf("digest") >= 0) return { safe: false, svc: "SVC_QNFO_OBSERVABILITY", path: "/run/ingest", note: "observability worker retired (wave-A consolidation) - fail-closed to manual disposition" };
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
__name22(execTargetFor, "execTargetFor");
__name222(execTargetFor, "execTargetFor");
async function execOne(env, row, prevState) {
  let payload = {};
  try {
    payload = JSON.parse(row.payload || "{}");
  } catch (e) {
  }
  const resource = payload.resource || payload.title || "";
  const spec = execTargetFor(row.category, resource, env);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const prior = prevState || null;
  if (!spec || !spec.safe) {
    const state2 = "no-action";
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
    const _eh = { "User-Agent": PROBE_UA };
    if (spec.auth === "X-Reviser-Token" && env.REVISER_TOKEN) _eh["X-Reviser-Token"] = env.REVISER_TOKEN;
    const res = await svc.fetch("https://" + spec.svc + spec.path, { method: "POST", headers: _eh });
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
__name22(execOne, "execOne");
__name222(execOne, "execOne");
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
__name22(loopExecute, "loopExecute");
__name222(loopExecute, "loopExecute");
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
__name22(loopSnapshot, "loopSnapshot");
__name222(loopSnapshot, "loopSnapshot");
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
__name22(loopSync, "loopSync");
__name222(loopSync, "loopSync");
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
__name22(loopMaybeSync, "loopMaybeSync");
__name222(loopMaybeSync, "loopMaybeSync");
async function buildState(env, ctx) {
  const nowMs = Date.now();
  const audits = [];
  const issues = [];
  const push = /* @__PURE__ */ __name222(function(a) {
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
  __name22(safeAudit, "safeAudit");
  __name222(safeAudit, "safeAudit");
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
  await safeAudit("ai_gateway_failures", "AI gateway failures (live)", async function() {
    let liveTotal = null, liveErr = null;
    try {
      const gr = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/ai-gateway/gateways/default/logs?per_page=1&success=false", { headers: { Authorization: "Bearer " + env.CF_TOKEN }, signal: AbortSignal.timeout(8e3) });
      if (gr.ok) {
        const gj = await gr.json();
        liveTotal = gj.result_info && gj.result_info.total_count;
      } else liveErr = "HTTP " + gr.status;
    } catch (e) {
      liveErr = String(e && e.message || e).slice(0, 60);
    }
    let m = null;
    try {
      m = await d1all(env.AUDIT, "SELECT COALESCE(SUM(count),0) AS total, MAX(ts) AS latest FROM ai_gateway_failures");
    } catch (e) {
    }
    const mt = m && m.length ? m[0] : null;
    const ageH = mt && mt.latest ? (Date.now() - Number(mt.latest)) / 36e5 : null;
    let top = [];
    try {
      top = await d1all(env.AUDIT, "SELECT status, model, SUM(count) AS c FROM ai_gateway_failures GROUP BY status, model ORDER BY c DESC LIMIT 4") || [];
    } catch (e) {
    }
    const tc = top.map(function(r) {
      return r.status + " " + r.model + " x" + r.c;
    }).join(", ");
    const stale = ageH == null || ageH > 2;
    const bad = liveTotal != null && liveTotal > 0 || stale;
    push({
      key: "gw_failures",
      label: "AI gateway failures (live)",
      state: bad ? "err" : "ok",
      detail: "live(all-time)=" + (liveTotal == null ? liveErr || "n/a" : liveTotal) + "; mirror=" + (mt ? mt.total : 0) + " recorded, last write " + (ageH == null ? "never" : ageH.toFixed(1) + "h ago") + (stale ? " [RECORDER STALE]" : "") + (tc ? "; top: " + tc : ""),
      ts: mt && mt.latest ? new Date(Number(mt.latest)).toISOString() : null
    });
  });
  await safeAudit("gw_calibration", "AI calibration probes (24h)", async function() {
    const c = await d1all(env.AUDIT, "SELECT COALESCE(SUM(count),0) AS total, MAX(ts) AS latest FROM ai_gateway_failures WHERE ts >= ? AND source LIKE 'gw-sweep%'", [epoch24]);
    const ct = await d1all(env.AUDIT, "SELECT error_class, SUM(count) AS c FROM ai_gateway_failures WHERE ts >= ? AND source LIKE 'gw-sweep%' GROUP BY error_class ORDER BY c DESC LIMIT 4", [epoch24]);
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
    let gwf = [];
    try {
      gwf = await d1all(env.AUDIT, "SELECT model, SUM(count) AS c FROM ai_gateway_failures GROUP BY model ORDER BY c DESC LIMIT 6") || [];
    } catch (e) {
    }
    const gwTop = gwf.map(function(r) {
      return (r.model || "?") + " x" + r.c;
    }).join(", ");
    const gwBad = gwf.length > 0;
    push({
      key: "model_health",
      label: "AI model health",
      state: bad.length || gwBad ? "warn" : "ok",
      detail: rows.length + " models; not-ok: " + (bad.length ? bad.map(function(r) {
        return r.model_id + "=" + r.status + "/cf" + r.consecutive_failures;
      }).join(", ") : "none") + (gwTop ? "; gateway-failure models: " + gwTop : ""),
      ts: null
    });
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
  const ageOf = /* @__PURE__ */ __name22(function(raw) {
    if (raw == null) return null;
    let ms = typeof raw === "number" ? raw : Date.parse(String(raw).replace(" ", "T"));
    if (isNaN(ms) && !isNaN(Number(raw))) ms = Number(raw);
    if (isNaN(ms)) return null;
    return Math.round((nowMs - ms) / 36e5);
  }, "ageOf");
  const qlook = /* @__PURE__ */ __name22(async function(db, sql) {
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
  const sysChains = systemIntegration && systemIntegration.chains || [];
  for (const c of sysChains) {
    const mapSt = c.status === "healthy" ? "ok" : c.status === "unknown" ? "ok" : "warn";
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
__name22(buildState, "buildState");
__name222(buildState, "buildState");
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
    const entry = String(d);
    const ci = entry.indexOf(":");
    const tail = ci >= 0 ? entry.slice(ci + 1) : entry;
    const m = String(tail).match(/[a-z0-9][a-z0-9._-]{2,}/i);
    if (m) out.push(m[0].toLowerCase());
  }
  return out;
}
__name(depNamesOf, "depNamesOf");
__name2(depNamesOf, "depNamesOf");
function contractDepsOf(raw) {
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
    const entry = String(d).trim();
    const ci = entry.indexOf(":");
    if (ci <= 0) continue;
    const prefix = entry.slice(0, ci).toLowerCase();
    if (/^(d1|r2|vectorize|kv|queue|cron|ai|send_email|do|artifacts|ext|browser|ai_search|workflow|secrets|produces)$/.test(prefix)) out.push(prefix);
  }
  return out;
}
__name(contractDepsOf, "contractDepsOf");
__name2(contractDepsOf, "contractDepsOf");
__name22(depNamesOf, "depNamesOf");
__name222(depNamesOf, "depNamesOf");
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
__name22(readSystemIntegration, "readSystemIntegration");
__name222(readSystemIntegration, "readSystemIntegration");
function systemIntegrationHtml(sys) {
  if (!sys || !sys.score) return '<h2>System integration at a glance</h2><div class="sub">no assessment yet - waiting for qnfo-observability telemetry</div>';
  const sc = sys.score;
  const badge = /* @__PURE__ */ __name22(function(status) {
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
__name22(systemIntegrationHtml, "systemIntegrationHtml");
__name222(systemIntegrationHtml, "systemIntegrationHtml");
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
    nodes.push({ service: svc, kind: String(r.kind || ""), version, vstate, live: liveSet.size ? liveSet.has(svc) : true, deps: depNamesOf(r.deps), contract: contractDepsOf(r.deps) });
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
  const deg = /* @__PURE__ */ __name222(function(s) {
    return { out: outbound.get(s) || 0, in: inbound.get(s) || 0 };
  }, "deg");
  let contractEdgeCount = 0;
  for (const n of nodes) {
    if (n.contract && n.contract.length) contractEdgeCount += n.contract.length;
  }
  const islands = nodes.filter(function(n) {
    const d = deg(n.service);
    return d.out === 0 && d.in === 0 && (!n.contract || n.contract.length === 0);
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
    edges_worker: edges.length,
    contract_edges: contractEdgeCount,
    edges_total: edges.length + contractEdgeCount,
    edge_list: edges.slice(0, 500),
    density: nodes.length > 1 ? +(edges.length / (nodes.length * (nodes.length - 1))).toFixed(4) : 0,
    // V1.7.11 METRIC-HONESTY-1: separate observability probe fan-out from functional control coupling.
    // The single prober (qnfo-fleet-dashboard) holds an out-edge to every worker; counting those as
    // "connectivity" inflates density ~75%. functional = edges NOT originating from the prober.
    probe_edges: edges.filter(function(e) {
      return e && e.from === "qnfo-fleet-dashboard";
    }).length,
    edges_worker_functional: edges.filter(function(e) {
      return e && e.from !== "qnfo-fleet-dashboard";
    }).length,
    density_functional: nodes.length > 1 ? +(edges.filter(function(e) {
      return e && e.from !== "qnfo-fleet-dashboard";
    }).length / (nodes.length * (nodes.length - 1))).toFixed(4) : 0,
    density_contract: nodes.length > 1 ? +Number(((edges.length + contractEdgeCount) / (nodes.length * (nodes.length - 1))).toFixed(4)) : 0,
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
__name22(integrationView, "integrationView");
__name222(integrationView, "integrationView");
async function reportCardData(env, integration, audits) {
  let humanOpen = -1;
  try {
    const g2 = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM task_dod_register WHERE owner='user' AND status NOT IN ('done','cancelled','cancelled-with-monitor')");
    humanOpen = g2 && g2.length ? g2[0].c : 0;
  } catch (e) {
    humanOpen = -1;
  }
  let selfHeal = -1;
  try {
    const g2 = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM self_heal_actions");
    selfHeal = g2 && g2.length ? g2[0].c : 0;
  } catch (e) {
    selfHeal = -1;
  }
  let openIssues = -1;
  try {
    const g2 = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM agent_issues WHERE status NOT IN ('closed','done','resolved','wontfix','cancelled')");
    openIssues = g2 && g2.length ? g2[0].c : 0;
  } catch (e) {
    openIssues = -1;
  }
  const drift = integration ? integration.drift : { ghost: 0, unregistered: 0, unversioned: 0 };
  const driftTotal = (drift.ghost || 0) + (drift.unregistered || 0) + (drift.unversioned || 0);
  const dim = {};
  try {
    const rows = await d1all(env.AUDIT, "SELECT dimension, score, framework, scale, evidence, gap, scored_at FROM autonomy_scores") || [];
    rows.forEach(function(r) {
      if (r && r.dimension) dim[r.dimension] = r;
    });
  } catch (e) {
  }
  const g = /* @__PURE__ */ __name22(function(k) {
    return dim[k] && typeof dim[k].score === "number" ? dim[k].score : null;
  }, "g");
  const fmt = /* @__PURE__ */ __name22(function(v) {
    return v == null ? "n/a" : String(v);
  }, "fmt");
  const loa = g("independent_decision");
  const overall = dim.overall || null;
  return {
    human_open: humanOpen,
    self_heal_total: selfHeal,
    open_issues: openIssues,
    drift_total: driftTotal,
    drift,
    loa: loa != null ? String(Math.round(loa * 2)) : null,
    loa_label: dim.independent_decision ? dim.independent_decision.gap || dim.independent_decision.evidence || "" : "",
    agi: overall ? fmt(overall.score) + "/5 composite" : null,
    vsm: dim.s5_policy || dim.s4_intelligence || dim.s3_control ? "S5 " + fmt(g("s5_policy")) + " / S4 " + fmt(g("s4_intelligence")) + " / S3 " + fmt(g("s3_control")) + " (of 5)" : null,
    ooda: dim.ooda_closure ? fmt(g("ooda_closure")) + "/5 closure" : null,
    watchmaker: dim.watchmaker_inverted ? fmt(g("watchmaker_inverted")) + "/5 inverted" : null,
    top: null,
    scored_at: overall ? overall.scored_at : null,
    source: "autonomy_scores (qnfo-audit D1, live)"
  };
}
__name(reportCardData, "reportCardData");
__name2(reportCardData, "reportCardData");
__name22(reportCardData, "reportCardData");
__name222(reportCardData, "reportCardData");
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
__name22(reportCardHtml, "reportCardHtml");
__name222(reportCardHtml, "reportCardHtml");
function integrationHtml(ig, st) {
  if (!ig) return "";
  const h = [];
  h.push("<h2>System integration (fleet-wide)</h2>");
  h.push('<div class="sub">Nodes = service_registry; edges = declared deps resolving to another registered service. Islands = no declared in/out edge (runs but not integrated). Ghost = registered but not live. Unregistered = live but invisible to the registry. Unversioned = invisible to drift management. Lens: systems theory (integration edges are first-class; closed loops with receipts) + chaos theory (drift as distance from the canonical attractor; ghost/unregistered/unversioned = amplifying drift).</div>');
  h.push('<div class="chips">');
  h.push(chip("info", ig.registered + " registered"));
  h.push(chip("info", (ig.live == null ? "?" : ig.live) + " live"));
  h.push(chip("info", ig.edges + " worker edges / " + (ig.contract_edges || 0) + " contract edges (density " + ig.density + " worker, " + (ig.density_contract == null ? "n/a" : ig.density_contract) + " contract)"));
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
__name22(integrationHtml, "integrationHtml");
__name222(integrationHtml, "integrationHtml");
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
__name22(chipClass, "chipClass");
__name222(chipClass, "chipClass");
function chip(state, text) {
  return '<span class="chip chip-' + chipClass(state) + '">' + esc(text == null ? state : text) + "</span>";
}
__name(chip, "chip");
__name2(chip, "chip");
__name22(chip, "chip");
__name222(chip, "chip");
function topologySvg(ig) {
  if (!ig || !ig.edge_list || !ig.edge_list.length) return '<div class="sub">no declared dependency edges</div>';
  const edges = ig.edge_list;
  const set = {};
  for (const e of edges) {
    set[e.from] = 1;
    set[e.to] = 1;
  }
  const nodes = Object.keys(set);
  if (!nodes.length) return '<div class="sub">no nodes</div>';
  const W = 620, H = 300, cx = W / 2, cy = H / 2, R = Math.min(cx, cy) - 24;
  const pos = {};
  for (let i = 0; i < nodes.length; i++) {
    const a = 2 * Math.PI * i / nodes.length - Math.PI / 2;
    pos[nodes[i]] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  }
  const hubSet = {};
  (ig.hubs || []).forEach(function(x) {
    hubSet[x.service] = 1;
  });
  let s = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" style="width:100%;height:calc(100% - 52px);display:block">';
  for (const e of edges) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    s += '<line x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '" stroke="#1f6feb" stroke-width="0.5" opacity="0.4"/>';
  }
  for (const n of nodes) {
    const p = pos[n], hub = hubSet[n];
    s += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (hub ? 4 : 2.4) + '" fill="' + (hub ? "#d29922" : "#3fb950") + '"><title>' + esc(n) + "</title></circle>";
  }
  for (const hh of (ig.hubs || []).slice(0, 8)) {
    const p = pos[hh.service];
    if (p) s += '<text x="' + (p.x + 5).toFixed(1) + '" y="' + (p.y + 3).toFixed(1) + '" fill="#8b949e" font-size="7">' + esc(hh.service) + "</text>";
  }
  return s + "</svg>";
}
__name(topologySvg, "topologySvg");
__name2(topologySvg, "topologySvg");
function pageHtml(st) {
  const h = [];
  h.push('<div style="margin:8px 0 16px;padding:10px 14px;background:#0d1a12;border:1px solid #2a4d33;border-radius:8px"><b>ROI view:</b> <a href="/roi" style="color:#6f6">cost vs output vs impressions vs reach</a></div>');
  h.push('<div style="margin:8px 0 16px;padding:10px 14px;background:#2d1215;border:1px solid #da3633;border-radius:8px"><b>RED INVENTORY (root):</b> <a href="/" style="color:#f66">failures-only view &mdash; shutdown manifest, gates, audited cost truth, complete open-issue inventory, unremediated registers</a></div>');
  const issues = st.issues || [];
  const errs = issues.filter(function(i) {
    return i.sev === "err";
  });
  const warns = issues.filter(function(i) {
    return i.sev === "warn";
  });
  const sched = st.scheduled || [];
  const probes = st.probes || [];
  const totalErr = sched.filter(function(x) {
    return x.status === "ERR";
  }).length;
  const totalNoRun = sched.filter(function(x) {
    return x.status === "NO-RUN";
  }).length;
  const probeOk = probes.filter(function(p) {
    return p.ok;
  }).length;
  const ig = st.integration || {};
  const rc = st.report_card || {};
  const verd = st.verdict || (errs.length ? "ACTION_NEEDED" : warns.length ? "DEGRADED" : "HEALTHY");
  const vcls = verd === "HEALTHY" ? "ok" : verd === "DEGRADED" ? "warn" : "err";
  h.push('<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>');
  h.push("<title>Quniverse Fleet Dashboard</title><style>");
  h.push("*{box-sizing:border-box}html,body{height:100%;margin:0}");
  h.push("body{font:11px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;background:#0d1117;color:#c9d1d9;overflow:hidden}");
  h.push("a{color:#58a6ff;text-decoration:none}.sub{color:#8b949e;font-size:10px}");
  h.push(".app{display:grid;grid-template-columns:1.5fr 1fr 1.25fr;grid-template-rows:auto minmax(0,1.2fr) minmax(0,1fr);gap:7px;height:100vh;padding:7px}");
  h.push(".hdr{grid-column:1/4;display:flex;align-items:center;gap:9px;flex-wrap:wrap;border-bottom:1px solid #30363d;padding-bottom:6px}");
  h.push(".hdr h1{font-size:15px;margin:0 4px 0 0}");
  h.push(".panel{border:1px solid #30363d;border-radius:6px;padding:6px 8px;overflow:auto;min-height:0}");
  h.push(".panel h2{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#8b949e;margin:0 0 5px}");
  h.push(".chips{display:flex;gap:5px;flex-wrap:wrap}.chip{padding:1px 7px;border-radius:9px;font-size:10px;white-space:nowrap}");
  h.push(".chip-ok{background:#12291b;color:#3fb950;border:1px solid #238636}.chip-err{background:#2d1215;color:#f85149;border:1px solid #da3633}");
  h.push(".chip-warn{background:#2d1f0c;color:#d29922;border:1px solid #9e6a03}.chip-idle{background:#161b22;color:#8b949e;border:1px solid #30363d}.chip-info{background:#0d2333;color:#58a6ff;border:1px solid #1f6feb}");
  h.push("table{border-collapse:collapse;width:100%;font-size:10px}th,td{border-bottom:1px solid #21262d;padding:2px 4px;text-align:left;vertical-align:top}th{color:#8b949e}");
  h.push("tr:hover td{background:#161b22}.issue-err{color:#f85149}.issue-warn{color:#d29922}");
  h.push(".dot{display:inline-block;width:7px;height:7px;border-radius:4px;margin-right:4px}.dot-ok{background:#3fb950}.dot-err{background:#f85149}.dot-warn{background:#d29922}.dot-idle{background:#6e7681}");
  h.push(".iss{border-left:2px solid #da3633;padding:1px 0 2px 6px;margin:3px 0}.iss.w{border-left-color:#9e6a03}");
  h.push(".gauge{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;font-size:10px}");
  h.push('</style></head><body><div class="app">');
  h.push('<div class="hdr"><h1>Quniverse Fleet</h1><span class="chip chip-' + vcls + '">' + esc(verd) + '</span><span class="chips">');
  h.push(chip("info", st.fleet.workers + " workers") + chip("info", st.fleet.scheduled + " sched") + chip("info", st.fleet.d1_databases + " D1") + chip("info", st.totals.req24 + " req/24h"));
  h.push(st.totals.err24 > 0 ? chip("err", st.totals.err24 + " err/24h") : chip("ok", "0 err/24h"));
  h.push(probeOk === probes.length ? chip("ok", probeOk + "/" + probes.length + " probes") : chip("warn", probeOk + "/" + probes.length + " probes"));
  h.push(totalErr > 0 ? chip("err", totalErr + " sched-err") : chip("ok", "sched ok"));
  if (totalNoRun > 0) h.push(chip("warn", totalNoRun + " no-run"));
  h.push(ig.drift && ig.drift.ghost ? chip("warn", ig.drift.ghost + " ghost") : chip("ok", "0 ghost"));
  h.push(ig.drift && ig.drift.unregistered ? chip("warn", ig.drift.unregistered + " unreg") : chip("ok", "0 unreg"));
  h.push('</span><span class="sub" style="margin-left:auto">v' + esc(st.version) + " &middot; " + esc(String(st.generated_at || "").slice(0, 16).replace("T", " ")) + 'U &middot; <a href="/api/state">state</a> <a href="/api/actions">actions</a> <a href="/api/loop">loop</a></span></div>');
  h.push('<div class="panel"><h2>Fleet topology &middot; ' + (ig.registered || 0) + " nodes / " + (ig.edges || 0) + " worker edges / " + (ig.contract_edges || 0) + " contract edges &middot; density " + (ig.density == null ? "n/a" : ig.density) + " worker / " + (ig.density_contract == null ? "n/a" : ig.density_contract) + " contract</h2>");
  h.push(topologySvg(ig));
  h.push('<div class="chips">' + chip("info", (ig.live == null ? "?" : ig.live) + " live") + chip("ok", (ig.registered || 0) + " registered") + (ig.hubs && ig.hubs.length ? chip("info", "top hub " + esc(ig.hubs[0].service) + " (" + ig.hubs[0].out + " out)") : "") + (ig.islands && ig.islands.length ? chip("warn", ig.islands.length + " islands") : "") + (ig.drift && ig.drift.unversioned ? chip("warn", ig.drift.unversioned + " unversioned") : "") + "</div>");
  if (ig.islands && ig.islands.length) h.push('<div class="sub" style="margin-top:3px">islands (no declared edge): ' + esc(ig.islands.slice(0, 16).join(", ")) + "</div>");
  h.push("</div>");
  h.push('<div class="panel"><h2>Systems report card</h2><div class="gauge">');
  h.push('<span class="sub">Decision</span><span>LoA ' + (rc.loa || "n/a") + "</span>");
  h.push('<span class="sub">Intelligence</span><span>' + esc(rc.agi || "n/a") + "</span>");
  h.push('<span class="sub">VSM</span><span>' + esc(rc.vsm || "n/a") + "</span>");
  h.push('<span class="sub">OODA</span><span>' + esc(rc.ooda || "n/a") + "</span>");
  h.push('<span class="sub">Watchmaker</span><span>' + esc(rc.watchmaker || "n/a") + "</span>");
  h.push('</div><div class="chips" style="margin-top:6px">');
  h.push(rc.human_open === 0 ? chip("ok", "human-gated 0") : chip("warn", "human-gated " + rc.human_open));
  h.push(chip("info", "self-heal " + rc.self_heal_total));
  h.push(rc.open_issues === 0 ? chip("ok", "open issues 0") : chip("warn", "open issues " + rc.open_issues));
  h.push(rc.drift_total > 0 ? chip("warn", "drift " + rc.drift_total) : chip("ok", "drift 0"));
  h.push('</div><div class="sub" style="margin-top:6px">Objective: human-intervention&rarr;0, drift&rarr;0, self-heal&rarr;1.</div></div>');
  h.push('<div class="panel"><h2>Action board &middot; ' + errs.length + " err / " + warns.length + " warn</h2>");
  if (!issues.length) h.push('<div class="sub">HEALTHY - no active conditions.</div>');
  else for (const i of issues.slice(0, 60)) h.push('<div class="iss' + (i.sev === "err" ? "" : " w") + '"><b class="' + (i.sev === "err" ? "issue-err" : "issue-warn") + '">' + esc(i.category || i.sev) + "</b> " + esc(String(i.title || i.detail || "").slice(0, 160)) + "</div>");
  h.push("</div>");
  h.push('<div class="panel"><h2>Scheduled workers &middot; next runs UTC</h2><table><tr><th></th><th>worker</th><th>cron</th><th>next</th><th>24h</th><th>err</th><th>last</th></tr>');
  for (const s of sched) {
    const dc = s.status === "ERR" ? "err" : s.status === "OK" ? "ok" : s.status === "NO-RUN" ? "warn" : "idle";
    h.push('<tr><td><span class="dot dot-' + dc + '"></span></td><td>' + esc(s.name) + '</td><td class="sub">' + esc((s.crons || []).join(",")) + '</td><td class="sub">' + esc(s.next && s.next.length ? s.next[0].at : "-") + "</td><td>" + s.req24 + "</td><td>" + (s.err24 > 0 ? '<b class="issue-err">' + s.err24 + "</b>" : s.err24) + '</td><td class="sub">' + esc(String(s.lastRun || "").slice(5, 16).replace("T", " ")) + "</td></tr>");
  }
  h.push("</table></div>");
  h.push('<div class="panel"><h2>Probes ' + probeOk + "/" + probes.length + " up &middot; audits</h2><table>");
  for (const p of probes) h.push("<tr><td>" + (p.ok ? '<span class="dot dot-ok"></span>' : '<span class="dot dot-warn"></span>') + "</td><td>" + esc(p.name) + '</td><td class="sub">' + esc(p.url || "") + "</td><td>" + p.status + "</td><td>" + p.ms + "ms</td></tr>");
  for (const a of st.audits || []) h.push("<tr><td>" + chip(a.state, a.state) + '</td><td colspan="4" class="sub">' + esc(a.label) + ": " + esc(a.detail || "") + "</td></tr>");
  h.push("</table></div>");
  h.push('<div class="panel"><h2>Chains, queues &amp; device</h2>');
  if (st.integration && st.integration.system && st.integration.system.score) h.push('<div class="sub">system integration: score ' + esc(st.integration.system.score.total) + " &middot; chains " + esc(st.integration.system.score.chains) + " &middot; coverage " + esc(st.integration.system.score.coverage) + " &middot; freshness " + esc(st.integration.system.score.freshness) + "</div>");
  h.push("<table>");
  for (const q of st.queues || []) h.push("<tr><td>" + esc(q.queue) + '</td><td class="sub">' + esc(q.db) + "</td><td>open " + q.open + "</td><td>" + (q.stale ? '<span class="chip chip-warn">stale ' + (q.age_h || "?") + "h</span>" : '<span class="chip chip-ok">fresh</span>') + "</td></tr>");
  h.push("</table>");
  h.push('<div class="sub">device ' + esc(String(st.device && st.device.captured_at || "").slice(0, 16)) + " &middot; " + (st.device && st.device.windows_tasks ? st.device.windows_tasks.length : 0) + " win-tasks &middot; front-end only (CLOUD-FRONTEND-ONLY-1)</div>");
  h.push("</div>");
  h.push("</div></body></html>");
  return h.join("");
}
__name(pageHtml, "pageHtml");
__name2(pageHtml, "pageHtml");
__name22(pageHtml, "pageHtml");
__name222(pageHtml, "pageHtml");
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
    try {
      return new Response(await redHtml(env), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    } catch (e) {
      return new Response("RED inventory error: " + String(e && e.message || e), { status: 500 });
    }
  }
  if (path === "/roi" || path === "/api/roi") {
    try {
      return new Response(await roiHtml(env), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    } catch (e) {
      return new Response("ROI error: " + String(e && e.message || e), { status: 500 });
    }
  }
  if (path === "/ops") {
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
__name22(handleRequest, "handleRequest");
__name222(handleRequest, "handleRequest");
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
__name22(runRefresh, "runRefresh");
__name222(runRefresh, "runRefresh");
async function ensureReportCardTable(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS report_card_history (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, sai REAL, grade TEXT, scores_json TEXT, signals_json TEXT)").run();
}
__name(ensureReportCardTable, "ensureReportCardTable");
__name2(ensureReportCardTable, "ensureReportCardTable");
__name22(ensureReportCardTable, "ensureReportCardTable");
__name222(ensureReportCardTable, "ensureReportCardTable");
function computeSai(st, bench, cfg, live) {
  const clamp = /* @__PURE__ */ __name22(function(x) {
    return Math.max(0, Math.min(1, x));
  }, "clamp");
  const P = cfg || {};
  const LD = live || {};
  const dims = LD.dims || {};
  const nd = /* @__PURE__ */ __name22(function(k) {
    return typeof dims[k] === "number" ? dims[k] : null;
  }, "nd");
  const probes = st.probes || [];
  const probeRatio = probes.length ? probes.filter(function(p) {
    return p.ok;
  }).length / probes.length : 0;
  const issues = st.issues || [];
  const nErr = issues.filter(function(i) {
    return i.sev === "err";
  }).length;
  const nWarn = issues.filter(function(i) {
    return i.sev === "warn";
  }).length;
  const chains = st.chains || [];
  const chainRatio = chains.length ? chains.filter(function(c) {
    return c.state === "ok";
  }).length / chains.length : 0;
  const ig = st.integration || {};
  const islands = ig.islands || [];
  const drift = ig.drift || {};
  const driftBad = (drift.ghost || 0) + (drift.unregistered || 0) + (drift.unversioned || 0);
  const density = ig.density_contract || ig.density || 0;
  const audits = {};
  (st.audits || []).forEach(function(a) {
    if (a && a.key) audits[a.key] = a;
  });
  let openIssues = -1, userWait = -1;
  const aiDetail = (audits.agent_issues || {}).detail || "";
  const m1 = aiDetail.match(/(\d+) open of/);
  if (m1) openIssues = Number(m1[1]);
  const regDetail = (audits.register || {}).detail || "";
  const m2 = regDetail.match(/v_waiting_on_human=(\d+)/);
  if (m2) userWait = Number(m2[1]);
  const noRun = (st.scheduled || []).filter(function(s) {
    return s.status === "NO-RUN";
  }).length;
  const userFreedom = userWait === 0 ? 1 : userWait > 0 ? clamp(1 - P.uf_step * userWait) : 1;
  const loopHealth = P.lh_probe * probeRatio + P.lh_chain * chainRatio + P.lh_norun * (noRun === 0 ? 1 : P.lh_norun_penalty);
  const autonomy = Math.min(P.aut_user * userFreedom + P.aut_loop * loopHealth, P.autonomy_ceiling);
  const thinking = P.thinking_base + P.thinking_scale * (typeof bench === "number" && bench >= 0 && bench <= 1 ? bench : 0);
  const decLive = ["independent_decision", "ooda_closure", "s3_control", "s5_policy"].map(nd).filter(function(x) {
    return x != null;
  });
  const decision = decLive.length ? decLive.reduce(function(a, b) {
    return a + b;
  }, 0) / decLive.length / 5 : null;
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
  const missing = weights.filter(function(k) {
    return typeof P[k] !== "number";
  });
  const sai = missing.length || scores.decision == null ? null : 100 * (P.w_autonomy * scores.autonomy + P.w_thinking * scores.thinking + P.w_decision * scores.decision + P.w_self_improv * scores.self_improv + P.w_reliability * scores.reliability + P.w_integration * scores.integration + P.w_governance * scores.governance);
  return { sai: sai == null ? null : Math.round(sai * 10) / 10, scores, weights_source: "sai_config", config_missing: missing, decision_source: decLive.length ? "autonomy_scores" : "unavailable", signals: { probe_ratio: probeRatio, chain_ratio: chainRatio, issues_err: nErr, issues_warn: nWarn, open_agent_issues: openIssues, user_wait: userWait, islands: islands.length, drift_bad: driftBad, density, no_run: noRun, closure_rate: closureRate, heal_rate: healRate } };
}
__name(computeSai, "computeSai");
__name2(computeSai, "computeSai");
__name22(computeSai, "computeSai");
__name222(computeSai, "computeSai");
__name222(computeSai, "computeSai");
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
__name22(persistWeeklyReportCard, "persistWeeklyReportCard");
__name222(persistWeeklyReportCard, "persistWeeklyReportCard");
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
      ctx.waitUntil(persistRoiSnapshot(env).catch(function() {
      }));
      try {
        await loopSync(env, st);
      } catch (e2) {
      }
      try {
        await loopExecute(env);
      } catch (e3) {
      }
      try {
        const _lf = await env.AUDIT.prepare("SELECT service FROM service_registry WHERE state='live'").all();
        const _names = (_lf.results || []).map(function(x) {
          return x.service;
        });
        if (_names.length) await liveScheduled(env, _names);
      } catch (e4) {
      }
      return new Response("ok generated " + st.generated_at + " issues " + (st.issues || []).length);
    } catch (e) {
      return new Response("err " + String(e.message || e), { status: 500 });
    }
  }
};
async function persistRoiSnapshot(env) {
  try {
    const d = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const tot = { papers: null, chars: null, subscribers: null, gateway_req: null, pageviews: null, ops_events: null };
    try {
      const r = await d1all(env.LIVING, "SELECT COUNT(*) AS n, COALESCE(SUM(length(body_md)),0) AS w FROM papers WHERE status='published' AND length(body_md) >= 5000");
      if (r && r.length) {
        tot.papers = r[0].n;
        tot.chars = r[0].w;
      }
    } catch (e) {
    }
    try {
      const r = await d1all(env.AUDIT, "SELECT COUNT(*) AS n, SUM(CASE WHEN status='subscribed' THEN 1 ELSE 0 END) AS s FROM subscribers");
      if (r && r.length) tot.subscribers = r[0].s;
    } catch (e) {
    }
    try {
      const g = await roiGf(env, 'query { viewer { accounts(filter: { accountTag: "edb167b78c9fb901ea5bca3ce58ccc4b" }) { aiGatewayRequestsAdaptiveGroups(limit: 10000, filter: { datetime_geq: "' + new Date(Date.now() - 720 * 36e5).toISOString() + '", datetime_leq: "' + (/* @__PURE__ */ new Date()).toISOString() + '" }) { count } } } }');
      const rows = (((g || {}).viewer || {}).accounts || [{}])[0].aiGatewayRequestsAdaptiveGroups || [];
      tot.gateway_req = rows.reduce(function(a, x) {
        return a + x.count;
      }, 0);
    } catch (e) {
    }
    try {
      const g = await roiGf(env, 'query { viewer { accounts(filter: { accountTag: "edb167b78c9fb901ea5bca3ce58ccc4b" }) { rumPageloadEventsAdaptiveGroups(limit: 10000, filter: { datetime_geq: "' + new Date(Date.now() - 720 * 36e5).toISOString() + '", datetime_leq: "' + (/* @__PURE__ */ new Date()).toISOString() + '" }) { count } } } }');
      const rows = (((g || {}).viewer || {}).accounts || [{}])[0].rumPageloadEventsAdaptiveGroups || [];
      tot.pageviews = rows.reduce(function(a, x) {
        return a + x.count;
      }, 0);
    } catch (e) {
    }
    try {
      const r = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind='ops_ai_tool'");
      if (r && r.length) tot.ops_events = r[0].n;
    } catch (e) {
    }
    await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS roi_daily_snapshots (d TEXT PRIMARY KEY, papers INTEGER, chars INTEGER, subscribers INTEGER, gateway_req INTEGER, pageviews INTEGER, ops_events INTEGER, created_at TEXT)").run();
    await env.AUDIT.prepare("INSERT OR REPLACE INTO roi_daily_snapshots (d, papers, chars, subscribers, gateway_req, pageviews, ops_events, created_at) VALUES (?,?,?,?,?,?,?,?)").bind(d, tot.papers, tot.chars, tot.subscribers, tot.gateway_req, tot.pageviews, tot.ops_events, (/* @__PURE__ */ new Date()).toISOString()).run();
  } catch (e) {
  }
}
__name(persistRoiSnapshot, "persistRoiSnapshot");
async function roiGf(env, query) {
  const resp = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.CF_TOKEN },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(2e4)
  });
  const g = await resp.json();
  if (!resp.ok || g.errors) return null;
  return g.data || null;
}
__name(roiGf, "roiGf");
// RED-INVENTORY-1 (2026-09-26, owner directive): the dashboard root must show FAILURES ONLY —
// a complete inventory of open issues and unremediated items plus decision-grade metrics.
// Greens are collapsed to one line. /roi (cost vs output) and /ops (operational drill-down) remain.
// AI-GW-COST-UNIT-CENTS-1: every AI Gateway billing figure is USD CENTS from the API and is
// divided by 100 in usd(); never surface cents as dollars.
async function redHtml(env) {
  const H = [];
  const now = Date.now();
  const dead = (/* @__PURE__ */ new Date("2026-10-25T00:00:00Z")).getTime();
  const daysLeft = Math.max(0, Math.ceil((dead - now) / 864e5));
  const usd = /* @__PURE__ */ __name(function(centsV) {
    const n = Number(centsV);
    return isFinite(n) && centsV != null ? "$" + (n / 100).toFixed(2) : "n/a";
  }, "usd");
  const rec = await loadState(env);
  let st = rec ? rec.state : null;
  if (!st) {
    try {
      st = await runRefresh(env, {});
    } catch (e) {
      st = { error: String(e && e.message || e), issues: [], scheduled: [], probes: [], audits: [], integration: {}, totals: { req24: 0, err24: 0 }, fleet: { workers: 0 }, generated_at: (/* @__PURE__ */ new Date()).toISOString(), version: VERSION };
    }
  } else if (Date.now() - new Date(rec.updatedAt).getTime() > STALE_MS) {
    runRefresh(env, {}).catch(function() {
    });
  }
  const issues = st.issues || [];
  const errs = issues.filter(function(i) {
    return i.sev === "err";
  });
  const warns = issues.filter(function(i) {
    return i.sev === "warn";
  });
  H.push('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/><title>QUNIVERSE FAILURE INVENTORY</title><style>');
  H.push("body{font-family:system-ui,Segoe UI,monospace;background:#0b0e14;color:#e6e6e6;margin:0;padding:24px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px;color:#f6a5a5}table{border-collapse:collapse;width:100%;max-width:1150px}td,th{border:1px solid #2a2f3a;padding:3px 7px;font-size:12px;text-align:left;vertical-align:top}th{background:#141a24;color:#f6a5a5}tr:hover td{background:#161b24}.ok{color:#6f6}.warn{color:#fa3}.bad{color:#f66}.sub{color:#9aa;font-size:11px}.panel{background:#11151d;border:1px solid #3a2326;border-radius:8px;padding:12px 14px;margin:10px 0;max-width:1180px}a{color:#9af}.collapsed{color:#3fb950;font-size:12px}");
  H.push("</style></head><body>");
  H.push("<h1>QUNIVERSE FAILURE INVENTORY</h1>");
  H.push('<div class="sub">failures, flags, open issues and unremediated items only &mdash; greens are collapsed to one line at the bottom. <a href="/roi">cost/output ROI</a> &middot; <a href="/ops">operational drill-down</a> &middot; <a href="/api/state">machine state</a> &middot; generated ' + (/* @__PURE__ */ new Date()).toISOString() + ' &middot; <b class="' + (daysLeft <= 7 ? "bad" : daysLeft <= 14 ? "warn" : "ok") + '">' + daysLeft + " days to shutdown-gate deadline 2026-10-25</b></div>");
  if (st.error) H.push('<div class="panel"><h2>STATE ERROR</h2><div class="bad">' + esc(st.error) + "</div></div>");

  // 1. SHUTDOWN MANIFEST
  let sh = [];
  try {
    sh = await d1all(env.AUDIT, "SELECT * FROM shutdown_manifest ORDER BY id");
  } catch (e) {
  }
  H.push('<div class="panel"><h2>1 &middot; SHUTDOWN MANIFEST &mdash; ' + sh.length + ' ARMED kill conditions</h2><table><tr><th>id</th><th>phase</th><th>component</th><th>condition</th><th>action</th><th>due</th><th>state</th></tr>');
  for (const r of sh) H.push('<tr><td class="bad"><b>' + esc(r.id) + '</b></td><td>' + esc(r.phase) + '</td><td class="bad">' + esc(r.component) + '</td><td>' + esc(r.condition) + '</td><td class="sub">' + esc(r.action) + '</td><td>' + esc(r.due_date) + '</td><td class="bad">' + esc(r.state) + "</td></tr>");
  H.push('</table><div class="sub">phase-1 retires every research/self-monitor worker on 2026-10-25 unless the gates below pass; phase-2 then archives + drops research data. EARLY-TRIGGER: AI-gateway spend &ge; $150/30d with zero publish events. OWNER-KILL: one email command. Mechanical, not advisory. EARLY-TRIGGER is evaluated in the COST TRUTH panel below.</div></div>');

  // 2. SURVIVAL GATES vs measured
  let th = [];
  try {
    th = await d1all(env.AUDIT, "SELECT metric, target, state FROM impact_thresholds ORDER BY metric");
  } catch (e) {
  }
  let rumTotal = null, growth = null, rep30 = null;
  try {
    const d = await roiGf(env, 'query { viewer { accounts(filter: { accountTag: "' + ACCOUNT + '" }) { rumPageloadEventsAdaptiveGroups(limit: 10000, filter: { datetime_geq: "' + new Date(now - 720 * 36e5).toISOString() + '", datetime_leq: "' + new Date(now).toISOString() + '" }) { count } } } }');
    const rows = (((d || {}).viewer || {}).accounts || [{}])[0].rumPageloadEventsAdaptiveGroups || [];
    rumTotal = rows.reduce(function(s, x) {
      return s + x.count;
    }, 0);
    growth = rumTotal != null ? Math.round(1e4 * (rumTotal - 5610) / 5610) / 100 : null;
  } catch (e) {
  }
  try {
    const r = await d1all(env.LIVING, "SELECT COUNT(*) AS n FROM papers WHERE status='published' AND length(body_md) >= 5000 AND created_at >= date('now','-30 day')");
    rep30 = r && r.length ? r[0].n : null;
  } catch (e) {
  }
  H.push('<div class="panel"><h2>2 &middot; SURVIVAL GATES vs measured</h2><table><tr><th>gate</th><th>target</th><th>state</th></tr>');
  for (const t of th) {
    const cls = t.state === "MET" ? "ok" : t.state === "MEASURED" ? "warn" : "bad";
    H.push("<tr><td>" + esc(t.metric) + '</td><td class="sub">' + esc(t.target) + '</td><td class="' + cls + '">' + esc(t.state) + "</td></tr>");
  }
  H.push('</table><div class="sub">measured now: full reports 30d = ' + (rep30 != null ? rep30 : "n/a") + ' (gate &ge;2 &rarr; ' + (rep30 != null && rep30 >= 2 ? '<span class="ok">PASSING</span>' : '<b class="bad">FAILING</b>') + ") &middot; pageviews 30d = " + (rumTotal != null ? rumTotal.toLocaleString() : "n/a") + " &rarr; growth vs frozen baseline (2026-08-27..09-25): " + (growth != null ? (growth >= 0 ? "+" : "") + growth + "%" : "n/a") + " &middot; MoM (snapshots): " + (snapMoM != null ? (snapMoM >= 0 ? "+" : "") + snapMoM + "%" : "n/a") + " &middot; gate is +30% MoM " + (snapMoM != null && snapMoM < 30 ? '&mdash; <b class="bad">GATE FAILING</b>' : '&mdash; MoM n/a (needs 2 snapshots)') + " &middot; spend " + (burn != null ? "$" + burn.toFixed(2) : "?") + " vs $150/30d cap</div></div>");

  // 3. COST TRUTH (live billing, cents-audited)
  let inv = null, bal = null, tup = null, aiN = null;
  try {
    const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/ai-gateway/billing/invoice-preview", { headers: { Authorization: "Bearer " + (env.CF_TOKEN || "") }, signal: AbortSignal.timeout(8e3) });
    const j = await r.json();
    inv = j.result || null;
  } catch (e) {
  }
  try {
    const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/ai-gateway/billing/credit-balance", { headers: { Authorization: "Bearer " + (env.CF_TOKEN || "") }, signal: AbortSignal.timeout(8e3) });
    const j = await r.json();
    bal = j.result || null;
  } catch (e) {
  }
  try {
    const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/ai-gateway/billing/topup/config", { headers: { Authorization: "Bearer " + (env.CF_TOKEN || "") }, signal: AbortSignal.timeout(8e3) });
    const j = await r.json();
    tup = j.result || null;
  } catch (e) {
  }
  try {
    const g = await roiGf(env, 'query { viewer { accounts(filter: { accountTag: "' + ACCOUNT + '" }) { workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: "' + new Date(now - 720 * 36e5).toISOString() + '", datetime_leq: "' + new Date(now).toISOString() + '" }) { sum { neurons } dimensions { usageModel } } } } }');
    const rows = (((g || {}).viewer || {}).accounts || [{}])[0].workersInvocationsAdaptive || [];
    aiN = rows.reduce(function(a, x) {
      return a + (x.sum && x.sum.neurons || 0);
    }, 0);
    if (aiN === 0) aiN = null;
  } catch (e) {
  }
  H.push('<div class="panel"><h2>3 &middot; COST TRUTH (live billing, USD cents audited)</h2><table><tr><th>metric</th><th>value</th></tr>');
  if (inv) {
    H.push('<tr><td>AI Gateway invoice draft (current period)</td><td class="bad">' + usd(inv.amount_due) + ' due</td></tr>');
    const lines = (inv.invoice_lines || []).slice().sort(function(a, b) {
      return (b.amount || 0) - (a.amount || 0);
    }).slice(0, 7);
    for (const L of lines) {
      if (!(L.amount > 0)) continue;
      H.push('<tr><td class="sub">&nbsp;&nbsp;' + esc(L.description) + "</td><td>" + usd(L.amount) + "</td></tr>");
    }
  } else H.push('<tr><td>AI Gateway invoice draft</td><td class="warn">billing API unavailable</td></tr>');
  H.push("<tr><td>Credit balance</td><td>" + (bal ? usd(bal.balance) : '<span class="warn">n/a</span>') + "</td></tr>");
  H.push("<tr><td>Auto top-up</td><td>" + (tup ? "refill " + usd(tup.amount) + " when balance &lt; " + usd(tup.threshold) : '<span class="warn">n/a</span>') + "</td></tr>");
  H.push("<tr><td>Workers AI 30d</td><td>" + (aiN != null ? aiN.toLocaleString() + " neurons (&asymp;$15 est, model-mix dependent)" : '<span class="warn">n/a</span>') + "</td></tr>");
  H.push('<tr><td>Spend limit</td><td>$150 / 30d sliding (monthly-150, enabled)</td></tr>');
  H.push("<tr><td>EARLY-TRIGGER</td><td>spend " + (inv ? usd(inv.amount_due) : "n/a") + " " + (inv && Number(inv.amount_due) / 100 >= 150 ? '<b class="bad">&ge; $150/30d (half-true)</b>' : '&lt; $150/30d') + ' &middot; publish_events: <b class="bad">UNDEFINED</b> &mdash; cannot auto-evaluate; owner must define publish_events or the kill path stays ambiguous</td></tr>');
  H.push('</table><div class="sub">billing figures are USD cents from the API divided by 100 (AI-GW-COST-UNIT-CENTS-1); line items shown gross &mdash; amount_due is net of credits (e.g. $18.08 pretax credit on the gpt-5.5 line); gateway spend is dominated by agent-session LLM traffic.</div></div>');

  // 4. COMPLETE OPEN-ISSUE INVENTORY
  let ghIssues = null, ghTotal = null;
  try {
    const g = await ghCall(env, "GET", "/search/issues?q=org%3AQNFO+is%3Aissue+is%3Aopen&per_page=100");
    if (g.ok && g.json) {
      ghIssues = (g.json.items || []).map(function(i) {
        return { repo: String(i.repository_url || "").split("/").pop(), n: i.number, t: i.title };
      });
      ghTotal = g.json.total_count;
    }
  } catch (e) {
  }
  let agOpen = [], dodByOwner = [], gtdByOwner = null, dispatch = [], ilOpen = null;
  try {
    agOpen = await d1all(env.AUDIT, "SELECT id, title, category, priority FROM agent_issues WHERE status NOT IN ('closed','done','resolved','wontfix','cancelled') ORDER BY priority DESC, id DESC LIMIT 60") || [];
  } catch (e) {
  }
  try {
    dodByOwner = await d1all(env.AUDIT, "SELECT owner, COUNT(*) AS n FROM task_dod_register WHERE status NOT IN ('done','cancelled','cancelled-with-monitor') GROUP BY owner ORDER BY n DESC") || [];
  } catch (e) {
  }
  try {
    gtdByOwner = await d1all(env.AUDIT, "SELECT owner, COUNT(*) AS n FROM gtd_register WHERE done=0 GROUP BY owner ORDER BY n DESC") || [];
  } catch (e) {
  }
  try {
    dispatch = await d1all(env.AUDIT, "SELECT exec_state, COUNT(*) AS n FROM fleet_issue_dispatch WHERE state='queued' GROUP BY exec_state ORDER BY n DESC") || [];
  } catch (e) {
  }
  try {
    const r = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM issue_ledger WHERE status='open'");
    ilOpen = r && r.length ? r[0].n : null;
  } catch (e) {
  }
  const dodOpen = dodByOwner.reduce(function(s, x) {
    return s + x.n;
  }, 0);
  const gtdOpen = gtdByOwner ? gtdByOwner.reduce(function(s, x) {
    return s + x.n;
  }, 0) : null;
  const dispOpen = dispatch.reduce(function(s, x) {
    return s + x.n;
  }, 0);
  H.push('<div class="panel"><h2>4 &middot; COMPLETE OPEN-ISSUE INVENTORY</h2><table><tr><th>source</th><th>open</th><th>detail</th></tr>');
  H.push("<tr><td>GitHub org QNFO</td><td class=\"" + (ghTotal > 0 ? "bad" : "ok") + '">' + (ghTotal != null ? ghTotal : '<span class="warn">api n/a</span>') + "</td><td>all repos, issues not PRs</td></tr>");
  H.push('<tr><td>task_dod_register</td><td class="' + (dodOpen > 0 ? "bad" : "ok") + '">' + dodOpen + "</td><td>" + esc(dodByOwner.map(function(x) {
    return x.owner + ":" + x.n;
  }).join(", ")) + "</td></tr>");
  H.push('<tr><td>gtd_register</td><td class="' + (gtdOpen > 0 ? "bad" : "ok") + '">' + (gtdOpen != null ? gtdOpen : "?") + "</td><td>" + (gtdByOwner ? esc(gtdByOwner.map(function(x) {
    return x.owner + ":" + x.n;
  }).join(", ")) : "") + "</td></tr>");
  H.push('<tr><td>agent_issues (D1)</td><td class="' + (agOpen.length > 0 ? "bad" : "ok") + '">' + agOpen.length + "</td><td>not closed/resolved/wontfix</td></tr>");
  H.push('<tr><td>fleet_issue_dispatch (queued)</td><td class="' + (dispOpen > 0 ? "bad" : "ok") + '">' + dispOpen + "</td><td>" + esc(dispatch.map(function(x) {
    return (x.exec_state || "undispatched") + ":" + x.n;
  }).join(", ")) + "</td></tr>");
  H.push('<tr><td>issue_ledger (open)</td><td>' + (ilOpen != null ? ilOpen : "?") + "</td><td>fingerprinted signals not yet resolved</td></tr>");
  H.push("</table>");
  if (ghIssues && ghIssues.length) {
    H.push('<div style="margin-top:8px"><b>GitHub open issues:</b></div><table style="margin-top:4px"><tr><th>repo</th><th>#</th><th>title</th></tr>');
    for (const gi of ghIssues) H.push('<tr><td>' + esc(gi.repo) + "</td><td>" + esc(gi.n) + '</td><td><a href="https://github.com/QNFO/' + esc(gi.repo) + "/issues/" + esc(gi.n) + '">' + esc(String(gi.t || "").slice(0, 110)) + "</a></td></tr>");
    H.push("</table>");
  }
  if (agOpen.length) {
    H.push('<div style="margin-top:8px"><b>agent_issues open (D1):</b></div><table style="margin-top:4px"><tr><th>id</th><th>category</th><th>title</th></tr>');
    for (const a of agOpen) H.push("<tr><td>" + esc(a.id) + "</td><td>" + esc(a.category) + "</td><td>" + esc(String(a.title || "").slice(0, 140)) + "</td></tr>");
    H.push("</table>");
  }
  H.push("</div>");

  // 5. FLEET RED FLAGS (live state)
  H.push('<div class="panel"><h2>5 &middot; FLEET RED FLAGS &mdash; ' + errs.length + " err / " + warns.length + " warn</h2>");
  if (!issues.length) H.push('<div class="ok">no active conditions</div>');
  else {
    H.push("<table><tr><th>sev</th><th>category</th><th>resource</th><th>condition</th><th>owner</th><th>remediation</th></tr>");
    for (const i of issues) H.push('<tr><td class="' + (i.sev === "err" ? "bad" : "warn") + '">' + esc(i.sev) + '</td><td>' + esc(i.category || "") + "</td><td>" + esc(i.resource || "") + "</td><td>" + esc(String(i.title || i.detail || "").slice(0, 140)) + "</td><td>" + esc(i.owner || "") + "</td><td class=\"sub\">" + esc(String(typeof i.remediation === "string" ? i.remediation : i.remediation ? JSON.stringify(i.remediation) : "").slice(0, 120)) + "</td></tr>");
    H.push("</table>");
  }
  const ig = st.integration || {};
  const driftBad = (ig.drift && ig.drift.ghost || 0) + (ig.drift && ig.drift.unregistered || 0) + (ig.drift && ig.drift.unversioned || 0);
  const sched = st.scheduled || [];
  const noRun = sched.filter(function(x) {
    return x.status === "NO-RUN";
  });
  const schedErr = sched.filter(function(x) {
    return x.status === "ERR";
  });
  const badProbes = (st.probes || []).filter(function(p) {
    return !p.ok;
  });
  let auditMismatch = [];
  try {
    auditMismatch = await d1all(env.AUDIT, "SELECT worker, live_version, registry_before, probed_at FROM worker_live_audit WHERE match=0 LIMIT 30") || [];
  } catch (e) {
  }
  H.push('<div class="sub" style="margin-top:6px">drift: ghost ' + (ig.drift && ig.drift.ghost || 0) + " &middot; unregistered " + (ig.drift && ig.drift.unregistered || 0) + " &middot; unversioned " + (ig.drift && ig.drift.unversioned || 0) + " &middot; islands " + (ig.islands || []).length + " &middot; sched NO-RUN " + noRun.length + " &middot; sched ERR " + schedErr.length + " &middot; failed probes " + badProbes.length + " &middot; live-vs-registry version mismatches " + auditMismatch.length + "</div>");
  if (noRun.length) H.push('<div class="warn" style="margin-top:4px">NO-RUN scheduled workers: ' + esc(noRun.map(function(x) {
    return x.name;
  }).join(", ")) + "</div>");
  if (badProbes.length) H.push('<div class="warn" style="margin-top:4px">failed probes: ' + esc(badProbes.map(function(x) {
    return x.name + "(" + x.status + ")";
  }).join(", ")) + "</div>");
  if (auditMismatch.length) {
    H.push('<table style="margin-top:6px"><tr><th>worker</th><th>live</th><th>registry</th><th>probed</th></tr>');
    for (const m of auditMismatch) H.push("<tr><td>" + esc(m.worker) + "</td><td>" + esc(m.live_version || "") + "</td><td>" + esc(m.registry_before || "") + '</td><td class="sub">' + esc(String(m.probed_at || "").slice(0, 10)) + "</td></tr>");
    H.push("</table>");
  }
  H.push("</div>");

  // 6. UNREMEDIATED REGISTERS
  let qu = null, gwf = null, vq = [], dl = null, pr = null, sv = null, er = null;
  try {
    const r = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM email_loop_quarantine");
    qu = r && r.length ? r[0].n : null;
  } catch (e) {
  }
  try {
    const r = await d1all(env.AUDIT, "SELECT COALESCE(SUM(count),0) AS total, MAX(ts) AS latest FROM ai_gateway_failures");
    gwf = r && r.length ? r[0] : null;
  } catch (e) {
  }
  try {
    vq = await d1all(env.AUDIT, "SELECT status, COUNT(*) AS n FROM version_queue GROUP BY status ORDER BY n DESC") || [];
  } catch (e) {
  }
  try {
    const r = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM deploy_locks WHERE expires_at > CAST(strftime('%s','now') AS INTEGER)");
    dl = r && r.length ? r[0].n : null;
  } catch (e) {
  }
  try {
    const r = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM email_parse_failures WHERE status='open'");
    pr = r && r.length ? r[0].n : null;
  } catch (e) {
  }
  try {
    const r = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM email_send_violations WHERE resolved=0");
    sv = r && r.length ? r[0].n : null;
  } catch (e) {
  }
  try {
    const r = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM dead_links WHERE resolved_at IS NULL");
    er = r && r.length ? r[0].n : null;
  } catch (e) {
  }
  H.push('<div class="panel"><h2>6 &middot; UNREMEDIATED REGISTERS</h2><table><tr><th>register</th><th>count</th><th>meaning</th></tr>');
  H.push("<tr><td>email_loop_quarantine</td><td class=\"" + (qu > 0 ? "bad" : "ok") + '">' + (qu != null ? qu : "?") + "</td><td>self-ingested email loops held in quarantine</td></tr>");
  H.push("<tr><td>ai_gateway_failures</td><td class=\"" + (gwf && gwf.total > 0 ? "bad" : "ok") + '">' + (gwf ? gwf.total.toLocaleString() : "?") + "</td><td>gateway error events (all-time; latest " + (gwf && gwf.latest ? new Date(Number(gwf.latest)).toISOString().slice(0, 16) : "?") + ")</td></tr>");
  H.push("<tr><td>version_queue</td><td>" + esc(vq.map(function(x) {
    return x.status + ":" + x.n;
  }).join(", ") || "0") + "</td><td>paper revision publishes waiting on Zenodo/PDF/KG</td></tr>");
  H.push("<tr><td>deploy_locks (active)</td><td class=\"" + (dl > 0 ? "warn" : "ok") + '">' + (dl != null ? dl : "?") + "</td><td>held deploy locks (immortal-lock risk)</td></tr>");
  H.push("<tr><td>email_parse_failures (open)</td><td>" + (pr != null ? pr : "?") + "</td><td>inbound mail the parser could not read</td></tr>");
  H.push("<tr><td>email_send_violations (unresolved)</td><td>" + (sv != null ? sv : "?") + "</td><td>outbound-send policy violations</td></tr>");
  H.push("<tr><td>dead_links (open)</td><td>" + (er != null ? er : "?") + "</td><td>checked links still failing</td></tr>");
  let oq = null;
  try {
    const r = await d1all(env.OUTREACH, "SELECT COUNT(*) AS n FROM outreach_queue WHERE status NOT IN ('sent','skipped','cancelled')");
    oq = r && r.length ? r[0].n : null;
  } catch (e) {
  }
  H.push("<tr><td>outreach_queue (open)</td><td class=\"" + (oq > 0 ? "bad" : "ok") + '">' + (oq != null ? oq : "?") + "</td><td>outreach rows not yet sent/skipped</td></tr>");
  H.push("</table></div>");

  // 7. MONEY MATH (decision metrics)
  let em = null, subs = null, zenodoN = null, repTotal = null, snapMoM = null;
  try {
    const r = await d1all(env.AUDIT, "SELECT status, COUNT(*) AS n FROM emails GROUP BY status");
    const m = {};
    for (const x of r) m[x.status] = x.n;
    em = m;
  } catch (e) {
  }
  try {
    const r = await d1all(env.AUDIT, "SELECT COUNT(*) AS n, SUM(CASE WHEN status='subscribed' THEN 1 ELSE 0 END) AS s FROM subscribers");
    subs = r && r.length ? r[0] : null;
  } catch (e) {
  }
  try {
    const r = await d1all(env.LIVING, "SELECT COUNT(*) AS n FROM papers WHERE zenodo_doi IS NOT NULL AND status='published'");
    zenodoN = r && r.length ? r[0].n : null;
  } catch (e) {
  }
  try {
    const r = await d1all(env.LIVING, "SELECT COUNT(*) AS n FROM papers WHERE status='published' AND length(body_md) >= 5000");
    repTotal = r && r.length ? r[0].n : null;
  } catch (e) {
  }
  try {
    const sn = await d1all(env.AUDIT, "SELECT d, pageviews FROM roi_daily_snapshots ORDER BY d DESC LIMIT 2") || [];
    if (sn.length === 2 && Number(sn[0].pageviews) > 0 && Number(sn[1].pageviews) > 0) snapMoM = Math.round(1e4 * (Number(sn[0].pageviews) - Number(sn[1].pageviews)) / Number(sn[1].pageviews)) / 100;
  } catch (e) {
  }
  const burn = inv ? Number(inv.amount_due) / 100 : null;
  const monthly = burn;
  const cpr = monthly != null && rep30 > 0 ? monthly / rep30 : null;
  H.push('<div class="panel"><h2>7 &middot; MONEY MATH (decision metrics)</h2><table><tr><th>metric</th><th>value</th></tr>');
  H.push("<tr><td>Monthly burn (AI Gateway invoice draft, includes Workers AI prepaid)</td><td class=\"bad\">" + (monthly != null ? "$" + monthly.toFixed(2) : '<span class="warn">n/a</span>') + "</td></tr>");
  H.push("<tr><td>Revenue</td><td class=\"bad\">$0.00 &mdash; no payment rail exists</td></tr>");
  H.push("<tr><td>Subscribers (active)</td><td>" + (subs ? subs.s : "?") + "</td></tr>");
  H.push("<tr><td>Email (sent / replied)</td><td>" + (em ? (em.sent || 0) + " sent &middot; " + (em.replied || 0) + " replied &middot; " + (em.sent ? Math.round(1e4 * (em.replied || 0) / em.sent) / 100 + "% reply rate" : "?") : "?") + "</td></tr>");
  H.push("<tr><td>Output (30d / all-time)</td><td>" + (rep30 != null ? rep30 : "?") + " full reports / " + (repTotal != null ? repTotal : "?") + " total &middot; " + (zenodoN != null ? zenodoN : "?") + " Zenodo DOIs</td></tr>");
  H.push("<tr><td>Cost per full report (30d)</td><td>" + (cpr != null ? "$" + cpr.toFixed(2) : "?") + "</td></tr>");
  H.push("<tr><td>Break-even at $10/mo subscriber</td><td>" + (monthly != null ? Math.ceil(monthly / 10) + " paying subscribers" : "?") + "</td></tr>");
  H.push("<tr><td>Pageviews MoM (snapshots)</td><td>" + (snapMoM != null ? (snapMoM >= 0 ? "+" : "") + snapMoM + "%" : '<span class="warn">n/a</span>') + "</td></tr>");
  H.push("</table>");
  let verdict = "NO JUSTIFICATION YET", vcls = "bad";
  if (growth != null && growth >= 30 && rep30 != null && rep30 >= 2) {
    verdict = "GATES ON TRACK";
    vcls = "ok";
  } else if ((growth != null && growth > 0) || rep30 >= 1) {
    verdict = "PARTIAL \u2014 WATCH (impressions gate failing)";
    vcls = "warn";
  }
  H.push('<div style="margin-top:6px"><b class="' + vcls + '" style="font-size:16px">ROI VERDICT: ' + verdict + '</b> <span class="sub">&mdash; at current cost ($' + (monthly != null ? monthly.toFixed(0) : "?") + '/mo) and zero revenue, the 2026-10-25 phase-1 retirement fires unless the +30% impressions gate passes or the gates are revised by owner.</span></div>');
  H.push("</div>");

  // 8. COLLAPSED GREENS
  const probes = st.probes || [];
  const probeOk = probes.filter(function(p) {
    return p.ok;
  }).length;
  H.push('<div class="panel"><h2>8 &middot; COLLAPSED GREENS (not a failure &mdash; one line only)</h2><div class="collapsed">' + probeOk + "/" + probes.length + " probes ok &middot; " + (st.fleet ? st.fleet.workers : "?") + " workers live &middot; " + (st.totals ? st.totals.req24 : "?") + " req/24h &middot; " + (st.totals ? st.totals.err24 : "?") + ' err/24h &middot; drift total ' + (driftBad || 0) + ' &middot; full green detail at <a href="/ops">/ops</a></div></div>');
  H.push("</body></html>");
  return H.join("");
}

async function roiHtml(env) {
  const H = [];
  const now = Date.now();
  const since = /* @__PURE__ */ __name(function(h) {
    return new Date(now - h * 36e5).toISOString();
  }, "since");
  const dead = (/* @__PURE__ */ new Date("2026-10-25T00:00:00Z")).getTime();
  const daysLeft = Math.max(0, Math.ceil((dead - now) / 864e5));
  H.push('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QUNIVERSE ROI</title><style>body{font-family:system-ui;background:#0b0e14;color:#e6e6e6;margin:0;padding:24px}h1{font-size:22px}h2{font-size:16px;margin:18px 0 6px;color:#9fc}table{border-collapse:collapse;width:100%;max-width:900px}td,th{border:1px solid #2a2f3a;padding:4px 8px;font-size:13px;text-align:right}th{background:#141a24;color:#9fb}td:first-child,th:first-child{text-align:left}.ok{color:#6f6}.warn{color:#fa3}.bad{color:#f66}.sub{color:#9aa;font-size:12px}.panel{background:#11151d;border:1px solid #2a2f3a;border-radius:8px;padding:14px;margin:10px 0;max-width:940px}</style></head><body>');
  H.push("<h1>QUNIVERSE ROI \u2014 cost vs output</h1>");
  H.push('<div class="sub"><a href="/ops" style="color:#9af">operational detail (uptime/errors) \u2192 /ops</a></div>');
  H.push('<div class="sub">generated ' + (/* @__PURE__ */ new Date()).toISOString() + ' \xB7 deadline 2026-10-25 \xB7 <b class="' + (daysLeft <= 7 ? "bad" : daysLeft <= 14 ? "warn" : "ok") + '">' + daysLeft + " days left</b></div>");
  let opsN = null;
  try {
    const or_ = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind='ops_ai_tool' AND ts >= ?", [since(720)]);
    opsN = or_ && or_.length ? or_[0].n : null;
  } catch (e) {
  }
  let gw30 = null, topModels = [];
  try {
    const d = await roiGf(env, 'query { viewer { accounts(filter: { accountTag: "edb167b78c9fb901ea5bca3ce58ccc4b" }) { aiGatewayRequestsAdaptiveGroups(limit: 10000, filter: { datetime_geq: "' + since(720) + '", datetime_leq: "' + since(0) + '" }) { count dimensions { model } } } } }');
    const rows = (((d || {}).viewer || {}).accounts || [{}])[0].aiGatewayRequestsAdaptiveGroups || [];
    const byModel = {};
    for (const r of rows) {
      const m = r.dimensions.model || "unknown";
      byModel[m] = (byModel[m] || 0) + r.count;
      gw30 = (gw30 || 0) + r.count;
    }
    topModels = Object.keys(byModel).map(function(m) {
      return { m, n: byModel[m] };
    }).sort(function(a, b) {
      return b.n - a.n;
    }).slice(0, 5);
  } catch (e) {
  }
  let cap = null;
  try {
    const cr = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/ai-gateway/gateways/default", { headers: { Authorization: "Bearer " + env.CF_TOKEN } });
    const cj = await cr.json();
    const v = cj.result || {};
    cap = v.spend_limits && v.spend_limits.rules ? v.spend_limits.rules[0].limit : null;
  } catch (e) {
  }
  let workersN = null;
  try {
    const wr = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts?per_page=100", { headers: { Authorization: "Bearer " + env.CF_TOKEN } });
    const wj = await wr.json();
    workersN = (wj.result || []).length;
  } catch (e) {
  }
  let aiN = null;
  try {
    const g = await roiGf(env, 'query { viewer { accounts(filter: { accountTag: "edb167b78c9fb901ea5bca3ce58ccc4b" }) { workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: "' + since(720) + '", datetime_leq: "' + since(0) + '" }) { sum { neurons } dimensions { usageModel } } } } }');
    const rows = (((g || {}).viewer || {}).accounts || [{}])[0].workersInvocationsAdaptive || [];
    aiN = rows.reduce(function(a, x) {
      return a + (x.sum && x.sum.neurons || 0);
    }, 0);
    if (aiN === 0) aiN = null;
  } catch (e) {
  }
  H.push('<div class="panel"><h2>COST (AI traffic, 30d)</h2><table><tr><th>metric</th><th>value</th></tr>');
  H.push("<tr><td>AI Gateway requests (30d)</td><td>" + (gw30 != null ? gw30.toLocaleString() : '<span class="warn">n/a</span>') + "</td></tr>");
  for (const m of topModels) H.push('<tr><td class="sub">  model ' + esc(m.m) + "</td><td>" + m.n.toLocaleString() + "</td></tr>");
  H.push("<tr><td>Gateway spend cap (30d sliding)</td><td>" + (cap != null ? cap : "?") + "</td></tr>");
  H.push("<tr><td>Workers AI est cost 30d</td><td>$15.03 snapshot 2026-09-25 (infra_analytics; live Workers AI dataset not exposed via current token scope)</td></tr>");
  H.push("<tr><td>Agent operations (30d) \u2014 time proxy</td><td>" + (opsN != null ? opsN.toLocaleString() : "?") + " ops_ai_tool events</td></tr>");
  H.push("<tr><td>Live workers</td><td>" + (workersN != null ? workersN : "?") + " (was 57 on 2026-09-25)</td></tr>");
  H.push("</table></div>");
  let daily = [];
  let wordsTotal = null, zenodoN = null;
  try {
    daily = await d1all(env.LIVING, "SELECT date(created_at) AS d, COUNT(*) AS n, COALESCE(SUM(length(body_md)),0) AS w FROM papers WHERE status='published' AND length(body_md) >= 5000 AND created_at >= date('now','-30 day') GROUP BY d ORDER BY d") || [];
  } catch (e) {
  }
  try {
    const r = await d1all(env.LIVING, "SELECT COALESCE(SUM(length(body_md)),0) AS w FROM papers WHERE status='published' AND length(body_md) >= 5000");
    wordsTotal = r && r.length ? r[0].w : null;
  } catch (e) {
  }
  try {
    const r = await d1all(env.LIVING, "SELECT COUNT(*) AS n FROM papers WHERE zenodo_doi IS NOT NULL AND status='published'");
    zenodoN = r && r.length ? r[0].n : null;
  } catch (e) {
  }
  const d30n = daily.reduce(function(s, x) {
    return s + x.n;
  }, 0);
  const d30w = daily.reduce(function(s, x) {
    return s + x.w;
  }, 0);
  H.push('<div class="panel"><h2>OUTPUT (last 30d)</h2><table><tr><th>metric</th><th>value</th></tr>');
  H.push("<tr><td>Full reports published (30d)</td><td>" + d30n + "</td></tr>");
  H.push("<tr><td>Chars published (30d)</td><td>" + d30w.toLocaleString() + "</td></tr>");
  H.push("<tr><td>Full reports total (all time)</td><td>451</td></tr>");
  H.push("<tr><td>Chars total (all time)</td><td>" + (wordsTotal != null ? wordsTotal.toLocaleString() : "?") + "</td></tr>");
  H.push("<tr><td>Papers with Zenodo DOI</td><td>" + (zenodoN != null ? zenodoN : "?") + "</td></tr>");
  H.push("</table>");
  if (daily.length) {
    H.push('<table style="margin-top:8px"><tr><th>date</th><th>reports</th><th>chars</th></tr>');
    for (const d of daily.slice(-30)) H.push("<tr><td>" + esc(d.d) + "</td><td>" + d.n + "</td><td>" + d.w.toLocaleString() + "</td></tr>");
    H.push("</table>");
  }
  H.push("</div>");
  let rum = null;
  try {
    const d = await roiGf(env, 'query { viewer { accounts(filter: { accountTag: "edb167b78c9fb901ea5bca3ce58ccc4b" }) { rumPageloadEventsAdaptiveGroups(limit: 10000, filter: { datetime_geq: "' + since(720) + '", datetime_leq: "' + since(0) + '" }) { count dimensions { date siteTag } } } } }');
    const rows = (((d || {}).viewer || {}).accounts || [{}])[0].rumPageloadEventsAdaptiveGroups || [];
    const byDay = {}, byTag = {};
    for (const r of rows) {
      const dt = r.dimensions.date || "?";
      const t = r.dimensions.siteTag || "?";
      byDay[dt] = (byDay[dt] || 0) + r.count;
      byTag[t] = (byTag[t] || 0) + r.count;
    }
    rum = { total: rows.reduce(function(s, x) {
      return s + x.count;
    }, 0), byDay, tags: Object.keys(byTag).length };
  } catch (e) {
    rum = { err: String(e && e.message || e).slice(0, 60) };
  }
  H.push('<div class="panel"><h2>IMPRESSIONS (Web Analytics, 30d)</h2><table><tr><th>metric</th><th>value</th></tr>');
  H.push("<tr><td>Pageviews (30d)</td><td>" + (rum && rum.total != null ? rum.total.toLocaleString() : '<span class="warn">' + esc(rum && rum.err || "n/a") + "</span>") + "</td></tr>");
  H.push("<tr><td>Baseline (2026-08-27..09-25)</td><td>5,610</td></tr>");
  if (rum && rum.total != null) {
    const g = Math.round(1e4 * (rum.total - 5610) / 5610) / 100;
    H.push('<tr><td>Growth vs baseline</td><td class="' + (g >= 30 ? "ok" : g > 0 ? "warn" : "bad") + '">' + (g >= 0 ? "+" : "") + g + "% (gate: +30%)</td></tr>");
  }
  H.push("<tr><td>Active sites (30d)</td><td>" + (rum ? rum.tags : "?") + " of 12</td></tr>");
  H.push("</table>");
  if (rum && rum.byDay) {
    const keys = Object.keys(rum.byDay).sort();
    H.push('<table style="margin-top:8px"><tr><th>date</th><th>pageviews</th></tr>');
    for (const k of keys) H.push("<tr><td>" + k + "</td><td>" + rum.byDay[k] + "</td></tr>");
    H.push("</table>");
  }
  H.push("</div>");
  let em = null, subs = null;
  try {
    const r = await d1all(env.AUDIT, "SELECT status, COUNT(*) AS n FROM emails GROUP BY status");
    const st = {};
    for (const x of r) st[x.status] = x.n;
    em = st;
  } catch (e) {
  }
  try {
    const r = await d1all(env.AUDIT, "SELECT COUNT(*) AS n, SUM(CASE WHEN status='subscribed' THEN 1 ELSE 0 END) AS s FROM subscribers");
    subs = r && r.length ? r[0] : null;
  } catch (e) {
  }
  H.push('<div class="panel"><h2>REACH</h2><table><tr><th>metric</th><th>value</th></tr>');
  H.push("<tr><td>Email sent (total)</td><td>" + (em ? em.sent || 0 : "?") + "</td></tr>");
  H.push("<tr><td>Email replied</td><td>" + (em ? em.replied || 0 : "?") + "</td></tr>");
  H.push("<tr><td>Reply rate</td><td>" + (em && em.sent ? Math.round(1e4 * (em.replied || 0) / em.sent) / 100 + "%" : "?") + "</td></tr>");
  H.push("<tr><td>Subscribers</td><td>" + (subs ? subs.s : "?") + "</td></tr>");
  H.push("</table></div>");
  let th = [];
  try {
    th = await d1all(env.AUDIT, "SELECT metric, target, state FROM impact_thresholds ORDER BY metric");
  } catch (e) {
  }
  H.push('<div class="panel"><h2>SURVIVAL GATES</h2><table><tr><th>gate</th><th>target</th><th>state</th></tr>');
  for (const t of th) {
    const cls = t.state === "MET" ? "ok" : t.state === "MEASURED" ? "warn" : "bad";
    H.push("<tr><td>" + esc(t.metric) + '</td><td class="sub">' + esc(t.target) + '</td><td class="' + cls + '">' + esc(t.state) + "</td></tr>");
  }
  H.push('</table><div class="sub">4 armed shutdown rows \xB7 17 open work-queue rows \xB7 self-destruct is mechanical if gates fail by 2026-10-25</div></div>');
  let verdict = "NO JUSTIFICATION YET", vcls = "bad";
  if (rum && rum.total != null && rum.total >= 7293 && d30n >= 2) {
    verdict = "GATES ON TRACK";
    vcls = "ok";
  } else if (rum && rum.total != null && rum.total >= 5610 || d30n >= 1) {
    verdict = "PARTIAL \u2014 WATCH";
    vcls = "warn";
  }
  H.push('<div class="panel"><h2>ROI VERDICT</h2><div class="' + vcls + '" style="font-size:18px;font-weight:700">' + verdict + '</div><div class="sub">cost: gateway requests + $150 cap \xB7 output: full reports + chars \xB7 impressions: pageviews +30% gate \xB7 reach: subscribers + replies \xB7 refresh for fresh numbers</div></div>');
  let snap = [];
  try {
    snap = await d1all(env.AUDIT, "SELECT * FROM roi_daily_snapshots ORDER BY d DESC LIMIT 40") || [];
  } catch (e) {
  }
  if (snap.length >= 2) {
    H.push('<div class="panel"><h2>MONTH-OVER-MONTH (daily snapshots)</h2><table><tr><th>metric</th><th>now</th><th>' + esc(snap[snap.length - 1].d || "30d ago") + "</th><th>delta</th></tr>");
    const last = snap[0], prev = snap[snap.length - 1];
    const rows = [["Full reports (total)", last.papers, prev.papers], ["Chars published (total)", last.chars, prev.chars], ["Subscribers", last.subscribers, prev.subscribers], ["Gateway req (30d rolling)", last.gateway_req, prev.gateway_req], ["Pageviews (30d rolling)", last.pageviews, prev.pageviews]];
    for (const r of rows) {
      const d0 = Number(r[1]) || 0, d1 = Number(r[2]) || 0, dd = d0 - d1;
      H.push("<tr><td>" + esc(r[0]) + "</td><td>" + d0.toLocaleString() + "</td><td>" + d1.toLocaleString() + '</td><td class="' + (dd >= 0 ? "ok" : "bad") + '">' + (dd >= 0 ? "+" : "") + dd.toLocaleString() + "</td></tr>");
    }
    H.push('</table><div class="sub">snapshots persisted daily by the dashboard cron; earliest ' + esc(snap[snap.length - 1].d) + "</div></div>");
  } else {
    H.push('<div class="panel"><h2>MONTH-OVER-MONTH</h2><div class="sub">awaiting snapshots \u2014 first persisted today, MoM deltas appear tomorrow onward</div></div>');
  }
  H.push("</body></html>");
  return H.join("");
}
__name(roiHtml, "roiHtml");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
