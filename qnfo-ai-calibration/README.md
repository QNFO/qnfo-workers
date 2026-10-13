# qnfo-ai-calibration

Autonomous AI-endpoint calibration + stress-testing + self-heal (cloud-native, user-free).

- Cron: every 30 min (*/30 * * * *) + manual POST /run (Bearer QNFO_ROUTER_KEY).
- Sweeps: 18 concrete router models, vision x5, tools, stream, routing (auto/ensemble/unknown/boundary), qnfo-ops, personal-api, DeepSeek direct.
- Self-audit: every probe checked against behavioral expectations; roster checked against the live Workers AI catalog (ctx/vision/reasoning/tools).
- Self-correct: failures escalate in ai_model_health (degraded->failing at threshold 2); qnfo-ai consumes it for auto-routing deprioritization. Catalog drift writes live advertisement overrides + files an agent_issues ticket. Recovery auto-closes tickets.
- Self-improving: thresholds/vision set config-driven (ai_calibration_config); latency tracked; 7d/30d pruning.

Tables (qnfo-audit D1): ai_calibration_runs, ai_calibration_results, ai_model_health, ai_calibration_config, ai_calibration_truth.
Secrets: QNFO_ROUTER_KEY, OPS_KEY, PT_KEY, DEEPSEEK_KEY, CF_API_TOKEN.

## Task truth (CALIBRATION-TASK-TRUTH-1, 1.5.0, agent_issues 2338)
The error-correlation estimate (HRAW W-H1) needs, for the same item, a known answer and each model's right or wrong outcome;
the other tables hold reachability, one judge verdict per call, or an aggregate score. Once an hour (the second */30 tick of the
hour sees the first's rows and stops) every model in ALL_MODELS answers the same few integer sums, differences and products.
- **Items.** Operands come from a seed derived from the UTC hour; the code computes the expected value. No fixed list, nothing
  written by hand. `ai_calibration_config truth_probe_items` (0..5, default 2) sets the items an hour; 0 turns the probe off
  (about 20 router calls an hour at 2 items and 10 models).
- **Hedge off.** Every request carries `hedge: false`. Without it the router's fast lane (TURN-BUDGET-1: `max_tokens` <= 1024, no tools) races a llama leg, and in the first run 16 of 20 answers came from llama, not the model asked. `served_by` still records who answered.
- **Rows.** `ai_calibration_truth` (run_id, ts, item_id, model, expected, got, correct, served_by, latency_ms), one per item and
  model, created if missing, 30 days kept. A call that fails, or returns an empty reply (a reasoning model out of its 16 tokens),
  writes no row: it is not a wrong answer. A reply with text and no integer is wrong. `served_by` is the response's
  `_router.served_by` or its model.
- **GET /truth** (open, aggregate only): per model, answers and right answers; per pair of models over the last 7 days, n11, n10,
  n01, n00 and Cohen's kappa on right/wrong. A reply served by another model than the one asked stays in the table and is left out
  of the pair table, so a fallback never counts as the asked model's error.
- Tests: `task-truth.test.mjs`. Done when ai_calibration_truth has rows for at least two models on the same item within 24 h.
