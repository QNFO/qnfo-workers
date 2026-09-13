# ADDENDUM — publish pipeline, stub releases, and silent subsystems (verified 2026-09-13)

Author: qnfo-ops (ops-exec), ~13:35–13:45Z. Closes the remaining unverified claims from
`docs/HANDOFF-2026-09-13-quniverse-blockers.md` §5 and `docs/DEAD-SUBSYSTEMS-2026-09-13.md`.
Every figure is a live tool return.

---

## 1. CONFIRMED — the publish pipeline logs failures as `ok`

`cloud_ops_events`, kind `v2-drain`: **40 events, all `status='ok'`**, first
2026-09-03T14:11:10Z, last 2026-09-13T09:55:46Z. The payloads say otherwise. Verbatim, the four
most recent:

| ts | `job` | `status` | `text` |
|---|---|---|---|
| 2026-09-13T09:55:46.687Z | `qnfo-research-exec` | **`ok`** | `[{"ok":false,"stage":"v2","error":"newversion failed: {\"_status\":504,\"_text\":\"error code: 504\n\"}"}]` |
| 2026-09-13T07:45:50.931Z | `qnfo-research-exec` | **`ok`** | same 504 |
| 2026-09-13T05:21:30.947Z | `qnfo-research-exec` | **`ok`** | `[{"ok":false,"stage":"v2","error":"NL is not defined"}]` |
| 2026-09-13T03:11:34.823Z | `qnfo-research-exec` | **`ok`** | same `NL is not defined` |

`40/40` carry `status='ok'`; `0/40` carry an error status. The masking is total, and there are
**two distinct live defects** behind it: a Zenodo **504** on `newversion`, and a bare
`NL is not defined` ReferenceError.

## 2. CONFIRMED — two stub publications, byte-identical

`r2_list releases 2026/09`:

| key | size | etag |
|---|---|---|
| `2026/09/1-introduction.md` | **97** | `5951e425a3a1837c6ce8dcd5f4dd539c` |
| `2026/09/operationalizing-infomatics.md` | **97** | `5951e425a3a1837c6ce8dcd5f4dd539c` |

**Identical etag ⇒ identical content.** `r2_get` on the first returns, in full:

```
## Changelog

- v2.0.0: Adversarial audit revision. Fixes: no substantive corrections required.
```

That is a changelog, not a paper. Their `.html` (2,694 / 2,720 B) and `.pdf` (19,426 / 21,248 B)
siblings are non-trivial, so the render path produced something while the `.md` — the source of
record — is a stub. By contrast `chapter-5-the-contours-of-ignorance.md` is 861 B and
`ii-4-astronomers-exile.md` is 637 B, so the 97-byte pair is not merely "short".

## 3. `version_queue` id=18 — fully characterised, and it is retried and failing

`version_queue` lives in **qnfo-audit**, not living-paper (`living` has only `paper_versions`).

| field | value |
|---|---|
| `id` | 18 |
| `paper_doi` | `10.5281/zenodo.22706406` |
| `new_doi` | `10.5281/zenodo.22732639` |
| `version_from` → `version_to` | `2.0.1` → `2.0.2` |
| `status` | **`error`** |
| `created_at` | 2026-09-11 10:22:29 |
| `updated_at` | **2026-09-13 09:55:46** |
| `recover_count` | 0 |

The `updated_at` is the **exact timestamp of the most recent `v2-drain` 504 event** — so the
drain is picking the row up and failing it, repeatedly, for two days. `recover_count=0` means the
recovery path has never run.

**A DOI inconsistency the row itself does not resolve.** Three different DOIs are in play:
`paper_doi` `…22706406`, `new_doi` `…22732639`, and the frontmatter inside `corrected_md`
`doi: "10.5281/zenodo.22706582"`. The v2.0.2 changelog states it *"corrects the frontmatter DOI to
the record DOI"* — but the frontmatter still carries a third value. Which is the record DOI is not
determinable from this row.

The row also carries a **complete** paper body (abstract, literature review, eight real references
with arXiv/DOI identifiers, a `jpcub_nv_verify.py` script whose recorded output reports
`RESULT: PASS`). So the content is ready and the deposit is what fails.

**Pipeline-wide:** `version_queue` = **16 `published`, 1 `error`**, last successful publish
**2026-09-11 09:02:07**. Publishing has been broken since 2026-09-11.

## 4. NEW — `pipeline-supervisor` went silent on 2026-09-11, 14 minutes before a deploy

