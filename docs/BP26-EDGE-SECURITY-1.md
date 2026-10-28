# BP26-EDGE-SECURITY-1: secure headers, Turnstile on public forms, per-address limit on the fleet's OTP endpoints

Issue 4452, charter pillar security. Metrics `security_headers_pass` and `turnstile_on_public_forms` (collector `scripts/bp26_web.py`, rows in `qnfo-audit.bp26_probe_results`).
This section belongs in `docs/BP26-SECURITY-CLUSTER.md`; that file was under another session's live work claim when this was written, so it lives here and the cluster file should link it.

## Sources
- Turnstile server-side validation (https://developers.cloudflare.com/turnstile/get-started/server-side-validation/): the widget puts a `cf-turnstile-response` token in the form; a token is valid for 300 seconds and is single-use; it must be redeemed at `siteverify` from the server; the response carries `success`, `action`, `hostname`, `error-codes`; validate `action` (set with `data-action`) so a token minted on one form is not replayed on another.
- Widget modes (https://developers.cloudflare.com/turnstile/concepts/widget/): `data-appearance="interaction-only"` hides the widget unless a visible challenge is needed.
- OWASP Secure Headers Project (https://owasp.org/www-project-secure-headers/): HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options` or CSP `frame-ancestors`, `Permissions-Policy`.
- OWASP Authentication Cheat Sheet, "Protect against automated attacks" (https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html): rate limit per account and per source, not only globally; a global lock-out is itself a denial of service on the owner.
- Cloudflare Durable Objects rate limiting pattern (https://developers.cloudflare.com/durable-objects/examples/): a Durable Object gives one strongly consistent counter per key, which a Worker's per-isolate memory cannot.

## Headers (`security_headers_pass` 0.846, two failing hosts)
| Host | Cause | Fix |
|---|---|---|
| ask.qwav.tech | `qnfo-ai-search` `page()` sent nosniff and a referrer policy only (HSTS came from the zone) | 2.12.0: the page response also sends `X-Frame-Options: DENY`, its own HSTS and a Permissions-Policy |
| qwav.org | Cloudflare Pages project `qwav` (no worker): `/papers/` answers with Pages' default nosniff and referrer policy; no `_headers` file at the repository root (the one under `papers/` is not served as rules) | QNFO/QWAV PR 133 adds a root `_headers` (HSTS, `X-Frame-Options: SAMEORIGIN`, Permissions-Policy); deployed by the `qwav-pages-deploy` workflow |

The other 11 hosts already pass. Rollback: delete `_headers` and redeploy the Pages project; revert the `page()` header keys.

## Turnstile (`turnstile_on_public_forms` 0 of 13)
What the collector detects: a page counts as protected when its fetched HTML matches `cf-turnstile|challenges.cloudflare.com/turnstile|turnstile.render`; every data-collecting form on that page then counts as protected (a page-level test, forms JavaScript renders later are invisible to it). So the widget markup must be in the served HTML; verification is what makes it real, and that lives in each owning worker's handler.

Shared block: `scripts/turnstile-edge.snippet.js` (one file, copied verbatim between `BEGIN/END TURNSTILE-EDGE-1` markers into each worker, because a Worker deploys as one module; `scripts/turnstile-edge.test.mjs` fails when a copy drifts or a mirror differs).
- `turnstileWidget(env, action)`: `<div class="cf-turnstile">` with the public sitekey (`env.TURNSTILE_SITEKEY` or the committed default), `data-action`, `interaction-only`.
- `turnstileVerify(env, token, ip, action)`: **fail-open only when `env.TURNSTILE_SECRET` is absent** (so the order of deploy and secret write cannot lock anyone out); once it is bound, a missing, oversized, rejected, replayed (`timeout-or-duplicate`), wrong-action or unverifiable token is refused (siteverify timeout 10 s, any error fails closed).

| Form | Worker (version) | Gate |
|---|---|---|
| ideas.qnfo.org `ideas-sub-form` | idea-hub 1.15.0 | `subscribeProxy` verifies action `ideas_subscribe` |
| ipatent.qnfo.org `draftForm`, `subForm` (and the guide page's subscribe form) | qnfo-ipatent 3.20.0 | `handleDraft` (`ipatent_draft`, the model-cost surface) and `handleSubscribe` (`ipatent_subscribe`) |
| ask.qwav.tech `ask-sub-form`, `f0`, `f1` | qnfo-ai-search 2.12.0 | widget in the subscribe form; the token travels with the cross-origin POST to the qnfo.org proxy, which verifies it (qnfo-gateway, below). `f0`/`f1` only read (answers are capped per visitor; OPEN-ACCESS-1 keeps reads open), so they are covered by the page widget and not gated |
| fleet.qnfo.org `cform` | qnfo-fleet-dashboard 1.73.0 | one widget with the console script; `/api/cmd/code` (e-mail the owner a sign-in code) verifies action `fleet_cmd` |
| travel.q08.org `/travel/login` | personal-companion 1.44.0 (module `travel.js`, inlined) | `POST /travel/login` verifies action `travel_login` before it mails a code |
| qnfo.org / papers.qnfo.org `ld-sub-form`, `ask-f` | qnfo-gateway | **not in this change**: file held by another session. Filed as `BP26-EDGE-TURNSTILE-GATEWAY-1` (migration `2026-10-28-bp26-edge-security-followups.sql`, with `code-task:` line) |
| q08.org `/subscribe`, `q08-fb` | q08-signal-engine | **not in this change**: file held by another session. Filed as `BP26-EDGE-TURNSTILE-Q08-1` |

Widget: `qnfo-edge-forms-1` (account `quniverse`, mode managed, domains qnfo.org, fleet.qnfo.org, ideas.qnfo.org, ipatent.qnfo.org, papers.qnfo.org, q08.org, travel.q08.org, ask.qwav.tech, ask.qwav.org, qwav.org), sitekey `0x4AAAAAAFpf2WdSG4-h5mu_` (public; created through the Cloudflare MCP with the account OAuth connection, which accepted `POST /accounts/{id}/challenges/widgets`). The secret is never in the repository or this document; it is written to `TURNSTILE_SECRET` on each worker through the secret lock (see Secrets, below).

Caveat, stated plainly: the collector's score is page-level, so it will read 1.0 once the pages ship the widget even for forms whose handler is not yet gated (the two filed follow-ups, and the read-only ask forms). The real protection is the table above; the filed issues close the remaining gap.

Failure modes: (1) the widget script is blocked (privacy extension, offline): the form is refused once the secret is bound; the page text says to reload, and there is no bypass by design. (2) A token is single-use: every client resets its widget after each request. (3) Turnstile outage: fail-closed once bound, so a Cloudflare outage blocks new subscriptions until it ends. (4) `siteverify` hostname is not checked (the widget is bound to the domain list at creation), only the action.

## OTP rate limit (`qnfo-fleet-dashboard` 1.73.0)
Before: `/api/cmd/code` and `/api/cmd/verify` were limited by D1 counters over the whole fleet (codes per hour, wrong tries per hour), so any visitor could exhaust the hour's budget and lock the owner out; `/api/owner/login` kept one global failure record in `loop_meta`.
Now: class `OtpRateLimiter` (Durable Object, sqlite storage, binding `OTP_LIMITER`, declared in `wrangler.toml` with `[exports.OtpRateLimiter]` as qnfo-fleet-control declares FleetAdvisor) holds a sliding window per scope and `CF-Connecting-IP`: 5 code requests, 12 verify attempts and 10 owner-login attempts per 10 minutes per address. The D1 counters stay as the global backstop. The limiter fails open when the binding is absent or the object is unreachable, so it can never lock the owner out by itself. Window state is deleted by an alarm one window after the last hit.
Cost: one Durable Object request per OTP call (a few a day), inside the free allowance.
Failure modes: an address behind a shared NAT shares one window (acceptable: the owner is one person); IPv6 privacy addresses rotate, so the limit slows a single host and does not stop a distributed one, which is what the Turnstile gate and the global D1 counters are for.
Rollback: remove the three `otpRateLimit` calls (or delete the binding: it then fails open).

## Secrets (shared-secrets rules)
`TURNSTILE_SECRET` is bound with the secret-lock lease (`POST /secret-lock/acquire`, per worker) and released after; see the PR for the exact writes performed and their re-probe. If the repo token or the MCP connection is refused for a secret write, the code stays fail-open and the refusal text is recorded on issue 4452.

## Verification
- `node scripts/turnstile-edge.test.mjs` (54 checks: verbatim copies, mirrors, fail-open/fail-closed behaviour, widget markup, limiter window).
- Live, after deploy: `curl -s https://ideas.qnfo.org/ | grep -c cf-turnstile` etc., then `bp26_probe_results` for `turnstile_on_public_forms` and `security_headers_pass` after the next consumer run.
