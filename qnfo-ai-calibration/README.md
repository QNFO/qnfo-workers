# qnfo-ai-calibration

Autonomous AI-endpoint calibration + stress-testing + self-heal (cloud-native, user-free).

- Cron: every 30 min (*/30 * * * *) + manual POST /run (Bearer QNFO_ROUTER_KEY).
- Sweeps: 18 concrete router models, vision x5, tools, stream, routing (auto/ensemble/unknown/boundary), qnfo-ops, personal-api, DeepSeek direct.
- Self-audit: every probe checked against behavioral expectations; roster checked against the live Workers AI catalog (ctx/vision/reasoning/tools).
- Self-correct: failures escalate in ai_model_health (degraded->failing at threshold 2); qnfo-ai consumes it for auto-routing deprioritization. Catalog drift writes live advertisement overrides + files an agent_issues ticket. Recovery auto-closes tickets.
- Self-improving: thresholds/vision set config-driven (ai_calibration_config); latency tracked; 7d/30d pruning.

Tables (qnfo-audit D1): ai_calibration_runs, ai_calibration_results, ai_model_health, ai_calibration_config.
Secrets: QNFO_ROUTER_KEY, OPS_KEY, PT_KEY, DEEPSEEK_KEY, CF_API_TOKEN.
