# FINDING — DO NOT FIX THE 10021 ERROR. The deploy loop's failure is what is protecting production.

Date: 2026-09-13. Author: qnfo-ops endpoint (Chatbox client session).
Every value below is a tool return from this session. Nothing is carried over from a note.

This is a **stop** notice, not a diagnosis. It exists because the obvious remediation — "the hourly
deploy is failing with HTTP 400, fix it" — would cause the outage it looks like it is preventing.

## 1. Verified state

| what | how | value |
|---|---|---|
| production version | `web_fetch https://reading.q08.org/health` | **`1.1.0`**, `pieces: 8`, writer `deepseek-chat` |
| latest piece | same | `2026-09-13-notes-e336023daec68fda` "Four Claims a Map Makes" |
| drift row (latest) | `fleet_drift_report` id 1672, 13:01:22 | deployed **`v1.1.0`** / canonical **`1.0.0`** / `canonical-ahead` |
| kill-switch | `fleet_deploy_state` | **`enabled=1`, `auto_heal=1`**, both set **2026-09-08 16:25:49** — unchanged 5 days |
| loop attempts | `fleet_deploys`, `worker='personal-companion'` | **30 rows**, ids 13→74 |

Production is **healthy and advancing** (7 pieces on 09-13 06:45 → 8 pieces now).

## 2. The loop has been firing every hour for ~30 hours, and still is

`fleet_deploys` for `personal-companion`, every row `from_sha=v1.1.0` `to_sha=1.0.0`:

| ids | window | ok | note |
|---|---|---|---|
| 13, 15 | 09-12 08:01, 09:08 | **1** | `redeployed v1.0.0 -> 1.0.0` |
| 14 | 09-12 09:01 | 0 | `PUT-ok but deployed still v1.0.0 (wrangler-managed no-op?)` |
| **24, 26** | **09-12 10:30:30, 11:01:14** | **1** | **`redeployed v1.1.0 -> 1.0.0`** |
| 28 → 74 | 09-12 12:01 → 09-13 13:01 | 0 | `HTTP 400 code 10021 "Workflow GenerationFlow must be exported or a script_name must be specified"` |

**Every attempt from 10:30 onward targets a LOWER version than production runs.** From 12:01 onward
every attempt fails. That failure is the only reason `1.0.0` is not what is serving `reading.q08.org`.

## 3. `ok = 1` is not evidence the version changed

Rows 24 and 26 record `redeployed v1.1.0 -> 1.0.0` with `ok=1`. Production **today** reports `1.1.0`.
Row 14's own note shows the loop already observed this: *"PUT-ok but deployed still v1.0.0
(wrangler-managed no-op?)"*.

Two readings, and I cannot separate them from here: the 10:30/11:01 PUTs did not take effect, or they
did and something out-of-band restored `v1.1.0` between 11:01 and 12:01. **I assert neither.** What is
established is that `ok=1` in this table does not mean a version changed.

Consistent with that: `personal-companion` `modified_on` = **2026-09-13T13:32:01.743Z** while the newest
ledger row is id 74 at **13:01:23** (`ok=0`). A script changed today with no ledger row. `qnfo-social`
is the same (13:31:20 vs ledger 07:04:34). **`fleet_deploys` is not the complete deploy record.**

## 4. Why fixing 10021 would break production

CF rejects the upload because the running worker carries a Workflow binding named `GenerationFlow` and
the artifact being uploaded does not export it. The artifact is R2 `qnfo-canonical/personal-companion.js`
(every `fleet_deploys` row's `source_path` is `r2:qnfo-canonical/<worker>.js`).

Note `personal-companion/wrangler.toml` in this repo has **no `[[workflows]]` binding** — the repo config
does not describe the live worker either.

So there are **three independent defects stacked on one worker**, and they must be fixed in this order:

1. the artifact is **older than production** (`1.0.0` vs `v1.1.0`) — deploying it is a downgrade;
2. the artifact is **structurally undeployable** (no `GenerationFlow` export) → the 10021 rejection;
3. the **comparator** misparses `v1.1.0` as `[0,1,0]`, so it classifies a running `v1.1.0` as *behind*
   a `1.0.0` canonical and issues the deploy at all.

**Defect 2 is currently cancelling defects 1 and 3.** Remove defect 2 first and defects 1 and 3 execute:
`1.0.0` replaces `v1.1.0` on the live worker, hourly, with `auto_heal=1` and nothing to stop it.

## 5. Correct order of operations

1. **`UPDATE fleet_deploy_state SET value='0' WHERE key='auto_heal'`** — one row, reversible, and it is
   the only change that makes every subsequent step safe. Until this lands, do not touch defects 1 or 2.
2. Reconcile the canonical so it is **≥ v1.1.0** *and* **exports `GenerationFlow`**.
3. Apply the comparator fix — `qnfo-fleet-control/version-compare.mjs` (+ `.test.mjs`) in this repo:
   strips the leading `v`, and treats equal-core/differing-suffix and unparseable build tags as
   `blocked` rather than acting on them.
4. Only then set `auto_heal` back to `1`, and re-verify from `/health` after the first deploy.

## 6. Not resolvable from this endpoint

- **`auto_heal` cannot be set to `0`.** `ops_d1_query` is SELECT/WITH only — there is no D1 write path.
- **No deploy route.** Deploying needs `wrangler`; `qnfo-fleet-control` is live and token-gated, and I
  hold no token for it.
- **The pre-fix comparator source was never read.** The `qnfo-fleet-deploy/worker.js` tombstone says the
  content is *"NOT lost"* and to retrieve it via
  `github_repo_read path=qnfo-fleet-deploy/worker.js ref=ed539ec3`. That returns
  **`path not found`**. Retried with the full sha `ed539ec3254633ed265aa344bbbcffd6cc5fdc9d`,
  with `main/qnfo-fleet-deploy/worker.js`, and as a directory listing — all `path not found`.
  **The documented archive pointer does not resolve.** Treat the pre-fix source as unavailable, not archived.
- The leading-`v` misparse is therefore **inferred from 30 observed ledger rows plus the drift labels**,
  not read from the comparator's source.

## 7. Also observed while verifying this

- `qnfo-ops` (this endpoint) is itself in the drift set: id 1683, `deployed=2.15.1` / `canonical=2.13.0`,
  `deployed-ahead`, hourly. A redeploy of this worker would regress it. (Registry reports `2.15.2` —
  a third value for the same worker.)
- `fleet_deploy_state` carries `scanerr:*` keys for **≥38 workers**, including `fleet-scheduler`,
  `fleet-executor`, `qnfo-errata-watch/respond/publish` — names the service registry describes as
  *merged* into `fleet-exec` / `errata-hub`. Two rosters, unreconciled.
- `scanerr:qnfo-scorecard` and `scanerr:qnfo-container-executor` = **`nocanon`** — no canonical at all.
  `qnfo-scorecard` is also the one worker `integration_state` flagged as emitting no
  probe/trace/invocation signal.
- `scanerr:obsidian-writer` and `scanerr:osf-integrity-check` = `stale-canon` as of 09-12 11:01.
