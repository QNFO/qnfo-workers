-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_issue_value_queue;
-- PRIORITY-SPACE-1 (owner directive 2026-11-14): 529 of 732 open issues are labelled critical, so v_issue_queue orders by id in practice.
-- v_issue_value_queue ranks by value per unit cost with family leverage (one root fix closes many siblings), the SQL twin of
-- _shared/priority-space.js (D1 has no ln(), so leverage uses log2 buckets). fam_rank = 1 marks the family representative to take first.
CREATE VIEW IF NOT EXISTS v_issue_value_queue AS
WITH b AS (
  SELECT a.id, a.title, a.priority, a.linked_session, a.created_at,
         CASE WHEN instr(a.title, ':') > 0 THEN substr(a.title, 1, min(instr(a.title, ':') - 1, 40)) ELSE substr(a.title, 1, 30) END AS family,
         CASE a.priority WHEN 'critical' THEN 1.0 WHEN 'high' THEN 0.7 WHEN 'medium' THEN 0.4 ELSE 0.2 END AS v_sev,
         CASE WHEN a.title LIKE 'METRIC-TRIGGER-%' THEN 0.6 ELSE 0 END AS v_breach,
         min(1.0, max(0, (julianday('now') - CASE WHEN typeof(a.created_at) = 'integer' THEN julianday(a.created_at / 1000, 'unixepoch') ELSE julianday(a.created_at) END) * 1440 - 120) / 10080.0) AS v_age,
         CASE WHEN (a.title || ' ' || COALESCE(a.category, '')) LIKE '%paper%' OR a.title LIKE '%reader%' OR a.title LIKE '%qnfo.org%' THEN 1 ELSE 0 END AS v_reach,
         1.0 + CASE WHEN COALESCE(a.description, '') LIKE '%code-task:%' THEN 0 ELSE 1 END
             + CASE WHEN a.linked_session IS NOT NULL THEN 2 ELSE 0 END
             + CASE WHEN a.title LIKE '%EXHAUSTED%' OR a.title LIKE '%[retry %' THEN 1.5 ELSE 0 END AS cost
  FROM agent_issues a WHERE a.status = 'open'
), f AS (
  SELECT b.*, COUNT(*) OVER (PARTITION BY family) AS fam_size FROM b
), s AS (
  SELECT f.*, (1.0 * v_sev + 1.5 * v_breach + 0.6 * v_age + 0.8 * v_reach
               + 1.2 * (CASE WHEN fam_size >= 32 THEN 1.0 WHEN fam_size >= 16 THEN 0.83 WHEN fam_size >= 8 THEN 0.67
                             WHEN fam_size >= 4 THEN 0.5 WHEN fam_size >= 2 THEN 0.33 ELSE 0.17 END)) AS value FROM f
)
SELECT ROW_NUMBER() OVER (ORDER BY (fam_rank = 1) DESC, ratio DESC, id) AS pos, * FROM (
  SELECT s.*, round(value / cost, 4) AS ratio,
         ROW_NUMBER() OVER (PARTITION BY family ORDER BY value / cost DESC, id) AS fam_rank FROM s
);
