# D1 restore runbook (D1-RESTORE-RUNBOOK-1)

Charter pillar: core. Fix 14 of the owner's Workers reliability list (2026-10-12). This is the procedure for rewinding a fleet
D1 database with Time Travel, and the record of what Time Travel does not cover. The commands and limits below were read
from Cloudflare's documentation on 2026-10-12 (links at the end); re-read them before a restore, because limits change.

## What Time Travel gives, and its limits

| Fact | Value | Source |
|---|---|---|
| Restore window | any minute in the last 30 days on Workers Paid (7 days on Free) | D1 limits, Time Travel reference |
| Restore rate | 10 restores per 10 minutes, per database | D1 limits |
| Scope | the whole database, in place; it is a destructive operation | Time Travel reference |
| In-flight queries | cancelled, with an error returned to the client | Time Travel reference |
| Undo | the restore returns the bookmark of the state before it; restore to that bookmark to undo | Time Travel reference, REST API |
| Which databases | only `version: production` databases (check with `wrangler d1 info <name>`); alpha databases use the old snapshot API | Time Travel reference |
| Longer than 30 days | not covered: export the database and keep the file | Time Travel reference |

A restore rewinds **every table for every worker bound to that database at once**. `qnfo-audit` is bound to most of the fleet
and held 505 tables in 355 MB on 2026-10-12, including the issue ledger, the registries, `ops_config` (the switches) and
`migration_runs`. Rewinding it also rewinds those: an issue closed after the restore point is open again, a switch flipped
after it flips back, and a migration applied after it is recorded as never applied.

## Databases

| Database | id | Notes |
|---|---|---|
| qnfo-audit | `35e2e573-92f3-46ac-83c6-22f6429fc5e5` | shared control plane; restore last, never first |
| q08-signal | `10fd74b7-c4b3-43c7-9ca5-855213f44a69` | |
| living-paper | `70a58cb3-b2cd-498d-877f-ecca86859a22` | |
| personal-life | `e8d6c61a-10b7-4086-b81e-9e6e85afa407` | private plane |
| portfolio-state | `d80fdf2a-0a60-45a3-968b-2907ce806dcd` | |
| qnfo-graph | `a1954b92-d681-4d02-b1f6-f9a2eb4c265d` | |
| ipatent-db | `19cc87d6-4207-477c-bf8c-94fb231b8965` | |
| qnfo-cms | `0458a344-090d-4264-a0e0-c95d7fa237f3` | |
| qnfo-identity, qnfo-outreach | read the id from the account | private: never print their rows into a log, an issue or a pull request |

## Before you restore: is a restore the right tool?

Time Travel is the right tool when a database is broadly wrong (a bad migration, a runaway loop that rewrote many tables)
and the damage is younger than the work you would lose. It is the wrong tool for one bad table: every other table loses
its newer rows too. For one table, prefer in this order:

1. The `BACKUP:` table the migration named (MIGRATION-RUNNER-1 requires one for every DELETE or DROP).
2. A `bak_<date>_<what>` table a session or loop wrote before a data repair.
3. The daily logical snapshot (`scripts/continuity_snapshot.py`): R2 `qnfo-backups/continuity/qnfo-audit/<ts>/<table>.jsonl.gz`
   for the 22 state tables of `qnfo-audit` only (see "What is not covered").
4. Reading the old rows from a point in time without restoring: there is no read-only Time Travel query. The only way is a
   restore into place, so copy what you need out afterwards and undo (step 6) if the rewind was only for reading.

## Procedure

The fleet has no `wrangler` login in a session and no fleet-wide write freeze switch (checked 2026-10-12: `ops_config` holds
per-loop switches only). Use the REST API with the repository's `CLOUDFLARE_API_TOKEN` from a GitHub Actions run, or
`wrangler` from a machine that is logged in to the account. Both forms are given.

**1. Record the current bookmark (the undo point).** Do this before anything else and write it on the issue.

```sh
npx wrangler d1 time-travel info <database_name>
# REST (this is the call scripts/continuity_snapshot.py makes every day):
curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database/<database_id>/time_travel/bookmark"
```

The newest daily bookmark is also in `qnfo-audit.continuity_snapshots.time_travel_bookmark` (for `qnfo-audit` only).

**2. Find the restore point.** Pick the last minute before the damage, in UTC. `migration_runs`, `decision_log`,
`issue_lifecycle` and the GitHub merge time of the change that caused it give the time. Resolve it to a bookmark so the
restore is exact and repeatable:

```sh
npx wrangler d1 time-travel info <database_name> --timestamp="2026-10-12T08:00:00+00:00"
curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database/<database_id>/time_travel/bookmark?timestamp=2026-10-12T08:00:00Z"
```

`--timestamp` takes a Unix timestamp or an RFC 3339 / ISO 8601 date-time.

**3. Quiet the writers.** There is no single freeze, so reduce what will be lost or re-broken:

- Stop the cause first: revert the change that did the damage through the canonical path (a merged revert), or it will
  redo the damage after the restore.
