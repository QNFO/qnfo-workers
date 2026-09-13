# FINDING — the drain is a structural no-op, and the backlog is three stores, not one

Author: qnfo-ops / ops-exec, 2026-09-13 (~06:52Z). All figures below are live tool returns from this
session. Where a number is *not* proven, it says so.

---

## 1. `ops_issue_run` executed — and closed nothing

Affirmation was supplied by the operator ("yes/go ahead/drain it"). The drain ran for real:

```
{"ok":true,"triggered":true,"http":200,"openBacklogBefore":25,
 "worker":"qnfo-backlog-exec","version":"1.2.6",
 "out":{"status":"ok","notes":{"noiseClosed":0,"processed":25,"closed":0,
        "rechecked":25,"escalated":0, ...}}}
```

Every one of the 25 rows returned `"action":"recheck","note":"no probe target"` — including all ten
`[gw-fail]`, all ten `MODEL-DEGRADED`/`[ai-cal]`, and the two `TERMINAL research failure` rows.

**This is not a failure of the drain; it is a composition mismatch.** The drainer auto-closes only
health-availability rows that have a re-probe target it can execute. None of the 25 open rows is of
that class. So for the current backlog the drain is a **no-op by construction**, and re-running it
will keep returning `processed:N, closed:0` forever.

**Proof the drain still wrote something:** all 25 rows share
`updated_at = 1789282308256` = `2026-09-13T06:51:48.256Z`, and a `run_code` timestamp check 15 s later
(`Date.now()` ≈ 06:52:03Z) confirms that is the drain's touch, not a stale value.

Post-state, unchanged: `backlog_status` 25 · `ops_issues_list` count 25 · D1 `status='open'` 25.
The three counters now agree (the historical `ops_issues_list` under-report defect did not reproduce).

## 2. The backlog is THREE stores, not one — every "open" count on this endpoint is an undercount

| store | open | notes |
|---|---:|---|
| `agent_issues` | **25** | what `backlog_status` / `ops_issues_list` / `ops_issue_run` all report |
| `issue_ledger` | **281** | fingerprint-keyed (`fingerprint`, not `id`); `acknowledged` 1, `resolved` 19 |
| `issue_ledger` category `telemetry-self-heal` | **6** | 2 high + 4 medium, subset of the 281 |

`issue_ledger` has **no ops tool at all**, so it is invisible to the drain. Its schema is
`fingerprint, source, level, category, title, status, first_seen, last_seen, occurrences,
last_detail, updated_at, resolved_at, resolution_note` — note there is no `priority` column, which is
why it cannot be triaged by the same path.

Composition of the 281 open, by category/level (top rows, `occurrences` summed):

| category | level | rows | occurrences |
|---|---|---:|---:|
| alert | warning | 84 | 166 |
| alert | critical | 58 | **764** |
| cloud-ops | error | 51 | **1158** |
| alert | info | 35 | 87 |
| ops-chat-fail | medium | 17 | 17 |
| gateway | high | 6 | 6 |
| telemetry-self-heal | medium | 5 | 46 |
| telemetry-self-heal | high | 2 | 59 |

Ledger inflow is not decaying: open rows by `last_seen` day — 09-13 **35**, 09-12 23, 09-11 31,
09-10 19, 09-09 14. Today is already the second-highest day in the window.

## 3. Two tools in the same worker contradict each other, at the same timestamp

Both calls returned `ts: "2026-09-13T06:52:18.138Z"`:

| tool | field | value |
|---|---|---|
| `telemetry_report` (24 h) | `open_self_heal_issues` | **0** |
| `telemetry_analyze` (168 h) | `alreadyOpen` | **6** |

The ledger independently holds **6** open `telemetry-self-heal` rows (2 high, 4 medium), and the
analyzer re-touched all of them at that same instant (`last_seen` 2026-09-13 06:52:18). So
`telemetry_report`'s `open_self_heal_issues` counter is **wrong** — it reports zero while six are
open and the sibling tool sees them. A monitoring endpoint whose "are we healthy" field under-reports
self-heal tickets is the exact failure mode this fleet's audits keep finding.

## 4. The self-heal tickets are largely unactionable — they name tools this endpoint does not bind

The 6 open tickets:

