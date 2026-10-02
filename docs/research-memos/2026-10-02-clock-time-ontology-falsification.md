# Inflation, clocks and relational time: falsification memo

Prepared 2026-10-02 for QNFO (agent_issues 1737). AI-drafted by an agent pipeline; not peer reviewed; treat as a working memo.

**Verdict on the original claim.** The kimi-k2.6 chat claim (2026-09-17) says inflation is "the epoch when the universe cooled and expanded enough for stable periodic processes to emerge", turning "step time" into "clock time". It is **refuted**.
- (i) Clocks do not need periodicity. Monotone non-periodic observables (decay, temperature, scale factor, entropy production) are clocks in routine use. In the relational formalism the package relies on, periodic clocks are the *problematic* case.
- (ii) Inflation is the wrong epoch. H is nearly constant during inflation, so m/H cannot change for any field. Heavy fields oscillate throughout inflation (the "standard clocks" of the literature). Sub-horizon modes *stop* oscillating at horizon exit.
- (iii) There is no universal no-clock to clock transition. The Hubble–Compton crossover of each species falls at the cosmic age t = ħ/(2mc²), a dimensional tautology spread over a continuum of epochs. For the electron and proton the nominal crossovers predate the existence of those masses, and when the masses switch on they already exceed H by 10¹⁰ to 10²⁰.
- (iv) The SM electroweak and QCD transitions are smooth crossovers, so the "phase transition" language has no order parameter behind it.

The only kernel is model-dependent: inflation ends when the inflaton's effective mass reaches about √3·H, after which it may oscillate. That is one field, at the *end* of inflation; it does not happen in all models and creates no clock where none existed. Do not publish the claim.

---

## 0. Scope and method

- **Source.** The task text is the description of `agent_issues` id 1737 (D1 `35e2e573…`, read-only `SELECT`). It is truncated at "(3) Check whether the Q"; see §6. Charter pillar: `research`.
- **Units and conventions.** Natural units unless stated. The Compton angular frequency ω_C = mc²/ħ equals m. M_Pl = 1.221×10¹⁹ GeV (non-reduced) and M = M_Pl/√(8π) = 2.436×10¹⁸ GeV. ħ = 6.582×10⁻²⁵ GeV·s. T₀ = 2.7255 K = 2.349×10⁻¹³ GeV. g*s,0 = 43/11 = 3.909.
- **Rules followed.** Each finding gives Claim / Evidence / Confidence / Status. I cite only references I opened (arXiv abstract, publisher or ADS page, or the full text). §7 lists what I verified and what I did not.

## 1. Falsification conditions for the step-time / clock-time / relational-time package

| # | Condition that would falsify (or rescue) the package | Test performed | Outcome |
|---|---|---|---|
| F1 | A non-periodic monotone observable works as a clock (agreement checked against other clocks) ⇒ "clock time requires periodicity + counting" is false | §2 | **Met**: strong form falsified |
| F2 | There is a time t_c before which no subsystem had a frequency above H and after which some did, **and** t_c falls in inflation | §3, arithmetic | **Fails on both counts**: no universal t_c, and m/H is constant during inflation |
| F3 | A "phase transition" in clock availability needs an order parameter or a non-analyticity | §3.3 | None defined by the package. The SM electroweak and QCD transitions are lattice-established crossovers (arXiv:1508.07161, arXiv:1812.08235). **Unsupported / untestable as stated** |
| F4 | Page–Wootters (PW) time is explanatory only if it predicts something standard QM with an external t does not, or derives the clock rather than assuming it | §5 | Ideal non-interacting limit: a reformulation. Novel predictions exist only for non-ideal or interacting clocks and are **untested** |
| F5 | Zitterbewegung (ZB) is a frequency standard only if a one-electron state shows an observable oscillation at 2mc²/ħ | §4 | QFT says no. Only analogue simulations show ZB. **Refuted** |

## 2. (1a) Is "periodicity + counting" logically necessary for a clock?

**Claim (package):** clock time requires a periodic process plus a counter.

