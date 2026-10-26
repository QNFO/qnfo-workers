-- RUNTIME-LIVENESS-GAP-2 (2026-10-26, pillars autonomy and reach; follow-up to migrations/2026-10-26-runtime-liveness-gap.sql, metric runtime_verified_share_24h).
-- Measured after the first file went live (remediation_verifications 17:00:28Z, then four timed reads from this host at 17:30Z): two of its fifteen contracts probe endpoints of the ideas hub that
-- are slow or hang. https://ideas.qnfo.org/rss.xml answered in 3.0 s, 3.1 s, 4.4 s and then did not answer within 40 s (one read in four); https://ideas.qnfo.org/api/sessions takes 2.8 s to 4.4 s
-- every time; the home page (0.1 s to 2.7 s) and the sitemap (0.1 s) are fine. The runner reads with a 20 s timeout, and both contracts failed their first run with error:TimeoutError. A probe of a
-- flaky endpoint files RUNTIME-PROBE-FAIL-1 after three straight failures, which would be noise about a real defect that has no owner yet.
--   * the two contracts are superseded (they are replaced, not hidden): rt-page-ideas-feed and rt-page-ideas-sessions;
--   * the defect becomes an issue with a doer path and its own closing probe: IDEAS-HUB-SLOW-RSS-1 carries a runtime-probe line on the feed (max 10 s), which D1 turns into a runner-https contract at birth;
--     the planner (source session*) may plan a change in idea-hub; the contract closes the issue only when the feed answers fast and consistently;
--   * two contracts on fast, reader-facing files replace them: the sitemaps of q08.org and qwav.org (200 in 0.4 s, `<urlset`, both read 2026-10-26 17:31Z); the share arithmetic of the first file
--     (21 contracts, about 11 %) is unchanged because the count stays 21.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:rollback RUNTIME-LIVENESS-GAP-2' WHERE class IN ('rt-page-q08-sitemap', 'rt-page-qwav-sitemap'); UPDATE remediation_contracts SET status = 'active', last_verdict = NULL, next_due_at = datetime('now') WHERE class IN ('rt-page-ideas-feed', 'rt-page-ideas-sessions') AND module = 'runtime-liveness-v1'; UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'IDEAS-HUB-SLOW-RSS-1:%' AND status = 'open'

UPDATE remediation_contracts
   SET status = 'superseded', last_verdict = 'superseded:RUNTIME-LIVENESS-GAP-2 (the endpoint takes 3 to 5 s and hangs one read in four; replaced by a sitemap probe, the defect is issue IDEAS-HUB-SLOW-RSS-1)', last_attempt_at = datetime('now')
 WHERE class IN ('rt-page-ideas-feed', 'rt-page-ideas-sessions') AND module = 'runtime-liveness-v1' AND status IN ('active', 'holding', 'escalated', 'monitoring');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, next_due_at) VALUES
 ('rt-page-q08-sitemap', NULL, 'standing liveness: q08.org/sitemap.xml serves a sitemap (crawlers)', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://q08.org/sitemap.xml", "status": 200, "contains": "<urlset", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-page-qwav-sitemap', NULL, 'standing liveness: qwav.org/sitemap.xml serves a sitemap (crawlers and Scholar)', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://qwav.org/sitemap.xml", "status": 200, "contains": "<urlset", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now'));

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'IDEAS-HUB-SLOW-RSS-1: ideas.qnfo.org/rss.xml hangs one read in four and /api/sessions takes 3 to 5 s',
  'Charter pillar: reach. Measured 2026-10-26 17:30Z from the fleet host (4 timed GETs each, the runner User-Agent, Cache-Control no-cache): https://ideas.qnfo.org/rss.xml 3.0 s, 3.1 s, 4.4 s and one read that did not answer within 40 s; https://ideas.qnfo.org/api/sessions 2.8 s, 2.9 s, 3.5 s, 4.4 s; the home page 0.1 s to 2.7 s and /sitemap.xml 0.1 s. The remediation consumer reads with a 20 s timeout and its first run of both probes ended error:TimeoutError (remediation_verifications 2026-10-26 17:00:28Z). A feed reader or crawler that gives up after 10 to 20 s misses the feed in one fetch of four; the feed is 28 KB and the sessions list 24 KB, so the time is spent building them, not sending them.' || char(10) ||
  'Where to look: the idea-hub worker builds both responses on request (idea-hub/worker.js, the rss and sessions routes); the home page and sitemap are cached, these two are not. A short cache (stale-while-revalidate) on both, or a prebuilt copy refreshed by the hub''s own tick, would make them as fast as the home page.' || char(10) ||
  'Definition of done: the feed answers 200 with <rss in 10 s on every runner read for 24 hours (the runtime-probe below is the closing probe and runs hourly from outside the account).' || char(10) ||
  'runtime-probe: {"url": "https://ideas.qnfo.org/rss.xml", "status": 200, "contains": "<rss", "max_ms": 10000}',
  'session-infra-breach-remediation', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title LIKE 'IDEAS-HUB-SLOW-RSS-1:%' AND a.status = 'open');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-infra-breach-remediation',
  'a standing liveness probe must not sit on an endpoint that is itself flaky, because three straight timeouts would file noise instead of a diagnosis; the flakiness becomes its own issue with a closing probe',
  'RUNTIME-LIVENESS-GAP-2: rt-page-ideas-feed and rt-page-ideas-sessions superseded, sitemap probes for q08.org and qwav.org added, issue IDEAS-HUB-SLOW-RSS-1 filed with a runtime-probe on the feed',
  'remediation_verifications 17:00:28Z: both ideas probes error:TimeoutError; timed reads 17:30Z: rss.xml 3.0 s, 3.1 s, 4.4 s, one read over 40 s; api/sessions 2.8 s to 4.4 s; q08.org/sitemap.xml and qwav.org/sitemap.xml 200 in 0.4 s with <urlset',
  'applied by migration', 'two contracts superseded, two inserted, one issue; no worker change', 'the Rollback line',
  'the share contracts watch stable endpoints; a slow feed is a tracked defect', 'runtime_verified_share_24h unchanged in expectation (21 contracts either way); the feed issue gets a contract at birth and closes when the feed is fast for 24 hours', 'reach: the idea feed stays readable', 'https GET of both sitemaps and the two ideas endpoints, four timed reads each'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'RUNTIME-LIVENESS-GAP-2:%');
