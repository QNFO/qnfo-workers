# FINDING — 7 staged fixes are stranded by version FORMAT, and the heal path cannot carry multi-module workers

Date: 2026-09-13T14:40Z · Author: qnfo-ops / ops-exec
Source: live `fleet_drift_report` (scan 14:05:46, per-worker rows 14:02-14:04), `fleet_deploys`,
`fleet_deploy_state`. All values quoted verbatim.

## 1. The scan, in full

```
scanned=55 clean=33 drifted=9 ahead=9 healed=1 errors=0 staleCanon=4 healthVer=10
errKinds={"version-format":14,"stale-canon":4,"health-ver":10}
regOpen=99 regOverdue=26 regDue7=51 regEscalated=
```

`ahead=9` but `healed=1`. That gap is the whole finding.

## 2. The 18 drift rows, split

**canonical-ahead (9)** — a change is waiting in the repo:

| worker | deployed | canonical |
|---|---|---|
| qnfo-agent-orchestrator | `qnfo-agent-orchestrator/fabric-20260910` | `v1.0.0` |
| qnfo-archive | `qnfo-archive/fabric-20260910` | `1.2.0+cors-fixed` |
| qnfo-backlog-exec | `1.2.7` | `1.2.8` |
| qnfo-ddocs-indexer | `qnfo-ddocs-indexer/fabric-20260910` | `1.0.0+server-side` |
| qnfo-email | `qnfo-email/fabric-20260910` | `0.3.4-glm53` |
| qnfo-lifecycle | `qnfo-lifecycle/fabric-20260910` | `1.6.1-memory-maintain-fixed` |
| qnfo-observability | `1.1.3` | `1.1.4` |
| qnfo-paper-indexer | `qnfo-paper-indexer/fabric-20260910` | `2.2.0+scheduled-daily` |
| qnfo-qwav | `qnfo-qwav/fabric-20260910` | `2.1.0` |

**deployed-ahead (9)** — production is newer than the repo (the commit-from-canonical hazard):

| worker | deployed | canonical |
|---|---|---|
| personal-api | `3.5.0` | `v3.2.2-maxout200k` |
| personal-companion | `1.1.0` | `1.0.0` |
| qnfo-ai | `5.25.1` | `5.21.3` |
| qnfo-ai-calibration | `1.1.5` | `1.1.4` |
| **qnfo-fleet-control** | **`0.3.4`** | **`0.3.3`** |
| qnfo-fleet-dashboard | `1.5.1` | `1.1.0` |
| **qnfo-ops** | **`2.15.7`** | **`2.15.6`** |
| qnfo-research-exec | `0.8.1` | `0.5.17-research-restored` |
| qnfo-signal-loop | `1.1.2` | `1.1.0` |

`qnfo-fleet-control`'s canonical is **`0.3.3`** — which is the *fleet-advisor's* version, not
fleet-control's. This is the live confirmation of the merged-bundle version-extraction defect
predicted earlier: the control plane's canonical reads another module's `VERSION`.

## 3. Seven staged fixes are un-shippable, and the reason is the version FORMAT

Read the canonical values in §2. Several carry **descriptive fix suffixes**:

```
1.2.0+cors-fixed        1.0.0+server-side
1.6.1-memory-maintain-fixed      2.2.0+scheduled-daily
```

Those are completed fixes sitting in the repo, marked canonical-ahead — and never deployed.

Why not: in **7 of the 9** canonical-ahead rows the deployed side is a **build tag**
(`<worker>/fabric-20260910`), while the canonical is a semver-ish string. The scanner counts
**`version-format: 14`** errors — a mismatch class distinct from `stale-canon` (4) and
`health-ver` (10). The only canonical-ahead row with **clean semver on both sides** is
`qnfo-backlog-exec` (`1.2.7` vs `1.2.8`) — and that is precisely the **one that healed**
(`fleet_deploys`: `redeployed 1.2.7 -> 1.2.8`, `ok=1`, 14:02:44).

**Inference (not proven):** a build-tag/deployed mismatch is classified `version-format` and
**excluded from the heal path**. If so, those 7 workers can never receive an autonomous fix while
their deployed version reports a build tag — the fix is stranded by *format*, not by content.
I cannot confirm this without `qnfo-fleet-control`'s source (75,875 B, over the read cap).

