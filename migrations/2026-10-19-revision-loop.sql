-- REVISION-LOOP-1 (pillar research; qnfo-research-exec 0.26.0). Owner directive 2026-10-19: "The intent of the system is to
-- continually self-improve, self-correct, loop in more information, new information, and iterate. And I'm not seeing that
-- happen at all. So I want to see that happen."
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key IN ('revision_loop_mode', 'revision_loop_inflight', 'revision_loop_per_tick', 'revision_loop_min_age_min'); DELETE FROM analytics_metric_triggers WHERE metric_key IN ('paper_loop_revisions_24h', 'papers_awaiting_revision'); DELETE FROM metric_registry WHERE metric IN ('paper_loop_revisions_24h', 'papers_awaiting_revision'); DELETE FROM remediation_contracts WHERE class = 'fm-revision-loop-stalled'; DELETE FROM failure_modes WHERE fm_key = 'revision-loop-stalled'; DELETE FROM capability_ledger WHERE capability = 'post-publication-revision-loop'
--
-- Measured 2026-10-19 14:45Z: living-paper holds 656 published papers with a slug; 426 are at version 1.0.0 and 62 at 2.0.0.
-- Outside the claim-integrity corrections that began at 13:05Z, no published paper had changed version since 2026-10-12.
-- paper_revision_log: 347 'already-revised' (the folded reviser skips any paper at version 2 or later) and 181
-- 'needs-substantive-revision' (terminal: the substantive-remediation loop those rows defer to was never built). The
-- completeness sweep queues only cut or summary-cited papers, once per source. remediationPublish wrote version_to '2.0.0'
-- whatever the live version was. The loop below runs in qnfo-research-exec every 10-minute tick (revisionLoopTick).

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
 ('revision_loop_mode', 'on', 'REVISION-LOOP-1 (qnfo-research-exec 0.26.0): on = published pipeline papers go back through the research pipeline and publish as the next minor version; off = no new revision rows (rows in flight finish).'),
 ('revision_loop_inflight', '8', 'REVISION-LOOP-1: revision rows open in research_queue at once (0..24); backpressure against new papers, not a filter.'),
 ('revision_loop_per_tick', '1', 'REVISION-LOOP-1: revision rows queued per 10-minute tick (0..4).'),
 ('revision_loop_min_age_min', '1440', 'REVISION-LOOP-1: minutes since a paper last changed before the loop takes it again (>= 10).');

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class)
VALUES
 ('paper_loop_revisions_24h', 'outcome', 'lagging', 'paper_revision_log rows with status published and a changelog starting REVISION-LOOP-1 updated in the last 1440 minutes: published papers that came out as an improved version, written by revisionLoopTick each tick', 'qnfo-audit.paper_revision_log', '0 at 2026-10-19 14:45Z', '>= 6', 'qnfo-research-exec', 'analytics_metric_triggers paper_loop_revisions_24h -> agent_issues', '10m', '< 3', '< 1', 'PENDING', 'computed'),
 ('papers_awaiting_revision', 'operational', 'leading', 'published pipeline papers unchanged for revision_loop_min_age_min minutes with no open remediation row, no pending version and fewer than 3 failed tries at their version: the revision loop backlog, written by revisionLoopTick each tick', 'living-paper.papers + qnfo-audit.research_queue', 'about 450 at 2026-10-19 14:45Z', 'falling', 'qnfo-research-exec', 'analytics_metric_triggers papers_awaiting_revision -> agent_issues', '10m', '> 500', '> 650', 'PENDING', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES
 ('paper_loop_revisions_24h', 'No published paper came out as a revised version in the last 24 hours', 'registry', 'lt', 1, 2,
 'Pillar research (REVISION-LOOP-1). revisionLoopTick in qnfo-research-exec queues published papers into research_queue (source remediation, source_id revision:<slug>@<version>#<try>) and remediationPublish hands each finished rewrite to version_queue as the next minor version. Read: SELECT status, stage, COUNT(*) FROM research_queue WHERE source_id LIKE ''revision:%'' GROUP BY 1, 2; and cloud_ops_events kind revision-loop. No rows = the tick is not queueing (ops_config revision_loop_mode, RESEARCH_HALT, revision_loop_inflight 0). Rows stuck at a stage = the pipeline stage is failing for remediation rows (read their error). version_queue gate-blocked = publishV2 held the revision (gov_gate_log). Raise revision_loop_inflight (max 24) when rows only wait. Done: paper_loop_revisions_24h >= 1 at two refreshes.',
 'qnfo-research-exec', 'agent_issues', 2, 1, 'REVISION-LOOP-1 (migrations/2026-10-19-revision-loop.sql); first revisions need several pipeline hours after the deploy'),
 ('papers_awaiting_revision', 'The revision loop backlog keeps growing', 'registry', 'gt', 650, 3,
 'Pillar research (REVISION-LOOP-1). More published pipeline papers wait for a revision than the corpus held at launch. The loop is too slow for the publish rate: raise ops_config revision_loop_inflight (max 24) or revision_loop_per_tick (max 4), or lengthen revision_loop_min_age_min so each paper is revisited less often. Done: papers_awaiting_revision <= 650 at two refreshes.',
 'qnfo-research-exec', 'agent_issues', 6, 1, 'REVISION-LOOP-1 (migrations/2026-10-19-revision-loop.sql)');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius) VALUES
 ('revision-loop-stalled', 'published papers stay at their first version: nothing re-reads them against new literature or improves them after publication', 'every post-publication path was rule-triggered and one-shot (the folded reviser logs each paper once and skips version 2+, the completeness sweep blocks a second remediation per source), and remediationPublish wrote a fixed 2.0.0, so a later rewrite of a 2.x paper never showed as a new version', 'qnfo-research-exec 0.26.0 REVISION-LOOP-1: revisionLoopTick queues published pipeline papers back through the pipeline every tick on a rate; remediationPublish computes the next version and writes a Version History; publishV2 archives the replaced text in living-paper paper_version_history', 'remediation_contracts fm-revision-loop-stalled (d1-query, hourly)', 'fm-revision-loop-stalled', '2026-10-19', 'no revision row open in research_queue while revision_loop_mode is on', 'every paper version 1.0.0 for weeks; the owner reads weak papers that never improve', 'every published pipeline paper on papers.qnfo.org');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-revision-loop-stalled', NULL, 'revision_loop_mode on and no revision row open in research_queue', 'qnfo-research-exec revisionLoopTick queues the next paper on its next tick; when it does not, read cloud_ops_events kind revision-loop', 'SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = ''revision_loop_mode''), ''on'') = ''off'' THEN ''ok'' WHEN (SELECT COUNT(*) FROM research_queue WHERE source = ''remediation'' AND source_id LIKE ''revision:%'' AND status IN (''queued'', ''researching'', ''review'')) > 0 THEN ''ok'' WHEN (SELECT COUNT(*) FROM migration_runs WHERE file = ''migrations/2026-10-19-revision-loop.sql'' AND applied_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) > 0 THEN ''ok'' ELSE ''stalled'' END AS observed', 'd1-query', 3, 'qnfo-research-exec', 1, 'active', 'failure-mode');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('post-publication-revision-loop', 'migrations/2026-10-19-revision-loop.sql (REVISION-LOOP-1, qnfo-research-exec 0.26.0)', 'qnfo-research-exec 10-minute cron and its research pipeline (ground, ensemble, reconcile, review, revise, verify, claim gate, publishV2), living-paper papers',
 'measured every 10 minutes: paper_loop_revisions_24h, papers_awaiting_revision; hourly detector fm-revision-loop-stalled',
 strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
 'every published pipeline paper is periodically re-researched against current literature, re-reviewed and re-verified, and published as the next minor version with a Version History; earlier texts stay readable (GET https://qnfo-research-exec.q08.workers.dev/revision-loop, /paper-versions?slug=)');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
