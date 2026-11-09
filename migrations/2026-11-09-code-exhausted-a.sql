-- CODE-EXHAUSTED-A (2026-11-09, pillar autonomy): eleven CODE-LOOP-EXHAUSTED-1 tickets (GitHub 8731 8702 8694 8690 8678 8671 8670 8666 8664 8657 8653)
-- name code tasks the code loop could not finish in five attempts. Each defect was implemented by hand in one pull request (branch claude/code-exhausted-a):
--   ct_im1001933 scripts/cf_ops_actions.py      moot: def delete_pages_project( is on main since commit 1d8003195 (PR 9747)
--   ct_im1002076 scripts/fleet_graph.mjs        moot: ARCHIVE-MARKER-READ-2 is on main (archive/<name>/ markers are read)
--   ct_im1002107 personal-api/worker.js         MEMORY-KEYED-1: memory_keyed table, memory_set, owner-only immutable instructions, weekly canary
--   ct_e6wbg1q46obarm q08-signal-engine         CROSS-LINK-FOLLOWUP-3: family bar and Keep exploring rendered on the server
--   ct_im1002087 qnfo-gateway/worker.js         ATLAS-GATEWAY-ROUTE-1: /data/ai-science-failures/<file> from R2, listed in llms.txt
--   ct_2v6kx6dhn3tuwx qnfo-fleet-dashboard      GOOGLE-HUB-1: /search and /api/gsc/overview (the task was a planner copy of ct_im1001659)
--   ct_bxwyq0agp1na9j qnfo-fleet-control        FLEET-TICK-SECOND-SOURCE-1: a second fleet_tick producer
--   ct_im1002039 qnfo-cloud-ops/worker.js       PROBE-REVIEW-ROOT-CAUSE-1: probe review skips the root-cause template module
--   ct_im1002045 q08-signal-engine              EK-6-ADOPT-1: ANALYSIS-FORM-1 block inlined, domainForm uses its rules
--   ct_im1002036 q08-signal-engine              Q08-GATE-RATE-1: three essay attempts an hour after twelve gate failures
--   ct_im1001954 q08-signal-engine              Q08-DOMAIN-FORM-2: Federal Register lane behind the policy token
-- Marking the tasks superseded lets code-loop-superseded-reconcile close the tickets, and stops the code loop from re-running a task whose change is on main.
-- The cloud-ops change also puts back the contracts PROBE-REVIEW-1 refused on the root-cause template probe (the probe is the ticket's own definition of done).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE code_tasks SET status = 'queued', step = 'read', attempts = 0, lease_until = NULL WHERE merge_note LIKE 'CODE-EXHAUSTED-A %'; UPDATE remediation_contracts SET status = 'probe-review-refused' WHERE module = 'root-cause-probe-at-birth-1' AND last_verdict = 'restored:CODE-EXHAUSTED-A';

UPDATE code_tasks SET status = 'superseded', lease_until = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  merge_note = 'CODE-EXHAUSTED-A 2026-11-09: moot; scripts/cf_ops_actions.py defines delete_pages_project( on main since commit 1d8003195 (PR 9747)'
WHERE id = 'ct_im1001933' AND status NOT IN ('merged', 'superseded');

UPDATE code_tasks SET status = 'superseded', lease_until = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  merge_note = 'CODE-EXHAUSTED-A 2026-11-09: implemented by hand in the pull request of branch claude/code-exhausted-a (QNFO/qnfo-workers); the code loop must not re-run it'
WHERE id IN ('ct_im1002076', 'ct_im1002107', 'ct_e6wbg1q46obarm', 'ct_im1002087', 'ct_2v6kx6dhn3tuwx', 'ct_bxwyq0agp1na9j', 'ct_im1002039', 'ct_im1002045', 'ct_im1002036', 'ct_im1001954')
  AND status NOT IN ('merged', 'superseded');

UPDATE remediation_contracts SET status = 'active', last_verdict = 'restored:CODE-EXHAUSTED-A', next_due_at = datetime('now')
WHERE module = 'root-cause-probe-at-birth-1' AND status = 'probe-review-refused';
