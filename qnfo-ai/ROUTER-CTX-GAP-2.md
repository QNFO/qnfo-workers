# ROUTER-CTX-GAP-2 — `contextAwareTarget` returns the 24k-context model its own comment declares unfit

**Status: CONFIRMED IN SOURCE. NOT DEPLOYED.** Discovered 2026-09-11.
Target: `qnfo-ai` (live VERSION `5.21.3`, fleet_status service-binding probe http 200).
Files: `qnfo-ai/worker.js` (canonical, sha `32380028b9c0f26e95bcfbb49a14c58905b487e5`) and
`qnfo-ai/deployed-current.worker.js` — byte-identical twins, both `VERSION = "5.21.3"`.

Precedent for this doc type: `ROUTER-CONTEXT-GAP-1.md` (same directory).

## 1. Defect (verbatim, present in both files)

```js
  const big = MODELS["glm-5.3-flash"];
  if (big && spec.wa !== big.wa && estInput + out <= modelCtx(big) - CTX_SAFETY_MARGIN) {
    return "qwq-32b";
  }
```

The comment immediately above it:

```js
    // C-1 2026-09-04: upgrade target re-pointed qwq-32b (24k ctx, would never fit) -> glm-5.3-flash
  // (1.31M ctx, $0.15/M, vision+reasoning+tools) - the cheapest big-ctx tier-0 model.
```

The guard tests **glm-5.3-flash's** capacity, the comment declares **qwq-32b** unfit
("24k ctx, would never fit"), and the `return` ships **qwq-32b**. The C-1 fix was applied to the
guard and the comment but never to the return statement.

Registry facts (verbatim from `MODELS`):
- `qwq-32b`: `ctx: 24000`, `tools: false`, `vision: false`
- `glm-5.3-flash`: `ctx: 1310720`, `tools: true`, `vision: true`

Branch window: total budget `estInput + out` in `(ctx_target − 512, 1310208]`.

## 2. Quantification (run_code, this session)

`CTX_SAFETY_MARGIN = 512`, `modelCtx(spec) = spec.ctx`, `MAX_OUT` per registry.

| target | ctx | enters branch | min total at entry | overflow vs qwq's 24k |
|---|---|---|---|---|
| deepseek-r1-qwen-32b | 80000 | yes | 79,489 | 55,489 |
| qwen3-30b | 32768 | yes | 32,257 | **8,257** |
| qwen2.5-coder-32b | 32768 | yes | 32,257 | **8,257** |
| glm-5.2 | 262144 | yes | 261,633 | 237,633 |
| kimi-k2.6 | 262144 | yes | 261,633 | 237,633 |
| qwq-32b | 24000 | yes | 23,489 | −511 (no-op) |
| glm-4.7-flash | 131072 | yes | 130,561 | 106,561 |
| gemma-4-26b | 256000 | yes | 255,489 | 231,489 |
| gpt-oss-120b | 128000 | yes | 127,489 | 103,489 |
| deepseek-v4-pro-wa | 1048576 | yes | 1,048,065 | 1,024,065 |
| kimi-k2.7-code | 262144 | yes | 261,633 | 237,633 |
| llama-3.2-11b-vision | 128000 | yes | 127,489 | 103,489 |
| glm-5.3-flash | 1310720 | no (is `big`) | — | — |
| deepseek-v4-flash-wa | 1310720 | no (window empty) | — | — |
| glm-5.3 | 1310720 | no (window empty) | — | — |

**12 of 15 tier-0 targets enter the branch; 11 are already over qwq-32b's 24k window on entry**
(the 12th is `qwq-32b` itself → returns itself, harmless). Smallest guaranteed overflow **8,257
tokens**; widest misroute window **1,286,719 tokens** of total budget. Headroom gap
glm-5.3-flash vs qwq-32b = **1,286,720 tokens**.

Effect: any request whose estimated total exceeds its tier-0 target's context window (but fits
1.31M) is routed to a 24,000-token model. Outcome is upstream 400 / router 502, or silent
truncation — see limits for which.

## 3. Fix (one token)

```diff
-    return "qwq-32b";
+    return "glm-5.3-flash";
```

`big` is literally `MODELS["glm-5.3-flash"]`, so the return now matches the guard and the comment.
Bump `VERSION` `5.21.3` → `5.21.4` (DEPLOY-VERIFY-VERSION-1). Apply to **both** files
(README-deploy.md step 4: `cp worker.js deployed-current.worker.js`).

Pre-apply anchor check — must be exactly 1:
```
grep -c 'return "qwq-32b"' qnfo-ai/worker.js
```

## 4. Secondary defect — separate hunk, behaviour-changing, needs review

```js
  return cls.domain === "science" ? "deepseek-v4-flash-thinking" : "deepseek-v4-flash";
```

`deepseek-v4-flash-thinking` is `tools: false` in `MODELS`. A science-domain overflow on a
tool-carrying request therefore silently loses tool access (cannot call `run_code`). Minimal fix:
always return `deepseek-v4-flash` (tier 1, `ctx: 1048576`, `tools: true`). Correct fix: thread a
`hasTools` flag into `contextAwareTarget` — **do not write blind**: the call site was not read
(see limits), so the signature change is unverified.

## 5. Binding reality — the documented "22" is stale

