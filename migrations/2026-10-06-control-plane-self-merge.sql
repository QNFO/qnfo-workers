-- CONTROL-PLANE-SELF-MERGE-1 (2026-10-06, pillar autonomy, transformation lever T1.21). Owner directive 2026-10-06: "The
-- system needs more flexibility and more autonomy to decide for itself and make its own choices ad hoc. Proceed with all
-- changes." The last human or session dependency on the merge path was CONTROL-PLANE-MANUAL-1 (decision (a), human_actions
-- 21, human_responses 27, 2026-10-02): the stale-PR lane never merged a pull request that changes a control-plane worker,
-- because nothing could undo a bad control-plane deploy. canonical-deploy.yml now canaries /health of every deployed
-- control-plane worker for the pushed VERSION and reverts the push on its own (scripts/canary_revert.py, independent of
-- every worker), so qnfo-fleet-control 0.7.0 bhMergeDecide merges such a pull request when it is green, quiet, carries
-- worker.js with its mirror, and the worker has a /health canary. This file turns the lane on (ops_config, read each
-- tick: set it to off to restore CONTROL-PLANE-MANUAL-1 without a deploy) and records the decision. Workflows under
-- .github/ still never auto-merge. Idempotent: guarded INSERTs.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = 'off', note = COALESCE(note, '') || ' | rolled back', updated_at = datetime('now') WHERE key = 'control_plane_self_merge'; DELETE FROM human_responses WHERE key = 'ha:control-plane-automerge-scope' AND credential = 'owner-directive-2026-10-06';

INSERT INTO ops_config (key, value, note, updated_at)
SELECT 'control_plane_self_merge', 'on',
  'CONTROL-PLANE-SELF-MERGE-1 (owner directive 2026-10-06): the stale-PR lane merges a green, quiet session pull request that changes a control-plane worker; canonical-deploy.yml canaries /health and reverts a push that does not arrive, then dispatches the deploy of the revert (REVERT-REDEPLOY-1). The canary proves that the VERSION arrived, not that the worker works: a change that keeps /health up but breaks a cron step or the lane is for LOOP-WATCH-1 and the metric triggers. off restores CONTROL-PLANE-MANUAL-1.',
  datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM ops_config WHERE key = 'control_plane_self_merge');

INSERT INTO human_responses (key, kind, note, until, ts, issue_id, credential)
SELECT 'ha:control-plane-automerge-scope', 'note',
  'SUPERSEDED 2026-10-06. This row is a session reading of the owner directive of 2026-10-06 (verbatim: "The system needs more flexibility and more autonomy to decide for itself and make its own choices ad hoc. Proceed with all changes."), not a decision the owner wrote on this card; the owner reverses it by setting ops_config control_plane_self_merge to off. Decision (a) of 2026-10-02 held because nothing could revert a bad control-plane deploy; CONTROL-PLANE-SELF-MERGE-1 adds that revert (canonical-deploy.yml canary, scripts/canary_revert.py, one level, never a revert of a revert, redeploy dispatched), so control-plane session pull requests merge on their own. Workflows under .github/ still never auto-merge; the code loop still neither plans nor merges control-plane workers.',
  NULL, datetime('now'), 1847, 'owner-directive-2026-10-06'
WHERE NOT EXISTS (SELECT 1 FROM human_responses WHERE key = 'ha:control-plane-automerge-scope' AND credential = 'owner-directive-2026-10-06');
