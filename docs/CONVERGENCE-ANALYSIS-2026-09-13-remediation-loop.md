# CONVERGENCE ANALYSIS — the fleet remediation loop is not converging

Date: 2026-09-13. Author: qnfo-ops endpoint (Chatbox session).
Companion to `docs/FLEET-AUDIT-2026-09-13-consolidation.md`.

## 0. Why this document exists

The instruction was "audit and fix fleetwide … resolve permanently". The audit is
in the companion doc. This doc answers the question the audit does not: **why do the
same defects keep being found?** The answer is measurable, and it is not that the
diagnosis is wrong.

## 1. The two numbers

**(a) Issue filing rate is accelerating, not decaying** (`agent_issues`, grouped by
`date(created_at/1000,'unixepoch')`):

| day | filed | of which high |
|---|---|---|
| 2026-09-13 | **70** | **47** |
| 2026-09-12 | 9 | 1 |
| 2026-09-11 | 17 | 9 |
| 2026-09-10 | 20 | 9 |
| 2026-09-09 | 54 | 9 |
| 2026-09-08 | 55 | 5 |
| 2026-09-07 | 18 | 8 |
| 2026-09-06 | 11 | 5 |

Today is the highest day in the window — 70 filed, 47 high, roughly **8× the
previous day**. Open count moved **21 → 35 within this single session**
(open_high 15 → 24).

**(b) The drain closes nothing.** `ops_issue_run` executed twice here, verified:
`processed 30, closed 0, rechecked 30, escalated 0` and later
`processed 36, closed 0, rechecked 36, escalated 0`. Every open row is a
non-probe-target type, so the drain can only re-check them. It has no verb for
these defects.

## 2. The workspace shows the same request executed many times today

A single non-truncated `workspace_list` of prefix `audits/2026-09-13` returned one
page containing documents with **directly duplicated titles**, including:

- `FLEETWIDE-PRODUCTIVITY-CONSOLIDATION.md`
- `FLEET-PRODUCTIVITY-AUDIT.md`
- `fleet-productivity-and-alert-audit.md`
- `FLEET-ERRORS-WARNINGS-STALE-REMEDIATION.md`
- `FLEETWIDE-REMEDIATION.md`
- `fleet-error-audit.md`, `fleet-error-audit-and-remediation.md`, `fleet-error-remediation.md`, `fleet-error-audit-CORRECTION.md`
- `REMEDIATION.md`, `REMEDIATION-MATRIX.md`, `fleet-remediation.md`, `remediation.md`, `remediation-execution-closeout.md`
- `CLOSEOUT.md`, `FINAL-consolidation.md`, `ops-audit-closeout.md`
- `AMENDMENT1` … `AMENDMENT25`, `ADDENDUM1` … `ADDENDUM10`
- `SOURCE-DEPLOY-DIVERGENCE` in four spellings/variants

I did **not** count the files; the listing was not truncated, so the count is
obtainable, but the duplicated titles carry the point without it.

## 3. Interpretation

Every session reaches the same wall. The pattern in the artifacts is consistent:

1. A session diagnoses a real defect correctly.
2. It writes a FINDING, a PATCH `.mjs`, and an agent issue.
3. It cannot **apply** the patch, because applying requires a `wrangler` deploy
   path and/or source it cannot read (see §4).
4. The defect persists. The next session re-discovers it and files another ticket.

That is why there are 25 AMENDMENTs, six staged patches in `qnfo-fleet-control/`
alone, and 70 tickets today. **Diagnosis is not the binding constraint. The absence
of an apply path is.** Documents and tickets are being produced as a substitute for
one deploy, and they accumulate faster than they resolve.

This also explains a specific oddity: `fleet_improvements` holds 44 `approved` and
31 `proposed` rows with no consumer, and the open issue 708 describes exactly that —
an approval pipeline with no deployer. The same shape, one layer up.

## 4. The apply path, precisely bounded (measured this session)

| route | limit | consequence |
|---|---|---|
| `github_repo_read` | 32,768 chars, no offset | cannot read `qnfo-fleet-control/worker.js` (75,875 B) or `qnfo-observability/worker.js` (37,386 B) |
| `r2_get` | also caps (~32,768 observed; `maxChars=40000` on a 34,825 B object returned `truncated:true`) | **not** a workaround; confirmed this session |
| `workspace_read` | 100,000 chars | only helps if the file was already stored there |
| writes | full body in one call | cannot round-trip a file it cannot read |
| deploy | none bound | `fleet_deploy_state` `enabled=0`, `auto_heal=0` since 2026-09-13T14:23:10Z |

So the block is a **read-cap × write-whole × no-deploy** triangle. Two of the three
legs are hard limits of this endpoint; only the deploy leg is a policy/binding gap.

## 5. What would actually converge

1. **One session with `wrangler`.** The six staged patches in `qnfo-fleet-control/`
   and the four fixes in `qnfo-pipeline-ops/FINDING-2026-09-13-alert-storm-and-dedupe-are-one-bug.md`
   are written and waiting. This is the single highest-value action available.
2. **Stop filing tickets for defects that already have open tickets.** The
   `qnfo-pipeline-ops` watchdog is the worst offender (it re-alerts on a condition it
   already ticketed) but not the only one.
3. **Cap the backlog.** `qnfo-fleet-advisor` itself emitted this at 14:21:14Z:
   *"Hard-cap open-issue backlog at 50 items; enforce 48-hour triage or mandatory
   'Won't Fix' closure for all overflow."* With 35 open and 70 filed today, the cap
   will bind immediately.
4. **Do not treat document count as progress.** 193 same-day audit files and a
   rising ticket rate are a symptom, not remediation.

## 6. Failure modes of this analysis

- **The 70 includes agent-generated filings, not just failures.** Some are mine and
  some are a concurrent ops instance's (issues 719–734 were filed during this
  session by a parallel agent). So the spike measures *agent activity*, which is
  partly a response to the request itself. Both readings are true at once: the
  backlog is agent-inflated **and** the underlying defects are unfixed. I cannot
  cleanly separate the two from the data available.
- **A genuine degradation event could also explain the spike.** I did not test
  whether 2026-09-13 saw more real failures than 2026-09-12; the err24 figure (26)
  is not abnormal against the fleet's history.
- **"Duplicated titles" is a judgement about filenames, not content.** Two files
  with near-identical names could differ substantively; I did not diff them.
- **The convergence claim is an inference from artifacts**, not a measurement of
  remediation success rate. I have no table recording patch-applied vs patch-staged,
  which is precisely the missing instrumentation.
- **I am part of the pattern I am describing.** This document is another artifact.
  It is justified only because it names the loop rather than adding to it — and
  because §5.1 is actionable by someone with a deploy path.
