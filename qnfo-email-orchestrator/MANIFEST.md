# qnfo-email-orchestrator — Worker Manifest
**Version:** 0.3.3 (2026-09-01, OPS.003.R3 — RED-TEAM blockers closed)
**Repo dir:** qnfo-email-orchestrator/
**Production URL:** https://qnfo-email-orchestrator.q08.workers.dev
**Deploy:** version 92dc2b0d-5fbf-462e-afb7-edab958c063c, deployment ae800984-2275-4e88-9380-0b818711b1d2 (100%)
**Cron:** 0 */3 * * * (UTC) — set via API, confirmed 2026-09-01T09:17:50Z

> Aligned to docs/STRATEGY.md (STRATEGY-1, 2026-10-01). Where they differ, STRATEGY.md wins.

## Current state (read from worker.js and wrangler.toml, 2026-10-01)
This section resolves the contradiction below between "Monday = autonomous outreach SEND wave ... (cap 5/day)" and
"Never sends external outreach". **The second is true for the current code: this worker sends no outreach.**
- Code version `0.4.2-heartbeat`. wrangler.toml crons: `0 */3 * * *` and `*/15 * * * *`.
- The cron handler runs only the reply drafter and the fleet heartbeat. The reply drafter reads `email_reply_queue`
  (inbound mail), sends a 1-2 sentence acknowledgment from qnfo@qnfo.org to the inbound sender via qnfo-email `/send`
  only for simple logistical messages, and escalates anything technical, scientific, licensing, legal, financial or
  opinion-seeking. These are replies to mail received, not outreach.
- `/run/cadence` is manual and authenticated (per a code comment the worker has no workers.dev route, CRON_ONLY #1402).
  Apart from qnfo-email `/stats`, it calls `/outreach/replies`, `/outreach/followup`, `/scan` and `/outreach/weekly`,
  which qnfo-email (`qnfo-email/worker.js`) does not implement; qnfo-email answers an unknown GET with its route list, so
  replies, follow-ups and scan come back empty. The cadence path sends nothing externally and writes a `cadence_runs` row.
- The v0.3.2/v0.3.3 Monday send wave (Zenodo scan, arXiv researcher scan, send from rowan.quni@qnfo.org, cap 5/day) is
  not in the current code. It is kept below as history.
- Outreach policy for the fleet (caps 8/day in total and 3/day per domain, consent rules, kill switch) is
  docs/STRATEGY.md section 5. Cold email is sent by qnfo-outreach and the qnfo-cloud-ops outreach job, not by this worker.

## Purpose
Cloud replacement for local DeepChat cronjob **3851f539** (qnfo-email-inbox-check).
Runs the QNFO email + outreach cadence every 3 hours WITHOUT local Windows DeepChat.

## What it does (per run)
**v0.3.3 additions (RED-TEAM blockers, R3):** author-bound email verification (role/journal blocklist + name-token match on first author, \\email{}/mailto: macros, .tex-focused), dedup status IN (sent,replied), per-paper try/catch, honest subject (no fake Re:), AI draft anchored to server-side facts only, e-print pacing/retry, atomic run-lock claim. First autonomous Monday wave: 2026-09-07 (receipt to alerts@).

**v0.3.2 additions (red-team C1-C6), history only, not in the current code (see Current state):** Monday = autonomous outreach SEND wave: Zenodo scan (Quni-Gudzinas, 90d) -> physics paper select -> arXiv researcher scan (3s pacing, 429 retry) -> email verification via arXiv source tarball -> D1 dedup -> Workers AI draft (academic template) -> send from rowan.quni@qnfo.org (cap 5/day). SKIPPED list with reasons for unverified/already-contacted. Marker case fix, classifyRegex tightening, audit_d1 real probe, run-lock, paginated followup count.
- Inbox check across all qnfo.org domains (via qnfo-email service binding)
- Outreach reply detection + classification (taxonomy: positive/critical/dismissive/read-later/collaboration)
- Follow-up readiness count (>14d silent; 0 eligible per NO-FOLLOW-UP-DEFAULT-1)
- Mon: arXiv scan -> outreach_candidates queue (email_verified=0, NEVER auto-sent)
- Wed: response check only
- Fri: weekly report + self-audit
- Receipt emailed to alerts@qnfo.org (D1 sink; never personal inbox — DIGEST-TO-PERSONAL-1). Removed in 0.3.5 (no self-mail, policy 2026-09-09); `cadence_runs` in D1 is the record.

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
- Never sends external outreach (v0.3.x queues candidates only; 0.4.2 has no outreach send path, see Current state)
- Never fabricates email addresses; unverified contacts SKIPPED
- No follow-ups to silent recipients from this worker (user policy 2026-08-20). Fleet outreach policy since 2026-10-01
  allows one honest `Following up:` message from the outreach engines (docs/STRATEGY.md section 5)
- /run/* requires Bearer EMAIL_API_KEY or x-api-key
