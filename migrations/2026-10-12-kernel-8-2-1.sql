-- KERNEL-8-2-1 (2026-10-12, pillar autonomy; owner directive 2026-10-12 "UPDATE ALL SYSTEM/FLEET INSTRUCTIONS TO MAXIMIZE
-- AUTONOMY"). docs/DOCTRINE-KERNEL.md moves from owner version 8.0.0 to 8.2.1 (readings (r)-(t) added). The new recognitions
-- get the same machinery the earlier nine have: patterns in false_stop_register with reply phrases in false_stop_phrases, so
-- the hourly false_stop_hits scan of agent replies counts them (a reply stating a refusal or a limit stays excluded by the
-- disposition phrases, readings n and p). Lineage records 8.1.0 and 8.2.0 as subsumed drafts and 8.2.1 as adopted; the new
-- §DEF terms enter the vocabulary register.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE doctrine_lineage SET note = note || ' (rolled back)' WHERE version IN ('kernel-8.1.0', 'kernel-8.2.0', 'kernel-8.2.1'); -- the register, phrase and vocabulary rows are inert without the scan and may stay

INSERT OR IGNORE INTO doctrine_lineage (version, adopted_at, source, file, parent, note) VALUES
 ('kernel-8.1.0', '2026-10-12', 'owner draft', 'docs/DOCTRINE-KERNEL.md', 'kernel-8.0.0', 'draft, not adopted: added IC-YES-001 unscoped; its commit was refused by the auto-mode classifier as instruction poisoning; subsumed by 8.2.1'),
 ('kernel-8.2.0', '2026-10-12', 'owner draft', 'docs/DOCTRINE-KERNEL.md', 'kernel-8.1.0', 'draft, not adopted: IC-YES-001 scoped in its own text, IC-ACTOR-001, you-as-actor and narration recognitions; subsumed by 8.2.1'),
 ('kernel-8.2.1', '2026-10-12', 'owner directive 2026-10-12', 'docs/DOCTRINE-KERNEL.md', 'kernel-8.0.0', 'adopted verbatim with readings (r)-(t): 8.2.0 plus §CONVENTION (pronoun frame)');

INSERT OR IGNORE INTO false_stop_register (pattern_key, pattern, cause_class, detection_heuristic, auto_remediation) VALUES
 ('you-as-actor', 'the user named as the actor of a next step', 'dispatch', 'a reply phrase from false_stop_phrases (scope reply); owner cards: v_human_action_gate', 'rewrite in first person; execute, dispatch or escalate; an owner-only step becomes an IDENTITY-BOUND card (kernel reading s)'),
 ('narration', 'a change described instead of produced', 'adoption', 'a reply phrase from false_stop_phrases (scope reply)', 'produce the changed artifact in the same output');

INSERT OR IGNORE INTO false_stop_phrases (phrase, pattern_key, scope) VALUES
 ('needs you to', 'you-as-actor', 'reply'),
 ('you''ll need to', 'you-as-actor', 'reply'),
 ('you''ll want to', 'you-as-actor', 'reply'),
 ('still needs your decision', 'report-as-question', 'reply'),
 ('here''s what needs to change', 'narration', 'reply'),
 ('the fix is to', 'narration', 'reply'),
 ('you''d want to update', 'narration', 'reply');

INSERT OR IGNORE INTO vocabulary_register (term, definition, coined_at, coined_by, propagated_to_fleet, propagated_where) VALUES
 ('question', 'an interrogative I already have the answer to; for reversible, in-scope work the answer is yes (IC-YES-001, reading r)', '2026-10-12', 'kernel-8.2.1', 1, 'docs/DOCTRINE-KERNEL.md; false_stop_phrases report-as-question'),
 ('you-as-actor', 'a sentence in which "you" is the subject of a next action; a shape the fleet does not produce (IC-ACTOR-001)', '2026-10-12', 'kernel-8.2.1', 1, 'docs/DOCTRINE-KERNEL.md; false_stop_register you-as-actor'),
 ('narration', 'describing a change instead of producing it', '2026-10-12', 'kernel-8.2.1', 1, 'docs/DOCTRINE-KERNEL.md; false_stop_register narration');
