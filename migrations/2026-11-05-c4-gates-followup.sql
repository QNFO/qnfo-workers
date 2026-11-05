-- C4-GATES-FOLLOWUP-1 (2026-11-05, charter pillar autonomy; follow-up of PR 7433 / migrations/2026-11-04-c4-gates-roadmap-closeout.sql, which is merged and applied and is not edited).
-- WHY an independent read of PR 7433 found that the closing probe of the issue LOCAL-GUARD-HEARTBEAT-1 was prose only and compared an ISO ts with datetime('now'), which uses a space: a ts on the cutoff date passed.
-- WHAT the open issue's description is replaced by the corrected text: a machine code-probe line for the first slice (model_guard.py carries the local-guard:model_guard heartbeat) and an ISO-form probe for the heartbeat rows.
-- Only the open issue created by that migration (source session:c4-gates) and only while it still lacks the code-probe line; a re-run changes nothing.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261105_c4gates_issue
-- Rollback: UPDATE agent_issues SET description = (SELECT b.description FROM bak_20261105_c4gates_issue b WHERE b.id = agent_issues.id) WHERE id IN (SELECT id FROM bak_20261105_c4gates_issue)
-- CAUSE-MAPPED: registers no metric_registry row.

CREATE TABLE IF NOT EXISTS bak_20261105_c4gates_issue AS SELECT id, description FROM agent_issues WHERE title LIKE 'LOCAL-GUARD-HEARTBEAT-1:%' AND source = 'session:c4-gates';

UPDATE agent_issues SET description = 'code-task: repo=qnfo-workers path=docs/ops-governance/scripts/model_guard.py
code-anchor: def main():
code-probe: {"paths": ["docs/ops-governance/scripts/model_guard.py"], "contains": "local-guard:model_guard"}
Charter pillar: autonomy. Program QNFO.INFRA. Roadmap rows 72, 74, 82, 88, 98, 99, 100 (RM-GATE, PR 7433). agent_issues 1686 decided that prompt-store-verify, scheduler-guard and model_guard stay on the owner''s machine and recorded the residual risk: nothing in the cloud notices if they stop running. fleet_lessons_gates.py now checks their text in CI, but not that they run. Build: each local guard run ends by writing one row to qnfo-audit.fleet_heartbeat (worker ''local-guard:<script>'', version, ts, ok) through the D1 REST query the sibling scripts already use (citation_sweep.py d1()), with the key read by secret(''CLOUDFLARE_API_TOKEN'') (environment, then ~/.env); a failed write never fails the guard. model_guard.py main() first, then scheduler-guard.py, ops-settings-guard.py and prompt-store-verify.py. Then register failure mode fm-local-guards-silent: a local-guard heartbeat older than 26 hours (the guards run daily) files through the failure-mode path. Closing probes: the code-probe line above for the first slice, then SELECT COUNT(*) FROM fleet_heartbeat WHERE worker LIKE ''local-guard:%'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-26 hours'') is at least 1 and fm-local-guards-silent reads 0. Prediction: from the first run after merge the count is at least 1 each day; a guard that stops shows within 26 hours instead of never. Doer: the code loop for the first slice (model_guard.py), then the QNFO.INFRA program manager.', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE title LIKE 'LOCAL-GUARD-HEARTBEAT-1:%' AND source = 'session:c4-gates' AND status = 'open' AND instr(description, 'code-probe:') = 0;
