# VERIFICATION 4 — H7 retracted; `alerts` timestamps normalised; a third write convention added

Date: 2026-09-13, same session. Corrects §3 H7 of `FLEET-ERROR-AUDIT-2026-09-13.md`.

## 1. RETRACTED — `fleet_error_state` is not stale, it is burst-gated

I recorded H7 as *"`fleet_error_state` is stale — 8 rows, newest 2026-09-11T05:17Z … not
maintained."* Reading the producer (`qnfo-error-selfheal/worker.js`, v1.0.3) shows the write path:

```js
const newBurst = !prev || ex.errors > (prev.errors || 0);
if (newBurst) {
  await …("INSERT INTO fleet_error_state (worker, errors, seen_at) VALUES (?,?,?)
           ON CONFLICT(worker) DO UPDATE SET errors=excluded.errors, seen_at=excluded.seen_at")
   …
}
```

It writes **only when a worker's error count exceeds the stored value**, and never resets. So the
table holds each worker's **peak observed burst**, and `seen_at` is the last time that peak
advanced. A newest `seen_at` of 09-11 therefore means *no worker has exceeded its stored peak
since 09-11* — a quiet fleet, not an abandoned table. The row set (8 workers) and the low counts
(1–9 errors) are consistent with that reading.

**H7 was a misreading of a by-design table as neglect.** I inferred "not maintained" from
recency alone without reading the writer. Same error class as the `LIMIT 20` artefact in
VERIFICATION-3 §1.

## 2. `alerts` timestamp formats — normalised (68 rows), verified

`alerts` is declared `created_at TEXT DEFAULT (datetime('now'))`, i.e. space-form second
precision. Two producers instead bind ISO-8601:

| producer | rows | form |
|---|---|---|
| `qnfo-pipeline-ops` | 931 | space |
| `qnfo-error-selfheal` | 67 | **iso-T** |
| `qnfo-backlog-exec` · `checker` · `worker-health` · `blank-audit` · `digest` · `scan` · `chat-canary` · `compose` · `qnfo-ai-anomaly` | 101 | space |
| `health-guard` | 1 | **iso-T** |

**Applied** (non-destructive, bounded to the 68 offenders):

```sql
UPDATE alerts SET created_at = substr(replace(created_at, 'T', ' '), 1, 19)
 WHERE created_at LIKE '%T%';
-- -> ok, changes: 68
```

**Verified:** `alerts` is now a single format — `space 1100, 2026-08-29 06:00:26 .. 2026-09-13 14:01:22`.

Trade-off, stated: sub-second precision and the trailing `Z` are dropped from those 68 rows to
match the column's own DEFAULT and the other 94%. Only approximately reversible.

Staged, not applied: dropping the explicit `created_at` from the two alert INSERTs in
`qnfo-error-selfheal` so the column DEFAULT applies — this is the forward fix, and it needs a
deploy this endpoint cannot perform. Without it the worker re-writes ISO-T on its next hourly run
(`17 * * * *`).

### The producer is not at fault

`qnfo-error-selfheal` v1.0.2+ documents the hazard in its own source:

> *"id order is format-independent; created_at mixes ISO-T and space formats — never
> string-range compare"*

and parses defensively via `new Date(String(created_at).replace(" ","T").replace("Z","")+"Z")`.
The defect is that the **table permits two formats**, so a new consumer — me — gets bitten.

## 3. `agent_issues` now carries three write conventions

```
SELECT typeof(created_at) t_ca, typeof(updated_at) t_ua, COUNT(*) c FROM agent_issues GROUP BY t_ca, t_ua;
  -> integer/text 336 | text/text 169 | integer/integer 126 | text/integer 55
```

`qnfo-pipeline-ops` v0.5.5 moved **its** writer to epoch-ms integers (to match the declaration).
`qnfo-error-selfheal` and `qnfo-backlog-exec` still bind `nowIso()` (ISO-T). Older writers used
`datetime('now')` (space). So the v0.5.5 fix reduced pollution from one writer and **added a
third convention** — the table is now less uniform than the header claims.

Staged, deliberately not applied: a normalising UPDATE would rewrite 224+ rows of a table
holding three open tickets, and its agreement with the epoch-ms convention has not been verified
against a live writer. A half-migrated table is worse than a mixed one, because the mixture is
self-documenting through `typeof()` while a botched cast is silent.

## 4. Standing

H1 (fix not live — `pipeline_state` absent), H2 (40/40 masked `v2-drain` rows), H3
(`version_queue` id=18), H4, H6, H8–H10, the P0 credential exposure, the falsified "496 stuck
`new`", and the `ops_issue_run` token gate.

**Running correction count: 6.** Four of the six were my own query or inference being wrong, not
the fleet. That ratio is the strongest evidence available against the reliability of this audit
series, and it is why each figure above is paired with the query that produced it.
