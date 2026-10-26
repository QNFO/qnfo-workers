-- SWEEP-DATA-FIXES-A-1 (2026-10-26, charter pillar autonomy; data fixes bundle A: agent_issues 99916, 100388, 100405, 1000100, 1000102, 1000186).
-- Every premise below was re-read from qnfo-audit (SELECT only) and from origin/main on 2026-10-26 between 09:20Z and 10:00Z before it was applied.
-- Each UPDATE of a text column saves its before-state in a bak_20261026_sweep_a_* table created in this file, guards on the live pre-state (so a second
-- apply and an already-fixed row change nothing), and the Rollback line restores from the backup tables. Nothing is deleted by this file.
--
-- 3003 (METRIC-TRIGGER-6050 cadence_overdue_over_120m) is NOT in this file. Its continuity-snapshot window error (cadence_sla interval 120 for a producer that runs when the newest ok
--   snapshot is 20 hours old) was fixed while this bundle was prepared: migrations/2026-10-26-cadence-sla-continuity.sql (CADENCE-SLA-CONTINUITY-1, merged in a8259559, interval 1260,
--   cadence_sla.updated_at 2026-10-26T09:31:02Z), so v_cadence_overdue reads continuity-snapshot over_sla 0. A second UPDATE of the same row would only rewrite its text. The ticket
--   stays open on the two real producers (reading.q08.org, papers.qnfo.org), which are not data fixes.
-- 99916 (METRIC-TRIGGER-2934 session_dependent_issues_open). The metric counts open issues whose description contains the literal session-task colon; the ticket's own description
--   (and analytics_metric_triggers 2934 action, which every refile copies) quotes its example query with that literal, so the ticket counts itself and the metric
--   can never reach 0 while it is open (19 on 2026-10-26, 99916 one of them). The quoted query is rewritten to the equivalent '%session-task' || ':%', which matches the same
--   rows and no longer contains the marker. The other 18 are real or are other issues' own text and are not touched.
-- 100388 (METRIC-TRIGGER-1204 cf_changelog_open_proposals_14d, 7 against 5). The trigger's own action says to set each undecided row to approved with a metric_ref and a
--   linked_issue, or to rejected with the reason appended to when_to_choose. Seven rows, each read against the repository and the live fleet:
--   cfc-artifacts is IN USE, not a proposal: qnfo-artifacts (live 1.2.3, /health read 2026-10-26) binds the Artifacts namespaces qnfo and rwnq8 and agent_issues 2967
--   (ARTIFACTS-CANONICAL-SYNC-1) replicates the repositories into them, so it becomes in_use with linked_issue 2967 rather than being rejected.
--   cfc-logpush: the fleet already runs Workers Trace Event Logpush per script (memory-mcp, qnfo-error-selfheal; docs/WORKER-LOGS-CONTRACT.md); the new item is the
--   metered zone and account dataset Logpush, which no metric reads: rejected, with that distinction recorded.
--   cfc-monetization-gateway (closed beta), cfc-cloudflare-wan (no private network or tunnel anywhere in the repository), cfc-cloudflare-fundamentals (Organizations
--   is Enterprise and MSSP only), data-pipelines and sandbox (no [[pipelines]] binding and no @cloudflare/sandbox use; qnfo-containers-pilot and qnfo-code-orchestrator
--   already declare [[containers]]): rejected with the reason. The changelog loop reopens a rejected row only on a launch item for it (cfcClassify), so each
--   reason stays until Cloudflare ships something new for that product.
-- 100405 (OWNER-NOTE-46). The owner's note on 2026-10-21 09:10Z (agent_issues 100405, code card ct_hoq2y5kjmyf7lp) is a standing cost directive recorded nowhere: no ops_config key,
--   no decision_log row and no repository line carries it (git grep and SELECT, 2026-10-26). It is stored verbatim as ops_config OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1
--   in the shape of the earlier directive rows. The card itself (a superseded re-apply of PR 3093) has nothing to do with the note. The one-line statement under BUDGET-SOFT-ROUTE-1
--   in CLAUDE.md is a separate PR (hand-written governance text changes by PR with its own work claim, not through a migration).
-- 1000100 (OWNER-TASK op-mvn8obo496f4). The owner asked for a record that the chat thread had no write or dispatch tool and that execution authority rests with
--   server-side action carriers. decision_log held no row naming op-mvn8obo496f4 or 1000100; the single decision_log row of this file is that record (its assumption and
--   evidence carry it), and a d1-query probe reads it, which is the proof the fleet can read it. qnfo-ops answered /health ok on 2026-10-26.
-- 1000102 (OWNER-TASK op-mvn8ocpfc485). emails 1077 (jornalpublication10@gmail.com) is spam; emails 1104 (ravi.kumar.13p01@gmail.com, Details for research authors) is
--   processed with email_reply_queue 77 skip; neither address had an email_filters or email_sender_policy row. qnfo-email applyFilters reads enabled filters by
--   priority and treats field from and sender alike, and its owner-reply block path inserts exactly {filter, sender, <address>, spam, 50, 1} and sets the email to spam, so
--   this file writes the same two rows (email_filters 38 is the precedent) and moves only email 1104. No other email row is touched. The control_registry row records
--   the filter (DOCTRINE-1).
-- 1000186 (OWNER-TASK op-mvnqbba7470b). Only program-manager:QNFO.PERSONAL mentions PERSONAL-QNFO-SEPARATION-1 and none of the six fleet_agents prompts or
--   management_personas.decision_authority texts mentions NO-JOURNALS-1. Each rule is appended only where it is absent (instr guard per rule), so nothing is duplicated and
--   QNFO.PERSONAL gets the journals rule alone. The prompts also still say "daily read of the program scorecard; weekly program note" and "weekly strategic review", while
--   the managers decide every hour at :35 (fleet_crons management-personas-hourly, fleet_tasks management-personas) and the review runs on Mondays after 06:00Z
--   (portfolioStrategicRun); that cadence sentence is corrected in place.
-- Left alone on purpose: management_personas.sla_min is 240 (above the 120-minute SLA rule) and path_b still says the weekly review recomputes the scorecards
--   (psr scorecards are written by the daily rollup since PORTFOLIO-STRATEGIC-2); neither is part of the issue.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = (SELECT b.description FROM bak_20261026_sweep_a_issue_99916 b WHERE b.id = agent_issues.id) WHERE id IN (SELECT id FROM bak_20261026_sweep_a_issue_99916); UPDATE analytics_metric_triggers SET action = (SELECT b.action FROM bak_20261026_sweep_a_trigger_2934 b WHERE b.id = analytics_metric_triggers.id) WHERE id IN (SELECT id FROM bak_20261026_sweep_a_trigger_2934); UPDATE cloudflare_capability_catalog SET status = (SELECT b.status FROM bak_20261026_sweep_a_cf_catalog b WHERE b.slug = cloudflare_capability_catalog.slug), when_to_choose = (SELECT b.when_to_choose FROM bak_20261026_sweep_a_cf_catalog b WHERE b.slug = cloudflare_capability_catalog.slug), linked_issue = (SELECT b.linked_issue FROM bak_20261026_sweep_a_cf_catalog b WHERE b.slug = cloudflare_capability_catalog.slug), last_synced = (SELECT b.last_synced FROM bak_20261026_sweep_a_cf_catalog b WHERE b.slug = cloudflare_capability_catalog.slug) WHERE slug IN (SELECT slug FROM bak_20261026_sweep_a_cf_catalog); UPDATE emails SET status = (SELECT b.status FROM bak_20261026_sweep_a_emails b WHERE b.id = emails.id) WHERE id IN (SELECT id FROM bak_20261026_sweep_a_emails); UPDATE fleet_agents SET system_prompt = (SELECT b.system_prompt FROM bak_20261026_sweep_a_fleet_agents b WHERE b.id = fleet_agents.id), version = (SELECT b.version FROM bak_20261026_sweep_a_fleet_agents b WHERE b.id = fleet_agents.id), updated_at = (SELECT b.updated_at FROM bak_20261026_sweep_a_fleet_agents b WHERE b.id = fleet_agents.id) WHERE id IN (SELECT id FROM bak_20261026_sweep_a_fleet_agents); UPDATE management_personas SET decision_authority = (SELECT b.decision_authority FROM bak_20261026_sweep_a_personas b WHERE b.persona_key = management_personas.persona_key), updated_at = (SELECT b.updated_at FROM bak_20261026_sweep_a_personas b WHERE b.persona_key = management_personas.persona_key) WHERE persona_key IN (SELECT persona_key FROM bak_20261026_sweep_a_personas); DELETE FROM email_filters WHERE field = 'sender' AND priority = 50 AND lower(pattern) IN ('ravi.kumar.13p01@gmail.com', 'jornalpublication10@gmail.com'); DELETE FROM control_registry WHERE control = 'email-filter-journal-pitch-senders'; DELETE FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1'
-- Rollback scope: the rows named above only; the decision_log row stays (append-only).
-- spof-review: none added.

