# REMEDIATION — qnfo-cloud-ops deploy loop: canonical artifact is a raw MIME body

Filed 2026-09-13T07:25Z by qnfo-ops (audit endpoint). **Revised 07:40Z** — the first version
of this doc claimed the fix "requires an R2 write". That was **wrong**; see §Fix. Status:
**diagnosed, fix identified, not applied from this endpoint (payload size).**

## Symptom

`fleet_deploys` — qnfo-cloud-ops retried **25 times, 25 failures**, hourly, identical every time:

```
worker:      qnfo-cloud-ops
source_path: r2:qnfo-canonical/qnfo-cloud-ops.js
from_sha:    1.14.1
to_sha:      1.14.1-gtd-guard
ok:          0
HTTP 400 code 10021
Uncaught SyntaxError: Invalid or unexpected token
  at worker.js:1:2
```

## Root cause

`qnfo-cloud-ops/deployed-current.worker.js` (121,107 B,
sha `8a141efa6658cf3604a64074b738094b12d94a7e`) does **not** start with JavaScript. It
starts with an unconsumed multipart/form-data wrapper:

```
--75c3e06c5bc8c3b1f57419c665412e3fe5a6e889c944c94ff9de81b2036d
Content-Disposition: form-data; name="worker.js"

var __defProp = Object.defineProperty;
...
```

The upload API parses the artifact as JS. Column 2 of line 1 is the **second `-` of the MIME
boundary** — hence `SyntaxError at worker.js:1:2`. The genuine payload begins on line 4. This
is a **strippable prefix**, not a truncation or a logic bug.

## Where the deployer actually reads from (this is the correction)

From `qnfo-fleet-deploy/worker.js` (`canonical()`, v0.4.11), verbatim order:

1. `r2Read()` → `env.CANONICAL.get("<worker>.js")`, returned **only if fresh** —
   `customMetadata.ts` younger than `FRESH_MS = 1800000` (30 min).
2. Otherwise fetch **GitHub raw** (`GH = "https://raw.githubusercontent.com/QNFO/"`), first
   candidate that returns 200 and does not start with `404:` wins:
   ```
   qnfo-workers/main/<name>/deployed-current.worker.js   <-- the corrupted file, candidate #1
   qnfo-ops/main/cloud/<name>/deployed-current.worker.js <-- 404 (repo has cloud/scheduler/)
   qnfo-workers/main/<name>/worker.js                    <-- CLEAN, candidate #3
   qnfo-ops/main/cloud/<name>/worker.js
   ```
   (`main` here is the **branch**, not a directory.)
3. On success it **writes the fetched GitHub content back into R2** with a fresh timestamp:
   `await env.CANONICAL.put(worker + ".js", c, { customMetadata: { ts: Date.now() } })`.
4. Falls back to the stale R2 object only if every GitHub candidate fails.

**Consequences:**

- **GitHub is upstream; R2 is a 30-minute cache.** The `source_path: r2:qnfo-canonical/...`
  in the audit row is where the *payload was cached*, not where it is authored.
- The corrupted `deployed-current.worker.js` is candidate **#1** and short-circuits the clean
  `worker.js` at candidate **#3** — the good file is already present but unreachable.
- Fixing the GitHub file **does** fix the loop: the next scan past R2 staleness re-fetches
  from GitHub, overwrites the R2 object, and deploys clean.

`fleet_deploy_state` (verified): `enabled = 1`, `auto_heal = 1` (both set 2026-09-08 16:25:49).
So the hourly scan **does** auto-deploy; no manual `POST /redeploy` is needed once the source
is correct.

## Fix (pick one — both are GitHub operations)

1. **Promote the clean source:** write the contents of
   `qnfo-cloud-ops/worker.js` (129,467 B, sha `ca488a2c…`, `VERSION = "1.14.1-gtd-guard"`)
   over `qnfo-cloud-ops/deployed-current.worker.js`. Candidate #1 then resolves clean.
