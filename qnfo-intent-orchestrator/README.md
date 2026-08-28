# qnfo-intent-orchestrator

Unified intent layer (Phase 1 of the QNFO unified-ecosystem architecture). The mechanism
that turns "express a desire" into automatic action, from any client (Chatbox MCP,
DeepChat MCP, PWA Express button, curl).

## Endpoints (all Bearer INTENT_TOKEN)

- `POST /intent` body `{"desire": "...", "source": "chatbox", "device": "windows"}`
  Classifies (glm-5.2 via qnfo-ai, rule fallback) and routes:
  - note -> embedded + stored in Vectorize (research: qnfo-ai-log doc=note; personal: personal-life doc=note), status done
  - task/event/email/reminder/research -> queued status pending with parsed due date
- `GET /intents?status=&limit=` list
- `GET /intents/stats` grouped counts
- `GET /digest?days=1` plain-text digest of recent intents
- `POST /digest/send` force-send digest email (Cloudflare Email Sending)
- Scheduled daily 06:00 UTC: auto digest email to DIGEST_TO

## Deploy

Secrets: INTENT_TOKEN (use KEY_QNFO), RT (KEY_QNFO), CF_TOKEN, CF_ACCOUNT,
DIGEST_TO (rowan.quni@outlook.com), DIGEST_FROM (agent@qnfo.org).
Bindings (API deploy metadata): AI, QNFO_AI service -> qnfo-ai, VZ_R -> qnfo-ai-log,
VZ_P -> personal-life, D1 -> qnfo-audit (35e2e573-92f3-46ac-83c6-22f6429fc5e5).
After deploy: POST /accounts/{acct}/workers/scripts/qnfo-intent-orchestrator/subdomain {"enabled": true}.

## Verify

```
curl -s -X POST https://qnfo-intent-orchestrator.q08.workers.dev/intent \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"desire":"remind me to prepare the QPL talk outline tomorrow","source":"cli"}'
curl -s -H "Authorization: Bearer $KEY" https://qnfo-intent-orchestrator.q08.workers.dev/intents
```
