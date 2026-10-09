# Dissemination and open-data audit (OPEN-DATA-1)

Date: 2026-10-09. Pillar: reach. Scope: papers.qnfo.org (qnfo-gateway 3.12.0). Method: probes of the live site, then a
checklist against FAIR, OAI-PMH 2.0, schema.org, Google Scholar inclusion rules and DataCite 4.x.

## Findings and what changed

| Practice | Before | Now |
|---|---|---|
| Harvestable metadata (OAI-PMH 2.0) | none (`/oai` 404) | `/oai`: all six verbs, `oai_dc`, set `papers`, UTC seconds granularity, stateless resumption tokens (100 per page), in-band error codes, `deletedRecord=no` |
| Stable machine API | none | `/api/papers`, `/api/papers/<slug>` (adds a DataCite-style block with ORCID and SPDX licence), `/feed.json` (JSON Feed 1.1), `/openapi.json` (OpenAPI 3.1), CORS open |
| Licence on every record | schema.org `license` on paper pages | also `dc:rights` in OAI, `license_url` and `license_spdx` in the API |
| Author identity (ORCID) | JSON-LD `sameAs` for the owner | also in the DataCite block; ROR is not linked (no registered organisation) |
| Software citation | none | `CITATION.cff`, `codemeta.json` at the repository root |
| Discovery | sitemap, RSS, llms.txt, IndexNow | llms.txt lists the open-data endpoints |
| Identifier honesty | 270 deleted Zenodo DOIs printed as live links, in `citation_doi` and JSON-LD | DEAD_DOIS filter: never shown, cited or exported |

## Measured: the DOI problem

Of 441 paper pages that advertised a DOI, 279 had no DataCite record. For those, Zenodo's record API was queried: 270
answered 410 Gone (deleted), 4 resolve (kept), 1 is a non-Zenodo preprint DOI (kept), 2 timed out (kept, unverified).
`scripts/doi-liveness.py` reproduces the measurement. The filter is conservative: only a DOI with both a Zenodo 410 and
no DataCite record is hidden.

## Failure modes (adversarial)

1. The dead list is embedded in the worker. A DOI that Zenodo restores stays hidden until the list is regenerated.
   Because hidden DOIs disappear from the pages, the script cannot re-check them from the live site; re-check from the
   list itself. Owner: follow-up issue (move the list to D1 with a weekly re-check).
2. `oai_dc` carries only Dublin Core. Harvesters that want DataCite or JATS get the JSON API only.
3. Dates come from `updated_at`; a bulk re-save of every row would make every record look modified to harvesters.
4. Resumption tokens are stateless offsets; rows inserted between pages can shift a page by one record.
5. The papers are largely one author; the site is not registered with OpenAIRE or CORE, so harvesting is possible but
   not yet happening until they register the base URL (identity-bound registration).

## Not done, with owner

- ActivityPub and WebFinger: following requires an inbox that verifies HTTP signatures and signs deliveries. Filed as
  its own issue with a doer rather than shipped half-working.
- Registering `https://papers.qnfo.org/oai` with OpenAIRE, CORE and BASE is an account action in the owner's name; card
  filed.
- A replacement persistent identifier for the 270 papers (new DataCite DOI via a repository, SWHID, w3id.org): needs the
  owner's repository account; card filed.
