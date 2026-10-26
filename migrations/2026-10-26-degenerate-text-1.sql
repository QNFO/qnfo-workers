-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: SELECT 'No-op: the issues, failure modes, contracts, control row and the append-only decision, blocker, capability and session records stay; the code is reverted through git, and ops_config degenerate_text_withdraw = off turns the withdrawal into a revise without a deploy. The living-paper data rollback is the revert line in decision_log.rollback_path for DEGENERATE-TEXT-1.';
-- DEGENERATE-TEXT-1 (2026-10-26, charter pillar research; owner: "ERRORS LIKE THIS CAN NEVER MAKE IT PAST REVIEW/PUBLISH GATES" and "REMEDIATE FAILURE MODES AND THEIR ROOT CAUSES. DEPLOY CHANGES AND CLOSEOUT IMMEDIATELY").
--
-- What happened. Paper qnf-d66c40b5-a032-4dd5-9eed-60a048efe521 (idea proposal 1145, Passive Fault Tolerance via Bruhat-Tits Tree Codes) was public from 03:02:39Z on
-- 2026-10-26 with 8,122 consecutive "Te" tokens, a 24,586-character first paragraph of repeated "The paper is written in LaTeTe" ahead of its Abstract, a title cut from the
-- raw idea ("... Claim: encoding quantum information on Bruhat-Tits trees (p-adic ultrametric geometry) y"), subsections 4.3 to 4.9 under section 6, and an abstract whose
-- headline result (logical error under 10^-3 at p = 10%) its own section 4.8 contradicts (0.795). Read from living-paper (papers, paper_change_ledger), qnfo-audit
-- (research_queue, cloud_ops_events) and QNFO/qnfo-research runs/cycle-391/<slug>/review-report.md; SELECT only.
--
-- The chain, one gate each.
--   1. Producer. 01:51:03Z reconcile-incomplete-draft: draft-0 "ends mid-text: La La La La". The reconcile model looped; stageReconcile keeps any output of 10,000
--      characters or more, so the 24 k-character loop was the reconciled paper; reconcile-deterministic flagged "Duplicated paragraph n-gram: paper written latetete"
--      as a warn. 02:02:40Z complete wrote the real paper after the loop (steps=continue:16205).
--   2. Review. The final review-report.md lists 8 HARD findings and every one is still true in the published text (H3: "2 x 10^4" against Equation (5) = 92; H2: the 75%
--      claim against the paper's own analysis; H4 to H8: citations used without their full text, one saying "specific quantitative results are not addressed here").
--      triageHardFindings demoted all 8 as drift (review-triage cycle=1 block=0 demoted=8, 02:51:57Z; cycle=2 block=0 demoted=8): reviewStillPresent counts only spans
--      between quotation marks, and the reviewer claim field is the verbatim sentence without quote marks. research_queue.context then read hardLeft 0, verdict revise.
--   3. Verify. VERIFY-AUTOCORRECT-1 (02:43:00Z) rewrote the stated 0.472 as 0.46909446 inside "1 - 0.528 = 0.46909446", a line that is false on its face.
--   4. Release gate. releaseGateVerdict (publish) and pubGateScore (hourly sweep) score length, references, a literature heading and a table; the loop raised the length
--      term and the paper scored 100 (ok). The title is the raw idea cut at 140 characters (ensurePaperRow fallback) because the loop left no H1.
--   5. Sweep. 03:20:56Z the v2 structure gate withdrew it for the wrong reason (quality:internal-artifact); 07:21:28Z PUB-GATE-NO-WITHDRAW-1 restored every quality
--      quarantine whatever its body; 09:47:50Z a hand repair removed the two appendices and re-checked the result with the same blind gate (score 100).
--
-- Done in this session. qnfo-cloud-ops 1.41.0 (pub-gate-v5-degenerate): the DEGENERATE-TEXT detector (qnfo-cloud-ops/degenerate-text.mjs; no hit on any of the 950 living-paper
-- bodies except this paper), a per-paper ledgered withdrawal (at most 10 a run, never an owner paper, ops_config degenerate_text_withdraw = off reverts it), a restore hold for
-- a body that still scans degenerate, and a fresh lane every tick for papers published or changed in the last 90 minutes. The paper itself was withdrawn by hand at 20:43Z
-- with the same detector, a backup row (living-paper papers_degenerate_bak_20261026) and a ledger row (paper_change_ledger seq 1692, withdrawal 1); papers.qnfo.org returns
-- 404 for its page, its .md and its PDF, and its sitemap entry is gone.
-- Not done here, and why. qnfo-research-exec/worker.js was under the code loop live claim ct_im1000472 (RESEARCH-ERRATA-CLAIM-1, until 22:16:52Z, with two more code tasks queued
-- on it), so the producer fixes are three code tasks with acceptance tests and closing probes. A parity suite already in the repository (qnfo-research-exec/degenerate-wiring.test.mjs)
-- reads PENDING until the block is in that file and then holds the wiring.

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'DEGENERATE-TEXT-PRODUCER-1: qnfo-research-exec keeps a model loop as the paper, has no repetition gate and titles a paper from the raw idea (paper qnf-d66c40b5 published with an 8,122-token loop)',
  'Charter pillar: research (OUTPUT-QUALITY-LEDGER-1; owner 2026-10-26: errors like this can never make it past review or publish gates). Evidence: see migrations/2026-10-26-degenerate-text-1.sql (the chain, one gate each). The publication sweep of qnfo-cloud-ops 1.41.0 now withdraws such a paper within ten minutes; this issue closes the producer, which still writes and publishes one.' || char(10) ||
  'CHANGE, one pull request on qnfo-research-exec/worker.js (minor VERSION bump, deployed-current.worker.js identical; take the claim file:qnfo-research-exec/worker.js first, it was held by the code loop task ct_im1000472 when this was written):' || char(10) ||
  '(1) Insert the block between the DEGENERATE-TEXT-BEGIN and DEGENERATE-TEXT-END markers of qnfo-cloud-ops/degenerate-text.mjs, byte for byte, immediately before function releaseGateVerdict.' || char(10) ||
  '(2) releaseGateVerdict: first statements scan = degenerateTextScan(md); if (scan.withdraw) return { pass: 0, reason: ("quality:" + scan.reason).slice(0, 220) }; if (scan.found) return { pass: 0, reason: ("quality:repetition " + scan.degenerateTokens + " of " + scan.tokens + " tokens in " + scan.regions + " region(s), longest " + scan.longest).slice(0, 220) }. The verdict then equals the qnfo-cloud-ops one (fail-closed.test.mjs holds the parity).' || char(10) ||
  '(3) finalGates: a HARD fix with id gate-degenerate when degenerateTextScan(paper).found, and one when preHeadingText(paper).chars is above DEGEN_PREHEADING_MAX (claim: N characters of text ahead of the first heading); fix text: remove the repeated passage and the text ahead of the first heading, then write the missing content from what the paper already derives.' || char(10) ||
  '(4) stageReconcile: after the writer drafts are read, a draft that scans degenerate is stripped with degenerateTextStrip, or dropped when the loop is over 10 percent of it or under 6,000 characters remain; the model output gets the same treatment and, when rejected (over 10 percent, or under 10,000 characters left), is treated as empty so the existing best-leg path runs; log an event reconcile-degenerate with the scan reason; when every draft is a loop, markError "reconcile: every writer draft is a model loop" so the row re-runs from ground.' || char(10) ||
  '(5) publishStageV2 (after the floor check) and publishV2 (beside the structural gate): refuse a body that scans degenerate (markError, or gate-blocked with a gov_gate_log BLOCK row for DEGENERATE-TEXT-1).' || char(10) ||
  '(6) ensurePaperRow: the fallback title comes from a new function ideaTitle(idea): the idea first sentence (up to a period followed by Claim: or an em dash), never containing Claim:, at most 140 characters cut at a word boundary, never empty; export it for the test.' || char(10) ||
  '(7) RESIDUE_PATTERNS: add /^\s*\*{0,2}TOPIC COMPLEXITY ASSESSMENT\b/im and /\bAn exceptional synthesis of your work\b/i (two papers carry assistant text ahead of the first heading: a-unified-framework-for-superdeterminism-neurobiology-and-the-mechanics-of-human-meaning, published and already release_gate_pass 0, and psychogenic-doctrine-of-geopolitical-conflict, quarantined).' || char(10) ||
  'ACCEPTANCE: node qnfo-research-exec/degenerate-wiring.test.mjs prints PENDING until the block is in the file and then must pass all of its checks (block identical, releaseGateVerdict parity, gate-degenerate in finalGates, reconcile-degenerate in stageReconcile, ideaTitle in ensurePaperRow).' || char(10) ||
  'Definition of done: that suite passes; the canonical deploy is verified live (qnfo-research-exec /health version at or above the bump); the row d66c40b5-a032-4dd5-9eed-60a048efe521 is then re-armed so the paper is regenerated under the new gates (research_queue status queued, stage ground, error NULL, and the living-paper row set from quarantined to draft with change_actor and change_reason); fm-degenerate-text-published reads ok.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
  'code-anchor: function releaseGateVerdict(md) {' || char(10) ||
  'code-probe: {"paths": ["qnfo-research-exec/worker.js"], "contains": "DEGENERATE-TEXT-BEGIN"}',
  'session', 'research', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM agent_issues
  WHERE title LIKE 'DEGENERATE-TEXT-PRODUCER-1:%'
    AND status = 'open'
);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'REVIEW-TRIAGE-CLAIM-1: review triage demotes every HARD finding as drift because it looks for quote marks around the reviewer claim, which is already the verbatim sentence (8 true findings published with paper qnf-d66c40b5)',
  'Charter pillar: research (OUTPUT-QUALITY-LEDGER-1). Evidence: the final review of paper qnf-d66c40b5 (QNFO/qnfo-research runs/cycle-391/passive-fault-tolerance-via-bruhat-tits-tree-codes-claim-encoding-quantum-inform/review-report.md) lists 8 HARD findings and each is still true in the published text: H3 says the paper states a cooling-power gap of 2 x 10^4 (Eq. 5) while Equation (5) gives about 92; H2 says the 75 percent claim is contradicted by the paper own analysis; H4 to H8 say citations are used without their full text. cloud_ops_events (job qnfo-research-exec, row d66c40b5) read review-triage cycle=1 block=0 demoted=8 drift:H1..H8 at 2026-10-26T02:51:57Z and cycle=2 block=0 demoted=8 at 02:34:33Z; research_queue.context read hardLeft 0, verdict revise; the paper published at 03:02:39Z. Across the 8 papers published in the 24 hours to 2026-10-26 20:40Z at least one had its last review end this way (fm-review-triage-all-demoted).' || char(10) ||
  'Root cause: reviewStillPresent(f, paper) tests only spans that reviewQuotedSpans finds between quotation marks in claim + reason. The reviewer schema puts the paper sentence itself in claim, without quote marks, so for a finding whose reason holds no quote the answer is false; triageHardFindings then demotes the finding as drift whenever cycle is above 0 and its signature (id + first 140 characters) is not in the previous cycle, which a revise that rewords the sentence guarantees. A paper leaves review with every HARD finding recorded as SOFT.' || char(10) ||
  'Change (qnfo-research-exec/worker.js, one hunk and its test): reviewQuotedSpans also returns the claim itself when it has 16 or more characters; reviewStillPresent compares after normalising whitespace, Unicode hyphens (U+2010 to U+2015), doubled LaTeX backslashes and markdown emphasis marks, and also accepts a 60-character window of the claim; a finding whose claim is still in the paper blocks (subject to REVIEW_TRIAGE_CAP, where the rest are over-cap, never drift). Write REVIEW-TRIAGE-CLAIM-1 in the comment above reviewFindingSig.' || char(10) ||
  'Definition of done: review-converge.test.mjs gains a case where claim is a sentence of the paper and reason has no quote: present is true and the finding blocks at cycle 1; a case where the claim text was edited out of the paper: it is demoted as drift (convergence kept); replaying the 8 findings of cycle 391 against the published body blocks 6 and over-caps 2; fm-review-triage-all-demoted reads ok.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
  'code-anchor: function reviewQuotedSpans(f) {' || char(10) ||
  'code-probe: {"paths": ["qnfo-research-exec/worker.js"], "contains": "REVIEW-TRIAGE-CLAIM-1"}',
  'session', 'research', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM agent_issues
  WHERE title LIKE 'REVIEW-TRIAGE-CLAIM-1:%'
    AND status = 'open'
);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'VERIFY-AUTOCORRECT-PRECISION-1: the verify autocorrection replaces a stated result by the script value at full precision and leaves the displayed chain, so the corrected line is false (1 - 0.528 = 0.46909446)',
  'Charter pillar: research (OUTPUT-QUALITY-LEDGER-1). Evidence: cloud_ops_events verify-autocorrect at 2026-10-26T02:43:00Z for row d66c40b5: claim=Q14 from=0.472 to=0.46909446. Paper qnf-d66c40b5 section 4.3 derived 0.99^63 as 10^-0.2772 = 0.528 (rounded intermediates) and stated 1 - 0.528 = 0.472; the autocorrection changed only the result, so the published line read 1 - 0.528 = 0.46909446. Five verify-autocorrect events in the 72 hours to 2026-10-26 20:40Z add four or more digits to the stated value (fm-verify-autocorrect-precision), for example row 14cfba3a: 2.60 to 2.617914.' || char(10) ||
  'Root cause: autoCorrectNumeric rewrites one stated number to the computed value at full precision wherever the number is unique, without regard to the precision of the inputs displayed beside it, so a derivation that shows rounded intermediates becomes arithmetically false.' || char(10) ||
  'Change (qnfo-research-exec/worker.js, autoCorrectNumeric and its test): when the stated value sits on a line that shows other numbers (a displayed derivation), round the replacement to the significant digits of the stated value (0.472 becomes 0.469, not 0.46909446); where the rounded script value differs from the stated one by more than the displayed rounding allows, skip it as ambiguous so verify falls through to revise; log verify-autocorrect with both precisions. Write VERIFY-AUTOCORRECT-PRECISION-1 in the comment above the function.' || char(10) ||
  'Definition of done: an autoCorrectNumeric case with "1 - 0.528 = 0.472" and script value 0.46909446 yields 0.469 or a skip, never 0.46909446; fm-verify-autocorrect-precision reads ok over 72 hours.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
  'code-anchor: function autoCorrectNumeric(' || char(10) ||
  'code-probe: {"paths": ["qnfo-research-exec/worker.js"], "contains": "VERIFY-AUTOCORRECT-PRECISION-1"}',
  'session', 'research', 'medium', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM agent_issues
  WHERE title LIKE 'VERIFY-AUTOCORRECT-PRECISION-1:%'
    AND status = 'open'
);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
  'degenerate-text-published',
  'A model loop (a token or phrase repeated thousands of times) is published as part of a paper',
  'Five gates read the wrong thing. stageReconcile accepts a model output of 10,000 characters or more, so a 24,586-character loop became the reconciled paper, and its duplicate n-gram finding is a warn; finalGates has no repetition check (gate-preamble reads 500 characters for English reasoning phrases); releaseGateVerdict and pubGateScore score length, references, a literature heading and a table, so a loop raises the score (100 for qnf-d66c40b5); the sweep quarantined the paper for another reason and then restored every quality quarantine whatever its body (PUB-GATE-NO-WITHDRAW-1); and a hand repair of the appendices was re-checked with the same blind gate.',
  'qnfo-cloud-ops 1.41.0 (DEGENERATE-TEXT-1): detector with no false positive on 950 bodies, per-paper withdrawal (ops_config degenerate_text_withdraw = off reverts it), restore hold, fresh lane every tick; the paper withdrawn with a backup; DEGENERATE-TEXT-PRODUCER-1 wires the same block into qnfo-research-exec (reconcile, finalGates, releaseGateVerdict, publish, title).',
  'fm-degenerate-text-published d1-query@living-paper: a published non-owner paper whose release_gate_reason names quality:degenerate-text. The gate withdraws every one it can within ten minutes; a row left is held by the per-run cap, by the off setting or by an error.',
  'fm-degenerate-text-published',
  '2026-10-26',
  (SELECT id FROM agent_issues WHERE title LIKE 'DEGENERATE-TEXT-PRODUCER-1:%' AND status = 'open' ORDER BY id DESC LIMIT 1),
  'a language model generation runs to its token cap in a loop and the output is longer than the length check',
  'a paper page shows thousands of repeated tokens; once the gate withdraws it papers.qnfo.org/papers/<slug>, its .md and its PDF return 404',
  'the paper page, its PDF, its sitemap entry, the Substack and Bluesky roll-ups and every reader who opens it before the fresh lane runs'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'fm-degenerate-text-published',
  NULL,
  'qnfo-cloud-ops 1.41.0 is deployed (pub-gate-v5-degenerate)',
  'failure-mode detector',
  'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM papers WHERE status = ''published'' AND identifier NOT LIKE ''qnfo-2025%'' AND release_gate_reason LIKE ''%quality:degenerate-text%'') THEN ''degenerate-text-published'' ELSE ''ok'' END AS observed',
  'd1-query@living-paper',
  1000,
  'qnfo-cloud-ops',
  1,
  'active',
  'failure-mode'
);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
  'review-triage-all-demoted',
  'The review gate lets a paper through with every HARD finding still true, because triage records them as drift',
  'reviewStillPresent counts only spans between quotation marks; the reviewer claim field is the verbatim sentence without quote marks, so after cycle 0 every finding is drift unless its id and first 140 characters repeat from the last cycle, and a revise that rewords the sentence breaks that.',
  'REVIEW-TRIAGE-CLAIM-1 (code task on qnfo-research-exec).',
  'fm-review-triage-all-demoted d1-query: a research row published in the last 24 hours whose last review-triage event reads block=0 with three or more drift demotions.',
  'fm-review-triage-all-demoted',
  '2026-10-26',
  (SELECT id FROM agent_issues WHERE title LIKE 'REVIEW-TRIAGE-CLAIM-1:%' AND status = 'open' ORDER BY id DESC LIMIT 1),
  'a paper is revised after a review that raised HARD findings and the next review words them differently',
  'review-report.md of a published paper lists HARD findings that are true in the published text; review-triage events end block=0 demoted=N drift',
  'every pipeline paper that reaches its second review cycle'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'fm-review-triage-all-demoted',
  NULL,
  'REVIEW-TRIAGE-CLAIM-1 is implemented in qnfo-research-exec',
  'failure-mode detector',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM research_queue q WHERE q.status = ''published'' AND q.published_at >= strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-24 hours'') AND (SELECT e.text FROM cloud_ops_events e WHERE e.job = ''qnfo-research-exec'' AND e.kind = ''review-triage'' AND e.text LIKE ''row='' || q.id || ''%'' ORDER BY e.ts DESC LIMIT 1) LIKE ''%block=0 demoted=%drift:%'' AND (SELECT e.text FROM cloud_ops_events e WHERE e.job = ''qnfo-research-exec'' AND e.kind = ''review-triage'' AND e.text LIKE ''row='' || q.id || ''%'' ORDER BY e.ts DESC LIMIT 1) NOT LIKE ''%demoted=1 %'' AND (SELECT e.text FROM cloud_ops_events e WHERE e.job = ''qnfo-research-exec'' AND e.kind = ''review-triage'' AND e.text LIKE ''row='' || q.id || ''%'' ORDER BY e.ts DESC LIMIT 1) NOT LIKE ''%demoted=2 %'') = 0 THEN ''ok'' ELSE ''published-with-all-hard-demoted'' END AS observed',
  'd1-query',
  1000,
  'qnfo-research-exec',
  1,
  'active',
  'failure-mode'
);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
  'verify-autocorrect-precision',
  'A verify autocorrection makes a displayed derivation false',
  'autoCorrectNumeric rewrites a unique stated number to the computed value at full precision and leaves the rounded intermediates shown beside it (1 - 0.528 = 0.472 became 1 - 0.528 = 0.46909446).',
  'VERIFY-AUTOCORRECT-PRECISION-1 (code task on qnfo-research-exec).',
  'fm-verify-autocorrect-precision d1-query: a verify-autocorrect event in the last 72 hours whose replacement has four or more digits more than the stated value.',
  'fm-verify-autocorrect-precision',
  '2026-10-26',
  (SELECT id FROM agent_issues WHERE title LIKE 'VERIFY-AUTOCORRECT-PRECISION-1:%' AND status = 'open' ORDER BY id DESC LIMIT 1),
  'a verify pass finds a stated result that differs from the script value at the stated precision and the derivation above it shows rounded intermediates',
  'a published equation chain whose last step does not follow from the ones before it',
  'every pipeline paper with a displayed derivation that verify autocorrects'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES (
  'fm-verify-autocorrect-precision',
  NULL,
  'VERIFY-AUTOCORRECT-PRECISION-1 is implemented in qnfo-research-exec',
  'failure-mode detector',
  'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''verify-autocorrect'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-72 hours'') AND length(substr(text, instr(text, '' to='') + 4)) >= length(substr(text, instr(text, '' from='') + 6, instr(text, '' to='') - instr(text, '' from='') - 6)) + 4) THEN ''autocorrect-added-precision'' ELSE ''ok'' END AS observed',
  'd1-query',
  1000,
  'qnfo-research-exec',
  1,
  'active',
  'failure-mode'
);

INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
SELECT
  'degenerate-text-withdraw',
  'qnfo-cloud-ops pubGateScore, pubGateVerdict and jobQualityScore (DEGENERATE-TEXT-1, 1.41.0): a published non-owner paper that scans as a model loop is quarantined singly, at most DEGEN_WITHDRAW_MAX (10) a run, by the hourly sweep and by the fresh lane every tick',
  'gate',
  'a model loop (thousands of repeated tokens) staying public: paper qnf-d66c40b5 scored 100 with an 8,122-token loop on 2026-10-26',
  0,
  'keep',
  'applied',
  'ops_config degenerate_text_withdraw = off turns the withdrawal into a revise (release_gate_pass 0, paper stays published, first in the revision loop), the PUB-GATE-NO-WITHDRAW-1 posture, without a deploy; the per-run cap of 10 is the backpressure that keeps a detector fault from emptying the site',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'Zero hits on 950 living-paper bodies except the one paper (measured 2026-10-26 with the detector as shipped); qnfo-cloud-ops/degenerate-text.test.mjs holds the withdrawal, the owner-paper exemption, the cap, the off setting and the restore hold on a fake D1 with the real paper-ledger migration. A rule that withdraws is a trade against the owner PUB-GATE-NO-WITHDRAW-1 directive of 2026-10-26 (no safety checks the owner did not ask for); the owner asked on the same day that errors like this never pass a gate, the class is unambiguous, and the one exception is a switch away from the old posture.',
  (SELECT id FROM agent_issues WHERE title LIKE 'DEGENERATE-TEXT-PRODUCER-1:%' AND status = 'open' ORDER BY id DESC LIMIT 1),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM control_registry WHERE control = 'degenerate-text-withdraw');

INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled) VALUES
 ('degenerate-text-withdraw',
  'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM ops_config WHERE key = ''degenerate_text_withdraw'' AND lower(trim(value)) NOT IN (''on'', ''off'')) THEN ''degenerate_text_withdraw holds a value that is neither on nor off'' ELSE ''ok'' END AS observed',
  'state probe, no window: the lever row (absent means on, on, off) and its valid values; the offline suite qnfo-cloud-ops/degenerate-text.test.mjs exercises the off setting', 1);

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, text_sig)
SELECT
  'issue:' || a.id,
  'blocked: qnfo-research-exec/worker.js cannot be edited by this session while the code loop holds file:qnfo-research-exec/worker.js',
  'Tried every surface that reaches the same end. (1) work-lock acquire on file:qnfo-research-exec/worker.js: refused, holder qnfo-code-orchestrator:ct_im1000472 (RESEARCH-ERRATA-CLAIM-1, queued) until 2026-10-26T22:16:52Z, with ct_im1000475 and ct_rvnp3b02c956c0 queued on the same path. (2) The edit as a code task: filed with an anchor, a closing probe and an acceptance suite already in the repository (DEGENERATE-TEXT-PRODUCER-1, REVIEW-TRIAGE-CLAIM-1, VERIFY-AUTOCORRECT-PRECISION-1). (3) A shared library and parity suite in files nobody holds: built (qnfo-cloud-ops/degenerate-text.mjs, qnfo-research-exec/degenerate-wiring.test.mjs, fail-closed.test.mjs updated). (4) The same gate at the publish end without touching the producer: built in qnfo-cloud-ops (withdrawal, restore hold, fresh lane every tick), live on the next canonical deploy. (5) A living-paper D1 trigger: not possible, a SQLite trigger cannot loop over tokens or use a regular expression. The claim is a coordination lock, not a permission check, and it is respected, not worked around.',
  'workaround-built',
  'GET qnfo-deploy-guard /work-locks 2026-10-26T20:17Z: claims key file:qnfo-research-exec/worker.js holder qnfo-code-orchestrator:ct_im1000472 expires_at 2026-10-26T22:16:52Z; POST /work-lock/acquire answered acquired false with that holder and intent; the producer fix is not needed to stop the paper: it was withdrawn and 404 at 2026-10-26T20:43Z',
  'session-paper-degenerate-1',
  length(a.title) || ':' || length(COALESCE(a.description, ''))
