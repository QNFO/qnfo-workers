// qnfo-intent-orchestrator v1.2.0 — unified intent layer + autonomous research triage
// v1.2.0 (2026-09-02, R4): exact-match idempotency in handleIntent — an identical desire text
//   (calendar/email templates embed occurrence-specific start ISO / sender+ts) returns the prior
//   intent instead of inserting a duplicate row. Extends the research-only semantic dedupe to all types.
// POST /intent {desire, source?, device?} -> classify -> route:
//   note    -> embed + store in Vectorize (research: qnfo-ai-log, personal: personal-life)
//   task/event/email/reminder/research -> queued with parsed metadata
//   research -> async triage (ctx.waitUntil): noise filter, semantic dedup, AI merit scoring,
//     promotion to research_candidates when score >= 60
// GET /intents, GET /intents/stats, GET /digest, POST /digest/send (auth)
// Triage surface (auth): POST /triage/run, GET /triage/candidates, GET /triage/stats,
//   POST /triage/dispatch, POST /triage/sync, POST /triage/candidate
// Scheduled: 06:00 digest email; 06:30 triage batch + task sync + auto-dispatch (1 active task)
const NL = String.fromCharCode(10);
const VERSION = '1.2.0';
const ROUTER = 'https://qnfo-ai.q08.workers.dev';
const AGENT_ORCH = 'https://qnfo-agent-orchestrator.q08.workers.dev';
const PROMOTE_THRESHOLD = 60;
const DEDUP_SIM = 0.92;
const TRIAGE_MODEL = 'deepseek-v4-flash';

function ok(id, data) { return { jsonrpc: '2.0', id: id, result: data }; }

function auth(token, env) {
  const exp = env.INTENT_TOKEN;
  if (!exp || !token) return false;
  const a = new TextEncoder().encode(token);
  const b = new TextEncoder().encode(exp);
  if (a.byteLength !== b.byteLength) return false;
  let d = 0;
  for (let i = 0; i < a.byteLength; i++) d |= a[i] ^ b[i];
  return d === 0;
}

function clamp(s, n) { return String(s || '').slice(0, n); }

function classifyRules(desire) {
  const t = desire.toLowerCase();
  let type = 'note', domain = 'general', priority = 'medium', due = null;
  if (/(\d{4}-\d{2}-\d{2})/.test(desire)) due = RegExp.$1;
  else if (/tomorrow/.test(t)) due = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  if (/(went to|attended|visited|took part|completed)/.test(t)) type = 'activity';
  else if (/(remind|reminder|don't forget|do not forget)/.test(t)) type = 'reminder';
  else if (/(meeting|appointment|schedule|calendar|event|call with|call on|book |reserve)/.test(t)) type = 'event';
  else if (/(email|draft|send .*mail|reply to)/.test(t)) type = 'email';
  else if (/(task|todo|to-do|need to|must |should |prepare|finish|complete|write up)/.test(t)) type = 'task';
  else if (/(jot|note|idea|thought|remember this|write down)/.test(t)) type = 'note';
  if (/(research|paper|arxiv|experiment|quantum|ultrametric|physics|theorem|proof|publication|manuscript)/.test(t)) domain = 'research';
  else if (/(qwav|commercial|customer|client|lead|business|pricing|sales)/.test(t)) domain = 'qwav';
  else if (/(personal|home|family|trip|holiday|health|gym|dinner|weekend|amsterdam)/.test(t)) domain = 'personal';
  if (/(urgent|asap|today|immediately|critical|important)/.test(t)) priority = 'high';
  if (/(someday|maybe|eventually|one day)/.test(t)) priority = 'low';
  return { type, domain, priority, due };
}

async function classifyAI(env, desire) {
  try {
    const r = await env.QNFO_AI.fetch(ROUTER + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.RT },
      body: JSON.stringify({
        model: 'glm-5.2',
        messages: [
          { role: 'system', content: 'You classify a user desire into strict JSON: {"type":"note|task|event|email|reminder|research|activity|unknown","domain":"research|personal|qwav|general","priority":"low|medium|high","summary":"max 120 chars","due":"YYYY-MM-DD or null"}. Reply with the JSON object only.' },
          { role: 'user', content: clamp(desire, 1000) }
        ],
        max_tokens: 200
      })
    });
    const j = await r.json();
    const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const p = JSON.parse(m[0]);
    if (p && typeof p.type === 'string') return { type: p.type, domain: p.domain || 'general', priority: p.priority || 'medium', summary: clamp(p.summary, 120), due: p.due || null };
  } catch (e) {}
  return null;
}