-- ---------------------------------------------------------------- before-state copies (created once, only from rows that still hold the pre-state)
CREATE TABLE IF NOT EXISTS bak_20261026_sweep_a_issue_99916 AS
  SELECT id, description FROM agent_issues WHERE id = 99916 AND instr(description, '''%session-task:%''') > 0;

CREATE TABLE IF NOT EXISTS bak_20261026_sweep_a_trigger_2934 AS
  SELECT id, action FROM analytics_metric_triggers WHERE id = 2934 AND instr(action, '''%session-task:%''') > 0;

CREATE TABLE IF NOT EXISTS bak_20261026_sweep_a_cf_catalog AS
  SELECT slug, status, when_to_choose, linked_issue, last_synced FROM cloudflare_capability_catalog
  WHERE slug IN ('cfc-artifacts', 'cfc-logpush', 'cfc-monetization-gateway', 'cfc-cloudflare-wan', 'cfc-cloudflare-fundamentals', 'data-pipelines', 'sandbox')
    AND status IN ('not_considered', 'proposed');

CREATE TABLE IF NOT EXISTS bak_20261026_sweep_a_emails AS
  SELECT id, sender, status FROM emails WHERE id = 1104 AND status = 'processed' AND lower(sender) = 'ravi.kumar.13p01@gmail.com';

