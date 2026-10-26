# PROBE-DOCTOR-1: family PROBE-NEEDED-1 and broken closing paths

Measured 2026-10-26 05:45Z to 06:10Z on qnfo-audit (35e2e573-92f3-46ac-83c6-22f6429fc5e5), read-only. Code read at origin/main
(qnfo-fleet-control 0.47.0, identical to the local checkout). No open PR touches the probe author (10 open PRs listed).

## 0. Numbers

| measure | value | query basis |
|---|---|---|
| open issues | 439 | agent_issues status=open |
| open PROBE-NEEDED-1 (PN) | 53 (all medium, source qnfo-fleet-control, 10 never planned, 43 plan untrusted) | title LIKE 'PROBE-NEEDED-1: issue-%' |
| PN ever filed / closed | 75 / 22 | same |
| PN filed since the author merged (816c5459, 2026-10-20T17:24Z) | 68 | cloud_ops_events kind remediation.probe-needed-filed >= 17:24Z |
| probes authored, all time | **0** | cloud_ops_events kind remediation.probe-authored; remediation_contracts module probe-author-1; decision_log naming PROBE-AUTHOR: all 0 rows |
| rejection reasons recorded | none (console.error only, unmeasurable) | rtAuthorLivePathProbe |
| PN filed per day (cap 12, rolling 24 h) | 10-20: 10, 10-21: 16, 10-22: 12, 10-23: 12, 10-24: 12, 10-25: 13 | cap reached on 5 of 6 full days |
| open issues with no contract in active/holding/monitoring/escalated ("orphans") | **189** (32 critical, 102 high; superseded-only 163, probe-review-refused-only 26) | RT_LIVEPATH_ORPHAN_SQL without the 60 min and skip terms |
| plus issues whose only live contract is a circular `issue-N-BACKFILL-1` | **9** (5 critical, 5 OWNER-TASK) | class LIKE '%-BACKFILL-1', active, reads own status and close_evidence |
| no real closing path in total | **198 = 45 % of the open backlog** | |
| born-superseded contracts per day (last 10 d) | 23, 31, 27, 9, 44, 3, 0, 101, 58, 5 (about 30/day) | remediation_contracts last_verdict LIKE 'superseded:closure-observing%' by ts |
| open-issue contracts by verdict | superseded:closure-observing 177 (+1 active with that stale verdict), probe-review-refused 41 (+1), PROBE-TRANSPORTS-1 placeholder 1 (issue-1893), vacuous-probe-result 0, probe-error 0, probe-not-machine-executable 0, probe-same-account-host 0 | the last four exist only on closed issues or in the transient `remediation.probe-error` event kind (22 events in 8 d: D1 internal error, read timeout, HTTP 429) |
| PROBE-REVIEW-1 verdicts, 7 d | 163 ok, 53 refused | cloud_ops_events kind probe-review |

Source of the born-superseded inflow (open orphans by issues.source, no live service or issue_source_hosts mapping):
qnfo-fleet-dashboard:owner-request 57, owner-chat 54, NULL 12, portfolio-autopilot 8, self-audit-systemwide 3, deepchat-session 3,
deepchat-audit 3, claude-session 3, cloud_ops_events:evt-* 15. D1 trigger `contract_probe_templates_v3_generic` (AFTER INSERT on
remediation_contracts, status needs-machine-probe) supersedes the birth contract of every issue whose source is not itself a live
service or mapped in issue_source_hosts (5 mappings exist: chaos-drill, charter-loop, fleet-journeys, objective-constraints,
qnfo-fleet-advisor). The probe it leaves reads `closed` vs the issue status, so nothing is measured.

## 1. Why the author produced nothing (code, qnfo-fleet-control/worker.js)

Three independent silent no-ops, each sufficient on its own, and two defects behind them.

1. Call site, line 11539: `await rtEnsureLivePath(db, out);` omits `env`. Signature line 11945 `rtEnsureLivePath(db, out, env)`; line 11962
   passes `env` to rtAuthorLivePathProbe, which is `undefined`. Line 11906 then sets `ai = null` and line 11907 `return false` with no log.
   ensure-live-path.test.mjs:169 pins the buggy call text, so a fix must change the test.
