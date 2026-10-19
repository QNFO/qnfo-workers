-- PAPER-LEARN-1 (2026-10-19, pillar autonomy and research; owner directive 2026-10-19, verbatim: "THE SYSTEM/FLEET SHALL ALWAYS
-- LEARN FROM ITS OWN RESEARCH PAPERS LIKE THIS"). The fleet published "The Gödelian Boundary as a Generative Phase Transition:
-- Optimal Operating Points for Constrained Cognitive Systems" (papers.qnfo.org, slug the-g-delian-boundary-as-a-generative-
-- phase-transition-optimal-operating-points-, version 1.0.1) and nothing in the fleet read what its papers claim. This file:
--   paper_learnings, paper_learn_state  the knowledge ledger qnfo-lifecycle 1.12.0 PAPER-LEARN-1 fills every hour from each new
--                  or revised published paper (also created by the worker, IF NOT EXISTS). verification is set from what the
--                  paper says, never by a model: checked and refuted are for claims a session or loop recomputed.
--   seed           the learnings from the Gödelian-boundary paper, read in full and recomputed by a session on 2026-10-19:
--                  Gamma* = sqrt(alpha/(alpha+2)) = 0.7071 with U = 0.25 N0, tau(0.99) / tau(Gamma*) = 29.29, f = 0.5122,
--                  U-bar = 0.168 N0, 2.0513x, 24.39 t0 and the Landauer floor 2.9667e-21 J all reproduce. Two derived results
--                  are wrong inside the paper's own model: (1) the duty cycle is not optimal: U = p(1 - p) with p = P/P0 is
--                  concave in power, so by Jensen's inequality any mix of two setpoints under an average budget does worse than
--                  holding the budget steadily: Gamma = sqrt(0.3) = 0.5477 gives 0.21 N0, 1.25x the duty cycle's 0.168 N0 and
--                  2.56x the home point (a grid search over every two-point mix finds 0.21 at the steady point); (2) a positive
--                  quartic term +beta Gamma^4 moves the optimum toward Gamma = 1, not toward 0 (alpha = 2, beta = 0.2: 0.7827
--                  against 0.7071; the stationarity polynomial in the paper is right, its reading is not). The paper also
--                  states "the empirical fact that ... novelty grows superlinearly with self-referential depth" with no source
--                  and makes no measurement, and its reference list skips [9]. These four go to internal_errata (owner
--                  qnfo-research-exec), the queue the errata member and the revision loop read.
--   closure branching  the paper's mean cascade size <s> = 1/(1 - m) of a branching process applied to the fleet's own issue
--                  closures: m = issues reopened / issues dispositioned in 24 h (issue_lifecycle), the expected number of
--                  further closures one closure triggers. closure_branching_ratio_24h and closure_avalanche_mean_24h are
--                  refreshed by trigger paper_learn_branching_tick on the fleet tick in the first ten minutes of each hour.
--                  Measured on 2026-10-19 15:30Z: 211 reopened / 560 dispositioned = 0.377, <s> = 1.60 (each issue is closed
--                  1.6 times on average). The trigger fires above m = 0.5, the paper's representative subcritical point
--                  (<s> = 2: every issue closed twice); as m approaches 1 the cascade diverges and the backlog cannot drain.
--                  belief-fleet-closure-subcritical holds the claim with an hourly d1-query probe.
--   papers_unlearned_over_120m  papers whose current version changed in the last day and waited more than 120 minutes unread (SLA-120M-1),
--                  written by the qnfo-lifecycle tick (the papers live in living-paper, so no D1 trigger here can count them).
-- One follow-up is filed with its code-task: PAPER-LEARN-WATCHMAKER-1 (WATCHMAKER_OPS entry in qnfo-fleet-dashboard; that file
-- was under a live code-loop claim when this was written).
-- No compound SELECT has more than four terms (D1-COMPOUND-LIMIT-1).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS paper_learn_branching_tick; UPDATE ops_config SET value = 'off' WHERE key = 'paper_learn_mode'; DELETE FROM analytics_metric_triggers WHERE notes LIKE 'PAPER-LEARN-1%'; DELETE FROM metric_registry WHERE source_of_truth LIKE '%PAPER-LEARN-1%'; DELETE FROM remediation_contracts WHERE class = 'belief-fleet-closure-subcritical'; DELETE FROM belief_registry WHERE belief_key = 'fleet-closure-subcritical' (paper_learnings, paper_learn_state, internal_errata, decision_log and capability_ledger rows are evidence and stay)

