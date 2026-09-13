# ADDENDUM — gw-fail closer: verified upstream errors, a probe false-positive, and a second backlog

Date: 2026-09-13
Author: qnfo-ops (ops-exec session, 07:16–07:50Z)
Parent: `FINDING-2026-09-13-gw-fail-tickets-cannot-self-close.md`
All figures are live `ops_d1_query` / `run_code` returns from this session.

---

## 1. The actual upstream errors (extracted from `agent_issues.description`)

Every open `[gw-fail]` ticket carries the gateway's verbatim error. This is the actionable content
that the ticket titles hide:

| id | model | status | class | count/sweep | verbatim error |
|---|---|---|---|---|---|
| 654 | `@cf/qwen/qwen3.8-27b` | 400 | upstream | 14 | **"System message must be at the beginning."** |
| 655 | `@cf/zai-org/glm-5.2` | 429 | rate-capacity | 1 | "Capacity temporarily exceeded, please try again." |
| 656 | `@cf/qwen/qwen2.5-coder-32b-instruct` | 400 | content-shape | 42 | "Bad input: Error: oneOf at '/' not met, 0 matches: required properties at '/' are…" |
| 657 | `@cf/moonshotai/kimi-k2.6` | 429 | rate-capacity | 2 | "Capacity temporarily exceeded, please try again." |
| 658 | `@cf/zai-org/glm-5.2` | 400 | tool-args-json | 1 | "Assistant tool call function.arguments must be valid JSON." |
| 659 | `@cf/google/gemma-4-26b-a4b-it` | 400 | image-input | 1 | "Invalid data for image — reason image dimensions must be at least 10px" |
| 660 | `@cf/baai/bge-base-en-v1.5` | 429 | rate-capacity | **89** | "Rate limited." |
| 670 | `@cf/moonshotai/kimi-k2.7-code` | 429 | rate-capacity | 2 | "Capacity temporarily exceeded, please try again." |

**Two of these are not model defects at all** — see §2 and §3.

## 2. VERIFIED FALSE POSITIVE — the vision probe fixture is on the rejection boundary

Issue 659 flags `gemma-4-26b-a4b-it` as failing with *"image dimensions must be at least 10px"*.
The probe's own fixture was decoded this session (`run_code`):

```
RED10X10_B64 -> 75 bytes, PNG signature valid (89 50 4e 47 0d 0a 1a 0a)
IHDR width  = 10
IHDR height = 10
bitDepth 8, colorType 2
```

The probe sends a **10×10** image to a model that rejects images below the 10px threshold. The
fixture sits **exactly on the boundary**, so the model is being reported as failing by a borderline
test fixture rather than by any defect of its own.

**Fix:** enlarge the fixture (e.g. 16×16 or 32×32). This should clear `[gw-fail] 400 gemma-4-26b`
and the `MODEL-DEGRADED` tickets that cite it (663, and any sweep listing `gemma-4-26b-a4b-it`).
Until then, that model's health signal is **wrong**, and `ai_model_health` may be deprioritising a
healthy model in live routing.

## 3. Issue 654 is a ROUTER defect, not a model defect

`qwen3.8-27b` 400s with *"System message must be at the beginning."* — an upstream `BadRequestError`
caused by the **caller** placing a system message out of order. The model is rejecting a malformed
request. The defect is in whatever builds that request (router or probe), and it produces 14
failures/sweep attributed to the model.

## 4. THIRD defect — `fileIssue` re-opens what the closer resolves

`fileIssue`, source-verified:

```js
if (ex) { await env.QNFO_AUDIT.prepare("UPDATE issue_ledger SET occurrences = occurrences + 1, last_seen = ?2, last_detail = ?3, updated_at = ?2, status = 'open', resolved_at = NULL, resolution_note = NULL WHERE fingerprint = ?1")…; return false; }
```

An existing fingerprint is unconditionally set back to **`status = 'open'`**. So even when the
closer fires, the next sweep that sees the same failure **re-opens the ticket**. With every affected
model failing 47–48 of the last 48 sweeps, no `issue_ledger` ticket can stay resolved.

**Verified behaviourally**, not just from source: between two queries ~25 minutes apart this session,
`issue_ledger` went from **open 288 / resolved 21** to **open 290 / resolved 19**. New filings can
raise `open` but cannot lower `resolved`; the drop requires a status transition out of `resolved`.
That is the re-open path firing.

