-- REM-A7-OWNER-A-1 (2026-10-26, remediation agent rem-a7; charter pillars autonomy and reach; agent_issues 100596, 100487, 1000101, 100488, 1000247, 100120).
-- Owner-queue cards that ask the fleet to investigate, unblock or draft. Each one is answered with a measured finding, and where a probe stood on a placeholder it is replaced by one that measures the condition.
--   * 100596 (unblock the parked code tasks): of the nine tasks the owner listed, four were already terminal and the five still in status failed are superseded with their reason. Four belong to issues that
--     closed with evidence (100345 by a passing code-read verification, 100442 by a passing d1-query one, 100467 and 100468 by q08-mind 2.2.1, PR 4537, live); the fifth, ct_im100419, targeted a migration file
--     the code loop cannot ship and its work shipped as CLOSE-CHANNEL-GUARD-1, the issue staying open under its own contract. The contract of issue 100596 is unchanged and now reads 0.
--   * 100487 (outreach queue send drain, 0 of 160 rows match): the queue is drained, not mis-enumerated. qnfo-observability 1.5.4 (PR 4817, live) reads zero waiting rows as healthy; the placeholder probe is replaced by
--     one that reads the chain from integration_state and the 73 hour row SLA from outreach_queue.
--   * 1000101 (draft a clarification reply to a named external person): the draft is stored as the answer to the owner prompt, for the owner to review and send himself. Nothing is sent, queued or scheduled.
--     The text carries no name or address: the salutation and the paper title are read from queue rows at apply time.
--   * 100488 (first attested credibility event): the step is the owner's own attestation of a real-world event; card attest-first-credibility-event with an IDENTITY-BOUND line. The fleet cannot attest it.
--   * 1000247 and 100120 (weekly doctrine audit, hand-off tracker): the audit result and the tracker reading are recorded; both stay open because their own probes measure outcomes that other loops move.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE code_tasks SET status = (SELECT b.status FROM bak_20261026_rem_a7_parked_tasks b WHERE b.id = code_tasks.id), last_error = (SELECT b.last_error FROM bak_20261026_rem_a7_parked_tasks b WHERE b.id = code_tasks.id), updated_at = (SELECT b.updated_at FROM bak_20261026_rem_a7_parked_tasks b WHERE b.id = code_tasks.id) WHERE id IN (SELECT id FROM bak_20261026_rem_a7_parked_tasks); UPDATE remediation_contracts SET status = 'superseded', module = 'probe-template-v3-generic', verify_transport = 'd1-query', verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = 100487) AS observed' WHERE class = 'issue-100487' AND module = 'rem-a7-owner-v1'; UPDATE owner_prompts SET status = 'queued', response = NULL, model = NULL WHERE id = 'op-mvn8oc5x7129' AND model = 'rem-a7:draft-for-owner-review'; UPDATE human_actions SET status = 'resolved', resolution = 'rolled back with migrations/2026-10-26-rem-a7-owner-a.sql' WHERE slug = 'attest-first-credibility-event'

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a7_parked_tasks AS
  SELECT id, status, last_error, updated_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at
    FROM code_tasks
   WHERE id IN ('ct_im100345', 'ct_im100419', 'ct_im100442', 'ct_im100467', 'ct_im100468');

UPDATE code_tasks SET status = 'superseded',
  last_error = CASE WHEN COALESCE(last_error, '') = '' THEN '' ELSE last_error || ' | ' END
    || 'superseded: issue 100345 closed with a passing code-read verification on 2026-10-25 and its fix is on main (REM-A7-PARKED-1)',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'ct_im100345' AND status = 'failed'
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 100345 AND a.status IN ('closed', 'resolved'));

UPDATE code_tasks SET status = 'superseded',
  last_error = CASE WHEN COALESCE(last_error, '') = '' THEN '' ELSE last_error || ' | ' END
    || 'superseded: issue 100442 closed with a passing d1-query verification on 2026-10-25; the path mind/wrangler.toml is not in this repository (REM-A7-PARKED-1)',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'ct_im100442' AND status = 'failed'
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 100442 AND a.status IN ('closed', 'resolved'));