2. Binding names, line 11906: `env["qnfo-ai"] || env.qnfo_ai`. wrangler.toml declares the service binding `SVC_QNFO_AI` (lines 97 to 99, a
   Fetcher with no `.run`) and the Workers AI binding `AI` (lines 54 to 55). The worker's own helper is
   `aiRunAttr(env, worker, purpose, model, input, opts)` (line 12663, `env.AI.run`, writes ai_call_counters). Even with env passed, `ai` is null.
3. Reply parse, line 11918: reads `body.response || body.result`. glm-5.3-flash is a reasoning model that answers in chat-completion shape
   (`choices[0].message.content`, empty when reasoning eats the budget); the file's own `evAiText` (line 2941) handles that, the author does not.
4. decision_log insert, line 11939: columns `(ts, decision, reason)` do not exist. PRAGMA table_info(decision_log): id, ts, actor, assumption,
   action, evidence, outcome, blast_radius, rollback_path (all NOT NULL except id and ts default), capability_gain, predicted_outcome,
   reach_gain, surfaces_tested, outcome_matched. The contract is activated first (line 11931), then the log insert throws and is caught:
   an unlogged autonomous decision (DOCTRINE-1).
5. Prompt, line 11913: title cut to 160 characters, no description, no schema, no structured facts. The model must guess table and column
   names; the static check verifies table names only, so a wrong column dies at the dry run (line 11925).
6. No test covers rtAuthorLivePathProbe or rtProbeAuthorValidSql (grep over tests, migrations, scripts: zero hits).
7. Vacuity gate, line 11928: a probe that already passes is rejected. The backlog holds healed incidents (section 2), so the gate rejects
   exactly the probes that would close issues.

Capacity, independent of the above: the author runs only for a PN issue filed in the same tick (line 11960), PN filing is capped at 12 per
rolling 24 h counted on PN issues created (line 11952), 3 per tick. Inflow of born-superseded is about 30/day and the backlog is 198, so a
working author at 12/day drains in 16+ days while the backlog still grows by about 18/day.

## 2. The fleet's own PN probe is being refused, and obsolete PNs never close

- qnfo-cloud-ops PROBE-REVIEW-1 (worker.js 3816 to 3824, decision 3858) asks gpt-oss-120b / deepseek-v4-flash to judge every d1-query
  contract on an open issue, skipping module `probe-template%`, `orphan-issue-guard-1`, METRIC-TRIGGER titles, fm-/belief- classes. The PN
  contract (module `reopen-live-path`, text from rtLivePathProbe line 11825, deterministic) is judged by the model: "self-confirming: returns ok
  when no qualifying contract exists". Result: 17 of 53 open PN contracts are status `probe-review-refused` (neither executor reads them),
  36 identical-shape contracts are active. The reviewer is inconsistent on one template.
- 5 PN issues have a closed target and stay open 31 to 111 h because their contracts are refused: PN 100476 (target 100435, closed
  2026-10-25T08:49:09Z by auto:triage-resolved-sync, has_evidence 1), 100492 (100444), 100539 (100463), 100602 (100578), 1000087 (100618).
  The PN probe reads `ok` for 100435 when run by hand (verified).
- rtLivePathProbe accepts a circular probe as "a probe of its own": it excludes only three literal spellings. The 71 open
  `issue-N-BACKFILL-1` contracts (module NULL, active, verdict deferred, attempts up to 241) read `a.status='closed' AND close_evidence`
  through an alias, so the PN probe reads ok for them, and RT_LIVEPATH_ORPHAN_SQL counts any `active` contract as a live path.
  62 of the 71 issues also have another live contract; 9 have only the circular one.
- owner_prompts.status is not maintained (64 closed OWNER-TASK issues still have prompt status `queued`), so `owner_prompts.status =
  'answered'` is NOT a usable probe. Verified and rejected as a template.

## 3. Sample of 8 PN issues (why no probe, what the doctor does)

