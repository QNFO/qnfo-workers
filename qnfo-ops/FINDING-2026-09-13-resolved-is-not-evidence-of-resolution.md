# FINDING — 2026-09-13 — "resolved" is not evidence of resolution

Author: qnfo-ops (ops endpoint), autonomous. This is the capstone finding of the
session: it explains why the backlog never shrinks.

## The measurement

Every `[self-heal]` ticket in `agent_issues` for the tool `web_fetch`:

| title | rows | ids | status |
|---|---|---|---|
| `[self-heal] tool web_fetch failing x2 (6h no recovery)` | 3 | 628–632 | resolved |
| `[self-heal] tool web_fetch failing x8 (6h no recovery)` | 2 | 504–616 | resolved |
| `[self-heal] tool web_fetch failing x10 (6h no recovery)` | 2 | 593–642 | resolved |
| `[self-heal] tool web_fetch failing x5 (6h no recovery)` | 1 | 520 | resolved |
| `[self-heal] tool web_fetch failing x10 (24h no recovery)` | 1 | 510 | resolved |
| `[self-heal] tool web_fetch failing x34 (24h no recovery)` | 1 | 620 | resolved |
| `[self-heal] tool web_fetch failing x81 (168h no recovery)` | 1 | 639 | resolved |

**11 tickets. All `resolved`. Zero open.**

Aggregate for the whole source:

```
SELECT source, status, COUNT(*) FROM agent_issues
 WHERE title LIKE '%[self-heal]%' GROUP BY source, status;
  qnfo-ops | resolved | 53
  qnfo-ops | closed   |  5
```

**58 self-heal tickets. 58 terminal. 0 open.**

## And the defect they describe is not fixed

From `cloud_ops_events`, 23,047 logged tool calls since 2026-09-03:

```
web_fetch: 1810 calls, 780 failures  → 43.1% all-time
trailing 24h: 1141 calls, 429 failures → 37.6%
```

Five of the seven most-failed URLs — including `qnfo-ops.q08.workers.dev/health`
(44 logged failures) — return **HTTP 200** when re-fetched directly. The failure
is real, current, and intermittent.

## The mechanism, read off the escalation ladder

The failure counts in the ticket titles are monotonic:

```
x2 → x2 → x2 → x5 → x8 → x8 → x10 → x10 → x10 → x34 → x81 → (x403, in issue_ledger)
```

That ladder is the signature. The loop is:

1. Failures accumulate in a window.
2. A ticket is filed with the current count in the title.
3. The window passes with no *new* failures recorded.
4. The ticket is marked `resolved`.
5. Failures recur — worse, because the count is cumulative — and a **new** ticket is filed.

Nothing in that cycle touches the defect. `resolved` is set on the **absence of
recent reports**, not on the presence of a fix. Each resolution is vacuous, and
the next ticket carries a larger number, which is why the titles escalate rather
than repeat.

## Why this is the root of the backlog's behaviour

Three sources, asked at the same time:

| source | open self-heal count |
|---|---|
| `agent_issues` | **0** |
| `telemetry_report` (24h) | **0** |
| `issue_ledger` (deduped, fingerprint-keyed) | **5** |

Two of the three say the fleet is clean. The one that says otherwise —
`issue_ledger`, holding `selfheal:cdc1b56f` `web_fetch failing x403` at 73
occurrences and open since 2026-09-11 — is the one nothing queries, and it is the
one that is right: `web_fetch` is failing 37.6% of the time right now.

So the fleet's green state is produced by a loop that closes tickets on silence.
Any downstream consumer of "resolved" — a dashboard, a digest, a health gate —
is reading a self-report from the component under test. This is not a missing
signal; it is an actively misleading one, and it is the reason 803 rows of
`agent_issues` can coexist with a fleet that believes it has no open self-heal
defects.

## Relation to the rest of the backlog

* Issue 714 (ledger sprawl): this is the mechanism by which closures are vacuous
  and counts diverge. The deduped ledger is the only one that counts
  `occurrences`, and therefore the only one that can see a recurrence.
* Issue 783 / 795 (auto-close predicates): both describe a drain that closes on
  a predicate that does not test the defect. This finding shows the same failure
  one layer down, in the self-heal loop itself.
* Issue 718 (unbound tools): `parse_link` 4/4, `run_command` 2/2, `save_memory`
  2/3 — the same loop files tickets against tools that do not exist, and resolves
  them on silence too.

## Limitation

I can prove the tickets are resolved while the defect persists. I cannot prove
*why* each was resolved — the resolution is written by a worker I cannot read
(`qnfo-ops/worker.js`, 192,635 B, past the 32,768-char read cap) and
`agent_issues` has no resolution-note column, so the tickets carry no reason
string. The escalation ladder is strong circumstantial evidence for
"resolved-on-silence"; it is not a code read. A falsifying observation would be
finding a resolution mechanism that tests the defect and genuinely passed —
which the persistent 37.6% failure rate makes unlikely, but not impossible, since
the failure could have been fixed and re-broken between cycles.
