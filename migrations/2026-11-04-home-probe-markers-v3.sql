-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = '{"url": "https://fleet.qnfo.org/", "status": 200, "contains": "<title>QNFO fleet status", "max_ms": 15000}' WHERE class = 'rt-page-fleet-queue'; UPDATE remediation_contracts SET verify_probe = '{"url": "https://fleet.qnfo.org/", "status": 200, "contains": ".fx-r{"}' WHERE class = 'fm-page-css-never-sent'; UPDATE remediation_contracts SET verify_probe = '{"url": "https://fleet.qnfo.org/", "status": 200, "contains": "Fix it"}' WHERE class = 'issue-1000784'; UPDATE remediation_contracts SET verify_probe = '{"url": "https://qwav.org/", "status": 200, "contains": "QWAV Research Papers", "max_ms": 10000}' WHERE class = 'rt-page-qwav-home';
-- HOME-PROBE-MARKERS-V3-1 (2026-11-04, charter pillars core and autonomy; owner request: three-screen dashboard, V3-DASH-1, PRs 6923/6943/6979).
-- Cause: the home page at https://fleet.qnfo.org/ is now a static three-screen shell (dashboard 1.82.0 and later), and three hourly contracts still probed the old home for
-- markers only the old page carried. Measured on 2026-11-04 ~16:40Z: GET / holds none of "<title>QNFO fleet status", ".fx-r{" or "Fix it", while GET /overview (the old
-- page, kept) holds all three, and GET / holds "Readers</a>" and ".hero{border-radius". Left alone, rt-page-fleet-queue (3 straight failures) would file
-- RUNTIME-PROBE-FAIL-1 for a page that works, and issue-1000784 (DASHBOARD-FIX-IT-1) would never close.
-- Fix: rt-page-fleet-queue and fm-page-css-never-sent probe the new home on its own markers; issue-1000784 probes the old page where the one-tap Fix it buttons live.
-- Also: agent_issues 1000986 (RUNTIME-PROBE-FAIL-1 rt-page-qwav-home) is a stale marker, not an outage: qwav.org was rebranded and now carries
-- "benchmarked in joules per solution" (3 occurrences, 200 in 0.27 s) and no longer "QWAV Research Papers"; its autoclose trigger closes the issue on the first pass.
-- Only UPDATEs of four contract rows (no DELETE or DROP); the old probe specs are in the Rollback line.

UPDATE remediation_contracts SET verify_probe = '{"url": "https://fleet.qnfo.org/", "status": 200, "contains": "Readers</a>", "max_ms": 15000}' WHERE class = 'rt-page-fleet-queue';
UPDATE remediation_contracts SET verify_probe = '{"url": "https://fleet.qnfo.org/", "status": 200, "contains": ".hero{border-radius"}' WHERE class = 'fm-page-css-never-sent';
UPDATE remediation_contracts SET verify_probe = '{"url": "https://fleet.qnfo.org/overview", "status": 200, "contains": "Fix it"}' WHERE class = 'issue-1000784';
UPDATE remediation_contracts SET verify_probe = '{"url": "https://qwav.org/", "status": 200, "contains": "benchmarked in joules per solution", "max_ms": 10000}' WHERE class = 'rt-page-qwav-home';