| PN / target | target | contracts of target | why nothing was authored | doctor path and tested probe result now |
|---|---|---|---|---|
| 100356 / 100341 | critical PORTFOLIO-GAP deploy-unrecorded voice-stt, 139 h, 7 portfolio_gaps rows | probe-review-refused (BACKFILL, circular), superseded v3 | author never ran; also title-only prompt cannot know portfolio_gaps | T1: `pending: 7 of 7 gap rows still open` |
| 100391 / 100386 | critical OWNER-TASK q08 compose cost regression, owner_prompts op-mvh2lgh96e30 | circular BACKFILL (241 attempts), superseded v3; PN contract refused 2026-10-20T21:52Z | no measurable DoD ("act on it or record why not"), status of the prompt not maintained | class C: R2 closes the PN, target goes to the human-items doctor |
| 100491 / 100450 | critical GATEWAY-CRON-DETACHED-1 (cron silent 26 h from 2026-10-20) | superseded v3 | author never ran; DoD in description names cron_fire_log | model tier. Probe tested: `SELECT count(*) FROM cron_fire_log WHERE source='worker:qnfo-gateway'` last 3 h reads **ok now**: the incident has healed and nothing noticed for 111 h (R8) |
| 100534 / 100456 | critical content_items_over_stage_sla 1601 (metric now 2231) | superseded v3 | metric named in title | T4: `pending: val=2231.0 gt 0.0` |
| 100571 / 100437 | TOOL-FAILURE github_issue_get (GitHub 404, args number=100350: a D1 issue id used as a GitHub number) | superseded v3 | source cloud_ops_events:evt-17665293b1c20b has kind/job/text | T2: `pending: last_error=2026-10-25T08:26:28Z successes_since=1` |
| 100373 / 100166 | high FLEET-JOURNEY-FAILED-1 binding-census | refused + superseded | journey name in title; source fleet-journeys (mapped host exists, orphan anyway) | T3: `pending: cf ok=0 age_min=12; gha ok=0 age_min=8` |
| 1000206 / 1000193 | critical AUTONOMY-FIRST-REROUTE-1 cost_usd_30d 426.89 vs ceiling 200 | superseded v3 | description cites metric key `cost_usd_30d` (registry: 423.76, target <= 200) | T4b (metric key in a fleet-gate description) or model; both non-vacuous |
| 100426 / 100419 | high CLOSE-CHANNEL-REQUIRED-1 (449/900 closes with NULL close_channel) | refused + superseded | prose DoD, one table named | model tier. Probe tested: `observed 2` NULL-channel closes of 135 in 24 h vs expected 0: non-vacuous, grounded in agent_issues.close_channel |

## 4. Doctor design

Executor: new `rtProbeDoctor(env, db, out)` in qnfo-fleet-control, called from remediationContractsTick at line 11539 in place of the bare
rtEnsureLivePath call (which stays as the residual PN filer, R9). Two redundant triggers as ANTIFRAGILE-1 asks: the 10-minute tick, and the
hourly remediation consumer sweep (scripts/remediation_consumer.py) running the same SQL; either installs, both are idempotent
(`UPDATE ... WHERE class=? AND status IN (...)`). VERSION 0.48.0 (new capability: minor).

Common rules for every action: (a) inputs are structured columns only (ids, status, priority, source, kind/job/text, metric keys, table
names, numbers); a literal that reaches SQL text must match `^[A-Za-z0-9_.:-]{1,64}$` AND exist in a D1 lookup (tool in
SELECT DISTINCT text FROM cloud_ops_events WHERE kind='ops_ai_tool'; metric in metric_registry; journey in v_journey_state); (b) issue titles and
descriptions are never copied into a code-task line, a PN description or any instruction; the model tier receives them as delimited data and
returns only a SQL probe that is re-validated; (c) every action writes `decision_log` (actor 'probe-doctor-1', assumption, action, evidence,
outcome, blast_radius, rollback_path, capability_gain, predicted_outcome) and one `cloud_ops_events` row `doctor.<rule>` with meta
{issue, rule, outcome, reason}; (d) `ops_config probe_doctor` = off stops all, `probe_doctor_<rule>` = off stops one; control_registry
rows (kill-switch keep, cap replace of `rt-ensure-live-path-bounds`) and capability_ledger row `probe-doctor-1` ship in the same migration.

