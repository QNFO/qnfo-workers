# FINDING — the INTAKE-STALL cleared by relabel, not by triage

Date: 2026-09-13T14:30Z · Author: qnfo-ops / ops-exec
Source: live `qnfo-audit.idea_proposals` + `alerts` counter-queries.

## 1. The alert says the stall is over

`alerts` (live, newest first) shows `qnfo-pipeline-ops` changing its verdict between 13:16 and 14:01:

| ts | message |
|---|---|
| 13:16:00 | `research pipeline: failed=2 ... intake=escalated terminal=2` |
| 13:01:00 | `INTAKE-STALL escalated -> agent_issues dup: 496 proposals stuck new` |
| 12:01:00 | `INTAKE-STALL escalated -> agent_issues dup: 496 proposals stuck new` |
| **14:01:22** | `research pipeline: failed=2 stalled=0 published=19 recovered=0 vqErr=1 rearmed=0 rTerm=0 **intake=cleared** terminal=2` |

And the queue looks clean:

```sql
SELECT status, COUNT(*) n FROM idea_proposals GROUP BY status;
-- triaged_hold      543
-- triaged_accepted   14
-- ensemble-registered 1
```

**Zero rows in `status='new'`.** The 496-row backlog that triggered the escalation is gone.
Read alone, this is a completed remediation.

## 2. It was not triage. It was a status relabel.

`idea_proposals` has real triage columns (`decision`, `score`, `rationale`, `triaged_at`). Grouping
`triaged_hold` by `decision` splits it into exactly two populations:

| `decision` | n | `triaged_at` NULL | `created_at` window |
|---|---:|---:|---|
| `auto-hold (re-entry open-question; research halted)` | **496** | **496** | 2026-09-12T09:50:02 -> 09:50:44 |
| `HOLD` | 47 | 0 | 2026-09-03 -> 2026-09-11 |

```
543 - 47 = 496   <- exactly the size of the stalled burst
```

Confirmed directly:

```sql
SELECT COUNT(*) FROM idea_proposals
 WHERE status='triaged_hold' AND triaged_at IS NULL
   AND created_at >= '2026-09-12T09:50:00' AND created_at <= '2026-09-12T09:51:00';
-- 496
```

And the aggregate:

| status | n | with `triaged_at` | with `score` | with `decision` |
|---|---:|---:|---:|---:|
| triaged_hold | 543 | **47** | **47** | 543 |
| triaged_accepted | 14 | 14 | 14 | 14 |

**All 496 carry a `decision` string but no `score` and no `triaged_at`.** The newest `triaged_at` in
the entire hold population is **2026-09-11T13:11** — *before* the 09-12T09:50 burst was even
created. So no triage ran on those 496 rows at any point.

The stall did not clear. **It moved from a monitored status (`new`) to an unmonitored one**
(`triaged_hold` with a distinct `decision` string), and the alert that had been escalating it
hourly went green at 14:01:22.

## 3. Two readings, and the evidence does not separate them

**Reading A — designed auto-hold (benign).** The decision string literally says
`re-entry open-question; research halted`, i.e. a rule that deliberately parks re-entry
open-questions while research is halted. On this reading `intake=cleared` is *correct*: they are no
longer untriaged. The earlier escalation was then a false positive for a condition the system
intended to resolve this way.

**Reading B — backlog suppression (not benign).** A bulk `UPDATE ... SET status='triaged_hold',
decision=<constant>` clears the alert without performing any triage. On this reading the escalation
was silenced rather than satisfied, and 496 items are now parked with no scoring, no `triaged_at`,
and no path back into the queue.

**I cannot separate them, and I want to be explicit that the evidence does not do so.** What is
established is only this: *the status changed, the triage metadata was not produced, and the alert
cleared.* The `auto-hold` decision string is the main argument for Reading A; the absence of
`score`/`triaged_at` — the exact columns the 47 genuinely-triaged rows populate — is the main
argument for Reading B.

What both readings agree on is the **operational consequence**: 496 items are parked with no
`triaged_at`, so any consumer filtering on `triaged_at IS NOT NULL` cannot see them, and the
`intake` metric can no longer detect them.

## 4. Falsification test for this finding

This finding is wrong if either holds:

1. A triage run for these 496 rows exists elsewhere with scores — check for any table joining
   `idea_proposals.id` to a score/rationale row for the 09-12T09:50 window.
2. `auto-hold` is documented as a terminal, intended disposition for re-entry open-questions with a
   defined exit path — check the pipeline-ops source for the rule that emits that string.

Neither is verifiable from this endpoint: `qnfo-pipeline-ops` is **not in the 55-worker scan list**
(see `FINDING-2026-09-13-why-not-executing-readonly-and-deploy-gap.md`), so its source is not part
of the readable canonical set, and `service_registry` has no row for it.

## 5. Separate, smaller defect: the alert digest skips sources

`alerts` for 2026-09-13: **75 total, 69 auto-digested, 5 undigested.**

The 5 are not uniform lag:

| created_at | source | level |
|---|---|---|
| **04:40:39** | blank-audit | warning |
| **06:02:05** | checker | warn |
| 14:01:20 | qnfo-pipeline-ops | critical |
| 14:01:21 | qnfo-pipeline-ops | critical |
| 14:01:22 | qnfo-pipeline-ops | critical |

The three `qnfo-pipeline-ops` rows are minutes old — ordinary lag. But `blank-audit` (04:40) and
`checker` (06:02) have sat undigested for **9.5 h and 8 h**. Both are `warning`/`warn` level, while
every digested row in the sample is `critical`, so the digest appears to filter by source or level.

**Correction to an intermediate claim of mine this session.** I first described this as "the digest
stopped working at 14:01:22". That was wrong — 69 of 75 digested, and the 14:01 rows are simply
newer than the digest interval. The real defect is narrower: two specific sources are skipped.

## 6. Limits

- One D1 snapshot under concurrent writers; `idea_proposals` and `alerts` can change between
  queries in this document.
- `decision` string contents are taken at face value; I did not locate the code that writes it.
- The `triaged_at` absence is strong but circumstantial evidence of a bulk update — a triage path
  that legitimately does not stamp `triaged_at` would produce the same shape.
- "496 stuck" was itself sourced from pipeline-ops' own alert text, which I cannot read the code of.
