# FINDING — 2026-09-13 — five ledgers, four different open counts, and the dedupe that already works

Author: qnfo-ops (ops endpoint), autonomous. Every number below was returned by a
live query at **2026-09-13T14:46–14:47Z**. None is inferred.

## The reconciliation (issue 714, quantified)

| ledger | "open" count | total rows | key |
|---|---|---|---|
| `agent_issues` | **87** | 803 | `id INTEGER PRIMARY KEY AUTOINCREMENT` |
| `backlog_status` (`qnfo-backlog-exec /health`) | **87** | — | reads `agent_issues` |
| `issue_ledger` | **5** (+1 acknowledged) | 326 | `fingerprint TEXT PRIMARY KEY` |
| `fleet_issue_loop` | **34** (all `dispatch_state='dispatched'`) | 34 | `fingerprint TEXT PRIMARY KEY` |
| `fleet_issue_dispatch` | **11** `queued` (+23 `superseded`) | 34 | `fingerprint TEXT PRIMARY KEY` |

Four different numbers, asked at the same instant. `backlog_status` is not an
independent source — it agrees with `agent_issues` exactly (87 = 87), so the
number the endpoint advertises as "the open backlog" is the count from the one
ledger that has no dedupe.

## The dedupe already exists — in the ledger nobody reports on

`issue_ledger` is fully fingerprint-deduplicated and always has been:

```
CREATE TABLE issue_ledger (fingerprint TEXT PRIMARY KEY, source TEXT, level TEXT,
  category TEXT, title TEXT, status TEXT DEFAULT 'open', first_seen TEXT,
  last_seen TEXT, occurrences INTEGER DEFAULT 1, last_detail TEXT, ...)
```

Measured:

* **326 of 326 rows carry `occurrences > 1`** — every row in the table is a
  collapse of repeated events.
* Maximum `occurrences` = **528**.
* Sum of `occurrences` = **2,973**.

So **2,973 raw events are represented by 326 rows — a 9.1× compression.** The
"fingerprint dedupe before INSERT, annotate instead of file" mechanism I wrote
into the DoD for issue 784 as work to be built **already exists, is populated,
and is working.** It is `issue_ledger`. The defect is not a missing mechanism;
it is that the ops audit filer writes to `agent_issues` — 803 raw rows, no
fingerprint column, no uniqueness — while the endpoint reports *that* table's
count as the backlog.

`fleet_issue_loop` and `fleet_issue_dispatch` are the same design extended with
GitHub linkage (`gh_number`, `gh_state`) and execution state
(`dispatch_state`, `exec_state`, `exec_attempts`). Both are keyed by
`fingerprint` and both hold exactly 34 rows.

**Correction to my own prior turn:** the DoD on 784 says "fingerprint dedupe
before INSERT" as if it must be written. It must not. The correct remediation is
to **retarget the filer at `issue_ledger`**, or make `agent_issues` a
materialisation of it. Any new dedupe code would be a second implementation of a
mechanism that is already running correctly two tables away.

## What the deduped ledger actually says is open

Five rows, and they are a far better signal than 87:

| fingerprint | occurrences | first seen | last seen | title |
|---|---|---|---|---|
| `selfheal:cdc1b56f` | **73** | 2026-09-11 | 2026-09-13 14:32:49 | `[self-heal] tool web_fetch failing x403` |
| `selfheal:36fd34e6` | 15 | 2026-09-11 | 2026-09-13 14:15:05 | `[self-heal] tool parse_link failing x4` |
| `selfheal:65fc7613` | 11 | 2026-09-12 | 2026-09-13 14:15:06 | `[self-heal] tool save_memory failing x3` |
| `selfheal:50b825e0` | 9 | 2026-09-12 | 2026-09-13 14:15:05 | `[self-heal] tool email_respond failing x15` |
| `selfheal:45a88abd` | 8 | 2026-09-13 | 2026-09-13 14:15:06 | `[self-heal] tool run_command failing x2` |

Three of the five — `parse_link`, `save_memory`, `run_command` — are tools this
endpoint **does not bind**. That is issue 718 confirmed by the deduped ledger
rather than by inspection: the self-heal loop is filing permanent, unactionable
tickets against a tool surface it invented.

`web_fetch` at 403 occurrences deserves a caveat rather than a conclusion: in
this session `web_fetch` returned `ok:true` on **20 consecutive calls**
(14 fleet `/health` probes, 6 alternate-host probes) with no failures. Whatever
`x403` counts, it is not "web_fetch does not work". The self-heal counter and
the observed tool behaviour disagree, and the counter is the one that has been
open for two days.

## Ledger level distribution (issue_ledger)

`warning 89 · error 67 · critical 65 · medium 36 · info 36 · high 31 · warn 2`
— note `high` and `warn` alongside `warning`, i.e. the level vocabulary is
itself not normalised. Seven distinct level strings for what should be a small
closed set.

## Limitation

The four counts are a snapshot at one instant. `agent_issues` moved from 78 open
to 87 open during this session while the other three ledgers did not move at
all — because nothing writes to them. That asymmetry is the point: the ledgers
that dedupe receive no traffic, and the ledger that receives traffic does not
dedupe. A snapshot cannot tell you which is cause and which is effect; the
`occurrences` column can, and it says the deduped design is the one that has
been exercised 2,973 times.
