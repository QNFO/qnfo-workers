# personal-api - Personal Twin (v2.0.0)

Rowan personal-assistant endpoint: personal-api.q08.workers.dev/v1 (OpenAI-compatible).
RAG + live-web + live-weather over the personal-life D1 + Vectorize archive.
Never calls the QNFO records oracle (PERSONAL-QNFO-SEPARATION-1).

## v2.0.0 (2026-09-02) upgrade for five complaints
1. Smarter: primary @cf/deepseek-ai/deepseek-v4-pro-0813 (was v4-flash-0731); tiers chat/pro/reason (r1-distill-qwen-32b); MAX_TOKENS 3200.
2. Context-aware: PROFILE PRIME (18 facets) + RECENT CROSS-THREAD ANSWERS always injected.
3. Real-time: live Amsterdam weather (Open-Meteo) on weather/outside + NOW(Amsterdam) header.
4. Personal: profile-facet grounding sourced in answers.
5. Predictive: GET /v1/today and /v1/brief (calendar today/tomorrow + open reminders/desires + weather).

## Bindings
AI (Workers AI), PERSONAL (D1 personal-life e8d6c61a-10b7-4086-b81e-9e6e85afa407), VZ (Vectorize personal-life).
Secrets: API_KEY (auth), CF_TOKEN (infra/analytics), INFRA_TOKEN.

## Deploy
CF API PUT /workers/scripts/personal-api (module multipart; main_module worker.js; keep_bindings ai,d1,vectorize).
