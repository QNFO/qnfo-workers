# CORRECTION — `fleet_improvements` HAS a consumer; it is stalled, not absent. Plus a fourth broken probe.

Author: qnfo-ops (ops-exec), 2026-09-13 ~13:50Z. Every figure is a live tool return.

This corrects a claim I committed earlier today in **both**
`docs/FULLSTACK-INTEGRATION-PLAN-2026-09-13.md` §5 and
`docs/INTEGRATION-MANIFEST-2026-09-13.json` (`backlog.fleet_improvements.note`), where I wrote:

> "no consumer drains `fleet_improvements`"

**That is false.** I asserted a missing consumer from a `status` count alone, without checking
whether a `done` state existed or when it was last written. It does, and it was.

---

## 1. The consumer exists and completed 38 items

`fleet_improvements`, grouped by status:

| status | n | first `created_at` | last `updated_at` |
|---|---|---|---|
| `approved` | 44 | 2026-09-09 07:19:53 | **2026-09-09 07:50:37** |
| **`done`** | **38** | 2026-09-09 07:19:42 | **2026-09-09 13:57:28** |
| `proposed` | 31 | 2026-09-09 19:19:59 | 2026-09-13 00:04:56 |
| `rejected` | 2 | 2026-09-09 07:28:42 | 2026-09-09 07:54:05 |
| `withdrawn` | 1 | 2026-09-11 10:38:24 | 2026-09-11 10:38:24 |
| `implemented` | 1 | 2026-09-11 09:30:48 | 2026-09-11 09:30:48 |

**38 rows reached `done` on 2026-09-09, the last at 13:57:28.** A drainer ran. So the defect is
**not** "producer with no consumer" — it is a consumer that ran for one day and stopped.

The accurate statement, replacing mine:

- The 09-09 07:19 batch was processed within ~6.5 hours (38 `done`).
- The 44 `approved` rows have not been touched since **2026-09-09 07:50:37** — approved but never
  executed, for four days.
- The 31 `proposed` rows date from **2026-09-09 19:19:59** onward — i.e. created *after* the
  consumer's last successful work — and have not advanced past `proposed`. Their `updated_at`
  reaches 2026-09-13 00:04:56, so *something* still touches them (a re-scan bumping the row),
  but nothing promotes them.

This is a **fourth distinct failure shape** in the session, and I mislabelled it as the third
instance of "producer with no consumer". The actual shapes are:

| shape | example | state |
|---|---|---|
| producer, no consumer | `agent_issues` health rows → `no probe target` | 0/25 closed |
| consumer runs, closes nothing | `ops_issue_run` → `processed:10, closed:0` | live |
| consumer ran once, stopped | **`fleet_improvements`** | 38 done 09-09, then stalled |
| detector works, notifier fails | `proactive-alert`, `alerts`→spam | live |

## 2. NEW — `worker-health` is a fourth broken probe mechanism, and it names two unknown workers

`cloud_ops_events`, kind `job-run`, status `error`:

```
2026-09-13T03:05:43.922Z  worker-health FAILED
[{"worker":"qnfo-ai","status":530,"error":"HTTP 530 body:error code: 1016"},
 {"worker":"personal-api","status":530,"error":"HTTP 530 body:error code: 1016"},
 {"worker":"qnfo-ai-chat","status":530,"error":"HTTP 530 body:error code: 1016"},
 {"worker":"personal-api-chat","status":530,"error":"HTTP 530 body:error code: 1016"}]
```

Repeated at `2026-09-12T15:05:24Z`. Same run, `qnfo-idea-factory` returned **200**.

So the failure is **per-host, not blanket** — `qnfo-idea-factory` answers and four others return
CF-1016. This is the same transport fault documented for the `.internal` plain-`fetch()` path, now
confirmed as a fourth independent probe mechanism (`fleet_status` bindings, `feedback_probes`
`workers.dev`, `qnfo-cloud-ops` `.internal`, and this one).