Probe independence: a template contract carries module `probe-template-v4-<name>` (PROBE-REVIEW-1 skips `probe-template%`: the text is
reviewed once in the PR and unit-tested, not re-judged per issue by a model that disagreed with itself 17 times). A model-authored probe
carries module `probe-author-1` and IS re-judged by gpt-oss-120b and deepseek-v4-flash; authors are qwen3-30b-a3b-fp8 then glm-5.3-flash,
disjoint from both reviewers.

### R1 PN-TARGET-CLOSED (close the PN with evidence)
- trigger (tested, 5 rows now): PN open, source = 'qnfo-fleet-control', target status in (closed, resolved, wontfix), last closing lifecycle
  row at least 30 min old and no `reopened` lifecycle row in the last 30 min (hysteresis: issue 100618 flapped three times in 3 h).
  SQL in probe-doctor-templates.sql section R1.
- diagnosis: cause `target-closed`; fields target id, to_status, issue_lifecycle id and ts, has_evidence, close_channel.
- remediation (one D1 batch): `UPDATE issue_triage SET close_evidence=?, triage_state='closed', owner='probe-doctor-1' WHERE issue_id=? AND EXISTS (PN still open) AND NOT EXISTS (target open)`;
  trigger triage_close_sync_issue_upd then closes the issue with close_channel `auto:triage-sync:probe-doctor-1` (so the 2h auto-close metric counts it);
  `UPDATE remediation_contracts SET status='superseded', last_verdict='superseded:pn-target-closed' WHERE class='issue-'||pn`.
  close_evidence template: `PROBE-NEEDED-1 obsolete (probe-doctor-1 R1 <now>): target issue <t> is <status> since <ts> (issue_lifecycle id <i>, close_channel <c>, has_evidence <0|1>); the PN probe reads ok because no open issue <t> exists. Measured by a D1 read at <now>.`
  (never the phrases that issue_close_evidence_weak_predicate rejects).
- safety: only own-filer issues (source guard + strict title regex), per tick cap 25, close_evidence guard trigger honoured, target re-checked inside the same UPDATE.
- verification: fm detector `fm-pn-target-closed-open`: `SELECT '0' AS expected, CAST(count AS TEXT) AS observed` over R1's trigger with a 60 min age.
- clears: 5 now, then about 1 per day.
- owner: nothing.

