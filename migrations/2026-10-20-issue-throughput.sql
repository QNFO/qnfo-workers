-- ISSUE-THROUGHPUT-1 (2026-10-20, owner standing directive; charter pillar: autonomy).
-- Owner words: "The system shall always triage, prioritise, remediate, resolve, deploy, and close issues server-side, automatically and faster than they open (throughput)."
-- It extends ISSUE-SLA-2H-1 (2026-10-13: open_agent_issues 0, issues_open_over_120m 0, issue_drain_ratio_24h >= 1.5, issue_auto_close_2h_share_24h 1.0) and SLA-120M-2, which already measure the total.
-- Read from qnfo-audit 2026-10-20 04:5xZ: 261 issues opened and 379 closed in 24 h (the stock is draining), yet 138 of 139 open issues are older than 120 minutes, 81 older than 24 h, 114 have no doer
-- (open_issues_without_doer_120m), issue_drain_ratio_24h reads 1.29 against 1.5 and issue_auto_close_2h_share_24h 0.47. The total hides where the inflow wins: by family RESEARCH-TERMINAL opened 21 and closed 12,
-- PAPER-LEARN opened 5 and closed 0, while METRIC-TRIGGER (18 opened, 50 closed), LOOP-BREAKER (22 and 26), CF-OBS (10 and 31) and CODE-LOOP-EXHAUSTED (12 and 13) drain.
-- This file (1) records the directive for machines (ops_config OWNER_DIRECTIVE_2026_10_20_ISSUE_THROUGHPUT_1, INSERT OR IGNORE, the shape of the earlier directive rows; docs and CLAUDE.md carry it in the same PR), and
-- (2) adds v_issue_family_throughput: per issue family (the title up to its first space or colon, METRIC-TRIGGER-<n>-... folded to METRIC-TRIGGER) the issues opened and closed in the last 24 h, open now,
-- net inflow (opened minus closed), the drain ratio (closed over opened) and the age of the oldest open one in hours. A family with net inflow above 0 is where a loop, a probe or a doer is missing. Read-only.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_issue_family_throughput; DELETE FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_20_ISSUE_THROUGHPUT_1';

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_10_20_ISSUE_THROUGHPUT_1', '{"id":"ISSUE-THROUGHPUT-1","directive":"THE SYSTEM SHALL ALWAYS TRIAGE, PRIORITISE, REMEDIATE, RESOLVE, DEPLOY AND CLOSE ISSUES SERVER-SIDE, AUTOMATICALLY AND FASTER THAN THEY OPEN","directive_verbatim":"The system shall always triage, prioritise, remediate, resolve, deploy, and close issues server-side, automatically and faster than they open (throughput).","date":"2026-10-20","measured_by":["issue_drain_ratio_24h (target >= 1.5)","open_agent_issues (target 0)","issues_open_over_120m (target 0)","issue_auto_close_2h_share_24h (target 1.0)","open_issues_without_doer_120m (target 0)","v_issue_family_throughput (per family: opened, closed, open, net, drain ratio over 24 h)"],"limits":"no limit moves: the interrupt gate, section 9, the harness permission checks, the secret lock and live work claims keep their precedence; an issue is closed only with evidence (issue_triage.close_evidence) and never as wontfix to lower a count (INTEGRITY-GUARDS-1)"}', 'ISSUE-THROUGHPUT-1 (owner standing directive 2026-10-20): the system triages, prioritises, remediates, resolves, deploys and closes issues server-side and automatically, faster than they open; measured by issue_drain_ratio_24h and v_issue_family_throughput. No worker reads the key: the loops honor it through the doctrine and the metrics.');

CREATE VIEW IF NOT EXISTS v_issue_family_throughput AS
WITH f AS (
  SELECT id, status, created_at, updated_at,
    CASE WHEN title LIKE 'METRIC-TRIGGER-%' THEN 'METRIC-TRIGGER'
         ELSE substr(title, 1, MIN(CASE WHEN instr(title, ' ') > 0 THEN instr(title, ' ') ELSE 999 END, CASE WHEN instr(title, ':') > 0 THEN instr(title, ':') ELSE 999 END) - 1)
    END AS family
  FROM agent_issues
), n AS (SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS now_ms)
SELECT family,
  SUM(CASE WHEN created_at > n.now_ms - 86400000 THEN 1 ELSE 0 END) AS opened_24h,
  SUM(CASE WHEN status IN ('closed', 'resolved') AND updated_at > n.now_ms - 86400000 THEN 1 ELSE 0 END) AS closed_24h,
  SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_now,
  SUM(CASE WHEN created_at > n.now_ms - 86400000 THEN 1 ELSE 0 END) - SUM(CASE WHEN status IN ('closed', 'resolved') AND updated_at > n.now_ms - 86400000 THEN 1 ELSE 0 END) AS net_inflow_24h,
  ROUND(1.0 * SUM(CASE WHEN status IN ('closed', 'resolved') AND updated_at > n.now_ms - 86400000 THEN 1 ELSE 0 END) / MAX(1, SUM(CASE WHEN created_at > n.now_ms - 86400000 THEN 1 ELSE 0 END)), 2) AS drain_ratio_24h,
  ROUND(MAX(CASE WHEN status = 'open' THEN (n.now_ms - created_at) / 3600000.0 END), 1) AS oldest_open_h
FROM f, n
WHERE family <> ''
GROUP BY family
HAVING open_now > 0 OR opened_24h > 0 OR closed_24h > 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01MQYeWxrMd4mVYPCphyaYes',
  'a throughput directive is held by the total only if no family hides a net inflow; the family is the unit where a loop, a probe or a doer is missing',
  'ISSUE-THROUGHPUT-1: directive recorded; v_issue_family_throughput lists opened, closed, open, net inflow and drain ratio per issue family over 24 h',
  'qnfo-audit 2026-10-20 read-only: 261 opened and 379 closed in 24 h, 138 of 139 open issues over 120 minutes, 114 without a doer; RESEARCH-TERMINAL 21 opened and 12 closed, PAPER-LEARN 5 opened and 0 closed',
  'migration merged',
  'one read-only view and one ops_config row',
  'the Rollback header of migrations/2026-10-20-issue-throughput.sql',
  'the family where inflow beats drain is named by a query, not found by reading the backlog',
  'families with net inflow above 0 and an open backlog fall to 0',
  'none',
  'd1:qnfo-audit read-only counts, node:sqlite fixtures in migrations/issue-throughput.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'ISSUE-THROUGHPUT-1:%');
