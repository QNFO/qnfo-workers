var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var advisorMod = (function() {
  var __defProp3 = Object.defineProperty;
  var __name3 = /* @__PURE__ */ __name2((target, value) => __defProp3(target, "name", { value, configurable: true }), "__name");
  var VERSION2 = "0.3.3";
  var WORKER = "qnfo-fleet-advisor";
  var nowIso = /* @__PURE__ */ __name3(() => (/* @__PURE__ */ new Date()).toISOString(), "nowIso");
  async function workerNameSet(env) {
    try {
      const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + (env.CF_ACCOUNT_ID || "edb167b78c9fb901ea5bca3ce58ccc4b") + "/workers/scripts?per_page=100", { headers: { "Authorization": "Bearer " + env.CF_API_TOKEN, "User-Agent": "qnfo-fleet-advisor" }, signal: AbortSignal.timeout(8e3) });
      if (!r.ok) return null;
      const j = await r.json();
      return new Set((j.result || []).map((x) => x.id));
    } catch (e) {
      return null;
    }
  }
  __name(workerNameSet, "workerNameSet");
  __name2(workerNameSet, "workerNameSet");
  async function probeHealth(name, names) {
    if (names && names.size) {
      if (names.has(name)) return { ok: true, via: "cf-api-list", version: null, existence_only: true };
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
  __name2(probeHealth, "probeHealth");
  __name3(probeHealth, "probeHealth");
  async function d1All(env, sql, params) {
    const st = env.AUDIT_DB.prepare(sql);
    const x = await (params ? st.bind(...params).all() : st.all());
    return x && x.results ? x.results : [];
  }
  __name(d1All, "d1All");
  __name2(d1All, "d1All");
  __name3(d1All, "d1All");
  async function d1Run(env, sql, params) {
    const st = env.AUDIT_DB.prepare(sql);
    return await (params ? st.bind(...params).run() : st.run());
  }
  __name(d1Run, "d1Run");
  __name2(d1Run, "d1Run");
  __name3(d1Run, "d1Run");
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
  __name2(gatewayConfigAudit, "gatewayConfigAudit");
  __name3(gatewayConfigAudit, "gatewayConfigAudit");
  async function spendGuardAudit(env) {
    if (!env.CF_API_TOKEN) return { skipped: true, reason: "no CF_API_TOKEN" };
    try {
      const url = "https://api.cloudflare.com/client/v4/accounts/" + env.CF_ACCOUNT_ID + "/ai-gateway/billing/spending-limit";
      const resp = await fetch(url, { headers: { Authorization: "Bearer " + env.CF_API_TOKEN }, signal: AbortSignal.timeout(8e3) });
      const j = await resp.json();
      const r = j && j.result || {};
      const enabled2 = r.enabled === true;
      const amt = r.config && r.config.amount || 0;
      return { skipped: false, enabled: enabled2, amount: amt, detail: "enabled=" + enabled2 + " amount=" + amt + " " + (r.config && r.config.duration || "") + " " + (r.config && r.config.strategy || "") };
    } catch (e) {
      return { skipped: true, reason: String(e && e.message || e).slice(0, 160) };
    }
  }
  __name(spendGuardAudit, "spendGuardAudit");
  __name2(spendGuardAudit, "spendGuardAudit");
  __name3(spendGuardAudit, "spendGuardAudit");
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
  __name2(collectFeedback, "collectFeedback");
  __name3(collectFeedback, "collectFeedback");
  async function runAudit(env) {
    const ts = nowIso();
    const findings = [];
    const PROBES = (env.PROBE_WORKERS || "qnfo-ai,qnfo-ops,qnfo-kaizen,qnfo-cloud-ops,qnfo-infra,qnfo-observability").split(",").map((s) => s.trim()).filter(Boolean);
    const workerNames = await workerNameSet(env);
    const results = await Promise.all(PROBES.map((n) => probeHealth(n, workerNames)));
    const down = [];
    const existenceOnly = [];
    for (let i = 0; i < PROBES.length; i++) {
      if (!results[i].ok) down.push(PROBES[i] + "(" + (results[i].detail || "") + ")");
      else if (results[i].existence_only) existenceOnly.push(PROBES[i]);
    }
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
      if (n > 8) {
        findings.push({ kind: "backlog", severity: "low", title: "OPEN-ISSUES-BACKLOG", detail: n + " open agent_issues (excluding advisor OPEN-ISSUES tickets)" });
      } else {
        await d1Run(env, "UPDATE agent_issues SET status='closed', updated_at=? WHERE status='open' AND source=? AND category='backlog' AND title LIKE 'OPEN-ISSUES %'", [ts, WORKER]);
      }
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
    const modelP = env.ADVISOR_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
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
        const rp = await aiRunAttr(env, "fleet-control", "advisor-propose", modelP, { messages: [{ role: "user", content: prompt }], max_tokens: 350, temperature: 0.3 });
        const cp = rp && rp.response || rp && rp.choices && rp.choices[0] && rp.choices[0].message && rp.choices[0].message.content;
        let proposal = String(cp || "").trim().slice(0, 800);
        let verdict = "";
        let rounds = 0;
        if (proposal) {
          for (let i = 0; i < iters; i++) {
            rounds = i + 1;
            const rv = await aiRunAttr(env, "fleet-control", "advisor-review", modelR, { messages: [{ role: "user", content: "Review this advisor action. If specific, falsifiable, high-value -> reply ACCEPT. Else reply IMPROVE then the improved action (owner + priority), max 120 words." + NL + "Proposal: " + proposal }], max_tokens: 350, temperature: 0.2 });
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
        const prefixDedupe = f.kind === "model-health" ? "MODEL-DEGRADED %" : f.kind === "gateway-config" ? "GATEWAY-DRIFT %" : null;
        const existing = prefixDedupe ? await d1All(env, "SELECT id FROM agent_issues WHERE status='open' AND title LIKE ?", [prefixDedupe]) : await d1All(env, "SELECT id FROM agent_issues WHERE status='open' AND title = ?", [f.title]);
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
    const state = { up: PROBES.length - down.length - existenceOnly.length, down: down.length, existence_only: existenceOnly.length, findings: findings.length, filed, suggestion, gateway_drift: gw.skipped ? null : gw.drift, spend_guard, ensemble, ts };
    try {
      await d1Run(
        env,
        "INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?,?,?,?,?,?)",
        ["adv-" + Date.now().toString(36), ts, "advisor-audit", JSON.stringify(state).slice(0, 1800), WORKER, "ok"]
      );
    } catch (e) {
    }
    return { ok: true, worker: WORKER, version: VERSION2, ts, probed: PROBES.length, up: PROBES.length - down.length - existenceOnly.length, down: down.length, existence_only: existenceOnly.length, findings: findings.length, filed, suggestion: suggestion ? suggestion.slice(0, 400) : null };
  }
  __name(runAudit, "runAudit");
  __name2(runAudit, "runAudit");
  __name3(runAudit, "runAudit");
  var FleetAdvisor2 = class {
    static {
      __name(this, "FleetAdvisor2");
    }
    static {
      __name2(this, "FleetAdvisor");
    }
    static {
      __name3(this, "FleetAdvisor");
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
      return new Response(JSON.stringify({ worker: WORKER, version: VERSION2, hint: "POST /run-audit (x-advisor-token) or scheduled cron" }), { status: 200 });
    }
  };
  var server_default = {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === "/health") {
        return Response.json({ ok: true, worker: WORKER, version: VERSION2, model: env.ADVISOR_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast", bindings: { d1: !!env.AUDIT_DB, ai: !!env.AI, do: !!env.FleetAdvisor }, crons: ["*/20 * * * *"] });
      }
      if (url.pathname === "/run-audit" && request.method === "POST") {
        const auth = request.headers.get("x-advisor-token");
        if (auth !== env.ADVISOR_TOKEN) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
        return Response.json(await runAudit(env));
      }
      if (url.pathname === "/") return new Response("qnfo-fleet-advisor v" + VERSION2 + ": autonomous fleet advisor. GET /health | POST /run-audit (x-advisor-token) | cron */20.", { status: 200 });
      return new Response("not found", { status: 404 });
    },
    async scheduled(event, env, ctx) {
      ctx.waitUntil(runAudit(env));
    }
  };
  return { FleetAdvisor: FleetAdvisor2, default: server_default };
})();
var calibratorMod = (function() {
  var __defProp3 = Object.defineProperty;
  var __name3 = /* @__PURE__ */ __name2((target, value) => __defProp3(target, "name", { value, configurable: true }), "__name");
  var VERSION2 = "1.0.0";
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
  __name2(nowIso, "nowIso");
  __name3(nowIso, "nowIso");
  function uid() {
    try {
      return crypto.randomUUID();
    } catch (e) {
      return "r" + Date.now() + Math.random().toString(16).slice(2);
    }
  }
  __name(uid, "uid");
  __name2(uid, "uid");
  __name3(uid, "uid");
  function jp(s, fb) {
    if (s === null || s === void 0) return fb;
    try {
      return JSON.parse(s);
    } catch (e) {
      return fb;
    }
  }
  __name(jp, "jp");
  __name2(jp, "jp");
  __name3(jp, "jp");
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  __name(clamp, "clamp");
  __name2(clamp, "clamp");
  __name3(clamp, "clamp");
  function sjs(v) {
    try {
      return JSON.stringify(v);
    } catch (e) {
      return "{}";
    }
  }
  __name(sjs, "sjs");
  __name2(sjs, "sjs");
  __name3(sjs, "sjs");
  function safeEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }
  __name(safeEqual, "safeEqual");
  __name2(safeEqual, "safeEqual");
  __name3(safeEqual, "safeEqual");
  var PROBES = [
    { id: "qnfo-ai-health", kind: "http", url: "https://qnfo-ai.q08.workers.dev/health", binding: "SVC_QNFO_AI", expect: 200 },
    { id: "qnfo-ai-models", kind: "http", url: "https://qnfo-ai.q08.workers.dev/v1/models", binding: "SVC_QNFO_AI", expect: 200 },
    { id: "qnfo-infra-health", kind: "http", url: "https://qnfo-infra.q08.workers.dev/health", binding: "SVC_QNFO_INFRA", expect: 200 },
    { id: "qnfo-ops-health", kind: "http", url: "https://qnfo-ops.q08.workers.dev/health", expect: 200 },
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
  __name2(ensureSchema, "ensureSchema");
  __name3(ensureSchema, "ensureSchema");
  async function stateGet2(env, k) {
    try {
      const r = await env.DB_AUDIT.prepare("SELECT v FROM fleet_cal_state WHERE k=?1").bind(k).first();
      return r ? r.v : null;
    } catch (e) {
      return null;
    }
  }
  __name(stateGet2, "stateGet2");
  __name2(stateGet2, "stateGet");
  __name3(stateGet2, "stateGet");
  async function stateSet2(env, k, v) {
    await env.DB_AUDIT.prepare("INSERT INTO fleet_cal_state (k,v,updated_at) VALUES (?1,?2,?3) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at").bind(k, v, nowIso()).run();
  }
  __name(stateSet2, "stateSet2");
  __name2(stateSet2, "stateSet");
  __name3(stateSet2, "stateSet");
  async function learn(env, runId, topic, insight) {
    try {
      await env.DB_AUDIT.prepare("INSERT INTO fleet_cal_learnings (run_id,topic,insight,created_at) VALUES (?1,?2,?3,?4)").bind(runId, topic, String(insight).slice(0, 600), nowIso()).run();
    } catch (e) {
    }
  }
  __name(learn, "learn");
  __name2(learn, "learn");
  __name3(learn, "learn");
  async function act(env, runId, at, target, reason, before, after) {
    try {
      await env.DB_AUDIT.prepare("INSERT INTO fleet_cal_actions (run_id,action_type,target,reason,before_json,after_json,applied_at) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(runId, at, target, String(reason || "").slice(0, 400), sjs(before), sjs(after), nowIso()).run();
      return 1;
    } catch (e) {
      return 0;
    }
  }
  __name(act, "act");
  __name2(act, "act");
  __name3(act, "act");
  function ua() {
    return { "User-Agent": "qnfo-fleet-calibrator/" + VERSION2 + " (self-calibration)" };
  }
  __name(ua, "ua");
  __name2(ua, "ua");
  __name3(ua, "ua");
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
  __name2(fetcher, "fetcher");
  __name3(fetcher, "fetcher");
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
  __name2(svcFetch, "svcFetch");
  __name3(svcFetch, "svcFetch");
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
  __name2(probeHttp, "probeHttp");
  __name3(probeHttp, "probeHttp");
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
  __name2(probeD1, "probeD1");
  __name3(probeD1, "probeD1");
  async function probeR2(env) {
    const key = "calibration/selfcheck-" + nowIso().slice(0, 10) + ".json";
    const body = sjs({ ts: nowIso(), worker: WORKER, version: VERSION2 });
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
  __name2(probeR2, "probeR2");
  __name3(probeR2, "probeR2");
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
  __name2(probeVec, "probeVec");
  __name3(probeVec, "probeVec");
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
  __name2(probeBurst, "probeBurst");
  __name3(probeBurst, "probeBurst");
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
  __name2(probeBattery, "probeBattery");
  __name3(probeBattery, "probeBattery");
  function baselineKey(metric) {
    return metric === "latency_ms" || metric === "p95_ms" || metric === "p99_ms";
  }
  __name(baselineKey, "baselineKey");
  __name2(baselineKey, "baselineKey");
  __name3(baselineKey, "baselineKey");
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
  __name2(updateBaselines, "updateBaselines");
  __name3(updateBaselines, "updateBaselines");
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
  __name2(detectAnomalies, "detectAnomalies");
  __name3(detectAnomalies, "detectAnomalies");
  async function publishConfig(env, runId) {
    const rows = await env.DB_AUDIT.prepare("SELECT probe_id, metric, ema, p95, n FROM fleet_cal_baselines ORDER BY n DESC LIMIT 80").all();
    const base = (rows.results || []).filter(function(r) {
      return r.metric === "latency_ms";
    });
    const pick = /* @__PURE__ */ __name3(function(pid) {
      const r = base.filter(function(b) {
        return b.probe_id === pid;
      });
      return r.length ? r[0] : null;
    }, "pick");
    const ai = pick("qnfo-ai-health");
    const doc = {
      generated_at: nowIso(),
      generator: WORKER,
      version: VERSION2,
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
  __name2(publishConfig, "publishConfig");
  __name3(publishConfig, "publishConfig");
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
    const prev = jp(await stateGet2(env, "plan_weights"), null);
    if (tot > 0 && JSON.stringify(prev) !== JSON.stringify(stats)) {
      await act(env, runId, "tune-plan", "fleet_cal_state.plan_weights", "weight probes by 7d failure rate", prev, stats);
      await stateSet2(env, "plan_weights", sjs(stats));
      return 1;
    }
    return 0;
  }
  __name(tunePlanWeights, "tunePlanWeights");
  __name2(tunePlanWeights, "tunePlanWeights");
  __name3(tunePlanWeights, "tunePlanWeights");
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
  __name2(retentionCleanup, "retentionCleanup");
  __name3(retentionCleanup, "retentionCleanup");
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
  __name2(rollbackEngine, "rollbackEngine");
  __name3(rollbackEngine, "rollbackEngine");
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
  __name2(selfAudit, "selfAudit");
  __name3(selfAudit, "selfAudit");
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
    const audit2 = await selfAudit(env, runId, metrics, PROBES.map(function(p) {
      return p.id;
    }), startedAt);
    const failN = metrics.filter(function(m) {
      return m.ok === 0 && m.metric === "latency_ms";
    }).length;
    status = audit2.score === 1 ? "complete" : audit2.score >= 0.66 ? "degraded" : "partial";
    await env.DB_AUDIT.prepare("UPDATE fleet_cal_runs SET finished_at=?1, status=?2, probe_total=?3, probe_ok=?4, probe_fail=?5, anomalies_found=?6, actions_applied=?7, verdict_score=?8, verdict_json=?9, audit_json=?10 WHERE run_id=?11").bind(nowIso(), status, metrics.length, metrics.length - failN, failN, anomalies, actions + tuned, audit2.score, sjs(audit2.checks), sjs({ roll, simulate: simulate || null }), runId).run();
    await stateSet2(env, "last_run", sjs({ run_id: runId, type, status, at: startedAt }));
    return { run_id: runId, type, status, metrics: metrics.length, anomalies, actions: actions + tuned, tuned, audit: audit2.score, roll };
  }
  __name(runCalibration, "runCalibration");
  __name2(runCalibration, "runCalibration");
  __name3(runCalibration, "runCalibration");
  var worker_default3 = {
    async scheduled(controller, env, ctx) {
      const cron = controller.cron || "";
      let type = "daily";
      if (cron === "30 3 * * 0") type = "stress";
      else if (cron === "0 4 1 * *") type = "monthly";
      const out = await runCalibration(env, type, "cron:" + cron, null);
      await stateSet2(env, "last_cron", sjs({ cron, type, out, at: nowIso() }));
      console.log("calibrator-cron", cron, sjs(out).slice(0, 400));
    },
    async fetch(request, env) {
      const url = new URL(request.url);
      const p = url.pathname;
      const j = /* @__PURE__ */ __name3(function(o, st) {
        return new Response(sjs(o), { status: st || 200, headers: { "Content-Type": "application/json" } });
      }, "j");
      if (p === "/health") {
        const o = { ok: true, worker: WORKER, version: VERSION2, at: nowIso() };
        try {
          const last = jp(await stateGet2(env, "last_run"), null);
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
        return j({ ok: true, worker: WORKER, version: VERSION2, runs: runs.results || [], open_anomalies: an.results || [], baselines: base.results || [], recent_actions: acts.results || [], learnings: learnRows.results || [] });
      }
      return j({ ok: false, error: "not-found", worker: WORKER, version: VERSION2 }, 404);
    }
  };
  return { default: worker_default3 };
})();
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var VERSION = "0.4.75-watchmaker-index";

/* FLEET-SELFSTATE-1 (2026-09-30): the fleet must always know its own state, its own issues and
   its own health. Measured deficit before this fix: fleet_heartbeat held 3 workers of 38, and the
   ops fleet_status tool returned healthy=null for 27/38 because it probes only the 12 services it
   holds service bindings for. service_registry carries base_url for 38/38, so the gap was the
   PROBE, not the data. This route probes every registry base_url /health, aggregates issues +
   queues + freshness, and snapshots the result so self-knowledge is also time-series. */
var STATE_SCHEMA = "fleet-state/v1";
async function selfState(env) {
  var ts = (/* @__PURE__ */ new Date()).toISOString();
  var out = { schema: STATE_SCHEMA, worker: "qnfo-fleet-control", version: VERSION, generated_at: ts, workers: [], issues: {}, queues: {}, freshness: {}, summary: {} };
  var reg = [];
  try {
    var rr = await env.DB_AUDIT.prepare("SELECT service, version, base_url FROM service_registry ORDER BY service").all();
    reg = rr.results || [];
  } catch (e) {
    out.registry_error = String(e && e.message || e).slice(0, 160);
  }
  /* FLEET-PROBE-1042-1 (2026-09-30): the first snapshots said workers_up=3/38. The 35 "down" workers all
     answered 404 because a subrequest from this worker to another *.q08.workers.dev worker is Cloudflare
     error 1042 (same zone) unless global_fetch_strictly_public is set; only the 3 custom-domain workers got
     through. The flag is now declared in wrangler.toml (and deployers apply declared flags). Independently of
     the flag: a 1042 answer says nothing about the target, so it is recorded as UNKNOWN (up:null), never as
     down; this worker reports itself from its own VERSION; a registry row with no base_url falls back to the
     workers.dev URL instead of being counted down. */
  var jobs = reg.map(function (s) {
    var base = String(s.base_url || "").replace(/\/+$/, "") || (s.service ? "https://" + s.service + ".q08.workers.dev" : "");
    if (s.service === "qnfo-fleet-control") {
      return Promise.resolve({ service: s.service, registry_version: s.version, base_url: base, up: true, http: 200, live_version: VERSION, drift: !!(s.version && s.version !== VERSION), probe: "self" });
    }
    if (!base) {
      return Promise.resolve({ service: s.service, registry_version: s.version, up: false, http: null, live_version: null, error: "no base_url" });
    }
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, 6e3);
    return fetch(base + "/health", { signal: ctrl.signal, headers: { "User-Agent": "qnfo-fleet-selfstate/" + VERSION } }).then(function (res) {
      return res.text().then(function (t) { return { st: res.status, t: t }; });
    }).then(function (o) {
      clearTimeout(to);
      var lv = null;
      try {
        var j = JSON.parse(o.t);
        lv = j.version || j.VERSION || null;
      } catch (e) {
        var m = String(o.t).match(/"?version"?\s*[:=]\s*"?([^",}\s]+)/i);
        lv = m ? m[1] : null;
      }
      if (o.st !== 200 && /error code:?\s*1042/i.test(String(o.t))) {
        return { service: s.service, registry_version: s.version, base_url: base, up: null, http: o.st, live_version: null, error: "cf-1042-same-zone-subrequest (probe blocked, target state unknown)" };
      }
      return { service: s.service, registry_version: s.version, base_url: base, up: o.st === 200, http: o.st, live_version: lv, drift: !!(lv && s.version && lv !== s.version) };
    }).catch(function (e) {
      clearTimeout(to);
      return { service: s.service, registry_version: s.version, base_url: base, up: false, http: null, live_version: null, error: String(e && e.message || e).slice(0, 120) };
    });
  });
  out.workers = await Promise.all(jobs);
  // CRON-ONLY-HEARTBEAT-1: a worker HTTP cannot see (cron-only: no workers.dev route; or a blocked probe) is judged
  // by its own fleet_heartbeat row instead. Fresh (< 2 h) and ok -> up; stale or ok=0 -> down; no row -> unchanged.
  try {
    var hbr = await env.DB_AUDIT.prepare("SELECT worker, version, ts, ok FROM fleet_heartbeat").all();
    var hbm = {};
    (hbr.results || []).forEach(function (h) { hbm[h.worker] = h; });
    for (var hi = 0; hi < out.workers.length; hi++) {
      var hw = out.workers[hi];
      if (hw.up === true) continue;
      var h = hbm[hw.service];
      if (!h || !h.ts) continue;
      var age = Date.now() - new Date(String(h.ts).replace(" ", "T") + (String(h.ts).indexOf("Z") >= 0 ? "" : "Z")).getTime();
      if (!isFinite(age)) continue;
      hw.heartbeat_ts = h.ts;
      hw.heartbeat_age_min = Math.round(age / 6e4);
      hw.probe = "heartbeat";
      hw.up = age < 72e5 && Number(h.ok) === 1;
      if (!hw.live_version && h.version) {
        hw.live_version = h.version;
        hw.drift = !!(hw.registry_version && h.version !== hw.registry_version);
      }
    }
  } catch (e) {
    out.heartbeat_error = String(e && e.message || e).slice(0, 160);
  }
  var up = 0, down = 0, drift = 0, unk = 0, blocked = 0;
  for (var i = 0; i < out.workers.length; i++) {
    var w = out.workers[i];
    if (w.up === null) blocked++; else if (w.up) up++; else down++;
    if (w.drift) drift++;
    if (!w.live_version) unk++;
  }
  out.summary = { workers_total: out.workers.length, workers_up: up, workers_down: down, workers_unknown: blocked, version_drift: drift, version_unknown: unk, down_list: out.workers.filter(function (x) { return x.up === false; }).map(function (x) { return x.service + ":" + (x.http || x.error || "?"); }).slice(0, 20) };
  try {
    var ir = await env.DB_AUDIT.prepare("SELECT priority, COUNT(*) AS n FROM agent_issues WHERE status='open' GROUP BY priority").all();
    var by = {}, tot = 0;
    (ir.results || []).forEach(function (x) { by[x.priority] = x.n; tot += x.n; });
    var tr = await env.DB_AUDIT.prepare("SELECT id, priority, substr(title,1,140) AS title FROM agent_issues WHERE status='open' ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, id LIMIT 12").all();
    var sr = await env.DB_AUDIT.prepare("SELECT COALESCE(source,'(none)') AS source, COUNT(*) AS n FROM agent_issues WHERE status='open' GROUP BY 1 ORDER BY n DESC LIMIT 10").all();
    out.issues = { open_total: tot, by_priority: by, by_source: sr.results || [], top: tr.results || [] };
  } catch (e) {
    out.issues = { error: String(e && e.message || e).slice(0, 160) };
  }
  // RESURRECTED-RETIRED-SIGNAL-1 (#272): a worker recorded as folded/removed in worker_removals that now answers its
  // /health with 2xx in worker_live_audit has been recreated (2026-10-01: qnfo-agent-ws, then qnfo-fleet-calibrator).
  // Surfacing it here means the fleet notices a resurrection on its own instead of by chance.
  try {
    var rr = await env.DB_AUDIT.prepare("SELECT r.worker AS worker, r.action AS action, r.removed_at AS removed_at, a.http AS http, a.live_version AS live_version, a.probed_at AS probed_at FROM worker_removals r JOIN worker_live_audit a ON a.worker = r.worker WHERE (a.http BETWEEN 200 AND 399 OR a.note LIKE '%RETIRED_PRESENT%') AND r.id = (SELECT MAX(id) FROM worker_removals WHERE worker = r.worker) AND lower(coalesce(r.action,'')) IN ('fold','folded','deleted','delete','removed','archive','archived') ORDER BY r.worker LIMIT 50").all();
    out.resurrected_retired = rr.results || [];
    out.summary.resurrected_retired = out.resurrected_retired.length;
  } catch (e) {
    out.resurrected_retired_error = String(e && e.message || e).slice(0, 160);
  }
  try {
    var qr = await env.DB_AUDIT.prepare("SELECT status, COUNT(*) AS n FROM outreach_queue GROUP BY status").all();
    out.queues = { outreach_queue: qr.results || [] };
  } catch (e) {
    out.queues = { error: String(e && e.message || e).slice(0, 160) };
  }
  try {
    var fr = await env.DB_AUDIT.prepare("SELECT MAX(refreshed_at) AS schema_index_at, COUNT(DISTINCT tbl) AS schema_tables FROM d1_schema_index").first();
    var hb = await env.DB_AUDIT.prepare("SELECT COUNT(DISTINCT worker) AS heartbeat_workers_24h, MAX(ts) AS heartbeat_newest FROM fleet_heartbeat WHERE ts >= datetime('now','-1 day')").first();
    var dr = await env.DB_AUDIT.prepare("SELECT COUNT(*) AS drift_rows_24h FROM fleet_drift_report WHERE ts >= datetime('now','-1 day')").first();
    out.freshness = {
      schema_index_at: fr && fr.schema_index_at,
      schema_tables: fr && fr.schema_tables,
      heartbeat_workers_24h: hb && hb.heartbeat_workers_24h,
      heartbeat_newest: hb && hb.heartbeat_newest,
      drift_rows_24h: dr && dr.drift_rows_24h
    };
  } catch (e) {
    out.freshness = { error: String(e && e.message || e).slice(0, 160) };
  }
  try {
    await env.DB_AUDIT.prepare("INSERT INTO fleet_state_snapshots (id, ts, source, workers_total, workers_up, workers_down, open_issues, open_high, payload) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(
      "fs-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      ts,
      "fleet-control/state",
      out.summary.workers_total,
      out.summary.workers_up,
      out.summary.workers_down,
      out.issues.open_total || 0,
      (out.issues.by_priority || {}).high || 0,
      JSON.stringify(out).slice(0, 6e4)
    ).run();
    out.snapshot = "written";
    await env.DB_AUDIT.prepare("DELETE FROM fleet_state_snapshots WHERE ts < datetime('now','-30 day')").run();
  } catch (e) {
    out.snapshot_error = String(e && e.message || e).slice(0, 160);
  }
  return out;
}

var ACCOUNT = "edb167b78c9fb901ea5bca3ce58ccc4b";
var GH = "https://raw.githubusercontent.com/QNFO/";
var FETCH_TIMEOUT_MS = 8e3;
var FRESH_MS = 3e5;
var NO_SELF = ["qnfo-fleet-deploy"];
function json(d, s) {
  return new Response(JSON.stringify(d), { status: s || 200, headers: { "Content-Type": "application/json" } });
}
__name(json, "json");
__name2(json, "json");
__name22(json, "json");
function versionOf(code) {
  code = code || "";
  var cands = [];
  var i = code.indexOf("VERSION");
  while (i >= 0 && i < code.length && cands.length < 24) {
    // VERSION-WORD-BOUNDARY-1 (2026-09-27): a "VERSION" that is a prefix of a longer
    // identifier (VERSION2, VERSION_INFO, ...) is NOT the version constant. Without this,
    // a merged worker (advisor VERSION2="0.3.3" before the real VERSION) parsed to 0.3.3 and
    // became DRIFT-BLIND to its own deploy version -- the root cause of "no job lands fixes".
    var nx = code.charAt(i + 7);
    if (nx && /[A-Za-z0-9_]/.test(nx)) {
      i = code.indexOf("VERSION", i + 1);
      continue;
    }
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
    cands.push(code.slice(k + 1, q));
    i = code.indexOf("VERSION", q + 1);
  }
  if (!cands.length) return null;
  for (var a = 0; a < cands.length; a++) {
    if (/^\d+\.\d+(\.\d+)?([-.][A-Za-z0-9.-]{0,24})?$/.test(cands[a]) && cands[a].indexOf("/") < 0) return cands[a];
  }
  return cands[0];
}
__name(versionOf, "versionOf");
__name2(versionOf, "versionOf");
__name22(versionOf, "versionOf");
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
  __name2(num, "num");
  __name22(num, "num");
  var ap = num(a), bp = num(b);
  var len = Math.max(ap.length, bp.length);
  for (var i = 0; i < len; i++) {
    var x = ap[i] || 0, y = bp[i] || 0;
    if (x !== y) return x > y;
  }
  return a > b;
}
__name(newer, "newer");
__name2(newer, "newer");
__name22(newer, "newer");
function isModule(code) {
  return (code || "").indexOf("export default") >= 0 || (code || "").indexOf("export {") >= 0 || /^\s*import\s/.test(code || "");
}
__name(isModule, "isModule");
__name2(isModule, "isModule");
__name22(isModule, "isModule");
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
__name2(timedFetch, "timedFetch");
__name22(timedFetch, "timedFetch");
async function sha256(str) {
  var d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(d)).map(function(b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}
__name(sha256, "sha256");
__name2(sha256, "sha256");
__name22(sha256, "sha256");
// UTF-8-safe base64 for the GitHub Contents API (btoa alone throws on non-Latin-1).
function b64encode(s) {
  var bytes = new TextEncoder().encode(String(s));
  var bin = "";
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
__name(b64encode, "b64encode");
__name2(b64encode, "b64encode");
__name22(b64encode, "b64encode");
async function stateGet(env, key, fb) {
  try {
    var r = await env.AUDIT.prepare("SELECT value FROM fleet_deploy_state WHERE key=?1").bind(key).first();
    return r && r.value !== null && r.value !== void 0 ? r.value : fb;
  } catch (e) {
    return fb;
  }
}
__name(stateGet, "stateGet");
__name2(stateGet, "stateGet");
__name22(stateGet, "stateGet");
async function stateSet(env, key, value) {
  try {
    await env.AUDIT.prepare("INSERT INTO fleet_deploy_state (key,value,updated_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')").bind(key, String(value)).run();
  } catch (e) {
  }
}
__name(stateSet, "stateSet");
__name2(stateSet, "stateSet");
__name22(stateSet, "stateSet");
async function enabled(env) {
  return await stateGet(env, "enabled", "0") === "1";
}
__name(enabled, "enabled");
__name2(enabled, "enabled");
__name22(enabled, "enabled");
async function autoHeal(env) {
  return await stateGet(env, "auto_heal", "0") === "1";
}
__name(autoHeal, "autoHeal");
__name2(autoHeal, "autoHeal");
__name22(autoHeal, "autoHeal");
async function audit(env, w, actor, from, to, src2, ok, note) {
  try {
    await env.AUDIT.prepare("INSERT INTO fleet_deploys (worker, actor, from_sha, to_sha, source_path, ok, note, ts) VALUES (?1,?2,?3,?4,?5,?6,?7, datetime('now'))").bind(w, actor, from || "", to || "", src2 || "", ok ? 1 : 0, String(note || "").slice(0, 500)).run();
  } catch (e) {
  }
}
__name(audit, "audit");
__name2(audit, "audit");
__name22(audit, "audit");
async function report(env, w, depV, canV, path, note) {
  try {
    await env.AUDIT.prepare("INSERT INTO fleet_drift_report (worker, deployed_version, canonical_version, source_path, note, ts) VALUES (?1,?2,?3,?4,?5, datetime('now'))").bind(w, depV || "", canV || "", path || "", String(note || "").slice(0, 200)).run();
  } catch (e) {
  }
}
__name(report, "report");
__name2(report, "report");
__name22(report, "report");
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
__name2(scanErr, "scanErr");
__name22(scanErr, "scanErr");
async function clearScanErr(env, w) {
  try {
    if (await stateGet(env, "scanerr:" + w, "")) await stateSet(env, "scanerr:" + w, "");
  } catch (e) {
  }
}
__name(clearScanErr, "clearScanErr");
__name2(clearScanErr, "clearScanErr");
__name22(clearScanErr, "clearScanErr");
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
__name2(improvement, "improvement");
__name22(improvement, "improvement");
async function optimizeFleet(env) {
  var out = { checked: 0, depsUpdated: 0, verUpdated: 0, unchanged: 0, skipped: 0, errors: 0 };
  var nowI = (/* @__PURE__ */ new Date()).toISOString();
  var names;
  try {
    var lr = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts?per_page=100", { headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") } }, 2e4);
    var lj = await lr.json();
    names = (lj.result || []).map(function(x) {
      return x.id;
    });
  } catch (e) {
    out.error = String(e && e.message || e).slice(0, 120);
    return out;
  }
  var prefixOf = /* @__PURE__ */ __name(function(entry) {
    var s = String(entry);
    var ci = s.indexOf(":");
    return ci > 0 ? s.slice(0, ci).toLowerCase() : "";
  }, "prefixOf");
  var depNameOf = /* @__PURE__ */ __name(function(entry) {
    var s = String(entry);
    var ci = s.indexOf(":");
    var tail = ci >= 0 ? s.slice(ci + 1) : s;
    var m = String(tail).match(/[a-z0-9][a-z0-9._-]{2,}/i);
    return (m ? m[0] : String(tail).slice(0, 40)).toLowerCase();
  }, "depNameOf");
  var parseToml = /* @__PURE__ */ __name(function(t) {
    var toks = {};
    var lines = String(t || "").split(/\r?\n/);
    var section = "";
    var grab = /* @__PURE__ */ __name(function(l2) {
      var m = l2.match(/\s*=\s*"?([^"]*)"?/);
      return m ? m[1].trim() : null;
    }, "grab");
    for (var i2 = 0; i2 < lines.length; i2++) {
      var l = lines[i2].trim();
      if (l.indexOf("[") === 0) {
        section = l;
        continue;
      }
      var s = section;
      if (s === "[ai]" && l.indexOf("binding") === 0) toks["ai:" + grab(l.replace(/^binding/, ""))] = 1;
      else if (s === "[browser]" && l.indexOf("binding") === 0) toks["browser:" + grab(l.replace(/^binding/, ""))] = 1;
      else if (s === "[[send_email]]" && l.indexOf("binding") === 0) toks["send_email:" + grab(l.replace(/^binding/, ""))] = 1;
      else if (s === "[[ai_search]]" && l.indexOf("binding") === 0) toks["ai_search:" + grab(l.replace(/^binding/, ""))] = 1;
      else if (s === "[[artifacts]]" && l.indexOf("binding") === 0) toks["artifacts:" + grab(l.replace(/^binding/, ""))] = 1;
      else if (s === "[[services]]" && l.indexOf("service") === 0) toks["service:" + grab(l.replace(/^service/, ""))] = 1;
      else if (s === "[[d1_databases]]" && l.indexOf("database_name") === 0) toks["d1:" + grab(l.replace(/^database_name/, ""))] = 1;
      else if (s === "[[r2_buckets]]" && l.indexOf("bucket_name") === 0) toks["r2:" + grab(l.replace(/^bucket_name/, ""))] = 1;
      else if (s === "[[vectorize]]" && l.indexOf("index_name") === 0) toks["vectorize:" + grab(l.replace(/^index_name/, ""))] = 1;
      else if (s === "[[kv_namespaces]]" && l.indexOf("binding") === 0) toks["kv:" + grab(l.replace(/^binding/, ""))] = 1;
      else if (s === "[[durable_objects.bindings]]" && l.indexOf("class_name") === 0) toks["do:" + grab(l.replace(/^class_name/, ""))] = 1;
      else if (s === "[[workflows]]" && l.indexOf("class_name") === 0) toks["workflow:" + grab(l.replace(/^class_name/, ""))] = 1;
      else if (s.indexOf("queues") >= 0 && l.indexOf("queue_name") === 0) toks["queue:" + grab(l.replace(/^queue_name/, ""))] = 1;
      else if (s === "[triggers]" && l.indexOf("crons") === 0) {
        var cm = l.match(/crons\s*=\s*\[([^\]]*)\]/);
        var n2 = 0;
        if (cm) n2 = cm[1].split(",").filter(function(x) {
          return x.trim().length > 0;
        }).length;
        if (n2 > 0) toks["cron:" + n2 + "x"] = 1;
      }
    }
    return Object.keys(toks);
  }, "parseToml");
  for (var i = 0; i < names.length; i++) {
    var n = names[i];
    if (NO_SELF.indexOf(n) >= 0) continue;
    out.checked++;
    var cand = [n];
    if (n.indexOf("qnfo-") === 0) cand.push(n.slice(5));
    var toml = null;
    for (var c = 0; c < cand.length && !toml; c++) {
      try {
        var rr = await timedFetch(GH + "qnfo-workers/main/" + cand[c] + "/wrangler.toml?cb=" + Math.floor(Date.now() / 3e5), { headers: { "User-Agent": "Mozilla/5.0 (qnfo-fleet-optimizer)" } }, FETCH_TIMEOUT_MS);
        if (rr.ok) {
          var tt = await rr.text();
          if (tt && tt.length > 0 && tt.slice(0, 4) !== "404:") toml = tt;
        }
      } catch (e) {
      }
    }
    if (!toml) {
      out.skipped++;
      continue;
    }
    var bindingToks = parseToml(toml);
    var bNames = {};
    var hasCron = false;
    for (var b = 0; b < bindingToks.length; b++) {
      bNames[depNameOf(bindingToks[b])] = 1;
      if (prefixOf(bindingToks[b]) === "cron") hasCron = true;
    }
    var row = null;
    try {
      row = await env.AUDIT.prepare("SELECT version, deps FROM service_registry WHERE service=?1 LIMIT 1").bind(n).first();
    } catch (e) {
    }
    if (!row) continue;
    var cur = [];
    try {
      cur = JSON.parse(row.deps || "[]");
    } catch (e2) {
      cur = String(row.deps || "").split(/[,;]/);
    }
    var kept = [];
    for (var k = 0; k < cur.length; k++) {
      var tok = String(cur[k]).trim();
      if (!tok) continue;
      if (bNames[depNameOf(tok)]) continue;
      if (prefixOf(tok) === "cron" && hasCron) continue;
      kept.push(tok);
    }
    var merged = kept.concat(bindingToks);
    var seen = {};
    var uniq = [];
    for (var u = 0; u < merged.length; u++) {
      var mm = merged[u];
      if (!mm || seen[mm]) continue;
      seen[mm] = 1;
      uniq.push(mm);
    }
    uniq.sort();
    var depsJson = JSON.stringify(uniq);
    var curSorted = cur.slice().sort();
    if (depsJson !== JSON.stringify(curSorted)) {
      try {
        await env.AUDIT.prepare("UPDATE service_registry SET deps=?1, updated_at=?2 WHERE service=?3").bind(depsJson, nowI, n).run();
        out.depsUpdated++;
      } catch (e) {
        out.errors++;
      }
    } else out.unchanged++;
    var rowV = row.version == null ? "" : String(row.version);
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(rowV)) {
      try {
        var hv = null;
        var hr = await timedFetch("https://" + n + ".q08.workers.dev/health", { headers: { "User-Agent": "Mozilla/5.0 (qnfo-fleet-optimizer)" } }, 8e3);
        if (hr.ok) {
          var hj = await hr.json();
          if (hj && hj.version) hv = String(hj.version);
        }
        if (!hv) hv = await probeVersion(env, n);
        if (hv && /^\d+\.\d+\.\d+/.test(hv) && hv !== rowV) {
          await env.AUDIT.prepare("UPDATE service_registry SET version=?1, updated_at=?2 WHERE service=?3").bind(hv, nowI, n).run();
          out.verUpdated++;
        }
      } catch (e) {
      }
    }
  }
  var summary = "optimize: checked=" + out.checked + " depsUpdated=" + out.depsUpdated + " verUpdated=" + out.verUpdated + " unchanged=" + out.unchanged + " skipped=" + out.skipped + " errors=" + out.errors;
  await report(env, "OPTIMIZE", "", "", "", summary);
  if (out.depsUpdated > 0 || out.verUpdated > 0) {
    try {
      await env.AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts, status, verified_at, claim, confidence) VALUES ('fleet-optimizer','registry-edge-sweep',?1,?2,'verified',?2,?3,'high')").bind("automated: " + summary, nowI, "Automated binding-truth edge sweep + semver version normalization wrote " + (out.depsUpdated + out.verUpdated) + " service_registry updates this cycle; read-back verified by D1 write success (idempotent, convergent)").run();
    } catch (e) {
    }
  }
  try {
    out.budget = await budgetAudit(env, names);
  } catch (e) {
    out.budgetError = String(e && e.message || e).slice(0, 120);
  }
  return out;
}
__name(optimizeFleet, "optimizeFleet");
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
            var r = await timedFetch(GH + dirs[d] + "/README.md?cb=" + Math.floor(Date.now() / 3e5), { headers: { "User-Agent": "Mozilla/5.0 (qnfo-fleet-deploy)" } }, FETCH_TIMEOUT_MS);
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
__name2(selfdocAudit, "selfdocAudit");
__name22(selfdocAudit, "selfdocAudit");
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
__name2(r2Read, "r2Read");
__name22(r2Read, "r2Read");
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
      var r = await timedFetch(GH + cs[i] + "?cb=" + Math.floor(Date.now() / 3e5), { headers: { "User-Agent": "Mozilla/5.0 (qnfo-fleet-deploy)" } }, FETCH_TIMEOUT_MS);
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
__name2(canonical, "canonical");
__name22(canonical, "canonical");
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
__name2(deployedContent, "deployedContent");
__name22(deployedContent, "deployedContent");
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
__name2(probeVersion, "probeVersion");
__name22(probeVersion, "probeVersion");
async function cooldown(env, worker) {
  try {
    var r = await env.AUDIT.prepare("SELECT ts FROM fleet_deploys WHERE worker=?1 AND ok=1 ORDER BY id DESC LIMIT 1").bind(worker).first();
    if (r && r.ts) {
      var age = Date.now() - (/* @__PURE__ */ new Date(String(r.ts).replace(" ", "T") + "Z")).getTime();
      if (!isNaN(age) && age < 216e5) return true;
    }
  } catch (e) {
  }
  return false;
}
__name(cooldown, "cooldown");
__name2(cooldown, "cooldown");
__name22(cooldown, "cooldown");
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
  if (!depV) {
    await audit(env, worker, "deploy", "?", canV, c.path, false, "deployed content unreadable - skipped (no blind redeploy)");
    return { ok: false, status: 503, note: "deployed content unreadable - skipped" };
  }
  if (depV === canV) {
    await audit(env, worker, "deploy", depV, canV, c.path, true, "no-op version match");
    return { ok: true, status: 200, note: "no-op", from: depV, to: canV };
  }
  var direction = newer(depV || "", canV) ? "downgrade" : "upgrade";
  var toSha = await sha256(c.code);
  var lockTok = null;
  try {
    var lr2 = await timedFetch("https://qnfo-deploy-guard.q08.workers.dev/lock/acquire", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ worker, owner: "qnfo-fleet-control/redeploy", ttl_sec: 120, expected_version: depV }) }, 8e3);
    if (lr2 && lr2.status === 409) {
      await audit(env, worker, "deploy", depV || "?", canV, c.path, false, "skipped: deploy lock held by another owner (REDEPLOY-CRON-LOCK-1)");
      return { ok: false, status: 409, note: "deploy lock held by another owner - skipped", from: depV, to: canV };
    }
    var lj2 = lr2 ? await lr2.json().catch(function() {
      return null;
    }) : null;
    lockTok = lj2 && lj2.token ? lj2.token : null;
  } catch (e) {
  }
  var r;
  if (isModule(c.code)) {
    var fd = new FormData();
    fd.append("metadata", new Blob([JSON.stringify({ main_module: "worker.js" })], { type: "application/json" }));
    fd.append("worker.js", new Blob([c.code], { type: "application/javascript+module" }), "worker.js");
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
  if (lockTok) {
    try {
      await timedFetch("https://qnfo-deploy-guard.q08.workers.dev/lock/release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ worker, token: lockTok }) }, 8e3);
    } catch (e) {
    }
  }
  try {
    await timedFetch("https://qnfo-deploy-guard.q08.workers.dev/ledger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ worker, actor: "qnfo-fleet-control/redeploy", from: depV || "?", to: canV, source_path: c.path, ok, note: String(note || "").slice(0, 280) }) }, 8e3);
  } catch (e) {
  }
  await audit(env, worker, "deploy", depV || "?", canV, c.path, ok, note);
  return { ok, status: ok ? 200 : 502, note, from: depV, to: canV, direction, source: c.path, bytes: c.code.length };
}
__name(redeploy, "redeploy");
__name2(redeploy, "redeploy");
__name22(redeploy, "redeploy");
// LAND-CODE-FIX-1 (2026-09-27): the fleet lacked a recurring server-side job that lands
// code fixes. When a worker's deployed code is AHEAD of the repo (an out-of-band edit that
// was never committed), scan() only REPORTED it -- so the next canonical redeploy silently
// reverted the fix (REPO-IS-DEPLOY-SOURCE-1: "the ONLY durable fix is a commit to main").
// This job closes drift->fetch->write->commit->close_evidence: it commits the deployed
// artifact back to the source repo (both the durable worker.js and the deployed-current
// mirror), then records a verified self_heal_actions row (close evidence).
// /content/v2 returns module workers MULTIPART-wrapped; land the raw JS, not the wrapper.
function extractModuleCode(content) {
  content = String(content || "");
  if (content.indexOf("Content-Disposition") < 0) return content;
  var m = content.match(/^--([^\r\n]+)/);
  if (!m) return content;
  var parts = content.split("--" + m[1]);
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (part.indexOf('name="worker.js"') < 0) continue;
    var sep = part.indexOf("\r\n\r\n");
    var body = sep >= 0 ? part.slice(sep + 4) : part;
    return body.replace(/\r?\n$/, "");
  }
  return content;
}
__name(extractModuleCode, "extractModuleCode");
__name2(extractModuleCode, "extractModuleCode");
__name22(extractModuleCode, "extractModuleCode");
async function landFix(env, worker, depCode, depV, canV, srcPath) {
  if (!env.GITHUB_TOKEN) return { ok: false, status: 403, note: "GITHUB_TOKEN missing - cannot land fix" };
  if (!/^[a-zA-Z0-9-]+$/.test(worker)) return { ok: false, status: 400, note: "invalid worker name" };
  if (!depV) return { ok: false, status: 422, note: "deployed code has no VERSION marker - refused" };
  var raw = extractModuleCode(depCode);
  if (!raw || raw.length < 40) return { ok: false, status: 422, note: "deployed code unreadable after multipart extract" };
  // SOURCE-ONLY guard (2026-09-27, replaces scan's over-broad !usedHealth gate): land only
  // real JS source carrying a VERSION marker. A bundled/minified artifact (no marker) is
  // refused rather than committed, so a health-sourced deployed version can still be landed
  // safely -- the guard that previously blocked the fleet's only real case (idea-hub).
  if (versionOf(raw) === null) return { ok: false, status: 422, note: "extracted source has no VERSION marker - refused (bundled/minified?)" };
  // Repo + dir: prefer the GitHub canonical path ("qnfo-workers/main/<dir>/worker.js"); when
  // canonical() served the R2 cache the path is "r2:qnfo-canonical/<w>.js" (NOT a repo name),
  // so fall back to probing the repo for an existing <dir>/worker.js.
  var ghHeaders = { "Authorization": "Bearer " + env.GITHUB_TOKEN, "User-Agent": "qnfo-fleet-control/landFix", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  var repo = "qnfo-workers";
  var dir = worker;
  var seg = srcPath ? String(srcPath).split("/") : [];
  if (seg.length > 2 && /^[A-Za-z0-9._-]+$/.test(seg[0])) {
    repo = seg[0];
    var d2 = seg.slice(2).slice(0, -1).join("/");
    if (d2) dir = d2;
  } else {
    var cands = [worker];
    if (worker.indexOf("qnfo-") === 0) cands.push(worker.slice(5));
    for (var ci = 0; ci < cands.length; ci++) {
      var pr = await timedFetch("https://api.github.com/repos/QNFO/qnfo-workers/contents/" + cands[ci] + "/worker.js?ref=main", { headers: ghHeaders }, 8e3);
      if (pr.status === 200) { dir = cands[ci]; break; }
    }
  }
  if (!/^[A-Za-z0-9._-]+$/.test(repo) || repo.indexOf("..") >= 0) return { ok: false, status: 400, note: "unsafe repo" };
  if (dir.indexOf("..") >= 0) return { ok: false, status: 400, note: "unsafe path" };
  // SOURCE-FIRST + ATOMIC (2026-09-27): a two-commit landing (mirror then source) let the
  // mirror-sync workflow regenerate the mirror from the STILL-STALE source (it checks out the
  // commit that triggered it) and clobber the landing. Commit BOTH files in ONE Git Data API
  // commit so no transient inconsistency exists for any concurrent actor to react to.
  var paths = [dir + "/worker.js", dir + "/deployed-current.worker.js"];
  var commitMsg = "chore(" + worker + "): land deployed " + depV + " to main (LAND-CODE-FIX-1: repo was " + canV + ")";
  var landed = [];
  var errors = [];
  try {
    var refR = await timedFetch("https://api.github.com/repos/QNFO/" + repo + "/git/ref/heads/main", { headers: ghHeaders }, 8e3);
    var refJ = refR.status === 200 ? await refR.json().catch(function() { return null; }) : null;
    var headSha = refJ && refJ.object && refJ.object.sha;
    if (!headSha) { errors.push("ref:HTTP " + refR.status); }
    else {
      var cmR = await timedFetch("https://api.github.com/repos/QNFO/" + repo + "/git/commits/" + headSha, { headers: ghHeaders }, 8e3);
      var cmJ = cmR.status === 200 ? await cmR.json().catch(function() { return null; }) : null;
      var baseTree = cmJ && cmJ.tree && cmJ.tree.sha;
      var toWrite = [];
      for (var pi = 0; pi < paths.length; pi++) {
        var encI = paths[pi].split("/").map(encodeURIComponent).join("/");
        var gI = await timedFetch("https://api.github.com/repos/QNFO/" + repo + "/contents/" + encI + "?ref=main", { headers: ghHeaders }, 8e3);
        var same = false;
        if (gI.status === 200) {
          var gjI = await gI.json().catch(function() { return null; });
          if (gjI && gjI.content) {
            try { var dec = new TextDecoder().decode(Uint8Array.from(atob(gjI.content.replace(/\s+/g, "")), function(c) { return c.charCodeAt(0); })); if (dec === raw) same = true; } catch (e) {}
          }
        }
        if (same) landed.push(paths[pi] + ":no-op"); else toWrite.push(paths[pi]);
      }
      if (toWrite.length && baseTree) {
        var entries = [];
        for (var w = 0; w < toWrite.length; w++) {
          var blR = await timedFetch("https://api.github.com/repos/QNFO/" + repo + "/git/blobs", { method: "POST", headers: Object.assign({}, ghHeaders, { "Content-Type": "application/json" }), body: JSON.stringify({ content: b64encode(raw), encoding: "base64" }) }, 12e3);
          var blJ = blR.status === 201 ? await blR.json().catch(function() { return null; }) : null;
          if (!blJ || !blJ.sha) { errors.push(toWrite[w] + ":blob HTTP " + blR.status); continue; }
          entries.push({ path: toWrite[w], mode: "100644", type: "blob", sha: blJ.sha });
        }
        if (entries.length === toWrite.length) {
          var trR = await timedFetch("https://api.github.com/repos/QNFO/" + repo + "/git/trees", { method: "POST", headers: Object.assign({}, ghHeaders, { "Content-Type": "application/json" }), body: JSON.stringify({ base_tree: baseTree, tree: entries }) }, 12e3);
          var trJ = trR.status === 201 ? await trR.json().catch(function() { return null; }) : null;
          if (trJ && trJ.sha) {
            var coR = await timedFetch("https://api.github.com/repos/QNFO/" + repo + "/git/commits", { method: "POST", headers: Object.assign({}, ghHeaders, { "Content-Type": "application/json" }), body: JSON.stringify({ message: commitMsg, tree: trJ.sha, parents: [headSha] }) }, 12e3);
            var coJ = coR.status === 201 ? await coR.json().catch(function() { return null; }) : null;
            if (coJ && coJ.sha) {
              var upR = await timedFetch("https://api.github.com/repos/QNFO/" + repo + "/git/refs/heads/main", { method: "PATCH", headers: Object.assign({}, ghHeaders, { "Content-Type": "application/json" }), body: JSON.stringify({ sha: coJ.sha, force: false }) }, 12e3);
              if (upR.status === 200) { for (var w2 = 0; w2 < toWrite.length; w2++) landed.push(toWrite[w2]); }
              else errors.push("ref-update HTTP " + upR.status);
            } else errors.push("commit HTTP " + coR.status);
          } else errors.push("tree HTTP " + trR.status);
        }
      }
    }
  } catch (e) { errors.push("atomic:" + String(e && e.message || e).slice(0, 80)); }
  var ok = landed.length > 0 && errors.length === 0;
  var note = ok ? "landed " + landed.join(", ") : "land-failed " + errors.join(";");
  // close evidence: verified self-heal row (detect -> act -> verify).
  try {
    await env.AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts, status, verified_at, claim, confidence) VALUES ('code-fix-land','" + worker + "',?1,datetime('now'),?2,?3,?4,?5)").bind(String(note).slice(0, 400), ok ? "verified" : "failed", ok ? new Date().toISOString() : null, "LAND-CODE-FIX-1: deployed-ahead " + depV + " > repo " + canV + " committed to main", ok ? "high" : "low").run();
  } catch (e) {}
  return { ok, status: ok ? 200 : 502, note, landed: landed.length, errors: errors.length };
}
__name(landFix, "landFix");
__name2(landFix, "landFix");
__name22(landFix, "landFix");
// GIT-SELFTEST-1 (2026-09-27): the CMD RED TEAM rated LAND-CODE-FIX-1 FAIL because its
// in-worker GitHub WRITE leg had never been exercised. This commits a fixed probe to a
// THROWAWAY branch (zero main-branch impact) and returns the commit sha, proving the exact
// runtime path landFix uses (b64encode + timedFetch + GitHub Contents PUT + sha + auth).
// Reusable as a live DoD-9 re-probe; delete the branch afterwards.
async function gitSelftest(env) {
  if (!env.GITHUB_TOKEN) return { ok: false, error: "no GITHUB_TOKEN" };
  var repo = "qnfo-workers", branch = "_landfix-selftest", probe = "_selftest/landfix-probe.json";
  var gh = { "Authorization": "Bearer " + env.GITHUB_TOKEN, "User-Agent": "qnfo-fleet-control/selftest", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  var base = await timedFetch("https://api.github.com/repos/QNFO/" + repo + "/git/ref/heads/main", { headers: gh }, 8e3);
  if (base.status !== 200) return { ok: false, error: "base ref HTTP " + base.status };
  var bj = await base.json().catch(function() { return null; });
  var baseSha = bj && bj.object && bj.object.sha;
  var chk = await timedFetch("https://api.github.com/repos/QNFO/" + repo + "/git/ref/heads/" + branch, { headers: gh }, 8e3);
  if (chk.status === 404) {
    var cr = await timedFetch("https://api.github.com/repos/QNFO/" + repo + "/git/refs", { method: "POST", headers: Object.assign({}, gh, { "Content-Type": "application/json" }), body: JSON.stringify({ ref: "refs/heads/" + branch, sha: baseSha }) }, 8e3);
    if (cr.status !== 201) return { ok: false, error: "branch create HTTP " + cr.status };
  }
  var cur = await timedFetch("https://api.github.com/repos/QNFO/" + repo + "/contents/" + probe + "?ref=" + branch, { headers: gh }, 8e3);
  var fileSha = null;
  if (cur.status === 200) { var cj = await cur.json().catch(function() { return null; }); fileSha = cj && cj.sha; }
  var content = JSON.stringify({ probe: "LAND-CODE-FIX-1-write-path", worker: "qnfo-fleet-control", version: VERSION, ts: new Date().toISOString() });
  var putBody = { message: "chore(selftest): LAND-CODE-FIX-1 in-worker write-path probe", content: b64encode(content), branch: branch };
  if (fileSha) putBody.sha = fileSha;
  var pu = await timedFetch("https://api.github.com/repos/QNFO/" + repo + "/contents/" + probe, { method: "PUT", headers: Object.assign({}, gh, { "Content-Type": "application/json" }), body: JSON.stringify(putBody) }, 12e3);
  var pj = null;
  try { pj = await pu.json(); } catch (e) {}
  var ok = pu.status === 200 || pu.status === 201;
  return { ok, status: pu.status, branch: branch, commit: ok && pj && pj.commit ? pj.commit.sha : null, content_sha: ok && pj && pj.content ? pj.content.sha : null, note: ok ? "in-worker GitHub write path verified end-to-end" : String(pj && pj.message || "").slice(0, 160) };
}
__name(gitSelftest, "gitSelftest");
__name2(gitSelftest, "gitSelftest");
__name22(gitSelftest, "gitSelftest");
function tomlCrons(t) {
  var LF = String.fromCharCode(10);
  var body = t.split(LF).filter(function(l) {
    return l.trim().charAt(0) !== "#";
  }).join(LF);
  var ti = body.indexOf("[triggers]");
  if (ti < 0) return [];
  var ci = body.indexOf("crons", ti);
  if (ci < 0) return [];
  var ob = body.indexOf("[", ci);
  if (ob < 0) return [];
  var cb = body.indexOf("]", ob);
  if (cb < 0) return [];
  // CRON-TOML-PARSE-COMMA-1 (2026-10-01): a naive split(",") decomposes MERGED cron expressions
  // whose hour field is a list (e.g. "0 6,12 * * 2-6" -> "0 6" + "12 * * 2-6"), inflating the
  // declared list (24) above the live list (21) and manufacturing a permanent false cronDrift for
  // qnfo-cloud-ops. ROOT CAUSE of the recurring cronDrift=1 (earlier CDN hypothesis was WRONG).
  // Parse QUOTED entries instead; a comma inside quotes is a cron field list, not an array separator.
  var inner = body.slice(ob + 1, cb);
  var out = [];
  var re = /"([^"]*)"|'([^']*)'/g;
  var m;
  while ((m = re.exec(inner)) !== null) out.push((m[1] != null ? m[1] : m[2]).trim());
  if (!out.length) {
    out = inner.split(",").map(function(x) {
      return x.trim().replace(/^["']|["']$/g, "");
    });
  }
  return out.filter(Boolean).sort();
}
__name(tomlCrons, "tomlCrons");
async function declaredCrons(env, worker) {
  var cands = [worker];
  if (worker.indexOf("qnfo-") === 0) cands.push(worker.slice(5));
  for (var a = 0; a < cands.length; a++) {
    // GH-API-UNCACHED-CRONS-1 (fi #1021, 2026-10-01): raw.githubusercontent.com is CDN-cached and
    // ?cb= only busts within FRESH_MS buckets, so a fresh wrangler.toml commit could still be served
    // STALE for hours. Canonical observation: qnfo-cloud-ops main declares 21 crons (== live) yet the
    // scan read a stale 24-cron pre-CF-DOW list -> a false cronDrift every hourly cycle. Read the
    // UNcached GitHub contents API first; keep raw as a fallback so a rate-limit never blinds the scan.
    try {
      // Use the SAME authenticated JSON contents API that landFix proves works in this worker
      // (ghHeaders), then base64-decode. raw.githubusercontent CDN was observed serving a stale
      // pre-CF-DOW 24-cron copy to this worker even when every external vantage returned the
      // current 21-cron file; the authenticated JSON API is uncached and versioned.
      var hdr = { "Authorization": "Bearer " + (env.GITHUB_TOKEN || ""), "User-Agent": "qnfo-fleet-control/cron-source", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
      var ra = await timedFetch("https://api.github.com/repos/QNFO/qnfo-workers/contents/" + cands[a] + "/wrangler.toml?ref=main", { headers: hdr }, FETCH_TIMEOUT_MS);
      if (ra.ok) {
        var ja = await ra.json();
        var b64 = String(ja && ja.content || "").replace(/[^A-Za-z0-9+/=]/g, "");
        if (!b64 && ja && ja.sha) {
          var br = await timedFetch("https://api.github.com/repos/QNFO/qnfo-workers/git/blobs/" + ja.sha, { headers: hdr }, FETCH_TIMEOUT_MS);
          if (br.ok) {
            var bj = await br.json();
            b64 = String(bj && bj.content || "").replace(/[^A-Za-z0-9+/=]/g, "");
          }
        }
        if (b64) {
          var ta = atob(b64);
          if (ta && ta.indexOf("crons") >= 0) return tomlCrons(ta);
        }
      }
    } catch (e) {
    }
    try {
      var r = await timedFetch(GH + "qnfo-workers/main/" + cands[a] + "/wrangler.toml?cb=" + Math.floor(Date.now() / FRESH_MS), { headers: { "User-Agent": "Mozilla/5.0 (qnfo-fleet-deploy)" } }, FETCH_TIMEOUT_MS);
      if (!r.ok) continue;
      var t = await r.text();
      if (!t || t.slice(0, 4) === "404:") continue;
      return tomlCrons(t);
    } catch (e) {
    }
  }
  return null;
}
__name(declaredCrons, "declaredCrons");
async function liveCrons(env, worker) {
  try {
    var r = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/" + worker + "/schedules", { headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") } }, FETCH_TIMEOUT_MS);
    if (!r.ok) return null;
    var j = await r.json();
    return (j.result && j.result.schedules || []).map(function(x) {
      return x.cron;
    }).sort();
  } catch (e) {
    return null;
  }
}
__name(liveCrons, "liveCrons");
async function cronDrift(env, names, out) {
  out.cronDrift = 0;
  out.cronHealed = 0;
  out.cronDetails = [];
  if (!names || !names.length) return;
  var targets = names.filter(function(n) {
    return NO_SELF.indexOf(n) < 0;
  });
  var results = [];
  var CONC = 8;
  for (var bi = 0; bi < targets.length; bi += CONC) {
    var batch = targets.slice(bi, bi + CONC);
    var rs = await Promise.all(batch.map(function(n) {
      return (async function() {
        try {
          var decl = await declaredCrons(env, n);
          if (decl === null) return null;
          var live = await liveCrons(env, n);
          if (live === null) return null;
          return { n, decl, live };
        } catch (e) {
          return null;
        }
      })();
    }));
    for (var ri = 0; ri < rs.length; ri++) results.push(rs[ri]);
  }
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (!r) continue;
    var ds = r.decl.join("|"), ls = r.live.join("|");
    if (ds === ls) continue;
    out.cronDrift++;
    if (out.cronDetails.length < 60) out.cronDetails.push(r.n + ":decl[" + ds + "] live[" + ls + "]");
    await report(env, r.n, ls, ds, "wrangler.toml[triggers].crons", "cron-drift declared=" + ds + " live=" + ls);
    if (r.decl.length > 0 && r.live.length === 0) {
      try {
        var put = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + "/workers/scripts/" + r.n + "/schedules", { method: "PUT", headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || ""), "Content-Type": "application/json" }, body: JSON.stringify(r.decl.map(function(c) {
          return { cron: c };
        })) }, FETCH_TIMEOUT_MS);
        if (put.ok) {
          out.cronHealed++;
          await audit(env, r.n, "cron-heal", ls, ds, "wrangler.toml[triggers].crons", true, "restored " + r.decl.length + " cron trigger(s)");
        }
      } catch (e) {
      }
    }
  }
}
__name(cronDrift, "cronDrift");
// NODE-BUDGET-GATE-1 (2026-09-26): standing per-class node budget (qnfo-audit.fleet_budget).
// Every scan/optimize refreshes fleet_budget.current for workers from the live CF script list and,
// when a class is at/over cap, files a disposition row + report line. NET-ZERO RULE: at/over cap a
// NEW worker registration must name a same-class retirement; growth is never silently absorbed.
async function budgetAudit(env, names) {
  var out = { classes: 0, over: [] };
  try {
    var live = Array.isArray(names) ? names.length : null;
    var rows = await env.AUDIT.prepare("SELECT node_class, cap, target, current FROM fleet_budget").all();
    var rs = rows && rows.results || [];
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      out.classes++;
      if (r.node_class === "workers" && live != null) {
        try {
          await env.AUDIT.prepare("UPDATE fleet_budget SET current=?1, updated_at=datetime('now') WHERE node_class='workers'").bind(live).run();
        } catch (e) {
        }
        if (live > Number(r.cap)) out.over.push("workers live=" + live + " cap=" + r.cap + " (+" + (live - Number(r.cap)) + ")");
      } else if (Number(r.current) > Number(r.cap)) {
        out.over.push(r.node_class + " cur=" + r.current + " cap=" + r.cap);
      }
    }
    if (!out.over.length) {
      try {
        await env.AUDIT.prepare("UPDATE self_heal_actions SET status='resolved', verified_at=datetime('now'), claim=COALESCE(claim,'SELFHEAL-WRITEBACK-CLOSE-1: budget back under cap, detection resolved'), confidence=COALESCE(confidence,'high') WHERE kind='node-budget' AND status='detected'").run();
      } catch (e) {
      }
    }
    if (out.over.length) {
      out.note = "BUDGET-OVER " + out.over.join("; ");
      try {
        await env.AUDIT.prepare("UPDATE self_heal_actions SET status='resolved', verified_at=datetime('now'), claim=COALESCE(claim,'SELFHEAL-WRITEBACK-CLOSE-1: superseded by a newer budget detection cycle'), confidence=COALESCE(confidence,'high') WHERE kind='node-budget' AND status='detected'").run();
        var recent = await env.AUDIT.prepare("SELECT COUNT(*) n FROM self_heal_actions WHERE kind='node-budget' AND ts > datetime('now','-30 minutes')").first();
        if (!recent || Number(recent.n || 0) === 0) {
          await env.AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts, status) VALUES ('node-budget','fleet-budget',?1,datetime('now'),'detected')").bind(out.note).run();
        }
      } catch (e) {
      }
      // BUDGET-DISCHARGE-WIRE-1 (2026-09-27, red-team F1): an over-cap class must have a DISCHARGE PATH,
      // not detect-only. (a) file an OWNED work-queue item (CLOSED-LOOP-DISPOSITION-1); (b) file
      // NET-ZERO delete-worker candidates for workers with an explicit retirement intent AND zero 24h
      // traffic (disposeRetired re-checks bindings + protectedNames + output-contract before deleting).
      try {
        // handoff 29754 P4: the dedupe key must be STABLE. out.over carries the live count
        // (e.g. "workers live=42 cap=36 (+6)"), so a count change produced a NEW work-queue row
        // every cycle. Normalize digits out of the KEY; the live text stays in evidence (out.note).
        var oitem = "node-budget-overage:" + out.over.map(function(s) { return String(s).replace(/[0-9]+/g, "#"); }).join("; ");
        var oex = await env.AUDIT.prepare("SELECT id FROM reorg_work_queue WHERE item=?1 AND state='OPEN'").bind(oitem).first();
        if (!oex) {
          await env.AUDIT.prepare("INSERT INTO reorg_work_queue (item, evidence, owner, due, state, created_at) VALUES (?1,?2,'deepchat-reorg',date('now','+14 day'),'OPEN',datetime('now'))").bind(oitem, out.note).run();
        }
        var cand = await env.AUDIT.prepare("SELECT DISTINCT worker FROM worker_consolidation WHERE action='RETIRE' AND status IN ('PLANNED','APPROVED')").all();
        var cr = (cand && cand.results) || [];
        for (var ci = 0; ci < cr.length; ci++) {
          var cn = cr[ci].worker;
          if (!cn) continue;
          if (Array.isArray(names) && names.indexOf(cn) < 0) continue; // F1b: only LIVE workers are dischargeable
          var _cu = await scriptUsage7d(env, cn);
          var inv = _cu ? { n: _cu.requests_7d } : await env.AUDIT.prepare("SELECT COUNT(*) n FROM worker_invocations WHERE worker_name=?1 AND created_at > datetime('now','-1 day')").bind(cn).first();
          if (inv && Number(inv.n || 0) > 0) continue;
          var di = "delete-worker:" + cn;
          var dex = await env.AUDIT.prepare("SELECT id FROM reorg_work_queue WHERE item=?1 AND state='OPEN'").bind(di).first();
          if (!dex) {
            await env.AUDIT.prepare("INSERT INTO reorg_work_queue (item, evidence, owner, due, state, created_at) VALUES (?1,?2,'qnfo-fleet-control',date('now','+7 day'),'OPEN',datetime('now'))").bind(di, "NET-ZERO discharge candidate: explicit retirement intent + 0 invocations/24h; disposeRetired re-checks bindings/protected/output-contract").run();
          }
        }
      } catch (e) {
      }

      try {
        await report(env, "BUDGET", "", "", "", out.note);
      } catch (e) {
      }
    } else {
      out.note = "BUDGET-OK classes=" + out.classes;
    }
  } catch (e) {
    out.note = "budgetAudit error: " + String(e && e.message || e).slice(0, 120);
    try {
      await report(env, "BUDGET", "", "", "", "BUDGET-AUDIT-ERROR " + out.note);
    } catch (e2) {
    }
  }
  return out;
}

