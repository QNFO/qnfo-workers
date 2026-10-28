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

## Round 2 (2026-10-28)

Second scouting pass, same rules. Not repeated from round 1. Skipped because already adopted: `createAI` (qnfo-agents already uses it, see docs/breach-doctor/FAMILY-TOOL-LOOP.md), Clairic typed input (migrations/2026-10-19-clairic-typed-input.sql), Basin and Cloudflare OS (round 1 / CLOUDFLARE-CAPABILITY-INTEGRATION.md). Evidence levels: **full text read** = the page or paper body was fetched and read in this session (a fetched page whose tail was cut is noted); **abstract** = search excerpt or abstract page only. The fetch tool summarises pages, so numbers below are the ones it reported; the adopting PR re-reads the primary source (CITE-FULLTEXT-1).

### H. Cloudflare platform, October 2026 (pillar: cost / autonomy)

| Source | Finding | Roadmap link | Adoption step | Evidence |
|---|---|---|---|---|
| [AI Search GA, 2026-10-01](https://developers.cloudflare.com/changelog/post/2026-10-01-ai-search-generally-available/) | Usage billing starts 2026-11-01; hybrid (vector plus full-text) is the default for new instances; embedding and rerank calls are folded into AI Search pricing and vanish from Workers AI bills and AI Gateway logs; OCR for scanned PDFs on every account; 10 MiB (OCR/text) or 4 MiB file caps | cost; RM-RAG-HYBRID-BASELINE-1 | RM-AISEARCH-GA-MIGRATE-1: before 2026-11-01 inventory every AI Search instance the fleet binds, record its expected bill, and fix cost telemetry that read the now-missing Workers AI lines | full text read |
| [Agents changelog, Oct 2026](https://developers.cloudflare.com/changelog/product/agents/) | `@cloudflare/computer` 0.7.0 replays interrupted code (`onInterrupt: "replay"`) and pauses at `ctx.interrupt()` for approval; `web_fetch` and `web_search` agent tools; persistent `browserTool` sessions (10 min idle) | autonomy; IDENTITY-BOUND cards | RM-DURABLE-INTERRUPT-1: prototype an approval pause for one irreversible step (publish or email send) so an IDENTITY-BOUND card resumes the exact run instead of a re-plan | full text read |
| [Birthday Week 2026 wrap-up](https://blog.cloudflare.com/birthday-week-2026-wrap-up/) | AI Gateway Auto Router (edge classification to a cheaper adequate model) and User Insights (task/model-fit/overuse report); Containers filesystem snapshots for persistent agent workspaces; K2 durable ordered event streams on R2 | cost; COST-ROUTING-STACK-1 | RM-AUTOROUTER-EVAL-1: shadow-run Auto Router against the L0-L7 ladder on logged prompts; read User Insights for overuse before changing any tier | full text read (headline list only) |
| [Workers changelog Oct 2026](https://developers.cloudflare.com/changelog/) | Bundle limit 64 MiB all plans (Oct 2); source maps uploaded by default (Oct 20); AI Gateway ids now UUIDv7 (Oct 8); Flagship targeting with structured context (Oct 26); AI Search CJK keyword tokenizer (Oct 16) | core | Check any parser that assumes the old AI Gateway log id shape; no new item | abstract |
| K2 Streams (same wrap-up) | Durable log without brokers | autonomy | Candidate home for `issue_lifecycle` and tick ledgers if D1 write volume becomes a cap issue; not filed, no measured need yet | abstract |

### I. Agent observability, evaluation and reliability (pillar: autonomy / cost)

| Source | Finding | Roadmap link | Adoption step | Evidence |
|---|---|---|---|---|
| [Parsing the Stream, arXiv 2609.01466](https://arxiv.org/html/2609.01466v1) | Append-only event ledger folded into typed run state; a compiled view cut observer input about 14x and a curated fold finished 30/30 120-step tasks versus 8/30 for full context (small samples, authors' own tasks) | autonomy, cost; RM-TRACE-FOLD-1 | Build a ledger-plus-fold for long qnfo-ops sessions and the code loop; judge it on task success and tokens against the current context handling, with the paper's 11 requirements (no silent truncation, idempotence) as the checklist | full text read |
| [Transect, arXiv 2610.08364](https://arxiv.org/html/2610.08364v2) | Evaluation reports on one turn-axis timeline (labels, tokens, sub-agents); in the case study most compute went to writing, not hypotheses | autonomy; OUTPUT-QUALITY-LEDGER-1 | Same item: add a per-run timeline view over `ops_ai_log` so a loop's token split is visible | full text read (first 60 percent) |
| [AgentPProf, arXiv 2609.20301](https://arxiv.org/pdf/2609.20301) | Semantic profiler attributing tokens and failures hierarchically | cost | Evidence for the same item; no separate step | abstract |
| [Staying on Task, arXiv 2609.38712](https://arxiv.org/abs/2609.38712) | Accuracy fell 62.8 percent from 4K to 128K context across seven open models | cost; reliability | Cap context per loop step; test the claim on the fleet's own models before acting | abstract |
| [AgentRewind, arXiv 2608.14380](https://arxiv.org/pdf/2608.14380) | Recoverable execution for long-horizon agents | autonomy | Compare with Workflows retries and `@cloudflare/computer` replay (row above) | abstract |

### J. Citations, review and paper quality (pillar: research)

| Source | Finding | Roadmap link | Adoption step | Evidence |
|---|---|---|---|---|
| [CiteCheck, arXiv 2605.27700](https://arxiv.org/html/2605.27700v1) | Parse citation, retrieve candidates from arXiv, Crossref, Semantic Scholar and OpenAlex by title similarity, then an LLM verifier grades Exact/Minor/Major; 88.7 macro-F1 on 792 physics citations; code only on request | research; RM-CITE-EXISTENCE-GATE-1 | Deterministic existence gate in the paper pipeline: every reference must resolve in at least one index by title and year before publish; the LLM only grades the residue (ENSEMBLE-POLICY-1 layering). Check existing Crossref use in qnfo-cloud-ops first | full text read (last 11 percent, appendices, not read) |
| [What current tools can and cannot do, arXiv 2607.22693](https://arxiv.org/html/2607.22693v2) | Five tools tested on 104 references: those that catch most also over-flag, the quiet one misses; authors say manual check of flagged items stays necessary; dataset on Zenodo | research | Use the Zenodo reference set as the gate's regression fixture; record precision and recall of the fleet gate against it | full text read |
| [CiteTracer, arXiv 2605.08583](https://arxiv.org/abs/2605.08583) | Cascade: deterministic field match first, specialist judges only for ambiguous cases; real fabricated-citation set from ICLR 2026 | research | Same cascade shape as above; second fixture | abstract |
| [Hallucinations in the wild, arXiv 2605.07723](https://arxiv.org/abs/2605.07723) | At least 146,932 hallucinated citations in 2025 across 111M audited references | research | Reputational risk argument for the gate; arXiv now sanctions authors (per the citing papers) | abstract |
| [Benchmarking Agentic Review Systems, arXiv 2606.19749](https://arxiv.org/html/2606.19749v1) | Best reviewer caught 71.6 percent of injected errors | research; OUTPUT-QUALITY-LEDGER-1 | Inject known errors into a few drafts and measure the fleet reviewer's catch rate as an outcome measure | abstract |

### K. Policy verification and cost routing (pillar: security / cost)

| Source | Finding | Roadmap link | Adoption step | Evidence |
|---|---|---|---|---|
| [Solver-Aided Policy Compliance, arXiv 2603.20449](https://arxiv.org/html/2603.20449) | Tool calls checked against SMT-LIB constraints with Z3 before execution; invalid calls fell from about 50 to 29 percent on tau-bench airline; fully automatic NL-to-SMT failed and needed manual review; latency and code not reported | security; BP26-PROMPT-INJECTION-1 | RM-POLICY-SMT-GATE-1: hand-write constraints for three irreversible tool classes (email send, publish, delete) and check them in a deterministic gate the model cannot override; measure blocked-call precision on replayed `ops_ai_log` | full text read |
| [VEPA, arXiv 2610.12813](https://arxiv.org/html/2610.12813v1) | LLM proposes patches to symbolic rules over typed events; deterministic verifier checks well-formedness and conflicts; a rule activates only after enough evidence (Bayesian quantile) and deactivates on contrary feedback; no code stated | security, autonomy | Same item: adopt the activation-by-evidence idea for `control_registry` rules; typed event schema is the prerequisite | full text read (first 58 percent) |
| [Agent Behavioral Contracts, arXiv 2602.22302](https://arxiv.org/html/2602.22302v1), [AgentSpec](https://arxiv.org/pdf/2503.18666) | Runtime-enforced contracts (preconditions, invariants, recovery) | security | Vocabulary for the same item | abstract |
| [Cluster, Route, Escalate, arXiv 2606.27457](https://arxiv.org/abs/2606.27457) | Per-cluster model choice plus a quality-estimator escalation; reported 97-99 percent of top-model accuracy | cost; COST-ROUTING-STACK-1 | Feed the RM-AUTOROUTER-EVAL-1 comparison; the quality estimator must be non-model or disjoint-family | abstract |
| [Cache-Aware Prompt Compression, arXiv 2607.15516](https://arxiv.org/pdf/2607.15516) | Routers ignore cache stickiness; prices are not static | cost | Check whether the L0-L7 ladder's cost model counts cached-token prices; no new item until measured | abstract |
| [LLM-to-cross-encoder distillation for reranking, arXiv 2607.11933](https://arxiv.org/html/2607.11933v1) | LoRA-distilled 8B reranker, 4-bit | cost | Candidate after RM-RAG-HYBRID-BASELINE-1 shows rerank value; Workers AI fine-tune route must be confirmed | abstract |

### L. Corpora and ultrametric tooling (pillar: research)

| Source | Finding | Roadmap link | Adoption step | Evidence |
|---|---|---|---|---|
| [ArXivDoc, arXiv 2604.18508](https://arxiv.org/html/2604.18508v1), [VL-DocIR, arXiv 2610.17057](https://arxiv.org/html/2610.17057) | Text from LaTeX source beats page images for scientific retrieval; domain recall varies widely | research; RM-RAG-HYBRID-BASELINE-1 | Keep indexing paper `body_md`, not PDFs; add a domain-split recall check to the golden set | abstract |
| [padic-ds](https://medium.com/@polymathicus/padic-ds-bringing-p-adic-geometry-into-the-data-science-toolbox-2bfa3f076068) (github.com/Mircus/padics) | Finite-precision p-adic arithmetic, ultrametric distance matrices | research | RM-ULTRAMETRIC-CROSSCHECK-1 (not filed): compare the fleet's taxonomy ultrametric clustering to `scipy.cluster.hierarchy` cophenetic distances and padic-ds on one corpus | abstract |
| [QNFO/ultrametric-physics](https://github.com/QNFO/ultrametric-physics) | The program's own consolidated repo appears in search | research | None; cite as own work only after a full read | abstract |
| [Murtagh, Baire metric, arXiv 1104.4063](https://arxiv.org/pdf/1104.4063) | Fast clustering with a prefix-based ultrametric | research | Background for the item above | abstract |

### Proposed round 2 roadmap items

Filed by migrations/2026-10-28-scout-round2-items.sql: RM-CITE-EXISTENCE-GATE-1, RM-POLICY-SMT-GATE-1, RM-TRACE-FOLD-1,
RM-AISEARCH-GA-MIGRATE-1 (dated: billing starts 2026-11-01), RM-AUTOROUTER-EVAL-1, RM-DURABLE-INTERRUPT-1. Proposed, not filed (no measured need
or a prerequisite is missing): RM-ULTRAMETRIC-CROSSCHECK-1, RM-RERANK-DISTILL-1, RM-K2-EVENT-LOG-1.

Candidates in round 2: 25 rows. Full text read: AI Search GA post, Agents changelog, Birthday Week wrap-up (headline list), arXiv 2609.01466,
2610.08364 (60 percent), 2605.27700 (89 percent), 2607.22693, 2603.20449, 2610.12813 (58 percent). Not verified: the rows marked abstract
came from search summaries, not the pages; the quantum-foundations search (contextuality, reference frames) found no dedicated library, so
nothing is proposed there. Failure mode: the SMT gate encodes constraints by hand, so an incomplete constraint blocks nothing; its precision
and recall are measured on replayed calls before it gates anything.