**Evidence against (counterexamples):**
1. *Radiometric clocks.* The age comes from a monotone ratio, N(t)/N₀ = e^(−t/τ) or daughter/parent. Nothing periodic is involved, and isotope-ratio mass spectrometry measures the ratio without even counting decay events.
2. *Cosmological clocks.* Cosmology uses T, a, z, or the e-fold number N = ln a as time variables. PDG's own time–temperature relation (t·T²_MeV = 2.4 N(T)^(−1/2) s, Olive & Peacock 2023, eq. 22.44) is a clock reading off a monotone observable. Chen (arXiv:1104.1323) shows that the *phase* of heavy-field oscillations records a(t). So even when a periodic process is used, it is calibrated against a monotone background.
3. *Thermodynamic and state-defined time.* Connes & Rovelli's thermal-time hypothesis (gr-qc/9406019) derives a time flow from a statistical state, not from an oscillator. Autonomous-clock theory ties clock accuracy to entropy produced per tick (Erker et al., arXiv:1609.06704). The linear relation between accuracy and entropy was measured in a nano-electromechanical clock (Pearson et al., arXiv:2006.08670). The resource a clock cannot do without is irreversibility, i.e. a monotone record; periodicity is not.
4. *Inside the relational formalism itself.* Chataignier, Höhn, Lock & Mele (arXiv:2409.06479, NJP 28, 034504, 2026) find that relational observables relative to periodic clocks are only "transiently invariant per clock cycle". Counting winding numbers does not produce invariant observables, and the original PW conditional probabilities fail for systems with a continuous energy spectrum when the clock is periodic. The relational dynamics is global only for monotonic clocks (Höhn, Smith & Lock, arXiv:1912.00033, footnote 30).
5. *Logical point.* "Periodic" presupposes equal intervals, which in practice are defined by comparing clocks with one another, so periodicity cannot be logically prior to clock time. Counting merely turns a non-injective phase into a monotone register. The required core is (a) an observable monotone in the parameter over the range used, (b) agreement between clocks, and (c) a record.
6. *No clock is ideal.* With a Hamiltonian bounded below, no observable is monotone in t, so clocks partly run backwards (Unruh & Wald, PRD 40, 2598, 1989, as restated in arXiv:1912.00033 and arXiv:2607.01296). Pauli's objection does the same for time operators. "Clock time" is a matter of degree, not a phase.

**Steelman:** for *precision*, periodic oscillators win by orders of magnitude (atomic clocks against radiometric dating). "Periodicity is the best engineering route to metrological time" is **supported**.

**Confidence:** high. **Status:** "periodicity + counting is logically necessary" is **refuted**.

## 3. (1b) Is there a no-clock → clock epoch? The Hubble–Compton crossover

### 3.1 Formula and assumptions

PDG (Olive & Peacock 2023, eq. 22.47): **H = 1.66 √g\* T² / M_Pl**. With a constant g\*, the radiation era gives t = 1/(2H) and 1 + z = (T/T₀)(g\*s/g\*s,0)^(1/3). Crossover condition: H = ω_C = m.

For T > m_top all Standard Model species are relativistic, so g\* = g\*s = 106.75 (PDG table, 4N = 427). Then √106.75 = 10.332 and 1.66 × 10.332 = **17.15**, which gives **T_x = √(m M_Pl / 17.15)**.

A useful identity: setting H = m in t = 1/(2H) gives **t_x = ħ/(2mc²)**, independent of g\*. The "crossover" is simply the moment when the age of the universe reaches half a reduced Compton period. Dimensional analysis guarantees that every massive species has one, so the crossover marks no special physics.

### 3.2 Explicit arithmetic

**Electron** (m_e = 5.110×10⁻⁴ GeV):
- m_e M_Pl = 5.110×10⁻⁴ × 1.221×10¹⁹ = 6.239×10¹⁵ GeV²
- T² = 6.239×10¹⁵ / 17.15 = 3.638×10¹⁴ GeV², so **T_x = 1.91×10⁷ GeV**
- t_x = 6.582×10⁻²⁵ / (2 × 5.110×10⁻⁴) = **6.44×10⁻²² s**. PDG cross-check: 2.4/10.332/(1.907×10¹⁰ MeV)² = 6.39×10⁻²² s.
- 1 + z = (1.907×10⁷ / 2.349×10⁻¹³) × (106.75/3.909)^(1/3) = 8.12×10¹⁹ × 3.011 = **2.44×10²⁰**

