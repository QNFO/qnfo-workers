# FIX — telemetry_report ignores its `hours` argument

Date: 2026-09-12
Updated: **2026-09-13** (re-confirmed live; sibling control added; worker metadata refreshed)
Status: **identified + documented + re-confirmed** — no patch applied, see "Why not patched here"
Worker: qnfo-ops VERSION **2.14.0** (blob sha `cf9bb72e0b4e9a9f98343ea296cf9ae55dff0d13`, **161,339 bytes**)

---

## Re-confirmation 2026-09-13 (qnfo-ops / ops-exec) — STILL LIVE

Independent probes, 2026-09-13T07:16Z, same endpoint:

| `hours` requested | `windowHours` returned |
|---|---|
| 1 | 24 |
| 24 | 24 |
| 168 | 24 |

Three probes spanning both ends of the declared 1–168 range all return 24.

**New control (2026-09-13):** `telemetry_analyze(hours=1)` → `windowHours: **1**`. The sibling
tool honours its argument. This falsifies a shared window-computation helper as the cause and
**narrows the fix**: look for a hard-coded 24 inside the `telemetry_report` handler, not in a
common helper. It also means the fix is smaller than a refactor.

## Defect

`telemetry_report(hours)` returns `windowHours: 24` regardless of the `hours` argument.

Boundary probes, 2026-09-12T08:40–08:41Z:

| `hours` requested | `windowHours` returned | `tool_calls` |
|---|---|---|
| 1 | 24 | 2188 |
| 6 | 24 | 2144 |
| 24 | 24 | 2144 |
| 168 | 24 | 2188 |

Both plausible clamp hypotheses are falsified:

- **floor of 24** would explain `1 -> 24` but not `168 -> 24`;
- **ceiling of 24** would explain `168 -> 24` but not `1 -> 24`.

Only "the argument is ignored and the window is hard-coded to 24h" explains all observations.
The `hours=6` and `hours=24` calls additionally returned byte-identical payloads (same `ts`, same
counters), so the response is not merely clamped at the edges — it is computed from a fixed window.

## Impact

- A short-window investigation ("what failed in the last hour") silently receives 24 hours of data.
- A long-window request (168h) silently receives only 24 hours.

Both directions mislead. A caller cannot detect it from the response body except by noticing that
`windowHours` never varies with the argument.

**Why the self-heal loop never caught this:** `telemetry_analyze` only files tickets for tools that
*persistently error*. `telemetry_report` returns well-formed, successful responses with wrong
content, so it is invisible to that detector. It ran clean (filed 0) while this defect was live.
This class of defect — silently-wrong-but-successful — has no detector in the current fleet.

## Why not patched here

`qnfo-ops/worker.js` is **161,339 bytes** (2026-09-13; was 157,722 B on 2026-09-12). The repo read
tool returns at most **32,768 chars** — verified again this session: `maxChars=200000` still
truncated at 32,768 — and has no offset parameter, so the full file cannot be reconstructed for a
GitHub contents-API write. This endpoint also has no deploy tooling and no D1 write path.

The handler was therefore **not inspected**: the argument-ignore is proven by behaviour, not by
source. The exact line is unidentified. See
`docs/FIX-listIssues-await-2026-09-08.md` §"Read cap" for the same blocker.

## Acceptance criteria (post-deploy)

- `telemetry_report(hours=1)` -> `windowHours: 1`
- `telemetry_report(hours=168)` -> `windowHours: 168`
- `telemetry_report` with no argument -> `windowHours: 24`
- `top_failing_tools` changes with the window (currently constant across all calls).

All four criteria are currently **unmet** (re-verified 2026-09-13).

## Related

- `docs/FIX-listIssues-await-2026-09-08.md` — separate defect, same worker. **As of 2026-09-13 that
  defect is NOT reproducible** (`ops_issues_list` returns real rows: 25 open, 673 total). Only the
  telemetry-hours defect is confirmed live.
- Both defects ride the same `wrangler deploy` from `qnfo-ops/`. The live worker was modified
  2026-09-13 and is under active edit — bundle rather than deploy twice.
- Workspace ledger: `ops-workspace/audits/2026-09-13-REDTEAM-CORRECTIONS-live.md`
