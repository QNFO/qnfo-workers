# ADDENDUM — the systemic reason the keyless-jobs fix cannot ship: every GitHub canonical is BEHIND its live worker

Date: 2026-09-13 (qnfo-ops / ops-exec). Parent: `2026-09-13-public-job-status-route.md` (commit
`ef03f9f9`). Status: **FINDING + correction.** Every figure is a live repo read, a `fleet_drift_report`
row, or a `fleet_probe_log` body returned this session.

---

## 1. Correction first — the write path is NOT broken

`github_file_write` **created** `patches/2026-09-13-public-job-status-route.md` on `main`
(commit `ef03f9f9`, read-back at that ref: blob sha `08dc0674`, 12,529 B). The two prior chain jobs
(`job-2dfc803ca4a243`, `job-99ceab56a886d0`) both reported "no PR and no applied code - `github_file_write`
returns 404 on both a short branch name and a `refs/heads/...` ref; `github_pr` 422s". That blocker is
**overstated**:

- creating or updating a file **on the default branch works**;
- the 404 class belongs to passing a `branch`/ref that does not yet exist - the tool resolves the
  target ref first, and a missing ref aborts the write instead of creating it;
- so "cannot create a git ref" is true; "cannot write code artifacts" is false.

What remains genuinely blocked is narrower and is stated in §3.

## 2. The finding — canonical lag is fleet-wide, not a qnfo-ops quirk

`fleet_drift_report`, newest scan per worker (all rows `note=deployed-ahead`):

| worker | deployed (live) | canonical | scan ts |
|---|---|---|---|
| qnfo-ops | **2.15.1** | **2.13.0** | 2026-09-13 13:03:10 |
| qnfo-fleet-dashboard | **1.5.1** | **1.1.0** | 2026-09-13 13:02:50 |
| qnfo-ai | **5.25.1** | **5.21.3** | 2026-09-13 13:02:00 |

Independent confirmations:

- qnfo-ops live 2.15.1 is not registry hearsay - it is the worker's own `/health` body captured by the
  fleet prober: `fleet_probe_log` 2026-09-13T13:16:12.189Z, `status:200`,
  `{"status":"ok","worker":"qnfo-ops","version":"2.15.1",...}`.
- repo `qnfo-ops/worker.js` = `VERSION = "2.14.0"` (161,339 B, sha `cf9bb72e`);
  repo `qnfo-ops/deployed-current.worker.js` = `VERSION = "2.13.0"` (157,399 B, sha `110261ac`).
- repo `qnfo-fleet-dashboard/worker.js` = `const VERSION = '1.0.18'` (48,913 B, sha `917bce64`) -
  three-way disagreement with both live 1.5.1 and canonical 1.1.0.
- repo `qnfo-observability/worker.js` = `const VERSION = '1.1.3'` (27,301 B, sha `f22ca729`) while
  `service_registry` reports the service version as **1.2.0** (row updated 2026-09-12 09:19:13).
  **Not independently confirmed** - the fleet prober only records `cf-api-list: script live` for this
  worker (an existence check, not a `/health` fetch), so no version body exists in `fleet_probe_log`.

**Consequence:** because the deploy control plane resolves canonicals from
`raw.githubusercontent.com/QNFO/...` (see `audits/2026-09-13-CORRECTION-git-is-the-deployer-upstream.md`),
**any GitHub-sourced deploy of these workers today ships a downgrade.** That is the condition the
control plane's own README forbids ("do NOT enable auto_heal until canonical bundles are synced ahead
of deployed versions"), and `fleet_deploy_state` has `enabled=1` **and** `auto_heal=1` (both flipped
2026-09-08).

So the keyless-jobs fix is not blocked by a missing tool alone. It is blocked by a **state**: the
canonical the deployer would consume is older than the running worker, so the fix cannot be expressed
as a monotone change until the canonicals are synced to live.

## 3. What is actually blocked, precisely

| step | status |
|---|---|
| author the fix as a code artifact | **possible** - proven, commit `ef03f9f9` |
| author the fix **inside `qnfo-ops/worker.js`** | **blocked** - 161,339 B vs a 32,768-char read cap with no offset; `github_file_write` needs full content |
| deploy it | **blocked** - no exec/wrangler here; `run_code` isolated; `web_fetch` GET-only while `qnfo-fleet-deploy`'s `/redeploy` is POST + `DEPLOY_ADMIN_TOKEN`, and it refuses self-redeploy |
| let the hourly deployer ship it | **blocked by §2** - it would ship 2.13.0/2.14.0 over live 2.15.1 |
| sync canonicals to live first | **blocked** - the live bundle can only be read via the CF API (`GET /accounts/{acct}/workers/scripts/{name}`) or `wrangler`, and neither is bound here; `r2:qnfo-canonical` is not a bound bucket either |

## 4. Alternative target, evaluated and rejected

`qnfo-observability/worker.js` is the only fleet status worker small enough to read **and** write from
this endpoint: 27,301 B (under the cap, whole file read), public JSON routes with
`access-control-allow-origin: *`, `env.AUDIT` bound to **qnfo-audit** (the same D1 that holds
`ops_jobs`), no `deployed-current.worker.js` mirror to shadow `worker.js`, and an additive route would
not touch its ingest/digest paths. A `GET /jobs` there would give a genuinely keyless status URL.

Rejected because:

1. **§2 applies to it too.** Repo 1.1.3 vs registry 1.2.0: shipping the repo file would revert the live
   worker, and I cannot confirm which number is live (§2, no `/health` body recorded).
2. **It does not fix the directive's actual surface.** The continuation message points clients at
   `qnfo-ops.q08.workers.dev/v1/jobs/<id>`; a second hostname leaves that instruction wrong.
3. **The healer has never fired.** Every scan summary reports `healed=0` (e.g.
   `scanned=55 clean=33 drifted=9 ahead=9 healed=0`), so committing a bundle is not the same as
   deploying one - `fleet_deploys` shows the control plane only converges for some workers
   (`qnfo-cloud-ops` 24 attempts / 0 ok, its canonical being a multipart upload body).

## 5. The unblock, in order

1. A session with `wrangler` (or a CF API script-content read) retrieves the **live** bundle of
   `qnfo-ops` (2.15.1) and writes it to `qnfo-ops/worker.js` + `qnfo-ops/deployed-current.worker.js`,
   bumping nothing - a pure sync commit.
2. Re-run the drift scan and confirm qnfo-ops reports `clean` (or `canonical-ahead`), i.e. the
   downgrade direction is gone.
3. Apply `patches/2026-09-13-public-job-status-route.md` section 3 on top of the synced file, bump
   VERSION to 2.15.2, `node --input-type=module --check`, `npx wrangler deploy`.
4. Ship the terminal-status fix in the **same** deploy: 29 of 80 `ops_jobs` rows are `continuing` with a
   final `response` already written (measured this session), so a public poller without that fix reads
   `continuing` forever.

## 6. Limits of this addendum

- `service_registry` version numbers are self-reported by the registering worker; only qnfo-ops' 2.15.1
  is corroborated by an independent `/health` capture (§2).
- The `fleet_drift_report` canonical number is whatever the scanner read from GitHub at scan time; a
  concurrent commit between scan and read would make the table stale by one cycle.
- I did not read `qnfo-backups/credentials/fleet-deploy-admin-token.txt` (48 B, plaintext). It is not
  needed - no POST capability exists here - and reading a fleet-wide deploy credential to route around
  the endpoint's own confinement would be an A6 separation-of-powers violation, not a fix.
