# REV10 — The merge waves explain the silent jobs; registry drift; blocker confirmed

Date: 2026-09-13. Final revision. Resolves the six silent jobs, refines the
`fabric-20260910` question, records registry-vs-deployed drift, and **confirms
from the service registry that no config-write route exists** — so Tier 0 is
genuinely unreachable from this endpoint.

---

## 1. The silent jobs were merged away

`service_registry`, read this session:

| service | version | purpose (verbatim) |
|---|---|---|
| `radar-hub` | 1.0.0 | **"Merged radar hub (wave B): events-radar + qnfo-arxiv-radar + qnfo-research-radar + qnfo-citation-watch; `/events/*` and `/citation/*` prefixes + cron dispatch"** |
| `fleet-exec` | 1.0.0 | "Merged executor+scheduler (wave A 2->1): dynamic task engine + per-minute cron dispatcher" |
| `qnfo-fleet-control` | 0.4.11 | "Merged fleet control (wave A): advisor audits + calibration baselines + deploy scan/heal/redeploy" |
| `audit-hub` / `companion-hub` / `errata-hub` / `idea-hub` / `jnl-pipeline` | 1.0.0 | merge products (no purpose recorded) |

**Two of the six silent jobs are explained.** `radar` and `research-scan` were
owned by `qnfo-arxiv-radar` / `qnfo-research-radar` / `qnfo-citation-watch` —
all four merged into **`radar-hub`** in "wave B". When a worker is merged, its
old cron trigger stops emitting under the old job name.

So the auditor's C4 check is watching **job names that no longer exist**. The
silence is partly an artefact of renaming, not a stopped job.

### Consequence for REV7/REV8

This also refines `fabric-20260910`. The fleet has documented **merge waves**
("wave A", "wave B") that consolidated workers into `*-hub` and `fleet-*`
services. A build tag stamped across 29 workers on a single date is consistent
with **a merge-wave release**, not with 29 independent deploys — which is why
`deployment_history` shows 1 row and `fleet_deploys` shows 0 for 2026-09-10.

**REV7 was directionally right and factually wrong:** there *was* a fleet-wide
change around 2026-09-10, but it was a merge/rename wave, not a deploy of 29
workers. REV8's refutation of "deploy wave" stands; the merge-wave reading
replaces it. I am labelling this **inferred** — I read the merge descriptions
from the registry, not the wave's changelog.

**What is not explained:** `briefing`, `outreach`, `email-triage`,
`gmail-triage`. `research-daily-brief` is *not* a merge product (purpose:
"Daily research email digest", updated 2026-09-13T07:22:50Z), so its silence and
its daily `FAILED` emails are a real defect, not a rename.

---

## 2. Registry vs deployed version drift

The registry is a **third** version source, and it disagrees with both the
deployed value and the canonical:

| worker | registry | deployed | canonical |
|---|---|---|---|
| `qnfo-observability` | **1.2.0** | 1.1.3 | 1.1.4 |
| `qnfo-backlog-exec` | **1.2.7** | **1.2.8** | 1.2.4 |
| `qnfo-fleet-dashboard` | **1.1.0** | 1.5.1 | 1.1.0 |
| `personal-companion` | **1.0.0** | **v1.1.0** | 1.0.0 |

`qnfo-backlog-exec` is the sharpest: `fleet_status` reported it healthy at
**1.2.8**, the registry says **1.2.7**, and the canonical is **1.2.4**. Three
values for one worker.

**`personal-companion` is the dangerous one.** The registry records **1.0.0** —
the same version the hourly deploy loop is trying to push over a live
`v1.1.0`. So a reader who trusts the registry is led straight to the downgrade.
The registry is not a safe source for deploy decisions on this worker.

`qnfo-fleet-dashboard`'s registry value (1.1.0) equals its canonical, not its
deployed (1.5.1) — so the registry appears to be populated from the *canonical*
in at least some cases, which would make it structurally incapable of detecting
"deployed ahead of canonical".

---

## 3. Blocker confirmed — no config-write route exists

I claimed throughout that Tier 0 (`auto_heal`/`enabled` → `0`) is unreachable
from this endpoint. The registry confirms it from the route tables:

- **`qnfo-fleet-control`** (the live deployer): `routes: null`,
  `capabilities: null`. **No routes are published at all.** REV3 quoted a
  `POST /redeploy` route from a committed patch file; the registry does not
  corroborate it. Either it is undocumented or the patch describes a route that
  was never built.
- **`qnfo-ops`** (this endpoint), full route list:
  `/health`, `/`, `/fleet`, `/cost`, `/manifest`, `/analytics`, `/telemetry`,
  `/telemetry/analyze`, `/registry`, `/registry/:service`, `/registry/refresh`,
  `/registry/register`, `/v1/models`, `/v1/models/:id`, `/v1/chat/completions`,
  `/chat/completions`, `/v1/responses`, `/v1/jobs`, `/v1/jobs/:id`.

**There is no D1-write route on this endpoint.** `ops_d1_query` is SELECT/WITH
only, and no other route exposes a write. The Tier 0 fix — two rows, reversible,
the highest-leverage action in the audit — cannot be executed from here.

I also note `qnfo-ops` has a `POST /registry/register` route, i.e. this endpoint
can write its *own* registration. That is not a general write path.

---

## 4. Other registry findings

- **`qnfo-ops` reports itself at 2.15.7**, matching the drift row
  (`deployed 2.15.7 / canonical 2.15.6`, `deployed-ahead`). So this endpoint is
  a downgrade target, confirmed by two independent sources.
- **`qnfo-research-exec` 0.8.1**, purpose "version_queue drain: publishV2 to
  Zenodo + PDF regen + KG" — confirms REV4's `v2-drain` attribution to this
  worker.
- **`qnfo-ai`** publishes 13 routes and 12 capabilities; it is the most
  completely documented service in the fleet. Its `updated_at`
  (2026-09-13T14:01:17Z) is fresh.
- **Capability coverage is thin**: of 55 services, most have `capabilities: []`
  and `routes: []`. `ai-health-prober`, `audit-hub`, `companion-hub`,
  `errata-hub`, `idea-hub`, `jnl-pipeline` carry no purpose, capabilities, routes
  or deps at all — 6 services that are **merge products with no self-documentation**.

---

## 5. Limits

- **The merge-wave reading of `fabric-20260910` is inferred** from registry
  purpose strings, not from the wave's changelog or a deploy record.
- **Four of six silent jobs remain unexplained** (`briefing`, `outreach`,
  `email-triage`, `gmail-triage`).
- **I did not enumerate which of the 29 `fabric-20260910` workers are merge
  products.** Some clearly are (`radar-hub` is not in the 29; `qnfo-lifecycle`,
  `qnfo-qwav`, `qnfo-email`, `qnfo-paper-indexer`, `qnfo-ddocs-indexer` are).
  The 29-worker list and the merge-product list do not obviously coincide, which
  weakens §1's explanation.
- **`POST /redeploy` may exist but be undocumented** — absence from the registry
  is not proof of absence.
- **The registry's provenance is unknown.** §2 shows it disagrees with both
  deployed and canonical values; I did not determine what writes it.
- **This is the tenth document.** The audit's value now depends on a reader
  following the index (`…INDEX-and-final-fix-queue.md`) rather than any single
  file, and on trusting §4 of that index over the earlier revisions.
