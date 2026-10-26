-- CONTENT-PIPELINE-MEASURE-1 (2026-10-26, session rem-a1, pillars autonomy and research; agent_issues 100456, 1000002). v_content_pipeline feeds content_items_over_stage_sla (2479) and, through
-- v_sla_over_120m, sla_breaches_over_120m (2799); two parts of it counted items that are not waiting, so neither metric could reach 0 whatever the pipeline did (measured 2026-10-26 18:00Z):
--   1. flow revision reads paper_revision_log, an EVENT LOG: 610 of its rows were 'waiting' with the statuses claim-corrected 73, claim-retracted 31, claim-withdrawn 106, integrity-restored 95, thin-prior-work-rejected 143,
--      thin-prior-work-skipped 6 (finished outcomes), loop-revision-queued 131, thin-prior-work-queued 21 and flagged 4 (the record that a revision was queued: the queued work is a research_queue remediation row or a
--      version_queue row, counted in the flows research and version). A log row never leaves 'waiting', so 610 items were over their SLA for ever. They are now done, rejected or parked by status; any other or new status
--      still counts as waiting, and the detector fm-content-pipeline-unmapped-revision-status lists a status this view does not know.
--   2. flow internal-errata counted the 746 internal_errata rows that already have an errata_queue row (the same finding, as internal-open 554, detected 157 or audited 30) a second time: 757 open, 746 with a live queue
--      row, 11 not yet swept. Only the 11 unswept rows stay in this flow; every other one is counted once, in flow errata.
-- Not changed: the stage SLA (120 minutes everywhere, SLA-120M-1), the research flow (queued 412, including the deferred pool), the errata flow (real queue rows: 669 waiting, 20 active), idea intake (25).
-- Expected: over_sla from 2479 to about 1150 (revision -610, internal-errata -716; about 1070 once ERRATA-REMEDIATION-MERGE-1 has parked its 84 rows); the rest is real backlog of the errata confirm, the research queue and idea intake (issues 100449, 1000002, 100456 keep it).
-- A new index on errata_queue(subject) makes the NOT EXISTS an index lookup (without it the view read 1.8 million rows per evaluation).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_v_content_pipeline
-- Rollback: DROP INDEX IF EXISTS ix_errata_queue_subject; DELETE FROM remediation_contracts WHERE class = 'fm-content-pipeline-unmapped-revision-status'; DELETE FROM failure_modes WHERE fm_key = 'content-pipeline-unmapped-revision-status'; DROP VIEW IF EXISTS v_content_pipeline; -- then recreate it from the sql column of bak_20261026_v_content_pipeline

CREATE TABLE IF NOT EXISTS bak_20261026_v_content_pipeline AS SELECT name, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_content_pipeline';

CREATE INDEX IF NOT EXISTS ix_errata_queue_subject ON errata_queue (subject);

