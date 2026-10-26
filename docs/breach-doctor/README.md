# BREACH-DOCTOR-1: the fleet diagnoses and remediates its own breaches

Owner directive 2026-10-24, repeated 2026-10-26: "FLEET IS NOT SELF-DIAGNOSING ITS OWN BREACHES AND AUTOMATICALLY REMEDIATING". Charter pillar: `autonomy`.
Tracking issue: `agent_issues` 1000266. This directory is the durable record of the root-cause analysis (2026-10-26, read from `qnfo-audit` and `main`)
and of the designs the doctor is built from. A session or the code loop builds a family's playbooks from these files; nothing here is live by itself.

## What the doctor is

A block in `qnfo-fleet-control/worker.js` (between `// ---- BREACH-DOCTOR-1:BEGIN ----` and `END ----`) called from the `*/10` slot of `scheduledOnce`.
It is worker code on purpose: the D1 trigger BREACH-SELFHEAL-1 hung off `fleet_tick` and caused the 04:42Z to 06:12Z `SQLITE_NOMEM` heartbeat outage on 2026-10-26
(fixed by FLEET-TICK-SPLIT-1). The doctor writes its own metrics first, so a dead heartbeat cannot hide it.
Rules are data in `breach_playbooks`; the engine validates every statement before it runs (see ENGINE-DESIGN.md sections 3 and 4 and the engine README in `qnfo-fleet-control/`).

* Taint rule: free text (`description`, `exceptions_json`, event text, tool errors, plan reasons) never flows into an issue, a probe, a code task or a prompt. Facts are ids, counts and enum codes.
* Safety: a playbook younger than the cooldown runs in measure mode; two failed or reverted cases in 24 hours demote a rule to measure; every applied action stores its revert, writes a `decision_log` row and a `breach_diagnosis_events` row, and is verified by a probe (two consecutive passes).
* Switches (no deploy): `ops_config breach_doctor` = `off` | `measure` | `on`; `breach_doctor_rules_off`; per-playbook `enabled` and `mode`.

## Families and where each design lives (counts at 2026-10-26)

| Family | Open | Design | Notes |
|---|---|---|---|
| Engine, ledger, owner definition, metrics | 371 unowned of 447 open | ENGINE-DESIGN.md, LOOP-MAP.md, sql/engine-draft.sql.txt | Why no existing loop owned these issues |
| PROBE-NEEDED-1 and born-superseded contracts | 53 + 198 | FAMILY-PROBE-NEEDED.md, sql/probe-templates.sql.txt | The author's binding fix landed separately (fleet-control 0.49.2); hardening list in PROBE-AUTHOR-HARDENING.md |
| CODE-MERGE-REFUSED-1, CODE-LOOP-EXHAUSTED-1 and dead-task parents | 25 + 32 | FAMILY-CODE-MERGE.md, sql/cm-*.sql.txt | Seeded as playbooks CM-R1, CM-R2, CM-R3, CM-R5 |
| METRIC-TRIGGER-*, METRIC-REGRESSION-1, METRIC-FIX-RELAPSED-1 | 94 | FAMILY-METRIC.md, FAMILY-METRIC-CLASSIFICATION.md | Overlaps BREACH-ONE-MEANING (operators, duplicate triggers, breach causes); build only what it left |
| TOOL-FAILURE, self-heal, chaos drills, PAPER-LEARN, PORTFOLIO-GAP, OWNER-TASK | about 127 | FAMILY-TOOL-LOOP.md, sql/tool-loop.sql.txt | Planner verdict "untrusted" is stale for 32 of them (trust list widened 2026-10-24) |

## Adding a playbook

A playbook is one `INSERT OR IGNORE INTO breach_playbooks` in a migration (`-- APPLY-BY: ci`, `-- DB: qnfo-audit`, one-line `-- Rollback:`), with a `trigger_sql` that returns the issues the rule names, per-issue `action_sql` (each statement binds `?1` = issue id), `revert_sql`, `verify_sql`, caps, and a fixture test in `migrations/` that fails without the rule. Run the trigger read-only on live D1 first and put the real hit count in the migration comment. Close an issue only through `issue_triage.close_evidence` built from ids, counts and enum codes. A rule that cannot be made safe is a `file-issue` playbook or stays here as a design.

## Build packages (`specs/`)

Each package of the 2026-10-26 build has its audit spec in `specs/<package>.json` (state, evidence, lever, closing probe): `breach-doctor-core` (the engine), `dash-owner-actions` (approve, decline and diagnose in the dashboard),
`portfolio-gap-detectors`, `doctor-watch` and `doctor-watch-acting` (the second path in qnfo-cloud-ops: detect and report, then act through a service binding), `probe-author-harden`, and the three family packages
`probe-playbooks`, `tool-loop-playbooks` and `metric-playbooks`. A spec is data written by read-only auditors: re-verify every claim, line number and anchor against `main` and live D1 before building from it.
The landing record is `docs/handoff/2026-10-26-closeout-4.md`.

## Honest limits

Open-ended owner-request investigations (about 54 issues) have no executor class in the roster; the doctor does not pretend to clear them (ENGINE-DESIGN.md section 9). Owner-only acts stay IDENTITY-BOUND `human_actions` cards.
