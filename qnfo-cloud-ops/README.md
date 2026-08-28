# qnfo-cloud-ops — scheduled cloud operations (2026-08-28)

All QNFO operational jobs run ENTIRELY at the Cloudflare edge — no local
scheduler, no local scripts, no manual triggers, no user input (user directive
2026-08-28). Deployed at `https://qnfo-cloud-ops.q08.workers.dev`.

## Cron triggers (Amsterdam wall-clock)

| Cron (UTC) | Job | What it does |
|---|---|---|
| `0 8,14 * * 1-5` | email-triage | Checks ALL qnfo.org inboxes via the qnfo-email Worker (`/emails/recent?status=processed`), classifies actionable vs noise (spam senders, SRS/DMARC/bounce system mail), marks noise `spam`, sends digest of actionable items to `DIGEST_TO` |
| `30 8 * * 1-5` | briefing | Daily decision-item digest from D1 qnfo-audit: actionable emails (24h) + pending intents |
| `0 10 * * 1-5` | research-scan | arXiv API scan on QNFO topics (ultrametric, p-adic, Bruhat-Tits, quantum energy, J/S, QEC) → digest + D1 `research_scan_log` |
| `0 17 * * 5` | weekly | 7-day aggregate digest (emails, AI queries, intents, records fleet) |
| `0 6 * * 7` | weekly-ops | Cloudflare cost/analytics audit via qnfo-infra (`COST-AUDIT-MISS-AI-1`; flags >$90/30d spend-limit gate) |
| `0 8 * * 1` | portfolio-sync | Portfolio program snapshot digest from D1 qnfo-audit.programs |

Every job: fetch → build text digest → send via Cloudflare Email Sending
(`SEND_EMAIL` binding, from alerts@qnfo.org) → log to D1 `audit_sessions`.
Digest recipient = `DIGEST_TO` secret (default rwnquni@outlook.com).

## Manual / API trigger (diagnostics only — normal operation is cron-only)

```
POST https://qnfo-cloud-ops.q08.workers.dev/run?job=email-triage
Authorization: Bearer <INFRA_TOKEN>
```

## Bindings & secrets

- `AUDIT` — qnfo-audit D1 (audit_sessions, emails, intents, programs)
- `EMAIL` — qnfo-email service + `EMAIL_API_KEY` secret
- `QNFO_INFRA` — qnfo-infra service + `INFRA_TOKEN` secret
- `SEND_EMAIL` — Cloudflare Email Sending
- `DIGEST_TO` — digest recipient secret

## Migration matrix (local scheduled tasks → cloud)

| Local job | Cloud replacement | Status |
|---|---|---|
| qnfo-email-inbox-check + outreach (3851f539) | email-triage cron | ✅ local paused 2026-08-28 |
| Daily Briefing PDB (a82062c7) | briefing cron | ✅ local paused 2026-08-28 |
| Research Scan GTD extractor (fdf1403c) | research-scan cron | ✅ local paused 2026-08-28 |
| Weekly Ops merged audits (8eb69c12) | weekly-ops cron | ✅ local paused 2026-08-28 |
| Zenodo Stats Delta (384c5299) | weekly-ops (cost) + manual zenodo script | ✅ local paused 2026-08-28 |
| Weekly Review GTD (382376cd) | weekly digest (cloud); Obsidian review local | ⏳ local remains (Obsidian-bound) |
| Portfolio Public Sync (ec43131a) | portfolio-sync digest (cloud) | ⏳ local remains for GitHub PR |
| Research Weekly (a3c0c2b4) | research-scan + weekly | ⏳ local remains (Obsidian-bound) |
| Outlook calendar sync (78136b24) | — | ⏳ local (Outlook COM; Graph API path pending) |
| Outlook GTD triage (754b49ce) | — | ⏳ local (Outlook COM; Graph API path pending) |
| Personal Twin sweep (b1abb235) | personal-life indexers | ⏳ local (browser/IMAP; cloud path pending) |
| DeepChat DB maintenance / settings backup (e6783983/d0cb2031) | — | ⏳ local (DeepChat app DB — inherently local) |

Obsidian-bound jobs (weekly review, research weekly) and DeepChat-internal
maintenance cannot run at the edge until the Obsidian vault / GTD register and
DeepChat app DB themselves move to cloud stores — tracked as follow-up work.
