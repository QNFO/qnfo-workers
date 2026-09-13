# D9 UPGRADED — `research-daily-brief` is an 11-day chronic failure, masked by stale-canon self-seal

Supplements `audits/FLEET-AUDIT-CLOSEOUT-2026-09-13.md` §3, where D9 was recorded as a
single failed run (`2026-09-13T06:07:35Z`). Measured 2026-09-13 ~14:35Z from
`qnfo-audit.emails`. **That entry understated the defect by an order of magnitude.**

## The measurement

```
SELECT COUNT(*) AS brief_failures, MIN(received_at) AS first, MAX(received_at) AS last
  FROM emails WHERE subject LIKE '%research-daily-brief%FAILED%'
-> brief_failures 22 | first 2026-09-03T06:01:14Z | last 2026-09-13T06:07:39Z
```

**22 failure alerts across 11 consecutive days.** Two emails per day — one `sent`
(classification `general`) and one received into `alerts@qnfo.org` (classification
`alerts`). One failure every morning at ~06:00–06:07 UTC:

| date | failed at |
|---|---|
| 2026-09-13 | 06:07:35 |
| 2026-09-12 | 06:07:42 |
| 2026-09-11 | 06:07:31 |
| 2026-09-10 | 06:01:23 |
| 2026-09-09 | 06:00:08 |
| 2026-09-08 | 06:00:20 |
| 2026-09-07 | 06:00:23 |
| 2026-09-06 | 06:00:12 |
| 2026-09-05 | 06:01:28 |
| 2026-09-04 | 06:00:55 |
| 2026-09-03 | 06:01:14 |

**Zero successes in the window.** This is a chronic outage, not a flake.

## Why nothing caught it

Three independent detection paths all fail on this worker:

1. **It never became an `agent_issues` ticket.** The 3 open issues are 677, 687, 688 —
   no `research-daily-brief` entry. The brief's failure path sends **email only**; it does
   not file an issue, so the ticket lifecycle never sees it.
2. **The telemetry self-heal loop cannot see it.** `telemetry_analyze(24h)` → scanned 11,
   **filed 0**. It detects persistent *tool* failures, not a cron job that fails and
   reports by mail.
3. **The drift monitor is permanently blinded on this exact worker.**
   `fleet_deploy_state` → `scanerr:research-daily-brief = "stale-canon"`
   (2026-09-12 11:02:43). And `PATCH-2026-09-13-CONSOLIDATED.mjs` mechanism **2
   (STALE-CANON SELF-SEAL)** names the four victims explicitly:
   *"research-daily-brief, qnfo-twin-maintain, osf-integrity-check, obsidian-writer …
   When the canonical carries no VERSION marker, `scan()` 'heals' by copying the DEPLOYED
   content into R2 and calling it canonical. **Drift detection is then permanently
   disabled — whatever is deployed IS the canonical.**"*
   Verified in that patch's own note: `research-daily-brief/deployed-current.worker.js`
   is a plain script with no version constant.

**So the worker whose daily job has been broken for 11 days is precisely the worker whose
drift detection was permanently disabled.** The mask and the failure are on the same row.

## The causal chain (all roads lead to E)

```
deploy-subsystem defects (E)  ->  stale-canon self-seal  ->  drift detection disabled
                                                          ->  research-daily-brief masked
research-daily-brief fails 11 days  ->  email-only reporting  ->  never becomes a ticket
                                                              ->  self-heal cannot see it
```

This is the strongest instance of the audit's central finding: **the fleet's detection
surface is not independent of its defect surface.** A worker can fail for 11 days while
three separate monitors report it as fine, because the defect disabled the monitors.

## Corrected remediation entry

D9 moves from *"open, low"* to **open, chronic (11 days), HIGH** — and it is **blocked by
E**, not independent. It cannot be fixed by repairing the brief alone: the canonical has
been overwritten by the self-seal, so there is no correct artifact left to deploy. Order:
fix the deploy subsystem → restore the canonical from git history → then repair the brief.

## What is NOT verified

1. **The failure cause itself was not diagnosed.** The alert subject carries only a
   timestamp; the body was not read. Whether it is the same arXiv 429 source-starvation
   seen in `paper-explain` (2026-09-13T14:01:18Z) and in the two terminal research
   failures (`srcFetched:false`) is a **hypothesis, not established** — though the
   coincidence is suggestive: a daily research brief and an ensemble research pipeline
   both starving on the same upstream would be one root cause, not two.
2. **Whether earlier failures predate 2026-09-03** — the query window starts where the
   first row sits; I did not check whether the brief ever succeeded before that.
3. **The brief's own source was not read.**
