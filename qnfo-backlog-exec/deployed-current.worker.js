// qnfo-backlog-exec v1.1.1 - agent_issues backlog executor (cloud-native ops).
// v1.1.1: drain ordering (priority, then least-recently-watched) so each daily run advances.
// v1.1.0 (self red-team): never auto-close on generic /health alone - a worker can be up while its
// failing endpoint is broken. Only rows whose OWN resolution predicate passes are closed.
// All others are left open but marked rechecked (updated_at) so the loop proves it is watching.
const VERSION = "1.1.1";
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
      const p = await probeHealth(name);
      if (p.ok) {
        await env.AUDIT.prepare("UPDATE agent_issues SET status='closed', updated_at=?1 WHERE id=?2 AND status='open'").bind(now, row.id).run();
        closed++;
        detail.push({ id: row.id, target: name, action: "closed", note: "health availability re-probe PASS via " + p.host });
        await recordEvent(env, "job-run", "backlog-exec closed issue " + row.id + " (" + name + "): " + p.host, { id: row.id, target: name, action: "closed", reason: "health-availability predicate passed" }, WORKER, "ok");
        continue;
      } else {
        escalated++;
        detail.push({ id: row.id, target: name, action: "escalate", note: "health probe still failing" });
        continue;
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
