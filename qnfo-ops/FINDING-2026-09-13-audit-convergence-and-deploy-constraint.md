# FINDING — convergence: the fleet's own audit loop filed the same defects; the constraint is deployment

Date: 2026-09-13 (~15:05Z). Closes the fleet-wide error audit.

## The convergence

At 2026-09-13T14:35–14:36Z — while this audit was running — 11 new `agent_issues` were filed
(open). They **independently reproduce nearly every finding in
`qnfo-ops/REMEDIATION-2026-09-13-fleet-errors.md`**:

| issue | subject | audit finding |
|---|---|---|
| 707 | `[qnfo-ops] F14 - async job runner replays thinking-mode turns: deepseek 400 'reasonin…'` | the original `reasoning_content` question |
| 706 | `[qnfo-research-exec] NL is not defined - version_queue v2-drain blocked` | NL ReferenceError |
| 705 | `CORRECTED/RETRACTED: ALERT-PAYLOAD-FALSE was wrong on both counts` | fleet self-retraction |
| 704 | `TERMINAL-FAILURE-NEVER-MATERIALIZES: alerts report 'terminal research failure 45/51'` | E3 / alert mismatch |
| 703 | `PIPELINE-SUPERVISOR-SILENT-48H: qnfo-research-supervisor v1.1.1 emitted nothing since…` | stale-loop class |
| 701 | `FLEET-MONITORING blind spot: 43 of 55 workers unprobed and a second unreconciled roster` | "43 unprobed" |
| 698 | `AI-GATEWAY request-shape defects: 20402 HTTP 400s across three models` | prober / request-shape |
| 697 | `ALERT-STORM qnfo-pipeline-ops: 802 critical alerts and the v0.5.5 fix sits undeployed` | the 802 figure + deploy bottleneck |
| 693 | `WORKER-HEALTH-FALSE-530 (2026-09-13)` | E7 |
| 692 | `DEPLOY-HEALER-NO-BACKOFF: 51 of 76 fleet_deploys rows are unbounded hour…` | E18 (they: 51/76; I: 54/76) |
| 691 | `DEPLOY-CANONICAL-CORRUPT: r2:qnfo-canonical/qnfo-cloud-ops.js is invalid…` | new root cause |

## Two root causes these tickets add

1. **#691 `DEPLOY-CANONICAL-CORRUPT`** — `r2:qnfo-canonical/qnfo-cloud-ops.js` is **invalid**.
   This explains `qnfo-cloud-ops`'s **25** deploy failures: the canonical *content* is corrupt.
   It generalises the `10021` multi-module failure into a second canonical-content failure mode.
2. **#692 `DEPLOY-HEALER-NO-BACKOFF`** — the healer retries failures **hourly with no backoff**.
   Mechanism behind `personal-companion`'s 26 and `qnfo-cloud-ops`'s 25 consecutive failures:
   an invalid canonical is retried forever at 1/hour.

## The backlog counter is not a health signal — measured

| time | closed | open | resolved | wontfix | total |
|---|---|---|---|---|---|
| ~14:08Z | 320 | **3** | 105 | 258 | 686 |
| ~14:20Z | 320 | **0** | 108 | 258 | 686 |
| ~15:05Z | 327 | **11** | 105 | 260 | 703 |

3 → 0 → 11 in under an hour, and `resolved` went **108 → 105** (rows were un-resolved).
The resolver's own note: *"sweep lacks state-change dedup"*. **Any single reading is
meaningless** — the "0 open" I reported was a transient trough between sweep cycles.

## Conclusion

The **detection** half of "audit, fix, resolve" is already working autonomously — the fleet found
these defects without me, and filed them with owners. The **repair** half is not: #697 records
that the alert-storm fix "sits undeployed", 9 workers are deployed-ahead of a stale canonical,
and the deploy pipeline rejects 85% of attempts today. **The constraint is deployment, not
detection.**
