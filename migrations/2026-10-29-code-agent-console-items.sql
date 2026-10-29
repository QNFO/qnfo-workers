-- CODE-AGENT-CONSOLE-1 (2026-10-29, charter pillars autonomy, cost, reach; OWNER-NO-LOOSE-ENDS-1): files the roadmap items proposed in docs/CODE-AGENT-CONSOLE.md and docs/COMPOSIO-INTEGRATION.md section 5.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'RM-CMD-FAILURES-1:%' OR title LIKE 'RM-CODE-SESSION-1:%' OR title LIKE 'RM-CODE-SANDBOX-1:%' OR title LIKE 'RM-OAUTH-BROKER-1:%'; UPDATE roadmap_implementation SET status = 'retired' WHERE source = 'code-agent-console-2026-10';

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-CMD-FAILURES-1', 'code-agent-console-2026-10', 'Inventory why the /cmd command line fails: ten replayed turns with the failing stage named', 'worker', 'qnfo-fleet-dashboard', 'planned', 'docs/CODE-AGENT-CONSOLE.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-CMD-FAILURES-1' AND source = 'code-agent-console-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-CMD-FAILURES-1: Inventory why the /cmd command line fails: ten replayed turns with the failing stage named',
 'Charter pillar: autonomy. Doer: qnfo-fleet-dashboard via qnfo-code-orchestrator. The owner reports /cmd is kludgy and does not work; the failure is not yet measured. Lever: replay ten real owner turns (plain English, a code change, a fleet probe, a decision) through scripts/qcli.mjs and record per turn the stage that failed (parse, hand-off, ops-exec start/result, polling, render) in docs/CODE-AGENT-CONSOLE.md. Done: the table has ten rows and each failing stage has a linked issue.',
 'session', 'reliability', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-CMD-FAILURES-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-CODE-SESSION-1', 'code-agent-console-2026-10', 'Streaming CodeSession Durable Object in qnfo-agents with a chat pane at /cmd', 'worker', 'qnfo-agents', 'planned', 'docs/CODE-AGENT-CONSOLE.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-CODE-SESSION-1' AND source = 'code-agent-console-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-CODE-SESSION-1: Streaming CodeSession Durable Object in qnfo-agents with a chat pane at /cmd',
 'Charter pillar: autonomy. Doer: qnfo-agents via qnfo-code-orchestrator. Lever: an Agents SDK CodeSession DO that streams model text and each tool step over SSE, survives reconnect, uses deepseek-v4-flash-wa first with escalation to pro, a stable cached prompt prefix and a per-session neuron budget that downgrades the model and never stops work. qnfo-fleet-dashboard gets a thin chat pane and qcli.mjs the same route; the deterministic verb parser stays as the first stage. Done: the ten RM-CMD-FAILURES-1 turns complete through the stream, with tokens and cost per turn recorded.',
 'session', 'reliability', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-CODE-SESSION-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-CODE-SANDBOX-1', 'code-agent-console-2026-10', 'Sandbox file and shell tools, plan/approve and PR creation for CodeSession', 'worker', 'qnfo-agents', 'planned', 'docs/CODE-AGENT-CONSOLE.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-CODE-SANDBOX-1' AND source = 'code-agent-console-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-CODE-SANDBOX-1: Sandbox file and shell tools, plan/approve and PR creation for CodeSession',
 'Charter pillar: autonomy. Doer: qnfo-agents via qnfo-code-orchestrator. Depends on RM-CODE-SESSION-1. Lever: a Sandbox SDK container with the repo, read/edit/run-tests tools, a work claim taken before any edit, a plan message the page renders, destructive tools behind the existing fresh code, a PR opened through the fleet GitHub route and the canonical merge gates unchanged. Done: one real fix goes from a typed request in /cmd to a merged PR with no local tool use.',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-CODE-SANDBOX-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-OAUTH-BROKER-1', 'code-agent-console-2026-10', 'In-Worker OAuth broker for Google, GitHub and Slack with D1 token store and hourly refresh', 'worker', 'qnfo-ops', 'planned', 'docs/COMPOSIO-INTEGRATION.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-OAUTH-BROKER-1' AND source = 'code-agent-console-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-OAUTH-BROKER-1: In-Worker OAuth broker for Google, GitHub and Slack with D1 token store and hourly refresh',
 'Charter pillar: reach. Doer: qnfo-ops via qnfo-code-orchestrator. Free, Cloudflare-native alternative to Composio (docs/COMPOSIO-INTEGRATION.md section 5). Lever: authorize and callback routes, refresh tokens encrypted at rest in one D1 table bound to one worker, refresh on the hourly tick, personal and research scopes held separately, calls metered. Consent per service is an IDENTITY-BOUND owner step. Done: one Google Calendar read through the broker with a refreshed token.',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-OAUTH-BROKER-1:%' AND status = 'open');
