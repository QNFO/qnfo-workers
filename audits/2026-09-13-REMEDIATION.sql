-- 2026-09-13-REMEDIATION.sql   (rev 2 — supersedes rev 1, commit e5a4907)
-- Author: qnfo-ops (ops/audit endpoint). Target DB: qnfo-audit.
--
-- This endpoint is READ-ONLY on D1 and cannot deploy, so it could not execute the writes below.
-- Every statement is scoped and idempotent; none is a bulk delete.
--
-- ── rev 2 changes (both are corrections to rev 1) ──
--   * FIX 1 rewritten: the phantom rows are RE-TOUCHED EVERY SWEEP (updated_at 13:31:08-13:31:12Z
--     on 2026-09-13), so a one-shot DELETE is NOT durable — they reappear at the next sweep.
--     rev 1 said "delete them"; that was wrong as a standalone action. Writer must be fixed first.
--   * FIX 4 rewritten: the calibration worker's OWN probe results falsify the tickets' premise.
--   * Aligns with qnfo-ai/SPEC-2026-09-13-health-key-split-brain.md (sha 530957922100fa309935bbbb3336da224987197a),
--     which independently derived the same key defect from source and is more precise than rev 1.
--
-- Live baseline (2026-09-13T13:5xZ, read directly):
--   fleet 55 deployed / 12 health-probed (43 unprobed)   backlog 12 open (7 gw-fail, 10 high)
--   ai_model_health 25 rows / 4 never-probed / 5 degraded / 20 ok
--   ai_gateway_failures 2619 rows / 398 sweeps / SUM(count) 59619
--   fleet_drift_report cron: scanned=55 clean=33 drifted=8 ahead=10 healed=0 staleCanon=4
--                            healthVer=10 errKinds={"version-format":17,"stale-canon":4,"health-ver":10}
--   backlog drain 2026-09-13: processed=12 closed=0 escalated=0 rechecked=12


-- ══ FIX 0 — FIRST: reconcile the qnfo-ai-calibration source drift. Nothing below is durable without it.
--
-- qnfo-ai-calibration: deployed=1.1.5, registry=1.1.4, repo=1.1.4 in TWO divergent files
--   worker.js                    35,742 B  issue_ledger-based   (writer stopped 2026-09-11T09:04Z)
--   deployed-current.worker.js   33,551 B  agent_issues-based
-- Neither repo file is the running 1.1.5. The running build demonstrably differs from both:
-- the explicitly-mapped @cf/baai/bge-base-en-v1.5 phantom row is re-touched every sweep
-- (updated_at 2026-09-13T13:31:12.569Z) even though the repo source maps that id explicitly and
-- should therefore UPDATE the bare row. Do NOT patch either file and deploy it — that would
-- regress the agent_issues behaviour (this already happened once; see
-- apply-gw-closer-fix.mjs REVISION 2). Recover the 1.1.5 source, commit ONE canonical file, bump.


-- ══ FIX 1 — merge + remove 4 PHANTOM ai_model_health rows  (writer fix in FIX 0 is a prerequisite)
--
-- Evidence: exactly 4 of 25 rows have last_probe_ts IS NULL; all are status='degraded',
-- consecutive_failures=0, gateway_failures=0, last_latency_ms=NULL:
--     @cf/baai/bge-base-en-v1.5  updated_at 13:31:12.569Z
--     @cf/google/gemma-4-26b-a4b-it  updated_at 13:31:11.124Z
--     @cf/qwen/qwen2.5-coder-32b-instruct  updated_at 13:31:08.034Z
--     @cf/zai-org/glm-5.2  updated_at 13:31:09.552Z
-- Confirmed mechanism (qnfo-ai/SPEC-2026-09-13-health-key-split-brain.md, source-verified):
-- gatewayFailureSweep() computes targetId = internalId(model); for an id absent from
-- CF_TO_INTERNAL it returns the raw CF id, the SELECT finds no row, and the INSERT OR IGNORE
-- branch inserts only (model_id, status, updated_at) — leaving last_probe_ts NULL. The NULL is
-- the fingerprint of that branch. The probe path simultaneously writes the BARE id as 'ok'.
-- The two writers never touch the same row, so the degraded flag lands where nothing reads it.
-- Nothing in the worker DELETEs from ai_model_health, so phantoms are permanent — and live.
--
-- ⚠ NOT DURABLE ALONE: all 4 were updated ~23 min before this audit, i.e. re-touched every sweep.
--   Running only this DELETE clears the MODEL-DEGRADED ticket for ~30 minutes, then it returns.
--   FIX 0 (or at minimum the internalId() total-map fix) must land first.
--
-- Merge semantics (per SPEC): the phantom's gateway_failures/status/last_probe_ts are folded into
-- the bare twin, then the phantom is dropped. For THESE 4 rows the fold is a numeric no-op —
-- each phantom carries gateway_failures=0 and last_probe_ts=NULL, verified — which is why a plain
-- DELETE is equivalent *today*. That equivalence is coincidental; keep the merge form so a future
-- phantom carrying real counts is not silently discarded.

