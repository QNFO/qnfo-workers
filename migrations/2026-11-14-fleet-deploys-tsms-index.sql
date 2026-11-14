-- D1-HOT-STATEMENTS-1 step (2026-11-14, charter pillar cost; agent_issues 1003559, GitHub #11900). The dashboard's worker-observability count (qnfo-fleet-dashboard) was the
-- third-heaviest qnfo-audit statement: 41.4M rows read in 445 runs over 24 h (about 93k rows a run, 84 s of D1 time). Its NOT EXISTS compares
-- (julianday(f.ts) - 2440587.5) * 864e5 > x.seen_ms, so idx_fdeploy_worker_ok (worker, ok, ts) could only seek on worker and ok, and every successful deploy of
-- the worker (15.9k rows in fleet_deploys) was read once for each of the 569 open loops. An index on that exact expression lets SQLite seek the range too;
-- migrations/fleet-deploys-tsms-index.test.mjs pins the plan (SEARCH ... <expr>>?) for the live statement text, so a later rewrite that stops matching is caught.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_fdeploy_worker_ok_tsms;
-- CAUSE-MAPPED: registers no metric.

CREATE INDEX IF NOT EXISTS idx_fdeploy_worker_ok_tsms ON fleet_deploys (worker, ok, ((julianday(ts) - 2440587.5) * 864e5));
