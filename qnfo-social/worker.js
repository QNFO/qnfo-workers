// qnfo-social - cloud-based Bluesky posting (AT Protocol).
// Replaces local bluesky_post.py. Secrets: BSKY_HANDLE, BSKY_APP_PASS, SOCIAL_TOKEN.
// D1 binding: DB (qnfo-audit.social_threads). Cron posts the oldest queued thread.
const BSKY = 'https://bsky.social/xrpc';

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
  const record = { text: text, createdAt: new Date().toISOString() };
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

export default {
  async scheduled(event, env) {
    const row = await env.DB.prepare("SELECT * FROM social_threads WHERE status='queued' ORDER BY id ASC LIMIT 1").first();
    if (!row) return;
    try {
      const posts = JSON.parse(row.posts);
      const s = await session(env);
      const uris = await postThread(s, posts);
      await env.DB.prepare("UPDATE social_threads SET status='posted', posted_at=datetime('now') WHERE id=?").bind(row.id).run();
      console.log('cron posted thread', row.slug, uris[0]);
    } catch (e) { console.error('cron post failed', row.slug, String(e)); }
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
        const r = await postText(s, String(b.text || '').slice(0, 290));
        return new Response(JSON.stringify({ ok: true, uri: r.uri }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/thread' && m === 'POST') {
        const b = await request.json();
        const posts = (b.posts || []).map(function(x){ return String(x).slice(0, 290); }).filter(function(x){ return x.trim(); });
        if (!posts.length) return new Response(JSON.stringify({ error: 'no posts' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
        const s = await session(env);
        const uris = await postThread(s, posts);
        return new Response(JSON.stringify({ ok: true, root: uris[0], count: uris.length, uris: uris }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/threads' && m === 'GET') {
        const rows = await env.DB.prepare("SELECT id, slug, title, status, posted_at, created_at FROM social_threads ORDER BY id DESC LIMIT 50").all();
        return new Response(JSON.stringify(rows.results || []), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/queue' && m === 'POST') {
        const b = await request.json();
        await env.DB.prepare("INSERT OR IGNORE INTO social_threads (slug, title, posts) VALUES (?,?,?)").bind(String(b.slug), String(b.title || ''), JSON.stringify(b.posts || [])).run();
        return new Response(JSON.stringify({ ok: true, slug: b.slug }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      if (p === '/broadcast' && m === 'POST') {
        const b = await request.json();
        const row = await env.DB.prepare("SELECT * FROM social_threads WHERE slug=?").bind(String(b.slug)).first();
        if (!row) return new Response(JSON.stringify({ error: 'thread not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...cors } });
        const posts = JSON.parse(row.posts);
        const s = await session(env);
        const uris = await postThread(s, posts);
        await env.DB.prepare("UPDATE social_threads SET status='posted', posted_at=datetime('now') WHERE id=?").bind(row.id).run();
        return new Response(JSON.stringify({ ok: true, root: uris[0], count: uris.length, uris: uris }), { headers: { 'Content-Type': 'application/json', ...cors } });
      }
      return new Response('not found', { status: 404, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
    }
  }
};
