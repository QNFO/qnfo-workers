# Fleetwide Service-Level Policy (SLA/SLO) — QNFO autonomous fleet

Canonical: QNFO/qnfo-ops/docs/SLA.md (2026-09-06)
Status: ACTIVE. Overrides prior per-row due-date defaults. Enforced by kaizen daily digest + agent_issue auto-filing + ops-cycle gates.

## 1. Purpose
Establish a reasonable, falsifiable level-of-service for resolving every open work item
(register rows, agent_issues, intents, audit findings) across the QNFO/QWAV fleet. The
default mode is autonomous, user-free resolution; nothing sits waiting on a human.

## 2. Severity tiers + SLO (resolve = DoD met + evidence logged + row dispositioned)
| Tier | Definition | SLO (time-to-resolve) | Example |
|------|-----------|----------------------|---------|
| P0 | Outage / security / data-loss / token leak | < 4h | worker down, secret exposed |
| P1 | Blocking a core function or user-visible path | < 24h | broken publish pipeline, model-key drift |
| P2 | Feature / implementation / integration | < 72h (3d) | new executor, radar, workflow |
| P3 | Value-gated / nice-to-have / optional | < 7d OR defer-with-rationale | TIER2 features |

## 3. Escalation + disposition rules
- owner=user rows: resolved autonomously same-cycle (execute now / convert to dated
  scheduled-runner / cancel-with-rationale). Never left waiting (USER-FREE-RESOLUTION-1).
- Any open row past its SLO: auto-file an agent_issue + surface in the kaizen daily digest.
- Any open row past 2x SLO: escalate to the operator via a single blocking question.
- Every row carries a falsifiable DoD + evidence pointer; no owner-assigned-only closeout
  (NO-DEFERRED-ZERO-1, GTD-REGISTER-LIVE-1).

## 4. Acceleration directive (2026-09-06)
- No open row may carry a due date > 7 days from open-date without a dated cloud cron /
  durable-job path. Rows without an executor path are pulled to <= 72h or deferred with
  written rationale.
- Containers executor rows accelerated: 92 (RepoExecutor) + 99 (GUARD) -> 2026-09-08;
  96 (TIER0) + 97 (TIER1) -> 2026-09-08; 98 (TIER2) -> deferred-with-rationale
  (value-gated: no concrete task requires cron-container/WebSocket/R2-FUSE/SSH/hooks).

## 5. Enforcement instruments (existing, verified)
- v_waiting_on_human MUST equal 0 after every ops cycle (view in qnfo-audit).
- kaizen daily digest + qnfo-kaizen weekly watchtower (rows overdue -> surfaced).
- fleet-cron-coverage-audit (row 95): every agent-owned open row has a dated cloud cron
  or durable-job executor; kaizen 2026-09-07 report is the enforcement point.

## 6. Claim-sheet (self-dogfood)
| claim | evidence | confidence | status |
|---|---|---|---|
| 45 open register rows enumerated 2026-09-06 | qnfo-audit task_dod_register: open=45, done=40, cancelled=15 | High (live D1 read) | verified |
| v_waiting_on_human = 0 | SELECT count(*) FROM v_waiting_on_human -> 0 | High | verified |
| Containers image blocker lifted (no Docker) | docker.io/nikolaik/python-nodejs:python3.12-nodejs22-slim exists (Docker Hub API 2026-09-06) | High (existence) / Medium (git-binary inside, not layer-verified) | verified |
