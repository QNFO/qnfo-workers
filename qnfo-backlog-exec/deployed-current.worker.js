var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "1.4.0";
var WORKER = "qnfo-backlog-exec";
var MAX_ROW = 40;
var PROBE_TIMEOUT = 8e3;
async function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
__name(json, "json");
function ts() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(ts, "ts");
function nowEpoch() {
  return Date.now();
}
__name(nowEpoch, "nowEpoch");
function createdAgeMs(ca, now) {
  if (typeof ca === "number") return now - ca;
  if (typeof ca === "string") {
    const t = ca.trim();
    if (/^\d{10,}$/.test(t)) return now - Number(t);
    const d = new Date(t).getTime();
    if (Number.isFinite(d)) return now - d;
  }
  return 0;
}
__name(createdAgeMs, "createdAgeMs");
async function recordEvent(env, kind, text, meta, job, status) {
  try {
    const id = kind.slice(0, 2) + "-" + (job || WORKER) + "-" + Date.now().toString(36);
    await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(id, ts(), kind, String(text).slice(0, 800), JSON.stringify(meta || {}).slice(0, 800), job || WORKER, status || "ok").run();
  } catch (e) {
  }
}
__name(recordEvent, "recordEvent");
async function alert(env, source, level, message) {
  try {
    await env.AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)").bind(source, level, String(message).slice(0, 500)).run();
  } catch (e) {
  }
}
__name(alert, "alert");
function workerTarget(text) {
  const m = String(text || "").match(/\b(qnfo-[a-z0-9-]+|personal-api(?:-[a-z0-9-]+)?|research-daily-brief|calendar-api|events-radar|qnfo-ai|qnfo-ai-chat)\b/g);
  if (!m) return null;
  return m[0];
}
__name(workerTarget, "workerTarget");
async function probeHealthyViaLog(env, name) {
  try {
    const row = await env.AUDIT.prepare("SELECT ok, status, ts FROM fleet_probe_log WHERE name = ?1 ORDER BY id DESC LIMIT 1").bind(name).first();
    if (row && Number(row.ok) === 1) {
      const age = Date.now() - new Date(row.ts).getTime();
      if (age < 24 * 3600 * 1e3) return { ok: true, via: "fleet_probe_log", ts: row.ts, status: row.status };
    }
  } catch (e) {
  }
  return null;
}
__name(probeHealthyViaLog, "probeHealthyViaLog");
async function probeHealth(name) {
  const hosts = [name + ".q08.workers.dev", name + ".qnfo.org"];
  for (const h of hosts) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), PROBE_TIMEOUT);
      const r = await fetch("https://" + h + "/health", { headers: { "User-Agent": "Mozilla/5.0 (qnfo-backlog-exec)" }, signal: ctl.signal });
      clearTimeout(timer);
      if (r.ok) return { ok: true, host: h, status: r.status };
    } catch (e) {
    }
  }
  return { ok: false, host: null, status: 0 };
}
__name(probeHealth, "probeHealth");
async function sweepAdvisorNoise(env) {
  let closed = 0;
  const now = nowEpoch();
  try {
    const noise = await env.AUDIT.prepare("SELECT id, title, created_at FROM agent_issues WHERE status='open' AND title LIKE 'OPEN-ISSUES%' ORDER BY id").all();
    const rows = noise.results || [];
    for (const r of rows) {
      const ageMs = createdAgeMs(r.created_at, now);
      if (ageMs > 3 * 3600 * 1e3) {
        await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, r.id).run();
        closed++;
        await recordEvent(env, "job-run", "backlog-exec closed advisor-noise snapshot " + r.id + " (" + String(r.title || "").slice(0, 40) + "): superseded, age>3h", { id: r.id, action: "closed", reason: "advisor-noise sweep v1.2.6" }, WORKER, "ok");
      }
    }
  } catch (e) {
  }
  return closed;
}
__name(sweepAdvisorNoise, "sweepAdvisorNoise");
async function sweepIssueLedger(env) {
  let resolved = 0;
  const now = nowEpoch();
  const hours = Number(env.LEDGER_STALE_HOURS) > 0 ? Math.floor(Number(env.LEDGER_STALE_HOURS)) : 72;
  try {
    const stale = await env.AUDIT.prepare(
      "SELECT fingerprint, source, title, last_seen FROM issue_ledger WHERE status='open' AND julianday(last_seen) < julianday('now', ?1) ORDER BY last_seen LIMIT 500"
    ).bind("-" + hours + " hours").all();
    const rows = stale.results || [];
    for (const r of rows) {
      await env.AUDIT.prepare(
        "UPDATE issue_ledger SET status='resolved', resolved_at=?1, resolution_note=?2, updated_at=?1 WHERE fingerprint=?3 AND status='open'"
      ).bind(ts(), "auto-resolved v1.2.8: not re-seen in " + hours + "h (fingerprint PK - a recurrence would have advanced last_seen)", r.fingerprint).run();
      resolved++;
    }
    if (resolved > 0) {
      await recordEvent(env, "job-run", "backlog-exec resolved " + resolved + " stale issue_ledger fingerprint(s) (not re-seen in " + hours + "h)", { action: "issue_ledger-sweep", resolved, window_hours: hours }, WORKER, "ok");
    }
  } catch (e) {
    await recordEvent(env, "job-run", "backlog-exec issue_ledger sweep failed: " + String(e && e.message || e), { action: "issue_ledger-sweep", error: true }, WORKER, "error");
  }
  return resolved;
}
__name(sweepIssueLedger, "sweepIssueLedger");
async function sweepOpsJobs(env) {
  const out = { promoted: 0, failed: 0, strandedBefore: 0 };
  const staleMin = Number(env.OPS_JOB_STALE_MIN) > 0 ? Math.floor(Number(env.OPS_JOB_STALE_MIN)) : 30;
  const reapContinuing = String(env.OPS_JOB_REAP_CONTINUING || "1") !== "0";
  const statuses = reapContinuing ? "'running','continuing','queued'" : "'running','queued'";
  try {
    const stranded = await env.AUDIT.prepare(
      "SELECT COUNT(*) AS c FROM ops_jobs WHERE status IN ('running','continuing','queued') AND length(COALESCE(response,'')) > 0"
    ).first();
    out.strandedBefore = stranded ? Number(stranded.c || 0) : 0;
    const rows = await env.AUDIT.prepare(
      "SELECT id, status, updated_at, length(COALESCE(response,'')) AS rl FROM ops_jobs WHERE status IN (" + statuses + ") AND julianday(updated_at) < julianday('now', ?1) ORDER BY updated_at LIMIT 200"
    ).bind("-" + staleMin + " minutes").all();
    for (const r of rows.results || []) {
      if (Number(r.rl) > 0) {
        await env.AUDIT.prepare("UPDATE ops_jobs SET status='succeeded', updated_at=?1 WHERE id=?2 AND status IN (" + statuses + ")").bind(ts(), r.id).run();
        out.promoted++;
      } else {
        await env.AUDIT.prepare("UPDATE ops_jobs SET status='failed', error=COALESCE(error, ?1), updated_at=?2 WHERE id=?3 AND status IN (" + statuses + ")").bind("reaper v1.3.0 (INFERRED - no diagnostic was captured): no response within " + staleMin + "m of last write", ts(), r.id).run();
        out.failed++;
      }
    }
    if (out.promoted + out.failed > 0) {
      await recordEvent(env, "job-run", "backlog-exec reaped ops_jobs: promoted " + out.promoted + " stranded answer(s) to terminal, failed " + out.failed + " silent row(s) (idle>" + staleMin + "m)", { action: "ops-jobs-reap", promoted: out.promoted, failed: out.failed, stranded_before: out.strandedBefore, stale_min: staleMin }, WORKER, "ok");
    }
  } catch (e) {
    await recordEvent(env, "job-run", "backlog-exec ops_jobs reap failed: " + String(e && e.message || e), { action: "ops-jobs-reap", error: true }, WORKER, "error");
  }
  return out;
}
__name(sweepOpsJobs, "sweepOpsJobs");
async function run(env) {
  const noiseClosed = await sweepAdvisorNoise(env);
  const ledgerResolved = await sweepIssueLedger(env);
  const jobsReaped = await sweepOpsJobs(env);
  const rows = await env.AUDIT.prepare("SELECT id, title, description, source, category, priority, status, created_at, updated_at FROM agent_issues WHERE status='open' ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, updated_at ASC, id LIMIT ?1").bind(MAX_ROW).all();
  const items = rows.results || [];
  const now = nowEpoch();
  let closed = 0, rechecked = 0, escalated = 0;
  const detail = [];
  for (const row of items) {
    const title = String(row.title || "");
    const name = workerTarget(title + " " + String(row.description || ""));
    const isHealthAvailability = /health|heartbeat|availability|endpoint down|is down|reachable/i.test(title) && /health|availability|reachable|down/i.test(title);
    if (name && isHealthAvailability) {
      const pLog = await probeHealthyViaLog(env, name);
      const p = pLog ? { ok: true, host: pLog.via + " " + pLog.ts } : await probeHealth(name);
      if (p.ok) {
        await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
        closed++;
        detail.push({ id: row.id, target: name, action: "closed", note: "health availability re-probe PASS via " + p.host });
        await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (" + name + "): " + p.host, { id: row.id, target: name, action: "closed", reason: "health-availability predicate passed" }, WORKER, "ok");
        continue;
      } else {
        if (/orphan|bogus|does not exist/i.test(title)) {
          await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
          closed++;
          detail.push({ id: row.id, target: name, action: "closed", note: "orphan probe target (no such host) - closed on first failed probe" });
          continue;
        }
        escalated++;
        detail.push({ id: row.id, target: name, action: "escalate", note: "health probe still failing" });
        continue;
      }
    }
    const isExceptionClass = !isHealthAvailability && name && /alert-storm|exception|error-burst|worker-exception|recurring fail/i.test(title);
    if (isExceptionClass && name) {
      const ageMs = createdAgeMs(row.created_at, now);
      if (ageMs > 24 * 3600 * 1e3) {
        let rec = 0;
        try {
          const ar = await env.AUDIT.prepare("SELECT COUNT(*) AS c FROM alerts WHERE source='qnfo-error-selfheal' AND message LIKE ?1 AND julianday(created_at) >= julianday('now', '-24 hours')").bind("%" + name + "%").first();
          rec = ar ? Number(ar.c || 0) : 0;
        } catch (e) {
        }
        if (rec === 0) {
          const ev = await probeHealthyViaLog(env, name) || await probeHealth(name);
          await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
          closed++;
          detail.push({ id: row.id, target: name, action: "closed", note: "exception-class recovered: no error-selfheal recurrence 24h, age>24h" + (ev && ev.ok ? ", health ev " + ev.host : "") });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (" + name + "): exception-class recovered", { id: row.id, target: name, action: "closed", reason: "no error-selfheal recurrence in 24h" }, WORKER, "ok");
          continue;
        }
      }
    }
    const isModelHealth = /^MODEL-DEGRADED\b/i.test(title);
    if (isModelHealth) {
      try {
        const dg = await env.AUDIT.prepare("SELECT model_id FROM ai_model_health WHERE status='degraded'").all();
        const degraded = new Set((dg.results || []).map((d) => String(d.model_id)));
        const named = title.replace(/^MODEL-DEGRADED\s*/i, "").split(",").map((s) => s.trim()).filter(Boolean);
        const still = named.filter((m) => degraded.has(m));
        if (degraded.size === 0 || still.length === 0) {
          await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
          closed++;
          detail.push({ id: row.id, action: "closed", note: "model-health stale: none of [" + named.slice(0, 4).join(",") + "] degraded now (degraded rows=" + degraded.size + ")" });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (model-health): no named model degraded now", { id: row.id, action: "closed", reason: "model-health predicate cleared v1.2.7" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, action: "recheck", note: "model-health STILL degraded: " + still.join(",") });
        continue;
      } catch (e) {
      }
    }
    const probeFail = title.match(/^\[ai-cal\]\s+model probe failing:\s*(\S+)/i);
    if (probeFail) {
      try {
        const model = probeFail[1];
        const h = await env.AUDIT.prepare("SELECT status FROM ai_model_health WHERE model_id=?1").bind(model).first();
        if (!h || String(h.status) !== "degraded") {
          await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
          closed++;
          detail.push({ id: row.id, target: model, action: "closed", note: "ai-cal probe-failing stale: ai_model_health status=" + (h ? h.status : "absent") });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (ai-cal " + model + "): health no longer degraded", { id: row.id, target: model, action: "closed", reason: "ai-cal probe predicate cleared v1.2.7" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, target: model, action: "recheck", note: "ai-cal probe STILL failing: " + model });
        continue;
      } catch (e) {
      }
    }
    const gwFail = title.match(/^\[gw-fail\]\s+(\d+)\s+(\S+)/);
    if (gwFail) {
      try {
        const model = gwFail[2];
        const rec = await env.AUDIT.prepare("SELECT COALESCE(SUM(count),0) AS n FROM ai_gateway_failures WHERE model=?1 AND ts >= ((strftime('%s','now') - 86400) * 1000)").bind(model).first();
        const n = rec ? Number(rec.n || 0) : 0;
        if (n === 0) {
          await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
          closed++;
          detail.push({ id: row.id, target: model, action: "closed", note: "gw-fail stale: 0 failures for " + model + " in 24h" });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (gw-fail " + model + "): no recurrence in 24h", { id: row.id, target: model, action: "closed", reason: "gateway-failure predicate cleared v1.2.7" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, target: model, action: "recheck", note: "gateway failures CURRENT: " + n + "/24h - real defect, root fix pending" });
        continue;
      } catch (e) {
      }
    }
    const vq = title.match(/version_queue\s+id=(\d+)/i);
    if (vq) {
      try {
        const q = await env.AUDIT.prepare("SELECT status, version_to, updated_at FROM version_queue WHERE id=?1").bind(Number(vq[1])).first();
        if (!q || String(q.status).toLowerCase() !== "error") {
          await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
          closed++;
          detail.push({ id: row.id, target: "version_queue#" + vq[1], action: "closed", note: q ? "version_queue status=" + q.status + " (not error) - condition cleared" : "version_queue row absent - ticket orphaned" });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (VQ " + vq[1] + "): " + (q ? "status=" + q.status : "row absent"), { id: row.id, action: "closed", reason: "zenodo-publish predicate cleared v1.2.9" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, target: "version_queue#" + vq[1], action: "recheck", note: "version_queue STILL error (v" + (q.version_to || "?") + ", updated " + q.updated_at + ")" });
        continue;
      } catch (e) {
      }
    }
    if (/^TERMINAL research failure\b/i.test(title)) {
      try {
        const t = await env.AUDIT.prepare("SELECT COUNT(*) AS c FROM research_queue WHERE status='failed' AND recover_count>=2").first();
        const still = t ? Number(t.c || 0) : 0;
        if (still === 0) {
          await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
          closed++;
          detail.push({ id: row.id, action: "closed", note: "research terminal condition cleared: 0 rows with status='failed' AND recover_count>=2" });
          await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (research): no terminal-failed queue rows remain", { id: row.id, action: "closed", reason: "research-pipeline predicate cleared v1.2.9" }, WORKER, "ok");
          continue;
        }
        rechecked++;
        detail.push({ id: row.id, action: "recheck", note: "research terminal condition STILL present: " + still + " queue row(s) status='failed' AND recover_count>=2" });
        continue;
      } catch (e) {
      }
    }
    await env.AUDIT.prepare("UPDATE agent_issues SET updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
    rechecked++;
    detail.push({ id: row.id, title: title.slice(0, 60), action: "recheck", note: name ? "probe target " + name : "no probe target" });
  }
  const summary = { noiseClosed, ledgerResolved, jobsReaped, processed: items.length, closed, rechecked, escalated, detail: detail.slice(0, MAX_ROW) };
  if (escalated > 0) await alert(env, WORKER, "warning", "backlog-exec: " + escalated + " health issue(s) still failing: " + detail.filter((d) => d.action === "escalate").map((d) => d.target).join(", "));
  await recordEvent(env, "job-run", "backlog-exec " + JSON.stringify({ noiseClosed, ledgerResolved, jobsReaped, processed: items.length, closed, rechecked, escalated }), { noiseClosed, ledgerResolved, jobsReaped, processed: items.length, closed, rechecked, escalated }, WORKER, "ok");
  return { status: "ok", notes: summary };
}
__name(run, "run");
var worker_default = {
  async scheduled(event, env, ctx) {
    if (env.FLEET_FEED) {
      try {
        var fr = await env.FLEET_FEED.fetch("https://qnfo-fleet-feed.q08.workers.dev/feed/self?worker=qnfo-backlog-exec");
        if (fr.ok) {
          var fd = await fr.json();
          var actionable = (fd.findings || []).filter(function(f) {
            return f.auto_action && f.severity_int >= 2 && f.category && !f.category.startsWith("backlog/");
          }).slice(0, 10);
          for (var af of actionable) {
            var sql = af.auto_action;
            if (sql && /^(UPDATE|INSERT|DELETE)/i.test(sql.trim())) {
              try {
                await env.AUDIT.prepare(sql).run();
              } catch (e2) {
              }
            }
            try {
              await env.AUDIT.prepare(
                "INSERT OR IGNORE INTO self_heal_actions (kind, ref, action, ts, status, verified_at) VALUES (?,?,?,datetime('now'),'executed',datetime('now'))"
              ).bind("feed-auto-exec", af.id, (af.auto_action || "").slice(0, 500)).run();
            } catch (e3) {
            }
          }
        }
      } catch (eFeed) {
      }
    }
    try {
      const out = await run(env);
      console.log("backlog-exec", JSON.stringify(out));
    } catch (e) {
      console.error("backlog-exec", String(e && e.message || e));
      await alert(env, WORKER, "error", "run failed: " + String(e && e.message || e));
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const open = await env.AUDIT.prepare("SELECT COUNT(*) c FROM agent_issues WHERE status='open'").first().catch(() => null);
      const led = await env.AUDIT.prepare("SELECT COUNT(*) c FROM issue_ledger WHERE status='open'").first().catch(() => null);
      const stranded = await env.AUDIT.prepare("SELECT COUNT(*) c FROM ops_jobs WHERE status IN ('running','continuing','queued') AND length(COALESCE(response,'')) > 0").first().catch(() => null);
      return json({ ok: true, worker: WORKER, version: VERSION, openBacklog: open ? open.c : -1, openLedger: led ? led.c : -1, strandedOpsJobs: stranded ? stranded.c : -1 });
    }
    if (url.pathname === "/run" && request.method === "POST") {
      const out = await run(env);
      return json({ ok: true, worker: WORKER, version: VERSION, out });
    }
    return json({ error: "not found" }, 404);
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
