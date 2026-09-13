# How the async-job fix must land — and the version regression that blocks it

Author: qnfo-ops / ops-exec (2026-09-13). **Rev 2** — §3 corrected, §8 resolved, §9 added.
Companion to `2026-09-13-async-job-audit-trail-and-envelope.md` (staged) and
`2026-09-13-async-job-addendum-corrections.md` (sha `312947ae`).

Status: **not applied — and it must not be applied naively.** A canonical redeploy of `qnfo-ops`
would *regress* the live worker.

---

## 1. The deploy path exists

`qnfo-fleet-deploy` is the fleet's self-heal control plane (`qnfo-fleet-deploy/README.md`,
sha `c1ede5c1`):

- `POST /redeploy` — **token-gated** (`DEPLOY_ADMIN_TOKEN`), deploys canonical bundles to any worker
- `POST /drift` — admin, report-only scan
- hourly scheduled drift scan; **auto-heal OFF by default**
- kill-switch (`fleet_deploy_state.enabled`) **and** auto_heal flag both default `'0'` (fail-closed)
- canonical-source-only redeploy — "no arbitrary code injection"
- **self-redeploy refused**; 60 s cooldown
- secrets: `CF_DEPLOY_TOKEN`, `DEPLOY_ADMIN_TOKEN`, `SELFHEAL_TOKEN`

The earlier claim "no deploy path exists" is wrong — one does, and it runs hourly. Corrected.

## 2. BLOCKER A — the endpoint cannot call it

- `DEPLOY_ADMIN_TOKEN` is **not** in qnfo-ops' declared deps.
- `run_code` is isolated: no network, no filesystem, **no secrets**.
- `web_fetch` is GET-only; `/redeploy` is POST.
- `qnfo-fleet-deploy` **refuses self-redeploy**, so qnfo-ops cannot bootstrap itself.

From this endpoint the deploy is unreachable **by design**. That is correct behaviour, not a defect
to route around.

## 3. BLOCKER B — a canonical redeploy would REGRESS qnfo-ops  **[CORRECTED]**

| artifact | VERSION | size | source |
|---|---|---|---|
| **live** qnfo-ops | **2.15.1** | — | `service_registry` |
| canonical `qnfo-ops/worker.js` | **2.14.0** | 161,339 B | GitHub, sha `cf9bb72e` |
| `qnfo-ops/deployed-current.worker.js` | **2.13.0** | 157,399 B | GitHub, sha `110261ac` |

**Correction to rev 1.** There are **two different canonical sources**, and they disagree:

- the **drift scan** compares against GitHub `qnfo-workers/main/<worker>/deployed-current.worker.js`
  (`fleet_drift_report.source_path`)
- the **deploy path** pulls from R2 — `r2:qnfo-canonical/<worker>.js` (`fleet_deploys.source_path`)

So "canonical version" depends on which source is read. For qnfo-ops the drift scan reports
canonical **2.13.0**; the repo's `worker.js` is 2.14.0; live is 2.15.1. **Either way the deploy
target is behind live**, so a redeploy reverts 2.15.1 → 2.13.0 (drift's source) or → 2.14.0
(worker.js). Rev 1 said only 2.14.0; the drift report's own answer is 2.13.0.

Confirmed hourly by the drift scan itself:

| worker | deployed_version | canonical_version | note | ts |
|---|---|---|---|---|
| qnfo-ops | **2.15.1** | **2.13.0** | **deployed-ahead** | 2026-09-13 06:03:34 |
| qnfo-ops | 2.15.1 | 2.13.0 | deployed-ahead | 2026-09-13 05:04:40 |
| qnfo-ops | 2.15.1 | 2.13.0 | deployed-ahead | 2026-09-13 04:03:32 |
| qnfo-ops | 2.15.1 | 2.13.0 | deployed-ahead | 2026-09-13 03:03:29 |

This is exactly the condition the control plane's own README warns about:

> "Do NOT enable auto_heal until canonical bundles are synced ahead of deployed versions
> (2026-09-08 drift scan: 7 workers deployed-AHEAD of canonical)."

**Step 0 of any apply is to sync the canonical bundle to 2.15.1 first**, then apply the hotfix on
top, so the deploy is monotone. And note the 2.15.1 source may exist **only on the live worker** —
neither repo copy is 2.15.1, so syncing canonical may first require retrieving the deployed bundle.

## 4. BLOCKER C — the hotfix cannot be authored from here

The repo's pattern is an anchor-based script (`qnfo-ops/scripts/hotfix-code-gate-classifier.mjs`,
sha `f0a80b8a`): read `worker.js`, no-op if a marker comment is present, replace **one exact** `OLD`
string with `NEW`, **assert exactly 1 occurrence and abort without writing otherwise**, bump
`VERSION`, write. That fail-closed assertion is the right design and should be copied.

But it needs the literal source at the call site, and:

- `qnfo-ops/worker.js` = **161,339 B**, past the **32,768-char** read cap
- `qnfo-ops/deployed-current.worker.js` = 157,399 B — also past it
- `github_repo_read` returns from the start of the file only, with no offset parameter

So the first ~32 KB is readable (the VERSION banner, the CODE-GATE-GUARD block) and the job-runner
body is not. **A blind regex hotfix written without reading the target would be unverified
guesswork.** Not authored deliberately.

## 5. The apply procedure for whoever holds the repo + wrangler

