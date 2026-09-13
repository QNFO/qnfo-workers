# CORRECTION to FLEET-STATE-VERIFICATION-2026-09-13.md

Written 2026-09-13 ~14:45Z by the same session that produced commit `9c1526e7`.

## The `unversioned = 0` half is WITHDRAWN

The parent document reported `unversioned: 0` as an achievement, after I normalized
`service_registry.version` for `qnfo-gateway` from `3.6.1-subscribers` to strict semver `3.6.1`.

That was wrong, and the artifact itself said so. `qnfo-workers/obsidian-writer/deployed-current.worker.js`
carries this warning in its header:

> The value is deliberately the DEPLOYED BUILD TAG, not a semver. `num()` parses a build tag to
> `[0]`, so canonical and deployed compare EQUAL and this line cannot trigger a redeploy. A semver
> like `"1.0.0"` would parse to `[1,0,0]` and mark the canonical "ahead", **firing a heal PUT of this
> file over production**. Do not "tidy" this into a semver.

So the non-semver form is a **deliberate safety mechanism**, and a semver-normalization pass is an
anti-pattern that can push a heal PUT over a live worker. Separately, the registry should state the
**live** version, and live `/health` reports `3.6.1-subscribers` — my edit made the registry less
accurate.

**Reverted:** the `qnfo-gateway` registry row is back to `3.6.1-subscribers`.

**Consequence for the convention:** `unversioned: 1 (qnfo-gateway)` is not a defect. The FLEET-STATE
directive ("every consolidated hub carries a strict-semver VERSION") and the deployer's safety design
are **mutually exclusive as written**. The deployer side should win until the comparator ignores
non-semver suffixes.

## The `ghost = 0 / unregistered = 0` half STANDS

That is a pure set comparison (55 live names vs 55 registry names, both unique, empty symmetric
difference) and is unaffected by this correction.

## Additional findings from the same file

**1. A self-blinding drift blind spot on 4 workers.** `obsidian-writer`'s canonical carried no version
string, so the scan recorded `scanerr:stale-canon` and **permanently disabled drift detection** for
it. The mechanism is worse than a missing check: the scanner's stale-canon branch **copies the
deployed body into the R2 canonical** and continues, blessing whatever is deployed as canonical.
The header names three more workers with the same defect — `research-daily-brief`,
`qnfo-twin-maintain`, `osf-integrity-check` — and I confirmed `scanerr:stale-canon` independently in
`fleet_deploy_state` for three of the four.

**2. The 404 does not match the canonical.** `obsidian-writer`'s canonical returns **405** for any
non-POST request and 204 for OPTIONS. Live probes of `/health` and `/` returned **404**. So the
deployed artifact differs from the canonical, or the hostname is not routed. Because the scanner
copied deployed into canonical, **the repo cannot be trusted to represent what is live for this
worker** — and the 404 is not evidence the worker is down.

## Method lesson

I optimized a metric (`unversioned → 0`) instead of asking why the metric was 1. The answer was in a
file header I had not read. Read the artifact before normalizing it.
