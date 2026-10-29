# QNFO Signal-Organism Architecture — L8 Loop Closure & 8-Layer Model

> Version 1.0 (2026-09-12) · Owner: QNFO · Status: ACTIVE (canonical)
> Supersedes the research-pipeline view of AUTONOMOUS-RESEARCH-PIPELINE.md v1.0 by adding the
> missing L8 feedback layer and the L2 boundary-enforcement layer. Lives alongside
> AUTONOMOUS-FLEET-ARCHITECTURE.md (AF-1), which governs fleet *operations*; this doc governs the
> *research organism* — the signal→artifact→signal loop.
> Source note: O:/notes/v1/2026/09/12/_26255070812.md (the vision this refactor realizes).

---

## 0. What this is and is not

| Phrase | Literal reading (rejected) | Corpus-true kernel (architected) |
|---|---|---|
| "content creation platform" | Marketing content generator | **Research output system** (papers, living papers, notes, DOIs) |
| "from real-time signals" | Trend-jacking / news scraping | **Signal-Worker ontology** as the trigger layer |
| "fully automated" | No human in the loop | **AI-assisted** with a single human principal (ADR-014 attribution) |
| "self-improving" | Autonomous model retraining | **Unsupervised Iterative Content Refinement** (IPATENT) + Bayesian Synthesis |
| "natural language" | Chatbot prose | Natural-language **research artifacts** under a formal methodology |

The content-farm reading is rejected by both epistemics and ADR-014 (attribution is always the
individual author). The architected vision is the right-hand column.

## 1. The vision (one paragraph)

QNFO is a **signal-constituted research organism**: a solo-run, AI-assisted open-science program in
which *every research artifact is a response to a detected signal*, *every signal is audited for what
it does not establish*, *every claim is refined iteratively without supervision*, and *every output is
deposited as a citable, attributable, natural-language object* — with **energy-per-correct-computation
(JPCUB)** as the cross-domain fitness function that decides which signals are worth responding to. The
platform's "intelligence" is not generation; it is **signal triage under a falsifiability constraint**.

## 2. Formal model

### 2.1 Definitions

**D1 (Signal).** A signal `s` is a tuple `s = (τ, σ, κ, ε)`: `τ` a timestamp, `σ ∈ Σ` a source
(arXiv, Zenodo, D1 telemetry, a colleague's preprint, an experimental result), `κ` the content (a
claim, a measurement, a paper, a failure), and `ε` an **evidential weight** — what the signal
licenses you to believe. Signals without `ε` are noise.

