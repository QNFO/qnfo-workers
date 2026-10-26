-- SWEEP-DATA-FIXES-A-1 (2026-10-26, charter pillar autonomy; data fixes bundle A: agent_issues 99916, 100388, 100405, 1000100, 1000102, 1000186).
-- Every premise below was re-read from qnfo-audit (SELECT only) and from origin/main on 2026-10-26 before it was applied.
-- Each UPDATE of a text column saves its before-state in a bak_20261026_sweep_a_* table created in this file and guards on the live pre-state, so a second apply
-- and an already-fixed row change nothing. Each INSERT that the Rollback must remove is recorded first in bak_20261026_sweep_a_created (only when the row does not
-- exist yet), so the Rollback line deletes the rows this file created and never a row someone else wrote. The three follow-up agent_issues rows and the contracts attached
-- to them are not removed by the Rollback (an issue is never silently dropped): close them with evidence if the work is abandoned.
--
-- 3003 (METRIC-TRIGGER-6050 cadence_overdue_over_120m) is NOT in this file. Its continuity-snapshot window error (cadence_sla interval 120 for a producer that runs when the newest ok
--   snapshot is 20 hours old) was fixed while this bundle was prepared: migrations/2026-10-26-cadence-sla-continuity.sql (CADENCE-SLA-CONTINUITY-1, merged in a8259559, interval 1260,
--   cadence_sla.updated_at 2026-10-26T09:31:02Z), so v_cadence_overdue reads continuity-snapshot over_sla 0. A second UPDATE of the same row would only rewrite its text. The ticket
--   stays open on the two real producers (reading.q08.org, papers.qnfo.org), which are not data fixes.
-- 99916 (METRIC-TRIGGER-2934 session_dependent_issues_open). The metric counts open issues whose description contains the literal session-task colon; the ticket's own description
--   (and analytics_metric_triggers 2934 action, which every refile copies) quotes its example query with that literal, so the ticket counts itself and the metric
--   can never reach 0 while it is open. The quoted query is rewritten to the equivalent '%session-task' || ':%', which matches the same rows and no longer contains the marker.
--   Re-read on 2026-10-26: the counted issues carry a session-task line at the start of a line (1000171 an inline instruction) or, for 2604, a session owner in issue_triage, and 99916 is
--   the only one that quotes the marker as a LIKE pattern, so this fix removes exactly the self-match and the others are real work for the code loop. The failure mode
--   ticket-quotes-its-own-counted-marker and its d1-query detector read for a recurrence (the ticket or the trigger text quoting the pattern again).
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
--   no decision_log row and no repository line carries it (git grep and SELECT, 2026-10-26). It is stored verbatim as ops_config OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1 in the shape of
--   the earlier directive rows, and the value says what is true: enforced_by none, recorded only, no loop reads the key. The card itself (a superseded re-apply of PR 3093) has nothing to do
--   with the note. Enforcement and the written statements are filed as issues with a doer and a probe: COST-QUALITY-FLOOR-ENFORCE-1 (qnfo-ai reverts a downgrade while
--   v_output_quality_headline reports a fall, at all three downgrade points: spendGovern, spendGovernWA and the FLEET-CAP-STEER-1 switch, and it closes only when a suite that asserts this exists) and
--   COST-QUALITY-FLOOR-DOC-1 (the doctrine document, which carries the written statement; no CLAUDE.md issue is filed because the code loop cannot ship that file). The issue
--   contract of 100405 is re-pointed so that the issue closes on enforcement (the first follow-up closed), not on the key being present.
-- 1000100 (OWNER-TASK op-mvn8obo496f4). The owner asked for a record that the chat thread had no write or dispatch tool and that execution authority rests with
--   server-side action carriers. decision_log held no row naming op-mvn8obo496f4 or 1000100; the single decision_log row of this file is that record (its assumption and
--   evidence carry it), and a d1-query probe reads it, which is the proof the fleet can read it. qnfo-ops answered /health ok on 2026-10-26.
-- 1000102 (OWNER-TASK op-mvn8ocpfc485). Email 1077 is spam; email 1104 (subject Details for research authors) is processed with email_reply_queue 77 skip; neither sender
--   had an email_filters or email_sender_policy row. qnfo-email applyFilters reads enabled filters by priority and treats field from and sender alike, and its owner-reply block
--   path inserts exactly {filter, sender, <address>, spam, 50, 1} and sets the email to spam, so this file writes the same two rows (email_filters 38 is the precedent; one INSERT ... SELECT takes lower(sender) of emails 1077 and 1104,
--   so no address is written in this file) and moves only email 1104, found by id and subject. No other email row is touched. The control_registry row records the filter (DOCTRINE-1).
-- 1000186 (OWNER-TASK op-mvnqbba7470b). Only program-manager:QNFO.PERSONAL mentioned PERSONAL-QNFO-SEPARATION-1 and none of the six fleet_agents prompts or
--   management_personas.decision_authority texts mentioned NO-JOURNALS-1. Each rule is appended only where it is absent (instr guard per rule), so nothing is duplicated and
--   QNFO.PERSONAL gets the journals rule alone. What reads them: fleet_agents.system_prompt is read only by the dashboard's weekly program narrative (psrNarrative), and that
--   narrative is skipped while any ai_spend cap is breached (psrNarrativeAllowed; fleet_budget ai_spend:workers-ai reads 660.09 against a cap of 95), which contradicts
--   BUDGET-SOFT-ROUTE-1 and is filed as PSR-NARRATIVE-CAP-SOFT-1. So the limits are also put where a model call runs today: the fleet_tasks workflow management-personas asks a
--   model for a roadmap proposal per program (the prompt ends with the sentence Reply in exactly this form), and the two hard limits are inserted in that prompt, before that
--   sentence, once (guarded on the definition not yet naming NO-JOURNALS-1 and on the anchor occurring exactly once; version + 1; backup row in bak_20261026_sweep_a_workflow; the
--   Rollback removes exactly the inserted sentence). The prompts also said "daily read of the program scorecard; weekly program note" and "weekly strategic review", while the
--   managers decide every hour at :35 (fleet_crons management-personas-hourly, fleet_tasks management-personas) and the review runs on Mondays after 06:00Z
--   (portfolioStrategicRun); that cadence sentence is corrected in place. Scope of the workflow edit: only the roadmap-proposal prompt (step rm-research). The other model-calling steps of the
--   workflow (rc-agent-request, red-agent-request, parked-agent-request, lever-request) are not covered and carry no hard limit.
-- management_personas, two neighbouring defects fixed here: sla_min was 240 on all six rows (QUEUE-SLA-1: no SLA exceeds 120 minutes; no code reads the column) and path_b said the weekly review
--   recomputes the scorecards while the daily portfolio rollup writes them (PORTFOLIO-STRATEGIC-2) and the weekly review writes the notes. sla_min becomes 120 and path_b names both writers; the
--   before-state is in bak_20261026_sweep_a_personas_meta and the Rollback restores both columns from it.
-- Loose ends closed in this file: the issue contracts of 100405, 1000100, 1000102 and 1000186 were VACUOUS-PROBE-V3-1 probes (they measure the status of their own issue, or, for
--   100405, any code task that mentions the note); each is replaced by a probe that measures the condition (100405 and 1000186 measure enforcement), active and due now. The contracts of 1000100, 1000102 and 1000186 are superseded; 100405 is active with a probe that a code task about the note satisfies, so its guard also
--   accepts status active.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = (SELECT b.description FROM bak_20261026_sweep_a_issue_99916 b WHERE b.id = agent_issues.id) WHERE id IN (SELECT id FROM bak_20261026_sweep_a_issue_99916); UPDATE analytics_metric_triggers SET action = (SELECT b.action FROM bak_20261026_sweep_a_trigger_2934 b WHERE b.id = analytics_metric_triggers.id) WHERE id IN (SELECT id FROM bak_20261026_sweep_a_trigger_2934); UPDATE cloudflare_capability_catalog SET status = (SELECT b.status FROM bak_20261026_sweep_a_cf_catalog b WHERE b.slug = cloudflare_capability_catalog.slug), when_to_choose = (SELECT b.when_to_choose FROM bak_20261026_sweep_a_cf_catalog b WHERE b.slug = cloudflare_capability_catalog.slug), linked_issue = (SELECT b.linked_issue FROM bak_20261026_sweep_a_cf_catalog b WHERE b.slug = cloudflare_capability_catalog.slug), last_synced = (SELECT b.last_synced FROM bak_20261026_sweep_a_cf_catalog b WHERE b.slug = cloudflare_capability_catalog.slug) WHERE slug IN (SELECT slug FROM bak_20261026_sweep_a_cf_catalog); UPDATE emails SET status = (SELECT b.status FROM bak_20261026_sweep_a_emails b WHERE b.id = emails.id) WHERE id IN (SELECT id FROM bak_20261026_sweep_a_emails); UPDATE fleet_agents SET system_prompt = (SELECT b.system_prompt FROM bak_20261026_sweep_a_fleet_agents b WHERE b.id = fleet_agents.id), version = (SELECT b.version FROM bak_20261026_sweep_a_fleet_agents b WHERE b.id = fleet_agents.id), updated_at = (SELECT b.updated_at FROM bak_20261026_sweep_a_fleet_agents b WHERE b.id = fleet_agents.id) WHERE id IN (SELECT id FROM bak_20261026_sweep_a_fleet_agents); UPDATE management_personas SET decision_authority = (SELECT b.decision_authority FROM bak_20261026_sweep_a_personas b WHERE b.persona_key = management_personas.persona_key), updated_at = (SELECT b.updated_at FROM bak_20261026_sweep_a_personas b WHERE b.persona_key = management_personas.persona_key) WHERE persona_key IN (SELECT persona_key FROM bak_20261026_sweep_a_personas); UPDATE fleet_tasks SET definition = replace(definition, 'Hard limits: never propose or route to traditional journal submission, publication goes only to papers.qnfo.org (NO-JOURNALS-1), and never cross-pollinate personal-api work into research endpoints (PERSONAL-QNFO-SEPARATION-1). ', ''), version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = 'management-personas' AND instr(definition, 'Hard limits: never propose or route to traditional journal submission, publication goes only to papers.qnfo.org (NO-JOURNALS-1), and never cross-pollinate personal-api work into research endpoints (PERSONAL-QNFO-SEPARATION-1). ') > 0; UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261026_sweep_a_contracts b WHERE b.class = remediation_contracts.class), verify_probe = (SELECT b.verify_probe FROM bak_20261026_sweep_a_contracts b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261026_sweep_a_contracts b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261026_sweep_a_contracts b WHERE b.class = remediation_contracts.class), precondition = (SELECT b.precondition FROM bak_20261026_sweep_a_contracts b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261026_sweep_a_contracts b WHERE b.class = remediation_contracts.class), attempts = (SELECT b.attempts FROM bak_20261026_sweep_a_contracts b WHERE b.class = remediation_contracts.class), deferred_since = (SELECT b.deferred_since FROM bak_20261026_sweep_a_contracts b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261026_sweep_a_contracts b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261026_sweep_a_contracts); UPDATE management_personas SET sla_min = (SELECT b.sla_min FROM bak_20261026_sweep_a_personas_meta b WHERE b.persona_key = management_personas.persona_key), path_b = (SELECT b.path_b FROM bak_20261026_sweep_a_personas_meta b WHERE b.persona_key = management_personas.persona_key), updated_at = (SELECT b.updated_at FROM bak_20261026_sweep_a_personas_meta b WHERE b.persona_key = management_personas.persona_key) WHERE persona_key IN (SELECT persona_key FROM bak_20261026_sweep_a_personas_meta); DELETE FROM email_filters WHERE field = 'sender' AND priority = 50 AND action = 'spam' AND lower(pattern) IN (SELECT lower(e.sender) FROM emails e WHERE CAST(e.id AS TEXT) IN (SELECT pk FROM bak_20261026_sweep_a_created WHERE tbl = 'email_filters:sender_of_email')); DELETE FROM control_registry WHERE control IN (SELECT pk FROM bak_20261026_sweep_a_created WHERE tbl = 'control_registry'); DELETE FROM ops_config WHERE key IN (SELECT pk FROM bak_20261026_sweep_a_created WHERE tbl = 'ops_config'); DELETE FROM remediation_contracts WHERE class IN (SELECT pk FROM bak_20261026_sweep_a_created WHERE tbl = 'remediation_contracts'); DELETE FROM failure_modes WHERE fm_key IN (SELECT pk FROM bak_20261026_sweep_a_created WHERE tbl = 'failure_modes')
-- Rollback scope: the rows named above only; the decision_log row stays (append-only), and so do the three follow-up issues and their contracts.
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
  SELECT id, status FROM emails WHERE id = 1104 AND status = 'processed' AND subject = 'Details for research authors';

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

