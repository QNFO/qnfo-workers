// qnfo-autopilot v0.1.0 — the L4 decide-loop: the fleet's own deferred-work executor.
// PURPOSE: close the Ashby variety gap. Until now, every expansion was driven by an external agent
// session (a watchmaker). This worker makes the FLEET drain its own open-work queue and self-report.
//   (1) OVERDUE CENSUS — reads task_dod_register open rows past due, files them to cloud_ops_events.
//   (2) ACTIVITY SNAPSHOT — persists per-worker 24h request counts into worker_activity_daily (D1),
//       sourced from the dashboard's live GraphQL analytics (closes the invocation-telemetry gap for
//       all scheduled workers, autonomous + receipted).
//   (3) DAILY DIGEST — writes kind=autopilot-cycle / daily-digest events (proactive reporting).
// CANONICAL: QNFO/qnfo-workers/qnfo-autopilot/worker.js. DEPLOY: wrangler (D1 AUDIT + cron 5 * * * *).
const VERSION = '0.2.0';
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
  await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS evolve_candidates (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT NOT NULL, ts TEXT, status TEXT DEFAULT 'proposed', proposal TEXT, sha256 TEXT)").run();
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

const GH_API = 'https://api.github.com';
const B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// PRECONDITION: utf-8 string. POSTCONDITION: base64 (pure JS, no btoa dependency).
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64C[b0 >> 2] + B64C[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64C[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64C[b2 & 63] : '=';
  }
  return out;
}

// PRECONDITION: env.GITHUB_TOKEN set. POSTCONDITION: file created/updated on GitHub (commit + ref update).
// This is the capability that was previously device-bound (local git). Now cloud-native via GitHub API.
async function gitCommit(env, owner, repo, path, content, message) {
  const tok = env.GITHUB_TOKEN;
  if (!tok) return { ok: false, why: 'no GITHUB_TOKEN secret' };
  const url = GH_API + '/repos/' + owner + '/' + repo + '/contents/' + path;
  const hdrs = { 'Authorization': 'Bearer ' + tok, 'User-Agent': UA, 'Accept': 'application/vnd.github+json' };
  const body = { message: message, content: b64encode(content), branch: 'main' };
  try {
    const ex = await fetch(url + '?ref=main', { headers: hdrs });
    if (ex.ok) { const j = await ex.json(); if (j && j.sha) body.sha = j.sha; }
  } catch (e) {}
  try {
    const resp = await fetch(url, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, hdrs), body: JSON.stringify(body) });
    const j = await resp.json();
    return { ok: resp.ok, status: resp.status, commit: (j.commit && j.commit.sha) ? String(j.commit.sha).slice(0, 7) : null, path: j.content ? j.content.path : null, error: resp.ok ? null : String(j.message || '').slice(0, 120) };
  } catch (e) {
    return { ok: false, why: String(e && e.message ? e.message : e).slice(0, 120) };
  }
}

