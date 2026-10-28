-- METRIC-CAUSE-AT-REGISTRATION-1 (2026-10-28, charter pillar: autonomy; FLEET-TRIAGE-1 audit, PR 5120).
-- WHAT WAS FOUND (read-only, live qnfo-audit and https://fleet.qnfo.org/api/triage, 2026-10-28 16:36Z): v_breach_by_cause reads 32 breaching metrics under cause 'unmapped'
--   (6 on 2026-10-26, 30 on 2026-10-28 morning), the largest single cause of the 85 breaches. Their metric families (compliance, privacy, edge security, cost pace, roadmap)
--   were registered after the cause map was written. metric_registry has BEFORE INSERT triggers that require source_of_truth, disposition_actor and a canonical refresh_cadence, and none that
--   requires a metric_breach_cause row, so a new metric can breach with no recorded root cause and nothing notices until fm-breach-unmapped fails.
-- WHAT THIS FILE DOES: files one issue for a doer (no row is mapped by guess: BREACH-ONE-MEANING-1 says the breach doctor and the registrants own the mapping). No DELETE, DROP, trigger, cap or threshold changes.
-- PREDICTION: when the doer's fix lands, /api/triage reports an empty unmapped list within one metric-refresh cycle, and a newly registered metric arrives with a mapped cause. Falsifier: unmapped non-empty 24 hours after the fix merges.
-- spof-review: none added.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: SELECT 'No-op: the issue and its lifecycle rows are append-only; a cancellation needs a separately recorded disposition.';

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'METRIC-CAUSE-AT-REGISTRATION-1: 32 breaching metrics have no root cause because registering a metric does not require a metric_breach_cause row',
  'Charter pillar: autonomy. Found by the FLEET-TRIAGE-1 audit (GET https://fleet.qnfo.org/api/triage lists the unmapped metrics by name).' || char(10) ||
  'Root cause: metric_registry has insert triggers for source_of_truth, disposition_actor and a canonical cadence, but nothing requires a metric_breach_cause row, so each new metric family (compliance, privacy, edge security, cost pace, roadmap placement) breaches with no recorded cause. The unmapped bucket grew from 6 to 32 in two days.' || char(10) ||
  'Doer: qnfo-fleet-control (breach doctor). Step 1: map each listed metric to the cause that holds (spend, structure, publishing, issue-backlog, owner-routing, heartbeat, code-loop, breach-doctor or measurement) with evidence in metric_breach_cause.note, or fix the metric; do not guess. Step 2: make registration carry its cause (a registrant migration inserts the mapping in the same file, enforced by a check in the deploy gate or a breach-doctor rule that files the mapping task at birth), and add the failure_modes row and fm- detector for it.' || char(10) ||
  'Definition of done: /api/triage reports unmapped as an empty list and a metric registered after the fix is mapped at birth. Do not close on code merge alone.' || char(10) ||
  'runtime-probe: {"url": "https://fleet.qnfo.org/api/triage", "status": 200, "contains": "\"unmapped\": []"}',
  'session-fleet-triage', 'reliability', 'high', 'open', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'METRIC-CAUSE-AT-REGISTRATION-1:%');