CREATE TABLE IF NOT EXISTS bak_20261026_sweep_a_workflow AS
  SELECT id, definition, version, updated_at FROM fleet_tasks WHERE id = 'management-personas' AND instr(definition, 'NO-JOURNALS-1') = 0;

CREATE TABLE IF NOT EXISTS bak_20261026_sweep_a_contracts AS
  SELECT class, issue_id, status, verify_probe, verify_transport, action, precondition, last_verdict, attempts, deferred_since, next_due_at FROM remediation_contracts
  WHERE class IN ('issue-100405', 'issue-1000100', 'issue-1000102', 'issue-1000186') AND substr(action, 1, 18) = 'VACUOUS-PROBE-V3-1';

CREATE TABLE IF NOT EXISTS bak_20261026_sweep_a_personas_meta AS
  SELECT persona_key, sla_min, path_b, updated_at FROM management_personas
  WHERE sla_min > 120 OR instr(COALESCE(path_b, ''), 'weekly review (PORTFOLIO-STRATEGIC-1) recomputes scorecards') > 0;

-- The rows this file creates, recorded before the INSERT and only when the row does not exist yet, so the Rollback deletes nothing that someone else wrote.
CREATE TABLE IF NOT EXISTS bak_20261026_sweep_a_created (tbl TEXT NOT NULL, pk TEXT NOT NULL, PRIMARY KEY (tbl, pk));

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

