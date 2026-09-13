# READ FIRST — model-depth / code-routing artifact set, 2026-09-13

Twenty files written by two qnfo-ops sessions on 2026-09-13. Several contain claims that later
verification refuted or reinstated. **This index exists so nobody acts on a superseded one.**
Last updated by the second session (rows 10-17). **The set is closed — see §"If you read only four".**

**Cross-reference:** the seven `FINDING-*` files in `qnfo-ops/` document several of the same defects
independently and in places more precisely. Read them alongside this set — see row 15 and §"Already
documented elsewhere".

## Read in this order

| # | File | Commit | Status |
|---|---|---|---|
| 1 | `qnfo-ai-calibration/patches/2026-09-13-model-depth-and-code-routing.md` | `f79dda65` | **PARTLY SUPERSEDED — see rows 5, 7, 9, 10-17** |
| 2 | `qnfo-ai-calibration/apply-model-depth-fix.mjs` | `fdcf2110` | source hygiene only; targets a shadowed file (row 3) |
| 3 | `qnfo-ai-calibration/patches/2026-09-13-CORRECTION-shadowed-source.md` | `c2bf88b8` | **authoritative** on which file is live |
| 4 | `qnfo-ai-calibration/patches/2026-09-13-PROOF-gw-fail-guard-was-absent.md` | `66dd340d` | dated proof; conclusion **extended** by row 11 |
| 5 | `qnfo-ai-calibration/patches/2026-09-13-CORRECTION2-callers-not-router.md` | `78f56de0` | conclusion **reinstated** by row 9 |
| 6 | `qnfo-ai/apply-router-ctx-fix.mjs` | `5540bff9` | ready to apply — **but see correction 24: anchors verified against a stale version** |
| 7 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM-strategy-semantics-unresolved.md` | `5560bb14` | parked the question; **superseded by row 9** |
| 8 | `qnfo-ai-calibration/patches/README-2026-09-13-model-depth.md` | `ab49e753` | first revision of this file |
| 9 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM2-route-pools-exclude-flash.md` | `1b7624d4` | **authoritative** on the routing question |
| 10 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM3-live-reverification.md` | `9464ede2` | **§6 superseded by correction 17** |
| 11 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM4-gw-fail-resolve-refile-loop.md` | `2c9dd883` | core proof stands; **actor corrected by 18** |
| 12 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM5-instrumentation-correction.md` | `b4a2f283` | **§6 withdrawn by 20**; §1 refined by 19 |
| 13 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM6-first-hand-fleet-probe.md` | `5749c5e4` | §1-3, §5-7 stand; **§4 WITHDRAWN by row 14** |
| 14 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM7-correction-object-object-is-logger.md` | `8da482e8` | **authoritative** — withdraws row 13 §4 |
| 15 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM8-reconciliation-with-qnfo-ops-findings.md` | `9c4dd73c` | reconciles with `qnfo-ops/FINDING-*`; **§1 REFUTED by row 16** |
| 16 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM9-deployer-log-refutes-and-r2-canonical-source.md` | `9ecb561f` | **authoritative** — the deployer's own log |
| 17 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM10-closing-deployed-is-1.1.5-and-two-canonical-sources.md` | `bf1bf825` | **authoritative and closing** — live is 1.1.5; two canonical sources |

