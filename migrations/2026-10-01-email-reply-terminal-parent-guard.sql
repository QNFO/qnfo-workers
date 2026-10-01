-- EMAIL-REPLY-TERMINAL-PARENT-GUARD-1 (#1158, 2026-10-01)
-- On 2026-09-23 12:45 a bulk "terminal-parent" sweep closed 18 email_reply_queue rows because the
-- parent email was spam/archived/replied. Several parents had been archived by the empty-body MIME
-- bug, so genuine human replies were closed without owner visibility. This guard refuses any
-- terminal-parent closure of a human-scored row unless the parent is spam, or an outbound reply
-- to the sender is recorded after the inbound. It also refuses one when the parent body is empty
-- or has an unresolved parse failure, since then the parent's status cannot be trusted.
CREATE TRIGGER IF NOT EXISTS email_reply_queue_terminal_parent_guard
BEFORE UPDATE OF decision ON email_reply_queue
WHEN NEW.decision IN ('closed','skip')
  AND lower(COALESCE(NEW.skip_reason,'')) LIKE 'terminal-parent%'
  AND (
    COALESCE((SELECT length(body_text) FROM emails WHERE id = NEW.email_id), 0) = 0
    OR EXISTS (SELECT 1 FROM email_parse_failures f WHERE f.email_id = NEW.email_id AND f.resolved_at IS NULL)
    OR (
      COALESCE(NEW.human_score, 0) >= 2
      AND COALESCE((SELECT status FROM emails WHERE id = NEW.email_id), '') <> 'spam'
      AND NOT EXISTS (
        SELECT 1 FROM emails o
        WHERE lower(o.sender) LIKE '%qnfo.org%'
          AND lower(o.recipient) LIKE '%' || lower(NEW.sender) || '%'
          AND o.received_at > COALESCE((SELECT received_at FROM emails WHERE id = NEW.email_id), '')
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'EMAIL-REPLY-TERMINAL-PARENT-GUARD-1: terminal-parent closure refused for a human reply with no outbound answer (or an unparsed parent); escalate to the owner instead');
END;

-- Remediation: re-escalate the genuine human threads the 2026-09-23 sweep closed that have no
-- outbound reply after the inbound. Owner-authored replies required; the orchestrator only
-- auto-sends escalations whose skip_reason carries the cleared marker, so these stay owner-visible.
UPDATE email_reply_queue
SET decision = 'escalate',
    skip_reason = 'REOPENED 2026-10-01 (#1158): closed by the terminal-parent sweep with no outbound reply after the inbound; owner-authored reply required, never auto-draft',
    updated_at = datetime('now')
WHERE id IN (14, 25, 33, 35, 36) AND decision = 'closed' AND skip_reason LIKE 'terminal-parent%';