UPDATE code_tasks SET status = 'superseded',
  last_error = CASE WHEN COALESCE(last_error, '') = '' THEN '' ELSE last_error || ' | ' END
    || 'superseded: issue 100467 closed 2026-10-26, the data fix shipped as q08-mind 2.2.1 (PR 4537, live); mind/data/entries-a.json is not in this repository, hence the HTTP 404 at read (REM-A7-PARKED-1)',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'ct_im100467' AND status = 'failed'
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 100467 AND a.status IN ('closed', 'resolved'));

UPDATE code_tasks SET status = 'superseded',
  last_error = CASE WHEN COALESCE(last_error, '') = '' THEN '' ELSE last_error || ' | ' END
    || 'superseded: issue 100468 closed 2026-10-26, the data fix shipped as q08-mind 2.2.1 (PR 4537, live); mind/data/entries-b.json is not in this repository, hence the HTTP 404 at read (REM-A7-PARKED-1)',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'ct_im100468' AND status = 'failed'
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 100468 AND a.status IN ('closed', 'resolved'));

UPDATE code_tasks SET status = 'superseded',
  last_error = CASE WHEN COALESCE(last_error, '') = '' THEN '' ELSE last_error || ' | ' END
    || 'superseded: the target migrations/2026-10-22-close-channel-required.sql is not a code-loop path and the work shipped as CLOSE-CHANNEL-GUARD-1 (PR 3478, PR 3506, scripts/close-channel-guard.test.mjs); issue 100419 stays open under its own contract for the observation window (REM-A7-PARKED-1)',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'ct_im100419' AND status = 'failed'
  AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.class = 'issue-100419' AND c.status IN ('active', 'holding'));

UPDATE issue_triage SET close_evidence = 'Per-task disposition, measured 2026-10-26 (rem-a7). Of the nine tasks listed, four were already terminal before this change: ct_im100438 merged (PR 3830, 2026-10-24T15:16Z) and ct_im100430, ct_im100445, ct_im100463 superseded. The five in status failed are now superseded, each for a measured reason: ct_im100345 (issue 100345 closed by a passing code-read verification, 2026-10-25; the FOLD-PAIR-TASK-1 suite failures the owner names belong to that task and its fix is on main), ct_im100442 (issue 100442 closed by a passing d1-query verification, 2026-10-25), ct_im100467 and ct_im100468 (issues closed 2026-10-26: the data fix shipped as q08-mind 2.2.1, PR 4537, live; their paths mind/data/entries-a.json and entries-b.json are not in this repository, which is why the loop''s read answered HTTP 404 and no refusal of scope was involved), ct_im100419 (its target migrations/2026-10-22-close-channel-required.sql is not a path the code loop can ship; the work shipped as CLOSE-CHANNEL-GUARD-1 by a session, and issue 100419 stays open under its own 48 hour observation contract). The refusal quoted in the task, a repository outside the merge runner scope, was lifted for the control-plane workers on 2026-10-19T12:06:43Z (CODE-LOOP-CONTROL-PLANE-1); the one wall that remains, .github/workflows/**, is by design (the stale-PR lane merges those) and no listed task needs it, since OPS-ROUTER-522 closed with ops.qnfo.org answering 200. PAPER-ASK-CITED-DEFS-1 (issue 100430) keeps its own contract and doer: its code-anchor, function askSystemPrompt(paperTitle) {, occurs exactly once in qnfo-gateway/worker.js on main (line 3937 at 2026-10-26 19:08Z), and the only thing holding its code task is the live work claim of claude-code-ask-plain-20261026 on that file. Closing probe (class issue-100596, unchanged): none of the nine tasks is outside merged, superseded, closed or published; it read blocked_or_unresolved:5 before this change and reads blocked_or_unresolved:0 after it.'
 WHERE issue_id = 100596 AND coalesce(close_evidence, '') = ''
   AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.class = 'issue-100596');

