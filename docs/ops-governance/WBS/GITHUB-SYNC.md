# GitHub ↔ Cloudflare Sync Contract (QNFO.GOV)

**Status:** active (P0) · **Authority:** WBS.TAXONOMY.md §7 · **Last updated:** 2026-08-13

## Principle

Cloudflare is canonical. GitHub is the public mirror and activity ledger.
Sync direction is **one-way: Cloudflare → GitHub**. GitHub-side edits that
contradict Cloudflare canonical state are drift and must be reported, never
silently propagated back into D1/KG.

## Canonical sources (read-only for sync)

| # | Source | Endpoint | Contents |
|:-:|:-------|:---------|:---------|
| 1 | D1 `portfolio-state.program_registry` | D1 HTTP API, DB `d80fdf2a-0a60-45a3-968b-2907ce806dcd`, account `edb167b78c9fb901ea5bca3ce58ccc4b` | programs, projects, WBS codes, phase, status, github_repo, zenodo_doi, kg_node_id |
| 2 | QNFO Knowledge Graph | `POST https://graph-api.qnfo.org/query` `{"query":"<SQL>"}` (read, public) | `nodes` table: Program (21), Project, Task (KEPLER master plan), Paper (1,621), plus edges |
| 3 | WBS taxonomy | `QNFO/qnfo-ops:WBS/WBS.TAXONOMY.md` | git-versioned registry mirror (human-readable) |

## Public mirrors on GitHub

| Surface | What it shows |
|:--------|:--------------|
| **Org profile README** | `QNFO/.github` → `profile/README.md` (renders on github.com/QNFO) — mission, programs, funding & transparency posture |
| **Public Program Board** | `https://github.com/orgs/QNFO/projects/7` — full registry mirror: programs, projects, tasks, grants pipeline |
| Program repos | 7 consolidated repos + QWAV + per-project repos with public issues/PRs/releases |

## Board fields (Projects v2 schema quirks)

- `Program Status` — Active / Milestone Due / Maintaining / Completed / Proposed
- `Level` — Program / Project / Task / Other
- `WBS Program` — SR, ADL, PBO, QD, UF, CON, CMP, JPC, ODR, SLB, CGS, RES, UMP, INM, CFE, PLT, DEM, GOV, KEPLER, ACRP

Schema quirks (verified 2026-08-13 by introspection — this installation differs from public docs):
`CreateProjectV2Input` has NO `visibility` field; `UpdateProjectV2Input` takes `public: Boolean`;
`AddProjectV2DraftIssuePayload` returns `projectItem`; `ProjectV2SingleSelectFieldOptionInput`
requires `description`; field name `Status` is reserved on new boards.

## Sync procedure

```
python qnfo-ops/scripts/qnfo_github_board_sync.py [--dry-run]
```

- Idempotent: keyed by WBS code / canonical title; never deletes board items.
- Adds missing programs/projects/tasks; sets Level + WBS Program + Program Status on new items.
- Prints added/skipped/existing counts and final board total (anti-phantom verification).
- Runs weekly via scheduled task **"QNFO GitHub Board Sync"** (Sat 06:00 UTC).

## Known drift (flagged 2026-08-13 — NOT auto-reconciled)

1. **KG-only programs**: `KEPLER` (program-kepler, 10 phases/48 tasks), `ACRP` (program:acrp,
   ACRP-01..08), and KG node `qwav` are Program nodes in the KG but have no `program_registry`
   rows and no taxonomy sections. Identity reconciliation (ACRP≈ADL? QWAV≈PLT? KEPLER = ?)
   requires user decision. They are mirrored on the board from the KG as KEPLER/ACRP.
2. **UMP.005 name mismatch**: D1 `program_registry` says `QNFO.UMP.005 = Adelic Holonomy:
   Gauge Unification from Distinction Net`; the submission-tracked paper for UMP.005 is
   `qwave-qudit-advantage` (DOI 10.5281/zenodo.21827737). Needs a decision on which is
   canonical (or whether they are two projects).
3. **D1 projects vs KG projects**: D1 holds 22 projects; the KG holds ~149 Project nodes of
   which the active research subset is mirrored. Legacy DRAFT/ARCHIVED qwav-platform
   subproject nodes are deliberately excluded from the public board (they are historical
   infra, not programs).
4. **Taxonomy vs D1**: aligned 2026-08-13 (INM/CFE/PLT/DEM/GOV + QWAV portfolio rows added
   to D1; KG nodes prog-qnfo-{inm,cfe,gov}, prog-qwav-{plt,dem}, proj-qnfo-gov-001 created).
   Future additions MUST go through §7 (D1 row + KG node + taxonomy + this doc).
5. **Legacy KG node**: `project-qnfo-gov` (label=Project, wrong id convention) predates the
   canonical `prog-qnfo-gov` Program node — flagged by red-team 2026-08-13; left in place
   (may carry edges); do not treat it as the GOV program node.

## Funding transparency rule

The "Grants & Funding Pipeline" board item is the grants ledger. Entries appear ONLY
after a real submission exists — never fabricate a grant application for optics.
