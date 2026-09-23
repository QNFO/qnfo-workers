# AI Gateway Unified Billing — single Cloudflare endpoint for agentic/coding LLM traffic

Status: SPEC + VERIFIED PATCH (branch `ops/aigw-unified-billing-2026-09-16`), 2026-09-16.
Owner: qnfo-ops. Evidence for every claim below is a live tool call or a Cloudflare doc page; nothing here is assumed.

---

## 1. Problem statement (user directive)

1.1 All agentic/code LLM API calls must go directly to Cloudflare AI Gateway.
1.2 One endpoint must route to DeepSeek / Anthropic / OpenAI (and the rest of the catalog).
1.3 Billing must be unified Cloudflare billing (AI Gateway credits), not per-provider API keys.
1.4 Prompt analytics + logging must feed the existing QNFO infrastructure (D1 / Vectorize / model ladder), which provider endpoints do not provide.
1.5 Reported spend: ~$1000/month on provider endpoints, dominated by DeepSeek plus Anthropic Sonnet/Opus when DeepSeek fails at system-wide audit/repair work.

---

## 2. Verified current state (2026-09-16)

### 2.1 The gateway already exists and is authenticated

2.1.1 Account: `edb167b78c9fb901ea5bca3ce58ccc4b` (`cloudflare-quniverse`, from `service_registry`).
2.1.2 Gateway id: `default` (auto-created on first request; the id `qnfo-infra` reads at runtime).
2.1.3 `qnfo-infra` v1.2.3 `collectState()` calls `GET /accounts/{acct}/ai-gateway/gateways/default` and
      `GET /accounts/{acct}/ai-gateway/gateways/default/logs?max_results=1000` — the gateway is the account's canonical one.
2.1.4 Unauthenticated probe of `https://gateway.ai.cloudflare.com/v1/{acct}/default/compat/chat/completions`
      returns `401 AiGatewayError code 2009` for every gateway name AND for a non-existent control account
      (`0000…`). The probe is therefore **not** an existence test — it only proves the gateway is
      *authenticated* (requires `cf-aig-authorization`). No existence claim is made from it.

### 2.2 Two workers already route through the gateway — for Workers AI models only

| worker | constant | call sites | models sent |
|---|---|---|---|
| `qnfo-ai` v5.28.0 | `GW_COMPAT = …/{acct}/default/compat/chat/completions` | lines 651, 1032, 1315 | `workers-ai/@cf/…` only |
| `personal-api` v4.0.0 | same | lines 271, 2292 | `@cf/…` only |

Both send `cf-aig-authorization: Bearer ${CF_API_TOKEN}`. Neither routes third-party providers.

### 2.3 `qnfo-ops` (this endpoint) still calls the provider directly

`qnfo-ops` v2.30.2: `DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"` (line 37) with
`Authorization: Bearer ${DEEPSEEK_API_KEY}` at lines 2158 (tool loop), 2236 (streaming relay), 2502 (agentic stream).
`UPSTREAM_MODEL = "deepseek-v4-flash"`, `UPSTREAM_CODE_MODEL = "@cf/moonshotai/kimi-k2.7-code"` (Workers AI, already cloud-billed).

### 2.4 Where the third-party traffic actually is

