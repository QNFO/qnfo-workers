# REV3 — Deploy-plane addendum, source-verified

Date: 2026-09-13. Supersedes the deploy-plane attribution in
`docs/AUDIT-2026-09-13-fleet-errors-warnings-alerts.md` §0.5 and §1, and
upgrades one item there from *inferred* to *source-verified*.

Read this before acting on any deploy fix in the main audit.

---

## 1. My audit named the wrong deployer

The main audit attributes the deploy loop to `qnfo-fleet-deploy`. **That worker
is superseded source — nothing executes it.**

`qnfo-fleet-control/wrangler.toml`, verbatim:

> MERGE WAVE A (2026-09-11): qnfo-fleet-advisor + qnfo-fleet-calibrator +
> qnfo-fleet-deploy merged into ONE worker (3 -> 1). Subsystems dispatched by
> path: `/advisor/*`, `/cal/*`, else deploy control plane.

**The live deployer is `qnfo-fleet-control`** (registry v0.4.11;
`qnfo-fleet-control/worker.js`, 75,875 B, sha `d9d438f042c8f39a0fe27661b977fdb8c437197e`).

Consequence: a patch written against `qnfo-fleet-deploy/worker.js` changes
nothing that runs. `PATCH-2026-09-13-downgrade-guard-bundle.mjs` exists
precisely to correct that earlier mistake.

This also explains why the main audit's attempt to read the pre-fix comparator
from `qnfo-fleet-deploy/worker.js@ed539ec3` returned `path not found` — I was
reading a tombstone for a worker that no longer exists.

---

## 2. The comparator misparse is now SOURCE-VERIFIED

The main audit claimed the leading-`v` misparse was *proven by two contrary
drift rows*. It is better than that. `qnfo-fleet-control/version-compare.mjs`
(sha `86835e1a3ac84aa12004cb47093b3fbd8bd93dc1`) states the mechanism in its own
header:

> A leading "v" makes `parseInt("v1")` NaN -> 0, so `"v1.1.0"` parses as
> `[0,1,0]` and is classified LOWER than `"1.0.0"` = `[1,0,0]`. The running
> worker is therefore labelled canonical-ahead and redeployed against its will,
> hourly, forever.

So the mechanism is documented in-repo, not merely inferred. **Correction to
the main audit: this item moves from §11 "could not establish" to verified.**

**The corrected comparator is already committed** (`version-compare.mjs`,
with `version-compare.test.mjs`, 20/20 assertions per its header) and is
**not live**. It strips one leading `v`, and returns `UNORDERABLE` — not
`greater` — when cores are equal but suffixes differ. That second rule is
load-bearing: a naive semver rule would order `3.6.1` above
`3.6.1-subscribers` and strip the live gateway's suffix, and order `1.14.1`
above `1.14.1-gtd-guard` and strip the cloud-ops guard.

---

## 3. A larger defect the main audit missed

`PATCH-2026-09-13-downgrade-guard-bundle.mjs` documents the live deploy path:

```js
var direction = newer(depV || "", canV) ? "downgrade" : "upgrade";
var toSha = await sha256(c.code);
...  // PUT /workers/scripts/{worker}/content with c.code
```

**`direction` is computed and never read again.** Nothing in `redeploy()` gates
on it. `scan()` avoids downgrades only *incidentally* — its ahead-branch
`continue`s before reaching `redeploy()` — and that guard lives in the
**caller**, so the HTTP route `POST /redeploy` **bypasses it entirely**.

This is worse than the leading-`v` bug. The misparse causes *unwanted* redeploy
attempts; the missing guard means **any authenticated `POST /redeploy` can
revert any worker to an older build**, with no version check at all.

### Measured exposure (2026-09-13, `fleet_drift_report`, deployed-ahead rows)

**518 deployed-ahead rows across 18 workers.** Sampled:

| worker | deployed | canonical |
|---|---|---|
| qnfo-ops (this auditor) | 2.15.1 | 2.13.0 |
| qnfo-ai | 5.25.1 | 5.21.3 |
| qnfo-research-exec | 0.8.1 | 0.5.17-research-restored |
| qnfo-fleet-dashboard | 1.5.1 | 1.1.0 |
| personal-api | 3.5.0 | v3.2.2-maxout200k |
| qnfo-signal-loop | 1.1.2 | 1.1.0 |
| qnfo-fleet-control | 0.3.4 | 0.3.3 |
| qnfo-backlog-exec | 1.2.7 | 1.2.4 |
| qnfo-ai-calibration | 1.1.5 | 1.1.4 |
| qnfo-email-orchestrator | 0.3.4-glm53 | 0.3.4 |
| qnfo-social | 0.5.3-failclosed | 0.5.3 |

