// qnfo-fleet-advisor v0.2.1 - canonical autonomous Cloudflare fleet advisor.
// 100% server-side, 100% autonomous. Cron */20 + token-gated POST /run-audit.
// v0.2.1: multi-host probe (q08 + qnfo.org), concurrent; no false WORKER-DOWN.
const VERSION = "0.2.2";
const WORKER = "qnfo-fleet-advisor";

const nowIso = () => new Date().toISOString();

async function probeHealth(name) {
  const hosts = [name + ".q08.workers.dev", name + ".qnfo.org"];
  const tried = [];
  for (const h of hosts) {
    try {
      const r = await fetch("https://" + h + "/health", {
        headers: { "User-Agent": "Mozilla/5.0 (qnfo-fleet-advisor)" },
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) { let v = null; try { const j = await r.json(); v = j.version || j.VERSION || null; } catch (e) {} return { ok: true, via: h, version: v }; }
      tried.push(h + ":" + r.status);
    } catch (e) { tried.push(h + ":err"); }
  }
  return { ok: false, detail: tried.join(" ") };
}

async function d1All(env, sql, params) {
  const st = env.AUDIT_DB.prepare(sql);
  const x = await (params ? st.bind(...params).all() : st.all());
  return x && x.results ? x.results : [];
}
async function d1Run(env, sql, params) {
  const st = env.AUDIT_DB.prepare(sql);
  return await (params ? st.bind(...params).run() : st.run());
}

async function gatewayConfigAudit(env) {
  if (!env.CF_API_TOKEN) return { skipped: true, reason: "CF_API_TOKEN secret not set" };
  try {
    const url = "https://api.cloudflare.com/client/v4/accounts/" + env.CF_ACCOUNT_ID + "/ai-gateway/gateways";
    const resp = await fetch(url, { headers: { Authorization: "Bearer " + env.CF_API_TOKEN }, signal: AbortSignal.timeout(8000) });
    const j = await resp.json();
    const list = (j && j.result) || [];
    const drift = [];
    for (const g of list) {
      if (g.collect_logs !== true) drift.push(g.id + ":collect_logs!=true");
      if (g.authentication !== true) drift.push(g.id + ":authentication!=true");
      const sl = g.spend_limits;
      if (!sl || sl.enabled !== true) drift.push(g.id + ":spend_limits disabled");
      if (g.retry_max_attempts !== undefined && g.retry_max_attempts < 2) drift.push(g.id + ":retries<2");
    }
    return { skipped: false, gateways: list.map((g) => ({ id: g.id, cache_ttl: g.cache_ttl, collect_logs: g.collect_logs, retries: g.retry_max_attempts })), drift };
  } catch (e) { return { skipped: true, reason: String((e && e.message) || e).slice(0, 160) }; }
}

async function runAudit(env) {
  const ts = nowIso();
  const findings = [];
  const PROBES = (env.PROBE_WORKERS || "qnfo-ai,qnfo-ops,qnfo-kaizen,qnfo-cloud-ops,qnfo-infra,qnfo-auditor").split(",").map((s) => s.trim()).filter(Boolean);

  // 1. Worker health probes - ADVISORY ONLY (SVC-BINDING-1, v0.2.2): from inside the
  // Worker sandbox, same-account *.q08.workers.dev / *.qnfo.org fetches return 404/530 even
  // when the worker is healthy (verified 2026-09-08: external probe = 200, sandbox probe = 404).
  // Therefore probe results are recorded but NEVER file WORKER-DOWN issues; the actionable
  // health signal comes from the D1 ai_gateway_failures / ai_model_health legs below.
  const results = await Promise.all(PROBES.map((n) => probeHealth(n)));
  const down = [];
  for (let i = 0; i < PROBES.length; i++) if (!results[i].ok) down.push(PROBES[i] + "(" + (results[i].detail || "") + ")");

  // 2. AI Gateway failure rollup (24h)
  try {
    const rows = await d1All(env, "SELECT model, error_class, SUM(count) AS n FROM ai_gateway_failures WHERE ts >= ((strftime('%s','now') - 86400) * 1000) GROUP BY model, error_class ORDER BY n DESC LIMIT 8");
    for (const row of rows) {
      if (!row || !row.model) continue;
      const n = row.n || 0;
      const cls = String(row.error_class || "fail").toLowerCase();
      if (cls.indexOf("5") === 0 && n >= 200) findings.push({ kind: "ai-gateway", severity: "high", title: "GW 5xx " + row.model + " x" + n + "/24h", detail: row.model + " failing " + n + "x/24h class=" + row.error_class });
      else if ((cls.indexOf("4") === 0 || cls.indexOf("429") >= 0 || cls.indexOf("timeout") >= 0) && n >= 400) findings.push({ kind: "ai-gateway", severity: n >= 2000 ? "high" : "medium", title: "GW " + (row.error_class || "4xx") + " " + row.model + " x" + n + "/24h", detail: row.model + " returning " + row.error_class + " " + n + "x/24h" });
    }
  } catch (e) {}

  // 3. Degraded models
  try {
    const deg = await d1All(env, "SELECT model_id FROM ai_model_health WHERE status = 'degraded'");
    if (deg && deg.length) findings.push({ kind: "model-health", severity: "medium", title: "MODEL-DEGRADED " + deg.map((d) => d.model_id).slice(0, 4).join(","), detail: "degraded: " + deg.map((d) => d.model_id).join(",") });
  } catch (e) {}

  // 4. Backlog pressure
  try {
    const open = await d1All(env, "SELECT COUNT(*) AS n FROM agent_issues WHERE status='open'");
    const n = open && open[0] ? open[0].n : 0;
    if (n > 8) findings.push({ kind: "backlog", severity: "low", title: "OPEN-ISSUES " + n, detail: n + " open agent_issues" });
  } catch (e) {}

  // 5. Gateway config drift (advisory)
  const gw = await gatewayConfigAudit(env);
  if (!gw.skipped && gw.drift && gw.drift.length) findings.push({ kind: "gateway-config", severity: "medium", title: "GATEWAY-DRIFT " + gw.drift.slice(0, 3).join(";"), detail: "drift: " + gw.drift.join(";") });

  // 6. Synthesize advice
  let suggestion = null;
  const model = env.ADVISOR_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  if (findings.length && env.AI) {
    try {
      const prompt = "You are the QNFO fleet advisor (adversarial, evidence-based). Audit findings:\n" +
        findings.map((f) => "- [" + f.severity + "] " + f.title).join("\n") +
        "\nPropose ONE concrete, falsifiable improvement action (owner + priority). Max 120 words, no preamble.";
      const r = await env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: 350, temperature: 0.3 });
      const content = (r && r.response) || (r && r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content);
      suggestion = String(content || "").trim().slice(0, 800) || null;
    } catch (e) { suggestion = null; }
  }

  // 7. File deduped advisory issues
  let filed = 0;
  for (const f of findings) {
    try {
      const existing = await d1All(env, "SELECT id FROM agent_issues WHERE status='open' AND title = ?", [f.title]);
      if (existing && existing.length) continue;
      await d1Run(env, "INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
        [f.title.slice(0, 240), "[advisor] " + f.detail.slice(0, 600), WORKER, f.kind, f.severity, "open", ts, ts]);
      filed++;
    } catch (e) {}
  }

  // 8. Audit event log
  const state = { up: PROBES.length - down.length, down: down.length, findings: findings.length, filed, suggestion, gateway_drift: gw.skipped ? null : gw.drift, ts };
  try {
    await d1Run(env, "INSERT INTO cloud_ops_events (id, ts, kind, text, job, status) VALUES (?,?,?,?,?,?)",
      ["adv-" + Date.now().toString(36), ts, "advisor-audit", JSON.stringify(state).slice(0, 1800), WORKER, "ok"]);
  } catch (e) {}

  return { ok: true, worker: WORKER, version: VERSION, ts, probed: PROBES.length, up: PROBES.length - down.length, down: down.length, findings: findings.length, filed, suggestion: suggestion ? suggestion.slice(0, 400) : null };
}

export class FleetAdvisor {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/run-audit" && request.method === "POST") {
      const auth = request.headers.get("x-advisor-token");
      if (auth !== this.env.ADVISOR_TOKEN) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
      return Response.json(await runAudit(this.env));
    }
    return new Response(JSON.stringify({ worker: WORKER, version: VERSION, hint: "POST /run-audit (x-advisor-token) or scheduled cron" }), { status: 200 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, worker: WORKER, version: VERSION, model: env.ADVISOR_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast", bindings: { d1: !!env.AUDIT_DB, ai: !!env.AI, do: !!env.FleetAdvisor }, crons: ["*/20 * * * *"] });
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
    const id = env.FleetAdvisor.newUniqueId("fleet-advisor");
    const agent = env.FleetAdvisor.get(id);
    ctx.waitUntil(agent.fetch(new Request("https://internal/run-audit", { method: "POST", headers: { "x-advisor-token": env.ADVISOR_TOKEN || "" } })));
  },
};
