# WBS-AGENT-PROTOCOL — Agent Execution Standard

**Purpose:** Define how agents use WBS codes with `update_plan` to execute multi-phase, multi-project work consistently across sessions and agents.  
**Authority:** ADR-2026-007  
**Last Updated:** 2026-08-04

---

## §0 Consolidated Program Codes (2026-08-04)

On 2026-08-04, 45 project-level repos were consolidated into 7 program repos in the QNFO org.
These are the CANONICAL program codes for ALL new work — version updates, research extensions,
and new projects use these codes in branches, tags, D1 entries, and KG edges.

| WBS Code | Program | Portfolio | Repo | Branch prefix | update_plan prefix |
|:---------|:--------|:----------|:-----|:--------------|:-------------------|
| `UMP` | Ultrametric Physics | QNFO | `QNFO/ultrametric-physics` | `ump/` | `[QNFO.UMP.001.P0]` |
| `SLB` | Laws of Form (Spencer-Brown) | QNFO | `QNFO/laws-of-form` | `slb/` | `[QNFO.SLB.001.P0]` |
| `INM` | Infomatics | QNFO | `QNFO/infomatics` | `inm/` | `[QNFO.INM.001.P0]` |
| `CFE` | CFPE (Cascading Foresight) | QNFO | `QNFO/cfpe` | `cfe/` | `[QNFO.CFE.001.P0]` |
| `RES` | QNFO Research Archive | QNFO | `QNFO/qnfo-research` | `res/` | `[QNFO.RES.001.P0]` |
| `PLT` | QWAV Platform | QWAV | `QNFO/qwav-platform` | `plt/` | `[QWAV.PLT.001.P0]` |
| `DEM` | QWAV Demos | QWAV | `QNFO/qwav-demos` | `dem/` | `[QWAV.DEM.001.P0]` |

**Branch naming (HARD):** `{prog}/{type}/{slug}` — lowercase program code, work type
(`paper`/`audit`/`artifact`/`infra`/`fix`/`kaizen`), then the paper/project slug.
Example: `ump/paper/adelic-shannon-theory`, `res/audit/acrp04-five-smooth`, `plt/infra/d1-backfill`.

**Version updates & research extensions:** use the same program code + new project number —
`[QNFO.UMP.002.P4]` for a new Ultrametric Physics paper, `[QNFO.CFE.002.P9]` for a CFPE extension.
Full canonical mapping: qnfo-core §N-1, WBS.TAXONOMY.md §8.

## §1 Core Principle

**WBS codes are the universal addressing scheme for all agent work.** Every `update_plan` step carries a WBS code prefix. This enables:

- **Cross-session continuity** — any agent in any session can look up a WBS code and know exactly what project, phase, and context they are in
- **Dependency tracking** — version updates and research extensions propagate through the WBS tree
- **Agent-agnostic execution** — different agents (implementer, reviewer, explorer) can work on the same WBS item
- **Auditability** — every `update_plan` snapshot maps to a concrete, queryable entity in D1 and KG

---

## §2 Plan Step Convention

### Format

```
[WBS_CODE] VERB: description
```

### Examples

```json
{
  "plan": [
    {"step": "[QNFO.ADL.002.P1] Due diligence: KG + D1 + Vectorize cross-ref", "status": "in_progress", "priority": "high"},
    {"step": "[QNFO.ADL.002.P2] Literature search: semantic + external APIs", "status": "pending", "priority": "medium"},
    {"step": "[QNFO.ADL.002.P4] Deep research: Bayesian cascade + red-team", "status": "pending", "priority": "high"},
    {"step": "[QNFO.ADL.002.P5] Publication: paper.md + PDF + Zenodo", "status": "pending", "priority": "high"},
    {"step": "[QNFO.CON.001.P9] Extension: update consilience for Adelic Entropy v1.1", "status": "pending", "priority": "medium"}
  ]
}
```

### Rules

1. **Every step starts with `[WBS_CODE]`** — always use the full WBS code to the phase level
2. **Task + subtask are optional** — add `T3` or `S2` only when granularity demands it
3. **One WBS code per step** — don't bundle unrelated work
4. **Status reflects the WBS item state** — not the step's speculative future

