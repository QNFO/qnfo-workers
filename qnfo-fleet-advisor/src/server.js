// qnfo-fleet-advisor v0.3.3 - canonical autonomous Cloudflare fleet advisor.
// 100% server-side, 100% autonomous. Cron */20 + token-gated POST /run-audit.
// v0.3.0: ENSEMBLE advice (primary llama proposes + gpt-oss-120b adversarially reviews
// IMPROVE/ACCEPT -> consensus suggestion); gateway drift fixed to real fields only
// (never reads nonexistent spend_limits); probe leg advisory-only (SVC-BINDING-1).
// v0.3.1: MULTI-ITERATION (reviewer IMPROVE feeds back up to N rounds until ACCEPT)
// + FEEDBACK-LOOP (prior-cycle open advisor issues injected into every proposal prompt).
// v0.3.2: cron runs runAudit DIRECTLY (was token-gated DO path that 401'd silently -
//   the DO env did not reliably see ADVISOR_TOKEN, so no advisor-audit events landed
//   after 12:15 despite an armed */20 cron). Token gate remains only on POST /run-audit.
// v0.3.3 FLOOD-FIX-1 (2026-09-09): backlog finding titled "OPEN-ISSUES <n>" embedded the
//   live count, so step-7 open-title dedupe never matched -> a new ticket every */20 cron
//   (~42 tickets in 21h, ALERT-STORM-DETECTED #522). Fix: stable title + refresh-in-place,
//   count excludes OPEN-ISSUES* self-tickets, legacy spam auto-closed on first v0.3.3 run.
const VERSION = "0.3.3";
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
      // v0.3.0: only real fields present on the gateway object - the gateway-list API
      // response NEVER includes spend_limits (verified live 2026-09-08), so reading it
      // always fired a false GATEWAY-DRIFT. Spend-guard state is checked separately
      // via the billing/spending-limit endpoint (see spendGuardAudit).
      if (g.collect_logs !== true) drift.push(g.id + ":collect_logs!=true");
      if (g.authentication !== true) drift.push(g.id + ":authentication!=true");
      if (g.retry_max_attempts !== undefined && g.retry_max_attempts < 2) drift.push(g.id + ":retries<2");
    }
    return { skipped: false, gateways: list.map((g) => ({ id: g.id, cache_ttl: g.cache_ttl, collect_logs: g.collect_logs, retries: g.retry_max_attempts })), drift };
  } catch (e) { return { skipped: true, reason: String((e && e.message) || e).slice(0, 160) }; }
}

async function spendGuardAudit(env) {
  // v0.3.0: truthfully read the live spend-guard state (billing/spending-limit endpoint).
  // The gateway-list API never returns spend_limits (false-drift source fixed in v0.3.0).
  if (!env.CF_API_TOKEN) return { skipped: true, reason: "no CF_API_TOKEN" };
  try {
    const url = "https://api.cloudflare.com/client/v4/accounts/" + env.CF_ACCOUNT_ID + "/ai-gateway/billing/spending-limit";
    const resp = await fetch(url, { headers: { Authorization: "Bearer " + env.CF_API_TOKEN }, signal: AbortSignal.timeout(8000) });
    const j = await resp.json();
    const r = (j && j.result) || {};
    const enabled = r.enabled === true;
    const amt = (r.config && r.config.amount) || 0;
    return { skipped: false, enabled, amount: amt, detail: "enabled=" + enabled + " amount=" + amt + " " + ((r.config && r.config.duration) || "") + " " + ((r.config && r.config.strategy) || "") };
  } catch (e) { return { skipped: true, reason: String((e && e.message) || e).slice(0, 160) }; }
}

// v0.3.1 MULTI-ITERATION cap (tunable via ADVISOR_ITERS, max 5).
const MAX_ADVISOR_ITERS = 3;

