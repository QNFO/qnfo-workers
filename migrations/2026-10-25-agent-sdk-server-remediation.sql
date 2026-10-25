-- AGENT-WS-REACTIVATION-1 (2026-10-25, charter pillar: autonomy): PR #3943 merged the security hardening for
-- qnfo-agent-ws, but the worker remains retired and outside deploy targets. The existing roadmap item RM-121 requires
-- a real consumer before redeployment; the fleet census was above its 30-worker cap. The owner-task route is holder-
-- gated, so file the remaining work into the existing server-side issue/code loop through the CI migration path.
-- Keep the worker retired until a live consumer, dependency check, and within-cap same-class retirement are evidenced.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: SELECT 'No-op: preserve the server-side handoff and its issue lifecycle; any cancellation needs a separately recorded disposition.';

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'AGENT-WS-REACTIVATION-1: resolve the consumer and fleet-cap prerequisites before reactivating qnfo-agent-ws',
  'Charter pillar: autonomy. User-directed outcome: implement and deploy the existing Cloudflare Agents SDK service; do not use the retired qnfo-workers root stub.' || char(10) ||
  'PR #3943 (commit 874ef104b521d9b21ca9fa9f640cb4873770140c) merged the reviewed security hardening. This task is the remaining server-side adoption and deployment work; it does not authorize bypassing fleet limits.' || char(10) ||
  'Doer: qnfo-code-orchestrator, with the canonical deployment runner. First verify the live fleet census and run the fleet-graph impact check for worker:qnfo-agent-ws. Establish a real live consumer and dependency-safe same-class retirement; if the census remains above 30 or no consumer/retirement is evidenced, leave the worker retired and report the measured blocker on this issue.' || char(10) ||
  'Only after those prerequisites pass, adopt the merged worker hardening, remove the RETIRED marker, add the worker to deploy-targets, update the self-documentation and any required registry entries, preserve source/mirror parity, run the focused suite, and deploy through the canonical path. Verify the authenticated Agents SDK surface and live health after deployment.' || char(10) ||
  'Definition of done: the dependency/consumer and worker-cap conditions are evidenced, the canonical deployment is recorded, and the live health endpoint reports the Agents SDK capabilities. Do not close on code merge alone.' || char(10) ||
  'runtime-probe: {"url": "https://qnfo-agent-ws.q08.workers.dev/health", "status": 200, "contains": "qnfo-agent-ws", "min_version": "2.1.0"}' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-agent-ws/worker.js' || char(10) ||
  'code-anchor: const normalizedPath = "/" + path.split("/").filter(Boolean).join("/");',
  'session', 'autonomy', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM agent_issues
  WHERE title = 'AGENT-WS-REACTIVATION-1: resolve the consumer and fleet-cap prerequisites before reactivating qnfo-agent-ws'
    AND status = 'open'
);

