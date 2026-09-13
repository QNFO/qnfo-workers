# Deploy-window verification — reading.q08.org (2026-09-13, 06:45–06:47 UTC)

Author: qnfo-ops endpoint. Every value below is a tool return from this session, not carried
over from a note. Supersedes nothing; it adds the production-state half that `ERRATA-2026-09-13.md`
and `REMEDIATION-2026-09-13.md` could not measure.

## 1. Result: the window is closed. Nothing landed in production.

| check | tool | value |
|---|---|---|
| production version | `web_fetch https://reading.q08.org/health` | **`v1.1.0`**, `pieces: 7` |
| production writer | same | `deepseek-chat` |
| production model roster | same | `@cf/moonshotai/kimi-k2.6`, `@cf/openai/gpt-oss-120b`, `@cf/zai-org/glm-5.3` |
| public piece | `web_fetch https://reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196` | **HTTP 200, defects 1–6 present verbatim** |
| repo source | `github_repo_read personal-companion/worker.js` | `size 62666`, `sha c06edffb…`, **`VERSION = "1.0.0"`** |

The public page still serves, unchanged:

> "Rowan rated it 5 out of 5 for felt energy. Five days later, at QPL 2026 in Amsterdam — the
> Workshop on Quantum Programming Languages … he rated the same week 1 out of 5. Drained. The
> two events cost roughly the same in travel and time."

and

> "in the dining hall at Wolfson College, Cambridge, about forty people sat in a circle"

`worker.js` (62,666 B, sha `c06edffb…`, `VERSION = "1.0.0"`) is byte-identical to
`deployed-current.worker.js`, and production reports `v1.1.0`. **B5 of `REMEDIATION-2026-09-13.md`
is independently confirmed this session**: the running source is not in the repo.

## 2. Artifacts: authored and committed, not applied

`personal-companion/` on `main` now contains `lib/{gate,grounding,voice,addressee,filters,authz}.js`
with six test files, `sql/{QRI-1,QRI-1b,QRI-2,QRI-3}-*.sql`, `apply-remediation.mjs`, and nine
dated documents. The code and the correction SQL exist. Neither is in production, and the D1 rows
are unchanged (§4).

## 3. Arithmetic, recomputed independently this session

`run_code` over the ledger rows read from `PERSONAL.activity`:

```
LoF26   2026-08-10 .. 2026-08-14   energy 5  "energized"   venue "Wolfson College, Cambridge"
QPL     2026-08-17 .. 2026-08-21   energy 1  "drained"     venue "Amsterdam"
CWI     2026-08-28                 energy null              venue ""
gap LoF26 -> QPL (start-to-start) = 7 days
gap QPL   -> CWI                  = 11 days
```

The published "Five days later" is LoF26's *duration* (5), not the gap (7). "the same week" is
false: 10–14 Aug and 17–21 Aug are consecutive weeks. Only these three Aug–Sep rows exist in the
queried window; the errata's wider gap set (3, 7, 11, 18) is not reproduced from this window.

## 4. Remediation attempts executed this session, with real output

| action | tool | output |
|---|---|---|
| backlog drain | `ops_issue_run confirm:true` | `openBacklogBefore: 25`, `processed: 25`, **`closed: 0`**, `rechecked: 25`, `escalated: 0`; every row `action: "recheck"`, `note: "no probe target"` |
| self-heal analyzer | `telemetry_analyze hours:6` | `scanned: 9`, `persistent: []`, `recovered: 7`, `autoResolved: 1`, **`filed: 0`**, `alreadyOpen: 1` |
| backlog after drain | `backlog_status` | `openBacklog: 25` — unchanged |

The drain is a no-op against this backlog: all 25 open rows are `research-pipeline`,
`ai-calibration`, `model-health` and `infra` rows that carry no probe target, so the
auto-close-on-PASS path cannot reach any of them. Closing them needs a decision on the
model-degradation/gateway-failure class, not a re-probe.

## 5. Method error found in this session's own earlier probe — and corrected

An earlier probe ran `instr(body_md,'five days later')` and returned `0` for all seven pieces,
which reads as "the disputed sentence is not in the stored text". That was a **false negative**:
SQLite `instr` is case-sensitive and the text is "Five days later". `run_code` reproduces the
failure mode on the same string (`indexOf('five days later') = -1`, `indexOf('Five days later') = 43`).
Re-probed with the correct case, piece `id=8` carries every defect. Any conclusion drawn from a
case-insensitive assumption about `instr` in this repo should be re-checked.

## 6. Telemetry tension worth recording

`telemetry_report hours:24` — 4,505 tool calls, 501 failures (11.1%), 232 chats, 42 chat failures;
top failing tools `web_fetch` 272, `ops_d1_query` 125, `github_file_write` 32, `web_search` 30,
`github_repo_read` 19. The 6-hour analyzer nonetheless found **no persistent failure** and filed
nothing (7 recovered). Interpretation offered, not asserted: a large share of those failures are
this session's own probes of routes that do not exist (`companion-hub.q08.workers.dev`,
`personal-companion.q08.workers.dev`, `q08.org/readings`, two `/v1/jobs/*` URLs — all HTTP 404)
and case-sensitive SQL that returned empty rather than erroring. The 24-hour count should not be
read as 501 infrastructure faults without separating self-inflicted probe 404s.

## 7. Not reachable from this endpoint

- `https://qnfo-ops.q08.workers.dev/health` → **HTTP 404**; `/v1/jobs/job-8433e952777f37` and
  `/v1/jobs/job-55c34efb82e9c6` → **HTTP 404**. The `qnfo-ops` route table in the registry lists
  `/health` and `/v1/jobs*`, but the public host does not serve them. Async-job polling cannot be
  performed from here; those continuation URLs are not actionable.
- No `save_memory` / `delete_memory` tool is exposed to this endpoint in this session. Memory
  corrections cannot be applied from here.

## 8. Open, blocked on capability (unchanged)

1. Correct `companion_pieces.id = 8` — `ops_d1_query` is SELECT/WITH only. **No write path.**
2. Deploy a gate that blocks these six defects — no deploy route, no wrangler. **No write path.**
3. Open a review PR — branch creation unavailable; `github_pr` returns **GitHub 422**.
4. Patch `worker.js` by hand — file reads cap at 32,768 B against a 62,666 B file. **Tool gap.**
