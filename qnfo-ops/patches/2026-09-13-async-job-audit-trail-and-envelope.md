# qnfo-ops — async job path: 4 defects + fixes (2026-09-13)

Author: qnfo-ops / ops-exec (audit session 2026-09-13T06:29–06:45Z).
Status: **STAGED — not applied.** No deploy tool exists on the qnfo-ops endpoint, and
`qnfo-ops/worker.js` (161,339 B) is past the 32,768-char read cap, so a full-file
contents-API write is not possible from that endpoint. Apply via `wrangler deploy` from
`qnfo-ops/` after review.

All figures below are live D1 / repo reads, not inherited.

---

## D1 — `ops_jobs.tool_log` truncates at 3,000 chars, producing invalid JSON

**Measured** (`SELECT length(tool_log), substr(tool_log,-1,1) FROM ops_jobs`):

| id | length | last char | parses? |
|---|---|---|---|
| job-3e40a70c7e6056 | **3000** | `o` | no |
| job-a662537078661b | **3000** | `h` | no |
| job-6f43b1d0778102 | **3000** | `8` | no |
| job-529f71f87482a6 | **3000** | `s` | no |
| job-8433e952777f37 | 1818 | `]` | yes |
| job-3db02a4565a946 | 1774 | `]` | yes |
| 7 more | ≤375 | `]` | yes |

Four rows sit at **exactly 3000 bytes with the final byte inside a JSON string**. Independent
confirmation: `json_array_length(tool_log)` raises
`D1_ERROR: malformed JSON: SQLITE_ERROR` — for the whole table, and again when restricted to
those four ids.

**Impact.** The truncated rows are the most tool-heavy jobs. `tool_log` is the only per-job
record of what the async agent did, so the audit trail is destroyed for exactly the jobs that
did the most work. Note the (truncated) log of `job-529f71f87482a6` already holds **14** tool
entries, so a correct fix must accommodate far more than a 3 KB budget.

**Root cause (inferred, not read).** Truncation is applied to the *stringified* output
(`JSON.stringify(log).slice(0, N)`) rather than to the array. Slicing a JSON string at an
arbitrary byte is what breaks parseability. **I could not read the offending line** — the file
is past the read cap — so treat this as a hypothesis to confirm at the call site.

**Fix.**
1. Truncate the **array**, then stringify: `JSON.stringify(log.slice(0, MAX_ENTRIES))`. Never
   slice a stringified value.
2. If a byte budget is genuinely required, set it to `OPS_TOOL_RESULT_CAP` (32768) for
   consistency with the documented tool-result cap, and still slice by entry.
3. Add an explicit `tool_log_truncated INTEGER` (or a trailing
   `{"_truncated":true,"_dropped":N}` sentinel) so consumers can distinguish "no more tools"
   from "log cut".
4. Optionally spill the full log to R2 (`qnfo-audit`, key `ops-jobs/<id>.tool_log.json`) and
   store only the R2 key + entry count in D1.

**Verification.** `json_array_length(tool_log)` must succeed for every non-empty row, and
`substr(tool_log,-1,1)=']'` for every non-empty row.

---

## D2 — durable path returns `ok:0` while the job is still running

**Measured** — four `job-workflow` rows in `ops_ai_log`, all on the prompt
"Audit and fix all. Execute remediation":

| ts | latency_ms |
|---|---|
| 06:33:20.273Z | 53,685 |
| 06:36:21.775Z | 430,857 |
| 06:39:51.789Z | 446,108 |
| 06:41:03.802Z | 456,934 |

`ops_jobs` records **zero failures** on 2026-09-13, and four jobs behind those envelopes
delivered (8,215 / 11,805 / 5,081 / 3,837 chars).

**Root cause — confirmed against the repo's own docs** (`qnfo-ops/README-deploy.md`, sha
`cb698e1c…`):
- `OPS_LOOP_DEADLINE_MS = 300000` is a **soft** budget: "the runner stops requesting more tool
  rounds and produces the final answer… **NEVER terminates a response**".
- `[limits] cpu_ms = 300000` is the Cloudflare **active-CPU ceiling**; beyond it → Error 1102
  exceededCpu (CPU-BUDGET-1).
- The durable Workflow `step.do` timeout is **15 minutes** — "a Workflow/DO/Cron-trigger bound,
  **not an interactive-request bound**".

