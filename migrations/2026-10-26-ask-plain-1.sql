-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-ask-circular-explanation', 'fm-ask-reference-marker-read-as-source', 'fm-ask-answer-cache-outlives-prompt', 'fm-ask-plainness-unmeasured'); DELETE FROM failure_modes WHERE fm_key IN ('ask-circular-explanation', 'ask-reference-marker-read-as-source', 'ask-answer-cache-outlives-prompt', 'ask-plainness-unmeasured'); DELETE FROM analytics_metric_triggers WHERE metric_key = 'ask_plain_share_7d'; DELETE FROM control_registry WHERE control = 'ask-plain-rewrite-gate'
-- spof-review: no new cron, binding, host, credential or critical-path dependency; rows only (four failure modes with detectors, one metric trigger, one guard row, one decision).
-- ASK-PLAIN-1 (2026-10-26, charter pillar reach; qnfo-ai-search 2.10.0). Owner report: on a paper page, Ask answered Explain "a subset of anyons in a parent phase condenses"
-- by repeating that sentence ("... refers to the process of anyon condensation, where a subset of anyons in a parent topological order condenses ..."), which is circular; the brief
-- is that Ask answers use plain, simple language grounded in the existing sources. Replayed live on 2026-10-26 (POST ask.qwav.tech/api/ask, paper pinned, x-qnfo-synthetic): the same failure.
-- Four root causes, each a failure mode below with its own detector: the writer prompt (scholarly prose, no rule against a circular explanation), the excerpt choice (the section holding the
-- wording's own sentence won, the passages that define its terms never reached the writer), a reference marker of the paper ([2]) read as source [2], and a quality measure that cannot see
-- either (the grounding judge calls a sentence copied from an excerpt supported). The fourth is closed by ask_events.plain and the metric ask_plain_share_7d, whose trigger is registered
-- here (METRIC-CLOSED-LOOP-1); ASK-FIX-1 in the worker files a code-task at its kill band with the prompt line as the code-anchor.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('ask-circular-explanation', 'an Ask answer to "Explain <wording>" repeats the wording as its own explanation, in the specialist words the question already used',
  'qnfo-ai-search 2.9.0: (1) the writer prompt asked for scholarly prose and a direct answer, with no rule to say what a term means, keep sentences short or avoid a circular restatement; (2) pinPaper picked the sections that share most words with the question, which are the sections holding the quoted sentence, so the passages that define its terms never reached the writer; (3) nothing checked the opening of an answer for echo or density',
  'ASK-PLAIN-1 (qnfo-ai-search 2.10.0): plain-language and anti-circular prompt rules; explainTarget and definitionPassages put the sentences that define or exemplify the terms in source [1] and leave the wording''s own sentence out of section scoring; plainReport checks the opening (six or more words in a row copied from the wording, sentences over 30 words, a fifth of the words with nine or more letters) and an explain answer that fails is rewritten once, the better draft is kept',
  'ask_plain_share_7d at or above 0.5 (its kill band) once 10 answers carry a verdict', 'fm-ask-circular-explanation', '2026-10-26', NULL,
  'a question that asks what a phrase or term means, on a paper whose text states the phrase in a sentence with no definition beside it',
  'ask_events.answer opens with the quoted wording; the excerpt held the sentence and no passage that explains it; the answer says the excerpts do not explain it',
  'every explain, define and what-is question on ask.qwav.tech and in the paper-page Ask rail, including the select-a-passage Ask'),
 ('ask-reference-marker-read-as-source', 'an answer cites excerpt [2] for a claim the paper makes with its own reference [2], so the citation points at a different paper',
  'the pinned paper''s text carries in-text reference markers ("... of the parent''s [2]."); the writer copied the marker as a citation of excerpt [2]; citation validity counts only numbers outside the range of sources, so a wrong but in-range number passes',
  'ASK-PLAIN-1: stripRefMarks removes reference markers from every excerpt before the writer and the judge read it (excerptBlock)',
  'code: excerptBlock calls stripRefMarks', 'fm-ask-reference-marker-read-as-source', '2026-10-26', NULL,
  'a pinned or read-in-full paper whose body cites its own reference list with bracketed numbers',
  'ask.qwav.tech answers carry [2] or [3] on a claim the first source makes',
  'every Ask answer built from a paper body, in particular the paper-page rail'),
 ('ask-answer-cache-outlives-prompt', 'a fix to the Ask prompt or retrieval does not reach visitors for up to six hours, because the cached answer to the same question is replayed',
  'the answer cache key held the config id, the paper and the question hash; nothing that changes what an answer says (prompt, retrieval) was in it',
  'ASK-PLAIN-1: ANSWER_REV is part of the key and is changed with any prompt or retrieval change',
  'code: ANSWER_REV in the cache key', 'fm-ask-answer-cache-outlives-prompt', '2026-10-26', NULL,
  'a prompt or retrieval change deployed while the cache holds answers to the questions visitors repeat',
  'a replay of the failing question after the deploy returns the old text with cached true',
  'every cached Ask answer, six hours after each deploy'),
 ('ask-plainness-unmeasured', 'a circular or jargon-dense Ask answer scores as fully grounded, so no metric moves while visitors get answers they cannot use',
  'the ASK-LOOP-1 judge asks whether each claim is supported by the excerpts, and a sentence copied from an excerpt is supported; the helpful rate needs 10 ratings in 30 days and the citation metric looks at numbers only',
  'ASK-PLAIN-1: ask_events.plain holds the verdict (1 explain question, 2 echo, 4 dense, 8 rewritten) and the metric ask_plain_share_7d, with its trigger and an ASK-FIX-1 code-anchor, measures it hourly',
  'ask_plain_share_7d measured within the last 24 hours', 'fm-ask-plainness-unmeasured', '2026-10-26', NULL,
  'any answer whose opening is a restatement or a run of long sentences',
  'metric_registry has no ask_plain_share_7d value, or it is older than a day',
  'the quality loop of ask.qwav.tech: the grounded share and the tuning experiments cannot tell a plain answer from a circular one');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-ask-circular-explanation', NULL, 'ASK-PLAIN-1', 'failure-mode detector: the share of Ask answers whose opening passes the plain-language check is not in its kill band (pending until the first measure with 10 verdicts)',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT last_value FROM metric_registry WHERE metric = ''ask_plain_share_7d'') IS NULL THEN ''pending: qnfo-ai-search 2.10.0 (ASK-PLAIN-1) has not measured ask_plain_share_7d yet (it needs 10 answers with a verdict)'' WHEN CAST((SELECT last_value FROM metric_registry WHERE metric = ''ask_plain_share_7d'') AS REAL) >= 0.5 THEN ''ok'' ELSE ''fail: ask_plain_share_7d '' || (SELECT last_value FROM metric_registry WHERE metric = ''ask_plain_share_7d'') || '' is in its kill band (under 0.5)'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-ask-reference-marker-read-as-source', NULL, 'ASK-PLAIN-1', 'failure-mode detector: excerptBlock removes the paper''s reference markers before the writer reads the excerpt',
  '{"paths": ["qnfo-ai-search/worker.js"], "contains": "stripRefMarks(s.excerpt)"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-ask-answer-cache-outlives-prompt', NULL, 'ASK-PLAIN-1', 'failure-mode detector: the answer cache key carries ANSWER_REV, so a prompt or retrieval change is not masked by a cached answer',
  '{"paths": ["qnfo-ai-search/worker.js"], "contains": "ANSWER_REV + cfg.id"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0),
 ('fm-ask-plainness-unmeasured', NULL, 'ASK-PLAIN-1', 'failure-mode detector: ask_plain_share_7d was measured in the last 24 hours (pending until the first measure with 10 verdicts)',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT last_value FROM metric_registry WHERE metric = ''ask_plain_share_7d'') IS NULL THEN ''pending: qnfo-ai-search 2.10.0 (ASK-PLAIN-1) has not measured ask_plain_share_7d yet (it needs 10 answers with a verdict)'' WHEN (SELECT last_refreshed FROM metric_registry WHERE metric = ''ask_plain_share_7d'') >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') THEN ''ok'' ELSE ''fail: ask_plain_share_7d was last measured '' || (SELECT last_refreshed FROM metric_registry WHERE metric = ''ask_plain_share_7d'') END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'ask_plain_share_7d', 'ask.qwav.tech: under half of the answers open in plain language', 'registry', 'lt', 0.5, 6,
       'Pillar reach. Acting loop: ASK-LOOP-1 (qnfo-ai-search) files ASK-FIX-1 with a code-task line (anchor: the plain-language rule of the system prompt) after two daily kill readings and closes it with live evidence. The metric is a proxy (the opening of an answer: six or more words copied from the wording asked about, sentences over 30 words on average, a fifth of the words with nine or more letters); the outcome is ask_helpful_rate_30d. Read ask_events.plain (1 explain, 2 echo, 4 dense, 8 rewritten) with the query and answer columns of the sampled rows for the pattern. Definition of done: the metric is back inside its warning band (0.7) in metric_registry; ASK-LOOP-1 records the before and after values.',
       'qnfo-ai-search', 'digest', 168, 1, 'ASK-PLAIN-1 2026-10-26; acting loop is qnfo-ai-search (digest target avoids a duplicate issue)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'ask_plain_share_7d' AND x.enabled = 1);

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('ask-plain-rewrite-gate', 'qnfo-ai-search worker.js answer(): plainReport after groundBody, one corrective rewrite within PLAIN_RETRY_BEFORE_MS and PLAIN_RETRY_MS', 'guard',
  'a circular or dense explanation reaching a visitor (ASK-PLAIN-1)', 0, 'keep', 'applied',
  'it never withholds an answer: when the rewrite errors, times out or is no better the first checked draft is sent unchanged (badness compare and the catch around the second call); ask_events.plain records the verdict either way',
  '2026-10-26', 'qnfo-ai-search/ask-plain.test.mjs end-to-end sections 1 to 4: the plain rewrite is sent, a rewrite that is no better is not used, a plain first draft is not rewritten, a non-explain question is never rewritten', NULL);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('claude-code-ask-plain-20261026', 'an Ask answer to a request to explain a phrase says what the phrase means in plain words from the paper''s own passages, and the quality loop can tell when it does not',
   'ASK-PLAIN-1 (qnfo-ai-search 2.10.0): prompt rules for plain language and against a circular explanation; explain questions get the defining and exemplifying sentences of the paper in source [1] and the wording''s own sentence out of section scoring; reference markers stripped from excerpts; the opening of an explain answer is checked and rewritten once; answer cache keyed by revision; ask_events.plain and ask_plain_share_7d with trigger and ASK-FIX-1 anchor',
   'live replay 2026-10-26 of Explain "a subset of anyons in a parent phase condenses" on a-two-index-framework-for-the-bulk-boundary-correspondence-of-anyon-condensation: answer opened by quoting the paper sentence (nine words in a row), said the excerpts "do not explain in detail" the phrase, put the definition (anyons that braid trivially survive, the others are confined) under related work and cited [2], the paper''s own reference marker, as source 2; the paper body holds the explaining sentences (definition of the child category, the worked cases) which pinPaper did not select',
   'applies with the canonical deploy of qnfo-ai-search 2.10.0', 'qnfo-ai-search answers on ask.qwav.tech and the paper-page rail; a failure of the rewrite sends the first checked draft, as before', 'revert qnfo-ai-search to 2.9.0 through the canonical path; DELETE rows named in the Rollback line of migrations/2026-10-26-ask-plain-1.sql',
   'ask.qwav.tech answers in plain language from the paper''s own passages, and the fleet measures it',
   'ask_plain_share_7d reads at least 0.7 at the first measure with 10 verdicts and stays there; a replay of the same question after the deploy lists the child-category definition among its excerpts, does not open with the quoted wording and cites only source numbers that exist', 'ask.qwav.tech and papers.qnfo.org readers who ask what a term means', 'offline suites qnfo-ai-search/ask-plain.test.mjs (51 checks) and the existing ask suites; live replay before the fix (reproduced); live replay after the deploy');