UPDATE remediation_contracts
   SET precondition = 'qnfo-observability 1.5.4 or later (OUTREACH-CHAIN-DRAINED-1) writes an integration_state row every hour',
       action = 'REM-A7-OWNER-A-1: measures the definition of done of the owner task on the outreach drain. The latest integration_state row reads the outreach chain healthy (zero waiting rows is its success condition) and no outreach_queue row has waited longer than the 73 hour SLA. A chain that reads empty-match or stuck, or a row waiting over 73 hours, fails it; qnfo-observability and qnfo-cloud-ops own the repair.',
       verify_probe = 'SELECT ''healthy / waiting over 73h: 0'' AS expected, COALESCE((SELECT json_extract(j.value, ''$.status'') FROM json_each(json_extract((SELECT json FROM integration_state ORDER BY id DESC LIMIT 1), ''$.chains'')) j WHERE json_extract(j.value, ''$.id'') = ''outreach''), ''no integration_state row'') || '' / waiting over 73h: '' || (SELECT COUNT(*) FROM outreach_queue WHERE status IN (''pending'', ''needs-email'', ''needs-contact'', ''queued'') AND datetime(created_at) < datetime(''now'', ''-73 hours'')) AS observed',
       verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, last_attempt_at = NULL,
       module = 'rem-a7-owner-v1', next_due_at = datetime('now')
 WHERE class = 'issue-100487' AND instr(coalesce(action, ''), 'VACUOUS-PROBE-V3-1') = 1
   AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 100487 AND a.status = 'open');

UPDATE issue_triage SET close_evidence = 'Finding and fix, measured 2026-10-26 (rem-a7). The zero is a drained queue, not a stale predicate. qnfo-audit.outreach_queue holds 193 rows: 102 sent, 27 skipped, 26 skipped-no-email, 25 held-segment-stopped, 13 skipped-dup, and none waiting (pending, needs-email, needs-contact, queued). radar-hub inserts the day''s candidates at 09:00:30 UTC and the qnfo-cloud-ops outreach job gives every row a terminal status within the minute (rows of 2026-10-13 to 10-26 all terminal at their 09:00 to 09:01 insertion minute; rows created on a Friday wait for Monday). The 25 held-segment-stopped rows are not a gate defect: outreach_learner_arms segment other:institutional has 53 sends, 0 positive replies, rule_stop 1, stopped 2026-10-21T05:20Z (STRATEGY s6.4 stop rule; override ops_config outreach_learner_resume:<segment>); no consent, suppression, cap or send-gate rule changed. The alarm came from qnfo-observability''s empty-match guard (a chain whose pending predicate matches 0 of N rows with expectEmpty false reads empty-match): the outreach chain had expectEmpty false and so read a drained queue as an unknown ("0 of 193 rows matched the pending predicate ... verify the status enum"). Fix: PR 4817, qnfo-observability 1.5.4 (merged 2026-10-26T19:09Z, live: GET https://qnfo-observability.q08.workers.dev/integration reads the outreach chain status healthy, n 0, total 193); the enum-drift check that guard stood in for is the live detector fm-outreach-chain-enum. Closing probe (class issue-100487, d1-query): the latest integration_state row reads the outreach chain healthy and no row waits over the 73 hour SLA; it read empty-match before 1.5.4 and reads healthy / waiting over 73h: 0 now.'
 WHERE issue_id = 100487 AND coalesce(close_evidence, '') = ''
   AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.class = 'issue-100487' AND c.module = 'rem-a7-owner-v1');