- Queries in flight are cancelled by the restore. Crons that fire during it fail that tick and run again on the next;
  nothing has to be stopped for the restore to succeed.
- Anything written between the restore point and the restore is lost. Copy out what must survive first (new issues,
  owner cards, decisions): `SELECT` the rows with `created_at` after the restore point into a file, to re-insert afterwards.
- For `qnfo-audit`, expect `issue_lifecycle` accounting (`v_issue_accounting`) to be consistent after the restore, because
  the ledger and the issues rewind together. Rows you re-insert by hand need their lifecycle rows too.

**4. Restore.**

```sh
npx wrangler d1 time-travel restore <database_name> --bookmark=<bookmark from step 2>
# or by time:
npx wrangler d1 time-travel restore <database_name> --timestamp=<unix seconds or RFC 3339>
# REST:
curl -sS -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database/<database_id>/time_travel/restore?bookmark=<bookmark>"
```

The answer carries `bookmark` (the state after the restore) and `previous_bookmark` (the state before it). Write both on
the issue. Do not run a second restore to "adjust": the limit is 10 per 10 minutes per database, and each one cancels
queries again. Decide the point in step 2.

**5. Verify with measurements, not with the absence of an error.**

- The damaged table has its rows back: a `SELECT COUNT(*)` and a spot check of known rows.
- `SELECT MAX(ts) FROM fleet_tick` (for `qnfo-audit`) moves forward again within one cron cycle: the loops are writing.
- `SELECT file, status FROM migration_runs ORDER BY id DESC LIMIT 10`: a migration merged after the restore point is no
  longer recorded. Its file is still on main, and the runner applies a file only when it merges, so re-apply each one
  through `apply-migrations.yml` (`workflow_dispatch`) in merge order, or the schema and the code disagree.
- `ops_config`: compare the switches with what they were before the restore (step 3 copy) and set back any that were
  flipped on purpose after the restore point.
- `GET https://fleet.qnfo.org/api/watchmaker` and `GET https://qnfo-fleet-control.q08.workers.dev/loops` answer and report
  no new stale loop after one hour.

**6. Undo, if the restore was wrong.** Restore to `previous_bookmark` from step 4 (or the bookmark from step 1). Per the
documentation, a bookmark older than your last restore stays valid, so an undo is always possible inside the 30 days.

**7. Record it.** One `decision_log` row (assumption, action, evidence, outcome, blast radius, rollback path = the
`previous_bookmark`), the issue's `issue_triage.close_evidence` with the measurements from step 5, and a `failure_modes` row
for the cause with its `fm-<key>` detector, in the pull request that fixes the cause.

## What is not covered (measured 2026-10-12)

- **Beyond 30 days there is no full copy of any fleet database.** `scripts/continuity_snapshot.py` (CONTINUITY-SNAPSHOT-1,
  daily, from the remediation-consumer workflow) writes a logical snapshot of 22 state tables of `qnfo-audit` to R2 and the
  public-safe subset to an Actions artifact. It does not read the other 483 tables of `qnfo-audit`, and it does not read
  q08-signal, living-paper, personal-life, portfolio-state, qnfo-graph, ipatent-db, qnfo-cms, qnfo-identity or
  qnfo-outreach at all. Each table is also capped at 30,000 rows per snapshot (`PAGE` 500 x `MAX_PAGES` 60); a larger table
  is recorded with integrity below 1, not copied whole.
- `scripts/cf_ops_actions.py d1-backup` makes a full SQL dump, but only for the allowlisted databases being retired (D1-FOLD-1).
- A D1 export "will block other database requests" while it runs (import/export documentation), which is why the daily
  snapshot pages by rowid instead. A full export of a busy database belongs in a quiet hour, per database.
- A deleted database is not something this runbook restores: the Time Travel reference describes restoring a database
  that exists. Treat `delete-d1` as final and rely on its verified backup (D1-FOLD-1).

The gap is filed as `D1-EXPORT-BEYOND-TIME-TRAVEL-1` in `qnfo-audit.agent_issues` with a code task for
`scripts/continuity_snapshot.py`.

## Failure modes of this procedure

- **The restore point is guessed.** A point after the damage restores the damage; a point far before it loses a day of
  work. Resolve the time from a ledger row, not from memory.
- **The cause is still deployed.** The loop or migration that broke the data breaks it again within one cycle.
- **`qnfo-audit` is restored to fix another database's problem.** The databases rewind independently; a row in one that
  points at a row in another (an issue naming a paper id, a portfolio row naming an issue) can dangle afterwards.
- **Migrations are forgotten.** The code on main expects columns the rewound database no longer has.

## Sources

- Time Travel reference: https://developers.cloudflare.com/d1/reference/time-travel/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- REST API, restore: `POST /accounts/{account_id}/d1/database/{database_id}/time_travel/restore` (query `bookmark` or
  `timestamp`), https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/
- Import and export: https://developers.cloudflare.com/d1/best-practices/import-export-data/
