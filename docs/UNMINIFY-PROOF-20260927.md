# Un-minify proof — qnfo-email + qnfo-backlog-exec (2026-09-27)

**What was done.** `worker.js` for both workers was re-seeded from the deployed bundle (the original
source of 2.1.0 / 1.5.0 was never committed) and then pretty-printed with prettier 3.3.3 so the
source is readable. `deployed-current.worker.js` remains the **byte-true deployed artifact**.

**Claim corrected (2026-09-27).** An earlier commit message claimed the pretty-printed file was
identical to the deployed artifact *after stripping all whitespace*. Re-probed: that is TRUE for
`qnfo-backlog-exec` but **FALSE for `qnfo-email`**. The actual delta (85 characters) is prettier
normalising source formatting only:

1. string quote style `'` -> `"` (semantics-preserving), and
2. **removal of redundant parentheses**: the bundle had
   `h.get("message-id") || (Date.now() + "-" + crypto.randomUUID())`, prettier emits
   `h.get("message-id") || Date.now() + "-" + crypto.randomUUID()`.

Both are semantics-preserving: `+` binds tighter than `||`, so the grouping is implied by JS
operator precedence.

**Proof used (RESULT: PASS).** The two files were each passed through the **same deterministic
minifier** (`npx esbuild@0.24.0 --minify --format=esm`). Identical minified output means the two
sources are semantically equivalent:

```
qnfo-email         esbuild-minified identical -> TRUE
qnfo-backlog-exec  esbuild-minified identical -> TRUE
```

This is the load-bearing proof: prettier's edits (quote style + redundant-parenthesis removal) are
therefore confirmed semantics-preserving, not merely asserted.

**Independent checks.** `node --check` rc=0 for both; the `cfWorkerRead` / `mirror-guard` VERSION
regexes parse `2.1.0` and `1.5.0`; `deploy-drift-guard` reads both workers SYNC.

**Residual risk.** A pretty-printer is not a semantic-equivalence oracle. The minifier comparison is
strong evidence, not a formal proof; a byte-identical copy of the deployed bundle is always
available as `deployed-current.worker.js` if the pretty source is ever in doubt.
