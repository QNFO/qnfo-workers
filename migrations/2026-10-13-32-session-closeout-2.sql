-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM decision_outcomes WHERE actor = 'session_01Kddqwk5gQT5qSSHVKjT2EA' AND instr(evidence, 'OUTCOMES-5:') = 1; DELETE FROM decision_log WHERE instr(action, 'COMPANION-WRITER-BAR-20261013:') = 1 (the session_records update keeps the earlier text in bak_20261013_session_record)
-- SESSION-CLOSEOUT-20261013-2 (pillar autonomy; SESSION-RECORD-1, doctrine section 22 prediction calibration).
-- (1) Outcomes now known from live reads, misses recorded as misses. (2) One decision for the companion writer-bar changes shipped
-- after 13:00 UTC (PRs 1136, 1139, 1144, 1147) with its prediction. (3) The session record is brought up to date; its earlier text is
-- kept in a backup table first.
CREATE TABLE IF NOT EXISTS bak_20261013_session_record AS SELECT * FROM session_records WHERE session_id = 'session_01Kddqwk5gQT5qSSHVKjT2EA-20261013';
INSERT INTO decision_outcomes (decision_id, ts, observed_outcome, matched, evidence, actor)
SELECT d.id, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), o.column3, o.column4, 'OUTCOMES-5: ' || o.column5, 'session_01Kddqwk5gQT5qSSHVKjT2EA'
FROM decision_log d JOIN (VALUES
 (258, 'FACTCHECK-FIRST-TWO-1', 'the next generation run (12:00 UTC) never reached the fact-check: the 1.20.0 critic rejected every draft and the run ended on critic unavailable; when a draft did reach it (14:02 UTC) the verdict came 12 s after the stage started', 0,
  'personal-life companion_runs 5412-5444 (12:00 run: no fact-check stage, failed critic unavailable) and 5485-5486 (14:02:16 fact-check, 14:02:28 prune trail)'),
 (264, 'COMPANION-HOLD-WITHDRAWN-1', 'ops_config has no companion_generation row and the 12:00, 13:00 and 14:00 ticks generated', 1,
  'ops_config companion_generation count 0 at 13:14 UTC; companion_runs 5412, 5446, 5476 start generation'),
 (271, 'CRITIC-REASONING-1', 'after the 1.20.1 deploy no critique rejected a draft on grounding for framed reasoning alone; every grounding rejection named an invented fact or quotation', 1,
  'companion_runs 5455, 5459, 5463, 5468, 5473, 5493, 5497, 5502, 5507: each grounding or low score cites an invented causal link, quotation, count or mission'),
 (272, 'CRITIC-NOTHINK-1', 'critiques of the 13:00 run took 3-8 s, but no draft of that run reached the fact-check (all rejected for invented facts); the 14:00 run did', 0,
  'companion_runs 5454-5455 (4.6 s), 5462-5463 (4.3 s), 5467-5468 (2.8 s); 13:00 run ended without a fact-check stage; 14:02 run reached it'),
 (275, 'BLOCKER-VERDICT-STICKS-1', 'unverified_blocker_claims read 0 at the first metric tick after the merge (the 24 h part is still open and will be judged later)', 1,
  'metric_registry unverified_blocker_claims 0 and v_blocker_claims 0 rows at 13:14 UTC')
) o ON d.id = o.column1 AND instr(d.action, o.column2) > 0
WHERE d.actor = 'session_01Kddqwk5gQT5qSSHVKjT2EA' AND NOT EXISTS (SELECT 1 FROM decision_outcomes x WHERE x.decision_id = d.id);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a writer held to a systems-analysis bar on a free model invents facts; the pipeline must choose topics that support the analysis and repair, not discard, a draft with one invented fact',
  'COMPANION-WRITER-BAR-20261013: personal-companion 1.21.0 SYSTEMS-TOPIC-1 (actor topics), 1.21.1 QUOTE-GROUND-1 (verbatim quotations, objection in own words, specific analysis), 1.21.2 REVISION-REPAIR-1 (the fact revision is repaired) and 1.21.3 CRITIC-PRUNE-1 (a quoted invented fact is deleted and the draft re-read)',
  'companion_runs 5412-5507 (12:00-14:06 UTC): asteroid topic; invented critic quotations and a moved Eleanor Roosevelt quotation; an extension that failed validation unrepaired; nine of ten drafts rejected by the critic for one or two quoted inventions',
  'merged through the canonical path', 'the companion writer prompts, topic choice, critic and fact revision', 'revert of personal-companion 1.21.0-1.21.3',
  'drafts that survive the critic and the fact-check', 'a companion piece is published by 20:15 UTC 2026-10-13 (the 15:00-20:00 UTC runs, including the 16:00 and 20:00 generation hours)', 'reading.q08.org publishes again at the owner''s bar',
  'd1:companion_runs, companion_pieces; code:personal-companion systemsFit, groundingProblems, critiqueWorst, criticQuotes'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-WRITER-BAR-20261013:') = 1);
