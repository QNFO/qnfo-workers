# WBS.TAXONOMY — Canonical Program/Project Registry

**Authority:** ADR-2026-007  
**Last Updated:** 2026-08-29  
**Source of Truth:** D1 `portfolio-state.program_registry` + KG nodes (label=Program/Project)

---

## §1 WBS Code Convention

```
{PORTFOLIO}.{PROGRAM}.{PROJECT}.P{PHASE}.T{TASK}.S{SUBTASK}
```

| Component | Pattern | Example |
|:----------|:--------|:--------|
| Portfolio | `QNFO` | `QNFO` |
| Program | 2-3 char uppercase | `ADL`, `CON`, `SR` |
| Project | 3-digit padded sequence | `001`, `002` |
| Phase | `P` + digit 0-9 | `P1`, `P4` |
| Task | `T` + digit 1-n | `T1`, `T3` |
| Subtask | `S` + digit 1-n | `S1`, `S2` |

**Full example:** `QNFO.ADL.002.P4.T3.S2` = Adelic Entropic Numbers, Phase 4 (Deep Research), Task 3, Subtask 2.

---

## §2 Phase Definitions (P0-P9)

| Phase | Name | Description |
|:------|:-----|:------------|
| P0 | Project Init | Repo scaffold, .gitignore, README, PROJECT-PLAN.md |
| P1 | Due Diligence | KG + D1 + Vectorize + external cross-reference |
| P2 | Literature Search | Semantic + external API literature query |
| P3 | Citation Management | Reference audit, DOI verification, BibTeX |
| P4 | Deep Research | Bayesian cascade, analysis code, red-team |
| P5 | Publication | paper.md + PDF build + Zenodo deposition |
| P6 | Deployment | D1 living-paper, papers-server, DNS |
| P7 | Dissemination | Social posting, SEO, Internet Archive |
| P8 | Core Distribution | R2 archive, KG node, GitHub tag, 4-layer verification |
| P9 | Extension | Version updates, follow-on papers, research extensions |

---

## §3 Complete WBS Registry

### Portfolio: QNFO

| WBS | Level | Name | Slug | Status | Zenodo DOI |
|:----|:------|:-----|:-----|:------:|:-----------|
| `QNFO` | portfolio | QNFO Research Foundation | `qnfo` | active | — |

### Program: QNFO.GOV — Portfolio Governance & Public Transparency

| WBS | Level | Name | Slug | GitHub | Status |
|:----|:------|:-----|:-----|:-------|:------:|
| `QNFO.GOV` | program | Portfolio Governance & Public Transparency | `governance-transparency` | `QNFO/.github` | active |
| `QNFO.GOV.001` | project | Public Transparency Dashboard (org profile README + public Project board) | `public-transparency-dashboard` | `QNFO/.github` | active (P0) |

### Program: QNFO.SR — Silent Radix Cryptography

| WBS | Level | Name | Slug | Status |
|:----|:------|:-----|:-----|:------:|
| `QNFO.SR` | program | Silent Radix Cryptography | `silent-radix` | active |

No projects registered yet. Papers are tracked as KG Paper nodes under this program.

### Program: QNFO.ADL — Adelic Physics Program

| WBS | Level | Name | Slug | GitHub | Zenodo DOI | Status |
|:----|:------|:-----|:-----|:-------|:-----------|:------:|
| `QNFO.ADL` | program | Adelic Physics Program | `adelic-physics` | — | `10.5281/zenodo.21336099` | active |
| `QNFO.ADL.001` | project | Adelic Shannon Theory | `adelic-shannon-theory` | `QNFO/adelic-shannon-theory` | `10.5281/zenodo.21336099` | active |
| `QNFO.ADL.002` | project | Adelic Entropic Numbers | `adelic-entropic-numbers` | `QNFO/adelic-shannon-theory` | — | active |
| `QNFO.ADL.003` | project | Adelic Rate Distortion | `adelic-rate-distortion` | `QNFO/adelic-shannon-theory` | — | active |

### Program: QNFO.PBO — Pattern-Based Ontology (Autaxys)

| WBS | Level | Name | Slug | Status |
|:----|:------|:-----|:-----|:------:|
| `QNFO.PBO` | program | Pattern-Based Ontology (Autaxys) | `pbo-autaxys` | active |

### Program: QNFO.QD — The Qubit Delusion

| WBS | Level | Name | Slug | Status |
|:----|:------|:-----|:-----|:------:|
| `QNFO.QD` | program | The Qubit Delusion | `qubit-delusion` | active |

### Program: QNFO.UF — Ultrametric Foundations

| WBS | Level | Name | Slug | Zenodo DOI | Status |
|:----|:------|:-----|:-----|:-----------|:------:|
| `QNFO.UF` | program | Ultrametric Foundations | `ultrametric-foundations` | `10.5281/zenodo.21046993` | active |

