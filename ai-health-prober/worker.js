var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var WORKER = "ai-health-prober";
var VERSION = "2.3.4";
// v2.3.3 AMH-NAMESPACE-2 (2026-09-13): the ID-NAMESPACE-1 fix was INCOMPLETE.
// MODELS[0] still carried a QUALIFIED internal key ("@cf/qwen/qwen3.8-27b"), i.e. this
// prober itself kept writing one row in the `@cf/` namespace it was supposed to abandon.
// Live evidence 2026-09-13T06:30Z (qnfo-audit D1, 24 rows in ai_model_health): 5 rows carry
// a `@cf/` prefix, ALL status=degraded / consecutive_failures=0, four with last_probe_ts
// NULL; the fifth (@cf/qwen/qwen3.8-27b) carries a FRESH last_probe_ts (1789280141458,
// 2026-09-13T06:15:41Z) because v2.3.1 probes it under that key. Two writers therefore race
// on that row: this prober writes ok, then qnfo-ai-calibration GW-DEGRADE-1/2 rewrites
// degraded -> the row can never clear and MODEL-DEGRADED is refiled every */20 cron.
// The v2.3.2 reconcile guard required `last_probe_ts IS NULL`, which exempted exactly the
// raced row. Fixes here: (a) canonicalise every written model_id to the short internal form;
// (b) reconcile `@cf/` rows that carry zero failure evidence regardless of last_probe_ts.
// v2.3.2 ID-NAMESPACE-1 (2026-09-13): the health table carries TWO id namespaces.
// This prober writes only the `internal` key. qnfo-ai-calibration GW-DEGRADE-1/2 writes
// gateway-failure health under the full CF id when its internalId() reverse map cannot
// resolve it, so 4 models got phantom `@cf/...` rows (status degraded, last_probe_ts NULL,
// consecutive_failures 0) that no prober can ever clear -> MODEL-DEGRADED refiled every
// */20 cron. MODELS was also 15 entries for 10 distinct models, with one entry recording
// GLM-5.3's probe result against kimi-k2.6.
var MODELS = [{ "internal": "qwen3.8-27b", "id": "@cf/qwen/qwen3.8-27b", "kind": "text" }, { "internal": "bge-base-en-v1.5", "id": "@cf/baai/bge-base-en-v1.5", "kind": "embed" }, { "internal": "deepseek-v4-pro", "id": "@cf/deepseek-ai/deepseek-v4-pro-0813", "kind": "text" }, { "internal": "deepseek-v4-flash-wa", "id": "@cf/deepseek-ai/deepseek-v4-flash-0731", "kind": "text" }, { "internal": "deepseek-v4-pro-wa", "id": "@cf/deepseek-ai/deepseek-v4-pro-0813", "kind": "text" }, { "internal": "glm-5.3-flash", "id": "@cf/zai-org/glm-5.3-flash", "kind": "text" }, { "internal": "kimi-k2.6", "id": "@cf/moonshotai/kimi-k2.6", "kind": "text" }, { "internal": "glm-5.3", "id": "@cf/zai-org/glm-5.3", "kind": "text" }, { "internal": "gpt-oss-120b", "id": "@cf/openai/gpt-oss-120b", "kind": "text" }, { "internal": "kimi-k2.7-code", "id": "@cf/moonshotai/kimi-k2.7-code", "kind": "text" }];
var SIGNALS = [["cal_loop", "fleet_cal_state", "updated_at", 24, "heartbeat"], ["kaizen", "kaizen_candidates", "created_at", 192, "heartbeat"], ["evolve", "evolve_candidates", "ts", 72, "heartbeat"], ["pipeline_status", "pipeline_status", "last_updated", 24, "event"], ["amh_models", "ai_model_health", "updated_at", 26, "heartbeat"], ["heartbeat", "fleet_heartbeat", "ts", 6, "heartbeat"], ["cloud_ops", "cloud_ops_events", "ts", 24, "heartbeat"], ["fleet_runs", "fleet_runs", "started_at", 24, "heartbeat"], ["research_queue", "research_queue", "created_at", 72, "heartbeat"], ["version_queue", "version_queue", "created_at", 72, "heartbeat"], ["paper_revision", "paper_revision_log", "created_at", 96, "heartbeat"], ["agent_issues", "agent_issues", "updated_at", 96, "heartbeat"], ["self_heal", "self_heal_actions", "ts", 48, "event"], ["outreach", "outreach_log", "sent_at", 72, "event"]];
function json(o, s) {
  return new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } });
}
__name(json, "json");
// v2.3.3 AMH-NAMESPACE-2: single choke point for the write key. No caller may persist a
// qualified `@cf/...` id into ai_model_health.
function canonicalId(m) {
  if (m == null) return null;
  var s = String(m);
  if (s.indexOf("@cf/") === 0) return s.split("/").pop();
  return s;
}
__name(canonicalId, "canonicalId");
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
// v2.3.2 AMH-RECONCILE-1: clear `degraded` rows that carry no probe evidence at all, and
// report how many rows this prober's write-key set cannot reach (coverage gap).
// v2.3.3 AMH-NAMESPACE-2: also clear `@cf/`-prefixed rows with zero failure evidence even
// when a stale writer stamped a last_probe_ts (a qualified key is non-evidence by design).
async function reconcileHealth(env, probedIds, now) {
  const out = { reconciled: 0, namespaceCleared: 0, uncovered: 0 };
  if (!env.QNFO_AUDIT) return out;
  try {
    const r = await env.QNFO_AUDIT.prepare("UPDATE ai_model_health SET status='ok', updated_at=?1 WHERE status='degraded' AND last_probe_ts IS NULL AND COALESCE(consecutive_failures,0)=0").bind(new Date(now).toISOString()).run();
    out.reconciled = r && r.meta && typeof r.meta.changes === "number" ? r.meta.changes : 0;
  } catch (e) {
  }
  try {
    const r2 = await env.QNFO_AUDIT.prepare("UPDATE ai_model_health SET status='ok', updated_at=?1 WHERE model_id LIKE '@cf/%' AND status='degraded' AND COALESCE(consecutive_failures,0)=0").bind(new Date(now).toISOString()).run();
    out.namespaceCleared = r2 && r2.meta && typeof r2.meta.changes === "number" ? r2.meta.changes : 0;
    out.reconciled += out.namespaceCleared;
  } catch (e) {
  }
  try {
    const rows = await env.QNFO_AUDIT.prepare("SELECT model_id FROM ai_model_health").all();
    const set = {};
    for (let i = 0; i < probedIds.length; i++) set[probedIds[i]] = 1;
    const all = rows && rows.results || [];
    for (let i = 0; i < all.length; i++) {
      if (!set[all[i].model_id]) out.uncovered++;
    }
  } catch (e) {
  }
  return out;
}
__name(reconcileHealth, "reconcileHealth");
async function runProbe(env) {
  const now = Date.now();
  const results = [];
  const probedIds = [];
  for (let i = 0; i < MODELS.length; i++) {
    const m = MODELS[i];
    const r = await probeOne(env, m);
    const mid = canonicalId(m.internal || m.id);
    probedIds.push(mid);
    results.push({ model: mid, ok: r.ok, ms: r.ms || null });
    if (env.QNFO_AUDIT) {
      try {
        if (r.ok) {
          await env.QNFO_AUDIT.prepare("INSERT INTO ai_model_health (model_id, status, last_probe_ts, last_latency_ms, consecutive_failures, updated_at) VALUES (?1, ?5, ?2, ?3, 0, ?4) ON CONFLICT(model_id) DO UPDATE SET status=?5, last_probe_ts=?2, last_latency_ms=?3, consecutive_failures=0, updated_at=?4").bind(mid, now, r.ms || null, new Date(now).toISOString(), "ok").run();
        } else {
          await env.QNFO_AUDIT.prepare("INSERT INTO ai_model_health (model_id, status, last_probe_ts, last_latency_ms, consecutive_failures, updated_at) VALUES (?1, ?5, ?2, ?3, 1, ?4) ON CONFLICT(model_id) DO UPDATE SET status=CASE WHEN consecutive_failures >= 2 THEN ?6 ELSE ?5 END, last_probe_ts=?2, last_latency_ms=?3, consecutive_failures=COALESCE(consecutive_failures,0)+1, updated_at=?4").bind(mid, now, null, new Date(now).toISOString(), "degraded", "failing").run();
        }
      } catch (e) {
      }
    }
  }
  let up = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].ok) up++;
  }
  const extra = await reconcileHealth(env, probedIds, now);
  return { probed: results.length, up, down: results.length - up, reconciled: extra.reconciled, namespaceCleared: extra.namespaceCleared, uncovered: extra.uncovered };
}
__name(runProbe, "runProbe");
async function checkFreshness(env) {
  const now = Date.now();
  try {
    var _roster = [];
    for (var _i = 0; _i < MODELS.length; _i++) { var _m = MODELS[_i].internal || MODELS[_i].id; if (_roster.indexOf(_m) < 0) _roster.push(_m); }
    if (_roster.length) {
      var _ph = _roster.map(function () { return "?"; }).join(",");
      var _del = env.QNFO_AUDIT.prepare("DELETE FROM ai_model_health WHERE model_id NOT IN (" + _ph + ")");
      await _del.bind.apply(_del.bind, [null].concat(_roster)).run();
    }
  } catch (e) {}
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
// v2.3.2 AMH-COVERAGE-1: the SIGNALS loop above uses MAX(ts_column), so a single freshly
// written row masks every stale row in the table. Measured 2026-09-13: 'amh_models'
// reported fresh/age 0h while 12 of 24 rows were stale (8 at 37.6-37.9h) or never probed.
// This check counts rows instead of taking a maximum.
async function checkHealthCoverage(env, now) {
  const THRESHOLD_H = 26;
  let total = 0, stale = 0, neverProbed = 0;
  try {
    const r = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM ai_model_health").first();
    total = r ? Number(r.n || 0) : 0;
    const s = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM ai_model_health WHERE last_probe_ts IS NULL OR last_probe_ts < ?1").bind(now - THRESHOLD_H * 36e5).first();
    stale = s ? Number(s.n || 0) : 0;
    const np = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM ai_model_health WHERE last_probe_ts IS NULL").first();
    neverProbed = np ? Number(np.n || 0) : 0;
  } catch (e) {
    return { signal: "amh_coverage", status: "error" };
  }
  const status = stale > 0 ? "stale" : "fresh";
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO freshness_guard (signal, table_name, ts_column, max_ts, age_hours, threshold_hours, status, mode, checked_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?9,?8) ON CONFLICT(signal) DO UPDATE SET table_name=?2, ts_column=?3, max_ts=?4, age_hours=?5, threshold_hours=?6, status=?7, mode=?9, checked_at=?8").bind("amh_coverage", "ai_model_health", "last_probe_ts", stale + "/" + total + " stale (" + neverProbed + " never probed)", null, THRESHOLD_H, status, new Date(now).toISOString(), "heartbeat").run();
  } catch (e) {
  }
  return { signal: "amh_coverage", total, stale, neverProbed, threshold_hours: THRESHOLD_H, status };
}
__name(checkHealthCoverage, "checkHealthCoverage");
var worker_default = {
  async fetch(request, env, ctx) {
    const u = new URL(request.url);
    if (u.pathname === "/health") return json({ ok: true, worker: WORKER, version: VERSION, models: MODELS.length, signals: SIGNALS.length });
    if (u.pathname === "/run") {
      const p = await runProbe(env);
      const f = await checkFreshness(env);
      const coverage = await checkHealthCoverage(env, Date.now());
      let st = 0, idle = 0;
      for (let i = 0; i < f.length; i++) {
        if (f[i].status === "stale") st++;
        if (f[i].status === "idle") idle++;
      }
      return json({ ok: true, version: VERSION, probe: p, coverage, freshness: f, stale_count: st, idle_count: idle });
    }
    if (u.pathname === "/freshness") return json(await checkFreshness(env));
    return json({ ok: false, error: "not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async function() {
      await runProbe(env);
      await checkFreshness(env);
      await checkHealthCoverage(env, Date.now());
    })());
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
