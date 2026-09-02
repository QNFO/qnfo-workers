# qnfo-auditor

Fleet Event Audit & Act loop — the automated REVIEW → AUDIT → ACT → LEARN procedure over ALL QNFO event/log stores. Runs unattended (no user, no DeepChat), cloud-native.

- **Worker:** qnfo-auditor (v1.0.2)
- **Schedule:** standard pass 01:45/13:45 UTC daily; deep pass Monday 06:45 UTC (registered in [triggers])
- **Canonical source:** QNFO/qnfo-workers/qnfo-auditor
- **Runbook:** QNFO/qnfo-ops/AUDT/FLEET-AUDIT-AND-ACT-PROCEDURE.md
- **Data:** qnfo-audit D1 (fleet_audit_runs, kaizen_candidates; reads issue_ledger/issue_events, cloud_ops_events, alerts, agent_issues, audit_trail, deployment_history, errata_queue/errata_actions)

## Checks (deterministic, resilient)
| Check | Action |
|---|---|
| C1 | Flag stale open HIGH/CRITICAL (>7d untouched) |
| C2 | Auto-close stale low/warning ledger entries (no recurrence ≥14d, occ≤3) |
| C3 | Reopen resolved/acknowledged/muted entries with newer events (recurrence after resolution) |
| C4 | Detect silent recurring scheduler jobs (>48h no event) → ledger HIGH |
| C5 | Detect qnfo-events sweep lag (coe/alerts error rows >12h unmirrored) |
| C6 | Bridge stale open high/critical agent_issues (>30d) into the ledger |
| C7 | Flag stuck errata queue rows (>24h non-terminal) |
| C8 | Kaizen feed: recurrence-after-resolve + event clusters → kaizen_candidates; promote mature (>7d) |
| C9 | Digest state machine: email on new/increased HIGH (standard) or weekly summary (deep) |
| C10 | Resolve-on-recovery: close open ledger entries when the underlying source condition clears (job resumed / errata terminal / agent_issue closed) |

v1.0.2 hardening: all time-window cutoffs against ISO-8601 columns now use JS-computed ISO bounds (no SQLite space-format literal mixing); auth is fail-closed when AUDITOR_TOKEN is unset (red-team finding).

## Endpoints (Bearer AUDITOR_TOKEN)
- GET /health · GET / · POST /v1/run (mode standard|deep) · GET /v1/runs · GET /v1/state

## Secrets
- AUDITOR_TOKEN — Bearer auth token for manual /v1 calls (also stored in .deepchat secrets store per redundancy policy)
- DIGEST_TO — fleet audit digest target = alerts@qnfo.org sink (user directive 2026-09-02: digests never email personal-domain recipients)

## Deploy
```bash
wrangler deploy
cp worker.js deployed-current.worker.js   # FLEET-SELF-DOC-1 mirror
```

**IMPORTANT:** a wrangler deploy can drop secrets that were set via the CF API (observed 2026-09-02 on v1.0.1). After ANY deploy, re-assert secrets idempotently: PUT /accounts/{acct}/workers/scripts/qnfo-auditor/secrets {name:AUDITOR_TOKEN|DIGEST_TO, type:secret_text, text:...} then verify a Bearer-authenticated /v1/run still works.
