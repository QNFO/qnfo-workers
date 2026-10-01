-- CODE-TASK-LOOP-1 (2026-10-01). qnfo-code-orchestrator v0.2.0 durable code-task loop.
--
-- NOT YET APPLIED to qnfo-audit: the worker is not deployed. The worker also runs this exact DDL lazily
-- (CREATE TABLE IF NOT EXISTS, once per D1 binding per isolate), so applying it by hand is optional and idempotent.
--
-- All task state lives here, never in the isolate: any cron tick, restart or fresh isolate resumes a task from its row.
--   status      queued | pr_open | needs_human | failed   (a task is only ever 'queued' while work remains)
--   step        read -> propose -> verify -> commit -> done
--   attempts    failed verify/propose/commit attempts; indexes the model ladder (cheapest first) and caps at 3
--   lease_until crash recovery: a claim holds a 90s lease; an expired lease makes the row claimable again
--   ctx         JSON {base, sha, proposal, lastError} (file content is capped at 60k chars by the worker)
CREATE TABLE IF NOT EXISTS code_tasks (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  path TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  step TEXT NOT NULL DEFAULT 'read',
  attempts INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  ctx TEXT,
  branch TEXT,
  pr_url TEXT,
  last_error TEXT,
  lease_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
