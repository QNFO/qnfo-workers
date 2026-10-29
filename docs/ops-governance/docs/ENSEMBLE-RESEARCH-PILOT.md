# ENSEMBLE RESEARCH PILOT

Status: **ACTIVE** (registered 2026-09-08) | Owner: agent (qnfo-ops) | Repo: QNFO/qnfo-ensemble-research

## 1. Directive (user, 2026-09-08)

> PILOT "ENSEMBLE RESEARCH": WRITING MULTIPLE SEPARATE PAPERS AROUND THE SAME
> THEME/TITLE/QUESTIONS INDEPENDENTLY THAT ARE THEN RECONCILED AND PUBLISHED WITH
> FULL PROVENANCE AND ALL ARTIFACTS AND COLLATERAL FILES AND INTERIM/INTERMEDIATE DRAFTS

## 2. Rationale

A single-agent, single-pass paper is path-dependent: the first framing choice propagates
unchallenged into every later section (confirmation bias, tunnel vision). Ensemble research
treats a paper as an ensemble sample: N independent writers receive a byte-identical
input block (theme + title + questions + constraints) and produce N independent papers.
Reconciliation then makes convergence and divergence explicit instead of implicit.

- **Convergence across independent writers = signal** (claim survives independent framing).
- **Divergence is REPORTED, never silently resolved** (honesty over polish; aligns with
  ADVERSARIAL-REASONING-1).

## 3. Protocol (HARD GATES)

### 3.1 Shared input block (INPUT-PIN-1)
- The shared title + questions + constraints are committed to
  `cycle-N/SHARED-PROMPT.md` BEFORE any writer starts.
- Writers receive this block verbatim; parent records its sha256 in `cycle-N/MANIFEST.json`.

### 3.2 Independent writers (INDEPENDENCE-1)
- N >= 3 writer sessions, isolated contexts, no cross-communication, no sibling-directory reads.
- Each writer may use ONLY: its own knowledge, arXiv MCP tools, web search/fetch, and public
  sources. Every cited source must be real (arXiv ID / DOI verifiable); fabrication = HARD.
- Each writer writes ONLY inside `cycle-N/writer-<id>/`. No git operations (parent commits).
- Deliverables per writer: `draft.md` (>=1500 words; abstract; numbered sections; references
  with arXiv IDs/DOIs; explicit uncertainty labels), `notes.md` (research trail: sources
  consulted, decisions, rejected approaches), `claims.md` (claim / evidence / confidence table).

### 3.3 Interim drafts are first-class deliverables (INTERIM-DRAFT-1)
- Writer drafts are NEVER discarded or overwritten. They are the "interim/intermediate drafts"
  of the directive and ship with the final publication.

### 3.4 Reconciliation (RECONCILE-1)
- Runs ONLY after ALL writers complete (parent/third agent; cannot leak to writers).
- `RECONCILIATION.md` contains a claim-attribution table: every substantive claim in the
  final paper -> source draft + section/line + file sha256.
- Disagreements between writers are listed in a dedicated "Divergences" section with the
  evidence each writer gave; the final paper states its choice and WHY, or states the question
  is open. No silent resolution.

### 3.5 Audit (AUDIT-1)
- Reconciled paper passes a red-team adversarial audit with 0 HARD findings
  (standard RED-TEAM GATE + ADVERSARIAL-REASONING-1 dimensions).

### 3.6 Publication (PROVENANCE-COMPLETE-1)
- Zenodo deposit contains: final reconciled paper (.md/.html/.pdf), ALL interim drafts,
  `RECONCILIATION.md`, `references.bib`, `citation-audit.md`, `PROJECT-PLAN.md`,
  `README.md`, per-writer `notes.md`/claims, and a provenance manifest (sha256 of every file).
  (Extends PUBLICATION SOURCE COMPLETENESS: when in doubt include everything.)
- GitHub provenance: related_identifiers isSupplementTo -> the repo URL
  (https://github.com/QNFO/qnfo-ensemble-research).
- PDF page-1 front matter gate applies (PDF-FRONT-MATTER-1); publication prose gates apply
  (PUBLICATION-BRAND-LANGUAGE-1, PUBLICATION-META-PROSE-1, ANTI-TELEGRAPH-1).

### 3.2a TOOL-ACCESS PROVENANCE AMENDMENT (2026-09-08, after cycle-1 writer collection)
- Per-writer tool-access status is a REQUIRED provenance field in \`MANIFEST.json\`.
- Confirmed: child sessions (deepchat_subagents) hit the frozen View ceiling — ALL subtools
  refused at dispatch, including \`write\`. Writers therefore deliver knowledge-only samples
  inline; the parent materializes files and records the child answer sha256 as the
  collection-time anchor. This is a DEGRADED ensemble mode, not a failure: independence is
  preserved (isolated contexts, no cross-communication), and the provenance record carries
  the degradation honestly.
- A parent verification pass (citation existence + key-number sourcing) is MANDATORY before
  reconciliation consumes any knowledge-only draft.

## 4. Cycle 1 (registered 2026-09-08)

- **Theme:** the energy floor of fault-tolerant quantum computing at the 1,000-logical-qubit scale
  (QNFO.OPS.008 program; extends JPCUB-BENCHMARK-PROGRAM-1 open questions).
- **Title (shared):** "The Energy Floor of Fault-Tolerant Quantum Computing at the
  1,000-Logical-Qubit Scale"
- **Questions (shared):** Q1 Margolus-Levitin per-operation bound + Landauer combination;
  Q2 energy per logical operation for a surface-code 1,000-logical-qubit processor (dominant term);
  Q3 2026 joules-per-compute benchmark revision (energy per logical qubit, not per physical gate).
- **Writers:** writer-a, writer-b, writer-c (isolated DeepChat sessions).
- **Due:** 2026-09-10.

## 5. Claims & Evidence (FRAMEWORK-DOGFOOD-1)

| # | claim | evidence | confidence | status |
|---|-------|----------|------------|--------|
| 1 | Independent-context writers produce genuinely independent drafts (no cross-contamination) | session isolation + sibling-dir prohibition + no git by writers; verified at collection | high | open |
| 2 | Reconciliation with explicit claim attribution + reported divergences is achievable in one pass | RECONCILIATION.md of cycle 1 | medium | open |
| 3 | Ensemble research yields measurably better calibrated claims than single-pass writing | cycle-1 convergence/divergence record vs prior single-pass papers (qualitative) | low | open |
