-- TRIGGER-GRAPH-HEADROOM-1 (2026-10-18, pillar autonomy): four probe-template generations become one
--
-- WHY
--   remediation_contracts carried SIX probe-template triggers from successive design generations, and every
--   generation re-fires on the same INSERT. The reachable graph around agent_issues then exceeded the D1 depth
--   limit and the fleet could file no issues at all for ~18 minutes on 2026-10-18 (AGENT-ISSUES-UNWRITABLE-1,
--   restored by dropping triage_close_sync_resolved_ins in migration 2026-10-18-drop-resolved-ins-trigger.sql).
--   That fix removed the cycle; this one restores headroom, because the next trigger added anywhere on this path
--   would close it again.
--
-- WHAT MERGES
--   contract_probe_templates_v2_loop, _v2b_loop, _v2c_loop and _v2d_unmapped_loop differ ONLY in which branch of the
--   same decision they test and in a module/precondition label. All four set the same status, verify_transport,
--   probe text and action. They become one trigger, contract_probe_templates_loop_merged, whose WHEN is the union of
--   the four conditions and whose module/precondition preserve the original priority:
--     v2d (unmapped loop label) > v2c (mapped via issue_source_hosts) > v2/v2b (service-sourced loop)
--
-- THE ORDER TRAP (found while verifying, not by reading)
--   SQLite fires AFTER triggers in REVERSE order of creation, so a newly created trigger runs FIRST. The merged
--   trigger therefore fired before contract_probe_templates_v3_generic and stole issues that v3 used to claim
--   (measured: issue 3009 changed from probe-template-v3-generic to probe-template-v2d-loop). v3 is dropped and
--   re-created AFTER the merged trigger, so it is newest again and keeps its priority.
--
-- VERIFIED BEFORE AND AFTER ON LIVE DATA (throwaway contracts, deleted again)
--   issue 3009, source 'portfolio-lifecycle' (unmapped):  before v3_generic  ->  after v3_generic  (identical)
--   issue 3010, source 'qnfo-fleet-control' (service):     before v2d_loop     ->  after v2d_loop     (identical)
--   remediation_contracts triggers: 14 -> 11
--
-- Verify after apply:
--   SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='remediation_contracts' ORDER BY name;
--   SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND tbl_name='remediation_contracts';   -- 11
--   INSERT INTO agent_issues (title, description, source, category, priority, status)
--     VALUES ('probe','probe','probe','observability','low','open');                                -- succeeds
--
-- spof-review: the remediation tick is the second path - it reads verify_probe from the contract row whatever wrote it,
--   so a template trigger that fails to fire only leaves the caller-supplied probe in place and no decision depends
--   on the trigger alone.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: remediation_contracts
-- Rollback: DROP TRIGGER IF EXISTS contract_probe_templates_loop_merged; then recreate the four dropped triggers from
--   git history (they are unchanged in migrations before 2026-10-18) and drop/recreate contract_probe_templates_v3_generic
--   so it is newest again. Only do this together with a reduction elsewhere on the agent_issues path.

DROP TRIGGER IF EXISTS contract_probe_templates_v2_loop;
DROP TRIGGER IF EXISTS contract_probe_templates_v2b_loop;
DROP TRIGGER IF EXISTS contract_probe_templates_v2c_loop;
DROP TRIGGER IF EXISTS contract_probe_templates_v2d_unmapped_loop;

CREATE TRIGGER contract_probe_templates_loop_merged AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND (EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%'
                AND a.source NOT LIKE 'session%' AND a.source NOT LIKE 'claude%' AND a.source NOT LIKE 'chat%'
                AND a.source NOT LIKE 'owner%' AND a.source NOT LIKE 'backlog%' AND a.source NOT LIKE 'cloud_ops_events%'
                AND a.source NOT LIKE 'TRANSFORMATION-PROGRAM%' AND a.source NOT LIKE 'human%'
                AND NOT EXISTS (SELECT 1 FROM issue_source_hosts m WHERE m.source = a.source))
    OR EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source
                 JOIN service_registry s ON s.service = m.host AND s.state = 'live'
                WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%')
    OR EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.state = 'live' AND instr(a.source, s.service || '-') = 1
                WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%')
    OR EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.service = a.source AND s.state = 'live'
                WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%'))
