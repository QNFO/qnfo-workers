-- PRIORITY-QUEUE-1 (2026-10-03). Pillar: autonomy. Owner directive 2026-10-03 10:07 Amsterdam:
--   "Dates aren't important. The order of priority is important. ... it needs to happen continuously every time the
--    server-side loop runs."
--
-- Evidence (qnfo-audit, read 2026-10-03 ~08:20Z):
--   * agent_issues_autotriage2_ins (2026-10-02, AUTOTRIAGE-OWNER-ROUTE-1; AUTOTRIAGE-1 before it) stamps every new issue
--     sla_due_at = now + 7 days. The only consumers are qnfo-fleet-control slaEscalate (alerts AFTER the date passes) and
--     qnfo-autonomy-scorer (counts issues past the date). Nothing orders work by the date; it only delays escalation by a week.
--   * There was no single queue: each loop sorted on its own. qnfo-backlog-exec and qnfo-fleet-control ranked
--     CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2, so 'critical' sorted with 'low'; the qnfo-fleet-control
--     self-repair candidate query (evPropose) admits priority IN ('high','medium','low') only, so critical issues never
--     reached it; the code loop intake (qnfo-code-orchestrator) took issues ORDER BY id, ignoring priority.
--
-- Change:
--   1. Back up every issue_triage.sla_due_at (issue_triage_sla_backup_20261003).
--   2. v_issue_queue: THE master queue. Every open issue, one order: priority (critical, high, medium, low, other), then
--      oldest first (id). pos = place in the queue. Loops read their work in this order.
--   3. New issues are due now (sla_due_at = datetime('now')), not in 7 days; existing open rows are set to now as well.
--   4. v_sla_breaches / v_sla_breaches_v2 keep only the real gap (an open issue with no triage row). A date can no longer
--      make an issue "overdue", so slaEscalate does not alert on every issue once all are due now.
--
-- Rollback (in this order):
--   DROP VIEW v_issue_queue;
--   UPDATE issue_triage SET sla_due_at = (SELECT b.sla_due_at FROM issue_triage_sla_backup_20261003 b WHERE b.issue_id = issue_triage.issue_id)
--     WHERE issue_id IN (SELECT issue_id FROM issue_triage_sla_backup_20261003);
--   re-create agent_issues_autotriage2_ins from migrations/2026-10-02-autotriage-owner-route.sql;
--   re-create v_sla_breaches and v_sla_breaches_v2 from the definitions saved in issue_triage_sla_backup_views_20261003.

CREATE TABLE IF NOT EXISTS issue_triage_sla_backup_20261003 AS SELECT issue_id, sla_due_at FROM issue_triage;
CREATE TABLE IF NOT EXISTS issue_triage_sla_backup_views_20261003 AS SELECT name, sql FROM sqlite_master WHERE name IN ('v_sla_breaches', 'v_sla_breaches_v2', 'agent_issues_autotriage2_ins');

DROP VIEW IF EXISTS v_issue_queue;
CREATE VIEW v_issue_queue AS
SELECT ROW_NUMBER() OVER (ORDER BY q.prank, q.id) AS pos, q.*
FROM (
  SELECT a.id,
         CASE a.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END AS prank,
         a.priority, a.title, a.category, a.source, t.owner, t.triage_state,
         CASE WHEN COALESCE(a.description, '') LIKE '%code-task:%' THEN 1 ELSE 0 END AS has_code_task,
         CASE WHEN EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status = 'active') THEN 1 ELSE 0 END AS has_contract,
         a.linked_session, a.created_at, a.updated_at
  FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id
  WHERE a.status = 'open'
) q;

DROP TRIGGER IF EXISTS agent_issues_autotriage2_ins;
CREATE TRIGGER agent_issues_autotriage2_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' BEGIN
  INSERT OR IGNORE INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at)
  SELECT NEW.id,
         CASE WHEN o.owner IS NULL THEN 'AUTOTRIAGE-1' ELSE 'AUTOTRIAGE-2' END,
         'triaged',
         COALESCE(o.owner, 'qnfo-ops'),
         datetime('now')
  FROM (SELECT COALESCE(
          (SELECT t.owner FROM analytics_metric_triggers t
            WHERE NEW.title LIKE 'METRIC-TRIGGER-%'
              AND t.id = CAST(substr(NEW.title, 16) AS INTEGER)
              AND t.owner IN (SELECT service FROM service_registry)),
          (SELECT s.service FROM service_registry s
            WHERE instr(COALESCE(NEW.description,''), 'code-task: repo=qnfo-workers path=') > 0
              AND s.service = substr(
                    substr(NEW.description, instr(NEW.description, 'code-task: repo=qnfo-workers path=') + 34),
                    1,
                    instr(substr(NEW.description, instr(NEW.description, 'code-task: repo=qnfo-workers path=') + 34), '/') - 1))
        ) AS owner) o;
END;

UPDATE issue_triage SET sla_due_at = datetime('now')
WHERE issue_id IN (SELECT id FROM agent_issues WHERE status = 'open') AND datetime(sla_due_at) > datetime('now');

DROP VIEW IF EXISTS v_sla_breaches;
CREATE VIEW v_sla_breaches AS
SELECT i.id, i.priority, i.category, NULL AS rc, NULL AS owner, NULL AS sla_due_at, NULL AS triage_state, 'untriaged' AS breach_type
FROM agent_issues i
WHERE i.status = 'open' AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = i.id);

DROP VIEW IF EXISTS v_sla_breaches_v2;
CREATE VIEW v_sla_breaches_v2 AS
SELECT i.id, i.priority, i.category, 'RC-00-UNCLASSIFIED' AS rc, 'qnfo-ops' AS owner,
       CASE WHEN typeof(i.created_at) = 'integer' THEN datetime(i.created_at / 1000, 'unixepoch') ELSE datetime(i.created_at) END AS sla_due_at,
       'untriaged' AS triage_state, 'triage-gap' AS breach_class
FROM agent_issues i
WHERE i.status = 'open' AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = i.id);
