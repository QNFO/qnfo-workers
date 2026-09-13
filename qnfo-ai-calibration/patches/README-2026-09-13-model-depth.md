# READ FIRST — model-depth / code-routing artifact set, 2026-09-13

Twenty-one files written by two qnfo-ops sessions on 2026-09-13. Several contain claims that later
verification refuted or reinstated. **This index exists so nobody acts on a superseded one.**
Last updated by the second session (rows 10-18). **The set is closed — no further addenda.**

**Cross-reference:** the seven `FINDING-*` files in `qnfo-ops/` document several of the same defects
independently and in places more precisely. Read them alongside this set — see row 15 and §"Already
documented elsewhere".

## Read in this order

| # | File | Commit | Status |
|---|---|---|---|
| 1 | `qnfo-ai-calibration/patches/2026-09-13-model-depth-and-code-routing.md` | `f79dda65` | **PARTLY SUPERSEDED — see rows 5, 7, 9, 10-18 and correction 28** |
| 2 | `qnfo-ai-calibration/apply-model-depth-fix.mjs` | `fdcf2110` | source hygiene only; targets a shadowed file (row 3) |
| 3 | `qnfo-ai-calibration/patches/2026-09-13-CORRECTION-shadowed-source.md` | `c2bf88b8` | **authoritative** on which file is live |
| 4 | `qnfo-ai-calibration/patches/2026-09-13-PROOF-gw-fail-guard-was-absent.md` | `66dd340d` | dated proof; conclusion **extended** by row 11 |
| 5 | `qnfo-ai-calibration/patches/2026-09-13-CORRECTION2-callers-not-router.md` | `78f56de0` | conclusion **reinstated** by row 9 |
| 6 | `qnfo-ai/apply-router-ctx-fix.mjs` | `5540bff9` | ready to apply — **see correction 24: anchors verified against a stale version** |
| 7 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM-strategy-semantics-unresolved.md` | `5560bb14` | parked the question; **superseded by row 9** |
| 8 | `qnfo-ai-calibration/patches/README-2026-09-13-model-depth.md` | `ab49e753` | first revision of this file |
| 9 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM2-route-pools-exclude-flash.md` | `1b7624d4` | **authoritative** on the routing question |
| 10 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM3-live-reverification.md` | `9464ede2` | **§6 superseded by correction 17** |
| 11 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM4-gw-fail-resolve-refile-loop.md` | `2c9dd883` | core proof stands; **actor corrected by 18** |
| 12 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM5-instrumentation-correction.md` | `b4a2f283` | **§6 withdrawn by 20**; §1 refined by 19; **quantified by 31** |
| 13 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM6-first-hand-fleet-probe.md` | `5749c5e4` | §1-3, §5-7 stand; **§4 WITHDRAWN by row 14** |
| 14 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM7-correction-object-object-is-logger.md` | `8da482e8` | **authoritative** — withdraws row 13 §4 |
| 15 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM8-reconciliation-with-qnfo-ops-findings.md` | `9c4dd73c` | reconciles with `qnfo-ops/FINDING-*`; **§1 REFUTED by row 16** |
| 16 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM9-deployer-log-refutes-and-r2-canonical-source.md` | `9ecb561f` | **authoritative** — the deployer's own log |
| 17 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM10-closing-deployed-is-1.1.5-and-two-canonical-sources.md` | `bf1bf825` | **authoritative** — live is 1.1.5; two canonical sources |
| 18 | `qnfo-ai-calibration/patches/2026-09-13-ADDENDUM11-mailbox-unanswered-correspondent-and-self-binned-alerts.md` | `0a76d343` | **authoritative** — the mailbox surface |

## Corrections issued after this index was first written (rows 10-18)