UPDATE owner_prompts
   SET status = 'answered', model = 'rem-a7:draft-for-owner-review',
       response = 'DRAFT FOR YOUR REVIEW. NOTHING WAS SENT, QUEUED OR SCHEDULED, and nothing will be sent until you send it yourself.'
         || char(10) || char(10)
         || 'What happened (email_reply_queue id 76, read 2026-10-26): the contact received the fleet''s first note on 2026-09-30 and its one follow-up on 2026-10-21 and replied to both. On 2026-10-22 at 18:15Z the tier 2 drafter (EMAIL-VOICE-DRAFTER-1) answered that reply in your name without you seeing it, and his answer to that called the notes spam and the replies the work of an incompetent AI agent. The auto-send is the defect tracked as EMAIL-TIER2-GATE-1 (agent_issues 1000469). The outreach engine will not write to him again (no repeat contact after a reply); until the gate ships, a further message from him could still be answered by the tier 2 drafter.'
         || char(10) || char(10)
         || 'Suggested reply. It says plainly that an automated assistant wrote the follow-ups, which he already suspects; remove that sentence if you prefer.'
         || char(10) || char(10)
         || 'Subject: Re: Following up: QNFO, the energy-efficiency benchmark for quantum computing'
         || char(10) || char(10)
         || 'Dear ' || COALESCE((SELECT CASE WHEN instr(q.sender, '.') > 1 AND instr(q.sender, '.') < instr(q.sender, '@') THEN substr(q.sender, 1, instr(q.sender, '.') - 1) ELSE 'colleague' END FROM email_reply_queue q WHERE q.id = 76), 'colleague') || ','
         || char(10) || char(10)
         || 'You are right to be annoyed, and I am sorry. The follow-up and the reply that pasted my first note back to you came from an automated assistant I use for first-contact notes. It misread your message instead of answering it. That is my responsibility, not yours.'
         || char(10) || char(10)
         || 'What I originally hoped for was a short exchange about the energy cost of quantum error correction, prompted by the paper "'
         || COALESCE((SELECT trim(substr(o.reason, instr(o.reason, ':') + 1)) FROM outreach_queue o WHERE o.status = 'sent' AND instr(o.reason, ':') > 0 AND lower(o.email) = (SELECT lower(q2.sender) FROM email_reply_queue q2 WHERE q2.id = 76) ORDER BY o.created_at DESC LIMIT 1), 'in my first note')
         || '".'
         || char(10) || char(10)
         || 'I will not write again unless you tell me you would like me to. If you do, one line from you is enough and I will answer in person. If you would rather stop, you do not need to reply.'
         || char(10) || char(10)
         || 'With apologies,' || char(10) || 'Rowan Brad Quni-Gudzinas' || char(10) || 'QNFO'
         || char(10) || char(10)
         || 'Not done on purpose: the contact was not added to the suppression list (the outreach engine already refuses a second contact after a reply) and no reply was queued in the drafter.'
 WHERE id = 'op-mvn8oc5x7129' AND status = 'queued' AND response IS NULL
   AND EXISTS (SELECT 1 FROM email_reply_queue WHERE id = 76);

UPDATE issue_triage SET close_evidence = 'Draft delivered for owner review, nothing sent (rem-a7, 2026-10-26). The reply is stored as the answer to the owner prompt op-mvn8oc5x7129 (owner_prompts.status answered, response holds the context, the suggested subject and body, and the points deliberately left undone); the salutation and the paper title are read from email_reply_queue id 76 and outreach_queue at apply time, so this record carries no name or address. Context read from the queue: the contact replied to the first note (2026-09-30) and the follow-up (2026-10-21); the tier 2 drafter auto-sent a reply in the owner''s name on 2026-10-22T18:15:55Z (email_reply_queue 76, decision sent, cleared for auto-send); the contact answered that he took the notes for spam and the replies for an incompetent AI agent. That auto-send is EMAIL-TIER2-GATE-1 (agent_issues 1000469, open, doer qnfo-email). No send path was used or enabled. Closing probe (class issue-1000101, unchanged): the owner prompt is no longer queued; it read not-acted before and acted after.'
 WHERE issue_id = 1000101 AND coalesce(close_evidence, '') = ''
   AND EXISTS (SELECT 1 FROM owner_prompts p WHERE p.id = 'op-mvn8oc5x7129' AND p.model = 'rem-a7:draft-for-owner-review');