INSERT OR IGNORE INTO control_registry
  (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES
  ('agent-ws-reactivation-prerequisites',
   'qnfo-agent-ws/RETIRED and deploy-targets.txt',
   'hold',
   'reactivating qnfo-agent-ws without an evidenced live consumer, dependency-safe same-class retirement, and a worker count within the cap',
   0,
   'keep',
   'applied',
   'The open AGENT-WS-REACTIVATION-1 issue and its CI-applied remediation contract route the work through qnfo-code-orchestrator and canonical deployment; the read-only control probe checks that handoff remains present.',
   NULL,
   'Fresh D1 read: worker_count=35 at 2026-10-25T07:02:15.614Z and no qnfo-agent-ws service_registry row. The correct worker host returned 404/code 1042; the root qnfo-workers host is a separate retired stub returning 410. The issue remains open until consumer, dependency, and cap evidence pass.',
   (SELECT id FROM agent_issues
    WHERE title = 'AGENT-WS-REACTIVATION-1: resolve the consumer and fleet-cap prerequisites before reactivating qnfo-agent-ws'
      AND status = 'open'
    ORDER BY id DESC LIMIT 1));

INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled)
VALUES
  ('agent-ws-reactivation-prerequisites',
   'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM agent_issues a JOIN control_registry c ON c.control = ''agent-ws-reactivation-prerequisites'' AND c.disposition = ''keep'' AND c.disposition_state = ''applied'' WHERE a.title = ''AGENT-WS-REACTIVATION-1: resolve the consumer and fleet-cap prerequisites before reactivating qnfo-agent-ws'' AND a.status = ''open'' AND instr(a.description, ''code-task: repo=qnfo-workers path=qnfo-agent-ws/worker.js'') > 0 AND instr(a.description, ''runtime-probe: {"url": "https://qnfo-agent-ws.q08.workers.dev/health", "status": 200, "contains": "qnfo-agent-ws", "min_version": "2.1.0"}'') > 0) THEN ''ok'' ELSE ''the open server-side handoff, versioned health probe, or keep disposition is missing'' END AS observed',
   'Read-only D1 probe verifies the server-side remediation issue and its versioned health contract remain open. It does not make the unavailable worker appear healthy or bypass the consumer, dependency, or worker-cap prerequisites.',
   1);

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, text_sig)
SELECT
  'control:agent-ws-reactivation-prerequisites',
  'Direct reactivation is needed to make the merged Agents SDK code live, but must respect PR #3943 deployment boundaries and the fleet cap.',
  'Tested the configured qnfo-agent-ws /health host; distinguished the qnfo-workers root; checked live service_registry, worker_count, and control_registry; attempted the previously inspected public dashboard task and issue routes; built a CI migration handoff with a read-only D1 alternate-path probe.',
  'workaround-built',
  'surfaces: https://qnfo-agent-ws.q08.workers.dev/health => 404, error code 1042; https://qnfo-workers.q08.workers.dev/health => 410 retired stub; live D1 worker_count=35 (cap=30), service_registry has no qnfo-agent-ws row, and control_registry had no agent-specific entry; dashboard task route requires a holder and public /issues returned unauthorized. The CI migration is the server-side route; no direct Worker deploy was attempted.',
  'session_d8db78a0-537a-4635-b7e4-a8450a38b0b7',
  'agent-ws-reactivation-2026-10-25'
WHERE NOT EXISTS (
  SELECT 1 FROM blocker_redteam
  WHERE target = 'control:agent-ws-reactivation-prerequisites'
    AND text_sig = 'agent-ws-reactivation-2026-10-25'
);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session_d8db78a0-537a-4635-b7e4-a8450a38b0b7',
  'The dashboard task route and public issue route do not accept unauthenticated task writes; qnfo-agent-ws remains outside service_registry and the latest worker_count is 35 against the 30-worker cap.',
  'Keep qnfo-agent-ws retired and hand its consumer, dependency, cap, and canonical deployment prerequisites to agent_issues with a versioned live-health closing probe; register the hold, alternate-path probe, and red-team evidence.',
  'PR #3943 is merged and its migration workflow succeeded. Fresh D1 reads show worker_count=35 at 2026-10-25T07:02:15.614Z and no qnfo-agent-ws service_registry row. The configured qnfo-agent-ws health host returned 404/code 1042; the separate qnfo-workers root returned 410. The source health handler reports worker name and version, and the closing probe requires qnfo-agent-ws version >= 2.1.0. The owner-task route requires a holder; public /issues returned unauthorized.',
  'The CI migration creates one deduplicated open agent_issues task and records a keep hold plus an alternate-path probe; it does not reactivate or deploy qnfo-agent-ws.',
  'One D1 task and its control/red-team records; no runtime exposure, binding, worker, or deployment target changes.',
  'No-op rollback preserves the active task, control disposition, red-team evidence, and issue lifecycle; cancellation requires a separately recorded disposition. The append-only decision record remains.',
  'No new runtime capability; routes the requested remaining work to the existing server-side issue and code loops.',
  'The code loop processes the task and keeps qnfo-agent-ws retired until its consumer, dependency, and worker-cap prerequisites are evidenced.',
  'Enables evidence-based completion of Agents SDK adoption without bypassing the fleet cap or mistaking the retired root response for a deployment.',
  'qnfo-agent-ws /health; retired qnfo-workers root /health; qnfo-audit worker_count, service_registry, control_registry; dashboard task and public issue routes; CI migration, issue probe, and D1 control alternate probe'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action = 'Keep qnfo-agent-ws retired and hand its consumer, dependency, cap, and canonical deployment prerequisites to agent_issues with a versioned live-health closing probe; register the hold, alternate-path probe, and red-team evidence.'
);
