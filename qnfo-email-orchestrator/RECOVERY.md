# qnfo-email-orchestrator — Recovery & Backup Procedure
**Goal:** restore the worker from the version-controlled source in minutes if
corrupted, lost, or recreated. Zero-dependency on local state beyond this repo.

## Triggers to use this
1. Worker deleted / corrupted / returns 500 on /health
2. Bindings lost (e.g., accidental redeploy without BINDING-PRESERVATION-1)
3. Cron trigger missing after a delete/recreate
4. Account migration

## Recovery steps (manual, ~5 min)
1. `git pull` in qnfo-workers (this repo) — get qnfo-email-orchestrator/worker.js
2. Ensure secrets exist on the account:
   ```
   wrangler secret put EMAIL_API_KEY --name qnfo-email-orchestrator
   ```
   (value = qnfo-email API_KEY; stored in CF account, not in repo)
3. Run the automated redeploy (preferred):
   ```
   python scripts/redeploy-orchestrator.py
   ```
   (reads worker.js, POST /versions with keep_bindings ["secret_text"] + full binding
   set + DRY_RUN=false, then POST /deployments 100% — mirrors the verified OPS.003 flow)
4. Restore cron if missing:
   PUT /accounts/{account}/workers/scripts/qnfo-email-orchestrator/schedules
   body: [{"cron": "0 */3 * * *"}]
5. Verify: GET /health (expect version 0.3.1, all bindings true) and GET /audit
   (expect email_worker ok + outreach_d1 ok). Then trigger an authed dry cadence run:
   `curl -H "x-api-key: <key>" ".../run/cadence?mode=dry"`
6. Confirm D1 qnfo-outreach tables exist (outreach_campaigns, cadence_runs,
   outreach_candidates) — recreate from MANIFEST.md if wiped.

## What is NOT in the repo (secrets — keep it that way)
- EMAIL_API_KEY value
- qnfo-email API_KEY value
- CF API token

## Backup cadence
- Source of truth: this repo (git). Commit after every worker change (OPS.003.8+).
- D1 data: qnfo-outreach + qnfo-audit are Cloudflare-managed (automatic daily
  backups per CF D1 policy). No local copies needed.
- Version history: Cloudflare keeps past versions/deployments (rollback via
  GET /deployments + POST /deployments with prior version_id).

## Autonomous audit / upgrade (OPS.003.9)
- The worker self-audits on every Friday weekly report (GET /audit + self_audit block).
- Weekly kaizen-deep-scan (Mon 10:00 UTC cronjob) reviews worker logs/costs.
- Weekly QNFO Secrets Rotation Audit (Mon 08:00 UTC) covers EMAIL_API_KEY.
- Any worker upgrade: commit to this repo first, then deploy via scripts/, then
  verify /health + /audit + one authed live cadence run, then update MANIFEST.md.
