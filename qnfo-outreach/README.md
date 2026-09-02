# qnfo-outreach

QNFO automated outreach + open submissions engine (cloud-native, 100% autonomous).

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
- **Cron**: 0 11 * * 1-5 (full pipeline). Legacy slot 0 9 * * * tolerated: mine+draft only, no sends.
- **Safety**: ACTIVATION_AT 2026-09-15; kill switch pipeline_state.external_sends_enabled=0;
  caps global 8/day, per-campaign daily_cap/total_cap, per-domain 3/day; no-repeat bridge across
  sends + legacy outreach_campaigns + qnfo-audit.outreach_log + contact_ledger opt-outs; spam-token
  subject blacklist; warm-up self-checks to alerts@qnfo.org only (2026-09-08 .. 2026-09-15).
- **Companion strategy**: QNFO/qnfo-ops/docs/OUTREACH-AUTOMATION-STRATEGY.md (programs P-A..P-F).
