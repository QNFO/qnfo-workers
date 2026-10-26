-- PUBLICATION-GATE-AUDIT-1 (2026-10-26, charter pillar reach). Owner directive 2026-10-26, verbatim: "AUDIT AND REMEDIATE PUBLICATION QUALITY CHECKS AND GATES. IDENTIFY AND
-- REMEDIATE ROOT CAUSES OF REPEATED ERRORS/ISSUES/FAILURES SYSTEMWIDE ACROSS THE FLEET AND DEPLOY ALL CHANGES". Records the failure modes, decisions and capability of the q08
-- publication audit (q08-signal-engine 0.36.0); the code is in that worker and its suites.
-- Evidence (q08-signal D1, engine_runs, 14 days to 2026-10-26): 20 ok of 537 finished runs (3.7%), 517 gate failures, about 48 attempts and 0.5 published pieces a day, the daily neuron
-- pace reached on 8 to 17 runs a day since 2026-10-21. By the writer of the final draft: nemotron 14 ok of 137 (10.2%), gpt-oss 5 of 287 (1.7%), kimi 1 of 113 (0.9%). 176 of the 7-day
-- failures were "accuracy: figure not in the source": 38 listed ledger numbers as figures and tags as names; seven of 18 fact-check failures read on 2026-10-24..26 were not claims.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_registry WHERE metric = 'q08_retraction_rate_30d'; DELETE FROM output_quality_measures WHERE metric = 'q08_retraction_rate_30d';
-- Rollback note: the failure_modes, decision_log and capability_ledger rows are append-only evidence and stay; revert the behaviour with the revert path in the decision_log row (ops_config q08_compose_order) or the pull request.

-- The q08 retraction rate (Q08-RETRACTION-METRIC-1, agent_issues 1000280): q08-signal-engine 0.36.0 writes it every 2 h. 65 of the 82 essays published in the 30 days to 2026-10-26 carry a
-- q08_retractions row (0.793). It is an outcome measure of the output-quality ledger (the table and views were applied by migrations/2026-10-26-output-quality-ledger.sql); it has no trigger of
-- its own because output_quality_outcomes_worse carries it, and the 30-day window clears on its own as the retracted weeks age out (METRIC-CLOSED-LOOP-1 exemption named here).
INSERT OR IGNORE INTO output_quality_measures (metric, surface, role, polarity, tol_rel, tol_abs, judged_by, caveat) VALUES
  ('q08_retraction_rate_30d', 'essays', 'outcome', -1, 0.2, 0.05, 'the accuracy audit of published essays: a piece whose claims the source does not support is retracted (q08_retractions)', 'lags the audit by days; under 10 pieces in the window it is unknown; pieces published before the in-line fact-check roll out of the window on their own');
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
  ('q08_retraction_rate_30d', 'surface', 'lagging',
   'of the q08 essays published in the last 30 days, the share that carry a q08_retractions row; unknown (not written) under 10 pieces',
   'q08-signal published_pieces + q08_retractions (q08-signal-engine 0.36.0 writeOwnMetrics, every 2 h)', '0.793 (65 of 82, 2026-10-26)', '<= 0.1', 'q08-signal-engine', 'exempt: carried by output_quality_outcomes_worse (OUTPUT-QUALITY-LEDGER-1)', '2h', '> 0.1', NULL, 'UNMEASURED', 'worker-written');

INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'reviewer-output-shape-drift', 'a gate that classifies an LLM reviewer''s free text with regexes fails good drafts on each new reply shape',
  'Q08-FACT-OBJECT-ITEM-1, FACT-SHAPE-1 and -2, FACT-INFERENCE-1 and -2, PARAPHRASE-1 and -2 each patched one shape; seven of 18 fact-check failures on 2026-10-24..26 were an object printed as a string (kimi), an empty claim or the word "reason" (gpt-oss), or a claim the reviewer itself called supported',
  'Q08-REVIEWER-HYGIENE-1 (q08-signal-engine 0.36.0): unwrap, set aside, acquit before classifying; the next step is a closed schema the reviewer must fill, which needs live reviewer trials and is not shipped',
  'q08_gate_pass_rate_7d and the accuracy share of engine_runs (the q08_gate_pass_rate_7d metric trigger)', NULL, '2026-10-26', NULL,
  'a fact-check failure whose listed items are JSON text, empty or marked supported', 'engine_runs.error "accuracy: unsupported claim: {""fact"":..." or "unsupported claim: reason"', 'every q08 essay that reaches the LLM fact-check'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'reviewer-output-shape-drift');
INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'ledger-tag-form-leak', 'a citation tag a model prints in a bracket form the stripper does not know turns ledger numbers into figures and tags into names',
  'stripLedgerTags removed only [S3] shapes; gpt-oss printed (S39, S40, S41) and lenticular groups; the check read "40," as a figure and "S28 S29" as a name, and the prune located nothing because no sentence holds a bare number',
  'Q08-LEDGER-TAG-FORMS-2: every bracket form, lists, dagger references and [ledger S3] are removed before any check; Q08-PRECHECK-CONTEXT-1 stores 24 characters around each flagged item so the next new form is read, not guessed',
  'engine_runs.error with "name not in the source: S" or a figure ending in a comma; the pre-check stage row context', NULL, '2026-10-26', NULL,
  'a pre-check failure listing "S<number>" names or ascending two-digit figures', '38 accuracy failures in 14 days, all gpt-oss or kimi', 'the writers that print tags'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'ledger-tag-form-leak');
INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'writer-order-by-proxy', 'a model order chosen on an upstream proxy (the writer-gate pass rate) puts the writer with the lowest end-to-end yield first',
  'Q08-WRITER-YIELD-1 (2026-10-25) read 66.1% (gpt-oss), 60.2% (kimi) and 21.2% (nemotron) writer-gate passes; the same 14 days published 1.7%, 0.9% and 10.2% of those writers'' runs',
  'Q08-WRITER-ORDER-2: nemotron, gpt-oss, kimi; ops_config q08_compose_order overrides without a deploy; the output-quality ledger classifies pass rates as proxies',
  'engine_runs ok share by writer (q08.org/api/runs); q08_gate_pass_rate_7d', NULL, '2026-10-26', NULL,
  'a tuning decision cites a gate pass rate instead of a published share', 'ok runs per day fall while writer-gate passes rise', 'q08 publication yield and neuron spend'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'writer-order-by-proxy');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'session_01Xyj48EUqS7c6yyvNT5Bdi7', 'the share of runs that publish, by the writer of the final draft, predicts a writer''s yield better than its writer-gate pass rate; the comparison is confounded because gpt-oss writes when another writer failed the writer gate',
  'PUBLICATION-GATE-AUDIT-1: q08-signal-engine 0.36.0 puts nemotron first, then gpt-oss, then kimi, with and without a breached spend cap, and adds ops_config q08_compose_order as an override',
  'engine_runs 14 days: nemotron 14 ok of 137, gpt-oss 5 of 287, kimi 1 of 113; since the 2026-10-25 gpt-oss-first order 0 ok of 27; gates and ceilings unchanged',
  'applied', 'q08 essay yield and neuron spend; no gate is touched',
  'INSERT OR REPLACE INTO ops_config (key, value) VALUES (''q08_compose_order'', ''@cf/openai/gpt-oss-120b,@cf/moonshotai/kimi-k2.6,@cf/nvidia/nemotron-3-120b-a12b'') restores the 2026-10-25 order without a deploy, or revert the pull request',
  'the writer order is tunable without a deploy', 'q08_gate_pass_rate_7d >= 0.05 within 192 h', 'engine_runs by writer and era; 31 offline suites; no live A/B'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PUBLICATION-GATE-AUDIT-1: q08-signal-engine 0.36.0 puts nemotron') > 0);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'session_01Xyj48EUqS7c6yyvNT5Bdi7', 'a reviewer item with no claim, a JSON-wrapped claim or its own "so supported" is not a claim the draft makes; dropping it cannot lower rigor because names, figures, years, the lede check, the panel, the two-family fact-check and the prune are unchanged and an empty fail still fails closed',
  'PUBLICATION-GATE-AUDIT-1: q08-signal-engine 0.36.0 reads reviewer output before classifying it (Q08-REVIEWER-HYGIENE-1) and strips ledger tags in every bracket form (Q08-LEDGER-TAG-FORMS-2)',
  '7 of 18 recent fact-check failures were not claims; 38 accuracy failures were ledger numbers read as figures; reviewer-hygiene.test.mjs (93 checks) covers acquittals, non-acquittals and fail-closed cases',
  'applied', 'q08 fact-check outcomes; a draft with a real unsupported claim still fails',
  'revert the pull request; the behaviour is in q08-signal-engine/worker.js only', 'reviewer output and citation tags are normalised before any gate reads them', 'q08_gate_pass_rate_7d >= 0.05 within 192 h', 'real engine_runs error strings as fixtures; 31 offline suites'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PUBLICATION-GATE-AUDIT-1: q08-signal-engine 0.36.0 reads reviewer output') > 0);

