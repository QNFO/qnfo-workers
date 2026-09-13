# ADDENDUM to FINDING-2026-09-13-d1-guard-false-positive.md — the source check FAILED

Author: qnfo-ops, 2026-09-13. Read this with the finding. It does not retract the finding; it bounds it.

## 1. What I tried and what happened

I attempted to confirm the guard's mechanism **in source** rather than inferring it from behaviour, by
reading `qnfo-ops/worker.js` from `QNFO/qnfo-workers`.

Result: **the guard function is not in the readable window.**

| fact | value |
|---|---|
| `qnfo-ops/worker.js` size | **161,339 bytes** |
| `github_repo_read` ceiling | 32,768 chars, no offset/range support |
| fraction readable | ~20% (the head: version constants, the system prompt, the `OPS_TOOLS` schema array) |
| guard implementation | **not reached** |

So the characterisation in the finding — "a raw-text substring scan, not a parser" — remains
**behaviourally proven** (by the two probes, which are decisive: a mutation keyword inside a
single-quoted string literal was rejected) but is **NOT source-confirmed**. The probes prove *what* it
does; only the source would show *how*. Treat §6 of the finding as a specification to apply against the
deployed source, not as a diff against a file I have read.

## 2. A second, independent reason the patch cannot be written from here

The readable head of the repo copy declares:

```js
var VERSION = "2.14.0";
```

The live service registry (`service_discover`, updated 2026-09-13T06:30:40.116Z) reports
**`qnfo-ops` version `2.15.1`**.

**The repo source is one version behind production.** This is the same class of defect the
personal-companion audit recorded as RC-6 (`worker.js` sha `c06edffb`, `VERSION "1.0.0"`, while
production serves `v1.1.0`): the deployed source is not the repo source. It matters more here, because
the artifact I would be patching *is* the guard — a security control. Patching the 2.14.0 guard and
assuming it describes the 2.15.1 guard is precisely the error this thread has been correcting in other
artifacts.

Combined with §1, the honest statement is: **I cannot write a reliable patch for this guard from this
endpoint.** Two blockers, either one sufficient: the code is past the read ceiling, and the source I
can read is not the version that is running.

## 3. What would settle it (for whoever can read the file)

1. Locate the guard in the **deployed** 2.15.1 source: grep for the rejection string
   `mutation keywords are rejected` — that literal is quoted verbatim in the error the tool returns, so
   it will appear in the source next to the check.
2. Read the ~40 lines around it and confirm whether the scan runs on the raw statement or on a
   literal-stripped copy.
3. Diff the 2.14.0 and 2.15.1 copies of that function. If the guard was already changed between them,
   the probes in the finding may be describing a *previous* build — re-run both probes after any deploy.
4. Then apply §6 of the finding, with §7's regression tests as the acceptance criteria.

## 4. What the readable head did confirm

Not everything failed. Two checks passed in the window that was readable:

- **Canonical settings match the binding rule (rule 12).** `MODEL_CTX = 1048576`,
  `DEFAULT_MAX_OUT = 393216`, `MAX_TOOL_ITERS = 30`, and the `OPS-SYSTEM` prompt text carries the same
  figures. No drift visible in the readable portion.
- **The one-shot-completion enforcement is real and in source.** `BUDGET_EXHAUSTED_DIRECTIVE`,
  `FUTURE_WORK_RE` and `CONTINUE_DIRECTIVE` are all present as constants, with `MAX_TOOL_ITERS` raised
  from 8 to 30 and the comment explaining exactly why. The contract violation this session was opened
  with is enforced by code, not convention.

Neither of those touches the guard, so neither rescues §1.

## 5. Correction to my own reporting

In the session report I wrote that I would "confirm the guard's mechanism in source instead of
inferring it from behaviour". I did not. The read returned the head of a 161 KB file and the guard was
not in it. Reporting the intent as if it had been carried out would have been the same failure mode
this pass found in three staged artifacts — a claim whose supporting evidence was never fetched.
