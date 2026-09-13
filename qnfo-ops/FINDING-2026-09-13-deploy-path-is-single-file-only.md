# FINDING — the fleet deploy path is single-file-only, so no multi-module worker can ever be healed

Date: 2026-09-13T14:4xZ · Author: qnfo-ops / ops-exec
Method: repo tree + version banners via `github_repo_read`; failure rows via `fleet_deploys`;
issue text via `agent_issues` #694.

## 1. Root cause of issue #694

`fleet_deploys` id 76 (`14:04:01`) records:

```
worker=qnfo-observability  from_sha=1.1.3  to_sha=1.1.4  ok=0
HTTP 400 {"errors":[{"code":10021,"message":"Uncaught Error: No such module \"fleet.js\".\n
  imported from \"worker.js\"\n"}]}
```

The repo tree for `qnfo-observability` is:

```
qnfo-observability/
  worker.js     <- 37,386 B, banner "qnfo-observability v1.1.6"
  fleet.js      <- a SIBLING MODULE
  wrangler.toml
  README.md
  scripts/
```

`worker.js` imports `./fleet.js`. The canonical deploy path uploads **one file**
(`qnfo-canonical/<worker>.js`, or the GitHub mirror of it) and does not carry a module graph.
The upload therefore arrives at the Cloudflare API with a dangling import and is rejected with
**error 10021**. The worker keeps serving its previous version — which is why this fails hourly
and never changes anything.

## 2. The generalization — this is a class, not an incident

**Any worker whose `worker.js` imports a local sibling module is permanently unhealable by the
fleet deploy loop.** No amount of canonical syncing, version bumping, or drift correction fixes it,
because the defect is in the *transport*, not the bundle. That predicts a testable split:

- workers whose canonical uploads succeed (`qnfo-backlog-exec` 1.2.6→1.2.7→1.2.8, `qnfo-social`
  0.5.2→0.5.3, `ai-health-prober` 2.3.1→2.3.3) are **single-file**;
- workers that fail forever with `No such module` (#694) or `SyntaxError` (#691) are **not
  single-file**, or not valid JS.

This also gives #691 (`r2:qnfo-canonical/qnfo-cloud-ops.js is invalid JS at worker.js:1:2`, 25
consecutive failures) a sharper reading: `worker.js:1:2` is the position of a **banner/comment or
a stray token**, consistent with a bundle that was concatenated or truncated rather than parsed —
i.e. the same transport-layer damage, a different symptom.

## 3. Why this does not affect the v1.3.0 reaper deploy

`qnfo-backlog-exec/worker.js` is **single-file**: it declares `const VERSION`, has no local
imports, and ends in a single `export default`. That is a precondition for the deploy loop to be
able to carry it — and it is a second, independent reason (beyond census membership, version
parity, and the 32,768-char cap) that it was the right host for the D17/D19 reaper.

## 4. Fixability from this endpoint — #694 is blocked

| requirement | status |
|---|---|
| read `qnfo-observability/worker.js` to patch it | **blocked** — 37,386 B vs the 32,768-char read cap, no offset param |
| bundle `fleet.js` into `worker.js` (the actual fix) | **blocked** — needs a build step; `github_file_write` needs the full post-bundle body, which exceeds what can be read |
| fix the transport to upload a module graph | **blocked** — lives in `qnfo-fleet-control` (75,875 B, past the cap) |
| write the canonical directly | **blocked** — `r2:qnfo-canonical/*` is not a bound bucket |

So #694 is **confirmed and root-caused, not fixable here**. The correct fix is one of: (a) inline
`fleet.js` into `worker.js` at build time and commit the single-file bundle, or (b) teach the
deploy path to upload multi-module graphs. Both need a session with `wrangler`/a build step.

## 5. Limits

- I read only the first 700 chars of `qnfo-observability/worker.js` (banner + header comment) —
  enough to establish the version and the module layout, **not** enough to confirm the exact
  `import` statements. The `./fleet.js` dependency is inferred from the API's own error text plus
  the sibling file's presence, which is strong but is still inference from a second-hand field.
- The single-file-vs-multi-module split in §2 is a **prediction from two data points per class**,
  not a census. I did not test the module layout of every worker that deploys successfully.
- Error 10021 is generic; `No such module` is one of several causes it can carry. I am not claiming
  every 10021 row is a module-graph failure — only that #694 and #691 are consistent with one.
- `fleet_deploys` has 76 rows and I read the newest 12 in detail; the 51-retry figure in #692 is
  the issue's number, not one I recomputed this session.
