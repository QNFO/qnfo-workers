# QNFO-OPS in ChatBox (and DeepChat)

## ChatBox (Android/desktop — custom provider)
1. Settings → AI Providers → Add Custom Provider (OpenAI-compatible)
2. Name: QNFO Ops
3. API Host: https://qnfo-ops.q08.workers.dev/v1
4. API Key: OPS_ROUTER_AUTH_KEY value (see ~/.env mirror on the ops machine;
   never commit it)
5. Models (fetched from /v1/models or added manually): ops-exec, deepseek-v4-flash
6. Save. Choose "QNFO Ops / ops-exec" for ops/infra conversations.

Ops traffic then lands ONLY in qnfo-audit.ops_ai_log — never in the research feed.

## DeepChat
Provider "QNFO Ops" is registered in the app stores (providers + provider_models +
model_configs + Roaming app-settings.json). If it does not appear immediately,
restart DeepChat or trigger a provider/model refresh in Settings → Providers.
Model ids: ops-exec (default agent/tools), deepseek-v4-flash.
