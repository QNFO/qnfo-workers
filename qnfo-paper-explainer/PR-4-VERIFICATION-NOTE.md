# PR #4 — verification note and correction

Added 2026-09-13 by qnfo-ops, after the PR body was written.

## Correction to the PR description

The PR body claims:

> Patched `fetchArxiv` and the injected helper block both parse as valid JS.

**That claim is retracted. It is not established.** The check was attempted with
`new Function(...)` inside the qnfo-ops `run_code` sandbox, which failed with:

```
Code generation from strings disallowed for this context
```

So `new Function()` is unavailable in that isolated compute context. **No parse
verification of the patched source was performed by any tool in this session.** The
syntax of the patched `fetchArxiv` and of the injected helper block is asserted by
inspection only, not by execution.

Anyone merging this should treat syntax validation as OUTSTANDING and run, in the repo
where node is available:

```
node --check qnfo-paper-explainer/worker.js
node qnfo-paper-explainer/apply-retry-backoff.mjs --check
```

before `--apply`.

## What WAS verified (tool returns)

| claim | method | result |
|---|---|---|
| `ARXIV_OLD` anchor is character-exact vs the source returned by `github_repo_read` | run_code string equality | **true** (anchor length 364) |
| `function extractText(ai) {` anchor is present | full source read | present |
| `isTransient("paper-explain error: arxiv 429")` | run_code | **true** (want true) |
| `isTransient("3040: Capacity temporarily exceeded, please try again.")` | run_code | **true** (want true) |
| `isTransient("Cannot read properties of undefined (reading 'title')")` | run_code | **false** (want false) |

The `isTransient` behaviour is the load-bearing part of FIX 2: it must classify both real
production errors as retryable and must NOT classify a genuine TypeError as retryable.
All three cases behave correctly.

## Residual risk

1. **Syntax unverified** (above).
2. `FIX 2` rewrites `env.AI.run(` → `aiRun(env, ` textually. This assumes every call site
   passes the model as the first argument. The patcher asserts the call-site count is
   1..8 and fails closed otherwise, but it does **not** verify the argument order. If any
   call site uses a different shape, the patcher will silently produce a wrong call.
   **Recommend reading each rewritten call site before `--apply`.**
3. `RETRY_MAX = 4` with an 800 ms base is 0.8 + 1.6 + 3.2 = **5.6 s** of added latency on
   a fully-failing run. This worker runs once daily with a `DAILY_CAP` of 1, so the budget
   is not a concern here — but the helper is generic and would be expensive on a
   high-frequency worker.
4. The arXiv 429 is a **shared-egress** symptom. Retry reduces the failure rate but does
   not remove the contention between `radar-hub`, `qnfo-research-exec` and this worker.
   The durable fix is a single shared arXiv fetch with a cache, not per-worker retries.