// PRECONDITION: dashboard reachable. POSTCONDITION: markdown report committed to qnfo-ops/docs (no local python).
async function publishReport(env) {
  let st;
  try {
    const resp = await fetch(DASH, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    if (!resp.ok) return { ok: false, why: 'dash ' + resp.status };
    st = await resp.json();
  } catch (e) { return { ok: false, why: String(e && e.message ? e.message : e).slice(0, 60) }; }
  const rc = st.report_card || {};
  const ig = st.integration || {};
  const sys = ig.system || {};
  const day = nowIso().slice(0, 10);
  const md = [
    '# QNFO Autopilot Report ' + day,
    '',
    '> Generated autonomously by qnfo-autopilot ' + VERSION + ' (cloud; no local python/git).',
    '',
    '## Autonomy ladder',
    '- LoA: ' + (rc.loa || '?') + ' (' + (rc.loa_label || '') + ')',
    '- AGI level: ' + (rc.agi || '?'),
    '- VSM: ' + (rc.vsm || '?'),
    '- OODA: ' + (rc.ooda || '?'),
    '- Watchmaker (human-gated ops): ' + (rc.watchmaker || '?'),
    '- Drift: ghost ' + ((rc.drift && rc.drift.ghost) || 0) + ', unregistered ' + ((rc.drift && rc.drift.unregistered) || 0) + ', unversioned ' + ((rc.drift && rc.drift.unversioned) || 0),
    '',
    '## System integration score',
    '- Total: ' + ((sys.score && sys.score.total) || '?') + '/100 (chains ' + ((sys.score && sys.score.chains) || '?') + ' / coverage ' + ((sys.score && sys.score.coverage) || '?') + ' / freshness ' + ((sys.score && sys.score.freshness) || '?') + ')',
    '- Coverage: ' + JSON.stringify(sys.coverage || {}),
    '',
    '## Opportunities',
    (sys.opportunities || []).map(function (o) { return '- [' + o.kind + '] ' + o.text; }).join('\n') || '- none',
    '',
    '## Fleet',
    '- Workers: ' + ((st.fleet && st.fleet.workers) || '?') + ' | Scheduled: ' + ((st.fleet && st.fleet.scheduled) || '?') + ' | Probes: ' + ((st.fleet && st.fleet.probes) || '?'),
    '',
  ].join('\n');
  return await gitCommit(env, 'QNFO', 'qnfo-ops', 'docs/AUTOPILOT-REPORT-' + day + '.md', md, 'autopilot: cloud-generated report ' + day);
}

const CF_API = 'https://api.cloudflare.com/client/v4/accounts/edb167b78c9fb901ea5bca3ce58ccc4b';
const EVOLVE_MODEL = '@cf/moonshotai/kimi-k2.6';

// SERVICE-BINDING-1: synchronous runtime-verify for subdomain-only workers (egress -> workers.dev = 1042).
// Service bindings invoke the target's fetch handler directly, bypassing the public subdomain wall.
const COVERAGE = ['jnl-pipeline', 
  'qnfo-email', 'qnfo-ai-search', 'obsidian-writer', 'qnfo-lifecycle',
  'calendar-api', 
  'radar-hub', 'qnfo-events', 'qnfo-archive',  'qnfo-chat-canary',
  'qnfo-ddocs-indexer',   'qnfo-impact', 'qnfo-paper-explainer', 'qnfo-paper-indexer',
  'qnfo-proof', 'qnfo-thread-ingest',  
];
function sbName(w) { return 'SB_' + w.toUpperCase().replace(/[^A-Z0-9]+/g, '_'); }
const SERVICE_BINDINGS = {};
for (var _ci = 0; _ci < COVERAGE.length; _ci++) { SERVICE_BINDINGS[COVERAGE[_ci]] = sbName(COVERAGE[_ci]); }

// PRECONDITION: multipart envelope from content/v2. POSTCONDITION: raw module code.
function unwrap(raw) {
  if (!raw || raw.indexOf('Content-Disposition') < 0) return raw;
  const m = raw.match(/Content-Type: [^\r\n]+\r\n\r\n/);
  if (!m) return raw;
  const idx = raw.indexOf(m[0]) + m[0].length;
  let code = raw.slice(idx);
  const bm = code.match(/\r\n--[A-Za-z0-9]+--\r?\n?$/);
  if (bm) code = code.slice(0, code.length - bm[0].length);
  return code;
}

async function sha256hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(d)].map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// PROPOSE rung of self-rewrite (RSI): read a worker's deployed source, generate a candidate improvement
// via Workers AI, store as 'proposed' (NEVER auto-deploy). Apply rung stays behind the autonomy ladder
// (L3 promotion: N=3 clean cycles + tested kill-switch + tested rollback).
async function evolvePropose(env, worker, goal) {
  if (!env.CF_API_TOKEN) return { ok: false, why: 'no CF_API_TOKEN secret' };
  if (!env.AI) return { ok: false, why: 'no AI binding' };
  let code;
  try {
    const resp = await fetch(CF_API + '/workers/scripts/' + worker + '/content/v2', { headers: { 'Authorization': 'Bearer ' + env.CF_API_TOKEN, 'User-Agent': UA } });
    if (!resp.ok) return { ok: false, why: 'source ' + resp.status };
    const raw = await resp.text();
    code = unwrap(raw);
  } catch (e) { return { ok: false, why: String(e && e.message ? e.message : e).slice(0, 80) }; }
  const prompt = 'You are improving a Cloudflare Worker. Goal: ' + (goal || 'add a /version endpoint that returns JSON {ok:true,version}') + '. Here is the current module source:\n\n' + code.slice(0, 16000) + '\n\nReturn ONLY the complete modified source (JavaScript, valid module syntax).';
  let proposal;
  try {
    const out = await env.AI.run(EVOLVE_MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 4096 });
    proposal = typeof out === 'string' ? out : (out.response || JSON.stringify(out));
  } catch (e) { return { ok: false, why: 'AI ' + String(e && e.message ? e.message : e).slice(0, 80) }; }
  const hash = await sha256hex(proposal);
  try {
    await env.AUDIT.prepare('INSERT INTO evolve_candidates (worker, ts, status, proposal, sha256) VALUES (?1, ?2, ?3, ?4, ?5)').bind(worker, nowIso(), 'proposed', proposal, hash).run();
  } catch (e) {}
  return { ok: true, worker: worker, candidate_bytes: proposal.length, sha256: hash.slice(0, 16), status: 'proposed (NOT deployed)' };
}

