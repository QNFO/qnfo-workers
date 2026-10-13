-- MAIL-DRAFT-COMPLETE-1 (qnfo-fleet-dashboard 1.35.0, 2026-10-13, pillar personal): the mail-draft-fabrication failure mode
-- now records the complete-draft remediation. Owner, 2026-10-13: "when prompted the system must generate full, complete,
-- ready-to-send drafts. do not burden the user with manual effort or input". 1.34.0 left [[FILL]] gaps for the owner; 1.35.0
-- reads the facts itself and writes a complete reply. The detector (fm-mail-draft-fabrication) is unchanged.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE failure_modes SET remediation = 'qnfo-fleet-dashboard 1.34.0 MAIL-DRAFT-1 (gapped drafts)' WHERE fm_key = 'mail-draft-fabrication';
UPDATE failure_modes SET remediation = 'qnfo-fleet-dashboard 1.35.0 MAIL-DRAFT-COMPLETE-1 (on 1.34.0 MAIL-DRAFT-1): a dedicated drafting path that reads the facts itself (the stored thread; the qnfo.org public profile; the owner identity document in the private store; the GitHub record of any file or commit the thread names) and writes a complete, ready-to-send reply from those records only, including any statement the sender asks for; a sentence with a title, unit or placeholder no record supports is dropped in code; sign-off written in code; Send reply on every draft; send it' WHERE fm_key = 'mail-draft-fabrication';
