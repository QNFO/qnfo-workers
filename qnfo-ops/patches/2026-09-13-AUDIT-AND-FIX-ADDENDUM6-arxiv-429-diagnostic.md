# ADDENDUM 6 — arXiv diagnostic: 429 is reachable and is the best fit for the empty scan

Date: 2026-09-13T15:00Z · Author: qnfo-ops / ops-exec
Extends: `2026-09-13-AUDIT-AND-FIX-ADDENDUM5-empty-research-scan-has-no-ticket.md` (sha `ea2ca1ae…`)
Status: **diagnostic.** Narrows the cause of the empty scan. Does not close it.

---

## 1 — Probe results

Five requests to arXiv from this endpoint's egress, in order:

| # | request | result |
|---|---|---|
| 1 | `http://export.arxiv.org/api/query?search_query=cat:quant-ph&sortBy=submittedDate&sortOrder=descending&max_results=3` | **429** |
| 2 | same, over `https://` | **429** |
| 3 | `http://export.arxiv.org/api/query?search_query=all:electron&start=0&max_results=1` | **200** — valid Atom XML, real record (`cond-mat/0011267v1`) |
| 4 | `http://export.arxiv.org/api/query?search_query=all:electron&sortBy=submittedDate&sortOrder=descending&max_results=1` | **429** |
| 5 | `http://export.arxiv.org/api/query?search_query=cat:quant-ph&max_results=1` | **429** |

Also: `https://arxiv.org/list/quant-ph/recent` → **200**, real listings (`arXiv:2609.11930`, 561 entries).

## 2 — What this establishes

1. **arXiv is reachable from this egress.** Probe 3 returned a valid result. There is no IP block.
2. **arXiv rate-limits aggressively and the limit is easy to hit.** Probes 1, 2, 4 and 5 all 429'd.
   Probe 3 was the *third* request and succeeded; by probe 4 the allowance was gone.
3. **arXiv has papers to find.** The list page shows current submissions, so `[]` is not because
   arXiv is empty.

**The critical caveat:** my five probes were fired in rapid succession, so **I very likely caused the
429s I observed.** This means I **cannot** conclude that arXiv is chronically blocking the fleet.
What I can conclude is that a 429 is *reachable and repeatable* from this egress — which is all the
hypothesis below needs.

## 3 — The hypothesis, and why it fits

`research_scan_log` went 10 papers/day → **no rows** (09-11, 09-12) → **`[]`** (09-13T08:00:58Z).

**A 429 swallowed as an empty result set fits that progression exactly.** A worker that does
`const papers = await res.json()` on a non-200 body — or `data.entries ?? []` on a 429 HTML/text
response — records "zero papers found" where the truth is "the request was rejected". The scan then
reports success, writes `[]`, and files no ticket. That single behaviour explains:

- why 09-13 logged `[]` instead of an error;
- why no ticket exists for it (ADDENDUM 5 §4);
- why `fleet_status` shows every worker healthy — the worker *did* run and answer.

**I did not read the scan worker's fetch code**, so this is a hypothesis with a specific
falsification test: read the scan's response handling. If it checks `res.ok`, the hypothesis is dead.

## 4 — A second, independent defect found on the way

`qnfo-arxiv-radar/` contains **only** `README.md` and `deployed-current.worker.js`. There is **no
`worker.js`.** Its own README states:

> Purpose: arXiv watch to outreach_queue
> Canonical source: this directory (QNFO/qnfo-workers)
> Version: worker.js VERSION + /health (see fleet-drift scan)

So the declared canonical source **does not exist** — only the compiled bundle. This is the same
class as the `qnfo-ops` finding (ADDENDUM 1 §4): a documented invariant that the repo contradicts.
Any session trying to patch the arXiv scan by editing `worker.js` will find no file to edit.

## 5 — Fix, in priority order

1. **Never treat a non-200 as an empty result.** Distinguish "0 papers" from "request failed". This
   is the whole defect, and it is a few lines.
2. **Send a descriptive `User-Agent`** identifying the operator. arXiv's API terms require this and
   throttle anonymous/absent UAs hard.
3. **Honour arXiv's stated ≥3-second delay between calls**, and back off on 429 rather than
   retrying immediately.
4. **Alarm on zero output.** 0 papers against a trailing 7-day mean of 10 must page. This is the
   missing detector from ADDENDUM 5 §4 — the class of failure that both health probes and the
   ticket advisor are blind to.
5. **Restore `worker.js`** for `qnfo-arxiv-radar` (or correct the README) so the canonical source
   claim is true.

## 6 — Limits

- **My probes contaminated the measurement.** Probes 4 and 5 may have 429'd because of probes 1–3,
  not because those queries are inherently limited. I cannot cleanly separate "cat: quant-ph is
  throttled" from "I had just burned the quota".
- I did not read any scan worker's fetch code; §3 is untested.
- The 09-11/09-12 missing rows may be a different failure from the 09-13 `[]` — I have no evidence
  they share a cause.
- Whether `research_scan_log` is written by `qnfo-arxiv-radar` at all is unconfirmed; the scan job is
  named `research-scan`, and the worker holding it may be another one (`qnfo-research-radar`,
  `research-daily-brief` both exist).
- All D1 reads are single-replica (ADDENDUM 3 §6).
- This is the **eighth** entry in this session's correction series. It is the first one that was
  produced by pursuing a question rather than by being contradicted.