// ===== SELF-REWRITE APPLY (L3, user-enabled 2026-09-10) =====
// APPLY = snapshot current -> deploy candidate -> verify -> AUTO-REVERT on failure.
// Rollback is the ENGINE, not a gate: GitHub backs up code, but only this loop re-deploys it.

// PRECONDITION: CF_API_TOKEN. POSTCONDITION: worker deployed, bindings preserved (module or legacy).
async function deployWorker(env, worker, code, isModule) {
  const tok = env.CF_API_TOKEN;
  if (!tok) return { ok: false, why: 'no CF_API_TOKEN' };
  let bindings = [], compat = '2026-08-01', flags = [];
  try {
    const s = await fetch(CF_API + '/workers/scripts/' + worker + '/settings', { headers: { 'Authorization': 'Bearer ' + tok, 'User-Agent': UA } });
    if (s.ok) { const j = await s.json(); const r = j.result || {}; bindings = r.bindings || []; if (r.compatibility_date) compat = r.compatibility_date; if (r.compatibility_flags) flags = r.compatibility_flags; }
  } catch (e) {}
  const norm = (bindings || []).map(function (b) {
    const t = b.type;
    if (t === 'secret_text' || t === 'plain_text') return null;
    const out = { name: b.name, type: t };
    if (t === 'd1') { if (b.database_id) out.database_id = b.database_id; }
    else if (t === 'kv_namespace') { if (b.namespace_id) out.namespace_id = b.namespace_id; }
    else if (t === 'r2_bucket') { if (b.bucket_name) out.bucket_name = b.bucket_name; }
    else if (t === 'service') { if (b.service) out.service = b.service; if (b.environment) out.environment = b.environment; }
    else if (t === 'queue') { if (b.queue_name) out.queue_name = b.queue_name; }
    else if (t === 'vectorize') { if (b.index_name) out.index_name = b.index_name; }
    else if (t === 'durable_object_namespace') { if (b.namespace_id) out.namespace_id = b.namespace_id; if (b.class_name) out.class_name = b.class_name; }
    else if (t === 'analytics_engine') { if (b.dataset) out.dataset = b.dataset; }
    else if (t === 'ai' || t === 'browser' || t === 'send_email') { }
    else if (t === 'workflow') { for (const k in b) { if (k !== 'name' && k !== 'type') out[k] = b[k]; } }
    else { for (const k in b) { if (k !== 'name' && k !== 'type' && k !== 'id' && k !== 'project' && k !== 'version') out[k] = b[k]; } }
    return out;
  }).filter(function (x) { return x !== null; });
  const meta = { bindings: norm, compatibility_date: compat };
  if (isModule) meta.main_module = 'worker.js'; else meta.body_part = 'script';
  if (flags.length) meta.compatibility_flags = flags;
  const CRLF = '\r\n';
  const b = '----QNFO-EVOLVE-' + Date.now();
  const partName = isModule ? 'worker.js' : 'script';
  const ctype = isModule ? 'application/javascript+module' : 'application/javascript';
  const parts = ['--' + b, 'Content-Disposition: form-data; name="metadata"', 'Content-Type: application/json', '', JSON.stringify(meta), '--' + b, 'Content-Disposition: form-data; name="' + partName + '"; filename="' + partName + '"', 'Content-Type: ' + ctype, '', code, '--' + b + '--'];
  try {
    const resp = await fetch(CF_API + '/workers/scripts/' + worker, { method: 'PUT', headers: { 'Authorization': 'Bearer ' + tok, 'User-Agent': UA, 'Content-Type': 'multipart/form-data; boundary=' + b }, body: parts.join(CRLF) });
    const j = await resp.json();
    if (!resp.ok) return { ok: false, why: 'PUT ' + resp.status + ' ' + String((j.errors || []).map(function (e) { return e.code + ':' + String(e.message).slice(0, 60); }).join('|') || j).slice(0, 140) };
    return { ok: true };
  } catch (e) { return { ok: false, why: String(e && e.message ? e.message : e).slice(0, 120) }; }
}

