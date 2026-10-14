-- SLA-DRAIN-1 (2026-10-14, pillars reach and research). Owner directives 2026-10-14: no SLA exceeds 120 minutes, and "audit all SLAs
-- and accelerate to drain all queues and backlogs". Audit read 06:35Z: sla_definitions_over_120m 0 (every definition is in line),
-- sla_breaches_over_120m 441. Of those, content_items_over_sla 332:
--   (1) 142 Bluesky dissemination rows queued since 2026-10-01 (oldest 302 h). qnfo-social posts one a week (SOCIAL weekly cap 1,
--       a publishing cadence cap that stays, BUDGET-SOFT-ROUTE-1) and drains oldest first, and the attention scorecard reads bluesky
--       STOP@0 (118 items, 2 engagements, 0 visits in 28 days). At one a week the queue needs 142 weeks; every row but the newest is a
--       post about an older paper that can never be sent. Each channel keeps its newest queued row; the others take action
--       'suppressed' with the reason in post_text_snippet (the convention qnfo-social's own content gate uses), and a trigger keeps
--       it so: a new queued row supersedes the older queued rows of its channel. The rows are copied to bak_20261014_sla_drain_1 first.
--   (2) 177 research rows in the RESEARCH-BACKPRESSURE-1 deferred pool: inflow 118 in 24 h, 5 published. The executor was at its
--       ceiling (research_parallel 4 = RESEARCH_PARALLEL_MAX 4); qnfo-research-exec 0.18.1 raises the ceiling to 8 and this file sets
--       research_parallel 6. Slots run concurrently, so the width costs AI calls (steered by budget, never stopped), not wall time.
-- spof-review: one guard trigger on dissemination_tracker (writes only rows of the inserted row's channel); one ops_config value.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261014_sla_drain_1
-- Rollback: UPDATE dissemination_tracker SET action = 'queued', post_text_snippet = (SELECT b.post_text_snippet FROM bak_20261014_sla_drain_1 b WHERE b.id = dissemination_tracker.id), updated_at = (SELECT b.updated_at FROM bak_20261014_sla_drain_1 b WHERE b.id = dissemination_tracker.id) WHERE id IN (SELECT id FROM bak_20261014_sla_drain_1) AND action = 'suppressed'; DROP TRIGGER IF EXISTS dissemination_queue_newest_only; UPDATE ops_config SET value = '4' WHERE key = 'research_parallel';

CREATE TABLE IF NOT EXISTS bak_20261014_sla_drain_1 AS
  SELECT d.* FROM dissemination_tracker d
  WHERE d.action = 'queued'
    AND EXISTS (SELECT 1 FROM dissemination_tracker n WHERE n.channel = d.channel AND n.action = 'queued'
                AND (n.created_at > d.created_at OR (n.created_at = d.created_at AND n.id > d.id)));

UPDATE dissemination_tracker
SET action = 'suppressed', updated_at = datetime('now'),
    post_text_snippet = 'SLA-DRAIN-1: superseded by a newer queued post on ' || channel || ' (weekly cadence cap; channel posts the newest paper). Revert: action queued'
WHERE id IN (SELECT id FROM bak_20261014_sla_drain_1) AND action = 'queued';

CREATE TRIGGER IF NOT EXISTS dissemination_queue_newest_only AFTER INSERT ON dissemination_tracker
WHEN NEW.action = 'queued'
BEGIN
  UPDATE dissemination_tracker
  SET action = 'suppressed', updated_at = datetime('now'),
      post_text_snippet = 'SLA-DRAIN-1: superseded by ' || NEW.id || ', a newer queued post on ' || NEW.channel || '. Revert: action queued'
  WHERE channel = NEW.channel AND action = 'queued' AND id <> NEW.id;
END;

INSERT INTO ops_config (key, value, note, updated_at) VALUES ('research_parallel', '6', 'SLA-DRAIN-1 2026-10-14: 4 -> 6 (ceiling 8 from qnfo-research-exec 0.18.1); revert 4', datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = '6', note = excluded.note, updated_at = datetime('now') WHERE CAST(ops_config.value AS INTEGER) < 6;

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id,
  trigger_condition, symptom, blast_radius) VALUES
('dissemination-queue-over-cadence',
 'a posting queue holds more rows than its cadence cap can post within the SLA, so every row past the first ages for weeks',
 'every published paper queued a Bluesky post while qnfo-social posts one a week, oldest first',
 'SLA-DRAIN-1: each channel keeps only its newest queued post (trigger dissemination_queue_newest_only); older ones are suppressed with a revert note',
 'no channel holds more than one queued dissemination row',
 'fm-dissemination-queue-over-cadence', '2026-10-14', NULL,
 'the trigger dropped, or a writer that updates rows back to queued in bulk',
 '142 Bluesky rows queued, oldest 302 h, at a cap of one post a week',
 'v_content_pipeline distribute stage, sla_breaches_over_120m');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts,
  escalate_to, expected_cadence_h, status, ts, module, budget_ms, max_items, requires_container, attempts) VALUES
('fm-dissemination-queue-over-cadence', NULL, 'SLA-DRAIN-1', 'failure-mode detector',
 'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM (SELECT channel FROM dissemination_tracker WHERE action = ''queued'' GROUP BY channel HAVING COUNT(*) > 1)',
 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'), 'failure-mode', 45000, 5, 0, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_015EF12jWvz4tFNB2zAHcdYC',
  'a queue the cadence cap can never drain is not a backlog to wait on; the newest post is the one worth sending, and the executor ceiling, not the backpressure, limits research throughput',
  'SLA-DRAIN-1: Bluesky dissemination keeps only the newest queued post per channel (141 older rows suppressed with revert note, trigger keeps it so); research_parallel 6 with qnfo-research-exec 0.18.1 ceiling 8',
  '06:35Z: 142 bluesky rows queued (oldest 302 h) at a 1-a-week cap, channel verdict STOP@0; research deferred pool 180, inflow 118 vs 5 published in 24 h, research_parallel 4 at ceiling 4',
  'migration merged with qnfo-research-exec 0.18.1', 'dissemination_tracker queued rows of each channel; research executor width', 'the Rollback header',
  'the fleet keeps posting queues within what their cadence can post, and widens the research executor without a deploy up to 8',
  'content_items_over_sla falls by at least 140 within 20 min of apply; research published_24h at least 15 within 24 h of the deploy', 'none',
  'v_content_pipeline, dissemination_tracker, qnfo-social drain, research_queue, ops_config, qnfo-research-exec researchParallel'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SLA-DRAIN-1:') = 1);
