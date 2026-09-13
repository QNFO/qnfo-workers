# Red-team remediation — ADDENDUM (2026-09-13, qnfo-ops / ops-exec)

Extends `qnfo-ops/docs/REDTEAM-CLOSEOUT-2026-09-13.md`. Same session, same evidence rule.

## A1. Fourth fix — `qnfo-error-selfheal` v1.0.3 — commit `4c5540e8`

**Defect found this session (not in any prior report).** The 5xx-spike cooldown parser read:

```js
const m = lastSpike.message.match(/(d+)s+ins+60m/);
```

`(d+)`, `s+`, `ins+` are **literal characters**, not the intended character classes
`(\d+)`, `\s+`, `\s+`. The pattern therefore never matches the message this same file
writes one branch above:

```
"http_requests 5xx spike: " + edge5xx + " in 60m (qnfo.org)"
```

Consequence chain:

1. `m` is always `null` → `prevN` stays **0** on every run.
2. The gate `if (prevN === 0 || cooldownOk || growthOk)` is therefore **permanently true**
   whenever `edge5xx > 20` — the 6-hour cooldown and the 1.5x growth check can never engage.
3. Inside that branch the `agent_issues` insert is dup-guarded, but the **`alerts` insert is
   unconditional** → the worker can emit one 5xx alert per hourly run.
4. `scanAlertStorms()` in the same worker then polices that stream as an `ALERT-STORM`
   flood — a self-inflicted alert source.

**Test (run_code, verbatim source):**

| pattern | `"...42 in 60m (qnfo.org)"` | `"...137 in 60m"` | `"...1204 in 60m"` |
|---|---|---|---|
| shipped `/(d+)s+ins+60m/` | NO MATCH | NO MATCH | NO MATCH |
| corrected `/(\d+)\s+in\s+60m/` | prevN=42 | prevN=137 | prevN=1204 |

Branch-condition test: with a spike 10 min ago, shipped `prevN=0` → condition **true**
(alert fires inside cooldown); corrected `prevN=42` → condition **false** (suppressed).

**Verification of the write itself.** The file (11,507 B) is under the 32,768-char read cap,
so a verbatim full-file write was possible. The byte delta was then proved exact:

| edit | bytes |
|---|---|
| v1.0.3 comment block (10 lines) | 902 |
| VERSION comment extension | 31 |
| inline `scan()` comment | 101 |
| regex replacement (`\d` + `\s` escapes) | 3 |
| **explained total** | **1037** |
| **actual delta (11507 → 12544)** | **1037** |

**Exact match** — every byte of the change is accounted for, so the committed file is
byte-identical to the original apart from the four intended edits. This is the mitigation
for the transcription risk that a full-file rewrite carries; it is why this fix could be
applied directly while `qnfo-ai-calibration` had to go through a patcher.

## A2. F6 — probe target NOT located; the finding is characterised, not fixed

F6 (high) was reported as "AI-endpoint health probes `*.q08.workers.dev` which returns 404
to external clients; also probes merged worker `qnfo-ai-chat`". Re-verified and extended,
but the **checker itself was not found** in the canonical repo.

Re-confirmed live: `web_fetch https://qnfo-ai.q08.workers.dev/health` → **HTTP 404**.

Reconstructed from `issue_ledger` (`source='worker-health'`, 32 open rows) — the checker
probes five targets:

| target | status | note |
|---|---|---|
| `qnfo-ai` | **530** `error code: 1016` | 11 occurrences, last_seen 2026-09-13T06:20:37Z |
| `personal-api` | **530** `error code: 1016` | same signature |
| `qnfo-ai-chat` | 530 `1016` / 404 | **not in the 55-worker fleet, not in service_registry** |
| `personal-api-chat` | 404 | **not in the fleet** |
| `qnfo-idea-factory` | **200** | reachable — so this is target-specific, not fleet-wide |

Interpretation: `1016` is an edge DNS/origin-resolution failure. The pattern —
same-account `workers.dev` fetches failing from *inside* a Worker — is exactly the
condition `qnfo-ai-calibration` already documents as **SVC-BINDING-1** ("same-account
workers.dev fetches 404 at the edge from inside a Worker, verified live 2026-09-04"), and
which is why that worker probes via service bindings instead. `qnfo-idea-factory`
answering 200 while `qnfo-ai`/`personal-api` fail is consistent with hostname/route drift
rather than an outage. The `qnfo-ai-chat` / `personal-api-chat` targets are **stale** —
they do not exist in the current fleet.

Searched and **excluded** (no worker-health sweep present): `qnfo-infra`,
`qnfo-observability` (`worker.js` + `fleet.js`), `qnfo-pipeline-ops`, `qnfo-blank-audit`,
`qnfo-error-selfheal`. The checker therefore lives outside the mirrored directories in
`QNFO/qnfo-workers` (candidate: the unmirrored `rwnq8/qnfo-cloudflare-workers`, or a
worker whose directory name does not match its script name).

**Honest status: characterised, not remediated.** Fix requires either switching the
checker to service bindings (as `qnfo-ai-calibration` already does) or deleting the two
stale `*-chat` targets — both blocked on locating the source.

## A3. Incidental finding — the alert storm is already fixed in source

`qnfo-pipeline-ops/worker.js` is at **v0.5.3-alert-dedup** and already gates
`escalateTerminal()` and `intakeWatchdog()` on `r.inserted`, matching the pattern
`escalateVersion()` used. The header records the measurement: **765 critical alerts,
~96/day for two unchanged terminal failures**. The open rows #644/#651 remain, but the
storm generator is fixed in source — it is a **deploy** gap, not a code gap. This
supersedes the memory entry that treats the alert storm as unresolved.

## A4. Updated commit ledger

| commit | artifact |
|---|---|
| `1cca0e95` | `qnfo-ops/docs/REDTEAM-REMEDIATION-2026-09-13.md` — capability test |
| `460481db` | `ai-health-prober/worker.js` v2.3.3 |
| `de86d3f4` | `qnfo-ai-calibration/apply-calibration-fix.mjs` v2 |
| `ada30500` | `qnfo-ops/docs/REDTEAM-CLOSEOUT-2026-09-13.md` |
| `4c5540e8` | `qnfo-error-selfheal/worker.js` v1.0.3 |
| this file | addendum |

## A5. Uncertainty

- The `qnfo-error-selfheal` fix is **source-only**; live version is 1.0.2.
- The byte-delta proof confirms the *write* is faithful; it does not test the *logic* at
  runtime. The regex behaviour was tested in isolation with `run_code`, not inside the
  deployed Worker.
- `1016` being an edge-DNS failure is inferred from the Cloudflare error code and the
  SVC-BINDING-1 precedent, not from a read of Cloudflare's error-code documentation.
- The stale-target claim for `qnfo-ai-chat` / `personal-api-chat` rests on their absence
  from `fleet_status` (55 workers) and the F6 evidence; the checker's own target list was
  never enumerated from source.
