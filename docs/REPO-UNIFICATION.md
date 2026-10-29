# Repository unification (REPO-UNIFY-1)

Owner request 2026-10-29: clean up GitHub and unite the repositories behind QNFO, the personal side and q08, which were never meant to be disjointed.
Pillar: autonomy (charter), serving reach and research. This document is the map and the order of work; `docs/PORTFOLIO.md` stays the policy
(archive, never delete; private counted, never named) and the portfolio loop stays the writer of the live register.

## 1. What is true (read 2026-10-29)

| Fact | Value |
|---|---|
| `QNFO` organisation | about 130 repositories, 77 archived, 10 private |
| `rwnq8` personal account | about 60 repositories, almost all archived copies of QNFO work from May to August 2026 |
| Where the code lives | `QNFO/qnfo-workers`: every fleet worker, and already the personal (`personal-*`, `personal-life-*`) and q08 (`q08-*`) workers |
| Where it is split | `qnfo-ops` (governance docs and scripts, 75 docs, 66 scripts), `qnfo-research` (papers), `.github` (profile and generated portfolio), eight "platform" repositories that hold older copies of workers now in `qnfo-workers` |
| Private personal data | `rwnq8/personal-life` (private). It is a data and indexer repository, and the personal/research separation (core rule 13) keeps it out of any QNFO repository |

The disjointedness is therefore not 130 live projects. It is five things:

1. Governance knowledge in `qnfo-ops` that `qnfo-workers/docs` (118 files) neither links to nor reproduces.
2. Platform repositories that duplicate `qnfo-workers` (`infrastructure/workers`, `qnfo-errata-pipeline`, `qnfo-infra`, `qwav-platform`, `qnfo-releases`) and are not marked superseded.
3. A personal account whose archived copies of org repositories look like a second portfolio.
4. No page that says which repository holds what, so a reader of one repository cannot reach the others.
5. q08 and personal have no repository of their own, so they are invisible in the portfolio even though their workers are in `qnfo-workers`.

## 2. Target shape

| Role | Repository | Rule |
|---|---|---|
| Hub: all code, docs, migrations, fleet governance | `QNFO/qnfo-workers` | The one place a change to the system lands. |
| Research record: papers, provenance, deposits | `QNFO/qnfo-research` | Written by the research pipeline; linked from the hub. |
| Public face and generated portfolio | `QNFO/.github` | Generated; never edited by hand. |
| Licence | `QNFO/license` | Unchanged. |
| Programs and demos | the 17 research and 8 demo repositories | Linked from the portfolio, graded for hygiene by the loop. |
| Personal plane | `rwnq8/personal-life` (private), the `personal-*` and `personal-life-*` workers | Separate stores by rule; connected to the hub by a link and a worker binding, never by merging data. |
| q08 | the `q08-*` workers in the hub, domain `q08.org` | Gets a portfolio row (section 4). |

## 3. Order of work (every step reversible)

1. **Hub index (this change).** `docs/REPO-MAP.md` lists every live repository, what it holds and where its source of truth is, so the hub links to all of them.
2. **Ops fold, by copy (REPO-UNIFY-2).** The unique content of `qnfo-ops` (`PLCY`, `AUDT`, `HAND`, `WBS`, `SKIL`, `audits`, `benchmarks`) is copied into `qnfo-workers/docs/ops-governance/` through the stale-PR lane, with the commit history noted in the copy's README. `qnfo-ops` then carries a pointer README. Duplicates by content hash are dropped, not renamed. Scripts that a workflow already runs from `qnfo-workers/scripts` stay where they are.
3. **Supersede, then archive-request (REPO-UNIFY-3).** For each platform repository whose content is a verified subset of `qnfo-workers` (compare file hashes first), write a `portfolio_actions` row `archive-request` (the sanctioned path: the session GitHub proxy refuses repository settings writes). Candidates: `infrastructure`, `qnfo-errata-pipeline`, `qnfo-infra`, `qnfo-releases`, `qwav-platform` after its worker sources are confirmed present. A candidate with any file missing from the hub is copied in first or left active.
4. **Personal account (REPO-UNIFY-4).** The archived `rwnq8` copies are left archived and are listed in the map as superseded by the organisation repository of the same name; none is deleted. The private ones stay private and unnamed.
5. **Cross-links.** Each live repository README gets one generated line pointing to `REPO-MAP.md`; the portfolio loop adds it, not a hand edit.

## 4. Portfolio registration

q08 and the personal plane each get a `program_registry` row so the loop lists them: `QNFO.Q08` (tier platform, domain `q08.org`, workers `q08-*`) and `QNFO.PERSONAL` (tier platform, private, counted not named). Done by migration with a rollback line.

## 5. What is not done and why

- Nothing is merged, moved or archived by this document. Steps 2 to 5 are filed as issues with a doer (section 6).
- Personal data is never copied into a QNFO repository, and `personal-life` is not merged into the hub, because core rule 13 separates them.
- Deleting any repository is out of scope: PORTFOLIO.md rule 3.

## 6. Closing probes

- `code-probe`: `docs/REPO-MAP.md` exists and contains every non-archived, non-fork repository name from the live register (checked by the portfolio loop's next sync).
- `runtime-probe`: `GET https://qnfo-fleet-control.q08.workers.dev/portfolio` lists `QNFO.Q08` after step 4.