CREATE TABLE IF NOT EXISTS bak_20261026_sweep_a_fleet_agents AS
  SELECT id, system_prompt, version, updated_at FROM fleet_agents
  WHERE (id = 'portfolio-manager' OR id LIKE 'program-manager:%')
    AND (instr(system_prompt, 'PERSONAL-QNFO-SEPARATION-1') = 0 OR instr(system_prompt, 'NO-JOURNALS-1') = 0
      OR instr(system_prompt, 'Cadence: daily read of the program scorecard; weekly program note into the portfolio review.') > 0
      OR instr(system_prompt, 'Cadence: weekly strategic review hosted in qnfo-fleet-dashboard portfolioStrategicRun (Mondays 06:00Z), reading the daily program scorecards.') > 0);

CREATE TABLE IF NOT EXISTS bak_20261026_sweep_a_personas AS
  SELECT persona_key, decision_authority, updated_at FROM management_personas
  WHERE (persona_key = 'portfolio:fleet' OR persona_key LIKE 'program:%')
    AND (instr(COALESCE(decision_authority, ''), 'PERSONAL-QNFO-SEPARATION-1') = 0 OR instr(COALESCE(decision_authority, ''), 'NO-JOURNALS-1') = 0);

-- ---------------------------------------------------------------- 99916: the ticket and its trigger stop counting themselves
UPDATE agent_issues
   SET description = replace(description, '''%session-task:%''', '''%session-task'' || '':%''')
 WHERE id = 99916 AND instr(description, '''%session-task:%''') > 0;

UPDATE analytics_metric_triggers
   SET action = replace(action, '''%session-task:%''', '''%session-task'' || '':%''')
 WHERE id = 2934 AND instr(action, '''%session-task:%''') > 0;

