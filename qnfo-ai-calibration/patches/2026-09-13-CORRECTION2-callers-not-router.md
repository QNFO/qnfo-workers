# CORRECTION 2 — P0-1 is inverted: the callers send code to flash, not the router

Date: 2026-09-13 (qnfo-ops / ops-exec)
Corrects: `patches/2026-09-13-model-depth-and-code-routing.md` P0-1 and P0-2.

P0-1 said: *"Add an explicit domain='code' → code-model rule in qnfo-ai's router. Currently
`auto` sends 71.7% of it to flash."* I read the router source and the `ai_queries` schema. Both
halves of that sentence are wrong. A router rule would fix **none** of the traffic I measured.

---

## 1. `ai_queries` records strategy, and it distinguishes caller from router

Schema (from `SELECT *`): `id, ts, model, strategy, complexity, domain, prompt, response,
prompt_tokens, completion_tokens, cost_usd, latency_ms, rag_sources, streamed, source, ua`.

- `strategy = "auto"` → the router chose the model.
- `strategy = "single"` → the **caller named the model**; the router did not route.
- `model` is the **resolved** model. `domain` is the router's `classify()` output.

## 2. The measurement

`ai_queries WHERE domain='code'`, grouped by `(strategy, model)`:

| strategy | model | n |
|---|---|---|
| **single** | **deepseek-v4-flash** | **180** |
| auto | ensemble | 27 |
| single | ensemble | 19 |
| single | glm-5.2 | 8 |
| auto | qwen2.5-coder-32b | 5 |
| auto | deepseek-v4-pro-wa | 4 |
| auto | gpt-oss-120b | 2 |
| auto | kimi-k2.7-code | 2 |
| auto | qwen3-30b | 2 |
| single | glm-5.3-flash | 2 |
| single | qwen3-30b | 2 |

Cross-check: `WHERE domain='code' GROUP BY complexity, strategy` → `high/single = 211`,
`high/auto = 42`. Total 253. ✔

**The router's `auto` path handles 42 of 253 code queries (16.6%), and sends zero of them to
`deepseek-v4-flash`.** The 180 flash queries — the 71.2% I built P0-1 on — are all
`strategy="single"`: **callers explicitly requesting `deepseek-v4-flash`.**

## 3. Why the router would not have done that anyway

Verbatim from the live bundle (`qnfo-ai/deployed-current.worker.js`, sha `9b536969240684bea3acc017b5877c6d05d7488c`, `VERSION = "5.21.3"`):

```js
function classify(prompt) {
  ...
  if (/\b(code|javascript|python|typescript|function|api|bug|debug|compile|sql|regex)\b/.test(p)) {
    domain = "code"; complexity = "high"; verifiability = "self";
  }
  ...
}
function shouldEnsemble(cls) { return cls.uncertainty === "medium" || cls.complexity === "high"; }
var ENSEMBLE_POOL = {
  code: ["@cf/moonshotai/kimi-k2.7-code"],   // frontier coder as the sole code leg
  science: [...], general: [...]
};
```

`domain="code"` ⇒ `complexity="high"` ⇒ `shouldEnsemble()` true ⇒ ensemble, whose code pool is
`kimi-k2.7-code`. The router **already** prefers a frontier coding model for code. The 27
`auto/ensemble` rows are that path working.

So the router is not the defect. **Adding a code rule to `classify()`/target selection would
change nothing for 71.2% of measured code traffic**, because those requests never enter the
routing path.

## 4. The fix is client-side — but the client is unidentifiable

`source` and `ua` on `ai_queries` are **NULL for 251 of 253 rows** (2 rows carry `source="other"`).
The audit trail records no caller identity, so "which worker or client sends code work to
`deepseek-v4-flash`" **cannot be answered from this endpoint's data.**

That is itself the blocking defect for this mandate: the routing metric is measurable, the
responsible caller is not. Populating `source`/`ua` on the router's telemetry insert is the
prerequisite for enforcing "route code to depth models".

## 5. P0-2 was aimed at models that are not in this router

