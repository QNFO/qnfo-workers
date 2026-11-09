-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE issue_triage SET close_evidence = NULL WHERE issue_id IN (1002695, 1002694, 1002693, 1002688, 1002687, 1002649, 1002639, 1002638, 1002636, 1002621) AND close_evidence LIKE 'DOC-ITEMS-SWEEP-4:%';
-- CAUSE-MAPPED: no metric registered; dispositions for DOC-GATE-1 issues 9741 9740 9739 9710 9709 9637 9624 9623 9616 9449

-- DOC-ITEMS-SWEEP-4. Each item has an explicit disposition.
UPDATE issue_triage SET close_evidence = 'DOC-ITEMS-SWEEP-4: (1) Buffer dissemination is live: qnfo-social drainRollup and the outreach cadence (CLAUDE.md, OUTREACH-ACCELERATE-1) run it. (2) DNSLink deployment is superseded: the owner moved to Cloudflare-only hosting (R2 and Workers) and no IPFS gateway is on the roadmap.'
WHERE issue_id = 1002695 AND close_evidence IS NULL;

UPDATE issue_triage SET close_evidence = 'DOC-ITEMS-SWEEP-4: the three unchecked boxes are one-time pre-rotation checks of a plan. Token and secret handling now runs through the secret-lock lease (CLAUDE.md, Shared secrets #1701) and owner directive 2026-10-08 (no new token). Plan is historical; nothing to implement.'
WHERE issue_id = 1002694 AND close_evidence IS NULL;

UPDATE issue_triage SET close_evidence = 'DOC-ITEMS-SWEEP-4: IPFS supplements (web3.storage, Storacha, DNSLink) are not adopted: all data is hosted on Cloudflare (NO-CLAUDE-RUNTIME-DEPENDENCY-1, charter cost pillar); no IPFS dependency exists in any worker. The Phase 2 S10 resume steps are session-local and tracked in the roadmap, not here.'
WHERE issue_id = 1002693 AND close_evidence IS NULL;

UPDATE issue_triage SET close_evidence = 'DOC-ITEMS-SWEEP-4: C: drive blocker was resolved in the source session. The Silenko FW critique, the null test for FW position and the CAL-ZBW-05 2028 checkpoint are research tasks for the research pipeline (research_queue), not repository code; recorded as no longer a repository item.'
WHERE issue_id = 1002688 AND close_evidence IS NULL;

UPDATE issue_triage SET close_evidence = 'DOC-ITEMS-SWEEP-4: objective 3 (ops_issue_run confirm gate) was removed by AUTONOMY-FIRST-1 and OWNER-AUTO-APPROVE-ALL-1 and the backlog is drained by the issue loops; 1662/1663 dashboard counts and verification rows are covered by the remediation_contracts closed loop (METRIC-CLOSED-LOOP-1). Superseded.'
WHERE issue_id = 1002687 AND close_evidence IS NULL;

UPDATE issue_triage SET close_evidence = 'DOC-ITEMS-SWEEP-4: the five failure modes of a 2026-09-30 sweep are superseded by v_issue_accounting, v_failure_mode_status and declared cadences in metric_registry; the sweep snapshot has no code left to write.'
WHERE issue_id = 1002649 AND close_evidence IS NULL;

UPDATE issue_triage SET close_evidence = 'DOC-ITEMS-SWEEP-4: probe-query slips (reserved-word columns, join key) were corrected in the source thread. Open items 1-5 are issue-backlog work owned by the live loops (v_issue_queue, ISSUE-THROUGHPUT-1, METRIC-TRIGGER issues, RESEARCH-TERMINAL issues); ops_issue_run confirm gate no longer applies (AUTONOMY-FIRST-1). No separate item.'
WHERE issue_id = 1002639 AND close_evidence IS NULL;

UPDATE issue_triage SET close_evidence = 'DOC-ITEMS-SWEEP-4: items 1-2,4,5 are covered by issue loops, PUSH-GATE-1 and SUITE-RUNNER-1 (CLAUDE.md) and the model-floor guard skipping RETIRED and FOLDED directories by design. Item 3 (second path for ops_research_kick) is owned by research queuing via intents_query. Item 4 (NULL-below-10-ratings metric) is a metric-author item recorded on the metric_registry row; nothing further in the document.'
WHERE issue_id = 1002638 AND close_evidence IS NULL;

UPDATE issue_triage SET close_evidence = 'DOC-ITEMS-SWEEP-4: favicons and the Pages deletions concern Pages projects since folded into Workers; the Lifecycle ULA cron is served by the qnfo-lifecycle hourly CRON-SINGLE-TRIGGER-1 table; Turnstile keys are verified by the repository token path (cf-ops-actions access-probe) and no new token will be issued (owner directive 2026-10-08). Not applicable.'
WHERE issue_id = 1002636 AND close_evidence IS NULL;

UPDATE issue_triage SET close_evidence = 'DOC-ITEMS-SWEEP-4: RES.031 registration drift and the v0.4.1 vs v0.5 choice are settled in the later uia-v041 closeout (issue 9639 and 1002651); the skill-load path is a local DeepChat check with no repository surface. Duplicate of those dispositions.'
WHERE issue_id = 1002621 AND close_evidence IS NULL;
