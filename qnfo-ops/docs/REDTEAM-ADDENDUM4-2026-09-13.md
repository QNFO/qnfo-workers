# Red-team remediation — ADDENDUM 4 (2026-09-13, qnfo-ops / ops-exec)

Extends `REDTEAM-CLOSEOUT-2026-09-13.md` and ADDENDA 1–3.

## D1. Sixth fix — `qnfo-intent-orchestrator` dispatch (F10) — commit `e63a2f28`

F10 in the fix queue read: *"promoted-queued candidate never dispatched"*, fix *"set
agent_task_id on promotion"*. The real cause is two defects, and the proposed fix was aimed
at the wrong one.

### Defect 1 — the promotion → dispatch path fails silently

`triageIntent()` inserts a candidate with `status='promoted'` and never sets `agent_task_id`
(the column is absent from its INSERT list). `autoDispatch()` picks the top `promoted` row
and calls `dispatchCandidate()`, whose **first line** is:

```js
if (!env.DISPATCH_TOKEN) return { dispatched: false, error: 'DISPATCH_TOKEN not configured' };
```

That return value goes only to a `console.log` inside the `'30 6 * * *'` cron handler. No
`agent_issues` row, no `alerts` row.

### Defect 2 — `'promoted-queued'` is invisible to the dispatcher

The string `'promoted-queued'` **appears nowhere in this worker**. It is written by another
component, and it matches neither `autoDispatch()`'s `WHERE status='promoted'` nor
`dispatchCandidate()`'s update guard `WHERE id=? AND status='promoted'`.

### Live evidence (D1 `qnfo-audit.research_candidates`, 2026-09-13)

| id | status | agent_task_id | score |
|---|---|---|---|
| `cand-5f97b11cmtl1g7ve` | promoted | NULL | 78 |
| `cand-e3c0a774mtm9ovif` | cancelled-duplicate-of-published-JPCUB-LF-1 | NULL | 77 |
| `cand-b922aa1fmtl0mj9j` | promoted | NULL | 68 |
| `cand-bfabe346mtmu0sje` | **promoted-queued** | NULL | 63 |

**4 candidates exist in total. `dispatched`: 0. `research_completed`: 0. Every
`agent_task_id` is NULL.** The oldest promoted row dates from 2026-09-03, so across ~10
daily cron firings there has never been a single successful dispatch, and the old code
emitted **zero** operator-visible signals about it.

`cand-bfabe346mtmu0sje` is the ultrametric / discrete-geometry unification question —
*"Can ultrametric/discrete geometry unify quantum theory and gravity where smooth manifolds
fail?"* — the highest-value item in the queue, stalled by a state-machine gap rather than by
anything scientific.

### Verified patch behaviour

| check | old | new |
|---|---|---|
| `autoDispatch` reachable rows | 2 | **3** |
| rows the old query could **never** reach | `[cand-bfabe346mtmu0sje]` | — |
| update guard on `promoted-queued` | **REJECTS** → returns `candidate-not-promoted` | applies |
| missing `DISPATCH_TOKEN` | console.log only | `alerts` row |
| agent returns no `task_id` | console.log only | `alerts` row |

All **5 patcher anchors match exactly once** against verbatim source (sha `4f70fc49`).

### Honest limitation of this fix

The fix makes `cand-bfabe346` **reachable, not next**. `autoDispatch()` orders by
`score DESC` and dispatches at most one candidate per run (it returns early while any row is
`dispatched`). With the token fixed, the order would be 78 → 68 → 63, i.e. the ultrametric
question is third in line, roughly three days out at one dispatch per day. This patch does
not prioritise it, and I did not add a priority override — reordering the queue by anything
other than the score the triage model assigned would be me substituting my judgement for the
scoring model's, which is not a call this endpoint should make silently.

## D2. Commit ledger (complete, 11 commits)