-- ---------------------------------------------------------------- 100405: the owner's cost and quality directive, verbatim, as a record (nothing enforces it yet)
INSERT OR IGNORE INTO bak_20261026_sweep_a_created (tbl, pk)
SELECT 'ops_config', 'OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1' WHERE NOT EXISTS (SELECT 1 FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1');

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1', '{"id":"COST-QUALITY-FLOOR-1","date":"2026-10-21","source":"OWNER-NOTE-46 (agent_issues 100405), the owner''s note on fleet.qnfo.org to card code:ct_hoq2y5kjmyf7lp, filed by qnfo-fleet-dashboard OWNER-NOTES-ROUTE-1","directive_verbatim":"Cost-consciousness directive: quality may not be reduced to cut cost; prefer lower-cost paths only when quality is preserved.","enforced_by":"none: recorded only, no loop reads this key","intended":"a cheaper model or path chosen under BUDGET-SOFT-ROUTE-1 is kept only while the output-quality outcome measures (OUTPUT-QUALITY-LEDGER-1, v_output_quality_headline) do not fall, and is reverted when they do","follow_up":"agent_issues COST-QUALITY-FLOOR-ENFORCE-1 (qnfo-ai: spendGovern, spendGovernWA and the fleet cap steer), COST-QUALITY-FLOOR-DOC-1","limits":"the intended reading is the fleet''s, not the owner''s words; it moves no limit: the harness permission checks, the secret lock and live work claims keep their precedence, and a breached ai_spend cap still steers to the cheapest capable model and never stops work"}', 'COST-QUALITY-FLOOR-1 (owner note 2026-10-21 on agent_issues 100405): quality may not be reduced to cut cost, and a lower-cost path is preferred only when quality is preserved. RECORD ONLY: no worker or loop reads this key and nothing enforces it yet. Enforcement is the open issue COST-QUALITY-FLOOR-ENFORCE-1 (qnfo-ai reading v_output_quality_headline at its three downgrade points); the written statement in the doctrine document is COST-QUALITY-FLOOR-DOC-1.');

-- ---------------------------------------------------------------- 1000102: the two journal-pitch senders are blocked at ingest, the way the owner's own SPAM reply blocks one
INSERT OR IGNORE INTO bak_20261026_sweep_a_created (tbl, pk)
SELECT 'email_filters:sender_of_email', CAST(e.id AS TEXT) FROM emails e
WHERE e.id IN (1077, 1104)
  AND NOT EXISTS (SELECT 1 FROM email_filters f WHERE lower(f.pattern) = lower(e.sender) AND lower(f.field) IN ('sender', 'from'));

INSERT INTO email_filters (rule_type, field, pattern, action, priority, enabled)
SELECT 'filter', 'sender', lower(e.sender), 'spam', 50, 1 FROM emails e
WHERE e.id IN (1077, 1104)
  AND NOT EXISTS (SELECT 1 FROM email_filters f WHERE lower(f.pattern) = lower(e.sender) AND lower(f.field) IN ('sender', 'from'));

UPDATE emails SET status = 'spam'
 WHERE id = 1104 AND status = 'processed' AND subject = 'Details for research authors';

INSERT OR IGNORE INTO bak_20261026_sweep_a_created (tbl, pk)
SELECT 'control_registry', 'email-filter-journal-pitch-senders' WHERE NOT EXISTS (SELECT 1 FROM control_registry WHERE control = 'email-filter-journal-pitch-senders');

INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
SELECT 'email-filter-journal-pitch-senders',
  'qnfo-audit.email_filters rows (field sender, action spam, priority 50) read by qnfo-email applyFilters at ingest',
  'filter',
  'journal-pitch solicitations from the senders of emails 1077 and 1104 reaching the owner inbox or the papers.qnfo.org workflows (NO-JOURNALS-1; owner request op-mvn8ocpfc485)',
  0, 'keep', 'applied',
  'the domain filters of the same family (email_filters ids 26 to 30, 32 and 33) and the owner''s SPAM reply to a notice, which inserts the identical row (NOTICE-REPLY-1); the pattern is the full sender address, so no other sender is matched',
  NULL,
  'live read 2026-10-26: emails 1077 (spam) and 1104 (processed, email_reply_queue 77 skip) are the only rows from the two senders; email_filters 38 is the single-sender precedent; remove a filter by deleting its email_filters row (the filter deletes no mail)',
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

-- management_personas, the two neighbouring defects: QUEUE-SLA-1 allows no SLA above 120 minutes (sla_min was 240 on all six rows and no code reads it), and path_b said the weekly review
-- recomputes the scorecards while the daily portfolio rollup writes them (PORTFOLIO-STRATEGIC-2). Before-state: bak_20261026_sweep_a_personas_meta, created above.
UPDATE management_personas SET sla_min = 120, updated_at = datetime('now') WHERE sla_min > 120;

UPDATE management_personas
   SET path_b = replace(path_b, 'weekly review (PORTFOLIO-STRATEGIC-1) recomputes scorecards', 'daily portfolio rollup (PORTFOLIO-STRATEGIC-2) and weekly review (PORTFOLIO-STRATEGIC-1) recompute scorecards'),
       updated_at = datetime('now')
 WHERE instr(COALESCE(path_b, ''), 'weekly review (PORTFOLIO-STRATEGIC-1) recomputes scorecards') > 0;

-- The prompt that runs: the management-personas workflow asks a model for one roadmap proposal per program. Only that step (rm-research) is covered: rc-agent-request, red-agent-request, parked-agent-request and lever-request also call a model and are not. Guarded on the definition not yet naming NO-JOURNALS-1 and on the
-- anchor sentence occurring exactly once (the replacement would otherwise change every occurrence). The inserted text has no apostrophe, double quote, backslash or semicolon, so it
-- stays inside both the JSON string and the SQL string literal that hold it.
UPDATE fleet_tasks
   SET definition = replace(definition, 'Reply in exactly this form, each on its own line:', 'Hard limits: never propose or route to traditional journal submission, publication goes only to papers.qnfo.org (NO-JOURNALS-1), and never cross-pollinate personal-api work into research endpoints (PERSONAL-QNFO-SEPARATION-1). Reply in exactly this form, each on its own line:'),
       version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE id = 'management-personas' AND instr(definition, 'NO-JOURNALS-1') = 0
   AND length(definition) - length(replace(definition, 'Reply in exactly this form, each on its own line:', '')) = length('Reply in exactly this form, each on its own line:');

-- ---------------------------------------------------------------- the issue contracts of 100405, 1000100, 1000102 and 1000186 measure their condition (VACUOUS-PROBE-V3-1 replaced).
-- Guarded on the vacuous marker in the action text, so a probe a doer wrote by hand is left alone. 100405 is active live (precondition ISSUE-PROBE-AGENT-1, probe found_action: any code task that mentions the note), so its guard also accepts that.
UPDATE remediation_contracts SET verify_probe = 'SELECT ''enforced'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM ops_config WHERE key = ''OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1'') AND (SELECT status FROM agent_issues WHERE title LIKE ''COST-QUALITY-FLOOR-ENFORCE-1:%'' ORDER BY id DESC LIMIT 1) IN (''closed'', ''resolved'') THEN ''enforced'' ELSE ''recorded-only'' END AS observed', verify_transport = 'd1-query',
  action = 'MEASURES enforcement: the owner cost and quality directive is a record in ops_config until COST-QUALITY-FLOOR-ENFORCE-1 is closed (qnfo-ai reverts a downgrade while output quality falls). Reads enforced only when the key exists and that issue is closed. SWEEP-DATA-FIXES-A-1.',
  precondition = 'SWEEP-DATA-FIXES-A-1', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-100405' AND issue_id = 100405 AND status IN ('superseded', 'active') AND substr(action, 1, 18) = 'VACUOUS-PROBE-V3-1' AND instr(verify_probe, 'found_action') > 0;

