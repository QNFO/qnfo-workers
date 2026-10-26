-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM session_records WHERE session_id = '015kWmGuAq2fNuvzu4MrD7x3'; UPDATE agent_issues SET status = 'closed', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000, close_channel = 'rollback:SESSION-CLOSEOUT-20261026-ISSUE-SWEEP' WHERE title = 'IDEA-TRIAGE-COOLING-STARVE-1: triage skips marked rows that are still cooling so they cannot fill its batch' AND status = 'open'
-- SESSION-CLOSEOUT-20261026-ISSUE-SWEEP (pillar autonomy; SESSION-RECORD-1, OWNER-NO-LOOSE-ENDS-1).
-- One session_records row for the issue audit of 2026-10-26 ("why are there over 800 GitHub issues"), and the one follow-up that audit found and did not fix:
-- triage's batch order starves the 19 once-failed rows behind the 5 cooling ones (found by the idea-hub 1.14.3 author), filed with a doer and a closing probe.
-- The rollback closes that follow-up (an issue is never deleted) and deletes the session row.

INSERT INTO session_records (
  session_id, wbs_code, agent_name, summary, decisions_made, files_changed,
  commits, infrastructure_changes, handoff_notes, execution_ratio,
  total_tasks, completed_tasks, started_at, completed_at, created_at
)
SELECT
  '015kWmGuAq2fNuvzu4MrD7x3',
  'core/issue-hygiene',
  'Claude Code',
  'Audit of why 828 GitHub issues were open and whether they match the fleet: GitHub Issues are a mirror of qnfo-audit.agent_issues (TRACKER-SYNC-1) plus roadmap mirrors and meta tickets, so a count of open GitHub issues is not a count of defects. Fixed the producers that inflated it (steward 0.8.0/0.9.0: catalogue rows and agent-issue twin rows are never GitHub issues; observability escalation dedupe; hygiene 1-5, of which the sweep closes are 13 issues with two independent measurements (hygiene-4) and 5 with an independent review plus a live re-measurement (hygiene-5); chaos-drill calibration; handoff vector index producer in qnfo-infra 1.9.0; delete-stuck-runs action and the GitHub refusal recorded on 1000275) and shipped eight reviewed sweep fixes (q08-mind 2.2.1 DOIs, generated-bundle audit, canary-ahead, qnfo-ops 2.57.4, idea-hub 1.14.3, probe, fleet-task and data-fix migrations including the hard limits in the management-personas workflow prompt). GitHub open issues 828 -> 603 (read 2026-10-26T10:30Z) while 200 new GitHub issues were created that day; qnfo-audit open about 438 -> 391 while 157 new rows were filed.',
  'Zero open issues is unreachable under the evidence-only close rule: about 390 D1 issues are real work, metric breaches or self-closing tickets, and the fleet files about 150 a day. Closed only with close_evidence; no wontfix. Every sweep fix went through an independent adversarial review before merge, and the reviews changed the result five times (a premature research/q08 cap cut removed, an overclaimed cost-quality enforcement rewritten twice, a false-revert gap given a probe, two follow-ups the code loop could not execute folded into the migration, two idea-hub majors on backpressure and persistence). Merged control-plane qnfo-ops 2.57.4 myself on the owner directive to deploy immediately, behind the canary. Did not retry GitHub-refused deletes or cancels of the wedged runs; recorded the refusal and the owner step.',
  'steward 0.8.0/0.9.0, observability 1.5.3, qnfo-infra 1.9.0, q08-mind 2.2.1, qnfo-ops 2.57.4, idea-hub 1.14.3, scripts (canary_revert, conflict_repair, fleet_best_practices_audit, github-settings-actions), deploy-gate.yml, migrations hygiene-1 to -5, chaos-drill-calibration, handoffs-vz-producer, stuck-runs-evidence, roadmap-twin-rows, canary-ahead-probes, reentry-bind-limit, sweep-fleet-tasks-c, sweep-probe-fixes-b, sweep-data-fixes-a',
  '#4328 #4388 #4398 #4448 #4521 #4537 #4540 #4545 #4548 #4552 #4554 #4559 #4560 #4573',
  'Deployed through the canonical path on merge: qnfo-github-steward 0.9.0, qnfo-infra 1.9.0 (hourly handoff indexer, ops_config handoffs_vz_last_id), q08-mind 2.2.1, qnfo-ops 2.57.4, idea-hub 1.14.3. Migrations applied by CI (migration_runs ok). No secret written; no Cloudflare resource created.',
  'Residual: 1) GitHub wedged runs (issue 1000275): GitHub refuses delete (403) and cancel (409) for both credentials, the owner card github-wedged-runs-six carries the step. 2) The handoff index is backfilling at 100 rows an hour; fm-handoffs-vz-stalled watches it. 3) The idea-hub chaos drill of 1000244 needs a consumed re-entry signal; IDEA-TRIAGE-COOLING-STARVE-1 is the follow-up. 4) Cost bound 329 against 300 converges by itself on 2026-10-28 (issue 1000155); no cap was cut. 5) Open fleet issues are driven by their own loops and probes; v_issue_family_throughput names the families with net inflow, the largest being the BP26 best-practices batch (about 30 real issues filed 2026-10-26). 6) Follow-ups with a doer: COST-QUALITY-FLOOR-ENFORCE-1, COST-QUALITY-FLOOR-DOC-1, PSR-NARRATIVE-CAP-SOFT-1, IDEA-TRIAGE-COOLING-STARVE-1; issue 3003 stays open on two real producers (reading.q08.org, papers.qnfo.org).',
  0.96, 25, 24,
  '2026-10-26T06:20:00Z',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%d %H:%M:%S', 'now')