**Proton** (m_p = 0.9383 GeV):
- m_p M_Pl = 1.146×10¹⁹ GeV², so T² = 6.680×10¹⁷ GeV² and **T_x = 8.17×10⁸ GeV**
- t_x = **3.51×10⁻²⁵ s**
- 1 + z = 3.480×10²¹ × 3.011 = **1.05×10²²**

**Convention spread.** Using the axion-literature onset 3H = m divides T_x by √3 (electron: 1.10×10⁷ GeV). Using f = mc²/h instead of ω divides it by √(2π) (electron: 7.6×10⁶ GeV). The conclusions hold under either.

**Other species:** μ 2.7×10⁸ GeV; W 7.6×10⁹ GeV; top 1.1×10¹⁰ GeV; a 0.05 eV neutrino 6.0×10³ GeV; a 10⁻²² eV scalar 0.63 keV (g\* = 3.36, 1+z ≈ 2.7×10⁶, t ≈ 0.1 yr). The crossovers form a continuum from about 10¹⁰ GeV to the present day, with no single epoch.

**Massless species:** with m = 0 there is no rest-mass frequency, so no Compton crossover ever. Thermal quanta still carry ω ≈ 2.7T, and ω/H = 2.7 M_Pl/(17.15 T) = 1.9×10¹⁸ GeV / T, far above 1 at any post-inflation temperature (T_rh ≲ 6×10¹⁵ GeV). Gauge interactions equilibrate below about 10⁻² M_Pl/√N ≈ 7×10¹⁵ GeV (PDG). The plasma never lacks fast processes.

### 3.3 Comparison with the named epochs

H_inf bound: V = (3π²/2) A_s r M⁴ with A_s = e^3.044 × 10⁻¹⁰ = 2.10×10⁻⁹ (Planck 2018 VI) and r < 0.036 (BICEP/Keck 2021). That gives V^(1/4) < 1.41×10¹⁶ GeV and **H_inf < 1.93×10⁻⁵ M = 4.7×10¹³ GeV**. Instant reheating would give T_rh,max = (30V/π²g\*)^(1/4) ≈ 5.8×10¹⁵ GeV.

| Epoch | T | g\* | H (GeV) | t | 1+z | m_e/H | m_p/H |
|---|---|---|---|---|---|---|---|
| Inflation | cold; T_GH = H/2π ≲ 7.5×10¹² GeV | – | ≲4.7×10¹³, ~constant | – | – | constant (≳10⁻¹⁷) | constant |
| Reheating | 4.7 MeV ≤ T_rh ≲ 6×10¹⁵ GeV (de Salas et al. 2015 lower bound) | – | model-dependent | – | – | – | – |
| *p crossover (nominal)* | 8.2×10⁸ GeV | 106.75 | 0.94 | 3.5×10⁻²⁵ s | 1.0×10²² | – | 1 |
| *e crossover (nominal)* | 1.9×10⁷ GeV | 106.75 | 5.1×10⁻⁴ | 6.4×10⁻²² s | 2.4×10²⁰ | 1 | – |
| Electroweak crossover | 159.5 ± 1.5 GeV | 106.75 | 3.6×10⁻¹⁴ | 9.2×10⁻¹² s | 2.0×10¹⁵ | 1.4×10¹⁰ | 2.6×10¹³ |
| QCD crossover | 156.5 ± 1.5 MeV | 17.25–61.75 | 1.4–2.6×10⁻²⁰ | 1.3–2.4×10⁻⁵ s | 1.1–1.7×10¹² | 2–4×10¹⁶ | 4–7×10¹⁹ |
| BBN (n/p freeze-out → D bottleneck) | 0.8 → 0.07 MeV | 10.75 → 3.36 | 2.9×10⁻²⁵ → 1.2×10⁻²⁷ | ~1 s → ~3–4 min | 4.8×10⁹ → 3.0×10⁸ | 2×10²¹ → 4×10²³ | 3×10²⁴ → 8×10²⁶ |
| Recombination / last scattering | 0.26 eV | (matter era) | 3.3×10⁻³⁸ | ≈370 kyr (PDG) | ≈1090–1100 | 1.5×10³⁴ | 2.8×10³⁷ |

