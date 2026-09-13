# Addendum — the downgrade loop is failing 100% today, and that failure is the only thing protecting production

Date: 2026-09-13. Author: qnfo-ops. Companion to `FINDING-2026-09-13-deploy-loop-downgrade.md`.

## The precision the main finding lacked

The main finding reported an all-time rate of 4 ok / 23 for `personal-companion`. Measured for
**today alone**:

| window | attempts | ok | failed |
|---|---|---|---|
| 2026-09-13 00:01 → 06:02 | **14** | **0** | **14** |
| — `qnfo-cloud-ops` | 7 | 0 | 7 |
| — `personal-companion` | 7 | 0 | 7 |

**Zero successes today, hourly, across both targeted workers.** (Method note: `fleet_deploys.ts`
stores `YYYY-MM-DD HH:MM:SS` with a **space**, not a `T`. A first query using the ISO `T` form
compared `' '` < `'T'` and silently returned zero rows — the same format-mismatch class as the
`<>` guard in QRI-1. Corrected before use.)

## The trap this creates

The `HTTP 400 code 10021` failure streak is the **only** reason production still serves v1.1.0. The
loop's intent is unchanged and it retries every hour. So:

> **Fixing the `400` without first changing the deploy target would immediately land the
> `v1.1.0 -> 1.0.0` downgrade.**

The natural instinct on seeing "a cron has failed 18 hours straight" is to repair the cron. Doing
that here deploys a lower version over a higher one, reverting the worker that serves the reading
page — and `auto_heal` is on (`fleet_deploy_state`, set 2026-09-08), so the fleet would not stop it.

**Order matters more than usual:**

1. Set `auto_heal = '0'` first. Reversible, no deploy, removes the autonomous actor.
2. Point `personal-companion`'s canonical at the **v1.1.0** source. Until that source exists in the
   repo *and* in R2 `qnfo-canonical`, the loop has nothing correct to deploy.
3. **Only then** repair the `400`.

Repairing the `400` first is worse than leaving it broken.

## What is still unverified

- **Why `10021` fires.** The response body is truncated in the stored note; the full error is not in
  D1. Not guessed at here.
- **What R2 `qnfo-canonical` actually holds for `personal-companion`.** `r2_list` exposes only
  `releases`, `audit`, `backups` and `skills`; `qnfo-canonical` is not readable from this endpoint. So
  I can confirm the control plane's declared dependency but **not** the payload it would deploy.
- **Whether the two recorded `v1.1.0 -> 1.0.0` successes (rows 24, 26) actually changed the
  deployment.** Row 14 records a `PUT-ok` no-op, so `ok=1` is not proof — and `/health` reads v1.1.0
  today, which is consistent with either "they did not take" or "something outside the loop restored
  it". Not distinguishable from here.
