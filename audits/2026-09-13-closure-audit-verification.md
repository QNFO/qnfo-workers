# Closure audit — are the fleet's closed/resolved tickets actually remediated?

2026-09-13, qnfo-ops continuation turn. Same falsification test as
`2026-09-13-autoclose-predicate-remediation.md`: for each closed/resolved ticket, is the stated
condition actually gone? All figures are live D1 reads at ~14:57Z.

## Verdicts

| # | ticket | claimed | measured now | verdict |
|---|---|---|---|---|
| 713 | DISPATCH-QUEUE-NEVER-DRAINS | 34 rows all `state=queued` for 28h, 5 `exec_attempts`, **zero transitions** | 35 rows: 23 `superseded/dedupe-superseded`, 5 `queued/executed`, 4 `queued/needs-human`, 3 `queued/no-action`; `exec_ts` advancing to **14:47:00.787Z** | **resolution SOUND.** `exec_state` is now populated and `exec_ts` advances, so "zero transitions" is falsified. 12 rows do still sit in `state='queued'`, which is a design question, not the filed defect. |
| 716 | AUTO-REENTRY NOISE / false INTAKE-STALL | 496 score-null fragments driving a permanent false alert | `research_candidates` total **4**, `score IS NULL` **0**. INTAKE-STALL **not firing** — the 2 alerts in 6h are `qnfo-pipeline-ops` *warnings* reading `intake=cleared` | **resolution SOUND** |
| 802 | DEPLOY-LEDGER-SILENT-52H | `deployment_history` no row since 2026-09-11T10:34:07Z while the healer made 68 attempts | 49 rows, newest **2026-09-11T10:34:07.744Z** → still silent at **~52.4h**, despite the 14:05:46 scan reporting `healed=1` | **STILL PRESENT** (already open) |
| 702 | TRACE-STALL | `worker_logs` frozen 76h | 1,578 rows, newest `ts_ms` = 1789035358174 = **2026-09-10T10:15:58Z**, `ingested_at` 2026-09-10T11:17:40.622Z → **~76.5h** | **STILL PRESENT** (already open) |

## Correction of my own error in this turn

I stated that #716's INTAKE-STALL was "still firing (2 alerts/6h)". **That was wrong.** The query
was `message LIKE '%intake%'`, which matched the substring `intake=cleared` inside two
`qnfo-pipeline-ops` **warning** rows. Reading the message text falsified my own claim. #716's
resolution stands and `intake=cleared` is positive evidence.

## Also not reproducing

- **#697** (ALERT-STORM qnfo-pipeline-ops, 802 critical alerts): `alerts` in the last 24h shows
  `qnfo-pipeline-ops` at **2 warnings**, not hundreds. The storm is not current.
- **#799** (fleet-dashboard top error producer): total alerts in 24h is now **6** across all
  sources, so the 18-of-26 error share is not current.

## DECISION REQUIRED — the one live defect with a ready data-level fix (#806)

`outreach_queue` in qnfo-audit, measured live:

| status | rows |
|---|---|
| `needs-contact` | **20** |
| `pending` | **0** |
| `skipped` | 18 |
| `sent` | 3 |

The consumer drains `status='pending'`; the producer writes `status='needs-contact'`. There is
nothing to drain, so **20 contacts sit parked indefinitely** (consistent with the outreach-idle
signal in #734). The defect is confirmed, not stale.

**A one-statement remediation exists and I deliberately did NOT apply it:**

```sql
UPDATE outreach_queue SET status='pending' WHERE status='needs-contact'
```

That would make the *deployed* consumer act on all 20 rows — which **sends 20 real outbound emails
to real contacts**. That is an irreversible external action, so it is left for an explicit human
decision rather than taken autonomously. The code-level fix (align the producer and consumer
selectors, or bind both to a shared status constant) is deploy-gated like every other worker fix
this session.

## Standing prediction (from the previous turn, unobserved here)

The `worker-health` job files a `source='worker-health' level='error'` row on a ~12h cadence; the
last one was **2026-09-13T03:05:43**, so the next is due **~15:05Z**. If none appears by 16:00Z, the
"alarms forever" claim in #783 is **falsified**. Note the previous turn phrased the test as
`id > 1121`, which is too weak — alert ids are shared across sources and id 1122 is already
`qnfo-pipeline-ops`. The real test is `source='worker-health' AND level='error'`.
