-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = CASE class WHEN 'issue-100151' THEN 'monitoring' ELSE 'superseded' END, last_verdict = 'superseded:rolled-back PROBE-NEEDED-LIVE-PATHS-1' WHERE class IN ('issue-100140', 'issue-100151', 'issue-2925') AND instr(action, 'PROBE-NEEDED-LIVE-PATHS-1') > 0;
-- PROBE-NEEDED-LIVE-PATHS-1 (2026-10-19, charter pillar: autonomy; agent_issues 100267, 100268, 100269 from PROBE-NEEDED-1, REOPEN-LIVE-PATH-1).
-- Three open issues stood with no live verification path. Each gets a probe that measures its own defect, never the status of the issue itself.
--   * issue-100140 (UIA-SOURCE-FIDELITY-1): d1-query@living-paper over the newest ai4metascience-ignorance-audit row; observed = how many of three defects
--     the body still carries: the 2026b citation pointing at the-ultrametric-foundation (it belongs to qwave-qudit-advantage), no link to qwave-qudit-advantage,
--     and Merton 1987 as 13, 1-29 (correct 13: 1-28). Read 3 on 2026-10-19. Items of the issue that this probe leaves out: the Whitcomb citation is already
--     94(3) 509-539 in ai4metascience and universal-ignorance-audit is a retracted stub, so neither can still carry the old text; items 2, 4, 5 are prose
--     judgements and 6 and 7 live in another repository.
--   * issue-100151 (MODEL-DEGRADED): d1-query on ai_model_health; observed = how many of the four models named in the issue title are degraded. Read 4 on
--     2026-10-19. qnfo-backlog-exec closes a MODEL-DEGRADED issue on the same table, so probe and closer agree.
--   * issue-2925 (INTEG-MASTODON-VERIFY-1): the contract held an external-https probe with a "check" key that the runner's grammar does not know
--     (scripts/remediation_consumer.py accepts url, status, contains, absent, min_version, max_ms, redirect_to), so it was marked probe-unusable. It is restated
--     in that grammar: the public account lookup must contain a non-null verified_at. This is the profile-link half; the engagement half (posts_unmeasured for
--     mastodon) has no table or view to read yet and stays with the issue.
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT (instr(body_md, ''Quni-Gudzinas 2026b, https://papers.qnfo.org/papers/the-ultrametric-foundation'') > 0) + (instr(body_md, ''papers/qwave-qudit-advantage'') = 0) + (instr(body_md, ''13, 1'' || char(8211) || ''29'') > 0) FROM papers WHERE slug = ''ai4metascience-ignorance-audit'' ORDER BY rowid DESC LIMIT 1) AS TEXT) AS observed',
  verify_transport = 'd1-query@living-paper',
  action = 'PROBE-NEEDED-LIVE-PATHS-1: probe counts the defects of items 1 and 3 still in ai4metascience-ignorance-audit; items 2, 4, 5 are judgements, 6 and 7 are in QNFO/ignorance-audit',
  status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-100140' AND status = 'superseded';
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM ai_model_health WHERE status = ''degraded'' AND model_id IN (''kimi-k2.6'', ''gpt-oss-120b'', ''deepseek-v4-flash-wa'', ''deepseek-v4-pro-wa'')) AS TEXT) AS observed',
  verify_transport = 'd1-query',
  action = 'PROBE-NEEDED-LIVE-PATHS-1: probe counts the models named in the issue title that ai_model_health still reads degraded',
  status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-100151' AND status IN ('superseded', 'monitoring');
UPDATE remediation_contracts SET
  verify_probe = '{"url": "https://mstdn.science/api/v1/accounts/lookup?acct=QNFO", "status": 200, "contains": "\"verified_at\":\"20"}',
  verify_transport = 'external-https',
  action = 'PROBE-NEEDED-LIVE-PATHS-1: probe reads the profile-link half (a non-null verified_at on the public account); the engagement half has no table to read yet',
  status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-2925' AND status = 'superseded';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01MQYeWxrMd4mVYPCphyaYes',
  'an open issue is verified by a probe of its own defect; a probe in a grammar the runner does not read is unusable and counts as no probe',
  'PROBE-NEEDED-LIVE-PATHS-1: live probes for issues 100140, 100151 and 2925 (PROBE-NEEDED-1 issues 100267, 100268, 100269)',
  'qnfo-audit and living-paper read-only 2026-10-19: ai4metascience probe reads 3, degraded-model probe reads 4, Mastodon fields all verified_at null; scripts/remediation_consumer.py external-https grammar',
  'migration merged',
  'three remediation_contracts rows; no worker changed',
  'the Rollback header of migrations/2026-10-19-probe-needed-live-paths.sql',
  'issues with a live verification path rise by 3',
  'open issues without a live contract fall by 3 within 12 h',
  'none',
  'd1:qnfo-audit and d1:living-paper read-only probes run live, node:sqlite fixtures in migrations/probe-needed-live-paths.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'PROBE-NEEDED-LIVE-PATHS-1:%');
