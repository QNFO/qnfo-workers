# BREACH-DOCTOR-1 playbooks: tool, loop and owner-request families

Measured 2026-10-26 06:00Z to 07:10Z against qnfo-audit (D1 35e2e573-92f3-46ac-83c6-22f6429fc5e5), read-only.
Repo reads: working tree at 6031c00e plus `git show origin/main:` for the files named below (qnfo-ops 2.57.0,
qnfo-code-orchestrator 0.28.0, qnfo-fleet-control 0.48.0 are the live and main versions at 06:40Z; qnfo-ops main and live moved to 2.57.1 by 06:54Z, so all qnfo-ops anchors below were re-checked unique against raw main at 2.57.1; deploy_drift_cf state `sync`).
Companion files in this directory:
- `doctor-sql.sql`   every SQL named here, run read-only, plus draft migrations (NOT applied)
- `tool-failure-classification.tsv`   the 15 TOOL-FAILURE issues, one row each
- `notes-interim.md`   early notes (superseded by this file)

Disclosure: one `git fetch -q origin` ran before I re-read the "no git writes" rule. It only updated `.git` remote refs
(14 commits behind); no working tree file, branch, or worktree was touched.

Live counts today (drift from the task text): TOOL-FAILURE 15, `[self-heal]` 10 (not 9), SELF-AUDIT-TOOLERR 3,
TOOL-ERROR-RATE-*-1 3 (same producer path, not in the task list), CF-CHANGELOG-1 2, CHAOS-DRILL-FAILED-1 8,
FLEET-JOURNEY-FAILED-1 5 (not 3), SECRET-CHANGE-OBSERVED 4, PAPER-LEARN-1 5, PORTFOLIO-GAP 9, LOOP-BREAKER-1 2,
WORKFLOW-FAILED-1 2, OWNER-TASK-* 59 (26 never planned, 23 not-code, 10 critical not-code). The 31 tool-signal issues
cover 15 tools; github_issue_get alone carries 6 of them.

## 0. The five facts that change the design

1. Trust is already wider than the task text says. Live `ops_config.code_merge_trusted_sources` (updated_at
   2026-10-24 14:03:36) has 34 entries (25 without a title prefix, 7 of those `*` source-prefix matches): the 21 of the 2026-10-21 backup plus 13 bare sources (cf-obs-bridge, cron-watch,
   workers-bp-audit, qnfo-ops, ops-autonomy, q08-signal-engine, loop-breaker, qnfo-research-exec, qnfo-lifecycle,
   fleet-journeys, portfolio-autopilot, cf-model-eval, owner-chat). No migration file, backup key or decision_log row
   records that edit (grep of migrations/, decision_log). So `PAPER-LEARN-1` (qnfo-lifecycle), `FLEET-JOURNEY-FAILED-1`,
   `PORTFOLIO-GAP`, `SECRET-CHANGE-OBSERVED` (qnfo-ops) and `LOOP-BREAKER-1` are ALREADY planner-trusted. Their
   "untrusted" ladder verdict is stale: 32 open issues carry `issue_plans.outcome='untrusted'` although their
   (source, title) now matches the list (SQL in doctor-sql.sql Q1). The planner re-reads a non-queued row only after
   PLAN_RECHECK_DAYS = 7 (qnfo-code-orchestrator/worker.js:2861; select at 3153-3158); the 2026-10-20 migration re-armed
   once, the 10-24 list edit did not.
2. Nothing in my families needs `cloud_ops_events:*` trusted. The right lever for 24 of the 31 tool issues is a
   classification row or a one-line qnfo-ops fix; for CHAOS, CF-CHANGELOG, SECRET, PAPER, PORTFOLIO it is not code.
3. The planner is capacity-starved by its own daily re-plan. On 2026-10-26 `issue_plans` took 48 model calls between
   00:02Z and 01:47Z (`code_plan_daily_cap` = 48, worker.js:3134 returns `daily cap`), 32 of them re-plans (attempts > 1)
   of issues that already had a verdict; none since. 133 open issues hold a `not-code` verdict (avg 2.9 attempts, max 8);
   ISSUE-AGE-24H-1 re-arms them daily, so daily demand (133) exceeds the cap (48) and first-time plans of the 26 unplanned,
   trusted OWNER-TASK issues starve. Also unexplained: no plan event 2026-10-25T10Z to 2026-10-26T00Z with the cap not
   reached (19 calls); a gate returned early without leaving a trace (`planIssues` persists nothing when it returns
   `{planned:false, why}`).
4. The injection boundary is a label check, not authentication. `ops_d1_write` (qnfo-ops/worker.js:3296) lets the qnfo-ops
   LLM agent, which also fetches web pages and reads mail, run any non-destructive INSERT or UPDATE on qnfo-audit, with no
   table allowlist. It can write `agent_issues` with any `source` (bare `qnfo-ops` is trusted) and can UPDATE
   `ops_config code_merge_trusted_sources WHERE key=...` (a WHERE clause makes it non-destructive). The defence for a
   trusted-source issue is: planner deny text, a second model's goal review, suites, CI, merge scope, canary revert.
   The first four are model- or text-judged. Keep new trust narrow and keep free text out of trusted descriptions.
5. A hung `fleet_tick` takes down the D1-trigger layer. `fleet_tick` raised SQLITE_NOMEM from about 04:42Z to 06:12Z
   (LOOP-BREAKER-1 1000258/1000259, last event 06:06:48Z); qnfo-code-orchestrator 0.28.0 (FLEET-TICK-SPLIT-1, live,
   `fleet_tick_heavy` second heartbeat, 2 rows) is the fix. Research-exec last wrote `done` at 04:32Z and 192 items wait;
   that stall explains two CHAOS drills. The doctor must not hang off `fleet_tick`.

## 1. Who files what, what text, what closes it, why nobody owns it

