-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE failure_modes SET remediation = replace(remediation, ' | ASK-PLAIN-3 (qnfo-ai-search 2.10.2): an explain answer is bullet sentences that each restate one listed passage, then one In short line', '') WHERE fm_key = 'ask-circular-explanation'
-- BACKUP: failure_modes
-- spof-review: no new cron, binding, host, credential or critical-path dependency; one failure_modes note and one decision.
-- ASK-PLAIN-3 (2026-10-26, charter pillar reach; qnfo-ai-search 2.10.2). Second live replay (2.10.1, llama-3.3-70b champion): the answer was neither circular nor from memory in the
-- analogy sense, but empty: "It means some things change." and "Condenses means they change into a new form [1]", while the excerpt held the sentences that say which anyons survive and which are
-- confined. The instruction asked for a vacuous summary first and for the phrase to be split into parts, and the excerpt spent room on a second copy of the abstract. The explain answer is now built
-- from the listed passages (bullets that each restate one passage with its citation, then an In short line that only combines them).

UPDATE failure_modes SET remediation = remediation || ' | ASK-PLAIN-3 (qnfo-ai-search 2.10.2): an explain answer is bullet sentences that each restate one listed passage, then one In short line' WHERE fm_key = 'ask-circular-explanation' AND instr(remediation, 'ASK-PLAIN-3') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('claude-code-ask-plain-20261026', 'a weaker writer model explains from the passages it is told to restate, and drifts to filler or memory when it is told only what style to write in',
   'ASK-PLAIN-3 (qnfo-ai-search 2.10.2): explain answer shape changed to bullet sentences that each restate one listed passage with its citation plus one In short line; definition list requires a definitional cue, a case with two terms or three terms (up to 2400 characters); explain excerpt skips a section that only repeats the abstract and carries two body sections; answer cache revision r5',
   'live replays after 2.10.1 deployed, Explain "a subset of anyons in a parent phase condenses" (three runs, llama-3.3-70b): "It means some things change.", "Condenses means they change into a new form [1]", "Change happens in a system."; the excerpt held "anyons that braid trivially with the condensate survive as deconfined child anyons, and those that braid nontrivially are confined" and the child-category sentence',
   'applies with the canonical deploy of qnfo-ai-search 2.10.2', 'qnfo-ai-search explain answers on ask.qwav.tech and the paper-page rail', 'revert qnfo-ai-search to 2.10.1 through the canonical path',
   'ask.qwav.tech explain answers restate the paper''s own defining passages in short sentences',
   'a replay of the same question after the deploy states which anyons survive and which are confined, with citation [1], and no analogy or filler summary', 'ask.qwav.tech and papers.qnfo.org readers who ask what a term means', 'offline suites (ask-plain.test.mjs 56 checks, ask-ground, ask-loop); live replay after the deploy');