-- ---------------------------------------------------------------- 100388: seven undecided Cloudflare catalog rows are decided, each with its reason
UPDATE cloudflare_capability_catalog
   SET status = 'in_use', linked_issue = 2967,
       when_to_choose = COALESCE(when_to_choose, '') || ' | CF-CHANGELOG-DECIDE-1 2026-10-26 (agent_issues 100388): already in use, not a proposal. qnfo-artifacts (live 1.2.3) binds the Artifacts namespaces qnfo and rwnq8 and is the control plane over them, and ARTIFACTS-CANONICAL-SYNC-1 (agent_issues 2967) replicates the GitHub repositories into them (174 of 180 converged when it shipped on 2026-10-18). The open beta changes Cloudflare''s terms, not the fleet''s use.',
       last_synced = datetime('now')
 WHERE slug = 'cfc-artifacts' AND status IN ('not_considered', 'proposed') AND instr(COALESCE(when_to_choose, ''), 'CF-CHANGELOG-DECIDE-1 2026-10-26') = 0;

UPDATE cloudflare_capability_catalog
   SET status = 'rejected',
       when_to_choose = COALESCE(when_to_choose, '') || ' | CF-CHANGELOG-DECIDE-1 2026-10-26 (agent_issues 100388): rejected. The fleet already runs Workers Trace Event Logpush as a per-script opt-in (logpush = true in memory-mcp and qnfo-error-selfheal; qnfo-observability ingests the R2 workers_trace objects; docs/WORKER-LOGS-CONTRACT.md) and reads fleet error rates from the workersInvocationsAdaptive dataset. This change (self-service Logpush for zone and account datasets on every plan, usage-based pricing, Transformers) would add a metered sink for request logs that no metric reads, and request-level records carry request URLs (WORKER-LOGS-CONTRACT rule 3). Re-evaluate if a metric needs per-request zone logs the GraphQL datasets cannot give.',
       last_synced = datetime('now')
 WHERE slug = 'cfc-logpush' AND status IN ('not_considered', 'proposed') AND instr(COALESCE(when_to_choose, ''), 'CF-CHANGELOG-DECIDE-1 2026-10-26') = 0;

UPDATE cloudflare_capability_catalog
   SET status = 'rejected',
       when_to_choose = COALESCE(when_to_choose, '') || ' | CF-CHANGELOG-DECIDE-1 2026-10-26 (agent_issues 100388): rejected. The product is in closed beta (changelog 2026-09-30), so the account has nothing to adopt, and charging agents for access cuts against OPEN-ACCESS-1 (owner directive 2026-10-01: favor free, open access) and needs a payment rail, which is an owner money act. Re-evaluate at general availability if the owner sets a monetization line.',
       last_synced = datetime('now')
 WHERE slug = 'cfc-monetization-gateway' AND status IN ('not_considered', 'proposed') AND instr(COALESCE(when_to_choose, ''), 'CF-CHANGELOG-DECIDE-1 2026-10-26') = 0;

UPDATE cloudflare_capability_catalog
   SET status = 'rejected',
       when_to_choose = COALESCE(when_to_choose, '') || ' | CF-CHANGELOG-DECIDE-1 2026-10-26 (agent_issues 100388): rejected. BGP over IPsec and GRE tunnels serves Cloudflare WAN and Magic Transit, which join an organisation''s own network sites to Cloudflare; the fleet is Workers, D1 and R2 only, with no private network, tunnel or site, and no worker or wrangler.toml in the repository uses these products. Re-evaluate if a private-network site is ever added.',
       last_synced = datetime('now')
 WHERE slug = 'cfc-cloudflare-wan' AND status IN ('not_considered', 'proposed') AND instr(COALESCE(when_to_choose, ''), 'CF-CHANGELOG-DECIDE-1 2026-10-26') = 0;

UPDATE cloudflare_capability_catalog
   SET status = 'rejected',
       when_to_choose = COALESCE(when_to_choose, '') || ' | CF-CHANGELOG-DECIDE-1 2026-10-26 (agent_issues 100388): rejected. Cloudflare Organizations is generally available for Enterprise customers and MSSP or Distributor partners only (the changelog text above), and the fleet deploys and binds everything under one account id (CLOUDFLARE_ACCOUNT_ID), so there are no accounts or members to centralise. The later items on this row are notes, not adoptions.',
       last_synced = datetime('now')
 WHERE slug = 'cfc-cloudflare-fundamentals' AND status IN ('not_considered', 'proposed') AND instr(COALESCE(when_to_choose, ''), 'CF-CHANGELOG-DECIDE-1 2026-10-26') = 0;