### Program: QNFO.CON — Cross-Pillar Consilience

| WBS | Level | Name | Slug | GitHub | Zenodo DOI | Status |
|:----|:------|:-----|:-----|:-------|:-----------|:------:|
| `QNFO.CON` | program | Cross-Pillar Consilience | `cross-pillar-consilience` | — | `10.5281/zenodo.21547793` | active |
| `QNFO.CON.001` | project | WBS.6 Consilient Synthesis | `wbs-6-synthesis` | `QNFO/wbs-6-synthesis` | `10.5281/zenodo.21547793` | complete (P8) |

### Program: QNFO.CMP — Computing Machines

| WBS | Level | Name | Slug | GitHub | Status |
|:----|:------|:-----|:-----|:-------|:------:|
| `QNFO.CMP` | program | Computing Machines | `computing-machines` | — | active |
| `QNFO.CMP.001` | project | Computing Machines | `computing-machines` | `QNFO/computing-machines` | active |

### Program: QNFO.JPC — JPCub Validation

| WBS | Level | Name | Slug | GitHub | Status |
|:----|:------|:-----|:-----|:-------|:------:|
| `QNFO.JPC` | program | JPCub Validation | `jpcub-validation` | — | active |
| `QNFO.JPC.001` | project | JPCub Validation | `jpcub-validation` | `QNFO/jpcub-validation` | active |

### Program: QNFO.ODR — ODR Thesis Program

| WBS | Level | Name | Slug | GitHub | Status |
|:----|:------|:-----|:-----|:-------|:------:|
| `QNFO.ODR` | program | ODR Thesis Program | `odr-thesis` | `QNFO/odr-thesis` | active |
| `QNFO.ODR.001` | project | ODR Thesis (Compton Count as Only Primitive) | `odr-thesis` | `QNFO/odr-thesis` | active (P5) |

### Program: QNFO.CGS — Consilient Gap Synthesis

| WBS | Level | Name | Slug | GitHub | Status |
|:----|:------|:-----|:-----|:-------|:------:|
| `QNFO.CGS` | program | Consilient Gap Synthesis | `consilient-gap-synthesis` | `QNFO/consilient-gap-synthesis` | active |
| `QNFO.CGS.001` | project | QNFO/QWAV Portfolio Gap Synthesis | `consilient-gap-synthesis` | `QNFO/consilient-gap-synthesis` | active (P5) |

### Program: QNFO.SLB — Laws of Form (Spencer-Brown)

| WBS | Level | Name | Slug | GitHub | Status |
|:----|:------|:-----|:-----|:-------|:------:|
| `QNFO.SLB` | program | Laws of Form (Spencer-Brown) | `laws-of-form` | `QNFO/laws-of-form` | active |
| `QNFO.SLB.001` | project | The Idempotent Core: Quantity as Broken Distinction | `idempotent-core` | `QNFO/laws-of-form` | active (P4) |
| `QNFO.SLB.002` | project | The Void Is Not False | `void-is-not-false` | `QNFO/laws-of-form` | active (P4) |

### Program: QNFO.RES — QNFO Research Archive

Full registry lives in D1 `program_registry`; this table tracks the framework records added after
the 2026-08-04 consolidation.

| WBS | Level | Name | Slug | GitHub | Status |
|:----|:------|:-----|:-----|:-------|:------:|
| `QNFO.RES.032` | project | Distinction-Primitive Research Framework (DPRF) | `distinction-primitive-research-framework` | `QNFO/qnfo-research` | active (P0) |

---

## §4 Version Tag Convention

```
v{major}.{minor}-{descriptor}
```

| Example | Meaning |
|:--------|:--------|
| `v1.4` | Major version 1, minor 4 (ACRP-01 corrections) |
| `v2.0` | Major version 2 (new paper structure) |
| `v0.1-phase0` | Draft, Phase 0 stage |

Version tags are stored in `program_registry.current_version` and in each repo's `.zenodo_versions.json`.

---

## §5 Slug Convention

Slugs are derived from the canonical name, lowercased, hyphenated:

| Name | Slug |
|:-----|:-----|
| Adelic Shannon Theory | `adelic-shannon-theory` |
| WBS.6 Consilient Synthesis | `wbs-6-synthesis` |
| Cross-Pillar Consilience | `cross-pillar-consilience` |

Slugs are used in:
- GitHub repo names (`QNFO/{slug}`)
- D1 living-paper slugs
- KG node names
- File paths in R2 archives
- Zenodo record keys

---

## §6 Cross-Reference Map

