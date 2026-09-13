# READ FIRST — model-depth / code-routing artifact set, 2026-09-13

Seven files were written by one qnfo-ops session. **Two of them contain claims that later
verification refuted.** This index exists so nobody acts on the superseded ones.

## Read in this order

| # | File | Status |
|---|---|---|
| 1 | `qnfo-ai-calibration/patches/2026-09-13-model-depth-and-code-routing.md` (`f79dda65`) | **PARTLY SUPERSEDED — do not act on P0-1, P0-2, or F7/F8** |
| 2 | `qnfo-ai-calibration/apply-model-depth-fix.mjs` (`fdcf2110`) | valid as source hygiene for the shadowed file; see #3 |
| 3 | `qnfo-ai-calibration/patches/2026-09-13-CORRECTION-shadowed-source.md` (`c2bf88b8`) | **authoritative** on which file is live |
| 4 | `qnfo-ai-calibration/patches/2026-09-13-PROOF-gw-fail-guard-was-absent.md` (`66dd340d`) | **authoritative**, dated proof |
| 5 | `qnfo-ai-calibration/patches/2026-09-13-CORRECTION2-callers-not-router.md` (`78f56de0`) | **P0-1 conclusion superseded by #7** |
| 6 | `qnfo-ai/apply-router-ctx-fix.mjs` (`5540bff9`) | **ready to apply — highest-value item here** |
| 7 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM-strategy-semantics-unresolved.md` (`5560bb14`) | **authoritative** on the routing question |

## Do not act on these — they are refuted

1. **P0-1: "add a router rule for code."** Superseded by #5 then downgraded by #7.
   `ai_queries.strategy` has five values (`single`, `auto`, `verify`, `ensemble`, `web`) and 19
   rows pair `strategy="single"` with `model="ensemble"`, which refutes both candidate readings of
   the column. **The mechanism by which code work reaches a flash-tier model is undetermined.**
   Only this is verified: 180 of 253 code-domain queries resolved to `deepseek-v4-flash`, all with
   `strategy="single"`.
2. **P0-2: "remove `llama-3.2-1b`, `gemma-2b`, `granite-h-micro`, `gemma-2b-it-lora`."** None of
   those are in `qnfo-ai`'s `MODELS` roster. Retarget to `qwq-32b`, `qwen2.5-coder-32b`,
   `llama-3.2-11b-vision`.
3. **F7/F8: "the gw-fail guard cannot match its own writer."** True of
   `qnfo-ai-calibration/worker.js`, which the deployer **never reads**. The live
   `deployed-current.worker.js` writes and reads `agent_issues` consistently. This is a
   statement about dead code.
4. **F3: "only 10 models are probed."** Wrong — the live `TIER0_WA` has 15 entries, so 18 are
   probed.

## Still verified and worth acting on

| Finding | Where verified |
|---|---|
| `contextAwareTarget` tests `glm-5.3-flash` (1,310,720 ctx) but `return "qwq-32b"` (24,000 ctx, `tools:false`) | live bundle `qnfo-ai/deployed-current.worker.js` sha `9b536969…` |
| That defect was documented 2026-09-11 and the bundle sha has since moved (`32380028…` → `9b536969…`) — **the router was redeployed and the fix still did not land** | same |
| `ai_queries.source` / `.ua` NULL for 251 of 253 rows — no caller identity recorded | D1 |
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
`ROUTER-CTX-GAP-2.md` §3 is the prior write-up; this patcher implements it.

**No PR was opened and no code was deployed.** `github_file_write` cannot create a ref
(404 on a short name and on `refs/heads/…`); `github_pr` returns 422; and `main` is the
deployer's upstream, so committing a live artifact there *is* a production deploy. Apply on a
branch. Note `main` is also written concurrently by other automation.

## Binding limit on every routing conclusion

The live router bundle is **143,771 bytes**; the read tool caps at **32,768 characters**. Roughly
three quarters of the file — the target-selection call site and the `ai_queries` telemetry writer —
was never read. The `strategy` semantics cannot be resolved, and no further routing claim should be
made, until that code is read with a tool that supports an offset.
