# VERIFICATION 2 — H1 proven by direct test; two of my own hypotheses retracted

Date: 2026-09-13, same session. Supplements `FLEET-ERROR-AUDIT-2026-09-13.md` and `-CORRECTION-1.md`.

## 1. H1 is now proven, not inferred — `pipeline_state` does not exist

Canonical `qnfo-pipeline-ops/worker.js` (v0.5.5, sha `a7580136`) carries its own falsifiable claim:

> *"the live build is NOT this source. `pipeline_state` does not exist in live D1, yet
> `ensureSchema()` below creates it on first run — therefore the deployed build predates v0.5.4."*

**Test executed:**

```
SELECT name FROM sqlite_master WHERE name IN ('pipeline_state','pipeline_flags','pipeline_status');
  -> pipeline_flags (table), pipeline_status (table)        # pipeline_state ABSENT

SELECT k, v, updated_at FROM pipeline_state LIMIT 10;
  -> D1_ERROR: no such table: pipeline_state: SQLITE_ERROR
```

`ensureSchema()` runs at the top of every `run()`, on a `*/15` cron. Had v0.5.4 or later been
deployed, the table would exist within 15 minutes of the deploy. **It does not exist, so the
deployed build predates v0.5.4.** The alert-storm fix (v0.5.3 alert gating, v0.5.4 summary
fingerprint) is therefore **provably not live** — this is no longer an inference from snapshot
mismatch.

## 2. Independent corroboration from alert cadence

`alerts`, source `qnfo-pipeline-ops`, today, by hour:

| hr | 00 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| n | 6 | 5 | 2 | 7 | 4 | 7 | 3 | 6 | 5 | 7 | 5 | 4 | 4 | 4 | 3 |

**2–7 per hour, every hour, ~72/day** — a 15-minute cron emitting on nearly every run. That is
**pre-v0.5.3** behaviour (unconditional emit). Post-v0.5.3 alerts only on a newly inserted
ticket; post-v0.5.4 re-notifies at most every 6h. The cadence rules out both. Two independent
proofs agree.

## 3. RETRACTED — my hypothesis that the staged drain would still 404

I proposed, from the registry alone, that the already-staged v0.5.5 drain would still fail
because it posts to the dead `TRIAGE_URL` host. **Wrong.** Reading canonical source:

```js
var TRIAGE_URL       = "https://qnfo-idea-triage.q08.workers.dev";                      // health probe only
var TRIAGE_DRAIN_URL = "https://qnfo-intent-orchestrator.q08.workers.dev/triage/run";   // drain target
```

The v0.5.5 patch **already separated the two hosts** and points the drain at
`qnfo-intent-orchestrator`, which *is* registered and *does* expose `/triage/run`, `/triage/sync`,
`/triage/dispatch` (registry, v1.3.4). The fix is correct. What remains dead is only the
non-fatal health probe of `TRIAGE_URL`, which is now recorded in the run outcome rather than
silently swallowed.

The registry finding itself stands: **`qnfo-idea-triage` appears in none of the 55 registered
services**, so the watchdog's `triage_health: 404` is a permanently dead probe, not a transient.

## 4. Registry findings

| finding | evidence |
|---|---|
| `qnfo-fleet-deploy` is **not registered** | `service_discover(service="qnfo-fleet-deploy")` → `{"ok":true,"service":null}` |
| Deploy capability lives elsewhere | `qnfo-fleet-control` v0.4.11 — *"advisor audits + calibration baselines + **deploy scan/heal/redeploy**"*, deps `qnfo-canonical R2` |
| Registry staleness | `qnfo-backlog-exec` registry says **1.2.7**; `fleet_status` binding and `backlog_status` both report **1.2.8** |
| `qnfo-research-exec` registry `0.8.1` | matches canonical source `0.8.1-quality-gate-fix` → **corroborates the NL patch is unapplied** |
| `qnfo-ops` v2.15.7 capabilities | includes `full-fleet-probes`, `run-to-completion`, `self-chaining-jobs`; routes `/fleet`, `/manifest`, `/cost`, `/telemetry`, `/registry` |

## 5. Why the deploy blocker is real, stated precisely

The deploy capability exists (`qnfo-fleet-control`), but it is reachable only by:

1. a **service binding** — `qnfo-ops` binds 12 services and `qnfo-fleet-control` is not among
   them; or
2. the **public `q08.workers.dev` host** — which returns **404 for 16/16 URLs** from this
   endpoint (CORRECTION-1), including hosts proven alive over bindings.

So the blocker is not "no deploy tool exists"; it is **no reachable route to the tool that has
one**. That is a more precise and more actionable statement of the limit.

## 6. Unchanged

H2 (40/40 masked `v2-drain` rows), H3 (`version_queue` id=18), H4–H7, H9, H10, the P0 credential
exposure, the falsified "496 stuck `new`", and the `ops_issue_run` token gate.
