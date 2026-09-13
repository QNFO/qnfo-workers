# Addendum 2 — the two failing deploys fail for different reasons

Date: 2026-09-13. Author: qnfo-ops. Companion to `FINDING-2026-09-13-deploy-loop-downgrade.md`
and `FINDING-2026-09-13-deploy-loop-ADDENDUM.md`.

## The precision

The main finding and addendum 1 treated the two targeted workers together. The latest
`fleet_deploys` rows show they are **not the same defect**:

| id | worker | from | to | ok | ts |
|---|---|---|---|---|---|
| 63 | `qnfo-cloud-ops` | `1.14.1` | **`1.14.1-gtd-guard`** | 0 | 06:02:29 |
| 62 | `personal-companion` | `v1.1.0` | **`1.0.0`** | 0 | 06:01:45 |
| 61 | `qnfo-cloud-ops` | `1.14.1` | `1.14.1-gtd-guard` | 0 | 05:03:32 |
| 60 | `personal-companion` | `v1.1.0` | `1.0.0` | 0 | 05:01:38 |

**`personal-companion` is a downgrade** — `v1.1.0 → 1.0.0`, a lower version over a higher one.

**`qnfo-cloud-ops` is not a downgrade** — `1.14.1 → 1.14.1-gtd-guard` is the *same* version with a
**hyphenated suffix** appended. That is a **HUB-VERSIONING-1 violation**: the fleet convention is
strict `X.Y.Z` with meaning preserved as **`+build`** metadata, not `-prerelease`. A separate session
wrote `qnfo-ops/scripts/normalize-version-semver.mjs` for exactly this class, converting
`0.5.3-failclosed` → `0.5.3+failclosed` on three workers.

So the loop is **adding** a hyphen where the fleet's own rule says `+`. Two live conventions conflict,
and the deploy fails either way.

## Why this matters for the fix

The instruction "fix the deploy loop" is ambiguous and would produce the wrong fix:

- For **`personal-companion`**, the target itself is wrong. Repairing the transport lands a downgrade.
  The target must change to the v1.1.0 source.
- For **`qnfo-cloud-ops`**, the target version is wrong in its *form*. Repairing the transport lands a
  hyphenated suffix that the fleet convention rejects — the version string needs to become
  `1.14.1+gtd-guard` (or `1.14.1`), not the transport repaired.

Neither fix is the other, and neither is "repair the `400`".

## What remains unverified

- **Whether `1.14.1-gtd-guard` is rejected by Cloudflare or by the fleet's own validator.** The stored
  note is truncated; the full `10021` body is not in D1. Not guessed at.
- **Which side appends the suffix** — the deploy script, or a canonical bundle filename in R2
  `qnfo-canonical` (not readable from this endpoint).
- Whether the two workers' failures share a transport cause at all. They may not: one could be a
  version-direction rejection and the other a filename/format rejection, which would mean **two
  independent bugs** behind one symptom.