async function scan(env, heal) {
  var out = { scanned: 0, clean: 0, drifted: 0, ahead: 0, healed: 0, landed: 0, errors: 0, staleCanon: 0, healthVer: 0, errKinds: {}, details: [] };
  try {
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
          try {
            if (env.CANONICAL) await env.CANONICAL.put(n + ".js", depHeal, { httpMetadata: { contentType: "text/plain" }, customMetadata: { ts: String(Date.now()) } });
          } catch (e) {
          }
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
        if (heal) {
          var lf = await landFix(env, n, dep, depV, canV, c.path);
          if (lf.ok) out.landed++;
          await report(env, n, depV, canV, c.path, lf.ok ? "deployed-ahead:landed " + lf.note : "deployed-ahead:skip " + String(lf && lf.note || "").slice(0, 120));
        } else {
          await report(env, n, depV, canV, c.path, "deployed-ahead");
        }
        continue;
      }
      out.drifted++;
      out.details.push(n + ":behind " + depV + "->" + canV);
      await clearScanErr(env, n);
      await report(env, n, depV, canV, c.path, "canonical-ahead");
      if (heal && !usedHealth) {
        var res = await redeploy(env, n);
        if (res.ok) out.healed++;
      }
    }
  } catch (e) {
    out.errors++;
    out.note = String(e && e.message || e).slice(0, 120);
  }
  try {
    out.contentSignals = await contentSignalAudit(env);
  } catch (e) {
    out.contentSignalError = String(e && e.message || e).slice(0, 120);
  }
  try {
    await cronDrift(env, names, out);
  } catch (e) {
  }
  try {
    out.budget = await budgetAudit(env, names);
  } catch (e) {
    out.budgetError = String(e && e.message || e).slice(0, 120);
  }
  return out;
}
__name(scan, "scan");
__name2(scan, "scan");
__name22(scan, "scan");
var SIGNAL_PROBES = {
  registry: { sql: "SELECT COUNT(*) n FROM service_registry WHERE state='live' AND (updated_at IS NULL OR updated_at < datetime('now','-2 days'))", activeWhen: "gt0" },
  versioning: { sql: "SELECT COUNT(*) n FROM fleet_drift_report WHERE worker != 'SCAN' AND ts >= datetime('now','-6 hours') AND note IN ('deployed-ahead','canonical-ahead')", activeWhen: "gt0" },
  telemetry: { sql: "SELECT COUNT(*) n FROM fleet_probe_log WHERE ok=1 AND ts >= datetime('now','-1 hour')", activeWhen: "zero" },
  "self-audit": { sql: "SELECT COUNT(*) n FROM handoffs WHERE timestamp >= datetime('now','-1 day')", activeWhen: "zero" },
  metrics: { sql: "SELECT COUNT(*) n FROM fleet_drift_report WHERE worker='SCAN' AND ts >= datetime('now','-6 hours')", activeWhen: "zero" },
  "content-integrity": { sql: "SELECT COUNT(*) n FROM signals WHERE source='q08' AND ts >= datetime('now','-2 days')", activeWhen: "zero" }
};
async function contentSignalAudit(env) {
  var out = { signals: 0, freshProbed: 0, active: 0, filed: 0, details: [] };
  var probeCache = {};
  try {
    var rows = await env.AUDIT.prepare(
      "SELECT s.id, s.source, s.content, s.domain, s.evidential_weight, s.decision, s.created_at, fso.id AS fso_id, fso.matches_failure_mode, fso.action_taken FROM signals s LEFT JOIN fleet_signal_observations fso ON fso.signal_id = s.id WHERE s.source IN ('q08','reading') AND s.status = 'open'"
    ).all();
    var rs = rows && rows.results || [];
    out.signals = rs.length;
    var probeDomain = /* @__PURE__ */ __name(async function(domain) {
      var spec = SIGNAL_PROBES[domain];
      if (!spec) return null;
      if (probeCache[domain] !== void 0) return probeCache[domain];
      try {
        var row = await env.AUDIT.prepare(spec.sql).first();
        var n = row && row.n != null ? Number(row.n) : 0;
        var act = spec.activeWhen === "zero" ? n === 0 ? 1 : 0 : n > 0 ? 1 : 0;
        probeCache[domain] = { active: act, n };
        return probeCache[domain];
      } catch (e) {
        probeCache[domain] = { active: null, n: -1 };
        return probeCache[domain];
      }
    }, "probeDomain");
    for (var i = 0; i < rs.length; i++) {
      var s = rs[i];
      var dom = String(s.domain || "");
      var fresh = await probeDomain(dom);
      var active, unresolved;
      if (fresh && fresh.active !== null) {
        out.freshProbed++;
        active = fresh.active;
        unresolved = 1;
        var obs = "FRESH-PROBE(" + dom + " n=" + fresh.n + "): " + (active ? "failure-mode-active" : "nominal");
        try {
          // SIGNAL-OBSERVATION-INSERT-1 (#1654): this used to UPDATE only, so a signal without an
          // observation row was probed but never recorded. Insert the first observation.
          if (s.fso_id == null) await env.AUDIT.prepare("INSERT INTO fleet_signal_observations (signal_id, observed_at, subsystem, current_state, matches_failure_mode, evidence, action_taken) VALUES (?1, datetime('now'), ?2, ?3, ?4, ?5, ?6)").bind(s.id, dom, active ? "failure-mode-active" : "nominal", active, "SIGNAL_PROBES." + dom + " n=" + fresh.n, obs).run();
          else await env.AUDIT.prepare("UPDATE fleet_signal_observations SET matches_failure_mode=?1, action_taken=?2, observed_at=datetime('now') WHERE signal_id=?3").bind(active, obs, s.id).run();
        } catch (e) {
        }
      } else if (!SIGNAL_PROBES[dom]) {
        // SIGNAL-INFORMATIONAL-1 (#1654, explicit decision 2026-10-01): a q08/reading signal whose domain
        // has no subsystem probe (104 of 113 carry the generic domain 'fleet') cannot be matched to a
        // failure mode, so it is informational context for the digests that consult it read-only. It
        // stays open for 30 days, then expires with that decision recorded instead of sitting open forever.
        out.informational = (out.informational || 0) + 1;
        var ageOk = Date.parse(String(s.created_at || "").replace(" ", "T")) < Date.now() - 30 * 864e5;
        if (ageOk) {
          try {
            await env.AUDIT.prepare("UPDATE signals SET status='expired', decision=?1 WHERE id=?2 AND status='open'").bind("SIGNAL-INFORMATIONAL-1: informational (domain '" + (dom || "none") + "' has no subsystem probe); consulted read-only by digests for 30d, then expired by qnfo-fleet-control " + VERSION, s.id).run();
            out.expired = (out.expired || 0) + 1;
          } catch (e) {
          }
        }
        continue;
      } else {
        active = Number(s.matches_failure_mode) === 1;
        unresolved = !s.action_taken || String(s.action_taken).indexOf("OPEN") === 0;
      }
      if (active && unresolved) {
        out.active++;
        var title = "[" + s.source + "] " + String(s.content || "").slice(0, 90);
        var prio = Number(s.evidential_weight) >= 0.8 ? "P1" : "P2";
        var ex = await env.AUDIT.prepare("SELECT id FROM fleet_improvements WHERE kind='failure-mode' AND title=?1 AND status IN ('proposed','approved','in_progress') LIMIT 1").bind(title).first();
        if (!ex) {
          var iid = await improvement(env, "content-signal", dom || "fleet", "failure-mode", title, String(s.decision || "").slice(0, 400), prio);
          try {
            await env.AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts, status) VALUES (?1,?2,?3,datetime('now'),'detected')").bind("content-signal-alert", String(s.id), String(s.decision || s.content || "").slice(0, 400)).run();
          } catch (e) {
          }
          out.filed++;
          out.details.push({ signal: s.id, domain: dom, improvement: iid });
        }
      }
    }
  } catch (e) {
    out.error = String(e && e.message || e).slice(0, 160);
  }
  return out;
}
__name(contentSignalAudit, "contentSignalAudit");
__name22(contentSignalAudit, "contentSignalAudit");
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
__name2(registerWatch, "registerWatch");
__name22(registerWatch, "registerWatch");
var worker_default = {
  async fetch(request, env) {
    var u = new URL(request.url);
    var p = u.pathname;
    var ah = request.headers.get("Authorization") || "";
    var auth = ah.indexOf("Bearer ") === 0 ? ah.slice(7) : ah;
    if (p === "/health") return json({ status: "ok", worker: "qnfo-fleet-deploy", version: VERSION, enabled: await enabled(env), auto_heal: await autoHeal(env) });
    if (p === "/optimize" && request.method === "POST") {
      var ot = auth && env.OPTIMIZER_TRIGGER_SECRET && auth === env.OPTIMIZER_TRIGGER_SECRET;
      if (!ot) return json({ ok: false, error: "unauthorized", d: { authLen: String(auth || "").length, otLen: String(env.OPTIMIZER_TRIGGER_SECRET || "").length } }, 401);
      var optRes = await optimizeFleet(env);
      return json({ ok: true, optimize: optRes });
    }
    /* FLEET-STATE-SUMMARY-PUBLIC-1 (2026-09-30): /state is admin-gated (it carries issue titles, some of which
       describe open security gaps), so no dashboard, agent or probe without the deploy token could read the
       fleet's own view of itself. This route serves the latest snapshot's COUNTS only -- no titles, no bodies. */
    if (p === "/state/summary" && request.method === "GET") {
      try {
        var ss = await env.DB_AUDIT.prepare("SELECT ts, workers_total, workers_up, workers_down, open_issues, open_high, json_extract(payload,'$.summary.workers_unknown') AS workers_unknown, json_extract(payload,'$.summary.down_list') AS down_list, json_extract(payload,'$.issues.by_priority') AS by_priority FROM fleet_state_snapshots ORDER BY ts DESC LIMIT 1").first();
        if (!ss) return json({ ok: false, error: "no snapshot yet" }, 404);
        var sAge = Math.round((Date.now() - new Date(ss.ts).getTime()) / 6e4);
        return json({ ok: true, schema: STATE_SCHEMA, version: VERSION, snapshot_ts: ss.ts, snapshot_age_min: sAge, stale: sAge > 130, workers: { total: ss.workers_total, up: ss.workers_up, down: ss.workers_down, unknown: ss.workers_unknown, down_list: ss.down_list ? JSON.parse(ss.down_list) : [] }, issues: { open: ss.open_issues, open_high: ss.open_high, by_priority: ss.by_priority ? JSON.parse(ss.by_priority) : {} } });
      } catch (e) {
        return json({ ok: false, error: String(e && e.message || e).slice(0, 200) }, 500);
      }
    }
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
    if (p === "/state") {
      try {
        return json(await selfState(env));
      } catch (e) {
        return json({ ok: false, error: String(e && e.message || e).slice(0, 200) }, 500);
      }
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
      await report(env, "SCAN", "", "", "", "manual-drift: scanned=" + res.scanned + " clean=" + res.clean + " drifted=" + res.drifted + " ahead=" + res.ahead + " healed=" + res.healed + " landed=" + res.landed + " errors=" + res.errors + " staleCanon=" + res.staleCanon + " healthVer=" + res.healthVer + " cronDrift=" + res.cronDrift + " errKinds=" + JSON.stringify(res.errKinds));
      var rw = await registerWatch(env, 7);
      return json({ ok: true, scan: res, register: rw });
    }
    if (p === "/scan-heal" && request.method === "POST" && admin) {
      var res2 = await scan(env, true);
      await report(env, "SCAN", "", "", "", "manual-scan-heal: scanned=" + res2.scanned + " clean=" + res2.clean + " drifted=" + res2.drifted + " ahead=" + res2.ahead + " healed=" + res2.healed + " landed=" + res2.landed + " errors=" + res2.errors + " staleCanon=" + res2.staleCanon + " healthVer=" + res2.healthVer + " errKinds=" + JSON.stringify(res2.errKinds));
      var rw2 = await registerWatch(env, 7);
      return json({ ok: true, scan: res2, register: rw2 });
    }
    if (p === "/git-selftest" && request.method === "POST" && admin) {
      return json(await gitSelftest(env));
    }
    if (p === "/landfix" && request.method === "POST" && admin) {
      var lb = {};
      try { lb = await request.json(); } catch (e) {}
      var wn = String(lb.worker || "");
      if (!wn) return json({ error: "worker required" }, 400);
      var cc = await canonical(env, wn);
      var dd = await deployedContent(env, wn);
      var dv = dd ? versionOf(dd) : null;
      var cv = cc ? versionOf(cc.code) : null;
      var lfr = await landFix(env, wn, dd, dv, cv, cc ? cc.path : "");
      await report(env, wn, dv, cv, cc ? cc.path : "", lfr.ok ? "manual-landfix:landed " + lfr.note : "manual-landfix:" + lfr.note);
      return json({ ok: lfr.ok, worker: wn, deployed: dv, canonical: cv, path: cc ? cc.path : null, result: lfr });
    }
    return json({ error: "not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    var heal = await autoHeal(env);
    var res = await scan(env, heal);
    var opt = await optimizeFleet(env);
    try {
      await selfState(env);
    } catch (e) {
    }
    var rw = await registerWatch(env, 7);
    await report(env, "SCAN", "", "", "", "cron: scanned=" + res.scanned + " clean=" + res.clean + " drifted=" + res.drifted + " ahead=" + res.ahead + " healed=" + res.healed + " landed=" + res.landed + " errors=" + res.errors + " staleCanon=" + res.staleCanon + " healthVer=" + res.healthVer + " cronDrift=" + res.cronDrift + " errKinds=" + JSON.stringify(res.errKinds) + " regOpen=" + rw.open + " regOverdue=" + rw.overdue + " regDue7=" + rw.dueSoon + " regEscalated=" + rw.escalated);
  }
};
var deployDefault = worker_default;
// ---- AUTOPILOT-FOLD-1 (2026-10-01, issue 1640): qnfo-autopilot folded into qnfo-fleet-control ----
// qnfo-autopilot 0.3.3 vanished unrecorded around 2026-09-25 (worker_removals). Its duties are folded into existing
// workers instead of recreating it:
//   * overdue task_dod_register census  -> already done hourly here by registerWatch(); not duplicated.
//   * worker_activity_daily snapshot    -> activitySnapshotDaily() below, once a day (it wrote 24 rows/worker/day).
//   * think loop (research questions)   -> idea-hub 1.3.0, next to the other ideation producers.
//   * evolve loop (self-rewrite)        -> EVOLVE-PR-1 below, REBUILT. The original fetched a LIVE script, truncated it
//     to 16k chars, asked a model for the COMPLETE rewritten source and PUT it straight to Cloudflare, bypassing the
//     repo, CI and canonical deploy. Measured outcome since 2026-09-11: 116 attempts, 0 applied (93 rejected by the
//     Cloudflare parser - mostly truncation SyntaxErrors - and 25 against deleted scripts); the 16 applied rewrites of
//     09-10/11 went live without ever reaching the repo. Its /evolve/apply and /git/commit routes were unauthenticated.
//     EVOLVE-PR-1 keeps the loop autonomous but lands every change the way a human change lands:
//       target  = an open agent_issue owned (issue_triage.owner) by an eligible worker; core control-plane workers,
//                 container workers and `const VERSION` bundles are never targeted;
//       propose = a 160-line excerpt chosen by the issue's keywords; the model returns ONE exact anchor (must occur
//                 exactly once in the repo file) and its replacement - never a whole file;
//       check   = confidence >= 0.6, no VERSION edits, balanced ()[]{} and backticks, bounded size, then a second
//                 model must approve the edit as a plausible fix that keeps behaviour otherwise unchanged;
//       land    = branch evolve/<worker>-c<id>, one commit with worker.js + deployed-current mirror + VERSION bump,
//                 a PR, and a self-merge ONLY when the required checks (gate, guard, mirror-guard, comparator) pass;
//                 canonical-deploy then ships it;
//       verify  = fleet_deploys must show the new VERSION and worker_live_audit http 200 with it live; otherwise an
//                 inverse-edit revert PR goes through the same gate.
//     Pace: one candidate in flight, at most one new proposal per EVOLVE_GAP_H, 24h backoff after 3 straight rejections.
var EVOLVE_REPO = "QNFO/qnfo-workers";
var EVOLVE_GAP_H = 6;
var EVOLVE_REQUIRED = ["gate", "guard", "mirror-guard", "comparator"];
var EVOLVE_DENY = ["qnfo-fleet-control", "qnfo-ops", "qnfo-deploy-guard", "qnfo-containers-pilot", "qnfo-gateway", "qnfo-ai", "qnfo-autonomy-scorer"];
var EVOLVE_OPEN_STATES = ["pr-open", "merged", "deployed"];
// EVOLVE-GUARDRAILS-2 (2026-10-01, from the first live cycle, candidate 115 / PR 180): the loop picked agent_issue 1091
// (a publication HOLD, category 'publication') and added a guard that called markError(), which re-queues the row for
// full re-research; neither model saw markError's body. (1) Only code-defect categories are targeted. (2) The reviewer
// receives the definitions of every file-local function the edit calls and must check their side effects.
// (3) Verification compares the live audit with the DEPLOY time and accepts a healthy later deploy of the same worker
// (exact-version equality turned any follow-up deploy into a false failure and an unwanted auto-revert).
var EVOLVE_CATEGORIES = ["reliability", "observability", "automation", "cost", "self-heal", "integrity", "data-integrity", "correctness", "monitoring", "optimization", "integration", "remediation", "email"];
var EVOLVE_FAIL_STATES = ["no-context", "model-skip", "invalid", "review-rejected", "ci-rejected", "ci-timeout", "pr-failed"];
function evGh(env) {
  return { "Authorization": "Bearer " + env.GITHUB_TOKEN, "User-Agent": "qnfo-fleet-control/evolve", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
}
__name(evGh, "evGh");
async function evApi(env, method, path, body) {
  var r = await timedFetch("https://api.github.com/repos/" + EVOLVE_REPO + path, { method: method, headers: evGh(env), body: body ? JSON.stringify(body) : void 0 }, 15e3);
  var j = null;
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, ok: r.status >= 200 && r.status < 300, j: j };
}
__name(evApi, "evApi");
function evDecode(b64) {
  return new TextDecoder().decode(Uint8Array.from(atob(String(b64 || "").replace(/\s+/g, "")), function(c) { return c.charCodeAt(0); }));
}
__name(evDecode, "evDecode");
async function evSchema(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS evolve_candidates (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT NOT NULL, ts TEXT, status TEXT DEFAULT 'proposed', proposal TEXT, sha256 TEXT)").run();
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS self_rewrite_state (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT, ts TEXT, action TEXT, status TEXT, detail TEXT)").run();
  var cols = ["deployed_at TEXT", "kind TEXT", "issue_id INTEGER", "pr_number INTEGER", "branch TEXT", "head_sha TEXT", "merged_sha TEXT", "version_from TEXT", "version_to TEXT", "path TEXT", "note TEXT", "updated_at TEXT", "parent_id INTEGER"];
  for (var i = 0; i < cols.length; i++) {
    try { await env.AUDIT.prepare("ALTER TABLE evolve_candidates ADD COLUMN " + cols[i]).run(); } catch (e) {}
  }
}
__name(evSchema, "evSchema");
async function evSet(env, id, status, note, extra) {
  var sets = ["status=?1", "note=?2", "updated_at=?3"], vals = [status, String(note || "").slice(0, 500), new Date().toISOString()];
  var keys = Object.keys(extra || {});
  for (var i = 0; i < keys.length; i++) { sets.push(keys[i] + "=?" + (vals.length + 1)); vals.push(extra[keys[i]]); }
  vals.push(id);
  var st = env.AUDIT.prepare("UPDATE evolve_candidates SET " + sets.join(",") + " WHERE id=?" + vals.length);
  await st.bind.apply(st, vals).run();
  var row = await env.AUDIT.prepare("SELECT worker FROM evolve_candidates WHERE id=?1").bind(id).first();
  await env.AUDIT.prepare("INSERT INTO self_rewrite_state (worker, ts, action, status, detail) VALUES (?1, ?2, 'evolve-pr', ?3, ?4)").bind(row ? row.worker : "", new Date().toISOString(), status, ("c" + id + " " + String(note || "")).slice(0, 220)).run();
}
__name(evSet, "evSet");
function evBalanced(a, b) {
  var pairs = [["(", ")"], ["[", "]"], ["{", "}"]];
  for (var i = 0; i < pairs.length; i++) {
    var da = a.split(pairs[i][0]).length - a.split(pairs[i][1]).length;
    var db = b.split(pairs[i][0]).length - b.split(pairs[i][1]).length;
    if (da !== db) return false;
  }
  return (a.split("`").length - b.split("`").length) % 2 === 0;
}
__name(evBalanced, "evBalanced");
function evBump(content, cid) {
  var re = /^var\sVERSION\s=\s"(\d+)\.(\d+)\.(\d+)([^"]*)";$/m;
  var all = content.match(/^var\sVERSION\s=\s"[^"]*";$/gm) || [];
  if (all.length !== 1) return null;
  var m = content.match(re);
  if (!m) return null;
  var from = m[1] + "." + m[2] + "." + m[3] + m[4];
  var to = m[1] + "." + m[2] + "." + (Number(m[3]) + 1) + "-evolve-c" + cid;
  return { from: from, to: to, content: content.replace(m[0], 'var VERSION = "' + to + '";') };
}
__name(evBump, "evBump");
function evAiText(r) {
  if (!r) return "";
  var c = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  if (c) return String(c);
  if (typeof r.response === "string") return r.response;
  if (r.response && typeof r.response === "object") return JSON.stringify(r.response);
  return typeof r === "string" ? r : "";
}
__name(evAiText, "evAiText");
async function evModelJson(env, model, system, user) {
  var r = await aiRunAttr(env, "qnfo-fleet-control", "patch-gen", model, { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 2500, temperature: 0.1 });
  var t = evAiText(r), m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}
