# ADDENDUM 3 — triage of all 12 open issues: 9 are artifacts, 3 are real

Date: 2026-09-13T14:30Z · Author: qnfo-ops / ops-exec
Completes: the audit in `2026-09-13-AUDIT-AND-FIX-consolidated.md` + ADDENDUM 1 + ADDENDUM 2
Status: **triage.** No code change. Establishes which open issues are real.

---

## 1 — Verdict table

| issue | category | verdict |
|---|---|---|
| #678–#684 (7 tickets) `[gw-fail]` | ai-calibration | **ARTIFACT** — RC-1 replay; not live defects |
| #689 `MODEL-DEGRADED @cf/…` | model-health | **ARTIFACT** — RC-2 namespace split |
| #690 `OPEN-ISSUES-BACKLOG` | backlog | **META** — advisor counting its own tickets |
| #677 `VQ error version_queue id=18` | zenodo-publish | **REAL, self-healing** |
| #687 `TERMINAL research failure 51` | research-pipeline | **REAL, persistent** |
| #688 `TERMINAL research failure 45` | research-pipeline | **REAL, persistent** |

**9 of 12 are artifacts. Only 3 are real, and one of those is already resolving.**

## 2 — The 7 `[gw-fail]` tickets: unclosable by construction

Covered in ADDENDUM 2. The evidence window is replayed every 30 min, so the sweeper's own
auto-close (`COUNT(*) WHERE ts > t0-24h`) can never reach zero. These are **not** 7 live defects;
they are 7 rows held open by refreshed evidence.

## 3 — #689 is the RC-2 namespace artifact

`ai_model_health` holds both a qualified (`@cf/…`) and a short-id row per model. `internalId()`
falls through to `return m` for any model absent from `TIER0_WA`, writing a qualified row that
nothing probes (`last_probe_ts NULL`, `consecutive_failures 0`) and nothing clears. The qualified
row sits `degraded` forever while its short-name twin reads `ok`. `qnfo-fleet-advisor` reads the
qualified row and files `MODEL-DEGRADED`. Confirmed live: the qualified rows for
`@cf/baai/bge-base-en-v1.5`, `@cf/google/gemma-4-26b-a4b-it`, `@cf/zai-org/glm-5.2`,
`@cf/qwen/qwen2.5-coder-32b-instruct` all read `degraded` with `gateway_failures 0`.

## 4 — #677 is real but self-resolving

`version_queue` id 18 (`10.5281/zenodo.22706406`, 2.0.1 → 2.0.2). Observed in two states minutes
apart: `status='error'`, `updated_at 09:55:46` → then `status='drafted'`, `recover_count=1`,
`updated_at **2026-09-13 14:05:07**`. The issue's own text predicted it: *"research-exec purge-fix
drain may auto-rearm after 2h."* Table state: 17 rows, 16 `published`, 1 `drafted`, **0 in error**.

**No action.** It is healing on its own.

## 5 — #687 / #688 are the only genuinely persistent defects

`research_queue` has exactly 2 `failed` rows, matching the two tickets:

| id | recover_count | terminal_rearms | attempt | created | error |
|---|---|---|---|---|---|
| `8506ba43-be2c-4ada-be7d-70c4d79f35d3` | 2 | **3** | 3 | 2026-09-10T08:12:24Z | `ensemble: only 0/3 legs produced drafts` |
| `44c884d7-23ae-4aeb-968d-cc7011688619` | 2 | **3** | 3 | 2026-09-10T21:11:05Z | `ensemble: only 0/3 legs produced drafts` |

Three days old, rearmed three times, byte-identical error each time. This is deterministic, not
flaky — which means it is diagnosable, unlike a transient.

**Hypothesis (labelled as one, not established):** `ENSEMBLE_POOL` has three legs
(code/science/general). `0/3` means **all three failed**, not one. A plausible shared cause is the
RC-2 health pollution: `qnfo-ai`'s `loadModelHealth` deprioritizes or skips models marked
`degraded`, and RC-2 marks qualified rows `degraded` permanently. If the ensemble's leg-selection
reads those rows, all three legs would be skipped at once — producing exactly `0/3`.

**I did not verify this.** It requires reading `qnfo-ai`'s leg-selection code (a 143,771-byte bundle,
beyond the 32,768-char read cap) and confirming which row-set it reads. The hypothesis is offered
because it is testable and would make the two real failures a *downstream consequence of the
artifact* — which would mean **fixing RC-2 is the highest-value action in this entire audit**, not
fixing the ensemble.

## 6 — A measurement defect in this endpoint's own observability

While triaging #677, two statements **in the same tool batch** returned contradictory values for the
same row:

```sql
SELECT * FROM version_queue WHERE id = 18;      -- status = "error",   updated_at 09:55:46
SELECT status, COUNT(*) FROM version_queue GROUP BY status;  -- published 16, drafted 1 (no "error")
```

Re-reading settled it: the row is `drafted`, `updated_at 14:05:07`. The `error` reading was **stale**.

**Cause: D1 read replication.** Successive reads can land on replicas with different lag, so
single-statement reads through `ops_d1_query` are **not self-consistent**. This is the same
mechanism behind the `ops_jobs` count drift I attributed to "concurrent writers" (107 → 108 → 111 →
118 across this session) — that attribution was probably wrong.

**Consequence, stated plainly:** every count in this audit series is a point-in-time read from an
unspecified replica. Two numbers from the same batch can disagree and both be "correct". Aggregate
over a window, or re-read before acting; never act on a single read.

## 7 — Corrected action list

1. **Apply RC-1's `gw_sweep_last_sig` guard** — closes 7 of 12 tickets mechanically once the window
   stops refreshing. Already staged.
2. **Apply RC-2's `internalId()` fix + a hard guard against persisting any `model_id` starting with
   `@cf/`** — closes #689, and (per §5) may be the root cause of #687/#688.
3. **Leave #677 alone** — it is healing.
4. **If #687/#688 survive the RC-2 fix**, then debug the ensemble legs directly.
5. **#690** is a counting artifact of the advisor; it disappears when the others do.

Do **not** spend effort escalating the 7 `[gw-fail]` tickets. They cannot be closed by remediation.

## 8 — Limits

- The verdicts in §1 rest on the error texts and statuses in the tables cited; I did not read any
  worker's routing logic except where quoted.
- §5 is a hypothesis with a named falsification test, not a finding.
- §6 is inferred from two contradictory reads. D1 replication is the best explanation I can offer;
  I did not read a replica-lag metric to confirm it.
- Recover counts and `terminal_rearms` are written by the pipeline, so §5 describes what the pipeline
  recorded, not an independently observed attempt count.
