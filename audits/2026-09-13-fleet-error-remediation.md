# Fleet error/warning/alert audit + remediation — 2026-09-13

Executor: qnfo-ops endpoint (Chatbox session). Every value below is a tool return from this session.

## Verdict

The fleet is not primarily failing from broken code. It is failing from a **broken delivery
path**: the fixes already exist as source in `QNFO/qnfo-workers`, and production runs the defect.
Separately, the largest alert source is a **self-blocked escalation loop** whose remedy is written
but undeployed, and the loudest error mass is **caller-side request-shape bugs** in the AI gateway.

## Executed in this session (verified by read-back)

| action | evidence |
|---|---|
| `fleet_deploy_state.auto_heal` 1 -> **0** | re-read: `{"key":"auto_heal","value":"0","updated_at":"2026-09-13 14:15:02"}` |
| Filed 7 evidence-backed `agent_issues` (695-701) | open count 0 -> 11; ids confirmed by read-back |
| Closed 2 of mine as duplicates (695->691, 696->694) | a concurrent instance filed 691-694 mid-session |

## The inventory (measured, not estimated)

| class | count | source |
|---|---|---|
| gateway HTTP 400 (caller request shape) | 20,402 | `ai_gateway_failures` |
| gateway HTTP 429 (capacity) | 38,113 | `ai_gateway_failures` |
| `qnfo-pipeline-ops` critical alerts | 802 all-time, 66 today | `alerts` |
| failed deploy attempts | 54 of 76 | `fleet_deploys` |
| idea proposals parked | 543 `triaged_hold` | `idea_proposals` |
| workers unprobed | 43 of 55 | `fleet_status` |
| open agent issues | 11 (9 after dedupe) | `agent_issues` |

`fleet_error_state` is empty and `agent_issues` held **zero** open rows at session start: the fleet
had no actionable ledger while 802 critical alerts were firing.

## Root causes, each verified

1. **Deploy comparator misparses leading-`v` versions.** `personal-companion`: 30 attempts, every
   one `v1.1.0 -> 1.0.0`. Live `https://reading.q08.org/health` (fetched this session) = `1.1.0`,
   pieces 8. `v1.1.0` parses as `[0,1,0]`, so a running `v1.1.0` is judged *behind* canonical
   `1.0.0`. The same version pair is labelled both `canonical-ahead` (drift id 1672) and
   `deployed-ahead` (drift id 1691) across runs - the comparator is not deterministic. **The missing
   `GenerationFlow` export is the only thing preventing a production downgrade.** Fix exists:
   `qnfo-fleet-control/version-compare.mjs`.
2. **No per-worker kill switch exists.** `fleet_deploy_state` holds only `enabled`, `auto_heal` and
   `scanerr:*` diagnostics - 46 rows read, no blocklist. Hence the blunt interlock.
3. **Alert storm is self-blocked, not undetected.** `qnfo-pipeline-ops` detects the stall and calls
   `escIssue` on every run, but the dedupe matched its own **closed** history: last real ticket
   `2026-09-06 20:30`, then `dup` hourly for 7 days. The repo source is already `v0.5.5` (20,030 B,
   sha `a7580136`) with fingerprint gating. Live D1 has **no `pipeline_state` table** and
   `qnfo-pipeline-ops.q08.workers.dev/health` returns **404**, proving the deployed build predates
   v0.5.4. The remedy is written and undeployed.
4. **One R2 key cannot carry two modules.** `qnfo-observability` fails `No such module "fleet.js"`
   because the control plane deploys from a single key. The repo already has the fix:
   `v1.1.6-single-module` (37,386 B, sha `c72736a8`), FLEET inlined. Canonical stuck at 1.1.4,
   `service_registry` claims 1.2.0 - three values for one worker.
5. **Corrupt canonical, not corrupt source.** `qnfo-cloud-ops`: 25 attempts, 0 ok,
   `SyntaxError at worker.js:1:2`. Repo `worker.js` (129,457 B) is valid JS starting with an import.
6. **Request-shape bugs.** `qwen2.5-coder-32b-instruct` 400 x16,548 requires `prompt`, caller sends
   `messages`. `qwen3.8-27b` 400 x3,459: "System message must be at the beginning". `glm-5.2` 400
   x392 invalid tool-call JSON. `gemma-4-26b` 400 x395: 1x1 image, minimum 10px.
7. **Monitoring blind spot.** 12 of 55 workers probed; the rest return `healthy=null` because this
   endpoint holds service bindings for only 12. `fleet_deploy_state` carries a second, unreconciled
   roster of 38 `scanerr:*` names, some for workers the registry calls merged or dead.

## What permanently resolves this (needs a capability this endpoint does not hold)

1. **A deploy path.** `qnfo-fleet-control` v0.4.11 is the deployer and its `deps` list
   `qnfo-canonical R2` - a bucket **not bound here**. Its source is 75,875 B against a 32,768-char
   read cap, so it cannot be patched through this endpoint either.
2. **Sync repo -> R2 canonical** for pipeline-ops, observability and cloud-ops. Three of the four
   highest-value fixes are already written and verified; they need transport, not authoring.
3. **Deploy the comparator fix, then restore `auto_heal=1`.** Revert is one row:
   `UPDATE fleet_deploy_state SET value='1' WHERE key='auto_heal'`.
4. **Add `qnfo-pipeline-ops` to `service_registry`.** The scan set is registry-keyed (scanned=55 ==
   registry rows=55) and pipeline-ops has no registry row, so it is never scanned. NOT executed
   here: the R2 canonical for that worker is unreadable from this endpoint, so enabling it could
   deploy an artifact older than production - the same harm class as (1).

## Failure modes against this record

- `auto_heal=0` was applied on the strength of a verified *order of operations* written by a prior
  session, not by reading the deployer's source (unreadable at 75,875 B). If `auto_heal` does not
  gate the deploy path, the interlock is inert and `enabled=0` is the fallback.
- Setting it to 0 also pauses the canonical resync that would land the fixes, and the ~4 successful
  deploys/day. That trade was taken deliberately: a downgrade of a live worker is not recoverable
  with the deploy path broken, while this is one row to undo.
- Two of my seven tickets were duplicates of concurrently-filed rows. Any count in this document was
  already stale on arrival - the fleet has at least two writers.
