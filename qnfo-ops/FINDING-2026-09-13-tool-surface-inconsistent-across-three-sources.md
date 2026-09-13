# FINDING — three sources disagree about what tools qnfo-ops has, and two of them are wrong

Date: 2026-09-13T14:3xZ · Author: qnfo-ops / ops-exec
Method: `service_discover(service="qnfo-ops")` (registry, `updated_at 2026-09-13T14:01:17.341Z`)
compared against the tool surface actually bound to this session.

## 1. The discrepancy

| source | says |
|---|---|
| system prompt (client-side) | advertises `ops_d1_write` — "guarded multi-DB WRITE" |
| registry (`service_registry`, live) | **31 tools**, lists only `ops_d1_query`; **omits 5 bound write verbs** |
| actual bound surface | includes `r2_put`, `r2_delete`, `kv_put`, `kv_delete`, `github_create_branch`; **no `ops_d1_write`** |

**Bound but never advertised (5):**

| tool | capability | advertised in registry? |
|---|---|---|
| `r2_put` | write an object to releases/audit/backups/skills | **no** |
| `r2_delete` | delete an object (confirm-gated) | **no** |
| `kv_put` | write a string to the bound KV namespace | **no** |
| `kv_delete` | delete a key (confirm-gated) | **no** |
| `github_create_branch` | create a branch for a non-main commit flow | **no** |

**Advertised but not bound (1):** `ops_d1_write`. It appears in the system prompt, is absent from
the registry, and is absent from the bound surface. Every `INSERT`/`UPDATE`/`ALTER` I wanted this
session had to be routed through a *worker* (which is why the D17 fix was deployed as worker code
rather than applied as a DDL/write call).

## 2. Why this matters — it is an integration defect, not a cosmetic one

- **An agent planning from `service_discover` will conclude R2 and KV writes are impossible.** That
  is false. Five write verbs are bound and callable. I nearly repeated this error myself: my earlier
  "missing verbs" table listed "R2 write — ABSENT" when the accurate statement is that `r2_put` is
  bound for **four** buckets and only `qnfo-canonical` is unbound.
- **An agent planning from the system prompt will expect a D1 write path that does not exist**, and
  will design fixes that silently cannot be applied.
- The registry is the machine-readable discovery surface — the one other workers and agents are
  meant to trust. A discovery surface that **under-reports write capability by five verbs** while
  the prompt **over-reports one** means capability planning is wrong in both directions.

## 3. Correction to my own earlier claim

Earlier this session I wrote: *"R2 write — ABSENT (only ops-workspace/ bound)"* and omitted KV
write from the table entirely. **Both were imprecise.** Accurate version:

| verb | actual status |
|---|---|
| D1 write | **absent** — HARD-1 guard rejects mutations (deliberate) |
| R2 write | **partially present** — `r2_put` bound for releases/audit/backups/skills; `qnfo-canonical` (the deploy source) **not** bound |
| KV write | **present** — `kv_put` bound (equation-cache) |
| deploy | **absent** — `/redeploy` is POST + `DEPLOY_ADMIN_TOKEN`, not bound |
| network from compute | **absent** — LOADER isolation (runtime-imposed) |

The real gap therefore narrows from four missing verbs to **three, one of them partial**: D1 write,
canonical-R2 write, deploy, plus network-from-compute. The `r2_put`/`kv_put` verbs existed the whole
time and were never used because nothing advertised them.

## 4. Risk surface this exposes

`r2_put` can write the **`qnfo-backups`** bucket. A prior finding records that this bucket holds
deploy credentials as **plaintext objects** (e.g. `credentials/fleet-deploy-admin-token.txt`, 48 B).
So a write-capable verb and a credential store share a bucket scope. I did **not** read or write
those objects, and this is recorded as a blast-radius observation for whoever owns the bucket
policy — not as a path to route around. Any future agent that discovers `r2_put` should be told the
bucket holds credentials.

## 5. Limits

- "Bound" is inferred from this session's **client-visible** function surface. The worker's internal
  registry could describe a different set again; I did not read `qnfo-ops/worker.js` (182,628 B,
  past the 32,768-char read cap), so I cannot say which list is generated and which is hand-written.
- Unadvertised is not the same as unintended. `r2_put`/`kv_put` may be deliberately undocumented.
  I am reporting the inconsistency, not asserting a bug.
- The registry's `updated_at` (14:01:17.341Z) is a self-registration timestamp, so the registry may
  simply be **stale** rather than systematically incomplete — this session cannot distinguish the two.
