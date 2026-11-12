-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS pipeline_runs_research_outcome_au; DROP TRIGGER IF EXISTS pipeline_runs_research_outcome_ai; DROP VIEW IF EXISTS v_research_line_yield; DROP TABLE IF EXISTS research_line_outcomes;
-- spof-review: one ledger table, one view and two triggers on pipeline_runs. A stopped trigger leaves research scores where they were; it never
-- stops a run. No new cron, binding, host or credential.
--
-- FLOW-GAP-research-run-outcome (agent_issues 1003164, FLOW-DIRECTIVE-1): the personal-companion research-run Workflow records each research
-- item's outcome (published, parked, dropped) in pipeline_runs, and no flow read it. This file is the consumer. When a research-run finishes,
-- the trigger finds the research lines whose terms match the item's idea (research_line_terms, the same matcher OWNER-FOCUS-1 uses), records
-- the outcome per line in research_line_outcomes, and moves the score of that line's waiting ideas (queued or deferred): +0.02 after a
-- published run (capped at 0.99), -0.02 after a parked or dropped run (floored at 0.05). The research pipeline picks by score, so a line that
-- keeps publishing is drawn from sooner and one that keeps failing later; the owner's push and pause stances stay in force (a paused idea is
-- owner_paused, which these updates never touch). v_research_line_yield is the per-line read of the loop.

CREATE TABLE IF NOT EXISTS research_line_outcomes (
  run_id TEXT NOT NULL,
  line TEXT NOT NULL,
  research_id TEXT,
  outcome TEXT NOT NULL,
  waiting_adjusted INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (run_id, line)
);

CREATE TRIGGER IF NOT EXISTS pipeline_runs_research_outcome_au AFTER UPDATE OF status ON pipeline_runs
WHEN NEW.pipeline = 'research-run' AND NEW.status = 'done' AND COALESCE(OLD.status, '') != 'done'
  AND json_extract(NEW.output_json, '$.outcome') IN ('published', 'parked', 'dropped')
BEGIN
  INSERT OR IGNORE INTO research_line_outcomes (run_id, line, research_id, outcome, waiting_adjusted)
    SELECT NEW.id, t.line, q.id, json_extract(NEW.output_json, '$.outcome'),
      (SELECT COUNT(*) FROM research_queue w WHERE w.status IN ('queued','deferred') AND w.id != q.id
        AND EXISTS (SELECT 1 FROM research_line_terms t2 WHERE t2.line = t.line AND lower(w.idea) LIKE t2.pattern))
    FROM research_queue q JOIN research_line_terms t ON lower(q.idea) LIKE t.pattern
    WHERE q.id = COALESCE(json_extract(NEW.output_json, '$.research_id'), NEW.subject_ref)
    GROUP BY t.line;
  UPDATE research_queue SET score = MIN(0.99, COALESCE(score, 0.5) + 0.02)
    WHERE json_extract(NEW.output_json, '$.outcome') = 'published' AND status IN ('queued','deferred')
      AND EXISTS (SELECT 1 FROM research_line_outcomes o JOIN research_line_terms t ON t.line = o.line
        WHERE o.run_id = NEW.id AND lower(research_queue.idea) LIKE t.pattern);
  UPDATE research_queue SET score = MAX(0.05, COALESCE(score, 0.5) - 0.02)
    WHERE json_extract(NEW.output_json, '$.outcome') IN ('parked','dropped') AND status IN ('queued','deferred')
      AND EXISTS (SELECT 1 FROM research_line_outcomes o JOIN research_line_terms t ON t.line = o.line
        WHERE o.run_id = NEW.id AND lower(research_queue.idea) LIKE t.pattern);
END;

-- A run inserted already done (a replay or a backfill) is read the same way.
CREATE TRIGGER IF NOT EXISTS pipeline_runs_research_outcome_ai AFTER INSERT ON pipeline_runs
WHEN NEW.pipeline = 'research-run' AND NEW.status = 'done' AND json_extract(NEW.output_json, '$.outcome') IN ('published', 'parked', 'dropped')
BEGIN
  INSERT OR IGNORE INTO research_line_outcomes (run_id, line, research_id, outcome)
    SELECT NEW.id, t.line, q.id, json_extract(NEW.output_json, '$.outcome')
    FROM research_queue q JOIN research_line_terms t ON lower(q.idea) LIKE t.pattern
    WHERE q.id = COALESCE(json_extract(NEW.output_json, '$.research_id'), NEW.subject_ref)
    GROUP BY t.line;
END;

CREATE VIEW IF NOT EXISTS v_research_line_yield AS
  SELECT line,
    SUM(outcome = 'published') AS published,
    SUM(outcome = 'parked') AS parked,
    SUM(outcome = 'dropped') AS dropped,
    ROUND(1.0 * SUM(outcome = 'published') / COUNT(*), 3) AS publish_share,
    MAX(at) AS last_at
  FROM research_line_outcomes GROUP BY line;

-- Backfill: the runs that finished before this consumer existed are recorded (no score change for history).
INSERT OR IGNORE INTO research_line_outcomes (run_id, line, research_id, outcome)
  SELECT r.id, t.line, q.id, json_extract(r.output_json, '$.outcome')
  FROM pipeline_runs r JOIN research_queue q ON q.id = COALESCE(json_extract(r.output_json, '$.research_id'), r.subject_ref)
  JOIN research_line_terms t ON lower(q.idea) LIKE t.pattern
  WHERE r.pipeline = 'research-run' AND r.status = 'done' AND json_extract(r.output_json, '$.outcome') IN ('published', 'parked', 'dropped')
  GROUP BY r.id, t.line;
