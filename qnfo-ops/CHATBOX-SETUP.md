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

## Canonical limits (OPS-SETTINGS-IMMUTABLE-1)

| Model | context | max output | timeout |
|---|---|---|---|
| `ops-frontier` (DeepChat default) | 400000 | 128000 | 600000 |
| `ops-exec` | 1048576 | 393216 | 3600000 |
| `deepseek-v4-flash` | 1048576 | 393216 | 3600000 |

Relay / worker ceilings: `MODEL_CTX = 1048576`, `DEFAULT_MAX_OUT = 393216`,
`OPS_LOOP_DEADLINE_MS = 300000`, `cpu_ms = 300000`, workflow step timeout `15 minutes`.
These values are immutable; do not change them. Drift is enforced by
`scripts/ops-settings-guard.py` (canonical: `QNFO/qnfo-ops/scripts`).