DROP VIEW IF EXISTS v_content_pipeline;
CREATE VIEW v_content_pipeline AS
SELECT p.property, p.flow, p.item_id, p.title, p.raw_status, p.stage, p.state,
  strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE((SELECT MAX(e.ts) FROM content_stage_events e WHERE e.flow = p.flow AND e.item_id = p.item_id), p.since_fallback)) AS since,
  ROUND((julianday('now') - julianday(COALESCE((SELECT MAX(e.ts) FROM content_stage_events e WHERE e.flow = p.flow AND e.item_id = p.item_id), p.since_fallback))) * 24, 1) AS age_h,
  s.sla_min,
  CASE WHEN p.state IN ('waiting', 'active', 'held', 'blocked') AND s.sla_min IS NOT NULL
        AND (julianday('now') - julianday(COALESCE((SELECT MAX(e.ts) FROM content_stage_events e WHERE e.flow = p.flow AND e.item_id = p.item_id), p.since_fallback))) * 1440 > s.sla_min
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
      CASE WHEN r.status IN ('already-revised', 'published', 'claim-corrected', 'claim-withdrawn', 'integrity-restored') THEN 'published' WHEN r.status IN ('wontfix', 'claim-retracted', 'thin-prior-work-rejected', 'thin-prior-work-skipped') THEN 'rejected' WHEN r.status = 'quarantined' THEN 'review' ELSE 'revise' END,
      CASE WHEN r.status IN ('already-revised', 'published', 'claim-corrected', 'claim-withdrawn', 'integrity-restored') THEN 'done' WHEN r.status IN ('wontfix', 'claim-retracted', 'thin-prior-work-rejected', 'thin-prior-work-skipped') THEN 'rejected'
           WHEN r.status IN ('needs-substantive-revision', 'quarantined', 'loop-revision-queued', 'thin-prior-work-queued', 'flagged') THEN 'parked' ELSE 'waiting' END,
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
    WHERE NOT EXISTS (SELECT 1 FROM errata_queue q WHERE q.subject = n.id)
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

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('content-pipeline-unmapped-revision-status', 'a status written to paper_revision_log that v_content_pipeline does not map counts as a waiting item for ever, because the log row never changes', 'v_content_pipeline treated every paper_revision_log status except a few as flow revision, state waiting, but the log holds events (claim-corrected, integrity-restored, loop-revision-queued, thin-prior-work-rejected and others) that finish at insert; 610 such rows kept content_items_over_stage_sla and sla_breaches_over_120m above 0 whatever the pipeline did', 'map the new status in the view by migration (done, rejected or parked), as migrations/2026-10-26-content-pipeline-measure.sql did for the fifteen known ones', 'the contract fm-content-pipeline-unmapped-revision-status counts distinct paper_revision_log statuses outside the mapped list, expected 0', 'fm-content-pipeline-unmapped-revision-status', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL, 'a paper_revision_log row whose status is not in the list of v_content_pipeline', 'the SLA metrics count log rows as stuck items and the real stalls hide in the number', 'content_items_over_stage_sla, sla_breaches_over_120m and v_content_stage_summary');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-content-pipeline-unmapped-revision-status', NULL, 'CONTENT-PIPELINE-MEASURE-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(DISTINCT status) FROM paper_revision_log WHERE status NOT IN (''already-revised'', ''published'', ''claim-corrected'', ''claim-withdrawn'', ''integrity-restored'', ''wontfix'', ''claim-retracted'', ''thin-prior-work-rejected'', ''thin-prior-work-skipped'', ''needs-substantive-revision'', ''quarantined'', ''loop-revision-queued'', ''thin-prior-work-queued'', ''flagged'', ''queued'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-research-exec', 1, 'active', 'failure-mode', datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-rem-a1', 'a metric that counts finished events and duplicate rows as waiting items measures the log, not the pipeline, and a number that can never reach 0 hides the real stalls; fixing what is counted is not lowering the SLA: the stage SLA stays at 120 minutes and every item that is really waiting stays counted', 'CONTENT-PIPELINE-MEASURE-1: v_content_pipeline maps the finished and queued-event statuses of paper_revision_log to done, rejected or parked and counts an internal erratum only while it has no errata_queue row; index ix_errata_queue_subject; failure mode and detector for an unmapped status', 'v_content_pipeline over_sla = 1 on 2026-10-26 18:00Z: internal-errata 727, errata 689, revision 610, research queued 412, idea intake 25, others 16 (total 2479); revision rows by status: loop-revision-queued 131, thin-prior-work-rejected 143, claim-withdrawn 106, integrity-restored 95, claim-corrected 73, claim-retracted 31, thin-prior-work-queued 21, thin-prior-work-skipped 6, flagged 4; internal_errata open 757 of which 746 have an errata_queue row in internal-open, detected or audited', 'applied by migration', 'one view, one index, one failure mode and one detector contract; content_items_over_stage_sla, sla_breaches_over_120m, v_content_stage_summary and v_sla_overlap_120m read the new numbers', 'the Rollback line of migrations/2026-10-26-content-pipeline-measure.sql recreates the old view from bak_20261026_v_content_pipeline', 'the SLA metrics measure waiting items, so the remaining count is the real backlog', 'content_items_over_stage_sla falls from 2479 to about 1150 at the next tick (about 1070 after the remediation merge) and sla_breaches_over_120m by the same amount; neither reaches 0 until the errata confirm, the research queue and idea intake drain', 'autonomy: stalls are visible instead of buried', 'v_content_pipeline, paper_revision_log, internal_errata and errata_queue read on 2026-10-26; the offline suite replays the view on node:sqlite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log x WHERE x.action LIKE 'CONTENT-PIPELINE-MEASURE-1:%');
