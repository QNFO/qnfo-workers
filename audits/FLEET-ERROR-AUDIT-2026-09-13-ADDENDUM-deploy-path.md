# ADDENDUM — the deploy path is the systemic defect (2026-09-13)

Companion to `audits/FLEET-ERROR-AUDIT-2026-09-13.md`.
Measured 2026-09-13 ~14:20Z from `qnfo-audit.fleet_deploys` (live).

## 0. Headline

**76 deploy attempts, 54 failed — 71% failure rate** (2026-09-08 16:08 → 2026-09-13 14:04).

This reframes the whole audit. The fleet's problem is not that fixes are unknown. It is
that **the deploy path fails for exactly the workers whose fixes are staged**, and it
fails *silently, repeatedly, and without backoff*.

## 1. `fleet_deploys` by worker × outcome

| worker | ok | n | first | last |
|---|---|---|---|---|
| personal-companion | **0** | **26** | 2026-09-12 09:01:17 | 2026-09-13 13:01:23 |
| qnfo-cloud-ops | **0** | **25** | 2026-09-12 10:01:33 | 2026-09-13 07:02:38 |
| personal-companion | 1 | 4 | 2026-09-12 08:01:13 | 2026-09-12 11:01:14 |
| qnfo-chat-canary | 1 | 3 | 2026-09-08 16:08:38 | 2026-09-09 07:22:58 |
| qnfo-backlog-exec | 1 | 2 | 2026-09-13 08:01:43 | 2026-09-13 14:02:44 |
| qnfo-email-orchestrator | 1 | 2 | 2026-09-11 14:02:12 | 2026-09-12 10:01:41 |
| qnfo-fleet-advisor | **0** | 2 | 2026-09-09 18:02:12 | 2026-09-09 19:02:31 |
| qnfo-paper-reviser | 1 | 2 | 2026-09-11 14:03:03 | 2026-09-12 10:02:15 |
| qnfo-social | 1 | 2 | 2026-09-12 10:02:30 | 2026-09-13 07:04:34 |
| qnfo-observability | **0** | 1 | 2026-09-13 14:04:01 | 2026-09-13 14:04:01 |
| (11 workers) | 1 | 1 each | — | — |

**51 of the 54 failures are two workers in an hourly retry loop.**

## 2. The three failure modes (each structurally unfixable by retry)

### (a) `personal-companion` — 26× impossible downgrade
```
from_sha: v1.1.0  ->  to_sha: 1.0.0
HTTP 400 {"code":10021,"message":"Workflow GenerationFlow must be exported or a
script_name must be specified"}
```
The healer is attempting to deploy **`v1.1.0` → `1.0.0`** — a *downgrade to an older
version* — every hour from 09:01 to 13:01 on 09-12/09-13, and **26 times total**. The
canonical artifact (`r2:qnfo-canonical/personal-companion.js`) does not export the
`GenerationFlow` Workflow binding the deploy requires, so this **cannot ever succeed**.
Retrying an impossible deploy hourly produces 26 permanent failure rows and no signal.

### (b) `qnfo-cloud-ops` — 25× corrupt canonical artifact
```
HTTP 400 {"code":10021,"message":"Uncaught SyntaxError: Invalid or unexpected token
  at worker.js:1:2"}
```
A syntax error at **`worker.js:1:2`** — byte 1, line 1. The canonical R2 artifact is
malformed at its very first token (leading-BOM / stray-byte class). The healer has retried
it **25 times** across 09-12 10:01 → 09-13 07:02.

**This is why D8 (`gtd-overdue-guard` overdue 7 → 26 in 24h) cannot be fixed.** The deploy
that would ship the guard is `1.14.1 → 1.14.1-gtd-guard`, and it dies on a corrupt artifact.
**D8 is a downstream symptom of E.**

### (c) `qnfo-observability` — missing module
```
HTTP 400 {"code":10021,"message":"Uncaught Error: No such module \"fleet.js\". imported
from \"worker.js\""}
```
`qnfo-observability/worker.js` imports `fleet.js`, but the canonical bundle ships only
`worker.js`. **This is why `JOBS-STATUS-PUBLIC-1` cannot deploy** — the keyless `/jobs`
routes are staged, verified, and permanently blocked by a missing bundle module.

## 3. The fourth pattern: fixes never attempted

`qnfo-pipeline-ops` appears **zero times** in `fleet_deploys`. Its alert-storm fix (v0.5.4,
documented in its own file header as written 2026-09-13 *to fix this storm*) has **never
been attempted by the healer** — the worker is not in the deploy set at all. Its own
`deployed-current.worker.js` is byte-identical to the repo source (both 16,933 B, sha
`350aefa2`), so it is a copy, not a snapshot; drift comparison on it is vacuous.

## 4. Corrected remediation ordering

The previous audit ordered fixes by defect severity. That ordering was wrong. **Nothing on
the list can ship until the deploy path is repaired**, and the deploy path has three
independent blockers plus one absent worker:

| order | action | blocks |
|---|---|---|
| **0** | Fix healer: backoff + escalate on repeated identical failure; stop retrying impossible deploys | 51 failure rows |
| **1** | `personal-companion`: stop the v1.1.0→1.0.0 downgrade; reconcile canonical artifact to export `GenerationFlow` | 26 rows |
| **2** | `qnfo-cloud-ops`: repair the canonical artifact (SyntaxError at 1:2) | 25 rows + D8 |
| **3** | `qnfo-observability`: bundle `fleet.js` into the canonical artifact | JOBS-STATUS-PUBLIC-1 |
| **4** | `qnfo-pipeline-ops`: add to the deploy set, then ship v0.5.4 | alert storm (Defect A) |
| **5** | Then the functional fixes (D1, D3, D5, D6, D9) | — |

## 5. Why this matters more than any single defect

Every prior audit in this repo — the intake drain, the drift comparator, the canonical
extraction, the jobs-status link, this one — has ended with the same sentence: *the fix is
written and production runs the defect.* That is not four coincidences. **The deploy path
is the defect**, and until it is repaired, staged fixes accumulate as documentation while
the fleet keeps failing. Counting defects without measuring the deploy path
under-counts the problem by exactly the amount that never ships.

## 6. What is NOT verified

1. **The healer's own source was not read.** The retry/backoff behaviour is inferred from
   `fleet_deploys` (26 identical attempts, hourly, no escalation). The scheduler and its
   escalation logic were not located this session.
2. **The `personal-companion` downgrade direction** (`v1.1.0`→`1.0.0`) is read from
   `from_sha`/`to_sha` columns; whether the healer intends a rollback or has inverted
   version comparison is not determined. Both are consistent with the data.
3. **No deploy capability on this endpoint** — `service_discover(qnfo-fleet-deploy)` →
   `service: null`; no exec/wrangler; `run_code` is isolated compute. Every item above is
   staged or diagnosed, none shipped by this session.
