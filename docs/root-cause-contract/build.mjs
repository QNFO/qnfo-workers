// Builds the deliverable texts from backfill.sql so nothing is hand-escaped: the step JSON, the json_insert statement, the migration file and the Rollback line.
import { readFileSync, writeFileSync } from "node:fs";
const here = new URL(".", import.meta.url).pathname;
export const STEP_NAME = "rc-contract";
export const BAK_WF = "bak_20261026_rc_contract_workflow";
export const BAK_CT = "bak_20261026_rc_contract_contracts";
export const backfill = readFileSync(here + "backfill.sql", "utf8").trim();
export const sq = (s) => s.replaceAll("'", "''"); // SQL string literal body
export const stepObj = { type: "sql", name: STEP_NAME, db: "AUDIT", sql: backfill };
export const stepJson = JSON.stringify(stepObj);
const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";
const GUARD_NAME = `NOT EXISTS (SELECT 1 FROM json_each(fleet_tasks.definition, '$.steps') j WHERE json_extract(j.value, '$.name') = '${STEP_NAME}')`;
export const jsonInsertSql =
  `UPDATE fleet_tasks SET definition = json_insert(definition, '$.steps[#]', json_object('type', 'sql', 'name', '${STEP_NAME}', 'db', 'AUDIT', 'sql', '${sq(backfill)}')), version = version + 1, updated_at = ${NOW} WHERE id = 'management-personas' AND json_valid(definition) AND ${GUARD_NAME}`;
// The precedent form (management-personas-4/5/6): a JSON literal inside json(). Same result; kept for the equality test.
export const jsonInsertLiteralSql =
  `UPDATE fleet_tasks SET definition = json_insert(definition, '$.steps[#]', json('${sq(stepJson)}')), version = version + 1, updated_at = ${NOW} WHERE id = 'management-personas' AND json_valid(definition) AND ${GUARD_NAME}`;

const V3_VERDICT = "superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1: this template observes the guarded issue status, which issue_close_evidence_required only lets change after a close that the same probe blocks; a doer that knows the defect replaces it with a probe that measures it)";
const V3_PRE = "no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)";
const V3_ACTION = "VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.";
const COLS = ["issue_id", "status", "verify_probe", "verify_transport", "last_verdict", "module", "action", "precondition", "attempts", "next_due_at", "deferred_since", "expected_cadence_h"];
export const rollbackStmts = [
  // 1. take the step out by name and bump the version
  `UPDATE fleet_tasks SET definition = json_remove(definition, '$.steps[' || (SELECT j.key FROM json_each(fleet_tasks.definition, '$.steps') j WHERE json_extract(j.value, '$.name') = '${STEP_NAME}') || ']'), version = version + 1, updated_at = ${NOW} WHERE id = 'management-personas' AND EXISTS (SELECT 1 FROM json_each(fleet_tasks.definition, '$.steps') j WHERE json_extract(j.value, '$.name') = '${STEP_NAME}')`,
  // 2. every contract the step armed (module probe-template-v4-root-cause) goes back to the born shape of contract_probe_templates_v3_generic
  `UPDATE remediation_contracts SET status = 'superseded', verify_transport = 'd1-query', module = 'probe-template-v3-generic', attempts = 0, deferred_since = NULL, next_due_at = NULL, last_verdict = '${sq(V3_VERDICT)}', precondition = '${sq(V3_PRE)}', action = '${sq(V3_ACTION)}', verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ' || substr(class, 7) || ') AS observed' WHERE module = 'probe-template-v4-root-cause'`,
  // 3. the contracts the migration itself armed get their exact before-state back from the backup table
  `UPDATE remediation_contracts SET ${COLS.map((c) => `${c} = (SELECT b.${c} FROM ${BAK_CT} b WHERE b.class = remediation_contracts.class)`).join(", ")} WHERE module = 'probe-template-v3-generic' AND class IN (SELECT class FROM ${BAK_CT})`,
  // 4. the trigger remediation_probe_edit_rerun re-stamps next_due_at when verify_probe changes, so the backed-up due time is written once more
  `UPDATE remediation_contracts SET next_due_at = (SELECT b.next_due_at FROM ${BAK_CT} b WHERE b.class = remediation_contracts.class) WHERE module = 'probe-template-v3-generic' AND class IN (SELECT class FROM ${BAK_CT})`,
];
export const rollbackLine = rollbackStmts.join("; ");

