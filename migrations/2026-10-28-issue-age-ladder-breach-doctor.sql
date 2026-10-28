-- BREACH-DOCTOR-PHASE-B-1 (2026-10-28, charter pillar autonomy, agent_issues 1000425; docs/breach-doctor/ENGINE-DESIGN.md section 5, rollout step 3).
-- v_issue_age_ladder.doer gains the branch 'breach doctor': a breach_diagnoses row with mode on, state queued/applied/verifying, action_ref set, action_kind <> none,
-- lease_until in the future and last_progress_at within 120 minutes. A measure-mode row, a diagnosed-only row and a lease without progress never count (anti-gaming).
-- Gate read live 2026-10-28 19:40Z: 758 diagnoses, doctor_taint_violations_24h = 0, breaches_auto_remediated_24h = 6 (>= 1). Same columns as before.
-- The strict count of issues with no code-task doer is: doer IS NULL OR doer = 'breach doctor'.
-- Predicted: issues the doctor is actively remediating stop counting as breach=1 on the ladder; no other row changes.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_v_issue_age_ladder_20261028
-- Rollback: DROP VIEW IF EXISTS v_issue_age_ladder; CREATE VIEW v_issue_age_ladder AS WITH n AS (SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS now_ms, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS now_iso), o AS ( SELECT a.id, a.title, a.priority, a.source, ROUND((n.now_ms - a.created_at) / 3600000.0, 1) AS age_h, CASE WHEN instr(COALESCE(a.description, ''), 'code-task:') > 0 THEN 'code-task line' WHEN EXISTS (SELECT 1 FROM code_tasks k WHERE k.goal LIKE '[issue #' || a.id || ']%' AND k.status NOT IN ('failed', 'closed', 'superseded', 'needs_human')) THEN 'live code task' WHEN EXISTS (SELECT 1 FROM work_claims w WHERE (w.issue_id = a.id OR w.path = 'issue:' || a.id) AND w.released_at IS NULL AND w.expires_at > n.now_iso) THEN 'live work claim' ELSE NULL END AS doer, p.outcome AS plan_outcome, p.planned_at, substr(COALESCE(p.detail, ''), 1, 200) AS plan_reason FROM agent_issues a CROSS JOIN n LEFT JOIN issue_plans p ON p.issue_id = a.id WHERE a.status = 'open' ) SELECT id, substr(title, 1, 120) AS title, priority, source, age_h, doer, plan_outcome, planned_at, plan_reason, CASE WHEN age_h >= 24 THEN '24h' WHEN age_h >= 16 THEN '16h' WHEN age_h >= 8 THEN '8h' WHEN age_h >= 4 THEN '4h' ELSE 'new' END AS rung, CASE WHEN age_h >= 24 AND doer IS NULL THEN 1 ELSE 0 END AS breach FROM o;
CREATE TABLE IF NOT EXISTS bak_v_issue_age_ladder_20261028 AS SELECT name, sql FROM sqlite_master WHERE name = 'v_issue_age_ladder';
DROP VIEW IF EXISTS v_issue_age_ladder;
CREATE VIEW v_issue_age_ladder AS
WITH n AS (SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS now_ms, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS now_iso),
o AS (
  SELECT a.id, a.title, a.priority, a.source, ROUND((n.now_ms - a.created_at) / 3600000.0, 1) AS age_h,
    CASE WHEN instr(COALESCE(a.description, ''), 'code-task:') > 0 THEN 'code-task line'
         WHEN EXISTS (SELECT 1 FROM code_tasks k WHERE k.goal LIKE '[issue #' || a.id || ']%' AND k.status NOT IN ('failed', 'closed', 'superseded', 'needs_human')) THEN 'live code task'
         WHEN EXISTS (SELECT 1 FROM work_claims w WHERE (w.issue_id = a.id OR w.path = 'issue:' || a.id) AND w.released_at IS NULL AND w.expires_at > n.now_iso) THEN 'live work claim'
         WHEN EXISTS (SELECT 1 FROM breach_diagnoses d WHERE d.issue_id = a.id AND d.mode = 'on' AND d.state IN ('queued', 'applied', 'verifying')
                        AND d.action_ref IS NOT NULL AND d.action_kind <> 'none'
                        AND d.lease_until > n.now_iso
                        AND d.last_progress_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) THEN 'breach doctor'
         ELSE NULL END AS doer,
    p.outcome AS plan_outcome, p.planned_at, substr(COALESCE(p.detail, ''), 1, 200) AS plan_reason
  FROM agent_issues a CROSS JOIN n LEFT JOIN issue_plans p ON p.issue_id = a.id
  WHERE a.status = 'open'
)
SELECT id, substr(title, 1, 120) AS title, priority, source, age_h, doer, plan_outcome, planned_at, plan_reason,
  CASE WHEN age_h >= 24 THEN '24h' WHEN age_h >= 16 THEN '16h' WHEN age_h >= 8 THEN '8h' WHEN age_h >= 4 THEN '4h' ELSE 'new' END AS rung,
  CASE WHEN age_h >= 24 AND doer IS NULL THEN 1 ELSE 0 END AS breach
FROM o;
