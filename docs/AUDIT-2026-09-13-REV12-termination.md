# REV12 — Termination: Tier-3 questions closed, with what could and could not be established

Date: 2026-09-13. Final document. Closes the Tier-3 investigate list with two
negative results and three explicit "unanswerable from available surfaces"
findings, so the audit ends at a defined boundary rather than trailing off.

---

## F14 — Why did `integration_state` die? **Unexplained, with two negative results**

`integration_state` last wrote **2026-09-11T14:17:37.615Z** (REV5 §1). Two
candidate causes eliminated:

**Negative result 1 — the 09-10 fix-deploy did not cause it.** The only
`qnfo-observability` row in `deployment_history`:

```
action:      fix-deploy
status:      success
deployed_by: deepchat-agent
deployed_at: 2026-09-10 17:44:08
notes:       Fixed decaySignals deployment_history column (ts -> deployed_at;
             was permanent D1_ERROR in integration_state). Added qnfo-scorecard
             to FLEET census (f...
```

It **succeeded**, and it predates the death by **~21 hours**. A successful deploy
cannot be the cause of a failure 21 hours later.

**Negative result 2 — the 09-12 modification did not restore it.** `fleet_status`
reports `qnfo-observability` `modified_on = 2026-09-12T09:18:06.832Z` — after the
monitor died. `deployment_history` holds **no 09-12 row** for this worker, and
the monitor is still dead.

So: a worker change on 09-12 occurred, is **not recorded in `deployment_history`**,
and did not restore the monitor. That is consistent with the main audit's §11
finding that the deploy ledgers are incomplete, and it leaves F14 open.

`qnfo-observability`'s registry purpose is "Fleet telemetry: trace ingest,
**system integration assessment**, trend/bifurcation watch, proactive alerts" —
so this worker owns `integration_state`, and the worker being modified without
the table resuming is itself the anomaly.

---

## F13 — What are `email-triage` and `gmail-triage`? **Unanswerable from available surfaces**

Both jobs are flagged `high — silent >48h` by the auditor's C4 check. I searched
every surface I can read:

| surface | query | result |
|---|---|---|
| `emails` | `subject LIKE '%triage%'` | **0 rows** |
| `emails` | 12 most recent, all subjects | no triage-related message |
| `cloud_ops_events` | `GROUP BY kind` (30 kinds) | **no `email-triage` or `gmail-triage` kind** |

**These two jobs leave no trace in any table I can read** — no email, no event,
no ledger entry. I cannot determine whether they are broken, renamed, or were
never wired. Recorded as unanswerable rather than guessed at.

Contrast with the other four C4 jobs, all of which resolved (REV10 §1, REV11):
two merged into `radar-hub`, one is running (email 710), one is dormant by design
(`ACTIVATION_AT 2026-09-15`).

---

## F15 — What is `fabric-20260910`? **Merge-wave label, inferred; not provable from here**

29 workers carry it as their deployed version on one date. Neither ledger records
deploy activity that day (`fleet_deploys` 0 rows, `deployment_history` 1 row).
The fleet has documented merge waves ("wave A", "wave B") into `radar-hub`,
`fleet-exec`, `qnfo-fleet-control` and the `*-hub` services. REV10 §1 reads the
tag as a merge-wave release.

**I could not verify it**, and REV10 §5 records the reason it is weak: the
29-worker `fabric` list and the merge-product list **do not obviously coincide**
(`radar-hub` itself is not in the 29; `qnfo-lifecycle`, `qnfo-qwav`,
`qnfo-email` are). Left as inferred.

---

## F16 — Why is the probe frozen for exactly 5 models? **Unexplained**

Five models share `last_probe_ts` = 2026-09-11T16:44:23Z
(`qwen2.5-coder-32b`, `glm-5.2`, `deepseek-r1-qwen-32b`, `glm-4.7-flash`, and
`gemma-4-26b` at 16:31:24Z); five others are fresh at 2026-09-13T14:16:18Z. The
split is not random — the frozen set is every model with non-zero
`gateway_failures` except `kimi-k2.6`.

I did not read the probe code, so I cannot say whether the probe stopped touching
them, or whether they stopped being eligible. **Described from data only.**

---

## F17 — The seven canonical-less workers: **still unresolved**

`obsidian-writer`, `osf-integrity-check`, `personal-life-maintain`,
`qnfo-arxiv-radar`, `qnfo-research-radar`, `qnfo-twin-maintain`,
`research-daily-brief` — all `scanerr:stale-canon`, plus 3 `nocanon`
(`qnfo-container-executor`, `qnfo-scorecard`, `qnfo-wrangler-test`).

Note `deployment_history` holds only **20 distinct resource names** across all
days — a small set that includes the superseded `qnfo-fleet-deploy`. So the
deploy record is far thinner than the fleet, which is why "no canonical" and "no
deploy record" coexist for these workers.

---

## What the audit closes with

**Established and verified** (index §4): the drain tool is broken; one real
failure has a stack trace; the C4 job-silence headline is largely false; deploy
safety config is two armed rows; the comparator misparse is source-verified; a
guard is computed and never read; `v2-drain` masks 30 failures; the register is
`task_dod_register`; `fleet_error_state` is volatile; the registry would lead
into a downgrade.

**Open, with a defined boundary** — not guessed at:

| item | status |
|---|---|
| `email-triage`, `gmail-triage` | no trace in any readable surface |
| `integration_state`'s death | two candidate causes eliminated; cause unknown |
| `fabric-20260910` | merge-wave reading, inferred and weak |
| frozen probe set (5 models) | described, mechanism unknown |
| 7 workers with no canonical | unresolved; deploy record too thin to help |

**Not actionable from this endpoint:** every fix. F0 (two rows) needs a D1 write;
the route tables show no write path here.

---

## Limits

- **`deployment_history` is not complete** — 20 resource names, no 09-12 row for
  a worker whose `modified_on` is 09-12. Any conclusion drawn from its silence is
  weak.
- **F13's "no trace" is a negative across three surfaces**, not proof of
  non-existence. A job that writes only to a table I did not query would be
  invisible.
- **The `fabric` inference remains the weakest substantive claim in the audit.**
- **This is the twelfth document.** The audit's value now depends entirely on a
  reader using the index rather than any single file — and on treating §5 of the
  index (retracted and qualified claims) as authoritative over the earlier
  revisions.