-- 1a. fold phantom data into the bare twin (no-op for the current 4; safe in general)
UPDATE ai_model_health AS bare
   SET gateway_failures = COALESCE(bare.gateway_failures,0) + COALESCE(ph.gateway_failures,0),
       last_probe_ts    = MAX(COALESCE(bare.last_probe_ts,0), COALESCE(ph.last_probe_ts,0)),
       status           = CASE WHEN bare.status='degraded' OR ph.status='degraded' THEN 'degraded' ELSE bare.status END,
       updated_at       = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM ai_model_health AS ph
 WHERE ph.model_id LIKE '@cf/%'
   AND ph.last_probe_ts IS NULL
   AND ph.consecutive_failures = 0
   AND bare.model_id = (
         SELECT b2.model_id FROM ai_model_health b2
          WHERE b2.model_id NOT LIKE '@cf/%' AND b2.last_probe_ts IS NOT NULL
            AND b2.model_id = REPLACE(REPLACE(REPLACE(REPLACE(ph.model_id,
                 '@cf/baai/bge-base-en-v1.5','bge-base-en-v1.5'),
                 '@cf/google/gemma-4-26b-a4b-it','gemma-4-26b'),
                 '@cf/qwen/qwen2.5-coder-32b-instruct','qwen2.5-coder-32b'),
                 '@cf/zai-org/glm-5.2','glm-5.2')
          LIMIT 1);

-- 1b. drop the phantoms (guard: never-probed AND zero-data AND qualified id)
DELETE FROM ai_model_health
 WHERE last_probe_ts IS NULL
   AND consecutive_failures = 0
   AND gateway_failures = 0
   AND model_id LIKE '@cf/%';
-- expect 4 rows affected.

-- VERIFY 1a (expect 0):
--   SELECT COUNT(*) FROM ai_model_health WHERE last_probe_ts IS NULL;
-- VERIFY 1b (expect 1 — the genuinely probed @cf/qwen/qwen3.8-27b, gateway_failures 1371):
--   SELECT model_id FROM ai_model_health WHERE status='degraded';
-- VERIFY 1c (expect 24):
--   SELECT COUNT(*) FROM ai_model_health;
-- VERIFY 1d — durability check, run ~40 min later (expect still 0):
--   SELECT COUNT(*) FROM ai_model_health WHERE last_probe_ts IS NULL;


-- ══ FIX 2 — retire 6 ORPHANED gwfail:* rows in issue_ledger
--
-- Evidence: all 6 have first_seen == last_seen == 2026-09-11T09:04:00.430Z, occurrences=1,
-- status='open' — untouched for ~2.5 days:
--   gwfail:131f17f2 429 bge-base-en-v1.5 | gwfail:bfceab13 400 qwen2.5-coder-32b-instruct
--   gwfail:59524ac8 400 qwen3.8-27b     | gwfail:bb49193f 429 kimi-k2.6
--   gwfail:afa560ad 429 glm-5.2         | gwfail:6d5fc913 400 gemma-4-26b-a4b-it
-- The LIVE gw-fail tickets are in agent_issues (ids 678-684, source='qnfo-ai-calibration').
-- The issue_ledger writer stopped on 2026-09-11 when the agent_issues variant took over, so these
-- 6 rows have no writer and no closer — abandoned duplicates.
-- (issue_ledger itself is still live: qnfo-events writes coe:*/alert:* rows into it hourly.)

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


