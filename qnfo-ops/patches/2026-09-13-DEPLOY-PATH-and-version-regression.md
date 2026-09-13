# How the async-job fix must land — and the version regression that blocks it

Author: qnfo-ops / ops-exec (2026-09-13). Companion to
`2026-09-13-async-job-audit-trail-and-envelope.md` (staged) and
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
- **canonical-source-only redeploy — "no arbitrary code injection"**
- **self-redeploy refused**; 60 s cooldown
- secrets: `CF_DEPLOY_TOKEN`, `DEPLOY_ADMIN_TOKEN`, `SELFHEAL_TOKEN`

So the earlier claim "no deploy path exists" is wrong — one does, and it is hourly. Correcting it.

## 2. BLOCKER A — the endpoint cannot call it

- `DEPLOY_ADMIN_TOKEN` is **not** in qnfo-ops' declared deps (registry: `api.deepseek.com`,
  `qnfo-audit D1`, `qnfo-intent-orchestrator`, `CF_API_TOKEN`, `REGISTRY_TOKEN`, D1/Vectorize/R2/KV/WAI).
- `run_code` is isolated: no network, no filesystem, **no secrets**.
- `web_fetch` is GET-only; `/redeploy` is POST.
- `qnfo-fleet-deploy` **refuses self-redeploy**, so qnfo-ops cannot bootstrap itself.

Net: from this endpoint the deploy is unreachable **by design**. That is correct behaviour, not a
defect to route around.

## 3. BLOCKER B — NEW and material: a canonical redeploy would REGRESS qnfo-ops

| artifact | VERSION | size | source |
|---|---|---|---|
| **live** qnfo-ops | **2.15.1** | — | `service_registry` |
| canonical `qnfo-ops/worker.js` | **2.14.0** | 161,339 B | repo, sha `cf9bb72e` |
| `qnfo-ops/deployed-current.worker.js` | **2.13.0** | 157,399 B | repo, sha `110261ac` |

Live is **one version ahead of canonical** and two ahead of `deployed-current`. Because redeploy is
canonical-source-only, **deploying now would replace 2.15.1 with 2.14.0** — silently reverting
whatever 2.15.x changed, *while* shipping the async-job fix.

This is exactly the condition `qnfo-fleet-deploy`'s own README warns about:

> "Do NOT enable auto_heal until canonical bundles are synced ahead of deployed versions
> (2026-09-08 drift scan: 7 workers deployed-AHEAD of canonical)."

qnfo-ops is one of those deployed-ahead workers. **Therefore step 0 of any apply is to sync the
canonical bundle to 2.15.1 first**, then apply the hotfix on top, so the deploy is monotone.

## 4. BLOCKER C — the hotfix cannot be authored from here

The repo's established pattern is an anchor-based script
(`qnfo-ops/scripts/hotfix-code-gate-classifier.mjs`, sha `f0a80b8a`): read `worker.js`, no-op if a
marker comment is present, replace **one exact** `OLD` string with `NEW`, **assert exactly 1
occurrence and abort without writing otherwise**, bump `VERSION`, write. That fail-closed assertion
is the right design and should be copied.

But it requires the literal source text at the call site, and:

- `qnfo-ops/worker.js` = **161,339 B**, past the **32,768-char** read cap
- `qnfo-ops/deployed-current.worker.js` = 157,399 B — also past it
- `github_repo_read` returns from the start of the file only, with no offset parameter

So the first ~32 KB is readable (VERSION banner and the CODE-GATE-GUARD block) and the job-runner
body is not. **A blind regex hotfix written without reading the target would be unverified guesswork
of exactly the kind this fleet has already been burned by.** Not authored deliberately.

## 5. The apply procedure for whoever holds the repo + wrangler

```bash
cd qnfo-workers/qnfo-ops

# 0. SYNC CANONICAL TO LIVE FIRST — do not skip (see §3)
#    reconcile worker.js up to 2.15.1 so the deploy is not a regression
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
curl -s https://qnfo-ops.q08.workers.dev/health   # expect 2.15.2 or higher, NOT 2.14.0

# 5. re-verify the defect is gone (the guard's own predicates)
#    SELECT count(*) FROM ops_jobs WHERE length(tool_log)=3000;         -- expect 0
#    SELECT count(*) FROM ops_jobs WHERE json_valid(tool_log)=0;        -- expect 0
```

Rollback: `git checkout <prev-sha> -- qnfo-ops/worker.js && npx wrangler deploy`, then re-verify
the version — a rollback to a pre-2.15.1 canonical reintroduces §3.

Note `guard-async-job-audit.sh` (sha `6aca7109`) is **authored but has never been executed** — the
endpoint has no shell. Its predicates were run via `ops_d1_query` and currently **FAIL**: 14 rows at
`length(tool_log)=3000`, 0 of 14 valid JSON.

## 6. Sequencing consequence

The parent doc's order (D1 → D3 → D2 → D4) is still right *within* the fix, but it is now preceded
by a step 0 that did not exist when it was written: **sync canonical ahead of live**. Until that is
done, applying anything via `qnfo-fleet-deploy` trades one defect for a version regression.

## 7. Security observation — for human action, not for this endpoint

The `qnfo-backups` bucket holds deploy credentials as **plaintext objects** (e.g.
`credentials/fleet-deploy-admin-token.txt`, 48 B, uploaded 2026-09-09). **I did not read it and
must not.** Recorded here only as an observation: a token that authorises fleet-wide redeploy
sitting in an object store is a blast-radius question for whoever owns the bucket policy. The
parent doc already reserves one security item for private handling; this may be it.

## 8. Not established

- Whether `POST /redeploy` is currently enabled (`fleet_deploy_state.enabled`) — that is a D1 table
  in `qnfo-audit` but I did not find it under that name in this session's queries.
- Whether 2.15.1's changes are committed anywhere (the canonical is 2.14.0 and
  `deployed-current` is 2.13.0, so the 2.15.1 source may exist only on the live worker).
  **If so, the canonical can only be synced by retrieving the deployed bundle** — which is a
  real prerequisite, not a formality.