```bash
cd qnfo-workers/qnfo-ops

# 0. SYNC CANONICAL TO LIVE FIRST — do not skip (see §3)
git diff --stat HEAD -- qnfo-ops/worker.js      # confirm what is about to change

# 1. apply the staged fixes in the parent doc's order: D1, then D3
node scripts/hotfix-async-job-tool-log.mjs      # (to be authored against the real call site)
node scripts/hotfix-async-job-prompt-json.mjs

# 2. syntax gate BEFORE deploy — the established step
node --input-type=module --check < worker.js && echo SYNTAX-OK

# 3. regression guard
bash scripts/guard-async-job-audit.sh           # exit 0 = PASS

# 4. deploy, then verify the version actually moved
npx wrangler deploy
curl -s https://qnfo-ops.q08.workers.dev/health   # expect >= 2.15.2, NOT 2.13.0/2.14.0

# 5. re-verify the defect is gone
#    SELECT count(*) FROM ops_jobs WHERE length(tool_log)=3000;   -- expect 0
#    SELECT count(*) FROM ops_jobs WHERE json_valid(tool_log)=0;  -- expect 0
```

Rollback: `git checkout <prev-sha> -- qnfo-ops/worker.js && npx wrangler deploy`, then re-verify the
version — a rollback to a pre-2.15.1 canonical reintroduces §3.

`guard-async-job-audit.sh` (sha `6aca7109`) is **authored but has never been executed** — the
endpoint has no shell. Its predicates were run via `ops_d1_query` and currently **FAIL**: 14 rows at
`length(tool_log)=3000`, 0 of 14 valid JSON.

## 6. Sequencing consequence

The parent doc's order (D1 → D3 → D2 → D4) is still right *within* the fix, but it is now preceded
by a step 0 that did not exist when it was written: **sync canonical ahead of live**.

## 7. Security observation — for human action, not for this endpoint

The `qnfo-backups` bucket holds deploy credentials as **plaintext objects** (e.g.
`credentials/fleet-deploy-admin-token.txt`, 48 B, uploaded 2026-09-09). **I did not read it and
must not.** Recorded only as an observation: a token authorising fleet-wide redeploy sitting in an
object store is a blast-radius question for whoever owns the bucket policy.

## 8. RESOLVED — the kill-switch is ON, contradicting the documented default  **[was "not established"]

Rev 1 listed "whether `POST /redeploy` is currently enabled" as unknown. It is not unknown:

| key | value | updated_at |
|---|---|---|
| `enabled` | **`1`** | 2026-09-08 16:25:49 |
| `auto_heal` | **`1`** | 2026-09-08 16:25:49 |

Both were flipped to `1` on 2026-09-08 — the **same day** the README's warning was written about
7 workers being deployed-ahead of canonical. So the control plane is armed, and auto-heal is armed,
in the exact configuration the README says not to enable.

**Mitigating fact: it has never healed anything.** Every cron summary reports `healed=0`:

```
cron: scanned=55 clean=33 drifted=9 ahead=9 healed=0 errors=0 staleCanon=4 healthVer=10
      errKinds={"version-format":19,"stale-canon":4,"health-ver":10}
      regOpen=99 regOverdue=7 regDue7=66 regEscalated=7
cron: scanned=80 clean=50 drifted=18 ahead=3 healed=0 errors=2 staleCanon=7 healthVer=21
```

`ahead=9` / `ahead=3` are the deployed-ahead workers (qnfo-ops among them) and `healed=0` means the
healer is **not** downgrading them. Whether that is by design (heal only `canonical-ahead`) or
because healing is broken (§9) is not established. The distinction matters: if the healer ever
starts treating `deployed-ahead` as drift to correct, it will silently downgrade live workers.

Drift ledger: **1,553 rows**, newest 2026-09-13 06:05:30 — `canonical-ahead` 914, `deployed-ahead`
449, plus scan errors (`noVERSION` 29, `stale-canon` 15, `nocanon` 15).

## 9. NEW — the deploy loop is failing hourly and one attempt is a downgrade

`fleet_deploys`: **63 rows, 18 ok (28.6%)**, 2026-09-08 16:08 → 2026-09-13 06:02.

| worker | attempts | ok |
|---|---|---|
| `qnfo-cloud-ops` | 24 | **0** |
| `personal-companion` | 23 | 4 |
| all others (8 workers) | 1–3 each | 1–3 each |

**47 of 63 deploy attempts are these two workers, and 43 of the 45 failures.** Both fail on
`HTTP 400` / Cloudflare error **10021**:

- `qnfo-cloud-ops` — `Uncaught SyntaxError: Invalid or unexpected t…`, retried every hour from
  01:02 to 06:02 (24/24 fail). The bundle in `r2:qnfo-canonical/qnfo-cloud-ops.js` does not parse.
- `personal-companion` — `Workflow GenerationFlow must be exported or a…`, and note the direction:
  `from_sha` **`v1.1.0`** → `to_sha` **`1.0.0`**. The control plane is attempting to deploy a
  **lower** version over a higher one, hourly. It is failing, so the downgrade has not landed —
  but the intent is wrong, not merely the bundle.

Two consequences: (a) an hourly retry loop is burning the deploy token against two permanently
broken bundles; (b) `personal-companion`'s canonical is a version *behind* live, so if the syntax
error is ever fixed the downgrade will land. Both need the canonical synced, exactly as §3 requires
for qnfo-ops.

## 10. Not established

- Whether the healer deliberately skips `deployed-ahead` or fails to act on it (§8).
- Whether 2.15.1 exists anywhere except the live worker (§3) — this is the prerequisite for step 0.
- The contents of `r2:qnfo-canonical/qnfo-ops.js` — the bucket is not bound to this endpoint, so the
  deploy-side canonical for qnfo-ops was never read.
