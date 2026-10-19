-- RUN-OBSERVABILITY-1 / SLA-INSTRUMENT-1 (issues 2844, 2837; RESOLVE-ALL-OPEN-1, owner directive 2026-10-19). Pillar autonomy.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: process_contracts
-- Rollback: DROP VIEW IF EXISTS v_sla_instrument_coverage; DROP VIEW IF EXISTS v_process_run_freshness; DROP VIEW IF EXISTS
--           v_process_last_run; DROP TABLE IF EXISTS process_run_source; then re-create v_process_run_freshness from
--           migrations/2026-10-17-process-cadence-sla.sql (the cloud_ops_events-only join).
--
-- Why (measured 2026-10-19 04:25Z from qnfo-audit): v_process_run_freshness joined process_contracts to cloud_ops_events on
-- job = process only, so 38 of 45 processes read 'never-observed' although most of them leave a run record somewhere else:
--   * 16 cron workers write fleet_heartbeat (CRON-ONLY-HEARTBEAT-1) and never a cloud_ops_events row under their own name;
--   * folded members (calendar-api, fleet-exec, errata-hub, qnfo-paper-indexer, qnfo-paper-reviser, ai-health-prober inside
--     qnfo-ai-calibration) run inside their host's scheduled() and only the host leaves a record;
--   * event-driven processes record their outcome in their own table (research_queue, code_tasks, fleet_deploys,
--     social_media_posts, errata_actions, issue_lifecycle, remediation_verifications/_evidence, github_steward_runs,
--     email_reply_queue/outreach_learner_sends) or in cloud_ops_events under the worker's job with a stage kind;
--   * six contracts belong to RETIRED workers (qnfo-archive, qnfo-kaizen, qnfo-outreach, qnfo-signal-loop, qnfo-skill-sync,
--     qnfo-venue-radar carry a RETIRED marker): no run can ever be observed, and the row now says so instead of hiding among
--     the never-observed.
-- The issue asked that process names are not edited to fit log strings: process_run_source records each alias and why,
-- the process names are unchanged, and the direct job = process match still wins when it exists (MAX across all sources).
-- SLA-INSTRUMENT-1: v_sla_compliance measures step duration for two processes; v_sla_instrument_coverage now names, per
-- process, the instrument that can decide its SLA (step-duration, or run-freshness against sla_min = the PROCESS-CADENCE-SLA
-- DoD "a run record within the last N minutes"), or the recorded reason it has none. No invented data: every timestamp is a
-- MAX over rows the fleet already writes.
--
-- D1 limits honoured: no compound SELECT over 5 terms (one 2-term UNION ALL), no LIKE pattern.

