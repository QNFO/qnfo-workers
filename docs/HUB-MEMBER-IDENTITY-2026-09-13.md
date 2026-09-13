# HUB MEMBER IDENTITY — verified for 6 hubs, and the `version-format` drift root cause

Date: 2026-09-13. Companion to `docs/FLEET-PRODUCTIVITY-AUDIT-2026-09-13.md` (upgrades its §12
from "inferred from counts" to **verified first-member identity**) and to
`docs/HUB-CONFIG-PROVENANCE-2026-09-13.md`. Every value is a tool return from the qnfo-ops
session.

---

## 1. Method

Each hub's repo `worker.js` is a **concatenation of its member modules**. The first module is
therefore readable at the top of the file, and its identity is self-declared. Reading the first
~1.4 KB of each hub's `worker.js` yields the first member directly.

## 2. Result — first member identified in 6 of 6 hubs

| hub | deployed `/health` | repo `worker.js` opens with | first member | in ghost roster? |
|---|---|---|---|---|
| `audit-hub` | `members: 4` | `var auditorMod = …` + `worker: "qnfo-auditor"` | **qnfo-auditor** | **yes** |
| `errata-hub` | `members: 3` | `var erratawatchMod = …` + `QNFO_VERSION = "qnfo-errata-watch/fabric-20260910"` | **qnfo-errata-watch** | **yes** |
| `radar-hub` | `radars: 6` | `var eventsMod = …` + `VERSION="1.0.1"; WORKER="events-radar"` | **events-radar** | **yes** |
| `jnl-pipeline` | (no member field) | `var jnlWatchMod = …` + `UA="jnl-watch/0.1.9"` | **jnl-watch** | **yes** |
| `idea-hub` | `merged:["idea-hub","qnfo-thread-ingest"]` | `var m0 = (function(){ var ideafactoryMod = …` + `QNFO_VERSION="qnfo-idea-factory/fabric-20260910"` | **qnfo-idea-factory** | no (but a known name) |
| `companion-hub` | `members: 4` | `var personalcompanionMod = …` + `VERSION="v1.0.0"` | **personal-companion** (v1.0.0) | standalone (runs v1.1.0) |

**Every first member except `companion-hub`'s appears in the 25-name ghost roster.** That is
independent corroboration of the main audit's §1 conclusion — the ghost rows are absorbed
members, not idle workers — and it was reached from source rather than from counts.

**Note `idea-hub`:** its wrapper uses numbered slots (`var m0 = (function(){ … })`), so the hub
wrapper *is* present in that repo file. Its deployed `/health` `merged` field lists only 2 names
while the file begins at `m0`, so further members exist. This is the one hub whose wrapper is
visible in version control.

## 3. Confirmed count alignments

- `errata-hub` `members: 3` ↔ ghost errata names: `qnfo-errata-publish`, `qnfo-errata-respond`,
  `qnfo-errata-watch` — **exactly 3**, first member verified as `qnfo-errata-watch`.
- `radar-hub` `radars: 6` ↔ ghost radar-family names: `events-radar`, `qnfo-arxiv-radar`,
  `qnfo-research-radar`, `qnfo-citation-watch`, `personal-events-radar`, `job-market-watch` —
  **exactly 6**, first member verified as `events-radar`.
- `audit-hub` `members: 4` ↔ ghost audit-family names: `qnfo-auditor`, `qnfo-blank-audit`,
  `qnfo-error-selfheal`, `qnfo-register-guard` — **exactly 4**, first member verified.
- `companion-hub` `members: 4` ↔ candidate members: `personal-companion` (verified first),
  `personal-events-radar`, `personal-life-indexer`, `personal-life-maintain` — 4, of which the
  last three are ghosts. **Not verified** — inferred from the count and the personal-* family.

## 4. NEW — root cause of the `version-format` drift class

`fleet_drift_report`'s hourly SCAN row reports an error-kind histogram, e.g.
`errKinds={"version-format":14,"stale-canon":4,"health-ver":10}` and later
`{"version-format":17,...}`.

The hub sources show why. Members carry **`fabric-YYYYMMDD` build stamps**, not semver:

    QNFO_VERSION = "qnfo-errata-watch/fabric-20260910"
    QNFO_VERSION = "qnfo-idea-factory/fabric-20260910"

The same stamp appears in `fleet_drift_report` as a `deployed_version` value for other workers
(`qnfo-lifecycle/fabric-20260910`, `qnfo-email/fabric-20260910`,
`qnfo-paper-indexer/fabric-20260910`, `qnfo-qwav/fabric-20260910`,
`qnfo-agent-orchestrator/fabric-20260910`).

So the fleet has **two version vocabularies in one field**: semver (`1.14.1`, `5.25.1`,
`v1.1.0`) and deploy-stamp (`…/fabric-20260910`). A comparator that parses semver cannot order
the second, which is exactly what `version-format: 14–17` reports.

**This is the same defect family as the leading-`v` misparse** documented in
`personal-companion/FINDING-2026-09-13-deploy-loop-DO-NOT-FIX-10021.md` (which found the
comparator reads `v1.1.0` as `[0,1,0]` and therefore classifies a running `v1.1.0` as *behind*
a `1.0.0` canonical). Both defects live in the same comparator and both cause it to act on
version pairs it cannot order.

**Consequence for remediation:** fixing `qnfo-fleet-control/version-compare.mjs` must handle
**both** the leading-`v` case **and** the `name/fabric-YYYYMMDD` stamp case, or the
`version-format` errors will persist after the `v` fix. Any deploy of the hub members would also
inherit the stamp, propagating the problem.

**Caveat:** I read the version *strings* and the drift *counts*; I did not read the comparator
source (the archive pointer documented in the DO-NOT-FIX finding does not resolve). The link
between the stamp format and the `version-format` counter is an inference from two matching
observations, not a read of the code that emits the counter.

## 5. Incidental

- `errata-hub/worker.js` is **750,226 bytes** — the largest hub by an order of magnitude
  (`idea-hub` 146,817; `jnl-pipeline` 108,292; `companion-hub` 101,530; `audit-hub` 56,702;
  `radar-hub` 38,953). Its top carries a duplicated import:
  `import { Buffer as Buffer2 } from "node:buffer";` twice in a row.
- `errata-hub`'s member authenticates with a header named **`X-Erratta-Token`** (note the
  misspelling "Erratta" vs the secret `ERRATA_TOKEN`). A client using the correct spelling
  `X-Errata-Token` would be rejected. Worth confirming the deployed clients use the misspelled
  header.
