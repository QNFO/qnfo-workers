# qnfo-research-exec

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: version_queue drain: Zenodo publishV2 + PDF + KG
> Canonical source: this directory (QNFO/qnfo-workers)
> Version: worker.js VERSION + /health (see fleet-drift scan)

Deployed-current discipline: deployed-current.worker.js mirrors the live bundle;
regenerate via: wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js

## Zenodo version requests (ZENODO-VERSION-REQUESTS-1, 0.9.36)

Each cron run publishes at most one pending row of `qnfo-audit.zenodo_version_requests`
(schema: `migrations/2026-10-01-zenodo-version-requests.sql`): a new version of `record_id` whose files are
replaced by `files_json`, with `metadata_json` merged over the previous version's metadata. File URLs must be
`https://raw.githubusercontent.com/{rwnq8|QNFO}/<repo>/<40-hex commit>/<path>`. Queue a request with a D1 insert;
the row moves `pending -> publishing -> published | error` and records `result_doi` (or `error` and `draft_id`).
Offline test: `node qnfo-research-exec/zenodo-version-requests.test.mjs`.

## Zenodo metadata edits and creator identity (ZENODO-METADATA-EDITS-1, ZENODO-IDENTITY-1, 0.9.41)

New papers carry the creator as `Quni-Gudzinas, Rowan Brad` with affiliation `QNFO (independent research)` (STRATEGY-1
s2.2). The same queue now has a `kind` column (`migrations/2026-10-01-zenodo-version-requests-kind.sql`): `kind='metadata'`
rows edit a published record in place, setting the ORCID-matched creator's name and affiliation from
`metadata_json.creator_by_orcid`. Each run handles up to 8 such rows after the one version request; a record already
canonical is marked `unchanged` without an edit, and any failure after `edit` discards it.
