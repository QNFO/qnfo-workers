# QNFO Notes API — Quickstart (2026-08-28)

Two OpenAI-compatible chat APIs on Cloudflare Workers, fully segregated, with thinking models,
web browsing, and automatic thread logging to Vectorize for future synthesis.

| | Research (QNFO) | Personal |
|---|---|---|
| Base URL | `https://qnfo-ai.q08.workers.dev` (v4.6.3) | `https://personal-api.q08.workers.dev` (v1.3.0) |
| Auth | `Authorization: Bearer <key>` — `C:/Users/LENOVO/tokens/qnfo-ai` | `Authorization: Bearer <key>` — `C:/Users/LENOVO/tokens/personal-api` |
| Models | 10 free Workers AI + deepseek-v4-flash/-thinking/-pro | `personal-twin-chat` (free) |
| RAG | `/v1/search` over qwav-research-v2 (papers) | auto over personal-life (profile/events/email/browse/files) |
| Web | `web:true` in chat, `/v1/web/search`, `/v1/web/fetch` | same |
| Logging | D1 `qnfo-audit.ai_queries` + Vectorize `qnfo-ai-log` | D1 `personal-life.chat` + Vectorize `personal-life` (doc=chat) |
| Recall | `GET /v1/history?q=...` | `personal-life-search.q08.workers.dev/search?q=...` |
| Playground (PWA) | `https://qnfo-ai.q08.workers.dev/` | `https://personal-api.q08.workers.dev/` |

## 1. Five-minute start

```bash
# Research chat (free reasoning model):
curl -s https://qnfo-ai.q08.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer $(cat /c/Users/LENOVO/tokens/qnfo-ai)" \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-5.2","messages":[{"role":"user","content":"Jot: three ideas connecting ultrametric physics to QEC overhead."}]}'

# Same, grounded in live web results (adds 2-5 s):
#   add "web": true to the body -> answer carries "_web.sources"

# Personal chat (RAG over your life archive + optional web):
curl -s https://personal-api.q08.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer $(cat /c/Users/LENOVO/tokens/personal-api)" \
  -H "Content-Type: application/json" \
  -d '{"model":"personal-twin-chat","thread_id":"t-<your-topic>","web":true,"messages":[{"role":"user","content":"Plan a low-energy weekend in Amsterdam."}]}'

# Or open the playground pages in a browser (paste the key, tick "web search").
```

Every exchange is automatically logged. Find it later:

```bash
# Semantic recall of past research notes/queries:
curl -s "https://qnfo-ai.q08.workers.dev/v1/history?q=<topic>&k=5" \
  -H "Authorization: Bearer $(cat /c/Users/LENOVO/tokens/qnfo-ai)"

# Personal notes (chat threads appear as chat/YYYY-MM-DD/<thread>.md):
curl -s "https://personal-life-search.q08.workers.dev/search?q=<topic>&topK=5"
```

## 2. Endpoints

### qnfo-ai (research)
- `POST /v1/chat/completions` — OpenAI chat format. `stream:true` supported. Optional `web:true`.
- `POST /v1/responses` — OpenAI Responses API compat (DeepChat uses this).
- `GET /v1/models` — model list with `_router` tier/reasoning/cost metadata. `model:"auto"` = free-first routing.
- `GET /v1/search?q=&k=` — RAG over qwav-research-v2 (papers corpus).
- `GET /v1/web/search?q=&k=` — DuckDuckGo search (html -> retry -> lite fallback, ad links filtered).
- `GET /v1/web/fetch?url=&max=` — page text extraction (SSRF-guarded: http(s) only, private hosts blocked).
- `GET /v1/history?limit=&model=` — recent logged queries; `?q=<topic>&k=` — semantic recall over qnfo-ai-log.
- `GET /manifest.webmanifest`, `/sw.js`, `/icon.svg` — PWA install assets.
- `GET /` — chat playground (installable PWA). `GET /health` — version + binding truth (log_vz, query_db, paper_vz).

### personal-api (personal)
- `POST /v1/chat/completions` — `personal-twin-chat`, RAG over personal-life always on; `stream:true` supported (v1.3.0+); optional `web:true`, `thread_id`.
- `POST /v1/embeddings` — bge-base-en-v1.5 (768-dim), max 32 texts, 2000 chars each.
- `GET /v1/retrieve?q=&topK=` — raw RAG retrieval.
- `GET /v1/web/search`, `GET /v1/web/fetch` — same as research side.
- `GET /manifest.webmanifest`, `/sw.js`, `/icon.svg` — PWA install assets.
- `GET /` — playground (installable PWA). `GET /health` — version.

