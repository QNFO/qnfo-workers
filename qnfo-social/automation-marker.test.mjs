// BP26-SOCIAL-AUTOMATION-1 (qnfo-social 0.20.0, agent_issues 1000340): every automated post ends with a short automation marker until the owner turns on the platform
// automated-account labels (owner card bp26-social-bot-labels). The marker is appended only where it fits the platform limit this worker already fits to, so no post is
// cut or refused for it. Offline: fetch is stubbed; nothing is posted.
// Run: node qnfo-social/automation-marker.test.mjs
import assert from 'node:assert/strict';
const mod = await import('./worker.js');
const { AUTOMATION_MARKER, MARKER_MAX_CHARS, withAutomationMarker } = mod;
let pass = 0;
function ok(name) { pass++; console.log('ok - ' + name); }
const len = (t) => Array.from(t).length;

// the helper
assert.equal(AUTOMATION_MARKER, ' [AI-generated]'); ok('the marker names AI (Art. 50) and is short ASCII');
assert.deepEqual(MARKER_MAX_CHARS, { bluesky: 290, linkedin: 3000, mastodon: 280, twitter: 280, substack: 10000 }); ok('the limits are the ones the worker already fits to');
assert.equal(withAutomationMarker('A new paper', 280), 'A new paper [AI-generated]'); ok('a short post gets the marker');
const room = 280 - AUTOMATION_MARKER.length;
assert.equal(withAutomationMarker('x'.repeat(room), 280), 'x'.repeat(room) + AUTOMATION_MARKER); ok('a post that leaves exactly the marker length gets it');
assert.equal(len(withAutomationMarker('x'.repeat(room), 280)), 280); ok('and fills the limit, not more');
assert.equal(len(withAutomationMarker('x'.repeat(room + 1), 280)), 280); assert.ok(withAutomationMarker('x'.repeat(room + 1), 280).endsWith(AUTOMATION_MARKER)); ok('a post one character too long is shortened to carry the marker');
assert.equal(len(withAutomationMarker('x'.repeat(280), 280)), 280); assert.ok(withAutomationMarker('x'.repeat(280), 280).endsWith(AUTOMATION_MARKER)); ok('a post at the limit is shortened and marked, never unmarked');
assert.equal(withAutomationMarker('a' + AUTOMATION_MARKER, 280), 'a' + AUTOMATION_MARKER); ok('the helper is idempotent');
assert.equal(withAutomationMarker('', 280), '') ; assert.equal(withAutomationMarker(null, 280), ''); ok('an empty post stays empty');
const emoji = '\u{1F9EA}'.repeat(room);
assert.equal(len(withAutomationMarker(emoji, 280)), 280); ok('code points are counted, not UTF-16 units');

// Bluesky: what postText sends
const sent = [];
globalThis.fetch = async (url, init) => {
  sent.push({ url: String(url), body: init && init.body });
  return new Response(JSON.stringify({ uri: 'at://did:plc:x/app.bsky.feed.post/abc', cid: 'c' }), { status: 200 });
};
const sess = { did: 'did:plc:x', accessJwt: 'j' };
let res = await mod.postText(sess, 'Living papers you can read https://papers.qnfo.org/reading', null, { campaign: 'c' });
let rec = JSON.parse(sent[0].body).record;
assert.ok(rec.text.endsWith(AUTOMATION_MARKER)); ok('Bluesky post ends with the marker');
assert.equal(res.text, rec.text); ok('postText returns the text exactly as posted');
const f = rec.facets[0].index;
assert.equal(new TextDecoder().decode(new TextEncoder().encode(rec.text).slice(f.byteStart, f.byteEnd)), 'https://papers.qnfo.org/reading'); ok('the link facet still covers exactly the visible link');
sent.length = 0;
await mod.postText(sess, 'y '.repeat(200) + 'https://papers.qnfo.org/reading', null, { campaign: 'c' });
rec = JSON.parse(sent[0].body).record;
assert.ok(len(rec.text) <= 290); ok('a long post is still fitted to 290 code points, marker or not');
sent.length = 0;
await mod.postText(sess, 'z'.repeat(285), null, { campaign: 'c' });
rec = JSON.parse(sent[0].body).record;
assert.ok(len(rec.text) <= 290 && rec.text.endsWith(AUTOMATION_MARKER)); ok('a post with no room is shortened so the marker fits');

// Mastodon direct: the status field
sent.length = 0;
globalThis.fetch = async (url, init) => {
  sent.push({ url: String(url), body: String(init && init.body) });
  return new Response(JSON.stringify({ id: '1', url: 'https://mstdn.science/@QNFO/1' }), { status: 200 });
};
const m = await mod.mastodonCreate({ MASTODON_TOKEN: 't', MASTODON_HOST: 'mstdn.science' }, 'New open-access paper');
assert.equal(new URLSearchParams(sent[0].body).get('status'), 'New open-access paper' + AUTOMATION_MARKER); ok('Mastodon status ends with the marker');
assert.equal(m.status, 'ok'); assert.equal(m.text, 'New open-access paper' + AUTOMATION_MARKER); ok('and the result reports the text as posted');
sent.length = 0;
await mod.mastodonCreate({ MASTODON_TOKEN: 't' }, 'w'.repeat(275));
{ const st = new URLSearchParams(sent[0].body).get('status'); assert.ok(len(st) <= 280 && st.endsWith(AUTOMATION_MARKER)); } ok('a Mastodon post with no room is shortened and marked');

// Buffer: LinkedIn, X and Substack share bufferCreate
const bodies = [];
globalThis.fetch = async (url, init) => {
  bodies.push(JSON.parse(init.body).query);
  return new Response(JSON.stringify({ data: { createPost: { post: { id: 'p1', status: 'sent' } } } }), { status: 200 });
};
const env = { BUFFER_TOKEN: 'b' };
let b = await mod.bufferCreate(env, { id: 'c1' }, 'twitter', 'A paper worth reading', 'publish');
assert.ok(bodies[0].includes(JSON.stringify('A paper worth reading' + AUTOMATION_MARKER))); ok('X post through Buffer ends with the marker');
assert.equal(b.text, 'A paper worth reading' + AUTOMATION_MARKER); ok('and the result reports the text as posted');
bodies.length = 0;
await mod.bufferCreate(env, { id: 'c1' }, 'twitter', 'v'.repeat(279), 'publish');
assert.ok(!bodies[0].includes(JSON.stringify('v'.repeat(279))) && bodies[0].includes('[AI-generated]')); ok('an X post with no room is shortened and marked');
bodies.length = 0;
const note = 'n'.repeat(9500);
await mod.bufferCreate(env, { id: 'c2' }, 'substack', note, 'publish');
assert.ok(bodies[0].includes(JSON.stringify(note + AUTOMATION_MARKER))); ok('a 9500-character Substack roll-up note still gets the marker (limit 10000)');
bodies.length = 0;
globalThis.fetch = async (url, init) => {
  bodies.push(JSON.parse(init.body).query);
  return new Response(JSON.stringify({ data: { createPost: { post: { id: 'p2', status: 'draft' } } } }), { status: 200 });
};
await mod.bufferCreate(env, { id: 'c3' }, 'linkedin', 'LinkedIn thread text', 'draft');
assert.ok(bodies[0].includes(JSON.stringify('LinkedIn thread text' + AUTOMATION_MARKER))); ok('LinkedIn draft ends with the marker');
console.log(pass + ' passed, 0 failed');
