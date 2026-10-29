# VERIFICATION 9 — the deploy healer is disabled, so nothing can ship

Date: 2026-09-13. This closes the loop on why the research-exec tombstone test never ran.

## 1. `auto_heal` is off

`fleet_deploy_state` — 46 keys, 44 of them `scanerr:<worker>`:

| key | value | updated_at |
|---|---|---|
| `enabled` | `1` | 2026-09-08 16:25:49 |
| **`auto_heal`** | **`0`** | **2026-09-13 14:15:02** |

**The fleet's auto-heal was switched off at 14:15:02Z today** — about eleven minutes before this
session began observing at 14:16Z, and immediately after the deploy wave that produced
`fleet_deploys` ids 74–76 (13:01–14:04Z).

## 2. Consequence — nothing can ship while this holds

- No `fleet_drift_report` row has been written since `14:05:46` (max id 1708). The healer is not
  running.
- **The research-exec tombstone test cannot pass or fail while `auto_heal = 0`.** I have been
  waiting on an hourly scan that will not come. That item was mis-stated in
  `VERIFICATION-5` §5 and `VERIFICATION-8` as "pending the next scan" — it is pending a flag.
- Any fix that ships through the scanner — the NL patcher, the alerts-format forward fix, the
  `qnfo-pipeline-ops` v0.5.5 deploy — is blocked on this flag, not on a patch or a dispatch.
  My `apply-staged-patchers.yml` runner would still commit source, but **the commit would not
  reach production** until auto-heal resumes.

## 3. Independent corroboration of the CAPSTONE

The 44 `scanerr:<worker>` keys are the scanner's per-worker error slots — effectively its scan
set. **`scanerr:qnfo-pipeline-ops` is absent**, which corroborates
`CAPSTONE-deploy-blindspot.md` by a second, independent route: no drift row, no deploy row, and
no scan-error slot. The worker is not in the scan set by any measure.

Observed `scanerr` values: mostly empty string, plus `stale-canon` (obsidian-writer,
osf-integrity-check, personal-life-maintain, qnfo-arxiv-radar, qnfo-research-radar) and `nocanon`
(qnfo-container-executor, qnfo-scorecard).

## 4. I did NOT flip it, deliberately

Re-enabling auto-heal is a fleet-wide production action, and there is evidence it was turned off
for a reason: the archived deployer's own tombstone records that the pre-guard build
(*"NO_SELF = ['qnfo-fleet-deploy']"*, VERSION 0.4.11) *"would read the SAME
`qnfo-audit.fleet_deploy_state` row (live: enabled=1, auto_heal=1) and resume healing the fleet
with the unguarded comparator. That is the exact defect the guard exists to prevent."*

Note that the tombstone describes live as `auto_heal=1`; it is now `0`, changed after that
document was written. A single `UPDATE` would re-arm fleet-wide automated deployment against
`fleet_deploys`'s measured **54-of-76 failure rate** (71%), with two targets in unbounded hourly
retry loops. That is not a change this endpoint should make unilaterally, and I have not.

## 5. Limitation encountered

The archived deployer source could not be retrieved: `github_repo_read` with `ref=ed539ec3`
returns `path not found`, because a blob SHA is not a valid git ref. The scanner's worker
enumeration therefore remains unread, and I cannot say whether registering
`qnfo-pipeline-ops` in `service_registry` would add it to the scan set. That question is still
open.

## 6. Corrected statement of what blocks the storm fix

Not "the fix is undeployed" and not "no deploy route exists". In order:

1. `qnfo-pipeline-ops` is absent from the scan set (no drift row, no deploy row, no scanerr slot).
2. `auto_heal = 0`, so the healer is not running at all.
3. Therefore the v0.5.3/v0.5.4/v0.5.5 fixes cannot ship by any source change, and would not ship
   even if the worker were registered, until auto-heal is re-enabled.

Three independent gates, none of them addressable from this endpoint.
