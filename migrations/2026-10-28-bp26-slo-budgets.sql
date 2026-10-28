-- BP26-SLO-ERROR-BUDGETS-1 (2026-10-28, charter pillar autonomy; agent_issues 1000357, GitHub 4453; program QNFO.OPS, project BP26.AGENTOPS, session bp26-reliability).
-- WHAT: SLO definitions per public surface (availability, objective 0.995 over 28 days, the SLI that scripts/bp26_web.py already records as bp26_probe_results subject avail:<host>),
-- the error-budget state per surface, incidents and automatic blameless postmortems (timeline, root-cause class, actions as agent_issues). scripts/bp26_slo.py (runner, hourly) fills
-- slo_budget_state, incidents and postmortems and measures postmortem_coverage. ops_config slo_budget_spent lists the surfaces whose budget is spent: the merge lane reads it to take
-- reliability changes only (roadmap row below; the lane lives in qnfo-fleet-control).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS postmortems; DROP TABLE IF EXISTS incidents; DROP TABLE IF EXISTS slo_budget_state; DROP TABLE IF EXISTS slo_definitions; DELETE FROM ops_config WHERE key = 'slo_budget_spent'; DELETE FROM roadmap_implementation WHERE item IN ('BP26-SLO-ERROR-BUDGETS-1', 'ROADMAP-1: QNFO.OPS BP26-SLO-MERGE-LANE-1', 'ROADMAP-1: QNFO.OPS BP26-SLO-FRESHNESS-1'); UPDATE metric_registry SET source_of_truth = 'postmortems (to build) [BP26]' WHERE metric = 'postmortem_coverage';

