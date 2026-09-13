# ADDENDUM 11 — the mailbox: a real correspondent left unanswered, and 86% of the fleet's own alerts self-binned as spam

2026-09-13, qnfo-ops. Reopens the set for a surface ADDENDA 1-10 did not cover. A new surface
justifies an addendum rather than a correction entry in the index.

## 1. A real person replied on 2026-09-06 and has not been answered

| id | direction | from | subject | status | ts |
|---|---|---|---|---|---|
| 501 | outbound | `rowan.quni@qnfo.org` | Your coding-agents talk — reliable computation out of unreliable components | sent | 2026-09-04T10:55:09Z |
| 552 | **inbound** | **`tobias.osborne@itp.uni-hannover.de`** | Re: [extern] Your coding-agents talk… | **processed** | **2026-09-06T12:07:50.558Z** |

Tobias Osborne replied on 09-06. **Seven days later the row still reads `processed`, not `replied`**,
and `email_respond` has **0 successes in 15 attempts** — all six sampled attempts are the same reply
to id 552, bodies opening "Hi Tobias,", spanning 2026-09-09T06:56:50Z to 09:36:44Z. `email_stats`
reports 12 messages `replied`; 552 is not one of them.

A substantive reply was composed at least six times and never sent.

**This is an outstanding human obligation that the fleet's telemetry does not surface.** The tool logs
15 failures, the row stays `processed`, and nothing escalates — no ticket, no alert that survives
§2. I did not attempt a send: `email_respond` requires explicit affirmation in the operator's latest
message, and none has been given.

## 2. 86% of the fleet's own alerts are classified as spam

Emails whose sender matches `bounces@cf-bounce.qnfo.org` / `bounces@`:

| classification | status | n |
|---|---|---|
| alerts | **spam** | **151** |
| alerts | archived | 25 |
| general | archived | 3 |
| personal | archived | 2 |
| general | spam | 1 |

**151 of 176 self-alert messages (86%) are binned as spam.** From the ten most recent inbound
messages alone, these are among those discarded:

- `QNFO AI endpoint health alert` (id 705)
- `[research-daily-brief] FAILED 2026-09-13T06:07:35.524Z` (id 708)
- `Loose threads — 41 item(s) need disposition` (id 707)
- `QNFO register guard: 26 overdue / 0 no-executor` (id 706)
- `Outreach pipeline self-check 2026-09-13` (id 711)
- `QNFO briefing — 2026-09-13` (id 710)

The decisive detail: **the same subject line sent from `qnfo@qnfo.org` (id 709) is recorded `sent`;
sent from `bounces@cf-bounce.qnfo.org` it is `spam`.** The classifier keys on the bounce sender — and
that is the sender the fleet routes its own alerts through.

`email_stats`: 682 total, **258 spam**, 23 in the last 24 h. So the spam folder is roughly **59% the
fleet's own alert traffic**. The fleet has alerting for exactly the defect classes this set
documents — endpoint health, failed briefs, register guards, loose threads — and those alerts are
discarded before they reach anyone.

## 3. The converse misclassification

id 703: `navneet.kumar@tracxn.com`, "Tracxn | Exclusive Summer Offer 2026" — classified **`personal`**
and **`processed`**, i.e. acted on. A cold marketing email receives better treatment than the fleet's
own health alert.

## 4. Why this belongs in this set

Corrections 31-33 established that the calibration suite cannot measure model quality. This addendum
establishes the second half of the same problem: **the channel that would report a failure is also
broken.** `email_respond` is 0-for-15; the alert mail is 86% self-binned; `telemetry_report`'s
`open_self_heal_issues` reads 0 while 6 are open; `telemetry_analyze` launders a standing ticket into
a resolved one. Every outward-facing signal this fleet has is either silent or wrong.

## Limits

- I did not verify whether a reply to 552 left by some path other than `email_respond`. The record
  shows no `replied` status and no successful `email_respond` — strong, not conclusive.
- "Self-alerts binned" assumes every `bounces@cf-bounce.qnfo.org` message is fleet-generated; a bounce
  for an external send would also match the filter.
- The classifier's rule is inferred from the sender-keyed split, not read from source.
- I attempted no send and no status change: `email_respond` and `email_mark` are both gated.
- The 258 spam figure is a lifetime count; the 151/176 split is restricted to bounce senders, so the
  two are not the same population.
