BREACH DOCTOR, FAMILY CODE-MERGE: CODE-MERGE-REFUSED-1 (10 open) + CODE-LOOP-EXHAUSTED-1 (15 open) + issues tied to a dead code task (32 more open parents)
Measured 2026-10-26 05:45-06:35Z. qnfo-audit 35e2e573 (read only), origin/main a4baaeaa, GitHub REST (public + gh), 10 gate job logs.
Machine-readable per-issue table: cm-family-classification.json. Tested SQL: cm-doctor-steps-d1.sql (R1,R2,R3,R5), cm-doctor-r6-requeue.sql (R6),
cm-doctor-session-queue.sql (R10); harnesses test_cm_rules.py and test_r6.py (SQLite 3.45.1 stubs with the live column lists; every live SELECT form was also run on D1).

======================================================================================================
0. WHAT THE DOCTOR MAY READ AND WRITE (taint rule)
======================================================================================================
Input: columns of code_tasks (id,path,goal,status,step,attempts,last_error,merge_note,merged_by,merged_sha,merged_at,pr_url,ctx,created_at),
code_task_pr_links (task_id,pr_number,pr_state,merged_at,head_sha,task_status), agent_issues (id,title,status,priority,source,close_channel,updated_at),
issue_triage (close_evidence,owner,remediation), remediation_contracts (issue_id,status,last_verdict), work_claims (path,holder,expires_at,released_at),
GitHub REST state (merged, state, mergeable_state, check_run name+conclusion, the first "##[error]" line of a failed job).
NEVER input: agent_issues.description of CODE-MERGE-REFUSED-1 (it embeds a CI log excerpt: text a PR's own tests can print), cloud_ops_events.text, tool errors.
Output text: constants + ids + numbers + identifiers that matched ^[A-Za-z_$][A-Za-z0-9_$]{0,63}$ or a path that exists in the repo tree. PLAN_TRUSTED is untouched:
CODE-MERGE-REFUSED-1 stays 'untrusted' for the planner (source qnfo-fleet-control, title not on code_merge_trusted_sources), the doctor never calls the planner and never forwards
description text into a goal. Zero model calls are needed for R1,R2,R3,R5,R6,R7,R8,R10; R9 reads the file from main and matches tokens, no model.

======================================================================================================
1. COUNTS (25 issues in scope; primary class each)
======================================================================================================
CODE-MERGE-REFUSED-1 (10; 9 critical, 1 high)
  MERGED-AFTER-REFUSAL ........................ 10   (every task is status merged; PR merged on GitHub by rwnq8 0.6 h to 60 h after the refusal; 0 HOLD comments)
     cause of the original refusal: base-red gate 9 of 10 (MERGE-BOUNDARY-GATE-1 LOAD-GATE-RELATIVE-IMPORT ./data/entries-a.json: 9; backlog-fold parity FAIL: 5;
     load-gate stub list cloudflare:workers/sockets: 1), PR-attributable 1 (PR 3583 edited the FOLDED qnfo-backlog-exec alone). Parent issue closed: 6, open: 4.
CODE-LOOP-EXHAUSTED-1 (15, all medium)
  PARENT-CLOSED (task moot) ................... 6    1000089 1000149 100515 100321 100364 100361
  TWIN-DUPLICATE .............................. 1    100382 (same source issue #100355 as 100392)
  SIBLING-MERGED retry ........................ 1    100549 (ct_eg8bpejxuqc1qt PR 3659 merged 2026-10-23T13:52:56Z; parent #100211 metric still breached: gpt-oss share 87%)
  DOD-MET-LIVE ................................ 1    1000242 (GET https://fleet.qnfo.org/api/cmd -> 405 {"error":"method_not_allowed","path":"/api/cmd","allow":["POST"],...}; dashboard worker.js:11823 on origin/main (live 1.64.1))
  DUP-DECL, real work remains ................. 1    100392 (objectiveConstraintsTick still unguarded at fleet-control worker.js:8237-8241)
  PATH-ALIAS (mind/ vs q08-mind/) ............. 2    1000150 1000151 (DoD unmet: main still has the wrong DOIs)
  WRONG-TARGET / DECOMPOSE .................... 1    1000148 (new-file path 404; the issue itself says the migrations/ target was wrong; 11 NULL close_channel closes in 48 h)
  WRONG-ANCHOR-WINDOW ......................... 1    1000248 (anchor = line-61 changelog comment; the defect is line 1960; 82 orphan research_queue rows today)
  SESSION-ONLY ................................ 1    100498 (needs .github/workflows/cf-ops-actions.yml, a denied file, plus 120k-char py edit)
Needs a human session today: 1 of the 25 (100498). In the 32 broader parents: 1000183 (scripts/remediation_consumer.py, CM_SCRIPT_DENY 'remediation') and the scripts/apply_migrations.py site split off 100419.
Needs the owner (identity-bound): 0.
Classes the task text asked about that did NOT occur: HOLD comment 0, size cap 0 (14 publish_failed tasks in 14 days are in the broader set), control-plane canary 0, inert patch 0
(2 in the broader set), CM_SCRIPT_DENY in the 25: 0, stale base/conflict: 1 secondary (PR 3608, 29 identical CONFLICT-REPAIR-DOER-1 comments 2026-10-22T03:56Z..18:30Z).

Broader family, 32 further open parents with a dead task (failed/closed/needs_human/publish_failed), no overlap with the 25 issues themselves:
  A merged sibling exists (failed retry is stale; parent open on its probe) 12: 2402 2405 2521 2577 2722 99929 100190 100211 100279 100454 1000029 1000035
  B live task exists 2: 100623 1000040          C suite red after edit 1: 1000179 (see 1000242)       D standards guard 2: 2924 100616
  E bad edit blocks 3: 100350 100625 1000000     F no-op proposal 2: 100624 1000019                    G dup declaration 1: 100355
  H goal-review refused 1: 2373                  I read 404 3: 100419 100467 100468                      J scope-deny/large file 3: 1000140 1000183 1000260
  K publish patch 1: 100458                      Z path "worker.js" at repo root 1: 2570

======================================================================================================
2. ROOT CAUSES IN THE LOOP (why these issues exist), with places
======================================================================================================
RC1  Nothing closes a CODE-MERGE-REFUSED-1 issue. cmRefuseTask (qnfo-fleet-control/worker.js:4686-4692) files it via cmFileIssue (:4283, priority high; RED-GATE-1 raises it to critical).
     codeMergeTick (:5047-5061) and qnfo-github-steward TRACKER-SYNC-1 (steward worker.js:870) reconcile the TASK to merged, not the issue. Its contract is status monitoring
     "loop-owned-48h (the filing loop closes it)" for all 10, and the filing loop has no closer. The two reconcilers that exist (fleet_tasks code-loop-terminal-reconcile v2,
     code-loop-superseded-reconcile v1; 182 ok runs each in 24 h) cover CODE-LOOP-EXHAUSTED-1 + merged|superseded only.
RC2  A required-check failure is always judged the PR's fault. cmDecide (:4064) returns refuse(stale_check) for any failed required check; cmHandle (:4761) then spends CM_REPAIR_ROUNDS = 2
     (:4556) repair rounds. 9 of 10 tasks ended ctx.repair_round = 2, refusal.kind = checks (ct_im100444: PR 3568 00:10Z, round 1 00:15Z, PR 3574, round 2 00:30Z, PR 3583, refused 00:50Z):
     >= 18 model proposals, each followed by a two-model goal review, on failures the diff could not cause. 21 of 51 tasks ever refused for a failed check later merged.
RC3  The failure excerpt cannot see guard failures. cmFailureLines (:4491-4524) drops every "##[error]" line (:4506 `else if (/^##\[/.test(t) || !t) continue`), so
     "##[error]MERGE-BOUNDARY-GATE-1 relative-import: Error: LOAD-GATE-RELATIVE-IMPORT ./data/entries-a.json" never reaches the issue or the repair prompt; the excerpt falls to secondary
     runtime prints of passing suites ("personal-api ... fleet-heartbeat-failed"). 6 of 10 issue texts show only that noise. CI-FEEDBACK-ORDER-1 fixed the order, not this.
RC4  Merging over a red gate poisons main for the next PRs: PR 3583 (gate red) was merged 2026-10-22T03:44:53Z with VERSION 2.0.10-codeagent in the FOLDED qnfo-backlog-exec, which broke
     qnfo-lifecycle/backlog-fold.test.mjs on main (deploy-gate push run failed 03:57Z); PRs 3608, 3685, 3713, 3736 then failed the same FAIL line until 8c35b1f9 (2026-10-24 14:41Z, about 59 h; replayed in scratch: FAIL at 8c35b1f9^, pass at 8c35b1f9).
     deploy-gate on main: 12 of 12 latest push runs success today.
RC5  RED-DRAIN-1 dispatch (fleet_tasks id red-drain v6 step 3) writes ct_im<id> with INSERT OR IGNORE and bypasses intake: no folded-host redirect (qnfo-backlog-exec is FOLDED), no
     path-exists preflight, no copy of the issue's code-anchor into ctx.anchor, no source/trust predicate (instr(sql,'a.source') = 0), and cmProvenance (:5001-5009) returns
     "direct enqueue" ok for any goal not starting "[issue #N]" (cmIssueId :3369) although cmIssueIdOf (:2869) already resolves ct_im ids. One-shot: a failed ct_im task is never re-dispatched.
RC6  Scope allowlists name a directory that does not exist: cmScope :3396 and mergeScopeWhy (orchestrator worker.js:797) admit ^mind/..., the repo directory is q08-mind/ (WRANGLER-ONLY,
     deployed by .github/workflows/mind-deploy.yml on q08-mind/**). ct_im100442/100467/100468 fail "read failed: raw read HTTP 404"; REARM-1 re-armed them when blocker #100617 closed (08:30:42Z) and
     the 404 repeated 3 times in 6 minutes (cloud_ops_events code-task.fail 08:30:46, 08:30:47, 08:36:50); FAIL-SIGNATURE-STOP-1 filed the EXHAUSTED issues at 08:36:49-50.
RC7  The anchor locator accepts any unique line: ct_im100625 got line 61 (a changelog comment) for a defect at line 1960; a token-intersection of the issue's quoted tokens
     ("status = 'queued'", "stage = 'revise'", PARK-REARM-1) is unique at line 1960 (checked on origin/main).
RC8  Retry without diagnosis: EXHAUST-SELF-RETRY-1 (orchestrator :2775-2788) waits INTAKE_WINDOW_MS = 3 days for a re-take; a goal that says "call the helper PR 3342 adds" was retried
     twice after the helper landed (SyntaxError: Identifier 'closeBlockedByContract' has already been declared, helper at fleet-control worker.js:8600).

======================================================================================================
3. RULES  (each: trigger -> diagnosis -> action -> safety -> verify -> expected clears -> owner)
======================================================================================================
Common safety for every close/requeue rule: single-flight per tick; mode measure|on (ops_config breach_doctor); skip when work_claims has a live row path 'issue:<id>' (or 'file:<path>'
for code changes); skip when an active/holding contract of that issue has last_verdict in (fail, vacuous-probe-result, probe-error, probe-not-machine-executable,
probe-same-account-host) (this is exactly issue_close_evidence_required, so the statement can never abort a batch: reconcile-close-aborts-batch); close attributed as
triage_state 'closed' + owner 'breach-doctor' so triage_close_sync_issue_upd writes close_channel 'auto:triage-sync:breach-doctor'; every action writes decision_log
(assumption, action, evidence, rollback_path, predicted_outcome); revert of a close: UPDATE issue_triage SET triage_state='triaged', close_evidence=NULL WHERE issue_id=?;
UPDATE agent_issues SET status='open', close_channel=NULL WHERE id=? (issue_lifecycle records both). Per-tick cap 12 cases, 6 actions.

---- CM-R1  merged-after-refusal  (cause_class merged-after-refusal; action close-on-evidence; pure D1) -------------------------------------
trigger  open agent_issues with title LIKE 'CODE-MERGE-REFUSED-1: code task ct_%', task id parsed with instr/substr, code_tasks.status='merged' AND merged_sha NOT NULL AND merged_at NOT NULL,
         code_task_pr_links.pr_state = 'merged' (or no link row). Live D1 returns exactly 10 rows (100500 100501 100511 100512 100513 100514 100516 100563 100584 100603).
facts    task_id, pr_number, pr_state, merged_at, merged_sha(7), merged_by, path.
action   statement 1 of cm-doctor-steps-d1.sql (INSERT INTO issue_triage ... ON CONFLICT(issue_id) DO UPDATE SET triage_state='closed', owner='breach-doctor', close_evidence=...).
verify   contract doctor-CM-R1-<issue> d1-query:  SELECT 'merged' AS expected, COALESCE((SELECT status FROM code_tasks WHERE id='<task>'),'missing') AS observed
         (measures the task, not the guarded issue: not circular, CLOSE-PROBE-CIRCULAR-1).
clears   10 (9 critical). Time to clear: first */10 tick after enabling.
owner    none. The parent issues (100448, 100453, 100465, 1893 open; 6 closed) are untouched and keep their own contracts.

---- CM-R2  exhausted-parent-closed  (cause_class source-issue-closed; close-on-evidence; pure D1) ---------------------------------------------
trigger  open 'CODE-LOOP-EXHAUSTED-1: ct_% %'; parent id = CASE goal LIKE '[issue #%' THEN digits after '#' WHEN id LIKE 'ct_im%' THEN substr(id,6); parent agent_issues.status IN
         ('closed','resolved') AND issue_triage.close_evidence non-empty (wontfix is a decision and is excluded). Live: 6 rows.
facts    task_id, task status/step/attempts, parent_id, parent status, parent close_channel, parent updated_at, remediation_verifications ref only when it matches GLOB
         'remediation_verifications#[0-9]*' (free text of the parent's evidence is never copied).
action   statement 2 of cm-doctor-steps-d1.sql.
verify   contract probe: SELECT 'closed' AS expected, COALESCE((SELECT status FROM agent_issues WHERE id=<parent>),'missing') AS observed.
clears   6 (1000089 1000149 100515 100321 100364 100361). Also clears 1000242 one tick after CM-R4 closes parent 1000179.
owner    none.

---- CM-R3  exhausted-twin  (cause_class duplicate-exhaustion; supersede; pure D1) ------------------------------------------------------------
trigger  two open EXHAUSTED issues with the same parent id; the one with the lower id is superseded by the highest open id (window function MAX() OVER (PARTITION BY parent)). Live: 1 (100382 -> 100392).
action   statement 3; close_evidence starts 'SUPERSEDED BY #<id>' (doctrine section 6: supersede with the successor id).
clears   1. The successor 100392 stays open and is handled by CM-R6.

---- CM-R5  sibling-merged-retry  (cause_class replacement-merged; close; pure D1) ---------------------------------------------------------
trigger  open EXHAUSTED issue whose task has a sibling for the same parent (ct_im<parent>, "[issue #parent]%" or "-- issue #parent (RED-DRAIN-1%" goal) with status merged,
         merged_sha and merged_at >= datetime(this task created_at). Live: 100549, 100361, 100321 (the last two are CM-R2 as well).
action   statement 4; the parent stays open. Because the parent's metric did not move (gpt-oss-120b = 252,692 of 290,494 neurons today), the doctor also opens a hand-off case on the
         PARENT for the metric/probe doctor: cause_class merged-fix-did-not-clear, facts {sibling task, PR 3659, merged_at, version live?}, action none (no requeue: a third retry of an
         already-merged lever is the loop that produced three tasks).
clears   1 new (100549).

---- CM-R4  dod-met-live  (cause_class dod-met-live; author-probe; D1 insert) --------------------------------------------------------------
trigger  open parent P with no non-superseded contract, a dead or exhausted code task, and a DoD the engine can express as an HTTP status + marker: for 1000179 the issue text's own
         DoD is "GET /api/cmd returns 405 with error, path, allow and hint". Evidence taken this session: HTTP 405, body
         {"error":"method_not_allowed","path":"/api/cmd","allow":["POST"],"hint":"Use POST /api/cmd ..."}; the pre-fix body was {"error":"method"}.
action   INSERT INTO remediation_contracts (class,issue_id,precondition,action,verify_probe,verify_transport,max_attempts,escalate_to,expected_cadence_h,status,module,next_due_at)
         VALUES ('doctor-CM-R4-1000179',1000179,'DoD of the issue','author-probe',
         '{"url": "https://fleet.qnfo.org/api/cmd", "status": 405, "contains": "method_not_allowed", "absent": "{\"error\":\"method\"}"}','runner-https',3,'qnfo-fleet-control',1,'active','breach-doctor',datetime('now'))
         The marker is absent from the pre-fix body, so the probe is not one that "already passes while the defect exists". The runner (GitHub, outside the account) passes it, the
         standard verified-remediation path closes 1000179, CM-R2 closes 1000242 on the next tick. For any other issue this action needs a probe from PROBE-AUTHOR-LIVEPATH-1;
         the doctor does not invent one from prose.
clears   1 + the parent 1000179 (2 issues).

---- CM-R6  dup-declaration  (cause_class model-redeclared-existing-identifier; requeue once; pure D1, cm-doctor-r6-requeue.sql) ---------------
trigger  code_tasks.status='failed', step='verify', last_error LIKE 'verify failed: SyntaxError: Identifier ''%'' has already been declared%', ident matches [A-Za-z0-9_$]{1,64},
         parent open, this is the newest task of that parent, no live sibling task, no live claim on file:<path> or issue:<parent>, ctx.doctor_requeues IS NULL.
action   (1) ops_config 'code_tasks--bak-<id>-<yyyymmdd>' with goal + restore text (EVOLVE-1 WIP-RECOVERY-1 pattern); (2) UPDATE code_tasks SET status='queued', step='read', attempts=0,
         lease_until=NULL, goal = goal || 'DOCTOR-CONSTRAINT CM-R6 ...: <ident> is already declared in <path> on main. Do not declare it again; call the existing one.',
         ctx = json_set(ctx,'$.doctor_requeues',1). The orchestrator resets the signature run itself when attempts drop (worker.js:2267) and keeps ctx.lastError (READ-KEEPS-REPAIR-1).
         Engine variant also greps origin/main for the identifier and quotes its line (fleet-control worker.js:8600 for #100355).
safety   once per task; fleet-control is allowed by CODE-LOOP-CONTROL-PLANE-1 behind the functional canary and auto revert; a second failure with a different signature goes to CM-R10.
verify   the parent's own code-probe: {"paths":["qnfo-fleet-control/worker.js"],"contains":"closeBlockedByContract(env, openByTitle[t])"} (passes only when objectiveConstraintsTick is guarded).
clears   100392 (+ parent 100355). Expected within 2 h (the loop's own SLA); if not, R10.

---- CM-R7  path-alias  (cause_class scope-path-names-missing-dir; code-task-issue + requeue) ---------------------------------------------
trigger  failed task at step read with last_error LIKE 'read failed: raw read HTTP 404%', path's first segment X has no tree entry on main, 'q08-'||path exists (contents API 200).
         Live: ct_im100467 (mind/data/entries-a.json), ct_im100468 (mind/data/entries-b.json); ct_im100442 is the same defect but its parent is closed (CM-R2).
action   a. file ONE code-task issue (trusted: source breach-doctor must be added to code_merge_trusted_sources by migration, or filed as claude-session by the engine) with
            code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js path=qnfo-code-orchestrator/worker.js   (code_merge_multi_file = on; MERGE-SCOPE-PARITY-1 keeps them equal)
            code-anchor: if (/^mind\/(?:data\/)?[A-Za-z0-9._-]+\.(?:json|toml)$/.test(path) && path.indexOf("..") < 0) return { ok: true, kind: "mind-data" };
            code-anchor: if (/^mind\/(?:data\/)?[A-Za-z0-9._-]+\.(?:json|toml)$/.test(p) && p.indexOf("..") < 0) return null;
            (both unique on origin/main a4baaeaa, lines 3396 and 797) and
            code-probe: {"paths": ["qnfo-fleet-control/worker.js", "qnfo-code-orchestrator/worker.js"], "absent": "/^mind\\/(?:data\\/)?"}
         b. after that PR is merged and /health shows the new VERSION: UPDATE code_tasks SET path = 'q08-<path>', status='queued', step='read', attempts=0, ctx=NULL (claim released) for the 2 tasks.
safety   claim file:qnfo-code-orchestrator/worker.js was held at 06:20Z by session_01RdDA76KLvqYHYBjL9C2be5 (PR 4295, until 2026-10-26T08:16Z): the doctor queues behind it, never
         takes it. q08-mind is WRANGLER-ONLY; mind-deploy.yml ships q08-mind/** on push, so a merged data fix deploys itself.
verify   parent probes (code-read on main): {"paths":["q08-mind/data/entries-a.json"],"contains":"10.1017/cbo9781139878364","absent":"10.1017/CBO9780511613292"} and
         {"paths":["q08-mind/data/entries-b.json"],"contains":"10.1080/15298860309032","absent":"10.1037/0022-3514.84.4.822"} (the exact old/new strings are in the issues).
clears   1000150, 1000151 (+ critical parents 100467, 100468).

---- CM-R8  wrong-target / decompose  (cause_class target-is-new-file-or-wrong; child issues) ---------------------------------------------
trigger  failed task at read 404 whose path has no dir on main AND the parent text says the target was wrong (the doctor does not read the text; it uses the structured fact that the
         DoD probe is a D1 count): for 100419 the probe is SELECT COUNT(*) FROM agent_issues WHERE status IN ('closed','resolved','wontfix') AND close_channel IS NULL AND updated_at > <deploy_ms>.
diagnosis  live: 11 NULL close_channel closes in 48 h by writer: STALE-PR-CONFLICT-REPAIR-1 (qnfo-fleet-control) 4, owner-chat session SQL 6, MIGRATION-APPLY-FAILED-1 (ci:apply-migrations) 1,
           ... (SELECT source, substr(title,1,instr(title,' ')) GROUP BY).
action   one child code-task issue per writer that lives in a code-loop-scope file (fleet-control close site), each with code-anchor found by grepping main for
         "UPDATE agent_issues SET status" statements without close_channel in the same statement; the apply_migrations.py site is CM_SCRIPT_DENY ("apply_migrations") -> CM-R10.
         The old task is superseded with the child ids (code_tasks.status='superseded', merge_note 'CM-R8 split into #...').
clears   1000148 as a decomposition (children carry named doers; the parent closes on its probe).

---- CM-R9  wrong-anchor  (cause_class anchor-window-unrelated; requeue once) --------------------------------------------------------------
trigger  failed task, last_error LIKE '%no SEARCH/REPLACE block%' OR '%SEARCH text occurs 0 times%', file > 100k chars, sig streak 3, ctx.doctor_requeues IS NULL.
diagnosis  tokens = quoted tokens of the parent's DoD/diagnosis lines (single-quoted SQL fragments, backticked identifiers, the issue key); candidate lines = lines of the file on main
           containing >= 2 tokens; a candidate set of exactly 1 line is the anchor and differs from ctx.anchor. 100625: tokens "status = 'queued'", "stage = 'revise'", "PARK-REARM-1" ->
           exactly one line, research-exec worker.js:1960 (UPDATE research_queue SET status = 'queued', stage = 'revise', attempt = 0, ...), vs ctx.anchor = line 61.
action   UPDATE code_tasks SET ctx = json_set(ctx,'$.anchor',<line>,'$.doctor_requeues',1), status='queued', step='read', attempts=0 (after the CM-R6-style backup).
verify   DoD probe: SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM research_queue WHERE status='queued' AND stage IS NOT NULL AND claimed_at IS NULL AND created_at < datetime('now','-1 hour')) AS TEXT) AS observed
         (82 today).
clears   1000248 (+ parent 100625); also fits 1000000, 100350 part A, 1000140, 1000260 (anchor from the finding line "file:line offending text" of WORKERS-BP-DEBT-1).

---- CM-R10  session-only  (cause_class denied-surface; hand-over; D1) ---------------------------------------------------------------------
trigger  a blocker the loop provably cannot cross: cmScope/mergeScopeWhy refuse the path (CM_SCRIPT_DENY, .github/, workers config) or a needed companion matches CM_COMPANION_DENY
         (fleet-control :3605), or a second doctor requeue failed with a new signature.
action   cm-doctor-session-queue.sql: issue_triage.owner='session' + remediation = 'BLOCKER class=... rule=<file:line> path=... why=... loop_part=... probe=<code-probe json> claim=file:<path>',
         a 'session-task: repo=... path=...' line (counted by session_dependent_issues_open), a blocker_redteam row (verdict confirmed-with-evidence, surfaces line, refusal text), view v_session_queue
         (priority order, age, claimed_by from work_claims). The queue entry keeps its priority; it never becomes an owner card (not identity-bound, DOCTRINE section 6).
         The doctor re-evaluates every tick: if the blocker disappears (scope widened by migration/PR) the row returns to the fleet queue; unclaimed for 120 minutes -> the issue age ladder and
         the dashboard counter session_queue_confirmed (own SLA) escalate; a session takes file:/issue: claims through qnfo-deploy-guard /work-lock/acquire (WORK-CLAIM-1).
today    100498 only. Its split: Part A (scripts/cf_ops_actions.py after def noz_scrub_bodies, loop-doable with the right anchor) and Part B (cf-ops-actions.yml option, session-only).
verify   the issue's own code-probe {"paths":["scripts/cf_ops_actions.py"],"contains":"living-paper-floor-restore"} then the issue 100274 contract.

---- CM-B  prevention (code-tasks the doctor files once; each has its anchor verified unique on origin/main) ----------------------------------
B1  qnfo-fleet-control cmFailureLines (:4506): keep "##[error]<text>" lines (drop the prefix and "Process completed with exit code N") as primary lines.
    code-anchor: } else if (/^##\[/.test(t) || !t) {      code-probe: absent "/^##\\[/.test(t) || !t"
B2  qnfo-fleet-control base-red: at :4064 before `return Object.assign(refuse("required check(s) failed ...` compare the failed check's first "##[error]" signature with (a) the same signature
    on >= 2 other PRs with different paths in the last 72 h (cloud_ops_events code-merge.refused) or (b) the latest deploy-gate push run on main being failure with that line. If base-red:
    return wait("main is red: <signature>") with a 120-minute expiry (SLA), no repair round, no refusal; when main is green, call update-branch (MERGEABILITY-NUDGE-1 exists) and let cmDecide decide.
    code-anchor (unique): if (d.action === "refuse" && num && g.pr && g.pr.state === "open" && cmRepairable(t, d.why)) {   (:4761: skip cmRepairInTask when d.base_red)
B3  qnfo-fleet-control cmProvenance (:5001): resolve the issue with cmIssueIdOf(t) (it knows ct_im ids and "-- issue #N (RED-DRAIN-1 dispatch)") so the trust list applies to direct dispatch.
    code-anchor: async function cmProvenance(env, t, list) {      (today the live trust list already admits cf-obs-bridge, owner-chat, workers-bp-audit, so impact is latent, not zero)
B4  red-drain step 3 (D1 fleet_tasks, migration with Rollback line): dispatch only when the path exists on main (the engine checks, or the SQL joins a repo-tree snapshot), apply the folded-host
    redirect, copy `code-anchor:` into ctx.anchor, and drop the stale RED-DRAIN-SCOPE-1 skip of workers the code loop may now change (qnfo-fleet-control, qnfo-ops, qnfo-deploy-guard,
    qnfo-code-orchestrator are in CM_LOOP_CANARIED).
B5  scope allowlist: CM-R7 task above.
B6  CONFLICT-REPAIR-DOER-1 (github-actions): dedupe its comment per head sha (29 identical comments on PR 3608) and file a CM-R10 case instead of re-commenting.
failure_modes rows: fm-merge-refused-issue-orphan (RC1), fm-required-check-base-red (RC2/RC4), fm-ci-excerpt-drops-guard-lines (RC3), fm-direct-dispatch-bypasses-intake (RC5),
fm-scope-regex-names-missing-dir (RC6), fm-locator-picks-unrelated-line (RC7), each with an fm-<key> detector contract.

======================================================================================================
4. EXPECTED EFFECT
======================================================================================================
Within one */10 tick after the D1 steps are enabled (no worker deploy): R1 10 + R2 6 + R3 1 + R5 1 = 18 of 25 closed with evidence; R4 adds 1000242 (+ parent 1000179) one to two ticks later = 19.
Code-loop completions inside their SLA: R6 100392 (+100355), R7 1000150 1000151 (+100467 100468, critical), R9 1000248 (+100625), R8 1000148 split = up to 5 more.
Session queue: 100498 with the exact blocker. After B1-B4: a base-red refusal costs 0 repair rounds (today 18+), and no CODE-MERGE-REFUSED-1 issue is filed for a base-red check.
Metrics: critical open issues in the family 9 -> 0 within a tick; 19 of the 25 are among the 285 issues_over_24h_no_doer (v_issue_age_ladder breach=1): 17 leave in the first tick (285 -> 268), the other 2 (100392 requeued with an '[issue #N]' goal, 100498 in the session queue with a claim key) get a named doer.
