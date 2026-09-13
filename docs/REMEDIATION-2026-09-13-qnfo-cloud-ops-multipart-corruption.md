# REMEDIATION — qnfo-cloud-ops deploy loop: canonical artifact is a raw MIME body

Filed 2026-09-13T07:25Z by qnfo-ops (audit endpoint). **Revised 07:40Z and 07:50Z.**
Revision 1 retracted an "requires an R2 write" claim (wrong — GitHub is upstream).
Revision 2 adds ledger evidence that rules out one of the two candidate fixes.
Status: **diagnosed, fix identified, not applied from this endpoint (payload size).**

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

## Where the deployer reads from

From `qnfo-fleet-deploy/worker.js` (`canonical()`, v0.4.11), verbatim order:

1. `r2Read()` → `env.CANONICAL.get("<worker>.js")`, returned **only if fresh** —
   `customMetadata.ts` younger than `FRESH_MS = 1800000` (30 min).
2. Otherwise fetch **GitHub raw** (`GH = "https://raw.githubusercontent.com/QNFO/"`), first
   candidate that returns 200 and does not start with `404:` wins:
   ```
   qnfo-workers/main/<name>/deployed-current.worker.js   <-- the corrupted file, candidate #1
   qnfo-ops/main/cloud/<name>/deployed-current.worker.js <-- 404 (repo uses cloud/scheduler/)
   qnfo-workers/main/<name>/worker.js                    <-- clean SOURCE, candidate #3
   qnfo-ops/main/cloud/<name>/worker.js
   ```
   (`main` here is the **branch**, not a directory.)
3. On success it **writes the fetched GitHub content back into R2** with a fresh timestamp:
   `await env.CANONICAL.put(worker + ".js", c, { customMetadata: { ts: Date.now() } })`.
4. Falls back to the stale R2 object only if every GitHub candidate fails.

**Consequences:**

- **GitHub is upstream; R2 is a 30-minute cache.** The `source_path: r2:qnfo-canonical/...`
  in the audit row is where the payload was *cached*, not where it is authored.
- The corrupted `deployed-current.worker.js` is candidate **#1** and short-circuits the clean
  `worker.js` at candidate **#3** — the good file is present but unreachable.
- Fixing the GitHub file **does** fix the loop: the next scan past R2 staleness re-fetches
  from GitHub, overwrites the R2 object, and deploys clean.

`fleet_deploy_state` (verified): `enabled = 1`, `auto_heal = 1` (both 2026-09-08 16:25:49).
The hourly scan **does** auto-deploy; no manual `POST /redeploy` is needed.

## Which candidate paths have actually ever worked (ledger evidence)

Grouping all 67 rows of `fleet_deploys` by `source_path` — 15 distinct values:

| source_path | attempts | ok |
|---|---|---|
| `r2:qnfo-canonical/qnfo-cloud-ops.js` | 25 | **0** |
| `r2:qnfo-canonical/personal-companion.js` | 24 | 4 |
| `qnfo-workers/main/qnfo-chat-canary/deployed-current.worker.js` | 2 | **2** |
| `qnfo-workers/main/qnfo-fleet-advisor/deployed-current.worker.js` | 1 | **1** |
| `r2:qnfo-canonical/qnfo-fleet-advisor.js` | 2 | 0 |
| (10 further single-attempt R2 paths) | 1 each | 1 each |

Two conclusions:

1. **The GitHub branch works.** Deploys sourced from
   `qnfo-workers/main/<name>/deployed-current.worker.js` have succeeded (chat-canary 2/2,
   fleet-advisor 1/1). So repairing the GitHub file is a proven-effective channel.
2. **No deploy has EVER succeeded from a `worker.js` candidate.** Every success resolved from
   either an R2 cache path or a `deployed-current.worker.js` path. The `worker.js` fallback is
   therefore **unproven** — see the fix options below.

## Fix — prefer option A

**Option A (recommended):** put valid JavaScript at
`qnfo-cloud-ops/deployed-current.worker.js` — the path that is known to deploy. Two possible
payloads, in order of preference:

1. Strip the MIME prefix from the existing bundle: delete everything up to and including the
   blank line after `Content-Disposition`, leaving the genuine payload starting
   `var __defProp = Object.defineProperty;`. This preserves the exact artifact class that
   deploys successfully everywhere else, and is a pure prefix removal.
