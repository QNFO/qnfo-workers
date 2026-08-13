---
title: "Prioritizing Large Language Models for Scientific Research and Agentic AI: A LiveBench-Grounded Audit (August 2026)"
author: "Quni-Gudzinas, Rowan Brad"
date: "2026-08-13"
license: "CC BY-NC-SA 4.0"
doi: "10.5281/zenodo.XXXXXXX"
status: "published"
---

## Abstract

Scientific research programs that rely on large language models (LLMs) for mathematics-heavy derivation, formal proof verification, literature synthesis, and agentic tool orchestration face a model-selection problem that general-purpose leaderboards do not directly answer. This audit evaluates the frontier LLM landscape as of August 13, 2026 against the concrete requirements of a mathematical-physics research program: ultrametric and p-adic analysis, Laws of Form formal algebra, measurement stratigraphy, and multi-agent subagent orchestration. Primary evidence is the LiveBench 2026-06-25 release, a contamination-free benchmark of 23 objective tasks across seven categories, collected directly from the live leaderboard. Supporting evidence includes the Cloudflare Workers AI model catalog (26 text-generation models, enumerated via the account REST API) and the runtime configuration of the program's inference router (DeepSeek V4 flash/pro, 1M-token context, verified via the DeepChat provider list). Findings: (1) no Meta/Llama model appears among the top 42 LiveBench entries, empirically supporting the exclusion of Llama from scientific routing paths; (2) DeepSeek V4 Pro 0813 achieves mathematics score 95.1 at USD 0.044 per benchmark run, the strongest price-performance among frontier-mathematics models and the default workhorse; (3) three open-weights models (Qwen 3.8 Max, Kimi K3, Smaug-Agentic) outperform it on agentic coding (62.2-64.6 vs 54.9) and are preferred for orchestration roles; (4) a five-tier prioritization is defined and deployed. All numeric claims were verified against the live leaderboard and the production router.

**Keywords:** large language models; model selection; agentic AI; scientific computing; benchmark evaluation; cost optimization

## Introduction

The selection of an LLM for a scientific research pipeline is a multi-objective decision. A general-purpose chat assistant may be evaluated on conversational quality; a research workhorse is evaluated on mathematics, formal reasoning, long-context synthesis, tool-calling reliability, and cost per useful run. These objectives frequently conflict: the highest-scoring models on aggregate benchmarks cost an order of magnitude more per run than models that are within one to three points on the mathematics axis.

This audit was commissioned to (a) determine which models are suitable for the mathematics-heavy discourse of the QNFO research program, (b) identify suitable models for agentic multi-agent orchestration, (c) exclude models whose training corpus or empirical performance is inadequate for advanced scientific discourse, and (d) map the selected models onto the existing Cloudflare-based inference infrastructure (AI Gateway, Workers AI, DeepSeek API) within a self-funded budget constraint of USD 100 per month for Cloudflare billing.

## Methods

### Data sources

Three primary sources were collected on 2026-08-13, each verified at collection time:

1. **LiveBench 2026-06-25 leaderboard** (livebench.ai). The full leaderboard table (42 rows) was extracted from the rendered page via a headless browser. For each model, the following category scores were captured: Overall, Reasoning, Coding, Agentic Coding, Mathematics, Data Analysis, Language, Instruction Following, and cost per benchmark run. The extraction was verified by an independent reviewer subagent, which re-fetched the leaderboard and confirmed every cited value exactly.

2. **Cloudflare Workers AI model catalog** (api.cloudflare.com, account edb167b78c9fb901ea5bca3ce58ccc4b). The text-generation model list (26 models) was enumerated via the account REST API. Each shortlisted model's free-tier availability was then verified by a direct Workers AI inference call (`POST /accounts/{id}/ai/run/@cf/{org}/{model}`); HTTP 200 confirmed free availability.

3. **DeepChat provider configuration** (`deepchat provider list --enabled-only --json`). The runtime router configuration was enumerated: DeepSeek provider with `deepseek-v4-flash` and `deepseek-v4-pro` (both 1M-token context, 32k max output, function calling, reasoning, and search enabled), plus the Cloudflare AI Gateway provider.

### Evaluation criteria

Models were scored against the program's actual workload profile:

- **Mathematics** (primary discriminator): p-adic/ultrametric analysis, Laws of Form formal algebra, measure-theoretic stratigraphy, proof verification. Weighted by the LiveBench Mathematics category.
- **Agentic capability**: multi-step tool use, subagent orchestration, ensemble validation. Weighted by the LiveBench Agentic Coding category.
- **Long context**: ability to ingest whole-paper corpora (up to 1M tokens).
- **Cost**: cost per benchmark run (LiveBench-reported) and free-tier availability (Workers AI).
- **Availability**: integration cost into the existing Cloudflare/DeepSeek infrastructure.

### Verification

Every numeric claim in the Results section was cross-checked against the live leaderboard by an independent reviewer subagent with no access to the author's extraction. The reviewer confirmed exact matches for all cited scores and costs. The production router change described in the Deployment section was verified by direct HTTP probes of the deployed worker's `/health` and `/v1/models` endpoints before and after deployment.

