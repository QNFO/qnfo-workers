-- POOL-BOUND-SOURCES-1 (2026-10-19, charter pillar research; agent_issues 100213, human_actions 107 / agent_issues 99956; ANTIFRAGILE-1; OWNER-NO-LOOSE-ENDS-1)
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM control_registry WHERE control = 'research-pool-bound'; UPDATE research_queue SET status = 'wontfix', stage = 'parked', error = 'POOL-BOUND-1 parked (POOL-BOUND-SOURCES-1 rollback): ' || COALESCE(error, '') WHERE id IN ('idea-reality-idempotent-exchange-symmetry-20261019', 'idea-12ba4668-71fa-467a-8383-8575c1d8c438') AND error LIKE 'POOL-BOUND-SOURCES-1%'
-- Rollback scope: the registry row and the two re-armed rows; the decision_log row stays (append-only).
-- spof-review: none added. The bound still has its off switch (ops_config research_deferred_max = 0) and its automatic re-arm (pool under half the bound).
--
-- MEASURED (qnfo-audit, 2026-10-19 23:10Z, SELECT only)
--   research_queue: 298 deferred and 189 queued rows; every deferred row and 186 of the queued ones come from idea_proposals name owner-corpus (contact owner),
--   the notebook extractions idea-hub accepts at score 0. POOL-BOUND-1 ranked name LIKE 'owner%' and contact owner as owner-authored (pri 1) and parks only pri 2 rows beyond
--   research_deferred_max (60, no ops_config row), so the pool (metric research_deferred_pool 295, target <= 60) was never parked.
--   Two rows of source idea, queued by an owner directive with no idea_proposals row, read as generated (pri 2) and WERE parked: idea-reality-idempotent-
--   exchange-symmetry-20261019 (the owner task of agent_issues 99956, closed with evidence that it was routed; it sat status wontfix, stage parked since 05:20Z)
--   and idea-12ba4668-71fa-467a-8383-8575c1d8c438 (parked 2026-10-18 14:41Z).
-- WHAT THIS DOES
--   qnfo-fleet-control 0.41.1 (the code): a notebook extraction is a generated row for the pool bound (pri 2) and a row of source idea, chat or operator-prime
--   is ranked and kept with the remediation rows (pri 0). RB_ORDER_SQL still ranks owner-corpus with the owner's proposals, so the best 60 stay in line.
--   This file: re-arms the two parked owner-directed rows to the deferred pool (the revert line POOL-BOUND-1 wrote says status deferred, stage NULL; the next
--   20-minute tick releases them first), gives the one with no score the remediation convention 0.95 so the executor's score order does not put it last,
--   registers the pool bound in control_registry (it had no row) and records the decision.
-- Executor claim order is qnfo-research-exec's (claimed by another session when this was written): it claims rows older than 72 h first, FIFO, so a fresh
-- owner-directed row waits behind them; the follow-up there is to claim source idea, chat and operator-prime first (see decision_log capability_gain).

UPDATE research_queue
   SET status = 'deferred', stage = NULL, score = COALESCE(score, 0.95),
       error = 'POOL-BOUND-SOURCES-1 re-armed ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ': a row of source idea is queued by an owner directive and is never parked. Revert: status wontfix, stage parked'
 WHERE id IN ('idea-reality-idempotent-exchange-symmetry-20261019', 'idea-12ba4668-71fa-467a-8383-8575c1d8c438')
   AND status = 'wontfix' AND stage = 'parked' AND instr(error, 'POOL-BOUND-1 parked') = 1;

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES
  ('research-pool-bound', 'qnfo-fleet-control researchBackpressureTick (POOL-BOUND-1, POOL-BOUND-SOURCES-1); ops_config research_deferred_max', 'cap',
   'the deferred research pool growing without bound behind an executor that publishes 20 to 70 papers a day (328 rows on 2026-10-17, 298 on 2026-10-19)', 0, 'keep', 'applied',
   'a parked row is status wontfix, stage parked with the revert line in error and is re-armed by priority when the pool falls under half the bound; ops_config research_deferred_max = 0 turns the bound off without a deploy; remediation rows, owner-written proposals and rows queued directly by an owner directive (source idea, chat, operator-prime) are never parked',
   '2026-10-19', 'MEASURED 2026-10-19: 298 deferred rows, every one a notebook extraction (owner-corpus), none parked before 0.41.1; two owner-directed idea rows were parked as generated rows. qnfo-fleet-control/pool-bound-sources.test.mjs: a pool of 267 owner-corpus rows parks everything beyond 60, direct rows survive. REVIEW BY 2026-10-26: keep while research_deferred_pool falls toward 120 and no owner-directed row sits parked; if parked rows are not re-armed when the pool drains, lower research_deferred_max.', 100213, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'drain-research',
  'the pool bound exists to meter generated rows; a notebook extraction is generated, an owner directive routed straight into research_queue is not, and parking is reversible by the row''s own revert line',
  'POOL-BOUND-SOURCES-1: qnfo-fleet-control 0.41.1 parks owner-corpus rows beyond research_deferred_max and never parks source idea, chat or operator-prime rows; two parked idea rows re-armed; control_registry row research-pool-bound',
  'qnfo-audit 2026-10-19 23:10Z: research_deferred_pool 295 (target <= 60), 298 deferred rows, every one owner-corpus; research_queue idea-reality-idempotent-exchange-symmetry-20261019 status wontfix, stage parked by POOL-BOUND-1 at 05:20Z while agent_issues 99956 was closed as routed; offline suites qnfo-fleet-control/pool-bound-sources.test.mjs 20 checks and research-backpressure.test.mjs 26 checks pass',
  'merged with the PR',
  'parked rows only, each reversible by its revert line; no row is deleted; the executor and the ready queue order are unchanged',
  'ops_config research_deferred_max = 0 turns the bound off; the Rollback line re-parks the two re-armed rows and removes the registry row',
  'the deferred pool is bound at 60 for notebook extractions as it already was for every other generated row; an owner-directed research task can no longer be parked',
  'research_deferred_pool falls from 295 to at most 120 within 3 ticks of the deploy and the two owner idea rows leave status wontfix; follow-up: qnfo-research-exec claim order should take source idea, chat and operator-prime first',
  'none',
  'd1:qnfo-audit research_queue, idea_proposals, control_registry, metric_registry (SELECT only); offline node:sqlite suites'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'POOL-BOUND-SOURCES-1:') = 1);
