-- RUNTIME-LIVENESS-GAP-3 (2026-10-26; follow-up to migrations/2026-10-26-runtime-liveness-gap-2.sql). Issue IDEAS-HUB-SLOW-RSS-1 (1000460) was filed with a `runtime-probe:` line on its feed, and the
-- trigger agent_issues_runtime_probe_ins fires on insert; but the generic birth template (module probe-template-v3-generic, a probe that observes the issue's own status) is written after it, and the
-- contract issue-1000460 stood at status superseded, transport d1-query, with no probe of the feed (read 2026-10-26 17:45Z). An issue about live behaviour with no live probe can never be shown fixed or closed.
-- CLAUDE.md, Where probes run: a session that gives an issue its probe uses UPDATE on class issue-<id> (an INSERT OR IGNORE is ignored because the birth trigger has already written the row). This does
-- that for the one issue, with the probe text taken from the issue's own runtime-probe line, hourly (the endpoint is the defect, so a pass is one datum and the next hour is the next).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded', verify_transport = 'd1-query', module = 'probe-template-v3-generic', last_verdict = 'superseded:rollback RUNTIME-LIVENESS-GAP-3' WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title LIKE 'IDEAS-HUB-SLOW-RSS-1:%' ORDER BY id DESC LIMIT 1) AND module = 'runtime-probe-line-v1'

UPDATE remediation_contracts
   SET verify_transport = 'runner-https',
       verify_probe = '{"url": "https://ideas.qnfo.org/rss.xml", "status": 200, "contains": "<rss", "max_ms": 10000}',
       status = 'active', module = 'runtime-probe-line-v1', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3,
       precondition = 'runtime-probe line in the issue (PROBE-BIRTH-RUNTIME-1), set by RUNTIME-LIVENESS-GAP-3',
       action = 'the doer fixes the live behaviour; scripts/remediation_consumer.py GETs it from the GitHub runner every hour and a pass closes the issue'
 WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title LIKE 'IDEAS-HUB-SLOW-RSS-1:%' AND status = 'open' ORDER BY id DESC LIMIT 1)
   AND verify_transport <> 'runner-https';
