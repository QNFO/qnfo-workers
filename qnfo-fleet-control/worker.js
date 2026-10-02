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
var VERSION = "0.4.103-reach-content-authored"; /* 0.4.102 REACH-INTAKE-1: catalog reach ideas carry an intake code-task line and anchor; 0.4.101 REACH-IDEATION-2: reach ideas also come from the busiest owned pages by RUM traffic, are filed value-first under a work-in-progress cap (4 buildable, 1 not-buildable gap), and every idea has an outcome row (metric at filing, close, +7d) that re-weights its check kind; reach_ideas_shipped_30d; 0.4.100 TRIGGER-PARSE-1: a trigger value is a number only when the whole string is one ("12 of 20" was read as 1220); 0.4.98 EVOLVE-NO-DOUBLE-1: EVOLVE-PR-1 skips an issue that carries a code-task line (the code loop owns it; AUTOTRIAGE-OWNER-ROUTE-1 made such issues eligible by naming their worker as owner); 0.4.97 BUDGET-LIVE-1: fleet_budget.current for crons, D1, KV, R2, queues and Vectorize is counted from the account on every budget audit (cron_schedules read 69 with 84 registered; d1_databases read 10 with 11 live); 0.4.96 UTF8-DEPLOY-1: the wrangler.toml cron read decodes GitHub base64 as UTF-8 (evDecode), like every other GitHub read here; 0.4.95 MERGE-THROUGHPUT-1: merges per tick read from ops_config (default 1); 0.4.94 TRIGGER-DISPATCH-1: metric-trigger issues are filed with a canonical priority, and a failed dispatch no longer starts the cooldown; 0.4.92 charterNum: an n/a or unmeasured marker is never a number (its reason digits were written to metric_history); 0.4.91 PERFORMANCE-LOOP-1 */

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
          var ta = evDecode(b64); // UTF8-DEPLOY-1: decode the bytes as UTF-8, not Latin-1
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
// ---- BUDGET-LIVE-1:BEGIN (pure; replayed by budget-live.test.mjs)
// BUDGET-LIVE-1 (2026-10-02): only fleet_budget.workers and the ai_spend rows were ever refreshed. Every other class kept
// the number typed on 2026-09-26, so a cap could be breached unseen (cron_schedules read 69 with 84 expressions
// registered; d1_databases read 10 with 11 databases live against a cap of 10). These classes are counted from the account.
var BUDGET_LIVE_SOURCES = {
  d1_databases: "/d1/database?per_page=100",
  kv_namespaces: "/storage/kv/namespaces?per_page=100",
  r2_buckets: "/r2/buckets?per_page=1000",
  queues: "/queues?per_page=100",
  vectorize_indexes: "/vectorize/v2/indexes?per_page=100"
};
// The count a Cloudflare list response states: result_info.total_count when it is at least the listed rows, else the
// listed rows. null = unreadable (never a zero, so a failed read cannot hide a breach).
function budgetLiveCount(j) {
  if (!j || j.success !== true) return null;
  var res = j.result, rows = Array.isArray(res) ? res : res && Array.isArray(res.buckets) ? res.buckets : null;
  if (!rows) return null;
  var tc = j.result_info ? Number(j.result_info.total_count) : NaN;
  return isFinite(tc) && tc >= rows.length ? tc : rows.length;
}
// ---- BUDGET-LIVE-1:END
async function budgetLiveCounts(env) {
  var live = {};
  try {
    var cr = await env.AUDIT.prepare("SELECT SUM(json_array_length(crons_json)) AS n, MAX(refreshed_at) AS at FROM worker_schedules WHERE json_valid(crons_json)").first();
    if (cr && cr.n != null && cr.at && Date.parse(cr.at) > Date.now() - 36 * 36e5) live.cron_schedules = Number(cr.n);
  } catch (e) {
  }
  await Promise.all(Object.keys(BUDGET_LIVE_SOURCES).map(async function (k) {
    try {
      var r = await timedFetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + BUDGET_LIVE_SOURCES[k], { headers: { Authorization: "Bearer " + (env.CF_DEPLOY_TOKEN || "") } }, 8e3);
      if (!r || !r.ok) return;
      var n = budgetLiveCount(await r.json());
      if (n != null) live[k] = n;
    } catch (e) {
    }
  }));
  return live;
}
async function budgetAudit(env, names) {
  var out = { classes: 0, over: [] };
  try {
    var live = Array.isArray(names) ? names.length : null;
    var liveBy = await budgetLiveCounts(env);
    out.live = liveBy;
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
      } else if (liveBy[r.node_class] != null) {
        var lv = liveBy[r.node_class];
        try {
          await env.AUDIT.prepare("UPDATE fleet_budget SET current=?1, updated_at=datetime('now') WHERE node_class=?2").bind(lv, r.node_class).run();
        } catch (e) {
        }
        if (lv > Number(r.cap)) out.over.push(r.node_class + " live=" + lv + " cap=" + r.cap + " (+" + (lv - Number(r.cap)) + ")");
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
    if (p === "/health") return json({ status: "ok", worker: "qnfo-fleet-deploy", version: VERSION, capabilities: ["fleet-deploy-watch", "auto-heal", "charter-loop", "portfolio-loop", "remediation-contracts", "loop-watch", "fleet-optimize", "objective-constraints", "improvement-loop", "performance-loop", "reach-ideation", "reach-ideation-2"], limitations: ["GET /charter, /loops, /constraints, /improvement, /reach-ideas, /report and /state/summary are public reads; every other route needs the deploy admin token, the self-heal token or its own trigger secret", "its loops run on its crons: every 20 minutes, hourly, daily 03:00, Monday 03:30 and monthly", "the charter live block and the portfolio files are regenerated by its loops; hand edits are overwritten", "energy_efficiency is a compute proxy from Workers AI neurons, not an energy meter; external providers' compute and the owner's own client keys are not observable", "metric trends need 4 daily metric_history points in each 7d window, so a metric is unmeasured for its first 10 days of history", "lever experiments move only knobs listed in PERFORMANCE-LOOP-1 (ops_config, compare-and-swap, one step within bounds); a trigger must name the lever and be hit on 3 consecutive metric_history days; ops_config perf_loop_enabled=0 stops new experiments"], enabled: await enabled(env), auto_heal: await autoHeal(env) });
    if (p === "/optimize" && request.method === "POST") {
      var ot = auth && env.OPTIMIZER_TRIGGER_SECRET && auth === env.OPTIMIZER_TRIGGER_SECRET;
      if (!ot) return json({ ok: false, error: "unauthorized" }, 401); // SECRET-LENGTH-LEAK-1 (2026-10-01): the 401 used to report the secret's length
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
// EVOLVE-NO-DOUBLE-1 (2026-10-02): an issue with a `code-task:` line already has a doer (qnfo-code-orchestrator ISSUE-INTAKE-1).
// Proposing a second edit for it here opened two pull requests against one worker and one VERSION line.
async function evPropose(env) {
  var model = env.EVOLVE_MODEL || "@cf/moonshotai/kimi-k2.7-code";
  var reviewer = env.REVIEW_MODEL || "@cf/openai/gpt-oss-120b";
  var cands = (await env.AUDIT.prepare("SELECT a.id, a.title, substr(a.description,1,1500) d, t.owner FROM agent_issues a JOIN issue_triage t ON t.issue_id=a.id WHERE a.status='open' AND a.priority IN ('high','medium','low') AND a.title NOT LIKE 'SEC-%' AND COALESCE(a.description,'') NOT LIKE '%code-task:%' AND a.category IN (" + EVOLVE_CATEGORIES.map(function(c) { return "'" + c + "'"; }).join(",") + ") AND a.id NOT IN (SELECT issue_id FROM evolve_candidates WHERE issue_id IS NOT NULL AND ts > datetime('now','-14 day')) ORDER BY CASE a.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, a.id LIMIT 40").all()).results || [];
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
// Shared by EVOLVE-PR-1 and CODE-TASK-MERGE-RUNNER-1 (0.4.85): the squash merge pinned to the tested head (a 405/409 asks
// GitHub to bring the branch up to date, so the checks run again on the new head), the canonical-deploy ledger row for a
// VERSION, and the post-deploy live check (a live audit taken after the deploy, http 200 with that VERSION or a healthy
// later deploy of the same worker).
async function evMergePr(env, prNumber, head, title, message) {
  var body = { merge_method: "squash", sha: head, commit_title: title };
  if (message) body.commit_message = message;
  var mg = await evApi(env, "PUT", "/pulls/" + prNumber + "/merge", body);
  if (!mg.ok && (mg.status === 405 || mg.status === 409)) await evApi(env, "PUT", "/pulls/" + prNumber + "/update-branch", {});
  return mg;
}
__name(evMergePr, "evMergePr");
async function evDeployRow(env, worker, versionTo) {
  return await env.AUDIT.prepare("SELECT ts FROM fleet_deploys WHERE worker=?1 AND to_sha=?2 AND ok=1 ORDER BY id DESC LIMIT 1").bind(worker, versionTo).first();
}
__name(evDeployRow, "evDeployRow");
async function evLiveCheck(env, worker, versionTo, sinceIso) {
  var la = await env.AUDIT.prepare("SELECT http, live_version, probed_at FROM worker_live_audit WHERE worker=?1").bind(worker).first();
  var since = Date.parse(sinceIso);
  var probedAfter = la && la.probed_at && Date.parse(String(la.probed_at).replace(" ", "T") + (/[zZ]$/.test(la.probed_at) ? "" : "Z")) > since;
  if (!probedAfter) return { state: "waiting", la: la };
  var mine = await env.AUDIT.prepare("SELECT MAX(id) id FROM fleet_deploys WHERE worker=?1 AND to_sha=?2 AND ok=1").bind(worker, versionTo).first();
  var later = mine && mine.id ? await env.AUDIT.prepare("SELECT COUNT(*) n FROM fleet_deploys WHERE worker=?1 AND ok=1 AND to_sha IS NOT NULL AND to_sha != ?2 AND id > ?3").bind(worker, versionTo, mine.id).first() : null;
  var superseded = !!(later && Number(later.n) > 0);
  return { state: la.http === 200 && (la.live_version === versionTo || superseded) ? "ok" : "failed", la: la, superseded: superseded };
}
__name(evLiveCheck, "evLiveCheck");
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
      var mg = await evMergePr(env, c.pr_number, head, pr.j.title + " (#" + c.pr_number + ")");
      if (mg.ok) { await evApi(env, "DELETE", "/git/refs/heads/" + c.branch); await evSet(env, c.id, "merged", "self-merged on green required checks", { merged_sha: mg.j && mg.j.sha }); return { cid: c.id, status: "merged" }; }
      return { cid: c.id, note: "merge HTTP " + mg.status };
    }
    if (ageH > 3) { await evClosePr(env, c.pr_number, c.branch); await evSet(env, c.id, "ci-timeout", "required checks not complete after 3h"); return { cid: c.id, status: "ci-timeout" }; }
    return { cid: c.id, status: "pr-open", note: "waiting on checks" };
  }
  if (c.status === "merged") {
    var dep = await evDeployRow(env, c.worker, c.version_to);
    if (dep) { await evSet(env, c.id, "deployed", "canonical deploy " + dep.ts, { deployed_at: dep.ts }); return { cid: c.id, status: "deployed" }; }
    if (ageH > 3) { await evSet(env, c.id, "deploy-missing", "no fleet_deploys row for " + c.version_to + " 3h after merge"); return { cid: c.id, status: "deploy-missing" }; }
    return { cid: c.id, status: "merged", note: "waiting on canonical deploy" };
  }
  if (c.status === "deployed") {
    var lc = await evLiveCheck(env, c.worker, c.version_to, c.deployed_at || c.updated_at);
    if (lc.state === "waiting") return { cid: c.id, status: "deployed", note: "waiting on a live audit after deploy" };
    var la = lc.la;
    if (lc.state === "ok") {
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
// EVOLVE-HEARTBEAT-1 (0.4.84, agent_issues 1726): evolveTick writes evolve_candidates only when it proposes. An idle loop
// (no eligible issue, the 6h gap, the 3-rejection backoff) therefore looked stalled to the fleet-dashboard watchmaker
// (fleet-defects) after 48h. Each completed tick upserts one cloud_ops_events row per UTC day, evolve-tick-<day>, status
// 'ok', with its outcome. A tick that bails (no GITHUB_TOKEN, no AI binding), throws, or cannot reach GitHub for its
// in-flight candidate writes nothing, so a broken loop still goes stale.
async function evolveTickHeartbeat(env) {
  var r = await evolveTick(env, false);
  var stuck = r && r.advanced && /HTTP \d/.test(String(r.advanced.note || ""));
  if (r && r.ok && !stuck) {
    try {
      var now = new Date().toISOString();
      await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?1, ?2, 'evolve-tick', ?3, 'qnfo-fleet-control', 'ok') ON CONFLICT(id) DO UPDATE SET ts = excluded.ts, text = excluded.text, status = 'ok'")
        .bind("evolve-tick-" + now.slice(0, 10), now, JSON.stringify(r).slice(0, 300)).run();
    } catch (e) {}
  }
  return r;
}
__name(evolveTickHeartbeat, "evolveTickHeartbeat");
// ---- CODE-TASK-MERGE-RUNNER-1:BEGIN (0.4.86, agent_issues 1726, pillar autonomy) ----
// NO-CLAUDE-RUNTIME-DEPENDENCY-1: qnfo-code-orchestrator turns an issue into a verified patch and code-task-publish pushes
// it as a branch, but nothing on Cloudflare merged a code-loop PR (PRs 297, 368 and 381 were merged by a person), so the
// watchmaker op code-task-merge counted. This hourly runner opens and merges code-loop PRs itself, through EVOLVE-PR-1's
// token, merge call, deploy-ledger and live-audit checks and revert pipeline.
// OPEN: a PR opened with the Actions GITHUB_TOKEN starts no pull_request workflow (PR 368 carries only CodeQL), and the
// workflow holds no other GitHub credential (its secrets are Cloudflare ones and GITHUB_TOKEN; the fleet token is a worker
// secret it cannot read). So code-task-publish pushes the branch and stops at 'branch_pushed' (CODE_TASK_PR_OPENER), and
// this runner opens the PR with the fleet token: a real 'opened' event, so CI starts by itself. It opens only a branch
// that passes the identity, verify, scope, provenance and integrity gates below (CI on a pull request runs its code); an
// existing PR for the branch is adopted. A branch that fails a gate is a refusal with the compare URL kept for a person.
// MERGE, only when every gate holds:
//   identity    code_tasks status 'published' (pull mode) or 'pr_open' (code-agent path); branch is the loop's own
//               codeagent-<id[3:15]>; pr_url is a QNFO/qnfo-workers pull whose head is that branch in this repo, base main;
//   verify      the orchestrator's own verify passed: step 'done', attempts < 3, no last_error, the verified patch (pull
//               mode) or whole-file proposal (code-agent path) is stored in ctx;
//   scope       the PR changes exactly the task path, plus its deployed-current mirror for a worker.js; the path is a
//               worker.js of a worker outside CM_DENY with no [[containers]], or a Markdown document (docs/**.md,
//               <dir>/README.md). Scripts, workflows, configs, migrations and tests never auto-merge;
//   provenance  a direct enqueue, or an agent_issue whose source is trusted (CM_TRUSTED_SOURCES, or ops_config
//               code_merge_trusted_sources), so feed or model text that carries a code-task line cannot reach main;
//   integrity   each changed file at the PR head equals the verified patch applied to its merge base (nothing else pushed);
//   revertible  a worker.js has one bumpable `var VERSION` and the stored patch inverts on the head, so a failed live check
//               reverts automatically;
//   checks      every required check (EVOLVE_REQUIRED where its workflow runs for these paths, plus charter and test)
//               completed with success on the head; no other check failed or is running; the commit status is not failing;
//   mergeable   open, not draft, mergeable; at most CM_MAX_MERGES per tick, and never while the same worker has a change
//               (code task or evolve candidate) in flight.
// No required check on a head CM_CHECKS_WAIT_H after the runner first saw it is a refusal (for example an older PR opened
// with the Actions GITHUB_TOKEN). A refusal sets status 'needs_human' with last_error "merge-runner: <reason>" and
// comments the reason on the PR; a transient gap only waits (merge_note).
// After a merge: merged_by 'qnfo-fleet-control'. A worker.js follows evolve's verification (fleet_deploys row for the new
// VERSION within CM_DEPLOY_WAIT_H, then worker_live_audit http 200 with it or a healthy later deploy); a failed live check
// opens an inverse-patch revert PR as an evolve 'revert' candidate, merged and verified by evAdvance like evolve's own.
// Kill switch: ops_config code_merge_runner_enabled ('0' / 'off' stops opening and merging; absent = CM_DEFAULT_ENABLED;
// pushed branches then wait for a person, compare URL in pr_url). Each tick upserts cloud_ops_events
// code-merge-tick-<UTC day> (status ok, disabled or error); the first ok tick also writes code-merge-first-ok once (the
// watchmaker counts person merges only after it); every action writes one cloud_ops_events row.
var CM_DEFAULT_ENABLED = true;
var CM_RUNNER = "qnfo-fleet-control";
var CM_PULL_RE = /^https:\/\/github\.com\/QNFO\/qnfo-workers\/pull\/(\d+)$/;
var CM_DENY = EVOLVE_DENY.concat(["qnfo-code-orchestrator", "qnfo-code-agent"]);
var CM_TRUSTED_SOURCES = "qnfo-fleet-dashboard:owner-request|OWNER-TASK-,qnfo-fleet-dashboard:owner-request|OWNER-NOTE-,claude-session*,claude-code-session*";
var CM_CHECKS_WAIT_H = 3;
var CM_DEPLOY_WAIT_H = 3;
var CM_MAX_CANDIDATES = 5;
var CM_MAX_MERGES = 1;
var CM_OK = ["success", "neutral", "skipped"];
var CM_INFLIGHT = ["deploying", "deployed", "reverting"];
var CM_COLS = ["merged_by TEXT", "merged_sha TEXT", "merged_at TEXT", "merge_state TEXT", "merge_note TEXT", "green_since TEXT", "nochecks_sha TEXT", "nochecks_since TEXT", "pr_opened_by TEXT", "pr_opened_at TEXT", "version_to TEXT", "deployed_at TEXT", "revert_cid INTEGER", "merge_checked_at TEXT"];
var CM_VDECL = /^(?:var|const|let) VERSION = "/;
function cmCtx(t) {
  try { return t && t.ctx ? JSON.parse(t.ctx) : {}; } catch (e) { return null; }
}
__name(cmCtx, "cmCtx");
function cmIssueId(goal) {
  var m = /^\[issue #(\d+)\]/.exec(String(goal || ""));
  return m ? Number(m[1]) : null;
}
__name(cmIssueId, "cmIssueId");
// Which paths may auto-merge, and how a merge is verified.
function cmScope(path) {
  var m = /^([a-z0-9][a-z0-9-]*)\/worker\.js$/.exec(path);
  if (m) {
    if (CM_DENY.indexOf(m[1]) >= 0) return { ok: false, why: m[1] + " is a control-plane or code-loop worker, which never auto-merges" };
    return { ok: true, kind: "worker", worker: m[1], mirror: m[1] + "/deployed-current.worker.js" };
  }
  if ((/^docs\/[A-Za-z0-9._\/-]+\.md$/.test(path) || /^[a-z0-9][a-z0-9-]*\/README\.md$/.test(path)) && path.indexOf("..") < 0) return { ok: true, kind: "doc" };
  return { ok: false, why: "path " + path + " is outside the auto-merge scope (a worker.js with its mirror, docs/**.md, <dir>/README.md)" };
}
__name(cmScope, "cmScope");
// The required checks are EVOLVE_REQUIRED where their workflows run for these paths (version-bump-guard, job 'guard', runs
// only for */worker.js and mirrors), plus charter-guard ('charter') and code-loop-test ('test') where those run.
function cmRequired(files) {
  var req = EVOLVE_REQUIRED.filter(function(n) { return n !== "guard"; });
  if (files.some(function(f) { return /^[^/]+\/(deployed-current\.)?worker\.js$/.test(f); })) req.push("guard");
  if (files.some(function(f) { return /^(docs\/QUNIVERSE-CHARTER\.md|docs\/PORTFOLIO\.md|qnfo-fleet-control\/)/.test(f); })) req.push("charter");
  if (files.some(function(f) { return /^qnfo-code-orchestrator\//.test(f); })) req.push("test");
  return req;
}
__name(cmRequired, "cmRequired");
// The latest run per check name decides (a re-run or a superseding run has a higher id), as in evAdvance. A required
// check must end 'success'; any other check must end success, neutral or skipped.
function cmChecks(runs, statusJ, required) {
  var missing = [], failed = [], pending = [], other = [], by = {};
  (runs || []).forEach(function(r) { if (!by[r.name] || Number(r.id) > Number(by[r.name].id)) by[r.name] = r; });
  required.forEach(function(n) {
    var r = by[n];
    if (!r) missing.push(n);
    else if (r.status !== "completed") pending.push(n);
    else if (r.conclusion !== "success") failed.push(n + "=" + r.conclusion);
  });
  Object.keys(by).forEach(function(n) {
    if (required.indexOf(n) >= 0) return;
    if (by[n].status !== "completed") pending.push(n);
    else if (CM_OK.indexOf(by[n].conclusion) < 0) other.push(n + "=" + by[n].conclusion);
  });
  var st = statusJ && Number(statusJ.total_count) > 0 ? String(statusJ.state || "") : "none";
  return { missing: missing, failed: failed, pending: pending, other: other, status: st };
}
__name(cmChecks, "cmChecks");
function cmTrusted(source, title, list) {
  var entries = String(list || CM_TRUSTED_SOURCES).split(",").map(function(s) { return s.trim(); }).filter(Boolean);
  for (var i = 0; i < entries.length; i++) {
    var parts = entries[i].split("|"), sp = parts[0], tp = parts[1] || "", src = String(source || "");
    var ok = sp.slice(-1) === "*" ? src.indexOf(sp.slice(0, -1)) === 0 : src === sp;
    if (ok && (!tp || String(title || "").indexOf(tp) === 0)) return true;
  }
  return false;
}
__name(cmTrusted, "cmTrusted");
// ---- unified diff: parse the stored patch and apply it (forward to check integrity, reverse to build a revert) ----
function cmParsePatch(patch) {
  var out = {}, cur = null, h = null, last = null, ls = String(patch || "").split("\n");
  var mark = function(c) { if (c === "-" || c === " ") h.oldNoEol = true; if (c === "+" || c === " ") h.newNoEol = true; };
  for (var i = 0; i < ls.length; i++) {
    var l = ls[i];
    if (h && (h.ro > 0 || h.rn > 0)) {
      var c = l.charAt(0), x = l.slice(1);
      if (c === "\\") { mark(last); continue; }
      if (c === " ") { h.old.push(x); h.neu.push(x); h.ro--; h.rn--; }
      else if (c === "-" && h.ro > 0) { h.old.push(x); h.ro--; }
      else if (c === "+" && h.rn > 0) { h.neu.push(x); h.rn--; }
      else return null;
      last = c;
      continue;
    }
    if (h && l.charAt(0) === "\\") { mark(last); continue; }
    if (l.indexOf("diff --git ") === 0) { cur = null; h = null; continue; }
    if (l.indexOf("+++ ") === 0) { var p = l.slice(4).replace(/^b\//, ""); cur = out[p] = out[p] || []; h = null; continue; }
    var hm = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(l);
    if (hm && cur) {
      h = { os: Number(hm[1]), ns: Number(hm[3]), old: [], neu: [], oldNoEol: false, newNoEol: false, ro: hm[2] == null ? 1 : Number(hm[2]), rn: hm[4] == null ? 1 : Number(hm[4]) };
      cur.push(h);
      continue;
    }
  }
  return out;
}
__name(cmParsePatch, "cmParsePatch");
// Applies hunks like `git apply` (exact context, nearest offset). reverse swaps the sides; wild treats any two VERSION
// declarations as equal (a revert keeps main's VERSION and bumps it). Returns the new text, or null if a hunk does not fit.
function cmApply(text, hunks, reverse, wild) {
  if (!hunks || !hunks.length) return null;
  text = String(text == null ? "" : text);
  var L = text === "" ? [] : text.split("\n"), eol = L.length > 0 && L[L.length - 1] === "";
  if (eol) L.pop();
  var shift = 0, cursor = 0;
  var same = function(a, b) { return a === b || !!(wild && CM_VDECL.test(a) && CM_VDECL.test(b)); };
  for (var i = 0; i < hunks.length; i++) {
    var hk = hunks[i];
    var from = reverse ? hk.neu : hk.old, to = reverse ? hk.old : hk.neu;
    var fromNoEol = reverse ? hk.newNoEol : hk.oldNoEol, toNoEol = reverse ? hk.oldNoEol : hk.newNoEol;
    var start = reverse ? hk.ns : hk.os, at = -1, exp;
    if (!from.length) {
      exp = start + shift;
      at = Math.max(cursor, exp);
      if (at > L.length) return null;
    } else {
      exp = start - 1 + shift;
      var maxK = L.length - from.length;
      for (var d = 0; at < 0; d++) {
        var lo = exp - d, hi = exp + d;
        if (lo < cursor && hi > maxK) break;
        var tries = d === 0 ? [exp] : [lo, hi];
        for (var q = 0; q < tries.length && at < 0; q++) {
          var k = tries[q];
          if (k < cursor || k > maxK) continue;
          var fit = true;
          for (var j = 0; j < from.length; j++) if (!same(L[k + j], from[j])) { fit = false; break; }
          if (fit) at = k;
        }
      }
      if (at < 0) return null;
    }
    var atEof = at + from.length === L.length;
    if (fromNoEol && !(atEof && !eol)) return null;
    if (from.length && atEof && !eol && !fromNoEol) return null;
    Array.prototype.splice.apply(L, [at, from.length].concat(to));
    if (atEof) eol = !toNoEol;
    shift += (at - exp) + (to.length - from.length);
    cursor = at + to.length;
  }
  return L.length ? L.join("\n") + (eol ? "\n" : "") : "";
}
__name(cmApply, "cmApply");
// Like evBump, but tolerates a trailing comment after the VERSION literal (several workers keep a changelog there).
function cmBump(content, tag) {
  var all = String(content).match(/^var\sVERSION\s=\s"[^"\n]*";/gm) || [];
  if (all.length !== 1) return null;
  var m = /^var\sVERSION\s=\s"(\d+)\.(\d+)\.(\d+)([^"\n]*)";/m.exec(content);
  if (!m) return null;
  var from = m[1] + "." + m[2] + "." + m[3] + m[4], to = m[1] + "." + m[2] + "." + (Number(m[3]) + 1) + tag;
  return { from: from, to: to, content: content.replace(m[0], function() { return 'var VERSION = "' + to + '";'; }) };
}
__name(cmBump, "cmBump");
// Inverse of the merged patch on today's main: undo the task's hunks, keep main's VERSION and bump it.
function cmRevertText(mainText, hunks, tag) {
  var rev = cmApply(mainText, hunks, true, true);
  if (rev == null) return null;
  var mv = /^var\sVERSION\s=\s"[^"\n]*";/m.exec(mainText), rv = /^var\sVERSION\s=\s"[^"\n]*";/m.exec(rev);
  if (!mv || !rv) return null;
  return cmBump(rev.replace(rv[0], function() { return mv[0]; }), tag);
}
__name(cmRevertText, "cmRevertText");
// ---- the decision (pure: the code_tasks row and what GitHub said -> one action) ----
function cmRefuse(why) { return { action: "refuse", why: why }; }
__name(cmRefuse, "cmRefuse");
function cmWait(why, green) { return { action: "wait", why: why, green: !!green }; }
__name(cmWait, "cmWait");
// Gates that hold for the task and its changed files whatever the PR state: verify, scope, provenance (and, last,
// integrity). Shared by opening (cmOpenDecide) and merging (cmDecide). Returns null when they pass.
function cmTaskGates(t, files, provenance) {
  var ctx = cmCtx(t);
  if (!ctx) return cmRefuse("the code task's ctx is not valid JSON");
  if (t.step !== "done" || !(Number(t.attempts) < 3) || (t.last_error != null && String(t.last_error).trim() !== "")) return cmRefuse("the code task's own verify is not recorded as passed (step " + t.step + ", attempts " + t.attempts + (t.last_error ? ", last_error set" : "") + ")");
  var wantPatch = t.status !== "pr_open";
  var stored = wantPatch ? typeof ctx.patch === "string" && ctx.patch.trim() : typeof ctx.proposal === "string" && ctx.proposal.length > 0;
  if (!stored) return cmRefuse("the verified " + (wantPatch ? "patch" : "proposal") + " is not stored in the code task");
  var sc = cmScope(String(t.path || ""));
  if (!sc.ok) return cmRefuse(sc.why);
  files = files || [];
  var names = files.map(function(f) { return f.filename; });
  var allowed = [t.path].concat(sc.mirror ? [sc.mirror] : []);
  var bad = files.filter(function(f) { return allowed.indexOf(f.filename) < 0 || ["modified", "changed"].indexOf(f.status) < 0; });
  if (names.indexOf(t.path) < 0 || bad.length || files.length >= 100) return cmRefuse("the branch changes " + (names.join(", ") || "nothing") + "; only " + allowed.join(" and ") + " may change, as modifications");
  if (!provenance || provenance.transient) return cmWait(provenance ? provenance.why : "provenance not read");
  if (!provenance.ok) return cmRefuse(provenance.why);
  return null;
}
__name(cmTaskGates, "cmTaskGates");
function cmIntegrityGate(t, integ) {
  var sc = cmScope(String(t.path || ""));
  if (!integ) return { action: "need-integrity" };
  if (integ.transient) return cmWait(integ.why);
  if (!integ.ok) return cmRefuse(integ.why);
  if (sc.kind === "worker" && integ.containers) return cmRefuse(sc.worker + " declares [[containers]]; the canonical deploy cannot carry it");
  if (sc.kind === "worker" && !integ.revertible) return cmRefuse("not auto-revertible: " + (integ.revert_why || "unknown"));
  return null;
}
__name(cmIntegrityGate, "cmIntegrityGate");
// A pushed codeagent branch with no PR yet (status branch_pushed): adopt a PR that exists for it, or open one with the
// fleet token once the gates pass. g = { pulls, head_sha, branch_missing, files, provenance, integrity }.
function cmOpenDecide(t, g) {
  g = g || {};
  var branch = "codeagent-" + String(t.id || "").slice(3, 15);
  if (t.repo !== "qnfo-workers" || t.branch !== branch) return cmRefuse("not a code-loop branch (expected " + branch + ")");
  if (!g.pulls) return cmWait("pull requests for " + branch + " not read");
  var ex = g.pulls.filter(function(p) { return p && p.head && p.head.ref === branch && p.head.repo && p.head.repo.full_name === EVOLVE_REPO && p.base && p.base.ref === "main"; })[0];
  if (ex) return { action: "adopt", pr: ex.number, why: "a pull request for " + branch + " already exists (#" + ex.number + ")" };
  if (g.branch_missing) return cmRefuse("branch " + branch + " no longer exists");
  if (!g.head_sha) return cmWait("branch " + branch + " not read");
  var tg = cmTaskGates(t, g.files, g.provenance);
  if (tg) return tg;
  var ig = cmIntegrityGate(t, g.integrity);
  if (ig) return ig;
  return { action: "open", why: "verified, in scope, trusted and intact on " + String(g.head_sha).slice(0, 7) };
}
__name(cmOpenDecide, "cmOpenDecide");
function cmDecide(t, g, nowMs) {
  g = g || {};
  var refuse = cmRefuse, wait = cmWait;
  var branch = "codeagent-" + String(t.id || "").slice(3, 15);
  var m = CM_PULL_RE.exec(String(t.pr_url || ""));
  if (!m || t.repo !== "qnfo-workers" || t.branch !== branch) return refuse("not a code-loop pull request (expected branch " + branch + " and a QNFO/qnfo-workers pull URL)");
  var pr = g.pr;
  if (!pr) return wait("pull request not read");
  if (pr.merged) return { action: "reconcile", status: "merged", by: pr.merged_by && pr.merged_by.login ? "gh:" + pr.merged_by.login : "person" };
  if (pr.state === "closed") return { action: "reconcile", status: "closed" };
  if (pr.state !== "open") return wait("pull request state " + pr.state);
  var head = pr.head || {}, base = pr.base || {};
  if (head.ref !== branch || !head.repo || head.repo.full_name !== EVOLVE_REPO || base.ref !== "main" || !base.repo || base.repo.full_name !== EVOLVE_REPO) return refuse("the pull request is not " + branch + " -> main inside " + EVOLVE_REPO);
  var tg = cmTaskGates(t, g.files, g.provenance);
  if (tg) return tg;
  var sc = cmScope(String(t.path || "")), names = (g.files || []).map(function(f) { return f.filename; });
  if (pr.draft) return wait("the pull request is a draft");
  var req = cmRequired(names), ck = cmChecks(g.checks, g.status, req), sha7 = String(head.sha || "").slice(0, 7);
  if (ck.failed.length) return refuse("required check(s) failed on " + sha7 + ": " + ck.failed.join(", "));
  if (ck.status === "failure" || ck.status === "error") return refuse("the commit status on " + sha7 + " is " + ck.status);
  if (ck.missing.length === req.length && !ck.pending.length) {
    // No required check started on this head. A PR the runner opened starts them within minutes; one opened with the
    // Actions GITHUB_TOKEN never does. The clock starts the first time the runner sees this head without checks.
    if (t.nochecks_sha === head.sha) {
      var nAge = (nowMs - Date.parse(t.nochecks_since || "")) / 36e5;
      if (nAge > CM_CHECKS_WAIT_H) return refuse("no required check (" + req.join(", ") + ") started on " + sha7 + " within " + CM_CHECKS_WAIT_H + "h (a pull request opened with the Actions GITHUB_TOKEN starts none; push to the branch or reopen the PR, then set the task back to 'published')");
      return wait("no required check has started on " + sha7 + " yet");
    }
    var w = wait("no required check has started on " + sha7 + " yet");
    w.mark = { nochecks_sha: head.sha, nochecks_since: new Date(nowMs).toISOString() };
    return w;
  }
  if (ck.missing.length || ck.pending.length) return wait("waiting on checks" + (ck.missing.length ? "; missing " + ck.missing.join(", ") : "") + (ck.pending.length ? "; running " + ck.pending.join(", ") : ""));
  if (ck.other.length) return wait("a non-required check failed (" + ck.other.join(", ") + "); not merging until it passes");
  if (ck.status === "pending") return wait("the commit status is pending");
  if (pr.mergeable == null) return wait("GitHub is still computing mergeability");
  if (pr.mergeable === false || pr.mergeable_state === "dirty") return refuse("the pull request conflicts with main (mergeable_state " + pr.mergeable_state + ")");
  var ig = cmIntegrityGate(t, g.integrity);
  if (ig) return ig;
  return { action: "merge", why: "required checks " + req.join(", ") + " green on " + sha7, required: req, kind: sc.kind, worker: sc.worker || null, version_to: g.integrity.version_to || null, green: true };
}
__name(cmDecide, "cmDecide");
// ---- I/O ----
async function cmRead(env, path, ref) {
  var r = await evApi(env, "GET", "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(ref));
  if (r.status === 404) return { missing: true };
  if (!r.ok || !r.j) return { transient: true, why: "contents " + path + " HTTP " + r.status };
  if (r.j.encoding !== "base64" || typeof r.j.content !== "string") return { tooLarge: true };
  return { text: evDecode(r.j.content) };
}
__name(cmRead, "cmRead");
async function cmIntegrity(env, t, head, names, sc, mergeBase) {
  var ctx = cmCtx(t) || {}, mb = mergeBase || null;
  if (!mb) {
    var cmp = await evApi(env, "GET", "/compare/main..." + head);
    mb = cmp.j && cmp.j.merge_base_commit && cmp.j.merge_base_commit.sha;
    if (!mb) return { ok: false, transient: true, why: "compare HTTP " + cmp.status };
  }
  var hunks = t.status !== "pr_open" ? cmParsePatch(ctx.patch) : null;
  if (t.status !== "pr_open") {
    if (!hunks) return { ok: false, why: "the stored patch cannot be parsed" };
    if (Object.keys(hunks).sort().join(",") !== names.slice().sort().join(",")) return { ok: false, why: "the pull request files (" + names.join(", ") + ") are not the files of the verified patch (" + Object.keys(hunks).join(", ") + ")" };
  } else if (names.length !== 1) return { ok: false, why: "a code-agent pull request may change only " + t.path };
  var out = { ok: true }, headText = null;
  for (var i = 0; i < names.length; i++) {
    var f = names[i], h = await cmRead(env, f, head);
    if (h.transient) return { ok: false, transient: true, why: h.why };
    if (h.text == null) return { ok: false, why: f + " cannot be read at the PR head (" + (h.missing ? "missing" : "too large for the contents API") + ")" };
    var want;
    if (hunks) {
      var b = await cmRead(env, f, mb);
      if (b.transient) return { ok: false, transient: true, why: b.why };
      if (b.text == null) return { ok: false, why: f + " cannot be read at the merge base " + mb.slice(0, 7) };
      want = cmApply(b.text, hunks[f], false, false);
      if (want == null) return { ok: false, why: "the verified patch does not apply to " + f + " at the merge base " + mb.slice(0, 7) };
    } else want = ctx.proposal;
    if (h.text !== want) return { ok: false, why: f + " at the PR head " + head.slice(0, 7) + " is not the verified patch (other content was pushed)" };
    if (f === t.path) headText = h.text;
  }
  out.merge_base = mb;
  if (sc.kind === "worker") {
    var vm = /^(?:var|const|let) VERSION = "([^"\n]*)"/m.exec(headText || "");
    out.version_to = vm ? vm[1] : null;
    if (!hunks) { out.revertible = false; out.revert_why = "a code-agent pull request stores no patch to invert"; }
    else if (!vm || !cmBump(headText, "-x")) { out.revertible = false; out.revert_why = "no single `var VERSION = \"x.y.z...\"` line to bump"; }
    else if (!cmRevertText(headText, hunks[t.path], "-x")) { out.revertible = false; out.revert_why = "the patch does not invert on the head"; }
    else out.revertible = true;
    var toml = await cmRead(env, sc.worker + "/wrangler.toml", head);
    if (toml.transient) return { ok: false, transient: true, why: toml.why };
    if (toml.text == null) return { ok: false, why: sc.worker + " has no wrangler.toml, so nothing deploys it" };
    out.containers = /^\[\[containers\]\]/m.test(toml.text);
  }
  return out;
}
__name(cmIntegrity, "cmIntegrity");
async function cmConfig(env) {
  var cfg = { enabled: CM_DEFAULT_ENABLED, raw: "absent (default " + (CM_DEFAULT_ENABLED ? "on" : "off") + ")", trusted: CM_TRUSTED_SOURCES, maxMerges: CM_MAX_MERGES };
  try {
    var rows = (await env.AUDIT.prepare("SELECT key, value FROM ops_config WHERE key IN ('code_merge_runner_enabled', 'code_merge_trusted_sources', 'code_merge_max_merges_per_tick')").all()).results || [];
    rows.forEach(function(r) {
      if (r.key === "code_merge_runner_enabled" && r.value != null) { cfg.raw = String(r.value); cfg.enabled = ["0", "off", "false", "no", "disabled"].indexOf(String(r.value).trim().toLowerCase()) < 0; }
      if (r.key === "code_merge_trusted_sources" && r.value) cfg.trusted = String(r.value);
      // MERGE-THROUGHPUT-1 (2026-10-02): at one merge per hourly tick, six verified codeagent branches waited most of a day
      // (measured 08:35Z: 6 branch_pushed, 1 open PR). The limit is a dial, 1 to 5, default CM_MAX_MERGES; the rule that a
      // worker with a change in flight gets no second merge is unchanged, so parallel merges always land on different workers.
      if (r.key === "code_merge_max_merges_per_tick") { var mm = parseInt(r.value, 10); if (isFinite(mm)) cfg.maxMerges = Math.max(1, Math.min(5, mm)); }
    });
  } catch (e) {}
  return cfg;
}
__name(cmConfig, "cmConfig");
async function cmSchema(env) {
  var have = {};
  try { ((await env.AUDIT.prepare("PRAGMA table_info(code_tasks)").all()).results || []).forEach(function(r) { have[r.name] = 1; }); } catch (e) { return false; }
  if (!have.id) return false;
  for (var i = 0; i < CM_COLS.length; i++) {
    if (have[CM_COLS[i].split(" ")[0]]) continue;
    try { await env.AUDIT.prepare("ALTER TABLE code_tasks ADD COLUMN " + CM_COLS[i]).run(); } catch (e) {}
  }
  return true;
}
__name(cmSchema, "cmSchema");
async function cmSave(env, cx, id, f, opts) {
  opts = opts || {};
  var keys = Object.keys(f), sets = [], vals = [];
  keys.forEach(function(k) { vals.push(f[k]); sets.push(k + "=?" + vals.length); });
  if (opts.touch) { vals.push(cx.iso); sets.push("updated_at=?" + vals.length); }
  vals.push(id);
  var sql = "UPDATE code_tasks SET " + sets.join(", ") + " WHERE id=?" + vals.length;
  if (opts.ifStatus) { vals.push(opts.ifStatus); sql += " AND status=?" + vals.length; }
  var st = env.AUDIT.prepare(sql);
  var r = await st.bind.apply(st, vals).run();
  return !!(r && r.meta && r.meta.changes);
}
__name(cmSave, "cmSave");
async function cmEvent(env, cx, action, t, text, status, meta) {
  try {
    await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
      .bind("cm-" + (t ? t.id : "tick") + "-" + action + "-" + cx.now + "-" + Math.random().toString(36).slice(2, 6), cx.iso, "code-merge." + action, String(text || "").slice(0, 500), meta ? JSON.stringify(meta).slice(0, 1000) : null, CM_RUNNER, status || "ok").run();
  } catch (e) {}
}
__name(cmEvent, "cmEvent");
async function cmHeartbeat(env, cx, status, summary) {
  // code-merge-first-ok: the first ok tick, written once and never updated (the day rows are upserted, so their ts moves).
  // The watchmaker counts a person's merge or close of a code-loop PR only after it.
  if (status === "ok") {
    try { await env.AUDIT.prepare("INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES ('code-merge-first-ok', ?1, 'code-merge-first-ok', 'first ok tick of CODE-TASK-MERGE-RUNNER-1', ?2, 'ok')").bind(cx.iso, CM_RUNNER).run(); } catch (e) {}
  }
  try {
    await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?1, ?2, 'code-merge-tick', ?3, ?4, ?5) ON CONFLICT(id) DO UPDATE SET ts = excluded.ts, text = excluded.text, status = excluded.status")
      .bind("code-merge-tick-" + cx.iso.slice(0, 10), cx.iso, JSON.stringify(summary || {}).slice(0, 300), CM_RUNNER, status).run();
  } catch (e) {}
}
__name(cmHeartbeat, "cmHeartbeat");
async function cmIssueNote(env, t, text) {
  var iid = cmIssueId(t.goal);
  if (!iid) return;
  try { await env.AUDIT.prepare("UPDATE agent_issues SET description = description || ?1, updated_at=?2 WHERE id=?3").bind(" | CODE-TASK-MERGE-RUNNER-1: " + text, Date.now(), iid).run(); } catch (e) {}
}
__name(cmIssueNote, "cmIssueNote");
async function cmFileIssue(env, title, desc) {
  try { await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) SELECT ?1, ?2, 'qnfo-fleet-control', 'reliability', 'high', 'open', ?3, ?3 WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = ?1 AND status = 'open')").bind(title, desc, Date.now()).run(); } catch (e) {}
}
__name(cmFileIssue, "cmFileIssue");
// A failed live check: open the inverse-patch PR as an evolve 'revert' candidate; evAdvance merges and verifies it.
async function cmRevert(env, cx, t, why) {
  await evSchema(env);
  var sc = cmScope(t.path), ctx = cmCtx(t) || {}, prn = Number((CM_PULL_RE.exec(String(t.pr_url || "")) || [])[1] || 0);
  var hunks = (cmParsePatch(ctx.patch) || {})[t.path];
  var ins = await env.AUDIT.prepare("INSERT INTO evolve_candidates (worker, ts, status, kind, issue_id, path, proposal, updated_at) VALUES (?1, ?2, 'proposing', 'revert', ?3, ?4, ?5, ?2)").bind(sc.worker, cx.iso, cmIssueId(t.goal), t.path, JSON.stringify({ code_task: t.id, pr: prn, rationale: "revert of code task " + t.id + ": " + why })).run();
  var rid = ins.meta.last_row_id;
  var main = await cmRead(env, t.path, "main");
  var built = main.text != null && hunks ? cmRevertText(main.text, hunks, "-revert-c" + rid) : null;
  var pr = built ? await evOpenPr(env, rid, sc.worker, sc.worker, built.content, "evolve(" + sc.worker + "): revert code task " + t.id, "Automatic revert of code task " + t.id + " (PR " + prn + ", merged by CODE-TASK-MERGE-RUNNER-1): " + why + "\n\nVERSION " + built.from + " -> " + built.to + ". The inverse of the merged patch on today's main; merged by EVOLVE-PR-1 only on green required checks and verified live after canonical-deploy.") : { ok: false, why: main.text == null ? "cannot read " + t.path + " on main" : "the merged patch no longer inverts on main" };
  if (!pr.ok) {
    await evSet(env, rid, "revert-failed", pr.why);
    await cmFileIssue(env, "CODE-MERGE-REVERT-FAILED-1: " + sc.worker + " code task " + t.id + " needs a manual revert", "Code task " + t.id + " (PR " + prn + ", VERSION " + t.version_to + "), merged by qnfo-fleet-control CODE-TASK-MERGE-RUNNER-1, failed post-deploy verification (" + why + ") and the inverse-patch revert could not be opened: " + pr.why + ". DoD: the change is reverted or fixed and worker_live_audit shows the worker http 200.");
    return { ok: false, rid: rid, why: pr.why };
  }
  await evSet(env, rid, "pr-open", "PR " + pr.pr + " (revert of code task " + t.id + ")", { pr_number: pr.pr, branch: pr.branch, head_sha: pr.head, version_from: built.from, version_to: built.to });
  return { ok: true, rid: rid, pr: pr.pr };
}
__name(cmRevert, "cmRevert");
// Post-merge verification of a runner merge: the same ledger and live-audit checks as evAdvance.
async function cmAdvance(env, cx, t) {
  var sc = cmScope(t.path), ageH = (cx.now - Date.parse(t.merged_at || t.updated_at)) / 36e5;
  if (t.merge_state === "deploying") {
    var dep = await evDeployRow(env, sc.worker, t.version_to);
    if (dep) { await cmSave(env, cx, t.id, { merge_state: "deployed", deployed_at: dep.ts, merge_note: "canonical deploy " + dep.ts }); await cmEvent(env, cx, "deployed", t, t.path + " " + t.version_to + " deployed " + dep.ts); return { id: t.id, merge_state: "deployed" }; }
    if (ageH > CM_DEPLOY_WAIT_H) { await cmSave(env, cx, t.id, { merge_state: "deploy-missing", merge_note: "no fleet_deploys row for " + t.version_to + " " + CM_DEPLOY_WAIT_H + "h after merge" }, { touch: true }); await cmEvent(env, cx, "deploy-missing", t, "no fleet_deploys row for " + sc.worker + " " + t.version_to + " " + CM_DEPLOY_WAIT_H + "h after merge", "error"); return { id: t.id, merge_state: "deploy-missing" }; }
    return { id: t.id, merge_state: "deploying", note: "waiting on canonical deploy" };
  }
  if (t.merge_state === "deployed") {
    var lc = await evLiveCheck(env, sc.worker, t.version_to, t.deployed_at || t.merged_at);
    if (lc.state === "waiting") return { id: t.id, merge_state: "deployed", note: "waiting on a live audit after deploy" };
    if (lc.state === "ok") {
      await cmSave(env, cx, t.id, { merge_state: "verified", merge_note: "live " + lc.la.live_version + " http 200" + (lc.superseded ? " (a later deploy superseded it)" : "") }, { touch: true });
      await cmEvent(env, cx, "verified", t, sc.worker + " live " + lc.la.live_version + " http 200 after the merge of " + t.pr_url);
      await cmIssueNote(env, t, "code task " + t.id + " merged as " + t.pr_url + " by qnfo-fleet-control and verified live as " + t.version_to + "; close against this issue's own DoD.");
      return { id: t.id, merge_state: "verified" };
    }
    var why = "post-deploy live check failed: http " + lc.la.http + ", live version " + lc.la.live_version;
    var rv = await cmRevert(env, cx, t, why);
    await cmSave(env, cx, t.id, { merge_state: rv.ok ? "reverting" : "revert-failed", revert_cid: rv.rid || null, merge_note: why + (rv.ok ? "; revert PR " + rv.pr : "; revert not opened: " + rv.why) }, { touch: true });
    await cmEvent(env, cx, rv.ok ? "revert-opened" : "revert-failed", t, why + (rv.ok ? "; revert PR " + rv.pr + " (evolve candidate " + rv.rid + ")" : "; " + rv.why), rv.ok ? "ok" : "error");
    return { id: t.id, merge_state: rv.ok ? "reverting" : "revert-failed" };
  }
  if (t.merge_state === "reverting") {
    var c = t.revert_cid ? await env.AUDIT.prepare("SELECT * FROM evolve_candidates WHERE id=?1").bind(t.revert_cid).first() : null;
    if (c && EVOLVE_OPEN_STATES.indexOf(c.status) >= 0) {
      // evolveTick advances only its oldest in-flight candidate; drive this revert here when that is another one.
      var oldest = await env.AUDIT.prepare("SELECT id FROM evolve_candidates WHERE status IN ('pr-open','merged','deployed') ORDER BY id ASC LIMIT 1").first();
      if (oldest && oldest.id !== c.id) return { id: t.id, merge_state: "reverting", advanced: await evAdvance(env, c) };
      return { id: t.id, merge_state: "reverting", note: "evolve candidate " + c.id + " " + c.status };
    }
    if (c && c.status === "reverted-verified") {
      await cmSave(env, cx, t.id, { merge_state: "reverted", merge_note: "revert candidate " + c.id + " verified live" }, { touch: true });
      await cmEvent(env, cx, "reverted", t, "revert of " + t.pr_url + " verified live (evolve candidate " + c.id + ")");
      return { id: t.id, merge_state: "reverted" };
    }
    await cmSave(env, cx, t.id, { merge_state: "revert-failed", merge_note: "revert candidate " + (c ? c.id + " ended " + c.status : "missing") }, { touch: true });
    await cmEvent(env, cx, "revert-failed", t, "revert candidate " + (c ? c.id + " ended " + c.status : "missing"), "error");
    await cmFileIssue(env, "CODE-MERGE-REVERT-FAILED-1: " + sc.worker + " code task " + t.id + " needs a manual revert", "Code task " + t.id + " (" + t.pr_url + ", VERSION " + t.version_to + ") failed post-deploy verification; its revert " + (c ? "candidate " + c.id + " ended " + c.status : "candidate is missing") + ". DoD: the change is reverted or fixed and worker_live_audit shows the worker http 200.");
    return { id: t.id, merge_state: "revert-failed" };
  }
  return { id: t.id, merge_state: t.merge_state };
}
__name(cmAdvance, "cmAdvance");
async function cmHandle(env, cx, t, cfg, busy, out) {
  var num = Number((CM_PULL_RE.exec(String(t.pr_url || "")) || [])[1] || 0), g = {};
  var d = cmDecide(t, g, cx.now);
  if (d.action !== "refuse") {
    var pr = await evApi(env, "GET", "/pulls/" + num);
    if (!pr.ok || !pr.j) { out.errors++; return { id: t.id, action: "error", why: "pull HTTP " + pr.status }; }
    g.pr = pr.j;
    if (!pr.j.merged && pr.j.state === "open" && pr.j.head && pr.j.head.sha) {
      var head = pr.j.head.sha;
      var fl = await evApi(env, "GET", "/pulls/" + num + "/files?per_page=100");
      var cr = await evApi(env, "GET", "/commits/" + head + "/check-runs?per_page=100");
      var st = await evApi(env, "GET", "/commits/" + head + "/status");
      if (!fl.ok || !cr.ok || !st.ok) { out.errors++; return { id: t.id, action: "error", why: "files HTTP " + fl.status + ", check-runs HTTP " + cr.status + ", status HTTP " + st.status }; }
      g.files = Array.isArray(fl.j) ? fl.j : [];
      g.checks = (cr.j && cr.j.check_runs) || [];
      g.status = st.j;
      g.provenance = await cmProvenance(env, t, cfg.trusted);
    }
    d = cmDecide(t, g, cx.now);
    if (d.action === "need-integrity") {
      g.integrity = await cmIntegrity(env, t, g.pr.head.sha, g.files.map(function(f) { return f.filename; }), cmScope(t.path));
      d = cmDecide(t, g, cx.now);
    }
  }
  var res = { id: t.id, pr: num, action: d.action, why: d.why };
  var cmLimit = out.maxMerges || CM_MAX_MERGES;
  if (d.action === "merge" && (out.merges >= cmLimit || (d.worker && busy[d.worker]))) {
    d = { action: "wait", green: true, why: "green; merge deferred (" + (out.merges >= cmLimit ? (cmLimit === 1 ? "one merge per tick" : cmLimit + " merges per tick") : d.worker + " has a change in flight") + ")" };
    res.action = "wait"; res.why = d.why;
  }
  var greenSince = d.green ? (t.green_since || cx.iso) : null;
  if (d.action === "refuse") {
    var changed = await cmSave(env, cx, t.id, { status: "needs_human", last_error: ("merge-runner: " + d.why).slice(0, 500), merge_note: d.why.slice(0, 500), green_since: null, merge_checked_at: cx.iso }, { touch: true, ifStatus: t.status });
    if (changed) {
      if (num && g.pr && g.pr.state === "open") await evApi(env, "POST", "/issues/" + num + "/comments", { body: "CODE-TASK-MERGE-RUNNER-1 (qnfo-fleet-control) did not merge this pull request: " + d.why + ".\n\nCode task `" + t.id + "` is now `needs_human`. Merge or close it here; the runner records the outcome." });
      await cmEvent(env, cx, "refused", t, t.pr_url + ": " + d.why, "refused");
    }
  } else if (d.action === "reconcile") {
    var f = { status: d.status, merge_checked_at: cx.iso };
    if (d.status === "merged") { f.merged_by = d.by; f.merged_sha = g.pr.merge_commit_sha || null; f.merged_at = g.pr.merged_at || cx.iso; }
    if (await cmSave(env, cx, t.id, f, { touch: true, ifStatus: t.status })) await cmEvent(env, cx, "reconciled", t, t.pr_url + " was " + d.status + (d.by ? " by " + d.by : "") + " outside the runner");
  } else if (d.action === "merge") {
    var head2 = g.pr.head.sha, names = g.files.map(function(x) { return x.filename; });
    if (!t.green_since) await cmSave(env, cx, t.id, { green_since: greenSince });
    var title = String(g.pr.title || "code-task " + t.id).replace(/\s+/g, " ").slice(0, 200) + " (#" + num + ")";
    var msg = "Merged by qnfo-fleet-control CODE-TASK-MERGE-RUNNER-1 for code task " + t.id + " (" + g.provenance.origin + "): required checks " + d.required.join(", ") + " green on " + head2.slice(0, 7) + "; the pull request is exactly the verified patch for " + names.join(", ") + ".";
    var mg = await evMergePr(env, num, head2, title, msg);
    if (mg.ok) {
      out.merges++;
      if (d.worker) busy[d.worker] = 1;
      await cmSave(env, cx, t.id, { status: "merged", merged_by: CM_RUNNER, merged_sha: (mg.j && mg.j.sha) || null, merged_at: cx.iso, merge_state: d.kind === "worker" ? "deploying" : "verified", version_to: d.version_to, merge_note: d.why + (d.kind === "worker" ? "; waiting on canonical deploy" : "; no deploy target"), merge_checked_at: cx.iso }, { touch: true });
      await evApi(env, "DELETE", "/git/refs/heads/" + t.branch);
      await cmEvent(env, cx, "merged", t, t.pr_url + " merged by " + CM_RUNNER + " (" + d.why + ")", "ok", { sha: mg.j && mg.j.sha, files: names, version_to: d.version_to, origin: g.provenance.origin });
      if (d.kind !== "worker") await cmIssueNote(env, t, "code task " + t.id + " merged as " + t.pr_url + " by qnfo-fleet-control (no deploy target); close against this issue's own DoD.");
    } else {
      out.merge_failures++;
      res.action = "merge-failed"; res.why = "merge HTTP " + mg.status;
      await cmSave(env, cx, t.id, { merge_note: "green; merge HTTP " + mg.status, merge_checked_at: cx.iso });
      await cmEvent(env, cx, "merge-failed", t, t.pr_url + ": merge HTTP " + mg.status + " " + String(mg.j && mg.j.message || "").slice(0, 120), "error");
    }
  } else if (d.action === "wait") {
    await cmSave(env, cx, t.id, Object.assign({ merge_note: String(d.why || "").slice(0, 500), green_since: greenSince, merge_checked_at: cx.iso }, d.mark || {}));
  }
  return res;
}
__name(cmHandle, "cmHandle");
// Opens the PR for a branch code-task-publish pushed (status branch_pushed), with the fleet token, so pull_request CI
// starts by itself. Only after the identity, verify, scope, provenance and integrity gates: CI runs the PR's code.
async function cmOpenHandle(env, cx, t, cfg, out) {
  var g = {}, d = cmOpenDecide(t, g), branch = t.branch;
  if (d.action !== "refuse") {
    var pl = await evApi(env, "GET", "/pulls?head=" + encodeURIComponent("QNFO:" + branch) + "&state=all&per_page=5");
    if (!pl.ok) { out.errors++; return { id: t.id, action: "error", why: "pulls HTTP " + pl.status }; }
    g.pulls = Array.isArray(pl.j) ? pl.j : [];
    d = cmOpenDecide(t, g);
    if (d.action !== "adopt") {
      var ref = await evApi(env, "GET", "/git/ref/heads/" + branch);
      if (ref.status === 404) g.branch_missing = true;
      else if (!ref.ok || !ref.j || !ref.j.object) { out.errors++; return { id: t.id, action: "error", why: "ref HTTP " + ref.status }; }
      else {
        g.head_sha = ref.j.object.sha;
        var cmp = await evApi(env, "GET", "/compare/main..." + g.head_sha);
        if (!cmp.ok || !cmp.j) { out.errors++; return { id: t.id, action: "error", why: "compare HTTP " + cmp.status }; }
        g.files = Array.isArray(cmp.j.files) ? cmp.j.files : [];
        g.merge_base = cmp.j.merge_base_commit && cmp.j.merge_base_commit.sha;
        g.provenance = await cmProvenance(env, t, cfg.trusted);
      }
      d = cmOpenDecide(t, g);
      if (d.action === "need-integrity") {
        g.integrity = await cmIntegrity(env, t, g.head_sha, g.files.map(function(f) { return f.filename; }), cmScope(t.path), g.merge_base);
        d = cmOpenDecide(t, g);
      }
    }
  }
  var res = { id: t.id, action: d.action, why: d.why };
  var pull = function(n) { return "https://github.com/" + EVOLVE_REPO + "/pull/" + n; };
  if (d.action === "adopt") {
    if (await cmSave(env, cx, t.id, { status: "published", pr_url: pull(d.pr), merge_note: d.why, merge_checked_at: cx.iso }, { touch: true, ifStatus: "branch_pushed" })) await cmEvent(env, cx, "pr-adopted", t, branch + " -> " + pull(d.pr));
    res.pr = d.pr;
  } else if (d.action === "open") {
    var goal = String(t.goal || "").replace(/\s+/g, " ").trim();
    var body = "Opened by qnfo-fleet-control CODE-TASK-MERGE-RUNNER-1 from verified code task `" + t.id + "` (branch pushed by code-task-publish).\n\nGoal: " + goal.slice(0, 500) +
      "\n\nThe patch passed the orchestrator's deterministic verifier. The fleet token opened this pull request, so the pull_request checks start by themselves; the runner merges it when the required checks pass and every merge gate holds, or says here why it will not.";
    var op = await evApi(env, "POST", "/pulls", { title: ("code-task: " + goal).slice(0, 80), head: branch, base: "main", body: body });
    if (op.ok && op.j && op.j.number) {
      res.pr = op.j.number;
      await cmSave(env, cx, t.id, { status: "published", pr_url: pull(op.j.number), pr_opened_by: CM_RUNNER, pr_opened_at: cx.iso, merge_note: d.why + "; PR opened by " + CM_RUNNER, merge_checked_at: cx.iso }, { touch: true, ifStatus: "branch_pushed" });
      await cmEvent(env, cx, "pr-opened", t, branch + " -> " + pull(op.j.number) + " opened by " + CM_RUNNER + " (" + d.why + ")");
    } else {
      out.errors++;
      res.action = "open-failed"; res.why = "pull HTTP " + op.status + " " + String(op.j && op.j.message || "").slice(0, 80);
      await cmSave(env, cx, t.id, { merge_note: res.why, merge_checked_at: cx.iso });
      await cmEvent(env, cx, "pr-open-failed", t, branch + ": " + res.why, "error");
    }
  } else if (d.action === "refuse") {
    if (await cmSave(env, cx, t.id, { status: "needs_human", last_error: ("merge-runner: " + d.why).slice(0, 500), merge_note: d.why.slice(0, 500), merge_checked_at: cx.iso }, { touch: true, ifStatus: "branch_pushed" })) await cmEvent(env, cx, "refused", t, branch + " not opened as a pull request: " + d.why, "refused");
  } else {
    await cmSave(env, cx, t.id, { merge_note: String(d.why || "").slice(0, 500), merge_checked_at: cx.iso });
  }
  return res;
}
__name(cmOpenHandle, "cmOpenHandle");
async function cmProvenance(env, t, list) {
  var iid = cmIssueId(t.goal);
  if (!iid) return { ok: true, origin: "direct enqueue" };
  var r = null;
  try { r = await env.AUDIT.prepare("SELECT source, title FROM agent_issues WHERE id=?1").bind(iid).first(); } catch (e) { return { ok: false, transient: true, why: "source issue #" + iid + " could not be read" }; }
  if (!r) return { ok: false, why: "source issue #" + iid + " does not exist" };
  if (!cmTrusted(r.source, r.title, list)) return { ok: false, why: "source issue #" + iid + " came from '" + r.source + "', which is not a trusted origin (ops_config code_merge_trusted_sources)" };
  return { ok: true, origin: "issue #" + iid + " from " + r.source };
}
__name(cmProvenance, "cmProvenance");
async function codeMergeTick(env, opts) {
  opts = opts || {};
  var nowMs = opts.now || Date.now(), cx = { now: nowMs, iso: new Date(nowMs).toISOString() };
  if (!env.GITHUB_TOKEN) return { ok: false, why: "no GITHUB_TOKEN" };
  var cfg = await cmConfig(env);
  if (!cfg.enabled) { await cmHeartbeat(env, cx, "disabled", { disabled: cfg.raw }); return { ok: true, disabled: true, why: "ops_config code_merge_runner_enabled = " + cfg.raw }; }
  if (!(await cmSchema(env))) { await cmHeartbeat(env, cx, "ok", { idle: "no code_tasks table" }); return { ok: true, idle: "no code_tasks table" }; }
  var out = { ok: true, ts: cx.iso, advanced: [], opened: [], decided: [], reconciled: [], merges: 0, merge_failures: 0, errors: 0, maxMerges: cfg.maxMerges };
  var all = function(sql, args) { var st = env.AUDIT.prepare(sql); return (args && args.length ? st.bind.apply(st, args) : st).all().then(function(r) { return r.results || []; }); };
  var inflight = await all("SELECT * FROM code_tasks WHERE merged_by = ?1 AND merge_state IN ('deploying', 'deployed', 'reverting') ORDER BY merged_at ASC LIMIT 10", [CM_RUNNER]);
  for (var i = 0; i < inflight.length; i++) out.advanced.push(await cmAdvance(env, cx, inflight[i]));
  var busy = {};
  (await all("SELECT path FROM code_tasks WHERE merged_by = ?1 AND merge_state IN ('deploying', 'deployed', 'reverting')", [CM_RUNNER])).forEach(function(r) { var s = cmScope(r.path); if (s.worker) busy[s.worker] = 1; });
  try { (await all("SELECT worker FROM evolve_candidates WHERE status IN ('pr-open', 'merged', 'deployed')")).forEach(function(r) { busy[r.worker] = 1; }); } catch (e) {}
  // Pushed branches first: open their PRs (CI then starts by itself; they are merge candidates from the next tick).
  var pushed = await all("SELECT * FROM code_tasks WHERE repo = 'qnfo-workers' AND status = 'branch_pushed' AND branch LIKE 'codeagent-%' ORDER BY updated_at ASC LIMIT ?1", [CM_MAX_CANDIDATES]);
  for (var o = 0; o < pushed.length; o++) out.opened.push(await cmOpenHandle(env, cx, pushed[o], cfg, out));
  var cands = await all("SELECT * FROM code_tasks WHERE repo = 'qnfo-workers' AND status IN ('published', 'pr_open') AND branch LIKE 'codeagent-%' AND pr_url LIKE 'https://github.com/QNFO/qnfo-workers/pull/%' ORDER BY updated_at ASC LIMIT ?1", [CM_MAX_CANDIDATES]);
  for (var j = 0; j < cands.length; j++) out.decided.push(await cmHandle(env, cx, cands[j], cfg, busy, out));
  // A refused PR (or a refused branch whose PR a person opened) that a person later merged or closed: record the outcome
  // (code-task-publish reconciles only waiting rows).
  var refused = await all("SELECT id, branch, pr_url, status FROM code_tasks WHERE status = 'needs_human' AND last_error LIKE 'merge-runner:%' AND branch LIKE 'codeagent-%' ORDER BY updated_at ASC LIMIT 10");
  for (var q = 0; q < refused.length; q++) {
    var rt = refused[q], rn = Number((CM_PULL_RE.exec(String(rt.pr_url || "")) || [])[1] || 0);
    if (!rn) {
      var rl = await evApi(env, "GET", "/pulls?head=" + encodeURIComponent("QNFO:" + rt.branch) + "&state=all&per_page=5");
      var rx = rl.ok && Array.isArray(rl.j) ? rl.j.filter(function(x) { return x && x.head && x.head.ref === rt.branch; })[0] : null;
      if (!rx) continue;
      rn = rx.number;
    }
    var rp = await evApi(env, "GET", "/pulls/" + rn);
    if (!rp.ok || !rp.j || (rp.j.state !== "closed" && !rp.j.merged)) continue;
    var rf = rp.j.merged ? { status: "merged", merged_by: rp.j.merged_by && rp.j.merged_by.login ? "gh:" + rp.j.merged_by.login : "person", merged_sha: rp.j.merge_commit_sha || null, merged_at: rp.j.merged_at || cx.iso, merge_checked_at: cx.iso } : { status: "closed", merge_checked_at: cx.iso };
    rf.pr_url = "https://github.com/" + EVOLVE_REPO + "/pull/" + rn;
    if (await cmSave(env, cx, rt.id, rf, { touch: true, ifStatus: "needs_human" })) { out.reconciled.push({ id: rt.id, status: rf.status }); await cmEvent(env, cx, "reconciled", rt, rf.pr_url + " was " + rf.status + " by a person after a refusal"); }
  }
  // GitHub unreachable for every task (a revoked token, an outage): the heartbeat says 'error', so the watchmaker sees
  // the runner go stale after 2h instead of a healthy loop that merges nothing.
  var attempted = out.decided.concat(out.opened).filter(function(x) { return x.action !== "refuse"; }).length;
  out.heartbeat = out.errors && out.errors >= attempted ? "error" : "ok";
  await cmHeartbeat(env, cx, out.heartbeat, { merges: out.merges, opened: out.opened.length, decided: out.decided.length, advanced: out.advanced.length, errors: out.errors, merge_failures: out.merge_failures });
  return out;
}
__name(codeMergeTick, "codeMergeTick");
// ---- CODE-TASK-MERGE-RUNNER-1:END ----
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
var CHARTER_VERSION = "1.0.7";
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
  { key: "autonomy", name: "Human as override, never dependency", objective: "objective-function", metrics: ["open_agent_issues", "fleet_context_tokens", "portfolio_hygiene", "capability_contract_conformance"], types: ["autonomy", "governance", "observability"] },
  { key: "research", name: "Research that is read and cited", objective: "return-on-spend", metrics: ["publications_30d", "full_reports_live_30d", "zenodo_versions_per_flagship", "indexed_surface"], types: ["research-product"] },
  { key: "reach", name: "Credible reach", objective: "return-on-spend", metrics: ["distribution_posts_30d", "subscribers_growth_monthly", "pageviews_30d", "referral_30d", "external_impact_per_dollar", "zenodo_views_total"], types: ["impact", "web"] },
  { key: "cost", name: "Cost that returns", objective: "cost-ceiling", metrics: ["cost_usd_30d", "workers_ai_cost_30d_usd", "gateway_cap_30d_usd", "cost_per_successful_task_by_class", "workers_ai_attribution_coverage_pct", "energy_efficiency", "unmanaged_direct_spend_share"], types: ["cost"] },
  { key: "security", name: "A trust boundary that holds", objective: "mission", metrics: ["security_open_issues"], types: ["security"] },
  { key: "personal", name: "Personal utility layer", objective: "mission", metrics: ["personal_mvp_serving"], types: ["personal"] }
];
// CHARTER-GRADE-ALL-PILLARS-1 (1.0.4): security, personal and the portfolio had no metric_registry row, so two pillars
// read "n/a" and the portfolio's hygiene never reached the charter grade. These three are synthesised from facts the
// tick already reads (open issues, the MVP probes, the last portfolio sync) and graded like registry metrics.
var CHARTER_SYNTHETIC = {
  security_open_issues: { pillar: "security", target: "0 (open SEC-* or category security issues)" },
  personal_mvp_serving: { pillar: "personal", target: ">=3 (qnfo-email, personal-api, calendar-api serving)" },
  portfolio_hygiene: { pillar: "autonomy", target: ">=0.9 (graded public repositories with licence, description and topics)" }
};
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
  // An unreadable marker is never a number, even when its reason text carries digits ("n/a: prior window has 27 of
  // 30 days" is not 27): PERFORMANCE-LOOP-1 found IMPROVEMENT-LOOP-1 writing such reasons into metric_history.
  if (/^\s*(n\/a|na\b|unmeasured|unknown|unreadable|pending|error|not (yet )?measured)/i.test(String(v))) return null;
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
  // CHARTER-GRADE-ALL-PILLARS-1: synthetic metrics from the facts (a registry row of the same name wins)
  var allIssues = f.open_issues || [];
  var secIssues = allIssues.filter(function(i) { return /^SEC-/.test(String(i.title || "")) || String(i.category || "") === "security"; });
  var mvpAudit = {};
  (f.worker_live_audit || []).forEach(function(r) { mvpAudit[r.worker] = r; });
  var personalUp = CHARTER_MVP.filter(function(c) { var a = mvpAudit[c.worker]; var n = a ? String(a.note || "") : ""; return c.pillar === "personal" && (n === "SYNC" || n === "CRON_ONLY" || (a && Number(a.http) === 200)); }).length;
  // a fact that was not read is not a zero: each synthetic metric needs its source present
  var synth = [];
  if (Array.isArray(f.open_issues)) synth.push({ metric: "security_open_issues", value: secIssues.length, meets: secIssues.length === 0, refreshed: now });
  if (Array.isArray(f.worker_live_audit) && f.worker_live_audit.length) synth.push({ metric: "personal_mvp_serving", value: personalUp, meets: personalUp >= 3, refreshed: now });
  if (f.portfolio_hygiene && charterNum(f.portfolio_hygiene.value) !== null) synth.push({ metric: "portfolio_hygiene", value: charterNum(f.portfolio_hygiene.value), meets: charterNum(f.portfolio_hygiene.value) >= 0.9, refreshed: f.portfolio_hygiene.ts });
  synth.forEach(function(s) {
    if (byMetric[s.metric]) return;
    var row = { metric: s.metric, pillar: CHARTER_SYNTHETIC[s.metric].pillar, value: s.value, raw: String(s.value), target: CHARTER_SYNTHETIC[s.metric].target, meets: s.meets, refreshed: s.refreshed, retired: false, synthetic: true };
    metrics.push(row);
    byMetric[s.metric] = row;
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
  var issues = allIssues;
  var highIssues = issues.filter(function(i) { return i.priority === "high" || i.priority === "critical"; });
  // 6. autonomy. SAI-COMPOSITE-WEIGHTS-1 (1.0.5, issue 1739): the "Autonomy composite" is the owner-weighted SAI
  // (sai_config w_* x the eight objective-function terms, 0-5 = SAI/20), which qnfo-autonomy-scorer publishes as the
  // sai_weighted row and survival_state.sai. The unweighted mean of the dimensions (the overall row) is reported
  // beside it as the dimension mean; a ratified weight revision moves the first and never the second.
  var dims = f.autonomy_scores || [];
  var composite = null, compositeAt = null, dimMean = null;
  dims.forEach(function(d) {
    if (d.dimension === "sai_weighted") { composite = charterNum(d.score); compositeAt = d.scored_at || null; }
    if (d.dimension === "overall") dimMean = charterNum(d.score);
  });
  var derivedDim = function(d) { return d.dimension === "overall" || d.dimension === "sai_weighted"; };
  var weakDims = dims.filter(function(d) { return charterNum(d.score) !== null && charterNum(d.score) < 3 && !derivedDim(d); });
  var strongDims = dims.filter(function(d) { return charterNum(d.score) !== null && charterNum(d.score) >= 4.5 && !derivedDim(d); });
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
    charter_version: CHARTER_VERSION, ts: now, health: health, composite_autonomy: composite, composite_autonomy_at: compositeAt, autonomy_dimension_mean: dimMean,
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
  L.push("| Autonomy composite (owner-weighted SAI / 20, sai_config weights; qnfo-autonomy-scorer sai_weighted = survival_state.sai) | " + (ev.composite_autonomy === null ? "n/a" : ev.composite_autonomy + " / 5" + (ev.composite_autonomy_at ? " (scored " + charterCell(ev.composite_autonomy_at) + ")" : "")) + " |");
  L.push("| Autonomy dimension mean (unweighted, autonomy_scores.overall) | " + (ev.autonomy_dimension_mean === null || ev.autonomy_dimension_mean === void 0 ? "n/a" : ev.autonomy_dimension_mean + " / 5") + " |");
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
  var ph = await charterOne(env, "SELECT hygiene, ts FROM portfolio_sync_runs WHERE status IN ('ok','partial') AND hygiene IS NOT NULL ORDER BY id DESC LIMIT 1");
  f.portfolio_hygiene = ph ? { value: Number(ph.hygiene), ts: ph.ts } : null;
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
  // NOASSERTION is GitHub's answer for a LICENSE file it cannot classify: the QNFO Unified License Agreement itself
  // (QNFO/license, SPDX LicenseRef-QNFO-ULA-2.0). A repository carrying it is licensed; only a missing file is a flag.
  if (!r.license) flags.push("no-license");
  if (!r.topics || !r.topics.length) flags.push("no-topics");
  var d = pfDays(r.pushed_at, nowMs);
  if (d !== null && d > PF_DORMANT_DAYS) flags.push("dormant-" + d + "d");
  return flags;
}
// Pure: org repositories + WBS rows -> the portfolio's measured state. No I/O.
function pfEvaluate(repos, wbsRows, nowIso) {
  var nowMs = Date.parse(nowIso || new Date().toISOString());
  var wbsByRepo = {}, codeKnown = {};
  (wbsRows || []).forEach(function(w) {
    if (w && w.wbs_code) codeKnown[w.wbs_code] = true;
    var key = String(w.github_repo || "").replace(/^QNFO\//, "");
    if (!key) return;
    (wbsByRepo[key] = wbsByRepo[key] || []).push({ wbs: w.wbs_code, level: w.level, status: w.status, name: w.name });
  });
  // HINT-LINK-1: a repository whose description names a registry code is linked to that program even when the code's
  // own github_repo is another repository (a paper's artifact repo next to the program repo); unknown codes are not.
  function wbsOf(r) {
    var linked = (wbsByRepo[r.name] || []).map(function(w) { return w.wbs; });
    pfWbsHint(r.description).forEach(function(c) { if (codeKnown[c] && linked.indexOf(c) < 0) linked.push(c); });
    return linked;
  }
  var rows = (repos || []).map(function(r) {
    var tier = pfTier(r);
    var isPrivate = r.visibility === "private" || r.private === true;
    return {
      name: r.name, tier: tier, pillar: PF_TIER_PILLAR[tier] || "research", visibility: isPrivate ? "private" : "public",
      archived: !!r.archived, fork: !!r.fork, description: r.description || "", license: r.license || null, topics: r.topics || [],
      homepage: r.homepage || null, language: r.language || null, pushed_at: r.pushed_at || null, has_pages: !!r.has_pages,
      open_issues: Number(r.open_issues_count || r.open_issues || 0), stars: Number(r.stargazers_count || r.stars || 0),
      wbs: wbsOf(r), flags: pfHygiene(r, tier, nowMs), days_since_push: pfDays(r.pushed_at, nowMs)
    };
  });
  rows.sort(function(a, b) { return PF_TIER_ORDER.indexOf(a.tier) - PF_TIER_ORDER.indexOf(b.tier) || String(b.pushed_at || "").localeCompare(String(a.pushed_at || "")); });
  var tiers = {}, pillars = {}, priv = 0;
  rows.forEach(function(r) { tiers[r.tier] = (tiers[r.tier] || 0) + 1; pillars[r.pillar] = (pillars[r.pillar] || 0) + 1; if (r.visibility === "private") priv++; });
  // HYGIENE-SCOPE-1: the score grades what the loop may repair and what rule 2 asks of every active PUBLIC repository.
  // Private repositories are counted (rule 4), never named and never touched, so they neither raise nor lower the
  // score and never appear in the dormant or unlinked lists (19:00Z 2026-10-01: 4 private platform repositories held
  // the score at 34/39 = 0.87 with every public gap closed).
  var graded = rows.filter(function(r) { return r.visibility === "public" && r.tier !== "archived" && r.tier !== "fork" && r.tier !== "client-config"; });
  var clean = graded.filter(function(r) { return r.flags.filter(function(f) { return f.indexOf("dormant") !== 0; }).length === 0; }).length;
  var dormant = graded.filter(function(r) { return r.flags.some(function(f) { return f.indexOf("dormant") === 0; }); });
  var unlinked = rows.filter(function(r) { return r.visibility === "public" && r.tier === "research" && !r.wbs.length; });
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
  L.push("| Active, graded public repositories (platform, governance, research, demo) | " + ev.graded + " |");
  L.push("| Hygiene score (description, licence and topics all present) | " + (ev.hygiene_score === null ? "n/a" : ev.hygiene_score) + " |");
  L.push("| Dormant graded repositories (no push for " + PF_DORMANT_DAYS + "+ days) | " + ev.dormant.length + " |");
  L.push("| Research repositories with no WBS program code | " + ev.unlinked_research.length + " |");
  L.push("| WBS codes linked to a repository | " + ev.wbs_linked + " of " + ev.wbs_total + " in program_registry |");
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
  if (ev.actions && ev.actions.length) {
    L.push("");
    L.push("### Hygiene actions the loop took this sync (PORTFOLIO-HYGIENE-1; the next sync measures them)");
    L.push("");
    ev.actions.forEach(function(a) { L.push("- " + a.repo + ": " + a.action + " " + a.status + (a.note ? " (" + pfCell(String(a.note).slice(0, 100)) + ")" : "")); });
  }
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
// PROFILE-CLAIMS-SCRUB-1 (2026-10-01, pillar reach): the organisation README's hand-written sections carried claims the
// public record does not support (owner_docs identity, "Claims against the record"; STRATEGY-1 s2.1-s2.4): the $10M NHTS
// "co-directed" line, "Holds foundational US patents", "predictive analytics deployments at Deloitte and Publicis",
// Empowering Change as QNFO's current 501(c)(3), "scientific research incubator", stale record counts, a duplicated
// ledger row and a theory-first publication list. Every sync applies these exact [from, to] pairs to
// profile/README.md before the commit. Each pair is a no-op once applied, so the scrub is idempotent, and text that has
// drifted from `from` is left alone (the identity review reports it) rather than guessed at.
var PF_PROFILE_SCRUB = [
  ["QNFO is a **scientific research incubator** founded and directed by Rowan Brad Quni-Gudzinas.",
   "QNFO is an **independent research imprint** founded and run by Rowan Brad Quni-Gudzinas."],
  ["- **National-scale data initiatives:** Managed the AARP Livability Index and\n  co-directed the $10M US DOT National Household Travel Survey (NHTS)\n- **Patented quantum computing technology:** Holds foundational US patents\n- **AI & data science leadership:** Led predictive analytics deployments at\n  Deloitte and Publicis\n", // identity-guard: allow (the scrub must name the claim it removes)
   "- **National data and policy research:** led the AARP Livability Index and managed a $1.5M federal research\n  portfolio at the U.S. DOT Federal Highway Administration\n- **AI & data science:** analytics and machine-learning engagements at Deloitte; product management at Epsilon\n  (Publicis Groupe) and iManage\n- **Research systems:** built and runs QNFO's AI-assisted research pipeline on Cloudflare\n"],
  ["QNFO is the primary research initiative of **Empowering Change**, a U.S.-registered 501(c)(3) non-profit.",
   "QNFO is an independent research imprint: one researcher and an AI-assisted pipeline."],
  ["(35+ publications, filterable by domain)", "(filterable by domain)"],
  ["[zenodo.org/communities/qwav/](https://zenodo.org/communities/qwav/) (92 records). QNFO subject-tagged corpus: [867 records](https://zenodo.org/search?q=QNFO).",
   "[zenodo.org/communities/qwav/](https://zenodo.org/communities/qwav/). QNFO subject-tagged corpus: [zenodo.org/search?q=QNFO](https://zenodo.org/search?q=QNFO)."],
  ["[community archive](https://zenodo.org/communities/qwav/) (92 records), [QNFO-tagged corpus](https://zenodo.org/search?q=QNFO) (867 records).",
   "[community archive](https://zenodo.org/communities/qwav/), [QNFO-tagged corpus](https://zenodo.org/search?q=QNFO)."],
  ["| **Portfolio Status Ledger** | [Auto-generated from Cloudflare canonical (D1 + KG)](PORTFOLIO-STATUS.md) \u2014 regenerated weekly |\n| **Portfolio Status Ledger** | [Auto-generated from Cloudflare canonical (D1 + KG)](PORTFOLIO-STATUS.md) \u2014 regenerated weekly |\n", "| **Portfolio Status Ledger** | [Auto-generated from Cloudflare canonical (D1 + KG)](PORTFOLIO-STATUS.md) \u2014 regenerated weekly |\n"],
  ["**Representative publications:**\n\n- [Computational Validation of Ultrametric Error Confinement](https://doi.org/10.5281/zenodo.20134944) (2026-05-12)\n- [Ultrametric Quantum Computing Foundations](https://doi.org/10.5281/zenodo.20154557) (2026-05-15)\n- [Symmetric Extension -- Ternary Tree Architecture](https://doi.org/10.5281/zenodo.20208437) (2026-05-16)\n- [Q-PNA Research Specification v2.0](https://doi.org/10.5281/zenodo.20287742) (2026-05-19)\n- [Convergence, Consilience, and the Hierarchical Architecture of Reality](https://doi.org/10.5281/zenodo.20302276) (2026-05-20)\n- [The Tree Is Real](https://doi.org/10.5281/zenodo.20325850) (2026-05-21)\n", "**Selected work** (STRATEGY-1 s2.4):\n\n- [The Joules-per-Solution Metric](https://doi.org/10.5281/zenodo.21637028)\n- [Error Correction Is a Landauer Machine](https://doi.org/10.5281/zenodo.22261547)\n- [JPCUB Competitive Landscape v2.0](https://doi.org/10.5281/zenodo.21821767)\n- [Joules-per-Solution for Stochastic and Agentic Inference](https://doi.org/10.5281/zenodo.21945415)\n- [The Universal Ignorance Audit](https://doi.org/10.5281/zenodo.21901984)\n- [Epistemic Legibility in AI-Assisted Science](https://doi.org/10.5281/zenodo.22026592)\n- [Operating the Quniverse Fleet](https://doi.org/10.5281/zenodo.23079905)\n"]
];
function pfScrubProfile(doc) {
  var out = String(doc || "");
  for (var i = 0; i < PF_PROFILE_SCRUB.length; i++) out = out.split(PF_PROFILE_SCRUB[i][0]).join(PF_PROFILE_SCRUB[i][1]);
  return out;
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
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS portfolio_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, repo TEXT, action TEXT, status TEXT, detail TEXT)").run();
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
    // every row, linked or not: pfEvaluate links by github_repo, pfHygienePlan fills the empty ones by slug or code
    var r = await env.PORTFOLIO.prepare("SELECT wbs_code, level, name, slug, status, github_repo FROM program_registry").all();
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
  if (repo === PF_PROFILE_REPO && path === "profile/README.md") next = pfScrubProfile(next);
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
  // PORTFOLIO-HYGIENE-1: fix what is deterministic before the surfaces are rendered, so the day's documents also list
  // what was done. The register rows and flags still describe the organisation as read at the top of this run; the
  // next sync measures the effect.
  var actions = [];
  try { actions = await pfHygieneApply(env, ev, wbs.rows); } catch (e) { actions = [{ repo: "*", action: "hygiene", status: "write-failed", note: String(e && e.message || e).slice(0, 100) }]; }
  ev.actions = actions;
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
  var done = actions.filter(function(a) { return a.status === "committed"; }).length;
  actions = actions.filter(function(a) { return a.status !== "unchanged"; });
  ev.actions = actions;
  try { await env.AUDIT.prepare("INSERT INTO portfolio_sync_runs (ts, repos, hygiene, status, note, writes) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(ev.ts, ev.total, ev.hygiene_score, status, "kernel " + VERSION + "; wbs:" + wbs.note + "; dormant " + ev.dormant.length + "; unlinked " + ev.unlinked_research.length + "; actions " + actions.length + " (" + done + " committed)", JSON.stringify(writes).slice(0, 1500)).run(); } catch (e) {}
  return { ok: true, status: status, ts: ev.ts, repos: ev.total, tiers: ev.tiers, hygiene: ev.hygiene_score, wbs: wbs.note, writes: writes, actions: actions, ms: Date.now() - t0 };
}
// PARTIAL-RETRY-1: a run that left a surface unwritten (partial) is retried on the next hourly tick, not after 20h;
// a fully written run (ok) holds for PF_STALE_H. The writes are idempotent (unchanged content is a no-op), so an
// hourly retry of a persistent failure costs a handful of GitHub reads and files LOOP-WATCH-1's issue meanwhile.
// DEPLOY-SYNC-1: a new kernel version verifies its own change on the next hourly tick instead of waiting out the
// 20h hold (the note of every run names the kernel that wrote it). Pure: the last run -> why to sync now, or null.
function pfNeedsSync(last, version, nowMs) {
  if (!last || !last.ts) return "no successful run yet";
  if (String(last.note || "").indexOf("kernel " + version + ";") < 0) return "kernel " + version + " has not synced yet";
  // a run that took hygiene actions probably left more for the next one (PF_HYGIENE_MAX per run): retry in 50 minutes
  var took = /actions (\d+) \(/.exec(String(last.note || ""));
  var holdMs = last.status === "ok" && !(took && Number(took[1]) > 0) ? PF_STALE_H * 3600000 : 50 * 60000;
  var age = nowMs - Date.parse(last.ts);
  if (isNaN(age) || age >= holdMs) return "last " + last.status + " run is " + Math.round(age / 3600000) + "h old";
  return null;
}
async function portfolioSyncIfStale(env) {
  await pfSchema(env);
  var last = await charterOne(env, "SELECT ts, status, note FROM portfolio_sync_runs WHERE status IN ('ok','partial') ORDER BY id DESC LIMIT 1");
  var why = pfNeedsSync(last, VERSION, Date.now());
  if (!why) return { ok: true, status: "fresh", last: last.ts, last_status: last.status };
  var r = await portfolioSync(env, false);
  r.reason = why;
  return r;
}
async function portfolioLatest(env) {
  await pfSchema(env);
  var rows = await charterRows(env, "SELECT name, tier, pillar, visibility, archived, fork, description, license, topics, homepage, pushed_at, wbs, flags, seen, synced_at FROM portfolio_repos WHERE seen=1 ORDER BY tier, pushed_at DESC");
  var run = await charterOne(env, "SELECT ts, repos, hygiene, status, note, writes FROM portfolio_sync_runs ORDER BY id DESC LIMIT 1");
  var acts = await charterRows(env, "SELECT ts, repo, action, status, detail FROM portfolio_actions ORDER BY id DESC LIMIT 40");
  var tiers = {};
  rows.forEach(function(r) { tiers[r.tier] = (tiers[r.tier] || 0) + 1; });
  return { last_run: run, repos: rows.length, tiers: tiers, actions: acts, rows: rows.map(function(r) { if (r.visibility === "private") return { name: "(private)", tier: r.tier, pillar: r.pillar, visibility: "private" }; r.topics = JSON.parse(r.topics || "[]"); r.wbs = r.wbs ? r.wbs.split(",") : []; r.flags = r.flags ? r.flags.split(",") : []; return r; }) };
}
// ---- PORTFOLIO-HYGIENE-1 (2026-10-01, pillar autonomy) ----
// The first live register (hygiene 0.08: 32 of 39 graded public repositories lacked a licence file, a description or
// topics; 6 research repositories had no WBS code) was a list of proposals for a session to act on, which is exactly
// the dependency the owner directive removes. The loop now fixes what is deterministic and reversible on its own:
//   license      the QNFO Unified License Agreement v2.0 (QNFO/license, SPDX LicenseRef-QNFO-ULA-2.0) applies by its own
//                scope to every repository of the organisation, code included; a LICENSE file is created where none
//                exists and never replaced.
//   description  the first paragraph of the repository's README, only where the description is empty.
//   topics       a baseline per tier plus the slugs of the WBS programs the repository serves, only where it has none.
//   wbs-link     program_registry.github_repo filled where it is empty and either the row's slug equals the repository
//                name or the repository's description names the code; a session still creates new codes.
// Every action is a portfolio_actions row and the next sync measures the result. At most PF_HYGIENE_MAX actions per
// sync, so one bad run cannot touch the whole organisation. Nothing is archived or deleted (docs/PORTFOLIO.md rule 3).
var PF_HYGIENE_MAX = 12;
var PF_LICENSE_REPO = "QNFO/license";
var PF_LICENSE_PATH = "LICENSE";
var PF_TIER_TOPICS = { platform: ["qnfo", "cloudflare-workers", "research-infrastructure"], governance: ["qnfo", "governance"], research: ["qnfo", "research", "open-research"], demo: ["qnfo", "qwav", "interactive-demo"] };
function pfWbsHint(desc) {
  var out = [], m, re = /\b(QNFO|QWAV)\.[A-Z]{2,4}(?:\.\d{3})?\b/g;
  while ((m = re.exec(String(desc || ""))) !== null) if (out.indexOf(m[0]) < 0) out.push(m[0]);
  return out;
}
function pfTopic(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50); }
// Pure: a register row + registry rows -> the topics the repository gets when it has none.
function pfTopicsFor(row, wbsRows) {
  var base = (PF_TIER_TOPICS[row.tier] || ["qnfo"]).slice();
  var codes = (row.wbs || []).concat(pfWbsHint(row.description));
  (wbsRows || []).forEach(function(w) {
    if (!w || !w.slug || (w.level !== "program" && w.level !== "portfolio")) return;
    var code = String(w.wbs_code || ""), t = pfTopic(w.slug);
    var serves = codes.some(function(c) { return c === code || c.indexOf(code + ".") === 0; });
    if (serves && t && base.indexOf(t) < 0) base.push(t);
  });
  return base.filter(function(t) { return /^[a-z0-9][a-z0-9-]{0,49}$/.test(t); }).slice(0, 20);
}
var PF_META_LABELS = /\b(Status|Phase|Started|Updated|Author|Authors|Date|Version|License|Licence|DOI|ORCID|Last updated|Created|Owner|Maintainer|Tags|Keywords)\s*:/gi;
function pfIsMetadata(p) {
  var s = String(p || "");
  var labels = (s.match(PF_META_LABELS) || []).length;
  if (/^(Status|Phase|Author|Authors|Date|Version|License|Licence|DOI|Last updated|Created|Owner|Maintainer)\s*:/i.test(s)) return true;
  if (labels >= 2 && (s.indexOf(" | ") >= 0 || s.indexOf(" · ") >= 0 || s.indexOf(" - ") >= 0)) return true;
  return labels >= 3;
}
// Pure: README markdown -> the first real paragraph as a one-line description, or null when there is none.
function pfDescriptionFromReadme(md) {
  var text = String(md || "").replace(/\r/g, "");
  if (/^---\n/.test(text)) { var fm = text.indexOf("\n---", 3); if (fm > 0) text = text.slice(fm + 4); }
  // HTML comments are cut out by index (not by a regex, which is never a complete sanitizer); any line that still
  // carries markup is left out, and the result keeps no angle bracket at all: a description is plain text.
  for (var c = text.indexOf("<!--"); c >= 0; c = text.indexOf("<!--")) { var e = text.indexOf("-->", c + 4); text = e < 0 ? text.slice(0, c) : text.slice(0, c) + text.slice(e + 3); }
  var paras = text.split(/\n\s*\n/);
  for (var i = 0; i < paras.length; i++) {
    var lines = paras[i].split("\n").map(function(l) { return l.trim(); }).filter(function(l) { return l; });
    if (!lines.length) continue;
    var skip = /^(#|!\[|\[!\[|\||>|[-*]\s|\d+\.\s|```|---|===)/;
    var usable = lines.filter(function(l) { return !skip.test(l) && l.indexOf("<") < 0 && l.indexOf(">") < 0; });
    if (!usable.length) continue;
    var p = usable.join(" ");
    p = p.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_~<>]/g, "").replace(/\s+/g, " ").trim();
    if (p.length < 20) continue;
    // DESCRIPTION-QUALITY-1: a metadata line ("Status: drafted | Phase: P3 | Updated: ...", "Author: ... | Date: ...")
    // is not a description; the first run wrote two of these. A paragraph made of labelled fields is skipped.
    if (pfIsMetadata(p)) continue;
    if (p.length > 240) { p = p.slice(0, 240); var cut = p.lastIndexOf(" "); if (cut > 120) p = p.slice(0, cut); p = p.replace(/[,;:\-]+$/, "") + "..."; }
    return p;
  }
  return null;
}
// Pure: the evaluated register + registry rows (+ the descriptions the loop itself wrote, repo -> text) -> the bounded,
// ordered list of actions for this sync. A description the loop wrote is re-derived every sync (description-revise):
// when the README's first paragraph changes, or no longer yields one, the loop corrects or clears its own text. A
// description a person wrote is never touched.
function pfHygienePlan(ev, wbsRows, written) {
  var acts = [], bySlug = {}, byCode = {};
  written = written || {};
  (wbsRows || []).forEach(function(w) { if (!w) return; byCode[w.wbs_code] = w; if (w.slug) bySlug[String(w.slug).toLowerCase()] = w; });
  (ev.rows || []).forEach(function(r) {
    if (r.visibility !== "public" || r.archived || r.fork || r.tier === "client-config") return;
    if (r.description && written[r.name] && String(r.description).slice(0, 120) === String(written[r.name]).slice(0, 120)) acts.push({ repo: r.name, action: "description-revise", current: r.description });
    if (r.tier === "research") {
      var cand = null, s = bySlug[String(r.name).toLowerCase()];
      if (s && !s.github_repo) cand = s;
      if (!cand) pfWbsHint(r.description).forEach(function(c) { var w = byCode[c]; if (!cand && w && !w.github_repo) cand = w; });
      if (cand) acts.push({ repo: r.name, action: "wbs-link", code: cand.wbs_code });
    }
    if (r.flags.indexOf("no-license") >= 0) acts.push({ repo: r.name, action: "license" });
    if (r.flags.indexOf("no-description") >= 0) acts.push({ repo: r.name, action: "description" });
    if (r.flags.indexOf("no-topics") >= 0) acts.push({ repo: r.name, action: "topics", topics: pfTopicsFor(r, wbsRows) });
  });
  // registry links first (one D1 write each), then the cheapest GitHub writes; the rest waits for the next sync
  var order = { "wbs-link": 0, "description-revise": 1, topics: 2, description: 3, license: 4 };
  acts.sort(function(a, b) { return order[a.action] - order[b.action] || String(a.repo).localeCompare(String(b.repo)); });
  // a revise is a read that usually ends "unchanged" (16:00Z run: 3 of 5), so it does not consume the write budget
  var revise = acts.filter(function(a) { return a.action === "description-revise"; });
  var rest = acts.filter(function(a) { return a.action !== "description-revise"; });
  return revise.concat(rest.slice(0, PF_HYGIENE_MAX));
}
async function pfGhJson(env, method, url, body, timeoutMs) {
  var opt = { method: method, headers: pfGh(env) };
  if (body !== void 0) { opt.headers = Object.assign({ "Content-Type": "application/json" }, opt.headers); opt.body = JSON.stringify(body); }
  var r = await timedFetch(url, opt, timeoutMs || 12e3);
  var j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
async function pfLicenseText(env) {
  var r = await timedFetch("https://api.github.com/repos/" + PF_LICENSE_REPO + "/contents/" + PF_LICENSE_PATH, { headers: Object.assign({}, pfGh(env), { Accept: "application/vnd.github.raw+json" }) }, 12e3);
  if (r.status !== 200) return null;
  var t = await r.text();
  return t && t.length > 2000 && /QNFO Unified License Agreement/.test(t) ? t : null;
}
async function pfCreateIfAbsent(env, repo, path, content, message) {
  var hdr = pfGh(env), branch = await pfDefaultBranch(env, repo);
  var gr = await timedFetch("https://api.github.com/repos/" + repo + "/contents/" + path + "?ref=" + encodeURIComponent(branch), { headers: hdr }, 12e3);
  if (gr.status === 200) return { status: "exists" };
  if (gr.status !== 404) return { status: "read-failed", note: "HTTP " + gr.status };
  var pr = await pfGhJson(env, "PUT", "https://api.github.com/repos/" + repo + "/contents/" + path, { message: message, content: b64encode(content), branch: branch }, 15e3);
  if (!(pr.json && pr.json.commit && pr.json.commit.sha)) return { status: "write-failed", note: "PUT HTTP " + pr.status + " on " + branch };
  return { status: "committed", note: pr.json.commit.sha + " on " + branch };
}
async function pfWrittenDescriptions(env) {
  var rows = await charterRows(env, "SELECT repo, detail FROM portfolio_actions WHERE action IN ('description','description-revise') AND status='committed' ORDER BY id DESC LIMIT 400");
  var m = {};
  rows.forEach(function(r) { if (!(r.repo in m)) m[r.repo] = r.detail === "cleared" ? "" : String(r.detail || ""); });
  return m;
}
async function pfHygieneApply(env, ev, wbsRows) {
  var written = {};
  try { written = await pfWrittenDescriptions(env); } catch (e) { written = {}; }
  var plan = pfHygienePlan(ev, wbsRows, written), out = [], lic = null;
  var msg = "chore(portfolio): PORTFOLIO-HYGIENE-1 " + ev.ts.slice(0, 10) + " [skip ci]";
  for (var i = 0; i < plan.length; i++) {
    var a = plan[i], full = PF_ORG + "/" + a.repo, res;
    try {
      if (a.action === "license") {
        if (lic === null) lic = (await pfLicenseText(env)) || false;
        res = lic ? await pfCreateIfAbsent(env, full, PF_LICENSE_PATH, lic, msg + "\n\nThe QNFO Unified License Agreement v2.0 (SPDX LicenseRef-QNFO-ULA-2.0) applies by its own scope to every repository of the organisation; this file makes it visible here. Source of truth: https://github.com/" + PF_LICENSE_REPO) : { status: "skipped", note: "licence text unavailable from " + PF_LICENSE_REPO };
      } else if (a.action === "description" || a.action === "description-revise") {
        var rd = await timedFetch("https://api.github.com/repos/" + full + "/readme", { headers: Object.assign({}, pfGh(env), { Accept: "application/vnd.github.raw+json" }) }, 12e3);
        var desc = rd.status === 200 ? pfDescriptionFromReadme(await rd.text()) : null;
        if (a.action === "description-revise") {
          if (rd.status !== 200 && rd.status !== 404) res = { status: "skipped", note: "README HTTP " + rd.status };
          else if ((desc || "") === String(a.current || "")) res = { status: "unchanged", note: "still the README's first paragraph" };
          else { var pr2 = await pfGhJson(env, "PATCH", "https://api.github.com/repos/" + full, { description: desc || "" }); res = pr2.status === 200 ? { status: "committed", note: desc ? desc.slice(0, 120) : "cleared" } : { status: "write-failed", note: "PATCH HTTP " + pr2.status }; }
        } else if (!desc) res = { status: "skipped", note: rd.status === 200 ? "README has no usable first paragraph" : "README HTTP " + rd.status };
        else { var pd = await pfGhJson(env, "PATCH", "https://api.github.com/repos/" + full, { description: desc }); res = pd.status === 200 ? { status: "committed", note: desc.slice(0, 120) } : { status: "write-failed", note: "PATCH HTTP " + pd.status }; }
      } else if (a.action === "topics") {
        var pt = await pfGhJson(env, "PUT", "https://api.github.com/repos/" + full + "/topics", { names: a.topics });
        res = pt.status === 200 ? { status: "committed", note: a.topics.join(",") } : { status: "write-failed", note: "PUT HTTP " + pt.status };
      } else if (a.action === "wbs-link") {
        if (!env.PORTFOLIO) res = { status: "skipped", note: "no PORTFOLIO binding" };
        else {
          var u = await env.PORTFOLIO.prepare("UPDATE program_registry SET github_repo=?1, updated_at=datetime('now') WHERE wbs_code=?2 AND (github_repo IS NULL OR github_repo='')").bind(full, a.code).run();
          res = u && u.meta && u.meta.changes ? { status: "committed", note: a.code + " -> " + full } : { status: "skipped", note: a.code + " already linked" };
        }
      } else res = { status: "skipped", note: "unknown action" };
    } catch (e) { res = { status: "write-failed", note: String(e && e.message || e).slice(0, 100) }; }
    out.push({ repo: a.repo, action: a.action, status: res.status, note: res.note || "" });
    if (res.status === "unchanged") continue;
    try { await env.AUDIT.prepare("INSERT INTO portfolio_actions (ts, repo, action, status, detail) VALUES (?1, ?2, ?3, ?4, ?5)").bind(ev.ts, a.repo, a.action, res.status, String(res.note || "").slice(0, 300)).run(); } catch (e2) {}
  }
  return out;
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
// ---- OBJECTIVE-CONSTRAINTS-1:BEGIN (2026-10-02, goals 41, 43, 57, ratified under the owner's queue delegation; agent_issues 1744, 1745, 1746) ----
// Three objective revisions were ratified on fleet.qnfo.org (2026-10-01) by a session under the owner's queue delegation, not by the owner in person (audit 2026-10-02, issues 1765, 1766). None is a weight change, so
// OBJECTIVE-REVISION-APPLY-1 (qnfo-fleet-dashboard) filed each as work. This block makes each one a constraint the kernel
// measures and enforces every hour, the way LOOP-WATCH-1 enforces the loops:
//   goal 41  capability_contract_conformance >= 1.0: every live worker declares what it can and cannot do (gate C6,
//            #1735), so the fleet's account of its own limits stays complete. OBJECTIVE-LIMITS-REVIEW-1 re-evaluates the
//            terminal objectives once a UTC day against the limits of the fleet's own knowledge (graded terms it cannot
//            observe) and formal grading (graded terms with no decidable target), and proposes a revision through the
//            owner's ratification path (goals, goal_type 'objective-revision', status 'proposed') when it finds one.
//   goal 43  energy_efficiency >= 0.8: a COMPUTE PROXY, not a joule meter (the fleet has no energy telemetry). Share of
//            metered Workers AI GPU compute (neurons, Cloudflare's unit of GPU compute) over 7 days that went to calls
//            which returned; a failed call is charged its row's mean compute and delivered no answer (JPCUB: energy per
//            correct answer; "returned" is an upper bound on "correct"). External providers expose no compute unit.
//   goal 57  unmanaged_direct_spend_share <= 0.5: direct-provider spend no spend limit governs (gateway BYOK list cost +
//            qnfo-ai's direct DeepSeek key) over total fleet cost (all-provider AI list cost + that direct key + the
//            Cloudflare plan baseline). The owner's own client keys (cost_daily scope 'external', declared, not metered)
//            are outside fleet cost and shown separately as share_if_declared_counted, never graded.
// Each value goes to metric_registry, where the charter grades it under its pillar. A breach files one deduped agent_issue
// 'OBJECTIVE-CONSTRAINT-BREACH-1: <metric>'; the block closes it with close_evidence on the first tick that measures the
// metric within target. A metric whose inputs cannot be read is UNMEASURED: no value is written, nothing is filed or
// closed (unknown is neither a breach nor a recovery). One objective_constraint_runs row per tick is the ledger
// (WATCHMAKER_OPS 'objective-constraints'); GET /constraints serves the live verdict and the review preview.
var OC_FRESH_H = 26;
var OC_ENERGY_DAYS = 7;
var OC_SPEND_FRESH_H = 26;
var OC_UNOBSERVED_H = 168;
var OC_REVIEW_MAX_NEW = 2;
var OC_ISSUE_PREFIX = "OBJECTIVE-CONSTRAINT-BREACH-1: ";
var OBJECTIVE_CONSTRAINTS = [
  { metric: "capability_contract_conformance", goal: 41, issue: 1744, op: ">=", val: 1, severity: "medium", layer: "fleet", kind: "leading",
    target: ">= 1.0 (every live worker advertises non-empty capabilities[] and limitations[], snapshot under 26h; delegated-ratified goals.id=41)",
    formula: "conforming / max(capability_audit_snapshot rows, fleet_budget workers.current); a row conforms when capabilities[] and limitations[] are both non-empty and its ts is under 26h old (OBJECTIVE-CONSTRAINTS-1, qnfo-fleet-control hourly)",
    source: "qnfo-audit.capability_audit_snapshot (qnfo-deploy-guard CAPABILITY-SNAPSHOT-1 every 6h; cron-only workers self-report) x fleet_budget workers",
    warning: "< 1.0", kill: "< 0.9" },
  { metric: "energy_efficiency", goal: 43, issue: 1745, op: ">=", val: 0.8, severity: "medium", layer: "fleet", kind: "leading",
    target: ">= 0.8 (compute proxy; delegated-ratified goals.id=43)",
    formula: "COMPUTE PROXY, not joules: 1 - wasted/total Workers AI neurons over 7d from ai_call_counters rows with calls > 0 and neurons > 0; wasted = neurons x errors / calls per (day, worker, purpose, model) row (a failed call is charged its row's mean compute and delivered no answer). Excludes external providers (no compute unit) and calls without neuron attribution (OBJECTIVE-CONSTRAINTS-1, qnfo-fleet-control hourly)",
    source: "qnfo-audit.ai_call_counters (Workers AI attribution wrappers; coverage in workers_ai_attribution_coverage_pct)",
    warning: "< 0.9", kill: "< 0.8" },
  { metric: "unmanaged_direct_spend_share", goal: 57, issue: 1746, op: "<=", val: 0.5, severity: "high", layer: "system", kind: "lagging",
    target: "<= 0.5 (delegated-ratified goals.id=57)",
    formula: "(gateway BYOK list cost 30d + qnfo-ai direct DeepSeek 30d) / (all-provider AI list cost 30d + qnfo-ai direct DeepSeek 30d + Cloudflare plan monthly baseline). Excludes cost_daily scope 'external' (the owner's own client keys: declared, not metered); GET /constraints shows the share if it were counted (OBJECTIVE-CONSTRAINTS-1, qnfo-fleet-control hourly)",
    source: "qnfo-audit.analytics_dash_meta byok_cost_usd_30d + ai_est_cost_30d (UNIFIED-AI-SPEND-1 hourly) + ai_spend_ledger provider deepseek + cost_daily cloudflare_plan",
    warning: "> 0.4", kill: "> 0.5" }
];
function ocListLen(v) {
  try {
    var a = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(a) ? a.filter(function(x) { return String(x === null || x === void 0 ? "" : x).trim() !== ""; }).length : 0;
  } catch (e) { return 0; }
}
function ocHash(s) {
  var h = 5381;
  s = String(s || "");
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
// Pure: goal 41. Rows of capability_audit_snapshot; a live worker with no row, an empty list or a row older than
// OC_FRESH_H counts against the share (its limits are unknown now).
function ocCapability(f, nowMs) {
  var rows = f.capability_rows;
  if (!Array.isArray(rows)) return { value: null, why: "capability_audit_snapshot unreadable" };
  var live = charterNum(f.live_workers);
  var of = Math.max(rows.length, live || 0);
  if (!of) return { value: null, why: "no live workers known" };
  var ok = 0, stale = [], empty = [];
  rows.forEach(function(r) {
    var t = Date.parse(r.ts || "");
    if (isNaN(t) || (nowMs - t) / 36e5 > OC_FRESH_H) stale.push(r.service);
    else if (!(ocListLen(r.capabilities) > 0 && ocListLen(r.limitations) > 0)) empty.push(r.service);
    else ok++;
  });
  return { value: charterRound(ok / of, 4), conforming: ok, of: of, stale: stale, empty: empty, unlisted: of - rows.length };
}
// Pure: goal 43. Rows of ai_call_counters over OC_ENERGY_DAYS.
function ocEnergy(f) {
  var rows = f.ai_rows;
  if (!Array.isArray(rows)) return { value: null, why: "ai_call_counters unreadable" };
  var n = 0, w = 0, calls = 0, errors = 0;
  rows.forEach(function(r) {
    var c = Number(r.calls) || 0, nu = Number(r.neurons) || 0, e = Math.min(Math.max(Number(r.errors) || 0, 0), c);
    if (!(c > 0) || !(nu > 0)) return;
    n += nu; w += nu * e / c; calls += c; errors += e;
  });
  if (!(n > 0)) return { value: null, why: "no neuron-attributed Workers AI calls in " + OC_ENERGY_DAYS + "d" };
  return { value: charterRound(1 - w / n, 4), neurons: Math.round(n), wasted_neurons: Math.round(w), calls: calls, errors: errors, days: OC_ENERGY_DAYS, attribution_coverage_pct: charterNum(f.attribution_coverage_pct) };
}
// Pure: goal 57. Spend figures from the hourly UNIFIED-AI-SPEND-1 refresh; stale or missing inputs are unmeasured.
function ocUnmanaged(f, nowMs) {
  var m = f.spend_meta || {};
  var ai = charterNum(m.ai_est_cost_30d), byok = charterNum(m.byok_cost_usd_30d);
  if (ai === null || byok === null) return { value: null, why: "analytics_dash_meta ai_est_cost_30d / byok_cost_usd_30d unreadable" };
  var at = Date.parse(m.last_refresh || "");
  if (isNaN(at) || (nowMs - at) / 36e5 > OC_SPEND_FRESH_H) return { value: null, why: "AI cost refresh is stale (last_refresh " + (m.last_refresh || "never") + ")" };
  var plan = charterNum(f.plan_usd_month);
  if (plan === null) return { value: null, why: "cost_daily holds no cloudflare_plan row" };
  var direct = charterNum(f.router_direct_usd_30d) || 0;
  var unmanaged = byok + direct, total = ai + direct + plan;
  if (!(total > 0)) return { value: null, why: "total fleet cost reads zero" };
  var ext = charterNum(f.external_declared_usd_month);
  return { value: charterRound(unmanaged / total, 4), unmanaged_usd: charterRound(unmanaged, 2), total_fleet_usd: charterRound(total, 2), gateway_byok_usd: byok, router_direct_deepseek_usd: charterRound(direct, 4), ai_all_providers_usd: ai, cloudflare_plan_usd: plan, refreshed: m.last_refresh,
    declared_external_usd_month: ext, declared_external_as_of: f.external_declared_as_of || null, share_if_declared_counted: ext === null ? null : charterRound((unmanaged + ext) / (total + ext), 4) };
}
function ocBreachText(c, p) {
  var head = c.metric + " = " + p.value + " vs target " + c.op + " " + c.val + " (delegated-ratified goals.id=" + c.goal + ", agent_issues " + c.issue + "): ";
  if (c.metric === "capability_contract_conformance") return head + p.conforming + " of " + p.of + " live workers declare non-empty capabilities[] and limitations[] with a snapshot under " + OC_FRESH_H + "h" + (p.stale.length ? "; stale: " + p.stale.slice(0, 12).join(", ") : "") + (p.empty.length ? "; empty: " + p.empty.slice(0, 12).join(", ") : "") + (p.unlisted ? "; " + p.unlisted + " live worker(s) missing from the snapshot" : "") + ".";
  if (c.metric === "energy_efficiency") return head + p.wasted_neurons + " of " + p.neurons + " Workers AI neurons in " + p.days + "d went to " + p.errors + " failed calls (of " + p.calls + "); find the failing worker/model in ai_call_counters and stop the retry or failure storm.";
  if (c.metric === "unmanaged_direct_spend_share") return head + "$" + p.unmanaged_usd + " of $" + p.total_fleet_usd + " fleet cost in 30d is direct-provider spend no spend limit governs (gateway BYOK $" + p.gateway_byok_usd + ", qnfo-ai direct DeepSeek $" + p.router_direct_deepseek_usd + "). Throttle the BYOK callers (qnfo-ai spend governor, AIG_BYOK_PROVIDERS); raising a cap stays the owner's call.";
  return head + JSON.stringify(p).slice(0, 300);
}
// Pure: facts -> one verdict per constraint plus the breach findings (deduped issue titles).
function objectiveConstraintsEvaluate(f, nowMs) {
  f = f || {};
  var now = nowMs || Date.now();
  var parts = { capability_contract_conformance: ocCapability(f, now), energy_efficiency: ocEnergy(f), unmanaged_direct_spend_share: ocUnmanaged(f, now) };
  var constraints = [], findings = [];
  OBJECTIVE_CONSTRAINTS.forEach(function(c) {
    var p = parts[c.metric] || { value: null, why: "no evaluator" };
    var v = p.value === null || p.value === void 0 ? null : p.value;
    var meets = charterMeets(v, { op: c.op, val: c.val });
    constraints.push({ metric: c.metric, goal: c.goal, issue: c.issue, target: c.op + " " + c.val, value: v, meets: meets, detail: p });
    if (meets === false) findings.push({ key: OC_ISSUE_PREFIX + c.metric, metric: c.metric, goal: c.goal, severity: c.severity, text: ocBreachText(c, p) });
  });
  return { ts: new Date(now).toISOString(), healthy: findings.length === 0, measured: constraints.filter(function(x) { return x.value !== null; }).length, constraints: constraints, findings: findings };
}
// Pure: OBJECTIVE-LIMITS-REVIEW-1 (goal 41). For each ACTIVE terminal objective, the graded terms are the metrics of the
// pillars that serve it (CHARTER_PILLARS). A term is UNDECIDABLE when its registry target admits no threshold the grader
// can test ("maximize", prose; retired metrics and per-worker rules excluded) and UNOBSERVED when the fleet holds no row
// for it or no numeric value refreshed within OC_UNOBSERVED_H. Synthetic charter metrics are computed, never unobserved.
// One proposal per objective whose set is non-empty; the goal_key hashes objective, version and set, so a decided
// proposal is never re-proposed until the objective or its limits change.
function objectiveLimitsReview(f, nowMs) {
  f = f || {};
  var now = nowMs || Date.now();
  var day = new Date(now).toISOString().slice(0, 10);
  var retired = {}, reg = {};
  (f.impact_thresholds || []).forEach(function(r) { if (/^retired/i.test(String(r.target || ""))) retired[r.metric] = true; });
  (f.metric_registry || []).forEach(function(r) { reg[r.metric] = r; });
  var out = [];
  (f.objectives || []).forEach(function(o) {
    var terms = [], undecidable = [], unobserved = [];
    CHARTER_PILLARS.forEach(function(p) {
      if (p.objective !== o.objective_key) return;
      p.metrics.forEach(function(m) {
        if (retired[m] || terms.indexOf(m) >= 0) return;
        terms.push(m);
        if (CHARTER_SYNTHETIC[m]) return;
        var r = reg[m];
        if (!r) { unobserved.push(m); return; }
        var t = String(r.target || "").trim();
        if (!/\/day each/i.test(t) && !/^retired/i.test(t) && charterTarget(t) === null) undecidable.push(m);
        var age = (now - Date.parse(String(r.last_refreshed || ""))) / 36e5;
        if (charterNum(r.last_value) === null && !(age <= OC_UNOBSERVED_H)) unobserved.push(m);
      });
    });
    var limited = undecidable.concat(unobserved.filter(function(m) { return undecidable.indexOf(m) < 0; }));
    if (!terms.length || !limited.length) return;
    var sig = undecidable.slice().sort().join(",") + "|" + unobserved.slice().sort().join(",");
    out.push({
      objective_key: o.objective_key, version: o.version, terms: terms.length, undecidable: undecidable, unobserved: unobserved,
      goal_key: "lrev-" + o.objective_key + "-v" + o.version + "-" + ocHash(sig),
      statement: "Revise terminal objective " + o.objective_key + " v" + o.version + ": " + limited.length + " of its " + terms.length + " graded terms cannot be decided or observed by the fleet, so it cannot be shown met or unmet on them.",
      alignment: "OBJECTIVE-LIMITS-REVIEW-1 (delegated-ratified goals.id=41) | no decidable target (formal limit): " + (undecidable.join(", ") || "none") + " | not observed (knowledge limit): " + (unobserved.join(", ") || "none") + " | proposal: give each term a falsifiable threshold, or drop it from the objective's grade | evidence: metric_registry on " + day
    });
  });
  return out;
}
async function ocRows(env, sql) {
  try { var r = await env.AUDIT.prepare(sql).all(); return (r && r.results) || []; } catch (e) { return null; }
}
async function ocSchema(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS objective_constraint_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, worker_version TEXT, healthy INTEGER, measured INTEGER, findings INTEGER, filed INTEGER, closed INTEGER, review TEXT, state_json TEXT)").run();
}
// Read-only: every fact the constraints and the review need. Never writes (GET /constraints calls it).
async function ocFacts(env) {
  var f = {};
  f.capability_rows = await ocRows(env, "SELECT service, capabilities, limitations, ts FROM capability_audit_snapshot");
  var wb = await charterOne(env, "SELECT current FROM fleet_budget WHERE node_class='workers'");
  f.live_workers = wb ? wb.current : null;
  f.ai_rows = await ocRows(env, "SELECT day, worker, purpose, model, calls, errors, neurons FROM ai_call_counters WHERE day >= date('now', '-" + (OC_ENERGY_DAYS - 1) + " days') LIMIT 5000");
  var cov = await charterOne(env, "SELECT last_value FROM metric_registry WHERE metric='workers_ai_attribution_coverage_pct'");
  f.attribution_coverage_pct = cov ? cov.last_value : null;
  var meta = await ocRows(env, "SELECT key, value FROM analytics_dash_meta WHERE key IN ('ai_est_cost_30d','byok_cost_usd_30d','unified_cost_usd_30d','last_refresh')");
  if (meta) { f.spend_meta = {}; meta.forEach(function(r) { f.spend_meta[r.key] = r.value; }); }
  var rd = await ocRows(env, "SELECT COALESCE(SUM(usd), 0) AS usd FROM ai_spend_ledger WHERE provider='deepseek' AND day >= date('now','-29 days')");
  f.router_direct_usd_30d = rd && rd[0] ? rd[0].usd : null;
  var plan = await charterOne(env, "SELECT usd, date FROM cost_daily WHERE source='cloudflare_plan' ORDER BY date DESC LIMIT 1");
  f.plan_usd_month = plan ? plan.usd : null;
  var ext = await charterOne(env, "SELECT usd, date FROM cost_daily WHERE source='direct_providers_external' ORDER BY date DESC LIMIT 1");
  f.external_declared_usd_month = ext ? ext.usd : null;
  f.external_declared_as_of = ext ? ext.date : null;
  f.objectives = await charterRows(env, "SELECT objective_key, version, status FROM objectives WHERE status='ACTIVE' ORDER BY id");
  f.metric_registry = await charterRows(env, "SELECT metric, target, last_value, last_refreshed FROM metric_registry");
  f.impact_thresholds = await charterRows(env, "SELECT metric, target FROM impact_thresholds");
  return f;
}
async function ocRegister(env, c) {
  await env.AUDIT.prepare("INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES (?1, ?2, ?3, ?4, ?5, 'new 2026-10-02', ?6, 'qnfo-fleet-control', 'OBJECTIVE-CONSTRAINTS-1 files and self-closes OBJECTIVE-CONSTRAINT-BREACH-1 (qnfo-fleet-control)', 'hourly', ?7, ?8, 'MEASURED', 'computed')")
    .bind(c.metric, c.layer, c.kind, c.formula, c.source, c.target, c.warning, c.kill).run();
}
// Once per UTC day: propose at most OC_REVIEW_MAX_NEW revisions, never while one from this review is still pending for
// the same objective. The owner decides them on fleet.qnfo.org like any other objective revision.
async function ocLimitsReviewDaily(env, f, nowMs) {
  var day = new Date(nowMs).toISOString().slice(0, 10);
  var ran = await env.AUDIT.prepare("SELECT id FROM objective_constraint_runs WHERE review IS NOT NULL AND substr(ts,1,10) = ?1 LIMIT 1").bind(day).first();
  if (ran) return null;
  var props = objectiveLimitsReview(f, nowMs);
  var out = { day: day, candidates: props.length, proposed: [], pending: [] };
  for (var i = 0; i < props.length && out.proposed.length < OC_REVIEW_MAX_NEW; i++) {
    var p = props[i];
    var pend = await env.AUDIT.prepare("SELECT id FROM goals WHERE goal_type='objective-revision' AND status='proposed' AND source='limits-review' AND parent_objective=?1 LIMIT 1").bind(p.objective_key).first();
    if (pend) { out.pending.push(p.objective_key + ":" + pend.id); continue; }
    try {
      var iso = new Date(nowMs).toISOString();
      var r = await env.AUDIT.prepare("INSERT INTO goals (goal_key, statement, goal_type, parent_objective, alignment, source, score, priority, status, dod, owner, program_code, created_at, updated_at) VALUES (?1, ?2, 'objective-revision', ?3, ?4, 'limits-review', 0, 3, 'proposed', 'human ratification of proposed objective revision', 'human-ratify', 'QNFO.OPS', ?5, ?5) ON CONFLICT(goal_key) DO NOTHING")
        .bind(p.goal_key, p.statement, p.objective_key, p.alignment.slice(0, 1000), iso).run();
      if (r && r.meta && r.meta.changes) out.proposed.push(p.goal_key);
    } catch (e) {}
  }
  return out;
}
async function objectiveConstraintsTick(env) {
  await ocSchema(env);
  var nowMs = Date.now(), nowIso = new Date(nowMs).toISOString();
  var f = await ocFacts(env);
  var ev = objectiveConstraintsEvaluate(f, nowMs);
  var written = [];
  for (var i = 0; i < OBJECTIVE_CONSTRAINTS.length; i++) {
    var c = OBJECTIVE_CONSTRAINTS[i], r = ev.constraints[i];
    try {
      await ocRegister(env, c);
      if (r.value !== null) {
        await env.AUDIT.prepare("UPDATE metric_registry SET last_value=?1, last_refreshed=?2, state='MEASURED' WHERE metric=?3").bind(String(r.value), nowIso, c.metric).run();
        written.push(c.metric + "=" + r.value);
      }
    } catch (e) {}
  }
  var open = await charterRows(env, "SELECT id, title FROM agent_issues WHERE status='open' AND title LIKE '" + OC_ISSUE_PREFIX + "%'");
  var openByTitle = {};
  open.forEach(function(x) { openByTitle[x.title] = x.id; });
  var filed = 0, closed = 0;
  for (var k = 0; k < ev.findings.length; k++) {
    var b = ev.findings[k];
    if (openByTitle[b.key]) continue;
    try {
      // issue_refile_guard ignores a title closed in the last 24h, so a flapping constraint files at most once a day.
      var ins = await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, 'objective-constraints', 'governance', ?3, 'open', ?4, ?4)")
        .bind(b.key, "AUTO-FILED by qnfo-fleet-control OBJECTIVE-CONSTRAINTS-1. " + b.text + " DoD: " + b.metric + " back within target in metric_registry; OBJECTIVE-CONSTRAINTS-1 closes this issue itself with close_evidence on the first hourly tick that measures it within target.", b.severity, nowMs).run();
      if (!ins || !ins.meta || ins.meta.changes !== 0) filed++;
    } catch (e) {}
  }
  for (var j = 0; j < ev.constraints.length; j++) {
    var x = ev.constraints[j], t = OC_ISSUE_PREFIX + x.metric;
    if (!openByTitle[t] || x.meets !== true) continue;
    try {
      await env.AUDIT.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?1, 'OBJECTIVE-CONSTRAINTS-1', 'closed', 'qnfo-fleet-control', datetime('now'), ?2) ON CONFLICT(issue_id) DO UPDATE SET close_evidence=excluded.close_evidence, triage_state='closed'")
        .bind(openByTitle[t], "OBJECTIVE-CONSTRAINTS-1 " + nowIso + ": " + x.metric + "=" + x.value + " meets " + x.target + " (delegated-ratified goals.id=" + x.goal + "); " + JSON.stringify(x.detail).slice(0, 400)).run();
      await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?2 WHERE id=?1 AND status='open'").bind(openByTitle[t], nowMs).run();
      closed++;
    } catch (e) {}
  }
  var review = null;
  try {
    // the registry as written above, so this tick's own constraint rows are not read as unobserved
    f.metric_registry = await charterRows(env, "SELECT metric, target, last_value, last_refreshed FROM metric_registry");
    review = await ocLimitsReviewDaily(env, f, nowMs);
  } catch (e) { review = { error: String(e && e.message || e).slice(0, 160) }; }
  try {
    await env.AUDIT.prepare("INSERT INTO objective_constraint_runs (ts, worker_version, healthy, measured, findings, filed, closed, review, state_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
      .bind(nowIso, VERSION, ev.healthy ? 1 : 0, ev.measured, ev.findings.length, filed, closed, review ? JSON.stringify(review).slice(0, 4000) : null, JSON.stringify(ev).slice(0, 60000)).run();
    await env.AUDIT.prepare("DELETE FROM objective_constraint_runs WHERE id NOT IN (SELECT id FROM objective_constraint_runs ORDER BY id DESC LIMIT 800)").run();
  } catch (e) {}
  return { ok: true, ts: nowIso, healthy: ev.healthy, measured: ev.measured, written: written, findings: ev.findings, filed: filed, closed: closed, review: review, constraints: ev.constraints };
}
// ---- OBJECTIVE-CONSTRAINTS-1:END ----
// ---- IMPROVEMENT-LOOP-1:BEGIN (2026-10-02, owner directive: measure and improve every metric, systemwide, continuously) ----
// The fleet already MEASURES (metric_registry, 34 rows, refreshed hourly) and already turns an off-target graded metric
// into an issue (METRIC-TRIGGER-LOOP-1, OBJECTIVE-CONSTRAINTS-1). Three things were missing, and without them the fleet
// cannot tell whether it is improving at all:
//   1. History. metric_registry keeps only last_value, so no trend exists. This block writes one metric_history row per
//      metric per UTC day (the day's latest value and whether it met its target).
//   2. Direction for "maximize" metrics. External metrics with no threshold (pageviews_30d, referral_30d, zenodo views,
//      external_impact_per_dollar, indexed_surface) never fire a trigger. Every metric with a direction is now compared
//      7d vs the prior 7d; a material worsening files one deduped 'METRIC-REGRESSION-1: <metric>' issue, even when the
//      metric is still inside its target (early warning), and the issue closes itself when the decline stops.
//   3. Did the fix hold? An issue closed for a metric (METRIC-TRIGGER-*, OBJECTIVE-CONSTRAINT-BREACH-1, METRIC-REGRESSION-1)
//      is re-checked for 30 days. If the metric is back off target, 'METRIC-FIX-RELAPSED-1: <metric>' is filed naming the
//      issue whose remediation did not hold, so the next attempt changes approach instead of repeating it.
// The loop grades itself: improvement_rate_7d (share of directional metrics that improved), metric_regressions_7d and
// fix_hold_rate_30d go to metric_registry, and their own triggers file an issue when the loop stops improving things.
// Unknown is never a finding: a metric needs MIN_POINTS days in both windows before it is judged. Filing is capped per
// tick so the loop cannot flood agent_issues. Ledger: improvement_loop_runs (WATCHMAKER_OPS 'improvement-loop').
var IL_WINDOW_D = 7;
var IL_MIN_POINTS = 4;
var IL_IMPROVE_PCT = 0.05;
var IL_REGRESS_PCT = 0.15;
var IL_HYSTERESIS = 0.5;          // an open regression stays open until the decline is under half the filing threshold
var IL_RELAPSE_LOOKBACK_D = 30;
var IL_RELAPSE_MIN_AGE_D = 1;     // judge a closed fix only from the day after it closed
var IL_MAX_NEW_PER_TICK = 3;
var IL_REG_PREFIX = "METRIC-REGRESSION-1: ";
var IL_RELAPSE_PREFIX = "METRIC-FIX-RELAPSED-1: ";
var IL_SELF_METRICS = [
  { metric: "improvement_rate_7d", kind: "leading", target: ">= 0.5 (share of directional metrics whose 7d mean improved vs the prior 7d)", warning: "< 0.5", kill: "< 0.3",
    formula: "improved / evaluable over metric_history: a metric is evaluable with >= 4 daily points in each 7d window and a target that implies a direction; improved = moved >= 5% in its good direction (IMPROVEMENT-LOOP-1, qnfo-fleet-control hourly)",
    trigger: { operator: "lt", threshold: 0.3, priority: "medium", title: "Improvement gap: under 30% of measured metrics improved week on week",
      action: "Read https://qnfo-fleet-control.q08.workers.dev/improvement. Take the regressed and flat metrics in order of pillar weight, check the open METRIC-REGRESSION-1 and METRIC-TRIGGER issues for each, and change the approach of the remediation that is not moving its metric. Close when metric_registry.improvement_rate_7d >= 0.3." } },
  { metric: "metric_regressions_7d", kind: "lagging", target: "<= 1 (directional metrics that worsened >= 15% 7d vs prior 7d)", warning: "> 1", kill: "> 3",
    formula: "count of evaluable metrics whose 7d mean moved >= 15% in their bad direction (IMPROVEMENT-LOOP-1)", trigger: null },
  { metric: "fix_hold_rate_30d", kind: "lagging", target: ">= 0.8 (closed metric issues whose metric stayed on target afterwards)", warning: "< 0.8", kill: "< 0.5",
    formula: "held / judged over metric issues closed in the last 30d (METRIC-TRIGGER-*, OBJECTIVE-CONSTRAINT-BREACH-1, METRIC-REGRESSION-1): relapsed when a metric_history day after closure fails its target (IMPROVEMENT-LOOP-1)",
    trigger: { operator: "lt", threshold: 0.8, priority: "high", title: "Fix durability gap: metric issues are closing but the metrics relapse",
      action: "Read https://qnfo-fleet-control.q08.workers.dev/improvement (relapses). Each METRIC-FIX-RELAPSED-1 issue names the closed issue whose remediation did not hold: replace that remediation with a structural fix, not a re-run, and add a remediation_contracts probe that would have caught the relapse. Close when metric_registry.fix_hold_rate_30d >= 0.8." } }
];
// SURFACE-METRICS-1 (0.4.88): public surfaces that publish their own aggregate metrics (no personal data) are read into
// metric_registry each tick, so the trend, regression and self-grade machinery above covers them like any other metric.
// A surface that cannot be read writes nothing (unknown is never a value). Pillar: reach.
var IL_SURFACES = [
  { name: "ipatent", url: "https://ipatent.qnfo.org/api/metrics", metrics: [
    { metric: "ipatent_human_views_7d", path: ["windows", "7d", "views_human"], formula: "GET / and /guide page loads in 7d, crawlers and same-site navigation excluded (qnfo-ipatent PAGE-METRICS-1 daily counters by source class)" },
    { metric: "ipatent_search_visits_7d", path: ["windows", "7d", "views_search"], formula: "page loads in 7d whose referrer host is a search or answer engine (qnfo-ipatent PAGE-METRICS-1)" },
    { metric: "ipatent_crawler_hits_7d", path: ["windows", "7d", "views_crawler"], formula: "page loads in 7d from crawler user agents: an indexing signal, not readership (qnfo-ipatent PAGE-METRICS-1)" },
    { metric: "ipatent_drafters_7d", path: ["windows", "7d", "drafters"], formula: "distinct salted IP hashes that drafted in 7d, private drafts included (qnfo-ipatent submissions)" }
  ] }
];
// FLEET-RUN-RATE-1 (0.4.90): cost_usd_30d (list cost, all providers, 30d) is dominated by spend the fleet cannot move:
// a one-off gpt-5.5 session burst on 2026-09-26 (ages out about 2026-10-26) and the owner's own desktop client on BYOK
// DeepSeek. A trigger on it files work no worker can do. fleet_ai_run_rate_30d_usd is the fleet's OWN live AI cost,
// projected to 30 days from the most recent days of data: attributed Workers AI neurons (ai_call_counters, coverage in
// workers_ai_attribution_coverage_pct) above the 10k/day free allocation at $0.011 per 1k, plus the qnfo-ai router's
// non-Workers-AI provider spend (ai_spend_ledger; Workers AI rows are already in the neuron count). It excludes the
// Cloudflare plan, the owner's own client keys and anything older than the window, so it moves when a worker changes.
var IL_RUN_RATE_DAYS = 7;
var IL_FREE_NEURONS_DAY = 10000;
var IL_USD_PER_K_NEURONS = 0.011;
var IL_RUN_RATE_METRIC = { metric: "fleet_ai_run_rate_30d_usd", kind: "leading",
  target: "<= 15 (proposed 2026-10-02: Workers AI 7.50 + qnfo-ai router 7.50; the fleet's own live AI cost only)",
  formula: "30 x [max(0, mean daily attributed Workers AI neurons - 10000) x $0.011/1k + mean daily qnfo-ai router spend on non-Workers-AI providers] over the last <= 7 days with data (ai_call_counters + ai_spend_ledger); excludes the Cloudflare plan, the owner's own client keys and one-off session bursts (FLEET-RUN-RATE-1, qnfo-fleet-control hourly)",
  trigger: { operator: "gt", threshold: 15, priority: "high", title: "Fleet AI run-rate above $15/30d (the fleet's own live spend)",
    action: "Read ai_call_counters for the last 7 days grouped by worker and model; the top neuron consumer is the lever (2026-10-02: qnfo-research-exec, glm-5.3 at max reasoning effort, about 4k neurons per call). Prefer reasoning_effort low or a cheaper model on stages whose output quality is verified downstream, and record the before/after quality check. Close when metric_registry.fleet_ai_run_rate_30d_usd <= 15." } };
// Pure: daily neuron totals [{day, neurons}] and daily router spend [{day, usd}] -> projected 30d USD, or null.
function ilRunRate(neuronDays, routerDays, todayIso) {
  var today = String(todayIso || "").slice(0, 10);
  var full = function(r) { return r && r.day && String(r.day).slice(0, 10) < today; };
  var nd = (neuronDays || []).filter(full), rd = (routerDays || []).filter(full);
  var days = {};
  nd.forEach(function(r) { days[String(r.day).slice(0, 10)] = 1; });
  rd.forEach(function(r) { days[String(r.day).slice(0, 10)] = 1; });
  var n = Object.keys(days).length;
  if (!n) return null;
  var neur = 0, usd = 0;
  nd.forEach(function(r) { neur += Number(r.neurons) || 0; });
  rd.forEach(function(r) { usd += Number(r.usd) || 0; });
  var wai = Math.max(0, neur / n - IL_FREE_NEURONS_DAY) * IL_USD_PER_K_NEURONS / 1000;
  return { usd_30d: Math.round((wai + usd / n) * 30 * 100) / 100, days: n, workers_ai_usd_30d: Math.round(wai * 30 * 100) / 100, router_usd_30d: Math.round(usd / n * 30 * 100) / 100, neurons_per_day: Math.round(neur / n) };
}
async function ilRefreshRunRate(env, nowIso) {
  var nd = await charterRows(env, "SELECT day, SUM(neurons) AS neurons FROM ai_call_counters WHERE day >= date('now', '-" + IL_RUN_RATE_DAYS + " days') GROUP BY day");
  var rd = await charterRows(env, "SELECT day, SUM(usd) AS usd FROM ai_spend_ledger WHERE provider <> 'workers-ai' AND day >= date('now', '-" + IL_RUN_RATE_DAYS + " days') GROUP BY day");
  var rr = ilRunRate(nd, rd, nowIso);
  var m = IL_RUN_RATE_METRIC;
  try {
    await env.AUDIT.prepare("INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state) VALUES (?1, 'fleet', ?2, ?3, 'qnfo-audit.ai_call_counters + ai_spend_ledger', ?4, 'qnfo-fleet-control', 'qnfo-fleet-control METRIC-TRIGGER-LOOP-1 files the breach; the top neuron consumer is the lever', 'hourly', '> 10', '> 15', 'MEASURED')")
      .bind(m.metric, m.kind, m.formula, m.target).run();
    await env.AUDIT.prepare("INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes) VALUES (?1, ?2, 'registry', ?3, ?4, ?5, ?6, 'qnfo-fleet-control', 'agent_issues', 168, 1, 'seeded by FLEET-RUN-RATE-1')")
      .bind(m.metric, m.trigger.title, m.trigger.operator, m.trigger.threshold, m.trigger.priority, m.trigger.action).run();
    if (rr) await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3 WHERE metric = ?1").bind(m.metric, String(rr.usd_30d), nowIso).run();
  } catch (e) {}
  return rr;
}
// Pure: one surface's JSON -> [{metric, value}] for the values that are finite numbers.
function ilSurfaceValues(surface, body) {
  var out = [];
  if (!surface || !body || typeof body !== "object") return out;
  surface.metrics.forEach(function(m) {
    var v = body;
    for (var i = 0; i < m.path.length && v !== null && v !== void 0; i++) v = v[m.path[i]];
    var n = typeof v === "number" ? v : NaN;
    if (isFinite(n)) out.push({ metric: m.metric, value: n });
  });
  return out;
}
async function ilRefreshSurfaces(env, nowIso) {
  var written = 0;
  for (var i = 0; i < IL_SURFACES.length; i++) {
    var sf = IL_SURFACES[i], body = null;
    try {
      var r = await fetch(sf.url, { headers: { "User-Agent": "qnfo-fleet-control-metrics/" + VERSION }, signal: AbortSignal.timeout(1e4) });
      if (r.ok) body = await r.json();
    } catch (e) { body = null; }
    var vals = ilSurfaceValues(sf, body);
    for (var j = 0; j < sf.metrics.length; j++) {
      var m = sf.metrics[j];
      try {
        await env.AUDIT.prepare("INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state) VALUES (?1, 'surface', 'lagging', ?2, ?3, 'maximize (trended by IMPROVEMENT-LOOP-1; pillar reach)', ?4, 'qnfo-fleet-control IMPROVEMENT-LOOP-1 files regressions', 'hourly', 'MEASURED')")
          .bind(m.metric, m.formula, sf.url, "qnfo-" + sf.name).run();
      } catch (e) {}
    }
    for (var k = 0; k < vals.length; k++) {
      try { await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3 WHERE metric = ?1").bind(vals[k].metric, String(vals[k].value), nowIso).run(); written++; } catch (e) {}
    }
  }
  return written;
}
// Pure: which way is good for a metric, from its registry target. Returns "up", "down" or null (no direction).
function ilDirection(target) {
  var s = String(target === null || target === void 0 ? "" : target).trim().toLowerCase();
  if (!s || /^(retired|tbd|n\/a)/.test(s) || /\/day each/.test(s)) return null;
  if (/^maximi[sz]e/.test(s)) return "up";
  if (/^minimi[sz]e/.test(s)) return "down";
  var m = s.match(/^(<=|>=|<|>|==?)?\s*(all\s+)?\$?(\+)?(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  if (m[1] === "<=" || m[1] === "<") return "down";
  if (m[1] === ">=" || m[1] === ">" || m[3]) return "up";
  if (!m[1] && Number(m[4]) === 0) return "down";
  return null;
}
function ilMean(a) { if (!a.length) return null; var s = 0; a.forEach(function(x) { s += x; }); return s / a.length; }
function ilDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
// Pure: the metric a closed issue was about, from its title.
function ilIssueMetric(title, triggerMetric) {
  var t = String(title || "");
  if (t.indexOf(IL_REG_PREFIX) === 0) return t.slice(IL_REG_PREFIX.length).trim();
  if (t.indexOf("OBJECTIVE-CONSTRAINT-BREACH-1: ") === 0) return t.slice("OBJECTIVE-CONSTRAINT-BREACH-1: ".length).trim();
  var m = t.match(/^METRIC-TRIGGER-(\d+)-/);
  if (m && triggerMetric && triggerMetric[m[1]]) return triggerMetric[m[1]];
  return null;
}
// Pure: facts -> trend verdicts, relapse verdicts, the loop's own metrics and the deduped findings.
//   f.registry      [{metric, target, state}]
//   f.history       [{metric, day 'YYYY-MM-DD', value, meets 0|1|null}]
//   f.closed_issues [{id, title, closed_at 'YYYY-MM-DD...'}]
//   f.trigger_metric {triggerId: metric_key}
//   f.open_titles   [title] of open agent_issues (for hysteresis and dedupe)
function improvementEvaluate(f, nowMs) {
  f = f || {};
  var now = nowMs || Date.now();
  var today = ilDay(now);
  var dayMs = 864e5;
  var recentFrom = ilDay(now - (IL_WINDOW_D - 1) * dayMs), priorFrom = ilDay(now - (2 * IL_WINDOW_D - 1) * dayMs);
  var open = {}, covered = {};
  (f.open_titles || []).forEach(function(t) {
    open[t] = true;
    if (t.indexOf(IL_REG_PREFIX) === 0 || t.indexOf(IL_RELAPSE_PREFIX) === 0) return;
    var cm = ilIssueMetric(t, f.trigger_metric || {});
    if (cm) covered[cm] = t;
  });
  var byMetric = {};
  (f.history || []).forEach(function(h) {
    var v = Number(h.value);
    if (!isFinite(v) || !h.metric || !h.day) return;
    (byMetric[h.metric] = byMetric[h.metric] || []).push({ day: String(h.day).slice(0, 10), value: v, meets: h.meets === null || h.meets === void 0 ? null : Number(h.meets) });
  });
  Object.keys(byMetric).forEach(function(m) { byMetric[m].sort(function(a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : 0; }); });
  var trends = [], findings = [];
  var improved = 0, flat = 0, regressed = 0;
  (f.registry || []).forEach(function(r) {
    if (/^retired/i.test(String(r.state || "")) || /^retired/i.test(String(r.target || ""))) return;
    var dir = ilDirection(r.target);
    var rows = byMetric[r.metric] || [];
    var rec = rows.filter(function(x) { return x.day >= recentFrom && x.day <= today; }).map(function(x) { return x.value; });
    var pri = rows.filter(function(x) { return x.day >= priorFrom && x.day < recentFrom; }).map(function(x) { return x.value; });
    var t = { metric: r.metric, direction: dir, points_recent: rec.length, points_prior: pri.length, recent: null, prior: null, change: null, verdict: "unmeasured" };
    if (!dir) { t.why = "target implies no direction"; trends.push(t); return; }
    if (rec.length < IL_MIN_POINTS || pri.length < IL_MIN_POINTS) { t.why = "needs " + IL_MIN_POINTS + " daily points in each 7d window"; trends.push(t); return; }
    var a = ilMean(rec), b = ilMean(pri);
    var base = Math.max(Math.abs(b), 1e-9);
    var rel = (a - b) / base;
    var good = dir === "up" ? rel : -rel;
    t.recent = Math.round(a * 1e4) / 1e4; t.prior = Math.round(b * 1e4) / 1e4; t.change = Math.round(good * 1e4) / 1e4;
    if (a === b) t.verdict = "flat";
    else if (good >= IL_IMPROVE_PCT) t.verdict = "improved";
    else if (good <= -IL_REGRESS_PCT) t.verdict = "regressed";
    else t.verdict = "flat";
    if (t.verdict === "improved") improved++; else if (t.verdict === "regressed") regressed++; else flat++;
    var key = IL_REG_PREFIX + r.metric;
    var keepOpen = open[key] && good <= -IL_REGRESS_PCT * IL_HYSTERESIS;
    if (t.verdict === "regressed" || keepOpen) {
      var offTarget = rows.length && rows[rows.length - 1].meets === 0;
      findings.push({ key: key, metric: r.metric, severity: offTarget ? "high" : "medium", covered_by: covered[r.metric] || null,
        text: r.metric + " worsened " + Math.round(-good * 100) + "% week on week (7d mean " + t.recent + " vs prior 7d " + t.prior + "; good direction " + dir + "; target " + String(r.target || "").split("(")[0].trim() + (offTarget ? "; now OFF target" : "; still inside target, early warning") + ")." });
    }
    trends.push(t);
  });
  // Fix durability: closed metric issues, judged from the day after closure.
  var relapses = [], held = 0, judged = 0;
  var cutoff = ilDay(now - IL_RELAPSE_LOOKBACK_D * dayMs);
  var seen = {};
  (f.closed_issues || []).forEach(function(ci) {
    if (String(ci.title || "").indexOf(IL_REG_PREFIX) === 0) return; // a regression closes when the decline stops, not on target
    var metric = ilIssueMetric(ci.title, f.trigger_metric || {});
    var cd = String(ci.closed_at || "").slice(0, 10);
    if (!metric || !cd || cd < cutoff) return;
    var after = ilDay(Date.parse(cd + "T00:00:00Z") + IL_RELAPSE_MIN_AGE_D * dayMs);
    var rows = (byMetric[metric] || []).filter(function(x) { return x.day >= after && x.meets !== null; });
    if (!rows.length) return;
    judged++;
    var bad = rows.filter(function(x) { return x.meets === 0; });
    if (!bad.length) { held++; return; }
    relapses.push({ metric: metric, issue_id: ci.id, closed: cd, first_off_target: bad[0].day, days_off: bad.length });
    var key = IL_RELAPSE_PREFIX + metric;
    if (seen[key]) return;
    seen[key] = true;
    var still = rows[rows.length - 1].meets === 0;
    if (!still) return;
    findings.push({ key: key, metric: metric, severity: "high", covered_by: covered[metric] || null,
      text: metric + " is off target again: issue #" + ci.id + " (" + String(ci.title).slice(0, 90) + ") closed on " + cd + ", and the metric has failed its target on " + bad.length + " day(s) since " + bad[0].day + ". That remediation did not hold; change the approach rather than repeating it." });
  });
  var evaluable = improved + flat + regressed;
  return {
    ts: new Date(now).toISOString(),
    evaluable: evaluable, improved: improved, flat: flat, regressed: regressed,
    improvement_rate_7d: evaluable ? Math.round(improved / evaluable * 1e4) / 1e4 : null,
    metric_regressions_7d: evaluable ? regressed : null,
    fix_hold_rate_30d: judged ? Math.round(held / judged * 1e4) / 1e4 : null,
    fixes_judged: judged, fixes_held: held,
    trends: trends, relapses: relapses, findings: findings
  };
}
async function ilSchema(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS metric_history (metric TEXT NOT NULL, day TEXT NOT NULL, value REAL, meets INTEGER, target TEXT, ts TEXT, PRIMARY KEY (metric, day))").run();
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS improvement_loop_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, worker_version TEXT, snapshotted INTEGER, evaluable INTEGER, improved INTEGER, flat INTEGER, regressed INTEGER, fixes_judged INTEGER, fixes_held INTEGER, findings INTEGER, filed INTEGER, closed INTEGER, state_json TEXT)").run();
}
// Read-only facts (GET /improvement calls it; never writes).
async function ilFacts(env) {
  var f = {};
  f.registry = await charterRows(env, "SELECT metric, target, state, last_value, last_refreshed FROM metric_registry");
  f.history = await charterRows(env, "SELECT metric, day, value, meets FROM metric_history WHERE day >= date('now', '-" + (IL_RELAPSE_LOOKBACK_D + 2 * IL_WINDOW_D) + " days') ORDER BY metric, day");
  var trig = await charterRows(env, "SELECT id, metric_key FROM analytics_metric_triggers");
  f.trigger_metric = {};
  trig.forEach(function(t) { f.trigger_metric[String(t.id)] = t.metric_key; });
  f.closed_issues = await charterRows(env, "SELECT a.id, a.title, COALESCE(datetime(a.updated_at / 1000, 'unixepoch'), t.triaged_at) AS closed_at FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE a.status = 'closed' AND (a.title LIKE 'METRIC-TRIGGER-%' OR a.title LIKE 'OBJECTIVE-CONSTRAINT-BREACH-1:%' OR a.title LIKE 'METRIC-REGRESSION-1:%') AND a.updated_at >= (strftime('%s', 'now') - " + (IL_RELAPSE_LOOKBACK_D + 1) + " * 86400) * 1000");
  f.open_titles = (await charterRows(env, "SELECT title FROM agent_issues WHERE status = 'open' AND (title LIKE 'METRIC-REGRESSION-1:%' OR title LIKE 'METRIC-FIX-RELAPSED-1:%' OR title LIKE 'METRIC-TRIGGER-%' OR title LIKE 'OBJECTIVE-CONSTRAINT-BREACH-1:%')")).map(function(r) { return r.title; });
  return f;
}
async function improvementLoopTick(env) {
  if (!env.AUDIT) return { ok: false, error: "no AUDIT binding" };
  await ilSchema(env);
  var nowMs = Date.now(), nowIso = new Date(nowMs).toISOString(), day = ilDay(nowMs);
  var surfaced = await ilRefreshSurfaces(env, nowIso).catch(function() { return 0; });
  var runRate = await ilRefreshRunRate(env, nowIso).catch(function() { return null; });
  // 1. history: today's latest value per numeric, non-retired registry metric
  var reg = await charterRows(env, "SELECT metric, target, state, last_value FROM metric_registry");
  var snap = 0;
  for (var i = 0; i < reg.length; i++) {
    var r = reg[i];
    if (/^retired/i.test(String(r.state || "")) || /^retired/i.test(String(r.target || ""))) continue;
    var v = charterNum(r.last_value);
    if (v === null) continue;
    var meets = charterMeets(v, charterTarget(r.target));
    try {
      await env.AUDIT.prepare("INSERT INTO metric_history (metric, day, value, meets, target, ts) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(metric, day) DO UPDATE SET value = excluded.value, meets = excluded.meets, target = excluded.target, ts = excluded.ts")
        .bind(r.metric, day, v, meets === null ? null : (meets ? 1 : 0), String(r.target || "").slice(0, 200), nowIso).run();
      snap++;
    } catch (e) {}
  }
  // 2. evaluate
  var f = await ilFacts(env);
  var x = improvementEvaluate(f, nowMs);
  // 3. the loop's own metrics and their triggers (idempotent seeds; values only when measured)
  for (var k = 0; k < IL_SELF_METRICS.length; k++) {
    var sm = IL_SELF_METRICS[k];
    var val = x[sm.metric];
    try {
      await env.AUDIT.prepare("INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state) VALUES (?1, 'system', ?2, ?3, 'qnfo-audit.metric_history + agent_issues (qnfo-fleet-control IMPROVEMENT-LOOP-1)', ?4, 'qnfo-fleet-control', 'qnfo-fleet-control IMPROVEMENT-LOOP-1 files and closes the issues', 'hourly', ?5, ?6, 'MEASURED')")
        .bind(sm.metric, sm.kind, sm.formula, sm.target, sm.warning, sm.kill).run();
      if (val !== null && val !== void 0) await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?2, last_refreshed = ?3 WHERE metric = ?1").bind(sm.metric, String(val), nowIso).run();
      if (sm.trigger) await env.AUDIT.prepare("INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes) VALUES (?1, ?2, 'registry', ?3, ?4, ?5, ?6, 'qnfo-fleet-control', 'agent_issues', 168, 1, 'seeded by IMPROVEMENT-LOOP-1')")
        .bind(sm.metric, sm.trigger.title, sm.trigger.operator, sm.trigger.threshold, sm.trigger.priority, sm.trigger.action).run();
    } catch (e) {}
  }
  // 4. file and close (deduped by title, capped per tick)
  var want = {}, toFile = {};
  x.findings.forEach(function(fd) { want[fd.key] = fd; if (!fd.covered_by) toFile[fd.key] = fd; }); // one issue per metric: an open trigger/constraint issue already carries it
  var openRows = await charterRows(env, "SELECT id, title FROM agent_issues WHERE status = 'open' AND (title LIKE 'METRIC-REGRESSION-1:%' OR title LIKE 'METRIC-FIX-RELAPSED-1:%')");
  var openByTitle = {};
  openRows.forEach(function(r) { openByTitle[r.title] = r.id; });
  var filed = 0, closed = 0;
  var order = Object.keys(toFile).sort(function(a, b) { return (toFile[a].severity === "high" ? 0 : 1) - (toFile[b].severity === "high" ? 0 : 1); });
  for (var j = 0; j < order.length && filed < IL_MAX_NEW_PER_TICK; j++) {
    var key = order[j];
    if (openByTitle[key]) continue;
    try {
      await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, 'qnfo-fleet-control', 'optimization', ?3, 'open', ?4, ?4)")
        .bind(key, "AUTO-FILED by qnfo-fleet-control IMPROVEMENT-LOOP-1. " + toFile[key].text + " Evidence: GET https://qnfo-fleet-control.q08.workers.dev/improvement and metric_history. DoD: the metric's 7d trend is no longer declining (regression) or it is back inside its target (relapse); IMPROVEMENT-LOOP-1 closes this issue itself with close_evidence.", toFile[key].severity, nowMs).run();
      filed++;
    } catch (e) {}
  }
  for (var tt in openByTitle) {
    if (want[tt]) continue;
    var tr = null;
    x.trends.forEach(function(t) { if (IL_REG_PREFIX + t.metric === tt || IL_RELAPSE_PREFIX + t.metric === tt) tr = t; });
    if (tt.indexOf(IL_REG_PREFIX) === 0 && (!tr || tr.verdict === "unmeasured")) continue; // unknown is not a recovery
    try {
      await env.AUDIT.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?1, 'IMPROVEMENT-LOOP-1', 'closed', 'qnfo-fleet-control', datetime('now'), ?2) ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence, triage_state = 'closed'")
        .bind(openByTitle[tt], "IMPROVEMENT-LOOP-1 " + nowIso + ": " + (tr ? "7d mean " + tr.recent + " vs prior " + tr.prior + " (good-direction change " + tr.change + ", verdict " + tr.verdict + ")" : "metric back inside its target") + "; no longer a finding.").run();
      await env.AUDIT.prepare("UPDATE agent_issues SET status = 'closed', updated_at = ?2 WHERE id = ?1").bind(openByTitle[tt], nowMs).run();
      closed++;
    } catch (e) {}
  }
  var state = { improvement_rate_7d: x.improvement_rate_7d, metric_regressions_7d: x.metric_regressions_7d, fix_hold_rate_30d: x.fix_hold_rate_30d, findings: x.findings.map(function(fd) { return fd.key; }), relapses: x.relapses.slice(0, 20) };
  try {
    await env.AUDIT.prepare("INSERT INTO improvement_loop_runs (ts, worker_version, snapshotted, evaluable, improved, flat, regressed, fixes_judged, fixes_held, findings, filed, closed, state_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)")
      .bind(nowIso, VERSION, snap, x.evaluable, x.improved, x.flat, x.regressed, x.fixes_judged, x.fixes_held, x.findings.length, filed, closed, JSON.stringify(state).slice(0, 8000)).run();
  } catch (e) {}
  return { ok: true, ts: nowIso, surfaced: surfaced, run_rate: runRate, snapshotted: snap, evaluable: x.evaluable, improved: x.improved, flat: x.flat, regressed: x.regressed, improvement_rate_7d: x.improvement_rate_7d, fix_hold_rate_30d: x.fix_hold_rate_30d, findings: x.findings.length, filed: filed, closed: closed };
}
// ---- IMPROVEMENT-LOOP-1:END ----
// ---- REACH-IDEATION-1:BEGIN (2026-10-02, owner directive: "the fleet shall ideate and shall build all next automatically") ----
// The fleet built only what a session or the owner thought of. This block is the fleet's own source of reach ideas, grounded
// in live evidence rather than model guesses: once a UTC day it fetches QNFO's public surfaces, runs proven reach checks on
// each (share image, canonical, structured data, author, contact path, flagship cross-link, subscribe box, speed) and a
// content-gap catalog (planned iPatent guide pages that should exist), and files each failing check as ONE deduped
// 'REACH-IDEA-1: <check> on <surface>' agent_issue with the evidence, the one-sentence fix, the worker that serves the page
// and the metric it should move. qnfo-code-orchestrator ISSUE-PLANNER-1 trusts this title prefix and turns a buildable idea
// into a code task; qnfo-fleet-control's merge runner ships it. The next run re-probes and closes the issue with evidence
// once the live page passes. Guards: one issue per (check, surface); only owned surfaces; no idea that sends, posts or
// spends (outreach stays inside STRATEGY s5); no model call (fleet_budget AI caps are breached).
// REACH-IDEATION-2 (0.4.95, owner request 2026-10-02 "generate and queue the next reach work itself, without asking"). The
// first run (2026-10-02T09:00:45Z, 26 findings, 3 filed) exposed four defects, fixed here:
//  1. Finite catalog: 8 fixed URLs, so ideation ends once they pass. Now the top pages by RUM traffic on owned hosts
//     (reach_signals cf-rum, 14 days; one page per host + first path segment, so a template fix counts once, skipping
//     templates the fixed list covers) are probed too: ideas follow where readers actually are. q08.org is excluded.
//  2. Buildable-first sorting starved the highest-value ideas (qnfo.org home share image, score 9, behind ideas.qnfo.org
//     items at score 2). Now value-first: buildable ideas fill the code loop's slots by score, and one slot is kept for the
//     top idea on a deny-listed worker (qnfo-gateway) so the largest gap stays visible.
//  3. No work-in-progress cap: 3 new issues a day whatever was still open (open_agent_issues was 40 against 20). Now at
//     most IDEA_WIP_MAX open buildable ideas and IDEA_GAP_MAX open not-buildable ones.
//  4. No learning: nothing recorded whether a shipped idea moved its metric. Now reach_idea_outcomes keeps the metric at
//     filing, at close (the live page passes) and 7 days later; a check kind whose shipped ideas (n >= 3) did not raise
//     their metric is down-weighted (x0.5, "replaced, not repeated"), one that did is up-weighted (x1.25). Every idea
//     metric is higher-is-better. The delta is confounded by everything else that moved that week: a ranking prior, not a
//     causal claim. reach_ideas_shipped_30d (ideas this loop closed with evidence in 30 days) grades the loop end to end.
var IDEA_MAX_NEW = 3;
var IDEA_WIP_MAX = 4;
var IDEA_GAP_MAX = 1;
var IDEA_DISCOVER_MAX = 3;
var IDEA_DISCOVER_DAYS = 14;
var IDEA_SHIPPED_GRACE_DAYS = 14;
var IDEA_PREFIX = "REACH-IDEA-1: ";
var IDEA_SLOW_MS = 2500;
var IDEA_SURFACES = [
  { key: "qnfo-home", url: "https://qnfo.org/", worker: "qnfo-gateway", weight: 3 },
  { key: "work-with-me", url: "https://qnfo.org/work-with-me", worker: "qnfo-gateway", weight: 3 },
  { key: "papers-index", url: "https://papers.qnfo.org/papers", worker: "qnfo-gateway", weight: 2 },
  { key: "paper-page", url: "latest-paper", worker: "qnfo-gateway", weight: 2 },
  { key: "ipatent-home", url: "https://ipatent.qnfo.org/", worker: "qnfo-ipatent", weight: 3, flagship: true },
  { key: "ipatent-guide", url: "https://ipatent.qnfo.org/guide", worker: "qnfo-ipatent", weight: 2, flagship: true },
  { key: "ipatent-example", url: "https://ipatent.qnfo.org/example", worker: "qnfo-ipatent", weight: 2, flagship: true },
  { key: "ideas", url: "https://ideas.qnfo.org/", worker: "idea-hub", weight: 1 }
];
// Owned QNFO-imprint hosts and the worker that serves each (REACH-IDEATION-2 discovery). Left out on purpose: fleet.qnfo.org
// (the operations dashboard; its traffic is mostly the owner's) and q08.org / reading.q08.org (STRATEGY 2.1: q08 is a separate
// publication, never carried by the owner's identity, so author-credit, work-with-me and iPatent-link ideas would be wrong there).
var IDEA_HOSTS = { "qnfo.org": "qnfo-gateway", "www.qnfo.org": "qnfo-gateway", "papers.qnfo.org": "qnfo-gateway", "ipatent.qnfo.org": "qnfo-ipatent", "ideas.qnfo.org": "idea-hub" };
var IDEA_FLAGSHIP_HOSTS = { "ipatent.qnfo.org": 1 };
var IDEA_CHECKS = [
  { key: "share-image", weight: 3, metric: "referral_30d", test: function(h) { return /<meta[^>]+property=["']og:image["']/i.test(h); }, fix: "add an og:image meta tag (1200x630 share card) and twitter:card summary_large_image, so links shared on LinkedIn, Bluesky and X show an image" },
  { key: "canonical", weight: 2, metric: "indexed_surface", test: function(h) { return /<link[^>]+rel=["']canonical["']/i.test(h); }, fix: "add a <link rel=\"canonical\"> with the page's absolute URL" },
  { key: "structured-data", weight: 2, metric: "indexed_surface", test: function(h) { return /application\/ld\+json/i.test(h); }, fix: "add JSON-LD (Article or WebApplication with the author Person and ORCID sameAs, publisher QNFO)" },
  { key: "description", weight: 2, metric: "pageviews_30d", test: function(h) { return /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{50,}/i.test(h); }, fix: "add a meta description of 50-160 characters that states what the page offers" },
  { key: "author-credit", weight: 2, metric: "external_impact_per_dollar", test: function(h) { return /Quni-Gudzinas/.test(h); }, fix: "credit the author by name (Rowan Brad Quni-Gudzinas) with the ORCID link on the page" },
  { key: "contact-path", weight: 3, metric: "external_impact_per_dollar", test: function(h) { return /work-with-me/.test(h); }, fix: "link to https://qnfo.org/work-with-me (UTM-tagged with the surface name) so a reader who values the work can make contact" },
  { key: "flagship-link", weight: 2, metric: "ipatent_human_views_7d", skipFlagship: true, test: function(h) { return /ipatent\.qnfo\.org/.test(h); }, fix: "link to the flagship tool https://ipatent.qnfo.org/example (UTM-tagged) in the footer or a card" },
  { key: "subscribe-box", weight: 2, metric: "subscribers_growth_monthly", test: function(h) { return /type=["']email["']/i.test(h); }, fix: "add a subscribe box (email input) that posts to the qnfo-subscribers double opt-in, with source set to the surface name" },
  { key: "speed", weight: 1, metric: "pageviews_30d", test: function(h, ms) { return ms <= IDEA_SLOW_MS; }, fix: "the page took longer than 2.5 s to fetch from the edge; cache the HTML or move slow D1 reads off the request path" }
];
// Content-gap catalog: indexable pages that should exist. A 404 is an idea to add the page (one route + HTML in one worker).
var IDEA_CONTENT = [
  { key: "guide-drawings", url: "https://ipatent.qnfo.org/guide/drawings", worker: "qnfo-ipatent", weight: 2, metric: "ipatent_search_visits_7d", fix: "add an indexable /guide/drawings page: when a provisional needs drawings (35 U.S.C. 113), what each figure should show, reference numerals, with a link back to the tool" },
  { key: "guide-provisional-vs-nonprovisional", url: "https://ipatent.qnfo.org/guide/provisional-vs-nonprovisional", worker: "qnfo-ipatent", weight: 2, metric: "ipatent_search_visits_7d", fix: "add an indexable /guide/provisional-vs-nonprovisional page: what each secures, the 12-month deadline, cost, what to file first, with a link back to the tool" },
  { key: "guide-claims", url: "https://ipatent.qnfo.org/guide/claims-in-a-provisional", worker: "qnfo-ipatent", weight: 2, metric: "ipatent_search_visits_7d", fix: "add an indexable /guide/claims-in-a-provisional page: claims are optional in a provisional but useful as a checklist of what the description must support, with the support map as the example" },
  { key: "guide-before-you-publish", url: "https://ipatent.qnfo.org/guide/before-you-publish", worker: "qnfo-ipatent", weight: 2, metric: "ipatent_search_visits_7d", fix: "add an indexable /guide/before-you-publish page: grace periods (US 1 year, EPC none), why a pitch deck or preprint can bar a patent, and what to file first" }
];
var IDEA_NOT_BUILDABLE = { "qnfo-gateway": 1, "qnfo-fleet-control": 1, "qnfo-ops": 1, "qnfo-ai": 1 };
function ideaNormUrl(u) { return String(u || "").replace(/^https?:\/\//, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase(); }
// Pure (REACH-IDEATION-2): RUM rows [{entity_id: "host/path", pv}] -> extra surfaces on owned hosts, one per host + first path
// segment (the busiest page stands for its template), skipping pages the fixed list already probes. Weight follows traffic.
function ideaDiscoverSurfaces(rows, max) {
  var known = {}, ideaTpl = function(norm) { var parts = norm.split("/"); return "rum:" + parts[0].replace(/^www\./, "") + (parts[1] ? "/" + parts[1] : ""); };
  // The fixed surfaces already stand for their templates (papers-index and paper-page cover papers.qnfo.org/papers/*).
  IDEA_SURFACES.forEach(function(s) { var u = s.url === "latest-paper" ? "https://papers.qnfo.org/papers/x" : s.url; known[ideaTpl(ideaNormUrl(u))] = 1; });
  var seen = {}, out = [];
  (rows || []).slice().sort(function(a, b) { return (Number(b.pv) || 0) - (Number(a.pv) || 0) || (String(a.entity_id) < String(b.entity_id) ? -1 : 1); }).forEach(function(r) {
    if (out.length >= (max == null ? IDEA_DISCOVER_MAX : max)) return;
    var id = String(r.entity_id || "").replace(/^https?:\/\//, "");
    var slash = id.indexOf("/");
    var host = (slash < 0 ? id : id.slice(0, slash)).toLowerCase();
    var path = slash < 0 ? "/" : id.slice(slash);
    if (!IDEA_HOSTS[host] || !/^\/[A-Za-z0-9._~%\/-]*$/.test(path)) return;
    var key = ideaTpl(ideaNormUrl(host + path));
    if (known[key] || seen[key]) return;
    seen[key] = 1;
    var pv = Number(r.pv) || 0;
    out.push({ key: key, url: "https://" + host + path, worker: IDEA_HOSTS[host], weight: Math.min(3, 1 + Math.floor(Math.log(1 + pv) / Math.LN2 / 2)), flagship: !!IDEA_FLAGSHIP_HOSTS[host], discovered: true, pv_14d: pv });
  });
  return out;
}
// Pure (REACH-IDEATION-2): learned multiplier for a check kind from its shipped ideas' 7-day metric deltas.
function ideaEfficacyMult(eff) {
  if (!eff || !(eff.n >= 3) || eff.mean == null || !isFinite(eff.mean)) return 1;
  return eff.mean > 0 ? 1.25 : 0.5;
}
// REACH-INTAKE-1: catalog ideas whose edit point is known carry an explicit code-task line and a verbatim anchor, so the code
// loop takes them through ISSUE-INTAKE-1 (no planner model call; the planner's 8 plans a day are shared fleet-wide). The
// anchor must occur exactly once in the file (patch mode); a missing anchor makes the task needs_human, never a bad edit.
// REACH-CONTENT-AUTHORED-1 (0.4.103): no build hint for content ideas. On 2026-10-02 the code agent, given a hint to add an
// iPatent guide page, replaced /guide and credited an invented author with a sample ORCID on legal-adjacent text. It was
// stopped before merge; the pages were written by hand (qnfo-ipatent 3.9.0 GUIDE_PAGES) and qnfo-ipatent/routes.test.mjs now
// fails CI on a missing route or a foreign ORCID. Topics are still ideated and filed; legal content is authored, not generated.
var IDEA_BUILD_HINT = {};
// Pure: probe results -> findings. probes: [{surface, url, status, ms, html}], content: [{key, url, status}],
// extra: discovered surfaces (ideaDiscoverSurfaces), efficacy: {check: {n, mean}}. Sorted by score (value first).
function reachIdeasEvaluate(probes, content, extra, efficacy) {
  var out = [], surfaces = IDEA_SURFACES.concat(extra || []), eff = efficacy || {};
  (probes || []).forEach(function(p) {
    var sf = surfaces.filter(function(s) { return s.key === p.surface; })[0];
    if (!sf || p.status !== 200 || !p.html) return; // an unreachable page is LOOP and uptime territory, not a reach idea
    IDEA_CHECKS.forEach(function(c) {
      if (c.skipFlagship && sf.flagship) return;
      if (c.test(p.html, p.ms)) return;
      out.push({ key: IDEA_PREFIX + c.key + " on " + sf.key, check: c.key, surface: sf.key, url: p.url, worker: sf.worker, metric: c.metric,
        score: Math.round(c.weight * sf.weight * ideaEfficacyMult(eff[c.key]) * 100) / 100, buildable: !IDEA_NOT_BUILDABLE[sf.worker], fix: c.fix,
        evidence: "GET " + p.url + " -> HTTP " + p.status + " in " + p.ms + " ms; check '" + c.key + "' failed" + (sf.discovered ? " (page found by traffic: " + sf.pv_14d + " RUM views in " + IDEA_DISCOVER_DAYS + " days)" : "") });
    });
  });
  (content || []).forEach(function(c) {
    var cat = IDEA_CONTENT.filter(function(x) { return x.key === c.key; })[0];
    if (!cat || c.status === 200 || !c.status) return;
    var hint = IDEA_BUILD_HINT[cat.worker] || null;
    out.push({ key: IDEA_PREFIX + "content " + cat.key, check: "content", surface: cat.key, url: cat.url, worker: cat.worker, metric: cat.metric,
      score: Math.round(cat.weight * 2 * ideaEfficacyMult(eff.content) * 100) / 100, buildable: !IDEA_NOT_BUILDABLE[cat.worker], fix: cat.fix, evidence: "GET " + cat.url + " -> HTTP " + c.status, hint: hint });
  });
  out.sort(function(a, b) { return b.score - a.score || (b.buildable ? 1 : 0) - (a.buildable ? 1 : 0) || (a.key < b.key ? -1 : 1); });
  return out;
}
// Pure (REACH-IDEATION-2): which findings to file now. Value first; buildable ideas fill the free work-in-progress slots, one
// slot is kept for the best idea nobody in the fleet may build, and never more than IDEA_MAX_NEW a run.
function ideaSelect(findings, openTitles, openBuildable, openGap) {
  var open = openTitles || {}, bSlots = Math.max(0, IDEA_WIP_MAX - (openBuildable || 0)), gSlots = Math.max(0, IDEA_GAP_MAX - (openGap || 0)), pick = [];
  (findings || []).forEach(function(f) {
    if (pick.length >= IDEA_MAX_NEW || open[f.key]) return;
    if (f.buildable && bSlots > 0) { pick.push(f); bSlots--; }
    else if (!f.buildable && gSlots > 0) { pick.push(f); gSlots--; }
  });
  return pick;
}
// Pure (REACH-IDEATION-2): outcome rows -> {check: {n, mean}} over ideas whose 7-day value is known.
function ideaEfficacy(rows) {
  var acc = {};
  (rows || []).forEach(function(r) {
    var a = Number(r.value_at_close), b = Number(r.value_7d);
    if (r.value_at_close == null || r.value_7d == null || !isFinite(a) || !isFinite(b)) return;
    var k = r.check_key || "?";
    acc[k] = acc[k] || { n: 0, sum: 0 };
    acc[k].n++; acc[k].sum += b - a;
  });
  var out = {};
  for (var k in acc) out[k] = { n: acc[k].n, mean: Math.round(acc[k].sum / acc[k].n * 1000) / 1000 };
  return out;
}
// REACH-PRIORITY-1: the owner made iPatent the QNFO marquee (STRATEGY 1.8 s2.4a). A buildable idea on a flagship surface or
// from the content catalog is filed high, so the code loop's planner (priority, then age; 8 model plans a day) reaches it
// before older medium issues. Other ideas: high from score 6, else medium.
function ideaPriority(f) {
  var flagship = IDEA_SURFACES.some(function(s) { return s.key === f.surface && s.flagship; }) || f.check === "content";
  if (f.buildable && flagship) return "high";
  return f.score >= 6 ? "high" : "medium";
}
function ideaDescription(f) {
  return "AUTO-FILED by qnfo-fleet-control REACH-IDEATION-1 (owner directive 2026-10-02: the fleet ideates and builds reach work itself). " +
    "Surface: " + f.url + " (served by " + f.worker + "/worker.js). Evidence: " + f.evidence + ". Idea: " + f.fix + ". Metric it should move: " + f.metric +
    (f.buildable ? "." : ". NOT AUTO-BUILDABLE: " + f.worker + " is on the code loop's control-plane deny list; a session or the owner builds it.") +
    " DoD: the live page passes the check; REACH-IDEATION-1 re-probes daily and closes this issue itself with close_evidence. Pillar: reach." +
    (f.buildable && f.hint ? "\nBuild it: " + f.hint.how + ".\ncode-task: repo=qnfo-workers path=" + f.hint.path + "\ncode-anchor: " + f.hint.anchor : "");
}
async function ideaFetch(url) {
  var t0 = Date.now();
  try {
    var r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; qnfo-reach-ideation/" + VERSION + ")" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    var html = (await r.text()).slice(0, 400000);
    return { status: r.status, ms: Date.now() - t0, html: html };
  } catch (e) { return { status: 0, ms: Date.now() - t0, html: "" }; }
}
async function ideaMetricValue(env, metric) {
  var r = await charterOne(env, "SELECT last_value FROM metric_registry WHERE metric = '" + String(metric).replace(/[^a-z0-9_]/gi, "") + "'");
  var v = r ? Number(r.last_value) : NaN;
  return r && r.last_value != null && r.last_value !== "" && isFinite(v) ? v : null;
}
async function reachIdeationTick(env, force) {
  if (!env.AUDIT) return { ok: false, error: "no AUDIT binding" };
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS reach_idea_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, worker_version TEXT, probed INTEGER, findings INTEGER, filed INTEGER, closed INTEGER, state_json TEXT)").run();
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS reach_idea_outcomes (issue_id INTEGER PRIMARY KEY, idea_key TEXT, check_key TEXT, surface TEXT, url TEXT, worker TEXT, metric TEXT, buildable INTEGER, score REAL, value_at_file REAL, filed_at TEXT, closed_at TEXT, value_at_close REAL, value_7d REAL, measured_7d_at TEXT)").run();
  if (!force) {
    var last = await charterOne(env, "SELECT ts FROM reach_idea_runs ORDER BY id DESC LIMIT 1");
    if (last && String(last.ts).slice(0, 10) === new Date().toISOString().slice(0, 10)) return { ok: true, skipped: "already ran today", last: last.ts };
  }
  var nowMs = Date.now(), nowIso = new Date(nowMs).toISOString(), filed = 0, closed = 0, measured7d = 0;
  // Learn first: fill the 7-day value for ideas closed at least 7 days ago, then read the per-check efficacy.
  var due7 = await charterRows(env, "SELECT issue_id, metric FROM reach_idea_outcomes WHERE closed_at IS NOT NULL AND value_7d IS NULL AND closed_at <= '" + new Date(nowMs - 7 * 864e5).toISOString() + "' LIMIT 50");
  for (var d = 0; d < due7.length; d++) {
    var v7 = await ideaMetricValue(env, due7[d].metric);
    if (v7 == null) continue;
    try { await env.AUDIT.prepare("UPDATE reach_idea_outcomes SET value_7d = ?2, measured_7d_at = ?3 WHERE issue_id = ?1").bind(due7[d].issue_id, v7, nowIso).run(); measured7d++; } catch (e) {}
  }
  var efficacy = ideaEfficacy(await charterRows(env, "SELECT check_key, value_at_close, value_7d FROM reach_idea_outcomes WHERE value_7d IS NOT NULL"));
  // Discover: the busiest owned pages by RUM traffic, plus the pages of still-open ideas (so they can close).
  var rum = await charterRows(env, "SELECT entity_id, SUM(value) AS pv FROM reach_signals WHERE source = 'cf-rum' AND entity_type = 'page' AND metric = 'pageviews' AND date >= date('now', '-" + IDEA_DISCOVER_DAYS + " day') GROUP BY entity_id ORDER BY pv DESC LIMIT 60");
  var extra = ideaDiscoverSurfaces(rum, IDEA_DISCOVER_MAX);
  var openOut = await charterRows(env, "SELECT o.surface, o.url, o.worker FROM reach_idea_outcomes o JOIN agent_issues a ON a.id = o.issue_id WHERE a.status = 'open' AND o.surface LIKE 'rum:%'");
  openOut.forEach(function(o) {
    if (extra.some(function(x) { return x.key === o.surface; })) return;
    var host = String(o.url || "").replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
    if (IDEA_HOSTS[host]) extra.push({ key: o.surface, url: o.url, worker: IDEA_HOSTS[host], weight: 1, flagship: !!IDEA_FLAGSHIP_HOSTS[host], discovered: true, pv_14d: 0 });
  });
  var probes = [], all = IDEA_SURFACES.concat(extra);
  for (var i = 0; i < all.length; i++) {
    var sf = all[i], url = sf.url;
    if (url === "latest-paper") {
      var idx = await ideaFetch("https://papers.qnfo.org/papers");
      var m = /href="(\/papers\/[a-z0-9-]{8,})"/.exec(idx.html || "");
      if (!m) continue;
      url = "https://papers.qnfo.org" + m[1];
    }
    var res = await ideaFetch(url);
    probes.push({ surface: sf.key, url: url, status: res.status, ms: res.ms, html: res.html });
  }
  var content = [];
  for (var j = 0; j < IDEA_CONTENT.length; j++) {
    var cr = await ideaFetch(IDEA_CONTENT[j].url);
    content.push({ key: IDEA_CONTENT[j].key, url: IDEA_CONTENT[j].url, status: cr.status });
  }
  var findings = reachIdeasEvaluate(probes, content, extra, efficacy);
  var want = {};
  findings.forEach(function(f) { want[f.key] = f; });
  var open = await charterRows(env, "SELECT id, title, description FROM agent_issues WHERE status = 'open' AND title LIKE 'REACH-IDEA-1:%'");
  var openByTitle = {}, openBuildable = 0, openGap = 0;
  open.forEach(function(r) { openByTitle[r.title] = r.id; if (/NOT AUTO-BUILDABLE/.test(String(r.description || ""))) openGap++; else openBuildable++; });
  // Backfill outcome rows for ideas filed before 0.4.95 (value_at_file is then today's value, not the filing-day value).
  var have = {};
  (await charterRows(env, "SELECT issue_id FROM reach_idea_outcomes")).forEach(function(r) { have[r.issue_id] = 1; });
  for (var b = 0; b < open.length; b++) {
    if (have[open[b].id]) continue;
    var bf = want[open[b].title];
    if (!bf) continue;
    try {
      await env.AUDIT.prepare("INSERT OR IGNORE INTO reach_idea_outcomes (issue_id, idea_key, check_key, surface, url, worker, metric, buildable, score, value_at_file, filed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)")
        .bind(open[b].id, bf.key, bf.check, bf.surface, bf.url, bf.worker, bf.metric, bf.buildable ? 1 : 0, bf.score, await ideaMetricValue(env, bf.metric), nowIso).run();
    } catch (e) {}
  }
  var picks = ideaSelect(findings, openByTitle, openBuildable, openGap);
  for (var k = 0; k < picks.length; k++) {
    var f = picks[k];
    try {
      var ins = await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, 'qnfo-fleet-control', 'reach', ?3, 'open', ?4, ?4)")
        .bind(f.key, ideaDescription(f), ideaPriority(f), nowMs).run();
      filed++;
      var iid = ins && ins.meta ? ins.meta.last_row_id : null;
      if (iid) await env.AUDIT.prepare("INSERT OR IGNORE INTO reach_idea_outcomes (issue_id, idea_key, check_key, surface, url, worker, metric, buildable, score, value_at_file, filed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)")
        .bind(iid, f.key, f.check, f.surface, f.url, f.worker, f.metric, f.buildable ? 1 : 0, f.score, await ideaMetricValue(env, f.metric), nowIso).run();
    } catch (e) {}
  }
  var probedKeys = {};
  probes.forEach(function(p) { if (p.status === 200) probedKeys[p.surface] = 1; });
  content.forEach(function(c) { if (c.status) probedKeys[c.key] = 1; });
  for (var t in openByTitle) {
    if (want[t]) continue;
    var surf = t.replace(IDEA_PREFIX, "").replace(/^content /, "").split(" on ").pop();
    if (!probedKeys[surf]) continue; // not measured this run: unknown is not a recovery
    try {
      await env.AUDIT.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?1, 'REACH-IDEATION-1', 'closed', 'qnfo-fleet-control', datetime('now'), ?2) ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence, triage_state = 'closed'")
        .bind(openByTitle[t], "REACH-IDEATION-1 " + nowIso + ": the live page now passes this check.").run();
      await env.AUDIT.prepare("UPDATE agent_issues SET status = 'closed', updated_at = ?2 WHERE id = ?1").bind(openByTitle[t], nowMs).run();
      closed++;
      var oc = await charterOne(env, "SELECT metric FROM reach_idea_outcomes WHERE issue_id = " + Number(openByTitle[t]));
      if (oc) await env.AUDIT.prepare("UPDATE reach_idea_outcomes SET closed_at = ?2, value_at_close = ?3 WHERE issue_id = ?1").bind(openByTitle[t], nowIso, await ideaMetricValue(env, oc.metric)).run();
    } catch (e) {}
  }
  // reach_ideas_shipped_30d: ideas this loop closed with evidence in 30 days. Unmeasured ('n/a', the trigger cannot fire) until
  // the oldest outcome row is IDEA_SHIPPED_GRACE_DAYS old: an idea needs a code task, a PR, a merge and a deploy first.
  var shipped = null;
  try {
    var first = await charterOne(env, "SELECT MIN(filed_at) AS f FROM reach_idea_outcomes");
    var sc = await charterOne(env, "SELECT COUNT(*) AS n FROM reach_idea_outcomes WHERE closed_at >= '" + new Date(nowMs - 30 * 864e5).toISOString() + "'");
    var mature = first && first.f && Date.parse(first.f) <= nowMs - IDEA_SHIPPED_GRACE_DAYS * 864e5;
    shipped = mature && sc ? Number(sc.n) || 0 : null;
    await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2 WHERE metric = 'reach_ideas_shipped_30d'").bind(shipped == null ? "n/a" : String(shipped), nowIso).run();
  } catch (e) {}
  var state = { findings: findings.map(function(f) { return { key: f.key, buildable: f.buildable, score: f.score }; }), probes: probes.map(function(p) { return { surface: p.surface, url: p.url, status: p.status, ms: p.ms }; }), content: content,
    discovered: extra.map(function(x) { return { key: x.key, url: x.url, worker: x.worker, pv_14d: x.pv_14d }; }), efficacy: efficacy, wip: { open_buildable: openBuildable, open_gap: openGap }, measured_7d: measured7d, shipped_30d: shipped };
  try {
    await env.AUDIT.prepare("INSERT INTO reach_idea_runs (ts, worker_version, probed, findings, filed, closed, state_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
      .bind(nowIso, VERSION, probes.length + content.length, findings.length, filed, closed, JSON.stringify(state).slice(0, 12000)).run();
  } catch (e) {}
  return { ok: true, ts: nowIso, probed: probes.length + content.length, discovered: extra.length, findings: findings.length, filed: filed, closed: closed, wip: state.wip, efficacy: efficacy, shipped_30d: shipped,
    top: findings.slice(0, 8).map(function(f) { return f.key + " [" + f.score + "]" + (f.buildable ? "" : " (not auto-buildable)"); }) };
}
// ---- REACH-IDEATION-1:END ----
// ---- PERFORMANCE-LOOP-1:BEGIN (2026-10-02, owner directive of 2026-10-02; pillar autonomy, KPIs in core, cost and reach) ----
// Owner directive (2026-10-02): "You shall automatically measure and improve internal and external performance and
// effectiveness metrics systemwide across the fleet and constantly and consistently improve, adapt, and change yourself and
// the system to improve those metrics." METRIC-CLOSED-LOOP-1 measures, judges and files (metric_registry ->
// v_metric_trigger_state -> analytics_metric_triggers + evaluateMetricTriggers -> remedy_efficacy_30d) and IMPROVEMENT-LOOP-1
// keeps the daily history (metric_history). What neither does is CHANGE the system: every remedy is an issue for someone to
// act on. This block is the half that acts, on the kernel's existing hourly cron (no new cron, worker, secret or binding):
//   levers       PERF_LEVERS holds only knobs that already exist and that a worker reads at run time (each entry names the
//                reading code), bounded by min, max and step. A lever that raises sends or posts in the owner's name is
//                capped at the STRATEGY s4/s5 cadence (PERF_STRATEGY_CAPS) and never moves without one. perf_levers mirrors
//                the list with each knob's current value.
//   driven by    an enabled analytics_metric_triggers row whose action names a lever ('perf-lever:<key>', and the lever's
//   triggers     metric is the trigger's metric) and that is hit now (v_metric_trigger_state.hit = 1) and on each of the last
//                PERF_BREACH_DAYS daily metric_history points.
//   experiment   one bounded step in the direction that relieves the trigger (operator gt/gte: lower is better; lt/lte:
//                higher), written compare-and-swap to ops_config. Baseline: the mean of the metric's metric_history points
//                over the 7 days up to the start. After the lever's window, observed: the mean of the last 7 points after
//                the start. KEPT if it improved by more than max(PERF_EXP_NOISE_REL x |baseline|, one baseline standard
//                deviation), otherwise REVERTED (compare-and-swap again: a knob someone else changed meanwhile is left
//                alone and the experiment is 'superseded'). Fewer than 3 points after the window is a revert once the grace
//                period ends. At most one running experiment per metric and per lever, PERF_EXP_MAX_FLEET fleet-wide, and
//                a PERF_EXP_COOLDOWN_D-day pause per lever after a kept decision (so at most one new experiment per KPI a
//                week). A reverted lever rests PERF_REVERT_REST_D days (CLAUDE.md: a remedy that did not move its metric
//                is replaced, not repeated); it is tried again only after the remedy_efficacy_30d window has passed.
//   learn        each decision is a perf_experiments row; remedy_efficacy_30d counts a kept experiment as a remedy that
//                worked and a reverted one as a remedy that did not (migrations/2026-10-02-performance-loop.sql adds them
//                to its formula), and a note is appended to the trigger's open METRIC-TRIGGER issue.
//   kill switch  ops_config perf_loop_enabled ('0', 'off', 'false', 'no' or 'disabled'; absent = on) stops new experiments.
//                It reverts nothing by itself: a running experiment is still decided at the end of its window by the rule
//                above, and every start and decision is a row, so nothing changes silently.
//   measure      five KPIs the fleet's data already holds and nothing computed, refreshed hourly into metric_registry with
//                their triggers in the same migration: issue_mttr_h_30d, deploy_failure_rate_7d, worker_health_failure_rate,
//                credibility_events_90d and selected_works_citation_coverage. A KPI whose inputs are missing, stale or too
//                thin is UNMEASURED: last_value 'n/a: <reason>' with no digits, so no reader parses a number out of it.
// Ledger: perf_runs, one 'experiments' row per daily run (WATCHMAKER_OPS performance-experiments). Read-out: the
// 'experiments' section of GET /improvement (public; counts and knob values only). The pure functions take no env, so
// performance.test.mjs drives them offline and replays the tick against an in-memory SQLite D1.
var PERF_AFTER_UTC_HOUR = 9;
var PERF_BREACH_DAYS = 3;
var PERF_EXP_MAX_FLEET = 3;
var PERF_EXP_COOLDOWN_D = 7;
var PERF_EXP_NOISE_REL = 0.05;
var PERF_EXP_WINDOW_D = 7;
var PERF_EXP_MIN_POINTS = 3;
var PERF_EXP_GRACE_D = 7;
var PERF_REVERT_REST_D = 30;
var PERF_HISTORY_DAYS = 45;
var PERF_ENABLE_KEY = "perf_loop_enabled";
var PERF_OFF_VALUES = ["0", "off", "false", "no", "disabled"];
var PERF_LEVER_TOKEN = /\bperf-lever:([a-z0-9][a-z0-9-]*)\b/g;
var PERF_SELECTED_DOIS = ["10.5281/zenodo.21637028", "10.5281/zenodo.22261547", "10.5281/zenodo.21821767", "10.5281/zenodo.21945415", "10.5281/zenodo.21901984", "10.5281/zenodo.22026592", "10.5281/zenodo.23079905"];
// STRATEGY s4 (channel cadences) and s5 (OUTREACH-CONSENT-1): the ceiling for any lever that raises what is sent or posted in
// the owner's name. A lever with owner_voice set and no entry here never moves.
var PERF_STRATEGY_CAPS = { bluesky_posts_week: 2, linkedin_posts_week: 3, x_posts_week: 2, outreach_emails_day: 8, outreach_per_domain_day: 3 };
// Knobs that exist and are read at run time (verified 2026-10-02 in the reading code). The other knobs the directive named are
// not D1 knobs and are not seeded: the Bluesky weekly cap is the env var SOCIAL_WEEKLY_CAP (qnfo-social weeklyCap()), the
// outreach caps are constants (qnfo-outreach GLOBAL_DAILY_CAP and PER_DOMAIN_DAILY_CAP, qnfo-cloud-ops
// OUTREACH_SHARED_DAILY_CAP), qnfo-ai's spend caps and model tiers are env vars (spendCaps(), SPEND_CAP_ENV), and
// pipeline_flags social_paused and linkedin_mode are kill switches, not levers. Changing an env var or a constant is a deploy,
// which this loop never makes.
var PERF_LEVERS = [
  // direction: which way the loop steps the knob; effect: which way that step moves the metric.
  { key: "q08-cadence", metric: "fleet_ai_run_rate_30d_usd", ops_config_key: "q08_max_per_day", min: 2, max: 10, step: 2, default_value: 10, direction: -1, effect: "lower", tier: "T1", owner_voice: 0, eval_days: 14, lock_key: "q08_review_2026_10_31",
    note: "q08-signal-engine dailyCap() reads ops_config q08_max_per_day before every generation (Q08-CADENCE-CAP-1, 0.7.37; an integer, at most 10, absent = 10) and composes each essay with Workers AI (COMPOSE_MODELS via env.AI.run, attributed in ai_call_counters), which fleet_ai_run_rate_30d_usd (FLEET-RUN-RATE-1) projects from the last 7 days, so a lower cap lowers the fleet's own AI run rate inside the experiment window. q08 is a separate publication, not the owner's voice (STRATEGY s2.1). Floor 2, the Q08-REVIEW-2026-10-31 cut: 0 would pause q08, and retiring q08 is the owner's call. Once ops_config q08_review_2026_10_31 holds a decision the review owns the knob and the loop never raises it above the value the review set." }
];
function perfRound(x, d) { var p = Math.pow(10, d === void 0 ? 4 : d); return Math.round(x * p) / p; }
// A value is a number only when the whole string is one ("12", "0.25", "+5.7%", "$150"); "n/a: 27 of 30 days" is not.
function perfNumStrict(v) {
  if (v === null || v === void 0) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  var m = String(v).replace(/,/g, "").match(/^\s*[+$]?\s*(-?\d+(?:\.\d+)?)\s*%?\s*$/);
  return m ? Number(m[1]) : null;
}
function perfTs(v) {
  if (v === null || v === void 0 || v === "") return NaN;
  if (typeof v === "number") return v < 1e11 ? v * 1e3 : v;
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00Z";
  else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = s.replace(" ", "T") + "Z";
  return Date.parse(s);
}
function perfAgeH(v, nowMs) { var t = perfTs(v); return isNaN(t) ? null : (nowMs - t) / 36e5; }
function perfDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
function perfShiftDay(day, n) { return new Date(Date.parse(day + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10); }
function perfMedian(a) {
  if (!a.length) return null;
  var s = a.slice().sort(function(x, y) { return x - y; }), h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}
function perfMean(a) { return a.length ? a.reduce(function(x, y) { return x + y; }, 0) / a.length : null; }
function perfSd(a) {
  if (a.length < 2) return 0;
  var m = perfMean(a);
  return Math.sqrt(a.reduce(function(x, y) { return x + (y - m) * (y - m); }, 0) / a.length);
}
// The registry text for an unmeasured KPI: no digit survives, so charterNum, the IMPROVEMENT-LOOP-1 snapshot and
// v_metric_trigger_state all read it as unknown rather than as a number taken from the reason.
function perfNaText(why) { return ("n/a: " + String(why || "unmeasured").replace(/-?\d+(?:\.\d+)?/g, "N")).slice(0, 300); }
var PERF_SOCIAL_SOURCES = /^(bluesky|bsky|hn|hackernews|hacker-news|lobsters|reddit|mastodon|x|twitter|threads|stackoverflow|stack-overflow)$/i;
var PERF_OWN_AUTHORS = /qnfo|quni|gudzinas|q08|brid\.gy/i;

// ---- the five KPIs (pure; f = perfMetricFacts). Each returns { value, why?, detail? }; value null means UNMEASURED. ----
function perfMttr(f) {
  var rows = f.closed_issues;
  if (!Array.isArray(rows)) return { value: null, why: "agent_issues unreadable" };
  var hs = rows.map(function(r) { return (Number(r.updated_at) - Number(r.created_at)) / 36e5; }).filter(function(h) { return isFinite(h) && h >= 0; });
  if (hs.length < 10) return { value: null, why: hs.length + " issues closed in 30 days (needs 10)" };
  var s = hs.slice().sort(function(a, b) { return a - b; });
  return { value: perfRound(perfMedian(hs), 2), detail: { closed_30d: hs.length, p90_h: perfRound(s[Math.min(s.length - 1, Math.floor(s.length * 0.9))], 1), mean_h: perfRound(perfMean(hs), 1) } };
}
function perfDeployFail(f) {
  var rows = f.deploys;
  if (!Array.isArray(rows)) return { value: null, why: "fleet_deploys unreadable" };
  var n = 0, failed = 0, by = [];
  rows.forEach(function(r) { var t = Number(r.n) || 0, ok = Number(r.okn) || 0; n += t; failed += t - ok; if (t - ok > 0) by.push({ worker: String(r.worker || "?"), failed: t - ok, deploys: t }); });
  if (n < 20) return { value: null, why: n + " deploys in 7 days (needs 20)" };
  by.sort(function(a, b) { return b.failed - a.failed || (a.worker < b.worker ? -1 : 1); });
  return { value: perfRound(failed / n, 4), detail: { deploys_7d: n, failed_7d: failed, top: by.slice(0, 3), dominant: failed > 0 && by.length && by[0].failed / failed >= 0.5 ? by[0].worker : null } };
}
function perfWorkerHealth(f, nowMs) {
  var rows = f.live_audit;
  if (!Array.isArray(rows)) return { value: null, why: "worker_live_audit unreadable" };
  var live = rows.filter(function(r) { var n = String(r.note || ""); return n !== "NOT_A_WORKER" && n !== "NOT_DEPLOYED" && n !== "RETIRED" && n !== "FOLDED"; });
  if (!live.length) return { value: null, why: "worker_live_audit lists no live worker" };
  var newest = null;
  live.forEach(function(r) { var a = perfAgeH(r.probed_at, nowMs); if (a !== null && (newest === null || a < newest)) newest = a; });
  if (newest === null || newest > 26) return { value: null, why: "the newest live-audit probe is " + (newest === null ? "unreadable" : Math.round(newest) + "h old") + " (needs under 26h)" };
  var failing = live.filter(function(r) { var n = String(r.note || ""); return !(Number(r.http) === 200 || n === "SYNC" || n === "CRON_ONLY"); }).map(function(r) { return String(r.worker); }).sort();
  return { value: perfRound(failing.length / live.length, 4), detail: { live: live.length, failing_n: failing.length, failing: failing.slice(0, 12) } };
}
// Credibility events (STRATEGY s6.3): new OpenAlex citations of the selected works plus third-party mentions in non-social
// sources, or the attested count (invest_facts) when that is higher. Social posts are listed, not counted. Unmeasured when
// OpenAlex holds readings for fewer than 4 of the 7 selected works in 90 days and nothing is attested.
function perfCredibility(f, nowMs) {
  var cit = f.selected_citations, men = f.mentions, att = f.attested, attested = null;
  if (att && perfNumStrict(att.value) !== null) { var aa = perfAgeH(att.updated_at, nowMs); if (aa !== null && aa <= 90 * 24) attested = perfNumStrict(att.value); }
  if (!Array.isArray(cit) || !Array.isArray(men)) {
    if (attested !== null) return { value: attested, detail: { attested: attested, measured: null } };
    return { value: null, why: "citation_stats or external_mentions unreadable" };
  }
  var by = {};
  cit.forEach(function(r) {
    var d = String(r.doi || "").toLowerCase(), v = Number(r.value), t = perfTs(r.collected_at);
    if (!d || !isFinite(v) || isNaN(t)) return;
    var e = by[d] || (by[d] = { first: t, fv: v, last: t, lv: v });
    if (t < e.first) { e.first = t; e.fv = v; }
    if (t > e.last) { e.last = t; e.lv = v; }
  });
  var tracked = Object.keys(by).length, growth = 0;
  Object.keys(by).forEach(function(d) { growth += Math.max(0, by[d].lv - by[d].fv); });
  var credible = 0, social = 0;
  men.forEach(function(m) { if (PERF_OWN_AUTHORS.test(String(m.author || ""))) return; if (PERF_SOCIAL_SOURCES.test(String(m.source || "").trim())) social++; else credible++; });
  var detail = { selected_works_tracked: tracked, selected_works: PERF_SELECTED_DOIS.length, new_citations: growth, credible_mentions: credible, social_mentions_not_counted: social, attested: attested };
  if (tracked < 4 && attested === null) return { value: null, why: "OpenAlex readings cover " + tracked + " of the " + PERF_SELECTED_DOIS.length + " selected works in 90 days (needs 4) and no event is attested", detail: detail };
  var measured = growth + credible;
  return { value: attested !== null ? Math.max(attested, measured) : measured, detail: detail };
}
function perfCitationCoverage(f, nowMs) {
  if (!Array.isArray(f.selected_recent)) return { value: null, why: "citation_stats unreadable" };
  var age = perfAgeH(f.citations_last, nowMs);
  if (age === null || age > 72) return { value: null, why: "the OpenAlex collection has not run in 72h" };
  var seen = {};
  f.selected_recent.forEach(function(r) { var d = String(r.doi || "").toLowerCase(); if (PERF_SELECTED_DOIS.indexOf(d) >= 0) seen[d] = 1; });
  var have = Object.keys(seen);
  return { value: have.length, detail: { of: PERF_SELECTED_DOIS.length, missing: PERF_SELECTED_DOIS.filter(function(d) { return !seen[d]; }) } };
}
var PERF_METRICS = [
  { metric: "issue_mttr_h_30d", fn: perfMttr, layer: "operational", kind: "leading", target: "<= 48 (median hours from filing to closing; a guard band, no stated target: autotriage gives every issue a 7-day SLA)", warning: "> 24", kill: "> 72",
    formula: "median hours from created_at to the closing update (updated_at) of agent_issues closed or resolved in the last 30 days (wontfix and duplicate excluded); unmeasured under 10 closures (PERFORMANCE-LOOP-1, qnfo-fleet-control hourly)", sot: "qnfo-audit.agent_issues (created_at, updated_at in ms)" },
  { metric: "deploy_failure_rate_7d", fn: perfDeployFail, layer: "operational", kind: "leading", target: "<= 0.1 (share of canonical deploys that failed in 7 days; a guard band)", warning: "> 0.05", kill: "> 0.2",
    formula: "rows with ok=0 / all rows in fleet_deploys over the last 7 days; unmeasured under 20 deploys (PERFORMANCE-LOOP-1, qnfo-fleet-control hourly)", sot: "qnfo-audit.fleet_deploys (canonical deploy ledger)" },
  { metric: "worker_health_failure_rate", fn: perfWorkerHealth, layer: "operational", kind: "leading", target: "<= 0 (charter s5 and principle 2: every live worker serving, judged by a live probe)", warning: "> 0", kill: "> 0.1",
    formula: "share of live workers in worker_live_audit (notes other than NOT_A_WORKER and NOT_DEPLOYED) that are neither http 200 nor SYNC or CRON_ONLY; unmeasured when the newest probe is over 26h old (PERFORMANCE-LOOP-1, qnfo-fleet-control hourly)", sot: "qnfo-audit.worker_live_audit" },
  { metric: "credibility_events_90d", fn: perfCredibility, layer: "system", kind: "lagging", target: ">= 2 by 2026-12-31 (STRATEGY s9 review gate; the s9 target is 3)", warning: "< 2", kill: "< 1",
    formula: "max(new OpenAlex citations of the 7 selected works in 90 days + third-party mentions in non-social sources first seen in 90 days (external_mentions; social posts listed, not counted), the attested invest_facts credibility_events). Unmeasured when OpenAlex covers fewer than 4 of the 7 selected works and nothing is attested. Talks, acceptances, press and arXiv listings count only when attested (PERFORMANCE-LOOP-1, qnfo-fleet-control hourly)", sot: "qnfo-audit.citation_stats (openalex) + external_mentions + invest_facts" },
  { metric: "selected_works_citation_coverage", fn: perfCitationCoverage, layer: "fleet", kind: "leading", target: ">= 7 (every selected work in the daily OpenAlex collection, STRATEGY s6.1)", warning: "< 7", kill: "< 4",
    formula: "selected works (STRATEGY s2.4, 7 DOIs) with an OpenAlex cited_by_count reading in the last 3 days; unmeasured when the collection has not run in 72h (PERFORMANCE-LOOP-1, qnfo-fleet-control hourly)", sot: "qnfo-audit.citation_stats (qnfo-paper-indexer OpenAlex collection)" }
];
// Pure: facts -> the five readings.
function perfMetricsEvaluate(f, nowMs) {
  f = f || {};
  return PERF_METRICS.map(function(m) {
    var c;
    try { c = m.fn(f, nowMs); } catch (e) { c = { value: null, why: "compute error: " + String(e && e.message || e).slice(0, 120) }; }
    var v = c.value === null || c.value === void 0 ? null : c.value;
    return { metric: m.metric, value: v, state: v === null ? "UNMEASURED" : "MEASURED", why: v === null ? (c.why || "unmeasured") : null, detail: c.detail || null, registry_value: v === null ? perfNaText(c.why) : String(v) };
  });
}
// ---- experiments (pure) ----
function perfEnabled(ops) {
  var v = ops ? ops[PERF_ENABLE_KEY] : null;
  return !(v !== null && v !== void 0 && PERF_OFF_VALUES.indexOf(String(v).trim().toLowerCase()) >= 0);
}
// The knob's effective value as its reader sees it: an absent or non-numeric value is the reader's default.
function perfLeverValue(l, ops) {
  var v = perfNumStrict(ops ? ops[l.ops_config_key] : null);
  return v === null ? Number(l.default_value) : v;
}
// The bounds a lever may move within today, or null when it may not move at all.
function perfLeverBounds(l, ops) {
  var lo = Number(l.min), hi = Number(l.max);
  if (!isFinite(lo) || !isFinite(hi) || !(Number(l.step) > 0) || lo > hi) return null;
  if (l.owner_voice) {
    var cap = PERF_STRATEGY_CAPS[l.cap_key];
    if (cap === void 0 || cap === null) return null;
    hi = Math.min(hi, cap);
  }
  if (l.lock_key && ops && ops[l.lock_key] !== null && ops[l.lock_key] !== void 0 && String(ops[l.lock_key]).trim() !== "") hi = Math.min(hi, perfLeverValue(l, ops));
  return lo <= hi ? { min: lo, max: hi } : null;
}
// Which way relieves a trigger: operator gt/gte fire on high values (lower is better), lt/lte on low ones.
function perfDirOf(op) { op = String(op || "gte"); return op === "lt" || op === "lte" ? "higher" : op === "eq" ? null : "lower"; }
function perfBreaches(op, thr, v) {
  op = String(op || "gte"); thr = Number(thr);
  return op === "gt" ? v > thr : op === "lte" ? v <= thr : op === "lt" ? v < thr : op === "eq" ? v === thr : v >= thr;
}
// metric_history rows -> { metric: { day: value } } (numbers only).
function perfHistoryIndex(rows) {
  var by = {};
  (rows || []).forEach(function(r) { var v = Number(r.value); if (!r.metric || !r.day || r.value === null || r.value === void 0 || !isFinite(v)) return; (by[r.metric] = by[r.metric] || {})[String(r.day).slice(0, 10)] = v; });
  return by;
}
// Consecutive daily points breaching the trigger, counted back from today (or from yesterday when today has no point yet).
function perfBreachStreak(byDay, t, today) {
  var d = byDay[today] === void 0 ? perfShiftDay(today, -1) : today, n = 0;
  for (var i = 0; i < 60; i++, d = perfShiftDay(d, -1)) { if (byDay[d] === void 0 || !perfBreaches(t.operator, t.threshold, byDay[d])) break; n++; }
  return n;
}
function perfWindow(byDay, fromDay, toDay) {
  var out = [];
  for (var d = toDay, i = 0; i < 60 && d >= fromDay; i++, d = perfShiftDay(d, -1)) if (byDay[d] !== void 0) out.push(byDay[d]);
  return out;
}
// Pure: decide one running experiment from the metric's daily history.
function perfDecideExperiment(e, byDay, nowMs) {
  var due = Date.parse(e.eval_after);
  if (!(nowMs >= due)) return { decision: "wait", why: "evaluation window open until " + e.eval_after };
  var start = String(e.started_at || "").slice(0, 10), today = perfDay(nowMs);
  var from = perfShiftDay(today, -(PERF_EXP_WINDOW_D - 1));
  if (from <= start) from = perfShiftDay(start, 1);
  var vals = perfWindow(byDay || {}, from, today);
  if (vals.length < PERF_EXP_MIN_POINTS) {
    if (nowMs - due > PERF_EXP_GRACE_D * 864e5) return { decision: "reverted", n: vals.length, why: "only " + vals.length + " metric_history points after the window: no improvement shown, reverted" };
    return { decision: "wait", n: vals.length, why: "needs " + PERF_EXP_MIN_POINTS + " metric_history points after the start, has " + vals.length };
  }
  var obs = perfMean(vals), base = Number(e.baseline), sign = e.dir === "higher" ? 1 : -1;
  var imp = sign * (obs - base), thr = Math.max(PERF_EXP_NOISE_REL * Math.abs(base), Number(e.baseline_sd) || 0);
  return { decision: imp > thr ? "kept" : "reverted", observed: perfRound(obs, 4), improvement: perfRound(imp, 4), threshold: perfRound(thr, 4), n: vals.length,
    why: (imp > thr ? "improved by " : "did not improve beyond noise: ") + perfRound(imp, 4) + " against a threshold of " + perfRound(thr, 4) + " (mean of " + vals.length + " points " + perfRound(obs, 4) + " vs baseline " + base + ")" };
}
// Pure: today's decisions and starts.
//   f.triggers     [{id, metric_key, operator, threshold, action, hit}] enabled triggers with their live state
//   f.history      metric_history rows for the lever metrics
//   f.experiments  perf_experiments rows (running, or started or decided in the last 30 days)
//   f.ops          ops_config values for the kill switch, every knob and every lock
function perfExperimentPlan(f, nowMs) {
  f = f || {};
  var ops = f.ops || {}, enabled = perfEnabled(ops), exps = f.experiments || [], today = perfDay(nowMs);
  var hist = perfHistoryIndex(f.history);
  var evals = exps.filter(function(e) { return e.decision === "running"; }).map(function(e) { return { exp: e, d: perfDecideExperiment(e, hist[e.metric] || {}, nowMs) }; });
  var still = evals.filter(function(x) { return x.d.decision === "wait"; }).map(function(x) { return x.exp; });
  var starts = [], skipped = [];
  PERF_LEVERS.slice().sort(function(a, b) { return a.key < b.key ? -1 : 1; }).forEach(function(l) {
    var named = (f.triggers || []).filter(function(t) { var m, re = new RegExp(PERF_LEVER_TOKEN.source, "g"), keys = []; while ((m = re.exec(String(t.action || "")))) keys.push(m[1]); return keys.indexOf(l.key) >= 0; });
    var t = named.filter(function(x) { return x.metric_key === l.metric; })[0];
    var byDay = hist[l.metric] || {}, why = null, to = null, dir = t ? perfDirOf(t.operator) : null;
    var busy = still.concat(starts);
    // a decision taken in this same run counts: the lever rests for the cooldown before its next step
    var lastDecided = exps.filter(function(e) { return e.lever === l.key && e.decision !== "running" && e.decided_at; }).map(function(e) { return perfTs(e.decided_at); })
      .concat(evals.filter(function(x) { return x.exp.lever === l.key && x.d.decision !== "wait"; }).map(function() { return nowMs; }))
      .filter(function(x) { return !isNaN(x); }).sort(function(a, b) { return a - b; }).pop();
    var lastReverted = exps.filter(function(e) { return e.lever === l.key && e.decision === "reverted" && e.decided_at; }).map(function(e) { return perfTs(e.decided_at); })
      .concat(evals.filter(function(x) { return x.exp.lever === l.key && x.d.decision === "reverted"; }).map(function() { return nowMs; }))
      .filter(function(x) { return !isNaN(x); }).sort(function(a, b) { return a - b; }).pop();
    var b = perfLeverBounds(l, ops), cur = perfLeverValue(l, ops);
    if (!enabled) why = "kill switch: ops_config " + PERF_ENABLE_KEY + " = " + ops[PERF_ENABLE_KEY];
    else if (!t) why = named.length ? "the triggers naming it watch another metric (the lever moves only " + l.metric + ")" : "no enabled trigger names perf-lever:" + l.key;
    else if (Number(t.hit) !== 1) why = "trigger #" + t.id + " (" + t.metric_key + " " + t.operator + " " + t.threshold + ") is not hit now";
    else if (!dir || dir !== l.effect) why = "the lever moves " + l.metric + " " + (l.effect || "an unknown way") + " and trigger #" + t.id + " asks for " + (dir || "no direction");
    else if (perfBreachStreak(byDay, t, today) < PERF_BREACH_DAYS) why = "trigger #" + t.id + " breached on " + perfBreachStreak(byDay, t, today) + " consecutive metric_history days (needs " + PERF_BREACH_DAYS + ")";
    else if (busy.some(function(e) { return e.metric === l.metric || e.lever === l.key; })) why = "an experiment on this metric or lever is running";
    else if (busy.length >= PERF_EXP_MAX_FLEET) why = "fleet-wide cap of " + PERF_EXP_MAX_FLEET + " running experiments";
    else if (lastReverted && nowMs - lastReverted < PERF_REVERT_REST_D * 864e5) why = "the last experiment on this lever was reverted under " + PERF_REVERT_REST_D + " days ago: a remedy that did not move its metric is replaced, not repeated";
    else if (lastDecided && nowMs - lastDecided < PERF_EXP_COOLDOWN_D * 864e5) why = "cooldown: the last decision on this lever is under " + PERF_EXP_COOLDOWN_D + " days old";
    else if (!b) why = "no bounds the lever may move within (an owner-voice lever without a STRATEGY cap)";
    else if (cur < b.min || cur > b.max) why = "current value " + cur + " is outside the loop's bounds " + b.min + ".." + b.max + "; left alone";
    else {
      to = Math.min(b.max, Math.max(b.min, cur + l.direction * l.step));
      if (to === cur) why = "at its bound (" + cur + ")";
    }
    if (!why) {
      var base = perfWindow(byDay, perfShiftDay(today, -(PERF_EXP_WINDOW_D - 1)), today);
      if (base.length < PERF_EXP_MIN_POINTS) why = "needs " + PERF_EXP_MIN_POINTS + " metric_history points for a baseline, has " + base.length;
      else starts.push({ lever: l.key, metric: l.metric, trigger_id: t.id, dir: dir, ops_config_key: l.ops_config_key, from_raw: ops[l.ops_config_key] === void 0 || ops[l.ops_config_key] === null ? null : String(ops[l.ops_config_key]), from_value: cur, to_value: to, baseline: perfRound(perfMean(base), 4), baseline_sd: perfRound(perfSd(base), 4), n: base.length, eval_after: new Date(nowMs + (l.eval_days || 14) * 864e5).toISOString() });
    }
    if (why) skipped.push({ lever: l.key, why: why });
  });
  return { enabled: enabled, evaluations: evals, starts: starts, skipped: skipped };
}
// ---- I/O ----
async function perfRows(env, sql, binds) {
  try { var st = env.AUDIT.prepare(sql); if (binds && binds.length) st = st.bind.apply(st, binds); var r = await st.all(); return (r && r.results) || []; } catch (e) { return null; }
}
async function perfOne(env, sql, binds) { var r = await perfRows(env, sql, binds); return r && r.length ? r[0] : null; }
// ops_config values for the loop's keys (the kill switch, every knob and lock), or null when ops_config is unreadable.
async function perfOpsValues(env) {
  var keys = [PERF_ENABLE_KEY];
  PERF_LEVERS.forEach(function(l) { keys.push(l.ops_config_key); if (l.lock_key) keys.push(l.lock_key); });
  var rows = await perfRows(env, "SELECT key, value FROM ops_config WHERE key IN (" + keys.map(function(_k, i) { return "?" + (i + 1); }).join(",") + ")", keys);
  if (!rows) return null;
  var o = {};
  rows.forEach(function(r) { o[r.key] = r.value; });
  return o;
}
// Same DDL as migrations/2026-10-02-performance-loop.sql.
var PERF_DDL = [
  "CREATE TABLE IF NOT EXISTS perf_levers (key TEXT PRIMARY KEY, metric TEXT, ops_config_key TEXT, min REAL, max REAL, step REAL, current TEXT, tier TEXT, note TEXT, direction INTEGER, effect TEXT, default_value REAL, owner_voice INTEGER, eval_days INTEGER, updated_at TEXT)",
  "CREATE TABLE IF NOT EXISTS perf_experiments (id INTEGER PRIMARY KEY AUTOINCREMENT, lever TEXT, metric TEXT, trigger_id INTEGER, dir TEXT, from_value TEXT, to_value TEXT, started_at TEXT, baseline REAL, baseline_sd REAL, eval_after TEXT, observed REAL, threshold REAL, decision TEXT, decided_at TEXT, note TEXT)",
  "CREATE TABLE IF NOT EXISTS perf_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, day TEXT, kind TEXT, worker_version TEXT, enabled INTEGER, started INTEGER, decided INTEGER, running INTEGER, note TEXT, state_json TEXT)"
];
async function perfSchema(env) {
  for (var i = 0; i < PERF_DDL.length; i++) await env.AUDIT.prepare(PERF_DDL[i]).run();
  for (var j = 0; j < PERF_LEVERS.length; j++) {
    var l = PERF_LEVERS[j];
    await env.AUDIT.prepare("INSERT INTO perf_levers (key, metric, ops_config_key, min, max, step, tier, note, direction, effect, default_value, owner_voice, eval_days, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) ON CONFLICT(key) DO UPDATE SET metric=excluded.metric, ops_config_key=excluded.ops_config_key, min=excluded.min, max=excluded.max, step=excluded.step, tier=excluded.tier, note=excluded.note, direction=excluded.direction, effect=excluded.effect, default_value=excluded.default_value, owner_voice=excluded.owner_voice, eval_days=excluded.eval_days")
      .bind(l.key, l.metric, l.ops_config_key, l.min, l.max, l.step, l.tier, l.note, l.direction, l.effect, l.default_value, l.owner_voice ? 1 : 0, l.eval_days, new Date().toISOString()).run();
  }
}
// Read-only: the inputs of the five KPIs. A missing table is a null fact, never an exception and never a zero.
async function perfMetricFacts(env, nowMs) {
  var now = nowMs || Date.now(), f = {};
  var d3 = perfDay(now - 2 * 864e5), d90 = perfDay(now - 89 * 864e5);
  f.closed_issues = await perfRows(env, "SELECT created_at, updated_at FROM agent_issues WHERE status IN ('closed','resolved') AND typeof(updated_at) = 'integer' AND updated_at >= ?1 LIMIT 20000", [now - 30 * 864e5]);
  f.deploys = await perfRows(env, "SELECT worker, COUNT(*) AS n, SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) AS okn FROM fleet_deploys WHERE ts >= ?1 GROUP BY worker", [new Date(now - 7 * 864e5).toISOString()]);
  f.live_audit = await perfRows(env, "SELECT worker, http, note, probed_at FROM worker_live_audit");
  var sel = PERF_SELECTED_DOIS.map(function(_d, i) { return "?" + (i + 1); }).join(",");
  f.selected_citations = await perfRows(env, "SELECT lower(doi) AS doi, value, collected_at FROM citation_stats WHERE source = 'openalex' AND metric = 'cited_by_count' AND lower(doi) IN (" + sel + ") AND collected_at >= ?" + (PERF_SELECTED_DOIS.length + 1), PERF_SELECTED_DOIS.concat([d90]));
  f.selected_recent = await perfRows(env, "SELECT DISTINCT lower(doi) AS doi FROM citation_stats WHERE source = 'openalex' AND metric = 'cited_by_count' AND lower(doi) IN (" + sel + ") AND collected_at >= ?" + (PERF_SELECTED_DOIS.length + 1), PERF_SELECTED_DOIS.concat([d3]));
  var cl = await perfOne(env, "SELECT MAX(collected_at) AS at FROM citation_stats WHERE source = 'openalex' AND metric = 'cited_by_count'");
  f.citations_last = cl ? cl.at : null;
  f.mentions = await perfRows(env, "SELECT source, author, first_seen FROM external_mentions WHERE first_seen >= ?1", [d90]);
  f.attested = await perfOne(env, "SELECT value, updated_at FROM invest_facts WHERE key = 'credibility_events'");
  return f;
}
// Hourly: the five KPIs into metric_registry (the row is created on first sight with a canonical cadence).
async function perfMetricsRefresh(env, nowMs) {
  var nowIso = new Date(nowMs).toISOString(), f = await perfMetricFacts(env, nowMs), rs = perfMetricsEvaluate(f, nowMs), written = [];
  for (var i = 0; i < PERF_METRICS.length; i++) {
    var m = PERF_METRICS[i], r = rs[i];
    try {
      await env.AUDIT.prepare("INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES (?1, ?2, ?3, ?4, ?5, 'n/a', ?6, 'qnfo-fleet-control', 'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control) files the breach; PERFORMANCE-LOOP-1 measures it', 'hourly', ?7, ?8, 'MEASURED', 'computed')")
        .bind(m.metric, m.layer, m.kind, m.formula, m.sot, m.target, m.warning, m.kill).run();
      await env.AUDIT.prepare("UPDATE metric_registry SET last_value = ?1, last_refreshed = ?2, state = ?3 WHERE metric = ?4").bind(r.registry_value, nowIso, r.state, m.metric).run();
      written.push(m.metric + "=" + (r.value === null ? "unmeasured" : r.value));
    } catch (e) {}
  }
  return { written: written, readings: rs };
}
// Compare-and-swap on ops_config: the write lands only if the knob still holds `expect` (null = no row); next null deletes.
async function perfCas(env, key, expect, next, note) {
  var A = env.AUDIT, r;
  if (next === null) r = await A.prepare("DELETE FROM ops_config WHERE key = ?1 AND value = ?2").bind(key, String(expect)).run();
  else if (expect === null) r = await A.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES (?1, ?2, ?3, datetime('now')) ON CONFLICT(key) DO NOTHING").bind(key, String(next), note).run();
  else r = await A.prepare("UPDATE ops_config SET value = ?1, note = ?2, updated_at = datetime('now') WHERE key = ?3 AND value = ?4").bind(String(next), note, key, String(expect)).run();
  return !!(r && r.meta && Number(r.meta.changes) > 0);
}
// Appends a line to the trigger's open METRIC-TRIGGER issue (description only; updated_at is untouched, so no recheck).
async function perfNoteIssue(env, triggerId, text) {
  try { await env.AUDIT.prepare("UPDATE agent_issues SET description = COALESCE(description, '') || ?1 WHERE status = 'open' AND title LIKE ?2").bind(" | " + text.slice(0, 600), "METRIC-TRIGGER-" + Number(triggerId) + "-%").run(); } catch (e) {}
}
async function perfExperimentsApply(env, plan, nowMs) {
  var A = env.AUDIT, iso = new Date(nowMs).toISOString(), decided = [], started = [];
  for (var i = 0; i < plan.evaluations.length; i++) {
    var x = plan.evaluations[i], e = x.exp, d = x.d;
    if (d.decision === "wait") continue;
    try {
      var lever = PERF_LEVERS.filter(function(l) { return l.key === e.lever; })[0];
      var outcome = "kept", note = d.why;
      if (d.decision === "reverted") {
        var key = lever ? lever.ops_config_key : null, back = e.from_value === null || e.from_value === void 0 ? null : String(e.from_value);
        var ok = key ? await perfCas(env, key, String(e.to_value), back, ("PERFORMANCE-LOOP-1 reverted experiment " + e.id + " (" + e.lever + "): " + d.why).slice(0, 400)) : false;
        outcome = ok ? "reverted" : "superseded";
        if (!ok) note = "not reverted: ops_config " + key + " no longer holds " + e.to_value + " (changed by someone else; left alone). " + d.why;
      }
      var u = await A.prepare("UPDATE perf_experiments SET decision = ?1, observed = ?2, threshold = ?3, decided_at = ?4, note = ?5 WHERE id = ?6 AND decision = 'running'")
        .bind(outcome, d.observed === void 0 ? null : d.observed, d.threshold === void 0 ? null : d.threshold, iso, String(note).slice(0, 500), e.id).run();
      if (u && u.meta && Number(u.meta.changes) > 0) {
        decided.push(e.id + " " + outcome);
        await perfNoteIssue(env, e.trigger_id, "PERFORMANCE-LOOP-1 " + iso + ": experiment " + e.id + " (" + e.lever + " " + e.from_value + " -> " + e.to_value + ") " + outcome + ": " + note);
      }
    } catch (err) {}
  }
  for (var j = 0; j < plan.starts.length; j++) {
    var s = plan.starts[j];
    try {
      var ins = await A.prepare("INSERT INTO perf_experiments (lever, metric, trigger_id, dir, from_value, to_value, started_at, baseline, baseline_sd, eval_after, decision, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'running', ?11)")
        .bind(s.lever, s.metric, s.trigger_id, s.dir, s.from_raw, String(s.to_value), iso, s.baseline, s.baseline_sd, s.eval_after, ("one step " + s.from_value + " -> " + s.to_value + " because trigger #" + s.trigger_id + " (" + s.metric + ") is hit; baseline = mean of " + s.n + " metric_history points; kept only if the mean of the last " + PERF_EXP_WINDOW_D + " days after " + s.eval_after.slice(0, 10) + " beats it by more than max(" + PERF_EXP_NOISE_REL * 100 + "% of the baseline, one baseline standard deviation), else reverted").slice(0, 500)).run();
      var id = ins && ins.meta ? ins.meta.last_row_id : null;
      var ok2 = await perfCas(env, s.ops_config_key, s.from_raw, s.to_value, ("PERFORMANCE-LOOP-1 experiment " + id + " (" + s.lever + "): " + s.from_value + " -> " + s.to_value + " for " + s.metric + "; evaluated after " + s.eval_after.slice(0, 10) + " and reverted automatically unless it improves; ops_config " + PERF_ENABLE_KEY + "=0 stops new experiments").slice(0, 400));
      if (!ok2) {
        if (id) await A.prepare("UPDATE perf_experiments SET decision = 'aborted', decided_at = ?1, note = ?2 WHERE id = ?3").bind(iso, "ops_config " + s.ops_config_key + " changed between the read and the write; nothing applied", id).run();
        continue;
      }
      started.push(s.lever + " " + s.from_value + "->" + s.to_value);
      await perfNoteIssue(env, s.trigger_id, "PERFORMANCE-LOOP-1 " + iso + ": experiment " + id + " started, " + s.lever + " (ops_config " + s.ops_config_key + ") " + s.from_value + " -> " + s.to_value + "; decided after " + s.eval_after.slice(0, 10) + " (kept if " + s.metric + " improves beyond noise, else reverted)");
    } catch (err2) {}
  }
  return { decided: decided, started: started };
}
// Read-only: what the experiment plan needs.
async function perfExperimentFacts(env, nowMs) {
  var f = {}, metrics = [];
  PERF_LEVERS.forEach(function(l) { if (metrics.indexOf(l.metric) < 0) metrics.push(l.metric); });
  f.triggers = await perfRows(env, "SELECT t.id, t.metric_key, t.operator, t.threshold, t.action, s.hit, s.val FROM analytics_metric_triggers t LEFT JOIN v_metric_trigger_state s ON s.id = t.id WHERE t.enabled = 1 AND t.action LIKE '%perf-lever:%'");
  f.history = await perfRows(env, "SELECT metric, day, value FROM metric_history WHERE day >= ?1 AND metric IN (" + metrics.map(function(_m, i) { return "?" + (i + 2); }).join(",") + ")", [perfDay(nowMs - PERF_HISTORY_DAYS * 864e5)].concat(metrics));
  f.experiments = await perfRows(env, "SELECT * FROM perf_experiments WHERE decision = 'running' OR started_at >= ?1 OR decided_at >= ?1 ORDER BY id", [new Date(nowMs - 30 * 864e5).toISOString()]);
  f.ops = await perfOpsValues(env);
  return f;
}
// Hourly entry point: the KPIs every hour; experiments once per UTC day after PERF_AFTER_UTC_HOUR (opts.force runs both now).
async function performanceLoopTick(env, opts) {
  opts = opts || {};
  if (!env.AUDIT) return { ok: false, error: "no AUDIT binding" };
  var nowMs = opts.nowMs || Date.now(), nowIso = new Date(nowMs).toISOString(), day = perfDay(nowMs);
  await perfSchema(env);
  var met = await perfMetricsRefresh(env, nowMs);
  var out = { ok: true, ts: nowIso, metrics: met.written };
  if (!opts.force) {
    if (new Date(nowMs).getUTCHours() < PERF_AFTER_UTC_HOUR) { out.experiments = { skipped: "runs after " + PERF_AFTER_UTC_HOUR + ":00Z" }; return out; }
    if (await perfOne(env, "SELECT id FROM perf_runs WHERE kind = 'experiments' AND day = ?1 LIMIT 1", [day])) { out.experiments = { skipped: "already ran " + day }; return out; }
  }
  var f = await perfExperimentFacts(env, nowMs);
  // Unknown is never a decision: without the triggers, the history, the ledger or ops_config, nothing starts or ends and no
  // ledger row is written, so the watchmaker sees the evaluator stall.
  if (!f.triggers || !f.history || !f.experiments || !f.ops) { out.experiments = { error: "unreadable: " + ["triggers", "history", "experiments", "ops"].filter(function(k) { return !f[k]; }).join(", ") }; return out; }
  var plan = perfExperimentPlan(f, nowMs);
  var res = await perfExperimentsApply(env, plan, nowMs);
  var after = (await perfOpsValues(env)) || f.ops;
  for (var i = 0; i < PERF_LEVERS.length; i++) { try { await env.AUDIT.prepare("UPDATE perf_levers SET current = ?1, updated_at = ?2 WHERE key = ?3").bind(String(perfLeverValue(PERF_LEVERS[i], after)), nowIso, PERF_LEVERS[i].key).run(); } catch (e) {} }
  var rn = await perfOne(env, "SELECT COUNT(*) AS n FROM perf_experiments WHERE decision = 'running'");
  var xs = { enabled: plan.enabled, decided: res.decided, started: res.started, skipped: plan.skipped, running: rn ? Number(rn.n) : null };
  await env.AUDIT.prepare("INSERT INTO perf_runs (ts, day, kind, worker_version, enabled, started, decided, running, note, state_json) VALUES (?1, ?2, 'experiments', ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
    .bind(nowIso, day, VERSION, plan.enabled ? 1 : 0, res.started.length, res.decided.length, xs.running, ((plan.enabled ? "" : "kill switch on: no new experiments; ") + (res.decided.length ? "decided " + res.decided.join(", ") + "; " : "") + (res.started.length ? "started " + res.started.join(", ") : "nothing started")).slice(0, 500), JSON.stringify(xs).slice(0, 20000)).run();
  try { await env.AUDIT.prepare("DELETE FROM perf_runs WHERE id NOT IN (SELECT id FROM perf_runs ORDER BY id DESC LIMIT 800)").run(); } catch (e) {}
  out.experiments = xs;
  return out;
}
// GET /improvement 'experiments' section: the levers, the running and finished experiments and the last evaluator run.
async function perfExperimentsStatus(env) {
  var levers = await perfRows(env, "SELECT key, metric, ops_config_key, min, max, step, current, tier, direction, effect, default_value, owner_voice, eval_days, note FROM perf_levers ORDER BY key");
  var exps = await perfRows(env, "SELECT id, lever, metric, trigger_id, dir, from_value, to_value, started_at, baseline, baseline_sd, eval_after, observed, threshold, decision, decided_at, note FROM perf_experiments ORDER BY id DESC LIMIT 30");
  var last = await perfOne(env, "SELECT ts, day, worker_version, enabled, started, decided, running, note FROM perf_runs WHERE kind = 'experiments' ORDER BY id DESC LIMIT 1");
  var ops = await perfOpsValues(env);
  return {
    loop: "PERFORMANCE-LOOP-1", enabled: perfEnabled(ops || {}), kill_switch: "ops_config " + PERF_ENABLE_KEY + " (absent = on; '0', 'off', 'false', 'no' or 'disabled' stop new experiments; running ones are still decided)",
    rules: { driven_by: "an enabled analytics_metric_triggers row whose action names 'perf-lever:<key>' for that lever's metric, hit now and on " + PERF_BREACH_DAYS + " consecutive metric_history days", step: "one lever step in the direction that relieves the trigger, compare-and-swap on ops_config", keep_if: "the mean of the last " + PERF_EXP_WINDOW_D + " metric_history days after the window beats the baseline (mean of the 7 days up to the start) by more than max(" + PERF_EXP_NOISE_REL * 100 + "% of |baseline|, one baseline standard deviation)", otherwise: "revert (compare-and-swap; a knob changed by someone else is left alone: 'superseded')", per_metric: 1, per_lever: 1, max_fleet: PERF_EXP_MAX_FLEET, cooldown_days: PERF_EXP_COOLDOWN_D, rest_after_revert_days: PERF_REVERT_REST_D, grace_days: PERF_EXP_GRACE_D, strategy_caps: PERF_STRATEGY_CAPS, learns: "remedy_efficacy_30d counts kept as a remedy that worked and reverted as one that did not" },
    levers: levers || [], running: (exps || []).filter(function(e) { return e.decision === "running"; }), finished: (exps || []).filter(function(e) { return e.decision !== "running"; }), last_run: last
  };
}
// ---- PERFORMANCE-LOOP-1:END ----
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
    // OBJECTIVE-CONSTRAINTS-1 (goals 41, 43, 57): the delegated constraints, measured live; public read (OPEN-ACCESS-1).
    if (p === "/constraints" && request.method === "GET") {
      var ocf = await ocFacts(env);
      var ocl = await charterOne(env, "SELECT ts, worker_version, healthy, measured, findings, filed, closed, review FROM objective_constraint_runs ORDER BY id DESC LIMIT 1");
      return json({ ok: true, worker_version: VERSION, live: objectiveConstraintsEvaluate(ocf, Date.now()), limits_review_preview: objectiveLimitsReview(ocf, Date.now()), last_run: ocl });
    }
    // IMPROVEMENT-LOOP-1: metric trends (7d vs prior 7d), regressions, fix durability and the loop's own grade; public read.
    if (p === "/improvement" && request.method === "GET") {
      var ilf = await ilFacts(env);
      var ill = await charterOne(env, "SELECT ts, worker_version, snapshotted, evaluable, improved, flat, regressed, fixes_judged, fixes_held, findings, filed, closed FROM improvement_loop_runs ORDER BY id DESC LIMIT 1");
      var ilh = await charterOne(env, "SELECT COUNT(DISTINCT day) AS days, MIN(day) AS first_day, COUNT(DISTINCT metric) AS metrics FROM metric_history");
      // PERFORMANCE-LOOP-1: the levers and the running and finished experiments that act on the triggers' metrics.
      return json({ ok: true, worker_version: VERSION, history: ilh, live: improvementEvaluate(ilf, Date.now()), last_run: ill, experiments: await perfExperimentsStatus(env) });
    }
    if (p === "/improvement/experiments/tick" && request.method === "POST") {
      var pxh = request.headers.get("Authorization") || "";
      var pxt = pxh.indexOf("Bearer ") === 0 ? pxh.slice(7) : pxh;
      if (!(pxt && ((env.DEPLOY_ADMIN_TOKEN && pxt === env.DEPLOY_ADMIN_TOKEN) || (env.SELFHEAL_TOKEN && pxt === env.SELFHEAL_TOKEN)))) return json({ error: "unauthorized" }, 401);
      return json(await performanceLoopTick(env, { force: true }));
    }
    // REACH-IDEATION-1: the latest daily run of reach ideas (public read).
    if (p === "/reach-ideas" && request.method === "GET") {
      var rir = await charterOne(env, "SELECT ts, worker_version, probed, findings, filed, closed, state_json FROM reach_idea_runs ORDER BY id DESC LIMIT 1");
      var rio = await charterRows(env, "SELECT id, title, priority, created_at FROM agent_issues WHERE status = 'open' AND title LIKE 'REACH-IDEA-1:%' ORDER BY id");
      // REACH-IDEATION-2: the outcome ledger (metric at filing, at close, 7 days later) and the learned per-check efficacy.
      var rioc = await charterRows(env, "SELECT issue_id, check_key, surface, metric, buildable, score, value_at_file, filed_at, closed_at, value_at_close, value_7d FROM reach_idea_outcomes ORDER BY issue_id DESC LIMIT 50");
      return json({ ok: true, worker_version: VERSION, last_run: rir, open_ideas: rio, outcomes: rioc, efficacy: ideaEfficacy(rioc), limits: { max_new_per_day: IDEA_MAX_NEW, wip_max_buildable: IDEA_WIP_MAX, gap_max_not_buildable: IDEA_GAP_MAX, discover_max: IDEA_DISCOVER_MAX, discover_days: IDEA_DISCOVER_DAYS } });
    }
    if (p === "/reach-ideas/tick" && request.method === "POST") {
      var riah = request.headers.get("Authorization") || "";
      var riat = riah.indexOf("Bearer ") === 0 ? riah.slice(7) : riah;
      if (!(riat && ((env.DEPLOY_ADMIN_TOKEN && riat === env.DEPLOY_ADMIN_TOKEN) || (env.SELFHEAL_TOKEN && riat === env.SELFHEAL_TOKEN)))) return json({ error: "unauthorized" }, 401);
      return json(await reachIdeationTick(env, true));
    }
    if (p === "/improvement/tick" && request.method === "POST") {
      var ilah = request.headers.get("Authorization") || "";
      var ilat = ilah.indexOf("Bearer ") === 0 ? ilah.slice(7) : ilah;
      if (!(ilat && ((env.DEPLOY_ADMIN_TOKEN && ilat === env.DEPLOY_ADMIN_TOKEN) || (env.SELFHEAL_TOKEN && ilat === env.SELFHEAL_TOKEN)))) return json({ error: "unauthorized" }, 401);
      return json(await improvementLoopTick(env));
    }
    if (p === "/constraints/tick" && request.method === "POST") {
      var och = request.headers.get("Authorization") || "";
      var oct = och.indexOf("Bearer ") === 0 ? och.slice(7) : och;
      if (!(oct && ((env.DEPLOY_ADMIN_TOKEN && oct === env.DEPLOY_ADMIN_TOKEN) || (env.SELFHEAL_TOKEN && oct === env.SELFHEAL_TOKEN)))) return json({ error: "unauthorized" }, 401);
      return json(await objectiveConstraintsTick(env));
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
    // CODE-TASK-MERGE-RUNNER-1: GET is public (OPEN-ACCESS-1: the runner's switch, gates and recent decisions); a tick is
    // admin-gated like /evolve/tick, because it merges.
    if (p === "/code-merge/status" && request.method === "GET") {
      var cmc = await cmConfig(env);
      try { await cmSchema(env); } catch (e) {}
      var cmr = await env.AUDIT.prepare("SELECT id, path, status, merge_state, merged_by, pr_url, pr_opened_by, green_since, nochecks_since, version_to, merge_note, last_error, updated_at FROM code_tasks ORDER BY updated_at DESC LIMIT 20").all().catch(function() { return { results: [] }; });
      var cmh = await env.AUDIT.prepare("SELECT id, ts, status, text FROM cloud_ops_events WHERE id >= 'code-merge-tick-' AND id < 'code-merge-tick.' ORDER BY ts DESC LIMIT 1").first().catch(function() { return null; });
      var cmf = await env.AUDIT.prepare("SELECT ts FROM cloud_ops_events WHERE id = 'code-merge-first-ok'").first().catch(function() { return null; });
      return json({ ok: true, version: VERSION, loop: "CODE-TASK-MERGE-RUNNER-1", enabled: cmc.enabled, switch: "ops_config code_merge_runner_enabled = " + cmc.raw, trusted_sources: cmc.trusted, deny: CM_DENY, max_merges_per_tick: cmc.maxMerges, checks_wait_hours: CM_CHECKS_WAIT_H, deploy_wait_hours: CM_DEPLOY_WAIT_H, first_ok_tick: cmf ? cmf.ts : null, last_tick: cmh, tasks: cmr.results || [] });
    }
    if (p === "/code-merge/tick" && request.method === "POST") {
      var cah2 = request.headers.get("Authorization") || "";
      var cat2 = cah2.indexOf("Bearer ") === 0 ? cah2.slice(7) : cah2;
      if (!(cat2 && ((env.DEPLOY_ADMIN_TOKEN && cat2 === env.DEPLOY_ADMIN_TOKEN) || (env.SELFHEAL_TOKEN && cat2 === env.SELFHEAL_TOKEN)))) return json({ error: "unauthorized" }, 401);
      return json(await codeMergeTick(env));
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
    ctx.waitUntil(evolveTickHeartbeat(env).catch((e) => console.error("evolveTick error:", e && e.message || e)));
    ctx.waitUntil(codeMergeTick(env).catch((e) => console.error("codeMergeTick error:", e && e.message || e)));
    ctx.waitUntil(slaEscalate(env).catch((e) => console.error("slaEscalate error:", e && e.message || e)));
    ctx.waitUntil(evaluateMetricTriggers(env).catch((e) => console.error("evaluateMetricTriggers error:", e && e.message || e)));
    ctx.waitUntil(publicationPreflight(env).catch((e) => console.error("publicationPreflight error:", e && e.message || e)));
    ctx.waitUntil(workerCensusIfStale(env).catch((e) => console.error("workerCensus error:", e && e.message || e)));
    ctx.waitUntil(usageSnapshotIfStale(env).catch((e) => console.error("usageSnapshot error:", e && e.message || e)));
    ctx.waitUntil(opsAgentWatchMetrics(env).catch((e) => console.error("opsAgentWatch error:", e && e.message || e)));
    ctx.waitUntil(aiAttributionCoverage(env).catch((e) => console.error("aiAttributionCoverage error:", e && e.message || e)));
    ctx.waitUntil(portfolioSyncIfStale(env).catch((e) => console.error("portfolioSync error:", e && e.message || e)));
    ctx.waitUntil(loopWatch(env).catch((e) => console.error("loopWatch error:", e && e.message || e)));
    ctx.waitUntil(objectiveConstraintsTick(env).catch((e) => console.error("objectiveConstraintsTick error:", e && e.message || e)));
    ctx.waitUntil(remediationContractsTick(env).catch((e) => console.error("remediationContractsTick error:", e && e.message || e)));
    ctx.waitUntil(improvementLoopTick(env).catch((e) => console.error("improvementLoopTick error:", e && e.message || e)));
    ctx.waitUntil(reachIdeationTick(env, false).catch((e) => console.error("reachIdeationTick error:", e && e.message || e)));
    // PERFORMANCE-LOOP-1: five KPIs hourly; lever experiments driven by hit triggers once per UTC day after 09:00Z.
    ctx.waitUntil(performanceLoopTick(env).catch((e) => console.error("performanceLoopTick error:", e && e.message || e)));
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
// ---- ACT-BRIDGE-1:BEGIN (2026-10-02, pillar autonomy; owner directive: "filing an issue is not fixing it") ----
// A metric trigger's remedy reaches the code loop only through an agent_issue whose description carries a line of its own
//   code-task: repo=<repo> path=<file>        (and optionally)   code-anchor: <verbatim text near the edit>
// (qnfo-code-orchestrator ISSUE-INTAKE-1 matches that line anchored at the start of a line). evaluateMetricTriggers used to
// file one line, "METRIC-TRIGGER #id ... -> <action sliced to 300 chars> (owner, target)", so a code-task line written into
// analytics_metric_triggers.action could never be picked up: it was inlined after a prefix and usually cut off. Measured
// 2026-10-02: 0 of 37 enabled triggers carried one, and the code loop had run 3 tasks in its life, all smoke tests.
// This keeps the one-line summary (prose only, without the markers) and appends the marker lines verbatim.
var ACT_BRIDGE_MARK = /^[ \t]*(code-task:[ \t]*repo=[A-Za-z0-9._-]{1,100}[ \t]+path=\S{1,300}|code-anchor:[ \t]*.{1,300}?)[ \t]*$/gm;
function triggerIssueDescription(summaryHead, action, summaryTail) {
  var a = String(action || "");
  var marks = a.match(ACT_BRIDGE_MARK) || [];
  var prose = a.replace(ACT_BRIDGE_MARK, " ").replace(/\s+/g, " ").trim();
  var task = marks.filter(function (l) { return /code-task:/.test(l); }).slice(0, 1).map(function (l) { return l.trim(); });
  var anchor = task.length ? marks.filter(function (l) { return /code-anchor:/.test(l); }).slice(0, 1).map(function (l) { return l.trim(); }) : [];
  return summaryHead + prose.slice(0, 300) + summaryTail + (task.length ? "\n" + task.concat(anchor).join("\n") : "");
}
// TRIGGER-DISPATCH-1 (2026-10-02): analytics_metric_triggers.priority is an integer 1..9 on 44 of 50 agent_issues
// triggers, and agent_issues accepts only priority_canon values (agent_issues_enum_guard_ins). String(7) was refused with
// SQLITE_CONSTRAINT_TRIGGER, so 11 breaches were logged dispatch-failed and no issue was filed. Map to the canon here.
function triggerIssuePriority(p) {
  var s = String(p == null ? "" : p).trim().toLowerCase();
  if (s === "critical" || s === "high" || s === "medium" || s === "low") return s;
  var n = Number(s);
  if (s === "" || !isFinite(n)) return "medium";
  return n >= 9 ? "critical" : n >= 7 ? "high" : n >= 5 ? "medium" : "low";
}
// ---- ACT-BRIDGE-1:END ----
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
    var recent = await db.prepare("SELECT id FROM analytics_action_log WHERE trigger_id = ?1 AND fired_at > datetime('now', ?2) AND status <> 'dispatch-failed' LIMIT 1").bind(t.id, "-" + cd + " hours").first().catch(function () { return null; });
    if (recent) continue;
    var target = String(t.queue_target || "none");
    var summary = triggerIssueDescription("METRIC-TRIGGER #" + t.id + " " + t.metric_key + "=" + v + " " + op + " " + thr + " -> ", t.action, " (owner " + (t.owner || "-") + ", target " + target + ")");
    var status = "dispatched", note = null;
    try {
      if (target === "agent_issues") {
        var title = "METRIC-TRIGGER-" + t.id + "-" + String(t.metric_key).toUpperCase().replace(/[^A-Z0-9]+/g, "-") + ": " + String(t.title || t.action || "").slice(0, 80);
        var open = await db.prepare("SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open' LIMIT 1").bind(title).first().catch(function () { return null; });
        if (open) { status = "deduped"; note = "open issue " + open.id; }
        else {
          var nowMs = Date.now();
          await db.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, 'qnfo-fleet-control', 'reliability', ?3, 'open', ?4, ?4)").bind(title, summary, triggerIssuePriority(t.priority), nowMs).run();
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
// ---- TRIGGER-PARSE-1:BEGIN (pure; replayed by trigger-parse.test.mjs)
// TRIGGER-PARSE-1 (2026-10-02): the value a trigger is judged on. The old reader stripped characters with the class
// [^0-9.+-eE], in which "+-e" is a RANGE (0x2B to 0x65) that keeps every capital letter and most punctuation and drops
// spaces, so "12 of 20" read as 1220 and "3 (of 7 works)" as 37. A value is a number only when the whole string is one:
// an optional sign, digits, an optional decimal part and an optional trailing % ("+348.89%" is 348.89). Anything else
// ("n/a", a sentence, a date) is unreadable, the same verdict v_metric_trigger_state gives
// (migrations/2026-10-02-trigger-parse.sql), so the evaluator and the judge cannot disagree.
function triggerNum(x) {
  if (x === null || x === void 0) return null;
  if (typeof x === "number") return isFinite(x) ? x : null;
  var m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*%?\s*$/.exec(String(x));
  if (!m) return null;
  var n = Number(m[1]);
  return isFinite(n) ? n : null;
}
// ---- TRIGGER-PARSE-1:END
async function metricTriggerValue(db, t) {
  var key = String(t.metric_key || ""), src = String(t.source_table || "meta");
  var num = function (r, f) { return r ? triggerNum(r[f]) : null; };
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