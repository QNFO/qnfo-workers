-- BUDGET-AUTO-PROMOTE-1 (#1680, 2026-10-01): qnfo-ops 2.38.18 tags interactive turns it hands to the
-- durable job path (origin='budget-promote') and records when each finished job's result was shown
-- to the owner (surfaced_at). ensureJobsSchema creates both columns on a fresh table; this adds them
-- to the live one.
ALTER TABLE ops_jobs ADD COLUMN origin TEXT;
ALTER TABLE ops_jobs ADD COLUMN surfaced_at TEXT;
