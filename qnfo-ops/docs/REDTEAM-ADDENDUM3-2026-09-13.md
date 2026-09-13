# Red-team remediation — ADDENDUM 3 (2026-09-13, qnfo-ops / ops-exec)

Extends `REDTEAM-CLOSEOUT-2026-09-13.md`, `REDTEAM-ADDENDUM-2026-09-13.md`,
`REDTEAM-ADDENDUM2-2026-09-13.md`.

## C1. Fifth fix — `events-radar` date extraction (F8) — commit `411d07e1`

F8 in `audits/2026-09-13-fix-queue.json` read: *"21/24 venue fetches timeout (was 13 ok on
09-06); MPI-PKS date parsing emits start>end"*. The date-parsing half is now root-caused and
fixed; the fetch-timeout half is a separate concern (see C4).

### Root cause (proven, not inferred)

`extractEvents()` built its range regex without any digit boundary:

```js
const rangeRe2 = new RegExp("(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})\\s+(" + MONTH_RE + ")[a-z]*\\.?\\s*,?\\s*(20\\d{2})", "gi");
```

Applied to the live MPI-PKS snippet — `"...Read more 05 Oct 2026 - 09 Oct 2026 Workshop
Phases of Collective Cellular Behavior..."` — the leading `(\d{1,2})` matched the **trailing
`26` of the year 2026**, not a day number:

```
groups: d1='26' d2='09' month='Oct' year='2026'
-> startIso 2026-10-26  endIso 2026-10-09  INVERTED? true
```

`push()` then applied a single month to both ends. **This reproduces F8's recorded evidence
exactly: startIso 2026-10-26 > endIso 2026-10-09.**

### Two further defects found in the same function

| # | Defect | Evidence | Fix |
|---|---|---|---|
| B | `Math.min(d, 28)` silently rewrote days 29/30/31 to the 28th | MPI-PKS source text says `"31 Aug 2026 - 04 Sept 2026"`, yet `curated_json` recorded start **and** end as `31 Aug 2026` and the report line read `[MPI-PKS] 31 Aug 2026` | `clampDay()` against real month length |
| C | `push()` applied one month to both ends, so a cross-month range could not be represented | the same MPI-PKS workshop spans Aug→Sep | two cross-month regexes + shared `emit()` |

Defect B is the more insidious of the two: an event on the 29th–31st was silently mis-dated
by up to 3 days, and because the same clamped value was used for both start and end, the
record looked internally consistent.

### Verified behaviour after the patch

```
OLD (F8):  push('Oct',26,9,'2026')            -> 2026-10-26..2026-10-09   INVERTED
NEW:       '05 Oct 2026 - 09 Oct 2026'        -> 2026-10-05..2026-10-09
NEW:       '31 Aug 2026 - 04 Sept 2026'       -> 2026-08-31..2026-09-04
GUARD:     forced backwards Oct 26 -> Oct 9   -> 2026-10-26..2026-10-26  (collapsed)
DAY:       'Sep 30' -> 2026-09-30   (old code produced 2026-09-28)
DAY:       'Aug 31' -> 2026-08-31   (old code produced 2026-08-28)
MONTH:     'Feb 30' -> 2026-02-28   (clamped to real month length)
```

All **5 patcher anchors match exactly once** against verbatim source (sha `aacdf94e`), so the
patcher will not refuse. The old `rangeRe2` misfire on the live string is **eliminated**, and
`xRange2` now captures the intended range.

### Why a patcher rather than a direct write

`events-radar/worker.js` is 26,648 B — under the read cap, so a full-file write was
*possible*, and one was attempted. It could not be emitted reliably from this endpoint
(truncated mid-content twice). Rather than ship a partial or reconstructed file, the fix goes
as a guarded patcher using the pattern already proven on `qnfo-ai-calibration`. This is a
deliberate trade: **the fix is staged, not applied** — honest, and consistent with the other
three staged fixes.

## C2. F8's other half — venue fetch timeouts — NOT addressed

The timeout half (21/24 venues failing on 2026-09-13 vs 13 ok on 2026-09-06) is untouched.
`scanVenue()` uses a hard-coded 8000 ms `AbortController` timeout and there is no retry. The
fix-queue hypothesis — correlated outbound-fetch starvation (tools probe timeout 60000 ms,
`web_fetch` 209 failures/24 h) — is **not confirmed** by anything I read this session. I am
deliberately not changing the timeout blind: raising it without knowing whether the failure is
DNS, TLS, or upstream latency risks masking a real outage.

## C3. Commit ledger (complete)

| commit | artifact |
|---|---|
| `1cca0e95` | `qnfo-ops/docs/REDTEAM-REMEDIATION-2026-09-13.md` |
| `460481db` | `ai-health-prober/worker.js` v2.3.3 |
| `de86d3f4` | `qnfo-ai-calibration/apply-calibration-fix.mjs` v2 |
| `ada30500` | `qnfo-ops/docs/REDTEAM-CLOSEOUT-2026-09-13.md` |
| `4c5540e8` | `qnfo-error-selfheal/worker.js` v1.0.3 |
| `bdbec390` | `qnfo-ops/docs/REDTEAM-ADDENDUM-2026-09-13.md` |
| `9492003c` | `qnfo-ops/docs/REDTEAM-ADDENDUM2-2026-09-13.md` |
| `411d07e1` | `events-radar/apply-date-fix.mjs` |
| this file | addendum 3 |

## C4. Uncertainty

- The patcher has **never been executed by node** — no shell here. Anchors and post-patch
  semantics were verified in `run_code` against verbatim source, which is strong but is not
  the same as running the patcher.
- Defect C's cross-month regexes were tested against two real strings and the synthetic
  corpus in C1. They are new code and will meet input shapes I did not anticipate; the
  inversion guard is the safety net, and it fails soft (collapse to a single day).
- The `Math.min(d, 28)` clamping was presumably a defensive guard against invalid days. My
  `clampDay()` is strictly more permissive (it allows 29/30/31 where valid), which is the
  intended behaviour but is a behaviour change: a previously-clamped event will now appear on
  its true date. Any downstream consumer keyed on the clamped dates would see the dates move.
- F8's timeout half and F7 (radar job-silence) remain open; both live in `qnfo-cloud-ops`
  or the radar hub and were not remediated.
