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
var worker_default = {
  async fetch(request, env) {
    const u = new URL(request.url), p = u.pathname;
    const origin = request.headers.get("Origin") || "https://qnfo.org";
    const h = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (p === "/health") return health(env, origin);
    if (p === "/status") return handleStatus(env, origin);
    if (p === "/run/drift") return handleDrift(env, origin);
    if (p === "/run/backup") return handleBackup(env, origin);
    if (p === "/run/secrets-audit") return handleSecretsAudit(env, origin);
    if (p === "/run/ula-check") return handleUlaCheck(env, origin);
    if (p === "/run/memory-maintain") return handleMemoryMaintain(request, env, origin);
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: h });
  },
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    console.log("[qnfo-lifecycle] cron triggered:", cron);
    try {
      if (cron === "0 3 * * *") await runLifecycle(env);
      else if (cron === "0 0 1 * *") await runGraphSeed(env);
      else if (cron === "0 5 * * *") await runBackup(env);
      else if (cron === "0 6 * * *") await runDriftAudit(env);
      else if (cron === "0 7 * * *") await runUlaCheck(env);
      else if (cron === "0 8 * * 1") await runSecretsAudit(env);
      else if (cron === "0 4 * * *") await runMemoryMaintain(env, { commit: true });
      else if (cron === "0 * * * *") await runSync(env);
      else if (cron === "*/30 * * * *") await runPing(env);
    } catch (e) {
      console.error("[qnfo-lifecycle] cron error:", e.message);
    }
  }
};
function health(env, origin) {
  const h = corsHeaders(origin);
  return new Response(JSON.stringify({
    status: "ok",
    worker: "qnfo-lifecycle",
    version: "1.6.1-memory-maintain-fixed",
    cronSchedules: 9,
    features: ["lifecycle-scan", "graph-seed", "backup", "drift-audit-enhanced", "secrets-audit-enhanced", "registry-sync", "infra-ping", "ula-check", "memory-maintain"],
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
