-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_content_pipeline_view
-- Rollback: DROP VIEW IF EXISTS v_content_pipeline, then run the sql column of bak_20261026_content_pipeline_view (the view as it was). DROP INDEX IF EXISTS idx_errata_queue_subject. Un-merge research_queue with UPDATE research_queue SET status = (SELECT b.status FROM bak_20261026_errata_remediation_merge b WHERE b.id = research_queue.id), idea = (SELECT b.idea FROM bak_20261026_errata_remediation_merge b WHERE b.id = research_queue.id), error = (SELECT b.error FROM bak_20261026_errata_remediation_merge b WHERE b.id = research_queue.id) WHERE id IN (SELECT id FROM bak_20261026_errata_remediation_merge). Then DROP TABLE IF EXISTS errata_remediation_merges, remove the failure_modes rows content-sla-misattributed and errata-remediation-duplicate with their remediation_contracts rows fm-content-sla-misattributed and fm-errata-remediation-duplicate, close the two RB-ERRATA-SHARE-1 and CLAIM-ERRATA-SHARE-1 issues, and restore metric_registry.formula of content_items_over_stage_sla by cutting the CONTENT-PIPELINE-SLA-1 sentence.
--
-- CONTENT-PIPELINE-SLA-1 (2026-10-26, charter pillar research; agent_issues 100456 and 1000293; metric content_items_over_stage_sla 2479, target 0).
-- Owner, 2026-10-26: "CONTINUE TO IDENTIFY, AUDIT, AND REMEDIATE ALL FLEET BREACHES."
--
-- WHAT WAS READ (qnfo-audit, 2026-10-26 17:50-18:30Z, before this file)
--   content_items_over_stage_sla = SUM(over_sla) of v_content_pipeline = 2479. By flow, state and status (over SLA, 120 minutes):
--     internal-errata open 727            the source-of-truth row of an erratum (internal_errata)
--     errata internal-open 526 + detected 143 + audited 20      the queue row of the same errata (errata_queue)
--     revision, outcome statuses 454      thin-prior-work-rejected 143, claim-withdrawn 106, integrity-restored 95, claim-corrected 73,
--                                         claim-retracted 31, thin-prior-work-skipped 6: finished log rows, aged up to 175 hours
--     revision loop-revision-queued 131, thin-prior-work-queued 21, flagged 4, research queued/deferred 412, idea 25, others
--   Defect 1, one erratum counted twice. 751 of the 761 open internal_errata rows have an errata_queue row whose subject is the erratum id
--     (556 internal-open, 195 detected or audited, none terminal), so the same erratum is a waiting item in flow internal-errata and in flow
--     errata. The queue row is the one a loop acts on (confirm, respond, route); the internal_errata row waits for the same event.
--   Defect 2, finished log rows counted as stuck. paper_revision_log is an event log. Its statuses claim-corrected, claim-retracted,
--     claim-withdrawn and integrity-restored are written by the claim-integrity sweep and the notice repair AFTER the paper was changed
--     (ciErrata, noticeRepairTick in qnfo-research-exec); thin-prior-work-rejected and thin-prior-work-skipped record a finished attempt of
--     the prior-work step and only throttle its retry (thinCandidates reads them as "tried recently"). No loop selects any of the six to
--     act on it. v_content_pipeline mapped every status it did not list to state waiting, so 454 finished rows aged for ever past the
--     120-minute stage SLA and could never leave. thin-prior-work-queued, loop-revision-queued and flagged stay waiting: a loop reads them.
--   Defect 3, one rewrite per erratum (the cost side of the same backlog). ERRATA-HIGHRISK-ROUTE-1 inserts one remediation research row per
--     routed erratum: 233 open rows over 149 papers, 84 of them a second to sixth full rewrite of a paper another row rewrites (paper
--     'stability' 4 rows, the-g-delian-boundary... 6 rows). None has ever been claimed (one "claimed errata:" event since 2026-10-18).
--     At 12k to 50k neurons a pass, 84 rewrites are 1M to 4M neurons, 3 to 12 days of the whole COST-SUSTAIN-1 budget (360,000 a day).
--     agent_issues 1000293 (ERRATA-ROUTE-PER-PAPER-1) owns the routing code; this file merges the rows that exist now.
--
-- WHAT THIS FILE DOES
--   1. v_content_pipeline is re-created with the same columns in the same order. (a) The six finished revision statuses map to done
--      (published stage for claim-corrected and integrity-restored) or rejected (rejected stage for claim-retracted, claim-withdrawn and the
--      two thin-prior-work outcomes), the stage and state vocabulary the view already uses, so they list as finished and leave the SLA.
--      (b) A flow internal-errata row keeps its place in the list and its state, but its over_sla is 0 while an errata_queue row with
--      email_id NULL and subject = its id exists: the queue row carries the SLA, the item is counted once. An internal_errata row without a
--      queue row (10 now) still counts. idx_errata_queue_subject keeps that lookup cheap (the unindexed form read 3.2M rows).
--   2. errata_remediation_merges (new, an audit table): for each paper with two or more unstarted errata remediation rows (source
--      remediation, source_id errata:%, status queued or deferred, claimed_at NULL, attempt 0, stage NULL or ground) the oldest queued one
--      survives and takes every sibling's erratum text as a [ERRATA-ROUTE-PER-PAPER-1 merged errata:N] line in its idea; a sibling is set to
--      status wontfix with the survivor id in error ONLY when that line is present in the survivor, so no erratum text is lost. The
--      pipeline rewrites the paper once with every erratum in its brief. A row already claimed, past ground, or not an errata row is
--      never touched, a survivor claimed before this file ran is not edited (its siblings stay), and the file is idempotent.
--      The erratum rows themselves (errata_queue, errata_actions, internal_errata) are not touched.
--   3. Two failure modes with d1-query detectors (fm-content-sla-misattributed, fm-errata-remediation-duplicate) so a regression shows
--      within the hour, and two issues for the part this file cannot do: RB-ERRATA-SHARE-1 (qnfo-fleet-control) and CLAIM-ERRATA-SHARE-1
--      (qnfo-research-exec). Read 2026-10-26 18:00Z: all 192 rows in status queued are remediation rows (174 errata, 18 completeness and
--      revision) and research_ready_cap is 192, so the ready queue is full of rows the executor ranks last (claimNew puts aged proposals
--      and resumable stages first), proposals are bumped to deferred 5 to 9 an hour and research_deferred_pool grew 181 to 249 in ten hours.
--
-- WHAT IT DOES NOT DO (INTEGRITY-GUARDS-1, OUTPUT-QUALITY-LEDGER-1)
--   No erratum, issue or paper is closed, rejected or hidden by this file. The errata backlog stays in flow errata: about 700 queue rows (526
--   internal-open, 143 detected, 20 audited at 17:50Z) are still past their SLA and waiting on the confirm rate (errata_confirm_max 12 an hour, held at
--   12 by BREACH-SELFHEAL-1 while research budget spent today is 414,499 of 360,000 neurons) and the respond/route rate (5 an hour).
--   The metric steps down by the finished log rows (454) and the double count (737 internal-errata rows over SLA, every one with a queue row), 2500
--   at 18:30Z to about 1,310, at the first tick after apply. That is a correction of
--   what is counted, not remediation; the remaining breach is real throughput, and papers_with_open_high_errata_pct (61.1) is unchanged.
-- spof-review: no new cron, binding or credential. One view and one index replaced or added, one audit table, four rows of registry text.