__name(evModelJson, "evModelJson");
function evDefs(content, text, max) {
  var skip = { "if": 1, "for": 1, "while": 1, "switch": 1, "catch": 1, "function": 1, "return": 1, "typeof": 1, "new": 1, "await": 1, "String": 1, "Number": 1, "JSON": 1, "Math": 1, "Date": 1, "Object": 1, "Array": 1, "Promise": 1 };
  var seen = {}, out = [], re = /\b([A-Za-z_$][\w$]*)\s*\(/g, m;
  while ((m = re.exec(text)) && out.length < (max || 4)) {
    var n = m[1];
    if (seen[n] || skip[n]) continue;
    seen[n] = 1;
    var at = content.search(new RegExp("(^|\\n)(async\\s+)?function\\s+" + n.replace(/\$/g, "\\$") + "\\s*\\("));
    if (at < 0) continue;
    out.push(content.slice(at).replace(/^\n/, "").split("\n").slice(0, 40).join("\n"));
  }
  return out;
}
__name(evDefs, "evDefs");
async function evReadFile(env, path, ref) {
  var r = await evApi(env, "GET", "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + (ref || "main"));
  if (!r.ok || !r.j || !r.j.content) return null;
  return evDecode(r.j.content);
}
__name(evReadFile, "evReadFile");
function evExcerpt(content, title) {
  var toks = String(title || "").toLowerCase().split(/[^a-z0-9_]+/).filter(function(t) { return t.length >= 5 && !/^\d+$/.test(t); });
  if (!toks.length) return null;
  var lines = content.split("\n"), score = lines.map(function(l) { var x = l.toLowerCase(), n = 0; for (var i = 0; i < toks.length; i++) if (x.indexOf(toks[i]) >= 0) n++; return n; });
  var W = 160, best = -1, bestAt = 0, cur = 0;
  for (var i = 0; i < lines.length; i++) {
    cur += score[i];
    if (i >= W) cur -= score[i - W];
    if (cur > best) { best = cur; bestAt = Math.max(0, i - W + 1); }
  }
  if (best <= 0) return null;
  return lines.slice(bestAt, bestAt + W).join("\n");
}
__name(evExcerpt, "evExcerpt");
// Commit worker.js + its mirror on a new branch and open a PR.
async function evOpenPr(env, cid, worker, dir, newContent, title, body) {
  var ref = await evApi(env, "GET", "/git/ref/heads/main");
  var base = ref.j && ref.j.object && ref.j.object.sha;
  if (!base) return { ok: false, why: "main ref HTTP " + ref.status };
  var cm = await evApi(env, "GET", "/git/commits/" + base);
  var tree = cm.j && cm.j.tree && cm.j.tree.sha;
  if (!tree) return { ok: false, why: "base commit HTTP " + cm.status };
  var blob = await evApi(env, "POST", "/git/blobs", { content: b64encode(newContent), encoding: "base64" });
  if (!blob.ok) return { ok: false, why: "blob HTTP " + blob.status };
  var tr = await evApi(env, "POST", "/git/trees", { base_tree: tree, tree: [{ path: dir + "/worker.js", mode: "100644", type: "blob", sha: blob.j.sha }, { path: dir + "/deployed-current.worker.js", mode: "100644", type: "blob", sha: blob.j.sha }] });
  if (!tr.ok) return { ok: false, why: "tree HTTP " + tr.status };
  var co = await evApi(env, "POST", "/git/commits", { message: title + "\n\n" + body, tree: tr.j.sha, parents: [base] });
  if (!co.ok) return { ok: false, why: "commit HTTP " + co.status };
  var branch = "evolve/" + worker + "-c" + cid;
  var br = await evApi(env, "POST", "/git/refs", { ref: "refs/heads/" + branch, sha: co.j.sha });
  if (!br.ok) return { ok: false, why: "branch HTTP " + br.status };
  var pr = await evApi(env, "POST", "/pulls", { title: title, head: branch, base: "main", body: body });
  if (!pr.ok) return { ok: false, why: "pull HTTP " + pr.status + " " + String(pr.j && pr.j.message || "").slice(0, 80), branch: branch };
  return { ok: true, pr: pr.j.number, branch: branch, head: co.j.sha };
}
__name(evOpenPr, "evOpenPr");
async function evClosePr(env, pr, branch) {
  await evApi(env, "PATCH", "/pulls/" + pr, { state: "closed" });
  if (branch) await evApi(env, "DELETE", "/git/refs/heads/" + branch);
}
__name(evClosePr, "evClosePr");
// Apply anchor->replacement to the CURRENT main file, bump VERSION and open the PR.
async function evLand(env, cid, worker, dir, anchor, replacement, title, bodyLines) {
  var path = dir + "/worker.js";
  var content = await evReadFile(env, path, "main");
  if (!content) return { ok: false, status: "invalid", why: "cannot read " + path };
  if (content.split(anchor).length !== 2) return { ok: false, status: "invalid", why: "anchor no longer occurs exactly once" };
  var bumped = evBump(content.replace(anchor, function() { return replacement; }), cid);
  if (!bumped) return { ok: false, status: "invalid", why: "no single numeric `var VERSION` to bump" };
  var body = bodyLines.concat(["", "VERSION " + bumped.from + " -> " + bumped.to + ". Landed by qnfo-fleet-control EVOLVE-PR-1: merged by the loop only if gate, guard, mirror-guard and comparator pass; verified live after canonical-deploy; auto-reverted through a PR otherwise."]).join("\n");
  var pr = await evOpenPr(env, cid, worker, dir, bumped.content, title, body);
  if (!pr.ok) return { ok: false, status: "pr-failed", why: pr.why };
  return { ok: true, pr: pr.pr, branch: pr.branch, head: pr.head, from: bumped.from, to: bumped.to, path: path };
}
__name(evLand, "evLand");
async function evPropose(env) {
  var model = env.EVOLVE_MODEL || "@cf/moonshotai/kimi-k2.7-code";
  var reviewer = env.REVIEW_MODEL || "@cf/openai/gpt-oss-120b";
  var cands = (await env.AUDIT.prepare("SELECT a.id, a.title, substr(a.description,1,1500) d, t.owner FROM agent_issues a JOIN issue_triage t ON t.issue_id=a.id WHERE a.status='open' AND a.priority IN ('high','medium','low') AND a.title NOT LIKE 'SEC-%' AND a.category IN (" + EVOLVE_CATEGORIES.map(function(c) { return "'" + c + "'"; }).join(",") + ") AND a.id NOT IN (SELECT issue_id FROM evolve_candidates WHERE issue_id IS NOT NULL AND ts > datetime('now','-14 day')) ORDER BY CASE a.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, a.id LIMIT 40").all()).results || [];
  for (var i = 0; i < cands.length; i++) {
    var iss = cands[i], worker = String(iss.owner || "");
    if (!/^[a-z0-9-]+$/.test(worker) || EVOLVE_DENY.indexOf(worker) >= 0) continue;
    var toml = await evReadFile(env, worker + "/wrangler.toml", "main");
    if (!toml || /^\[\[containers\]\]/m.test(toml)) continue;
    var content = await evReadFile(env, worker + "/worker.js", "main");
    if (!content || !/^var\sVERSION\s=\s"\d+\.\d+\.\d+[^"]*";$/m.test(content)) continue;
    var now = new Date().toISOString();
    var ins = await env.AUDIT.prepare("INSERT INTO evolve_candidates (worker, ts, status, kind, issue_id, path, updated_at) VALUES (?1, ?2, 'proposing', 'fix', ?3, ?4, ?2)").bind(worker, now, iss.id, worker + "/worker.js").run();
    var cid = ins.meta.last_row_id;
    var excerpt = evExcerpt(content, iss.title + " " + iss.d);
    if (!excerpt) { await evSet(env, cid, "no-context", "no excerpt matched the issue keywords"); return { ok: true, cid: cid, status: "no-context" }; }
    var sys = "You are a careful senior engineer making the smallest correct fix to a Cloudflare Worker (JavaScript module). Output strict JSON only: {\"anchor\": \"<exact contiguous text copied verbatim from the EXCERPT, at least 40 characters, occurring once>\", \"replacement\": \"<text that replaces the anchor>\", \"rationale\": \"<=200 chars\", \"confidence\": 0-1}. Never touch the VERSION line. If the excerpt does not contain the code that must change, output {\"skip\": \"<reason>\"}.";
    var user = "ISSUE #" + iss.id + ": " + iss.title + "\n" + iss.d + "\n\nEXCERPT of " + worker + "/worker.js:\n" + excerpt;
    var p = await evModelJson(env, model, sys, user).catch(function() { return null; });
    if (!p || p.skip || !p.anchor || p.replacement == null) { await evSet(env, cid, "model-skip", p && p.skip ? String(p.skip) : "no usable JSON from " + model); return { ok: true, cid: cid, status: "model-skip" }; }
    var anchor = String(p.anchor), repl = String(p.replacement), why = null;
    if (anchor.length < 40) why = "anchor shorter than 40 chars";
    else if (content.split(anchor).length !== 2) why = "anchor occurs " + (content.split(anchor).length - 1) + " times";
    else if (anchor === repl) why = "no-op edit";
    else if (/VERSION\s*=/.test(anchor + repl)) why = "edit touches VERSION";
    else if (repl.length > 8e3 || Math.abs(repl.length - anchor.length) > 4e3) why = "edit too large";
    else if (!evBalanced(anchor, repl)) why = "unbalanced brackets or backticks";
    else if (!(Number(p.confidence) >= 0.6)) why = "confidence " + p.confidence;
    var proposal = JSON.stringify({ anchor: anchor, replacement: repl, rationale: String(p.rationale || "").slice(0, 300), confidence: p.confidence, model: model });
    await env.AUDIT.prepare("UPDATE evolve_candidates SET proposal=?1 WHERE id=?2").bind(proposal, cid).run();
    if (why) { await evSet(env, cid, "invalid", why); return { ok: true, cid: cid, status: "invalid" }; }
    var defs = evDefs(content, repl + "\n" + anchor, 4);
    var rv = await evModelJson(env, reviewer, "You review a proposed code edit to a production Cloudflare Worker. Approve only if it plausibly fixes the issue, is syntactically valid in context, and leaves unrelated behaviour unchanged. Read the DEFINITIONS of the functions the edit calls and reject the edit if a helper has a side effect that contradicts the intent (for example re-queuing, retrying, re-processing or writing where the edit means to stop). Reject if the issue is a hold, policy or owner decision rather than a code defect. Output strict JSON only: {\"approve\": true|false, \"reason\": \"<=200 chars\"}.", "ISSUE #" + iss.id + ": " + iss.title + "\n" + iss.d + "\n\nCONTEXT:\n" + excerpt + "\n\nREPLACE:\n" + anchor + "\n\nWITH:\n" + repl + "\n\nRATIONALE: " + String(p.rationale || "") + (defs.length ? "\n\nDEFINITIONS OF CALLED FUNCTIONS:\n" + defs.join("\n\n") : "")).catch(function() { return null; });
    if (!rv || rv.approve !== true) { await evSet(env, cid, "review-rejected", rv ? String(rv.reason || "") : "reviewer returned no JSON"); return { ok: true, cid: cid, status: "review-rejected" }; }
    var title = "evolve(" + worker + "): agent_issue " + iss.id + " (candidate " + cid + ")";
    var land = await evLand(env, cid, worker, worker, anchor, repl, title, ["Automated fix proposal for agent_issue #" + iss.id + ": " + iss.title, "", "Rationale (" + model + "): " + String(p.rationale || ""), "Review (" + reviewer + "): approved - " + String(rv.reason || "")]);
    if (!land.ok) { await evSet(env, cid, land.status, land.why); return { ok: true, cid: cid, status: land.status }; }
    await evSet(env, cid, "pr-open", "PR " + land.pr, { pr_number: land.pr, branch: land.branch, head_sha: land.head, version_from: land.from, version_to: land.to });
    return { ok: true, cid: cid, status: "pr-open", pr: land.pr };
  }
  return { ok: true, status: "idle", note: "no eligible open issue" };
}
__name(evPropose, "evPropose");
async function evRevert(env, c, why) {
  var p = null;
  try { p = JSON.parse(c.proposal || "null"); } catch (e) {}
  if (!p || !p.anchor) { await evSet(env, c.id, "revert-failed", "no stored edit: " + why); return; }
  var now = new Date().toISOString();
  var ins = await env.AUDIT.prepare("INSERT INTO evolve_candidates (worker, ts, status, kind, issue_id, path, parent_id, proposal, updated_at) VALUES (?1, ?2, 'proposing', 'revert', ?3, ?4, ?5, ?6, ?2)").bind(c.worker, now, c.issue_id, c.path, c.id, JSON.stringify({ anchor: p.replacement, replacement: p.anchor, rationale: "revert of candidate " + c.id + ": " + why })).run();
  var rid = ins.meta.last_row_id;
  var land = await evLand(env, rid, c.worker, c.worker, p.replacement, p.anchor, "evolve(" + c.worker + "): revert candidate " + c.id, ["Automatic revert of evolve candidate " + c.id + " (PR " + c.pr_number + "): " + why]);
  if (!land.ok) {
    await evSet(env, rid, "revert-failed", land.why);
    await evSet(env, c.id, "revert-failed", why + "; revert PR not opened: " + land.why);
    try { await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, 'qnfo-fleet-control', 'reliability', 'high', 'open', ?3, ?3)").bind("EVOLVE-REVERT-FAILED-1: " + c.worker + " candidate " + c.id + " needs a manual revert", "Evolve candidate " + c.id + " (PR " + c.pr_number + ", VERSION " + c.version_to + ") failed post-deploy verification (" + why + ") and the inverse-edit revert could not be opened: " + land.why, Date.now()).run(); } catch (e) {}
    return;
  }
  await evSet(env, rid, "pr-open", "PR " + land.pr, { pr_number: land.pr, branch: land.branch, head_sha: land.head, version_from: land.from, version_to: land.to });
  await evSet(env, c.id, "reverting", why + "; revert PR " + land.pr);
}
__name(evRevert, "evRevert");
async function evAdvance(env, c) {
  var ageH = (Date.now() - Date.parse(c.updated_at || c.ts)) / 36e5;
  if (c.status === "pr-open") {
    var pr = await evApi(env, "GET", "/pulls/" + c.pr_number);
    if (!pr.ok) return { cid: c.id, note: "pull HTTP " + pr.status };
    if (pr.j.merged) { await evSet(env, c.id, "merged", "merged " + String(pr.j.merge_commit_sha || "").slice(0, 7), { merged_sha: pr.j.merge_commit_sha }); return { cid: c.id, status: "merged" }; }
    if (pr.j.state === "closed") { await evSet(env, c.id, "ci-rejected", "PR closed without merge"); return { cid: c.id, status: "closed" }; }
    var head = pr.j.head && pr.j.head.sha;
    var runs = await evApi(env, "GET", "/commits/" + head + "/check-runs?per_page=100");
    var by = {};
    ((runs.j && runs.j.check_runs) || []).forEach(function(r) { if (EVOLVE_REQUIRED.indexOf(r.name) >= 0 && (!by[r.name] || r.id > by[r.name].id)) by[r.name] = r; });
    var failed = EVOLVE_REQUIRED.filter(function(n) { return by[n] && by[n].status === "completed" && ["success", "neutral", "skipped"].indexOf(by[n].conclusion) < 0; });
    if (failed.length) { await evClosePr(env, c.pr_number, c.branch); await evSet(env, c.id, "ci-rejected", "required check(s) failed: " + failed.join(",")); return { cid: c.id, status: "ci-rejected" }; }
    var green = EVOLVE_REQUIRED.every(function(n) { return by[n] && by[n].status === "completed"; });
    if (green) {
      var mg = await evApi(env, "PUT", "/pulls/" + c.pr_number + "/merge", { merge_method: "squash", sha: head, commit_title: pr.j.title + " (#" + c.pr_number + ")" });
      if (mg.ok) { await evApi(env, "DELETE", "/git/refs/heads/" + c.branch); await evSet(env, c.id, "merged", "self-merged on green required checks", { merged_sha: mg.j && mg.j.sha }); return { cid: c.id, status: "merged" }; }
      if (mg.status === 405 || mg.status === 409) await evApi(env, "PUT", "/pulls/" + c.pr_number + "/update-branch", {});
      return { cid: c.id, note: "merge HTTP " + mg.status };
    }
    if (ageH > 3) { await evClosePr(env, c.pr_number, c.branch); await evSet(env, c.id, "ci-timeout", "required checks not complete after 3h"); return { cid: c.id, status: "ci-timeout" }; }
    return { cid: c.id, status: "pr-open", note: "waiting on checks" };
  }
  if (c.status === "merged") {
    var dep = await env.AUDIT.prepare("SELECT ts FROM fleet_deploys WHERE worker=?1 AND to_sha=?2 AND ok=1 ORDER BY id DESC LIMIT 1").bind(c.worker, c.version_to).first();
    if (dep) { await evSet(env, c.id, "deployed", "canonical deploy " + dep.ts, { deployed_at: dep.ts }); return { cid: c.id, status: "deployed" }; }
    if (ageH > 3) { await evSet(env, c.id, "deploy-missing", "no fleet_deploys row for " + c.version_to + " 3h after merge"); return { cid: c.id, status: "deploy-missing" }; }
    return { cid: c.id, status: "merged", note: "waiting on canonical deploy" };
  }
  if (c.status === "deployed") {
    var la = await env.AUDIT.prepare("SELECT http, live_version, probed_at FROM worker_live_audit WHERE worker=?1").bind(c.worker).first();
    var since = Date.parse(c.deployed_at || c.updated_at);
    var probedAfter = la && la.probed_at && Date.parse(String(la.probed_at).replace(" ", "T") + (/[zZ]$/.test(la.probed_at) ? "" : "Z")) > since;
    if (!probedAfter) return { cid: c.id, status: "deployed", note: "waiting on a live audit after deploy" };
    var mine = await env.AUDIT.prepare("SELECT MAX(id) id FROM fleet_deploys WHERE worker=?1 AND to_sha=?2 AND ok=1").bind(c.worker, c.version_to).first();
    var later = mine && mine.id ? await env.AUDIT.prepare("SELECT COUNT(*) n FROM fleet_deploys WHERE worker=?1 AND ok=1 AND to_sha IS NOT NULL AND to_sha != ?2 AND id > ?3").bind(c.worker, c.version_to, mine.id).first() : null;
    var superseded = !!(later && Number(later.n) > 0);
    if (la.http === 200 && (la.live_version === c.version_to || superseded)) {
      await evSet(env, c.id, c.kind === "revert" ? "reverted-verified" : "verified", "live " + la.live_version + " http 200");
      if (c.kind === "revert" && c.parent_id) await evSet(env, c.parent_id, "reverted", "revert candidate " + c.id + " verified live");
      if (c.kind !== "revert" && c.issue_id) { try { await env.AUDIT.prepare("UPDATE agent_issues SET description = description || ?1, updated_at=?2 WHERE id=?3").bind(" | EVOLVE-PR-1: candidate " + c.id + " merged as PR " + c.pr_number + " and verified live as " + c.version_to + "; close against this issue's own DoD.", Date.now(), c.issue_id).run(); } catch (e) {} }
      return { cid: c.id, status: "verified" };
    }
    if (c.kind === "revert") { await evSet(env, c.id, "revert-failed", "revert live check failed: http " + la.http + " version " + la.live_version); return { cid: c.id, status: "revert-failed" }; }
    await evRevert(env, c, "post-deploy live check failed: http " + la.http + ", live version " + la.live_version);
    return { cid: c.id, status: "reverting" };
  }
  return { cid: c.id, status: c.status };
}
__name(evAdvance, "evAdvance");
async function evolveTick(env, force) {
  if (!env.GITHUB_TOKEN) return { ok: false, why: "no GITHUB_TOKEN" };
  if (!env.AI) return { ok: false, why: "no AI binding" };
  await evSchema(env);
  var inflight = await env.AUDIT.prepare("SELECT * FROM evolve_candidates WHERE status IN ('pr-open','merged','deployed') ORDER BY id ASC LIMIT 1").first();
  if (inflight) return { ok: true, advanced: await evAdvance(env, inflight) };
  var last = await env.AUDIT.prepare("SELECT ts FROM evolve_candidates WHERE kind IS NOT NULL ORDER BY id DESC LIMIT 1").first();
  if (!force && last && Date.now() - Date.parse(last.ts) < EVOLVE_GAP_H * 36e5) return { ok: true, idle: "gap " + EVOLVE_GAP_H + "h" };
  var recent = (await env.AUDIT.prepare("SELECT status, ts FROM evolve_candidates WHERE kind IS NOT NULL ORDER BY id DESC LIMIT 3").all()).results || [];
  if (!force && recent.length === 3 && recent.every(function(r) { return EVOLVE_FAIL_STATES.indexOf(r.status) >= 0; }) && Date.now() - Date.parse(recent[0].ts) < 24 * 36e5) return { ok: true, idle: "backoff after 3 rejections" };
  return await evPropose(env);
}
__name(evolveTick, "evolveTick");
// Folded autopilot activity snapshot: one row per scheduled worker per day (dashboard req24).
async function activitySnapshotDaily(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS worker_activity_daily (id INTEGER PRIMARY KEY AUTOINCREMENT, worker_name TEXT NOT NULL, day TEXT NOT NULL, req24 INTEGER, source TEXT, ts TEXT)").run();
  var r = await timedFetch("https://fleet.qnfo.org/api/state", { headers: { "User-Agent": "qnfo-fleet-control/" + VERSION } }, 2e4);
  if (!r.ok) return { ok: false, why: "dashboard HTTP " + r.status };
  var st = await r.json();
  var day = new Date().toISOString().slice(0, 10), now = new Date().toISOString(), stmts = [];
  (st.scheduled || []).forEach(function(s) {
    if (!s.name || s.req24 == null) return;
    stmts.push(env.AUDIT.prepare("DELETE FROM worker_activity_daily WHERE worker_name=?1 AND day=?2").bind(s.name, day));
    stmts.push(env.AUDIT.prepare("INSERT INTO worker_activity_daily (worker_name, day, req24, source, ts) VALUES (?1, ?2, ?3, 'dashboard-scheduled-req24', ?4)").bind(s.name, day, s.req24, now));
  });
  for (var i = 0; i < stmts.length; i += 50) await env.AUDIT.batch(stmts.slice(i, i + 50));
  return { ok: true, workers: stmts.length / 2 };
}
__name(activitySnapshotDaily, "activitySnapshotDaily");
// ---- CHARTER-LOOP-1:BEGIN (2026-10-01, QUNIVERSE-CHARTER-1) ----
// The Quniverse charter (docs/QUNIVERSE-CHARTER.md) is a MEASURED document, not an essay. Its hand-written half
// states what the system is, what it should be, its objectives, SWOT, MVP, blue-sky footprint and decision rules.
// Its generated half (between the CHARTER-LIVE markers) is recomputed here from the live registers every day and
// committed back to main, so the charter can never be older than the fleet it describes. The owner directive behind
// it (2026-10-01): research these questions once, then keep them "baked into the heart and soul" of every development
// decision automatically, server-side, without further user involvement.
//
// What this block does, in order (charterTick):
//   facts    = one read of the registers the charter is graded on (objectives, metric_registry, impact_thresholds,
//              fleet_budget, survival_state, shutdown_manifest, autonomy_scores, roadmap_implementation, agent_issues,
//              worker_live_audit, guard_registry, subscribers, goals, fleet_deploys). Every read is individually
//              fail-soft: a missing table yields an empty fact, never an exception.
//   evaluate = pure: pillar health (metric meets target), MVP component status, a live SWOT, the roadmap by horizon,
//              the review gate, and the list of charter breaches.
//   snapshot = one charter_snapshots row per tick (state_json + rendered sha), so the dashboard and any session can
//              read the fleet's own account of itself.
//   breaches = CHARTER-MVP-DOWN-1 issues are filed (open-title dedup) while an MVP component is not serving, and
//              closed with close_evidence when it serves again. Nothing else is filed from here: budget, spend and
//              gate breaches already have owners and are only REPORTED in the charter.
//   commit   = the rendered block replaces the CHARTER-LIVE section of docs/QUNIVERSE-CHARTER.md on main through the
//              GitHub Contents API (the same GITHUB_TOKEN write path LAND-CODE-FIX-1 proved), at most once per UTC day
//              and only when the block changed. A doc without both markers is never written (nothing to anchor to).
// The pure functions take no env and touch no I/O, so qnfo-fleet-control/charter.test.mjs exercises them offline.
var CHARTER_VERSION = "1.0.4";
// CHARTER-ON-CLOUDFLARE-1 (#1727, owner directive 2026-10-01: all data on Cloudflare): every tick also writes the
// whole charter (hand-written sections + the live block) to R2 qnfo-canonical under this key, so the document is
// readable from Cloudflare storage (GET /charter/full.md) when GitHub or any agent session is not.
var CHARTER_MIRROR_KEY = "docs/QUNIVERSE-CHARTER.md";
var CHARTER_REPO = "QNFO/qnfo-workers";
var CHARTER_DOC_PATH = "docs/QUNIVERSE-CHARTER.md";
var CHARTER_BEGIN = "<!-- CHARTER-LIVE:BEGIN -->";
var CHARTER_END = "<!-- CHARTER-LIVE:END -->";
var CHARTER_PILLARS = [
  { key: "core", name: "Smallest verified core", objective: "mission", metrics: ["worker_count", "drift_total", "probe_coverage_pct", "deploy_freshness_h", "cron_compliance", "guard_rcs"], types: ["core", "gate"] },
  { key: "autonomy", name: "Human as override, never dependency", objective: "objective-function", metrics: ["open_agent_issues", "fleet_context_tokens", "watchmaker_index"], types: ["autonomy", "governance", "observability"] },
  { key: "research", name: "Research that is read and cited", objective: "return-on-spend", metrics: ["publications_30d", "full_reports_live_30d", "zenodo_versions_per_flagship", "indexed_surface"], types: ["research-product"] },
  { key: "reach", name: "Credible reach", objective: "return-on-spend", metrics: ["distribution_posts_30d", "subscribers_growth_monthly", "pageviews_30d", "referral_30d", "external_impact_per_dollar", "zenodo_views_total"], types: ["impact", "web"] },
  { key: "cost", name: "Cost that returns", objective: "cost-ceiling", metrics: ["cost_usd_30d", "workers_ai_cost_30d_usd", "gateway_cap_30d_usd", "cost_per_successful_task_by_class", "workers_ai_attribution_coverage_pct"], types: ["cost"] },
  { key: "security", name: "A trust boundary that holds", objective: "mission", metrics: [], types: ["security"] },
  { key: "personal", name: "Personal utility layer", objective: "mission", metrics: [], types: ["personal"] }
];
// The minimum verified core: the components the charter says the system IS. Anything else is optional surface and
// must earn its place through the net-zero rule (fleet_budget) and live-consumer proof (F1/F2).
var CHARTER_MVP = [
  { worker: "qnfo-ops", pillar: "core", role: "canonical deploy path (/ops/deploy), service registry, ops agent" },
  { worker: "qnfo-deploy-guard", pillar: "core", role: "deploy lock, deploy ledger, secret-lock leases, mutation detector" },
  { worker: "qnfo-ai", pillar: "core", role: "model router and research gateway (cost ladder, ensembles, RAG)" },
  { worker: "qnfo-tools-mcp", pillar: "core", role: "the machine tool surface every client uses" },
  { worker: "qnfo-memory-mcp", pillar: "core", role: "persistent agent memory (D1 + Vectorize + KG)" },
  { worker: "qnfo-fleet-control", pillar: "autonomy", role: "governance kernel: drift scan, self-heal, evolve, metrics, charter loop" },
  { worker: "qnfo-autonomy-scorer", pillar: "autonomy", role: "measured VSM/OODA autonomy scores and survival state" },
  { worker: "qnfo-fleet-dashboard", pillar: "autonomy", role: "the owner surface (fleet.qnfo.org) and probe coverage" },
  { worker: "fleet-exec", pillar: "autonomy", role: "D1-defined task engine and cron dispatcher" },
  { worker: "qnfo-research-exec", pillar: "research", role: "research queue -> publish (Zenodo DOI, PDF, KG)" },
  { worker: "qnfo-paper-indexer", pillar: "research", role: "corpus index, versions, citation impact" },
  { worker: "qnfo-paper-reviser", pillar: "research", role: "adversarial revision loop" },
  { worker: "qnfo-gateway", pillar: "reach", role: "qnfo.org and papers.qnfo.org, the home of record" },
  { worker: "qnfo-subscribers", pillar: "reach", role: "the owned audience (double opt-in, digest)" },
  { worker: "qnfo-social", pillar: "reach", role: "distribution of published work inside the cadence caps" },
  { worker: "qnfo-email", pillar: "personal", role: "owner channel: alerts, command verbs, intake" },
  { worker: "personal-api", pillar: "personal", role: "personal twin (calendar, tasks, memory, brief)" },
  { worker: "calendar-api", pillar: "personal", role: "calendar plane and ICS publish" }
];
var CHARTER_TYPE_WEIGHT = { impact: 5, cost: 5, autonomy: 4, security: 4, "research-product": 3, core: 3, observability: 2, governance: 2, web: 2, personal: 2, gate: 1 };
var CHARTER_STATUS_WEIGHT = { broken: 5, violated: 5, "gate-verify": 4, partial: 3, "not-built": 2, open: 2, "local-only": 1, "enforced-partial": 1, "enforced-unverified": 1 };
var CHARTER_HORIZON = { broken: "H0", violated: "H0", "gate-verify": "H0", partial: "H1", "not-built": "H2", open: "H2", "owner-decision": "parked", deferred: "parked", "local-only": "parked", "enforced-partial": "watch", "enforced-unverified": "watch", "enforced-verified": "done", "violated-remediated": "done" };
function charterNum(v) {
  if (v === null || v === void 0) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  var m = String(v).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}
// Parses a metric_registry / impact_thresholds target into {op, val}. Returns null for "maximize", prose or RETIRED.
function charterTarget(t) {
  if (t === null || t === void 0) return null;
  var s = String(t).trim();
  if (!s || /^(maximize|minimize|retired|tbd|n\/a)/i.test(s)) return null;
  // A per-unit rule ("<=144/day each") is a constraint on each worker's cron rate, not a threshold on the
  // registry value (cron_compliance stores a percentage); grading it would read 100% <= 144 as "met".
  if (/\/day each/i.test(s)) return null;
  var m = s.match(/^(<=|>=|<|>|==?)?\s*(all\s+)?\$?(\+)?(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  var op = m[1] || (m[3] ? ">=" : "<=");
  if (op === "=" || op === "==") op = "==";
  return { op: op, val: Number(m[4]) };
}
function charterMeets(value, tgt) {
  if (value === null || !tgt) return null;
  if (tgt.op === "<=") return value <= tgt.val;
  if (tgt.op === ">=") return value >= tgt.val;
  if (tgt.op === "<") return value < tgt.val;
  if (tgt.op === ">") return value > tgt.val;
  return value === tgt.val;
}
function charterPillarOf(worker) {
  for (var i = 0; i < CHARTER_MVP.length; i++) if (CHARTER_MVP[i].worker === worker) return CHARTER_MVP[i].pillar;
  return null;
}
function charterPillarOfMetric(metric) {
  for (var i = 0; i < CHARTER_PILLARS.length; i++) if (CHARTER_PILLARS[i].metrics.indexOf(metric) >= 0) return CHARTER_PILLARS[i].key;
  return null;
}
function charterPillarOfType(type) {
  for (var i = 0; i < CHARTER_PILLARS.length; i++) if (CHARTER_PILLARS[i].types.indexOf(String(type || "")) >= 0) return CHARTER_PILLARS[i].key;
  return "autonomy";
}
function charterRound(x, d) { var p = Math.pow(10, d || 2); return Math.round(x * p) / p; }
// Pure: facts -> the charter's measured state. No I/O.
function charterEvaluate(f, nowIso) {
  f = f || {};
  var now = nowIso || new Date().toISOString();
  var retired = {};
  (f.impact_thresholds || []).forEach(function(r) { if (/^retired/i.test(String(r.target || ""))) retired[r.metric] = true; });
  // 1. metrics: value vs target per pillar
  var metrics = [];
  var byMetric = {};
  (f.metric_registry || []).forEach(function(r) {
    var val = charterNum(r.last_value);
    var tgt = charterTarget(r.target);
    var meets = retired[r.metric] ? null : charterMeets(val, tgt);
    var row = { metric: r.metric, pillar: charterPillarOfMetric(r.metric), value: val, raw: r.last_value, target: r.target, meets: meets, refreshed: r.last_refreshed, retired: !!retired[r.metric] };
    metrics.push(row);
    byMetric[r.metric] = row;
  });
  var pillars = CHARTER_PILLARS.map(function(p) {
    var met = 0, evald = 0, missing = [];
    p.metrics.forEach(function(m) {
      var r = byMetric[m];
      if (!r || r.meets === null) return;
      evald++;
      if (r.meets) met++; else missing.push(m);
    });
    return { key: p.key, name: p.name, objective: p.objective, met: met, evaluated: evald, health: evald ? charterRound(met / evald) : null, missing: missing };
  });
  // 2. MVP component status from the live audit
  var audit = {};
  (f.worker_live_audit || []).forEach(function(r) { audit[r.worker] = r; });
  var mvp = CHARTER_MVP.map(function(c) {
    var a = audit[c.worker];
    var note = a ? String(a.note || "") : "ABSENT";
    var up = note === "SYNC" || note === "CRON_ONLY" || (a && Number(a.http) === 200);
    return { worker: c.worker, pillar: c.pillar, role: c.role, note: note, version: a ? a.live_version : null, up: !!up };
  });
  var mvpUp = mvp.filter(function(c) { return c.up; }).length;
  // 3. budget classes over cap
  var over = (f.fleet_budget || []).filter(function(b) { return charterNum(b.current) !== null && charterNum(b.cap) !== null && charterNum(b.current) > charterNum(b.cap); })
    .map(function(b) { return { node_class: b.node_class, current: charterNum(b.current), cap: charterNum(b.cap), unit: b.unit }; });
  // 4. roadmap by horizon with a priority score
  var roadmap = (f.roadmap || []).map(function(r) {
    var tw = CHARTER_TYPE_WEIGHT[r.artifact_type] || 1, sw = CHARTER_STATUS_WEIGHT[r.status] || 0;
    return { item: r.item, status: r.status, type: r.artifact_type, pillar: charterPillarOfType(r.artifact_type), horizon: CHARTER_HORIZON[r.status] || "watch", score: tw * sw, title: String(r.title || "").slice(0, 110) };
  });
  roadmap.sort(function(a, b) { return b.score - a.score || String(a.item).localeCompare(String(b.item)); });
  var horizons = {};
  roadmap.forEach(function(r) { horizons[r.horizon] = (horizons[r.horizon] || 0) + 1; });
  // 5. issues
  var issues = f.open_issues || [];
  var highIssues = issues.filter(function(i) { return i.priority === "high" || i.priority === "critical"; });
  var secIssues = issues.filter(function(i) { return /^SEC-/.test(String(i.title || "")); });
  // 6. autonomy
  var dims = f.autonomy_scores || [];
  var composite = null;
  dims.forEach(function(d) { if (d.dimension === "overall") composite = charterNum(d.score); });
  var weakDims = dims.filter(function(d) { return charterNum(d.score) !== null && charterNum(d.score) < 3 && d.dimension !== "overall"; });
  var strongDims = dims.filter(function(d) { return charterNum(d.score) !== null && charterNum(d.score) >= 4.5 && d.dimension !== "overall"; });
  // 7. review gate (the 2026-12-31 gate from docs/STRATEGY.md s9, as recorded in impact_thresholds)
  var gate = null;
  (f.impact_thresholds || []).forEach(function(r) { if (r.metric === "review_gate_2026_12_31") gate = { state: r.state, due: r.due, baseline: r.baseline, description: r.description }; });
  // 8. SWOT, measured
  var S = [], W = [], O = [], T = [];
  metrics.forEach(function(m) { if (m.meets === true) S.push(m.metric + " = " + m.raw + " (target " + String(m.target).split("(")[0].trim() + ")"); });
  strongDims.forEach(function(d) { S.push("autonomy " + d.dimension + " " + d.score + "/5"); });
  if (f.guards_total) S.push("guard_registry " + f.guards_verified + "/" + f.guards_total + " guards verified");
  if (mvpUp === mvp.length) S.push("every MVP component serving (" + mvpUp + "/" + mvp.length + ")");
  roadmap.filter(function(r) { return r.status === "enforced-verified"; }).forEach(function(r) { S.push("gate " + r.item + " holds: " + r.title); });
  metrics.forEach(function(m) { if (m.meets === false) W.push(m.metric + " = " + m.raw + " vs target " + String(m.target).split("(")[0].trim()); });
  weakDims.forEach(function(d) { W.push("autonomy " + d.dimension + " " + d.score + "/5: " + String(d.gap || "").slice(0, 90)); });
  over.forEach(function(b) { W.push("fleet_budget " + b.node_class + " " + b.current + " > cap " + b.cap + " " + (b.unit || "")); });
  mvp.filter(function(c) { return !c.up; }).forEach(function(c) { W.push("MVP component " + c.worker + " not serving (" + c.note + ")"); });
  roadmap.filter(function(r) { return r.status === "violated" || r.status === "broken"; }).forEach(function(r) { W.push(r.status + " " + r.item + ": " + r.title); });
  roadmap.filter(function(r) { return (r.horizon === "H1" || r.horizon === "H2") && r.score >= 6; }).slice(0, 12).forEach(function(r) { O.push(r.item + " [" + r.pillar + ", " + r.status + "]: " + r.title); });
  (f.shutdown_manifest || []).forEach(function(r) { if (String(r.state).indexOf("ARMED") === 0) T.push("shutdown_manifest phase " + r.phase + " " + r.component + " ARMED (due " + r.due_date + ")"); });
  if (gate) T.push("review gate 2026-12-31 " + gate.state + ": " + String(gate.baseline || "").slice(0, 120));
  over.filter(function(b) { return /^ai_spend/.test(b.node_class); }).forEach(function(b) { T.push("AI spend " + b.node_class + " $" + b.current + " over cap $" + b.cap); });
  secIssues.forEach(function(i) { T.push("open security issue #" + i.id + " " + String(i.title).slice(0, 80)); });
  if (highIssues.length) T.push(highIssues.length + " open high-priority issues (" + charterTopCats(highIssues) + ")");
  // 9. breaches the charter itself acts on
  var breaches = [];
  mvp.filter(function(c) { return !c.up; }).forEach(function(c) { breaches.push({ key: "CHARTER-MVP-DOWN-1: " + c.worker, severity: "high", text: "MVP component " + c.worker + " (" + c.role + ") is " + c.note + " in worker_live_audit." }); });
  var healthVals = pillars.filter(function(p) { return p.health !== null; }).map(function(p) { return p.health; });
  var health = healthVals.length ? charterRound(healthVals.reduce(function(a, b) { return a + b; }, 0) / healthVals.length) : null;
  return {
    charter_version: CHARTER_VERSION, ts: now, health: health, composite_autonomy: composite,
    pillars: pillars, metrics: metrics, mvp: mvp, mvp_up: mvpUp, budget_over: over,
    roadmap: roadmap, horizons: horizons, open_issues: issues.length, high_issues: highIssues.length, security_issues: secIssues.length,
    review_gate: gate, objectives: f.objectives || [], survival: f.survival || null, shutdown: f.shutdown_manifest || [],
    subscribers_confirmed: f.subscribers_confirmed, proposed_revisions: f.proposed_revisions, deploys_7d: f.deploys_7d, deploy_ok_7d: f.deploy_ok_7d,
    live_workers: f.live_workers, portfolio: f.portfolio || null, swot: { strengths: S, weaknesses: W, opportunities: O, threats: T }, breaches: breaches
  };
}
function charterTopCats(issues) {
  var c = {};
  issues.forEach(function(i) { c[i.category || "?"] = (c[i.category || "?"] || 0) + 1; });
  return Object.keys(c).sort(function(a, b) { return c[b] - c[a]; }).slice(0, 4).map(function(k) { return k + " " + c[k]; }).join(", ");
}
function charterCell(s) { return String(s === null || s === void 0 ? "" : s).replace(/\|/g, "\\|").replace(/\r?\n/g, " "); }
// Pure: measured state -> the markdown block between the CHARTER-LIVE markers.
function charterRender(ev) {
  var L = [];
  L.push(CHARTER_BEGIN);
  L.push("_Generated by qnfo-fleet-control CHARTER-LOOP-1 at " + ev.ts + " (charter " + ev.charter_version + "). Do not edit by hand: the next daily tick overwrites this section. Live JSON: `GET https://qnfo-fleet-control.q08.workers.dev/charter`._");
  L.push("");
  L.push("### Scoreboard");
  L.push("");
  L.push("| Signal | Value |");
  L.push("|---|---|");
  L.push("| Charter health (mean pillar health, metrics meeting target) | " + (ev.health === null ? "n/a" : ev.health) + " |");
  L.push("| Autonomy composite (qnfo-autonomy-scorer) | " + (ev.composite_autonomy === null ? "n/a" : ev.composite_autonomy + " / 5") + " |");
  L.push("| MVP components serving | " + ev.mvp_up + " / " + ev.mvp.length + " |");
  L.push("| Live workers (service_registry) | " + charterCell(ev.live_workers) + " |");
  L.push("| Open agent issues (high) | " + ev.open_issues + " (" + ev.high_issues + ") |");
  L.push("| Canonical deploys last 7d (ok) | " + charterCell(ev.deploys_7d) + " (" + charterCell(ev.deploy_ok_7d) + ") |");
  L.push("| Confirmed subscribers | " + charterCell(ev.subscribers_confirmed) + " |");
  L.push("| Objective revisions awaiting ratification | " + charterCell(ev.proposed_revisions) + " |");
  if (ev.survival) L.push("| Survival state (sai / survival_score) | " + charterCell(ev.survival.sai) + " / " + charterCell(ev.survival.survival_score) + " at " + charterCell(ev.survival.ts) + " |");
  L.push("");
  L.push("### Pillars");
  L.push("");
  L.push("| Pillar | Objective | Metrics met | Health | Missing target |");
  L.push("|---|---|---|---|---|");
  ev.pillars.forEach(function(p) { L.push("| " + p.key + ": " + p.name + " | " + p.objective + " | " + p.met + "/" + p.evaluated + " | " + (p.health === null ? "n/a" : p.health) + " | " + (p.missing.join(", ") || "none") + " |"); });
  L.push("");
  L.push("### MVP (the minimum verified core)");
  L.push("");
  L.push("| Component | Pillar | Role | Live | Version |");
  L.push("|---|---|---|---|---|");
  ev.mvp.forEach(function(c) { L.push("| " + c.worker + " | " + c.pillar + " | " + charterCell(c.role) + " | " + (c.up ? "yes" : "**NO**") + " (" + c.note + ") | " + charterCell(c.version || "") + " |"); });
  L.push("");
  L.push("### SWOT, measured today");
  L.push("");
  var sw = ev.swot;
  function list(title, arr) {
    L.push("**" + title + "**");
    L.push("");
    if (!arr.length) L.push("- none measured");
    arr.slice(0, 14).forEach(function(x) { L.push("- " + charterCell(x)); });
    if (arr.length > 14) L.push("- and " + (arr.length - 14) + " more");
    L.push("");
  }
  list("Strengths", sw.strengths);
  list("Weaknesses", sw.weaknesses);
  list("Opportunities (highest-leverage open roadmap items)", sw.opportunities);
  list("Threats", sw.threats);
  L.push("### Roadmap by horizon (roadmap_implementation)");
  L.push("");
  L.push("| Horizon | Meaning | Items |");
  L.push("|---|---|---|");
  L.push("| H0 | now: broken, violated or awaiting gate verification | " + (ev.horizons.H0 || 0) + " |");
  L.push("| H1 | to the 2026-12-31 review gate: partial builds to finish | " + (ev.horizons.H1 || 0) + " |");
  L.push("| H2 | after the gate: not yet built | " + (ev.horizons.H2 || 0) + " |");
  L.push("| watch | gates enforced but partial or unverified | " + (ev.horizons.watch || 0) + " |");
  L.push("| parked | owner decision, deferred or local-only (a default is in effect) | " + (ev.horizons.parked || 0) + " |");
  L.push("| done | gates enforced and verified, or remediated | " + (ev.horizons.done || 0) + " |");
  L.push("");
  L.push("Top of the queue (priority = pillar weight x status weight):");
  L.push("");
  ev.roadmap.filter(function(r) { return r.horizon === "H0" || r.horizon === "H1" || r.horizon === "H2"; }).slice(0, 15).forEach(function(r) { L.push("- " + r.horizon + " " + r.item + " [" + r.pillar + ", " + r.status + "] " + charterCell(r.title)); });
  L.push("");
  L.push("### Review gate 2026-12-31");
  L.push("");
  if (ev.review_gate) L.push("State **" + ev.review_gate.state + "**. " + charterCell(ev.review_gate.description) + " Baseline: " + charterCell(ev.review_gate.baseline) + ".");
  else L.push("No review_gate_2026_12_31 row in impact_thresholds.");
  L.push("");
  L.push("### Charter breaches");
  L.push("");
  if (!ev.breaches.length) L.push("None. Every MVP component is serving.");
  ev.breaches.forEach(function(b) { L.push("- **" + b.severity + "** " + charterCell(b.key) + ": " + charterCell(b.text)); });
  L.push("");
  L.push("### Portfolio (GitHub organisation QNFO)");
  L.push("");
  if (ev.portfolio) L.push(ev.portfolio.repos + " repositories (" + ev.portfolio.private + " private): platform " + ev.portfolio.platform + ", research " + ev.portfolio.research + ", demo " + ev.portfolio.demo + ", archived " + ev.portfolio.archived + "; synced " + charterCell(ev.portfolio.synced_at) + ". Full register: docs/PORTFOLIO.md and `GET /portfolio`.");
  else L.push("Not synced yet (PORTFOLIO-LOOP-1 runs within an hour of deploy, then daily).");
  L.push("");
  L.push("### Terminal objectives (qnfo-audit.objectives, immutable by the fleet)");
  L.push("");
  ev.objectives.forEach(function(o) { L.push("- **" + o.objective_key + "** v" + o.version + " (" + o.status + ", ratified " + charterCell(o.ratified_on || "n/a") + "): " + charterCell(String(o.statement || "").slice(0, 240)) + (String(o.statement || "").length > 240 ? "..." : "")); });
  L.push(CHARTER_END);
  return L.join("\n");
}
function charterSplice(doc, block) {
  var a = doc.indexOf(CHARTER_BEGIN), b = doc.indexOf(CHARTER_END);
  if (a < 0 || b < 0 || b < a) return null;
  return doc.slice(0, a) + block + doc.slice(b + CHARTER_END.length);
}
async function charterSchema(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS charter_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, charter_version TEXT, worker_version TEXT, health REAL, mvp_up INTEGER, breaches INTEGER, state_json TEXT, rendered_sha TEXT, commit_sha TEXT, commit_note TEXT)").run();
}
async function charterRows(env, sql) {
  try { var r = await env.AUDIT.prepare(sql).all(); return (r && r.results) || []; } catch (e) { return []; }
}
async function charterOne(env, sql) {
  try { return await env.AUDIT.prepare(sql).first(); } catch (e) { return null; }
}
async function charterFacts(env) {
  var f = {};
  f.objectives = await charterRows(env, "SELECT objective_key, statement, version, status, ratified_on FROM objectives WHERE status='ACTIVE' ORDER BY id");
  f.metric_registry = await charterRows(env, "SELECT metric, layer, kind, last_value, last_refreshed, target, state FROM metric_registry");
  f.impact_thresholds = await charterRows(env, "SELECT metric, description, baseline, target, due, state FROM impact_thresholds");
  f.fleet_budget = await charterRows(env, "SELECT node_class, cap, target, current, unit FROM fleet_budget");
  f.survival = await charterOne(env, "SELECT ts, sai, survival_score, graded_score FROM survival_state WHERE id=1");
  f.shutdown_manifest = await charterRows(env, "SELECT phase, component, state, due_date, substr(condition,1,160) AS condition FROM shutdown_manifest ORDER BY phase, id");
  f.autonomy_scores = await charterRows(env, "SELECT dimension, framework, score, scored_at, substr(gap,1,120) AS gap FROM autonomy_scores");
  f.roadmap = await charterRows(env, "SELECT item, status, artifact_type, substr(title,1,120) AS title FROM roadmap_implementation ORDER BY id LIMIT 500");
  f.open_issues = await charterRows(env, "SELECT id, substr(title,1,140) AS title, priority, category, source FROM agent_issues WHERE status='open' ORDER BY id DESC LIMIT 400");
  f.worker_live_audit = await charterRows(env, "SELECT worker, note, live_version, http, probed_at FROM worker_live_audit");
  var g = await charterOne(env, "SELECT COUNT(*) AS n, SUM(CASE WHEN status='verified' THEN 1 ELSE 0 END) AS v FROM guard_registry");
  f.guards_total = g ? Number(g.n || 0) : 0;
  f.guards_verified = g ? Number(g.v || 0) : 0;
  var s = await charterOne(env, "SELECT COUNT(*) AS n FROM subscribers WHERE confirmed_at IS NOT NULL OR status='confirmed'");
  f.subscribers_confirmed = s ? Number(s.n || 0) : null;
  var pr = await charterOne(env, "SELECT COUNT(*) AS n FROM goals WHERE goal_type='objective-revision' AND status='proposed'");
  f.proposed_revisions = pr ? Number(pr.n || 0) : null;
  var d = await charterOne(env, "SELECT COUNT(*) AS n, SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS ok FROM fleet_deploys WHERE ts > datetime('now','-7 days')");
  f.deploys_7d = d ? Number(d.n || 0) : null;
  f.deploy_ok_7d = d ? Number(d.ok || 0) : null;
  var lw = await charterOne(env, "SELECT COUNT(*) AS n FROM service_registry WHERE state='live'");
  var pf = await charterOne(env, "SELECT COUNT(*) AS n, SUM(CASE WHEN visibility='private' THEN 1 ELSE 0 END) AS priv, SUM(CASE WHEN tier='archived' THEN 1 ELSE 0 END) AS archived, SUM(CASE WHEN tier='research' THEN 1 ELSE 0 END) AS research, SUM(CASE WHEN tier='platform' THEN 1 ELSE 0 END) AS platform, SUM(CASE WHEN tier='demo' THEN 1 ELSE 0 END) AS demo, MAX(synced_at) AS synced_at FROM portfolio_repos WHERE seen=1");
  f.portfolio = pf && Number(pf.n || 0) > 0 ? { repos: Number(pf.n), private: Number(pf.priv || 0), archived: Number(pf.archived || 0), research: Number(pf.research || 0), platform: Number(pf.platform || 0), demo: Number(pf.demo || 0), synced_at: pf.synced_at } : null;
  f.live_workers = lw ? Number(lw.n || 0) : null;
  return f;
}
async function charterBreaches(env, ev) {
  var filed = 0, closed = 0, nowMs = Date.now();
  var openRows = await charterRows(env, "SELECT id, title FROM agent_issues WHERE status='open' AND title LIKE 'CHARTER-MVP-DOWN-1: %'");
  var openByTitle = {};
  openRows.forEach(function(r) { openByTitle[r.title] = r.id; });
  for (var i = 0; i < ev.breaches.length; i++) {
    var b = ev.breaches[i];
    if (openByTitle[b.key]) continue;
    try {
      await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, 'charter-loop', 'reliability', ?3, 'open', ?4, ?4)")
        .bind(b.key, "AUTO-FILED by qnfo-fleet-control CHARTER-LOOP-1 (docs/QUNIVERSE-CHARTER.md, MVP section). " + b.text + " DoD: worker_live_audit note SYNC or CRON_ONLY on two consecutive daily ticks; the loop closes this issue itself with close_evidence.", b.severity, nowMs).run();
      filed++;
    } catch (e) {}
  }
  var want = {};
  ev.breaches.forEach(function(b) { want[b.key] = true; });
  for (var t in openByTitle) {
    if (want[t]) continue;
    var id = openByTitle[t];
    try {
      await env.AUDIT.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?1, 'CHARTER-LOOP-1', 'closed', 'qnfo-fleet-control', datetime('now'), ?2) ON CONFLICT(issue_id) DO UPDATE SET close_evidence=excluded.close_evidence, triage_state='closed'")
        .bind(id, "CHARTER-LOOP-1 " + ev.ts + ": component serving again in worker_live_audit (live probe), charter snapshot mvp_up=" + ev.mvp_up + "/" + ev.mvp.length).run();
      await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?2 WHERE id=?1").bind(id, nowMs).run();
      closed++;
    } catch (e) {}
  }
  return { filed: filed, closed: closed };
}
async function charterCommit(env, block, day, force) {
  if (!env.GITHUB_TOKEN) return { status: "no-token", note: "GITHUB_TOKEN missing; snapshot only" };
  var last = await charterOne(env, "SELECT substr(ts,1,10) AS day FROM charter_snapshots WHERE commit_sha IS NOT NULL ORDER BY id DESC LIMIT 1");
  if (!force && last && last.day === day) return { status: "already-today", note: "committed earlier today" };
  var hdr = { "Authorization": "Bearer " + env.GITHUB_TOKEN, "User-Agent": "qnfo-fleet-control/charter", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  var gr = await timedFetch("https://api.github.com/repos/" + CHARTER_REPO + "/contents/" + CHARTER_DOC_PATH + "?ref=main", { headers: hdr }, 12e3);
  if (gr.status !== 200) return { status: "read-failed", note: "GET contents HTTP " + gr.status };
  var gj = await gr.json().catch(function() { return null; });
  if (!gj || !gj.content || !gj.sha) return { status: "read-failed", note: "contents response unreadable" };
  var doc;
  try { doc = new TextDecoder().decode(Uint8Array.from(atob(String(gj.content).replace(/\s+/g, "")), function(c) { return c.charCodeAt(0); })); } catch (e) { return { status: "read-failed", note: "base64 decode failed" }; }
  var next = charterSplice(doc, block);
  if (next === null) return { status: "markers-missing", note: "doc lacks CHARTER-LIVE markers; refusing to write" };
  if (next === doc) return { status: "unchanged", note: "rendered block identical to main", doc: next };
  var body = { message: "chore(charter): CHARTER-LOOP-1 refresh " + day + " [skip ci]", content: b64encode(next), sha: gj.sha, branch: "main" };
  var pr = await timedFetch("https://api.github.com/repos/" + CHARTER_REPO + "/contents/" + CHARTER_DOC_PATH, { method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, hdr), body: JSON.stringify(body) }, 15e3);
  var pj = pr.status === 200 || pr.status === 201 ? await pr.json().catch(function() { return null; }) : null;
  if (!pj || !pj.commit || !pj.commit.sha) return { status: "write-failed", note: "PUT contents HTTP " + pr.status };
  return { status: "committed", sha: pj.commit.sha, note: "docs/QUNIVERSE-CHARTER.md refreshed on main", doc: next };
}
// The full document for the mirror: the one charterCommit just read or wrote; otherwise (no token, already committed
// today, GitHub API failure) the public raw file with today's block spliced in. Returns null when neither is readable.
async function charterFullDoc(commit, block) {
  if (commit && commit.doc) return commit.doc;
  try {
    var r = await timedFetch("https://raw.githubusercontent.com/" + CHARTER_REPO + "/main/" + CHARTER_DOC_PATH + "?cb=" + Math.floor(Date.now() / 3e5), { headers: { "User-Agent": "qnfo-fleet-control/charter" } }, 12e3);
    if (!r.ok) return null;
    var t = await r.text();
    return charterSplice(t, block);
  } catch (e) { return null; }
}
async function charterMirror(env, doc, ev, sha) {
  if (!env.CANONICAL) return { status: "no-binding", note: "CANONICAL R2 binding missing" };
  if (!doc) return { status: "no-doc", note: "full charter unreadable this tick; previous mirror kept" };
  if (doc.indexOf(CHARTER_BEGIN) < 0 || doc.indexOf(CHARTER_END) < 0) return { status: "markers-missing", note: "refusing to mirror a document without CHARTER-LIVE markers" };
  try {
    await env.CANONICAL.put(CHARTER_MIRROR_KEY, doc, { httpMetadata: { contentType: "text/markdown; charset=utf-8" }, customMetadata: { ts: ev.ts, charter_version: CHARTER_VERSION, worker_version: VERSION, rendered_sha: sha } });
    var back = await env.CANONICAL.head(CHARTER_MIRROR_KEY);
    if (!back || back.size < 1) return { status: "write-unverified", note: "put returned but head found no object" };
    return { status: "mirrored", bytes: back.size, key: "r2:qnfo-canonical/" + CHARTER_MIRROR_KEY };
  } catch (e) { return { status: "write-failed", note: String(e && e.message || e).slice(0, 120) }; }
}
async function charterTick(env, force) {
  var t0 = Date.now();
  await charterSchema(env);
  var facts = await charterFacts(env);
  var ev = charterEvaluate(facts, new Date().toISOString());
  var block = charterRender(ev);
  var sha = await sha256(block);
  var br = await charterBreaches(env, ev);
  var day = ev.ts.slice(0, 10);
  var commit;
  try { commit = await charterCommit(env, block, day, !!force); } catch (e) { commit = { status: "write-failed", note: String(e && e.message || e).slice(0, 120) }; }
  var mirror = await charterMirror(env, await charterFullDoc(commit, block), ev, sha);
  delete commit.doc;
  try {
    await env.AUDIT.prepare("INSERT INTO charter_snapshots (ts, charter_version, worker_version, health, mvp_up, breaches, state_json, rendered_sha, commit_sha, commit_note) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)")
      .bind(ev.ts, CHARTER_VERSION, VERSION, ev.health, ev.mvp_up, ev.breaches.length, JSON.stringify(ev).slice(0, 180000), sha, commit.sha || null, (commit.status + ": " + commit.note + "; mirror " + mirror.status).slice(0, 200)).run();
    await env.AUDIT.prepare("DELETE FROM charter_snapshots WHERE id NOT IN (SELECT id FROM charter_snapshots ORDER BY id DESC LIMIT 400)").run();
  } catch (e) {}
  return { ok: true, ts: ev.ts, health: ev.health, mvp_up: ev.mvp_up + "/" + ev.mvp.length, breaches: ev.breaches.length, issues: br, commit: commit, mirror: mirror, rendered_sha: sha, ms: Date.now() - t0 };
}
async function charterLatest(env) {
  await charterSchema(env);
  var row = await charterOne(env, "SELECT id, ts, charter_version, worker_version, health, mvp_up, breaches, state_json, rendered_sha, commit_sha, commit_note FROM charter_snapshots ORDER BY id DESC LIMIT 1");
  if (!row) return null;
  var state = null;
  try { state = JSON.parse(row.state_json); } catch (e) {}
  return { id: row.id, ts: row.ts, charter_version: row.charter_version, worker_version: row.worker_version, health: row.health, mvp_up: row.mvp_up, breaches: row.breaches, rendered_sha: row.rendered_sha, commit_sha: row.commit_sha, commit_note: row.commit_note, state: state };
}
// ---- CHARTER-LOOP-1:END ----
// ---- PORTFOLIO-LOOP-1:BEGIN (2026-10-01, QNFO-PORTFOLIO-1) ----
// The QNFO GitHub organisation (122 repositories on 2026-10-01: 42 active, 74 archived, 11 forks, 10 private) is
// the public face of the portfolio, and it had three stale, hand-made inventories (QNFO/.github PORTFOLIO.md from a
// 2026-08-13 KG snapshot, qnfo-audit.repo_inventory from July, and a WBS table in the org profile README) that
// agreed with neither each other nor the live org. Owner directive (2026-10-01): check every QNFO repository and
// unify, consolidate and link all resources as one portfolio, maintained without further involvement.
//
// This block makes the portfolio a measured register, the same way CHARTER-LOOP-1 made the charter one:
//   sync     = GET /orgs/QNFO/repos (all visibilities, paginated) with the kernel's GITHUB_TOKEN; every repository
//              becomes a portfolio_repos row (tier, charter pillar, WBS codes from portfolio-state.program_registry,
//              hygiene flags). Rows that vanish from the org are kept with seen=0, never deleted.
//   evaluate = pure: tiers, pillar counts, hygiene score, dormant repositories, research repositories with no WBS
//              code, archive candidates. Private repositories are counted but never named in a public render.
//   render   = three generated surfaces, all from the same evaluation:
//                docs/PORTFOLIO.md in QNFO/qnfo-workers (the policy half is hand-written, the live half is spliced
//                between the PORTFOLIO-LIVE markers), QNFO/.github/PORTFOLIO.md (fully generated public mirror,
//                replacing the 2026-08-13 snapshot), and a marker block in QNFO/.github/profile/README.md (the org
//                landing page; inserted once before the "## Research Portfolio" heading when the markers are absent).
//   commit   = GitHub Contents API, only when the rendered text changed, direct to main like qnfo-cloud-ops's
//              PORTFOLIO-STATUS.md writer. A failed fetch writes nothing (fail closed on the source of truth).
// Cadence: once per UTC day, run from the hourly cron when the last successful sync is older than 20h, so a fresh
// deploy syncs within the hour instead of waiting for 03:00. GET /portfolio and /portfolio.md serve the register.
var PF_ORG = "QNFO";
var PF_PROFILE_REPO = "QNFO/.github";
var PF_WORKERS_REPO = "QNFO/qnfo-workers";
var PF_DOC_PATH = "docs/PORTFOLIO.md";
var PF_BEGIN = "<!-- PORTFOLIO-LIVE:BEGIN -->";
var PF_END = "<!-- PORTFOLIO-LIVE:END -->";
var PF_README_ANCHOR = "## Research Portfolio";
var PF_DORMANT_DAYS = 120;
var PF_STALE_H = 20;
var PF_PLATFORM = ["qnfo-workers", "qnfo-ops", "qnfo-skills", "qnfo-schemas", "infrastructure", "qnfo-infra", "qnfo-releases", "qnfo-model-router", "qnfo-errata-pipeline", "qnfo-setup-bootstrap", "qnfo-fleet-issues", "qwav-platform", "personal-life-workers", "qnfo-ensemble-research"];
var PF_GOVERNANCE = [".github", "license", "gitbook"];
var PF_CLIENT = ["deepchat", ".deepchat", "qnfo-config-backup"];
var PF_TIER_PILLAR = { platform: "core", governance: "autonomy", "client-config": "personal", research: "research", demo: "reach", fork: "core", archived: "research" };
var PF_TIER_ORDER = ["platform", "governance", "research", "demo", "client-config", "fork", "archived"];
var PF_TIER_TEXT = {
  platform: "the fleet, its tooling and infrastructure (charter pillar core)",
  governance: "organisation profile, licence and documentation (pillar autonomy)",
  research: "active research programs and papers (pillar research)",
  demo: "interactive demonstrations and sites (pillar reach)",
  "client-config": "private client configuration and backups (pillar personal; never public)",
  fork: "forks of upstream tooling kept for reference (pillar core)",
  archived: "completed or superseded work, read-only (pillar research)"
};
function pfTier(r) {
  if (r.archived) return "archived";
  if (r.fork) return "fork";
  if (PF_PLATFORM.indexOf(r.name) >= 0) return "platform";
  if (PF_GOVERNANCE.indexOf(r.name) >= 0) return "governance";
  if (PF_CLIENT.indexOf(r.name) >= 0) return "client-config";
  if (/^qwav-demo/.test(r.name) || r.name === "qwav-demos") return "demo";
  return "research";
}
function pfDays(iso, nowMs) {
  var t = Date.parse(iso || "");
  return isNaN(t) ? null : Math.floor((nowMs - t) / 86400000);
}
function pfHygiene(r, tier, nowMs) {
  var flags = [];
  if (tier === "archived" || tier === "fork") return flags;
  if (!r.description) flags.push("no-description");
  if (!r.license || r.license === "NOASSERTION" && tier !== "governance") flags.push("no-license");
  if (!r.topics || !r.topics.length) flags.push("no-topics");
  var d = pfDays(r.pushed_at, nowMs);
  if (d !== null && d > PF_DORMANT_DAYS) flags.push("dormant-" + d + "d");
  return flags;
}
// Pure: org repositories + WBS rows -> the portfolio's measured state. No I/O.
function pfEvaluate(repos, wbsRows, nowIso) {
  var nowMs = Date.parse(nowIso || new Date().toISOString());
  var wbsByRepo = {};
  (wbsRows || []).forEach(function(w) {
    var key = String(w.github_repo || "").replace(/^QNFO\//, "");
    if (!key) return;
    (wbsByRepo[key] = wbsByRepo[key] || []).push({ wbs: w.wbs_code, level: w.level, status: w.status, name: w.name });
  });
  var rows = (repos || []).map(function(r) {
    var tier = pfTier(r);
    var isPrivate = r.visibility === "private" || r.private === true;
    return {
      name: r.name, tier: tier, pillar: PF_TIER_PILLAR[tier] || "research", visibility: isPrivate ? "private" : "public",
      archived: !!r.archived, fork: !!r.fork, description: r.description || "", license: r.license || null, topics: r.topics || [],
      homepage: r.homepage || null, language: r.language || null, pushed_at: r.pushed_at || null, has_pages: !!r.has_pages,
      open_issues: Number(r.open_issues_count || r.open_issues || 0), stars: Number(r.stargazers_count || r.stars || 0),
      wbs: (wbsByRepo[r.name] || []).map(function(w) { return w.wbs; }), flags: pfHygiene(r, tier, nowMs), days_since_push: pfDays(r.pushed_at, nowMs)
    };
  });
  rows.sort(function(a, b) { return PF_TIER_ORDER.indexOf(a.tier) - PF_TIER_ORDER.indexOf(b.tier) || String(b.pushed_at || "").localeCompare(String(a.pushed_at || "")); });
  var tiers = {}, pillars = {}, priv = 0;
  rows.forEach(function(r) { tiers[r.tier] = (tiers[r.tier] || 0) + 1; pillars[r.pillar] = (pillars[r.pillar] || 0) + 1; if (r.visibility === "private") priv++; });
  var graded = rows.filter(function(r) { return r.tier !== "archived" && r.tier !== "fork" && r.tier !== "client-config"; });
  var clean = graded.filter(function(r) { return r.flags.filter(function(f) { return f.indexOf("dormant") !== 0; }).length === 0; }).length;
  var dormant = graded.filter(function(r) { return r.flags.some(function(f) { return f.indexOf("dormant") === 0; }); });
  var unlinked = rows.filter(function(r) { return r.tier === "research" && !r.wbs.length; });
  var candidates = dormant.filter(function(r) { return r.tier === "research" && !r.wbs.length; });
  var linkedWbs = {};
  rows.forEach(function(r) { r.wbs.forEach(function(w) { linkedWbs[w] = true; }); });
  return {
    ts: nowIso || new Date().toISOString(), total: rows.length, private_count: priv, tiers: tiers, pillars: pillars, rows: rows,
    graded: graded.length, hygiene_score: graded.length ? Math.round(100 * clean / graded.length) / 100 : null,
    dormant: dormant.map(function(r) { return r.name; }), unlinked_research: unlinked.map(function(r) { return r.name; }),
    archive_candidates: candidates.map(function(r) { return r.name; }), wbs_linked: Object.keys(linkedWbs).length, wbs_total: (wbsRows || []).length
  };
}
function pfCell(s) { return String(s === null || s === void 0 ? "" : s).replace(/\|/g, "\\|").replace(/\r?\n/g, " "); }
function pfTierTable(ev) {
  var L = ["| Tier | Meaning | Repositories |", "|---|---|---|"];
  PF_TIER_ORDER.forEach(function(t) { L.push("| " + t + " | " + PF_TIER_TEXT[t] + " | " + (ev.tiers[t] || 0) + " |"); });
  L.push("| **all** | " + ev.private_count + " private (counted, never listed) | **" + ev.total + "** |");
  return L;
}
function pfRepoRows(ev, tier) {
  return ev.rows.filter(function(r) { return r.tier === tier && r.visibility === "public"; }).map(function(r) {
    var link = "[" + r.name + "](https://github.com/" + PF_ORG + "/" + r.name + ")" + (r.homepage ? " ([site](" + r.homepage + "))" : "");
    return "| " + link + " | " + pfCell(r.description.slice(0, 110)) + " | " + (r.wbs.join(", ") || "-") + " | " + (r.pushed_at ? r.pushed_at.slice(0, 10) : "-") + " | " + (r.flags.join(", ") || "ok") + " |";
  });
}
// The live half of docs/PORTFOLIO.md (QNFO/qnfo-workers) and the whole of QNFO/.github/PORTFOLIO.md share one body.
function pfRenderBody(ev) {
  var L = [];
  L.push("### Scoreboard");
  L.push("");
  L.push("| Signal | Value |");
  L.push("|---|---|");
  L.push("| Repositories in the organisation | " + ev.total + " (" + ev.private_count + " private) |");
  L.push("| Active, graded repositories (platform, governance, research, demo) | " + ev.graded + " |");
  L.push("| Hygiene score (description, licence and topics all present) | " + (ev.hygiene_score === null ? "n/a" : ev.hygiene_score) + " |");
  L.push("| Dormant graded repositories (no push for " + PF_DORMANT_DAYS + "+ days) | " + ev.dormant.length + " |");
  L.push("| Research repositories with no WBS program code | " + ev.unlinked_research.length + " |");
  L.push("| WBS codes linked to a repository | " + ev.wbs_linked + " of " + ev.wbs_total + " with a github_repo |");
  L.push("");
  L.push("### Tiers");
  L.push("");
  L = L.concat(pfTierTable(ev));
  L.push("");
  ["platform", "governance", "research", "demo"].forEach(function(t) {
    L.push("### " + t.charAt(0).toUpperCase() + t.slice(1) + ": " + PF_TIER_TEXT[t]);
    L.push("");
    L.push("| Repository | Description | WBS | Last push | Hygiene |");
    L.push("|---|---|---|---|---|");
    var rows = pfRepoRows(ev, t);
    if (!rows.length) L.push("| none | | | | |");
    L = L.concat(rows);
    L.push("");
  });
  L.push("### Forks kept for reference");
  L.push("");
  L.push(ev.rows.filter(function(r) { return r.tier === "fork" && r.visibility === "public"; }).map(function(r) { return "[" + r.name + "](https://github.com/" + PF_ORG + "/" + r.name + ")"; }).join(", ") || "none");
  L.push("");
  L.push("### Archived (read-only)");
  L.push("");
  L.push(ev.rows.filter(function(r) { return r.tier === "archived" && r.visibility === "public"; }).map(function(r) { return "[" + r.name + "](https://github.com/" + PF_ORG + "/" + r.name + ")"; }).join(", ") || "none");
  L.push("");
  L.push("### Portfolio actions the loop proposes (it never archives or deletes on its own)");
  L.push("");
  if (ev.archive_candidates.length) L.push("- Archive candidates (research tier, dormant, no WBS code): " + ev.archive_candidates.join(", "));
  if (ev.unlinked_research.length) L.push("- Research repositories to register in portfolio-state.program_registry: " + ev.unlinked_research.join(", "));
  var hyg = ev.rows.filter(function(r) { return r.visibility === "public" && r.flags.some(function(f) { return f.indexOf("dormant") !== 0; }); });
  if (hyg.length) L.push("- Hygiene (description, licence, topics) to fix: " + hyg.map(function(r) { return r.name + " (" + r.flags.filter(function(f) { return f.indexOf("dormant") !== 0; }).join(", ") + ")"; }).join("; "));
  if (!ev.archive_candidates.length && !ev.unlinked_research.length && !hyg.length) L.push("- none");
  return L;
}
function pfRenderDocBlock(ev) {
  var L = [PF_BEGIN];
  L.push("_Generated by qnfo-fleet-control PORTFOLIO-LOOP-1 at " + ev.ts + " from the live GitHub organisation and portfolio-state.program_registry. Do not edit by hand. Live JSON: `GET https://qnfo-fleet-control.q08.workers.dev/portfolio`._");
  L.push("");
  L = L.concat(pfRenderBody(ev));
  L.push(PF_END);
  return L.join("\n");
}
function pfRenderPublic(ev) {
  var L = ["# QNFO portfolio (public mirror)", ""];
  L.push("Every repository in the [QNFO organisation](https://github.com/" + PF_ORG + "), classified and linked. Generated by the fleet's governance kernel (qnfo-fleet-control, PORTFOLIO-LOOP-1) at " + ev.ts + "; it is regenerated daily from the live organisation and the program registry, so edits here are overwritten.");
  L.push("");
  L.push("- Portfolio policy and tiers: [docs/PORTFOLIO.md](https://github.com/" + PF_WORKERS_REPO + "/blob/main/docs/PORTFOLIO.md)");
  L.push("- The system charter: [docs/QUNIVERSE-CHARTER.md](https://github.com/" + PF_WORKERS_REPO + "/blob/main/docs/QUNIVERSE-CHARTER.md)");
  L.push("- Publications: [papers.qnfo.org](https://papers.qnfo.org/papers) · Home: [qnfo.org](https://qnfo.org) · Fleet status: [fleet.qnfo.org](https://fleet.qnfo.org)");
  L.push("- Live JSON: `GET https://qnfo-fleet-control.q08.workers.dev/portfolio`");
  L.push("");
  L = L.concat(pfRenderBody(ev));
  L.push("");
  return L.join("\n");
}
function pfRenderReadmeBlock(ev) {
  var L = [PF_BEGIN];
  L.push("_Portfolio index, generated daily by the fleet (PORTFOLIO-LOOP-1, " + ev.ts.slice(0, 10) + "). Full inventory: [PORTFOLIO.md](PORTFOLIO.md). Policy and charter: [qnfo-workers/docs](https://github.com/" + PF_WORKERS_REPO + "/tree/main/docs)._");
  L.push("");
  L = L.concat(pfTierTable(ev));
  L.push("");
  L.push("Active research programs with a repository: " + ev.rows.filter(function(r) { return r.tier === "research" && r.visibility === "public"; }).map(function(r) { return "[" + r.name + "](https://github.com/" + PF_ORG + "/" + r.name + ")"; }).join(", ") + ".");
  L.push("");
  L.push(PF_END);
  return L.join("\n");
}
function pfSplice(doc, block) {
  var a = doc.indexOf(PF_BEGIN), b = doc.indexOf(PF_END);
  if (a < 0 || b < 0 || b < a) return null;
  return doc.slice(0, a) + block + doc.slice(b + PF_END.length);
}
// The org README had no markers before this loop existed: insert the block once, just above the anchor heading.
function pfSpliceOrBootstrap(doc, block) {
  var s = pfSplice(doc, block);
  if (s !== null) return s;
  var i = doc.indexOf("\n" + PF_README_ANCHOR);
  if (i < 0) return null;
  return doc.slice(0, i + 1) + block + "\n\n" + doc.slice(i + 1);
}
async function pfSchema(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS portfolio_repos (name TEXT PRIMARY KEY, full_name TEXT, tier TEXT, pillar TEXT, visibility TEXT, archived INTEGER, fork INTEGER, description TEXT, license TEXT, topics TEXT, homepage TEXT, language TEXT, pushed_at TEXT, created_at TEXT, has_pages INTEGER, open_issues INTEGER, stars INTEGER, wbs TEXT, flags TEXT, seen INTEGER DEFAULT 1, synced_at TEXT)").run();
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS portfolio_sync_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, repos INTEGER, hygiene REAL, status TEXT, note TEXT, writes TEXT)").run();
}
function pfGh(env) {
  return { "Authorization": "Bearer " + env.GITHUB_TOKEN, "User-Agent": "qnfo-fleet-control/portfolio", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
}
async function pfFetchOrg(env) {
  var out = [];
  for (var page = 1; page <= 5; page++) {
    var r = await timedFetch("https://api.github.com/orgs/" + PF_ORG + "/repos?per_page=100&type=all&sort=full_name&page=" + page, { headers: pfGh(env) }, 15e3);
    if (r.status !== 200) return { ok: false, note: "orgs/repos page " + page + " HTTP " + r.status, repos: out };
    var j = await r.json().catch(function() { return null; });
    if (!Array.isArray(j)) return { ok: false, note: "orgs/repos page " + page + " unreadable", repos: out };
    j.forEach(function(x) {
      out.push({ name: x.name, description: x.description, visibility: x.visibility || (x.private ? "private" : "public"), private: !!x.private, archived: !!x.archived, fork: !!x.fork, pushed_at: x.pushed_at, created_at: x.created_at, topics: x.topics || [], license: x.license && x.license.spdx_id || null, homepage: x.homepage || null, language: x.language || null, has_pages: !!x.has_pages, open_issues_count: x.open_issues_count || 0, stargazers_count: x.stargazers_count || 0 });
    });
    if (j.length < 100) break;
  }
  return { ok: out.length > 0, note: out.length ? "ok" : "empty listing", repos: out };
}
async function pfWbs(env) {
  if (!env.PORTFOLIO) return { ok: false, rows: [], note: "no PORTFOLIO (portfolio-state) binding" };
  try {
    var r = await env.PORTFOLIO.prepare("SELECT wbs_code, level, name, status, github_repo FROM program_registry WHERE github_repo IS NOT NULL AND github_repo <> ''").all();
    return { ok: true, rows: (r && r.results) || [], note: "ok" };
  } catch (e) { return { ok: false, rows: [], note: "program_registry read failed: " + String(e && e.message || e).slice(0, 80) }; }
}
async function pfUpsert(env, ev) {
  var now = ev.ts, stmts = [];
  ev.rows.forEach(function(r) {
    stmts.push(env.AUDIT.prepare("INSERT INTO portfolio_repos (name, full_name, tier, pillar, visibility, archived, fork, description, license, topics, homepage, language, pushed_at, created_at, has_pages, open_issues, stars, wbs, flags, seen, synced_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,1,?20) ON CONFLICT(name) DO UPDATE SET full_name=excluded.full_name, tier=excluded.tier, pillar=excluded.pillar, visibility=excluded.visibility, archived=excluded.archived, fork=excluded.fork, description=excluded.description, license=excluded.license, topics=excluded.topics, homepage=excluded.homepage, language=excluded.language, pushed_at=excluded.pushed_at, created_at=excluded.created_at, has_pages=excluded.has_pages, open_issues=excluded.open_issues, stars=excluded.stars, wbs=excluded.wbs, flags=excluded.flags, seen=1, synced_at=excluded.synced_at")
      .bind(r.name, PF_ORG + "/" + r.name, r.tier, r.pillar, r.visibility, r.archived ? 1 : 0, r.fork ? 1 : 0, r.description.slice(0, 400), r.license, JSON.stringify(r.topics), r.homepage, r.language, r.pushed_at, null, r.has_pages ? 1 : 0, r.open_issues, r.stars, r.wbs.join(","), r.flags.join(","), now));
  });
  for (var i = 0; i < stmts.length; i += 40) await env.AUDIT.batch(stmts.slice(i, i + 40));
  await env.AUDIT.prepare("UPDATE portfolio_repos SET seen=0 WHERE synced_at IS NULL OR synced_at <> ?1").bind(now).run();
}
// DEFAULT-BRANCH-1 (first live sync, 2026-10-01 12:00Z): QNFO/.github's default branch is `master`, not `main`. Writing
// to a hard-coded `main` landed the mirror on a stale side branch and read a profile README without the anchor
// ("anchor-missing"), so the organisation landing page never changed. Resolve each repository's default branch once
// per sync and write there; the organisation profile is rendered from the default branch only.
var pfBranchCache = {};
async function pfDefaultBranch(env, repo) {
  if (pfBranchCache[repo]) return pfBranchCache[repo];
  var r = await timedFetch("https://api.github.com/repos/" + repo, { headers: pfGh(env) }, 12e3);
  var j = r.status === 200 ? await r.json().catch(function() { return null; }) : null;
  var b = j && j.default_branch ? String(j.default_branch) : "main";
  pfBranchCache[repo] = b;
  return b;
}
async function pfCommit(env, repo, path, content, message, mode) {
  var hdr = pfGh(env);
  var enc = path.split("/").map(encodeURIComponent).join("/");
  var branch = await pfDefaultBranch(env, repo);
  var gr = await timedFetch("https://api.github.com/repos/" + repo + "/contents/" + enc + "?ref=" + encodeURIComponent(branch), { headers: hdr }, 12e3);
  var sha = null, cur = "";
  if (gr.status === 200) {
    var gj = await gr.json().catch(function() { return null; });
    if (gj && gj.sha) sha = gj.sha;
    try { cur = gj && gj.content ? new TextDecoder().decode(Uint8Array.from(atob(String(gj.content).replace(/\s+/g, "")), function(c) { return c.charCodeAt(0); })) : ""; } catch (e) { cur = ""; }
  } else if (gr.status !== 404) return { path: repo + "/" + path, status: "read-failed", note: "HTTP " + gr.status };
  var next;
  if (mode === "splice") { next = pfSplice(cur, content); if (next === null) return { path: repo + "/" + path, status: "markers-missing" }; }
  else if (mode === "bootstrap") { next = pfSpliceOrBootstrap(cur, content); if (next === null) return { path: repo + "/" + path, status: "anchor-missing" }; }
  else next = content;
  if (next === cur) return { path: repo + "/" + path, status: "unchanged" };
  var body = { message: message, content: b64encode(next), branch: branch };
  if (sha) body.sha = sha;
  var pr = await timedFetch("https://api.github.com/repos/" + repo + "/contents/" + enc, { method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, hdr), body: JSON.stringify(body) }, 15e3);
  var pj = pr.status === 200 || pr.status === 201 ? await pr.json().catch(function() { return null; }) : null;
  if (!pj || !pj.commit || !pj.commit.sha) return { path: repo + "/" + path, status: "write-failed", note: "PUT HTTP " + pr.status + " on " + branch };
  return { path: repo + "/" + path, status: "committed", sha: pj.commit.sha, branch: branch };
}
async function portfolioSync(env, force) {
  var t0 = Date.now();
  await pfSchema(env);
  if (!env.GITHUB_TOKEN) return { ok: false, status: "no-token" };
  pfBranchCache = {};
  var org = await pfFetchOrg(env);
  if (!org.ok) {
    try { await env.AUDIT.prepare("INSERT INTO portfolio_sync_runs (ts, repos, hygiene, status, note, writes) VALUES (?1, ?2, NULL, 'fetch-failed', ?3, '[]')").bind(new Date().toISOString(), org.repos.length, org.note).run(); } catch (e) {}
    return { ok: false, status: "fetch-failed", note: org.note };
  }
  var wbs = await pfWbs(env);
  var ev = pfEvaluate(org.repos, wbs.rows, new Date().toISOString());
  await pfUpsert(env, ev);
  var day = ev.ts.slice(0, 10), msg = "chore(portfolio): PORTFOLIO-LOOP-1 sync " + day + " [skip ci]";
  var writes = [];
  var targets = [
    [PF_WORKERS_REPO, PF_DOC_PATH, pfRenderDocBlock(ev), "splice"],
    [PF_PROFILE_REPO, "PORTFOLIO.md", pfRenderPublic(ev), "replace"],
    [PF_PROFILE_REPO, "profile/README.md", pfRenderReadmeBlock(ev), "bootstrap"]
  ];
  for (var i = 0; i < targets.length; i++) {
    try { writes.push(await pfCommit(env, targets[i][0], targets[i][1], targets[i][2], msg, targets[i][3])); }
    catch (e) { writes.push({ path: targets[i][0] + "/" + targets[i][1], status: "write-failed", note: String(e && e.message || e).slice(0, 100) }); }
  }
  var status = writes.every(function(w) { return w.status === "committed" || w.status === "unchanged"; }) ? "ok" : "partial";
  try { await env.AUDIT.prepare("INSERT INTO portfolio_sync_runs (ts, repos, hygiene, status, note, writes) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(ev.ts, ev.total, ev.hygiene_score, status, "wbs:" + wbs.note + "; dormant " + ev.dormant.length + "; unlinked " + ev.unlinked_research.length, JSON.stringify(writes).slice(0, 1500)).run(); } catch (e) {}
  return { ok: true, status: status, ts: ev.ts, repos: ev.total, tiers: ev.tiers, hygiene: ev.hygiene_score, wbs: wbs.note, writes: writes, ms: Date.now() - t0 };
}
// PARTIAL-RETRY-1: a run that left a surface unwritten (partial) is retried on the next hourly tick, not after 20h;
// a fully written run (ok) holds for PF_STALE_H. The writes are idempotent (unchanged content is a no-op), so an
// hourly retry of a persistent failure costs a handful of GitHub reads and files LOOP-WATCH-1's issue meanwhile.
async function portfolioSyncIfStale(env) {
  await pfSchema(env);
  var last = await charterOne(env, "SELECT ts, status FROM portfolio_sync_runs WHERE status IN ('ok','partial') ORDER BY id DESC LIMIT 1");
  var holdMs = last && last.status === "ok" ? PF_STALE_H * 3600000 : 50 * 60000;
  if (last && last.ts && Date.now() - Date.parse(last.ts) < holdMs) return { ok: true, status: "fresh", last: last.ts, last_status: last.status };
  return portfolioSync(env, false);
}
async function portfolioLatest(env) {
  await pfSchema(env);
  var rows = await charterRows(env, "SELECT name, tier, pillar, visibility, archived, fork, description, license, topics, homepage, pushed_at, wbs, flags, seen, synced_at FROM portfolio_repos WHERE seen=1 ORDER BY tier, pushed_at DESC");
  var run = await charterOne(env, "SELECT ts, repos, hygiene, status, note, writes FROM portfolio_sync_runs ORDER BY id DESC LIMIT 1");
  var tiers = {};
  rows.forEach(function(r) { tiers[r.tier] = (tiers[r.tier] || 0) + 1; });
  return { last_run: run, repos: rows.length, tiers: tiers, rows: rows.map(function(r) { if (r.visibility === "private") return { name: "(private)", tier: r.tier, pillar: r.pillar, visibility: "private" }; r.topics = JSON.parse(r.topics || "[]"); r.wbs = r.wbs ? r.wbs.split(",") : []; r.flags = r.flags ? r.flags.split(",") : []; return r; }) };
}
// ---- PORTFOLIO-LOOP-1:END ----
// ---- LOOP-WATCH-1:BEGIN (2026-10-01, CLOUD-ONLY-VERIFICATION-1) ----
// Owner directive (2026-10-01): the fleet must never depend on continued Claude usage; every datum and every
// recurring check lives on Cloudflare. CHARTER-LOOP-1 and PORTFOLIO-LOOP-1 already run on crons and write to D1 and
// GitHub, but their first live runs were verified by a session with a scheduled check-in, which is exactly the
// dependency to remove. This block is the fleet-side verifier: every hour it reads the two loops' own ledgers
// (charter_snapshots, portfolio_sync_runs) and files one deduped agent_issue per failure class, closing it with
// close_evidence as soon as the loop is healthy again. A loop that silently stops, or a GitHub write that keeps
// failing, becomes a row in the fleet's own issue ledger, where qnfo-backlog-exec, remediation contracts and the
// dashboard already look. No session, routine or person is on the path. GET /loops serves the same verdict.
var LW_STALE_H = 26;
var LW_GRACE_H = 26;
var LW_BAD_WRITE = { "write-failed": 1, "read-failed": 1, "markers-missing": 1, "anchor-missing": 1, "no-token": 1 };
// Pure: the two ledgers -> findings. Each finding is one deduped issue title; an empty list means healthy.
function loopWatchEvaluate(f, nowMs) {
  f = f || {};
  var out = [];
  var ageH = function(ts) { var t = Date.parse(ts || ""); return isNaN(t) ? null : (nowMs - t) / 3600000; };
  var deployAge = ageH(f.first_seen);
  var graceOver = deployAge !== null && deployAge > LW_GRACE_H;
  // charter: a snapshot every day, a commit that lands
  var cs = f.charter_last;
  if (!cs) { if (graceOver) out.push({ key: "CHARTER-TICK-STALE-1", severity: "high", text: "charter_snapshots holds no row although the kernel has been live for " + Math.round(deployAge) + "h; the daily 03:00Z tick is not running." }); }
  else {
    var ca = ageH(cs.ts);
    if (ca !== null && ca > LW_STALE_H) out.push({ key: "CHARTER-TICK-STALE-1", severity: "high", text: "latest charter snapshot is " + Math.round(ca) + "h old (" + cs.ts + "); the daily tick stopped." });
    var notes = f.charter_notes || [];
    var bad = notes.filter(function(n) { return /^(write-failed|read-failed|markers-missing)/.test(String(n || "")); });
    if (notes.length >= 3 && bad.length === notes.length) out.push({ key: "CHARTER-COMMIT-FAILED-1", severity: "medium", text: "the last " + notes.length + " charter ticks could not commit docs/QUNIVERSE-CHARTER.md: " + notes.join(" | ").slice(0, 200) });
  }
  // portfolio: a sync every day, three surfaces written
  var ps = f.portfolio_last;
  var pok = f.portfolio_last_ok;
  if (!pok) { if (graceOver) out.push({ key: "PORTFOLIO-SYNC-STALE-1", severity: "high", text: "portfolio_sync_runs has no successful run although the kernel has been live for " + Math.round(deployAge) + "h" + (ps ? "; latest run " + ps.status + " (" + String(ps.note || "").slice(0, 120) + ")" : "") + "." }); }
  else {
    var pa = ageH(pok.ts);
    if (pa !== null && pa > LW_STALE_H) out.push({ key: "PORTFOLIO-SYNC-STALE-1", severity: "high", text: "last successful portfolio sync is " + Math.round(pa) + "h old (" + pok.ts + ")." });
  }
  if (ps && ps.writes) {
    var w = [];
    try { w = JSON.parse(ps.writes) || []; } catch (e) { w = []; }
    w.forEach(function(x) { if (x && LW_BAD_WRITE[x.status]) out.push({ key: "PORTFOLIO-WRITE-FAILED-1: " + x.path, severity: "medium", text: "portfolio surface " + x.path + " could not be written on " + ps.ts + ": " + x.status + (x.note ? " (" + x.note + ")" : "") + "." }); });
  }
  return out;
}
async function loopWatchFacts(env) {
  var f = {};
  await charterSchema(env);
  await pfSchema(env);
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS loop_watch_state (key TEXT PRIMARY KEY, value TEXT)").run();
  var fs = await charterOne(env, "SELECT value FROM loop_watch_state WHERE key='first_seen'");
  if (!fs) { var now = new Date().toISOString(); try { await env.AUDIT.prepare("INSERT OR IGNORE INTO loop_watch_state (key, value) VALUES ('first_seen', ?1)").bind(now).run(); } catch (e) {} f.first_seen = now; } else f.first_seen = fs.value;
  f.charter_last = await charterOne(env, "SELECT ts, commit_note FROM charter_snapshots ORDER BY id DESC LIMIT 1");
  f.charter_notes = (await charterRows(env, "SELECT commit_note FROM charter_snapshots ORDER BY id DESC LIMIT 3")).map(function(r) { return r.commit_note; });
  f.portfolio_last = await charterOne(env, "SELECT ts, status, note, writes FROM portfolio_sync_runs ORDER BY id DESC LIMIT 1");
  f.portfolio_last_ok = await charterOne(env, "SELECT ts, status FROM portfolio_sync_runs WHERE status IN ('ok','partial') ORDER BY id DESC LIMIT 1");
  return f;
}
async function loopWatch(env) {
  var f = await loopWatchFacts(env);
  var findings = loopWatchEvaluate(f, Date.now());
  var want = {};
  findings.forEach(function(x) { want[x.key] = x; });
  var open = await charterRows(env, "SELECT id, title FROM agent_issues WHERE status='open' AND (title LIKE 'CHARTER-TICK-STALE-1%' OR title LIKE 'CHARTER-COMMIT-FAILED-1%' OR title LIKE 'PORTFOLIO-SYNC-STALE-1%' OR title LIKE 'PORTFOLIO-WRITE-FAILED-1:%')");
  var openByTitle = {};
  open.forEach(function(r) { openByTitle[r.title] = r.id; });
  var filed = 0, closed = 0, nowMs = Date.now(), nowIso = new Date().toISOString();
  for (var k in want) {
    if (openByTitle[k]) continue;
    try {
      await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, 'loop-watch', 'reliability', ?3, 'open', ?4, ?4)")
        .bind(k, "AUTO-FILED by qnfo-fleet-control LOOP-WATCH-1 (CLOUD-ONLY-VERIFICATION-1). " + want[k].text + " DoD: the loop's own ledger (charter_snapshots / portfolio_sync_runs) shows a fresh successful run; LOOP-WATCH-1 closes this issue itself with close_evidence on the next healthy hour.", want[k].severity, nowMs).run();
      filed++;
    } catch (e) {}
  }
  for (var t in openByTitle) {
    if (want[t]) continue;
    try {
      await env.AUDIT.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?1, 'LOOP-WATCH-1', 'closed', 'qnfo-fleet-control', datetime('now'), ?2) ON CONFLICT(issue_id) DO UPDATE SET close_evidence=excluded.close_evidence, triage_state='closed'")
        .bind(openByTitle[t], "LOOP-WATCH-1 " + nowIso + ": healthy; charter_last=" + (f.charter_last ? f.charter_last.ts : "none") + " portfolio_last_ok=" + (f.portfolio_last_ok ? f.portfolio_last_ok.ts : "none")).run();
      await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?2 WHERE id=?1").bind(openByTitle[t], nowMs).run();
      closed++;
    } catch (e) {}
  }
  return { ok: true, ts: nowIso, healthy: findings.length === 0, findings: findings, filed: filed, closed: closed, charter_last: f.charter_last, portfolio_last: f.portfolio_last ? { ts: f.portfolio_last.ts, status: f.portfolio_last.status, note: f.portfolio_last.note } : null, first_seen: f.first_seen };
}
// ---- LOOP-WATCH-1:END ----
var worker_default2 = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    // CHARTER-LOOP-1 (QUNIVERSE-CHARTER-1): the fleet's own account of itself. GET is public (it is what the charter
    // document publishes anyway); the tick is admin-gated like every other mutating route here.
    // PORTFOLIO-LOOP-1 (QNFO-PORTFOLIO-1): the organisation's repositories as one register.
    // LOOP-WATCH-1 (CLOUD-ONLY-VERIFICATION-1): the fleet verifies its own charter and portfolio loops; no session needed.
    if (p === "/loops" && request.method === "GET") {
      var lwf = await loopWatchFacts(env);
      var lwx = loopWatchEvaluate(lwf, Date.now());
      return json({ ok: true, worker_version: VERSION, healthy: lwx.length === 0, findings: lwx, charter_last: lwf.charter_last, portfolio_last: lwf.portfolio_last ? { ts: lwf.portfolio_last.ts, status: lwf.portfolio_last.status, note: lwf.portfolio_last.note } : null, first_seen: lwf.first_seen });
    }
    if (p === "/portfolio" && request.method === "GET") {
      return json({ ok: true, worker_version: VERSION, portfolio: await portfolioLatest(env) });
    }
    if (p === "/portfolio.md" && request.method === "GET") {
      var pl = await portfolioLatest(env);
      var pev = pfEvaluate(pl.rows.filter(function(r) { return r.name !== "(private)"; }).map(function(r) { return { name: r.name, description: r.description, visibility: r.visibility, archived: !!r.archived, fork: !!r.fork, pushed_at: r.pushed_at, topics: r.topics, license: r.license, homepage: r.homepage }; }), [], new Date().toISOString());
      return new Response(pfRenderDocBlock(pev), { status: 200, headers: { "Content-Type": "text/markdown; charset=utf-8" } });
    }
    if (p === "/portfolio/sync" && request.method === "POST") {
      var psh = request.headers.get("Authorization") || "";
      var pst = psh.indexOf("Bearer ") === 0 ? psh.slice(7) : psh;
      if (!(pst && ((env.DEPLOY_ADMIN_TOKEN && pst === env.DEPLOY_ADMIN_TOKEN) || (env.SELFHEAL_TOKEN && pst === env.SELFHEAL_TOKEN)))) return json({ error: "unauthorized" }, 401);
      return json(await portfolioSync(env, true));
    }
    if (p === "/charter" && request.method === "GET") {
      var latest = await charterLatest(env);
      if (url.searchParams.get("live") === "1" || !latest) {
        var cf = await charterFacts(env);
        var cev = charterEvaluate(cf, new Date().toISOString());
        return json({ ok: true, source: "live", worker_version: VERSION, state: cev, facts: url.searchParams.get("facts") === "1" ? cf : void 0 });
      }
      return json({ ok: true, source: "snapshot", worker_version: VERSION, snapshot: latest });
    }
    if (p === "/charter.md" && request.method === "GET") {
      var cf2 = await charterFacts(env);
      return new Response(charterRender(charterEvaluate(cf2, new Date().toISOString())), { status: 200, headers: { "Content-Type": "text/markdown; charset=utf-8" } });
    }
    if (p === "/charter/full.md" && request.method === "GET") {
      var cm = env.CANONICAL ? await env.CANONICAL.get(CHARTER_MIRROR_KEY) : null;
      if (!cm) return json({ error: "charter mirror not written yet; the daily 0 3 * * * tick writes it", source: "https://github.com/" + CHARTER_REPO + "/blob/main/" + CHARTER_DOC_PATH }, 404);
      var cmd = cm.customMetadata || {};
      return new Response(await cm.text(), { status: 200, headers: { "Content-Type": "text/markdown; charset=utf-8", "X-Charter-Version": String(cmd.charter_version || ""), "X-Charter-Mirrored-At": String(cmd.ts || "") } });
    }
    if (p === "/watchmaker" && request.method === "GET") {
      return json(await watchmakerIndexTick(env));
    }
    if (p === "/charter/tick" && request.method === "POST") {
      var chh = request.headers.get("Authorization") || "";
      var cht = chh.indexOf("Bearer ") === 0 ? chh.slice(7) : chh;
      if (!(cht && ((env.DEPLOY_ADMIN_TOKEN && cht === env.DEPLOY_ADMIN_TOKEN) || (env.SELFHEAL_TOKEN && cht === env.SELFHEAL_TOKEN)))) return json({ error: "unauthorized" }, 401);
      return json(await charterTick(env, url.searchParams.get("force") === "1"));
    }
    if (p === "/obs/reassert" && request.method === "POST") {
      return json(await reassertObservability(env));
    }
    if (p === "/metrics/refresh" && request.method === "POST") {
      var mah = request.headers.get("Authorization") || "";
      var mat = mah.indexOf("Bearer ") === 0 ? mah.slice(7) : mah;
      var mok = mat && ((env.DEPLOY_ADMIN_TOKEN && mat === env.DEPLOY_ADMIN_TOKEN) || (env.SELFHEAL_TOKEN && mat === env.SELFHEAL_TOKEN));
      if (!mok) return json({ error: "unauthorized" }, 401);
      return json(await refreshOwnedMetrics(env));
    }
    if (p === "/census/run" && request.method === "POST") {
      var cah = request.headers.get("Authorization") || "";
      var cat = cah.indexOf("Bearer ") === 0 ? cah.slice(7) : cah;
      if (!(cat && ((env.DEPLOY_ADMIN_TOKEN && cat === env.DEPLOY_ADMIN_TOKEN) || (env.SELFHEAL_TOKEN && cat === env.SELFHEAL_TOKEN)))) return json({ error: "unauthorized" }, 401);
      return json(await workerCensus(env));
    }
    if (p === "/publication/preflight" && request.method === "GET") {
      return json(await publicationPreflight(env));
    }
    if (p === "/metrics/triggers" && request.method === "POST") {
      var tah = request.headers.get("Authorization") || "";
      var tat = tah.indexOf("Bearer ") === 0 ? tah.slice(7) : tah;
      if (!(tat && ((env.DEPLOY_ADMIN_TOKEN && tat === env.DEPLOY_ADMIN_TOKEN) || (env.SELFHEAL_TOKEN && tat === env.SELFHEAL_TOKEN)))) return json({ error: "unauthorized" }, 401);
      return json(await evaluateMetricTriggers(env));
    }
    if (p === "/evolve/status" && request.method === "GET") {
      try { await evSchema(env); } catch (e) {}
      var evr = await env.AUDIT.prepare("SELECT id, worker, kind, status, issue_id, pr_number, version_from, version_to, note, ts, updated_at FROM evolve_candidates WHERE kind IS NOT NULL ORDER BY id DESC LIMIT 20").all().catch(function() { return { results: [] }; });
      return json({ ok: true, version: VERSION, loop: "EVOLVE-PR-1", gap_hours: EVOLVE_GAP_H, required_checks: EVOLVE_REQUIRED, candidates: evr.results || [] });
    }
    if (p === "/evolve/tick" && request.method === "POST") {
      var eah = request.headers.get("Authorization") || "";
      var eat = eah.indexOf("Bearer ") === 0 ? eah.slice(7) : eah;
      if (!(eat && ((env.DEPLOY_ADMIN_TOKEN && eat === env.DEPLOY_ADMIN_TOKEN) || (env.SELFHEAL_TOKEN && eat === env.SELFHEAL_TOKEN)))) return json({ error: "unauthorized" }, 401);
      return json(await evolveTick(env, new URL(request.url).searchParams.get("force") === "1"));
    }
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
    if (cron === "*/20 * * * *") { ctx.waitUntil(reassertObservability(env).catch((e) => console.error("reassertObservability error:", e && e.message || e))); return advisorMod.default.scheduled(event, env, ctx); }
    if (cron === "0 3 * * *") {
      ctx.waitUntil(disposeRetired(env));
      ctx.waitUntil(charterTick(env, false).catch((e) => console.error("charterTick error:", e && e.message || e)));
      ctx.waitUntil(costImpactGuard(env).catch((e) => console.error("costImpactGuard error:", e && e.message || e)));
      ctx.waitUntil(activitySnapshotDaily(env).catch((e) => console.error("activitySnapshotDaily error:", e && e.message || e)));
      return calibratorMod.default.scheduled(event, env, ctx);
    }
    if (cron === "0 4 1 * *" || cron === "30 3 * * 1") return calibratorMod.default.scheduled(event, env, ctx);
    ctx.waitUntil(pollObservability(env).catch((e) => console.error("pollObservability error:", e && e.message || e)));
    ctx.waitUntil(reassertObservability(env).catch((e) => console.error("reassertObservability error:", e && e.message || e)));
    ctx.waitUntil(refreshOwnedMetrics(env).catch((e) => console.error("refreshOwnedMetrics error:", e && e.message || e)));
    ctx.waitUntil(evolveTick(env, false).catch((e) => console.error("evolveTick error:", e && e.message || e)));
    ctx.waitUntil(slaEscalate(env).catch((e) => console.error("slaEscalate error:", e && e.message || e)));
    ctx.waitUntil(evaluateMetricTriggers(env).catch((e) => console.error("evaluateMetricTriggers error:", e && e.message || e)));
    ctx.waitUntil(publicationPreflight(env).catch((e) => console.error("publicationPreflight error:", e && e.message || e)));
    ctx.waitUntil(workerCensusIfStale(env).catch((e) => console.error("workerCensus error:", e && e.message || e)));
    ctx.waitUntil(usageSnapshotIfStale(env).catch((e) => console.error("usageSnapshot error:", e && e.message || e)));
    ctx.waitUntil(opsAgentWatchMetrics(env).catch((e) => console.error("opsAgentWatch error:", e && e.message || e)));
    ctx.waitUntil(aiAttributionCoverage(env).catch((e) => console.error("aiAttributionCoverage error:", e && e.message || e)));
    ctx.waitUntil(portfolioSyncIfStale(env).catch((e) => console.error("portfolioSync error:", e && e.message || e)));
    ctx.waitUntil(loopWatch(env).catch((e) => console.error("loopWatch error:", e && e.message || e)));
    ctx.waitUntil(remediationContractsTick(env).catch((e) => console.error("remediationContractsTick error:", e && e.message || e)));
    ctx.waitUntil(watchmakerIndexTick(env).catch((e) => console.error("watchmakerIndexTick error:", e && e.message || e)));
    return deployDefault.scheduled(event, env, ctx);
  }
};
async function costImpactGuard(env) {
  try {
    var acct = env.CF_ACCOUNT_ID || "edb167b78c9fb901ea5bca3ce58ccc4b";
    var token = env.CF_API_TOKEN;
    var db = env.AUDIT_DB || env.AUDIT;
    if (!token || !db) return { ok: false, error: "costImpactGuard: CF_API_TOKEN or AUDIT binding missing" };
    await db.prepare("CREATE TABLE IF NOT EXISTS cost_impact_guard (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, cost_7d REAL, cost_prev_7d REAL, impact_7d REAL, impact_prev_7d REAL, top_model TEXT, top_share REAL, cpi REAL, impact_flat INTEGER, due_cents INTEGER, gateway_limit_before REAL, gateway_limit_after REAL, action TEXT)").run();
    var wk = await db.prepare("SELECT SUM(cost_usd) c FROM llm_gateway_log WHERE ts > datetime('now','-7 days')").first();
    var prev = await db.prepare("SELECT SUM(cost_usd) c FROM llm_gateway_log WHERE ts BETWEEN datetime('now','-14 days') AND datetime('now','-7 days')").first();
    var cost7 = wk && wk.c ? Number(wk.c) : 0;
    var costPrev = prev && prev.c ? Number(prev.c) : 0;
    var top = await db.prepare("SELECT model, SUM(cost_usd) c FROM llm_gateway_log WHERE ts > datetime('now','-7 days') GROUP BY model ORDER BY c DESC LIMIT 1").first();
    var topModel = top && top.model ? String(top.model) : "none";
    var topCost = top && top.c ? Number(top.c) : 0;
    var share = cost7 > 0 ? topCost / cost7 : 0;
    var imp = await db.prepare("SELECT SUM(score) s FROM impact_scores WHERE updated_at > datetime('now','-7 days')").first().catch(function(){ return null; });
    var impPrev = await db.prepare("SELECT SUM(score) s FROM impact_scores WHERE updated_at BETWEEN datetime('now','-14 days') AND datetime('now','-7 days')").first().catch(function(){ return null; });
    var impact7 = imp && imp.s ? Number(imp.s) : 0;
    var impactPrev = impPrev && impPrev.s ? Number(impPrev.s) : 0;
    var impactFlat = impactPrev > 0 ? (impact7 - impactPrev) / impactPrev < 0.1 : impact7 <= 0;
    var cpi = impact7 > 0 ? cost7 / impact7 : (cost7 > 0 ? Infinity : 0);
    var gurl = "https://api.cloudflare.com/client/v4/accounts/" + acct + "/ai-gateway/gateways/default";
    var gr = await fetch(gurl, { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(8e3) });
    var gj = await gr.json().catch(function(){ return null; });
    var gw = gj && gj.success ? gj.result : null;
    var rules = gw && gw.spend_limits && gw.spend_limits.rules ? gw.spend_limits.rules : [];
    var curLimit = rules.length && rules[0].limit != null ? Number(rules[0].limit) : null;
    var CEILING = 200, FLOOR = 100;
    var dueCents = null;
    var pr2 = await fetch("https://api.cloudflare.com/client/v4/accounts/" + acct + "/ai-gateway/billing/invoice-preview", { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(8e3) });
    var pj2 = await pr2.json().catch(function(){ return null; });
    if (pj2 && pj2.success && pj2.result && pj2.result.amount_due != null) dueCents = Number(pj2.result.amount_due);
    var divergence = cost7 > 0 && impactFlat && share >= 0.4;
    var action = "none", newLimit = curLimit;
    if (divergence && curLimit != null) {
      var target = Math.max(FLOOR, Math.round((curLimit || CEILING) * 0.8));
      if (dueCents == null || dueCents < target * 100) { newLimit = target; action = "tighten"; }
      else { action = "tighten-deferred-headroom"; }
    } else if (!divergence && curLimit != null && curLimit < CEILING) {
      newLimit = Math.min(CEILING, Math.round(curLimit * 1.1)); action = "relax";
    }
    if ((action === "tighten" || action === "relax") && newLimit !== curLimit) {
      var newRules = rules.map(function(r, i){ var n = Object.assign({}, r); if (i === 0) n.limit = newLimit; return n; });
      var pr3 = await fetch(gurl, { method: "PUT", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ spend_limits: { enabled: true, rules: newRules } }), signal: AbortSignal.timeout(8e3) });
      var pj3 = await pr3.json().catch(function(){ return null; });
      var applied = !!(pj3 && pj3.success);
      var vr = await fetch(gurl, { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(8e3) });
      var vj = await vr.json().catch(function(){ return null; });
      var verified = !!(vj && vj.success && vj.result.spend_limits && vj.result.spend_limits.rules && Number(vj.result.spend_limits.rules[0].limit) === newLimit);
      if (!applied || !verified) { action = action + "-failed"; newLimit = curLimit; }
    }
    await db.prepare("INSERT INTO cost_impact_guard (ts, cost_7d, cost_prev_7d, impact_7d, impact_prev_7d, top_model, top_share, cpi, impact_flat, due_cents, gateway_limit_before, gateway_limit_after, action) VALUES (datetime('now'),?,?,?,?,?,?,?,?,?,?,?,?)").bind(cost7, costPrev, impact7, impactPrev, topModel, share, cpi === Infinity ? -1 : cpi, impactFlat ? 1 : 0, dueCents == null ? -1 : dueCents, curLimit, newLimit, action).run();
    return { ok: true, cost7: cost7, impact7: impact7, topModel: topModel, share: share, cpi: cpi === Infinity ? -1 : cpi, divergence: divergence, action: action, limitBefore: curLimit, limitAfter: newLimit };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
