# TRIAGE — the four issues filed 2026-09-13T14:24Z, checked against live data

Date: 2026-09-13T15:0xZ · Author: qnfo-ops / ops-exec
Method: each ticket's claim re-derived from `fleet_deploys`, `fleet_probe_log`, the repo tree, and
version banners. A filed issue is a hypothesis; three of these survive contact, one does not.

---

## #694 OBSERVABILITY-MULTIMODULE-CANONICAL — CONFIRMED, root-caused, BLOCKED

**Claim:** `qnfo-observability` redeploy fails `No such module "fleet.js"`.

**Verified.** `fleet_deploys` id 76 (`14:04:01`, `ok=0`) carries exactly that error from the
Cloudflare API (code 10021). Repo tree confirms the layout:

```
qnfo-observability/  worker.js (37,386 B, banner v1.1.6)  fleet.js (SIBLING MODULE)  wrangler.toml
```

**Root cause — and it generalizes:** the canonical deploy path uploads **one file** and does not
carry a module graph, so any worker importing a local sibling module is rejected on upload and
keeps serving its old version forever. This is a **transport** defect, not a bundle defect — no
amount of canonical syncing or version bumping fixes it. Written up in
`qnfo-ops/FINDING-2026-09-13-deploy-path-is-single-file-only.md` (commit `06e11583`).

**Blocker:** 37,386 B vs the 32,768-char read cap; the fix (inline `fleet.js`, or teach the deploy
path to upload a module graph) needs a build step and `wrangler`.

---

## #693 WORKER-HEALTH-FALSE-530 — NOT CORROBORATED by the authoritative ledger

**Claim:** worker-health reports `qnfo-ai`/`personal-api` HTTP 530 code 1016 while service bindings
prove 200; recurrence of closed #356.

**Checked, and the claim does not hold up against the probe ledger.** `fleet_probe_log`, last 24 h:

| name | probes | ok | last |
|---|---:|---:|---|
| `qnfo-ai` | 81 | **81 (100%)** | `2026-09-13T14:16:30.415Z` |
| `personal-api` | 80 | **80 (100%)** | `2026-09-13T14:01:28.326Z` |
| `qnfo.org` | 81 | 78 (**3 failures**) | `2026-09-13T14:16:30.746Z` |

Row-level check for the two named workers returned `ok=1, status=200` on every one of the last ten
rows. The **only** name with failures in the window is `qnfo.org` — which the ticket does not
mention. `fleet_status` independently reports `qnfo-ai healthy:true http:200`.

**Conclusion:** the 530/1016 is an artifact of the *probing method*, not a worker outage. Code 1016
is an origin-DNS error, and this is the already-documented same-account class: public-URL probes
from the Cloudflare edge fail for workers on the same account. `qnfo-backlog-exec` v1.2.2 solved
exactly this by preferring `fleet_probe_log` over edge probes:

> "public-URL probes from the edge fail for same-account workers (CF edge 404 / SVC-BINDING-1); use
> qnfo-fleet-dashboard fleet_probe_log rows in qnfo-audit as the authoritative 15-min health evidence."

**Recommendation:** do **not** chase `qnfo-ai`/`personal-api` — they are healthy by every available
measure. Fix the prober to consume `fleet_probe_log`. **Blocker:** the prober lives in an over-cap
worker (`qnfo-fleet-dashboard` 48,913 B, or `qnfo-observability` 37,386 B).

**Limit:** the ledger shows 15-minute samples. A genuine sub-15-minute 530 window between samples
would be invisible here, so this refutes a *persistent* condition, not a transient one.

---

## #692 DEPLOY-HEALER-NO-BACKOFF — CONFIRMED, and the number checks out exactly

**Claim:** 51 of 76 `fleet_deploys` rows are unbounded hourly retries of 2 permanently-failing targets.

**Independently recomputed and it matches.** `fleet_deploys` grouped by worker this session:
`personal-companion` **30 attempts / 4 ok**, `qnfo-cloud-ops` **25 attempts / 0 ok**. Failing rows
for those two: `(30 − 4) + (25 − 0) = 51`. Total rows: **76**. So 51/76 = **67%** of all deploy
attempts are retries of two dead targets — confirmed to the row.

`qnfo-cloud-ops` last attempted `07:02:38`; `personal-companion` last `13:01:23`. Both are hourly,
unbounded, and both directions are wrong: cloud-ops retries a bundle that cannot parse, and
personal-companion attempts a **downgrade** (`from_sha v1.1.0 → to_sha 1.0.0`).

**Blocker:** the retry logic lives in `qnfo-fleet-control` (75,875 B, past the read cap).

---

## #691 DEPLOY-CANONICAL-CORRUPT — CONFIRMED, and it settles an architectural question

**Claim:** `r2:qnfo-canonical/qnfo-cloud-ops.js` is invalid JS at `worker.js:1:2`, 25 consecutive
hourly failures.

**Verified** in `fleet_deploys`: 25 attempts, 0 ok, `Uncaught SyntaxError: Invalid or unexpected
token at worker.js:1:2`. Position `1:2` is a banner/comment or stray-token location — consistent
with a bundle that was concatenated or truncated rather than parsed, i.e. the same transport-layer
damage as #694 with a different symptom.

**Secondary value:** every `fleet_deploys.source_path` reads `r2:qnfo-canonical/<worker>.js`. That
settles the earlier contradiction between staged docs: **the deploy source is R2**, while
`fleet_drift_report.source_path` (GitHub `deployed-current.worker.js`) is only the **comparison**
source. Two different files, two different roles — which is why the v1.3.0 reaper was written to
**both**.

**Blocker:** `r2:qnfo-canonical` is not a bound bucket; `r2_put` covers only
releases/audit/backups/skills.

---

## Summary

| issue | verdict | fixable from this endpoint |
|---|---|---|
| #694 | confirmed, root-caused (single-file transport) | no — 37,386 B > cap, needs bundling |
| #693 | **not corroborated** — probe-method artifact | no — prober is in an over-cap worker |
| #692 | confirmed, recomputed to the row (51/76) | no — `qnfo-fleet-control` 75,875 B |
| #691 | confirmed; also settles deploy-source = R2 | no — `qnfo-canonical` unbound |

None of the four is fixable here. All four share one shape: **the control surface is larger than
the repair surface.** Each needs either a bucket this endpoint cannot write, a worker larger than
the 32,768-char round-trip, or a build step — which is the same conclusion the D17 work reached
from the other direction.
