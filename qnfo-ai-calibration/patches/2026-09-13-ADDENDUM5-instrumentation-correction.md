# ADDENDUM 5 — instrumentation correction: `ops_ai_log.ok` is not an error flag, and the 22.5% "chat failure" rate is an artifact

2026-09-13, qnfo-ops. Supersedes the telemetry figures in ADDENDUM 3 §9 and retracts the
"22.5% chat failure rate — highest-severity number here" claim from the same session's report.

## 1. `ops_ai_log.ok` conflates three unrelated things

Lifetime, by `source` × `ok`:

| source | ok=1 | ok=0 |
|---|---|---|
| other | 908 | **40** |
| chatbox | 467 | 1 |
| mobile | 200 | 3 |
| job | 40 | **32** |
| deepchat | 21 | 0 |

76 `ok=0` of 1,712 rows (4.4% lifetime). But the `ok=0` rows are not a single phenomenon. Sampling
them shows three distinct populations sharing one flag:

- **Genuine API errors** (`source='other'`) — see §2.
- **Completed answers that end in `INCOMPLETE:`** — e.g. `ops-28a6d4d0a88a9c` ("INCOMPLETE: no PR
  and no applied code — branch creation is impossible from qnfo-ops…").
- **Bare tool-call dumps** — e.g. `ops-a0e12c6da66652`, `ops-8493e1f48cf4e5`, whose entire response
  is `<tool_call>` markup with no final answer.

So `ok=0` is closer to "this turn did not end with a clean final answer" than to "this call failed".
Any failure rate derived from it mixes a real defect with two formatting outcomes.

## 2. The genuine API error class, named

All 10 sampled `source='other'` failures are the identical error:

    ops agent error: deepseek 400: {"error":{"message":"The `reasoning_content` in the thinking
    mode must be passed back to the API.","type":"invalid_request…"}}

40 lifetime rows, **all `model='ops-exec'`**, spanning 2026-09-12T11:15:27Z to 12:37:24Z, then
stopping. Zero in the trailing 24 h window. This is a caller-side request-construction bug in the
ops-exec thinking-mode path (a prior turn's reasoning block is not being echoed back), and it is the
same family as the `tool-args-json` / `content-shape` classes in ADDENDUM 3 §6.

## 3. The 22.5% "chat failure rate" is 28/29 async job-chain turns

24 h window (`ts >= 2026-09-12T13:20:00Z`):

| source | ok=1 | ok=0 |
|---|---|---|
| mobile | 58 | 1 |
| job | 26 | **28** |
| other | 19 | 0 |

Total 132, `ok=0` 29 → 22.0%, matching `telemetry_report`'s 129/29/22.5%. **28 of the 29 are
`source='job'`** — the async `job-workflow` continuation chains, the same chains whose jobs are
stuck in `continuing` (ADDENDUM 3 §9). Zero `chatbox`/`deepchat` rows in the window.

**Corrected reading:** the user-facing path is healthy — mobile is 1 failure in 59 (1.7%). The
elevated figure is confined to the async continuation path, where ~52% of runs end in `INCOMPLETE`
or a bare tool-call dump. That is a real defect, but it is *not* a chat failure rate, and it is the
mechanism that produced this session's own `INCOMPLETE` endings.

## 4. Tool reliability, lifetime (`cloud_ops_events`, kind='ops_ai_tool')

| tool | ok | error | rejected | error rate |
|---|---|---|---|---|
| web_search | 51 | **55** | 0 | **51.9%** |
| web_fetch | 630 | **548** | 0 | **46.5%** |
| github_file_write | 222 | 58 | 0 | 20.7% |
| ops_issue_run | 83 | 44 | 0 | 34.6% |
| run_code | 427 | 61 | 0 | 12.5% |
| ops_d1_query | 5,504 | 545 | 423 | 9.0% |
| github_repo_read | 1,882 | 96 | 0 | 4.9% |
| fleet_status | 347 | 15 | 0 | 4.1% |
| workspace_write | 357 | 13 | 0 | 3.5% |
| workspace_read | 354 | 14 | 0 | 3.8% |
| **email_respond** | **0** | **15** | 0 | **100%** |

Two of these need qualification:

- **`ops_issue_run`'s 44 errors are mostly correct refusals.** The top error signatures include
  `{"args":{"confirm":true},"resultOk":false,"ms":18}` at n=6, n=5 and n=3 — the confirmation gate
  declining, exactly as designed. Counting those as failures inflates the tool's error rate.
- **`web_search` fails by timeout, uniformly.** All 5 sampled errors are `resultOk:false` at
  `ms` 19,307 / 19,395 / 19,732 / 19,531 / 19,506 — i.e. a ~19.5 s ceiling. It is a timeout, not a
  parse or quota failure.

**`email_respond` has never succeeded: 15 errors, 0 successes.** All six sampled attempts are the
*same* reply to `reply_to_id 552`, subject "Re: Your coding-agents talk — reliable computation out
of unreliable components", body opening "Hi Tobias,", retried across 2026-09-09T06:56:50Z to
09:36:44Z. The subject contains no spam-trip token, so the documented guard does not explain it.
Either the reply path is broken or the gate rejects for a reason not visible in the aggregate.
**I did not test it** — `email_respond` sends real mail.

## 5. The `/v1/jobs/...` 404 is explained, and my earlier inference was unsupported

ADDENDUM 3 §9 said the 404 on `GET /v1/jobs/job-2dfc803ca4a243` was "a route gap, not a pruned row".
The error signatures show repeated failures fetching the endpoint's *own* public URLs —
`https://qnfo-ops.q08.workers.dev/health` (n=4), `/` (n=4), `/manifest` (n=3), `/v1/models` (n=2),
`/v1/jobs/job-8433e952777f37` (n=2) — all `resultOk:false` with `ms` of 1-2.

That matches a constraint already recorded in the calibration source I read: *"SVC-BINDING-1:
same-account workers.dev fetches 404 at the edge from inside a Worker (verified live 2026-09-04)"*.
**A Worker cannot fetch its own workers.dev URL.** So the 404 is expected, and it carries **no
information about whether the route exists**. My "route gap" claim was unsupported; the row exists
in `ops_jobs` and that is all that is established.

## 6. Two more instrument defects

- **`ops_d1_query`'s aggregate exemption misfires.** `SELECT status, COUNT(*) AS c FROM
  agent_issues GROUP BY status ORDER BY c DESC` appears as a failing signature 7 times (and with
  `AS n`, 6 + 3 more). Aggregates are documented as LIMIT-exempt, so these rejections are
  false positives — they inflate the 545 error count with calls that should have succeeded.
- **`ops_req_log` has no status or duration column** (schema: `id, ts, method, path, auth_prefix,
  auth_len, ua, clen`). A hung request remains indistinguishable from a completed one. Claim holds.
- **`run_code` errors include sandbox-escape attempts** — signatures containing
  `tools.exec({ command: 'cd /c/Users/LENOVO/Dev/qnfo-workers/…'`, i.e. sessions trying to reach a
  local filesystem through `run_code`. Correctly rejected; worth noting as a recurring wrong-tool
  pattern rather than a tool defect.

## What this changes

The "highest-severity" number from the previous report is withdrawn. The real, ranked instrument
defects are: `web_search` ~52% timeout failure, `web_fetch` ~47%, `email_respond` 0-for-15, the
async continuation path ending ~52% of runs uncleanly, and `ops_ai_log.ok` being unusable as a
failure signal until it distinguishes errors from incomplete endings.

## Limits

- `ok=0` populations are characterised from ~25 sampled rows, not an exhaustive classification.
- The `reasoning_content` class is dated to a 82-minute span on 09-12; I did not establish whether
  it was fixed or merely stopped being exercised.
- `email_respond`'s 15 failures are characterised from 6 samples of one thread; other failures may
  have different causes.
- Doc proliferation is now a live risk — this thread has produced 15 artifacts and they are not
  consolidated. A single superseding index is owed.