CREATE TABLE IF NOT EXISTS paper_learnings (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, version TEXT, title TEXT, claim TEXT NOT NULL, section TEXT, kind TEXT NOT NULL, support TEXT, verification TEXT NOT NULL, fleet_lever TEXT, application TEXT, applicability TEXT NOT NULL, confidence REAL, fleet_status TEXT NOT NULL DEFAULT 'proposed', status_note TEXT, issue_id INTEGER, source TEXT NOT NULL DEFAULT 'qnfo-lifecycle PAPER-LEARN-1', model TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), updated_at TEXT);
CREATE INDEX IF NOT EXISTS idx_paper_learnings_slug ON paper_learnings (slug, version);
CREATE TABLE IF NOT EXISTS paper_learn_state (slug TEXT NOT NULL, version TEXT NOT NULL, title TEXT, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, n_learnings INTEGER DEFAULT 0, n_unverified INTEGER DEFAULT 0, n_direct INTEGER DEFAULT 0, n_errata INTEGER DEFAULT 0, issue_id INTEGER, model TEXT, note TEXT, learned_at TEXT NOT NULL, PRIMARY KEY (slug, version));

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
 ('paper_learn_mode', 'on', 'PAPER-LEARN-1 (qnfo-lifecycle 1.12.0): on reads new and revised published papers hourly into paper_learnings; off stops the step'),
 ('paper_learn_per_tick', '4', 'PAPER-LEARN-1: papers read per hourly tick (0-8); about 60 papers or versions change a day, so 4 (96 a day) keeps up and drains the older corpus behind them');

