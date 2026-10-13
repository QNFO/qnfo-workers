-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(DISTINCT post_id) FROM social_engagements WHERE platform = ''buffer'' AND metric <> ''auth_status'' AND collected_at >= date(''now'', ''-2 days'')) >= 1 THEN ''1'' ELSE ''0'' END AS observed' WHERE class = 'fm-collector-without-credential'
-- BUFFER-METRICS-NULL-1 (2026-10-13, pillar reach, agent_issues 2374, failure mode collector-without-credential).
-- The failure mode was a collector that reported ok while it never read Buffer, because the Buffer token lived in another
-- worker. qnfo-social 0.13.0 (BUFFER-POST-STATS-1) now reads Buffer with its own token: the 07:01 UTC run made 11 requests
-- with 0 errors over 270 sent posts on Mastodon, LinkedIn and X, and Buffer answered metrics null for every one
-- (shape metrics_null 90 per channel). The credential defect is fixed; the empty data is Buffer's answer, a different cause.
-- (1) The detector now judges its own failure mode: a credentialed engagement run with Buffer requests and no errors in two
--     days. It read 1 at 07:05 UTC.
-- (2) A second path for per-post numbers: Mastodon serves a status's favourites, reblogs and replies counts on its public API
--     with no credential (GET https://<instance>/api/v1/statuses/<id>). Filed for the code loop as MASTODON-PUBLIC-STATS-1.
--     LinkedIn and X have no credential-free equivalent; their posts stay counted as unmeasured.
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''social-run'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 days'') AND json_extract(meta, ''$.op'') = ''engagement'' AND json_extract(meta, ''$.result.buffer.requests'') > 0 AND json_extract(meta, ''$.result.buffer.errors'') = 0) THEN ''1'' ELSE ''0'' END AS observed',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'fm-collector-without-credential';
UPDATE failure_modes SET
  detector = 'fm-collector-without-credential: an engagement run in the last 2 days read Buffer with its own credential (requests > 0, errors 0)',
  remediation = remediation || ' | 2026-10-13 BUFFER-METRICS-NULL-1: qnfo-social 0.13.0 reads Buffer with its own token (07:01 UTC: 11 requests, 0 errors); Buffer returns metrics null for all 270 posts, a separate cause handled by MASTODON-PUBLIC-STATS-1'
WHERE fm_key = 'collector-without-credential';
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'MASTODON-PUBLIC-STATS-1: per-post Mastodon engagement from the public status API while Buffer returns no metrics',
  'Charter pillar: reach. Parent agent_issues 2374 BUFFER-POST-STATS-1. qnfo-social 0.13.0 reads Buffer with its own token; the 2026-10-13 07:01 UTC engagement run made 11 requests with 0 errors over 270 sent posts and Buffer answered metrics null for every post (cloud_ops_events social-run meta shape.metrics_null 90 per channel), so social_engagements holds no buffer metric row and the dashboard cannot rank posts by engagement. Mastodon publishes each status''s favourites_count, reblogs_count and replies_count on its public API without a credential.' || char(10) ||
  'Edit (qnfo-social/worker.js only): in the Buffer statistics collector, after bufferStatsPlan for the mastodon channel, for each sent node whose metrics are null and whose externalLink matches https://<host>/@<user>/<numeric id> (or the URL stored in social_media_posts.url), GET https://<host>/api/v1/statuses/<id> (no credential, an 8 s timeout, at most 30 statuses a run, newest first) and write eng(''buffer'', <buffer post id>, ''favourites''|''reblogs''|''replies'', <count>, ''mastodon public api'') for each count; a non-200 answer counts in out.errors and skips that post. Add the token MASTODON-PUBLIC-STATS-1 in a comment there and count the reads in out.mastodon_public (requests, rows, errors). Bump VERSION (minor: a new data source).' || char(10) ||
  'Done when: social_engagements has a platform buffer row with metric favourites, reblogs or replies collected within 2 days.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-social/worker.js' || char(10) ||
  'code-anchor:     const plan = bufferStatsPlan(nodes, svc, now, known);' || char(10) ||
  'code-probe: {"paths": ["qnfo-social/worker.js"], "contains": "MASTODON-PUBLIC-STATS-1"}',
  'session_01Kddqwk5gQT5qSSHVKjT2EA', 'reach', 'medium', 'open',
  CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'MASTODON-PUBLIC-STATS-1:%');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a detector judges the failure mode it is named for; a source that answers null is a different cause with its own lever',
   'BUFFER-METRICS-NULL-1: fm-collector-without-credential reads credentialed Buffer runs; MASTODON-PUBLIC-STATS-1 filed for the code loop as a credential-free second source of per-post numbers',
   'cloud_ops_events social-run 2026-10-13T07:01:20Z: buffer requests 11, errors 0, posts 270, rows 0, shape.metrics_null 90 per channel; the new probe reads 1 at 07:05 UTC',
   'merged through the canonical path', 'the failure mode reads absent; Mastodon posts gain engagement rows once the code task lands', 'the Rollback line of this file; close MASTODON-PUBLIC-STATS-1 as superseded',
   'per-post reach numbers without a paid analytics plan', 'fm-collector-without-credential passes within an hour of the merge; a buffer favourites/reblogs/replies row within 2 days of the code task merging', 'Mastodon post engagement measured', 'd1:cloud_ops_events, social_engagements, social_media_posts; code:qnfo-social bufferStats');
