# PATCH artifact dispositions (PATCH-ARTIFACTS-RECONCILED-1)

Issue #1693 (PATCH-ARTIFACTS-UNRECONCILED-1), 2026-10-01. Each diff was checked against the current `worker.js`
on main. The live versions came from `fleet_deploys`: qnfo-ops 2.38.20 and qnfo-fleet-dashboard 1.7.43. All six files
are removed. Git history keeps their content.

| File | Disposition | Evidence on main (and live) |
|---|---|---|
| `qnfo-ops/PATCH-2026-09-22-attachment-empty-guard.diff` | applied, superseded form | The `ATTACHMENT-EMPTY-GUARD-1` regex guard was replaced by `attachmentGuard()` / `attachmentGuardXml()`, which emit `OPS-ATTACHMENT-GUARD` for a nonzero FILE_SIZE with empty FILE_CONTENT. |
| `qnfo-ops/PATCH-2026-09-26-attachment-guard-xml-form-and-telemetry-hours.diff` | empty | 0 lines. The xml-form guard it named is `attachmentGuardXml()` on main. |
| `qnfo-ops/PATCH-2026-09-27-registry-capability-preserve.diff` | applied | The full capability list (including `full-fleet-probes`) is in the registry capabilities on main. |
| `qnfo-ops/PATCH-2026-09-30-output-cap-decoupling.diff` (#1531) | applied | `function gwMaxOut(env)` exists and every OpenAI-shaped body clamps with `Math.min(..., gwMaxOut(env))`. |
| `qnfo-ops/aigw-routing.patch` | rejected, obsolete | Written against qnfo-ops `2.31.0` (`AIGW_URL`, `upstreamChat`). Neither symbol exists on main, and routing now goes through `callDeepSeek` / the gateway compat path, so the patch cannot apply and its design was not adopted. |
| `qnfo-fleet-dashboard/PATCH-2026-09-30-outreach-gate-derive.diff` | applied | `OUTREACH-GATE-DERIVE-1` is in `execTargetFor` (the outreach refusal derives from the live activation instant). |
