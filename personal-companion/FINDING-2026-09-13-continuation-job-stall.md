# FINDING — the continuation/chain job path never reaches a terminal state

Date: 2026-09-13, poll taken 11:55Z. Endpoint: qnfo-ops. Evidence: `ops_jobs` and `ops_ai_log`
(QNFO_AUDIT, read-only SELECT), `ops_fleet_log`, live HTTP fetches. Every number below is tool
output from the poll; nothing is carried over from an earlier session's notes.

## 1. The documented poll target returns 404

| URL | HTTP |
|---|---|
| `https://qnfo-ops.q08.workers.dev/` | 404 |
| `https://qnfo-ops.q08.workers.dev/health` | 404 |
| `https://qnfo-ops.q08.workers.dev/manifest` | 404 |
| `https://qnfo-ops.q08.workers.dev/v1/jobs` | 404 |
| `https://qnfo-ops.q08.workers.dev/v1/jobs/job-d5ba1a3ba3b9cb` | 404 |
| `https://qnfo-ops.q08.workers.dev/v1/jobs/job-e22d9c9e9d8445` | 404 |
| `https://reading.q08.org/health` (control) | **200** |

The `service_registry` row for `qnfo-ops` (version 2.15.1, `updated_at` 2026-09-13T11:30:57.836Z)
advertises `base_url: https://qnfo-ops.q08.workers.dev` and lists `/health`, `/`, `/manifest`,
`/v1/jobs`, `/v1/jobs/:id` among its routes. All 404 externally. The control fetch reaches
`reading.q08.org` with the same tool, so this is host-specific, not a fetch-guard artefact.

Two readings survive and are not separated here: (a) the worker is reachable only through service
bindings and the registered `base_url` is aspirational; (b) the host is routed but those routes are
unwired. Either way the runtime's own continuation line — `Poll GET .../v1/jobs/<id>` — points at a
surface that does not answer, so **a continuation job cannot be polled by the documented method.**

## 2. The real store: every chain job is stuck in `continuing`

`ops_jobs` schema: `id, status, model, strategy, payload, response, tool_log, error, created_at,
updated_at`. There is no lease, heartbeat, attempt, or chain-depth column on the row.

| id | status | created | last write | stale at 11:55Z |
|---|---|---|---|---|
| job-54c660749788c7 | continuing | 07:07:20.145Z | 07:10:35.157Z | 4h44m24s |
| job-e22d9c9e9d8445 | continuing | 07:13:52.206Z | 07:23:34.322Z | 4h31m25s |
| job-d5ba1a3ba3b9cb | continuing | 07:20:39.123Z | 07:21:45.321Z | 4h33m14s |

Whole table (73 rows): `succeeded` 39, **`continuing` 26**, `failed` 8. Last terminal transition of
any kind: **2026-09-13T07:26:39.868Z** — 4h28m20s before the poll. All 26 `continuing` rows were
created 06:29:04.814Z–07:24:45.211Z, a 55.7-minute window that closed 4.5 hours ago.

## 3. Root defect: failure is never written

`ops_ai_log` for 2026-09-13, grouped by source/strategy/ok:

| source | strategy | ok | n |
|---|---|---|---|
| job | job-workflow | **0** | **26** |
| job | job-workflow | 1 | 26 |
| mobile | agent-tools | 1 | 46 |
| other | chat | 1 | 6 |
| mobile | chat | 1 | 2 |
| other | agent-tools | 1 | 1 |

**26 failed `job-workflow` executions today, 26 rows in `continuing`, and zero rows written with
`status='failed'` today** (newest `failed` row in the table: 2026-09-12T13:27:38.553Z). The state
machine writes `succeeded` on success and does not write `failed` on failure, so a dead job and a
running job are indistinguishable, and every failure accumulates as a permanent `continuing` row.

Corroboration from `ops_fleet_log`: five `ok:0` job entries between 07:23:34Z and 07:26:40Z, each
within ~0.1s of the `updated_at` of a row still marked `continuing` (`ops-e1ad4292a93c93`
07:26:40.275Z vs `job-30747e13a77a9b` 07:26:40.150Z). That per-row pairing is timestamp proximity;
the 26=26 count identity is the stronger evidence and does not depend on it.

## 4. `succeeded` does not imply a deliverable

The newest `succeeded` row, `job-44e7f805a93a9c` (created 07:26:39.868Z, updated 07:28:11.658Z,
92s, chain depth 4/6), has `length(response) = 790` and stores a raw `<tool_calls>` block — an
unexecuted tool call — as its final response. Because each hop is written as a new row and the
parent is left `continuing`, a chain that produced a real answer and a chain that died mid-tool-call
are stored identically.

## 5. Consequence for the reading stream (dated observation)

Verified during the same poll:

- `reading.q08.org/health` → 200, `version v1.1.0`, `pieces: 8`, last
  `2026-09-13-notes-e336023daec68fda` ("Four Claims a Map Makes", notes), writer `deepseek-chat`.
- `PERSONAL.companion_pieces` → 8 rows, ids 6–13.
- `json_extract(quality_json,'$.verdict')` over all 8 live pieces: **7 carry `verdict='reject'` with
  `gate='passed'`**; only id 9 is `accept`.

QRI-1 reported 6 of 7. The count is now 7 of 8, and the piece published after that audit (id 13,
2026-09-13) is another reject/passed. The QRI-1 gate defect is not merely un-remediated: the newest
publication is a further instance of it. `PATCH-2026-09-13-REMEDIATION.md` and
`ADDENDUM-2026-09-13-gate-wiring.md` in this directory describe the fix; the live data shows it is
not in force.

## 6. Recommended fixes

1. **Write `failed` on failure.** Whatever branch terminates a `job-workflow` attempt with `ok:0`
   must set `status='failed'` (and the `error` column) instead of leaving the row `continuing`.
   Without this, no poll can distinguish a dead job from a live one — the current poll route is
   unusable by construction, not merely unreachable.
2. **Add a lease/heartbeat** (`lease_until` or `heartbeat_at`) and a reaper that moves rows past
   their lease to `failed`. `updated_at` alone cannot express "abandoned", which is why §2 needed a
   4.5-hour silence argument rather than a check.
3. **Reconcile the registry `base_url`** for `qnfo-ops`, or stop emitting a `Poll GET <url>` line
   that 404s. The registry row is self-registered, so it may simply be wrong.
4. **Do not treat `status='succeeded'` as delivery.** Store the chain outcome separately from the
   HTTP-layer outcome, or require a non-tool-call terminal response.

## 7. Limits of this finding

- Whether all 26 `ok:0` rows are *continuation* attempts or first-hop attempts is not distinguished
  by any `ops_ai_log` field; the reading "job-workflow failures" is all the schema states.
- Some of the 26 may still be live in some isolate. Their 4h+ silence argues against it; with no
  lease column, it is not proven.
- The 404 cause is not established (§1).
- This is a single snapshot at 11:55Z. Counts stated without a timestamp on this workspace have
  already been falsified within the hour by a concurrent writer.
- No repair was executed: `ops_d1_query` is read-only and no tool on the ops endpoint writes
  `ops_jobs`.
