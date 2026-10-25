-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-agent-context-loader-import-drift'; DELETE FROM failure_modes WHERE fm_key = 'agent-context-loader-import-drift'; DELETE FROM capability_ledger WHERE capability = 'qnfo-ops-context-loader-regression-coverage'
-- spof-review: adds a read-only code-read contract; the existing full-suite CI gate independently exercises the fixture and worker loader.
--
-- AGENT-CONTEXT-FIXTURE-1 (2026-10-25, pillar autonomy): qnfo-ops tracing added a
-- cloudflare:workers export to the worker, but the context-compaction test's data-URL
-- loader and source anchor still described the old import and call site. The suite
-- then failed on main with ERR_UNSUPPORTED_ESM_URL_SCHEME instead of exercising the job.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('agent-context-loader-import-drift',
  'the qnfo-ops context-compaction fixture is pinned to an old worker import or call site and cannot load a new Cloudflare runtime export',
  'context-compact.test.mjs replaced only the pre-tracing cloudflare:workers import and asserted the pre-agent chat call; it did not stub tracing.enterSpan, and CRLF source text could also invalidate its exact source anchors',
  'AGENT-CONTEXT-FIXTURE-1: normalize source newlines, keep the import anchor and data-URL stub aligned with Cloudflare runtime exports, assert the current agent chat call, and exercise tracing.enterSpan in the worker-load-gate regression',
  'fm-agent-context-loader-import-drift: the context fixture contains the tracing import stub, while its tests and the full deploy-gate verify the actual source loader',
  'fm-agent-context-loader-import-drift', '2026-10-25', NULL,
  'qnfo-ops/worker.js adds or changes a cloudflare:workers export used by the context-compaction fixture without updating that fixture''s source loader',
  'context-compact.test.mjs reports stale source assertions and ERR_UNSUPPORTED_ESM_URL_SCHEME for cloudflare:workers on the full suite',
  'the qnfo-ops full-suite gate stays red and later main changes cannot pass until the fixture is synchronized');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to) VALUES
 ('fm-agent-context-loader-import-drift', NULL,
  '{"paths":["qnfo-ops/context-compact.test.mjs"],"contains":"var tracing = { enterSpan"}',
  'code-read', 3, 1, 'active', 'AGENT-CONTEXT-FIXTURE-1', 'failure-mode detector', 'qnfo-fleet-control');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
SELECT 'qnfo-ops-context-loader-regression-coverage',
  'AGENT-CONTEXT-FIXTURE-1; PR #4095 (merge 6b8320f7)',
  'Node test runner; a local tracing.enterSpan stub; no live credentials or network',
  '97/97 context-compaction assertions, 22/22 worker-load-gate assertions, 1/1 qnfo-ops load check; deploy-gate run 40205756979 passed',
  datetime('now'), datetime('now'),
  'qnfo-ops/context-compact.test.mjs, scripts/worker-load-gate.test.mjs, PR #4095'
WHERE NOT EXISTS (SELECT 1 FROM capability_ledger WHERE capability = 'qnfo-ops-context-loader-regression-coverage');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested, outcome_matched)
SELECT 'session_rwnq8-agent-tracing-cli',
  'the main-gate failure came from stale source-loader assumptions, not a qnfo-ops runtime regression; a code-read contract on the tracing stub will detect its removal',
  'AGENT-CONTEXT-FIXTURE-1: record the stale-import root cause and monitor the context fixture with a code-read detector',
  'PR #4095 full deploy-gate run 40205756979 passed on head 736a5d58; the merged fixture contains the exact tracing stub and passed 97/97 assertions',
  'the fixture repair passed its full deploy-gate and the registry now has an active code-read detector',
  'one qnfo-ops test fixture and one hourly read-only code probe; no runtime behavior or credentials changed',
  'Rollback removes the failure-mode and detector rows; the decision log remains append-only',
  'the fleet can detect regression of the qnfo-ops tracing import stub before the context loader returns to an unsupported cloudflare: URL',
  'the code-read detector observes the tracing stub in the merged context fixture',
  'none',
  'qnfo-ops/context-compact.test.mjs, scripts/worker-load-gate.test.mjs, full deploy-gate run 40205756979',
  1
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action = 'AGENT-CONTEXT-FIXTURE-1: record the stale-import root cause and monitor the context fixture with a code-read detector');
