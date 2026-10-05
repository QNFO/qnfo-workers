var VERSION = "1.7.3-strict-public-fetch"; // 1.7.3 LIFECYCLE-PING-1042-1 (#1994): wrangler.toml sets global_fetch_strictly_public, so runPing and runSync reach *.q08.workers.dev (150 PING FAIL HTTP 404 rows were Cloudflare error 1042). 1.7.2 METRIC-CADENCE-UNITS-1 + METRIC-UNMEASURED-CLASS-1 (#1865): "*/3h" and "2h" cadences parse with their unit; never-measured UNMEASURED/n/a metrics are their own class. 1.7.0 CRON-SINGLE-TRIGGER-1 (#1785): one hourly trigger, CRON_TABLE in code. Worker Contract v1 VERSION constant (read by version-bump-guard / drift checks)
const QNFO_VERSION = VERSION;
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var __defProp222 = Object.defineProperty;
var __name222 = /* @__PURE__ */ __name22((target, value) => __defProp222(target, "name", { value, configurable: true }), "__name");
var __defProp2222 = Object.defineProperty;
var __name2222 = /* @__PURE__ */ __name222((target, value) => __defProp2222(target, "name", { value, configurable: true }), "__name");
var __defProp22222 = Object.defineProperty;
var __name22222 = /* @__PURE__ */ __name2222((target, value) => __defProp22222(target, "name", { value, configurable: true }), "__name");
var __defProp222222 = Object.defineProperty;
var __name222222 = __name22222((target, value) => __defProp222222(target, "name", { value, configurable: true }), "__name");
function corsHeaders(origin) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "https://qnfo.org"
  };
}
__name(corsHeaders, "corsHeaders");
__name2(corsHeaders, "corsHeaders");
__name22(corsHeaders, "corsHeaders");
__name222(corsHeaders, "corsHeaders");
__name2222(corsHeaders, "corsHeaders");
__name22222(corsHeaders, "corsHeaders");
// ---- CRON-SINGLE-TRIGGER-1:BEGIN (pure; replayed by scripts/cron-single-trigger.test.mjs)
// CRON-SINGLE-TRIGGER-1 (2026-10-02, #1785, pillar: core). The account held 84 cron expressions against the fleet budget
// of 50. This worker now registers ONE hourly trigger; each tick runs every entry of CRON_TABLE (the former trigger list,
// unchanged) that fired in the hour ending at the tick, through the same dispatcher as before. An entry on the hour runs
// at its minute; one at :15 or :30 runs at the next full hour. Hourly keeps the 15-minute CPU limit of a cron trigger.
var TICK_CRON = "0 * * * *";
var CRON_TABLE = ["0 * * * *", "0 0 1 * *", "0 3 * * *", "0 5 * * *", "0 8 * * 1"];
var TICK_PARALLEL = false;
function cronFieldMatch(spec, v) {
  return String(spec).split(",").some(function (part) {
    var st = /^(.+)\/(\d+)$/.exec(part), step = st ? Number(st[2]) : 1, base = st ? st[1] : part;
    var r = /^(\d+)-(\d+)$/.exec(base), lo, hi;
    if (base === "*") { lo = 0; hi = 1e9; } else if (r) { lo = Number(r[1]); hi = Number(r[2]); } else { lo = Number(base); hi = st ? 1e9 : lo; }
    return v >= lo && v <= hi && (v - (base === "*" ? 0 : lo)) % step === 0;
  });
}
// Cloudflare cron fields in UTC; day of week 1 = Sunday .. 7 = Saturday.
function cronMatchesAt(expr, ms) {
  var f = String(expr).trim().split(/\s+/), d = new Date(ms);
  return f.length === 5 && cronFieldMatch(f[0], d.getUTCMinutes()) && cronFieldMatch(f[1], d.getUTCHours()) && cronFieldMatch(f[2], d.getUTCDate()) && cronFieldMatch(f[3], d.getUTCMonth() + 1) && cronFieldMatch(f[4], d.getUTCDay() + 1);
}
// The table entries that fired in the 60 minutes ending at the tick (tick minute included), in table order.
function cronDueAtTick(table, tickMs) {
  var t = Math.floor(tickMs / 60000) * 60000;
  return table.filter(function (expr) {
    for (var k = 0; k < 60; k++) if (cronMatchesAt(expr, t - k * 60000)) return true;
    return false;
  });
}
// ---- CRON-SINGLE-TRIGGER-1:END
// `one` is the dispatcher this worker always had (one cron expression in, its job run). A trigger other than the tick
// (a former per-job trigger still registered) goes straight to it, and so does an event marked tickEntry: that is how
// the tick hands each table entry on, and how a test runs one entry whose expression equals the tick's.
async function cronTickDispatch(event, one) {
  if (!event || event.cron !== TICK_CRON || event.tickEntry) return one(event);
  var at = Number(event.scheduledTime) || Date.now();
  var due = cronDueAtTick(CRON_TABLE, at);
  var run = function (expr) {
    return Promise.resolve().then(function () { return one({ cron: expr, scheduledTime: at, type: "scheduled", tickEntry: true }); }).catch(function (e) { console.error("cron " + expr + ": " + String(e && e.message || e)); });
  };
  if (TICK_PARALLEL) { await Promise.all(due.map(run)); return; }
  for (var i = 0; i < due.length; i++) await run(due[i]);
}
var worker_default = {
  async fetch(request, env, ctx) {
    const u = new URL(request.url), p = u.pathname;
    const origin = request.headers.get("Origin") || "https://qnfo.org";
    const h = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (p === "/health") return health(env, origin);
    if (p === "/status") return handleStatus(env, origin);
    // LIFECYCLE-RUN-INTERNAL-1 (2026-10-01, charter H0, #1735 sweep): every /run/* route was anonymous. GET /run/secrets-audit
    // returned the secret NAMES of every worker in the account (read with this worker's CF_API_TOKEN), /run/backup wrote a
    // full D1 export to R2 per call, and /run/memory-maintain?commit=1 mutated agent memory. No worker or script calls these
    // routes (qnfo-ops binds this worker for /health only); the crons do the work. They now answer only an internal caller
    // authenticated by service-binding props (ctx.props.caller, settable only by a deployer of the caller).
    if (p.startsWith("/run/")) {
      const caller = ctx && ctx.props && typeof ctx.props.caller === "string" ? ctx.props.caller : "";
      if (!/^qnfo-[a-z0-9-]{1,60}$/.test(caller)) return new Response(JSON.stringify({ error: "forbidden: /run/* is internal only (LIFECYCLE-RUN-INTERNAL-1); the crons run this work" }), { status: 403, headers: h });
    }
    if (p === "/run/drift") return handleDrift(env, origin);
    if (p === "/run/backup") return handleBackup(env, origin);
    if (p === "/run/secrets-audit") return handleSecretsAudit(env, origin);
    if (p === "/run/ula-check") return handleUlaCheck(env, origin);
    if (p === "/run/memory-maintain") return handleMemoryMaintain(request, env, origin);
    if (p === "/run/metrics-refresh") return handleMetricsRefresh(env, origin);
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: h });
  },
  async scheduled(event, env, ctx) {
    return cronTickDispatch(event, async function (event) {
    const cron = event.cron;
    console.log("[qnfo-lifecycle] cron triggered:", cron);
     try { await env.QNFO_AUDIT.prepare("INSERT OR REPLACE INTO fleet_heartbeat (worker, version, ts, ok) VALUES (?, ?, ?, 1)").bind("qnfo-lifecycle", QNFO_VERSION, new Date().toISOString()).run(); } catch (e) {}
    try {
      // CRON-CONSOLIDATE-1 (2026-09-27 fleet reorg): the four lightweight daily D1 audit/
      // maintenance tasks (lifecycle, memory-maintain, ula-check, drift-audit) now share ONE
      // daily fire at 03:00 instead of four separate crons. This also FIXES a latent bug: the
      // drift-audit branch keyed on "0 6 * * *" while the trigger was registered as
      // "9 6 * * *" -> runDriftAudit never ran. Backup stays on its own cron (heavy).
      if (cron === "0 3 * * *") {
        await runLifecycle(env);
        await runMemoryMaintain(env, { commit: true });
        await runUlaCheck(env);
        await runDriftAudit(env);
      }
      else if (cron === "0 0 1 * *") await runGraphSeed(env);
      else if (cron === "0 5 * * *") await runBackup(env);
      else if (cron === "0 8 * * 1") await runSecretsAudit(env);
      else if (cron === "0 * * * *") { await runSync(env); await runMetricFreshness(env); await runPing(env); } // LIFECYCLE-PING-DEAD-1 (#1810): runPing folded onto the single live hourly trigger
    } catch (e) {
      console.error("[qnfo-lifecycle] cron error:", e.message);
    }
    });
  }
};
function health(env, origin) {
  const h = corsHeaders(origin);
  return new Response(JSON.stringify({
    status: "ok",
    worker: "qnfo-lifecycle",
    version: QNFO_VERSION,
    cronSchedules: 5,
    capabilities: ["lifecycle-scan", "graph-seed", "d1-backup", "drift-audit", "secrets-audit", "registry-sync", "ula-check", "memory-maintain", "metric-freshness"],
    limitations: ["/run/* answers only internal service-binding callers (props); public callers get 403", "work runs on its crons: hourly registry sync, daily 03:00 maintenance, 05:00 backup, Monday 08:00 secrets audit, monthly graph seed", "the secrets audit reads secret names only, never values"],
    features: ["lifecycle-scan", "graph-seed", "backup", "drift-audit-enhanced", "secrets-audit-enhanced", "registry-sync", "infra-ping", "ula-check", "memory-maintain", "metric-freshness"],
    bindings: { d1: ["qnfo-audit", "qnfo-graph", "portfolio-state", "living-paper", "ipatent-db"], r2: ["qnfo", "qnfo-audit", "qnfo-backups"] }
  }), { headers: h });
}
__name(health, "health");
__name2(health, "health");
__name22(health, "health");
__name222(health, "health");
__name2222(health, "health");
__name22222(health, "health");
__name222222(health, "health");
async function handleStatus(env, origin) {
  const h = corsHeaders(origin);
  try {
    const project = await env.PORTFOLIO_STATE.prepare("SELECT COUNT(*) as total FROM resources WHERE type='project'").first();
    const audit = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) as total FROM audit_sessions").first();
    return new Response(JSON.stringify({
      status: "ok",
      projects: project?.total || 0,
      auditSessions: audit?.total || 0,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }), { headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: h });
  }
}
__name(handleStatus, "handleStatus");
__name2(handleStatus, "handleStatus");
__name22(handleStatus, "handleStatus");
__name222(handleStatus, "handleStatus");
__name2222(handleStatus, "handleStatus");
__name22222(handleStatus, "handleStatus");
__name222222(handleStatus, "handleStatus");
async function handleDrift(env, origin) {
  const result = await runDriftAudit(env);
  return new Response(JSON.stringify(result), { headers: corsHeaders(origin) });
}
__name(handleDrift, "handleDrift");
__name2(handleDrift, "handleDrift");
__name22(handleDrift, "handleDrift");
__name222(handleDrift, "handleDrift");
__name2222(handleDrift, "handleDrift");
__name22222(handleDrift, "handleDrift");
__name222222(handleDrift, "handleDrift");
async function handleSecretsAudit(env, origin) {
  const result = await runSecretsAudit(env);
  return new Response(JSON.stringify(result), { headers: corsHeaders(origin) });
}
__name(handleSecretsAudit, "handleSecretsAudit");
__name2(handleSecretsAudit, "handleSecretsAudit");
__name22(handleSecretsAudit, "handleSecretsAudit");
__name222(handleSecretsAudit, "handleSecretsAudit");
__name2222(handleSecretsAudit, "handleSecretsAudit");
__name22222(handleSecretsAudit, "handleSecretsAudit");
__name222222(handleSecretsAudit, "handleSecretsAudit");
async function handleBackup(env, origin) {
  const result = await runBackup(env);
  return new Response(JSON.stringify(result), { headers: corsHeaders(origin) });
}
__name(handleBackup, "handleBackup");
__name2(handleBackup, "handleBackup");
__name22(handleBackup, "handleBackup");
__name222(handleBackup, "handleBackup");
__name2222(handleBackup, "handleBackup");
__name22222(handleBackup, "handleBackup");
__name222222(handleBackup, "handleBackup");
async function handleUlaCheck(env, origin) {
  const result = await runUlaCheck(env);
  return new Response(JSON.stringify(result), { headers: corsHeaders(origin) });
}
__name(handleUlaCheck, "handleUlaCheck");
__name2(handleUlaCheck, "handleUlaCheck");
__name22(handleUlaCheck, "handleUlaCheck");
__name222(handleUlaCheck, "handleUlaCheck");
__name2222(handleUlaCheck, "handleUlaCheck");
__name22222(handleUlaCheck, "handleUlaCheck");
__name222222(handleUlaCheck, "handleUlaCheck");
async function runUlaCheck(env) {
  console.log("[lifecycle] running ULA health check...");
  var result = {
    status: "ula-checked",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    locations: {},
    findings: [],
    verdict: "HEALTHY"
  };
  var ULA_LOCATIONS = [
    { name: "legal.qnfo.org", url: "https://legal.qnfo.org/" },
    { name: "qnfo.org/legal/license", url: "https://qnfo.org/legal/license" },
    { name: "qwav.tech/legal/license", url: "https://qwav.tech/legal/license" }
  ];
  var CORRUPTION_PATTERNS = [
    { name: "th-ligature", regex: /\uFB05|\uFB06/g, desc: "Th/ff fi/fl ligatures" },
    { name: "Misplaced-ampersand", regex: /Misplaced &/g, desc: "Broken MathJax placeholder" },
    { name: "MathJax-unicode-range", regex: /[\uD835][\uDC00-\uDFFF]/g, desc: "MathJax Unicode surrogate pairs" }
  ];
  var EXPECTED_MIN_SIZE = 64e3;
  for (var i = 0; i < ULA_LOCATIONS.length; i++) {
    var loc = ULA_LOCATIONS[i];
    try {
      var resp = await fetch(loc.url, { method: "GET", headers: { "User-Agent": "qnfo-lifecycle-ula-check/1.4" } });
      var body = await resp.text();
      var byteSize = new TextEncoder().encode(body).length;
      var locResult = { url: loc.url, httpStatus: resp.status, byteSize, ok: resp.status === 200 && byteSize >= EXPECTED_MIN_SIZE };
      var detectedPatterns = [];
      for (var p = 0; p < CORRUPTION_PATTERNS.length; p++) {
        var pat = CORRUPTION_PATTERNS[p];
        var matches = body.match(pat.regex);
        if (matches && matches.length > 0) {
          detectedPatterns.push({ pattern: pat.name, count: matches.length, desc: pat.desc });
        }
      }
      if (detectedPatterns.length > 0) {
        locResult.corruptionDetected = detectedPatterns;
        locResult.ok = false;
        result.findings.push("CORRUPTION at " + loc.name + ": " + detectedPatterns.map(function(d) {
          return d.pattern + "(" + d.count + ")";
        }).join(", "));
      }
      if (resp.status !== 200) result.findings.push("HTTP " + resp.status + " at " + loc.name);
      if (byteSize < EXPECTED_MIN_SIZE) result.findings.push("SIZE anomaly at " + loc.name + ": " + byteSize + " bytes");
      if (!body.includes("QNFO-ULA")) {
        result.findings.push("CONTENT mismatch at " + loc.name);
        locResult.ok = false;
      }
      result.locations[loc.name] = locResult;
    } catch (e) {
      result.locations[loc.name] = { url: loc.url, error: e.message, ok: false };
      result.findings.push("FETCH FAILED at " + loc.name + ": " + e.message);
    }
  }
  var allOk = Object.values(result.locations).every(function(l) {
    return l.ok;
  });
  result.verdict = allOk ? "HEALTHY" : "DEGRADED";
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO audit_sessions (session_id, agent, start_time, end_time, tasks_completed, tasks_total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("ula-check-" + Date.now(), "qnfo-lifecycle-ula-cron", (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString(), allOk ? 1 : 0, 1, "ULA check: " + result.verdict).run();
  } catch (e) {
    console.error("[lifecycle] ula-check audit log error:", e.message);
  }
  return result;
}
__name(runUlaCheck, "runUlaCheck");
__name2(runUlaCheck, "runUlaCheck");
__name22(runUlaCheck, "runUlaCheck");
__name222(runUlaCheck, "runUlaCheck");
__name2222(runUlaCheck, "runUlaCheck");
__name22222(runUlaCheck, "runUlaCheck");
__name222222(runUlaCheck, "runUlaCheck");
// METRIC-FRESHNESS-WRITER-1 (issue #1301, 2026-09-29): qnfo-audit.metric_registry
// declared 24 metrics with cadences as tight as */15 and NO writer existed anywhere in the
// repo. Measured 2026-09-29: 9 metrics last_refreshed IS NULL, 15 stale 42.6-74.6h. This
// auditor never invents a value -- it stamps last_value/last_refreshed only for metrics
// whose source table is bound here, classifies every other metric against its OWN declared
// refresh_cadence, and files one deduplicated agent_issue so staleness cannot stay silent.
// METRIC-CADENCE-UNITS-1 (2026-10-05, #1865): "*/3h" was read as 3 minutes (inbound_unactioned_72h "180m stale vs 3m
// cadence") and "2h" did not parse (seven q08 metrics "cadence unparsed"). "*/N" and "N" take an optional m, h or d unit;
// a bare "*/N" stays minutes (the cron-minute form the */15 metrics use).
function metricCadenceMinutes(cadence) {
  if (!cadence) return null;
  var c = String(cadence).trim();
  var unit = { m: 1, h: 60, d: 1440 };
  var m = c.match(/^\*\/(\d+)\s*([mhd])?$/i);
  if (m) return parseInt(m[1], 10) * unit[(m[2] || "m").toLowerCase()];
  var m2 = c.match(/^(\d+)\s*([mhd])$/i);
  if (m2) return parseInt(m2[1], 10) * unit[m2[2].toLowerCase()];
  if (c === "hourly") return 60;
  if (c === "daily") return 1440;
  if (c === "weekly") return 10080;
  if (c === "monthly") return 43200;
  return null;
}
async function runMetricFreshness(env) {
  var nowMs = Date.now();
  var nowIso = new Date(nowMs).toISOString();
  var out = { status: "metric-freshness", timestamp: nowIso, total: 0, fresh: 0, stale: 0, never: 0, unparsed_cadence: 0, undefined: 0, undefined_metrics: [], unmeasured: 0, unmeasured_metrics: [], worst: null, refreshed: [], filed_issue: false, updated_issue: false };
  var rows = [];
  try {
    var res = await env.QNFO_AUDIT.prepare("SELECT metric, refresh_cadence, last_refreshed, state FROM metric_registry").all();
    rows = res.results || [];
  } catch (e) {
    out.error = "metric_registry read failed: " + e.message;
    return out;
  }
  out.total = rows.length;
  var offenders = [];
  var worstAge = -1, worstMetric = null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    // METRIC-UNDEFINED-CLASS-1 (2026-09-30, #1411): a metric in state UNDEFINED has no agreed formula, so no writer can
    // ever refresh it; counting it as "stale" kept this ticket open forever for a definition gap, not a freshness gap.
    // Report it in its own class (undefined_metrics) and keep it out of the staleness verdict.
    if (String(r.state || "").toUpperCase() === "UNDEFINED") {
      out.undefined++;
      out.undefined_metrics.push(r.metric);
      continue;
    }
    // METRIC-UNMEASURED-CLASS-1 (2026-10-05, #1865): a metric whose owner declares it UNMEASURED (or n/a) and that has never
    // had a reading (ask_helpful_rate_30d below 10 ratings, the q08 panel metrics, paper_math_browser_fail_pages) is a
    // measurement gap, not a stale writer; it is reported in its own class, like UNDEFINED. Once a writer stamps it, the
    // row is judged on its cadence like any other.
    if (!r.last_refreshed && /^(unmeasured|n\/a)$/i.test(String(r.state || "").trim())) {
      out.unmeasured++;
      out.unmeasured_metrics.push(r.metric);
      continue;
    }
    var cad = metricCadenceMinutes(r.refresh_cadence);
    if (cad === null) {
      out.unparsed_cadence++;
      offenders.push(r.metric + " (cadence unparsed: " + r.refresh_cadence + ")");
      continue;
    }
    if (!r.last_refreshed) {
      out.never++;
      offenders.push(r.metric + " (never refreshed)");
      continue;
    }
    var raw = String(r.last_refreshed);
    var t = Date.parse(raw.indexOf("T") >= 0 ? raw : raw.replace(" ", "T") + "Z");
    if (isNaN(t)) { out.unparsed_cadence++; continue; }
    var ageMin = (nowMs - t) / 60000;
    if (ageMin > cad * 2) {
      out.stale++;
      offenders.push(r.metric + " (" + Math.round(ageMin) + "m stale vs " + cad + "m cadence)");
      if (ageMin > worstAge) { worstAge = ageMin; worstMetric = r.metric; }
    } else {
      out.fresh++;
    }
  }
  if (worstMetric) out.worst = { metric: worstMetric, age_minutes: Math.round(worstAge) };
  try {
    var oi = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM agent_issues WHERE status = 'open'").first();
    if (oi) {
      await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?, state = ? WHERE metric = ?").bind(String(oi.c == null ? 0 : oi.c), nowIso, "MEASURED", "open_agent_issues").run();
      out.refreshed.push("open_agent_issues");
    }
  } catch (e) { out.refresh_error_open_issues = e.message; }
  try {
    var wc = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM service_registry").first();
    if (wc) {
      await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?, state = ? WHERE metric = ?").bind(String(wc.c == null ? 0 : wc.c), nowIso, "MEASURED", "worker_count").run();
      out.refreshed.push("worker_count");
    }
  } catch (e) { out.refresh_error_worker_count = e.message; }
  // RESEARCH-METRICS-WRITER-1 (2026-10-01, agent_issues #1742): publications_30d and full_reports_live_30d
  // (registry formulas over living-paper.papers) and indexed_surface (<loc> count of the papers.qnfo.org sitemap)
  // had no writer anywhere in the fleet: their last values were written by hand on 2026-09-29 17:18Z and went
  // stale against a daily cadence while this auditor filed the ticket every hour. Same rule as the two writers
  // above: recompute from the registry's own source of truth, never invent; a source that cannot be read this
  // cycle is left untouched and reported in refresh_error_*.
  try {
    if (!env.LIVING_PAPER) throw new Error("no LIVING_PAPER binding");
    var pub = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS c FROM papers WHERE status = 'published' AND created_at >= datetime('now','-30 day')").first();
    var full = await env.LIVING_PAPER.prepare("SELECT COUNT(*) AS c FROM papers WHERE status = 'published' AND length(COALESCE(body_md,'')) >= 5000 AND created_at >= datetime('now','-30 day')").first();
    if (pub && pub.c != null) {
      await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?, state = ? WHERE metric = ?").bind(String(pub.c), nowIso, "MEASURED", "publications_30d").run();
      out.refreshed.push("publications_30d");
    }
    if (full && full.c != null) {
      await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?, state = ? WHERE metric = ?").bind(String(full.c), nowIso, "MEASURED", "full_reports_live_30d").run();
      out.refreshed.push("full_reports_live_30d");
    }
  } catch (e) { out.refresh_error_publications = e.message; }
  try {
    var sm = await fetch("https://papers.qnfo.org/sitemap.xml", { headers: { "User-Agent": "qnfo-lifecycle/" + QNFO_VERSION }, signal: AbortSignal.timeout(15000) });
    if (!sm.ok) throw new Error("sitemap http " + sm.status);
    var locs = ((await sm.text()).match(/<loc>/g) || []).length;
    if (locs <= 0) throw new Error("sitemap carries no <loc> entries");
    await env.QNFO_AUDIT.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ?, state = ? WHERE metric = ?").bind(String(locs), nowIso, "MEASURED", "indexed_surface").run();
    out.refreshed.push("indexed_surface");
  } catch (e) { out.refresh_error_indexed_surface = e.message; }
  var remaining = out.stale + out.never + out.unparsed_cadence;
  var stTitle = "METRIC-REGISTRY-STALENESS-1: metric_registry rows exceed their declared refresh cadence";
  if (remaining === 0) {
    // METRIC-STALENESS-SELF-CLOSE-1 (2026-09-30): the auditor could FILE and UPDATE its ticket but never close it, so
    // even a fully fresh registry left #1411 open. Close on positive evidence (this run's own verdict), writing
    // issue_triage.close_evidence first as the qnfo-audit close trigger requires.
    try {
      var ox = await env.QNFO_AUDIT.prepare("SELECT id FROM agent_issues WHERE status = 'open' AND title = ? LIMIT 1").bind(stTitle).first();
      if (ox && ox.id) {
        var evd = "qnfo-lifecycle/" + QNFO_VERSION + " at " + nowIso + ": 0 stale / 0 never / 0 unparsed of " + out.total + " metrics (" + out.fresh + " fresh" + (out.undefined ? ", " + out.undefined + " UNDEFINED excluded: " + out.undefined_metrics.join(",") : "") + (out.unmeasured ? ", " + out.unmeasured + " never-measured UNMEASURED excluded: " + out.unmeasured_metrics.join(",") : "") + ")";
        await env.QNFO_AUDIT.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, remediation, close_evidence) VALUES (?1, 'METRIC-STALENESS-SELF-CLOSE-1', 'resolved', 'qnfo-lifecycle', datetime('now'), 'auditor verdict: registry fresh', ?2) ON CONFLICT(issue_id) DO UPDATE SET close_evidence=excluded.close_evidence, triage_state='resolved'").bind(ox.id, evd).run();
        await env.QNFO_AUDIT.prepare("UPDATE agent_issues SET status='resolved', close_channel='lifecycle-metric-freshness', updated_at=? WHERE id=? AND status='open'").bind(nowMs, ox.id).run();
        out.closed_issue = ox.id;
      }
    } catch (e) { out.close_error = e.message; }
  }
  if (remaining > 0) {
    var title = "METRIC-REGISTRY-STALENESS-1: metric_registry rows exceed their declared refresh cadence";
    var desc = remaining + "/" + out.total + " metrics not fresh at " + nowIso + " :: " + offenders.slice(0, 40).join("; ") + (out.undefined ? " || excluded as UNDEFINED (definition gap, not staleness): " + out.undefined_metrics.join(", ") : "") + (out.unmeasured ? " || awaiting a first reading (state UNMEASURED or n/a, never refreshed; a measurement gap, not staleness): " + out.unmeasured_metrics.join(", ") : "");
    try {
      var ex = await env.QNFO_AUDIT.prepare("SELECT id FROM agent_issues WHERE status = 'open' AND title = ? LIMIT 1").bind(title).first();
      if (ex && ex.id) {
        await env.QNFO_AUDIT.prepare("UPDATE agent_issues SET description = ?, updated_at = ? WHERE id = ?").bind(desc, nowMs, ex.id).run();
        out.updated_issue = true;
      } else {
        await env.QNFO_AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(title, desc, "qnfo-lifecycle-metric-freshness", "observability", "high", "open", nowMs, nowMs).run();
        out.filed_issue = true;
      }
    } catch (e) { out.issue_error = e.message; }
  }
  return out;
}
async function handleMetricsRefresh(env, origin) {
  var result = await runMetricFreshness(env);
  return new Response(JSON.stringify(result), { headers: corsHeaders(origin) });
}
async function runLifecycle(env) {
  console.log("[lifecycle] scanning inactive projects...");
  try {
    var now = /* @__PURE__ */ new Date();
    var res = await env.PORTFOLIO_STATE.prepare("SELECT id, name, status, updated_at FROM resources WHERE type='project'").all();
    var staleCount = 0, archivedCount = 0;
    for (var i = 0; i < (res.results || []).length; i++) {
      var r = res.results[i];
      if (!r.updated_at) continue;
      var days = (now.getTime() - new Date(r.updated_at).getTime()) / 864e5;
      var newStatus = r.status;
      if (days >= 180) newStatus = "ARCHIVED";
      else if (days >= 90) newStatus = "STALE";
      else newStatus = "ACTIVE";
      if (newStatus !== r.status) {
        await env.PORTFOLIO_STATE.prepare("UPDATE resources SET status=?, updated_at=updated_at WHERE id=?").bind(newStatus, r.id).run();
        if (newStatus === "STALE") staleCount++;
        if (newStatus === "ARCHIVED") archivedCount++;
      }
    }
    console.log("[lifecycle] transitions: " + staleCount + " -> STALE, " + archivedCount + " -> ARCHIVED");
  } catch (e) {
    console.error("[lifecycle] runLifecycle error:", e.message);
  }
}
__name(runLifecycle, "runLifecycle");
__name2(runLifecycle, "runLifecycle");
__name22(runLifecycle, "runLifecycle");
__name222(runLifecycle, "runLifecycle");
__name2222(runLifecycle, "runLifecycle");
__name22222(runLifecycle, "runLifecycle");
__name222222(runLifecycle, "runLifecycle");
async function runGraphSeed(env) {
  console.log("[lifecycle] re-seeding graph snapshot...");
  try {
    var nc = await env.QNFO_GRAPH.prepare("SELECT COUNT(*) as c FROM nodes").first();
    var ec = await env.QNFO_GRAPH.prepare("SELECT COUNT(*) as c FROM edges").first();
    await env.QNFO_AUDIT.prepare("INSERT INTO audit_sessions (session_id, agent, start_time, end_time, tasks_completed, tasks_total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("graph-seed-" + Date.now(), "qnfo-lifecycle-cron", (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString(), 1, 1, "Monthly graph snapshot: " + (nc?.c || 0) + " nodes, " + (ec?.c || 0) + " edges").run();
  } catch (e) {
    console.error("[lifecycle] runGraphSeed error:", e.message);
  }
}
__name(runGraphSeed, "runGraphSeed");
__name2(runGraphSeed, "runGraphSeed");
__name22(runGraphSeed, "runGraphSeed");
__name222(runGraphSeed, "runGraphSeed");
__name2222(runGraphSeed, "runGraphSeed");
__name22222(runGraphSeed, "runGraphSeed");
__name222222(runGraphSeed, "runGraphSeed");
async function runBackup(env) {
  console.log("[lifecycle] running backup...");
  var dateStamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  var results = {};
  try {
    var tables = [
      { db: env.PORTFOLIO_STATE, name: "portfolio-state", table: "resources" },
      { db: env.QNFO_AUDIT, name: "qnfo-audit", table: "audit_sessions" },
      { db: env.LIVING_PAPER, name: "living-paper", table: "papers" },
      { db: env.IPATENT_DB, name: "ipatent-db", table: "submissions" }
    ];
    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];
      try {
        var rows = await t.db.prepare("SELECT * FROM " + t.table).all();
        var json = JSON.stringify(rows.results || []);
        await env.BACKUP_BUCKET.put(t.name + "/" + t.table + "-" + dateStamp + ".json", json, { httpMetadata: { contentType: "application/json" } });
        results[t.name] = rows.results?.length || 0;
      } catch (e) {
        results[t.name] = "error: " + e.message;
      }
    }
    return { status: "backup-complete", dateStamp, results };
  } catch (e) {
    return { status: "backup-failed", error: e.message };
  }
}
__name(runBackup, "runBackup");
__name2(runBackup, "runBackup");
__name22(runBackup, "runBackup");
__name222(runBackup, "runBackup");
__name2222(runBackup, "runBackup");
__name22222(runBackup, "runBackup");
__name222222(runBackup, "runBackup");
async function runDriftAudit(env) {
  console.log("[lifecycle] running ENHANCED drift audit...");
  var result = { status: "drift-checked", timestamp: (/* @__PURE__ */ new Date()).toISOString(), portfolioState: {}, liveState: {}, drift: [], warnings: [] };
  try {
    var project = await env.PORTFOLIO_STATE.prepare("SELECT COUNT(*) as c FROM resources WHERE type='project'").first();
    var worker = await env.PORTFOLIO_STATE.prepare("SELECT COUNT(*) as c FROM resources WHERE type='worker'").first();
    var workerNames = await env.PORTFOLIO_STATE.prepare("SELECT name FROM resources WHERE type='worker'").all();
    result.portfolioState = { projects: project?.c || 0, workers: worker?.c || 0, workerNames: workerNames.results?.map(function(r) {
      return r.name;
    }) || [] };
  } catch (e) {
    result.warnings.push("portfolio-state query failed: " + e.message);
  }
  if (env.CF_API_TOKEN) {
    try {
      var apiResp = await fetch("https://api.cloudflare.com/client/v4/accounts/edb167b78c9fb901ea5bca3ce58ccc4b/workers/scripts", { headers: { Authorization: "Bearer " + env.CF_API_TOKEN, "Content-Type": "application/json" } });
      if (apiResp.ok) {
        var data = await apiResp.json();
        var liveWorkers = data.result || [];
        result.liveState = { workers: liveWorkers.length, workerNames: liveWorkers.map(function(w) {
          return w.id;
        }) };
        var portfolioNames = new Set(result.portfolioState.workerNames || []);
        var liveNames = new Set(result.liveState.workerNames || []);
        liveNames.forEach(function(lw) {
          if (!portfolioNames.has(lw)) result.drift.push({ type: "missing_in_portfolio", worker: lw });
        });
        portfolioNames.forEach(function(pw) {
          if (!liveNames.has(pw)) result.drift.push({ type: "stale_in_portfolio", worker: pw });
        });
      } else {
        result.warnings.push("Cloudflare API returned HTTP " + apiResp.status);
      }
    } catch (e) {
      result.warnings.push("Cloudflare API fetch failed: " + e.message);
    }
  } else {
    result.warnings.push("CF_API_TOKEN not configured - live comparison skipped");
  }
  result.driftCount = result.drift.length;
  result.verdict = result.drift.length === 0 ? "CLEAN" : "DRIFT_DETECTED";
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO audit_sessions (session_id, agent, start_time, end_time, tasks_completed, tasks_total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("drift-" + Date.now(), "qnfo-lifecycle-cron", (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString(), result.drift.length === 0 ? 1 : 0, 1, "Drift audit: " + result.driftCount + " drifts. Verdict: " + result.verdict).run();
  } catch (e) {
  }
  return result;
}
__name(runDriftAudit, "runDriftAudit");
__name2(runDriftAudit, "runDriftAudit");
__name22(runDriftAudit, "runDriftAudit");
__name222(runDriftAudit, "runDriftAudit");
__name2222(runDriftAudit, "runDriftAudit");
__name22222(runDriftAudit, "runDriftAudit");
__name222222(runDriftAudit, "runDriftAudit");
async function runSecretsAudit(env) {
  console.log("[lifecycle] running ENHANCED secrets audit...");
  var result = { status: "secrets-audited", timestamp: (/* @__PURE__ */ new Date()).toISOString(), metadataStaleness: [], workerSecrets: [], findings: [], recommendations: [] };
  try {
    var stale = await env.PORTFOLIO_STATE.prepare("SELECT id, name FROM resources WHERE type='project' AND updated_at < datetime('now', '-180 days')").all();
    result.metadataStaleness = (stale.results || []).map(function(r) {
      return r.name;
    });
    if (result.metadataStaleness.length > 0) result.findings.push(result.metadataStaleness.length + " projects with stale metadata (>180d)");
  } catch (e) {
    result.findings.push("Metadata staleness check error: " + e.message);
  }
  if (env.CF_API_TOKEN) {
    try {
      var apiResp = await fetch("https://api.cloudflare.com/client/v4/accounts/edb167b78c9fb901ea5bca3ce58ccc4b/workers/scripts", { headers: { Authorization: "Bearer " + env.CF_API_TOKEN, "Content-Type": "application/json" } });
      if (apiResp.ok) {
        var data = await apiResp.json();
        var workers = data.result || [];
        for (var i = 0; i < workers.length; i++) {
          var w = workers[i];
          try {
            var secretsResp = await fetch("https://api.cloudflare.com/client/v4/accounts/edb167b78c9fb901ea5bca3ce58ccc4b/workers/scripts/" + w.id + "/secrets", { headers: { Authorization: "Bearer " + env.CF_API_TOKEN } });
            if (secretsResp.ok) {
              var secretsData = await secretsResp.json();
              var secrets = secretsData.result || [];
              result.workerSecrets.push({ worker: w.id, secretCount: secrets.length, secretNames: secrets.map(function(s2) {
                return s2.name;
              }) });
              for (var s = 0; s < secrets.length; s++) {
                var sn = secrets[s];
                var nameUpper = (sn.name || "").toUpperCase();
                if (nameUpper.includes("TOKEN") || nameUpper.includes("API_KEY") || nameUpper.includes("SECRET")) {
                  result.findings.push("High-risk secret '" + sn.name + "' in Worker '" + w.id + "' - verify rotation age");
                }
              }
            }
          } catch (e) {
            result.findings.push("Failed to query secrets for " + w.id + ": " + e.message);
          }
        }
      }
    } catch (e) {
      result.findings.push("Cloudflare API fetch failed: " + e.message);
    }
  } else {
    result.recommendations.push("CF_API_TOKEN not configured - Worker secrets audit skipped");
  }
  var DOCUMENTED_SECRETS = ["CLOUDFLARE_API_TOKEN", "GITHUB_TOKEN", "ZENODO_API_TOKEN", "BUFFER_ACCESS_TOKEN", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "PINATA_API_KEY", "PINATA_API_SECRET", "PINATA_JWT", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "BUFFER_CLIENT_ID", "BUFFER_CLIENT_SECRET", "ADMIN_API_TOKEN", "ADMIN_TOKEN", "CF_API_TOKEN"];
  var documentedSet = new Set(DOCUMENTED_SECRETS.map(function(s2) {
    return s2.toUpperCase();
  }));
  for (var i = 0; i < result.workerSecrets.length; i++) {
    var ws = result.workerSecrets[i];
    for (var j = 0; j < ws.secretNames.length; j++) {
      if (!documentedSet.has(ws.secretNames[j].toUpperCase())) {
        result.findings.push("UNDOCUMENTED secret '" + ws.secretNames[j] + "' in Worker '" + ws.worker + "'");
      }
    }
  }
  result.recommendations.push("Rotation check: secrets older than 90 days need rotation.");
  try {
    var govRows = await env.PORTFOLIO_STATE.prepare("SELECT policy_id, title, review_date, status, summary FROM governance_policies WHERE policy_id IN ('GOV-POL-004','GOV-REPORT-002')").all();
    result.governance = { policies: (govRows.results || []).map(function(r) {
      return { policy_id: r.policy_id, title: r.title, review_date: r.review_date, status: r.status };
    }) };
    var today = /* @__PURE__ */ new Date();
    for (var gi = 0; gi < result.governance.policies.length; gi++) {
      var gp = result.governance.policies[gi];
      if (!gp.review_date) continue;
      var due = /* @__PURE__ */ new Date(gp.review_date + "T00:00:00Z");
      var daysLeft = Math.round((due - today) / 864e5);
      gp.daysToReview = daysLeft;
      if (daysLeft < 0) {
        result.findings.push("GOV-OVERDUE: " + gp.policy_id + " review overdue by " + Math.abs(daysLeft) + " days (" + gp.review_date + ")");
      } else if (daysLeft <= 14) {
        result.recommendations.push("GOV-DUE: " + gp.policy_id + " review due in " + daysLeft + " days (" + gp.review_date + ")");
      }
    }
    var tokResp = await fetch("https://api.cloudflare.com/client/v4/accounts/edb167b78c9fb901ea5bca3ce58ccc4b/workers/scripts?per_page=1", { headers: { Authorization: "Bearer " + env.CF_API_TOKEN } });
    if (tokResp.ok) {
      result.findings.push("TOKEN-OK: CLOUDFLARE_API_TOKEN valid for Workers API (GOV-POL-004 compliance)");
    } else {
      result.findings.push("TOKEN-REVIEW: CLOUDFLARE_API_TOKEN Workers API probe HTTP " + tokResp.status + " (rotation deadline check per GOV-POL-004 90d schedule)");
    }
  } catch (e) {
    result.findings.push("Governance check error: " + e.message);
  }
  result.totalFindings = result.findings.length;
  result.totalRecommendations = result.recommendations.length;
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO audit_sessions (session_id, agent, start_time, end_time, tasks_completed, tasks_total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("secrets-" + Date.now(), "qnfo-lifecycle-cron", (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString(), 1, 1, "Secrets audit: " + result.totalFindings + " findings").run();
  } catch (e) {
  }
  return result;
}
__name(runSecretsAudit, "runSecretsAudit");
__name2(runSecretsAudit, "runSecretsAudit");
__name22(runSecretsAudit, "runSecretsAudit");
__name222(runSecretsAudit, "runSecretsAudit");
__name2222(runSecretsAudit, "runSecretsAudit");
__name22222(runSecretsAudit, "runSecretsAudit");
__name222222(runSecretsAudit, "runSecretsAudit");
async function runSync(env) {
  console.log("[lifecycle] syncing registry...");
  var out = { status: "registry-synced", checked: 0, updated: 0, failed: 0, changes: [] };
  try {
    var rows = await env.QNFO_AUDIT.prepare("SELECT service, version, base_url FROM service_registry").all();
    var list = rows.results || [];
    var probe = async function(r) {
      out.checked++;
      var url = (r.base_url || ("https://" + r.service + ".q08.workers.dev")).replace(/\/+$/, "");
      try {
        var resp = await fetch(url + "/health", { signal: AbortSignal.timeout(6000) });
        if (!resp.ok) { out.failed++; return; }
        var t = (await resp.text()).replace(/\s+/g, " ");
        var m = t.match(/"version"\s*:\s*"([^"]{1,60})"/);
        var live = m && m[1] ? m[1] : null;
        if (!live) { out.failed++; return; }
        if (live !== r.version) {
          await env.QNFO_AUDIT.prepare("UPDATE service_registry SET version=?1, updated_at=?2 WHERE service=?3").bind(live, new Date().toISOString(), r.service).run();
          out.updated++;
          if (out.changes.length < 30) out.changes.push(r.service + ": " + (r.version || "null") + " -> " + live);
        }
      } catch (e) { out.failed++; }
    };
    for (var i = 0; i < list.length; i += 10) {
      await Promise.all(list.slice(i, i + 10).map(probe));
    }
  } catch (e) { out.error = String(e && e.message || e).slice(0, 160); }
  console.log("[lifecycle] registry sync: checked=" + out.checked + " updated=" + out.updated + " failed=" + out.failed);
  return out;
}
__name(runSync, "runSync");
__name2(runSync, "runSync");
__name22(runSync, "runSync");
__name222(runSync, "runSync");
__name2222(runSync, "runSync");
__name22222(runSync, "runSync");
__name222222(runSync, "runSync");
async function runPing(env) {
  console.log("[lifecycle] infra ping...");
  var targets = ["https://qnfo-gateway.q08.workers.dev/health", "https://qnfo-archive.q08.workers.dev/health"];
  for (var i = 0; i < targets.length; i++) {
    try {
      var r = await fetch(targets[i], { method: "GET" });
      if (!r.ok) console.error("[lifecycle] PING FAIL " + targets[i] + ": HTTP " + r.status);
    } catch (e) {
      console.error("[lifecycle] PING ERROR " + targets[i] + ": " + e.message);
    }
  }
}
__name(runPing, "runPing");
__name2(runPing, "runPing");
__name22(runPing, "runPing");
__name222(runPing, "runPing");
__name2222(runPing, "runPing");
__name22222(runPing, "runPing");
__name222222(runPing, "runPing");
var MEM_DECAY_HALF_LIFE_DAYS = 90;
var MEM_PRUNE_EFFECTIVE_IMPORTANCE = 0.1;
async function runMemoryMaintain(env, opts) {
  opts = opts || {};
  var commit = !!opts.commit;
  var result = { status: "memory-maintained", plane: "qnfo", commit, timestamp: (/* @__PURE__ */ new Date()).toISOString(), scanned: 0, decayed: 0, expired: 0, deduped: 0, pruned: 0, ids: [] };
  try {
    var rows = await env.QNFO_GRAPH.prepare("SELECT id, category, content, summary, importance, session_id, created_at, expires_at FROM agent_memories").all();
    var mems = rows.results || [];
    result.scanned = mems.length;
    var now = Date.now();
    var pruneIds = /* @__PURE__ */ new Set();
    for (var i = 0; i < mems.length; i++) {
      var m = mems[i];
      var importance = m.importance != null ? Number(m.importance) : 0.7;
      if (m.expires_at) {
        var exp = new Date(m.expires_at).getTime();
        if (!isNaN(exp) && exp <= now) {
          pruneIds.add(m.id);
          result.expired++;
          continue;
        }
      }
      var created = new Date(m.created_at).getTime();
      if (isNaN(created)) continue;
      var ageDays = (now - created) / 864e5;
      var effective = importance * Math.pow(0.5, ageDays / MEM_DECAY_HALF_LIFE_DAYS);
      if (effective < MEM_PRUNE_EFFECTIVE_IMPORTANCE) {
        pruneIds.add(m.id);
        result.decayed++;
      }
    }
    var byCat = {};
    for (var j = 0; j < mems.length; j++) {
      var mm = mems[j];
      if (pruneIds.has(mm.id)) continue;
      var key = mm.category + "::" + String(mm.content || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (!byCat[key]) byCat[key] = [];
      byCat[key].push(mm);
    }
    for (var k in byCat) {
      var group = byCat[k];
      if (group.length < 2) continue;
      group.sort(function(a, b) {
        return (Number(b.importance) || 0) - (Number(a.importance) || 0);
      });
      for (var g = 1; g < group.length; g++) {
        var dup = group[g];
        if (pruneIds.has(dup.id)) continue;
        pruneIds.add(dup.id);
        result.deduped++;
      }
    }
    if (commit && pruneIds.size) {
      var ids = Array.from(pruneIds);
      for (var c = 0; c < ids.length; c += 100) {
        var chunk = ids.slice(c, c + 100);
        var ph = chunk.map(function() {
          return "?";
        }).join(",");
        await env.QNFO_GRAPH.prepare("DELETE FROM agent_memories WHERE id IN (" + ph + ")").bind(...chunk).run();
        await env.PAPER_VZ.deleteByIds(chunk).catch(function(e) {
          console.error("[lifecycle] VZ delete error:", e.message);
        });
      }
    }
    result.pruned = pruneIds.size;
    result.ids = Array.from(pruneIds).slice(0, 50);
    if (commit) {
      await env.QNFO_AUDIT.prepare("INSERT INTO audit_sessions (session_id, agent, start_time, end_time, tasks_completed, tasks_total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("memory-maintain-" + Date.now(), "qnfo-lifecycle-cron", (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString(), 1, 1, "Memory maintain: " + result.scanned + " scanned, " + result.pruned + " pruned").run().catch(function() {
      });
    }
  } catch (e) {
    result.error = e.message;
  }
  return result;
}
__name(runMemoryMaintain, "runMemoryMaintain");
__name2(runMemoryMaintain, "runMemoryMaintain");
async function handleMemoryMaintain(request, env, origin) {
  var q = new URL(request.url).searchParams;
  var commit = q.get("commit") === "1" || q.get("commit") === "true";
  var result = await runMemoryMaintain(env, { commit });
  return new Response(JSON.stringify(result), { headers: corsHeaders(origin) });
}
__name(handleMemoryMaintain, "handleMemoryMaintain");
__name2(handleMemoryMaintain, "handleMemoryMaintain");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map