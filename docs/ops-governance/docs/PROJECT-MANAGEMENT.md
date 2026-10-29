# QNFO Project Management System — v1.0

> Created: 2026-08-05  
> Session: GitHub stars cleanup + project management deployment (fUh3LOOfvwcQCm86okm_A)  
> Status: ACTIVE — all components deployed  

This document describes the complete QNFO project management system:
GitHub as the public-facing project board, Cloudflare D1 as the canonical
state backend, and the sync protocol between them.

## 1. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     PUBLIC LAYER (GitHub)                      │
│                                                              │
│  QNFO/.github/ISSUE_TEMPLATE/    ← 5 issue templates         │
│  QNFO/.github/PULL_REQUEST_TEMPLATE.md                        │
│                                                              │
│  QNFO/<program-repo>/issues/     ← Per-program issue tracking│
│  QNFO/<program-repo>/labels/     ← 39 standardized labels    │
│  QNFO/<program-repo>/projects/   ← 5 existing project boards │
│                                                              │
│  ▼ Publicly visible, shareable, collaborative                 │
└──────────────────────────┬───────────────────────────────────┘
                           │
                    GitHub-D1 Sync
                    (on state change)
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                   CANONICAL LAYER (Cloudflare)                 │
│                                                              │
│  D1: portfolio-state    ← Program/project registry           │
│  D1: qnfo-audit         ← Audit trails, session logs        │
│  D1: living-paper       ← Paper metadata and body          │
│  R2: qnfo/              ← Artifacts, PDFs, datasets          │
│  Workers: graph-api     ← Knowledge graph                   │
│  Workers: papers-api    ← Publication server                │
│                                                              │
│  ▼ Canonical — source of truth, not publicly browsable       │
└──────────────────────────────────────────────────────────────┘
```

## 2. Account Separation

| Account | Purpose | Stars | Projects | Issue Templates |
|:--------|:--------|:------|:---------|:----------------|
| **QNFO** (org) | Formal research programs (UMP/SLB/INM/CFE/RES/PLT/DEM) | 0 (needs org auth) | 5 existing | 7 templates (org-wide) |
| **rwnq8** (personal) | Personal toolkit, agentic AI, dev tools | 204 | 0 | GitHub defaults |

**Rule:** QNFO repos = research programs. rwnq8 repos = personal experiments.
Issues, labels, PRs, and project boards are per-account — not shared.

## 3. Label Taxonomy (39 labels, 7 groups)

Labels deployed on all 7 program repos: ultrametric-physics, laws-of-form,
infomatics, cfpe, qnfo-research, qwav-platform, qwav-demos.

### Program Labels
| Label | Color | Purpose |
|:------|:------|:--------|
| `program:ump` | `#5C4B99` | Ultrametric Physics |
| `program:slb` | `#4A90D9` | Laws of Form |
| `program:inm` | `#2E8B57` | Infomatics |
| `program:cfe` | `#D9464E` | CFPE — Paradigm Forecasting |
| `program:res` | `#E67E22` | QNFO Research |
| `program:plt` | `#1ABC9C` | QWAV Platform |
| `program:dem` | `#9B59B6` | QWAV Demos |

### Type Labels
| Label | Purpose |
|:------|:--------|
| `type:paper` | Research paper |
| `type:audit` | Audit or review |
| `type:infra` | Infrastructure work |
| `type:bug` | Bug report |
| `type:feature` | New feature |
| `type:docs` | Documentation |
| `type:kaizen` | Continuous improvement |
| `type:epic` | Large body of work |

### Priority Labels
| Label | Meaning |
|:------|:--------|
| `priority:p0` | Critical — blocking |
| `priority:p1` | High — this sprint |
| `priority:p2` | Medium — next sprint |
| `priority:p3` | Low — backlog |

### Phase Labels (WBS-aligned)
| Label | Phase |
|:------|:------|
| `phase:p0` | Initiation |
| `phase:p1` | Due Diligence |
| `phase:p2` | Literature Review |
| `phase:p3` | Citations |
| `phase:p4` | Deep Research |
| `phase:p5` | Publication |
| `phase:p6` | Deployment |
| `phase:p7` | Dissemination |
| `phase:p8` | Core Distribution |
| `phase:p9` | Extension |

### Status Labels
| Label | State |
|:------|:------|
| `status:backlog` | Not yet scheduled |
| `status:in-progress` | Work in progress |
| `status:review` | Under review |
| `status:blocked` | Blocked by dependency |
| `status:done` | Complete |

### 4-D Distribution Labels
| Label | Distribution State |
|:------|:-------------------|
| `4d:draft` | Not yet distributed |
| `4d:published` | Published on papers.qnfo.org |
| `4d:distributed` | Distributed to IPFS + Arweave |
| `4d:durable` | Zenodo + DNSLink + IA complete |

### Sync Label
| Label | Meaning |
|:------|:--------|
| `d1:synced` | Synced with canonical D1 state |

## 4. Issue Templates (QNFO/.github — org-wide)

Available on every QNFO program repo's "New Issue" page:

| Template | Use For | Auto-labels |
|:---------|:--------|:------------|
| **Research Paper** | New paper proposals | `type:paper`, `status:backlog` |
| **Audit / Review** | Audits, red-teams | `type:audit`, `status:backlog` |
| **Infrastructure Task** | Cloudflare/D1/R2/CI work | `type:infra`, `status:backlog` |
| **Bug Report** | Bug reports | `type:bug`, `priority:p2` |
| **Epic** | Large multi-issue work | `type:epic`, `status:backlog` |

Each template includes appropriate checklists (phase tracking, 4-D distribution,
Ostrowski compliance, Cloudflare system checklist).

## 5. Pull Request Template (QNFO/.github)

Pre-populates checkboxes for:
- Type (paper/audit/infra/bug/feature/docs/kaizen)
- Program affiliation (UMP/SLB/INM/CFE/RES/PLT/DEM)
- Linked issues
- Verification (mojibake scan, citations, Ostrowski, banned words)

## 6. Project Boards (GitHub Projects V2)

Existing QNFO org project boards:

| # | Name | Type | Status |
|:--|:-----|:-----|:-------|
| 5 | symbol-metric-neutrality | Kanban | Open |
| 4 | trapped-ion-posner-connection Kanban | Kanban | Open |
| 3 | ultrametric-tree-resistance Kanban | Kanban | Open |
| 2 | QWAV Sprint Board v2 | Sprint | Open |
| 1 | QWAV Program Management | Program | Open |

## 7. GitHub ↔ Cloudflare D1 Sync Protocol

### Direction
D1 is canonical. GitHub is the public mirror.
**Sync direction: D1 → GitHub.** Never GitHub → D1.

### When to Sync
- Project state changes (phase transitions, status updates)
- Publication events (new paper, new DOI)
- Session closeouts
- Sprint reviews

### What Gets Synced
| GitHub | D1 | Notes |
|:-------|:---|:------|
| Issue title + body | `portfolio-state.tasks` or `living-paper.papers` | Paper metadata, task descriptions |
| Issue labels | `D1 tags/program codes` | `program:ump` → WBS code `UMP.001` |
| Issue status | `D1 phase/status fields` | `status:done` → `distribution_status: complete` |
| Milestone | `D1 sprint/release tracking` | Date-bound grouping |
| `d1:synced` label | Sync timestamp in D1 | Flag indicating GitHub mirrors D1 |

### What Does NOT Get Synced
- Comments and discussions (live on GitHub only)
- PR reviews (GitHub-native workflow)
- Project board column positions (live state, not canonical)
- Star counts, forks, watchers (GitHub metrics only)

### Sync Implementation
```
┌─ State change in D1 ──────────────────────────────────────┐
│                                                             │
│  1. D1 UPDATE: set phase, status, or distribution_state    │
│  2. Check: does this state have a GitHub issue?             │
│     ├─ Yes → UPDATE GitHub issue (labels, milestone, body) │
│     └─ No  → CREATE GitHub issue from template              │
│  3. Label: add d1:synced to GitHub issue                   │
│  4. Log: record sync in qnfo-audit D1 table                │
│                                                             │
│  NEVER: update D1 from GitHub without explicit user action  │
└─────────────────────────────────────────────────────────────┘
```

## 8. Reusable Scripts

Canonical location: `QNFO/qnfo-ops/scripts/github-management/`

| Script | Purpose |
|:-------|:--------|
| `star_audit.py` | Fetch all stars, classify by QNFO taxonomy, generate KEEP/DUMP |
| `star_batch.py` | Batch star/unstar from classification or curated lists |
| `label_manager.py` | Create/clone/verify standardized labels across program repos |
| `README.md` | Architecture documentation for the scripts |

## 9. Related Resources

| Resource | Location |
|:---------|:---------|
| Keyword taxonomy | `QNFO/qnfo-research:docs/QNFO-KEYWORD-TAXONOMY.md` |
| WBS taxonomy | `QNFO/qnfo-ops:WBS/WBS.TAXONOMY.md` |
| WBS agent protocol | `QNFO/qnfo-ops:WBS/WBS-AGENT-PROTOCOL.md` |
| Knowledge skill | `memory_recall({query: "QNFO keyword taxonomy"})` |
| Issue/PR templates | `QNFO/.github/` |
| Cloudflare D1 | `wrangler d1 execute portfolio-state --remote` |
| KG API | `query_graph('stats')` |

## 10. Session Closeout Checklist

Every session that modifies QNFO project state:

- [ ] D1 updated (canonical)
- [ ] GitHub issue labels updated to match D1
- [ ] `d1:synced` label applied to synced issues
- [ ] Audit log entry in qnfo-audit D1 table
- [ ] Memory stored: `remember_fact({category: "task_outcome"})`
- [ ] git status clean, pushed to remote

---

Version: **v1.0** — 2026-08-05  
Author: DeepChat agent (session fUh3LOOfvwcQCm86okm_A) under rwnq8 direction  
Canonical location: `QNFO/qnfo-ops:docs/PROJECT-MANAGEMENT.md`
