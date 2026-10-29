-- BLOCKER-CLAIMS-CONFIRMED-STICKS-1 (2026-10-29, charter pillar autonomy; METRIC-TRIGGER-3061 unverified_blocker_claims; issue 1000554; ANTIFRAGILE-1)
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261029_v_blocker_claims
-- Rollback: DROP VIEW IF EXISTS v_blocker_claims; CREATE VIEW v_blocker_claims AS SELECT 'issue:' || a.id AS target, a.title AS text, a.created_at AS created_ms FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 3600) * 1000 AND (lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%owner only%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%owner-only%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%needs a token%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%no token%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%needs the owner%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%cannot be done%' OR lower(a.title || ' ' || COALESCE(a.description, '')) LIKE '%blocked%' OR lower(COALESCE(a.description, '')) LIKE '%session-task:%') AND a.title NOT LIKE 'METRIC-TRIGGER-%UNVERIFIED-BLOCKER-CLAIMS%' AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'issue:' || a.id AND (r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours') OR (r.verdict IN ('false-belief-removed', 'workaround-built') AND r.text_sig IS NOT NULL AND r.text_sig = CAST(length(a.title) AS TEXT) || ':' || CAST(length(COALESCE(a.description, '')) AS TEXT)))) UNION ALL SELECT 'card:' || h.id, h.title, CAST(strftime('%s', h.created_at) AS INTEGER) * 1000 FROM human_actions h WHERE h.status = 'open' AND datetime(h.created_at) < datetime('now', '-60 minutes') AND NOT (h.source = 'owner-request-issue' AND EXISTS (SELECT 1 FROM agent_issues ra JOIN issue_triage rt ON rt.issue_id = ra.id WHERE 'issue-' || ra.id = h.slug AND ra.status IN ('closed', 'resolved') AND COALESCE(trim(rt.close_evidence), '') <> '')) AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'card:' || h.id AND r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')); DELETE FROM failure_modes WHERE fm_key = 'blocker-verdict-confirmed-expires-daily'
-- Rollback scope: the view (the Rollback line carries its previous text; bak_20261029_v_blocker_claims keeps it too) and the registry row; the decision_log row stays (append-only).
-- spof-review: none added. Same reader as before (antifragile tick, metric unverified_blocker_claims, trigger 3061).
--
-- MEASURED (qnfo-audit, 2026-10-29 ~10:00Z, SELECT only). v_blocker_claims lists 23 issues. blocker_redteam holds 9 rows for them, all false-belief-removed, only 2 with a text_sig.
-- A row without text_sig stops counting after 24 hours, so the claim returns daily; a confirmed-with-evidence verdict never stuck on text_sig at all (the view named only
-- false-belief-removed and workaround-built). Issue 1000554 proposed hiding confirmed verdicts forever; that removes the expiry (ANTIFRAGILE-1) and would hide a hold whose text
-- changed. This file instead lets confirmed-with-evidence hold under the same condition as the other two verdicts: while length(title):length(description) still equals the
-- text_sig the red-teamer recorded. A changed issue text re-surfaces the claim. The card: branch is unchanged (a card has no signature column the view can compare).
-- Nothing lists as hidden by this change today (0 confirmed rows among the 23); it takes effect as the red-team loop writes signed confirmed verdicts.
--
-- FIX 2026-10-29 (apply-migrations run 40851908982, statement 4: 10 values for 11 columns): the failure_modes row had no detector text, so the INSERT failed after the view was
-- recreated (applied_before_failure 3). The detector sentence is added; statements 1-3 are idempotent, so the re-apply on merge completes the row and the decision_log entry.
--
-- WHAT THIS FILE DOES
--   1. bak_20261029_v_blocker_claims keeps the live view text; the view is recreated with 'confirmed-with-evidence' added to the signed-verdict list (otherwise byte for byte).
--   2. failure mode blocker-verdict-confirmed-expires-daily.
--   3. one decision_log row.

CREATE TABLE IF NOT EXISTS bak_20261029_v_blocker_claims AS
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
      OR (r.verdict IN ('false-belief-removed', 'workaround-built', 'confirmed-with-evidence') AND r.text_sig IS NOT NULL
          AND r.text_sig = CAST(length(a.title) AS TEXT) || ':' || CAST(length(COALESCE(a.description, '')) AS TEXT))))
UNION ALL
SELECT 'card:' || h.id, h.title, CAST(strftime('%s', h.created_at) AS INTEGER) * 1000 FROM human_actions h
WHERE h.status = 'open' AND datetime(h.created_at) < datetime('now', '-60 minutes')
  AND NOT (h.source = 'owner-request-issue' AND EXISTS (SELECT 1 FROM agent_issues ra JOIN issue_triage rt ON rt.issue_id = ra.id
    WHERE 'issue-' || ra.id = h.slug AND ra.status IN ('closed', 'resolved') AND COALESCE(trim(rt.close_evidence), '') <> ''))
  AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'card:' || h.id AND r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'));

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('blocker-verdict-confirmed-expires-daily',
  'a confirmed-with-evidence red-team verdict on a blocker claim counts only 24 hours, so a verified hold re-enters unverified_blocker_claims every day',
  'v_blocker_claims honored a text_sig only for false-belief-removed and workaround-built',
  'BLOCKER-CLAIMS-CONFIRMED-STICKS-1 (migrations/2026-10-29-blocker-claims-confirmed-sticks.sql): confirmed-with-evidence holds while the text signature matches',
  'no signed confirmed-with-evidence red-team verdict whose text signature still matches is listed by v_blocker_claims',
  'fm-blocker-claims-count-receipts', '2026-10-29', 1000554,
  'a red-team row is written without text_sig or with a verdict the view does not sign',
  'unverified_blocker_claims recurs daily for claims already tested',
  'the metric unverified_blocker_claims and its trigger 3061');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-blocker-claims-1',
  'a confirmed hold is real only while the text it was confirmed against is unchanged; permanent removal drops the expiry',
  'BLOCKER-CLAIMS-CONFIRMED-STICKS-1: v_blocker_claims signed-verdict list gains confirmed-with-evidence',
  'qnfo-audit 2026-10-29: 23 listed claims, 9 red-team rows (all false-belief-removed, 2 signed), 0 confirmed rows; issue 1000554 text read',
  'migration merged', 'one view; no listed claim changes today',
  'the backup table holds the previous view text; the Rollback header restores it',
  'a verified blocker is not re-counted as unverified until its text changes',
  'unverified_blocker_claims does not recur for signed confirmed verdicts; today no change (0 confirmed)',
  'none', 'd1:qnfo-audit v_blocker_claims, blocker_redteam, sqlite_master (SELECT only)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'BLOCKER-CLAIMS-CONFIRMED-STICKS-1:') = 1);