async function storeNote(env, intent) {
  try {
    const text = intent.desire;
    const day = intent.created_at.slice(0, 10);
    if (intent.domain === 'personal') {
      const resp = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [clamp(text, 1000)] });
      const v = (resp.data || []).find(x => Array.isArray(x) && x.length === 768);
      if (v) await env.VZ_P.upsert([{ id: 'intent:' + intent.id, values: v, metadata: { doc: 'note', kind: 'intent', path: 'intents/' + day + '/' + intent.id + '.md', text: clamp(text, 800), ts: intent.created_at } }]);
    } else {
      const resp = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [clamp(text, 1000)] });
      const v = (resp.data || []).find(x => Array.isArray(x) && x.length === 768);
      if (v) await env.VZ_R.upsert([{ id: 'intent:' + intent.id, values: v, metadata: { doc: 'note', kind: 'intent', path: 'intents/' + day + '/' + intent.id + '.md', text: clamp(text, 800), ts: intent.created_at } }]);
    }
  } catch (e) {}
}

async function handleIntent(env, body, source, device) {
  const desire = clamp(body.desire, 4000);
  if (!desire) return { error: 'desire required' };
  const ai = await classifyAI(env, desire);
  const cls = ai || classifyRules(desire);
  const id = 'int-' + Math.random().toString(16).slice(2, 10) + Date.now().toString(36);
  const now = new Date().toISOString();
  const type = (['note', 'task', 'event', 'email', 'reminder', 'research', 'activity', 'unknown'].includes(cls.type) ? cls.type : 'note');
  const domain = (['research', 'personal', 'qwav', 'general'].includes(cls.domain) ? cls.domain : 'general');
  const status = type === 'note' ? 'done' : 'pending';
  // v1.2.0 exact-match idempotency: identical desire (deterministic sync templates incl. occurrence
  // start / sender+ts) => return the existing intent instead of duplicating (no re-embed, no re-digest).
  const dupRow = await env.D1.prepare("SELECT id FROM intents WHERE desire = ?1 AND status NOT IN ('rejected','deduped') ORDER BY created_at ASC LIMIT 1").bind(desire).all().catch(() => null);
  if (dupRow && dupRow.results && dupRow.results.length) {
    return { id: dupRow.results[0].id, duplicate: true, dup_of: dupRow.results[0].id, type, domain, status };
  }
  await env.D1.prepare(
    'INSERT INTO intents (id, desire, source, device, type, domain, priority, summary, due, status, wbs_code, created_at, processed_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)'
  ).bind(id, desire, clamp(source, 60), clamp(device, 60), type, domain, cls.priority, cls.summary || '', cls.due || null, status, null, now, null).run();
  const intent = { id, desire, source, device, type, domain, priority: cls.priority, summary: cls.summary || '', due: cls.due || null, status, created_at: now };
  if (type === 'note') {
    await storeNote(env, intent);
    await env.D1.prepare("UPDATE intents SET processed_at=?1 WHERE id=?2").bind(now, id).run();
    intent.status = 'done';
  }
  if (type === 'activity') {
    try {
      const when = cls.due || now.slice(0, 10);
      await env.PLS.fetch('https://personal-life-search.q08.workers.dev/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Index-Token': env.INDEX_TOKEN },
        body: JSON.stringify({ items: [{ doc: 'activity', date: when, title: (cls.summary || desire.slice(0, 120)), category: domain === 'research' ? 'research' : 'other', venue: '', notes: desire.slice(0, 500) }] })
      });
      status = 'done';
      intent.status = 'done';
      await env.D1.prepare("UPDATE intents SET processed_at=?1 WHERE id=?2").bind(now, id).run();
    } catch (e) {}
  }
  return intent;
}

