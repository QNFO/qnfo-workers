-- THIN-PRIOR-WORK-1 (2026-10-19, charter pillar: research, agent_issues 99949). The failure mode behind the breaching metric
-- papers_live_failing_release_gate (140 vs 0), measured 2026-10-19 on living-paper.papers and qnfo-audit.paper_revision_log.
-- All 140 papers fail the release gate as quality:thin (136 lack a prior-work section, three references and a table or code; 4
-- lack the section and a table or code); all are older than 7 days. The reviser read 60 papers newest-first and stopped at a
-- terminal paper_revision_log row (176 slugs are needs-substantive-revision), and the "substantive-remediation loop" those rows
-- defer to was never built, so nothing acted on a thin paper. qnfo-research-exec 0.21.0 gives two such papers an hour a Prior
-- Work section grounded in related gate-passing QNFO papers, re-read by a second model family, queued for publishV2.
-- Detector: while the metric is above 0 and 0.21.0 or later runs, the step writes a thin-prior-work row at least every 180 min.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-thin-papers-unremediated'; DELETE FROM failure_modes WHERE fm_key = 'thin-papers-unremediated'

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('thin-papers-unremediated', 'published papers that fail the release gate as quality:thin stay live and no loop revises them', 'the reviser scan reads 60 papers newest-first and treats needs-substantive-revision as terminal, deferring to a substantive-remediation loop that was never built', 'qnfo-research-exec 0.21.0 THIN-PRIOR-WORK-1: two thin papers an hour get a grounded Prior Work section, re-read by another model family, queued as a revision', 'fm-thin-papers-unremediated: while papers_live_failing_release_gate is above 0 and research-exec 0.21+ runs, a thin-prior-work row lands in paper_revision_log within 180 minutes', 'fm-thin-papers-unremediated', '2026-10-08T04:20:25Z', 99949, 'papers_live_failing_release_gate above 0', '140 live papers fail the release gate; none was revised', 'papers.qnfo.org reader trust (22% of live papers)');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at, module, budget_ms, max_items, requires_container) VALUES
 ('fm-thin-papers-unremediated', NULL, 'THIN-PRIOR-WORK-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST(CASE WHEN COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = ''papers_live_failing_release_gate''), 0) > 0 AND COALESCE((SELECT version FROM fleet_heartbeat WHERE worker = ''qnfo-research-exec''), '''') >= ''0.21'' AND (SELECT COUNT(*) FROM paper_revision_log WHERE status LIKE ''thin-prior-work%'' AND created_at >= datetime(''now'', ''-180 minutes'')) = 0 THEN 1 ELSE 0 END AS TEXT) AS observed', 'd1-query', 3, 'qnfo-research-exec', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0);