CREATE TABLE IF NOT EXISTS process_run_source (
  process TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('cloud_ops_events', 'fleet_heartbeat', 'table', 'none')),
  job TEXT,
  kind TEXT,
  worker TEXT,
  reason TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT OR REPLACE INTO process_run_source (process, source, job, kind, worker, reason) VALUES
  ('ai-health-prober', 'fleet_heartbeat', NULL, NULL, 'ai-health-prober', 'cron worker writes fleet_heartbeat (FOLDED into qnfo-ai-calibration, heartbeats under its member name)'),
  ('qnfo-ai-calibration', 'fleet_heartbeat', NULL, NULL, 'ai-health-prober', 'host of the folded ai-health-prober; its scheduled() writes the ai-health-prober heartbeat row'),
  ('calendar-api', 'fleet_heartbeat', NULL, NULL, 'qnfo-lifecycle', 'FOLDED into qnfo-lifecycle (calendar-api/FOLDED); the host heartbeat proves the folded cron ran'),
  ('fleet-exec', 'fleet_heartbeat', NULL, NULL, 'qnfo-code-orchestrator', 'FOLDED into qnfo-code-orchestrator (fleet-exec/FOLDED); the host heartbeat proves the folded cron ran'),
  ('errata-hub', 'fleet_heartbeat', NULL, NULL, 'qnfo-research-exec', 'FOLDED into qnfo-research-exec (errata-hub/FOLDED); the host heartbeat proves the folded cron ran'),
  ('qnfo-paper-indexer', 'fleet_heartbeat', NULL, NULL, 'qnfo-infra', 'FOLDED into qnfo-infra (qnfo-paper-indexer/FOLDED); the host heartbeat proves the folded cron ran'),
  ('qnfo-paper-reviser', 'fleet_heartbeat', NULL, NULL, 'qnfo-research-exec', 'FOLDED into qnfo-research-exec (qnfo-paper-reviser/FOLDED); the host heartbeat proves the folded cron ran'),
  ('qnfo-autonomy-scorer', 'fleet_heartbeat', NULL, NULL, 'qnfo-autonomy-scorer', 'FOLDED into qnfo-observability but still heartbeats under its own name; kept on its own row so a stopped member shows as a breach'),
  ('personal-api', 'fleet_heartbeat', NULL, NULL, 'personal-api', 'cron worker writes fleet_heartbeat'),
  ('personal-companion', 'fleet_heartbeat', NULL, NULL, 'personal-companion', 'cron worker writes fleet_heartbeat'),
  ('q08-signal-engine', 'fleet_heartbeat', NULL, NULL, 'q08-signal-engine', 'cron worker writes fleet_heartbeat'),
  ('qnfo-ai-search', 'fleet_heartbeat', NULL, NULL, 'qnfo-ai-search', 'cron worker writes fleet_heartbeat'),
  ('qnfo-deploy-guard', 'fleet_heartbeat', NULL, NULL, 'qnfo-deploy-guard', 'cron worker writes fleet_heartbeat'),
  ('qnfo-gateway', 'fleet_heartbeat', NULL, NULL, 'qnfo-gateway', 'cron worker writes fleet_heartbeat'),
  ('qnfo-infra', 'fleet_heartbeat', NULL, NULL, 'qnfo-infra', 'cron worker writes fleet_heartbeat'),
  ('qnfo-intent-orchestrator', 'fleet_heartbeat', NULL, NULL, 'qnfo-intent-orchestrator', 'cron worker writes fleet_heartbeat'),
  ('qnfo-lifecycle', 'fleet_heartbeat', NULL, NULL, 'qnfo-lifecycle', 'cron worker writes fleet_heartbeat'),
  ('qnfo-subscribers', 'fleet_heartbeat', NULL, NULL, 'qnfo-subscribers', 'cron worker writes fleet_heartbeat'),
  ('radar-hub', 'fleet_heartbeat', NULL, NULL, 'radar-hub', 'cron worker writes fleet_heartbeat as well as cloud_ops_events job radar-hub'),
  ('research-intake', 'table', NULL, NULL, NULL, 'research_queue.created_at of the newest ACCEPT row (the DoD state)'),
  ('research-ground', 'cloud_ops_events', 'qnfo-research-exec', 'ground-fulltext', NULL, 'qnfo-research-exec logs each grounding pass as kind ground-fulltext'),
  ('research-draft', 'table', NULL, NULL, NULL, 'research_queue.claimed_at of the newest row in stage ensemble (the drafting stage)'),
  ('research-review', 'cloud_ops_events', 'qnfo-research-exec', 'review-triage', NULL, 'qnfo-research-exec logs each review verdict as kind review-triage'),
  ('research-publish', 'table', NULL, NULL, NULL, 'research_queue.published_at (the DoD state)'),
  ('code-task', 'table', NULL, NULL, NULL, 'code_tasks.merged_at (the DoD state)'),
  ('deploy', 'table', 'canonical-deploy', NULL, NULL, 'fleet_deploys.ts of the newest ok=1 deploy, and cloud_ops_events job canonical-deploy'),
  ('social-distribution', 'table', 'qnfo-social', NULL, NULL, 'social_media_posts.published_at, and cloud_ops_events job qnfo-social'),
  ('errata-correction', 'table', NULL, NULL, NULL, 'errata_actions.updated_at'),
  ('email-send', 'table', NULL, NULL, NULL, 'email_reply_queue.sent_at and outreach_learner_sends.sent_at'),
  ('issue-close', 'table', NULL, NULL, NULL, 'issue_lifecycle.ts of the newest close (to_status closed, resolved or wontfix)'),
  ('remediation-probe', 'table', NULL, NULL, NULL, 'remediation_verifications.verified_at'),
  ('remediation:evidence-persistence', 'table', NULL, NULL, NULL, 'remediation_evidence.verified_at (path B; path A is remediation-probe)'),
  ('qnfo-github-steward', 'table', NULL, NULL, NULL, 'github_steward_runs.finished_at'),
  ('qnfo-archive', 'none', NULL, NULL, NULL, 'owner worker RETIRED (qnfo-archive/RETIRED): no run can be observed; retire the contract'),
  ('qnfo-kaizen', 'none', NULL, NULL, NULL, 'owner worker RETIRED (qnfo-kaizen/RETIRED): no run can be observed; retire the contract'),
  ('qnfo-outreach', 'none', NULL, NULL, NULL, 'owner worker RETIRED (qnfo-outreach/RETIRED): no run can be observed; retire the contract'),
  ('qnfo-signal-loop', 'none', NULL, NULL, NULL, 'owner worker RETIRED (qnfo-signal-loop/RETIRED): no run can be observed; retire the contract'),
  ('qnfo-skill-sync', 'none', NULL, NULL, NULL, 'owner worker RETIRED (qnfo-skill-sync/RETIRED): no run can be observed; retire the contract'),
  ('qnfo-venue-radar', 'none', NULL, NULL, NULL, 'owner worker RETIRED (qnfo-venue-radar/RETIRED): no run can be observed; retire the contract');

