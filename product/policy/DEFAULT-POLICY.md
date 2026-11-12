# Ultrastable default policy (ULTRASTABLE-POLICY-1)

The rules the core enforces in code. Each rule line ends with `enforced-by:` and the repository paths that enforce it;
scripts/product-boundary.test.mjs fails when a path is missing. An installation overlays its own directives on top.

- P1 Work claims: one writer per file or issue at a time, decided by the claim ledger. enforced-by: qnfo-deploy-guard/worker.js, migrations/2026-10-02-work-claims.sql
- P2 Canonical deploy: a change reaches production only by merge to main through the deploy workflow. enforced-by: .github/workflows/canonical-deploy.yml, qnfo-ops/worker.js
- P3 Probes and revert: a deploy declares what must still work, and a probe that passed before and fails after reverts it. enforced-by: scripts/deploy_probes.py, scripts/canary_revert.py
- P4 Second reader: a risky diff is read by two model families before it merges. enforced-by: scripts/review_gate.py, .github/workflows/pr-lane.yml
- P5 No silent drop: every issue open, status change and delete is written to an append-only lifecycle ledger. enforced-by: migrations/2026-10-08-14-accounting.sql
- P6 Scored predictions: a decision states its predicted outcome, and the outcome is compared with it. enforced-by: migrations/2026-10-12-22-calibration-scorer.sql
- P7 Closed loops: nothing waits on a person except an irreversible, identity-bound step, which carries its default. enforced-by: scripts/closed_loop_guard.py, scripts/self_closed_lint.py
- P8 Evidence to close: an issue closes only with a passing probe, never by assertion. enforced-by: scripts/remediation_consumer.py, migrations/2026-10-02-work-claims.sql
- P9 Migrations are versioned and reversible: a schema change names its rollback and runs through CI. enforced-by: scripts/apply_migrations.py, .github/workflows/apply-migrations.yml
- P10 Boundary: every live worker is classified core, app or personal, and the personal plane never ships. enforced-by: scripts/product_boundary.mjs, product/boundary.json
