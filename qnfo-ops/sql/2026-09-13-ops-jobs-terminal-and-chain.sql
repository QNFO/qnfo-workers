-- ============================================================================
-- 2026-09-13 — ops_jobs: terminal-status + chain + idempotency migrations
-- Target: qnfo-audit D1 (database_id 35e2e573-92f3-46ac-83c6-22f6429fc5e5)
-- Table:  ops_jobs
-- Author: qnfo-ops / ops-exec
--
-- STATUS: NOT APPLIED. Authored because these statements are fully specified
-- and therefore safe to hand to an actor that holds a D1 write verb. The
-- companion worker-side change (writing terminal status in the same statement
-- as `response`) is NOT included: its anchor text sits past the 32,768-char
-- read cap on qnfo-ops/worker.js (182,623 B) and cannot be verified from the
-- ops endpoint. See FINDING-2026-09-13-why-not-executing-readonly-and-deploy-gap.md
--
-- VERIFIED LIVE (2026-09-13T14:01Z) — ops_jobs currently has exactly 10 columns:
--   id, status, model, strategy, payload, response, tool_log, error,
--   created_at, updated_at
-- i.e. ALL FOUR columns below are missing. None of this has shipped.
--   CREATE TABLE ops_jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'queued',
--     model TEXT, strategy TEXT, payload TEXT, response TEXT, tool_log TEXT,
--     error TEXT, created_at TEXT, updated_at TEXT)
--
-- WHY — D17. 121 live rows: 96 succeeded, 12 continuing, 8 failed, 5 running.
-- 17 non-terminal (14.0%). Rows sit in `continuing` WITH a finished answer
-- already in `response`; an undocumented reaper promotes them at ~20 minutes.
-- Any client polling with a <20 min timeout reads a finished job as a failure.
-- `terminal_at` is what makes that lag measurable instead of inferred.
--
-- WHY THE INDEXES — without them, "chain depth 1/6" is prose in payload._chain
-- and is not queryable; every per-depth table in the parent docs was produced
-- by parsing JSON and is self-reported by the runner.
--
-- IDEMPOTENCY NOTE: SQLite does NOT support `ADD COLUMN IF NOT EXISTS`.
-- Each ALTER below will error with "duplicate column name: <col>" if already
-- applied. That error is benign and means the migration is complete — it is
-- not a partial failure. The CREATE INDEX statements ARE idempotent
-- (IF NOT EXISTS) and should be re-run unconditionally.
-- ============================================================================

-- --- 1. terminal status timestamp (D17) -------------------------------------
ALTER TABLE ops_jobs ADD COLUMN terminal_at TEXT;

-- --- 2. idempotency key (D18: duplicate job execution) ---------------------
ALTER TABLE ops_jobs ADD COLUMN idem_key TEXT;

-- --- 3. chain lineage (D4: "chain depth 1/6" was unqueryable prose) --------
ALTER TABLE ops_jobs ADD COLUMN parent_id TEXT;
ALTER TABLE ops_jobs ADD COLUMN chain_depth INTEGER;

-- --- 4. indexes (idempotent; safe to re-run) -------------------------------
CREATE INDEX IF NOT EXISTS idx_ops_jobs_idem
  ON ops_jobs(idem_key, status);

CREATE INDEX IF NOT EXISTS idx_ops_jobs_status_updated
  ON ops_jobs(status, updated_at);

-- ============================================================================
-- VERIFY — run after applying. Expect exactly 14 columns and 2 indexes.
-- ============================================================================
-- SELECT COUNT(*) AS cols FROM pragma_table_info('ops_jobs');           -- 14
-- SELECT name FROM pragma_index_list('ops_jobs');                       -- 2
-- SELECT id, status, ROUND((julianday('now')-julianday(updated_at))*1440,1) AS mins_stale,
--        length(COALESCE(response,'')) AS resp_len
--   FROM ops_jobs WHERE status IN ('running','continuing')
--   ORDER BY updated_at DESC LIMIT 20;
--   -- pre-fix: resp_len > 0 with status still non-terminal (the D17 signature)
--   -- post-fix: terminal_at is populated for every row written after deploy
--
-- One-time backfill for the 17 currently non-terminal rows (OPTIONAL — do NOT
-- run blindly): rows whose response is already non-empty were finished by the
-- reaper, so updated_at is the best available proxy for completion:
-- UPDATE ops_jobs
--    SET status='succeeded', terminal_at=COALESCE(terminal_at, updated_at)
--  WHERE status IN ('running','continuing')
--    AND response IS NOT NULL AND length(response) > 0;
--
-- ============================================================================
-- STILL REQUIRED (worker side — NOT in this file, NOT deployable from qnfo-ops)
-- ============================================================================
-- The schema alone fixes nothing. The worker must write the terminal status in
-- the SAME statement as the response, so the reaper and the writer cannot fight:
--
--   await env.DB.prepare(
--     `UPDATE ops_jobs
--          SET response=?, tool_log=?, status='succeeded', terminal_at=?, updated_at=?
--        WHERE id=? AND status NOT IN ('succeeded','failed')`   -- idempotent guard
--   ).bind(response, toolLogJson, now, now, id).run();
--
-- and must record a reason on the fast-failure path (D19 — 6 of 8 failed rows
-- carry error IS NULL, all with a uniform 16-23 s lifetime, too short for a
-- model timeout; the signature of a throw before the model call returns):
--
--   } catch (e) {
--     await env.DB.prepare(
--       `UPDATE ops_jobs SET status='failed', error=?, terminal_at=?, updated_at=? WHERE id=?`
--     ).bind(`${e?.name||'Error'}: ${e?.message||String(e)}\n${String(e?.stack||'').slice(0,1500)}`,
--            now, now, id).run();
--   }
--
-- Both live in qnfo-ops/worker.js (182,623 B vs a 32,768-char read cap) and
-- require `wrangler deploy` from qnfo-workers/qnfo-ops.
-- ============================================================================
