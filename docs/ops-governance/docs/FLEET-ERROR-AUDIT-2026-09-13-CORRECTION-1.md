# CORRECTION 1 — `docs/FLEET-ERROR-AUDIT-2026-09-13.md` §3 H8 is wrong

Date: 2026-09-13, same session. Supersedes H8 and qualifies §0 and §7 of the audit.

## What I claimed

> **H8 — Probe path wrong.** `GET /health` → HTTP 404 on `qnfo-citation-watch`,
> `job-market-watch`, `qnfo-observability`. 404 = no route, not a crash.

and, in §0, that the 43 workers reporting `healthy:null` were "unmeasured, not broken".

## What the control experiment shows

Every `*.q08.workers.dev` fetch from the qnfo-ops endpoint returns **404**. Non-q08 hosts
return **200** through the same tool in the same minute.

| URL | result |
|---|---|
| `https://example.com` | **200** |
| `https://ideas.qnfo.org/` | **200** |
| `https://qnfo-lifecycle.q08.workers.dev/` | 404 |
| `https://qnfo-lifecycle.q08.workers.dev/health` | 404 |
| `https://qnfo-ai.q08.workers.dev/health` | 404 |
| `https://qnfo-agent-ws.q08.workers.dev/health` | 404 |
| `https://companion-hub.q08.workers.dev/health` | 404 |
| `https://qnfo-pdf.q08.workers.dev/health` | 404 |
| `ai-health-prober` · `audit-hub` · `qnfo-events` · `qnfo-impact` · `qnfo-infra` · `qnfo-outreach` · `radar-hub` · `qnfo-intent-orchestrator` `.q08.workers.dev/health` | **404 (8/8)** |
| `qnfo-citation-watch` · `job-market-watch` · `qnfo-observability` `.q08.workers.dev/health` | **404 (3/3)** |

**16 of 16 `q08.workers.dev` URLs → 404. 2 of 2 non-q08 URLs → 200.**

## The falsifier

`fleet_status` probed **`qnfo-ai` and `qnfo-lifecycle` successfully over service bindings in
the same session** — `healthy:true, http:200, qnfo-ai v5.25.1`, `qnfo-lifecycle v1.6.1`.

So the workers are up. The **public `q08.workers.dev` host is not routable from this endpoint**.
A 404 on that host carries **no information** about any individual worker's health.

## Consequences

1. **H8 is retracted.** "404 = no `/health` route" is unsupported. The 404s are a host-level
   routing artefact, uniform across workers that are known to be alive.
2. **The 43 `healthy:null` workers remain unmeasured** — and now *unmeasurable* by this route.
   The only trustworthy fleet-health signal available is `fleet_status`'s service-binding probe
   (**12/55 → http 200**).
3. **This is a self-inflicted error source.** Any fleet sweep that probes `*.q08.workers.dev`
   fails 100% of the time. That is a large share of the **280 `web_fetch` failures in 24h**
   reported by `telemetry_report`. The observability layer is inflating the error count it
   measures — so "the fleet shows numerous errors" is partly the probe, not the fleet.
4. **Prior-session contradiction.** An earlier session recorded `200` from
   `qnfo-agent-ws`, `companion-hub`, `calendar-api`, `errata-hub`, `fleet-exec`, `jnl-pipeline`,
   `osf-integrity-check` and `qnfo-pdf` on these same URLs. Either routing changed between then
   and now, or that session's measurements are not reproducible from here. I did not resolve
   which — both readings are consistent with the data I hold.
5. **§0's framing survives, its evidence does not.** "43 unprobed ≠ 43 broken" still holds, but
   it now rests on the binding probe, not on the 404 probes.

## Addendum — the provenance guard was executed after all

§7 of the audit said the guard was unverified because this endpoint has no shell. Its
**decision logic was executed in `run_code`** (Cloudflare isolated compute), reimplemented
line-for-line from the committed script:

```
branches: 11 pass, 0 mismatch of 11
real fleet state -> fails=0 warns=3 exit(non-strict)=0 exit(strict)=1
```

Every branch was exercised with fixtures: duplicate-snapshot FAIL, valid attestation PASS,
attest sha-mismatch, unparseable attest, missing-snapshot FAIL, canonical-ahead WARN,
drift-without-patcher INFO, VERSION-UNBUMPED, plus the two real worker states:

| fixture | result |
|---|---|
| `qnfo-pipeline-ops` (20030/`a7580136` vs 16933/`350aefa2`, patcher targets `0.5.4`, canon `0.5.5`) | `WARN:STAGED-NOT-DEPLOYED` |
| `qnfo-research-exec` (80916/`6aea7f5d` vs 46180/`55e0e56f`, patcher targets `0.8.1`, canon `0.8.1`) | `WARN:STAGED-NOT-DEPLOYED`, `WARN:VERSION-UNBUMPED` |

**Caveat:** this verifies the *logic*, not the *file*. The committed script's filesystem walk,
`crypto` usage and YAML wiring remain unexecuted until the CI job runs.
One dead path confirmed: the script's documented `exit 2 (usage error)` is unreachable.

## What this correction does not change

H1 (931-alert storm from an undeployed fix), H2 (40/40 masked v2-drain failures), H3
(`version_queue` id=18 stalled), H4–H7, H9, H10, the P0 credential exposure, the falsified
"496 stuck `new`", and the blocked `ops_issue_run` all stand as measured.
