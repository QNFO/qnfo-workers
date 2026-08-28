// qnfo-social - cloud-based Bluesky posting (AT Protocol) + AI compose.
// Secrets: BSKY_HANDLE, BSKY_APP_PASS, SOCIAL_TOKEN. D1: DB (qnfo-audit.social_threads). AI: env.AI.
// Cron posts oldest queued thread. /compose drafts a thread from title+abstract (draft -> approve -> queued).
const BSKY = 'https://bsky.social/xrpc';
const COMPOSE_MODEL = '@cf/deepseek-ai/deepseek-v4-flash-0731';

function truncate(text, max) {
  const pts = Array.from(String(text || ''));
  if (pts.length <= max) return String(text || '');
  return pts.slice(0, max).join('');
}

function auth(req, env) {
  const exp = env.SOCIAL_TOKEN;
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!exp || !tok || tok.length !== exp.length) return false;
  let d = 0;
  for (let i = 0; i < tok.length; i++) d |= tok.charCodeAt(i) ^ exp.charCodeAt(i);
  return d === 0;
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
        "You are a promotion writer for QNFO, an open-science research org. Write a 5-post Bluesky thread that amplifies a research paper accurately.",
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
      const slug = 'scan-' + (doi.split('/').pop() || Date.now().toString(36));
      await env.DB.prepare("INSERT OR IGNORE INTO social_threads (slug, title, doi, posts, status) VALUES (?,?,?,?, 'draft')").bind(slug, title, doi, JSON.stringify(posts.slice(0, 6))).run();
      drafted++;
      if (created > newest) newest = created;
    }
    await env.DB.prepare("INSERT INTO scan_state (key, value) VALUES ('last_scanned', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(newest).run();
    console.log('auto-scan: drafted', drafted, 'draft threads; last_scanned', newest);
  } catch (e) {
    console.error('auto-scan failed', String(e));
  }
}

export default {
  async scheduled(event, env) {
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
      console.error('cron post failed', row.slug, String(e));
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname, m = request.method;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (m === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (p === '/health') return new Response(JSON.stringify({ ok: true, worker: 'qnfo-social', handle: env.BSKY_HANDLE }), { headers: { 'Content-Type': 'application/json', ...cors } });
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
          "You are a promotion writer for QNFO, an open-science research org. Write a 5-post Bluesky thread that amplifies a research paper accurately.",
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
        await env.DB.prepare("INSERT INTO social_threads (slug, title, posts, status) VALUES (?,?,?, 'draft')").bind(slug, title, JSON.stringify(posts.slice(0, 6))).run();
        return new Response(JSON.stringify({ ok: true, slug: slug, status: 'draft', posts: posts.slice(0, 6) }), { headers: { 'Content-Type': 'application/json', ...cors } });
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
      return new Response('not found', { status: 404, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
    }
  }
};
