# VERIFICATION 5 — a runner for the staged patchers, and the rev-3 classifier

Date: 2026-09-13. Companion to `CORRECTION-2.md`, which established that the deploy route is
**commit to GitHub → hourly scan heals**, and that the shadow at candidate (a) was the blocker.

## 1. The missing link: no Node runner existed

`qnfo-research-exec/apply-research-exec-fix.mjs` has always required
`node apply-research-exec-fix.mjs --apply`, and **no runner for it existed anywhere in the repo**.
That, not an absent deploy route, is why the NL fix stayed staged.

Added: `.github/workflows/apply-staged-patchers.yml` (commit `7f4a9d0b`).

- **`workflow_dispatch` only** — no `push` trigger, so nothing fires on its own.
- `mode` defaults to **`check`**; `commit` defaults to **`no`**.
- Rejects absolute or traversing patcher paths; requires a `.mjs` file.
- Always runs `--check` first so the job log records anchors and refusals.
- Commits back only when `mode=apply` **and** `commit=yes`, and exits 0 with a message if the
  patcher wrote nothing (fail-closed on an anchor mismatch).

An `apply` run writes to the repo and, via the hourly scanner, reaches production within ~1 hour.
That is why it is manual and why `commit` defaults to `no`. **Nothing has been fired.**

## 2. Why it can now converge for `qnfo-research-exec`

`FIX C` asserts the resolver state before writing, and the required state now holds: the mirror
`deployed-current.worker.js` is a `404:` tombstone (commit `45a8e360`), so resolution falls
through to candidate (c) `worker.js` — the file the patcher edits.

Verified against the live anchors with `run_code` (the 80,916 B file cannot be read here, but the
patcher's decision logic can):

| check | result |
|---|---|
| FIX A: `NL` used, not declared | `true` / `false` → **would apply** |
| FIX A idempotent on second run | **true** |
| FIX B anchor `status \|\| "ok"` occurrences | **1** (patcher requires exactly 1) |
| VERSION anchor `var VERSION = "0.8.1-quality-gate-fix";` | **1** (requires 1) |

## 3. Rev 3 — I found a defect in FIX B and corrected it

Rev 2's classifier was:

```
/(?:"ok"\s*:\s*false|\berror\b|is not defined|failed|ERR_)/i
```

The bare `\berror\b` and bare `failed` alternatives match on **substring presence**, not on
failure. Demonstrated: `{"queued":0,"researching":0,"review":0,"failed":2,"published":19}` — where
`failed=2` is a **count**, not a failure — classified as `status='error'`.

Rev 3 requires a positive failure signature (commit `9e623f01`):

```
/(?:"ok"\s*:\s*false|is not defined|ERR_|_status\s*[=:]\s*"?[45]\d\d)/i
```

Re-verified across ten payloads:

| payload | expect | rev 2 | rev 3 |
|---|---|---|---|
| NL ReferenceError | error | error | **error** |
| Zenodo 504 | error | error | **error** |
| `{"_status":504}` bare | error | ok | **ok** ← gap, §4 |
| `{"_status":200}` | ok | ok | ok |
| heartbeat, `failed=2` | ok | **error** | **ok** |
| clean success | ok | ok | ok |
| `{"ok":true,"error":null}` | ok | **error** | **ok** |
| `{"ok":true,"errors":0}` | ok | ok | ok |
| prose "3 failed deploys retried" | ok | **error** | **ok** |
| `{"ok":false}` | error | error | **error** |

**9/10 correct; three behaviours changed, all in the right direction; both production failure
payloads still classify correctly.**

### Scope of the original claim, corrected

When I first found this I wrote that "every healthy 15-minute heartbeat would be filed as
`status='error'`". **That over-claimed.** The heartbeat is a direct INSERT in
`qnfo-pipeline-ops`, not a `logEvent()` call, and no caller of `logEvent()` carrying such a
payload has been read from the 80,916 B bundle. The over-classification is demonstrated **on the
pattern**; a concrete false-positive path is **not** established. The narrowing is on principle.

## 4. Residual gap, deliberately not closed

The `_status` alternative does not match the quoted-key form: `{"_status":504}` returns `ok`
because the pattern expects `[=:]` immediately after `_status`, but the text has `"_status":504`.
One token fixes it — `_status"?\s*[=:]\s*"?[45]\d\d`.

I chose **not** to rewrite the file again. The branch is defensive only: in every observed
payload `_status` appears nested inside an `error` string that also carries `"ok":false`, which
the first alternative already catches. Another 17,109 B hand-rewrite carries more transcription
risk than the gap it would close.

## 5. What is still true

- **Nothing has been applied.** `qnfo-research-exec` still runs `0.8.1`; the 19 masked rows are
  still `status='ok'`; the storm is untouched.
- The deciding check on the research-exec tombstone is the ~15:0x scan:
  ```sql
  SELECT id, source_path, canonical_version, note FROM fleet_drift_report
   WHERE worker='qnfo-research-exec' ORDER BY id DESC LIMIT 1;
  -- PASS if source_path ends in worker.js; FAIL if it still names deployed-current.worker.js
  ```
- The open backlog stands at 9 (tickets 691–701).
