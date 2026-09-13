# ADDENDUM 8 — reconciliation with the `qnfo-ops/FINDING-*` set, and five corrections to this series

2026-09-13, qnfo-ops. Written after reading the seven `FINDING-*` files in `qnfo-ops/`. Several of
this series' findings were already documented there, one is contradicted, and one of this session's
most-repeated claims is **wrong**.

## 1. CORRECTION — a deploy path DOES exist. My repeated "no deploy path" claim was false

`qnfo-ops/patches/2026-09-13-DEPLOY-PATH-and-version-regression.md` §1, **revision 2**, states:

> *"The earlier claim 'no deploy path exists' is wrong — one does, and it runs hourly. Corrected."*

It documents **`qnfo-fleet-deploy`, `POST /redeploy`, token-gated**, plus a kill-switch and auto-heal
flags. Every `INCOMPLETE:` line in this series that said "no deploy tool / no deploy path exists" is
therefore **wrong as stated**. The accurate blocker is narrower:

- this endpoint exposes **no POST-capable tool** (`web_fetch` is GET-only), and
- the admin token lives in `credentials/fleet-deploy-admin-token.txt`, which I read no value from and
  declined to use.

The consequence is not cosmetic. **Because the deployer runs hourly and reads
`deployed-current.worker.js` first — and that file for `qnfo-ai-calibration` contains the
GW-FAIL-DEDUP-1 gate — the live worker's continuing lack of the gate is evidence that the hourly
deployer is failing or skipping this worker**, not merely that nobody deployed it. That is a
different and more actionable defect: the same class as `qnfo-cloud-ops`, whose deploy loop is
documented failing ten consecutive hourly PUTs with a `SyntaxError` because the stored bundle is a
raw multipart body.

Also contradictory within `qnfo-ops/` itself: `docs/REDTEAM-ADDENDUM5-2026-09-13.md` §E3 still asserts
*"**No deploy tool**"*. The rev-2 document is the corrected one. An operator reading ADDENDUM 5 would
never look for `qnfo-fleet-deploy`.

## 2. Already documented — credit where it is due

| this series | already in `qnfo-ops/` | status |
|---|---|---|
| ADDENDUM 5 §6 — `ops_d1_query` guard rejection class | `FINDING-2026-09-13-d1-guard-false-positive.md` (sha `7d83b2f9`) + ADDENDUM 1-3 | **theirs is better** — they proved by probe that the guard is a raw-text substring scan, not a parser (`replace()` rejected; the word *delete* inside a string literal rejected). Mine was an inference from error signatures. |
| ADDENDUM 4 — the closer's predicate is unsatisfiable | `FINDING-2026-09-13-gw-fail-tickets-cannot-self-close.md` (sha `de70a81c`) | same defect, theirs source-verified with per-model presence counts over 48 sweeps |
| ADDENDUM 4 / 6 §3 — `worker.js` ≠ `deployed-current.worker.js` | `FINDING-2026-09-13-canonical-drift-audit.md` (sha `9bc37e76`) | **generalised**: 12 of 24 sampled workers drifted. Their error-bar warning applies to me: *"A fleet whose canonical source is not its deployment cannot be audited from source alone, and every source-based claim inherits that error bar."* |
| ADDENDUM 5 §1 — `ok=0` is not an error flag | `FINDING-2026-09-13-drain-noop-and-alert-storm-reconcile.md` §4 (sha `5368c6a1`) | same conclusion, reached independently |
| ADDENDUM 3 §6 — `image-input` is a probe artifact | same file §5 | **theirs is causal**: the probe's fixture decodes to a valid **10×10** PNG, sitting exactly on the `at least 10px` rejection boundary. Fix the fixture (16×16). |
| the drain cannot close these rows | same file §1 | theirs: `processed:25, closed:0`, every row `"no probe target"` |

## 3. CORRECTION — `qwen3.8-27b`'s 400s are probe-side, not "real load"

ADDENDUM 3 §6 classified `qwen3.8-27b` 400 `upstream` at 10.4/sweep as **real load**, against
`image-input`/`tool-args-json` as probe artifacts. The `gw-fail-tickets-cannot-self-close` finding
names the cause: *"**System message must be at the beginning.**"* — the probe sends a malformed
message ordering and the model correctly rejects it. So this class is **caller/probe-side** too, and
my "real load" split was wrong for it. The genuinely load-driven classes remain `bge-base-en-v1.5`
429 (~90/sweep) and `qwen2.5-coder-32b-instruct` content-shape (~42/sweep).

