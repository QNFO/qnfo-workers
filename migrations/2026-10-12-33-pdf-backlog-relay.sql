-- PDF-BACKLOG-RELAY-1 (2026-10-12, agent_issues 2410, charter pillar reach; qnfo-pdf 1.3.0, qnfo-fleet-control 0.19.1). The */10 cron
-- written for qnfo-pdf by the canonical deploy (schedules PUT 200 at 12:02:36Z and 12:04:27Z) never invoked scheduled(): the account
-- telemetry shows zero scheduled events for qnfo-pdf at 12:10, 12:20, 12:30 and 12:40Z while every other */10 worker (qnfo-cloud-ops,
-- qnfo-code-orchestrator) fired, with identical settings (usage model, observability, placement) and 33 cron triggers in the account.
-- SCHOLAR-PDF-ALL-1 therefore had one critical path. This file records the single point of failure with its tested alternate, the
-- failure mode, the capability, and the decision; the alternate is qnfo-fleet-control's */20 tick calling POST /backlog/tick through
-- a service binding whenever no pdf-backlog event has landed for 25 minutes (ledger: cloud_ops_events kind pdf-backlog-relay).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM spof_registry WHERE component = 'qnfo-pdf cron */10 (SCHOLAR-PDF-ALL-1)'; DELETE FROM failure_modes WHERE fm_key = 'cron-trigger-inert-after-create'; DELETE FROM capability_ledger WHERE capability = 'pdf-backlog-second-path'; DELETE FROM blocker_redteam WHERE target = 'issue:2410' AND claim LIKE 'the qnfo-pdf */10 cron%'

INSERT OR REPLACE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('qnfo-pdf cron */10 (SCHOLAR-PDF-ALL-1)', 'every public paper gets a PDF and citation_pdf_url; without the tick no PDF is rendered for the 476 public papers without one and scholar_pdf_backlog is never written',
  'qnfo-fleet-control */20 tick -> SVC_QNFO_PDF POST /backlog/tick (PDF-BACKLOG-RELAY-1), idle while a pdf-backlog event is under 25 minutes old; GET /pdf/<slug> renders on demand for one paper',
  '2026-10-12T12:50:00Z',
  'schedules GET shows cron */10 (created 12:02:36Z, modified 12:04:27Z); account telemetry: zero scheduled events for qnfo-pdf at 12:10, 12:20, 12:30, 12:40Z while qnfo-cloud-ops and qnfo-code-orchestrator fired each tick; settings identical to qnfo-cloud-ops; fleet_cron_triggers 33',
  2410, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('cron-trigger-inert-after-create', 'a newly created Cron Trigger never invokes the worker although the schedule reads back from the API',
  'unknown at the Cloudflare side (schedule stored, worker has the scheduled handler, settings identical to firing workers); the fleet had one path to the tick',
  'PDF-BACKLOG-RELAY-1: a second worker relays the tick through a service binding when the ledger shows no run for 25 minutes; fm-pdf-backlog-stalled files when neither path writes the metric for 2 hours',
  'metric_registry.scholar_pdf_backlog last_refreshed within 2 hours (fm-pdf-backlog-stalled); cloud_ops_events pdf-backlog rows name their source (cron or relay)', 'fm-pdf-backlog-stalled', '2026-10-12', 2410,
  'a worker gets its first cron trigger from the canonical deploy and no scheduled invocation follows within two ticks',
  'schedules GET shows the cron; telemetry shows no scheduled events; the worker-written metric stays NULL',
  'every loop that is a single cron on a single worker');

INSERT INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
SELECT 'pdf-backlog-second-path', 'PDF-BACKLOG-RELAY-1 (qnfo-pdf 1.3.0 POST /backlog/tick, qnfo-fleet-control 0.19.1 pdfBacklogRelay, migrations/2026-10-12-33-pdf-backlog-relay.sql)',
       'SVC_QNFO_PDF service binding installed by the canonical deploy; qnfo-fleet-control */20 cron', 'first relayed batch writes cloud_ops_events pdf-backlog (source relay) and pdf-backlog-relay',
       strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL, 'the Scholar PDF backlog drains even when the qnfo-pdf cron does not fire'
WHERE NOT EXISTS (SELECT 1 FROM capability_ledger WHERE capability = 'pdf-backlog-second-path');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, ts)
SELECT 'issue:2410', 'the qnfo-pdf */10 cron fires once the canonical deploy has written the schedule',
  'schedules GET: cron */10 created 12:02:36Z modified 12:04:27Z; settings compared with qnfo-cloud-ops (same usage model, observability, placement); account telemetry query $workers.eventType = scheduled for qnfo-pdf over 12:00-12:45Z: 0 events, while qnfo-cloud-ops and qnfo-code-orchestrator fired at 12:10, 12:20, 12:30, 12:40; fleet_cron_triggers 33; a schedules re-PUT through the session connector was refused (no access to the specified resource)',
  'confirmed-with-evidence', 'the cron is inert for a reason the API does not show; PDF-BACKLOG-RELAY-1 adds the second path and the redeploy re-writes the schedule',
  'session_01Kddqwk5gQT5qSSHVKjT2EA', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'issue:2410' AND claim LIKE 'the qnfo-pdf */10 cron%');
