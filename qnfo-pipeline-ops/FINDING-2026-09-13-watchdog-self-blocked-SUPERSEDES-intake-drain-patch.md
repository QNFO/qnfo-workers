# FINDING — the intake watchdog escalates every hour and is silently self-blocked

Date: 2026-09-13. Author: qnfo-ops endpoint (Chatbox session).
Supersedes the mechanism claimed in `PATCH-2026-09-13-intake-drain.mjs` in this directory.

## 0. Correction to my own staged patch — read this first

`PATCH-2026-09-13-intake-drain.mjs` asserts the watchdog *"advertised a drain it never
performed"*. **That is wrong in its central claim, and the real mechanism is worse.**

I had not read the deployed worker when I wrote it. I have now read
`qnfo-pipeline-ops/worker.js` (16,933 B, sha `350aefa2`) and the live telemetry. The watchdog
**does** detect the stall and **does** call `escIssue` — on every run:

```
cloud_ops_events, job='qnfo-pipeline-ops', kind='health'
2026-09-13T13:46:01.043Z
text: {"queued":0,"researching":0,"review":0,"failed":2,"published":19,
       "intake_new":496,"intake_oldest":"2026-09-12T09:50:02.378Z","triaged":62}
meta: {"intake":{"intake_new":496,"intake_oldest":"2026-09-12T09:50:02.378Z",
                 "action":"escalated","triage_health":404}}
```

`action: "escalated"` — every 15 minutes, back through 12:01. **The detection works.** Do not
apply the patch as written; its premise is refuted.

## 1. What is actually broken

Two independent failures, both visible in that one `meta` line.

**(a) `triage_health: 404`.** The watchdog's only outbound call is
`fetch(TRIAGE_URL + "/health")` where `TRIAGE_URL = "https://qnfo-idea-triage.q08.workers.dev"`.
It returns **404**. So:
- `qnfo-idea-triage` is not reachable at that host — yet it is the worker the intake stall is
  blocked on, and it is absent from `fleet_status`'s 55-worker list.
- Even if the watchdog *did* trigger a drain, it would hit a 404. The description string
  *"Auto-remediation: triage drain"* is a promise the reachable code cannot keep: the function
  performs a health GET and nothing else.
- The drain routes that do exist (`/triage/run`, `/triage/sync`, `/triage/dispatch`) are on
  `qnfo-intent-orchestrator`, a **different host** from `TRIAGE_URL`.

**(b) The escalation is suppressed by a dedupe that matches its own closed history.**
Every hourly alert reads:

```
"INTAKE-STALL escalated -> agent_issues dup: 496 proposals stuck new"
```

`dup` means `escIssue`'s dedupe query matched an existing row, so **no issue was filed**. But
there is **no open INTAKE-STALL issue**. The only INTAKE-STALL rows in `agent_issues` are:

| id | title | status | created |
|---|---|---|---|
| 495 | INTAKE-STALL: 8 idea_proposals stuck 'new' | **closed** | 2026-09-06 20:30:10 |
| 494 | INTAKE-STALL: 9 idea_proposals stuck 'new' | **closed** | 2026-09-06 20:17:43 |
| 493 | INTAKE-STALL: 12 idea_proposals stuck 'new' | **closed** | 2026-09-06 20:15:10 |
| 492 | INTAKE-STALL: 14 idea_proposals stuck 'new' | **closed** | 2026-09-06 20:13:06 |

**The watchdog last successfully filed an INTAKE-STALL ticket on 2026-09-06 20:30:10 — 7 days
ago — and has been reporting `dup` hourly ever since.** The condition it watches has been true
the whole time (496 ≥ `INTAKE_BACKLOG_ALERT_N`=5; oldest 29h ≥ `INTAKE_STALL_MIN`=120).

The repo source filters the dedupe on `status='open'`:
```js
"SELECT COUNT(*) n FROM agent_issues WHERE status='open' AND title LIKE ?1"
```
so with that code the four closed rows above could not match. **The deployed code must differ.**
Leading hypothesis, not proven: the deployed dedupe omits the `status='open'` predicate (or uses
a short fixed prefix), so the four 2026-09-06 tickets permanently suppress re-filing. I cannot
confirm this — see §3.