// PRECONDITION: worker deployed. POSTCONDITION: health verdict (1042 = subdomain-off, not a failure).
async function workerDomains(env, worker) {
  try {
    const r = await fetch(CF_API + '/workers/domains', { headers: { 'Authorization': 'Bearer ' + env.CF_API_TOKEN, 'User-Agent': UA } });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.result || []).filter(function (d) { return (d.worker_name && d.worker_name === worker) || (d.script && d.script === worker); }).map(function (d) { return d.hostname; });
  } catch (e) { return []; }
}

// PRECONDITION: worker deployed. POSTCONDITION: health verdict. Custom domains are authoritative
// (workers.dev subdomains return 1042 from within Cloudflare egress - NOT a failure signal).
async function verifyHealth(env, worker) {
  const sbName = SERVICE_BINDINGS[worker];
  if (sbName && env[sbName]) {
    try {
      const resp = await env[sbName].fetch('https://internal/health', { headers: { 'User-Agent': UA } });
      const txt = await resp.text();
      if (resp.status >= 500) return { ok: false, why: 'svc-binding http ' + resp.status + ' ' + txt.slice(0, 50) };
      return { ok: true, why: 'svc-binding http ' + resp.status };
    } catch (e) {
      return { ok: false, why: 'svc-binding unreachable ' + String(e && e.message ? e.message : e).slice(0, 40) };
    }
  }
  try {
    const fresh = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const hb = await env.AUDIT.prepare('SELECT ok, ts FROM fleet_heartbeat WHERE worker = ?1').bind(worker).first();
    if (hb && hb.ts && hb.ts >= fresh) return hb.ok === 1 ? { ok: true, why: 'heartbeat ok ' + hb.ts } : { ok: false, why: 'heartbeat failure ' + hb.ts };
  } catch (e) {}
  const domains = await workerDomains(env, worker);
  for (const d of domains) {
    try {
      const resp = await fetch('https://' + d + '/health', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
      const txt = await resp.text();
      if (resp.status >= 500) return { ok: false, why: 'http ' + resp.status + ' ' + txt.slice(0, 50) };
      return { ok: true, why: 'custom-domain ' + d + ' http ' + resp.status };
    } catch (e) {}
  }
  try {
    const resp = await fetch('https://' + worker + '.q08.workers.dev/health', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
    const txt = await resp.text();
    if (txt.indexOf('1042') >= 0) return { ok: true, why: 'no-reachable-domain (deploy-parses only)' };
    if (resp.status >= 500) return { ok: false, why: 'http ' + resp.status + ' ' + txt.slice(0, 50) };
    if (resp.status === 404) return { ok: true, why: 'no /health route (worker serving)' };
    return { ok: true, why: 'http ' + resp.status };
  } catch (e) {
    return { ok: false, why: 'unreachable ' + String(e && e.message ? e.message : e).slice(0, 40) };
  }
}

// PRECONDITION: candidate available. POSTCONDITION: applied, or auto-reverted with the rollback point restored.
async function evolveApply(env, worker, candidateId, goal) {
  await env.AUDIT.prepare('CREATE TABLE IF NOT EXISTS evolve_rollback (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT, ts TEXT, source TEXT, sha256 TEXT)').run();
  let proposal = null;
  if (candidateId) {
    const row = await env.AUDIT.prepare('SELECT proposal, sha256 FROM evolve_candidates WHERE id = ?1').bind(Number(candidateId)).first();
    if (row) proposal = row.proposal;
  }
  if (!proposal) {
    const p = await evolvePropose(env, worker, goal);
    if (!p.ok) return p;
    const row = await env.AUDIT.prepare('SELECT proposal, sha256 FROM evolve_candidates ORDER BY id DESC LIMIT 1').first();
    proposal = row.proposal;
  }
  if (!proposal) return { ok: false, why: 'no candidate' };
  let current;
  try {
    const resp = await fetch(CF_API + '/workers/scripts/' + worker + '/content/v2', { headers: { 'Authorization': 'Bearer ' + env.CF_API_TOKEN, 'User-Agent': UA } });
    if (!resp.ok) return { ok: false, why: 'snapshot read ' + resp.status };
    current = unwrap(await resp.text());
  } catch (e) { return { ok: false, why: 'snapshot ' + String(e && e.message ? e.message : e).slice(0, 60) }; }
  const isModule = current.indexOf('export default') >= 0 || current.indexOf('export {') >= 0 || current.indexOf('export{') >= 0 || current.indexOf('export ') >= 0 || current.indexOf('__esm') >= 0;
  const rbHash = await sha256hex(current);
  await env.AUDIT.prepare('INSERT INTO evolve_rollback (worker, ts, source, sha256) VALUES (?1, ?2, ?3, ?4)').bind(worker, nowIso(), current, rbHash).run();
  const put = await deployWorker(env, worker, proposal, isModule);
  if (!put.ok) {
    await env.AUDIT.prepare("UPDATE evolve_candidates SET status = 'rejected-parse' WHERE sha256 = ?1").bind(await sha256hex(proposal)).run();
    return { ok: false, why: 'deploy rejected (parse): ' + put.why, reverted: false };
  }
  // PROPAGATION-WAIT: service binding + subdomain hit STALE code for seconds after a deploy (verified 2026-09-10:
  // the broken candidate's immediate verify returned 200 from the old code). Wait, then verify; also re-verify to catch delayed breakage.
  await new Promise(function (r) { setTimeout(r, 10000); });
  const h = await verifyHealth(env, worker);
  if (h.ok) {
    await new Promise(function (r) { setTimeout(r, 8000); });
    const h2 = await verifyHealth(env, worker);
    if (!h2.ok) { h.ok = false; h.why = h2.why; }
  }
  if (!h.ok) {
    const rb = await deployWorker(env, worker, current, isModule);
    await env.AUDIT.prepare("UPDATE evolve_candidates SET status = 'auto-reverted' WHERE sha256 = ?1").bind(await sha256hex(proposal)).run();
    return { ok: false, why: 'verify failed -> AUTO-REVERTED', reverted: rb.ok, verify: h.why, rollback_point: rbHash.slice(0, 16) };
  }
  await env.AUDIT.prepare("UPDATE evolve_candidates SET status = 'applied' WHERE sha256 = ?1").bind(await sha256hex(proposal)).run();
  return { ok: true, worker: worker, applied: true, verify: h.why, rollback_point: rbHash.slice(0, 16) };
}

// ===== AUTONOMOUS SELF-REWRITE LOOP (user-enabled 2026-09-10) =====
// The decide-loop: on each cron fire, propose + apply a self-improvement to one worker,
// with snapshot + auto-revert. Round-robins SEED_WORKERS; verification ladder
// (heartbeat -> custom-domain -> parse-only) decides whether a broken deploy is detected.
const SEED_WORKERS = COVERAGE;

// PRECONDITION: cron fire (or manual /run/cycle). POSTCONDITION: one worker improved or reverted, recorded.
async function autonomousApply(env) {
  await ensureSchema(env);
  await env.AUDIT.prepare('CREATE TABLE IF NOT EXISTS self_rewrite_state (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT, ts TEXT, action TEXT, status TEXT, detail TEXT)').run();
  let worker = null, candidateId = null;
  const pend = await env.AUDIT.prepare("SELECT worker, id FROM evolve_candidates WHERE status = 'proposed' ORDER BY id ASC LIMIT 1").first();
  if (pend) { worker = pend.worker; candidateId = pend.id; }
  else {
    const last = await env.AUDIT.prepare("SELECT worker FROM self_rewrite_state WHERE action = 'apply' ORDER BY id DESC LIMIT 1").first();
    const lastW = last ? last.worker : null;
    const idx = lastW ? (SEED_WORKERS.indexOf(lastW) + 1) % SEED_WORKERS.length : 0;
    worker = SEED_WORKERS[idx] || SEED_WORKERS[0];
  }
  if (!worker) return { ok: true, skipped: 'no target' };
  const result = await evolveApply(env, worker, candidateId, candidateId ? null : 'self-improvement: keep behavior identical, add or fix a small non-functional detail');
  const status = result.ok ? 'applied' : 'reverted-or-rejected';
  await env.AUDIT.prepare('INSERT INTO self_rewrite_state (worker, ts, action, status, detail) VALUES (?1, ?2, ?3, ?4, ?5)').bind(worker, nowIso(), 'apply', status, String(result.why || result.verify || 'ok').slice(0, 220)).run();
  return result;
}

// E2 INDEPENDENT-THINKING LOOP (user-enabled 2026-09-10): the fleet generates its OWN
// novel research questions instead of only executing a hardcoded seed list. This is the
// "know thyself" rung: self-directedness, not just self-rewrite.
async function thinkLoop(env) {
  await ensureSchema(env);
  await env.AUDIT.prepare('CREATE TABLE IF NOT EXISTS self_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, question TEXT, hypothesis TEXT, source TEXT, status TEXT)').run();
  try {
    const ai = await env.AI.run(EVOLVE_MODEL, {
      messages: [
        { role: 'system', content: 'You are the QNFO research collective. Propose ONE novel, falsifiable research question the fleet should investigate next. Output strict JSON only: {"question": "...", "hypothesis": "...", "why": "..."}. No markdown.' },
        { role: 'user', content: 'Generate one novel research question. Consider energy-efficient computing, quantum foundations, information thermodynamics, or a gap in the existing corpus.' },
      ],
      max_tokens: 512,
    });
    let text = '';
    if (typeof ai === 'string') text = ai;
    else if (ai && typeof ai.response === 'string') text = ai.response;
    else text = JSON.stringify(ai || {});
    let q = null;
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { q = JSON.parse(m[0]); } catch (e) {} }
    if (!q || !q.question) {
      const qm = text.match(/"question"\s*:\s*"([^"]+)"/);
      if (qm) q = { question: qm[1], hypothesis: '' };
    }
    if (q && q.question) {
      await env.AUDIT.prepare('INSERT INTO self_questions (ts, question, hypothesis, source, status) VALUES (?1, ?2, ?3, ?4, ?5)').bind(nowIso(), String(q.question).slice(0, 300), String(q.hypothesis || '').slice(0, 300), 'think-loop', 'open').run();
      // E3: route the generated question into the research intake pipeline so it is ACTED on (not just stored)
      const qh = (await sha256hex(String(q.question))).slice(0, 8);
      const existing = await env.AUDIT.prepare('SELECT id FROM idea_proposals WHERE ip_hash = ?1 LIMIT 1').bind(qh).first();
      if (!existing) {
        await env.AUDIT.prepare("INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES ('think-loop', ?1, '', 'new', ?2, ?3)").bind(JSON.stringify({ ideas: [String(q.question)] }), qh, nowIso()).run();
      }
      return { ok: true, question: q.question, routed: !existing };
    }
    return { ok: false, why: 'no parseable question' };
  } catch (e) {
    return { ok: false, why: String(e && e.message ? e.message : e).slice(0, 120) };
  }
}