UPDATE session_records SET
  summary = summary || ' | After 10:10 UTC: PRs 1124 (companion 1.19.6 fact-check ends on the first two verdicts), 1125 (probe review skips standing detectors, qnfo-cloud-ops 1.26.3; consumer judges no code-read detector on a stale checkout), 1129-1147 (companion 1.20.0-1.21.3: required context and systems analysis per the owner''s 11:26 UTC verdict, critic no-think, actor topics, verbatim quotations, revision repair, critic prune), 1134 (standards guard undefined-call rule against the code loop''s goal-review refusals), 1137 (disproved blocker claims stay disproved while unchanged; unverified_blocker_claims 6 -> 0), 1140 (internal errata dead end filed for the code loop), 1141 (two parked detectors made active), 1130 and this file (12 decision outcomes).',
  decisions_made = decisions_made || ' | Read the owner''s 11:26 UTC message in another session''s events before acting on it; built a generation hold (PR 1128) and withdrew it unmerged when the owner''s 05:2x message showed the sentence was a stall complaint; met the owner''s quality bar in the writer instead. Left the research lane (fm-unbounded-ready-queue timing, paper-abstract-empty, research_queued_180m) with its owner and the code loop, which holds qnfo-research-exec.',
  files_changed = files_changed || ', qnfo-cloud-ops/worker.js, scripts/remediation_consumer.py, scripts/workers_standards_guard.py (+ tests), personal-companion tests, migrations/2026-10-13-24 to -32',
  commits = commits || ' #1124 #1125 #1129 #1130 #1131 #1133 #1134 #1136 #1137 #1139 #1140 #1141 #1144 #1147',
  infrastructure_changes = infrastructure_changes || '; personal-companion 1.21.3, qnfo-cloud-ops 1.26.3 live; migrations 24-31 applied ok',
  handoff_notes = 'Open at 14:15 UTC: reading.q08.org still has no piece (#2222 critical, 82 h). 1.21.3 is live; the 15:00 UTC starved retry and the 16:00 and 20:00 generation hours follow; decision COMPANION-WRITER-BAR-20261013 predicts a piece by 20:15 UTC. The writer is the Workers AI fallback gpt-oss-120b (no DeepSeek writer in use); if drafts keep failing on invented facts, the next lever is a verified background pack (q08-signal-engine 0.18.0 pattern). Code loop: HUB-CACHE-VERSION-2 (2484) waits behind the idea-hub file claim, ERRATA-INTERNAL-CONFIRM-1 behind the qnfo-research-exec claim. Research lane (session_01FuuVUWJ6awNUPJvTYmswWp inactive): fm-unbounded-ready-queue reads rows re-queued between 20-minute stamps, paper-abstract-empty one paper (research-exec 0.17.5 sweep), research_queued_180m one remediation row. Breaches left with owners or windows: code-loop success metrics (guard shipped; 7-30 day windows), q08 metrics (session_01BCB), AI run rates, reach demand, owner_dispatch history (ages out 16:20 UTC), tick_sequence history (ages out by 22:01 UTC), spofs_total 2 (second research executor and a non-GitHub CI runner), research_deferred_pool, roster_capabilities_single_executor.',
  total_tasks = 34, completed_tasks = 30, execution_ratio = 0.88,
  completed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE session_id = 'session_01Kddqwk5gQT5qSSHVKjT2EA-20261013';
