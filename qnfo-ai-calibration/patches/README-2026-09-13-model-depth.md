# READ FIRST — model-depth / code-routing artifact set, 2026-09-13

Nineteen files written by two qnfo-ops sessions on 2026-09-13. Several contain claims that later
verification refuted or reinstated. **This index exists so nobody acts on a superseded one.**
Last updated by the second session (rows 10-16).

**Cross-reference:** the seven `FINDING-*` files in `qnfo-ops/` document several of the same defects
independently and in places more precisely. Read them alongside this set — see row 15 and §"Already
documented elsewhere".

## Read in this order

| # | File | Commit | Status |
|---|---|---|---|
| 1 | `qnfo-ai-calibration/patches/2026-09-13-model-depth-and-code-routing.md` | `f79dda65` | **PARTLY SUPERSEDED — see rows 5, 7, 9, 10-16** |
| 2 | `qnfo-ai-calibration/apply-model-depth-fix.mjs` | `fdcf2110` | source hygiene only; targets a shadowed file (row 3) |
| 3 | `qnfo-ai-calibration/patches/2026-09-13-CORRECTION-shadowed-source.md` | `c2bf88b8` | **authoritative** on which file is live |
| 4 | `qnfo-ai-calibration/patches/2026-09-13-PROOF-gw-fail-guard-was-absent.md` | `66dd340d` | dated proof; conclusion **extended** by row 11 |
| 5 | `qnfo-ai-calibration/patches/2026-09-13-CORRECTION2-callers-not-router.md` | `78f56de0` | conclusion **reinstated** by row 9 |
| 6 | `qnfo-ai/apply-router-ctx-fix.mjs` | `5540bff9` | **ready to apply — highest-value item here** |
| 7 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM-strategy-semantics-unresolved.md` | `5560bb14` | parked the question; **superseded by row 9** |
| 8 | `qnfo-ai-calibration/patches/README-2026-09-13-model-depth.md` | `ab49e753` | first revision of this file |
| 9 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM2-route-pools-exclude-flash.md` | `1b7624d4` | **authoritative** on the routing question |
| 10 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM3-live-reverification.md` | `9464ede2` | **§6 superseded by correction 17** |
| 11 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM4-gw-fail-resolve-refile-loop.md` | `2c9dd883` | core proof stands; **actor corrected by 18** |
| 12 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM5-instrumentation-correction.md` | `b4a2f283` | **§6 withdrawn by 20**; §1 refined by 19 |
| 13 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM6-first-hand-fleet-probe.md` | `5749c5e4` | §1-3, §5-7 stand; **§4 WITHDRAWN by row 14** |
| 14 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM7-correction-object-object-is-logger.md` | `8da482e8` | **authoritative** — withdraws row 13 §4 |
| 15 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM8-reconciliation-with-qnfo-ops-findings.md` | `9c4dd73c` | reconciles with `qnfo-ops/FINDING-*`; **§1 REFUTED by row 16** |
| 16 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM9-deployer-log-refutes-and-r2-canonical-source.md` | `9ecb561f` | **authoritative** — the deployer's own log; names the real deploy source |

## Corrections issued after this index was first written (rows 10-16)

1. **The gw-fail burst recurred** — 7 rows (ids 678-684) at 2026-09-13T07:31:00.954Z, 42.00 h after
   the 09-11 burst. Eight tickets were resolved in one instant at 2026-09-13T07:25:07Z; 7 rows were
   re-filed 5 m 53 s later. The same title was filed three times: 489 (`resolved` since 09-08),
   654, 678. **Do not run `ops_issue_run` against `[gw-fail]` rows.**
2. **The self-rewrite loop has never deployed anything** — every `self_rewrite_state` row is
   `reverted-or-rejected`.
3. **The 71.2% code->flash share is a LIFETIME average**, not current routing.
4. **`ai_queries` has no `out_tok` / `avg_lat` columns.**
5. **No model is currently degraded**; but 5 roster rows are CF-id duplicates from `internalId()`.
6. **`image-input` and `tool-args-json` are probe artifacts** (1 failure/sweep).
7. **`latency_max_ms=8000` confirmed live.**
8. **`ops_ai_log.ok` is not an error flag.** The "22.5% chat failure rate" is 28 of 29 async
   job-chain turns; mobile is 1 in 59.
9. **`email_respond` is 0-for-15.**
10. **The `/v1/jobs/...` 404 is SVC-BINDING-1**, not a route gap.
11. **The fleet is 55 workers, not 71.** The 43 with `healthy:null` are **unmeasured, not down**.
12. **The `qnfo-ai` version drift is retired** — both sources report 5.25.1.
13. **Mobile `agent-tools` averages 151 s** (n=182); max 578,831 ms.
14. **Research candidates have not advanced since 2026-09-04.**
15. **`ops_ai_log.prompt` is corrupted by the logger** for messages-array requests (122 rows).
    Row 13 §4's attribution to the mobile client is withdrawn.
16. **A deploy path exists — this series' "no deploy path" claims are wrong.** `qnfo-fleet-deploy`,
    `POST /redeploy`, token-gated, hourly. The blocker is that this endpoint has no POST-capable tool
    and I declined to read the admin token.
17. **`qwen3.8-27b`'s 400s are probe-side, not "real load"** — *"System message must be at the
    beginning."* Row 10 §6's load/artifact split is wrong for this class. Genuinely load-driven:
    `bge-base-en-v1.5` 429 (~90/sweep) and coder-32b content-shape (~42/sweep).
18. **Row 11's actor is unidentified.** The documented drain ran at `06:51:48.256Z` with **`closed: 0`**;
    the resolves are at `07:25:07Z`. The drainer was upgraded 1.2.6 -> 1.2.7 only at **08:01:43Z**, after
    the event. Row 11's all-`ok` evidence is also weak. **The refiling proof is unaffected.**
19. **"`telemetry_analyze` filed 0 — a null result" was incomplete.** It files at high severity then
    **auto-resolves** when a later success supplies "recovery" — it launders a standing ticket.
20. **Row 12 §6's aggregate-guard claim is withdrawn.** No error text was retrieved.
21. **Row 15 §1 is REFUTED.** The deployer did **not** fail for `qnfo-ai-calibration`: `fleet_deploys`
    id 9 shows `1.1.1 -> 1.1.4`, `ok=1`, `2026-09-11 14:01:47`, and `fleet_deploy_state` has **no**
    `scanerr:qnfo-ai-calibration`. My "deployer failing or skipping" inference was wrong.
22. **The deployed source is `r2:qnfo-canonical/qnfo-ai-calibration.js` — not the repo file.** The
    33,551-byte `deployed-current.worker.js` I read in full (the one **with** the gate) is not what
    gets deployed for this worker. **At least three artifacts share the label `1.1.4`:** repo
    `worker.js` (35,742 B, `issue_ledger`), repo `deployed-current.worker.js` (33,551 B,
    `agent_issues`, gate present), and the R2 canonical (**unreadable here** — `qnfo-canonical` is
    not a bound bucket; `r2_get` returns `object not found`). The version collision is the central
    defect; the deployed build's gate status is **unknown**.
23. **The hourly deployer is stuck in two permanent failure loops** — `personal-companion` 26 of 30
    attempts failed, `qnfo-cloud-ops` **25 of 25 failed (0 successes)**, both hourly, error
    `10021`. That is ~2 wasted PUTs every hour, indefinitely, from the fleet's own deploy control
    plane. This, not calibration, is the deployer defect worth fixing.

## Already documented elsewhere — do not re-derive

| topic | file |
|---|---|
| D1 guard is a raw-text substring scan, proven by probe | `qnfo-ops/FINDING-2026-09-13-d1-guard-false-positive.md` + ADDENDUM 1-3 |
| closer predicate unsatisfiable; per-model presence over 48 sweeps | `qnfo-ops/FINDING-2026-09-13-gw-fail-tickets-cannot-self-close.md` |
| canonical drift: 12 of 24 sampled workers have `worker.js` != `deployed-current.worker.js` | `qnfo-ops/FINDING-2026-09-13-canonical-drift-audit.md` |
| the drain is a structural no-op; the backlog is THREE stores (`agent_issues` 25 open vs `issue_ledger` 281 open) | `qnfo-ops/FINDING-2026-09-13-drain-noop-and-alert-storm-reconcile.md` |
| `gemma-4-26b` fixture is a valid **10×10** PNG on the rejection boundary | same file §5 |
| self-heal tickets name tools the endpoint does not bind — prompt/manifest drift | same file §4 |
| `qnfo-cloud-ops` deploy loop failing hourly on a raw multipart body | `qnfo-ops/FINDING-2026-09-13-canonical-drift-audit.md` §3 (now quantified in row 16: 25/25) |

**The error bar this imposes:** `FINDING-…-canonical-drift-audit` §4 — *"A fleet whose canonical source
is not its deployment cannot be audited from source alone, and every source-based claim inherits that
error bar."* Correction 22 makes this concrete: the deployed artifact for the worker at the centre of
this set is an R2 object no tool here can read.

## Current position on P0-1

**A new router rule is unnecessary.** `ROUTE_POOLS.code` in `qnfo-ai/worker-5.13.2.js`
(sha `166b022a`) is:

```js
code: ["kimi-k2.7-code", "glm-5.3", "qwen2.5-coder-32b", "deepseek-v4-pro-wa", "gpt-oss-120b"]
```

`deepseek-v4-flash` appears only in the `general` pool, and `autoRoute` excludes code from its
high-complexity branch. Live data agrees (correction 3).

**Caveat, now worse than stated:** read from v5.13.2; live is **5.25.1** and the repo source is
reported at **5.21.5**. Unread for the live artifact.

## Refuted — do not act on these

1. **P0-1 as written** ("add a router rule for code").
2. **P0-2** ("remove `llama-3.2-1b`, `gemma-2b`, `granite-h-micro`, `gemma-2b-it-lora`") — already done.
3. **F7/F8** ("the gw-fail guard cannot match its own writer") — true only of the shadowed `worker.js`.
4. **F3** ("only 10 models are probed") — live `TIER0_WA` has 15 entries -> 18 probed.
5. **"Run the drain and it will clear a few."**
6. **"71 workers deployed."** Probe says 55.
7. **"`qnfo-ai` version drift 5.21.2 / 5.21.3."** Both sources report 5.25.1.
8. **"The mobile client is sending malformed prompts."** Withdrawn — the logger is.
9. **"No deploy path exists."** False — `qnfo-fleet-deploy` exists and runs hourly.
10. **"The hourly deployer is failing for `qnfo-ai-calibration`."** Refuted by `fleet_deploys` id 9.

## Verified and worth acting on

| Finding | Where verified |
|---|---|
| The same `[gw-fail]` title was filed 3× (489/654/678) despite a prior `resolved` row | D1 |
| The deployed source for `qnfo-ai-calibration` is `r2:qnfo-canonical/…`, not the repo file | `fleet_deploys` id 9 |
| At least three artifacts share VERSION `1.1.4`; the deployed one is unreadable here | repo + `fleet_deploys` |
| `personal-companion` 26/30 and `qnfo-cloud-ops` 25/25 hourly deploy failures | `fleet_deploys` |
| `fleet_deploy_state`: `enabled=1`, `auto_heal=1`; 7 `stale-canon`, 3 `nocanon` | `fleet_deploy_state` |
| `contextAwareTarget` tests `glm-5.3-flash` (1,310,720 ctx) but `return "qwq-32b"` (24,000 ctx, `tools:false`) | live bundle sha `9b536969…`; v5.13.2 `166b022a` |
| `ops_req_log` has no status/duration column | D1 schema |
| Tool reliability: `web_search` 51.9% error (~19.5 s timeout), `web_fetch` 46.5%, `email_respond` 0-for-15 | `cloud_ops_events` |
| The request logger corrupts `prompt` (122 rows) while `ops_jobs.payload` stores the same conversations as valid JSON | `ops_ai_log` vs `ops_jobs` |
| Mobile `agent-tools` averages 150,956 ms (n=182); max 578,831 ms | `ops_ai_log` |
| `bge-base-en-v1.5` 429 ~90/sweep and coder-32b content-shape ~42/sweep are the only load-driven classes | `ai_gateway_failures` + row-text of 489/654/678 |

## The one ready-to-apply fix

```bash
node qnfo-ai/apply-router-ctx-fix.mjs            # dry run
node qnfo-ai/apply-router-ctx-fix.mjs --write    # apply to both qnfo-ai files
```

One token: `return "qwq-32b";` -> `return "glm-5.3-flash";`, plus a `VERSION` bump.

**No PR was opened and no code was deployed.** `github_file_write` cannot create a ref (404 on a short
name and on `refs/heads/…`); `github_pr` returns 422; `main` is the deployer's upstream and is under
concurrent write (one write failed `409: is at ef03f9f99… but expected 84f8f954…`). Apply on a branch,
or use `qnfo-fleet-deploy` (`POST /redeploy`, token-gated).

## Two binding limits

1. **The read cap.** `github_repo_read` and `web_fetch` both truncate at 32,768 characters; the live
   router bundle is 143,771 bytes and no bound R2 bucket holds a copy.
2. **The `strategy` column is uninterpreted** — five values, and 19 rows pair `strategy="single"` with
   `model="ensemble"`.

**Provenance note:** 19 artifacts from two sessions, seven of them self-corrections. Rows 10-16 are the
current authority; read them before acting on rows 1-9.
