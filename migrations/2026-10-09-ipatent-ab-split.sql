-- AB-SPLIT-V2-1 (IPATENT-UI-OVERHAUL-1 step 2, agent_issues 2049, 2026-10-09, pillar reach), qnfo-ipatent 3.15.0.
-- Measured 2026-10-09T05:00Z in ipatent-db.page_views: on 2026-10-08, the first full day of the ?v=2 guided flow, "/" had
-- 72 human views (direct 64, internal 5, search 3) and "/?v=2" had 1 crawler view and 0 human views. Nothing links to
-- ?v=2, so the planned 7-day comparison of drafts per human visit could never measure the variant. qnfo-ipatent 3.15.0
-- assigns each human GET / without a v parameter to an arm once (cookie ipatent_ab, arm number only, 30 days): arm 2 is
-- redirected to ?v=2, arm 1 keeps the default page. The arm-2 share is this ops_config row (read through the AUDIT
-- binding, cached 5 minutes); '0' turns the split off without a deploy, and a missing row or failed read also means 0.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = '0', updated_at = datetime('now') WHERE key = 'ipatent_v2_share'; -- the control_registry and decision_log rows are records and stay.

INSERT OR IGNORE INTO ops_config (key, value, note, updated_at) VALUES ('ipatent_v2_share', '0.5',
  'AB-SPLIT-V2-1 (qnfo-ipatent 3.15.0, agent_issues 2049, migrations/2026-10-09-ipatent-ab-split.sql): share 0..1 of new human visitors to ipatent.qnfo.org/ sent to the ?v=2 guided flow; 0 = off (everyone gets the default page). Read through AUDIT, cached 5 minutes per isolate.',
  datetime('now'));

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('ipatent_v2_share', 'qnfo-audit.ops_config ipatent_v2_share read by qnfo-ipatent abShare (3.15.0)', 'kill-switch',
  'a guided-flow variant that drafts worse than the default page reaching half of new visitors', 0, 'keep', 'applied',
  'env IPATENT_V2_SHARE overrides the row; a missing row, missing binding or failed read serves the default page (share 0)',
  '2026-10-09T05:00:00Z',
  'qnfo-ipatent/ab-split.test.mjs: env override clamps, ops_config read cached 5 minutes, a failed read is 0, ops_config 0 turns the split off, crawlers/HEAD/explicit ?v= never split',
  2049);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain)
VALUES ('session_01TGuUNEXBuLDqF6hZfSaMwU (scheduled backlog worker)',
  'The 7-day variant comparison of IPATENT-UI-OVERHAUL-1 step 2 needs human traffic on ?v=2; nothing links there, so a random sticky split is the only way to measure it.',
  'qnfo-ipatent 3.15.0 assigns new human visitors to / to the default page or the ?v=2 guided flow at ops_config ipatent_v2_share (0.5).',
  'ipatent-db.page_views 2026-10-08: "/" 72 human views, "/?v=2" 0 human views (1 crawler).',
  'both variants receive human visits; page_views "/" vs "/?v=2" and usage_counts draft vs draft-v2 become comparable',
  'new human visitors to ipatent.qnfo.org/ only; crawlers, HEAD and explicit ?v= links unchanged; drafting, privacy and routes unchanged',
  'UPDATE ops_config SET value = ''0'' WHERE key = ''ipatent_v2_share'' (no deploy; at most 5 minutes to take effect)',
  'iPatent can run a measured A/B test of a page variant on live human traffic, switchable from D1');
