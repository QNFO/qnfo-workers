-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: revert scripts/code-task-publish.py and its tests through a PR; UPDATE remediation_contracts SET status='paused' WHERE class='fm-publisher-claim-trigger-count'; retain append-only decision history.
-- PUBLISH-CLAIM-TRIGGER-COUNT-1, charter pillar autonomy.
-- Run 40226834304 changed ct_s6cvwtytdlavkm from ready_to_publish to publishing at
-- 2026-10-25T19:36:44Z, then reported "claimed by another run". The live AFTER UPDATE
-- trigger owner_queue_live_metric_ct_upd also writes metric_registry on a status change.
-- SQLite total_changes reproduces D1 meta.changes=2 for the one successful claim.
-- A stale publishing->publishing retry does not fire that status-change trigger:
-- the existing 30-minute retry remains unchanged. No production task is reset here.
-- Only registry rows are added; no schema, route, binding, cron or gate changes.
-- Orchestrator owner subsequently dispatched normal publisher run 40229385116
-- on unchanged main at 20:08:52Z. Task ct_s6cvwtytdlavkm reached published/done,
-- attempts=0, last_error=NULL at 20:10:49.988Z, with PR #4201. This proves the
-- existing stale alternate, not the new initial-claim fix or all of US02.

INSERT OR IGNORE INTO failure_modes
 (fm_key,failure_mode,root_cause,remediation,detector,probe_class,first_seen,issue_id,trigger_condition,symptom,blast_radius)
VALUES
 ('publisher-claim-trigger-count',
  'publisher takes a ready task but falsely reports losing its atomic claim',
  'claim compared D1 trigger-inclusive meta.changes with exactly one; the owner queue metric trigger makes a successful status transition count twice',
  'Use UPDATE RETURNING id from the unchanged compare-and-set predicate, so only the run whose statement matched receives a row; preserve stale recovery and fail loudly on uncertain transport',
  'fm-publisher-claim-trigger-count code-read plus real SQLite live-trigger and two-connection race regression',
  'fm-publisher-claim-trigger-count','2026-10-25T19:36:44Z',1000111,
  'a ready_to_publish task is claimed while owner_queue_live_metric_ct_upd updates its metric',
  'run 40226834304 reported ct_s6cvwtytdlavkm claimed by another run after its own publishing transition; no PR was produced',
  'all initial code-task publisher claims with status-change trigger side effects');

INSERT OR IGNORE INTO remediation_contracts
 (class,precondition,action,verify_probe,verify_transport,max_attempts,escalate_to,expected_cadence_h,status,next_due_at)
VALUES
 ('fm-publisher-claim-trigger-count','PUBLISH-CLAIM-TRIGGER-COUNT-1','failure-mode detector',
  '{"paths":["scripts/code-task-publish.py"],"contains":"updated_at < ?)) RETURNING id"}',
  'code-read',3,'qnfo-code-orchestrator',1,'active',datetime('now'));

INSERT INTO decision_log
 (actor,assumption,action,evidence,outcome,blast_radius,rollback_path,capability_gain,predicted_outcome,reach_gain,surfaces_tested)
SELECT
 'copilot-session-bea766ec-8ef0-413c-b717-2dd0dc69f079',
 'D1 change counts include triggered metric writes and cannot identify the winner by equality with one',
 'PUBLISH-CLAIM-TRIGGER-COUNT-1: identify the winner using the atomic UPDATE RETURNING row, not a later shared status read or loose success assumption',
 'Run 40226834304; exact live owner_queue_live_metric_ct_upd SQL supplied by the orchestrator owner; real SQLite reproduces count 2 and the old false loser',
 'Offline ready, stale, same-second loser, two-connection race, no-trigger, missing/ineligible and uncertain-write fixtures pass; production task closure remains independently required',
 'Publisher claim result only; unchanged status predicate, 30-minute stale retry, path policy, verifier, publish and merge gates',
 'Revert the script and tests through a PR; pause the new detector using the migration header',
 'Verified patches progress on their initial successful claim despite metric trigger writes, without granting a losing run ownership',
 'Exactly one contender publishes a ready or stale task; normal supported retry recovers the representative task without manual status mutation',
 'none directly',
 'GitHub run/main source; existing UPDATE RETURNING prior art in remediation_consumer.py; real SQLite trigger and concurrent connections; D1 REST result/timeout fixtures'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action,'PUBLISH-CLAIM-TRIGGER-COUNT-1:')=1);

INSERT INTO session_records
 (session_id,wbs_code,agent_name,summary,decisions_made,files_changed,commits,infrastructure_changes,handoff_notes,
  execution_ratio,total_tasks,completed_tasks,started_at,completed_at,created_at)
SELECT
 'bea766ec-8ef0-413c-b717-2dd0dc69f079','autonomy/US02-publisher-recovery','GitHub Copilot',
 'Reproduced the initial publisher false-loser with the exact live status-change trigger and implemented atomic UPDATE RETURNING ownership; preserved stale recovery, path policy and canonical gates.',
 'Use the directly matched row from the atomic statement, not trigger-inclusive counts or a later shared status read. Do not reset production tasks or claim the full roadmap from publisher green.',
 'scripts/code-task-publish.py; scripts/code-task-publish.test.mjs; scripts/code_task_publish_claim_test.py; migrations/2026-10-25-publisher-claim-trigger-count.sql',
 'PR #4203; initial source commit 3618242a',
 'Existing registry rows only; no Worker, credential, binding, cron, route or schema change.',
 'Nine targeted SQLite/D1 fixtures pass. Orchestrator owner reports normal unchanged-main publisher run 40229385116 recovered ct_s6cvwtytdlavkm at 20:10:49.988Z into PR #4201 with attempts=0 and no error. Issue1000111 and representative live defect closure remain with session6acb4f9a-36a5-4df9-a29c-b948c4fb0da6; underlying100448 is separate. This record does not assert all US02 or roadmap completion.',
 1.0,1,1,'2026-10-25T19:56:20Z',strftime('%Y-%m-%dT%H:%M:%SZ','now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM session_records WHERE session_id='bea766ec-8ef0-413c-b717-2dd0dc69f079');
