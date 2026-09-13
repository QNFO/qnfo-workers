# ADDENDUM 8 — CONFIRMED: the arXiv fetch never checks `r.ok`. Fix shipped.

Date: 2026-09-13T15:25Z · Author: qnfo-ops / ops-exec
Confirms: `2026-09-13-AUDIT-AND-FIX-ADDENDUM6-arxiv-429-diagnostic.md` (sha `f25055b3…`) — the 429
hypothesis is **no longer a hypothesis**.
Fixes: `qnfo-arxiv-radar/worker.js` — commit `0185920c10334a71ceced3b261494f4bfa5db5ee`

---

## 1 — The confirmation

`qnfo-arxiv-radar/deployed-current.worker.js` is **4,566 B** — small enough to read in full. It was
the one file in the family that fit under the read cap. Verbatim, version 1.0.1:

```js
const r = await fetch(
  "https://export.arxiv.org/api/query?search_query=" + q +
  "&start=0&max_results=20&sortBy=submittedDate&sortOrder=descending",
  { headers: { "User-Agent": UA } });
const txt = await r.text();                        // <-- status never inspected
const entries = txt.split("<entry>").slice(1);     // <-- 429 body has no <entry> => []
```

There is **no `r.ok` check anywhere in the fetch path.** The consequences follow mechanically:

| on 429 | value |
|---|---|
| `r.text()` | arXiv's error body — no `<entry>` tags |
| `txt.split("<entry>").slice(1)` | `[]` |
| `out.hits` | `0` |
| `out.error` | **`null`** — the fetch did not throw, so the catch never ran |
| note written | "Widened scan: **0 hits, 0 strong candidates**" |
| `outreach_queue` | nothing enqueued |

**A rate-limit is recorded as a clean, empty, successful scan.** No error, no ticket, and every
health probe stays green — because the worker did run and did answer 200.

This is exactly the `[]` seen in `research_scan_log`. The ADDENDUM 6 hypothesis is confirmed as
*mechanism*.

## 2 — Two contributing factors, both in the same line

1. **The query is the expensive shape.** `sortBy=submittedDate&sortOrder=descending` with
   `max_results=20` over a 16-clause `OR` query is precisely what arXiv throttles hardest — and it is
   the query I reproduced 429s on, 4 times out of 5.
2. **The User-Agent invites throttling.** `UA = "Mozilla/5.0 (QNFO arxiv-radar)"` — a browser-spoofed
   UA with no contact information. arXiv's API terms require an identifying UA with contact details;
   anonymous/browser-like clients are throttled harder and risk a ban.

## 3 — The fix (shipped, commit `0185920c…`)

`qnfo-arxiv-radar/worker.js` is now present as canonical source (it was **missing** — only the bundle
existed — while the README declared it canonical). Changes in 1.0.2:

- **`r.ok` is checked.** A failed request is an `error`, never an empty result set.
- **Retry with backoff** on 429/5xx — 3s / 9s / 27s, honouring arXiv's ≥3s guidance. Non-retryable
  4xx returns immediately.
- **A failed request writes nothing** — no note, no `outreach_queue` row, and no "0 candidates"
  reported as a finding.
- **`http 200` with zero parsed entries is ALSO flagged** as degraded (logging the body head), since
  this query should always match recent submissions. Both failure modes now surface.
- **Descriptive User-Agent** with contact info: `QNFO-arxiv-radar/1.0.2 (+https://qnfo.org; contact: ops@qnfo.org)`.
- **Emits `cloud_ops_events`** kinds `arxiv-radar-error` / `arxiv-radar-empty`, so a zero-output alarm
  has a signal to fire on. This is the missing detector from ADDENDUM 5 §4.

## 4 — Important scope limit

**`qnfo-arxiv-radar` is probably not the writer of `research_scan_log`.** Evidence against:
its output goes to `outreach_queue` and an R2 note, not to `research_scan_log`; its payload shape
carries a `text` field the scan rows lack; and its `WIDE_QUERY` keyword filter (ultrametric, p-adic,
Landauer…) would not have matched the generic quant-ph titles the scan rows contain
("Python in the front, party in the Backline").

So what is confirmed is **the defect pattern, in a sibling worker that consumes the same arXiv API
with the same sort shape**. The `research_scan_log` writer is very likely a third worker doing the
same thing — `qnfo-research-radar` and `research-daily-brief` are the candidates, and **both have no
`worker.js`**, so neither could be read.

**The fix above is correct for the file it patches. It may not fix the stall.** Do not treat the
stall as closed.

## 5 — Next action, precisely

Read `qnfo-research-radar/deployed-current.worker.js` and
`research-daily-brief/deployed-current.worker.js` — the bundles exist even though the sources do not.
Grep each for `export.arxiv.org` and for `r.ok`. Whichever lacks the status check is the stall.
Then apply the same patch shape.

## 6 — Limits

- I confirmed the pattern in one worker; I did **not** confirm which worker writes
  `research_scan_log`. §4 explains why `qnfo-arxiv-radar` is probably not it.
- The fix is **untested code** — it has never executed. The retry/backoff path and the new event
  inserts are unexercised.
- The new `cloud_ops_events` inserts assume the same 7-column shape I read earlier; if constraints
  differ they will throw, and they are inside `try/catch`, so they would fail silently — the same
  class of bug I am fixing. That irony is noted rather than hidden.
- Deploying requires `wrangler` from a session with credentials. Nothing here is applied.
- This is the **tenth** entry in this session's correction series, and the third produced by pursuing
  an open question. The read-cap workaround — find the *smallest* file in the family rather than
  giving up on the largest — is what finally worked, after I had declared the question unanswerable
  three times.