## 4. CORRECTION — ADDENDUM 4's actor is unidentified, and one of my two proofs was weak

ADDENDUM 4 said the 07:25:07Z resolve event was "the drain", and offered `ai_model_health`'s
all-`ok` state as supporting evidence. Both need revision:

- **The documented drain did not do it.** The drain run in `FINDING-…-drain-noop…` executed at
  `updated_at 1789282308256 = 2026-09-13T06:51:48.256Z` and returned **`closed: 0`**. The resolves I
  found are at **07:25:07Z**, 33 minutes later. So the 07:25:07Z actor is **unidentified**; "the
  drain is the trigger" is not supported for that event. (It may be a different drain — `backlog-exec`
  went 1.2.6 → 1.2.7 — but I have no record of it.)
- **The all-`ok` evidence is weak.** The `gw-fail-cannot-self-close` finding §3 explains all-`ok`
  by the `dispo` guard's `continue` skipping the degrade block. But the probe path also rewrites
  `status='ok'` with `consecutive_failures=0` for every model in the same `calibration()` call,
  which explains all-`ok` without the guard. So all-`ok` carries **no information** about the guard.

**What survives, unchanged:** the refiling itself. `[gw-fail] 400 @cf/qwen/qwen3.8-27b` exists at
ids **489** (`resolved` since 2026-09-08T11:07Z), **654** and **678**. The deployed source's `dispo`
gate (`title LIKE '%'||b.model||'%' AND status IN ('wontfix','closed','resolved')` → `continue`) and
`fileIssue`'s `title = ?1 AND status='open'` dedupe together make a third filing **impossible**. It
happened. Therefore the live worker does not run that code.

## 5. The open conflict, stated rather than resolved

`FINDING-…-gw-fail-tickets-cannot-self-close.md` §3 treats the `dispo` gate as **present in the
running worker** — it uses the gate's `continue` to explain why `ai_model_health` reads all-`ok`.
ADDENDUM 4 argues the gate is **absent from the running worker**, from the refiling.

Both readings come from the same repo file. Mine is behavioural. Given the fleet-wide canonical drift
documented in §2 above, **repo ≠ live is the normal condition, not the exception**, and that supports
the behavioural reading. But I cannot close this from source, and the two claims should not both be
carried as settled. The decisive test is cheap and not run: watch whether a `[gw-fail]` title can be
filed after a prior row with that title is resolved. If yes, the gate is not live.

## 6. CORRECTION — "`telemetry_analyze` filed 0 — a null result" was incomplete

ADDENDUM 5 reported `filed: 0` as a null result. `d1-guard-ADDENDUM3` §D1 shows the mechanism: the
loop **did** file `[self-heal] tool ops_d1_query failing x130 (24h no recovery)` at **high** severity,
and **auto-resolved it at 2026-09-13T06:48:18Z** because a subsequent successful `ops_d1_query` call
supplied the "recovery" the predicate looks for. So the loop is not inert — it **launders** a standing
high-severity ticket into a resolved one with no change in behaviour. My "null result" framing
described the run correctly and drew too broad a conclusion from it.

## 7. What this series still adds

1. The **3× refiling proof** (489/654/678) that the deployed gate cannot produce — §4-5.
2. The **resolve→refile timing**: 8 tickets resolved at one instant (07:25:07Z), 7 rows refiled
   5 m 53 s later (07:31:00.954Z). The actor is unknown; the loop is not.
3. The **logger prompt corruption** (ADDENDUM 7): `ops_ai_log.prompt` = `[object Object],[object Object]`
   for messages-array requests, 122 rows, while `ops_jobs.payload` stores the same conversations as
   valid JSON. Not found in the `FINDING-*` set.
4. The **fleet census correction** (55 workers, not 71) and the **version-drift retirement**
   (both sources 5.25.1).

## Limits

- I read 5 of the 7 `FINDING-*` files. `FINDING-2026-09-13-canonical-drift-audit-ADDENDUM.md` and
  `FINDING-2026-09-13-d1-guard-ADDENDUM2-corrections.md` are unreconciled.
- §1's inference that the hourly deployer is failing for `qnfo-ai-calibration` is an inference from
  the deployer's documented behaviour, not an observed failed PUT.
- The §5 conflict is left open deliberately. I have a behavioural proof, not a source reading.
- This addendum corrects five of my own earlier claims in one pass. The base rate of my corrections in
  this series is now six; that should temper the weight given to any single claim in it.