DROP VIEW IF EXISTS v_process_last_run;
CREATE VIEW v_process_last_run AS
SELECT process, source, reason, direct_ts, alias_job_ts, heartbeat_ts, table_ts,
  NULLIF(MAX(COALESCE(direct_ts, ''), COALESCE(alias_job_ts, ''), COALESCE(heartbeat_ts, ''), COALESCE(table_ts, '')), '') AS last_ts
FROM (
  SELECT c.process, s.source, s.reason,
    strftime('%Y-%m-%dT%H:%M:%SZ', (SELECT MAX(e.ts) FROM cloud_ops_events e WHERE e.job = c.process)) AS direct_ts,
    strftime('%Y-%m-%dT%H:%M:%SZ', (SELECT MAX(e.ts) FROM cloud_ops_events e WHERE s.job IS NOT NULL AND e.job = s.job
      AND (s.kind IS NULL OR e.kind = s.kind))) AS alias_job_ts,
    strftime('%Y-%m-%dT%H:%M:%SZ', (SELECT MAX(h.ts) FROM fleet_heartbeat h WHERE h.ok = 1
      AND h.worker = COALESCE(s.worker, c.process))) AS heartbeat_ts,
    strftime('%Y-%m-%dT%H:%M:%SZ', CASE c.process
      WHEN 'research-intake' THEN (SELECT MAX(created_at) FROM research_queue WHERE decision = 'ACCEPT')
      WHEN 'research-draft' THEN (SELECT MAX(claimed_at) FROM research_queue WHERE stage = 'ensemble')
      WHEN 'research-publish' THEN (SELECT MAX(published_at) FROM research_queue)
      WHEN 'code-task' THEN (SELECT MAX(merged_at) FROM code_tasks)
      WHEN 'deploy' THEN (SELECT MAX(ts) FROM fleet_deploys WHERE ok = 1)
      WHEN 'social-distribution' THEN (SELECT MAX(published_at) FROM social_media_posts WHERE status = 'published')
      WHEN 'errata-correction' THEN (SELECT MAX(updated_at) FROM errata_actions)
      WHEN 'email-send' THEN (SELECT MAX(t) FROM (SELECT MAX(sent_at) AS t FROM email_reply_queue
                                                 UNION ALL SELECT MAX(sent_at) FROM outreach_learner_sends))
      WHEN 'issue-close' THEN (SELECT MAX(ts) FROM issue_lifecycle WHERE to_status IN ('closed', 'resolved', 'wontfix'))
      WHEN 'remediation-probe' THEN (SELECT MAX(verified_at) FROM remediation_verifications)
      WHEN 'remediation:evidence-persistence' THEN (SELECT MAX(verified_at) FROM remediation_evidence)
      WHEN 'qnfo-github-steward' THEN (SELECT MAX(finished_at) FROM github_steward_runs)
    END) AS table_ts
  FROM process_contracts c
  LEFT JOIN process_run_source s ON s.process = c.process
);

DROP VIEW IF EXISTS v_process_run_freshness;
CREATE VIEW v_process_run_freshness AS
SELECT
  c.process, c.owner, c.sla_min, p.cadence_min,
  r.last_ts AS last_event,
  CAST((julianday('now') - julianday(r.last_ts)) * 1440 AS INTEGER) AS minutes_since,
  CASE
    WHEN r.source = 'none' THEN 'not-applicable'
    WHEN r.last_ts IS NULL THEN 'never-observed'
    WHEN (julianday('now') - julianday(r.last_ts)) * 1440 > c.sla_min THEN 'breach'
    ELSE 'ok'
  END AS state,
  COALESCE(r.source, 'cloud_ops_events') AS run_source,
  r.reason AS run_source_reason
FROM process_contracts c
LEFT JOIN process_cadence p ON p.process = c.process
LEFT JOIN v_process_last_run r ON r.process = c.process;

DROP VIEW IF EXISTS v_sla_instrument_coverage;
CREATE VIEW v_sla_instrument_coverage AS
SELECT
  c.process, c.owner, c.sla_min,
  CASE
    WHEN c.process IN (SELECT process FROM v_sla_compliance) THEN 'step-duration'
    WHEN f.state = 'not-applicable' THEN 'none-recorded'
    WHEN f.last_event IS NOT NULL THEN 'run-freshness'
    ELSE 'none'
  END AS instrument,
  CASE
    WHEN c.process IN (SELECT process FROM v_sla_compliance) THEN 'v_sla_compliance: start and finish timestamps on the work item'
    WHEN f.state = 'not-applicable' THEN f.run_source_reason
    WHEN f.last_event IS NOT NULL THEN 'v_process_run_freshness via ' || f.run_source || ': minutes since the last run against sla_min'
    ELSE 'no run record: the owner must log a cloud_ops_events row with job = process or add a process_run_source row'
  END AS how
FROM process_contracts c
LEFT JOIN v_process_run_freshness f ON f.process = c.process;