| Family (open) | Filer (code or trigger) | Issue text | Closer | Why nothing owns it |
|---|---|---|---|---|
| TOOL-FAILURE (15) | D1 trigger `tool_error_files_issue_v2` on `cloud_ops_events` insert; title `TOOL-FAILURE: <tool> [error]`, source `cloud_ops_events:<evt id>` | `substr(NEW.meta,1,500)`: error head AND the tool call args (SQL text, shell commands, GitHub comment bodies) | nothing automatic; `issue_refile_reopen` reopens the same title within 24 h | one event files one issue (no rate, no recovery test); source is `cloud_ops_events:*`, never trusted; and the lever is usually not code |
| TOOL-ERROR-RATE-*-1 (3) | trigger `tool_error_rate_filer_v3_ins` | fixed template, event id | none | same |
| SELF-AUDIT-TOOLERR (3) | `fleet_tasks.id='self-audit-systemwide'` step SQL (migrations/2026-09-29-self-audit-systemwide.sql:59) | fixed template with counts | none | ignores `tool_error_exclusions`; a fourth producer of one signal |
| `[self-heal] tool ...` (10) | qnfo-ops `telemetryAnalyze` (worker.js:2402-2504, title built at 2469) writes `issue_ledger`; qnfo-observability `evReview` (worker.js:652-671, insert at 662) copies it to `agent_issues` with source NULL | title carries counts, so every hourly change is a new title | none | counts in the title defeat evReview's exact-title dedupe (10 rows for 4 tools); NULL source reads "(none)" untrusted |
| CF-CHANGELOG-1 (2) | qnfo-fleet-control CF-CHANGELOG-LOOP-1 (worker.js:7905), source `cf-changelog` | Cloudflare changelog excerpt (external prose) plus a fixed DoD | none | DoD "adopt, migrate or reject" is a decision with no executor |
| CHAOS-DRILL-FAILED-1 (8) | qnfo-fleet-control `chaosDrill` (worker.js:13190-13323; file at 13295, self-close at 13300-13309), source `chaos-drill` | `last_observed` string produced by the fleet's own probe SQL (structured) | next passing 6-hourly drill closes it | each failing probe has a distinct cause (section 4); the drill cannot fix a wrong probe |
| FLEET-JOURNEY-FAILED-1 (5) | qnfo-fleet-control journeys (JRN_PREFIX worker.js:10023), source `fleet-journeys` | step names and details; observability group names are Cloudflare log text | the first passing run | two causes: a registry stub (qnfo-workers) and a worker memory failure; counts in the title duplicate rows |
| SECRET-CHANGE-OBSERVED (4) | qnfo-ops `secretChangeWatch` (worker.js:7344-7421; insert at 7411), source `qnfo-ops` | worker name, version numbers, ISO times, secret NAMES; structured | no probe, DoD is prose | verification was never made machine-checkable |
| PAPER-LEARN-1 (5) | qnfo-lifecycle `plFileIssue` (worker.js:2721-2743), source `qnfo-lifecycle` | LLM prose derived from paper full text (free text) | contract probe: no `proposed` direct learning left for that slug and version | PL-TRIAGE-1 (worker.js:2782-2893) settles in-place and rejected, and leaves "apply" rows `proposed` "for a doer"; all 21 learnings of the 5 issues are `PL-TRIAGE-1 apply`; no doer exists (472 apply rows in total) |
| PORTFOLIO-GAP (9) | `fleet_tasks` workflow `portfolio-autopilot` (D1), source `portfolio-autopilot` | fixed templates with entity names | its own `close-unobserved` step | 5 of 9 are about the retired root stub `qnfo-workers` and `voice-stt`; 2 compat-date issues need a `wrangler.toml` edit the loop is never allowed (DENY_PATH worker.js:341; cmScope has no wrangler.toml) |
| LOOP-BREAKER-1 (2) | qnfo-ops loop-breaker step over view `v_loop_breaker_signatures`, source `loop-breaker` | signature plus one example event text (free text) | signature quiet for 6 h | self-closing; both rows are one event pair (`fleet_tick` and `fleet_tick-isolated`) |
| WORKFLOW-FAILED-1 (2) | qnfo-fleet-control WORKFLOW-FAILURE-INTAKE-1 (worker.js:6147-6151) | workflow name, run URL, head sha, step name | `workflow_main_state` shows a later success | 1000020 names a workflow file deleted from main, so no run can ever pass |
| OWNER-TASK-* (59) | qnfo-fleet-dashboard `ownerRequestIssue` (worker.js:5903, title at 5927), source `qnfo-fleet-dashboard:owner-request` | the owner's own typed prompt, or a dashboard-generated prompt | an executor | planner trusted, but a single-file model; investigation, audit and multi-step tasks are `not-code`; 18 duplicates by title stem |

## 2. Trust configuration (the constants and the test that holds them equal)

| Where | Line | Holds |
|---|---|---|
| qnfo-fleet-control/worker.js `CM_TRUSTED_SOURCES` | 3351 | default list, 8 entries (merge runner `cmTrusted` 3434, `cmProvenance` 5001) |
| qnfo-code-orchestrator/worker.js `PLAN_TRUSTED_DEFAULT` | 2919 | same 8 entries (`planTrustRules` 2920, `planTrustList` 2926, `planTrusted` 2933, `planTrustedSql` 2940) |
| qnfo-code-orchestrator/worker.js `INTAKE_TRUSTED_DEFAULT` | 2612 | same 8 entries (`intakeTrusted` 2613, `intakeTrustedList` 2622; refusal and `session-task:` rewrite 2751-2755) |
| qnfo-fleet-control/worker.js `CM_LOOP_CANARIED` / orchestrator `PLAN_LOOP_CANARIED` | 3340 / 2877 | qnfo-ai, qnfo-gateway, qnfo-fleet-control, qnfo-ops, qnfo-deploy-guard, qnfo-code-orchestrator |
| ops_config key | `code_merge_trusted_sources` | THE live list, read by all three consumers with the same grammar: `source`, `source*` prefix, `source|title-prefix` |

Held equal by tests, but only the DEFAULT constants: `qnfo-code-orchestrator/plan-trust-parity.test.mjs:72-76`
(PLAN_TRUSTED_DEFAULT equals CM_TRUSTED_SOURCES), `qnfo-fleet-control/code-merge.test.mjs:752-766` (every planner rule
is trusted by the runner row by row; the planner and runner both refuse `qnfo-ops` / `X` on the DEFAULT list),
`qnfo-code-orchestrator/reintake.test.mjs:24` (INTAKE_TRUSTED_DEFAULT), and `qnfo-fleet-control/fold-guard.test.mjs:27-42`
(PLAN_LOOP_CANARIED equals CM_LOOP_CANARIED). No test or trigger watches the live row. Live entries are already ahead of the
defaults by 26 entries, so the tests pass whatever the row says. Finding: add a D1 trigger on `ops_config` updates of this
key that writes `decision_log` and a `--bak-` backup row (TRUST-LIST-LEDGER-1) and re-arms stale `untrusted` verdicts.

Orchestrator gates that follow trust: `PLAN_DENY_CATEGORY` 2879 (security, governance, outreach, legal, finance, identity are
never planned), `planDenyHit` text deny (secrets, caps, deletions), `PLAN_DENY_WORKERS` 2878, `validTask` 376-387 (no
`wrangler.toml`, `.github/`, `deploy-targets.txt`, `.env*`: DENY_PATH 341), `mergeScopeWhy` 779-800 (allows
`migrations/*.sql`, `docs/**.md`, `scripts/*.py|mjs`, `<w>/worker.js`; mirrors `cmScope` 3380-3402).

