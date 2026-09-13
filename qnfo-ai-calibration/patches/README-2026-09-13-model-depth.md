# READ FIRST — model-depth / code-routing artifact set, 2026-09-13

Nine files written by one qnfo-ops session. Several contain claims that later verification
refuted or reinstated. **This index exists so nobody acts on a superseded one.**

## Read in this order

| # | File | Commit | Status |
|---|---|---|---|
| 1 | `qnfo-ai-calibration/patches/2026-09-13-model-depth-and-code-routing.md` | `f79dda65` | **PARTLY SUPERSEDED — see rows 5, 7, 9** |
| 2 | `qnfo-ai-calibration/apply-model-depth-fix.mjs` | `fdcf2110` | source hygiene only; targets a shadowed file (row 3) |
| 3 | `qnfo-ai-calibration/patches/2026-09-13-CORRECTION-shadowed-source.md` | `c2bf88b8` | **authoritative** on which file is live |
| 4 | `qnfo-ai-calibration/patches/2026-09-13-PROOF-gw-fail-guard-was-absent.md` | `66dd340d` | **authoritative**, dated proof |
| 5 | `qnfo-ai-calibration/patches/2026-09-13-CORRECTION2-callers-not-router.md` | `78f56de0` | conclusion **reinstated** by row 9 |
| 6 | `qnfo-ai/apply-router-ctx-fix.mjs` | `5540bff9` | **ready to apply — highest-value item here** |
| 7 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM-strategy-semantics-unresolved.md` | `5560bb14` | parked the question; **superseded by row 9** |
| 8 | `qnfo-ai-calibration/patches/README-2026-09-13-model-depth.md` | `ab49e753` | this file |
| 9 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM2-route-pools-exclude-flash.md` | `1b7624d4` | **authoritative** on the routing question |

## Current position on P0-1 (the item this session got wrong twice)

**A new router rule is unnecessary.** `ROUTE_POOLS.code` in `qnfo-ai/worker-5.13.2.js`
(sha `166b022a`, read in full) is:

```js
code: ["kimi-k2.7-code", "glm-5.3", "qwen2.5-coder-32b", "deepseek-v4-pro-wa", "gpt-oss-120b"]
```

`deepseek-v4-flash` appears in **only** the `general` pool. `autoRoute` excludes code from its
high-complexity branch (`cls.domain !== "code"`), so code falls through to this depth-only pool.
**The router structurally cannot select flash for code.**

**Caveat:** `ROUTE_POOLS`/`autoRoute` were read from **v5.13.2**, not the live **v5.21.3** — in the
live 143,771-byte bundle those functions sit just past the 32,768-character read cap. `classify()`
and `ENSEMBLE_POOL.code` are identical across both versions, but a later commit could have added
flash to the live code pool. High confidence, unread for the live artifact.

## Refuted — do not act on these

1. **P0-1 as written** ("add a router rule for code"). The router already has a depth-only code
   pool. Superseded by rows 5 → 7 → 9.
2. **P0-2** ("remove `llama-3.2-1b`, `gemma-2b`, `granite-h-micro`, `gemma-2b-it-lora`"). **Those
   models are in `worker-5.13.2.js` but NOT in the live v5.21.3 `MODELS` roster.** They were
   removed between those versions. Live candidates: `qwq-32b`, `qwen2.5-coder-32b`,
   `llama-3.2-11b-vision`.
3. **F7/F8** ("the gw-fail guard cannot match its own writer"). True of
   `qnfo-ai-calibration/worker.js`, which the deployer **never reads**. The live
   `deployed-current.worker.js` writes and reads `agent_issues` consistently. Dead code.
4. **F3** ("only 10 models are probed"). Live `TIER0_WA` has 15 entries → **18 probed**.

## Verified and worth acting on

| Finding | Where verified |
|---|---|
| `contextAwareTarget` tests `glm-5.3-flash` (1,310,720 ctx) but `return "qwq-32b"` (24,000 ctx, `tools:false`). In **v5.13.2 the guard was `MODELS["qwq-32b"]`** — guard and return were consistent; the live version changed only the guard. Dates the regression to between 5.13.2 and 5.21.3. | live bundle sha `9b536969…`; v5.13.2 sha `166b022a` |
| That defect was documented 2026-09-11 and the bundle sha has since moved (`32380028…` → `9b536969…`) — **the router was redeployed and the fix still did not land** | same |
| `ai_queries.source`/`.ua` NULL for 251 of 253 rows — no caller identity recorded | D1 |
| gw-fail guard absent at 2026-09-11T13:30:46Z: 7 rows in 9.97 s; row 489 (`resolved`, identical title) updated 3.099 days earlier | D1 |
| `deployed-current.worker.js` is deployer candidate #1, `worker.js` is #3 → the latter is never read | `qnfo-fleet-deploy/worker.js` sha `ed539ec3` |
| No code-correctness probe exists; `latency_max_ms`=8000 records a passing-but-slow model as `status:"fail"` | live calibration bundle |
| `internalId()` falls through to `return m;` with no bge alias | same |

## The one ready-to-apply fix

```bash
node qnfo-ai/apply-router-ctx-fix.mjs            # dry run
node qnfo-ai/apply-router-ctx-fix.mjs --write    # apply to both qnfo-ai files
```

One token: `return "qwq-32b";` → `return "glm-5.3-flash";`, plus `VERSION` 5.21.3 → 5.21.4.

**No PR was opened and no code was deployed.** `github_file_write` cannot create a ref (404 on a
short name and on `refs/heads/…`); `github_pr` returns 422; and `main` is the deployer's upstream,
so committing a live artifact there *is* a production deploy. Apply on a branch. `main` is also
written concurrently by other automation.

## Two binding limits

1. **The read cap.** The live router bundle is 143,771 bytes; the read tool caps at 32,768
   characters, and no bound R2 bucket holds a copy (`BACKUPS_R2` and `AUDIT_R2` both return 0
   objects under `qnfo-ai*`). Anything past that offset is unreachable. This is what left
   `ROUTE_POOLS` and the `ai_queries` telemetry writer unread.
2. **The `strategy` column is uninterpreted** — five values (`single`, `auto`, `verify`,
   `ensemble`, `web`), and 19 rows pair `strategy="single"` with `model="ensemble"`, which refutes
   both candidate readings. It no longer blocks the P0-1 conclusion (row 9 settles that from
   source), but no further inference from that column is safe.