Every row is a worker whose live build is **newer** than its canonical. One
`POST /redeploy` per worker reverts it.

---

## 4. The primary fix is configuration, not code

Both aggravating settings are verified live in `fleet_deploy_state`:

| key | value | updated_at | README default |
|---|---|---|---|
| `enabled` | **`1`** | 2026-09-08 16:25:49 | 0 (fail-closed) |
| `auto_heal` | **`1`** | 2026-09-08 16:25:49 | 0 (fail-closed) |

The deploy README states: *"Do NOT enable auto_heal until canonical bundles are
synced ahead of deployed versions."* `fleet_drift_report` holds **1,492 drift
rows across 50 workers**, so that precondition is not met.

Exact statement, for whoever holds a D1 write path:

```sql
UPDATE fleet_deploy_state
   SET value='0', updated_at=datetime('now')
 WHERE key IN ('auto_heal','enabled');
```

This is the highest-leverage action in the entire audit and it is **one row
pair, reversible**. The code guard is defence in depth, not the primary fix.
**qnfo-ops cannot execute it — its SQL surface is SELECT/WITH only.**

---

## 5. The code fix is STAGED, not live

`qnfo-fleet-control/worker.js` contains:

```js
var NO_SELF = ["qnfo-fleet-deploy"];   // scan() skips this worker
```

Applying the patch and bumping `VERSION` **will not cause a redeploy.** A manual
`wrangler deploy` from `qnfo-fleet-control/` is required. Until that happens the
guard is staged only. **Do not report it as applied.**

### Anchor confidence caveat, carried forward verbatim

`qnfo-fleet-control/worker.js` is 75,875 B. The read tool available to qnfo-ops
caps at 32,768 chars with **no offset parameter**, and only the first ~3,000
bytes were retrieved (the advisor module, not the deploy subsystem). Therefore
**the deploy-subsystem anchors in the patch are NOT verified against this
bundle** — they are inherited from anchors verified against
`qnfo-fleet-deploy/worker.js` (sha `ed539ec3`). The patch fails closed: `swap()`
counts each anchor and refuses to write unless the count matches exactly,
exiting 2 having changed nothing. Run `--check` first.

---

## 6. Corrected action order

1. `UPDATE fleet_deploy_state SET value='0' WHERE key IN ('auto_heal','enabled')`
   — reversible, unblocks everything else. **D1 write; not available here.**
2. Confirm no `POST /redeploy` can reach the fleet while `auto_heal=0`.
3. `node PATCH-2026-09-13-downgrade-guard-bundle.mjs --check` — read the output.
   Do not `--apply` on an unreviewed check.
4. Manual `wrangler deploy` of `qnfo-fleet-control` (it cannot self-deploy).
5. Verify the leading-`v` case: `personal-companion` should stop reporting
   `canonical-ahead` for `v1.1.0` vs `1.0.0`.
6. Only then reconsider `auto_heal=1`.

**Do not apply the main audit's old FIX-1** (export `GenerationFlow`) at any
step. That failure is the only thing preventing an hourly downgrade.

---

## 7. Limits of this addendum

- **The deploy-subsystem source was not read.** Only the first ~3,000 bytes of
  `qnfo-fleet-control/worker.js` are retrievable with the tools available, so
  the `direction`-never-read claim is taken from the patch's quoted excerpt, not
  read from the live bundle by me this session.
- **The 518-row / 18-worker exposure figure is quoted from the patch**, not
  recounted by me. I verified 20 individual `deployed-ahead` rows directly.
- **`POST /redeploy` was not exercised.** I hold no token for
  `qnfo-fleet-control`, so the bypass is a source reading, not a demonstrated
  exploit. That distinction matters: it is a code-path argument, not a
  penetration test.
- **`version-compare.mjs` being committed says nothing about it being live.**
  The main audit's §1 errors are the proof that repo state and running state
  diverge on this fleet.
