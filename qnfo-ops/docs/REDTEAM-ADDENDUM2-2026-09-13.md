# Red-team remediation — ADDENDUM 2 (2026-09-13, qnfo-ops / ops-exec)

Extends `REDTEAM-CLOSEOUT-2026-09-13.md` and `REDTEAM-ADDENDUM-2026-09-13.md`.

## B1. F6 LOCALISED — the `worker-health` checker is a `qnfo-cloud-ops` job

Addendum 1 recorded F6 as "characterised, not remediated — target not found after excluding
five candidate workers". That investigation gap is now **closed**. The target was found via
`service_discover` (the machine-readable registry), not by reading worker directories —
the tool I should have reached for first.

Registry entry:

```
service: qnfo-cloud-ops
version: 1.14.1
capabilities: ["scheduled","weekly-visibility-digest","p7-scorecard",
               "outreach-drain-gate","ai-endpoint-health","seo-health","job-runner"]
routes: ["/health","/run","/search","/record"]
```

`qnfo-cloud-ops/worker.js` contains a job table `AMS_SCHEDULE` with an entry:

```js
"worker-health":  { times: ["05:05", "17:05"], days: "*",   fixed: null },
```

That is the emitter of `issue_ledger.source = 'worker-health'`.

### Timing confirmation (run_code, verbatim `buildCrons`)

`buildCrons(offset)` subtracts the Europe/Amsterdam UTC offset to produce the UTC cron:

| offset | generated cron |
|---|---|
| +2 (CEST, summer) | `5 3,15 * * *` |
| +1 (CET, winter) | `5 4,16 * * *` |

Against the 11 ledger firings for this source:

| ledger timestamp (UTC) | predicted 03:05/15:05 | |
|---|---|---|
| 2026-09-13T03:05:38.245Z | 03:05 | MATCH |
| 2026-09-12T15:05:18.581Z | 15:05 | MATCH |
| 2026-09-12T03:05:41.151Z | 03:05 | MATCH |
| 2026-09-11T15:05:29.841Z | 15:05 | MATCH |
| 2026-09-11T03:05:26.157Z | 03:05 | MATCH |
| 2026-09-10T15:05:38.484Z | 15:05 | MATCH |
| 2026-09-10T03:06:03.578Z | 03:06 | 58 s dispatch delay |
| 2026-09-09T15:05:03.130Z | 15:05 | MATCH |
| 2026-09-09T03:05:02.791Z | 03:05 | MATCH |
| 2026-09-08T15:05:02.885Z | 15:05 | MATCH |
| 2026-09-08T03:05:37.785Z | 03:05 | MATCH |

**11/11 explained** (10 exact + 1 cron dispatch delay). The identification is not a
plausible guess — the firing cadence matches to the second.

### Why this could not be fixed from this endpoint

`qnfo-cloud-ops/worker.js` is **129,467 bytes**. The read tool truncates at 32,768 chars
with no offset parameter, and the `worker-health` job body lies in the truncated region
(beyond the `// ================= PART 3` boundary). Consequences:

- The probe URL list and the failure predicate **cannot be read**, so no anchor can be
  derived and no patcher can be written (the `qnfo-ai-calibration` approach requires at
  least the exact target strings).
- A full-file rewrite is impossible by construction — it would ship ~97 KB of guessed code.

**This is now a precise, bounded blocker** ("a 129 KB file whose relevant region is
unreadable"), not an open investigation. Recommended fix for a runner with filesystem
access, in priority order:

1. Switch the `qnfo-ai` / `personal-api` probes to **service bindings** — `qnfo-cloud-ops`
   already binds `EMAIL` and `QNFO_OPS`, and `qnfo-ai-calibration` probes via `QNFO_AI`
   for exactly this reason (its SVC-BINDING-1 note: "same-account workers.dev fetches 404
   at the edge from inside a Worker, verified live 2026-09-04").
2. **Delete the stale targets** `qnfo-ai-chat` and `personal-api-chat` — neither appears in
   `fleet_status` (55 workers) nor in the 55-entry service registry. They were merged away;
   the checker still probes them.

## B2. Independent corroboration of the source/deploy divergence

The registry reports `ai-health-prober` at version **2.3.1**. The repo source read this
session was **2.3.2** (now **2.3.3**, commit `460481db`), and `deployed-current.worker.js`
is **2.3.1**. So the registry independently confirms the divergence that the v2.3.3 commit
message asserts — the fix is real, and it is unshipped.

## B3. Registry hygiene note (not remediated)

Of 55 registered services, **12 carry empty `capabilities`/`routes`/`tools` arrays and
`purpose: null`** (e.g. `ai-health-prober`, `audit-hub`, `companion-hub`, `errata-hub`,
`idea-hub`, `jnl-pipeline`, `personal-companion`, `qnfo-ai-search`, `qnfo-backlog-exec`,
`qnfo-email`, `qnfo-email-orchestrator`, `qnfo-kaizen`). `service_discover` is therefore
only partially usable as a routing oracle — it found `qnfo-cloud-ops` only because that
service self-registers with a full capability list. `qnfo-fleet-dashboard` separately
declares `fleet-probe` (15-min probes to `fleet_probe_log`) and lists `qnfo-ai`,
`personal-api`, `qnfo-gateway`, `qnfo-ops`, `qnfo-outreach`, `qnfo-paper-reviser`,
`qnfo-social`, `qnfo-kaizen`, `personal-events-radar` as deps — **no `*-chat` targets**,
which further supports B1's conclusion that the stale `*-chat` probes belong to
`qnfo-cloud-ops`, not to the dashboard prober.

## B4. Final commit ledger

| commit | artifact |
|---|---|
| `1cca0e95` | `qnfo-ops/docs/REDTEAM-REMEDIATION-2026-09-13.md` |
| `460481db` | `ai-health-prober/worker.js` v2.3.3 |
| `de86d3f4` | `qnfo-ai-calibration/apply-calibration-fix.mjs` v2 |
| `ada30500` | `qnfo-ops/docs/REDTEAM-CLOSEOUT-2026-09-13.md` |
| `4c5540e8` | `qnfo-error-selfheal/worker.js` v1.0.3 |
| `bdbec390` | `qnfo-ops/docs/REDTEAM-ADDENDUM-2026-09-13.md` |
| this file | F6 localisation |

## B5. Uncertainty

- The `worker-health` job body was **never read**. Its probe list is inferred from the
  ledger's recorded failure payloads (`worker` + `status` + `error` per target), not from
  source. The cadence match is strong, but the job could probe additional targets that
  never fail and therefore never appear in the ledger.
- "05:05 and 17:05 are Europe/Amsterdam wall-clock" is read from `AMS_SCHEDULE` and the
  file's own header ("Amsterdam wall-clock preserved via DST sync"). The winter cron
  `5 4,16 * * *` is a prediction from `buildCrons`, not an observation — no ledger row in
  this window falls in CET.
- `1016` being an edge DNS/origin failure remains inferred from the error code and the
  SVC-BINDING-1 precedent, not from Cloudflare's error-code documentation.