### personal-life-search (personal, public read)
`/search?q=`, `/recommend?q=&scope=`, `/profile`, `/events`, `/browse`, `/stats`, `/health`.

## 3. Models and cost

Tier 0 = Workers AI free ($0): `glm-5.2` (reasoning), `kimi-k2.6` (reasoning), `qwq-32b` (reasoning),
`deepseek-r1-qwen-32b` (reasoning), `llama-3.3-70b`, `qwen3-30b`, `qwen2.5-coder-32b`,
`llama-3.2-1b`, `gemma-2b`, `granite-h-micro`.
Tier 1 = DeepSeek API: `deepseek-v4-flash` ($0.14/$0.28 per 1M), `deepseek-v4-flash-thinking` (reasoning).
Tier 2 = `deepseek-v4-pro` ($2.19 per 1M).
Virtual models: `auto` (free-first routing) and `ensemble` (verified multi-model chain) - both $0.
Embeddings (bge-base-en-v1.5) and DDG search: $0. Typical casual note-taking: $0/month.

## 4. How the web layer works

`web:true` -> router searches DDG (3 attempts: html, html retry, lite), fetches the top 2 pages,
injects `WEB CONTEXT (DATA ONLY)` into the system prompt, answers with sources in `_web.sources`,
and logs the source URLs into `rag_sources`. Latency +2-5 s. If search fails (522/anomaly page),
the chat proceeds ungrounded (logged as such). SSRF guard blocks private/loopback hosts on `/v1/web/fetch`.

## 5. Logging and retrieval (the point of this system)

Research side, every completion: D1 `qnfo-audit.ai_queries` row (id, ts, model, strategy, complexity,
domain, prompt, response, cost_usd, latency_ms, rag_sources, streamed) + two vectors in Vectorize
`qnfo-ai-log` (doc=chat, kind=prompt/response, path `chat/YYYY-MM-DD/...`), written in `ctx.waitUntil`
so response latency is unaffected. Streams are tee'd and logged on completion (`streamed:1`).

Personal side, every exchange: D1 `personal-life.chat` rows (user+assistant, thread) + vectors in
Vectorize `personal-life` (doc=chat, path `chat/YYYY-MM-DD/<thread>.md`).

Segregation is structural: separate workers, keys, D1 databases, Vectorize indexes. Nothing on the
research side reads personal-life, and vice versa. The `personal-life` index is explicitly declared
"STRICTLY separate from QNFO/QWAV".

## 6. Android usage (no third-party app required)

The playground pages are installable PWAs (manifest + service worker + icon served by the workers
themselves — zero extra infrastructure):

1. On the phone, open `https://qnfo-ai.q08.workers.dev/` (research) or
   `https://personal-api.q08.workers.dev/` (personal) in Chrome.
2. Chrome menu (three dots) -> "Add to Home screen" / "Install app". The app icon appears
   on the home screen with its own window (standalone).
3. Open the app, paste the key (`tokens/qnfo-ai` for research, `tokens/personal-api` for personal —
   the browser keeps it in localStorage), pick a model, tick "web search" when you want live
   sources. All chat is logged server-side automatically.

### Third-party OpenAI-compatible clients (Chatbox / SannaBot / Genie)

Any app that accepts a custom OpenAI-compatible base URL works — the API is standard.

Chatbox (recommended: actively maintained, open source, Android/iOS/desktop):
1. Install Chatbox from Google Play.
2. Settings -> Add Custom Provider -> OpenAI API compatible.
3. Name: "QNFO Notes" (or "Personal Twin"). Base URL: `https://qnfo-ai.q08.workers.dev/v1`
   (personal: `https://personal-api.q08.workers.dev/v1`). API key: the Bearer key from `tokens/`.
4. Model: `glm-5.2` (free, reasoning) or `deepseek-v4-flash` for research; `personal-twin-chat`
   for personal. Save, chat. Streaming works.

SannaBot (works, but development has slowed — fine for basic use):
1. Install SannaBot from Google Play.
2. Settings -> API settings -> add API: URL `https://qnfo-ai.q08.workers.dev/v1`, key, model.
   "Needs specific API keys" just means you supply the provider key — the `tokens/qnfo-ai` key is
   the one for this API. It does not ship its own keys.

