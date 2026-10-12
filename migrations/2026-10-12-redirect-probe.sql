-- REDIRECT-PROBE-1 (2026-10-12, pillar autonomy; agent_issues 2077 and 2361).
-- Both issues carried a runner-https probe of qwav.uk with "status": 301. scripts/remediation_consumer.py could run neither:
-- qwav.uk was not in HTTPS_HOSTS, and the opener follows redirects, so a 301 reads as the target's 200 (verdict
-- probe-not-machine-executable, five attempts on issue-2077). The consumer now takes "redirect_to" (no follow; status plus a
-- Location prefix) and allowlists the spare domains. #2077's remaining scope (the spare domains; the twelve retired hosts
-- were routed 2026-10-08) is the owner-approved canonicalisation #2361, so #2077 is superseded into it and the gap is
-- probed once, there. issue-2361 passes when qwav.uk answers 301 with Location under https://qwav.org (fails today: 200).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = '{"url": "https://qwav.uk/", "status": 301, "contains": "qwav.org"}' WHERE class = 'issue-2361'; UPDATE remediation_contracts SET status = 'active' WHERE class = 'issue-2077'; UPDATE issue_triage SET close_evidence = NULL WHERE issue_id = 2077; UPDATE agent_issues SET status = 'open' WHERE id = 2077

UPDATE remediation_contracts SET verify_probe = '{"url": "https://qwav.uk/", "status": 301, "redirect_to": "https://qwav.org"}',
  last_verdict = NULL, attempts = 0, next_due_at = datetime('now')
WHERE class = 'issue-2361';

UPDATE issue_triage SET close_evidence = 'superseded by #2361 (SPARE-DOMAIN-CANON-1): the twelve retired hosts were routed 2026-10-08; the spare-domain redirects remaining here are probed once, on issue-2361 (redirect_to https://qwav.org)'
WHERE issue_id = 2077 AND close_evidence IS NULL;

UPDATE agent_issues SET status = 'closed' WHERE id = 2077 AND status = 'open';

UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:into-issue-2361 (redirect_to probe)', last_attempt_at = datetime('now')
WHERE class = 'issue-2077' AND status IN ('active', 'holding');

-- Session closeout record (SESSION-RECORD-1), refreshed for the final turn of session_01CWLpf5v1NjC9GXbM6rnH4k.
UPDATE session_records SET
  summary = summary || ' Final turns 2026-10-12: kernel 8.2.1 adopted (PR 1007: readings r-t, you-as-actor and narration false-stop phrases), autoclose guarded against a sibling failing contract (1683 oscillation ended), PR 999 personal-companion 1.15.14 reviewed and merged, #2355 code-probe repointed, REDIRECT-PROBE-1 (redirect_to probes, spare domains allowlisted, #2077 superseded into #2361).',
  handoff_notes = 'Server-side owners: #2352/#2355 PR 1000 (qnfo-fleet-control, session_01GMk claim; code-probe closes); #2354 next companion publish after 1.15.14 (fm-companion-publish-stall); #2361 spare-domain redirects via scripts/attach-surface-routes.py with the repository token (redirect_to probe closes on 301 to qwav.org); #2034 q08 publish (session_014Kr); #2272 code loop; #2118 unified cost (metric trigger 353); #2204 metric probe. No open claims, PRs or cards remain with this session.',
  total_tasks = 26, completed_tasks = 23, execution_ratio = 0.88, completed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE session_id = 'session_01CWLpf5v1NjC9GXbM6rnH4k' AND wbs_code = 'AUTOREMEDIATE-2026-10-11';
