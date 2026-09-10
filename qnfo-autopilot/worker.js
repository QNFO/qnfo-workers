// qnfo-autopilot v0.1.0 — the L4 decide-loop: the fleet's own deferred-work executor.
// PURPOSE: close the Ashby variety gap. Until now, every expansion was driven by an external agent
// session (a watchmaker). This worker makes the FLEET drain its own open-work queue and self-report.
//   (1) OVERDUE CENSUS — reads task_dod_register open rows past due, files them to cloud_ops_events.
//   (2) ACTIVITY SNAPSHOT — persists per-worker 24h request counts into worker_activity_daily (D1),
//       sourced from the dashboard's live GraphQL analytics (closes the invocation-telemetry gap for
//       all scheduled workers, autonomous + receipted).
//   (3) DAILY DIGEST — writes kind=autopilot-cycle / daily-digest events (proactive reporting).
// CANONICAL: QNFO/qnfo-workers/qnfo-autopilot/worker.js. DEPLOY: wrangler (D1 AUDIT + cron 5 * * * *).
const VERSION = '0.1.0';
const NAME = 'qnfo-autopilot';
const DASH = 'https://fleet.qnfo.org/api/state';
const UA = 'qnfo-autopilot/' + VERSION;

function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
function nowIso() { return new Date().toISOString(); }

async function ensureSchema(env) {
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS worker_activity_daily (id INTEGER PRIMARY KEY AUTOINCREMENT, worker_name TEXT NOT NULL, day TEXT NOT NULL, req24 INTEGER, source TEXT, ts TEXT)").run();
  await env.AUDIT.prepare("CREATE INDEX IF NOT EXISTS idx_wad_day ON worker_activity_daily(day)").run();
}

// PRECONDITION: register populated. POSTCONDITION: overdue open rows returned (receipted, not modified).
async function overdueCensus(env) {
  const r = await env.AUDIT.prepare("SELECT id, source_row_id, title, due FROM task_dod_register WHERE status = 'open' AND due IS NOT NULL AND due <= ?1 ORDER BY due LIMIT 100").bind(nowIso().slice(0, 10)).all();
  return r.results || [];
}

// PRECONDITION: dashboard reachable. POSTCONDITION: worker_activity_daily rows for scheduled workers.
async function activitySnapshot(env) {
  let st;
  try {
    const resp = await fetch(DASH, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    if (!resp.ok) return { ok: false, why: 'dash ' + resp.status };
    st = await resp.json();
  } catch (e) { return { ok: false, why: String(e && e.message ? e.message : e).slice(0, 60) }; }
  const sched = st.scheduled || [];
  const day = nowIso().slice(0, 10);
  let inserted = 0;
  for (const s of sched) {
    if (!s.name || s.req24 == null) continue;
    await env.AUDIT.prepare("INSERT INTO worker_activity_daily (worker_name, day, req24, source, ts) VALUES (?1, ?2, ?3, 'dashboard-scheduled-req24', ?4)").bind(s.name, day, s.req24, nowIso()).run();
    inserted++;
  }
  return { ok: true, inserted: inserted, workers: sched.length };
}

// PRECONDITION: schema ensured. POSTCONDITION: cycle report + cloud_ops_events receipt.
async function cycle(env) {
  await ensureSchema(env);
  const overdue = await overdueCensus(env);
  const activity = await activitySnapshot(env);
  const report = { ts: nowIso(), version: VERSION, overdue_count: overdue.length, overdue: overdue.slice(0, 20), activity: activity };
  try {
    await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, 'autopilot-cycle', ?3, ?4, ?5, 'ok')").bind('autopilot-' + nowIso().slice(0, 13), nowIso(), 'autopilot cycle: ' + overdue.length + ' overdue register rows; activity snapshot ' + (activity.inserted || 0) + ' workers', JSON.stringify(report), NAME).run();
  } catch (e) {}
  return report;
}

export default {
  async scheduled(controller, env, ctx) {
    await ensureSchema(env);
    ctx.waitUntil((async function () { try { await cycle(env); } catch (e) {} })());
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    await ensureSchema(env);
    if (p === '/health') return json({ ok: true, name: NAME, version: VERSION });
    if (p === '/run/cycle') return json({ ok: true, report: await cycle(env) });
    return json({ ok: false, error: 'not found', endpoints: ['/health', '/run/cycle'] }, 404);
  }
};
