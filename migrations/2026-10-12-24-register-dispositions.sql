-- REGISTER-DISPOSITIONS-1 (2026-10-12, pillar autonomy and cost; agent_issues 2148, 2294, 2295, 2296, 2297). The
-- IMPROVEMENT-TERMINAL-DISPOSITION issues are fleet_improvements rows that fi-executor re-scoped to agent_issues after their
-- in_progress SLA lapsed. Five of them point at task_dod_register rows that are still open and overdue, and source
-- "register" files a new improvement for an overdue row (66 so far, the newest 2026-10-12 04:02Z), so the loop only ends when
-- the register row itself is terminal. Each row below was read on 2026-10-12 and is given the disposition its evidence
-- supports, in the register's own statuses (done, cancelled):
--   328  Adelic Core Synthesis remediation: cancelled, superseded. The paper is quarantined (living-paper papers.status
--        quarantined, release_gate_pass 0, version 1.0.0). Its release is the paper re-gate of agent_issues 2037; the DoD's
--        deposit-registrar clauses are void under the owner directive of 2026-10-10 and belong to agent_issues 2278.
--   331  four gate candidates to the system prompt and kaizen: done for the kaizen half (kaizen_candidates
--        kc-redinventory, kc-buildgate-runtime, kc-dead-binding and kc-live-ahead-repo read status promoted, updated
--        2026-10-03T01:02Z). The prompt half names a prompt store on the owner's machine, which no fleet loop can write;
--        agent_issues 1686 (GUARDS-LOCAL-ONLY-1, closed) holds that disposition.
--   341  exposure and impact loop: done. impact_scores holds 124 scored DOIs (updated 2026-10-11); reach_idea_runs 36 runs that probe
--        reach surfaces and file issues (the newest 2026-10-11T23:01Z; reach_idea_outcomes 9, each measured when filed and
--        7 days later); outreach_learner_arms 6 arms that re-allocate sends; cost_impact_guard 16 rows of cost per impact
--        with the action taken.
--   345  liveness probe out of the client: cancelled, superseded by agent_issues 2075 (PROBE-SYSTEMWIDE-1). Liveness is
--        probed from the GitHub runner into worker_live_audit (114 rows probed 2026-10-12T05:36Z, every live service SYNC)
--        because a Worker cannot fetch its own account's hosts (issue 1190); source "probe" last filed an improvement on
--        2026-09-26, so the client task has filed nothing for 16 days. Whether the task still exists on the owner's
--        machine cannot be read from here and is not claimed.
--   2148 WORKER-SUBSTANTIVENESS-POLICY-1 asked for automatic flagging of idle workers and found the fleet's only usage
--        measure (cron fires) was the wrong one. worker_usage_daily now holds real request counts per script (Cloudflare
--        GraphQL, daily; 29 scripts on 2026-10-12, none under 3 requests in 7 days). What was missing is the automatic
--        flag: metric workers_idle_7d = live services with fewer than 3 requests in 7 days in the newest snapshot (or no
--        row in it), with a trigger whose lever is the retire procedure of OWNER-STANDING-GRANT-1. Refreshed hourly by
--        workers_idle_tick; reads NULL when the snapshot is older than 36 hours, so staleness is not read as "none idle".
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE task_dod_register SET status = (SELECT b.status FROM bak_20261012_register_rows b WHERE b.id = task_dod_register.id), evidence_pointer = (SELECT b.evidence_pointer FROM bak_20261012_register_rows b WHERE b.id = task_dod_register.id), updated_at = (SELECT b.updated_at FROM bak_20261012_register_rows b WHERE b.id = task_dod_register.id) WHERE id IN (SELECT id FROM bak_20261012_register_rows); DROP TRIGGER IF EXISTS workers_idle_tick; DELETE FROM analytics_metric_triggers WHERE metric_key = 'workers_idle_7d'; DELETE FROM metric_registry WHERE metric = 'workers_idle_7d'

CREATE TABLE IF NOT EXISTS bak_20261012_register_rows AS
SELECT *, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS backed_up_at FROM task_dod_register WHERE id IN (328, 331, 341, 345);

UPDATE task_dod_register SET status = 'cancelled', updated_at = datetime('now'),
  evidence_pointer = COALESCE(evidence_pointer, '') || ' | REGISTER-DISPOSITIONS-1 2026-10-12: superseded. The paper is quarantined (papers.status quarantined, release_gate_pass 0); its release is the paper re-gate of agent_issues 2037 and the DoD''s registrar clauses are void (owner directive 2026-10-10, agent_issues 2278)'
WHERE id = 328 AND status = 'open';

UPDATE task_dod_register SET status = 'done', updated_at = datetime('now'),
  evidence_pointer = COALESCE(evidence_pointer, '') || ' | REGISTER-DISPOSITIONS-1 2026-10-12: kaizen half done (kaizen_candidates kc-redinventory, kc-buildgate-runtime, kc-dead-binding, kc-live-ahead-repo status promoted 2026-10-03T01:02Z); the prompt half names a store on the owner''s machine and is dispositioned by agent_issues 1686 (GUARDS-LOCAL-ONLY-1)'
