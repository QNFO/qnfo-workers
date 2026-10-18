# Handoff — remediation verification audit (2026-10-18)

Scope: the fleet-wide reading **"45% of verification runs fail (61,282 of 135,263)"** — root cause audit,
remediation, and everything found on the way. Written at 12:40Z by a Chatbox session, for whoever picks this up.

---

## 1. The headline was a measurement artifact

`61,282` was `remediation_verifications.pass = 0` over every row. It is not a failure rate.

| verdict | rows | of the table | of `pass=0` | a failure? |
|---|---|---|---|---|
| pass | 73,991 | 54.7% | — | — |
| **deferral (`pending…`)** | **19,320** | 14.3% | **31.5%** | **no** |
| real check failed — open issue | 21,775 | 16.1% | 35.5% | yes (backlog) |
| real check failed — closed issue | 15,442 | 11.4% | 25.2% | yes (see §2) |
| standing detector breach (`fm-*`/`belief-*`) | 4,264 | 3.2% | 7.0% | no (permanent audit) |
| placeholder | 241 | 0.2% | 0.4% | no |

- **Canonical split:** view `qnfo-audit.v_verification_verdict_split` (migration `2026-10-18-verification-verdict-split.sql`).
- **Honest row-level rate:** 37,469 / 111,460 = **33.6%** (was reported as 45.3%).
- **Subject-level**, the metric the fleet already publishes: `remediation_latest_pass_pct_7d` = **73.6** vs target ≥80.

Root causes, in order of size:

1. **A deferral was recorded as a failure.** `pending` / `pending: <reason>` is the documented deferral
   convention (`REMEDIATION-PENDING-PREFIX-1`); every consumer that acts on failure already excluded it by SQL,
   so the row existed only to inflate the count. Worst contract: `issue-1987`, 306 rows, never one verdict.
2. **The denominator counted re-probes, not outcomes.** One contract returning `pending` every 30 min produced
   303 "failures" from a single unresolved condition.
3. **Closures were accepted on proxies while the predicate-measuring contract still failed.** Of the 893
   closed-issue failures on 2026-10-18: **482** closed on `DoD met: ct_… reached merged`, `RESOLVED … deployed`,
   `TRIGGER-RECOVERY-1 … no longer gt 0` or `premise refuted with live read`; 213 closed by the contract's own
   pass then relapsed; 170 blocked by an open twin; 28 metric-loop early warning.
4. **A contract on a closed issue whose open twin carried its own contract could never reopen** → it probed a
   dead issue forever (`issue-2194`: 196 rows, `fails_since_closure` stuck at 2 of 3).

> Correction to an earlier draft of this audit: the reopen/close flap (`reopened_count` 67–82) was ranked as the
> main closed-issue driver from a top-N sort. Measured properly it is **28 failures that day**, not the bulk.

---

## 2. Shipped

