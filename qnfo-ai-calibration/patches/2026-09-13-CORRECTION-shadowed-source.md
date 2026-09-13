# CORRECTION — the patched file is shadowed; several findings were source-only

Date: 2026-09-13 (qnfo-ops / ops-exec)
Corrects: `patches/2026-09-13-model-depth-and-code-routing.md` (commits `f79dda65`, `fdcf2110`)

I read the deployer myself this time instead of trusting a summary. Two of my findings were
about a file that is **never read in production**, and one was flatly wrong.

---

## 1. Verified deploy resolution order

Source: `qnfo-fleet-deploy/worker.js`, sha `ed539ec3254633ed265aa344bbbcffd6cc5fdc9d`,
`VERSION = "0.4.11"`, read in full. The function is `canonical(env, worker)`:

```
1. R2  qnfo-canonical/<worker>.js   -> used ONLY if customMetadata.ts is within FRESH_MS (1800000 = 30 min)
2. GitHub raw.githubusercontent.com/QNFO/ , per name in [worker, worker-without-"qnfo-"]:
     qnfo-workers/main/<n>/deployed-current.worker.js     <- candidate #1
     qnfo-ops/main/cloud/<n>/deployed-current.worker.js   <- candidate #2
     qnfo-workers/main/<n>/worker.js                      <- candidate #3
     qnfo-ops/main/cloud/<n>/worker.js                    <- candidate #4
   first hit that is non-empty and does not start with "404:" wins,
   and is WRITTEN BACK TO R2 with customMetadata.ts = now (refreshing the 30-min window)
3. stale R2 as last resort, else null
```

`redeploy()` then requires a VERSION marker in the canonical (`if (!canV) return 422`) and
skips if `depV === canV` (no-op).

**Consequence:** `qnfo-ai-calibration/deployed-current.worker.js` **exists**, so it is
candidate #1 and `qnfo-ai-calibration/worker.js` is **never fetched**. Editing `worker.js`
changes nothing at runtime. That is the RC-6 divergence the sibling patch doc described —
and it means my patcher, which defaults to `worker.js`, was aimed at a dead file.

Secondary: because every GitHub hit is written back to R2 with a fresh timestamp, GitHub
changes propagate on the next scan after R2 goes stale — roughly hourly, not instantly.

---

## 2. What I got wrong

### F3 was wrong. The live probe set is 18 models, not 10.

`deployed-current.worker.js` `TIER0_WA` has **15** entries:
`deepseek-r1-qwen-32b`, `qwen3-30b`, `qwen2.5-coder-32b`, `glm-5.2`, `kimi-k2.6`, `qwq-32b`,
`glm-4.7-flash`, `gemma-4-26b`, `glm-5.3-flash`, `gpt-oss-120b`, `deepseek-v4-flash-wa`,
`deepseek-v4-pro-wa`, `kimi-k2.7-code`, `glm-5.3`, `llama-3.2-11b-vision`.

`ALL_MODELS = Object.keys(TIER0_WA).concat(["deepseek-v4-flash","deepseek-v4-flash-thinking","deepseek-v4-pro"])`
=> **18 probed**. My "only 10 models are probed" came from the shadowed 7-entry `worker.js`.
P2-7's premise survives (18 probed vs a handful actually routed to) but the number was wrong.

### F7/F8 do not apply to production.

The live bundle is internally **consistent**:

- `fileIssue()`: `SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open'` then
  `INSERT INTO agent_issues (...)`
- `closeIssue()`: `UPDATE agent_issues SET status = 'closed' ...`
- gw-fail dedup guard: `SELECT id FROM agent_issues WHERE title LIKE ?1 AND status IN ('wontfix','closed','resolved')`
- gw-fail auto-close pass: `SELECT id, title FROM agent_issues WHERE title LIKE '[gw-fail]%' AND status = 'open'`

Writer and both readers use `agent_issues`. The `issue_ledger`/`agent_issues` split exists
**only** in the shadowed `worker.js`. My claim that "the guard cannot match its own writer"
was therefore **a statement about dead code, not a production defect.** The P0 item built on
it should be dropped from production scope (it remains valid as source hygiene for `worker.js`).

