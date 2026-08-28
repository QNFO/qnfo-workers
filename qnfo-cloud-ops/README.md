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

The cloud worker provides a **digest layer** (email-triage, briefing, research-scan,
weekly, weekly-ops, portfolio-sync). It does NOT (yet) replicate the deep grounding
functions — proactive outreach drafting, GTD register maintenance, contact-ledger
extraction, Zenodo ADR-014/SEO audits, Zenodo stats upserts. Those functions remain
on the local scheduled tasks until their data sources (contact-ledger, GTD register,
Zenodo scripts) move cloud-side.

| Local job | Cloud covers | Still local (deep grounding) | Status |
|---|---|---|---|
| qnfo-email-inbox-check + outreach (3851f539) | inbox check + triage digest | **proactive outreach** (contact-ledger dedup, arXiv verification, LLM drafting, 3-5/day cap) | ✅ RESUMED — outreach must not be dropped |
| Daily Briefing PDB (a82062c7) | D1 emails+intents digest | **GTD register + outreach-log** (primary sources) | ✅ RESUMED |
| Research Scan GTD extractor (fdf1403c) | arXiv scan digest | **GTD extraction → contact-ledger queue + GTD register** | ✅ RESUMED |
| Weekly Ops merged audits (8eb69c12) | cost audit (weekly-ops) | Zenodo ADR-014/SEO/D4-D5/kaizen/retrospective | ✅ RESUMED |
| Zenodo Stats Delta (384c5299) | — | full zenodo_stats delta upsert | ✅ RESUMED |
| Weekly Review GTD (382376cd) | weekly digest | Obsidian review | ⏳ local (Obsidian-bound) |
| Portfolio Public Sync (ec43131a) | portfolio-sync digest | GitHub PR sync | ⏳ local |
| Research Weekly (a3c0c2b4) | research-scan + weekly | Obsidian intelligence note | ⏳ local (Obsidian-bound) |
| Outlook calendar sync (78136b24) | — | — | ⏳ local (Outlook COM; Graph API path pending) |
| Outlook GTD triage (754b49ce) | — | — | ⏳ local (Outlook COM; Graph API path pending) |
| Personal Twin sweep (b1abb235) | — | — | ⏳ local (browser/IMAP; cloud path pending) |
| DeepChat DB maintenance / settings backup | — | — | ⏳ local (DeepChat app DB — inherently local) |

**2026-08-28 red-team correction:** the initial migration paused 5 local jobs,
but the cloud worker only replaced the digest surface — pausing dropped proactive
outreach, GTD grounding, and Zenodo audits (3 HARD findings). Those 5 jobs were
RESUMED and the matrix corrected. Full cloud-only operation requires moving the
contact-ledger, GTD register, and Zenodo/Outlook scripts to cloud stores first —
tracked as follow-up work.