// FEEDBACK-LOOP (v0.3.1): read the advisor's OWN prior-cycle state (last advisor-audit
// cloud_ops_event) + still-open advisory issues, so every cycle re-examines what it already
// filed (persistent signal -> the reviewer sees it flagged and proposes escalation/fix,
// never a blind re-file of the same title).
async function collectFeedback(env) {
  const fb = { prior_findings: 0, prior_filed: 0, prior_suggestion: "", open_advisor_issues: [] };
  try {
    const last = await d1All(env, "SELECT text FROM cloud_ops_events WHERE kind='advisor-audit' AND job=? ORDER BY ts DESC LIMIT 1", [WORKER]);
    if (last && last[0] && last[0].text) {
      try { const st = JSON.parse(last[0].text); fb.prior_findings = st.findings || 0; fb.prior_filed = st.filed || 0; fb.prior_suggestion = st.suggestion || ""; } catch (e) {}
    }
  } catch (e) {}
  try {
    const open = await d1All(env, "SELECT title FROM agent_issues WHERE source=? AND status='open' ORDER BY updated_at DESC LIMIT 6", [WORKER]);
    fb.open_advisor_issues = (open || []).map((o) => o.title);
  } catch (e) {}
  return fb;
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

  // 4. Backlog pressure (v0.3.3 FLOOD-FIX-1): exclude this worker's own OPEN-ISSUES*
  // tickets from the count (they self-inflated it -> n stayed >8 forever -> re-file every
  // */20 cron) and use a STABLE title so step-7 open-title dedupe actually matches; the
  // single ticket is refreshed in place (step 7), never re-filed.
  try {
    const open = await d1All(env, "SELECT COUNT(*) AS n FROM agent_issues WHERE status='open' AND title NOT LIKE 'OPEN-ISSUES%'");
    const n = open && open[0] ? open[0].n : 0;
    if (n > 8) findings.push({ kind: "backlog", severity: "low", title: "OPEN-ISSUES-BACKLOG", detail: n + " open agent_issues (excluding advisor OPEN-ISSUES tickets)" });
  } catch (e) {}

  // 4b. v0.3.3 FLOOD-FIX-1 cleanup: close the legacy per-run spam tickets ("OPEN-ISSUES <n>",
  // one filed per cron run 09-08..09-09) superseded by the single refreshable
  // OPEN-ISSUES-BACKLOG ticket. Runs every cycle; idempotent.
  try {
    await d1Run(env, "UPDATE agent_issues SET status='closed', updated_at=? WHERE status='open' AND source=? AND category='backlog' AND title LIKE 'OPEN-ISSUES %'", [ts, WORKER]);
  } catch (e) {}

  // 5. Gateway config drift (advisory)
  const gw = await gatewayConfigAudit(env);
  if (!gw.skipped && gw.drift && gw.drift.length) findings.push({ kind: "gateway-config", severity: "medium", title: "GATEWAY-DRIFT " + gw.drift.slice(0, 3).join(";"), detail: "drift: " + gw.drift.join(";") });

  // 5b. Spend-guard truth (advisory-only; does not file - tracked as issue #540 owner qnfo-ops)
  const sg = await spendGuardAudit(env);
  let spend_guard = null;
  if (!sg.skipped) spend_guard = sg.detail;

  // 6. ENSEMBLE + MULTI-ITERATION + FEEDBACK-LOOP advice (v0.3.1): primary proposes,
  //    reviewer adversarially audits each round (ACCEPT or IMPROVE); an IMPROVE verdict
  //    feeds the improved text back as the next proposal up to MAX_ADVISOR_ITERS rounds.
  //    Prior-cycle open advisor issues (FEEDBACK-LOOP) are injected into the proposal prompt.
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
      const rp = await env.AI.run(modelP, { messages: [{ role: "user", content: prompt }], max_tokens: 350, temperature: 0.3 });
      const cp = (rp && rp.response) || (rp && rp.choices && rp.choices[0] && rp.choices[0].message && rp.choices[0].message.content);
      let proposal = String(cp || "").trim().slice(0, 800);
      let verdict = "";
      let rounds = 0;
      if (proposal) {
        // MULTI-ITERATION: reviewer ACCEPT ends the loop; IMPROVE becomes the next proposal.
        for (let i = 0; i < iters; i++) {
          rounds = i + 1;
          const rv = await env.AI.run(modelR, { messages: [{ role: "user", content: "Review this advisor action. If specific, falsifiable, high-value -> reply ACCEPT. Else reply IMPROVE then the improved action (owner + priority), max 120 words." + NL + "Proposal: " + proposal }], max_tokens: 350, temperature: 0.2 });
          const cv = (rv && rv.response) || (rv && rv.choices && rv.choices[0] && rv.choices[0].message && rv.choices[0].message.content);
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
    } catch (e) { suggestion = null; ensemble = null; }
  }

  // 7. File deduped advisory issues (v0.3.3: dedupe hit -> refresh in place, not skip,
  //    so a stale open ticket's detail/updated_at stays current).
  let filed = 0;
  for (const f of findings) {
    try {
      const existing = await d1All(env, "SELECT id FROM agent_issues WHERE status='open' AND title = ?", [f.title]);
      if (existing && existing.length) {
        await d1Run(env, "UPDATE agent_issues SET description=?, updated_at=? WHERE id=?", ["[advisor] " + f.detail.slice(0, 600), ts, existing[0].id]);
        continue;
      }
      await d1Run(env, "INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
        [f.title.slice(0, 240), "[advisor] " + f.detail.slice(0, 600), WORKER, f.kind, f.severity, "open", ts, ts]);
      filed++;
    } catch (e) {}
  }

  // 8. Audit event log
  const state = { up: PROBES.length - down.length, down: down.length, findings: findings.length, filed, suggestion, gateway_drift: gw.skipped ? null : gw.drift, spend_guard, ensemble, ts };
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
    // v0.3.2: internal cron runs the audit directly - no token gate, no DO hop.
    ctx.waitUntil(runAudit(env));
  },
};