For recombination, H(z = 1090) uses Planck ΛCDM values (H₀ = 67.4, Ω_m = 0.315, z_eq ≈ 3400). The BBN times use the constant-g\* formula and are approximate after e± annihilation.

### 3.4 What the numbers say

1. **The nominal crossovers are unphysical for the species named.** Above the electroweak crossover the electron has no Higgs mass, only a thermal mass of order eT, whose frequency exceeds H anyway. Above the QCD crossover there are no protons. When the electron's mass switches on (t ≈ 10⁻¹¹ s), m_e/H ≈ 10¹⁰ already. When protons form (t ≈ 10⁻⁵ s), m_p/H ≈ 10¹⁹–10²⁰. These clocks are born ticking; none of them crosses over.
2. **Inflation cannot host a crossover.** With H about constant, m/H is fixed, so a field is oscillating (m > 3H/2) or frozen for all of inflation. Heavy fields oscillate: Chen's "primordial standard clocks" (arXiv:1104.1323) and the cosmological-collider signals of Arkani-Hamed & Maldacena (arXiv:1503.08043). Comoving modes oscillate while sub-horizon and freeze at horizon exit, then oscillate again after re-entry (the acoustic peaks).
3. **"Cooled" is wrong for inflation.** The Gibbons–Hawking temperature H/2π stays roughly constant. Cooling belongs to the hot big bang, after reheating.
4. **The steelman.** Slow roll needs |η| ≈ m_eff²/(3H²) ≪ 1, so inflation ends near m_eff ≈ √3·H (or ε ≈ 1). In potentials with a quadratic minimum the inflaton then oscillates. That is a real "H drops below a mass" event, but it involves one field, it does not happen in every model (quintessential inflation has no oscillation; Peebles & Vilenkin, astro-ph/9810509), and it decays rather than being "stable". Monotone clocks (φ, N = ln a) exist before and after it.

### 3.5 Closest legitimate literature cousins (neither supports the claim)

