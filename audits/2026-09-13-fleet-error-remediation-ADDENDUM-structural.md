# ADDENDUM — the structural reason the fleet's defects are never resolved permanently

Date: 2026-09-13. Author: qnfo-ops endpoint (Chatbox session).
Companion to `audits/2026-09-13-fleet-error-remediation.md` and
`audits/2026-09-13-RUNBOOK-deploy-pending-fixes.md`.

The first document catalogued the defects. This one records why they persist. Every value is a tool
return from this session.

## 1. There is a remediation queue, it is fully specified, and it has never drained

`fleet_issue_dispatch` — 34 rows, **all `state='queued'`**, spanning `2026-09-12T09:47:18Z` to
`2026-09-13T14:01:38Z` (~28 hours).

| measure | value |
|---|---|
| rows | 34 |
| rows in state `queued` | **34 (all)** |
| rows never attempted (`exec_attempts=0`) | 29 |
| **summed `exec_attempts` across all 34** | **5** |
| rows with `exec_state IS NULL` | 9 |
| rows that left `queued` | **0** |

Each row carries `owner`, `action`, a `remediation.summary`, and a `gh_number`. The work is
specified, assigned, and not executed. Not one row has an observable success *or* failure
transition, so the queue cannot distinguish "not yet run" from "run and silently lost".

**The fleet already knows about the largest error class in this audit and holds a specified fix
that has never run.** Row `iss-cac511bc`, action `model-fallback-pin`, names exactly the five models
independently found degraded in `ai_gateway_failures`:

```
@cf/baai/bge-base-en-v1.5  @cf/google/gemma-4-26b-a4b-it  @cf/qwen/qwen2.5-coder-32b-instruct
@cf/qwen/qwen3.8-27b       @cf/zai-org/glm-5.2
```

That is the 20,402 HTTP 400s plus 38,113 HTTP 429s, detected, diagnosed, assigned an owner and an
action, and left queued.

The dispatcher also misreports its own contents: row `iss-ac576b99` is titled *"8 worker(s) with 24h
errors"* while its own `detail` field reads *"1 worker(s) with 24h errors: qnfo-fleet-dashboard(3)"*.
Title and detail are computed from different snapshots.

## 2. Four parallel issue ledgers, five different open-backlog numbers

| ledger | open | total | newest activity |
|---|---|---|---|
| `agent_issues` (read by `ops_issues_list`, `backlog-exec`) | 16 | ~708 | 2026-09-13 |
| `issue_ledger` | 7 | 326 | 2026-09-13T14:15:06Z |
| `fleet_issue_log` | 8 standing fingerprints | — | 2026-09-13T14:16:36Z |
| `fleet_issue_dispatch` | 34 queued | 34 | 2026-09-13T14:01:38Z |

`backlog_status` returned `openBacklog: 14` while `agent_issues` showed 8 open at the same moment.
A `fleet_issue_dispatch` row (`iss-b4a143c0`) reports *"19 open of 665"* with `resolved c=72` — a
snapshot matching neither ledger.

Consequence: no number is authoritative, and **a closure in one ledger cannot be verified against the
others**. Each system can believe another is handling a given defect.

The same pattern appears a second time in `fleet_deploy_state`, which carries `scanerr:*` keys for 38
workers, including names the registry calls merged or dead (`fleet-scheduler`, `fleet-executor`,
`qnfo-errata-watch/respond/publish`), plus 2 `nocanon` and 7 `stale-canon`.

## 3. Verified example of an unverifiable closure

Issue **699** (`INTAKE-STALL`) was closed by a concurrent writer while I worked. I re-read the
underlying data immediately after:

```
idea_proposals: triaged_hold 543, triaged_accepted 14, ensemble-registered 1, new 0
```

Byte-identical to the pre-closure reading. The closure may be defensible — if `triaged_hold` is a
deliberate triage decision there is no "stall", and 0 rows are `new` — but the **alert text is
factually false either way**: it reads *"496 proposals stuck new"* while no row occupies `new`. The
watchdog counts a status that cannot change, so no real-world event can clear the alert. Recorded as
an addendum on open issue 697.

This is the same shape as issue #648 (`ALERT-STORM-DETECTED qnfo-pipeline-ops`), closed while the
storm continued to 802 criticals.

## 4. Tickets filed this session

| id | class |
|---|---|
| 697 | ALERT-STORM `qnfo-pipeline-ops`, 802 criticals, v0.5.5 undeployed |
| 698 | AI-GATEWAY request-shape, 20,402 HTTP 400s across three models |
| 701 | FLEET-MONITORING blind spot, 43 of 55 workers unprobed |
| 708 | FLEET-IMPROVEMENTS dead end, 31 proposed / 44 approved, no consumer |
| 709 | GATEWAY-QUALITY `blank-audit`, 19–30% junk responses, three consecutive days |
| 710 | CHECKER-FAILOPEN, publishes without fact-check |
| 711 | AI-LATENCY, 16% of queries >60s |
| 712 | QNFO.ORG 5xx burst 2026-09-10, ~10 hours, no root cause on record |
| 713 | **DISPATCH-QUEUE-NEVER-DRAINS** |
| 714 | **ISSUE-SYSTEM-SPRAWL** |
| 695, 696 | closed as duplicates of concurrently-filed 691, 694 |

## 5. What this changes about "resolved permanently"

The first document's conclusion — that fixes are written and not delivered — is necessary but not
sufficient. Three independent stalls are stacked:

1. **Authoring → canonical.** The fixes exist in the repo; the canonical artifacts are stale or
   corrupt. (`version-compare.mjs`, `v0.5.5`, `v1.1.6`)
2. **Canonical → production.** No deploy path is reachable from the ops endpoint (`web_fetch` is
   GET-only, `run_code` has no network, `qnfo-fleet-control` is `routes: null`).
3. **Detection → execution.** `fleet_issue_dispatch` has 34 specified remediations and has never
   executed one.

Stage 3 is the one that does not require a deploy, and it is the one nobody is watching. Fixing
stage 1 or 2 without stage 3 means the next defect takes the same path.

## Failure modes against this addendum

- `fleet_issue_dispatch.exec_attempts` summing to 5 is not proof that no action was taken — only that
  the queue records no execution. An out-of-band executor writing elsewhere would be invisible here.
- I did not read the dispatcher's source, so I cannot say whether `queued` is a terminal state by
  design, or whether the drain is a cron that is itself silently failing. Both readings fit.
- The 34-row count and the ledger totals were read at different instants while at least two writers
  were active, so they are not a consistent snapshot.
