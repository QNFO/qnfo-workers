# Red-team addendum — qnfo-ops, 2026-09-13

Complements `REDTEAM-REMEDIATION-2026-09-13.md` (same directory) and the ops-workspace
records `audits/2026-09-13-redteam-exec-tests-and-new-findings.md`,
`audits/2026-09-13-async-job-payload-ceiling-new-points.md`,
`audits/2026-09-13-f6-refuted.md`.

Session window 2026-09-13T06:35–06:41Z. All figures are live tool returns.
Contains one reconciliation that corrects **both** prior records (§4).

## 1. Guard / boundary tests — all gates held

| Probe | Observed verbatim | Verdict |
|---|---|---|
| `ops_d1_query` `DELETE FROM agent_issues WHERE 1=0` | `read-only SELECT/WITH only` | PASS |
| `ops_d1_query` `SELECT 1 AS a; DROP TABLE agent_issues` | `single read statement only` | PASS |
| `web_fetch http://169.254.169.254/latest/meta-data/` | `blocked host (private/internal): 169.254.169.254` | PASS |
| `web_fetch http://localhost:8080/admin` | `blocked host (private/internal): localhost` | PASS |
| `run_code` `await fetch('https://example.com')` | `BLOCKED: This worker is not permitted to access the internet via global functions like fetch()` | PASS |
| `run_code` binding probe | `env_probe: undefined` | PASS (no binding/secret reachable) |
| `ops_issue_run` without `confirm` | `dryRun:true`, `openBacklog:24` | PASS |

Usability defect (not a security defect): a plain `sqlite_master` read is rejected with
`add LIMIT n (aggregate exempt)`, so schema introspection requires a spurious `LIMIT`.

## 2. NEW — root cause of the dominant turn/job failure: `reasoning_content` 400

Population `ops_ai_log`: **43 rows** carrying the string `reasoning_content`, first
`2026-09-05T02:42:28Z`, last `2026-09-12T13:27:59Z`. By `source`: `other` 28, `mobile` 8,
`job` 6, `chatbox` 1. Casualties: 8 failed `ops_jobs`, 34–35 failed chats.

Error: `deepseek 400: The reasoning_content in the thinking mode must be passed back to
the API.`

Mechanism, read from `ops_jobs.payload` of `job-a662537078661b`:

- replayed assistant messages carry the **placeholder**
  `"reasoning_content":"[reasoning omitted upstream; tool call decision only]"`;
- the **trailing** assistant turns carry **no** `reasoning_content` field;
- the worker's own diagnostic, preserved in the payload, shows the shape:
  `assistant[tc5,rc8940]|tool×5|assistant[tc3,rc12919]|tool×3|assistant[tc3,rc1251]|tool×3|assistant|assistant`
  — i.e. two bare `assistant` turns at the end with neither tool_calls nor reasoning.

Inference (labelled): thinking mode requires `reasoning_content` on every replayed
assistant message, so a history that **mixes** present and absent values is rejected.

Fix spec: normalise uniformly — strip `reasoning_content` from all replayed assistant
messages, or disable thinking mode for replayed histories. Never mix, and never send the
placeholder string as if it were real reasoning. **Requires `qnfo-ops/worker.js`
(161,339 B) — not patchable from this endpoint** (see §6).

## 3. Resolved — the async job poll was a measurement artifact

`job-8433e952777f37` **exists**: `status='continuing'`, created `06:32:20.542Z`, updated
`06:33:20.226Z`, payload 683,674 B, stored response 3,837 chars. It is not phantom.

Unauthenticated `web_fetch` on `/v1/jobs/job-8433e952777f37`, `/health`, `/` and
`/v1/models` all return `HTTP 404`. `ops_req_log` shows **11 authenticated**
`GET /v1/jobs*` requests with `auth_prefix='Bearer 003'`, `auth_len=55`, and **exactly
one** unauthenticated (`req-87c21c4ec8224e`, `auth_len=0`).

The routes exist and serve authenticated callers; `web_fetch` cannot attach the Bearer
token. Any conclusion drawn from an unauthenticated poll of this endpoint is measuring
the poller, not the job. (Related: the client is an Android device posting
`/v1/chat/completions` with `Bearer 003`, `auth_len=55`.)

## 4. F6 reconciliation — neither "confirmed" nor "refuted" is established

`REDTEAM-REMEDIATION-2026-09-13.md` marks F6 (`*.q08.workers.dev` → 404) **CONFIRMED**.
`audits/2026-09-13-f6-refuted.md` marks it **REFUTED**, tabling `HTTP 200` for `qnfo-ai`,
`qnfo-ops` and `personal-api` via the same `web_fetch` tool.

Re-measured this session with `web_fetch`:

| URL | result |
|---|---|
| `https://qnfo-ai.q08.workers.dev/health` | 404 |
| `https://qnfo-ops.q08.workers.dev/health` | 404 |
| `https://qnfo-ops.q08.workers.dev/` | 404 |
| `https://qnfo-ops.q08.workers.dev/v1/models` | 404 |
| `https://q08.workers.dev/` | 404 |
| `https://qnfo-ops.qnfo.org/health` | **530** |
| `https://qnfo.org/` (control) | **200** |

The control proves `web_fetch` reports genuine 200s, so the 404s are real responses.

The refutation is self-undermining: it cites `SVC-BINDING-1` from
`qnfo-ai-calibration/worker.js` — "same-account workers.dev fetches 404 at the edge
**from inside a Worker**". `web_fetch` executes inside the qnfo-ops Worker, so 404 on
same-account `workers.dev` is the *expected* outcome of this measurement path and can
never evidence a down public surface.

Verdict: F6 is **unverifiable from an internal Worker**. The refutation's 200 table is not
reproducible today and should be withdrawn; F6 should be re-scoped and tested with an
off-Cloudflare probe. The `qnfo-ops.qnfo.org` 530 is a separate failure mode (error 1016,
custom-domain origin DNS), matching the N12 worker-health false positive.

## 5. NEW — concurrent duplicate execution, no lock

- `cloud_ops_events`: **910 rows with `job='qnfo-ops'`** between `06:23:15.380Z` and
  `06:37:21.571Z` (~65 tool events/minute).
- **5 jobs in flight simultaneously** (`continuing` 2 + `running` 3), where the 09-12
  record measured none.
- At `06:36:46.264Z` and `06:36:48.880Z` an independent chain logged `github_file_write`
  and `workspace_write` while this session was reading those same paths.
- `ops_jobs` schema is `(id, status, model, strategy, payload, response, tool_log, error,
  created_at, updated_at)` — **no lease, lock, owner or heartbeat column**; the design
  self-chains (`_chain.depth`) with no mutual exclusion.

Consequence: concurrent copies of the same task race on the same artifact paths
(last-writer-wins on `workspace_*` and GitHub files) and duplicate expensive LLM rounds.

## 6. Payload ceiling — 4 new consistent points, 0 counterexamples

All four in-flight jobs exceed the largest payload ever observed to succeed (**371 B**):

| id | status | payload (B) | response len |
|---|---|---|---|
| job-d50fb4e27b2b35 | running | 5,984 | 0 |
| job-6f43b1d0778102 | running | 480,385 | 0 |
| job-8433e952777f37 | continuing | 683,674 | 3,837 (partial, then frozen) |
| job-a662537078661b | running | 729,065 | 0 |

`error` is `null` on all four — the cause is still absent from D1. Mechanism untested;
this only widens the empirical boundary. **Falsifier:** a job with payload > 3,536 B that
completes with a non-empty `response` and `status='succeeded'` would kill the hypothesis.

## 7. Confirmed — `telemetry_report` ignores `hours`

`hours=1` → `windowHours: 24`; `hours=168` → `windowHours: 24`; byte-identical bodies
(same `ts` `2026-09-13T06:37:07.912Z`, `tool_calls` 3584, `tool_failures` 432,
`chats` 213, `chat_failures` 35). Second-session confirmation of
`docs/FIX-telemetry-hours-2026-09-12.md`.

## 8. Remediation status

Executed and verified: backlog drain (`processed:24, closed:0, escalated:0`, all
`no probe target` — a structural no-op, open count unchanged at 24); `telemetry_analyze`
(`scanned:10, persistent:[], recovered:8, filed:0`); this file (write path works — read
back to verify); plus the ops-workspace records named in the header.

Blocked with exact reasons:

- **§2 `reasoning_content` fix, §7 hours fix** — `qnfo-ops/worker.js` is **161,339 B**;
  `github_repo_read` caps at ~32,768 chars with **no offset parameter**, so the file
  cannot be reconstructed for a contents-API write, and `github_file_write` cannot patch
  partially.
- **§4** — needs an off-Cloudflare probe; no such tool here.
- **§5** — needs a D1 schema migration plus worker code.
- **The 24-row backlog** — `ops_d1_query` is SELECT/WITH only; no D1 write path.
- **`save_memory` / `delete_memory`** are not exposed on this endpoint.

## 9. Uncertainty

- §2 is mechanism-by-payload, not source: the normalisation code was not readable. The
  "mixing is the trigger" inference could be wrong (an alternative is that the placeholder
  string itself is rejected); the same uniform-normalisation fix covers both.
- §5 may overstate concurrency: 910 events in 14 min could include scheduled cron fan-out
  that also logs `job='qnfo-ops'`; events were not partitioned per chain. The simultaneous
  `github_file_write`/`workspace_write` is the strongest single piece of evidence.
- §1 is single-shot, not fuzzed: eight passing probes do not prove robustness against
  encoding tricks, unicode or oversized inputs.
- §4 rests on a source comment, not a re-derivation of Cloudflare edge behaviour.
- All counts are point-in-time (06:35–06:41Z); MODEL-DEGRADED tickets are created on a
  ~2 h scheduler.