### What flows into the model, so what injection can reach

Planner: `ISSUE title (300) + description (3000)` goes into the prompt (worker.js:3221); intake: the WHOLE issue description
(minus the `code-task:` line, up to GOAL_MAX 6000) becomes the code-task goal (worker.js:2791-2793). So for any trusted
source, every character of the description is an instruction to a code-writing model.

Free text that reaches trusted descriptions today (verified in rows or code): `loop-breaker` (example event text),
`fleet-journeys` (Cloudflare observability group text), `cf-obs-bridge` (group message text in the title and body),
`qnfo-lifecycle` (LLM prose from paper full text, 3272 chars), `qnfo-research-exec` (research text), `qnfo-ops` (agent-authored
rows, 270 in all, plus unrestricted `ops_d1_write`), `owner-chat`. None of these is a hypothetical: the 13 bare
entries added on 2026-10-24 admit them without a title prefix.

### Decision on PLAN_TRUSTED

- DO NOT add `cloud_ops_events:*` (event args hold agent- and web-derived text: shell commands, GitHub comment bodies,
  SQL), `self-audit-systemwide`, `chaos-drill`, `cf-changelog`, or bare `qnfo-fleet-control`. A bare source cannot tell a
  generated template from copied text.
- ADD exactly one pair to the live row: `qnfo-fleet-control|BREACH-DOCTOR-1:`, by migration with backup key
  `code_merge_trusted_sources--bak-<ts>`, rollback line and decision_log row (precedent
  `migrations/2026-10-20-plan-trust-parity.sql`). Do not touch the three DEFAULT constants (live-only entries are the
  existing practice: METRIC-FIX-RELAPSED-1: is live-only), so no test edits. The doctor is the single sanitising hop.
- NARROW the 13 out-of-band bare entries to `source|TITLE-PREFIX` pairs in the same migration, one prefix per generator
  (`loop-breaker|LOOP-BREAKER-1:`, `fleet-journeys|FLEET-JOURNEY-FAILED-1:`, `portfolio-autopilot|PORTFOLIO-GAP`,
  `qnfo-lifecycle|PAPER-LEARN-1:`, `qnfo-ops|SECRET-CHANGE-OBSERVED:`, `cf-obs-bridge|CF-OBS-ISSUE-1:`, ...). Drop bare
  `qnfo-ops` first: it is the one source whose writer is a prompt-injectable agent with D1 write. This does not lose any
  family in this report (none needs code); where an entry feeds a working flow (cf-obs-bridge has 64 code-task rows) the
  prefix keeps it.
- Re-filing by the doctor (typed template, structured fields) is chosen over trusting event-derived sources because the
  injection boundary then sits in one reviewed function with a typed-placeholder check, not in nine generators.

Risk weighed: P(attacker text reaches a description) is high for event/log/paper/web sources (they exist now); the
consequence chain after trust is a model edit to a worker, passing a second model's review and CI; impact is a merged,
deployed change to a fleet worker (control plane included: PLAN_LOOP_CANARIED). The residual cost of the doctor hop is one
tick of latency and a playbook table to maintain. The cost of widening trust is an unreviewed path into production.

## 3. Doctor invariants (every rule below obeys them)

- I1 Structured facts only. Inputs: integers, ISO times, enum values, identifiers validated by `^[a-z0-9][a-z0-9_.-]{1,60}$`
  and checked against a live registry (tool list, `service_registry`, `deployed_workers`), and text the fleet itself authored
  (probe `last_observed`, template prose, `close_evidence` it wrote). Never read for instruction: `cloud_ops_events.meta` and
  `.text` free text, tool `args`, `agent_issues.description` of event-derived issues, log lines, paper text, email, changelog
  prose. Event text is only a HAYSTACK: `instr(meta, rule.match_literal) > 0`, where `match_literal` comes from the reviewed
  `tool_error_class_rules` row. The output of classification is a `rule_key`, never the matched text.
- I2 Typed output. Every string the doctor writes is a template from `doctor_playbooks.template` with placeholders of type
  `int`, `iso`, `ident`, `enum`, `url_fixed`; a value of any other shape aborts the write (fail closed) and logs
  `doctor.refused`.
- I3 Allowlisted actions only: `EXCLUDE_ADD`, `PLAN_REARM`, `ISSUE_CLOSE_EVIDENCE`, `ISSUE_SUPERSEDE`, `CODE_TASK_FILE`,
  `GOAL_ROUTE`, `PROBE_CODE_TASK` (a migration through the code loop, never a direct write to a probe or a security
  control), `OPS_CONFIG_SET` for named keys with a bound. No secrets, credentials, owner documents, personal or outreach
  data, workflows, `wrangler.toml`, deletes without `BACKUP`. The harness checks, secret lock and live work claims
  (`GET /work-locks`) win.
- I4 Each action writes `decision_log` (assumption, action, evidence, outcome, blast_radius, rollback_path,
  capability_gain, predicted_outcome, surfaces_tested) and has a kill switch `ops_config doctor_<rule>=off` and per-tick
  and per-day caps. Each new filter registers under the existing `control_registry` row `tool_error_exclusions`
  (alternate: `tool_failures_excluded_24h`), and the surge guard (R3b) is that alternate's drill.
- I5 Close only with evidence: `issue_triage.close_evidence` carries the rule key, the facts and a re-runnable probe
  (never `wontfix`). Duplicates are superseded with the successor's id (the trigger
  `agent_issues_superseded_contracts_upd` reads "superseded"). A doctor close that relapses within 24 h reopens through
  `issue_refile_reopen`; the doctor counts it in `doctor_clear_verified_share`.
- I6 Freshness and idle: classify only on facts younger than 10 minutes; "recovered" needs `last_ok > last_err` and
  `calls_72h >= 5`; a tool with fewer calls is `idle` and the issue stays open with `next_check` (silence is not recovery).
- I7 Placement: worker cron step (CRON-SINGLE-TRIGGER-1 table) or `fleet_tick_heavy`; never a new trigger on `fleet_tick`.
  It writes its own heartbeat row so LOOP-WATCH-1 sees it stop.

## 4. Classification of the 15 TOOL-FAILURE issues (all read in full)

Facts: 7-day unexcluded errors = 162; the 13 literal classes in R3 cover 108 of them (67%); 15 have an empty error, 9 are
`The operation was aborted`, 33 are `_truncated`-flagged (the error head is still in `meta._raw`, which starts with
`{"error":"..."`; `json_extract(meta,'$.error')` is NULL for those). `calls`/`errs` are 72 h.

