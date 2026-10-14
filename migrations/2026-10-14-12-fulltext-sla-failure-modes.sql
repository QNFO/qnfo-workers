-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-companion-source-shorter-than-essay', 'fm-companion-initialism-sentence-split', 'fm-companion-critic-sourced-false-grounding', 'fm-control-loop-wait-over-120m', 'fm-reintake-cooldown-over-120m'); DELETE FROM failure_modes WHERE fm_key IN ('companion-source-shorter-than-essay', 'companion-initialism-sentence-split', 'companion-critic-sourced-false-grounding', 'control-loop-wait-over-120m', 'reintake-cooldown-over-120m'); DELETE FROM decision_log WHERE instr(action, 'FULLTEXT-BUDGET-1:') = 1 OR instr(action, 'SLA-120M-7-AUDIT:') = 1
-- spof-review: no new single point of failure; five code-read detectors run by the existing remediation consumer
--
-- Failure modes found 2026-10-14 08:00-08:20 UTC, each with its code-read detector (ANTIFRAGILE-1: every failure mode found gets a row and
-- an fm- detector in the PR that fixes it):
--   companion-source-shorter-than-essay      personal-companion 1.26.2 FULLTEXT-BUDGET-1 (agent_issues 2552; companion_runs 6141, 6002, 5962)
--   companion-initialism-sentence-split      personal-companion 1.26.2 SENT-INITIALISM-1 (companion_runs 6224)
--   companion-critic-sourced-false-grounding personal-companion 1.26.2 CRITIC-QUOTE-SOURCED-1 (companion_runs 6178)
--   control-loop-wait-over-120m              qnfo-fleet-control 0.31.2 and qnfo-lifecycle 1.11.4 (PR 1273, SLA-120M-7)
--   reintake-cooldown-over-120m              qnfo-code-orchestrator 0.16.2 (SLA-120M-7)
-- and the dispositions of the SLA-120M-7 code audit (about 95 hour or day limits across 28 workers): changed, filed as a code task, or
-- classified with the reason, so none is dropped silently.

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id,
  trigger_condition, symptom, blast_radius) VALUES
('companion-source-shorter-than-essay',
 'the companion writer is asked for a longer essay than the source excerpt it is given, so it fills the rest from memory and the critic scores the additions invented',
 'GROUND_MAX 18000 with PRIMARY_SHARE 0.55 gave the subject article about 9900 characters for a 2000-2800 word essay (14000-18000 characters); a long article was cut to its first sections',
 'personal-companion 1.26.2 FULLTEXT-BUDGET-1: GROUND_MAX 36000, PRIMARY_SHARE 0.7 (about 25200 characters for the subject); the critic and the fact-check read the same budget (owner directive CITE-FULLTEXT-1)',
 'personal-companion/worker.js on main sets GROUND_MAX to 36000',
 'fm-companion-source-shorter-than-essay', '2026-10-14', 2552,
 'a source budget lowered below the essay band, or a new form whose band exceeds the primary share',
 'companion_runs 6141: "claims from the source material''s prelude sections ... which were not in the provided source"',
 'every companion draft on a long article'),
('companion-initialism-sentence-split',
 'the companion sentence splitter ends a sentence at a dotted initialism, so a prune that deletes one half leaves a fragment the critic scores invented',
 'SENT_ABBREV_RE joined a split only after a single capital ("A."), not after "U.S." or "D.C."',
 'personal-companion 1.26.2 SENT-INITIALISM-1: an initialism of two or more dotted capitals does not end a sentence',
 'personal-companion/worker.js on main joins a split after a dotted initialism',
 'fm-companion-initialism-sentence-split', '2026-10-14', 2552,
 'a splitter rewrite that drops the initialism alternative',
 'companion_runs 6224: "Consul. Negotiations failed and the city was bombarded." scored grounding 0 as a fragment',
 'the critic prune, the grounding repair and the lede split'),
('companion-critic-sourced-false-grounding',
 'the companion critic scores grounding 0 for a sentence the source material states, and the draft is discarded',
 'an LLM judge misses a source sentence that says the same thing in other words (no deterministic check of its quotes against the source)',
 'personal-companion 1.26.2 CRITIC-QUOTE-SOURCED-1: when every quoted passage is stated by one source passage (80% of content words, every figure, same negation) the same critic re-reads once with each source sentence beside its quote; the re-read stands either way and the two-family fact-check follows',
 'personal-companion/worker.js on main gives a sourced grounding rejection its re-read',
 'fm-companion-critic-sourced-false-grounding', '2026-10-14', 2552,
 'the re-read wiring removed, or the quote check loosened so an unsourced quote passes',
 'companion_runs 6178: "The emperor fled to Rehe, and Prince Gong stayed to sign the Convention of Peking" called invented; the source: "The emperor and his entourage fled to Rehe, while Prince Gong stayed to conduct the negotiations, signing the Convention of Peking"',
 'every companion draft the critic reads'),
('control-loop-wait-over-120m',
 'a control loop waits hours before it acts on a stuck item: a PR with no checks, a merge with no deploy, an evolve PR, a drifted worker, a metric breach after a recovery',
 'the waits were written in hours (3 h, 6 h, 24 h fallback) before the owner directive of 2026-10-14 capped every SLA at 120 minutes',
 'qnfo-fleet-control 0.31.2: CM_CHECKS_WAIT_MIN, CM_DEPLOY_WAIT_MIN, EVOLVE_WAIT_MIN and DRIFT_REDEPLOY_COOLDOWN_MIN at 120 minutes, the metric re-fire wait in minutes clamped to 10..120; qnfo-lifecycle 1.11.4 advisor-noise sweep at 120 minutes',
 'qnfo-fleet-control/worker.js on main holds the merge runner check wait at 120 minutes',
 'fm-control-loop-wait-over-120m', '2026-10-14', NULL,
 'a new wait constant written in hours or above 120 minutes',
 'a merged PR with no deploy row waited 3 h before deploy-missing; a drifted worker waited 6 h for its redeploy',
 'every merge, deploy verification, drift heal and metric breach'),
