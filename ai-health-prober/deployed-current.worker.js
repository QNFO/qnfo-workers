var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var WORKER = "ai-health-prober";
var VERSION = "2.3.1";
var MODELS = [{ "internal": "@cf/qwen/qwen3.8-27b", "id": "@cf/qwen/qwen3.8-27b", "kind": "text" }, { "internal": "bge-base-en-v1.5", "id": "@cf/baai/bge-base-en-v1.5", "kind": "embed" }, { "internal": "deepseek-v4-pro", "id": "@cf/deepseek-ai/deepseek-v4-pro-0813", "kind": "text" }, { "internal": "deepseek-v4-flash-wa", "id": "@cf/deepseek-ai/deepseek-v4-flash-0731", "kind": "text" }, { "internal": "deepseek-v4-pro-wa", "id": "@cf/deepseek-ai/deepseek-v4-pro-0813", "kind": "text" }, { "internal": "glm-5.3-flash", "id": "@cf/zai-org/glm-5.3-flash", "kind": "text" }, { "internal": "kimi-k2.6", "id": "@cf/zai-org/glm-5.3", "kind": "text" }, { "internal": "glm-5.3", "id": "@cf/zai-org/glm-5.3", "kind": "text" }, { "internal": "glm-5.3-flash", "id": "@cf/zai-org/glm-5.3-flash", "kind": "text" }, { "internal": "gpt-oss-120b", "id": "@cf/openai/gpt-oss-120b", "kind": "text" }, { "internal": "kimi-k2.6", "id": "@cf/moonshotai/kimi-k2.6", "kind": "text" }, { "internal": "kimi-k2.7-code", "id": "@cf/moonshotai/kimi-k2.7-code", "kind": "text" }, { "internal": "glm-5.3-flash", "id": "@cf/zai-org/glm-5.3-flash", "kind": "text" }, { "internal": "kimi-k2.7-code", "id": "@cf/moonshotai/kimi-k2.7-code", "kind": "text" }, { "internal": "glm-5.3", "id": "@cf/zai-org/glm-5.3", "kind": "text" }];
var SIGNALS = [["cal_loop", "fleet_cal_state", "updated_at", 24, "heartbeat"], ["kaizen", "kaizen_candidates", "created_at", 48, "heartbeat"], ["evolve", "evolve_candidates", "ts", 72, "heartbeat"], ["pipeline_status", "pipeline_status", "last_updated", 24, "event"], ["amh_models", "ai_model_health", "updated_at", 26, "heartbeat"], ["heartbeat", "fleet_heartbeat", "ts", 6, "heartbeat"], ["cloud_ops", "cloud_ops_events", "ts", 24, "heartbeat"], ["fleet_runs", "fleet_runs", "started_at", 24, "heartbeat"], ["research_queue", "research_queue", "created_at", 72, "heartbeat"], ["version_queue", "version_queue", "created_at", 72, "heartbeat"], ["paper_revision", "paper_revision_log", "created_at", 96, "heartbeat"], ["agent_issues", "agent_issues", "updated_at", 96, "heartbeat"], ["self_heal", "self_heal_actions", "ts", 48, "event"], ["outreach", "outreach_log", "sent_at", 72, "event"]];
function json(o, s) {
  return new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } });
}
__name(json, "json");
async function probeOne(env, m) {
  const bodies = m.kind === "embed" ? [{ text: ["ping"] }] : [{ prompt: "ping", max_tokens: 8 }, { messages: [{ role: "user", content: "ping" }], max_tokens: 8 }];
  let lastErr = null;
  for (let i = 0; i < bodies.length; i++) {
    try {
      const t0 = Date.now();
      await env.AI.run(m.id, bodies[i]);
      return { ok: true, ms: Date.now() - t0 };
    } catch (e) {
      lastErr = String(e && e.message || e).slice(0, 120);
    }
  }
  return { ok: false, err: lastErr };
}
__name(probeOne, "probeOne");
function toMs(m) {
  if (m == null) return null;
  if (typeof m === "number") return m > 1e12 ? m : m * 1e3;
  var s = String(m).trim();
  if (/^[0-9]+$/.test(s)) {
    var n = Number(s);
    return n > 1e12 ? n : n * 1e3;
  }
  var iso = s.replace(" ", "T");
  if (!/[Zz]|[+-][0-9][0-9]/.test(iso)) iso = iso + "Z";
  var t = Date.parse(iso);
  return isNaN(t) ? null : t;
}
__name(toMs, "toMs");
async function runProbe(env) {
  const now = Date.now();
  const results = [];
  for (let i = 0; i < MODELS.length; i++) {
    const m = MODELS[i];
    const r = await probeOne(env, m);
    const mid = m.internal || m.id;
    results.push({ model: mid, ok: r.ok, ms: r.ms || null });
    if (env.QNFO_AUDIT) {
      try {
        if (r.ok) {
          await env.QNFO_AUDIT.prepare("UPDATE ai_model_health SET status=?5, last_probe_ts=?2, last_latency_ms=?3, consecutive_failures=0, updated_at=?4 WHERE model_id=?1").bind(mid, now, r.ms || null, new Date(now).toISOString(), "ok").run();
        } else {
          await env.QNFO_AUDIT.prepare("UPDATE ai_model_health SET status=CASE WHEN consecutive_failures >= 2 THEN ?6 ELSE ?5 END, last_probe_ts=?2, consecutive_failures=COALESCE(consecutive_failures,0)+1, updated_at=?4 WHERE model_id=?1").bind(mid, now, null, new Date(now).toISOString(), "degraded", "failing").run();
        }
      } catch (e) {
      }
    }
  }
  let up = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].ok) up++;
  }
  return { probed: results.length, up, down: results.length - up };
}
__name(runProbe, "runProbe");
async function checkFreshness(env) {
  const now = Date.now();
  const out = [];
  for (let i = 0; i < SIGNALS.length; i++) {
    const s = SIGNALS[i];
    const mode = s[4] || "heartbeat";
    let maxTs = null, ageH = null, status = "unknown";
    try {
      const row = await env.QNFO_AUDIT.prepare("SELECT MAX(" + s[2] + ") AS m FROM " + s[1]).first();
      maxTs = row ? row.m : null;
      const ms = toMs(maxTs);
      if (ms != null) {
        ageH = Math.round((now - ms) / 36e4) / 10;
        if (ageH > s[3]) status = mode === "event" ? "idle" : "stale";
        else status = "fresh";
      } else {
        status = "no-data";
      }
    } catch (e) {
      status = "error";
    }
    out.push({ name: s[0], table: s[1], ts: s[2], mode, max_ts: maxTs == null ? null : String(maxTs), age_hours: ageH, threshold_hours: s[3], status });
    try {
      await env.QNFO_AUDIT.prepare("INSERT INTO freshness_guard (signal, table_name, ts_column, max_ts, age_hours, threshold_hours, status, mode, checked_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?9,?8) ON CONFLICT(signal) DO UPDATE SET table_name=?2, ts_column=?3, max_ts=?4, age_hours=?5, threshold_hours=?6, status=?7, mode=?9, checked_at=?8").bind(s[0], s[1], s[2], maxTs == null ? null : String(maxTs), ageH, s[3], status, new Date(now).toISOString(), mode).run();
    } catch (e) {
    }
  }
  return out;
}
__name(checkFreshness, "checkFreshness");
var worker_default = {
  async fetch(request, env, ctx) {
    const u = new URL(request.url);
    if (u.pathname === "/health") return json({ ok: true, worker: WORKER, version: VERSION, models: MODELS.length, signals: SIGNALS.length });
    if (u.pathname === "/run") {
      const p = await runProbe(env);
      const f = await checkFreshness(env);
      let st = 0, idle = 0;
      for (let i = 0; i < f.length; i++) {
        if (f[i].status === "stale") st++;
        if (f[i].status === "idle") idle++;
      }
      return json({ ok: true, version: VERSION, probe: p, freshness: f, stale_count: st, idle_count: idle });
    }
    if (u.pathname === "/freshness") return json(await checkFreshness(env));
    return json({ ok: false, error: "not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async function() {
      await runProbe(env);
      await checkFreshness(env);
    })());
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map