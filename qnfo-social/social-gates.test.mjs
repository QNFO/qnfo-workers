// Offline mock tests for qnfo-social (POST-ID-UTM-1, OWNER-VOICE-CONTENT-GATE-1, SOCIAL-ADHOC-GATE-1,
// SOCIAL-ENGAGEMENT-SELF-1, LINKEDIN-OWNER-DELEGATED-1, BUFFER-CHANNEL-AUDIT-1). Run: node qnfo-social/social-gates.test.mjs
import assert from 'node:assert/strict';
const mod = await import('./worker.js');
const W = mod.default;
let pass = 0;
function ok(name) { pass++; console.log('ok - ' + name); }

// ---------- pure helpers ----------
const EM = '\u2014';
assert.equal(mod.repairMojibake('The Hash \u00e2\u0080\u0094 x'), 'The Hash ' + EM + ' x'); ok('latin1 mojibake em dash repaired');
assert.equal(mod.repairMojibake('a \u00e2\u20ac\u201d b'), 'a ' + EM + ' b'); ok('cp1252 mojibake em dash repaired');
assert.equal(mod.repairMojibake('caf\u00c3\u00a9'), 'caf\u00e9'); ok('two-byte mojibake repaired');
const legit = 'marriage\u2011guardianship caf\u00e9 \u201cquoted\u201d \u2014 \u03b1 \u2248 1/137 [\u03b6]^\u00d7';
assert.equal(mod.repairMojibake(legit), legit); ok('legit unicode untouched');
assert.equal(mod.contentGate([legit]).ok, true); ok('legit unicode passes gate');
assert.equal(mod.contentGate(['x \u00e2\u0080\u0094 https://q08.org/p/2026-10-01-a']).reason, 'q08-link'); ok('q08 link refused');
assert.equal(mod.contentGate(['see www.q08.org.']).reason, 'q08-link'); ok('bare q08.org refused');
assert.equal(mod.contentGate(['https://qnfo-social.q08.workers.dev/health and https://papers.qnfo.org/papers/x/']).ok, true); ok('q08.workers.dev and papers.qnfo.org allowed');
assert.equal(mod.contentGate(['broken \u00e2\u0080 text']).reason, 'mojibake'); ok('unrepairable mojibake held');
assert.equal(mod.contentGate([{ text: 'obj \u00e2\u0080\u0094 ok', uri: 'at://x' }]).texts[0], 'obj ' + EM + ' ok'); ok('object posts handled');
assert.equal(mod.blueskyUriOf('at://did:plc:a/app.bsky.feed.post/1'), 'at://did:plc:a/app.bsky.feed.post/1');
assert.equal(mod.blueskyUriOf('{"bluesky":"at://b","linkedin":"buffer-draft:9"}'), 'at://b');
assert.equal(mod.blueskyUriOf('buffer:1'), null); ok('blueskyUriOf');

