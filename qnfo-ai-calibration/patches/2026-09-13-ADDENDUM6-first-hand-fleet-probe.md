# ADDENDUM 6 — first-hand fleet probe: census, version drift retired, and the mobile path is degraded

2026-09-13, qnfo-ops. First-hand probe at 2026-09-13T13:22-13:25Z. Retires two claims from the
earlier sessions.

## 1. Fleet census: 55 workers, not 71

`fleet_status` at `2026-09-13T13:22:58.934Z`: **total 55, healthyCount 12.** Prior artifacts in
this set cite "71 deployed". That figure is not reproducible from the probe.

The 12 health-probed services:

| service | version |
|---|---|
| qnfo-ai | **5.25.1** |
| qnfo-paper-indexer | 2.2.0 |
| qnfo-backlog-exec | 1.2.7 |
| qnfo-gateway | 3.6.1-subscribers |
| qnfo-memory-mcp | 2.0.3 |
| qnfo-email | 1.8.0 |
| qnfo-lifecycle | 1.6.1 |
| qnfo-archive | 1.2.0 |
| qnfo-ai-search | 1.0.2 |
| qnfo-skill-sync | 1.1.2 |
| qnfo-email-orchestrator | 0.3.4-glm53 |
| qnfo-kaizen | 0.3.2 |

The remaining 43 carry `probe:"api"` and `healthy:null` — they are not health-probed. **`healthy:null`
means unmeasured, not down**, and no claim about those 43 should be inferred from it.

## 2. Version drift retired

The fleet probe reports `qnfo-ai 5.25.1` and `service_discover` reports `qnfo-ai 5.25.1`
(`updated_at 2026-09-13T13:00:57.836Z`). **The "5.21.2 vs 5.21.3" drift claim is stale on both
sides** — neither number is current. Retired from the action plan.

## 3. `modified_on` dates the calibration deploy — the gate is still absent

`qnfo-ai-calibration modified_on = 2026-09-12T09:09:46.349383Z`.

Row 670 was created `2026-09-12T12:00:53.581Z` and the burst (678-684) at `2026-09-13T07:31Z` —
**both after that deploy.** So the 09-12 deploy did not carry the GW-FAIL-DEDUP-1 disposition gate
either. ADDENDUM 4's deduction now has a dated deploy bracketed by two bursts.

`qnfo-ops modified_on = 2026-09-13T13:17:57.299481Z` — **the endpoint serving these tools was
redeployed during this session.** That is the likely reason `ops_issues_list` began returning rows
after returning `count 0` earlier in the same session. Concurrent same-day modifications:
`personal-companion 13:18:33Z`, `qnfo-social 13:20:26Z`.

## 4. The mobile client path is sending malformed prompts, and is still doing it

`prompt LIKE '%[object Object]%'`:

| source | n | first | last |
|---|---|---|---|
| other | 55 | 2026-09-05T13:05:14Z | 2026-09-09T09:31:50Z |
| **mobile** | **40** | 2026-09-09T17:51:57Z | **2026-09-13T13:21:49.743Z** |
| chatbox | 27 | 2026-09-06T05:23:28Z | 2026-09-09T13:34:39Z |

122 total. The prompt body is literally `[object Object],[object Object]` — objects stringified
rather than serialized. `other` and `chatbox` both stopped on 2026-09-09. **`mobile` has not: the
newest occurrence is about one minute before the query that found it.** This is a live defect on the
client path this endpoint serves, and it is the single most concrete reliability problem found in
this session.

## 5. Mobile `agent-tools` latency averages 151 seconds

| strategy | n | avg | max |
|---|---|---|---|
| **agent-tools** | **182** | **150,956 ms** | **381,890 ms** |
| chat | 20 | 10,228 ms | 97,921 ms |
| agent | 3 | 91,224 ms | 206,791 ms |

The dominant mobile mode averages **2 min 31 s** per call, with a tail to 6 min 22 s. `chat` — the
trivial naming/summarisation path — is 10.2 s, so the spread is a property of the agentic loop, not
of the transport.

## 6. Ten calls exceeded 300 s; maximum 578.8 s

All on 2026-09-13T06:36-07:25Z:

| latency | source | strategy | prompt (head) |
|---|---|---|---|
| **578,831 ms** | job | job-workflow | "Go ahead" |
| 456,934 ms | job | job-workflow | "Audit and fix all. Execute remediation…" |
| 446,108 ms | job | job-workflow | "Audit and fix all. Execute remediation…" |
| 435,741 ms | job | job-workflow | "Poll status?" |
| 430,857 ms | job | job-workflow | "Audit and fix all. Execute remediation…" |
| 422,406 ms | job | job-workflow | "Go ahead" |
| 398,485 ms | job | job-workflow | "The limitation of agentic ai/code agents…" |
| 381,890 ms | mobile | agent-tools | "Go ahead" |
| 380,770 ms | job | job-workflow | "Poll status…" |
| 378,672 ms | mobile | agent-tools | "Execute red team, test and remediate" |

The endpoint's canonical settings specify a **300 s tool-loop soft budget** and a 15-minute workflow
step timeout. 578.8 s sits inside the workflow timeout but **above the 300 s budget**. Because the
budget is documented as *soft*, this may be intended rather than a breach — but nothing in the
record shows the overrun being logged, bounded, or surfaced. **Flagged, not changed.**

## 7. Research candidates have not advanced since 2026-09-04

`candidates_query`: 4 rows total — `promoted`, `cancelled-duplicate-of-published-JPCUB-LF-1`,
`promoted`, `promoted-queued`. Newest `created_at 2026-09-04T10:49:35.124Z`; `processed_at` values
are 09-03/09-06. Nine days with no new triaged candidate, alongside the `TERMINAL research failure`
churn (ADDENDUM 3 §9). The research triage stage is not producing.

## Retired

1. "71 workers deployed" — probe says 55.
2. "qnfo-ai version drift 5.21.2 / 5.21.3" — both report 5.25.1.

## Limits

- `fleet_status` covers 55 workers reachable through this probe path; it does not enumerate
  account-wide workers, so 55 is a lower bound on the account, not necessarily the fleet.
- `[object Object]` is detected by substring; a prompt that legitimately contains that text would be
  miscounted. The 40 mobile rows are all the same shape, so misclassification is unlikely.
- `latency_ms` is recorded per logged call; for `agent-tools`/`job-workflow` it may span multiple
  tool rounds, so it is not directly comparable to the 300 s tool-loop budget.
- `candidates_query` may expose only a subset of the pipeline's candidates; the "stalled since
  09-04" reading assumes it is the whole set.
- I did not investigate why the mobile client stringifies its prompt objects.
