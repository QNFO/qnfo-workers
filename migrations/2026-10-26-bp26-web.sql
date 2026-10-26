-- BP26-WEB-1 (2026-10-26, charter pillars security, reach, core, autonomy; owner directive 2026-10-26; breach bp26_metrics_unmeasured trigger 14541, agent_issues 1000341, 1000345, 1000336, 1000356, 1000357).
-- WHAT WAS WRONG: eight BP26 metrics read UNMEASURED because their input is a public page: no D1 trigger can fetch one. They were "(to build)" in source_of_truth, so the practices they judge
-- (Article 50 labels, secure headers, no tracking, structured data, availability) had no number and the breach tickets could not file.
-- WHAT THIS DOES: names the producer. scripts/bp26_web.py collector collect_web (framework scripts/bp26_producers.py, run by the remediation-consumer job through scripts/loop_breaker_runner.py)
-- GETs the thirteen public HTML hosts and one live sample page per template from the GitHub runner, reads the social-post text from qnfo-audit and two worker sources from the checkout, and writes
-- each metric only when it measured it. Read at 19:57Z by a dry run before this file was written (every figure below is a measurement, not a target; all are off target, which is the point):
--   security_headers_pass 0.6154 (8 of 13 hosts): qnfo.org lacks frame protection, reading.q08.org lacks a referrer policy and frame protection, travel.q08.org lacks frame protection,
--     qwav.org lacks HSTS and frame protection, ask.qwav.tech lacks frame protection; the *.qnfo.org hosts pass through the zone transform rule, q08.org and me.q08.org pass on their own.
--   third_party_trackers 5: the Google tag (gtag.js) is loaded on qnfo.org, papers., archive., ideas.qnfo.org and ask.qwav.tech (a deliberate owner choice with a GA4 Data API reader: measured, not removed).
--   non_essential_cookies_set 4: _ga, _ga_LV7RHRVW6R, _ga_3VW2SVSSRH implied by those tags, and ipatent_ab (code state: given to human visitors only).
--   turnstile_on_public_forms 0.0 (0 of 13 data-collecting forms); structured_data_valid 0.7778 (7 of 9 templates; reading.q08.org has no JSON-LD at all);
--   ai_label_coverage 0.2 (only the q08 piece has the visible label and the JSON-LD flag; reading has the label without the flag, papers and qnfo.org have neither, 0 of 36 social posts carry a marker);
--   ai_interaction_disclosure 0.3333 (ipatent yes; the twin's first screen and the e-mail agent no).
-- slo_attainment_28d_min is withheld (None) until every host has 24 availability samples in bp26_probe_results (one per run, so about a day); it never reports a short history as a 28-day figure.
-- a11y_violations_serious stays unmeasured: axe-core needs a headless browser, and neither the consume job nor any workflow here has one; see the issue for the exact blocker.
-- Limits, stated in each metric's own note: a GET sees no JavaScript-set cookie, no Zaraz-injected tag and no JavaScript-rendered form; cookies given to human visitors only are read from the worker source.
-- Revert: the Rollback line restores the "(to build)" source text; the collector keeps writing only metrics tagged [BP26].
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET source_of_truth = CASE metric WHEN 'security_headers_pass' THEN 'runner-https header probe (to build) [BP26]' WHEN 'turnstile_on_public_forms' THEN 'form inventory (to build) [BP26]' WHEN 'non_essential_cookies_set' THEN 'crawler check (to build) [BP26]' WHEN 'third_party_trackers' THEN 'crawler check (to build) [BP26]' WHEN 'structured_data_valid' THEN 'CI validation step (to build) [BP26]' WHEN 'slo_attainment_28d_min' THEN 'host census + probes (to compute) [BP26]' WHEN 'ai_label_coverage' THEN 'template probe (to build) [BP26]' ELSE 'runtime probes (to build) [BP26]' END WHERE metric IN ('security_headers_pass', 'turnstile_on_public_forms', 'non_essential_cookies_set', 'third_party_trackers', 'structured_data_valid', 'slo_attainment_28d_min', 'ai_label_coverage', 'ai_interaction_disclosure');
-- spof-review: the collector runs in the remediation-consumer job (qnfo-cloud-ops dispatches it when idle 60 minutes; pushes and workflow_run also start it); a missed run delays these metrics only, and metric_staleness_breach_rec records the gap. It only reads.

UPDATE metric_registry SET source_of_truth = 'scripts/bp26_web.py collect_web: GET of each public HTML host from the remediation-consumer runner, HSTS (max-age >= 15552000), nosniff, referrer policy and frame protection judged on the first response; one row per host in bp26_probe_results [BP26]'
  WHERE metric = 'security_headers_pass';
UPDATE metric_registry SET source_of_truth = 'scripts/bp26_web.py collect_web: data-collecting forms found in the HTML of the public hosts and sample templates, protected when the page carries a Turnstile widget; JavaScript-rendered forms are invisible to the GET; one row per form in bp26_probe_results [BP26]'
  WHERE metric = 'turnstile_on_public_forms';
UPDATE metric_registry SET source_of_truth = 'scripts/bp26_web.py collect_web: distinct non-essential cookie names from Set-Cookie headers of the fetched public pages, plus the cookies a detected analytics tag implies and the cookies a worker source gives to human visitors only; one row per cookie in bp26_probe_results [BP26]'
  WHERE metric = 'non_essential_cookies_set';
UPDATE metric_registry SET source_of_truth = 'scripts/bp26_web.py collect_web: distinct (host, tracker) pairs from a curated tracker-domain list in the script, iframe, pixel and stylesheet tags and inline calls of the fetched public pages (Cloudflare Web Analytics not counted; Zaraz-injected tags invisible to a GET); one row per pair in bp26_probe_results [BP26]'
  WHERE metric = 'third_party_trackers';
UPDATE metric_registry SET source_of_truth = 'scripts/bp26_web.py collect_web: JSON-LD of nine page templates found live (q08, reading, papers, qnfo.org, ipatent, ideas) parsed and checked for a schema.org type, its required properties, no AI or invented author, and citation_* tags on a paper; one row per template in bp26_probe_results [BP26]'
  WHERE metric = 'structured_data_valid';
UPDATE metric_registry SET source_of_truth = 'scripts/bp26_web.py collect_web: availability row per public HTML host per run (2xx, 3xx, 401 or 403 under 5 s) in bp26_probe_results, subject avail:<host>; the lowest host share over the history held, withheld until every host has 24 samples [BP26]'
  WHERE metric = 'slo_attainment_28d_min';
UPDATE metric_registry SET source_of_truth = 'scripts/bp26_web.py collect_web: visible label and JSON-LD flag read live from a q08 piece, a reading piece, a paper page and the qnfo.org home, plus the marker in the text of the last 14 days of qnfo-audit social posts; one row per template in bp26_probe_results [BP26]'
  WHERE metric = 'ai_label_coverage';
UPDATE metric_registry SET source_of_truth = 'scripts/bp26_web.py collect_web: AI disclosure on the live first screen of ipatent and of the twin (me.q08.org), and in qnfo-email/worker.js by code state for the e-mail agent, which is not mailed; one row per surface in bp26_probe_results [BP26]'
  WHERE metric = 'ai_interaction_disclosure';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-rem-a8-web',
  'a metric that judges a public page is measured by fetching the page; a GET sees headers, HTML, JSON-LD, forms and tags but not JavaScript behaviour, so every note states what it cannot see, and an unreadable input is unknown, never a value',
  'BP26-WEB-1: scripts/bp26_web.py collect_web measures security_headers_pass, turnstile_on_public_forms, non_essential_cookies_set, third_party_trackers, structured_data_valid, slo_attainment_28d_min, ai_label_coverage and ai_interaction_disclosure; their source_of_truth names it',
  'dry run 2026-10-26T19:57Z against the live hosts: security_headers_pass 0.6154, third_party_trackers 5, non_essential_cookies_set 4, turnstile_on_public_forms 0.0, structured_data_valid 0.7778, ai_label_coverage 0.2, ai_interaction_disclosure 0.3333; slo_attainment_28d_min withheld (history)',
  'applied by migration; the metrics are written by the next remediation-consumer run after merge', 'eight metric_registry text columns; the collector only reads public pages and writes metrics tagged [BP26]',
  'the Rollback line', 'the Article 50, edge-security, tracking and structured-data practices have a measured state and file their own breach tickets',
  'bp26_metrics_unmeasured falls by seven; seven metrics read off target and file their tickets; slo_attainment_28d_min follows after 24 samples', 'none directly; the figures make the public gaps visible to the code loop and the owner',
  'offline: scripts/bp26_web.py --selftest and migrations/bp26-web.test.mjs; live: dry run against the thirteen hosts and nine templates'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BP26-WEB-1:%');