-- Seed: the Gödelian-boundary paper, read in full by a session and recomputed (see the header).
INSERT INTO paper_learnings (slug, version, title, claim, section, kind, support, verification, fleet_lever, application, applicability, confidence, fleet_status, status_note, source, created_at)
SELECT 'the-g-delian-boundary-as-a-generative-phase-transition-optimal-operating-points-', '1.0.1',
       'The Gödelian Boundary as a Generative Phase Transition: Optimal Operating Points for Constrained Cognitive Systems',
       v.claim, v.section, v.kind, v.support, v.verification, v.lever, v.app, v.applic, v.conf, v.st, v.note, 'session PAPER-LEARN-1 seed (2026-10-19)', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM (
  SELECT 'Novelty events form a branching process; the mean cascade size is 1/(1 - m), 2 at m = 0.5 and 100 at m = 0.99, and clustered cascades signal that the system has entered the boundary region' AS claim,
         '3.3, 4.2' AS section, 'derived' AS kind, 'geometric series, Section 4.2' AS support, 'checked' AS verification,
         'issue closure process (issue_lifecycle reopened / dispositioned)' AS lever,
         'Treat each reopen as a secondary closure triggered by a primary one: m = reopened / dispositioned in 24 h, <s> = 1/(1 - m) closures per issue. Measured 0.377 and 1.60 on 2026-10-19; trigger above m = 0.5.' AS app,
         'direct' AS applic, 0.9 AS conf, 'applied' AS st, 'migrations/2026-10-19-paper-learn.sql: closure_branching_ratio_24h, closure_avalanche_mean_24h, belief fleet-closure-subcritical' AS note
  UNION ALL SELECT 'Under an average power budget, cycling between the optimum and a shallow home point (f = 0.5122) is the optimal strategy and gives 0.168 N0, 2.05x permanent conservatism',
         '4.4, 7(a)', 'derived', 'Section 4.4 optimizes f only, with both setpoints fixed', 'refuted',
         'AI spend and batch-width governors (BUDGET-SOFT-ROUTE-1, WAI-WIDTH-GOVERNOR-1)',
         'Wrong inside the paper''s own model: U = p(1 - p) is concave in p = P/P0, so holding p = 0.3 steadily gives 0.21 N0 (1.25x the duty cycle). Routed to internal_errata.',
         'none', 0.95, 'routed', 'internal_errata pl-seed-godel-duty-cycle'
  UNION ALL SELECT 'When useful output is concave in spend, spending the budget steadily beats alternating bursts and pauses at the same average (Jensen''s inequality; the corrected reading of Section 4.4)',
         '4.4 (corrected)', 'derived', 'recomputed by the session: steady 0.21 N0 against the best two-point mix 0.21 N0 and the paper''s 0.168 N0', 'checked',
         'budget steering, AIMD stage width, outreach cadence',
         'Keep budgets as a steady rate (cheaper model, smaller batch) rather than stop-and-go; duty-cycling pays only where output is convex in spend (a fixed start-up cost per burst).',
         'direct', 0.85, 'already-in-place', 'BUDGET-SOFT-ROUTE-1 (a breached cap steers to a cheaper model, never a stop) and WAI-WIDTH-GOVERNOR-1 (AIMD width, never zero) already follow it; no change'
  UNION ALL SELECT 'A positive quartic term in the coherence functional moves the optimum toward Gamma = 0 and shrinks the duty-cycle gain',
         '6 (limitations)', 'derived', 'stationarity polynomial alpha - (alpha+2) x + (alpha+4) beta x^2 = 0, x = Gamma^2', 'refuted',
         '', 'The polynomial is right; its smaller root rises with beta (alpha = 2, beta = 0.2: Gamma* = 0.7827 > 0.7071), so the optimum moves toward the boundary. Routed to internal_errata.',
         'none', 0.95, 'routed', 'internal_errata pl-seed-godel-quartic'
) v
WHERE NOT EXISTS (SELECT 1 FROM paper_learnings x WHERE x.slug = 'the-g-delian-boundary-as-a-generative-phase-transition-optimal-operating-points-' AND x.source = 'session PAPER-LEARN-1 seed (2026-10-19)');

INSERT INTO paper_learnings (slug, version, title, claim, section, kind, support, verification, fleet_lever, application, applicability, confidence, fleet_status, status_note, source, created_at)
SELECT 'the-g-delian-boundary-as-a-generative-phase-transition-optimal-operating-points-', '1.0.1',
       'The Gödelian Boundary as a Generative Phase Transition: Optimal Operating Points for Constrained Cognitive Systems',
       'Novelty grows superlinearly with self-referential depth (stated as "the empirical fact")', '3.1', 'empirical', 'none', 'unverified', '',
       'An empirical claim with no source and no measurement in a paper that makes no empirical claims. Routed to internal_errata.',
       'none', 0.9, 'routed', 'internal_errata pl-seed-godel-empirical-fact', 'session PAPER-LEARN-1 seed (2026-10-19) c', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE NOT EXISTS (SELECT 1 FROM paper_learnings x WHERE x.slug = 'the-g-delian-boundary-as-a-generative-phase-transition-optimal-operating-points-' AND x.source = 'session PAPER-LEARN-1 seed (2026-10-19) c');