| Issue | Tool | What the event shows | Class | Evidence beyond the sample | Action |
|---|---|---|---|---|---|
| 100429 | ops_d1_query | `near "references": syntax error` in caller SQL | agent input error | 366 errors of 4186 calls, 16 unexcluded; later 13 ok calls | R4 `TD-D1Q-REJECT` code fix (d1Query lacks the D1-CALLER-REJECT-1 treatment d1Write has, qnfo-ops/worker.js:1906 vs 3296); interim exclusion `: syntax error at offset` |
| 100431 | dashboard_feed | `error:""`, args path `/api/cmd` | tool defect (empty error); also agent input (GET on a command route) | `dashboardFeed` returns `{ok:r.ok,status,...}` with no `error` key (worker.js:3160-3170); 5 empty-error events in 7 d | R4 `TD-EMPTY-ERROR` |
| 100432 | shell_pipeline | `error:""`, a grep step with no match | tool defect (empty error) | `shellPipeline` returns `{ok:false, failed_at_step, results}` without `error` (worker.js:5503-5521); `command exited` exclusion only covers `fmtContainer` results | R4 `TD-EMPTY-ERROR` |
| 100436 | fleet_graph | `no node with id or name d1t:audit.code_tasks; use fleet_graph_find` | agent input error | 23 errors in 72 h, 13 are `d1t:audit.` for graph id `d1t:qnfo-audit.` (live `/fleet-graph/find` returns the latter) | exclusion `use fleet_graph_find`; optional `TD-GRAPH-ALIAS` (map `d1t:audit.` to `d1t:qnfo-audit.` in `fleetGraphTool`, worker.js:3145) |
| 100437 | github_issue_get | `GitHub 404: Not Found`, args number 100350 | agent input error | 100350 is a D1 `agent_issues` id; GitHub numbers stop near 4270; 13 of 38 calls fail | exclusion `GitHub 404: Not Found` |
| 100457 | cf_docs | `path must be a developers.cloudflare.com path`, args mode models, model `@cf/moonshotai/kimi-k2.6` | agent input error with a UX defect | `cfDocsTool` runs `clean(args.model)` into `CF_DOCS_PATH_RE`, which rejects `@` (worker.js:3177 onward); 3 of 26 calls | exclusions for the three cf_docs refusals; optional `TD-CFDOCS-MODELID` (strip `@cf/<vendor>/`) |
| 100461 | run_code_net | `Unexpected token 'e', "error code: 520" is not valid JSON`, 40 s | transient upstream plus caller code | openlibrary.org answered a Cloudflare 520 page and the caller code did `r.json()` | exclusions ` is not valid JSON`, `error code: 52` |
| 100471 | github_issue_comment | `GitHub 404: Not Found`, meta truncated | agent input error | 1 of 4 calls; args truncated, error head read from `_raw` | exclusion (same as 100437) |
| 100609 | shell_exec | `container timeout after 60000ms (cold start ~15s; retry or increase timeout_ms)` | transient or caller timeout | 102 of 1029 calls, 97 ok within 30 min; the command ran a git worktree plus node gate in under 60 s default | exclusion `container timeout after` plus surge guard R3b |
| 100611 | ops_research_kick | `The operation was aborted`, 90000 ms, mode sync | real tool defect (message) | 9 of 42 calls, all `sync`; `researchKick` aborts at RESEARCH_KICK_TIMEOUT_MS 90000 (worker.js:1703-1720) and reports a bare AbortError although the stage may still run | R4 `TD-KICK-ABORT` (name the timeout and say the stage may still be running); then exclude the new text |
| 1000001 | git_clone_exec | `error:""`, ms 32030, post-clone `cmd` ran `ls`/`node -e` | tool defect (empty error) | final `return {ok:(execJ.result||{}).exitCode===0,...}` has no `error` (worker.js:5445); reopened by `issue_refile_reopen` | R4 `TD-EMPTY-ERROR` |
| 1000044 | ops_d1_write | `D1_ERROR: unrecognized token: "'PATH-WALL CLE...` | agent input error | unescaped quote in a long INSERT; D1-CALLER-REJECT-1 regex (worker.js:3319) lacks `unrecognized token` | add `unrecognized token|too many terms|too complex|parameter bindings` to both regexes (R4 `TD-D1Q-REJECT`); interim exclusion |
| 1000046 | github_file_write | `repo (owner/name) + path required`, path `mind/wrangler.toml``  | agent input error | trailing backticks in `path` | exclusion |
| 1000115 | web_fetch | `self-fetch blocked: qnfo-ops cannot fetch its own hostname (ops.qnfo.org)` | correct refusal | qnfo-ops/worker.js:2745; 3 events 7 d | exclusion `self-fetch blocked` |
| 1000117 | container_workspace_exec | `container timeout after 60000ms ...` | transient or caller timeout | 34 of 282 calls, 67 ok within 30 min | exclusion plus surge guard |

Retry check: 12 of the 15 tools have a later `ok` call in the following 30 minutes. `github_issue_get` and
`github_issue_comment` show none (the callers moved on), which is consistent with a wrong id.

## 5. Doctor rules

Format: trigger (SQL over structured facts), diagnosis, automatic remediation (exact allowlisted action), safety checks,
verification, expected clears, owner residue. SQL is in `doctor-sql.sql`; Qn below names the block.

### R1 stale-untrusted-rearm (all families)
- Trigger: Q1. An open issue with `issue_plans.outcome='untrusted'` whose (source, title) now matches the live
  `code_merge_trusted_sources` row by the planner's own grammar (recursive split of the row, Q1). 32 rows today.
- Diagnosis: `trust-list-changed`; evidence fields: issue id, source, title prefix, `planned_at`, list `updated_at`.
- Action `PLAN_REARM`: `UPDATE issue_plans SET planned_at='2000-01-01T00:00:00Z', detail=substr('DOCTOR-REARM-1 list changed '||?1||' (was untrusted at '||planned_at||')',1,600) WHERE issue_id IN (...) AND outcome='untrusted'`, at most 40 a tick (precedent migration 2026-10-20-plan-trust-parity.sql section 2). Revert: restore `planned_at` from the detail text.
- Safety: only rows matching the list; PLAN_DENY_* still apply at plan time; skipped while the planner reports `daily cap`.
- Verification: `SELECT '0' ... FROM issue_plans p JOIN agent_issues a ... WHERE p.outcome='untrusted' AND <matches list>` (Q1 with count).
- Clears: 0 issues by itself (it removes a false verdict). It unblocks R2 and the planner for 5 PAPER-LEARN, 3 FLEET-JOURNEY, 4 PORTFOLIO-GAP, 1 SECRET-CHANGE.
- Permanent form (TRUST-LIST-LEDGER-1): a D1 trigger on `ops_config` UPDATE of `code_merge_trusted_sources` writes decision_log, a `--bak-` row and runs this re-arm.

### R2 planner-capacity (OWNER-TASK, all not-code)
- Trigger: `issue_plans` model calls today >= 0.8 * `code_plan_daily_cap` AND open trusted issues with no plan row > 0 (Q6).
- Diagnosis: `replan-starves-first-plans` (32 of 48 on 2026-10-26).
- Action: `CODE_TASK_FILE` (typed template, qnfo-code-orchestrator is PLAN_LOOP_CANARIED): (a) re-arm a not-code verdict only when `agent_issues.updated_at > planned_at` or the trust list changed, not on the clock; (b) first-time plans ahead of re-plans (`ORDER BY (p.issue_id IS NULL) DESC` inside the priority classes); (c) at the cap, plan on the cheapest model instead of returning `daily cap` (BUDGET-SOFT-ROUTE-1); (d) write a `code-task.plan-idle` event with `why` whenever `planIssues` returns `planned:false`. Anchors verified unique on origin/main: `  if (used && Number(used.n) >= planCap) return { planned: false, why: "daily cap " + planCap };` and the `const trusted = (await env.AUDIT_DB.prepare(sel + tp.sql + ord + PLAN_WINDOW)...` line.
- Verification: model calls today for issues with `p.issue_id IS NULL` at creation >= 50% of the cap; `SELECT count(*) FROM v_issue_age_ladder WHERE title LIKE 'OWNER-TASK-%' AND plan_outcome IS NULL AND age_h > 2` = 0.
- Clears: the 26 never-planned OWNER-TASK issues get a verdict within a day; they stay open unless R9 or an executor acts.

### R3 tool-error classify and exclude (31 issues: TF 15, SH 10, SA 3, ER 3)
- Trigger Q2 (per-tool facts over 72 h from `cloud_ops_events kind='ops_ai_tool'`: calls, errors, unexcluded errors, last_ok, last_err) joined to the open issues (Q3 maps titles of all four producers to one tool key).
- Diagnosis: rule table `tool_error_class_rules(rule_key, match_literal, err_class, tool_scope NULL, source_proof, action)` seeded by migration. Classes: `agent-input-error`, `correct-refusal`, `infra-artifact`, `caller-code-error`, `tool-defect`. The 13 seeded literals (7-day events matched): `use fleet_graph_find` 23, `GitHub 404: Not Found` 19, `container timeout after` 33 (14 d), `too many terms in compound SELECT` 11, ` is not valid JSON` 8, `: syntax error at offset` 5, `self-fetch blocked` 3, `repo (owner/name) + path required` 2, `path must be a developers.cloudflare.com path` 2, `D1_ERROR: unrecognized token` 2, `docs page not found` 1, `query required for mode` 1, `error code: 52` 1. All matched only error events (non-error events: 0, except one for `: syntax error at offset`).
- Action `EXCLUDE_ADD`: `INSERT OR IGNORE INTO tool_error_exclusions(pattern, err_class, rationale) SELECT match_literal, err_class, 'TOOL-CLASSIFY-2 '||?now||': '||rule_key||' n7d='||?int FROM tool_error_class_rules WHERE rule_key=?`. The pattern is the reviewed literal. `source_proof`: the literal occurs verbatim as a string in the owning worker's source on main (GitHub raw `instr`), or the rule is flagged `external_literal` (D1 formats). Revert: `DELETE FROM tool_error_exclusions WHERE rationale LIKE 'TOOL-CLASSIFY-2%'`.
- Then `ISSUE_CLOSE_EVIDENCE` for every open issue of that tool (all four producers) when, with the new rules, either (a) `unexcluded_after_rules = 0` (every error of the 72 h is classed as input, refusal or infrastructure, so recovery is not the question), or (b) `unexcluded_after_rules <= max(2, 1% of calls)` AND `last_ok > last_err` AND `calls_72h >= 5`. A tool with fewer than 5 calls in branch (b) is `idle` and stays open with `next_check`. `close_evidence`: `TOOL-CLASSIFY-2 <iso>: tool=<t> calls_72h=<n> errors=<e> unexcluded_after_rules=<u> rules=<keys> recovered=1; probe: Q4`.
- Tool scoping gap: `tool_error_exclusions` has no tool column and the filers match `instr(meta, pattern)`. A pattern therefore applies to every tool. `GitHub 404: Not Found` is checked as 19 events from github_issue_get, github_issue_comment, git_op only; the migration adds a nullable `tool` column and the five consumers (`tool_error_files_issue_v2`, `tool_error_rate_filer_v3_ins`, views `tool_error_rate_24h`, `tool_failures_24h`, `tool_failures_excluded_24h`, plus `v_loop_breaker_signatures`) add `AND (x.tool IS NULL OR x.tool = e.text)`. Until then keep to literals that only the owning tool emits.
- R3b surge guard (the alternate path of the filter): if for a tool the excluded-class errors in 6 h are >= 30% of its calls with >= 10 calls, un-suppress: file `TOOL-EXCLUDED-SURGE-1: <tool>` from `tool_failures_excluded_24h` (structured: tool, pattern id, counts). This stops an exclusion from hiding a real outage (a container capacity problem would otherwise read as `container timeout after`).
- Verification (Q4): `SELECT '0' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM cloud_ops_events e WHERE e.kind='ops_ai_tool' AND e.text=?tool AND e.status='error' AND e.ts > ?closed_at AND NOT EXISTS (SELECT 1 FROM tool_error_exclusions x WHERE instr(COALESCE(e.meta,''),x.pattern)>0 OR instr(COALESCE(e.text,''),x.pattern)>0)`, 24 h after the close.
- Clears now: 17 issues on 9 tools whose only errors are covered (fleet_graph 3, github_issue_get 6, cf_docs 1, run_code_net 1, github_issue_comment 1, shell_exec 2, web_fetch 1, container_workspace_exec 1, github_file_write 1). The other 14 wait for R4.
- Owner residue: none.

### R4 tool-defect code-task (real defects), sanitized
Six playbook rows, all `qnfo-ops/worker.js` (qnfo-ops is PLAN_LOOP_CANARIED and CM_LOOP_CANARIED; the template takes `min_version` from the raw VERSION of main at filing time with patch+1: it was 2.57.0 in the working tree and 2.57.1 on main at 06:54Z, so another session or loop is editing the file: take the work-lock and expect `in_flight`):

| rule_key | Fix (static prose) | Verified-unique anchor | Marker (`code-probe contains`) | Clears |
|---|---|---|---|---|
| TD-D1Q-REJECT | in `d1Query`'s catch, after the `out` object, mark `out.rejected = true` when the message matches `/syntax error\|SQLITE_CONSTRAINT\|datatype mismatch\|unrecognized token\|too many terms in compound SELECT\|LIKE or GLOB pattern too complex\|Wrong number of parameter bindings/i`; add `unrecognized token\|too many terms\|too complex\|parameter bindings` to the regex in `d1Write` (line 3296 block) | `    const out = { ok: false, db: bind, error: msg };` | `D1-CALLER-REJECT-2` | ops_d1_query 100429 (+ER 1000023), ops_d1_write 1000044 |
| TD-EMPTY-ERROR (dashboardFeed) | add `error: r.ok ? undefined : "dashboard feed HTTP " + r.status` | `return { ok: r.ok, status: r.status, path, json: j \|\| undefined, text: j ? undefined : fpaCap(t, 12e3) };` | `TD-EMPTY-ERROR-DASH` | dashboard_feed 100431 |
| TD-EMPTY-ERROR (shellPipeline, gitCloneExec) | when a step or the exec exits non-zero return `error: "command exited " + <code>` (the text the existing `command exited` exclusion matches) | `    const j = await containerDispatch(env, "/sh", { cmd, cwd }, timeout);` and `return { ok: (execJ.result \|\| {}).exitCode === 0, cloned: true, ...` | `TD-EMPTY-ERROR-PIPE` | shell_pipeline 100432, git_clone_exec 1000001, +SH 1000141/123/190/164 |
| TD-KICK-ABORT | in the `researchKick` catch, name the timeout: `error: "research kick timed out after " + RESEARCH_KICK_TIMEOUT_MS + " ms (the stage may still be running)"` for AbortError | `    return { ok: false, mode, error: String(e && e.message \|\| e) };` | `research kick timed out after` | ops_research_kick 100611 (+SA 1000054, SH 1000059, 1000065); then R3 excludes the new literal |
| TD-GRAPH-ALIAS (optional) | in `fleetGraphTool`, map a leading `d1t:audit.` to `d1t:qnfo-audit.` before `qp.set` | `    if (args && args[k] != null && args[k] !== "") qp.set(k, String(args[k]).slice(0, 300));` | `TD-GRAPH-ALIAS` | removes the 13-of-23 fleet_graph mistake |
| TD-SELFHEAL-TITLE | build the `[self-heal]` title without counts (counts to `last_detail`), so `evReview`'s exact-title dedupe holds | `      const title = "[self-heal] tool " + toolKey + " failing x" + _errs + ...` (unique, worker.js:2469) | `SELFHEAL-STABLE-TITLE-1` | stops new duplicates; R5 closes the 10 existing |

- Issue shape (the only text the loop sees; every value typed): title `BREACH-DOCTOR-1: TOOL-DEFECT <rule_key> <tool>`, source `qnfo-fleet-control`, category `reliability`, priority `medium`, description:
```
Charter pillar: autonomy. Filed by qnfo-fleet-control BREACH-DOCTOR-1 rule <rule_key> from structured facts only.
Facts: tool=<ident> window_h=72 calls=<int> errors=<int> first_seen=<iso> last_seen=<iso> doctor_run=<iso>.
<goal_template: static prose from doctor_playbooks, no event text>
code-task: repo=qnfo-workers path=qnfo-ops/worker.js
code-anchor: <verbatim anchor line from the playbook>
code-probe: {"paths": ["qnfo-ops/worker.js"], "contains": "<marker>"}
runtime-probe: {"url": "https://qnfo-ops.q08.workers.dev/health", "status": 200, "contains": "qnfo-ops", "min_version": "<main VERSION with patch+1>"}
```
- Safety before filing: raw-read the file from main, `countOccur(anchor)==1` and `countOccur(marker)==0` (the probe must not already pass); `pathBusy` / `GET /work-locks` free; not already a task for this rule in the last 72 h; at most 2 doctor tasks open per worker; the planner/intake gates still apply (`PLAN_DENY_*`, goal review, suites, canary revert).
- Verification: the issue's `code-probe` (marker on main), the runtime `min_version` probe, and a D1 probe on the symptom after `deployed_at`: `SELECT '0' ... FROM cloud_ops_events WHERE kind='ops_ai_tool' AND status='error' AND json_extract(meta,'$.error')='' AND ts > ?deploy_ts`.
- Clears: 14 TOOL issues plus the 4 duplicates of ops_research_kick and 4 of git_clone_exec once deployed (about 2 to 4 hours through the loop).

### R5 tool-signal dedupe (one path for one signal)
- Trigger Q3: more than one open issue for the same tool across TOOL-FAILURE, TOOL-ERROR-RATE, SELF-AUDIT-TOOLERR, `[self-heal]`. 31 issues for 15 tools; github_issue_get 6, git_clone_exec 5, ops_research_kick 4, fleet_graph 3.
- Action `ISSUE_SUPERSEDE`: keep the `TOOL-FAILURE` row (else the oldest) as canonical; close the others with `close_evidence = 'superseded by #<id>: same tool <t>, same signal (TOOL-SIGNAL-ONE-PATH-1) <iso>'` and `close_channel='auto:doctor/tool-dedupe'`. Safety: same validated tool key; never supersede an issue that holds a live work claim or a `code-task:` line.
- Verification: `count(open issues per tool) <= 1`.
- Clears: 16 immediately (31 minus 15 canonical); the rest by R3/R4.
- Structural: SELF-AUDIT-TOOLERR's step SQL should honour `tool_error_exclusions` (`fleet_tasks` id `self-audit-systemwide`, migration with rollback); the `TD-SELFHEAL-TITLE` code task above fixes the count-in-title duplication.

### R6 chaos-drill diagnosis (8; the drill self-closes on the next pass)
Each `last_observed` is the fleet's own SQL output, so it may be read. Cause classes:

| Issue | Control or component | Fact | Class | Remedy | Verify |
|---|---|---|---|---|---|
| 100482 (critical) | ops-jobs-payload-redaction | 6 `ops_jobs` rows match (one also trips the `/verify` span); in all 6 `one-time code` hits the phrase sits in tool/assistant messages and is never followed by 6 digits; no `token=` in any message; the 7th hit is `%/verify%token=%` matching across a 195 KB payload | probe false positive: over-broad LIKE, phrase not value | `PROBE_CODE_TASK`: migration replacing `probe_sql` with the per-message form (Q8a). Tested: returns `ok` on live; flags 3 of 3 synthetic leaks (code after phrase, `token=` plus 16 token chars, `login code:`) and 0 of 2 prose cases. A security control: through a PR with CI, never a direct D1 write; keep the 15-day sweep clause | next drill returns ok; plus unit test of `redactJobBody` (qnfo-ops/worker.js:1106) with seeded leak |
| 1000057 | research-floor-rearm | table `bak_20261019_research_parked` absent; `park-rearm-tick` ran 13 times in 48 h | probe depends on an ephemeral backup artifact | migration: replace the bak-table clause with a `decision_log` rollback_path check | drill pass |
| 1000119 | qnfo-research-exec single executor | last `done` 04:32:42Z, 192 queued | real stall in the NOMEM window (04:42Z to 06:12Z) | wait; verify `done` within 120 min of 06:12Z; if not, force the existing watchdog proof stage | drill pass |
| 1000120 | research-revise-refs-extend | last `revise-patch` 04:32:41Z | same | same | drill pass |
| 1000198 | remediation reopen on relapse | probe reads `recurrence_guard_actions` (465 rows, last 2026-10-18T11:04Z); reopens continue (517 `issue_lifecycle` reopened events in 7 d, last 06:41Z) | probe reads a table the live reopen path no longer writes | migration: count `issue_lifecycle` events `reopened` in 7 d | drill pass |
| 1000214 | control-alternate-probes | `v_control_alternate_untested.controls_untested_without_probe` = 3: research-quality-gate, evolve-wip-recovery, pub-gate-withdraw | registry gap | probe authoring (PROBE-AUTHOR-LIVEPATH-1 style, executed against live and a seeded negative) or a dated test with evidence | drill pass |
| 1000243 | agent-ws-reactivation-prerequisites | issue 1000140 now has `session-task:` not `code-task:`: NEEDS-ANCHOR-ROUTE-1 rewrote it (code-task.anchor-routed 2026-10-25T18:53Z); intake also refuses (qnfo-agent-ws FOLDED) | two guards in conflict: the probe requires the literal the loop rewrites | migration: accept `code-task:` or `session-task:` | drill pass |
| 1000244 | idea-triaged-hold-owner-and-reentry | no `artifact_reentry` signal at all since 2026-10-18T23:23Z (consumed 361, expired 372, new 17) | producer stopped | locate producer (idea-hub reentry drain / qnfo-signal-loop) and restart through a code-task; the probe is correct | drill pass |

Expected: 8 of 8 clear without the owner; 3 need a migration PR, 2 wait for recovery (verify), 2 need a code or authoring step.

### R7 secret-change verification (4)
- Trigger: open `SECRET-CHANGE-OBSERVED: <ident> <date>` older than 30 min (name matched against `deployed_workers`).
- Facts (Q7): the `secret-change-<w>-<v>` event and its `binding-props-restore` event (`dispatch_http` 204); `deployment_history` rows for the worker after the change; `worker_live_audit.match=1` after the change; zero `status='error'` events naming the worker with 401/403/Unauthorized since T+30 min; secret NAMES (never values) via the issue text.
- Action: `ISSUE_CLOSE_EVIDENCE` listing those facts when all hold. Names like `*_2`, `*_PREV` mark dual-key workers (qnfo-ops has OPS_ROUTER_AUTH_KEY_2): record "dual-key by design" and verify only the above; the doctor never tests an old key (it must not hold one).
- Worked example (1000200, qnfo-fleet-dashboard): `secret-change` event v404 at 11:35:36Z; `binding-props-restore` dispatched 12:02:27Z (6 bindings); `deployment_history` shows deploys through 06:52:34Z; `worker_live_audit` match 1, SYNC, 1.65.0; 0 auth errors since 12:05Z. Same shape for qnfo-ai-search (2.9.0 SYNC) and qnfo-research-exec (0.34.2 SYNC).
- Safety: read-only. Takes no secret-lock, writes no secret. If any fact fails, keep open and file nothing new.
- Clears: 4 of 4 (100418 research-exec, 1000199 ai-search, 1000200 dashboard, 100333 qnfo-ops).
- Owner residue: only a secret value, an owner client credential, or a rotation; none appears here.

### R8 cf-changelog adopt/migrate/reject (2)
- Trigger: open `CF-CHANGELOG-1:` with `cf_changelog_items.klass='deadline'`.
- Facts: deprecated or renamed symbols named in the item, extracted by fixed regexes over backticked tokens near `deprecated|feature frozen|replaces|renamed|removed`, each validated `^[A-Za-z0-9_@/.-]{3,60}$`; a literal search over tracked sources of live workers only (dirs without `FOLDED`/`RETIRED`, excluding `vendor/` and `node_modules`).
- Result today (verified by grep): `createAI replaces workers-ai-provider and ai-gateway-provider`: qnfo-agents/src/index.ts:26 and :241 already use `createAI`; no live source references either provider. `Think agents now use @cloudflare/computer`: `@cloudflare/think` appears only in qnfo-fleet-advisor/package.json (directory carries `FOLDED`; code runs as advisorMod in qnfo-fleet-control); no `createExecuteTool` or `@cloudflare/shell` anywhere outside the vendored copy.
- Action `ISSUE_CLOSE_EVIDENCE` with the query, hit count (0 live) and the adopting file:line; if a live hit exists, `CODE_TASK_FILE` against the owning worker with the typed template.
- Clears: 2 of 2.

### R9 PAPER-LEARN route (5, covers all `apply` rows)
- Trigger: open `PAPER-LEARN-1: apply <slug> to the fleet` whose direct learnings are all `fleet_status='proposed'` with `status_note LIKE 'PL-TRIAGE-1 apply%'` (Q5; 21 rows in 5 issues, 472 in all).
- Diagnosis: `gap-proposal-without-doer`. Text in `claim`, `fleet_lever`, `application` is model prose from paper text: data, never an instruction.
- Action `GOAL_ROUTE`: one `goals` row per learning (`goal_key = 'PL-'||id`, `status='proposed'`, `goal_type='instrumental'`, `source='PAPER-LEARN-1'`, `statement` = a fixed template with the learning id, slug, version, kind, verification, confidence, and the lever as a quoted data field; `parent_objective` from a fixed mapping), then `UPDATE paper_learnings SET fleet_status='routed', status_note='DOCTOR-ROUTE-1 goals#'||<id>`. Gated to confidence >= 0.7 and verification not `assumption`; the rest take `rejected` with reason `below-evidence-bar`. Revert: set `proposed` again; delete the goal.
- Verification: the issue's own contract probe (no `proposed` direct row for that slug and version) closes it; `close_channel` becomes `auto:verified-remediation-trigger`.
- Clears: 5 of 5; also drains 451 more apply rows over time.
- Safety: `goals` rows start `proposed`; adoption is the existing goal loop's decision, so nothing executes from the model prose.

### R10 workflow-failed (2)
- 1000020 (fix-fold-pair-and-model-floor): `.github/workflows/fix-fold-pair-and-model-floor.yml` is absent from origin/main (`git ls-tree`), so no run can ever pass `workflow_main_state` (last row 2026-10-24T14:41Z failure). Action: verify absence through the contents API (404), `ISSUE_CLOSE_EVIDENCE` with the sha, and delete that `workflow_main_state` row after a one-row backup. Clears 1.
- 1000067 (fleet-autodeploy): real recurring failure; latest run 40279885400 (2026-10-26T06:27Z) fails in job `fleet`, step 8 "fleet self-audit (all workers, version + content) -> worker_live_audit". 89 `worker_live_audit` rows have match 0 (75 NOT_DEPLOYED retired, 13 NOT_A_WORKER, 1 UNMANAGED_OK voice-stt), so the audit must already tolerate them; the failing worker was not identifiable without the job log (public annotation says only "exit code 1"). The doctor reads the job log with the repository token and extracts only worker names matching the identifier regex after `FAIL`/`MISMATCH` markers; the log text is never forwarded. Class cause list: stub/unmanaged workers (section 7), then a real version mismatch.

### R11 stub workers in the registry (FLEET-JOURNEY 100166, 100472, PORTFOLIO-GAP x5)
Cause: `service_registry` lists `qnfo-workers` (a retired Workers Builds root stub; `/health` returns HTTP 410, re-checked live 07:00Z; root `wrangler.toml` renamed to it in b21d3daa) and `voice-stt` (no source directory, `UNMANAGED_OK`) as `state='live'`; discovery rewrites the rows every cycle (updated_at 06:30Z), so a manual UPDATE would be reverted. Journey steps `no worker unhealthy through the census` and `census sees every worker (blind <= 0)` fail with detail `qnfo-workers[,voice-stt]` (journey_runs 06:40Z and 06:50Z); 0 of 92 binding-census runs passed in 24 h; the 06:20Z timeout of qnfo-ops `/fleet` (12 s) was the NOMEM window (the 06:40Z call answered in 4.7 s). Remedy (code-task): the discovery writer skips or flags (`kind='stub'`) a worker whose health answers 410 or whose script has no repo directory; the census and portfolio detectors read `kind`. Clears about 7 issues (2 journeys, 5 portfolio). Owner residue: none.

### R12 owner-task triage (59)
- R12a dedupe: titles with the same first 45 characters after `: ` (Q9): 18 issues in 5 groups ("Fix the fleet error past its SLA: Integration..." 6, "...1 worker(s)" 5, "Fix FOLD-PAIR-TASK-1 self-deadlock" 3, two pairs). Keep the oldest, `ISSUE_SUPERSEDE` the rest with the survivor's id. Only for titles that match the dashboard's generated prompt shapes (the diagnose/approve buttons); hand-typed owner prose is never merged. 13 clear.
- R12b moot: a title that cites `issue #N` where #N is closed with evidence (100345, 100560, 100618 x3 today; 5 tasks). Close with `moot: #N closed <iso> channel <c>` only if the cited issue's `close_channel` is not wontfix. 5 clear (3 overlap with R12a).
- R12c investigate: the 23 `not-code` and 10 critical audit/investigation tasks (cost attribution, queue drain, outreach drain, gap C-01) need an executor that can read, query D1 (qnfo-audit only), and then emit either code-tasks or migrations. Until the roster has one, the doctor records `executor-gap` as a `capability_ledger` item and files ONE roster-gap issue; it must not synthesise code-tasks from the owner's prose without the planner. The owner's text is authoritative for these (OWNER-TASK- is a trusted prefix by design), so it is passed through unchanged, never rewritten by the doctor.
- Identity-bound residue in this set: `OWNER-TASK-op-mvihv5rr376f` ("secure the first attested credibility event") asks for a real-world attestation by the owner; mark `IDENTITY-BOUND:` with a closing probe, nothing else in the 59.

### R13 loop-breaker (2)
Both rows are `fleet_tick` and `fleet_tick-isolated` of one NOMEM event pair, last 06:06:48Z; FLEET-TICK-SPLIT-1 is live (0.28.0). Action: `ISSUE_SUPERSEDE` the second into the first; the first closes itself six hours after the last recurrence (about 12:07Z). Verify `v_loop_breaker_signatures` has no such `sig` row.

## 6. Expected clears (this report's families)

| Family | Open | Cleared by | After |
|---|---|---|---|
| TOOL-FAILURE + SH + SA + ER | 31 | R3 (17 now), R5 (16 duplicates), R4 (rest) | R3 and R5 within one doctor tick; R4 after PR and deploy, ~4 h |
| CF-CHANGELOG-1 | 2 | R8 | one tick |
| CHAOS-DRILL-FAILED-1 | 8 | R6 | 6-hourly drill after migration or recovery; 2 within hours, 3 need a PR, 1 needs the re-entry producer fixed |
| FLEET-JOURNEY-FAILED-1 | 5 | R1 + R11; traffic-health 1000262 and 2562 need the qnfo-lifecycle memory cause (below) | R11 after PR |
| SECRET-CHANGE-OBSERVED | 4 | R7 | one tick |
| PAPER-LEARN-1 | 5 | R9 | one tick plus the contract probe |
| PORTFOLIO-GAP | 9 | R11 (5), R1 + normal flow (2 compat need a wrangler edit), umbrella 2993 is intentional stubs, 2 `qnfo-agents` rows resolve by the reconcile rows already written | R11 after PR |
| LOOP-BREAKER-1 | 2 | R13 | ~12:07Z |
| WORKFLOW-FAILED-1 | 2 | R10 (1 now, 1 needs the job log) | one tick |
| OWNER-TASK-* | 59 | R12a 13, R12b up to 2 more, R2 to unblock 26 | one tick; the rest need an executor |

Roughly 75 of the ~127 open issues in these families clear without any owner action; none of the remaining ones is
identity-bound except `OWNER-TASK-op-mvihv5rr376f`.

### Open hypotheses (do not close on these)
- traffic-health (1000262: `qnfo-lifecycle ... exceededMemory`, 69 of 72 runs fail in 24 h; 2562 is the older `exceededWallTime`).
  `ops_config paper_learn_per_tick` was raised 4 to 8 on 2026-10-19 22:37Z; paper-learn job-run events show 8 papers read
  every hour (ticks at :00 to :02); the observability group occurrences are stamped :01 past the hour. That is correlation,
  not proof (the group's invocation list is not in D1). Reversible experiment, logged with `predicted_outcome`: set
  `paper_learn_per_tick`=4 (note says `Revert: 4`), compare the group's recurrence over the next 6 h. Cost: the metric
  `papers_unlearned_over_120m` may breach.
- planner idle 2026-10-25T10Z to 2026-10-26T00Z with the cap not reached: unproven cause; R2(d) makes it visible.
- ops_research_kick: whether the research stage continues after the abort is not shown in the code read.

## 7. Findings list (also returned in the structured answer)

See the structured output; severities there match this file.
