-- Cluster G (2026-10-28, charter pillars reach and research; OWNER-NO-LOOSE-ENDS-1, DECISION-AUTOPROCEED-1)
-- 1. PLAIN-STANDARD-1 (agent_issues 1000476): qnfo-gateway 3.48.0 gates a plain-language summary at Flesch-Kincaid grade 9 (one regeneration, then gated: never stored,
--    the old row kept) and queues the stored summaries above grade 9 for regeneration, hardest first, through the hourly plainFill (12 per run). The backfill is that queue,
--    not an inline rewrite. Closing probe: the existing class issue-1000476 (d1-query@living-paper; over12 = 0, no DOI/arXiv/et al text, 75 percent at grade 9 or below).
--    PREDICTION: summaries above grade 12 fall from 224 to 0 within about 20 hourly runs of plainFill (12 builds each, hardest first) and the share at grade 9 or below
--    rises from 356 of 704 (51 percent) to at least 75 percent within about 30 runs; a build that cannot reach grade 9 leaves the old text (no worse than today).
-- 2. RESEARCH-ERRATA-CLAIM-1 (agent_issues 1000472): measured 2026-10-28 19:40Z: 183 errata rows queued (0 with claimed_at), 56 deferred, 2 published (errata:22 on
--    10-28 04:21Z and errata:32 on 10-28 07:15Z), so claims now happen by age (FIFO in claimNew) but the neuron budget meters them to about 2 a day. They still hold 183 of
--    192 ready slots because rbPlan's errCap (RB-ERRATA-SHARE-1) is never passed by researchBackpressureTick (isErr also receives ids, not rows). qnfo-fleet-control/worker.js
--    and qnfo-research-exec/worker.js are under other sessions' live work claims, so the wiring is filed as a code-task and the setting it reads is registered here.
--    PREDICTION: after the wiring, at most research_errata_ready_cap (24) errata rows stay queued, the other 150 or so wait in the deferred pool and return by priority as
--    the 24 are claimed, and queued non-errata rows (completeness, revision, proposals) rise from 15 of 192 to taking the rest; errata published stays at about 2 a day (budget bound).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key = 'research_errata_ready_cap'; UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'RB-ERRATA-CAP-WIRE-1:%' AND source = 'session-cluster-g';
-- BACKUP: ops_config

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
  ('research_errata_ready_cap', '24', 'RB-ERRATA-CAP-WIRE-1 (2026-10-28, cluster G): at most this many errata remediation rows stay in status queued; the rest wait deferred and return by priority. Read by researchBackpressureTick once wired. Revert: delete the row (no cap).');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RB-ERRATA-CAP-WIRE-1: researchBackpressureTick never passes the errata cap to rbPlan, so 183 errata rows hold 183 of 192 ready slots',
 'Charter pillar: research. Child of RESEARCH-ERRATA-CLAIM-1 (agent_issues 1000472) and RB-ERRATA-SHARE-1 (1000474). rbPlan(queued, deferred, cap, on, opts) in qnfo-fleet-control/worker.js already caps errata remediation rows in the ready queue when opts.errCap is a number and opts.isErr(item) is true, but researchBackpressureTick calls it with four arguments, so the cap is dead code (measured 2026-10-28: 183 errata rows queued, 56 deferred, 15 other queued rows, ready cap 192). Change: read ops_config research_errata_ready_cap (24 is set by migrations/2026-10-28-cluster-g-plain-errata.sql; absent or non-numeric = no cap), select q.source and q.source_id with the queued and deferred lists, pass items as objects {id, err} (err = source = remediation and source_id starts with errata:) and call rbPlan(queued, deferred, out.cap, out.on, { errCap: <n>, isErr: function (x) { return !!(x && x.err); } }); rbPlan reads x.id || x for ids, so the existing suites keep passing. Add cases to qnfo-fleet-control/research-backpressure.test.mjs: 200 errata plus 10 other queued rows with errCap 24 defers 176 errata and keeps the 10; deferred errata are released only up to the cap; no errCap keeps the old plan. Bump VERSION (minor: the ready queue now caps a class). Definition of done: SELECT COUNT(*) FROM research_queue WHERE status = queued AND source = remediation AND source_id LIKE errata:% is at most 24 after the next 20-minute tick, with no errata row lost (status deferred, error RESEARCH-BACKPRESSURE-1 deferred). Optional second doer on qnfo-research-exec/worker.js claimNew: none needed, FIFO already claims errata by age.' || char(10) ||
 'code-probe: {"paths": ["qnfo-fleet-control/worker.js"], "contains": "research_errata_ready_cap"}' || char(10) ||
 'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js' || char(10) ||
 'code-anchor: var plan = rbPlan(qs.map(function (r) { return r.id; }), ds.map(function (r) { return r.id; }), out.cap, out.on);',
 'session-cluster-g', 'research', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RB-ERRATA-CAP-WIRE-1:%' AND status = 'open');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-cluster-g',
  'a plain-language summary above grade 9 fails the owner standard and is worse than none for a reader; regenerating once and refusing to store a hard text is reversible (the old row stays)',
  'PLAIN-STANDARD-1: qnfo-gateway 3.48.0 hard grade gate, comparison prompt, and a grade-over-9 regeneration queue in plainFill; RB-ERRATA-CAP-WIRE-1 filed with a code-task for the errata ready cap and research_errata_ready_cap = 24 registered',
  'living-paper plain_summary 2026-10-26: 704 summaries, 348 above grade 9, 224 above 12; qnfo-audit research_queue 2026-10-28 19:40Z: 183 errata queued, 56 deferred, 2 published, ready cap 192; qnfo-gateway/plain-standard.test.mjs 18 checks pass',
  'merged with the PR',
  'qnfo-gateway plain summaries only; a gated build leaves the stored row unchanged; the errata cap is inert until the code-task lands',
  'revert the gateway PR; DELETE the ops_config row research_errata_ready_cap',
  'the fleet can no longer publish a plain summary above grade 9, and re-reads the existing corpus against that standard',
  'summaries above grade 12 fall from 224 to 0 and the share at grade 9 or below rises from 51 to at least 75 percent within about 30 hourly plainFill runs; ready errata rows fall from 183 to at most 24 after the code-task lands',
  'plain summaries read by every paper page visitor (704 papers)',
  'offline node:sqlite and vm suites; living-paper plain_summary and qnfo-audit research_queue (SELECT only)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PLAIN-STANDARD-1: qnfo-gateway 3.48.0') = 1);
