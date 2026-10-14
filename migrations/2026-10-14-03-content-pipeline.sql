-- CONTENT-PIPELINE-1 (2026-10-14, pillars research and reach). Owner directive, verbatim: "The system shall provide visibility onto
-- the content creation process end-to-end on fleet dashboard: what topics/ideas are in process, which are being researched, written,
-- reviewed, edited/revised, rejected etc... across all QNFO/Q08 properties. As the system you shall think in pipelines and end-to-end
-- workflows as any live production system."
-- Before this file each content table kept its own status vocabulary (idea_proposals, research_queue status + stage, version_queue,
-- paper_revision_log, errata_queue, internal_errata, social_threads, dissemination_tracker) and nothing put them on one line: no view
-- named a stage, an owner, an exit gate or an SLA, and an item's time in its current stage was not recorded anywhere.
-- This file adds:
--   content_stages        the canonical stage catalogue (intake, triage, queued, research, draft, review, revise, publish, published,
--                         distribute, correct, rejected): definition, exit gate, the worker that enforces the gate, SLA in minutes.
--   content_stage_events  append-only ledger of every status or stage change on the eight content tables (D1 triggers), so the
--                         age in a stage is measured from the moment the item entered it, not from its creation.
--   v_content_pipeline    one row per content item in qnfo-audit: property, flow, stage, state (waiting, active, held, blocked,
--                         done, parked, rejected), since, age_h, sla_min, over_sla.
--   v_content_stage_summary  per property and stage: in flight, over SLA, oldest age, finished in 24 h and 7 d.
--   metric content_items_over_stage_sla (target 0, trigger gt 0) refreshed on every fleet tick, and metric
--   papers_live_failing_release_gate (target 0, trigger gt 0) written by qnfo-fleet-dashboard 1.37.0 from living-paper.papers,
--   which a qnfo-audit trigger cannot read.
-- Measured with the view body on 2026-10-14 at 03:00Z (see decision_log row): research_queue 185 deferred (oldest 2026-10-09),
-- dissemination_tracker 142 bluesky rows queued since 2026-10-01, living-paper 207 published papers without a passing release
-- gate (77 never scored, 130 scored thin).
-- Stage mapping (read from the writers' code, qnfo-research-exec 0.18.0, idea-hub, qnfo-social 0.14.2, qnfo-fleet-control 0.26.5):
--   research_queue  queued/deferred unclaimed at ground -> queued; ground -> research; ensemble, reconcile, complete -> draft;
--                   review, verify, gate -> review; revise -> revise; publish, done -> publish; published -> published;
--                   wontfix or parked -> rejected; held -> held; failed, error, gate-blocked -> blocked.
--   idea_proposals  new -> intake; deferred_budget, deferred_diversity -> triage (held); triaged_hold -> triage (parked: idea-hub
--                   never re-reads a HOLD); triaged_accepted, ensemble-registered -> triage (done: handed to research_queue);
--                   rejected -> rejected.
--   version_queue   queued -> revise; drafted -> review; publishing -> publish; published -> published; gate-blocked -> review
--                   (blocked); error -> blocked; wontfix -> rejected.
--   paper_revision_log  flagged, queued, stub-fragment -> revise (waiting); needs-substantive-revision -> revise (parked: marked
--                   terminal by QUALITY-GATE-1); quarantined -> review (parked: the paper was taken off the site); already-revised, published -> published; wontfix -> rejected.
--   errata_queue, internal_errata  detected, internal-open, open -> correct (waiting); audited -> correct (active); published,
--                   resolved, implemented, closed -> correct (done); rejected, no-paper -> rejected; error -> blocked.
--   social_threads  draft -> distribute (waiting); queued -> distribute (waiting); posting -> distribute (active); posted -> done;
--                   failed, link-dead, misrouted -> blocked; rejected, suppressed -> rejected.
--   dissemination_tracker (action)  queued -> distribute (waiting); posting -> active; posted, done -> done; failed, held -> blocked;
--                   post-unverified -> parked (sent, never confirmed; nothing re-checks it); suppressed, link-dead, misrouted -> rejected.
-- The view is read by the open dashboard page: an idea's text is shown only for machine sources (auto-*, intake:*, think-loop);
-- owner-corpus ideas and anything submitted through a form show their source and id only.
-- q08-signal (q08.org) and living-paper are other databases; qnfo-fleet-dashboard reads them on /content. reading.q08.org
-- (personal-companion) keeps its pieces on the personal plane and is shown only as its public /health, never read here.
-- spof-review: measurement only; the triggers insert into one new table and never abort a write (no RAISE, no NOT NULL a writer
-- could miss: flow and item_id come from the row itself and ts has a default).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS cse_research_queue_ins; DROP TRIGGER IF EXISTS cse_research_queue_upd; DROP TRIGGER IF EXISTS cse_idea_proposals_ins; DROP TRIGGER IF EXISTS cse_idea_proposals_upd; DROP TRIGGER IF EXISTS cse_version_queue_ins; DROP TRIGGER IF EXISTS cse_version_queue_upd; DROP TRIGGER IF EXISTS cse_paper_revision_log_ins; DROP TRIGGER IF EXISTS cse_paper_revision_log_upd; DROP TRIGGER IF EXISTS cse_errata_queue_ins; DROP TRIGGER IF EXISTS cse_errata_queue_upd; DROP TRIGGER IF EXISTS cse_internal_errata_ins; DROP TRIGGER IF EXISTS cse_internal_errata_upd; DROP TRIGGER IF EXISTS cse_social_threads_ins; DROP TRIGGER IF EXISTS cse_social_threads_upd; DROP TRIGGER IF EXISTS cse_dissemination_ins; DROP TRIGGER IF EXISTS cse_dissemination_upd; DROP TRIGGER IF EXISTS content_items_over_stage_sla_tick; DROP VIEW IF EXISTS v_content_stage_summary; DROP VIEW IF EXISTS v_content_pipeline; DELETE FROM analytics_metric_triggers WHERE metric_key IN ('content_items_over_stage_sla', 'papers_live_failing_release_gate'); DELETE FROM metric_registry WHERE metric IN ('content_items_over_stage_sla', 'papers_live_failing_release_gate'); DROP TABLE IF EXISTS content_stage_events; DROP TABLE IF EXISTS content_stages;

CREATE TABLE IF NOT EXISTS content_stages (
  stage TEXT PRIMARY KEY,
  ord INTEGER NOT NULL,
  label TEXT NOT NULL,
  definition TEXT NOT NULL,
  exit_gate TEXT NOT NULL,
  enforced_by TEXT NOT NULL,
  sla_min INTEGER,
  terminal INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO content_stages (stage, ord, label, definition, exit_gate, enforced_by, sla_min, terminal) VALUES
 ('intake', 1, 'Intake', 'An idea or proposal recorded with its source, not yet scored.',
  'Scored ACCEPT or HOLD with a rationale and a score.', 'idea-hub triage', 120, 0),
 ('triage', 2, 'Triage', 'Scored, but held back by a budget or diversity rule before a decision.',
  'The hold expires and the idea is ACCEPTed into research_queue or HOLD with a reason.', 'idea-hub (deferred_budget, deferred_diversity)', 1440, 0),
 ('queued', 3, 'Accepted, waiting', 'Accepted research waiting for an executor slot (ready queue, or the deferred pool behind it).',
  'Claimed by the single-flight research executor.', 'qnfo-fleet-control RESEARCH-BACKPRESSURE-1 (research_ready_cap)', 1440, 0),
 ('research', 4, 'Research', 'Grounding: sources found and read in full text.',
  'Every cited work grounded on its full text (CITE-FULLTEXT-1); a work that cannot be read is dropped.', 'qnfo-research-exec (ground)', 360, 0),
 ('draft', 5, 'Writing', 'An ensemble of models from disjoint families writes and reconciles the draft.',
  'One reconciled, complete draft (ENSEMBLE-POLICY-1).', 'qnfo-research-exec (ensemble, reconcile, complete)', 360, 0),
 ('review', 6, 'Review', 'Independent review, verification and the citation and release gates.',
  'A pass from a reviewer of another model family, the citation gate and the deterministic release gate (pub-gate-v1).', 'qnfo-research-exec (review, verify, gate)', 360, 0),
 ('revise', 7, 'Revision', 'A draft or a published paper being revised against review findings.',
  'The revision is re-read by another family (REVISER-REREAD-1) and goes back to review.', 'qnfo-research-exec (revise, reviser member)', 720, 0),
 ('publish', 8, 'Publishing', 'Writing the paper to living-paper and its public pages.',
  'The row is published with a release-gate verdict written at publish (PUB-GATE-AT-PUBLISH-1).', 'qnfo-research-exec (publish)', 120, 0),
 ('published', 9, 'Published', 'Live for readers.', 'Daily release-gate sweep; a quarantine candidate is demoted.', 'qnfo-cloud-ops PUB-GATE-LOOP-1', NULL, 1),
 ('distribute', 10, 'Distribution', 'Threads and posts announcing published work on social channels.',
  'A fail-closed check of the post against the paper (SOCIAL-CHECK-FAIL-CLOSED-1), then posted.', 'qnfo-social', 1440, 0),
 ('correct', 11, 'Correction', 'Errata found by readers or by the fleet, audited and published as corrections.',
  'An audited claim is published as a correction or rejected with a reason.', 'qnfo-research-exec (errata members)', 1440, 0),
 ('rejected', 99, 'Rejected', 'Stopped with a recorded reason.', 'None: terminal.', 'the stage that rejected it', NULL, 1);

CREATE TABLE IF NOT EXISTS content_stage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flow TEXT,
  item_id TEXT,
  from_status TEXT,
  to_status TEXT,
  from_stage TEXT,
  to_stage TEXT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS ix_content_stage_events_item ON content_stage_events (flow, item_id, ts);
CREATE INDEX IF NOT EXISTS ix_content_stage_events_ts ON content_stage_events (ts);

CREATE TRIGGER IF NOT EXISTS cse_research_queue_ins AFTER INSERT ON research_queue
BEGIN INSERT INTO content_stage_events (flow, item_id, to_status, to_stage) VALUES ('research', CAST(NEW.id AS TEXT), NEW.status, NEW.stage); END;
CREATE TRIGGER IF NOT EXISTS cse_research_queue_upd AFTER UPDATE OF status, stage ON research_queue
WHEN OLD.status IS NOT NEW.status OR OLD.stage IS NOT NEW.stage
BEGIN INSERT INTO content_stage_events (flow, item_id, from_status, to_status, from_stage, to_stage) VALUES ('research', CAST(NEW.id AS TEXT), OLD.status, NEW.status, OLD.stage, NEW.stage); END;

CREATE TRIGGER IF NOT EXISTS cse_idea_proposals_ins AFTER INSERT ON idea_proposals
BEGIN INSERT INTO content_stage_events (flow, item_id, to_status) VALUES ('idea', CAST(NEW.id AS TEXT), NEW.status); END;
CREATE TRIGGER IF NOT EXISTS cse_idea_proposals_upd AFTER UPDATE OF status ON idea_proposals
WHEN OLD.status IS NOT NEW.status
BEGIN INSERT INTO content_stage_events (flow, item_id, from_status, to_status) VALUES ('idea', CAST(NEW.id AS TEXT), OLD.status, NEW.status); END;

CREATE TRIGGER IF NOT EXISTS cse_version_queue_ins AFTER INSERT ON version_queue
BEGIN INSERT INTO content_stage_events (flow, item_id, to_status) VALUES ('version', CAST(NEW.id AS TEXT), NEW.status); END;
CREATE TRIGGER IF NOT EXISTS cse_version_queue_upd AFTER UPDATE OF status ON version_queue
WHEN OLD.status IS NOT NEW.status
BEGIN INSERT INTO content_stage_events (flow, item_id, from_status, to_status) VALUES ('version', CAST(NEW.id AS TEXT), OLD.status, NEW.status); END;

CREATE TRIGGER IF NOT EXISTS cse_paper_revision_log_ins AFTER INSERT ON paper_revision_log
BEGIN INSERT INTO content_stage_events (flow, item_id, to_status) VALUES ('revision', CAST(NEW.id AS TEXT), NEW.status); END;
CREATE TRIGGER IF NOT EXISTS cse_paper_revision_log_upd AFTER UPDATE OF status ON paper_revision_log
WHEN OLD.status IS NOT NEW.status
BEGIN INSERT INTO content_stage_events (flow, item_id, from_status, to_status) VALUES ('revision', CAST(NEW.id AS TEXT), OLD.status, NEW.status); END;

CREATE TRIGGER IF NOT EXISTS cse_errata_queue_ins AFTER INSERT ON errata_queue
BEGIN INSERT INTO content_stage_events (flow, item_id, to_status) VALUES ('errata', CAST(NEW.id AS TEXT), NEW.status); END;
CREATE TRIGGER IF NOT EXISTS cse_errata_queue_upd AFTER UPDATE OF status ON errata_queue
WHEN OLD.status IS NOT NEW.status
BEGIN INSERT INTO content_stage_events (flow, item_id, from_status, to_status) VALUES ('errata', CAST(NEW.id AS TEXT), OLD.status, NEW.status); END;

CREATE TRIGGER IF NOT EXISTS cse_internal_errata_ins AFTER INSERT ON internal_errata
BEGIN INSERT INTO content_stage_events (flow, item_id, to_status) VALUES ('internal-errata', CAST(NEW.id AS TEXT), NEW.status); END;
CREATE TRIGGER IF NOT EXISTS cse_internal_errata_upd AFTER UPDATE OF status ON internal_errata
WHEN OLD.status IS NOT NEW.status
BEGIN INSERT INTO content_stage_events (flow, item_id, from_status, to_status) VALUES ('internal-errata', CAST(NEW.id AS TEXT), OLD.status, NEW.status); END;

CREATE TRIGGER IF NOT EXISTS cse_social_threads_ins AFTER INSERT ON social_threads
BEGIN INSERT INTO content_stage_events (flow, item_id, to_status) VALUES ('social-thread', CAST(NEW.id AS TEXT), NEW.status); END;
CREATE TRIGGER IF NOT EXISTS cse_social_threads_upd AFTER UPDATE OF status ON social_threads
WHEN OLD.status IS NOT NEW.status
BEGIN INSERT INTO content_stage_events (flow, item_id, from_status, to_status) VALUES ('social-thread', CAST(NEW.id AS TEXT), OLD.status, NEW.status); END;

CREATE TRIGGER IF NOT EXISTS cse_dissemination_ins AFTER INSERT ON dissemination_tracker
BEGIN INSERT INTO content_stage_events (flow, item_id, to_status) VALUES ('dissemination', CAST(NEW.id AS TEXT), NEW.action); END;
CREATE TRIGGER IF NOT EXISTS cse_dissemination_upd AFTER UPDATE OF action ON dissemination_tracker
WHEN OLD.action IS NOT NEW.action
BEGIN INSERT INTO content_stage_events (flow, item_id, from_status, to_status) VALUES ('dissemination', CAST(NEW.id AS TEXT), OLD.action, NEW.action); END;

-- D1 refuses more than a few terms in one compound SELECT, so the eight flows are three nested groups.
CREATE VIEW IF NOT EXISTS v_content_pipeline AS
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
      CASE WHEN r.status IN ('already-revised', 'published') THEN 'published' WHEN r.status = 'wontfix' THEN 'rejected' WHEN r.status = 'quarantined' THEN 'review' ELSE 'revise' END,
      CASE WHEN r.status IN ('already-revised', 'published') THEN 'done' WHEN r.status = 'wontfix' THEN 'rejected'
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

CREATE VIEW IF NOT EXISTS v_content_stage_summary AS
SELECT c.property, c.stage, s.ord, s.label, s.sla_min, s.enforced_by,
  SUM(CASE WHEN c.state IN ('waiting', 'active', 'held', 'blocked') THEN 1 ELSE 0 END) AS in_flight,
  SUM(CASE WHEN c.state = 'waiting' THEN 1 ELSE 0 END) AS waiting,
  SUM(CASE WHEN c.state = 'active' THEN 1 ELSE 0 END) AS active,
  SUM(CASE WHEN c.state = 'held' THEN 1 ELSE 0 END) AS held,
  SUM(CASE WHEN c.state = 'blocked' THEN 1 ELSE 0 END) AS blocked,
  SUM(CASE WHEN c.state = 'parked' THEN 1 ELSE 0 END) AS parked,
  SUM(c.over_sla) AS over_sla,
  MAX(CASE WHEN c.state IN ('waiting', 'active', 'held', 'blocked') THEN c.age_h END) AS oldest_age_h,
  SUM(CASE WHEN c.state IN ('done', 'rejected') AND c.since > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day') THEN 1 ELSE 0 END) AS finished_24h,
  SUM(CASE WHEN c.state IN ('done', 'rejected') AND c.since > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') THEN 1 ELSE 0 END) AS finished_7d,
  SUM(CASE WHEN c.state IN ('done', 'rejected', 'parked') THEN 1 ELSE 0 END) AS finished_all
FROM v_content_pipeline c LEFT JOIN content_stages s ON s.stage = c.stage
GROUP BY c.property, c.stage;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('content_items_over_stage_sla', 'operational', 'target',
  'v_content_pipeline rows in state waiting, active, held or blocked whose time in their stage (content_stage_events, else the row''s own timestamps) exceeds content_stages.sla_min',
  'qnfo-audit.v_content_pipeline, content_stages, content_stage_events (CONTENT-PIPELINE-1, migrations/2026-10-14-03-content-pipeline.sql)',
  'measured at apply (decision_log CONTENT-PIPELINE-1)', '0 (owner directive 2026-10-14: the content pipeline runs as a live production system; QUEUE-SLA-1: no item stuck past its SLA)',
  'qnfo-fleet-control', 'trigger gt 0', '*/10', '> 10', '> 50', NULL, NULL, 'MEASURED', 'computed'),
 ('papers_live_failing_release_gate', 'operational', 'target',
  'living-paper.papers rows with status published and release_gate_pass not 1 (never scored, or scored thin or quarantine-candidate)',
  'living-paper.papers (written by qnfo-fleet-dashboard 1.37.0 contentGateMetric, CONTENT-PIPELINE-1)',
  '207 on 2026-10-14 03:00Z (77 never scored, 130 scored thin)', '0 (a paper is live only after it passes the release gate)',
  'qnfo-cloud-ops', 'trigger gt 0', 'hourly', '> 20', '> 100', '207', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS content_items_over_stage_sla_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COALESCE(SUM(over_sla), 0) FROM v_content_pipeline) AS TEXT)
  WHERE metric = 'content_items_over_stage_sla';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'content_items_over_stage_sla', 'Content pipeline: items are past their stage SLA', 'registry', 'gt', 0, 2,
  'Pillar research (CONTENT-PIPELINE-1). Read where the items are stuck: SELECT property, stage, in_flight, waiting, held, blocked, over_sla, oldest_age_h, enforced_by FROM v_content_stage_summary WHERE over_sla > 0 ORDER BY over_sla DESC; and the oldest items: SELECT flow, item_id, raw_status, stage, state, age_h, title FROM v_content_pipeline WHERE over_sla = 1 ORDER BY age_h DESC LIMIT 20. Levers by stage: queued (deferred pool) means intake outruns throughput, so lower idea-hub''s accept rate to the measured publish rate (Little''s law: wait = WIP / throughput) or add a second research executor; distribute (dissemination_tracker queued) means qnfo-social does not drain the queue, so drain it or close rows it will never post with a disposition; review, revise or publish past SLA means a qnfo-research-exec stage is failing, so read its cloud_ops_events errors. Wrong SLA: change content_stages.sla_min by migration with the measurement.',
  'qnfo-fleet-control', 'agent_issues', 12, 1, 'CONTENT-PIPELINE-1 (migrations/2026-10-14-03-content-pipeline.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'content_items_over_stage_sla');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'papers_live_failing_release_gate', 'Content pipeline: published papers are live without a passing release gate', 'registry', 'gt', 0, 2,
  'Pillar research (CONTENT-PIPELINE-1). A paper should be live only after it passes the release gate (pub-gate-v1-deterministic). Read them: on living-paper, SELECT COALESCE(release_gate_pass, -1) g, substr(COALESCE(release_gate_reason, ''(never scored)''), 1, 40) r, COUNT(*) FROM papers WHERE status = ''published'' GROUP BY 1, 2 ORDER BY 3 DESC. Levers: (1) never scored: qnfo-cloud-ops PUB-GATE-LOOP-1 must score every published paper each run (PUB_GATE_CHUNK batches until none is left unscored), not stop at its change cap; (2) scored thin (25-49): route each into the revision flow (version_queue) so it is enriched and re-gated, and record the result in publication_gate_audit. Whether a thin paper stays live while it is revised is the gate policy in qnfo-cloud-ops; change it there with its measurement.',
  'qnfo-cloud-ops', 'agent_issues', 12, 1, 'CONTENT-PIPELINE-1 (migrations/2026-10-14-03-content-pipeline.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'papers_live_failing_release_gate');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_018jgELQUadN7Ybo1B3j77HY', 'a pipeline nobody can see end to end cannot be held to SLAs; one stage vocabulary, a transition ledger and a stage SLA make every content item measurable',
  'CONTENT-PIPELINE-1: content_stages, content_stage_events with triggers on eight content tables, v_content_pipeline, v_content_stage_summary, metrics content_items_over_stage_sla and papers_live_failing_release_gate with triggers; qnfo-fleet-dashboard /content and /api/content',
  'measured 2026-10-14 03:00Z: research_queue 185 deferred (oldest 2026-10-09), 3 queued, 2 in review; dissemination_tracker 142 bluesky rows queued since 2026-10-01; living-paper 207 published papers without a passing release gate; q08-signal 132 pieces published, 131 retracted',
  'migration merged', 'two new tables, two views, 17 triggers that insert into content_stage_events or write one metric_registry row', 'the Rollback header',
  'every content item in qnfo-audit has a stage, a state, its time in stage and an SLA verdict; the dashboard shows the whole pipeline',
  'content_items_over_stage_sla holds a value within one tick of apply', 'none',
  'research_queue, idea_proposals, version_queue, paper_revision_log, errata_queue, internal_errata, social_threads, dissemination_tracker, living-paper.papers, q08-signal'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CONTENT-PIPELINE-1:') = 1);

INSERT INTO fleet_tick (source) VALUES ('migration:content-pipeline');
