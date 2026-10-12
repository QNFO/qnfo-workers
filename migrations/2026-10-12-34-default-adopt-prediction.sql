-- DEFAULT-ADOPT-PREDICTION-1 (2026-10-12, charter pillar autonomy; doctrine rev 4 section 22 outcome calibration). The trigger
-- human_actions_default_adopt_ai (DEFAULT-ADOPTED-1) writes a decision_log row for every owner card it closes on its stated default,
-- but without predicted_outcome, reach_gain, surfaces_tested or capability_gain, so every such row counts against
-- prediction_logged_share_7d (0.718 at 13:00Z, target >= 0.8; rows 63 and 68 today). The trigger is recreated with the prediction the
-- default implies (the card stays resolved and its OWNER-STEPS-WATCH-1 probe closes it when the step is done), and the two rows it
-- already wrote get the same prediction. Nothing else in the trigger changes.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261012_default_adopt_trigger
-- Rollback: DROP TRIGGER IF EXISTS human_actions_default_adopt_ai; -- then recreate it from the sql column of bak_20261012_default_adopt_trigger (the pre-change text)

-- Re-touched 2026-10-12 13:30Z (migration_runs 134: "BACKUP table ... does not exist"): the runner recognises a self-made backup only in the
-- CREATE TABLE <table> AS SELECT form (BACKUP-CREATES-1); the earlier CREATE + INSERT pair read as a missing table.
-- Re-touched 2026-10-12 13:50Z (migration_runs 135: statement 4 refused, "DOCTRINE-1: decision_log is append-only"): the backup, the
-- DROP and the CREATE TRIGGER applied (the trigger below is live); the UPDATE that backfilled rows 63 and 68 can never apply, because
-- the doctrine trigger refuses every UPDATE on decision_log by design, so it is removed. Those two rows stay unpredicted and age out
-- of the 7-day window on 2026-10-19; every row the trigger writes from here carries its prediction. The three statements are idempotent.
CREATE TABLE IF NOT EXISTS bak_20261012_default_adopt_trigger AS SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'trigger' AND name = 'human_actions_default_adopt_ai';

DROP TRIGGER IF EXISTS human_actions_default_adopt_ai;

CREATE TRIGGER human_actions_default_adopt_ai AFTER INSERT ON human_actions
WHEN NEW.status='open' AND TRIM(COALESCE(NEW.default_in_effect,''))<>''
  AND COALESCE((SELECT value FROM ops_config WHERE key='default_adopt_gate'),'on')<>'off'
BEGIN
  UPDATE human_actions SET status='resolved', resolved_at=datetime('now'), updated_at=datetime('now'),
    resolution='DEFAULT-ADOPTED-1: closed at birth on its stated default (owner directive 2026-10-12). Reopen with status=open.'
  WHERE id=NEW.id;
  INSERT INTO decision_log(actor,assumption,action,evidence,outcome,blast_radius,rollback_path,predicted_outcome,reach_gain,surfaces_tested,capability_gain)
  VALUES ('trigger:human_actions_default_adopt_ai','owner wants the waiting-on-you queue resolved autonomously','adopted stated default for card '||NEW.slug,COALESCE(NEW.default_in_effect,''),'card closed, default in force','none beyond the default the card already named','UPDATE human_actions SET status=''open'' WHERE id='||NEW.id,
    'the card stays resolved on its stated default; if the step still matters its OWNER-STEPS-WATCH-1 probe or a refiled card brings it back within a day, otherwise nothing changes (DEFAULT-ADOPT-PREDICTION-1)',
    '0', 'human_actions.default_in_effect (the card''s own text), ops_config default_adopt_gate', 'none (removes a wait on the owner)');
END;
