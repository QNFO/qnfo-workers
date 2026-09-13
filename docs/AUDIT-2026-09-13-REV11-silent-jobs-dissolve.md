# REV11 — The six "silent jobs" largely dissolve; one real failure has a stack trace

Date: 2026-09-13. **Qualifies the audit's C4 headline.** Four of the six jobs the
fleet auditor flagged as "silent >48h" are not broken: two were merged away, one
is running, one is dormant by design. Separately, a real failure is now pinned
to a file and line.

---

## 1. A real failure, with a stack trace

Email id 708 (`[research-daily-brief] FAILED 2026-09-13T06:07:35.524Z`,
recipient `alerts@qnfo.org`) — `body_text`, verbatim:

```
scheduled run failed: Error: arxiv 429
    at fetchArxiv (worker.js:45:20)
    at async runBrief (worker.js:113:16)
    at async Object.scheduled (worker.js:185:11)
```

**Root cause: arXiv returns HTTP 429 to `fetchArxiv`.** The scheduled run throws
before producing a digest. The same email appears as id 696 for 2026-09-12, so it
is daily.

- **Owner:** `research-daily-brief` (registry purpose "Daily research email
  digest", version 1.0.0, updated 2026-09-13T07:22:50Z)
- **Nature:** an **upstream rate limit**, not a logic error. The fix is
  retry-with-backoff on 429 in `fetchArxiv`, not a redesign.
- **Note the pattern:** 429 is the same failure class as the Cloudflare gateway
  errors in the main audit §3 (`bge-base-en-v1.5` 429 ×79, `kimi-k2.6` 429 ×6).
  Rate-limiting appears twice in this fleet from two independent upstreams.
- **Also:** this worker is `scanerr:stale-canon` — it has **no canonical**. So
  even the retry fix has nowhere to be committed under the current deploy model.

The email table stores full bodies in `body_text`, with `headers_json` and
`processing_ms`. That is a far richer source than the `emails` stats I used in
the main audit.

---

## 2. `briefing` is NOT silent

The auditor's C4 check reports `job silent >48h: briefing (last event
2026-09-10T06:30:45.800Z)`.

But email id 710, subject **"QNFO briefing — 2026-09-13"**, was received
**2026-09-13T06:30:44.528Z** — today, at the same minute of the day as the
auditor's last recorded event.

**The job ran today.** What stopped on 2026-09-10 is the *event emission* the
auditor watches, not the job. This is the same defect class as the merged job
names in REV10 §1: **the C4 check measures a signal that is not the job.**

Caveat: I have not proven that the `briefing` job and the `research-daily-brief`
worker's job are distinct. Email 708 (06:07:38) and email 710 (06:30:44) are
different subjects at different times, which implies two jobs — but I did not
read the worker to confirm which job name `briefing` belongs to.

---

## 3. `outreach` is dormant by design

`service_registry`, `qnfo-outreach` purpose, verbatim:

> "Outreach engine: cadence sends (**ACTIVATION_AT 2026-09-15**), kill switch"

Today is 2026-09-13. **The outreach cadence is intentionally inactive until
2026-09-15** — two days from now. Its silence since 2026-09-10 is expected.

This also explains the main audit's `Queue outreach_queue` warning (×93) and the
integration report's stale-item note ("oldest pending item 75.2h old"): items are
queued and waiting for the activation date, not stuck.

---

## 4. Revised tally of the six "silent jobs"

| job | status | evidence |
|---|---|---|
| `radar` | **merged away** | `radar-hub` = "wave B: events-radar + qnfo-arxiv-radar + qnfo-research-radar + qnfo-citation-watch" |
| `research-scan` | **merged away** | same |
| `briefing` | **running** | email 710 received 2026-09-13T06:30:44Z; only event emission stopped |
| `outreach` | **dormant by design** | `ACTIVATION_AT 2026-09-15` |
| `email-triage` | unknown | not investigated |
| `gmail-triage` | unknown | not investigated |

**Zero of the six are confirmed broken jobs.**

The main audit and REV5/REV6/REV7/REV10 treated "six jobs silent since
2026-09-10" as a headline finding and a suspected systemic event. **That framing
was wrong.** Four of the six are explained without any fault, and the cluster on
2026-09-10 is explained by *instrumentation and renames* changing on one day, not
by six jobs stopping.

### What actually remains

The real defect is **the auditor's C4 job-silence check**, which:
- watches job names that were merged away (REV10 §1),
- measures event emission rather than job execution (§2 here),
- and does not know about scheduled dormancy (§3).

It will keep firing `high` on jobs that are working, merged, or dormant. That is
the item to fix — F18 in the index, now substantially strengthened.

---

## 5. What this does NOT retract

- **`research-daily-brief` genuinely fails** (§1), with a stack trace. It is the
  one real defect among the seven names involved.
- **`integration_state` dying at 2026-09-11T14:17:37Z is still unexplained**
  (F14). Its death is not explained by anything in this revision.
- **The seven workers with no canonical still have no canonical** (F17),
  including `research-daily-brief`, which means the arXiv-429 fix has no
  canonical home.
- **`ops_issue_run` is still failing 11×/24h** and remains the highest-priority
  infrastructure defect.

---

## 6. Limits

- **`email-triage` and `gmail-triage` were not investigated.** Two of six remain
  unexplained, so "zero confirmed broken" is a statement about four.
- **I did not confirm which worker owns the `briefing` job** (§2 caveat). If
  `briefing` is `research-daily-brief`'s job, then §2 and §1 are the same job and
  the briefing email's provenance is unexplained.
- **The arXiv 429 is read from a stack trace in an email body**, not from
  arXiv's API or from the worker's source. It is strong evidence, not a
  reproduction.
- **`ACTIVATION_AT 2026-09-15` is quoted from the registry purpose string**, not
  from the worker's config. If the registry is stale, the dormancy reading is
  wrong — and REV10 §2 showed the registry disagrees with deployed versions on
  several workers.
- **This is the eleventh document, and it qualifies a headline in the first
  five.** The index should be read instead of any single file.
