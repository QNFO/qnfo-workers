-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = '{"paths": ["personal-companion/worker.js"], "contains": "text: cutAtSentence(a.text, per)"}' WHERE class = 'fm-companion-source-cut-mid-sentence'
-- DETECTOR-STABLE-MARKER-1 (2026-10-14, pillar personal; metric failure_modes_recurring). The code-read detector of companion-source-cut-mid-sentence
-- looked for the exact text "text: cutAtSentence(a.text, per)". personal-companion 1.25.5 PRIMARY-SHARE-1 (PR 1259) gives the subject anchor its own
-- share, so the call reads "cutAtSentence(a.text, i === 0 ? prim : rest)": every source is still cut at a sentence end (causal-source.test.mjs),
-- but the detector read "missing-marker" and counted a recurrence that is not there. It now checks the stable prefix of the call, which holds
-- whatever share each anchor gets. Data only: no trigger is created or dropped; remediation_probe_edit_rerun re-runs the probe at once.
UPDATE remediation_contracts SET verify_probe = '{"paths": ["personal-companion/worker.js"], "contains": "text: cutAtSentence(a.text, "}'
WHERE class = 'fm-companion-source-cut-mid-sentence';
