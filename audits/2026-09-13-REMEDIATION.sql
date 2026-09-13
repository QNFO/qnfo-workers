-- 2026-09-13-REMEDIATION.sql
-- Author: qnfo-ops (ops/audit endpoint). Target DB: qnfo-audit.
--
-- This endpoint is READ-ONLY on D1 and cannot deploy, so it could not execute the writes below.
-- These are the exact statements the live audit identified, with the evidence and the
-- verification query for each. Every statement is scoped and idempotent; none is a bulk delete.
--
-- Live baseline (2026-09-13T13:54Z, read directly):
--   fleet 55 deployed / 12 health-probed (43 unprobed)   backlog 12 open
--   ai_model_health 25 rows / 4 never-probed / 5 degraded / 20 ok
--   ai_gateway_failures 2619 rows / 398 sweeps / SUM(count) 59619
--   fleet_drift_report cron: scanned=55 clean=33 drifted=8 ahead=10 healed=0 staleCanon=4
--                            healthVer=10 errKinds={"version-format":17,"stale-canon":4,"health-ver":10}


-- ══ FIX 1 — delete 4 PHANTOM ai_model_health rows (stops the flapping MODEL-DEGRADED tickets)
--
-- Evidence: exactly 4 of 25 rows have last_probe_ts IS NULL, and all 4 are
-- status='degraded', consecutive_failures=0, gateway_failures=0, last_latency_ms=NULL:
--     @cf/baai/bge-base-en-v1.5, @cf/google/gemma-4-26b-a4b-it,
--     @cf/qwen/qwen2.5-coder-32b-instruct, @cf/zai-org/glm-5.2
-- A row that is 'degraded' with 0 consecutive failures and no probe timestamp is
-- self-contradictory: degradation is supposed to be earned by probe failures.
-- Each of these 4 has a REAL, probed twin under the short internal id:
--     qwen2.5-coder-32b ok/10836   glm-5.2 ok/362   gemma-4-26b ok/258   bge-base-en-v1.5 ok/0
-- (the probe path keys by internal id; the GW-DEGRADE path once keyed by full CF id).
-- qnfo-fleet-advisor reads ai_model_health.status and files MODEL-DEGRADED naming these rows.
-- Live proof the artifact is still firing: agent_issues 685 (MODEL-DEGRADED, closed 07:40)
-- -> 689 (identical title, open 13:40); 3 of the 4 names in 689 are these phantom rows.
--
-- NOTE (deeper defect, not fixed by this DELETE): the table is keyed inconsistently and BOTH
-- conventions are live. qwen3.8-27b's probed row is the FULL id (@cf/qwen/qwen3.8-27b, degraded,
-- gateway_failures 1371, last_probe_ts set) while qwen2.5-coder's probed row is the SHORT id.
-- Normalising the key is a code change in qnfo-ai-calibration, not SQL.

DELETE FROM ai_model_health
 WHERE last_probe_ts IS NULL
   AND consecutive_failures = 0
   AND gateway_failures = 0
   AND model_id LIKE '@cf/%';
-- expect 4 rows affected.

-- VERIFY 1a (expect 0):
--   SELECT COUNT(*) FROM ai_model_health WHERE last_probe_ts IS NULL;
-- VERIFY 1b (expect 1 — the genuinely probed @cf/qwen/qwen3.8-27b):
--   SELECT model_id FROM ai_model_health WHERE status='degraded';
-- VERIFY 1c (expect 24):
--   SELECT COUNT(*) FROM ai_model_health;


-- ══ FIX 2 — retire 6 ORPHANED gwfail:* rows in issue_ledger
--
-- Evidence: all 6 have first_seen == last_seen == 2026-09-11T09:04:00.430Z, occurrences=1,
-- status='open' — nothing has touched them in ~2.5 days:
--   gwfail:131f17f2 429 bge-base-en-v1.5 | gwfail:bfceab13 400 qwen2.5-coder-32b-instruct
--   gwfail:59524ac8 400 qwen3.8-27b     | gwfail:bb49193f 429 kimi-k2.6
--   gwfail:afa560ad 429 glm-5.2         | gwfail:6d5fc913 400 gemma-4-26b-a4b-it
-- The LIVE gw-fail tickets are in agent_issues (ids 678-684, source='qnfo-ai-calibration').
-- The repo holds two divergent implementations both stamped VERSION 1.1.4: worker.js
-- (35,742 B, issue_ledger-based) and deployed-current.worker.js (33,551 B, agent_issues-based).
-- The issue_ledger writer stopped on 2026-09-11 when the agent_issues variant took over, so
-- these 6 rows have no writer and no closer. They are abandoned duplicates.
-- (issue_ledger itself is still live — qnfo-events writes coe:*/alert:* rows into it hourly.)

