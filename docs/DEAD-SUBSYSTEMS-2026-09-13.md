# Dead and diverged subsystems — handoff (2026-09-13)

Author: qnfo-ops endpoint. Status: **audited, not fixed.** Every figure is a live tool return from
2026-09-13 ~06:40–06:50Z. Nothing in production was changed by this document.

These three findings sit *outside* the fix queue in `audits/2026-09-13-fix-queue.json` and outside
the QRI files. They are recorded here because each one explains why the visible backlog persists.

---

## 1. The fleet's own alert channel terminates in the spam folder

`email_stats`: **680 total, 254 spam (37.4%)**, 21 in the last 24 h.

Every fleet alert in the recent window arrives as `sender = bounces@cf-bounce.qnfo.org` →
`recipient = alerts@qnfo.org`, and is stored with `status = spam`. They are not delivered; they
bounce, and the bounce is discarded.

| id | ts | subject |
|---|---|---|
| 707 | 2026-09-13T05:00:56Z | Loose threads — 41 item(s) need disposition |
| 706 | 2026-09-13T03:10:43Z | QNFO register guard: **26 overdue** / 0 no-executor |
| 705 | 2026-09-13T03:05:42Z | QNFO AI endpoint health alert |
| 702 | 2026-09-12T15:05:23Z | QNFO AI endpoint health alert |
| 696 | 2026-09-12T06:07:43Z | [research-daily-brief] FAILED 2026-09-12T06:07:42Z |
| 692 | 2026-09-12T03:10:46Z | QNFO register guard: 7 overdue / 0 no-executor |
| 688 | 2026-09-11T13:46:02Z | QNFO fleet audit digest 2026-09-11 (**HIGH open: 64**) |
| 685 | 2026-09-11T06:07:32Z | [research-daily-brief] FAILED 2026-09-11T06:07:31Z |

**Consequences**

1. Every self-signal the fleet raises lands in spam. This is the most plausible reason a 24-item
   backlog and a ~270-row ledger persist for days without intervention.
2. The register guard went **7 overdue (09-12 03:10Z) → 26 overdue (09-13 03:10Z)** — 3.7× in one
   day, with both notices in spam.
3. The digest reports **"HIGH open: 64"** while `agent_issues` holds **11 high** (24 open total).
   The digest therefore reads `issue_ledger` — the second store, for which qnfo-ops has no tool.
   This corroborates finding N1: the self-heal loop files into a store nothing reads.
4. `[research-daily-brief] FAILED` recurs on 2026-09-11, 09-12 and 09-13 at the same ~06:07 slot.

**What a fix needs:** a mail-delivery/authentication fix (or a whitelist) for the
`alerts@qnfo.org` path, plus a decision on whether `issue_ledger` should be the canonical store or
be retired. Neither is reachable from qnfo-ops — no mail-config, no D1 write.

---

## 2. The personal memory plane is empty and 91% polluted

Live `PERSONAL` counts: `agent_memories` **0 rows**, `facts` 5, `notes` 490, `tasks` 3,
`events` 71, `handoffs` 6.

- **`agent_memories` is empty.** The memory id referenced in
  `ops-workspace/audits/2026-09-13-CLOSEOUT.md` (`mmtr2k48hufsw`) does not exist in this database.
- **The maintainer is a no-op.** `memory_maintain_runs`: 8 runs on a recurring 02:00/04:00 pair
  from 2026-09-10 to 2026-09-13, **every one `scanned = 0, pruned = 0`**. `qnfo-lifecycle` is
  healthy (`1.6.1`, canonical `1.6.1-memory-maintain-fixed`) — the fix is deployed and the job
  runs; it finds nothing because there is nothing.