-- ══ FIX 3 — the 7 open [gw-fail] agent_issues are FALSE POSITIVES; do not "fix" the models
--
-- The tickets name the models. The calibration worker's own probe results (ai_calibration_results,
-- latest sweep ts 1789306257835) refute that:
--   target ai-gateway-default  status=PASS  n=335  -> the sweep that produces these tickets
--                                                     reports itself healthy; the 400/429s are an
--                                                     INVENTORY it lists, not a probe failure.
--   glm-5.2      pass 247 / fail 8     gemma-4-26b   pass 582 / fail 3
--   glm-5.3      pass 335              kimi-k2.6     pass (fail only "slow minimal probe")
--   deepseek-v4-flash pass 966         glm-5.3-flash pass 670 / fail 11
-- Every probed model passes hundreds of times per window. The models are not degraded.
-- The gw-fail feed is a raw AI-Gateway log inventory that cannot distinguish "our probe failed"
-- from "some caller posted a malformed request to this model name". FIX 4 identifies that caller.
--
-- Consequence: do NOT delete the 7 tickets (the underlying malformed traffic is real and should be
-- fixed at its source), and do NOT "recover" the models. Fix the callers, then let the tickets close.
--
-- The closer's predicate is nonetheless genuinely unreachable while the traffic persists:
--     COUNT(*) FROM ai_gateway_failures WHERE model=? AND ts > t0 - 24h  ==  0
-- Each affected model appears in 46-47 of the last 48 sweeps, so this is never 0 — which is why the
-- 2026-09-13 drain reported processed=12 closed=0. CAUTION on the staged patch
-- qnfo-ai-calibration/apply-gw-closer-fix.mjs: it rebinds the predicate to lastTs (latest sweep
-- window). That is a WEAKER recovery criterion — it would close a ticket for a model failing 47/48
-- sweeps the first time it misses one sweep, turning a stuck ratchet into a flapping ticket.
-- Require N consecutive clean sweeps (e.g. 3) instead.
--
-- VERIFY 3 (expect 7 rows, each 46-47):
--   SELECT model, COUNT(DISTINCT ts) AS sweeps_of_last_48
--     FROM ai_gateway_failures
--    WHERE ts > (SELECT MAX(ts) FROM ai_gateway_failures) - 48*1800000
--    GROUP BY model ORDER BY sweeps_of_last_48 DESC;


