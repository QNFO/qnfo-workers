-- CF-CHANGELOG-LOOP-1 (2026-10-03, pillar: autonomy; RM-CAPABILITY-PRODUCT-LOOP-1, #1675). Idempotent.
--
-- The problem. docs/CLOUDFLARE-CAPABILITY-INTEGRATION.md (2026-09-07) designed "Loop 1": a watcher that reads what Cloudflare
-- ships and folds it into cloudflare_capability_catalog. The catalog table and its 54 rows exist, but no worker ever fetched
-- the changelog (grep of every worker.js for developers.cloudflare.com/changelog: 0 hits on 2026-10-03). The catalog only
-- knew what a session typed into it, so the fleet learned of Cloudflare changes when the owner said so. Measured on the
-- same day: Cloudflare's changelog announced AI Search GA with usage billing from 2026-11-01 (the fleet runs qnfo-ai-search,
-- and the catalog still read it as "proposed"), Artifacts billing from 2026-10-14, the Basin rename of Pipelines / R2 Data
-- Catalog / R2 SQL (the catalog holds that row as "rejected"), and Sandbox SDK 1.0 (also "rejected").
--
-- The fix is in qnfo-fleet-control 0.4.112 (cfChangelogIfStale, inside the existing hourly tick; no new worker, cron or model
-- call, because fleet_budget is over its worker, D1 and AI-spend caps). Once a day it reads the changelog RSS (a streamed
-- read capped at 1.5 MB of an ~8 MB, 1,300-item file), classifies each item from the last 45 days against the catalog and the
-- service registry, and: files at most 2 deduped agent_issues a day for billing / deprecation / breaking changes to a product
-- the fleet uses; reopens at most 2 rejected catalog rows a day when their product launches or goes GA (status back to
-- proposed, the change appended to when_to_choose); adds at most 5 not_considered rows a day for products the catalog does not
-- know. GET /cf-changelog shows the runs and every classified item.
--
-- This migration creates the two ledger tables (the code creates them too) and registers the two measures the loop is graded by,
-- each with a trigger:
--   cf_changelog_audit_age_h         hours since the last good run (target <= 26; trigger > 48): the loop itself has stopped.
--   cf_changelog_open_proposals_14d  catalog rows the loop reopened or added that are still undecided after 14 days (target
--                                    <= 5; trigger > 5): finding features is not the goal, deciding on them is.
-- Guard: the loop adds to open_agent_issues, which is itself in breach, so issues are capped at 2 a day and only for a
-- deadline on a product the fleet uses. issue_wontfix_share_7d and remediation_latest_pass_pct_7d stay the guards.
--
-- Rollback: DELETE the two metric_registry rows and the two analytics_metric_triggers rows (notes = 'CF-CHANGELOG-LOOP-1
-- 2026-10-03'); DROP TABLE cf_changelog_items, cf_changelog_runs. Catalog rows the loop added carry source = 'cf-changelog';
-- rows it reopened carry " | cf-changelog <date>: ... (was rejected; re-evaluate)" at the end of when_to_choose and the
-- previous status 'rejected' in cf_changelog_items.prev_status.

CREATE TABLE IF NOT EXISTS cf_changelog_items (guid TEXT PRIMARY KEY, seen_at TEXT, pub TEXT, title TEXT, link TEXT, products TEXT, klass TEXT, slug TEXT, action TEXT, issue_id INTEGER, prev_status TEXT);
CREATE TABLE IF NOT EXISTS cf_changelog_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, status TEXT, items INTEGER, fresh INTEGER, deadlines INTEGER, new_rows INTEGER, reopened INTEGER, filed INTEGER, bytes INTEGER, note TEXT);

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('cf_changelog_audit_age_h', 'system', 'leading', 'hours since the last good (ok or partial) CF-CHANGELOG-LOOP-1 run; n/a before the first run. The loop runs once a day inside the hourly qnfo-fleet-control tick', 'qnfo-audit.cf_changelog_runs; GET https://qnfo-fleet-control.q08.workers.dev/cf-changelog', 'n/a (first run 2026-10-03)', '<= 26', 'qnfo-fleet-control', 'its own trigger: read cf_changelog_runs for the failure class and fix it', 'hourly', '> 30', '> 48', 'MEASURED', NULL),
 ('cf_changelog_open_proposals_14d', 'system', 'lagging', 'count of catalog slugs that CF-CHANGELOG-LOOP-1 reopened (rejected -> proposed) or added (not_considered) more than 14 days ago and that are still not_considered or proposed in cloudflare_capability_catalog; n/a never. Finding a Cloudflare feature is not the goal, deciding on it is', 'qnfo-audit.cf_changelog_items x cloudflare_capability_catalog', '0 (2026-10-03, before the first run)', '<= 5', 'qnfo-kaizen', 'its own trigger: decide each listed row (approve with a metric_ref and an owner, or reject with the reason)', 'hourly', '> 5', '> 10', 'MEASURED', NULL);

WITH v(metric_key, title, source_table, operator, threshold, priority, action, owner, cooldown) AS (VALUES
 ('cf_changelog_audit_age_h', 'Autonomy gap: the Cloudflare changelog audit has not run for over 48 hours', 'registry', 'gt', 48, 6, 'Pillar autonomy. The fleet is no longer learning what Cloudflare ships. Run: SELECT ts, status, items, fresh, bytes, note FROM cf_changelog_runs ORDER BY id DESC LIMIT 5, and GET https://qnfo-fleet-control.q08.workers.dev/cf-changelog. status fetch-failed: the feed URL (https://developers.cloudflare.com/changelog/rss/index.xml) answered with an error or timed out; confirm with a fetch, and if the URL moved, correct CFC_FEED in qnfo-fleet-control/worker.js. status parse-empty: the feed format changed (it carries <item>, <title>, <link>, <guid>, <pubDate>, <product>, <category>, <description>); fix cfcParseItems and add the new shape to cf-changelog.fixture.xml. No row at all: the hourly tick is not reaching cfChangelogIfStale; check LOOP-WATCH-1 (GET /loops) and the worker error log.', 'qnfo-fleet-control', 72),
 ('cf_changelog_open_proposals_14d', 'Autonomy gap: Cloudflare features the loop found are undecided after 14 days', 'registry', 'gt', 5, 5, 'Pillar autonomy. The changelog loop reopens rejected catalog rows and adds new ones, and nothing else decides them. Run: SELECT i.slug, c.product, c.status, i.klass, i.action, i.pub, i.title, i.link FROM cf_changelog_items i JOIN cloudflare_capability_catalog c ON c.slug = i.slug WHERE i.action IN (''reopened'',''new-row'') AND c.status IN (''not_considered'',''proposed'') AND replace(substr(i.seen_at,1,19),''T'','' '') < datetime(''now'',''-14 days'') ORDER BY i.seen_at. For each row, read the changelog link and the fleet metric it could move (fleet_budget breaches, metric_registry), then either set status to approved with metric_ref and a linked_issue that names the work, or rejected with the reason appended to when_to_choose. Adopt nothing that adds a worker, cron or paid model call while a fleet_budget cap is breached; the decision is then proposed-and-blocked, written down.', 'qnfo-kaizen', 168))
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, v.source_table, v.operator, v.threshold, v.priority, v.action || ' Definition of done: the metric is back inside its threshold in metric_registry; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).', v.owner, 'agent_issues', v.cooldown, 1, 'CF-CHANGELOG-LOOP-1 2026-10-03'
FROM v WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);