('reintake-cooldown-over-120m',
 'an issue whose code task ended (stale base, refusal, failed ladder) waits 6 hours before the code loop takes it again',
 'INTAKE_RETRY_COOLDOWN_MS was 6 h (CODE-TASK-REINTAKE-1), above the 120-minute SLA',
 'qnfo-code-orchestrator 0.16.2: INTAKE_RETRY_COOLDOWN_MIN 120; the cap of 3 tasks per 3-day window still bounds a goal that keeps failing',
 'qnfo-code-orchestrator/worker.js on main re-takes an ended task after 120 minutes',
 'fm-reintake-cooldown-over-120m', '2026-10-14', NULL,
 'the cooldown raised above 120 minutes',
 'issues with an ended code task sat 6 h with no doer, counted in issues_open_over_120m',
 'every open issue with a code-task line');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts,
  escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, ts) VALUES
('fm-companion-source-shorter-than-essay', NULL, 'FULLTEXT-BUDGET-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "var GROUND_MAX = 36000;"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
('fm-companion-initialism-sentence-split', NULL, 'SENT-INITIALISM-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "(?:^|[\\s(])(?:(?:[A-Z]\\.)+[A-Z]|[A-Z]|Dr|"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
('fm-companion-critic-sourced-false-grounding', NULL, 'CRITIC-QUOTE-SOURCED-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "rqSrc ? sourcedRereadNote(rqSrc)"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
('fm-control-loop-wait-over-120m', NULL, 'SLA-120M-7', 'failure-mode detector', '{"paths": ["qnfo-fleet-control/worker.js"], "contains": "var CM_CHECKS_WAIT_MIN = 120;"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
('fm-reintake-cooldown-over-120m', NULL, 'SLA-120M-7', 'failure-mode detector', '{"paths": ["qnfo-code-orchestrator/worker.js"], "contains": "const INTAKE_RETRY_COOLDOWN_MIN = 120;"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'most critic grounding rejections name facts the writer took from parts of the subject article the excerpt left out, or deterministic artifacts, not inventions',
  'FULLTEXT-BUDGET-1: personal-companion 1.26.2 doubles the source budget (36000, primary 70%), keeps dotted initialisms inside a sentence, and gives a grounding rejection whose quotes the source states one evidence re-read',
  'companion_runs 6141-6261 (2026-10-14 08:00 UTC): 6141 names "sections ... not in the provided source", 6224 a "Consul." fragment, 6178 a sentence the source states; 40 grounding 0 rejections in 12 h; 100 h without a piece',
  'merged with the PR', 'personal-companion only; the fact-check, critic bar and deterministic grounding check are unchanged', 'see the Rollback header and revert the PR',
  'the companion grounds on the subject''s full article and no longer loses drafts to splitter fragments or critic misses it can prove',
  'a reading.q08.org piece is published within 24 h of the deploy (companion_hours_since_last_piece under 24, cadence_overdue_over_120m reads 0 for reading.q08.org); critic grounding 0 rejections fall below half of rejections',
  'reading.q08.org publishes again', 'd1:personal-life companion_runs, companion_anchor_cache; personal-companion/worker.js'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'FULLTEXT-BUDGET-1:') = 1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a limit is an SLA when an item or loop waits for action until it passes; rate and aggregation windows, retention, caches, rate limits, evidence-age windows, publishing and outreach cadence caps and periodic check cadences are not',
  'SLA-120M-7-AUDIT: dispositions of the hour and day limits found in 28 workers. Changed: fleet-control merge runner and evolve waits, drift cooldown, metric re-fire wait, seeded cooldowns (0.31.2); lifecycle advisor sweep (1.11.4); code-orchestrator re-intake (0.16.2); producer lateness (cadence_sla). Filed as code tasks: cloud-ops inbound (2583), dashboard owner wait (2584) and 2x-cadence staleness (2585), research-exec claim and re-arm (2586), idea-hub note retry (2587). Classified, unchanged: branch retention graces and the 24 h stale-PR close (the 20-minute lane and nudges act first), HOLD expiry (a review safety control, CLAUDE.md rule), post-close soak and relapse windows, evidence-age windows (lifecycle LATEST_PASS_MAX_H, exception soak), performance and experiment windows, plan re-ask and preflight dedupe windows (loop guards), chaos drill, census and journey cadences, project staleness, data freshness of daily feeds (cadence plus 120 minutes), retries of failing renders',
  'Explore audit of every active worker.js 2026-10-14 08:05Z (about 95 findings); D1 metric_registry and analytics_metric_triggers read 07:50Z',
  'recorded', 'none (record only)', 'none',
  'every hour or day limit in the fleet has a recorded disposition under the 120-minute SLA directive',
  'issues 2583-2587 close on their code-read probes as the code loop lands each change', 'none',
  'repository worker.js files; d1:qnfo-audit metric_registry, analytics_metric_triggers'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SLA-120M-7-AUDIT:') = 1);
