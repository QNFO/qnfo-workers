# Branch triage — 2026-09-23 (BRANCH-SALVAGE-1 / BRANCH-TRIAGE-1)

Audit finding: 21 remote branches on `QNFO/qnfo-workers` were not merged into `main`
(plus 1 on `QNFO/qnfo-ops`). This record preserves the evidence and the recovery SHAs.

## Method (three independent tests, no branch deleted on a single signal)

1. **Patch equivalence** — `git cherry origin/main <branch>`. Every one of the 21 branches
   carried at least one non-upstream commit, so *none* was trivially "already merged".
2. **Artifact salvage** — for every changed file that is not a `worker.js` /
   `deployed-current.worker.js` / `wrangler.toml` bundle, test presence in `main`.
   **22 files existed only on these branches.** They were landed in `main` first
   (commit `72d51ae`, "salvage(artifacts)"), so that deleting a branch could not destroy
   them. Files already present in `main` were deliberately **not** overwritten — a stale
   branch copy must never clobber a newer main copy.
3. **Version supersession** — for every `worker.js` a branch modifies, compare the branch's
   `VERSION` against the worker's **live** `/health` version. A branch is delete-safe only
   if every worker it touches is live at an equal-or-newer version.

## Deleted (16) — superseded, content preserved

| branch | head SHA (recovery) |
|---|---|
| audit/2026-09-13-fleet-consolidation | b601f4baa31c6217326611497f1e3eab4e6e76b2 |
| chatbox/fix-ddocs-indexer-rolling-prefix | 2e60743a3007dcbe6bde5877c3dddf9fa57a4862 |
| chatbox/fix-paper-explainer-retry | f99a14ab643b6b5f6b8fd54be9f6bd1ccb0fd247 |
| chatbox/fleet-exec-cron-orphan-guard | f905d6faacbd54c5b8d1a4bd08493bf97cd91eb9 |
| chatbox/qnfo-ops-attach-empty-guard | 2d43c61059a6f7784236b96a1a0bb812aa21c621 |
| chatbox/version-compare-ci | c6b19144bbfaeae895b0be3c18e4723e539a06df |
| fix/agent-issues-dedupe-2026-09-13 | a64b9cb8552636313492ee4ce6c3be51f313a098 |
| fix/email-loop-guard-sendgates | cb06e88da75bb52f4f215ef6981af122ae58c676 |
| fix/ops-capability-advertising | 180eabcc08a89b8b2f1ce1007dd8e0b9d22173f7 |
| fix/qnfo-email-mime-parser-20260921 | d28e927ade8c2473e8cae9f7410a4dac16ab4205 |
| ops/ai-gateway-single-endpoint-2026-09-16 | 206c4ffb735554509cb6745e55b663e70f3b1027 |
| ops/aigw-unified-billing-2026-09-16 | fc46447984b7c7b4d33bc8cb223ff7e2a99e3cf1 |
| ops/email-command-gateway-v1.9.0 | 0d8924046c8f53860592f898fad50442035b4e3b |
| personal-companion-v1 | 50d3ee6f84b28fed9cb82e8fcb18524e11fd6c65 |
| reconcile-20260912 | 91be80ed82882b718b6835e6575948553a5f267a |
| reconcile/qnfo-ops-live-2.15.1 | 63cd5708591c44e924372ea1aca96b9b3afa7595 |

Recovery: `git push origin <sha>:refs/heads/<branch>` restores any row above.

## Held (5) — distinct blocker, not deleted

| branch | blocker |
|---|---|
| consolidation-2 | carries `radar-hub` **1.0.1**, which is what `service_registry` claims but live runs **1.0.0** — the change was never deployed. Blocked until radar-hub is reconciled. |
| fleet-selfheal-2026-09-12 | contains snapshots of retired workers (`ai-health-prober`, `qnfo-idea-triage`) with no live counterpart to compare against |
| model-purge-2026-09-11 | same retired-worker blocker |
| quniverse-refactor-20260912 | same retired-worker blocker |
| redeploy-binding-fix | retired-worker blocker + in-repo duplicate of the qnfo-gateway mirror |

Retired-worker branches are the only cases where "is this code already in production?"
cannot be answered by a live `/health` comparison. They are therefore escalated rather
than silently dropped.

## Falsifiers

- The version test is **not** byte parity: a branch could carry 1.0.1 whose *content* was
  later replaced by a differently-numbered build. It proves "production has moved past
  this branch", not "the branch had no value".
- `git cherry` and the artifact test both read git objects, not intent. A branch whose
  only value was a design decision recorded in a commit message (not a file) would pass
  all three tests and still lose that reasoning.
- Recovery depends on the SHAs above surviving GitHub's garbage collection (unreferenced
  objects are typically retained ~90 days). This file is the only index of them.
