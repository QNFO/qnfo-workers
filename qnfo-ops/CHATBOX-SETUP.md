# QNFO endpoints in ChatBox (and DeepChat)

All three Cloudflare endpoints are OpenAI-compatible and each advertises **exactly ONE
model id** (ONE-MODEL-PER-ENDPOINT-1). Do NOT use the builtin `chatbox-ai` models or any
direct third-party provider.

| Name | Base URL | Model | Context | Client max output |
|---|---|---|---|---|
| QNFO Ops | `https://ops.qnfo.org/v1` | `ops` | 1048576 | 65536 |
| QNFO Router | `https://ai.qnfo.org/v1` | `qnfo` | 1310720 | 32768 |
| Personal Twin | `https://personal.qnfo.org/v1` | `personal` | 1310720 | 200000 |

Legacy ids (`ops-exec`, `ops-frontier*`, `deepseek-v4-flash`, `auto`, `ensemble`, …) remain
accepted as server-side aliases, but the picker exposes only the single id above.

## ChatBox (Android / iOS / desktop — custom provider)
1. Settings → AI Providers → Add Custom Provider (OpenAI-compatible).
2. Name: `QNFO Ops`; API Host: `https://ops.qnfo.org`; API Path: `/v1/chat/completions`.
3. API Key: the `OPS_ROUTER_AUTH_KEY` value (from the ops machine's `~/.env` mirror; never commit it).
4. Model id: `ops` (fetched from `/v1/models`, or add manually). Cap the client max output at
   65536 to stop runaway replies.
5. Repeat for `QNFO Router / qnfo` (research, reasoning, RAG) and `Personal Twin / personal`
   (personal-life only — never mix with research).
6. Save. Use **Ops** for fleet/code/data, **Router** for research, **Personal** for personal life.

Ops traffic lands ONLY in `qnfo-audit.ops_ai_log` — never in the research feed.

## DeepChat
Provider "QNFO Ops" is registered in the app stores (`providers` + `provider_models` +
`model_configs` + Roaming `app-settings.json`). If it does not appear immediately, trigger a
provider/model refresh in Settings → Providers. Default model id: `ops`
(DEFAULT-KEY-OPS-1); `ops-exec` / `deepseek-v4-flash` are retained only as server-side aliases.

## Canonical server-side ceilings (OPS-SETTINGS-IMMUTABLE-1)

| Model | context | max output | timeout |
|---|---|---|---|
| `ops` (endpoint's single advertised id + default) | 1048576 | 393216 | 600000 |
| `ops-exec` (retired alias) | 1048576 | 393216 | 3600000 |
| `deepseek-v4-flash` (retired alias) | 1048576 | 393216 | 3600000 |

Relay / worker ceilings: `MODEL_CTX = 1048576`, `DEFAULT_MAX_OUT = 393216`,
`OPS_LOOP_DEADLINE_MS = 300000`, `cpu_ms = 300000`, workflow step timeout `15 minutes`.
These values are immutable; do not change them. The ChatBox *client* caps the Ops model's
requested output at 65536 (CLIENT-side only). Drift is enforced by
`scripts/ops-settings-guard.py` + `scripts/model_guard.py` (canonical: `QNFO/qnfo-ops/scripts`).
