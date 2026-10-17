-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE evolve_filings; DROP TABLE evolve_runs; DROP TABLE evolve_targets; DELETE FROM spof_registry WHERE component = 'qnfo-evolve cron'; (the worker also becomes unreferenced if qnfo-evolve is deleted from deploy-targets.txt)
--
-- EVOLVE-1 (2026-10-17): the organ that turns the fleet's own structural gap registers into named
-- work, and closes it when the gap is gone.
--
-- WHY
--   The registers already knew what was wrong. v_process_path_gaps listed three steps whose only
--   path read "none automatic" (research-head-stalled, code-task-stalled, issue-unremediated) and
--   v_dod_spof_gaps listed NO-ALTERNATE-PATH for qnfo-research-exec and ALTERNATE-NEVER-TESTED for
--   GitHub Actions and the GitHub token. Both violate the owner doctrine SLA-AND-PATHS-1
--   (2026-10-17) and neither had ever been filed as work, because nothing read the registers.
--   Measured the same day: 169 issues open, 25 with a code-task line, and 67 of 128 plans refused
--   with "the issue names no worker the code loop may change". The starvation was not a lack of
--   defects; it was that no component turned a register row into an issue naming its owner.
--
-- SHAPE
--   evolve_targets  which worker owns a register row (process -> owner, component -> owner). The
--                   process rows are seeded from process_contracts so a new contract is targeted
--                   automatically; the component rows are explicit because a component name is
--                   free text and guessing an owner from it is how a wrong worker gets edited.
--   evolve_filings  one row per filed gap: the issue id, the probe that defines done, and the state.
--                   Keyed by a deterministic hash of (kind, process, step) so a gap cannot be
--                   re-filed every quarter hour.
--   evolve_runs     one row per tick: what was scanned, filed and closed. A silent organ is a broken
--                   organ, so the absence of rows is itself a detectable condition.
--
-- RE-APPLYING THIS FILE CHANGES NOTHING (CREATE TABLE IF NOT EXISTS + INSERT OR IGNORE).

CREATE TABLE IF NOT EXISTS evolve_targets (
  kind TEXT NOT NULL,              -- 'process' | 'component'
  key TEXT NOT NULL,               -- the register's process name or component name
  worker TEXT NOT NULL,            -- live worker that owns the fix
  file TEXT NOT NULL,              -- the file the code loop may change
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, key)
);

CREATE TABLE IF NOT EXISTS evolve_filings (
  key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  process TEXT,
  step TEXT,
  worker TEXT,
  file TEXT,
  issue_id INTEGER,
  probe_sql TEXT NOT NULL,         -- definition of done: 0 rows means closed
  state TEXT NOT NULL DEFAULT 'open',
  filed_at TEXT,
  closed_at TEXT,
  evidence TEXT
);

CREATE INDEX IF NOT EXISTS idx_evolve_filings_state ON evolve_filings(state);
CREATE INDEX IF NOT EXISTS idx_evolve_filings_issue ON evolve_filings(issue_id);

CREATE TABLE IF NOT EXISTS evolve_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  scanned INTEGER NOT NULL DEFAULT 0,
  filed INTEGER NOT NULL DEFAULT 0,
  closed INTEGER NOT NULL DEFAULT 0,
  skipped TEXT,
  detail TEXT
);

-- Every process contract names its owner. Seeding from the contracts means a new contract becomes
-- a targeted gap with no code change here.
INSERT OR IGNORE INTO evolve_targets (kind, key, worker, file, note)
SELECT 'process', process, owner, owner || '/worker.js', 'seeded from process_contracts'
FROM process_contracts
WHERE owner IS NOT NULL AND length(trim(owner)) > 0 AND owner <> 'session';

-- The three queue registers whose second path is literally "none automatic". They are listed here
-- rather than derived because their ownership is a decision, not a parse.
INSERT OR IGNORE INTO evolve_targets (kind, key, worker, file, note) VALUES
  ('process', 'queue:research-head-stalled', 'qnfo-research-exec', 'qnfo-research-exec/worker.js',
   'EVOLVE-1 seed: the queue gap whose second path is "none automatic"; research-exec owns the queue'),
  ('process', 'queue:code-task-stalled', 'qnfo-code-orchestrator', 'qnfo-code-orchestrator/worker.js',
   'EVOLVE-1 seed: the code loop owns its own retries, so the second path belongs in the loop'),
  ('process', 'queue:issue-unremediated', 'qnfo-fleet-control', 'qnfo-fleet-control/worker.js',
   'EVOLVE-1 seed: fleet-control owns issue disposition and the metric trigger that names the orphans');

-- v_dod_spof_gaps components. GitHub Actions and the token sit on the Cloudflare -> GitHub write
-- path: the canonical deploy/dispatch is cloud-ops, the merge and PR writes are fleet-control.
INSERT OR IGNORE INTO evolve_targets (kind, key, worker, file, note) VALUES
  ('component', 'qnfo-research-exec single executor', 'qnfo-research-exec', 'qnfo-research-exec/worker.js',
   'EVOLVE-1 seed: NO-ALTERNATE-PATH on the research critical path'),
  ('component', 'GitHub Actions', 'qnfo-cloud-ops', 'qnfo-cloud-ops/worker.js',
   'EVOLVE-1 seed: ALTERNATE-NEVER-TESTED for CI, canonical deploy, the migration runner'),
  ('component', 'GitHub token (worker secrets)', 'qnfo-fleet-control', 'qnfo-fleet-control/worker.js',
   'EVOLVE-1 seed: ALTERNATE-NEVER-TESTED for every Cloudflare -> GitHub write');

-- SPOF-REVIEW-GATE-1 asks the author of a new cron dependency to name its second path. EVOLVE-1's
-- second path is POST /tick: the tick files nothing twice because every filing key is a deterministic
-- hash of the gap, so a missed cron fire costs a delay, never a lost gap. Recorded here so the claim
-- is reviewable and carries a date, rather than living only in a pull request comment.
INSERT OR IGNORE INTO spof_registry (component, critical_path, alternate_path, evidence) VALUES
  ('qnfo-evolve cron',
   'EVOLVE-1 gap intake: register row -> named issue -> verified closure',
   'POST /tick with x-loop-token runs the identical path on demand; filing keys are deterministic '
     || 'hash(kind, process, step), so a missed fire costs a delay and cannot duplicate or lose a gap; '
     || 'evolve_runs records every tick, so an absent run is itself observable',
   'EVOLVE-1 (2026-10-17): pickNew dedupes against evolve_filings.state=open by key; the same gap '
     || 're-derived on the next tick produces the same key and is skipped. Second path is exercised '
     || 'by the offline suite (pickNew + gapKey stability) and by GET /report after each tick.');