UPDATE remediation_contracts SET verify_probe = 'SELECT ''recorded'' AS expected, CASE WHEN COUNT(*) >= 1 THEN ''recorded'' END AS observed FROM decision_log WHERE instr(evidence, ''op-mvn8obo496f4'') > 0 AND instr(assumption, ''no write or dispatch tool'') > 0', verify_transport = 'd1-query',
  action = 'MEASURES the record: decision_log holds the SWEEP-DATA-FIXES-A-1 row that names op-mvn8obo496f4 and states that the chat thread had no write or dispatch tool and that authority rests with server-side action carriers. Reading it with this probe is the proof that the fleet can read the record.',
  precondition = 'SWEEP-DATA-FIXES-A-1', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-1000100' AND issue_id = 1000100 AND status = 'superseded' AND substr(action, 1, 18) = 'VACUOUS-PROBE-V3-1';

UPDATE remediation_contracts SET verify_probe = 'SELECT ''2|spam'' AS expected, (SELECT CAST(COUNT(DISTINCT e.id) AS TEXT) FROM email_filters f JOIN emails e ON lower(e.sender) = lower(f.pattern) WHERE e.id IN (1077, 1104) AND f.enabled = 1 AND f.action = ''spam'' AND lower(f.field) IN (''from'', ''sender'')) || ''|'' || COALESCE((SELECT status FROM emails WHERE id = 1104), '''') AS observed', verify_transport = 'd1-query',
  action = 'MEASURES the defect: both journal-pitch senders (the senders of emails 1077 and 1104) have an enabled spam filter that qnfo-email applyFilters reads, and email 1104 is spam. Expected 2|spam.',
  precondition = 'SWEEP-DATA-FIXES-A-1', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-1000102' AND issue_id = 1000102 AND status = 'superseded' AND substr(action, 1, 18) = 'VACUOUS-PROBE-V3-1';

UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT 1 - COUNT(*) FROM fleet_tasks WHERE id = ''management-personas'') + (SELECT COUNT(*) FROM fleet_tasks WHERE id = ''management-personas'' AND (instr(definition, ''NO-JOURNALS-1'') = 0 OR instr(definition, ''PERSONAL-QNFO-SEPARATION-1'') = 0)) + (SELECT COUNT(*) FROM fleet_agents WHERE (id = ''portfolio-manager'' OR id LIKE ''program-manager:%'') AND (instr(system_prompt, ''PERSONAL-QNFO-SEPARATION-1'') = 0 OR instr(system_prompt, ''NO-JOURNALS-1'') = 0)) + (SELECT COUNT(*) FROM management_personas WHERE instr(decision_authority, ''PERSONAL-QNFO-SEPARATION-1'') = 0 OR instr(decision_authority, ''NO-JOURNALS-1'') = 0) AS TEXT) AS observed', verify_transport = 'd1-query',
  action = 'MEASURES enforcement: the fleet_tasks management-personas workflow definition (its roadmap-proposal prompt), the six fleet_agents prompts and the six management_personas decision_authority texts each name NO-JOURNALS-1 and PERSONAL-QNFO-SEPARATION-1. Counts what is missing, expected 0. The dashboard narrative that reads the fleet_agents prompts is silent at a breached cap (PSR-NARRATIVE-CAP-SOFT-1).',
  precondition = 'SWEEP-DATA-FIXES-A-1', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-1000186' AND issue_id = 1000186 AND status = 'superseded' AND substr(action, 1, 18) = 'VACUOUS-PROBE-V3-1';

-- ---------------------------------------------------------------- follow-ups promised above, each filed once (deduped on the title of an open issue) with a doer and a probe.
-- Each carries a code-probe line (a code-read contract made from the line). None of the texts contains the marker the metric counts.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'COST-QUALITY-FLOOR-ENFORCE-1: a downgrade at a spend cap must revert when output quality falls',
  'Charter pillar: cost. Owner note 2026-10-21 (agent_issues 100405, OWNER-NOTE-46), verbatim: Cost-consciousness directive: quality may not be reduced to cut cost; prefer lower-cost paths only when quality is preserved. It is recorded as ops_config OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1 with enforced_by none: no loop reads it. qnfo-ai downgrades callers at a breached ai_spend cap (BUDGET-SOFT-ROUTE-1) without looking at output quality, and fleet_budget ai_spend:workers-ai reads 660.09 against a cap of 95 on 2026-10-26, so the downgrade is live at all three places where qnfo-ai makes it and nothing checks that quality held.' || char(10) ||
  'Doer: qnfo-code-orchestrator. In qnfo-ai/worker.js add one shared check that reads v_output_quality_headline from qnfo-audit next to the fleet_budget reads (cached with them, at most an hour old) and is true when worse > 0 (an outcome measure fell against seven days earlier). Apply it at all three downgrade points: (1) spendGovern, the route-level decision, where a downgrade is answered allow while the check is true, (2) spendGovernWA, the Workers AI chokepoint that records the downgrade and returns SPEND_CHEAP_WA, which returns the requested model while the check is true, and (3) the FLEET-CAP-STEER-1 twin switch (ops_config ai_fleet_cap_steer, FLEET_STEER_SWITCH, fleetSteerDecide), which runs the requested model instead of the cheaper twin while the check is true. Put quality floor in the ledger reason. While worse = 0 the cheaper path stays the default and a breached cap still never refuses or stops work. Raise VERSION by a minor (a new decision the router takes on its own) and keep deployed-current.worker.js identical.' || char(10) ||
  'The closing condition needs a suite, not a string: the doer creates qnfo-ai/quality-floor.test.mjs, and that suite must assert for each of the three points (spendGovern, spendGovernWA and the fleet cap steer) that a downgrade is lifted when worse > 0 and still made when worse = 0. A comment or a view name in worker.js does not close this issue.' || char(10) ||
  'Definition of done: qnfo-ai/quality-floor.test.mjs exists and names spendGovernWA (the code-probe below passes) and its assertions pass in CI.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-ai/worker.js' || char(10) ||
  'code-anchor: else if (d.action === "downgrade") spendRecord(env, provider, model, 0, 0, { downgraded: true });' || char(10) ||
  'code-probe: {"paths": ["qnfo-ai/quality-floor.test.mjs"], "contains": "spendGovernWA"}',
  'session', 'optimization', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'COST-QUALITY-FLOOR-ENFORCE-1: a downgrade at a spend cap must revert when output quality falls' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'PSR-NARRATIVE-CAP-SOFT-1: the weekly program narrative stays silent at a breached ai_spend cap, against BUDGET-SOFT-ROUTE-1',
  'Charter pillar: cost. BUDGET-SOFT-ROUTE-1 (owner directive 2026-10-06): a breached ai_spend cap steers to the cheapest capable model and never stops work. psrNarrativeAllowed in qnfo-fleet-dashboard/worker.js returns false when any fleet_budget ai_spend current exceeds its cap (ai_spend:workers-ai reads 660.09 against 95 on 2026-10-26) and when the budget cannot be read, and the weekly review then skips the model narrative for every program, so the persona prompts in fleet_agents (which only psrNarrative reads) never run at a cap.' || char(10) ||
  'Doer: qnfo-code-orchestrator. Replace the boolean gate: always ask for the narrative, and when a cap is breached or the budget is unreadable call psrNarrative(env, pm, promptText, true), which uses only PSR_FREE_MODEL (the paid model stays out). Keep narrative_allowed in the result and add narrative_tier (free or paid) so the weekly summary says which ran. The deterministic text still stands when the free model returns nothing.' || char(10) ||
  'Scope note on the hard limits (agent_issues 1000186): the two limits inserted into the management-personas workflow cover only its roadmap-proposal prompt (step rm-research). The steps rc-agent-request, red-agent-request, parked-agent-request and lever-request also call a model and are not covered.' || char(10) ||
  'Definition of done: the text that keeps the narrative silent is gone from the worker (the code-probe below passes) and the next Monday review writes narratives while a cap is breached.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js' || char(10) ||
  'code-anchor: const narrativeAllowed = await psrNarrativeAllowed(env);' || char(10) ||
  'code-probe: {"paths": ["qnfo-fleet-dashboard/worker.js"], "absent": "if (narrativeAllowed) {"}',
  'session', 'optimization', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'PSR-NARRATIVE-CAP-SOFT-1: the weekly program narrative stays silent at a breached ai_spend cap, against BUDGET-SOFT-ROUTE-1' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'COST-QUALITY-FLOOR-DOC-1: state the owner cost and quality directive in the autonomous operation doctrine',
  'Charter pillar: cost. The owner''s note of 2026-10-21 (agent_issues 100405) is a standing directive and is recorded in ops_config OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1 only; the doctrine document, which lists the standing directives with their words, does not carry it.' || char(10) ||
  'Doer: qnfo-code-orchestrator (docs/**.md is inside the code loop''s merge scope). Add a section Standing directive (2026-10-21, cost and quality floor) above the 2026-10-26 one: the owner''s words verbatim (Cost-consciousness directive: quality may not be reduced to cut cost; prefer lower-cost paths only when quality is preserved.), the id COST-QUALITY-FLOOR-1, the key it is stored under, that it is recorded and not yet enforced, and that enforcement is COST-QUALITY-FLOOR-ENFORCE-1. It moves no limit: the interrupt gate, the harness checks, the secret lock and live work claims keep their precedence.' || char(10) ||
  'Definition of done: the document names the key (the code-probe below passes).' || char(10) ||
  'code-task: repo=qnfo-workers path=docs/AUTONOMOUS-OPERATION-DOCTRINE.md' || char(10) ||
  'code-anchor: ## Standing directive (2026-10-26, auto-approve all)' || char(10) ||
  'code-probe: {"paths": ["docs/AUTONOMOUS-OPERATION-DOCTRINE.md"], "contains": "OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1"}',
  'session', 'optimization', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'COST-QUALITY-FLOOR-DOC-1: state the owner cost and quality directive in the autonomous operation doctrine' AND status = 'open');


-- ---------------------------------------------------------------- failure mode: a ticket quotes the marker its own metric counts
INSERT OR IGNORE INTO bak_20261026_sweep_a_created (tbl, pk)
SELECT 'failure_modes', 'ticket-quotes-its-own-counted-marker' WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'ticket-quotes-its-own-counted-marker');

INSERT OR IGNORE INTO bak_20261026_sweep_a_created (tbl, pk)
SELECT 'remediation_contracts', 'fm-ticket-quotes-its-own-counted-marker' WHERE NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = 'fm-ticket-quotes-its-own-counted-marker');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('ticket-quotes-its-own-counted-marker',
  'a metric ticket (or the trigger that files it) quotes the literal its own metric counts, so the ticket is one of the items it reports and the metric cannot reach its target while the ticket is open',
  'METRIC-TRIGGER-2934 session_dependent_issues_open counts open issues whose description contains the session-task marker; the ticket description and analytics_metric_triggers 2934 action quote the example query with that literal, so on 2026-10-26 the ticket was one of the issues the metric counted and every refile copied the literal again',
  'SWEEP-DATA-FIXES-A-1 rewrites the quoted pattern to the equivalent concatenation in both texts, and the detector reads for a recurrence (an open issue or the trigger action quoting the LIKE pattern)',
  'the d1-query contract fm-ticket-quotes-its-own-counted-marker counts open agent_issues and analytics_metric_triggers rows that contain the quoted pattern, expected 0', 'fm-ticket-quotes-its-own-counted-marker', '2026-10-26', 99916,
  'a trigger action or a ticket description quotes the pattern its metric counts',
  'the metric reads at least 1 while its own ticket is open and the ticket can never be closed by the recovery of the others',
  'session_dependent_issues_open and any metric whose count is a text match over agent_issues descriptions');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-ticket-quotes-its-own-counted-marker', NULL, 'SWEEP-DATA-FIXES-A-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues WHERE status = ''open'' AND instr(description, ''%session-task:%'') > 0) + (SELECT COUNT(*) FROM analytics_metric_triggers WHERE instr(action, ''%session-task:%'') > 0) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

-- ---------------------------------------------------------------- the decision record (one row; it is also the 1000100 record)
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_015kWmGuAq2fNuvzu4MrD7x3',
  'Issue 1000100 record: the owner reported (owner_prompts op-mvn8obo496f4) that the chat thread that queued the task held no write or dispatch tool, so execution authority rests with server-side action carriers, not with a chat thread: owner_prompts become agent_issues rows (TASK-INTENT-INTAKE-1, OWNER-NOTES-ROUTE-1) that the fleet loops and qnfo-ops execute, and a session builds the fleet but is never part of it (NO-CLAUDE-RUNTIME-DEPENDENCY-1). Every other premise was re-read from qnfo-audit and origin/main on 2026-10-26 before it was applied. Issue 3003 is not in this file because CADENCE-SLA-CONTINUITY-1 already fixed it. Where a proposal was wrong it was changed (cfc-artifacts is in use and becomes in_use, cfc-logpush records that Workers Trace Event Logpush is already in use). Two things are recorded but not enforced, and this row says so: the owner cost and quality directive (no loop reads the key), and the persona prompts in fleet_agents (the dashboard narrative that reads them is skipped while an ai_spend cap is breached, so the limits take effect today only through the roadmap-proposal step of the management-personas workflow prompt that runs).',
  'SWEEP-DATA-FIXES-A-1: (99916) the session-task marker removed from the ticket text and from analytics_metric_triggers 2934 so the ticket stops counting itself, with the failure mode ticket-quotes-its-own-counted-marker and its detector; (100388) the seven undecided Cloudflare catalog rows decided with reasons (cfc-artifacts in_use, six rejected); (100405) the owner cost and quality directive stored verbatim as ops_config OWNER_DIRECTIVE_2026_10_21_COST_QUALITY_1 as a record only, enforcement filed as COST-QUALITY-FLOOR-ENFORCE-1; (1000100) this record; (1000102) email_filters for the senders of emails 1077 and 1104, email 1104 to spam, control_registry row email-filter-journal-pitch-senders; (1000186) NO-JOURNALS-1 and PERSONAL-QNFO-SEPARATION-1 added once each to the six persona prompts and decision_authority texts and to the one fleet_tasks management-personas prompt that asks a model for roadmap proposals (step rm-research only: the steps rc-agent-request, red-agent-request, parked-agent-request and lever-request also call a model and are not covered), the stale cadence sentence corrected; management_personas sla_min 240 -> 120 (QUEUE-SLA-1) and path_b corrected to name both scorecard writers; follow-up issues filed with a doer and a probe (COST-QUALITY-FLOOR-ENFORCE-1, COST-QUALITY-FLOOR-DOC-1, PSR-NARRATIVE-CAP-SOFT-1); the vacuous probes of the issue contracts 100405, 1000100, 1000102 and 1000186 replaced by probes that measure the condition',
  'qnfo-audit SELECT reads 2026-10-26: agent_issues 99916 and analytics_metric_triggers 2934 (the literal in both; 99916 alone quotes the pattern), trigger 1204 query (7 slugs) with cloudflare_capability_catalog, cf_changelog_items and qnfo-artifacts /health 1.2.3, agent_issues 100405 and ops_config (no directive key), owner_prompts op-mvn8obo496f4 op-mvn8ocpfc485 op-mvnqbba7470b, emails 1077 and 1104, email_filters 38, fleet_agents prompts and management_personas texts (sla_min 240 and the path_b wording on all six rows), fleet_tasks management-personas version 7 (the anchor sentence occurs once, in step rm-research), fleet_budget ai_spend:workers-ai 660.09 against cap 95, remediation_contracts issue-100405 issue-1000100 issue-1000102 issue-1000186; origin/main qnfo-email/worker.js applyFilters and the owner block path, qnfo-fleet-control/worker.js cfcClassify, qnfo-fleet-dashboard/worker.js psrNarrativeAllowed, qnfo-ai/worker.js spendGovern, docs/WORKER-LOGS-CONTRACT.md',
  'migration merged',
  'one agent_issues description, one analytics_metric_triggers action, seven cloudflare_capability_catalog rows, one ops_config row, two email_filters rows, one emails row (id 1104), one control_registry row, six fleet_agents prompts and six management_personas rows (decision_authority, sla_min, path_b), one fleet_tasks workflow definition (version + 1), four remediation_contracts rows re-pointed, three agent_issues rows filed (each with its code-probe contract), one failure mode with its detector; nothing is deleted and no other row is touched',
  'the Rollback header restores every changed text column from bak_20261026_sweep_a_* (the workflow prompt by removing exactly the inserted sentence) and deletes the rows recorded in bak_20261026_sweep_a_created; this decision_log row and the three follow-up issues stay',
  'the two hard limits are in the persona definitions and in the roadmap-proposal prompt of the management-personas workflow that runs today (the other model-calling steps rc-agent-request, red-agent-request, parked-agent-request and lever-request are not covered) (the dashboard narrative that reads the persona prompts is skipped at a breached ai_spend cap, filed as PSR-NARRATIVE-CAP-SOFT-1); the owner cost and quality directive is a machine-readable record that nothing enforces yet (COST-QUALITY-FLOOR-ENFORCE-1); metric 2934 stops counting its own ticket and a detector reads for a recurrence; undecided Cloudflare features carry a recorded decision; two journal-pitch senders are blocked at ingest; management_personas sla_min is within QUEUE-SLA-1 and path_b names the writers that exist; four issue contracts measure their condition instead of nothing',
  'cf_changelog_open_proposals_14d <= 0 within 2 hours',
  'none',
  'd1:qnfo-audit (SELECT only); offline node:sqlite suite migrations/sweep-data-fixes-a.test.mjs; scripts/apply_migrations.py --check'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SWEEP-DATA-FIXES-A-1:') = 1);
