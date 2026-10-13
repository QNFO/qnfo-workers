-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = 'on', note = 'hold lifted by rollback of 2026-10-13-27', updated_at = datetime('now') WHERE key = 'companion_generation'; UPDATE control_registry SET disposition_state = 'applied', evidence = evidence || ' | rolled back' WHERE control = 'companion-generation-hold'
-- COMPANION-GENERATION-HOLD-1 (2026-10-13, pillar personal; agent_issues 2222).
-- The owner wrote at 11:26 UTC (session_01BCBpN3cZdS57dweqCs9rwt, verbatim): "Absolutely no reading.q08 content! And q08.org content
-- is totally lacking in context and big-picture systems analysis. Fail, not worth publishing." Whether the first sentence forbids
-- reading.q08 content or reports that the site has none, a companion piece in its current form (a retelling of one Wikipedia article
-- or paper, with no systems analysis) fails the bar the owner set in the same message. personal-companion 1.19.7 (same pull request)
-- starts no generation while ops_config companion_generation reads hold; this file sets it, with its reason and its release condition.
-- Release: a migration sets the key to on once the companion writes to the owner's bar (verified background and a required systems
-- analysis, the q08-signal-engine 0.18.0 pattern) and the owner's reading of the first sentence is settled. Until then nothing new reaches
-- reading.q08.org or its subscribers. The hold stops no other job of the worker (brief, owner questions, ledger, audits, retractions).
INSERT INTO ops_config (key, value, note, updated_at) VALUES ('companion_generation', 'hold',
  'COMPANION-GENERATION-HOLD-1: owner 2026-10-13 11:26 UTC "Absolutely no reading.q08 content! ... Fail, not worth publishing."; release by migration when the writer meets the systems-analysis bar and the owner reading is settled',
  datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, note = excluded.note, updated_at = excluded.updated_at;
INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES
 ('companion-generation-hold', 'personal-companion generationHold (ops_config companion_generation)', 'hold',
  'publishing reading.q08.org pieces the owner rejected on 2026-10-13 (no context, no big-picture systems analysis)', 0, 'keep', 'applied',
  'set ops_config companion_generation = on by migration; the manual /run route (companion key) is unaffected', NULL,
  'owner 2026-10-13 11:26 UTC, verbatim in session_01BCBpN3cZdS57dweqCs9rwt: "Absolutely no reading.q08 content! And q08.org content is totally lacking in context and big-picture systems analysis. Fail, not worth publishing."; expiry: the release condition in migrations/2026-10-13-27-companion-generation-hold.sql',
  2222, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'an owner verdict of "fail, not worth publishing" on the fleet''s published prose outranks a publication metric; holding generation is reversible, publishing a rejected piece to subscribers is not',
  'COMPANION-GENERATION-HOLD-1: personal-companion 1.19.7 and ops_config companion_generation = hold stop new reading.q08.org pieces until the writer meets the owner''s systems-analysis bar',
  'owner message 2026-10-13 11:26:03 UTC (android) in session_01BCBpN3cZdS57dweqCs9rwt; companion_runs 5397-5411 (11:00 UTC draft: a retelling of the Wikipedia article on Luis Frois, no systems analysis); q08-signal-engine 0.18.0 Q08-CONTEXT-1 answers the same message for q08.org',
  'merged through the canonical path', 'new companion pieces and their subscriber mail; nothing else', 'set ops_config companion_generation = on, or revert personal-companion 1.19.7',
  'the fleet can stop one publication without a deploy', 'the 12:00 UTC companion tick logs a held row and starts no generation; companion_pieces gains no row while the key reads hold', 'none',
  'd1:ops_config, companion_runs, companion_pieces; session events of session_01BCBpN3cZdS57dweqCs9rwt'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-GENERATION-HOLD-1:') = 1);