INSERT INTO paper_learnings (slug, version, title, claim, section, kind, support, verification, fleet_lever, application, applicability, confidence, fleet_status, status_note, source, created_at)
SELECT 'the-g-delian-boundary-as-a-generative-phase-transition-optimal-operating-points-', '1.0.1',
       'The Gödelian Boundary as a Generative Phase Transition: Optimal Operating Points for Constrained Cognitive Systems',
       v.claim, v.section, v.kind, v.support, v.verification, v.lever, v.app, v.applic, v.conf, v.st, v.note, 'session PAPER-LEARN-1 seed (2026-10-19) b', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM (
  SELECT 'With coherence 1 - Gamma^2 and novelty N0 Gamma^alpha, utility peaks in the interior at Gamma* = sqrt(alpha/(alpha+2)) (0.7071 and 0.25 N0 at alpha = 2); both pure regimes give zero' AS claim,
         '4.1' AS section, 'derived' AS kind, 'Section 4.1' AS support, 'checked' AS verification,
         'share of fleet work that changes the fleet itself (control plane, doctrine, loops) against object-level work' AS lever,
         'Only the shape transfers: neither all-meta nor no-meta work is optimal. The fleet has no measured Gamma or alpha, so no setpoint is taken from 0.7071 (the paper''s own misuse warning, 7(f)).' AS app,
         'analogy' AS applic, 0.6 AS conf, 'rejected' AS st, 'no measured analogue of Gamma or alpha in the fleet; the number is not a constant' AS note
  UNION ALL SELECT 'Relaxation time diverges near the boundary, tau = tau0 / |Gamma - Gamma_c|, rising 29.3x from the optimum to distance 0.01',
         '3.3, 4.2', 'derived', 'mean-field assumption nu = 1', 'checked',
         'mttr_h_7d, issue_mttr_h_30d',
         'The fleet''s relaxation time is already measured (MTTR). A 24 h against 7 d ratio of closure times is confounded by backlog drains (closing old issues raises it while the fleet speeds up), so no new signal is added.',
         'analogy', 0.5, 'rejected', 'already measured by mttr_h_7d; a trend ratio would be confounded'
  UNION ALL SELECT 'The transition point may be uncomputable (by analogy with the Chaitin phase transition), so the boundary must be approached adaptively from finite observations, not located exactly',
         '2, 6', 'cited', 'arXiv:2410.02600 as summarized in Section 2', 'cited-unchecked',
         'trust ledger and scope widening (doctrine kernel section TRUST)',
         'The fleet already widens a loop''s scope only from verified outcomes, an adaptive estimate rather than a computed limit.',
         'analogy', 0.6, 'already-in-place', 'v_trust_ledger widens scope from recorded outcomes (doctrine reading o)'
  UNION ALL SELECT 'Every number in the paper follows from assumed functional forms; none has been measured in a cognitive system, and its readiness is TRL 1-2',
         '6, 7(b)', 'assumption', 'stated by the paper', 'assumption', '', 'Use the paper for shapes and signatures, never for setpoints.',
         'none', 0.9, 'n/a', NULL
) v
WHERE NOT EXISTS (SELECT 1 FROM paper_learnings x WHERE x.slug = 'the-g-delian-boundary-as-a-generative-phase-transition-optimal-operating-points-' AND x.source = 'session PAPER-LEARN-1 seed (2026-10-19) b');

