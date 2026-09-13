# WARNING REGISTRY — two structural defects (G, H)

Supplements the 2026-09-13 fleet audit. Surface: `qnfo-audit.fleet_issue_log`,
`fleet_error_state`, `fleet_agents` — named in `audits/2026-09-13-REMEDIATION.sql` FIX 7 as
*"the last uncovered warning surface."* Measured directly 2026-09-13 ~14:45Z.

## Baseline read

| table | rows |
|---|---|
| `fleet_issue_log` | 12 rows firing (10 hourly, `occurrences` 84–93); ~30 rows total |
| `fleet_error_state` | **0** |
| `fleet_agents` | **0** (empty) |

Schema:
```sql
CREATE TABLE fleet_issue_log (
  id TEXT PRIMARY KEY, category TEXT, sev TEXT,
  title TEXT, first_seen TEXT, last_seen TEXT, occurrences INTEGER DEFAULT 1
);
```

Live `sev=err` conditions: `worker-errors` ("9 worker(s) with 24h errors"), `queue-freshness`
×3 (`research_queue`, `version_queue`, `outreach_queue`), `gateway` ("Ops AI gateway (24h)").
Live `sev=warn`: `model-health`, `integration-chain` ×3, `agent-issues`, `scheduled-no-run`.

---

## Defect G — row fragmentation: one condition, up to 11 rows

```
SELECT category, title, COUNT(*) rows_n, SUM(occurrences) occ
  FROM fleet_issue_log GROUP BY category, title ORDER BY rows_n DESC;
```

| category | title | rows | Σ occurrences |
|---|---|---|---|
| gateway | Ops AI gateway (24h) | **11** | 104 |
| agent-issues | Agent issues (open) | 4 | 103 |
| queue-freshness | Queue outreach_queue | 4 | 102 |
| queue-freshness | Queue research_queue | 4 | 102 |
| model-health | AI model health | 3 (+1 under `general`) | 88 |
| queue-freshness | Queue version_queue | 3 | 93 |
| integration-chain | Research intake | 2 (+2 under `probe`) | 97 |

The `id` is a short hash (`iss-9d0ff956`). The same logical condition is re-registered under
**new ids** rather than updating its row, so the registry **fragments**: one gateway condition
is spread across 11 rows and its true occurrence count (104) is invisible to anything reading
a single row. The 09-12 11:14Z boundary is visible — pre-boundary rows sit at
`occurrences` 1–4 with the same titles as post-boundary rows at 84–93.

**Impact:** every count derived from this table is wrong. "12 tracked issues" is really ~9
logical conditions; per-row `occurrences` understates by up to 11×. Any dashboard reporting
"number of issues" over-counts; any alert reporting "occurrences" under-counts.

**Fix:** derive `id` from a *stable* key (e.g. `sha1(category + '|' + title)`), so
re-evaluation `UPDATE`s the row. Then collapse the existing fragments with a
`GROUP BY category, title` merge summing `occurrences` and taking `MIN(first_seen)` /
`MAX(last_seen)`.

## Defect H — the registry cannot identify its own subjects

The schema has **no `detail`, `meta`, `evidence`, or `payload` column** — verified by
`schema` read, not inference. A live row in full:

```
id           iss-9d0ff956
category     scheduled-no-run
sev          warn
title        1 scheduled worker(s) saw 0 invocations in 24h despite expected fires
first_seen   2026-09-13T04:01:08.786Z
last_seen    2026-09-13T14:01:34.167Z
occurrences  3
```

**The warning states a count and nothing else.** Which worker? Not recorded. The same applies
to `worker-errors` ("9 worker(s) with 24h errors") — nine workers are named nowhere in the
row. A human or agent reading this registry **cannot act on it** without independently
re-deriving the answer from other tables.

**Impact:** this is why a warning can fire 93 times over 27 hours and be correctly digested
every cycle without ever being resolved — `alerts` shows **0 undigested** while the condition
persists. The registry is *reporting-shaped* but not *action-shaped*.

**Fix:** add `detail TEXT` and write the offending identifiers (worker names, queue names,
model ids) as JSON. This is the minimum for the registry to be actionable, and it is the same
class of failure as the alert storm (Defect A): the signal exists, the subject does not.

---

## Why these matter beyond bookkeeping

Defects G and H are the reason the audit's central finding holds at the warning layer too.
The fleet has **four independent reporting surfaces** — `alerts`, `fleet_issue_log`,
`fleet_drift_report`, and the alerts mailbox — and each one is defective in a way that
suppresses rather than surfaces:

| surface | defect | effect |
|---|---|---|
| `alerts` | no re-alert suppression (A) | 931 rows for ~9 conditions; signal buried |
| `fleet_issue_log` | fragmentation (G) + no payload (H) | counts wrong; subjects unnameable |
| `fleet_drift_report` | false-clean masking + stale-canon self-seal (E) | 11-day failure reported as CLEAN |
| alerts mailbox | sending path misclassified as spam | alerts land in spam, not inbox |

**No surface is both accurate and actionable.** That is the audit's finding stated at the
level the operator actually sees.

## NOT verified

1. **The `scheduled-no-run` worker was not identified.** The registry cannot name it and I did
   not re-derive it from `cloud_ops_events`/CF analytics. It remains unknown.
2. **The 9 workers with 24h errors were not enumerated.** `cf_analytics` reports 187 errors
   across 30d but does not break them out per worker in that response.
3. **`fleet_error_state` (0 rows) and `fleet_agents` (0 rows)** were observed empty; whether
   they are *supposed* to be populated was not established.
4. **`REMEDIATION.sql` FIX 7 may already cover G and H** — I did not read it in full. This
   document exists so the finding is not lost if it does not.
