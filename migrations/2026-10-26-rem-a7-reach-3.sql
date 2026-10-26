-- REM-A7-REACH-3 (2026-10-26, charter pillar reach; agent_issues 2924 and 100190; follow-up to migrations/2026-10-26-rem-a7-reach.sql and -2). The Search Console ingestion of qnfo-fleet-dashboard 1.72.0 (PR 4830, merged 19:15:02Z, live 19:16Z)
-- made its first real read at 19:31:09Z and Google answered, in cloud_ops_events gsc-ingest-2026-10-23 (status denied): "searchAnalytics 403 PERMISSION_DENIED: Google Search Console API has not been used in project 254457120993 before or it is
-- disabled." So the first thing between the fleet and its Search Console data is not the user grant the owner card named, it is the API itself, in the Google Cloud project of the fleet's service account; the user grant (Search Console > Users) is the second
-- step. Both are the owner's own Google account and project (IDENTITY-BOUND); the card now names them in order, with the project number and where the service account address is shown (sa_email at fleet.qnfo.org/api/ga4, added in 1.72.0).
-- Two directive lines are also retired so the code loop does not rebuild what is on main: agent_issues 2924 (the ingestion shipped) and 100190 (the verdict change shipped, PR 4830) carried a code-task line; it becomes code-task-done, which no loop reads.
-- Nothing is sent, enabled or changed on any worker or Google property by this file.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = replace(description, 'code-task-done (qnfo-fleet-dashboard 1.72.0, PR 4830): repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js', 'code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js') WHERE id IN (2924, 100190)

UPDATE human_actions
   SET action = 'Step 1, the one the fleet''s first live read named (2026-10-26 19:31Z, Google''s own words: "Google Search Console API has not been used in project 254457120993 before or it is disabled"): in the Google Cloud console enable the Google Search Console API for project 254457120993, the project of the fleet''s Google service account (APIs and services > Library > Google Search Console API > Enable, or open https://console.cloud.google.com/apis/library/searchconsole.googleapis.com?project=254457120993). Step 2: in Search Console (the qnfo.org property) open Settings > Users and permissions > Add user, paste the service account address shown as sa_email at https://fleet.qnfo.org/api/ga4 (it is the user you already added to the Google Analytics property) and choose Restricted. The fleet reads once a day, at its first tick after midnight UTC, so the first stored row follows the next midnight; until then https://fleet.qnfo.org/api/ga4 (gsc_runs) shows each daily attempt as denied with Google''s own message. The step is done when SELECT COUNT(*) FROM reach_signals WHERE source = ''gsc'' reads 1 or more (the contract of agent_issues 2924 measures exactly that and closes the issue). Bing Webmaster is a separate, later step and is not part of this card.',
       updated_at = datetime('now')
 WHERE slug = 'gsc-service-account-user' AND instr(action, 'the entry that ends in iam.gserviceaccount.com') > 0;

UPDATE agent_issues
   SET description = replace(description, 'code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js', 'code-task-done (qnfo-fleet-dashboard 1.72.0, PR 4830): repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js') || char(10) || CASE id
     WHEN 2924 THEN 'REM-A7-F1 2026-10-26 19:47Z (live): qnfo-fleet-dashboard 1.72.0 gscIngest read for the first time at 19:31:09Z (cloud_ops_events gsc-ingest-2026-10-23, status denied): Google answered 403 PERMISSION_DENIED, "Google Search Console API has not been used in project 254457120993 before or it is disabled". The ingestion runs end to end up to Google''s refusal; what is missing is the owner''s: card gsc-service-account-user now names step 1 (enable the API in that project) and step 2 (add the service account as a user of the property). The code task of this issue is done (PR 4830). Bing is not built: it needs an API key only the owner can mint.'
     ELSE 'REM-A7-F1 2026-10-26 19:47Z: the verdict change is on main and live (qnfo-fleet-dashboard 1.72.0, PR 4830, merged 19:15:02Z): a stopped channel with utm human clicks or referred visits is judged again. The next daily scorecard (02:00Z) writes the shares; the contract of this issue (bluesky share at least 0.5) closes it. The code-task line is retired so the code loop does not rebuild it.' END,
       updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id IN (2924, 100190) AND status = 'open' AND instr(description, 'code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js') > 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a7-f1:gsc-live-read',
  'a live refusal that names its cause is the instruction for the owner step; the card should carry Google''s own words and the order of the steps, and a shipped change must not stay a standing task for the code loop',
  'human_actions gsc-service-account-user: action rewritten (step 1 enable the Search Console API in project 254457120993, step 2 add the service account as a user, where its address is shown); agent_issues 2924 and 100190: code-task line retired as code-task-done, dated notes appended (migrations/2026-10-26-rem-a7-reach-3.sql)',
  'cloud_ops_events gsc-ingest-2026-10-23 at 2026-10-26T19:31:09Z, status denied: searchAnalytics 403 PERMISSION_DENIED: Google Search Console API has not been used in project 254457120993 before or it is disabled; GET https://fleet.qnfo.org/api/ga4 at 1.72.0 shows sa_email and gsc_runs; PR 4830 merged 19:15:02Z, canonical-deploy success 19:16:40Z, migration_runs ok for 2026-10-26-rem-a7-attention-release.sql',
  'pending post-apply measurement',
  'one human_actions row and two agent_issues descriptions; no worker, secret, send path or Google setting changes',
  'the Rollback line restores the code-task line; the card text is replaced by the earlier two-step text from migrations/2026-10-26-rem-a7-reach.sql if needed; decision_log stays append-only',
  'the owner step is stated with the exact project, the exact setting and the exact page to read the address from',
  'after the owner does both steps, the first gsc-ingest ledger row after the next midnight reads ok and reach_signals source gsc has rows; issue 2924 closes through its contract',
  NULL,
  'migrations/rem-a7-reach-3.test.mjs; live read of cloud_ops_events gsc-ingest-2026-10-23; live GET /api/ga4'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'rem-a7-f1:gsc-live-read');