CREATE TABLE IF NOT EXISTS slo_definitions (
  surface TEXT PRIMARY KEY,
  sli TEXT NOT NULL,
  objective REAL NOT NULL,
  window_days INTEGER NOT NULL DEFAULT 28,
  source TEXT NOT NULL,
  owner TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS slo_budget_state (
  surface TEXT PRIMARY KEY,
  evaluated_at TEXT NOT NULL,
  window_days INTEGER NOT NULL,
  samples INTEGER NOT NULL,
  bad INTEGER NOT NULL,
  objective REAL NOT NULL,
  attainment REAL,
  budget_spent_pct REAL,
  state TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  incident_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  surface TEXT,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  summary TEXT NOT NULL,
  source_ref TEXT
);

CREATE TABLE IF NOT EXISTS postmortems (
  incident_key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  state TEXT NOT NULL,
  timeline TEXT NOT NULL,
  root_cause TEXT,
  contributing TEXT,
  actions TEXT,
  action_issue TEXT,
  generator TEXT NOT NULL DEFAULT 'scripts/bp26_slo.py'
);

INSERT OR IGNORE INTO slo_definitions (surface, sli, objective, window_days, source, owner) VALUES
 ('travel.q08.org', 'availability: answers 2xx/3xx/401/403 under 5 s', 0.995, 28, 'bp26_probe_results avail:travel.q08.org', 'program-manager:QNFO.OPS'),
 ('qnfo.org', 'availability: answers 2xx/3xx/401/403 under 5 s', 0.995, 28, 'bp26_probe_results avail:qnfo.org', 'program-manager:QNFO.OPS'),
 ('papers.qnfo.org', 'availability: answers 2xx/3xx/401/403 under 5 s', 0.995, 28, 'bp26_probe_results avail:papers.qnfo.org', 'program-manager:QNFO.OPS'),
 ('qwav.org', 'availability: answers 2xx/3xx/401/403 under 5 s', 0.995, 28, 'bp26_probe_results avail:qwav.org', 'program-manager:QNFO.OPS'),
 ('ai.qnfo.org', 'availability: answers 2xx/3xx/401/403 under 5 s', 0.995, 28, 'bp26_probe_results avail:ai.qnfo.org', 'program-manager:QNFO.OPS'),
 ('archive.qnfo.org', 'availability: answers 2xx/3xx/401/403 under 5 s', 0.995, 28, 'bp26_probe_results avail:archive.qnfo.org', 'program-manager:QNFO.OPS'),
 ('ask.qwav.tech', 'availability: answers 2xx/3xx/401/403 under 5 s', 0.995, 28, 'bp26_probe_results avail:ask.qwav.tech', 'program-manager:QNFO.OPS'),
 ('fleet.qnfo.org', 'availability: answers 2xx/3xx/401/403 under 5 s', 0.995, 28, 'bp26_probe_results avail:fleet.qnfo.org', 'program-manager:QNFO.OPS'),
 ('ideas.qnfo.org', 'availability: answers 2xx/3xx/401/403 under 5 s', 0.995, 28, 'bp26_probe_results avail:ideas.qnfo.org', 'program-manager:QNFO.OPS'),
 ('ipatent.qnfo.org', 'availability: answers 2xx/3xx/401/403 under 5 s', 0.995, 28, 'bp26_probe_results avail:ipatent.qnfo.org', 'program-manager:QNFO.OPS'),
 ('me.q08.org', 'availability: answers 2xx/3xx/401/403 under 5 s', 0.995, 28, 'bp26_probe_results avail:me.q08.org', 'program-manager:QNFO.OPS'),
 ('q08.org', 'availability: answers 2xx/3xx/401/403 under 5 s', 0.995, 28, 'bp26_probe_results avail:q08.org', 'program-manager:QNFO.OPS'),
 ('reading.q08.org', 'availability: answers 2xx/3xx/401/403 under 5 s', 0.995, 28, 'bp26_probe_results avail:reading.q08.org', 'program-manager:QNFO.OPS');

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('slo_budget_spent', '', 'BP26-SLO-ERROR-BUDGETS-1: comma list of surfaces whose 28-day error budget is spent, written hourly by scripts/bp26_slo.py; the merge lane takes reliability changes only while it is non-empty (roadmap ROADMAP-1: QNFO.OPS BP26-SLO-MERGE-LANE-1)');

UPDATE metric_registry SET source_of_truth = 'qnfo-audit.postmortems and incidents (incidents of the last 30 days with a completed postmortem within 72 hours of opening / all incidents): scripts/bp26_slo.py collect_slo, runner [BP26]'
  WHERE metric = 'postmortem_coverage';

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence)
SELECT 'BP26-SLO-ERROR-BUDGETS-1', 'bp26-catalogue', 'SLOs, error budgets and automatic blameless postmortems for the public surfaces', 'code', 'scripts/bp26_slo.py; docs/SLO-ERROR-BUDGETS.md; tables slo_definitions, slo_budget_state, incidents, postmortems', 'implemented',
  'scripts/bp26_slo.py --selftest passes; postmortem_coverage is measured by the runner; slo_attainment_28d_min is measured by scripts/bp26_web.py'
WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'BP26-SLO-ERROR-BUDGETS-1');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence)
SELECT 'ROADMAP-1: QNFO.OPS BP26-SLO-MERGE-LANE-1', 'bp26-catalogue', 'Merge lane takes reliability changes only while ops_config slo_budget_spent is non-empty', 'code', 'qnfo-fleet-control/worker.js', 'planned',
  'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js; serves charter pillar autonomy; moves slo_attainment_28d_min by freezing feature merges while a budget is spent'
WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'ROADMAP-1: QNFO.OPS BP26-SLO-MERGE-LANE-1');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence)
SELECT 'ROADMAP-1: QNFO.OPS BP26-SLO-FRESHNESS-1', 'bp26-catalogue', 'Freshness SLI for the q08 research desk (published by 09:00 CET) and a latency SLI per public surface, recorded so slo_definitions can hold them', 'code', 'scripts/bp26_web.py', 'planned',
  'code-task: repo=qnfo-workers path=scripts/bp26_web.py; serves charter pillar autonomy; adds SLI history beyond availability'
WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'ROADMAP-1: QNFO.OPS BP26-SLO-FRESHNESS-1');