WHERE id = 331 AND status = 'open';

UPDATE task_dod_register SET status = 'done', updated_at = datetime('now'),
  evidence_pointer = COALESCE(evidence_pointer, '') || ' | REGISTER-DISPOSITIONS-1 2026-10-12: impact_scores 124 rows (updated 2026-10-11); reach_idea_runs 36 runs that probe reach surfaces and file issues (newest 2026-10-11T23:01Z; reach_idea_outcomes 9); outreach_learner_arms 6; cost_impact_guard 16 rows of cost per impact with the action taken'
WHERE id = 341 AND status = 'open';

UPDATE task_dod_register SET status = 'cancelled', updated_at = datetime('now'),
  evidence_pointer = COALESCE(evidence_pointer, '') || ' | REGISTER-DISPOSITIONS-1 2026-10-12: superseded by agent_issues 2075 (PROBE-SYSTEMWIDE-1): liveness is probed from the runner into worker_live_audit (114 rows, 2026-10-12T05:36Z); fleet_improvements source probe last filed 2026-09-26. The state of the task on the owner''s machine is not read from here'
WHERE id = 345 AND status = 'open';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('workers_idle_7d', 'operational', 'target', 'service_registry rows with state live that have fewer than 3 requests in 7 days in the newest worker_usage_daily snapshot, or no row in it; NULL when the snapshot is older than 36 hours or holds fewer than 10 scripts', 'qnfo-audit.worker_usage_daily (Cloudflare GraphQL per script, written daily by qnfo-fleet-control), service_registry (REGISTER-DISPOSITIONS-1, migrations/2026-10-12-24-register-dispositions.sql)', '0 of 28 live services on 2026-10-12 (29 scripts in the snapshot)', '0', 'qnfo-fleet-control', 'trigger gt 0', '1h', '> 0', '> 3', NULL, NULL, 'MEASURED', 'computed');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'workers_idle_7d', 'Idle worker: a live worker served fewer than 3 requests in 7 days', 'registry', 'gt', 0, 4,
  'Pillar cost (WORKER-SUBSTANTIVENESS-POLICY-1, OWNER-STANDING-GRANT-1). Read SELECT s.service, u.requests_7d, u.requests_24h FROM service_registry s LEFT JOIN worker_usage_daily u ON u.script = s.service AND u.day = (SELECT MAX(day) FROM worker_usage_daily) WHERE s.state = ''live'' AND COALESCE(u.requests_7d, 0) < 3. For each: run the dependency check (binders, URL callers, live readers of the tables only it writes); with no real dependent, retire it by PR (a RETIRED marker, removal from probes and registries, then cf-ops-actions delete-worker); with one, fold it or record the dependent on this issue. A worker that only runs on a cron and does its work there is not idle: give it a served route or record why on the issue. Done: workers_idle_7d = 0.',
  'qnfo-fleet-control', 'agent_issues', 72, 1, 'REGISTER-DISPOSITIONS-1 (migrations/2026-10-12-24-register-dispositions.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'workers_idle_7d');

CREATE TRIGGER IF NOT EXISTS workers_idle_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:%'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = (
      SELECT CASE WHEN snap.n >= 10 AND replace(substr(snap.ts, 1, 19), 'T', ' ') > datetime('now', '-36 hours')
               THEN CAST((SELECT COUNT(*) FROM service_registry s WHERE s.state = 'live'
                            AND NOT EXISTS (SELECT 1 FROM worker_usage_daily u WHERE u.script = s.service AND u.day = snap.day AND COALESCE(u.requests_7d, 0) >= 3)) AS TEXT) END
      FROM (SELECT MAX(day) AS day, COUNT(*) AS n, MAX(ts) AS ts FROM worker_usage_daily WHERE day = (SELECT MAX(day) FROM worker_usage_daily)) snap)
  WHERE metric = 'workers_idle_7d';
END;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01GMkRMxQsNprwDUX4J9zbji', 'an overdue register row is re-filed until the row itself is terminal; each row gets the status its evidence supports',
  'REGISTER-DISPOSITIONS-1: task_dod_register rows 328 and 345 cancelled as superseded (agent_issues 2037 and 2278; 2075), rows 331 and 341 done with their evidence; metric workers_idle_7d with its trigger',
  'read 2026-10-12: rows 328, 331, 341, 345 open and overdue since 2026-10-03; source register filed 66 improvements, the newest 04:02Z; worker_usage_daily holds 29 scripts, none under 3 requests in 7 days',
  'the register stops re-filing four rows; an idle live worker is flagged by a metric', 'four register rows (kept in bak_20261012_register_rows), one metric, one trigger',
  'the Rollback line', 'the fleet flags a live worker that serves nothing for a week',
  'workers_idle_7d = 0 within 2 h', NULL, 'D1 rows and one fleet_tick trigger, SQLite test against the live schema'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REGISTER-DISPOSITIONS-1:%');

INSERT INTO fleet_tick (source) VALUES ('migration:register-dispositions');
