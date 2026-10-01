# qnfo-fleet-control

Canonical source for the merged fleet-control hub worker (advisors + calibrator + deploy/drift).

- Deploy method: Cloudflare API `PUT /accounts/{acct}/workers/scripts/qnfo-fleet-control/content`
  with multipart `metadata={main_module:"worker.js"}` + `worker.js` part **including filename="worker.js"**.
  This preserves all 23 existing bindings (verified 2026-09-12).
- Do NOT deploy via wrangler: it would drop the script-API-managed bindings (BINDING-PRESERVATION-1).
- Deployed version: 0.4.11 (qnfo-fleet-deploy / drift scanner).

## 2026-09-12 change (self-heal wiring)
`scan()` now writes a row to `self_heal_actions` (qnfo-audit D1) for every
`drifted` / `stale-canon` / `health-ver` finding, with a `status`
(healed|failed|deferred|detected) and `verified_at`. Replaces a count-and-skip
path that re-observed the same unhealed problems every cycle.

## PROFILE-CLAIMS-SCRUB-1 (0.4.79, 2026-10-01, pillar reach)

When PORTFOLIO-LOOP-1 writes `QNFO/.github/profile/README.md`, it first applies `PF_PROFILE_SCRUB`: exact
`[from, to]` pairs that replace the hand-written claims the public record does not support (the $10M NHTS
"co-directed" line, a patent line with no application numbers, "predictive analytics at Deloitte and Publicis", Empowering
Change as QNFO's current 501(c)(3), "scientific research incubator", stale record counts, a duplicated ledger row) and
swap the theory-first publication list for the STRATEGY-1 s2.4 selected works. Each pair is a no-op once applied;
drifted text is left alone. Tests: `portfolio.test.mjs` (scrub section).
