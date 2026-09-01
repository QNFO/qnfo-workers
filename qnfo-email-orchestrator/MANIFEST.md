# qnfo-email-orchestrator — Worker Manifest
**Version:** 0.3.3 (2026-09-01, OPS.003.R3 — RED-TEAM blockers closed)
**Repo dir:** qnfo-email-orchestrator/
**Production URL:** https://qnfo-email-orchestrator.q08.workers.dev
**Deploy:** version 92dc2b0d-5fbf-462e-afb7-edab958c063c, deployment ae800984-2275-4e88-9380-0b818711b1d2 (100%)
**Cron:** 0 */3 * * * (UTC) — set via API, confirmed 2026-09-01T09:17:50Z

## Purpose
Cloud replacement for local DeepChat cronjob **3851f539** (qnfo-email-inbox-check).
Runs the QNFO email + outreach cadence every 3 hours WITHOUT local Windows DeepChat.

## What it does (per run)
**v0.3.3 additions (RED-TEAM blockers, R3):** author-bound email verification (role/journal blocklist + name-token match on first author, \\email{}/mailto: macros, .tex-focused), dedup status IN (sent,replied), per-paper try/catch, honest subject (no fake Re:), AI draft anchored to server-side facts only, e-print pacing/retry, atomic run-lock claim. First autonomous Monday wave: 2026-09-07 (receipt to alerts@).

**v0.3.2 additions (red-team C1-C6):** Monday = autonomous outreach SEND wave: Zenodo scan (Quni-Gudzinas, 90d) -> physics paper select -> arXiv researcher scan (3s pacing, 429 retry) -> email verification via arXiv source tarball -> D1 dedup -> Workers AI draft (academic template) -> send from rowan.quni@qnfo.org (cap 5/day). SKIPPED list with reasons for unverified/already-contacted. Marker case fix, classifyRegex tightening, audit_d1 real probe, run-lock, paginated followup count.
- Inbox check across all qnfo.org domains (via qnfo-email service binding)
- Outreach reply detection + classification (taxonomy: positive/critical/dismissive/read-later/collaboration)
- Follow-up readiness count (>14d silent; 0 eligible per NO-FOLLOW-UP-DEFAULT-1)
- Mon: arXiv scan -> outreach_candidates queue (email_verified=0, NEVER auto-sent)
- Wed: response check only
- Fri: weekly report + self-audit
- Receipt emailed to alerts@qnfo.org (D1 sink; never personal inbox — DIGEST-TO-PERSONAL-1)

## Bindings (all required)
| Binding | Type | Value |
|---|---|---|
| AI | ai | project "<catalog>" (llama-3.1-8b-instruct-fp8) |
| AUDIT_DB | d1 | 35e2e573-92f3-46ac-83c6-22f6429fc5e5 (qnfo-audit) |
| DRY_RUN | plain_text | "false" (live cron) |
| EMAIL | service | qnfo-email (production) |
| EMAIL_API_KEY | secret_text | = qnfo-email API_KEY value |
| OUTREACH_DB | d1 | d5077252-8187-41b2-a44e-f84f8724ee36 (qnfo-outreach) |

## Deploy state
- Version 2181fc9d-8aa1-44da-88b3-24c5f60ba8fd (v0.3.1) — deployed 2026-09-01T~11:44Z
- Deployment 49ba4ebd-bf9f-4c16-bd5c-58f2bdfe7ea1 (100%)
- Deploy method: POST /versions (keep_bindings ["secret_text"]) + POST /deployments
- Recovery: see RECOVERY.md + scripts/redeploy-orchestrator.py

## Verification record (2026-09-01)
- /health: v0.3.1, all 6 bindings true, dryRunDefault=false
- /run/cadence UNAUTH -> 401 (auth gate works)
- /run/cadence AUTH -> 200; thread 395 flagged duplicate (dedup works)
- /audit: email_worker ok (v1.8), outreach_d1 ok (3 cadence_runs), audit_d1 ok
- Receipt emails: id 400 (v0.3), e4131e70-... (v0.3.1 live) — status=sent in D1

## Safety invariants
- Never sends external outreach (v0.3.x queues candidates only)
- Never fabricates email addresses; unverified contacts SKIPPED
- No follow-ups to silent recipients (user policy 2026-08-20)
- /run/* requires Bearer EMAIL_API_KEY or x-api-key
