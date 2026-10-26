-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM control_alternate_probes WHERE control = 'ask-plain-rewrite-gate' AND last_run_at IS NULL; UPDATE control_registry SET alternate_tested_at = '2026-10-26' WHERE control = 'ask-plain-rewrite-gate' AND alternate_tested_at IS NULL
-- spof-review: no new cron, binding, host, credential or critical-path dependency; one probe row, one hand-written date cleared, one decision_log row.
-- ASK-PLAIN-8 (2026-10-26, charter pillar autonomy; CONTROL-PROBE-AT-BIRTH-1, agent_issues 1000483). migrations/2026-10-26-ask-plain-1.sql registered the control ask-plain-rewrite-gate with a written
-- alternate_path and a hand-written alternate_tested_at and no control_alternate_probes row: v_control_alternate_status read drill_state no-probe for it. That is the defect the issue names (a control
-- registered without a probe, its tested date written by hand). The register stamps the date only from a passing probe (CONTROL-ALT-PROBES-1), so the hand-written date is cleared and the probe is added.
--
-- The alternate the control names is "it never withholds an answer": when the rewrite errors, times out or is no better the first checked draft is sent unchanged. The probe reads the data that
-- invariant leaves behind: ask_events.plain exists, and no answer that was rewritten (flag 8) in the last 7 days was sent with no text. It was run read-only against live qnfo-audit before it was
-- written here and reads ok (16 rows with a verdict in 7 days, 10 rewritten, all 10 with text). It fails the moment a rewritten answer goes out empty. It does not require a rewrite to have happened:
-- explain questions are now written by a stronger model that rewrites rarely, and an alternate that is exercised only by a defect should not fail the drill for being quiet.

INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled) VALUES
 ('ask-plain-rewrite-gate',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM pragma_table_info(''ask_events'') WHERE name = ''plain'') = 0 THEN ''fail: ask_events.plain does not exist, so the gate records no verdict'' WHEN (SELECT COUNT(*) FROM ask_events WHERE ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND plain IS NOT NULL AND (plain & 8) = 8 AND COALESCE(answer_chars, 0) = 0) > 0 THEN ''fail: '' || (SELECT COUNT(*) FROM ask_events WHERE ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND plain IS NOT NULL AND (plain & 8) = 8 AND COALESCE(answer_chars, 0) = 0) || '' rewritten answer(s) in the last 7 days were sent with no text, so the gate withheld an answer'' ELSE ''ok'' END AS observed',
  'rows of the last 7 days; ask_events.plain is NULL on answers that were never written and on rows older than 2.10.0, so a quiet week reads ok', 1);

UPDATE control_registry SET alternate_tested_at = NULL WHERE control = 'ask-plain-rewrite-gate' AND alternate_tested_at = '2026-10-26';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('claude-code-ask-plain-20261026', 'a control is registered with the probe of its alternate, and its tested date comes from that probe, never from the author',
   'ASK-PLAIN-8: one control_alternate_probes row for ask-plain-rewrite-gate; its hand-written alternate_tested_at cleared so the drill stamps it',
   'v_control_alternate_status 2026-10-26 18:50Z: ask-plain-rewrite-gate drill_state no-probe, alternate_tested_at 2026-10-26 written in migrations/2026-10-26-ask-plain-1.sql; agent_issues 1000483 CONTROL-PROBE-AT-BIRTH-1',
   'applies with the merge of this file', 'one control row and one probe row; no worker change', 'see the Rollback line; decision_log stays (append-only)',
   'the fleet drills the alternate of the Ask plain-language gate instead of trusting a written date',
   'v_control_alternate_status reads drilled for ask-plain-rewrite-gate after the next 6-hourly drill', 'ask.qwav.tech quality loop', 'the probe SQL run read-only against live qnfo-audit (ok)');