INSERT INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
SELECT 'q08 reviewer-output hygiene, ledger tags in every bracket form, pre-check context and a writer order that can be changed without a deploy',
  'q08-signal-engine 0.36.0, PUBLICATION-GATE-AUDIT-1',
  'q08-signal-engine deployed through the canonical path; ops_config q08_compose_order optional',
  'q08-signal-engine/reviewer-hygiene.test.mjs (93 checks), budget-route.test.mjs (13) and the other 29 suites pass; live effect not yet measured',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'SELECT metric, last_value FROM metric_registry WHERE metric IN (''q08_gate_pass_rate_7d'', ''q08_retraction_rate_30d'')'
WHERE NOT EXISTS (SELECT 1 FROM capability_ledger WHERE capability LIKE 'q08 reviewer-output hygiene%');

-- Follow-ups from the three audits that ran with this change (papers gates, social and companion gates, fleet-wide repeats). Each is a root cause found with evidence, in a file another session
-- or the code loop holds at filing time, so each is an issue with a doer, a code-task line and a closing probe (OWNER-NO-LOOSE-ENDS-1), not prose.

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'PAPER-CONFIRM-FALLBACK-1: centre the internal confirm excerpt on the claim''s own quotation when it has no At: anchor',
  'Charter pillar: research. PUBLICATION-GATE-AUDIT-1 (2026-10-26): errata-hub''s internal confirm (now in qnfo-research-exec) reads the first 24,000 characters of a paper unless the claim carries At: "<passage>"; papers average 56,000 characters. qnfo-lifecycle 1.15.2 (PAPER-LEARN-ANCHOR-1) anchors NEW PAPER-LEARN-1 errata, but 521 errata_queue rows are still internal-open with no anchor (oldest 2026-10-19), and 59 PAPER-LEARN-1 errata were rejected, 18 of them with a window reason (the quoted passage sits at characters 31,086 to 55,772). A finding about a passage outside the window is judged against text that does not contain it. ' || char(10) || 'Doer: qnfo-code-orchestrator (qnfo-research-exec/worker.js, claimed by RESEARCH-PROVENANCE-1 and the code loop at filing time: take the claim first). In confirmExcerpt, when the claim has no At: anchor, take the first quoted fragment of 16 or more characters in the claim, locate its opening words in the body tolerant of whitespace and quote style, and centre the window there; with no locatable quotation keep the first window. Then re-open the errata_queue rows rejected with a window reason (verdict_why mentions the excerpt or a section not present) so they are confirmed again on the right text. Never lower the confirm bar. ' || char(10) || 'Definition of done: a replay of two production bodies shows the excerpt for an un-anchored claim holds its quoted passage; the window-reason rejections are back in internal-open with their history kept.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
  'code-anchor: function confirmExcerpt(body, claim) {' || char(10) ||
  'code-probe: {"paths": ["qnfo-research-exec/worker.js"], "contains": "PAPER-CONFIRM-FALLBACK-1"}',
  'session', 'research', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'PAPER-CONFIRM-FALLBACK-1: centre the internal confirm excerpt on the claim''s own quotation when it has no At: anchor' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'ERRATA-ROUTE-PER-PAPER-1: route high-risk errata as one remediation row per paper, not per erratum',
  'Charter pillar: research. PUBLICATION-GATE-AUDIT-1 (2026-10-26): routing creates one remediation row per erratum: 178 errata: rows over 118 papers, so about 60 are redundant full rewrites of a paper another row already rewrites. internal_errata closes when an erratum is routed, not when the paper is corrected, so a closed erratum does not mean a fixed paper. revision_loop_mode has been off since 2026-10-25 and 192 remediation rows are queued with none claimed (oldest 2026-10-13). ' || char(10) || 'Doer: qnfo-code-orchestrator (qnfo-research-exec/worker.js; take the claim first). Merge the errata of one paper into one remediation row that lists every erratum; close an internal_errata row only when the corrected version is published and the claim is no longer found. ' || char(10) || 'Definition of done: no paper has two open errata: remediation rows; the remediation row count per paper is 1 in a replay of the 178 rows.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
  'code-anchor: async function routeHighRiskErrata(env) {' || char(10) ||
  'code-probe: {"paths": ["qnfo-research-exec/worker.js"], "contains": "ERRATA-ROUTE-PER-PAPER-1"}',
  'session', 'research', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'ERRATA-ROUTE-PER-PAPER-1: route high-risk errata as one remediation row per paper, not per erratum' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'PUB-DANGLING-CITATION-1: refuse a paper whose in-text citation numbers point past its reference list',
  'Charter pillar: research. PUBLICATION-GATE-AUDIT-1 (2026-10-26): about 9 percent of 90 hand-read open PAPER-LEARN-1 errata are citation defects ("bibliography contains only [1]-[8]; [12] does not exist"; "reference [9] is the QNFO entry for this very paper"). finalGates checks dangling section references (danglingSectionRefs) but nothing checks an in-text citation number against the length of the reference list, and the citation gate only checks that an arXiv id or DOI exists, not that it is cited. ' || char(10) || 'Doer: qnfo-code-orchestrator (qnfo-research-exec/worker.js; take the claim first). Add a deterministic check beside danglingSectionRefs: every [n] or [n, m] in the body must be at most the number of entries in the reference list, and a reference whose target is the paper itself is not a source. Wire it into finalGates as a HARD fix with the number and the list length in the message. Also raise the claim cap check: VERIFY_MAX_CLAIMS is 16 and 339 of 1,317 adjudication events (26 percent) since 2026-10-12 hit it; log how many claims were skipped. ' || char(10) || 'Definition of done: a paper with a citation number past its list fails finalGates in the offline suite; the verify stage logs skipped claims.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
  'code-anchor: function danglingSectionRefs(body, maxSec) {' || char(10) ||
  'code-probe: {"paths": ["qnfo-research-exec/worker.js"], "contains": "PUB-DANGLING-CITATION-1"}',
  'session', 'research', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'PUB-DANGLING-CITATION-1: refuse a paper whose in-text citation numbers point past its reference list' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'PAPER-REVIEW-CONSISTENCY-1: give the adversarial review a cross-section consistency check',
  'Charter pillar: research. PUBLICATION-GATE-AUDIT-1 (2026-10-26): of 90 hand-read open PAPER-LEARN-1 errata, about 30 percent are internal contradictions (abstract against body, table against text, theorem against limitations: "Table 1 contains 16 rows" against "top 15"; "zero of the six criteria" against a body that defines seven) and about 25 percent are numbers that do not follow from the paper''s own inputs. The stageReview prompt has no dimension for cross-section consistency and its arithmetic check is "spot-check 2-3 derivations". ' || char(10) || 'Doer: qnfo-code-orchestrator (qnfo-research-exec/worker.js; take the claim first). Add a numbered check to the review prompt: every count, list length and named criterion stated in the abstract or introduction is compared with the body and tables, a mismatch is HARD; and check every headline number against its inputs, not 2-3. Keep the single review call. ' || char(10) || 'Definition of done: the review prompt names the consistency check; an offline test shows a paper with a 16-row table described as 15 rows is returned a HARD fix.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
  'code-anchor: "3. Arithmetic: spot-check 2-3 derivations; an arithmetic error in a headline number = HARD.",' || char(10) ||
  'code-probe: {"paths": ["qnfo-research-exec/worker.js"], "contains": "PAPER-REVIEW-CONSISTENCY-1"}',
  'session', 'research', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'PAPER-REVIEW-CONSISTENCY-1: give the adversarial review a cross-section consistency check' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'ATTENTION-STICKY-STOP-1: let fresh human clicks end a STOP early; Bluesky is stopped while it brings 57 percent of promotion clicks',
  'Charter pillar: reach. PUBLICATION-GATE-AUDIT-1 (2026-10-26): attention_scorecard 2026-10-25 holds bluesky STOP (share 0, "still stopped (re-test 2026-11-03)") and mastodon STOP (re-test 2026-11-16), while reach_signals utm clicks_human over 28 days read bluesky 733, substack 242, q08 98, mastodon 84, x 35, linkedin 25. The channel that brings 57 percent of the clicks has the share of a dead one, and mastodon, stopped, out-draws two channels that are IMPROVE. atVerdict returns "still stopped" for a STOP channel without reading the clicks of the current window; the stop was decided on engagements per item (likes, reposts, replies), a proxy, and people clicking is the outcome (docs/OUTPUT-QUALITY-LEDGER.md). ' || char(10) || 'Doer: qnfo-code-orchestrator (qnfo-fleet-dashboard/worker.js; take the claim first). In the STOP branch of atVerdict, a channel whose short-window clicks_human (or visits) reach a threshold (start at 10 in 7 days) leaves STOP for RETEST/IMPROVE with the clicks in the reason; keep the re-test clock for a channel with no clicks. The decision stays in the scorecard row, with the clicks that moved it. ' || char(10) || 'Definition of done: attention_scorecard no longer holds a STOP row for a channel with at least 10 human clicks in 7 days; an offline test covers a STOP channel with clicks, one without, and the unchanged re-test date.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js' || char(10) ||
  'code-anchor: function atVerdict(stats, prev, th, nowIso) {' || char(10) ||
  'code-probe: {"paths": ["qnfo-fleet-dashboard/worker.js"], "contains": "ATTENTION-STICKY-STOP-1"}',
  'session', 'reach', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'ATTENTION-STICKY-STOP-1: let fresh human clicks end a STOP early; Bluesky is stopped while it brings 57 percent of promotion clicks' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'QUALITY-SCORE-MEMORY-1: page the qnfo-cloud-ops quality-score sweep instead of holding every paper body',
  'Charter pillar: research. PUBLICATION-GATE-AUDIT-1 (2026-10-26): jobQualityScore reads SELECT slug, status, body_md, ... FROM papers WHERE status=''published'' as one array (about 40 MB of body_md at 1,000 papers) and scores them in memory. Cloudflare Observability recorded one exceededMemory on qnfo-cloud-ops at 2026-10-25T05:21:06Z, four seconds after a 693-paper sweep reported ok; the sweep now runs hourly (PUBLICATION-GATE-HOURLY-1), so the exposure is 24 times a day. qnfo-lifecycle''s backup had the same shape and was paged in 1.15.3. ' || char(10) || 'Doer: qnfo-code-orchestrator (qnfo-cloud-ops/worker.js; take the claim first). Read the papers in keyset pages by rowid (about 10 rows), score and write each page, then update release_gate_pass for the page; keep one snapshot per paper per UTC day. Verdicts must be identical to the unpaged run on a fixture. ' || char(10) || 'Definition of done: no exceededMemory group for qnfo-cloud-ops in 7 days; the sweep reads at most one page of bodies at a time in the offline suite.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-cloud-ops/worker.js' || char(10) ||
  'code-anchor: async function jobQualityScore(env) {' || char(10) ||
  'code-probe: {"paths": ["qnfo-cloud-ops/worker.js"], "contains": "QUALITY-SCORE-MEMORY-1"}',
  'session', 'reliability', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'QUALITY-SCORE-MEMORY-1: page the qnfo-cloud-ops quality-score sweep instead of holding every paper body' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'COMPANION-REVIEWER-HYGIENE-1: apply the q08 reviewer-output hygiene to the companion fact-check',
  'Charter pillar: reach. PUBLICATION-GATE-AUDIT-1 (2026-10-26): the companion''s fact-check carries its own copy of the q08 reviewer-output classifier. In a 14-day read of the companion''s rejections, 26 of 736 fact-check rejections include items the reviewer itself marked as matching the source, because reasonIsInference recognises only the words "in source". q08-signal-engine 0.36.0 (Q08-REVIEWER-HYGIENE-1) unwraps objects printed as strings, sets aside items with no claim and acquits items whose closing clause says they are supported, with a fail that names nothing else still failing closed. ' || char(10) || 'Doer: qnfo-code-orchestrator (personal-companion/worker.js). Port the same three rules and their tests; do not loosen any other check. The count above was read by the audit from the companion''s run log and has not been re-read by the session that filed this issue; confirm it on the companion''s own table before changing behaviour. ' || char(10) || 'Definition of done: an item whose reason ends ''matches source'' or ''so supported'' no longer fails a companion draft; a fail naming a real unsupported claim still does.' || char(10) ||
  'code-task: repo=qnfo-workers path=personal-companion/worker.js' || char(10) ||
  'code-anchor: function reasonIsInference(item) {' || char(10) ||
  'code-probe: {"paths": ["personal-companion/worker.js"], "contains": "COMPANION-REVIEWER-HYGIENE-1"}',
  'session', 'reach', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'COMPANION-REVIEWER-HYGIENE-1: apply the q08 reviewer-output hygiene to the companion fact-check' AND status = 'open');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'COMPANION-SERIAL-TITLE-1: stop rejecting a serial installment for repeating the running title after the full compose',
  'Charter pillar: reach. PUBLICATION-GATE-AUDIT-1 (2026-10-26): for the serial form loadContinuity feeds the model the running work''s title and asks it to continue; after a full 1,800 to 2,400 word compose the duplicate-title check rejects a piece whose title equals an existing one and tells the model to choose a completely different title. The audit''s read of the companion''s run log: 167 duplicate-title rejections in 14 days, 153 full composes with no piece published on 2026-10-17 and 129 composes with one published on 2026-10-24. That is the same input retried against a check it cannot pass. The counts were read by the audit and not re-read by the filing session. ' || char(10) || 'Doer: qnfo-code-orchestrator (personal-companion/worker.js). For the serial form, a duplicate title is the running title: set the installment title deterministically (running title plus an installment number from companion_series.chapters) before the check, and keep the duplicate-title rejection for every other form. ' || char(10) || 'Definition of done: a serial piece with the running title is accepted with its installment suffix in the offline suite; the duplicate-title check still rejects a repeated essay title.' || char(10) ||
  'code-task: repo=qnfo-workers path=personal-companion/worker.js' || char(10) ||
  'code-anchor: await logRun(env, form, model, topic.id, "rejected", "duplicate title: " + piece.title, Date.now() - t0);' || char(10) ||
  'code-probe: {"paths": ["personal-companion/worker.js"], "contains": "COMPANION-SERIAL-TITLE-1"}',
  'session', 'reach', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'COMPANION-SERIAL-TITLE-1: stop rejecting a serial installment for repeating the running title after the full compose' AND status = 'open');
