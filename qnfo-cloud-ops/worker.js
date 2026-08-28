// qnfo-cloud-ops — SCHEDULED CLOUD OPERATIONS (no local scheduler, no local scripts, no user input)
// User directive 2026-08-28: ALL QNFO operations run entirely cloud-based.
// Cron triggers (Cloudflare edge, Amsterdam wall-clock):
//   0 8,14 * * 1-5   email-triage  — check all qnfo.org inboxes via qnfo-email worker,
//                                    classify, mark, send digest to DIGEST_TO
//   30 8 * * 1-5     briefing      — daily decision-item digest (D1 emails + intents + tasks)
//   0 10 * * 1-5     research-scan — arXiv scan on QNFO topics -> digest + D1 log
//   0 17 * * 5       weekly        — 7-day aggregate digest (email stats, queries, records)
//   0 6 * * 7        weekly-ops    — Cloudflare cost/analytics audit digest (COST-AUDIT-MISS-AI-1)
//   0 8 * * 1        portfolio-sync — portfolio-state snapshot digest
// Every job: fetch -> build text digest -> send via Cloudflare Email Sending (SEND_EMAIL)
// -> log to D1 qnfo-audit.audit_sessions. No local component in the loop.
const NL = String.fromCharCode(10);
const VERSION = '1.0.0';
const EMAIL_BASE = 'https://qnfo-email.internal';

function auth(token, env) {
  const exp = env.INFRA_TOKEN;
  if (!exp || !token) return false;
  const a = new TextEncoder().encode(token);
  const b = new TextEncoder().encode(exp);
  if (a.byteLength !== b.byteLength) return false;
  let d = 0;
  for (let i = 0; i < a.byteLength; i++) d |= a[i] ^ b[i];
  return d === 0;
}