INSERT INTO human_actions (slug, title, why, default_in_effect, action, url, sev, status, source, created_at, updated_at)
SELECT 'attest-first-credibility-event',
  'Attest the first real-world credibility event the fleet cannot see (an accepted talk, invitation, press piece, arXiv listing or citation)',
  'IDENTITY-BOUND: only you can attest a real-world event; the fleet must not, and cannot, produce one. The review gate (continue only if credibility events reach 2, or 50 confirmed subscribers, or funding) reads credibility_events_90d, and that number is unmeasured: selected_works_citation_coverage reads no selected works are tracked (their identifiers were retired with the registry account), and talks, acceptances, press and arXiv listings count only when you attest them with evidence on the Invest page. Measured 2026-10-26: confirmed subscribers from outside the fleet 0 (target +10 a month), warm conversations in 30 days 10 (target 4), pageviews 16,580 and 630 referrals in 30 days, outreach reply rate 1.2 percent; the fleet already runs the automated reach loops (double opt-in subscribe, social posts with utm tags, outreach within its consent rules).',
  'The gate keeps reading credibility_events_90d as unmeasured and the decision stays UNKNOWN or AT_RISK; nothing else blocks and no loop waits on this card.',
  'Open the Invest page on the fleet dashboard (the review gate card) and attest the one event you already have, with its evidence (a link or a sentence): the smallest step is a single event, because one attested event moves credibility_events_90d from unmeasured to 1. Candidates to check in your own inbox and calendar: an invitation or acceptance to speak, a journal or workshop acceptance, a press mention, an arXiv listing, a citation of one of your works, a written endorsement from one of the 10 warm conversations of the last 30 days. If none exists yet, no step is needed from you: the fleet keeps the subscribe and outreach loops running. The task closes when credibility_events_90d reads 1 or more or a confirmed external subscriber appears (the contract of agent_issues 100488 measures exactly that).',
  'https://fleet.qnfo.org/', 'normal', 'open', 'session:rem-a7', datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM human_actions WHERE slug = 'attest-first-credibility-event')
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 100488 AND a.status = 'open');

UPDATE agent_issues
   SET description = description || char(10) || 'REM-A7-OWNER-A-1 2026-10-26 (measured): the fleet-side steps are running (double opt-in subscribe pipeline, social posts with utm tags, outreach inside its consent rules; warm_conversations_30d 10, pageviews_30d 16580, referral_30d 630, outreach_reply_rate_30d 1.2); subscribers_confirmed_external 0 and credibility_events_90d unmeasured (selected_works_citation_coverage: no selected works are tracked, identifiers retired). The one step that cannot be automated is the owner''s attestation of a real event: card attest-first-credibility-event (IDENTITY-BOUND). The contract of this issue stays: it passes when credibility_events_90d reads 1 or more or a new confirmed subscriber exists.',
       updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 100488 AND status = 'open' AND instr(description, 'REM-A7-OWNER-A-1 2026-10-26') = 0;

UPDATE issue_triage SET remediation = 'REM-A7-OWNER-A-1 audit reading 2026-10-26 (v_doctrine_scorecard_v2): root_causes_unremediated 46 (target 0; 44 when this ticket was filed), silent_drops 0, issues_unaccounted 1, spofs_on_critical_path 5 of 15, controls_on_critical_path_untested 1, beliefs_unverified_60m 1, failure_modes_unprobed_pct 1, backlog_age_p95_min 17978, stops_justified 1 of 1, capabilities_acquired_7d 72. The weakest clause is unchanged: root_causes_unremediated counts v_failure_mode_status rows whose detector currently fails (status recurring). The 46 are not one defect: about a quarter are code-loop and planner failure modes (code-task-*, code-plan-*, stale-untrusted-verdict, open-issue-no-doer, issue-no-doer-24h), about a fifth are q08 and research pipeline modes (q08-*, wai-*, research-exec-stalled, publish-rate-collapse, internal-errata-dead-end, thin-papers-unremediated, paper-fabricated-empirical-claim), and the rest are registry, probe and metric hygiene modes (control-alternate-*, detector-contract-not-armed, reopen-*, metric-close-flap, sla-metric-overlap, iso-text-compare, fleet-tick-fanout-abort, coe-null-id). The detectors, the alternate paths and the probes already exist for each; what moves the number is the fix of each cause by its owner loop, so this ticket builds no new detector and closes when the clause reads 0.'
 WHERE issue_id = 1000247 AND coalesce(remediation, '') = '';

