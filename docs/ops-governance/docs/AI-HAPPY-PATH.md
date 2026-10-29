# AI HAPPY PATH (QNFO) — canonical endpoints & models

**Status:** CANONICAL · **Created:** 2026-09-26 · one model per endpoint (ONE-MODEL-PER-ENDPOINT-1).
**Rule:** there is exactly ONE way to call QNFO AI. Do not guess, do not add a second path.

## 1. The three endpoints (verified live 2026-09-26)

| Purpose | Endpoint | Worker | Model id | Version |
|---|---|---|---|---|
| **QNFO** (research, papers, agent) | `https://ai.qnfo.org` | `qnfo-ai` | **`qnfo`** | 5.28.13-singlemodel |
| **PERSONAL** (personal twin / RAG) | `https://personal.qnfo.org` | `personal-api` | **`personal`** | 4.1.14-singlemodel |
| **OPS** (fleet / infra agent) | `https://ops.qnfo.org` | `qnfo-ops` | **`ops`** | 2.36.81 |

All three are OpenAI-compatible:
- `GET /v1/models` → returns **exactly one** entry.
- `POST /v1/chat/completions` → chat/agent. Any foreign model id is **accepted** and routed to the
  endpoint's single model (UNIVERSAL-OPENAI-MODEL-COMPAT-1); legacy ids are aliases, never advertised.

`qnfo-gateway` (qnfo.org landing/email) is **not** an AI endpoint — it has no `/v1/models`.

## 2. Client settings

- **DeepChat** (`AppData/Roaming/DeepChat/app-settings.json` + `app_db/agent.db` `app_settings`):
  `defaultModel` = `preferredModel` = `{providerId:"QNFO-OPS", modelId:"ops"}` — the OPS endpoint's
  single advertised model id (ONE-MODEL-PER-ENDPOINT-1). Guarded by `model_guard.py`.
  **CORRECT (reconciled 2026-09-27).** `AI-GATEWAY` is NOT in the DeepChat runtime provider registry
  (0 of 77 providers), so it is unresolvable as a default (`Provider AI-GATEWAY not found`); the
  DEEPCHAT-DEFAULT-MODEL-1 `AI-GATEWAY/openai/gpt-4.1` value is superseded by DEFAULT-KEY-OPS-1.
  (AI-GATEWAY remains available as an OPTIONAL provider — see `app-settings.json` `customProviders`.)
- **ChatBox** (`AppData/Roaming/xyz.chatboxapp.app/config.json`): must be **3 providers × 1 model**:
  `qnfo-router → https://ai.qnfo.org → qnfo`, `personal-twin → https://personal.qnfo.org → personal`,
  `qnfo-ops → https://ops.qnfo.org → ops`. **FIXED 2026-09-26** (was 6 providers incl. 3 workers.dev
  duplicates, carrying 104 stale model ids). Backup: `config.json.bak-happypath-*`.
- **Worker subdomains** (`qnfo-ai.q08.workers.dev`, `personal-api.q08.workers.dev`,
  `qnfo-ops.q08.workers.dev`) are the SAME endpoints; prefer the custom domains above.

## 3. Routing (backend — never exposed)

Per endpoint: free `@cf` tier first, then the cost-optimised paid tier, then the frontier fallback.
Routing is a back-end concern; clients only ever see the single public model id.

## 4. Do NOT

- Do NOT advertise more than one model per endpoint.
- Do NOT stand up a new AI worker for an existing purpose (see `service_registry`).
- Do NOT add new AI Gateway dynamic routes for the canonical path.
- Do NOT hard-code a model the endpoint does not serve — use the three model ids above.

**Maintenance clause:** every holistic cycle must confirm the three `/v1/models` still return exactly
one id each, and that both clients still show the three canonical entries.
