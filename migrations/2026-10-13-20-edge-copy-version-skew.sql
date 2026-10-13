-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-edge-copy-version-skew'; DELETE FROM failure_modes WHERE fm_key = 'edge-copy-version-skew'; UPDATE agent_issues SET status = 'closed', close_channel = 'rollback-2026-10-13-20', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE instr(title, 'HUB-CACHE-VERSION-2:') = 1 AND status = 'open'
-- HUB-CACHE-VERSION-1 (2026-10-13, pillar reach). Failure mode zaraz-autoinject-worker-html read recurring at 07:39 UTC: the
-- runner-https probe of https://qnfo.org/ found no /cdn-cgi/zaraz/i.js, while twelve cache-busted renders at 07:50 UTC and the
-- 06:51 probe all carried it, and no gateway deploy landed in between. Root cause: the qnfo.org home is served from each colo's
-- cache (HUB-SWR-1) under a key with no version, stored for 24 h and served stale to the first visitor after it ages, so a colo
-- that is rarely hit kept the home page a pre-3.16.1 gateway rendered (no Zaraz script) until that visit rebuilt it. The stored
-- copy in the cache answer of 07:39:32 UTC was rebuilt that second.
-- qnfo-gateway 3.18.3 (same pull request) stamps each copy with its VERSION and rebuilds a copy from another version while the
-- request waits up to 2.5 s. idea-hub's ideas.qnfo.org home has the same design (IDEAS-SWR-1, a 7-day copy, no version) and
-- its file is claimed by the code loop until 09:31 UTC, so it is filed here as HUB-CACHE-VERSION-2 for the code loop.
-- The failure mode gets its own detector: the ideas.qnfo.org home carries the Zaraz script idea-hub 1.8.5 added (fm- contracts
-- stay active after a pass, DETECTOR-NEVER-PARKS-2); the qnfo.org half stays watched by fm-zaraz-autoinject-worker-html.
UPDATE failure_modes SET
  root_cause = root_cause || ' | 2026-10-13 07:39 UTC recurrence: the qnfo.org hub copy in a colo''s cache was built by a gateway older than 3.16.1 and served stale (version-blind HUB-SWR-1 key); see edge-copy-version-skew',
  remediation = remediation || ' | HUB-CACHE-VERSION-1: qnfo-gateway 3.18.3 rebuilds a hub copy built by another version before serving it'
WHERE fm_key = 'zaraz-autoinject-worker-html' AND instr(remediation, 'HUB-CACHE-VERSION-1') = 0;
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('edge-copy-version-skew', 'a page a worker keeps in the colo cache is served as rendered by an older version of that worker after a deploy',
  'stale-while-revalidate caches (qnfo-gateway HUB-SWR-1, 24 h; idea-hub IDEAS-SWR-1, 7 days) key the stored copy without the worker VERSION, so a deploy does not retire it and the first visitor per colo, or every visitor within the fresh window, gets the old render',
  'HUB-CACHE-VERSION-1: qnfo-gateway 3.18.3 stamps the copy with VERSION and rebuilds a copy from another version while the request waits up to 2.5 s; HUB-CACHE-VERSION-2 gives idea-hub the same rule',
  'the ideas.qnfo.org home carries /cdn-cgi/zaraz/i.js (added by idea-hub 1.8.5) on every runner-https read', 'fm-edge-copy-version-skew', '2026-10-13', NULL,
  'a deploy that changes the HTML of a page served from caches.default under a version-blind key', 'a probe or visitor sees a page without a change that every fresh render carries', 'qnfo.org and ideas.qnfo.org visitors after each deploy');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-edge-copy-version-skew', NULL, 'HUB-CACHE-VERSION-1', 'failure-mode detector',
  '{"url": "https://ideas.qnfo.org/", "status": 200, "contains": "/cdn-cgi/zaraz/i.js"}',
  'runner-https', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'HUB-CACHE-VERSION-2: idea-hub serves the ideas.qnfo.org home from a 7-day colo copy that no deploy retires',
  'Charter pillar: reach. Failure mode edge-copy-version-skew (migration 2026-10-13-20). ideasCached (IDEAS-SWR-1) stores the rendered ideas.qnfo.org home in caches.default under the key <origin><path>?__swr=1 with max-age 604800 and rebuilds it in the background only when older than IDEAS_FRESH_MS (15 min), so after a deploy every colo serves the previous version''s render to at least one visitor, and to every visitor within 15 minutes of its last rebuild. qnfo-gateway 3.18.3 fixed the same design for the qnfo.org home (HUB-CACHE-VERSION-1).' || char(10) ||
  'Edit (idea-hub/worker.js only): in ideasCached, set an X-Ideas-Version header to VERSION on the stored copy next to X-Ideas-Built; when a cached copy''s X-Ideas-Version differs from VERSION, run the build while the request waits up to 2500 ms (Promise.race with a timer) and serve the new render when it answers 200; otherwise serve the old copy, mark it X-Ideas-Cache stale-version and keep the build running with ctx.waitUntil. Never send X-Ideas-Version or X-Ideas-Built to visitors. Add the token HUB-CACHE-VERSION-2 in a comment there. Bump VERSION (patch).' || char(10) ||
  'Done when: the code probe below passes and fm-edge-copy-version-skew passes after the deploy.' || char(10) ||
  'code-task: repo=qnfo-workers path=idea-hub/worker.js' || char(10) ||
  'code-anchor: async function ideasCached(req, ctx, make) {' || char(10) ||
  'code-probe: {"paths": ["idea-hub/worker.js"], "contains": "HUB-CACHE-VERSION-2"}',
  'session_01Kddqwk5gQT5qSSHVKjT2EA', 'reach', 'medium', 'open',
  CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE instr(title, 'HUB-CACHE-VERSION-2:') = 1);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
 ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a page a worker caches for hours is retired by the deploy that changes it',
  'HUB-CACHE-VERSION-1: qnfo-gateway 3.18.3 rebuilds a hub copy built by another version before serving it; failure mode edge-copy-version-skew with a runner-https detector; HUB-CACHE-VERSION-2 filed for idea-hub',
  'remediation_verifications fm-zaraz-autoinject-worker-html: pass 06:51 UTC, missing-marker 07:39:32 UTC; 12 of 12 cache-busted renders at 07:50 UTC carried the script; the cache answer at 07:50 was stamped 07:39:32; no qnfo-gateway deploy between 06:52 and 07:39 (deployment_history)',
  'merged through the canonical path', 'the qnfo.org home: one request per colo per deploy waits for a build of up to 2.5 s', 'the Rollback line of this file and a revert of qnfo-gateway 3.18.3',
  'a deploy retires every colo copy of the qnfo.org home on its first visit', 'fm-zaraz-autoinject-worker-html passes on every run for 24 h after the 3.18.3 deploy; fm-edge-copy-version-skew passes at its first run', 'the GA4 script on every qnfo.org home view after a deploy',
  'https:qnfo.org home x12 with cache busting; d1:remediation_verifications, deployment_history; code:qnfo-gateway handleHubCached, idea-hub ideasCached');
