# INT-HRAW-001 — Heterogeneous Redundant AI Workflow (HRAW)

Integration item for the QNFO fleet ("Quniverse" = Cloudflare account / fleet substrate).
Status: **PROPOSED** (not ratified) · Owner: qnfo-ops · Date: 2026-09-14
Origin: user directive 2026-09-14 — "AI workflows should resemble the redundancy built into
aerospace control systems, where multiple independent sensors cross-check each other to
prevent a single erroneous reading from dictating the craft's trajectory" → "add this to the
list of things that the autonomous system needs to integrate".

Filed as a **new dated document** rather than an edit to `docs/INTEGRATION-PLAN-2026-09-13.md`,
per the fleet's own convention (corrections and additions ship as new documents; dated
artefacts are not rewritten in place).

---

## 0. What is being integrated

An oversight architecture in which N heterogeneous AI channels independently produce a
structured answer, and a **non-voting arbiter** aggregates them, with **measured** error
correlation as the admission criterion for the ensemble.

**The load-bearing correction to the aerospace analogy:** the operative property is
*independence*, not *redundancy*. Redundant channels that fail by the same mechanism vote
unanimously for the wrong answer. Redundancy without independence = one sensor with extra
copies. Independence in avionics is certified by physics; in AI it must be certified by
*measurement*, because correlation is an emergent property of shared training data.

### Design commitments
| # | Commitment | Meaning |
|---|---|---|
| C1 | Independence, not duplication | Channels differ in data lineage, architecture, alignment, vendor |
| C2 | Vote is last, not first | Channels emit structured outputs; aggregation is a separate stage |
| C3 | The arbiter is not a voter | No generative LLM judge (self-preference bias) |
| C4 | Correlation is measured, not assumed | CAPA-style error correlation estimated on ground truth |
| C5 | Disagreement is a signal | Escalate rather than force consensus |

### Layers
L0 task intake + risk class · L1 heterogeneous channel pool (min 3, 5 for high risk) ·
L2 structured output + uncertainty encoding · L3 correlation-aware arbiter
(agreement analyzer / weighted consensus `w_i ∝ acc_i / Σ_j ρ_ij` / disagreement detector) ·
L4 adversarial "inverted sensor" whose job is to falsify the consensus ·
L5 audit + weight update.

### Anchors
- Goel et al., *Great Models Think Alike and this Undermines AI Oversight*, arXiv:2502.04313
  (ICML 2025) — introduces **CAPA** (Chance-Adjusted Probabilistic Agreement); oversight gain
  degrades with error correlation.
- Panickssery, Bowman & Feng, *LLM Evaluators Recognize and Favor Their Own Generations*,
  arXiv:2404.13076 (NeurIPS 2024) — self-recognition capability correlates linearly with
  self-preference bias; grounds C3.
- Luo et al., arXiv:2505.05103v1 — Weighted Byzantine Fault Tolerance for multi-LLM networks.
  Borrowed: adaptive voting weights. Not borrowed: blockchain consensus framing. It does not
  address correlated (non-adversarial) error.

---

## 1. The fleet already implements ~half of this (evidence)

| Existing asset | What it already provides | What HRAW adds |
|---|---|---|
| `qnfo-ensemble-research` (ACTIVE, registered 2026-09-08) | `INDEPENDENCE-1` hard gate: N≥3 isolated writer contexts, no cross-communication, no sibling-dir reads; `RECONCILE-1` claim-attribution table; divergence reported not resolved | **Measurement.** Its own Claims table row 1 — "independent-context writers produce genuinely independent drafts" — is marked confidence *high*, status **open**: asserted by construction, never quantified. |
| `qnfo-ai` 5.27.0 | capability `ensemble`, `pinned-models`, `model-router`, `tool-gateway` | A channel-diversity *policy* on top of the existing router (W-H2) |
| `qnfo-proof` 0.1.0 | adversarial proof ledger: prover/verifier challenge cycles, taint tracking, hash-chained events | The C3-compliant arbiter substrate (replaces an LLM judge) |
| `qnfo-paper-reviser` 1.2.1 | adversarial revision loop to `version_queue` | Precedent for L4 (the "inverted sensor" already exists in the publication path) |
| `qnfo-ai-calibration` 1.1.5 → `ai_calibration_results` (9,268 rows) | Existing ground-truth probe harness across models | The natural home for ρ estimation (W-H1) |
| `integration_state` v1.2.4 (id 62, 2026-09-14T14:17:34Z, fleet_size 55, 11 chains) | The producer→consumer contract with numeric ceilings | A 12th chain: ensemble → reconciliation (W-H5) |
| `governance_kernel` v2026-09-01.1, 13 gates, ACTIVE | Versioned write + rollback boundary | Gate `INDEPENDENCE-MEASURED-1` (W-H4) |

**Therefore HRAW is not a new subsystem.** It is (a) a measurement added to an existing pilot,
(b) a policy on an existing router, and (c) a gate in an existing kernel.

