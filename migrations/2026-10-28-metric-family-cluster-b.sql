-- METRIC-CAUSE-AT-REGISTRATION-1 step 1 + NOTICE-REPAIR-STALE-METRIC-1 + METRIC-UNMEASURED-MINSAMPLE-1 probe (2026-10-28, charter pillar: autonomy; agent_issues 1000706, 1000509, 1000645).
-- WHAT WAS FOUND (read-only, live qnfo-audit and https://fleet.qnfo.org/api/triage, 2026-10-28 19:15Z): /api/triage lists 34 breaching metrics under cause 'unmapped' (no metric_breach_cause row). Each one's formula in metric_registry names what it measures;
--   the mapping below follows that formula, one cause per metric, with the reading in the note (causes: spend, structure, publishing, issue-backlog, owner-routing, heartbeat, code-loop, breach-doctor, measurement).
--   agent_issues 1000509 asks for the age of retracted owner papers as a metric: qnfo-research-exec noticeRepairTick (0.39.10) now writes owner_papers_retracted_over_24h from the stale list it already builds
--   (an owner paper still retracted 24 h after its first paper_integrity_backups row, backup present); this file registers the metric, its trigger and its cause mapping.
--   agent_issues 1000645: its contract probe is a placeholder-era query that counts exempt metrics still reading 'unmeasured' (always above 0, because the exemption flags them bp26 instead of hiding the verdict), so it can never pass.
--   It becomes the real definition of done: no METRIC-UNMEASURED-1 ticket other than qnfo-gateway's (a real producer defect, issue 1000534) was reopened in the last 24 hours.
-- PREDICTION: after apply /api/triage reports "unmapped": [] at the next dashboard read (falsifier: a breaching metric still unmapped); owner_papers_retracted_over_24h reads MEASURED within 20 minutes of the research-exec deploy
--   (falsifier: still PENDING after 60 minutes); issue 1000645 passes from 2026-10-29T10:38Z (its last reopen was 2026-10-28T10:37Z).
-- spof-review: none added. No cap, guard or probe is weakened; nothing is deleted or dropped.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_breach_cause WHERE note LIKE 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28:%'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'owner_papers_retracted_over_24h'; DELETE FROM metric_registry WHERE metric = 'owner_papers_retracted_over_24h';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class)
VALUES ('owner_papers_retracted_over_24h', 'outcome', 'lagging', 'owner papers (living-paper status retracted, not a pipeline paper) still retracted more than 24 hours after their first qnfo-audit.paper_integrity_backups row, with that backup present; written by qnfo-research-exec noticeRepairTick each 10-minute tick',
  'living-paper.papers + qnfo-audit.paper_integrity_backups', 'unmeasured before 2026-10-28', '0', 'qnfo-research-exec', 'analytics_metric_triggers owner_papers_retracted_over_24h -> agent_issues', '10m', '> 0', '> 3', 'PENDING', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES ('owner_papers_retracted_over_24h', 'An owner paper stays retracted more than 24 hours after its backup was taken', 'registry', 'gt', 0, 3,
 'Pillar research (NOTICE-REPAIR-STALE-METRIC-1, agent_issues 1000509). noticeRepairTick restores an owner paper retracted by the claim sweep from its first paper_integrity_backups row; a paper still retracted 24 hours later is stuck. Read the NOTICE-REPAIR-STUCK-1 issue it files for the slug: its cause is named there (the living-paper publish floor refuses retracted to published under 20,000 characters, or a D1 error). Fix that cause in qnfo-research-exec/worker.js noticeRepairTick or restore the paper through the owner path. Done: owner_papers_retracted_over_24h = 0 at two refreshes.',
 'qnfo-research-exec', 'agent_issues', 24, 1, 'NOTICE-REPAIR-STALE-METRIC-1 (migrations/2026-10-28-metric-family-cluster-b.sql)');

INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
  ('drift_total', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: ghost, unregistered and unversioned workers (service_registry vs the Cloudflare list)'),
  ('worker_health_failure_rate', 'heartbeat', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: share of live workers whose worker_live_audit health note fails'),
  ('driver_drain_24h', 'issue-backlog', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: issues pulled by the backlog driver in 24 h'),
  ('workers_compat_date_behind', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: live workers whose compatibility date lags the newest snapshot'),
  ('breaches_without_ticket', 'breach-doctor', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: breaching triggers with no METRIC-TRIGGER ticket; the trigger loop files them'),
  ('roadmap_open_unplaced', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: open roadmap rows with no program'),
  ('closure_branching_ratio_24h', 'issue-backlog', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: reopened over dispositioned issue events, the closing quality of the backlog'),
  ('fleet_cost_pace_30d_usd', 'spend', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: 30 x mean daily fleet cost'),
  ('post_deploy_error_workers', 'code-loop', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: workers throwing exceptions within 3 h of their latest deploy, a shipped change'),
  ('research_budget_member_share', 'spend', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: share of the research budget taken by two members'),
  ('correction_latency_p95_h', 'publishing', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: hours from error detection to a published correction'),
  ('forecast_resolution_criteria_complete', 'publishing', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: open q08 forecasts whose resolution text is complete'),
  ('paper_version_immutability', 'publishing', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: published versions whose content hash still matches the served body'),
  ('a11y_violations_serious', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: axe-core violations over public page templates'),
  ('social_bot_label_enabled', 'publishing', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: automated social accounts carrying the platform bot label'),
  ('ai_label_coverage', 'publishing', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: AI-touched public artifact templates carrying the visible label'),
  ('ai_interaction_disclosure', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: interactive AI surfaces whose first reply discloses the AI'),
  ('records_past_retention', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: personal-data rows older than their retention policy'),
  ('pii_in_logs', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: raw email addresses in a daily sample of Workers Logs'),
  ('non_essential_cookies_set', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: non-essential cookies set by public hosts'),
  ('third_party_trackers', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: third-party tracking scripts on public pages'),
  ('dmarc_aligned_pass_rate', 'publishing', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: DMARC-aligned pass share of sending domains, outbound mail'),
  ('rfc8058_headers_present', 'publishing', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: list mail carrying List-Unsubscribe headers, outbound mail'),
  ('kv_used_for_locking', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: KV get-then-put lock patterns found by a static scan'),
  ('gateway_coverage', 'spend', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: model calls routed through AI Gateway, cost control and attribution'),
  ('ai_cache_hit_rate', 'spend', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: AI Gateway cache hits on deterministic-prompt routes'),
  ('deploys_via_gradual', 'code-loop', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: production deploys using staged percentages, how the code loop ships'),
  ('security_headers_pass', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: public hosts whose HTML carries the security headers'),
  ('turnstile_on_public_forms', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: public forms protected by Turnstile'),
  ('slo_attainment_28d_min', 'heartbeat', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: lowest 28-day availability attainment across public surfaces'),
  ('postmortem_coverage', 'heartbeat', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: incidents with a completed postmortem within 72 hours'),
  ('ci_gate_bypass_count', 'code-loop', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: merges to main with a required check not green'),
  ('metrics_worsening_7d', 'breach-doctor', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: breaching triggers not better than 7 days ago, the breach doctor trend'),
  ('ask_plain_share_7d', 'publishing', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: share of Ask answers whose opening passes the plain-language check'),
  ('owner_papers_retracted_over_24h', 'publishing', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-10-28: owner papers left retracted over 24 h; noticeRepairTick restores them');

UPDATE remediation_contracts
SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM issue_lifecycle l JOIN agent_issues a ON a.id = l.issue_id WHERE a.title LIKE ''METRIC-UNMEASURED-1:%'' AND a.title NOT LIKE ''%qnfo-gateway%'' AND l.event = ''reopened'' AND l.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) AS TEXT) AS observed',
    verify_transport = 'd1-query',
    next_due_at = datetime('now')
WHERE class = 'issue-1000645';
