# Fleet closeout — 2026-10-17

**Owner directive (in force):** THE SYSTEM SHALL ALWAYS DECIDE, IMPLEMENT, AND DEPLOY SYSTEMWIDE ACROSS THE FLEET.
Recorded in `docs/AUTONOMOUS-OPERATION-DOCTRINE.md` (standing directive) and `ops_config.OWNER_DIRECTIVE_2026_10_17_ALWAYS_DEPLOY`.

## Deployed and verified (/health, 2026-10-17T16:05Z)

| Worker | Live version |
|---|---|
| qnfo-code-orchestrator | 0.17.2-ceil-visible |
| qnfo-fleet-dashboard | 1.39.2-owner-voice-cap-parity |
| qnfo-social | 0.16.2-slot-reach |
| qnfo-ai-calibration | 1.5.5-spend-limited-read |
| qnfo-research-exec | 0.18.23-cite-backfill-order |
| qnfo-fleet-control | 0.33.3-tick-visibility |
| qnfo-deploy-guard | 1.3.26-log-catches |

## Decisions merged

- **PRS-SCOPE-1** (PR 1336): PRs validate their changed directories; the full 424-suite sweep stays on main pushes; the four cross-directory gate steps run on main only. This removed the fleet-wide merge stall.
- **NO-PROGRESS-CEILING-1** (PR 1302, then PR 1343): a code task that stops producing new failure signatures is failed and its file freed; 0.17.2 fails closed and audits `code-task.ceiling-error` when the ceiling itself cannot run.
- **CODE-TASK-STATUS-UNWEDGE-1** (PR 1343 + migration 2026-10-17): the recursive reroute trigger is dropped; the worker's `handoff()` already files the same issue in code.
- **Doctrine directive** (PR 1337): the owner's standing instruction, verbatim, with the machinery that carries it.
- **OWNER-VOICE-CAP-PARITY-1** (issue 2729, live 1.38.x–1.39.2): guard cap parity at 21/week and `SOCIAL_ALLOW_Q08=1`; `social_paused=0` since 14:38:38Z.
- **AI-calibration 1.5.5**: both 24h reads ignore `rate-capacity`, `unfunded` and `spend-limited`.
- PR 1303 merged (actions pinned); PR 1297 closed by the fleet after main gained the same fleet-control fix; PRs 1307, 1319, 1323 and 1339 closed as superseded with evidence.

## Root causes fixed

1. **D1 trigger recursion wedged the code loop.** `code_tasks_needs_human_reroute_au` inserted into `agent_issues` from its body; after the agent_issues trigger graph grew, D1 rejected **every** `UPDATE OF status` on `code_tasks` at prepare time (`triggers nested too deep`), even `WHERE 0`. Settle, claim and the ceiling's cut all failed, and `pathBusy`'s catch read the failure as “file free”. Trigger dropped live and by migration; the ceiling now fails closed.
2. **The deploy-gate coupled every PR to every worker's drift.** The full set ran for control-plane/shared changes, so one stale suite blocked the whole fleet. PRS-SCOPE-1 scopes PR validation to the change; main keeps the full sweep.
3. **A stuck code task could hold a file indefinitely.** The no-progress ceiling now cuts a task that reprises failures with no new signature for `path_hold_max_min` (default 180 min) after 2+ attempts, legacy tasks anchored at `created_at`.
4. **The owner-voice guard judged Bluesky at 2/week while qnfo-social ran 21/week**, so the 05:00Z run re-paused every channel daily. Cap parity plus the q08 gate is live; the 7-day feed holds 4–5 posts against a cap of 21.
5. **Stale advisory state.** 676 expired work claims were released; the claim ledger now only shows live claims.

## Live probes passed

- `UPDATE code_tasks SET status=status WHERE 0` succeeds (was `triggers nested too deep`).
- Stuck task `ct_74odxsub9qx13s` is `failed` with the NO-PROGRESS-CEILING-1 reason and its work claim released; intake on the freed file enqueued `ct_ndnfg4kxco2hlr` for issue #2727 at 16:00:45Z.
- qnfo-social drained at 15:30/15:31Z without a paused skip: one post and one Substack rollup went out (Bluesky spacing next 06:18Z).
- Main deploy-gate green on pushes 15:45–15:50Z; every PR since merged through the scoped gate.

## Open queue, owned server-side (not on this thread)

- 173 open issues at closeout: 1 critical (2669 COMPANION-PUBLISH-STALL-AUTO-1), 39 high, 115 medium, 18 low. 24 carry `code-task:` lines for the code loop; 40 high/critical are covered by active remediation contracts (596 active in total); the remainder belong to the loop-breaker, metric and audit loops, which are running (fleet_tick 16:00:34Z).
- Closed with evidence here: 2812 (trigger wedge), 2726 (path-claim ceiling), 2804 (PR 1323 conflict).
- 2626 (owner-voice guard) stays open until the next 05:00Z guard run records a clean check; probe: `social_paused` stays `0` and qnfo-social posts within 2 h.
- Filed with probes: 2817 AGENT-ISSUES-TRIGGER-DEPTH-1, 2818 SOCIAL-PAUSE-BYPASS-1.
- No PR from this work remains open (1344 was merged by its session).

## Standing probes (for the loops)

- **Trigger depth:** after any migration, `UPDATE code_tasks SET status=status WHERE 0` and a direct `INSERT INTO agent_issues (...)` must succeed — including that INSERT compiled inside another trigger body.
- **Ceiling:** a task with 2+ failures and no new failure signature for `path_hold_max_min` is failed on the next dispatch touch, with a `code-task.no-progress` event.
- **Gate scope:** a PR runs only its changed directories; a main push runs the full set.
- **Social pause:** with `social_paused=1`, every drain logs `skipped: paused`.

## Thread

This chat thread is closed. Nothing above depends on it: every fix is merged, deployed and verified, and every open item lives in D1 (`agent_issues`, `issue_triage`, `remediation_contracts`) where the fleet loops pick it up.
