---
status: in-progress
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

work-claim: acquired file:qnfo-ops/wrangler.toml (owner kimi-code-session-20261110)
work-claim: acquired file:qnfo-ops/worker.js (owner kimi-code-session-20261110)
work-claim: acquired file:qnfo-ai/wrangler.toml (owner kimi-code-session-20261110)
work-claim: acquired file:qnfo-ai/worker.js (owner kimi-code-session-20261110)
work-claim: acquired file:qnfo-infra/wrangler.toml (owner kimi-code-session-20261110)
work-claim: acquired file:qnfo-infra/worker.js (owner kimi-code-session-20261110)
work-claim: acquired file:docs/handoff/issue-8024.md (owner kimi-code-session-20261110)