- **Penrose (EPAC'06, pp. 2759–2762):** with effectively massless, conformally invariant matter near the big bang, "the universe has no way of 'building a clock'" (verified quote). That puts clock emergence at mass generation (electroweak scale), in a cosmology (CCC) that *replaces* inflation. *My assessment:* running couplings (the trace anomaly, Λ_QCD) and the plasma temperature T break scale invariance anyway.
- **Stupar & Vedral (arXiv:1710.04260),** "Was inflation necessary for the existence of time?": a "sketch proof" based on memory capacity, a different mechanism from emerging periodicity. I found no journal version.

**Claim:** some epoch of standard cosmology is a no-clock → clock transition, and it is inflation. **Evidence:** §3.2–3.4. **Confidence:** high for the arithmetic and for m/H being constant during inflation. Moderate for the general statement that "no universal transition exists", which depends on the pre-reheating history. **Status: refuted** (for inflation). The universal-transition version is **unsupported**; only the species-specific, dimensional crossovers t = ħ/2mc² exist.

## 4. (1c) Is Zitterbewegung a legitimate frequency standard?

**Numbers.** ω_ZB = 2m_ec²/ħ = 1.55×10²¹ rad/s (f = 2.47×10²⁰ Hz, period 4.0×10⁻²¹ s). Amplitude ≈ ħ/(2m_ec) = 1.9×10⁻¹³ m. That is about 10¹⁰ times the Cs hyperfine frequency that defines the SI second and about 10⁵ times optical-clock frequencies. No counter or comb reaches it.

**Evidence:**
- ZB comes from interference between the positive- and negative-energy components of the single-particle Dirac position operator. It is absent for the Newton–Wigner / Foldy–Wouthuysen position of positive-energy packets (a standard textbook result, not separately verified here). A space-time-resolved QFT treatment concludes that "quantum field theory prohibits the occurrence of Zitterbewegung for an electron" (Krekora, Su & Grobe, PRL 93, 043004, 2004).
- The observable residue is the **Darwin term**, ΔE = m c²(Zα)⁴/(2n³) for l = 0: 7.2×10⁻⁴ eV (175 GHz) for 1s and 9.1×10⁻⁵ eV (21.9 GHz) for 2s. It is a static energy shift of s-states, not an oscillation one can count. It is measured only in combination with the spin–orbit and kinetic terms (the Dirac fine structure) plus QED corrections. Reading it as "ZB smearing over a Compton wavelength" is a heuristic.
- ZB *has* been seen in **analogue simulations** with tunable parameters (trapped ion: Gerritsma et al., Nature 463, 68, 2010). Those systems are standards of nothing but their own laboratory clock.
- The **Compton frequency** mc²/ħ is a legitimate *derived scale* (mass in s⁻¹). Lan et al. (Science 339, 554, 2013, doi:10.1126/science.1230767) referenced a "Compton clock" to it indirectly through an h/m measurement. Whether a physical oscillation at that frequency exists is disputed:
  - Wolf et al. (CQG 28, 145017, arXiv:1012.1194) show the Compton-phase difference vanishes in a broad class of theories.
  - Peil & Ekstrom (PRA 89, 014101, arXiv:1402.6621) conclude "there is no physical oscillation at the Compton frequency".
  - Schleich, Greenberger & Rasel (PRL 2013) show the phase decomposition depends on the representation.
  - One channeling experiment reported a de Broglie "internal clock" resonance at mc²/h, half the ZB frequency (Catillon et al., Found. Phys. 38, 659, 2008). I found no independent replication.
- Only proper-time *differences* between paths are observable, not a global rest-mass phase (Zych et al., Nat. Commun. 2, 505, arXiv:1105.4531).

**Claim:** ZB is a physical frequency standard. **Confidence:** high. **Status: refuted.** The Compton frequency as a scale is **supported**, but only as a unit conversion. Whether it is a ticking oscillator is **open, leaning against**. QNFO relevance: the repository hosts a ZBW research line (`qnfo-web-unified/archive-qnfo.html`, `qnfo-fleet-control/portfolio.fixture.json`). Any claim there that treats ZB as a clock needs a QFT-level observable.

## 5. (2) The literature critique of the Page–Wootters mechanism

Page & Wootters (PRD 27, 2885, 1983) condition a stationary global state on the reading of a clock subsystem.

**5.1 Kuchař's three criticisms**
- *Claim (Kuchař):* PW is inconsistent. Source: IJMPD 20, 3, 2011, reprint of 1992, as paraphrased in Höhn, Smith & Lock, arXiv:1912.00033 §VIII.C. Its conditional probability (i) mismatches the Klein–Gordon density, (ii) violates the constraint, because the effect operator does not commute with it, and (iii) gives **wrong two-time propagators**, which "prohibits time to flow".
- *Responses:* Dolby (gr-qc/0406034); Gambini, Porto, Pullin & Torterolo (PRD 79, 041501, 2009; this also predicts fundamental decoherence); Giovannetti, Lloyd & Maccone (PRD 92, 045033, arXiv:1504.04215; uses ancillas). Höhn, Smith & Lock claim to resolve all three "without approximations, ideal clocks or ancilla systems".
- *Residual:* every response assumes a global clock ⊗ system split. Höhn, Smith & Lock concede that "generic general relativistic systems do not satisfy the idealization" of a non-interacting clock, and global equivalence needs monotonic clocks.
- **Confidence:** moderate–high. **Status:** answered within the idealised split (**supported**, conditionally); for generic gravitating systems, **open**.

**5.2 Internal time in general**
- *Claim (Kuchař/Isham):* internal-time programmes face the *multiple-choice* problem (different internal times give inequivalent quantum theories) and the *global-time* problem (internal clocks are not monotone everywhere). Source: Isham, gr-qc/9210011.
- *Marolf* (CQG 12, 1995, gr-qc/9412016) recovers external-time QM from an "almost ideal clock". The limit **fails for a clock measuring metric proper time near a singularity in Bianchi models**, which is the early-universe regime the claim invokes.
- **Confidence:** moderate–high. **Status:** these objections **stand** for cosmological use.

**5.3 Clock ambiguity**
- *Claim (Albrecht & Iglesias,* PRD 77, 063506, arXiv:0708.2743; arXiv:0805.4452*):* a different choice of clock gives different effective laws.
- *Responses:* Marletto & Vedral (PRD 95, 043510, arXiv:1610.04773) say a non-interaction condition removes the ambiguity. Stoica (arXiv:2604.21805) argues it extends to the evolution laws and that no purely relational condition removes it. In arXiv:2608.16732 he argues that choosing a canonical time operator circularly imports the temporal meaning it was meant to derive. These are recent single-author preprints.
- **Confidence:** moderate. **Status: open.** The clock remains an input, not an output.

**5.4 The idealised clock**
- *Claim:* ideal clocks exist.
- *Evidence against:* Unruh & Wald (§2). Lorek, Louko & Dragan (CQG 32, 175003, arXiv:1503.01025) show no QFT device measures proper time ideally under acceleration; a 2026 comment and reply (arXiv:2607.00059, arXiv:2604.06292) continue the argument.
- **Confidence:** high. **Status:** that ideal clocks are an idealisation is **supported**.

**5.5 Interacting clocks**
- *Claim:* PW survives clock–system interaction.
- *Evidence:* it does, but the conditional state then obeys a **time-nonlocal** Schrödinger equation (Smith & Ahmadi, Quantum 3, 160, 2019). Gravitational coupling makes the temporal localisation of events clock-relative (Castro-Ruiz et al., arXiv:1908.10165, doi:10.1038/s41467-020-16013-1). Realistic clocks bring fundamental decoherence (Gambini, Porto & Pullin, hep-th/0406260), and quantum time dilation is predicted (Smith & Ahmadi, Nat. Commun. 11, 5360, arXiv:1904.12390).
- **Confidence:** moderate. **Status:** the output is then not ordinary Schrödinger time, and these predictions are **open (untested)**.

**5.6 Explanatory or relabelling?**
- *Ideal limit: a relabelling.* The ideal, non-interacting case is proven equivalent to relational Dirac observables and to the gauge-fixed reduced theory, "three faces of the same dynamics" (arXiv:1912.00033). The conditional state is the Schrödinger solution with t renamed, with no new empirical content.
- *What it explains:* that a stationary global state is compatible with observed dynamics.
- *What it does not explain:* why a good clock exists (§5.3), the arrow of time (PW is time-symmetric, real clocks need entropy production), or the choice of split.
- *The only experiment is an illustration.* Moreva et al. (PRA 89, 052122, arXiv:1310.4691) test nothing beyond standard QM.
- **Status:** "explanatory" is **unsupported** as a general claim; "relabelling in the ideal limit" is **supported**; content beyond that limit is **open**. **Confidence:** moderate.

**Bearing on the claim.** Inflation is where the non-interacting-clock assumption fails worst: everything couples through gravity, the inflaton and scale factor are the only global clocks, and Marolf's ideal-clock limit fails near the singularity. The relational leg cannot carry the claim either.

## 6. (3) Remaining item

- **Truncated text.** Item (3) breaks off at "(3) Check whether the Q". The likely reading is "check whether QNFO's corpus or publications assert the claim".
- **Corpus.** The issue's 2026-10-01 annotation finds the claim only in `chat/2026-09-17/response-q-e8e8ff5851eae.md` and in no published paper. I did not re-run that search.
- **Repository.** A grep of this repository finds no assertion of the claim, only the ZBW references in §4.
- **Recommendation.** Keep the do-not-publish guard, and use F1–F5 as acceptance tests for any future QNFO text that adopts the package.
- **Not closed.** This memo writes nothing to D1 and does not close the issue; closure with `issue_triage.close_evidence` is the owner's or pipeline's call.

## 7. References and verification status

**Verified (abstract, publisher or ADS page, or full text opened):**
Page & Wootters, PRD 27, 2885 (1983), doi:10.1103/PhysRevD.27.2885 · Kuchař, IJMPD 20, 3 (2011) (ADS 2011IJMPD..20....3K) · Isham, arXiv:gr-qc/9210011 · Unruh & Wald, PRD 40, 2598 (1989), doi:10.1103/PhysRevD.40.2598; theorem statement checked via arXiv:1912.00033 and arXiv:2607.01296, original not read · Marolf, CQG 12 (1995), arXiv:gr-qc/9412016 · Albrecht & Iglesias, PRD 77, 063506, arXiv:0708.2743; arXiv:0805.4452 · Marletto & Vedral, PRD 95, 043510, arXiv:1610.04773 · Stoica, arXiv:2604.21805, arXiv:2608.16732, arXiv:2607.01296 · Dolby, arXiv:gr-qc/0406034 · Gambini, Porto, Pullin & Torterolo, PRD 79, 041501, doi:10.1103/PhysRevD.79.041501 · Gambini, Porto & Pullin, arXiv:hep-th/0406260 · Giovannetti, Lloyd & Maccone, PRD 92, 045033, arXiv:1504.04215 · Höhn, Smith & Lock, arXiv:1912.00033 (full text read) · Smith & Ahmadi, Quantum 3, 160 (2019) · Smith & Ahmadi, Nat. Commun. 11, 5360, arXiv:1904.12390 · Castro-Ruiz et al., arXiv:1908.10165, doi:10.1038/s41467-020-16013-1 · Chataignier, Höhn, Lock & Mele, arXiv:2409.06479 · Lorek, Louko & Dragan, arXiv:1503.01025; arXiv:2607.00059; arXiv:2604.06292 · Moreva et al., PRA 89, 052122, arXiv:1310.4691 · Erker et al., PRX 7, 031022, arXiv:1609.06704 · Pearson et al., PRX 11, 021029, arXiv:2006.08670 · Connes & Rovelli, CQG 11, 2899, arXiv:gr-qc/9406019 · Olive & Peacock, PDG "Big-Bang Cosmology" (rev. Aug 2023), eqs. 22.44 and 22.47 and the N(T) table (full text read) · D'Onofrio & Rummukainen, arXiv:1508.07161 · HotQCD (Bazavov et al.), arXiv:1812.08235 · de Salas et al., PRD 92, 123534, arXiv:1511.00672 · BICEP/Keck XIII, arXiv:2110.00483 · Planck 2018 VI, arXiv:1807.06209; Planck 2018 X, arXiv:1807.06211 · Chen, arXiv:1104.1323 · Arkani-Hamed & Maldacena, arXiv:1503.08043 · Peebles & Vilenkin, PRD 59, 063505, arXiv:astro-ph/9810509 · Stupar & Vedral, arXiv:1710.04260 · Penrose, Proc. EPAC'06, THESPA01, pp. 2759–2762 (full text read) · Krekora, Su & Grobe, PRL 93, 043004 (2004) · Gerritsma et al., Nature 463, 68 (2010) · Wolf et al., CQG 28, 145017, arXiv:1012.1194 · Lan et al., Science 339, 554, doi:10.1126/science.1230767 · Peil & Ekstrom, PRA 89, 014101, arXiv:1402.6621 · Schleich, Greenberger & Rasel, PRL (2013), title verified, volume not checked · Catillon et al., Found. Phys. 38, 659, doi:10.1007/s10701-008-9225-1 · Zych et al., Nat. Commun. 2, 505, arXiv:1105.4531.

**Used as textbook physics, not separately verified:** the Foldy–Wouthuysen and Newton–Wigner treatment of ZB; the Darwin-term formula; the Gibbons–Hawking temperature; slow-roll η ≈ m_eff²/3H²; the trace anomaly; the Cs definition of the SI second.

**Not found / not cited:** a journal version of Stupar & Vedral; an independent replication of Catillon et al.; any published source asserting the original claim.