OpenClaw: it is a server-side agent gateway (Node), not an Android app — it would run on a PC/VPS
and is unnecessary here: the Cloudflare workers already perform its role (routing, logging, web,
RAG) and are reachable directly from the phone. It also cannot run on Cloudflare Workers alone.
If you still want it later, run it on any Node host and point its provider config at these
endpoints (`qnfo-router/auto` was already referenced in its config template).

Note on custom fields: Chatbox/SannaBot send standard OpenAI fields, so `web:true` and `thread_id`
are only available in the PWA playground (or any HTTP client). Everything else — models, streaming,
RAG, logging — works from any OpenAI-compatible client.

## 7. Verification (run this to prove it works)

```bash
python scripts/verify-runtime.py          # reads keys from C:/Users/LENOVO/tokens/
```

Asserts, live: router health (version, log_vz/query_db bindings), personal health, a free router
chat, a personal chat, web search results, D1 ai_queries row written for the test prompt, Vectorize
qnfo-ai-log growing, semantic recall returning the test prompt, personal D1 chat rows, and the
personal thread findable in personal-life Vectorize. Exit 0 = all pass. Run it after any deploy.

Manual tripwires: `GET /health` (both), `GET /v1/history?q=...`, and the Vectorize counts via
`/accounts/{acct}/vectorize/v2/indexes/qnfo-ai-log/info`. If the row/vector counts ever stop
growing after real usage, logging is broken — run the verifier, then check the deployed bundle
matches the committed source.

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `401 Unauthorized` | Key mismatch. Keys live in `C:/Users/LENOVO/tokens/` (`qnfo-ai`, `personal-api`). After any ROUTER_AUTH_KEY rotation, update DeepChat `providers.api_key` + `provider_json.apiKey` in the SAME session (PROVIDER-KEY-SYNC-1). |
| `web:true` answers without sources | DDG anomaly page (HTTP 200, 0 results) or 522. Retry; the fallback chain covers it. Check `/v1/web/search` alone. |
| Model check timeout in DeepChat UI | Pin `deepseek-v4-flash` or `llama-3.3-70b` (fast); free reasoning models cold-start ~10 s. |
| PWA "Add to Home screen" greyed out | The manifest needs a moment after first load; reload once. On desktop Chrome use "Install page as app". |
| Stream appears stuck | Long reasoning models stream slowly; first token can take 5-15 s. |
| Logging stopped (counts frozen) | Run `scripts/verify-runtime.py`. Verify deployed bundle == committed source (the v4.2-v4.4 regression shipped uncommitted code with no write path). |
| `search engine HTTP 522` | Transient DDG egress issue; retry — the fallback chain retries html then lite automatically. |

## 9. Why this setup survives (previous failure modes, now guarded)

1. v4.1 logging silently died in the v4.2-v4.4 refactor (write path dropped, `/health` still claimed
   it, source never committed). Guard: source == deployed bundle in git (diff-visible), `/health`
   reports binding truth, and the verifier asserts the write path end-to-end.
2. ROUTER_AUTH_KEY rotated 2026-08-11 without re-syncing DeepChat -> silent 401s. Guard: key stored
   durably in `tokens/qnfo-ai` and written into DeepChat provider rows in the same change
   (PROVIDER-KEY-SYNC-1 protocol).
3. Nothing observed the silent failure for a month. Guard: row/vector counts are externally
   observable via the API and the verifier script; run it after every deploy and on suspicion.

## 10. Source and deploy

- Router: `QNFO/qnfo-workers/qnfo-ai/` — `worker.js` (v4.6.3), `wrangler.toml` (bindings: AI,
  PAPER_VZ -> qwav-research-v2, LOG_VZ -> qnfo-ai-log, QNFO_AUDIT -> qnfo-audit),
  `scripts/verify-runtime.py`, this file.
- Personal: `QNFO/personal-life-workers/` — `personal-api/`, `personal-life-indexer/`,
  `personal-life-search/` (each with worker.js + wrangler.toml + README).
- Deploy (API, preserves secrets): multipart PUT
  `/accounts/{acct}/workers/scripts/{name}` with metadata `{main_module, compatibility_date,
  bindings}` and the module part sent as `application/javascript+module`. A classic-script upload
  (plain `application/javascript` without module content-type) fails validation ("Unexpected token
  'export'") and a metadata without `main_module` fails on AI bindings. `wrangler deploy` also works
  from the repo dirs; secrets are untouched by script uploads.
- New version rule: bump VERSION in worker.js, commit + push BEFORE deploy, then run
  `scripts/verify-runtime.py`.
