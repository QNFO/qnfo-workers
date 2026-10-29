-- COMPOSIO-1 (2026-10-29, charter pillars reach, autonomy, cost; OWNER-NO-LOOSE-ENDS-1): files the roadmap items proposed in docs/COMPOSIO-INTEGRATION.md.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'RM-COMPOSIO-BRIDGE-1:%' OR title LIKE 'RM-DSH-CACHE-1:%' OR title LIKE 'RM-DSH-REPLAY-1:%'; UPDATE roadmap_implementation SET status = 'retired' WHERE source = 'composio-2026-10';

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-COMPOSIO-BRIDGE-1', 'composio-2026-10', 'composio_execute and composio_status tools in qnfo-ops for managed-OAuth third-party services', 'worker', 'qnfo-ops', 'planned', 'docs/COMPOSIO-INTEGRATION.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-COMPOSIO-BRIDGE-1' AND source = 'composio-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-COMPOSIO-BRIDGE-1: composio_execute and composio_status tools in qnfo-ops for managed-OAuth third-party services',
 'Charter pillar: reach. Doer: qnfo-ops via qnfo-code-orchestrator. Lever: add composio_status (key present, connected toolkits) and composio_execute (REST POST to backend.composio.dev/api/v3.1 with x-api-key, per-user_id sessions, personal user_id reachable only from personal-api) with call metering in Analytics Engine and a fallback to the direct API when the free quota is near. Gate: COMPOSIO_API_KEY must exist as a Worker secret; the account and each Google consent are IDENTITY-BOUND owner steps, tracked as a human_actions card with a probe on composio_status. Done: one live Google Calendar read through composio_execute, metered, with the personal/research separation test passing.',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-COMPOSIO-BRIDGE-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-DSH-CACHE-1', 'composio-2026-10', 'Cache-aware routing for DeepSeek calls through the router', 'worker', 'qnfo-ai', 'planned', 'docs/COMPOSIO-INTEGRATION.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-DSH-CACHE-1' AND source = 'composio-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-DSH-CACHE-1: Cache-aware routing for DeepSeek calls through the router',
 'Charter pillar: cost. Doer: qnfo-ai via qnfo-code-orchestrator. Source: composio.dev DeepSeek-harness-vs-Claude-Code benchmark (gateway-routed Claude Code paid about 99 percent of uncached rates; other harnesses 23-55 percent). Lever: keep the stable prefix (system prompt, tools) byte-identical across turns for deepseek-v4-*-wa and use the AI Gateway cache; log cached versus uncached input tokens per caller. Done: cached-token share per caller measured for 7 days before and after, with no guard metric worse. Evidence is a vendor benchmark: confirm on fleet traffic before relying on it.',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-DSH-CACHE-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-DSH-REPLAY-1', 'composio-2026-10', 'Keyless transcript replay and request-equals-log assertion for fleet agent loops', 'worker', 'qnfo-code-orchestrator', 'planned', 'docs/COMPOSIO-INTEGRATION.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-DSH-REPLAY-1' AND source = 'composio-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-DSH-REPLAY-1: Keyless transcript replay and request-equals-log assertion for fleet agent loops',
 'Charter pillar: autonomy. Doer: qnfo-code-orchestrator via qnfo-code-orchestrator. Source: DeepSeek Harness design (model-visible equals logged; recorded jsonl fixtures with a mock model). Lever: record the code loop planner transcript, add an offline suite that replays it against a mock model, and assert the outgoing request equals the logged projection. Done: one recorded task replays offline in scripts/run-suites.mjs and fails when the request drifts.',
 'session', 'reliability', 'low', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-DSH-REPLAY-1:%' AND status = 'open');
