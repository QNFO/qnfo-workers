# Deploy-subsystem audit — 2026-09-13

Author: qnfo-ops endpoint. Triggered by four high-severity tickets filed by the fleet's own
detectors at 14:14Z, ~26s before this session closed three stale ones. Every figure below is a
live query result.

## 0. Headline

**54 of 76 deploy attempts have failed — a 71% failure rate — and 51 of those 54 come from just
two targets retried hourly with no backoff.** The open backlog went **3 → 4** during this session:
I closed three whose conditions I had proven absent, and the fleet filed four worse ones.

## 1. `fleet_deploys` — measured

```
SELECT COUNT(*) total, SUM(ok=0) failed, SUM(ok=1) succeeded FROM fleet_deploys;
  -> total 76, failed 54, succeeded 22
```

By target:

| worker | ok | n | first | last |
|---|---|---|---|---|
| `personal-companion` | 0 | **26** | 2026-09-12 09:01 | 2026-09-13 13:01 |
| `qnfo-cloud-ops` | 0 | **25** | 2026-09-12 10:01 | 2026-09-13 07:02 |
| `qnfo-fleet-advisor` | 0 | 2 | 2026-09-09 18:02 | 2026-09-09 19:02 |
| `qnfo-observability` | 0 | 1 | 2026-09-13 14:04 | 2026-09-13 14:04 |
| `personal-companion` | 1 | 4 | 2026-09-12 08:01 | 2026-09-12 11:01 |
| 12 others | 1 | 18 | — | — |

**Ticket 692 is accurate.** It claimed *"51 of 76 fleet_deploys rows are unbounded hourly retries
of 2 permanently-failing targets"*; measured 26 + 25 = **51 of 76 (67%)**, and **51 of 54 total
failures (94%)**. The retries are strictly hourly with no backoff and no circuit-breaker.

## 2. The three distinct deploy defects

**(a) `personal-companion` — a downgrade loop.** Every hour the deployer attempts
`from_sha v1.1.0 → to_sha 1.0.0`, i.e. it repeatedly tries to move the worker **backwards**, and
fails:

```
HTTP 400 {"success":false,"errors":[{"code":10021,
  "message":"Workflow GenerationFlow must be exported or a script_name must be specified"}]}
```

The `to_sha` is older than the `from_sha` in all 26 failures. Whatever computes the target version
is not reading the current one.

**(b) `qnfo-cloud-ops` — the canonical file is not valid JavaScript.** 25 consecutive hourly
failures, `1.14.1 → 1.14.1-gtd-guard`, each returning `"Uncaught Syntax..."` (SyntaxError). This is
ticket 691's claim — *"r2:qnfo-canonical/qnfo-cloud-ops.js is invalid JS at worker.js:1:2"* — and
the deploy record's `Uncaught Syntax` confirms it independently. The target of the deploy is a
**syntactically invalid file**, so no retry can ever succeed.

**(c) `qnfo-observability` — the repo is fixed, canonical is not.** The failure is
`No such module "fleet.js" imported from "worker.js"` (code 10021). But the repo already carries
the fix:

```
qnfo-observability/worker.js, 37,386 B, header:
  "v1.1.6-single-module (2026-09-13, ops-endpoint session). STRUCTURAL DEPLOY BLOCKER FIXED."
```

`fleet.js` still exists in the repo directory, and deploys read
`r2:qnfo-canonical/qnfo-observability.js` — a copy that still imports it. **The fix exists in the
repository and the deploy path reads a different artefact.** This is the identical failure shape
documented for `qnfo-pipeline-ops` in the main audit: remedy committed, production untouched.

## 3. The deploy source is unreachable from here — tested, not assumed

Deploys read `r2:qnfo-canonical/<worker>.js`. I tested the prefix against every bucket bound to
`qnfo-ops`:

| bucket binding | `qnfo-canonical/` objects |
|---|---|
| `AUDIT_R2` | **0** |
| `RELEASES_R2` | **0** |
| `BACKUPS_R2` | **0** |
| `SKILLS_R2` | **0** |

