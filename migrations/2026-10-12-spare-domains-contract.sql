-- SPARE-DOMAINS-CONTRACT-1 (2026-10-12, pillar reach; agent_issues 2077). The qnfo.org half of 2077 is done (scorecard.qnfo.org
-- and the other retired hosts answer 410, read 2026-10-12), but its contract still probed that half, so it read
-- probe-not-machine-executable instead of measuring what is left. What is left needs the owner: card 65 (renew or lapse three
-- expired domains; money) and card 66 (proxy qwave.tech and empty the dormant redirect rules; the edit was refused by the
-- session permission check, reason DNS / Domain / Cert Changes, and a refusal is handed over, not worked around). The contract
-- now probes qwav.uk for the 301 to qwav.org, which passes once card 66 is carried out, and the issue carries its
-- IDENTITY-BOUND line so the blocker red-team confirms it instead of leaving it unverified.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = '{"url": "https://scorecard.qnfo.org/", "status": 410, "contains": ""}' WHERE class = 'issue-2077'

UPDATE remediation_contracts SET verify_probe = '{"url": "https://qwav.uk/", "status": 301}', verify_transport = 'runner-https',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-2077';

UPDATE agent_issues SET description = description || char(10) || char(10) ||
  '2026-10-12 (SPARE-DOMAINS-CONTRACT-1): qnfo.org half done (scorecard.qnfo.org 410). Remaining: owner cards 65 (renewal) and 66 (zone write).' || char(10) ||
  'IDENTITY-BOUND: card 65 spends the owner''s money at the registrar; card 66 is a DNS/zone edit the session permission check refused (DNS / Domain / Cert Changes). Contract probes qwav.uk for 301 and closes this issue when card 66 is done.'
WHERE id = 2077 AND instr(description, 'SPARE-DOMAINS-CONTRACT-1') = 0;
