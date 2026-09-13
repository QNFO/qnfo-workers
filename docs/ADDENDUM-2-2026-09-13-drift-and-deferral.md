# QUniverse blockers — ADDENDUM 2: drift scanner, deferral mechanism, self-rewrite

Author: qnfo-ops (ops-exec). 2026-09-13 ~13:55Z. Live D1.
Supersedes §3/§4/§6 of VERIFIED-2026-09-13.md where they conflict.

## A. Claim 7 was RIGHT — my "WRONG" verdict was the error

I queried `calibration_register` (10 rows, all future-dated) and called the claim false.
That was the wrong table. The register the drift scanner means is `task_dod_register`:

| metric | task_dod_register (measured) | scanner note |
|---|---|---|
| total | 219 | — |
| open | **99** | `regOpen=99` ✓ |
| overdue | **26** | `regOverdue=26` ✓ |
| due within 7d | 47 | `regDue7=51` (Δ4) |

Status split: done 100, open 99, cancelled 19, in-progress 1.

So "26 overdue rows and no executor" **stands**. My retraction was wrong; the original
claim was right. Note the due7 delta (47 vs 51) — the scanner's window arithmetic
differs slightly from `due < date('now','+7 day')`. Unresolved, flagged.

## B. Claim 8 CONFIRMED — and understated (22 non-clean, not 4)

Latest scan, 2026-09-13 13:03:53Z, verbatim:
```
cron: scanned=55 clean=33 drifted=8 ahead=10 healed=0 errors=0 staleCanon=4 healthVer=10
      errKinds={"version-format":17,"stale-canon":4,"health-ver":10}
      regOpen=99 regOverdue=26 regDue7=51 regEscalated
```
`clean=33` of `scanned=55` ⇒ **22 workers are not clean** (8 drifted + 10 ahead + 4 staleCanon).

`deployed-ahead` (deployed newer than canonical):
qnfo-ai 5.25.1 vs 5.21.3 · qnfo-ops 2.15.1 vs 2.13.0 · qnfo-research-exec 0.8.1 vs
0.5.17-research-restored · qnfo-ai-calibration 1.1.5 vs 1.1.4 · qnfo-fleet-dashboard 1.5.1 vs
1.1.0 · qnfo-fleet-control 0.3.4 vs 0.3.3 · qnfo-email-orchestrator 0.3.4-glm53 vs 0.3.4 ·
qnfo-signal-loop 1.1.2 vs 1.1.0 · qnfo-social 0.5.3-failclosed vs 0.5.3

`canonical-ahead` (canonical newer than deployed):
qnfo-qwav · qnfo-paper-indexer · qnfo-lifecycle · qnfo-email · qnfo-ddocs-indexer · qnfo-archive

### Two competing deployers
Six workers carry a version stamp of the form `<worker>/fabric-20260910`:
qnfo-qwav, qnfo-paper-indexer, qnfo-lifecycle, qnfo-email, qnfo-ddocs-indexer, qnfo-archive.

That is a **second deploy path** with a different versioning scheme, running against the
same fleet as the semver-stamping deployer. Every one of the 7 repeatedly-deferred refs
(§C) is a fabric-stamped worker. The drift scanner compares semver to `fabric-<date>`,
which cannot reconcile — hence permanent `canonical-ahead`.

## C. Root cause of the 445 deferred: no dedupe, 7 problems re-filed hourly

`self_heal_actions WHERE status='deferred'` — 445 rows, but:

| kind | rows | **distinct refs** |
|---|---|---|
| health-ver | 221 | **7** |
| drift | 221 | **7** |
| errata-rearm | 3 | 1 |

Per ref: n=31 or 32, spanning 2026-09-12 09:08:45Z → 2026-09-13 13:03:23Z — i.e. one row
per hourly scan, ~32 scans.

The 7 refs: `qnfo-agent-orchestrator`, `qnfo-archive`, `qnfo-ddocs-indexer`, `qnfo-email`,
`qnfo-lifecycle`, `qnfo-paper-indexer`, `qnfo-qwav`.

**So "445 deferred" is not 445 problems. It is 7 problems × 2 kinds × ~32 hourly re-defers.**
The defer path has no dedupe — the same defect class as the gw-fail emitter.

## D. Auto-heal is a near no-op

`fleet_deploy_state`: `enabled=1`, `auto_heal=1`. Recent scans:
```
13:03 healed=0   12:02 healed=0   11:03 healed=0   10:02 healed=0
09:02 healed=0   08:02 healed=1   07:05 healed=2   06:05 healed=0
05:06 healed=0   04:05 healed=0
```
8 of the last 10 scans healed nothing. 3 heals in ~10 hours against 22 non-clean workers.

## E. Self-rewrite loop FAILS CLOSED — not the regression vector

`self_rewrite_state`, every entry for the last 12 hours, hourly at ~:05:
```
2026-09-13T13:06:00Z  jnl-referee  apply  reverted-or-rejected  snapshot read 404
2026-09-13T12:05:59Z  jnl-referee  apply  reverted-or-rejected  snapshot read 404
... (10 more, identical, back to 02:05:42Z)
```
The self-rewrite loop cannot apply anything: the snapshot read 404s, so every attempt
reverts or is rejected. It is failing closed.

⇒ **This corrects my earlier suspicion** that qnfo-autopilot's self-rewrite loop caused the
calibration deploy regression. It cannot have — it never successfully applies.

## F. Current error-class census (from scanner errKinds)

| class | current | lifetime (self_heal_actions) |
|---|---|---|
| version-format | 17 | 580 |
| health-ver | 10 | 315 |
| stale-canon | 4 | 108 |
| drift | (8 drifted) | 281 |

`version-format` is the single largest class at both scales. It is also the class the
scanner reports but the plane never resolves.

## G. Net correction ledger for this whole exercise

| # | Original claim | My first verdict | Correct verdict |
|---|---|---|---|
| 1 | 53/74 deploys failed | CONFIRMED | CONFIRMED |
| 2 | two live loops | CONFIRMED | CONFIRMED |
| 3 | poisoned R2 cache | HALF WRONG | HALF WRONG (2 distinct causes) |
| 4 | 40 silent publish failures | OVERSTATED | OVERSTATED (30 of 40) |
| 5 | 170/445/10 | CONFIRMED | CONFIRMED |
| 6 | memory empty, 90.6% canary | BOTH WRONG | BOTH WRONG (stale; 100%/7d) |
| 7 | register 26 overdue | **WRONG** | **CONFIRMED** — I checked the wrong table |
| 8 | repo≠prod on 4 workers | UNVERIFIED | **CONFIRMED, understated** — 22 non-clean |

Claim 7 is the instructive one: I retracted a true claim by querying the wrong table.
`calibration_register` and `task_dod_register` both exist and both look like "the register".

## Limits

- `due7` differs (47 measured vs 51 reported). Unexplained.
- The scanner note is stored truncated mid-token (`regEscalated`) — the tail of the
  counter list is not recoverable from D1.
- I still cannot read `qnfo-canonical` R2 objects; the BOM hypothesis on qnfo-cloud-ops
  remains inference from the 1:2 offset.
- `fleet_drift_report` early rows are from 2026-09-08 and show an older scan shape
  (`scanned=75`); the fleet has since contracted to 55. The 75-vs-55 change is not
  explained by anything I queried.