2. **Or delete `qnfo-cloud-ops/deployed-current.worker.js`**, letting the resolver fall
   through to `worker.js` (candidate #3) automatically. Equivalent outcome, smaller diff.

Either way: do **not** re-run the upload that produced the wrapped file — that is what
re-corrupts the object. `QNFO/qnfo-ops/cloud/scheduler/worker.js` (112,705 B, sha `1851450d…`)
is a third clean copy at the same declared version, but the resolver's `qnfo-ops` candidates
are `qnfo-ops/main/cloud/<name>/…` which do **not** match that repo's `cloud/scheduler/`
layout — so it will not be picked up automatically.

## Why this endpoint could not apply it

- `github_repo_read` truncates at **32,768 chars**; the clean payload is 129,467 B. The full
  content cannot be materialised, so a faithful `github_file_write` is impossible.
- A **stub** carrying `VERSION = "1.14.1-gtd-guard"` is *not* a safe shortcut: `redeploy()`
  compares `depV` (`1.14.1`, live) against `canV` (`1.14.1-gtd-guard`) and, on mismatch,
  **uploads** the canonical body. A stub would be deployed and would replace the live worker.
- No R2 write/delete tool, no binding to `qnfo-canonical`, and no POST capability to call
  `POST /scan-heal` to verify a fix immediately.
- Workaround considered and rejected: writing a `404:`-prefixed sentinel into
  `deployed-current.worker.js` would make the resolver skip candidate #1 (the code tests
  `c.slice(0,4) !== "404:"`). It works, but it plants deliberately-invalid content at a path
  named `deployed-current.worker.js` and is unverifiable until the next hourly scan.

## Blast radius

Checked the other canonical-ahead mirrors named by the 07:05Z drift scan. **All clean:**

- `qnfo-archive/deployed-current.worker.js` — clean
- `qnfo-ddocs-indexer/…` — clean
- `qnfo-email/…` — clean
- `qnfo-lifecycle/…` — clean
- `qnfo-paper-indexer/…` — clean
- `qnfo-qwav/…` — clean
- `qnfo-social/…` — clean
- `qnfo-fleet-advisor/…` — clean

So the MIME corruption is **isolated to qnfo-cloud-ops**. `qnfo-agent-orchestrator` has no
`deployed-current.worker.js` at all (path not found) yet the drift scan reports it
canonical-ahead at `v1.0.0` — separate gap.

## Not the same bug: personal-companion

`personal-companion` also fails 20/24, but differently and with a **clean** artifact
(62,666 B, sha `c06edffb…`, `var VERSION = "1.0.0"`):

```
HTTP 400 code 10021
Workflow GenerationFlow must be exported or a script_name must be specified
```

A binding/export mismatch: the upload declares a Workflow binding the script never exports.
Separately, the transition is `v1.1.0 → 1.0.0` — a **downgrade**, so the "canonical" target
is older than what is live. Fixing the export alone would roll the worker backwards.

## Impact

The live qnfo-cloud-ops is up and its crons fire, so this is **not an outage** — it is a
same-semver patch (`1.14.1 → 1.14.1-gtd-guard`) that never lands, plus 25 wasted hourly
retries and permanent drift noise. Urgency: low-to-moderate, not critical.

## Related, same session

- `research-scan` (daily 08:00) last ran **2026-09-10T08:00:45Z** — 3 runs missed (~71 h).
- `radar` (venue, daily ~07:28) last ran **2026-09-10T07:28:35Z** (~72 h).
  Both stopped on the morning of 09-10, matching the fleet-wide `fabric-20260910` versions.
- The 09-13 `job-silence` alerts for `gmail-triage` (0.2 h) and `briefing` (0.7 h) are
  **false positives** — both had run within the hour. `outreach` (70.2 h) is ambiguous:
  its `/health` reports `activation_at: 2026-09-15`.