**D2 (Signal-Worker Boundary).** A worker `w : S → A` maps signals to artifacts. The **boundary**
`B ⊆ W × Σ` is the set of permitted (worker, source) pairs (QNFO.INM "Signal-Worker Boundary
Confinement").

**D3 (Artifact).** A natural-language research object with a type `θ(a) ∈ {paper, living-paper,
note, patent-disclosure, benchmark-spec}`, an attribution `α(a)` (always the individual, ADR-014),
and a deposit identity (DOI or registered slug).

**D4 (Ignorance operator).** The Universal Ignorance Audit `U` maps a claim `c` to the set of
questions `c` does not answer: `U(c) = {q₁…q₁₅}` filtered to those undecided by `c`. This is the
anti-sycophancy engine — it is what prevents the platform from becoming a confident content mill.

**D5 (Refinement operator).** Unsupervised Iterative Content Refinement is a map `R : A → A` with
`R(a) = a′` such that `U(a′) ⊊ U(a)` — refinement strictly shrinks the open-question set.
**Self-improvement = the artifact's ignorance set shrinking, verifiably — not the model getting better.**

### 2.2 The vision as a dynamical system

State `X_t = (S_t, A_t, W_t)` evolves under `X_{t+1} = Φ(X_t)` with
`Φ = R ∘ U ∘ B ∘ T` (triage → boundary → ignorance-audit → refinement).

- **Proven (by construction):** if `R` is accepted only when `|U|` strictly decreases, the
  ignorance set is monotone non-increasing. This is a tautology of the acceptance rule.
- **Conjectured (the real bet):** a solo-run system sustains `Φ` across ≥3 domains (adelic QFT,
  quantum computing, information theory, energy) for 12 months without drifting into self-referential
  content generation. **This is the falsifiable core.**
- **Open:** whether `B` can be learned rather than hand-specified, and remain safe.

## 3. The eight layers

| Layer | Function | Fleet anchor (worker / table) | Status → after this refactor |
|---|---|---|---|
| **L0 — Signal intake** | Ingest σ from arXiv, Zenodo, D1 telemetry, email, fleet status | qnfo-ai (edge) → qnfo-intent-orchestrator; idea-hub; radar-hub; ideas.qnfo.org → `idea_proposals` | Partial → Active |
| **L1 — Triage** | Assign ε; decide respond / log / ignore | qnfo-idea-triage (dual-model scorecard → `research_queue`) | Partial → Active |
| **L2 — Boundary confinement** | Enforce B: which worker may act on which signal | `signal_worker_boundary` table + qnfo-signal-loop | **Specified → Enforced** |
| **L3 — Synthesis** | Generate candidate artifact | qnfo-research-exec (note→draft) + Bayesian Synthesis | Active |
| **L4 — Ignorance audit** | Apply U; compute open-question set | Universal Ignorance Audit (15 questions) at review stage | Active |
| **L5 — Refinement** | Apply R until ignorance shrinks | IPATENT "Unsupervised Iterative Content Refinement" (revise stage) | **Patented → Wired (acceptance rule added)** |
| **L6 — Fitness / selection** | Score artifacts by energy-per-correct-computation | JPCUB (Zenodo 21637028) | Active |
| **L7 — Deposit & attribution** | DOI, slug, ADR-014 attribution | qnfo-research-exec publish → living-paper.`papers` + Zenodo | Active |
| **L8 — Feedback** | Deposited artifact re-enters as a signal | qnfo-signal-loop re-entry scan → `signals` | **Open → Closed (this refactor)** |

**The architectural gap was L8.** The pipeline ended at "finalize" (`research_queue.status=published`
+ DOI recorded) with **no re-entry** — 19 published artifacts, 0 re-entered. That made "self-improving"
false: it was a pipeline, not a loop.

## 4. The L8 re-entry rule (specification)

**L8 is the operator that closes the loop.** Formally, it is a map

```
L8 : A_deposited → S
L8(a) = s = (τ=now, σ="zenodo", κ = {a, U(a)}, ε = ε_self)
```

where the signal's content κ is **the deposited artifact together with its open-question set** `U(a)`
(not the artifact's claims alone — the *ignorance*, not the *result*, is what warrants a response), and
`ε_self` is the evidential weight of a self-deposited, citable, verified artifact.

### 4.1 The re-entry rule (normative)

1. **Trigger.** An artifact re-enters when it reaches deposit identity (living-paper `papers` row with
   a DOI, `distribution_status ∈ {distributed, published}`), and it has not already re-entered
   (idempotency key: DOI).
2. **Content.** κ = `{title, abstract, doi, U(a)}` — the open-question set `U(a)` is the payload.
   If `U(a)` is empty or unrecorded, the re-entry signal carries `ε = 0` and is **logged, not
   responded to** (an artifact with no recorded ignorance cannot fuel the loop; recording `U(a)` at
   review time is therefore a prerequisite, not an afterthought).
3. **Weight.** `ε_self` is high for *verified* artifacts (computationally verified, review-clean) and
   zero for artifacts that failed review. ε is stored, never inferred.
4. **Triage re-entry.** The emitted signal flows back through L1 triage, which scores the **open
   questions** (not the artifact) under the JPCUB threshold (Section 6): respond (spawn a follow-up /
   revision) iff expected ignorance-reduction per joule exceeds the threshold; else log.
5. **Anti-rationalization guard.** A response is accepted only if it *strictly shrinks* `U` (the L5
   acceptance rule, Section 5). The loop may not "improve" by narrowing claims; narrowing a claim to
   shrink `U` is a violation and is logged as such.

### 4.2 Data model (new tables, qnfo-audit D1)

```sql
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,            -- signal id (stable hash of source_ref + ts)
  ts TEXT,                        -- τ
  source TEXT,                    -- σ: arxiv|zenodo|idea_proposals|d1_telemetry|email|fleet|artifact_reentry
  source_ref TEXT,                -- DOI / arXiv id / proposal id
  content TEXT,                   -- κ (claim/measurement/paper ref)
  open_questions TEXT,            -- U(a) as JSON array
  evidential_weight REAL,         -- ε
  domain TEXT,                    -- adelic-qft|quantum|info-theory|energy|benchmark|meta
  status TEXT DEFAULT 'new',      -- new|triaged|respond|logged|ignored
  decision TEXT,                  -- ACCEPT|LOG|IGNORE
  score REAL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS signal_worker_boundary (
  worker TEXT NOT NULL,           -- W
  source TEXT NOT NULL,           -- Σ
  permitted INTEGER DEFAULT 1,    -- B(worker, source)
  domain TEXT,
  note TEXT,
  PRIMARY KEY (worker, source)
);
```

The boundary matrix is **seeded** (hand-specified, per the "Open" item in §2.2 — learning B is future
work, not this refactor) and enforced at intake.

## 5. The L2 boundary confinement (specification)

**B ⊆ W × Σ** is enforced as a lookup against `signal_worker_boundary` at every intake decision:

1. A signal `s` with source `σ` may be consumed by worker `w` iff `(w, σ) ∈ B`.
2. Default-deny: a (worker, source) pair absent from the matrix is **not permitted**.
3. The canonical seed (this refactor) confines:
   - **research** workers (qnfo-research-exec, qnfo-idea-triage, idea-hub, jnl-pipeline) → sources
     `arxiv, zenodo, idea_proposals, research_queue, artifact_reentry`.
   - **dissemination** workers (qnfo-social, qnfo-outreach, Buffer) → sources `zenodo, social_engagement`
     only (they promote *deposited* artifacts, never raw signals).
   - **personal** surfaces → `personal_life` only (PERSONAL-QNFO-SEPARATION-1; never research signals).
   - **ops** surfaces (qnfo-ops, fleet) → `fleet, d1_telemetry` only.
4. **Cross-domain guard** (the note's P3): a signal tagged `domain=adelic-qft` may not be consumed by
   a quantum-benchmark worker's *claim* path — the boundary matrix carries a `domain` column and the
   guard rejects (worker, source, domain) triples not in the matrix.

## 6. The JPCUB triage threshold (parameterized, not fabricated)

The fitness function is `F(a) = E(a) / KPI(a)` (lower is better). For quantum workloads `KPI` is a
passed EU-Flagship-style instance (CLV at 1/e, GHZ fidelity > 1/2, Shor η ≥ 0.15, QEC Q>1 with d≥3).
For research artifacts `KPI` is **ignorance-reduction per unit effort**.

**A signal is worth responding to iff the expected ignorance-reduction per joule exceeds the triage
threshold.** The threshold is **NOT specified numerically in the source note** — the JPCUB extension to
"ignorance-reduction per joule" for pure-math artifacts is explicitly *unspecified* ("I will not invent
one"). Therefore:

- The threshold is a **calibration parameter** `TRIAGE_THRESHOLD`, initialized to `null` (unset =
  triage falls back to the existing composite scorecard, not JPCUB).
- It is **calibrated, not asserted**: P2 (§7) is the experiment that would let us set it. Until P2
  produces a measured difference, no numeric threshold is written.

## 7. Falsifiable predictions

| # | Prediction | Type | Falsified if |
|---|---|---|---|
| P1 | Enforcing L8 yields a measurable decrease in mean `|U|` per artifact over 90 days | Independent | mean `|U|` flat or rising |
| P2 | JPCUB-scored triage outperforms recency-scored triage at selecting high-value signals | Independent | no significant difference in downstream artifact quality |
| P3 | Boundary confinement B reduces cross-domain contamination (adelic claims leaking into quantum benchmarks) | Consistency | contamination rate unchanged |
| P4 | The ignorance set does not oscillate upward under R | Consistency (near-tautological) | oscillation observed → acceptance rule broken |
| P5 | A solo-run system sustains Φ across ≥3 domains for 12 months without quality collapse | Independent, high-risk | quality metrics degrade in ≥1 domain |

**P5 is the vision's real bet and its real vulnerability.**

## 8. The central risk (stated plainly)

**A signal-driven, self-refining, natural-language research platform is formally indistinguishable from
a rationalization engine.** The loop `R ∘ U` can shrink the ignorance set *by narrowing the claim*
rather than by discovering anything — Goodhart's law applied to the ignorance operator. The mitigation
is that `U` must include *external* questions (the 15-question audit is designed for this), but there
is no proof the external questions cannot themselves be gamed. **This failure mode would turn the
vision into the content farm it rejects, and it is not fully closed.** Secondary: (a) the solo-run
constraint (ADR-014) caps throughput; (b) the JPCUB→pure-math extension is unspecified.

## 9. Migration (this refactor, ordered)

1. [x] Spec this document (L8 rule, L2 matrix, L5 acceptance rule, JPCUB parameterization).
2. [ ] Create `signals` + `signal_worker_boundary` tables in qnfo-audit; seed the boundary matrix.
3. [ ] Deploy `qnfo-signal-loop` worker: re-entry scan (L8) + boundary enforcement (L2) + /health.
4. [ ] Add the L5 acceptance rule (accept revise iff `|U|` strictly decreases) to the revise stage.
5. [ ] Record `U(a)` at review time (prerequisite for L8 re-entry with ε > 0).
6. [ ] Fix ideas.qnfo.org 522 (missing worker route).
7. [ ] Calibrate TRIAGE_THRESHOLD via P2 (deferred — needs measurement, not assertion).

## Appendix — Change log

- 2026-09-12: v1.0 — initial. L8 specified; L2 specified+enforced; L5 acceptance rule added;
  JPCUB threshold parameterized (not fabricated); 522 diagnosed (missing route).
