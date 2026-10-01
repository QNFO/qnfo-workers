-- ACT-HALF-PREDICATE-1 (#1285, 2026-10-01): "0 self_heal_actions rows with status=dispatched AND verified_at
-- IS NULL" only measures verification coverage; a failing verification satisfies it. Outcome reads must use the
-- LATEST remediation_verifications row per action_ref, so a later failure is never masked by an earlier pass.
-- Applied live.
CREATE VIEW IF NOT EXISTS v_remediation_latest_per_action AS
SELECT r.action_ref, r.issue_id, r.class, r.pass, r.expected, r.observed, r.verified_at, r.verifier,
       CASE WHEN r.pass = 1 THEN 'verified-healed' ELSE 'verified-broken' END AS outcome
FROM remediation_verifications r
WHERE r.action_ref IS NOT NULL
  AND r.id = (SELECT MAX(r2.id) FROM remediation_verifications r2 WHERE r2.action_ref = r.action_ref);