FROM agent_issues a
WHERE a.title LIKE 'DEGENERATE-TEXT-PRODUCER-1:%' AND a.status = 'open'
  AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'issue:' || a.id AND r.actor = 'session-paper-degenerate-1')
ORDER BY a.id DESC LIMIT 1;

INSERT INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence)
SELECT
  'degenerate-text gate: detect a model loop in a paper body and withdraw the paper singly (qnfo-cloud-ops pub-gate-v5-degenerate)',
  'qnfo-cloud-ops 1.41.0, session session-paper-degenerate-1, DEGENERATE-TEXT-1',
  'living-paper papers with change_actor and change_reason columns and the paper change ledger; ops_config degenerate_text_withdraw (absent means on)',
  'offline suite qnfo-cloud-ops/degenerate-text.test.mjs (53 checks) and a measured pass over 950 living-paper bodies: one hit, no false positive; live read pending the canonical deploy',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'paper qnf-d66c40b5 withdrawn at 2026-10-26T20:43Z by hand with the same detector (paper_change_ledger seq 1692, withdrawal 1; page, .md and PDF 404, sitemap entry gone); the sweep and the fresh lane do the same for the next one'
WHERE NOT EXISTS (SELECT 1 FROM capability_ledger WHERE capability LIKE 'degenerate-text gate:%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session-paper-degenerate-1',
  'A loop of thousands of repeated tokens on a public paper page is an unambiguous defect, not a style judgement; withdrawing that one class singly, with a backup and a ledger row, is the smallest action that satisfies the owner instruction of 2026-10-26 that such errors never make it past a review or publish gate, and it does not widen the PUB-GATE-NO-WITHDRAW-1 posture for any other defect.',
  'DEGENERATE-TEXT-1: ship qnfo-cloud-ops 1.41.0 (detector, per-paper withdrawal capped at 10 a run, restore hold, fresh lane every tick), withdraw paper qnf-d66c40b5 by hand, and file the producer fixes (DEGENERATE-TEXT-PRODUCER-1, REVIEW-TRIAGE-CLAIM-1, VERIFY-AUTOCORRECT-PRECISION-1) because qnfo-research-exec/worker.js was under another holder live claim.',
  'Detector run over all 950 living-paper bodies (about 70 million characters) in the Cloudflare API sandbox: one paper flagged, none other; unit and sweep suites 53 checks; existing suites of qnfo-cloud-ops and qnfo-research-exec green except two failures that also occur on origin/main (migrations/chaos-drill-budget-pause.test.mjs, migrations/probe-playbooks.test.mjs); the live paper returned 404 on page, .md and PDF after the withdrawal and left the sitemap.',
  'living-paper: paper qnf-d66c40b5 quarantined (backup papers_degenerate_bak_20261026, ledger seq 1692); qnfo-cloud-ops 1.41.0 after the canonical deploy; three open issues with probes carry the producer.',
  'papers.qnfo.org for one paper (page, .md, PDF, sitemap entry, roll-ups); the hourly sweep and a new every-tick job in qnfo-cloud-ops (a few milliseconds a paper, a few papers a tick); no other paper changes status unless it scans as a loop.',
  'UPDATE papers SET status = ''published'', release_gate_pass = 0, change_actor = ''session-paper-degenerate-1:revert'', change_reason = ''revert DEGENERATE-TEXT-1 withdrawal'' WHERE identifier = ''qnf-d66c40b5-a032-4dd5-9eed-60a048efe521'' AND status = ''quarantined'' (the gate withdraws it again unless ops_config degenerate_text_withdraw = off); body backup in papers_degenerate_bak_20261026; code: revert the pull request.',
  'a gate that reads repetition and withdraws a model loop singly, independent of the producer',
  'fm-degenerate-text-published reads ok on every run after the deploy and no published non-owner paper carries quality:degenerate-text; the false-positive count over the next 50 published papers stays 0',
  'every future reader of papers.qnfo.org is spared a page of repeated tokens',
  'living-paper D1 (papers, paper_change_ledger, backups), papers.qnfo.org page, .md, PDF and sitemap, cloud_ops_events of the pipeline, the review report in QNFO/qnfo-research, the repo functions pubGateScore and releaseGateVerdict, and the offline suites'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log WHERE instr(action, 'DEGENERATE-TEXT-1: ship qnfo-cloud-ops 1.41.0') = 1
);

