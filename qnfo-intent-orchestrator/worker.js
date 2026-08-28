// qnfo-intent-orchestrator — unified intent layer (Phase 1)
// POST /intent {desire, source?, device?} -> classify -> route:
//   note    -> embed + store in Vectorize (research: qnfo-ai-log, personal: personal-life)
//   task/event/email/reminder/research -> queued with parsed metadata
// GET /intents, GET /intents/stats, GET /digest, POST /digest/send (auth)
// Scheduled daily 06:00 UTC: digest email via Cloudflare Email Sending.
const NL = String.fromCharCode(10);
const VERSION = '1.0.0';
const ROUTER = 'https://qnfo-ai.q08.workers.dev';

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
  if (/(remind|reminder|don't forget|do not forget)/.test(t)) type = 'reminder';
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
          { role: 'system', content: 'You classify a user desire into strict JSON: {"type":"note|task|event|email|reminder|research|unknown","domain":"research|personal|qwav|general","priority":"low|medium|high","summary":"max 120 chars","due":"YYYY-MM-DD or null"}. Reply with the JSON object only.' },
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
  const type = (['note', 'task', 'event', 'email', 'reminder', 'research', 'unknown'].includes(cls.type) ? cls.type : 'note');
  const domain = (['research', 'personal', 'qwav', 'general'].includes(cls.domain) ? cls.domain : 'general');
  const status = type === 'note' ? 'done' : 'pending';
  await env.D1.prepare(
    'INSERT INTO intents (id, desire, source, device, type, domain, priority, summary, due, status, wbs_code, created_at, processed_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)'
  ).bind(id, desire, clamp(source, 60), clamp(device, 60), type, domain, cls.priority, cls.summary || '', cls.due || null, status, null, now, null).run();
  const intent = { id, desire, source, device, type, domain, priority: cls.priority, summary: cls.summary || '', due: cls.due || null, status, created_at: now };
  if (type === 'note') {
    await storeNote(env, intent);
    await env.D1.prepare("UPDATE intents SET processed_at=?1 WHERE id=?2").bind(now, id).run();
    intent.status = 'done';
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

export default {
  async scheduled(event, env) {
    if (event.cron === '0 6 * * *') {
      const day = new Date().toISOString().slice(0, 10);
      const rows = await env.D1.prepare("SELECT * FROM intents WHERE substr(created_at,1,10) = ?1 AND status != 'done'").bind(day).all();
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
  },
  async fetch(request, env) {
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
      const rows = await env.D1.prepare('SELECT * FROM intents WHERE status != ?1 ORDER BY created_at DESC LIMIT 50').bind('done').all();
      const text = digestLines(rows.results);
      const r = await sendDigest(env, 'QNFO intent digest - ' + new Date().toISOString().slice(0, 10), text);
      return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    return new Response('not found', { status: 404, headers: cors });
  }
};
