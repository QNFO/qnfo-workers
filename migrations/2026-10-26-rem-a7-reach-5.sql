-- REM-A7-REACH-5 (2026-10-26, charter pillar reach; agent_issues 2924). The owner marked human_actions 183 gsc-service-account-user done at 19:31:04Z ("done via dashboard by owner (fleet.qnfo.org, emailed code)"). The fleet then read Search Console twice:
-- 19:31:09Z (cloud_ops_events gsc-ingest-2026-10-23@denied-1931Z) and, after REM-A7-REACH-4 freed the day for a second read, 20:16:15Z (gsc-ingest-2026-10-23): both denied with Google's own words,
-- "searchAnalytics 403 PERMISSION_DENIED: Google Search Console API has not been used in project 254457120993 before or it is disabled". Forty-five minutes after the click the API is still not enabled in that project
-- (a propagation delay is minutes), so the card's closing condition (a reach_signals source gsc row) is not met and the one step that is left is still open. The card is reopened with that evidence in front of its steps;
-- nothing is overridden: the owner's resolution text is replaced only by the fleet's reopen note, and he can resolve it again. Issue 2924 stays open with its measuring contract either way.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE human_actions SET status = 'resolved', resolved_at = '2026-10-26 19:31:04', resolution = 'done via dashboard by owner (fleet.qnfo.org, emailed code)', action = substr(action, instr(action, 'Step 1, the one the fleet')), updated_at = datetime('now') WHERE slug = 'gsc-service-account-user' AND instr(action, 'REOPENED 2026-10-26 20:2') = 1

UPDATE human_actions
   SET status = 'open', resolved_at = NULL, resolution = NULL,
       action = 'REOPENED 2026-10-26 20:20Z by the fleet because its closing condition is not met, not by a decision: this card was marked done at 19:31:04Z, but the fleet''s Search Console reads at 19:31:09Z and 20:16:15Z were both refused with "Google Search Console API has not been used in project 254457120993 before or it is disabled". So the API is not enabled in that project yet. Google names the project by number: in the Google Cloud console it is the project whose id is the part of the service account address between @ and .iam.gserviceaccount.com (open its dashboard and read Project number: it must read 254457120993; an API enabled in another project does not help). Then continue with the steps below. ' || action,
       updated_at = datetime('now')
 WHERE slug = 'gsc-service-account-user' AND status = 'resolved' AND instr(COALESCE(resolution, ''), 'done via dashboard by owner') = 1
   AND instr(action, 'REOPENED 2026-10-26') = 0
   AND EXISTS (SELECT 1 FROM cloud_ops_events WHERE id = 'gsc-ingest-2026-10-23' AND kind = 'gsc-ingest' AND status = 'denied' AND ts > '2026-10-26T19:31:05Z');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a7-f1:gsc-card-reopen',
  'a card whose step the owner marked done but whose closing condition is measurably unmet is an open step, not a finished one; the fleet reports the measurement and leaves the decision to the owner, who can resolve it again',
  'human_actions gsc-service-account-user reopened with the 19:31:09Z and 20:16:15Z refusals in front of its steps (migrations/2026-10-26-rem-a7-reach-5.sql)',
  'human_actions 183 resolved 2026-10-26 19:31:04Z by the owner through the dashboard; cloud_ops_events gsc-ingest-2026-10-23@denied-1931Z (19:31:09Z) and gsc-ingest-2026-10-23 (20:16:15Z) both denied: Google Search Console API has not been used in project 254457120993 before or it is disabled; reach_signals source gsc has 0 rows',
  'pending: the next daily read after the owner enables the API and adds the user',
  'one human_actions row; no worker, secret, send path or Google setting changes',
  'the Rollback line resolves the card again with the owner''s original resolution text and removes the reopen note',
  'the owner sees that his step has not taken effect yet and which project to check',
  'once the API is enabled in project 254457120993 and the service account is a user of the property, the next read writes gsc-ingest ok and reach_signals source gsc rows; issue 2924 closes through its contract',
  NULL,
  'migrations/rem-a7-reach-5.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'rem-a7-f1:gsc-card-reopen');
