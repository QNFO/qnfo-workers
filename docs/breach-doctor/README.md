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

## The second runner (BREACH-DOCTOR-WATCH-1 and -2, agent_issues 1000397)

The tick above has one slot, so a slot that is starved or crashes before the doctor (the 2026-10-26 `SQLITE_NOMEM` heartbeat outage is the observed case, not a dead D1) stops the diagnosis path.
`qnfo-cloud-ops` `jobBreachDoctorWatch` (every 10 minutes, another worker and another cron) measures it: it writes `doctor_tick_age_min` from the newest `breach_diagnosis_events` tick and files one deduped
issue when the age passes 30 minutes. Since `qnfo-cloud-ops` 1.40.0 and `qnfo-fleet-control` 0.55.0 it also ACTS: it calls `POST /breach-doctor/run` on `qnfo-fleet-control` through the `FLEET_CONTROL` service
binding (`props = { caller = "qnfo-cloud-ops" }`, no key), at most once in 30 minutes while the tick is stale and once a day as a drill while it is healthy.

* The route runs the same `breachDoctorTick`, so the same validators, `loop_lock` and live-case index, in its own invocation. Nothing of the engine is copied into `qnfo-cloud-ops` (the validator was patched three times in one day; a copy would drift).
* Who may call: only a service binding whose `ctx.props.caller` is `qnfo-cloud-ops`. A public host, no props or another worker is a 403 and writes nothing; `ops_config breach_doctor = off` is a 409 and writes nothing.
* The tick it runs writes its `tick` event with `source=watch` in the detail (the cron tick has no `source` key). The answer holds counts, the `tick_id` and an enum error code, never issue text.
* Two ticks at once (the `*/10` slot and the second runner) cannot act on one case twice: `loop_lock` lets one run (the other answers `lock-held` and writes no tick event), and the write-ahead of a `sql` or `file-issue` action is a compare-and-set on `state = 'diagnosed'` for a tick that lost its lock.
* The job claims a call before it makes it (a `cloud_ops_events` row `breach-doctor-watch-run-s-*` or `-d-*`, status `pending`), rewrites the same row with the answer, and stamps `control_registry breach-doctor-switch`, `spof_registry` (doctor tick) and `capability_ledger breach-doctor:second-path-playbooks` ONLY when a `tick` row with the returned `tick_id` and `source=watch` exists. A 403, a 409, `lock-held`, a timeout or a missing binding (`no-binding`) stamps nothing.
* `fm-breach-doctor-second-path-undrilled` reads the capability row: 1560 minutes (the 1440-minute drill plus the 120 minutes SLA-120M-1 allows) without a verified run is a failure while the doctor is not `off`.
* A doctor tick written by the second runner counts as a tick: while the `*/10` slot is dead, `doctor_tick_age_min` swings between 0 and about 40 instead of growing, and the run rows (not the metric) say which runner ticked.

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

## Honest limits

Open-ended owner-request investigations (about 54 issues) have no executor class in the roster; the doctor does not pretend to clear them (ENGINE-DESIGN.md section 9). Owner-only acts stay IDENTITY-BOUND `human_actions` cards.