VALUES ('session REVISION-LOOP-1', 'The research pipeline that writes new papers, given the live paper as the text under revision and a fresh literature search, produces a better version, and its review, verify and claim gates hold a revision to the same bar as a first publication; hand-written papers by the owner are not the loop''s to rewrite',
 'Queue one published pipeline paper per 10-minute tick (at most 8 open), gate failures and the longest-unchanged first, back through the full pipeline; publish it as the next minor version with a Version History and a measured change summary; keep the replaced text in paper_version_history; compute every rewrite''s version from the live one',
 'owner directive 2026-10-19; 426 published papers at 1.0.0; 181 needs-substantive-revision and 347 already-revised terminal rows; remediationPublish fixed version_to 2.0.0',
 'pending', 'public papers on papers.qnfo.org (bodies and versions), research pipeline capacity shared with new papers',
 'ops_config revision_loop_mode = off stops new rows; an earlier text is restored from living-paper paper_version_history (title, abstract, body_md, version); revert the PR for the code',
 'post-publication-revision-loop', 'paper_loop_revisions_24h >= 1 within 24 h of the deploy and >= 6 within 72 h; no revision publishes past the claim gate with a fabricated claim', 'readers see papers improve and carry their history', 'rule-triggered reviser, completeness sweep, thin prior work, errata routing, claim integrity (all one-shot); the full pipeline as the reviser');