__name(costImpactGuard, "costImpactGuard");


// SCRIPT-USAGE-GRAPHQL-1 (2026-10-01, issue 1688): worker_invocations holds ~1 row fleet-wide, so the consolidation
// guard and disposeRetired correctly fail closed (DEGENERATE-DETECTION-SOURCE-1) and the fleet can never retire a
// worker. The real per-script usage is in Cloudflare analytics (workersInvocationsAdaptive, the dataset
// fleet-telemetry-probe already reads from CI). refreshScriptUsage() snapshots requests/errors per script for the last
// 24h and 7d into worker_usage_daily once a day; scriptUsage7d() serves it ONLY when the snapshot is under 36h old and
// covers >= 10 scripts, otherwise null, so a failed or partial read keeps the old fail-closed behaviour. Deletion is
// blocked by ANY request in 7 days (crons count), which is stricter than the old 24h invocation rule.
async function refreshScriptUsage(env) {
  var token = env.CF_API_TOKEN, acct = env.CF_ACCOUNT_ID || "edb167b78c9fb901ea5bca3ce58ccc4b";
  if (!token) return { ok: false, why: "no CF_API_TOKEN" };
  var db = env.AUDIT_DB || env.AUDIT;
  await db.prepare("CREATE TABLE IF NOT EXISTS worker_usage_daily (day TEXT NOT NULL, script TEXT NOT NULL, requests_24h INTEGER, errors_24h INTEGER, requests_7d INTEGER, errors_7d INTEGER, source TEXT, ts TEXT, PRIMARY KEY (day, script))").run();
  var now = new Date(), end = now.toISOString().replace(/\.\d+Z$/, "Z");
  async function window(ms) {
    var q = 'query { viewer { accounts(filter:{accountTag:"' + acct + '"}) { workersInvocationsAdaptive(limit:10000, filter:{datetime_geq:"' + new Date(now.getTime() - ms).toISOString().replace(/\.\d+Z$/, "Z") + '", datetime_leq:"' + end + '"}) { sum { requests errors } dimensions { scriptName } } } } }';
    var r = await timedFetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) }, 3e4);
    var j = await r.json().catch(function() { return null; });
    if (!j || j.errors || !j.data) throw new Error("graphql " + r.status + " " + JSON.stringify(j && j.errors || "").slice(0, 160));
    var out = {};
    ((j.data.viewer.accounts[0] || {}).workersInvocationsAdaptive || []).forEach(function(x) {
      var n = x.dimensions.scriptName, o = out[n] || (out[n] = { requests: 0, errors: 0 });
      o.requests += Number(x.sum.requests || 0); o.errors += Number(x.sum.errors || 0);
    });
    return out;
  }
  var d1 = await window(864e5), d7 = await window(7 * 864e5);
  var day = now.toISOString().slice(0, 10), ts = now.toISOString(), names = Object.keys(d7), stmts = [];
  names.forEach(function(n) {
    var a = d1[n] || { requests: 0, errors: 0 }, b = d7[n];
    stmts.push(db.prepare("INSERT OR REPLACE INTO worker_usage_daily (day, script, requests_24h, errors_24h, requests_7d, errors_7d, source, ts) VALUES (?1,?2,?3,?4,?5,?6,'cf-graphql-workersInvocationsAdaptive',?7)").bind(day, n, a.requests, a.errors, b.requests, b.errors, ts));
  });
  for (var i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return { ok: true, scripts: names.length, day: day };
}
__name(refreshScriptUsage, "refreshScriptUsage");
// USAGE-SNAPSHOT-HOURLY-1 (2026-10-01, #1688): refreshScriptUsage ran only inside disposeRetired at 03:00Z, so after
// PR 183 the first snapshot (and therefore every usage-gated retirement, e.g. the #1704 cleanup) waited up to ~23h,
// and a single failed 03:00Z GraphQL call cost another day. The hourly branch now takes the snapshot whenever today's
// is missing; once present it is a single cheap COUNT per hour.
async function usageSnapshotIfStale(env) {
  var db = env.AUDIT_DB || env.AUDIT;
  if (!db || !env.CF_API_TOKEN) return { ok: false, why: "no db or token" };
  var day = new Date().toISOString().slice(0, 10);
  try {
    var have = await db.prepare("SELECT COUNT(*) n FROM worker_usage_daily WHERE day = ?1").bind(day).first();
    if (have && Number(have.n) >= 10) return { ok: true, skipped: "fresh", day: day };
  } catch (e) {
  }
  return await refreshScriptUsage(env);
}
__name(usageSnapshotIfStale, "usageSnapshotIfStale");
// OPS-AGENT-WATCH-1 (2026-10-01, #1680 #1696): both issues closed on a 7-day acceptance window. That window is a
// standing regression watch, not a one-off wait, so it runs hourly from here: the trailing INCOMPLETE share of owner
// turns and the count of empty or failed agent-tools answers go to metric_registry, and analytics_metric_triggers files
// a deduped agent_issue on breach (>= 5% INCOMPLETE, >= 1 empty). The window starts at the fixes' go-live
// (2026-10-01T04:35Z, qnfo-ops 2.38.17 empty-final-guard and the durable-workflow budget promotion) and grows to 7 days.
async function opsAgentWatchMetrics(env) {
  var db = env.AUDIT_DB || env.AUDIT || env.DB_AUDIT;
  if (!db) return { ok: false };
  var since = new Date(Math.max(Date.now() - 7 * 864e5, Date.parse("2026-10-01T04:35:00Z"))).toISOString();
  var r = await db.prepare("SELECT COUNT(*) n, SUM(CASE WHEN substr(coalesce(response,''),1,400) LIKE '%INCOMPLETE:%' THEN 1 ELSE 0 END) inc, SUM(CASE WHEN strategy = 'agent-tools' AND (trim(coalesce(response,'')) = '' OR ok = 0) THEN 1 ELSE 0 END) emp FROM ops_ai_log WHERE ts >= ?1 AND strategy IN ('agent-tools','job-workflow','chat')").bind(since).first();
  var n = r ? Number(r.n || 0) : 0, inc = r ? Number(r.inc || 0) : 0, emp = r ? Number(r.emp || 0) : 0;
  var nowIso = new Date().toISOString();
  var pct = n > 0 ? Math.round(inc / n * 1000) / 10 : 0;
  await db.prepare("UPDATE metric_registry SET last_value=?1, last_refreshed=?2, state='MEASURED' WHERE metric='ops_owner_turn_incomplete_pct_7d'").bind(String(pct), nowIso).run();
  await db.prepare("UPDATE metric_registry SET last_value=?1, last_refreshed=?2, state='MEASURED' WHERE metric='ops_agent_empty_answers_7d'").bind(String(emp), nowIso).run();
  return { ok: true, since: since, turns: n, incomplete: inc, empty: emp, pct: pct };
}
__name(opsAgentWatchMetrics, "opsAgentWatchMetrics");
// WORKERS-AI-ATTRIBUTION-1 coverage (2026-10-01, #1681): the share of Workers AI neurons that the per-worker counters
// (ai_call_counters purpose='binding', written by __aiAttrEnv in the AI-heavy workers) account for. Each hourly run
// stores today's cumulative attributed neurons, and the delta since the previous run is compared with GraphQL
// aiInferenceAdaptiveGroups over the same interval. A day rollover resets the cumulative value.
async function aiAttributionCoverage(env) {
  var db = env.AUDIT_DB || env.AUDIT || env.DB_AUDIT, token = env.CF_API_TOKEN, acct = env.CF_ACCOUNT_ID || "edb167b78c9fb901ea5bca3ce58ccc4b";
  if (!db || !token) return { ok: false };
  var now = new Date(), nowIso = now.toISOString(), day = nowIso.slice(0, 10);
  var cur = await db.prepare("SELECT COALESCE(SUM(neurons),0) s FROM ai_call_counters WHERE day=?1").bind(day).first();
  var cum = cur ? Number(cur.s || 0) : 0;
  var prev = await db.prepare("SELECT value FROM analytics_dash_meta WHERE key='ai_attr_cum'").first().catch(function () { return null; });
  var pv = null;
  try { pv = prev && prev.value ? JSON.parse(prev.value) : null; } catch (e) { pv = null; }
  await db.prepare("INSERT INTO analytics_dash_meta (key, value) VALUES ('ai_attr_cum', ?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({ day: day, cum: cum, ts: nowIso })).run();
  if (!pv || pv.day !== day || !pv.ts) return { ok: true, primed: true, cum: cum };
  var q = 'query { viewer { accounts(filter: { accountTag: "' + acct + '" }) { aiInferenceAdaptiveGroups(limit: 1000, filter: { datetime_geq: "' + pv.ts.replace(/\.\d+Z$/, "Z") + '", datetime_leq: "' + nowIso.replace(/\.\d+Z$/, "Z") + '" }) { sum { totalNeurons } } } } }';
  var r = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
  var j = await r.json().catch(function () { return null; });
  var rows = j && j.data && j.data.viewer && j.data.viewer.accounts && j.data.viewer.accounts[0] ? j.data.viewer.accounts[0].aiInferenceAdaptiveGroups || [] : null;
  if (!rows) return { ok: false, error: "graphql" };
  var total = rows.reduce(function (a, x) { return a + (x.sum && x.sum.totalNeurons || 0); }, 0);
  var attributed = Math.max(0, cum - Number(pv.cum || 0));
  if (total <= 0) return { ok: true, idle: true };
  var pct = Math.round(Math.min(100, attributed / total * 100) * 10) / 10;
  await db.prepare("UPDATE metric_registry SET last_value=?1, last_refreshed=?2, state='MEASURED' WHERE metric='workers_ai_attribution_coverage_pct'").bind(String(pct), nowIso).run();
  return { ok: true, attributed: attributed, total: total, pct: pct };
}
__name(aiAttributionCoverage, "aiAttributionCoverage");
// REMEDIATION-TICK-1 (2026-10-01): remediation_contracts close issues on evidence. A d1-query probe that returns
// expected == observed writes remediation_verifications pass=1, and the remediation_verification_autoclose triggers close
// the agent_issue with that evidence. The only runner was scripts/remediation_consumer.py, which GitHub runs after
// pushes; its schedule trigger never fires on this repository, so a contract whose evidence lands overnight (tomorrow's
// cron run of a producer) waited for the next unrelated push. This hourly tick runs the same contract with the same
// guarantees: literal read-only SELECT only, expected and observed both taken from the probe (never invented), pass only
// when both are non-empty and equal, and trusted transport d1-query only.
var __RT_WRITE_KW = ["insert ", "update ", "delete ", "drop ", "alter ", "create ", "attach ", "detach ", "pragma ", "replace ", "vacuum", "reindex"];
// WATCHMAKER-INDEX-1 (2026-10-01, RM-WATCHMAKER-INDEX-1, agent_issues #1726 CODE-LOOP-ON-CLAUDE-1). Owner directive:
// the fleet must not depend on continued agent-session usage. The charter's blue-sky footprint names a "watchmaker
// index": the count of recurring operations that still need a human or an outside agent session. It was "not
// published". This publishes it hourly as metric_registry.watchmaker_index (target 0), from three counts the fleet
// can read itself:
//   unverifiable_issues  open agent_issues with no active machine-executable remediation contract (someone outside
//                        the fleet has to verify and close them)
//   external_agent_tasks recurring tasks run by an outside agent scheduler, as declared in
//                        ops_config.external_agent_recurring_tasks (the fleet cannot observe that scheduler, so the
//                        number is a declaration; a missing or non-numeric row is reported as undeclared, never as 0)
//   overdue_owner_actions open human_actions whose due date has passed
// The index is their sum. It never invents a value: if a source cannot be read, nothing is written this hour.
function watchmakerCompute(f) {
  f = f || {};
  var parts = { unverifiable_issues: Number(f.unverifiable_issues), external_agent_tasks: f.external_agent_tasks == null || f.external_agent_tasks === "" ? NaN : Number(f.external_agent_tasks), overdue_owner_actions: Number(f.overdue_owner_actions) };
  var undeclared = isNaN(parts.external_agent_tasks);
  if (isNaN(parts.unverifiable_issues) || isNaN(parts.overdue_owner_actions)) return { ok: false, parts: parts };
  var total = parts.unverifiable_issues + parts.overdue_owner_actions + (undeclared ? 0 : parts.external_agent_tasks);
  return { ok: true, index: total, undeclared: undeclared, parts: parts, detail: "unverifiable_issues=" + parts.unverifiable_issues + " external_agent_tasks=" + (undeclared ? "undeclared" : parts.external_agent_tasks) + " overdue_owner_actions=" + parts.overdue_owner_actions };
}
__name(watchmakerCompute, "watchmakerCompute");
async function watchmakerIndexTick(env) {
  var db = env.AUDIT_DB || env.AUDIT || env.DB_AUDIT;
  if (!db) return { ok: false, error: "no AUDIT binding" };
  var f = {};
  try {
    var a = await db.prepare("SELECT COUNT(*) AS n FROM agent_issues a WHERE a.status='open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts r WHERE r.issue_id=a.id AND r.status='active' AND r.verify_probe <> 'needs-machine-probe')").first();
    f.unverifiable_issues = a ? a.n : null;
    var h = await db.prepare("SELECT COUNT(*) AS n FROM human_actions WHERE status='open' AND due IS NOT NULL AND due <> '' AND date(due) < date('now')").first();
    f.overdue_owner_actions = h ? h.n : null;
    var e = await db.prepare("SELECT value FROM ops_config WHERE key='external_agent_recurring_tasks'").first();
    f.external_agent_tasks = e ? e.value : null;
  } catch (err) {
    return { ok: false, error: String(err && err.message || err).slice(0, 160) };
  }
  var w = watchmakerCompute(f);
  if (!w.ok) return { ok: false, error: "source unreadable", parts: w.parts };
  var nowIso = (/* @__PURE__ */ new Date()).toISOString();
  await db.prepare("INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, state) VALUES ('watchmaker_index','operational','leading','open agent_issues without an active machine-executable remediation contract + ops_config.external_agent_recurring_tasks + overdue open human_actions','qnfo-audit: agent_issues, remediation_contracts, ops_config, human_actions','unpublished before 2026-10-01','0','qnfo-fleet-control','qnfo-fleet-control','hourly','MEASURED')").run();
  await db.prepare("UPDATE metric_registry SET last_value=?1, last_refreshed=?2, state=?3, source_of_truth=?4 WHERE metric='watchmaker_index'").bind(String(w.index), nowIso, w.undeclared ? "PARTIAL" : "MEASURED", "qnfo-audit: agent_issues, remediation_contracts, ops_config, human_actions (" + w.detail + ")").run();
  return { ok: true, index: w.index, detail: w.detail };
}
__name(watchmakerIndexTick, "watchmakerIndexTick");
async function remediationContractsTick(env) {
  var db = env.AUDIT_DB || env.AUDIT || env.DB_AUDIT;
  if (!db) return { ok: false };
  var out = { ok: true, due: 0, pass: 0, fail: 0, skipped: 0 };
  var rs = await db.prepare("SELECT class, issue_id, verify_probe, verify_transport, expected_cadence_h FROM remediation_contracts WHERE status = 'active' AND verify_transport = 'd1-query' AND (next_due_at IS NULL OR datetime(next_due_at) <= datetime('now')) ORDER BY COALESCE(next_due_at, ts) LIMIT 15").all().catch(function () { return { results: [] }; });
  var rows = rs.results || [];
  out.due = rows.length;
  for (var i = 0; i < rows.length; i++) {
    var c = rows[i], verdict = null;
    try {
      var q = String(c.verify_probe || "").trim();
      var ql = " " + q.toLowerCase().replace(/\s+/g, " ") + " ";
      var literal = /^(select|with) /.test(q.toLowerCase()) && q.indexOf(";") === -1 && !__RT_WRITE_KW.some(function (k) { return ql.indexOf(" " + k) !== -1; });
      if (!literal) { verdict = "probe-not-machine-executable"; out.skipped++; }
      else {
        var r = await db.prepare(q).first();
        var keys = r ? Object.keys(r) : [];
        var exp = r ? (r.expected !== undefined ? r.expected : r[keys[0]]) : null;
        var obs = r ? (r.observed !== undefined ? r.observed : r[keys[1]]) : null;
        var es = exp == null ? "" : String(exp).trim(), os = obs == null ? "" : String(obs).trim();
        if (!es || !os) { verdict = "vacuous-probe-result"; out.skipped++; }
        else {
          var passed = es === os ? 1 : 0;
          await db.prepare("INSERT INTO remediation_verifications (issue_id, class, probe_url, transport, expected, observed, pass, verifier) VALUES (?1, ?2, ?3, 'd1-query', ?4, ?5, ?6, ?7)").bind(c.issue_id, c.class, "d1:remediation_contracts/" + c.class, es, os, passed, "qnfo-fleet-control/remediation-tick@" + VERSION).run();
          verdict = passed ? "pass" : "fail";
          if (passed) out.pass++; else out.fail++;
        }
      }
    } catch (e) {
      verdict = "probe-error"; out.skipped++;
    }
    try {
      await db.prepare("UPDATE remediation_contracts SET attempts = COALESCE(attempts,0) + 1, last_attempt_at = datetime('now'), last_verdict = ?1, next_due_at = datetime('now', ?2), status = CASE WHEN ?1 = 'pass' THEN 'closed' ELSE status END WHERE class = ?3").bind(verdict, "+" + Math.max(1, Number(c.expected_cadence_h) || 1) + " hours", c.class).run();
    } catch (e2) {}
  }
  return out;
}
__name(remediationContractsTick, "remediationContractsTick");
async function scriptUsage7d(env, name) {
  var db = env.AUDIT_DB || env.AUDIT;
  try {
    var snap = await db.prepare("SELECT day, COUNT(*) n, MAX(ts) ts FROM worker_usage_daily WHERE day = (SELECT MAX(day) FROM worker_usage_daily) GROUP BY day").first();
    if (!snap || Number(snap.n) < 10 || Date.now() - Date.parse(snap.ts) > 36 * 36e5) return null;
    var row = await db.prepare("SELECT requests_7d FROM worker_usage_daily WHERE day=?1 AND script=?2").bind(snap.day, name).first();
    return { requests_7d: row ? Number(row.requests_7d || 0) : 0, day: snap.day, scripts: Number(snap.n) };
  } catch (e) {
    return null;
  }
}
__name(scriptUsage7d, "scriptUsage7d");
// SLA-BREACH-ESCALATE-1 (2026-10-01, issue 1619): the SLA plane detected breaches (v_sla_breaches) and never
// escalated them, so a breached issue looked like any other backlog row. Each hourly run raises one alert per
// breached issue per day (digested IS NULL, so qnfo-social's alertDigest consumes it and qnfo-observability shows it).
async function slaEscalate(env) {
  var db = env.AUDIT_DB || env.AUDIT;
  var rows = (await db.prepare("SELECT b.id, b.priority, b.owner, b.sla_due_at, substr(a.title,1,120) title FROM v_sla_breaches b JOIN agent_issues a ON a.id=b.id LIMIT 50").all()).results || [];
  var raised = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i], key = "SLA-BREACH #" + r.id + ":";
    var seen = await db.prepare("SELECT 1 FROM alerts WHERE source='sla-breach' AND message LIKE ?1 AND created_at > datetime('now','-1 day') LIMIT 1").bind(key + "%").first();
    if (seen) continue;
    await db.prepare("INSERT INTO alerts (source, level, message) VALUES ('sla-breach', ?1, ?2)").bind(r.priority === "critical" || r.priority === "high" ? "error" : "warn", key + " " + r.title + " (owner " + r.owner + ", SLA due " + r.sla_due_at + ")").run();
    raised++;
  }
  return { breaches: rows.length, raised: raised };
}
__name(slaEscalate, "slaEscalate");
async function disposeRetired(env) {
  try {
    var acct = env.CF_ACCOUNT_ID || "edb167b78c9fb901ea5bca3ce58ccc4b";
    var token = env.CF_API_TOKEN;
    if (!token) return;
    try { await refreshScriptUsage(env); } catch (e) { console.error("refreshScriptUsage error:", e && e.message || e); }
    var _usageProbe = await scriptUsage7d(env, "qnfo-fleet-control");
    // DEGENERATE-DETECTION-SOURCE-1 (2026-09-30, handoff 29754 P4): worker_invocations is the ONLY
    // usage signal used to justify a destructive retire, and it has held ~1 row fleet-wide, so an
    // "0 invocations/24h" read is VACUOUS (it would make every worker look unused). Prove the source
    // is non-degenerate BEFORE acting: a degenerate source yields UNKNOWN, never a delete verdict.
    // Fail closed: skip disposal this cycle and log once per day.
    var srcHealth = await env.AUDIT_DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN created_at > datetime('now','-2 day') THEN 1 ELSE 0 END) AS recent FROM worker_invocations").first();
    var srcRecent = srcHealth ? Number(srcHealth.recent || 0) : 0;
    if (srcRecent < 10 && !_usageProbe) {
      try {
        var sdup = await env.AUDIT_DB.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind='dispose-blocked' AND text LIKE 'DEGENERATE-DETECTION-SOURCE-1:%' AND ts > datetime('now','-1 day')").first();
        if (!sdup || Number(sdup.n || 0) === 0) {
          await env.AUDIT_DB.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text) VALUES (datetime('now'), 'dispose-blocked', 'qnfo-fleet-control', ?)").bind("DEGENERATE-DETECTION-SOURCE-1: worker_invocations recent=" + srcRecent + " (<10) -> usage UNKNOWN, disposal skipped").run();
        }
      } catch (e) {
      }
      return;
    }
    var protectedNames = { "qnfo-fleet-control": 1, "qnfo-ops": 1, "qnfo-email": 1, "qnfo-deploy-guard": 1, "personal-api": 1, "personal-companion": 1, "qnfo-cloud-ops": 1, "qnfo-outreach": 1, "qnfo-kaizen": 1, "qnfo-lifecycle": 1, "qnfo-intent-orchestrator": 1, "qnfo-backlog-exec": 1, "qnfo-research-exec": 1, "qnfo-paper-indexer": 1, "qnfo-infra": 1, "qnfo-fleet-dashboard": 1, "qnfo-paper-reviser": 1 };
    var q = await env.AUDIT_DB.prepare("SELECT id, item FROM reorg_work_queue WHERE state='OPEN' AND item LIKE 'delete-worker:%'").all();
    var targets = {};
    for (var i = 0; i < (q.results || []).length; i++) {
      var m = /delete-worker:([a-z0-9-]+)/i.exec(q.results[i].item || "");
      if (m) targets[m[1]] = 1;
    }
    for (var name in targets) {
      if (protectedNames[name]) continue;
      var _u = await scriptUsage7d(env, name);
      var inv = _u ? { n: _u.requests_7d } : await env.AUDIT_DB.prepare("SELECT COUNT(*) AS n FROM worker_invocations WHERE worker_name = ? AND created_at > datetime('now','-1 day')").bind(name).first();
      if (inv && inv.n > 0) {
        await env.AUDIT_DB.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text) VALUES (datetime('now'), 'dispose-blocked', 'qnfo-fleet-control', ?)").bind(name + " :: OUTPUT-CONTRACT: producing worker (" + inv.n + (_u ? " requests/7d, cf-graphql " + _u.day : " invocations/24h") + "); delete blocked").run();
        continue;
      }
      var recent = await env.AUDIT_DB.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events WHERE kind='dispose-blocked' AND text LIKE ? AND ts > datetime('now','-1 day')").bind(name + "%").first();
      if (recent && recent.n > 0) continue;
      var res = await fetch("https://api.cloudflare.com/client/v4/accounts/" + acct + "/workers/scripts/" + name, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
      var j = await res.json().catch(function() {
        return {};
      });
      if (j && j.success) {
        await env.AUDIT_DB.prepare("UPDATE service_registry SET state='deleted', updated_at=datetime('now') WHERE service = ?").bind(name).run();
        await env.AUDIT_DB.prepare("UPDATE reorg_work_queue SET state='EXECUTED' WHERE item LIKE 'delete-worker:" + name + "%' AND state='OPEN'").run();
        await env.AUDIT_DB.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text) VALUES (datetime('now'), 'disposed-worker', 'qnfo-fleet-control', ?)").bind(name).run();
        try { await env.AUDIT_DB.prepare("INSERT INTO worker_removals (worker, removed_at, action, rationale, evidence, source) VALUES (?1, datetime('now'), 'DISPOSED', 'worker_consolidation RETIRE + reorg_work_queue delete-worker item', ?2, 'qnfo-fleet-control disposeRetired')").bind(name, _usageProbe ? "0 requests/7d (cf-graphql " + _usageProbe.day + ")" : "0 invocations/24h (worker_invocations)").run(); } catch (eR) {}
      } else {
        var msg = j && j.errors && j.errors[0] && j.errors[0].message || "unknown";
        await env.AUDIT_DB.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text) VALUES (datetime('now'), 'dispose-blocked', 'qnfo-fleet-control', ?)").bind(name + " :: " + String(msg).slice(0, 280)).run();
      }
    }
  } catch (e) {
  }
}
__name(disposeRetired, "disposeRetired");
async function pollObservability(env) {
  try {
    var acct = env.CF_ACCOUNT_ID || "edb167b78c9fb901ea5bca3ce58ccc4b";
    var token = env.CF_API_TOKEN;
    var db = env.AUDIT_DB || env.AUDIT;
    if (!token || !db) return { ok: false, error: "pollObservability: CF_API_TOKEN or AUDIT_DB missing" };
    var H = { Authorization: "Bearer " + token, "User-Agent": "qnfo-fleet-control-obs" };
    var base = "https://api.cloudflare.com/client/v4/accounts/" + acct + "/workers/observability";
    var out = { ok: true, summary: null, issuesIngested: 0, usageWorkers: 0 };
    var sr = await fetch(base + "/issues/summary", { headers: H, signal: AbortSignal.timeout(8e3) });
    var sj = await sr.json().catch(function() { return null; });
    out.summary = sj && sj.success ? sj.result : null;
    var ir = await fetch(base + "/issues?status=active&perPage=100", { headers: H, signal: AbortSignal.timeout(8e3) });
    var ij = await ir.json().catch(function() { return null; });
    var issues = ij && ij.success && ij.result ? ij.result : [];
    for (var i = 0; i < issues.length; i++) {
      var it = issues[i];
      var fp = "cf-obs-" + (it.id || ("idx" + i));
      var payload = JSON.stringify(it).slice(0, 8000);
      try {
        await db.prepare("INSERT OR IGNORE INTO fleet_issue_dispatch (fingerprint, category, sev, owner, action, payload, state) VALUES (?,?,?,?,?,?,?)")
          .bind(fp, "worker-observability", "warn", "fleet", "obs-ingest", payload, "new").run();
        await db.prepare("INSERT INTO fleet_issue_loop (fingerprint, category, sev, owner, title, first_seen, last_seen, occurrences, dispatch_state, last_action) VALUES (?,?,?,?,?,?,?,1,?,?) ON CONFLICT(fingerprint) DO UPDATE SET last_seen=excluded.last_seen, occurrences=fleet_issue_loop.occurrences+1, last_action=excluded.last_action")
          .bind(fp, "worker-observability", "warn", "fleet", String(it.title || it.service || "observability-issue").slice(0, 200), it.firstObserved || Date.now(), it.lastObserved || Date.now(), "dispatched", "obs-ingest").run();
        out.issuesIngested++;
      } catch (e2) {}
    }
    var now = Date.now();
    var from = now - 864e5;
    var ur = await fetch(base + "/usage?from=" + from + "&to=" + now, { headers: H, signal: AbortSignal.timeout(8e3) });
    var uj = await ur.json().catch(function() { return null; });
    var bd = uj && uj.success && uj.result && uj.result.breakdown ? uj.result.breakdown : [];
    var per = {};
    for (var b = 0; b < bd.length; b++) {
      var sv = bd[b].service || "unknown";
      per[sv] = (per[sv] || 0) + (Number(bd[b].count) || 0);
    }
    var keys = Object.keys(per);
    for (var k = 0; k < keys.length; k++) {
      try {
        await db.prepare("INSERT INTO analytics_dash_workers (worker, requests) VALUES (?,?) ON CONFLICT(worker) DO UPDATE SET requests=excluded.requests").bind(keys[k], per[keys[k]]).run();
      } catch (e3) {}
    }
    out.usageWorkers = keys.length;
    try {
      await db.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text) VALUES (datetime('now'), 'obs-ingest', 'qnfo-fleet-control', ?)")
        .bind(JSON.stringify({ activeIssues: out.summary && out.summary.activeIssues, resolved: out.summary && out.summary.resolvedIssues, issuesIngested: out.issuesIngested, usageWorkers: out.usageWorkers })).run();
    } catch (e4) {}
    return out;
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 300) };
  }
}
__name(pollObservability, "pollObservability");
/* OWNED-METRICS-WRITER-1 (2026-09-30, agent_issues #1411 METRIC-REGISTRY-STALENESS-1): metric_registry names
   qnfo-fleet-control as the OWNER of drift_total, cost_usd_30d, cost_per_successful_task_by_class and
   gateway_cap_30d_usd, but nothing in the fleet wrote them: they froze at 2026-09-27/29 while declaring hourly/daily
   cadences, and the lifecycle freshness auditor kept the ticket open. This writer recomputes them hourly from the
   same sources their registry formulas name, with the semantics of the last recorded values (cost_usd_30d 190.56 ~
   SUM(model_ladder_budget.spent_usd) = 190.81 now; cost_per_successful 0.2127 = that sum / successful ops calls).
   It never invents a value: a metric whose source cannot be read this cycle is left untouched and reported. */