| ticket | tool | can it ever succeed here? |
|---|---|---|
| `[self-heal] tool parse_link failing x4` | `parse_link` | **no** — not in the endpoint's tool manifest |
| `[self-heal] tool save_memory failing x3` | `save_memory` | **no** — not bound |
| `[self-heal] tool run_command failing x2` | `run_command` | **no** — the endpoint exposes `run_code` |
| `[self-heal] tool email_respond failing x15` | `email_respond` | yes — but refusals without affirmation count as failures |
| `[self-heal] tool github_file_write failing x49` | `github_file_write` | yes — anchor/envelope aborts count as failures |
| `[self-heal] tool github_pr failing x2` | `github_pr` | yes — same |

`ops_ai_log` corroborates the first class directly: 6 rows contain `"unknown tool"`, e.g.
`{"name":"parse_link","ok":false,"error":"unknown tool: parse_link"}` and the same for `save_memory`.

**The root cause is prompt/manifest drift.** The qnfo-ops system prompt advertises `parse_link`
("Extract readable content from a specific URL") and instructs the model to call `save_memory` for
durable preferences — while the endpoint's dispatch does not implement either. The model therefore
tries, fails, and the self-heal loop re-files. These tickets are self-inflicted and **will re-file
indefinitely** until either the tools are bound or the prompt stops advertising them.

**Corollary — the failure metric is inflated by correct behaviour.** `telemetry_report` (24 h) reports
`tool_failures: 547` of 4947 calls. Sampled `ops_ai_log` rows with `ok=0` show chats in which **every
tool call succeeded** (`"ok":true` throughout), and others containing only a guard rejection. So
`ok=0` is a chat-level outcome, and guard refusals + envelope aborts are being counted as tool
failures. `telemetry_analyze` returning `persistent: []` with `recovered: 11` is consistent with that:
nothing is *persistently* broken, because the "failures" are intermittent refusals of tools that
otherwise succeed.

## 5. Guard false positive — REPLICATED, with a new failure class

The existing finding (`FINDING-2026-09-13-d1-guard-false-positive.md`, sha `7d83b2f9`) documented the
raw-text scan rejecting a keyword inside a **string literal** and rejecting the scalar `replace(`.
Both classes reproduce, plus a third this session:

| probe | result |
|---|---|
| `SELECT 'delete' AS x LIMIT 1` | **rejected** |
| `SELECT count(*) FROM agent_issues WHERE title LIKE '%insert%'` | **rejected** |
| `SELECT updated_at FROM agent_issues LIMIT 1` | allowed (word-boundary, not substring) |
| `SELECT status, count(*) FROM agent_issues GROUP BY status` | allowed |

The new class is the important one: **a `LIKE '%insert%'` pattern is rejected**, so a content-audit
query searching any text column for a mutation word is unavailable. This is a *read-only guard
blocking reads*, and it is the second-highest failing tool by volume (`ops_d1_query` 134 failures /
24 h; ledger row `AUTO-SWEEP: ops_d1_query` at **443 occurrences**, still `open`, `last_seen`
2026-09-13T06:20:42Z).

The finding's own addendum (sha `c405b460`) is correct that this **cannot be patched from here**: the
guard is past the 32,768-char read ceiling in a 161,339-byte `worker.js`, and the readable repo copy
declares `VERSION "2.14.0"` while `service_discover` reports live **2.15.1**. I did not write a
speculative patch. The repo's own in-envelope mechanism (`scripts/hotfix-code-gate-classifier.mjs`,
sha `f0a80b8a`) is the right vehicle — anchor-based, asserts exactly 1 occurrence, aborts without
writing — but it needs the deployed source to anchor against, which is the same blocker.

## 6. The alert storm is worse than reported, and severity is misclassified

`alerts`: **767 critical**, 170 warning, 90 info, 16 error, 15 warn, **4 `HIGH`** — note `HIGH` as a
sixth, differently-cased level value in the same column.

Top emitter, still firing hourly at 06:45:41 today:

| message (truncated) | level | count | last_ts |
|---|---|---:|---|
| `terminal research failure 45 -> agent_issues dup: ensemble: only 0/3 legs produced dra…` | critical | **116** | 2026-09-13 06:45:41 |
| `research pipeline: failed=1 stalled=0 published=19 …` | critical | 106 | 2026-09-11 06:15:30 |
| `terminal research failure 51 -> …` | critical | 64 | 2026-09-13 06:15:45 |
| `research pipeline: failed=2 … vqErr=1 …` | critical | 40 | 2026-09-13 06:45:45 |
| `research pipeline: failed=0 stalled=0 published=16 …` | **critical** | **65** | 2026-09-08 02:15:10 |

