-- CONTROL-ALT-PROBES-5 (2026-10-28, pillar autonomy; agent_issues 2826 PATHS-UNTESTED-1; follows migrations/2026-10-26-control-alternate-probes4*.sql)
-- v_path_coverage_violations read 2 rows of state alternate-untested on 2026-10-28T19:20Z: pub-gate-withdraw and owner-authorization-hold-100576. Both controls were
-- removed or released on 2026-10-26 (dispositions applied), and each alternate leaves a D1 trace, so neither is ALTERNATE-NOT-EXERCISABLE; they only had no probe, and
-- control_registry.alternate_tested_at has no writer except the chaos drill (qnfo-fleet-control chaosDrill reads control_alternate_probes every 360 minutes and stamps on a pass).
-- This file gives each a read-only expected/observed probe on the alternate's own evidence; nothing is stamped from a declaration.
--   * pub-gate-withdraw: the alternate is "revise instead of withdraw, the paper stays published". Evidence: the hourly quality-score sweep event (cloud_ops_events, text carries
--     pass=/revise=/withdrawn= counts) inside 180 minutes with revise above 0. Live read 2026-10-28T18:21Z: pass=467 revise=238 withdrawn=0.
--   * owner-authorization-hold-100576: the alternate is the release condition. Evidence: the owner directive row OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1 in ops_config
--     and the control's own evidence recording RELEASED.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: control_alternate_probes
-- Rollback: DELETE FROM control_alternate_probes WHERE control IN ('pub-gate-withdraw', 'owner-authorization-hold-100576');

INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled) VALUES
 ('pub-gate-withdraw',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''quality-score'' AND ts > strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-180 minutes'')) THEN ''no quality-score sweep in 180 minutes, so the publication gate is not running and the revise alternate has no evidence'' WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''quality-score'' AND ts > strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-180 minutes'') AND text LIKE ''%revise=%'' AND text NOT LIKE ''%revise=0 %'') THEN ''the sweeps of the last 180 minutes put no paper in revise, so the alternate to withdrawal is unexercised'' ELSE ''ok'' END AS observed',
  '180 minutes: the quality sweep runs hourly, so two missed runs plus the 60 minute grace; a state probe on the sweep event whose text carries revise=N',
  1),
 ('owner-authorization-hold-100576',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM ops_config WHERE key = ''OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1'') THEN ''the owner directive that released the hold is missing from ops_config'' WHEN NOT EXISTS (SELECT 1 FROM control_registry WHERE control = ''owner-authorization-hold-100576'' AND evidence LIKE ''%RELEASED%'') THEN ''the control row does not record its release'' ELSE ''ok'' END AS observed',
  'state probe: the release condition (owner directive row) and the control row that records the release; no window',
  1);
