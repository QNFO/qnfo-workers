# ADDENDUM to FINDING-2026-09-13-canonical-drift-audit.md — drift DIRECTION resolved, and three corrections to my own reporting

Author: qnfo-ops / ops-exec, 2026-09-13. Source: `fleet_drift_report` (qnfo-audit D1), latest scan
`2026-09-13 06:05:30`, per-worker rows `06:01:42`–`06:04:12`. Supersedes the SHA-only method in the
parent finding for any *fleet-wide* claim.

---

## 1. The fleet's own scanner answers the question I said I could not answer

The parent finding stated: *"SHA inequality proves the files differ but NOT which side is newer."*
That is true of SHAs, and I should not have left it there — the fleet's drift scanner records
`deployed_version` and `canonical_version` per worker, which resolves direction directly.

Latest scan summary row (verbatim):

```
cron: scanned=55 clean=33 drifted=9 ahead=9 healed=0 errors=0 staleCanon=4 healthVer=10
      errKinds={"version-format":19,"stale-canon":4,"health-ver":10}
      regOpen=99 regOverdue=26 regDue7=51 regEscalated=
```

**18 of 55 workers mismatched** (9 `canonical-ahead` + 9 `deployed-ahead`), 33 clean, 0 scan errors.

## 2. Direction, per worker (latest scan)

**`deployed-ahead` — a redeploy would REGRESS these 9:**

| worker | deployed | canonical |
|---|---|---|
| qnfo-ai | 5.25.1 | 5.21.3 |
| qnfo-fleet-dashboard | 1.5.1 | 1.1.0 |
| qnfo-ops | 2.15.1 | 2.13.0 |
| qnfo-signal-loop | 1.1.2 | 1.1.0 |
| personal-api | 3.5.0 | v3.2.2-maxout200k |
| **qnfo-backlog-exec** | **1.2.6** | **1.2.4** |
| qnfo-ai-calibration | 1.1.5 | 1.1.4 |
| qnfo-research-exec | 0.8.1 | 0.5.17-research-restored |
| qnfo-fleet-control | 0.3.4 | 0.3.3 |

**`canonical-ahead` — 9, but only ONE is a clean comparison:**

| worker | deployed | canonical | note |
|---|---|---|---|
| qnfo-cloud-ops | 1.14.1 | 1.14.1-gtd-guard | semver vs semver — **the only reliable row** |
| qnfo-qwav | `qnfo-qwav/fabric-20260910` | 2.1.0 | deployed string not semver |
| qnfo-paper-indexer | `…/fabric-20260910` | 2.2.0+scheduled-daily | not semver |
| qnfo-lifecycle | `…/fabric-20260910` | 1.6.1-memory-maintain-fixed | not semver |
| qnfo-email | `…/fabric-20260910` | 0.3.4-glm53 | not semver |
| qnfo-ddocs-indexer | `…/fabric-20260910` | 1.0.0+server-side | not semver |
| qnfo-archive | `…/fabric-20260910` | 1.2.0+cors-fixed | not semver |
| qnfo-agent-orchestrator | `…/fabric-20260910` | v1.0.0 | not semver |
| personal-companion | v1.1.0 | 1.0.0 | leading `v` vs bare |

**8 of the 9 `canonical-ahead` rows are unverifiable as stated.** Seven report a
`<worker>/fabric-20260910` string as the *deployed version* — a non-semver placeholder, which is
itself the `version-format: 19` error class the scanner counts. A comparison between
`qnfo-qwav/fabric-20260910` and `2.1.0` cannot establish ordering; the scanner's own note may be an
artifact of unparseable input. **Do not act on those 8.** Only `qnfo-cloud-ops` (1.14.1 vs
1.14.1-gtd-guard) supports its `canonical-ahead` label.

## 3. Correction 1 — my calibration patch was anchored against a STALE file, not the live worker

The scanner reports `qnfo-ai-calibration` **deployed 1.1.5 / canonical 1.1.4**.

Earlier this session I stated I had "read the live bundle (`3624a4da…`, `VERSION = "1.1.4"`) and
confirmed all five anchors verbatim." `3624a4da` is the blob SHA of
`qnfo-ai-calibration/deployed-current.worker.js` — **a repo file, not the live worker.** The live
worker is **1.1.5**.

So: the five anchors were verified against a **stale snapshot one version behind production**. This
is precisely the error I flagged in the parent finding as RC-6 — "the deployed source is not the repo
source" — committed by me, in the same session, on the artifact I described as verified. The patch's
applicability to production is **not established**; it must be re-verified against 1.1.5 before use.

## 4. Correction 2 — my reason for declining the qnfo-cloud-ops write rested on a false premise

I declined to write the 129 KB `qnfo-cloud-ops/worker.js`, arguing "benefit is zero (deployed already
*is* 1.14.1-gtd-guard), risk is a bad byte deployed to the fleet's cron scheduler."

The scanner says **deployed 1.14.1, canonical 1.14.1-gtd-guard** — i.e. the canonical carries a suffix
the deployed does not. My premise was wrong: the benefit is not zero, it is unknown. The decision to
decline may still be right on rollback grounds (a 121 KB original that cannot be cleanly restored), but
**the stated reason was false** and the write decision should be re-made on correct facts.

## 5. Correction 3 — my drift audit now supersedes itself on fleet-wide claims, and my own write adds drift

The parent finding audited 24 workers by blob SHA and reported "12 of 24". The scanner's census is
**18 of 55** by version. These are different methods over different populations and neither
contradicts the other, but for any statement about *the fleet*, the scanner's 55-worker census is
authoritative and my 24-worker sample is not. The parent finding already labelled itself a sample;
this addendum makes the replacement explicit.

**And a risk I introduced.** My earlier write to
`qnfo-pipeline-ops/deployed-current.worker.js` (`0.5.3-alert-dedup` → `0.5.4-summary-dedup`) landed at
~06:2xZ, **after** the 06:05:30 scan — which is why `qnfo-pipeline-ops` does not appear as drifted
above. On the next scan it should appear as `canonical-ahead` (canonical 0.5.4 vs deployed 0.5.3).

That matters because of the control plane's documented precondition: auto-heal must not be enabled
while canonical is ahead of deployed. `auto_heal` defaults to `'0'` (fail-closed), so nothing will
deploy it today — but **I have created a canonical-ahead condition for a bundle I authored and never
syntax-checked** (`node --check` is not available to this endpoint; the repo's own hotfix runbook
requires it before deploy). If auto-heal were ever switched on, the control plane would deploy that
file. This is a real, self-inflicted hazard and it should be either syntax-verified or reverted.

## 6. What is still not established

- **Why the 7 workers report `fabric-20260910` as a deployed version.** I have not read the emitter.
  Until that is fixed, the scanner's `canonical-ahead` label is unreliable for those workers.
- **`staleCanon=4` and `healthVer=10`** are counted but not itemised in the scan row, and no per-worker
  rows carry those notes in the window I queried. Unresolved.
- **`regOpen=99 / regOverdue=26 / regDue7=51`** — registry entries open and overdue. Not investigated.
- **Whether `deployed-current.worker.js` is ever refreshed from the live worker.** For
  `qnfo-ai-calibration` it is one version behind; I did not establish whether that is systematic across
  the fleet, which would make every repo-based drift audit unsound at the root.