INSERT OR IGNORE INTO paper_learn_state (slug, version, title, status, attempts, n_learnings, n_unverified, n_direct, n_errata, model, note, learned_at)
VALUES ('the-g-delian-boundary-as-a-generative-phase-transition-optimal-operating-points-', '1.0.1',
        'The Gödelian Boundary as a Generative Phase Transition: Optimal Operating Points for Constrained Cognitive Systems',
        'ok', 1, 9, 1, 2, 4, 'session', 'read in full and recomputed by a session; seeded by migrations/2026-10-19-paper-learn.sql', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

-- The paper's errors go to the errata queue the research pipeline reads (ERRATA-INTERNAL-SWEEP-1), owner qnfo-research-exec.
INSERT OR IGNORE INTO internal_errata (id, target_kind, target_ref, detected_at, detected_by, severity, claim_text, falsification, evidence, remediation, status, owner)
SELECT v.id, 'paper', 'the-g-delian-boundary-as-a-generative-phase-transition-optimal-operating-points-', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
       'session PAPER-LEARN-1 (2026-10-19)', v.sev, v.claim, v.fals, v.ev,
       'revise through the research pipeline (REVISION-LOOP-1 or a remediation row): ' || v.fix, 'open', 'qnfo-research-exec'
FROM (
  SELECT 'pl-seed-godel-duty-cycle' AS id, 'high' AS sev,
         'Section 4.4, Results 5, Conclusion and 7(a): the duty-cycled exploration-consolidation strategy (f = 0.51220) is "the optimal duty cycle" and its 0.168 N0 is a 2.05x improvement, so designers should cycle rather than dwell.' AS claim,
         'With P = P0 Gamma^2 and U = N0 Gamma^2 (1 - Gamma^2) at alpha = 2, utility as a function of p = P/P0 is p(1 - p), concave. Under the average constraint p-bar <= 0.3 every mix of setpoints is beaten by holding p = 0.3: Gamma = 0.5477, U = 0.21 N0 (1.25x the duty cycle, 2.56x the home point). Section 4.4 optimizes f with both setpoints fixed, so it finds the best mix of two arbitrary points, not the optimum.' AS fals,
         'Recomputed by a session: steady 0.3 x 0.7 = 0.21; grid search over all two-point mixes under the 0.3 budget finds 0.21 at the steady point.' AS ev,
         'state the constrained optimum (steady operation at the budget for a concave utility), say when duty cycling helps (a convex utility in power, e.g. a fixed start-up cost per excursion), and correct the 2.05x claim in the Abstract, Results, 7(a) and the Conclusion' AS fix
  UNION ALL SELECT 'pl-seed-godel-quartic', 'high',
         'Section 6, Limitations: with Psi = 1 - Gamma^2 + beta Gamma^4, "as beta grows, this root moves toward Gamma = 0".',
         'For f(x) = alpha - (alpha+2) x + (alpha+4) beta x^2 (x = Gamma^2), raising beta raises f at every x, so the smaller root, where f falls through zero, moves up: alpha = 2, beta = 0.2 gives x = 0.6126, Gamma* = 0.7827 > 0.7071. The optimum moves toward the boundary.',
         'Recomputed by a session from the paper''s own stationarity polynomial.',
         'correct the direction of the sensitivity and any statement that the duty-cycle gain shrinks with beta'
  UNION ALL SELECT 'pl-seed-godel-empirical-fact', 'high',
         'Section 3.1: "The power law encodes the empirical fact that shallow systems produce nothing new while novelty grows superlinearly with self-referential depth".',
         'The paper makes no empirical claims (Section 1) and cites no measurement of novelty against self-referential depth; the superlinear growth is the assumption alpha > 1, not a fact.',
         'Read in full by a session: no reference in [1]-[11] measures novelty against self-reference.',
         'restate it as an assumption (alpha > 1) or cite a measurement'
  UNION ALL SELECT 'pl-seed-godel-refnum', 'low',
         'References: the list runs [1]-[8], [10], [11]; [9] is missing.',
         'A numbering gap in the rendered reference list.',
         'Read in full by a session.',
         'renumber the references and the citations that use them'
) v;

-- Closure branching (the paper's cascade size applied to the fleet's issue closures).
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('closure_branching_ratio_24h', 'operational', 'target', 'issue_lifecycle reopened events / dispositioned events in the last 24 h (denominator at least 1): the expected number of further closures one closure triggers (branching ratio m of the closure process)', 'qnfo-audit.issue_lifecycle (PAPER-LEARN-1, migrations/2026-10-19-paper-learn.sql)', '0.377 on 2026-10-19 15:30Z (211 reopened, 560 dispositioned)', '<= 0.2', 'qnfo-fleet-control', 'trigger gt 0.5', '1h', '> 0.33', '> 0.5', NULL, NULL, 'MEASURED', 'computed'),
 ('closure_avalanche_mean_24h', 'operational', 'target', '1 / (1 - closure_branching_ratio_24h), 999 at m >= 0.999: mean closures per issue (mean cascade size of a branching process; Gödelian-boundary paper Section 4.2)', 'qnfo-audit.issue_lifecycle (PAPER-LEARN-1)', '1.60 on 2026-10-19', '<= 1.25', 'qnfo-fleet-control', 'exempt: the trigger is on closure_branching_ratio_24h (same signal)', '1h', '> 1.5', '> 2', NULL, NULL, 'MEASURED', 'computed'),
 ('papers_unlearned_over_120m', 'operational', 'target', 'published papers (body at least 8,000 chars) whose current version changed between 120 and 1,440 minutes ago and has no paper_learn_state row (or a failed one under 3 tries), after the qnfo-lifecycle hourly read; the older corpus drains behind them and is not counted', 'qnfo-lifecycle PAPER-LEARN-1 tick (living-paper.papers, qnfo-audit.paper_learn_state)', 'first read at apply (about 60 papers or versions change a day; 4 are read a tick)', '0', 'qnfo-lifecycle', 'trigger gt 10', '1h', '> 0', '> 10', NULL, NULL, 'UNMEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS paper_learn_branching_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:%'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * (SELECT COUNT(*) FROM issue_lifecycle WHERE event = 'reopened' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'))
             / MAX(1, (SELECT COUNT(*) FROM issue_lifecycle WHERE event = 'dispositioned' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'))), 3)) AS TEXT)
  WHERE metric = 'closure_branching_ratio_24h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT CASE WHEN m >= 0.999 THEN 999 ELSE ROUND(1.0 / (1.0 - m), 3) END
      FROM (SELECT CAST(COALESCE((SELECT last_value FROM metric_registry WHERE metric = 'closure_branching_ratio_24h'), '0') AS REAL) AS m)) AS TEXT)
  WHERE metric = 'closure_avalanche_mean_24h';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.k, v.t, 'registry', v.op, v.th, 3, v.a, v.o, 'agent_issues', 24, 1, 'PAPER-LEARN-1 (migrations/2026-10-19-paper-learn.sql)'
FROM (
  SELECT 'closure_branching_ratio_24h' AS k, 'Closure branching: more than one reopen for every two closures in 24 h' AS t, 'gt' AS op, 0.5 AS th,
    'Pillar autonomy (PAPER-LEARN-1, from the Gödelian-boundary paper Section 4.2: mean cascade size 1/(1 - m) doubles at m = 0.5 and diverges as m approaches 1). Each reopen is a closure that did not hold. Read SELECT l.issue_id, a.title, a.source, COUNT(*) AS reopens FROM issue_lifecycle l JOIN agent_issues a ON a.id = l.issue_id WHERE l.event = ''reopened'' AND l.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') GROUP BY 1 ORDER BY reopens DESC LIMIT 20. The levers: a closer that closes on a flapping probe (fix the probe to read a stable state, or require two passing reads), a producer that refiles what it closed (issue_refile_reopen fires on its insert: dedupe against the cause, not the title), a fix that does not reach production (follow the deploy before closing). Done: closure_branching_ratio_24h <= 0.5 at two refreshes, falling toward 0.2.' AS a,
    'qnfo-fleet-control' AS o
  UNION ALL SELECT 'papers_unlearned_over_120m', 'Paper learning: new or revised papers wait unread past the 120-minute SLA', 'gt', 10,
    'Pillar autonomy (PAPER-LEARN-1, owner directive 2026-10-19: the fleet always learns from its own papers). Read GET https://qnfo-lifecycle.q08.workers.dev/paper-learn/status and SELECT status, COUNT(*), MAX(note) FROM paper_learn_state GROUP BY 1. Levers: raise ops_config paper_learn_per_tick (at most 8; BUDGET-SOFT-ROUTE-1 lets a breached cap slow it, never stop it); a run of failed rows names the model error in note (the second family is the per-request fallback). Done: papers_unlearned_over_120m <= 10 at two refreshes, falling to 0.',
    'qnfo-lifecycle'
) v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.k);

INSERT OR IGNORE INTO belief_registry (belief_key, claim, confidence, evidence, probe_class, built_on)
VALUES ('fleet-closure-subcritical', 'The fleet''s issue closure process is subcritical: fewer than one reopen for every two closures in 24 h (closure_branching_ratio_24h < 0.5), so a closure triggers a bounded cascade of further closures (mean under 2).', 0.7,
        'issue_lifecycle 2026-10-19 15:30Z: 211 reopened, 560 dispositioned in 24 h, m = 0.377, mean cascade 1.60 (Gödelian-boundary paper Section 4.2, PAPER-LEARN-1)',
        'belief-fleet-closure-subcritical', 'PAPER-LEARN-1 closure branching metrics');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, module, status)
