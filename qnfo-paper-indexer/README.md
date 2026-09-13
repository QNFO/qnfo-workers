# qnfo-paper-indexer

Canonical repo dir for the merged `qnfo-paper-indexer` worker (corpus indexing +
citation impact; absorbed `qnfo-impact` 2026-09-13).

## Purpose

Two halves, one worker, two cron entries:

1. **Corpus indexing** — chunks `living-paper.papers.body_md`, embeds with
   `@cf/baai/bge-base-en-v1.5`, upserts into the `PAPER_VZ` Vectorize index, and
   records per-slug state in `living-paper.index_state`. Routes `/webhook?slug=`,
   `/index?offset=&limit=`, `/count`. Cron `5 6 * * *`.
2. **Citation impact** — crossref / openalex / zenodo citation+download collection
   into `qnfo-audit.citation_stats` + `qnfo-audit.impact_scores`. Routes `/run`,
   `/stats`. Cron `0 4 * * *`.

`/health` reports `features` and binding booleans; it is unauthenticated.

## Bindings

`AI` (Workers AI), `LIVING_PAPER` (living-paper D1), `QNFO_AUDIT` (qnfo-audit D1),
`PAPER_VZ` (Vectorize). Auth on `/webhook`, `/index` and `/run?commit=1` is via
`X-Index-Token` / bearer against `env.INDEX_TOKEN`.

## Deploy method

**UNKNOWN / contested.** There is no `wrangler.toml` in this directory, so this
dir is not the deploy source. `deployment_history` holds **0 rows** for this
worker (verified 2026-09-13) and `cloud_ops_events` holds 0 rows mentioning it.
At least three bundles have been deployed by different sessions with no recorded
provenance; see `agent_issues` id 817.

## VERSION — DO NOT NORMALIZE

Three version values are live for this one worker and they do not reconcile:

| Source | Value | Verified |
|---|---|---|
| live `/health` | `2.1-gateway-routed` | fleet probe 2026-09-13T17:21:45Z |
| `service_registry.version` | `2.1-gateway-routed` | registry read 17:01:31Z |
| `fleet_drift_report.deployed_version` | `2.2.0+scheduled-daily` | drift rows 16:04:49Z, 17:03:54Z |
| this dir, `/health` literal | `3.0.0-merged-impact` | `worker.js` sha `4fbd87f` |
| this dir, `var VERSION` | `0.1.0` | `worker.js` sha `4fbd87f` |

`worker.js` declares **two** version literals: `var VERSION = "0.1.0"` (left over
from the absorbed `qnfo-impact` body) and a hardcoded `"3.0.0-merged-impact"` in
the `/health` and `/cron/debug` responses. The drift scanner reads the `VERSION`
constant, which is why its `canonical_version` flipped to `0.1.0` on 2026-09-13
16:04:49Z.

**Do not tidy either literal into a different semver.** The drift scanner
classifies canonical-vs-deployed from these strings; changing the ordering can
flip the polarity to *canonical-ahead* and arm a redeploy that would overwrite
the live bundle (see `obsidian-writer/deployed-current.worker.js` for the same
warning, and `agent_issues` id 803 SEMVER-NORMALIZATION-HAZARD). Reconcile the
version *sources* first, then land one release with recorded provenance.

## Verified defect: index cron dead since 2026-09-09

Measured 2026-09-13 from D1, same-turn:

- `living-paper.index_state` newest `indexed_at` = `2026-09-09 06:02:07`; prior
  clusters are `2026-09-08 06:00:xx` and `2026-09-07 06:01:xx` — i.e. the
  `5 6 * * *` cron was landing daily and then stopped.
- 19 papers inside the cron's own window (`ORDER BY slug LIMIT 300`, the window
  `handleIndex` actually uses) have `updated_at > '2026-09-09'` and were never
  re-indexed. 104 papers corpus-wide changed over the same interval.
- The impact half is alive: `citation_stats` max `collected_at` =
  `2026-09-13T04:00:46Z` (1,512 rows / 79 DOIs).

So the live bundle runs the `0 4 * * *` impact branch and not the `5 6 * * *`
index branch. The RAG corpus has been indexing-stale for 4.5 days.

Second, independent coverage bug in the repo body: the cron calls `handleIndex`
with a hardcoded `offset=0&limit=300`, so it can only ever cover the first 300 of
505 papers-with-body; the returned `done` flag and the `/index` pagination
contract are ignored by the scheduler.

## Known repo-body issues (not fixed here)

- Plaintext `var INDEX_TOKEN = "chnx-idx-v1-k9m2n4p7r5t8"` is committed in
  `worker.js` and accepted as an alternative to `env.INDEX_TOKEN`.
- `worker.js` and `deployed-current.worker.js` are byte-identical (sha
  `4fbd87f`) although the live bundle is a different body — the MIRROR-SHADOWS-
  CANONICAL shape (agent_issues id 786).
- No `wrangler.toml` in this dir.

## Evidence pointers

- `agent_issues` 817 (version sources / ownership), 786 (mirror shadows canonical),
  803 (semver normalization hazard), 758 (drift vs health disagreement).
- `fleet_drift_report` rows 1589-1756 for this worker.
