-- APPLY-QUEUE-2026-09-13.sql
-- Target: qnfo-audit (D1). Staged by qnfo-ops / ops-exec 2026-09-13.
-- Apply in order. Each section has a report query first; run it and read the output.
--
-- REVISION 4 (2026-09-13T14:25Z) - APPLIED, AND A CORRECTED PREMISE.
--
-- CORRECTION TO EVERY EARLIER REVISION OF THIS FILE:
--   The header said "qnfo-ops has NO D1 write path (ops_d1_query is SELECT-only)."
--   The parenthetical is true; the claim is FALSE. qnfo-ops carries ops_d1_write
--   (guarded multi-DB write; destructive statements need confirm:true). An operator
--   session read this header, believed it, and repeated "no D1 write path" across a
--   full audit while the kill switch in S0 sat unset. Do not re-propagate it.
--   Verify capabilities against the tool set, not against a comment in a staged
--   file - this file's own header is the counter-example.
--
-- STATUS (2026-09-13T14:23-14:25Z, all via ops_d1_write, all read back):
--   S0  APPLIED  fleet_deploy_state auto_heal 1->0, enabled 1->0   (2 rows)
--   S1  APPLIED  CREATE VIEW unified_open_issues                  (mismatch 0/0)
--   S2  APPLIED  ALTER TABLE report_card_history + backfill       (S2.3 PASSES)
--   S3  STILL STAGED (the reaper needs a worker-side fix)
--
-- The full S5/S6 census written in Revision 3 is preserved in git history
-- (commit 0b628b932369bbedfacbf85c2106de899a7e7f41) and in the ops-workspace
-- amendment series. S8 below carries only the deltas found after it.

-- =====================================================================
-- S0  APPLIED - stop the deploy/heal loop
--     qnfo-fleet-control's own source-verified findings
--     (qnfo-fleet-control/FINDINGS-2026-09-13-deploy-subsystem-source-verified.md)
--     name this as the PRIMARY remediation and state the README documents both keys
--     as fail-closed 0:
--       UPDATE fleet_deploy_state SET value='0', updated_at=datetime('now')
--       WHERE key IN ('auto_heal','enabled');
--     Both were 1 (set 2026-09-08 16:25:49) while 1,492 drift rows sat across 50
--     workers - the precondition the README warns about was unmet.
--     Verified after write: auto_heal=0, enabled=0, updated 2026-09-13 14:23:10.
--     This stops: the hourly personal-companion downgrade attempt (canonical 1.0.0
--     over live v1.1.0), the qnfo-cloud-ops retry (25 attempts / 0 ok), and the
--     qnfo-observability redeploy against a stale canonical.
--     Re-enabling is a deliberate operator act, not a default.
-- =====================================================================

-- =====================================================================
-- S1  D14 - unify the split-brain issue ledgers.  ** APPLIED **
--     issue_ledger has NO id column: its key is `fingerprint` (TEXT).
--     agent_issues.created_at is INTEGER epoch-ms; issue_ledger.first_seen is ISO
--     TEXT. Both normalised in the view.
--
--     THE COUNTS MOVED THROUGHOUT THE SESSION. That is the point of S1.2:
--       staging (2026-09-13 AM): agent_issues 12 open / issue_ledger 303 open
--       14:12Z:                  agent_issues  3 open / issue_ledger  88 open
--       14:19Z:                  agent_issues 11 open / issue_ledger   7 open
--       14:25Z:                  agent_issues 23 open / issue_ledger   5 open
--     At ~14:14-14:15Z a concurrent process resolved 81 ledger rows (183 resolved
--     today) and filed 11 new agent_issues (ids 691-701). The split-brain did not
--     disappear; it was consolidated ledger->issues.
-- =====================================================================

-- S1.0 report (re-runnable)
SELECT 'agent_issues' AS store, COUNT(*) AS open_rows FROM agent_issues WHERE status = 'open'
UNION ALL
SELECT 'issue_ledger', COUNT(*) FROM issue_ledger WHERE status = 'open';

