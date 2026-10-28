-- SCOUT-1 (2026-10-28, charter pillars autonomy, cost, research; OWNER-NO-LOOSE-ENDS-1): files the roadmap items proposed in docs/SCOUT-ROADMAP-2026-10.md.
-- RM-AGENT-INJECTION-DEFENSE-1 is not filed: it extends the open BP26-PROMPT-INJECTION-1 (agent_issues 1000359).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'RM-MEMORY-TIERING-1:%' OR title LIKE 'RM-DETERMINISTIC-GATE-AUDIT-1:%' OR title LIKE 'RM-CODEMODE-MCP-SURFACE-1:%' OR title LIKE 'RM-RAG-HYBRID-BASELINE-1:%' OR title LIKE 'RM-PAPER-PROVENANCE-TRACE-1:%' OR title LIKE 'RM-QWAV-CROSS-SIMULATOR-1:%'; UPDATE roadmap_implementation SET status = 'retired' WHERE source = 'scout-2026-10';

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-MEMORY-TIERING-1', 'scout-2026-10', 'Tiered agent memory with consolidation and outcome-weighted retrieval', 'worker', 'qnfo-memory-mcp', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-MEMORY-TIERING-1' AND source = 'scout-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-MEMORY-TIERING-1: Tiered agent memory with consolidation and outcome-weighted retrieval',
 'Charter pillar: autonomy. Doer: qnfo-memory-mcp via qnfo-code-orchestrator. Fleet memory is flat (D1 rows plus Vectorize). Lever: add an episodic tier, an hourly consolidation step that distils episodes into semantic rows, a provenance/role field on every write, and a decay policy for stale rows. Sources: arXiv 2605.03675 (MemTier), 2605.25869, 2604.00131. Evaluate at 7 and 30 days (arXiv 2607.21962). Done: consolidation row counts in a view and retrieval hit-rate measured before and after. Evidence is abstract-level: read the full text before relying on it (CITE-FULLTEXT-1).',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-MEMORY-TIERING-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-DETERMINISTIC-GATE-AUDIT-1', 'scout-2026-10', 'Every loop that promotes a change on a model score alone gets a deterministic gate the model cannot override', 'worker', 'qnfo-fleet-control', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-DETERMINISTIC-GATE-AUDIT-1' AND source = 'scout-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-DETERMINISTIC-GATE-AUDIT-1: Every loop that promotes a change on a model score alone gets a deterministic gate the model cannot override',
 'Charter pillar: autonomy. Doer: qnfo-fleet-control via qnfo-code-orchestrator. Source: arXiv 2609.02246 (judge as advisor, reward hacking hid 68 percent true capability). Lever: list each loop where an LLM score alone promotes a prompt, code, config or paper change, and add a non-model check for each; record the list in docs. Done: the list exists and each row names its deterministic check. Evidence is abstract-level: read the full text before relying on it (CITE-FULLTEXT-1).',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-DETERMINISTIC-GATE-AUDIT-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-CODEMODE-MCP-SURFACE-1', 'scout-2026-10', 'Expose qnfo-ops tools as a code-mode search+execute pair', 'worker', 'qnfo-ops', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-CODEMODE-MCP-SURFACE-1' AND source = 'scout-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-CODEMODE-MCP-SURFACE-1: Expose qnfo-ops tools as a code-mode search+execute pair',
 'Charter pillar: cost. Doer: qnfo-ops via qnfo-code-orchestrator. Source: cloudflare/agents codemode (about 1,000 tokens for two tools versus about 1.17M for tool-per-endpoint). Lever: a search tool over the tool catalogue and an execute tool running generated code in a sandbox; meter tokens per task in Analytics Engine. Done: tokens per task measured on 20 tasks before and after, with no drop in task success. Evidence is abstract-level: read the full text before relying on it (CITE-FULLTEXT-1).',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-CODEMODE-MCP-SURFACE-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-RAG-HYBRID-BASELINE-1', 'scout-2026-10', 'Default Ask retrieval to hybrid plus cross-encoder rerank; A/B any agentic loop against it', 'worker', 'qnfo-ai-search', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-RAG-HYBRID-BASELINE-1' AND source = 'scout-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-RAG-HYBRID-BASELINE-1: Default Ask retrieval to hybrid plus cross-encoder rerank; A/B any agentic loop against it',
 'Charter pillar: cost. Doer: qnfo-ai-search via qnfo-code-orchestrator. Sources: arXiv 2606.21553 (fixed hybrid beat the adaptive pipeline), 2601.07711 (agentic RAG about 3x input tokens). Lever: run the ASK-LOOP-1 golden set on hybrid+rerank versus the current path and keep the cheaper one that holds quality. Done: the A/B result is recorded with latency and token cost. Evidence is abstract-level: read the full text before relying on it (CITE-FULLTEXT-1).',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-RAG-HYBRID-BASELINE-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-PAPER-PROVENANCE-TRACE-1', 'scout-2026-10', 'Publish seed, trace and novelty-check record with every paper', 'worker', 'qnfo-research-exec', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-PAPER-PROVENANCE-TRACE-1' AND source = 'scout-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-PAPER-PROVENANCE-TRACE-1: Publish seed, trace and novelty-check record with every paper',
 'Charter pillar: research. Doer: qnfo-research-exec via qnfo-code-orchestrator. Sources: arXiv 2608.05179 (only 38 percent of AI-scientist systems release seeds or traces), 2605.23204. Lever: store seed, generation trace id and a novelty-check result in paper_change_bodies metadata and link it from the paper page. Done: new papers carry the record; a view counts the share. Evidence is abstract-level: read the full text before relying on it (CITE-FULLTEXT-1).',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-PAPER-PROVENANCE-TRACE-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-QWAV-CROSS-SIMULATOR-1', 'scout-2026-10', 'Cross-check qwav demo golden values against a second quantum simulator', 'worker', 'qwav-demo-kit', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-QWAV-CROSS-SIMULATOR-1' AND source = 'scout-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-QWAV-CROSS-SIMULATOR-1: Cross-check qwav demo golden values against a second quantum simulator',
 'Charter pillar: research. Doer: qwav-demo-kit via qnfo-code-orchestrator. Sources: eigenkit 1.0 (Oct 2026), ffsim, QuTiP 5.3.1, Cirq/qsim. Lever: run each demo golden value on one independent simulator and record agreement. Done: a table of demo, simulator, agreement for every published demo. Evidence is abstract-level: read the full text before relying on it (CITE-FULLTEXT-1).',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-QWAV-CROSS-SIMULATOR-1:%' AND status = 'open');

