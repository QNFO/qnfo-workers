# Notation-Commissioning Audit: Five Quantum Formulations

Prepared 2026-10-02 for QNFO (agent_issues 1738). AI-drafted by an agent pipeline; not peer reviewed; treat as a working memo.

Charter pillar: `research`. Task text: `qnfo-audit.intents` id `int-fe40f238muihdgat`. The description of agent_issues 1738 is cut off at "status p"; this memo answers the full intent text.

**Verdict.** Criterion (1), "omissions must be legible as designed", becomes usable once it is turned into a test of dates: an omission counts as designed only if the founding text states it before any critic raises it. On that test, QBism, relational QM and the path integral sort cleanly. The Dirac–von Neumann row sorts only after it is split into its two authors. The decoherence / consistent-histories row is mis-specified: consistent histories was built for closed systems and quantum cosmology, not open-system thermodynamics. Criterion (2), "the foreign performer must produce an unrecognizable performance", fails for computational content. Canonical and path-integral QM are mathematically equivalent under stated conditions, and the chiral anomaly, the flagship "path-integral-native" result, was found first in operator language. Criterion (2) holds only where an interpretation rejects a premise (Bell's theorem or PBR under QBism), and there criterion (1) already explains the divergence; or where a tacit convention is missing (time-slicing in curved space), which is performance practice, not commissioning. Shut-up-and-calculate is not a designed omission of the Hilbert-space notation. It is a post-war practice that exploits a designed feature: the measurement cut can be moved without changing predictions. The "commissioning body" story fits three rows and is a just-so story for two. The plurality is epistemic at the level of predictions, but relational QM asserts that facts themselves are plural (relative to observers). Only an observer-scale Wigner's-friend test or an empirical divergence, such as nonzero third-order interference, could settle the question.

---

## 0. Scope and method

- References were checked on 2026-10-02 against arXiv API metadata, the Crossref DOI registry, INSPIRE abstracts and the Stanford Encyclopedia of Philosophy (SEP). Where a claim rests on something I could not check, the text says so.
- Status labels used below: **supported**, **partly supported**, **contested**, **refuted as stated**, **open**. Confidence is my credence that the claim is right, not the strength of the literature.
- The "interdisciplinary-notation thesis" itself is not in the reachable corpus (see §7). The criterion is taken from the task text as given.

## 1. Category check: the five are not peers

**Claim 1.1.** The five "notations" belong to different kinds:
- canonical QM and the path integral are formalisms;
- QBism and relational QM (RQM) are interpretations that use the Hilbert-space formalism unchanged;
- decoherence is a dynamical result inside the canonical formalism;
- consistent histories (CH) is a formalism (the decoherence functional over histories) together with an interpretation.

So a "performer raised entirely inside" QBism is a Hilbert-space performer, and the transcription QBism → RQM leaves every equation unchanged; only the commentary differs. *Confidence:* high. *Status:* supported.

**Claim 1.2 (mathematical equivalence, not interpretation).**
- Feynman's founding paper states that his formulation "is, however, mathematically equivalent to the familiar formulation" (Feynman 1948, abstract via INSPIRE). That holds for non-relativistic systems that have a Lagrangian and a fixed rule tying operator ordering to time-slicing.
- In curved configuration spaces, the slicing rule changes the Hamiltonian by terms of order ħ² in the curvature (DeWitt 1957).
- A real-time path integral is defined only as a limit or after Wick rotation. That is standard lore; I did not check a primary source for it here.
- For gauge theories, Faddeev–Popov gauge fixing and canonical constraint quantization agree in perturbation theory. Beyond perturbation theory both run into the Gribov–Singer obstruction (§3, B1).
- QBism, RQM and CH predict the same results as the canonical formalism for every standard experiment; they differ on what a state, an outcome or a fact is.
- *Confidence:* high (perturbative), medium (non-perturbative). *Status:* supported.

## 2. Turning criterion (1) into a test

Four classes:
- **Designed (D):** the founding text states the exclusion before any critic raises it.
- **Accident (A):** someone else documents the omission after publication, and the community answers with a repair (a new postulate or new mathematics).
- **Discovered necessity (N):** a feature later proved to be forced, such as Gleason's theorem for the Born measure. The criterion has no slot for this class, though it is common.
- **Retro-designation (R):** an accident that the community later relabels as designed. This is how criterion (1) becomes unfalsifiable.

## 3. Task (a): designed omissions versus accidents

| # | Notation, and the task's commissioning body, judged against history | Designed omissions (D) | Accidents (A), necessities (N), retro-designations (R) | Conf. | Status |
|---|---|---|---|---|---|
| A1 | **Canonical (Dirac 1930; von Neumann 1932).** "Measurement apparatus": *weak fit.* Dirac's book is pragmatic and organized around the analogy with classical mechanics. Von Neumann's is axiomatic. Drago (arXiv:2101.09565), following Kronz and Lupher, treats them as distinct attitudes, so this row has two commissioners. The apparatus enters only in von Neumann's measurement chapter. | D: no mental picture of the "substratum" (Dirac 1930 preface, p. v, quoted in Drago). D: two kinds of process, unitary evolution and measurement, with a cut that can be placed anywhere without changing predictions (von Neumann; I did not re-read the text for this memo). Time as a parameter, not an observable: designed by default, but soon questioned (Busch, quant-ph/0105049). | N: the Born measure is forced in dimension ≥ 3 (Gleason 1957). A: sharp projective measurements are not enough, and generalized measurements (POVMs) came later (Busch 2003 gives a POVM-based Gleason proof that covers dimension 2). A: δ-normalized eigenvectors lie outside Hilbert space and were repaired later by rigged Hilbert spaces (standard; not checked here). | Med. | Partly supported, and only after the split |
| A2 | **Path integral (Dirac 1933; Feynman 1948).** "Action principle": *good fit.* Dirac's 1933 Lagrangian paper seeds it (Hari Dass, arXiv:2003.12683). Feynman's stated application is eliminating the coordinates of the field oscillators from quantum electrodynamics. | D: needs an action, so systems without a Lagrangian are out of scope. D: the wave function is derived ("the total contribution from all paths … is the wave function"), not primitive. D: probability is the "absolute square of a sum", which is postulated, not derived. | A: ordering and time-slicing ambiguity in curved space (DeWitt 1957). A: Gribov copies in Faddeev–Popov gauge fixing (Gribov 1978). N: no continuous gauge fixing exists at all (Singer 1978: "No gauge fixing is possible"). A: the anomaly appears as a non-invariant fermion measure (Fujikawa 1979), a decade after its operator-language discovery. | Med-high | Supported (the cleanest split of the five) |
| A3 | **QBism (Fuchs 2010; Fuchs, Mermin & Schack 2014).** "Agent credences": *good fit.* Roots in personalist Bayesianism are stated explicitly (arXiv:1003.5209). | D: no state independent of the agent. D: the Born rule is a normative coherence constraint, not read off an objective state (Fuchs & Schack 2013). D: no nonlocal influences (FMS 2014). D: no underlying ontic state λ. | A: the Born rule rewritten in terms of SICs (a special family of measurements) assumes SICs exist in every dimension. That was a conjecture in 2017, with numerical solutions up to dimension 151 and some beyond (Fuchs, Hoang & Stacey 2017); I did not check later progress. R: "what is an agent?" was pressed by Zwirn and answered by declining a reductive definition (DeBrota & Stacey, per SEP). | Med. | Supported for D; the R entry exposes the criterion's weak point |
| A4 | **RQM (Rovelli 1996).** "Relational observers": *good fit.* The abstract draws an explicit analogy with time before Einstein. | D: no state independent of the observer. D: no absolute facts. D: no distinction between observer and observed system. | A: agreement between observers' perspectives. Answered by a new postulate, "cross-perspective links" (Adlam & Rovelli, arXiv:2203.13342). A: five no-go theorems (Pienaar 2021). A: a GHZ-like contradiction for relative facts (Lawrence, Markiewicz & Żukowski 2023; contested). | Med-high | Supported (the clearest case of an accident repaired by a postulate) |
| A5 | **Decoherence / CH.** "Open-system thermodynamics": *poor fit, a just-so story.* Decoherence is about entanglement with an environment (Zeh 1970; Zurek 2003), not about thermodynamics. CH was commissioned by closed systems and quantum cosmology (Griffiths 1984; Gell-Mann & Hartle, arXiv:1803.04605; their 2007 paper speaks of "the modern quantum mechanics of closed systems"). | D (decoherence): no selection of a single outcome. SEP: it explains why we do not see superpositions, "not … why we *do* observe measurement results". D (CH): no unique framework (the single-framework rule), measurement is not a primitive, and the state is a "pre-probability" (Griffiths, SEP). | A: consistency alone does not select quasiclassical histories; their persistence "relies on assumptions about an as yet unknown theory of experience" (Dowker & Kent 1996). A: consistent sets can yield contrary inferences (Kent 1997). A: Zurek's envariance derivation of the Born rule rests on implicit assumptions (Schlosshauer & Fine 2005). | Med. | Refuted as stated; supported once split into two rows |

**Pattern.** Every founding text states what it refuses to say, so every row has designed omissions. The rows differ in their accidents. A2 and A4 pile up repairs, while A3 relabels its accidents as designed, which the criterion rewards unless priority is checked.

## 4. Task (b): does criterion (2) hold?

Translation status means one of three things:
- **Proof:** the same result can be derived in the other notation.
- **Re-description:** the same content is restated with a premise reread or changed.
- **Category error:** the question presupposes a primitive that the target notation excludes by design.

| # | Result: native home → foreign reading | Translation | Does criterion (2) hold? | Conf. |
|---|---|---|---|---|
| B1 | **Gauge fixing and anomaly inflow.** Native home: path integral (Faddeev & Popov 1967; Fujikawa 1979; Callan & Harvey 1985). Foreign: canonical. | **Proof**, in both directions | **No.** The anomaly was found first in operator and diagram language (Adler 1969; Bell & Jackiw 1969). Its canonical form is a Schwinger term in the commutators of the Gauss-law constraints (Faddeev 1984). Callan & Harvey themselves argue through zero modes of the Dirac equation. Gribov's ambiguity was first posed in Coulomb gauge, and Singer shows it "will occur in all other gauges". A canonical performer produces a recognizable performance. Under QBism or RQM the transcription is the identity. | High (anomaly); med (non-perturbative) |
| B2 | **Born-rule derivation.** Postulate in canonical QM; theorem in the Gleason/Busch setting; operational derivation (Masanes, Galley & Müller 2019); envariance (Zurek 2005); normative in QBism. The path integral postulates "absolute square of a sum". Sorkin (1994) recasts the Born rule as the absence of interference beyond second order, and that has been tested (Sinha et al. 2010: third-order term < 10⁻² of second-order). | Gleason → QBism: **re-description** (same theorem, normative reading). Envariance → canonical: **contested proof**. Sorkin → canonical: **proof in one direction** (the canonical theory implies no third-order term; the converse needs more). Asking CH for a derivation: **re-description** (the decoherence functional already contains the Born weights). | **No** for computational content. A canonical performer reads Sorkin's null test as a corollary. A QBist handed envariance rejects its "objective state" premise. That is disagreement, not an unrecognizable transcription. | Med-high |
| B3 | **PBR no-go theorem.** Native home: the ontological-models framework (Harrigan & Spekkens 2010). PBR rules out "any model in which a quantum state represents mere information about an underlying physical state" with preparation independence. Leifer (2014) scopes such theorems to "realist approaches". Foreign: QBism, RQM, CH. | **Proof** inside that framework. **Category error** if read as a theorem about QBism, RQM or CH, which have no λ by design. Myrvold pressed PBR against QBism; QBists reject the premise (SEP). | **Yes.** A QBist's "not applicable" is unmistakably non-native to the ψ-ontology tradition. But criterion (1) already predicts this (a D omission in A3), so criterion (2) adds no information. | High |
| B4 | **Bell nonlocality under QBism.** Native home: Bell 1964. Foreign: QBism "eliminates quantum nonlocality" because outcomes are the agent's own experiences (FMS 2014). CH also denies nonlocal influences (Griffiths, SEP). | **Re-description** by rejecting a premise. Neither reading touches the inequality. "QM is local" is a claim about which premise fails. Bong et al. (2020) make the menu explicit: under control at the scale of an observer, one of No-Superdeterminism, Locality, or Absoluteness of Observed Events must fail. QBism and RQM give up absoluteness. | **Yes, trivially.** The divergence is visible in one sentence of premises. Each side calls the other's reading a category error; that dispute is unresolved. | High (status); open (who is right) |
| B5 | **Landauer cost of measurement under CH.** Native home: thermodynamics of information (Landauer 1961). Bennett (2003) argues that logically reversible operations, which include measurement in principle, can be thermodynamically free; the cost lies in erasure. Sagawa & Ueda (2009) give separate lower bounds for measurement and erasure, and Landauer's bound comes out only "for a special case". Norton (2011) disputes the derivations. Foreign: CH, where measurement is a physical process inside a framework and records are correlations within one consistent family. | **Category error** as posed: "the cost of measurement" presupposes a primitive that CH excludes. **Re-description** once a quasiclassical framework, a memory register and a bath are fixed, but then the cost belongs to thermodynamics, not to CH. Gell-Mann & Hartle (2007) bridge coarse-graining and entropy without a Landauer bound. I found no CH derivation of one (search not exhaustive). | **Yes, but confounded.** The source tradition is a sixth notation, and its own native result is contested. | Med-low |
| B6 | **(Added) Curved-space path integral.** A canonical performer transcribes a time-sliced path integral without the practitioners' slicing convention. | **Proof** only once the convention is supplied. Otherwise the Hamiltonian is wrong by ħ²-order curvature terms (DeWitt 1957). | **Yes, non-trivially.** This is the one case where the musical analogy works: tacit performance practice. It locates the gap in conventions, not in commissioning bodies. | Med-high |

**Net result for criterion (2).** It is false for mathematically equivalent content (B1, B2). Where interpretations reject a premise (B3, B4), it is true but redundant with criterion (1). It is confounded in B5. It holds non-trivially only for tacit conventions (B6).

## 5. Task (c): is shut-up-and-calculate a designed omission?

**Claim.** It is not a designed omission of the Hilbert-space notation. It is an accidental omission relative to the notation, which a later community then retro-designated (class R).

**Evidence.**
1. Dirac's 1930 preface does design out pictures: the theory controls "a substratum of which we cannot form a mental picture without introducing irrelevancies" (quoted in Drago, arXiv:2101.09565). That excludes visualizable ontology. It does not forbid the measurement question.
2. Von Neumann devotes his final chapter to the measuring process and to placing the cut. The founders did not keep a designed silence about measurement.
3. The phrase "shut up and calculate" is Mermin's (1989). Mermin (2004) corrects its attribution to Feynman.
4. Kaiser (2014) traces the calculational style to post-war, wartime-forged pedagogy that favoured "efficient, repeatable" and trainable techniques.
5. What the notation did design is that the cut can be placed anywhere without changing predictions (§3, A1). That makes the stance possible without requiring it.

**Confidence:** medium. **Status:** supported, with one caveat. Calling the stance "designed by Dirac" or "accidental" depends on whose design counts, and that ambiguity is the criterion's own.

**What would refute the claim.** Documentary evidence that von Neumann or Dirac meant the measuring-process material to be optional for users of the formalism.

## 6. Task (d): how the criterion could be wrong, and the plurality question

**W1. It is unfalsifiable through retro-designation.**
- Any accident can be relabelled as designed after the fact (A3's agent definition; SUAC in §5).
- Without the dated-priority test in §2, criterion (1) cannot fail.
- With the test, it can fail. It sorts A1 and A5 only after their rows are split.

**W2. Notational pluralism may be merely pragmatic.**
- Problems choose formulations (path integrals for perturbation theory and topology, canonical methods for spectra), and one author, Dirac, seeded both the canonical form (1930) and the Lagrangian form (1933).
- If formulations follow problems rather than bodies, the criterion's central metaphor does no work. This is the strongest objection; rows A2–A4 survive only because their founders announced their aims.

**W3. Physics has an outside arbiter that music lacks.**
- A physics "performance" is a number checked against experiment. An unrecognizable one is either a wrong number (an error, not a notation) or different words (sociology).
- The second is testable as a Collins-style imitation game (Collins et al. 2006), in which expertise acquired through language alone can pass. So "no contact with practitioners" carries all of criterion (2)'s weight, and B6 shows the contact that matters is tacit convention.

**W4. Selection bias.**
- The five were picked because they differ, so the criterion was confirmed by the sample.
- A control would be the Heisenberg and Schrödinger pictures (one commissioner, no difference in omissions) or the phase-space formulation. These were not tested here.

**W5. The task's own row assignments are partly fictional.**
- A1 has two commissioners; A5 has the wrong one.
- A criterion validated on mis-specified rows is not validated.

**Plurality: epistemic or ontic.** The claim E is that the five share one empirical core and differ only in what their users can compute or say. Four possible tests:
- **F1, empirical divergence.** A nonzero Sorkin third-order term would break the shared Born core. The plurality would then hide rival theories, not notations. The current bound is below 10⁻² (Sinha et al. 2010).
- **F2, observer-scale Wigner's friend.** Suppose a local-friendliness violation with genuinely observer-scale, controllable "friends" forced rejection of Absoluteness of Observed Events (Bong et al. 2020). Then RQM's relative facts become empirically favoured, and the plurality is ontic: facts are perspectival. Current tests use photons as friends and do not discriminate.
- **F3, internal inconsistency.** If the Lawrence–Markiewicz–Żukowski or Pienaar results stand, RQM is a different theory, not a notation of the shared core.
- **Not a falsifier.** A proof that some confirmed physics cannot be stated in one formulation (for example, theories without a Lagrangian) shows a limit on expression. That is an epistemic limit and leaves E intact.

**Verdict on E:** unfalsified, weakly supported, and challenged from inside the set by RQM. *Confidence* in E: medium. *Status:* open.

## 7. Corpus cross-check

Checked on 2026-10-02 in `qnfo-audit.paper_index` and in the public `qnfo-corpus` AI Search instance.
- `finite-distinction-quantum-mechanics`, `measurement-as-hierarchical-distinction`, `distinction-lattice-framework`: **absent**. The nearest search hits were unrelated.
- `quantum-laws-of-form-superposition-as-re-entry-measurement-as-distinction`: **absent** under that slug. The nearest match is `quantum-laws-of-form`, a consolidation that lists seven open problem categories.
- `QNFO.SLB.001`: registered to QNFO/laws-of-form (`docs/PORTFOLIO.md`). This session cannot read that repository, so it was **not checked**.
- **Relevant corpus finding.** The `cancellation-rule` paper concedes that the M-property ("a boundary encodes measurement") "was never formally justified" and "is NOT forced by the calculus" (§4.1). It also says the rules fire the same way with or without measurement semantics (§5.2).
  - Under criterion (1), "measurement as distinction" is therefore a later assignment (A or R), not a designed category of Spencer-Brown's notation.
  - §5.2 is exactly the signature of epistemic plurality: the semantics can be swapped without changing any derivation.
  - The paper's claim that Laws of Form is "uniquely suited" because its three outcomes match measurement is a re-description. In quantum mechanics, oscillation is not a measurement outcome. Confidence: medium-low.
- `s10-observer` concludes that its framework "is not empirically distinguishable from RQM or QBism", which is consistent with E.
- **Hygiene.** `cancellation-rule.md` carries two different identifiers, one in the index header and one in the body. `s10-observer` cites the latter. Not resolved here.

## References (verified 2026-10-02)

- Adler 1969, doi:10.1103/PhysRev.177.2426
- Adlam & Rovelli, arXiv:2203.13342
- Bell 1964, doi:10.1103/PhysicsPhysiqueFizika.1.195
- Bell & Jackiw 1969, doi:10.1007/BF02823296
- Bennett 2003, arXiv:physics/0210005
- Bong et al. 2020, arXiv:1907.05607 (doi:10.1038/s41567-020-0990-x)
- Busch, quant-ph/0105049; Busch 2003, arXiv:quant-ph/9909073
- Callan & Harvey 1985, doi:10.1016/0550-3213(85)90489-4
- Collins, Evans, Ribeiro & Hall 2006, doi:10.1016/j.shpsa.2006.09.005
- DeWitt 1957, doi:10.1103/RevModPhys.29.377
- Dowker & Kent 1996, arXiv:gr-qc/9412067
- Drago, arXiv:2101.09565
- Faddeev & Popov 1967, doi:10.1016/0370-2693(67)90067-6
- Faddeev 1984, doi:10.1016/0370-2693(84)90952-3
- Feynman 1948, doi:10.1103/RevModPhys.20.367
- Fuchs, arXiv:1003.5209
- Fuchs, Mermin & Schack 2014, arXiv:1311.5253
- Fuchs & Schack 2013, doi:10.1103/RevModPhys.85.1693 (arXiv:0906.2187)
- Fuchs, Hoang & Stacey 2017, arXiv:1703.07901
- Fujikawa 1979, doi:10.1103/PhysRevLett.42.1195
- Gell-Mann & Hartle, arXiv:1803.04605; 2007, arXiv:quant-ph/0609190
- Gleason 1957, doi:10.1512/iumj.1957.6.56050
- Gribov 1978, doi:10.1016/0550-3213(78)90175-X
- Griffiths 1984, doi:10.1007/BF01015734
- Hari Dass, arXiv:2003.12683
- Harrigan & Spekkens 2010, arXiv:0706.2661
- Kaiser 2014, doi:10.1038/505153a
- Kent 1997, arXiv:gr-qc/9604012
- Landauer 1961, doi:10.1147/rd.53.0183
- Lawrence, Markiewicz & Żukowski 2023, arXiv:2208.11793
- Leifer 2014, arXiv:1409.1570
- Masanes, Galley & Müller 2019, arXiv:1811.11060
- Mermin 1989, doi:10.1063/1.2810963; Mermin 2004, doi:10.1063/1.1768652
- Norton 2011, doi:10.1016/j.shpsb.2011.05.002
- Pienaar 2021, arXiv:2107.00670
- Pusey, Barrett & Rudolph 2012, arXiv:1111.3328
- Rovelli 1996, arXiv:quant-ph/9609002
- Sagawa & Ueda 2009, arXiv:0809.4098
- Schlosshauer & Fine 2005, arXiv:quant-ph/0312058
- Singer 1978, doi:10.1007/BF01609471
- Sinha et al. 2010, arXiv:1007.4193
- Sorkin 1994, arXiv:gr-qc/9401003
- von Neumann, *Mathematical Foundations of Quantum Mechanics* (Princeton, 2018 edition), doi:10.1515/9781400889921
- Zeh 1970, doi:10.1007/BF00708656
- Zurek 2003, arXiv:quant-ph/0105127; Zurek 2005, arXiv:quant-ph/0405161
- SEP entries: Healey, "Quantum-Bayesian and Pragmatist Views of Quantum Theory"; Rovelli, "Relational Quantum Mechanics"; Griffiths, "The Consistent Histories Approach to Quantum Mechanics"; Bacciagaluppi, "The Role of Decoherence in Quantum Mechanics"

**Cited but not verified:** the non-existence of a rigorous real-time path-integral measure, and rigged Hilbert spaces as the repair for Dirac's improper vectors. Both are standard lore, and both are marked inline.