**Two worker names appear here that are in neither the 55-worker listing nor `fleet_probe_log`:
`qnfo-ai-chat` and `personal-api-chat`.** The census grows again — see §4.

## 3. NEW — a third "detector works, notifier fails" instance, and it corroborates the 09-11 break

`cloud_ops_events`, kind `proactive-alert`: 22 `err` + 11 `warn` = 33 events, **every one failing**.

| id | status | ts | text |
|---|---|---|---|
| `watch-trace-stall-2026091311` | **`err`** | 2026-09-13 11:09:59 | `WATCH:trace-stall: threshold breached` |
| `watch-research-failed-2026091311` | **`err`** | 2026-09-13 11:09:58 | `WATCH:research-failed: threshold breached` |
| `watch-trace-stall-2026091308` | **`err`** | 2026-09-13 08:09:59 | `WATCH:trace-stall: threshold breached` |
| `watch-research-failed-2026091308` | **`err`** | 2026-09-13 08:09:58 | `WATCH:research-failed: threshold breached` |

Two things follow. First, `qnfo-observability` **is** detecting the research-pipeline failure —
`WATCH:research-failed` fires on a 3-hourly cadence — which independently corroborates the
2026-09-11 break found in the addendum. Second, the alert itself carries `status='err'`: the
detector fires and the notification fails, the same shape as `alerts` → spam and `v2-drain` →
`ok`. **Three independent notification paths are failing while their detectors work.**

## 4. Updated census

Add `qnfo-ai-chat` and `personal-api-chat` to the union. Revised:

| store | rows |
|---|---|
| `fleet_status` / `service_registry` | 55 |
| `fleet_probe_log` worker names | 80 |
| repo worker dirs | 92 |
| **union incl. `qnfo-ai-chat`, `personal-api-chat`** | **≥ 95** |

Neither new name has a repo directory, a registry row, or a probe row. They exist only as strings
inside a health-check payload — which is the clearest illustration yet that no single store is the
census.

## 5. `latex-fail` payload — the PDF service returns a LaTeX log as `text/plain`

23 events, `status` NULL, 2026-09-05 → 2026-09-13, recurring roughly every 2.5 hours (00:51, 03:11,
05:21). The payload is the raw pdflatex transcript, prefixed `non-pdf text/plain; charset=utf-8`:

```
This is pdfTeX, Version 3.141592653-2.6-1.40.29 (TeX Live 2026) (preloaded format=pdflatex 2026.9.11)
entering extended mode
 restricted \write18 enabled.
**document
(./document.tex
LaTeX2e <2026-06-01>
(/usr/local/texlive/2026/texmf-dist/tex/latex/base/article.cls
Document Class: article 2025/01/22 v1.4n Standard LaTeX document class
```

So the render path **completed pdflatex and got a log, not a PDF**, and the caller classified it
correctly (`non-pdf`) but recorded no `status`. The transcript is truncated at the class load in
every sample, so the actual error line is not captured in the stored payload — the log is cut
before the failure.

## 6. Limits

- §1 refutes only my "no consumer" claim. It does **not** establish *which* worker consumes
  `fleet_improvements`; no code was read, and the table has no consumer column.
- The `proposed` rows' `updated_at` of 2026-09-13 00:04:56 is consistent with a re-scan bumping
  the row, but that is inference — the writing process was not identified.
- `qnfo-ai-chat` / `personal-api-chat` are known only as strings in a log payload; whether they are
  live workers, retired names, or host aliases is **not** determined.
- The `worker-health` failure is inferred to be a transport fault from the CF-1016 code and the
  per-host pattern; the probe's code was not read.
- `latex-fail`'s stored payload is truncated, so the underlying LaTeX error is unknown.
- Still blocked: no D1 write, no mail-config tool, no deploy tool, no branch-create (no PR),
  `qnfo-canonical` R2 unbound.
