// qnfo-social - cloud-based Bluesky posting (AT Protocol) + AI compose. v0.5.2-checker-heal (2026-09-08): tolerant JSON parse + strict retry + agent_issue escalation (was v0.5.1-failopen).
// Secrets: BSKY_HANDLE, BSKY_APP_PASS, SOCIAL_TOKEN. D1: DB (qnfo-audit.social_threads). AI: env.AI.
// Cron posts oldest queued thread. /compose drafts a thread from title+abstract (draft -> approve -> queued).
var VERSION = '0.5.2-checker-heal';
const BSKY = 'https://bsky.social/xrpc';
const COMPOSE_MODEL = '@cf/deepseek-ai/deepseek-v4-flash-0731';

function truncate(text, max) {
  const pts = Array.from(String(text || ''));
  if (pts.length <= max) return String(text || '');
  return pts.slice(0, max).join('');
}

function auth(req, env) {
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!tok) return false;
  const check = (exp) => {
    if (!exp || tok.length !== exp.length) return false;
    let d = 0;
    for (let i = 0; i < tok.length; i++) d |= tok.charCodeAt(i) ^ exp.charCodeAt(i);
    return d === 0;
  };
  return (env.SOCIAL_TOKEN && check(env.SOCIAL_TOKEN)) || (env.GATEWAY_SOCIAL_TOKEN && check(env.GATEWAY_SOCIAL_TOKEN));
}

async function session(env) {
  const r = await fetch(BSKY + '/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (qnfo-social)' },
    body: JSON.stringify({ identifier: env.BSKY_HANDLE, password: env.BSKY_APP_PASS })
  });
  if (!r.ok) throw new Error('session ' + r.status);
  return r.json();
}