WHERE NOT EXISTS (SELECT 1 FROM session_records WHERE session_id = '015kWmGuAq2fNuvzu4MrD7x3');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'IDEA-TRIAGE-COOLING-STARVE-1: triage skips marked rows that are still cooling so they cannot fill its batch',
  'Charter pillar: autonomy. idea-hub triage selects status new rows ordered clean first, then marked rows oldest created_at first (idea-hub/worker.js, the IDEA-SCORING-POISON-1 select). The five oldest marked rows are past their third scoring failure and wait 24 hours between tries, so they take batch slots and are skipped by the cooling check, while 19 other rows that failed once sit untried (some since 2026-10-22, 24 marked of 33 new on 2026-10-26). Found while writing idea-hub 1.14.3 (PROPOSAL-COOLING-1).' || char(10) ||
  'Doer: qnfo-code-orchestrator. Change the select so a row that is still cooling (three or more failures and last failure under 24 hours ago, the same test the worker applies after the select) is not selected, or order marked rows by their last failure time oldest first; keep rows without a marker first. Add a case to idea-hub/scoring-failure.test.mjs that fails when five cooling rows are older than the untried ones and the batch holds fewer rows than the cooling ones plus one. Raise VERSION by a patch.' || char(10) ||
  'Definition of done: the select no longer orders marked rows by created_at alone (the code-probe below passes) and the suite case is in the repository.' || char(10) ||
  'code-task: repo=qnfo-workers path=idea-hub/worker.js' || char(10) ||
  'code-anchor: ORDER BY (CASE WHEN rationale LIKE ''[scoring-error %'' THEN 1 ELSE 0 END) ASC, created_at ASC LIMIT ?1' || char(10) ||
  'code-probe: {"paths": ["idea-hub/worker.js"], "absent": "ORDER BY (CASE WHEN rationale LIKE ''[scoring-error %'' THEN 1 ELSE 0 END) ASC, created_at ASC LIMIT ?1"}',
  'session', 'reliability', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'IDEA-TRIAGE-COOLING-STARVE-1: triage skips marked rows that are still cooling so they cannot fill its batch' AND status = 'open');
