# READ FIRST — model-depth / code-routing artifact set, 2026-09-13

Fifteen files written by two qnfo-ops sessions on 2026-09-13. Several contain claims that later
verification refuted or reinstated. **This index exists so nobody acts on a superseded one.**
Last updated by the second session (rows 10-12).

## Read in this order

| # | File | Commit | Status |
|---|---|---|---|
| 1 | `qnfo-ai-calibration/patches/2026-09-13-model-depth-and-code-routing.md` | `f79dda65` | **PARTLY SUPERSEDED — see rows 5, 7, 9, 10-12** |
| 2 | `qnfo-ai-calibration/apply-model-depth-fix.mjs` | `fdcf2110` | source hygiene only; targets a shadowed file (row 3) |
| 3 | `qnfo-ai-calibration/patches/2026-09-13-CORRECTION-shadowed-source.md` | `c2bf88b8` | **authoritative** on which file is live |
| 4 | `qnfo-ai-calibration/patches/2026-09-13-PROOF-gw-fail-guard-was-absent.md` | `66dd340d` | dated proof; conclusion **extended** by row 11 |
| 5 | `qnfo-ai-calibration/patches/2026-09-13-CORRECTION2-callers-not-router.md` | `78f56de0` | conclusion **reinstated** by row 9 |
| 6 | `qnfo-ai/apply-router-ctx-fix.mjs` | `5540bff9` | **ready to apply — highest-value item here** |
| 7 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM-strategy-semantics-unresolved.md` | `5560bb14` | parked the question; **superseded by row 9** |
| 8 | `qnfo-ai-calibration/patches/README-2026-09-13-model-depth.md` | `ab49e753` | first revision of this file |
| 9 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM2-route-pools-exclude-flash.md` | `1b7624d4` | **authoritative** on the routing question |
| 10 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM3-live-reverification.md` | `9464ede2` | **authoritative** — live re-verification, corrects 5 claims |
| 11 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM4-gw-fail-resolve-refile-loop.md` | `2c9dd883` | **authoritative** — gw-fail root cause |
| 12 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM5-instrumentation-correction.md` | `b4a2f283` | **authoritative** — telemetry / `ok`-flag correction |

## Corrections issued after this index was first written (rows 10-12)

1. **The gw-fail burst recurred.** 7 rows (ids 678-684) at 2026-09-13T07:31:00.954Z, **42.00 h**
   after the 09-11 burst — so the README's "nothing in ~21 h across ~42 sweeps" is now false.
   **Root cause (row 11):** eight tickets were resolved in one instant at 2026-09-13T07:25:07Z
   (ids 644, 651, 654-660, 670); the next sweep re-filed 7 rows 5 m 53 s later. The live worker
   **lacks the GW-FAIL-DEDUP-1 disposition gate** that `deployed-current.worker.js` contains:
   row 489 was already `resolved` since 09-08 with a byte-identical title, so the gate would have
   suppressed row 678. The same title was filed three times: 489 -> 654 -> 678.
   **Do not run `ops_issue_run` against `[gw-fail]` rows — the drain is the trigger.**
2. **The self-rewrite loop has never deployed anything.** Every `self_rewrite_state` row is
   `reverted-or-rejected` (09-10: five parse/binding failures; 09-13: `jnl-referee` hourly, 10
   consecutive `snapshot read 404`). This **refutes** the "autopilot auto-deployed the regression"
   hypothesis in row 1's P0.
3. **The 71.2% code->flash share is a LIFETIME average, not current routing.** Flash's last code
   query is 2026-09-09T15:45:51.134Z; every code row after that is `ensemble` or `kimi-k2.7-code`.
   Consistent with row 9.
4. **`ai_queries` has no `out_tok` / `avg_lat` columns.** Live schema: `id, ts, model, strategy,
   complexity, domain, prompt, response, prompt_tokens, completion_tokens, cost_usd, latency_ms,
   rag_sources, streamed, source, ua`. Any figure derived from the old names must be re-derived.
5. **No model is currently degraded.** All 25 `ai_model_health` rows are `status=ok`,
   `consecutive_failures=0`, probe live. But 5 roster rows are CF-id duplicates from the
   `internalId()` fallthrough, each unprobed (`last_latency_ms=null`).
6. **`image-input` and `tool-args-json` are probe artifacts.** Exactly one failure per sweep
   (393/393 and 390/390). Real load: bge 429 at 93.8/sweep, coder-32b content-shape at 42/sweep.
7. **`latency_max_ms=8000` confirmed live** in `ai_calibration_config` (with `fail_threshold=2`).
8. **`ops_ai_log.ok` is not an error flag** (row 12). It conflates genuine API errors, `INCOMPLETE`
   endings and bare tool-call dumps. The "22.5% chat failure rate" is **28 of 29 async job-chain
   turns**; mobile is 1 in 59 (1.7%). The genuine error class is a deepseek
   `reasoning_content ... must be passed back to the API` 400.
9. **`email_respond` is 0-for-15 — it has never succeeded.**
10. **The `/v1/jobs/...` 404 is SVC-BINDING-1**, not a route gap: a Worker cannot fetch its own
    `workers.dev` URL. The 404 carries no information about whether the route exists.

## Current position on P0-1 (the item the first session got wrong twice)

**A new router rule is unnecessary.** `ROUTE_POOLS.code` in `qnfo-ai/worker-5.13.2.js`
(sha `166b022a`, read in full) is:

```js
code: ["kimi-k2.7-code", "glm-5.3", "qwen2.5-coder-32b", "deepseek-v4-pro-wa", "gpt-oss-120b"]
```

`deepseek-v4-flash` appears in **only** the `general` pool. `autoRoute` excludes code from its
high-complexity branch (`cls.domain !== "code"`), so code falls through to this depth-only pool.
**The router structurally cannot select flash for code**, and live data agrees (correction 3).

**Caveat:** read from v5.13.2, not the live v5.21.3 — in the live 143,771-byte bundle those
functions sit past the 32,768-character read cap. High confidence; unread for the live artifact.

## Refuted — do not act on these

1. **P0-1 as written** ("add a router rule for code"). Superseded by rows 5 -> 7 -> 9.
2. **P0-2** ("remove `llama-3.2-1b`, `gemma-2b`, `granite-h-micro`, `gemma-2b-it-lora`"). **Already
   done** — all four are absent from the 25-row live roster. `llama-3.2-11b-vision` remains and is
   one of 5 `vision_models`.
3. **F7/F8** ("the gw-fail guard cannot match its own writer"). True only of the shadowed
   `worker.js`, which the deployer never reads.
4. **F3** ("only 10 models are probed"). Live `TIER0_WA` has 15 entries -> **18 probed**.
5. **"Run the drain and it will clear a few."** Wrong for gw-fail: the drain triggers refiling.

## Verified and worth acting on

| Finding | Where verified |
|---|---|
| `contextAwareTarget` tests `glm-5.3-flash` (1,310,720 ctx) but `return "qwq-32b"` (24,000 ctx, `tools:false`). In v5.13.2 the guard was `MODELS["qwq-32b"]` — guard and return were consistent; the live version changed only the guard. | live bundle sha `9b536969…`; v5.13.2 sha `166b022a` |
| That defect was documented 2026-09-11 and the bundle sha has since moved (`32380028…` -> `9b536969…`) — **the router was redeployed and the fix still did not land** | same |
| `ai_queries.source`/`.ua` NULL for 251 of 253 rows — no caller identity recorded | D1 |
| The gw-fail disposition gate is absent from the live worker; the same title was filed 3x | D1 (rows 489/654/678) |
| `deployed-current.worker.js` is deployer candidate #1, `worker.js` is #3 -> the latter is never read | `qnfo-fleet-deploy/worker.js` sha `ed539ec3` |
| No code-correctness probe exists; `latency_max_ms`=8000 records a passing-but-slow model as `status:"fail"` | live calibration bundle |
| `worker.js` and `deployed-current.worker.js` both claim VERSION 1.1.4 and disagree materially | repo, both files read in full |
| The closer can never fire: its 24h predicate requires 0 failures while every model fails 47-48 of 48 sweeps | `apply-gw-closer-fix.mjs` rev 2, sha `9d942cc7` |
| `ops_req_log` has no status/duration column -> a hung request is indistinguishable from a completed one | D1 schema |
| Tool reliability: `web_search` 51.9% error (uniform ~19.5 s timeout), `web_fetch` 46.5%, `email_respond` 0-for-15 | `cloud_ops_events` |

## The one ready-to-apply fix

```bash
node qnfo-ai/apply-router-ctx-fix.mjs            # dry run
node qnfo-ai/apply-router-ctx-fix.mjs --write    # apply to both qnfo-ai files
```

One token: `return "qwq-32b";` -> `return "glm-5.3-flash";`, plus `VERSION` 5.21.3 -> 5.21.4.

**No PR was opened and no code was deployed.** `github_file_write` cannot create a ref (404 on a
short name and on `refs/heads/…`); `github_pr` returns 422; and `main` is the deployer's upstream,
so committing a live artifact there *is* a production deploy. Apply on a branch.

## Two binding limits

1. **The read cap.** The live router bundle is 143,771 bytes; the read tool caps at 32,768
   characters, and no bound R2 bucket holds a copy. Anything past that offset is unreachable.
2. **The `strategy` column is uninterpreted** — five values, and 19 rows pair `strategy="single"`
   with `model="ensemble"`, refuting both candidate readings. No longer load-bearing.

**Provenance note:** this set is now 15 artifacts from two sessions. Rows 10-12 are the current
authority; read them before acting on rows 1-9.
