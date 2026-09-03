# personal-api - Agentic Personal Twin (v3.0.4)

Rowan's personal-assistant endpoint: personal-api.q08.workers.dev/v1 (OpenAI-compatible).
RAG + live-web + live-weather over the personal-life D1 + Vectorize archive, now with an
AGENTIC TOOL LOOP. Never calls the QNFO records oracle (PERSONAL-QNFO-SEPARATION-1).

## v3.0.4 (2026-09-03) - harvest suppression
When the calendar_add tool succeeds in a request, the legacy chat-harvest no longer writes
duplicate event rows + notes into the personal-life store (red-team C4); the canonical row
is the calendar-api store copy.

## v3.0.3 (2026-09-03) - CAL_TOKEN auth header
All calendar-api service calls send Authorization: Bearer CAL_TOKEN (calendar-api v0.3.0
auth gate, red-team C1 fix). Secret CAL_TOKEN mirrors calendar-api's.

## v3.0.0 (2026-09-03) - agentic upgrade
- Tool loop in /v1/chat/completions: the model can take ACTIONS via a JSON tool-call
  protocol ({"tool_call":{"name":...,"args":{...}}}), up to 3 tool rounds + final answer.
- Tools (personal plane only): calendar_today, calendar_list, calendar_add, calendar_delete
  (confirm required), task_add, reminder_add, task_list, task_done, email_search,
  memory_add, memory_list, memory_forget, memory_search, weather, web_search, web_fetch,
  express, browse_recent, profile_get, activity_log.
- Calendar writes go to the canonical cloud calendar (calendar-api, plane=personal,
  via CAL_API service binding). Dedupe by exact title+day before insert.
- /v1/brief: full daily brief (weather, calendar today/tomorrow/7d, open tasks+reminders,
  recent emails, recent facts/notes) + ?summary=1 LLM narrative; prebuilt each morning by
  cron 5 5 * * * UTC (07:05 Amsterdam) into D1 daily_briefs (served fresh <3h).
- /v1/plan: "what should I do today" - profile-gated LLM plan over brief data (energy
  budget, tasting-menu, no-pigeonhole), JSON {plan, items[{title,when,why}]}, degraded
  data-only fallback.
- /v1/tools: tool registry introspection. /v1/tasks: task list by status.
- Streaming: stream:true streams the final answer (SSE); tool rounds run non-stream first;
  no-tool answers are served instantly from the buffered round-1 completion.
- Honest-failure guard: if the last tool call failed, the final-answer prompt forces the
  model to disclose the failure instead of claiming success (anti-confabulation).

## v3.0.3 (2026-09-03)
CAL_TOKEN auth header on every calendar-api service call (calendar-api v0.3.0 gate).

## v2.x history
- v2.1.1: twin calendar retrieval via CAL_API (QNFO.OPS.010 Stage C).
- v2.0.0 (2026-09-02): pro model primary (deepseek-v4-pro-0813), profile prime, live
  weather, sourced answers, /v1/today + /v1/brief.
- v1.6.x: durable memorized facts (cross-thread memory), fact harvest, streaming model
  fallback chain, recent-notes context.

## Models
personal-twin-chat (primary @cf/deepseek-ai/deepseek-v4-pro-0813, fallbacks
glm-5.3-flash, qwen3.8-27b), personal-twin-pro (glm-5.3 first), personal-twin-reason
(r1-distill-qwen-32b). MAX_TOKENS 3200 default, max_tokens is a ceiling (not a target).

## Bindings
AI (Workers AI), PERSONAL (D1 personal-life e8d6c61a-10b7-4086-b81e-9e6e85afa407),
VZ (Vectorize personal-life), CAL_API (service: calendar-api, production).
Secrets: API_KEY (auth), CF_TOKEN (infra/analytics), INFRA_TOKEN, CAL_TOKEN (calendar-api auth since v3.0.3).
New D1 tables (auto-created): tasks, daily_briefs.

## Routes (auth-gated except /health and the playground)
POST /v1/chat/completions (stream + tools), GET /v1/brief, /v1/today, /v1/plan,
/v1/tools, /v1/tasks, /v1/facts, /v1/stats, /v1/threads[/:id], /v1/retrieve,
/v1/embeddings, /v1/web/search, /v1/web/fetch, POST /v1/express, /v1/models.

## Deploy
wrangler deploy from this directory (canonical; all bindings in wrangler.toml,
cron trigger 5 5 * * *). Secrets persist across wrangler deploys. After deploy:
cp worker.js deployed-current.worker.js (FLEET-SELF-DOC-1 parity) + verify /health.

## Known limitations (2026-09-03 red-team)
- Twin cannot read qnfo-intent-orchestrator queue (INTENT_TOKEN not provisioned): tasks
  expressed via DeepChat MCP and tasks created via twin live in separate queues; the
  calendar is the shared surface (both promote into calendar-api).
- calendar-api is now AUTH-GATED (v0.3.0, CAL_TOKEN bearer; /health + /events.ics stay
  public by design). personal-api sends the header from its own CAL_TOKEN secret on every
  calendar-api call (calHeaders). The local Outlook bridge reads calendar/bridge/calendar-token.txt.
- /v1/plan is uncached (1-2 LLM calls); brief is D1-cached.
