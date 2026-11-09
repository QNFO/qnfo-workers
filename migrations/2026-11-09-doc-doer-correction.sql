-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET linked_session = 'doer:doc-code-loop' WHERE id IN (1002076, 1002539) AND linked_session = 'doer:program-code-loop';
-- spof-review: no new cron, trigger, binding, host or credential; one UPDATE of two rows.
-- CAUSE-MAPPED: no metric is registered here.
-- DOC-DOERS-1 correction (2026-11-09, charter pillar autonomy). review-gate on PR 9494 found that migrations/2026-11-09-doc-issue-doers.sql matched '%DOC-%' anywhere in a title (LIKE is case-insensitive),
-- so two issues that are not documents were given the document doer: 1002076 (ROADMAP-1 ARCHIVE-MARKER-READ-2, "doc-names-retired-worker" in its title) and 1002539 (WORKER-SOURCE-IN-REPO-1: qnfo-doc-gate).
-- Both go to the program code loop, the doer every other ROADMAP-1 issue has, and the appended Doer line says so.
UPDATE agent_issues SET
  linked_session = 'doer:program-code-loop',
  description = replace(description,
    'Doer: doc-code-loop (DOC-DOERS-1): implement the document as code that cites it (roadmap row, probe, test) or retire it with a backed-up copy; closing probe is the issue-' || id || ' contract.',
    'Doer: program-code-loop (DOC-DOERS-1 correction: not a DOC-* document issue); closing probe is the issue-' || id || ' contract.')
WHERE id IN (1002076, 1002539) AND linked_session = 'doer:doc-code-loop';