### WBS Code Resolution

When an agent encounters a `[QNFO.ADL.002.P4]` prefix, it should:

1. **Parse**: Program=`ADL`, Project=`002`, Phase=`P4`
2. **Look up D1**: `SELECT * FROM program_registry WHERE wbs_code = 'QNFO.ADL.002'`
3. **Load context**: Read PROJECT-PLAN.md, check `.zenodo_versions.json`, inspect artifacts/
4. **Check KG**: `query_graph('neighbors', {id: 'proj-qnfo-adl-002'})` for dependencies
5. **Execute**: Run the work with full lineage awareness

---

## §3 Phase Execution Templates

### Full Project Pipeline (P0→P8)

```json
{
  "plan": [
    {"step": "[{WBS}.P0] Init: repo scaffold, README, PROJECT-PLAN.md", "status": "pending", "priority": "high"},
    {"step": "[{WBS}.P1] Due diligence: KG + D1 + Vectorize cross-ref", "status": "pending", "priority": "high"},
    {"step": "[{WBS}.P2] Literature: semantic search + external APIs", "status": "pending", "priority": "medium"},
    {"step": "[{WBS}.P3] Citations: reference audit, DOI verification", "status": "pending", "priority": "medium"},
    {"step": "[{WBS}.P4] Research: Bayesian cascade + red-team audit", "status": "pending", "priority": "high"},
    {"step": "[{WBS}.P5] Publication: paper.md + PDF build + Zenodo", "status": "pending", "priority": "high"},
    {"step": "[{WBS}.P6] Deploy: D1 living-paper, papers-server, DNS", "status": "pending", "priority": "medium"},
    {"step": "[{WBS}.P7] Disseminate: social posting, SEO, IA snapshot", "status": "pending", "priority": "low"},
    {"step": "[{WBS}.P8] Distribute: R2 archive, KG node, GitHub tag", "status": "pending", "priority": "medium"}
  ]
}
```

### Version Update / Extension (P9)

```json
{
  "plan": [
    {"step": "[{WBS}.P9.T1] Audit: identify what changed since last version", "status": "pending", "priority": "high"},
    {"step": "[{WBS}.P9.T2] Update: apply changes to paper.md + artifacts", "status": "pending", "priority": "high"},
    {"step": "[{WBS}.P9.T3] Rebuild: PDF + provenance bundle", "status": "pending", "priority": "high"},
    {"step": "[{WBS}.P9.T4] Republish: Zenodo new version + D1 sync", "status": "pending", "priority": "high"},
    {"step": "[{WBS}.P9.T5] Propagate: update dependent consilience papers", "status": "pending", "priority": "medium"}
  ]
}
```

### Cross-Project Propagation

When a dependent project (e.g., QNFO.CON.001) needs updating because a source project (e.g., QNFO.ADL.002) changed:

```json
{
  "plan": [
    {"step": "[QNFO.CON.001.P9.T1] Detect: QNFO.ADL.002 v1.1 changed entropic bound", "status": "completed", "priority": "high"},
    {"step": "[QNFO.CON.001.P9.T2] Impact: assess which consilience sections need update", "status": "in_progress", "priority": "high"},
    {"step": "[QNFO.CON.001.P9.T3] Update: revise paper sections 3.2 and 4.1", "status": "pending", "priority": "high"},
    {"step": "[QNFO.CON.001.P9.T4] Rebuild: PDF + reproducibility re-check", "status": "pending", "priority": "high"},
    {"step": "[QNFO.CON.001.P9.T5] Republish: Zenodo v1.5 + D1/KG sync", "status": "pending", "priority": "high"}
  ]
}
```

---

## §4 Agent Bootstrap Protocol

Before executing ANY work, an agent MUST:

### Step 1: Resolve WBS context
```
IF task description contains WBS code:
    Parse code → Look up D1 → Load repo → Read PROJECT-PLAN.md
ELSE IF task mentions program/project name:
    Search D1 by slug → Derive WBS code → Continue as above
ELSE:
    Request WBS code from user (BLOCK until resolved)
```