function digestLines(intents) {
  const out = [];
  const notes = intents.filter(i => i.type === 'note');
  const pending = intents.filter(i => i.type !== 'note');
  out.push('QNFO intent digest - ' + new Date().toISOString().slice(0, 10));
  out.push('');
  if (notes.length) out.push('Captured notes: ' + notes.length + ' (stored in Vectorize)');
  if (pending.length) {
    out.push('Pending:');
    for (const p of pending) out.push('- [' + p.type + '] ' + (p.summary || p.desire.slice(0, 80)) + (p.due ? ' (due ' + p.due + ')' : ''));
  }
  if (!notes.length && !pending.length) out.push('No new intents.');
  return out.join(NL);
}

async function sendDigest(env, subject, text) {
  const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + env.CF_ACCOUNT + '/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.CF_TOKEN },
    body: JSON.stringify({
      personalization: [{ to: [{ email: env.DIGEST_TO }] }],
      from: { email: env.DIGEST_FROM, name: 'QNFO Agent' },
      subject: subject,
      text: text
    })
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, success: !!j.success, result: j.result || j.errors || null };
}
// ── v1.1: autonomous research triage ──────────────────────────────────────
const NOISE_RE = [
  /^call (the )?[a-z_]+( tool)?(\s|$)/i,
  /(email_check|express_intent|intents_list|social_compose|search_research|search_papers tool)/i,
  /output the (complete )?raw json/i,
  /^reply with the single word/i,
  /^give this conversation a name/i,
  /^max \d+ chars/i,
  /based on the chat history/i,
  /rotation verification/i,
  /redirect probe/i,
  /auto-express block/i,
  /wrapped in/i,
  /^ok$/i
];

function isNoise(text) {
  const t = String(text || '');
  return NOISE_RE.some(function (re) { re.lastIndex = 0; return re.test(t); });
}

let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await env.D1.prepare('CREATE TABLE IF NOT EXISTS research_candidates (id TEXT PRIMARY KEY, cluster_key TEXT, question TEXT, merit INTEGER, impact INTEGER, novelty INTEGER, feasibility INTEGER, score INTEGER, intent_ids TEXT, status TEXT DEFAULT \'promoted\', agent_task_id TEXT, wbs_code TEXT, created_at TEXT, processed_at TEXT)').run();
      await env.D1.prepare('CREATE INDEX IF NOT EXISTS idx_rc_status ON research_candidates(status)').run();
      await env.D1.prepare('CREATE INDEX IF NOT EXISTS idx_rc_cluster ON research_candidates(cluster_key)').run();
      try { await env.D1.prepare('ALTER TABLE intents ADD COLUMN noise INTEGER DEFAULT 0').run(); } catch (e) {}
      try { await env.D1.prepare('ALTER TABLE intents ADD COLUMN dup_of TEXT').run(); } catch (e) {}
    })().catch(e => { schemaReady = null; console.log('schema err', e && e.message || e); });
  }
  return schemaReady;
}

async function triageAI(env, desire) {
  try {
    const r = await env.QNFO_AI.fetch(ROUTER + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.RT },
      body: JSON.stringify({
        model: TRIAGE_MODEL,
        messages: [
          { role: 'system', content: 'You are the QNFO idea-triage evaluator for an autonomous research pipeline. Evaluate the user idea. Reply with STRICT JSON only: {"is_noise":bool,"question":"normalized research question, max 140 chars","cluster_key":"short program tag: jpcub|ultrametric|qwav|platform|other","technical_merit":0-100,"impact_potential":0-100,"novelty":0-100,"feasibility":0-100}. technical_merit: scientific substance, precision, testability. impact_potential: likelihood to yield citable publications and visibility. novelty: distance from well-known results. feasibility: realistic for autonomous research in the QNFO program (quantum information, energy benchmarks, ultrametric physics, knowledge infrastructure). is_noise=true ONLY for agent tool-call instructions, meta-prompts, pipeline probes, or non-research chatter.' },
          { role: 'user', content: clamp(desire, 1000) }
        ],
        max_tokens: 300
      })
    });
    const j = await r.json();
    const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const p = JSON.parse(m[0]);
    const num = function (x, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(Number(x) || 0))); };
    return {
      is_noise: !!p.is_noise,
      question: clamp(String(p.question || desire).slice(0, 140), 140),
      cluster_key: clamp(String(p.cluster_key || 'other').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40), 40) || 'other',
      merit: num(p.technical_merit, 0, 100),
      impact: num(p.impact_potential, 0, 100),
      novelty: num(p.novelty, 0, 100),
      feasibility: num(p.feasibility, 0, 100)
    };
  } catch (e) { return null; }
}

