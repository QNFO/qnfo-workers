# ADDENDUM 10 — CLOSING: the deployed calibration worker is 1.1.5, not 1.1.4; two canonical sources; set closed

2026-09-13, qnfo-ops. Final addendum to this set. Read the index
(`qnfo-ai-calibration/patches/README-2026-09-13-model-depth.md`) for orientation.

## 1. The deployed artifact is 1.1.5 — one version ahead of every file I read

`fleet_drift_report`, latest scan `2026-09-13 06:05:30` (per-worker rows 06:01:42-06:04:12), lists
`qnfo-ai-calibration` under **`deployed-ahead`**: **deployed 1.1.5, canonical 1.1.4.**

So the tally is:

| artifact | version | gate |
|---|---|---|
| repo `worker.js` | 1.1.4 | — |
| repo `deployed-current.worker.js` (sha `3624a4da`) | 1.1.4 | **present** |
| `r2:qnfo-canonical/qnfo-ai-calibration.js` | **1.1.5** | **unknown — never read** |

**The gate's presence in the live build is therefore unknown**, not "absent" and not "present". Both
my gate analysis and the earlier session's patch anchors were verified against **1.1.4 — a stale
snapshot one version behind production**. The `FINDING-2026-09-13-canonical-drift-audit-ADDENDUM.md`
§3 records the same error against its own calibration patch: *"the five anchors were verified against
a stale snapshot one version behind production… The patch's applicability to production is not
established."*

This is the sharpest statement available of the error bar under this whole set: **the file at the
centre of the investigation is not the file that runs, and its version is not the live version.**

## 2. There are two canonical sources, and the scanner and the deployer use different ones

`FINDING-2026-09-13-d1-guard-ADDENDUM2-corrections.md` §C1:

> *"The drift scan compares against GitHub `deployed-current.worker.js` (2.13.0); the deploy path
> pulls `r2:qnfo-canonical/qnfo-ops.js`. So 'canonical' has no single answer."*

Confirmed for calibration from the deployer's own log: `fleet_deploys` id 9,
`source_path = "r2:qnfo-canonical/qnfo-ai-calibration.js"`.

**Consequence:** a drift report can be computed against a file that is not the deploy source. That is
the structural defect underneath every `stale-canon` and "canonical drift" claim in this set, and it
is why `fleet_deploy_state` carries no `scanerr` for a worker whose deployed artifact is not its
GitHub file.

## 3. Fleet drift, latest scan (verbatim)

```
scanned=55 clean=33 drifted=9 ahead=9 healed=0 errors=0 staleCanon=4 healthVer=10
errKinds={"version-format":19,"stale-canon":4,"health-ver":10}
```

**18 of 55 workers mismatch.** The 9 `deployed-ahead` — where a canonical redeploy would **regress**
live: `qnfo-ai` 5.25.1 vs 5.21.3, `qnfo-ops` 2.15.1 vs 2.13.0, **`qnfo-ai-calibration` 1.1.5 vs
1.1.4**, `qnfo-fleet-dashboard` 1.5.1 vs 1.1.0, `qnfo-signal-loop` 1.1.2 vs 1.1.0, `personal-api`
3.5.0 vs `v3.2.2-maxout200k`, `qnfo-backlog-exec` 1.2.6 vs 1.2.4 (at scan time),
`qnfo-research-exec` 0.8.1 vs `0.5.17-research-restored`, `qnfo-fleet-control` 0.3.4 vs 0.3.3.

Of the 9 `canonical-ahead`, **8 are unverifiable as stated** — their deployed version is a
`<worker>/fabric-20260910` placeholder, which is itself the `version-format: 19` error class the
scanner counts. Only `qnfo-cloud-ops` (1.14.1 vs 1.14.1-gtd-guard) supports its label.

## 4. Auto-heal is armed and has never acted

The kill-switch and `auto_heal` are both **`1`** (flipped 2026-09-08), while every cron reports
**`healed=0`**. Whether the control plane skips `deployed-ahead` workers by design or is broken is
**not established** — that document says so explicitly and I did not establish it either.

## 5. State at close

- `gw_sweep_last_ts` = `1789304457836` = **2026-09-13T13:00:57.836Z**, unchanged. Last observed
  calibration run is the same instant. **No `[gw-fail]` rows exist after id 684.** I cannot confirm
  whether the ~13:30 invocation has occurred.
- Open backlog **12** (`qnfo-backlog-exec` 1.2.7; it was upgraded 1.2.6 -> 1.2.7 at 08:01:43Z).
- **The behavioural gate test is blocked, not merely unrun.** `fileIssue`'s
  `WHERE title = ?1 AND status = 'open'` dedupe suppresses refiling for any title that already has an
  open row — independently of the `dispo` gate. All 7 failing models currently hold open rows
  (678-684). So no burst can occur until something resolves them, and resolving them requires the
  drain that is contraindicated. The test only becomes discriminating after a resolve.
- This also explains the burst cadence: the burst follows a resolve event because the resolve is what
  removes the open-dedupe's protection. ADDENDUM 4's mechanism holds in outline; only the actor
  remains unidentified.

## 6. Reconciliations with the last two `FINDING-*` files

- `d1-guard-ADDENDUM2` §C2: *"no deploy tool"* is imprecise; the accurate statement is **unreachable
  from this endpoint by design** — `DEPLOY_ADMIN_TOKEN` is not in qnfo-ops' declared deps, `run_code`
  is isolated, `web_fetch` is GET-only, and self-redeploy is refused. This matches corrections 16 and
  21; they documented it earlier and more precisely.
- `d1-guard-ADDENDUM2` §C1: the repo-vs-live divergence is already in
  `qnfo-ops/patches/2026-09-13-DEPLOY-PATH-and-version-regression.md` §3, with two canonical sources
  disagreeing. My re-derivation carries no discovery credit.
- `d1-guard-ADDENDUM3` §D2: the `add LIMIT n (aggregate exempt)` class is documented in
  `qnfo-ops/docs/RUN-CODE-HARDENING.md` Defect 3 — supporting the withdrawal in correction 20.
- `canonical-drift-audit-ADDENDUM` §3: a prior patch was anchored on the stale 1.1.4 — the same error
  I made, in the same session, on the same artifact.

## 7. This set is closed

Ten addenda, nineteen artifacts, **seven self-corrections**. The durable value is in the measurements
— the burst timings, the token counts, the per-sweep rates, the deployer's own log, the drift scan —
not in the causal narratives, several of which were refuted by the next read.

**The single most useful thing a successor can do is not read this set front to back.** Read the
index, then the four findings that survived scrutiny:

1. The same `[gw-fail]` title was filed 3× (489/654/678) — refiling is real.
2. The deployed calibration artifact is **1.1.5** from `r2:qnfo-canonical/`, not either repo file.
3. The deployer is stuck: `personal-companion` 26/30 and `qnfo-cloud-ops` 25/25 hourly failures.
4. The request logger corrupts `prompt` for messages-array requests (122 rows) while `ops_jobs.payload`
   stores the same conversations correctly.

## Limits

- 1.1.5's contents are unknown; `qnfo-canonical` is not a bound bucket.
- The drift scan is dated 06:05:30Z; `qnfo-backlog-exec` has since gone 1.2.6 -> 1.2.7, so §3's row for
  it is already stale.
- §5's "blocked, not unrun" rests on `fileIssue`'s dedupe as read from the 1.1.4 bundle — which §1
  says is not the live build. **The same caveat applies to it as to everything else read from source.**
- No further addenda will be added to this set.
