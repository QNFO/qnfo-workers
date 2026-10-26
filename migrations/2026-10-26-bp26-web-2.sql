-- BP26-WEB-2 (2026-10-26, charter pillar reach; follow-up to migrations/2026-10-26-bp26-web.sql, applied 20:06:13Z; agent_issues 1000339 BP26-WCAG22-1, roll-up 1000363).
-- WHAT WAS LEFT: a11y_violations_serious stayed "CI axe run (to build)". axe-core needs a headless browser and an npm install; neither the consume job nor any workflow in this repository has one, and adding one
-- is a .github change outside the code loop's merge scope. Waiting for that left the metric with no number and issue 1000339 with no measured state.
-- WHAT THIS DOES: scripts/bp26_web.py collect_web now writes a static LOWER BOUND of the serious and critical axe-core violations on the fetched public pages: html-has-lang, document-title, image-alt,
-- meta-viewport, form-field label, button-name and link-name, the rules a regular expression decides with few false positives (each flagged field below was read by hand). Read at 20:15Z by a dry run:
-- 4 (ai.qnfo.org one unlabelled select, me.q08.org three unlabelled selects and fields; the other thirteen pages show none by these rules). A count above zero proves the target (0) missed, so it is written;
-- a count of zero proves nothing without axe-core (colour contrast, ARIA validity and focus order are not seen), so zero writes NOTHING: the metric can breach but never pass until an axe run exists.
-- The same follow-up fixes the code-state cookie check for ipatent_ab: after qnfo-ipatent 3.19.1 (PR 4897, merged 20:06:59Z) the worker still READS the retired cookie and sends a deletion header, and the
-- check now matches only the code that sets it with a value, so the cookie is not counted once the deploy lands.
-- Revert: the Rollback line restores the "(to build)" text; the collector then writes nothing for this metric only if the script is reverted too.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET source_of_truth = 'CI axe run (to build) [BP26]' WHERE metric = 'a11y_violations_serious';
-- spof-review: no new component; the collector runs where it already runs (the remediation-consumer job) and only reads public pages.

UPDATE metric_registry SET source_of_truth = 'scripts/bp26_web.py collect_web: a static lower bound of serious and critical axe-core violations (html-has-lang, document-title, image-alt, meta-viewport, form-field label, button-name, link-name) on the fetched public pages; written only when above zero, because zero cannot be certified without an axe-core run; one row per page in bp26_probe_results [BP26]'
  WHERE metric = 'a11y_violations_serious';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-rem-a8-web',
  'a metric that can only be proven bad by a static pass is written when the static pass proves it bad and left unknown when it finds nothing: a lower bound may breach, it may never certify',
  'BP26-WEB-2: a11y_violations_serious is measured as a static lower bound of axe-core (written only above zero); the ipatent_ab code-state cookie check matches the code that sets the cookie, not its reader',
  'dry run 2026-10-26T20:15Z against the live hosts: 4 violations on 15 pages (ai.qnfo.org label x1, me.q08.org label x3), each read by hand; main qnfo-ipatent/worker.js 3.19.1 still contains ipatent_ab= in its cookie reader',
  'applied by migration; the metric is written by the next remediation-consumer run after merge', 'one metric_registry text column; the collector only reads public pages',
  'the Rollback line', 'the accessibility practice has a measured state and files its breach ticket before an axe run exists',
  'bp26_metrics_unmeasured falls by one; a11y_violations_serious reads 4 (off target) and files its ticket', 'none directly; the finding names the unlabelled controls',
  'offline: scripts/bp26_web.py --selftest and migrations/bp26-web-2.test.mjs; live: dry run against the fifteen pages'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BP26-WEB-2:%');