1. **The gw-fail burst recurred** — 7 rows (ids 678-684) at 2026-09-13T07:31:00.954Z, 42.00 h after
   the 09-11 burst. Eight tickets resolved in one instant at 2026-09-13T07:25:07Z; 7 rows re-filed
   5 m 53 s later. The same title was filed three times: 489 (`resolved` since 09-08), 654, 678.
   **Do not run `ops_issue_run` against `[gw-fail]` rows.**
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
16. **A deploy path exists** — `qnfo-fleet-deploy`, `POST /redeploy`, token-gated, hourly. The
    accurate blocker is **unreachable from this endpoint by design**.
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
22. **The deployed source is `r2:qnfo-canonical/qnfo-ai-calibration.js` — not the repo file.**
23. **The hourly deployer is stuck in two permanent failure loops** — `personal-companion` 26 of 30
    attempts failed, `qnfo-cloud-ops` **25 of 25 failed (0 successes)**, both hourly, error `10021`.
24. **The deployed calibration artifact is 1.1.5 — one version ahead of every file read here.**
    **So the gate's status in the live build is UNKNOWN**, not absent and not present.
25. **There are TWO canonical sources and they disagree.** The drift scan compares GitHub
    `deployed-current.worker.js`; the deploy path pulls `r2:qnfo-canonical/<worker>.js`.
26. **Fleet drift: 18 of 55 workers mismatch**; a canonical redeploy would **regress** the 9
    `deployed-ahead` — including `qnfo-ai` 5.25.1 -> 5.21.3. Auto-heal armed, `healed=0` always.
27. **My first-turn cost figures were stale by ~43%.** Live `cf_analytics`: **1,130,379 neurons /
    $12.43** (30 d), **279,664 worker requests / 187 errors** — not 790,847 / $8.70 / 263,723 / 146.
28. **The `gemma-2b-it-lora` claim is REFUTED — and it underpinned P0-2.** Live `cf_analytics`
    `by_model` contains **no gemma-2b entry at all**. The largest listed consumer is
    **`kimi-k2.6` 94,553 neurons**. **The "a 2B model burns more neurons than most of the roster"
    argument has no live support** — the largest spend is on *depth* models.
29. **The async continuation path is stuck.** `ops_jobs`: **32 of 87 rows (37%) are non-terminal
    `continuing`**, all created 2026-09-13 between 06:29 and 13:28Z; oldest stuck 6+ hours.
30. **Invocation attribution is partial.** `cf_analytics.by_worker` lists 8 entries summing to
    ~23,000 of 279,664 requests; `by_model`'s 8 entries cover only ~175,333 of 1,130,379 neurons (15.5%).
31. **THE CALIBRATION SUITE'S FAILURE SIGNAL IS ~85% ARTIFACT.** `ai_calibration_results` over 335
    runs: `endpoint` fail **170**, `latency` fail **114**, `tools` fail 39, `model` fail 7,
    `routing` fail 2 (~332 total ≈ 1 per run — the `fail:1` every run reports).
    - **167 of the 170 `endpoint` failures are ONE probe bug.** `deepseek-direct/models`: pass **168**,
      fail **167**, fail detail **`http=200`**. The GET-endpoint pass condition is
      `r.status === 200 && r.text.indexOf("deepseek-v4-flash") >= 0` — it requires the literal model
      name in a `/models` listing. The request succeeds; the assertion is wrong. The other 3 are real
      60 s timeouts. **Real endpoint services are 1002/1005 = 99.7% healthy.**
    - **`tools`: 296 pass, 24 fail `http=200`, 15 timeout.** The 24 are `deepseek-v4-flash` answering
      without a tool call — model behaviour, not infra.
    - So **167 (50%) of all failures are one probe bug and 114 (34%) are latency trips; only ~50 are
      genuine.** A constant, meaningless `fail:1` per run, sustained for 335 runs.
    - **Consequence: you cannot enforce "no dumb models" with this instrument.** Adding a
      code-correctness probe to an 85%-artifact suite would produce unusable signal.
