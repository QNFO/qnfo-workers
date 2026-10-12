// SOCIAL-POST-TRUNCATION-2 (issue 1902), REACH-SIGNALS-1 (issue 2225), SUBSCRIBE-LINE-ACCURATE-1 (issue 1753): qnfo-social 0.12.0.
// Run: node qnfo-social/whole-sentences.test.mjs
import assert from 'node:assert/strict';
const mod = await import('./worker.js');
let pass = 0;
function ok(name) { pass++; console.log('ok - ' + name); }
const len = (x) => Array.from(x).length;
const src = (await import('node:fs')).readFileSync(new URL('./worker.js', import.meta.url), 'utf8');

// version: a minimum, never an exact value
const vm = src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/);
assert.ok(vm && (Number(vm[1]) > 0 || Number(vm[2]) >= 12)); ok('VERSION is at least 0.12.0');

// ---- units and splitting ----
const s1 = 'First sentence here. Second sentence follows! Third one asks? Fourth closes.';
assert.equal(mod.proseUnits(s1).map((u) => u.sep + u.text).join(''), s1); ok('proseUnits joins back to the text');
assert.equal(mod.proseUnits(s1).length, 4); ok('proseUnits splits at sentence ends');
const withUrl = 'Read it at https://papers.qnfo.org/papers/a.b-c?x=1. Then decide.';
assert.ok(mod.proseUnits(withUrl).some((u) => u.text.includes('https://papers.qnfo.org/papers/a.b-c?x=1'))); ok('a URL is never split');

const long = Array.from({ length: 12 }, (_, i) => 'Sentence number ' + (i + 1) + ' states one complete thought about the work.').join(' ');
assert.ok(len(long) > 290);
const parts = mod.splitForThread(long, 290);
assert.ok(parts.length >= 2 && parts.every((p) => len(p) <= 290)); ok('a long post becomes several posts inside the limit');
assert.ok(parts.every((p) => /[.!?]$/.test(p))); ok('every part ends at a sentence end');
assert.equal(parts.join(' '), long); ok('no prose is lost and no ellipsis is added');
assert.ok(!parts.join(' ').includes('…'));
assert.deepEqual(mod.splitForThread('Short.', 290), ['Short.']); ok('a short post is left alone');
const oneHuge = Array.from({ length: 80 }, (_, i) => 'word' + i).join(' ') + '.';
const hp = mod.splitForThread(oneHuge, 100);
assert.ok(hp.length > 1 && hp.every((p) => len(p) <= 100) && hp.join(' ') === oneHuge); ok('one sentence longer than a post is packed by whole words');

// ---- fitWhole: drop whole trailing sentences, keep the link ----
const body = 'Alpha is the first point. Beta is the second point. Gamma is the third point.\nhttps://papers.qnfo.org/papers/x';
const fw = mod.fitWhole(body, 75);
assert.ok(fw !== null && len(fw) <= 75 && fw.split('\n').pop() === 'https://papers.qnfo.org/papers/x'); ok('fitWhole keeps the link');
assert.ok(fw.startsWith('Alpha is the first point.') && !fw.includes('…') && !fw.includes('Gamma')); ok('fitWhole drops a whole trailing sentence, no ellipsis');
assert.equal(mod.fitWhole('One single sentence that is far too long for the tiny limit it is given.', 20), null); ok('fitWhole returns null when one sentence cannot fit');

// ---- Buffer text (Mastodon, X): whole sentences beside the link ----
const link = 'https://papers.qnfo.org/papers/some-paper';
const post = 'The first sentence makes the claim in plain words for the reader. The second sentence gives the test that was run and how it was scored in practice. The third sentence states the status and what remains open for anyone who wants to check the result themselves today.';
const buf = mod.pickBufferText([post], link, 'Title', 280);
assert.ok(len(buf) <= 280 && buf.endsWith(link)); ok('Buffer text fits and ends with the link');
const bufProse = buf.slice(0, buf.length - link.length).replace(/[\s—]+$/, '');
assert.ok(/[.!?]$/.test(bufProse) && post.startsWith(bufProse)); ok('Buffer prose ends at a sentence end of the draft');

