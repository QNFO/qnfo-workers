# Research provenance: how the fleet keeps the research record complete (RESEARCH-PROVENANCE-1)

Charter pillar: **research** (and **autonomy**: the record repairs itself). Owner question 2026-10-26: why two research repositories, are all
artifacts preserved, can they be one, how do their directories relate to the published papers, and align it all for auditing, traceability,
provenance and reproducibility. The audit and the standard live with the data, in `QNFO/qnfo-research`:
`docs/REPOSITORY-AUDIT-2026-10-26.md`, `docs/PROVENANCE-STANDARD.md`. This page is the operator's side: what the worker does, what it writes to
D1, how to see it and how to turn it off.

## The decision

`QNFO/qnfo-research` is the single research record. `QNFO/qnfo-ensemble-research` was imported under `runs/` with its history (git subtree) and
is archived after the catch-up. DECISION-AUTOPROCEED-1: recorded in `decision_log` with its revert path (migration
`2026-10-26-research-provenance-ledger.sql`).

## What the worker does (qnfo-research-exec 0.35.0)

| When | What | Where it shows |
|---|---|---|
| a paper is published (publishStageV2) | its run and its paper in one commit, retried on the new head, blob ids compared, manifest read back | `research_run_ledger` row, event `github`, `GET /repo-ledger` |
| a revision is published (publishV2) | `papers/<slug>/` updated, a snapshot appended to `provenance.json` | event `repo-paper` |
| a claim-integrity correction or retraction | same writer, with a `corrected` / `retracted` event on the paper's record | `provenance.json` events |
| every 10 minutes (`repoSyncTick`) | retry deposits that errored (2 per tick), restore listed gaps (30 checks, 3 papers per tick), compare `research_repo_sync_batch` papers with git | event `repo-sync` |
| every 10 minutes (`repoCatchupTick`, consolidated layout only) | while `qnfo-ensemble-research` has cycles that `runs/` lacks, or its history is not yet an ancestor of `main` (the import PR is squash-merged: the repository merges squash-only): dispatch `ensemble-catchup.yml` in `QNFO/qnfo-research` (at most every 6 hours); when nothing is missing, the history is linked and 3 consolidated deposits are ledgered: one `archive-request` row in `portfolio_actions` for `QNFO/qnfo-ensemble-research` | event `repo-sync` (`catchup`), `portfolio_actions` |

Before `QNFO/qnfo-research` carries `provenance/IMPORT.json` the target is the legacy repository (runs only). The marker is the only
coordination between the repository change and the deploy; order does not matter.

## Seeing it

```
curl https://qnfo-research-exec.q08.workers.dev/repo-ledger          # status counts, last 10 deposits, current failures
SELECT status, COUNT(*) FROM research_run_ledger GROUP BY status;       -- qnfo-audit
SELECT * FROM v_research_run_deposit_failures;                          -- expected: no rows (detector fm-research-run-deposit)
python3 tools/provenance.py verify                                      -- in QNFO/qnfo-research: integrity, completeness, linkage
```

## When the history link fails

`repoCatchupTick` only dispatches `ensemble-catchup.yml` in `QNFO/qnfo-research` (at most every 6 hours) and records the time; it does not read the run.
The failure is seen by the detector `fm-research-catchup-failed` (migration `2026-10-26-research-catchup-failure-mode.sql`, `external-https`): it passes
while the latest completed run of the workflow concluded `success`. The first run (2026-10-26 08:11Z) failed on a `runs/README.md` conflict (the legacy
README had become a notice); the step is now `tools/ensemble_catchup.sh` in that repository, with offline tests (`tools/test_catchup.py`). To recover:
read the failed run's log, fix the script or the conflicting file there by pull request, then dispatch the workflow by hand (do not wait for the 6 hour
pacing; `UPDATE ops_config SET value = '0' WHERE key = 'research_repo_catchup_at'` lets the next tick do it). A conflict inside a `runs/cycle-*` path stops
the run on purpose: it means a run's record diverged and a person or a fix decides which side is true. Pushes made by the workflow's own token do not
start `provenance.yml`, so run `python3 tools/provenance.py verify` on `main` after a catch-up.

## Turning it off (no deploy)

```
UPDATE ops_config SET value = 'legacy' WHERE key = 'research_repo_target';   -- runs go to the legacy repository again
UPDATE ops_config SET value = 'off'    WHERE key = 'research_repo_sync';     -- stop the paper-text sync
UPDATE ops_config SET value = 'off'    WHERE key = 'research_repo_restore';  -- stop the gap restore
UPDATE ops_config SET value = 'off'    WHERE key = 'research_repo_archive';  -- do not file the archive request
```

Every write is a git commit: a bad one is reverted with `git revert` on `QNFO/qnfo-research`; nothing is deleted by the worker.

## Limits stated plainly

* A deposit proves the bytes are in git as the worker had them; it does not prove the paper is true. `landed-unverified` means the commit is on
  the branch but the manifest could not be read back within three tries; it is not retried (it landed) and the repository verifier decides.
* The models in a v2 manifest are the configured ones (`WRITER_MODELS`, `MODELS`), not the model that answered each call.
* The restore tick accepts a run file only if its sha256 equals the one the old manifest recorded. A file R2 holds in another version is
  recorded `unrecoverable` with that reason, not written.
* Archiving the old repository is the worker's request and the portfolio loop's act (`PORTFOLIO-ARCHIVE-1`, reversible: GitHub unarchive);
  `research_repo_archive = off` stops the request. Software Heritage needs no request: it visits `QNFO/qnfo-research` on its own (full visits
  2026-08-17, 2026-10-21) and has never seen the legacy repository, which is why the archive request waits for the history to be linked into `main`.