32. **`latency_max_ms=8000` fires, and it hits the code tier — but it does not change routing.**
    `probe='latency'` fail n=**114** across 15 models, including **`deepseek-v4-pro-wa` 9,
    `gpt-oss-120b` 8, `kimi-k2.7-code` 8, `kimi-k2.6` 7, `glm-5.3` 4, `qwen2.5-coder-32b` 2.** The
    penalty is a probe-result "fail" only — it does not degrade the model or alter routing (all
    `last_latency_ms` <6,500 ms). My earlier "the fleet is structurally required to prefer fast over
    deep" was **too strong**: the config penalises depth in the *reported metrics*, not the routing
    decision.
33. **Model liveness is effectively perfect**: `probe='model'` is **5,325 pass / 7 fail (0.13%)**.
34. **A real correspondent has been left unanswered for seven days.** Email id **552**, from
    `tobias.osborne@itp.uni-hannover.de`, received **2026-09-06T12:07:50.558Z**, status **`processed`**
    — **not `replied`** — while `email_respond` is **0-for-15** on that exact message. A substantive
    reply was composed at least six times (bodies opening "Hi Tobias,") and never sent. Nothing
    escalates it: no ticket, no alert that survives correction 35.
35. **86% of the fleet's own alerts are binned as spam.** Of messages from
    `bounces@cf-bounce.qnfo.org`: **151 of 176 are status `spam`** (25 `archived`). The same subject
    line sent from `qnfo@qnfo.org` (id 709) is `sent`; from the bounce address it is `spam`. Lifetime:
    682 emails, **258 spam**, ~59% of which is the fleet's own alert traffic. Discarded examples:
    `QNFO AI endpoint health alert`, `[research-daily-brief] FAILED`, `Loose threads — 41 item(s) need
    disposition`, `QNFO register guard: 26 overdue`. **The fleet has alerting for exactly the defect
    classes this set documents, and it is thrown away.** Converse case: a cold marketing email
    (`tracxn.com`) was classified `personal` and `processed`.

## If you read only six things

The measurements survived; several causal narratives did not.

1. **Refiling is real.** The same `[gw-fail]` title was filed 3× (489 → 654 → 678) despite 489 being
   `resolved` since 09-08. **Do not drain `[gw-fail]` rows** — the resolve is what triggers the refile.
2. **The deployed calibration artifact is 1.1.5 from `r2:qnfo-canonical/`**, not either repo file.
   Nothing here can read it, so the gate question cannot be closed from this endpoint.
3. **The deployer is stuck:** `personal-companion` 26/30 and `qnfo-cloud-ops` 25/25 hourly failures,
   error `10021`, indefinitely.
4. **The request logger corrupts `prompt`** for messages-array requests (122 rows) while
   `ops_jobs.payload` stores the same conversations as valid JSON — a logger defect, not a client one.
5. **The calibration suite cannot measure model quality.** ~85% of its failures are artifacts — 167 of
   them one probe bug reporting `http=200` as a failure. Fix the instrument before adding any
   depth/correctness probe to it.
6. **Every outward signal is silent or wrong.** `email_respond` 0-for-15; 86% of the fleet's own
   alerts binned as spam; `telemetry_report`'s `open_self_heal_issues` reads 0 while 6 are open;
   `telemetry_analyze` launders a standing ticket into a resolved one. **And one human obligation is
   open: Tobias Osborne's 2026-09-06 reply is unanswered seven days later.**

## Already documented elsewhere — do not re-derive

| topic | file |
|---|---|
| D1 guard is a raw-text substring scan, proven by probe | `qnfo-ops/FINDING-2026-09-13-d1-guard-false-positive.md` + ADDENDUM 1-3 |
| closer predicate unsatisfiable; per-model presence over 48 sweeps | `qnfo-ops/FINDING-2026-09-13-gw-fail-tickets-cannot-self-close.md` |
| canonical drift, with **direction** resolved per worker | `qnfo-ops/FINDING-2026-09-13-canonical-drift-audit.md` + ADDENDUM |
| the drain is a structural no-op; the backlog is THREE stores | `qnfo-ops/FINDING-2026-09-13-drain-noop-and-alert-storm-reconcile.md` |
| `gemma-4-26b` fixture is a valid **10×10** PNG on the rejection boundary | same file §5 |
| self-heal tickets name tools the endpoint does not bind — prompt/manifest drift | same file §4 |
| deploy path, token, kill-switch, two canonical sources, "unreachable by design" | `qnfo-ops/patches/2026-09-13-DEPLOY-PATH-and-version-regression.md` (rev 2) |

