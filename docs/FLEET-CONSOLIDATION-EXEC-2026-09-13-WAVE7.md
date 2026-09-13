# FLEET CONSOLIDATION — WAVE 7: THE RUNAWAY FIXED AT THE QUEUE
2026-09-13 ~14:36Z | executor: qnfo-ops (ops-exec) | appends to the wave 1–6 records

## 1. ROOT CAUSE OF THE WHOLE SESSION'S SYMPTOMS

`ops_jobs` immediately before the fix:

| status | rows |
|---|---|
| succeeded | 157 |
| **continuing** | **29** |
| failed | 8 |
| running | 7 |

**36 live jobs, all created between 2026-09-13T13:58:04Z and 14:35:04Z — inside 37 minutes.**

The payloads are **self-chaining replays of the same conversation**. Each carries continuation
markers (`SERVER-SIDE CONTINUATION STARTED … chain depth 1/6`) and replays the entire message
history — every previous turn's prompt plus the full tool-call log.

**One mechanism explains three separately-investigated symptoms:**
1. `qnfo-ops` = **14,872 of 15,802** `cloud_ops_events` rows (94%) in 24h
2. `qnfo-ops` filed **70 of the last 95** `agent_issues` rows in ~2 hours (ticket 784)
3. `agent_issues` open grew **42 → 66** during this session

Each chained job re-emits the full conversation into `cloud_ops_events` *and* independently
re-derives the same findings as a fresh `agent_issues` row. The "numerous errors, warnings and
alerts" the user asked me to resolve were, in material part, produced by the audit loop itself.

## 2. ACTION TAKEN

```sql
UPDATE ops_jobs SET status='cancelled', updated_at=datetime('now') WHERE status='continuing';
-- changes=30
```

Verified after: `succeeded 157 | cancelled 30 | failed 8 | running 6 | queued 1 | continuing 0`

The six `running` jobs were deliberately **left to drain naturally** rather than cancelled
mid-flight. `continuing` is now zero, so no queued chain can advance.

**Revert:**
```sql
UPDATE ops_jobs SET status='continuing'
 WHERE status='cancelled' AND updated_at >= '2026-09-13T14:36';
```

## 3. WHAT THIS FIXES — AND WHAT IT DOES NOT

**Fixes:** the queued continuation chains — the mechanism that was refilling `cloud_ops_events`
and `agent_issues` faster than anything could drain them. This is the first action in the whole
session that addresses a *producer* rather than a *symptom*.

**Does not fix:** the cause. Chain depth is 6 and there is **no re-entry dedupe guard**, so a
single new prompt can still spawn a new chain. The depth cap and a dedupe guard need a code
change on the deploy path (`qnfo-canonical` R2 bucket not bound; `qnfo-fleet-control`
unreachable, `enabled=0`).

## 4. WHY THIS WAS NOT FOUND EARLIER — THE REAL LESSON

I spent this session auditing workers, activity ledgers, registries, model health, proposal
triage and gateway classes, while **the producer of most of the noise was this endpoint's own
job queue.** Ticket **779** had already named it ("55 continuing ops-exec jobs spawned in 36
minutes") and ticket **784** had already named the filer ("the qnfo-ops audit loop is the
runaway issue filer") — both filed by concurrent sibling agents, before I read them.

**Recorded lesson: when the subject of an audit is "the fleet is noisy", the auditor's own write
path must be audited first.**

## 5. SESSION TOTALS — 28 write/action calls

| metric | value |
|---|---|
| write/action calls | **28** |
| premises refuted | 6 (+1 self-corrected) |
| confirmed and fixed | 727, 716 |
| registry `base_url`s repaired | 3 of 55 |
| tickets consolidated | 11 (4 productivity → 736; 7 gateway → 754/698) |
| tickets augmented | 9 |
| rows deleted | 1,050 |
| rows reclassified | 504 |
| **runaway chains stopped** | **30** |
| deployed | **0** |
| workers merged | **0** |

## 6. ARTIFACTS
`docs/FLEET-CONSOLIDATION-EXEC-2026-09-13.md` (`264c13b5`), `…-WAVE3.md` (`d50aa989`),
`…-WAVE5-6.md` (`d4f5f6ba`), this file.
ops-workspace `fleet-consolidation/` — PLAN, WAVE2, WAVE3, WAVE5-6.
`r2:qnfo-audit/fleet-consolidation/` — plan-and-evidence, final-state, wave4-gateway,
wave5-6-selfcorrection, wave7-runaway-fixed.

## 7. FAILURE MODES
1. **I cancelled 30 jobs belonging to this same self-chaining system.** If any of those chains
   held a deliverable the user expected, it is now `cancelled`. Recoverable via the revert
   statement, but I cannot verify what each chain would have produced.
2. **The fix is at the queue, not the cause.** A new prompt can spawn a new chain immediately.
   This session's own activity may already have done so.
3. **I cannot verify I am not inside the 94%.** My 28 writes and ~70 reads are themselves
   `ops_ai_tool` rows.
4. **Two of my six refutations needed amendment** (697's original single-table form; the `merged`
   semantics). Treat the other four as provisional.
5. **The consolidation reduces counts, not causes** — 11 tickets merged, zero 429s or 400s fixed.
6. **Nothing was deployed and no worker was merged.**
7. **This file adds to the sprawl tracked by open issue 737.**
