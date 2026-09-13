# qnfo-research-exec canonical: an open question, and a retraction

Written 2026-09-13 ~14:40Z by the qnfo-ops session that filed issue 768. This document exists to
record a reasoning error I nearly published as a "decisive" finding.

## What I asserted, and why it was wrong

I read `fleet_drift_report` for `qnfo-research-exec` and found 15 consecutive hourly rows
(2026-09-13 00:03:56 → 14:04:41) all reporting:

```
deployed_version   0.8.1
canonical_version  0.5.17-research-restored
source_path        qnfo-workers/main/qnfo-research-exec/deployed-current.worker.js
note               deployed-ahead
```

From that I concluded the scanner was stopping at candidate (a) — the tombstone — and parsing a
version string out of tombstone prose, so the tombstone had failed at its own stated purpose.

**That conclusion is not supported.** The tombstone's own `EVIDENCE` block cites
`fleet_drift_report hourly, ids 1610..1706 (2026-09-13 09:02:25 .. 14:04:41)`. A file cannot cite
a scan from 14:04:41 unless it was written **after** 14:04:41. So:

- Every one of those 15 rows **predates the tombstone** and describes the *old* 0.5.17 bundle.
- The string `0.5.17-research-restored` is **invariant across the swap**, because the tombstone
  body itself quotes that version as `this file's VERSION`.
- Therefore those rows **cannot distinguish** "scanner read the old bundle" from "scanner read the
  tombstone". They carry zero information about whether the tombstone works.

I had a "decisive" signal that was in fact a constant.

## What is actually established

1. The scanner's **first** canonical candidate is
   `qnfo-workers/main/qnfo-research-exec/deployed-current.worker.js` (per the tombstone's own
   candidate list and per `source_path` in every drift row).
2. The tombstone was committed **after 14:04:41**.
3. `fleet_deploys` holds **zero rows for qnfo-research-exec, ever** — but because no scan has run
   since the tombstone was committed, this is *not* evidence of safety, only of absence of
   observation.
4. The tombstone **asserts, without observation**, that with it in place the scanner falls through
   to candidate (c) `worker.js` at `0.8.1-quality-gate-fix` (80,916 B), and that the resulting
   comparison is UNORDERABLE (equal cores, differing suffixes) so no action occurs.

## The discriminator (do this, do not guess)

Read `fleet_drift_report` for `qnfo-research-exec` **after the next hourly scan (15:0x)**:

| observed canonical_version | conclusion |
|---|---|
| `0.8.1-quality-gate-fix` | tombstone worked as designed — scanner fell through to `worker.js` |
| `0.5.17-research-restored` | tombstone failed — scanner still stopping at candidate (a) |

Until that scan exists, both readings are live and neither is a finding.

## Why this matters for the fix path

`apply-research-exec-fix.mjs` (17,109 B, staged) does its surgery **in `worker.js`** — explicitly,
because `github_repo_read` truncates at 32,768 chars and `web_fetch` mangles the 80,916-byte file,
so a hand-authored rewrite would ship guessed code. It bumps the core to `0.8.2-*`.

**If** the tombstone failed to redirect the scanner, then bumping `worker.js` is invisible to the
deployer and the staged patch cannot reach production — regardless of how correct the patch is.
**If** the tombstone worked, the patch is deployable. The 15:0x scan decides which.

## Risk bound

The tombstone's own `RESIDUAL RISK` section states that if a resolver revision does not honour the
`404:` prefix, the body yields no VERSION marker, so the candidate is skipped or the upload is
rejected as invalid JavaScript — "worst case is hourly failed-attempt noise, never a production
replacement."

That is a **bounded** risk. It weakens any argument for keeping `fleet_deploy_state.auto_heal=0`
on account of this file alone. The solid, separately-evidenced reason to keep the healer off
remains the **multi-module deployer gap** (issue 769): `qnfo-observability` failed 14:04:01 with
`No such module "fleet.js"` and `personal-companion` failed six consecutive hours with
`Workflow GenerationFlow must be exported`.

## Method lesson

A time series only discriminates if the observed value **changes** across the event. Here the
value was identical before and after, and the event itself post-dated every observation. Fifteen
consistent rows felt like strong evidence and were worth nothing. Check the event's timestamp
against the observation window before treating a series as proof.