-- ══ FIX 4 — ROOT CAUSE: caller-side payload defects (needs a code fix in the CALLERS; no SQL)
--
-- ai_gateway_failures.sample_detail shows every 400 is a CLIENT payload bug, upstream of the model:
--   @cf/qwen/qwen2.5-coder-32b-instruct  400 x42 EVERY sweep (398/398 sweeps, distinct_counts=1)
--     "oneOf at '/' not met, 0 matches: required properties at '/' are 'prompt',
--      Type mismatch of '/messages/0/content'"
--     -> a caller POSTs a CHAT (messages[]) payload to a TEXT-COMPLETION (prompt) endpoint.
--   @cf/qwen/qwen3.8-27b   400 "System message must be at the beginning"   -> system msg not first.
--   @cf/google/gemma-4-26b-a4b-it 400 "image dimensions must be at least 10px (got 1x1)"
--     -> 1x1 placeholder image. NOT the calibration probe: its own constant RED10X10_B64 is a
--        10x10 PNG (IHDR 0x0A x 0x0A), so the caller is a different worker — not yet identified.
--   @cf/zai-org/glm-5.2    400 "Assistant tool call function.arguments must be valid JSON"
--     -> malformed tool-call JSON.
--   @cf/baai/bge-base-en-v1.5 429 x79-104 EVERY sweep (397 sweeps)
--     -> self-inflicted concurrent-embedding storm on the embeddings endpoint.
--
-- The constant counts (42, 79) are the tell: identical values re-recorded every 30-min sweep for
-- 8 days is a fixed batch of malformed requests, not intermittent capacity.
--
-- METRIC DEFECT (affects triage severity): SUM(count) is a COUNT-OF-COUNTS, not a rate. The same
-- constant is re-recorded each sweep, so SUM(count) overstates by ~46x (59,619 all-time; "3,635/24h"
-- for bge is 79 x 46). Any consumer treating SUM(count) as a live rate is wrong — including the
-- backlog-exec escalation "gateway failures CURRENT: 3635/24h - real defect". Correct rate =
-- count per sweep window.
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
-- (a) 8 workers run build-tag versions the comparator cannot order (deployed "<name>/fabric-20260910"),
--     producing the 17 version-format errors: qnfo-agent-orchestrator, qnfo-archive,
--     qnfo-ddocs-indexer, qnfo-email, qnfo-lifecycle, qnfo-paper-indexer, qnfo-qwav,
--     plus personal-companion (deployed=v1.1.0, canonical=1.0.0).
-- (b) personal-companion redeploys hourly, ok=0, code 10021 "Workflow GenerationFlow must be
--     exported or a script_name must be specified" (7 consecutive attempts 07:01 -> 13:01).
--     Two stacked defects: "v1.1.0" -> parseInt("v1")=NaN -> [0,1,0] < [1,0,0] so the live worker
--     is mislabelled "canonical-ahead"; and the deploy itself fails 10021 so the intent never clears.
--     qnfo-fleet-control/version-compare.mjs already implements the correct fail-closed rule
--     (strip ONE leading 'v'; equal cores with differing suffixes => UNORDERABLE => do not act, so
--     it also refuses to downgrade 3.6.1-subscribers and 1.14.1-gtd-guard). It is NOT wired into the
--     running qnfo-fleet-control (deployed 0.3.4 / registry 0.4.11 / canonical 0.3.3 — three-way
--     disagreement; drift.canonical 0.3.3 is a sub-module's VERSION constant).
-- (c) qnfo-cloud-ops retries a syntax-broken build: 1.14.1 -> 1.14.1-gtd-guard, ok=0,
--     "Uncaught SyntaxError: Invalid or unexpected token at worker.js:1:2".
-- (d) CATALOG DRIFT: ai_calibration_results carries "catalog-entry: advertised=present
--     catalog=missing" for @cf/zai-org/glm-5.3, @cf/openai/gpt-oss-120b, @cf/moonshotai/kimi-k2.6,
--     @cf/google/gemma-4-26b-a4b-it, @cf/zai-org/glm-4.7-flash, @cf/deepseek-ai/deepseek-v4-pro-0813
--     — advertised in /v1/models but absent from the live Workers AI catalog. Probes still pass,
--     so this is advertisement drift, not an outage.
-- (e) ROSTER MISMATCH: live /v1/models advertises 11 concrete models (kimi-k2.6, glm-5.3-flash,
--     gpt-oss-120b, deepseek-v4-flash-wa, deepseek-v4-pro-wa, kimi-k2.7-code, glm-5.3,
--     deepseek-v4-flash, deepseek-v4-flash-thinking, deepseek-v4-pro) + auto + ensemble.
--     qwen2.5-coder-32b, glm-5.2, gemma-4-26b, bge-base-en-v1.5 and qwen3.8-27b are NOT advertised,
--     yet ai_model_health still carries rows for all five — the calibration roster is stale
--     relative to the router's advertisement.
-- (f) HEALTH COVERAGE: only 12 of 55 workers are health-probed (fleet_status healthyCount=12);
--     the other 43 return probe:"api" with healthy:null. fleet_heartbeat holds ONE row
--     (qnfo-lifecycle, version "fabric-20260910"). The heartbeat table cannot be used as a
--     staleness signal, and 78% of the fleet has no health signal at all.
--
-- RECOMMENDED ORDER (each step is a prerequisite for the next):
--   1. Recover + commit the qnfo-ai-calibration 1.1.5 source as ONE canonical file (FIX 0).
--   2. Fix internalId() — replace the substring fallback with a total map, or normalise to the
--      roster key at write time; make the self-clear path target the same key the probe writes.
--   3. Run FIX 1 (merge + drop phantoms) and FIX 2 (6 orphaned ledger rows).
--   4. Wire version-compare.mjs into the deploy scan; set auto_heal='0' in fleet_deploy_state until
--      it is wired (auto_heal has been '1' since 2026-09-08 16:25:49).
--   5. Fix the 10021 workflow export on personal-companion; the hourly loop then stops.
--   6. Replace the SUM(count) metric with count-per-sweep in every consumer.
--   7. Fix the 4 caller-side payload defects (FIX 4). This is the only step that clears the 7 open
--      [gw-fail] tickets, and it is the highest-value item in this file.