So the *interactive envelope* dies at ~430–457 s while the *Workflow job* runs on. Clients read
`ok:0` as failure and conclude the deliverable is lost — which is exactly the report that
triggered this audit.

**Fix.** The durable path should not hold the request open for 7.5 minutes.
- Return **202** with `{ ok: true, job_id, status: "queued" }` immediately after enqueuing
  (`OPS_JOBS_QUEUE`), and let the client poll.
- If a synchronous window is retained, return `ok:1` with
  `{ job_id, status: "running", note: "durable job continues" }` whenever the Workflow was
  spawned successfully — never `ok:0`.
- Expose `GET /v1/jobs/:id` **authenticated** so polling is actually possible. It currently
  404s to unauthenticated callers (verified: `web_fetch` → HTTP 404 for `/v1/jobs/<id>`,
  `/health`, `/manifest` alike).

**Deliverables do not require the API key.** `ops_jobs.response` is a plain column in
`qnfo-audit` and is readable via `ops_d1_query`, which is how the four response bodies above
were retrieved.

---

## D3 — `ops_ai_log.prompt` stores `[object Object]` for the chained path

**Measured:** 4 of the last 15 `ops_ai_log` rows carry
`prompt = "[object Object],[object Object]"`. These are the continuation jobs — i.e. the
endpoint's own audit trail cannot record what was sent for the jobs that most need tracing.

**Fix.** `JSON.stringify(prompt)` (or store `role`/`content` pairs) instead of implicit
coercion.

---

## D4 — "chain depth N/6" is prose, not a parameter

**Measured:** `instr(payload,'chain depth 1/6')` / `2/6` … across all 31 payloads:

| id | 1/6 | 2/6 | 3/6–6/6 |
|---|---|---|---|
| job-529f71f87482a6 | 17913 | 0 | 0 |
| job-3de678077dba16 | 17913 | **111800** | 0 |
| job-6f43b1d0778102 | 666 | 0 | 0 |
| (3 more) | 0 (false positives on `per-chain depth velocity`) | 0 | 0 |

Depth increments (1→2) but **no `3/6`–`6/6` exists anywhere**, and `README-deploy.md` documents
no depth counter, no chain parameter and no limit of 6 — only `OPS_MAX_TOOL_ITERS=8`,
`OPS_LOOP_DEADLINE_MS`, and the 15-minute Workflow step.

**Conclusion:** the counter is text carried in the conversation history — self-reported, not
runner-asserted. Undocumented, and never observed to bind.

**Fix (choose one):**
- Make it real: store `chain_depth` / `chain_max` as payload metadata and enforce the bound in
  the Workflow, logging each transition. Then the counter is auditable.
- Or remove the string from the banner entirely, so it is not re-ingested as assistant content
  into the next job's payload (where it inflates payload size by design and cannot be
  distinguished from model output).

**Corollary worth noting:** with `OPS_MAX_TOOL_ITERS=8` per request but 14 tool entries in one
(truncated) log, the continuation path demonstrably executes more rounds than one request may.
That is the mechanism actually doing the work — it deserves to be a first-class, documented
parameter rather than incidental prose.

---

## Order of work

1. **D1** — smallest change, restores the audit trail. Do first.
2. **D3** — one-line serialization fix, same file.
3. **D2** — contract change; needs client-side coordination (DeepChat / ChatBox providers).
4. **D4** — decide policy (make real vs remove text), then implement.

Regression guard for D1/D2/D3: `qnfo-ops/scripts/guard-async-job-audit.sh` (added alongside
this spec).

## Not fixed here, and why

- **The 8 `failed` rows from 2026-09-12** all carry `error=null` and `tool_log="[]"`; the cause
  was never recorded, so nothing can be retro-attributed. Their payloads (3,536–520,244 B) do
  **not** form a ceiling: six 2026-09-13 jobs at 480–729 KB execute fine and four deliver.
  The discriminator is **time**, not size — last success 09-12T11:34Z, then six silent deaths
  11:49→12:37Z, then nine clean runs from 06:29Z on 09-13.
- **Depth-limit enforcement** — cannot be proven or disproven: undocumented, never observed to
  bind, and `worker.js` is past the 32,768-char read cap.
- **One security item** — recorded in the private ops audit workspace for human action; not
  detailed here, because this repository is public.
