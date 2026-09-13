# VERIFICATION — the §0 recommendation is source-confirmed (2026-09-13)

Corrects and confirms one citation in `audits/FLEET-AUDIT-CLOSEOUT-2026-09-13.md`.

## Correction to the closeout

The closeout cited **`qnfo-fleet-control/README.md`**. That path **does not exist**
(`github_repo_read` → `path not found`; the directory listing for `qnfo-fleet-control/`
contains no README). The authoritative README is at:

**`qnfo-fleet-deploy/README.md`** (blob `c1ede5c1a43d67ed14a677f3d77aa6bf1af8ad29`, 1,146 B)

## The claim, now verified first-hand

I had been relying on a prior session's assertion that the README documents both flags as
fail-closed `0`. Verbatim from the file just read:

> "Kill-switch (fleet_deploy_state.enabled) + auto_heal flag **BOTH default '0' (fail-closed)**.
> Self-redeploy refused. 60s cooldown. Canonical-source-only redeploy (no arbitrary code
> injection). **Do NOT enable auto_heal until canonical bundles are synced ahead of deployed
> versions** (2026-09-08 drift scan: 7 workers deployed-AHEAD of canonical)."

**So the §0 action is not merely safe — it is the documented correct state, and the
documented precondition for the current `1`/`1` is unmet:**

| README requires | Live state (2026-09-13 14:25Z) |
|---|---|
| both flags default `'0'` (fail-closed) | `auto_heal='1'`, `enabled='1'` — set 2026-09-08 16:25:49 |
| do not enable `auto_heal` until canonicals synced ahead | **9 workers deployed-ahead**; 1,492 drift rows / 50 workers |

## Additional facts this read established

1. **The live control plane is `qnfo-fleet-control`**, and its `/health` self-reports
   `worker="qnfo-fleet-deploy"` — the name mismatch is why `NO_SELF = ["qnfo-fleet-deploy"]`
   fails to protect the worker that actually executes (deploy-subsystem defect D5).
2. **A worker named `qnfo-fleet-deploy` does not exist** — `…/health` → HTTP 404.
3. **`qnfo-fleet-deploy/deployed-current.worker.js` is a `404:` tombstone** (1,793 B), placed
   2026-09-13 *because* the deploy resolver honours the `404:` prefix and skips it, whereas a
   stale-but-valid body **would be uploaded and would replace the live worker**. The pre-guard
   v0.4.11 source is archived at blob `ed539ec3254633ed265aa344bbbcffd6cc5fdc9d` (24,761 B).
4. **The tombstone's own warning names this exact scenario**: *"If it were deployed it would
   read the SAME `qnfo-audit.fleet_deploy_state` row (live: enabled=1, auto_heal=1) and resume
   healing the fleet with the unguarded comparator."* The tombstone was authored to prevent the
   loop; the flags were never flipped to match.

## Tradeoff I must state against my own recommendation

Flipping `auto_heal` to `0` **halts the damage and the repair together.** The drift scan
reports `healed=1` per cycle — legitimate deploys do succeed (e.g. `qnfo-backlog-exec`
1.2.6→1.2.7→1.2.8, `qnfo-social` 0.5.2→0.5.3). Disabling `auto_heal` stops the 51 impossible
deploys **and** the ~1 successful heal per cycle.

That is still the correct call: a 71% failure rate with the documented precondition unmet
means fail-closed is the designed state, and the successful heals can be run deliberately
via `POST /redeploy` until the canonicals are brought forward. But it is a real cost, not a
free win, and it should be a deliberate decision rather than an assumed one.

## What remains unverified

- The **healer's retry/backoff logic** was still not read; the loop is inferred from 26
  identical hourly `fleet_deploys` rows.
- **`scanned=` instability** (52/55/75/77/78/79/80) is unexplained.
- The **`qnfo-fleet-control` bundle itself** (the live merged worker) was not read; only its
  `FINDINGS`/`PATCH` companions were. The patch anchors remain prior-session work.