-- S1.1 APPLIED (idempotent). The definition that was run:
-- CREATE VIEW IF NOT EXISTS unified_open_issues AS
-- SELECT 'agent_issues' AS store, CAST(id AS TEXT) AS ref, priority AS prio,
--        title AS title, status AS status,
--        CASE WHEN typeof(created_at) = 'integer'
--             THEN strftime('%Y-%m-%dT%H:%M:%SZ', created_at / 1000.0)
--             ELSE created_at END AS opened_at
-- FROM agent_issues WHERE status = 'open'
-- UNION ALL
-- SELECT 'issue_ledger', fingerprint, level, title, status, first_seen
-- FROM issue_ledger WHERE status = 'open';

-- S1.2 acceptance - MUST NOT be a frozen row total.
--     Revision 1 said "must return >= 303 (the ledger alone), i.e. 12 + 303 = 315
--     rows". Both operands were staging-session values. The true total went
--     315 -> 91 -> 18 -> 28 within one session, so a frozen gate reads as a
--     FAILURE on a fix that worked. Accept by construction instead.
--     RESULT 2026-09-13T14:25Z against the live view: agent_issues base 23 /
--     view 23 / mismatch 0; issue_ledger base 5 / view 5 / mismatch 0. The gate
--     held across two different totals (18 and 28) within ten minutes.
SELECT 'agent_issues' AS store,
       (SELECT COUNT(*) FROM agent_issues WHERE status = 'open') AS base,
       (SELECT COUNT(*) FROM unified_open_issues WHERE store = 'agent_issues') AS view,
       (SELECT COUNT(*) FROM agent_issues WHERE status = 'open')
         - (SELECT COUNT(*) FROM unified_open_issues WHERE store = 'agent_issues') AS mismatch
UNION ALL
SELECT 'issue_ledger',
       (SELECT COUNT(*) FROM issue_ledger WHERE status = 'open'),
       (SELECT COUNT(*) FROM unified_open_issues WHERE store = 'issue_ledger'),
       (SELECT COUNT(*) FROM issue_ledger WHERE status = 'open')
         - (SELECT COUNT(*) FROM unified_open_issues WHERE store = 'issue_ledger');

-- S1.3 follow-up (not in this queue): point ops_issues_list / backlog_status at
-- unified_open_issues. Until that ships, every backlog figure this fleet reports
-- undercounts by the size of the ledger store.

