# Q08 publication recovery and preflight procedure

Date: 2026-09-26
Owner: QNFO ops
Related audit issues: #966, #1118, #1119

## Current verified failure

The Q08 publication path is not merely missing a curated article insertion route. The Q08 signal service itself is absent from the live Cloudflare account surface exposed to ops.

Evidence collected by `qnfo-ops` on 2026-09-26:

- `cf_worker_bindings(q08-signal-engine)` returned Cloudflare API 404 code `10007`: `This Worker does not exist on your account.`
- `https://q08-signal-engine.q08.workers.dev/health` returned HTTP 404.
- `https://q08-signal-engine.q08.workers.dev/api/pieces` returned HTTP 404.
- `https://q08.org/health`, `https://q08.org/api/pieces`, `https://q08.org/feed.xml`, and `https://q08.org/p/2026-09-24-hidden-signature-sampler-control-ai-text-watermarking` all returned the QNFO foundation homepage, not Q08 signal-engine JSON/feed/article output.
- `service_discover(q08-signal-engine)` returned no live service row.
- The repository still contains `q08-signal-engine/wrangler.toml`, whose intended bindings include D1 `DB = q08-signal` database id `10fd74b7-c4b3-43c7-9ca5-855213f44a69`, but that D1 database is not exposed through the `qnfo-ops` D1 aliases.

Consequence: a live Q08 publication cannot be completed by qnfo-ops until the worker/domain route and one write path are restored.

## Required restoration path

1. Restore or intentionally retire the `q08-signal-engine` worker.
   - If restoring: deploy this directory using the repo deployment path with the bindings in `q08-signal-engine/wrangler.toml`.
   - If retiring: update this repo, the service registry, and user-facing expectations so q08.org is no longer treated as a publication target.

2. Restore the domain route.
   - `q08.org/*` and `www.q08.org/*` must route to `q08-signal-engine` if Q08 remains live.
   - Verification must show `https://q08.org/health` returning a Q08 worker/version JSON or equivalent Q08-specific health response, not the QNFO foundation homepage.

3. Add a safe curated-publication path.
   - Preferred: bind the `q08-signal` D1 database to `qnfo-ops` under an explicit alias and guard writes through `ops_d1_write`.
   - Alternative: add a bearer-token admin route to `q08-signal-engine` that accepts exactly the curated publication fields, is idempotent by slug, and never exposes generic SQL or unauthenticated mutation.

4. Publish the queued article.
   - Workspace draft: `q08/ai-text-watermarking-draft-2026-09-24.md`
   - Target slug: `2026-09-24-hidden-signature-sampler-control-ai-text-watermarking`
   - Target title: `The hidden signature that only works while the signer controls the pen`

5. Verify post-publication.
   - Article URL returns HTTP 200 and contains the title/body.
   - RSS/feed includes the slug or title.
   - Q08 health piece count increments and latest slug is the target article, unless the worker intentionally does not report latest-piece metadata.
   - No generic write/admin route remains exposed without authentication.

## Publication preflight gate

Before qnfo-ops accepts or reports a publication SLA for any site, it must verify all five conditions in the same turn:

1. Service registry row exists and matches the live Cloudflare worker name.
2. Domain health/API route returns service-specific output, not a fallback homepage.
3. Target persistence resource is write-reachable from ops or there is an authenticated admin mutation route.
4. Worker deploy/rollback path can move full source without truncation and has a version/race guard.
5. Post-publication URL/feed/health checks are known and executable.

If any condition fails, qnfo-ops must file a blocker issue immediately and answer with `INCOMPLETE` plus the verified missing capability. It must not continue to imply that publication is only a matter of more attempts.

## Known article-specific blocked state

The article draft is preserved server-side, but it is not a public publication. The research queue/candidate may continue independently, but queued/promoted research is not a substitute for public Q08 publication.

Failure mode to keep visible: q08.org currently serves QNFO foundation content. A path returning HTTP 200 is therefore insufficient evidence of publication; verification must search for the article title/body and Q08-specific route metadata.