`ai_queries` (qnfo-audit), all-time by model — the only third-party rows are 4 calls from 2026-07-25
(`anthropic/claude-sonnet-5`, `anthropic/claude-opus-5`, `openai/gpt-5.2`).
Last 30 days: 2,570 calls, 15,948,860 input tokens, 1,538,532 output tokens, `SUM(cost_usd)` = **$0.0304**
(cost is only populated for `deepseek-v4-flash`; every other row logs 0, i.e. the fleet's own cost accounting is incomplete).

**Consequence (disconfirming evidence for the obvious reading of the request):** the fleet's *logged* model
spend is ~$11.58/month at list prices. The ~$1000/month is **not** fleet cron traffic — it is interactive
desktop/agent sessions driven with the user's own provider keys. A fleet-side gateway migration alone does
not move the $1000; the desktop/client path must point at the gateway too.

---

## 3. Target architecture

### 3.1 The single endpoint (REST API — current recommendation)

```
POST https://api.cloudflare.com/client/v4/accounts/edb167b78c9fb901ea5bca3ce58ccc4b/ai/v1/chat/completions
Authorization: Bearer ${CF_API_TOKEN}          # token needs Account > Workers AI > Read
Content-Type: application/json
cf-aig-gateway-id: default                     # required for @cf/ Workers AI models
```

Model naming: third-party `author/model` (`deepseek/deepseek-v4-pro`, `anthropic/claude-sonnet-5`,
`openai/gpt-5.6-sol`, `google/gemini-3.8-flash`, `xai/grok-4.6`), Workers AI `@cf/author/model`.
No provider keys. Third-party models are billed through Unified Billing.

Sibling endpoints (same auth, same billing):
- `POST /ai/v1/messages` — Anthropic Messages schema (Anthropic + other third-party; not `@cf/`).
- `POST /ai/v1/responses` — OpenAI Responses schema (agentic workflows; `@cf/` model-dependent).
- `POST /ai/run` — universal envelope `{model, input}`; all modalities; supports `options.background` + `webhookUrl`.
- Legacy (still live): `https://gateway.ai.cloudflare.com/v1/{acct}/default/compat/chat/completions` with
  `cf-aig-authorization`. Deprecated for single-model calls; required for `dynamic/{route}`.

### 3.2 Catalog-verified model map (docs `ai/models`, fetched 2026-09-16)

| fleet role | current id | gateway id | price in/out (per M) |
|---|---|---|---|
| ops workhorse (flash) | `deepseek-v4-flash` (direct API) | `@cf/deepseek-ai/deepseek-v4-flash-0731` (1.3M ctx, agentic, FC, reasoning) | $0.44 / $1.32 / cached $0.014 |
| deep reasoning | `deepseek-v4-pro` (direct API) | `@cf/deepseek-ai/deepseek-v4-pro-0813` (1M ctx) **or** `deepseek/deepseek-v4-pro` (third-party, 131.1K ctx) | WAI $1.32 / $3.96 |
| code mode | `@cf/moonshotai/kimi-k2.7-code` | unchanged (already Workers AI) | $0.95 / $4.00 |
| top tier | OpenRouter/Anthropic direct | `anthropic/claude-sonnet-4.5/4.6/5`, `claude-opus-4.5…4.8`, `claude-opus-5`, `claude-fable-5/5.1`, `claude-haiku-4.5` | provider pass-through + 5% |
| OpenAI tier | OpenRouter | `openai/gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.5`, `gpt-5.5-pro` | provider pass-through + 5% |

**Catalog gap (must not be papered over):** there is **no third-party `deepseek/deepseek-v4-flash`** in the
catalog — the only DeepSeek third-party entry is `deepseek/deepseek-v4-pro`. Flash is reachable only as the
Workers AI model above, at $0.44/$1.32 versus DeepSeek's direct off-peak $0.22/$0.66. That is a **2× price
increase** on the workhorse path; the win is billing/logging unification and caching, not unit price.

### 3.3 Unified Billing mechanics (docs `ai-gateway/features/unified-billing`, updated 2026-09-15)

- 5% fee on every credit purchase ($100 of credits ⇒ $105 charged). Provider inference pricing is pass-through, no markup.
- Credential precedence: provider key on the request → BYOK stored key (default alias) → Unified Billing credits.
- `byok_only: true` / dashboard "Require provider credentials" blocks the Unified Billing fall-through (returns 400 instead).
- Per-request `cf-aig-no-wholesale: true` prevents fall-through for one call; cannot relax the gateway setting.
- Workers AI billing per gateway: set to **Unified billing** to spend prepaid credits on `@cf/` models.
- Prepaid-credit requests to frontier models get higher rate limits.
- Credits can go negative; Cloudflare charges the card on file at the start of the following month.

---

## 4. Cost model (computed, `run_code`, prices from §3.2 and `model_ladder_models`)

Fleet volumes are real (`ai_queries`, 30d): 2.57M/1.07M flash in/out, 9.96M/0.027M kimi-code in/out, 3.42M/0.44M other.

| # | scenario | $/month |
|---|---|---|
| A1 | today: workhorse direct DeepSeek flash + kimi/glm on Workers AI | **11.58** |
| A2 | workhorse moved to `@cf/deepseek-ai/deepseek-v4-flash-0731` | 12.85 |
| A3 | A2 + 70% of input served from gateway cache | 6.50 |
| A4 | A1 + 70% input cached | 5.61 |
| B1 | A2 + 5% Unified Billing credit fee | 13.49 |

Per-session (300K in / 60K out — one long agentic coding session):

| option | $ |
|---|---|
| DeepSeek flash, direct off-peak | 0.106 |
| DeepSeek v4-pro, direct off-peak | 0.317 |
| DeepSeek v4-pro, WAI via gateway | 0.634 |
| glm-5.3 (WAI, 1.3M ctx) | 0.684 |
| Claude Sonnet-class | 1.80 |
| GPT-5.5-class | 3.30 |
| Claude Opus-class | 9.00 |

30 such sessions/month: Sonnet $54 · Opus $270 · glm-5.3 $20.52 · deepseek-v4-pro WAI $19.01.

**What $1000/month implies:** at a 70/30 in/out blend that is ≈ 152M tokens at Sonnet-class rates,
≈ 30M tokens at Opus-class rates, or ≈ 2.84B tokens at DeepSeek-flash rates — versus the fleet's logged
17.5M tokens/month. So the spend is frontier-model desktop work, and the leverage is (i) caching,
(ii) per-gateway spend limits, (iii) routing the hard 20% to WAI-hosted frontier-class models at 1/5 to 1/13
of Anthropic prices, not the 5% credit fee.

---

## 5. Implementation

### 5.1 Fleet workers (executable now)

Patch `qnfo-ops` (this endpoint) first — attached as `qnfo-ops/aigw-routing.patch`, generated against
`qnfo-ops/deployed-current.worker.js` @ VERSION 2.30.2, `node --check` clean (ESM), 78-line diff:

1. add `AIGW_URL` (`/ai/v1/chat/completions`), `AIGW_GATEWAY_ID = "default"`, `AIGW_MODEL_MAP`;
1. add `upstreamChat(env, body)` — POST to the gateway with `Authorization: Bearer ${CF_API_TOKEN}` +
   `cf-aig-gateway-id: default`, mapped model id; **on any non-ok response it falls through to the existing
   `api.deepseek.com` path with `DEEPSEEK_API_KEY`** (fail-open floor, no outage mode);
1. replace the 3 direct `fetch(DEEPSEEK_URL, …)` sites (2158 / 2236 / 2502) with `upstreamChat(env, …)`;
1. bump VERSION 2.30.2 → 2.31.0.
1.1 `AIGW_ENABLED=0` is the kill switch; absent = gateway-first.

Apply to `qnfo-ai` (line 18 `DEEPSEEK_URL`, plus a third-party branch for T3 classes) and
`personal-companion` / `qnfo-ai-calibration` the same way. Prefer one shared module over four copies.

### 5.2 Desktop / client path (the $1000 lever)

DeepChat provider entry (OpenAI-compatible), one provider replaces the per-provider keys:

```json
{
  "id": "QNFO-AIGW",
  "name": "Cloudflare AI Gateway (unified billing)",
  "type": "openai-compatible",
  "baseURL": "https://api.cloudflare.com/client/v4/accounts/edb167b78c9fb901ea5bca3ce58ccc4b/ai/v1",
  "apiKey": "<CF API token with Account>Workers AI>Read>",
  "models": [
    "anthropic/claude-sonnet-5", "anthropic/claude-opus-5", "anthropic/claude-fable-5.1",
    "openai/gpt-5.6-sol", "openai/gpt-5.6-luna", "openai/gpt-5.5",
    "deepseek/deepseek-v4-pro", "@cf/deepseek-ai/deepseek-v4-flash-0731",
    "@cf/zai-org/glm-5.3", "@cf/moonshotai/kimi-k2.7-code"
  ]
}
```

Anthropic-native tooling can use `…/ai/v1/messages` with the same token. Workers AI ids additionally need
`cf-aig-gateway-id: default`; if the client cannot send custom headers, use third-party ids only on that provider entry.

### 5.3 Analytics + logging feedback loop (the reason to move at all)

1. `qnfo-infra` already reads `GET /ai-gateway/gateways/default/logs?max_results=1000` and aggregates
   requests / tokens_in / tokens_out / cost per model — currently only snapshotted into `infra_state` + Vectorize `qnfo-infra`.
1. Add an hourly cron that syncs the log window into `qnfo-audit`:
   `ai_gateway_calls(id, ts, provider, model, status, tokens_in, tokens_out, cached_tokens, cost_usd, latency_ms, request_id, metadata)`
   with `UNIQUE(request_id)` for idempotency, plus a rollup view by day/model for `analytics_dash_gateway`.
2. Feed `model_ladder_budget` (per tier, per month) and `ai_gateway_failures` (error class by status) from the same sync —
   the ladder's escalation policy then runs on real gateway numbers instead of estimates.
3. Mirror prompt/response pairs into the existing `ai_queries` + Vectorize `qnfo-ai-log` so `history_recall`
   and the research corpus see agentic traffic too.
4. Set gateway spend limits (per model / per period) as the hard cost ceiling; set Workers AI billing to
   Unified billing on `default` so `@cf/` traffic draws from the same credit pool.

### 5.4 Verification gates before this is called done

1. `GET /accounts/{acct}/ai-gateway/gateways/default` returns the gateway with expected `collect_logs`,
   `log_management`, `spend_limits` and the credits balance.
2. One canary call per provider through `/ai/v1/chat/completions` returns 200 with `usage` populated
   (deepseek/deepseek-v4-pro, anthropic/claude-sonnet-5, openai/gpt-5.6-luna, @cf/deepseek-ai/deepseek-v4-flash-0731).
3. The same call appears in `GET …/logs` with a `request_id`, provider, model and cost.
4. `qnfo-ops /health` shows VERSION 2.31.0 and `ai_queries` shows a gateway-served row for the next chat.
5. Rollback: redeploy the previous version (or set `AIGW_ENABLED=0`); the direct path is untouched by the patch.

---

## 6. Failure modes / limitations (adversarial)

1. **Unit price goes up on the workhorse.** WAI-hosted DeepSeek flash is 2× DeepSeek direct off-peak; the
   third-party DeepSeek entry is pro-only. Unified Billing adds 5% on credits. The gateway is a
   *control-plane and accounting* win, not a per-token discount. If raw $/token is the only metric, do not migrate flash.
2. **Credit exhaustion is a hard failure mode.** Prepaid credits at zero ⇒ third-party calls fail; with the
   fail-open patch the fleet degrades to the direct key, which silently re-splits billing — watch `OPS_AIGW_FALLBACK` in logs.
3. **Permission gap.** `/accounts/{acct}/ai/*` requires *Workers AI > Read*; a token holding only *AI Gateway*
   permission returns 401 code 10000. The existing `CF_API_TOKEN` permission set has not been verified from this
   endpoint (no tool can introspect it) — gate 5.4.2 is the first real test.
4. **Model-id drift.** Fleet ids (`deepseek-v4-flash`) are not gateway ids; a wrong id fails as a 400/404 and
   would silently fall back to the direct path, masking the migration. Assert the served model in the response body.
5. **Streaming shape.** The compat/REST paths emit SSE `data:` frames; the relay's usage extraction
   (`stream_options.include_usage`) must be re-verified per provider, not assumed.
6. **Single point of failure.** One endpoint/one token for all providers; a revoked token or gateway
   misconfiguration affects every worker at once. Keep the direct-path floor and per-worker kill switches.
7. **Log retention/privacy.** Prompt logging on the gateway copies full prompts into Cloudflare logs; QNFO
   already logs prompts in `ai_queries`, but the gateway window is a second copy with its own retention — set it deliberately.
8. **Not verified from this endpoint:** whether the account has credits loaded, whether BYOK keys exist for
   deepseek/anthropic/openai on `default`, the token's permission set, and the live bundle's byte-parity with
   the repo mirror (see §7).

---

## 7. Why this ships as a patch + PR rather than a hot deploy (2026-09-16)

`cf_worker_read` returns only a ~6.5 KB prefix of the `qnfo-ops` bundle (reports `size: 6559`), while the repo
mirror is 233,907 bytes. Byte-parity between the deployed bundle and `qnfo-ops/deployed-current.worker.js`
therefore **cannot be verified from this endpoint**, and deploying the repo file blind would risk
DEPLOYED-BUT-UNCOMMITTED-DRIFT-1 regression on the worker that serves this session. Deploy path once
parity is provable (wrangler/CI, or a full-bundle read tool):

```
# after applying qnfo-ops/aigw-routing.patch to qnfo-ops/worker.js and deployed-current.worker.js
node --check deployed-current.worker.js   # ESM parse gate
# deploy with the repo's normal path, expected_version guard on 2.30.2
```

Tracked gaps filed to `agent_issues`: generic Cloudflare-API tool (read/write gateway config, credits, BYOK,
spend limits) and full-bundle read for parity verification.
