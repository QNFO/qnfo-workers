#!/usr/bin/env node
// Q08 publication preflight guard.
// Fails closed unless q08.org is actually served by q08-signal-engine and exposes
// Q08-specific routes. This intentionally detects fallback-homepage false 200s.

const checks = [];

async function fetchText(url) {
  const r = await fetch(url, { redirect: 'follow' });
  const text = await r.text();
  return { url, status: r.status, text };
}

function add(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
}

const health = await fetchText('https://q08.org/health');
const apiPieces = await fetchText('https://q08.org/api/pieces');
const feed = await fetchText('https://q08.org/feed.xml');
const workerHealth = await fetchText('https://q08-signal-engine.q08.workers.dev/health');

const qnfoFallback = /QNFO\s+—\s+Research Foundation|Latest papers|All 458 papers/.test(health.text);
const hasQ08WorkerMarker = /q08-signal-engine|published_pieces|pieces|signal/i.test(health.text) && !qnfoFallback;

add('q08.org/health is Q08-specific, not QNFO fallback homepage', health.status === 200 && hasQ08WorkerMarker, `status=${health.status}; fallback=${qnfoFallback}; sample=${health.text.slice(0, 160).replace(/\s+/g, ' ')}`);
add('q08.org/api/pieces is not fallback homepage', apiPieces.status === 200 && !/QNFO\s+—\s+Research Foundation|Latest papers/.test(apiPieces.text), `status=${apiPieces.status}; sample=${apiPieces.text.slice(0, 160).replace(/\s+/g, ' ')}`);
add('q08.org/feed.xml is feed-like, not fallback homepage', feed.status === 200 && /<rss|<feed|<item|<entry/i.test(feed.text) && !/QNFO\s+—\s+Research Foundation/.test(feed.text), `status=${feed.status}; sample=${feed.text.slice(0, 160).replace(/\s+/g, ' ')}`);
add('workers.dev route for q08-signal-engine exists', workerHealth.status !== 404, `status=${workerHealth.status}; sample=${workerHealth.text.slice(0, 160).replace(/\s+/g, ' ')}`);

const ok = checks.every(c => c.ok);
console.log(JSON.stringify({ ok, checks }, null, 2));
if (!ok) process.exit(1);
