# Finding — the deploy path is built on a source one version behind production

Date: 2026-09-13. Author: qnfo-ops. Measured live this session; nothing here is inferred.

## The measurement

| artifact | size | sha | declares |
|---|---|---|---|
| `personal-companion/worker.js` (repo) | 62,666 | `c06edffb22f3cefeed2d7568e1a7275f076320cc` | `var VERSION = "1.0.0";` |
| `personal-companion/deployed-current.worker.js` (repo) | **62,666** | **`c06edffb…` (identical)** | `var VERSION = "1.0.0";` |
| `https://reading.q08.org/health` (live) | — | — | **`"version": "v1.1.0"`** |

`deployed-current.worker.js` is **byte-identical** to `worker.js`. Its name asserts it is the deployed
source. It is not: production serves **v1.1.0**, and the repo holds **v1.0.0** twice. **The v1.1.0 source
exists nowhere in the repo.**

## Why this is the most serious defect in the handoff

`apply-remediation.mjs` reads `worker.js` — the **v1.0.0** copy — and produces a bundle stamped
**1.4.0**. Every anchor it patches was verified present in that v1.0.0 file (all four confirmed this
session: `var VERSION = "1.0.0";`, the `loadLife` events query, `function json(obj, status) {`, and the
P_STYLE epistemic-contract line).

So the patcher would run cleanly, report success, and produce a worker derived from a source **one
version behind what is running**. Deploying it would:

1. **silently discard every change v1.1.0 carries** — whatever it added, fixed, or changed is not in the
   repo, so it cannot be preserved by a patch applied to v1.0.0; and
2. **report success while doing it.** `--apply` prints `WROTE … (62666 -> N bytes)` and exits 0.

That is the same failure class as every other defect in this audit: an action that reports success while
destroying information. The failure is worse than a no-op, because the operator has no signal.

## Two further gaps in the same path

- **The bundle is dead code without a wiring step.** `apply-remediation.mjs` explicitly does *not* insert
  the `runGate()` call at the insert site — that site is past the 32,768-byte read ceiling, so its exact
  text is unverified. After `--apply`, the five gate modules are inlined and **never called**. A deploy
  of the bundle alone changes **no gating behaviour**.
- **`/health.writer` names a model that does not exist in the code.** Live `/health` reports
  `"writer": "deepseek-chat"`, while `worker.js`'s `MODELS` list is
  `kimi-k2.6 / gpt-oss-120b / glm-5.3`. `deepseek-chat` appears in neither the repo source nor the run
  log. The health endpoint is reporting a stale or hardcoded value, so it is not evidence of what is
  actually generating pieces.

## What must happen before any deploy

1. **Obtain the v1.1.0 source** (Cloudflare dashboard, `wrangler deployments`, or a version-history
   export) and commit it to the repo. Without it, no patch to `worker.js` can be trusted.
2. **Diff v1.0.0 against v1.1.0**, then re-apply the four patches to the **v1.1.0** base rather than the
   v1.0.0 one.
3. **Wire `runGate()` at the insert site** and add the gate filter to `/`, `/p/<slug>`, `/api/pieces`
   and `feed.xml` — all four sites are past the read ceiling and currently unverified.
4. **Delete or rename `deployed-current.worker.js`.** A file whose name asserts deploy provenance and
   whose contents contradict it is worse than no file.
5. Fix `/health.writer`.

Until (1) and (3) are done, the honest statement is: **the gate cannot be deployed, and the text
correction in `sql/QRI-2-body-corrections-2026-09-13.sql` is the only change available today that alters
what a reader actually sees.**