## Results

### Leaderboard overview

Table 1 reports the top-ranked models on LiveBench 2026-06-25, restricted to models relevant to this audit (top 15 by Overall plus open-weights and cost-effective candidates). Full column set: Overall, Mathematics, Agentic Coding, cost per run.

| Model | Overall | Mathematics | Agentic | USD/run |
|:------|--------:|------------:|--------:|--------:|
| Claude Fable 5 Max | 83.0 | 96.0 | 62.2 | 1.439 |
| GPT-5.6 Sol Max | 81.0 | 96.2 | 56.2 | 0.515 |
| GPT-5.5 Thinking xHigh | 80.2 | 95.9 | 54.0 | 0.435 |
| Claude 5 Opus Thinking | 80.1 | 95.7 | 65.2 | 0.699 |
| Smaug-Agentic (open) | 79.5 | 83.9 | 64.6 | 0.329 |
| Kimi K3 (open) | 79.2 | 84.4 | 62.2 | 0.348 |
| Qwen 3.8 Max (open) | 78.5 | 91.3 | 64.6 | 0.275 |
| GPT-5.4 Thinking xHigh | 78.0 | 94.1 | 53.8 | 0.387 |
| GPT-5.6 Terra Max | 77.9 | 94.9 | 54.9 | 0.352 |
| Grok 4.6 xHigh | 77.6 | 93.1 | 54.2 | 0.228 |
| DeepSeek V4 Pro 0813 (open) | 77.4 | 95.1 | 54.9 | 0.044 |
| Gemini 3.1 Pro Preview | 77.0 | 91.0 | 44.1 | 0.286 |
| Claude Sonnet 5 xHigh | 76.0 | 92.9 | 59.4 | 0.505 |
| DeepSeek V4 Flash 0731 (open) | 74.2 | 86.8 | 46.8 | 0.060 |
| GLM-5.2 (open) | 73.2 | 89.8 | 51.8 | 0.225 |
| DeepSeek V4 Pro (open) | 71.6 | 90.7 | 42.6 | 0.050 |

*Table 1. LiveBench 2026-06-25: selected models, overall/mathematics/agentic scores and cost per benchmark run. Source: livebench.ai, fetched 2026-08-13.*

### Finding 1: No Llama model ranks in the top 42

The LiveBench 2026-06-25 leaderboard contains 42 ranked entries. A direct query of the extracted rows for "Llama" or "Meta" returned zero matches; the highest-performing Llama-family model does not appear in the top 42. Meta is the only major laboratory with no top-42 presence. This is the decisive empirical basis for excluding Llama-family models from scientific reasoning paths. The mechanism commonly cited for this underperformance (training on social-media content) is not supported by Meta's public model documentation, which describes filtered CommonCrawl and curated STEM sources; the empirical gap stands regardless of mechanism.

### Finding 2: DeepSeek V4 Pro 0813 is the mathematics price-performance optimum

Among models with Mathematics score at least 93 (Claude Fable 5, GPT-5.6 Sol, GPT-5.5, Claude 5 Opus, GPT-5.6 Terra, DeepSeek V4 Pro 0813, Grok 4.6), the cost per benchmark run spans USD 0.044 (DeepSeek V4 Pro 0813) to USD 1.439 (Claude Fable 5) — a 33-fold range. DeepSeek V4 Pro 0813 scores 95.1 in Mathematics, within 1.1 points of the top mathematics score (GPT-5.6 Sol, 96.2), at 1/12 the cost. Its 1M-token context window (verified in the DeepChat provider configuration) supports whole-paper ingestion. On the mathematics axis it also outperforms the open-weights models with higher aggregate scores: Qwen 3.8 Max (Mathematics 91.3), Kimi K3 (84.4), and Smaug-Agentic (83.9). The cost advantage is 6-8x against those models.

### Finding 3: Open-weights models lead on agentic capability

The Agentic Coding axis inverts the mathematics ranking. Claude 5 Opus Thinking leads at 65.2, closely followed by open-weights models Qwen 3.8 Max (64.6) and Smaug-Agentic (64.6), then Kimi K3 (62.2). DeepSeek V4 Pro 0813 scores 54.9. For multi-step tool orchestration, subagent dispatch, and ensemble validation, the open-weights trio is preferred over the mathematics workhorse.

### Finding 4: The Workers AI free tier hosts science-capable open models

The Cloudflare Workers AI catalog (26 text-generation models) includes GLM-5.2 (Mathematics 89.8), Kimi K2.6 (262K context, vision-capable), QwQ-32B (reasoning), Qwen 2.5 Coder 32B, and GPT-OSS-120B. Direct inference calls confirmed all shortlisted models respond on the free tier (HTTP 200). This provides a zero-marginal-cost edge tier for bounded tasks, with the caveat that only Kimi K2.6 approaches long-context capability; the others are approximately 32K.

## Prioritization Framework

The tiering below is derived directly from the findings, with the mathematics axis treated as the program's primary discriminator.