### The gw-fail ledger is not a runaway leak.

Live `agent_issues` where `title LIKE '[gw-fail]%'`:

| status | rows | distinct created_at |
|---|---|---|
| wontfix | 15 | 15 |
| open | 8 | 8 |
| resolved | 6 | 6 |
| closed | 2 | 2 |
| **total** | **31** | **31** |

That is the shape of a working lifecycle — file, get dispositioned, get suppressed — not an
unbounded emitter. My earlier "7 rows in a 10-second burst" reading was taken from a
compressed window and is **not reproduced here**; the aggregate is consistent with normal
accumulation over weeks. I am withdrawing the "unbounded leak" characterisation pending a
burst test I can actually cite.

---

## 3. What survives — verified in the live bundle

| Finding | Live evidence in `deployed-current.worker.js` |
|---|---|
| **F1/F2 depth scored as failure** | `var latencyMax = parseInt(await cfgGet(env, "latency_max_ms", "8000"), 10) \|\| 8e3;` and `if (res.latency_ms > latencyMax) results.push({ probe: "latency", ... status: "fail", ... detail: "slow minimal probe (> " + latencyMax + "ms)" });` |
| **F4/F5 no code-correctness probe** | probe set is `probeCompletion`/`probeVision`/`probeTools`/`probeStream`/`probeRouting`/`probeEndpoint`/`auditRoster`; `probeCompletion` passes on `r.status === 200 && !!content && trim().length > 0 && echo` where `echo = r.data.model === model` |
| **F6 qualified ids persist** | `internalId()` still ends `return m;` and there is **no** bge alias line, so `@cf/baai/bge-base-en-v1.5` → `ai_model_health` under its qualified id |
| **RC-3 strict echo** | same `r.data.model === model` |
| **RC-4 deepseek-direct can never pass** | `pass = r.status === 200 && r.text.indexOf("deepseek-v4-flash") >= 0;` — DeepSeek's own `/v1/models` cannot contain a CF alias |
| **RC-5 vision results never persisted** | `runPool(visionModels, 2, ...)` pushes to `results` and returns; no `upsertHealth` |

Note `DEFAULT_VISION` live has **5** entries (adds `gemma-4-26b`, `llama-3.2-11b-vision`)
vs 4 in the shadowed source.

---

## 4. Corrected fix path

The live file is an **esbuild bundle** (`var __defProp`, `__name(target, value) => ...`
wrappers, `6e4`/`9e4`/`45e3` numeric literals). Hand-editing it is wrong. The correct order:

1. Edit `qnfo-ai-calibration/worker.js` (the hand-written source) — my patcher does this.
2. **Rebuild** the bundle so `deployed-current.worker.js` regenerates from that source.
3. Commit **both**. Committing `deployed-current.worker.js` to `main` **is a production
   deploy** on the next hourly scan.
4. Delete or stop maintaining the stale `deployed-current.worker.js` if the build now emits
   it, so the two cannot silently diverge again.

**Do not hand-patch the bundle.** The patcher refuses to run against a bundled file unless
`--force` is passed, so a confusing `anchor found 0 time(s)` abort becomes an explicit message.

---

## 5. Operational note — `main` is a contended branch

A write to `main` from this session failed with
`GitHub 409: is at f69201e7fe0404f8612019fa443c460662b87854 but expected fe2ac26b19ea89eafbd99a81605cda7177eb412a`
— another process committed to `main` between my read and my write. Since `main` is the
deployer's upstream, whatever wrote `f69201e7` is on a path to production. Commits landing on
`main` from outside this session cannot be attributed or reviewed from qnfo-ops, and a PR
workflow cannot be enforced while that is true.

---

## 6. Still unresolved

- I did **not** diff the two files byte-for-byte; the divergence is established by reading
  both and comparing the specific regions above.
- I cannot rebuild the bundle (no node runtime, no filesystem on qnfo-ops).
- The router fix (P0-1) remains a specification: `qnfo-ai/worker.js` still not read in full.
- `CODE_EVAL` (required by the P1-4 probe) does not exist; Workers forbid `eval`/`new Function`.
