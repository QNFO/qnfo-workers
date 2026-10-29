# QNFO FLEET MANIFEST — Cloudflare Workers Ecosystem

> Auto-generated 2026-09-12 09:33 UTC by fleet-manifest-sweep.py v2.0 (self-contained enumeration + /health probes).
> Living inventory; weekly Fleet Drift cron (42b1988c) re-generates this file from live CF state - do NOT hand-edit;
> deploy history lives in qnfo-audit deployment_history + git log.

## Self-documentation policy (FLEET-SELF-DOC-1)

Every worker MUST carry: (1) VERSION reachable via /health; (2) header with purpose/canonical source;
(3) canonical repo deployed-current.worker.js. Status: OK = all; PARTIAL = versioned not repo-synced;
GAP = missing one or more. AUTH-GATED = /health behind auth (monitor must send bearer).
VERSION-FORMAT = /health version is not strict semver X.Y.Z (HUB-VERSIONING-1: no v-prefix / -suffix / absorbed-N / merged-date / slash-form).

## Fleet (54 workers)

| Worker | Live version | Modified (UTC) | Canonical repo | Repo version | Self-doc |
|---|---|---|---|---|---|
| ai-health-prober | 2.3.1 | 2026-09-12 06:49:31 | qnfo-workers/ai-health-prober | 2.3.1 | OK |
| audit-hub | 1.0.0 | 2026-09-12 06:48:37 | - | - | GAP (no repo dir) |
| calendar-api | 0.3.0 | 2026-09-10 07:35:56 | qnfo-workers/calendar | 0.3.0 | OK |
| companion-hub | 1.0.0 | 2026-09-12 06:49:06 | - | - | GAP (no repo dir) |
| errata-hub | 1.0.0 | 2026-09-12 06:51:03 | - | - | GAP (no repo dir) |
| fleet-exec | 1.0.0 | 2026-09-12 06:49:48 | - | - | GAP (no repo dir) |
| idea-hub | 1.0.0 | 2026-09-12 06:51:09 | qnfo-workers/idea-hub | 1.0.0 | OK |
| jnl-pipeline | 1.0.0 | 2026-09-12 06:51:15 | qnfo-workers/jnl-pipeline | 1.0.0 | OK |
| obsidian-writer | NO-HEALTH | 2026-09-11 09:01:13 | - | - | GAP (no repo dir) |
| osf-integrity-check | NO-HEALTH | 2026-09-10 08:22:56 | - | - | GAP (no repo dir) |
| personal-api | 3.5.0 | 2026-09-12 09:28:08 | qnfo-workers/personal-api | 3.5.0 | OK |
| personal-companion | 1.1.0 | 2026-09-12 09:32:19 | qnfo-workers/personal-companion | v1.1.0 | OK |
| qnfo-agent-orchestrator | 1.0.0 | 2026-09-12 09:28:13 | qnfo-workers/agent-orchestrator | 1.0.0 | OK |
| qnfo-agent-ws | 1.3.9 | 2026-09-11 17:08:26 | qnfo-workers/qnfo-agent-ws | 1.3.9 | OK |
| qnfo-ai | 5.25.1 | 2026-09-12 09:28:17 | qnfo-workers/qnfo-ai | 5.25.1 | OK |
| qnfo-ai-calibration | 1.1.5 | 2026-09-12 09:09:46 | qnfo-workers/qnfo-ai-calibration | 1.1.5 | OK |
| qnfo-ai-search | 1.0.2 | 2026-09-10 07:47:50 | qnfo-workers/qnfo-ai-search | 1.0.2 | OK |
| qnfo-archive | 1.2.0 | 2026-09-12 09:28:21 | - | - | GAP (no repo dir) |
| qnfo-autopilot | 0.2.0 | 2026-09-11 16:47:44 | - | - | GAP (no repo dir) |
| qnfo-backlog-exec | 1.2.6 | 2026-09-11 14:05:49 | qnfo-workers/qnfo-backlog-exec | 1.2.6 | OK |
| qnfo-chat-canary | 1.0.2 | 2026-09-10 08:23:37 | qnfo-workers/qnfo-chat-canary | 1.0.2 | OK |
| qnfo-cloud-ops | 1.14.1 | 2026-09-12 09:28:26 | qnfo-workers/qnfo-cloud-ops | 1.14.1 | OK |
| qnfo-ddocs-indexer | 1.0.0 | 2026-09-12 09:28:30 | qnfo-workers/qnfo-ddocs-indexer | UNVERSIONED | DRIFT repo=UNVERSIONED |
| qnfo-email | 1.8.0 | 2026-09-11 09:34:39 | - | - | GAP (no repo dir) |
| qnfo-email-orchestrator | 0.3.4 | 2026-09-12 09:28:34 | qnfo-workers/qnfo-email-orchestrator | 0.3.4 | OK |
| qnfo-events | 1.1.0 | 2026-09-10 08:27:30 | qnfo-workers/qnfo-events | 1.1.0 | OK |
| qnfo-fleet-control | 0.4.11 | 2026-09-12 09:06:16 | qnfo-workers/qnfo-fleet-control | 0.4.11 | OK |
| qnfo-fleet-dashboard | 1.2.0 | 2026-09-12 09:30:36 | qnfo-workers/qnfo-fleet-dashboard | 1.3.0 | DRIFT repo=1.3.0 |
| qnfo-gateway | NO-HEALTH | 2026-09-09 07:47:38 | - | - | GAP (no repo dir) |
| qnfo-impact | 0.1.0 | 2026-09-10 08:27:52 | - | - | GAP (no repo dir) |
| qnfo-infra | 1.2.3 | 2026-09-10 08:28:28 | qnfo-workers/qnfo-infra | 1.2.3 | OK |
| qnfo-intent-orchestrator | 1.3.4 | 2026-09-11 17:00:46 | qnfo-workers/qnfo-intent-orchestrator | 1.3.4 | OK |
| qnfo-ipatent | 3.4.2 | 2026-09-11 16:56:47 | qnfo-workers/qnfo-ipatent | 3.4.2 | OK |
| qnfo-kaizen | 0.3.2 | 2026-09-12 09:28:38 | qnfo-workers/qnfo-kaizen | 0.3.2 | OK |
| qnfo-lifecycle | 1.6.1 | 2026-09-12 09:28:42 | qnfo-workers/personal-lifecycle | 1.6.1 | OK |
| qnfo-memory-mcp | 2.0.3 | 2026-09-05 07:15:14 | qnfo-workers/memory-mcp | 2.0.3 | OK |
| qnfo-observability | 1.2.0 | 2026-09-12 09:18:06 | - | - | GAP (no repo dir) |
| qnfo-ops | 2.14.0 | 2026-09-12 09:31:00 | qnfo-workers/qnfo-ops | 2.13.1 | DRIFT repo=2.13.1 |
| qnfo-outreach | 0.1.0 | 2026-09-10 08:27:56 | qnfo-workers/qnfo-outreach | 0.1.0 | OK |
| qnfo-paper-explainer | 0.2.0 | 2026-09-11 14:02:26 | - | - | GAP (no repo dir) |
| qnfo-paper-indexer | 2.2.0 | 2026-09-12 09:28:46 | - | - | GAP (no repo dir) |
| qnfo-paper-reviser | 1.0.4 | 2026-09-12 09:28:50 | qnfo-workers/qnfo-paper-reviser | 1.0.4 | OK |
| qnfo-pdf | 1.0.0 | 2026-09-10 08:27:37 | qnfo-workers/qnfo-pdf | 1.0.0 | OK |
| qnfo-proof | 0.1.0 | 2026-09-10 08:27:05 | qnfo-workers/qnfo-proof | 0.1.0 | OK |
| qnfo-qwav | 2.1.0 | 2026-09-10 08:09:54 | - | - | GAP (no repo dir) |
| qnfo-research-exec | 0.8.1 | 2026-09-12 09:28:55 | qnfo-workers/qnfo-research-exec | 0.8.1 | OK |
| qnfo-research-supervisor | 1.1.1 | 2026-09-11 14:44:33 | - | - | GAP (no repo dir) |
| qnfo-signal-loop | 1.1.0 | 2026-09-12 06:49:43 | qnfo-workers/qnfo-signal-loop | 1.1.0 | OK |
| qnfo-skill-sync | 1.1.2 | 2026-09-12 06:53:18 | qnfo-workers/qnfo-skill-sync | 1.1.2 | OK |
| qnfo-social | 0.5.2 | 2026-09-12 09:28:59 | qnfo-workers/qnfo-social | 0.5.2 | OK |
| qnfo-tools-mcp | 1.1.2 | 2026-09-11 16:53:26 | qnfo-workers/qnfo-tools-mcp | 1.1.2 | OK |
| qnfo-twin-maintain | NO-HEALTH | 2026-09-11 09:03:54 | - | - | GAP (no repo dir) |
| radar-hub | 1.0.0 | 2026-09-12 06:49:55 | - | - | GAP (no repo dir) |
| research-daily-brief | 1.0.0 | 2026-09-12 09:29:02 | - | - | GAP (no repo dir) |

## Summary

- Total workers: 54
- Self-doc OK: 32
- Drift: 3
- GAP/PARTIAL: 19
- Non-semver version: 0

## Self-improvement loop

1. Fleet Drift & Self-Improvement Audit cron (weekly): re-runs this sweep, logs drift, repairs via wrangler redeploy.
2. AI Worker Health + Provider Config Guard cron (every 3h): probes qnfo-ai + personal-api chat paths.
3. QNFO Data Freshness Sync cron (every 6h): calendar + email to Vectorize.
4. Kaizen cycles: every lesson becomes a named gate, dual-written. OPS-SELF-DOC.md is the master index.