export const migration = `-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: ${BAK_WF}
-- Rollback: ${rollbackLine}
-- ROOT-CAUSE-CONTRACT-1 (2026-10-26, charter pillar autonomy; agent_issues 1000419). Follows ROOT-CAUSE-PROBE-AT-BIRTH-1.
-- WHAT WAS FOUND (read 2026-10-26, SELECT only): each ROOT-CAUSE-1 ticket filed by the management-personas workflow (step rc-file) is born with the generic contract
--   (status superseded, module probe-template-v3-generic, action VACUOUS-PROBE-V3-1), which the PROBE-NEEDED-1 filer does not count as live, so every ticket bred a twin (16 open for 10 tickets).
-- WHAT THIS DOES: gives each such ticket a contract that measures its own closing condition, and keeps doing so for the tickets filed later.
--   Probe (d1-query, status active, last_verdict NULL): expected 0, observed = the family reopens_24h + opens_24h in issue_recurrence_now, +1 while the ticket is under 24 hours old,
--   +1 while issue_recurrence_now is empty (recur-clear and recur-snapshot are two requests; an empty table would read as quiet). It reads the snapshot, never v_root_cause_quiet:
--   that view hides a ticket whose own active contract reads fail, so a probe that waited for the view could never turn true. The probe's condition is the view's own condition
--   minus its contract clause, so the first quiet read passes, the contract stops failing, the view lists the ticket and rc-close closes it with evidence.
--   Step ${STEP_NAME} is appended to the workflow (json_insert cannot place a step mid-array) and is a no-op unless a superseded VACUOUS-PROBE-V3-1 contract of an open ROOT-CAUSE-1 ticket exists.
-- spof-review: no new loop, cap, hold or gate. One workflow step, ten contracts re-pointed, two backup tables (${BAK_WF}, ${BAK_CT}); the Rollback line removes the step and restores both.

CREATE TABLE IF NOT EXISTS ${BAK_WF} AS SELECT id, definition, version, updated_at FROM fleet_tasks WHERE id = 'management-personas';

CREATE TABLE IF NOT EXISTS ${BAK_CT} AS SELECT class, issue_id, ts, status, verify_probe, verify_transport, last_verdict, module, action, precondition, attempts, max_attempts, next_due_at, deferred_since, last_attempt_at, expected_cadence_h FROM remediation_contracts WHERE status = 'superseded' AND substr(action, 1, 18) = 'VACUOUS-PROBE-V3-1' AND class IN (SELECT 'issue-' || id FROM agent_issues WHERE status = 'open' AND title LIKE 'ROOT-CAUSE-1: % keeps recurring' AND instr(title, ';') = 0);

${jsonInsertSql};

${backfill};
`;

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(here + "workflow_step.json", stepJson + "\n");
  writeFileSync(here + "json_insert.sql", jsonInsertSql + "\n");
  writeFileSync(here + "rollback.sql", rollbackLine + "\n");
  writeFileSync(here + "2026-10-26-root-cause-contract.sql", migration);
  console.log("wrote workflow_step.json, json_insert.sql, rollback.sql, 2026-10-26-root-cause-contract.sql");
  console.log("backfill bytes:", Buffer.byteLength(backfill), " step json bytes:", Buffer.byteLength(stepJson), " json_insert bytes:", Buffer.byteLength(jsonInsertSql), " rollback bytes:", Buffer.byteLength(rollbackLine));
}
