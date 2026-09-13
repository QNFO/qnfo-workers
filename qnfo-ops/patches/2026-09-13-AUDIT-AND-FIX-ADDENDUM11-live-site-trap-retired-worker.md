# ADDENDUM 11 — the live-site trap: my earlier fix went to a retired worker

Date: 2026-09-13T16:00Z · Author: qnfo-ops / ops-exec
Corrects: `2026-09-13-AUDIT-AND-FIX-ADDENDUM8-confirmed-no-ok-check-fix-shipped.md` (sha `298d2d32…`)
Supersedes in part: `2026-09-13-AUDIT-AND-FIX-ADDENDUM7-dead-inserts-and-missing-sources.md` §3 (sha `59f9f84b…`)
Status: **correction.** One of my two shipped fixes targets a worker that does not run.

---

## 1 — What I got wrong

In ADDENDUM 8 I confirmed the arXiv `r.ok` defect and shipped a fix to
`qnfo-arxiv-radar/worker.js` (commit `0185920c…`). **`qnfo-arxiv-radar` is retired.** My fix is in a
file that is not deployed.

Three independent confirmations:

1. **`service_registry`:** `radar-hub` = *"Merged radar hub (wave B): events-radar + qnfo-arxiv-radar
   + qnfo-research-radar + qnfo-citation-watch; /events/* and /citation/* prefixes + cron dispatch"*.
2. **`fleet_status`** lists 55 workers. `radar-hub` **is present**. `qnfo-arxiv-radar` is **absent**.
   So is `qnfo-research-radar`. `research-daily-brief` **is present** (that one is live).
3. The standalone directory holds only a frozen bundle — consistent with a retirement snapshot.

## 2 — The bug is in the live file, verbatim

`radar-hub/worker.js` (38,953 B, sha `6b751971…`) is a merged bundle containing `eventsMod`,
`arxivMod`, and at least one more module. Inside `arxivMod`'s `run()`:

```js
const r = await fetch("https://export.arxiv.org/api/query?search_query=" + q +
      "&start=0&max_results=20&sortBy=submittedDate&sortOrder=descending",
      { headers: { "User-Agent": UA } });
const txt = await r.text();
const entries = txt.split("<entry>").slice(1);     // <-- no r.ok check
...
} catch (e) { out.error = String((e && e.message) || e); }
```

Byte-for-byte the same defect, the same `WIDE_QUERY`, the same `UA = "Mozilla/5.0 (QNFO arxiv-radar)"`,
the same `sortBy=submittedDate`. **The retired copy and the live copy are identical here.**

## 3 — Fix shipped to the live site

**`radar-hub/apply-radar-hub-arxiv-ok-fix.mjs` — commit `57e238c38ce9391b7732a2c978c7c2e660fbde32`**

`radar-hub/worker.js` is 38,953 B — over the 32,768-char read cap — so this ships as a patcher, in
the style `qnfo-research-exec/apply-research-exec-fix.mjs` already established. The fix is one line
before the parse:

```js
if (!r.ok) throw new Error("arxiv http " + r.status + (r.status === 429 ? " (rate limited)" : ""));
```

It **throws**, and the module's *existing* catch already does `out.error = ...`. So no new error path
is introduced, and the correct downstream behaviour — no note written, nothing enqueued, error
reported instead of `hits: 0, error: null` — falls out for free. Query shape and UA are deliberately
left alone so the patch has exactly one effect.

The patcher fails closed: it requires the anchor exactly once, and it verifies that the 400 chars
preceding the anchor contain `const r = await fetch(` — so the inserted line cannot reference an
out-of-scope `r`. On any mismatch it writes nothing and exits non-zero.

## 4 — The systemic trap, and a correction to ADDENDUM 7

ADDENDUM 7 §3 called the three missing `worker.js` files a "repo hygiene problem". **That was the
wrong diagnosis.** They are missing *because those workers were retired* — `qnfo-arxiv-radar` and
`qnfo-research-radar` were merged into `radar-hub` and their directories frozen with only the bundle.

The real defect is worse and more specific:

> **The fleet has merged workers, so a directory name no longer identifies the live code. A session
> that fixes the worker matching the symptom's name will patch a retired file and report success.**

That is exactly what I did. I read the directory, found the bug, fixed it, and shipped — and the
running system was unaffected. The directory name `qnfo-arxiv-radar` matched the symptom, and the
live code was in `radar-hub`.

Mitigations worth adding:

1. **Mark retired directories.** A `RETIRED.md` naming the absorbing worker, or delete them. A frozen
   bundle with a self-doc README claiming "Canonical source: this directory" is actively misleading —
   it is the reason I trusted it.
2. **Check `fleet_status` before patching.** If the worker name is not in the 55, it does not run.
   That single check would have caught this, and it costs one tool call.

## 5 — Still unread: the likely `research_scan_log` writer

I read 30,000 of `radar-hub/worker.js`'s 38,953 bytes. That covered all of `eventsMod` and most of
`arxivMod`. The **remaining ~9,000 chars** contain the tail of `arxivMod` plus the merged
`qnfo-research-radar` and `qnfo-citation-watch` modules.

`research_scan_log` (`job='research-scan'`, `[]` at 2026-09-13T08:00:58Z) has no identified writer.
Given that `qnfo-research-radar` was merged into this same file, **the unread tail of
`radar-hub/worker.js` is now the leading candidate** — ahead of the unread 51,000 chars of
`qnfo-research-exec/worker.js`, which I had previously ranked first.

Prediction to test: the unread tail contains an arXiv or catalog fetch without an `r.ok` check, and
the 08:00 `[]` is the same 06:07-class arXiv error being swallowed there. If it *does* check `r.ok`,
this chain breaks and the `[]` has a different cause.

## 6 — Limits

- I have not executed the patcher. Its anchor match, its 400-char scope check, and the resulting
  worker behaviour are all untested. **It may fail closed on the real file** if the parse line has
  been reformatted since the bundle I read.
- I did not read `radar-hub`'s unread tail, so §5 is a ranked guess, not a finding.
- `radar-hub` has **only** `worker.js` — no `README.md`, no `deployed-current.worker.js`. So it
  violates the same deployed-current discipline its siblings document, and there is no bundle to
  cross-check my read against.
- `qnfo-arxiv-radar/worker.js` (commit `0185920c`) is now **misleading dead weight** in the repo. It
  should either be deleted or given a `RETIRED.md` pointing at `radar-hub`. I am flagging it rather
  than deleting it, since deletion is irreversible and not mine to decide.
- This is the **thirteenth** entry in this session's correction series, and the second time a fix I
  shipped did not do what I said it did (the first was the reaper, dead code for D17). Both times the
  failure was the same: I verified that the *change* was correct and never verified that the *target*
  was live.
