var m0 = (function(){
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// fleet.js
var FLEET = [
  "calendar-api",
  "events-radar",
  "fleet-executor",
  "fleet-scheduler",
  "jnl-referee",
  "jnl-reviser",
  "jnl-watch",
  "jnl-zenodo",
  "job-market-watch",
  "obsidian-writer",
  "osf-integrity-check",
  "personal-api",
  "personal-events-radar",
  "personal-life-indexer",
  "personal-life-maintain",
  "personal-life-search",
  "qnfo-agent-orchestrator",
  "qnfo-agent-ws",
  "qnfo-ai",
  "qnfo-ai-calibration",
  "qnfo-ai-search",
  "qnfo-analytics",
  "qnfo-archive",
  "qnfo-arxiv-radar",
  "qnfo-auditor",
  "qnfo-backlog-exec",
  "qnfo-blank-audit",
  "qnfo-chat-canary",
  "qnfo-citation-watch",
  "qnfo-cloud-ops",
  "qnfo-code-agent",
  "qnfo-code-orchestrator",
  "qnfo-container-executor",
  "qnfo-containers-pilot",
  "qnfo-ddocs-indexer",
  "qnfo-email",
  "qnfo-email-orchestrator",
  "qnfo-errata-orchestrator",
  "qnfo-errata-publish",
  "qnfo-errata-respond",
  "qnfo-errata-watch",
  "qnfo-error-selfheal",
  "qnfo-events",
  "qnfo-fleet-advisor",
  "qnfo-fleet-calibrator",
  "qnfo-fleet-dashboard",
  "qnfo-fleet-deploy",
  "qnfo-gateway",
  "qnfo-idea-factory",
  "qnfo-idea-miner",
  "qnfo-idea-triage",
  "qnfo-impact",
  "qnfo-infra",
  "qnfo-intent-orchestrator",
  "qnfo-ipatent",
  "qnfo-kaizen",
  "qnfo-lifecycle",
  "qnfo-memory-mcp",
  "qnfo-observability",
  "qnfo-ops",
  "qnfo-outreach",
  "qnfo-paper-explainer",
  "qnfo-paper-indexer",
  "qnfo-paper-reviser",
  "qnfo-pdf",
  "qnfo-pipeline-ops",
  "qnfo-proof",
  "qnfo-qwav",
  "qnfo-register-guard",
  "qnfo-research-exec",
  "qnfo-research-radar",
  "qnfo-research-supervisor",
  "qnfo-skill-sync",
  "qnfo-skills-discovery",
  "qnfo-social",
  "qnfo-thread-ingest",
  "qnfo-tools-mcp",
  "qnfo-twin-maintain",
  "research-daily-brief",
  "qnfo-scorecard"
];

// worker.js
var VERSION = "1.1.3";
var NAME = "qnfo-observability";
var KNOWN = new Set(FLEET);
var INGEST_CAP_FILES = 300;
var RETENTION_DAYS = 30;
var UA = "qnfo-observability/" + VERSION;
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
__name(json, "json");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}
__name(fnv1a, "fnv1a");
async function ensureSchema(env) {
  await env.AUDIT.prepare(`CREATE TABLE IF NOT EXISTS worker_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_hash TEXT UNIQUE NOT NULL,
    ts_ms INTEGER NOT NULL,
    ingested_at TEXT NOT NULL,
    script_name TEXT NOT NULL,
    event_type TEXT,
    outcome TEXT,
    url TEXT,
    method TEXT,
    status INTEGER,
    cpu_ms REAL,
    wall_ms REAL,
    logs_json TEXT,
    exceptions_json TEXT
  )`).run();
  await env.AUDIT.prepare("CREATE INDEX IF NOT EXISTS idx_worker_logs_script_ts ON worker_logs(script_name, ts_ms)").run();
  await env.AUDIT.prepare("CREATE INDEX IF NOT EXISTS idx_worker_logs_ts ON worker_logs(ts_ms)").run();
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS trace_ingest_state (k TEXT PRIMARY KEY, v TEXT)").run();
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS integration_state (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, json TEXT)").run();
}
__name(ensureSchema, "ensureSchema");
async function getCursor(env) {
  const r = await env.AUDIT.prepare("SELECT v FROM trace_ingest_state WHERE k = ?").bind("last_key").first();
  return r ? r.v : "";
}
__name(getCursor, "getCursor");
async function setCursor(env, key) {
  await env.AUDIT.prepare("INSERT INTO trace_ingest_state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind("last_key", key).run();
}
__name(setCursor, "setCursor");
async function gunzip(buf) {
  const ds = new DecompressionStream("gzip");
  const stream = new Response(new Blob([buf])).body.pipeThrough(ds);
  return await new Response(stream).text();
}
__name(gunzip, "gunzip");
function parseLine(line, ingestedAt) {
  if (!line || !line.trim()) return null;
  let r;
  try {
    r = JSON.parse(line);
  } catch (e) {
    return null;
  }
  const ev = r.Event || {};
  const req = ev.Request || {};
  const resp = ev.Response || {};
  const hash = fnv1a(line);
  return {
    hash,
    ts: Number(r.EventTimestampMs) || 0,
    ingestedAt,
    script: String(r.ScriptName || "").slice(0, 120),
    type: String(r.EventType || "").slice(0, 60),
    outcome: String(r.Outcome || "").slice(0, 60),
    url: String(req.URL || "").slice(0, 400),
    method: String(req.Method || "").slice(0, 12),
    status: resp.Status == null ? null : Number(resp.Status),
    cpu: r.CPUTimeMs == null ? null : Number(r.CPUTimeMs),
    wall: r.WallTimeMs == null ? null : Number(r.WallTimeMs),
    logs: r.Logs && r.Logs.length ? JSON.stringify(r.Logs).slice(0, 2e3) : null,
    exc: r.Exceptions && r.Exceptions.length ? JSON.stringify(r.Exceptions).slice(0, 2e3) : null
  };
}
__name(parseLine, "parseLine");
async function ingestTrace(env) {
  await ensureSchema(env);
  const cursor0 = await getCursor(env);
  const cutoff = "workers_trace/" + new Date(Date.now() - 72 * 3600 * 1e3).toISOString().slice(0, 10).replace(/-/g, "");
  const cursor = cursor0 || cutoff;
  let listed;
  try {
    listed = await env.LOGS.list({ prefix: "workers_trace/", limit: 1e3 });
  } catch (e) {
    return { files: 0, inserted: 0, dupes: 0, errors: 1, lastKey: cursor, note: "list failed: " + e.message };
  }
  const files = (listed.objects || []).map((o) => o.key).filter((k) => k.endsWith(".log.gz") && !k.includes("/test")).filter((k) => k > cursor).sort().slice(0, INGEST_CAP_FILES);
  let inserted = 0, dupes = 0, errors = 0, filesDone = 0, lastKey = cursor;
  const ingestedAt = nowIso();
  for (const key of files) {
    try {
      const obj = await env.LOGS.get(key);
      if (!obj) {
        continue;
      }
      const buf = new Uint8Array(await obj.arrayBuffer());
      const text = await gunzip(buf);
      for (const line of text.split("\n")) {
        const row = parseLine(line, ingestedAt);
        if (!row) continue;
        const res = await env.AUDIT.prepare("INSERT OR IGNORE INTO worker_logs (event_hash, ts_ms, ingested_at, script_name, event_type, outcome, url, method, status, cpu_ms, wall_ms, logs_json, exceptions_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(row.hash, row.ts, row.ingestedAt, row.script, row.type, row.outcome, row.url, row.method, row.status, row.cpu, row.wall, row.logs, row.exc).run();
        if (res.meta && res.meta.changes) inserted++;
        else dupes++;
      }
      lastKey = key;
      filesDone++;
      if (filesDone % 25 === 0 && lastKey !== cursor) await setCursor(env, lastKey);
    } catch (e) {
      errors++;
    }
  }
  if (lastKey !== cursor) await setCursor(env, lastKey);
  await env.AUDIT.prepare("DELETE FROM worker_logs WHERE ts_ms < ?").bind(Date.now() - RETENTION_DAYS * 864e5).run();
  return { files: files.length, inserted, dupes, errors, lastKey };
}
__name(ingestTrace, "ingestTrace");
async function digest(env, ingestResult) {
  const dayAgo = Date.now() - 864e5;
  const agg = await env.AUDIT.prepare(`SELECT script_name, COUNT(*) n, SUM(CASE WHEN outcome != 'ok' OR status >= 500 THEN 1 ELSE 0 END) bad, MAX(ts_ms) last_ts, MAX(status) max_status
    FROM worker_logs WHERE ts_ms >= ? GROUP BY script_name`).bind(dayAgo).all();
  const rows = agg.results || [];
  const seen = new Set(rows.map((r) => r.script_name));
  const summary = {
    generated_at: nowIso(),
    version: VERSION,
    ingest: ingestResult,
    total_events_24h: rows.reduce((a, r) => a + r.n, 0),
    workers_seen_24h: rows.length,
    workers_silent_24h: FLEET.filter((w) => !seen.has(w)),
    anomalies: []
  };
  for (const r of rows) {
    const ratio = r.bad / r.n;
    if (r.n >= 20 && ratio > 0.5) {
      summary.anomalies.push({ worker: r.script_name, events: r.n, bad: r.bad, ratio: Math.round(ratio * 100) / 100 });
      await env.AUDIT.prepare("INSERT INTO alerts (source, level, message, digested) VALUES (?, ?, ?, 0)").bind(NAME, "warning", NAME + ": " + r.script_name + " error ratio " + Math.round(ratio * 100) + "% (" + r.bad + "/" + r.n + " last 24h)").run();
    }
  }
  const id = "fleet-obs-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 13) + "-digest";
  await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, nowIso(), "fleet-observability-digest", "Fleet observability digest: " + rows.length + " workers logged " + summary.total_events_24h + " events in 24h; " + summary.anomalies.length + " anomalies", JSON.stringify(summary), NAME, "ok").run();
  return summary;
}
__name(digest, "digest");
async function logEvent(env, body, req) {
  const w = String(body.worker || "").slice(0, 120);
  if (!w) return json({ ok: false, error: "worker required" }, 400);
  const row = {
    hash: "c" + fnv1a(nowIso() + "|" + w + "|" + String(body.event || "") + "|" + Math.random().toString(36).slice(2)),
    ts: Date.now(),
    ingestedAt: nowIso(),
    script: w,
    type: "custom:" + String(body.event || "event").slice(0, 40),
    outcome: "log",
    url: null,
    method: null,
    status: null,
    cpu: null,
    wall: null,
    logs: JSON.stringify({ level: String(body.level || "info").slice(0, 20), message: String(body.message || "").slice(0, 1e3), data: body.data ?? null, registered: KNOWN.has(w) }).slice(0, 2e3),
    exc: null
  };
  await ensureSchema(env);
  await env.AUDIT.prepare("INSERT OR IGNORE INTO worker_logs (event_hash, ts_ms, ingested_at, script_name, event_type, outcome, url, method, status, cpu_ms, wall_ms, logs_json, exceptions_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(row.hash, row.ts, row.ingestedAt, row.script, row.type, row.outcome, row.url, row.method, row.status, row.cpu, row.wall, row.logs, row.exc).run();
  return json({ ok: true, hash: row.hash });
}
__name(logEvent, "logEvent");
function ageHours(iso) {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  if (isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / 36e5);
}
__name(ageHours, "ageHours");
var INTEGRATION_CHAINS = [
  {
    id: "fleet-pulse",
    name: "Scheduler -> Executor pulse",
    producer: "fleet-scheduler",
    consumer: "fleet-executor",
    medium: "fleet_runs",
    sql: "SELECT COUNT(*) n, MAX(started_at) latest FROM fleet_runs WHERE started_at >= datetime('now','-15 minutes')",
    max: null,
    minOk: 3,
    want: ">=3 pulse runs / 15min (heartbeat closed loop)"
  },
  {
    id: "errata",
    name: "Errata watch -> respond -> publish",
    producer: "errata-watch / email",
    consumer: "errata-respond / errata-publish",
    medium: "errata_queue",
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM errata_queue WHERE status NOT IN ('done','published','resolved','superseded','implemented')",
    max: 10,
    minOk: null,
    want: "pending <= 10"
  },
  {
    id: "ideas",
    name: "Idea intake -> triage",
    producer: "edge form / idea-miner / auto-scan",
    consumer: "idea-triage",
    medium: "idea_proposals",
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM idea_proposals WHERE status = 'new'",
    max: 30,
    minOk: null,
    want: "new <= 30"
  },
  {
    id: "intents",
    name: "Intent intake -> orchestrator",
    producer: "calendar-api / edge",
    consumer: "qnfo-intent-orchestrator",
    medium: "intents",
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM intents WHERE status = 'pending'",
    max: 20,
    minOk: null,
    want: "pending <= 20"
  },
  {
    id: "version-drain",
    name: "Reviser -> research-exec publish drain",
    producer: "qnfo-paper-reviser",
    consumer: "qnfo-research-exec",
    medium: "version_queue",
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM version_queue WHERE status = 'drafted'",
    max: 5,
    minOk: null,
    want: "drafted <= 5"
  },
  {
    id: "outreach",
    name: "Outreach queue -> campaign engine",
    producer: "register / ops",
    consumer: "qnfo-outreach",
    medium: "outreach_queue",
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM outreach_queue WHERE status = 'pending'",
    max: 20,
    minOk: null,
    want: "pending <= 20"
  },
  {
    id: "issues",
    name: "Chat failures -> kaizen digest",
    producer: "ops gateway",
    consumer: "qnfo-kaizen",
    medium: "agent_issues",
    sql: "SELECT COUNT(*) n FROM agent_issues WHERE status = 'open'",
    max: 10,
    minOk: null,
    want: "open <= 10"
  },
  {
    id: "alerts",
    name: "Alerts -> digest consumer",
    producer: "qnfo-observability",
    consumer: "ops digest",
    medium: "alerts",
    sql: "SELECT COUNT(*) n FROM alerts WHERE digested = 0",
    max: 5,
    minOk: null,
    want: "undigested <= 5"
  },
  {
    id: "email",
    name: "Inbound email -> triage",
    producer: "SMTP gateway",
    consumer: "qnfo-email workers",
    medium: "emails",
    sql: "SELECT COUNT(*) n FROM emails WHERE status = 'received'",
    max: 10,
    minOk: null,
    want: "unprocessed <= 10"
  },
  {
    id: "research",
    name: "Research queue -> execution",
    producer: "supervisor / radars",
    consumer: "qnfo-research-exec",
    medium: "research_queue",
    sql: "SELECT COUNT(*) n, MIN(created_at) oldest FROM research_queue WHERE status IN ('pending','ensemble-draft','claimed')",
    max: 10,
    minOk: null,
    want: "queued/active <= 10"
  },
  {
    id: "revisions",
    name: "Revision log -> publish drain",
    producer: "qnfo-paper-reviser",
    consumer: "qnfo-research-exec",
    medium: "paper_revision_log",
    sql: "SELECT COUNT(*) n FROM paper_revision_log WHERE status = 'queued'",
    max: 8,
    minOk: null,
    want: "queued <= 8"
  }
];
async function assessIntegration(env) {
  const chains = [];
  for (let i = 0; i < INTEGRATION_CHAINS.length; i++) {
    const c = INTEGRATION_CHAINS[i];
    const st = { id: c.id, name: c.name, producer: c.producer, consumer: c.consumer, medium: c.medium, status: "unknown", n: null, oldest_h: null, detail: "", metric: c.id === "fleet-pulse" ? "rate" : "queue" };
    try {
      const r = await env.AUDIT.prepare(c.sql).first();
      if (r) {
        st.n = r.n == null ? null : Number(r.n);
        st.oldest_h = ageHours(r.oldest || r.latest);
        if (c.max != null && st.n > c.max) {
          st.status = "stuck";
          st.detail = "backpressure: " + st.n + " waiting (" + c.want + ")";
        } else if (c.minOk != null && st.n < c.minOk) {
          st.status = "degraded";
          st.detail = "below expected activity (" + c.want + ")";
        } else {
          st.status = "healthy";
          st.detail = c.want;
        }
      } else {
        st.n = 0;
        st.status = c.minOk != null ? "degraded" : "healthy";
        st.detail = c.minOk != null ? "no activity in window (" + c.want + ")" : c.want;
      }
    } catch (e) {
      st.detail = "query error: " + String(e && e.message ? e.message : e).slice(0, 70);
    }
    chains.push(st);
  }
  let probed = [], traced = [], invocated = [];
  try {
    const r = await env.AUDIT.prepare("SELECT DISTINCT name FROM fleet_probe_log").all();
    probed = (r.results || []).map(function(x) {
      return x.name;
    });
  } catch (e) {
  }
  try {
    const r = await env.AUDIT.prepare("SELECT DISTINCT script_name FROM worker_logs").all();
    traced = (r.results || []).map(function(x) {
      return x.script_name;
    });
  } catch (e) {
  }
  try {
    const r = await env.AUDIT.prepare("SELECT DISTINCT worker_name FROM worker_invocations").all();
    invocated = (r.results || []).map(function(x) {
      return x.worker_name;
    });
  } catch (e) {
  }
  const probedSet = new Set(probed), tracedSet = new Set(traced), invocatedSet = new Set(invocated);
  const fleetSize = FLEET.length;
  const coverage = {
    fleet_size: fleetSize,
    probed: probedSet.size,
    invocated: invocatedSet.size,
    traced: tracedSet.size,
    probe_gap: FLEET.filter(function(w) {
      return !probedSet.has(w);
    }).length,
    trace_gap: FLEET.filter(function(w) {
      return !tracedSet.has(w);
    }).length
  };
  const decaySignals = [
    ["cloud_ops_events", "SELECT MAX(ts) latest FROM cloud_ops_events"],
    ["fleet_probe_log", "SELECT MAX(ts) latest FROM fleet_probe_log"],
    ["ops_ai_log", "SELECT MAX(ts) latest FROM ops_ai_log"],
    ["deployment_history", "SELECT MAX(deployed_at) latest FROM deployment_history"],
    ["self_heal_actions", "SELECT MAX(ts) latest FROM self_heal_actions"],
    ["issue_ledger", "SELECT MAX(last_seen) latest FROM issue_ledger"]
  ];
  const decay = [];
  for (let i = 0; i < decaySignals.length; i++) {
    const ds = decaySignals[i];
    try {
      const r = await env.AUDIT.prepare(ds[1]).first();
      decay.push({ signal: ds[0], age_h: ageHours(r && r.latest) });
    } catch (e) {
      decay.push({ signal: ds[0], age_h: null, error: String(e && e.message ? e.message : e).slice(0, 50) });
    }
  }
  const opportunities = [];
  for (let i = 0; i < chains.length; i++) {
    const c = chains[i];
    if (c.status === "stuck") opportunities.push({ kind: "backpressure", chain: c.id, text: c.name + ": " + c.detail + " (oldest " + (c.oldest_h == null ? "?" : c.oldest_h.toFixed(1)) + "h)" });
    if (c.status === "degraded") opportunities.push({ kind: "low-activity", chain: c.id, text: c.name + ": " + c.detail });
    if (c.oldest_h != null && c.oldest_h > 72 && c.status === "healthy") opportunities.push({ kind: "stale-item", chain: c.id, text: c.name + ": oldest pending item " + c.oldest_h.toFixed(1) + "h old (under count ceiling but stale)" });
  }
  if (coverage.probe_gap > 0) opportunities.push({ kind: "coverage", text: coverage.probe_gap + " of " + fleetSize + " workers have no liveness probe" });
  if (coverage.trace_gap > 0) opportunities.push({ kind: "trace-gap", text: "Logpush trace coverage: " + coverage.traced + "/" + fleetSize + " workers emit trace events" });
  const noSignal = FLEET.filter(function(w) {
    return !probedSet.has(w) && !tracedSet.has(w) && !invocatedSet.has(w);
  });
  if (noSignal.length > 0) opportunities.push({ kind: "integration-candidate", text: noSignal.length + " workers emit no probe/trace/invocation signal: " + noSignal.slice(0, 8).join(", ") + (noSignal.length > 8 ? ", ..." : "") });
  const chainVals = chains.filter(function(c) {
    return c.status === "healthy" || c.status === "stuck" || c.status === "degraded";
  });
  const chainScore = chainVals.length ? chainVals.reduce(function(a, c) {
    return a + (c.status === "healthy" ? 1 : c.status === "degraded" ? 0.5 : 0);
  }, 0) / chainVals.length : null;
  const coverageScore = Math.min(1, coverage.probed / Math.max(1, fleetSize) * 0.6 + coverage.traced / Math.max(1, fleetSize) * 0.4);
  const decVals = decay.filter(function(d) {
    return d.age_h != null;
  });
  const freshnessScore = decVals.length ? decVals.reduce(function(a, d) {
    return a + Math.max(0, 1 - d.age_h / 48);
  }, 0) / decVals.length : null;
  let total = null;
  if (chainScore != null && freshnessScore != null) {
    total = Math.round(100 * (0.5 * chainScore + 0.3 * coverageScore + 0.2 * freshnessScore));
  }
  const score = {
    total,
    chains: chainScore == null ? null : Math.round(chainScore * 100),
    coverage: Math.round(coverageScore * 100),
    freshness: freshnessScore == null ? null : Math.round(freshnessScore * 100),
    weights: "chains 50% / coverage 30% / freshness 20%"
  };
  const summary = { generated_at: (/* @__PURE__ */ new Date()).toISOString(), version: VERSION, fleet_size: fleetSize, chains, coverage, decay, opportunities, score };
  try {
    await env.AUDIT.prepare("INSERT INTO integration_state (ts, json) VALUES (?, ?)").bind(summary.generated_at, JSON.stringify(summary)).run();
  } catch (e) {
  }
  try {
    const prev = await env.AUDIT.prepare("SELECT json FROM integration_state ORDER BY id DESC LIMIT 1 OFFSET 1").first();
    if (prev && prev.json) {
      const prevS = JSON.parse(prev.json);
      const prevTotal = prevS && prevS.score && typeof prevS.score.total === "number" ? prevS.score.total : null;
      if (prevTotal != null && score.total != null && prevTotal - score.total >= 5) {
        const id = "proactive-sai-drop-" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 13);
        const exists = await env.AUDIT.prepare("SELECT id FROM cloud_ops_events WHERE id = ?1").bind(id).first();
        if (!exists) {
          await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'proactive-alert', ?3, ?4, 'qnfo-observability', 'ok')").bind(id, (/* @__PURE__ */ new Date()).toISOString(), "System integration score dropped " + prevTotal + " -> " + score.total + " (>=5 points). Investigate chains/coverage/decay regression.", JSON.stringify({ prev: prevTotal, now: score.total })).run();
        }
      }
    }
  } catch (e) {
  }
  return summary;
}
__name(assessIntegration, "assessIntegration");
var worker_default = {
  // PRECONDITION: cron trigger 17 * * * *. POSTCONDITION: ingest + digest executed hourly, server-side.
  async scheduled(controller, env, ctx) {
    await ensureSchema(env);
    const r = await ingestTrace(env);
    const summary = await digest(env, r);
    await assessIntegration(env);
    ctx.waitUntil(Promise.resolve());
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, "") || "/";
    await ensureSchema(env);
    if (p === "/health") {
      const cursor = await getCursor(env);
      const agg = await env.AUDIT.prepare("SELECT COUNT(*) n, MAX(ingested_at) latest FROM worker_logs").first();
      return json({ ok: true, name: NAME, version: VERSION, cursor, log_rows: agg ? agg.n : 0, latest_ingest: agg ? agg.latest : null });
    }
    if (p === "/integration") {
      const summary = await assessIntegration(env);
      return json({ ok: true, integration: summary });
    }
    if (p === "/trend") {
      try {
        const rows = await env.AUDIT.prepare("SELECT ts, json FROM integration_state ORDER BY id DESC LIMIT 24").all();
        const pts = (rows.results || []).map(function(x) {
          try {
            return JSON.parse(x.json);
          } catch (e) {
            return null;
          }
        }).filter(function(x) {
          return x != null;
        });
        const latest = pts[0] || null;
        const prev = pts[1] || null;
        const chainVel = [];
        if (latest && prev) {
          const prevChains = {};
          (prev.chains || []).forEach(function(c) {
            prevChains[c.id] = c.n == null ? 0 : c.n;
          });
          (latest.chains || []).forEach(function(c) {
            const pn = prevChains[c.id] == null ? null : prevChains[c.id];
            const cn = c.n == null ? 0 : c.n;
            const vel = pn == null ? null : cn - pn;
            let warn = null;
            if (c.status === "stuck") warn = "stuck";
            else if (c.metric !== "rate" && vel != null && vel > 0 && cn >= 1) warn = "depth growing (+" + vel + ")";
            chainVel.push({ id: c.id, n: cn, prev_n: pn, velocity: vel, state: c.status, warn });
          });
        }
        const scNow = latest && latest.score ? latest.score.total : null;
        const scPrev = prev && prev.score ? prev.score.total : null;
        const delta = scNow != null && scPrev != null ? Math.round((scNow - scPrev) * 10) / 10 : null;
        const warnings = [];
        chainVel.forEach(function(c) {
          if (c.warn) warnings.push(c.id + ": " + c.warn);
        });
        if (delta != null && delta <= -3) warnings.push("score declining " + delta + " (prev " + scPrev + ")");
        return json({ ok: true, generated_at: (/* @__PURE__ */ new Date()).toISOString(), points: pts.length, span_h: pts.length > 1 ? Math.round((Date.parse(latest.generated_at) - Date.parse(pts[pts.length - 1].generated_at)) / 36e5 * 10) / 10 : null, score_now: scNow, score_prev: scPrev, score_delta: delta, chain_velocity: chainVel, warnings });
      } catch (e) {
        return json({ ok: false, error: String(e && e.message ? e.message : e).slice(0, 80) }, 500);
      }
    }
    if (p === "/run/ingest") {
      const r = await ingestTrace(env);
      const summary = await digest(env, r);
      return json({ ok: true, ingest: r, summary: { workers_seen_24h: summary.workers_seen_24h, anomalies: summary.anomalies.length } });
    }
    if (p === "/log" && req.method === "POST") {
      let body = {};
      try {
        body = await req.json();
      } catch (e) {
        return json({ ok: false, error: "invalid json" }, 400);
      }
      return await logEvent(env, body, req);
    }
    if (p === "/workers/logs") {
      const worker = url.searchParams.get("worker") || "";
      const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
      const since = Number(url.searchParams.get("since") || 0);
      let rows;
      if (worker) {
        rows = await env.AUDIT.prepare("SELECT ts_ms, ingested_at, script_name, event_type, outcome, url, method, status, cpu_ms, wall_ms, logs_json, exceptions_json FROM worker_logs WHERE script_name = ? AND ts_ms >= ? ORDER BY ts_ms DESC LIMIT ?").bind(worker, since, limit).all();
      } else {
        rows = await env.AUDIT.prepare("SELECT ts_ms, ingested_at, script_name, event_type, outcome, url, method, status, cpu_ms, wall_ms, logs_json, exceptions_json FROM worker_logs WHERE ts_ms >= ? ORDER BY ts_ms DESC LIMIT ?").bind(since, limit).all();
      }
      return json({ ok: true, count: rows.results.length, logs: rows.results });
    }
    if (p === "/fleet/summary") {
      const probes = await env.AUDIT.prepare(`SELECT name, url, ok, status, ms, ts, body FROM fleet_probe_log WHERE ts >= ? ORDER BY ts DESC LIMIT 400`).bind(new Date(Date.now() - 864e5).toISOString()).all();
      const latestProbe = {};
      for (const row of probes.results || []) {
        if (!latestProbe[row.name] || row.ts > latestProbe[row.name].ts) latestProbe[row.name] = row;
      }
      const agg = await env.AUDIT.prepare(`SELECT script_name, COUNT(*) n, SUM(CASE WHEN outcome != 'ok' OR status >= 500 THEN 1 ELSE 0 END) bad, MAX(ts_ms) last_ts FROM worker_logs WHERE ts_ms >= ? GROUP BY script_name`).bind(Date.now() - 864e5).all();
      return json({ ok: true, generated_at: nowIso(), version: VERSION, fleet_size: FLEET.length, probes: latestProbe, log_stats: agg.results || [] });
    }
    return json({ ok: false, error: "not found", endpoints: ["/health", "/run/ingest", "/log", "/workers/logs", "/fleet/summary"] }, 404);
  }
};
return { default: worker_default };
})();
//# sourceMappingURL=worker.js.map
var m1 = (function(){
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "1.0.2";
var WORKER = "qnfo-error-selfheal";
var ACCOUNT = "edb167b78c9fb901ea5bca3ce58ccc4b";
var ZONE = "84e9dc1d7fb72629ccdbe3174ed24420";
var JSON_HEADERS = { "Content-Type": "application/json" };
function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: JSON_HEADERS });
}
__name(json, "json");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
function isoMin(ms) {
  return new Date(Date.now() - ms).toISOString();
}
__name(isoMin, "isoMin");
async function ensureSchema(env) {
  await env.QNFO_AUDIT.prepare(
    "CREATE TABLE IF NOT EXISTS fleet_error_state (worker TEXT PRIMARY KEY, errors INTEGER, seen_at TEXT)"
  ).run();
  await env.QNFO_AUDIT.prepare(
    "CREATE TABLE IF NOT EXISTS self_heal_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, ref TEXT, action TEXT, ts TEXT)"
  ).run();
}
__name(ensureSchema, "ensureSchema");
async function alertWorker(env, worker, errCount, winStart) {
  const firstSeen = winStart.slice(0, 16).replace("T", " ");
  const title = "WORKER-EXCEPTION-DETECTED " + worker + " (window " + firstSeen + ")";
  const dup = await env.QNFO_AUDIT.prepare(
    "SELECT id FROM agent_issues WHERE title=? AND (status IS NULL OR status NOT IN ('closed','done','resolved')) LIMIT 1"
  ).bind(title).first();
  if (!dup) {
    const desc = "qnfo-error-selfheal detected " + errCount + " uncaught scriptThrewException for worker " + worker + " in the last 60 min. Root-cause + fix per RECURRENCE-ZERO-1 before closeout; verify a live probe with same-turn evidence.";
    await env.QNFO_AUDIT.prepare(
      "INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)"
    ).bind(title, desc, WORKER, "infra", "medium", "open", nowIso(), nowIso()).run();
  }
  await env.QNFO_AUDIT.prepare(
    "INSERT INTO alerts (source, level, message, created_at) VALUES (?,?,?,?)"
  ).bind(WORKER, "warning", title + ": " + errCount + " exceptions/60m", nowIso()).run();
}
__name(alertWorker, "alertWorker");
async function recoverErrata(env) {
  const rows = await env.QNFO_AUDIT.prepare(
    "SELECT id, slug FROM errata_actions WHERE status='error' AND risk='low' AND updated_at >= '2026-09-04T15:00:00Z' ORDER BY id ASC LIMIT 10"
  ).all();
  const list = rows && rows.results ? rows.results : [];
  const today = nowIso().slice(0, 10);
  let rearmed = 0;
  for (const r of list) {
    const cnt = await env.QNFO_AUDIT.prepare(
      "SELECT COUNT(*) AS c FROM self_heal_actions WHERE kind='errata-rearm' AND ref=? AND substr(ts,1,10)=?"
    ).bind(String(r.id), today).first();
    if (cnt && cnt.c >= 3) continue;
    await env.QNFO_AUDIT.prepare(
      "UPDATE errata_actions SET status='drafted', updated_at=datetime('now') WHERE id=?"
    ).bind(r.id).run();
    await env.QNFO_AUDIT.prepare(
      "INSERT INTO self_heal_actions (kind, ref, action, ts) VALUES ('errata-rearm', ?, 'drafted', ?)"
    ).bind(String(r.id), nowIso()).run();
    rearmed++;
  }
  return rearmed;
}
__name(recoverErrata, "recoverErrata");
async function scanAlertStorms(env) {
  const rows = await env.QNFO_AUDIT.prepare(
    "SELECT id, source, message, created_at FROM alerts ORDER BY id DESC LIMIT 500"
  ).all();
  const list = rows && rows.results ? rows.results : [];
  const now = Date.now();
  const byMsg = {};
  const bySrc = {};
  for (const r of list) {
    const t = (/* @__PURE__ */ new Date(String(r.created_at || "").replace(" ", "T").replace("Z", "") + "Z")).getTime();
    if (!t || now - t > 60 * 6e4) continue;
    const key = (r.source || "?") + "||" + (r.message || "");
    byMsg[key] = (byMsg[key] || 0) + 1;
    bySrc[r.source || "?"] = (bySrc[r.source || "?"] || 0) + 1;
  }
  const storms = [];
  for (const k of Object.keys(byMsg)) if (byMsg[k] > 3) storms.push({ source: k.split("||")[0], kind: "dup", count: byMsg[k] });
  for (const s of Object.keys(bySrc)) if (bySrc[s] > 8) storms.push({ source: s, kind: "flood", count: bySrc[s] });
  const filed = [];
  for (const st of storms) {
    if (filed.some((f) => f.source === st.source && f.kind === st.kind)) continue;
    const title = "ALERT-STORM-DETECTED " + st.source + " (" + st.kind + ")";
    const dup = await env.QNFO_AUDIT.prepare(
      "SELECT id FROM agent_issues WHERE title=? AND (status IS NULL OR status NOT IN ('closed','done','resolved')) LIMIT 1"
    ).bind(title).first();
    if (!dup) {
      await env.QNFO_AUDIT.prepare(
        "INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)"
      ).bind(title, "qnfo-error-selfheal detected " + st.count + " " + st.kind + " alerts from " + st.source + " in the trailing 60 min. Root-cause the alert source emit cadence/dedup per RECURRENCE-ZERO-1; verify quieter after fix.", WORKER, "infra", "medium", "open", nowIso(), nowIso()).run();
      filed.push(st);
    }
  }
  return { storms: storms.slice(0, 8), filed };
}
__name(scanAlertStorms, "scanAlertStorms");
async function scan(env) {
  await ensureSchema(env);
  const winStart = isoMin(60 * 6e4);
  const out = { ts: nowIso(), worker: WORKER, version: VERSION };
  const gql = JSON.stringify({
    query: '{ viewer { accounts(filter: {accountTag: "' + ACCOUNT + '"}) { workersInvocationsAdaptive(limit: 10000, filter: {datetime_geq: "' + winStart + '", datetime_leq: "' + nowIso() + '"}) { sum { requests errors } dimensions { scriptName } } } } }'
  });
  const exceptions = [];
  try {
    const g = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.CF_API_TOKEN },
      body: gql
    });
    const j = await g.json();
    const rows = j.data && j.data.viewer.accounts[0] && j.data.viewer.accounts[0].workersInvocationsAdaptive || [];
    for (const row of rows) {
      const errs = row.sum && row.sum.errors || 0;
      if (errs > 0) exceptions.push({ worker: row.dimensions.scriptName || "unknown", errors: errs });
    }
  } catch (e) {
    out.gql_error = String(e.message || e).slice(0, 150);
  }
  for (const ex of exceptions) {
    const prev = await env.QNFO_AUDIT.prepare("SELECT errors, seen_at FROM fleet_error_state WHERE worker=?").bind(ex.worker).first();
    const newBurst = !prev || ex.errors > (prev.errors || 0);
    if (newBurst) {
      await env.QNFO_AUDIT.prepare(
        "INSERT INTO fleet_error_state (worker, errors, seen_at) VALUES (?,?,?) ON CONFLICT(worker) DO UPDATE SET errors=excluded.errors, seen_at=excluded.seen_at"
      ).bind(ex.worker, ex.errors, nowIso()).run();
      await alertWorker(env, ex.worker, ex.errors, winStart);
      out.alerts = out.alerts || [];
      out.alerts.push(ex.worker + ":" + ex.errors);
    }
  }
  out.workers_with_exceptions = exceptions;
  try {
    const sql = "SELECT COUNT(*) AS c FROM http_requests WHERE EdgeResponseStatus >= 500 AND EdgeEndTimestamp >= '" + winStart + "'";
    const le = await fetch("https://api.cloudflare.com/client/v4/zones/" + ZONE + "/logs/explorer/query/sql?query=" + encodeURIComponent(sql), {
      headers: { "Authorization": "Bearer " + env.CF_API_TOKEN }
    });
    const lj = await le.json();
    const edge5xx = lj.result && lj.result[0] && lj.result[0].c || 0;
    out.edge_5xx_60m = edge5xx;
    if (edge5xx > 20) {
      const lastSpike = await env.QNFO_AUDIT.prepare(
        "SELECT message, created_at FROM alerts WHERE source=? AND message LIKE 'http_requests 5xx spike%' ORDER BY id DESC LIMIT 1"
      ).bind(WORKER).first();
      let prevN = 0, lastTs = 0;
      if (lastSpike && lastSpike.message) {
        const m = lastSpike.message.match(/(d+)s+ins+60m/);
        if (m) prevN = parseInt(m[1], 10);
        if (lastSpike.created_at) lastTs = new Date(lastSpike.created_at).getTime() || 0;
      }
      const cooldownOk = !lastTs || Date.now() - lastTs > 6 * 3600 * 1e3;
      const growthOk = edge5xx >= prevN * 1.5;
      if (prevN === 0 || cooldownOk || growthOk) {
        if (prevN === 0) {
          const dupTitle = "HTTP-5XX-ELEVATED qnfo.org (http_requests 5xx)";
          const dup = await env.QNFO_AUDIT.prepare(
            "SELECT id FROM agent_issues WHERE title=? AND (status IS NULL OR status NOT IN ('closed','done','resolved')) LIMIT 1"
          ).bind(dupTitle).first();
          if (!dup) {
            await env.QNFO_AUDIT.prepare(
              "INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)"
            ).bind(dupTitle, "qnfo-error-selfheal measured " + edge5xx + " edge 5xx in 60m on qnfo.org (ISO-filtered Log Explorer count). Root-cause the 504/D1 class per RECURRENCE-ZERO-1.", WORKER, "infra", "medium", "open", nowIso(), nowIso()).run();
          }
        }
        await env.QNFO_AUDIT.prepare(
          "INSERT INTO alerts (source, level, message, created_at) VALUES (?,?,?,?)"
        ).bind(WORKER, "warning", "http_requests 5xx spike: " + edge5xx + " in 60m (qnfo.org)", nowIso()).run();
        out.edge_spike = true;
      }
    }
  } catch (e) {
    out.log_explorer_error = String(e.message || e).slice(0, 150);
  }
  out.errata_rearmed = await recoverErrata(env);
  out.alert_storms = await scanAlertStorms(env);
  out.ok = true;
  return out;
}
__name(scan, "scan");
var worker_default = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(scan(env).then(function(s) {
      console.log("[qnfo-error-selfheal] scan:", JSON.stringify(s).slice(0, 600));
    }).catch(function(e) {
      console.error("[qnfo-error-selfheal] scan error:", String(e.message || e));
    }));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, worker: WORKER, version: VERSION, purpose: "autonomous fleet error detection + deterministic self-correction", schedule: "17 * * * *", endpoints: { scan: "POST /run" } });
    }
    if (url.pathname === "/run" && request.method === "POST") {
      try {
        return json(await scan(env));
      } catch (e) {
        return json({ ok: false, error: String(e.message || e) }, 500);
      }
    }
    return json({ error: "not found", routes: ["/health", "/run"] }, 404);
  }
};
return { default: worker_default };
})();
//# sourceMappingURL=worker.js.map


// ===== MERGED qnfo-observability (merged-2026-09-11: qnfo-observability+qnfo-error-selfheal) =====
export default {
  async fetch(request, env, ctx) {
    const p = new URL(request.url).pathname;
    if (p === "/health") return new Response(JSON.stringify({ ok: true, worker: "qnfo-observability", version: "merged-2026-09-11", merged: ["qnfo-observability", "qnfo-error-selfheal"] }), { headers: { "content-type": "application/json" } });
    if (p === "/health") return m1.default.fetch(request, env, ctx);
    if (p === "/run") return m1.default.fetch(request, env, ctx);
    return m0.default.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    const c = event.cron;
    if (c === "17 * * * *") { m0.default.scheduled(event, env, ctx);m1.default.scheduled(event, env, ctx); return; }
  },
};
