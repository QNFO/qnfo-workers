-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-quick-read-digest-spend'; DELETE FROM failure_modes WHERE fm_key = 'quick-read-digest-spend'; UPDATE agent_issues SET status = 'superseded' WHERE title LIKE 'COMPANION-CRISIS-PARITY-1:%' OR title LIKE 'COMPANION-CONTEXT-QUERY-URL-1:%'; DELETE FROM decision_log WHERE instr(action, 'COMPANION-FLEET-HANDOFF-20261019:') = 1; DELETE FROM session_records WHERE session_id = 'session_01NzewstG2ZVyaKp17FfXYDt'
-- COMPANION-FLEET-HANDOFF-1 (2026-10-19, pillar personal). Owner request in the Personal Companion project: "CLOSEOUT THIS
-- THREAD AND HANDOFF ALL WORK SERVER-SIDE TO CLOUDFLARE QUNIVERSE FLEET". The companion (personal-api /companion, PRs 2587,
-- 2594, 2602; personal-api 4.12.0 and personal-companion 1.31.1 deployed 04:58 UTC, deployment_history
-- 1667 and 1668) now runs only on Cloudflare: the companion Durable Object's 15-minute alarm sends the morning check-in and the
-- evening reflection (planNudge cmp-checkin, cmp-reflect), personal-companion's hourly cron runs the e-mail ladder. The
-- claude.ai routines that duplicated the check-in are disabled and never fired. This files the two open follow-ups with
-- their doers and probes, records the four accepted red-team trade-offs as one decision, and writes the session record.
-- Details: docs/HANDOFF-2026-10-19-personal-companion.md. Single-row VALUES inserts only: agent_issues refuses the
-- INSERT ... SELECT shape at compile time (migrations/2026-10-18-issue-sla-guard-reliable.sql).

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (
 'COMPANION-CRISIS-PARITY-1: personal-companion crisisSignal misses curly apostrophes and every Dutch phrasing that personal-api now catches',
 'Charter pillar: personal (safety). The 2026-10-19 red-team fixed crisisSignal in personal-api/companion.js (PR 2602, live as 4.12.0) and left the e-mail reply matcher in personal-companion untouched because PR 2589 was changing that worker. So a reply e-mail saying "I don(U+2019)t want to live" typed with a curly apostrophe, "nobody would miss me" or "ik wil dood" gets no crisis lines. Edit: in personal-companion/wellbeing.js crisisSignal, normalise U+2018/U+2019 to an ASCII apostrophe before matching and add the hard and soft English and Dutch patterns from personal-api/companion.js crisisSignal (zelfmoord, ik wil dood, er een eind aan maken, ik wil er niet meer zijn, ik zie het niet meer zitten, kms, wish I was dead, better off without me, nobody would miss me); keep "to die for" and "killing time" calm; add the same cases to personal-companion/wellbeing.test.mjs; then run node scripts/inline-companion-modules.mjs so worker.js carries it, and bump VERSION (patch) with the mirror. Start after PR 2589 merges (it changes personal-companion/worker.js).' || char(10) ||
 'code-task: repo=qnfo-workers path=personal-companion/wellbeing.js' || char(10) ||
 'code-anchor: export function crisisSignal(text) {' || char(10) ||
 'code-probe: {"paths": ["personal-companion/worker.js"], "contains": "zelfmoord"}',
 'claude-session:session_01NzewstG2ZVyaKp17FfXYDt', 'security', 'high', 'open',
 CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER));

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (
 'COMPANION-CONTEXT-QUERY-URL-1: GET /companion/api/context?q= puts the owner''s words in the URL, where request logs keep them',
 'Charter pillar: personal (privacy). The red-team accepted this route as a debugging aid behind the key; the page never calls it. Mental-health text is special-category data and a query string is logged, so the route moves to POST with q in the JSON body. Edit: in personal-api/companion.js change the context route to m === "POST" reading q from the parsed body, update the one assertion in personal-api/companion.test.mjs, run node personal-api/inline-companion.mjs so worker.js carries it, bump VERSION (patch) with the mirror.' || char(10) ||
 'code-task: repo=qnfo-workers path=personal-api/companion.js' || char(10) ||
 'code-anchor: if (r === "context" && m === "GET")' || char(10) ||
 'code-probe: {"paths": ["personal-api/worker.js"], "absent": "if (r === \"context\" && m === \"GET\")"}',
 'claude-session:session_01NzewstG2ZVyaKp17FfXYDt', 'security', 'medium', 'open',
 CAST(strftime('%s','now') AS INTEGER), CAST(strftime('%s','now') AS INTEGER));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01NzewstG2ZVyaKp17FfXYDt',
 'for a mental-health companion used by one person on bad days, a false alarm costs less than a miss and a lockout costs more than a guessed key',
 'COMPANION-FLEET-HANDOFF-20261019: the companion is handed to the fleet with four red-team trade-offs kept by design: crisis lines show on negated or quoted risk words; photos are kept until deleted while voice recordings expire after 30 days; no lockout on wrong API keys (long random key, Bearer only); presence mode sends one "I am here" a day while asks go unanswered. Two deferred items are filed as COMPANION-CRISIS-PARITY-1 and COMPANION-CONTEXT-QUERY-URL-1. The claude.ai check-in routines are disabled; the companion Durable Object alarm and personal-companion cron carry the check-in.',
 'docs/HANDOFF-2026-10-19-personal-companion.md; red-team table of 2026-10-19 (13 fixed, 6 accepted); origin/main personal-api/companion.js planNudge cmp-checkin 08:30-12:00 and cmp-reflect 19:30-21:45 on the 15-minute alarm',
 'merged through the canonical path', 'the owner''s companion: nudges, crisis replies and privacy', 'revert of this migration and of the handoff doc; the routines can be re-enabled in the project',
 'the companion runs with no claude.ai routine or session in its loop',
 'agent_issues 100031 COMPANION-HEARTBEAT-1 closes by its d1-query@personal-life probe (cmp_last_tick under 45 minutes old) before 2026-10-19T07:00:00Z', 'none (personal plane)',
 'code:personal-api/companion.js planNudge, crisisSignal; code:personal-companion/wellbeing.js crisisSignal; project routines list'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-FLEET-HANDOFF-20261019:') = 1);

