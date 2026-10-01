var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var __defProp222 = Object.defineProperty;
var __name222 = /* @__PURE__ */ __name22((target, value) => __defProp222(target, "name", { value, configurable: true }), "__name");
var __name2222 = /* @__PURE__ */ __name222((target, value) => Object.defineProperty(target, "name", { value, configurable: true }), "__name");
var VERSION = "1.12.2-objective-apply-text"; /* IDENTITY-STORE-1 hardening + copy-only sync; owner links refuse claude.ai; 1.12.0 IDENTITY-STORE-1 + IDENTITY-WEEKLY-1; 1.11.1 OWNER-EDIT-1 */
// REVIEW-GATE-1 (2026-10-01, docs/STRATEGY.md s9): the 2026-10-25 impressions gate is retired. The research layer is
// reviewed on this date against the reach scorecard; nothing deletes research data automatically (phase 2 needs the
// owner's email confirmation). One constant replaces the six hard-coded "2026-10-25" strings.
var REVIEW_GATE_DATE = "2026-12-31";
var NAME = "qnfo-fleet-dashboard";
var PROBE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
var ACCOUNT = "edb167b78c9fb901ea5bca3ce58ccc4b";
var STALE_MS = 60 * 1e3;
var DAY_MS = 24 * 60 * 60 * 1e3;
function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}
__name(pad2, "pad2");
__name2(pad2, "pad2");
__name22(pad2, "pad2");
__name222(pad2, "pad2");
__name2222(pad2, "pad2");
function fmtUtc(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + " UTC";
}
__name(fmtUtc, "fmtUtc");
__name2(fmtUtc, "fmtUtc");
__name22(fmtUtc, "fmtUtc");
__name222(fmtUtc, "fmtUtc");
__name2222(fmtUtc, "fmtUtc");
function naiveUtc(ms) {
  const d = new Date(ms);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + ":" + pad2(d.getUTCSeconds());
}
__name(naiveUtc, "naiveUtc");
__name2(naiveUtc, "naiveUtc");
__name22(naiveUtc, "naiveUtc");
__name222(naiveUtc, "naiveUtc");
__name2222(naiveUtc, "naiveUtc");
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(esc, "esc");
__name2(esc, "esc");
__name22(esc, "esc");
__name222(esc, "esc");
__name2222(esc, "esc");
function squash(s) {
  return String(s || "").split(/\s+/).join(" ").slice(0, 200);
}
__name(squash, "squash");
__name2(squash, "squash");
__name22(squash, "squash");
__name222(squash, "squash");
__name2222(squash, "squash");
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
__name2222(json, "json");
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
__name2222(parseField, "parseField");
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
__name2222(cronFields, "cronFields");
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
__name2222(cronMatchAt, "cronMatchAt");
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
__name2222(nextRuns, "nextRuns");
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
__name2222(workerNextRuns, "workerNextRuns");
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
__name2222(expectedFires, "expectedFires");
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
__name2222(d1all, "d1all");
async function ensureStateTable(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS fleet_dashboard_state (id INTEGER PRIMARY KEY, updated_at TEXT, state_json TEXT, refresh_ms INTEGER)").run();
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS fleet_probe_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT, name TEXT, url TEXT, transport TEXT, ok INTEGER, status INTEGER, ms INTEGER, body TEXT)").run();
}
__name(ensureStateTable, "ensureStateTable");
__name2(ensureStateTable, "ensureStateTable");
__name22(ensureStateTable, "ensureStateTable");
__name222(ensureStateTable, "ensureStateTable");
__name2222(ensureStateTable, "ensureStateTable");
async function saveState(env, st, ms) {
  await ensureStateTable(env);
  await env.AUDIT.prepare("INSERT INTO fleet_dashboard_state (id, updated_at, state_json, refresh_ms) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, state_json=excluded.state_json, refresh_ms=excluded.refresh_ms").bind(st.generated_at, JSON.stringify(st), ms).run();
}
__name(saveState, "saveState");
__name2(saveState, "saveState");
__name22(saveState, "saveState");
__name222(saveState, "saveState");
__name2222(saveState, "saveState");
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
__name2222(loadState, "loadState");
async function analytics24(env) {
  const out = { per: {}, req: 0, err: 0, errWorkers: [], recoveredWorkers: [], unattributed: 0, ts: null, error: null };
  if (!env.CF_TOKEN) {
    out.error = "CF_TOKEN secret not set";
    return out;
  }
  try {
    const end = /* @__PURE__ */ new Date();
    const start = new Date(end.getTime() - DAY_MS);
    const query = 'query { viewer { accounts(filter:{accountTag:"' + ACCOUNT + '"}) { workersInvocationsAdaptive(limit:10000, filter:{datetime_geq:"' + start.toISOString() + '", datetime_leq:"' + end.toISOString() + '"}) { sum { requests errors } dimensions { scriptName status datetimeHour } } } } }';
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
    // WORKER-ERRORS-RECENCY-1 (2026-09-30): a 24h error TOTAL cannot distinguish a worker that is
    // failing now from one fixed hours ago (qnfo-containers-pilot: 37 scriptThrewException, all in
    // the 2026-09-29T19:00 hour, remediated and redeployed, still "err" for the rest of the day).
    // Keep the status class and hour so the flag can say WHY and WHEN.
    const activeCut = Date.now() - ERR_ACTIVE_MS;
    for (const row of rows) {
      const dm = row.dimensions || {};
      const nm = dm.scriptName || "?";
      const sm = row.sum || {};
      const d = out.per[nm] || (out.per[nm] = { requests: 0, errors: 0, errors_active: 0, by_status: {}, last_error_hour: null });
      d.requests += sm.requests || 0;
      d.errors += sm.errors || 0;
      if (sm.errors) {
        const cls = dm.status || "unknown";
        d.by_status[cls] = (d.by_status[cls] || 0) + sm.errors;
        const hMs = Date.parse(dm.datetimeHour || "");
        // an hour bucket counts as active if any part of it falls inside the active window;
        // an unparseable bucket is treated as active (fail-closed)
        if (!isFinite(hMs) || hMs + 36e5 > activeCut) d.errors_active += sm.errors;
        if (isFinite(hMs) && (!d.last_error_hour || dm.datetimeHour > d.last_error_hour)) d.last_error_hour = dm.datetimeHour;
      }
    }
    for (const k of Object.keys(out.per)) {
      out.req += out.per[k].requests;
      out.err += out.per[k].errors;
      const noise = k === "?" || k === "__unknown__" || k === "undefined" || k === "null" || k.charAt(0) === "_";
      if (noise) {
        out.unattributed += out.per[k].errors;
        continue;
      }
      const pk = out.per[k];
      const ent = { name: k, errors: pk.errors, errors_active: pk.errors_active, by_status: pk.by_status, last_error_hour: pk.last_error_hour };
      if (pk.errors_active > 0) out.errWorkers.push(ent);
      else if (pk.errors > 0) out.recoveredWorkers.push(ent);
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
__name2222(analytics24, "analytics24");
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
__name2222(lastRuns30, "lastRuns30");
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
__name2222(probeTargets, "probeTargets");
async function healthProbes(env, liveNames) {
  const items = await probeTargets(env);
  const settled = await Promise.allSettled(items.map(async function(hp) {
    const t0 = Date.now();
    const kind = hp.kind || (hp.binding ? "worker" : "domain");
    const logRow = /* @__PURE__ */ __name222(async function(out) {
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
__name2222(healthProbes, "healthProbes");
var CLOSED = { closed: 1, done: 1, resolved: 1, completed: 1, cancelled: 1, canceled: 1, wontfix: 1, dismissed: 1, superseded: 1, archived: 1, fixed: 1, rejected: 1 };
function isOpenish(st) {
  return !CLOSED[String(st || "").toLowerCase()];
}
__name(isOpenish, "isOpenish");
__name2(isOpenish, "isOpenish");
__name22(isOpenish, "isOpenish");
__name222(isOpenish, "isOpenish");
__name2222(isOpenish, "isOpenish");
function failish(st) {
  const s = String(st || "").toLowerCase();
  return s.indexOf("fail") >= 0 || s === "error" || s === "err" || s === "bounce" || s === "rejected";
}
__name(failish, "failish");
__name2(failish, "failish");
__name22(failish, "failish");
__name222(failish, "failish");
__name2222(failish, "failish");
async function d1Count(env) {
  try {
    if (!env.CF_TOKEN) return null;
    const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/d1/database?per_page=100", { headers: { Authorization: "Bearer " + env.CF_TOKEN }, signal: AbortSignal.timeout(8e3) });
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
__name2222(d1Count, "d1Count");
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
    // DEVICE-PLANE-STALENESS-1 (2026-10-01, #1637): device_tasks is written only by the owner's local device reporter,
    // last on 2026-09-12. It was labelled "live" regardless of age. Past 48h it is now marked stale and unverifiable,
    // so client-side task state cannot pass for current fleet state.
    const ageH = cap ? (Date.now() - Date.parse(String(cap).replace(" ", "T") + (/Z|[+-]\d\d:?\d\d$/.test(String(cap)) ? "" : "Z"))) / 36e5 : null;
    const stale = ageH == null || !isFinite(ageH) || ageH > 48;
    return { captured_at: cap, stale, age_hours: ageH == null || !isFinite(ageH) ? null : Math.round(ageH), note: stale ? "STALE: device last self-reported " + cap + " (" + (ageH == null || !isFinite(ageH) ? "unknown age" : Math.round(ageH / 24) + "d ago") + "); device task state is unverifiable until the local reporter runs again" : "live from device_tasks (D1), " + rows.length + " rows", windows_tasks: win, local_crons: loc };
  } catch (e) {
    return { captured_at: null, note: "device_tasks unavailable: " + String(e && e.message || e).slice(0, 80), windows_tasks: [], local_crons: [] };
  }
}
__name(liveDevice, "liveDevice");
__name2(liveDevice, "liveDevice");
__name22(liveDevice, "liveDevice");
__name222(liveDevice, "liveDevice");
__name2222(liveDevice, "liveDevice");
async function liveScheduled(env, liveNames) {
  try {
    try {
      await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS worker_schedules (name TEXT PRIMARY KEY, crons_json TEXT, purpose TEXT, grp TEXT, refreshed_at TEXT, created_on TEXT)").run();
      try { await env.AUDIT.prepare("ALTER TABLE worker_schedules ADD COLUMN created_on TEXT").run(); } catch (e) {}
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
            let co = null;
            for (const s2 of arr) { if (s2 && s2.created_on && (co == null || s2.created_on > co)) co = s2.created_on; }
            return { n, c: arr.map(function(s) {
              return s.cron;
            }), created: co, ok: true };
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
            await env.AUDIT.prepare("INSERT INTO worker_schedules (name, crons_json, purpose, grp, refreshed_at, created_on) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(name) DO UPDATE SET crons_json = ?2, purpose = ?3, grp = ?4, refreshed_at = ?5, created_on = ?6").bind(it.n, JSON.stringify(it.c), pm[it.n] || "", "live", nowIso, it.created || null).run();
          } catch (e) {
          }
        }
      }
    }
  } catch (e) {
  }
  const rows = await d1all(env.AUDIT, "SELECT name, crons_json, purpose, grp, created_on FROM worker_schedules WHERE refreshed_at IS NULL OR datetime(refreshed_at) >= datetime('now','-6 hours') ORDER BY name") || [];
  const out = [];
  for (const r of rows) {
    try {
      out.push({ name: r.name, crons: JSON.parse(r.crons_json), purpose: r.purpose || "", group: r.grp || "live", created_on: r.created_on || null });
    } catch (e) {
    }
  }
  return out;
}
__name(liveScheduled, "liveScheduled");
__name2(liveScheduled, "liveScheduled");
__name22(liveScheduled, "liveScheduled");
__name222(liveScheduled, "liveScheduled");
__name2222(liveScheduled, "liveScheduled");
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
__name2222(loadSaiConfig, "loadSaiConfig");
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
  try {
    const ss = await d1all(env.AUDIT, "SELECT survival_score FROM survival_state WHERE id=1");
    if (ss && ss[0] && typeof ss[0].survival_score === 'number') out.externalImpact = Math.max(0, Math.min(1, ss[0].survival_score));
  } catch (e) {
  }
  return out;
}
__name(liveSaiInputs, "liveSaiInputs");
__name2(liveSaiInputs, "liveSaiInputs");
__name22(liveSaiInputs, "liveSaiInputs");
__name222(liveSaiInputs, "liveSaiInputs");
__name2222(liveSaiInputs, "liveSaiInputs");
async function liveScripts(env) {
  try {
    if (!env.CF_TOKEN) return null;
    const resp = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts?per_page=100", { headers: { Authorization: "Bearer " + env.CF_TOKEN }, signal: AbortSignal.timeout(8e3) });
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
__name2222(liveScripts, "liveScripts");
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
__name2222(stableKey, "stableKey");
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
__name2222(issueFingerprint, "issueFingerprint");
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
__name2222(issueCategory, "issueCategory");
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
__name2222(ISSUE_META, "ISSUE_META");
function severityRank(sev) {
  return sev === "err" ? 0 : sev === "warn" ? 1 : 2;
}
__name(severityRank, "severityRank");
__name2(severityRank, "severityRank");
__name22(severityRank, "severityRank");
__name222(severityRank, "severityRank");
__name2222(severityRank, "severityRank");
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
__name2222(remediationFor, "remediationFor");
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
__name2222(enrichIssues, "enrichIssues");
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
__name2222(ensureIssueLog, "ensureIssueLog");
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
__name2222(readIssueLog, "readIssueLog");
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
__name2222(writeIssueLog, "writeIssueLog");
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
__name2222(ghHeaders, "ghHeaders");
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
__name2222(ghCall, "ghCall");
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
__name2222(loopEnsure, "loopEnsure");
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
__name2222(readLoop, "readLoop");
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
__name2222(attachIssueLinks, "attachIssueLinks");
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
__name2222(loopMetaGet, "loopMetaGet");
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
__name2222(loopMetaSet, "loopMetaSet");
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
__name2222(ghFindIssue, "ghFindIssue");
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
__name2222(ghCreateIssue, "ghCreateIssue");
async function ghComment(env, number, body) {
  return await ghCall(env, "POST", "/repos/" + GH_REPO + "/issues/" + number + "/comments", { body });
}
__name(ghComment, "ghComment");
__name2(ghComment, "ghComment");
__name22(ghComment, "ghComment");
__name222(ghComment, "ghComment");
__name2222(ghComment, "ghComment");
async function ghAddLabels(env, number, labels) {
  return await ghCall(env, "POST", "/repos/" + GH_REPO + "/issues/" + number + "/labels", { labels });
}
async function ghRemoveLabel(env, number, name) {
  return await ghCall(env, "DELETE", "/repos/" + GH_REPO + "/issues/" + number + "/labels/" + encodeURIComponent(name));
}
__name(ghRemoveLabel, "ghRemoveLabel");
__name(ghAddLabels, "ghAddLabels");
__name2(ghAddLabels, "ghAddLabels");
__name22(ghAddLabels, "ghAddLabels");
__name222(ghAddLabels, "ghAddLabels");
__name2222(ghAddLabels, "ghAddLabels");
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
__name2222(dispatchIssue, "dispatchIssue");
var EXEC_COOLDOWN_MS = 5 * 60 * 1e3;
function execTargetFor(category, resource, env) {
  const r = String(resource || "").toLowerCase();
  if (category === "queue-freshness") {
    if (r.indexOf("outreach") >= 0) {
      // OUTREACH-GATE-DERIVE-1 (2026-09-30): the refusal cited 2026-09-15 unconditionally,
      // 15 days after that date had passed, so it could never expire and reported a false
      // rationale. Derive it from the live activation instant instead.
      const ACT_MS = Date.parse("2026-09-15T00:00:00Z");
      if (Date.now() < ACT_MS) return { safe: false, noAction: true, note: "outreach sends gated until 2026-09-15 (warm-up ACTIVATION_AT); no auto-drain" };
      return { safe: false, noAction: true, note: "outreach ACTIVATION_AT (2026-09-15) has passed; external send gate is qnfo-outreach pipeline_state.external_sends_enabled (read live, not a date) and the drain runs on the qnfo-cloud-ops cron (job=outreach, 8/day cap) - no auto-drain from this lane (OUTREACH-LANE-INERT-1 / #1508)" };
    }
    return { safe: true, svc: "SVC_QNFO_RESEARCH_EXEC", progressJob: "qnfo-research-exec", path: "/run", note: "advance research_queue (research-exec /run)" };
  }
  if (category === "integration-chain") {
    if (r.indexOf("research intake") >= 0 || r.indexOf("research execution") >= 0) return { safe: true, svc: "SVC_QNFO_RESEARCH_EXEC", progressJob: "qnfo-research-exec", path: "/run", note: "advance research pipeline (research-exec /run)" };
    if (r.indexOf("reviser") >= 0 && r.indexOf("publish drain") >= 0) return { safe: true, svc: "SVC_QNFO_RESEARCH_EXEC", progressJob: "qnfo-research-exec", path: "/run/drain-v2", note: "drain version_queue (research-exec /run/drain-v2)" };
    if (r.indexOf("revision log") >= 0 && r.indexOf("publish drain") >= 0) return env && env.REVISER_TOKEN ? { safe: true, svc: "SVC_QNFO_PAPER_REVISER", path: "/run/scan?mode=live", note: "run paper-reviser scan to drain revision log", auth: "X-Reviser-Token" } : { safe: false, noAction: true, note: "PAPER-REVISER-SCAN-UNAUTHORIZED-1: /run/scan needs qnfo-paper-reviser X-Reviser-Token which this worker does not hold; qnfo-paper-reviser cron 37 */4 drains it - no auto-dispatch" };
    if (r.indexOf("alerts") >= 0 && r.indexOf("digest") >= 0) return { safe: false, svc: "SVC_QNFO_OBSERVABILITY", path: "/run/ingest", note: "observability worker retired (wave-A consolidation) - fail-closed to manual disposition" };
    if (r.indexOf("outreach") >= 0) {
      const ACT_MS = Date.parse("2026-09-15T00:00:00Z");
      if (Date.now() < ACT_MS) return { safe: false, noAction: true, note: "outreach sends gated until 2026-09-15 (ACTIVATION_AT); no auto-drain" };
      return { safe: false, noAction: true, note: "outreach ACTIVATION_AT (2026-09-15) has passed; external send gate is qnfo-outreach pipeline_state.external_sends_enabled (read live, not a date) and the drain runs on the qnfo-cloud-ops cron (job=outreach, 8/day cap) - no auto-drain from this lane (OUTREACH-LANE-INERT-1 / #1508)" };
    }
    if (r.indexOf("research queue") >= 0) return { safe: true, svc: "SVC_QNFO_RESEARCH_EXEC", progressJob: "qnfo-research-exec", path: "/run", note: "advance research_queue (research-exec /run)" };
    return { safe: false, noAction: true, escalate: true, note: "chain has no safe producer action; verify chain wiring (NEVER-HUMAN-1)" };
  }
  if (category === "agent-issues") return { safe: true, svc: "SVC_QNFO_KAIZEN", path: "/run/scan", note: "trigger kaizen triage scan" };
  if (category === "probe") return { safe: false, noAction: true, note: "probe is re-verified automatically next cycle; no action" };
  if (category === "gateway") return { safe: false, noAction: true, note: "gateway classes self-clear via qnfo-ai-calibration sweep (30m); no human gate" };
  if (category === "model-health") return { safe: false, noAction: true, note: "degraded ids reconciled by ai-health-prober (hourly) + calibration guard; no human gate" };
  if (category === "worker-errors") return { safe: false, noAction: true, note: "24h error window rolls; fleet-control scan re-probes each cycle; no human gate" };
  if (category === "analytics") return { safe: false, noAction: true, note: "analytics scope checked by qnfo-cloud-ops weekly; no human gate" };
  // SCHEDULED-NO-RUN-HANDLER-1 (2026-10-01, #1635): this category fell through to the unmapped escalation,
  // so every cron-trigger dispatch ended no-handler-superseded. Its handler is qnfo-fleet-control's hourly
  // scan: cronDrift compares each worker's declared wrangler.toml crons with the live /schedules and PUTs
  // them back when a declared schedule is missing (audited as cron-heal). A worker whose schedule is present
  // but still saw 0 invocations surfaces again next cycle under worker-errors.
  if (category === "scheduled-no-run") return { safe: false, noAction: true, note: "missing cron triggers are restored by qnfo-fleet-control cronDrift (hourly scan: declared wrangler.toml crons vs live /schedules, PUT on mismatch, audited cron-heal); no human gate" };
  return { safe: false, noAction: true, escalate: true, note: "unmapped category recorded for the fleet loop; no human gate (NEVER-HUMAN-1)" };
}
__name(execTargetFor, "execTargetFor");
__name2(execTargetFor, "execTargetFor");
__name22(execTargetFor, "execTargetFor");
__name222(execTargetFor, "execTargetFor");
__name2222(execTargetFor, "execTargetFor");
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
    const escalate = !!(spec && spec.escalate);
    const state2 = escalate ? "needs-human" : "no-action";
    await env.AUDIT.prepare("UPDATE fleet_issue_dispatch SET exec_state=?, exec_ts=?, exec_result=?, exec_attempts=COALESCE(exec_attempts,0)+1 WHERE fingerprint=?").bind(state2, now, spec && spec.note || "no safe auto-action", row.fingerprint).run();
    // ESCALATE-NO-HANDLER-1 (2026-09-27): an unmapped/no-safe-producer category MUST escalate to an
    // OWNED disposition (reorg_work_queue) instead of silently closing as terminal 'no-action'. The old
    // detect-not-fix behavior dropped 82/93 issues as no-handler-superseded/closed-no-action with no
    // owner, no due, no actor. Now every no-handler dispatch files one OWNED OPEN queue item (deduped).
    if (escalate) {
      try {
        const qitem = "issue-no-handler:" + row.fingerprint;
        const ex = await env.AUDIT.prepare("SELECT id FROM reorg_work_queue WHERE item=?1 AND state='OPEN'").bind(qitem).first();
        if (!ex) {
          await env.AUDIT.prepare("INSERT INTO reorg_work_queue (item, evidence, owner, due, state, created_at) VALUES (?1,?2,'qnfo-fleet-control',date('now','+7 day'),'OPEN',datetime('now'))").bind(qitem, "category=" + row.category + " resource=" + String(payload.resource || payload.title || "").slice(0, 120) + " :: " + (spec && spec.note || "")).run();
        }
      } catch (e) {
      }
    }
    if (state2 !== prior) {
      try {
        await env.AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts, status, verified_at) VALUES (?,?,?,?,?,?)").bind("fleet-execute", row.fingerprint, "[" + state2 + "] " + (spec && spec.note || ""), now, state2, now).run();
        await env.AUDIT.prepare("UPDATE self_heal_actions SET status=?1, verified_at=?2, claim=COALESCE(claim,?3), confidence=COALESCE(confidence,'high') WHERE kind='fleet-issue' AND ref=?4 AND status='dispatched'").bind(state2, now, "SELFHEAL-WRITEBACK-CLOSE-1: closed by paired fleet-execute receipt", row.fingerprint).run();
      } catch (e) {
      }
      if (row.gh_number && state2 === "needs-human") await ghComment(env, row.gh_number, "**Execution receipt:** needs-human - " + (spec && spec.note || "no safe autonomous action") + ". Owner " + (row.owner || "fleet") + " must act.");
    }
    return { fingerprint: row.fingerprint, category: row.category, state: state2, note: spec && spec.note || "" };
  }
  const svc = spec.svc ? env[spec.svc] : null;
  const t0 = Date.now();
  let ok = false, status = 0, body = "", aborted = false;
  try {
    if (!svc) throw new Error("binding " + spec.svc + " not bound");
    const _eh = { "User-Agent": PROBE_UA };
    if (spec.auth === "X-Reviser-Token" && env.REVISER_TOKEN) _eh["X-Reviser-Token"] = env.REVISER_TOKEN;
    const res = await svc.fetch("https://" + spec.svc + spec.path, { method: "POST", headers: _eh, signal: AbortSignal.timeout(3e4) });
    status = res.status;
    ok = res.ok;
    body = squash(await res.text()).slice(0, 240);
  } catch (e) {
    aborted = /abort/i.test(String((e && e.name) || "") + " " + String((e && e.message) || e));
    body = "ERR " + squash(String(e.message || e)).slice(0, 180);
  }
  // QUEUE-DRAIN-DISPATCH-FALSE-TIMEOUT-1 (issue 1667): an aborted dispatch is only a failure when the
  // consumer is NOT demonstrably advancing. POST research-exec /run answers 202 in 28-84ms incl. body
  // (measured 2026-09-30), so an abort here is a client-side subrequest-queue artefact, not a dead
  // target. Same convention as CHAIN-DRAINING-1 in qnfo-observability. progressJob is set only on the
  // research-exec specs, so no other target can be reclassified by a foreign worker's progress.
  if (!ok && aborted && spec.progressJob) {
    try {
      const pr = await env.AUDIT.prepare("SELECT MAX(ts) latest FROM cloud_ops_events WHERE job=?1 AND kind='done' AND status='ok' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ','now','-3 hours')").bind(spec.progressJob).first();
      if (pr && pr.latest) {
        ok = true;
        body = "accepted (dispatch aborted; consumer " + spec.progressJob + " advanced " + pr.latest + ")";
      }
    } catch (eP) {
    }
  }
  const ms = Date.now() - t0;
  const state = ok ? "executed" : "failed";
  const result = state + " HTTP " + status + " " + ms + "ms :: " + body;
  await env.AUDIT.prepare("UPDATE fleet_issue_dispatch SET exec_state=?, exec_ts=?, exec_result=?, exec_attempts=COALESCE(exec_attempts,0)+1 WHERE fingerprint=?").bind(state, now, result.slice(0, 400), row.fingerprint).run();
  if (state !== prior) {
    try {
      await env.AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts, status, verified_at) VALUES (?,?,?,?,?,?)").bind("fleet-execute", row.fingerprint, "[" + state + "] " + spec.note + " :: " + body.slice(0, 200), now, state, now).run();
      await env.AUDIT.prepare("UPDATE self_heal_actions SET status=?1, verified_at=?2, claim=COALESCE(claim,?3), confidence=COALESCE(confidence,'high') WHERE kind='fleet-issue' AND ref=?4 AND status='dispatched'").bind(state, now, "SELFHEAL-WRITEBACK-CLOSE-1: closed by paired fleet-execute receipt", row.fingerprint).run();
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
__name2222(execOne, "execOne");
async function loopExecute(env, deadlineMs) {
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
    // SCHEDULED-WALL-BUDGET-1: never start a dispatch that could outlive the invocation budget
    // (one dispatch = 30s call + D1 writes + a GitHub receipt at 15s).
    if (deadlineMs && Date.now() > deadlineMs - 6e4) break;
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
__name2222(loopExecute, "loopExecute");
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
__name2222(loopSnapshot, "loopSnapshot");
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
    if (gh_number) {
      // FRESH-STATE-1: never trust the cached gh_state; read the live issue so a
      // closed issue is reopened and an open one is never falsely reported open.
      const gi = await ghCall(env, "GET", "/repos/" + GH_REPO + "/issues/" + gh_number);
      if (gi.ok && gi.json && gi.json.state) gh_state = gi.json.state;
    }
    if (gh_number && gh_state !== "open") {
      await ghCall(env, "PATCH", "/repos/" + GH_REPO + "/issues/" + gh_number, { state: "open" });
      await ghComment(env, gh_number, "**Recurrence** - a signal with fingerprint " + i.id + " reappeared at " + (/* @__PURE__ */ new Date()).toISOString() + " after being closed. Reopened; the accountability loop resets and the dispatch is re-queued.");
      await ghRemoveLabel(env, gh_number, "verified-cleared");
      await ghRemoveLabel(env, gh_number, "stale");
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
      await ghRemoveLabel(env, L.gh_number, "stale");
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
__name2222(loopSync, "loopSync");
async function loopClaim(env, nowMs) {
  // ATOMIC single-writer claim: D1 serializes writes, so only ONE concurrent
  // caller sees meta.changes===1 for a given interval. This is what stops two
  // isolates racing loopSync and double-posting the same GitHub comment.
  try {
    const r = await env.AUDIT.prepare("INSERT INTO fleet_loop_meta (k,v) VALUES ('sync_lock', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v WHERE CAST(fleet_loop_meta.v AS INTEGER) < ?").bind(String(nowMs), String(nowMs - LOOP_MIN_INTERVAL_MS)).run();
    return !!(r && r.meta && Number(r.meta.changes) === 1);
  } catch (e) {
    return false;
  }
}
__name(loopClaim, "loopClaim");
async function loopMaybeSync(env, st) {
  try {
    const claimed = await loopClaim(env, Date.now());
    if (!claimed) return { ok: true, skipped: "throttled" };
    return await loopSync(env, st);
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 200) };
  }
}
__name(loopMaybeSync, "loopMaybeSync");
__name2(loopMaybeSync, "loopMaybeSync");
__name22(loopMaybeSync, "loopMaybeSync");
__name222(loopMaybeSync, "loopMaybeSync");
__name2222(loopMaybeSync, "loopMaybeSync");
async function buildState(env, ctx) {
  const nowMs = Date.now();
  const audits = [];
  const issues = [];
  const push = /* @__PURE__ */ __name2222(function(a) {
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
  __name2222(safeAudit, "safeAudit");
  await safeAudit("deployments", "Deployments (24h)", async function() {
    const cnt = await d1all(env.AUDIT, "SELECT COUNT(*) AS c FROM deployment_history WHERE deployed_at >= ?", [naive24]);
    const rows = await d1all(env.AUDIT, "SELECT resource_name, action, version_id, deployed_at, status FROM deployment_history ORDER BY deployed_at DESC LIMIT 3");
    const c = cnt && cnt.length ? cnt[0].c : -1;
    const latest = rows.length ? rows[0].resource_name + " " + rows[0].action + " " + (rows[0].version_id || "") + " @ " + rows[0].deployed_at : "none";
    push({ key: "deployments", label: "Deployments (24h)", state: "info", detail: c >= 0 ? c + " deploys; latest: " + latest : latest, ts: rows.length ? rows[0].deployed_at : null });
  });
  await safeAudit("worker_observability", "Worker observability (live)", async function() {
    const w = await d1all(env.AUDIT, "SELECT COUNT(*) AS n, COALESCE(SUM(requests),0) AS req FROM analytics_dash_workers");
    // OBS-OPEN-COUNT-1 (2026-09-30): COUNT(*) over every worker-observability row ever ingested is
    // monotonic -- a single transient 502 kept this warn lit forever. Count only rows still open
    // and last observed inside the same active window as worker errors (last_seen is epoch-ms
    // text from the Observability API ingest, or ISO text from the loop).
    // ...and, like worker errors, an issue last observed before its service's current code deploy
    // belongs to the previous version (service comes from the ingested Observability payload).
    // OBS-LASTOBSERVED-1 (2026-10-01): loop.last_seen advances on every re-poll of an Observability API issue that is
    // still "active", so a 502 from 2026-09-30 16:19Z read as "observed in the last 3h" the next morning. Date each issue
    // by the payload's lastObserved (when the error actually happened) and fall back to last_seen without a payload.
    const iss = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM (SELECT l.fingerprint, COALESCE((SELECT CASE WHEN json_valid(d.payload) THEN CAST(json_extract(d.payload, '$.lastObserved') AS REAL) END FROM fleet_issue_dispatch d WHERE d.fingerprint = l.fingerprint), (CASE WHEN CAST(l.last_seen AS REAL) > 1e12 THEN CAST(l.last_seen AS REAL) ELSE (julianday(l.last_seen) - 2440587.5) * 864e5 END)) AS seen_ms, (SELECT CASE WHEN json_valid(d.payload) THEN json_extract(d.payload, '$.service') END FROM fleet_issue_dispatch d WHERE d.fingerprint = l.fingerprint) AS svc FROM fleet_issue_loop l WHERE l.category='worker-observability' AND l.closed_at IS NULL) x WHERE x.seen_ms >= ? AND NOT EXISTS (SELECT 1 FROM fleet_deploys f WHERE x.svc IS NOT NULL AND f.worker = x.svc AND f.ok = 1 AND COALESCE(f.note,'') NOT LIKE 'SETTINGS-ONLY%' AND (julianday(f.ts) - 2440587.5) * 864e5 > x.seen_ms)", [nowMs - ERR_ACTIVE_MS]);
    const n = w && w.length ? (w[0].n || 0) : 0;
    const req = w && w.length ? (w[0].req || 0) : 0;
    const inObs = iss && iss.length ? (iss[0].n || 0) : 0;
    push({ key: "worker_observability", label: "Worker observability (live)", state: inObs > 0 ? "warn" : "ok", detail: n + " workers with live usage (" + req + " events/24h); " + inObs + " observability issue(s) observed in the last " + ERR_ACTIVE_MS / 36e5 + "h", ts: null });
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
    // GOVERNANCE-METRIC-DEFINITION-VERIFY-1: the alert metric MUST be a WINDOWED rate,
    // never an all-time failure total. An all-time count is monotonically non-decreasing,
    // so `liveTotal > 0` can never be false once the gateway has EVER failed -> a permanent
    // err no remediation can clear (canonical 2026-09-26: 290,608 all-time vs 66 in 24h).
    const since = new Date(Date.now() - 24 * 36e5).toISOString();
    const base = "https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/ai-gateway/gateways/default/logs?per_page=1&start_date=" + encodeURIComponent(since);
    let fail24 = null, all24 = null, liveErr = null;
    try {
      const gf = await fetch(base + "&success=false", { headers: { Authorization: "Bearer " + env.CF_TOKEN }, signal: AbortSignal.timeout(8e3) });
      if (gf.ok) { const g = await gf.json(); fail24 = g.result_info && g.result_info.total_count; } else liveErr = "HTTP " + gf.status;
      const gt = await fetch(base, { headers: { Authorization: "Bearer " + env.CF_TOKEN }, signal: AbortSignal.timeout(8e3) });
      if (gt.ok) { const g = await gt.json(); all24 = g.result_info && g.result_info.total_count; } else if (!liveErr) liveErr = "HTTP " + gt.status;
    } catch (e) {
      liveErr = String(e && e.message || e).slice(0, 60);
    }
    const rate = all24 && fail24 != null ? fail24 / all24 : null;
    const bad = fail24 != null && all24 != null && all24 >= 100 && fail24 >= 25 && rate > 0.05;
    let top = [];
    try {
      top = await d1all(env.AUDIT, "SELECT status, model, SUM(count) AS c FROM ai_gateway_failures WHERE ts >= " + (Date.now() - 24 * 36e5) + " GROUP BY status, model ORDER BY c DESC LIMIT 4") || [];
    } catch (e) {
    }
    const tc = top.map(function(r) {
      return r.status + " " + r.model + " x" + r.c;
    }).join(", ");
    push({
      key: "gw_failures",
      label: "AI gateway failures (live)",
      state: bad ? "err" : "ok",
      detail: "24h " + (fail24 == null ? liveErr || "n/a" : fail24) + " failed / " + (all24 == null ? liveErr || "n/a" : all24) + " total" + (rate == null ? "" : " (" + (rate * 100).toFixed(2) + "%)") + "; alert when >=25 fails and >5%" + (tc ? "; top24: " + tc : ""),
      ts: null
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
    const _calls = Number(r.c) || 0, _bad = Number(r.bad) || 0;
    const _rate = _calls > 0 ? _bad / _calls : 0;
    const _st = _rate >= 0.2 ? "err" : _rate >= 0.05 ? "warn" : "ok";
    push({ key: "ops_gateway", label: "Ops AI gateway (24h)", state: _st, detail: _calls + " calls, " + _bad + " failed (ok=0, " + Math.round(_rate * 1e3) / 10 + "%), avg " + r.avgms + "ms", ts: r.latest });
  });
  await safeAudit("ai_model_health", "AI model health", async function() {
    const rows = await d1all(env.AUDIT, "SELECT model_id, status, consecutive_failures, last_probe_ts FROM ai_model_health ORDER BY model_id");
    const bad = rows.filter(function(r) {
      return String(r.status || "").toLowerCase() !== "ok" || (r.consecutive_failures || 0) > 0;
    });
    let gwf = [];
    try {
      gwf = await d1all(env.AUDIT, "SELECT model, SUM(count) AS c FROM ai_gateway_failures WHERE ts >= " + (Date.now() - 24 * 36e5) + " GROUP BY model ORDER BY c DESC LIMIT 6") || [];
    } catch (e) {
    }
    const gwTop = gwf.map(function(r) {
      return (r.model || "?") + " x" + r.c;
    }).join(", ");
    const gwBad = gwf.reduce(function(a, r) { return a + (r.c || 0); }, 0) >= 25;
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
    // LINEAGE-TRUTH-1 (2026-10-01, #1651): living-paper paper_versions (1 row) and citations (0 rows) have no writer, so
    // "versions=1 citations=0" understated lineage. Revisions come from paper_revision_log; Zenodo version counts and
    // OpenAlex citations come from citation_stats (qnfo-paper-indexer, daily).
    const g = await d1all(env.LIVING, "SELECT COUNT(*) AS papers FROM papers");
    const since = new Date(Date.now() - 3 * 864e5).toISOString();
    const a = await d1all(env.AUDIT, "SELECT (SELECT COUNT(DISTINCT slug) FROM paper_revision_log WHERE status='published' AND new_doi IS NOT NULL) AS revised, (SELECT COUNT(*) FROM (SELECT doi FROM citation_stats WHERE source='zenodo' AND metric='versions' AND collected_at >= ?1 GROUP BY doi HAVING MAX(value) >= 2)) AS multi_version, (SELECT COALESCE(SUM(v),0) FROM (SELECT MAX(value) AS v FROM citation_stats WHERE source='openalex' AND metric='cited_by_count' AND collected_at >= ?1 GROUP BY doi)) AS citations", [since]);
    const r = g && g.length ? g[0] : {}, q = a && a.length ? a[0] : {};
    push({ key: "living_paper", label: "Living paper store", state: "info", detail: "papers=" + r.papers + " revised(published new version)=" + q.revised + " multi-version(Zenodo)=" + q.multi_version + " citations(OpenAlex)=" + q.citations, ts: null });
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
  const ageOf = /* @__PURE__ */ __name222(function(raw) {
    if (raw == null) return null;
    let ms = typeof raw === "number" ? raw : Date.parse(String(raw).replace(" ", "T"));
    if (isNaN(ms) && !isNaN(Number(raw))) ms = Number(raw);
    if (isNaN(ms)) return null;
    return Math.round((nowMs - ms) / 36e5);
  }, "ageOf");
  const qlook = /* @__PURE__ */ __name222(async function(db, sql) {
    try {
      const g = await d1all(db, sql);
      return g && g.length ? g[0] : {};
    } catch (e) {
      return { __err: squash(String(e.message || e)).slice(0, 90) };
    }
  }, "qlook");
  await safeAudit("queue_research", "Queue research_queue (open+failed)", async function() {
    const o = await qlook(env.AUDIT, "SELECT COUNT(*) AS open, MAX(created_at) AS mx FROM research_queue WHERE status IN ('pending','queued','researching','ensemble-draft','claimed')");
    const f = await qlook(env.AUDIT, "SELECT COUNT(*) AS c, COALESCE(SUM(CASE WHEN COALESCE(recover_count,0) >= 2 OR COALESCE(terminal_rearms,0) >= 3 THEN 1 ELSE 0 END),0) AS terminal FROM research_queue WHERE status='failed'");
    if (o.__err || f.__err) {
      push({ key: "queue_research", label: "Queue research_queue", state: "warn", detail: "probe error " + (o.__err || f.__err), ts: null });
      return;
    }
    const open = Number(o.open) || 0, failed = Number(f.c) || 0, terminal = Number(f.terminal) || 0, recoverable = failed - terminal, age = ageOf(o.mx);
    // QUEUE-DRAIN-FRESHNESS-1 (2026-09-30): MAX(created_at) measures the PRODUCER. A queue whose
    // consumer advanced a stage recently is draining, not stale, however old its newest row is.
    const dp = await qlook(env.AUDIT, "SELECT MAX(ts) AS mx FROM cloud_ops_events WHERE job='qnfo-research-exec' AND kind='done' AND status='ok' AND ts >= '" + new Date(nowMs - 2 * DAY_MS).toISOString() + "'");
    const drainAge = dp && !dp.__err ? ageOf(dp.mx) : null;
    const stale = open > 0 && age !== null && age > 24 && (drainAge === null || drainAge > 24);
    queueStats.push({ queue: "research_queue", db: "qnfo-audit", open, failed, newest: o.mx || null, age_h: age, stale, drain: "qnfo-research-exec", action: failed > 0 ? recoverable > 0 ? "research-exec retry recoverable failed rows" : "terminal failure - root-cause ensemble leg production" : stale ? "run research-exec scan; drain ensemble-draft/pending" : "none" });
    push({ key: "queue_research", label: "Queue research_queue", state: failed > 0 ? "err" : stale ? "warn" : open > 0 ? "info" : "ok", detail: "open=" + open + " failed=" + failed + " newest=" + (age === null ? "n/a" : age + "h") + " last-drain=" + (drainAge === null ? "none 48h" : drainAge + "h") + (stale ? " STALE (>24h, no drain progress)" : open > 0 ? " draining" : "") + (failed > 0 ? " FAILED=" + failed + (terminal > 0 ? " terminal=" + terminal + " (auto-retry exhausted; root-cause required)" : "") + (recoverable > 0 ? " recoverable=" + recoverable + " (research-exec can retry)" : "") : "") + " drain=qnfo-research-exec", ts: o.mx || null });
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
    const pend = Number(p.c) || 0, nc = Number(n.c) || 0;
    // MEASUREMENT (2026-09-26): 'needs-contact' rows are arxiv-radar candidates with NO email (author='', email NULL)
    // -- they are NOT drainable by the send worker, so they must NOT count as "open" or gate freshness.
    // Drainable = the selector the send worker actually consumes. needs-contact is tracked separately.
    const drainable = await qlook(env.AUDIT, "SELECT COUNT(*) AS c, MAX(created_at) AS mx FROM outreach_queue WHERE status IN ('pending','needs-email','queued')");
    const open = Number(drainable.c) || 0, age = ageOf(drainable.mx);
    // GATE-AWARENESS (2026-09-26): a non-advancing drainable queue is EXPECTED, not "stale", while the
    // operator kill switch is off. Read it from the outreach DB so the signal never fake-flags staleness.
    let gate = null;
    try { const gs = await d1all(env.OUTREACH, "SELECT value FROM pipeline_state WHERE key='external_sends_enabled'"); gate = gs && gs.length ? String(gs[0].value) : null; } catch (e) { gate = null; }
    const gated = gate === "0" || gate === "false";
    // QUEUE-DRAIN-FRESHNESS-1: the drain sends at a deliberate 8/day cap; judge it by its last send.
    const ls = await qlook(env.AUDIT, "SELECT MAX(sent_at) AS mx FROM outreach_queue WHERE status='sent'");
    const sendAge = ls && !ls.__err ? ageOf(ls.mx) : null;
    const stale = !gated && open > 0 && age !== null && age > 24 && (sendAge === null || sendAge > 26);
    queueStats.push({ queue: "outreach_queue", db: "qnfo-audit", open, pending: pend, needs_contact: nc, newest: drainable.mx || null, age_h: age, stale, selector_drift: false, activation: "2026-09-15", drain: "qnfo-cloud-ops/jobOutreach", action: nc > 0 ? nc + " candidates awaiting contact enrichment (no email; not sendable)" : gated ? "external sends gated (kill switch off)" : stale ? "drain due - qnfo-cloud-ops jobOutreach (8/day cap)" : "none" });
    push({ key: "queue_outreach", label: "Queue outreach_queue", state: gated ? "info" : stale ? "warn" : open > 0 ? "info" : "ok", detail: "drainable=" + open + " (pending=" + pend + ") newest=" + (age === null ? "n/a" : age + "h") + " last-send=" + (sendAge === null ? "n/a" : sendAge + "h") + (gated ? " SEND-GATED (kill switch off)" : stale ? " STALE (>24h, no send in 26h)" : open > 0 ? " draining at 8/day cap, ETA " + Math.ceil(open / 8) + "d" : "") + "; " + nc + " awaiting-contact (undrainable, no email)", ts: drainable.mx || null });
  });
  const analytics = await analytics24(env);
  // Errors that all precede the worker's current CODE deploy (last error hour closed before the
  // deploy landed) belong to the previous version: they are "recovered", active or not. Anything
  // after the deploy stays active. Same settle rule as qnfo-deploy-guard (workerSettled).
  const _recovered = [], _unfixed = [], _active = [];
  if ((analytics.errWorkers && analytics.errWorkers.length) || (analytics.recoveredWorkers && analytics.recoveredWorkers.length)) {
    let lastDeploy = {};
    try {
      const ld = await d1all(env.AUDIT, "SELECT worker, MAX(ts) AS ts FROM fleet_deploys WHERE ok=1 AND COALESCE(note,'') NOT LIKE 'SETTINGS-ONLY%' GROUP BY worker") || [];
      for (const r of ld) lastDeploy[r.worker] = Date.parse(r.ts);
    } catch (e) {
    }
    const predates = function(w) {
      const lastErrEnd = Date.parse(w.last_error_hour || "") + 36e5;
      const dep = lastDeploy[w.name];
      return isFinite(lastErrEnd) && isFinite(dep) && dep >= lastErrEnd;
    };
    for (const w of analytics.errWorkers || []) {
      if (predates(w)) _recovered.push(w);
      else _active.push(w);
    }
    for (const w of analytics.recoveredWorkers || []) {
      if (predates(w)) _recovered.push(w);
      else _unfixed.push(w);
    }
    for (const w of _recovered) {
      if (analytics.per[w.name]) analytics.per[w.name].errors_active = 0;
    }
  }
  analytics.errWorkers = _active;
  analytics.recovered = _recovered;
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
    const per = analytics.per[s.name] || { requests: 0, errors: 0, errors_active: 0 };
    const exp = expectedFires(s.crons, now.getTime(), DAY_MS);
    const createdMs = s.created_on ? Date.parse(s.created_on) : NaN;
    const young = isFinite(createdMs) && (now.getTime() - createdMs) < 26 * 36e5;
    let st;
    if ((per.errors_active || 0) > 0) st = "ERR";
    else if (exp > 0 && per.requests === 0 && !s.no_run_exempt && !young) st = "NO-RUN";
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
      err_active: per.errors_active || 0,
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
  const _errFmt = function(w) {
    return w.name + "(" + w.errors + (w.errors_active != null && w.errors_active !== w.errors ? ", " + w.errors_active + " active" : "") + "; " + Object.keys(w.by_status || {}).map(function(k) {
      return k + "=" + w.by_status[k];
    }).join(" ") + (w.last_error_hour ? "; last " + String(w.last_error_hour).slice(5, 13).replace("T", " ") + "h" : "") + ")";
  };
  if (_active.length) issues.push({ sev: "err", text: _active.length + " worker(s) with errors in the last " + ERR_ACTIVE_MS / 36e5 + "h and after their current deploy: " + _active.map(_errFmt).join(", ") });
  if (_unfixed.length) issues.push({ sev: "warn", text: _unfixed.length + " worker(s) with 24h errors, none in the last " + ERR_ACTIVE_MS / 36e5 + "h and no deploy since: " + _unfixed.map(_errFmt).join(", ") });
  if (analytics.error) issues.push({ sev: "warn", text: "analytics unavailable: " + analytics.error });
  // AUTONOMY-SCORE-STALE-FLAG-1 (2026-10-01, issue 1679): mission 2.1 makes the VSM and OODA scores the fleet's
  // self-tracking, and they sat 6-20 days stale with nothing on this page saying so. qnfo-autonomy-scorer now
  // rescores them daily; flag any VSM/OODA/composite row older than 48h so a stopped scorer is visible.
  try {
    const stale = await d1all(env.AUDIT, "SELECT dimension, scored_at FROM autonomy_scores WHERE framework IN ('VSM','OODA','composite') AND (scored_at IS NULL OR scored_at < ?)", [new Date(nowMs - 48 * 36e5).toISOString().slice(0, 10)]) || [];
    if (stale.length) issues.push({ sev: "warn", text: stale.length + " autonomy score(s) older than 48h (qnfo-autonomy-scorer not rescoring): " + stale.map(function(r) {
      return r.dimension + "@" + (r.scored_at || "never");
    }).join(", ") });
  } catch (e) {
  }
  const chains = [];
  const sysChains = systemIntegration && systemIntegration.chains || [];
  for (const c of sysChains) {
    const mapSt = c.status === "healthy" || c.status === "draining" ? "ok" : c.status === "unknown" ? "ok" : "warn";
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
    recovered_workers: analytics.recovered || [],
    error_workers: analytics.errWorkers || [],
    loop: await loopSnapshot(env),
    meta: { device_captured_at: dev.captured_at, schema: "fleet-state/live", sources: { scheduled: "worker_schedules", probes: "service_registry", report_card: "autonomy_scores", chains: "integration_state(qnfo-observability)" } }
  };
}
__name(buildState, "buildState");
__name2(buildState, "buildState");
__name22(buildState, "buildState");
__name222(buildState, "buildState");
__name2222(buildState, "buildState");
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
__name22(depNamesOf, "depNamesOf");
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
__name22(contractDepsOf, "contractDepsOf");
__name222(depNamesOf, "depNamesOf");
__name2222(depNamesOf, "depNamesOf");
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
__name2222(readSystemIntegration, "readSystemIntegration");
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
  const deg = /* @__PURE__ */ __name2222(function(s) {
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
__name2222(integrationView, "integrationView");
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
  const g = /* @__PURE__ */ __name222(function(k) {
    return dim[k] && typeof dim[k].score === "number" ? dim[k].score : null;
  }, "g");
  const fmt = /* @__PURE__ */ __name222(function(v) {
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
__name2222(reportCardData, "reportCardData");
var inflight = null;
// WORKER-ERRORS-RECENCY-1: errors inside this window are "active"; older 24h errors are
// reported as recovered (cleared by a later deploy) or as a warn (no deploy since).
var ERR_ACTIVE_MS = 3 * 36e5;
// SCHEDULED-WALL-BUDGET-1 (2026-09-30): the */15 cron awaited runRefresh (<=90s) + loopSync +
// loopExecute (up to 25 dispatches x 30s + GitHub receipts) + liveScheduled with no overall
// bound, and the Workers Observability API recorded "Worker invocation ended with
// exceededWallTime" (15 internalError/24h). Every phase now runs against one deadline.
var SCHEDULED_BUDGET_MS = 10 * 60 * 1e3;
// Cached state for the human page: never blocks on a rebuild unless nothing is cached yet. maxAgeMs lets the
// 10s page poll avoid triggering the heavy probe fan-out more than once per 5 min.
async function currentState(env, ctx, maxAgeMs) {
  const rec = await loadState(env);
  if (!rec) {
    try {
      return await runRefresh(env, ctx);
    } catch (e) {
      return null;
    }
  }
  if (Date.now() - new Date(rec.updatedAt).getTime() > (maxAgeMs || STALE_MS)) ctx.waitUntil(runRefresh(env, ctx).catch(function() {
  }));
  return rec.state;
}
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "OPTIONS") return json({}, 204);
  const owner = await ownerState(request, env);
  if (path.indexOf("/api/owner/") === 0) return await ownerRoutes(request, env, ctx, path, owner);
  // OWNER-PAGE-1 (2026-10-01): private owner page. Reconciled with OWNER-RESPOND-1: the owner cookie OR LOOP_TOKEN opens it.
  // OWNER-EDIT-1 (2026-10-01, CLOUDFLARE-ONLY-HOST-1): /owner/edit/<key> is the owner's editor for owner_docs, so the Identity
  // doc is read AND changed on Cloudflare; its claude.ai copy is retired.
  if (path === "/owner" || path === "/owner/" || path.indexOf("/owner/doc/") === 0 || path.indexOf("/owner/edit/") === 0) return await ownerRoute(request, env, path, owner);
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
    const frag = url.searchParams.get("frag") === "1";
    // OWNER-RESPOND-1: once OWNER_TOKEN is set, everyone without the owner cookie gets a locked shell.
    if (owner.configured && !owner.authed) return new Response(frag ? "locked" : lockedHtml(), { status: frag ? 401 : 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    const st = await currentState(env, ctx, 5 * 6e4);
    const v = await humanView(env, st, ctx);
    if (owner.authed) {
      v.owner.authed = true;
      v.prompts = await ownerPromptsView(env);
      v.responses = await recentResponses(env);
    }
    const body = frag ? humanFragment(v) : humanHtml(v);
    return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  // REACH-SIGNALS-INGEST-1 (2026-10-01, #1711): the scorecard as JSON for the daily portfolio run, and a token-gated
  // ingest of one complete UTC day (backfill, or a re-run of yesterday) that bypasses the daily throttle.
  if (path === "/api/reach") {
    return json(await reachScorecardData(env));
  }
  if (path === "/api/reach/ingest" && request.method === "POST") {
    const tok = request.headers.get("x-loop-token") || "";
    if (!env.LOOP_TOKEN || tok !== env.LOOP_TOKEN) return json({ error: "unauthorized" }, 401);
    return json(await ingestReachSignals(env, { day: url.searchParams.get("day") || reachYesterday(Date.now()) }));
  }
  // HUMAN-DASHBOARD-1: /ops and /roi were folded into the one human page; old bookmarks land there.
  if (path === "/roi" || path === "/api/roi" || path === "/ops") {
    return new Response(null, { status: 301, headers: { Location: "/", "Cache-Control": "no-store" } });
  }
  // Machine callers present x-loop-token (same secret as the POST endpoints); the owner uses the cookie.
  const machine = !!(env.LOOP_TOKEN && request.headers.get("x-loop-token") === env.LOOP_TOKEN);
  const privateView = owner.configured && !owner.authed && !machine;
  if (path === "/api/human" && request.method === "GET") {
    const st = await currentState(env, ctx, 5 * 6e4);
    const v = await humanView(env, st, ctx);
    if (privateView) return json({ schema_version: "fleet-human/v2", locked: true, verdict: v.verdict, count: v.count });
    if (owner.authed || machine) v.responses = await recentResponses(env);
    return json(v);
  }
  // The investment verdict + the business-case inputs behind it. ?refresh=1 (used by the fleet-exec heartbeat task)
  // re-measures (throttled to one run / 2 min) and republishes to the ops/fleet feeds.
  if (path === "/api/decision" && request.method === "GET") {
    const st = await currentState(env, ctx, 5 * 6e4);
    if (url.searchParams.get("refresh") === "1") ctx.waitUntil(govClaim(env, 12e4).then(async function(ok) {
      if (!ok) return;
      await governanceSnapshot(env, st);
      await publishFeeds(env, await humanView(env, st, null));
    }).catch(function() {
    }));
    const v = await humanView(env, st, ctx);
    if (privateView) return json({ schema_version: "fleet-decision/v1", locked: true, verdict: v.decision.verdict, level: v.decision.level, advisory: true });
    return json({ schema_version: "fleet-decision/v1", worker: NAME, version: VERSION, generated_at: v.generated_at, verdict: v.decision.verdict, risk: v.decision.risk, level: v.decision.level, basis: v.decision.basis, headline: v.decision.headline, reasons: v.decision.reasons, flips: v.decision.flips, levers: v.decision.levers, gate: v.decision.gate, inputs: v.decision.inputs, business: v.business, feeds: v.feeds, advisory: true });
  }
  // Attest evidence the machines cannot measure (credibility events, funding, revenue). Evidence is mandatory.
  //   {"key":"credibility_events","value":2,"evidence":"<url or description>"}
  if (path === "/api/decision/fact" && request.method === "POST") {
    const tok = request.headers.get("x-loop-token") || "";
    if (!env.LOOP_TOKEN || tok !== env.LOOP_TOKEN) return json({ error: "unauthorized" }, 401);
    let b = null;
    try {
      b = await request.json();
    } catch (e) {
    }
    if (!b || !INVEST_FACT_KEYS[b.key]) return json({ error: "key must be one of " + Object.keys(INVEST_FACT_KEYS).join(", ") }, 400);
    if (!String(b.evidence || "").trim()) return json({ error: "evidence required" }, 400);
    const val = INVEST_FACT_KEYS[b.key] === "boolean" ? (b.value === true || b.value === "true" ? "true" : b.value === false || b.value === "false" ? "false" : null) : isFinite(Number(b.value)) && b.value !== "" && b.value !== null ? String(Number(b.value)) : null;
    if (val == null) return json({ error: "value must be " + INVEST_FACT_KEYS[b.key] }, 400);
    await ensureInvestTables(env);
    await env.AUDIT.prepare("INSERT INTO invest_facts (key, value, evidence, updated_at) VALUES (?1,?2,?3,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, evidence=excluded.evidence, updated_at=excluded.updated_at").bind(b.key, val, String(b.evidence).slice(0, 500)).run();
    return json({ ok: true, key: b.key, value: val });
  }
  // Any worker or session files / clears a human action here (same token as the loop endpoints).
  //   {"op":"add","slug":"...","title":"...","why":"...","default":"...","action":"...","url":"https://...","sev":"urgent|normal","due":"YYYY-MM-DD"}
  //   {"op":"resolve","slug":"...","resolution":"evidence"}
  if (path === "/api/human" && request.method === "POST") {
    const tok = request.headers.get("x-loop-token") || "";
    if (!env.LOOP_TOKEN || tok !== env.LOOP_TOKEN) return json({ error: "unauthorized" }, 401);
    let b = null;
    try {
      b = await request.json();
    } catch (e) {
    }
    if (!b || !/^[a-z0-9][a-z0-9._:-]{2,80}$/.test(String(b.slug || ""))) return json({ error: "slug required: [a-z0-9._:-]{3,81}" }, 400);
    await ensureHumanTable(env);
    if (b.op === "resolve") {
      if (!String(b.resolution || "").trim()) return json({ error: "resolution (evidence) required" }, 400);
      const r = await env.AUDIT.prepare("UPDATE human_actions SET status='resolved', resolved_at=datetime('now'), updated_at=datetime('now'), resolution=?1 WHERE slug=?2 AND status='open'").bind(String(b.resolution).slice(0, 500), b.slug).run();
      return json({ ok: true, resolved: r.meta && r.meta.changes || 0 });
    }
    if (b.op === "add") {
      if (!String(b.title || "").trim()) return json({ error: "title required" }, 400);
      if (b.url && !/^https:\/\//.test(String(b.url))) return json({ error: "url must be https" }, 400);
      if (b.url && !safeLink(b.url)) return json({ error: "links to claude.ai / anthropic.com are refused: owner data lives on Cloudflare (NO-CLAUDE-RUNTIME-DEPENDENCY-1)" }, 400);
      await env.AUDIT.prepare("INSERT INTO human_actions (slug, title, why, default_in_effect, action, url, sev, due, source) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(slug) DO UPDATE SET title=excluded.title, why=excluded.why, default_in_effect=excluded.default_in_effect, action=excluded.action, url=excluded.url, sev=excluded.sev, due=excluded.due, status='open', resolved_at=NULL, resolution=NULL, updated_at=datetime('now')").bind(b.slug, String(b.title).slice(0, 200), String(b.why || "").slice(0, 400), String(b.default || "").slice(0, 300), String(b.action || "").slice(0, 300), String(b.url || ""), b.sev === "urgent" ? "urgent" : "normal", String(b.due || "").slice(0, 10), String(b.source || "api").slice(0, 60)).run();
      return json({ ok: true, slug: b.slug });
    }
    return json({ error: "op must be add|resolve" }, 400);
  }
  return json({ error: "not found", path }, 404);
}
__name(handleRequest, "handleRequest");
__name2(handleRequest, "handleRequest");
__name22(handleRequest, "handleRequest");
__name222(handleRequest, "handleRequest");
__name2222(handleRequest, "handleRequest");
async function runRefresh(env, ctx) {
  if (inflight) return inflight;
  inflight = (async function() {
    const t0 = Date.now();
    // REFRESH-DEADLINE-1 (2026-09-30): buildState fans out to 38 live probes + several
    // CF/GitHub API calls. Under partial degradation a single unresponsive sub-request
    // held the whole invocation to the 900s cron wall limit -> Cloudflare reported
    // "Worker invocation ended with exceededWallTime" (14 internalError/24h, issue class
    // from the Workers Observability API). Bound the refresh so the handler always
    // returns a state (possibly degraded) well before the platform wall limit.
    let st;
    try {
      st = await Promise.race([buildState(env, ctx), new Promise(function(_res, rej) {
        setTimeout(function() {
          rej(new Error("REFRESH-DEADLINE-1: buildState exceeded 90000ms"));
        }, 9e4);
      })]);
    } catch (eD) {
      const prev = await loadState(env);
      if (prev && prev.state) return prev.state;
      return { generated_at: (/* @__PURE__ */ new Date()).toISOString(), version: VERSION, refresh_ms: Date.now() - t0, deadline_error: String(eD && eD.message || eD), fleet: { workers: 0, scheduled: 0, probes: 0, d1_databases: 0, analytics_error: "refresh deadline" }, totals: { req24: 0, err24: 0 }, scheduled: [], audits: [], probes: [], chains: [], issues: [], issue_counts: { err: 0, warn: 0, total: 0 }, integration: {}, meta: {}, verdict: "UNKNOWN" };
    }
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
__name2222(runRefresh, "runRefresh");
async function ensureReportCardTable(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS report_card_history (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, sai REAL, grade TEXT, scores_json TEXT, signals_json TEXT)").run();
}
__name(ensureReportCardTable, "ensureReportCardTable");
__name2(ensureReportCardTable, "ensureReportCardTable");
__name22(ensureReportCardTable, "ensureReportCardTable");
__name222(ensureReportCardTable, "ensureReportCardTable");
__name2222(ensureReportCardTable, "ensureReportCardTable");
function computeSai(st, bench, cfg, live) {
  const clamp = /* @__PURE__ */ __name222(function(x) {
    return Math.max(0, Math.min(1, x));
  }, "clamp");
  const P = cfg || {};
  const LD = live || {};
  const dims = LD.dims || {};
  const nd = /* @__PURE__ */ __name222(function(k) {
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
  const externalImpact = typeof LD.externalImpact === "number" ? Math.max(0, Math.min(1, LD.externalImpact)) : 0;
  const scores = { autonomy, thinking, decision, self_improv: selfImprov, reliability, integration, external_impact: externalImpact, governance };
  const weights = ["w_autonomy", "w_thinking", "w_decision", "w_self_improv", "w_reliability", "w_integration", "w_external_impact", "w_governance"];
  const missing = weights.filter(function(k) {
    return typeof P[k] !== "number";
  });
  const sai = missing.length || scores.decision == null ? null : 100 * (P.w_autonomy * scores.autonomy + P.w_thinking * scores.thinking + P.w_decision * scores.decision + P.w_self_improv * scores.self_improv + P.w_reliability * scores.reliability + P.w_integration * scores.integration + P.w_external_impact * scores.external_impact + P.w_governance * scores.governance);
  return { sai: sai == null ? null : Math.round(sai * 10) / 10, scores, weights_source: "sai_config", config_missing: missing, decision_source: decLive.length ? "autonomy_scores" : "unavailable", signals: { probe_ratio: probeRatio, chain_ratio: chainRatio, issues_err: nErr, issues_warn: nWarn, open_agent_issues: openIssues, user_wait: userWait, islands: islands.length, drift_bad: driftBad, density, no_run: noRun, closure_rate: closureRate, heal_rate: healRate } };
}
__name(computeSai, "computeSai");
__name2(computeSai, "computeSai");
__name22(computeSai, "computeSai");
__name222(computeSai, "computeSai");
__name2222(computeSai, "computeSai");
__name2222(computeSai, "computeSai");
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
    // REPORT-CARD-FAIL-CLOSED-1 (2026-09-27, red-team F4): never persist a NULL SAI as if it were a
    // measurement. A missing weight (config_missing) or a null decision must FAIL CLOSED: emit a
    // visible warning event and skip the history row, so the latest report card is never a fake null.
    if (sai.sai == null) {
      try {
        await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'report-card-weekly', ?3, ?4, 'qnfo-fleet-dashboard', 'warn')").bind("rc-weekly-SKIP-" + iso, now.toISOString(), "SKIPPED: SAI null (config_missing=" + JSON.stringify(sai.config_missing) + ", decision=" + sai.decision_source + ")", JSON.stringify(sai)).run();
      } catch (e) {
      }
      return { weekly: false, skipped: true, sai_null: true, config_missing: sai.config_missing };
    }
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
__name2222(persistWeeklyReportCard, "persistWeeklyReportCard");
// DASHBOARD-NOINDEX-1 (2026-10-01): fleet.qnfo.org is an internal dashboard (revenue, AI spend)
// that search engines could index. robots.txt is answered before any routing, and every response
// leaves through this one exit, so no route can forget the header. Falls back to a copy when a
// response's headers are immutable.
function noIndex(res) {
  try {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  } catch (e) {
  }
  const r = new Response(res.body, res);
  r.headers.set("X-Robots-Tag", "noindex, nofollow");
  return r;
}
__name(noIndex, "noIndex");
var worker_default = {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/robots.txt") {
      return noIndex(new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } }));
    }
    let res;
    try {
      res = await handleRequest(request, env, ctx);
    } catch (e) {
      res = json({ ok: false, error: String(e.message || e) }, 500);
    }
    return noIndex(res);
  },
  async scheduled(controller, env, ctx) {
    const deadline = Date.now() + SCHEDULED_BUDGET_MS;
    const within = function(p, reserveMs) {
      const left = deadline - Date.now() - (reserveMs || 0);
      if (left <= 0) return Promise.resolve(null);
      return Promise.race([p, new Promise(function(res) {
        setTimeout(function() {
          res(null);
        }, left);
      })]);
    };
    try {
      // runRefresh already schedules loopMaybeSync (the claimed, single-writer GitHub sync) via
      // waitUntil. The unconditional loopSync that followed here bypassed that claim, so every
      // cron ran the sync twice concurrently (double GitHub traffic, duplicate-comment risk).
      const st = await runRefresh(env, ctx);
      ctx.waitUntil(within(persistWeeklyReportCard(env, st).catch(function() {
      })));
      ctx.waitUntil(within(persistRoiSnapshot(env).catch(function() {
      })));
      ctx.waitUntil(within(refreshRegistryMetrics(env).catch(function() {
      })));
      ctx.waitUntil(within(governanceSnapshot(env, st).then(async function() {
        await publishFeeds(env, await humanView(env, st, null));
      }).catch(function() {
      })));
      // REACH-SIGNALS-INGEST-1 (2026-10-01, #1711): once per UTC day after 02:00Z; throttled inside on the
      // cloud_ops_events row reach-ingest-<day> (ok = done; partial retried up to 3 attempts).
      ctx.waitUntil(within(ingestReachSignals(env).catch(function() {
      })));
      // PORTFOLIO-DAILY-1 (2026-10-01): owner-voice guard + portfolio_runs row, once per UTC day after 05:00Z; throttled
      // inside on the cloud_ops_events row portfolio-daily-<day>.
      ctx.waitUntil(within(portfolioDailyRun(env).catch(function() {
      })));
      // IDENTITY-STORE-1: complete the one-time, byte-checked move of owner_docs into the private store within one tick of a
      // deploy, then bring any later write to qnfo-audit.owner_docs across (copy only, 1.12.1).
      ctx.waitUntil(within(identityStoreSync(env).catch(function() {
      })));
      // IDENTITY-WEEKLY-1 (moved from qnfo-cloud-ops with IDENTITY-STORE-1): Mondays after 06:00Z, throttled inside on the
      // cloud_ops_events row identity-weekly-<day>.
      ctx.waitUntil(within(identityWeeklyRun(env).catch(function() {
      })));
      try {
        await within(loopExecute(env, deadline - 12e4), 6e4);
      } catch (e3) {
      }
      try {
        const _lf = await env.AUDIT.prepare("SELECT service FROM service_registry WHERE state='live'").all();
        const _names = (_lf.results || []).map(function(x) {
          return x.service;
        });
        if (_names.length) await within(liveScheduled(env, _names), 3e4);
      } catch (e4) {
      }
      return new Response("ok generated " + st.generated_at + " issues " + (st.issues || []).length);
    } catch (e) {
      return new Response("err " + String(e.message || e), { status: 500 });
    }
  }
};
// REGISTRY-REFRESH-DASHBOARD-1 (2026-09-30, agent_issues #1411): metric_registry names this worker's
// cron as the refresher for pageviews_30d / impressions_growth_30d, but nothing wrote them (stale
// since 09-27/09-29), and guard_rcs / referral_30d / fleet_context_tokens had no live writer at all.
// Each value is computed from its source here; a source that cannot be read leaves the row
// untouched (never a fabricated zero). Throttled to one pass per ~55 min.
var REGISTRY_GUARD_WORKFLOWS = ["mirror-guard.yml", "version-bump-guard.yml", "workflow-lint.yml", "deploy-gate.yml", "dup-worker-name-gate.yml"];
// IMPRESSIONS-METRIC-PRIOR-WINDOW-1 (2026-10-01): distinct days with RUM rows in a window; a 30-day comparison needs
// at least RUM_MIN_PRIOR_DAYS of them.
var RUM_MIN_PRIOR_DAYS = 28;
function rumDaysCovered(rows) {
  const d = {};
  for (const r of rows || []) { const k = r && r.dimensions && r.dimensions.date; if (k && (r.count || 0) > 0) d[k] = 1; }
  return Object.keys(d).length;
}
async function refreshRegistryMetrics(env) {
  const out = { refreshed: [], skipped: [] };
  const nowIso = new Date().toISOString();
  try {
    const last = await d1all(env.AUDIT, "SELECT last_refreshed FROM metric_registry WHERE metric='pageviews_30d'");
    const lt = last && last.length ? Date.parse(String(last[0].last_refreshed || "").replace(" ", "T")) : NaN;
    if (isFinite(lt) && Date.now() - lt < 55 * 60 * 1e3) return { throttled: true };
  } catch (e) {
  }
  const put = async function(metric, value, state, extraSql, extraBind) {
    try {
      await env.AUDIT.prepare("UPDATE metric_registry SET last_value=?1, last_refreshed=?2, state=?3" + (extraSql || "") + " WHERE metric=?4").bind(String(value), nowIso, state, metric, ...(extraBind || [])).run();
      out.refreshed.push(metric);
    } catch (e) {
      out.skipped.push(metric + ": " + String(e && e.message || e).slice(0, 80));
    }
  };
  const acct = 'accounts(filter: { accountTag: "' + ACCOUNT + '" })';
  const win = function(fromH, toH) {
    return 'filter: { datetime_geq: "' + new Date(Date.now() - fromH * 36e5).toISOString() + '", datetime_leq: "' + new Date(Date.now() - toH * 36e5).toISOString() + '" }';
  };
  let pv30 = null, pvPrior = null, priorDays = null;
  try {
    const a = await roiGf(env, "query { viewer { " + acct + " { rumPageloadEventsAdaptiveGroups(limit: 10000, " + win(720, 0) + ") { count } } } }");
    const b = await roiGf(env, "query { viewer { " + acct + " { rumPageloadEventsAdaptiveGroups(limit: 10000, " + win(1440, 720) + ") { count dimensions { date } } } } }");
    const ra = a && (((a.viewer || {}).accounts || [{}])[0].rumPageloadEventsAdaptiveGroups);
    const rb = b && (((b.viewer || {}).accounts || [{}])[0].rumPageloadEventsAdaptiveGroups);
    if (Array.isArray(ra)) pv30 = ra.reduce(function(x, r) { return x + (r.count || 0); }, 0);
    if (Array.isArray(rb)) pvPrior = rb.reduce(function(x, r) { return x + (r.count || 0); }, 0);
    if (Array.isArray(rb)) priorDays = rumDaysCovered(rb);
  } catch (e) {
  }
  if (pv30 != null) await put("pageviews_30d", pv30, "MEASURED");
  else out.skipped.push("pageviews_30d: RUM unreadable");
  if (pv30 != null && pvPrior > 0 && priorDays != null && priorDays < RUM_MIN_PRIOR_DAYS) {
    // IMPRESSIONS-METRIC-PRIOR-WINDOW-1 (2026-10-01, agent_issues #1715): the prior window held about a fifth of the
    // traffic the 2026-08-27..09-25 baseline measured, so growth read +394% against +5.7% vs baseline. A window with
    // missing days is reported as such, never turned into a growth figure.
    await put("impressions_growth_30d", "n/a: prior window has " + priorDays + " of 30 days of RUM data", "RATIFIED");
  } else if (pv30 != null && pvPrior > 0) {
    const g = Math.round(1e4 * (pv30 - pvPrior) / pvPrior) / 100;
    await put("impressions_growth_30d", (g >= 0 ? "+" : "") + g.toFixed(2) + "%", "RATIFIED");
  } else out.skipped.push("impressions_growth_30d: prior window unreadable");
  try {
    const r = await roiGf(env, "query { viewer { " + acct + " { rumPageloadEventsAdaptiveGroups(limit: 10000, " + win(720, 0) + ") { count dimensions { refererHost } } } } }");
    const rows = r && (((r.viewer || {}).accounts || [{}])[0].rumPageloadEventsAdaptiveGroups);
    if (Array.isArray(rows)) {
      const own = /(^|\.)(qnfo\.org|q08\.org|q08\.workers\.dev)$/i;
      const ref = rows.reduce(function(x, r2) {
        const h = String((r2.dimensions || {}).refererHost || "").trim();
        return x + (h && !own.test(h) ? r2.count || 0 : 0);
      }, 0);
      await put("referral_30d", ref, "MEASURED");
    } else out.skipped.push("referral_30d: refererHost dimension unreadable");
  } catch (e) {
    out.skipped.push("referral_30d: " + String(e && e.message || e).slice(0, 60));
  }
  // guard_rcs: the local guards it named were retired with the local machine's recurring jobs; the
  // same guards now run as CI gates on main. rc = number of those gates whose latest main run failed.
  if (env.GITHUB_TOKEN) {
    let failing = 0, read = 0;
    const bad = [];
    for (const wf of REGISTRY_GUARD_WORKFLOWS) {
      const g = await ghCall(env, "GET", "/repos/QNFO/qnfo-workers/actions/workflows/" + wf + "/runs?branch=main&status=completed&per_page=1");
      const run = g.ok && g.json && g.json.workflow_runs && g.json.workflow_runs[0];
      if (!run) continue;
      read++;
      if (run.conclusion !== "success") {
        failing++;
        bad.push(wf.replace(".yml", ""));
      }
    }
    if (read === REGISTRY_GUARD_WORKFLOWS.length) await put("guard_rcs", failing, "MEASURED", ", source_of_truth=?5", ["GitHub Actions: latest completed main run of " + REGISTRY_GUARD_WORKFLOWS.join(", ") + " (rc = count not success" + (bad.length ? ": " + bad.join(",") : "") + "); local guards retired with the local machine's recurring jobs"]);
    else out.skipped.push("guard_rcs: read " + read + "/" + REGISTRY_GUARD_WORKFLOWS.length + " guard runs");
  }
  // fleet_context_tokens: the D1-measurable operable context (bytes/4). System prompt + tool schemas
  // are not stored in D1 and are excluded (documented in the row's formula).
  try {
    const sr = await d1all(env.AUDIT, "SELECT COALESCE(SUM(length(COALESCE(service,''))+length(COALESCE(purpose,''))+length(COALESCE(base_url,''))),0) AS b FROM service_registry");
    const ho = await d1all(env.AUDIT, "SELECT COALESCE(SUM(length(COALESCE(summary,''))+length(COALESCE(pending_work,''))+length(COALESCE(next_action,''))),0) AS b FROM (SELECT summary, pending_work, next_action FROM handoffs ORDER BY id DESC LIMIT 200)");
    const kg = env.GRAPH ? await d1all(env.GRAPH, "SELECT COALESCE(SUM(length(id)+length(label)+length(name)),0) AS b FROM nodes") : null;
    const pp = env.LIVING ? await d1all(env.LIVING, "SELECT COALESCE(SUM(length(COALESCE(slug,''))+length(COALESCE(title,''))),0) AS b FROM papers") : null;
    if (sr && ho && kg && pp) {
      const bytes = Number(sr[0].b) + Number(ho[0].b) + Number(kg[0].b) + Number(pp[0].b);
      await put("fleet_context_tokens", Math.round(bytes / 4), "MEASURED", ", formula=?5", ["D1-measurable lean operable context, bytes/4: service_registry(service,purpose,base_url) + qnfo-graph.nodes(id,label,name) + living-paper.papers(slug,title) + last 200 handoffs(summary,pending_work,next_action). Excludes system prompt + tool schemas (not in D1). Refreshed by qnfo-fleet-dashboard cron."]);
    } else out.skipped.push("fleet_context_tokens: a source DB is unbound");
  } catch (e) {
    out.skipped.push("fleet_context_tokens: " + String(e && e.message || e).slice(0, 60));
  }
  return out;
}
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
__name2(persistRoiSnapshot, "persistRoiSnapshot");
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
__name2(roiGf, "roiGf");
// REACH-SIGNALS-INGEST-1 (2026-10-01, agent_issues #1711; docs/STRATEGY.md 6.1-6.3): phase 1 of the one-schema signal
// loop, from sources that need no new credential. Once per UTC day, after 02:00Z, the cron copies the previous complete
// UTC day into qnfo-audit.reach_signals: RUM pageviews by page and by referrer (CF GraphQL), Zenodo views/downloads and
// OpenAlex citations (latest citation_stats per DOI), Bluesky engagement (social_engagements), confirmed QNFO
// subscribers and research-outreach sends/replies; entity_map gets slug/doi/page_url from living-paper. A source that
// cannot be read writes nothing and is listed as skipped in the run's cloud_ops_events row (id reach-ingest-<day>);
// no value is ever a fabricated zero. GA4, Search Console and LinkedIn need owner credentials (phase 2) and print
// "not connected" on /roi. Same DDL as migrations/2026-10-01-reach-signals.sql.
var REACH_DDL = [
  "CREATE TABLE IF NOT EXISTS reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT CHECK (quality IN ('human','bot','unknown')), collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric))",
  "CREATE TABLE IF NOT EXISTS entity_map (slug TEXT PRIMARY KEY, doi TEXT, page_url TEXT, utm_campaign TEXT, post_uri TEXT, buffer_id TEXT, updated_at TEXT)"
];
var REACH_INGEST_AFTER_UTC_HOUR = 2;
var REACH_INGEST_MAX_ATTEMPTS = 3;
var REACH_RUNNING_STALE_MS = 10 * 60 * 1e3;
var REACH_OUTREACH_LOOKBACK_DAYS = 14;
var REACH_CITATION_FRESH_DAYS = 3;
var REACH_RUM_LIMIT = 1e4;
var REACH_PAGE_ROW_CAP = 300;
var REACH_REFERRER_ROW_CAP = 100;
var REACH_PAPER_URL = "https://papers.qnfo.org/papers/";
function reachErr(e) {
  return String(e && e.message || e).slice(0, 160);
}
function reachShiftDay(day, n) {
  return new Date(Date.parse(day + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
}
function reachYesterday(nowMs) {
  return reachShiftDay(new Date(nowMs).toISOString().slice(0, 10), -1);
}
function reachRow(day, source, channel, type, id, metric, value, quality) {
  return { date: day, source, channel, entity_type: type, entity_id: String(id), metric, value: Number(value), quality };
}
// /papers/<slug> or /papers/<slug>/ on any host is the paper <slug>; every other path is the page <host><path>.
function reachClassifyPath(host, path) {
  const h = String(host || "").trim().toLowerCase() || "(unknown-host)";
  const p = String(path || "").trim() || "/";
  const m = /^\/papers\/([^\/?#]+)\/?$/.exec(p);
  if (m) return { entity_type: "paper", entity_id: m[1] };
  return { entity_type: "page", entity_id: h + p };
}
// Keeps the `cap` largest entries and folds the rest into "(other)", so a day's total stays whole while the row count
// (and the D1 writes) stay bounded.
function reachCapRows(map, cap, mk) {
  const ents = Array.from(map.entries()).sort(function(a, b) {
    return b[1] - a[1];
  });
  const rows = ents.slice(0, cap).map(function(e) {
    return mk(e[0], e[1]);
  });
  const rest = ents.slice(cap).reduce(function(s, e) {
    return s + e[1];
  }, 0);
  if (rest > 0) rows.push(mk("(other)", rest));
  return rows;
}
// One 'site' "(all)" row carries the day's measured total (0 included), so a read day with no traffic is told apart
// from a day that was never read (no row).
function reachRumPageRows(groups, day) {
  const papers = /* @__PURE__ */ new Map(), pages = /* @__PURE__ */ new Map();
  let total = 0;
  for (const g of groups || []) {
    const n = Number(g && g.count) || 0;
    if (n <= 0) continue;
    const d = g.dimensions || {};
    const c = reachClassifyPath(d.requestHost, d.requestPath);
    const m = c.entity_type === "paper" ? papers : pages;
    m.set(c.entity_id, (m.get(c.entity_id) || 0) + n);
    total += n;
  }
  const mk = function(type) {
    return function(id, v) {
      return reachRow(day, "cf-rum", "web", type, id, "pageviews", v, "unknown");
    };
  };
  const rows = [mk("site")("(all)", total)];
  for (const e of papers) rows.push(mk("paper")(e[0], e[1]));
  return rows.concat(reachCapRows(pages, REACH_PAGE_ROW_CAP, mk("page")));
}
function reachRumReferrerRows(groups, day) {
  const refs = /* @__PURE__ */ new Map();
  for (const g of groups || []) {
    const n = Number(g && g.count) || 0;
    if (n <= 0) continue;
    const h = String((g.dimensions || {}).refererHost || "").trim().toLowerCase() || "(direct)";
    refs.set(h, (refs.get(h) || 0) + n);
  }
  return reachCapRows(refs, REACH_REFERRER_ROW_CAP, function(id, v) {
    return reachRow(day, "cf-rum", "web", "referrer", id, "pageviews", v, "unknown");
  });
}
function reachRumQuery(dims, geq, leq) {
  return 'query { viewer { accounts(filter: { accountTag: "' + ACCOUNT + '" }) { rumPageloadEventsAdaptiveGroups(limit: ' + REACH_RUM_LIMIT + ', filter: { datetime_geq: "' + geq + '", datetime_leq: "' + leq + '" }) { count dimensions { ' + dims + " } } } } }";
}
// roiGf drops the GraphQL error text; the ingest needs it to log a rejected dimension name and skip that query.
async function reachGf(env, query) {
  if (!env.CF_TOKEN) return { data: null, err: "CF_TOKEN unset" };
  try {
    const resp = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.CF_TOKEN },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(2e4)
    });
    let g = null;
    try {
      g = await resp.json();
    } catch (e) {
    }
    if (!resp.ok || !g || g.errors) {
      const msg = g && Array.isArray(g.errors) ? g.errors.map(function(x) {
        return x && x.message || String(x);
      }).join("; ") : "no JSON body";
      return { data: null, err: "graphql http " + resp.status + ": " + msg.slice(0, 300) };
    }
    return g.data ? { data: g.data, err: null } : { data: null, err: "graphql: empty data" };
  } catch (e) {
    return { data: null, err: "graphql: " + reachErr(e) };
  }
}
function reachRumGroups(data) {
  const a = data && data.viewer && data.viewer.accounts;
  const g = a && a[0] && a[0].rumPageloadEventsAdaptiveGroups;
  return Array.isArray(g) ? g : null;
}
// Multi-row INSERT OR REPLACE: 12 rows x 8 bound values = 96, under D1's 100 bound parameters per statement.
async function reachWrite(env, rows) {
  const ok = (rows || []).filter(function(r) {
    return r && isFinite(r.value);
  });
  const stmts = [];
  for (let i = 0; i < ok.length; i += 12) {
    const chunk = ok.slice(i, i + 12);
    const binds = [];
    const vals = chunk.map(function(r) {
      binds.push(r.date, r.source, r.channel, r.entity_type, r.entity_id, r.metric, r.value, r.quality);
      return "(?,?,?,?,?,?,?,?)";
    });
    stmts.push(env.AUDIT.prepare("INSERT OR REPLACE INTO reach_signals (date, source, channel, entity_type, entity_id, metric, value, quality) VALUES " + vals.join(",")).bind(...binds));
  }
  for (let i = 0; i < stmts.length; i += 50) await env.AUDIT.batch(stmts.slice(i, i + 50));
  return ok.length;
}
// Latest citation_stats row per (doi, metric) collected in [fromDay, nextDay): qnfo-paper-indexer appends a row per
// DOI per run, and covers only its newest DOIs, so the freshness window keeps a stale value from being re-dated.
async function reachLatestCitations(env, source, metrics, fromDay, nextDay) {
  const ph = metrics.map(function() {
    return "?";
  }).join(",");
  return d1all(env.AUDIT, "SELECT lower(c.doi) AS doi, c.metric AS metric, MAX(c.value) AS value FROM citation_stats c JOIN (SELECT doi, metric, MAX(collected_at) AS mx FROM citation_stats WHERE source = ? AND metric IN (" + ph + ") AND doi IS NOT NULL AND collected_at >= ? AND collected_at < ? GROUP BY doi, metric) m ON c.doi = m.doi AND c.metric = m.metric AND c.collected_at = m.mx WHERE c.source = ? AND c.value IS NOT NULL GROUP BY lower(c.doi), c.metric", [source].concat(metrics, [fromDay, nextDay, source]));
}
// Zenodo downloads are bot-skewed (STRATEGY 6.1): a downloads/views ratio over 3 marks the downloads row 'bot'.
function reachZenodoRows(rows, day) {
  const by = /* @__PURE__ */ new Map();
  for (const r of rows || []) {
    if (!r || !r.doi || r.value == null || !isFinite(Number(r.value))) continue;
    const e = by.get(r.doi) || {};
    e[r.metric] = Number(r.value);
    by.set(r.doi, e);
  }
  const out = [];
  for (const [doi, e] of by) {
    const hasV = typeof e.views === "number";
    if (hasV) out.push(reachRow(day, "zenodo", "zenodo", "doi", doi, "views", e.views, "unknown"));
    if (typeof e.downloads === "number") {
      const bot = hasV && (e.views > 0 ? e.downloads / e.views > 3 : e.downloads > 0);
      out.push(reachRow(day, "zenodo", "zenodo", "doi", doi, "downloads", e.downloads, bot ? "bot" : "unknown"));
    }
  }
  return out;
}
// Every (day, status) in the window is written, 0 included: outreach_log was read, so a 0 is measured, and a row that
// later flips sent -> replied lowers that day's 'sent' instead of leaving a stale count.
function reachOutreachRows(rows, fromDay, toDay) {
  const by = {};
  for (const r of rows || []) by[r.d + "|" + r.status] = Number(r.n) || 0;
  const out = [];
  for (let d = fromDay; d <= toDay; d = reachShiftDay(d, 1)) {
    for (const s of ["sent", "followup", "replied"]) out.push(reachRow(d, "email", "email", "campaign", "research-outreach", s, by[d + "|" + s] || 0, "unknown"));
  }
  return out;
}
async function ingestReachSignals(env, opts) {
  opts = opts || {};
  const nowMs = opts.nowMs || Date.now();
  const yesterday = reachYesterday(nowMs);
  let day = yesterday;
  if (opts.day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(opts.day)) || opts.day > yesterday || opts.day < reachShiftDay(yesterday, -89)) return { error: "day must be a complete UTC day (YYYY-MM-DD) within the last 90 days" };
    day = opts.day;
  } else if (new Date(nowMs).getUTCHours() < REACH_INGEST_AFTER_UTC_HOUR) {
    return { not_yet: "runs after 02:00Z" };
  }
  const evId = "reach-ingest-" + day;
  const out = { day, version: VERSION, attempts: 1, written: {}, skipped: [], notes: [] };
  if (!opts.day) {
    try {
      const prev = await d1all(env.AUDIT, "SELECT ts, status, meta FROM cloud_ops_events WHERE id = ?", [evId]);
      if (prev.length) {
        let pm = {};
        try {
          pm = JSON.parse(prev[0].meta || "{}") || {};
        } catch (e) {
        }
        const att = Number(pm.attempts) || 1;
        if (prev[0].status === "ok") return { throttled: day };
        if (prev[0].status === "running" && nowMs - Date.parse(prev[0].ts) < REACH_RUNNING_STALE_MS) return { in_progress: day };
        if (att >= REACH_INGEST_MAX_ATTEMPTS) return { gave_up: day, attempts: att };
        out.attempts = att + 1;
      }
    } catch (e) {
    }
  }
  const record = async function(status, text) {
    try {
      await env.AUDIT.prepare("INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, 'reach-ingest', ?, ?, ?, ?)").bind(evId, new Date(opts.nowMs || Date.now()).toISOString(), text, JSON.stringify(out).slice(0, 4e3), NAME, status).run();
    } catch (e) {
    }
  };
  await record("running", "reach ingest " + day + " started");
  try {
    for (const s of REACH_DDL) await env.AUDIT.prepare(s).run();
  } catch (e) {
    out.skipped.push("ddl: " + reachErr(e));
    await record("error", "reach ingest " + day + ": tables unavailable");
    return out;
  }
  const put = async function(key, rows) {
    try {
      out.written[key] = await reachWrite(env, rows);
    } catch (e) {
      out.skipped.push(key + ": write " + reachErr(e));
    }
  };
  const geq = day + "T00:00:00Z", leq = day + "T23:59:59Z", next = reachShiftDay(day, 1);
  // a. RUM pageviews by page, then by referrer. A rejected dimension is logged and that query skipped (no retry loop
  // over guessed names).
  const rumQ = [["cf-rum:pages", "requestHost requestPath", reachRumPageRows], ["cf-rum:referrers", "refererHost", reachRumReferrerRows]];
  for (const q of rumQ) {
    const r = await reachGf(env, reachRumQuery(q[1], geq, leq));
    const groups = r.err ? null : reachRumGroups(r.data);
    if (!groups) {
      const why = r.err || "rumPageloadEventsAdaptiveGroups missing from response";
      console.log("REACH-SIGNALS-INGEST-1 " + q[0] + " { " + q[1] + " } skipped: " + why);
      out.skipped.push(q[0] + ": " + why);
      continue;
    }
    if (groups.length >= REACH_RUM_LIMIT) out.notes.push(q[0] + ": hit limit " + REACH_RUM_LIMIT + ", totals are a lower bound");
    await put(q[0], q[2](groups, day));
  }
  // b, c. Zenodo views/downloads and OpenAlex citations: latest citation_stats per DOI within the freshness window.
  const citFrom = reachShiftDay(day, -(REACH_CITATION_FRESH_DAYS - 1));
  try {
    const z = await reachLatestCitations(env, "zenodo", ["views", "downloads"], citFrom, next);
    if (z.length) await put("zenodo", reachZenodoRows(z, day));
    else out.skipped.push("zenodo: no citation_stats views/downloads collected " + citFrom + ".." + day);
  } catch (e) {
    out.skipped.push("zenodo: " + reachErr(e));
  }
  try {
    const oa = await reachLatestCitations(env, "openalex", ["cited_by_count"], citFrom, next);
    if (oa.length) {
      await put("openalex", oa.map(function(r) {
        return reachRow(day, "openalex", "openalex", "doi", r.doi, "citations", r.value, "human");
      }));
    } else out.skipped.push("openalex: no citation_stats cited_by_count collected " + citFrom + ".." + day);
  } catch (e) {
    out.skipped.push("openalex: " + reachErr(e));
  }
  // d. Bluesky: the per-post snapshot qnfo-cloud-ops collected that day (cumulative counts, not daily deltas).
  try {
    const b = await d1all(env.AUDIT, "SELECT post_id, metric, MAX(value) AS value FROM social_engagements WHERE platform = 'bluesky' AND substr(collected_at, 1, 10) = ? AND post_id IS NOT NULL AND value IS NOT NULL AND metric != 'auth_status' GROUP BY post_id, metric", [day]);
    if (b.length) {
      await put("bluesky", b.map(function(r) {
        return reachRow(day, "bluesky", "bluesky", "post", r.post_id, r.metric, r.value, "human");
      }));
    } else out.skipped.push("bluesky: no social_engagements rows collected on " + day);
  } catch (e) {
    out.skipped.push("bluesky: " + reachErr(e));
  }
  // e. Confirmed subscribers: a count as of now, so it is written only for the live previous-day run (a backfill of an
  // older day cannot reconstruct it).
  if (day === yesterday) {
    try {
      const s = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM subscribers WHERE status = 'subscribed'");
      if (s.length && s[0].n != null) await put("qnfo-subscribers", [reachRow(day, "qnfo-subscribers", "email", "list", "qnfo", "confirmed_subscribers", s[0].n, "human")]);
      else out.skipped.push("qnfo-subscribers: no count");
    } catch (e) {
      out.skipped.push("qnfo-subscribers: " + reachErr(e));
    }
  } else out.notes.push("qnfo-subscribers: not backfilled (point-in-time count)");
  // f. Research outreach by status. Replies land days after the send and flip the row's status in place, so the
  // trailing window is rewritten each run.
  try {
    const oFrom = reachShiftDay(day, -(REACH_OUTREACH_LOOKBACK_DAYS - 1));
    const o = await d1all(env.AUDIT, "SELECT substr(sent_at, 1, 10) AS d, status, COUNT(*) AS n FROM outreach_log WHERE sent_at >= ? AND sent_at < ? AND status IN ('sent','followup','replied') GROUP BY d, status", [oFrom, next]);
    await put("email", reachOutreachRows(o, oFrom, day));
  } catch (e) {
    out.skipped.push("email: " + reachErr(e));
  }
  // entity_map from living-paper (binding LIVING). The DOI is zenodo_doi || doi, the key qnfo-paper-indexer writes
  // to citation_stats, lowercased like the reach_signals 'doi' rows. utm_campaign/post_uri/buffer_id are left to
  // POST-ID-UTM-1.
  if (env.LIVING) {
    try {
      const ps = await d1all(env.LIVING, "SELECT slug, doi, zenodo_doi FROM papers WHERE status = 'published' AND slug IS NOT NULL AND slug != ''");
      const at = new Date().toISOString();
      const stmts = [];
      for (let i = 0; i < ps.length; i += 24) {
        const binds = [];
        const vals = ps.slice(i, i + 24).map(function(p) {
          const doi = p.zenodo_doi || p.doi;
          binds.push(p.slug, doi ? String(doi).toLowerCase() : null, REACH_PAPER_URL + encodeURIComponent(p.slug), at);
          return "(?,?,?,?)";
        });
        stmts.push(env.AUDIT.prepare("INSERT INTO entity_map (slug, doi, page_url, updated_at) VALUES " + vals.join(",") + " ON CONFLICT(slug) DO UPDATE SET doi = excluded.doi, page_url = excluded.page_url, updated_at = excluded.updated_at WHERE entity_map.doi IS NOT excluded.doi OR entity_map.page_url IS NOT excluded.page_url").bind(...binds));
      }
      for (let i = 0; i < stmts.length; i += 50) await env.AUDIT.batch(stmts.slice(i, i + 50));
      out.written.entity_map = ps.length;
    } catch (e) {
      out.skipped.push("entity_map: " + reachErr(e));
    }
  } else out.notes.push("entity_map: LIVING binding absent, skipped");
  const summary = Object.keys(out.written).map(function(k) {
    return k + "=" + out.written[k];
  }).join(", ");
  await record(out.skipped.length ? "partial" : "ok", "reach ingest " + day + ": " + (summary || "nothing written") + (out.skipped.length ? "; skipped " + out.skipped.length : ""));
  return out;
}
// Scorecard (STRATEGY 6.3) over reach_signals. Flows (pageviews, outreach) are summed over the window; stocks
// (Bluesky counts per post, citations and Zenodo counts per DOI, subscribers) take each entity's latest row in it.
async function reachLatestAgg(env, source, from, to) {
  return d1all(env.AUDIT, "SELECT r.metric AS metric, r.quality AS quality, COUNT(*) AS n, SUM(r.value) AS v FROM reach_signals r JOIN (SELECT channel, entity_type, entity_id, metric, MAX(date) AS md FROM reach_signals WHERE source = ? AND date >= ? AND date <= ? GROUP BY channel, entity_type, entity_id, metric) m ON r.channel = m.channel AND r.entity_type = m.entity_type AND r.entity_id = m.entity_id AND r.metric = m.metric AND r.date = m.md WHERE r.source = ? GROUP BY r.metric, r.quality", [source, from, to, source]);
}
async function reachWindow(env, from, to) {
  const w = { from, to };
  const q = async function(fn) {
    try {
      return await fn();
    } catch (e) {
      w.errors = (w.errors || []).concat(reachErr(e));
      return null;
    }
  };
  const pv = await q(function() {
    return d1all(env.AUDIT, "SELECT COUNT(DISTINCT date) AS days, SUM(value) AS v FROM reach_signals WHERE source = 'cf-rum' AND entity_type = 'site' AND metric = 'pageviews' AND date >= ? AND date <= ?", [from, to]);
  });
  w.pageviews = pv && pv[0] && pv[0].days ? { value: pv[0].v, days: pv[0].days } : null;
  w.top_pages = await q(function() {
    return d1all(env.AUDIT, "SELECT entity_type AS t, entity_id AS id, SUM(value) AS v FROM reach_signals WHERE source = 'cf-rum' AND entity_type IN ('paper','page') AND metric = 'pageviews' AND entity_id != '(other)' AND date >= ? AND date <= ? GROUP BY entity_type, entity_id ORDER BY v DESC LIMIT 5", [from, to]);
  });
  w.top_referrers = await q(function() {
    // Own hosts (internal navigation) are left out, the same set refreshRegistryMetrics excludes from referral_30d.
    return d1all(env.AUDIT, "SELECT entity_id AS id, SUM(value) AS v FROM reach_signals WHERE source = 'cf-rum' AND entity_type = 'referrer' AND metric = 'pageviews' AND entity_id != '(other)' AND entity_id NOT IN ('qnfo.org','q08.org','q08.workers.dev') AND entity_id NOT LIKE '%.qnfo.org' AND entity_id NOT LIKE '%.q08.org' AND entity_id NOT LIKE '%.q08.workers.dev' AND date >= ? AND date <= ? GROUP BY entity_id ORDER BY v DESC LIMIT 5", [from, to]);
  });
  w.bluesky = await q(function() {
    return reachLatestAgg(env, "bluesky", from, to);
  });
  w.openalex = await q(function() {
    return reachLatestAgg(env, "openalex", from, to);
  });
  w.zenodo = await q(function() {
    return reachLatestAgg(env, "zenodo", from, to);
  });
  w.subscribers = await q(function() {
    return d1all(env.AUDIT, "SELECT date, value FROM reach_signals WHERE source = 'qnfo-subscribers' AND entity_type = 'list' AND entity_id = 'qnfo' AND metric = 'confirmed_subscribers' AND date >= ? AND date <= ? ORDER BY date ASC", [from, to]);
  });
  w.outreach = await q(function() {
    return d1all(env.AUDIT, "SELECT metric, SUM(value) AS v, COUNT(DISTINCT date) AS days FROM reach_signals WHERE source = 'email' AND entity_type = 'campaign' AND date >= ? AND date <= ? GROUP BY metric", [from, to]);
  });
  return w;
}
async function reachScorecardData(env, nowMs) {
  const end = reachYesterday(nowMs || Date.now());
  const sc = { end, last_ingest: null, windows: {} };
  try {
    const ev = await d1all(env.AUDIT, "SELECT id, ts, status, text, meta FROM cloud_ops_events WHERE id IN (?, ?, ?) ORDER BY id DESC LIMIT 1", ["reach-ingest-" + end, "reach-ingest-" + reachShiftDay(end, -1), "reach-ingest-" + reachShiftDay(end, -2)]);
    if (ev.length) {
      let m = {};
      try {
        m = JSON.parse(ev[0].meta || "{}") || {};
      } catch (e) {
      }
      sc.last_ingest = { day: m.day || String(ev[0].id).replace("reach-ingest-", ""), ts: ev[0].ts, status: ev[0].status, attempts: m.attempts || null, skipped: m.skipped || [], notes: m.notes || [] };
    }
  } catch (e) {
  }
  sc.windows.d7 = await reachWindow(env, reachShiftDay(end, -6), end);
  sc.windows.d28 = await reachWindow(env, reachShiftDay(end, -27), end);
  return sc;
}
// HUMAN-DASHBOARD-1 (2026-10-01): fleet.qnfo.org is ONE page for the human owner. It answers a single
// question -- "what do I have to do?" -- and nothing else. The old root (9-panel failure inventory), /ops
// (scheduler view) and /roi (cost view) were consolidated here; they redirect to "/". Everything the system
// can resolve itself (red flags, drift, queues, probes, retries) is the system's job (qnfo-fleet-control /
// the issue loop) and is only summarised in one collapsed line. Machine endpoints (/api/state, /api/actions,
// /api/loop, ...) are unchanged because qnfo-fleet-control and qnfo-autopilot consume them.
//
// What counts as "needs the human" (docs/AUTONOMY-DECISION-POLICY.md, tier T2 + "Never"):
//   - human_actions       the canonical queue; any worker/session files a row (POST /api/human, x-loop-token)
//   - v_waiting_on_human  governance register rows owned by user/mixed
//   - gtd_register        open lines owned by user/mixed
//   - fleet_issue_dispatch exec_state=needs-human (the issue loop found no safe autonomous action)
//   - code_tasks          status=needs_human (code loop could not verify a change / has no PR credential)
//   - v_email_human_pending_v2 inbound mail from real people (not bounces, bots, our own domains)
//   - shutdown_manifest   owner-confirm gates once phase 1 has fired, and gates due within 45 days
// REAL-TIME: the queue is read live from D1 on every request and the page re-fetches itself every 10s; money/return
// inputs are re-measured on demand (>5 min old) and by the */15 cron + the 10-min fleet-exec heartbeat.
// FAIL-CLOSED: a source that cannot be read is listed under `blind` and the verdict becomes UNCONFIRMED;
// the page never claims "nothing needs you" while it could not look.
// PRIVACY: this page is public and unauthenticated, so third-party mail is shown as domain + count + age
// only (never an address or subject).
var SPEND_CAP_USD = 150;
var HUMAN_SNAPSHOT_MAX_AGE_MS = 5 * 6e4;
async function ensureHumanTable(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT DEFAULT 'normal', due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, resolution TEXT)").run();
}
// NO-CLAUDE-RUNTIME-DEPENDENCY-1: the owner's data and workflow live on Cloudflare. A dashboard item never links to
// claude.ai or anthropic.com, and only https links are rendered.
function safeLink(u) {
  const m = /^https:\/\/([^\/?#:]+)/i.exec(String(u || ""));
  if (!m) return "";
  return /(^|\.)(claude\.ai|anthropic\.com)$/i.test(m[1]) ? "" : String(u);
}
function mailDomain(addr) {
  const m = String(addr || "").toLowerCase().match(/@([a-z0-9.-]+)\s*>?\s*$/);
  return m ? m[1] : "unknown sender";
}
function ageDaysOf(raw) {
  if (raw == null || raw === "") return null;
  const t = typeof raw === "number" ? raw : Date.parse(String(raw).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(raw)) ? "" : "Z"));
  if (isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / DAY_MS);
}
function agoText(days) {
  if (days == null) return "";
  if (days < 1 / 24) return "just now";
  if (days < 1) return Math.round(days * 24) + "h ago";
  return Math.round(days) + "d ago";
}
async function collectHumanActions(env) {
  const items = [];
  const blind = [];
  const add = function(it) {
    it.sev = it.sev || "normal";
    it.url = safeLink(it.url);
    items.push(it);
  };
  const read = async function(name, fn) {
    try {
      await fn();
    } catch (e) {
      blind.push(name + ": " + squash(String(e && e.message || e)).slice(0, 80));
    }
  };
  await read("human_actions", async function() {
    await ensureHumanTable(env);
    const rows = await d1all(env.AUDIT, "SELECT slug, title, why, default_in_effect, action, url, sev, due, created_at FROM human_actions WHERE status='open' ORDER BY id");
    for (const r of rows) add({ key: "ha:" + r.slug, source: "queue", title: r.title, why: r.why || "", fallback: r.default_in_effect || "", action: r.action || "", url: safeLink(r.url), sev: r.sev === "urgent" ? "urgent" : "normal", due: r.due || "", age: ageDaysOf(r.created_at) });
  });
  await read("register", async function() {
    const rows = await d1all(env.AUDIT, "SELECT id, title, dod, due, updated_at FROM v_waiting_on_human ORDER BY due = '', due, id");
    for (const r of rows) add({ key: "reg:" + r.id, source: "register", title: r.title, why: "Owned by you in the governance register.", fallback: "", action: r.dod || "", url: "", due: r.due || "", age: ageDaysOf(r.updated_at) });
  });
  await read("gtd", async function() {
    const rows = await d1all(env.AUDIT, "SELECT id, line, dod, section, updated_at FROM gtd_register WHERE done=0 AND owner IN ('user','mixed') ORDER BY id");
    for (const r of rows) add({ key: "gtd:" + r.id, source: "gtd", title: String(r.line || "").slice(0, 160), why: r.section ? "GTD: " + r.section : "Your open GTD line.", fallback: "", action: r.dod || "", url: "", due: "", age: ageDaysOf(r.updated_at) });
  });
  await read("issue-loop", async function() {
    const rows = await d1all(env.AUDIT, "SELECT fingerprint, category, owner, action, payload, gh_number, exec_result, created_at FROM fleet_issue_dispatch WHERE state='queued' AND exec_state='needs-human' ORDER BY created_at");
    for (const r of rows) {
      let p = {};
      try {
        p = JSON.parse(r.payload || "{}");
      } catch (e) {
      }
      add({ key: "disp:" + r.fingerprint, source: "issue-loop", title: String(p.title || r.category || "Fleet issue needs a decision").slice(0, 160), why: "The issue loop found no safe autonomous fix. " + squash(String(r.exec_result || "")).slice(0, 160), fallback: "The system keeps the current safe configuration serving.", action: String(r.action || ""), url: r.gh_number ? "https://github.com/" + GH_REPO + "/issues/" + r.gh_number : "", due: "", age: ageDaysOf(r.created_at) });
    }
  });
  await read("code-tasks", async function() {
    const rows = await d1all(env.AUDIT, "SELECT id, goal, repo, last_error, pr_url, updated_at FROM code_tasks WHERE status='needs_human' ORDER BY updated_at");
    for (const r of rows) add({ key: "code:" + r.id, source: "code-loop", title: "Code task parked: " + String(r.goal || r.id).slice(0, 140), why: "The code loop could not verify this change itself. " + squash(String(r.last_error || "")).slice(0, 140), fallback: "Nothing is merged or deployed until it is verified.", action: "Review or drop it.", url: r.pr_url || "", due: "", age: ageDaysOf(r.updated_at) });
  });
  await read("inbox", async function() {
    const rows = await d1all(env.AUDIT, "SELECT sender, subject, received_at FROM v_email_human_pending_v2");
    const byDom = {};
    for (const r of rows) {
      const d = mailDomain(r.sender);
      const g = byDom[d] || (byDom[d] = { n: 0, oldest: null });
      g.n++;
      const a = ageDaysOf(r.received_at);
      if (a != null && (g.oldest == null || a > g.oldest)) g.oldest = a;
    }
    for (const d of Object.keys(byDom)) add({ key: "mail:" + d, source: "inbox", title: "Reply to " + byDom[d].n + " message" + (byDom[d].n > 1 ? "s" : "") + " from " + d, why: "A real person wrote to qnfo@qnfo.org; the system does not send mail as you.", fallback: "No reply goes out until you send one.", action: "Open the qnfo inbox and reply.", url: "", due: "", age: byDom[d].oldest });
  });
  // Objective revisions are immutable by the fleet: only the owner ratifies or rejects them (QUNIVERSE-CHARTER s7).
  // Derived live from goals, so it clears itself the moment the last proposal is decided.
  await read("objective-revisions", async function() {
    const rows = await d1all(env.AUDIT, "SELECT id, statement, alignment, created_at FROM goals WHERE goal_type='objective-revision' AND status='proposed' ORDER BY id");
    const n = rows.length;
    if (n > 0) {
      let oldest = null;
      for (const r of rows) {
        const a = ageDaysOf(r.created_at);
        if (a != null && (oldest == null || a > oldest)) oldest = a;
      }
      add({ key: "goals:objective-revision", source: "objectives", title: "Ratify or reject " + n + " proposed objective revision" + (n > 1 ? "s" : ""), why: "The fleet cannot change its own objectives; only you can ratify them.", fallback: "The current objectives stay in force.", action: "Decide each one on this card. A ratified weight change whose weights still sum to 1 is applied to the objective function by qnfo-fleet-control within the hour (objectives.version bumps, the old formula stays on record); one that does not comes back here with the reason; anything that is not a weight change is marked ratified-manual for a hand-written statement.", url: "", due: "", age: oldest, detail: rows.map(function(r) {
        return { id: r.id, statement: String(r.statement || "").slice(0, 220), why: String(r.alignment || "").slice(0, 200) };
      }) });
    }
  });
  await read("shutdown-manifest", async function() {
    const rows = await d1all(env.AUDIT, "SELECT id, phase, component, condition, due_date, state FROM shutdown_manifest ORDER BY id");
    const phase1Live = rows.some(function(r) {
      return Number(r.phase) === 1 && /ARMED|DISARMED/i.test(String(r.state || ""));
    });
    for (const r of rows) {
      const stv = String(r.state || "").toUpperCase();
      if (stv === "OWNER-CONFIRM-REQUIRED" && !phase1Live) add({ key: "sm:" + r.id, source: "shutdown", sev: "urgent", title: "Confirm: " + r.component, why: String(r.condition || "").slice(0, 200), fallback: "Nothing is deleted without your email confirmation.", action: "Reply by email to confirm or refuse.", url: "", due: "", age: null });
      const due = Date.parse(String(r.due_date || ""));
      if (stv === "ARMED" && !isNaN(due) && due - Date.now() <= 45 * DAY_MS) add({ key: "smd:" + r.id, source: "shutdown", title: "Decision due " + String(r.due_date).slice(0, 10) + ": " + r.component, why: String(r.condition || "").slice(0, 200), fallback: "The mechanical gate decides if you do nothing.", action: "Review the gate before the date.", url: "", due: String(r.due_date).slice(0, 10), age: null });
    }
  });
  items.sort(function(a, b) {
    return (a.sev === "urgent" ? 0 : 1) - (b.sev === "urgent" ? 0 : 1) || String(a.due || "9999").localeCompare(String(b.due || "9999")) || (b.age || 0) - (a.age || 0);
  });
  return { items, blind };
}
// INVEST-DECISION-1 (2026-10-01): the page also answers "do I keep putting my time and money into this
// fleet, scale it back, or stop?" It applies the owner-ratified rule from impact_thresholds
// review_gate_2026_12_31 (continue iff credibility_events>=2 OR confirmed_subscribers>=50 OR funding_secured,
// AND ai_spend_30d within cap) to measured inputs, shows the trajectory toward it, and publishes the result to
// the feeds ops / fleet-exec / fleet-control already read (metric_registry, analytics_metric_triggers,
// agent_issues, fleet_tasks, invest_decision_log).
//
// Rules of the road:
//  - ADVISORY. Nothing here retires a worker, deletes data or raises a cap (AUTONOMY-DECISION-POLICY.md "Never").
//    shutdown_manifest and its owner-confirm gate remain the only retirement path.
//  - COST BASIS. #1699: the all-provider gateway-metered figure is an ESTIMATED LIST cost, not what the cap meters
//    (the cap meters unified billing only). The verdict uses qnfo-fleet-control's fleet_budget ai_spend:total, the
//    30-day unified-billing spend (BYOK-BILLING-SPLIT-1), which is the cap-comparable measure #1699 prescribes. It must
//    be fresh (<6h). The billing API's "current period to date" is NOT a 30-day figure (it reads ~$0 on the 1st of a
//    month) and is shown as context only. If the unified figure is unreadable the verdict can never be SCALE_BACK or
//    KILL off the all-provider estimate alone.
//  - EVIDENCE. credibility_events and funding_secured are not machine-measurable; they are attested through
//    POST /api/decision/fact with evidence, and shown as "unattested" until then. At the gate date with nothing
//    ever attested the verdict is UNKNOWN (a human decision), never KILL by omission.
var SPEND_BASIS = "fleet_budget ai_spend:total: 30-day unified-billing list cost (what the cap meters), written by qnfo-fleet-control";
var SPEND_FRESH_MS = 6 * 36e5;
var UPCOMING_DAYS = 14;
var INVEST_FACT_KEYS = { credibility_events: "number", funding_secured: "boolean", revenue_30d_usd: "number" };
var INVEST_LEVEL = { CONTINUE: 0, AT_RISK: 1, SCALE_BACK: 2, KILL: 3, UNKNOWN: -1 };
var INVEST_SUBS_TARGET = 50;
var INVEST_CRED_TARGET = 2;
var SCALE_BACK_LEAD_DAYS = 45;
async function ensureInvestTables(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS invest_facts (key TEXT PRIMARY KEY, value TEXT, evidence TEXT, updated_at TEXT DEFAULT (datetime('now')))").run();
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS invest_decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (datetime('now')), verdict TEXT, risk TEXT, basis TEXT, cash30 REAL, spend30 REAL, metered30 REAL, subs INTEGER, gate_return_met INTEGER, days_to_gate INTEGER, reasons_json TEXT)").run();
  try {
    await env.AUDIT.prepare("ALTER TABLE invest_decision_log ADD COLUMN spend30 REAL").run();
  } catch (e) {
  }
}
async function readInvestFacts(env) {
  const out = {};
  try {
    await ensureInvestTables(env);
    const rows = await d1all(env.AUDIT, "SELECT key, value, evidence, updated_at FROM invest_facts");
    for (const r of rows) out[r.key] = { value: INVEST_FACT_KEYS[r.key] === "boolean" ? r.value === "true" || r.value === "1" : Number(r.value), evidence: r.evidence, at: r.updated_at };
  } catch (e) {
  }
  return out;
}
// Pure function: inputs in, verdict out. Same inputs always give the same answer.
function decideInvestment(f) {
  const reasons = [];
  const flips = [];
  const spendKnown = f.spend30 != null;
  const costOk = spendKnown ? f.spend30 <= f.cap : null;
  const returnMet = f.credibility >= INVEST_CRED_TARGET || f.subs >= INVEST_SUBS_TARGET || f.funding === true;
  const out = { verdict: "UNKNOWN", risk: null, basis: spendKnown ? "unified-30d" : f.metered30 != null ? "metered-estimate" : "none", headline: "", reasons, flips, levers: [], gate: { return_met: returnMet, cost_ok: costOk, due: f.gate_date, days: f.days } };
  if (spendKnown) reasons.push("AI spend over the last 30 days, unified billing (what the cap meters): $" + f.spend30.toFixed(0) + " vs your $" + f.cap + " cap (" + (costOk ? "within" : "OVER") + ").");
  else if (f.metered30 != null) reasons.push("The cap-comparable 30-day spend is unreadable. The all-provider list-cost estimate is $" + f.metered30.toFixed(0) + "/30d, which is not what the cap meters and cannot trigger a scale-back (#1699).");
  else reasons.push("No spend reading at all.");
  reasons.push("Return so far: " + f.subs + "/" + INVEST_SUBS_TARGET + " confirmed subscribers, " + (f.credibility == null ? "credibility events unattested" : f.credibility + "/" + INVEST_CRED_TARGET + " credibility events") + ", funding " + (f.funding === true ? "secured" : "none attested") + ", revenue $" + (f.revenue30 != null ? f.revenue30.toFixed(0) : "0 (none recorded)") + ".");
  if (/FIRED|EXECUTED/i.test(f.early || "")) {
    out.verdict = "KILL";
    out.risk = "early_trigger";
    out.headline = "The armed early-trigger (spend over the cap with no publications) has fired.";
    reasons.push("shutdown_manifest EARLY-TRIGGER state is " + f.early + ".");
    return out;
  }
  if (!spendKnown && f.metered30 == null) {
    out.headline = "Cannot judge: no spend measurement is readable.";
    return out;
  }
  if (f.days <= 0) {
    if (!f.attested) {
      out.headline = "The review gate is due and no return evidence has been attested. This needs your call, not a default.";
      out.risk = "gate_due";
      flips.push("Attest credibility_events / funding_secured with evidence (POST /api/decision/fact), or decide.");
    } else if (costOk === null) {
      out.headline = "The review gate is due but the 30-day spend is unreadable, so the cost half of the rule cannot be evaluated.";
    } else if (returnMet && costOk) {
      out.verdict = "CONTINUE";
      out.risk = "on_track";
      out.headline = "The review gate passes: return evidence met and spend within the cap.";
    } else if (returnMet && !costOk) {
      out.verdict = "SCALE_BACK";
      out.risk = "cost";
      out.headline = "Return evidence met but spend is over the cap. Scale spend down to the cap.";
    } else {
      out.verdict = "KILL";
      out.risk = "gate_failed";
      out.headline = "The review gate failed: none of the return conditions is met. Per docs/STRATEGY.md s9 the fleet then shrinks to the selected-works core and the personal layer; no research data is deleted without your email confirmation.";
      flips.push("Attest a qualifying credibility event or funding with evidence before the retirement gate runs.");
    }
    return out;
  }
  if (costOk === false) {
    out.verdict = "SCALE_BACK";
    out.risk = "cost";
    out.headline = "Spend is over the cap you set ($" + f.spend30.toFixed(0) + " vs $" + f.cap + "). Scale spend back before judging return.";
    flips.push("30-day unified-billing spend back to $" + f.cap + " or less (STRATEGY s8 targets $60).");
    return out;
  }
  const proj = f.subs + (f.subsNew30 || 0) * (f.days / 30);
  const atRisk = !returnMet && proj < INVEST_SUBS_TARGET && !(f.credibility >= 1);
  reasons.push("At the current pace (" + (f.subsNew30 || 0) + " new/30d) that is about " + Math.round(proj) + " confirmed subscribers by " + f.gate_date + " (" + f.days + " days).");
  if (returnMet) {
    out.verdict = "CONTINUE";
    out.risk = "on_track";
    out.headline = "Return condition already met and spend within the cap. Keep going.";
  } else if (atRisk && f.days <= SCALE_BACK_LEAD_DAYS) {
    out.verdict = "SCALE_BACK";
    out.risk = "at_risk";
    out.headline = f.days + " days to the review gate and nothing is on pace to meet it. Start scaling back now to keep the option to stop cheaply.";
  } else if (atRisk) {
    out.verdict = "CONTINUE";
    out.risk = "at_risk";
    out.headline = "Continue, but AT RISK: on the current pace the review gate fails. The window to change that closes in " + Math.max(0, f.days - SCALE_BACK_LEAD_DAYS) + " days, when this flips to scale back.";
  } else {
    out.verdict = "CONTINUE";
    out.risk = "on_track";
    out.headline = "Continue: a return condition is within reach of the gate.";
  }
  if (!returnMet) {
    flips.push((INVEST_SUBS_TARGET - f.subs) + " more confirmed subscribers (or 1 attested credibility event, or funding) turns AT RISK into on track.");
    if (costOk === null) flips.push("The 30-day spend is unreadable; restoring fleet_budget ai_spend:total lets this judge cost too.");
  }
  if (spendKnown) flips.push("30-day spend above $" + f.cap + " flips this to scale back immediately.");
  return out;
}
var govInflight = null;
async function governanceSnapshot(env, st) {
  if (govInflight) return govInflight;
  govInflight = governanceSnapshotRun(env, st).finally(function() {
    govInflight = null;
  });
  return govInflight;
}
// Cross-isolate throttle for on-demand refreshes (page polls must not stampede the CF APIs).
async function govClaim(env, minGapMs) {
  try {
    const now = Date.now();
    const r = await env.AUDIT.prepare("INSERT INTO fleet_loop_meta (k,v) VALUES ('human_gov_claim', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v WHERE CAST(fleet_loop_meta.v AS INTEGER) < ?").bind(String(now), now - minGapMs).run();
    return !!(r && r.meta && Number(r.meta.changes) === 1);
  } catch (e) {
    return false;
  }
}
async function governanceSnapshotRun(env, st) {
  const now = Date.now();
  const iso = function(h) {
    return new Date(now - h * 36e5).toISOString();
  };
  const acct = function(d, key) {
    return d ? (((d.viewer || {}).accounts || [{}])[0] || {})[key] || [] : null;
  };
  const rumCount = async function(fromH, toH) {
    const d = await roiGf(env, 'query { viewer { accounts(filter: { accountTag: "' + ACCOUNT + '" }) { rumPageloadEventsAdaptiveGroups(limit: 10000, filter: { datetime_geq: "' + iso(fromH) + '", datetime_leq: "' + iso(toH) + '" }) { count dimensions { date } } } } }');
    const rows = acct(d, "rumPageloadEventsAdaptiveGroups");
    return rows ? { count: rows.reduce(function(s, x) {
      return s + x.count;
    }, 0), days: rumDaysCovered(rows) } : null;
  };
  const one = async function(sql, db) {
    try {
      const r = await d1all(db || env.AUDIT, sql);
      return r && r.length ? r[0] : null;
    } catch (e) {
      return null;
    }
  };
  const num = function(r, k) {
    return r && r[k] != null && r[k] !== "" && isFinite(Number(r[k])) ? Number(r[k]) : null;
  };
  const billing = async function(path) {
    try {
      const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/ai-gateway/" + path, { headers: { Authorization: "Bearer " + (env.CF_TOKEN || "") }, signal: AbortSignal.timeout(8e3) });
      const j = await r.json();
      return j && j.success !== false ? j.result || null : null;
    } catch (e) {
      return null;
    }
  };
  let rumTotal = null, rumPrior = null, priorDays = null, trueMoM = null, metered30 = null, aiN = null, gwLimit = null, topModels = [];
  try {
    const cur = await rumCount(720, 0);
    const prior = await rumCount(1440, 720);
    rumTotal = cur ? cur.count : null;
    rumPrior = prior ? prior.count : null;
    priorDays = prior ? prior.days : null;
    // IMPRESSIONS-METRIC-PRIOR-WINDOW-1: no growth figure from a prior window with missing days (it read a false +394%).
    trueMoM = rumTotal != null && rumPrior > 0 && priorDays != null && priorDays >= RUM_MIN_PRIOR_DAYS ? Math.round(1e4 * (rumTotal - rumPrior) / rumPrior) / 100 : null;
  } catch (e) {
  }
  try {
    const g = await roiGf(env, 'query { viewer { accounts(filter: { accountTag: "' + ACCOUNT + '" }) { aiInferenceAdaptiveGroups(limit: 1000, filter: { datetime_geq: "' + iso(720) + '", datetime_leq: "' + iso(0) + '" }) { sum { totalNeurons } } } } }');
    const rows = acct(g, "aiInferenceAdaptiveGroups");
    aiN = rows ? rows.reduce(function(a, x) {
      return a + (x.sum && x.sum.totalNeurons || 0);
    }, 0) : null;
    if (!(aiN > 0)) aiN = null;
  } catch (e) {
  }
  // Metered = ESTIMATED LIST cost over every gateway request (incl. BYOK). Context only; never the cash basis.
  try {
    const gg = await roiGf(env, 'query { viewer { accounts(filter: { accountTag: "' + ACCOUNT + '" }) { aiGatewayRequestsAdaptiveGroups(limit: 1000, filter: { datetime_geq: "' + iso(720) + '", datetime_leq: "' + iso(0) + '" }) { sum { cost } dimensions { model } } } } }');
    const rows = acct(gg, "aiGatewayRequestsAdaptiveGroups");
    if (rows && rows.length) {
      const by = {};
      metered30 = 0;
      for (const x of rows) {
        const c = x.sum && Number(x.sum.cost) || 0;
        metered30 += c;
        const m = x.dimensions && x.dimensions.model || "unknown";
        by[m] = (by[m] || 0) + c;
      }
      topModels = Object.keys(by).map(function(m) {
        return { model: m, usd: Math.round(by[m] * 100) / 100 };
      }).sort(function(a, b) {
        return b.usd - a.usd;
      }).slice(0, 3);
    }
  } catch (e) {
  }
  const inv = await billing("billing/invoice-preview");
  const bal = await billing("billing/credit-balance");
  const gw = await billing("gateways/default");
  try {
    const rules = gw && gw.spend_limits && gw.spend_limits.rules ? gw.spend_limits.rules : [];
    if (rules.length && rules[0].limit != null) gwLimit = Number(rules[0].limit);
  } catch (e) {
  }
  // Billing amounts are USD CENTS (AI-GW-COST-UNIT-CENTS-1); gross, never the credit-netted amount_due.
  const periodGross = inv && Array.isArray(inv.invoice_lines) ? inv.invoice_lines.reduce(function(a, L) {
    return a + (Number(L.amount) > 0 ? Number(L.amount) : 0);
  }, 0) / 100 : null;
  // Cap-comparable 30-day spend: fleet_budget ai_spend:total (unified billing). Stale or missing => null (unverified).
  let spend30 = null, spendAt = null;
  try {
    const fb = await one("SELECT current AS v, updated_at AS at FROM fleet_budget WHERE node_class='ai_spend:total'");
    const t = fb ? Date.parse(String(fb.at || "")) : NaN;
    if (fb && isFinite(Number(fb.v)) && !isNaN(t) && Date.now() - t <= SPEND_FRESH_MS) {
      spend30 = Number(fb.v);
      spendAt = new Date(t).toISOString();
    }
  } catch (e) {
  }
  const rep30 = num(await one("SELECT COUNT(*) AS n FROM papers WHERE status='published' AND length(body_md) >= 5000 AND created_at >= date('now','-30 day')", env.LIVING), "n");
  const new30 = num(await one("SELECT COUNT(*) AS n FROM subscribers WHERE status='subscribed' AND created_at >= datetime('now','-30 day')"), "n");
  const subsTotal = num(await one("SELECT COALESCE(SUM(CASE WHEN status='subscribed' THEN 1 ELSE 0 END),0) AS n FROM subscribers"), "n");
  const subsConfirmed = num(await one("SELECT COUNT(*) AS n FROM subscribers WHERE status='subscribed' AND confirmed_at IS NOT NULL"), "n");
  const pubEvents = num(await one("SELECT COUNT(*) AS n FROM version_queue WHERE status='published' AND datetime(updated_at) >= datetime('now','-30 days')"), "n");
  const wcLive = num(await one("SELECT last_value AS n FROM metric_registry WHERE metric='worker_count'"), "n");
  const waiLive = num(await one("SELECT last_value AS n FROM metric_registry WHERE metric='workers_ai_cost_30d_usd'"), "n");
  const totalCostEst = num(await one("SELECT last_value AS n FROM metric_registry WHERE metric='cost_usd_30d'"), "n");
  const impactPerUsd = num(await one("SELECT last_value AS n FROM metric_registry WHERE metric='external_impact_per_dollar'"), "n");
  const zViews = num(await one("SELECT last_value AS n FROM metric_registry WHERE metric='zenodo_views_total'"), "n");
  const zDl = num(await one("SELECT last_value AS n FROM metric_registry WHERE metric='zenodo_downloads_total'"), "n");
  const autoOverall = num(await one("SELECT score AS n FROM autonomy_scores WHERE dimension='overall'"), "n");
  const selfHeal = num(await one("SELECT score AS n FROM autonomy_scores WHERE dimension='self_heal'"), "n");
  const early = await one("SELECT state FROM shutdown_manifest WHERE component='EARLY-TRIGGER'");
  // 30-day trend from the daily snapshots (nearest snapshot at or before 28 days ago, else the oldest).
  let trend = null;
  try {
    const now0 = await one("SELECT d, papers, subscribers, pageviews FROM roi_daily_snapshots ORDER BY d DESC LIMIT 1");
    const then = await one("SELECT d, papers, subscribers, pageviews FROM roi_daily_snapshots WHERE d <= date('now','-28 day') ORDER BY d DESC LIMIT 1") || await one("SELECT d, papers, subscribers, pageviews FROM roi_daily_snapshots ORDER BY d ASC LIMIT 1");
    if (now0 && then && now0.d !== then.d) trend = { from: then.d, to: now0.d, pageviews: [then.pageviews, now0.pageviews], subscribers: [then.subscribers, now0.subscribers], papers: [then.papers, now0.papers] };
  } catch (e) {
  }
  // GATE-STATE-LIVE-1: a governance gate is evaluated from its source; the stored label is used only when no live
  // measurement exists. A gate whose target is RETIRED by the owner is never written back.
  const liveGate = {
    full_reports_live_30d: rep30 != null ? rep30 >= 2 ? "MET" : "OPEN" : null,
    impressions_growth_30d: trueMoM != null ? trueMoM >= 30 ? "MET" : "OPEN" : null,
    subscribers_growth_monthly: new30 != null ? new30 >= 10 ? "MET" : "OPEN" : null,
    worker_count: wcLive != null ? wcLive <= 28 ? "MET" : "OPEN" : null,
    workers_ai_cost_30d_usd: waiLive != null ? waiLive <= 7.5 ? "MET" : "OPEN" : null
  };
  let gatesMet = 0, gatesTotal = 0;
  try {
    const th = await d1all(env.AUDIT, "SELECT metric, target, state FROM impact_thresholds");
    for (const t of th) {
      const retired = /^RETIRED/i.test(String(t.target || ""));
      const lg = retired ? null : liveGate[t.metric] || null;
      const stv = lg || t.state;
      gatesTotal++;
      if (stv === "MET") gatesMet++;
      if (lg && lg !== t.state) await env.AUDIT.prepare("UPDATE impact_thresholds SET state=?1 WHERE metric=?2").bind(lg, t.metric).run();
    }
  } catch (e) {
  }
  // Survival headroom -> survival_state (feeds the SAI external_impact term). STALE-GATE-FAILCLOSED-1 (#1301).
  let surv = null;
  try {
    const mr = await d1all(env.AUDIT, "SELECT metric, layer, kind, last_value, last_refreshed, refresh_cadence FROM metric_registry");
    const c01 = function(x) {
      return Math.max(0, Math.min(1, x));
    };
    const cadenceMs = function(c) {
      const s = String(c == null ? "" : c).trim().toLowerCase();
      if (!s) return null;
      if (s === "daily") return 24 * 36e5;
      if (s === "hourly") return 36e5;
      if (s === "weekly") return 7 * 24 * 36e5;
      const every = s.match(/^\*\/(\d+)/);
      if (every) return Math.max(1, parseInt(every[1], 10)) * 6e4;
      if (/^\d+ \* \* \* \*$/.test(s)) return parseInt(s, 10) * 36e5;
      return null;
    };
    const staleOf = function(mm) {
      if (!mm || mm.last_refreshed == null) return true;
      const base = cadenceMs(mm.refresh_cadence);
      if (base == null) return true;
      const t = Date.parse(String(mm.last_refreshed).replace(" ", "T"));
      return isNaN(t) || Date.now() - t > 2 * base + 5 * 6e4;
    };
    const regVal = function(name) {
      const mm = mr.filter(function(x) {
        return x.metric === name;
      })[0];
      if (!mm || mm.last_value == null || staleOf(mm)) return null;
      const n = Number(String(mm.last_value).replace(/[^0-9.]/g, ""));
      return isNaN(n) ? null : n;
    };
    const waiCost = regVal("workers_ai_cost_30d_usd");
    const costUsd = regVal("cost_usd_30d");
    const wc = st && st.fleet && st.fleet.workers || null;
    const drift = st && st.integration && st.integration.drift;
    const driftBad = drift ? (drift.ghost || 0) + (drift.unregistered || 0) + (drift.unversioned || 0) : null;
    const gateRows = [
      { m: "impressions_growth_30d", live: trueMoM != null ? (trueMoM >= 0 ? "+" : "") + trueMoM + "%" : "n/a", head: trueMoM != null ? c01(trueMoM / 30) : null },
      { m: "full_reports_live_30d", live: String(rep30 != null ? rep30 : "n/a"), head: rep30 != null ? c01(rep30 / 2) : null },
      { m: "subscribers_growth_monthly", live: subsTotal != null ? subsTotal + " total" : "n/a", head: subsTotal != null ? c01(subsTotal / 10) : null },
      { m: "worker_count", live: String(wc != null ? wc : "n/a"), head: wc != null ? c01((57 - wc) / 29) : null },
      { m: "workers_ai_cost_30d_usd", live: waiCost != null ? "$" + waiCost.toFixed(2) + "/30d" : aiN != null ? aiN.toLocaleString() + " neurons" : "n/a", head: waiCost != null ? c01((15.03 - waiCost) / (15.03 - 7.5)) : aiN != null ? c01((15e5 - aiN) / 8e5) : null },
      { m: "drift_total", live: driftBad == null ? "n/a" : String(driftBad), head: driftBad == null ? 0 : c01(1 - driftBad) }
    ];
    const gateW = { impressions_growth_30d: 0.45, subscribers_growth_monthly: 0.2, full_reports_live_30d: 0.15, workers_ai_cost_30d_usd: 0.1, worker_count: 0.05, drift_total: 0.05 };
    let wnum = 0, wsum = 0, nullGates = 0;
    gateRows.forEach(function(x) {
      const w = gateW[x.m] != null ? gateW[x.m] : 0.1;
      const rmm = mr.filter(function(y) {
        return y.metric === x.m;
      })[0];
      wsum += w;
      if (staleOf(rmm)) return;
      if (typeof x.head === "number") wnum += w * x.head;
      else nullGates += 1;
    });
    surv = wsum > 0 ? wnum / wsum : null;
    const costEff = costUsd != null ? c01((250 - costUsd) / (250 - 100)) : 0.5;
    const extImpact = surv != null ? surv * costEff : null;
    await env.AUDIT.prepare("INSERT INTO survival_state (id, ts, survival_score, graded_score, gates_json, note) VALUES (1, datetime('now'), ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET ts=excluded.ts, survival_score=excluded.survival_score, graded_score=excluded.graded_score, gates_json=excluded.gates_json").bind(surv, extImpact, JSON.stringify(gateRows), "weighted gate headroom x cost-efficiency = SAI external_impact (objectives.id=2 v2); FAIL-CLOSED #1301 null_gates=" + nullGates).run();
  } catch (e) {
  }
  let reach = null;
  try {
    const sc = await reachScorecardData(env);
    const w28 = sc.windows.d28 || {}, w7 = sc.windows.d7 || {};
    reach = { end: sc.end, pv7: w7.pageviews ? Number(w7.pageviews.value) : null, pv28: w28.pageviews ? Number(w28.pageviews.value) : null, days28: w28.pageviews ? Number(w28.pageviews.days) : 0, ingest: sc.last_ingest ? sc.last_ingest.status : null };
  } catch (e) {
  }
  const snap = {
    at: new Date(now).toISOString(),
    cost: { spend30, spend_basis: SPEND_BASIS, spend_at: spendAt, period_gross: periodGross, metered30, metered_top: topModels, cap: SPEND_CAP_USD, gateway_limit: gwLimit, balance: bal && bal.balance != null ? Number(bal.balance) / 100 : null, total_est30: totalCostEst, workers_ai30: waiLive, neurons30: aiN },
    ret: { subs_confirmed: subsConfirmed, subs_total: subsTotal, subs_new30: new30, pageviews30: rumTotal, pageviews_mom: trueMoM, pageviews_prior_days: priorDays, reports30: rep30, publish_events30: pubEvents, zenodo_views: zViews, zenodo_downloads: zDl, impact_per_usd: impactPerUsd },
    autonomy: { overall: autoOverall, self_heal: selfHeal },
    reach,
    fleet: { workers: wcLive },
    early_trigger: early ? early.state : null,
    trend,
    gates_met: gatesMet,
    gates_total: gatesTotal,
    survival: surv
  };
  await loopMetaSet(env, "human_gov_snapshot", JSON.stringify(snap));
  return snap;
}
function investInputs(snap, facts) {
  const c = snap && snap.cost || {};
  const r = snap && snap.ret || {};
  const gateDays = Math.ceil((Date.parse(REVIEW_GATE_DATE + "T00:00:00Z") - Date.now()) / DAY_MS);
  const cred = facts.credibility_events ? facts.credibility_events.value : null;
  const fund = facts.funding_secured ? facts.funding_secured.value : null;
  return { spend30: c.spend30 != null ? c.spend30 : null, metered30: c.metered30 != null ? c.metered30 : null, cap: c.cap != null ? c.cap : SPEND_CAP_USD, subs: r.subs_confirmed != null ? r.subs_confirmed : 0, subsNew30: r.subs_new30 != null ? r.subs_new30 : 0, credibility: cred, funding: fund, revenue30: facts.revenue_30d_usd ? facts.revenue_30d_usd.value : null, attested: !!(facts.credibility_events || facts.funding_secured), early: snap ? snap.early_trigger : null, days: gateDays, gate_date: REVIEW_GATE_DATE };
}
async function humanView(env, st, ctx) {
  const [h, meta, facts, snoozes] = await Promise.all([collectHumanActions(env), loopMetaGet(env), readInvestFacts(env), activeSnoozes(env)]);
  const ownerCfg = !!(env.OWNER_TOKEN && String(env.OWNER_TOKEN).length >= OWNER_TOKEN_MIN);
  const snoozedN = h.items.filter(function(i) {
    return snoozes[i.key];
  }).length;
  h.items = h.items.filter(function(i) {
    return !snoozes[i.key];
  });
  if (!ownerCfg) h.items.unshift({ key: "owner-key", source: "dashboard", sev: "normal", title: "Set the dashboard owner key (OWNER_TOKEN) to respond here and lock this page", why: "Responding and sending prompts from the dashboard needs your identity, and the page is currently public.", fallback: "The page stays read-only and public (noindex).", action: "Cloudflare dashboard > Workers & Pages > qnfo-fleet-dashboard > Settings > Variables and Secrets: add a secret named OWNER_TOKEN (24+ random characters, e.g. from a password manager). Then open this page and enter it once.", url: "", due: "", age: null });
  let gov = null;
  try {
    gov = meta.human_gov_snapshot ? JSON.parse(meta.human_gov_snapshot) : null;
  } catch (e) {
  }
  const govAge = gov ? Date.now() - Date.parse(gov.at) : null;
  // Real-time: money/return inputs are re-measured on demand when older than 5 min (throttled to one run / 2 min).
  if ((!gov || govAge > HUMAN_SNAPSHOT_MAX_AGE_MS) && ctx && ctx.waitUntil) ctx.waitUntil(govClaim(env, 12e4).then(function(ok) {
    return ok ? governanceSnapshot(env, st) : null;
  }).catch(function() {
  }));
  const inp = gov ? investInputs(gov, facts) : null;
  const decision = inp ? decideInvestment(inp) : { verdict: "UNKNOWN", risk: null, basis: "none", headline: "Money and return figures are being measured for the first time.", reasons: [], flips: [], levers: [], gate: { due: REVIEW_GATE_DATE } };
  if (gov) {
    const lv = decision.levers;
    const c = gov.cost || {};
    if (c.metered_top && c.metered_top.length) lv.push("Biggest estimated-cost models (30d): " + c.metered_top.map(function(m) {
      return m.model + " $" + m.usd.toFixed(0);
    }).join(", ") + ".");
    if (c.workers_ai30 != null && c.workers_ai30 > 7.5) lv.push("Workers AI is $" + c.workers_ai30.toFixed(0) + "/30d against the $7.50 gate.");
    if (gov.fleet && gov.fleet.workers != null && gov.fleet.workers > 30) lv.push(gov.fleet.workers + " workers live against the 24-30 solo-manageable band (FLEET-BUDGET.md consolidation waves).");
  }
  const stateAgeMin = st && st.generated_at ? (Date.now() - Date.parse(st.generated_at)) / 6e4 : null;
  const issues = st && st.issues || [];
  const errs = issues.filter(function(i) {
    return i.sev === "err";
  });
  const stuck = errs.filter(function(i) {
    const a = ageDaysOf(i.first_seen);
    return a != null && a * 1440 > LOOP_SLA_ERR_MIN;
  });
  const probes = st && st.probes || [];
  const drift = st && st.integration && st.integration.drift;
  const gateDue = decision.gate && decision.gate.days != null && decision.gate.days <= 0;
  // Only what needs action now counts toward the banner. Dated items more than UPCOMING_DAYS away wait under "Coming up".
  const dueMs = function(it) {
    const t = Date.parse(String(it.due || "") + "T00:00:00Z");
    return isNaN(t) ? null : t;
  };
  const isLater = function(it) {
    const t = dueMs(it);
    return t != null && t - Date.now() > UPCOMING_DAYS * DAY_MS;
  };
  const upcoming = h.items.filter(isLater);
  const items = h.items.filter(function(it) {
    return !isLater(it);
  });
  if (decision.verdict === "KILL" || decision.verdict === "SCALE_BACK" || gateDue && decision.verdict === "UNKNOWN") items.unshift({ key: "decision", source: "decision", sev: decision.verdict === "SCALE_BACK" ? "normal" : "urgent", title: decision.verdict === "KILL" ? "Decide: stop the fleet?" : decision.verdict === "SCALE_BACK" ? "Decide: scale the fleet back" : "Decide: continue or stop (review gate due)", why: decision.headline, fallback: "Nothing is retired, deleted or re-capped until you act. The armed shutdown_manifest rows still apply on their own dates.", action: "Read the decision below. Email 'shutdown' to qnfo@qnfo.org to stop, or attest evidence at /api/decision/fact.", url: "", due: gateDue ? REVIEW_GATE_DATE : "", age: null });
  const stale = stateAgeMin == null || stateAgeMin > 60;
  const moneyStale = !gov || govAge > 6 * 36e5;
  let verdict = "CLEAR";
  if (items.length) verdict = "ACTION";
  else if (h.blind.length || stale) verdict = "UNCONFIRMED";
  return {
    schema_version: "fleet-human/v2",
    snoozed: snoozedN,
    owner: { configured: ownerCfg, authed: false },
    worker: NAME,
    version: VERSION,
    generated_at: new Date().toISOString(),
    verdict,
    count: items.length,
    urgent: items.filter(function(i) {
      return i.sev === "urgent";
    }).length,
    items,
    upcoming,
    blind: h.blind,
    decision: Object.assign({}, decision, { level: INVEST_LEVEL[decision.verdict === "CONTINUE" && decision.risk === "at_risk" ? "AT_RISK" : decision.verdict], inputs: inp }),
    business: gov ? { measured_at: gov.at, money_stale: moneyStale, cost: gov.cost, ret: gov.ret, reach: gov.reach || null, autonomy: gov.autonomy, trend: gov.trend, gates_met: gov.gates_met, gates_total: gov.gates_total, facts } : null,
    feeds: (function() {
      try {
        return meta.invest_feed_status ? JSON.parse(meta.invest_feed_status) : null;
      } catch (e) {
        return null;
      }
    })(),
    attention: { open: items.filter(function(i) {
      return i.source !== "decision";
    }).length, oldest_days: items.reduce(function(m, i) {
      return i.age != null && i.age > m ? i.age : m;
    }, 0) },
    system: {
      verdict: st && st.verdict || "UNKNOWN",
      state_age_min: stateAgeMin != null ? Math.round(stateAgeMin) : null,
      workers: st && st.fleet ? st.fleet.workers : null,
      probes_ok: probes.filter(function(p) {
        return p.ok;
      }).length,
      probes_total: probes.length,
      errors: errs.length,
      warnings: issues.length - errs.length,
      drift: drift ? (drift.ghost || 0) + (drift.unregistered || 0) + (drift.unversioned || 0) : null,
      stuck: stuck.map(function(i) {
        return { title: String(i.title || "").slice(0, 120), resource: i.resource || "", since: i.first_seen || null };
      })
    }
  };
}
// ---------- feeds: what ops / fleet-exec / fleet-control read ----------
async function ensureFeedWiring(env) {
  const A = env.AUDIT;
  const errs = [];
  const run = async function(name, q) {
    try {
      await q.run();
    } catch (e) {
      errs.push(name + ": " + squash(String(e && e.message || e)).slice(0, 90));
    }
  };
  // metric_registry rows: picked up by qnfo-fleet-control evaluateMetricTriggers, the staleness/kill-band views and
  // the autonomy scorer. Cadence */15 makes a silent publisher show up as a stale metric.
  // METRIC-INTEGRITY-1 also refuses a row without source_of_truth, disposition_actor and refresh_cadence.
  const reg = async function(metric, kind, target, formula, source) {
    await run("registry:" + metric, A.prepare("INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state) VALUES (?1,'system',?2,?3,?4,?5,'qnfo-fleet-dashboard','human','*/15','MEASURED')").bind(metric, kind, formula, source, target));
  };
  await reg("invest_decision_level", "lagging", "0 continue, 1 continue-at-risk, 2 scale back, 3 stop, -1 unknown (advisory; owner decides)", "decideInvestment(): spend vs cap, return vs the 2026-12-31 gate", "https://fleet.qnfo.org/api/decision (qnfo-fleet-dashboard, fleet_budget ai_spend:total)");
  await reg("human_actions_open", "leading", "0 (system resolves everything else)", "count of items the human must act on (queue + derived)", "https://fleet.qnfo.org/ (human_actions, qnfo-fleet-dashboard)");
  await reg("human_wait_oldest_days", "leading", "<= 3", "days the oldest open human item has waited", "https://fleet.qnfo.org/ (human_actions, qnfo-fleet-dashboard)");
  // Threshold triggers (INSERT OR IGNORE on the UNIQUE metric_key): fleet-control files the issue / digest alert hourly.
  await run("trigger", A.prepare("INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes) VALUES ('invest_decision_level','Investment verdict is scale back or stop','meta','gte',2,9,'Read https://fleet.qnfo.org/api/decision. Advisory only: scale spend levers (T1) and put the keep/stop call to the owner; never retire or delete on this signal.','human','agent_issues',24,1,'INVEST-DECISION-1 qnfo-fleet-dashboard')"));
  await run("trigger", A.prepare("INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes) VALUES ('human_wait_oldest_days','A human action has waited over 7 days','meta','gte',7,6,'Owner-held item has been waiting a week: https://fleet.qnfo.org/ shows it.','human','alerts',72,1,'INVEST-DECISION-1 qnfo-fleet-dashboard')"));
  // fleet-exec heartbeat: every 10 min fleet-exec calls /api/decision?refresh=1, so the decision snapshot is
  // re-measured server-side even when nobody has the page open, and fleet_runs keeps a trail of verdicts.
  const def = JSON.stringify({ steps: [{ type: "http", url: "https://fleet.qnfo.org/api/decision?refresh=1", method: "GET" }] });
  await run("fleet_task", A.prepare("INSERT OR IGNORE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at) VALUES ('invest-decision-heartbeat','INVEST-DECISION-1: refresh + record the continue/scale-back/stop verdict','workflow',?1,30000,1,1,1,datetime('now'))").bind(def));
  await run("fleet_cron", A.prepare("INSERT INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at) SELECT 'invest-decision-heartbeat-10m','*/10 * * * *','invest-decision-heartbeat',1,'UTC',datetime('now') WHERE NOT EXISTS (SELECT 1 FROM fleet_crons WHERE task_id='invest-decision-heartbeat')"));
  return errs;
}
async function publishFeeds(env, v) {
  const out = { registry: false, log: false, issue: null };
  try {
    await ensureInvestTables(env);
    out.wiring_errors = await ensureFeedWiring(env);
  } catch (e) {
    out.wiring_errors = [String(e && e.message || e).slice(0, 120)];
  }
  const A = env.AUDIT;
  // metric_registry carries D1 guard triggers (METRIC-CADENCE-CANONICAL-1, METRIC-INTEGRITY-1), so an insert can be refused and the
  // UPDATE below then matches no row. "registry" is true only when every row was actually written.
  const upd = async function(metric, val) {
    const r = await A.prepare("UPDATE metric_registry SET last_value=?1, last_refreshed=?2 WHERE metric=?3").bind(String(val), new Date().toISOString(), metric).run();
    return !!(r && r.meta && Number(r.meta.changes) > 0);
  };
  try {
    const wrote = [await upd("invest_decision_level", v.decision.level), await upd("human_actions_open", v.attention.open), await upd("human_wait_oldest_days", Math.round(v.attention.oldest_days * 10) / 10)];
    out.registry = wrote.every(Boolean);
    if (!out.registry) out.registry_missing = ["invest_decision_level", "human_actions_open", "human_wait_oldest_days"].filter(function(_m, i) {
      return !wrote[i];
    });
  } catch (e) {
    out.registry = false;
  }
  const d = v.decision;
  const key = d.verdict + "/" + (d.risk || "-") + "/" + d.basis;
  try {
    const meta = await loopMetaGet(env);
    const lastAt = meta.invest_last_log_at ? Date.parse(meta.invest_last_log_at) : 0;
    if (meta.invest_last_key !== key || Date.now() - lastAt > 24 * 36e5) {
      const i = d.inputs || {};
      await A.prepare("INSERT INTO invest_decision_log (verdict, risk, basis, spend30, metered30, subs, gate_return_met, days_to_gate, reasons_json) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(d.verdict, d.risk || null, d.basis, i.spend30 != null ? i.spend30 : null, i.metered30 != null ? i.metered30 : null, i.subs != null ? i.subs : null, d.gate && d.gate.return_met ? 1 : 0, d.gate && d.gate.days != null ? d.gate.days : null, JSON.stringify({ headline: d.headline, reasons: d.reasons, flips: d.flips, levers: d.levers })).run();
      await loopMetaSet(env, "invest_last_key", key);
      await loopMetaSet(env, "invest_last_log_at", new Date().toISOString());
      out.log = true;
      // Ops reads agent_issues (ops_issues_list): one deduped issue per recommendation that needs action.
      if (d.verdict === "SCALE_BACK" || d.verdict === "KILL" || d.risk === "gate_due") {
        const title = "INVEST-DECISION-" + d.verdict + (d.risk ? "-" + String(d.risk).toUpperCase() : "") + ": " + String(d.headline).slice(0, 110);
        const open = await d1all(A, "SELECT id FROM agent_issues WHERE source='qnfo-fleet-dashboard' AND title LIKE 'INVEST-DECISION-%' AND status='open' LIMIT 1");
        if (open.length) out.issue = "deduped:" + open[0].id;
        else {
          const nowMs = Date.now();
          await A.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1,?2,'qnfo-fleet-dashboard','governance','high','open',?3,?3)").bind(title, "AUTO-FILED by INVEST-DECISION-1 (advisory). " + d.headline + " Reasons: " + d.reasons.join(" | ") + " Levers: " + d.levers.join(" | ") + " Flips: " + d.flips.join(" | ") + " Live: https://fleet.qnfo.org/api/decision. T1 levers (lowering spend, pausing the think-loop) may be applied; stopping or retiring is the owner's call (AUTONOMY-DECISION-POLICY.md).", nowMs).run();
          out.issue = "filed";
        }
      }
    }
  } catch (e) {
    out.log_error = String(e && e.message || e).slice(0, 120);
  }
  await loopMetaSet(env, "invest_feed_status", JSON.stringify({ at: new Date().toISOString(), registry: out.registry, logged: out.log, issue: out.issue, wiring_errors: out.wiring_errors || [], registry_missing: out.registry_missing || [], log_error: out.log_error || null }));
  return out;
}
// ---------- page ----------
function humanFragment(v) {
  const o = [];
  const e = esc;
  const d = v.decision;
  const b = v.business;
  const money = function(n) {
    return n == null ? "n/a" : "$" + Number(n).toFixed(0);
  };
  const banner = v.verdict === "ACTION" ? { cls: "act", big: v.count + (v.count === 1 ? " thing needs" : " things need") + " you", sub: v.urgent ? v.urgent + " urgent" : "Everything else is handled." } : v.verdict === "CLEAR" ? { cls: "ok", big: "Nothing needs you", sub: "Every queue that can wait on a human is empty. The system is handling the rest." } : { cls: "unk", big: "Can't confirm", sub: v.blind.length ? "Could not read: " + v.blind.join("; ") : "System data is " + v.system.state_age_min + " min old, so an all-clear would be a guess." };
  o.push('<section class="banner ' + banner.cls + '"><h1>' + e(banner.big) + "</h1><p>" + e(banner.sub) + "</p></section>");
  if (v.verdict === "ACTION" && v.blind.length) o.push('<div class="card meta">Also could not read: ' + e(v.blind.join("; ")) + "</div>");
  let shown = 0;
  for (const it of v.items) {
    if (shown === 5) o.push('<details class="more"><summary>' + (v.items.length - 5) + " more waiting on you</summary>");
    shown++;
    o.push('<article class="card' + (it.sev === "urgent" ? " urgent" : "") + '"><h2>' + (it.sev === "urgent" ? '<span class="tag u">urgent</span>' : "") + e(it.title) + "</h2>");
    o.push('<div class="meta">' + e(it.source) + (it.due ? " &middot; due " + e(it.due) : "") + (it.age != null ? " &middot; waiting " + e(agoText(it.age).replace(" ago", "")) : "") + "</div>");
    if (it.why) o.push('<div class="row"><b>Why you</b>' + e(it.why) + "</div>");
    if (it.fallback) o.push('<div class="row"><b>If you wait</b>' + e(it.fallback) + "</div>");
    if (it.action) o.push('<div class="row"><b>To do</b>' + e(it.action) + "</div>");
    if (/^https:\/\//.test(it.url || "")) o.push('<a class="do" href="' + e(it.url) + '" rel="noopener">Open</a>');
    if (it.detail && it.detail.length) {
      for (const d of it.detail) o.push('<div class="pr"><div>#' + e(d.id) + " " + e(d.statement) + '</div><div class="meta">' + e(d.why) + "</div>" + (v.owner && v.owner.authed ? '<div class="acts" data-key="goals:objective-revision:' + e(d.id) + '"><button data-act="ratify" data-oid="' + e(d.id) + '">Ratify</button><button data-act="reject" data-oid="' + e(d.id) + '">Reject</button></div>' : "") + "</div>");
      if (!(v.owner && v.owner.authed)) o.push('<div class="meta">Sign in to decide each one here.</div>');
    }
    if (v.owner && v.owner.authed) o.push('<div class="acts" data-key="' + e(it.key) + '">' + (String(it.key).indexOf("ha:") === 0 ? '<button data-act="done">Done</button><button data-act="dismiss">Not doing</button>' : "") + '<button data-act="snooze" data-days="3">Snooze 3d</button><button data-act="snooze" data-days="7">Snooze 7d</button><button data-act="note">Add note</button></div>');
    o.push("</article>");
  }
  if (shown > 5) o.push("</details>");
  if (v.upcoming && v.upcoming.length) {
    o.push("<details><summary>Coming up (" + v.upcoming.length + ")</summary><ul>");
    for (const it of v.upcoming) o.push("<li><b>" + e(it.due) + "</b> " + e(it.title) + (it.action ? ' <span class="meta">&mdash; ' + e(it.action) + "</span>" : "") + (/^https:\/\//.test(it.url || "") ? ' <a href="' + e(it.url) + '" rel="noopener">open</a>' : "") + "</li>");
    o.push("</ul></details>");
  }
  const lbl = { CONTINUE: "CONTINUE", SCALE_BACK: "SCALE BACK", KILL: "STOP", UNKNOWN: "CAN'T JUDGE" }[d.verdict] || d.verdict;
  const dcls = d.verdict === "CONTINUE" ? d.risk === "at_risk" ? "unk" : "ok" : d.verdict === "UNKNOWN" ? "unk" : "act";
  o.push('<h3>Keep investing?</h3><section class="card verdict ' + dcls + '"><div class="vtop"><span class="chip ' + dcls + '">' + e(lbl) + "</span>" + (d.risk === "at_risk" ? '<span class="tag">at risk</span>' : "") + (d.basis === "metered-estimate" ? '<span class="tag">cost unverified</span>' : "") + '</div><p class="vhead">' + e(d.headline) + "</p>");
  if (d.reasons.length) o.push('<ul class="why">' + d.reasons.map(function(r) {
    return "<li>" + e(r) + "</li>";
  }).join("") + "</ul>");
  if (d.flips.length) o.push('<div class="row"><b>What changes it</b>' + e(d.flips.join(" ")) + "</div>");
  if (d.levers.length && d.verdict !== "CONTINUE") o.push('<div class="row"><b>Levers</b>' + e(d.levers.join(" ")) + "</div>");
  o.push('<div class="meta" style="margin-top:8px">Rule (STRATEGY.md s9, you ratified it): continue only if credibility events &ge; ' + INVEST_CRED_TARGET + " OR confirmed subscribers &ge; " + INVEST_SUBS_TARGET + " OR funding, AND spend within the cap, judged at " + e(REVIEW_GATE_DATE) + " (" + e(d.gate.days) + " days). Advisory: the system never stops itself.</div></section>");
  o.push("<h3>The business case</h3>");
  if (!b) o.push('<div class="meta">Measuring for the first time, back in a moment.</div>');
  else {
    const c = b.cost, r = b.ret, a = b.autonomy, ex = b.facts || {};
    const cashCls = c.spend30 == null ? "amber" : c.spend30 > c.cap ? "bad" : c.spend30 > c.cap * 0.75 ? "amber" : "good";
    o.push('<div class="grid">');
    o.push('<div class="stat"><div class="n ' + cashCls + '">' + money(c.spend30) + '</div><div class="l">AI spend, last 30 days, unified billing (cap $' + e(c.cap) + ")" + (c.period_gross != null ? " &middot; this billing period so far " + money(c.period_gross) : "") + (c.balance != null ? " &middot; credit left " + money(c.balance) : "") + "</div></div>");
    o.push('<div class="stat"><div class="n">' + e(r.subs_confirmed != null ? r.subs_confirmed : "n/a") + '/50</div><div class="l">confirmed subscribers (+' + e(r.subs_new30 != null ? r.subs_new30 : 0) + " in 30d)</div></div>");
    o.push('<div class="stat"><div class="n">' + (ex.revenue_30d_usd ? money(ex.revenue_30d_usd.value) : "$0") + '</div><div class="l">revenue 30d' + (ex.revenue_30d_usd ? "" : " (none recorded)") + "</div></div>");
    o.push('<div class="stat"><div class="n">' + (ex.credibility_events ? e(ex.credibility_events.value) + "/2" : "?") + '</div><div class="l">credibility events' + (ex.credibility_events ? "" : " (unattested)") + "</div></div>");
    const mom = r.pageviews_mom;
    o.push('<div class="stat"><div class="n ' + (mom == null ? "amber" : mom >= 0 ? "good" : "bad") + '">' + (mom != null ? (mom >= 0 ? "+" : "") + mom + "%" : "n/a") + '</div><div class="l">pageviews vs prior 30d (' + e(r.pageviews30 != null ? r.pageviews30.toLocaleString() : "n/a") + ")" + (mom == null && r.pageviews_prior_days != null && r.pageviews_prior_days < RUM_MIN_PRIOR_DAYS ? " &middot; prior window only " + e(r.pageviews_prior_days) + "/30 days of data" : "") + "</div></div>");
    const perRep = c.spend30 != null && r.reports30 > 0 ? c.spend30 / r.reports30 : null;
    o.push('<div class="stat"><div class="n">' + (perRep != null ? "$" + perRep.toFixed(0) : "n/a") + '</div><div class="l">AI spend per full report (' + e(r.reports30 != null ? r.reports30 : "?") + " in 30d)</div></div>");
    o.push('<div class="stat"><div class="n">' + (a.overall != null ? e(a.overall) + "/5" : "n/a") + '</div><div class="l">autonomy' + (a.self_heal != null ? " &middot; self-heal " + e(a.self_heal) + "/5" : "") + "</div></div>");
    o.push('<div class="stat"><div class="n ' + (v.attention.open ? "amber" : "good") + '">' + e(v.attention.open) + '</div><div class="l">of your time: open items' + (v.attention.oldest_days >= 1 ? " &middot; oldest " + Math.round(v.attention.oldest_days) + "d" : "") + "</div></div>");
    o.push("</div>");
    const t = b.trend;
    o.push('<div class="meta" style="margin-top:8px">' + (t ? "Since " + e(t.from) + ": pageviews " + e(t.pageviews[0]) + " &rarr; " + e(t.pageviews[1]) + ", subscribers " + e(t.subscribers[0]) + " &rarr; " + e(t.subscribers[1]) + ", full reports " + e(t.papers[0]) + " &rarr; " + e(t.papers[1]) + ". " : "") + (c.metered30 != null ? "Estimated list cost across all providers: " + money(c.metered30) + "/30d (an estimate, not cash, #1699). " : "") + (b.reach && b.reach.pv28 != null ? "Reach 28d (" + e(b.reach.days28) + " days ingested): " + e(Math.round(b.reach.pv28).toLocaleString()) + " pageviews. " : "Reach scorecard: first daily ingest pending (/api/reach). ") + (c.total_est30 != null ? "Whole-fleet cost estimate: " + money(c.total_est30) + "/30d. " : "") + (r.zenodo_views != null ? "Zenodo views " + e(Number(r.zenodo_views).toLocaleString()) + ", downloads " + e(Number(r.zenodo_downloads || 0).toLocaleString()) + ". " : "") + "Measured " + e(agoText(ageDaysOf(b.measured_at))) + (b.money_stale ? " &mdash; <b class=\"amber\">stale</b>" : "") + ".</div>");
  }
  if (v.owner && v.owner.authed) {
    o.push('<h3>Tell or ask the fleet</h3><section class="card"><textarea id="ptext" rows="3" maxlength="2000" placeholder="Ask about the queue, decision or spend, or tell the fleet to do something"></textarea><div class="acts"><button id="pask">Ask now</button><button id="ptask">Queue as task</button><span class="meta" id="pmsg"></span></div><div class="meta" style="margin-top:6px">Ask now answers from the current queue and decision (no actions). Queue as task goes to the intent orchestrator\'s next triage (06:00 and 06:30 UTC).</div>');
    for (const pr of v.prompts || []) {
      const chip = pr.mode === "task" ? "task &middot; " + e(pr.intent_status || pr.status) + (pr.triage_decision ? " &middot; " + e(pr.triage_decision) : "") : e(pr.status) + (pr.model ? " &middot; " + e(pr.model) : "");
      o.push('<div class="pr"><div class="meta">' + e(String(pr.ts || "").slice(0, 16)) + " &middot; " + chip + "</div><div>" + e(String(pr.prompt || "").slice(0, 220)) + "</div>" + (pr.response ? '<details><summary>Answer</summary><div class="ans">' + e(pr.response) + "</div></details>" : "") + (pr.error ? '<div class="meta bad">' + e(pr.error) + "</div>" : "") + "</div>");
    }
    o.push("</section>");
    if (v.responses && v.responses.length) {
      o.push('<div class="meta" style="margin-top:6px">Recent responses: ' + v.responses.slice(0, 5).map(function(r) {
        return e(r.kind) + " " + e(String(r.key).replace(/^ha:/, "")) + (r.until ? " until " + e(String(r.until).slice(0, 10)) : "") + (r.note ? " (" + e(String(r.note).slice(0, 60)) + ")" : "");
      }).join("; ") + (v.snoozed ? "; " + v.snoozed + " snoozed now" : "") + ".</div>");
    }
  }
  const s = v.system;
  const sysBad = s.stuck.length > 0;
  o.push("<details" + (sysBad ? " open" : "") + "><summary>" + (sysBad ? '<b class="bad">System has ' + s.stuck.length + " error" + (s.stuck.length > 1 ? "s" : "") + " unresolved past its 2h SLA</b>" : "System is handling the rest") + " &middot; " + e(s.verdict) + " &middot; " + s.errors + " err / " + s.warnings + " warn &middot; " + s.probes_ok + "/" + s.probes_total + " probes ok</summary>");
  if (s.stuck.length) {
    o.push("<ul>");
    for (const i of s.stuck) o.push("<li>" + e(i.title) + (i.resource ? ' <span class="meta">(' + e(i.resource) + ")</span>" : "") + "</li>");
    o.push("</ul>");
  }
  o.push('<div class="meta" style="margin-top:8px">Red flags, drift, queues and retries are worked by the issue loop and qnfo-fleet-control and are not your job unless they appear above.' + (s.drift ? " Drift: " + e(s.drift) + "." : "") + "</div></details>");
  o.push('<footer>v' + e(v.version) + " &middot; system state " + (s.state_age_min != null ? e(s.state_age_min) + " min old" : "unknown") + ' &middot; <a href="/api/human">human JSON</a> &middot; <a href="/api/decision">decision JSON</a></footer>');
  return o.join("");
}
function humanHtml(v) {
  const o = [];
  o.push('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fleet: your queue</title><style>');
  o.push(":root{--bg:#f6f7f9;--card:#fff;--ink:#14171c;--mute:#5b6472;--line:#e2e5ea;--ok:#157f3b;--okbg:#e7f6ec;--act:#b42318;--actbg:#fdecea;--unk:#8a5a00;--unkbg:#fff4d6;--warn:#8a5a00;--link:#0b5cd5}");
  o.push("@media(prefers-color-scheme:dark){:root{--bg:#0e1116;--card:#171b22;--ink:#e8eaee;--mute:#9aa3b1;--line:#2a303a;--ok:#4cc17a;--okbg:#10241a;--act:#ff8a80;--actbg:#2d1513;--unk:#f0c05a;--unkbg:#2a2210;--warn:#f0c05a;--link:#7db1ff}}");
  o.push("*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}main{max-width:720px;margin:0 auto;padding:20px 16px 48px}");
  o.push(".top{display:flex;justify-content:space-between;align-items:center;color:var(--mute);font-size:13px;margin-bottom:12px}.top b{color:var(--ink);font-size:14px}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:var(--mute)}.dot.g{background:var(--ok)}.dot.a{background:var(--warn)}.dot.r{background:var(--act)}");
  o.push(".banner{border-radius:14px;padding:20px 18px;margin-bottom:18px}.banner.act{background:var(--actbg);border:1px solid var(--act)}.banner.ok{background:var(--okbg);border:1px solid var(--ok)}.banner.unk{background:var(--unkbg);border:1px solid var(--unk)}");
  o.push(".banner h1{margin:0;font-size:30px;line-height:1.15}.banner.act h1{color:var(--act)}.banner.ok h1{color:var(--ok)}.banner.unk h1{color:var(--unk)}.banner p{margin:6px 0 0;color:var(--mute)}");
  o.push(".card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px}.card.urgent{border-left:5px solid var(--act)}.card h2{margin:0 0 4px;font-size:17px}");
  o.push(".meta{font-size:13px;color:var(--mute)}.row{margin-top:8px;font-size:14px}.row b{display:inline-block;min-width:112px;margin-right:6px;color:var(--mute);font-weight:600;vertical-align:top}.do{display:inline-block;margin-top:10px;padding:8px 14px;border-radius:8px;background:var(--link);color:#fff;text-decoration:none;font-weight:600;font-size:14px}");
  o.push(".tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 7px;border-radius:99px;background:var(--line);color:var(--mute);margin-right:6px}.tag.u{background:var(--act);color:#fff}");
  o.push(".verdict.ok{border-left:5px solid var(--ok)}.verdict.unk{border-left:5px solid var(--unk)}.verdict.act{border-left:5px solid var(--act)}.vtop{display:flex;gap:6px;align-items:center}.chip{font-weight:800;letter-spacing:.04em;padding:3px 10px;border-radius:8px;font-size:14px}.chip.ok{background:var(--okbg);color:var(--ok)}.chip.unk{background:var(--unkbg);color:var(--unk)}.chip.act{background:var(--actbg);color:var(--act)}.vhead{margin:8px 0 4px;font-size:16px;font-weight:600}.why{margin:6px 0 0;padding-left:18px;font-size:14px;color:var(--mute)}");
  o.push("h3{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);margin:24px 0 8px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}.stat .n{font-size:22px;font-weight:700}.stat .l{font-size:12px;color:var(--mute)}.bad{color:var(--act)}.good{color:var(--ok)}.amber{color:var(--warn)}");
  o.push(".acts{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px}.acts button{padding:6px 11px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:13px;cursor:pointer}.acts button:hover{border-color:var(--link)}.acts button:disabled{opacity:.5;cursor:default}#ptext{width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:inherit}.pr{border-top:1px solid var(--line);margin-top:10px;padding-top:8px;font-size:14px}.ans{white-space:pre-wrap;font-size:14px;margin-top:6px}#so{color:var(--mute);margin-left:10px}details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin-top:14px}details.more{background:transparent;border:0;padding:0;margin-top:0}details.more>summary{padding:8px 2px;margin-bottom:8px}summary{cursor:pointer;color:var(--mute);font-size:14px}details ul{margin:8px 0 0;padding-left:18px;font-size:14px}a{color:var(--link)}footer{margin-top:28px;font-size:12px;color:var(--mute)}");
  o.push("</style></head><body><main>");
  o.push('<div class="top"><b>Fleet &middot; your queue</b><span><span id="dot" class="dot g"></span><span id="age">live</span>' + (v.owner && v.owner.authed ? '<a href="#" id="so">sign out</a>' : "") + "</span></div>");
  o.push('<div id="live">' + humanFragment(v) + "</div>");
  // Real-time: re-fetch the server-rendered fragment every 10s (queue is read live from D1 on each call). The dot
  // goes amber/red when updates stop arriving, so a frozen page cannot masquerade as an all-clear.
  o.push("</main><script>(function(){var live=document.getElementById('live'),dot=document.getElementById('dot'),age=document.getElementById('age'),last=Date.now(),busy=false;var H={'Content-Type':'application/json','x-fleet-ui':'1'};function paint(){var s=(Date.now()-last)/1000;age.textContent=s<15?'live':'updated '+Math.round(s)+'s ago';dot.className='dot '+(s<30?'g':s<90?'a':'r')}function tick(force){if((document.hidden&&!force)||busy)return;busy=true;var ops=[].map.call(live.querySelectorAll('details'),function(d){return d.open}),ta=document.getElementById('ptext'),tv=ta?ta.value:'',tf=ta&&document.activeElement===ta;fetch('/?frag=1',{cache:'no-store'}).then(function(r){if(r.status===401){location.reload();throw 0}if(!r.ok)throw 0;return r.text()}).then(function(h){live.innerHTML=h;[].forEach.call(live.querySelectorAll('details'),function(d,i){if(ops[i])d.open=true});var t=document.getElementById('ptext');if(t&&tv){t.value=tv;if(tf)t.focus()}last=Date.now()}).catch(function(){}).then(function(){busy=false;paint()})}function post(u,b){return fetch(u,{method:'POST',headers:H,body:JSON.stringify(b)}).then(function(r){if(r.status===401){location.reload();throw 0}return r.json()})}live.addEventListener('click',function(ev){var t=ev.target;if(!t||t.tagName!=='BUTTON')return;var box=t.closest('.acts');if(t.id==='pask'||t.id==='ptask'){var ta=document.getElementById('ptext'),m=document.getElementById('pmsg');if(!ta.value.trim())return;var mode=t.id==='pask'?'ask':'task';t.disabled=true;m.textContent=mode==='ask'?'asking...':'queuing...';post('/api/owner/prompt',{text:ta.value,mode:mode}).then(function(j){m.textContent=j.ok?'':(j.error||'failed');if(j.ok||j.status==='failed'){if(j.ok)ta.value=''}tick(true)}).catch(function(){}).then(function(){t.disabled=false});return}if(t.dataset.oid){if(!confirm((t.dataset.act==='ratify'?'Ratify':'Reject')+' this objective revision?'))return;t.disabled=true;post('/api/owner/objective',{id:Number(t.dataset.oid),decision:t.dataset.act}).then(function(j){if(!j.ok)alert(j.error||'failed');tick(true)}).catch(function(){t.disabled=false});return}if(!box||!t.dataset.act)return;var body={key:box.dataset.key,kind:t.dataset.act};if(t.dataset.act==='snooze')body.days=Number(t.dataset.days);if(t.dataset.act==='note'){var n=prompt('Note to the fleet (kept with this item):');if(!n)return;body.note=n}if(t.dataset.act==='done'&&!confirm('Mark this as done?'))return;t.disabled=true;post('/api/owner/respond',body).then(function(j){if(!j.ok)alert(j.error||'failed');tick(true)}).catch(function(){t.disabled=false})});var so=document.getElementById('so');if(so)so.addEventListener('click',function(ev){ev.preventDefault();post('/api/owner/logout',{}).then(function(){location.reload()})});setInterval(tick,10000);setInterval(paint,1000);document.addEventListener('visibilitychange',function(){if(!document.hidden)tick()})})();</script></body></html>");
  return o.join("");
}
// OWNER-RESPOND-1 (2026-10-01): respond to the fleet from the dashboard itself, and start/track server-side prompts.
//
// What existed before: no web page for this in this repo. ai.qnfo.org (research chat) and personal.qnfo.org (personal
// twin) are separate key-gated playgrounds; ops.qnfo.org is API-only (POST /v1/jobs, driven from DeepChat/ChatBox).
// This puts the owner's side of that into the one page.
//
// Access: the dashboard was public. Responding needs identity, so it is owner-gated by ONE secret, OWNER_TOKEN
// (>= 24 chars, set by the owner in the Worker's settings; no agent session can or should mint it). Until it is set the
// page stays exactly as it was and shows a card asking for it. Once set:
//   - the page and the human/decision JSON show a locked shell (verdict only) to anyone without the owner cookie;
//   - POST /api/owner/login {token} sets an HttpOnly, Secure, SameSite=Strict cookie holding sha256(token);
//   - every write needs that cookie plus the custom header x-fleet-ui: 1 (preflight blocks cross-origin forms);
//   - login attempts are throttled (10 failures / 10 min).
// What a response does (all inside this worker's own D1 rows; no credential is copied anywhere):
//   done / dismiss  resolve or dismiss a queue item (human_actions); evidence = "owner via dashboard"
//   snooze          hide any item for 1-90 days (human_responses); derived items return if still true afterwards
//   note            a note on any item, kept in human_responses and shown on the page and in /api/human
//   Ask now         runs the prompt through qnfo-ai over the dashboard's service binding (authenticated by binding
//                   props, no key), grounded in the current queue + decision, no tools, daily-capped
//   Queue as task   inserts a pending task into the intents table the intent-orchestrator already triages
var OWNER_COOKIE = "fleet_owner";
var OWNER_TOKEN_MIN = 24;
var OWNER_PROMPT_CAP_DEFAULT = 20;
var OWNER_LOGIN_MAX_FAILS = 10;
var OWNER_LOGIN_WINDOW_MS = 10 * 60 * 1e3;
var ASK_MODELS = ["glm-5.3-flash", "glm-5.2"];
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(d)).map(function(b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}
function constEq(a, b) {
  a = String(a);
  b = String(b);
  let r = a.length === b.length ? 0 : 1;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) r |= (a.charCodeAt(i % (a.length || 1)) ^ b.charCodeAt(i % (b.length || 1))) | 0;
  return r === 0;
}
async function ownerState(request, env) {
  const tok = env && env.OWNER_TOKEN ? String(env.OWNER_TOKEN) : "";
  const configured = tok.length >= OWNER_TOKEN_MIN;
  if (!configured) return { configured: false, tooShort: tok.length > 0, authed: false };
  const want = await sha256hex(tok);
  const m = /(?:^|;\s*)fleet_owner=([0-9a-f]{64})/.exec(request.headers.get("Cookie") || "");
  return { configured: true, tooShort: false, authed: !!m && constEq(m[1], want), hash: want };
}
function ownerJson(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, extraHeaders || {}) });
}
async function ensureOwnerTables(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS human_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, kind TEXT NOT NULL, note TEXT, until TEXT, ts TEXT DEFAULT (datetime('now')))").run();
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS owner_prompts (id TEXT PRIMARY KEY, ts TEXT DEFAULT (datetime('now')), mode TEXT, prompt TEXT, status TEXT, response TEXT, model TEXT, intent_id TEXT, error TEXT)").run();
}
async function ownerLoginThrottled(env) {
  try {
    const meta = await loopMetaGet(env);
    const rec = meta.owner_login_fail ? JSON.parse(meta.owner_login_fail) : null;
    return !!(rec && Date.now() - rec.t < OWNER_LOGIN_WINDOW_MS && rec.n >= OWNER_LOGIN_MAX_FAILS);
  } catch (e) {
    return false;
  }
}
async function ownerLoginFailed(env) {
  try {
    const meta = await loopMetaGet(env);
    const rec = meta.owner_login_fail ? JSON.parse(meta.owner_login_fail) : null;
    const fresh = rec && Date.now() - rec.t < OWNER_LOGIN_WINDOW_MS;
    await loopMetaSet(env, "owner_login_fail", JSON.stringify({ n: fresh ? rec.n + 1 : 1, t: fresh ? rec.t : Date.now() }));
  } catch (e) {
  }
}
// Snoozes hide an item; they never change its source, so a derived item that is still true returns afterwards.
async function activeSnoozes(env) {
  const out = {};
  try {
    await ensureOwnerTables(env);
    const rows = await d1all(env.AUDIT, "SELECT key, MAX(until) AS until FROM human_responses WHERE kind='snooze' AND until > ? GROUP BY key", [new Date().toISOString()]);
    for (const r of rows) out[r.key] = r.until;
  } catch (e) {
  }
  return out;
}
async function ownerPromptsView(env) {
  try {
    await ensureOwnerTables(env);
    const rows = await d1all(env.AUDIT, "SELECT p.id, p.ts, p.mode, p.prompt, p.status, p.response, p.model, p.error, i.status AS intent_status, i.triage_decision FROM owner_prompts p LEFT JOIN intents i ON i.id = p.intent_id ORDER BY p.ts DESC LIMIT 6");
    return rows;
  } catch (e) {
    return [];
  }
}
async function recentResponses(env) {
  try {
    await ensureOwnerTables(env);
    return await d1all(env.AUDIT, "SELECT key, kind, note, until, ts FROM human_responses ORDER BY id DESC LIMIT 8");
  } catch (e) {
    return [];
  }
}
function askContext(v) {
  const c = { queue: (v.items || []).slice(0, 12).map(function(i) {
    return { title: i.title, why: i.why, due: i.due || null, source: i.source };
  }), upcoming: (v.upcoming || []).map(function(i) {
    return { title: i.title, due: i.due };
  }), decision: { verdict: v.decision.verdict, risk: v.decision.risk, headline: v.decision.headline, reasons: v.decision.reasons, flips: v.decision.flips }, system: { verdict: v.system.verdict, errors: v.system.errors, warnings: v.system.warnings, probes: v.system.probes_ok + "/" + v.system.probes_total } };
  if (v.business) c.business = { spend30_unified: v.business.cost.spend30, cap: v.business.cost.cap, subscribers: v.business.ret.subs_confirmed, pageviews30: v.business.ret.pageviews30, autonomy: v.business.autonomy };
  return JSON.stringify(c).slice(0, 6e3);
}
async function runAsk(env, text, v) {
  const sys = "You are the fleet's assistant answering its owner inside the fleet dashboard. Answer briefly and concretely from CONTEXT only; if the answer is not in CONTEXT say so. You cannot take actions or call tools: if the owner wants something done, tell them to use 'Queue as task'. Never invent numbers.\nCONTEXT: " + askContext(v);
  let lastErr = "no model";
  for (const model of ASK_MODELS) {
    try {
      const r = await Promise.race([env.SVC_QNFO_AI.fetch("https://ai.qnfo.org/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "system", content: sys }, { role: "user", content: text }], max_tokens: 700 }) }), new Promise(function(_res, rej) {
        setTimeout(function() {
          rej(new Error("timeout 25s"));
        }, 25e3);
      })]);
      const j = await r.json().catch(function() {
        return null;
      });
      const content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (r.ok && content && String(content).trim()) return { ok: true, text: String(content).trim().slice(0, 4e3), model };
      lastErr = model + ": http " + r.status + " " + squash(JSON.stringify(j && j.error || j || "")).slice(0, 100);
    } catch (e) {
      lastErr = model + ": " + String(e && e.message || e).slice(0, 100);
    }
  }
  return { ok: false, error: lastErr };
}
// Returns a Response for /api/owner/* paths, or null when the path is not an owner path.
async function ownerRoutes(request, env, ctx, path, owner) {
  if (path.indexOf("/api/owner/") !== 0) return null;
  if (request.method !== "POST" && request.method !== "GET") return ownerJson({ error: "method" }, 405);
  if (!owner.configured) return ownerJson({ error: owner.tooShort ? "OWNER_TOKEN is shorter than " + OWNER_TOKEN_MIN + " characters" : "OWNER_TOKEN is not set" }, 503);
  if (path === "/api/owner/login" && request.method === "POST") {
    if (await ownerLoginThrottled(env)) return ownerJson({ error: "too many attempts; wait 10 minutes" }, 429);
    let b = null;
    try {
      b = await request.json();
    } catch (e) {
    }
    const ok = b && typeof b.token === "string" && constEq(await sha256hex(b.token), owner.hash);
    if (!ok) {
      await ownerLoginFailed(env);
      return ownerJson({ error: "wrong key" }, 401);
    }
    return ownerJson({ ok: true }, 200, { "Set-Cookie": OWNER_COOKIE + "=" + owner.hash + "; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict" });
  }
  if (path === "/api/owner/logout" && request.method === "POST") return ownerJson({ ok: true }, 200, { "Set-Cookie": OWNER_COOKIE + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict" });
  if (!owner.authed) return ownerJson({ error: "sign in" }, 401);
  if (request.method === "POST" && request.headers.get("x-fleet-ui") !== "1") return ownerJson({ error: "missing x-fleet-ui header" }, 400);
  await ensureOwnerTables(env);
  if (path === "/api/owner/prompts" && request.method === "GET") return ownerJson({ prompts: await ownerPromptsView(env), responses: await recentResponses(env) });
  let b = null;
  try {
    b = await request.json();
  } catch (e) {
    return ownerJson({ error: "invalid JSON" }, 400);
  }
  if (path === "/api/owner/respond") {
    const key = String(b && b.key || "");
    const kind = String(b && b.kind || "");
    const note = String(b && b.note || "").trim().slice(0, 500);
    if (!/^[A-Za-z0-9:._-]{3,160}$/.test(key)) return ownerJson({ error: "bad key" }, 400);
    if (["done", "dismiss", "snooze", "note"].indexOf(kind) < 0) return ownerJson({ error: "kind must be done|dismiss|snooze|note" }, 400);
    if (kind === "note" && !note) return ownerJson({ error: "note text required" }, 400);
    let until = null;
    if (kind === "snooze") {
      const days = Math.max(1, Math.min(90, Math.round(Number(b.days) || 0)));
      if (!(Number(b.days) >= 1)) return ownerJson({ error: "days 1-90 required" }, 400);
      until = new Date(Date.now() + days * DAY_MS).toISOString();
    }
    if (kind === "done" || kind === "dismiss") {
      if (key.indexOf("ha:") !== 0) return ownerJson({ error: "only queue items can be marked " + kind + "; derived items clear when their source clears (snooze them instead)" }, 400);
      const slug = key.slice(3);
      const st = kind === "done" ? "resolved" : "dismissed";
      const r = await env.AUDIT.prepare("UPDATE human_actions SET status=?1, resolved_at=datetime('now'), updated_at=datetime('now'), resolution=?2 WHERE slug=?3 AND status='open'").bind(st, "owner " + kind + " via dashboard" + (note ? ": " + note : ""), slug).run();
      if (!(r.meta && r.meta.changes)) return ownerJson({ error: "no open queue item " + slug }, 404);
    }
    await env.AUDIT.prepare("INSERT INTO human_responses (key, kind, note, until) VALUES (?1,?2,?3,?4)").bind(key, kind, note || null, until).run();
    return ownerJson({ ok: true, key, kind, until });
  }
  if (path === "/api/owner/objective") {
    const id = Number(b && b.id);
    const decision = String(b && b.decision || "");
    if (!Number.isInteger(id) || id < 1) return ownerJson({ error: "bad id" }, 400);
    if (decision !== "ratify" && decision !== "reject") return ownerJson({ error: "decision must be ratify|reject" }, 400);
    const r = await env.AUDIT.prepare("UPDATE goals SET status=?1, updated_at=datetime('now') WHERE id=?2 AND goal_type='objective-revision' AND status='proposed'").bind(decision === "ratify" ? "ratified" : "rejected", id).run();
    if (!(r.meta && r.meta.changes)) return ownerJson({ error: "no proposed objective revision " + id }, 404);
    await env.AUDIT.prepare("INSERT INTO human_responses (key, kind, note) VALUES (?1,?2,?3)").bind("goals:objective-revision:" + id, decision, String(b && b.note || "").slice(0, 500) || null).run();
    return ownerJson({ ok: true, id, status: decision === "ratify" ? "ratified" : "rejected" });
  }
  if (path === "/api/owner/prompt") {
    const text = String(b && b.text || "").trim();
    const mode = String(b && b.mode || "");
    if (text.length < 3 || text.length > 2e3) return ownerJson({ error: "prompt must be 3-2000 characters" }, 400);
    if (mode !== "ask" && mode !== "task") return ownerJson({ error: "mode must be ask|task" }, 400);
    const cap = Math.max(1, Math.min(200, parseInt(env.OWNER_PROMPTS_DAILY_CAP || OWNER_PROMPT_CAP_DEFAULT, 10) || OWNER_PROMPT_CAP_DEFAULT));
    const today = new Date().toISOString().slice(0, 10);
    const cnt = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM owner_prompts WHERE ts >= ?", [today]);
    if (cnt.length && Number(cnt[0].n) >= cap) return ownerJson({ error: "daily prompt cap reached (" + cap + ")" }, 429);
    const id = "op-" + Date.now().toString(36) + Math.random().toString(16).slice(2, 6);
    if (mode === "task") {
      const iid = "int-" + Math.random().toString(16).slice(2, 10) + Date.now().toString(36);
      const dup = await d1all(env.AUDIT, "SELECT id FROM intents WHERE desire = ? AND status NOT IN ('rejected','deduped') LIMIT 1", [text]);
      const intentId = dup.length ? dup[0].id : iid;
      if (!dup.length) await env.AUDIT.prepare("INSERT INTO intents (id, desire, source, device, type, domain, priority, summary, due, status, wbs_code, created_at, processed_at) VALUES (?1,?2,'fleet-dashboard','owner-dashboard','task','general','high',?3,NULL,'pending',NULL,?4,NULL)").bind(iid, text, text.slice(0, 120), new Date().toISOString()).run();
      await env.AUDIT.prepare("INSERT INTO owner_prompts (id, mode, prompt, status, intent_id) VALUES (?1,'task',?2,'queued',?3)").bind(id, text, intentId).run();
      return ownerJson({ ok: true, id, status: "queued", intent_id: intentId, duplicate: !!dup.length });
    }
    await env.AUDIT.prepare("INSERT INTO owner_prompts (id, mode, prompt, status) VALUES (?1,'ask',?2,'running')").bind(id, text).run();
    const st = await currentState(env, ctx, 5 * 6e4);
    const v = await humanView(env, st, null);
    const ans = await runAsk(env, text, v);
    if (ans.ok) await env.AUDIT.prepare("UPDATE owner_prompts SET status='answered', response=?1, model=?2 WHERE id=?3").bind(ans.text, ans.model, id).run();
    else await env.AUDIT.prepare("UPDATE owner_prompts SET status='failed', error=?1 WHERE id=?2").bind(ans.error, id).run();
    return ownerJson({ ok: ans.ok, id, status: ans.ok ? "answered" : "failed", error: ans.error || null });
  }
  return ownerJson({ error: "not found" }, 404);
}
// Shown to anyone without the owner cookie once OWNER_TOKEN is set: no queue, no money, no decision detail.
function lockedHtml() {
  const o = [];
  o.push('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fleet</title><style>');
  o.push(":root{--bg:#f6f7f9;--card:#fff;--ink:#14171c;--mute:#5b6472;--line:#e2e5ea;--link:#0b5cd5;--act:#b42318}@media(prefers-color-scheme:dark){:root{--bg:#0e1116;--card:#171b22;--ink:#e8eaee;--mute:#9aa3b1;--line:#2a303a;--link:#7db1ff;--act:#ff8a80}}");
  o.push("*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}main{max-width:420px;margin:12vh auto;padding:0 16px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px}h1{font-size:20px;margin:0 0 6px}p{color:var(--mute);margin:0 0 14px;font-size:14px}input{width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font-size:16px}button{margin-top:10px;padding:10px 16px;border:0;border-radius:8px;background:var(--link);color:#fff;font-weight:600;font-size:15px;cursor:pointer}#e{color:var(--act);font-size:13px;margin-top:8px;min-height:18px}");
  o.push('</style></head><body><main><div class="card"><h1>Fleet</h1><p>This dashboard is private. Enter the owner key to continue.</p><form id="f"><input id="k" type="password" autocomplete="current-password" placeholder="Owner key" autofocus><button>Sign in</button></form><div id="e"></div></div></main>');
  o.push("<script>document.getElementById('f').addEventListener('submit',function(ev){ev.preventDefault();var e=document.getElementById('e');e.textContent='';fetch('/api/owner/login',{method:'POST',headers:{'Content-Type':'application/json','x-fleet-ui':'1'},body:JSON.stringify({token:document.getElementById('k').value})}).then(function(r){return r.json().then(function(j){return{r:r,j:j}})}).then(function(x){if(x.r.ok)location.reload();else e.textContent=x.j.error||'failed'}).catch(function(){e.textContent='network error'})})</script></body></html>");
  return o.join("");
}
// PORTFOLIO-DAILY-1 (2026-10-01, docs/PORTFOLIO-OPERATIONS.md s2, owner directive "never claude.ai"): the deterministic
// duties of the retired claude.ai portfolio routine, run by this worker's cron on Cloudflare. Once per UTC day after
// 05:00Z (after the 02:00Z reach ingest), throttled on cloud_ops_events row portfolio-daily-<day>:
//   1. OWNER-VOICE-GUARD-1 (STRATEGY s5): Bluesky posts of the last 24h (mojibake, a q08.org link) and the 7-day cadence
//      cap; outreach_log of the last 24h (a fake "Re:" follow-up, more than 8 sends). A violation sets the stream's kill
//      switch (qnfo-audit pipeline_flags.social_paused='1'; qnfo-outreach pipeline_state.external_sends_enabled='0') and
//      files one deduped agent_issues row. The guard only ever pauses; it never re-enables a stream.
//   2. One qnfo-audit.portfolio_runs row: the reach scorecard + Bluesky followers + confirmed subscribers + open STRATEGY
//      issues; needs_owner is read from qnfo-audit.human_actions (the single owner queue shown at "/").
//   3. Mondays kind='weekly-cron', the 1st kind='monthly-cron', with KPI deltas vs the rows 7 and 28 days earlier.
// FAIL-SOFT, NEVER FABRICATED: a source that cannot be read is null in the row and named in `skipped`.
var PORTFOLIO_AFTER_UTC_HOUR = 5;
var PORTFOLIO_MAX_ATTEMPTS = 3;
var PORTFOLIO_RUNNING_STALE_MS = 10 * 60 * 1e3;
var PORTFOLIO_BSKY_ACTOR = "qnfo.bsky.social";
var PORTFOLIO_BSKY_API = "https://public.api.bsky.app/xrpc/";
var PORTFOLIO_OUTREACH_DAILY_MAX = 8;
// Posts before this instant predate the q08 queue gate (q08-signal-engine 0.7.36) and the qnfo-social weekly cap; they
// are history, not a live violation, so the guard ignores them (env PORTFOLIO_GUARD_SINCE overrides).
var PORTFOLIO_GUARD_SINCE = "2026-10-01T05:00:00Z";
var PORTFOLIO_STRATEGY_SOURCE = "claude-code-session:STRATEGY-1";
var OWNER_GUARD_SOURCE = "qnfo-fleet-dashboard:portfolio-guard";
var OWNER_GUARD_TAG = "OWNER-VOICE-GUARD-1";
var PORTFOLIO_DDL = [
  "CREATE TABLE IF NOT EXISTS pipeline_flags (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS portfolio_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_date TEXT, kind TEXT, session TEXT, summary TEXT, scorecard_json TEXT, actions_json TEXT, needs_owner TEXT, created_at TEXT DEFAULT (datetime('now')))"
];
// STRATEGY s5 gate 3: U+00C3, U+00E2 followed by a C1 control (U+0080-U+009F), or U+00E2 U+20AC (UTF-8 read as cp1252).
function portfolioMojibake(s) {
  return /\u00c3|\u00e2[\u0080-\u009f]|\u00e2\u20ac/.test(String(s || ""));
}
function portfolioQ08Link(s) {
  return /(^|[^a-z0-9-])q08\.org(?![a-z0-9-])/i.test(String(s || ""));
}
function portfolioWeeklyCap(env) {
  const n = parseInt(String(env && env.SOCIAL_WEEKLY_CAP != null ? env.SOCIAL_WEEKLY_CAP : ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}
// Every URI a post carries: text, link facets, external embed (also inside recordWithMedia).
function portfolioPostUris(post) {
  const rec = post && post.record || {};
  const u = [];
  for (const f of rec.facets || []) for (const ft of f && f.features || []) if (ft && ft.uri) u.push(String(ft.uri));
  const em = rec.embed || {};
  if (em.external && em.external.uri) u.push(String(em.external.uri));
  if (em.media && em.media.external && em.media.external.uri) u.push(String(em.media.external.uri));
  return u;
}
// Pure check over a getAuthorFeed `feed` array. Reposts (item.reason) and other authors' posts are not the owner's text.
function portfolioCheckBluesky(feed, nowMs, cap, sinceMs) {
  const res = { feed_items: 0, posts_24h: 0, posts_7d: 0, cap, violations: [] };
  for (const item of Array.isArray(feed) ? feed : []) {
    res.feed_items++;
    if (!item || item.reason) continue;
    const post = item.post || {};
    const handle = post.author && post.author.handle;
    if (handle && String(handle).toLowerCase() !== PORTFOLIO_BSKY_ACTOR) continue;
    const rec = post.record || {};
    const t = Date.parse(rec.createdAt || post.indexedAt || "");
    if (!Number.isFinite(t)) continue;
    if (Number.isFinite(sinceMs) && t < sinceMs) continue;
    const age = nowMs - t;
    if (age > 7 * DAY_MS) continue;
    res.posts_7d++;
    if (age > DAY_MS) continue;
    res.posts_24h++;
    const text = String(rec.text || "");
    const ev = { stream: "bluesky", uri: post.uri || null, created_at: rec.createdAt || null, sample: text.slice(0, 120) };
    if (portfolioMojibake(text)) res.violations.push(Object.assign({ rule: "mojibake" }, ev));
    if (portfolioQ08Link(text) || portfolioPostUris(post).some(portfolioQ08Link)) res.violations.push(Object.assign({ rule: "q08-link" }, ev));
  }
  if (res.posts_7d > cap) res.violations.push({ stream: "bluesky", rule: "cadence", posts_7d: res.posts_7d, cap });
  return res;
}
async function portfolioFetchJson(url) {
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": NAME + "/" + VERSION }, signal: AbortSignal.timeout(15e3) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return await r.json();
}
async function ownerVoiceGuard(env, nowMs) {
  const g = { checked: { bluesky: null, outreach: null }, violations: [], actions: [], skipped: [], notes: [] };
  try {
    const j = await portfolioFetchJson(PORTFOLIO_BSKY_API + "app.bsky.feed.getAuthorFeed?actor=" + PORTFOLIO_BSKY_ACTOR + "&limit=30&filter=posts_no_replies");
    if (!j || !Array.isArray(j.feed)) throw new Error("no feed array");
    const b = portfolioCheckBluesky(j.feed, nowMs, portfolioWeeklyCap(env), Date.parse(env.PORTFOLIO_GUARD_SINCE || PORTFOLIO_GUARD_SINCE));
    g.checked.bluesky = { feed_items: b.feed_items, posts_24h: b.posts_24h, posts_7d: b.posts_7d, cap: b.cap };
    if (b.feed_items >= 30 && b.posts_7d >= 30) g.notes.push("bluesky: 30-item page, posts_7d is a lower bound");
    g.violations = g.violations.concat(b.violations);
  } catch (e) {
    g.skipped.push("bluesky: " + reachErr(e));
  }
  try {
    const since = new Date(nowMs - DAY_MS).toISOString().slice(0, 19).replace("T", " ");
    const o = await d1all(env.AUDIT, "SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'followup' AND LTRIM(COALESCE(subject, '')) LIKE 'Re:%' THEN 1 ELSE 0 END) AS fake_re FROM outreach_log WHERE datetime(sent_at) >= datetime(?)", [since]);
    const fake = o.length ? Number(o[0].fake_re) || 0 : 0;
    // The cap is 8 per UTC day (STRATEGY s5), so count yesterday and today separately, not a rolling 24h.
    const d0 = new Date(nowMs - DAY_MS).toISOString().slice(0, 10);
    const pd = await d1all(env.AUDIT, "SELECT date(sent_at) AS d, COUNT(*) AS n FROM outreach_log WHERE date(sent_at) >= ? GROUP BY date(sent_at)", [d0]);
    let n = 0;
    for (const r of pd) n = Math.max(n, Number(r.n) || 0);
    g.checked.outreach = { max_sends_per_utc_day: n, fake_re_followups_24h: fake, max: PORTFOLIO_OUTREACH_DAILY_MAX };
    g.notes.push("outreach: opt-out line not checked (outreach_log has no body column)");
    if (fake > 0) g.violations.push({ stream: "outreach", rule: "re-followup", count: fake });
    if (n > PORTFOLIO_OUTREACH_DAILY_MAX) g.violations.push({ stream: "outreach", rule: "daily-cap", count: n, max: PORTFOLIO_OUTREACH_DAILY_MAX });
  } catch (e) {
    g.skipped.push("outreach_log: " + reachErr(e));
  }
  if (!g.violations.length) return g;
  const iso = new Date(nowMs).toISOString();
  const streams = {};
  for (const v of g.violations) streams[v.stream] = true;
  if (streams.bluesky) {
    try {
      await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS pipeline_flags (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)").run();
      await env.AUDIT.prepare("INSERT INTO pipeline_flags (key, value, updated_at) VALUES ('social_paused', '1', ?) ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at").bind(iso).run();
      g.actions.push("set qnfo-audit pipeline_flags.social_paused=1");
    } catch (e) {
      g.skipped.push("social kill switch: " + reachErr(e));
    }
  }
  if (streams.outreach) {
    if (env.OUTREACH) {
      try {
        await env.OUTREACH.prepare("INSERT INTO pipeline_state (key, value, updated_at) VALUES ('external_sends_enabled', '0', ?) ON CONFLICT(key) DO UPDATE SET value = '0', updated_at = excluded.updated_at").bind(iso).run();
        g.actions.push("set qnfo-outreach pipeline_state.external_sends_enabled=0");
      } catch (e) {
        g.skipped.push("email kill switch: " + reachErr(e));
      }
    } else g.notes.push("email kill switch: OUTREACH binding absent, flagged only");
  }
  const names = Object.keys(streams).sort();
  const title = OWNER_GUARD_TAG + ": owner-voice gate violation (" + names.join("+") + ")";
  const desc = "AUTO-FILED by " + NAME + " v" + VERSION + " portfolio guard (docs/STRATEGY.md s5) at " + iso + ". Violations: " + JSON.stringify(g.violations).slice(0, 2500) + " Actions: " + (g.actions.join("; ") || "none") + ". Re-enable a stream only after the cause is fixed (the guard never re-enables). Close with evidence in issue_triage.close_evidence.";
  try {
    const r = await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) SELECT ?1, ?2, ?3, 'outreach', 'high', 'open', ?4, ?4 WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = ?1 AND status = 'open')").bind(title, desc, OWNER_GUARD_SOURCE, iso).run();
    const ch = r && r.meta && r.meta.changes || 0;
    g.actions.push(ch ? "filed agent_issue '" + title + "'" : "agent_issue '" + title + "' already open");
  } catch (e) {
    g.skipped.push("agent_issues: " + reachErr(e));
  }
  return g;
}
// One owner list (OWNER-RESPOND-1): the queue the dashboard shows at "/" is human_actions, so the portfolio run and the
// /owner page read it instead of seeding a second list.
async function portfolioOwnerActions(env, iso) {
  await ensureHumanTable(env);
  return d1all(env.AUDIT, "SELECT id, title AS action, due, status FROM human_actions WHERE status = 'open' ORDER BY CASE WHEN due IS NULL OR due = '' THEN 1 ELSE 0 END, due, id");
}
function portfolioSum(rows, metric) {
  if (!Array.isArray(rows)) return null;
  let v = null;
  for (const r of rows) if (r && r.metric === metric && r.v != null) v = (v || 0) + Number(r.v);
  return v;
}
// Flat numeric KPIs, the basis of the weekly/monthly deltas. null = not measured.
function portfolioKpis(sc, extra) {
  const w = sc && sc.windows || {};
  const pv = function(x) {
    return x && x.pageviews && x.pageviews.value != null ? Number(x.pageviews.value) : null;
  };
  return {
    pageviews_7d: pv(w.d7),
    pageviews_28d: pv(w.d28),
    outreach_sent_7d: portfolioSum(w.d7 && w.d7.outreach, "sent"),
    outreach_sent_28d: portfolioSum(w.d28 && w.d28.outreach, "sent"),
    outreach_replied_28d: portfolioSum(w.d28 && w.d28.outreach, "replied"),
    bluesky_followers: extra.bluesky_followers,
    confirmed_subscribers_qnfo: extra.confirmed_subscribers.qnfo,
    open_strategy_issues: extra.open_strategy_issues
  };
}
function portfolioDeltas(cur, prevRow) {
  if (!prevRow) return null;
  let pk = null;
  try {
    pk = (JSON.parse(prevRow.scorecard_json || "{}") || {}).kpis || null;
  } catch (e) {
  }
  const d = { vs_run_date: String(prevRow.run_date || "").slice(0, 10) };
  for (const k of Object.keys(cur)) {
    const a = cur[k], b = pk ? pk[k] : null;
    d[k] = typeof a === "number" && typeof b === "number" ? a - b : null;
  }
  return d;
}
async function portfolioDailyRun(env, opts) {
  opts = opts || {};
  const nowMs = opts.nowMs || Date.now();
  const now = new Date(nowMs);
  const day = now.toISOString().slice(0, 10);
  const iso = now.toISOString();
  if (!env || !env.AUDIT) return { skipped: "AUDIT binding absent" };
  if (now.getUTCHours() < PORTFOLIO_AFTER_UTC_HOUR) return { not_yet: "runs after 05:00Z" };
  const evId = "portfolio-daily-" + day;
  const out = { day, version: VERSION, attempts: 1, kind: null, skipped: [], notes: [] };
  // Throttle. An unreadable throttle row means no run: a blind run every 15 min would append duplicate rows.
  try {
    const prev = await d1all(env.AUDIT, "SELECT ts, status, meta FROM cloud_ops_events WHERE id = ?", [evId]);
    if (prev.length) {
      let pm = {};
      try {
        pm = JSON.parse(prev[0].meta || "{}") || {};
      } catch (e) {
      }
      const att = Number(pm.attempts) || 1;
      if (prev[0].status === "ok") return { throttled: day };
      if (prev[0].status === "running" && nowMs - Date.parse(prev[0].ts) < PORTFOLIO_RUNNING_STALE_MS) return { in_progress: day };
      if (att >= PORTFOLIO_MAX_ATTEMPTS) return { gave_up: day, attempts: att };
      out.attempts = att + 1;
    }
  } catch (e) {
    return { error: "throttle unreadable: " + reachErr(e) };
  }
  const record = async function(status, text) {
    try {
      await env.AUDIT.prepare("INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, 'portfolio-daily', ?, ?, ?, ?)").bind(evId, iso, text, JSON.stringify(out).slice(0, 4e3), NAME, status).run();
    } catch (e) {
    }
  };
  await record("running", "portfolio daily " + day + " started");
  for (const s of PORTFOLIO_DDL) {
    try {
      await env.AUDIT.prepare(s).run();
    } catch (e) {
      out.skipped.push("ddl: " + reachErr(e));
    }
  }
  // 1. Guard first: protect the owner's name before anything is measured.
  let guard = null;
  try {
    guard = await ownerVoiceGuard(env, nowMs);
  } catch (e) {
    out.skipped.push("guard: " + reachErr(e));
  }
  if (guard) out.skipped = out.skipped.concat(guard.skipped.map(function(s) {
    return "guard " + s;
  }));
  // 2. Measure. Each source is independent; a failure is null + a skipped reason.
  let sc = null;
  try {
    sc = await reachScorecardData(env, nowMs);
  } catch (e) {
    out.skipped.push("reach scorecard: " + reachErr(e));
  }
  let followers = null;
  try {
    const p = await portfolioFetchJson(PORTFOLIO_BSKY_API + "app.bsky.actor.getProfile?actor=" + PORTFOLIO_BSKY_ACTOR);
    if (p && typeof p.followersCount === "number") followers = p.followersCount;
    else out.skipped.push("bluesky followers: followersCount missing");
  } catch (e) {
    out.skipped.push("bluesky followers: " + reachErr(e));
  }
  const subs = { qnfo: null, q08: null };
  try {
    const s = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM subscribers WHERE status = 'subscribed'");
    if (s.length && s[0].n != null) subs.qnfo = Number(s[0].n);
    else out.skipped.push("subscribers qnfo: no count");
  } catch (e) {
    out.skipped.push("subscribers qnfo: " + reachErr(e));
  }
  out.skipped.push("subscribers q08: no binding to D1 q08-signal from this worker");
  let strat = null;
  try {
    const s = await d1all(env.AUDIT, "SELECT COUNT(*) AS n FROM agent_issues WHERE source = ? AND status = 'open'", [PORTFOLIO_STRATEGY_SOURCE]);
    if (s.length && s[0].n != null) strat = Number(s[0].n);
  } catch (e) {
    out.skipped.push("strategy issues: " + reachErr(e));
  }
  let needs = null;
  try {
    needs = (await portfolioOwnerActions(env, iso)).map(function(r) {
      return { id: r.id, action: r.action, due: r.due || null };
    });
  } catch (e) {
    out.skipped.push("human_actions: " + reachErr(e));
  }
  // 3. Kind and deltas.
  const kind = now.getUTCDate() === 1 ? "monthly-cron" : now.getUTCDay() === 1 ? "weekly-cron" : "daily-cron";
  out.kind = kind;
  const extra = { bluesky_followers: followers, confirmed_subscribers: subs, open_strategy_issues: strat };
  const kpis = portfolioKpis(sc, extra);
  let deltas = null;
  if (kind !== "daily-cron") {
    deltas = { d7: null, d28: null };
    for (const pair of [["d7", 7], ["d28", 28]]) {
      try {
        const r = await d1all(env.AUDIT, "SELECT run_date, scorecard_json FROM portfolio_runs WHERE substr(run_date, 1, 10) = ? ORDER BY rowid DESC LIMIT 1", [reachShiftDay(day, -pair[1])]);
        deltas[pair[0]] = portfolioDeltas(kpis, r[0] || null);
        if (!r.length) out.notes.push("deltas " + pair[0] + ": no row on " + reachShiftDay(day, -pair[1]));
      } catch (e) {
        out.skipped.push("deltas " + pair[0] + ": " + reachErr(e));
      }
    }
  }
  const violations = guard ? guard.violations : null;
  const scorecard = { schema: "portfolio-scorecard/v1", version: VERSION, generated_at: iso, kpis, deltas, reach: sc, bluesky_followers: followers, confirmed_subscribers: subs, open_strategy_issues: strat, guard: guard ? { checked: guard.checked, violations: guard.violations, notes: guard.notes } : null, skipped: out.skipped };
  const actions = { guard: guard ? guard.actions : null, notes: out.notes };
  const fmt = function(v) {
    return v == null ? "null" : String(v);
  };
  const summary = kind + " " + day + ": guard " + (violations == null ? "not run" : violations.length ? violations.length + " violation(s) [" + violations.map(function(v) {
    return v.stream + ":" + v.rule;
  }).join(", ") + "]" : "clean") + "; pageviews_7d=" + fmt(kpis.pageviews_7d) + "; bluesky_followers=" + fmt(followers) + "; subscribers_qnfo=" + fmt(subs.qnfo) + "; open_strategy_issues=" + fmt(strat) + "; owner actions open=" + (needs ? needs.length : "null") + (out.skipped.length ? "; skipped " + out.skipped.length : "");
  try {
    await env.AUDIT.prepare("INSERT INTO portfolio_runs (run_date, kind, session, summary, scorecard_json, actions_json, needs_owner) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(day, kind, NAME, summary, JSON.stringify(scorecard), JSON.stringify(actions), needs == null ? null : JSON.stringify(needs)).run();
  } catch (e) {
    out.skipped.push("portfolio_runs insert: " + reachErr(e));
    await record("error", "portfolio daily " + day + ": run row not written");
    return out;
  }
  out.summary = summary;
  out.violations = violations ? violations.length : null;
  await record("ok", summary.slice(0, 500));
  return out;
}
// OWNER-PAGE-1 (2026-10-01): the owner's private page. qnfo-audit.owner_docs holds personal data (email, EIN, career,
// job applications), so it is never public. personal-api (personal.qnfo.org, Bearer API_KEY) has no binding to
// qnfo-audit, so the page lives here behind the existing LOOP_TOKEN check; no new secret. The token is accepted as
// `Authorization: Bearer`, `x-loop-token`, or the password field of the page's own POST form (never a query string,
// never a cookie). Responses: no-store, noindex, CSP with no script source; markdown is rendered with every byte escaped.
function ownerEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function ownerSafeEq(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (!a || !b || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
function ownerSafeUrl(u) {
  const s = String(u || "").trim();
  if (/^#[A-Za-z0-9_-]*$/.test(s) || /^mailto:/i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return ownerOffHost(s) ? null : s;
  return null;
}
// NO-CLAUDE-RUNTIME-DEPENDENCY-1: an owner document never links out to claude.ai or anthropic.com (the text stays, the link
// does not), matching safeLink on the queue.
function ownerOffHost(u) {
  const m = /^https?:\/\/([^\/?#:]+)/i.exec(String(u || ""));
  return !!m && /(^|\.)(claude\.ai|claude\.site|claudeusercontent\.com|anthropic\.com)$/i.test(m[1]);
}
// Inline markdown: `code`, [text](url), <https://url>, **bold**, *em*, bare https:// links. Text is escaped piecewise.
function ownerInline(raw, depth) {
  const src = String(raw || "");
  const re = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|(https?:\/\/[^\s<>"'`)\]]+)/g;
  let o = "", last = 0, m;
  while ((m = re.exec(src)) !== null) {
    o += ownerEsc(src.slice(last, m.index));
    last = re.lastIndex;
    if (m[1] != null) o += "<code>" + ownerEsc(m[1]) + "</code>";
    else if (m[2] != null) {
      const href = ownerSafeUrl(m[3]);
      const label = (depth || 0) < 1 ? ownerInline(m[2], 1) : ownerEsc(m[2]);
      o += href ? '<a href="' + ownerEsc(href) + '" rel="noopener noreferrer nofollow">' + label + "</a>" : label;
    } else if (m[4] != null || m[7] != null) {
      const u = m[4] != null ? m[4] : m[7];
      o += ownerOffHost(u) ? ownerEsc(u) : '<a href="' + ownerEsc(u) + '" rel="noopener noreferrer nofollow">' + ownerEsc(u) + "</a>";
    } else if (m[5] != null) o += "<strong>" + ((depth || 0) < 1 ? ownerInline(m[5], 1) : ownerEsc(m[5])) + "</strong>";
    else if (m[6] != null) o += "<em>" + ownerEsc(m[6]) + "</em>";
  }
  return o + ownerEsc(src.slice(last));
}
function ownerTableCells(line) {
  let s = String(line).trim().replace(/\\\|/g, "\u0000");
  if (s.charAt(0) === "|") s = s.slice(1);
  if (s.charAt(s.length - 1) === "|") s = s.slice(0, -1);
  return s.split("|").map(function(c) {
    return c.replace(/\u0000/g, "|").trim();
  });
}
// Block markdown: headings, paragraphs, fenced code, hr, blockquotes (nested), pipe tables, ul/ol. Raw HTML in the
// source is text, never markup.
function ownerMarkdown(md, depth) {
  depth = depth || 0;
  const lines = String(md == null ? "" : md).replace(/\r\n?/g, "\n").split("\n");
  const o = [];
  let i = 0;
  const isSep = function(l) {
    return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || "") && String(l).indexOf("-") >= 0;
  };
  const listRe = /^\s*([-*+]|\d{1,3}[.)])\s+(.*)$/;
  const startsBlock = function(l, next) {
    return /^\s*$/.test(l) || /^#{1,6}\s/.test(l) || /^\s*```/.test(l) || /^\s*>/.test(l) || listRe.test(l) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(l) || /^\s*\|/.test(l) && isSep(next);
  };
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*$/.test(l)) {
      i++;
      continue;
    }
    if (/^\s*```/.test(l)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      o.push("<pre><code>" + ownerEsc(buf.join("\n")) + "</code></pre>");
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (h) {
      const n = Math.min(6, h[1].length + 1);
      o.push("<h" + n + ">" + ownerInline(h[2]) + "</h" + n + ">");
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      o.push("<hr>");
      i++;
      continue;
    }
    if (/^\s*>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      o.push("<blockquote>" + (depth < 3 ? ownerMarkdown(buf.join("\n"), depth + 1) : "<p>" + ownerInline(buf.join(" ")) + "</p>") + "</blockquote>");
      continue;
    }
    if (/^\s*\|/.test(l) && isSep(lines[i + 1])) {
      const head = ownerTableCells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(ownerTableCells(lines[i++]));
      o.push("<div class=tw><table><thead><tr>" + head.map(function(c) {
        return "<th>" + ownerInline(c) + "</th>";
      }).join("") + "</tr></thead><tbody>" + rows.map(function(r) {
        return "<tr>" + r.map(function(c) {
          return "<td>" + ownerInline(c) + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>");
      continue;
    }
    const lm = listRe.exec(l);
    if (lm) {
      const ordered = /\d/.test(lm[1]);
      const items = [];
      while (i < lines.length) {
        const m2 = listRe.exec(lines[i]);
        if (m2 && /\d/.test(m2[1]) === ordered) {
          items.push(m2[2]);
          i++;
        } else if (items.length && /^\s{2,}\S/.test(lines[i]) && !listRe.test(lines[i])) {
          items[items.length - 1] += " " + lines[i].trim();
          i++;
        } else break;
      }
      const tag = ordered ? "ol" : "ul";
      o.push("<" + tag + ">" + items.map(function(t) {
        return "<li>" + ownerInline(t) + "</li>";
      }).join("") + "</" + tag + ">");
      continue;
    }
    const buf = [l.trim()];
    i++;
    while (i < lines.length && !startsBlock(lines[i], lines[i + 1])) buf.push(lines[i++].trim());
    o.push("<p>" + ownerInline(buf.join(" ")) + "</p>");
  }
  return o.join("\n");
}
var OWNER_CSS = "body{font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:900px;margin:0 auto;padding:16px;line-height:1.5;color:#1a1a1a;background:#fff}a{color:#0b57d0}table{border-collapse:collapse;margin:8px 0;font-size:.9rem}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left;vertical-align:top}.tw{overflow-x:auto}blockquote{border-left:3px solid #ccc;margin:8px 0;padding:0 12px;color:#444}pre{background:#f2f2f2;padding:8px;overflow-x:auto}code{background:#f2f2f2;padding:0 3px}.mut{color:#666;font-size:.85rem}input,button{font-size:1rem;padding:6px 8px}@media (prefers-color-scheme:dark){body{background:#121212;color:#e8e8e8}a{color:#8ab4f8}th,td{border-color:#444}pre,code{background:#222}blockquote{color:#bbb;border-color:#555}.mut{color:#aaa}}";
function ownerHtml(title, inner, status) {
  const body = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>' + ownerEsc(title) + "</title><style>" + OWNER_CSS + "</style></head><body>" + inner + "</body></html>";
  return new Response(body, { status: status || 200, headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  } });
}
function ownerLogin(path, bad) {
  const r = ownerHtml("Owner sign-in", "<h1>Owner page</h1><p>Private. Enter the owner token (LOOP_TOKEN).</p>" + (bad ? "<p><strong>Token not accepted.</strong></p>" : "") + '<form method="post" action="' + ownerEsc(path) + '"><input type="password" name="token" autocomplete="current-password" required> <button type="submit">Open</button></form>', 401);
  r.headers.set("WWW-Authenticate", 'Bearer realm="owner"');
  return r;
}
// IDENTITY-STORE-1 (2026-10-01, NO-CLAUDE-RUNTIME-DEPENDENCY-1 / agent_issues 1723): the owner's documents (identity, CV,
// opportunities, archives, edit history) live in their own D1, qnfo-identity, bound ONLY to this worker (binding IDENTITY),
// not in the shared qnfo-audit that many workers and sessions read. On first use the worker copies every qnfo-audit.owner_docs
// row across, checks every body byte for byte, and records the move in qnfo-identity.store_meta; nothing reads the private
// store before that record exists, so an interrupted copy is simply redone (the shared copy wins until then). A failed read
// of qnfo-audit never records a move. Without the binding it falls back to qnfo-audit so nothing breaks mid-deploy.
var IDENTITY_STORE_READY = false;
function idsHistoryKey(key) {
  return String(key || "").indexOf("--v") >= 0;
}
async function identityStoreMigrate(env) {
  if (!env || !env.IDENTITY) return { store: "qnfo-audit (IDENTITY binding absent)" };
  const db = env.IDENTITY;
  if (IDENTITY_STORE_READY) {
    const m = await db.prepare("SELECT value, updated_at FROM store_meta WHERE key = 'migrated_from_audit'").first().catch(function() {
      return null;
    });
    if (m) return { store: "qnfo-identity", migrated: m.value, at: m.updated_at };
  }
  await db.prepare("CREATE TABLE IF NOT EXISTS owner_docs (key TEXT PRIMARY KEY, title TEXT NOT NULL, body_md TEXT NOT NULL, source TEXT, visibility TEXT NOT NULL DEFAULT 'private', updated_at TEXT DEFAULT (datetime('now')))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS store_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')))").run();
  const done = await db.prepare("SELECT value, updated_at FROM store_meta WHERE key = 'migrated_from_audit'").first();
  if (done) {
    IDENTITY_STORE_READY = true;
    return { store: "qnfo-identity", migrated: done.value, at: done.updated_at };
  }
  let rows;
  try {
    rows = (await env.AUDIT.prepare("SELECT key, title, body_md, source, visibility, updated_at FROM owner_docs").all()).results || [];
  } catch (e) {
    return { store: "qnfo-audit", error: "qnfo-audit.owner_docs unreadable (" + String(e && e.message || e).slice(0, 80) + "); retried on next use" };
  }
  for (const r of rows) {
    await db.prepare("INSERT OR REPLACE INTO owner_docs (key, title, body_md, source, visibility, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(r.key, r.title, r.body_md, r.source, idsHistoryKey(r.key) ? "history" : r.visibility || "private", r.updated_at).run();
  }
  const bad = [];
  for (const r of rows) {
    const c = await db.prepare("SELECT body_md FROM owner_docs WHERE key = ?1").bind(r.key).first();
    if (!c || c.body_md !== r.body_md) bad.push(r.key);
  }
  if (bad.length) return { store: "qnfo-audit", error: "copy differs for " + bad.join(", ") + "; retried on next use" };
  const summary = JSON.stringify({ rows: rows.length, keys: rows.map(function(r) {
    return r.key;
  }), bytes: rows.reduce(function(n, r) {
    return n + new TextEncoder().encode(r.body_md || "").length;
  }, 0), version: VERSION });
  await db.prepare("INSERT OR REPLACE INTO store_meta (key, value, updated_at) VALUES ('migrated_from_audit', ?1, datetime('now'))").bind(summary).run();
  await db.prepare("INSERT OR REPLACE INTO store_meta (key, value, updated_at) VALUES ('audit_seen', ?1, datetime('now'))").bind(JSON.stringify(await idsSeenMap(rows))).run();
  IDENTITY_STORE_READY = true;
  return { store: "qnfo-identity", migrated: summary };
}
__name(identityStoreMigrate, "identityStoreMigrate");
// IDENTITY-STORE-1 sync (1.12.1). The move copies; it never deletes the qnfo-audit rows (removing that shared copy is the
// owner's call). A session or worker still following the old rule may write qnfo-audit.owner_docs after the move, so each
// */15 tick looks for qnfo-audit rows that changed since the last tick (store_meta 'audit_seen', sha-256 of body and
// updated_at) and brings each one into the private store: a new key is copied; a different body and a newer updated_at
// becomes current with the replaced version kept as a '<key>--v<stamp>' history row; an older one is kept as history. Copy
// only: it never writes or deletes anything in qnfo-audit. Recorded in store_meta 'last_sync'.
async function idsSeenMap(rows) {
  const out = {};
  for (const r of rows) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(r.updated_at || "") + "\u0000" + String(r.body_md || "")));
    out[r.key] = Array.from(new Uint8Array(buf)).map(function(b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }
  return out;
}
__name(idsSeenMap, "idsSeenMap");
async function idsKeepVersion(db, baseKey, row, why) {
  const stamp = String(row.updated_at || "").replace(/[^0-9]/g, "").slice(0, 14) || "0";
  const key = String(baseKey).slice(0, 40) + "--v" + stamp;
  for (let i = 0; i < 26; i++) {
    const k = i ? key + "-" + String.fromCharCode(96 + i) : key;
    const c = await db.prepare("SELECT body_md FROM owner_docs WHERE key = ?1").bind(k).first();
    if (c && c.body_md === row.body_md) return k;
    if (!c) {
      await db.prepare("INSERT INTO owner_docs (key, title, body_md, source, visibility, updated_at) VALUES (?1, ?2, ?3, ?4, 'history', ?5)").bind(k, "Earlier version: " + String(row.title || baseKey).replace(/^(Earlier version: )+/, ""), row.body_md, why, row.updated_at || null).run();
      return k;
    }
  }
  throw new Error("no free history key for " + baseKey);
}
__name(idsKeepVersion, "idsKeepVersion");
async function identityStoreSync(env) {
  if (!env || !env.IDENTITY || !env.AUDIT) return { skipped: "binding absent" };
  const m = await identityStoreMigrate(env);
  if (m.error || !m.migrated) return { skipped: m.error || "not moved yet" };
  const db = env.IDENTITY;
  const rows = (await env.AUDIT.prepare("SELECT key, title, body_md, source, visibility, updated_at FROM owner_docs").all()).results || [];
  const seenRow = await db.prepare("SELECT value FROM store_meta WHERE key = 'audit_seen'").first();
  let seen = {};
  try {
    seen = JSON.parse(seenRow && seenRow.value || "{}") || {};
  } catch (e) {
    seen = {};
  }
  const now = await idsSeenMap(rows);
  const out = { at: new Date().toISOString(), copied: [], made_current: [], kept_as_history: [] };
  const why = "written to qnfo-audit.owner_docs after IDENTITY-STORE-1 moved the owner documents; synced by the */15 tick";
  for (const r of rows) {
    if (seen[r.key] === now[r.key]) continue;
    const cur = await db.prepare("SELECT key, title, body_md, source, visibility, updated_at FROM owner_docs WHERE key = ?1").bind(r.key).first();
    const vis = idsHistoryKey(r.key) ? "history" : r.visibility || "private";
    if (!cur) {
      await db.prepare("INSERT INTO owner_docs (key, title, body_md, source, visibility, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(r.key, r.title || r.key, r.body_md, r.source, vis, r.updated_at || null).run();
      out.copied.push(r.key);
    } else if (cur.body_md !== r.body_md) {
      if (String(r.updated_at || "") > String(cur.updated_at || "")) {
        out.kept_as_history.push(await idsKeepVersion(db, r.key, cur, "owner_docs." + r.key + " as of " + cur.updated_at + ", replaced by a newer write (" + why + ")"));
        await db.prepare("UPDATE owner_docs SET title = ?2, body_md = ?3, source = ?4, visibility = ?5, updated_at = ?6 WHERE key = ?1").bind(r.key, r.title || cur.title, r.body_md, r.source, vis, r.updated_at || null).run();
        out.made_current.push(r.key);
      } else {
        out.kept_as_history.push(await idsKeepVersion(db, r.key, r, "an older version of owner_docs." + r.key + " (" + why + ")"));
      }
    }
  }
  await db.prepare("INSERT OR REPLACE INTO store_meta (key, value, updated_at) VALUES ('audit_seen', ?1, datetime('now'))").bind(JSON.stringify(now)).run();
  if (out.copied.length || out.made_current.length || out.kept_as_history.length) {
    await db.prepare("INSERT OR REPLACE INTO store_meta (key, value, updated_at) VALUES ('last_sync', ?1, datetime('now'))").bind(JSON.stringify(out)).run();
  }
  return out;
}
__name(identityStoreSync, "identityStoreSync");
// The D1 that holds owner_docs: qnfo-identity once its one-time copy is verified, qnfo-audit before that or without the binding.
async function ownerStore(env) {
  if (!env.IDENTITY) return env.AUDIT;
  if (!IDENTITY_STORE_READY) {
    const m = await identityStoreMigrate(env);
    if (m.error) return env.AUDIT;
  }
  return env.IDENTITY;
}
__name(ownerStore, "ownerStore");
// IDENTITY-WEEKLY-1 (2026-10-01; moved here from qnfo-cloud-ops 1.16.0 by IDENTITY-STORE-1, because only this worker may
// read the private store). The weekly identity review: the Identity doc from qnfo-identity.owner_docs['identity'], public
// metrics (Bluesky, Mastodon, Zenodo, ORCID, GitHub) and OpenAlex citations, live bios against the canonical copy and the
// STRATEGY 2.2 never-claim list, deadline and page checks for every opportunity, funder/employer replies by sender domain
// and subject only. Deterministic; a failed source is a gap, never a number. Writes one qnfo-audit.portfolio_runs row
// (kind 'identity-weekly'); urgent items become one owner queue card. Never edits the doc or a profile.
var IDW_NL = "\n";
var IDW_AFTER_UTC_HOUR = 6;
var IDW_ORCID = "0009-0002-4317-5604";
var IDW_PORTFOLIO_RECORD = "21806274";
var IDW_NAME = "Rowan Brad Quni-Gudzinas";
var IDW_MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
// docs/STRATEGY.md 2.2 "Claims we never make": a background check fails on these.
var IDW_BANNED = [
  [/patent portfolio|foundational (?:us )?patents|patents developed/i, "patent claim without application numbers"],
  [/clearance[- ]eligible/i, "clearance-eligible"],
  [/featured in national media/i, "unlinked media feature"],
  [/\b\d{2,}\+\s*(?:publications|papers)\b/i, "inflated publication count"],
  [/thermodynamic dead end/i, "physics headline claim"],
  [/research foundation|research collective/i, "organisation label that overclaims"]
];
async function idwJson(url, headers, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 8e3);
  try {
    const r = await fetch(url, { headers: { "User-Agent": NAME + "/" + VERSION + " (+https://qnfo.org)", Accept: "application/json", ...headers || {} }, signal: ctl.signal });
    if (!r.ok) return { error: "HTTP " + r.status };
    return { body: await r.json() };
  } catch (e) {
    return { error: String(e && e.message || e).slice(0, 120) };
  } finally {
    clearTimeout(t);
  }
}
__name(idwJson, "idwJson");
function idwGh(env) {
  return env.GITHUB_TOKEN ? { Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: "application/vnd.github+json" } : { Accept: "application/vnd.github+json" };
}
__name(idwGh, "idwGh");
function idwSection(md, heading) {
  const i = md.indexOf("## " + heading);
  if (i < 0) return "";
  const j = md.indexOf(IDW_NL + "## ", i + 3);
  return j < 0 ? md.slice(i) : md.slice(i, j);
}
__name(idwSection, "idwSection");
function idwNorm(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/[<>]/g, " ").replace(/&amp;/g, "&").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
}
__name(idwNorm, "idwNorm");
function idwDeadline(text, now) {
  const s = String(text || "");
  let d = null;
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  if (m) d = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (d == null && (m = /\b([A-Z][a-z]{2})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(s)) && IDW_MONTHS[m[1].toLowerCase()] != null) d = Date.UTC(+m[3], IDW_MONTHS[m[1].toLowerCase()], +m[2]);
  if (d == null && (m = /\b(\d{1,2})\s+([A-Z][a-z]{2})[a-z]*\.?\s+(\d{4})\b/.exec(s)) && IDW_MONTHS[m[2].toLowerCase()] != null) d = Date.UTC(+m[3], IDW_MONTHS[m[2].toLowerCase()], +m[1]);
  if (d == null) return { text: s, date: null, days_left: null };
  return { text: s, date: new Date(d).toISOString().slice(0, 10), days_left: Math.floor((d - now) / 864e5) };
}
__name(idwDeadline, "idwDeadline");
function idwOpportunities(md, now) {
  const rows = [];
  for (const line of idwSection(md, "Opportunities").split(IDW_NL)) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const link = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/.exec(cells[1] || "");
    rows.push({ n: +cells[0], lead: link ? link[1] : (cells[1] || "").slice(0, 80), url: link ? link[2] : null, deadline: idwDeadline(cells[3], now) });
  }
  return rows;
}
__name(idwOpportunities, "idwOpportunities");
function idwCanonical(md) {
  const sb = /\*\*Short bio\*\*[^\n]*\n+>\s*([^\n]+)/.exec(md);
  const cell = (label) => {
    const m = new RegExp("^\\|\\s*" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\|[^|]*\\|([^|]+)\\|", "m").exec(md);
    return m ? m[1].trim() : null;
  };
  const ghUser = cell("GitHub user rwnq8");
  return {
    short_bio: sb ? sb[1].trim() : null,
    gh_org_description: cell("GitHub org QNFO"),
    gh_user_bio: ghUser && ghUser.indexOf(";") >= 0 ? ghUser.slice(ghUser.indexOf(";") + 1).trim() : null
  };
}
__name(idwCanonical, "idwCanonical");
function idwProfileCheck(platform, live, canonicalBio) {
  const text = [live.name || "", live.bio || ""].join(" | ");
  const claims = IDW_BANNED.filter(([rx]) => rx.test(text)).map(([, label]) => label);
  const out = { platform, name: live.name || null, bio: (live.bio || "").slice(0, 300) || null, name_ok: live.name == null ? null : idwNorm(live.name).indexOf(idwNorm(IDW_NAME)) >= 0, banned_claims: claims };
  if (canonicalBio) out.bio_matches_canonical = idwNorm(live.bio) === idwNorm(canonicalBio);
  return out;
}
__name(idwProfileCheck, "idwProfileCheck");
async function jobIdentityWeekly(env) {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const gaps = [];
  const doc = await ownerStore(env).then((db) => db.prepare("SELECT body_md, updated_at FROM owner_docs WHERE key='identity'").first()).catch(() => null);
  const md = doc && doc.body_md || "";
  if (!md) gaps.push("owner_docs 'identity' missing");
  const canon = idwCanonical(md);
  const [bsky, ghUser, ghOrg, orcid, zCount, zRec, masto] = await Promise.all([
    idwJson("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=qnfo.bsky.social"),
    idwJson("https://api.github.com/users/rwnq8", idwGh(env)),
    idwJson("https://api.github.com/orgs/QNFO", idwGh(env)),
    idwJson("https://pub.orcid.org/v3.0/" + IDW_ORCID + "/person"),
    idwJson("https://zenodo.org/api/records?q=" + encodeURIComponent("creators.orcid:" + IDW_ORCID) + "&size=1"),
    idwJson("https://zenodo.org/api/records/" + IDW_PORTFOLIO_RECORD),
    idwJson("https://mstdn.science/api/v1/accounts/lookup?acct=QNFO")
  ]);
  const metrics = { as_of: today };
  const profiles = [];
  if (bsky.body) {
    metrics.bluesky_followers = bsky.body.followersCount ?? null;
    metrics.bluesky_posts = bsky.body.postsCount ?? null;
    profiles.push(idwProfileCheck("bluesky qnfo.bsky.social", { name: bsky.body.displayName, bio: bsky.body.description }, canon.short_bio));
  } else gaps.push("bluesky: " + bsky.error);
  if (ghUser.body) profiles.push(idwProfileCheck("github rwnq8", { name: ghUser.body.name, bio: ghUser.body.bio }, canon.gh_user_bio));
  else gaps.push("github user: " + ghUser.error);
  if (ghOrg.body) profiles.push(idwProfileCheck("github org QNFO", { name: null, bio: ghOrg.body.description }, canon.gh_org_description));
  else gaps.push("github org: " + ghOrg.error);
  if (orcid.body) {
    const nm = orcid.body.name || {};
    const full = [nm["given-names"] && nm["given-names"].value, nm["family-name"] && nm["family-name"].value].filter(Boolean).join(" ");
    const bio = orcid.body.biography && orcid.body.biography.content || "";
    const aka = (orcid.body["other-names"] && orcid.body["other-names"]["other-name"] || []).map((o) => o.content).filter(Boolean);
    const p = idwProfileCheck("orcid " + IDW_ORCID, { name: full || null, bio }, null);
    p.also_known_as = aka.slice(0, 8);
    profiles.push(p);
  } else gaps.push("orcid: " + orcid.error);
  if (masto.body) {
    metrics.mastodon_followers = masto.body.followers_count ?? null;
    metrics.mastodon_posts = masto.body.statuses_count ?? null;
    profiles.push(idwProfileCheck("mastodon @QNFO@mstdn.science", { name: masto.body.display_name, bio: masto.body.note }, canon.short_bio));
  } else gaps.push("mastodon: " + masto.error);
  if (zCount.body && zCount.body.hits) metrics.zenodo_records_orcid = typeof zCount.body.hits.total === "object" ? zCount.body.hits.total.value : zCount.body.hits.total;
  else gaps.push("zenodo count: " + (zCount.error || "no hits"));
  if (zRec.body && zRec.body.stats) {
    metrics.portfolio_record = { id: IDW_PORTFOLIO_RECORD, version: zRec.body.metadata && zRec.body.metadata.version || null, views: zRec.body.stats.views ?? null, unique_views: zRec.body.stats.unique_views ?? null, downloads: zRec.body.stats.downloads ?? null };
  } else gaps.push("zenodo record " + IDW_PORTFOLIO_RECORD + ": " + (zRec.error || "no stats"));
  try {
    const c = await env.AUDIT.prepare("SELECT COUNT(*) dois, COALESCE(SUM(value),0) cites, COALESCE(SUM(CASE WHEN value>0 THEN 1 ELSE 0 END),0) cited FROM (SELECT doi, value, ROW_NUMBER() OVER (PARTITION BY doi ORDER BY collected_at DESC) rn FROM citation_stats WHERE source='openalex' AND metric='cited_by_count') WHERE rn=1").first();
    metrics.openalex = { dois: c.dois, citations: c.cites, cited_dois: c.cited };
  } catch (e) {
    gaps.push("citation_stats: " + String(e && e.message || e).slice(0, 80));
  }
  // Replies from funders, employers and programmes: outcome only (sender domain + subject), never the body.
  let replies = [];
  try {
    const since = new Date(now - 8 * 864e5).toISOString().slice(0, 19).replace("T", " ");
    const rs = await env.AUDIT.prepare("SELECT sender, subject, received_at FROM emails WHERE received_at >= ?1 AND lower(sender) NOT LIKE '%qnfo.org%' AND lower(sender) NOT LIKE '%qwav.tech%' AND lower(sender) NOT LIKE '%noreply%' AND lower(sender) NOT LIKE '%no-reply%' AND lower(sender) NOT LIKE '%alert%' AND lower(sender) NOT LIKE '%notification%' AND lower(sender) NOT LIKE '%mailer-daemon%' AND (lower(subject) LIKE '%application%' OR lower(subject) LIKE '%grant%' OR lower(subject) LIKE '%proposal%' OR lower(subject) LIKE '%position%' OR lower(subject) LIKE '%interview%' OR lower(subject) LIKE '%fellow%' OR lower(subject) LIKE '%funding%' OR lower(subject) LIKE '%offer%') ORDER BY received_at DESC LIMIT 15").bind(since).all();
    replies = (rs.results || []).map((r) => ({ from_domain: String(r.sender || "").replace(/^.*@/, "").replace(/[>\s].*$/, "").toLowerCase(), subject: String(r.subject || "").slice(0, 120), received_at: r.received_at }));
  } catch (e) {
    gaps.push("emails: " + String(e && e.message || e).slice(0, 80));
  }
  // Opportunities: deadline arithmetic from the doc, then each lead's own page (HTTP status only).
  const opps = idwOpportunities(md, now);
  await Promise.all(opps.filter((o) => o.url).slice(0, 20).map(async (o) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8e3);
    try {
      const r = await fetch(o.url, { headers: { "User-Agent": "Mozilla/5.0 (QNFO cloud ops identity review)" }, redirect: "follow", signal: ctl.signal });
      o.page_status = r.status;
    } catch (e) {
      o.page_status = "fetch-error";
    } finally {
      clearTimeout(t);
    }
  }));
  const prev = await env.AUDIT.prepare("SELECT scorecard_json FROM portfolio_runs WHERE kind='identity-weekly' ORDER BY id DESC LIMIT 1").first().catch(() => null);
  const deltas = {};
  try {
    const p = prev && JSON.parse(prev.scorecard_json || "{}") || {};
    for (const k of ["bluesky_followers", "bluesky_posts", "mastodon_followers", "zenodo_records_orcid"]) if (typeof metrics[k] === "number" && typeof p[k] === "number") deltas[k] = metrics[k] - p[k];
    if (metrics.openalex && p.openalex) deltas.openalex_citations = metrics.openalex.citations - p.openalex.citations;
    if (metrics.portfolio_record && p.portfolio_record) deltas.portfolio_views = (metrics.portfolio_record.views || 0) - (p.portfolio_record.views || 0);
  } catch (e) {}
  metrics.deltas = deltas;
  const needs = [];
  const urgent = [];
  for (const p of profiles) {
    if (p.banned_claims.length) {
      needs.push(p.platform + ": remove " + p.banned_claims.join(", "));
      urgent.push(p.platform + " shows " + p.banned_claims.join(", "));
    }
    if (p.name_ok === false) needs.push(p.platform + ": name reads \"" + p.name + "\", canonical is \"" + IDW_NAME + "\"");
    if (p.bio_matches_canonical === false) needs.push(p.platform + ": bio differs from the canonical copy in the Identity doc");
  }
  for (const o of opps) {
    const dl = o.deadline.days_left;
    if (dl != null && dl < 0) needs.push("lead " + o.n + " (" + o.lead + "): deadline " + o.deadline.date + " has passed; close or update it");
    else if (dl != null && dl <= 14) needs.push("lead " + o.n + " (" + o.lead + "): deadline " + o.deadline.date + " in " + dl + " days");
    if (dl != null && dl >= 0 && dl <= 7) urgent.push("lead " + o.n + " due " + o.deadline.date);
    if (o.page_status === 404 || o.page_status === 410) {
      needs.push("lead " + o.n + " (" + o.lead + "): its page returns " + o.page_status);
      urgent.push("lead " + o.n + " page " + o.page_status);
    }
  }
  if (replies.length) needs.push(replies.length + " possible funder/employer replies in the last 8 days (see actions_json.replies)");
  const fmt = (v) => v == null ? "gap" : String(v);
  const summary = ["Identity weekly " + today + ":", "Bluesky " + fmt(metrics.bluesky_followers) + " followers" + (deltas.bluesky_followers != null ? " (" + (deltas.bluesky_followers >= 0 ? "+" : "") + deltas.bluesky_followers + ")" : "") + ";", "Zenodo " + fmt(metrics.zenodo_records_orcid) + " records;", "OpenAlex " + fmt(metrics.openalex && metrics.openalex.citations) + " citations;", profiles.length + " profiles checked, " + needs.length + " owner items, " + gaps.length + " gaps."].join(" ");
  const actions = { profiles, opportunities: opps, replies, gaps, canonical_found: { short_bio: !!canon.short_bio, gh_org: !!canon.gh_org_description, gh_user: !!canon.gh_user_bio }, doc_updated_at: doc && doc.updated_at || null };
  await env.AUDIT.prepare("INSERT INTO portfolio_runs (run_date, kind, session, summary, scorecard_json, actions_json, needs_owner) VALUES (?1,'identity-weekly',?2,?3,?4,?5,?6)").bind(today, NAME + "/" + VERSION, summary, JSON.stringify(metrics), JSON.stringify(actions).slice(0, 6e4), needs.join(IDW_NL)).run();
  // Urgent items become ONE owner queue card per run (fleet.qnfo.org is where the owner decides; never an email to a session).
  let card = null;
  if (urgent.length) {
    try {
      await env.AUDIT.prepare("INSERT INTO human_actions (slug, title, why, default_in_effect, action, url, sev, due, source) VALUES (?1,?2,?3,?4,?5,'/owner','urgent',?6,'identity-weekly') ON CONFLICT(slug) DO UPDATE SET title=excluded.title, why=excluded.why, updated_at=datetime('now')").bind("identity-weekly-" + today, "Identity review: " + urgent.length + " urgent item(s)", urgent.join("; ").slice(0, 400), "Nothing changes on any profile until you act.", "Open the owner page, read this week's identity review and act on each item.", today).run();
      card = "identity-weekly-" + today;
    } catch (e) {
      card = "error: " + reachErr(e);
    }
  }
  return { status: gaps.length > 4 ? "degraded" : "ok", notes: { metrics: Object.keys(metrics).length, profiles: profiles.length, opportunities: opps.length, owner_items: needs.length, urgent: urgent.length, gaps: gaps.length, card } };
}
__name(jobIdentityWeekly, "jobIdentityWeekly");
// Mondays after 06:00Z (07:00/08:00 Amsterdam), once: throttled on cloud_ops_events 'identity-weekly-<day>' like
// PORTFOLIO-DAILY-1 (ok/degraded = done, running = in progress for 10 min, up to 3 attempts).
async function identityWeeklyRun(env, opts) {
  opts = opts || {};
  const nowMs = opts.nowMs || Date.now();
  const now = new Date(nowMs);
  if (!env || !env.AUDIT) return { skipped: "AUDIT binding absent" };
  if (!opts.force && (now.getUTCDay() !== 1 || now.getUTCHours() < IDW_AFTER_UTC_HOUR)) return { not_now: true };
  const day = now.toISOString().slice(0, 10);
  const evId = "identity-weekly-" + day;
  let attempts = 1;
  try {
    const prev = await d1all(env.AUDIT, "SELECT ts, status, meta FROM cloud_ops_events WHERE id = ?", [evId]);
    if (prev.length) {
      let pm = {};
      try {
        pm = JSON.parse(prev[0].meta || "{}") || {};
      } catch (e) {
      }
      const att = Number(pm.attempts) || 1;
      if (prev[0].status === "ok" || prev[0].status === "degraded") return { throttled: day };
      if (prev[0].status === "running" && nowMs - Date.parse(prev[0].ts) < PORTFOLIO_RUNNING_STALE_MS) return { in_progress: day };
      if (att >= PORTFOLIO_MAX_ATTEMPTS) return { gave_up: day, attempts: att };
      attempts = att + 1;
    }
  } catch (e) {
    return { error: "throttle unreadable: " + reachErr(e) };
  }
  const record = async function(status, text, notes) {
    try {
      await env.AUDIT.prepare("INSERT OR REPLACE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, 'identity-weekly', ?, ?, ?, ?)").bind(evId, new Date().toISOString(), text, JSON.stringify(Object.assign({ attempts, version: VERSION }, notes || {})).slice(0, 4e3), NAME, status).run();
    } catch (e) {
    }
  };
  await record("running", "identity weekly " + day + " started");
  let out;
  try {
    out = await jobIdentityWeekly(env);
  } catch (e) {
    out = { status: "error", notes: { error: reachErr(e) } };
  }
  await record(out.status, "identity weekly " + day + " " + out.status, out.notes);
  return out;
}
__name(identityWeeklyRun, "identityWeeklyRun");
async function ownerDocSection(env, key) {
  const r = await d1all(await ownerStore(env), "SELECT key, title, body_md, source, visibility, updated_at FROM owner_docs WHERE key = ?", [key]);
  if (!r.length) return null;
  const d = r[0];
  return "<article><h1>" + ownerEsc(d.title || d.key) + '</h1><p class="mut">owner_docs.' + ownerEsc(d.key) + " - updated " + ownerEsc(d.updated_at || "?") + (d.source ? " - source " + ownerEsc(d.source) : "") + "</p>" + ownerMarkdown(d.body_md || "") + "</article>";
}
// OWNER-EDIT-1: the owner edits owner_docs from the browser. The page CSP allows no script, so the editor is a plain form:
// it opens with the owner cookie (OWNER_TOKEN, SameSite=Strict) plus a same-origin check, or with LOOP_TOKEN typed into the
// form. A save is optimistic (if_updated_at must match, else nothing is written and the owner sees the newer version) and
// never loses text: the version it replaces is kept as owner_docs '<key>--v<yyyymmddhhmmss>' (visibility 'history').
// Archives and earlier versions are read-only.
var OWNER_DOC_MAX = 2e5;
function ownerDocEditable(key) {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(key) && key.indexOf("--v") < 0 && !/(^|-)archive(-|$)/.test(key);
}
function ownerSameOrigin(request) {
  const sfs = request.headers.get("sec-fetch-site");
  if (sfs) return sfs === "same-origin";
  const o = request.headers.get("origin");
  return !!o && o === new URL(request.url).origin;
}
async function ownerDocSave(env, key, body, ifUpdated) {
  body = String(body == null ? "" : body).replace(/\r\n?/g, "\n");
  if (!body.trim()) return { error: "An empty document was not saved." };
  if (body.length > OWNER_DOC_MAX) return { error: "The document is over " + OWNER_DOC_MAX + " characters and was not saved." };
  const db = await ownerStore(env);
  const cur = (await d1all(db, "SELECT key, title, body_md, updated_at FROM owner_docs WHERE key = ?", [key]))[0];
  if (!cur) return { error: "No document " + key + "." };
  if (String(ifUpdated || "") !== String(cur.updated_at || "")) return { conflict: true, current: cur };
  if (cur.body_md === body) return { ok: true, unchanged: true };
  const hkey = key.slice(0, 40) + "--v" + String(cur.updated_at || "").replace(/[^0-9]/g, "").slice(0, 14);
  const now = new Date().toISOString();
  const r = await db.batch([
    db.prepare("INSERT OR IGNORE INTO owner_docs (key, title, body_md, source, visibility, updated_at) VALUES (?1, ?2, ?3, ?4, 'history', ?5)").bind(hkey, "Earlier version: " + (cur.title || key), cur.body_md, "owner_docs." + key + " as of " + cur.updated_at + ", replaced by the owner via the dashboard at " + now, cur.updated_at),
    db.prepare("UPDATE owner_docs SET body_md = ?1, updated_at = datetime('now') WHERE key = ?2 AND updated_at = ?3").bind(body, key, cur.updated_at)
  ]);
  if (!(r && r[1] && r[1].meta && r[1].meta.changes)) return { conflict: true, current: cur };
  try {
    await ensureOwnerTables(env);
    await env.AUDIT.prepare("INSERT INTO human_responses (key, kind, note) VALUES (?1, 'edit', ?2)").bind("doc:" + key, "owner edited owner_docs." + key + "; previous version kept as " + hkey).run();
  } catch (e) {
  }
  return { ok: true, history_key: hkey };
}
function ownerEditor(key, d, needToken, notice, draft) {
  const text = draft != null ? draft : d.body_md || "";
  return "<h1>Edit: " + ownerEsc(d.title || key) + '</h1><p class="mut">owner_docs.' + ownerEsc(key) + " - version of " + ownerEsc(d.updated_at || "?") + '. Saving keeps the version it replaces. <a href="/owner/doc/' + ownerEsc(key) + '">Cancel</a></p>' + (notice ? "<p><strong>" + notice + "</strong></p>" : "") + '<form method="post" action="/owner/edit/' + ownerEsc(key) + '"><input type="hidden" name="if_updated_at" value="' + ownerEsc(d.updated_at || "") + '"><textarea name="body_md" rows="32" style="width:100%;box-sizing:border-box;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85rem" required>\n' + ownerEsc(text) + "</textarea>" + (needToken ? '<p><input type="password" name="token" autocomplete="current-password" placeholder="Owner token (LOOP_TOKEN)" required></p>' : "") + '<p><button type="submit">Save</button></p></form>';
}
// Returns a Response for /owner, /owner/doc/<key> and /owner/edit/<key>, or null for every other path.
async function ownerRoute(request, env, path, ownerCk) {
  if (path !== "/owner" && path !== "/owner/" && path.indexOf("/owner/doc/") !== 0 && path.indexOf("/owner/edit/") !== 0) return null;
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "method not allowed" }, 405);
  let tok = "";
  const ah = request.headers.get("authorization") || "";
  const bm = /^Bearer\s+(\S+)\s*$/i.exec(ah);
  if (bm) tok = bm[1];
  else if (request.headers.get("x-loop-token")) tok = request.headers.get("x-loop-token");
  let fromForm = false;
  let form = null;
  if (!tok && request.method === "POST") {
    try {
      if (/application\/x-www-form-urlencoded/i.test(request.headers.get("content-type") || "")) {
        form = new URLSearchParams((await request.text()).slice(0, 2 * OWNER_DOC_MAX + 8192));
        tok = form.get("token") || "";
        fromForm = true;
      }
    } catch (e) {
    }
  }
  const viaCookie = !!(ownerCk && ownerCk.authed);
  const viaToken = !!(env.LOOP_TOKEN && ownerSafeEq(tok, env.LOOP_TOKEN));
  if (!viaCookie && !viaToken) {
    // OWNER_TOKEN is configured: one sign-in (the cookie from "/") opens every owner page.
    if (ownerCk && ownerCk.configured) return new Response(lockedHtml(), { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
    return ownerLogin(path, fromForm || !!tok);
  }
  if (!env.AUDIT) return ownerHtml("Owner", "<p>AUDIT binding absent.</p>", 503);
  const fail = function(what, e) {
    return '<p class="mut">' + ownerEsc(what) + " could not be read: " + ownerEsc(reachErr(e)) + "</p>";
  };
  if (path.indexOf("/owner/edit/") === 0) {
    const key = path.slice("/owner/edit/".length);
    if (!ownerDocEditable(key)) return ownerHtml("Read-only", "<p>This document is read-only: archives and earlier versions are never edited.</p>", 403);
    let d = null;
    try {
      d = (await d1all(await ownerStore(env), "SELECT key, title, body_md, updated_at FROM owner_docs WHERE key = ?", [key]))[0];
    } catch (e) {
      return ownerHtml("Owner document", fail("owner_docs." + key, e), 503);
    }
    if (!d) return ownerHtml("Not found", "<p>No document " + ownerEsc(key) + ".</p>", 404);
    if (request.method === "POST" && form && form.has("body_md")) {
      if (!viaToken && !ownerSameOrigin(request)) return ownerHtml("Refused", "<p>A save from another site was refused.</p>", 403);
      let res;
      try {
        res = await ownerDocSave(env, key, form.get("body_md"), form.get("if_updated_at"));
      } catch (e) {
        res = { error: "The save failed: " + reachErr(e) };
      }
      if (res.conflict) return ownerHtml("Edit conflict", ownerEditor(key, res.current, !viaCookie, "This document changed since you opened it (now version " + ownerEsc(res.current.updated_at || "?") + "). Nothing was saved. Your text is below; the current version is linked above.", String(form.get("body_md") || "").replace(/\r\n?/g, "\n")), 409);
      if (res.error) return ownerHtml("Not saved", ownerEditor(key, d, !viaCookie, ownerEsc(res.error), String(form.get("body_md") || "").replace(/\r\n?/g, "\n")), 400);
      const sec = await ownerDocSection(env, key);
      return ownerHtml("Saved - " + key, "<p><strong>" + (res.unchanged ? "No changes to save." : "Saved. The previous version is kept as " + ownerEsc(res.history_key) + ".") + '</strong> <a href="/owner">Owner page</a></p>' + (sec || ""));
    }
    return ownerHtml("Edit - " + key, ownerEditor(key, d, !viaCookie));
  }
  if (path.indexOf("/owner/doc/") === 0) {
    const key = path.slice("/owner/doc/".length);
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key)) return ownerHtml("Not found", "<p>Unknown document.</p>", 404);
    let sec = null;
    try {
      sec = await ownerDocSection(env, key);
    } catch (e) {
      return ownerHtml("Owner document", fail("owner_docs." + key, e), 503);
    }
    if (!sec) return ownerHtml("Not found", "<p>No document " + ownerEsc(key) + ".</p>", 404);
    return ownerHtml("Owner - " + key, '<p class="mut"><a href="/owner">Owner page</a>' + (ownerDocEditable(key) ? ' - <a href="/owner/edit/' + ownerEsc(key) + '">Edit</a>' : " - read-only") + "</p>" + sec);
  }
  const parts = ["<h1>Owner</h1><p class=\"mut\">Private page (" + ownerEsc(NAME) + " v" + ownerEsc(VERSION) + "). Data: qnfo-audit human_actions and portfolio_runs; owner documents in the private qnfo-identity store.</p>"];
  try {
    const a = await d1all(env.AUDIT, "SELECT id, title AS action, due, status, updated_at FROM human_actions ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, id");
    parts.push("<h2>Owner-only actions</h2>" + (a.length ? "<div class=tw><table><thead><tr><th>#</th><th>Action</th><th>Due</th><th>Status</th></tr></thead><tbody>" + a.map(function(r) {
      return "<tr><td>" + ownerEsc(r.id) + "</td><td>" + ownerInline(r.action) + "</td><td>" + ownerEsc(r.due || "") + "</td><td>" + ownerEsc(r.status || "") + "</td></tr>";
    }).join("") + "</tbody></table></div>" : "<p>None recorded.</p>"));
  } catch (e) {
    parts.push("<h2>Owner-only actions</h2>" + fail("human_actions", e));
  }
  try {
    const rr = await d1all(env.AUDIT, "SELECT run_date, kind, session, summary FROM portfolio_runs ORDER BY rowid DESC LIMIT 7");
    parts.push("<h2>Last 7 portfolio runs</h2>" + (rr.length ? "<div class=tw><table><thead><tr><th>Date</th><th>Kind</th><th>By</th><th>Summary</th></tr></thead><tbody>" + rr.map(function(r) {
      return "<tr><td>" + ownerEsc(r.run_date) + "</td><td>" + ownerEsc(r.kind) + "</td><td>" + ownerEsc(r.session) + "</td><td>" + ownerEsc(r.summary) + "</td></tr>";
    }).join("") + "</tbody></table></div>" : "<p>No runs recorded.</p>"));
  } catch (e) {
    parts.push("<h2>Last 7 portfolio runs</h2>" + fail("portfolio_runs", e));
  }
  try {
    const iw = (await d1all(env.AUDIT, "SELECT run_date, summary, needs_owner FROM portfolio_runs WHERE kind = 'identity-weekly' ORDER BY rowid DESC LIMIT 1"))[0];
    const items = iw && iw.needs_owner ? String(iw.needs_owner).split("\n").filter(Boolean) : [];
    parts.push("<h2>Identity review (weekly)</h2>" + (iw ? "<p>" + ownerEsc(iw.run_date) + ": " + ownerEsc(iw.summary) + "</p>" + (items.length ? "<ul>" + items.map(function(n) {
      return "<li>" + ownerEsc(n) + "</li>";
    }).join("") + "</ul>" : "<p>Nothing needs you.</p>") : '<p class="mut">No run yet. This worker writes one every Monday after 06:00 UTC (IDENTITY-WEEKLY-1).</p>'));
  } catch (e) {
    parts.push("<h2>Identity review (weekly)</h2>" + fail("portfolio_runs", e));
  }
  try {
    // IDENTITY-STORE-1: bring any later write to qnfo-audit.owner_docs across before listing (copy only).
    const sync = env.IDENTITY ? await identityStoreSync(env).catch(function(e) {
      return { error: reachErr(e) };
    }) : null;
    const docs = await d1all(await ownerStore(env), "SELECT key, title, updated_at, visibility FROM owner_docs ORDER BY key");
    const cur = docs.filter(function(d) {
      return d.visibility !== "history";
    });
    const hist = docs.length - cur.length;
    parts.push("<h2>Documents</h2><ul>" + cur.map(function(d) {
      return '<li><a href="/owner/doc/' + ownerEsc(d.key) + '">' + ownerEsc(d.title || d.key) + "</a> (" + ownerEsc(d.updated_at || "?") + ")" + (ownerDocEditable(d.key) ? ' - <a href="/owner/edit/' + ownerEsc(d.key) + '">edit</a>' : " - read-only") + "</li>";
    }).join("") + "</ul>" + (hist ? '<p class="mut">' + hist + " earlier version(s) kept (owner_docs visibility 'history').</p>" : ""));
    const sm = await identityStoreMigrate(env).catch(function(e) {
      return { error: reachErr(e) };
    });
    let shared = null;
    if (sm.store === "qnfo-identity") {
      const c = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM owner_docs").first().catch(function() {
        return null;
      });
      shared = c ? Number(c.n) : null;
    }
    const synced = sync && !sync.skipped && !sync.error ? sync.copied.length + sync.made_current.length + sync.kept_as_history.length : 0;
    parts.push('<p class="mut">Store: ' + ownerEsc(sm.store || "?") + (sm.at ? ", moved from qnfo-audit " + ownerEsc(sm.at) : "") + (sm.error ? " - " + ownerEsc(sm.error) : "") + (sync && sync.error ? " - sync: " + ownerEsc(sync.error) : "") + (synced ? " - just synced " + synced + " later write(s) from qnfo-audit" : "") + (shared ? ". The earlier copy (" + shared + " row(s)) is still in the shared qnfo-audit.owner_docs; it is no longer read, later writes there are synced here, and removing it is your call." : "") + "</p>");
  } catch (e) {
    parts.push("<h2>Documents</h2>" + fail("owner_docs", e));
  }
  try {
    const sec = await ownerDocSection(env, "identity");
    parts.push("<hr>" + (sec ? '<p class="mut"><a href="/owner/edit/identity">Edit this document</a></p>' + sec : "<p>No identity document (owner_docs.identity).</p>"));
  } catch (e) {
    parts.push("<hr>" + fail("owner_docs.identity", e));
  }
  return ownerHtml("Owner", parts.join("\n"));
}
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map