async function cfEmail(env, path, opts = {}) {
  const url = new URL(EMAIL_BASE + path);
  const headers = { Authorization: 'Bearer ' + (env.EMAIL_API_KEY || '') };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const resp = await env.EMAIL.fetch(url.toString(), {
    method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let j = null; try { j = await resp.json(); } catch (e) { j = null; }
  if (!resp.ok) return { error: (j && j.error) || ('email svc HTTP ' + resp.status) };
  return j;
}

async function logRun(env, job, status, notes) {
  try {
    await env.AUDIT.prepare(
      'INSERT INTO audit_sessions (session_id, agent, start_time, end_time, tasks_completed, tasks_total, notes) VALUES (?1,?2,?3,?4,?5,?6,?7)'
    ).bind('cloud-ops-' + job + '-' + Date.now().toString(36), 'qnfo-cloud-ops',
      new Date().toISOString(), new Date().toISOString(), status === 'ok' ? 1 : 0, 1,
      JSON.stringify({ job, status, ...notes }).slice(0, 500)).run();
  } catch (e) {}
}

async function sendDigest(env, subject, text) {
  if (!env.SEND_EMAIL) return { error: 'SEND_EMAIL binding missing' };
  const to = env.DIGEST_TO || 'rwnquni@outlook.com';
  const r = await env.SEND_EMAIL.send({
    to,
    from: { email: 'alerts@qnfo.org', name: 'QNFO Ops' },
    subject,
    text,
  });
  return { ok: true, messageId: r && r.messageId, to };
}

// ── email-triage: check inboxes, classify, mark, digest ─────────────────────
async function jobEmailTriage(env) {
  const recent = await cfEmail(env, '/emails/recent?limit=30&status=processed');
  if (recent.error) return { status: 'error', notes: { error: recent.error } };
  const emails = recent.emails || [];
  const action = [], noise = [];
  const SPAM_SENDERS = ['glintopenaccess', 'paperworkspot', 'mdpi', 'webofproceedings'];
  const SYS_PAT = /dmarc|srs0|bounce|cf-bounce|noreply|no-reply|mailer-daemon|rspamd/i;
  for (const e of emails) {
    const s = String(e.sender || '');
    const subj = String(e.subject || '');
    if (SPAM_SENDERS.some(x => s.includes(x))) { noise.push(e); continue; }
    if (SYS_PAT.test(s)) { noise.push(e); continue; }
    if (/^srs/i.test(s)) { noise.push(e); continue; }
    action.push(e);
  }
  for (const e of noise) {
    try { await cfEmail(env, '/emails/status', { method: 'PATCH', body: { id: e.id, status: 'spam' } }); } catch (err) {}
  }
  const L = ['QNFO email triage — ' + new Date().toISOString().slice(0, 10), ''];
  L.push('Checked ' + emails.length + ' processed emails: ' + action.length + ' actionable, ' + noise.length + ' noise (marked spam).');
  if (action.length) {
    L.push('', 'ACTIONABLE:');
    for (const e of action.slice(0, 12)) {
      L.push('- id ' + e.id + ' | ' + (e.recipient || '') + ' <- ' + e.sender + ' | ' + String(e.subject || '').slice(0, 90));
    }
  } else {
    L.push('', 'No actionable inbound email.');
  }
  const d = await sendDigest(env, 'QNFO email triage — ' + new Date().toISOString().slice(0, 10), L.join(NL));
  return { status: 'ok', notes: { checked: emails.length, actionable: action.length, noise: noise.length, digest: d } };
}

// ── briefing: daily decision-item digest from D1 ────────────────────────────
async function jobBriefing(env) {
  const L = ['QNFO briefing — ' + new Date().toISOString().slice(0, 10), ''];
  let items = 0;
  try {
    const rows = await env.AUDIT.prepare(
      "SELECT id, sender, recipient, subject, status FROM emails WHERE status IN ('processed','read') AND received_at > datetime('now','-24 hours') ORDER BY id DESC LIMIT 15"
    ).all();
    const real = (rows.results || []).filter(e => !/dmarc|srs0|bounce|cf-bounce|rspamd/i.test(String(e.sender || '')));
    if (real.length) {
      items += real.length;
      L.push('Emails needing attention (' + real.length + '):');
      for (const e of real.slice(0, 10)) L.push('- id ' + e.id + ' | ' + e.sender + ' | ' + String(e.subject || '').slice(0, 80));
    }
  } catch (e) { L.push('email query error: ' + e.message); }
  try {
    const r = await env.AUDIT.prepare("SELECT id, type, summary, due, status FROM intents WHERE status='pending' ORDER BY created_at DESC LIMIT 10").all();
    if (r.results && r.results.length) {
      items += r.results.length;
      L.push('', 'Pending intents (' + r.results.length + '):');
      for (const i of r.results) L.push('- [' + i.type + '] ' + String(i.summary || '').slice(0, 80) + (i.due ? ' (due ' + i.due + ')' : ''));
    }
  } catch (e) { L.push('intent query error: ' + e.message); }
  if (!items) L.push('No decision items.');
  const d = await sendDigest(env, 'QNFO briefing — ' + new Date().toISOString().slice(0, 10), L.join(NL));
  return { status: 'ok', notes: { items, digest: d } };
}

// ── research-scan: arXiv scan on QNFO topics ────────────────────────────────
async function jobResearchScan(env) {
  const q = encodeURIComponent('(all:"ultrametric" OR all:"p-adic" OR all:"Bruhat-Tits" OR all:"quantum energy" OR all:"joules per solution" OR all:"quantum error correction" AND (cat:quant-ph OR cat:math-ph OR cat:hep-th))');
  let hits = [];
  try {
    const r = await fetch('https://export.arxiv.org/api/query?search_query=' + q + '&start=0&max_results=8&sortBy=submittedDate&sortOrder=descending', {
      headers: { 'User-Agent': 'Mozilla/5.0 (QNFO cloud ops)' },
    });
    const txt = await r.text();
    const entries = txt.split('<entry>').slice(1);
    for (const en of entries) {
      const t = (en.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
      const id = (en.match(/<id>[\s\S]*?arxiv\.org\/abs\/([^<]+)<\/id>/) || [])[1] || '';
      const pub = (en.match(/<published>([^<]+)<\/published>/) || [])[1] || '';
      if (t) hits.push({ id: id.trim(), title: t.replace(/\s+/g, ' ').trim().slice(0, 160), published: pub.slice(0, 10) });
    }
  } catch (e) { hits = [{ error: e.message }]; }
  const L = ['QNFO research scan — ' + new Date().toISOString().slice(0, 10), ''];
  L.push('Recent arXiv matches: ' + (hits.length || 0));
  for (const h of hits.slice(0, 8)) {
    if (h.error) { L.push('- error: ' + h.error); continue; }
    L.push('- ' + h.published + ' | ' + (h.id || '') + ' | ' + h.title);
  }
  try {
    await env.AUDIT.prepare(
      'CREATE TABLE IF NOT EXISTS research_scan_log (id TEXT PRIMARY KEY, ts TEXT, job TEXT, payload TEXT)'
    ).run();
    await env.AUDIT.prepare('INSERT INTO research_scan_log (id, ts, job, payload) VALUES (?1,?2,?3,?4)')
      .bind('scan-' + Date.now().toString(36), new Date().toISOString(), 'research-scan', JSON.stringify(hits).slice(0, 2000)).run();
  } catch (e) {}
  const d = await sendDigest(env, 'QNFO research scan — ' + new Date().toISOString().slice(0, 10), L.join(NL));
  return { status: 'ok', notes: { hits: hits.length, digest: d } };
}

// ── weekly: 7-day aggregate digest ──────────────────────────────────────────
async function jobWeekly(env) {
  const L = ['QNFO weekly summary — ' + new Date().toISOString().slice(0, 10), ''];
  try {
    const e = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM emails WHERE received_at > datetime('now','-7 days')").first();
    L.push('Emails (7d): ' + (e && e.n || 0));
  } catch (err) {}
  try {
    const q = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM ai_queries WHERE ts > datetime('now','-7 days')").first();
    L.push('AI queries (7d): ' + (q && q.n || 0));
  } catch (err) {}
  try {
    const i = await env.AUDIT.prepare("SELECT COUNT(*) AS n FROM intents WHERE created_at > datetime('now','-7 days')").first();
    L.push('Intents (7d): ' + (i && i.n || 0));
  } catch (err) {}
  try {
    if (env.QNFO_INFRA) {
      const r = await env.QNFO_INFRA.fetch('https://qnfo-infra.internal/records', { headers: { Authorization: 'Bearer ' + env.INFRA_TOKEN } });
      const j = await r.json();
      if (j && j.papers != null) L.push('Records: papers ' + j.papers + ', KG ' + ((j.kg && j.kg.nodes) || '?') + ' nodes');
    }
  } catch (err) {}
  const d = await sendDigest(env, 'QNFO weekly summary — ' + new Date().toISOString().slice(0, 10), L.join(NL));
  return { status: 'ok', notes: { digest: d } };
}

// ── weekly-ops: Cloudflare cost/analytics audit (COST-AUDIT-MISS-AI-1) ─────
async function jobWeeklyOps(env) {
  const L = ['QNFO cloud ops audit — ' + new Date().toISOString().slice(0, 10), ''];
  let cost = 0;
  try {
    if (env.QNFO_INFRA) {
      const an = await env.QNFO_INFRA.fetch('https://qnfo-infra.internal/analytics', { headers: { Authorization: 'Bearer ' + env.INFRA_TOKEN } }).then(r => r.json());
      const st = await env.QNFO_INFRA.fetch('https://qnfo-infra.internal/state', { headers: { Authorization: 'Bearer ' + env.INFRA_TOKEN } }).then(r => r.json());
      if (an && an.ai_30d && !an.ai_30d.error) {
        cost = an.ai_30d.est_cost_usd || 0;
        L.push('Workers AI (30d): ' + Math.round(an.ai_30d.neurons) + ' neurons, est. $' + cost);
      }
      if (an && an.workers_30d && !an.workers_30d.error) L.push('Worker invocations (30d): ' + an.workers_30d.requests);
      if (st && st.workers) L.push('Workers ' + st.workers.count + ', D1 ' + st.d1.count + ', R2 ' + (st.r2 && st.r2.count || 0) + ', Vectorize ' + (st.vectorize && st.vectorize.count || 0));
      if (st && st.gateway_logs && !st.gateway_logs.error) L.push('AI Gateway (last window): $' + st.gateway_logs.cost_usd);
    }
  } catch (e) { L.push('infra query error: ' + e.message); }
  if (cost > 90) L.push('', '⚠ COST ALERT: est. 30d Workers AI cost $' + cost + ' exceeds $90/30d spend-limit gate (rule 6f5c29f8).');
  const d = await sendDigest(env, 'QNFO cloud ops audit — ' + new Date().toISOString().slice(0, 10), L.join(NL));
  return { status: 'ok', notes: { est_cost_30d: cost, digest: d } };
}

// ── portfolio-sync: portfolio-state snapshot digest ─────────────────────────
async function jobPortfolioSync(env) {
  const L = ['QNFO portfolio snapshot — ' + new Date().toISOString().slice(0, 10), ''];
  try {
    const r = await env.PORTFOLIO.prepare("SELECT wbs_code, name, phase, status, zenodo_doi FROM program_registry ORDER BY wbs_order LIMIT 25").all();
    if (r.results && r.results.length) {
      L.push('Programs:');
      for (const p of r.results) L.push('- ' + (p.wbs_code || '') + ' ' + (p.name || '').slice(0, 60) + ' [phase ' + (p.phase || '?') + ', ' + (p.status || '') + ']');
    } else {
      L.push('(no program rows in qnfo-audit.programs)');
    }
  } catch (e) { L.push('portfolio query error: ' + e.message); }
  const d = await sendDigest(env, 'QNFO portfolio snapshot — ' + new Date().toISOString().slice(0, 10), L.join(NL));
  return { status: 'ok', notes: { digest: d } };
}

const JOBS = {
  'email-triage': jobEmailTriage,
  'briefing': jobBriefing,
  'research-scan': jobResearchScan,
  'weekly': jobWeekly,
  'weekly-ops': jobWeeklyOps,
  'portfolio-sync': jobPortfolioSync,
};

export default {
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    let job = null;
    if (cron === '0 8,14 * * 1-5') job = 'email-triage';
    else if (cron === '30 8 * * 1-5') job = 'briefing';
    else if (cron === '0 10 * * 1-5') job = 'research-scan';
    else if (cron === '0 17 * * 5') job = 'weekly';
    else if (cron === '0 6 * * 7') job = 'weekly-ops';
    else if (cron === '0 8 * * 1') job = 'portfolio-sync';
    if (!job || !JOBS[job]) { console.log('no job for cron', cron); return; }
    try {
      const out = await JOBS[job](env);
      await logRun(env, job, out.status, out.notes || {});
      console.log('cloud-ops', job, out.status, JSON.stringify(out.notes || {}).slice(0, 200));
    } catch (e) {
      await logRun(env, job, 'error', { error: e.message });
      console.error('cloud-ops', job, 'error', e.message);
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (path === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ ok: true, worker: 'qnfo-cloud-ops', version: VERSION, jobs: Object.keys(JOBS), crons: ['0 8,14 * * 1-5 email-triage', '30 8 * * 1-5 briefing', '0 10 * * 1-5 research-scan', '0 17 * * 5 weekly', '0 6 * * 7 weekly-ops', '0 8 * * 1 portfolio-sync'], bindings: { audit: !!env.AUDIT, portfolio: !!env.PORTFOLIO, email: !!env.EMAIL, email_key: !!env.EMAIL_API_KEY, qnfo_infra: !!env.QNFO_INFRA, send_email: !!env.SEND_EMAIL } }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!auth(token, env)) return new Response('unauthorized', { status: 401, headers: cors });
    if (path === '/run' && request.method === 'POST') {
      const job = (url.searchParams.get('job') || '').trim();
      if (!job || !JOBS[job]) return new Response(JSON.stringify({ error: 'unknown job: ' + job + ' (valid: ' + Object.keys(JOBS).join(',') + ')' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
      try {
        const out = await JOBS[job](env);
        await logRun(env, job, out.status, out.notes || {});
        return new Response(JSON.stringify({ ok: true, job, ...out }), { headers: { 'Content-Type': 'application/json', ...cors } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, job, error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
      }
    }
    return new Response('not found', { status: 404, headers: cors });
  }
};