// ---- LinkedIn text: accurate subscribe line, whole sentences ----
assert.ok(/weekly/.test(mod.SUBSCRIBE_LINE) && !/monthly/.test(mod.SUBSCRIBE_LINE)); ok('subscribe line states the weekly cadence the list has');
assert.ok(mod.SUBSCRIBE_LINE.endsWith('https://qnfo.org/#subscribe')); ok('subscribe line links the form');
assert.equal(mod.utmTag('https://qnfo.org/#subscribe', 'linkedin', 'slug'), 'https://qnfo.org/?utm_source=linkedin&utm_medium=social&utm_campaign=slug#subscribe'); ok('the form link keeps its fragment when tagged');
const many = Array.from({ length: 30 }, (_, i) => 'Paragraph ' + (i + 1) + ' carries one complete sentence of the thread for the long channel.');
const li = mod.channelText('linkedin', many, link, 'Title');
assert.ok(len(li) <= 1300 && li.endsWith(mod.SUBSCRIBE_LINE) && li.split(/\s+/).some((w) => w === link) && !li.includes('…')); ok('LinkedIn text keeps link and offer and has no ellipsis cut');

// ---- threadPlan and postThread: the root keeps the link, the rest follows as replies ----
const plan = mod.threadPlan([long], link, 290);
assert.ok(plan.length >= 2 && plan.every((p) => len(p.text) <= 290)); ok('threadPlan continues a long root as replies');
assert.ok(plan[0].text.endsWith(link) && plan.slice(1).every((p) => !p.text.includes('http'))); ok('the link stays on the root post');
assert.equal(plan.map((p, i) => (i === 0 ? p.text.slice(0, p.text.length - link.length - 3) : p.text)).join(' '), long); ok('the thread carries the whole draft');
const shortPlan = mod.threadPlan(['A short claim.', 'A short second post.'], link, 290);
assert.deepEqual(shortPlan.map((p) => p.text), ['A short claim. — ' + link, 'A short second post.']); ok('posts that fit are unchanged');

const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const b = JSON.parse(init.body);
  sent.push(b);
  return new Response(JSON.stringify({ uri: 'at://did:plc:x/app.bsky.feed.post/p' + sent.length, cid: 'c' + sent.length }), { status: 200 });
};
const kept = [];
const uris = await mod.postThread({ did: 'did:plc:x', accessJwt: 'j' }, [long], { link, embed: { title: 'T', desc: 'D' }, campaign: 'some-paper', sent: kept });
assert.ok(uris.length === plan.length && sent.length === plan.length); ok('postThread posts every part');
assert.ok(sent.every((b) => len(b.record.text) <= 290 && !b.record.text.includes('…') && !/utm_/.test(b.record.text))); ok('no part is cut and no tracking shows');
assert.ok(sent[0].record.embed && /utm_campaign=some-paper/.test(sent[0].record.embed.external.uri)); ok('the root carries the link card with the tagged target');
assert.ok(!sent[0].record.reply && sent.slice(1).every((b) => b.record.reply && b.record.reply.root.uri === uris[0])); ok('later parts reply to the root');
assert.equal(kept.length, plan.length); ok('the sent texts are handed back for the ledger');

