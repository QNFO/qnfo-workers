-- IDEAS-INTAKE-OWNER-1 (2026-10-19, pillar research): the owner's own ideas are never held by RESEARCH-ADMISSION-CAP-1.
-- Finding (read from main at cabda22 on 2026-10-19): idea-hub's enqueueAccepted held every ACCEPT that arrived while research_queue
-- had 120 or more active or deferred rows, owner ideas included, as status 'triaged_hold' with a '[research admission cap n/120]'
-- rationale, and nothing ever re-admitted such a row. An idea the owner filed while the queue was full therefore stayed stranded for
-- good, although proposalKind 'direct' is meant to "never wait on a model's HOLD" (OWNER-SIGNAL-INTAKE-1). idea-hub 1.10.12 skips the
-- cap for 'direct' rows (idea-hub/owner-admission-bypass.test.mjs fails on 1.10.11 with the stranded row, passes on 1.10.12).
-- This file does two things: (1) re-queues the owner ideas already stranded by the cap, after backing them up, and (2) registers the
-- cap in control_registry, which CLAUDE.md (DOCTRINE-1) requires of every cap and which RESEARCH-ADMISSION-CAP-1 never had.
-- Scope: only rows the worker's own proposalKind calls 'direct' (name owner*/rowan*, or contact 'owner' / 'rowan*'), decision ACCEPT, status
-- triaged_hold, rationale starting '[research admission cap'; owner-corpus (the notebook feeder) and intake:* rows stay under the cap.
-- Machine-generated ACCEPTs held by the cap are not touched: that stranding is a separate, open design question (a release path or a
-- different bound), filed as an issue, not decided here. No worker, cron, trigger or model call is added. Every statement is idempotent.
-- spof-review: no new path is added; the cap keeps its existing alternate (generated accepts wait in idea_proposals), recorded below
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_owner_cap_held
-- Rollback: DELETE FROM research_queue WHERE id IN (SELECT 'ownercap-' || id FROM bak_20261019_owner_cap_held); UPDATE idea_proposals SET status = 'triaged_hold' WHERE id IN (SELECT id FROM bak_20261019_owner_cap_held); DELETE FROM control_registry WHERE control = 'research-admission-cap'

CREATE TABLE IF NOT EXISTS bak_20261019_owner_cap_held AS
  SELECT * FROM idea_proposals
  WHERE status = 'triaged_hold' AND decision = 'ACCEPT' AND rationale LIKE '[research admission cap%'
    AND (name LIKE 'owner%' OR name LIKE 'rowan%' OR name = 'chat-session' OR contact = 'owner' OR contact LIKE 'rowan%')
    AND name <> 'owner-corpus' AND name NOT LIKE 'intake:%';

INSERT OR IGNORE INTO research_queue (id, source, source_id, idea, summary, score, decision, status, created_at)
  SELECT 'ownercap-' || id, 'proposal', CAST(id AS TEXT), substr(idea, 1, 3000), '', COALESCE(score, 0), 'ACCEPT', 'queued', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  FROM bak_20261019_owner_cap_held;

UPDATE idea_proposals SET status = 'triaged_accepted'
  WHERE id IN (SELECT id FROM bak_20261019_owner_cap_held)
    AND EXISTS (SELECT 1 FROM research_queue q WHERE q.source = 'proposal' AND q.source_id = CAST(idea_proposals.id AS TEXT));

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('research-admission-cap', 'idea-hub/worker.js enqueueAccepted, RESEARCH_ADMISSION_CAP = 120 (RESEARCH-ADMISSION-CAP-1, narrowed by IDEAS-INTAKE-OWNER-1 in 1.10.12)', 'cap',
  'the machine producers (arXiv scan, think loop, re-entry, ask-gap) filling research_queue faster than the executor publishes: 440 deferred rows, 68% of the pipeline, on 2026-10-17',
  0, 'demote', 'applied',
  'a generated accept over the cap waits in idea_proposals as triaged_hold with its rationale intact; an owner-authored idea (proposalKind direct) skips the cap and is queued on the same triage run',
  NULL,
  'before 1.10.12 the cap also held owner ideas and nothing re-admitted a held row (a test row read "[research admission cap 300/120]" and stayed triaged_hold). idea-hub/owner-admission-bypass.test.mjs: an owner idea is queued with 300 rows in research_queue, a generated accept is still held; 5 of 9 assertions pass and 4 fail on 1.10.11, all 9 pass on 1.10.12.',
  NULL);