// ---------- mock D1 + fetch ----------
function mkEnv(state) {
  const log = [];
  const stmt = (sql) => {
    let args = [];
    const o = {
      bind(...a) { args = a; return o; },
      async run() { log.push({ sql, args }); return state.run(sql, args); },
      async first() { log.push({ sql, args }); return state.first(sql, args); },
      async all() { log.push({ sql, args }); return { results: state.all(sql, args) }; },
      _sql: sql, get _args() { return args; }
    };
    return o;
  };
  return { log, env: { DB: { prepare: stmt, async batch(list) { for (const s of list) log.push({ sql: s._sql, args: s._args, batch: true }); return []; } },
    BSKY_HANDLE: 'qnfo.bsky.social', BSKY_APP_PASS: 'x', BUFFER_TOKEN: 'buf', SOCIAL_TOKEN: 'tok', AI: {} } };
}
function mkFetch(calls, opts) {
  opts = opts || {};
  return async (url, init) => {
    const u = String(url);
    const body = init && init.body ? String(init.body) : '';
    calls.push({ u, body });
    const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { 'Content-Type': 'application/json' } });
    if (u.includes('createSession')) return J({ accessJwt: 'jwt', did: 'did:plc:me', handle: 'qnfo.bsky.social' });
    if (u.includes('createRecord')) { const n = calls.filter(c => c.u.includes('createRecord')).length; return J({ uri: 'at://did:plc:me/app.bsky.feed.post/r' + n, cid: 'c' + n }); }
    if (u === 'https://api.buffer.com') {
      if (body.includes('organizations')) return J({ data: { account: { organizations: [{ id: 'org1' }] } } });
      if (body.includes('channels(')) return J({ data: { channels: [{ id: 'chM', service: 'mastodon', isDisconnected: false }, { id: 'chL', service: 'linkedin', isDisconnected: false }] } });
      if (body.includes('createPost')) {
        const isL = body.includes('chL');
        return J({ data: { createPost: { post: { id: isL ? 'bL1' : 'bM1', status: isL ? (opts.linkedinStatus || 'draft') : 'sent' } } } });
      }
    }
    if (u.includes('public.api.bsky.app/xrpc/app.bsky.feed.getPosts')) {
      const uris = new URL(u).searchParams.getAll('uris');
      return J({ posts: uris.map((x, i) => ({ uri: x, likeCount: i + 1, repostCount: 0, replyCount: 2, quoteCount: 0 })) });
    }
    if (u.startsWith('https://papers.qnfo.org/')) return new Response('<html>paper</html>', { status: 200 });
    return new Response('nf', { status: 404 });
  };
}
function baseState(over) {
  const s = {
    paused: false, posted7: 0,
    queued: [],
    first(sql, args) {
      if (sql.includes("pipeline_flags WHERE key='social_paused'")) return s.paused ? { value: '1' } : null;
      if (sql.includes("pipeline_flags WHERE key='social_cap_epoch'")) return s.epoch ? { value: s.epoch } : null;
      if (sql.includes("AS n") && sql.includes('-7 days') && s.epochCounts) { s.boundEpoch = args[0]; return { n: args[0] > '2026-10-01' ? 0 : s.posted7 }; }
      if (sql.includes("pipeline_flags WHERE key='linkedin_mode'")) return s.liMode ? { value: s.liMode } : null;
      if (sql.includes('FROM social_channels WHERE checked_day')) return s.auditDone ? { x: 1 } : null;
      if (sql.includes("AS n") && sql.includes('-7 days')) return { n: s.posted7 };
      if (sql.includes("start of day")) return { n: 0 };
      if (sql.includes("FROM social_threads WHERE status='queued'")) return s.queued.shift() || null;
      if (sql.includes("FROM dissemination_tracker WHERE action='queued'")) return null;
      if (sql.includes('FROM social_threads WHERE slug=?')) return s.bySlug ? s.bySlug[args[0]] : null;
      return null;
    },
    run() { return { success: true }; },
    all(sql) {
      if (sql.includes('SELECT post_uri FROM social_threads')) return [{ post_uri: '{"bluesky":"at://did:plc:me/app.bsky.feed.post/a1","linkedin":"buffer-draft:9"}' }, { post_uri: 'buffer:7' }];
      if (sql.includes('SELECT post_id FROM dissemination_tracker')) return [{ post_id: 'at://did:plc:me/app.bsky.feed.post/d1' }, { post_id: 'at://did:plc:me/app.bsky.feed.post/a1' }];
      return [];
    }
  };
  return Object.assign(s, over || {});
}

// ---------- SOCIAL-CAP-EPOCH-1: the cap counts from the epoch when the flag is set ----------
{
  const st = baseState({ posted7: 96, epochCounts: true });
  let g = await mod.socialGate(mkEnv(st).env, 't');
  assert.equal(g.allowed, 0); assert.equal(st.boundEpoch, '0'); ok('no epoch flag: the rolling 7 days count (96 posts hold)');
  const st2 = baseState({ posted7: 96, epochCounts: true, epoch: '2026-10-01 21:30:00' });
  g = await mod.socialGate(mkEnv(st2).env, 't');
  assert.equal(st2.boundEpoch, '2026-10-01 21:30:00'); assert.equal(g.allowed, 2); ok('epoch flag: posts before the reset no longer count, cap still 2');
  const st3 = baseState({ posted7: 96, epochCounts: true, epoch: 'not-a-date' });
  g = await mod.socialGate(mkEnv(st3).env, 't');
  assert.equal(st3.boundEpoch, '0'); ok('malformed epoch is ignored');
}

