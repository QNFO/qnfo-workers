# qnfo-research-exec

> Self-doc header (FLEET-SELF-DOC-1)
> Purpose: research pipeline and version_queue drain (in-house publishV2 + KG + R2 + GitHub copy)
> Canonical source: this directory (QNFO/qnfo-workers)
> Version: worker.js VERSION + /health (see fleet-drift scan)

Deployed-current discipline: deployed-current.worker.js mirrors the live bundle;
regenerate via: wrangler deploy --dry-run --outdir dist && cp dist/worker.js deployed-current.worker.js

## Publishing (NOZ-DOI-1, 0.12.3)

A paper is published in-house: its papers.qnfo.org page is its address, and `doi`, `zenodo_doi` and `zenodo_url` are written NULL on
every new or revised paper row. The version_queue drain (`publishV2`) updates the papers row, the knowledge-graph node
(`paper:<slug>`), the R2 copy and the GitHub copy, and queues the social post; it calls no outside registrar. The earlier
deposit, version-request, metadata-edit and related-link stages are removed. Offline test: `node qnfo-research-exec/inhouse-publish.test.mjs`.

## Research repository deposit (REPO-DEPOSIT-1, 0.35.0)

A run and its paper are written to `QNFO/qnfo-research` as **one Git Data API commit** (`repo-deposit.mjs`, inlined into `worker.js`
between the `REPO-DEPOSIT-BEGIN/END` markers; `node qnfo-research-exec/inline-repo-deposit.mjs` re-inlines it): `runs/cycle-N/<slug>/`
(grounding, drafts, the reconciled paper, reviews, verification, `MANIFEST.json` v2, `ro-crate-metadata.json`) plus `papers/<slug>/`
(or the `programFor` directory) with `paper.md`, `README.md` and `provenance.json`. A refused ref update is retried on the new head, GitHub's
blob id is compared with ours, and the manifest is read back at the new commit; a deposit is reported `ok` only after both. Every attempt is a
`research_run_ledger` row (D1), `GET /repo-ledger` reads it, `fm-research-run-deposit` expects 0 failures.

The 10-minute tick (`repoSyncTick`) also retries a deposit that errored, restores the gaps listed in the repository's
`provenance/known-gaps.json` (a run file only if its sha256 equals the manifest's), and compares `research_repo_sync_batch` published papers
with their git copy, committing the ones that differ. Until `QNFO/qnfo-research` carries `provenance/IMPORT.json` a run goes to the legacy
`qnfo-ensemble-research` (still atomic, v2 manifest) and no paper text is written. ops_config: `research_repo_target` (auto | legacy |
consolidated), `research_repo_sync`, `research_repo_restore`, `research_repo_archive`, `research_repo_sync_batch`; off/legacy revert it without a deploy.
`repoCatchupTick` finishes the consolidation: it dispatches the `ensemble-catchup.yml` workflow while the legacy repository has cycles `runs/` lacks or its
history is not yet an ancestor of `main` (the repository merges squash-only, so the import PR drops the imported commits; the workflow links them with a
content-neutral merge) and, once none are missing, the history is linked and 3 consolidated deposits are ledgered, files one `portfolio_actions` archive
request for the legacy repository (PORTFOLIO-ARCHIVE-1).
Suites: `repo-deposit.test.mjs` (module, fake Git Data API with a concurrent writer, a lost response, 5xx, a corrupt blob, a byte-identical
parity golden shared with `tools/provenance.py`) and `repo-deposit-wiring.test.mjs` (the real worker functions). Operations:
`docs/RESEARCH-PROVENANCE.md`.

## Accuracy layer (ACCURACY-GROUND-1, 0.12.0, owner directive 2026-10-10)

Generated text states only what the text it was given states. Instructions specify process and style, never topics or example nouns.

- Writer, reconcile and review preambles: every statement about a cited work must be derivable from that work's supplied bibliography entry; a thin entry is said to be thin; an unsupported statement about a cited work or the outside world is a HARD review finding.
- Reviser member (qnfo-paper-reviser 1.3.x): the auditor's `low` label is not trusted. `guardSeverity` demotes a `low` edit to `high` (flagged, recorded as an unconfirmed internal erratum, never applied) unless its category is a surface category (prose, format, meta, changelog), its replacement is at most 240 characters, every name, figure, year and link in it already occurs in the paper, and at most two content words are new. A terminology bridge between fields is an assertion and is `high`.
- Errata members (errata-hub 1.5.x, respond 0.5.x): `enforceCorrectionGrounding` makes a draft high risk (never sent by errata-publish) when its clarification, acknowledgement or changelog holds a name, year, figure, DOI or link found in neither the errata email nor the paper; a corrected reference must therefore come from the email or the paper. The classifier's `paper_doi` must occur in the email.
- The deterministic check is `ungroundedTerms`, the same method as q08-signal-engine `groundingProblems` (Q08-VERIFY-1). Suites: `ground.test.mjs` here, `qnfo-paper-reviser/ground.test.mjs`.
