-- BLOCKER-CLAIMS-RECEIPTS-1 (2026-10-19, charter pillar autonomy; METRIC-TRIGGER-3061 unverified_blocker_claims; ANTIFRAGILE-1; OWNER-NO-LOOSE-ENDS-1)
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_v_blocker_claims
-- Rollback: DROP VIEW IF EXISTS v_blocker_claims; CREATE VIEW v_blocker_claims AS SELECT 'issue:' || a.id AS target, a.title AS text, a.created_at AS created_ms FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 3600) * 1000 AND (lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%owner only%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%owner-only%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%needs a token%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%no token%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%needs the owner%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%cannot be done%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%blocked%' OR lower(COALESCE(a.description, '')) LIKE '%session-task:%') AND a.title NOT LIKE 'METRIC-TRIGGER-%UNVERIFIED-BLOCKER-CLAIMS%' AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'issue:' || a.id AND (r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours') OR (r.verdict IN ('false-belief-removed', 'workaround-built') AND r.text_sig IS NOT NULL AND r.text_sig = CAST(length(a.title) AS TEXT) || ':' || CAST(length(COALESCE(a.description, '')) AS TEXT)))) UNION ALL SELECT 'card:' || h.id, h.title, CAST(strftime('%s', h.created_at) AS INTEGER) * 1000 FROM human_actions h WHERE h.status = 'open' AND datetime(h.created_at) < datetime('now', '-60 minutes') AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'card:' || h.id AND r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')); DELETE FROM blocker_redteam WHERE actor = 'session_01JADz8uHqYt9eUMBTwbbBE6' AND attempt LIKE 'BLOCKER-CLAIMS-RECEIPTS-1%'; DELETE FROM remediation_contracts WHERE class = 'fm-blocker-claims-count-receipts'; DELETE FROM failure_modes WHERE fm_key = 'blocker-claims-count-receipts'
-- Rollback scope: the view (the Rollback line carries its previous text; bak_20261019_v_blocker_claims keeps it too), six red-team rows and the registry rows; the decision_log row stays (append-only).
-- spof-review: none added. The view is read by the antifragile tick (metric unverified_blocker_claims, trigger 3061); the detector fm-blocker-claims-count-receipts is the second path.
--
-- MEASURED (qnfo-audit, 2026-10-19 15:35Z, SELECT only). v_blocker_claims lists 17: six issues and eleven open owner cards (103-108, 112-114, 116, 117).
-- The eleven cards are receipts. owner_request_requires_card writes one human_actions row (source owner-request-issue, "Open fleet.qnfo.org and decide or dismiss this card") when an
-- owner-request issue CLOSES; v_human_action_gate grades every such card receipt. All eleven point at issues that are closed with close_evidence (103 -> issue 2783, 104 -> 2865,
-- 105 -> 2900, 106 -> 2933, 107 -> 99956, 108 -> 100023, 112 -> 2811, 113 -> 100085, 114 -> 2899, 116 -> 100131, 117 -> 100129). A receipt asserts that work is done, not that
-- something is blocked, and a red-team row on it only holds for 24 hours (the view has no text signature for cards), so the claim would return daily: 17 open receipts exist and
-- 17 more were rerouted, every one for a closed issue. The view now leaves out a receipt whose issue is closed or resolved with non-empty close_evidence; a receipt for an open issue
-- or a closed issue without evidence still counts, so nothing a person could be waiting on is hidden.
-- The six issues are red-teamed below. The view matches words (owner only, blocked, session-task:) and four of the six matched the word in a place that is not a blocker (a data-source
-- label, a metric name, a column name, a quoted SQL fragment); two (2068, 2111) are claims that a session or a claim holds the work. Each was attempted with what exists
-- (GET /work-locks, git grep on origin/main, deployment_history, the issue's own contract) and none is confirmed, so each row is false-belief-removed with the text signature the
-- view reads (length(title):length(description)), which holds until the text changes.
--
-- WHAT THIS FILE DOES
--   1. bak_20261019_v_blocker_claims keeps the live view text; the view is recreated with the receipt exclusion (otherwise byte for byte).
--   2. six blocker_redteam rows with evidence and text signatures.
--   3. failure mode blocker-claims-count-receipts and detector fm-blocker-claims-count-receipts (a listed card whose issue is closed with evidence; reads 0 after this file, 11 before).
--   4. one decision_log row.

CREATE TABLE IF NOT EXISTS bak_20261019_v_blocker_claims AS
  SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'view' AND name = 'v_blocker_claims';

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
  AND NOT (h.source = 'owner-request-issue' AND EXISTS (SELECT 1 FROM agent_issues ra JOIN issue_triage rt ON rt.issue_id = ra.id
    WHERE 'issue-' || ra.id = h.slug AND ra.status IN ('closed', 'resolved') AND COALESCE(trim(rt.close_evidence), '') <> ''))
  AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'card:' || h.id AND r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'));

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, text_sig)
SELECT 'issue:1947', 'owner only',
  'BLOCKER-CLAIMS-RECEIPTS-1: read the issue text for the matched phrase and for any step that waits on the owner',
  'false-belief-removed',
  'The only match is "owner private ideas feed (QNFO ideas, owner only)", the name of one of the intake sources the issue lists (idea_proposals source tags); no step waits on the owner. Its contract is active and reads fail on idea_topic_concentration_30d (a measurement, with a doer: the idea-hub loops). Nothing to unblock.',
  'session_01JADz8uHqYt9eUMBTwbbBE6', '91:6194'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'issue:1947' AND attempt LIKE 'BLOCKER-CLAIMS-RECEIPTS-1%');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, text_sig)