INSERT INTO session_records (session_id, wbs_code, agent_name, summary, decisions_made, files_changed, commits, infrastructure_changes, handoff_notes, execution_ratio, total_tasks, completed_tasks, started_at, completed_at) VALUES (
 'session_01NzewstG2ZVyaKp17FfXYDt', 'personal', 'claude-session',
 'Owner asked to close out the Personal Companion project thread and hand all work server-side to the fleet. Confirmed the check-in runs on the companion Durable Object alarm (project routines disabled, never fired, nothing to import), filed two follow-ups with doers and probes, recorded the trade-offs, wrote the handoff doc.',
 'four red-team trade-offs kept by design; two deferred items filed for the code loop; PR 2602 merged and deployed by the red-team thread',
 'docs/HANDOFF-2026-10-19-personal-companion.md, migrations/2026-10-19-companion-fleet-handoff.sql', '1', 'none',
 'COMPANION-CRISIS-PARITY-1, COMPANION-CONTEXT-QUERY-URL-1 and 100031 COMPANION-HEARTBEAT-1 carry the remaining work; each closes by its probe',
 1.0, 5, 5, '2026-10-19T04:57:43Z', strftime('%Y-%m-%dT%H:%M:%SZ','now'));

-- QUICK-READ-DIGEST-SUITE-RED-1 (agent_issues 100037, owner request "Fix CI"): ef01a75 landed qnfo-gateway 3.25.0, whose digest
-- built the plain-language summary with up to two model calls on a reader's GET; quick-read.test.mjs failed 2 of 101 on main.
-- qnfo-gateway 3.26.0 (same pull request) reads plain_summary only on GET and builds it in the daily cron (plainFill).
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('quick-read-digest-spend', 'the Quick read digest GET spent model calls on a cache miss, so a crawler following a link cost money and the quick-read suite failed on main',
  'the plain-language build (3.25.0-plain-language-1) was landed from the deployed worker with plainSummary on the GET path; the suite that holds the no-spend rule was not run before the landing commit',
  'PLAIN-FILL-1 (qnfo-gateway 3.26.0): GET reads plain_summary only, the daily cron builds up to PLAIN_FILL_MAX summaries',
  'qnfo-gateway/worker.js on main does not call plainSummary', 'fm-quick-read-digest-spend', '2026-10-19', 100037,
  'a code change on the digest GET path that calls the model', 'quick-read.test.mjs on main: 99 passed, 2 failed (aiCalls 2)', 'every full-suite PR and the digest spend');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-quick-read-digest-spend', NULL, 'PLAIN-FILL-1', 'failure-mode detector', '{"paths": ["qnfo-gateway/worker.js"], "absent": "plainSummary("}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
UPDATE remediation_contracts SET verify_probe = '{"paths": ["qnfo-gateway/worker.js"], "absent": "plainSummary("}', verify_transport = 'code-read', next_due_at = datetime('now') WHERE class = 'issue-100037';