function scoreOf(t) { return Math.round(0.35 * t.merit + 0.35 * t.impact + 0.15 * t.novelty + 0.15 * t.feasibility); }

async function storeIntentEmbed(env, row) {
  try {
    const resp = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [clamp(row.desire, 1000)] });
    const v = (resp.data || []).find(x => Array.isArray(x) && x.length === 768);
    if (!v) return;
    const day = (row.created_at || '').slice(0, 10);
    if (row.domain === 'personal') {
      await env.VZ_P.upsert([{ id: 'intent:' + row.id, values: v, metadata: { doc: 'intent', kind: 'intent', path: 'intents/' + day + '/' + row.id + '.md', text: clamp(row.desire, 800), ts: row.created_at } }]);
    } else {
      await env.VZ_R.upsert([{ id: 'intent:' + row.id, values: v, metadata: { doc: 'intent', kind: 'intent', path: 'intents/' + day + '/' + row.id + '.md', text: clamp(row.desire, 800), ts: row.created_at } }]);
    }
  } catch (e) {}
}

async function findDuplicate(env, row) {
  try {
    const resp = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [clamp(row.desire, 1000)] });
    const v = (resp.data || []).find(x => Array.isArray(x) && x.length === 768);
    if (!v) return null;
    const q = await env.VZ_R.query(v, { topK: 1, returnMetadata: 'all' });
    const m = (q.matches || [])[0];
    if (m && typeof m.score === 'number' && m.score >= DEDUP_SIM && m.id && String(m.id).startsWith('intent:')) return String(m.id).slice(7);
  } catch (e) {}
  return null;
}

async function triageIntent(env, row) {
  const id = row.id;
  const lock = await env.D1.prepare("UPDATE intents SET status='triaging' WHERE id=? AND status='pending'").bind(id).run();
  if (!lock.meta.changes) return { id, skipped: true };
  const now = new Date().toISOString();
  try {
    if (isNoise(row.desire)) {
      await env.D1.prepare("UPDATE intents SET status='rejected', noise=1, processed_at=? WHERE id=?").bind(now, id).run();
      return { id, verdict: 'rejected' };
    }
    const dup = await findDuplicate(env, row);
    if (dup) {
      await env.D1.prepare("UPDATE intents SET status='deduped', dup_of=?, processed_at=? WHERE id=?").bind(dup, now, id).run();
      return { id, verdict: 'deduped', dup_of: dup };
    }
    const t = await triageAI(env, row.desire);
    if (t && t.is_noise) {
      await env.D1.prepare("UPDATE intents SET status='rejected', noise=1, processed_at=? WHERE id=?").bind(now, id).run();
      return { id, verdict: 'rejected', by: 'ai' };
    }
    if (!t) {
      await env.D1.prepare("UPDATE intents SET status='pending' WHERE id=? AND status='triaging'").bind(id).run();
      return { id, verdict: 'deferred' };
    }
    const score = scoreOf(t);
    if (score >= PROMOTE_THRESHOLD) {
      const cid = 'cand-' + Math.random().toString(16).slice(2, 10) + Date.now().toString(36);
      await env.D1.prepare('INSERT INTO research_candidates (id, cluster_key, question, merit, impact, novelty, feasibility, score, intent_ids, status, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)')
        .bind(cid, t.cluster_key, t.question, t.merit, t.impact, t.novelty, t.feasibility, score, JSON.stringify([id]), 'promoted', now).run();
      await env.D1.prepare("UPDATE intents SET status='triaged', processed_at=? WHERE id=?").bind(now, id).run();
      await storeIntentEmbed(env, row);
      return { id, verdict: 'promoted', candidate: cid, score, question: t.question };
    }
    await env.D1.prepare("UPDATE intents SET status='triaged', processed_at=? WHERE id=?").bind(now, id).run();
    await storeIntentEmbed(env, row);
    return { id, verdict: 'below-threshold', score };
  } catch (e) {
    await env.D1.prepare("UPDATE intents SET status='pending' WHERE id=? AND status='triaging'").bind(id).run();
    return { id, verdict: 'error', error: String(e && e.message || e).slice(0, 200) };
  }
}

