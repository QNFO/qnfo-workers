---
status: merged-step-1-2
issue: 8024
---
# Handoff: [#1001990] ROADMAP-1: QNFO.INFRA FLEET-BUDGET-W3W4-1: drop the two stale Vectorize indexes (qnfo-tasks, qnfo-notes) and fold or document qnfo-pdf and qnfo-containers-pilot (vectorize_indexes 10 -> 8)

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #8024 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
- Step 1 **implemented**: `qnfo-tasks` and `qnfo-notes` Vectorize bindings and code paths removed from `qnfo-ops`, `qnfo-ai` and `qnfo-infra` (`wrangler.toml` + `worker.js` + `deployed-current.worker.js` mirrors). `qnfo-archive` is RETIRED (2026-10-06) and absent from the live workers list, so its stale source references were left untouched.
- Step 2 verified complete: `qnfo-research-exec/wrangler.toml` no longer declares a `PDF_SVC` binding (removed earlier in issue 9832 / release 0.55.11). `worker.js` has 0 references to `PDF_SVC`.

## Verification
- `python3 scripts/pre_push_check.py qnfo-ops` → ok
- `python3 scripts/pre_push_check.py qnfo-ai` → ok
- `python3 scripts/pre_push_check.py qnfo-infra` → ok
- (Windows note: `patch-budget.test.mjs` requires `core.autocrlf=false` to pass locally; with that set the full qnfo-ops suite is green.)

## Remaining work
3. Design note for folding `qnfo-pdf` into `qnfo-gateway`.
4. Migrate ShellContainer lessons of `qnfo-containers-pilot` into docs and keep the DO class.
5. Post-merge canonical deploy, then `cf-ops-actions delete-vectorize-index` for `qnfo-tasks` and `qnfo-notes` (live index deletion is out of scope for this editing session per `AGENTS.md`).

## Merge evidence
- PR [#10553](https://github.com/QNFO/qnfo-workers/pull/10553) merged to `main` at `2026-11-10T15:46:44Z` (squash commit `bb3d54b9`).
- CI run [42847675641](https://github.com/QNFO/qnfo-workers/actions/runs/42847675641) green: `versions` and `scans` passed.
- VERSION bumps: `qnfo-ai 5.50.18 -> 5.50.19`, `qnfo-infra 1.17.7 -> 1.17.8`, `qnfo-ops 2.71.1 -> 2.71.2`.
- Work claims released on merge.

work-claim: released file:qnfo-ops/wrangler.toml (PR #10553 merged)
work-claim: released file:qnfo-ops/worker.js (PR #10553 merged)
work-claim: released file:qnfo-ai/wrangler.toml (PR #10553 merged)
work-claim: released file:qnfo-ai/worker.js (PR #10553 merged)
work-claim: released file:qnfo-infra/wrangler.toml (PR #10553 merged)
work-claim: released file:qnfo-infra/worker.js (PR #10553 merged)
work-claim: released file:docs/handoff/issue-8024.md (PR #10553 merged)