### Step 2: Load dependencies
```
query_graph('neighbors', {id: kg_node_id})  // What does this depend on?
query_graph('impact', {id: kg_node_id})      // What depends on this?
```

### Step 3: Check version state
```
Read .zenodo_versions.json → Verify against D1 program_registry.current_version
If mismatch → Flag for reconciliation before proceeding
```

### Step 4: Execute with WBS-coded plan
```
update_plan with [WBS_CODE] prefixes on every step
```

---

## §5 Subagent Routing

When using `subagent_orchestrator`, include the WBS code in the task prompt so subagents can bootstrap their own context:

### Explorer
```
prompt: "[QNFO.ADL.002.P1] Survey existing literature on adelic entropic numbers.
         Check D1 for prior papers, KG for connected concepts, and Vectorize for
         semantic matches. Return a gap analysis with specific paper slugs."
slotId: explorer
```

### Implementer
```
prompt: "[QNFO.ADL.002.P3] Write adelic-entropic-numbers.md paper. WBS: QNFO.ADL.002.
         Parent program: Adelic Physics. Follow the structure of adelic-rate-distortion.md
         as template. Include: abstract, introduction, theorem statements, proofs,
         numerical validation, and 3 falsifiable predictions."
slotId: implementer
```

### Reviewer
```
prompt: "[QNFO.ADL.002.P4] Red-team audit of adelic-entropic-numbers.md.
         Check: math correctness, citation accuracy, falsifiability of predictions,
         banned words, certainty labels. Return findings with line references."
slotId: reviewer
```

---

## §6 Pipeline Automation

### The WBS Pipeline Loop

```
FOR each project in program_registry WHERE status = 'active':
    IF project.phase < P9:
        LOAD wbs_code
        RESOLVE kg_node_id → check neighbors/impact
        READ current_version
        GENERATE update_plan with WBS-coded steps
        EXECUTE next phase
        UPDATE program_registry.phase
        UPDATE program_registry.updated_at
```

### Version Update Detection

```
FOR each project:
    CHECK .zenodo_versions.json vs program_registry.current_version
    IF mismatch:
        FLAG for P9 extension
    CHECK KG neighbors for dependent projects
    IF dependency has newer version:
        FLAG dependent for propagation
```

---

## §7 Verification Checklist

After executing any WBS-coded plan step, verify:

| Check | Method |
|:------|:-------|
| WBS code matches D1 | `SELECT * FROM program_registry WHERE wbs_code = ?` |
| KG edge exists | `query_graph('neighbors', {id: node_id})` → count > 0 |
| Version consistent | `.zenodo_versions.json` ↔ `program_registry.current_version` |
| Dependencies tracked | Dependent projects have `DEPENDS_ON` KG edges |
| Plan updated | `update_plan` reflects actual status, not wishful status |
| Memory stored | `remember_fact` for cross-session recall of key outcomes |

---

## §8 Anti-Patterns

| Anti-Pattern | Fix |
|:-------------|:----|
| Plan step without WBS code prefix | Always prefix with `[QNFO.XX.NNN.PN]` |
| Guessing WBS code without D1 lookup | Resolve from D1 before executing |
| Skipping dependency check | Always run `query_graph('impact')` before modifying |
| Project name mismatch (ad-hoc vs canonical) | Use D1 slug as canonical; rename repos if needed |
| Version update without propagation check | Run KG impact analysis → flag dependents |
| Phantom claim of "stored" without D1 re-query | Re-SELECT after INSERT (knowledge skill v2.1 mandate) |
| Level leakage (DPRF LEAK-X-Y — QNFO.RES.032) | Declare intermediate bridges or demote level (PLCY/MAP-TERRITORY-REALIZATION-GATE.md §5) |
| Ontology smuggling (DPRF ONTIC-SMUGGLE) | Declare ontic commitment or rewrite as methodological |
| Map-as-territory (DPRF MAP-AS-TERRITORY) | Supply G2 triple (protocol/null/falsifier) or demote to map |
| Object conflation (DPRF OBJ-CONFLATE) | Separate the objects (primes vs zeros; two-point vs one-point) |
