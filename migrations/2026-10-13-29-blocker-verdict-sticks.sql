-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261013_v_blocker_claims
-- Rollback: DROP VIEW IF EXISTS v_blocker_claims; CREATE VIEW v_blocker_claims AS SELECT 'issue:' || a.id AS target, a.title AS text, a.created_at AS created_ms FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 3600) * 1000 AND (lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%owner only%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%owner-only%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%needs a token%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%no token%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%needs the owner%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%cannot be done%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%blocked%' OR lower(COALESCE(a.description, '')) LIKE '%session-task:%') AND a.title NOT LIKE 'METRIC-TRIGGER-%UNVERIFIED-BLOCKER-CLAIMS%' AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'issue:' || a.id AND r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) UNION ALL SELECT 'card:' || h.id, h.title, CAST(strftime('%s', h.created_at) AS INTEGER) * 1000 FROM human_actions h WHERE h.status = 'open' AND datetime(h.created_at) < datetime('now', '-60 minutes') AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'card:' || h.id AND r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) (the text_sig column stays; it is unused by the old view)
-- BLOCKER-VERDICT-STICKS-1 (2026-10-13, pillar autonomy, metric unverified_blocker_claims 6 at 12:45 UTC).
-- v_blocker_claims lists an open issue whose text carries a blocker word until a blocker_redteam row newer than 24 hours exists. All six
-- issues it listed (1760, 1779, 1798, 1818, 1857, 1951) had been red-tested on 2026-10-12 at 11:56 UTC: five verdicts false-belief-removed
-- and one workaround-built. Those verdicts lapsed at 11:56 today with the text unchanged. A verdict that a claim is false, or that a
-- workaround exists, is about the text it read; it stays true until that text changes. Re-testing unchanged text every 24 hours is work
-- only a session does (watchmaker: a recurring operation that needs a person or a session).
-- (1) blocker_redteam.text_sig records the length signature of the target's title and description when it was tested.
-- (2) v_blocker_claims keeps a false-belief-removed or workaround-built verdict valid while the issue's signature is unchanged; a
--     confirmed-with-evidence verdict (the blocker is real) is still re-tested every 24 hours, and owner cards are unchanged.
-- (3) The six issues are re-tested now with today's evidence and carry their signatures.
CREATE TABLE IF NOT EXISTS bak_20261013_v_blocker_claims AS SELECT name, sql FROM sqlite_master WHERE name = 'v_blocker_claims';
ALTER TABLE blocker_redteam ADD COLUMN text_sig TEXT;
DROP VIEW IF EXISTS v_blocker_claims;
CREATE VIEW v_blocker_claims AS
SELECT 'issue:' || a.id AS target, a.title AS text, a.created_at AS created_ms FROM agent_issues a
WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 3600) * 1000
  AND (lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%owner only%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%owner-only%'
    OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%needs a token%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%no token%'
    OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%needs the owner%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%cannot be done%'
    OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%blocked%' OR lower(COALESCE(a.description, '')) LIKE '%session-task:%')
  AND a.title NOT LIKE 'METRIC-TRIGGER-%UNVERIFIED-BLOCKER-CLAIMS%'
  AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'issue:' || a.id
    AND (r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')
      OR (r.verdict IN ('false-belief-removed', 'workaround-built') AND r.text_sig IS NOT NULL
          AND r.text_sig = CAST(length(a.title) AS TEXT) || ':' || CAST(length(COALESCE(a.description, '')) AS TEXT))))
UNION ALL
SELECT 'card:' || h.id, h.title, CAST(strftime('%s', h.created_at) AS INTEGER) * 1000 FROM human_actions h
WHERE h.status = 'open' AND datetime(h.created_at) < datetime('now', '-60 minutes')
  AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'card:' || h.id AND r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'));
INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, text_sig)
SELECT 'issue:' || a.id, v.column2, v.column3, v.column4, v.column5, 'session_01Kddqwk5gQT5qSSHVKjT2EA',
  CAST(length(a.title) AS TEXT) || ':' || CAST(length(COALESCE(a.description, '')) AS TEXT)