INSERT OR IGNORE INTO session_records (
  session_id, wbs_code, agent_name, summary, decisions_made, files_changed,
  commits, infrastructure_changes, handoff_notes, execution_ratio,
  total_tasks, completed_tasks, started_at, completed_at, created_at
) VALUES (
  'session-paper-degenerate-1',
  'research/publication-gate',
  'Claude Code',
  'Owner pointed at a published paper (Passive Fault Tolerance via Bruhat-Tits Tree Codes) with an 8,122-token model loop and said errors like this can never make it past review or publish gates. Traced the chain in the audit log, the paper ledger and the deposited review report: the reconcile model looped and a 24 k-character output passed the length test, no gate read repetition, the release gate scored the loop 100, the review triage demoted 8 true HARD findings as drift, the verify autocorrection broke a displayed derivation, and the title came from the raw idea. Shipped qnfo-cloud-ops 1.41.0 (detector, per-paper withdrawal, restore hold, fresh lane every tick), withdrew the paper by hand with a backup, and filed the three producer fixes for qnfo-research-exec, which was under the code loop live claim.',
  'Respected the live work claim on qnfo-research-exec/worker.js and built the shared library, the parity suite and the issues instead. Kept the owner PUB-GATE-NO-WITHDRAW-1 posture for every other defect and made the one exception a single switch. Measured the detector on every living-paper body before enabling the withdrawal (no false positive). Did not touch the two papers with assistant text ahead of the first heading beyond filing them in DEGENERATE-TEXT-PRODUCER-1.',
  'qnfo-cloud-ops/worker.js, qnfo-cloud-ops/deployed-current.worker.js, qnfo-cloud-ops/degenerate-text.mjs, qnfo-cloud-ops/degenerate-text.test.mjs, qnfo-cloud-ops/quality-score-paging.test.mjs, qnfo-research-exec/degenerate-wiring.test.mjs, qnfo-research-exec/fail-closed.test.mjs, migrations/2026-10-26-degenerate-text-1.sql',
  'branch degenerate-text-1',
  'living-paper: papers_degenerate_bak_20261026 created, paper qnf-d66c40b5 quarantined (paper_change_ledger seq 1692).',
  'Open items each carry a doer and a probe: DEGENERATE-TEXT-PRODUCER-1, REVIEW-TRIAGE-CLAIM-1 and VERIFY-AUTOCORRECT-PRECISION-1 (all qnfo-research-exec/worker.js, blocked by the code loop claim ct_im1000472 until 22:16:52Z; acceptance suite qnfo-research-exec/degenerate-wiring.test.mjs); re-arm research_queue row d66c40b5 after the producer fix; two pre-existing red suites on main (migrations/chaos-drill-budget-pause.test.mjs, migrations/probe-playbooks.test.mjs) belong to other sessions.',
  0.86, 7, 6,
  '2026-10-26T19:55:00Z',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%d %H:%M:%S', 'now')
);