UPDATE issue_triage SET remediation = 'REM-A7-OWNER-A-1 tracker reading 2026-10-26: of the 51 issues behind the hand-off plans, 29 are closed and 22 are open (agent_issues read 19:00Z). Fifteen of the open ones are METRIC-TRIGGER tickets whose metric is in breach (contract monitoring:metric-condition; their metrics are outcomes, not bugs a pull request closes: worker_count 36 against 30, monthly cost run rate 1466.84 against 580, owner_dispatch_7d, code_task_success_rate_30d and others); 2722 is LEARNER-ARMS-2 (fix LEARNER-ARMS-3 merged as PR 4745, contract waits on the next learner window); 2826, 2827 and 2954 are control and verification machinery (CONTROL-ALT-PROBES-4 and VERIFICATION-DEFERRAL-HONEST-2 and -3 merged); 2008, 2323 and 2852 are older tickets with their own contracts. Every one has a doer or a metric loop and its own closing probe, so this tracker needs no new work item: it reads 0 only when all 51 are resolved, which is what its probe measures.'
 WHERE issue_id = 100120 AND coalesce(remediation, '') = '';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a7',
  'an owner-queue card is answered by a measured finding and, where a probe stood on a placeholder, by a probe that measures the condition; a step only the owner can take is an IDENTITY-BOUND card, and a draft is delivered but never sent',
  'REM-A7-OWNER-A-1: five failed code tasks superseded with reasons (100596); issue-100487 contract rewritten to read the outreach chain from integration_state after PR 4817; draft reply stored as the answer to owner prompt op-mvn8oc5x7129, nothing sent (1000101); card attest-first-credibility-event (100488); audit and tracker readings recorded (1000247, 100120)',
  'code_tasks: 9 listed, 4 terminal before, 5 failed now superseded; outreach_queue 193 rows, 0 waiting, 102 sent; /integration outreach chain healthy at qnfo-observability 1.5.4; email_reply_queue 76 decision sent 2026-10-22T18:15:55Z; v_doctrine_scorecard_v2 root_causes_unremediated 46; 51 tracker issues, 29 closed, 22 open',
  'applied by migration', 'five code_tasks rows, one remediation_contracts row, one owner_prompts row, one human_actions row, five issue_triage and one agent_issues text; no worker, secret, send path, suppression row or paper changed',
  'the Rollback line of migrations/2026-10-26-rem-a7-owner-a.sql and the backup table bak_20261026_rem_a7_parked_tasks',
  'issues 100596 and 100487 close through their own probes; 1000101 closes when the owner prompt is no longer queued; 100488 stays open behind an IDENTITY-BOUND card',
  '100596 reads blocked_or_unresolved:0 and 100487 reads healthy at their next verification (the consumer runs due contracts hourly); a regression of either reopens them through REMEDIATION-REOPEN-2',
  'reach: outreach drain visible as healthy; the owner can answer an external correspondent knowingly',
  'D1 reads of code_tasks, agent_issues, outreach_queue, integration_state, email_reply_queue, owner_prompts, human_actions, v_doctrine_scorecard_v2; GET qnfo-observability /integration and /health after the 1.5.4 deploy; the probe SQL against live qnfo-audit'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A7-OWNER-A-1:%');
