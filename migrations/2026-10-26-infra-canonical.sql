-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = (SELECT b.description FROM bak_20261026_rem_a6_canonical_desc b WHERE b.id = agent_issues.id) WHERE id = 1000161 AND EXISTS (SELECT 1 FROM bak_20261026_rem_a6_canonical_desc b WHERE b.id = agent_issues.id); UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:rollback INFRA-CANONICAL-1' WHERE module = 'infra-canonical-1';
-- BACKUP: bak_20261026_rem_a6_canonical_desc
-- INFRA-CANONICAL-1 (2026-10-26, pillar reliability; session rem-a6, infrastructure cluster of the 2026-10-26 issue remediation). Follow-up to INFRA-PROBES-1 and INFRA-NOTES-1.
-- Issue 1000161 (CANONICAL-REFRESH-GAP-1): qnfo-ops had no binding to the qnfo-canonical bucket, so the canonical deploy route never refreshed qnfo-canonical/<worker>.js. qnfo-ops 2.59.4 declares the binding
-- (CANONICAL) and writes the object after a deploy whose /health version matches the requested one, reads it back, compares byte length and sha-256, and records one canonical_refresh row in cloud_ops_events
-- (status ok, skipped or error). The contract of the issue was a placeholder that observed the issue's own status (CLOSE-PROBE-CIRCULAR-1: superseded at birth), so it could never close on evidence. Two contracts replace it:
--   * issue-1000161          d1-query: a canonical_refresh row with status ok exists in the last 7 days and no row with status error in the last day (passes after the first deploy made by 2.59.4)
--   * issue-1000161-binding  code-read: qnfo-ops/wrangler.toml declares the bucket qnfo-canonical (the structural defect of the issue)
-- The issue closes when both pass (remediation_verification_autoclose_ins needs every other active contract of the issue to be passing). A dated update is appended to the description once (instr guard), with the previous
-- description kept in bak_20261026_rem_a6_canonical_desc (created first, read by the Rollback line). Nothing is deleted. decision_log is only inserted into.

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a6_canonical_desc AS
SELECT id, description FROM agent_issues WHERE id = 1000161;

UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'd1-query',
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = ''canonical_refresh'' AND status = ''ok'' AND datetime(ts) > datetime(''now'', ''-7 days'')) = 0 THEN ''no-refresh-yet'' WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = ''canonical_refresh'' AND status = ''error'' AND datetime(ts) > datetime(''now'', ''-1 day'')) > 0 THEN ''refresh-failed'' ELSE ''ok'' END AS observed',
  last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'infra-canonical-1',
  precondition = 'INFRA-CANONICAL-1: issue 1000161 defect (the canonical deploy route never refreshes qnfo-canonical/<worker>.js) is fixed in qnfo-ops 2.59.4; the proof is a refresh the route made, not the code that makes it',
  action = 'MEASURES the defect by its effect: a canonical_refresh row with status ok in the last 7 days (written by /ops/deploy after it wrote qnfo-canonical/<worker>.js, read it back and compared byte length and sha-256) and no row with status error in the last day. no-refresh-yet means no deploy has run on 2.59.4 yet (or the binding is missing: read the skipped rows); refresh-failed means the write or the read-back failed, the meta of the newest error row names the worker and the reason.'
WHERE class = 'issue-1000161';

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at, attempts)
VALUES ('issue-1000161-binding', 1000161, 'INFRA-CANONICAL-1: issue 1000161 structural defect, qnfo-ops has no bucket binding to qnfo-canonical',
 'MEASURES the structural defect: qnfo-ops/wrangler.toml on main declares an r2_buckets binding to the bucket qnfo-canonical (binding CANONICAL, installed by the canonical deploy like the four other R2 bindings of the worker). The behaviour is measured by the issue contract itself.',
 '{"paths": ["qnfo-ops/wrangler.toml"], "contains": "bucket_name = \"qnfo-canonical\""}', 'code-read', 24, 'qnfo-ops', 1, 'active',
 'infra-canonical-1', datetime('now'), 0);

UPDATE agent_issues SET updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000, description = description || char(10) || char(10) ||
 'REM-A6 2026-10-26 (update to the note above, which said not started): the change is made in qnfo-ops 2.59.4. wrangler.toml declares the CANONICAL binding on the qnfo-canonical bucket; after a deploy whose /health version matches the requested one, /ops/deploy of QNFO/qnfo-workers main writes qnfo-canonical/<worker>.js (ts, version, sha256 and actor metadata, the shape qnfo-fleet-control canonical() reads), reads it back and compares byte length and sha-256, answers canonical { ok, parity, bytes, sha256 } and records one canonical_refresh row in cloud_ops_events (ok, skipped or error). It never fails a deploy. This issue now closes on two contracts: the bucket is declared in qnfo-ops/wrangler.toml (code-read) and a canonical_refresh row with status ok exists in the last 7 days with no error row in the last day (d1-query, passes after the first deploy made by 2.59.4). Next, if the d1 contract reads no-refresh-yet for long after 2.59.4 is live: read the canonical_refresh rows with status skipped (no-CANONICAL-binding means the canonical deploy of qnfo-ops did not install the binding; read the bindings_installed field of that deploy answer).'
WHERE id = 1000161 AND instr(description, 'REM-A6 2026-10-26 (update to the note above') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a6',
  'a deploy that leaves qnfo-canonical/<worker>.js older than live is a downgrade hazard for every path that re-asserts the object, and the issue cannot close on evidence while its contract observes only its own status; the smallest complete closure is the write in the route that deploys, with a read-back, and a probe on the effect',
  'INFRA-CANONICAL-1: qnfo-ops 2.59.4 binds qnfo-canonical and refreshes qnfo-canonical/<worker>.js after a verified /ops/deploy; issue 1000161 gets a d1-query contract on canonical_refresh rows and a code-read contract on the binding; one dated update on the issue',
  'the defect was read in this session: qnfo-ops/worker.js had no reference to qnfo-canonical and wrangler.toml no such binding; fleet graph impact of binding:qnfo-fleet-control.CANONICAL lists qnfo-fleet-control, qnfo-cloud-ops, qnfo-fleet-dashboard and qnfo-ops as readers, the write adds the same key shape and metadata they already read; qnfo-ops/canonical-refresh.test.mjs (54 checks) runs the worker''s own opsDeploy against a fake bucket',
  'applied by migration; the worker change deploys through the canonical path',
  'one R2 object per deploy, in a bucket five workers already read; the write is never fatal to the deploy',
  'the Rollback line restores the description and supersedes the two contracts; reverting the qnfo-ops commit removes the write and the binding declaration',
  'the canonical deploy route keeps the canonical artifact current, with a read-back and a ledger row',
  'after the first deploy by qnfo-ops 2.59.4 a canonical_refresh row with status ok exists and the issue closes on its two contracts',
  'stale canonical objects stop being a downgrade hazard',
  'offline: the worker''s opsDeploy against a fake bucket (write, read-back, failures, skips); the live proof is the contract'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE instr(d.action, 'INFRA-CANONICAL-1: qnfo-ops 2.59.4 binds') = 1);