`qnfo-ai/wrangler.toml` carries **15** bindings: `AI`, `PAPER_VZ`, `LOG_VZ`, `NOTES_VZ`,
`TASKS_VZ`, `HANDOFFS_VZ`, `INFRA_VZ`, `CLOUD_OPS_VZ`, `IPATENT_VZ`, `QNFO_AUDIT`, `QNFO_INFRA`,
`CAL_API` (v5.14.0), `QNFO_INTENT`, `MEDIA` (v5.19.0), `LOADER` (v5.20.0).

Not in the toml: **8 secrets** (`CF_API_TOKEN`, `DEEPSEEK_API_KEY`, `EMAIL_API_KEY`,
`INFRA_TOKEN`, `INTENT_TOKEN`, `ROUTER_AUTH_KEY`, `ROUTER_AUTH_KEY_2`, `SOCIAL_TOKEN`) and
**2 service bindings** (`EMAIL` → qnfo-email, `SOCIAL` → qnfo-social).

Inferred live binding count = 15 + 8 + 2 = **25**. `ROUTER-CONTEXT-GAP-1.md` (written 2026-09-01
at v5.7.0) lists **22** — stale by exactly the three added since (`CAL_API`, `MEDIA`, `LOADER`).
A read-back check against "22" would report false drift.

**Doc contradiction:** `ROUTER-CONTEXT-GAP-1.md` says "wrangler.toml does NOT carry the
service/secret bindings — a bare wrangler deploy would DROP them." `README-deploy.md` (2026-09-03)
says "wrangler.toml carries all bindings; secrets are preserved." The toml read this session
adjudicates: **`README-deploy.md` is wrong as written.** wrangler preserves secrets (stored
separately) but `EMAIL` and `SOCIAL` are service bindings absent from the toml and would be
dropped by a bare `wrangler deploy`.

## 6. Deploy runbook — NOT executable from the qnfo-ops chat endpoint

Requires a CF-API write channel or an authenticated wrangler host. See limits §8.

1. Anchor check (§3) — expect 1.
2. Capture live binding truth:
   `GET /accounts/edb167b78c9fb901ea5bca3ce58ccc4b/workers/scripts/qnfo-ai/settings`
   Record the binding count. Expect 25.
3. Backup bundle: `GET /accounts/{acc}/workers/scripts/qnfo-ai` → save.
4. Apply the §3 replacement to both files; bump VERSION to `5.21.4`.
5. Deploy — **Option A (wrangler)**: from `qnfo-ai/`, `wrangler deploy`. Re-assert `EMAIL` and
   `SOCIAL` or they drop. **Option B (CF API PUT, per ROUTER-CONTEXT-GAP-1.md)**: multipart with
   metadata re-asserting all live bindings; secrets must be *referenced*, not inlined — a prior
   attempt failed with error **10021** ("secret_text in metadata", red-team 2026-09-09).
6. Read back settings → binding count must equal step 2. If lower, roll back immediately.
7. Poll `/health` until `VERSION == "5.21.4"`. Note `/health` is **not** reachable via `web_fetch`
   from qnfo-ops (HTTP 404, reproduced this session); verify via service binding — `fleet_status`
   reports `qnfo-ai` http 200 + version.
8. Probe the defect: `POST /v1/chat/completions`, `model: "qwen3-30b"`, `max_tokens: 16384`,
   one user message of ~50,000 chars. Router accounting: ~16.7k + 16.4k = ~33.1k total > 32,256 →
   pre-fix routes to qwq-32b (24k). Post-fix → glm-5.3-flash. Discriminating signal: the routed
   model recorded for that request. Use a normal UA — a calibration UA is excluded from
   `ai_queries` by NOLOG-1.
9. Rollback: re-promote the prior version id.

## 7. No ticket existed

`agent_issues` queried for `qwq` / `contextAware` / `ROUTER-CTX` / `deploy` / `binding`: the only
matching rows (id 356, 383, 404, 414, 435, 439) concern deploy/manifest reconciliation. **This
defect has no open ticket.**

## 8. Limits

- **The call site was not read.** `worker.js` is 149,633 bytes; ~30k were read. I therefore cannot
  confirm whether the misrouted target is re-clamped or truncated downstream, so the user-visible
  symptom (upstream 400 / router 502 vs silent truncation) is **unconfirmed**. The defect
  (big-context request → 24k model) is confirmed; the exact failure surface is not.
- **`estInput` is `chars / 3`** — the router's own estimate, not real tokenization. Overflow is
  guaranteed in *router accounting*; upstream real-token counts may differ at the margin.
- **Binding count 25 is INFERRED**, from the toml plus the binding list in ROUTER-CONTEXT-GAP-1.md.
  No CF-API read tool is bound this session, so it is not verified against live settings.
- **Not deployable from this endpoint.** No workers-script PUT tool, no authenticated CF-API write
  channel; `run_code` is isolated compute (no network, no secrets); `web_fetch` is GET-only.
  Independently corroborated by `audits/2026-09-09-redteam-p9-autonomous-mutation.md`: "No
  workers-script PUT tool, no authenticated CF-API write channel in current surface."
- **A full-file `github_file_write` was not attempted** — replacing a 149,633-byte bundle with the
  ~30k I hold would destroy the worker. Only additive files were written.
