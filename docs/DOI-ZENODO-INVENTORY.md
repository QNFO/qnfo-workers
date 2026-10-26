# Closed-registry and DOI inventory (DOI-ZENODO-INVENTORY-1)

Charter pillars: reach, security. Date: 2026-10-26. Task: agent_issues 100587 (owner task: "find every use of Zenodo and every DOI reference across all fleet repos, workers,
pages and data files; replace or remove them per the owner's no-Zenodo/no-DOI directive; report every location changed and every location that needs a decision").

## The directive that applies

NOZ-DOI-1 (owner directive 2026-10-10, amendment 10:09): the owner's deposit-registrar account is closed, every DOI under the 10.5281 prefix is dead, and no output may name
the registry or carry those DOIs. Amendment: third-party DOIs (Crossref, arXiv-linked, publisher DOIs) stay. The NO-ZENODO-DOI-0 to 7 programme (issues 2273 to 2278, 2301, 2307,
2448, all closed with evidence) scrubbed the workers, the stored paper text and the public pages; NO-REGISTRAR-1 (2026-10-21) put a prefix guard in the readers. This document is the
re-sweep: what still names the registry on 2026-10-26, where it sits, and what was done.

Terms used below: a "registry reference" is the word or a DOI under 10.5281 (a DOI counts once, even though its suffix repeats the word).

## Result in one table

| Plane | Measured 2026-10-26 | Disposition |
|---|---|---|
| Public web surfaces (29 URLs) | 0 references | nothing to do; the surfaces are guarded by the readers' prefix filters |
| Workers and scripts in this repository | 0 emitter candidates (every hit is a guard, a comment, a fixture, a record or a retired directory) | none |
| living-paper (papers.qnfo.org store) | 0 closed-registry identifiers on 704 published rows (doi, zenodo_doi, zenodo_url) | none |
| qnfo-audit data plane | display tables 173 field hits (paper_index 161, content_entries 7, discovery_projects 5) plus 3 research_code_libraries values | cleared with backups by migration 2026-10-26-rem-a7-doi-sweep |
| qnfo-audit ledgers and stats keyed by closed DOIs | see the table below | kept as records (decision recorded) |
| GitHub: three public repository descriptions | 3 | filed: NOZ-DOI-SWEEP-2A (fleet-control code task) |
| GitHub: QNFO/.github release-pipeline.yml calls the disabled registry workflow | 1 active workflow, last 5 runs failed | filed: NOZ-DOI-SWEEP-2B (external-repo-patch) |
| GitHub: owner-authored published-paper sources | about 1,416 files org-wide by code search | kept as provenance (no mass edit of published papers; decision recorded) |
| ignorance-audit repository (README, CITATION.cff, .zenodo.json, code strings) | 6 files | agent_issues 100576 item 6 (owner-authorised), separate pull request |

## 1. Repository scan (reproducible)

`node scripts/doi-zenodo-inventory.mjs [--json FILE] [--md FILE]` reads the tracked files (no network) and classifies every line that names the registry. Run on main at 8fb1e92c:

| Measure | Value |
|---|---|
| Tracked text files scanned | 2,903 (97 deployed-current copies of a tracked worker.js skipped, 3 binary or oversized skipped) |
| Files naming the registry | 126 files, 829 references |
| Files with a third-party DOI | 63 files, 337 DOIs (kept) |
| Emitter candidates (a non-comment, non-guard line of a worker or script) | 0 |

| Location class | Files | References | What it is |
|---|---|---|---|
| history-migration | 67 | 554 | migrations that retired the registry (ledger of what was done) |
| history-doc | 15 | 119 | handoffs, closeouts, audits, memos |
| owner-source | 10 | 78 | papers/ (references.bib and citation audits of owner papers) |
| test | 13 | 25 | fixtures that pin the guards |
| retired | 8 | 16 | directories with a RETIRED or FOLDED marker (not deployed) |
| code | 8 | 15 | guards: `NOT LIKE '10.5281/%'`, `indexOf("10.5281/") < 0`, comments |
| other / doc / generated | 5 | 22 | one JSON, two docs, docs/PORTFOLIO.md and the charter (rewritten daily by loops) |

The scan cannot see a registry DOI that reaches an output from data (the string is in D1, not in the code). Reading the code paths that copy a DOI column into outbound text found one that has no
filter: `pfCodePublish` in qnfo-fleet-control builds a new public repository's description from `research_code_libraries.companion_doi`. That is section 4.

## 2. Live public surfaces (GET, 2026-10-26 about 18:35Z)

0 references (word and prefix) on all of: papers.qnfo.org (home, `/api/papers?limit=200`, `/feed.json`, `/rss.xml`, `/sitemap.xml`, `/llms.txt`, `/openapi.json`, `/oai?verb=Identify`,
`/oai?verb=ListRecords&metadataPrefix=oai_dc`; eight paper pages read separately, the seven of the Qubit Delusion series and one Margolus-Levitin page, also read 0), qnfo.org (home, about, work-with-me, llms.txt, sitemap.xml, robots.txt), q08.org (home, sitemap),
qwav.org (home, projects, hub-deploy), fleet.qnfo.org (home and `/api/human`), reading.q08.org, ideas.qnfo.org, mind.q08.org (home and `/api/entries.json`), me.q08.org, ask.qwav.tech.
(`q08.org/llms.txt` answers 404: no such file.) The only DOIs on these pages are 32 third-party DOIs in `mind.q08.org/api/entries.json` (prefixes 10.1037, 10.1016, 10.1177, 10.1080 and others); they stay.

## 3. Data plane

living-paper (70a58cb3): `papers.doi`, `zenodo_doi` and `zenodo_url` are empty on every row of every status (704 published). Stored bodies were scrubbed by NO-ZENODO-DOI-5.

qnfo-audit (35e2e573), per table and column (closed-registry values / other non-empty values / rows):

| Table.column | Closed registry | Other | Rows | Disposition |
|---|---|---|---|---|
| paper_index.doi (+ zenodo_id 80, zenodo_url 1, related_zenodo_ids 1) | 120 | 41 (40 CHAPTER-FRAGMENT markers, 1 test) | 620 | cleared (legacy index, last synced 2026-07-13, no reader in the repository) |
| content_entries.doi | 5 | 0 | | cleared; two page bodies reworded (2 sentences) |
| discovery_projects.doi | 4 | 0 | | cleared; 3 description phrases reworded |
| research_code_libraries.companion_doi | 3 | 0 | 3 | cleared (source of three public repository descriptions) |
| zenodo_stats.doi | 575 | 0 | 575 | kept: stats of closed records, no collector (retired by NOZ-DOI-1) |
| zenodo_exit_ledger.doi | 914 | 13 | 927 | kept: the exit ledger (receipt of the mirror), a record |
| zenodo_attribution_audit.doi | 573 | 0 | 573 | kept: record |
| zenodo_version_requests.result_doi | 1 | 0 | 1,290 | kept: record |
| citation_stats.doi | 5,207 | 14 | 5,221 | kept: join key of the impact tables, no emitter reads it |
| impact_scores.doi | 122 | 2 | 124 | kept |
| paper_revision_log.doi | 459 | 373 | 1,397 | kept: the revision ledger (append-style history) |
| version_queue.paper_doi | 60 | 183 | 244 | kept: queue history |
| research_queue.doi | 47 | 0 | 1,561 | kept: queue history |
| social_threads.doi / dissemination_tracker.paper_doi | 62 / 62 | 0 | 185 / 433 | kept: posting ledgers (rows already posted are the record of what was sent; unposted rows are guarded by the NOZ-SOCIAL-GUARD-1 triggers) |
| dissemination_tracker.zenodo_url | 56 | 0 | 433 | kept: record |
| social_media_posts.paper_doi, entity_map.doi | 4, 1 | 0 | 141, 716 | kept: record |
| jnl_records.doi, jnlaudit_records.doi | 1, 22 | 0 | 1, 22 | kept: the journal watch ledgers |
| proofs.paper_doi | 12 | 0 | 15 | kept: the retired proof ledger (hash-chained events) |

Why the ledgers stay: the 2026-10-11 retirement (migrations/2026-10-11-retire-zenodo-metrics.sql) decided that these columns are internal join keys and records, and that nothing may measure, score or
show data collected from the closed registry. No collector or emitter reads them (checked by the scan and the NO-ZENODO-DOI probes). Dropping them is a data-retirement decision with a backup,
not a sweep step; it is listed as a decision below.

## 4. GitHub

- Organisation QNFO, 130 repositories. Code search (default branches) finds 1,416 files that name the registry; the first 1,000 results by repository: gitbook 530, .github 310, qnfo-workers 62, QWAV 53,
  revolutionary-quantum-guide 18, agentic-ai-deep-tech-research 10, zenodo-automation 7, ultrametric-game-of-life 6, hardware-pathway 4. These are owner-authored published-paper sources
  (`.github/publications`, `.github/releases`, `gitbook/releases`, `QWAV`) and a retired deposit tool.
- Repository descriptions that name the registry: ignorance-audit, ultrametric-lean, agentic-collapse (active, written by the fleet's own code-publish loop) and zenodo-automation,
  finite-precision-oc-convergence, biophoton-ultrametric-consilience (archived). Topics: `zenodo` on zenodo-automation (archived) and on qnfo-releases.
- Workflows in QNFO/.github: `zenodo-publish.yml` is `disabled_manually`; `release-pipeline.yml` (active) still has a job that calls it with the token secrets, and its last five runs failed.
- QNFO/ignorance-audit: README.md, CITATION.cff, .zenodo.json, pyproject.toml, `instrument.py` and `__init__.py` cite 10.5281/..21901984 and ..22026592 (agent_issues 100140 item 6).

## 5. What changed (migrations 2026-10-26-rem-a7-doi-sweep.sql and -sweep-2.sql, backups bak_noz2_*_20261026 and bak_noz2b_*)

- paper_index: 161 doi values (120 closed-registry, 40 CHAPTER-FRAGMENT markers, 1 test value), 80 zenodo_id, 1 zenodo_url, 1 related id list set to NULL. No row removed.
- content_entries: 5 doi values set to NULL; two cms pages (qnfo-publications, living-papers) reworded without the registry, 4 sentences in two steps. The first file reworded the first mention on each page
  ("All papers receive ... DOIs and IPFS content identifiers" lost its registry clause; the list item "Zenodo Archiving" became "Stable addresses: every published paper keeps one address at papers.qnfo.org,
  and new versions keep that address", which the live pages state too). It left three more mentions, because the inspection read only the first occurrence on each page; the contract probe of 100587 read 2 instead of 0 and
  the evidence guard of the first file correctly staged nothing. The second file finished them: the list item "A registry DOI when formally published" now reads "A stable address at papers.qnfo.org", the statistics line
  "6 with registry DOIs" is removed, and the lifecycle stage "Published: DOI assigned" reads "Formally published at papers.qnfo.org".
- discovery_projects: 4 doi values set to NULL; "(supersedes v2.0, DOI: ...)" and "(supersedes v1.9, DOI: ...)" lost the DOI; "(Zenodo + Pages deploy)" reads "(Pages deploy)".
- research_code_libraries.companion_doi: 3 values set to NULL.
- Failure mode `code-publish-registry-doi` with detector `fm-code-publish-registry-doi` (reads a closed-registry DOI re-entering companion_doi).
- Issues filed with a doer and a closing probe: NOZ-DOI-SWEEP-2A (agent_issues 1000479), NOZ-DOI-SWEEP-2B (1000480).
- The contract probe of issue 100587 (the count of those fields) read 173 before and 0 after the second file; it is unchanged. Four contracts were added to the issue so that its close rests on the sweep and not on three tables:
  `noz-sweep-100587-no-reentry` (no ledger or stats table of section 3 holds more closed-registry identifiers than on 2026-10-26, the cleared tables hold none; a re-entry names the table),
  `-surface-api` (papers.qnfo.org/api/papers?limit=100 carries no 10.5281), `-surface-llms` (qnfo.org/llms.txt carries no registry name) and `-inventory` (this report and its tool are on main).

Not changed: no paper, no worker, no secret, no public GitHub content.

## 6. Decisions (defaults taken under DECISION-AUTOPROCEED-1; each is reversible by editing nothing, so the revert path is "say otherwise")

| Item | Default taken | Why |
|---|---|---|
| Owner-authored published-paper sources in GitHub repositories (.github, gitbook, QWAV, papers/) | keep as provenance; no mass edit | "no mass edit of published papers"; the public pages read 0; editing history rewrites the record |
| Ledgers and stats tables keyed by closed DOIs (section 3) | keep | records and join keys; retiring them is a backup-first migration for a later decision |
| Third-party DOIs (337 in the repository, 32 on mind.q08.org) | keep | NOZ-DOI-1 amendment |
| Topic `zenodo` on QNFO/qnfo-releases, descriptions of archived repositories | leave | archived repositories cannot be edited without unarchiving; the portfolio loop owns topics |
| ignorance-audit files | change through a reviewed pull request | owner authorisation of 2026-10-26 (agent_issues 100576 item 6) |

## 7. Rerun

```
node scripts/doi-zenodo-inventory.mjs --json /tmp/inventory.json --md /tmp/inventory.md   # repository scan, no network
node scripts/doi-zenodo-inventory.test.mjs                                                # offline suite
```

The data-plane and surface numbers above were read with D1 SELECTs and plain GETs on 2026-10-26; the migration test (`migrations/rem-a7-doi-sweep.test.mjs`) replays the cleanup on a fixture.
