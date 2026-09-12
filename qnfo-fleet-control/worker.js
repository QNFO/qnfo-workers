var advisorMod = (function(){
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/server.js
var VERSION = "0.4.12";
var WORKER = "qnfo-fleet-advisor";
var nowIso = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "nowIso");
async function workerNameSet(env) {
  try {
    const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + (env.CF_ACCOUNT_ID || "edb167b78c9fb901ea5bca3ce58ccc4b") + "/workers/scripts?per_page=100", { headers: { "Authorization": "Bearer " + env.CF_API_TOKEN, "User-Agent": "qnfo-fleet-advisor" }, signal: AbortSignal.timeout(8e3) });
    if (!r.ok) return null;
    const j = await r.json();
    return new Set((j.result || []).map((x) => x.id));
  } catch (e) { return null; }
}
async function probeHealth(name, names) {
  if (names && names.size) {
    if (names.has(name)) return { ok: true, via: "cf-api-list", version: null };
    return { ok: false, detail: "not-in-cf-worker-list" };
  }
  const hosts = [name + ".q08.workers.dev", name + ".qnfo.org"];
  const tried = [];
  for (const h of hosts) {
    try {
      const r = await fetch("https://" + h + "/health", {
        headers: { "User-Agent": "Mozilla/5.0 (qnfo-fleet-advisor)" },
        signal: AbortSignal.timeout(5e3)
      });
      if (r.ok) {
        let v = null;
        try {
          const j = await r.json();
          v = j.version || j.VERSION || null;
        } catch (e) {
        }
        return { ok: true, via: h, version: v };
      }
      tried.push(h + ":" + r.status);
    } catch (e) {
      tried.push(h + ":err");
    }
  }
  return { ok: false, detail: tried.join(" ") };
}
__name(probeHealth, "probeHealth");
async function d1All(env, sql, params) {
  const st = env.AUDIT_DB.prepare(sql);
  const x = await (params ? st.bind(...params).all() : st.all());
  return x && x.results ? x.results : [];
}
__name(d1All, "d1All");
async function d1Run(env, sql, params) {
  const st = env.AUDIT_DB.prepare(sql);
  return await (params ? st.bind(...params).run() : st.run());
}
__name(d1Run, "d1Run");
async function gatewayConfigAudit(env) {
  if (!env.CF_API_TOKEN) return { skipped: true, reason: "CF_API_TOKEN secret not set" };
  try {
    const url = "https://api.cloudflare.com/client/v4/accounts/" + env.CF_ACCOUNT_ID + "/ai-gateway/gateways";
    const resp = await fetch(url, { headers: { Authorization: "Bearer " + env.CF_API_TOKEN }, signal: AbortSignal.timeout(8e3) });
    const j = await resp.json();
    const list = j && j.result || [];
    const drift = [];
    for (const g of list) {
      if (g.collect_logs !== true) drift.push(g.id + ":collect_logs!=true");
      if (g.authentication !== true) drift.push(g.id + ":authentication!=true");
      if (g.retry_max_attempts !== void 0 && g.retry_max_attempts < 2) drift.push(g.id + ":retries<2");
    }
    return { skipped: false, gateways: list.map((g) => ({ id: g.id, cache_ttl: g.cache_ttl, collect_logs: g.collect_logs, retries: g.retry_max_attempts })), drift };
  } catch (e) {
    return { skipped: true, reason: String(e && e.message || e).slice(0, 160) };
  }
}
__name(gatewayConfigAudit, "gatewayConfigAudit");
async function spendGuardAudit(env) {
  if (!env.CF_API_TOKEN) return { skipped: true, reason: "no CF_API_TOKEN" };
  try {
    const url = "https://api.cloudflare.com/client/v4/accounts/" + env.CF_ACCOUNT_ID + "/ai-gateway/billing/spending-limit";
    const resp = await fetch(url, { headers: { Authorization: "Bearer " + env.CF_API_TOKEN }, signal: AbortSignal.timeout(8e3) });
    const j = await resp.json();
    const r = j && j.result || {};
    const enabled = r.enabled === true;
    const amt = r.config && r.config.amount || 0;
    return { skipped: false, enabled, amount: amt, detail: "enabled=" + enabled + " amount=" + amt + " " + (r.config && r.config.duration || "") + " " + (r.config && r.config.strategy || "") };
  } catch (e) {
    return { skipped: true, reason: String(e && e.message || e).slice(0, 160) };
  }
}
__name(spendGuardAudit, "spendGuardAudit");
var MAX_ADVISOR_ITERS = 3;
async function collectFeedback(env) {
  const fb = { prior_findings: 0, prior_filed: 0, prior_suggestion: "", open_advisor_issues: [] };
  try {
    const last = await d1All(env, "SELECT text FROM cloud_ops_events WHERE kind='advisor-audit' AND job=? ORDER BY ts DESC LIMIT 1", [WORKER]);
    if (last && last[0] && last[0].text) {
      try {
        const st = JSON.parse(last[0].text);
        fb.prior_findings = st.findings || 0;
        fb.prior_filed = st.filed || 0;
        fb.prior_suggestion = st.suggestion || "";
      } catch (e) {
      }
    }
  } catch (e) {
  }
  try {
    const open = await d1All(env, "SELECT title FROM agent_issues WHERE source=? AND status='open' ORDER BY updated_at DESC LIMIT 6", [WORKER]);
    fb.open_advisor_issues = (open || []).map((o) => o.title);
  } catch (e) {
  }
  return fb;
}
__name(collectFeedback, "collectFeedback");
async function runAudit(env) {
  const ts = nowIso();
  const findings = [];
  const PROBES = (env.PROBE_WORKERS || "qnfo-ai,qnfo-ops,qnfo-kaizen,qnfo-cloud-ops,qnfo-infra,qnfo-auditor").split(",").map((s) => s.trim()).filter(Boolean);
  const workerNames = await workerNameSet(env);
  const results = await Promise.all(PROBES.map((n) => probeHealth(n, workerNames)));
  const down = [];
  for (let i = 0; i < PROBES.length; i++) if (!results[i].ok) down.push(PROBES[i] + "(" + (results[i].detail || "") + ")");
  try {
    const rows = await d1All(env, "SELECT model, error_class, SUM(count) AS n FROM ai_gateway_failures WHERE ts >= ((strftime('%s','now') - 86400) * 1000) GROUP BY model, error_class ORDER BY n DESC LIMIT 8");
    for (const row of rows) {
      if (!row || !row.model) continue;
      const n = row.n || 0;
      const cls = String(row.error_class || "fail").toLowerCase();
      if (cls.indexOf("5") === 0 && n >= 200) findings.push({ kind: "ai-gateway", severity: "high", title: "GW 5xx " + row.model + " x" + n + "/24h", detail: row.model + " failing " + n + "x/24h class=" + row.error_class });
      else if ((cls.indexOf("4") === 0 || cls.indexOf("429") >= 0 || cls.indexOf("timeout") >= 0) && n >= 400) findings.push({ kind: "ai-gateway", severity: n >= 2e3 ? "high" : "medium", title: "GW " + (row.error_class || "4xx") + " " + row.model + " x" + n + "/24h", detail: row.model + " returning " + row.error_class + " " + n + "x/24h" });
    }
  } catch (e) {
  }
  try {
    const deg = await d1All(env, "SELECT model_id FROM ai_model_health WHERE status = 'degraded'");
    if (deg && deg.length) findings.push({ kind: "model-health", severity: "medium", title: "MODEL-DEGRADED " + deg.map((d) => d.model_id).slice(0, 4).join(","), detail: "degraded: " + deg.map((d) => d.model_id).join(",") });
  } catch (e) {
  }
  try {
    const open = await d1All(env, "SELECT COUNT(*) AS n FROM agent_issues WHERE status='open' AND title NOT LIKE 'OPEN-ISSUES%'");
    const n = open && open[0] ? open[0].n : 0;
    if (n > 8) findings.push({ kind: "backlog", severity: "low", title: "OPEN-ISSUES-BACKLOG", detail: n + " open agent_issues (excluding advisor OPEN-ISSUES tickets)" });
  } catch (e) {
  }
  try {
    await d1Run(env, "UPDATE agent_issues SET status='closed', updated_at=? WHERE status='open' AND source=? AND category='backlog' AND title LIKE 'OPEN-ISSUES %'", [ts, WORKER]);
  } catch (e) {
  }
  const gw = await gatewayConfigAudit(env);
  if (!gw.skipped && gw.drift && gw.drift.length) findings.push({ kind: "gateway-config", severity: "medium", title: "GATEWAY-DRIFT " + gw.drift.slice(0, 3).join(";"), detail: "drift: " + gw.drift.join(";") });
  const sg = await spendGuardAudit(env);
  let spend_guard = null;
  if (!sg.skipped) spend_guard = sg.detail;
  let suggestion = null;
  let ensemble = null;
  const NL = String.fromCharCode(10);
  const modelP = env.ADVISOR_MODEL || "@cf/moonshotai/kimi-k2.6";
  const modelR = env.REVIEW_MODEL || "@cf/openai/gpt-oss-120b";
  const iters = Math.min(parseInt(env.ADVISOR_ITERS || "", 10) || MAX_ADVISOR_ITERS, 5);
  if (findings.length && env.AI) {
    try {
      const fb = await collectFeedback(env);
      const promptLines = ["You are the QNFO fleet advisor (adversarial, evidence-based, no flattery). Audit findings:"];
      findings.forEach((f) => promptLines.push("- [" + f.severity + "] " + f.title));
      if (fb.open_advisor_issues.length) {
        promptLines.push("Previously filed advisory issues STILL OPEN (re-examine: propose escalation or a concrete fix, never re-file the same title):");
        fb.open_advisor_issues.forEach((t) => promptLines.push("  - " + t));
      }
      promptLines.push("Propose ONE concrete, falsifiable improvement action (owner + priority + the evidence that would close it). Max 120 words, no preamble.");
      const prompt = promptLines.join(NL);
      const rp = await env.AI.run(modelP, { messages: [{ role: "user", content: prompt }], max_tokens: 2048, temperature: 0.3 });
      const cp = rp && rp.response || rp && rp.choices && rp.choices[0] && rp.choices[0].message && rp.choices[0].message.content;
      let proposal = String(cp || "").trim().slice(0, 800);
      let verdict = "";
      let rounds = 0;
      if (proposal) {
        for (let i = 0; i < iters; i++) {
          rounds = i + 1;
          const rv = await env.AI.run(modelR, { messages: [{ role: "user", content: "Review this advisor action. If specific, falsifiable, high-value -> reply ACCEPT. Else reply IMPROVE then the improved action (owner + priority), max 120 words." + NL + "Proposal: " + proposal }], max_tokens: 2048, temperature: 0.2 });
          const cv = rv && rv.response || rv && rv.choices && rv.choices[0] && rv.choices[0].message && rv.choices[0].message.content;
          const review = String(cv || "").trim();
          verdict = review.slice(0, 20).toUpperCase();
          if (verdict.indexOf("ACCEPT") >= 0) break;
          if (verdict.indexOf("IMPROVE") >= 0 && review.length > 20) {
            const improved = review.replace(/^IMPROVE[\s:]*/i, "").trim();
            if (improved) proposal = improved.slice(0, 800);
          } else break;
        }
        suggestion = proposal;
        ensemble = { proposer: modelP, reviewer: modelR, verdict: verdict.indexOf("IMPROVE") >= 0 ? "improved" : "accepted", iterations: rounds };
      }
    } catch (e) {
      suggestion = null;
      ensemble = null;
    }
  }
  let filed = 0;
  for (const f of findings) {
    try {
      const existing = await d1All(env, "SELECT id FROM agent_issues WHERE status='open' AND title = ?", [f.title]);
      if (existing && existing.length) {
        await d1Run(env, "UPDATE agent_issues SET description=?, updated_at=? WHERE id=?", ["[advisor] " + f.detail.slice(0, 600), ts, existing[0].id]);
        continue;
      }
      await d1Run(
        env,
        "INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
        [f.title.slice(0, 240), "[advisor] " + f.detail.slice(0, 600), WORKER, f.kind, f.severity, "open", ts, ts]
      );
      filed++;
    } catch (e) {
    }
  }
  const state = { up: PROBES.length - down.length, down: down.length, findings: findings.length, filed, suggestion, gateway_drift: gw.skipped ? null : gw.drift, spend_guard, ensemble, ts };
  try {
    await d1Run(
      env,
      "INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?,?,?,?,?,?)",
      ["adv-" + Date.now().toString(36), ts, "advisor-audit", JSON.stringify(state).slice(0, 1800), WORKER, "ok"]
    );
  } catch (e) {
  }
  return { ok: true, worker: WORKER, version: VERSION, ts, probed: PROBES.length, up: PROBES.length - down.length, down: down.length, findings: findings.length, filed, suggestion: suggestion ? suggestion.slice(0, 400) : null };
}
__name(runAudit, "runAudit");
var FleetAdvisor = class {
  static {
    __name(this, "FleetAdvisor");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/run-audit" && request.method === "POST") {
      const auth = request.headers.get("x-advisor-token");
      if (auth !== this.env.ADVISOR_TOKEN) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      return Response.json(await runAudit(this.env));
    }
    return new Response(JSON.stringify({ worker: WORKER, version: VERSION, hint: "POST /run-audit (x-advisor-token) or scheduled cron" }), { status: 200 });
  }
};
var server_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, worker: WORKER, version: VERSION, model: env.ADVISOR_MODEL || "@cf/moonshotai/kimi-k2.6", bindings: { d1: !!env.AUDIT_DB, ai: !!env.AI, do: !!env.FleetAdvisor }, crons: ["*/20 * * * *"] });
    }
    if (url.pathname === "/run-audit" && request.method === "POST") {
      const auth = request.headers.get("x-advisor-token");
      if (auth !== env.ADVISOR_TOKEN) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      return Response.json(await runAudit(env));
    }
    if (url.pathname === "/") return new Response("qnfo-fleet-advisor v" + VERSION + ": autonomous fleet advisor. GET /health | POST /run-audit (x-advisor-token) | cron */20.", { status: 200 });
    return new Response("not found", { status: 404 });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAudit(env));
  }
};
return { FleetAdvisor: FleetAdvisor, default: server_default };
})();
var calibratorMod = (function(){
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "1.0.0";
var WORKER = "qnfo-fleet-calibrator";
var DAY_MS = 864e5;
var PROBE_MS = 12e3;
var EXTREME_MS = 6e4;
var RETENTION_METRICS_DAYS = 90;
var RETENTION_ANOMALY_DAYS = 30;
var RETENTION_R2_DAYS = 7;
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
function uid() {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return "r" + Date.now() + Math.random().toString(16).slice(2);
  }
}
__name(uid, "uid");
function jp(s, fb) {
  if (s === null || s === void 0) return fb;
  try {
    return JSON.parse(s);
  } catch (e) {
    return fb;
  }
}
__name(jp, "jp");
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
__name(clamp, "clamp");
function sjs(v) {
  try {
    return JSON.stringify(v);
  } catch (e) {
    return "{}";
  }
}
__name(sjs, "sjs");
function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
__name(safeEqual, "safeEqual");
var PROBES = [
  { id: "qnfo-ai-health", kind: "http", url: "https://qnfo-ai.q08.workers.dev/health", binding: "SVC_QNFO_AI", expect: 200 },
  { id: "qnfo-ai-models", kind: "http", url: "https://qnfo-ai.q08.workers.dev/v1/models", binding: "SVC_QNFO_AI", expect: 200 },
  { id: "qnfo-infra-health", kind: "http", url: "https://qnfo-infra.q08.workers.dev/health", binding: "SVC_QNFO_INFRA", expect: 200 },
  { id: "qnfo-auditor-health", kind: "http", url: "https://qnfo-auditor.q08.workers.dev/health", binding: "SVC_QNFO_AUDITOR", expect: 200 },
  { id: "personal-api-health", kind: "http", url: "https://personal-api.q08.workers.dev/health", binding: "SVC_PERSONAL_API", expect: 200, soft: true },
  { id: "qnfo-intent-health", kind: "http", url: "https://qnfo-intent-orchestrator.q08.workers.dev/health", binding: "SVC_QNFO_INTENT", expect: 200, soft: true },
  { id: "papers-home", kind: "http", url: "https://papers.qnfo.org/", expect: 200, soft: true },
  { id: "qnfo-org-home", kind: "http", url: "https://qnfo.org/", expect: 200, soft: true },
  { id: "d1-audit", kind: "d1" },
  { id: "r2-audit", kind: "r2" },
  { id: "vectorize-cal", kind: "vectorize" }
];
var BATTERY = [
  { id: "adv-chat-invalid-json", url: "https://qnfo-ai.q08.workers.dev/v1/chat/completions", method: "POST", body: "{invalid", ct: "application/json", binding: "SVC_QNFO_AI" },
  { id: "adv-chat-empty-json", url: "https://qnfo-ai.q08.workers.dev/v1/chat/completions", method: "POST", body: "", ct: "application/json", binding: "SVC_QNFO_AI" },
  { id: "adv-chat-wrong-ctype", url: "https://qnfo-ai.q08.workers.dev/v1/chat/completions", method: "POST", body: "hello", ct: "text/plain", binding: "SVC_QNFO_AI" },
  { id: "adv-models-post", url: "https://qnfo-ai.q08.workers.dev/v1/models", method: "POST", body: "{}", ct: "application/json", binding: "SVC_QNFO_AI" },
  { id: "adv-papers-404", url: "https://papers.qnfo.org/papers/nonexistent-calib-xyz", method: "GET", body: null, ct: null },
  { id: "adv-home-bad-query", url: "https://qnfo.org/?q=%00%FF", method: "GET", body: null, ct: null }
];
var BURST_TARGET = "https://qnfo-ai.q08.workers.dev/health";
var BURST_BINDING = "SVC_QNFO_AI";
var BURST_N = 8;
var SCHEMA = [
  "CREATE TABLE IF NOT EXISTS fleet_cal_runs (run_id TEXT PRIMARY KEY, run_type TEXT NOT NULL, trigger TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL DEFAULT 'running', probe_total INTEGER DEFAULT 0, probe_ok INTEGER DEFAULT 0, probe_fail INTEGER DEFAULT 0, anomalies_found INTEGER DEFAULT 0, actions_applied INTEGER DEFAULT 0, verdict_score REAL, verdict_json TEXT, audit_json TEXT)",
  "CREATE TABLE IF NOT EXISTS fleet_cal_metrics (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, probe_id TEXT NOT NULL, kind TEXT NOT NULL, target TEXT, metric TEXT NOT NULL, value REAL, ok INTEGER NOT NULL DEFAULT 1, detail TEXT, measured_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_fcm_run ON fleet_cal_metrics(run_id)",
  "CREATE INDEX IF NOT EXISTS idx_fcm_probe_time ON fleet_cal_metrics(probe_id, measured_at)",
  "CREATE TABLE IF NOT EXISTS fleet_cal_baselines (probe_id TEXT NOT NULL, metric TEXT NOT NULL, n INTEGER DEFAULT 0, ema REAL DEFAULT 0, ema2 REAL DEFAULT 0, p95 REAL DEFAULT 0, min REAL DEFAULT 0, max REAL DEFAULT 0, threshold_mult REAL DEFAULT 2.0, updated_at TEXT NOT NULL, PRIMARY KEY (probe_id, metric))",
  "CREATE TABLE IF NOT EXISTS fleet_cal_anomalies (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, probe_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, baseline REAL, threshold REAL, severity TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', detail TEXT, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_fca_open ON fleet_cal_anomalies(status, probe_id)",
  "CREATE TABLE IF NOT EXISTS fleet_cal_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, action_type TEXT NOT NULL, target TEXT, reason TEXT, before_json TEXT, after_json TEXT, applied_at TEXT NOT NULL, verified INTEGER DEFAULT 0, verified_at TEXT, rolled_back INTEGER DEFAULT 0, rollback_at TEXT, rollback_reason TEXT)",
  "CREATE INDEX IF NOT EXISTS idx_fcal_unv ON fleet_cal_actions(verified, rolled_back)",
  "CREATE TABLE IF NOT EXISTS fleet_cal_learnings (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, topic TEXT NOT NULL, insight TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS fleet_cal_state (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT NOT NULL)"
];
async function ensureSchema(env) {
  for (let i = 0; i < SCHEMA.length; i++) {
    await env.DB_AUDIT.prepare(SCHEMA[i]).run();
  }
}
__name(ensureSchema, "ensureSchema");
async function stateGet(env, k) {
  try {
    const r = await env.DB_AUDIT.prepare("SELECT v FROM fleet_cal_state WHERE k=?1").bind(k).first();
    return r ? r.v : null;
  } catch (e) {
    return null;
  }
}
__name(stateGet, "stateGet");
async function stateSet(env, k, v) {
  await env.DB_AUDIT.prepare("INSERT INTO fleet_cal_state (k,v,updated_at) VALUES (?1,?2,?3) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at").bind(k, v, nowIso()).run();
}
__name(stateSet, "stateSet");
async function learn(env, runId, topic, insight) {
  try {
    await env.DB_AUDIT.prepare("INSERT INTO fleet_cal_learnings (run_id,topic,insight,created_at) VALUES (?1,?2,?3,?4)").bind(runId, topic, String(insight).slice(0, 600), nowIso()).run();
  } catch (e) {
  }
}
__name(learn, "learn");
async function act(env, runId, at, target, reason, before, after) {
  try {
    await env.DB_AUDIT.prepare("INSERT INTO fleet_cal_actions (run_id,action_type,target,reason,before_json,after_json,applied_at) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(runId, at, target, String(reason || "").slice(0, 400), sjs(before), sjs(after), nowIso()).run();
    return 1;
  } catch (e) {
    return 0;
  }
}
__name(act, "act");
function ua() {
  return { "User-Agent": "qnfo-fleet-calibrator/" + VERSION + " (self-calibration)" };
}
__name(ua, "ua");
async function fetcher(url, method, headers, body, ms) {
  const ac = new AbortController();
  const t = setTimeout(function() {
    ac.abort();
  }, ms || PROBE_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: method || "GET", headers: headers || ua(), body, signal: ac.signal, redirect: "follow" });
    return { ms: Date.now() - t0, status: res.status, text: await res.text() };
  } catch (e) {
    return { ms: Date.now() - t0, status: -1, text: "", err: String(e && e.message || e).slice(0, 120) };
  } finally {
    clearTimeout(t);
  }
}
__name(fetcher, "fetcher");
async function svcFetch(env, p, method, headers, body, ms) {
  const svc = p.binding ? env[p.binding] : null;
  const ac = new AbortController();
  const t = setTimeout(function() {
    ac.abort();
  }, ms || PROBE_MS);
  const t0 = Date.now();
  try {
    let res;
    if (svc) {
      res = await svc.fetch(p.url, { method: method || "GET", headers: headers || ua(), body, signal: ac.signal });
    } else {
      res = await fetch(p.url, { method: method || "GET", headers: headers || ua(), body, signal: ac.signal, redirect: "follow" });
    }
    return { ms: Date.now() - t0, status: res.status, text: await res.text() };
  } catch (e) {
    return { ms: Date.now() - t0, status: -1, text: "", err: String(e && e.message || e).slice(0, 120) };
  } finally {
    clearTimeout(t);
  }
}
__name(svcFetch, "svcFetch");
async function probeHttp(env, p) {
  const r = await svcFetch(env, p, "GET", ua(), null, PROBE_MS);
  const statusOk = r.status === p.expect ? 1 : 0;
  const ok = p.soft || statusOk === 1 ? 1 : 0;
  let det = r.status > 0 ? "status:" + r.status : "err:" + r.err;
  if (r.status > 0 && r.status !== p.expect && r.text) {
    det += " body:" + r.text.slice(0, 140).replace(/[\r\n]+/g, " ");
  }
  const rows = [
    { probe_id: p.id, kind: "http", target: p.url, metric: "latency_ms", value: r.ms, ok, detail: det.slice(0, 220) },
    { probe_id: p.id, kind: "http", target: p.url, metric: "status", value: r.status, ok, detail: "expect:" + p.expect + (p.soft ? " (soft)" : "") }
  ];
  return rows;
}
__name(probeHttp, "probeHttp");
async function probeD1(env) {
  const t0 = Date.now();
  try {
    const one = await env.DB_AUDIT.prepare("SELECT 1 AS x").first();
    const cnt = await env.DB_AUDIT.prepare("SELECT COUNT(*) AS n FROM fleet_cal_runs").first();
    const ms = Date.now() - t0;
    const ok = one && one.x === 1 ? 1 : 0;
    return [
      { probe_id: "d1-audit", kind: "d1", target: "qnfo-audit", metric: "latency_ms", value: ms, ok, detail: "rows:" + (cnt ? cnt.n : -1) },
      { probe_id: "d1-audit", kind: "d1", target: "qnfo-audit", metric: "status", value: ok ? 200 : -1, ok, detail: "select1" }
    ];
  } catch (e) {
    return [{ probe_id: "d1-audit", kind: "d1", target: "qnfo-audit", metric: "latency_ms", value: Date.now() - t0, ok: 0, detail: String(e && e.message || e).slice(0, 150) }];
  }
}
__name(probeD1, "probeD1");
async function probeR2(env) {
  const key = "calibration/selfcheck-" + nowIso().slice(0, 10) + ".json";
  const body = sjs({ ts: nowIso(), worker: WORKER, version: VERSION });
  const t0 = Date.now();
  try {
    await env.R2_AUDIT.put(key, body, { httpMetadata: { contentType: "application/json" } });
    const got = await env.R2_AUDIT.get(key);
    const txt = got ? await got.text() : "";
    const ok = txt === body ? 1 : 0;
    const ms = Date.now() - t0;
    if (ok) {
      await env.R2_AUDIT.delete(key);
    }
    return [
      { probe_id: "r2-audit", kind: "r2", target: "qnfo-audit:" + key, metric: "latency_ms", value: ms, ok, detail: ok ? "roundtrip-ok" : "content-mismatch" },
      { probe_id: "r2-audit", kind: "r2", target: "qnfo-audit:" + key, metric: "status", value: ok ? 200 : -1, ok, detail: "put-get-delete" }
    ];
  } catch (e) {
    return [{ probe_id: "r2-audit", kind: "r2", target: "qnfo-audit:" + key, metric: "latency_ms", value: Date.now() - t0, ok: 0, detail: String(e && e.message || e).slice(0, 150) }];
  }
}
__name(probeR2, "probeR2");
async function probeVec(env) {
  const t0 = Date.now();
  try {
    if (!env.VEC_CAL) {
      return [{ probe_id: "vectorize-cal", kind: "vectorize", target: "qnfo-calibration", metric: "latency_ms", value: Date.now() - t0, ok: 0, detail: "binding-missing" }];
    }
    const dim = 768;
    const v = [];
    for (let i = 0; i < dim; i++) {
      v.push(0.01 * Math.sin(i));
    }
    const q = await env.VEC_CAL.query(v, { topK: 1 });
    const ms = Date.now() - t0;
    const matches = q && q.matches ? q.matches.length : 0;
    return [
      { probe_id: "vectorize-cal", kind: "vectorize", target: "qnfo-calibration", metric: "latency_ms", value: ms, ok: 1, detail: "matches:" + matches },
      { probe_id: "vectorize-cal", kind: "vectorize", target: "qnfo-calibration", metric: "status", value: 200, ok: 1, detail: "query" }
    ];
  } catch (e) {
    return [{ probe_id: "vectorize-cal", kind: "vectorize", target: "qnfo-calibration", metric: "latency_ms", value: Date.now() - t0, ok: 0, detail: String(e && e.message || e).slice(0, 150) }];
  }
}
__name(probeVec, "probeVec");
async function probeBurst(env) {
  const results = [];
  const svc = BURST_BINDING ? env[BURST_BINDING] : null;
  await Promise.all(Array.from({ length: BURST_N }, async function() {
    const t0 = Date.now();
    try {
      let res;
      if (svc) {
        res = await svc.fetch(BURST_TARGET, { headers: ua() });
      } else {
        res = await fetch(BURST_TARGET, { headers: ua() });
      }
      results.push(Date.now() - t0);
    } catch (e) {
      results.push(Date.now() - t0);
    }
  }));
  const sorted = results.slice().sort(function(a, b) {
    return a - b;
  });
  const n = sorted.length;
  const p50 = n ? sorted[Math.floor(n * 0.5)] : 0;
  const p95 = n ? sorted[Math.min(n - 1, Math.ceil(n * 0.95) - 1)] : 0;
  const p99 = n ? sorted[Math.min(n - 1, Math.ceil(n * 0.99) - 1)] : 0;
  return [
    { probe_id: "burst-qnfo-ai", kind: "burst", target: BURST_TARGET, metric: "latency_ms", value: p50, ok: 1, detail: "p50" },
    { probe_id: "burst-qnfo-ai", kind: "burst", target: BURST_TARGET, metric: "p95_ms", value: p95, ok: 1, detail: "p95" },
    { probe_id: "burst-qnfo-ai", kind: "burst", target: BURST_TARGET, metric: "p99_ms", value: p99, ok: 1, detail: "p99" },
    { probe_id: "burst-qnfo-ai", kind: "burst", target: BURST_TARGET, metric: "count", value: n, ok: n > 0 ? 1 : 0, detail: "n=" + n }
  ];
}
__name(probeBurst, "probeBurst");
async function probeBattery(env) {
  const rows = [];
  for (let i = 0; i < BATTERY.length; i++) {
    const c = BATTERY[i];
    const h = ua();
    if (c.ct) {
      h["Content-Type"] = c.ct;
    }
    const r = await svcFetch(env, c, c.method, h, c.body, PROBE_MS);
    const st = r.status;
    const ok = st > 0 && st < 500 ? 1 : 0;
    const note = st >= 400 ? "rejected-" + st : "tolerated-" + st;
    rows.push({ probe_id: c.id, kind: "adversarial", target: c.url, metric: "status", value: st, ok, detail: ok ? note + (r.err ? " " + r.err : "") : "unexpected-" + st + " " + r.err });
  }
  return rows;
}
__name(probeBattery, "probeBattery");
function baselineKey(metric) {
  return metric === "latency_ms" || metric === "p95_ms" || metric === "p99_ms";
}
__name(baselineKey, "baselineKey");
async function updateBaselines(env, runId, metrics) {
  const tuned = [];
  const seen = {};
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    if (m.probe_id.indexOf("sim") === 0) continue;
    if (!baselineKey(m.metric)) continue;
    if (m.ok !== 1 || !(m.value > 0)) continue;
    const key = m.probe_id + "|" + m.metric;
    if (seen[key]) continue;
    seen[key] = 1;
    const row = await env.DB_AUDIT.prepare("SELECT * FROM fleet_cal_baselines WHERE probe_id=?1 AND metric=?2").bind(m.probe_id, m.metric).first();
    const v = m.value;
    let n = 1, ema = v, ema2 = v * v, mn = v, mx = v, mult = 2;
    if (row) {
      n = row.n + 1;
      ema = row.ema * 0.8 + v * 0.2;
      ema2 = row.ema2 * 0.8 + v * v * 0.2;
      mn = Math.min(row.min, v);
      mx = Math.max(row.max, v);
      mult = row.threshold_mult;
    }
    const sd = Math.sqrt(Math.max(0, ema2 - ema * ema));
    const p95 = ema + 2 * sd;
    const newMult = clamp(1.5 + 1.5 * (sd / Math.max(ema, 1)), 1.8, 6);
    if (Math.abs(newMult - mult) > 0.15) {
      tuned.push({ probe_id: m.probe_id, metric: m.metric, before: row ? { n: row.n, ema: row.ema, ema2: row.ema2, p95: row.p95, min: row.min, max: row.max, threshold_mult: row.threshold_mult } : null, after: { n, ema: Math.round(ema * 100) / 100, threshold_mult: Math.round(newMult * 100) / 100 } });
      mult = newMult;
    }
    await env.DB_AUDIT.prepare("INSERT INTO fleet_cal_baselines (probe_id,metric,n,ema,ema2,p95,min,max,threshold_mult,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(probe_id,metric) DO UPDATE SET n=excluded.n, ema=excluded.ema, ema2=excluded.ema2, p95=excluded.p95, min=excluded.min, max=excluded.max, threshold_mult=excluded.threshold_mult, updated_at=excluded.updated_at").bind(m.probe_id, m.metric, n, Math.round(ema * 100) / 100, ema2, Math.round(p95 * 100) / 100, mn, mx, Math.round(mult * 100) / 100, nowIso()).run();
  }
  for (let i = 0; i < tuned.length; i++) {
    const t = tuned[i];
    await act(env, runId, "tune-threshold", t.probe_id + "/" + t.metric, "adaptive threshold recalibration", t.before, t.after);
  }
  return tuned.length;
}
__name(updateBaselines, "updateBaselines");
async function detectAnomalies(env, runId, metrics) {
  const found = [];
  const clean = {};
  const sims = [];
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    if (m.probe_id.indexOf("sim") === 0) {
      if (m.metric === "latency_ms" && m.value > EXTREME_MS) sims.push(m);
      continue;
    }
    if (m.ok === 1 && baselineKey(m.metric)) clean[m.probe_id + "|" + m.metric] = 1;
    if (m.ok === 1 || m.metric !== "latency_ms") continue;
    found.push({ probe_id: m.probe_id, metric: m.metric, value: m.value || 0, reason: "probe-failure " + String(m.detail || "") });
  }
  const seen = {};
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i];
    if (m.probe_id.indexOf("sim") === 0) continue;
    if (!baselineKey(m.metric) || m.ok !== 1 || !(m.value > 0)) continue;
    const key = m.probe_id + "|" + m.metric;
    if (seen[key]) continue;
    seen[key] = 1;
    const row = await env.DB_AUDIT.prepare("SELECT ema, threshold_mult, p95 FROM fleet_cal_baselines WHERE probe_id=?1 AND metric=?2").bind(m.probe_id, m.metric).first();
    if (!row) continue;
    const upper = Math.max(row.ema * row.threshold_mult, row.p95 * 1.5);
    if (m.value > upper) found.push({ probe_id: m.probe_id, metric: m.metric, value: m.value, reason: "latency-breach " + Math.round(m.value) + ">" + Math.round(upper) });
  }
  for (let i = 0; i < sims.length; i++) {
    const s = sims[i];
    found.push({ probe_id: s.probe_id, metric: s.metric, value: s.value, reason: "simulated-extreme" });
  }
  for (let i = 0; i < found.length; i++) {
    const f = found[i];
    const openRow = await env.DB_AUDIT.prepare("SELECT id FROM fleet_cal_anomalies WHERE probe_id=?1 AND metric=?2 AND status=?3").bind(f.probe_id, f.metric, "open").first();
    const sev = f.value > EXTREME_MS || f.reason.indexOf("probe-failure") === 0 ? "high" : "medium";
    const det = String(f.reason || "").slice(0, 300);
    if (openRow) {
      await env.DB_AUDIT.prepare("UPDATE fleet_cal_anomalies SET last_seen=?1, detail=?2 WHERE id=?3").bind(nowIso(), det, openRow.id).run();
    } else {
      await env.DB_AUDIT.prepare("INSERT INTO fleet_cal_anomalies (run_id,probe_id,metric,value,severity,status,detail,first_seen,last_seen) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)").bind(runId, f.probe_id, f.metric, f.value, sev, "open", det, nowIso()).run();
    }
  }
  const open = await env.DB_AUDIT.prepare("SELECT id, probe_id, metric FROM fleet_cal_anomalies WHERE status=?1").bind("open").all();
  for (let i = 0; i < (open.results || []).length; i++) {
    const o = open.results[i];
    if (clean[o.probe_id + "|" + o.metric]) {
      await env.DB_AUDIT.prepare("UPDATE fleet_cal_anomalies SET status=?1 WHERE id=?2").bind("resolved", o.id).run();
    }
  }
  return found.length;
}
__name(detectAnomalies, "detectAnomalies");
async function publishConfig(env, runId) {
  const rows = await env.DB_AUDIT.prepare("SELECT probe_id, metric, ema, p95, n FROM fleet_cal_baselines ORDER BY n DESC LIMIT 80").all();
  const base = (rows.results || []).filter(function(r) {
    return r.metric === "latency_ms";
  });
  const pick = /* @__PURE__ */ __name(function(pid) {
    const r = base.filter(function(b) {
      return b.probe_id === pid;
    });
    return r.length ? r[0] : null;
  }, "pick");
  const ai = pick("qnfo-ai-health");
  const doc = {
    generated_at: nowIso(),
    generator: WORKER,
    version: VERSION,
    note: "autonomous calibration recommendations; consumers apply with fallback to own defaults",
    recommendations: {
      qnfo_ai_http_timeout_ms: ai ? clamp(Math.round(ai.p95 * 8), 12e3, 6e4) : PROBE_MS,
      qnfo_ai_burst_warn_ms: ai ? clamp(Math.round(ai.p95 * 4), 1e3, 15e3) : 3e3,
      d1_query_warn_ms: pick("d1-audit") ? clamp(Math.round(pick("d1-audit").p95 * 5), 200, 5e3) : 1e3
    },
    baselines: base.slice(0, 20).map(function(r) {
      return { probe: r.probe_id, ema_ms: Math.round(r.ema), p95_ms: Math.round(r.p95), n: r.n };
    })
  };
  const prevRaw = await env.KV_CAL.get("latest");
  const prev = jp(prevRaw, null);
  const same = prev && prev.recommendations && JSON.stringify(prev.recommendations) === JSON.stringify(doc.recommendations);
  if (!same) {
    await act(env, runId, "publish-config", "latest", "publish calibration recommendations", prev ? { had: 1 } : { had: 0 }, doc);
    await env.KV_CAL.put("latest", sjs(doc));
    return 1;
  }
  return 0;
}
__name(publishConfig, "publishConfig");
async function tunePlanWeights(env, runId) {
  const since = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const rows = await env.DB_AUDIT.prepare("SELECT probe_id, COUNT(*) AS n, SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS okn FROM fleet_cal_metrics WHERE measured_at >= ?1 GROUP BY probe_id").bind(since).all();
  const stats = {};
  let tot = 0;
  for (let i = 0; i < (rows.results || []).length; i++) {
    const r = rows.results[i];
    const failRate = r.n > 0 ? 1 - (r.okn || 0) / r.n : 0;
    if (failRate > 0.2) {
      stats[r.probe_id] = Math.round(failRate * 100) / 100;
      tot += 1;
    }
  }
  const prev = jp(await stateGet(env, "plan_weights"), null);
  if (tot > 0 && JSON.stringify(prev) !== JSON.stringify(stats)) {
    await act(env, runId, "tune-plan", "fleet_cal_state.plan_weights", "weight probes by 7d failure rate", prev, stats);
    await stateSet(env, "plan_weights", sjs(stats));
    return 1;
  }
  return 0;
}
__name(tunePlanWeights, "tunePlanWeights");
async function retentionCleanup(env, runId) {
  const cutM = new Date(Date.now() - RETENTION_METRICS_DAYS * DAY_MS).toISOString();
  const cutA = new Date(Date.now() - RETENTION_ANOMALY_DAYS * DAY_MS).toISOString();
  const r1 = await env.DB_AUDIT.prepare("DELETE FROM fleet_cal_metrics WHERE measured_at < ?1").bind(cutM).run();
  const r2 = await env.DB_AUDIT.prepare("DELETE FROM fleet_cal_anomalies WHERE status=?1 AND last_seen < ?2").bind("resolved", cutA).run();
  let r2del = 0;
  try {
    const list = await env.R2_AUDIT.list({ prefix: "calibration/" });
    const cutR2 = Date.now() - RETENTION_R2_DAYS * DAY_MS;
    for (let i = 0; i < (list.objects || []).length; i++) {
      const o = list.objects[i];
      if (new Date(o.uploaded).getTime() < cutR2) {
        await env.R2_AUDIT.delete(o.key);
        r2del++;
      }
    }
  } catch (e) {
  }
  const meta = { metrics_del: r1 && r1.meta && r1.meta.changes || 0, anomalies_del: r2 && r2.meta && r2.meta.changes || 0, r2_del: r2del };
  await act(env, runId, "retention-cleanup", "fleet_cal_* + R2 calibration/", "retention policy", null, meta);
}
__name(retentionCleanup, "retentionCleanup");
async function rollbackEngine(env, runId) {
  const acts = await env.DB_AUDIT.prepare("SELECT id, action_type, target, before_json, after_json FROM fleet_cal_actions WHERE verified=0 AND rolled_back=0 ORDER BY id ASC").all();
  const res = acts.results || [];
  let reverted = 0;
  for (let i = 0; i < res.length; i++) {
    const a = res[i];
    let revert = false;
    let reason = "";
    if (a.action_type === "tune-threshold") {
      const parts = String(a.target || "").split("/");
      if (parts.length === 2) {
        const row = await env.DB_AUDIT.prepare("SELECT threshold_mult, ema FROM fleet_cal_baselines WHERE probe_id=?1 AND metric=?2").bind(parts[0], parts[1]).first();
        const after = jp(a.after_json, null);
        if (after && after.threshold_mult && row && Math.abs(row.threshold_mult - after.threshold_mult) > 1e-3) {
          const before = jp(a.before_json, null);
          if (before) {
            await env.DB_AUDIT.prepare("UPDATE fleet_cal_baselines SET n=?3, ema=?4, ema2=?5, p95=?6, min=?7, max=?8, threshold_mult=?9, updated_at=?10 WHERE probe_id=?1 AND metric=?2").bind(parts[0], parts[1], before.n || 0, before.ema || 0, before.ema2 || 0, before.p95 || 0, before.min || 0, before.max || 0, before.threshold_mult || 2, nowIso()).run();
            revert = true;
            reason = "threshold drifted after tune";
          }
        }
      }
    } else if (a.action_type === "publish-config") {
      const cur = jp(await env.KV_CAL.get("latest"), null);
      if (!cur || !cur.generated_at) {
        revert = true;
        reason = "kv config missing after publish";
      }
    }
    if (revert) {
      await env.DB_AUDIT.prepare("UPDATE fleet_cal_actions SET rolled_back=1, rollback_at=?1, rollback_reason=?2 WHERE id=?3").bind(nowIso(), reason, a.id).run();
      await learn(env, runId, "rollback", "reverted " + a.action_type + " on " + a.target + ": " + reason);
      reverted++;
    } else {
      await env.DB_AUDIT.prepare("UPDATE fleet_cal_actions SET verified=1, verified_at=?1 WHERE id=?2").bind(nowIso(), a.id).run();
    }
  }
  return { checked: res.length, reverted };
}
__name(rollbackEngine, "rollbackEngine");
async function selfAudit(env, runId, metrics, expectedProbes, startedAt) {
  const checks = [];
  const have = {};
  metrics.forEach(function(m) {
    have[m.probe_id] = 1;
  });
  const missing = expectedProbes.filter(function(p) {
    return !have[p];
  });
  checks.push({ check: "completeness", pass: missing.length === 0, detail: missing.length ? "missing:" + missing.join(",") : "all-probes-present" });
  let bad = 0;
  metrics.forEach(function(m) {
    if (m.metric === "latency_ms" || m.metric === "p95_ms" || m.metric === "p99_ms") {
      if (!(m.value > 0) || isNaN(m.value)) bad++;
    }
  });
  checks.push({ check: "integrity", pass: bad === 0, detail: bad ? bad + "-bad-latency" : "latency-sane" });
  let extreme = 0;
  metrics.forEach(function(m) {
    if (m.metric === "latency_ms" && m.value > PROBE_MS * 5) extreme++;
    if (m.metric === "status" && m.value > 0 && (m.value < 100 || m.value > 599)) extreme++;
  });
  checks.push({ check: "plausibility", pass: extreme === 0, detail: extreme ? extreme + "-implausible" : "values-plausible" });
  const score = Math.round(checks.filter(function(c) {
    return c.pass;
  }).length / checks.length * 1e3) / 1e3;
  await learn(env, runId, "self-audit", "score=" + score + " " + checks.map(function(c) {
    return c.check + ":" + (c.pass ? "pass" : "FAIL " + c.detail);
  }).join(" "));
  return { score, checks };
}
__name(selfAudit, "selfAudit");
async function runCalibration(env, type, trigger, simulate) {
  await ensureSchema(env);
  const runId = uid();
  const startedAt = nowIso();
  let status = "running";
  try {
    await env.DB_AUDIT.prepare("INSERT INTO fleet_cal_runs (run_id,run_type,trigger,started_at,status) VALUES (?1,?2,?3,?4,?5)").bind(runId, type, trigger, startedAt, "running").run();
  } catch (e) {
    return { run_id: runId, error: "insert-run-failed " + String(e && e.message || e).slice(0, 200) };
  }
  const roll = await rollbackEngine(env, runId);
  const metrics = [];
  const heavy = type === "stress" || type === "monthly";
  const isCatchup = type === "catchup";
  for (let i = 0; i < PROBES.length; i++) {
    const p = PROBES[i];
    if (isCatchup && p.kind !== "http" && p.kind !== "d1") continue;
    let rows = [];
    try {
      if (p.kind === "http") rows = await probeHttp(env, p);
      else if (p.kind === "d1") rows = await probeD1(env);
      else if (p.kind === "r2") rows = await probeR2(env);
      else if (p.kind === "vectorize") rows = await probeVec(env);
    } catch (e) {
      rows = [{ probe_id: p.id, kind: p.kind, target: p.url || p.kind, metric: "latency_ms", value: 0, ok: 0, detail: "probe-threw " + String(e && e.message || e).slice(0, 120) }];
    }
    const failed = rows.some(function(r) {
      return r.ok === 0 && !r.detail.includes("(soft)");
    });
    if (failed && p.kind === "http") {
      const retry = await probeHttp(env, p);
      const retryOk = retry.every(function(r) {
        return r.ok === 1;
      });
      if (retryOk) rows = retry;
      else rows.forEach(function(r) {
        if (r.ok === 0) r.detail = (r.detail || "") + " retry-failed";
      });
    }
    metrics.push.apply(metrics, rows);
  }
  if (heavy) {
    const bat = await probeBattery(env);
    const bur = await probeBurst(env);
    metrics.push.apply(metrics, bat);
    metrics.push.apply(metrics, bur);
  }
  if (simulate === "anomaly") {
    metrics.push({ probe_id: "sim-anomaly", kind: "sim", target: "sim", metric: "latency_ms", value: EXTREME_MS + 1e3, ok: 1, detail: "simulated" });
  }
  const ins = [];
  metrics.forEach(function(m) {
    ins.push(env.DB_AUDIT.prepare("INSERT INTO fleet_cal_metrics (run_id,probe_id,kind,target,metric,value,ok,detail,measured_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(runId, m.probe_id, m.kind, String(m.target || "").slice(0, 200), m.metric, m.value || 0, m.ok, String(m.detail || "").slice(0, 300), startedAt));
  });
  if (ins.length) {
    await env.DB_AUDIT.batch(ins);
  }
  const tuned = await updateBaselines(env, runId, metrics);
  const anomalies = await detectAnomalies(env, runId, metrics);
  let actions = 0;
  if (!isCatchup) {
    actions += await publishConfig(env, runId);
    if (heavy) {
      actions += await tunePlanWeights(env, runId);
    }
  }
  if (type === "monthly") {
    await retentionCleanup(env, runId);
  }
  const audit = await selfAudit(env, runId, metrics, PROBES.map(function(p) {
    return p.id;
  }), startedAt);
  const failN = metrics.filter(function(m) {
    return m.ok === 0 && m.metric === "latency_ms";
  }).length;
  status = audit.score === 1 ? "complete" : audit.score >= 0.66 ? "degraded" : "partial";
  await env.DB_AUDIT.prepare("UPDATE fleet_cal_runs SET finished_at=?1, status=?2, probe_total=?3, probe_ok=?4, probe_fail=?5, anomalies_found=?6, actions_applied=?7, verdict_score=?8, verdict_json=?9, audit_json=?10 WHERE run_id=?11").bind(nowIso(), status, metrics.length, metrics.length - failN, failN, anomalies, actions + tuned, audit.score, sjs(audit.checks), sjs({ roll, simulate: simulate || null }), runId).run();
  await stateSet(env, "last_run", sjs({ run_id: runId, type, status, at: startedAt }));
  return { run_id: runId, type, status, metrics: metrics.length, anomalies, actions: actions + tuned, tuned, audit: audit.score, roll };
}
__name(runCalibration, "runCalibration");
var worker_default = {
  async scheduled(controller, env, ctx) {
    const cron = controller.cron || "";
    let type = "daily";
    if (cron === "30 3 * * 0") type = "stress";
    else if (cron === "0 4 1 * *") type = "monthly";
    const out = await runCalibration(env, type, "cron:" + cron, null);
    await stateSet(env, "last_cron", sjs({ cron, type, out, at: nowIso() }));
    console.log("calibrator-cron", cron, sjs(out).slice(0, 400));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const j = /* @__PURE__ */ __name(function(o, st) {
      return new Response(sjs(o), { status: st || 200, headers: { "Content-Type": "application/json" } });
    }, "j");
    if (p === "/health") {
      const o = { ok: true, worker: WORKER, version: VERSION, at: nowIso() };
      try {
        const last = jp(await stateGet(env, "last_run"), null);
        o.last_run = last;
        const an = await env.DB_AUDIT.prepare("SELECT COUNT(*) AS n FROM fleet_cal_anomalies WHERE status=?1").bind("open").first();
        o.open_anomalies = an ? an.n : 0;
      } catch (e) {
        o.detail = "d1-unavailable";
      }
      return j(o);
    }
    if (p === "/run" && request.method === "POST") {
      const key = request.headers.get("X-Run-Key") || "";
      if (!env.RUN_SECRET || !safeEqual(env.RUN_SECRET, key)) return j({ ok: false, error: "unauthorized" }, 401);
      const type = url.searchParams.get("type") || "daily";
      const simulate = url.searchParams.get("simulate") || null;
      const out = await runCalibration(env, type, "manual:" + type + (simulate ? ":" + simulate : ""), simulate);
      return j({ ok: true, run: out });
    }
    if (p === "/diag" && request.method === "GET") {
      const key = request.headers.get("X-Run-Key") || "";
      if (!env.RUN_SECRET || !safeEqual(env.RUN_SECRET, key)) return j({ ok: false, error: "unauthorized" }, 401);
      const target = url.searchParams.get("url") || "";
      if (!target || !/^https:\/\//.test(target)) return j({ ok: false, error: "https-url-required" }, 400);
      const r = await fetcher(target, "GET", { "User-Agent": "Mozilla/5.0" }, null, PROBE_MS);
      return j({ ok: true, target, status: r.status, ms: r.ms, body: r.text ? r.text.slice(0, 400) : "", err: r.err || null });
    }
    if (p === "/report" && request.method === "GET") {
      const key = request.headers.get("X-Run-Key") || "";
      if (!env.RUN_SECRET || !safeEqual(env.RUN_SECRET, key)) return j({ ok: false, error: "unauthorized" }, 401);
      const runs = await env.DB_AUDIT.prepare("SELECT run_id, run_type, trigger, status, probe_total, probe_fail, anomalies_found, actions_applied, verdict_score, started_at, finished_at FROM fleet_cal_runs ORDER BY started_at DESC LIMIT 15").all();
      const an = await env.DB_AUDIT.prepare("SELECT probe_id, metric, value, severity, first_seen, last_seen, detail FROM fleet_cal_anomalies WHERE status=?1 ORDER BY last_seen DESC LIMIT 20").bind("open").all();
      const base = await env.DB_AUDIT.prepare("SELECT probe_id, metric, n, ema, p95, threshold_mult, updated_at FROM fleet_cal_baselines ORDER BY n DESC LIMIT 30").all();
      const acts = await env.DB_AUDIT.prepare("SELECT action_type, target, reason, applied_at, verified, rolled_back FROM fleet_cal_actions ORDER BY id DESC LIMIT 12").all();
      const learnRows = await env.DB_AUDIT.prepare("SELECT topic, insight, created_at FROM fleet_cal_learnings ORDER BY id DESC LIMIT 12").all();
      return j({ ok: true, worker: WORKER, version: VERSION, runs: runs.results || [], open_anomalies: an.results || [], baselines: base.results || [], recent_actions: acts.results || [], learnings: learnRows.results || [] });
    }
    return j({ ok: false, error: "not-found", worker: WORKER, version: VERSION }, 404);
  }
};
return { default: worker_default };
})();

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "0.4.11";
var ACCOUNT = "edb167b78c9fb901ea5bca3ce58ccc4b";
var GH = "https://raw.githubusercontent.com/QNFO/";
var FETCH_TIMEOUT_MS = 8e3;
var FRESH_MS = 18e5;
var NO_SELF = ["qnfo-fleet-deploy"];
function json(d, s) {
  return new Response(JSON.stringify(d), { status: s || 200, headers: { "Content-Type": "application/json" } });
}
__name(json, "json");
function versionOf(code) {
  code = code || "";
  var i = code.indexOf("VERSION");
  while (i >= 0 && i < code.length) {
    var j = code.indexOf("=", i);
    if (j < 0 || j - i > 15) {
      i = code.indexOf("VERSION", i + 1);
      continue;
    }
    var k = j + 1;
    if (code[k] === " ") k++;
    var d = code[k];
    if (d !== '"' && d !== "'") {
      i = code.indexOf("VERSION", i + 1);
      continue;
    }
    var q = code.indexOf(d, k + 1);
    if (q < 0 || q - k > 40) {
      i = code.indexOf("VERSION", i + 1);
      continue;
    }
    return code.slice(k + 1, q);
  }
  return null;
}
__name(versionOf, "versionOf");
function newer(a, b) {
  a = String(a || "");
  b = String(b || "");
  function num(s) {
    var m = s.split("-")[0];
    var p = m.split(".");
    var n = [];
    for (var i2 = 0; i2 < p.length; i2++) {
      var x2 = parseInt(p[i2], 10);
      n.push(isNaN(x2) ? 0 : x2);
    }
    return n;
  }
  __name(num, "num");
  var ap = num(a), bp = num(b);
  var len = Math.max(ap.length, bp.length);
  for (var i = 0; i < len; i++) {
    var x = ap[i] || 0, y = bp[i] || 0;
    if (x !== y) return x > y;
  }
  return a > b;
}
__name(newer, "newer");
function isModule(code) {
  return (code || "").indexOf("export default") >= 0 || (code || "").indexOf("export {") >= 0 || /^\s*import\s/.test(code || "");
}
__name(isModule, "isModule");
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
__name(workerMeta, "workerMeta");
async function timedFetch(url, opts, ms) {
  var ac = new AbortController();
  var t = setTimeout(function() {
    ac.abort();
  }, ms || FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, Object.assign({}, opts || {}, { signal: ac.signal }));
  } finally {
    clearTimeout(t);
  }
}
__name(timedFetch, "timedFetch");
async function sha256(str) {
  var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(d)).map(function(b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}
__name(sha256, "sha256");
async function stateGet(env, key, fb) {
  try {
    var r = await env.AUDIT.prepare("SELECT value FROM fleet_deploy_state WHERE key=?1").bind(key).first();
    return r && r.value !== null && r.value !== void 0 ? r.value : fb;
  } catch (e) {
    return fb;
  }
}
__name(stateGet, "stateGet");
async function stateSet(env, key, value) {
  try {
    await env.AUDIT.prepare("INSERT INTO fleet_deploy_state (key,value,updated_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')").bind(key, String(value)).run();
  } catch (e) {
  }
}
__name(stateSet, "stateSet");
async function enabled(env) {
  return await stateGet(env, "enabled", "0") === "1";
}
__name(enabled, "enabled");
async function autoHeal(env) {
  return await stateGet(env, "auto_heal", "0") === "1";
}
__name(autoHeal, "autoHeal");
async function audit(env, w, actor, from, to, src2, ok, note) {
  try {
    await env.AUDIT.prepare("INSERT INTO fleet_deploys (worker, actor, from_sha, to_sha, source_path, ok, note, ts) VALUES (?1,?2,?3,?4,?5,?6,?7, datetime('now'))").bind(w, actor, from || "", to || "", src2 || "", ok ? 1 : 0, String(note || "").slice(0, 500)).run();
  } catch (e) {
  }
}
__name(audit, "audit");
async function report(env, w, depV, canV, path, note) {
  try {
    await env.AUDIT.prepare("INSERT INTO fleet_drift_report (worker, deployed_version, canonical_version, source_path, note, ts) VALUES (?1,?2,?3,?4,?5, datetime('now'))").bind(w, depV || "", canV || "", path || "", String(note || "").slice(0, 200)).run();
  } catch (e) {
  }
}
__name(report, "report");
async function ensureHealSchema(env) {
  try { await env.AUDIT.prepare("ALTER TABLE self_heal_actions ADD COLUMN status TEXT").run(); } catch (e) {}
  try { await env.AUDIT.prepare("ALTER TABLE self_heal_actions ADD COLUMN verified_at TEXT").run(); } catch (e) {}
}
async function healLog(env, kind, ref, action, status, detail) {
  try {
    await env.AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts, status, verified_at) VALUES (?1,?2,?3, datetime('now'), ?4, ?5)").bind(kind, ref, String(action || "").slice(0, 300), status || "detected", detail ? String(detail).slice(0, 200) : null).run();
  } catch (e) {
    try { await env.AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts) VALUES (?1,?2,?3, datetime('now'))").bind(kind, ref, "[" + (status || "detected") + "] " + String(action || "").slice(0, 260)).run(); } catch (e2) {}
  }
}
async function scanErr(env, w, reason, depV, canV, path) {
  try {
    var key = "scanerr:" + w;
    var cur = await stateGet(env, key, "");
    if (cur === reason) return;
    await stateSet(env, key, reason);
    await report(env, w, depV || "", canV || "", path || "", "scanerr:" + reason);
  } catch (e) {
  }
}
__name(scanErr, "scanErr");
async function clearScanErr(env, w) {
  try {
    if (await stateGet(env, "scanerr:" + w, "")) await stateSet(env, "scanerr:" + w, "");
  } catch (e) {
  }
}
__name(clearScanErr, "clearScanErr");
async function improvement(env, source, target, kind, title, detail, priority) {
  try {
    var ins = await env.AUDIT.prepare("INSERT OR IGNORE INTO fleet_improvements (source,target,kind,title,detail,priority,status) VALUES (?1,?2,?3,?4,?5,?6,'proposed')").bind(source, target, kind, title, String(detail || "").slice(0, 500), priority).run();
    var ex = await env.AUDIT.prepare("SELECT id FROM fleet_improvements WHERE target=?1 AND kind=?2 AND title=?3 ORDER BY id DESC LIMIT 1").bind(target, kind, title).first();
    return ex ? ex.id : ins.meta && ins.meta.last_row_id ? ins.meta.last_row_id : null;
  } catch (e) {
    return null;
  }
}
__name(improvement, "improvement");
async function selfdocAudit(env) {
  var out = { checked: 0, with_readme: 0, missing: 0, rows: [] };
  try {
    var lr = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts?per_page=100", { headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") } }, 2e4);
    var lj = await lr.json();
    var names = (lj.result || []).map(function(x) {
      return x.id;
    });
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
            if (r.ok) {
              var t = await r.text();
              if (t && t.length > 0 && t.slice(0, 4) !== "404:") found = true;
            }
          } catch (e) {
          }
        }
      }
      if (found) {
        out.with_readme++;
        continue;
      }
      out.missing++;
      var iid = await improvement(env, "scan", n, "hygiene", n + " canonical dir lacks README.md", "no README.md in canonical repo dir (FLEET-SELF-DOC-1)", "P3");
      out.rows.push({ worker: n, id: iid });
    }
  } catch (e) {
    out.error = String(e && e.message || e).slice(0, 120);
  }
  return { ok: true, audit: out };
}
__name(selfdocAudit, "selfdocAudit");
async function r2Read(env, worker) {
  try {
    if (!env.CANONICAL) return null;
    var o = await env.CANONICAL.get(worker + ".js");
    if (!o) return null;
    var t = await o.text();
    if (!t || t.length === 0) return null;
    var ts = o.customMetadata && o.customMetadata.ts ? parseInt(o.customMetadata.ts, 10) : 0;
    var age = isNaN(ts) ? FRESH_MS + 1 : Date.now() - ts;
    return { code: t, fresh: age < FRESH_MS, path: "r2:qnfo-canonical/" + worker + ".js" };
  } catch (e) {
    return null;
  }
}
__name(r2Read, "r2Read");
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
          try {
            if (env.CANONICAL) await env.CANONICAL.put(worker + ".js", c, { httpMetadata: { contentType: "text/plain" }, customMetadata: { ts: String(Date.now()) } });
          } catch (e) {
          }
          return { path: cs[i], code: c };
        }
      }
    } catch (e) {
    }
  }
  if (r2) return r2;
  return null;
}
__name(canonical, "canonical");
async function deployedContent(env, worker) {
  try {
    var r = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/" + worker + "/content/v2", { headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") } }, FETCH_TIMEOUT_MS);
    if (!r.ok) return null;
    return await r.text();
  } catch (e) {
    return null;
  }
}
__name(deployedContent, "deployedContent");
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
  } catch (e) {
    return null;
  }
}
__name(probeVersion, "probeVersion");
async function cooldown(env, worker) {
  try {
    var r = await env.AUDIT.prepare("SELECT ts FROM fleet_deploys WHERE worker=?1 AND ok=1 ORDER BY id DESC LIMIT 1").bind(worker).first();
    if (r && r.ts) {
      var age = Date.now() - (/* @__PURE__ */ new Date(String(r.ts).replace(" ", "T") + "Z")).getTime();
      if (!isNaN(age) && age < 6e4) return true;
    }
  } catch (e) {
  }
  return false;
}
__name(cooldown, "cooldown");
async function redeploy(env, worker) {
  if (!/^[a-zA-Z0-9-]+$/.test(worker)) return { ok: false, status: 400, note: "invalid name" };
  if (NO_SELF.indexOf(worker) >= 0) return { ok: false, status: 400, note: "self-redeploy refused" };
  if (!await enabled(env)) return { ok: false, status: 403, note: "kill-switch closed" };
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
  var toSha = await sha256(c.code);
  var meta = await workerMeta(env, worker);
  var isMod = isModule(c.code);
  if (meta && typeof meta.module === "boolean") isMod = meta.module;
  else if (meta && meta.main_module) isMod = true;
  var mm = (meta && meta.main_module) || "worker.js";
  var r;
  if (isMod) {
    var fd = new FormData();
    fd.append("metadata", new Blob([JSON.stringify(Object.assign({ main_module: mm }, (meta && meta.bindings && meta.bindings.length) ? { bindings: meta.bindings } : {}))], { type: "application/json" }));
    fd.append(mm, new Blob([c.code], { type: "application/javascript+module" }), mm);
    r = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/" + worker + "/content", { method: "PUT", headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") }, body: fd }, 2e4);
  } else {
    r = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/" + worker + "/content", { method: "PUT", headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || ""), "Content-Type": "application/javascript" }, body: c.code }, 2e4);
  }
  var j = null;
  try {
    j = await r.json();
  } catch (e) {
  }
  var putOk = r.ok && !(j && j.success === false);
  var dep2 = await deployedContent(env, worker);
  var depV2 = dep2 ? versionOf(dep2) : null;
  var ok = putOk && depV2 === canV;
  var note = !putOk ? "HTTP " + r.status + " " + JSON.stringify(j || {}).slice(0, 180) : ok ? "redeployed " + depV + " -> " + canV : "PUT-ok but deployed still " + (depV2 || "?") + " (wrangler-managed no-op?)";
  await audit(env, worker, "deploy", depV || "?", canV, c.path, ok, note);
  return { ok, status: ok ? 200 : 502, note, from: depV, to: canV, direction, source: c.path, bytes: c.code.length };
}
__name(redeploy, "redeploy");
async function scan(env, heal) {
  var out = { scanned: 0, clean: 0, drifted: 0, ahead: 0, healed: 0, errors: 0, staleCanon: 0, healthVer: 0, errKinds: {}, details: [] };
  try {
    await ensureHealSchema(env);
    var lr = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts?per_page=100", { headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") } }, 2e4);
    var lj = await lr.json();
    var names = (lj.result || []).map(function(x) {
      return x.id;
    });
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (NO_SELF.indexOf(n) >= 0) continue;
      out.scanned++;
      var c = await canonical(env, n);
      if (!c) {
        out.errors++;
        out.errKinds["nocanon"] = (out.errKinds["nocanon"] || 0) + 1;
        if (out.details.length < 80) out.details.push(n + ":nocanon");
        await scanErr(env, n, "nocanon", "", "", "");
        continue;
      }
      var canV = versionOf(c.code);
      var usedHealth = false;
      if (!canV) {
        var hv = await probeVersion(env, n);
        if (hv) {
          canV = hv;
          usedHealth = true;
        }
      }
      if (!canV) {
        var depHeal = await deployedContent(env, n);
        var depHealV = depHeal ? versionOf(depHeal) : null;
        if (depHealV) {
          out.staleCanon++;
          out.errKinds["stale-canon"] = (out.errKinds["stale-canon"] || 0) + 1;
          if (out.details.length < 80) out.details.push(n + ":staleCanon->" + depHealV);
          await scanErr(env, n, "stale-canon", depHealV, "", c.path);
          var scHealed = false;
          try {
            if (env.CANONICAL) {
              await env.CANONICAL.put(n + ".js", depHeal, { httpMetadata: { contentType: "text/plain" }, customMetadata: { ts: String(Date.now()) } });
              var scChk = await env.CANONICAL.get(n + ".js");
              var scTxt = scChk ? await scChk.text() : "";
              scHealed = !!versionOf(scTxt);
            }
          } catch (e) {
          }
          await healLog(env, "stale-canon", n, "canonical resync " + depHealV + (scHealed ? " verified" : " unverified"), scHealed ? "healed" : "failed", c.path);
          continue;
        }
        out.errors++;
        out.errKinds["noVERSION"] = (out.errKinds["noVERSION"] || 0) + 1;
        if (out.details.length < 80) out.details.push(n + ":noVERSION");
        await scanErr(env, n, "noVERSION", "", "", c.path);
        continue;
      }
      var dep = await deployedContent(env, n);
      if (!dep) {
        out.errors++;
        out.errKinds["nodeployed"] = (out.errKinds["nodeployed"] || 0) + 1;
        if (out.details.length < 80) out.details.push(n + ":nodeployed");
        await scanErr(env, n, "nodeployed", "", canV, c.path);
        continue;
      }
      var depV = versionOf(dep);
      if (!depV) {
        var hv2 = await probeVersion(env, n);
        if (hv2) {
          depV = hv2;
          usedHealth = true;
        }
      }
      if (!depV) {
        out.errors++;
        out.errKinds["nodepV"] = (out.errKinds["nodepV"] || 0) + 1;
        if (out.details.length < 80) out.details.push(n + ":nodepV");
        await scanErr(env, n, "nodepV", "", canV, c.path);
        continue;
      }
      if (usedHealth) {
        out.healthVer++;
        out.errKinds["health-ver"] = (out.errKinds["health-ver"] || 0) + 1;
        await healLog(env, "health-ver", n, "version resolved via /health only", "deferred", "canonical source lacks VERSION marker");
      }
      if (depV === canV) {
        await clearScanErr(env, n);
        out.clean++;
        continue;
      }
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
      if (heal && !usedHealth) {
        var res = await redeploy(env, n);
        if (res.ok) { out.healed++; await healLog(env, "drift", n, "redeploy " + depV + "->" + canV, "healed", res.note); }
        else await healLog(env, "drift", n, "redeploy failed " + depV + "->" + canV, "failed", res.note);
      } else {
        await healLog(env, "drift", n, "behind " + depV + "->" + canV, usedHealth ? "deferred" : "detected", usedHealth ? "canonical via /health; no source to redeploy" : "auto-heal off (auto_heal!=1)");
      }
    }
  } catch (e) {
    out.errors++;
    out.note = String(e && e.message || e).slice(0, 120);
  }
  return out;
}
__name(scan, "scan");
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
    out.overdueRows = (rows.results || []).map(function(r) {
      return { id: r.id, due: r.due, owner: r.owner, title: String(r.title || "").slice(0, 60) };
    });
    for (var i = 0; i < out.overdueRows.length; i++) {
      var rr = out.overdueRows[i];
      var ex = await env.AUDIT.prepare("SELECT COUNT(*) c FROM fleet_improvements WHERE evidence LIKE ?1 AND status IN ('proposed','approved','in_progress')").bind("%register:" + rr.id + "%").first();
      if (!ex || ex.c === 0) {
        await improvement(env, "register", "row-" + rr.id, "hygiene", "Register row " + rr.id + " OVERDUE (due " + rr.due + ", owner " + rr.owner + ")", String(rr.title || "").slice(0, 120) + " [register:" + rr.id + "]", "P1");
        out.escalated++;
      }
    }
    return out;
  } catch (e) {
    return { error: String(e && e.message || e).slice(0, 160) };
  }
}
__name(registerWatch, "registerWatch");
var worker_default = {
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
      var body = {};
      try {
        body = await request.json();
      } catch (e) {
      }
      var w = body.worker || u.searchParams.get("worker");
      if (!w) return json({ error: "worker required" }, 400);
      var res = await redeploy(env, String(w));
      return json(res, res.ok ? 200 : res.status);
    }
    if (p === "/improvements" && request.method === "GET") {
      try {
        var irows = await env.AUDIT.prepare("SELECT * FROM fleet_improvements ORDER BY CASE status WHEN 'proposed' THEN 0 WHEN 'approved' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'done' THEN 3 WHEN 'rejected' THEN 4 ELSE 5 END, CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, id DESC LIMIT 200").all();
        var counts = { total: 0, proposed: 0, approved: 0, in_progress: 0, done: 0, rejected: 0 };
        for (var ci = 0; ci < (irows.results || []).length; ci++) {
          var st = irows.results[ci].status;
          counts.total++;
          if (counts[st] !== void 0) counts[st]++;
        }
        return json({ ok: true, counts, rows: irows.results || [] });
      } catch (e) {
        return json({ ok: false, error: String(e && e.message || e).slice(0, 200) }, 500);
      }
    }
    if (p === "/improvements" && request.method === "POST" && admin) {
      var ib = {};
      try {
        ib = await request.json();
      } catch (e) {
      }
      if (!ib.title) return json({ error: "title required" }, 400);
      var iid2 = await improvement(env, ib.source || "manual", ib.target || "fleet", ib.kind || "enhancement", String(ib.title), ib.detail || "", ib.priority || "P2");
      return json({ ok: true, id: iid2 });
    }
    if (p === "/improvements/resolve" && request.method === "POST" && admin) {
      var rb = {};
      try {
        rb = await request.json();
      } catch (e) {
      }
      if (!rb.id || !rb.status) return json({ error: "id and status required" }, 400);
      try {
        await env.AUDIT.prepare("UPDATE fleet_improvements SET status=?1, evidence=?2, updated_at=datetime('now') WHERE id=?3").bind(String(rb.status), String(rb.evidence || "").slice(0, 500), Number(rb.id)).run();
        return json({ ok: true, id: rb.id, status: rb.status });
      } catch (e) {
        return json({ ok: false, error: String(e && e.message || e).slice(0, 200) }, 500);
      }
    }
    if (p === "/kaizen" && request.method === "GET") {
      try {
        var krows = await env.AUDIT.prepare("SELECT * FROM fleet_improvements WHERE status IN ('proposed','approved','in_progress') ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, id DESC LIMIT 100").all();
        var srows = await env.AUDIT.prepare("SELECT * FROM fleet_drift_report WHERE worker='SCAN' ORDER BY id DESC LIMIT 3").all();
        var rw3 = await registerWatch(env, 7);
        return json({ ok: true, open_improvements: krows.results || [], recent_scans: srows.results || [], register: rw3 });
      } catch (e) {
        return json({ ok: false, error: String(e && e.message || e).slice(0, 200) }, 500);
      }
    }
    if (p === "/selfdoc-audit" && request.method === "POST" && admin) {
      return json(await selfdocAudit(env));
    }
    if (p === "/health-report" && request.method === "POST" && admin) {
      var pb = {};
      try {
        pb = await request.json();
      } catch (e) {
      }
      var probes = Array.isArray(pb.probes) ? pb.probes : [];
      var out2 = { healthy: 0, unhealthy: 0, coverage: 0, filed: [] };
      for (var pi = 0; pi < probes.length; pi++) {
        var pr = probes[pi];
        var wname = String(pr && pr.worker || "");
        if (!wname || NO_SELF.indexOf(wname) >= 0) continue;
        var pst = Number(pr && pr.status || 0);
        if (pst === 200) {
          out2.healthy++;
          continue;
        }
        if (pst >= 500 && pst !== 530) {
          out2.unhealthy++;
          var hid = await improvement(env, "probe", wname, "health", wname + " /health HTTP " + pst, "external probe returned HTTP " + pst, "P1");
          out2.filed.push({ worker: wname, id: hid });
        } else {
          out2.coverage++;
          var cid = await improvement(env, "probe", wname, "coverage", wname + " lacks 200 /health (observed " + (pst || "network-error") + ")", "no 200 from /health endpoint (FLEET-PROBE-COVERAGE-1)", "P3");
          out2.filed.push({ worker: wname, id: cid });
        }
      }
      return json({ ok: true, report: out2 });
    }
    if (p === "/register" && request.method === "GET" && (admin || sh)) {
      try {
        return json({ ok: true, register: await registerWatch(env, 7) });
      } catch (e) {
        return json({ error: String(e && e.message || e).slice(0, 160) }, 500);
      }
    }
    if (p === "/drift" && request.method === "POST" && admin) {
      var res = await scan(env, false);
      await report(env, "SCAN", "", "", "", "manual-drift: scanned=" + res.scanned + " clean=" + res.clean + " drifted=" + res.drifted + " ahead=" + res.ahead + " healed=" + res.healed + " errors=" + res.errors + " staleCanon=" + res.staleCanon + " healthVer=" + res.healthVer + " errKinds=" + JSON.stringify(res.errKinds));
      var rw = await registerWatch(env, 7);
      return json({ ok: true, scan: res, register: rw });
    }
    if (p === "/scan-heal" && request.method === "POST" && admin) {
      var res2 = await scan(env, true);
      await report(env, "SCAN", "", "", "", "manual-scan-heal: scanned=" + res2.scanned + " clean=" + res2.clean + " drifted=" + res2.drifted + " ahead=" + res2.ahead + " healed=" + res2.healed + " errors=" + res2.errors + " staleCanon=" + res2.staleCanon + " healthVer=" + res2.healthVer + " errKinds=" + JSON.stringify(res2.errKinds));
      var rw2 = await registerWatch(env, 7);
      return json({ ok: true, scan: res2, register: rw2 });
    }
    return json({ error: "not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    var heal = await autoHeal(env);
    var res = await scan(env, heal);
    var rw = await registerWatch(env, 7);
    await report(env, "SCAN", "", "", "", "cron: scanned=" + res.scanned + " clean=" + res.clean + " drifted=" + res.drifted + " ahead=" + res.ahead + " healed=" + res.healed + " errors=" + res.errors + " staleCanon=" + res.staleCanon + " healthVer=" + res.healthVer + " errKinds=" + JSON.stringify(res.errKinds) + " regOpen=" + rw.open + " regOverdue=" + rw.overdue + " regDue7=" + rw.dueSoon + " regEscalated=" + rw.escalated);
  }
};
var deployDefault = worker_default;


// ===== MERGED DISPATCH (2026-09-11: advisor + calibrator + deploy -> qnfo-fleet-control) =====
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === "/advisor" || p.startsWith("/advisor/")) {
      const u2 = new URL(request.url);
      u2.pathname = p.slice("/advisor".length) || "/";
      return advisorMod.default.fetch(new Request(u2.toString(), request), env, ctx);
    }
    if (p === "/cal" || p.startsWith("/cal/")) {
      const u2 = new URL(request.url);
      u2.pathname = p.slice("/cal".length) || "/";
      return calibratorMod.default.fetch(new Request(u2.toString(), request), env, ctx);
    }
    return deployDefault.fetch(request, env, ctx);
  },
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    if (cron === "*/20 * * * *") return advisorMod.default.scheduled(event, env, ctx);
    if (cron === "0 3 * * *" || cron === "0 4 1 * *" || cron === "30 3 * * 1") return calibratorMod.default.scheduled(event, env, ctx);
    return deployDefault.scheduled(event, env, ctx);
  },
};
