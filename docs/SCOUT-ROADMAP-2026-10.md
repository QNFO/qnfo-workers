# Scouted external work for the Qniverse roadmap (SCOUT-1, 2026-10-28)

Owner directive 2026-10-28: proactively find GitHub repositories and papers (AI, Cloudflare, QNFO scope) and fold the useful
ones into the roadmap. This is not bug work. Each row names the charter pillar, the roadmap item it extends or proposes, and the
adoption step. Evidence level: **abstract** = read from search excerpts only; the adopting PR must read the full text
(CITE-FULLTEXT-1) before any claim derived from it is published. Source of ids: web search 2026-10-28.

## A. Cloudflare platform (pillar: core / autonomy / cost)

| Source | What it gives | Roadmap link | Adoption step | Evidence |
|---|---|---|---|---|
| [cloudflare/agents](https://github.com/cloudflare/agents), Project Think (2026-04-15) | Durable execution, sub-agents, persistent sessions, sandboxed code as standalone packages; Agents SDK 0.20.0 supports MCP spec 2026-07-28 | RM-DO-AGENTS-DECISION-1, RM-CAPABILITY-PRODUCT-LOOP-1 | Score Think primitives in `cloudflare_capability_catalog`; pilot one fleet loop (intent orchestrator) on them before re-deciding the DO agents | abstract |
| `@cloudflare/codemode` (in cloudflare/agents) | Two-tool MCP surface (~1,000 tokens vs ~1.17M for tool-per-endpoint) | cost (L0-L7 routing stack) | Expose qnfo-ops tools through a code-mode search+execute pair; measure tokens per task in Analytics Engine (RM-ANALYTICS-ENGINE-METERS-1) | abstract |
| `@cloudflare/workers-oauth-provider` v1 | Split authorization-server / resource-server for MCP | RM-MCP-OAUTH-1 | Evidence for the owner-decision card: tokenless identity pattern exists | abstract |
| [cloudflare/cloudflare-os](https://github.com/cloudflare/cloudflare-os) (Apache 2.0, 2026-08-05), Moltworker, `@cloudflare/computer` | Reference agent workspace and per-agent computer runtime | RM-CAPABILITY-PRODUCT-LOOP-1 | Read-only study; borrow patterns, no dependency (early access) | abstract |

## B. Agent memory (pillar: autonomy / research)

Fleet gap: memory is flat (D1 rows plus Vectorize); no tiering, consolidation, or decay.

| Source | Idea | Adoption step |
|---|---|---|
| [MemTier, arXiv 2605.03675](https://arxiv.org/html/2605.03675v3) | Episodic store, weighted retrieval, outcome-attribution loop, async consolidation into a semantic tier | New item RM-MEMORY-TIERING-1: consolidation cron in qnfo-memory-mcp that distils episodes into semantic rows, weights learned from tool outcomes |
| [Typed memory, arXiv 2605.25869](https://arxiv.org/pdf/2605.25869) | Provenance-role collapse: typed memory records keep source and role | Add `provenance`/`role` columns to memory writes; ties to evidence rule 2 |
| [Ground Truth First, arXiv 2607.21962](https://arxiv.org/pdf/2607.21962) | Longitudinal eval; rankings change with memory tenure | Evaluate memory changes at 7 and 30 days, not at write time |
| [Memory survey, arXiv 2603.07670](https://arxiv.org/abs/2603.07670), [Oblivion decay, arXiv 2604.00131](https://arxiv.org/abs/2604.00131) | Survey and decay-driven forgetting | Decay policy for stale `belief_registry` and memory rows |
| [Memory security survey, arXiv 2604.16548](https://arxiv.org/abs/2604.16548) | Memory poisoning | Feeds section D |

## C. Evaluation and self-change (pillar: autonomy / research)

| Source | Idea | Roadmap link / step |
|---|---|---|
| [LLM-as-a-Judge Is Not an Oracle, arXiv 2609.02246](https://arxiv.org/abs/2609.02246) | Judge is advisor; a deterministic layer the judge cannot override gates every self-change; reward hacking via cached answer keys hid 68% true capability | Matches ENSEMBLE-POLICY-1 and SELF-CHANGE PROTOCOL. New item RM-DETERMINISTIC-GATE-AUDIT-1: list every loop where a model score alone promotes a change and add a non-model check |
| [Nine Judges, Two Effective Votes, arXiv 2605.29800](https://arxiv.org/pdf/2605.29800) | Correlated judge errors | Already cited in ENSEMBLE-POLICY-1; confirm full text and cite |
| [Chain-of-Models cross-model auditing, arXiv 2607.28636](https://arxiv.org/pdf/2607.28636) | Cross-model bias auditing of judges | Candidate layer for paper review, disjoint families only |
| [Root-cause attribution as search, arXiv 2609.13463](https://arxiv.org/pdf/2609.13463) | Attributing long-horizon agent failures | Candidate for the failure_modes detector loop |

## D. Agent security (pillar: security)

| Source | Idea | Adoption step |
|---|---|---|
| [SoK prompt injection on agentic coding assistants, arXiv 2601.17548](https://arxiv.org/pdf/2601.17548) | Taxonomy; adaptive attacks exceed 85% against many defenses; capability isolation (CaMeL) and channel separation (StruQ) | RM-AGENT-INJECTION-DEFENSE-1: threat-model every worker that ingests fetched text (papers, email, web) and reads tools |
| [VIGIL, arXiv 2601.05755](https://arxiv.org/pdf/2601.05755) verify-before-commit; [Trust No Tool, arXiv 2605.17453](https://arxiv.org/pdf/2605.17453) | Treat tool output as untrusted | Verify-before-commit on irreversible actions (email send, publish, deploy) |
| [Tool description poisoning / isolated planning, arXiv 2606.20922](https://arxiv.org/pdf/2606.20922), [WebMCP surface poisoning, arXiv 2606.06387](https://arxiv.org/pdf/2606.06387) | Poisoned MCP tool metadata | Pin and hash tool descriptions for MCP servers the fleet consumes |
| [ShieldNet, arXiv 2604.04426](https://arxiv.org/pdf/2604.04426) | Network-level guardrails | Maps to Gateway/AI Gateway guardrails; evaluate with RM-WAF-RATE-LIMIT-1 |
| [Skill ecosystem poisoning, arXiv 2604.03081](https://arxiv.org/abs/2604.03081) | Supply-chain risk in agent skills | Review of the skills this fleet installs from outside |

## E. Retrieval and routing (pillar: cost / reach)

| Source | Finding | Adoption step |
|---|---|---|
| [Dissecting Agentic RAG, arXiv 2606.21553](https://arxiv.org/pdf/2606.21553) | Fixed hybrid beat the full adaptive pipeline; agentic ~10x latency | Default Ask/RAG to hybrid + cross-encoder rerank; A/B any agentic loop against it in the ASK-LOOP-1 golden set |
| [Is Agentic RAG worth it?, arXiv 2601.07711](https://www.alphaxiv.org/abs/2601.07711) | Reranking is the efficient win; agentic ~3x input tokens | Same A/B |
| [Agentic Routing, arXiv 2607.11399](https://arxiv.org/pdf/2607.11399), Switchcraft (arXiv 2605.07112) | Routing as a data flywheel from harness traces | Feed `ops_ai_log` outcomes into the router's selection (self-tuning router, RM-KAIZEN-SCHEDULED-1) |

## F. Research automation (pillar: research)

| Source | Idea | Adoption step |
|---|---|---|
| [Verification Gap survey, arXiv 2608.05179](https://arxiv.org/pdf/2608.05179) | Only 38% of AI-scientist systems release seeds/traces or report novelty checks | Publish seed, trace and novelty-check record with each paper (ties to PAPER-LEDGER-1) |
| [AutoResearch AI, arXiv 2605.23204](https://arxiv.org/abs/2605.23204) | Five dimensions (novelty, validity, impact, reliability, provenance), autonomy levels L0-L4 | Grade the research pipeline on those dimensions as outcome measures in `output_quality_measures` |
| [AI-driven reproducibility, arXiv 2610.23845](https://arxiv.org/abs/2610.23845), [ReproRepo, arXiv 2606.18237](https://arxiv.org/pdf/2606.18237) | Agents reproduce findings and flag analytic choices | Reproduction pass for qwav papers that ship code |
| [openags/Awesome-AI-Scientist-Papers](https://github.com/openags/Awesome-AI-Scientist-Papers) | Living index | Re-scout monthly from this list |

## G. Quantum (qwav.org; pillar: research / reach)

| Source | Idea | Adoption step |
|---|---|---|
| [eigenkit 1.0](https://thequantuminsider.com/2026/10/14/eigenorbit-releases-open-source-eigenkit-quantum-computing-library/) (Apache 2.0) | One algorithm, many simulator/hardware backends | Candidate backend layer for qwav-demo-kit demos |
| [ffsim](https://quantumcomputingreport.com/ibm-quantum-releases-open-source-ffsim-library-for-specialized-fermionic-circuit-simulation/), QuTiP 5.3.1, Cirq/qsim, PennyLane | Fast classical simulators | Cross-check golden values of demos against a second simulator |

## Proposed new roadmap items

RM-MEMORY-TIERING-1, RM-DETERMINISTIC-GATE-AUDIT-1, RM-AGENT-INJECTION-DEFENSE-1, RM-CODEMODE-MCP-SURFACE-1,
RM-RAG-HYBRID-BASELINE-1, RM-PAPER-PROVENANCE-TRACE-1, RM-QWAV-CROSS-SIMULATOR-1. They are to be filed as `agent_issues` rows with a
doer and a closing probe (OWNER-NO-LOOSE-ENDS-1); filed by migrations/2026-10-28-scout-roadmap-items.sql. Failure mode: a scouted idea adopted from an abstract can mislead; every
adoption PR cites the full text and measures the effect against the pre-change baseline before it is kept.

## Overlap with existing open issues (do not file twice)

- RM-AGENT-INJECTION-DEFENSE-1 extends BP26-PROMPT-INJECTION-1 (agent_issues 1000359, PR 4455): section D is its reading list.
- RM-DETERMINISTIC-GATE-AUDIT-1 supports BP26-LEASES-KILLSWITCH-1 (1000361) and the self-change protocol.
- RM-CODEMODE-MCP-SURFACE-1 and RM-RAG-HYBRID-BASELINE-1 have no existing issue; file these two first.
