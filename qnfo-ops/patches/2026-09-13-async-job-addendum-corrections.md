# Addendum — corrections to `2026-09-13-async-job-audit-trail-and-envelope.md`

Author: qnfo-ops / ops-exec (poll session 2026-09-13T06:47–06:50Z).
Parent doc: `qnfo-ops/patches/2026-09-13-async-job-audit-trail-and-envelope.md`
(sha `d004b71a0cfc0b521dc33bce627c25c8c80a9385`), status **STAGED — not applied**.
Apply the parent **as amended below**. All figures are live D1 reads from this session.

---

## A1 — D4 is WRONG: `_chain.depth` is structured and the bound at 6 does bind

The parent doc concludes (D4): *"the counter is text carried in the conversation history —
self-reported, not runner-asserted"*, and *"no `3/6`–`6/6` exists anywhere"*.

That is an artifact of searching the wrong representation. The parent tested
`instr(payload,'chain depth 3/6')` — the **prose banner**. The runner also writes a
**structured JSON object**, `_chain: {depth, root}`, inside the payload. Querying that:

```sql
SELECT json_extract(payload,'$._chain.depth') AS depth, count(*) n,
       sum(status='succeeded') succ, sum(status='running') running, sum(status='continuing') cont
FROM ops_jobs WHERE payload LIKE '%_chain%' GROUP BY depth ORDER BY depth;
```

| depth | n | succeeded | running | continuing |
|---|---|---|---|---|
| 1 | 17 | 5 | 1 | 6 |
| 2 | 6 | 3 | 1 | 2 |
| 3 | 2 | 1 | 0 | 1 |
| 4 | 1 | 0 | 0 | 1 |
| 5 | 1 | 0 | 0 | 1 |
| 6 | **1** | **1** | 0 | 0 |

28 jobs carry `_chain`. **Depth 6 exists and is reached** — the parent's claim that no
`3/6`–`6/6` exists anywhere is falsified. The population decays monotonically
17 → 6 → 2 → 1 → 1 → 1, which is the signature of a **real, enforced bound at 6**: each depth
spawns strictly fewer successors and the chain terminates there. `_chain.root` groups them
(e.g. `chatcmpl-8224b028728cd1` occupies depths 3, 4, 5 **and** 6).

**Revised fix for D4.** Do not delete the banner as "undocumented prose" — the counter is real.
Instead: (a) make `_chain` authoritative and expose `chain_depth`/`chain_max` as queryable
columns rather than only payload JSON; (b) keep the prose banner only if it is re-derived from
`_chain` at emit time; (c) log each depth transition. The parent's corollary (14 tool entries in
one log vs `OPS_MAX_TOOL_ITERS=8`) still stands and is independent of this correction.

---

## A2 — D2's stated verification is insufficient: the 404 is not (only) about auth

The parent doc records: *"It currently 404s to unauthenticated callers (verified: `web_fetch` →
HTTP 404 for `/v1/jobs/<id>`, `/health`, `/manifest` alike)."*

The 404s are real, but "unauthenticated callers" does not explain them, because **`/health`
requires no auth and other workers' `/health` 404s too**. Control experiment:

| url | fleet prober record | endpoint fetch |
|---|---|---|
| `https://qnfo-social.q08.workers.dev/health` | ok=1, **status 200** (2026-09-12T07:07:33Z) | **404** |
| `https://qnfo-skill-sync.q08.workers.dev/health` | ok=1, **status 200** (2026-09-12T07:07:33Z) | **404** |
| `https://demo.workers.dev/` (nonexistent subdomain) | — | **530** |

Two URLs the fleet's own prober logged as 200 one day earlier return 404 to the endpoint, while a
nonexistent `workers.dev` subdomain returns 530 — so the outbound request does leave the endpoint.
The consistent explanation is the **Cloudflare restriction on a Worker fetching same-account
`*.workers.dev`**, not authentication. Consequences:

- The parent's D2 item "expose `GET /v1/jobs/:id` **authenticated** so polling is actually
  possible" may not be sufficient on its own — if the same-account restriction is in play, an
  authenticated fetch **from a Worker** still fails. Polling from a browser/client is a separate
  path and is untested here.
- **Do not** read a 404 from this endpoint as evidence that any `q08.workers.dev` route is dead.
  Only a non-Worker vantage point can decide that.

**Unaffected:** the parent's key operational point holds — `ops_jobs.response` is a plain D1 column
readable via `ops_d1_query`, which is how the deliverables were retrieved. Polling the HTTP route
was never necessary.

---

## A3 — D1 corroborated, and worse than measured: 14 rows, 0 valid

