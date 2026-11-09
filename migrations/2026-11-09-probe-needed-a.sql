-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status='probe-review-refused', last_verdict='probe-review-refused', attempts=0 WHERE class IN ('issue-1002203','issue-1002238','issue-1002268','issue-1002269','issue-1002173','issue-1002136'); UPDATE remediation_contracts SET status='superseded' WHERE class IN ('issue-1002285','issue-1002283','issue-1002282','issue-1002265','issue-1002254');
-- PROBE-NEEDED-1 batch A (GitHub 8745 8744 8742 8740 8730 8729 8727 8726 8665 8642 8635): each underlying issue gets a probe that
-- measures its defect (code-read on main, or a D1 read that does not touch the issue's own status). The two with no measurable
-- defect (1002173 prompt wording, 1002136 owner-bound zone header rule) go to 'monitoring' with a decision_log row.

-- 1002285 WORKER-RELEASE-AGENTS-PKG-1: fixed in this PR (scripts/worker_release.py writes package.json and runs build.mjs).
UPDATE remediation_contracts SET verify_transport='code-read', verify_probe='{"paths": ["scripts/worker_release.py"], "contains": "WORKER-RELEASE-AGENTS-PKG-1"}', status='active', last_verdict=NULL, attempts=0, next_due_at=datetime('now') WHERE class='issue-1002285';

-- 1002282 REVIEW-GATE-TAGGED-TEMPLATE-1: is_bound_template_claim already on main.
UPDATE remediation_contracts SET verify_transport='code-read', verify_probe='{"paths": ["scripts/review_gate.py"], "contains": "def is_bound_template_claim("}', status='active', last_verdict=NULL, attempts=0, next_due_at=datetime('now') WHERE class='issue-1002282';

-- 1002283 LANE-ORPHAN-COMMIT-1: not built; the code-task on the issue is its doer. Fails until the hourly step exists.
UPDATE remediation_contracts SET verify_transport='code-read', verify_probe='{"paths": ["qnfo-fleet-control/worker.js"], "contains": "LANE-ORPHAN-COMMIT-1"}', status='active', last_verdict=NULL, attempts=0, next_due_at=datetime('now') WHERE class='issue-1002283';

-- 1002269 TRAVEL-TRIP-STATE-1: stopState (draft/partial/booked/done) is on main in personal-companion/travel.js.
UPDATE remediation_contracts SET verify_transport='code-read', verify_probe='{"paths": ["personal-companion/travel.js"], "contains": "export function stopState("}', status='active', last_verdict=NULL, attempts=0, next_due_at=datetime('now') WHERE class='issue-1002269';

-- 1002268 TRAVEL-FEEDBACK-1: pickTags feeds the tap taste table; on main in personal-companion/travel.js.
UPDATE remediation_contracts SET verify_transport='code-read', verify_probe='{"paths": ["personal-companion/travel.js"], "contains": "export function pickTags("}', status='active', last_verdict=NULL, attempts=0, next_due_at=datetime('now') WHERE class='issue-1002268';

-- 1002254 DOC-IS-CODE-1: done when the shrink-only allowlist is empty (every line is a docs/ path, 30 on 2026-11-09).
UPDATE remediation_contracts SET verify_transport='code-read', verify_probe='{"paths": ["scripts/doc-orphans-allowlist.txt"], "absent": "docs/"}', status='active', last_verdict=NULL, attempts=0, next_due_at=datetime('now') WHERE class='issue-1002254';

-- 1002265 CMDLINE-EXPAND-1: the issue's closing probe is a UX journey that taps a transcript row; the journey must cite the issue.
UPDATE remediation_contracts SET verify_transport='code-read', verify_probe='{"paths": ["scripts/ux-journeys/apps/fleet.journeys.mjs"], "contains": "CMDLINE-EXPAND-1"}', status='active', last_verdict=NULL, attempts=0, next_due_at=datetime('now') WHERE class='issue-1002265';

-- 1002238 CMDLINE-MAINTAIN-1: the weekly sweep request is seeded by qnfo-agents (src/lib.js).
UPDATE remediation_contracts SET verify_transport='code-read', verify_probe='{"paths": ["qnfo-agents/src/lib.js"], "contains": "CMDLINE-MAINTAIN-1, the weekly sweep"}', status='active', last_verdict=NULL, attempts=0, next_due_at=datetime('now') WHERE class='issue-1002238';

-- 1002203 OWNER-VOICE-GUARD-1: the guard pauses social (pipeline_flags.social_paused=1) when bluesky posts_7d exceeds the cap; it reads 1 on 2026-11-09.
-- The defect persists while the pause is set; the probe reads the flag, not the issue.
UPDATE remediation_contracts SET verify_transport='d1-query', verify_probe='SELECT 0 AS expected, CAST(COALESCE((SELECT value FROM pipeline_flags WHERE key=''social_paused''),''0'') AS INTEGER) AS observed', status='active', last_verdict=NULL, attempts=0, next_due_at=datetime('now') WHERE class='issue-1002203';

-- 1002173 and 1002136 cannot be measured by a read: wording of one prompt line, and a zone-level response-header rule that is IDENTITY-BOUND.
UPDATE remediation_contracts SET status='monitoring', last_verdict='monitoring: PROBE-NEEDED-1 batch A, no measurable defect (prompt wording)' WHERE class IN ('issue-1002173','issue-1002136');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain) VALUES
 ('session:claude/probe-needed-a', 'issue-1002173 (ROADMAP-1 QNFO.REACH #2737, q08-signal-engine LEADING INDICATORS prompt line) has no read-only measure of better wording', 'issue-1002173 contract set to monitoring', 'PROBE-NEEDED-1 GitHub 8642; prompt text is a judgement, scored by output_quality_measures rather than a probe', 'contract monitoring; issue stays open for its doer', 'one remediation_contracts row', 'UPDATE remediation_contracts SET status=''probe-review-refused'' WHERE class=''issue-1002173''', 'no vacuous probe can close it'),
 ('session:claude/probe-needed-a', 'issue-1002136 (cmd-mic-zone-header-1) is a qnfo.org zone response-header rule; a Worker or D1 read cannot see a zone rule and the card is IDENTITY-BOUND', 'issue-1002136 contract set to monitoring', 'PROBE-NEEDED-1 GitHub 8635; the prior probe counted a fleet_crons row that never existed', 'contract monitoring; owner step stays on its IDENTITY-BOUND card', 'one remediation_contracts row', 'UPDATE remediation_contracts SET status=''probe-review-refused'' WHERE class=''issue-1002136''', 'no vacuous probe can close it');
