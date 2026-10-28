-- SCOUT-2 (2026-10-28, charter pillars research, security, cost, autonomy; OWNER-NO-LOOSE-ENDS-1): files six of the roadmap items proposed in docs/SCOUT-ROADMAP-2026-10.md, section Round 2.
-- Not filed: RM-ULTRAMETRIC-CROSSCHECK-1, RM-RERANK-DISTILL-1, RM-K2-EVENT-LOG-1 (no measured need or a prerequisite missing).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'closed' WHERE title LIKE 'RM-CITE-EXISTENCE-GATE-1:%' OR title LIKE 'RM-POLICY-SMT-GATE-1:%' OR title LIKE 'RM-TRACE-FOLD-1:%' OR title LIKE 'RM-AISEARCH-GA-MIGRATE-1:%' OR title LIKE 'RM-AUTOROUTER-EVAL-1:%' OR title LIKE 'RM-DURABLE-INTERRUPT-1:%'; UPDATE roadmap_implementation SET status = 'retired' WHERE source = 'scout-2026-10' AND item IN ('RM-CITE-EXISTENCE-GATE-1', 'RM-POLICY-SMT-GATE-1', 'RM-TRACE-FOLD-1', 'RM-AISEARCH-GA-MIGRATE-1', 'RM-AUTOROUTER-EVAL-1', 'RM-DURABLE-INTERRUPT-1');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-CITE-EXISTENCE-GATE-1', 'scout-2026-10', 'Deterministic reference-existence gate before a paper publishes', 'worker', 'qnfo-research-exec', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-CITE-EXISTENCE-GATE-1' AND source = 'scout-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-CITE-EXISTENCE-GATE-1: Deterministic reference-existence gate before a paper publishes',
 'Charter pillar: research. Doer: qnfo-research-exec via qnfo-code-orchestrator. Sources: arXiv 2605.27700 (CiteCheck, full text read), 2607.22693 (tool comparison and Zenodo reference set, full text read), 2605.08583. Lever: before publish, every reference must resolve by title and year in at least one of arXiv, Crossref, Semantic Scholar or OpenAlex; only unresolved or mismatched references go to a model grader. First check existing Crossref use in qnfo-cloud-ops and reuse it. Done: the gate runs on new papers and its precision and recall are recorded against the published reference fixture. Failure mode: index gaps flag real references, so a flagged reference is held for review, never silently dropped.',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-CITE-EXISTENCE-GATE-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-POLICY-SMT-GATE-1', 'scout-2026-10', 'Solver-checked policy gate for irreversible tool calls', 'worker', 'qnfo-ops', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-POLICY-SMT-GATE-1' AND source = 'scout-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-POLICY-SMT-GATE-1: Solver-checked policy gate for irreversible tool calls',
 'Charter pillar: security. Doer: qnfo-ops via qnfo-code-orchestrator. Extends BP26-PROMPT-INJECTION-1 (agent_issues 1000359). Sources: arXiv 2603.20449 (Z3 check of tool calls, full text read), 2610.12813 (VEPA, evidence-gated rules, partly read). Lever: hand-written constraints for three irreversible tool classes (email send, publish, delete), checked in a deterministic gate before execution that the model cannot override; rules activate only after replay evidence. Done: blocked-call precision and recall measured on replayed ops_ai_log calls, and the gate runs in shadow mode first. Failure mode: an incomplete constraint blocks nothing, so recall is measured before the gate enforces.',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-POLICY-SMT-GATE-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-TRACE-FOLD-1', 'scout-2026-10', 'Event ledger with a folded run state for long qnfo-ops sessions', 'worker', 'qnfo-ops', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-TRACE-FOLD-1' AND source = 'scout-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-TRACE-FOLD-1: Event ledger with a folded run state for long qnfo-ops sessions',
 'Charter pillar: autonomy. Doer: qnfo-ops via qnfo-code-orchestrator. Sources: arXiv 2609.01466 (ledger plus fold, full text read), 2610.08364 (turn-axis timeline, partly read). Lever: append-only event ledger per long run, folded into a typed run state that the agent and an observer view read instead of the raw transcript; a per-run token timeline over ops_ai_log. Done: on 20 long tasks, task success and tokens per task measured against current context handling, with no silent truncation. Failure mode: the paper benchmark favoured its own tasks (n=30), so the gain is re-measured here before it is kept.',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-TRACE-FOLD-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-AISEARCH-GA-MIGRATE-1', 'scout-2026-10', 'Inventory AI Search instances and fix cost telemetry before usage billing starts 2026-11-01', 'worker', 'qnfo-ai-search', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-AISEARCH-GA-MIGRATE-1' AND source = 'scout-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-AISEARCH-GA-MIGRATE-1: Inventory AI Search instances and fix cost telemetry before usage billing starts 2026-11-01',
 'Charter pillar: cost. Doer: qnfo-ai-search via qnfo-code-orchestrator. Source: Cloudflare changelog 2026-10-01 AI Search GA (full text read): usage billing begins 2026-11-01; embedding and rerank calls move into AI Search pricing and no longer show on Workers AI bills or in AI Gateway logs; hybrid search is the default for new instances; file caps 10 MiB (OCR, text) and 4 MiB. Lever: list every AI Search instance the fleet binds, record the expected monthly bill, and correct any cost metric that summed the Workers AI lines now absent. Done: an instance list and per-instance expected cost are in docs, and the unified cost metric reads the same before and after 2026-11-01 within 10 percent. Failure mode: a cost metric that drops silently reads as a saving.',
 'session', 'reliability', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-AISEARCH-GA-MIGRATE-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-AUTOROUTER-EVAL-1', 'scout-2026-10', 'Shadow-run AI Gateway Auto Router against the L0-L7 cost ladder', 'worker', 'qnfo-ai', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-AUTOROUTER-EVAL-1' AND source = 'scout-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-AUTOROUTER-EVAL-1: Shadow-run AI Gateway Auto Router against the L0-L7 cost ladder',
 'Charter pillar: cost. Doer: qnfo-ai via qnfo-code-orchestrator. Sources: Cloudflare Birthday Week 2026 (Auto Router and User Insights, headline list read), arXiv 2606.27457 (cluster, route, escalate, abstract only). Lever: replay a sample of logged prompts through Auto Router in shadow mode and compare cost and judged quality with the current ladder; read User Insights for overuse. The quality judge must be non-model or from a disjoint family (ENSEMBLE-POLICY-1). Done: the comparison is recorded with cost per task and quality delta; adopt only if cost falls and no guard worsens. Evidence for the routing paper is abstract-level: read the full text before citing it (CITE-FULLTEXT-1).',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-AUTOROUTER-EVAL-1:%' AND status = 'open');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence) SELECT 'RM-DURABLE-INTERRUPT-1', 'scout-2026-10', 'Pause-for-approval and replay for one irreversible step using @cloudflare/computer', 'worker', 'qnfo-agents', 'planned', 'docs/SCOUT-ROADMAP-2026-10.md' WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'RM-DURABLE-INTERRUPT-1' AND source = 'scout-2026-10');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RM-DURABLE-INTERRUPT-1: Pause-for-approval and replay for one irreversible step using @cloudflare/computer',
 'Charter pillar: autonomy. Doer: qnfo-agents via qnfo-code-orchestrator. Source: Cloudflare Agents changelog Oct 2026 (full text read): @cloudflare/computer 0.7.0 replays interrupted code and pauses at ctx.interrupt() for external approval. Lever: prototype one irreversible, identity-bound step (publish or email send) that pauses at an interrupt and resumes the same run when its IDENTITY-BOUND card is answered, instead of re-planning. Done: one end-to-end run in a staging path survives a forced restart and resumes after approval, with the run recorded. Failure mode: the harness permission checks and the interrupt gate stay in force; a pause never widens what a run may do.',
 'session', 'reliability', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RM-DURABLE-INTERRUPT-1:%' AND status = 'open');