## 2. Proof that the deployed worker is not the repo source

The repo's `worker.js` and `deployed-current.worker.js` are **byte-identical**
(both 16,933 B, both sha `350aefa2f56e22b28597c936f370e5cac25247e9`).

But the deployed worker cannot be that source:

1. **Title format.** Repo v0.5.4 uses a fixed literal
   `"INTAKE-STALL: idea_proposals stuck new (single-issue, self-closes on clear)"`.
   The 09-06 tickets are titled `"INTAKE-STALL: N idea_proposals stuck 'new'"` — count-bearing,
   a format that does not exist in that source.
2. **Alert text.** Repo v0.5.3/v0.5.4 emits `"INTAKE-STALL escalated -> agent_issues ok: "` and
   only inside `if (r.inserted)`. The live alert says `"... -> agent_issues dup: ..."` and fires
   when nothing was inserted. That string is not in the repo.

**Therefore `deployed-current.worker.js` is a copy of the repo source, not a snapshot of
production.** The `deployed-current` convention is being satisfied by duplication. Any drift
comparison built on it compares the repo against itself and will always report "clean". This is
the same provenance failure as the fleet-control canonical extraction: the artifact that is
supposed to describe production does not.

## 3. The alert storm is live, and the fix for it is sitting in the repo undeployed

`alerts`, source `qnfo-pipeline-ops`, last 24h:

| level | n | intake_stall | terminal | summary |
|---|---|---|---|---|
| **critical** | **107** | 22 | 42 | 43 |
| info | 9 | 0 | 0 | 0 |
| warning | 1 | 0 | 0 | 0 |

**928 alerts all-time** (2026-09-03 10:30:50 → 2026-09-13 13:16:00), against **16 `agent_issues`
ever filed** by this worker. Each of the three emitters fires roughly hourly: intake-stall at
:01, terminal at :00:59 (two messages), summary at :16.

The repo's `worker.js` header documents v0.5.3 (`escalateTerminal`/`intakeWatchdog` gated on
`r.inserted`) and v0.5.4 (fingerprint-gated summary, `pipeline_state` table) as **already written,
dated 2026-09-13, "fleet audit"** — explicitly to fix this storm. Measured in that header:
*"765 critical alerts, ~96/day"*. It is now **107/day**. **The fix is in the repo and is not
deployed.** Same pattern as the deploy comparator, the canonical extraction, and the intake drain:
the remedy exists as source and production runs the defect.

## 4. Order of operations

1. Determine which build is actually serving `qnfo-pipeline-ops`, then deploy v0.5.4 (or
   reconcile the source to whatever is live). Until then every drift claim about this worker is
   meaningless.
2. Fix `TRIAGE_URL` — point the health check at a host that answers, and make the drain an
   actual call (`/triage/run` on `qnfo-intent-orchestrator`), or delete the
   *"Auto-remediation: triage drain"* claim from the description.
3. Fix the dedupe so a **closed** ticket cannot suppress a new filing. `escIssue`'s
   `MAX(id)+1` PK assignment is also race-prone against the fleet-advisor's auto-increment
   inserts (advisor cron `*/20`, pipeline-ops `*/15` — they collide at :00 and :30).
4. Then clear the 496-proposal backlog, which is a recurrence of the 2026-09-03..09-06 freeze
   documented in the v0.5.0 header (triage `scoreIdea` → "all scoring models failed" after a
   Workers AI response-envelope change).

## 5. What I could not do

- **No deploy path.** This is a source-level fix to a worker the control plane does not appear to
  manage; I hold no token and NO_SELF blocks the alternative route.
- **No D1 write path** (`ops_d1_query` is SELECT/WITH only), so the 496 rows and the 16 issues
  cannot be touched from here.
- **The deployed worker's source was never read** — only the repo copy, which §2 proves is not it.
  The dedupe mechanism in §1(b) is therefore a hypothesis.