-- 0. Backups (BACKUP-CREATES-1): the view text, and every errata remediation row that can be merged.
CREATE TABLE IF NOT EXISTS bak_20261026_content_pipeline_view AS
  SELECT name, sql, datetime('now') AS saved_at FROM sqlite_master WHERE name = 'v_content_pipeline';
CREATE TABLE IF NOT EXISTS bak_20261026_errata_remediation_merge AS
  SELECT * FROM research_queue WHERE source = 'remediation' AND source_id LIKE 'errata:%' AND status IN ('queued', 'deferred');

-- 1. The mirror lookup, then the view (text read from qnfo-audit 2026-10-26, same columns in the same order).
CREATE INDEX IF NOT EXISTS idx_errata_queue_subject ON errata_queue(subject);
DROP VIEW IF EXISTS v_content_pipeline;
CREATE VIEW v_content_pipeline AS
SELECT p.property, p.flow, p.item_id, p.title, p.raw_status, p.stage, p.state,
  strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE((SELECT MAX(e.ts) FROM content_stage_events e WHERE e.flow = p.flow AND e.item_id = p.item_id), p.since_fallback)) AS since,
  ROUND((julianday('now') - julianday(COALESCE((SELECT MAX(e.ts) FROM content_stage_events e WHERE e.flow = p.flow AND e.item_id = p.item_id), p.since_fallback))) * 24, 1) AS age_h,
  s.sla_min,
  CASE WHEN p.state IN ('waiting', 'active', 'held', 'blocked') AND s.sla_min IS NOT NULL
        AND (julianday('now') - julianday(COALESCE((SELECT MAX(e.ts) FROM content_stage_events e WHERE e.flow = p.flow AND e.item_id = p.item_id), p.since_fallback))) * 1440 > s.sla_min
        AND NOT (p.flow = 'internal-errata' AND EXISTS (SELECT 1 FROM errata_queue m WHERE m.subject = p.item_id AND +m.email_id IS NULL))
       THEN 1 ELSE 0 END AS over_sla
