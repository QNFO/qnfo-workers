# AUDIT — Autonomous Research Pipeline vs Established Ops Procedures
# Date: 2026-09-09 | Session: pipeline-quality-remediation | Verdict: FAIL (autonomous << ops)

## 1. Scope
Compare the autonomous Cloudflare research pipeline (qnfo-research-exec v0.5.17 + satellites)
against the established ops research procedures (research skill v2.151, Phases 0-5) and the
user directive: autonomous papers must be indistinguishable from locally (ops) generated papers.

## 2. Evidence (all primary, read this session)

### F1 [HARD] Single-shot generation, no ensemble/iteration/feedback
- qnfo-research-exec worker.js: genNote() + genPaper() are ONE model call each
  (runModel -> gatewayPaper fallback). No ensemble, no reviewer, no revision loop.
- research_queue.revise_count = 0 for ALL 19 published rows (2026-09-01..09-08).
- PAPER_PROMPT line: "Mark any quantitative claim not yet computed with [to verify]"
  — the pipeline is DESIGNED to publish unverified quantitative claims.

### F2 [HARD] No literature grounding
- The worker never queries arXiv, the QNFO corpus (Vectorize qwav-research-v2), OpenAlex,
  or Crossref. References come from model memory only (hallucination-prone, unverified).
- Canonical case TETRIS-Q (10.5281/zenodo.22658273): the pipeline summarized arXiv
  2609.05226v1 WITHOUT fetching it — the paper itself admits "could not be independently
  verified at the time of this analysis [to verify]".

### F3 [HARD] No computation/simulation/quantitative justification
- Zero computational execution anywhere in the pipeline. Results sections carry projected
  numbers. TETRIS-Q: 4x "[to verify]" markers covering every quantitative claim.
- 10 papers in living-paper carry "[to verify]" in body_md.
- Violates COMPUTATIONAL-VERIFICATION-1 (user mandate 2026-08-19).

### F4 [HARD] Stub scale
- Auto-papers are 6.3-8.9 KB body_md (TETRIS-Q 8898, Ising-anyon 6403, energy-floor 6298).
- Ops papers are 20 KB+ with artifacts/verification/.
- 749/1045 papers in living-paper have NO "## References" section.

### F5 [HARD] No GitHub artifact saving
- No worker in the fleet pushes research artifacts to GitHub program repos.
- PROVENANCE standard exists (QNFO/qnfo-ensemble-research/PROVENANCE.md, 2026-09-08) but
  is implemented only as a manual session procedure.
- qnfo-code-agent (GitHub REST write, GITHUB_TOKEN) and qnfo-containers-pilot (Python 3.12
  sandbox) are LIVE but NOT wired into the research pipeline.

### F6 [SOFT] Ensemble pilot published the wrong artifact
- ENSEMBLE-001 pilot (2026-09-08) produced a 17.7 KB reconciled paper in the repo, but the
  published Zenodo record 10.5281/zenodo.22660750 body is 6.3 KB WITH a [to verify] marker —
  the single-shot path published instead of the reconciled ensemble output.

### F7 [SOFT] Post-publish revision loop disconnected
- qnfo-paper-reviser exists (surgical edits, 3/4h) but auto-papers never enter it before
  or after publish; revise_count stays 0.

## 3. Established baseline (what ops does that autonomous does not)
research skill Phases: 0 repo init + project plan; 1 due diligence (QNFO cross-reference +
external literature search, multi-formulation); 1b consilience/silo detection; 2 multi-source
literature search + triage (8 sources parallel); 3 citation management (P3.AUTHOR-GATE);
4 deep research + structured forecast (likelihood calibration, counterfactual backcasting);
5 publication pipeline (COMPUTATIONAL-VERIFICATION-1: every quantitative claim verified in
code, artifacts/verification/ deposited; adversarial red-team review; provenance completeness;
professional PDF; post-publish frontmatter assert).

## 4. Remediation (see docs/PIPELINE-V2-SPEC.md, implemented research-exec v0.6.0)
Ground -> Ensemble(3 legs) -> Reconcile -> Adversarial-review loop (<=2 cycles) ->
Compute-verify (containers-pilot Python) -> Publish (extended provenance) -> GitHub push.

## 5. Failure modes of this audit
- Claims about worker internals rest on reading the deployed bundle source at repo HEAD;
  if a concurrent session redeployed research-exec mid-audit, line references could shift
  (verified /health version 0.5.17-research-restored matches the read source).
- Corpus counts are point-in-time D1 reads under concurrent writers.

