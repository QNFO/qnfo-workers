// TURNSTILE-EDGE-1 (BP26-EDGE-SECURITY-1): the shared Turnstile block. A Worker is one file, so this text is copied verbatim between the
// BEGIN and END markers into every worker that serves a public form; scripts/turnstile-edge.test.mjs fails when a copy drifts from this file.
// The sitekey is public (it is in every page that shows the widget); the secret is the worker secret TURNSTILE_SECRET and is never in the repository.
// Fail-open ONLY when TURNSTILE_SECRET is absent (so deploy order is safe); once the secret is bound a missing, wrong, replayed or unverifiable token is refused.
// BEGIN TURNSTILE-EDGE-1
var TURNSTILE_SITEKEY_DEFAULT = "0x4AAAAAAFpf2WdSG4-h5mu_";
var TURNSTILE_SCRIPT = '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>';
function turnstileWidget(env, action) {
  var key = (env && env.TURNSTILE_SITEKEY) || TURNSTILE_SITEKEY_DEFAULT;
  return '<div class="cf-turnstile" data-sitekey="' + key + '" data-action="' + String(action || "form").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) + '" data-appearance="interaction-only" data-theme="auto"></div>';
}
async function turnstileVerify(env, token, ip, action) {
  if (!env || !env.TURNSTILE_SECRET) return { ok: true, skipped: true, reason: "no-secret" };
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return { ok: false, reason: "missing-token" };
  try {
    var body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
    if (ip) body.set("remoteip", ip);
    var r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: body, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { ok: false, reason: "siteverify-" + r.status };
    var j = await r.json();
    if (!j || j.success !== true) return { ok: false, reason: "rejected:" + String((j && j["error-codes"]) || "").slice(0, 80) };
    if (action && j.action && j.action !== action) return { ok: false, reason: "action-mismatch" };
    return { ok: true, reason: "verified" };
  } catch (e) {
    return { ok: false, reason: "siteverify-error" };
  }
}
// END TURNSTILE-EDGE-1