The comparator behaviour this implies — `num("[0,0,0]") > num("[0]")`, i.e. an equal prefix with a
longer array counts as *newer* — is consistent with every row above and with the earlier
`newer("v1.1.0","1.0.0") = false` reproduction.

## 4. The heal path cannot carry a multi-module worker

The one canonical-ahead row that was *attempted* and failed gives the cause verbatim:

```
worker: qnfo-observability   actor: deploy   ok: 0   ts: 2026-09-13 14:04:01
HTTP 400 {"errors":[{"code":10021,"message":"Uncaught Error: No such module \"fleet.js\".\n
  imported from \"worker.js\"\n"}]}
```

The canonical imports `./fleet.js`; the scanner PUTs a **single script body**, so the module is
missing at upload time. Three workers now have three distinct, identified failure causes, all the
same shape — *the single-file PUT cannot represent the worker's real shape*:

| worker | failure | meaning |
|---|---|---|
| qnfo-observability | `No such module "fleet.js"` | multi-module worker |
| personal-companion | `Workflow GenerationFlow must be exported or a script_name must be specified` | Workflow class not in the canonical |
| qnfo-cloud-ops | `Uncaught SyntaxError` (multipart body as source) | canonical is not source at all |

`fleet_deploys` also shows personal-companion failing **hourly** (10:01:24, 11:01:23, 12:01:24,
13:01:23) with the same Workflow error — a retry loop with no breaker, no ticket, no alert.

## 5. `scanerr` keys are stale, and 3 workers have no canonical at all

`fleet_deploy_state.scanerr:*` (non-empty), live:

| key | value | updated_at |
|---|---|---|
| scanerr:research-daily-brief | stale-canon | 2026-09-12 11:02:43 |
| scanerr:qnfo-twin-maintain | stale-canon | 2026-09-12 11:02:37 |
| scanerr:osf-integrity-check | stale-canon | 2026-09-12 11:01:07 |
| **scanerr:obsidian-writer** | **stale-canon** | **2026-09-12 11:01:04** |
| scanerr:qnfo-scorecard | nocanon | 2026-09-10 12:03:05 |
| scanerr:qnfo-research-radar | stale-canon | 2026-09-10 09:02:56 |
| scanerr:qnfo-arxiv-radar | stale-canon | 2026-09-10 09:01:29 |
| scanerr:personal-life-maintain | stale-canon | 2026-09-10 09:01:10 |
| scanerr:qnfo-wrangler-test | nocanon | 2026-09-09 20:04:16 |
| scanerr:qnfo-container-executor | nocanon | 2026-09-09 07:42:33 |

Two observations:

1. **`scanerr:obsidian-writer` still reads `stale-canon` at 11:01:04** — i.e. it was **not**
   rewritten by the 13:03 or 14:05 scans, and my VERSION fix (`d4a742e5`) postdates both. This key
   is the direct verification surface for that fix; it should change at the next scan (~15:05).
2. **3 workers have `nocanon`** — no canonical exists at all (`qnfo-scorecard`,
   `qnfo-wrangler-test`, `qnfo-container-executor`), so they cannot be drift-managed by any route.

The last three `stale-canon` entries (research-radar, arxiv-radar, personal-life-maintain) were last
written 2026-09-10 and belong to workers absent from the 55-worker scan list — residue from
decommissioned workers, which inflates any "N workers stuck" count derived from this table.

## 6. Limits

- The "version-format is excluded from healing" rule is **inferred** from `ahead=9, healed=1` plus
  the clean-semver/only-healed correlation. I do not have the scanner source.
- 7 of 9 canonical-ahead rows show a build-tag deployed side; the other 2 are
  `qnfo-observability` (attempted, failed on a missing module) and `qnfo-backlog-exec` (healed).
  So the exclusion explains 7, and a *different* cause explains observability. Both are needed.
- `version-format: 14` is a counter, not a list. I could not obtain the per-worker membership, so
  the mapping of the 14 to specific workers is inferred from the drift rows.
- One scan snapshot; the 15:05 scan may differ, and `obsidian-writer`'s state will change.
- `deployed_version` values are the scanner's own readings; I have no independent source for them.