FROM (
  SELECT * FROM (
    SELECT 'papers.qnfo.org' AS property, 'research' AS flow, CAST(q.id AS TEXT) AS item_id, substr(COALESCE(q.idea, q.paper_slug, q.id), 1, 160) AS title,
      q.status || CASE WHEN q.stage IS NULL THEN '' ELSE '/' || q.stage END AS raw_status,
      CASE WHEN q.status = 'published' THEN 'published'
           WHEN q.status = 'wontfix' OR q.stage = 'parked' THEN 'rejected'
           WHEN q.status IN ('queued', 'deferred') AND q.claimed_at IS NULL AND COALESCE(q.stage, 'ground') = 'ground' THEN 'queued'
           WHEN COALESCE(q.stage, 'ground') = 'ground' THEN 'research'
           WHEN q.stage IN ('ensemble', 'reconcile', 'complete') THEN 'draft'
           WHEN q.stage IN ('review', 'verify', 'gate') THEN 'review'
           WHEN q.stage = 'revise' THEN 'revise'
           WHEN q.stage IN ('publish', 'done') THEN 'publish'
           ELSE 'research' END AS stage,
      CASE WHEN q.status = 'published' THEN 'done'
           WHEN q.status = 'wontfix' OR q.stage = 'parked' THEN 'rejected'
           WHEN q.status = 'held' THEN 'held'
           WHEN q.status IN ('failed', 'error', 'gate-blocked') THEN 'blocked'
           WHEN q.status IN ('queued', 'deferred') THEN 'waiting'
           ELSE 'active' END AS state,
      CASE WHEN q.status = 'published' THEN COALESCE(q.published_at, q.completed_at, q.created_at)
           WHEN q.status = 'queued' THEN COALESCE((SELECT r.ready_at FROM research_ready r WHERE r.id = q.id), q.created_at)
           ELSE COALESCE(q.claimed_at, q.created_at) END AS since_fallback
    FROM research_queue q
    UNION ALL
    SELECT 'idea-hub', 'idea', CAST(i.id AS TEXT),
      CASE WHEN i.name LIKE 'auto-%' OR i.name LIKE 'intake:%' OR i.name = 'think-loop' THEN substr(COALESCE(i.idea, ''), 1, 160)
           ELSE '(' || COALESCE(NULLIF(i.name, ''), 'submitted') || ' idea ' || i.id || ')' END, i.status,
      CASE WHEN i.status IN ('new') THEN 'intake' WHEN i.status = 'rejected' THEN 'rejected' ELSE 'triage' END,
      CASE WHEN i.status = 'new' THEN 'waiting'
           WHEN i.status IN ('deferred_budget', 'deferred_diversity') THEN 'held'
           WHEN i.status = 'triaged_hold' THEN 'parked'
           WHEN i.status IN ('triaged_accepted', 'ensemble-registered') THEN 'done'
           WHEN i.status = 'rejected' THEN 'rejected'
           ELSE 'waiting' END,
      COALESCE(i.triaged_at, i.created_at)
    FROM idea_proposals i
    UNION ALL
    SELECT 'papers.qnfo.org', 'version', CAST(v.id AS TEXT), substr(COALESCE(v.title, v.slug, ''), 1, 160), v.status,
      CASE WHEN v.status = 'queued' THEN 'revise' WHEN v.status IN ('drafted', 'gate-blocked') THEN 'review' WHEN v.status = 'publishing' THEN 'publish'
           WHEN v.status = 'published' THEN 'published' WHEN v.status = 'wontfix' THEN 'rejected' ELSE 'revise' END,
      CASE WHEN v.status = 'queued' THEN 'waiting' WHEN v.status IN ('drafted', 'publishing') THEN 'active' WHEN v.status IN ('gate-blocked', 'error') THEN 'blocked'
           WHEN v.status = 'published' THEN 'done' WHEN v.status = 'wontfix' THEN 'rejected' ELSE 'waiting' END,
      COALESCE(v.updated_at, v.created_at)
    FROM version_queue v
  )
  UNION ALL
  SELECT * FROM (
    SELECT 'papers.qnfo.org', 'revision', CAST(r.id AS TEXT), substr(COALESCE(r.title, r.slug, ''), 1, 160), r.status,
      CASE WHEN r.status IN ('already-revised', 'published', 'claim-corrected', 'integrity-restored') THEN 'published' WHEN r.status IN ('wontfix', 'claim-retracted', 'claim-withdrawn', 'thin-prior-work-rejected', 'thin-prior-work-skipped') THEN 'rejected' WHEN r.status = 'quarantined' THEN 'review' ELSE 'revise' END,
      CASE WHEN r.status IN ('already-revised', 'published', 'claim-corrected', 'integrity-restored') THEN 'done' WHEN r.status IN ('wontfix', 'claim-retracted', 'claim-withdrawn', 'thin-prior-work-rejected', 'thin-prior-work-skipped') THEN 'rejected'
           WHEN r.status IN ('needs-substantive-revision', 'quarantined') THEN 'parked' ELSE 'waiting' END,
      COALESCE(r.updated_at, r.created_at)
    FROM paper_revision_log r
    UNION ALL
    SELECT 'papers.qnfo.org', 'errata', CAST(x.id AS TEXT), substr(COALESCE(x.subject, x.claim, ''), 1, 160), x.status,
      CASE WHEN x.status IN ('rejected', 'no-paper') THEN 'rejected' ELSE 'correct' END,
      CASE WHEN x.status IN ('published', 'resolved', 'implemented', 'closed') THEN 'done' WHEN x.status IN ('rejected', 'no-paper') THEN 'rejected'
           WHEN x.status = 'error' THEN 'blocked' WHEN x.status = 'audited' THEN 'active' ELSE 'waiting' END,
      COALESCE(x.updated_at, x.created_at)
    FROM errata_queue x
    UNION ALL
    SELECT 'papers.qnfo.org', 'internal-errata', CAST(n.id AS TEXT), substr(COALESCE(n.claim_text, n.target_ref, ''), 1, 160), n.status,
      CASE WHEN n.status = 'rejected' THEN 'rejected' ELSE 'correct' END,
      CASE WHEN n.status IN ('resolved', 'closed') THEN 'done' WHEN n.status = 'rejected' THEN 'rejected' ELSE 'waiting' END,
      COALESCE(n.updated_at, n.detected_at)
    FROM internal_errata n
  )
  UNION ALL
  SELECT * FROM (
    SELECT 'social', 'social-thread', CAST(t.id AS TEXT), substr(COALESCE(t.title, t.slug, ''), 1, 160), t.status,
      CASE WHEN t.status IN ('rejected', 'suppressed') THEN 'rejected' ELSE 'distribute' END,
      CASE WHEN t.status = 'posted' THEN 'done' WHEN t.status IN ('rejected', 'suppressed') THEN 'rejected'
           WHEN t.status IN ('failed', 'link-dead', 'misrouted') THEN 'blocked' WHEN t.status = 'posting' THEN 'active' ELSE 'waiting' END,
      CASE WHEN t.status = 'posted' THEN COALESCE(t.posted_at, t.updated_at, t.created_at) ELSE COALESCE(t.updated_at, t.created_at) END
    FROM social_threads t
    UNION ALL
    SELECT 'social', 'dissemination', CAST(d.id AS TEXT), substr(COALESCE(d.channel || ': ', '') || COALESCE(d.paper_title, d.paper_slug, ''), 1, 160), d.action,
      CASE WHEN d.action IN ('suppressed', 'link-dead', 'misrouted') THEN 'rejected' ELSE 'distribute' END,
      CASE WHEN d.action IN ('posted', 'done') THEN 'done' WHEN d.action IN ('suppressed', 'link-dead', 'misrouted') THEN 'rejected'
           WHEN d.action = 'post-unverified' THEN 'parked' WHEN d.action IN ('failed', 'held') THEN 'blocked' WHEN d.action = 'posting' THEN 'active' ELSE 'waiting' END,
      CASE WHEN d.action IN ('posted', 'done') THEN COALESCE(d.posted_at, d.updated_at, d.created_at) ELSE d.created_at END
    FROM dissemination_tracker d
  )
) p
LEFT JOIN content_stages s ON s.stage = p.stage;