## Corrections issued after this index was first written (rows 10-17)

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
16. **A deploy path exists** — `qnfo-fleet-deploy`, `POST /redeploy`, token-gated, hourly. The
    accurate blocker is **unreachable from this endpoint by design** (`DEPLOY_ADMIN_TOKEN` not in
    qnfo-ops' deps, `run_code` isolated, `web_fetch` GET-only, self-redeploy refused).
17. **`qwen3.8-27b`'s 400s are probe-side, not "real load"** — *"System message must be at the
    beginning."* Genuinely load-driven: `bge-base-en-v1.5` 429 (~90/sweep), coder-32b content-shape
    (~42/sweep).
18. **Row 11's actor is unidentified.** The documented drain ran at `06:51:48.256Z` with **`closed: 0`**;
    the resolves are at `07:25:07Z`. The drainer reached 1.2.7 only at **08:01:43Z**. Row 11's
    all-`ok` evidence is also weak. **The refiling proof is unaffected.**
19. **"`telemetry_analyze` filed 0 — a null result" was incomplete.** It files at high severity then
    **auto-resolves** when a later success supplies "recovery" — it launders a standing ticket.
20. **Row 12 §6's aggregate-guard claim is withdrawn.** No error text was retrieved.
21. **Row 15 §1 is REFUTED.** The deployer did **not** fail for `qnfo-ai-calibration`: `fleet_deploys`
    id 9 shows `1.1.1 -> 1.1.4`, `ok=1`, `2026-09-11 14:01:47`, and there is **no**
    `scanerr:qnfo-ai-calibration`.
22. **The deployed source is `r2:qnfo-canonical/qnfo-ai-calibration.js` — not the repo file.** At
    least three artifacts share the label `1.1.4`; the repo `deployed-current.worker.js` I read in
    full (the one **with** the gate) is not deployed for this worker.
23. **The hourly deployer is stuck in two permanent failure loops** — `personal-companion` 26 of 30
    attempts failed, `qnfo-cloud-ops` **25 of 25 failed (0 successes)**, both hourly, error `10021`.
    ~2 wasted PUTs every hour, indefinitely. This, not calibration, is the deployer defect to fix.
24. **The deployed calibration artifact is 1.1.5 — one version ahead of every file read here**
    (`fleet_drift_report`, scan `2026-09-13 06:05:30`). **So the gate's status in the live build is
    UNKNOWN**, not absent and not present. Every source-based claim in this set — mine and the earlier
    session's patch anchors alike — was verified against **stale 1.1.4**.
25. **There are TWO canonical sources and they disagree.** The drift scan compares GitHub
    `deployed-current.worker.js`; the deploy path pulls `r2:qnfo-canonical/<worker>.js`. *"'Canonical'
    has no single answer."* A drift report can therefore be computed against a file that is not the
    deploy source.
26. **Fleet drift: 18 of 55 workers mismatch** (9 `deployed-ahead`, 9 `canonical-ahead`; 8 of the
    latter unverifiable because their deployed version is a `<worker>/fabric-20260910` placeholder).
    **A canonical redeploy would REGRESS the 9 `deployed-ahead`** — including `qnfo-ai` 5.25.1 ->
    5.21.3 and `qnfo-ai-calibration` 1.1.5 -> 1.1.4. Auto-heal is armed (`auto_heal=1`, kill-switch
    `1`) and every cron reports `healed=0`; whether it skips `deployed-ahead` by design or is broken
    is **not established**.

## If you read only four things

The measurements survived; several causal narratives did not. The four findings that held up:

1. **Refiling is real.** The same `[gw-fail]` title was filed 3× (489 → 654 → 678) despite 489 being
   `resolved` since 09-08. **Do not drain `[gw-fail]` rows** — the resolve is what triggers the refile.
2. **The deployed calibration artifact is 1.1.5 from `r2:qnfo-canonical/`**, not either repo file.
   Nothing here can read it, so the gate question cannot be closed from this endpoint.
3. **The deployer is stuck:** `personal-companion` 26/30 and `qnfo-cloud-ops` 25/25 hourly failures,
   error `10021`, indefinitely.
4. **The request logger corrupts `prompt`** for messages-array requests (122 rows) while
   `ops_jobs.payload` stores the same conversations as valid JSON — a logger defect, not a client one.

## Already documented elsewhere — do not re-derive

| topic | file |
|---|---|
| D1 guard is a raw-text substring scan, proven by probe | `qnfo-ops/FINDING-2026-09-13-d1-guard-false-positive.md` + ADDENDUM 1-3 |
| closer predicate unsatisfiable; per-model presence over 48 sweeps | `qnfo-ops/FINDING-2026-09-13-gw-fail-tickets-cannot-self-close.md` |
| canonical drift, with **direction** resolved per worker | `qnfo-ops/FINDING-2026-09-13-canonical-drift-audit.md` + ADDENDUM |
| the drain is a structural no-op; the backlog is THREE stores (`agent_issues` open vs `issue_ledger` 281 open) | `qnfo-ops/FINDING-2026-09-13-drain-noop-and-alert-storm-reconcile.md` |
| `gemma-4-26b` fixture is a valid **10×10** PNG on the rejection boundary | same file §5 |
| self-heal tickets name tools the endpoint does not bind — prompt/manifest drift | same file §4 |
| deploy path, token, kill-switch, two canonical sources, "unreachable by design" | `qnfo-ops/patches/2026-09-13-DEPLOY-PATH-and-version-regression.md` (rev 2) |

**The error bar this imposes:** `FINDING-…-canonical-drift-audit` §4 — *"A fleet whose canonical source
is not its deployment cannot be audited from source alone, and every source-based claim inherits that
error bar."* Correction 24 makes it concrete: the deployed artifact is **1.1.5**, and no tool here can
read it.

## Refuted — do not act on these

1. **P0-1 as written** ("add a router rule for code").
2. **P0-2** ("remove `llama-3.2-1b`, `gemma-2b`, `granite-h-micro`, `gemma-2b-it-lora`") — already done.
3. **F7/F8** ("the gw-fail guard cannot match its own writer") — true only of the shadowed `worker.js`.
4. **F3** ("only 10 models are probed") — live `TIER0_WA` has 15 entries -> 18 probed.
5. **"Run the drain and it will clear a few."**
6. **"71 workers deployed."** Probe says 55.
7. **"`qnfo-ai` version drift 5.21.2 / 5.21.3."** Both sources report 5.25.1.
8. **"The mobile client is sending malformed prompts."** Withdrawn — the logger is.
9. **"No deploy path exists."** False — it exists and runs hourly; it is unreachable *from here*.
10. **"The hourly deployer is failing for `qnfo-ai-calibration`."** Refuted by `fleet_deploys` id 9.
11. **"The gate is absent from the live worker."** Row 11's inference — the live version is **1.1.5**,
    which no artifact in this set describes. The *refiling* is proven; the gate's status is unknown.

## Verified and worth acting on

| Finding | Where verified |
|---|---|
| The same `[gw-fail]` title was filed 3× (489/654/678) despite a prior `resolved` row | D1 |
| Live `qnfo-ai-calibration` is **1.1.5**; the deployed source is `r2:qnfo-canonical/…` | `fleet_drift_report` + `fleet_deploys` id 9 |
| `personal-companion` 26/30 and `qnfo-cloud-ops` 25/25 hourly deploy failures | `fleet_deploys` |
| 18 of 55 workers drift; a canonical redeploy would regress the 9 `deployed-ahead` | `fleet_drift_report` |
| `contextAwareTarget` tests `glm-5.3-flash` (1,310,720 ctx) but `return "qwq-32b"` (24,000 ctx, `tools:false`) | live bundle sha `9b536969…`; v5.13.2 `166b022a` |
| `ops_req_log` has no status/duration column | D1 schema |
| Tool reliability: `web_search` 51.9% error (~19.5 s timeout), `web_fetch` 46.5%, `email_respond` 0-for-15 | `cloud_ops_events` |
| The request logger corrupts `prompt` (122 rows) while `ops_jobs.payload` is valid JSON | `ops_ai_log` vs `ops_jobs` |
| Mobile `agent-tools` averages 150,956 ms (n=182); max 578,831 ms | `ops_ai_log` |
| `bge-base-en-v1.5` 429 ~90/sweep and coder-32b content-shape ~42/sweep are the only load-driven classes | `ai_gateway_failures` + row text of 489/654/678 |

## The one ready-to-apply fix — with a caveat added

```bash
node qnfo-ai/apply-router-ctx-fix.mjs            # dry run
node qnfo-ai/apply-router-ctx-fix.mjs --write    # apply to both qnfo-ai files
```

One token: `return "qwq-32b";` -> `return "glm-5.3-flash";`, plus a `VERSION` bump.

**Caveat (correction 24):** live `qnfo-ai` is **5.25.1** while the repo source is reported at 5.21.x,
so the anchors must be re-verified against the live version before applying — the same mistake a
prior session made on calibration.

**No PR was opened and no code was deployed.** `github_file_write` cannot create a ref; `github_pr`
returns 422; `main` is under concurrent write (one write failed
`409: is at ef03f9f99… but expected 84f8f954…`). Apply on a branch, or use `qnfo-fleet-deploy`.

## Two binding limits

1. **The read cap.** `github_repo_read` and `web_fetch` both truncate at 32,768 characters; the live
   router bundle is 143,771 bytes, and `qnfo-canonical` is not a bound bucket.
2. **The `strategy` column is uninterpreted** — five values, and 19 rows pair `strategy="single"` with
   `model="ensemble"`.

**Provenance note:** 20 artifacts from two sessions, **seven self-corrections**. The set is closed at
ADDENDUM 10. Read §"If you read only four things" rather than the whole set.