SELECT 'issue:2068', 'Blocked now only by the work claim of session_013sMN4pr2RGmHezM4Gm6fMk on qnfo-ops/worker.js (expires 17:58Z)',
  'BLOCKER-CLAIMS-RECEIPTS-1: GET https://qnfo-deploy-guard.q08.workers.dev/work-locks at 2026-10-19T15:37Z, git grep on origin/main, deployment_history, the issue contract',
  'false-belief-removed',
  'No live claim on file:qnfo-ops/worker.js (work-locks count 56, none on qnfo-ops); the change shipped: qnfo-ops worker.js on origin/main carries OPS-CONTEXT-COMPACT-1 and OPS-CONTEXT-COMPACT-2 (VERSION 2.50.6-codeagent) and deployment_history has 2.50.5-context-compact-2 success at 2026-10-19T13:23:03Z. The remaining wait is the contract probe, which needs 3 ops_ai_log job rows after that deploy and a prompt-token maximum under 800000: a measurement window with a doer (the loop), not a blocker.',
  'session_01JADz8uHqYt9eUMBTwbbBE6', '163:2479'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'issue:2068' AND attempt LIKE 'BLOCKER-CLAIMS-RECEIPTS-1%');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, text_sig)
SELECT 'issue:2111', 'session-task: repo=qnfo-workers path=qnfo-code-orchestrator/worker.js',
  'BLOCKER-CLAIMS-RECEIPTS-1: git grep EDIT-INDENT-TOLERANT-1 on origin/main, the issue contract probe text',
  'false-belief-removed',
  'The session-task line is a routing tag of the session that built the fix, not a step that still waits on a session: EDIT-INDENT-TOLERANT-1 occurs 4 times in qnfo-code-orchestrator/worker.js on origin/main (VERSION 0.23.0-edit-reliability). The contract issue-2111 is active and reads pending until 2026-10-20T11:47:00Z (24 h after SEARCH-NEAREST-1 went live at 2026-10-19T11:46:58Z), then counts the "occurs 0 times in the shown content" failures in 7 days: TIME-GATED, not blocked.',
  'session_01JADz8uHqYt9eUMBTwbbBE6', '118:3733'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'issue:2111' AND attempt LIKE 'BLOCKER-CLAIMS-RECEIPTS-1%');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, text_sig)
SELECT 'issue:2953', 'blocked',
  'BLOCKER-CLAIMS-RECEIPTS-1: read the matched sentence of the description',
  'false-belief-removed',
  'The word is the metric name "open-twin-blocked = 170 (9 issues, now fixed by PR 2008 CARRIED-BY-TWIN-1)" in the issue''s measurement of the oscillation; nothing is blocked. The issue is VERIFICATION-OSCILLATION-1 with an active contract and a doer (qnfo-fleet-control TRIGGER-RECOVERY-1 and the monitoring park).',
  'session_01JADz8uHqYt9eUMBTwbbBE6', '126:3872'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'issue:2953' AND attempt LIKE 'BLOCKER-CLAIMS-RECEIPTS-1%');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, text_sig)