VALUES ('belief-fleet-closure-subcritical', NULL, 'DOCTRINE-1 belief (PAPER-LEARN-1)', 'belief probe',
        'SELECT ''1'' AS expected, CASE WHEN CAST(COALESCE((SELECT last_value FROM metric_registry WHERE metric = ''closure_branching_ratio_24h''), ''1'') AS REAL) < 0.5 THEN ''1'' ELSE ''0'' END AS observed',
        'd1-query', 'qnfo-fleet-control', 1, 'belief', 'active');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('learn from the fleet''s own published papers', 'PAPER-LEARN-1 (qnfo-lifecycle 1.12.0, migrations/2026-10-19-paper-learn.sql)', 'living-paper.papers, Workers AI (glm-5.3-flash with gpt-oss-120b fallback), qnfo-audit',
        'new; second family confirms errors before they reach internal_errata', '2026-10-19', NULL,
        'paper_learnings, paper_learn_state, GET /paper-learn/status; seed: the Gödelian-boundary paper (9 learnings, 2 derived results refuted, 4 errata)');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'session PAPER-LEARN-1', 'Owner directive 2026-10-19: the fleet always learns from its own papers; a paper''s claims are leads until checked, and its errors are corrected through the pipeline that wrote it',
  'Built an hourly paper reader (qnfo-lifecycle 1.12.0), a learnings ledger, closure branching metrics and a belief from the Gödelian-boundary paper; routed its 4 errors to internal_errata',
  'Paper read in full from living-paper.papers; 7 of its numbers reproduce; the duty-cycle optimum and the quartic sensitivity are wrong in its own model; issue_lifecycle 24 h: m = 0.377',
  'applied by migration', 'qnfo-audit rows and one hourly worker step; three Workers AI calls at most per paper (read, fallback, error check)',
  'ops_config paper_learn_mode = off; DROP TRIGGER paper_learn_branching_tick',
  'the fleet reads its own research and turns it into tracked learnings, metrics and errata',
  'papers_unlearned_over_120m <= 10 within 120 minutes; paper_learnings grows by about 4 papers an hour', 'living-paper D1, qnfo-audit D1, papers.qnfo.org (refused by the session proxy; the D1 row was read instead)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'session PAPER-LEARN-1');