async function runBatchTriage(env) {
  await ensureSchema(env);
  const rows = await env.D1.prepare("SELECT * FROM intents WHERE status='pending' AND type='research' ORDER BY created_at DESC LIMIT 40").all();
  const out = [];
  for (const row of rows.results) out.push(await triageIntent(env, row));
  const counts = { scanned: out.length, promoted: 0, rejected: 0, deduped: 0, below: 0, deferred: 0, skipped: 0, errors: 0 };
  for (const o of out) {
    if (o.verdict === 'promoted') counts.promoted++;
    else if (o.verdict === 'rejected') counts.rejected++;
    else if (o.verdict === 'deduped') counts.deduped++;
    else if (o.verdict === 'below-threshold') counts.below++;
    else if (o.verdict === 'deferred') counts.deferred++;
    else if (o.skipped) counts.skipped++;
    else counts.errors++;
  }
  return { counts, results: out };
}

function researchPrompt(c) {
  return [
    'QNFO research brief - autonomous pipeline task.',
    'Research question: ' + c.question,
    '',
    'Use your tools to gather primary evidence:',
    '1) arxiv_search and web_search with at least 3 distinct query formulations.',
    '2) query_graph (stats, neighbors) and get_paper_context for QNFO corpus prior work.',
    '3) For quantitative questions, give estimates with stated assumptions and derivation steps.',
    '',
    'Deliverable (final result, scholarly prose):',
    '- Current state of knowledge (3-8 sentences).',
    '- Key quantitative estimates or bounds with assumptions.',
    '- 2-5 open research questions this idea could answer.',
    '- Top 5 citations (arXiv id / slug / DOI).',
    'Use store_note for your findings. No meta-commentary about pipeline status.'
  ].join('\n');
}

async function dispatchCandidate(env, c) {
  if (!env.DISPATCH_TOKEN) return { dispatched: false, error: 'DISPATCH_TOKEN not configured' };
  const r = await fetch(AGENT_ORCH + '/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sync-Token': env.DISPATCH_TOKEN },
    body: JSON.stringify({ prompt: researchPrompt(c), max_steps: 6 })
  });
  if (!r.ok) return { dispatched: false, error: 'agent-http-' + r.status };
  const j = await r.json().catch(() => ({}));
  const tid = j.task_id || null;
  if (!tid) return { dispatched: false, error: 'agent-no-task-id' };
  const upd = await env.D1.prepare("UPDATE research_candidates SET status='dispatched', agent_task_id=?, processed_at=? WHERE id=? AND status='promoted'")
    .bind(tid, new Date().toISOString(), c.id).run();
  if (!upd.meta.changes) return { dispatched: false, error: 'candidate-not-promoted' };
  return { dispatched: true, candidate: c.id, question: c.question, agent_task_id: tid, poll: '/task/' + tid };
}

