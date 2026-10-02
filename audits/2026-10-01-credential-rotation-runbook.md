# ROTATE-EXPOSED-CREDENTIALS-1 — execution runbook (#1676, CRITICAL)

Window: **2026-10-03** (fixed by the issue; NOT executed early). Owner: qnfo-ops.

> **What actually happened (measured 2026-10-02 with `cf-ops-actions worker-history qnfo-ops`, CF-WORKER-HISTORY-1):**
> the qnfo-ops leg ran early, on **2026-10-01 between 07:32:04Z and 07:45:21Z**: nine worker versions triggered by
> `secret` (versions 424 and 428-435), made directly through the Cloudflare API, with no row in `fleet_deploys`,
> `deployment_history`, `cloud_ops_events` or `agent_issues`. Several agent sessions ran the rotation concurrently and
> clobbered each other's slots (#1701). Afterwards qnfo-ops holds `OPS_ROUTER_AUTH_KEY` and `OPS_ROUTER_AUTH_KEY_2`
> only; `OPS_CLIENT_KEY` is gone. Step 3 below (update every non-worker consumer in the same step) was not done for the
> owner's clients: ChatBox got 401 on 2026-10-02, and canonical-deploy got 401 at 07:45Z until the Actions secret was
> reset (DEPLOY-AUTH-CLASS-1). The exposed values are dead and must never be re-accepted. Since qnfo-ops 2.38.35
> (OPS-PUBLIC-READ-1) a client without the current key still gets read-only answers. Next time, take the
> secret-lock (CLAUDE.md, #1701) and record each secret PUT in `fleet_deploys`.
Reason for the window: rotating a live endpoint key breaks every consumer not updated in the
same atomic step. The router-key consumer set is not enumerable at rest (workers store it under
different secret names — `ROUTER_TOKEN`, `ROUTER_AUTH_KEY`, …), so an early blind rotation would
silently break the research/social/intent pipelines (CHANGE-AUDIT-FIRST-1).

## Consumer map (enumerated 2026-10-01 via CF /bindings on all 39 scripts)
| credential | secret holders | non-worker consumers |
|---|---|---|
| OPS_ROUTER_AUTH_KEY (48c) | qnfo-ops | ~/.env; scripts/{ops_deploy,ci_watchdog,fleet-autoaudit,run-gate-internal-patch,canonical_deploy,deploy_guard}.py; DeepChat agent.db; ChatBox config.json |
| ROUTER_AUTH_KEY / _2 | qnfo-ai | every worker that calls qnfo-ai with a router bearer (research-exec `ROUTER_TOKEN`, qnfo-intent-orchestrator, qnfo-social, qnfo-ai-calibration, …); clients |
| API_KEY (personal) | personal-api | personal clients; personal-api's own /mcp + /v1 routes |
| CLOUDFLARE_API_TOKEN | qnfo-ops (as CF_API_TOKEN) | 35 workflows/scripts; ~/.env; local deploy tooling |

## Atomic procedure (per credential — do NOT interleave)
1. **Generate** new value (32–48 bytes, hex/base64) in the credential store, not in shell history.
2. **PUT** the worker secret(s) that hold it:
   `PUT /accounts/{acct}/workers/scripts/{worker}/secrets` (see SECRET-BINDING-STDIN-NEWLINE-1:
   set exact value, no trailing newline).
3. **Update every non-worker consumer in the same step** (ALL of them, before any verify):
   - `~/.env`
   - the 5 scripts (they read from env — confirm no hardcoded copy via `grep -r <old-prefix>`)
   - DeepChat `agent.db` provider/apiKey + Roaming `app-settings.json`
   - ChatBox `%APPDATA%/xyz.chatboxapp.app/config.json`
   - every *worker* that stores the key under ANY secret name (enumerate by re-grepping each
     worker's source for its own bearer to the target endpoint — this is the step that must be
     done by default for the router key).
4. **Redeploy** any worker whose secret was re-put (secret PUT alone does not redeploy).
5. **Verify, both directions:**
   - OLD value → **401** on the target endpoint.
   - NEW value → **200** on the target endpoint.
   - One live end-to-end call per consumer class (a script, a client, a worker).
6. **Record** to `self_heal_actions` + `reorg_work_queue` (close the item) with the two-direction proof.

## CF token leg (identity-bound)
CF token creation/revocation is account-owner scoped. Rotate via
`POST /accounts/{acct}/tokens` (new token, same scopes) → grant → update consumers → revoke old.
If the session lacks account-owner scope, this leg executes from the owner-authenticated context
in the same window; it is the only genuinely identity-bound step.

## Rollback
Each credential's old value is retained in the credential store until step 5 passes; on any
failed verification, re-PUT the old value + redeploy (restores the pre-rotation state).

## DoD (#1676)
All 4 credentials rotated; every consumer updated in the same window; each OLD value returns 401;
each NEW value returns 200; ledger rows record the two-direction proof; blocked until then.
