-- UNIFIED-COST-BYOK-ANTHROPIC-1 (2026-10-12, pillar cost; agent_issues 2118 METRIC-TRIGGER-353-UNIFIED-COST-USD-30D).
-- Measured 2026-10-12 11:00-11:30Z (CF GraphQL aiGatewayRequestsAdaptiveGroups, 30 days, by date/provider/model; and the
-- AI Gateway logs API, every costed row of each paid provider since 2026-09-12, by the per-request byok flag):
--   unified_cost_usd_30d = 224.55 = openai 197.78 + anthropic 25.96 + alibaba 0.70 + unbiased 0.12.
--   anthropic: 204 costed rows, all byok = "default" ($25.96), 31 rows byok null at $0. The spend was billed by Anthropic
--     on the stored gateway key, not against the gateway credit. qnfo-fleet-control aiSpendByBilling classifies by provider
--     with AIG_BYOK_PROVIDERS defaulting to "deepseek" (the variable is not set on the live worker, and the canonical deploy
--     does not install [vars]), so anthropic is counted as unified. openai: 2,118 rows byok null ($195.64, unified) and 37
--     rows byok "default" ($2.13). alibaba and unbiased: byok null (unified).
--   Billed unified spend is therefore $196.46, not $224.55: still over $150, so the metric stays honestly in breach.
--   No unified (or any paid-provider) gateway spend after 2026-09-26: last 7 days $0.00. No fleet worker is in the unified
--     line (rows carry no cf-aig-metadata worker; ai_spend_ledger holds $0.59 of DeepSeek and $0 of openai/anthropic in 30
--     days). The unified dollars are agent-session and client traffic of 2026-09-17..26 (openai gpt-5.5: 09-18 $17.96,
--     09-19 $58.16, 09-21 $10.59, 09-22 $25.31, 09-23 $3.01, 09-24 $28.08, 09-26 $54.43).
--   The 30-day window drops 09-17..09-19 ($77.6 unified) by 2026-10-20, leaving about $119 <= 150: the breach clears on
--     its own around 2026-10-20 without any lever, and reads $0 from 2026-10-27 unless new unified traffic arrives.
-- This file:
--   1. keeps the current trigger #353 owner/action/notes in infra_state, then re-points the action at the measured state
--      (the old text said "ages out about 2026-10-26" and counted anthropic as billed);
--   2. registers the failure mode (a BYOK provider counted as unified billing) with a detector that fails while the
--      measurement still counts anthropic: byok_cost_usd_30d must cover the deepseek and anthropic amounts that
--      cost_usd_30d.source_of_truth lists. The code fix is in qnfo-fleet-control aiSpendByBilling and costRunRate (default
--      AIG_BYOK_PROVIDERS "deepseek,anthropic"); that file was under another session's live work claim (PR 1000) when
--      this was written, so the fix rides the action's code-task line.
-- The target ($150) is unchanged.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE analytics_metric_triggers SET action = (SELECT json_extract(data, '$.action') FROM infra_state WHERE id = 'backup-trigger-353-20261012-byok-anthropic'), notes = (SELECT json_extract(data, '$.notes') FROM infra_state WHERE id = 'backup-trigger-353-20261012-byok-anthropic') WHERE id = 353; DELETE FROM remediation_contracts WHERE class = 'fm-byok-provider-counted-unified'; DELETE FROM failure_modes WHERE fm_key = 'byok-provider-counted-unified';

INSERT OR IGNORE INTO infra_state (id, ts, kind, data)
SELECT 'backup-trigger-353-20261012-byok-anthropic', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'analytics_metric_triggers-backup', json_object('owner', owner, 'action', action, 'notes', notes)
FROM analytics_metric_triggers WHERE id = 353;