2. Or copy `qnfo-cloud-ops/worker.js` (129,467 B, sha `ca488a2c…`,
   `VERSION = "1.14.1-gtd-guard"`) over it — same declared version as the bundle, single-file
   with only a `cloudflare:sockets` builtin import, so `isModule()` → multipart upload.

**Option B (NOT recommended — unproven):** delete `deployed-current.worker.js` so the resolver
falls through to `worker.js` (candidate #3). This relies on the `worker.js` fallback being
deployable, and the ledger shows it has never once produced a successful deploy. Prefer A.

Either way: do **not** re-run the upload that produced the wrapped file — that is what
re-corrupts the object. `QNFO/qnfo-ops/cloud/scheduler/worker.js` (112,705 B, sha `1851450d…`)
is a third clean copy at the same declared version, but the resolver's `qnfo-ops` candidates
are `qnfo-ops/main/cloud/<name>/…`, which do **not** match that repo's `cloud/scheduler/`
layout — it will not be picked up automatically.

## Why this endpoint could not apply it

- `github_repo_read` truncates at **32,768 chars**; both clean payloads exceed that
  (129,467 B and 112,705 B) and the corrupted bundle is 121,107 B. The full content cannot be
  materialised, so a faithful `github_file_write` is impossible.
- A **stub** carrying `VERSION = "1.14.1-gtd-guard"` is *not* a safe shortcut: `redeploy()`
  compares `depV` (`1.14.1`, live) against `canV` (`1.14.1-gtd-guard`) and, on mismatch,
  **uploads** the canonical body. A stub would be deployed over the live worker.
- No R2 write/delete tool, no binding to `qnfo-canonical`, and no POST capability to call
  `POST /scan-heal` to verify a fix immediately.
- **Workaround rejected on evidence:** writing a `404:`-prefixed sentinel into
  `deployed-current.worker.js` would make the resolver skip candidate #1 (the code tests
  `c.slice(0,4) !== "404:"`), but it then depends on the `worker.js` fallback — the one path
  with zero successful deploys on record. It would also plant deliberately-invalid content at
  a path named `deployed-current.worker.js`.

## Blast radius

All other canonical-ahead mirrors named by the 07:05Z drift scan are **clean**:
qnfo-archive, qnfo-ddocs-indexer, qnfo-email, qnfo-lifecycle, qnfo-paper-indexer, qnfo-qwav,
qnfo-social, qnfo-fleet-advisor. The MIME corruption is **isolated to qnfo-cloud-ops**.

`qnfo-agent-orchestrator` has no `deployed-current.worker.js` at all (path not found) yet the
drift scan reports it canonical-ahead at `v1.0.0` — separate gap.

## Not the same bug: personal-companion

`personal-companion` fails 20/24, but differently and with a **clean** artifact
(62,666 B, sha `c06edffb…`, `var VERSION = "1.0.0"`):

```
HTTP 400 code 10021
Workflow GenerationFlow must be exported or a script_name must be specified
```

A binding/export mismatch: the upload declares a Workflow binding the script never exports.
Note it also succeeded 4 times on 09-12 (`v1.1.0 → 1.0.0`), then began failing. Separately,
the transition is a **downgrade** — the "canonical" target is older than what is live. Fixing
the export alone would roll the worker backwards.

## Impact

The live qnfo-cloud-ops is up and its crons fire, so this is **not an outage** — it is a
same-semver patch (`1.14.1 → 1.14.1-gtd-guard`) that never lands, plus 25 wasted hourly
retries and permanent drift noise. `self_heal_actions` drift ledger: healed 9, failed 44,
deferred 179. Urgency: low-to-moderate.

## Related, same session

- `research-scan` (Mon–Fri 10:00 AMS) last ran **2026-09-10T08:00:45Z** (Thu); exactly **one**
  expected run missed (Fri 09-11). Sat/Sun are correctly idle.
- `radar` (Mon–Fri 09:30 AMS) last ran **2026-09-10T07:28:35Z** (Thu); **one** run missed.
- The `job-silence` checker uses a flat `>48h` threshold, so it will **false-positive on every
  weekday-only cron every weekend**. `gmail-triage` (0.2 h) and `briefing` (0.7 h) in the same
  06:23Z batch were outright false positives. `outreach` (70.2 h) is ambiguous: `/health`
  reports `activation_at: 2026-09-15`.