### R2 PN-CLASS-C (OWNER-TASK / OWNER-NOTE targets: no measurable DoD)
- trigger (tested, 20 rows): PN open, target open, target title LIKE 'OWNER-TASK%' or 'OWNER-NOTE%'.
- diagnosis: cause `no-measurable-dod`: the target's DoD is "act on it, or record why not, close with close_evidence"; owner_prompts.status is
  unmaintained so no table measures it; these are HUMAN-ITEMS-AUTOMATIC-1 items whose doer is the fleet (another family's doctor).
- remediation: close the PN exactly as R1 with evidence `PROBE-NEEDED-1 superseded by issue <t> (probe-doctor-1 R2): ...no table measures the task outcome; the task stays open as its own work item`; add `OWNER-TASK%`/`OWNER-NOTE%` to RT_LIVEPATH_ORPHAN_SQL so the filer stops creating them (it would file 57 more).
  When the planner later assigns a code task (`issue_plans.task_id` not null) install template T5 (delivery probe) on the target as status `monitoring`, never `active`, because a merge is not an outcome.
- safety: target keeps its fm-open-issue-no-doer and issues_without_next_action visibility; decision_log row with revert `UPDATE agent_issues SET status='open'` on the PN.
- clears: 20 PN now (10 critical targets); 57 OWNER-TASK/NOTE targets are NOT cleared by this family.
- owner: nothing.

### R3 PN-PROBE-REFUSED (the fleet's own PN probe judged by a model)
- trigger (tested, 17 rows, 12 after R1): contract status 'probe-review-refused', module 'reopen-live-path', issue is an open PN, and verify_probe equals rtLivePathProbe(n) recomputed in JS.
- remediation: `UPDATE remediation_contracts SET module='probe-template-v4-pn', status='active', last_verdict=NULL, attempts=0, deferred_since=NULL, next_due_at=datetime('now') WHERE class=? AND status='probe-review-refused' AND verify_probe=?`.
  Code: lines 11849 and 11851 write module `probe-template-v4-pn` for new PN contracts (test line 76 changes).
- safety: exact-text equality so only the fleet's template is restored; revert sets module and status back.
- verification: `SELECT '0' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM remediation_contracts c JOIN agent_issues p ON p.id=c.issue_id WHERE p.title LIKE 'PROBE-NEEDED-1: issue-%' AND p.status='open' AND c.status='probe-review-refused'`.
- clears: restores 12 PN to a running probe; they close when their target gets a probe (R5, R6) or closes.

### R4 CIRCULAR-ALIAS (harden what counts as "a probe of its own")
- change rtLivePathProbe (line 11825) and RT_LIVEPATH_ORPHAN_SQL (11827): a contract is a probe of its own only if class NOT LIKE '%-BACKFILL-1', instr(lower(verify_probe),'close_evidence')=0, module not in ('birth') and last_verdict not in the close-blocking list (fail, vacuous-probe-result, probe-error, probe-not-machine-executable, probe-same-account-host). Otherwise the issue is an orphan.
- effect: the 9 circular-only issues become orphans (5 are class C, 4 get T or M). Revert: git revert of the line change.

### R5 BORN-SUPERSEDED -> TEMPLATE (deterministic, no model)
Orphan = open issue with no contract in active/holding/monitoring/escalated, age over 60 min. Templates in probe-doctor-templates.sql, each
tested against qnfo-audit today. Install = one UPDATE (or INSERT OR IGNORE) of the issue's `issue-<id>` contract:
`verify_probe=<sql>, verify_transport='d1-query', status='active', module='probe-template-v4-<name>', last_verdict=NULL, attempts=0, deferred_since=NULL, next_due_at=datetime('now'), expected_cadence_h=1, precondition/action text naming the template`.
| template | trigger on structured facts | probe measures | open orphans now | non-vacuous now |
|---|---|---|---|---|
| T1 portfolio-gap | title LIKE 'PORTFOLIO-GAP%' and portfolio_gaps rows with issue_id | no gap row with that issue_id still `open`, at least one row | 8 (3 PN) | yes (7 of 7 open) |
| T2 tool-recovery | source `cloud_ops_events:evt-*` whose row has kind 'ops_ai_tool', or title `[self-heal] tool X failing`, `SELF-AUDIT-TOOLERR: X`, `TOOL-ERROR-RATE-X-1` with X in the lookup | last error at least 6 h old and at least 5 successes since | 28 rows, 15 distinct tools | yes for 9 of 15 tools; 6 tools already healed (section 6) |
| T3 journey | title FLEET-JOURNEY-FAILED-1: J / CHAOS-DRILL-FAILED-1 with J in v_journey_state | every runner's latest row ok=1 and age <= 180 min | 1 | yes |
| T4 metric | title starts with a metric_registry key, or `METRIC-TRIGGER-<id>` with the id in analytics_metric_triggers; T4b: source autonomy-first-gate and one registry key before ` = ` in the description | v_metric_trigger_state hit=0 and val not null | 3 title-key (100456, 100454, 1000000) + 1 METRIC-TRIGGER-786 (issue-1893, superseded placeholder; trigger 786 q08_verified_votes_7d val 3 < 5 hit 1) + 1 T4b (1000193) | yes (2231 vs 0; 658 vs 120; 3 vs 5; 423.76 vs 200) |
| T5 plan-delivery | issue_plans.task_id not null | code_tasks deployed_at set; status `monitoring` only | 0 today | n/a |
Coverage of the 189 orphans: T 40, PN-self 17 (R1 to R3), OWNER-TASK/NOTE 57 (R2, other family), model tier 75 (20 critical, 36 high).
Per tick cap 20 installs (D1 only, no model). Verification metric `orphan_issues_no_live_path` (target 0).

### R6 MODEL-AUTHORED (the remainder, 75 orphans now, about 12/day later)
- trigger: orphan not matched by R5, not class C, attempts for this issue < 3 (counted in cloud_ops_events kind `doctor.probe-author`, meta.issue).
- diagnosis: cause `prose-dod`. Evidence packet built from structured facts: id, priority, source, age, title, the sentence after "Definition of done" (max 400 chars), the tables named in title/description that exist in sqlite_master (max 6) with their `pragma_table_info` column lists, metric_registry rows for keys named, ops_config knobs named.
- remediation: one call per issue through `aiRunAttr(env, "qnfo-fleet-control", "probe-author", model, {messages, max_tokens: 900, temperature: 0})`, reply read with `evAiText`. Attempt 1 qwen3-30b-a3b-fp8 (non-reasoning, fast), attempt 2 glm-5.3-flash with reasoning_effort low (47 s average, so it gets its own 120 s time slice and runs last in the tick). Batching: none (prompts differ by schema); the steady state is about 12 calls/day, about 2.3k tokens each, well under 1 USD/month.
- gates (all deterministic, in order): existing static check (single SELECT/WITH, no write keyword, no needs-machine-probe, tables exist) plus new: no read of agent_issues for the target id, no `close_evidence`, no `remediation_*` of its own class, columns exist (dry run), exactly one row with columns expected and observed, `EXPLAIN QUERY PLAN` shows no unindexed SCAN of cloud_ops_events (145k rows), remediation_verifications (289k) or research_queue, at least one non-meta table, and a result that is not constant between two reads with different literals. On accept install with module probe-author-1.
- green-at-birth is NOT rejected (R8). Rejections are persisted: `doctor.probe-author` with meta.reason in {static:<why>, columns, plan-scan, empty, model-error, review-refused}, which makes the accept rate a metric.
- after 3 failed attempts the issue joins R9.
- expected: 45 of 75 accepted over 48 h at 60 % (unmeasured: the author never ran; recompute from the new events after 30 attempts).

### R7 CIRCULAR-ACTIVE (BACKFILL-1) REPLACEMENT
- trigger (tested, 9 rows): open issue whose only live contracts are `%-BACKFILL-1`. Remediation: run R5 or R6 for the issue; only after the new contract is installed set the BACKFILL contract `superseded:circular-backfill-replaced`. Never leave the issue with none. The 62 issues that have another live contract keep the BACKFILL row until a sweep (deferred_since over 7 d) retires it.

### R8 GREEN-AT-BIRTH (healed incidents)
- trigger: a probe from R5 or R6 whose dry run passes (expected = observed). Diagnosis `healed-or-vacuous`.
- remediation: install with status 'holding', `next_due_at = now + 60 min`, write the dry run as read 1 in `doctor.probe-green-at-birth` meta. The executor's read at +60 min is read 2; the existing autoclose trigger (remediation_verification_autoclose_ins) closes on that pass and REMEDIATION-REOPEN-1 reopens it if the contract fails 3 times afterwards. A model-authored green probe additionally needs a tests-dod or partial verdict from PROBE-REVIEW-1 before the second read counts: install `probe-author-1` green probes with `status='holding'` only after the review row exists, otherwise `active` and wait.
- today: GATEWAY-CRON-DETACHED-1 (critical, 111 h) reads ok; 6 of 15 tools in T2 have 5 or more successes since the last error (run_code_net 41, ops_d1_write 27, dashboard_feed 14, git_clone_exec 12, github_file_write 6, container_workspace_exec 5), about 10 issue rows with the [self-heal] twins.

### R9 RESIDUAL (what is left)
- PN filing moves after R5/R6: file a PN only for an orphan with 3 failed attempts and not class C; cap raised from 12 to `ops_config rt_livepath_per_day` default 60 because the residual is about 6/day; per tick 3 stays. A PN for an issue the doctor could not probe is the doer-needed record: its description lists the attempts and reasons from the events (structured), never the model text.
- age ladder: residual PN older than 120 min is escalated by the existing SLA-120M-2 path; nothing goes to the owner.

## 5. Safety against prompt injection (PLAN_TRUSTED intact)
PLAN_TRUSTED stays as is; the doctor never writes a `code-task:` line from issue or event text. Template literals are validated against D1
lookups. The model sees untrusted text only as data and can only emit a SELECT that is statically checked, planned (EXPLAIN), dry-run and
independently reviewed; the worst case is a wrong probe, which PROBE-REVIEW-1, the 2-read rule (R8) and the relapse reopen bound. Class
changes of an issue's closing path are decision_log rows with a revert statement.

## 6. Expected effect (48 h) and what stays with the owner
- PN family: 53 open. R1 5 + R2 20 + templates 7 (close when their PN probe passes, 1 to 2 h) + model about 12 = about 44 closed, about 9 left (critical, prose DoD, 3 failed attempts) as residual PN.
- No-live-path backlog 198: about 85 get a real closing path (T 40, model about 45), 57 are OWNER-TASK/NOTE for the human-items doctor, 17 PN-self are R1 to R3, the rest residual. Underlying defects are closed by their fixers or by R8 (about 10 to 12 healed issues) not by this family.
- Birth path: a per-template D1 trigger at birth cannot work for PORTFOLIO-GAP (the portfolio_gaps row receives issue_id after the issue exists, so the facts are not there at INSERT time); the sweep is therefore the primary path and the consumer sweep is the redundant second path. Stopping the inflow at its source is a separate, cheap change: extend the WHEN clause of contract_probe_templates_v3_generic only after a template trigger exists for the same source; until then the doctor repairs within one tick (10 min) of the 60 min orphan age.
- Owner: nothing is identity-bound in this family. No IDENTITY-BOUND card.

## 7. Build list
1. qnfo-fleet-control 0.48.0: worker.js lines 11539, 11906 to 11907, 11913 to 11918, 11928, 11939, 11849/11851, 11825/11827, RT_LIVEPATH caps; new rtProbeDoctor; tests (ensure-live-path.test.mjs lines 76 and 169 change; new probe-doctor.test.mjs covers each template against an in-memory SQLite with the real schema, the validators, the green-at-birth path, and rtAuthorLivePathProbe with a fake env.AI). deployed-current.worker.js identical.
2. migration 2026-10-26-probe-doctor.sql (APPLY-BY ci, DB qnfo-audit, Rollback line, BACKUP table for the module/status UPDATEs): R3 restore, ops_config rows, control_registry, capability_ledger, failure_modes `fm-probe-author-unreachable` (detector: 0 probe-authored and 0 doctor.probe-installed events in 24 h while orphans > 10), metrics `orphan_issues_no_live_path`, `probe_author_accept_rate_7d`, `pn_open_over_120m` each with trigger.
3. qnfo-cloud-ops needs no change (module swap avoids it; the code loop cannot merge that worker).
4. Second path (ANTIFRAGILE-1): scripts/remediation_consumer.py runs the pure-SQL rules R1, R2, R3, R5 (templates) and R7 on its hourly drain with the same guards, so a stalled fleet-control tick does not stop the doctor; the model tier (R6) stays single-path and its failure falls back to R9 (a PN issue), which is the record that a doer is needed.
5. Work claims before any edit: file:qnfo-fleet-control/worker.js, file:qnfo-fleet-control/ensure-live-path.test.mjs, file:qnfo-fleet-control/deployed-current.worker.js; VERSION-AHEAD-1 check against main (0.47.0-remediation-budget-metric) and open PRs; the change is in CM_LOOP_CANARIED scope, so the code loop can plan and merge it (code-task line with code-anchor `await rtEnsureLivePath(db, out);`, unique on main, and code-probe absent on that text).
