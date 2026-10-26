-- BP26-PROMPT-INJECTION-1 part 2 (2026-10-26, charter pillar security; agent_issues 1000359; follows migrations/2026-10-26-bp26-agent-security.sql, applied 2026-10-26T18:48:58Z).
-- WHAT WAS MISSING: the first file listed the email command channel as "not changed here". Reading qnfo-email cmdAgent again (2026-10-26) showed the channel is the one path where mail text reaches an agent WITH tools:
-- the first paragraph of an owner-authenticated email command (the owner's own address with a DMARC pass, OWNER-CMD-DMARC-GATE-1) is the user message of ops-exec. The paragraph is cut at the first quoted block, but a
-- forwarded or pasted instruction inside it was passed on unread. qnfo-email 2.12.0 (same pull request as the other guards) now scans that text, refuses one that carries instruction-injection markers and strips hidden
-- characters before the job is queued. CLAUDE.md DOCTRINE-1 asks that a new guard is registered in control_registry before it ships; this file registers it and corrects the record.
-- Revert: the Rollback line deletes the one control row; the decision_log row stays (append-only).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM control_registry WHERE control = 'email-command-injection-scan';
-- spof-review: no new dependency; the scan is a pure function in qnfo-email and an owner command it refuses can be sent again in plain words.

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('email-command-injection-scan', 'qnfo-email/worker.js cmdAgent (injScan and injSanitizeInbound before the ops-exec job is queued)', 'guard',
  'an instruction that did not come from the owner (a forwarded or pasted mail, hidden characters) reaching ops-exec, an agent with tools, through the first paragraph of an authenticated owner email command (OWASP LLM01, Agentic ASI01)', 0, 'keep', 'applied',
  'it only refuses text that carries instruction-injection markers (score 3 or more: an override of instructions, a request for the prompt, chat-template tokens, tool-call JSON, encoded or Unicode-tag smuggled text); the owner types the command again in plain words or uses the dashboard; every other command is unchanged and the read-only verbs never reach the agent',
  '2026-10-26', 'qnfo-email/injection-redteam.test.mjs section 8: an injection-marked owner command is refused and never queued, a clean command is queued with hidden characters removed, an agent sender stays read-only', 1000359);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-rem-a8-inject',
  'the owner email command is the one place mail text reaches an agent with tools, so it needs the same data-not-instructions guard as the drafter, and the guard must be registered before it ships',
  'BP26-PROMPT-INJECTION-1 (command channel): qnfo-email 2.12.0 cmdAgent scans the command text (refuses a score of 3 or more) and strips hidden characters; control_registry row email-command-injection-scan',
  'qnfo-email 2.11.0 cmdAgent passed the first paragraph of an authenticated owner command to /v1/jobs model ops-exec unread; parseCommand cuts at the first blank line and at quoted blocks; ownerAuthenticated needs dmarc=pass aligned to the owner address; qnfo-email/injection-redteam.test.mjs 64 of 64',
  'applied by migration; the code ships with qnfo-email 2.12.0', 'owner email commands only: an injection-marked command is refused with a reply that says so', 'the Rollback line (the code guard is reverted with the pull request)',
  'a forwarded or pasted instruction cannot reach ops-exec through an owner email command', 'no honest owner command is refused (the scorer needs a score of 3, which an ordinary command does not reach); refusals appear as agent_mail_trace rows with surface email-command',
  'none directly: it protects the owner whose commands drive the fleet', 'offline: qnfo-email/injection-redteam.test.mjs section 8 and migrations/bp26-agent-security-2.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BP26-PROMPT-INJECTION-1 (command channel):%');
