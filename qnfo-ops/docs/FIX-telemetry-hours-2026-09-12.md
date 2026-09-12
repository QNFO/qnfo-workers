# FIX — telemetry_report ignores its `hours` argument

Date: 2026-09-12
Status: **identified + documented** (no patch applied — see "Why not patched here")
Worker: qnfo-ops VERSION 2.13.1 (blob sha `d5753c553cc2655aab2caefdc83b18c50a6b075a`, 157,722 bytes)

## Defect

`telemetry_report(hours)` returns `windowHours: 24` regardless of the `hours` argument.

Boundary probes, same session, 2026-09-12T08:40–08:41Z:

| `hours` requested | `windowHours` returned | `tool_calls` |
|---|---|---|
| 1 | 24 | 2188 |
| 6 | 24 | 2144 |
| 24 | 24 | 2144 |
| 168 | 24 | 2188 |

Both plausible clamp hypotheses are falsified:

- **floor of 24** would explain `1 -> 24` but not `168 -> 24`;
- **ceiling of 24** would explain `168 -> 24` but not `1 -> 24`.

Only "the argument is ignored and the window is hard-coded to 24h" explains all four
observations. The `hours=6` and `hours=24` calls additionally returned byte-identical
payloads (same `ts`, same counters), so the response is not merely clamped at the
edges — it is computed from a fixed window.

## Impact

- A short-window investigation ("what failed in the last hour") silently receives
  24 hours of data.
- A long-window request (168h) silently receives only 24 hours.

Both directions mislead. A caller cannot detect it from the response body except by
noticing that `windowHours` never varies with the argument.

## Why not patched here

`qnfo-ops/worker.js` is 157,722 bytes. The repo read tool returns at most 32,768
chars — verified this session: `maxChars=200000` still truncated at 32,768 — and has
no offset parameter, so the full file cannot be reconstructed for a GitHub
contents-API write. This endpoint also has no deploy tooling and no D1 write path.

The handler was therefore **not inspected**: the argument-ignore is proven by
behaviour, not by source. The exact line is unidentified.

## Acceptance criteria (post-deploy)

- `telemetry_report(hours=1)` -> `windowHours: 1`
- `telemetry_report(hours=168)` -> `windowHours: 168`
- `telemetry_report` with no argument -> `windowHours: 24`
- `top_failing_tools` changes with the window (currently constant across all calls).

## Related

- `docs/FIX-listIssues-await-2026-09-08.md` — separate defect, same worker, still staged.
- Both defects can ride the same `wrangler deploy` from `qnfo-ops/`. The live
  `qnfo-ops` worker was last modified 2026-09-12T07:17:14Z, so the file is under
  active edit — bundle rather than deploy twice.
