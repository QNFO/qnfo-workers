-- MANAGER-EVALUATION-WINDOW-1 (#8391): give an applied proposal its full observation window.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS manager_evolve_evaluation_window
-- Decision: evaluate_after is the application time plus 14 days, not the authored date.
-- Proposed rows retain their authored planning date until the canonical apply migration
-- marks them applied. The same status transition starts the observation window atomically.
-- Existing applied/terminal rows are left unchanged: their true application time cannot
-- be reconstructed from created_at. Replaying this migration never extends a running window.
-- spof-review: no worker, schedule, credential or new service; one trigger on the proposal
-- table, with no writes to agent_issues. Rollback restores the prior scheduling behavior.

CREATE TRIGGER IF NOT EXISTS manager_evolve_evaluation_window
AFTER UPDATE OF status ON manager_evolve_proposals
WHEN OLD.status = 'proposed' AND NEW.status = 'applied'
BEGIN
  UPDATE manager_evolve_proposals
  SET evaluate_after = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+14 days'),
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE id = NEW.id;
END;