// ---- REACH-SIGNALS-1: replies by other accounts, without their text ----
assert.equal(mod.replyWordCount('Nice.'), 1);
assert.equal(mod.replyWordCount('I ran this on our cluster and saw the same thing https://example.org/x'), 11); ok('word count ignores links');
const thread = { post: { uri: 'at://did:plc:me/app.bsky.feed.post/root', author: { did: 'did:plc:me' }, record: { createdAt: '2026-10-11T08:30:00.000Z' } }, replies: [
  { post: { uri: 'at://did:plc:me/app.bsky.feed.post/self', author: { did: 'did:plc:me' }, record: { createdAt: '2026-10-11T08:30:05.000Z', text: 'own continuation of the thread' } } },
  { post: { uri: 'at://did:plc:a/app.bsky.feed.post/r1', author: { did: 'did:plc:a', handle: 'a.example' }, record: { createdAt: '2026-10-11T08:50:00.000Z', text: 'How was the baseline measured here?' } } },
  { post: { uri: 'at://did:plc:b/app.bsky.feed.post/r2', author: { did: 'did:plc:b' }, record: { createdAt: '2026-10-11T12:30:00.000Z', text: 'Nice' } } },
  { $type: 'app.bsky.feed.defs#notFoundPost', uri: 'at://gone', notFound: true } ] };
const rows = mod.replyRowsOf(thread);
assert.equal(rows.length, 2); ok('own replies and missing posts are not counted');
assert.equal(rows[0].delay_min, 20); assert.equal(rows[1].delay_min, 240); ok('delay from the post is in minutes');
assert.equal(rows[0].word_count, 6); assert.equal(rows[1].word_count, 1); ok('word counts are stored');
assert.ok(rows.every((r) => !('text' in r) && !('handle' in r))); ok('no reply text and no handle in a row');

const writes = [];
const db = { prepare(sql) { return { sql, args: [], bind(...a) { this.args = a; return this; }, async run() { writes.push({ sql, args: this.args }); return { meta: { changes: 1 } }; } }; },
  async batch(stmts) { for (const s of stmts) writes.push({ sql: s.sql, args: s.args }); return []; } };
globalThis.fetch = async (url) => {
  assert.ok(String(url).startsWith('https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?'));
  return new Response(JSON.stringify({ thread }), { status: 200 });
};
const cr = await mod.collectReplies({ DB: db }, ['at://did:plc:me/app.bsky.feed.post/root']);
assert.deepEqual(cr, { threads: 1, stored: 2, errors: 0 }); ok('collectReplies reads the public thread and stores two rows');
const ins = writes.filter((w) => /^INSERT INTO social_replies/.test(w.sql));
assert.equal(ins.length, 2);
assert.ok(ins.every((w) => /^[0-9a-f]{16}$/.test(w.args[2]) && !JSON.stringify(w.args).includes('a.example') && !JSON.stringify(w.args).includes('baseline'))); ok('the author column is a hash; no handle and no text are stored');
assert.ok(/ON CONFLICT\(reply_uri\) DO NOTHING/.test(ins[0].sql)); ok('a reply is stored once');
globalThis.fetch = async () => new Response('nope', { status: 502 });
assert.deepEqual(await mod.collectReplies({ DB: db }, ['at://x']), { threads: 0, stored: 0, errors: 1 }); ok('an upstream error is counted, not thrown');
globalThis.fetch = realFetch;

// ---- no posting, liking or following in the reply collector; ids from crypto ----
const fn = src.slice(src.indexOf('async function collectReplies'), src.indexOf('async function collectEngagement'));
assert.ok(!/createRecord|method:\s*'POST'/.test(fn)); ok('the reply collector only reads');
assert.ok(!/Date\.now\(\)\.toString\(36\) \+ Math\.random\(\)/.test(src)); ok('ledger ids no longer come from Math.random');

// ---- bounded body read for the link probe ----
assert.equal(await mod.readTextCapped(new Response('page with the-slug inside'), 2e6), 'page with the-slug inside'); ok('a small body is read whole');
let pulled = 0;
const stream = new ReadableStream({ pull(c) { pulled++; if (pulled > 500) c.close(); else c.enqueue(new TextEncoder().encode('y'.repeat(1000))); } });
const capped = await mod.readTextCapped(new Response(stream), 5000);
assert.ok(capped.length >= 5000 && capped.length <= 8000 && pulled < 50); ok('a large body stops near the cap');
assert.ok(/await wr\.catch/.test(src)); ok('the AI counter write is awaited');

console.log('\n' + pass + ' passed');