UPDATE cloudflare_capability_catalog
   SET status = 'rejected',
       when_to_choose = COALESCE(when_to_choose, '') || ' | CF-CHANGELOG-DECIDE-1 2026-10-26 (agent_issues 100388): re-rejected. Basin general availability (2026-10-01) and the raised ingest limit (1 GB/s) change capacity, not need: the reason above still holds (a few hundred thousand events per 30 days, covered by D1 and Analytics Engine) and no wrangler.toml declares a [[pipelines]] binding (git grep, 2026-10-26). Re-evaluate if a single event stream outgrows D1.',
       last_synced = datetime('now')
 WHERE slug = 'data-pipelines' AND status IN ('not_considered', 'proposed') AND instr(COALESCE(when_to_choose, ''), 'CF-CHANGELOG-DECIDE-1 2026-10-26') = 0;

UPDATE cloudflare_capability_catalog
   SET status = 'rejected',
       when_to_choose = COALESCE(when_to_choose, '') || ' | CF-CHANGELOG-DECIDE-1 2026-10-26 (agent_issues 100388): re-rejected. Sandbox SDK 1.0 changes how a sandbox is driven, not whether the fleet needs a second executor: qnfo-containers-pilot (live 1.0.11) and qnfo-code-orchestrator already declare [[containers]] and give the code loop its container, and no package or worker uses @cloudflare/sandbox (git grep, 2026-10-26). A breached fleet_budget cap is not the reason (RULE-8-RETIRED-1, BUDGET-SOFT-ROUTE-1); a duplicate capability with no metric it would move is. Re-evaluate if the container-executor exception rate (catalog row containers) rises.',
       last_synced = datetime('now')
 WHERE slug = 'sandbox' AND status IN ('not_considered', 'proposed') AND instr(COALESCE(when_to_choose, ''), 'CF-CHANGELOG-DECIDE-1 2026-10-26') = 0;

-- ---------------------------------------------------------------- 100405: the owner's cost and quality directive, verbatim
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1', '{"id":"COST-QUALITY-FLOOR-1","date":"2026-10-21","source":"OWNER-NOTE-46 (agent_issues 100405), the owner''s note on fleet.qnfo.org to card code:ct_hoq2y5kjmyf7lp, filed by qnfo-fleet-dashboard OWNER-NOTES-ROUTE-1","directive_verbatim":"Cost-consciousness directive: quality may not be reduced to cut cost; prefer lower-cost paths only when quality is preserved.","reading":"a cheaper model or path (BUDGET-SOFT-ROUTE-1) is kept only while the output-quality outcome measures (OUTPUT-QUALITY-LEDGER-1, v_output_quality_headline) do not fall; otherwise it is reverted","carried_by":["BUDGET-SOFT-ROUTE-1 (the cheapest capable model at a breached cap)","OUTPUT-QUALITY-LEDGER-1 (outcome measures decide whether quality fell)"],"limits":"the reading is the fleet''s, not the owner''s words; it moves no limit: the harness permission checks, the secret lock and live work claims keep their precedence, and a breached ai_spend cap still steers to the cheapest capable model and never stops work"}', 'COST-QUALITY-FLOOR-1 (owner note 2026-10-21 on agent_issues 100405): quality may not be reduced to cut cost; a lower-cost path is preferred only when quality is preserved. No worker reads the key: the loops honor it through BUDGET-SOFT-ROUTE-1 and OUTPUT-QUALITY-LEDGER-1. The one-line statement under BUDGET-SOFT-ROUTE-1 in CLAUDE.md is a follow-up PR (governance text lands by PR).');

-- ---------------------------------------------------------------- 1000102: the two journal-pitch senders are blocked at ingest, the way the owner's own SPAM reply blocks one
INSERT INTO email_filters (rule_type, field, pattern, action, priority, enabled)
SELECT 'filter', 'sender', 'ravi.kumar.13p01@gmail.com', 'spam', 50, 1
WHERE NOT EXISTS (SELECT 1 FROM email_filters WHERE lower(pattern) = 'ravi.kumar.13p01@gmail.com' AND lower(field) IN ('sender', 'from'));