| commit | artifact |
|---|---|
| `1cca0e95` | `qnfo-ops/docs/REDTEAM-REMEDIATION-2026-09-13.md` |
| `460481db` | `ai-health-prober/worker.js` v2.3.3 |
| `de86d3f4` | `qnfo-ai-calibration/apply-calibration-fix.mjs` v2 |
| `ada30500` | `qnfo-ops/docs/REDTEAM-CLOSEOUT-2026-09-13.md` |
| `4c5540e8` | `qnfo-error-selfheal/worker.js` v1.0.3 |
| `bdbec390` | `qnfo-ops/docs/REDTEAM-ADDENDUM-2026-09-13.md` |
| `9492003c` | `qnfo-ops/docs/REDTEAM-ADDENDUM2-2026-09-13.md` |
| `411d07e1` | `events-radar/apply-date-fix.mjs` |
| `9bde3d4d` | `qnfo-ops/docs/REDTEAM-ADDENDUM3-2026-09-13.md` |
| `e63a2f28` | `qnfo-intent-orchestrator/apply-dispatch-fix.mjs` |
| this file | addendum 4 |

## D3. Fix-queue status at close

| id | cluster | sev | status |
|---|---|---|---|
| F1 / RC-3 | ai-calibration | high | staged (FIX C in patcher v2) |
| F2 | ai-calibration | med | staged (FIX B, anchor unverified) |
| F3 / RC-4 | ai-calibration | high | staged (FIX A) |
| F4 / RC-2 | model-health | med | **fixed in source** (`ai-health-prober` v2.3.3) |
| F5 | model-health | med | open — roster entry in `qnfo-ai` source, not touched |
| F6 | infra-alerts | high | **localised** (qnfo-cloud-ops job `worker-health`); not fixable here |
| F7 | infra-alerts | med | open — job-silence, in the unreadable 129 KB file |
| F8 (date half) | radar-hub | med | staged (`apply-date-fix.mjs`) |
| F8 (timeout half) | radar-hub | med | open — deliberately not changed blind |
| F9 | research-pipeline | high | open — re-arm bound already exists in `qnfo-pipeline-ops` v0.5.3; the stuck `pending`/attempt=12 row is a different path, not investigated |
| F10 | research-pipeline | med | staged (`apply-dispatch-fix.mjs`) |
| F11 | telemetry | med | open — lives in `qnfo-ops/worker.js` (157 KB, unreadable) |
| F12 | versioning | low | open — not attempted |
| F13 | backlog | med | **blocked** — needs a D1 write path |
| RC-1 | ai-calibration | high | staged (FIX D replay guard) |
| RC-5 | ai-calibration | med | staged (FIX H vision persistence) |
| — | alert-storm | — | **already fixed in source** (`qnfo-pipeline-ops` v0.5.3-alert-dedup) |
| — | qnfo-error-selfheal regex | med | **fixed in source** (v1.0.3) |

## D4. Uncertainty

- Neither new patcher has been executed by node. Anchors and post-patch semantics were
  verified in `run_code` against verbatim source; that is not the same as running them.
- **Defect 1's root cause is inferred, not proven.** I established that `DISPATCH_TOKEN`
  being unset would produce exactly the observed symptom (zero dispatches, zero signals), but
  I could not read the worker's environment bindings, so I have not confirmed the token is
  in fact missing. The alternative — the token is set and the agent orchestrator rejects the
  call — would produce a different observable (an `agent-http-NNN` error) which is also
  console-only in the old code. Either way the fix is correct, because both failure paths are
  now visible; but the specific cause remains unconfirmed.
- `'promoted-queued'` is written by a component I did not find. Making the dispatcher accept
  it fixes the symptom; whether that state *should* exist at all is a separate design
  question I did not resolve.
- Adding an `alerts` insert to `qnfo-intent-orchestrator` assumes the `alerts` table exists
  in the same D1 (`env.D1` = qnfo-audit). `qnfo-error-selfheal` writes to `alerts` in
  qnfo-audit, so this is likely correct, but it is not verified for this worker's binding.