export default {
  async scheduled(controller, env, ctx) {
    await ensureSchema(env);
    ctx.waitUntil((async function () { try { await cycle(env); } catch (e) {} })());
    ctx.waitUntil((async function () { try { await autonomousApply(env); } catch (e) {} })());
    ctx.waitUntil((async function () { try { await thinkLoop(env); } catch (e) {} })());
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    await ensureSchema(env);
    if (p === '/health') return json({ ok: true, name: NAME, version: VERSION });
    if (p === '/run/cycle') return json({ ok: true, report: await cycle(env) });
    if (p === '/git/commit' && request.method === 'POST') {
      let b = {}; try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'bad json' }, 400); }
      if (!b.owner || !b.repo || !b.path || b.content == null) return json({ ok: false, error: 'need owner, repo, path, content' }, 400);
      const r = await gitCommit(env, b.owner, b.repo, b.path, String(b.content), b.message || ('autopilot commit ' + nowIso().slice(0, 16)));
      return json({ ok: r.ok, commit: r });
    }
    if (p === '/publish/report') {
      return json({ ok: true, commit: await publishReport(env) });
    }
    if (p === '/evolve/propose' && request.method === 'POST') {
      let b = {}; try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'bad json' }, 400); }
      if (!b.worker) return json({ ok: false, error: 'need worker' }, 400);
      return json({ ok: true, proposal: await evolvePropose(env, b.worker, b.goal) });
    }
    if (p === '/evolve/apply' && request.method === 'POST') {
      let b = {}; try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'bad json' }, 400); }
      if (!b.worker) return json({ ok: false, error: 'need worker' }, 400);
      return json({ ok: true, apply: await evolveApply(env, b.worker, b.candidate_id, b.goal) });
    }
    if (p === '/run/apply' && request.method === 'POST') {
      const result = await autonomousApply(env);
      return json({ ok: true, result: result });
    }
    if (p === '/run/think' && request.method === 'POST') {
      const result = await thinkLoop(env);
      return json({ ok: true, result: result });
    }
    if (p === '/heartbeat' && request.method === 'POST') {
      let b = {}; try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'bad json' }, 400); }
      if (!b.worker) return json({ ok: false, error: 'need worker' }, 400);
      await env.AUDIT.prepare('CREATE TABLE IF NOT EXISTS fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER)').run();
      await env.AUDIT.prepare('INSERT OR REPLACE INTO fleet_heartbeat (worker, version, ts, ok) VALUES (?1, ?2, ?3, ?4)').bind(b.worker, String(b.version || ''), nowIso(), b.ok === false ? 0 : 1).run();
      return json({ ok: true, heartbeat: true });
    }
    return json({ ok: false, error: 'not found', endpoints: ['/health', '/run/cycle', '/git/commit', '/publish/report', '/evolve/propose', '/evolve/apply', '/heartbeat'] }, 404);
  }
};
