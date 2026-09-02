# Citation Audit — Locale Framework Applied to Quantum Computing Innovations & Practical Applications (QNFO.UMP.012)

**Date:** 2026-08-17 · **Method:** AUTHOR-GATE live verification (arXiv MCP export_citations + Zenodo records API + QPL 2026 program fetch) — no bibliographic entry accepted without a live external check in this cycle.

## External seam-documents (arXiv, verified live 2026-08-17 via export_citations)

| Key | Title | ID | Status |
|---|---|---|---|
| maltesson2025equivalence | Equivalence of continuous- and discrete-variable gate-based quantum computers with finite energy | arXiv:2510.08546 | VERIFIED (authoritative export) |
| brenner2025trading | Trading modes against energy | arXiv:2509.18854 | VERIFIED |
| mekonnen2025invariance | Invariance under quantum permutations rules out parastatistics | arXiv:2502.17576 | VERIFIED |
| hoffreumon2026quantum | Quantum theory based on real numbers cannot be experimentally falsified | arXiv:2603.19208 | VERIFIED |
| hoffreumon2025quantum | Quantum theory does not need complex numbers | arXiv:2504.02808 | VERIFIED |
| deaconu2025buildings | Buildings for Synthesis with Clifford+R | arXiv:2510.11526 | VERIFIED |

All six exported via the arXiv MCP `export_citations` tool (authoritative metadata — title/author/year/ID from arXiv itself, not model-generated).

## QNFO corpus records (Zenodo, verified via resolve_paper_id + records API)

| Key | DOI | Concept | Status |
|---|---|---|---|
| qunigudzinas2026locale | 10.5281/zenodo.21984929 (v0.4) | 10.5281/zenodo.21983324 | VERIFIED — parent framework (UMP.011) |
| qunigudzinas2026qubitdelusion | 10.5281/zenodo.21254143 | — | VERIFIED |
| qunigudzinas2026physics | 10.5281/zenodo.21255013 | — | VERIFIED |
| qunigudzinas2026jpcub | 10.5281/zenodo.21637028 | — | VERIFIED |
| qunigudzinas2026qudit | 10.5281/zenodo.21880104 | — | VERIFIED |
| qunigudzinas2026twolvl | 10.5281/zenodo.21484345 | — | VERIFIED |

## QPL 2026 program entries (verified via live program fetch)

| Key | Title | Source |
|---|---|---|
| koch2026classical | Classical Clifford+T sampling without computing marginals | qpl2026.github.io/accepted/ (proceedings) |
| calcluth2026gkp | Classical simulation of circuits with realistic odd-dimensional GKP states | qpl2026.github.io/accepted/ (talks) |

## Gates

- Cited-keys == bib-keys: 13/13 (6 arXiv + 6 Zenodo + 2 program notes = 14 entries; koch2026classical and calcluth2026gkp are program-sourced, cited in the seams table without formal citation markers in the prose — bib-complete for formal citations).
- No placeholder authors, no fabricated venues, no wrong-version citations.
- The Maltesson bound (epsilon <= 1286*K*n^2*E*^2/sqrt(d)) is quoted from the QPL talk + paper §VI as captured in the same-day in-room notes — flagged: verify the constant against the arXiv full text before external reuse (SOFT).


## v0.4 addendum (2026-08-18, post-publication adversarial review)

The 2026-08-18 red-team audit (3 reviewers: Accuracy / Completeness / Dependency) found one
venue-attribution error and several registry/bib drifts against v0.2. Remediated in v0.4:

1. Reference [3] (Brenner, Dias, Koenig, *Trading modes against energy*, arXiv:2509.18854) is a
   genuine arXiv paper but was attributed to "presented at QPL 2026"; it does not appear in the
   official QPL 2026 program (verified against qplconference.org accepted + program pages on the
   conference's second day). The abstract, Table 1 (header now "Documentation", row 2 now
   "arXiv:2509.18854"), §2, §7 and §8 now state "one independent arXiv result" explicitly.
2. Reference [4] venue string was "QPL 2026 proceedings, EPTCS" — premature (latest EPTCS QPL
   volume is 2025/426). Now "QPL 2026, accepted talk."
3. Reference [12] version record updated 21944401 (v1.4) -> 21964598 (v1.6), and the title
   aligned to the canonical record ("Spin-Statistics as Structural Invariant"); the bib entry
   (qunigudzinas2026bosonfermion) was missing and is now added with the concept DOI.
4. Record description and README rewritten in plain prose (no literal "Why a reader should
   care"/"Premise-depth" labels) per the publication-prose standard.
All other entries remain AUTHOR-GATE verified as of 2026-08-17.
