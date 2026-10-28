-- BP26-PROMPT-INJECTION-1 egress review (agent_issues 4455) and BP26-NO-TRACKING-1 follow-ups (agent_issues 4421), 2026-10-28, charter pillar security.
-- WHAT: agent_tool_calls_outside_allowlist read 44 on 2026-10-28 12:23Z, all of it 44 fetches to 13 hosts no egress row permits (bp26_probe_results subjects egress-host:*; no tool name was outside the list).
--   Reviewed one by one. Each is a plain GET of a public page by research, job-search or agent-readiness work; none is a write endpoint, a paste site, a webhook or a request catcher.
--   Allowed (one row each, note says why): isitagentready.com (20, agent-readiness checker), academictransfer.com (9, Dutch academic job board), linkedin.com (3, job postings read by qnfo-jobsearch),
--   sre.google (2, reference book), ubc.ca, tilburguniversity.edu, kit.edu, sciforum.net (research sources), open-meteo.com, worldtimeapi.org (read-only public APIs),
--   cloudflarestatus.com (vendor status), agentskills.io (agent-skills specification), example.com (IANA reserved, serves a fixed page and records nothing).
--   NOT allowed and not to be: any host that accepts data from the caller (webhook.site, requestbin, pastebin, ngrok, interact.sh, discord or slack webhooks). A suffix row covers subdomains, so only
--   institutions' own registrable domains are listed, never a shared host (no github.io, pages.dev, herokuapp.com).
--   Limit: an allowed host can still be a read-only exfil channel through its query string; the allow-list is a review control, the stronger controls are the send policy and the tool split in docs/BP26-PROMPT-INJECTION.md.
-- ALSO: the Google tag (G-LV7RHRVW6R) remains served by idea-hub and qnfo-gateway, whose files another session holds today; two code-task issues hand the one-line removal to the code loop.
-- Revert: the Rollback line removes the rows this file added (matched on the BP26-EGRESS-REVIEW-2026-10-28 note prefix) and the two issues.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM agent_tool_allowlist WHERE kind = 'egress' AND note LIKE 'BP26-EGRESS-REVIEW-2026-10-28:%'; DELETE FROM agent_issues WHERE title LIKE 'BP26-NO-TRACKING-1 (gtag removal):%' AND source = 'session';
-- BACKUP: agent_tool_allowlist
-- spof-review: read only by scripts/bp26_agentsec.py; a missing row leaves the metric above 0, never blocks a fetch (the list is measured, not enforced).

INSERT OR IGNORE INTO agent_tool_allowlist (surface, kind, pattern, note) VALUES
  ('*', 'egress', 'isitagentready.com', 'BP26-EGRESS-REVIEW-2026-10-28: agent-readiness checker, GET of a report page; 20 fetches in 7 days'),
  ('*', 'egress', 'academictransfer.com', 'BP26-EGRESS-REVIEW-2026-10-28: Dutch academic job board read by jobsearch; 9 fetches'),
  ('*', 'egress', 'linkedin.com', 'BP26-EGRESS-REVIEW-2026-10-28: public job postings read by jobsearch (GET only, no sign-in); 3 fetches'),
  ('*', 'egress', 'sre.google', 'BP26-EGRESS-REVIEW-2026-10-28: Google SRE books, reference reading; 2 fetches'),
  ('*', 'egress', 'ubc.ca', 'BP26-EGRESS-REVIEW-2026-10-28: University of British Columbia research pages (psych.ubc.ca subdomains); 2 fetches'),
  ('*', 'egress', 'tilburguniversity.edu', 'BP26-EGRESS-REVIEW-2026-10-28: university research page; 1 fetch'),
  ('*', 'egress', 'kit.edu', 'BP26-EGRESS-REVIEW-2026-10-28: Karlsruhe Institute of Technology research page (tkm.kit.edu); 1 fetch'),
  ('*', 'egress', 'sciforum.net', 'BP26-EGRESS-REVIEW-2026-10-28: MDPI Sciforum conference papers, scholarly; 1 fetch'),
  ('*', 'egress', 'open-meteo.com', 'BP26-EGRESS-REVIEW-2026-10-28: keyless read-only weather API; 1 fetch'),
  ('*', 'egress', 'worldtimeapi.org', 'BP26-EGRESS-REVIEW-2026-10-28: keyless read-only time API; 1 fetch'),
  ('*', 'egress', 'cloudflarestatus.com', 'BP26-EGRESS-REVIEW-2026-10-28: Cloudflare vendor status page; 1 fetch'),
  ('*', 'egress', 'agentskills.io', 'BP26-EGRESS-REVIEW-2026-10-28: agent-skills specification documentation; 1 fetch'),
  ('*', 'egress', 'example.com', 'BP26-EGRESS-REVIEW-2026-10-28: IANA reserved test domain, fixed page, records nothing; 1 fetch');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'BP26-NO-TRACKING-1 (gtag removal): idea-hub still loads the Google tag G-LV7RHRVW6R on every page',
 'Charter pillar: security. ePrivacy and GDPR: gtag sets _ga cookies, which are not strictly necessary; metrics non_essential_cookies_set and third_party_trackers count it. Doer: qnfo-code-orchestrator. Lever: in idea-hub/worker.js set GA4_TAG to the empty string (QDS_GA = GA4_TAG is the only use) and bump VERSION (minor); Cloudflare Web Analytics is cookieless and already measures pageviews. Keep deployed-current.worker.js identical. Live check after deploy: curl https://ideas.qnfo.org/ has no googletagmanager.' || char(10) ||
 'code-task: repo=qnfo-workers path=idea-hub/worker.js' || char(10) ||
 'code-anchor: var GA4_MEASUREMENT_ID = "G-LV7RHRVW6R";' || char(10) ||
 'runtime-probe: {"url": "https://ideas.qnfo.org/", "status": 200, "absent": "googletagmanager.com"}',
 'session', 'security', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'BP26-NO-TRACKING-1 (gtag removal): idea-hub%' AND status NOT IN ('closed', 'resolved'));

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'BP26-NO-TRACKING-1 (gtag removal): qnfo-gateway still loads the Google tag G-LV7RHRVW6R on qnfo.org and papers.qnfo.org',
 'Charter pillar: security. Same defect as the idea-hub issue. Doer: qnfo-code-orchestrator. Lever: in qnfo-gateway/worker.js set GA4_TAG to the empty string (QDS_GA and LP_GA read it), change the two assertions in qnfo-gateway/work-with-me.test.mjs (lines about the GA4 tag) to assert its absence, bump VERSION (patch), mirror deployed-current.worker.js. The file may be under a live claim of another session: take the claim first. Live check: curl https://papers.qnfo.org/ and https://qnfo.org/ have no googletagmanager.' || char(10) ||
 'code-task: repo=qnfo-workers path=qnfo-gateway/worker.js' || char(10) ||
 'code-anchor: var GA4_MEASUREMENT_ID = "G-LV7RHRVW6R";' || char(10) ||
 'runtime-probe: {"url": "https://qnfo.org/", "status": 200, "absent": "googletagmanager.com"}',
 'session', 'security', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'BP26-NO-TRACKING-1 (gtag removal): qnfo-gateway%' AND status NOT IN ('closed', 'resolved'));