**Consequence for the patch:** `apply-gw-closer-fix.mjs` edit A makes the predicate reachable, but
while a model keeps failing the ticket will close and immediately re-open. That is arguably correct
(the failure is real) — but it means **the fix does not reduce the backlog**, and the earlier
phase-2 framing of "a ratchet" applies to `issue_ledger` far more than to `agent_issues`.

## 5. FOURTH defect — a second, larger, invisible backlog

`issue_ledger` holds an **`AUTO-SWEEP:`** fingerprint family that **no ops tool surfaces** (all
`ops_*` tooling reads `agent_issues`). Top rows by occurrences:

| title | status | occurrences | first_seen | last_seen |
|---|---|---|---|---|
| `AUTO-SWEEP: ops_d1_query` | open | **443** | 2026-09-04T06:16:48 | 2026-09-13T06:20:42 |
| `AUTO-SWEEP: web_fetch` | open | 351 | 2026-09-07T00:17:13 | 2026-09-12T18:22:31 |
| `AUTO-SWEEP: terminal research failure 45 -> agent_issues dup` | open | 115 | 2026-09-10T12:16:25 | 2026-09-13T06:17:33 |
| `AUTO-SWEEP: research pipeline: failed=1 stalled=0 published=` | open | 103 | 2026-09-09T12:15:48 | 2026-09-11T00:16:28 |
| `AUTO-SWEEP: github_repo_read` | open | 62 | 2026-09-06T12:15:50 | 2026-09-12T18:21:58 |
| `[self-heal] tool web_fetch failing x350 (24h no recovery)` | open | 56 | 2026-09-11T10:30:56 | 2026-09-13T07:20:26 |

`AUTO-SWEEP: ops_d1_query` has been open with **443 occurrences over 9 days** — bumped roughly every
30 minutes and never closed. Aggregate: **open 290, total occurrences 2374, max 443**.

This is the real ratchet. Note also `…terminal research failure 45 -> agent_issues dup`: the title
itself records that it duplicates an `agent_issues` row, i.e. the two stores are knowingly
double-counting the same condition.

## 6. Producer stamp — unresolved contradiction

`agent_issues` ids 654/658/670 carry **`source = 'qnfo-ai-calibration'`**, `category =
'ai-calibration'`, `priority = 'high'`, and a `description` that is verbatim the string built at
`fileIssue`'s call site.

But the repo's `fileIssue` (blob `7a37a8ab…`, VERSION 1.1.4) inserts into **`issue_ledger`**, whose
column list is `(fingerprint, source, level, category, title, status, first_seen, last_seen,
occurrences, last_detail, updated_at)` — not `agent_issues`'s
`(id, title, description, source, category, priority, status, linked_session, created_at,
updated_at)`.

So **either** the deployed worker differs from the repo source, **or** a second code path in the
unread tail of `worker.js` writes `agent_issues`. Not resolved. This matters because it determines
whether anything **re-opens** closed `agent_issues` rows, which would defeat edit B of the patch.

**Mitigating evidence:** the disposition gate in the same sweep (`agent_issues WHERE title LIKE
'%model%' AND status IN ('wontfix','closed','resolved')`) means a row closed by edit B becomes a
*disposition*, which **suppresses** re-filing for that model. So edit B is self-reinforcing rather
than self-defeating — provided the unread path respects the same gate.

## 7. `updated_at` note

All three sampled rows share `updated_at = 1789283871998` (2026-09-13T07:17:51.998Z) — that is this
session's own `ops_issue_run` drain touching them, not the producer. `updated_at` on `agent_issues`
therefore reflects the last drain, not the last genuine change.

## 8. Residual uncertainty

1. The `agent_issues` producer (§6) is **unidentified**; whether it re-opens closed rows is unknown.
2. `resolved 21 -> 19` is conclusive that *something* re-opens `issue_ledger` rows, and the code
   path is source-verified, but I did not observe a specific fingerprint flip.
3. Whether `ai_model_health` is currently **deprioritising gemma-4-26b** because of the §2 false
   positive was not checked — it is the live-impact question and remains open.
4. The unread ~3,000-byte tail of `qnfo-ai-calibration/worker.js` was not recovered (read caps:
   32,768 via `github_repo_read`, 30,000 via `web_fetch`).