async function refreshOwnedMetrics(env) {
  var db = env.AUDIT_DB || env.AUDIT || env.DB_AUDIT;
  var out = { ok: true, written: [], skipped: {} };
  if (!db) return { ok: false, error: "no AUDIT binding" };
  var nowIso = (/* @__PURE__ */ new Date()).toISOString();
  async function put(metric, value) {
    await db.prepare("UPDATE metric_registry SET last_value=?1, last_refreshed=?2 WHERE metric=?3").bind(String(value), nowIso, metric).run();
    out.written.push(metric + "=" + value);
  }
  try {
    var c = await db.prepare("SELECT SUM(spent_usd) AS s FROM model_ladder_budget WHERE month >= strftime('%Y-%m', 'now', '-30 day')").first();
    var spent = c && c.s != null ? Number(c.s) : null;
    var okr = await db.prepare("SELECT COUNT(*) AS n FROM ops_ai_log WHERE ok=1 AND ts >= datetime('now','-30 day')").first();
    var okN = okr ? Number(okr.n || 0) : 0;
    if (spent != null && isFinite(spent)) {
      // cost_usd_30d is written by UNIFIED-AI-SPEND-1 below (all providers); the ladder ledger only feeds the per-task ratio.
      if (okN > 0) await put("cost_per_successful_task_by_class", (spent / okN).toFixed(4));
      else out.skipped.cost_per_successful_task_by_class = "0 successful ops calls in 30d";
    } else {
      out.skipped.cost_per_successful_task_by_class = "model_ladder_budget unreadable";
    }
  } catch (e) {
    out.skipped.cost = String(e && e.message || e).slice(0, 160);
  }
  var token = env.CF_API_TOKEN;
  var acct = env.CF_ACCOUNT_ID || "edb167b78c9fb901ea5bca3ce58ccc4b";
  if (!token) {
    out.skipped.drift_total = out.skipped.gateway_cap_30d_usd = "no CF_API_TOKEN";
    return out;
  }
  var H = { Authorization: "Bearer " + token, "User-Agent": "qnfo-fleet-control-metrics/" + VERSION };
  try {
    var wr = await fetch("https://api.cloudflare.com/client/v4/accounts/" + acct + "/workers/scripts?per_page=100", { headers: H, signal: AbortSignal.timeout(1e4) });
    var wj = await wr.json().catch(function () { return null; });
    if (wj && wj.success && Array.isArray(wj.result) && wj.result.length) {
      var live = {};
      wj.result.forEach(function (w) { if (w && w.id) live[w.id] = 1; });
      var rr = await db.prepare("SELECT service, version, state, kind FROM service_registry").all();
      var reg = rr.results || [], inReg = {}, ghost = 0, unversioned = 0, unregistered = 0;
      reg.forEach(function (r) {
        inReg[r.service] = 1;
        var isLive = !r.state || r.state === "live";
        if (isLive && (!r.kind || r.kind === "worker") && !live[r.service]) ghost++;
        if (isLive && live[r.service] && (r.version == null || String(r.version).trim() === "")) unversioned++;
      });
      Object.keys(live).forEach(function (n) { if (!inReg[n]) unregistered++; });
      await put("drift_total", ghost + unregistered + unversioned);
      out.drift = { ghost: ghost, unregistered: unregistered, unversioned: unversioned };
    } else {
      out.skipped.drift_total = "CF workers/scripts list unreadable";
    }
  } catch (e) {
    out.skipped.drift_total = String(e && e.message || e).slice(0, 160);
  }
  try {
    var gr = await fetch("https://api.cloudflare.com/client/v4/accounts/" + acct + "/ai-gateway/gateways/default", { headers: H, signal: AbortSignal.timeout(8e3) });
    var gj = await gr.json().catch(function () { return null; });
    var rules = gj && gj.success && gj.result && gj.result.spend_limits && gj.result.spend_limits.rules ? gj.result.spend_limits.rules : [];
    if (rules.length && rules[0].limit != null) await put("gateway_cap_30d_usd", Number(rules[0].limit));
    else out.skipped.gateway_cap_30d_usd = "gateway spend_limits unreadable";
  } catch (e) {
    out.skipped.gateway_cap_30d_usd = String(e && e.message || e).slice(0, 160);
  }
  // WAI-COST-WRITER-1 (2026-09-30): workers_ai_cost_30d_usd had no automated writer; its formula named
  // workersInvocationsAdaptive.neurons, a field that does not exist, and the row carried a hand-set 15.6.
  // Workers AI usage lives in aiInferenceAdaptiveGroups.sum.totalNeurons; cost at the published rate
  // ($0.011 per 1k neurons after 10k/day free). Measured 2026-09-30: 5.57M neurons/30d (~$58 list).
  var waiUsd = null, waiNeurons = null;
  try {
    var since = new Date(Date.now() - 30 * 864e5).toISOString();
    var q = 'query { viewer { accounts(filter: { accountTag: "' + acct + '" }) { aiInferenceAdaptiveGroups(limit: 1000, filter: { datetime_geq: "' + since + '", datetime_leq: "' + nowIso + '" }) { sum { totalNeurons } } } } }';
    var qr = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, H), body: JSON.stringify({ query: q }), signal: AbortSignal.timeout(2e4) });
    var qj = await qr.json().catch(function () { return null; });
    var rows = qj && !qj.errors && qj.data && qj.data.viewer && qj.data.viewer.accounts && qj.data.viewer.accounts[0] ? qj.data.viewer.accounts[0].aiInferenceAdaptiveGroups : null;
    if (Array.isArray(rows)) {
      var neurons = rows.reduce(function (a, x) { return a + (x && x.sum && Number(x.sum.totalNeurons) || 0); }, 0);
      var usd = Math.max(0, neurons - 1e4 * 30) / 1e3 * 0.011;
      waiUsd = usd;
      waiNeurons = neurons;
      await db.prepare("UPDATE metric_registry SET last_value=?1, last_refreshed=?2, state='MEASURED', formula=?3, source_of_truth=?4 WHERE metric='workers_ai_cost_30d_usd'").bind(usd.toFixed(2), nowIso, "max(0, SUM(aiInferenceAdaptiveGroups.sum.totalNeurons over 30d) - 10k/day free) / 1000 * $0.011 (published Workers AI rate); refreshed hourly by qnfo-fleet-control", "CF GraphQL aiInferenceAdaptiveGroups (" + Math.round(neurons) + " neurons at refresh)").run();
      out.written.push("workers_ai_cost_30d_usd=" + usd.toFixed(2));
    } else {
      out.skipped.workers_ai_cost_30d_usd = "aiInferenceAdaptiveGroups unreadable" + (qj && qj.errors ? ": " + JSON.stringify(qj.errors).slice(0, 120) : "");
    }
  } catch (e) {
    out.skipped.workers_ai_cost_30d_usd = String(e && e.message || e).slice(0, 160);
  }
  // UNIFIED-AI-SPEND-1 (2026-10-01, #1683 AI-SPEND-OVER-CAP-ALL-PROVIDERS-1): cost_usd_30d was
  // SUM(model_ladder_budget.spent_usd), an internal ladder ledger that omits BYOK providers and agent
  // sessions; the gateway spend limit governs unified billing only, so BYOK DeepSeek bypassed every cap.
  // cost_usd_30d is now the one all-provider figure: gateway-metered cost of every request (unified
  // billing + BYOK, aiGatewayRequestsAdaptiveGroups.sum.cost, workers-ai rows excluded) + the Workers AI
  // neuron cost above. Per-provider soft caps live in fleet_budget (node_class 'ai_spend:<provider>',
  // 'ai_spend:total'); a breach raises one digest alert per cap per day. Hard blocking of BYOK traffic
  // and re-routing agent sessions stay owner decisions (AI Gateway settings / client configuration).
  try {
    var since2 = new Date(Date.now() - 30 * 864e5).toISOString();
    var gq = 'query { viewer { accounts(filter: { accountTag: "' + acct + '" }) { aiGatewayRequestsAdaptiveGroups(limit: 2000, filter: { datetime_geq: "' + since2 + '", datetime_leq: "' + nowIso + '" }) { count sum { cost } dimensions { provider model } } } } }';
    var gqr = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, H), body: JSON.stringify({ query: gq }), signal: AbortSignal.timeout(2e4) });
    var gqj = await gqr.json().catch(function () { return null; });
    var grows = gqj && !gqj.errors && gqj.data && gqj.data.viewer && gqj.data.viewer.accounts && gqj.data.viewer.accounts[0] ? gqj.data.viewer.accounts[0].aiGatewayRequestsAdaptiveGroups : null;
    if (Array.isArray(grows)) {
      var byProv = aiSpendByProvider(grows);
      if (waiUsd != null) byProv["workers-ai"] = (byProv["workers-ai"] || 0) + waiUsd;
      var total = Object.keys(byProv).reduce(function (a, k) { return a + byProv[k]; }, 0);
      var parts = Object.keys(byProv).sort(function (a, b) { return byProv[b] - byProv[a]; }).map(function (k) { return k + " $" + byProv[k].toFixed(2); }).join(", ");
      await db.prepare("UPDATE metric_registry SET last_value=?1, last_refreshed=?2, state='MEASURED', formula=?3, source_of_truth=?4 WHERE metric='cost_usd_30d'").bind(total.toFixed(2), nowIso, "LIST-COST ESTIMATE (not billed): unified 30d AI spend, all providers incl. BYOK = SUM(aiGatewayRequestsAdaptiveGroups.sum.cost, provider<>workers-ai) + workers_ai_cost_30d_usd (UNIFIED-AI-SPEND-1, qnfo-fleet-control hourly)", "CF GraphQL aiGatewayRequestsAdaptiveGroups + aiInferenceAdaptiveGroups: " + parts.slice(0, 400)).run();
      out.written.push("cost_usd_30d=" + total.toFixed(2) + " (" + parts.slice(0, 160) + ")");
      var byBill = aiSpendByBilling(grows, env);
      out.aiSpend = { total: Number(total.toFixed(2)), byProvider: byProv, byBilling: byBill, alerts: await aiSpendCaps(db, byProv, total, byBill) };
      // METRIC-TRIGGER-LOOP-1 (#1634): the analytics trigger inputs had no writer since a one-off audit on
      // 2026-09-26. Keep the cost keys fresh from the same measurement.
      var gwOnly = Object.keys(byProv).filter(function (k) { return k !== "workers-ai"; }).reduce(function (a, k) { return a + byProv[k]; }, 0);
      var metaKv = [["ai_est_cost_30d", total.toFixed(2)], ["gateway_cost_usd_30d", gwOnly.toFixed(2)], ["unified_cost_usd_30d", byBill.unified.toFixed(2)], ["byok_cost_usd_30d", byBill.byok.toFixed(2)], ["last_refresh", nowIso]];
      if (waiNeurons != null) metaKv.push(["neurons_30d", String(waiNeurons)]);
      for (var mk = 0; mk < metaKv.length; mk++) {
        await db.prepare("INSERT INTO analytics_dash_meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(metaKv[mk][0], metaKv[mk][1]).run().catch(function () {});
      }
    } else {
      out.skipped.cost_usd_30d_unified = "aiGatewayRequestsAdaptiveGroups unreadable" + (gqj && gqj.errors ? ": " + JSON.stringify(gqj.errors).slice(0, 120) : "");
    }
  } catch (e) {
    out.skipped.cost_usd_30d_unified = String(e && e.message || e).slice(0, 160);
  }
  return out;
}
__name(refreshOwnedMetrics, "refreshOwnedMetrics");
// Gateway rows -> USD by provider. Unified-billing "compat" rows carry the real provider as the model prefix.
// Workers AI rows are dropped here because their cost is counted from neurons.
// WORKERS-AI-SPEND-UNATTRIBUTED-RISING-1 (#1681): every env.AI.run in this worker goes through aiRunAttr, which adds a
// per-worker/purpose call counter to D1 ai_call_counters (one UPSERT per call, fail-soft, never blocks or alters the AI call).
// Neurons are not returned by the binding; calls + input/output chars are the attribution proxy. No new paid service.
async function aiRunAttr(env, worker, purpose, model, input, opts) {
  var t0 = Date.now(), ok = 1;
  try { return await env.AI.run(model, input, opts); } catch (e) { ok = 0; throw e; }
  finally {
    try {
      var db = env.AUDIT_DB || env.AUDIT || env.DB_AUDIT;
      if (db) {
        var ic = 0; try { ic = JSON.stringify(input && input.messages || input || "").length; } catch (e2) {}
        var day = new Date().toISOString().slice(0, 10);
        await db.prepare("CREATE TABLE IF NOT EXISTS ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, in_chars INTEGER DEFAULT 0, ms INTEGER DEFAULT 0, PRIMARY KEY (day, worker, purpose, model))").run();
        await db.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, errors, in_chars, ms) VALUES (?1,?2,?3,?4,1,?5,?6,?7) ON CONFLICT(day, worker, purpose, model) DO UPDATE SET calls=calls+1, errors=errors+?5, in_chars=in_chars+?6, ms=ms+?7").bind(day, worker, purpose, String(model), ok ? 0 : 1, ic, Date.now() - t0).run();
      }
    } catch (e3) {}
  }
}
__name(aiRunAttr, "aiRunAttr");
// BUDGET-OVER-METRIC-DEFINITION-1 (#1699): billing-mode split. Workers AI is neuron-billed and excluded; the monthly
// gateway cap meters unified billing only.
// BYOK-BILLING-SPLIT-1 (2026-10-01): the first version classified unified billing as provider compat/unknown/universal,
// which measurement falsified: GraphQL reports compat-endpoint traffic under its REAL provider, so ai_spend:total read
// $0 while openai/gpt-5.5 (called through /compat with cf-aig-authorization and no stored OpenAI key) was billed
// against the gateway credit. The per-request byok flag in the gateway logs is the ground truth (cf-ops-actions
// gateway-logs 2026-10-01: deepseek rows byok="default", openai/gpt-5.5 rows byok=None). Providers with a stored
// gateway key are therefore BYOK and everything else is unified. The set is env-overridable (AIG_BYOK_PROVIDERS,
// comma list) for when a key is added or removed.
function aiSpendByBilling(rows, env) {
  var o = { unified: 0, byok: 0 };
  var byokSet = {};
  String(env && env.AIG_BYOK_PROVIDERS || "deepseek").split(",").forEach(function (p) { p = p.trim().toLowerCase(); if (p) byokSet[p] = 1; });
  (rows || []).forEach(function (r) {
    var d = r && r.dimensions || {};
    var prov = String(d.provider || "unknown").toLowerCase();
    if (prov === "workers-ai" || prov === "workers_ai") return;
    var c = r && r.sum && Number(r.sum.cost) || 0;
    if (!(c > 0)) return;
    if (byokSet[prov]) o.byok += c; else o.unified += c;
  });
  return o;
}
__name(aiSpendByBilling, "aiSpendByBilling");
function aiSpendByProvider(rows) {
  var by = {};
  rows.forEach(function (r) {
    var d = r && r.dimensions || {};
    var prov = String(d.provider || "unknown").toLowerCase();
    var model = String(d.model || "");
    if ((prov === "compat" || prov === "unknown" || prov === "universal") && model.indexOf("/") > 0) prov = model.split("/")[0].toLowerCase();
    if (prov === "workers-ai" || prov === "workers_ai") return;
    var c = r && r.sum && Number(r.sum.cost) || 0;
    if (c > 0) by[prov] = (by[prov] || 0) + c;
  });
  return by;
}
__name(aiSpendByProvider, "aiSpendByProvider");
// Record measured spend against fleet_budget soft caps and raise one digest alert per breached cap per day.
async function aiSpendCaps(db, byProv, total, byBill) {
  var raised = [];
  var rs = await db.prepare("SELECT node_class, cap, target FROM fleet_budget WHERE node_class LIKE 'ai_spend:%'").all().catch(function () { return { results: [] }; });
  var caps = rs.results || [];
  for (var i = 0; i < caps.length; i++) {
    var c = caps[i], key = String(c.node_class).slice("ai_spend:".length);
    // ai_spend:total is the unified-billing spend (the cap meters unified only); all-provider list cost stays in cost_usd_30d.
    var cur = key === "total" ? (byBill ? byBill.unified : total) : (byProv[key] || 0);
    await db.prepare("UPDATE fleet_budget SET current=?1, updated_at=?2 WHERE node_class=?3").bind(Number(cur.toFixed(2)), new Date().toISOString(), c.node_class).run().catch(function () {});
    if (c.cap != null && cur > Number(c.cap)) {
      // BUDGET-UNITS-1 (2026-10-01, #1699): these figures are gateway LIST-cost estimates across every provider (unified
      // billing + BYOK + Workers AI), measured against internal soft budgets. They are not billed amounts and not the
      // gateway monthly spend limit, which meters unified-billing traffic only. Comparing the two made a ~1.26x billed
      // overage read as ~3x.
      var msg = "AI-SPEND-CAP " + c.node_class + (c.node_class === "ai_spend:total" ? ": 30d unified-billing list cost $" : ": 30d list-cost estimate $") + cur.toFixed(2) + " > internal soft budget $" + Number(c.cap).toFixed(2) + " (target $" + c.target + "; all providers incl BYOK; not the billed amount and not the gateway monthly cap)";
      var dup = await db.prepare("SELECT id FROM alerts WHERE source='qnfo-fleet-control' AND message LIKE ?1 AND created_at > datetime('now','-1 day') LIMIT 1").bind("AI-SPEND-CAP " + c.node_class + ":%").first().catch(function () { return null; });
      if (!dup) {
        await db.prepare("INSERT INTO alerts (source, level, message, digested) VALUES ('qnfo-fleet-control', 'warning', ?1, NULL)").bind(msg).run().catch(function () {});
        raised.push(c.node_class);
      }
    }
  }
  return raised;
}
__name(aiSpendCaps, "aiSpendCaps");
// METRIC-TRIGGER-LOOP-1 (2026-10-01, #1634 METRIC-TRIGGER-ACTION-LOOP-INERT-1): analytics_metric_triggers held 7
// enabled threshold->action rules but nothing evaluated them (3 firings ever, the last on 2026-09-05; the worker
// that did was retired). This evaluator runs hourly: it reads each trigger's value (source_table 'meta' ->
// analytics_dash_meta, 'records' -> analytics_dash_records, otherwise analytics_dash_meta then metric_registry),
// compares it with the threshold, and fires at most once per cooldown_hours. A firing is written to
// analytics_action_log and dispatched: queue_target 'agent_issues' files a deduped open issue; every other target
// raises a digest alert naming the target and the action. A trigger whose value cannot be read is reported, never fired.
async function evaluateMetricTriggers(env) {
  var db = env.AUDIT_DB || env.AUDIT || env.DB_AUDIT;
  var out = { ok: true, evaluated: 0, fired: [], unreadable: [] };
  if (!db) return { ok: false, error: "no AUDIT binding" };
  var rs = await db.prepare("SELECT id, metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours FROM analytics_metric_triggers WHERE enabled = 1").all().catch(function () { return { results: [] }; });
  var trig = rs.results || [];
  for (var i = 0; i < trig.length; i++) {
    var t = trig[i];
    var v = await metricTriggerValue(db, t);
    if (v == null || !isFinite(v)) { out.unreadable.push(t.metric_key); continue; }
    out.evaluated++;
    var thr = Number(t.threshold), op = String(t.operator || "gte");
    var hit = op === "gt" ? v > thr : op === "lte" ? v <= thr : op === "lt" ? v < thr : op === "eq" ? v === thr : v >= thr;
    if (!hit) continue;
    var cd = Math.max(1, Number(t.cooldown_hours) || 24);
    var recent = await db.prepare("SELECT id FROM analytics_action_log WHERE trigger_id = ?1 AND fired_at > datetime('now', ?2) LIMIT 1").bind(t.id, "-" + cd + " hours").first().catch(function () { return null; });
    if (recent) continue;
    var target = String(t.queue_target || "none");
    var summary = "METRIC-TRIGGER #" + t.id + " " + t.metric_key + "=" + v + " " + op + " " + thr + " -> " + String(t.action || "").slice(0, 300) + " (owner " + (t.owner || "-") + ", target " + target + ")";
    var status = "dispatched", note = null;
    try {
      if (target === "agent_issues") {
        var title = "METRIC-TRIGGER-" + t.id + "-" + String(t.metric_key).toUpperCase().replace(/[^A-Z0-9]+/g, "-") + ": " + String(t.title || t.action || "").slice(0, 80);
        var open = await db.prepare("SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open' LIMIT 1").bind(title).first().catch(function () { return null; });
        if (open) { status = "deduped"; note = "open issue " + open.id; }
        else {
          var nowMs = Date.now();
          await db.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, 'qnfo-fleet-control', 'reliability', ?3, 'open', ?4, ?4)").bind(title, summary, String(t.priority || "medium"), nowMs).run();
          note = "agent_issues filed";
        }
      } else {
        await db.prepare("INSERT INTO alerts (source, level, message, digested) VALUES ('qnfo-fleet-control', 'warning', ?1, NULL)").bind(summary.slice(0, 500)).run();
        note = "digest alert";
      }
    } catch (e) { status = "dispatch-failed"; note = String(e && e.message || e).slice(0, 200); }
    await db.prepare("INSERT INTO analytics_action_log (trigger_id, fired_at, metric_value, action, queue_target, status, notes) VALUES (?1, datetime('now'), ?2, ?3, ?4, ?5, ?6)").bind(t.id, v, String(t.action || "").slice(0, 500), target, status, note).run().catch(function () {});
    out.fired.push({ id: t.id, metric: t.metric_key, value: v, status: status });
  }
  return out;
}
__name(evaluateMetricTriggers, "evaluateMetricTriggers");
async function metricTriggerValue(db, t) {
  var key = String(t.metric_key || ""), src = String(t.source_table || "meta");
  var num = function (r, f) { if (!r || r[f] == null || r[f] === "") return null; var n = Number(String(r[f]).replace(/[^0-9.+-eE]/g, "")); return isFinite(n) ? n : null; };
  var v = null;
  if (src === "records") v = num(await db.prepare("SELECT value FROM analytics_dash_records WHERE metric = ?1").bind(key).first().catch(function () { return null; }), "value");
  if (v == null) v = num(await db.prepare("SELECT value FROM analytics_dash_meta WHERE key = ?1").bind(key).first().catch(function () { return null; }), "value");
  if (v == null) v = num(await db.prepare("SELECT last_value FROM metric_registry WHERE metric = ?1").bind(key).first().catch(function () { return null; }), "last_value");
  return v;
}
__name(metricTriggerValue, "metricTriggerValue");
// PUBLICATION-PREFLIGHT-1 (2026-10-01, #1118 OPS-PUBLICATION-PROCEDURE-GAP-20260926): a Q08 publication was once
// promised while q08.org served the QNFO homepage for every Q08 path (fallback false-200) and the worker did not exist.
// scripts/q08_publication_preflight.mjs encoded the checks but nothing ran it (GitHub schedule events never fire here).
// This hourly check runs them from the fleet: each publication surface must be served by its own worker (health JSON
// naming it), expose a machine-readable listing, and serve a real feed. A failure raises a digest alert and one open
// agent_issue (deduped); recovery is recorded. qnfo-ops reads the latest result before promising a publication SLA.
var PUBLICATION_SURFACES = [
  { name: "q08", health: "https://q08.org/health", worker: "q08-signal-engine", listing: "https://q08.org/api/pieces", feed: "https://q08.org/feed.xml" }
];
async function publicationPreflight(env) {
  var db = env.AUDIT_DB || env.AUDIT || env.DB_AUDIT;
  var out = { ok: true, surfaces: [] };
  for (var i = 0; i < PUBLICATION_SURFACES.length; i++) {
    var sf = PUBLICATION_SURFACES[i], checks = [];
    var get = async function (u) {
      try { var r = await fetch(u, { headers: { "User-Agent": "qnfo-fleet-control-preflight/" + VERSION }, signal: AbortSignal.timeout(15e3) }); return { status: r.status, ct: r.headers.get("content-type") || "", text: (await r.text()).slice(0, 4000) }; }
      catch (e) { return { status: 0, ct: "", text: String(e && e.message || e).slice(0, 200) }; }
    };
    var h = await get(sf.health), l = await get(sf.listing), f = await get(sf.feed);
    var hj = null; try { hj = JSON.parse(h.text); } catch (e) {}
    var fallback = /QNFO\s+\u2014\s+Research Foundation|Latest papers/.test(h.text + l.text);
    checks.push({ check: "health served by " + sf.worker, ok: h.status === 200 && !!hj && hj.worker === sf.worker, detail: "http " + h.status + " worker=" + (hj && hj.worker) + " version=" + (hj && hj.version) });
    checks.push({ check: "listing is JSON, not fallback homepage", ok: l.status === 200 && /json/i.test(l.ct) && !fallback, detail: "http " + l.status + " ct=" + l.ct });
    checks.push({ check: "feed is RSS/Atom", ok: f.status === 200 && /<rss|<feed/i.test(f.text), detail: "http " + f.status + " ct=" + f.ct });
    var sok = checks.every(function (c) { return c.ok; });
    if (!sok) out.ok = false;
    out.surfaces.push({ name: sf.name, ok: sok, checks: checks });
    if (!db) continue;
    try { await db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'publication_preflight', ?3, ?4, 'qnfo-fleet-control', ?5)").bind("pp-" + Date.now().toString(36) + "-" + sf.name, new Date().toISOString(), sf.name + (sok ? " ok" : " FAIL"), JSON.stringify(checks).slice(0, 1500), sok ? "ok" : "error").run(); } catch (e) {}
    var title = "PUBLICATION-PREFLIGHT-FAIL-" + sf.name.toUpperCase() + ": " + sf.name + " publication surface is not served by " + sf.worker;
    try {
      var open = await db.prepare("SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open' LIMIT 1").bind(title).first();
      if (!sok && !open) {
        var nowMs = Date.now();
        await db.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, 'qnfo-fleet-control', 'reliability', 'high', 'open', ?3, ?3)").bind(title, "PUBLICATION-PREFLIGHT-1 failed checks: " + JSON.stringify(checks.filter(function (c) { return !c.ok; })).slice(0, 1500) + ". Do not promise publication on this surface until the preflight passes.", nowMs).run();
        await db.prepare("INSERT INTO alerts (source, level, message, digested) VALUES ('qnfo-fleet-control', 'error', ?1, NULL)").bind(title.slice(0, 400)).run();
      } else if (sok && open) {
        await db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'publication_preflight_recovered', ?3, '{}', 'qnfo-fleet-control', 'ok')").bind("ppr-" + Date.now().toString(36), new Date().toISOString(), sf.name + " recovered; open issue " + open.id).run();
      }
    } catch (e) {}
  }
  return out;
}
__name(publicationPreflight, "publicationPreflight");
// WORKER-CENSUS-DISCRIMINATING-1 (2026-10-01, #1618 WORKER-CENSUS-VERDICT-SATURATED-1): fleet_worker_census and
// worker_dod read "live" for all 36 workers (written once, 2026-09-27), so all-green carried no information. The design
// names five verdicts. Request volume cannot discriminate (health probes reach every worker), so verdicts come from
// each worker's OUTPUT: worker_output_contracts.output_sql is run for the last 24h and 7d. Rules:
//   DEGRADED          live /health non-200 (HTTP workers) or the latest fresh heartbeat reports ok=0
//   PRODUCTIVE        output rows in the last 24h
//   DAILY-ONLY        none in 24h but some in 7d, and every cron is daily or slower
//   LOW-YIELD         none in 24h but some in 7d (sub-daily crons or on-demand)
//   FIRING-NO-OUTPUT  scheduled, no output rows in 7d
//   UNMEASURED        no executable output probe declared (honest, never defaulted to a pass)
async function workerCensus(env) {
  var db = env.AUDIT_DB || env.AUDIT || env.DB_AUDIT;
  if (!db) return { ok: false, error: "no AUDIT binding" };
  var now = Date.now(), out = { ok: true, workers: 0, verdicts: {} };
  var since = function (ms) { var d = new Date(now - ms), iso = d.toISOString(); return { iso: iso, sql: iso.slice(0, 19).replace("T", " "), date: iso.slice(0, 10), ms: String(d.getTime()) }; };
  var w24 = since(864e5), w7 = since(7 * 864e5);
  var fill = function (q, w) { return q.split(":since_iso").join("'" + w.iso + "'").split(":since_sql").join("'" + w.sql + "'").split(":since_date").join("'" + w.date + "'").split(":since_ms").join(w.ms); };
  var all = async function (q) { try { return (await db.prepare(q).all()).results || []; } catch (e) { return null; } };
  var rows = async function (q) { return (await all(q)) || []; };
  var live = {}; (await rows("SELECT worker, http FROM worker_live_audit")).forEach(function (r) { live[r.worker] = r.http; });
  var crons = {}; (await rows("SELECT name, crons_json FROM worker_schedules")).forEach(function (r) { try { crons[r.name] = JSON.parse(r.crons_json || "[]"); } catch (e) { crons[r.name] = []; } });
  var hb = {}; (await rows("SELECT worker, ok FROM fleet_heartbeat WHERE ts >= '" + since(26 * 36e5).iso + "'")).forEach(function (r) { hb[r.worker] = Number(r.ok); });
  var req = {}; (await rows("SELECT worker, requests FROM analytics_dash_workers")).forEach(function (r) { req[r.worker] = Number(r.requests) || 0; });
  var contracts = await rows("SELECT worker, output_sql, state FROM worker_output_contracts WHERE COALESCE(state,'ACTIVE') = 'ACTIVE'");
  var dailyOrSlower = function (list) { return list.length > 0 && list.every(function (c) { var f = String(c).trim().split(/\s+/); return f.length === 5 && /^\d+$/.test(f[0]) && /^\d+$/.test(f[1]); }); };
  // WORKER-CENSUS-UNCONTRACTED-1: a scheduled worker with no ACTIVE output contract (a new or redeployed worker, e.g.
  // radar-hub on 2026-10-01) is reported as UNMEASURED instead of being skipped, so it cannot sit outside the census.
  var contracted = {};
  contracts.forEach(function(x) { contracted[x.worker] = 1; });
  Object.keys(crons).forEach(function(n) { if (!contracted[n]) contracts.push({ worker: n, output_sql: null, uncontracted: true }); });
  for (var i = 0; i < contracts.length; i++) {
    var c = contracts[i], w = c.worker, cl = crons[w] || [], verdict, reason;
    var httpBad = live[w] != null && Number(live[w]) !== 200 && cl.length === 0;
    if (httpBad || hb[w] === 0) { verdict = "DEGRADED"; reason = httpBad ? "live /health http " + live[w] : "latest heartbeat ok=0"; }
    else if (c.uncontracted) { verdict = "UNMEASURED"; reason = "no output contract (worker_output_contracts) for a scheduled worker"; }
    else if (!c.output_sql) { verdict = "UNMEASURED"; reason = "no executable output probe (worker_output_contracts.output_sql)"; }
    else {
      var r24 = await all(fill(c.output_sql, w24)), r7 = await all(fill(c.output_sql, w7));
      var n24 = r24 && r24.length ? Number(r24[0].n) || 0 : null, n7 = r7 && r7.length ? Number(r7[0].n) || 0 : null;
      if (n24 == null || n7 == null) { verdict = "UNMEASURED"; reason = "output probe failed to run"; }
      else if (n24 > 0) { verdict = "PRODUCTIVE"; reason = n24 + " output rows in 24h"; }
      else if (n7 > 0) { verdict = dailyOrSlower(cl) ? "DAILY-ONLY" : "LOW-YIELD"; reason = "0 output rows in 24h, " + n7 + " in 7d"; }
      else if (cl.length) { verdict = "FIRING-NO-OUTPUT"; reason = "scheduled (" + cl.join(" | ") + ") but 0 output rows in 7d"; }
      else { verdict = "LOW-YIELD"; reason = "on-demand, 0 output rows in 7d"; }
    }
    out.workers++; out.verdicts[verdict] = (out.verdicts[verdict] || 0) + 1;
    var reasonFull = reason + (req[w] != null ? "; 24h events " + req[w] : "");
    var nowIso = new Date(now).toISOString();
    try {
      await db.prepare("INSERT INTO fleet_worker_census (worker, req24, measured, last_seen, verdict, reason, ts) VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6) ON CONFLICT(worker) DO UPDATE SET req24=excluded.req24, measured=1, last_seen=excluded.last_seen, verdict=excluded.verdict, reason=excluded.reason, ts=excluded.ts").bind(w, req[w] != null ? req[w] : null, nowIso, verdict, reasonFull.slice(0, 400), nowIso).run();
      await db.prepare("INSERT INTO worker_dod (worker, req24, measured, verdict, evidence, updated_at) VALUES (?5, ?2, 1, ?1, ?3, ?4) ON CONFLICT(worker) DO UPDATE SET verdict=excluded.verdict, req24=excluded.req24, measured=1, evidence=excluded.evidence, updated_at=excluded.updated_at").bind(verdict, req[w] != null ? req[w] : null, ("WORKER-CENSUS-DISCRIMINATING-1: " + reasonFull).slice(0, 400), nowIso, w).run();
    } catch (e) {}
  }
  try { await db.prepare("DELETE FROM fleet_worker_census WHERE worker NOT IN (SELECT worker FROM worker_output_contracts WHERE COALESCE(state,'ACTIVE') = 'ACTIVE') AND worker NOT IN (SELECT name FROM worker_schedules)").run(); } catch (e) {}
  return out;
}
__name(workerCensus, "workerCensus");
// WORKER-CENSUS-SELF-SCHEDULE-1 (2026-10-01): the census runs from the hourly branch once its newest row is 23h old. A
// missed daily run, or a fresh deploy over stale rows, is then recovered at the next hour instead of a day later.
async function workerCensusIfStale(env) {
  var db = env.AUDIT_DB || env.AUDIT || env.DB_AUDIT;
  if (!db) return { ran: false, error: "no AUDIT binding" };
  var r = null;
  try { r = await db.prepare("SELECT MAX(ts) AS newest FROM fleet_worker_census").first(); } catch (e) {}
  var newest = r && r.newest ? Date.parse(r.newest) : 0;
  if (newest && Date.now() - newest < 23 * 36e5) return { ran: false, newest: r.newest };
  return Object.assign({ ran: true }, await workerCensus(env));
}
__name(workerCensusIfStale, "workerCensusIfStale");
async function reassertObservability(env) {
  try {
    var acct = env.CF_ACCOUNT_ID || "edb167b78c9fb901ea5bca3ce58ccc4b";
    var token = env.CF_API_TOKEN;
    if (!token) return { ok: false, error: "reassertObservability: no CF_API_TOKEN" };
    var H = { Authorization: "Bearer " + token, "User-Agent": "qnfo-fleet-control-obs" };
    var base = "https://api.cloudflare.com/client/v4/accounts/" + acct;
    var doMap = {};
    try {
      var nsr = await fetch(base + "/workers/durable_objects/namespaces", { headers: H, signal: AbortSignal.timeout(8e3) });
      var nsj = await nsr.json().catch(function() { return null; });
      if (nsj && nsj.success && nsj.result) {
        for (var i = 0; i < nsj.result.length; i++) {
          var ns = nsj.result[i];
          if (ns.script && ns.class) doMap[ns.script] = { clazz: ns.class, storage: ns.use_sqlite ? "sqlite" : "legacy-kv" };
        }
      }
    } catch (e1) {}
    var wr = await fetch(base + "/workers/scripts?per_page=100", { headers: H, signal: AbortSignal.timeout(8e3) });
    var wj = await wr.json().catch(function() { return null; });
    var workers = wj && wj.success && wj.result ? wj.result : [];
    var patched = 0, skipped = 0, patchedNames = [];
    for (var w = 0; w < workers.length; w++) {
      var name = workers[w].id;
      if (!name) continue;
      var sr = await fetch(base + "/workers/scripts/" + name + "/settings", { headers: H, signal: AbortSignal.timeout(8e3) });
      var sj = await sr.json().catch(function() { return null; });
      var o = sj && sj.success && sj.result ? sj.result.observability : null;
      var ok = o && o.enabled === true && o.logs && o.logs.enabled === true && o.traces && o.traces.enabled === true && o.issues && o.issues.enabled === true;
      if (ok) { skipped++; continue; }
      var settings = { observability: { enabled: true, head_sampling_rate: 1, redact_query_string: false, logs: { enabled: true, head_sampling_rate: 1, persist: true, invocation_logs: true, destinations: ["cloudflare"] }, traces: { enabled: true, head_sampling_rate: 1, persist: true, destinations: ["cloudflare"] }, issues: { enabled: true } } };
      if (doMap[name]) {
        var ex = {}; ex[doMap[name].clazz] = { type: "durable-object", storage: doMap[name].storage }; settings.exports = ex;
      }
      try {
        var boundary = "----QNFO" + Date.now() + "-" + Math.random().toString(36).slice(2);
        var body = ["--" + boundary, 'Content-Disposition: form-data; name="settings"', "Content-Type: application/json", "", JSON.stringify(settings), "--" + boundary + "--"].join("\u000d\u000a");
        var pr = await fetch(base + "/workers/scripts/" + name + "/settings", { method: "PATCH", headers: { Authorization: H.Authorization, "User-Agent": H["User-Agent"], "Content-Type": "multipart/form-data; boundary=" + boundary }, body: body, signal: AbortSignal.timeout(8e3) });
        var pj = await pr.json().catch(function() { return null; });
        var po = pj && pj.success && pj.result ? pj.result.observability : null;
        if (po && po.enabled === true) {
          patched++;
          patchedNames.push(name);
          /* SETTINGS-ONLY-LEDGER-1 (2026-09-30): a settings PATCH bumps CF modified_on exactly like a code
             deploy, and it wrote no fleet_deploys row, so qnfo-deploy-guard read every reassert as an
             unlogged + uncoordinated deploy (paired high tickets per worker, re-raised after every code
             deploy because a code deploy resets per-version observability). Ledger it as SETTINGS-ONLY:
             the guard counts it as logged, and never treats it as the worker's last CODE deploy. */
          try {
            await env.AUDIT_DB.prepare("INSERT INTO fleet_deploys (worker, actor, session_id, from_sha, to_sha, source_path, ok, note, ts) VALUES (?1,?2,NULL,NULL,NULL,NULL,1,?3,?4)").bind(name, "qnfo-fleet-control/obs-reassert", "SETTINGS-ONLY: observability reassert (logs+traces+issues) by qnfo-fleet-control/" + VERSION, (/* @__PURE__ */ new Date()).toISOString()).run();
          } catch (e4) {}
        }
      } catch (e2) {}
    }
    if (patched > 0) { try { await env.AUDIT_DB.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text) VALUES (datetime('now'), 'obs-reassert', 'qnfo-fleet-control', ?)").bind("patched=" + patched + " skipped=" + skipped + " workers=" + patchedNames.join(",")).run(); } catch (e3) {} }
    return { ok: true, patched: patched, skipped: skipped, workers: patchedNames };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 300) };
  }
}
__name(reassertObservability, "reassertObservability");
var FleetAdvisor = advisorMod.FleetAdvisor;
export {
  FleetAdvisor,
  worker_default2 as default
};
//# sourceMappingURL=worker.js.map