BEGIN
  UPDATE remediation_contracts
     SET status = 'active', verify_transport = 'd1-query', attempts = 0, last_verdict = NULL,
         next_due_at = datetime('now'),
         action = 'the filing loop closes it on recovery; after 48h open the probe fails and the remediation tick escalates',
         module = CASE
           WHEN EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%'
                     AND a.source NOT LIKE 'session%' AND a.source NOT LIKE 'claude%' AND a.source NOT LIKE 'chat%'
                     AND a.source NOT LIKE 'owner%' AND a.source NOT LIKE 'backlog%' AND a.source NOT LIKE 'cloud_ops_events%'
                     AND a.source NOT LIKE 'TRANSFORMATION-PROGRAM%' AND a.source NOT LIKE 'human%'
                     AND NOT EXISTS (SELECT 1 FROM issue_source_hosts m WHERE m.source = a.source))
             THEN 'probe-template-v2d-loop'
           WHEN EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source
                          JOIN service_registry s ON s.service = m.host AND s.state = 'live'
                         WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%')
             THEN 'probe-template-v2c-loop'
           ELSE 'probe-template-v2-loop' END,
         precondition = CASE
           WHEN EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%'
                     AND a.source NOT LIKE 'session%' AND a.source NOT LIKE 'claude%' AND a.source NOT LIKE 'chat%'
                     AND a.source NOT LIKE 'owner%' AND a.source NOT LIKE 'backlog%' AND a.source NOT LIKE 'cloud_ops_events%'
                     AND a.source NOT LIKE 'TRANSFORMATION-PROGRAM%' AND a.source NOT LIKE 'human%'
                     AND NOT EXISTS (SELECT 1 FROM issue_source_hosts m WHERE m.source = a.source))
             THEN 'filed by a fleet loop under an unmapped label (ORPHAN-GUARD-BIRTH-1c), which owns it for 48h'
           WHEN EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source
                          JOIN service_registry s ON s.service = m.host AND s.state = 'live'
                         WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%')
             THEN 'filed by a fleet loop under a mapped label (LOOP-SOURCE-HOSTS-1), which owns it for 48h'
           ELSE 'filed by a live fleet loop, which owns it for 48h (ORPHAN-GUARD-BIRTH-1)' END,
         verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = ' || NEW.issue_id || ') <> ''open'' THEN ''ok'' WHEN (SELECT created_at FROM agent_issues WHERE id = ' || NEW.issue_id || ') > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 172800) * 1000 THEN ''pending: filed by ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ', which owns it for 48h'' ELSE ''stale: the filing loop ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ' did not close it within 48h'' END AS observed'
   WHERE class = NEW.class AND status = 'needs-machine-probe';
END;

-- Re-created LAST so it is the newest trigger and therefore fires first again (see THE ORDER TRAP above).
DROP TRIGGER IF EXISTS contract_probe_templates_v3_generic;

CREATE TRIGGER contract_probe_templates_v3_generic AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title LIKE 'METRIC-TRIGGER-%')
  AND NOT EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.service = a.source AND s.state = 'live'
                   WHERE a.id = NEW.issue_id)
BEGIN
  UPDATE remediation_contracts
  SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v3-generic', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
      precondition = 'no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)',
      action = 'VACUOUS-PROBE-V3-1: no verdict while the issue is open (nothing here measures its defect); passes once the issue is closed with issue_triage.close_evidence. A doer that knows the defect replaces this probe with one that measures it.',
      verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ' || NEW.issue_id || ') AS observed'
  WHERE class = NEW.class AND status = 'needs-machine-probe';
END;