The parent measured 4 rows at exactly 3,000 B with a non-`]` final byte. Re-measured now:

```sql
SELECT count(*) n, sum(json_valid(tool_log)) valid FROM ops_jobs WHERE length(tool_log)=3000;
-- n = 14, valid = 0
```

**14 rows** sit at the 3,000-byte cap and **not one is valid JSON**. The defect has grown 4 → 14
since the parent doc was written, so it is actively destroying audit trail on every tool-heavy job.
Raise D1's priority accordingly.

---

## A4 — NEW: `transport:"cf-api-list"` is a presence check that has never failed

`fleet_probe_log` (20,767 rows):

| transport | n | ok | ok% | note |
|---|---|---|---|---|
| `cf-api-list` | 12,552 | 12,552 | **100.0%** | **never fails → presence check, not a fetch** |
| `http` | 5,099 | 1,732 | **34.0%** | the only independent HTTP verification |
| `binding` | 3,041 | 3,041 | 100.0% | service bindings |
| `self` | 75 | 75 | 100.0% | |

A check that has never once failed is not a check. Two implications:

1. **Fleet health is partly synthetic.** `fleet_status` reports qnfo-ops as
   `probe:"api", healthy:null, http:null, version:""` — enumerated from the Cloudflare API, never
   health-probed. Only **12 of 55** deployed workers carry a real health result.
2. **`http` is the honest number: 34% ok.** Any fleet-health claim resting on `cf-api-list` rows
   overstates availability.

For `qnfo-ops` specifically: `binding` 335/335 ok (last 06:45:52Z, live) · `cf-api-list` 194/194
(last 2026-09-12T09:15:45Z) · `http` ok=1 n=19 (last **2026-09-12T07:07:33Z**) · `http` ok=0 n=5.
Its health signal since 2026-09-12 09:15 is **binding-only**; last independent HTTP verification is
~24 h stale.

---

## A5 — NEW: stalled `running` jobs are not terminal — they resume

Measured across a ~2-minute window, `ops_jobs` moved:

| status | t0 (06:47) | t1 (06:49) |
|---|---|---|
| succeeded | 19 | **23** |
| continuing | 10 | 10 |
| failed | 8 | 8 |
| running | 4 | **2** |

Two of the four `running` jobs completed during the window. A job frozen at
`updated_at = created_at + ~5 s` with `response_bytes = 0` is therefore **not** evidence of a
stillborn job — one such job (`job-735ae863837a61`, frozen at 06:45:30Z) remained stuck, but the
state is not terminal in general. Do not treat `running` as `failed`.

---

## A6 — NEW: every turn is executed twice

`ops_ai_log`, 2026-09-13 from 06:00Z — the same prompt is logged once from
`mobile`/`agent-tools` and once from `job`/`job-workflow`:

| prompt | rows | sources |
|---|---|---|
| `"Poll status? "` | 4 | mobile, job |
| `"Go ahead "` | 3 | mobile, job |
| `"Execute red team, test and remediate "` | 3 | mobile, job |

24 h `job-workflow`: **16 fail / 8 ok = 66.7%**, avg 182,717 ms failing vs 74,461 ms ok (2.5×).
The duplicate path is the failing one. This doubles token cost for every turn and is the likely
source of the `ok:0` envelopes analysed in the parent's D2. Worth a ticket of its own: either the
client should not also enqueue a durable job, or the durable job should be the only path.

---

## Order of work (superseding the parent's)

1. **D1 / A3** — 14 rows now corrupt and growing. Restores the audit trail. Do first.
2. **D3** — one-line serialization fix, same file.
3. **A4** — fix the health signal: stop counting `cf-api-list` as a pass, or make it a real fetch.
4. **D2 / A2** — contract change (202 + poll), plus settle whether the same-account fetch
   restriction blocks Worker-side polling. Needs client coordination.
5. **D4 / A1** — now a concrete change (`_chain` → columns), not a delete-the-prose decision.
6. **A6** — de-duplicate the two execution paths.

Regression guard for D1/D2/D3 remains `qnfo-ops/scripts/guard-async-job-audit.sh`.

## Still not established

- Whether `https://qnfo-ops.q08.workers.dev/v1/jobs/:id` works from a normal browser (only a
  non-Worker vantage can decide; see A2).
- Whether the depth-6 bound **refuses** a 7th hop or merely stops being incremented — depth 6 was
  reached and succeeded, but no depth-7 attempt was observed.
- The cause of the 6 `error = NULL` failures (2 of the 8 failed rows carry real error text; 6 do
  not). Payloads there span 3,536–520,244 B, so size is not the discriminator — the parent's
  "time, not size" reading is consistent with everything measured here.