-- Follow-up with a doer: the watchmaker index entry (qnfo-fleet-dashboard/worker.js was under a live code-loop claim).
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'PAPER-LEARN-WATCHMAKER-1: count the hourly paper-learning step in the watchmaker index',
  'Charter pillar: autonomy. qnfo-lifecycle 1.12.0 PAPER-LEARN-1 is a new recurring operation (hourly, cloud_ops_events job-run rows with job paper-learn). CLAUDE.md WATCHMAKER-INDEX-1: a PR that adds a recurring operation adds it to WATCHMAKER_OPS. Add as the first entry of WATCHMAKER_OPS in qnfo-fleet-dashboard/worker.js: { key: "paper-learn", what: "Learning from the fleet''s own papers: claims, levers and errata from each new or revised paper (PAPER-LEARN-1, qnfo-lifecycle, hourly)", runner: "cron:qnfo-lifecycle", cadence_h: 1, first_due: "2026-10-20T00:00:00Z", sql: "SELECT MAX(ts) AS last FROM cloud_ops_events WHERE kind = ''job-run'' AND job = ''paper-learn''" }, and bump VERSION (patch).
code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js
code-anchor: var WATCHMAKER_OPS = [
code-probe: {"paths": ["qnfo-fleet-dashboard/worker.js"], "contains": "key: \"paper-learn\""}',
  'session PAPER-LEARN-1', 'optimization', 'medium', 'open',
  CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER), CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'PAPER-LEARN-WATCHMAKER-1:%');

INSERT INTO fleet_tick (source) VALUES ('migration:paper-learn');