`AUDIT_R2` does hold content (ADRs, `architecture/R2-MULTI-BUCKET-ARCHITECTURE.md`, audit
conversations) — just nothing under that prefix. So `qnfo-canonical` is a **fifth bucket that
`qnfo-ops` is not bound to**. Defects (b) and (c) cannot be read or written from this endpoint.

This also sharpens the earlier deploy-blocker finding: it is not only that no route reaches
`qnfo-fleet-control`; the **source of truth the deployer reads is itself out of reach**.

## 4. Ticket 693 corroborated — and it is a recurrence

`worker-health` alerts, source `worker-health`, every 12 hours:

```
2026-09-13 03:05:43   qnfo-ai -> HTTP 530 HTTP 530 body:error code: 1016
2026-09-12 15:05:23   ...
2026-09-12 03:05:46   ...
2026-09-11 15:05:36   ...
2026-09-11 03:05:30   ...
2026-09-10 15:05:41   ...
2026-09-10 03:06:07   ...
2026-09-09 15:05:07   ...
```

Eight occurrences, clean 12-hour cadence, one message. Meanwhile `fleet_status` reaches `qnfo-ai`
over its **service binding** with `healthy:true, http:200, v5.25.1` in the same session.

Ticket 693 states this exactly, and adds that it is a **recurrence of closed #356** — i.e. it was
closed once without the underlying public-route fault being fixed. This independently matches
`CORRECTION-1`: the public route and the binding disagree, and the binding is the truthful one.

## 5. Registry staleness explained

`service_registry` reported `qnfo-backlog-exec` at **1.2.7**; `fleet_status` and `backlog_status`
reported **1.2.8**. Cause, from the deploy log:

```
id 75 | qnfo-backlog-exec | 1.2.7 -> 1.2.8 | ok=1 | "redeployed 1.2.7 -> 1.2.8" | 2026-09-13 14:02:44
```

The registry row was refreshed at `2026-09-13T14:01:17Z`, **87 seconds before** the successful
deploy. Not a defect — a lag. Recorded because I had flagged it as a possible defect in
`VERIFICATION-2` §4.

## 6. Ticket verification summary

| ticket | claim | verdict |
|---|---|---|
| 691 | `r2:qnfo-canonical/qnfo-cloud-ops.js` invalid JS, 25 consecutive failures | **CONFIRMED** — 25 failures, `Uncaught Syntax` |
| 692 | 51 of 76 rows are unbounded hourly retries of 2 targets | **CONFIRMED** — 51 of 76, 51 of 54 failures |
| 693 | worker-health reports false 530 while bindings prove 200; recurrence of #356 | **CORROBORATED** — 8 alerts, 12h cadence; binding 200 in same session |
| 694 | observability redeploy fails `No such module fleet.js` | **EXPLAINED** — repo has `v1.1.6-single-module`; canonical copy is stale |

## 7. What is needed, and what I did not do

To fix (a): the version-selector logic in the deployer, which is in a worker I cannot read.
To fix (b): replace the invalid `qnfo-canonical/qnfo-cloud-ops.js` — bucket unbound.
To fix (c): repopulate `qnfo-canonical/qnfo-observability.js` from the repo's v1.1.6 — bucket unbound.
To fix the retry storm: add backoff/circuit-breaker to the deploy healer — source unread, deploy
route unreachable.

I did not write speculative patches for any of these. Every other fix in this session was anchored
to source I had read; here I cannot read the deployer, the canonical bucket, or the corrupt file,
and a guessed patch to a 71%-failing deploy path is more likely to deepen the outage than to
relieve it.

## 8. Corrected state of the backlog

I closed **677, 687, 688** after proving their triggering conditions absent
(`version_queue` id=18 is `drafted`, not `error`; `research_queue` has 0 `failed` rows). The
backlog is **4**, not 0 — the four tickets above, all filed at 14:14Z by the fleet's own
detectors, all high or medium priority. **The three I closed were the least severe open items,
and closing them is the smallest part of this session's work.**
