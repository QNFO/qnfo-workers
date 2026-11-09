# Handoff: R2 document sweep, fleet audit and weekly dispatch (DOC-IS-CODE-1, SELF-AUDIT-1)
status: in-progress (PR #8763 merged and live 2026-11-09; this follow-up batches inserts, runs the sweep daily, reads owner_docs and audits several repos)

State (this PR):
- qnfo-ops/worker.js `sweepWorkflowDispatch` (cron): dispatches r2-doc-audit.yml once per ISO week and fleet-audit.yml once per 6 hours, idempotent through cloud_ops_events.
- scripts/r2_fetch_texts.mjs + `--texts` in r2-doc-audit.yml: document text is read so rule ids count.
- scripts/r2_file_issues.mjs inserts out/roadmap.jsonl into roadmap_implementation (source `doc-orphan`, deduped by item).
- scripts/audit.py + fleet-audit.yml: AGENTS.md promised both and neither existed. Findings: claims naming missing scripts, loop issues without a closing probe, human PRs without Self-audit.
- Correction: the earlier handoff named an `owner_documents` table; it does not exist in the audit D1 (the real tables are `owner_docs` and `ddocs_index_state`).

Next (code-task lines):
- code-task: after merge, canonical-deploy qnfo-ops, then gh workflow run r2-doc-audit.yml and fleet-audit.yml once to prove the chain
- code-task: read owner_docs rows (schema in D1) as an extra text source for r2_doc_audit.mjs
- code-task: audit.py checks every repo in deploy-targets.txt, not only qnfo-workers
Verify: node scripts/r2_file_issues.test.mjs; python3 scripts/audit_test.py; after deploy, cloud_ops_events has kind sweep-dispatch rows with status dispatched.

Follow-up PR (2026-11-09): roadmap inserts are D1 batches of 50 (first live run took 10+ minutes one row at a time); qnfo-ops dispatches r2-doc-audit daily with max_issues 100 until deferred is 0; r2_fetch_texts also reads owner_docs (table exists, 0 rows today); audit.py checks loop and PR findings in AUDIT_REPOS (default 7 repos) and tags findings with the repo.
Still open: implementing or retiring each orphan document (issue 8838) is the code loop's work, one issue per document.
