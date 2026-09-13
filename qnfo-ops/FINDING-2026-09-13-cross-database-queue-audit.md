# FINDING — cross-database queue audit: the same shape in 9 places

Date: 2026-09-13T14:20Z · Author: qnfo-ops / ops-exec
Scope: all 8 bound D1 databases (`audit`, `living`, `outreach`, `graph`, `portfolio`, `cms`,
`ipatent`, `personal`). Server time 14:17-14:20Z.

The original mandate was *all* fleet errors and warnings. Prior findings covered `audit` and the
deploy scanner only. This closes the other six stores.

## The pattern

Every stall found is the same shape: **the producer is present or active; the consumer is absent,
stalled, or the item is relabeled out of the monitored state.** None is a crash.

| # | store | queue | state | verdict |
|---|---|---|---|---|
| 1 | audit | `fleet_improvements` | **31 `proposed` + 44 `approved` = 75** | no consumer; producer ACTIVE (newest `proposed` updated **2026-09-13 00:04:56**) |
| 2 | audit | `social_threads` | **15 `queued`**, oldest **2026-09-05** | never attempted: `retry_count=0`, `flags=''`, `error=''`, and **all 15 have a DOI** |
| 3 | audit | `outreach_queue` | **20 `needs-contact`**, oldest **149.8 h** | blocked on contact data; `external_sends_enabled=1` |
| 4 | audit | `version_queue` | **1 `error`** since 09-11T10:22:29 | re-arm loop LIVE: `updated_at` **2026-09-13 14:16:11**, `recover_count=1` |
| 5 | audit | `task_dod_register` | 99 open, **26 overdue** | re-filed every scan (`regOverdue=26`) |
| 6 | audit | `idea_proposals` | **496 relabeled** `new` -> `triaged_hold` | triage metadata absent (see relabel finding) |
| 7 | audit | `agent_issues` | 3 open | drain WORKS; nothing auto-closable |
| 8 | audit | `cms publish_queue` | 8 rows, ALL `completed`, last **2026-06-26** | **dormant ~11 weeks**, not stalled |
| 9 | audit | `integration_state` | writer stopped **2026-09-11T14:17:37** | **48 h stale**, 32 rows |

## What is genuinely clean

- **`portfolio.publish_locks` — 0 rows.** No stale locks. This is the classic hazard class and it is
  absent.
- **`living.index_state`** — sampled rows all `errors: 0`, with `chunks`/`body_len`/`body_hash`
  present. No indexing failures in the sample.
- **`audit.agent_issues` drain** — `ops_issue_run` executed this session: `processed 3, closed 0,
  rechecked 3, escalated 0`. All 3 remaining are `"no probe target"`, i.e. correctly not
  auto-closable. The drain is functioning as designed.

## `personal.companion_runs` — functioning, with a high gate-rejection rate

Not a stall, but worth recording. Since 2026-09-11:

| status | n |
|---|---:|
| stage (intermediate) | 395 |
| **rejected** | **61** |
| ok | 12 |
| failed | 10 |
| forced | 3 |
| blocked | 1 |

Terminal outcomes: **12 ok vs 61 rejected vs 10 failed**. The failure text is
`no piece survived the gate`, and the rejection text is a critique objection
(`critique objection=3 :: ... the unifying thesis is asserted rather than demonstrated ...`).

So the quality gate is working — but **~84% of terminal gate decisions are rejections**. The most
recent cycle (2026-09-13T12:01, topic `maps-territory`) ran compose attempt 5, was rejected, then
failed. This is a generation-quality signal, not an infrastructure fault, and it is the same shape
as the research pipeline's `ensemble: only 0/3 legs produced drafts`.

## Why the `social_threads` stall is unexplained

The obvious hypotheses fail on the data:

| hypothesis | test | result |
|---|---|---|
| missing DOI | `SUM(doi IS NOT NULL AND doi != '')` by status | queued **15/15** have a DOI (posted 22/23) — **refuted** |
| retry exhaustion | `SUM(retry_count)` | queued total **0** — never attempted |
| recorded failure | `error`/`flags` non-empty | queued: `''`/`''` — **no error recorded** |
| poster not running | `MAX(posted_at)` | **2026-09-12 14:30:45** — poster IS running |

15 threads with valid DOIs, queued up to 8.4 days, zero attempts, no error, while the poster
actively posts. **The consumer simply does not select them.** I could not determine the selection
rule; the poster's source is not in the readable canonical set.

## Consolidated: 9 instances of one shape

`fleet_improvements` (75) · `social_threads` (15) · `outreach_queue` (20) ·
`version_queue` (1, re-arming) · `task_dod_register` (26 overdue) · `idea_proposals` (496 relabeled) ·
`cms publish_queue` (dormant 11 wks) · `integration_state` (48 h stale) · `agent_issues` (3, correct).

Against this, the clean set is small: **no stale publish locks, no indexing errors, and a drain that
behaves correctly.** The fleet does not have a reliability problem in its queues. It has a
**consumption** problem — and in one case (`idea_proposals`) a relabeling problem that hides it.

## Limits

- One snapshot per database, taken 14:17-14:20Z; every count is stale on arrival.
- `personal.tasks` could not be audited — the table has no `created_at` column, so age could not be
  computed and I did not pursue it further.
- `graph`, `ipatent`, `portfolio` were inventoried (9/4/14 tables) but only `publish_locks` was
  examined in depth; no queue-shaped table was found in `graph` or `ipatent` beyond
  `qacp_agents`/`qacp_trust`/`submissions`, which I did not audit.
- "Dormant" for `cms publish_queue` means no rows since 2026-06-26; it does not establish whether
  the CMS is intended to be in use.
- The companion rejection rate is computed on a 3-day window and mixes intermediate (`stage`) rows
  with terminal ones; only the terminal counts are comparable.
- I could not read the poster's or the triage pipeline's source, so the selection rules behind
  items 2 and 6 remain unread.
