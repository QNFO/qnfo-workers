-- IDEAS-CHAT-SESSION-CAP-SHARE-1 (agent_issues 100048, pillar research; owner directive 2026-10-19 on the fleet's own loops).
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS chat_session_research_share_tick; DELETE FROM analytics_metric_triggers WHERE metric_key = 'chat_session_research_share_7d'; DELETE FROM metric_registry WHERE metric = 'chat_session_research_share_7d'
--
-- Why: idea-hub 1.10.12 (PR 2588) treats chat-session proposals as owner-authored, so they skip the research admission cap. Nothing
-- measured how much of research_queue they bring, so a bulk bypass of the cap would go unseen. Measured 2026-10-19 06:20Z: of 554
-- research_queue rows from proposals in 7 days, 551 are owner-corpus, 2 auto-scan, 1 auto-reentry and 0 chat-session (share 0).
-- What: one metric refreshed hourly on the fleet_tick heartbeat (the :00-:09 slot) and a trigger at 0.25 whose action is the
-- per-source daily bound named on the issue. Nothing is held or capped by this file.

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('chat_session_research_share_7d', 'operational', 'guard',
  'research_queue rows with source proposal created in the last 7 days whose idea_proposals.name is chat-session, divided by all such rows (0 when there are none)',
  'qnfo-audit.research_queue joined to idea_proposals (IDEAS-CHAT-SESSION-CAP-SHARE-1, migrations/2026-10-19-chat-session-cap-share.sql)',
  '0 on 2026-10-19 06:20Z (0 of 554)', '<= 0.25: chat-session ideas, which skip the admission cap, stay a minority of what enters research',
  'idea-hub', 'qnfo-fleet-control', 'hourly', '> 0.15', '> 0.25', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS chat_session_research_share_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:%'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COALESCE(ROUND(1.0 * SUM(CASE WHEN p.name = 'chat-session' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 3), 0)
      FROM research_queue r JOIN idea_proposals p ON p.id = CAST(r.source_id AS INTEGER)
      WHERE r.source = 'proposal' AND r.created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS TEXT)
  WHERE metric = 'chat_session_research_share_7d';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'chat_session_research_share_7d', 'Chat-session ideas, which skip the research admission cap, are more than a quarter of research intake', 'registry', 'gt', 0.25, 3,
  'Pillar research (IDEAS-CHAT-SESSION-CAP-SHARE-1, agent_issues 100048). Add a per-source daily bound (a rate, not a hold) for name = chat-session in idea-hub enqueueAccepted and record it in control_registry row research-admission-cap. Done: chat_session_research_share_7d <= 0.25 at two refreshes.' || char(10) || 'code-task: repo=qnfo-workers path=idea-hub/worker.js' || char(10) || 'code-anchor: async function enqueueAccepted(env, id, idea, score, now, direct) {',
  'idea-hub', 'agent_issues', 24, 1, 'IDEAS-CHAT-SESSION-CAP-SHARE-1 (migrations/2026-10-19-chat-session-cap-share.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'chat_session_research_share_7d');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01X81kqL6v2eFPmyL3JayV1i', 'a producer that bypasses a cap needs its share measured before a bound is worth its code',
  'IDEAS-CHAT-SESSION-CAP-SHARE-1: metric chat_session_research_share_7d refreshed hourly on fleet_tick, trigger gt 0.25 with the per-source bound as its code-task',
  'measured 2026-10-19 06:20Z: 0 of 554 research_queue rows from proposals in 7 days came from chat-session',
  'migration merged', 'one metric_registry row, one analytics_metric_triggers row, one fleet_tick trigger that writes only metric_registry', 'the Rollback header',
  'a bulk bypass of the research admission cap files its own issue', 'chat_session_research_share_7d reads 0 after the apply and the trigger stays quiet', 'none',
  'research_queue, idea_proposals, metric_registry, analytics_metric_triggers'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'IDEAS-CHAT-SESSION-CAP-SHARE-1:') = 1);

INSERT INTO fleet_tick (source) VALUES ('migration:chat-session-cap-share');