INSERT INTO email_filters (rule_type, field, pattern, action, priority, enabled)
SELECT 'filter', 'sender', 'jornalpublication10@gmail.com', 'spam', 50, 1
WHERE NOT EXISTS (SELECT 1 FROM email_filters WHERE lower(pattern) = 'jornalpublication10@gmail.com' AND lower(field) IN ('sender', 'from'));

UPDATE emails SET status = 'spam'
 WHERE id = 1104 AND status = 'processed' AND lower(sender) = 'ravi.kumar.13p01@gmail.com';

INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
SELECT 'email-filter-journal-pitch-senders',
  'qnfo-audit.email_filters rows (field sender, action spam, priority 50) read by qnfo-email applyFilters at ingest',
  'filter',
  'journal-pitch solicitations from ravi.kumar.13p01@gmail.com and jornalpublication10@gmail.com reaching the owner inbox or the papers.qnfo.org workflows (NO-JOURNALS-1; owner request op-mvn8ocpfc485)',
  0, 'keep', 'applied',
  'the domain filters of the same family (email_filters ids 26 to 30, 32 and 33) and the owner''s SPAM reply to a notice, which inserts the identical row (NOTICE-REPLY-1); the pattern is the full address, so no other sender is matched',
  NULL,
  'live read 2026-10-26: emails 1077 (spam) and 1104 (processed, email_reply_queue 77 skip) are the only rows from the two addresses; email_filters 38 is the single-sender precedent; remove either filter by deleting its email_filters row (the filter deletes no mail)',
  1000102
WHERE NOT EXISTS (SELECT 1 FROM control_registry WHERE control = 'email-filter-journal-pitch-senders');

-- ---------------------------------------------------------------- 1000186: the two hard limits in the management personas, once each; the cadence text matches what runs
UPDATE fleet_agents
   SET system_prompt = system_prompt || ' Hard limit: personal-api work is never cross-pollinated into research endpoints (PERSONAL-QNFO-SEPARATION-1).',
       version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE (id = 'portfolio-manager' OR id LIKE 'program-manager:%') AND instr(system_prompt, 'PERSONAL-QNFO-SEPARATION-1') = 0;

UPDATE fleet_agents
   SET system_prompt = system_prompt || ' Hard limit: never suggest or route to traditional journal submission; every publication-related output goes only to papers.qnfo.org (NO-JOURNALS-1).',
       version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE (id = 'portfolio-manager' OR id LIKE 'program-manager:%') AND instr(system_prompt, 'NO-JOURNALS-1') = 0;

UPDATE fleet_agents
   SET system_prompt = replace(system_prompt, 'Cadence: daily read of the program scorecard; weekly program note into the portfolio review.',
         'Cadence: every hour at :35 (fleet_tasks management-personas) it ranks its program''s open issues inside the focus slots the portfolio manager gives it; daily read of the program scorecard; weekly program note into the portfolio review (Mondays, PORTFOLIO-STRATEGIC-1).'),
       version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE id LIKE 'program-manager:%' AND instr(system_prompt, 'Cadence: daily read of the program scorecard; weekly program note into the portfolio review.') > 0;

UPDATE fleet_agents
   SET system_prompt = replace(system_prompt, 'Cadence: weekly strategic review hosted in qnfo-fleet-dashboard portfolioStrategicRun (Mondays 06:00Z), reading the daily program scorecards.',
         'Cadence: every hour at :35 (fleet_tasks management-personas) it splits the fleet''s focus slots across the programs (portfolio_allocations); weekly strategic review hosted in qnfo-fleet-dashboard portfolioStrategicRun (Mondays after 06:00Z), reading the daily program scorecards.'),
       version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE id = 'portfolio-manager' AND instr(system_prompt, 'Cadence: weekly strategic review hosted in qnfo-fleet-dashboard portfolioStrategicRun (Mondays 06:00Z), reading the daily program scorecards.') > 0;

