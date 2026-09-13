# Cross-ledger index — where each fleet defect is recorded

**Why this exists.** On 2026-09-13 a qnfo-ops session re-derived two defects from scratch
(`personal-companion` deploy source mismatch and the hourly downgrade loop) that were **already
documented in this repo, in more detail than the re-derivation**. That is duplicate labour, and
it is the mechanism behind issues 714 (four parallel ledgers) and 784 (the audit loop files
unboundedly). This file is the reconciliation: read it before investigating anything in the
deploy subsystem.

**Caveat, stated up front.** Rows marked *unread* are mapped from directory listings only — the
file exists and its name implies its subject. I have **not** read them, so I make no claim about
their contents. Do not treat a name as evidence.

## Ledger map
| ledger | what lives there | how to query |
|---|---|---|
| `agent_issues` (qnfo-audit D1) | defects with priority/status | `ops_issues_list`, `ops_d1_query` |
| `task_dod_register` (qnfo-audit D1) | owned deliverables + DoDs + evidence pointers | `ops_d1_query` |
| repo `*/FINDING-*.md`, `*/FINDINGS-*.md` | long-form analysis | `github_repo_read` |
| repo `*/PATCH-*.mjs`, `*/apply-*.mjs` | staged, fail-closed fix runners | `github_repo_read` |
| `fleet_drift_report` / `fleet_deploys` | resolver decisions + deploy attempts | `ops_d1_query` |

## Deploy subsystem
| defect | documented in | agent_issue | status |
|---|---|---|---|
| Resolver candidate order; GitHub mirror shadows `worker.js` (47/55 workers) | `qnfo-fleet-control/FINDINGS-2026-09-13-deploy-subsystem-source-verified.md` (D1–D6) + this session's `fleet_drift_report` count | **786** | open — DoD filed |
| `versionOf()` not worker-scoped (D1) | same FINDINGS doc | via 786/758 | open |
| `newer()` misorders live strings; dangerous polarity is "upgrade" (D2) | same FINDINGS doc; `qnfo-fleet-control/version-compare.mjs` + `.test.mjs` | **738** | open — **fix BEFORE CF 10021** |
| `direction` computed and discarded (D3) | same FINDINGS doc | **738** | open |
| `r2Read()` lacks tombstone rejection (D4) | same FINDINGS doc | via 786 | open |
| `NO_SELF` names the wrong script (D5) | same FINDINGS doc | via 786 | open |
| multipart metadata omits `script_name` → CF 10021 (D6) | same FINDINGS doc | **738**, **746** | open — **do not fix in isolation** |
| `qnfo-fleet-deploy` tombstoned; live worker is `qnfo-fleet-control` | `qnfo-fleet-deploy/SUPERSEDED-2026-09-13.md` | **724** | **resolved** |
| `fleet_deploy_state` `enabled`/`auto_heal` | `qnfo-fleet-deploy/README.md` (documents fail-closed 0/0) | **724**, **731** | **set to 0/0 at 14:23–14:26Z** |
| consolidated fix runner (13 groups, 9 mechanisms) | `qnfo-fleet-control/PATCH-2026-09-13-CONSOLIDATED.mjs` | **731** | staged, unapplied |
| CI runner for staged patchers | `.github/workflows/apply-staged-patchers.yml` | register **233** | exists; `workflow_dispatch` only |
| provenance guard | `.github/workflows/deploy-provenance.yml` + `scripts/check-deploy-provenance.mjs` | — | runs on push to main |

## `personal-companion`
| defect | documented in | agent_issue | status |
|---|---|---|---|
| repo holds v1.0.0 twice while production runs v1.1.0; **v1.1.0 source is nowhere in the repo** | `FINDING-2026-09-13-deploy-source-mismatch.md` | **738** | open — recover source before any deploy |
| hourly loop attempting `v1.1.0 → 1.0.0`; rows 24/26 recorded `ok=1` | `FINDING-2026-09-13-deploy-loop-downgrade.md` | **738** | open |
| `deployed-current.worker.js` byte-identical to `worker.js` (SNAPSHOT-DUPLICATE) | same + `check-deploy-provenance.mjs` rule B | via 786 | open |
| do-not-fix-10021-in-isolation | `FINDING-2026-09-13-deploy-loop-DO-NOT-FIX-10021.md` | **738** | open |
| deploy-loop addenda | `FINDING-2026-09-13-deploy-loop-ADDENDUM.md`, `-ADDENDUM-2.md` | *unread* | — |
| gate wiring not deployed; `runGate()` never called | `ADDENDUM-2026-09-13-gate-wiring.md` | *unread* | — |
| publish stall (3 docs) | `FINDING-2026-09-13-publish-stall-*.md` | *unread* | — |
| runs route exposes rejected drafts (2 docs) | `FINDING-2026-09-13-runs-route-exposes-rejected-drafts*.md` | *unread* | — |
| name matcher boundaries (2 docs) | `FINDING-2026-09-13-name-matcher-boundaries*.md` | *unread* | — |
| deny-list evasion / detection gap / standing filters / subject filter / topic selector / gap order dependence / continuation job stall | 7 `FINDING-2026-09-13-*.md` | *unread* | — |
| errata, QRI-2/3, remediation, grounding, voice | 10 further docs + `apply-remediation.mjs` + `sql/` | *unread* | — |

## `qnfo-research-exec`
| defect | documented in | agent_issue | status |
|---|---|---|---|
| `NL is not defined` — v2-drain blocked; 19 masked rows | `qnfo-research-exec/apply-research-exec-fix.mjs` (FIX A/B/C/D) | **706** | staged; **FIX C precondition VERIFIED satisfied** (tombstone sha `725a3e84`) |
| FIX B backfill already applied | same file's trailing note (now **stale**) | **706** | **already done** — 0 rows masked as ok |

## `qnfo-ops` (this endpoint)
| defect | documented in | agent_issue | status |
|---|---|---|---|
| the audit loop is the runaway issue filer (70 of ~95 rows in 2h) | filed this session | **784** | open — DoD filed |
| `telemetry_report` ignores its `hours` argument | `docs/FIX-telemetry-hours-2026-09-12.md` (this repo) | — | documented |
| `listIssues()` missing `await` | `docs/FIX-listIssues-await-2026-09-08.md` + `scripts/apply-listIssues-await-fix.mjs` | — | **not reproducing** — tool returns all rows |
| D1 write guard lexical rules | — | **735**, **761** | 761 supersedes 735's second clause |

## `qnfo-pipeline-ops`
| defect | documented in | agent_issue | status |
|---|---|---|---|
| 931 alerts all-time from a committed-but-undeployed fix; snapshot was a byte copy of the source | `.github/workflows/deploy-provenance.yml` header | **697**, **729** | open; worker has **no** registry row |

## How to use this
1. Before investigating, search this table for the worker or symptom.
2. If the defect is listed, **read the named document first** and add to it rather than writing a
   new finding — that is what 784's DoD asks for.
3. If you add a finding, add its row here in the same commit. An unindexed finding is how this
   file became necessary.