- **`notes` is 90.6% one health-probe prompt.** All 459 `kind='email'` rows are LLM keepalive
  *instructions*, eight distinct strings: `Reply with exactly: OK` ×444 (2026-09-04T02:47 →
  2026-09-13T06:33, ~48.5/day, one every ~29.7 min), `Reply with the single word OK only.` ×5,
  `Reply with exactly OK` ×3, `Reply with OK` ×3, and one each of `Reply with the single word:
  pong`, `Reply with exactly: TWIN-OK`, `Reply with exactly: PERSONAL-SYNC-OK`, `Reply with exactly
  the single word: pong`.

  **The ingestion stores the prompt, not the message.** These are instructions addressed to a
  model, not email text. The naming (`TWIN-OK`, `PERSONAL-SYNC-OK`, `pong`) identifies the family
  as a twin/personal-sync health probe. Growth is monotonic and never pruned.
- **`facts` is 8 days stale** (newest 2026-09-05T18:10:38Z), containing chat-harvest fragments.
- **No vector index covers it.** `vectorize_query(index='notes')` returns vault documents
  (`2026/01/23/_26023100708.md` …), all `indexed_at: 2026-08-07`, scores 0.67–0.68. That index is
  a vault mirror, last re-indexed 36 days ago.

**Consequences:** any recency- or volume-weighted retrieval over `notes` returns the canary, not
the reader's material; the staged memory corrections in
`ops-workspace/audits/2026-09-13-memory-corrections.md` are **unappliable and unverifiable**
(no target row, no memory tool on qnfo-ops, no index containing it).

**What a fix needs:** (a) stop persisting the probe prompt — a writer change in whichever worker
owns `kind='email'` ingestion; (b) purge the 444 canary rows — a D1 write; (c) repoint the
maintainer at a populated store, or seed `agent_memories`; (d) re-index `qnfo-notes`. None is
reachable from qnfo-ops.

---

## 3. The repo is not a mirror of production — four workers

| worker | repo source says | live / registry says |
|---|---|---|
| `qnfo-ai` | **5.21.5** (`var VERSION = "5.21.5";`) | **5.25.1** |
| `personal-companion` | 1.0.0 bundle, 62,666 B, sha `c06edffb` | **v1.1.0** |
| `ai-health-prober` | 2.3.2 (later 2.3.3) | **2.3.1** |
| `qnfo-ai-calibration` | 1.1.4 | **1.1.5** |

Verified this session: `github_repo_read` on `qnfo-ai/worker.js` returns `var VERSION = "5.21.5";`
from a **148,613-byte** file, while `service_discover` (row updated 2026-09-13T06:30:40Z) and the
live `fleet_status` probe both report 5.25.1. `personal-companion/worker.js` and
`personal-companion/deployed-current.worker.js` are **byte-identical** (62,666 B, same sha).

**Consequences**

1. A repo audit is not a production audit. Any "the running code does X" claim read from the repo
   is unfounded — including any conclusion about `qnfo-ai`'s `MODELS` roster, since the readable
   roster is a 5.21.5 roster.
2. Patching the repo does not patch production; deploying it replaces newer live code with older
   source plus patches.
3. Three of the four are over the 32,768-char read ceiling (`qnfo-ai` 148,613 B,
   `personal-companion` 62,666 B, calibration 33,551 B) with no offset parameter — so they can be
   neither read nor verified from qnfo-ops.
4. This divergence is the deploy loop's input: where canonical is *older* than live, "heal" is a
   downgrade — the recurring `personal-companion v1.1.0 -> 1.0.0` failure (19 occurrences).

**What a fix needs:** recover each live version's source before applying any staged patcher.
For all four, that source is either absent from the repo or unreadable from this endpoint.

---

## Limits of this document

- The "spam set is dominated by fleet alerts" claim rests on the 20-row spam sample plus the
  sender pattern, not a full enumeration of all 254.
- The canary's producer is identified by content naming, not by reading its code. Those strings do
  not appear in the 20 most recent qnfo.org emails, so I cannot name the writing worker nor say
  whether the note is written on send, on receipt, or on a scheduled check.
- Divergence figures are version strings, not content diffs; behaviour was not compared.
- All counts are point-in-time. `notes` gains ~48 rows/day.