`cloud_ops_events`, kind `pipeline-supervisor`: **517 events**, first 2026-09-06T06:12:21Z, last
**2026-09-11T14:30:12.906Z**. It emitted on a 15-minute cadence (…14:00:13, 14:15:12, 14:30:12)
and then stopped. `job` = `qnfo-research-supervisor`.

`fleet_status` records `qnfo-research-supervisor` `modified_on = 2026-09-11T14:44:33.502862Z` —
**14 minutes after the last event**. Prime suspect, not proof.

Reconstructed timeline for 2026-09-11:

| time | event |
|---|---|
| 09:02:07 | last successful `version_queue` publish |
| 10:22:29 | `version_queue` id=18 created → `error` |
| 14:30:12 | last `pipeline-supervisor` event (517 total) |
| 14:44:33 | `qnfo-research-supervisor` modified (deployed) |

The research/publish chain stopped on 2026-09-11 and has not resumed.

## 5. Other silent event kinds (correlate with merge waves — do not over-read)

| kind | events | first | last |
|---|---|---|---|
| `pipeline-supervisor` | 517 | 2026-09-06T06:12:21Z | **2026-09-11T14:30:12Z** |
| `fleet-observability-digest` | 34 | 2026-09-10T06:31:44Z | 2026-09-12T06:58:50Z |
| `ai-error` | 44 | 2026-09-03T09:47:45Z | 2026-09-08T12:41:45Z |
| `ai-empty` | 29 | 2026-09-03T11:24:39Z | 2026-09-08T12:31:07Z |
| `advisor-run` | 9 | 2026-09-08T10:23:52Z | 2026-09-08T12:00:56Z |
| `contact` | 74 | 2026-08-28T14:48:08Z | 2026-08-28T14:49:05Z |

`ai-error` / `ai-empty` / `advisor-run` all stop on 2026-09-08 — the same date
`fleet_deploy_state` was last written (16:25:49) and the advisor/calibrator began being folded into
the merged worker. **A silent event kind is not by itself a broken subsystem**; several were merged
away. Only `pipeline-supervisor` has a deploy timestamp adjacent to its silence, so only it is
flagged here.

## 6. Signal map — `cloud_ops_events` taxonomy (top 20 of 30 kinds)

| kind | n | last ts |
|---|---|---|
| `ops_ai_tool` | 15,316 | 2026-09-13T13:31:03Z |
| `heartbeat` | 1,336 | 2026-09-13T13:30:58Z |
| `idle` | 1,163 | 2026-09-13T13:30:59Z |
| `health` | 974 | 2026-09-13T13:31:00Z |
| `pipeline-supervisor` | 517 | **2026-09-11T14:30:12Z** |
| `advisor-audit` | 364 | 2026-09-13T13:20:57Z |
| `job-run` | 304 | 2026-09-13T13:30:30Z |
| `done` | 170 | 2026-09-13T09:34:54Z |
| `digest` | 83 | 2026-09-13T13:00:59Z |
| `contact` | 74 | 2026-08-28T14:49:05Z |
| `claim` | 74 | 2026-09-13T09:20:59Z |
| `autopilot-cycle` | 70 | 2026-09-13T13:06:05Z |
| `proactive-alert` | 63 | 2026-09-13 11:09:59 |
| `ai-error` | 44 | 2026-09-08T12:41:45Z |
| `v2-drain` | 40 | 2026-09-13T09:55:46Z |
| `fleet-observability-digest` | 34 | 2026-09-12T06:58:50Z |
| `ai-empty` | 29 | 2026-09-08T12:31:07Z |
| `latex-fail` | 23 | 2026-09-13 05:21:19 |
| `paper-explain` | 12 | 2026-09-12T14:00:56Z |
| `advisor-run` | 9 | 2026-09-08T12:00:56Z |

`latex-fail` (23 events, `status` NULL, 2026-09-05 → 2026-09-13) is recurring and unclassified —
another silent-failure channel alongside `v2-drain`.

## 7. Limits

- The `pipeline-supervisor` cause is **correlation, not proof**: the deploy timestamp is adjacent,
  but the worker's code was not read and no log attributes the stop to it.
- `status='ok'` masking is demonstrated on `v2-drain` only; other kinds were not payload-inspected.
- The 97-byte stub pair was verified by etag equality plus one full read; the second file's content
  was inferred from the identical etag, not read.
- Three DOIs are listed for id=18; the row does not say which is authoritative, and I did not
  consult Zenodo.
- `latex-fail` and `seo-fail` carry `status` NULL — 27 events whose failure class is unrecorded.
- Still blocked, unchanged: no D1 write, no mail-config tool, no deploy tool, no branch-create
  (so no PR), and `qnfo-canonical` R2 is not bound.
