# ADDENDUM — hard capability limits, and root causes resolved by cross-check
Date: 2026-09-13 (UTC), after the main audit. Executor: qnfo-ops. All figures are tool returns.

## A1. The disarm is written and read back; cron-level proof is still pending

| check | value |
|---|---|
| written | `ops_d1_write` `UPDATE fleet_deploy_state SET value='0' ... WHERE key='auto_heal'` -> `changes:1` |
| read back | `auto_heal = '0'`, `updated_at = 2026-09-13 14:15:02`; `enabled` still `'1'` (set 2026-09-08) |
| source semantics | `scheduled()` -> `var heal = await autoHeal(env)` -> `scan(env, heal)` -> `if (heal && !usedHealth) redeploy(...)` |

**Not yet empirically confirmed.** The scan cron is `0 * * * *` on `qnfo-fleet-control`. The last scan
completed 14:05:46 (`fleet_drift_report` id 1708); my write landed 14:15:02, i.e. *after* it. The next
scan is 15:00. This session ended at ~14:17, so **the post-change scan has not run and I did not observe
it.** What is established is the written value and the source that reads it; the confirming observation is
a 15:00+ scan row with `healed=0` and no new `personal-companion` row in `fleet_deploys`.

## A2. The `personal-companion` canonical CANNOT be reconciled from this endpoint

This was the one remaining root-cause fix that looked executable. It is not.

| file | size | blob sha | VERSION |
|---|---|---|---|
| `personal-companion/worker.js` | 62,666 B | `c06edffb22f3cefeed2d7568e1a7275f076320cc` | `"1.0.0"` |
| `personal-companion/deployed-current.worker.js` | 62,666 B | `c06edffb22f3cefeed2d7568e1a7275f076320cc` | `"1.0.0"` |

**Identical blob sha.** The repo holds two copies of the same v1.0.0 build. Production runs **v1.1.0**
(`reading.q08.org/health`). Therefore **the v1.1.0 source does not exist in the repository**, and the
correct canonical — `>= v1.1.0` *and* exporting `GenerationFlow` — cannot be produced by editing these
files. Writing a file labelled `v1.1.0` from the v1.0.0 body would be fabrication, and would replace a
working production build with a stale one the moment `auto_heal` is re-enabled.

Additional hard limit: the read tool returns at most **32,768 characters** (`maxChars: 70000` did not
raise it). `worker.js` is 62,666 B, so **more than half the file — including every route handler
(`/`, `/p/<slug>`, `/api/pieces`, `/feed.xml`, `/health`) and the module export at the end — is
unreadable from this endpoint.** No patch to those can be written or reviewed here.

The v1.1.0 artifact must come from a source this endpoint cannot reach (CF API
`/workers/scripts/personal-companion/content/v2`, which requires `CF_DEPLOY_TOKEN`, or deploy history).

## A3. `version_queue` root cause — resolved by cross-check

In the main report §4 I recorded `version_queue` id=18 as "stuck 2 days" without a cause. Concurrent
session issue **706** supplies it: `NL is not defined` in `qnfo-research-exec` blocks the v2-drain.
Independently corroborated:

| measurement | value |
|---|---|
| `version_queue` MAX(updated_at) where status='published' | **2026-09-11 10:16:31** |
| published rows | 16 |
| rows since | **0** — nothing has published in ~52h |
| stuck row | id=18, `drafted`, created 2026-09-11 10:22:29, `recover_count=1` |

So id=18 is not individually broken: **the entire publish drain has been dead since 2026-09-11**, and
id=18 is simply the first row queued behind it. Reported block time in issue 706 is 2026-09-11T12:41Z,
whereas my last successful publish is 10:16:31Z — a ~2.4h discrepancy I cannot resolve from here and am
not asserting away. Either way the drain has produced nothing for two days.

## A4. `qnfo-observability` — the fix is real but I am not shipping it blind

`worker.js` is 29,719 B (under the 32,768 ceiling, so readable) and imports `./fleet.js` (2,596 B), which
the deployer's single-module upload cannot resolve. Inlining `FLEET` would make it deployable.

**I deliberately did not do it.** To write the file I must reproduce ~29,719 bytes exactly through this
channel; a single transcription error would corrupt the canonical of a worker that is currently
**functioning** (invoked hourly, req24=143). With `auto_heal=0` nothing auto-deploys, so the blocked 1.1.4
upgrade is inert — the blocker is not urgent, and the downside of a silent corruption is worse than the
upside of removing an inert blocker. The correct fix is in the deployer (bundle all modules), which needs
a deploy route. This is a judgement, stated so it can be overruled.

## A5. Concurrent sessions filed the rest — I verified, I did not duplicate

Eight further issues exist that overlap my audit, all independently arrived at:

| id | title | matches my |
|---|---|---|
| 691 | `r2:qnfo-canonical/qnfo-cloud-ops.js` invalid JS -> 25 hourly failures | `fleet_deploys` id 66, same 10021 class |
| 693 | WORKER-HEALTH-FALSE-530, recurrence of closed #356 | §4 false-positive generator |
| 701 | 43 of 55 workers unprobed + second roster | §7 `healthy:null` = unprobed |
| 704 | terminal-failure-never-materializes, `rq_failed=0`, rows `queued` attempt=3 | the hourly alert loop |
| 705 | phantom "496 stuck new"; static "0/3 legs" | `idea_proposals` has **zero** `new` rows |
| 706 | `NL is not defined`, v2-drain blocked | A3 above |
| 707 | F14 async runner replays thinking-mode turns | `ops_ai_log` source=job ok=0, n=32/48h |

Backlog is now 11 open. I filed only 702 (TRACE-STALL), which was not otherwise covered.

## A6. Net: what changed vs. what is blocked

**Changed (executed, verified):** `auto_heal` 1 -> 0 (stops the hourly downgrade attempt, preserves
scanning); backlog drain run; issue 702 filed; main report + this addendum committed.

**Blocked, needs a principal with a deploy route:** comparator deploy; D6 `script_name`; multi-module
bundling; `personal-companion` v1.1.0 canonical (artifact absent, A2); `qnfo-observability` 1.1.4;
`worker-health` endpoint list; `qnfo-cloud-ops` corrupt R2 canonical; TRACE-STALL ingest.
**One row left deliberately untouched:** `version_queue` id=18 — marking it `published` would assert a
publication that has not occurred.