UPDATE issue_ledger
   SET status = 'resolved',
       resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       resolution_note = 'superseded: qnfo-ai-calibration >=1.1.5 writes agent_issues, not issue_ledger; row frozen since 2026-09-11T09:04Z'
 WHERE fingerprint LIKE 'gwfail:%'
   AND status = 'open'
   AND first_seen = last_seen;
-- expect 6 rows affected.

-- VERIFY 2 (expect 0):
--   SELECT COUNT(*) FROM issue_ledger WHERE fingerprint LIKE 'gwfail:%' AND status='open';


-- ══ FIX 3 — DO NOT DELETE the 7 open [gw-fail] agent_issues; the ratchet is real
--
-- agent_issues 678-684 are CORRECT and must stay open: the models genuinely fail every sweep.
-- Live check: each affected model appears in 46-47 of the last 48 sweeps, so the closer predicate
--     COUNT(*) FROM ai_gateway_failures WHERE model=? AND ts > t0 - 24h  ==  0
-- is unreachable, and the tickets can never close even after recovery. That is why the
-- 2026-09-13 backlog drain reported processed=12 closed=0 escalated=0 rechecked=12.
--
-- CAUTION on the staged patch qnfo-ai-calibration/apply-gw-closer-fix.mjs: it rebinds the
-- predicate to lastTs (the latest sweep window). That is a WEAKER recovery criterion — it would
-- close a ticket for a model that fails 47/48 sweeps the first time it misses a single sweep,
-- converting a stuck ratchet into a flapping ticket. Prefer requiring N consecutive clean sweeps
-- (e.g. 3) rather than 1. Do not ship the lastTs binding as-is.
--
-- VERIFY 3 (expect 7 rows, each 46-47):
--   SELECT model, COUNT(DISTINCT ts) AS sweeps_of_last_48
--     FROM ai_gateway_failures
--    WHERE ts > (SELECT MAX(ts) FROM ai_gateway_failures) - 48*1800000
--    GROUP BY model ORDER BY sweeps_of_last_48 DESC;


-- ══ FIX 4 — ROOT CAUSE of the gateway failures: caller-side payload defects, not model faults
--             (needs a code fix in the CALLERS; no SQL will fix this)
--
-- ai_gateway_failures.sample_detail shows every 400 is a client payload bug. The ticket titles
-- blame the model id; the defect is upstream of the model:
--   @cf/qwen/qwen2.5-coder-32b-instruct  400 x42 EVERY sweep (398/398 sweeps, distinct_counts=1)
--     "oneOf at '/' not met, 0 matches: required properties at '/' are 'prompt',
--      Type mismatch of '/messages/0/content'"
--     -> a caller POSTs a CHAT (messages[]) payload to a TEXT-COMPLETION (prompt) endpoint.
--   @cf/qwen/qwen3.8-27b                 400 "System message must be at the beginning"
--     -> caller puts a system message mid-conversation.
--   @cf/google/gemma-4-26b-a4b-it        400 "image dimensions must be at least 10px (got 1x1)"
--     -> caller sends a 1x1 placeholder image (note: the calibration probe's own constant is a
--        10x10 PNG, so this is a DIFFERENT caller — not yet identified).
--   @cf/zai-org/glm-5.2                  400 "Assistant tool call function.arguments must be valid JSON"
--     -> caller emits malformed tool-call JSON.
--   @cf/baai/bge-base-en-v1.5            429 x79-104 EVERY sweep (397 sweeps)
--     -> self-inflicted concurrent-embedding storm on the embeddings endpoint.
--
-- METRIC DEFECT (affects triage severity): SUM(count) is a COUNT-OF-COUNTS, not a failure rate.
-- The same constant is re-recorded every 30-min sweep (bge: count=79 in 46 of the last 48 sweeps;
-- qwen2.5-coder: count=42 in 47 of 48), so SUM(count) overstates the live rate by ~46x
-- (59,619 all-time; "3,635/24h" for bge is 79 x 46). Any consumer treating SUM(count) as a live
-- rate is wrong — including the backlog-exec escalation note
-- "gateway failures CURRENT: 3635/24h - real defect". Correct rate = count per sweep window.
-- VERIFY 4:
--   SELECT model, COUNT(DISTINCT count) AS distinct_counts, MIN(count), MAX(count), COUNT(*) AS rows
--     FROM ai_gateway_failures GROUP BY model ORDER BY rows DESC;
--   -- bge distinct_counts=15 (79..104); qwen2.5-coder=1 (42); gemma=1 (1); glm-5.2=1 (1)


