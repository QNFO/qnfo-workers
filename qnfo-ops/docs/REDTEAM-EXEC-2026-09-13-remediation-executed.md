# REDTEAM EXEC — 2026-09-13 — remediation executed (qnfo-ops)

Companion to `docs/REDTEAM-2026-09-12-ops-issues-list-await.md`. Executed by the qnfo-ops
endpoint under the user's explicit instruction "execute red team remediation and test".
Full record: ops-workspace `audits/2026-09-13-redteam-remediation-executed.md`.

## Mechanism

`qnfo-fleet-deploy` v0.4.11 resolves the canonical bundle in this order:
R2 `qnfo-canonical/<w>.js` (if <30 min old) -> `qnfo-workers/main/<w>/deployed-current.worker.js`
-> `qnfo-ops/main/cloud/<w>/deployed-current.worker.js` -> `worker.js` -> `qnfo-ops/.../worker.js`.
With `fleet_deploy_state.auto_heal = "1"` the hourly `scheduled()` scan PUTs any canonical that is
*ahead* of the deployed VERSION.

**Therefore: editing `worker.js` does nothing; writing `deployed-current.worker.js` is the deploy
trigger.** Three staged fixes were inert for exactly this reason.

## Landed (3 commits on main)

| commit | file | version |
|---|---|---|
| `a571a8c8` | `ai-health-prober/deployed-current.worker.js` | 2.3.1 -> 2.3.2 |
| `bd853052` | `qnfo-social/deployed-current.worker.js` | 0.5.2-checker-heal -> 0.5.3-failclosed |
| `4ef20d9b` | `qnfo-fleet-advisor/deployed-current.worker.js` | 0.3.3 -> 0.3.4 |

All three are upgrades; the reconciler classifies each as drifted and will heal on the next cron.
The advisor 0.3.4 run is expected to auto-close 10 of the 24 open `agent_issues`
(ids 645, 652, 653, 663, 668, 669, 671, 672, 673, 674) via its step 4c legacy-ticket retirement.

## Still blocked from qnfo-ops

- `qnfo-ai-calibration` (RC-1..RC-5): canonical 33,551 B > the 32,768-char read cap, no offset
  parameter -> cannot be reconstructed for a contents-API write. Live 1.1.5 still fails RC-4.
- `qnfo-cloud-ops`: canonical is a raw multipart/form-data body (121,107 B) -> hourly
  `HTTP 400 code 10021 Uncaught SyntaxError` since 2026-09-12 10:01.
- `personal-companion`: canonical 1.0.0 (62,666 B) vs deployed v1.1.0 -> hourly failed downgrade.
- Both loops escalate nowhere: `fleet_deploys` has no consumer (no ticket, no alert, no breaker).
- F13 / any ticket closure: no D1 write path on this endpoint.

## Verification queries (post-cron)

```sql
SELECT worker, deployed_version, canonical_version, note, ts FROM fleet_drift_report ORDER BY id DESC LIMIT 10;
SELECT worker, from_sha, to_sha, ok, note, ts FROM fleet_deploys ORDER BY id DESC LIMIT 10;
SELECT id, name, SUBSTR(body,1,120), ts FROM fleet_probe_log WHERE name='qnfo-social' ORDER BY id DESC LIMIT 3;
SELECT category, COUNT(*) FROM agent_issues WHERE status='open' GROUP BY category;
```

Expected: `fleet_deploys` shows 3 successful PUTs (ai-health-prober 2.3.1->2.3.2,
qnfo-social 0.5.2-checker-heal->0.5.3-failclosed, qnfo-fleet-advisor 0.3.3->0.3.4);
qnfo-social `/health` reports `0.5.3-failclosed`; open `model-health` tickets drop from 10 to <=1.