// ---------- drainQueue: clean row posts, writes status + post_uri in one statement, LinkedIn as draft ----------
{
  const calls = [];
  globalThis.fetch = mkFetch(calls);
  const st = baseState({ queued: [{ id: 7, slug: 'jpcub', title: 'JPCUB caf\u00c3\u00a9', posts: JSON.stringify(['Energy per useful computation \u00e2\u0080\u0094 a new normalisation. https://papers.qnfo.org/papers/jpcub/', 'Second post.']) }] });
  const { env, log } = mkEnv(st);
  const r = await mod.drainQueue(env);
  assert.equal(r.posted, 1);
  const recs = calls.filter(c => c.u.includes('createRecord')).map(c => JSON.parse(c.body).record);
  assert.equal(recs.length, 2);
  assert.ok(recs[0].text.includes(EM) && !recs[0].text.includes('\u00e2'), 'mojibake repaired before posting');
  assert.ok(recs[0].text.includes('utm_source=bluesky&utm_medium=social&utm_campaign=jpcub'), 'bluesky utm');
  assert.equal(recs[0].embed.external.title, 'JPCUB caf\u00e9');
  const cps = calls.filter(c => c.body.includes('createPost'));
  const lin = cps.find(c => c.body.includes('chL')); const mas = cps.find(c => c.body.includes('chM'));
  assert.ok(lin.body.includes('mode: addToQueue') && !lin.body.includes('saveToDraft') && !lin.body.includes('shareNow'), 'linkedin goes to the Buffer queue (owner-delegated publish)');
  assert.ok(mas.body.includes('shareNow'), 'mastodon shares now');
  assert.ok(lin.body.includes('utm_source=linkedin') && mas.body.includes('utm_source=mastodon'));
  const upd = log.find(l => l.sql.includes("SET status='posted'") && l.sql.includes('post_uri'));
  assert.ok(upd, 'combined posted+post_uri write');
  const ids = JSON.parse(upd.args[0]);
  assert.equal(ids.bluesky, 'at://did:plc:me/app.bsky.feed.post/r1');
  assert.equal(ids.linkedin, 'buffer:bL1');
  assert.equal(ids.mastodon, 'buffer:bM1');
  assert.equal(upd.args[1], 7);
  ok('drainQueue posts clean row, one write with post_uri {bluesky, mastodon, linkedin queued}');
}
// ---------- drainQueue: q08 row suppressed, nothing posted ----------
{
  const calls = [];
  globalThis.fetch = mkFetch(calls);
  const st = baseState({ queued: [{ id: 8, slug: 'q08-x', title: 'x', posts: JSON.stringify(['Essay \u00e2\u0080\u0094 https://q08.org/p/2026-10-01-x']) }] });
  const { env, log } = mkEnv(st);
  const r = await mod.drainQueue(env);
  assert.equal(r.posted, 0);
  assert.equal(calls.filter(c => c.u.includes('createRecord') || c.u === 'https://api.buffer.com').length, 0);
  const sup = log.find(l => l.sql.includes('UPDATE social_threads SET status=?') && l.args[0] === 'suppressed');
  assert.ok(sup && sup.args[2] === 8);
  ok('drainQueue suppresses q08.org row without posting');
}
// ---------- pause flag honoured by cron drain and routes ----------
{
  const calls = [];
  globalThis.fetch = mkFetch(calls);
  const st = baseState({ paused: true, queued: [{ id: 9, slug: 's', title: 't', posts: '["hello https://papers.qnfo.org/papers/s/"]' }] });
  const { env } = mkEnv(st);
  const r = await mod.drainQueue(env);
  assert.equal(r.skipped, 'paused');
  for (const path of ['/post', '/thread', '/cross']) {
    const req = new Request('https://x' + path, { method: 'POST', headers: { Authorization: 'Bearer tok' }, body: JSON.stringify({ text: 'hi', posts: ['hi'] }) });
    const res = await W.fetch(req, env);
    assert.equal(res.status, 423, path + ' paused');
  }
  assert.equal(calls.length, 0);
  ok('pause flag: drainQueue skips, /post /thread /cross return 423, no network');
}
// ---------- weekly cap honoured by routes; allowed /post records a row with post_uri ----------
{
  const calls = [];
  globalThis.fetch = mkFetch(calls);
  const st = baseState({ posted7: 2 });
  const { env } = mkEnv(st);
  const res = await W.fetch(new Request('https://x/post', { method: 'POST', headers: { Authorization: 'Bearer tok' }, body: JSON.stringify({ text: 'hi' }) }), env);
  assert.equal(res.status, 429);
  assert.equal(calls.length, 0);
  const st2 = baseState({ posted7: 0 });
  const m2 = mkEnv(st2);
  const res2 = await W.fetch(new Request('https://x/post', { method: 'POST', headers: { Authorization: 'Bearer tok' }, body: JSON.stringify({ text: 'New paper https://papers.qnfo.org/papers/abc/', slug: 'abc' }) }), m2.env);
  assert.equal(res2.status, 200);
  const ins = m2.log.find(l => l.sql.includes('INSERT INTO social_threads') && l.sql.includes('post_uri'));
  assert.ok(ins && ins.args[3] === 'at://did:plc:me/app.bsky.feed.post/r1');
  const rec = JSON.parse(calls.find(c => c.u.includes('createRecord')).body).record;
  assert.ok(rec.text.includes('utm_campaign=abc'));
  const res3 = await W.fetch(new Request('https://x/post', { method: 'POST', headers: { Authorization: 'Bearer tok' }, body: JSON.stringify({ text: 'x https://q08.org/p/y' }) }), mkEnv(baseState()).env);
  assert.equal(res3.status, 422);
  ok('routes: cap -> 429, q08 -> 422, allowed /post records social_threads row with post_uri and UTM');
}
// ---------- /cross records the LinkedIn draft id ----------
{
  const calls = [];
  globalThis.fetch = mkFetch(calls);
  const m = mkEnv(baseState({ liMode: 'draft' }));
  const res = await W.fetch(new Request('https://x/cross', { method: 'POST', headers: { Authorization: 'Bearer tok' }, body: JSON.stringify({ text: 'A complete sentence about the work.', link: 'https://papers.qnfo.org/papers/abc/', slug: 'abc' }) }), m.env);
  const j = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(j.post_uri), { mastodon: 'buffer:bM1', linkedin: 'buffer-draft:bL1' });
  assert.ok(m.log.find(l => l.sql.includes('INSERT INTO social_threads')));
  ok('/cross with linkedin_mode=draft: LinkedIn saved as draft, ids recorded');
}
// ---------- LinkedIn not-draft read-back alerts ----------
{
  const calls = [];
  globalThis.fetch = mkFetch(calls, { linkedinStatus: 'scheduled' });
  const m = mkEnv(baseState({ liMode: 'draft' }));
  const r = await mod.bufferPost(m.env, 'text https://papers.qnfo.org/papers/a/', 'a');
  const li = r.results.find(x => x.platform === 'linkedin');
  assert.equal(li.status, 'error');
  assert.ok(m.log.find(l => l.sql.includes('INSERT INTO alerts') && String(l.args[2]).includes('not draft')));
  ok('draft mode: LinkedIn post that comes back non-draft raises an alert and is not recorded as a draft');
}
// ---------- publish mode: no draft alert; channel audit ----------
{
  const calls = [];
  globalThis.fetch = mkFetch(calls, { linkedinStatus: 'scheduled' });
  const m = mkEnv(baseState());
  assert.equal(await mod.linkedinMode(m.env), 'publish');
  const r = await mod.bufferPost(m.env, 'text https://papers.qnfo.org/papers/a/', 'a');
  const li = r.results.find(x => x.platform === 'linkedin');
  assert.equal(li.status, 'queued');
  assert.ok(!m.log.find(l => l.sql.includes('INSERT INTO alerts')));
  const a = await mod.bufferChannelAudit(m.env, Date.parse('2026-10-02T00:30:00Z'));
  assert.deepEqual(a.channels, ['mastodon:connected', 'linkedin:connected']);
  const b = m.log.filter(l => l.batch);
  assert.ok(b.length >= 2 && b.some(l => l.sql.includes('INSERT INTO social_channels') && l.args[3] === 1 && l.args[5] === '2026-10-02'));
  const m2 = mkEnv(baseState({ auditDone: true }));
  assert.deepEqual(await mod.bufferChannelAudit(m2.env, Date.parse('2026-10-02T02:30:00Z')), { throttled: '2026-10-02' });
  ok('publish mode: LinkedIn queued, no draft alert; channel audit records connected channels once per day');
}
// ---------- engagement collector ----------
{
  const calls = [];
  globalThis.fetch = mkFetch(calls);
  const m = mkEnv(baseState());
  const r = await mod.collectEngagement(m.env);
  assert.equal(r.uris, 2);
  assert.equal(r.posts_found, 2);
  const rows = m.log.filter(l => l.batch);
  assert.equal(rows.length, 8);
  assert.ok(rows.every(l => l.sql.includes('ON CONFLICT(platform, post_id, metric, collected_at)') && l.args[0] === 'bluesky' && /^\d{4}-\d{2}-\d{2}$/.test(l.args[5])));
  assert.ok(calls.every(c => !c.u.includes('createSession')), 'no credential used');
  ok('collectEngagement: dedupes ids from both tables, upserts 4 metrics per post via public AppView');
}
console.log('\n' + pass + ' passed');