**The error bar this imposes:** `FINDING-…-canonical-drift-audit` §4 — *"A fleet whose canonical source
is not its deployment cannot be audited from source alone, and every source-based claim inherits that
error bar."* Correction 24 makes it concrete: the deployed artifact is **1.1.5**, and no tool here can
read it.

## Refuted — do not act on these

1. **P0-1 as written** ("add a router rule for code").
2. **P0-2's stated reason** — already absent, and the neuron-burn justification is refuted (corr. 28).
3. **F7/F8** ("the gw-fail guard cannot match its own writer") — true only of the shadowed `worker.js`.
4. **F3** ("only 10 models are probed") — live `TIER0_WA` has 15 entries -> 18 probed.
5. **"Run the drain and it will clear a few."**
6. **"71 workers deployed."** Probe says 55.
7. **"`qnfo-ai` version drift 5.21.2 / 5.21.3."** Both sources report 5.25.1.
8. **"The mobile client is sending malformed prompts."** Withdrawn — the logger is.
9. **"No deploy path exists."** False — it exists and runs hourly; unreachable *from here*.
10. **"The hourly deployer is failing for `qnfo-ai-calibration`."** Refuted by `fleet_deploys` id 9.
11. **"The gate is absent from the live worker."** Live is **1.1.5**; the refiling is proven, the
    gate's status is unknown.
12. **"790,847 neurons / $8.70 / 263,723 requests."** Stale by ~43%. See correction 27.
13. **"A 2B model (gemma-2b-it-lora) is the second-largest neuron consumer."** No gemma-2b entry
    exists in live `cf_analytics`. See correction 28.
14. **"`latency_max_ms` forces the fleet to prefer fast over deep."** Too strong — it records depth as
    a probe failure but does not alter routing. See correction 32.

## Verified and worth acting on

| Finding | Where verified |
|---|---|
| The same `[gw-fail]` title was filed 3× (489/654/678) despite a prior `resolved` row | D1 |
| Live `qnfo-ai-calibration` is **1.1.5**; the deployed source is `r2:qnfo-canonical/…` | `fleet_drift_report` + `fleet_deploys` id 9 |
| `personal-companion` 26/30 and `qnfo-cloud-ops` 25/25 hourly deploy failures | `fleet_deploys` |
| 18 of 55 workers drift; a canonical redeploy would regress the 9 `deployed-ahead` | `fleet_drift_report` |
| 32 of 87 `ops_jobs` stuck non-terminal, all from 2026-09-13 | `ops_jobs` |
| Live AI spend 1,130,379 neurons / $12.43 (30 d); 279,664 requests / 187 errors | `cf_analytics` |
| **The suite's failure signal is ~85% artifact; 167 failures are one probe bug reporting `http=200`** | `ai_calibration_results` |
| **`latency_max_ms=8000` trips 114 times across 15 models, including the code tier** | `ai_calibration_results` |
| Model liveness: 5,325 pass / 7 fail (0.13%) | `ai_calibration_results` |
| **Email id 552 unanswered since 2026-09-06; `email_respond` 0-for-15** | `emails` + `cloud_ops_events` |
| **151 of 176 fleet self-alert emails are `spam`; same subject from `qnfo@` is `sent`** | `emails` |
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

**Provenance note:** 21 artifacts from two sessions, **eleven self-corrections**. The set is closed at
ADDENDUM 11. Read §"If you read only six things" rather than the whole set.
