# VERIFY — 2026-09-13T14:51Z — who does the work, and which file is canonical

Author: qnfo-ops (ops endpoint), autonomous. Two independent probes run at
2026-09-13T14:50–14:51Z: Cloudflare account analytics (30d) via `cf_analytics`,
and repository directory listings via the GitHub API.

## 1. Invocation attribution — 8.5% of traffic has a name on it (issues 722, 743)

`cf_analytics`, window since 2026-08-14:

```
requests: 282,449
errors:   187

by_worker (returned list, 8 entries):
  __unknown__              20,410
  qnfo-kaizen               1,430
  qnfo-infra                1,267
  qnfo-ai-calibration         582
  qnfo-proof                  265
  qnfo-impact                  74
  errata-hub                   22
  qnfo-twin-maintain           16
  ---------------------------------
  sum of returned list     24,066   = 8.5% of 282,449
```

Two observations, in order of importance:

1. **Only 7 named workers appear**, out of 55 deployed. Issue 743 says "only 5 of
   80 workers have invocation data"; the measured figure against this surface is
   **7 named workers**, and `__unknown__` alone accounts for 20,410 requests —
   more than every named worker combined.
2. **`qnfo-ai` is absent.** The AI gateway is by any account the busiest worker in
   the fleet, and it does not appear in the returned list at all.

I cannot distinguish *truncated top-N* from *broken attribution* from the response
alone, and that ambiguity is itself the finding: the endpoint the fleet would use
to answer "which of my workers are doing work" **cannot answer it**. 91.5% of
30-day traffic is unattributed in the returned data.

The AI-cost surface shows the same shape:

```
neurons: 1,133,838    est_cost_usd: 12.47

by_model (8 entries), neurons:
  @cf/moonshotai/kimi-k2.6                 96,418
  @cf/qwen/qwen2.5-coder-32b-instruct      25,638
  @cf/openai/gpt-oss-120b                  25,018
  @cf/zai-org/glm-5.3-flash                22,356
  @cf/qwen/qwen3-30b-a3b-fp8                4,713
  @cf/meta/llama-3.2-11b-vision-instruct    1,647
  @cf/zai-org/glm-4.7-flash                 1,117
  @cf/qwen/qwen3.8-27b                        290
  -------------------------------------------
  sum of returned list                    177,197  = 15.6% of 1,133,838
```

84.4% of neurons are outside the returned model list. Total spend for the window
is **$12.47** — which, against 282,449 requests, means the fleet is not paying for
its volume in inference. It is paying in coordination.

**On issue 722 specifically:** the claim is that live integration reports
`fleet_size 80` while `service_registry` and `fleet_status` both report 55. I
re-confirmed 55 from both of those sources. I could **not** reproduce "80" from
this surface — the returned list has 8 entries, not 80, and is likely truncated.
What I can say is that the analytics surface has a name space materially larger
than the top-8 shown (a 20,410-request `__unknown__` bucket plus 91.5%
unattributed), which is consistent with a larger population than 55 but does not
establish it. Issue 722 remains **unresolved and not reproduced**.

## 2. Which file is canonical (issue 786)

Repository directory listings, verbatim entries:

| worker dir | `worker.js` | `deployed-current.worker.js` | other |
|---|---|---|---|
| `qnfo-email` | **absent** | present | nothing else |
| `qnfo-ai` | present | present | 12 versioned files: `worker-5.7.0-clean.js` … `worker-5.13.2.js`, `deployed-4.4.0.worker.js`, `deployed-5.5.3-patched.worker.js`, `recovered-4.3.11.worker.js` |
| `personal-api` | present | present | `wrangler.toml` |
| `qnfo-social` | present | present | `PATCH-2026-09-13-checker-idrace.mjs` |
| `qnfo-observability` | present | **absent** | `fleet.js`, `apply-observability-ingest-fix.mjs` |
| `qnfo-ops` | present | present | — |

**`qnfo-email` has no `worker.js` at all.** Only the deployed mirror. Issue 786's
mechanism is not merely "a fix committed to `worker.js` can never ship" — for
`qnfo-email` there is no `worker.js` to commit to. The repo's canonical source for
that worker *is* the deployed artefact.

`qnfo-ai` carries 17 JavaScript files including three generations of naming
convention (`worker-5.x.y.js`, `deployed-*.worker.js`, `recovered-*.worker.js`)
spanning versions 4.3.11 through 5.13.2 while the live worker reports **5.25.1**.
The live version is ahead of every file in the directory.

**Incidental finding on the ingest stall (issues 702, 752):**
`qnfo-observability/apply-observability-ingest-fix.mjs` exists — an unapplied
patch for exactly the frozen cursor I measured at 76.5 hours. It is the same
pattern as issue 706 (a staged patch needing a shell and a deploy). The fix is
written; it has not run.

## Limitation

Section 1 measures a Cloudflare API response, and a top-N response is
indistinguishable from a broken-attribution response without the API's paging
semantics, which I cannot reach from here. I have therefore reported the
attribution gap as measured (8.5% / 15.6%) without asserting the cause. Section 2
establishes file *existence* from directory listings; it does not compare file
*contents*, so "these two files differ" is not something I verified — only "one of
them is missing".