async function syncDispatched(env) {
  const rows = await env.D1.prepare("SELECT * FROM research_candidates WHERE status='dispatched'").all();
  const out = [];
  for (const c of rows.results) {
    if (!c.agent_task_id) continue;
    try {
      const r = await fetch(AGENT_ORCH + '/task/' + c.agent_task_id);
      if (!r.ok) { out.push({ id: c.id, task: c.agent_task_id, status: 'http-' + r.status }); continue; }
      const st = await r.json();
      if (st.status === 'completed') {
        await env.D1.prepare("UPDATE research_candidates SET status='research_completed', processed_at=? WHERE id=?").bind(new Date().toISOString(), c.id).run();
        out.push({ id: c.id, task: c.agent_task_id, status: 'research_completed' });
      } else if (st.status === 'failed') {
        await env.D1.prepare("UPDATE research_candidates SET status='research_failed', processed_at=? WHERE id=?").bind(new Date().toISOString(), c.id).run();
        out.push({ id: c.id, task: c.agent_task_id, status: 'research_failed' });
      } else {
        out.push({ id: c.id, task: c.agent_task_id, status: st.status });
      }
    } catch (e) { out.push({ id: c.id, task: c.agent_task_id, error: String(e && e.message || e).slice(0, 120) }); }
  }
  return out;
}

