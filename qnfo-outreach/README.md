# qnfo-outreach

> Aligned to docs/STRATEGY.md (STRATEGY-1, 2026-10-01). Where they differ, STRATEGY.md wins.

QNFO automated outreach + open submissions engine (cloud-native, 100% autonomous; sends in the owner's voice as gated T1
under docs/STRATEGY.md section 5).

- **Purpose**: campaign-driven, date-gated, capped external outreach - RFC requests, async
  informational interview questions, journalist/blogger pitches, grant EOIs - with a cross-system
  no-repeat bridge, contacts mining (GitHub public profiles), funnel accounting, RFC comment
  intake, and warm-up self-checks before activation.
- **Capabilities**: GET /health, GET /api/contacts|campaigns|sends (auth-gated), POST /rfc/:slug/comment
  (public), GET /run (preview: mine+draft only), POST /run?commit=1 (auth-gated full pipeline).
- **Deploy method**: Workers API PUT multipart (metadata.json: main_module=worker.js,
  Content-Type application/javascript+module; bindings OUTREACH_D1 + QNFO_AUDIT + LIVING_PAPER +
  SEND_EMAIL). See qnfo-ops cloud deploy recipe (WRANGLER-API-PUT-NOOP-1 / DEPLOY-VERIFY-VERSION-1:
  verify /health version after deploy).
- **Canonical source**: QNFO/qnfo-workers/qnfo-outreach/worker.js (+ schema.sql, wrangler.toml).
  deployed-current.worker.js mirrors the deployed bundle (FLEET-SELF-DOC-1).
- **Cron**: 0 11 * * 2-6, Monday-Friday (full pipeline). Cloudflare numbers weekdays 1=Sunday, so the earlier
  `1-5` ran Sunday-Thursday (OUTREACH-CF-DOW-1, 0.3.8). Legacy slot 0 9 * * * tolerated: mine+draft only, no sends.
- **Safety**: ACTIVATION_AT 2026-09-15; kill switch pipeline_state.external_sends_enabled=0;
  caps global 8/day, per-campaign daily_cap/total_cap, per-domain 3/day; no-repeat bridge across
  sends + legacy outreach_campaigns + qnfo-audit.outreach_log + contact_ledger opt-outs; spam-token
  subject blacklist; warm-up self-checks to alerts@qnfo.org only (2026-09-08 .. 2026-09-15).
- **Outreach policy (docs/STRATEGY.md section 5, OUTREACH-CONSENT-1; changed 2026-10-01)**:
  - Caps: at most 8/day **in total across both engines** (this worker and the qnfo-cloud-ops outreach job) and 3/day per
    domain. In the code as of 2026-10-01 each engine counts only its own sends (`GLOBAL_DAILY_CAP = 8` over this worker's
    `sends` table; qnfo-cloud-ops has its own 8/day counter and no per-domain cap), so the shared total is policy that the
    code does not yet enforce.
  - Consent: a real reason tied to the recipient's own work; an opt-out line in every message; the suppression list is
    honoured by both engines; one honest follow-up (`Following up:`, never a fake `Re:`); no repeat contact after an
    opt-out, bounce or reply.
  - Kill switch `pipeline_state.external_sends_enabled`: paused 2026-10-01; resumes after OUTREACH-CONSENT-1 deploys.
- **Companion strategy**: QNFO/qnfo-ops/docs/OUTREACH-AUTOMATION-STRATEGY.md (programs P-A..P-F). Where it differs from
  docs/STRATEGY.md section 5, STRATEGY.md wins.