-- ══ FIX 5 — STALE / UNSOURCED WORKERS (needs deploys; no SQL)
--
-- fleet_drift_report cron 2026-09-13 13:03:53:
--   scanned=55 clean=33 drifted=8 ahead=10 healed=0 staleCanon=4 healthVer=10
--   errKinds={"version-format":17,"stale-canon":4,"health-ver":10}
-- healed=0: the auto-heal healed nothing this run.
--
-- (a) 8 workers run build-tag versions the comparator cannot order
--     (deployed = "<name>/fabric-20260910"), producing the 17 version-format errors:
--       qnfo-agent-orchestrator, qnfo-archive, qnfo-ddocs-indexer, qnfo-email,
--       qnfo-lifecycle, qnfo-paper-indexer, qnfo-qwav
--     plus personal-companion (deployed=v1.1.0, canonical=1.0.0).
-- (b) personal-companion redeploys hourly, ok=0, code 10021
--     "Workflow GenerationFlow must be exported or a script_name must be specified"
--     (7 consecutive attempts 07:01 -> 13:01). Two stacked defects: the comparator labels the
--     live worker "canonical-ahead" because "v1.1.0" -> parseInt("v1")=NaN -> [0,1,0] < [1,0,0];
--     and the deploy itself fails 10021, so the intent never clears.
--     qnfo-fleet-control/version-compare.mjs already implements the correct fail-closed rule
--     (strip ONE leading 'v'; equal cores with differing suffixes => UNORDERABLE => do not act,
--     so it also refuses to downgrade 3.6.1-subscribers and 1.14.1-gtd-guard). It is NOT wired
--     into the running qnfo-fleet-control (deployed 0.3.4 / registry 0.4.11 / canonical 0.3.3 —
--     three-way disagreement; drift.canonical 0.3.3 is a sub-module's VERSION constant).
-- (c) qnfo-cloud-ops retries a syntax-broken build: 1.14.1 -> 1.14.1-gtd-guard, ok=0,
--     "Uncaught SyntaxError: Invalid or unexpected token at worker.js:1:2".
--
-- ── SOURCE-PROVENANCE DEFECT (blocks everything else; fix this first) ──
-- qnfo-ai-calibration: deployed=1.1.5, registry=1.1.4, repo=1.1.4 in TWO divergent files
--   worker.js              35,742 B  issue_ledger-based   (STALE — writer stopped 09-11T09:04Z)
--   deployed-current.worker.js 33,551 B agent_issues-based (the pre-1.1.5 deployed variant)
-- Neither file is the running 1.1.5. Do NOT patch either and deploy: patching the stale
-- issue_ledger variant would REGRESS the agent_issues behaviour. This exact mistake already
-- happened once and was caught in apply-gw-closer-fix.mjs REVISION 2. Recover the 1.1.5 source,
-- commit it as the single canonical file, then bump.
--
-- (d) HEALTH COVERAGE: only 12 of 55 workers are health-probed (fleet_status healthyCount=12);
--     the other 43 return probe:"api" with healthy:null. fleet_heartbeat holds ONE row
--     (qnfo-lifecycle, version "fabric-20260910"). The heartbeat table therefore cannot be used
--     as a staleness signal, and 78% of the fleet has no health signal at all.
--
-- RECOMMENDED ORDER (each step is a prerequisite for the next):
--   1. Recover + commit the qnfo-ai-calibration 1.1.5 source (single canonical file).
--   2. Run FIX 1 (4 phantom rows) and FIX 2 (6 orphaned ledger rows).
--   3. Wire qnfo-fleet-control/version-compare.mjs into the deploy scan; set auto_heal='0'
--      in fleet_deploy_state until it is wired (auto_heal has been '1' since 2026-09-08 16:25:49).
--   4. Fix the 10021 workflow export on personal-companion; then the hourly loop stops.
--   5. Replace the SUM(count) metric with count-per-sweep in every consumer.
--   6. Fix the 4 caller-side payload defects (FIX 4) — this is the only step that actually
--      clears the 7 open [gw-fail] tickets, and it is the highest-value item here.