async function autoDispatch(env) {
  const active = await env.D1.prepare("SELECT COUNT(*) AS n FROM research_candidates WHERE status='dispatched'").first();
  if (active && active.n > 0) return { dispatched: false, reason: 'active-task-exists', active: active.n };
  const top = await env.D1.prepare("SELECT * FROM research_candidates WHERE status='promoted' ORDER BY score DESC LIMIT 1").first();
  if (!top) return { dispatched: false, reason: 'no-promoted-candidates' };
  return dispatchCandidate(env, top);
}
export default {
  async scheduled(event, env) {
    if (event.cron === '0 6 * * *') {
      const day = new Date().toISOString().slice(0, 10);
      const rows = await env.D1.prepare("SELECT * FROM intents WHERE substr(created_at,1,10) = ?1 AND status != 'done' AND status != 'rejected' AND status != 'deduped' AND status != 'triaged'").bind(day).all();
      const notes = await env.D1.prepare("SELECT COUNT(*) AS n FROM intents WHERE substr(created_at,1,10) = ?1 AND type='note'").bind(day).first();
      const lines = ['QNFO intent digest - ' + day, ''];
      if (notes && notes.n) lines.push('Captured notes: ' + notes.n + ' (stored in Vectorize)');
      if (rows.results.length) {
        lines.push('Pending:');
        for (const p of rows.results) lines.push('- [' + p.type + '] ' + (p.summary || p.desire.slice(0, 80)) + (p.due ? ' (due ' + p.due + ')' : ''));
      } else {
        lines.push('No pending items.');
      }
      await sendDigest(env, 'QNFO intent digest - ' + day, lines.join(NL));
    }
    if (event.cron === '30 6 * * *') {
      try {
        await ensureSchema(env);
        const t = await runBatchTriage(env);
        const s = await syncDispatched(env);
        const d = await autoDispatch(env);
        console.log('[triage-cron]', JSON.stringify({ counts: t.counts, sync: s.slice(0, 5), dispatch: d }).slice(0, 2500));
      } catch (e) {
        console.log('[triage-cron] error:', e && e.message || e);
      }
    }
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (path === '/health' && method === 'GET') {
      return new Response(JSON.stringify({ ok: true, worker: 'qnfo-intent-orchestrator', version: VERSION }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!auth(token, env)) return new Response('unauthorized', { status: 401, headers: cors });

    if (path === '/intent' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return new Response('bad json', { status: 400, headers: cors }); }
      const source = url.searchParams.get('source') || body.source || 'unknown';
      const device = url.searchParams.get('device') || body.device || 'unknown';
      const intent = await handleIntent(env, body, source, device);
      if (intent.error) return new Response(JSON.stringify(intent), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
      if (intent.type === 'research' && ctx && ctx.waitUntil) {
        ctx.waitUntil((async () => { await ensureSchema(env); await triageIntent(env, intent); })().catch(e => console.log('inline triage err', e && e.message || e)));
      }
      return new Response(JSON.stringify(intent), { status: 201, headers: { 'Content-Type': 'application/json', ...cors } });
    }
    if (path === '/intents' && method === 'GET') {
      const status = url.searchParams.get('status') || '';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 100);
      const rows = status
        ? await env.D1.prepare('SELECT * FROM intents WHERE status = ?1 ORDER BY created_at DESC LIMIT ?2').bind(status, limit).all()
        : await env.D1.prepare('SELECT * FROM intents ORDER BY created_at DESC LIMIT ?1').bind(limit).all();
      return new Response(JSON.stringify({ count: rows.results.length, intents: rows.results }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    if (path === '/intents/stats' && method === 'GET') {
      const rows = await env.D1.prepare('SELECT type, domain, status, COUNT(*) AS n FROM intents GROUP BY type, domain, status').all();
      return new Response(JSON.stringify({ stats: rows.results }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    if (path === '/digest' && method === 'GET') {
      const days = Math.max(parseInt(url.searchParams.get('days') || '1', 10) || 1, 1);
      const from = new Date(Date.now() - days * 864e5).toISOString();
      const rows = await env.D1.prepare('SELECT * FROM intents WHERE created_at >= ?1 ORDER BY created_at DESC LIMIT 50').bind(from).all();
      return new Response(JSON.stringify({ count: rows.results.length, digest: digestLines(rows.results) }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    if (path === '/digest/send' && method === 'POST') {
      const rows = await env.D1.prepare("SELECT * FROM intents WHERE status != ?1 ORDER BY created_at DESC LIMIT 50").bind('done').all();
      const text = digestLines(rows.results);
      const r = await sendDigest(env, 'QNFO intent digest - ' + new Date().toISOString().slice(0, 10), text);
      return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    if (path === '/triage/run' && method === 'POST') {
      try {
        const r = await runBatchTriage(env);
        return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json', ...cors } });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
      }
    }
    if (path === '/triage/sync' && method === 'POST') {
      const r = await syncDispatched(env);
      return new Response(JSON.stringify({ synced: r }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    if (path === '/triage/candidates' && method === 'GET') {
      const status = url.searchParams.get('status') || '';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 100);
      const rows = status
        ? await env.D1.prepare('SELECT * FROM research_candidates WHERE status = ?1 ORDER BY score DESC LIMIT ?2').bind(status, limit).all()
        : await env.D1.prepare('SELECT * FROM research_candidates ORDER BY score DESC LIMIT ?1').bind(limit).all();
      return new Response(JSON.stringify({ count: rows.results.length, candidates: rows.results }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    if (path === '/triage/stats' && method === 'GET') {
      const rc = await env.D1.prepare('SELECT status, COUNT(*) AS n FROM research_candidates GROUP BY status').all();
      const ic = await env.D1.prepare("SELECT status, COUNT(*) AS n FROM intents WHERE type='research' GROUP BY status").all();
      return new Response(JSON.stringify({ candidates: rc.results, research_intents: ic.results, promote_threshold: PROMOTE_THRESHOLD }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    if (path === '/triage/dispatch' && method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      let out;
      if (body.candidate_id) {
        const c = await env.D1.prepare('SELECT * FROM research_candidates WHERE id = ?1').bind(body.candidate_id).first();
        if (!c) return new Response(JSON.stringify({ error: 'candidate not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...cors } });
        out = await dispatchCandidate(env, c);
      } else {
        out = await autoDispatch(env);
      }
      return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    if (path === '/triage/candidate' && method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { return new Response('bad json', { status: 400, headers: cors }); }
      const allowed = ['promoted', 'dispatched', 'research_completed', 'research_failed', 'published', 'dismissed'];
      if (!body.candidate_id || !allowed.includes(body.status)) return new Response(JSON.stringify({ error: 'candidate_id and valid status required', allowed }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
      const upd = await env.D1.prepare('UPDATE research_candidates SET status=?, processed_at=? WHERE id=?').bind(body.status, new Date().toISOString(), body.candidate_id).run();
      return new Response(JSON.stringify({ ok: upd.meta.changes > 0, candidate_id: body.candidate_id, status: body.status }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    return new Response('not found', { status: 404, headers: cors });
  }
};
