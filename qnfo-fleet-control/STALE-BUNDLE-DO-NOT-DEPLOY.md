# DO NOT `wrangler deploy` THIS DIRECTORY

Written 2026-09-13 by qnfo-ops/ops-exec after a revert-risk check.

## Why

| | value | source |
|---|---|---|
| **live** script `qnfo-fleet-control` | **0.4.15**, self-reports `worker: "qnfo-fleet-deploy"` | `fleet_drift_report` 17:03:06 and 16:03:41 (deployer health-ver scan) |
| **this directory's `worker.js`** | 75,875 B, sha `d9d438f0`, `VERSION "0.3.3"`, `WORKER "qnfo-fleet-advisor"` | GitHub read, this cycle |
| `fleet_deploys` rows for `qnfo-fleet-control` | **zero** | D1 read, this cycle |

The repo bundle is a stale advisor-era consolidated bundle. Deploying it would overwrite the live
0.4.15 deploy control plane with 0.3.3 and drop the uncommitted 0.4.13–0.4.15 work.

## What to do instead

1. Capture the live bundle first:
   `GET /accounts/{acct}/workers/scripts/qnfo-fleet-control/content`
   Commit that as the canonical source, then this directory is safe to deploy from again.
2. Until then, any deploy must be an API `PUT /workers/scripts/qnfo-fleet-control/content/v2`
   **multipart with `keep_bindings`**, carrying the live module set — not a repo-based `wrangler deploy`.
3. `qnfo-fleet-control` is **not** in the deployer's `NO_SELF` list (`NO_SELF = ["qnfo-fleet-deploy"]`),
   so the live worker will not refuse to redeploy itself. Nothing in-fleet protects this directory.

## Related

- `PATCH-2026-09-13-CONSOLIDATED.mjs` — fail-closed patch suite (13 groups) for the deploy subsystem.
  **Not applied.** Its group A anchor is verified in situ; groups B–J are verified against the pre-merge
  `qnfo-fleet-deploy/deployed-current.worker.js` blob only, because the deploy module sits past the
  32,768-char repo read cap.
- `FINDINGS-2026-09-13-deploy-subsystem-source-verified.md` — source-verified defect list (D1–D6).
- `agent_issues` 769 (deployer multi-module gap), 819 (no bundle read / no shell on qnfo-ops).