## 2. The gap

No error-correlation metric exists anywhere in the fleet. Independence is *asserted by
construction* (session isolation, sibling-directory prohibition) but never *quantified* on the
task distribution. Without ρ, the ensemble's payoff — exponential error suppression in N — is
an assumption, and `P(ensemble error) = p` (the fully-correlated case) cannot be ruled out.

## 3. Fleet-specific adversarial finding (falsifies the easy version)

The available channel pool is drawn from a **single gateway/vendor catalog**. Models observed in
live gateway traffic (`ai_gateway_failures`): `@cf/baai/bge-base-en-v1.5`,
`@cf/qwen/qwen2.5-coder-32b-instruct`, `@cf/qwen/qwen3.8-27b`, `@cf/moonshotai/kimi-k2.6`,
`@cf/moonshotai/kimi-k2.7-code`, `@cf/zai-org/glm-5.2`, `@cf/google/gemma-4-26b-a4b-it`.

Consequence: diversity axis 1 (training-data lineage) and axis 3 (vendor/alignment pipeline)
are **not currently available** on this fleet. Whatever N is chosen today, ρ is high *by
construction*, and the aerospace analogy fails on exactly the axes that matter. Selecting N
models from one catalog is the "one sensor with extra copies" failure mode, instantiated.

## 4. Integration workstreams

| ID | Workstream | Target | Acceptance |
|---|---|---|---|
| W-H1 | CAPA-style ρ estimator on the calibration harness | `qnfo-ai-calibration` → new `ai_correlation_matrix` | ρ_ij written for ≥5 model pairs with n≥100 ground-truth items |
| W-H2 | Channel-diversity policy: declared lineage/vendor/arch per pinned model; router refuses an ensemble whose pairwise lineage overlap exceeds threshold | `qnfo-ai` router | an ensemble request with ≥2 models of the same lineage is rejected with a structured reason |
| W-H3 | Arbiter = `qnfo-proof`, never a generative judge | `qnfo-proof` + caller | aggregation decisions carry a proof-ledger entry; no LLM judge in the arbitration path |
| W-H4 | Gate `INDEPENDENCE-MEASURED-1` | `governance_kernel` (versioned write + rollback) | gate blocks any ensemble promotion whose ρ exceeds threshold; decision logged to `gov_gate_log` |
| W-H5 | 12th integration chain: `ensemble → reconciliation` with a ceiling | `integration_state` | chain appears in the contract with producer/consumer/medium/ceiling and reports healthy |
| W-H6 | Extend pilot provenance: per-writer CAPA in `MANIFEST.json`; close Claims row 1 with a number | `QNFO/qnfo-ensemble-research` | cycle-2 MANIFEST.json carries per-writer agreement + chance-adjusted agreement |

## 5. Falsifiable predictions

1. **Independence beats redundancy.** For a fixed task distribution, 3 channels with low ρ beat
   5 highly correlated channels on ensemble error. *Falsified if* the 5-channel correlated
   ensemble wins.
2. **Correlation penalty beats uniform weighting.** `w_i ∝ acc_i / Σ_j ρ_ij` beats uniform
   weighting when errors are correlated. *Falsified if* uniform wins on held-out tasks.
3. **The adversarial channel catches consensus errors.** L4 reduces the rate at which
   correlated errors become final outputs. *Falsified if* false-consensus rate is unchanged.

## 6. Registration

- D1 `agent_issues`: `INT-HRAW-001` (source `ops-exec/2026-09-14-user-directive`,
  category `architecture-integration`, status `open`).
- D1 `fleet_improvements`: target `qnfo-ai`, kind `architecture`, status `proposed`.
- Workspace: `ops-workspace/research/hraw/INT-HRAW-001.md`.
- Repo: this file.
Per ADR-2026-008 (D1 canonical over R2/files) the **D1 registration is the load-bearing act**;
this document and the workspace copy are the evidence layer.

## 7. Honest limits

- `qnfo-ai` advertises an `ensemble` capability; I did **not** read its implementation (bundle
  over the read cap). It may already perform voting. Whether it measures correlation is
  **unknown**, not "no".
- CAPA requires ground truth. `ai_calibration_results` is a *probe* harness, not a curated
  benchmark; the mapping "calibration rows → CAPA ground truth" is a **hypothesis**, not a
  verified route.
- No deploy tool on the ops endpoint: W-H2/W-H3 are staged, not shipped.
- **Strongest counter-argument:** the fleet's live failure modes are sensing and coordination
  defects (probe coverage, ledger splits), not ensemble error. HRAW improves a *decision
  quality* path that is not currently the binding constraint; it may be premature relative to
  the ranked remediation plan.
- Registration is hedged across two stores because the 2026-09-13 record reported
  `fleet_improvements` as a dead queue (75 un-executed, zero drain) while the 2026-09-14 read
  shows `done=47`, i.e. a consumer now exists. The store's liveness changed within 24h.
