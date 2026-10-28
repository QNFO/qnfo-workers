-- BP26-FORECAST-HYGIENE-1 / BP26-PAPER-PIDS-1 (2026-10-28, charter pillar research; agent_issues 1000337, 1000338): roadmap rows for the work in docs/BP26-PAPER-PIDS-AND-FORECAST-HYGIENE.md.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE roadmap_implementation SET status = 'retired' WHERE source = 'bp26-research-2026-10-28'; UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'ROADMAP-1: QNFO.RSCH #3:%';

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-FORECAST-HYGIENE-1', 'bp26-research-2026-10-28', 'q08 forecasts: resolution-criteria gate, append-only updates, immutable published fields, log score, calibration page', 'worker', 'q08-signal-engine', 'in_progress', 'docs/BP26-PAPER-PIDS-AND-FORECAST-HYGIENE.md; q08-signal-engine 0.38.0' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-FORECAST-HYGIENE-1' AND source = 'bp26-research-2026-10-28');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-PAPER-PIDS-1', 'bp26-research-2026-10-28', 'papers.qnfo.org immutable version URL, sha256 per version, CITATION.cff/BibTeX/CSL-JSON exports', 'worker', 'qnfo-gateway', 'planned', 'docs/BP26-PAPER-PIDS-AND-FORECAST-HYGIENE.md; ROADMAP-1 QNFO.RSCH #1 and #2' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-PAPER-PIDS-1' AND source = 'bp26-research-2026-10-28');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-FORECAST-UPDATE-SCORING-1', 'bp26-research-2026-10-28', 'Score the last forecast update before the horizon beside the original probability', 'worker', 'q08-signal-engine', 'planned', 'docs/BP26-PAPER-PIDS-AND-FORECAST-HYGIENE.md section 3.4' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-FORECAST-UPDATE-SCORING-1' AND source = 'bp26-research-2026-10-28');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ROADMAP-1: QNFO.RSCH #3: q08 scores the last forecast update before the horizon beside the original probability',
 'Charter pillar: research. Serves BP26-FORECAST-HYGIENE-1 (agent_issues 1000337); closes the gap that a forecaster who updates well gets no credit. Lever: in q08-signal-engine resolveForecasts, when a forecast has rows in q08_forecast_updates, also compute the Brier of the last update made before the horizon and show both on /forecasts and /api/forecasts as updated_brier; never overwrite q08_forecasts.probability or brier. Offline test in forecast-hygiene.test.mjs. Done: the version line carries RM-FORECAST-UPDATE-SCORING-1 and the API returns updated_brier for a resolved forecast that had an update.' || char(10) ||
 'code-task: repo=qnfo-workers path=q08-signal-engine/worker.js' || char(10) ||
 'code-anchor: function renderCalibration(c) {',
 'session', 'reliability', 'low', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'ROADMAP-1: QNFO.RSCH #3:%' AND status = 'open');
