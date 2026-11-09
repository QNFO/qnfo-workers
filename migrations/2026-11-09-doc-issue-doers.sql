-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET linked_session = NULL WHERE linked_session IN ('doer:doc-code-loop','owner-held:doc-legal') AND title LIKE '%DOC-%';
-- DOC-DOERS-1 (2026-11-09, charter pillar autonomy). Every open doer-less DOC-* / DOC-ITEMS / DOC-IS-CODE-1 issue gets a doer. Nothing is retired or deleted here.
-- Patent, legal and filing documents are owner records: they get an IDENTITY-BOUND line (retiring one is irreversible and identity-bound) and stay owner-held.
UPDATE agent_issues SET
  linked_session = 'owner-held:doc-legal',
  description = description || char(10) || 'IDENTITY-BOUND: patent/legal/filing record of the owner; implement-or-retire is irreversible, so only the owner retires it. Default in effect: kept. Closing probe: the issue-' || id || ' contract.'
WHERE status = 'open' AND coalesce(linked_session,'') = ''
  AND (title LIKE '%DOC-%' OR title LIKE '%DOC-IS-CODE-1%')
  AND (lower(title) LIKE '%03-patents%' OR lower(title) LIKE '%patent%' OR lower(title) LIKE '%power-of-attorney%' OR lower(title) LIKE '%provisional%' OR lower(title) LIKE '%gudzinas%');
UPDATE agent_issues SET
  linked_session = 'doer:doc-code-loop',
  description = description || char(10) || 'Doer: doc-code-loop (DOC-DOERS-1): implement the document as code that cites it (roadmap row, probe, test) or retire it with a backed-up copy; closing probe is the issue-' || id || ' contract.'
WHERE status = 'open' AND coalesce(linked_session,'') = ''
  AND (title LIKE '%DOC-%' OR title LIKE '%DOC-IS-CODE-1%');
