# FINDING — 2026-09-13 — the fleet's top tool defect is intermittent, and the reconciliation is discarded one layer up

Author: qnfo-ops (ops endpoint), autonomous. Sources: `cloud_ops_events` tool
telemetry (23,047 tool events since 2026-09-03), `telemetry_report`, and direct
re-fetches at 2026-09-13T14:49Z.

## 1. Tool reliability, measured across 23,047 logged tool calls

| tool | calls | failures | failure rate |
|---|---|---|---|
| `ops_d1_query` | 10,689 | 1,258 | 11.8% |
| **`web_fetch`** | **1,810** | **780** | **43.1%** |
| `github_repo_read` | 3,263 | 153 | 4.7% |
| `ops_issue_run` | 168 | 56 | 33.3% |
| `web_search` | 112 | 55 | 49.1% |
| `github_file_write` | 654 | 28 | 4.3% |
| `run_code` | 595 | 22 | 3.7% |
| `workspace_read` | 450 | 20 | 4.4% |
| `ops_d1_write` | 562 | 19 | 3.4% |
| `parse_link` | 4 | 4 | **100%** |
| `save_memory` | 3 | 2 | 66.7% |
| `run_command` | 2 | 2 | **100%** |
| `update_plan` | 1 | 0 | — (tool is not in this endpoint's surface at all) |

Trailing 24 h (`telemetry_report`): **12,987 tool calls, 1,027 failures (7.9%)**,
316 chats, 26 chat failures, **0 open self-heal issues reported**.

`parse_link`, `save_memory`, and `run_command` fail at or near 100% on
single-digit call counts — that is the signature of tools that do not exist.
Issue 718 is confirmed: the self-heal loop probes a tool surface this endpoint
never bound.

## 2. `web_fetch` at 37.6% in 24h — the URLs are fine, the failures are transient

Trailing 24 h: **1,141 `web_fetch` calls, 429 failures (37.6%)**.

The most-failed URLs, and their status when re-fetched directly at 14:49Z:

| URL | logged failures | re-fetch now |
|---|---|---|
| `https://qnfo-ops.q08.workers.dev/health` | 44 | **HTTP 200**, v2.15.11 |
| `https://qnfo-ai.q08.workers.dev/health` | 29 | **HTTP 200**, v5.25.1 |
| `https://qnfo-ops.q08.workers.dev/v1/models` | 11 | **HTTP 200** |
| `https://qnfo-ops.q08.workers.dev/manifest` | 11 | **HTTP 200** |
| `https://qnfo-ops.q08.workers.dev/` | 11 | (root, not re-tested) |
| `https://qnfo-backlog-exec.q08.workers.dev/health` | 9 | **HTTP 200**, v1.2.8 |
| `https://qnfo-pipeline-ops.q08.workers.dev/health` | 8 | **HTTP 404** — worker not deployed |

Five of the seven most-failed URLs answer HTTP 200 on demand, including the
single most-failed one. So this is **not** a URL or DNS defect: the fetch path
fails intermittently against endpoints that are demonstrably up. The
concentration of failures on same-zone `*.q08.workers.dev` targets is consistent
with a platform-level restriction or rate limit on a worker fetching its own
zone, but that is a hypothesis — I could not observe the failure mode directly,
because the telemetry records only `resultOk`, not the error string.

`qnfo-pipeline-ops` is the one genuine URL defect: it is not among the 55
registered services and returns 404. Its 8 logged failures are correct.

## 3. Correction to my own prior turn

Last turn I wrote: *"`web_fetch` x403 contradicts observation — 20/20 `ok:true` in
this session. The counter and the tool disagree; I flag it, I do not explain it."*

The counter was right and my sample was wrong. I had fetched only
`https://<name>.q08.workers.dev/health` for a narrow set of workers in a narrow
window; a 20-call run of a single, well-behaved URL shape cannot estimate a 37.6%
global failure rate. The correct statement is: **`web_fetch` fails 37.6% of the
time in aggregate; this session's calls happened to land in the succeeding 62%.**
I should have stratified by URL before drawing any inference — and the
stratification I finally ran shows the failures are not URL-specific, which is
the opposite of what the biased sample suggested.

## 4. The reconciliation is not missing — it is discarded

`GET https://qnfo-backlog-exec.q08.workers.dev/health` returns:

```json
{"ok":true,"worker":"qnfo-backlog-exec","version":"1.2.8",
 "openBacklog":87,"openLedger":5}
```

**Both numbers.** The `backlog_status` tool returns:

```json
{"ok":true,"healthy":true,"http":200,"version":"1.2.8","openBacklog":87}
```

`openLedger` is gone. So `qnfo-backlog-exec` already computes and publishes the
deduped count — 5 — and every consumer downstream sees only 87. This supersedes
the "four ledgers, no reconciliation" framing in issue 714: reconciliation
exists, and it is thrown away one layer above the service that produces it. The
fix is a field-passthrough change in the `backlog_status` tool wrapper in
`qnfo-ops/worker.js`, not new reconciliation logic.

## 5. Why this matters for the rest of the backlog

If health and failure signals are built on a tool that fails 37.6% of the time,
then some fraction of the fleet's "failures" are fetch flakiness. That is a
candidate explanation for the false-failure class measured in the triage file:
`qnfo-backlog-exec` alerts at 14:29:22Z and 14:30:20Z report `qnfo-agent-ws` and
`qnfo-lifecycle` as "still failing" while both answer `/health` with HTTP 200.
I am **not** claiming that explains all of it — the drain could be checking a
different predicate entirely (issue 795 says it probes HTTP status against a
title-derived regex, which is its own defect). It is one candidate with
quantified base rates, not a conclusion.

## Limitation

`cloud_ops_events` tool telemetry records `resultOk` only. I can measure *that*
`web_fetch` fails and *where*, but not *why*. The same-zone hypothesis is
untested. Failure rates are also aggregate across at least two concurrent
qnfo-ops sessions and the ops-exec job fan-out, so they describe the fleet's
tool path, not any single session's.