| change | PR | state |
|---|---|---|
| `qnfo-fleet-control` **0.33.11-deferral-not-a-failure-1** — a deferral yields verdict `deferred`, writes **no** verification row, logs `cloud_ops_events.kind='remediation.deferred'` once per class per 6 h | #1952 | **merged + live** (`f06a4e9`) |
| `qnfo-fleet-control` **0.33.12-carried-by-twin-1** — a contract on a closed issue whose open twin carries its own live contract is superseded `superseded:carried-by-twin` instead of probing a dead issue | #2008 | **merged + live** (`3fce19b`), `/health` = `0.33.12-carried-by-twin-1` |
| `v_verification_verdict_split` | #1952 | **live in qnfo-audit** |
| CLOSE-BINDS-TO-PROBE-1 migration (single closing authority: a close aborts while the issue's contract fails) | #2011 (another session) | **merged + applied in qnfo-audit** |

Verification for the deferral fix, live, over three consecutive ticks:

```
rows since deploy   74 → 50
pending_as_fail      0   (was ~90 per cycle)
passes              54 of 74
deferred events     32
```

Tests: **58/58** worker suites pass for each change; `worker.js` ≡ `deployed-current.worker.js` in both commits.

---

## 3. Live state at 12:40Z

| quantity | value |
|---|---|
| contracts probed by the worker tick (`active`+`holding`) | 97 |
| contracts owned by other runners (`monitoring`+`escalated`) | 153 |
| open issues | 227 |
| open issues whose SLA was expired at birth | **161** (see §4) |

---

## 4. Open, owned, not closed

All three are `owner = qnfo-ops`, `triage_state = triaged`, in `agent_issues`:

- **2953 — VERIFICATION-OSCILLATION-1.** Single closing authority. CLOSE-BINDS-TO-PROBE-1 now blocks a bad
  close, but does not make a good one *possible*: a predicate that cannot be probed or that defers forever now
  blocks the close instead of being fixed. The ownership half of its DoD still stands.
- **2954 — VERIFICATION-DEFERRAL-STALL-1.** 431 contracts defer with no deadline and no escalator; **42 open
  issues hold a `probe-unusable` contract**, i.e. no verification path at all.
- **2987 — MIGRATION-LIVE-UNMERGED-1.** Governance. See §5.

Also open in this closeout PR: **ISSUE-SLA-WINDOW-1** (`migrations/2026-10-18-issue-sla-window.sql`).
`agent_issues_autotriage2_ins` set `sla_due_at = datetime('now')`, so an issue was due the moment it was filed.
161 of 227 open issues are at-or-before their creation time; every loop-filed issue contributed a permanent
breach row from birth. The migration gives the trigger the fleet's own 120-minute ceiling (ISSUE-SLA-2H-1) and
changes nothing else. Existing rows are deliberately left alone — rewriting them would erase evidence.

---

## 5. Landmines for the next session

1. **Production is ahead of, and sometimes divergent from, `main`.** At 12:17–12:19Z a full contract-lifecycle
   rewrite ran out of band: **1,039 of 1,120 contracts superseded** (707 on closed issues, 245 with no issue,
   42 `probe-unusable` on *open* issues, 32 wontfix, 10 resolved), 91 moved to `escalated`, 60 to `monitoring`.
   Those verdict strings (`superseded:contract-on-closed-issue`, `superseded:contract-on-missing-issue`,
   `superseded:probe-unusable`, `escalated:over-retried`, `monitoring:metric-condition`) appear in **no file of
   `main`** (`git grep` over the whole tree, `migrations/`, `scripts/`) and in **no D1 trigger**. They are
   unreviewable, unreplayable and unrevertible from the repository. Tracked by 2987.
2. **`main`'s history was force-rewritten.** `f06a4e9` (0.33.11) is no longer an ancestor of `main`; its content
   survives in 0.33.12 (`rtIsDeferral` branch, `worker.js` line ~10599). A branch cut before the rewrite gets a
   **phantom diff** and a red `gate` — this is what killed PR #2070, not a real failure.
3. **`deployment_history` has no row for either deploy today.** The known `cf_worker_deploy` ledger failure
   (7500 / triggers-nested-too-deep) still swallows it. Version confirmation rests on `/health` and on
   behaviour, not on the ledger.
4. **`v_verification_verdict_split` does not know the new states.** Rows from `escalated` / `monitoring`
   contracts will be bucketed as `real-fail`. Extend the CASE before quoting any rate from it.
5. **The 33.6% is stale.** It was computed over 1,120 contracts; 97 are now tick-probed. The denominator moved.

---

## 6. Next actions, ranked

1. **Apply `2026-10-18-issue-sla-window.sql`** and confirm `sqlite_master` shows `+120 minutes`. Until then every
   new issue is born in breach.
2. **Give the contract-lifecycle rewrite a home** (2987). Either a committed migration/script that reproduces the
   1,039 supersedes and the `escalated`/`monitoring` states, or a revert from `bak_20261018_triggers`.
3. **Answer 2953's ownership question**: who may close an issue whose predicate is unverifiable? Today the
   trigger blocks the close and nothing else happens, so 42 `probe-unusable` issues can neither close nor be
   verified.
4. **Extend the verdict view** to the new contract states, then re-measure the failure rate on a stable
   denominator.
5. **Work the real backlog**: 21,775 real failed checks on 114 open issues — that is fixing issues, not
   instrumenting them.

---

## 7. Reproduction

```sql
-- the split, any day
SELECT * FROM v_verification_verdict_split ORDER BY day DESC, verdict_kind;

-- the honest row-level rate
SELECT ROUND(100.0*SUM(CASE WHEN verdict_kind='real-fail' THEN rows_n END) /
             SUM(CASE WHEN verdict_kind IN ('pass','real-fail') THEN rows_n END), 1)
  FROM v_verification_verdict_split;

-- closed issues whose predicate still fails, by closing authority
SELECT CASE WHEN t.close_evidence LIKE 'IMPROVEMENT-LOOP-1%' THEN 'improvement-loop'
            WHEN t.close_evidence LIKE 'remediation_verifications%' THEN 'contract-pass'
            ELSE 'other' END closer,
       COUNT(DISTINCT a.id) issues, COUNT(*) fails
  FROM remediation_verifications v
  JOIN agent_issues a ON a.id = v.issue_id AND a.status = 'closed'
  LEFT JOIN issue_triage t ON t.issue_id = a.id
 WHERE v.pass = 0 AND v.verified_at >= date('now')
 GROUP BY closer ORDER BY fails DESC;
```
