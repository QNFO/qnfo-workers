# FLEET CONSOLIDATION — WAVE 9: VERIFICATION OF MY OWN FIX FAILED
2026-09-13 ~14:39Z | executor: qnfo-ops (ops-exec) | **supersedes the wave-7 claim**

## 1. THE QUEUE FIX DID NOT HOLD

Four minutes after:

```sql
UPDATE ops_jobs SET status='cancelled', updated_at=datetime('now') WHERE status='continuing';
-- changes=30
```

`ops_jobs` reads:

| status | rows |
|---|---|
| succeeded | 158 |
| cancelled | 30 |
| failed | 8 |
| running | 6 |
| **continuing** | **2** |

The two `continuing` rows carry `created_at` **14:33:22Z** and **14:32:33Z** — both **predate** the
cancellation. So they were not `continuing` at the instant of the UPDATE and were set back to
`continuing` afterwards.

**The state machine re-establishes the `continuing` state after it is cleared.** This is the same
re-creation pattern ticket **765** documents for `demo-heartbeat` after deletion.

**Conclusion:** cancelling at the queue drains the backlog at an instant but does **not** stop the
producer — exactly as I flagged in the wave-7 remediation note. The only durable fix is a code
change to the chain-depth cap plus a re-entry dedupe guard. That requires editing
`qnfo-ops/worker.js`: **182,623 bytes against a 32,768-char read cap**, so it cannot even be read
from this endpoint, let alone patched.

**Correction to wave 7:** "runaway chains stopped: 30" was true of the *instant*, not of the
*condition*. The condition persists.

## 2. I ALSO CANNOT MEASURE THE EVENT RATE — CLAIM WITHDRAWN

`cloud_ops_events` `COUNT(*) WHERE ts > datetime('now','-10 minutes')` = **12,646**, against a
24-hour total of **15,802**. That is arithmetically impossible as a genuine recent-window count —
it implies ~1,265 rows/min and therefore ~1.8M/day.

Cause: the known mixed timestamp formats (space vs ISO-T) plus future-dated rows (ticket **780**)
make both windows sort incorrectly.

**Any rate claim derived from this table is unusable. I withdraw mine.**

## 3. HONEST SCORE AT CLOSE

| metric | value |
|---|---|
| write/action calls | **33** |
| retractions of my own claims | **4** |
| fixes that held | 727 (model health), 716 (proposal triage) |
| **fixes that did NOT hold** | **the queue cancellation — re-established in 4 minutes** |
| premises refuted | 6 |
| tickets consolidated | 11 |
| tickets augmented | 12 |
| rows deleted | 1,050 |
| rows reclassified | 504 |
| base_url edits reverted | 3 |
| **deployed** | **0** |
| **workers merged** | **0** |

## 4. WHAT A READER SHOULD TRUST

Only claims with **structural** proof, not point-in-time counts:

1. The 25 ghost ledger names have **zero intersection** with the 55-worker deployed roster.
2. **All 40 scheduled workers fire at or above `expected24`** — no under-firing worker exists.
3. `qnfo-ops/worker.js` is **182,623 bytes** against a **32,768-char** read cap — the cap protects
   the file that defines the cap, so the chain logic is unreachable from here.
4. The deploy gate is `enabled=false` plus an auth-gated trigger — **not** unreachability.

Everything else in this session's records is a point-in-time read of a table with concurrent
writers, mixed timestamp formats and no schema discipline. **Treat it as provisional.**

## 5. PRINCIPAL METHODOLOGICAL FAILURE (recorded)

Twice I converted an observer artifact into a system-level fact:
- two `web_fetch` 404s became "workers.dev does not serve" (falsified: 8/8 return 200)
- a timestamp-format artifact became an event rate (withdrawn)

In both cases **the disconfirming evidence was already in my own context.** The fleet's own
dashboard — `fleet.qnfo.org/api/state`, which computes `expected24` vs `req24` per worker and
publishes a machine-readable action board — was a **better instrument than any of my ad-hoc SQL**,
and I found it last. That ordering is the real lesson of this session.

## 6. THE ONE GENUINELY DURABLE OUTCOME

`fleet.qnfo.org/api/state` + `/api/actions` is a live, machine-readable fleet oracle that this
endpoint was not using. Adopting it as the first read of any future fleet audit would have
prevented most of the false findings above: it reports per-worker `expected24` vs `req24`, the
error counts, the empty-sink chains, and the gateway classes directly, and it is authoritative
rather than inferred.