Two defects visible here:

1. **A `failed=0` (healthy) pipeline summary is emitted at `level='critical'`.** 65 occurrences of a
   success state logged as critical. The severity is a constant, not a function of the outcome, so
   the critical count cannot be read as a failure count.
2. **The emitter detects the duplicate and fires anyway.** The message text itself says
   `-> agent_issues dup`, i.e. the emitter knows an `agent_issues` row already exists, and still
   writes a critical alert — 116 times.

Critical alerts by day: 09-13 **31** (partial, ≤06:45Z), 09-12 99, 09-11 143, 09-10 151. On pace for
~110 today.

`digested` is another mixed-type column: `"auto"` (750 critical rows), `1` (integer), and `NULL`
(37 warning + 3 critical). 750 critical rows sit at `digested='auto'` against only 14 at `digested=1`.
Whatever `auto` means, it is not the state the digest consumer counts, so "digested" is not a
reliable statement about delivery.

**Status of the previously shipped fix:** `0.5.4-summary-dedup` was written to
`qnfo-pipeline-ops/deployed-current.worker.js` earlier today, but critical alerts are still being
emitted at the pre-fix rate. The file write was a **stage, not a deploy** — the deploy path is
unreachable from this endpoint by design. Do not read that commit as a live fix.

## 7. Issue 635 (`HTTP-5XX-ELEVATED qnfo.org`) is stale — two independent lines of evidence

| evidence | value |
|---|---|
| last `5xx spike … (qnfo.org)` alert | **2026-09-11T09:19:14.728Z** |
| 5xx-spike alerts by day | 09-11: 1, 09-10: 10, 09-09: 3, 09-07: 5, 09-06: 23, 09-05: 15 — **none on 09-12 or 09-13** |
| live `web_fetch https://qnfo.org/` | **HTTP 200**, page content returned |

The series was hourly on 09-10, tailed off to a single alert on 09-11, and has been silent for ~45 h.

**Limit of this evidence:** one 200 on the root route does not prove no 5xx exists on other routes, and
the alert source table (`http_requests`) is not in `qnfo-audit`, so I could not query the underlying
counts. What is proven is that the *detector* has stopped firing and the root route serves 200.
Issue 635 is a candidate for closure, not a proven-closed item.

## 8. Not established

- **Overlap between `agent_issues` and `issue_ledger`.** They are different stores with different
  keys (`id` vs `fingerprint`); I did not attempt a join, so "25 + 281 = 306 distinct open items" is
  **not** claimed. 306 is the sum of two counts, nothing more.
- **What the 443 `AUTO-SWEEP: ops_d1_query` occurrences actually are.** That row's `last_detail` is
  the bare string `ops_d1_query` — no error text. The guard false positive is a *plausible* cause and
  is now demonstrated for three query classes, but the ledger row does not carry per-call error text,
  so the attribution remains a hypothesis. The finding's addendum already flagged this; it still stands.
- **Whether `digested='auto'` means delivered, suppressed, or pending.** Three distinct value types
  exist; no consumer code was read.
- **The `HIGH` level value** (4 rows, 2026-09-02) — a sixth casing in a column otherwise using
  `critical/warning/info/error/warn`. Origin unknown.

## 9. What would actually reduce this backlog

1. Bind `parse_link` / `save_memory` in the qnfo-ops dispatch **or** remove them from the system
   prompt. Either closes a permanently-refiling ticket class.
2. Make `telemetry_report.open_self_heal_issues` agree with `telemetry_analyze.alreadyOpen`. It
   currently reports 0 against 6.
3. Stop counting guard refusals and envelope aborts as tool failures, or the failure metric stays
   unusable (547/24 h of which an unknown majority is correct behaviour).
4. Give the drainer a probe target for `MODEL-DEGRADED` / `[gw-fail]` rows, or exclude them from
   `processed` — `processed:25, closed:0` is an honest result but a misleading workload figure.
5. Emit the pipeline summary at a severity derived from its own `failed=` field. A `failed=0`
   summary at `critical` makes 767 critical alerts unreadable.
