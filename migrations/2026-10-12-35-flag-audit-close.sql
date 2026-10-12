-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261012_ops_config_zenodo_enabled
-- Rollback: INSERT OR REPLACE INTO ops_config (key, value) SELECT key, value FROM bak_20261012_ops_config_zenodo_enabled; DELETE FROM pipeline_flags WHERE key = 'errata_publish_enabled'; UPDATE control_registry SET disposition_state = 'planned' WHERE control IN ('errata-publish-enabled', 'control-plane-deny'); UPDATE remediation_contracts SET verify_transport = 'runner-https', verify_probe = '{"url": "https://errata-hub.q08.workers.dev/health", "status": 200, "absent": "pipeline_flags.errata_publish_enabled"}' WHERE class = 'issue-2308'
-- FLAG-AUDIT-CLOSE-1 (2026-10-12, agent_issues 2308 FLAG-AUDIT-1 and 2176 CONTROL-PLANE-FUNCTIONAL-CANARY-1; pillars autonomy, research).
-- The 2026-10-11 flag audit left three stoppers. Their state today:
--   1. pipeline_flags.errata_publish_enabled (absent = off) forces the errata publish member dry. control_registry disposition
--      "replace" since 2026-10-08, alternate "in-house errata publication" (#2135, closed). The external deposit the gate guarded is
--      gone (NOZ-DOI-1: the publish member re-renders the paper in-house and writes no DOI), so the gate guards nothing external; the
--      in-house safeguards stay in code (low-risk corrections only, the stale-version check, the AI-disclosure line, the 48 h
--      verifyPublished re-check, mail only to the owner as a receipt). errata_actions holds 1 verified and 1 wontfix row, so turning
--      the flag on publishes nothing today and lets the next drafted low-risk correction reach papers.qnfo.org. RULE-8-RETIRED-1:
--      a gate changes by a recorded migration with its rollback line; this is it.
--   2. ops_config.perf_loop_enabled: already 1 (PERF-PIN-1 live, #2177 closed 2026-10-12 13:14Z); nothing to do.
--   3. ops_config.zenodo_enabled = 0: no worker reads it (grep over */worker.js on 2026-10-12: zero readers); a dead record, removed
--      with its backup table.
-- CONTROL-PLANE-FUNCTIONAL-CANARY-1: canonical-deploy's canary runs a functional request for qnfo-ai and qnfo-gateway (7 ok
-- canary-functional rows by 2026-10-12 14:06Z), and qnfo-fleet-control 0.20.0 / qnfo-code-orchestrator 0.13.0 (this PR) take
-- those two off the code loop's deny list (CM_LOOP_CANARIED / PLAN_LOOP_CANARIED); the registry row moves to applied.
-- Probe of 2308: errata-hub is FOLDED into qnfo-research-exec, so its old runner-https probe read HTTP 404 for good; it becomes a
-- d1-query over the three flags above.
CREATE TABLE IF NOT EXISTS bak_20261012_ops_config_zenodo_enabled AS SELECT key, value FROM ops_config WHERE key = 'zenodo_enabled';
DELETE FROM ops_config WHERE key = 'zenodo_enabled';
INSERT INTO pipeline_flags (key, value, updated_at) VALUES ('errata_publish_enabled', '1', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at;
UPDATE control_registry SET disposition_state = 'applied', alternate_tested_at = '2026-10-12', reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  evidence = evidence || ' | applied 2026-10-12 (FLAG-AUDIT-CLOSE-1, #2308): the external deposit is gone (NOZ-DOI-1), the publish member renders in-house with its low-risk, stale-version, disclosure and 48 h re-check safeguards; flag set to 1 by migration 2026-10-12-35'
  WHERE control = 'errata-publish-enabled';
UPDATE control_registry SET disposition_state = 'applied', alternate_tested_at = '2026-10-12', reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  evidence = evidence || ' | applied 2026-10-12 (CONTROL-PLANE-FUNCTIONAL-CANARY-1, #2176): canary_revert.py FUNCTIONAL covers qnfo-ai and qnfo-gateway (canary-functional ok rows since 2026-10-12), qnfo-fleet-control 0.20.0 CM_LOOP_CANARIED and qnfo-code-orchestrator 0.13.0 PLAN_LOOP_CANARIED let the code loop plan and merge them; the verifier workers and the scorer host stay denied'
  WHERE control = 'control-plane-deny';
UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active', next_due_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  verify_probe = 'SELECT ''1'' AS expected, CASE WHEN COALESCE((SELECT value FROM pipeline_flags WHERE key = ''errata_publish_enabled''), ''0'') = ''1'' AND NOT EXISTS (SELECT 1 FROM ops_config WHERE key = ''zenodo_enabled'') AND COALESCE((SELECT lower(value) FROM ops_config WHERE key = ''perf_loop_enabled''), ''1'') NOT IN (''0'', ''off'', ''false'', ''no'', ''disabled'') THEN ''1'' ELSE ''0'' END AS observed'
  WHERE class = 'issue-2308';
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
VALUES ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'the errata publish gate guarded an external deposit that no longer exists; the in-house safeguards in code are the control that matters',
  'pipeline_flags.errata_publish_enabled = 1 by migration 2026-10-12-35; control_registry errata-publish-enabled applied; ops_config zenodo_enabled removed (backup bak_20261012_ops_config_zenodo_enabled)',
  'NOZ-DOI-1 publish path in qnfo-research-exec (errataMod: would_publish, pdf in-worker-render, no DOI); errata_actions 1 verified + 1 wontfix; zero readers of zenodo_enabled in */worker.js',
  'drafted low-risk corrections publish in-house on the :30 tick; nothing publishes today', 'papers.qnfo.org errata versions; reversible through paper versions',
  'the Rollback line of migrations/2026-10-12-35-flag-audit-close.sql', 'the errata loop closes end to end without a person',
  'the next low-risk errata draft publishes within one tick and verifyPublished passes 48 h later', 'none', 'd1 migration');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
VALUES ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a functional canary with an automatic revert is a sufficient rollback for the code loop to take qnfo-ai and qnfo-gateway',
  'CM_LOOP_CANARIED / PLAN_LOOP_CANARIED = [qnfo-ai, qnfo-gateway] (qnfo-fleet-control 0.20.0, qnfo-code-orchestrator 0.13.0); control_registry control-plane-deny applied',
  'cloud_ops_events canary-functional: 7 ok rows by 2026-10-12 14:06Z; scripts/canary_revert.py FUNCTIONAL has both workers; fold-guard.test.mjs holds the lists equal and requires the canary entries',
  'the code loop opens and merges tasks on qnfo-ai and qnfo-gateway; a bad deploy is reverted by the canary', 'qnfo-ai (model router) and qnfo-gateway (public site) deploys from code-loop merges',
  'remove the two names from CM_LOOP_CANARIED and PLAN_LOOP_CANARIED (one PR) or ops_config code_merge_runner_enabled = 0', 'code-loop coverage of two control-plane workers',
  'a code-loop task on qnfo-ai or qnfo-gateway merges and stays live (no CONTROL-PLANE-REVERTED-1) within 7 days', 'none', 'd1 migration, suites');
