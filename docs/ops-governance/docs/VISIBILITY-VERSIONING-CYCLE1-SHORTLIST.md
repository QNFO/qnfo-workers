# Visibility Program — Cycle 1: Tier-1 Flagship v-Next Shortlist

> Version 1.0 (2026-09-02) · Owner: QNFO · Status: ACTIVE (candidate shortlist for cycle 1)
> Claim: the three highest-leverage existing papers for the next meaningful new versions are
> QNFO.JPC.003 (Error Correction Is a Landauer Machine), QNFO.UMP.012 (Locale Framework Applied to
> Quantum Computing), and QNFO.UMP.014 (Distinction-Based Ultrametric), ranked by version-churn
> evidence, program centrality, domain leverage, and audience fit.
> Evidence: living-paper D1 + portfolio-state registry + qnfo-graph KG + Zenodo authoritative probe
> 2026-09-02 (this session) · Confidence: medium (traffic scorecard P7 not yet built — proxies used)
> Status: shortlist; first v-next not yet produced
> Companion: docs/VISIBILITY-VERSIONING-PROGRAM.md (d519b11)

---

## 1. Ranking signals and their limits

Ranked with four proxies because per-paper honest traffic is not yet instrumented (P7 scorecard is a
planned pipeline change in the program plan):

1. Version-churn evidence (papers that already carry many versions demonstrably re-surface: v1.6 /
   v1.4 / v1.3 / 2.4.0 in corpus).
2. Program centrality (registry QNFO.<PROG>.<NUM> rows + KG node degree).
3. Domain leverage (cross-domain bridge potential per CROSSWALK-TRANSLATION-1, TERMINOLOGY-SILO-1).
4. Audience fit across the three targets (academics / practitioners / students).

Limits: living-paper citations table is bibliography scaffolding (0 rows — no usable citation-count
signal); KG degree counts intra-corpus links, not external citations. P7 (honest visibility
scorecard, program plan P7) must add real per-paper traffic before the cycle-2 ranking.

## 2. Tier-1 shortlist (top 3 candidates)

### #1 — QNFO.JPC.003 · Error Correction Is a Landauer Machine
| Field | Value |
|---|---|
| Current version | v1.6 (record 10.5281/zenodo.22117282; concept 10.5281/zenodo.22109034) |
| Registry status | published · updated 2026-08-26 |
| KG presence | paper:jpcub-qec-landauer (degree present; JPCUB program active) |
| Version churn | HIGHEST in corpus (v1.6) — churn engine already proven |
| Why v1.7 | (A) evidence: refresh JPCUB thermodynamic-floor numbers if benchmark moved; (C) state-of-field:
  QEC energy floor feeds architecture decisions (CWI decks priced everything except energy — direct
  bridge to The Unpriced Column); (B) practitioner: one-page QEC-overhead cost takeaway |
| Audiences | academics (thermo/QEC theory) + practitioners (QEC architects, energy budgets) + students
  (accessible floor derivation) |

### #2 — QNFO.UMP.012 · Locale Framework Applied to Quantum Computing
| Field | Value |
|---|---|
| Current version | v0.5 (record 10.5281/zenodo.22238755, published 2026-09-01 via errata path) |
| Registry status | active · updated 2026-09-02 |
| Why v0.5.1 / v0.6 | (B) reach: cross-domain locale-theory-to-quantum-applications bridge is fresh and
  currently under errata-driven churn; (C) state-of-field: first post-errata response cycle; (D)
  metadata: living-paper zenodo_doi is STALE (v0.4 21991270) — fix in same cycle (see finding F-1) |
| Audiences | academics (locale theory) + practitioners (quantum computing innovations) + students
  (practical applications section) |

### #3 — QNFO.UMP.014 · The Distinction-Based Ultrametric (surviving empirical claim)
| Field | Value |
|---|---|
| Current version | 1.0 (record 10.5281/zenodo.22150472) |
| Registry status | published · updated 2026-08-28 |
| KG presence | paper:distinction-based-ultrametric (degree 7) + distinction-based-ultrametric registry row |
| Why v1.1 | (A) evidence: deposit verification artifacts / reproducibility pack for the spectral-estimator
  construction (SPECTRAL-ESTIMATOR-CONSTRUCTION-1 canonical P3-exec); (B) reach: statistical method is
  reusable by practitioners; worked example for students |
| Audiences | academics (empirical claim + method) + practitioners (statistical test reuse) + students
  (worked example) |

## 3. Alternates (queue for cycle 2, after P7 scorecard exists)

- Trapped-Ion Ultrametric Testbed (QNFO — v1.4; highest KG degree in corpus at 22 edges;
  falsifiability register speaks to trapped-ion practitioners) — cycle 2 candidate.
- The $1,032 Research Program (v1.3; meta-science lessons, strong student/practitioner AI-science
  appeal) — needs an (A) evidence or (C) state-of-field delta, not churn alone.
- The Universal Ignorance Audit (concept 10.5281/zenodo.21878942, v0.4 = 10.5281/zenodo.22158133)
  — framework paper; queue social companion already exists (social_threads id 10 queued).

## 4. Findings from this session (verified, with evidence)

- F-1 STALE DOI (living-paper): locale-framework row zenodo_doi = 10.5281/zenodo.21991270 (v0.4) but
  authoritative Zenodo head = 10.5281/zenodo.22238755 (v0.5, concept 21985455). Registry correct.
  Evidence: Zenodo API probe 2026-09-02. Owner: the v-next publish cycle for #2 must write the head
  DOI to living-paper in the same cycle (REGISTRY-LAG-PARITY-1).
- F-2 DOI-convention inconsistency: for Landauer + CWI, living-paper stores the CONCEPT DOI while
  registry stores the RECORD DOI (both resolve to the same concept). Not a defect per se
  (ZENODO-CONCEPT-DOI-CITE-1 allows concept for citation), but stores disagree on convention —
  normalize to record DOI at next publish (documented; not mutated this cycle).
- F-3 citations tables are scaffolding (living-paper citations = 0 rows; citation_edges = 4 rows).
  External citation impact must come from qnfo-citation-watch / L4 qnfo-impact (unbuilt) — P7 scope.
- F-4 CWI DOI previously in doubt (living-paper 22121555 vs registry 22121556) RESOLVED: record =
  22121556, concept = 22121555; registry correct. No action needed.

## 5. Claims and evidence

| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| Landauer v1.6 is highest-churn flagship | living-paper version column + Zenodo API (22117282 v1.6) | high | verified |
| Locale v0.5 is current head | Zenodo API 22238755 v0.5 2026-09-01; registry QNFO.UMP.012 | high | verified |
| Living-paper locale DOI stale (v0.4) | Zenodo API 21991270 v0.4 2026-08-18 vs 22238755 | high | verified (finding F-1) |
| CWI record = 22121556 | Zenodo API concept 22121555 -> record 22121556 | high | verified (finding F-4) |
| Distinction-based ultrametric is corpus-central | KG degree 7 + registry QNFO.UMP.014 published | medium | verified |
| Per-paper traffic not yet instrumented | P7 scorecard planned, not built | n/a | planned |

---

*Canonical repo: QNFO/qnfo-ops (docs/VISIBILITY-VERSIONING-CYCLE1-SHORTLIST.md). Program plan:
docs/VISIBILITY-VERSIONING-PROGRAM.md (d519b11).*
