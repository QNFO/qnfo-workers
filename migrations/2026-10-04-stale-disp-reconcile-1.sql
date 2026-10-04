-- STALE-DISP-RECONCILE-1 (2026-10-04)
-- Problem: qnfo-fleet-dashboard's loopSync() verified-clear path sets
--   fleet_issue_loop.gh_state='cleared' but never reconciles the matching
--   fleet_issue_dispatch row. The owner queue (fleet.qnfo.org/api/human) builds
--   its `disp:` cards from:
--     SELECT ... FROM fleet_issue_dispatch WHERE state='queued' AND exec_state='needs-human'
--   so a cleared issue whose dispatch was `needs-human` left a permanent,
--   owner-unresolvable card (owner_act resolves only `ha:` keys). Canonical:
--   iss-98d516cd "Integration chain Idea intake -> triage" persisted ~2 days
--   after issue #89 was verified-cleared on 2026-10-02T20:02:38Z, even though
--   the chain itself was healthy (idea_proposals status='new' = 0, max 10).
-- Fix: enforce the reconciliation as a data invariant in qnfo-audit D1 (the
--   layer the dashboard owns), independent of a worker deploy. Applied live
--   2026-10-04 and verified with a seeded dummy clear (row became
--   state='closed'/exec_state='cleared'; cleanup count=0).
-- Worker-side app-layer reconciliation in loopSync remains a desirable, but
--   non-blocking, follow-up (repo was behind live during this cycle).
CREATE TRIGGER IF NOT EXISTS reconcile_dispatch_on_clear
AFTER UPDATE OF gh_state ON fleet_issue_loop
WHEN NEW.gh_state = 'cleared' AND (OLD.gh_state IS NULL OR OLD.gh_state <> 'cleared')
BEGIN
  UPDATE fleet_issue_dispatch
    SET state='closed', exec_state='cleared',
        exec_ts=datetime('now'),
        exec_result='issue verified-cleared; dispatch reconciled (STALE-DISP-RECONCILE-1)'
    WHERE fingerprint=NEW.fingerprint AND state='queued' AND exec_state='needs-human';
END;