-- 2. Merge the unstarted errata remediation rows of one paper into one.
CREATE TABLE IF NOT EXISTS errata_remediation_merges (sibling_id TEXT PRIMARY KEY, survivor_id TEXT NOT NULL, paper_slug TEXT, sibling_source_id TEXT,
  merged_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
INSERT OR IGNORE INTO errata_remediation_merges (sibling_id, survivor_id, paper_slug, sibling_source_id)
SELECT r.id,
  (SELECT s.id FROM research_queue s WHERE s.source = 'remediation' AND s.source_id LIKE 'errata:%' AND s.status IN ('queued', 'deferred') AND s.claimed_at IS NULL
     AND COALESCE(s.attempt, 0) = 0 AND (s.stage IS NULL OR s.stage = 'ground') AND s.paper_slug = r.paper_slug
     ORDER BY (s.status = 'queued') DESC, s.created_at ASC, s.id ASC LIMIT 1),
  r.paper_slug, r.source_id
FROM research_queue r
WHERE r.source = 'remediation' AND r.source_id LIKE 'errata:%' AND r.status IN ('queued', 'deferred') AND r.claimed_at IS NULL
  AND COALESCE(r.attempt, 0) = 0 AND (r.stage IS NULL OR r.stage = 'ground') AND r.paper_slug IS NOT NULL AND r.paper_slug <> ''
  AND r.id <> (SELECT s.id FROM research_queue s WHERE s.source = 'remediation' AND s.source_id LIKE 'errata:%' AND s.status IN ('queued', 'deferred') AND s.claimed_at IS NULL
     AND COALESCE(s.attempt, 0) = 0 AND (s.stage IS NULL OR s.stage = 'ground') AND s.paper_slug = r.paper_slug
     ORDER BY (s.status = 'queued') DESC, s.created_at ASC, s.id ASC LIMIT 1);

-- The survivor takes every sibling's erratum line (once: the marker stops a second run).
UPDATE research_queue SET idea = substr(COALESCE(idea, '') || char(10) ||
  (SELECT group_concat('[ERRATA-ROUTE-PER-PAPER-1 merged ' || s.source_id || '] ' || substr(s.idea, instr(s.idea, ' for erratum ') + 5), char(10))
     FROM research_queue s JOIN errata_remediation_merges m ON m.sibling_id = s.id
     WHERE m.survivor_id = research_queue.id AND s.status IN ('queued', 'deferred') AND s.claimed_at IS NULL AND COALESCE(s.attempt, 0) = 0), 1, 12000)
WHERE id IN (SELECT survivor_id FROM errata_remediation_merges) AND status IN ('queued', 'deferred') AND claimed_at IS NULL AND COALESCE(attempt, 0) = 0
  AND instr(COALESCE(idea, ''), '[ERRATA-ROUTE-PER-PAPER-1 merged ') = 0
  AND EXISTS (SELECT 1 FROM research_queue s JOIN errata_remediation_merges m ON m.sibling_id = s.id
     WHERE m.survivor_id = research_queue.id AND s.status IN ('queued', 'deferred') AND s.claimed_at IS NULL AND COALESCE(s.attempt, 0) = 0);

-- A sibling leaves the queue only when its line is in the survivor's idea.
UPDATE research_queue SET status = 'wontfix',
  error = 'ERRATA-ROUTE-PER-PAPER-1 merged into ' || (SELECT m.survivor_id FROM errata_remediation_merges m WHERE m.sibling_id = research_queue.id)
    || ' at ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' (was ' || status || '): the text of this erratum is a line of that row''s idea, so the paper is rewritten once with every erratum in its brief. Revert: status ' || status || ', row kept in bak_20261026_errata_remediation_merge'
WHERE id IN (SELECT sibling_id FROM errata_remediation_merges) AND status IN ('queued', 'deferred') AND claimed_at IS NULL AND COALESCE(attempt, 0) = 0
  AND EXISTS (SELECT 1 FROM errata_remediation_merges m JOIN research_queue v ON v.id = m.survivor_id
     WHERE m.sibling_id = research_queue.id AND instr(COALESCE(v.idea, ''), '[ERRATA-ROUTE-PER-PAPER-1 merged ' || research_queue.source_id || ']') > 0);

-- 3. Detectors. A regression of either defect, or a new duplicate, reads non-zero within the hour.
INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id,
  trigger_condition, symptom, blast_radius) VALUES
