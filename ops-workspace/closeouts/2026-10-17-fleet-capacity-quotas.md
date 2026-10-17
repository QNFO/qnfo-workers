# CLOSEOUT — fleet capacity, quotas, triage (session 2026-10-17)

Owner thread: quality gate = revision loops (not rejection), separate publish streams per property,
higher bar for papers than q08/reading/social, Zenodo/DOI deprecated, fleet must self-clear backlogs,
then: decide/implement/deploy systemwide, execute all, closeout + handoff to server-side.

## Deployed (all verified live)

| Unit | Worker | Version / object | Evidence |
|---|---|---|---|
| Atomic row claim | qnfo-research-exec | CLAIM-ATOMIC-1 | 19 claims/6h before -> 41 claims in one tick; in-flight 6 -> 48 |
| Revision cycle cap | qnfo-research-exec | `research_max_review_cycles` = 6 (was hardcoded 2) | row logged revise->review cycle=3 |
| Park re-arm sweep | qnfo-research-exec | 0.18.18-parkrearm-all, hourly at :00 | covers REVIEW-UNRESOLVED-PARK-1 + PARKED-POISON-1 (review/complete/reconcile); 358 + 46 rows re-armed |
| Publish width | qnfo-research-exec | RESEARCH_PARALLEL_MAX 24 -> 48; `research_parallel`=12 | 48 bursts hit Workers AI 3021 rate limit, dialled to 12 |
| Ready pool | ops_config | `research_ready_cap` 3 -> 120 | deferred 567 -> 102 queued |
| Per-property quotas | 3 workers | `publish_quotas` {"papers.qnfo.org":24,"q08.org":10,"reading.q08.org":5} | q08 published_pieces.property column added; count scoped per property |
| Owner-request guard | qnfo-audit D1 | trigger `owner_request_requires_card` | auto-creates human_actions card before any owner-request close |
| Value triage | agent_issues | `issue_value_policy` | 129 flat medium -> 1 critical / 23 high / 108 medium / 15 low |

Commits pushed: 311a6ab, d1945e5b, c40c667e, 968c8635, 49260f3c (+ merge commits).

## Metrics

| Metric | Start | End |
|---|---|---|
| total over 120 min SLA | 651 | 161 |
| content items over SLA | 448 | 7 |
| open issues | 215 | 147 |
| in-flight research rows | 6 | 48 |

## Corrections made to earlier reports (do not resurrect the wrong premises)

1. Code lane is NOT failing at 56% currently: 0 failures in the last 48 h; the 70 are historical,
   each class already guarded (LARGE-FILE-WINDOW-1, TIMEOUT_MAX=6, FAIL-SIGNATURE-STOP-1, PUBLISH-SUITE-CHECK-1).
2. The ">60k char reroute" was already retired by LARGE-FILE-WINDOW-1 (MAX_LARGE_FILE_CHARS = 6,000,000).
3. The drainer is alive: folded into qnfo-lifecycle as backlogMod, triage_state rows prove it runs.
4. 147 open issues are a triage queue, not a broken machine.

## Open work for server-side (in priority order)

1. **q08 composer title contract** — 50 of 209 gate failures are drafts with no H1 at all
   (TITLE-PROMOTE-1 already handles recoverable leading lines). Fix belongs in the writer prompt,
   must be validated against real drafts before deploy. Do not relax the gate.
2. **12 METRIC-TRIGGER issues** — each needs its own metric read (WORKERS-AI-COST-30D-USD,
   SOCIAL-POSTS-7D, RUNTIME-VERIFIED-SHARE-24H, GUARD-RCS, REMEDY-EFFICACY-30D, DRIVER-DRAIN-24H,
   ISSUES-UNPROBED-60M, SPOF-ALTERNATES-UNTESTED-24H, ...). Close only when the metric is inside
   threshold, with the reading as issue_triage.close_evidence. issues_unprobed_60m = 35 is NOT resolved.
3. **108 medium issues** — need per-item evidence to rank; categorical priority is a coarse lever only.
4. **Owner-request gap** — 3 cards exist; ~17 earlier requests were closed by automated channels
   before the guard existed. The trigger now prevents recurrence but cannot restore those.
5. **q08 gate rejection (#2748)** — 93% fail; untouched by decision (policy, not defect).
6. **research_queued_180m = 23** — re-armed rows entering the ready queue; watch, do not re-park.
7. **Workers AI rate limit** — width 48 trips `3021: inference request per min rate reached`.
   Sustainable path is retry-with-backoff in aiText, not a bigger number.

## Rules the fleet now enforces (do not bypass)

- `issue_close_evidence_required`: no close without issue_triage.close_evidence.
- `owner_request_requires_card`: an owner request cannot close without a human_actions card.
- `NO-CLAUDE-RUNTIME-DEPENDENCY-1`: owner cards never route to or link that vendor.
- Separate publish quotas per property: papers / q08.org / reading.q08.org never share a counter.

## Reverts

    UPDATE ops_config SET value='24'   WHERE key='research_parallel';
    UPDATE ops_config SET value='120'  WHERE key='research_ready_cap';
    UPDATE ops_config SET value='6'    WHERE key='research_max_review_cycles';
    UPDATE pipeline_flags SET value='1' WHERE key='social_paused';
    DROP TRIGGER owner_request_requires_card;
    INSERT OR REPLACE INTO ops_config(key,value) VALUES('park_rearm','off');  -- stops the hourly sweep
    -- 462 declined rows preserved in bak_20261017_deferred_drain
