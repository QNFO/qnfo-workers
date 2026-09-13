# FINDING — the control plane's trigger surface is real and 401-gated; the heal cannot be forced from here

Date: 2026-09-13T14:2xZ · Author: qnfo-ops / ops-exec
Method: `web_fetch` (GET) against `qnfo-fleet-control.q08.workers.dev`, six paths.

## 1. The probe result — and why 401 ≠ 404 matters

| path | result |
|---|---|
| `/health` (earlier this session) | **HTTP 404** |
| `/` (earlier this session) | **HTTP 404** |
| `/scan` | **HTTP 401** |
| `/drift` | **HTTP 401** |
| `/heal` | **HTTP 401** |
| `/deploy` | **HTTP 401** |
| `/status` | **HTTP 401** |
| `/manifest` | **HTTP 401** |

Six arbitrary paths all returning **401** (rather than 404) is not six coincidences — it is the
signature of a **global auth wrapper** that runs before routing. The consequence for diagnosis:

- **404 = route absent.** The earlier `/health` and `/` probes proved nothing about the control
  plane, and were wrong to be read as "no trigger surface exists".
- **401 = route exists (or is behind a catch-all), auth required.** The scan/heal/redeploy surface
  is **present and gated**, not missing.

So the deploy trigger exists. It is simply not reachable from this endpoint.

## 2. Why it is unreachable — three independent walls

| wall | detail |
|---|---|
| credential | `POST /redeploy` is gated by `DEPLOY_ADMIN_TOKEN`, which is **not** in qnfo-ops' declared deps |
| method | `web_fetch` is **GET-only**; `/redeploy` is POST |
| isolation | `run_code` runs on the LOADER with **no network and no secrets**, so it cannot fetch a token nor issue the request |
| self-reference | `qnfo-fleet-control` **refuses self-redeploy** (per the control plane's README), and in any case this endpoint is not the control plane |

None of these is a defect to route around. The design is correct: a fleet-wide redeploy token must
not be reachable from the worker being redeployed, and a GET-only fetcher must not be able to fire
a mutating POST.

## 3. Consequence for the v1.3.0 deploy

The `qnfo-backlog-exec` 1.3.0 promotion **cannot be forced**. It will be attempted by the hourly
scheduled scan, and only by it. Evidence that the scan is the sole actor: every `fleet_deploys` row
carries `actor="deploy"`, and `fleet_drift_report` timestamps cluster at :0x past the hour
(13:03:53, 14:02:39, 14:04:01, 14:05:46).

**Verification must therefore be a later read, not an action.** Expect either:
- `fleet_drift_report` for `qnfo-backlog-exec` → `canonical_version 1.3.0` with note flipping
  `canonical-ahead` → `deployed-ahead`, plus a `fleet_deploys` row `1.2.8 -> 1.3.0`, `ok=1`; or
- a `fleet_deploys` row with `ok=0` and an `error 10021` note, in which case the bundle failed to
  parse and 1.2.8 keeps serving (non-destructive — proven by `personal-companion`: 30 attempts,
  4 ok, still on `v1.1.0`).

## 4. Limits

- A catch-all 401 means I **cannot enumerate which routes actually exist**. `/scan`, `/heal`,
  `/deploy` may be real, or may 401 from the wrapper before ever reaching a 404. The claim supported
  here is only that *some* gated surface exists — not that these specific paths are implemented.
- `qnfo-fleet-control` is 75,875 B, past the 32,768-char read cap, so its routing table was **not**
  read. The global-wrapper interpretation is inferred from the uniform 401 across unrelated paths.
- The 401s were produced unauthenticated; a 401 for a *wrong* token would look identical from here.