('content-sla-misattributed',
 'content_items_over_stage_sla counts an item that is not waiting: a finished log row, or the second row of one erratum',
 'v_content_pipeline listed every status it did not know as waiting, so finished paper_revision_log rows aged past the stage SLA for ever, and it listed an erratum twice (internal_errata and its errata_queue row) with an SLA on each',
 'CONTENT-PIPELINE-SLA-1: the six finished revision statuses map to done or rejected, and an internal-errata row with an errata_queue mirror carries no SLA of its own',
 'no over_sla row in flow revision with a finished status, and none in flow internal-errata that has an errata_queue row with email_id NULL',
 'fm-content-sla-misattributed', '2026-10-26', 100456,
 'a new paper_revision_log outcome status the view does not list, or a second mirror row for one erratum',
 'content_items_over_stage_sla read 2500 with 454 finished log rows and 737 internal_errata rows that duplicate a queue row',
 'content_items_over_stage_sla, v_sla_over_120m.content_items_over_sla, sla_breaches_over_120m, the dashboard /content page');
INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id,
  trigger_condition, symptom, blast_radius) VALUES
('errata-remediation-duplicate',
 'two or more unstarted errata remediation rows rewrite the same paper',
 'routeHighRiskErrata inserts one research_queue row per routed erratum, so a paper with six confirmed errata is rewritten up to six times through the whole pipeline',
 'ERRATA-ROUTE-PER-PAPER-1 (agent_issues 1000293): one open row per paper listing every erratum; CONTENT-PIPELINE-SLA-1 merged the 84 that existed on 2026-10-26',
 'no paper has two unstarted source remediation, source_id errata:% rows in status queued or deferred',
 'fm-errata-remediation-duplicate', '2026-10-26', 1000293,
 'a second erratum of a paper is routed while an unstarted errata row of that paper exists',
 '233 open errata remediation rows over 149 papers on 2026-10-26, none ever claimed',
 'the daily neuron budget (COST-SUSTAIN-1), the research ready queue, research_deferred_pool');
INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts,
  escalate_to, expected_cadence_h, status, ts, module, budget_ms, max_items, requires_container, attempts, next_due_at) VALUES
('fm-content-sla-misattributed', NULL, 'CONTENT-PIPELINE-SLA-1', 'failure-mode detector',
 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_content_pipeline v WHERE v.over_sla = 1 AND ((v.flow = ''revision'' AND v.raw_status IN (''claim-corrected'', ''claim-retracted'', ''claim-withdrawn'', ''integrity-restored'', ''thin-prior-work-rejected'', ''thin-prior-work-skipped'')) OR (v.flow = ''internal-errata'' AND EXISTS (SELECT 1 FROM errata_queue m WHERE m.subject = v.item_id AND +m.email_id IS NULL)))) AS TEXT) AS observed',
 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'), 'failure-mode', 45000, 5, 0, 0, datetime('now'));
INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts,
  escalate_to, expected_cadence_h, status, ts, module, budget_ms, max_items, requires_container, attempts, next_due_at) VALUES
('fm-errata-remediation-duplicate', 1000293, 'CONTENT-PIPELINE-SLA-1', 'failure-mode detector',
 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT paper_slug FROM research_queue WHERE source = ''remediation'' AND source_id LIKE ''errata:%'' AND status IN (''queued'', ''deferred'') AND claimed_at IS NULL AND COALESCE(attempt, 0) = 0 AND (stage IS NULL OR stage = ''ground'') AND paper_slug IS NOT NULL AND paper_slug <> '''' GROUP BY paper_slug HAVING COUNT(*) > 1)) AS TEXT) AS observed',
 'd1-query', 3, 'qnfo-research-exec', 1, 'active', datetime('now'), 'failure-mode', 45000, 5, 0, 0, datetime('now'));

-- 4. What the step down means (INTEGRITY-GUARDS-1): a correction of what is counted, not a remediation.
UPDATE metric_registry SET formula = formula || '; CONTENT-PIPELINE-SLA-1 (2026-10-26): finished paper_revision_log outcome rows are done or rejected, and an internal_errata row whose errata_queue row exists carries no SLA of its own, so each erratum counts once, in flow errata'
WHERE metric = 'content_items_over_stage_sla' AND instr(formula, 'CONTENT-PIPELINE-SLA-1') = 0;

-- 5. Evidence for the owner of the routing code (agent_issues 1000293 is claimed by another session, so the numbers go on the issue).
UPDATE agent_issues SET description = description || char(10) || char(10) || 'SESSION-RESEARCH-ERRATA 2026-10-26 18:30Z (read live): the routing creates one full rewrite per erratum: 233 open errata remediation rows over 149 papers, 84 redundant ("stability" 4 rows, "the-g-delian-boundary-as-a-generative-phase-transition-optimal-operating-points-" 6), none claimed since 2026-10-18 (one "claimed errata:" event in 8 days). CONTENT-PIPELINE-SLA-1 (migrations/2026-10-26-content-pipeline-sla-attribution.sql) merged the unstarted ones that existed at its apply into the oldest queued row of each paper (lines [ERRATA-ROUTE-PER-PAPER-1 merged errata:N] in idea; siblings status wontfix with the survivor id in error; table errata_remediation_merges). The routing code still needs: look up an unstarted row of the paper (status queued or deferred, claimed_at NULL, attempt 0, stage NULL or ground, source_id errata:%) before the INSERT and append the erratum to its idea (same marker and 12000-char cap) instead of inserting; insert only when none exists or the paper''s row is already in flight; never merge into or out of a started row. The detector fm-errata-remediation-duplicate reads the duplicates and closes this issue''s DoD when it reads 0 after the code lands. Do not close internal_errata at routing to hide the open count: papers_with_open_high_errata_pct 61.1 is a count of unfixed papers.'
WHERE id = 1000293 AND instr(description, 'SESSION-RESEARCH-ERRATA 2026-10-26') = 0;

-- 6. The two issues for what a data file cannot do.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RB-ERRATA-SHARE-1: 174 never-claimed errata remediation rows fill the whole research ready queue (cap 192), so proposals are bumped to deferred every hour',
  'Charter pillar: research. MEASURED 2026-10-26 18:00Z (qnfo-audit): research_queue status queued = 192 rows, all source remediation (174 source_id errata:%, 18 completeness: or revision:); research_ready_cap = 192 (ops_config, 2026-10-24); research-backpressure events: "deferred 5-9, released 0, queued 192" every hour from 07:40 to 17:40 and research_deferred_pool 181 -> 249 in those ten hours (+7 an hour). 183 proposals wait in status deferred (164 + 11 + 5 + 3 by stage). RB_ORDER_SQL (qnfo-fleet-control researchBackpressureTick) ranks source remediation first, so every errata row routed by ERRATA-HIGHRISK-ROUTE-1 (about 5 an hour) outranks and displaces a proposal; claimNew (qnfo-research-exec) ranks aged proposals, resumable stages and idea/chat sources ahead of a remediation row at stage ground, so the errata rows are never claimed (one "claimed errata:" event since 2026-10-18) and hold their slots for ever. Only rows queued before the queue filled get claimed (the proposals queued at 00:00 UTC were claimed 00:01-04:13 and the budget was spent by 04:32), so once those are gone the next claim is an errata rewrite: the next daily budget (360,000 neurons, about 8 passes) would go to rewrites of published papers while 183 proposals wait deferred. Not a budget problem (COST-SUSTAIN-1 holds): an allocation that nobody chose, a consequence of RESEARCH-BACKPRESSURE-1 (2026-10-13, when remediation rows were a handful) meeting ERRATA-HIGHRISK-ROUTE-1 (2026-10-18, 233 rows).' || char(10) || char(10) ||
  'Lever (default approve, reversible by ops_config): in rbPlan / RB_ORDER_SQL cap the rows of source remediation with source_id errata:% in status queued at floor(research_ready_cap * errata_ready_share), ops_config errata_ready_share default 0.5, 0 or off restores today''s order; the errata rows beyond the cap wait in status deferred (visible in research_deferred_pool, released by priority as slots free), proposals fill the rest of the ready queue. Prediction: queued errata rows <= 96, queued proposals >= 90 within two ticks, research_ready events show released > 0, research_deferred_pool no longer grows by 7 an hour. Measure with the closing probe; keep it if no guard worsens, otherwise revert. The share of executor claims that go to errata rows is CLAIM-ERRATA-SHARE-1 (qnfo-research-exec), the companion issue.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js' || char(10) ||
  'code-anchor: var RB_ORDER_SQL = ' || char(10) ||
  'code-probe: {"paths": ["qnfo-fleet-control/worker.js"], "contains": "RB-ERRATA-SHARE-1"}',
  'session-research-errata', 'research', 'high', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE instr(title, 'RB-ERRATA-SHARE-1:') = 1);
UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'content-pipeline-sla-1', expected_cadence_h = 1, max_attempts = 3,
  precondition = 'CONTENT-PIPELINE-SLA-1: the probe reads the live queue', action = 'the doer changes the code on main; scripts/remediation_consumer.py reads the queue and a pass closes the issue',
  verify_probe = 'SELECT ''0'' AS expected, CAST(CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE source = ''proposal'' AND status = ''deferred'') > 0 AND (SELECT COUNT(*) FROM research_queue WHERE source = ''remediation'' AND source_id LIKE ''errata:%'' AND status = ''queued'') * 2 > (SELECT COUNT(*) FROM research_queue WHERE status = ''queued'') THEN 1 ELSE 0 END AS TEXT) AS observed'
WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE instr(title, 'RB-ERRATA-SHARE-1:') = 1);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'CLAIM-ERRATA-SHARE-1: claimNew never claims an errata remediation row while any proposal or resumable row is queued, so a corrected paper waits for ever',
  'Charter pillar: research. MEASURED 2026-10-26 18:00Z: 233 open errata remediation rows (149 papers after CONTENT-PIPELINE-SLA-1), oldest created 2026-10-18, none ever claimed; cloud_ops_events kind claim, text "claimed errata:%": 1 event on 2026-10-18, 0 on every later day (claims per day 392, 386, 346, 148, 88, 72, 63, 29, 26 for proposals and revision rows). claimNew orders: aged proposals with attempt 0 first, then revision: rows, then resumable stages, then idea/chat/operator-prime sources, then rows older than 72 h oldest first, then score. An errata row (stage ground or NULL, score 0.95) is never first while any proposal or resumable row is queued; RB-ERRATA-SHARE-1 is the companion that decides how many of them are queued at all.' || char(10) || char(10) ||
  'Lever (default approve): rank an errata remediation row (source remediation, source_id errata:%) older than 72 h in the same first tier as an aged proposal, so the two are served oldest first (QUEUE-ANTISTARVATION-1''s own rule), instead of last. The paper is then corrected after the wait its age earned, not never, and a rewrite no longer waits behind every new proposal. Prediction: at least one claimed errata: event in the 7 days after the deploy (the closing probe), and the errata rows no longer wait longer than the oldest proposal. ops_config research_errata_claim = off restores today''s order. Guard: publish_rate_ratio_24h and the neurons per published paper (v_breach_selfheal publish-collapse) must not worsen for two days, otherwise revert.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
  'code-anchor: async function claimNew(env) {' || char(10) ||
  'code-probe: {"paths": ["qnfo-research-exec/worker.js"], "contains": "CLAIM-ERRATA-SHARE-1"}',
  'session-research-errata', 'research', 'high', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE instr(title, 'CLAIM-ERRATA-SHARE-1:') = 1);
UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now'), module = 'content-pipeline-sla-1', expected_cadence_h = 1, max_attempts = 3,
  precondition = 'CONTENT-PIPELINE-SLA-1: the probe reads the live queue', action = 'the doer changes the code on main; scripts/remediation_consumer.py reads the queue and a pass closes the issue',
  verify_probe = 'SELECT ''1'' AS expected, CAST(CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''claim'' AND text LIKE ''claimed errata:%'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) > 0 THEN 1 ELSE 0 END AS TEXT) AS observed'
WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE instr(title, 'CLAIM-ERRATA-SHARE-1:') = 1);

-- 7. The decision, with its prediction (DOCTRINE section 22).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-research-errata', 'a stage-SLA breach must count each waiting item once and only items a loop can still move, and one paper needs one rewrite however many errata name it',
  'CONTENT-PIPELINE-SLA-1: v_content_pipeline maps six finished paper_revision_log statuses to done or rejected and gives an internal_errata row with an errata_queue mirror no SLA of its own; the unstarted errata remediation rows of one paper are merged into one (errata_remediation_merges); two detectors; RB-ERRATA-SHARE-1 and CLAIM-ERRATA-SHARE-1 filed',
  'read 2026-10-26 18:00-18:30Z: content_items_over_stage_sla 2479 = internal-errata 727 + errata 689 + revision finished-status rows 454 + loop/thin queued 156 + research 412 + idea 25 + other; 751 of 761 open internal_errata rows have a queue row; 233 open errata remediation rows over 149 papers, none claimed since 2026-10-18; research queue status queued 192 of 192 remediation, research_ready_cap 192, research_deferred_pool 181 -> 249 in ten hours; errata confirm healthy (9 to 12 rows settled an hour by deepseek-v4-flash, 2 defer events in 24 h)',
  'migration merged', 'one view replaced, one index, one audit table, up to 84 research_queue rows set wontfix with their text kept in a survivor, two failure modes, two contracts, two issues, one metric formula text', 'see the Rollback header',
  'each erratum counts once and a finished log row never counts; one rewrite per paper instead of up to six',
  'content_items_over_stage_sla steps down by about 1,190 at the first tick after apply (2500 to about 1,310 before the merged research rows) and the remaining ~1,300 are real waiting items; research_queue status queued falls by the merged queued rows (up to 65) and the freed slots are released to deferred remediation first, then proposals; papers_with_open_high_errata_pct is unchanged',
  'the breach figure counts distinct, movable items, and the budget is not spent on 84 rewrites that another row already makes',
  'd1:qnfo-audit v_content_pipeline, v_content_stage_summary, v_sla_over_120m, research_queue, errata_queue, internal_errata, paper_revision_log, agent_issues'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CONTENT-PIPELINE-SLA-1:') = 1);
