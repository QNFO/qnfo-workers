// personal-companion/lib/authz.test.js
//
// Dependency-free test suite for authz.js. Added 2026-09-13 by qnfo-ops.
// Run: node lib/authz.test.js
//
// The first block is the regression this module exists for. Before the fix,
// `authorized()` returned true whenever COMPANION_KEY was unset, so all three
// of those assertions read `true` — which is exactly how a public site came to
// describe itself as private.

import { safeEqual, authorized, gateDecision, privacyLabel, PUBLIC_ROUTES } from './authz.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}
function req(url, cookie) {
  return {
    url: url,
    headers: { get: (h) => (String(h).toLowerCase() === 'cookie' ? (cookie || null) : null) }
  };
}

// --- fail-closed: the regression ---------------------------------------------
ok('no key -> authorized() is false', authorized(req('https://x/'), {}) === false);
ok('no key -> gate denies a piece route', gateDecision('/p/slug', req('https://x/'), {}).allow === false);
ok('undefined env -> gate denies', gateDecision('/p/slug', req('https://x/'), undefined).allow === false);
ok('empty-string key -> gate denies', gateDecision('/p/slug', req('https://x/'), { COMPANION_KEY: '' }).allow === false);
ok('denial reason names the cause', gateDecision('/p/slug', req('https://x/'), {}).reason.indexOf('fail closed') >= 0);

// --- public by design, unchanged ---------------------------------------------
ok('public /health allowed without key', gateDecision('/health', req('https://x/health'), {}).allow === true);
for (const r of PUBLIC_ROUTES) {
  ok('PUBLIC_ROUTES entry allowed: ' + r, gateDecision(r, req('https://x' + r), {}).allow === true);
}
ok('public route wins even when a key is set', gateDecision('/health', req('https://x/health'), { COMPANION_KEY: 'k' }).allow === true);

// --- key configured: credential acceptance -----------------------------------
const env = { COMPANION_KEY: 'k-123456' };
ok('correct query key allowed', gateDecision('/p/s', req('https://x/p/s?k=k-123456'), env).allow === true);
ok('correct cookie allowed', gateDecision('/p/s', req('https://x/p/s', 'pc_key=k-123456'), env).allow === true);
ok('cookie among others allowed', gateDecision('/p/s', req('https://x/p/s', 'a=1; pc_key=k-123456; b=2'), env).allow === true);
ok('wrong key denied', gateDecision('/p/s', req('https://x/p/s?k=nope'), env).allow === false);
ok('prefix key denied', gateDecision('/p/s', req('https://x/p/s?k=k-12345'), env).allow === false);
ok('no credentials denied', gateDecision('/p/s', req('https://x/p/s'), env).allow === false);
ok('wrong-length cookie denied', gateDecision('/p/s', req('https://x/p/s', 'pc_key=k-1234567'), env).allow === false);
ok('authorized() agrees with gateDecision()', authorized(req('https://x/p/s?k=k-123456'), env) === true);

// --- safeEqual ---------------------------------------------------------------
ok('safeEqual equal strings', safeEqual('abc', 'abc') === true);
ok('safeEqual empty strings', safeEqual('', '') === true);
ok('safeEqual length mismatch', safeEqual('abc', 'abcd') === false);
ok('safeEqual last char differs', safeEqual('abc', 'abd') === false);
ok('safeEqual non-string left', safeEqual(1, '1') === false);
ok('safeEqual undefined right', safeEqual('', undefined) === false);

// --- the label must agree with the gate --------------------------------------
ok('label Public when key unset', privacyLabel({}) === 'Public.');
ok('label Public when key empty', privacyLabel({ COMPANION_KEY: '' }) === 'Public.');
ok('label Private when key set', privacyLabel(env) === 'Private.');
ok('label agrees with gate: unset key means not private', privacyLabel({}) !== 'Private.');

console.log('authz.test.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail) throw new Error(fail + ' assertion(s) failed');
