-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = replace(verify_probe, ' AND json_extract(meta, ''$.caller'') <> ''qnfo-model-eval''', '') WHERE class = 'fm-unknown-model-id-silent-default';
-- FM-UNKNOWN-MODEL-ID-CALLER-1 (2026-10-26, charter pillar autonomy). The detector fm-unknown-model-id-silent-default has failed on every one of its 691 attempts. Measured in
-- cloud_ops_events over the last three days: kind model-unknown-id holds 36 events from qnfo-ai-calibration for 'nonexistent-model-xyz' (the intended canary, already excluded by the probe)
-- and 2 from qnfo-model-eval for '@cf/nvidia/nemotron-3-120b-a12b'. qnfo-model-eval/worker.js abCall asks the router first by design (ANTIFRAGILE-1): the router does not serve nemotron, answers
-- with its unknown-id default and logs the event, abSameModel then sees that the served model is not the asked one, discards the reply and calls the model directly through env.AI.
-- No caller received a silently substituted answer. The probe now also leaves out that one caller; every other caller of the router with an id it does not serve still turns the detector red.

UPDATE remediation_contracts
SET verify_probe = replace(verify_probe, 'AND json_extract(meta, ''$.requested'') <> ''nonexistent-model-xyz''', 'AND json_extract(meta, ''$.requested'') <> ''nonexistent-model-xyz'' AND json_extract(meta, ''$.caller'') <> ''qnfo-model-eval'''),
    attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'fm-unknown-model-id-silent-default' AND instr(verify_probe, 'qnfo-model-eval') = 0;
