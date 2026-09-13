# ADDENDUM 4 — ensemble conflation corrected; ai_queries has been silent for ~7h

Date: 2026-09-13T14:40Z · Author: qnfo-ops / ops-exec
Corrects: §5 of `2026-09-13-AUDIT-AND-FIX-ADDENDUM3-triage-of-12-open-issues.md` (sha `c908c87a…`)
Status: **corrective + one new observation.** The RC-2 → research-failure hypothesis is downgraded.

---

## 1 — I conflated two different ensembles

ADDENDUM 3 §5 proposed that RC-2's permanent `degraded` flags starve the ensemble's three legs,
making #687/#688 downstream symptoms of the artifact. That argument is **weaker than I stated**,
because there are two unrelated ensembles and I treated them as one:

| ensemble | where it lives | what "3 legs" means |
|---|---|---|
| `ENSEMBLE_POOL` | `qnfo-ai` chat router (`worker.js`) | code / science / general legs for **chat** routing |
| research pipeline ensemble | `qnfo-research-exec` + paper pipeline | 3 draft legs for **paper generation** |

`research_queue.error = "ensemble: only 0/3 legs produced drafts"` is the **research** pipeline.
`ENSEMBLE_POOL` is the **chat** router. RC-2's degraded flags affect `ai_model_health`, which
`qnfo-ai` reads for chat routing. **I did not establish that the research pipeline's leg-selection
reads `ai_model_health` at all.** If it does not, RC-2 cannot be the cause of #687/#688 and the
"highest-value action" claim in ADDENDUM 3 §7 item 2 is unfounded.

**Downgraded to:** an untested possibility with a named falsification test (read the research
pipeline's leg-selection code). Not a finding. I should not have ranked it as the highest-value
action.

## 2 — What the router data does show

`ai_queries`, grouped by `strategy, model`:

| strategy | model | n | last seen |
|---|---|---|---|
| auto | `kimi-k2.7-code` | 207 | **2026-09-13T07:31:02Z** |
| auto | `ensemble` | 103 | **2026-09-12T08:14:21Z** |
| single | `ensemble` | 287 | 2026-09-12T06:53:57Z |
| auto | `glm-5.3-flash` | 50 | 2026-09-13T07:32:18Z |
| auto | `deepseek-v4-flash` | 31 | 2026-09-13T06:41:28Z |

Two observations:

1. **The router is working.** `auto → kimi-k2.7-code` fired at 07:31 today, so routing is live and
   not globally impaired by the degraded flags.
2. **`model='ensemble'` has not fired in ~30 hours** (last 2026-09-12T08:14:21Z). `strategy='ensemble'`
   appears only **4 times in 2,423 rows**; the 390 ensemble rows are `model='ensemble'` under
   `single`/`auto`. A 30-hour gap in one routing path is worth a look, but I cannot say whether it
   is anomalous — ensemble is the rare path by construction.

## 3 — New observation: `ai_queries` went silent at 07:32:18Z

| day | rows | first | last |
|---|---|---|---|
| 2026-09-13 | **217** | 06:25:35Z | **07:32:18Z** |
| 2026-09-12 | 26 | 06:52:35Z | 11:34:49Z |
| 2026-09-11 | 20 | 04:34:08Z | 19:59:04Z |
| 2026-09-10 | 10 | 08:23:56Z | 08:33:27Z |
| 2026-09-09 | 15 | 07:42:37Z | 15:45:57Z |

Two anomalies, neither explained:

1. **No `ai_queries` row since 07:32:18Z (~7 h).** Prior days show activity spread into the
   afternoon (09-11 to 19:59, 09-09 to 15:45). 09-10 also stopped early (08:33), so this is
   **consistent with** a stall but **not proof** of one.
2. **217 rows in one hour** (199 in the 07:00 hour) against a 10–26/day norm — a ~10× burst.

I cannot distinguish "feed stalled" from "normal burstiness plus a quiet afternoon" with this data.
Nor can I explain the burst. Flagging both rather than guessing: the research feed's own worker
(`qnfo-research-exec`, `qnfo-research-supervisor`) would need to be probed directly, and the
`ai_queries` write path inspected.

**Note:** `qnfo-ai` reports healthy (`fleet_status` → `ok`, v5.25.1). A silent `ai_queries` while the
router is healthy would mean the *caller* stopped calling, not that the router broke — a different
failure mode from the one the fleet's health probes can see.

## 4 — Corrected action list

1. Apply RC-1's `gw_sweep_last_sig` guard — closes 7 tickets mechanically.
2. Apply RC-2's `internalId()` fix + a hard guard against persisting any `@cf/…` `model_id` —
   closes #689. **Does not** claim to fix #687/#688 (see §1).
3. Leave #677 (self-healing).
4. Debug the research pipeline's ensemble legs directly — do not route this through RC-2.
5. Investigate the `ai_queries` silence separately.

## 5 — Limits

- §1 rests on my reading of the two error strings and the two code locations. I read neither
  pipeline's leg-selection code, so "unrelated" is an inference from naming, not a proof they share
  no health input. It is possible they *do* share `ai_model_health`; I simply have not shown it.
- The 07:32 cutoff is a `MAX(ts)` over one replica read (see ADDENDUM 3 §6 on D1 read replication),
  so it may be slightly stale in either direction.
- This is the **sixth** self-correction in this session. The pattern has not changed: I reasoned from
  a plausible name (`ensemble`) to an identity, instead of verifying the identity.
