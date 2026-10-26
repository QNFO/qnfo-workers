-- PROPOSAL-PARK-TO-ORDER-1 (2026-10-26, session rem-a1, pillar research; agent_issues 1000288; owner 2026-10-26 "no hold-backs the owner did not ask for": proposals are ordered, not dropped).
-- 585 research_queue rows (581 source proposal, 4 goal-author; scores 0.14 to 0.79, created 2026-09-14 to 2026-10-24) are status wontfix / stage parked with the text "PARKED-LOW-VALUE-1: proposal score<0.8 parked by admission
-- policy; revives automatically when ready pool<24 or score>=0.8 (2026-10-24)". That promise is kept by no code: the park was a hand UPDATE by an ops session, the ready pool has stood at 192 since, and a score of 0.8 or more
-- is admitted in the first place, so nothing has revived one of them in two days. The fleet already has the mechanism the promise describes: qnfo-fleet-control researchBackpressureTick (RESEARCH-BACKPRESSURE-1 and POOL-BOUND-1)
-- keeps at most research_ready_cap rows queued and the rest deferred by priority (remediation, owner-authored, then score, then age), parks the lowest priority class beyond research_deferred_max (400) with the marker
-- "POOL-BOUND-1 parked ...", and re-arms parked rows by the same priority, `ORDER BY RB_ORDER_SQL`, whenever the deferred pool falls below half of the bound (200; it was 171 at 19:30Z). So the 585 rows move under that
-- lifecycle: their status, stage and score stay, their error becomes a POOL-BOUND-1 line that keeps the old text, and the existing tick revives them best score first as the pool has room (29 at its next tick), so the budget
-- decides how far down the list the pipeline reaches. Nothing is queued in bulk (that would put 585 rows in the SLA queue at once and the pool bound would park them again), no gate, cap or score is changed.
-- Closing probe of the issue (its own, unchanged): SELECT COUNT(*) FROM research_queue WHERE status = 'wontfix' AND error LIKE 'PARKED-LOW-VALUE-1%' expected 0.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_proposal_park_to_order
-- Rollback: UPDATE research_queue SET error = (SELECT b.error FROM bak_20261026_proposal_park_to_order b WHERE b.id = research_queue.id) WHERE id IN (SELECT id FROM bak_20261026_proposal_park_to_order) AND status = 'wontfix' AND stage = 'parked' AND instr(error, 'POOL-BOUND-1 parked') = 1;

CREATE TABLE IF NOT EXISTS bak_20261026_proposal_park_to_order AS SELECT id, source, source_id, score, status, stage, error, created_at FROM research_queue WHERE status = 'wontfix' AND stage = 'parked' AND instr(error, 'PARKED-LOW-VALUE-1') = 1;

UPDATE research_queue
   SET error = 'POOL-BOUND-1 parked ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ': low-value proposal (score ' || COALESCE(CAST(score AS TEXT), 'none') || ', hand park PARKED-LOW-VALUE-1 of 2026-10-24: ' || substr(error, 1, 120) || '); re-armed automatically by priority and score when the deferred pool falls below half of research_deferred_max (PROPOSAL-PARK-TO-ORDER-1)'
 WHERE status = 'wontfix' AND stage = 'parked' AND instr(error, 'PARKED-LOW-VALUE-1') = 1;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-rem-a1',
  'proposals are ordered by score under the budget and never dropped (owner 2026-10-26); a hand park whose revive promise no code keeps is a drop, and the fleet already has the ordered, bounded, self-reviving pool the owner asks for',
  'PROPOSAL-PARK-TO-ORDER-1: the 585 PARKED-LOW-VALUE-1 rows are moved under the POOL-BOUND-1 lifecycle (error line only; status, stage and score unchanged) so the existing backpressure tick revives them best score first as the deferred pool has room',
  'research_queue 2026-10-26 19:30Z: 585 rows wontfix/parked with PARKED-LOW-VALUE-1 (581 proposal, 4 goal-author, score 0.14 to 0.79), 0 rows marked POOL-BOUND-1, deferred pool 171 against half of research_deferred_max = 200, queued 195 against research_ready_cap 192; qnfo-fleet-control researchBackpressureTick re-arms rows whose error matches POOL-BOUND-1% in RB_ORDER_SQL order when the pool is below half the bound; RESEARCH-BACKPRESSURE-1 events: pool 249, 240, 171 at 17:40Z, 16:40Z, 18:40Z',
  'applied by migration',
  'research_queue.error of 585 rows; no status, stage, score or queue change; the backpressure tick decides the revival rate (at most half the bound, 29 rows at its next tick)',
  'the Rollback line of migrations/2026-10-26-proposal-park-to-order.sql restores the 585 error texts from the backup table',
  'the low-score proposals have a working, ordered revival path instead of a dead end',
  'the count of PARKED-LOW-VALUE-1 rows is 0 at the next probe; about 29 of the parked rows, best score first, move to deferred at the next backpressure tick (hourly) and no more than the pool has room for afterwards',
  'research: the proposal backlog is ordered by score under the budget instead of cut at a threshold',
  'research_queue, ops_config and qnfo-fleet-control researchBackpressureTick read on 2026-10-26; the offline suite replays the file on node:sqlite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log x WHERE x.action LIKE 'PROPOSAL-PARK-TO-ORDER-1:%');
