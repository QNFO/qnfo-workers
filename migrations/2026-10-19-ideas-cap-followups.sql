-- IDEAS-INTAKE-OWNER-1 follow-ups (2026-10-19, pillar research): files the two open findings of PR 2588 as agent_issues so a doer owns them
-- (OWNER-NO-LOOSE-ENDS-1). A session could not write D1 directly, so the canonical path (this migration, applied by CI) carries them.
-- Each insert is skipped when an open issue with the same title exists. No worker, cron or trigger is added.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM agent_issues WHERE title IN ('IDEAS-CAP-GENERATED-RELEASE-1: generated ACCEPTs held by the research admission cap have no release path', 'IDEAS-CHAT-SESSION-CAP-SHARE-1: measure what chat-session ideas now add to research_queue')

INSERT INTO agent_issues (title, description, source, category, priority, status)
SELECT 'IDEAS-CAP-GENERATED-RELEASE-1: generated ACCEPTs held by the research admission cap have no release path',
 'Charter pillar: research. Found 2026-10-19 while fixing IDEAS-INTAKE-OWNER-1 (PR 2588, idea-hub 1.10.12). idea-hub enqueueAccepted holds a machine-generated ACCEPT as triaged_hold with a ''[research admission cap n/120]'' rationale when research_queue holds 120 or more active or deferred rows, and no step ever re-admits such a row, so every generated accept that arrives while the queue is full is stranded for good. 1.10.12 exempts owner-authored ideas only.' || char(10) ||
 'Doer: the code loop (idea-hub). Lever: add a release step to the hourly triage that re-queues held cap rows oldest first, as many as fit under RESEARCH_ADMISSION_CAP, with a test that fills research_queue to the cap, holds a generated accept, drains the queue and asserts the held row is queued. Keep the cap itself (control_registry row research-admission-cap).' || char(10) ||
 'Definition of done: no idea_proposals row with decision ACCEPT, status triaged_hold and a rationale starting ''[research admission cap'' is older than 120 minutes while research_queue holds fewer than 120 active or deferred rows.' || char(10) ||
 'code-task: repo=qnfo-workers path=idea-hub/worker.js' || char(10) ||
 'code-anchor: [research admission cap '' || ?1 || ''/'' || ?2 || ''] ''',
 'session', 'research', 'high', 'open'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status = 'open' AND title LIKE 'IDEAS-CAP-GENERATED-RELEASE-1:%');

INSERT INTO agent_issues (title, description, source, category, priority, status)
SELECT 'IDEAS-CHAT-SESSION-CAP-SHARE-1: measure what chat-session ideas now add to research_queue',
 'Charter pillar: research. idea-hub 1.10.12 (PR 2588) treats chat-session rows as owner-authored (proposalKind direct), so they skip the research admission cap. Their volume was not measured before the change. If chat-session ideas turn out to be a large share of research_queue, the cap is bypassed in bulk and the owner-corpus and generated producers lose their bound.' || char(10) ||
 'Doer: qnfo-fleet-control metric tick. Lever: register a metric, with its trigger in the same migration, for the share of research_queue rows created in the last 7 days whose idea_proposals source is chat-session; if the share exceeds 25 percent, add a per-source daily bound (a rate, not a hold) in idea-hub enqueueAccepted and record it in control_registry row research-admission-cap.' || char(10) ||
 'Definition of done: the metric exists in metric_registry with a value and a trigger, and either the share is at or below 25 percent or the per-source bound is merged and live.',
 'session', 'research', 'medium', 'open'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE status = 'open' AND title LIKE 'IDEAS-CHAT-SESSION-CAP-SHARE-1:%');