UPDATE management_personas
   SET decision_authority = decision_authority || '; never cross-pollinates personal-api work into research endpoints (PERSONAL-QNFO-SEPARATION-1)',
       updated_at = datetime('now')
 WHERE (persona_key = 'portfolio:fleet' OR persona_key LIKE 'program:%') AND instr(COALESCE(decision_authority, ''), 'PERSONAL-QNFO-SEPARATION-1') = 0 AND decision_authority IS NOT NULL;

UPDATE management_personas
   SET decision_authority = decision_authority || '; sends publication-related output only to papers.qnfo.org and never to journal submission (NO-JOURNALS-1)',
       updated_at = datetime('now')
 WHERE (persona_key = 'portfolio:fleet' OR persona_key LIKE 'program:%') AND instr(COALESCE(decision_authority, ''), 'NO-JOURNALS-1') = 0 AND decision_authority IS NOT NULL;

-- ---------------------------------------------------------------- the decision record (one row; it is also the 1000100 record)
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_015kWmGuAq2fNuvzu4MrD7x3',
  'Issue 1000100 record: the owner reported (owner_prompts op-mvn8obo496f4) that the chat thread that queued the task held no write or dispatch tool, so execution authority rests with server-side action carriers, not with a chat thread: owner_prompts become agent_issues rows (TASK-INTENT-INTAKE-1, OWNER-NOTES-ROUTE-1) that the fleet loops and qnfo-ops execute, and a session builds the fleet but is never part of it (NO-CLAUDE-RUNTIME-DEPENDENCY-1). Each other premise below was re-read from qnfo-audit and origin/main on 2026-10-26 before it was applied; issue 3003 was left out because CADENCE-SLA-CONTINUITY-1 already fixed it, and where a proposal was wrong it was changed (cfc-artifacts is in use and becomes in_use, not rejected; cfc-logpush records that Workers Trace Event Logpush is already in use).',
  'SWEEP-DATA-FIXES-A-1: (99916) the session-task marker removed from the ticket text and from analytics_metric_triggers 2934 so the ticket stops counting itself; (100388) the seven undecided Cloudflare catalog rows decided with reasons (cfc-artifacts in_use, six rejected); (100405) the owner cost and quality directive stored verbatim as ops_config OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1; (1000100) this record; (1000102) email_filters for ravi.kumar.13p01@gmail.com and jornalpublication10@gmail.com, emails 1104 spam, control_registry email-filter-journal-pitch-senders; (1000186) NO-JOURNALS-1 and PERSONAL-QNFO-SEPARATION-1 added once each to the six persona prompts and decision_authority texts, cadence text corrected',
  'qnfo-audit SELECT reads 2026-10-26: agent_issues 99916 and analytics_metric_triggers 2934 (the literal in both), trigger 1204 query (7 slugs) with cloudflare_capability_catalog, cf_changelog_items and qnfo-artifacts /health 1.2.3, agent_issues 100405 and ops_config (no directive key), owner_prompts op-mvn8obo496f4 op-mvn8ocpfc485 op-mvnqbba7470b, emails 1077 and 1104, email_filters 38, fleet_agents prompts and management_personas texts; origin/main qnfo-email/worker.js applyFilters and the owner block path, qnfo-fleet-control/worker.js cfcClassify, docs/WORKER-LOGS-CONTRACT.md',
  'migration merged',
  'one agent_issues description, one analytics_metric_triggers action, seven cloudflare_capability_catalog rows, one ops_config row, two email_filters rows, one emails row (id 1104), one control_registry row, six fleet_agents prompts and six management_personas rows; nothing is deleted and no other row is touched',
  'the Rollback header restores every changed text column from bak_20261026_sweep_a_* and deletes the inserted filter, registry and ops_config rows; this decision_log row stays (append-only)',
  'metric 2934 stops counting its own ticket; undecided Cloudflare features carry a recorded decision; the owner cost and quality directive is a machine-readable record; two journal-pitch senders are blocked at ingest; the personas carry both hard limits',
  'cf_changelog_open_proposals_14d <= 0 within 2 hours',
  'none',
  'd1:qnfo-audit (SELECT only); offline node:sqlite suite migrations/sweep-data-fixes-a.test.mjs; scripts/apply_migrations.py --check'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SWEEP-DATA-FIXES-A-1:') = 1);
