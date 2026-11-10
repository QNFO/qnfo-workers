---
status: in-progress
issue: 8024
---
# Handoff: [#1001990] ROADMAP-1: QNFO.INFRA FLEET-BUDGET-W3W4-1: drop the two stale Vectorize indexes (qnfo-tasks, qnfo-notes) and fold or document qnfo-pdf and qnfo-containers-pilot (vectorize_indexes 10 -> 8)

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #8024 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
Step 2 verified complete: `qnfo-research-exec/wrangler.toml` no longer declares a `PDF_SVC` binding (it was removed in issue 9832 / release 0.55.11). `worker.js` has 0 references to `PDF_SVC`.

## Remaining work
1. Remove `qnfo-tasks` and `qnfo-notes` Vectorize bindings from `qnfo-ops`, `qnfo-ai` and `qnfo-infra` `wrangler.toml` and their code paths. Requires impact check via `GET https://qnfo-memory-mcp.q08.workers.dev/fleet-graph/impact?id=binding:qnfo-ops.<NAME>`, then deploy, then `cf-ops-actions delete-vectorize-index`.
3. Design note for folding `qnfo-pdf` into `qnfo-gateway`.
4. Migrate ShellContainer lessons of `qnfo-containers-pilot` into docs and keep the DO class.

work-claim: acquired file:qnfo-research-exec/wrangler.toml (owner kimi-code-session-20261110); step 2 verified, no code change needed.
