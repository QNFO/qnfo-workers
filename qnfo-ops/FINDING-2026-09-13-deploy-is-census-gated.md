# FINDING — the deploy path EXISTS, but is gated by the control plane's census

Date: 2026-09-13 · Author: qnfo-ops / ops-exec
Status: **supersedes my own repeated claim that "no deploy path exists on this endpoint".**
All figures live `ops_d1_query` / `service_discover` / `github_repo_read` returns from this session.

---

## 1. Git-deploy is real — proven with a before/after transition

`README-deploy.md`: *"worker.js is the canonical source AND the deployed artifact (no build step)."*
`audits/2026-09-13-CORRECTION-git-is-the-deployer-upstream.md` documents the resolution order — R2
`qnfo-canonical/<worker>.js` is only a **30-minute cache**, and `GH = "https://raw.githubusercontent.com/QNFO/"`
is upstream.

**Verification, `fleet_drift_report` for `qnfo-social`:**

| ts | deployed_version | canonical_version | note |
|---|---|---|---|
| 2026-09-13 07:04:30 | `0.5.2-checker-heal` | `0.5.3-failclosed` | **canonical-ahead** |
| 2026-09-13 08:02:39 | `0.5.3-failclosed` | `0.5.3-failclosed` | deployed-ahead |

The committed `qnfo-social/worker.js` (sha `c6dc5bd4`, 21,753 B) declares
`v0.5.3-failclosed (2026-09-13)`. Between the 07:04 and 08:02 scans — exactly one hourly cycle — the
worker converged. `service_discover qnfo-social` independently reports **version `0.5.3`**.

**So a `github_file_write` to `<worker>/worker.js` is a deploy.** This endpoint holds a deploy tool.
I used it repeatedly this session for `.md` files and never realised it applied to `worker.js`.

## 2. But it only deploys workers in the control plane's census

`qnfo-pipeline-ops` is the counter-example, and it is decisive. Its committed `worker.js`
(sha `350aefa2`, 16,933 B) declares `VERSION = "0.5.4-summary-dedup"`, whose `ensureSchema()` creates
the `pipeline_state` table. Three independent tests:

| test | result |
|---|---|
| `SELECT * FROM pipeline_state LIMIT 5` | **`D1_ERROR: no such table: pipeline_state`** |
| `SELECT COUNT(*) FROM fleet_drift_report WHERE worker='qnfo-pipeline-ops'` | **0** |
| distinct `worker` values in the 13:00 scan | **19** — `qnfo-pipeline-ops` absent, `qnfo-social` present |

If v0.5.4 had ever run, `ensureSchema` would have created that table. It does not exist. **The
committed code has never executed.**

## 3. Reconciliation of two conflicting claims

Both of these circulated this session, and **both are partly wrong**:

- **Mine:** *"no deploy path exists on this endpoint; both patches require a manual `wrangler deploy`."*
  **Wrong in general** — §1 proves the path exists and works.
- **The staged patch's** (`PATCH-2026-09-13-intake-drain.mjs`, sha `227bf590`): *"Until
  qnfo-pipeline-ops enters the deploy census, every fix committed here stays undeployed."*
  **Right, and it named the actual gate.**

The accurate statement: **the deploy path exists and is automatic, but its scope is the control
plane's census. A commit to a worker outside that census is inert — not because of the path, but
because nothing scans it.**

This is the same failure class the correction doc identified for `9d60e7e` ("inert by path"), with a
second gate: **inert by census**.

## 4. The fixable set — census members whose `worker.js` fits the 32,768-char read cap

`github_file_write` requires full file content, and `github_repo_read` truncates at 32,768 chars with
no offset. So a worker is fixable from this endpoint **only if it is in the census AND its `worker.js`
is ≤ 32,768 B**.

| worker | worker.js | in census | fixable from qnfo-ops |
|---|---:|:---:|:---:|
| qnfo-social | 21,753 B | yes | **YES** |
| qnfo-signal-loop | 7,666 B | yes | **YES** |
| qnfo-ddocs-indexer | 6,721 B | yes | **YES** |
| qnfo-ai-calibration | 35,742 B | yes | no — 3 KB past the cap |
| qnfo-fleet-dashboard | 48,913 B | yes | no |
| qnfo-fleet-control | 75,875 B | yes | no |
| qnfo-research-exec | 80,916 B | yes | no |
| qnfo-ops | 182,623 B | yes | no |
| qnfo-register-guard | 3,704 B | unverified | unverified |
| qnfo-pipeline-ops | 16,933 B | **NO** | no — inert by census |
| qnfo-idea-triage | 39,837 B | no | no |
| qnfo-fleet-advisor | *(no worker.js)* | — | it is a module inside qnfo-fleet-control |

**Consequence for this session's work:** every fix I staged for `qnfo-ops` (entropy, D17 terminal
write, public route, `terminal_at`) targets a worker that IS in the census but is 182,623 B — blocked
by the read cap, not by deployability. Those fixes need a `wrangler deploy` or a write path that can
handle >32 KB. That part of my earlier conclusion survives; the *reason* I gave was wrong.

## 5. What this unblocks

The three fixable workers are the only ones where this endpoint can close a loop end-to-end today.
`qnfo-social` already carries a fix from an earlier session (`v0.5.3-failclosed`) — evidence the
channel is used and works.

For `qnfo-signal-loop` and `qnfo-ddocs-indexer` I have sizes but **no identified defect**. I did not
read them, so I make no claim that either needs a change. They are candidates, not findings.

## 6. Limits

- **`qnfo-social`'s convergence could have been a human `wrangler deploy`**, not the control plane. I
  cannot distinguish. The one-hourly-cycle timing is consistent with the scanner, but that is
  circumstantial. §2's three tests are the stronger evidence, and they only show the gate exists.
- **The census is not directly readable.** `fleet_drift_report` shows 19 distinct workers in the
  13:00 scan; `fleet_status` reports 55; a prior session recorded 81 from `qnfo-observability/fleet.js`.
  Which of these is "the census" is unresolved — I used the drift rows, which is the store the
  scanner writes.
- **I did not read `qnfo-fleet-control`'s `canonical()`/census code** (75,875 B, past the cap). The
  census-gating mechanism is inferred from the three tests in §2, not from source.
- **The 19-worker list included a `SCAN` pseudo-row**, so the true distinct-worker count may be 18.
- `qnfo-register-guard` is 3,704 B but I did not verify census membership, so its fixability is
  unknown rather than "yes".
- **My earlier INCOMPLETE lines asserted a false blocker.** The correct residual blocker is: (a) the
  32,768-char read cap for large workers, and (b) census membership for non-census workers — not the
  absence of a deploy path.
