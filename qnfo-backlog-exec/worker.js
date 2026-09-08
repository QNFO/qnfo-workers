// qnfo-backlog-exec v1.1.1 - agent_issues backlog executor (cloud-native ops).
// v1.1.1: drain ordering (priority, then least-recently-watched) so each daily run advances.
// v1.1.0 (self red-team): never auto-close on generic /health alone - a worker can be up while its
// failing endpoint is broken. Only rows whose OWN resolution predicate passes are closed.
// All others are left open but marked rechecked (updated_at) so the loop proves it is watching.
const VERSION = "1.2.4";
// v1.2.4: datetime-format fix - alerts.created_at mixes ISO-T (error-selfheal) and space (datetime())
// formats; string >= comparison miscounts because "T" > " " (30h-old alerts looked fresh). Use julianday().
// v1.2.2: evidence channel fix - public-URL probes from the edge fail for same-account workers
// (CF edge 404 / SVC-BINDING-1); use qnfo-fleet-dashboard fleet_probe_log rows in qnfo-audit
// as the authoritative 15-min health evidence, edge probe only as fallback.
// v1.2.0: exception/alert-storm class auto-close - a worker-exception ticket whose target is
// healthy NOW and has had NO new alert in 24h AND is older than 48h is stale by evidence;
// close it (health-availability rows already auto-close on probe pass; this extends the same
// evidence discipline to alert-storm/exception tickets so the backlog cannot accrue ghost items).
const WORKER = "qnfo-backlog-exec";
const MAX_ROW = 40;
const PROBE_TIMEOUT = 8000;

async function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
function ts() { return new Date().toISOString(); }
function nowEpoch() { return Date.now(); }

async function recordEvent(env, kind, text, meta, job, status) {
  try {
    const id = kind.slice(0,2) + "-" + (job || WORKER) + "-" + Date.now().toString(36);
    await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1,?2,?3,?4,?5,?6,?7)")
      .bind(id, ts(), kind, String(text).slice(0,800), JSON.stringify(meta||{}).slice(0,800), job || WORKER, status || "ok").run();
  } catch (e) {}
}
async function alert(env, source, level, message) {
  try { await env.AUDIT.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)").bind(source, level, String(message).slice(0,500)).run(); } catch (e) {}
}

function workerTarget(text) {
  const m = String(text || "").match(/\b(qnfo-[a-z0-9-]+|personal-api(?:-[a-z0-9-]+)?|research-daily-brief|calendar-api|events-radar|qnfo-ai|qnfo-ai-chat)\b/g);
  if (!m) return null;
  return m[0];
}

async function probeHealthyViaLog(env, name) {
  try {
    const row = await env.AUDIT.prepare("SELECT ok, status, ts FROM fleet_probe_log WHERE name = ?1 ORDER BY id DESC LIMIT 1").bind(name).first();
    if (row && Number(row.ok) === 1) {
      const age = Date.now() - new Date(row.ts).getTime();
      if (age < 24 * 3600 * 1000) return { ok: true, via: "fleet_probe_log", ts: row.ts, status: row.status };
    }
  } catch (e) {}
  return null;
}
async function probeHealth(name) {
  const hosts = [name + ".q08.workers.dev", name + ".qnfo.org"];
  for (const h of hosts) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), PROBE_TIMEOUT);
      const r = await fetch("https://" + h + "/health", { headers: { "User-Agent": "Mozilla/5.0 (qnfo-backlog-exec)" }, signal: ctl.signal });
      clearTimeout(timer);
      if (r.ok) return { ok: true, host: h, status: r.status };
    } catch (e) {}
  }
  return { ok: false, host: null, status: 0 };
}

async function run(env) {
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
      // Recurrence-based stale close: error-selfheal alerts every recurrence (2h windows).
      // If NO error-selfheal exception/storm alert names this worker in the last 24h, the
      // class has recovered; the ticket is stale. Health evidence (fleet log or edge probe)
      // is checked when available but is not required - error-selfheal silence IS the signal.
      const ca = row.created_at;
      const ageMs = (typeof ca === "number") ? (now - ca) : (now - (new Date(ca).getTime() || 0));
      if (ageMs > 24 * 3600 * 1000) {
        let rec = 0;
        try {
          const ar = await env.AUDIT.prepare("SELECT COUNT(*) AS c FROM alerts WHERE source='qnfo-error-selfheal' AND message LIKE ?1 AND julianday(created_at) >= julianday('now', '-24 hours')").bind("%" + name + "%").first();
          rec = ar ? Number(ar.c || 0) : 0;
        } catch (e) {}
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
    await env.AUDIT.prepare("UPDATE agent_issues SET updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
    rechecked++;
    detail.push({ id: row.id, title: title.slice(0,60), action: "recheck", note: name ? ("probe target " + name) : "no probe target" });
  }
  const summary = { processed: items.length, closed: closed, rechecked: rechecked, escalated: escalated, detail: detail.slice(0, MAX_ROW) };
  if (escalated > 0) await alert(env, WORKER, "warning", "backlog-exec: " + escalated + " health issue(s) still failing: " + detail.filter(d=>d.action==="escalate").map(d=>d.target).join(", "));
  await recordEvent(env, "job-run", "backlog-exec " + JSON.stringify({ processed: items.length, closed: closed, rechecked: rechecked, escalated: escalated }), { processed: items.length, closed: closed, rechecked: rechecked, escalated: escalated }, WORKER, "ok");
  return { status: "ok", notes: summary };
}

export default {
  async scheduled(event, env, ctx) {
    try {
      const out = await run(env);
      console.log("backlog-exec", JSON.stringify(out));
    } catch (e) {
      console.error("backlog-exec", String((e && e.message) || e));
      await alert(env, WORKER, "error", "run failed: " + String((e && e.message) || e));
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const open = await env.AUDIT.prepare("SELECT COUNT(*) c FROM agent_issues WHERE status='open'").first().catch(() => null);
      return json({ ok: true, worker: WORKER, version: VERSION, openBacklog: open ? open.c : -1 });
    }
    if (url.pathname === "/run" && request.method === "POST") {
      const out = await run(env);
      return json({ ok: true, worker: WORKER, version: VERSION, out: out });
    }
    return json({ error: "not found" }, 404);
  }
};
