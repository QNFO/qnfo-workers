-- PROBE-PLANES-1 (2026-10-06, pillar autonomy, agent_issues 2075 PROBE-SYSTEMWIDE-1). Owner question 2026-10-06: "Why do
-- fleet probes only run as SQL against qnfo-audit?" Of 543 remediation contracts, 526 read qnfo-audit, 13 personal-life and 1
-- qnfo-graph; the account holds 10 D1 databases. scripts/remediation_consumer.py resolved only d1-query@personal-life and
-- ran any other d1-query@<name> probe against qnfo-audit, and transport_trust trusted no other plane, so a defect whose
-- evidence lives in living-paper, qnfo-graph, q08-signal, ipatent-db or qnfo-cms could not be closed by its own data.
-- The consumer now resolves d1-query@<name> to that database through the Cloudflare API (qnfo-identity and qnfo-outreach
-- refused: owner documents and outreach contacts must never reach a public run log). This file:
--   1. trusts the five research planes as data-plane reads (runtime_observable 0, like d1-query@personal-life);
--   2. arms one standing contract on living-paper (the paper corpus is updated within 3 days), so the plane path is
--      exercised on every run and PROBE-SYSTEMWIDE-1's closing probe can see an other-plane verification.
-- Idempotent: INSERT OR IGNORE. No DELETE or DROP.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE transport_trust SET trusted = 0 WHERE transport IN ('d1-query@living-paper', 'd1-query@qnfo-graph', 'd1-query@q08-signal', 'd1-query@ipatent-db', 'd1-query@qnfo-cms'); UPDATE remediation_contracts SET status = 'superseded' WHERE class = 'plane-living-paper-fresh';

INSERT OR IGNORE INTO transport_trust (transport, observation_class, runtime_observable, independent, trusted, note, ts) VALUES
 ('d1-query@living-paper', 'data-plane-read', 0, 1, 1, 'PROBE-PLANES-1 (2026-10-06, #2075): scripts/remediation_consumer.py reads living-paper by name through the Cloudflare API; literal read-only SELECT, token-only observations', datetime('now')),
 ('d1-query@qnfo-graph', 'data-plane-read', 0, 1, 1, 'PROBE-PLANES-1 (2026-10-06, #2075): scripts/remediation_consumer.py reads qnfo-graph by name through the Cloudflare API; literal read-only SELECT, token-only observations', datetime('now')),
 ('d1-query@q08-signal', 'data-plane-read', 0, 1, 1, 'PROBE-PLANES-1 (2026-10-06, #2075): scripts/remediation_consumer.py reads q08-signal by name through the Cloudflare API; literal read-only SELECT, token-only observations', datetime('now')),
 ('d1-query@ipatent-db', 'data-plane-read', 0, 1, 1, 'PROBE-PLANES-1 (2026-10-06, #2075): scripts/remediation_consumer.py reads ipatent-db by name through the Cloudflare API; literal read-only SELECT, token-only observations', datetime('now')),
 ('d1-query@qnfo-cms', 'data-plane-read', 0, 1, 1, 'PROBE-PLANES-1 (2026-10-06, #2075): scripts/remediation_consumer.py reads qnfo-cms by name through the Cloudflare API; literal read-only SELECT, token-only observations', datetime('now'));

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at) VALUES
 ('plane-living-paper-fresh', NULL, 'standing: the living-paper corpus has published papers and was updated within 3 days (PROBE-PLANES-1)', 'none while it passes; a stale corpus is the indexer member of qnfo-infra (INDEXER-FOLD-1)', 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM papers WHERE status = ''published'') > 0 AND (SELECT MAX(updated_at) FROM papers) >= datetime(''now'', ''-3 days'') THEN ''ok'' ELSE ''stale: newest paper update '' || COALESCE((SELECT MAX(updated_at) FROM papers), ''never'') END AS observed', 'd1-query@living-paper', 3, 'qnfo-infra', 6, 'active', 'plane-liveness-v1', NULL);
