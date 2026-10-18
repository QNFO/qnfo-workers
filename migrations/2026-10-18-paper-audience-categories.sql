-- PAPER-AUDIENCE-CATEGORIES-1 (owner directive 2026-10-18, pillar reach): the papers library filed
-- papers by a five-way keyword guess (QEC / Number theory / Physics / CS / Other), and "Other" held 161 of
-- 606 public papers (26%) -- the largest single bucket on the site, telling a reader nothing.
--
-- This table is the canonical shelf assignment for the nine audience fields now shown on papers.qnfo.org.
-- It is data, not code: a wrong shelf is corrected with one UPDATE, no deploy. The gateway reads it first
-- and falls back to its own classifier only for a paper that has no row here (a new paper, before the
-- daily classifier job has seen it).
--
-- method: 'model-pass2' (classified by @cf/meta/llama-3.3-70b-instruct-fp8-fast under an audience-first
-- prompt) or 'curated' (a human/agent review corrected the model). why: the decisive signal, so the
-- assignment can be audited without re-reading the paper.
CREATE TABLE IF NOT EXISTS paper_category (
  slug       TEXT PRIMARY KEY,
  category   TEXT NOT NULL,
  secondary  TEXT NOT NULL DEFAULT '[]',
  confidence INTEGER,
  method     TEXT NOT NULL DEFAULT 'classifier',
  why        TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_paper_category_category ON paper_category(category);

-- Seed: energy 37 | qec 40 | physics 264 | mathematics 131 | logic 39 | ai-epistemics 43 | ai-operations 16 | assessment 12 | synthesis 24  (total 606; no "Other")
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('cascading-bayesian-choke-node-forecasting-for-multi-era-paradigm-shifts', 'assessment', '[]', 80, 'curated', 'curated: foresight method for planners, not an AI system')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('helical-electron-structure-at-the-compton-scale-geometric-origin-of-the-fine-str', 'physics', '["mathematics"]', 90, 'model-pass2', 'electron structure')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('reflection-closure-of-concurrent-line-sets-exact-dihedral-emergence-grid-frequen', 'mathematics', '["physics"]', 85, 'model-pass2', 'symmetry group')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('institutionalized-predictive-jeopardy-an-evolutionary-game-demarcation-criterion', 'ai-epistemics', '["logic"]', 80, 'model-pass2', 'knowledge systems')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('network-tracing-capacity-as-an-informational-event-horizon-a-delay-based-causal-', 'physics', '[]', 85, 'curated', 'curated: networked control theory, not an agent system')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-quantum-computation-for-direct-integer-factorization-a-resource-anal', 'mathematics', '["physics"]', 90, 'model-pass2', 'ultrametric computation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-speed-of-light-as-a-regularization-parameter-of-a-distributed-estimation-vac', 'physics', '["mathematics"]', 85, 'model-pass2', 'speed of light')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('manifold-modulation-for-latent-space-steganography-a-capacity-bound-and-distilla', 'ai-operations', '["mathematics"]', 80, 'model-pass2', 'latent space')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('attractor-calculus-a-formal-operator-language-for-steering-cognition-across-subs', 'ai-operations', '["logic"]', 85, 'model-pass2', 'cognition steering')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('leakage-as-the-price-of-binary-truncation-a-scaling-law-for-transmon-leakage-rem', 'physics', '["mathematics"]', 90, 'model-pass2', 'transmon leakage')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('a-deterministic-interface-model-for-quantum-statistics-born-rule-interference-an', 'physics', '["mathematics"]', 85, 'model-pass2', 'quantum statistics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-oscillator-as-an-element-static-and-dynamical-analyses-of-the-imaginary-bool', 'logic', '["mathematics"]', 80, 'model-pass2', 'boolean value')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('singularity-as-an-epistemic-artifact-finite-cyclic-cosmology-without-actual-infi', 'physics', '["mathematics"]', 80, 'model-pass2', 'cosmology singularity')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('joint-bruhat-tits-tree-product-as-a-candidate-universal-structure-for-standard-m', 'mathematics', '["qec","physics"]', 85, 'model-pass2', 'Bruhat-Tits tree')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-capability-availability-mismatch-three-state-tool-semantics-and-forced-halt-', 'ai-operations', '[]', 90, 'model-pass2', 'LLM agent protocols')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('passive-error-rejection-via-cryo-fluidic-topological-phases-a-feasibility-analys', 'physics', '["qec"]', 85, 'model-pass2', 'quantum error rejection')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('torsion-as-a-candidate-geometric-generator-of-quantum-phase-and-statistics-a-for', 'physics', '["mathematics"]', 80, 'model-pass2', 'quantum phase generator')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('computation-as-hamiltonian-isomorphism-a-mode-based-taxonomy-of-physical-computi', 'physics', '[]', 85, 'model-pass2', 'physical computing substrates')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('local-hilbert-space-dimension-as-a-resolution-parameter-information-theoretic-bo', 'physics', '["mathematics"]', 80, 'model-pass2', 'holographic geometry')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thoughts-as-quantum-informational-hamiltonians-coherence-and-capacity-constraint', 'physics', '["mathematics"]', 75, 'model-pass2', 'quantum cognition model')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('time-as-epistemic-emergence-on-a-p-adic-bruhat-tits-tree-static-constraint-count', 'physics', '["mathematics"]', 80, 'model-pass2', 'p-adic time emergence')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('functoriality-as-a-transform-register-and-gate-cost-analysis-of-a-langlands-stru', 'mathematics', '["physics"]', 85, 'model-pass2', 'adelic quantum register')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ostrowski-s-classification-as-a-selection-rule-a-falsifiable-program-for-the-ade', 'mathematics', '["physics"]', 80, 'model-pass2', 'Ostrowski classification')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('functorial-invariance-across-presentations-of-the-prime-numbers-with-context-rel', 'mathematics', '[]', 90, 'model-pass2', 'prime numbers presentations')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-silent-radix-is-not-a-key-a-security-analysis-of-unknown-radix-encoding-as-a', 'mathematics', '["logic"]', 80, 'model-pass2', 'numeral systems')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-algebraic-origin-of-zitterbewegung-a-hierarchy-of-ownership-from-clifford-st', 'physics', '["mathematics"]', 90, 'model-pass2', 'quantum particle')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-adele-analogy-for-epistemic-boundaries-local-models-a-restricted-product-of-', 'ai-epistemics', '["mathematics"]', 85, 'model-pass2', 'epistemic boundaries')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('physical-irrelevance-of-uncountability-computable-reals-suffice-for-continuum-ph', 'physics', '["mathematics"]', 95, 'model-pass2', 'continuum physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('hindsight-hierarchies-for-reasoning-models-a-quantitative-yield-and-trajectory-a', 'ai-operations', '["logic"]', 80, 'model-pass2', 'reasoning models')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('relaxation-in-noisy-quantum-maps-versus-classical-iterative-algorithms-a-shared-', 'physics', '["energy"]', 85, 'model-pass2', 'quantum maps')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('what-a-fairness-audit-must-report-when-demographic-labels-are-missing-assumption', 'ai-epistemics', '["assessment"]', 90, 'model-pass2', 'fairness audit')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('two-level-system-defects-as-a-random-ensemble-counting-and-dephasing-estimates-f', 'physics', '["qec"]', 85, 'model-pass2', 'qubit defects')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('beyond-the-qubit-part-ii-a-constructive-research-programme-for-post-particle-com', 'synthesis', '["physics","qec"]', 70, 'model-pass2', 'post-qubit computation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('scaling-of-the-hadamard-deformation-space-in-concatenated-4-1-2-iceberg-codes-ex', 'qec', '["mathematics"]', 95, 'model-pass2', 'quantum error correction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quantifying-the-reuse-barrier-in-published-omics-data-dispersal-cost-and-feasibi', 'ai-operations', '["assessment"]', 80, 'model-pass2', 'data reuse')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('bottling-as-an-investment-decision-an-analytical-reanalysis-of-cost-quality-trad', 'assessment', '[]', 85, 'curated', 'curated: investment/cost-quality decision')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('lifetime-as-a-placement-signal-a-reconciled-analytical-study-of-endurance-budget', 'ai-operations', '["energy"]', 80, 'model-pass2', 'LLM serving')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('what-must-a-quantum-memory-decoder-know-about-temporally-correlated-noise-a-reco', 'qec', '["physics"]', 90, 'model-pass2', 'quantum memory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('emergent-complex-contagion-fast-variable-reduction-as-a-unifying-principle-for-e', 'synthesis', '[]', 70, 'curated', 'curated: cross-domain modelling principle')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('time-as-bruhat-tits-tree-depth-discrete-p-adic-temporal-ordering-and-tree-geodes', 'mathematics', '["physics"]', 85, 'model-pass2', 'p-adic temporal')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('non-computable-reals-as-projection-artifacts-a-reconciled-framework-for-tree-to-', 'mathematics', '[]', 80, 'model-pass2', 'continuum construction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('re-deriving-quantum-entanglement-from-classical-radon-nikod-m-hydrodynamics-a-fo', 'physics', '[]', 85, 'model-pass2', 'quantum entanglement')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('factoring-hardness-as-a-bayesian-prior-a-decision-theoretic-model-of-post-quantu', 'mathematics', '["ai-operations"]', 75, 'model-pass2', 'post-quantum crypto')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quantization-as-hydrodynamic-relaxation-eigenstates-as-attractor-basins-in-a-dis', 'physics', '[]', 85, 'model-pass2', 'hydrodynamic relaxation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamic-divergence-of-active-quantum-error-correction-overhead-a-kapitza-l', 'energy', '["qec"]', 90, 'model-pass2', 'thermodynamic overhead')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('frequencies-of-events-in-the-actual-world-a-reconciled-cross-domain-framework-wi', 'mathematics', '[]', 70, 'model-pass2', 'event frequencies')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('a-cost-model-benchmark-for-mixed-state-quantum-simulation-workloads-entanglement', 'energy', '["qec"]', 80, 'curated', 'curated: cost model of simulation workloads')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-quantum-error-correction-on-bruhat-tits-trees-energy-barriers-classi', 'qec', '["mathematics","energy"]', 85, 'model-pass2', 'ultrametric qec')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('flag-structures-and-the-flagging-act-a-cross-domain-survey-with-explicit-countin', 'mathematics', '["logic"]', 80, 'model-pass2', 'flag math objects')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('automorphisms-and-scaling-transformations-a-re-entry-analysis-across-algebraic-g', 'mathematics', '["physics"]', 85, 'model-pass2', 'algebraic varieties')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('vertex-anchored-geometry-discrete-extremal-points-as-the-organizing-primitive-of', 'mathematics', '["physics"]', 90, 'model-pass2', 'ultrametric geometry')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('holographic-quantum-error-correction-on-bruhat-tits-trees-a-conditional-threshol', 'qec', '["mathematics","physics"]', 95, 'model-pass2', 'holographic QEC')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('distinction-discretisation-and-the-cost-of-law-a-quantitative-sketch-of-approxim', 'logic', '["mathematics","physics"]', 85, 'model-pass2', 'distinction formalism')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('appearance-under-relativistic-motion-a-quantitative-re-examination-across-thermo', 'physics', '["mathematics"]', 90, 'model-pass2', 'relativistic motion')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('re-entry-as-a-binary-prohibition-law-a-reconciled-formal-analysis-of-two-convent', 'logic', '["mathematics"]', 80, 'model-pass2', 'binary prohibition law')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('falsification-criteria-for-quantum-advantage-claims-an-effective-criterion-audit', 'ai-epistemics', '["physics"]', 95, 'model-pass2', 'falsification criteria')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('re-entry-modes-in-solid-state-quantum-devices-a-calculus-of-distinctions-with-fu', 'physics', '["logic","mathematics"]', 85, 'model-pass2', 're-entry modes')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-p-adic-noise-structure-and-heisenberg-limited-quantum-metrology-erro', 'physics', '["mathematics"]', 90, 'model-pass2', 'ultrametric noise')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-zitterbewung-p-adic-regularization-of-dirac-trembling-motion-and-the-prod', 'physics', '["mathematics"]', 90, 'model-pass2', 'adic regularization')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ontological-re-entry-what-can-we-say-exists', 'logic', '[]', 80, 'model-pass2', 'ontological re-entry')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('what-makes-a-measure-genuinely-natural-bits-nats-and-the-audit-of-naturalness-cl', 'ai-epistemics', '["mathematics"]', 80, 'model-pass2', 'auditing claims')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('optimal-radix-q-under-resource-constraints-a-reconciled-derivation-fram-d0297e34', 'mathematics', '["physics"]', 90, 'model-pass2', 'ultrametric hierarchies')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ensemble-drafting-under-broadcast-control-throughput-algebra-variance-reduction-', 'ai-operations', '["mathematics"]', 85, 'model-pass2', 'ensemble control')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ensemble-drafting-a-draft-then-verify-framework-unifying-population-level-ensemb', 'ai-operations', '["mathematics"]', 85, 'model-pass2', 'ensemble drafting')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('population-level-methods-for-structured-ensembles-from-chaotic-dna-inversions-to', 'ai-operations', '["physics"]', 80, 'model-pass2', 'population methods')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-price-of-the-digital-abstraction-entropy-and-encoding-overhead-when-discrete', 'qec', '["physics"]', 90, 'model-pass2', 'quantum error correction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-factorization-of-quantum-dynamics-across-all-completions-of', 'mathematics', '["physics"]', 95, 'model-pass2', 'adelic factorization')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-calibration-loop-as-fixed-point-ontological-underdetermination-of-the-qubit-', 'physics', '["logic"]', 80, 'model-pass2', 'qubit metrology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thresholded-readout-of-continuous-classical-fields-a-formalization-and-counterex', 'physics', '["logic"]', 85, 'model-pass2', 'foundational programs')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('deductive-verification-of-discrete-time-quantum-walk-simulators-contracts-cost-b', 'qec', '["logic"]', 90, 'model-pass2', 'quantum walk simulators')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-geometry-as-passive-quantum-error-correction-bruhat-tits-qudit-codes', 'qec', '["mathematics"]', 95, 'model-pass2', 'passive quantum error correction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('critical-values-on-a-non-uniform-number-line-bifurcation-markers-normalization-d', 'physics', '["mathematics"]', 85, 'model-pass2', 'non-uniform number line')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zitterbewegung-as-a-p-adic-ultrametric-observable-a-mathbb-z-2-invariant-on-the-', 'mathematics', '["physics"]', 80, 'model-pass2', 'p-adic ultrametric')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-consistency-conditions-across-primes-as-a-candidate-selection-principle-f', 'physics', '["mathematics"]', 85, 'model-pass2', 'physical constants')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('probe-before-commit-interactive-diagnostic-probing-as-a-decision-theoretic-found', 'ai-operations', '[]', 90, 'model-pass2', 'LLM task routing')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zitterbewegung-as-an-archimedean-2-adic-adelic-mixing-signature-spectral-gap-for', 'physics', '["mathematics"]', 85, 'model-pass2', 'Zitterbewegung mixing')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('operational-circularity-of-qubit-ontology-excitations-defined-by-their-own-reado', 'physics', '["logic"]', 80, 'model-pass2', 'qubit ontology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('structured-cross-domain-translation-as-a-testable-consilience-mechanism-protocol', 'ai-epistemics', '[]', 85, 'curated', 'curated: consilience mechanism for claims')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-base-state-hypothesis-a-falsification-protocol-for-a-substrate-capable-of-ho', 'physics', '[]', 90, 'model-pass2', 'Base State Hypothesis')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('numeral-systems-as-evolving-cognitive-technologies-error-propagation-compactness', 'mathematics', '[]', 95, 'model-pass2', 'numeral systems')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('master-calibration-for-non-overlapping-physical-frameworks-composition-closure-a', 'physics', '["logic"]', 80, 'model-pass2', 'physical frameworks')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('actual-demand-of-a-computational-substrate-a-reconciled-demand-side-and-allocati', 'energy', '[]', 85, 'model-pass2', 'computational substrate')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('semantic-fidelity-an-operational-measure-for-borrowed-quantum-terms-and-the-scal', 'physics', '[]', 90, 'model-pass2', 'semantic fidelity')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('number-systems-as-stratified-distinction-operations-an-enclosure-hierarchy-over-', 'mathematics', '["logic"]', 85, 'model-pass2', 'number systems')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('geometric-confinement-as-a-g-only-baseline-for-superconducting-phenomena-a-re-en', 'physics', '["mathematics"]', 90, 'model-pass2', 'superconducting device')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zitterbewegung-as-archimedean-2-adic-channel-mixing-a-conjectural-adelic-framewo', 'physics', '["mathematics"]', 85, 'model-pass2', 'adelic physics framework')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('completion-invariance-of-physical-ontology-the-rational-base-field-in-quantum-fo', 'physics', '["mathematics"]', 80, 'model-pass2', 'quantum foundations')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('cross-model-llm-convergence-as-bayesian-evidence-for-scientific-claim-correctnes', 'ai-epistemics', '["logic"]', 95, 'model-pass2', 'scientific claim correctness')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('non-anthropocentric-natural-units-for-area-and-information-in-holographic-entrop', 'physics', '["mathematics"]', 90, 'model-pass2', 'holographic entropy bounds')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('is-the-harmonic-oscillator-an-infrared-attractor-in-all-places-a-place-resolved-', 'physics', '["mathematics"]', 85, 'model-pass2', 'harmonic oscillator')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('compression-versus-consilience-in-recursive-model-generated-corpora-a-break-even', 'ai-epistemics', '["mathematics"]', 80, 'curated', 'curated: what model-generated corpora are worth')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('re-entry-dynamics-as-a-switching-process-comparing-hamiltonian-re-entry-computat', 'energy', '["physics"]', 90, 'model-pass2', 'Hamiltonian computation cost')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('passive-signal-as-passive-controller-a-systems-theoretic-feasibility-analysis-of', 'physics', '["mathematics"]', 85, 'model-pass2', 'signal-worker ontology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('gate-check-convergence-a-benchmark-protocol-for-measuring-cross-model-agreement-', 'ai-epistemics', '["logic"]', 95, 'model-pass2', 'cross-model agreement')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('planck-fidelity-the-fundamental-leakage-cost-of-binary-truncation-of-bosonic-lad', 'physics', '["mathematics"]', 90, 'model-pass2', 'Planck fidelity')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('planck-fidelity-fundamental-leakage-cost-of-binary-truncation-of-bosonic-ladders', 'physics', '["mathematics"]', 90, 'model-pass2', 'Planck fidelity')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('in-network-hamiltonian-engineering-for-6g-service-model-quantitative-budgets-and', 'physics', '["mathematics"]', 80, 'model-pass2', 'Hamiltonian engineering')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('parity-protected-superconducting-qubits-at-4-k-a-reconciled-thermodynamic-error-', 'physics', '["energy"]', 85, 'model-pass2', 'thermodynamic error budget')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('is-the-meta-pattern-of-reification-physically-real-a-reconciled-audit-with-a-qua', 'ai-epistemics', '["physics","logic"]', 70, 'model-pass2', 'reification audit')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('is-there-a-p-adic-pi-haar-measure-circle-constants-over-mathbb-q-p-and-an-adelic', 'mathematics', '["physics"]', 90, 'model-pass2', 'p-adic pi')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('re-entry-of-non-markovian-boson-mediated-transport-into-light-harvesting-complex', 'physics', '["mathematics"]', 80, 'model-pass2', 'non-Markovian transport')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('measurement-as-place-crossing-completion-selective-adelic-projection', 'mathematics', '["physics"]', 85, 'model-pass2', 'adelic projection')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('spectral-decomposition-of-the-bruhat-tits-tree-as-a-candidate-origin-of-particle', 'mathematics', '["physics"]', 90, 'model-pass2', 'Bruhat-Tits tree')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-zero-point-phase-as-an-archimedean-factor-of-weil-index-reciprocity-a-formal', 'physics', '["mathematics"]', 80, 'model-pass2', 'zero-point phase')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('a-universal-adelic-normalization-principle-ostrowski-s-product-formula-and-ono-s', 'mathematics', '["physics"]', 90, 'model-pass2', 'adelic normalization')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-p-adic-arithmetic-as-energy-proportional-precision-computing-an-ener', 'energy', '["mathematics"]', 85, 'model-pass2', 'p-adic arithmetic')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamic-bottlenecks-on-floquet-driving-of-superconducting-matter-quasipart', 'physics', '["energy"]', 85, 'model-pass2', 'thermodynamic bottlenecks')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-thermodynamic-wall-heat-dissipation-as-a-boundary-condition-on-quantum-coher', 'physics', '["energy"]', 85, 'model-pass2', 'thermodynamic wall')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermal-quantum-sensing-at-high-temperature-exact-fisher-information-bounds-univ', 'physics', '["mathematics"]', 90, 'model-pass2', 'thermal quantum sensing')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('booklet-cosmological-states-as-random-tensor-codes-recovery-bounds-and-entropic-', 'physics', '["mathematics"]', 85, 'model-pass2', 'cosmological states')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('corrected-condensation-indices-and-the-sixteen-fold-way-a-quantitative-bulk-boun', 'physics', '["mathematics"]', 90, 'model-pass2', 'anyon condensation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('archimedean-constants-as-measure-theoretic-artifacts-of-the-infinite-place-a-rec', 'mathematics', '["physics"]', 80, 'model-pass2', 'Archimedean constants')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('fidelity-budgets-for-discrete-regularizations-of-gauge-theories-exact-single-lin', 'physics', '["mathematics"]', 85, 'model-pass2', 'gauge theories')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('epistemic-disturbance-in-the-graph-model-for-conflict-resolution-state-preservin', 'ai-epistemics', '[]', 70, 'curated', 'curated: epistemic assessment model')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-confidence-game-strategic-miscalibration-in-human-ai-delegation-a-reconciled', 'ai-epistemics', '["logic"]', 80, 'model-pass2', 'human-AI delegation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('emergent-universality-from-symmetric-rules-a-reconciled-analysis-of-rule-110-emu', 'mathematics', '["logic"]', 75, 'model-pass2', 'cellular automaton')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('one-metalogic-many-logics-a-quantitative-pedagogical-framework-for-proof-assista', 'logic', '["mathematics","ai-epistemics"]', 85, 'model-pass2', 'proof-assistant-based logic')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-exponential-arena-a-reconciled-quantitative-account-of-hilbert-space-growth-', 'physics', '["mathematics"]', 90, 'model-pass2', 'Hilbert-space growth')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('degree-bounds-as-a-first-exercise-in-isabelle-ml-metaprogramming-a-reconciled-st', 'logic', '["mathematics","ai-epistemics"]', 85, 'model-pass2', 'metaprogramming')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('decoherence-as-the-ultimate-consequence-of-linear-accumulation', 'physics', '["mathematics"]', 90, 'model-pass2', 'decoherence')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-number-builder-enclosure-sequences-in-the-laws-of-form-calculus-as-a-constru', 'mathematics', '["logic"]', 90, 'model-pass2', 'Laws of Form')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('braid-group-representations-and-the-uniqueness-of-modular-data-the-ising-test-ca', 'physics', '["mathematics"]', 85, 'model-pass2', 'anyon theory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-resource-burden-of-active-quantum-error-correction-a-scaling-analysis-of-qub', 'energy', '["qec"]', 80, 'model-pass2', 'resource burden')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-scaling-paradox-of-surface-code-quantum-error-correction-exponential-suppres', 'qec', '["energy"]', 85, 'model-pass2', 'surface-code QEC')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('error-correction-properties-of-covariant-bosonic-encodings-a-quantitative-assess', 'qec', '["physics"]', 90, 'model-pass2', 'covariant bosonic encodings')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('entanglement-wedge-reconstruction-beyond-the-large-n-limit-via-the-twirled-petz-', 'physics', '["mathematics"]', 85, 'model-pass2', 'entanglement wedge')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('measurement-and-feedforward-quantum-circuits-as-code-design-detectability-branch', 'qec', '["physics"]', 85, 'model-pass2', 'quantum circuits')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('distinguishability-induced-degradation-of-monolithic-quantum-error-correction-a-', 'qec', '["physics"]', 90, 'model-pass2', 'monolithic QEC')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('css-codes-for-quantum-metrology-with-discrete-time-error-correction-a-reconciled', 'qec', '["physics"]', 85, 'model-pass2', 'quantum metrology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quantitative-bulk-boundary-correspondence-for-anyon-condensation-two-computable-', 'physics', '["mathematics"]', 85, 'model-pass2', 'anyon condensation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('braid-group-representations-modular-data-and-the-classification-of-majo-f20a195b', 'physics', '["mathematics"]', 85, 'model-pass2', 'Majorana zero modes')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('planar-bosonic-error-correction-with-heavy-fluxonium-a-quantitative-reassessment', 'qec', '["physics"]', 90, 'model-pass2', 'bosonic error correction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('exact-maximum-likelihood-quantum-decoding-beyond-treewidth-a-reconciled-structur', 'qec', '["mathematics"]', 90, 'model-pass2', 'quantum decoding')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adaptivity-closes-the-stabilizer-learning-gap-an-analytical-account-of-optimal-s', 'qec', '["physics"]', 85, 'model-pass2', 'stabilizer learning')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('a-taxonomy-of-exchange-statistics-from-configuration-space-topology-non-abelian-', 'physics', '["mathematics"]', 80, 'model-pass2', 'exchange statistics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('parallelism-or-concession-a-reconciled-analytical-model-of-concurrency-aware-pro', 'assessment', '[]', 70, 'curated', 'curated: procurement negotiation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('boundary-crossing-paths-as-a-local-computable-bound-on-network-emergence', 'physics', '["mathematics"]', 75, 'model-pass2', 'network emergence')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('low-overhead-quantum-error-correction-with-boundary-connected-planar-modules-a-r', 'qec', '["physics"]', 90, 'model-pass2', 'quantum error correction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('error-attribution-as-a-resource-allocation-principle-for-quantum-error-correctio', 'qec', '["physics"]', 85, 'model-pass2', 'error attribution')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('beyond-pure-dephasing-a-quantitative-analysis-of-two-level-error-correction-for-', 'physics', '["qec"]', 80, 'model-pass2', 'molecular qubits')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('barc-codes-as-algebraically-restricted-coherent-state-constellations-geometry-se', 'qec', '["mathematics"]', 85, 'model-pass2', 'BARC codes')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('a-falsifiability-first-audit-program-for-the-photon-primacy-helical-electron-and', 'ai-epistemics', '["physics","mathematics"]', 80, 'model-pass2', 'falsifiability audit')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quwarp-reconciled-an-analytical-cost-model-assessment-of-workload-level-reuse-pl', 'energy', '["qec"]', 75, 'curated', 'curated: workload-level cost model')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('classical-floquet-drives-from-quantized-cavity-fields-error-budgets-geometric-ph', 'physics', '["qec"]', 80, 'model-pass2', 'Floquet drives')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ensemble-dependence-of-critical-exponents-at-quantum-error-correction-thresholds', 'qec', '["physics"]', 80, 'model-pass2', 'error correction thresholds')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('code-agnostic-graph-neural-network-decoding-from-detection-error-models-a-reconc', 'qec', '["ai-operations"]', 85, 'model-pass2', 'quantum error correction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('from-random-quantum-codes-to-explicit-qld-codes-a-reconciled-threshold-analysis-', 'qec', '["mathematics"]', 90, 'model-pass2', 'quantum code analysis')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('projective-braid-group-representations-from-a-microscopic-long-range-kitaev-chai', 'physics', '["mathematics"]', 85, 'model-pass2', 'braid group representations')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamic-budgeting-for-hybrid-quantum-classical-computing-a-three-layer-ene', 'energy', '["physics","ai-operations"]', 90, 'model-pass2', 'energy budgeting')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('algorithmic-graph-search-design-of-heralded-linear-optical-circuits-for-multipar', 'physics', '["qec"]', 80, 'model-pass2', 'optical circuits')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('coherence-assisted-error-correction-for-deep-learning-a-reconciled-feasibility-a', 'ai-operations', '["qec","energy"]', 85, 'model-pass2', 'hybrid architecture')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('constant-sized-support-magic-state-distillation-with-qubit-recycling-a-reconcile', 'qec', '["energy"]', 90, 'model-pass2', 'magic state distillation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('a-two-index-framework-for-the-bulk-boundary-correspondence-of-anyon-condensation', 'physics', '["mathematics"]', 85, 'model-pass2', 'anyon condensation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adiabatic-superconducting-spiking-architectures-a-reconciled-energy-budget-for-q', 'energy', '["physics","ai-operations"]', 90, 'model-pass2', 'energy budgeting')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('holographic-quantum-error-correction-as-ads-cft-renormalization-group-flow-on-br', 'qec', '["mathematics","physics"]', 85, 'model-pass2', 'holographic quantum error correction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamic-trade-off-frontiers-for-neuromorphic-processors-a-quantum-inspired', 'energy', '["physics"]', 90, 'model-pass2', 'thermodynamic trade-offs')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-p-adic-temperley-lieb-parameter-valuation-theoretic-constraints-and-an-adeli', 'mathematics', '["physics"]', 90, 'model-pass2', 'p-adic valuation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('optimal-radix-q-under-resource-constraints-a-reconciled-derivation-framework-for', 'mathematics', '["physics"]', 85, 'model-pass2', 'ultrametric hierarchies')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-q-generalized-diameter-scaling-exponents-d-q-for-arbitrary-ultrametric-ratio', 'physics', '["mathematics"]', 80, 'model-pass2', 'ultrametric physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('geometric-ratios-as-generators-of-hierarchical-structure-an-arithmetic-audit-of-', 'mathematics', '["physics"]', 90, 'model-pass2', 'arithmetic audit')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('why-vertices-not-points-vertex-anchored-braiding-stabilizer-arithmetic-and-displ', 'mathematics', '["physics"]', 85, 'model-pass2', 'Bruhat-Tits buildings')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('braid-group-representations-and-modular-data-non-uniqueness-finite-images-and-th', 'physics', '["mathematics"]', 80, 'model-pass2', 'braid group representations')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('braid-group-representations-modular-data-and-the-classification-of-majo-5099abb8', 'physics', '["mathematics"]', 80, 'model-pass2', 'topological superconductors')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quniverse-fleet-lessons', 'ai-operations', '[]', 95, 'model-pass2', 'autonomous research')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('statements-to-questions-ai-epistemic-repair', 'ai-epistemics', '[]', 90, 'model-pass2', 'epistemic repair')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('distinction-lattice-framework', 'logic', '[]', 85, 'model-pass2', 'self-reference')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('tetris-q-tiling-based-effective-transient-fault-reduction-and-parallelism-optimi', 'qec', '["physics"]', 80, 'model-pass2', 'quantum circuit mapping')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('braid-group-representations-modular-data-and-the-classification-of-majorana-zero', 'physics', '["mathematics"]', 80, 'model-pass2', 'topological order')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('majorana-zero-mode-parity-the-hexagon-equation-and-chiral-edge-modes-in-2d-topol', 'physics', '["mathematics"]', 90, 'model-pass2', 'anyons in superconductors')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-margolus-levitin-bound-and-energy-time-limits-for-quantum-computation-at-the', 'energy', '["physics"]', 80, 'model-pass2', 'Margolus-Levitin bound')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quantum-computation-latency-energy-tradeoff-and-the-jpcub-metric', 'energy', '["qec"]', 85, 'model-pass2', 'JPCUB metric')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('revising-the-joules-per-compute-jpcub-benchmark-normalizing-energy-efficiency-by', 'energy', '["qec"]', 85, 'model-pass2', 'JPCUB normalization')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('landauer-limit-energy-floor-and-jpcub-normalization-for-cryogenic-quantum-contro', 'energy', '["physics"]', 80, 'model-pass2', 'Landauer limit')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('decoherence-times-and-quantum-speed-limits-in-spin-chain-systems-a-many-body-tes', 'physics', '["energy"]', 80, 'model-pass2', 'decoherence times')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('a-lower-bound-on-energy-cost-per-logical-qubit-operation-in-surface-code-quantum', 'energy', '["qec"]', 85, 'model-pass2', 'surface-code energy')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('distinction-primitive-research-framework', 'mathematics', '["physics"]', 70, 'model-pass2', 'pre-arithmetic framework')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('arithmetic-quantum-thermodynamics', 'mathematics', '[]', 90, 'model-pass2', 'primon-gas dictionary')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('arithmetic-cut-discrimination', 'mathematics', '["physics"]', 70, 'model-pass2', 'arithmetic cut')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('distinction-based-ultrametric', 'mathematics', '["physics"]', 70, 'model-pass2', 'ultrametric hierarchy')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-quantum-arithmetic', 'mathematics', '["physics"]', 70, 'model-pass2', 'adelic quantum arithmetic')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('arithmetic-anyon-contact', 'physics', '["mathematics"]', 80, 'model-pass2', 'anyon physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-quantum-statistics', 'mathematics', '["physics"]', 85, 'model-pass2', 'p-adic physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('post-positional-numeracy', 'mathematics', '[]', 90, 'model-pass2', 'p-adic numeracy')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('completeness-senses-levi-civita', 'mathematics', '[]', 95, 'model-pass2', 'non-Archimedean')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('jpcub-qec-landauer', 'energy', '["qec"]', 80, 'model-pass2', 'Landauer limit')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('terminology-silos-consilience', 'ai-epistemics', '[]', 85, 'model-pass2', 'vocabulary audit')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-program', 'mathematics', '["physics"]', 80, 'model-pass2', 'ultrametric structure')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('keyword-taxonomy-consilience', 'ai-epistemics', '[]', 85, 'model-pass2', 'consilience test')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('finite-distinction-quantum-mechanics', 'physics', '["mathematics"]', 80, 'model-pass2', 'finite-distinction physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ai-accelerated-research', 'ai-operations', '[]', 90, 'model-pass2', 'AI research program')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('visual-graphs-vs-matrices-epistemic-design', 'logic', '[]', 85, 'model-pass2', 'cognitive preference')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('self-referential-scalar-family', 'mathematics', '["physics"]', 80, 'model-pass2', 'Adelic picture')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('relaxation-equation-mechanism', 'physics', '[]', 90, 'model-pass2', 'quantum mechanics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ai4metascience-ignorance-audit', 'ai-epistemics', '["assessment"]', 80, 'model-pass2', 'epistemic integrity')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('pattern-particle-unification', 'mathematics', '["physics"]', 85, 'model-pass2', 'p-adic structure')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('trapped-ion-ultrametric-synthesis', 'mathematics', '["physics"]', 85, 'model-pass2', 'p-adic testbed')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('pqs-critique-adjudication', 'ai-epistemics', '["assessment"]', 80, 'model-pass2', 'evidence grading')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zx-diagram-fault-lines', 'physics', '["mathematics"]', 85, 'model-pass2', 'diagrammatic languages')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('locale-framework-quantum-applications', 'assessment', '[]', 70, 'model-pass2', 'quantum innovations')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('conditional-truths-locale-framework', 'physics', '["mathematics"]', 85, 'model-pass2', 'locale framework')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('electron-hook-treatise', 'physics', '[]', 90, 'model-pass2', 'quantum assumptions')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('non-archimedean-projective-perspective', 'mathematics', '["physics"]', 85, 'model-pass2', 'non-Archimedean geometry')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('research-purpose-utility', 'synthesis', '["ai-epistemics"]', 80, 'model-pass2', 'research purpose')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('configuration-space-topology', 'physics', '["mathematics"]', 85, 'model-pass2', 'configuration space')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('jpcub-llm-energy', 'energy', '["physics","ai-operations"]', 90, 'model-pass2', 'joules per solution')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('exchange-phase-logical-scalar', 'mathematics', '["physics"]', 80, 'model-pass2', 'logical scalar')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('invariant-structural-value', 'physics', '["mathematics"]', 85, 'model-pass2', 'invariant relations')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('spin-statistics-distinction', 'physics', '["mathematics"]', 85, 'model-pass2', 'spin-statistics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('signal-worker-boundary-confinement', 'physics', '["mathematics"]', 80, 'model-pass2', 'signal-worker ontology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('formal-self-reference-limits', 'logic', '["mathematics"]', 90, 'model-pass2', 'self-reference limits')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('prime-valuation-qec-implications', 'qec', '["mathematics"]', 85, 'model-pass2', 'quantum error correction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('funding-strategy-2026-08-13', 'assessment', '[]', 95, 'model-pass2', 'funding strategy')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('llm-model-audit-2026-08-13', 'ai-epistemics', '["ai-operations"]', 90, 'model-pass2', 'audit of LLMs')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('prime-valuation-depth', 'mathematics', '["physics"]', 85, 'model-pass2', 'p-adic valuation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('void-is-not-false', 'logic', '["mathematics"]', 90, 'model-pass2', 'calculus of indications')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('idempotent-core', 'mathematics', '["logic"]', 85, 'model-pass2', 'idempotent core')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('reentrant-distinctions', 'logic', '["mathematics"]', 90, 'model-pass2', 'self-reference calculus')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('qwav-gtm-strategy', 'energy', '["ai-operations"]', 80, 'model-pass2', 'JPCUB energy benchmark')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('radix-agnostic-dsi-detection', 'physics', '["mathematics"]', 85, 'model-pass2', 'discrete scale invariance')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('cmb-higher-n-point-functions', 'physics', '["mathematics"]', 85, 'model-pass2', 'p-adic log-periodic signatures')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('universe-category-functor', 'mathematics', '["physics"]', 80, 'model-pass2', 'categorical encoding')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ringbauer-qudit-due-diligence', 'assessment', '[]', 95, 'model-pass2', 'due-diligence assessment')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ignorance-ai-pipeline-synthesis', 'ai-epistemics', '[]', 90, 'model-pass2', 'ignorance auditing')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('universal-ignorance-audit', 'ai-epistemics', '[]', 95, 'model-pass2', 'ignorance audit method')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('qwave-qudit-advantage', 'energy', '[]', 90, 'model-pass2', 'joules-per-solution comparison')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zbw-majorana-tqc', 'physics', '["mathematics"]', 85, 'model-pass2', 'p-adic observable')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('jpcub-competitive-landscape', 'energy', '[]', 95, 'model-pass2', 'joules-per-solution estimates')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('qec-darwinism-ultrametric', 'qec', '["physics"]', 80, 'model-pass2', 'QEC-Darwinism tradeoff')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('consilience-framework', 'synthesis', '["mathematics","physics"]', 80, 'model-pass2', 'cross-domain synthesis')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('valuation-independent-foundations', 'mathematics', '["physics"]', 90, 'model-pass2', 'category theory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('falsifiability-crisis', 'physics', '["ai-epistemics"]', 85, 'model-pass2', 'falsifiability crisis')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('falsifiability-kill-criteria', 'physics', '["mathematics"]', 90, 'model-pass2', 'adelic physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-distinction', 'physics', '["mathematics"]', 95, 'model-pass2', 'automorphic representation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('invariant-patterns-adelic-refactoring', 'physics', '["mathematics"]', 90, 'model-pass2', 'invariant patterns')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('frequency-valuation-theory', 'physics', '["mathematics"]', 85, 'model-pass2', 'valuation theory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('odr-thesis', 'physics', '["mathematics"]', 90, 'model-pass2', 'Compton count')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quasiparticles-as-rational-functions', 'physics', '["mathematics"]', 85, 'model-pass2', 'quasiparticles')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('odr-thesis-five-question-synthesis', 'synthesis', '["physics","mathematics"]', 80, 'model-pass2', 'five-question synthesis')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('compton-ontology-bt-coordinates', 'physics', '["mathematics"]', 90, 'model-pass2', 'Compton-counting ontology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('jpcub-leading-indicator', 'energy', '["ai-operations"]', 85, 'model-pass2', 'JPCUB metric')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ostrowski-dimensionless-reformulation', 'physics', '["mathematics"]', 90, 'model-pass2', 'fundamental physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('acrp07-qubit-delusion-valuation', 'physics', '["mathematics"]', 80, 'model-pass2', 'qubit ontology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-p-adic-metrology', 'qec', '["physics","mathematics"]', 85, 'model-pass2', 'p-adic quantum metrology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('autaxys-ontological-closure', 'logic', '["physics"]', 70, 'model-pass2', 'operational criterion')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('acrp08-paradigm-forecast', 'mathematics', '["physics"]', 80, 'model-pass2', 'non-Archimedean geometry')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('kkr-coarse-graining-threshold', 'physics', '["mathematics"]', 85, 'model-pass2', 'biological systems')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('acrp06-vpmax-extension', 'qec', '["mathematics"]', 90, 'model-pass2', 'stabilizer code classification')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('substrate-is-algorithm', 'logic', '["mathematics"]', 80, 'model-pass2', 'categorical formalization')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('boundary-ultrametricity', 'mathematics', '["physics"]', 85, 'model-pass2', 'ultrametricity')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('acrp04-five-smooth-audit', 'ai-epistemics', '["assessment"]', 80, 'model-pass2', 'statistical audit')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('consilient-synthesis-v2', 'synthesis', '["mathematics","physics"]', 70, 'model-pass2', 'consilient synthesis')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-cross-domain', 'mathematics', '["physics"]', 85, 'model-pass2', 'adelic cross-domain program')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-consilience-atlas', 'mathematics', '["physics","qec"]', 80, 'model-pass2', 'p-adic structure')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('qwav-decade', 'energy', '["ai-operations"]', 90, 'model-pass2', 'JPCUB forecast')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('counterfactual-physics', 'physics', '["mathematics"]', 85, 'model-pass2', 'p-adic physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('computing-machines', 'assessment', '[]', 80, 'curated', 'curated: history-constrained forecast of a market')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-rate-distortion-theory', 'mathematics', '["physics"]', 85, 'model-pass2', 'adelic information')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-entropic-numbers', 'mathematics', '["physics"]', 85, 'model-pass2', 'adelic numbers')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('measurement-stratigraphy', 'mathematics', '["physics"]', 80, 'model-pass2', 'measurement stratigraphy')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-shannon-theory', 'mathematics', '["physics"]', 85, 'model-pass2', 'adelic shannon')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('factoring-adelic-complexity-v2', 'mathematics', '["logic"]', 80, 'model-pass2', 'silent radix')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('continuum-critique-trilogy', 'mathematics', '["physics"]', 85, 'model-pass2', 'continuum critique')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-epistemological-foundations', 'physics', '["mathematics"]', 85, 'model-pass2', 'adelic physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('continuum-trilogy-03-unified-ontology', 'physics', '["mathematics","qec"]', 80, 'model-pass2', 'valuation ontology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('continuum-trilogy-02-padic-spin', 'mathematics', '["physics"]', 90, 'model-pass2', 'p-adic completions')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('continuum-trilogy-01-computable-continuum', 'mathematics', '["physics"]', 85, 'model-pass2', 'computable reals')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('consilient-gap-synthesis', 'ai-epistemics', '["assessment"]', 80, 'model-pass2', 'research portfolio')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('qnr-justification-memo', 'physics', '["mathematics"]', 90, 'model-pass2', 'rational numbers')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('computable-real-boundary', 'logic', '["physics"]', 85, 'model-pass2', 'Laws of Form')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('finite-precision-oc-convergence', 'physics', '["mathematics"]', 85, 'model-pass2', 'finite precision')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('harmonic-ostrowski-re-evaluation', 'physics', '["mathematics"]', 85, 'model-pass2', 'p-adic re-evaluation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-quantum-computation-langlands', 'physics', '["mathematics"]', 90, 'model-pass2', 'ultrametric quantum')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-constraints-on-quantum-field-theory-phase-2-synthesis', 'physics', '["mathematics"]', 85, 'model-pass2', 'adelic constraints')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-morita-p-adic-gamma-function-computation-adelic-structure-and-the-factoring-', 'mathematics', '["physics"]', 90, 'model-pass2', 'p-adic Gamma')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-quantum-error-correction-a-synthesis-across-all-primes-v1-0-0', 'qec', '["physics","mathematics"]', 90, 'model-pass2', 'adelic quantum error')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-quantum-error-correction-code-constructions-beyond-the-stabilizer-formali', 'qec', '["physics","mathematics"]', 90, 'model-pass2', 'adelic code constructions')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('fft-computational-langlands', 'mathematics', '["physics"]', 80, 'model-pass2', 'Langlands correspondence')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('hidden-modulus-lwe', 'mathematics', '[]', 90, 'model-pass2', 'LWE hardness assumption')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('joules-per-solution-metric', 'energy', '[]', 95, 'model-pass2', 'Joules-per-solution metric')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('bqnn-classical-baseline', 'energy', '["physics"]', 85, 'model-pass2', 'Energy efficiency comparison')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zbw-p5-capstone', 'mathematics', '["physics"]', 80, 'model-pass2', 'Adelic ZBW programme')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('measure-theoretic-artifacts-adelic-completion', 'mathematics', '["physics"]', 85, 'model-pass2', 'Adelic restructuring')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('tate-adelic-template', 'mathematics', '["physics"]', 80, 'model-pass2', 'Adelic quantum mechanics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zbw-adelic-observable', 'physics', '["mathematics"]', 85, 'model-pass2', 'Zitterbewegung origin')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('consilience-physics-number-theory', 'physics', '["mathematics"]', 85, 'model-pass2', 'Consilience between physics and number theory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('measure-theoretic-artifacts-archimedean-place', 'mathematics', '["physics"]', 80, 'model-pass2', 'Measure-theoretic artifacts')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zbw-p5-capstone-synthesis', 'physics', '["mathematics"]', 85, 'model-pass2', 'ZBW-Majorana hypothesis')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('auditing-bqnn', 'ai-epistemics', '["assessment"]', 80, 'model-pass2', 'Auditing BQNN claims')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('wbs-6-five-pillars-consilient-synthesis', 'mathematics', '["physics"]', 80, 'model-pass2', 'ultrametric math')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-cross-domain-program', 'mathematics', '["physics"]', 85, 'model-pass2', 'p-adic structures')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('x3.4-holographic-qec-ads-cft-rg-flow', 'qec', '["mathematics","physics"]', 90, 'model-pass2', 'holographic QEC')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('pqs-ai-evaluation-audit', 'ai-epistemics', '["assessment"]', 80, 'model-pass2', 'AI evaluation audit')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('x3.3-bosonic-codes-native-encoding', 'qec', '["physics"]', 90, 'model-pass2', 'bosonic codes comparison')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('pbo-autaxys', 'mathematics', '["physics"]', 70, 'model-pass2', 'pattern-based ontology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quix-quantum-due-diligence', 'assessment', '[]', 95, 'model-pass2', 'due diligence report')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('alpha-pi-helix', 'physics', '["mathematics"]', 85, 'model-pass2', 'geometric unification')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('harmonische-paradigma-kappa-siit-v4', 'mathematics', '["physics"]', 80, 'model-pass2', 'mathematical cross-validation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('harmonic-adelic-completions', 'mathematics', '["physics"]', 80, 'model-pass2', 'adelic completion')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('cross-domain-phase2', 'mathematics', '["physics"]', 85, 'model-pass2', 'adelic cross-domain program')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('stacked-ring-review', 'assessment', '["physics"]', 90, 'model-pass2', 'critical review')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('rg-harmonic-synthesis', 'synthesis', '["physics","mathematics"]', 80, 'model-pass2', 'unifying research')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('compton-cross-ratios-v2', 'mathematics', '["physics"]', 90, 'model-pass2', 'adic structure')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('rosetta-fractal-math', 'physics', '["mathematics"]', 85, 'model-pass2', 'digital physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('rg-harmonic-isomorphism', 'physics', '["mathematics"]', 90, 'model-pass2', 'quantum mechanics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('iqm-db-quantum-railway-critique', 'assessment', '["ai-operations"]', 80, 'model-pass2', 'research critique')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-two-level-lie', 'physics', '["mathematics"]', 85, 'model-pass2', 'transmon analysis')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('non-anthropocentric-natural-units', 'mathematics', '["physics"]', 90, 'model-pass2', 'non-anthropocentric units')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('informational-universe-synthesis', 'physics', '["mathematics"]', 85, 'model-pass2', 'informational universe')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('s10-observer', 'physics', '["mathematics","logic"]', 80, 'model-pass2', 'ultrametric structure')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('cancellation-rule', 'logic', '["physics"]', 85, 'model-pass2', 'ontology defense')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('no-thing-there', 'physics', '["logic"]', 80, 'model-pass2', 'qubit ontology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-constraints-on-quantum-field-theory-phase-3-synthesis', 'mathematics', '["physics"]', 90, 'model-pass2', 'adelic constraints')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-constraints-on-quantum-field-theory-phase-1', 'mathematics', '["physics"]', 80, 'model-pass2', 'adelic completion')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-adelic-constraints-project-a-complete-account', 'mathematics', '["physics"]', 80, 'model-pass2', 'adelic completion')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-revolutionary-beginners-guide-to-quantum-computing-why-we-dont-have-quantum-computers-yet-and-what-the-geometric-alt', 'physics', '["qec"]', 70, 'model-pass2', 'quantum computing')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('29-schism-synthesis', 'logic', '["physics"]', 85, 'model-pass2', 'self-reference')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('shor-assumptions-audit', 'ai-epistemics', '["mathematics"]', 90, 'model-pass2', 'assumption audit')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('embodied-mathematics-lakoff-nunez', 'mathematics', '["logic"]', 80, 'model-pass2', 'ultrametric formalization')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('huang-2025-quantum-advantage-audit', 'ai-epistemics', '["physics"]', 85, 'model-pass2', 'full-spectrum audit')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('numerata', 'mathematics', '[]', 95, 'model-pass2', 'numeral systems')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('infomatics-v1', 'mathematics', '["physics"]', 85, 'model-pass2', 'p-adic correction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('cfpe-methodology-v2', 'assessment', '[]', 90, 'curated', 'curated: forecasting methodology for planners')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('anthropometric-fossils', 'mathematics', '["physics"]', 80, 'model-pass2', 'cognitive imprints')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('anthropocentric-decryption-key', 'mathematics', '["physics"]', 85, 'model-pass2', 'adelic product formula')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('psii-quantum-coherence', 'physics', '["mathematics"]', 90, 'model-pass2', 'quantum biology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('cryptochrome-magnetoreception', 'physics', '["mathematics"]', 90, 'model-pass2', 'quantum biology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('spin-glasses-complexity', 'physics', '["mathematics"]', 85, 'model-pass2', 'statistical mechanics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('paper-manifesto-honest-computation', 'ai-epistemics', '["assessment"]', 80, 'model-pass2', 'honest computation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('paper-institutional-reform', 'ai-epistemics', '[]', 80, 'curated', 'curated: epistemic incentive structure')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('paper-problem-substrate-mapping', 'ai-epistemics', '["assessment"]', 80, 'model-pass2', 'honest investment')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('paper-physics-of-computation', 'energy', '["physics"]', 85, 'model-pass2', 'thermodynamic limits')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('paper-beyond-the-qubit', 'physics', '["mathematics"]', 85, 'model-pass2', 'post-particle computation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('paper-the-qubit-delusion', 'physics', '["mathematics"]', 85, 'model-pass2', 'quantum computing critique')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('fine-structure-constant-cross-ratio', 'mathematics', '["physics"]', 85, 'model-pass2', 'fine-structure constant')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zbw-majorana-tqc-p4-zbw-anyon-braiding', 'physics', '["mathematics"]', 90, 'model-pass2', 'p-adic anyon braiding')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zbw-majorana-tqc-p3-bruhat-tits-readout', 'physics', '["mathematics"]', 90, 'model-pass2', 'Bruhat-Tits protocol')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zbw-majorana-tqc-p2-majorana-zbw-correlator', 'physics', '["mathematics"]', 90, 'model-pass2', 'Majorana fermions')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zbw-majorana-tqc-p1-zbw-padic-observable', 'mathematics', '["physics"]', 85, 'model-pass2', 'p-adic topology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zbw-majorana-tqc-p7-grand-synthesis', 'synthesis', '["physics","mathematics"]', 80, 'model-pass2', 'adelic physics program')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zbw-majorana-tqc-p6-ultrametric-engine', 'ai-operations', '["mathematics"]', 70, 'model-pass2', 'ultrametric discovery')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('zbw-majorana-tqc-p5-adelic-qec', 'qec', '["mathematics"]', 95, 'model-pass2', 'Ostrowski error correction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('p-adic-anyon-fusion-braiding', 'physics', '["mathematics"]', 90, 'model-pass2', 'p-adic anyons')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-synthesis-pattern-particle', 'physics', '["mathematics"]', 85, 'model-pass2', 'adelic anyon theory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('p-adic-braid-groups-bruhat-tits', 'mathematics', '["physics"]', 90, 'model-pass2', 'p-adic braid groups')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('p-adic-temperley-lieb-parameter', 'mathematics', '["physics"]', 85, 'model-pass2', 'p-adic Jones polynomial')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quantum-laws-of-form', 'logic', '["physics"]', 80, 'model-pass2', 'quantum laws of form')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('mass-frequency', 'physics', '[]', 60, 'model-pass2', 'mass frequency')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('time-from-a-timeless-universe', 'physics', '[]', 80, 'model-pass2', 'timeless universe')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('strange-loop-theory-of-physical-quantization', 'physics', '["mathematics","logic"]', 80, 'model-pass2', 'quantization theory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('recursive-self-consistency', 'physics', '["mathematics"]', 85, 'model-pass2', 'quantum cosmology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('pile-of-babel', 'ai-epistemics', '["physics"]', 70, 'model-pass2', 'critique of physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('geometric-unity-of-computation', 'mathematics', '["physics","logic"]', 80, 'model-pass2', 'computational unification')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('functorial-characterization-of-the-prime-numbers', 'mathematics', '[]', 95, 'model-pass2', 'prime numbers')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('functorial-framework-for-morphological-computing', 'physics', '["mathematics"]', 85, 'model-pass2', 'topological quantum matter')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('emergent-physical-reality', 'physics', '["mathematics","logic"]', 80, 'model-pass2', 'emergent reality')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('dual-mode-arithmetic-representation', 'mathematics', '["logic"]', 85, 'model-pass2', 'arithmetic representation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('biological-and-engineered-computational-systems', 'mathematics', '["logic","ai-operations"]', 75, 'model-pass2', 'computational equivalence')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('identity-of-zero', 'mathematics', '["logic","physics"]', 80, 'model-pass2', 'identity of zero')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('3-mechanics', 'mathematics', '["physics","ai-operations"]', 75, 'model-pass2', 'number representation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('converging-reality', 'physics', '["mathematics","logic"]', 80, 'model-pass2', 'monistic reality')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('2-context', 'synthesis', '["physics","mathematics"]', 80, 'model-pass2', 'historical context')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quantum-fraud', 'physics', '["mathematics"]', 90, 'model-pass2', 'quantum hypothesis')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('review-of-infomatics', 'physics', '["mathematics"]', 85, 'model-pass2', 'Infomatics framework')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('skeptical-journey-through-conventional-reality', 'synthesis', '["physics"]', 70, 'model-pass2', 'questioning reality')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('statistics-of-possibility', 'physics', '["mathematics"]', 80, 'model-pass2', 'probabilistic tapestry')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ten-fingered-trap', 'mathematics', '["physics"]', 85, 'model-pass2', 'decimal dependence')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('two-faced-scientific-methodology', 'synthesis', '["physics"]', 75, 'model-pass2', 'scientific methodology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultimate-reality-framework-examination', 'synthesis', '["physics"]', 80, 'model-pass2', 'reality framework')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('universal-digital-identity-framework', 'synthesis', '["assessment"]', 90, 'curated', 'curated: cross-cutting framework white paper')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('autaxys-and-its-generative-engine', 'synthesis', '["physics"]', 75, 'model-pass2', 'generative engine')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('geometric-physics', 'mathematics', '["physics"]', 85, 'model-pass2', 'commutative physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('computational-simulation-approach-to-non-archimedean-quantum-architectures', 'physics', '["mathematics"]', 90, 'model-pass2', 'non-Archimedean quantum')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('computational-simulation-of-geometric-orientation-codes', 'qec', '["physics"]', 80, 'model-pass2', 'fault tolerant codes')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('computational-syntax-of-reality', 'physics', '["mathematics"]', 85, 'model-pass2', 'foundations physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('computational-toolkit-for-p-adic-spacetime', 'mathematics', '["physics"]', 90, 'model-pass2', 'p-adic spacetime')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('formal-ontology-of-distinction-and-invariance', 'logic', '["mathematics"]', 95, 'model-pass2', 'formal ontology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('knowing-patterns', 'physics', '["logic"]', 80, 'model-pass2', 'relational patterns')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('meta-pattern-of-reification-in-physics', 'physics', '["logic"]', 85, 'model-pass2', 'reification trap')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('monna-map-generation-and-hallucination', 'ai-epistemics', '["logic"]', 70, 'curated', 'curated: what a model gets wrong')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('non-archimedean-syntactic-paradigm-for-physics', 'physics', '["mathematics"]', 90, 'model-pass2', 'non-Archimedean physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('projective-geometric-frameworks-for-semantic-structures', 'mathematics', '[]', 85, 'curated', 'curated: geometric structures')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('proof-of-concept-for-auditable-attention-using-ultrametric-tree-distances', 'ai-epistemics', '["mathematics"]', 90, 'model-pass2', 'auditable attention')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quantitative-simulation-of-the-brains-cognitive-architecture', 'physics', '["mathematics"]', 85, 'model-pass2', 'cognitive architecture')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ratio-based-adelic-physics', 'physics', '["mathematics"]', 95, 'model-pass2', 'adelic physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('reification-and-non-archimedean-foundations-in-theoretical-physics', 'physics', '["mathematics"]', 80, 'model-pass2', 'non-Archimedean physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('relational-patternist-synthesis', 'physics', '[]', 70, 'model-pass2', 'ontological questions')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('syntactic-generation-primitive-distinctions', 'physics', '[]', 75, 'model-pass2', 'foundational substances')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('syntactic-token-calculus', 'physics', '["mathematics"]', 85, 'model-pass2', 'syntactic token calculus')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-one-who-tells', 'synthesis', '[]', 60, 'model-pass2', 'essay style')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-intelligence', 'mathematics', '["physics"]', 80, 'model-pass2', 'ultrametric geometry')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-quantum-gravity-and-computation', 'physics', '["mathematics"]', 85, 'model-pass2', 'ultrametric quantum gravity')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('unity-of-ultrametric-physics', 'physics', '["mathematics"]', 90, 'model-pass2', 'ultrametric physics framework')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('syntactic-token-calculus-research-plan', 'physics', '["mathematics"]', 85, 'model-pass2', 'syntactic token calculus research')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-physics-m1-ratio-based-valuation-theory', 'physics', '["mathematics"]', 85, 'model-pass2', 'ultrametric physics research')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-physics-m12-synthesis', 'physics', '["mathematics"]', 85, 'model-pass2', 'ultrametric physics research')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-physics-m6-quantum-gate-theory', 'physics', '["mathematics"]', 80, 'model-pass2', 'generative physics framework')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('architect-of-process', 'synthesis', '["physics","ai-epistemics"]', 60, 'model-pass2', 'interdisciplinary bridges')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('architecture-of-experience', 'physics', '["energy"]', 80, 'model-pass2', 'electromagnetic spectrum')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ballistic-transport-on-the-bruhat-tits-tree', 'mathematics', '["ai-operations"]', 70, 'model-pass2', 'geometric mismatch')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('from-force-to-fractal', 'physics', '["mathematics"]', 85, 'model-pass2', 'theoretical physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('gauge-invariant-field-theory-of-signal-worker-interactions', 'physics', '["mathematics"]', 80, 'model-pass2', 'field theory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quantum-abacus', 'energy', '["physics"]', 90, 'model-pass2', 'thermodynamic wall')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quantum-architectonics', 'physics', '["qec"]', 85, 'model-pass2', 'decoherence-resistant qubits')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('riemannian-geometric-approach-to-superdeterministic-bell-violations', 'physics', '["mathematics"]', 80, 'model-pass2', 'geometric determinism')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('spectral-analysis-of-anomalous-diffusion-on-p-adic-fractals', 'mathematics', '["physics"]', 85, 'model-pass2', 'p-adic fractals')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('spectral-dynamics-and-thermodynamic-stability-in-the-arithmetic-quantum-framework', 'energy', '["qec"]', 90, 'model-pass2', 'thermodynamic stability')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('spectral-dynamics-on-bruhat-tits-trees', 'mathematics', '["physics"]', 80, 'model-pass2', 'p-adic numbers')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('structural-mediation-of-planckian-dissipation-in-strongly-correlated-electron-systems', 'physics', '["energy"]', 85, 'model-pass2', 'Planckian dissipation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('superconductivity-quadrangle', 'physics', '["mathematics"]', 80, 'model-pass2', 'qubit device physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-relaxation-dynamics-in-topological-quantum-memory', 'physics', '["qec"]', 85, 'model-pass2', 'topological quantum memory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('a-deterministic-unified-theory', 'logic', '["mathematics","physics"]', 70, 'model-pass2', 'foundations of language')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('a-unified-framework-for-superdeterminism-neurobiology-and-the-mechanics-of-human-meaning', 'synthesis', '["physics","logic"]', 60, 'model-pass2', 'unified framework')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('algorithmic-necessity-of-agency', 'logic', '["physics"]', 80, 'model-pass2', 'free will and superdeterminism')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('all-things-are-one', 'synthesis', '["physics","logic"]', 65, 'model-pass2', 'human experience and reality')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('beyond-belief', 'logic', '["synthesis"]', 75, 'model-pass2', 'beyond belief systems')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('care-is-stronger', 'ai-epistemics', '["logic"]', 70, 'model-pass2', 'disagreement and relational rupture')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('category-error-of-the-ego', 'logic', '["ai-epistemics"]', 80, 'model-pass2', 'epistemology and human identity')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('clockwork-cosmos', 'physics', '["mathematics"]', 85, 'model-pass2', 'classical physics and geometry')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('computational-topology-and-formal-proofs-of-discrete-non-archimedean-relational-networks', 'mathematics', '["physics"]', 80, 'model-pass2', 'non-Archimedean topologies')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('correlated-universe', 'physics', '["mathematics"]', 85, 'model-pass2', 'cosmological model and thermodynamics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('formal-derivation-of-emergent-spacetime', 'mathematics', '["physics"]', 80, 'model-pass2', 'Bruhat-Tits tree')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('functional-decoupling-framework-for-p-adic-hamiltonian-models-of-granular-field-interactions', 'mathematics', '["physics"]', 85, 'model-pass2', 'p-adic models')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('interplay-of-scientific-materialism-human-meaning-and-epistemic-humility', 'logic', '[]', 70, 'model-pass2', 'epistemic humility')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('mechanistic-ethics-and-the-biology-of-meaning', 'logic', '[]', 75, 'model-pass2', 'mechanistic ethics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('principia-ontologica', 'logic', '[]', 80, 'model-pass2', 'ontological principles')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quantum-brain-dynamics-and-superdeterminism', 'physics', '["mathematics"]', 85, 'model-pass2', 'quantum brain dynamics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('simulated-stability-and-the-superdeterministic-quantum-machine', 'physics', '["mathematics"]', 80, 'model-pass2', 'superdeterminism')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('simulation-inconsistency-detection-via-neurobiological-and-cognitive-interfaces', 'synthesis', '["physics"]', 70, 'curated', 'curated: cross-disciplinary proposal')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('static-architecture-of-reality-and-its-biological-interface', 'logic', '[]', 75, 'model-pass2', 'convergence consilience')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('static-architecture-of-reality', 'physics', '["mathematics"]', 80, 'model-pass2', 'static architecture')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('super-universe', 'physics', '["mathematics"]', 85, 'model-pass2', 'super-universe')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('superdeterministic-amplification-of-macroscopic-neural-state-vectors', 'physics', '["mathematics"]', 80, 'model-pass2', 'superdeterministic amplification')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('threshold-of-meaning', 'logic', '[]', 80, 'model-pass2', 'semantics limits')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('time-as-epistemic-cognitive-fiction', 'ai-epistemics', '["physics"]', 70, 'model-pass2', 'cognitive fiction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('topological-aliasing-and-holographic-readout', 'physics', '["mathematics"]', 85, 'model-pass2', 'topological aliasing')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('unified-formal-ontology-of-the-correlated-universe', 'logic', '["physics"]', 80, 'model-pass2', 'formal ontology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('unified-theory-of-non-archimedean-ontology', 'mathematics', '["physics"]', 85, 'model-pass2', 'non-archimedean')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adelic-crossratio', 'mathematics', '["physics"]', 90, 'model-pass2', 'adelic cross-ratio')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('alpha-pi-project', 'physics', '["qec"]', 80, 'model-pass2', 'quantum fragility')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('automated-formal-verification-and-combinatorial-reduction-of-distinction-based-calculus', 'logic', '["mathematics"]', 85, 'model-pass2', 'formal verification')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('base-invariant-number-theoretic-patterns-in-fundamental-constants', 'mathematics', '["physics"]', 90, 'model-pass2', 'number theory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('topological-origins-of-number-theory', 'mathematics', '["physics"]', 85, 'model-pass2', 'topological origins')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('topological-signal-processing', 'physics', '["energy"]', 80, 'model-pass2', 'signal processing')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('tweezers-vs-magnet', 'physics', '["qec"]', 80, 'model-pass2', 'quantum control')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('universe-as-a-single-solution', 'physics', '["mathematics"]', 80, 'model-pass2', 're-examines Bell''s theorem')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('winding-number-as-hidden-variable', 'physics', '["mathematics"]', 85, 'model-pass2', 'pre-geometric substrate')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('winding-numbers-and-strange-loops', 'physics', '["mathematics"]', 85, 'model-pass2', 'circular/topological primitives')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('autonomous-dissipative-quantum-processing', 'energy', '["physics","qec"]', 70, 'model-pass2', 'thermodynamic bottleneck')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('chiral-high-temperature-topological-processing', 'physics', '["qec"]', 80, 'model-pass2', 'topological protection')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('commercial-pathways-to-room-temperature-topological-quantum-computation', 'assessment', '["physics","qec"]', 75, 'model-pass2', 'commercial pathways')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('cryogenically-stabilized-synthetic-lattice-architecture-for-fault-tolerant-quantum-computing', 'physics', '["qec"]', 85, 'model-pass2', 'synthetic vacuum')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('emergent-number-theory', 'mathematics', '["physics"]', 80, 'model-pass2', 'emergent number theory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('entropic-operational-paradigm', 'physics', '["mathematics"]', 85, 'model-pass2', 'thermodynamic information')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('hydrodynamic-spacetime', 'physics', '["mathematics"]', 85, 'model-pass2', 'spacetime condensate')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('hydrodynamic-topological-continuum', 'physics', '["mathematics"]', 85, 'model-pass2', 'hydrodynamic-topological')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('kinetic-isomorphism', 'physics', '["mathematics"]', 80, 'model-pass2', 'kinetic isomorphism')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('prime-numbers-as-spectral-artifacts', 'mathematics', '["physics"]', 80, 'model-pass2', 'prime numbers')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('so-what-of-knowledge', 'synthesis', '["physics","logic"]', 60, 'model-pass2', 'paradox')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('stability', 'physics', '["mathematics"]', 85, 'model-pass2', 'topological extension')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('superfluid-vacuum-theory', 'physics', '["mathematics"]', 85, 'model-pass2', 'superfluid vacuum')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamic-veto', 'energy', '["physics"]', 80, 'model-pass2', 'thermodynamic veto')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('topological-extension-hypothesis', 'physics', '["mathematics"]', 85, 'model-pass2', 'topological extension')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('universal-computational-topos', 'logic', '["mathematics"]', 80, 'model-pass2', 'computational topos')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('adaptive-thick-skin', 'physics', '["energy"]', 70, 'model-pass2', 'adaptive thick skin')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('arithmetic-gauge-concentration', 'mathematics', '["physics"]', 80, 'model-pass2', 'arithmetic gauge')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('asymmetric-electron-transport-arising-from-intrinsic-structural-chirality', 'physics', '[]', 90, 'model-pass2', 'electron transport')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('base-statedisturbance-bs-d-ontology', 'physics', '["mathematics"]', 85, 'model-pass2', 'BS-D ontology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('coherent-tunneling', 'physics', '["energy"]', 70, 'model-pass2', 'coherent tunneling')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('continuous-topology-and-discrete-arithmetic', 'mathematics', '["physics"]', 80, 'model-pass2', 'Riemann zeta')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('dynamic-optimality-in-physical-and-arithmetic-systems', 'mathematics', '["physics"]', 70, 'model-pass2', 'arithmetic systems')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('emergent-correlation-in-a-local-deterministic-universe', 'physics', '["mathematics"]', 85, 'model-pass2', 'superdeterminism')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('engineering-macroscopic-quantum-coherence-in-disordered-moir-metamaterials', 'physics', '[]', 90, 'model-pass2', 'quantum coherence')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('escaping-the-millikelvin-death-spiral', 'energy', '["physics"]', 85, 'model-pass2', 'thermal noise')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('feynman-shor-quantum-bifurcation', 'physics', '["mathematics"]', 80, 'model-pass2', 'quantum computing')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('from-extrinsic-teleology-to-existential-autonomy', 'logic', '["physics"]', 70, 'model-pass2', 'ontological reorientation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('hydrodynamic-gating-of-nuclear-spin-coherence', 'physics', '["mathematics"]', 85, 'model-pass2', 'nuclear spin')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('lifecycle-of-a-fault-tolerant-quantum-computer', 'qec', '["physics"]', 90, 'model-pass2', 'fault-tolerant quantum')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('recursive-constraint-nucleation-in-epistemic-cut-architecture', 'logic', '["mathematics"]', 80, 'model-pass2', 'epistemic cut')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('relativistic-topological-superfluid', 'physics', '["mathematics"]', 85, 'model-pass2', 'topological superfluid')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('resolving-the-scale-penalty', 'physics', '["mathematics"]', 80, 'model-pass2', 'lattice QCD')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('resonant-kerr-cancellation-dynamics-in-dissipative-bosonic-stabilization', 'physics', '["qec"]', 80, 'model-pass2', 'superconducting cavities')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('resonant-spinor-topology-and-the-vacuum-horizon', 'physics', '["mathematics"]', 85, 'model-pass2', 'topological manifold')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('reynolds-filter-and-the-observability-of-chaos', 'physics', '[]', 90, 'model-pass2', 'nonlinear systems')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('spectral-schism', 'mathematics', '["physics"]', 80, 'model-pass2', 'asymptotic diffraction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('stabilization-of-gottesman-kitaev-preskill-states', 'qec', '["physics"]', 85, 'model-pass2', 'quantum error correction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('superfluid-substrate', 'physics', '[]', 90, 'model-pass2', 'dynamic condensate')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamic-and-informational-bottlenecks-of-scalable-fault-tolerant-quantum-computation', 'energy', '["qec","physics"]', 80, 'model-pass2', 'thermodynamic bottlenecks')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamic-and-topological-constraints-on-biological-quantum-processing', 'energy', '["physics"]', 85, 'model-pass2', 'thermodynamic cost')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamic-constraints-and-architectural-inversions-in-scalable-quantum-information-systems', 'energy', '["physics"]', 85, 'model-pass2', 'thermodynamic bottleneck')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamic-genesis-of-the-standard-model', 'physics', '["mathematics"]', 80, 'model-pass2', 'topological phase transition')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamic-imperative', 'energy', '["physics"]', 85, 'model-pass2', 'thermodynamic paradox')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamic-scaling-of-4-kelvin-topological-processors', 'energy', '["physics"]', 85, 'model-pass2', 'thermodynamic bottleneck')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamic-stability-of-a-filamentary-vacuum', 'physics', '["mathematics"]', 90, 'model-pass2', 'condensed matter')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamic-viability-and-the-universality-of-feynman-matter', 'energy', '["qec"]', 80, 'model-pass2', 'thermodynamic wall')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamics-of-structural-persistence', 'energy', '["qec"]', 85, 'model-pass2', 'thermodynamic limit')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('topological-hydrodynamics-and-the-spectral-gap', 'physics', '["mathematics"]', 90, 'model-pass2', 'topological hydrodynamics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('topological-quantization-and-spectral-filtration', 'mathematics', '["physics"]', 80, 'model-pass2', 'arithmetic topology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('twisted-cuprate-twistronics', 'physics', '["energy"]', 85, 'model-pass2', 'thermodynamic scaling')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('agentic-collapse', 'ai-epistemics', '["logic"]', 80, 'model-pass2', 'epistemic failure')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('comprehensive-technical-framework-for-network-isomorphism', 'mathematics', '["physics"]', 85, 'model-pass2', 'network isomorphism')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('computational-benchmark-of-geometric-and-algebraic-models-for-multi-qubit-state-representation', 'physics', '["mathematics"]', 90, 'model-pass2', 'quantum state representation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('computational-toy-model-of-non-local-information-storage-in-a-quantum-cellular-automaton', 'qec', '["physics"]', 85, 'model-pass2', 'holographic error correction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('connecting-geometrogenesis-and-biogenesis', 'physics', '["mathematics"]', 80, 'model-pass2', 'quantum informational substrate')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('continuous-signal-processing-for-josephson-junction-readout', 'physics', '["energy"]', 85, 'model-pass2', 'superconducting qubit readout')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('double-pendulum-as-a-topological-bridge', 'physics', '["mathematics"]', 80, 'model-pass2', 'topological manifold')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('epistemic-noise-as-computational-resource', 'physics', '["qec"]', 70, 'model-pass2', 'quantum open systems')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('excluded-middle-as-computational-boundary', 'logic', '["mathematics"]', 90, 'model-pass2', 'Principle of Excluded Middle')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('from-peaks-to-pixels', 'physics', '["mathematics"]', 85, 'model-pass2', 'signal digitization')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('general-theory-of-process', 'synthesis', '["physics","ai-operations"]', 60, 'model-pass2', 'general theory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('hamiltonian-dynamics-as-the-engine-of-biological-computation', 'physics', '["mathematics"]', 80, 'model-pass2', 'biological computation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('hamiltonian-engineering-of-topological-deconfinement-in-weyl-semimetals', 'physics', '["mathematics"]', 85, 'model-pass2', 'topological deconfinement')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('hybrid-gate-decomposition-and-vector-norm-analysis-for-quantum-pde-solvers', 'qec', '["physics"]', 80, 'model-pass2', 'quantum PDE solvers')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('impact-of-cognitive-linearity-on-epistemic-modeling', 'ai-epistemics', '["logic"]', 70, 'model-pass2', 'epistemic modeling')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('in-network-hamiltonian-engineering-for-6g', 'physics', '[]', 75, 'curated', 'curated: Hamiltonian engineering, not energy')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('new-school-of-athens', 'synthesis', '["logic","physics"]', 50, 'model-pass2', 'philosophical essay')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('non-markovian-hamiltonian-dynamics-of-boson-mediated-energy-transfer', 'physics', '["mathematics"]', 85, 'model-pass2', 'non-Markovian dynamics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('operationalizing-generalized-symmetries', 'physics', '["mathematics"]', 80, 'model-pass2', 'topological physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('phase-transitions-of-logic', 'qec', '["physics"]', 85, 'model-pass2', 'fault-tolerant quantum computation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('process-ontology-and-hydrodynamic-vacuum', 'physics', '["mathematics"]', 70, 'model-pass2', 'cosmological models')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('programming-the-vacuum', 'physics', '["mathematics"]', 80, 'model-pass2', 'quantum systems simulation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('reconstructive-ontology-of-brouwerian-intuitionism', 'logic', '["mathematics"]', 85, 'model-pass2', 'Brouwerian intuitionism')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('spacetime-volume-and-fractal-surfaces', 'physics', '["mathematics"]', 80, 'model-pass2', 'complex systems optimization')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('spectral-benchmarking-of-holographic-quantum-simulations', 'physics', '["qec"]', 85, 'model-pass2', 'holographic quantum simulations')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('structural-vs-driven-quantum-coherence', 'physics', '["energy"]', 80, 'model-pass2', 'superconductivity and thermodynamics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('thermodynamics-of-knowing', 'physics', '[]', 70, 'model-pass2', 'thermodynamics of knowledge')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('topological-and-computational-unification-of-emergent-agency', 'physics', '["mathematics"]', 70, 'model-pass2', 'emergent agency')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('topology-of-quanta', 'physics', '["mathematics"]', 85, 'model-pass2', 'quantum mechanics and topology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('unified-fiber-bundle-formalism-for-the-hopf-fibration', 'mathematics', '["physics"]', 80, 'model-pass2', 'unified fiber bundle formalism')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('unifying-photosynthetic-energy-transduction-and-ambient-superconductivity', 'physics', '["mathematics"]', 80, 'model-pass2', 'quantum energy')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('universal-hamiltonian-as-process-verb', 'physics', '["mathematics","logic"]', 85, 'model-pass2', 'quantum mechanics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ab-initio-architectonics', 'physics', '["mathematics"]', 80, 'model-pass2', 'quantum materials')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('chemical-category', 'mathematics', '["physics"]', 70, 'model-pass2', 'chemical structure')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('computo-ergo-sum', 'logic', '["mathematics","physics"]', 85, 'model-pass2', 'self-executing universe')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('defining-kappa', 'physics', '["mathematics"]', 80, 'model-pass2', 'information substrate')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('derivation-of-sm-gauge-couplings', 'physics', '["mathematics"]', 85, 'model-pass2', 'gauge couplings')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('dimensionless-physics', 'physics', '["mathematics"]', 80, 'model-pass2', 'dimensionless ratios')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('einstein-thermodynamics-derivation', 'physics', '["mathematics"]', 85, 'model-pass2', 'thermodynamic derivation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('emergence-of-physics', 'physics', '[]', 80, 'model-pass2', 'emergence of physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('emergent-computation', 'physics', '["energy"]', 80, 'model-pass2', 'emergent computation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('emergent-information-theoretic-electromagnetism-proof', 'physics', '["mathematics"]', 85, 'model-pass2', 'information-theoretic electromagnetism')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('epistemic-cartography', 'logic', '["physics"]', 80, 'model-pass2', 'foundational principles')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('epistemic-dynamics', 'logic', '["mathematics"]', 85, 'model-pass2', 'formal epistemology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('epistemic-mirror', 'logic', '["physics"]', 80, 'model-pass2', 'epistemology of consciousness')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('head-over-hands', 'logic', '["ai-epistemics"]', 75, 'model-pass2', 'epistemic bias')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('higgs-particle-never-existed', 'physics', '["mathematics"]', 90, 'model-pass2', 'quantum field theory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('iceberg-of-reality', 'physics', '["logic"]', 80, 'model-pass2', 'reality and assumptions')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('information-realism', 'physics', '["logic"]', 85, 'model-pass2', 'informational realism')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('information-theoretic-foundations-of-reality', 'physics', '["mathematics"]', 85, 'model-pass2', 'information-theoretic framework')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('information-theoretic-reformation-of-physics', 'physics', '["logic"]', 80, 'model-pass2', 'information-theoretic reformation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('map-is-not-the-universe', 'mathematics', '["physics"]', 85, 'model-pass2', 'Euclidean understanding')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('mathematical-structures-underlying-physical-laws-and-statistical-phenomena', 'mathematics', '["physics"]', 90, 'model-pass2', 'foundational schism')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('nature-of-zitterbewegung', 'physics', '["mathematics"]', 90, 'model-pass2', 'relativistic quantum mechanics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('new-foundation-for-physics', 'mathematics', '["physics"]', 80, 'model-pass2', 'category theory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('not-even-wrong', 'physics', '["mathematics"]', 90, 'model-pass2', 'string theory critique')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ouroboran-universe-and-nature-of-time', 'physics', '[]', 95, 'model-pass2', 'time in physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('proton-football', 'physics', '[]', 90, 'model-pass2', 'particle physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quantifying-structural-unification-and-epistemic-scaffolding-in-scientific-progress', 'ai-epistemics', '["physics"]', 80, 'model-pass2', 'epistemic scaffolding')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quantum-correlation-synchronization-theory-of-emergent-gravity', 'physics', '["mathematics"]', 85, 'model-pass2', 'quantum gravity')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('quantum-mechanics-as-applied-wave-mechanics', 'physics', '[]', 95, 'model-pass2', 'quantum mechanics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('resonant-complexity-framework', 'physics', '["mathematics"]', 80, 'model-pass2', 'complex systems')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('resonant-resolution', 'synthesis', '["physics","mathematics"]', 70, 'curated', 'curated: framework essay')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('risks-of-pancomputationalism', 'physics', '["mathematics"]', 85, 'model-pass2', 'pancomputationalism')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('scale-divergence-problem', 'physics', '[]', 95, 'model-pass2', 'cosmology problem')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('scale-invariant-information-thermodynamics-proof', 'physics', '["mathematics"]', 90, 'model-pass2', 'information thermodynamics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('scale-invariant-physics', 'physics', '["mathematics"]', 80, 'model-pass2', 'scale-invariant reality')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('scientific-validity-assessment-toolkit-svat', 'ai-epistemics', '["physics"]', 90, 'model-pass2', 'epistemic honesty')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('standard-model-critique', 'physics', '[]', 95, 'model-pass2', 'standard model')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('standard-deviation-normalization-proof', 'mathematics', '["physics"]', 85, 'model-pass2', 'probability theory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('there-are-no-theories', 'physics', '[]', 80, 'model-pass2', 'theoretical physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('treatise-on-waves', 'physics', '["mathematics"]', 85, 'model-pass2', 'wave mechanics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('universe-as-self-proving-theorem', 'mathematics', '["physics"]', 85, 'model-pass2', 'category theory')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('wave-built-world', 'physics', '[]', 80, 'model-pass2', 'dynamic processes')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('9-are-we-following-the-right-path', 'physics', '[]', 85, 'model-pass2', 'philosophy of science')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('1-crisis-of-abstraction', 'physics', '[]', 80, 'model-pass2', 'ontological foundation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('glossary', 'physics', '["mathematics"]', 85, 'model-pass2', 'phononic systems')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('close-slobphase1drafting-v10', 'ai-operations', '[]', 90, 'model-pass2', 'project report')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('log20240505010101strangeloopbook', 'ai-operations', '[]', 90, 'model-pass2', 'AI analysis protocol')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('chapter-1', 'ai-epistemics', '[]', 80, 'model-pass2', 'information awareness')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('chapter-2', 'ai-epistemics', '[]', 80, 'model-pass2', 'social factors shaping awareness')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('chapter-3', 'ai-epistemics', '[]', 80, 'model-pass2', 'consequences of information states')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('chapter-4', 'ai-epistemics', '["assessment"]', 70, 'model-pass2', 'historical perspectives')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('12-emergence-of-spacetime', 'physics', '[]', 90, 'model-pass2', 'spacetime ontology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('7-autaxys-defined', 'physics', '[]', 90, 'model-pass2', 'fundamental physics ontology')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('8-the-generative-engine', 'physics', '[]', 90, 'model-pass2', 'autaxys framework')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('9-information-re-founded', 'physics', '["mathematics"]', 80, 'model-pass2', 'information concept')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('trapped-ion-page-wootters-experiment-protocol-for-testing-ultrametricity', 'physics', '["qec"]', 85, 'model-pass2', 'ultrametricity experiment')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('number-theoretic-ultrametric-foundations', 'mathematics', '["qec"]', 90, 'model-pass2', 'p-adic framework')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('bridge-theorem', 'mathematics', '[]', 95, 'model-pass2', 'p-adic and Bruhat-Tits geometries')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('conditional-state-distances-pw-clocks', 'physics', '["mathematics"]', 80, 'model-pass2', 'quantum gravity')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('radix-to-ultrametrics-to-page-wootters-to-wheeler-dewitt-to', 'mathematics', '["physics"]', 90, 'model-pass2', 'p-adic synthesis')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('ultrametric-quantum', 'qec', '["physics"]', 85, 'model-pass2', 'quantum error correction')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('silent-radix-synthesis', 'mathematics', '[]', 95, 'model-pass2', 'cryptographic primitive')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('the-ultrametric-foundation-a-unified-thesis-on-number-time-knowledge-and-computa', 'mathematics', '["physics"]', 80, 'model-pass2', 'ultrametric foundation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('nonlinear-tree-based-numeration-systems-a-consolidated-synthesis', 'mathematics', '[]', 90, 'model-pass2', 'numeration systems')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('critical-examination-of-spacetime-mass-and-gravity-through-competing-ontological', 'physics', '["mathematics"]', 85, 'model-pass2', 'ontological frameworks')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('critical-examination-of-the-null-hypotheses-in-fundamental-physics', 'physics', '["mathematics"]', 80, 'model-pass2', 'fundamental physics')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('formal-framework-for-a-non-local-frequency-based-reality', 'physics', '["mathematics"]', 85, 'model-pass2', 'non-local reality')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('imperfectly-defining-reality-1', 'synthesis', '["physics","mathematics"]', 70, 'model-pass2', 'constructing reality')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('geometric-unification-framework', 'physics', '["mathematics"]', 85, 'model-pass2', 'unification framework')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('meta-analysis-of-categorical-equivalence-and-scale-invariance', 'mathematics', '["physics"]', 90, 'model-pass2', 'categorical equivalence')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('number-theory-as-physics', 'physics', '["mathematics"]', 90, 'model-pass2', 'qubit physics framework')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('hydrodynamic-stability-hypothesis', 'physics', '["logic"]', 80, 'model-pass2', 'quantum foundations')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('prime-numbers-as-universal-optimization-primitives', 'mathematics', '["physics"]', 85, 'model-pass2', 'prime numbers')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('strange-loop-of-being', 'physics', '["mathematics"]', 95, 'model-pass2', 'Standard Model derivation')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('post-quantum-synthesis', 'physics', '["logic"]', 80, 'model-pass2', 'quantum paradoxes')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
INSERT INTO paper_category (slug, category, secondary, confidence, method, why) VALUES ('continuum-is-real', 'physics', '[]', 85, 'model-pass2', 'ontological schism')
  ON CONFLICT(slug) DO UPDATE SET category=excluded.category, secondary=excluded.secondary, confidence=excluded.confidence, method=excluded.method, why=excluded.why, updated_at=datetime('now');
