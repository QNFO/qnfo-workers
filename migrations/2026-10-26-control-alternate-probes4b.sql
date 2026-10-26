-- CONTROL-ALT-PROBES-4B (2026-10-26, pillar autonomy; agent_issues 1000214; follows migrations/2026-10-26-control-alternate-probes4.sql, merged 18:50Z)
--
-- A review of the 18 new probes against the birth path of an issue found one that could flap. Clause 3 of the probe of breach-doctor-secret-change-measure fails when an open
-- SECRET-CHANGE-OBSERVED issue has no live contract (status active, holding or monitoring). A new issue is born with the contract status needs-machine-probe
-- (trigger agent_issues_birth_contract_ins, 34 contracts read that state on 2026-10-26) until the filing loop gives it its probe, so a drill that runs in the minutes after a secret-change issue is
-- filed would read the issue as having no closer and file a CHAOS-DRILL-FAILED-1 ticket against a rule that is working. Live now: 4 open SECRET-CHANGE-OBSERVED issues (1000200, 1000199, 100418 and 100333),
-- all with a monitoring or active contract, and the probe reads ok. The clause now ignores an issue younger than 120 minutes (the SLA-120M-1 ceiling for the loop to give it its
-- contract) and fails exactly as before for an older issue with no live contract: the reason text says older than 120 minutes. Clauses 1 and 2 are untouched.
-- The old probe text and window note are in bak_20261026_control_probes4b first. The Rollback line below does not read it: it replaces the new fragment by the old one and removes the note. The UPDATEs are
-- anchored on the text they replace or on a marker, so a second apply, or a probe someone has since changed, is left alone.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_control_probes4b
-- Rollback: UPDATE control_alternate_probes SET probe_sql = replace(probe_sql, 'instr(a.title, ''SECRET-CHANGE-OBSERVED: '') = 1 AND a.created_at < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 7200) * 1000 AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN (''active'', ''holding'', ''monitoring''))) THEN ''an open SECRET-CHANGE-OBSERVED issue older than 120 minutes has no live contract, so the rule in measure leaves it with no closer''', 'instr(a.title, ''SECRET-CHANGE-OBSERVED: '') = 1 AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN (''active'', ''holding'', ''monitoring''))) THEN ''an open SECRET-CHANGE-OBSERVED issue has no live contract, so the rule in measure leaves it with no closer'''), window_note = replace(window_note, ' | CONTROL-ALT-PROBES-4B 2026-10-26: an open SECRET-CHANGE-OBSERVED issue gets 120 minutes to carry its contract, because the birth contract of a new issue reads needs-machine-probe until the filing loop gives it its probe (34 contracts read that state on 2026-10-26).', '') WHERE control = 'breach-doctor-secret-change-measure'
-- Rollback note: decision_log stays (append-only).

CREATE TABLE IF NOT EXISTS bak_20261026_control_probes4b AS
  SELECT control, probe_sql AS old_probe_sql, window_note AS old_window_note FROM control_alternate_probes WHERE control = 'breach-doctor-secret-change-measure';

UPDATE control_alternate_probes SET probe_sql = replace(probe_sql, 'instr(a.title, ''SECRET-CHANGE-OBSERVED: '') = 1 AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN (''active'', ''holding'', ''monitoring''))) THEN ''an open SECRET-CHANGE-OBSERVED issue has no live contract, so the rule in measure leaves it with no closer''', 'instr(a.title, ''SECRET-CHANGE-OBSERVED: '') = 1 AND a.created_at < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 7200) * 1000 AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN (''active'', ''holding'', ''monitoring''))) THEN ''an open SECRET-CHANGE-OBSERVED issue older than 120 minutes has no live contract, so the rule in measure leaves it with no closer''')
WHERE control = 'breach-doctor-secret-change-measure' AND instr(probe_sql, 'instr(a.title, ''SECRET-CHANGE-OBSERVED: '') = 1 AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN (''active'', ''holding'', ''monitoring''))) THEN ''an open SECRET-CHANGE-OBSERVED issue has no live contract, so the rule in measure leaves it with no closer''') > 0;

UPDATE control_alternate_probes SET window_note = window_note || ' | CONTROL-ALT-PROBES-4B 2026-10-26: an open SECRET-CHANGE-OBSERVED issue gets 120 minutes to carry its contract, because the birth contract of a new issue reads needs-machine-probe until the filing loop gives it its probe (34 contracts read that state on 2026-10-26).'
WHERE control = 'breach-doctor-secret-change-measure' AND instr(window_note, 'CONTROL-ALT-PROBES-4B') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a3-drills',
  'a probe that reads the state of a record from its birth must allow for the time the record needs to reach its steady state, and the grace is the stated SLA (120 minutes), so a new record is not read as a missing one and an old one still is',
  'CONTROL-ALT-PROBES-4B: clause 3 of the probe of breach-doctor-secret-change-measure ignores an open SECRET-CHANGE-OBSERVED issue younger than 120 minutes and fails as before for an older issue with no live contract',
  'live qnfo-audit 2026-10-26 18:50Z: remediation_contracts statuses superseded 1174, active 939, closed 618, holding 403, monitoring 295, escalated 56, needs-machine-probe 34 (the status of a birth contract), probe-review-refused 28; the 4 open SECRET-CHANGE-OBSERVED issues carry monitoring or active contracts and the probe reads ok; the trigger agent_issues_birth_contract_ins writes status needs-machine-probe at birth. The offline suite migrations/control-alternate-probes4b.test.mjs replays the stored probe after the first file: a 30-minute-old issue with no contract reads ok after and FAILS before, a 121-minute-old issue reads the reason',
  'migration merged, the next 6-hourly drill reads the probe',
  'one stored probe text and one window note in control_alternate_probes, one backup table, read by the drill only',
  'the Rollback header replaces the new fragment by the old one and removes the note (decision_log stays: append-only)',
  'a drill that runs just after a secret-change issue is filed no longer reads the new issue as an unclosed one',
  'no CHAOS-DRILL-FAILED-1 control:breach-doctor-secret-change-measure issue is filed for a young issue, and one is still filed for an issue older than 120 minutes with no live contract',
  'none',
  'd1:qnfo-audit remediation_contracts, agent_issues, control_alternate_probes, sqlite_master trigger text (SELECT only), offline node:sqlite suite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CONTROL-ALT-PROBES-4B:') = 1);