-- S1.3b NECESSARY BUT NOT SUFFICIENT. deployment_history ids 55/56/57 record a
-- deliberate "Convert agent_issues writers -> issue_ledger" patch (#449) for
-- qnfo-ops, record 57 stating "Live: 0 agent_issues writes, 7 issue_ledger refs"
-- (record 55 is a FAILED build of the same change: stray brace at worker.js:1119).
-- So this is a HALF-COMPLETED migration, not an accident - and because
-- agent_issues still gained rows at 14:14Z, something OTHER than qnfo-ops still
-- writes it. That writer must also be redirected or the split re-forms.

-- =====================================================================
-- S2  D16 - restore the SAI time series.  ** APPLIED **
--     report_card_history had 1 row with sai = NULL, grade = NULL; the writer
--     (fleet_runs id=111, 'report-card-weekly') failed with "table
--     report_card_history has no column named source", so the trigger value was
--     stuffed into signals_json instead.
-- =====================================================================

-- S2.0 precondition - returned 0 at 2026-09-13T14:1xZ, so S2.1 was required.
--     Re-run before any future apply; if it returns 1, SKIP S2.1 (ALTER TABLE ADD
--     COLUMN is not idempotent in SQLite).
SELECT COUNT(*) AS has_source_column
FROM pragma_table_info('report_card_history')
WHERE name = 'source';

-- S2.1 APPLIED
-- ALTER TABLE report_card_history ADD COLUMN source TEXT DEFAULT 'unknown';

-- S2.2 APPLIED (changes = 1)
-- UPDATE report_card_history
-- SET source = COALESCE(json_extract(signals_json, '$.source'), 'unknown')
-- WHERE source = 'unknown' AND signals_json IS NOT NULL AND json_valid(signals_json) = 1;

-- S2.3 acceptance - PASSES. Live read 2026-09-13T14:25Z:
--   id=1, ts=2026-09-10T12:33:04Z, sai=NULL, grade=NULL,
--   source='cloud-weekly-cron-trigger'
SELECT id, ts, sai, grade, source FROM report_card_history ORDER BY ts DESC LIMIT 10;
-- NOTE: sai and grade remain NULL. The column exists and the trigger value is
-- preserved, but the SAI time series itself is still empty - one row, no scores.
-- The weekly cron's first genuine Monday fire is 2026-09-14T06:30Z.

-- =====================================================================
-- S3  D17 - ops_jobs never terminates.  ** STILL STAGED **
--     LIVE (2026-09-13T14:30Z): 100 succeeded / 35 continuing / 8 failed /
--     10 running. The continuing cohort ACCRUED (19 -> 22 -> 35) during the
--     audit; it does not drain. 35/35 continuing rows hold length(response)>0,
--     and one SUCCEEDED row holds none - so `status` is wrong in BOTH directions
--     and neither column can be trusted alone.
--     PREFERRED FIX IS WORKER-SIDE: write `response` and the terminal status in
--     one statement, and add a `terminal_at` column. The reaper below is a
--     fallback and is deliberately COMMENTED OUT - marking a chain-midpoint row
--     succeeded can corrupt chain bookkeeping if a successor was spawned.
-- =====================================================================

-- S3.0 report first: candidates (response present, no recent update)
SELECT status, COUNT(*) AS n, MAX(updated_at) AS newest_update
FROM ops_jobs WHERE length(response) > 0 GROUP BY status;

-- S3.1 fallback reaper - DO NOT RUN without reading S3.0 and checking each row's
--     chain successor. Uncomment deliberately.
-- UPDATE ops_jobs SET status = 'succeeded', updated_at = datetime('now')
-- WHERE status = 'continuing' AND length(response) > 0
--   AND updated_at < datetime('now', '-1 hour');

-- =====================================================================
-- S4  Not in this queue (documented only; needs worker source or a deploy):
--     W1 deployer comparator - NOW SOURCE-VERIFIED ELSEWHERE. See
--        qnfo-fleet-control/FINDINGS-2026-09-13-deploy-subsystem-source-verified.md
--        (D1-D6) and qnfo-fleet-control/version-compare.mjs (corrected comparator,
--        20/20 assertions). Defects: versionOf() not worker-scoped (takes the FIRST
--        VERSION in a merged bundle, so it read a sub-module's); newer() misorders
--        live strings because num() does split("-")[0] so "v1.1.0" -> parseInt("v1")
--        -> NaN -> 0; `direction` is computed then discarded; r2Read() lacks the
--        tombstone rejection the GitHub path has; NO_SELF names qnfo-fleet-deploy
--        while qnfo-fleet-control is what runs; multipart metadata omits
--        script_name (the independent cause of personal-companion's 10021).
--        Deploying the patch is a deploy, which this endpoint cannot perform.
--     W1(b) personal-companion upload - 30 attempts / 4 ok. NOW GATED OFF by S0.
--        Root cause is D2+D6 above, not a bad artefact.
--     W4 probe coverage 12/55 -> 55/55 via service bindings. This is the limit that
--        prevents the S8/W2b comparator test from covering all workers.
--     W8 gateway capacity / unsatisfiable 24h [gw-fail] auto-close predicate.
--     W9 one autonomy/kill-switch evaluator (currently split across
--        governance_kernel.autonomy_boundary, fleet_deploy_state, autonomy_scores).
-- =====================================================================

-- =====================================================================
-- S8  DELTAS FOUND AFTER REVISION 3 (2026-09-13T14:20-14:50Z)
--     Revision 3's S5/S6 census is unchanged and still authoritative for the
--     items below except where superseded here.
-- =====================================================================

-- S8.1 CORRECTED: E1 did not recur hourly.
--    fleet_deploys grouped by worker: personal-companion 30 attempts / 26 fail
--    (09-12 08:01 -> 09-13 13:01); qnfo-cloud-ops 25 / 25 (09-12 10:01 ->
--    09-13 07:02); qnfo-fleet-advisor 3 / 2 (09-09, retired); qnfo-observability
--    1 / 1 (09-13 14:04:01); all 11 other workers 1-3 attempts / 0 fail.
--    26 + 25 = 51, exactly agent_issues 692's "51 of 76 rows ... 2 permanently-
--    failing targets" - those targets are personal-companion and qnfo-cloud-ops,
--    NOT observability. Revision 3 cited "drift failed 26 / fleet-execute failed
--    25" as E1's recurrence; those are self_heal_actions fleet-wide kind totals.
--    Both chronic loops were quiet for 1.5-7.5h before S0.

-- S8.2 CORRECTED: the drift comparator's mechanism, source-verified elsewhere.
--    D1: versionOf() takes code.indexOf("VERSION") - the FIRST VERSION in a merged
--        bundle, so it read a sub-module's constant (qnfo-fleet-control reported
--        deployed 0.3.4 / canonical 0.3.3, where 0.3.3 is the advisor module's).
--    D2: num() does split("-")[0], so "v1.1.0" -> parseInt("v1") -> NaN -> 0 ->
--        [0,1,0], which sorts BELOW "1.0.0" = [1,0,0]. The polarity matters:
--        scan() only redeploys the branch it classifies as *behind*, so the
--        mis-ordered "false" rows are the ones that get deployed.
--    This supersedes the "deploy-time tag" hypothesis in the workspace amendments
--    (AMENDMENT 21). qnfo-email/deployed-current.worker.js contains no
--    'fabric-20260910' string, which falsified that hypothesis; D1/D2 explain the
--    same observation with source.

-- S8.3 CONFIRMED (measurement, unchanged): 6 of 6 testable workers show the
--    comparator's deployed_version disagreeing with live /health -
--    qnfo-paper-indexer (2.2.0 vs .../fabric-20260910), qnfo-lifecycle (1.6.1 vs
--    .../fabric-20260910), qnfo-email (1.8.0 vs .../fabric-20260910), qnfo-archive
--    (1.2.0 vs .../fabric-20260910), qnfo-memory-mcp (2.0.3 vs 2024-11-05),
--    qnfo-gateway (3.6.1-subscribers vs 3.5.3-quarantine-filter). LIMIT: only 6 of
--    the 10 cohort members are testable; /health reaches 12 of 55 workers.

-- S8.4 NEW: deployed-current mirrors are stale, and one canonical source is absent.
--    QNFO/qnfo-workers/qnfo-email/ contains exactly two entries: README.md and
--    deployed-current.worker.js (16,404 B, esbuild bundle reporting version "1.8"
--    against a live 1.8.0). There is NO worker.js. That contradicts the README's
--    own "Canonical source: this directory" and makes its documented regeneration
--    command impossible (cp dist/worker.js ... needs a file that is not there).
--    The live worker cannot be rebuilt, reviewed or diffed from the repo. A
--    comparator that treats deployed-current.worker.js as canonical is comparing a
--    stale bundle against a stale bundle - reconciliation is impossible by
--    construction. CHECK OTHER WORKER DIRECTORIES FOR THE SAME ABSENCE.

-- S8.5 NOT ACTIONED, flagged: the r2 binding `backups` (qnfo-backups) exposes a
--    credentials/ prefix through r2_get with NO confirm gate, including
--    credentials/fleet-deploy-admin-token.txt. This endpoint is an LLM tool
--    surface and should not hold deploy authority one read away. No credential
--    value was opened or recorded. Full write-up:
--    QNFO/qnfo-ops docs/SECURITY-FINDING-2026-09-13-backups-binding-credential-exposure.md
--    Fix belongs in deploy config (binding scope) plus a confirm gate on r2_get;
--    neither is reachable from this endpoint.

-- =====================================================================
-- S9  EXECUTED vs DELIBERATELY NOT (2026-09-13 ops session)
--   EXECUTED: ops_issue_run confirm=true (processed=3, closed=0, escalated=0, all
--     "no probe target"); telemetry_analyze(24h) (scanned 11, filed 0,
--     alreadyOpen 3); S0/S1/S2 above via ops_d1_write (4 writes, all read back);
--     github_file_write x3 (this file Rev 2/3/4, plus the security finding);
--     workspace_write x8 (audit + AMENDMENT 17-21).
--   NOT EXECUTED: S3 (needs the worker-side fix - the reaper is deliberately
--     disabled); the E1 canonical refresh (no R2 binding to qnfo-canonical - probed:
--     prefix 'qnfo-canonical' returns 0 objects in the bound audit bucket); the
--     deploy of version-compare.mjs (a deploy); the backups-binding re-scope and
--     token rotation (deploy config); E3 and the agent_issues 693/697/698 items
--     (not verified by this endpoint).
-- =====================================================================