async function postText(s, text, reply) {
  const record = { text: truncate(text, 290), createdAt: new Date().toISOString() };
  if (reply) record.reply = reply;
  const r = await fetch(BSKY + '/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (qnfo-social)', 'Authorization': 'Bearer ' + s.accessJwt },
    body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record: record })
  });
  if (!r.ok) throw new Error('post ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

async function postThread(s, posts) {
  let root = null, parent = null;
  const uris = [];
  for (let i = 0; i < posts.length; i++) {
    const reply = i > 0 ? { root: root, parent: parent } : undefined;
    const res = await postText(s, posts[i], reply);
    uris.push(res.uri);
    if (i === 0) root = { uri: res.uri, cid: res.cid };
    parent = { uri: res.uri, cid: res.cid };
  }
  return uris;
}

function sanitizePosts(raw) {
  return (raw || []).map(function(x){ return truncate(String(x), 290); }).filter(function(x){ return x.trim(); });
}

function extractText(ai) {
  if (!ai) return '';
  if (typeof ai === 'string') return ai;
  if (typeof ai.response === 'string' && ai.response) return ai.response;
  var ch = (ai.choices && ai.choices[0]) || (ai.result && ai.result.choices && ai.result.choices[0]);
  if (ch) {
    if (ch.message && typeof ch.message.content === 'string') return ch.message.content;
    if (typeof ch.text === 'string') return ch.text;
  }
  return '';
}

async function checkThread(env, title, abstract, posts) {
  const base = [
    "Given a paper (title + abstract = ground truth) and a social media thread (candidate), list every claim in the thread that is NOT supported by the title or abstract.",
    "Check for: invented numbers, invented statistics, invented findings, overclaiming, misattribution, unsupported claims of being 'new' or 'first'.",
    "Ignore style: questions, hooks, calls to action, the DOI link, and generic phrases like 'read the paper'.",
    "Output ONLY a JSON array of issues, e.g. [{\"post\": 2, \"issue\": \"...\"}]. Output [] if the thread is fully faithful.",
    "PAPER: " + JSON.stringify({ title: title, abstract: abstract }),
    "THREAD: " + JSON.stringify(posts)
  ].join('\n');
  function parseIssues(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/```(?:json)?/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.filter(function(x){ return x && x.issue; });
    } catch (e) {}
    const lo = cleaned.indexOf('['), hi = cleaned.lastIndexOf(']');
    if (lo >= 0 && hi > lo) {
      try {
        const parsed = JSON.parse(cleaned.slice(lo, hi + 1));
        if (Array.isArray(parsed)) return parsed.filter(function(x){ return x && x.issue; });
      } catch (e2) {}
    }
    return null;
  }
  let text = extractText(await env.AI.run(COMPOSE_MODEL, { messages: [{ role: 'user', content: base }], max_tokens: 1000 })).trim();
  let issues = parseIssues(text);
  if (issues === null) {
    const retryText = extractText(await env.AI.run(COMPOSE_MODEL, { messages: [{ role: 'user', content: 'Reply with ONLY a JSON array. Nothing else.\n' + base }], max_tokens: 1000 })).trim();
    issues = parseIssues(retryText);
    if (issues === null) {
      const sample = String(retryText || text || '').slice(0, 150);
      await logAlert(env, 'checker', 'warn', 'checker output unusable after retry; posting without fact-check (fail-open): ' + sample);
      try {
        const dup = await env.DB.prepare("SELECT COUNT(*) n FROM agent_issues WHERE status='open' AND title LIKE 'SOCIAL-CHECKER-FAILOPEN%'").first();
        if (!dup || Number(dup.n) === 0) {
          const mx = await env.DB.prepare("SELECT COALESCE(MAX(id),0) m FROM agent_issues").first();
          await env.DB.prepare("INSERT INTO agent_issues (id, title, description, source, category, priority, status, linked_session, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))").bind(Number(mx.m) + 1, 'SOCIAL-CHECKER-FAILOPEN: fact-checker unusable after retry', 'checker empty or unparseable: ' + sample, 'qnfo-social', 'fleet-self-improve', 'medium', 'open', null).run();
        }
      } catch (eE) {}
      return [];
    }
  }
  return issues;
}

async function logAlert(env, source, level, message) {
  try {
    await env.DB.prepare("INSERT INTO alerts (source, level, message) VALUES (?,?,?)").bind(source, level, String(message).slice(0, 500)).run();
  } catch (e) {}
}

async function alertDigest(env) {
  try {
    const rows = await env.DB.prepare("SELECT id, source, level, message, created_at FROM alerts WHERE digested IS NULL ORDER BY id ASC LIMIT 100").all();
    const items = rows.results || [];
    if (!items.length) return;
    const summary = 'QNFO alerts digest ' + new Date().toISOString() + ' - ' + items.length + ' alert(s): ' + items.map(function(a){ return '[' + a.level + '] ' + a.source + ': ' + a.message; }).join(' | ');
    await env.DB.prepare("UPDATE alerts SET digested=1 WHERE id IN (SELECT id FROM alerts WHERE digested IS NULL ORDER BY id ASC LIMIT 100)").run();
    await logAlert(env, 'digest', 'info', 'digest emitted ' + items.length + ' alert(s)');
    console.log(summary);
  } catch (e) {
    await logAlert(env, 'digest', 'error', String(e).slice(0, 300));
  }
}

async function autoScan(env) {
  try {
    const q = 'metadata.creators.person_or_org.name:"Quni-Gudzinas"';
    const r = await fetch('https://zenodo.org/api/records?q=' + encodeURIComponent(q) + '&sort=mostrecent&size=15', {
      headers: { 'User-Agent': 'Mozilla/5.0 (qnfo-social)' }
    });
    if (!r.ok) { console.error('auto-scan zenodo fetch failed', r.status); return; }
    const d = await r.json();
    const hits = (d.hits && d.hits.hits) || [];
    const st = await env.DB.prepare("SELECT value FROM scan_state WHERE key='last_scanned'").first();
    const lastScanned = (st && st.value) || '2000-01-01T00:00:00.000000+00:00';
    let newest = lastScanned;
    let drafted = 0;
    for (const h of hits) {
      const created = h.created || '';
      if (created <= lastScanned) continue;
      const md = h.metadata || {};
      const title = String(md.title || '').slice(0, 300);
      const abstract = String(md.description || '').replace(/<[^>]+>/g, '').slice(0, 4000);
      const doi = String(h.doi || '');
      if (!title || !abstract || !doi) continue;
      const dup = await env.DB.prepare("SELECT id FROM social_threads WHERE doi=?").bind(doi).first();
      if (dup) continue;
      const prompt = [
        "Write a 5-post Bluesky thread that amplifies a research paper accurately.",
        "Rules:",
        "1. Post 1: a hook stating the core claim or a provocative question (why a reader should care).",
        "2. Post 2: the claim in plain language, faithful to the abstract (never invent or overclaim).",
        "3. Post 3: why/how it matters, in accessible terms.",
        "4. Post 4: how a reader can check it (falsifiability / open access) - invite scrutiny.",
        "5. Post 5: the DOI link then an open discussion question.",
        "Each post under 280 characters. No exclamation marks. No marketing hype. No invented numbers.",
        "Output ONLY the 5 posts, one per line, no numbering, no markdown.",
        "DOI: " + doi,
        "Title: " + title,
        "Abstract: " + abstract
      ].join(String.fromCharCode(10));
      const ai = await env.AI.run(COMPOSE_MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 2000 });
      const posts = sanitizePosts(extractText(ai).split(String.fromCharCode(10)));
      if (posts.length < 3) continue;
      const issues = await checkThread(env, title, abstract, posts);
      const status = issues.length === 0 ? 'queued' : 'draft';
      const slug = 'scan-' + (doi.split('/').pop() || Date.now().toString(36));
      await env.DB.prepare("INSERT OR IGNORE INTO social_threads (slug, title, doi, posts, status, notes) VALUES (?,?,?,?,?,?)").bind(slug, title, doi, JSON.stringify(posts.slice(0, 6)), status, issues.length ? JSON.stringify(issues) : null).run();
      if (issues.length) await logAlert(env, 'scan', 'warning', 'draft flagged for review: ' + slug + ' (' + issues.length + ' issue(s))');
      drafted++;
      if (created > newest) newest = created;
    }
    await env.DB.prepare("INSERT INTO scan_state (key, value) VALUES ('last_scanned', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(newest).run();
    console.log('auto-scan: drafted', drafted, 'draft threads; last_scanned', newest);
  } catch (e) {
    await logAlert(env, 'scan', 'error', String(e));
    console.error('auto-scan failed', String(e));
  }
}

export default {
  async scheduled(event, env) {
    if (event.cron === '0 7 * * *') { await alertDigest(env); return; }
    if (event.cron === '0 6 * * *') { await autoScan(env); return; }
    const row = await env.DB.prepare("SELECT * FROM social_threads WHERE status='queued' ORDER BY id ASC LIMIT 1").first();
    if (!row) return;
    try {
      await env.DB.prepare("UPDATE social_threads SET status='posting' WHERE id=? AND status='queued'").bind(row.id).run();
      const posts = JSON.parse(row.posts);
      if (!Array.isArray(posts) || !posts.length) throw new Error('bad posts payload');
      const s = await session(env);
      const uris = await postThread(s, posts);
      await env.DB.prepare("UPDATE social_threads SET status='posted', posted_at=datetime('now'), error=NULL WHERE id=?").bind(row.id).run();
      console.log('cron posted thread', row.slug, uris[0]);
    } catch (e) {
      await env.DB.prepare("UPDATE social_threads SET status='failed', error=?, retry_count=retry_count+1 WHERE id=?").bind(String(e).slice(0, 300), row.id).run();
      await logAlert(env, 'cron', 'error', 'cron post failed ' + row.slug + ': ' + String(e));
      console.error('cron post failed', row.slug, String(e));
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname, m = request.method;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (m === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (p === '/health') return new Response(JSON.stringify({ ok: true, worker: 'qnfo-social', version: VERSION, handle: env.BSKY_HANDLE }), { headers: { 'Content-Type': 'application/json', ...cors } });
    if (!auth(request, env)) return new Response('unauthorized', { status: 401, headers: cors });
    try {
      if (p === '/post' && m === 'POST') {
        const b = await request.json();
        const s = await session(env);
        const r = await postText(s, String(b.text || ''));
        return new Response(JSON.stringify({ ok: true, uri: r.uri }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/thread' && m === 'POST') {
        const b = await request.json();
        const posts = sanitizePosts(b.posts);
        if (!posts.length) return new Response(JSON.stringify({ error: 'no posts' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
        const s = await session(env);
        const uris = await postThread(s, posts);
        return new Response(JSON.stringify({ ok: true, root: uris[0], count: uris.length, uris: uris }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/threads' && m === 'GET') {
        const rows = await env.DB.prepare("SELECT id, slug, title, status, error, retry_count, posted_at, created_at FROM social_threads ORDER BY id DESC LIMIT 50").all();
        return new Response(JSON.stringify(rows.results || []), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/queue' && m === 'POST') {
        const b = await request.json();
        const posts = sanitizePosts(b.posts);
        await env.DB.prepare("INSERT OR IGNORE INTO social_threads (slug, title, posts, status) VALUES (?,?,?, 'queued')").bind(String(b.slug), String(b.title || ''), JSON.stringify(posts)).run();
        return new Response(JSON.stringify({ ok: true, slug: b.slug }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/compose' && m === 'POST') {
        const b = await request.json();
        const title = String(b.title || '').slice(0, 300);
        const abstract = String(b.abstract || '').slice(0, 4000);
        const doi = String(b.doi || '');
        if (!title || !abstract) return new Response(JSON.stringify({ error: 'title and abstract required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
        const prompt = [
          "Write a 5-post Bluesky thread that amplifies a research paper accurately.",
          "Rules:",
          "1. Post 1: a hook stating the core claim or a provocative question (why a reader should care).",
          "2. Post 2: the claim in plain language, faithful to the abstract (never invent or overclaim).",
          "3. Post 3: why/how it matters, in accessible terms.",
          "4. Post 4: how a reader can check it (falsifiability / open access) - invite scrutiny.",
          "5. Post 5: the DOI link then an open discussion question.",
          "Each post under 280 characters. No exclamation marks. No marketing hype. No invented numbers.",
          "Output ONLY the 5 posts, one per line, no numbering, no markdown.",
          "DOI: " + (doi || '(none provided)'),
          "Title: " + title,
          "Abstract: " + abstract
        ].join("\n");
        const ai = await env.AI.run(COMPOSE_MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 2000 });
        const text = extractText(ai);
        const posts = sanitizePosts(text.split("\n"));
        if (posts.length < 3) return new Response(JSON.stringify({ error: 'compose produced too few posts', raw: text.slice(0, 500) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
        const slug = String(b.slug || ('draft-' + Date.now().toString(36)));
        const issues = await checkThread(env, title, abstract, posts);
        const status = issues.length === 0 ? 'queued' : 'draft';
        await env.DB.prepare("INSERT INTO social_threads (slug, title, doi, posts, status, notes) VALUES (?,?,?,?,?,?)").bind(slug, title, doi, JSON.stringify(posts.slice(0, 6)), status, issues.length ? JSON.stringify(issues) : null).run();
        if (issues.length) await logAlert(env, 'compose', 'warning', 'draft flagged for review: ' + slug + ' (' + issues.length + ' issue(s))');
        return new Response(JSON.stringify({ ok: true, slug: slug, status: status, auto_approved: status === 'queued', issues: issues, posts: posts.slice(0, 6) }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/approve' && m === 'POST') {
        const b = await request.json();
        const row = await env.DB.prepare("SELECT * FROM social_threads WHERE slug=?").bind(String(b.slug)).first();
        if (!row) return new Response(JSON.stringify({ error: 'thread not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...cors } });
        await env.DB.prepare("UPDATE social_threads SET status='queued' WHERE slug=? AND status='draft'").bind(String(b.slug)).run();
        return new Response(JSON.stringify({ ok: true, slug: b.slug, status: 'queued' }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/broadcast' && m === 'POST') {
        const b = await request.json();
        const row = await env.DB.prepare("SELECT * FROM social_threads WHERE slug=?").bind(String(b.slug)).first();
        if (!row) return new Response(JSON.stringify({ error: 'thread not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...cors } });
        if (row.status === 'posted') return new Response(JSON.stringify({ error: 'already posted', status: row.status }), { status: 409, headers: { 'Content-Type': 'application/json', ...cors } });
        const posts = sanitizePosts(JSON.parse(row.posts));
        const s = await session(env);
        const uris = await postThread(s, posts);
        await env.DB.prepare("UPDATE social_threads SET status='posted', posted_at=datetime('now'), error=NULL WHERE id=?").bind(row.id).run();
        return new Response(JSON.stringify({ ok: true, root: uris[0], count: uris.length, uris: uris }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/scan' && m === 'POST') {
        await autoScan(env);
        const drafts = await env.DB.prepare("SELECT id, slug, title, doi FROM social_threads WHERE status='draft' ORDER BY id DESC LIMIT 10").all();
        return new Response(JSON.stringify({ ok: true, drafted: (drafts.results || []).length, drafts: drafts.results || [] }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/alerts' && m === 'GET') {
        const rows = await env.DB.prepare("SELECT id, source, level, message, created_at, digested FROM alerts ORDER BY id DESC LIMIT 50").all();
        return new Response(JSON.stringify(rows.results || []), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/digest' && m === 'POST') {
        await alertDigest(env);
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      return new Response('not found', { status: 404, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
    }
  }
};