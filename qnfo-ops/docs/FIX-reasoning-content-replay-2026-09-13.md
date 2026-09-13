# FIX — async job runner rejects its own replayed history (DeepSeek `reasoning_content` 400)

Date: 2026-09-13
Status: **identified + documented** (no patch applied — see "Why not patched here")
Worker: qnfo-ops. Repo source `VERSION = "2.14.0"` (blob sha `cf9bb72e0b4e9a9f98343ea296cf9ae55dff0d13`, 161,339 bytes); live `/health` reports **2.15.1** — version drift, see §6.
Fix-queue id: **F14** — absent from `audits/2026-09-13-fix-queue.json`, which carries F1–F13.

## 1. Defect

Every async job whose replayed message history contains an assistant turn that carried
`reasoning_content` dies on its **first** upstream round. The runner records
`status='failed'` in `ops_jobs` but leaves `ops_jobs.error` **NULL**; the real error is
written only to `ops_ai_log.response`.

Exact text, identical in all 43 rows:

```
JOB_ERROR: deepseek round 0 failed: deepseek 400:
{"error":{"message":"The `reasoning_content` in the thinking mode must be passed back to the API.","type":"invalid_request_error","param":null,"code":"invalid_request_error"}}
|| SHAPES=...
```

## 2. Evidence

`ops_ai_log` rows matching `%reasoning_content%`: **43**, first `2026-09-05T02:42:28.262Z`,
last `2026-09-12T13:27:59.295Z`.

The six genuine failures — all `ops_jobs.status='failed'`, `error` NULL:

| job id | payload B | created | failed | elapsed s |
|---|---|---|---|---|
| `job-b35176b8c6e349` | 520,244 | 2026-09-12T13:20:34.654Z | 13:20:57.524Z | 22.9 |
| `job-dab978f5cd5b24` | 450,728 | 2026-09-12T13:27:38.553Z | 13:27:59.053Z | 20.5 |
| `job-4053ae899fc0cb` | 32,400 | 2026-09-12T12:37:49.911Z | 12:38:07.554Z | 17.6 |
| `job-239189cb9f7f6a` | 16,304 | 2026-09-12T12:37:33.178Z | 12:37:49.101Z | 15.9 |
| `job-772fe9ff73b854` | 14,865 | 2026-09-12T11:49:44.160Z | 11:50:01.149Z | 17.0 |
| `job-611757757c9daa` | 3,536 | 2026-09-12T11:59:27.158Z | 11:59:43.031Z | 15.9 |

Two further `failed` rows (`job-fff496b4ffd5b7`, `job-be557ed424646d`, 2026-09-06) are
deliberate reconcile/test artifacts carrying descriptive `error` strings; they are **not**
instances of this defect.

## 3. Behavioural proof that the replay is the trigger

`SHAPES` is a role/feature fingerprint of the replayed message array. Every failing job's
fingerprint contains at least one `assistant[tcN,rcM]` turn (tool calls + reasoning
content), e.g.

```
tool|assistant|assistant[tc3,rc2567]|tool|tool|tool|assistant[tc2,rc1908]|tool|tool|assistant[tc1,rc14524]|tool|assistant|assistant[tc2,rc1763]|tool|tool|assistant
system|system|user|assistant[tc1,rc3104]|tool|assistant
```

`round 0 failed` means the **initial** upstream call was rejected — no tool ran, and
`ops_jobs.tool_log` is `"[]"` (2 bytes) on every failure. All 13 `succeeded` jobs have
payloads of 155–371 bytes, too small to contain a prior assistant turn with reasoning
content.

## 4. Impact

- **The durable async path fails for exactly the work it exists to carry.** Any client
  replaying a long, tool-using conversation to `POST /v1/jobs` gets a silent failure
  16–23 s later.
- **The failure is unpollable.** `status='failed'` with `error=NULL` means a poller learns
  *that* it failed but never *why*; the reason lives in a different table.
- **It re-files.** Tickets **#445** (created 2026-09-05T02:42:28) and **#587** (created
  2026-09-09T08:00:07) both describe this error and are both `closed`, yet 43 occurrences
  continue through 2026-09-12. Whatever fix landed did not hold.

## 5. Why not patched here

`qnfo-ops/worker.js` is 161,339 bytes. `github_repo_read` returns at most 32,768 chars
(verified again 2026-09-13: `maxChars=32768` truncated) with **no offset parameter**, so
the message-assembly path cannot be reconstructed for a full-file GitHub contents-API
write. This endpoint has no deploy tool and no D1 write path. Same constraint as
`docs/FIX-telemetry-hours-2026-09-12.md`. The handler was therefore **not inspected**, and
the fix below is specified from behaviour, not source.

## 6. Version caveat

Repo `VERSION = "2.14.0"` vs live `/health` **2.15.1**. The repo blob has also grown past
the 157,722 bytes recorded in `docs/FIX-telemetry-hours-2026-09-12.md`, so it is under
active edit. **Confirm the deployed revision before patching**, or the anchor may not match.

## 7. Candidate fixes (need source inspection; do not assume)

The API message says reasoning content "must be passed back" — so the runner is presumably
**dropping** it on replay. Two candidate directions, both requiring the source:

- **(a) Pass it back.** Include each replayed assistant turn's `reasoning_content` in the
  upstream payload. Note the stored `ops_jobs.payload` carries a *placeholder*
  (`"[reasoning omitted upstream; tool call decision only]"`), not real reasoning content,
  so the runner must either persist the real value or tolerate the placeholder.
- **(b) Do not imply thinking mode for replayed turns.** If real reasoning content is not
  persisted, the replay cannot satisfy (a); the turn must then be sent in a form that does
  not require it.

A discriminator worth testing: the 2026-09-12 failures carry real `rc` lengths of
74–14,524, while 2026-09-13 jobs carry `rc` as the fixed placeholder string and have
**not** failed this way (3 `running`, 1 `continuing` at 06:35Z). Whether that difference is
causal is **not established**.

## 8. Acceptance criteria (post-deploy)

- A job whose replayed history contains `assistant[tc*,rc*]` turns reaches a terminal state
  with a non-empty `response` or a populated `error`.
- `ops_jobs.error` is non-NULL whenever `status='failed'`.
- No new `ops_ai_log` row matching `%reasoning_content%` after the deploy.
- Re-run the 2026-09-12 repro shape (replay a tool-using conversation > 3,536 B) and observe
  completion rather than `round 0 failed`.

## Related

- `audits/2026-09-13-fix-queue.json` — F1–F13; **this defect is not among them.**
- `docs/FIX-telemetry-hours-2026-09-12.md`, `docs/FIX-listIssues-await-2026-09-08.md` — same
  worker, same read-limit blocker, still staged; can ride one deploy.
- `ops_jobs` / `ops_ai_log` in qnfo-audit. `cloud_ops_events` carries no job id — its `job`
  column is a job-family label (`deepchat-ops`, `gtd-reconcile`, …), not an `ops_jobs.id`.
