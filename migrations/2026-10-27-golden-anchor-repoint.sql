-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE analytics_metric_triggers SET action = replace(action, char(10) || 'code-anchor: const falsePositiveRate = refuted.length', char(10) || 'code-anchor: const falsePositiveRate = adj.rows.length') WHERE metric_key = 'golden_run_complement_share_30d'
-- ANCHOR-REPOINT-1 (issue 5011, deploy-gate full set red on main since 2026-10-27 02:04Z): PR 5001 changed the
-- falsePositiveRate line in qnfo-research-exec/worker.js, so the trigger's code-anchor occurred 0 times and
-- migrations/code-anchor-once.test.mjs failed the full suite. Repoint the anchor to the line as it stands (it occurs once).
UPDATE analytics_metric_triggers SET action = replace(action, char(10) || 'code-anchor: const falsePositiveRate = adj.rows.length ? (adj.rows.filter(function(r) { return r.decided && !r.match; }).length / adj.rows.length) : 0;', char(10) || 'code-anchor: const falsePositiveRate = refuted.length ? (refuted.filter(function(r) { return String(r.basis || "").indexOf("truncated") !== -1; }).length / refuted.length) : 0;') WHERE metric_key = 'golden_run_complement_share_30d';