I listed `llama-3.2-1b`, `gemma-2b`, `granite-h-micro`, `@cf/google/gemma-2b-it-lora` for
removal. **None of them appear in `qnfo-ai`'s `MODELS` roster.** The live roster is 18 entries:

tier 0 — `deepseek-r1-qwen-32b`, `qwen3-30b`, `qwen2.5-coder-32b`, `glm-5.2`, `kimi-k2.6`,
`qwq-32b`, `glm-4.7-flash`, `gemma-4-26b`, `glm-5.3-flash`, `gpt-oss-120b`,
`deepseek-v4-flash-wa`, `deepseek-v4-pro-wa`, `kimi-k2.7-code`, `glm-5.3`, `llama-3.2-11b-vision`;
tier 1 — `deepseek-v4-flash`, `deepseek-v4-flash-thinking`; tier 2 — `deepseek-v4-pro`.

My list came from account-level Workers AI usage, not the router registry. The genuinely
low-capability entries **in this roster** are:

| model | why it is a candidate | registry facts |
|---|---|---|
| `qwq-32b` | 24k ctx, no tools, no vision | `ctx: 24000, tools: false, vision: false` |
| `qwen2.5-coder-32b` | no tools, no reasoning; 12,516 recorded `content-shape` gateway 400s | `tools: false, reasoning: false, maxOut: 16384` |
| `llama-3.2-11b-vision` | vision-only, 4k output cap | `maxOut: 4096, tools: false, vision: true` |

`kimi-k2.7-code` is described in the roster's own comment as *"$0.95/M 262k-ctx frontier
coding (reasoning + vision)"* — the fleet already owns and wires a frontier coder.

## 6. Still-live, still-unapplied: the `qwq-32b` one-token defect

`ROUTER-CTX-GAP-2.md` (2026-09-11) documented this and marked it **CONFIRMED IN SOURCE, NOT
DEPLOYED**. I re-read the live bundle today — **still present**:

```js
const big = MODELS["glm-5.3-flash"];
if (big && spec.wa !== big.wa && estInput + out <= modelCtx(big) - CTX_SAFETY_MARGIN) {
  return "qwq-32b";
}
```

The guard tests `glm-5.3-flash` (1,310,720 ctx); the `return` ships `qwq-32b` (**24,000** ctx).
Any request whose total exceeds its tier-0 target's window but fits 1.31M is routed to a 24k
model. Fix is one token: `return "glm-5.3-flash";`.

Note the sha moved: that doc recorded `qnfo-ai/worker.js` = `32380028…`; the live bundle is now
`9b536969…`. **The router was redeployed since 2026-09-11 and this fix still did not go in.**

Secondary, same function, still live:
```js
return cls.domain === "science" ? "deepseek-v4-flash-thinking" : "deepseek-v4-flash";
```
`deepseek-v4-flash-thinking` is `tools: false`, so a science-domain overflow on a tool-carrying
request silently loses tool access.

## 7. What this changes

| Item | Was | Now |
|---|---|---|
| P0-1 | add a router code rule | **drop.** Router is not the defect; callers are. Blocked on `source`/`ua` being NULL |
| P0-2 | remove 1B–3B/LoRA models | **retarget** to `qwq-32b`, `qwen2.5-coder-32b`, `llama-3.2-11b-vision` (the actual roster) |
| New P0 | — | fix `return "qwq-32b"` → `"glm-5.3-flash"` (one token, verified live, ~11 of 15 tier-0 targets misroute) |
| New P0 | — | populate `ai_queries.source`/`ua` so the flash-for-code caller becomes identifiable |

## 8. Limits

- I read the live bundle only to the 32,768-char read cap of a 143,771-byte file, so I did **not**
  see the target-selection function that consumes `cls`. §3 infers the code path from
  `classify` → `shouldEnsemble` → `ENSEMBLE_POOL.code`; the call site was not read.
- `strategy="single"` is my reading of the column's semantics from its values. I did not read the
  code that writes it. If `single` can also be emitted on a router-chosen fallback, the §2
  conclusion weakens — that is the one assumption this correction rests on.
- `source`/`ua` being NULL is confirmed; *why* they are NULL is not.
