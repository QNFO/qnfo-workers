# FINDING — issue remediations are dispatched but never executed, and a correction to my own A6

Date: 2026-09-13. Author: qnfo-ops. Every value below is a tool return from this session.

## 1. CORRECTION FIRST: my model-health finding overstated a blind spot

In `audits/2026-09-13-FINDING-model-health-vs-gateway-discrepancy.md` I wrote that
`ai_model_health` reports all-ok while the gateway shows failures, and added a section titled
**"Why the fleet's own advisor cannot see it."** Reading `fleet_issue_dispatch` refutes the framing.

`iss-cac511bc`, payload verbatim:

```
AI model health: 24 models; not-ok:
  @cf/baai/bge-base-en-v1.5=degraded/cf0,
  @cf/google/gemma-4-26b-a4b-it=degraded/cf0,
  @cf/qwen/qwen2.5-coder-32b-instruct=degraded/cf0,
  @cf/qwen/qwen3.8-27b=degraded/cf0,
  @cf/zai-org/glm-5.2=degraded/cf0
```

**The fleet's issue detector saw the degradation and named five models** — four of which I had
identified independently. It is tracked as `fleet_issue_log.iss-cac511bc` (warn, 85 occurrences) and
carried as `fleet_issue_dispatch` gh_number 24. So:

| my A6 claim | status |
|---|---|
| "three independent status surfaces all agree the models are fine" | **wrong** — `fleet_issue_log`/`_dispatch` flag them |
| "the fleet's own advisor cannot see it" | **wrong as stated** — the issue detector sees it |
| `runAudit()`'s gateway matcher cannot file on named classes | **still valid**, but it is a narrow code observation about the *advisor*, not a fleet-wide blind spot |

What survives is a narrower and differently-shaped claim: `ai_model_health` (20 rows, `degraded=0`) and
the issue detector (24 models, 5 `degraded`) **disagree with each other**. The count differs too
(20 vs 24 rows), so rows appear to have been removed or the two read different sources. That is a
data-consistency question, not a monitoring blind spot. I had inferred the stronger claim from the two
tables I happened to read first, and did not check `fleet_issue_log` until later in the session.

**Method note:** this is the second time this session that the fleet's own issue plumbing already
contained the answer I was reconstructing from raw tables (`fleet_issue_log` §A5 confirmed four of my
findings the same way). Reading the issue ledger first would have been the cheaper and more accurate
order.

## 2. NEW — every dispatched remediation sits at `exec_attempts = 0`

`fleet_issue_dispatch`, all rows read this session:

| fingerprint | category | action | state | exec_state | exec_attempts |
|---|---|---|---|---|---|
| `iss-9d0ff956` | scheduled-no-run | cron-trigger | queued | null | **0** |
| `iss-13152cf9` | queue-freshness | queue-drain | queued | null | **0** |
| `iss-cac511bc` | model-health | model-fallback-pin | queued | null | **0** |
| `iss-98f1c548` | integration-chain | chain-produce | queued | null | **0** |
| `iss-313bc84c` | integration-chain | chain-produce | queued | null | **0** |
| `iss-1eb53b62` | integration-chain | chain-produce | queued | null | **0** |

Every row carries a concrete `remediation.suggested_action` — `cron-trigger`, `queue-drain`,
`model-fallback-pin`, `chain-produce` — and a `state` of `queued`, with `exec_state`, `exec_ts` and
`exec_result` all `null` and **`exec_attempts = 0`**. The oldest (`iss-13152cf9`) has been queued since
2026-09-12T11:14:36, ~27h.

So the pipeline detects, classifies, writes a remediation, opens a GitHub issue
(`gh_number` 6, 7, 13, 23, 24, 25) — and **never executes the remediation**. `fleet_issue_loop` shows
`last_action = "stale-escalated"` for five of the six, which is escalation *instead of* execution.

This is the same shape as the other defects in this audit: the detection layer works, the action layer
is inert, and the surface reports "dispatched" as though something happened. It also explains why the
same six items recur 85–93 times each while their `remediation` text never changes.

**Caveat, stated:** I did not read the executor that consumes `fleet_issue_dispatch`, so I cannot say
whether `exec_attempts = 0` means no executor exists, or an executor exists and never runs, or the
column is simply not written by the path that acts. The `exec_*` columns being uniformly null across
all six rows is consistent with all three.

## 3. The stale worker is `qnfo-twin-maintain` — with the detector's own caveat

`iss-9d0ff956` payload, verbatim:

```
1 scheduled worker(s) saw 0 invocations in 24h despite expected fires:
  qnfo-twin-maintain
  (adaptive-sampled data; low-volume workers undercount - verify via the worker's own
   logs before acting)
```

So the one `scheduled-no-run` worker is **`qnfo-twin-maintain`** — and the detector itself warns the
metric may be an undercount artifact. Corroborating that caution: `service_registry` has
`qnfo-twin-maintain` at v1.0.1, `state: live`, `updated_at 2026-09-13 07:22:47`, and `self_heal_actions`
id 1413 records a `stale-canon` resync for it as **`healed`** at 14:05:23. A worker that is registered
live and being actively resynced is unlikely to be dead. My independent read agreed: `qnfo-paper-explainer`
looked like a second candidate at one snapshot but is actually non-zero (11 → 1 across the day), so the
zero-reading was a sampling artifact there too.

**Conclusion: no live worker is demonstrably stale.** The `req24=0` population is dominated by the
2026-09-11 merge-wave retirements (`qnfo-fleet-deploy`/`-calibrator`/`-advisor`, 22 zero-days each,
starting exactly 09-11) and deleted workers.

## 4. Also observed

`fleet_logpush_sweep` lists `qnfo-auditor` with `status: "on"` as of 2026-09-10 07:51 — a third live
config referencing a **deleted** worker, alongside `PROBE_WORKERS` and `SVC_QNFO_AUDITOR`
(`audits/2026-09-13-FINDING-deleted-workers-in-live-probe-lists.md`).

`iss-313bc84c` detail: `published 7d=0` — the fleet's own detector confirms the dead publish drain
(§A3). `iss-1eb53b62` detail: `untriaged proposals=496`, and it is now `gh_state: cleared`
(`closed_at 2026-09-13T14:01:49`, `miss_streak 3`).

## 5. Not fixable from this endpoint

Executing the six queued remediations needs the executor and its deploy; correcting `ai_model_health`
needs a probe-path change. Both require a route this endpoint lacks.
