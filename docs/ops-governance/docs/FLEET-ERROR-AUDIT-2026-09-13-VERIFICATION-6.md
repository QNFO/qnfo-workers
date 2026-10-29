# VERIFICATION 6 — what applying the NL patch would and would not fix; two column-semantics corrections

Date: 2026-09-13. Supplements `VERIFICATION-5.md` and corrects the failure count in
`FLEET-ERROR-AUDIT-2026-09-13.md` §4.

## 1. MATERIAL CAVEAT on the runner — the NL fix alone will not restore publishing

`cloud_ops_events kind='v2-drain'`, newest rows:

| ts | payload |
|---|---|
| **2026-09-13T14:16:11.553Z** | `newversion failed: {"_status":504,"_text":"error code: 504"}` |
| 2026-09-13T09:55:46.687Z | `newversion failed: {"_status":504,...}` |
| 2026-09-13T07:45:50.931Z | `newversion failed: {"_status":504,...}` |
| 2026-09-13T05:21:30.947Z | `NL is not defined` ← last NL occurrence |
| 2026-09-13T03:11:34.823Z | `NL is not defined` |

The drain runs roughly every 2h10m and **still fails — now at the Zenodo step, not the
ReferenceError**. The last `NL is not defined` is 05:21:30Z, nine hours before the newest row.

**Therefore:** dispatching `apply-staged-patchers.yml` with `mode=apply` fixes the ReferenceError
and the deposit path it blocked, but **publishing will remain stalled on a Zenodo-side 504**. The
504 is not addressable from this endpoint (no retry/backoff control, no Zenodo credentials). Anyone
running the patcher should expect `v2-drain` to keep failing afterwards, with a different payload —
and should not read the continuing failures as evidence the patch failed.

Related, unchanged: `kind='latex-fail'` persists (newest `2026-09-13 05:21:19`, payload
`non-pdf text/plain; charset=utf-8 This is pdfTeX, Version …`), so the TeX path is a third
independent blocker on the same pipeline.

## 2. CORRECTED — `ops_ai_log.ok=0` is not a failure indicator

My audit's §4 reported `ops_ai_log` as 1,823 rows / **76 failed (4.2%)**. Reading those rows shows
they are not failures:

| ts | model | latency_ms | response head |
|---|---|---|---|
| 07:26:40 | ops-exec | 106,524 | `## Session complete — seven pieces delivered, five findings committed` |
| 07:25:54 | ops-exec | 250,939 | `INCOMPLETE: no PR and no applied code — branch creation is impossible from qnfo-ops …` |
| 07:24:46 | ops-exec | 177,665 | `## Seven pieces written and gated this turn` |
| 07:23:34 | ops-exec | 578,831 | `All 13 pieces pass the composed gate. Writing the final record.` |

Complete deliverables, 100–580 s latencies. `ok=0` marks **in-flight or chained jobs whose turn
completed**, not errors — the same "`ops_ai_log.ok=0` never reconciled" defect recorded earlier in
this session's corpus. Any failure rate derived from that column is meaningless, including mine.

## 3. `ops_jobs` ledger state

```
status       rows   holding a response
succeeded     101    —
continuing     37    37  (every one)
running        10     0
failed          8    —
```

`continuing` rows **all carry a response** — each is a chain midpoint holding a complete turn's
output, not an incomplete job. `running` rows carry none, which is what genuinely in-flight looks
like. So the two non-terminal states are distinguishable, and "47 non-terminal" overstates the
in-flight set by 37. The `continuing` count has grown to 37 (the prior session recorded 18).

## 4. Ticket 707 is not corroborable from this endpoint

Ticket 707 claims *"[qnfo-ops] async job runner replays thinking-mode turns: deepseek 400
'reasoning_content must be passed back' on round 0 (36 rows, 2026-09-05..09-12)"*. I searched every
bound surface:

| surface | rows matching `reasoning_content` |
|---|---|
| `ai_gateway_failures.sample_detail` | **0** |
| `cloud_ops_events.text` | **0** |
| `ops_jobs.response` | 2 — both are *deliverables discussing the defect*, not the error |
| `ops_jobs.tool_log` | 1 — same character |

**The 36 rows are not in any table bound to `qnfo-ops`.** The claim is not refuted; it is
unverifiable here. Its evidence source is elsewhere.

## 5. Still pending

The research-exec tombstone test: `fleet_drift_report` is unchanged at `max(id)=1708`,
`newest=2026-09-13 14:05:46` — **no scan has run since**. The deciding query remains:

```sql
SELECT id, source_path, canonical_version, note FROM fleet_drift_report
 WHERE worker='qnfo-research-exec' ORDER BY id DESC LIMIT 1;
```

## 6. Note on this session's own footprint

`cloud_ops_events` errors for today are dominated by `kind='ops_ai_tool'` rows from **this session**
(`web_fetch`, `github_file_write`, `ops_d1_query`, `workspace_read`, `ops_issue_run`, 14:15–14:19Z).
The endpoint auditing the failure stream is a visible contributor to it.
