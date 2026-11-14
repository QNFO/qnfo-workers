import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toMs,
  parseUntil,
  isExpired,
  pruneExpired,
  activeDomains,
  blendTotal,
  normalizeBlend,
  controlView,
} from './control-expiry.mjs';

const NOW = '2026-06-01T00:00:00.000Z';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} !~= ${b}`);

test('toMs accepts ms, Date and ISO strings', () => {
  assert.equal(toMs(1000), 1000);
  assert.equal(toMs(new Date(2000)), 2000);
  assert.equal(toMs(NOW), Date.parse(NOW));
});

test('parseUntil rejects junk instead of guessing', () => {
  assert.equal(parseUntil(null), null);
  assert.equal(parseUntil(''), null);
  assert.equal(parseUntil('   '), null);
  assert.equal(parseUntil('not-a-date'), null);
  assert.equal(parseUntil(NaN), null);
  assert.equal(parseUntil(new Date('nope')), null);
  assert.equal(parseUntil('2026-06-01T00:00:00.000Z'), Date.parse(NOW));
});

test('isExpired: past true, future false, boundary is <=', () => {
  assert.equal(isExpired('2026-01-01T00:00:00.000Z', NOW), true);
  assert.equal(isExpired('2026-12-01T00:00:00.000Z', NOW), false);
  assert.equal(isExpired(NOW, NOW), true, 'exact boundary counts as expired');
  assert.equal(isExpired(Date.parse(NOW) + 1, NOW), false);
});

test('isExpired fails closed on missing or unparseable until', () => {
  assert.equal(isExpired(null, NOW), true);
  assert.equal(isExpired(undefined, NOW), true);
  assert.equal(isExpired('', NOW), true);
  assert.equal(isExpired('whenever', NOW), true);
});

test('pruneExpired splits kept/dropped and does not mutate the input', () => {
  const map = {
    weather: '2026-12-31T00:00:00.000Z',
    sports: '2026-01-01T00:00:00.000Z',
    markets: 'garbage',
  };
  const snapshot = JSON.stringify(map);
  const { next, dropped, kept } = pruneExpired(map, NOW);
  assert.deepEqual(kept, ['weather']);
  assert.deepEqual(dropped.sort(), ['markets', 'sports']);
  assert.deepEqual(next, { weather: '2026-12-31T00:00:00.000Z' });
  assert.equal(JSON.stringify(map), snapshot, 'input must be untouched');
});

test('pruneExpired tolerates non-object input', () => {
  for (const bad of [null, undefined, 42, 'x', [1, 2]]) {
    const r = pruneExpired(bad, NOW);
    assert.deepEqual(r, { next: {}, dropped: [], kept: [] });
  }
});

test('activeDomains returns only entries still in force', () => {
  const map = { a: '2026-12-31T00:00:00.000Z', b: '2020-01-01T00:00:00.000Z' };
  assert.deepEqual(activeDomains(map, NOW), ['a']);
  assert.deepEqual(activeDomains({}, NOW), []);
});

test('blendTotal ignores zero, negative, NaN and non-number weights', () => {
  assert.equal(blendTotal({ a: 1, b: 0.5 }), 1.5);
  assert.equal(blendTotal({ a: 1, b: 0, c: -2, d: NaN, e: Infinity, f: '3', g: null }), 1);
  assert.equal(blendTotal({}), 0);
  assert.equal(blendTotal(null), 0);
});

test('normalizeBlend sums to 1 and drops unusable weights', () => {
  const out = normalizeBlend({ a: 3, b: 1, c: -5, d: NaN });
  assert.deepEqual(Object.keys(out).sort(), ['a', 'b']);
  close(out.a, 0.75);
  close(out.b, 0.25);
  close(out.a + out.b, 1);
  assert.deepEqual(normalizeBlend({ a: 0 }), {});
  assert.deepEqual(normalizeBlend(undefined), {});
});

test('controlView separates still-off from expired and normalises the blend', () => {
  const ctl = {
    domains_off: { weather: '2026-12-31T00:00:00.000Z', sports: '2026-01-01T00:00:00.000Z' },
    blend: { a: 1, b: 3 },
  };
  const view = controlView(ctl, NOW);
  assert.deepEqual(view.off, ['weather']);
  assert.deepEqual(view.active, ['sports']);
  assert.equal(view.blendTotal, 4);
  close(view.blend.a, 0.25);
  close(view.blend.b, 0.75);
  assert.deepEqual(controlView(null, NOW), { off: [], active: [], blend: {}, blendTotal: 0 });
});