SELECT 'issue:99916', 'session-task:',
  'BLOCKER-CLAIMS-RECEIPTS-1: read the matched text',
  'false-belief-removed',
  'The match is the SQL fragment a.description LIKE ''%session-task:%'' quoted in the metric trigger''s lever (the query that lists session-dependent issues); the issue itself names no session step. METRIC-TRIGGER ticket of session_dependent_issues_open, closed by TRIGGER-RECOVERY-1 when the metric is clear for 60 minutes.',
  'session_01JADz8uHqYt9eUMBTwbbBE6', '113:413'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'issue:99916' AND attempt LIKE 'BLOCKER-CLAIMS-RECEIPTS-1%');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, text_sig)
SELECT 'issue:99948', 'blocked',
  'BLOCKER-CLAIMS-RECEIPTS-1: read the matched text',
  'false-belief-removed',
  'The word is the column name "blocked" in the lever query SELECT property, stage, in_flight, waiting, held, blocked, over_sla ... FROM v_content_stage_summary; nothing is blocked. METRIC-TRIGGER ticket of content_items_over_stage_sla; the lever is the research queue throughput (RESEARCH-BACKPRESSURE-1), not a person.',
  'session_01JADz8uHqYt9eUMBTwbbBE6', '98:410'
WHERE NOT EXISTS (SELECT 1 FROM blocker_redteam WHERE target = 'issue:99948' AND attempt LIKE 'BLOCKER-CLAIMS-RECEIPTS-1%');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('blocker-claims-count-receipts',
  'unverified_blocker_claims counts an owner receipt card as a claim that something is blocked, so it never reads 0 and a red-team row on a card expires after 24 hours',
  'v_blocker_claims lists every open human_actions card older than 60 minutes; owner_request_requires_card files a receipt card (source owner-request-issue, gate receipt) when an owner-request issue closes, and the owner dismisses it at leisure; 17 open receipts existed on 2026-10-19, every one for an issue closed with evidence',
  'BLOCKER-CLAIMS-RECEIPTS-1 (migrations/2026-10-19-blocker-claims-receipts.sql): the view leaves out a receipt whose issue is closed or resolved with close_evidence',
  'no card listed by v_blocker_claims is a receipt of an issue closed with evidence',
  'fm-blocker-claims-count-receipts', '2026-10-19', NULL,
  'an owner-request issue closes and its receipt card stays open',
  'unverified_blocker_claims 17 with 11 cards that assert completion',
  'the metric unverified_blocker_claims and its trigger 3061; no loop acts on a card');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-blocker-claims-count-receipts', NULL, 'BLOCKER-CLAIMS-RECEIPTS-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_blocker_claims b JOIN human_actions h ON ''card:'' || h.id = b.target WHERE h.source = ''owner-request-issue'' AND EXISTS (SELECT 1 FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE ''issue-'' || a.id = h.slug AND a.status IN (''closed'', ''resolved'') AND COALESCE(trim(t.close_evidence), '''') <> '''')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a card that receipts a finished owner request is not a blocker claim; a claim is red-teamed by attempting it, and six text matches that name no blocker are recorded as false beliefs with the signature the view reads',
  'BLOCKER-CLAIMS-RECEIPTS-1: v_blocker_claims excludes a receipt card whose issue is closed with evidence; six blocker_redteam rows (issues 1947, 2068, 2111, 2953, 99916, 99948); failure mode blocker-claims-count-receipts and its detector',
  'qnfo-audit 2026-10-19 15:35Z: 17 claims = 6 issues + 11 cards, all 11 cards source owner-request-issue, gate receipt, issue closed with close_evidence; work-locks has no claim on qnfo-ops/worker.js; qnfo-ops 2.50.5-context-compact-2 deployed 13:23Z; EDIT-INDENT-TOLERANT-1 x4 in qnfo-code-orchestrator on origin/main',
  'migration merged', 'one view and six append-only rows; unverified_blocker_claims falls from 17 to 0 at the next tick; a receipt for an open issue or a closed issue without evidence still counts',
  'the backup table holds the previous view text; the Rollback header names the delete of the rows',
  'a completed-work receipt is not counted as a blocker, and a red-team verdict on text that names no blocker does not expire daily',
  'unverified_blocker_claims = 0 within 1 h',
  'none',
  'd1:qnfo-audit v_blocker_claims, human_actions, issue_triage (SELECT only); work-locks; git grep origin/main; offline node:sqlite suite migrations/detector-measurement-repairs.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'BLOCKER-CLAIMS-RECEIPTS-1:') = 1);
