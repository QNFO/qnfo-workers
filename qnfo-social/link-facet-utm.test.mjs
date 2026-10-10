// SOCIAL-POST-TRUNCATION-1 (qnfo-social 0.7.35): the UTM rides in the link facet uri, never in the visible text.
// Run: node qnfo-social/link-facet-utm.test.mjs
import assert from 'node:assert/strict';
const mod = await import('./worker.js');
let pass = 0;
function ok(name) { pass++; console.log('ok - ' + name); }

// The 2026-10-02 launch post (social_threads 154): prose + one qnfo link, close to the 290 limit.
const prose = 'Living papers: research papers you can actually read. Every claim links to its evidence, every figure is regenerated from the data, and you can ask questions of the paper itself. Status: open beta, free.';
const link = 'https://papers.qnfo.org/reading';
const draft = prose + ' ' + link;
assert.ok(Array.from(draft).length <= 290); ok('draft fits without tracking');

// Old behaviour reproduced: tagging first then fitting cut the prose.
const old = mod.tagAndFit(draft, 290, 'bluesky', 'living-papers');
assert.notEqual(old.split(' https://')[0], prose); ok('old tagAndFit changed the prose (the defect)');

// New behaviour: capture what postText sends to Bluesky.
const sent = [];
globalThis.fetch = async (url, init) => {
  sent.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ uri: 'at://did:plc:x/app.bsky.feed.post/abc', cid: 'c' }), { status: 200 });
};
const res = await mod.postText({ did: 'did:plc:x', accessJwt: 'j' }, draft, null, { campaign: 'living-papers', utmSource: 'bluesky' });
const rec = sent[0].record;
assert.equal(rec.text, draft); ok('public text equals the drafted text, prose in full');
assert.ok(rec.text.includes(prose)); ok('prose not truncated');
assert.ok(!/utm_/.test(rec.text)); ok('no tracking characters in the visible text');
assert.equal(rec.facets.length, 1);
const uri = rec.facets[0].features[0].uri;
assert.ok(uri.startsWith(link + '?') && uri.includes('utm_source=bluesky') && uri.includes('utm_medium=social') && uri.includes('utm_campaign=living-papers')); ok('facet uri carries utm_source, utm_medium and utm_campaign=<slug>');
const bytes = new TextEncoder().encode(rec.text);
const f = rec.facets[0].index;
assert.equal(new TextDecoder().decode(bytes.slice(f.byteStart, f.byteEnd)), link); ok('facet byte range covers exactly the visible link');
assert.deepEqual(res.link_uris, [uri]); ok('postText returns the tagged link uris');
assert.equal(res.text, rec.text); ok('returned text is the posted text');

// Non-qnfo links and already-tagged links are left alone; campaign defaults to the last path segment.
const f2 = mod.tagFacets(mod.buildFacets('a https://doi.org/10.1000/t.1 b https://papers.qnfo.org/papers/x/'), 'bluesky');
assert.equal(f2[0].features[0].uri, 'https://doi.org/10.1000/t.1'); ok('doi.org link untouched');
assert.ok(f2[1].features[0].uri.includes('utm_campaign=x')); ok('default campaign is the last path segment');
const pre = 'https://qnfo.org/p?utm_source=email';
assert.equal(mod.tagFacets(mod.buildFacets('z ' + pre), 'bluesky')[0].features[0].uri, pre); ok('already-tagged link never re-tagged');

// A long post still gets its prose (not its link) shortened when the plain text exceeds 290.
const long = 'x '.repeat(200) + link;
sent.length = 0;
await mod.postText({ did: 'did:plc:x', accessJwt: 'j' }, long, null, { campaign: 'c' });
assert.ok(Array.from(sent[0].record.text).length <= 290 && sent[0].record.text.endsWith(link)); ok('over-long draft: prose shortened, link intact');
console.log(pass + ' passed');
