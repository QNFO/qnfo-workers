# VERIFICATION 12 — the fleet's own issue ledger, and the inert remediation loop

Date: 2026-09-13. Read from `fleet_dashboard_state.state_json` (39,531 chars, regenerated
`2026-09-13T14:16:39Z`). This is the fleet's authoritative self-assessment.

## 1. The fleet already tracks 8 issues, with GitHub links

```
issue_counts: { err: 3, warn: 5, total: 8 }
verdict: "ACTION_NEEDED"
```

| sev | issue | occurrences | GitHub | suggested action |
|---|---|---|---|---|
| **err** | Ops AI gateway (24h): 225 calls, **26 failed (`ok=0`)**, avg **200,300 ms** | 93 | `qnfo-fleet-issues#21` | `gateway-classify` |
| **err** | Queue version_queue: **drafted=0 error=1** — publish failure (slug-level) | 84 | `#12` | `queue-drain` |
| **err** | **8 workers with 24h errors**: `qnfo-fleet-dashboard(18)`, calendar-api(2), ai-health-prober(1), qnfo-fleet-control(1), fleet-exec(1), qnfo-autopilot(1), qnfo-research-exec(1), jnl-pipeline(1) | 93 | `#4` | `worker-rollback` |
| warn | Agent issues (open): **14 open of 703** | 92 | `#18` | `issue-triage` |
| warn | Integration chain Research execution: **published 7d=0** | 93 | `#6` | `chain-produce` |
| warn | Integration chain Telemetry: **trace rows 24h=0** | 93 | `#7` | `chain-produce` |
| warn | Queue research_queue: open=4 failed=0 **newest=102 h STALE** | 93 | `#22` | `queue-drain` |
| warn | Queue outreach_queue: open=20 all `needs-contact` **SELECTOR-DRIFT** | 93 | `#23` | `queue-drain` |

Every one carries `auto_actionable: true` and a structured `remediation.suggested_action`.

**`qnfo-fleet-dashboard` has 18 errors in 24 h — the fleet's top erroring worker** — and it is the
worker that produces this very state blob.

## 2. THE FINDING — the remediation loop is inert

```
loop.last_execute:        2026-09-13T14:01:53.857Z
loop.last_execute_summary: { scanned: 25, executed: 0, failed: 0, needs_human: 0, no_action: 0 }
loop.last_sync:           2026-09-13T14:01:51.830Z
loop.last_summary:        { tracked: 10, created: 0, cleared: 1, escalated: 0, dispatched: 0, reopened: 0 }
```

**It scans 25 items and executes 0.** Worse, the counters do not reconcile:
`executed + failed + needs_human + no_action = 0` against `scanned = 25`, leaving **25
unaccounted for**. So either the counters are broken, or the executor silently skips every item it
scans.

Either way, the consequence is direct and answers the user's original instruction: **the fleet's
error *detection* is comprehensive and automated; its error *correction* is not running.** Eight
issues are tracked, three at `err`, all flagged `auto_actionable: true`, and the loop that is
supposed to action them reports zero executions.

This is the same signature as the rest of this audit, one level up: *detection without
consumption*. Alert storm, masked v2-drain rows, staged-never-applied patches, `telemetry_analyze`
filing 0, and now a remediation loop that scans 25 and executes 0.

## 3. The consolidation plan explains 11 of the 12 ghost names

`QNFO/qnfo-ops/docs/WORKER-CONSOLIDATION-PLAN.md` (2,841 B, sha `c168fd59`) plans
`81 -> ~45-50`. Its merge sources match the ghost roster from `VERIFICATION-7` almost exactly:

| ghost name | consolidation plan disposition |
|---|---|
| `qnfo-thread-ingest` | wave G → idea-miner |
| `qnfo-skills-discovery` | wave G → skill-sync |
| `qnfo-research-radar` | wave B → radar-hub |
| `qnfo-register-guard` | wave G → auditor |
| `qnfo-idea-triage` · `qnfo-idea-miner` · `qnfo-idea-factory` | wave F → idea-intake |
| `qnfo-fleet-deploy` · `qnfo-fleet-calibrator` · `qnfo-fleet-advisor` | wave A → fleet-deploy (itself later superseded by fleet-control) |
| `qnfo-error-selfheal` | wave G → events+error-selfheal |

**`qnfo-pipeline-ops` is the only one of the twelve absent from the plan.** Its disappearance
between 2026-09-11T16:30Z and 09-12T08:15Z is therefore an **undocumented deletion** — not part of
the consolidation. That is a stronger statement than `VERIFICATION-11` could make, and it is the
residual anomaly: a worker was removed without a plan entry, and something still emits alerts under
its name.

The plan also states PRUNE WAVE 1 was **executed** (81→77): `qnfo-code-agent`,
`qnfo-code-orchestrator`, `qnfo-container-executor`, `qnfo-containers-pilot`.

## 4. Coverage figures, and one that is suspicious

```
coverage: { live_workers: 55, scheduled_tracked: 40, unregistered: 0 }
unattributed_errors: 0
integration: { registered: 55, live: 55, ghost: [], unregistered: [] }
```

The fleet reports **zero unregistered workers and zero ghosts** — it believes it is fully
reconciled at 55. Yet `qnfo-pipeline-ops` alerts hourly and is in none of the rosters. So
`unregistered: 0` is measuring the registry against the live CF script list, and a worker deleted
from both is invisible to that check. **The reconciliation is self-consistent and blind.**

## 5. Not readable

`github_repo_read` on `QNFO/qnfo-fleet-issues` returns `path not found` for the repo root, so the
issue bodies themselves (#4, #6, #7, #12, #18, #21, #22, #23) are not retrievable from this
endpoint. Only the summary rows above are available, via the dashboard state blob.

## 6. What this means for the instruction "audit, fix, and resolve permanently"

- **Audit:** already automated, and better than this session's manual version. Eight issues with
  severities, owners, occurrence counts and GitHub links.
- **Fix:** not happening. `executed: 0`.
- **Resolve permanently:** blocked behind the same single point — nothing consumes the detections.

The highest-leverage item in the entire fleet is not any individual defect. It is
`loop.last_execute_summary.executed === 0`.
