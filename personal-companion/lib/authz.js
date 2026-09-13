// personal-companion/lib/authz.js
//
// Added 2026-09-13 by qnfo-ops. Pure functions only: no bindings, no I/O, no
// network. Safe to unit-test in isolation. See authz.test.js.
//
// WHY THIS EXISTS
// The deployed worker's authorized() fails OPEN:
//
//   function authorized(request, env) {
//     var key = env.COMPANION_KEY || "";
//     if (!key) return true;          // <-- every request is authorized when unset
//     ...
//
// Measured 2026-09-13, from an anonymous client carrying no key, twice:
//   GET https://reading.q08.org/                                     -> HTTP 200, full body
//   GET https://reading.q08.org/p/2026-09-13-notes-ae043d7af833c67b  -> HTTP 200, full body
// The masthead on those same pages reads "Written for one reader. Private." and
// README.md states the page is "gated by COMPANION_KEY". The word "Private." is a
// label, not access control, and a false privacy claim is worse than none: it
// changes what the reader is willing to put into the record it describes.
//
// TWO DEFECTS, TWO FIXES
//   1. gateDecision() fails CLOSED when no key is configured, instead of open.
//   2. privacyLabel() makes the masthead agree with the gate that actually ran, so
//      the label cannot lie about access control even if the key is never set.
//
// Public-by-design routes stay public. README says the RSS feed is "shared with
// anyone who wants to follow along", so /health and the feeds remain
// unauthenticated on purpose. Nothing here changes that.

// Routes that are public by design. Keep in sync with gateDecision().
export const PUBLIC_ROUTES = ['/health', '/rss.xml', '/feed'];

// Constant-time-ish compare. Not a substitute for a real MAC, but it removes the
// early-exit timing signal a plain !== comparison leaves.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Drop-in replacement for authorized() in worker.js. Same accepted credentials
// (?k= query parameter, or the pc_key cookie), inverted default.
export function authorized(request, env) {
  var key = (env && env.COMPANION_KEY) || '';
  if (!key) return false; // was: return true (fail-open)
  var u = new URL(request.url);
  var q = u.searchParams.get('k') || '';
  var c = request.headers.get('Cookie') || '';
  var i = c.indexOf('pc_key=');
  var ck = i >= 0 ? c.slice(i + 7).split(';')[0] : '';
  return safeEqual(q, key) || safeEqual(ck, key);
}

// The single call site the worker should use. Returns a decision object rather
// than a bare boolean so the reason can be logged: an unauthorized request is
// otherwise indistinguishable from a typo in the key.
export function gateDecision(pathname, request, env) {
  var key = (env && env.COMPANION_KEY) || '';
  var isPublic = pathname === '/health' || pathname === '/rss.xml' || pathname === '/feed';
  if (isPublic) return { allow: true, reason: 'public route' };
  if (!key) return { allow: false, reason: 'COMPANION_KEY unset: fail closed' };
  var u = new URL(request.url);
  var q = u.searchParams.get('k') || '';
  var c = request.headers.get('Cookie') || '';
  var i = c.indexOf('pc_key=');
  var ck = i >= 0 ? c.slice(i + 7).split(';')[0] : '';
  if (safeEqual(q, key) || safeEqual(ck, key)) return { allow: true, reason: 'key ok' };
  return { allow: false, reason: 'missing or invalid key' };
}

// Masthead label. "Private." is only true when a key is actually configured.
// Use this in the render instead of the hardcoded string.
export function privacyLabel(env) {
  return ((env && env.COMPANION_KEY) || '') ? 'Private.' : 'Public.';
}
