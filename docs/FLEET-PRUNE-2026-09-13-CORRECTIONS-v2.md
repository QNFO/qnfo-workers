# FLEET PRUNE — CORRECTIONS v2 (supersedes two claims in PLAN.md)

Date: 2026-09-13 · qnfo-ops

## C1. measured=0 count: 26 -> **15** (my error)

PLAN.md said "26 of 55 rows have measured=0". Re-read of fleet_worker_census:
`total=55, measured_n=40, unmeasured=15`. The 15 = FETCH-ONLY 7 + PRODUCTIVE-unmeasured 6
+ NOT-YET-FIRED 1 + STALLED 1. My 26 was an arithmetic slip, not a data reading.

## C2. Registry base_url: claim STRENGTHENED, not withdrawn

PLAN.md said the registry base_url is dead and that I confirmed it. A mid-turn doubt
(a fleet probe showed qnfo-ops 200) is now resolved in favour of the original claim,
with better evidence:

`fleet_probe_log` has a `url` column. For the current cycle (2026-09-13T14:29:40Z+),
EVERY worker row reads:

| name | url | transport | ok |
|---|---|---|---|
| qnfo-ops | (empty) | **binding** | 1 |
| qnfo-ai | (empty) | **binding** | 1 |
| qnfo-social | (empty) | **binding** | 1 |
| papers.qnfo.org | https://papers.qnfo.org/ | http | 1 |
| qnfo.org | https://qnfo.org/ | http | 1 |

Only the two zone hostnames are probed over HTTP. **The registry base_url is never
exercised by the fleet's own probe path**, so the green 200s say nothing about whether
`https://<name>.q08.workers.dev/health` works. My direct fetch of
`https://qnfo-ops.q08.workers.dev/health` and `/` returned HTTP 404 on a transport that
returns 200 for example.com. Issue 739 is corroborated. DoD row 217 (a prior session,
asserting those URLs return 200) is contradicted for the q08 path.

## C3. Probe roster collapse: CONFIRMED, not overstated

Issue 741 said the roster fell 82 names to 10. Verified precisely:
- `COUNT(DISTINCT name)` over all of fleet_probe_log = **83**
- `COUNT(DISTINCT name)` for ts >= 2026-09-13T14:00:00 = **10** (9 workers + 1 zone)
- current cycle: 49 rows, 48 ok, 1 fail

So the historical roster was real and current coverage is 10. The merged note in
issue 741 stands.

## C4. Backlog growth rate during the turn

`backlog_status` read 42 at pre-flight (14:27Z) and **51** at 14:40Z. agent_issues
totals went 741 -> 752 rows. Six ticket merges moved the aggregate open count from 44
to 43. Ticket consolidation cannot outrun ticket creation; the generators are the
problem, not the ledger.

## Failure modes of this correction

- C2 rests on the fleet's probe log showing `transport=binding`. It is possible the
  q08 URLs work for a differently-shaped request than mine (e.g. an authenticated
  path, or a GET with a specific Accept header). I did not test with auth headers.
- C3 counts distinct names, not distinct *successful* names. If the 10 current targets
  include names probed but failing, coverage is lower still; 48/49 passed, so this is
  not material here.
- I still cannot enumerate the live CF script list, so "registry == live roster" is a
  count-and-name comparison against fleet_status, which is itself built on bindings.