| Entity | D1 (program_registry) | KG (nodes) | GitHub | Zenodo |
|:-------|:---------------------|:-----------|:-------|:-------|
| Adelic Physics | `QNFO.ADL` | `prog-qnfo-adl` | — | `10.5281/zenodo.21336099` |
| Adelic Shannon Theory | `QNFO.ADL.001` | `proj-qnfo-adl-001` | `QNFO/adelic-shannon-theory` | `10.5281/zenodo.21336099` |
| Five Pillars Synthesis | `QNFO.CON.001` | `proj-qnfo-con-001` | `QNFO/wbs-6-synthesis` | `10.5281/zenodo.21547793` |
| Ultrametric Foundations | `QNFO.UF` | `prog-qnfo-uf` | — | `10.5281/zenodo.21046993` |
| Portfolio Governance & Transparency | `QNFO.GOV` | `prog-qnfo-gov` | `QNFO/.github` | — |

| Ultrametric Physics (consolidated) | `QNFO.UMP` | `prog-qnfo-ump` | `QNFO/ultrametric-physics` | — |
| Laws of Form (consolidated) | `QNFO.SLB` | `prog-qnfo-slb` | `QNFO/laws-of-form` | — |
| Infomatics (consolidated) | `QNFO.INM` | `prog-qnfo-inm` | `QNFO/infomatics` | — |
| CFPE (consolidated) | `QNFO.CFE` | `prog-qnfo-cfe` | `QNFO/cfpe` | — |
| QNFO Research Archive (consolidated) | `QNFO.RES` | `prog-qnfo-res` | `QNFO/qnfo-research` | — |
| QWAV Platform (consolidated) | `QWAV.PLT` | `prog-qwav-plt` | `QNFO/qwav-platform` | — |
| QWAV Demos (consolidated) | `QWAV.DEM` | `prog-qwav-dem` | `QNFO/qwav-demos` | — |
---

## §7 Registration Protocol

When creating a new program, project, phase, or task:

1. **Assign WBS code** — follow `{PARENT}.{NEXT_SEQUENCE}` pattern
2. **Create KG node** — label=`Program`/`Project`/`Phase`, id=`prog-{slug}`/`proj-{slug}`
3. **Create D1 row** — INSERT into `program_registry`
4. **Create BELONGS_TO edge** — source → parent node
5. **Update this document** — add to the registry table above
6. **Memory-store** — `remember_fact` for agent cross-session recall


---

## §8 Consolidated Program Repos (2026-08-04)

On 2026-08-04, 45 project-level repos were consolidated into 7 program repos (git subtree,
history preserved). These are the CANONICAL program codes — branch naming uses
`{prog}/{type}/{slug}` and every update_plan step carries `[{PORTFOLIO}.{PROG}.{NNN}.P{N}]`.

| WBS Code | Program | Portfolio | Repo | Branch prefix | update_plan prefix |
|:---------|:--------|:----------|:-----|:--------------|:-------------------|
| `UMP` | Ultrametric Physics | QNFO | `QNFO/ultrametric-physics` | `ump/` | `[QNFO.UMP.001.P0]` |
| `SLB` | Laws of Form (Spencer-Brown) | QNFO | `QNFO/laws-of-form` | `slb/` | `[QNFO.SLB.001.P0]` |
| `INM` | Infomatics | QNFO | `QNFO/infomatics` | `inm/` | `[QNFO.INM.001.P0]` |
| `CFE` | CFPE (Cascading Foresight) | QNFO | `QNFO/cfpe` | `cfe/` | `[QNFO.CFE.001.P0]` |
| `RES` | QNFO Research Archive | QNFO | `QNFO/qnfo-research` | `res/` | `[QNFO.RES.001.P0]` |
| `PLT` | QWAV Platform | QWAV | `QNFO/qwav-platform` | `plt/` | `[QWAV.PLT.001.P0]` |
| `DEM` | QWAV Demos | QWAV | `QNFO/qwav-demos` | `dem/` | `[QWAV.DEM.001.P0]` |

**Canonical format:** `{PORTFOLIO}.{PROGRAM}.{PROJECT}.P{PHASE}.T{TASK}.S{SUBTASK}`
Example: `QNFO.UMP.001.P4.T3.S2` = Ultrametric Physics, project 001, Phase 4, Task 3, Subtask 2.

**Branch naming (HARD):** `{prog}/{type}/{slug}` — lowercase program code, work type
(`paper`/`audit`/`artifact`/`infra`/`fix`/`kaizen`), then the paper/project slug.
Example: `ump/paper/adelic-shannon-theory`, `res/audit/acrp04-five-smooth`, `plt/infra/d1-backfill`.

**update_plan integration (HARD):** every plan step carries the WBS prefix; the full code is the
unique key for plan steps, branches, tags, D1 entries, and KG edges. Canonical registry:
qnfo-core §N-1 (skills), this document (repos/papers).