UPDATE analytics_metric_triggers SET
  action = 'Pillar cost. Billed unified AI spend (analytics_dash_meta.unified_cost_usd_30d) is above the owner''s $150/30d threshold. Measured 2026-10-12 (UNIFIED-COST-BYOK-ANTHROPIC-1): the $224.55 is openai $197.78 + anthropic $25.96 + alibaba $0.70 + unbiased $0.12, all from 2026-09-17..26 agent-session and client traffic (no fleet worker; nothing paid in the last 7 days). The gateway logs show every costed anthropic row and $2.13 of openai as byok "default", billed by the provider, so the billed unified figure is $196.46: qnfo-fleet-control aiSpendByBilling counts anthropic as unified because AIG_BYOK_PROVIDERS defaults to "deepseek". Lever 1 (measurement): default AIG_BYOK_PROVIDERS to "deepseek,anthropic" in aiSpendByBilling and costRunRate (failure mode byok-provider-counted-unified). Lever 2: none needed for the old burst; the 30-day window drops 2026-09-17..19 by 2026-10-20 (about $119 left). If new unified spend appears, find its caller (gateway logs metadata, userAgent) and, for a worker, move it to Workers AI or the cheap model; for a client, the gateway spend limit (gateway_cap_30d_usd) is the lever and the fleet records why. Raising the $150 only to clear this metric is not a fix. Definition of done: unified_cost_usd_30d <= 150 in analytics_dash_meta, before and after values in issue_triage.close_evidence.
code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js
code-anchor: function aiSpendByBilling(rows, env) {',
  notes = COALESCE(notes, '') || ' | UNIFIED-COST-BYOK-ANTHROPIC-1 2026-10-12: anthropic is BYOK in the gateway logs ($25.96); billed unified $196.46; window ages the burst out about 2026-10-20; backup infra_state backup-trigger-353-20261012-byok-anthropic'
WHERE id = 353 AND metric_key = 'unified_cost_usd_30d' AND instr(COALESCE(notes, ''), 'UNIFIED-COST-BYOK-ANTHROPIC-1') = 0;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('byok-provider-counted-unified',
  'AI Gateway spend billed by a provider on a stored (BYOK) key is counted as unified billing against the gateway credit',
  'qnfo-fleet-control aiSpendByBilling splits by provider name with AIG_BYOK_PROVIDERS defaulting to "deepseek"; anthropic has a stored gateway key too (gateway logs byok = "default" on every costed row), and the env variable is not set live because the canonical deploy does not install [vars]',
  'default AIG_BYOK_PROVIDERS to "deepseek,anthropic" in aiSpendByBilling and costRunRate (qnfo-fleet-control); when a provider key is added or removed in the gateway, change the default in the same PR',
  'remediation_contracts fm-byok-provider-counted-unified: byok_cost_usd_30d covers the deepseek and anthropic amounts listed in metric_registry cost_usd_30d.source_of_truth',
  'fm-byok-provider-counted-unified', '2026-10-12', 2118,
  'a provider with a stored gateway key carries cost in aiGatewayRequestsAdaptiveGroups',
  'unified_cost_usd_30d overstated by that provider''s spend ($25.96 anthropic on 2026-10-12); trigger #353 and the qnfo-ai router read the overstated figure',
  'trigger #353 breach size, the qnfo-ai gateway_unified_usd budget input, ai_spend:total cap');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-byok-provider-counted-unified', 2118, 'UNIFIED-COST-BYOK-ANTHROPIC-1', 'failure-mode detector',
  'SELECT ''1'' AS expected, CASE WHEN (SELECT CAST(value AS REAL) FROM analytics_dash_meta WHERE key = ''byok_cost_usd_30d'') + 0.01 >= (SELECT CASE WHEN instr(source_of_truth, ''deepseek $'') > 0 THEN CAST(substr(source_of_truth, instr(source_of_truth, ''deepseek $'') + 10) AS REAL) ELSE 0 END + CASE WHEN instr(source_of_truth, ''anthropic $'') > 0 THEN CAST(substr(source_of_truth, instr(source_of_truth, ''anthropic $'') + 11) AS REAL) ELSE 0 END FROM metric_registry WHERE metric = ''cost_usd_30d'') THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);