**Tier S-MATH (default workhorse).** DeepSeek V4 Pro 0813: Mathematics 95.1 at USD 0.044/run, 1M context, already integrated into the DeepChat router. Selected over higher-aggregate open models because the program's discriminator is mathematics (gap of 3.8-11.2 points over Qwen/Kimi/Smaug) and the cost gap is 6-8x.

**Tier S-AGENTIC (orchestration).** Qwen 3.8 Max / Kimi K3 / Smaug-Agentic: all three outrank DeepSeek V4 Pro on both Agentic Coding (62.2-64.6 vs 54.9) and Overall (#5-7 vs #12), at USD 0.275-0.348/run. Preferred for multi-step agentic workflows; Claude 5 Opus (Agentic 65.2) is the premium orchestration option for high-stakes autonomous runs.

**Tier A (frontier verification, low volume).** Claude 5 Opus Thinking (Mathematics 95.7, Agentic 65.2), GPT-5.6 Sol (96.2), GPT-5.6 Terra Max (94.9 at USD 0.352 — 32 percent cheaper than Sol for near-equal mathematics), Grok 4.6 xHigh (93.1 at USD 0.228), Gemini 3.1 Pro (91.0). These provide 3-5 independent model families for cross-model convergence checks of scientific claims.

**Tier B (edge, zero marginal cost).** GLM-5.2, Kimi K2.6, QwQ-32B, Qwen 2.5 Coder 32B, GPT-OSS-120B via Workers AI free tier. Context limits (approximately 32K except Kimi K2.6 at 262K) restrict these to bounded tasks; they are unsuitable for whole-paper loads.

**Tier V (vision only).** Meta Llama 3.2 11B Vision for figure extraction and OCR, because the DeepSeek runtime has vision disabled. Llama is excluded from reasoning paths but retained for vision.

## Deployment

The framework was deployed to the production inference router (qnfo-ai worker) on 2026-08-13 as version 4.4.0. Changes: (1) added GLM-5.2, Kimi K2.6, and QwQ-32B to the tier-0 Workers AI model table; (2) set the general routing default from Qwen3-30B to GLM-5.2; (3) retained the existing policy that Llama-family models respond only to explicit requests. Deployment was executed via the Workers API, and verified by direct probes: the `/health` endpoint reported version 4.4.0 with all bindings present, and `/v1/models` enumerated 15 models including the three additions.

## Discussion

The framework separates the mathematics workhorse from the agentic orchestrator, a distinction that aggregate leaderboards obscure. The 33-fold cost spread within the frontier-mathematics class makes this separation economically material for a self-funded program: reserving Tier A models for a small fraction of calls (final verification, adversarial review) keeps monthly inference cost inside budget while retaining frontier capability.

Two limitations are noted. First, LiveBench cost per run is a benchmark-specific metric, not a monthly forecast; production cost depends on call volume and token mix. Second, the training-data mechanism often cited for Llama underperformance is not verified by this audit — only the empirical leaderboard gap, which is decisive for selection.

## Conclusion

For mathematics-heavy scientific research and agentic AI, the empirical ranking supports: DeepSeek V4 Pro 0813 as the default workhorse (Mathematics 95.1, USD 0.044/run, 1M context); Qwen 3.8 Max / Kimi K3 / Smaug-Agentic as the agentic orchestration tier; Claude 5 Opus, GPT-5.6, Grok 4.6, and Gemini 3.1 Pro as low-volume frontier verification; and GLM-5.2, Kimi K2.6, and QwQ-32B as the zero-marginal-cost edge tier. Llama-family models are excluded from scientific reasoning paths on empirical grounds. A re-audit is scheduled for the next LiveBench release (approximately December 2026).

## Declarations

**Funding:** Self-funded. **Conflicts of interest:** None. **Data availability:** Primary data (LiveBench leaderboard) is publicly available at livebench.ai; the Workers AI catalog is publicly available at developers.cloudflare.com/workers-ai/models; collection scripts and the deployed router configuration are available in the QNFO/qnfo-workers repository. **Code availability:** Router source and deployment artifacts in QNFO/qnfo-workers (tag qnfo-ai-v4.4.0). **Author contributions:** R.B.Q.-G. designed the evaluation criteria, performed the data collection, and authored the manuscript. **Ethics statement:** No human subjects; no proprietary data. **Reproducibility:** All scores are verifiable against the cited live sources; the extraction and verification protocol is described in Methods. **Artificial intelligence disclosure:** This manuscript was drafted with AI assistance and subjected to an independent adversarial review; all quantitative claims were verified against primary sources.

## References

1. LiveBench. Contamination-free LLM benchmark, release 2026-06-25. https://livebench.ai (accessed 2026-08-13).
2. Cloudflare. Workers AI models catalog. https://developers.cloudflare.com/workers-ai/models/ (accessed 2026-08-13).
3. Cloudflare. AI Gateway documentation. https://developers.cloudflare.com/ai-gateway/ (accessed 2026-08-13).
4. DeepSeek. API documentation. https://api-docs.deepseek.com/ (accessed 2026-08-13).