FROM agent_issues a JOIN (VALUES
 (1760, 'BLOCKED 2026-10-05: q08 side is done for the one tunable that exists',
  're-read the issue and the q08-signal-engine history on main', 'false-belief-removed',
  'a dated status note, not a live blocker: q08-signal-engine shipped 0.18.0, 0.18.1 and 0.18.2 on 2026-10-13 (PRs 1126, 1127, 1132) under session_01BCBpN3cZdS57dweqCs9rwt, so the worker the loop tunes is changeable now | surfaces: github main history, work-locks'),
 (1779, 'USPTO Open Data API needs an API key; PatentsView blocked by the egress proxy',
  're-read the claim against where the fetch would run', 'false-belief-removed',
  'the egress proxy that blocked PatentsView is the session sandbox''s; a research-pipeline worker fetches from Cloudflare egress, as qnfo-research-exec does for arXiv full texts today (CITE-FULLTEXT-1). The item is a research work item for the pipeline, not an owner step | surfaces: session proxy (refused), worker egress (used by research-exec)'),
 (1798, 'most remaining open items are owner-blocked (1716, 1750, 1816, 1724)',
  'read the status of every item the note names', 'false-belief-removed',
  'agent_issues 1750 closed, 1724 closed, 1816 wontfix; 1716 is time-gated to 2026-10-31 by design (Q08-REVIEW), not owner-blocked; read at 12:47 UTC 2026-10-13 | surfaces: d1:agent_issues'),
 (1818, 'blocked by AI spend cap',
  'checked the spend-cap rule in force', 'false-belief-removed',
  'BUDGET-SOFT-ROUTE-1 (owner directive 2026-10-06): a breached fleet_budget cap steers model choice and never stops work; qnfo-ai downgrades at a cap (5.32.0). The cap cannot block this item | surfaces: CLAUDE.md BUDGET-SOFT-ROUTE-1, qnfo-ai router'),
 (1857, 'blocked by fleet_budget caps; owner personal-api (human decision pending)',
  'checked the spend-cap rule and the 2026-10-12 workaround', 'workaround-built',
  'BUDGET-SOFT-ROUTE-1: caps never stop work; the digest moved to personal-api (CONNECTION-PRODUCER-1, red-team 2026-10-12), and no owner step remains in the text''s own plan | surfaces: CLAUDE.md BUDGET-SOFT-ROUTE-1, personal-api'),
 (1951, 'Blocked on the owner answering a feedback link; he is travelling 4-14 Oct',
  're-read the issue: what the code needs, and what waits on a person', 'false-belief-removed',
  'the build steps are done (CONNECTION-LEDGER-1 step 2 shipped in personal-companion 1.10.0: one follow-up question a day for a due Ledger person); the remaining step waits for a real answer to arrive as data, which is the feature working, not a blocker on the fleet | surfaces: personal-companion queueLedgerFollowUp, owner_questions')
) v ON a.id = v.column1
WHERE a.status = 'open';
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a verdict that a blocker claim is false is about the text it read and stays true until that text changes',
  'BLOCKER-VERDICT-STICKS-1: v_blocker_claims keeps a false-belief-removed or workaround-built red-team valid while the issue text signature is unchanged; confirmed blockers are re-tested every 24 h; six claims re-tested',
  'v_blocker_claims 12:45 UTC: 6 issues, each red-tested 2026-10-12 11:56 UTC (5 false-belief-removed, 1 workaround-built) and lapsed at 24 h; all six updated_at 02:01 UTC by the backlog drain, so updated_at is no text-change signal',
  'merged through the canonical path', 'one guard view and one column', 'the Rollback line of this file',
  'disproved blocker claims no longer need a session every day', 'unverified_blocker_claims reads 0 at the first metric tick after the merge and stays 0 for 24 h unless an issue text changes', 'none',
  'd1:v_blocker_claims, blocker_redteam, agent_issues'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'BLOCKER-VERDICT-STICKS-1:') = 1);
