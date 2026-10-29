# QNFO Systems-Level Report Card — Fleet Autonomy & Intelligence

Canonical · v1.1 · 2026-09-10 · owner QNFO ops
This file: qnfo-ops/docs/SYSTEMS-REPORT-CARD.md  (the canonical name referenced by the fleet dashboard)

RECONCILIATION NOTE (F3 resolved): this is the SINGLE canonical report card. It supersedes and merges
(a) the dated draft SYSTEMS-REPORT-CARD-2026-09-10.md and (b) the concurrent observability v1.1.0 /
dashboard "system layer" assessment, which already references THIS filename. The dashboard card
(fleet.qnfo.org, qnfo-fleet-dashboard) renders the operational score; qnfo-observability v1.1.0 computes
the integration score into qnfo-audit.integration_state; this document is the one source of truth that
defines the scales, the objective function, and the evidence. No parallel-truth copies remain (A3).

## 0. Purpose and method

Measures the QNFO fleet AS A SYSTEM against established frameworks for machine intelligence and
autonomy, to answer: how close is the fleet to the TOP BAND (human-level autonomy + independent
thinking + independent decision-making), and what objective function drives it there. Self-assessed from
live evidence (same-cycle reads), scored honestly — weak axes are reported as weak. Every locked claim
carries claim / evidence / confidence / status (FRAMEWORK-DOGFOOD-1).

## 1. Rubrics used (citable, external — union of the two prior assessments)

| Framework | Measures | Used for |
|---|---|---|
| Sheridan-Verplanck Levels of Automation (LoA 0-10) | decision authority | decision authority (live card) |
| Beer Viable System Model (VSM S1-S5) | organizational viability | organizational viability (live card) |
| OODA loop (Boyd) | decision-cycle closure | decision cycle (live card) |
| OpenAI 5 levels / DeepMind Levels of AGI | general-intelligence ceiling | intelligence axis |
| SAE J3016 L0-L5 (adapted) | control-loop automation | autonomy axis |
| IBM MAPE-K (Monitor-Analyze-Plan-Execute over Knowledge) | self-adaptive loop closure | loop closure |
| IBM self-* properties | autonomic capabilities | self-healing |
| NIST ALFUS | mission/context complexity | autonomy + decision |
| human-in / on / out-of-the-loop taxonomy | where the human sits | decision authority |
| METR time-horizon | duration of autonomous operation | horizon |

TOP BAND (operationalized): LoA 10 (computer decides everything, acts autonomously) · AGI L5
Organization · VSM S1-S5 internalized · SAE L5 human-out-of-the-loop (policy-setting only) · METR
weeks-scale self-directed horizon. The fleet is MEASURED against this band, not awarded it.

## 2. Overall grade — honest, NOT the top band

Level: SAE L3/L4 conditional-to-high autonomy; Sheridan-Verplanck LoA 5-8 (5 when human-gated decisions
are pending, 8 when human-gated ops = 0); OpenAI L3 Agents; VSM S1-S3 present / S4 partial / S5 external.

Composite: B-. Strong on verification & safety (A) and closed decision loop (OODA). Moderate on
self-healing + loop closure. Weak on drift control (D+), integration (D+), and the objective function is
only now being wired to a computed score (was C-, improving). The top band (LoA 10 / AGI L5 / VSM S5
internalized / human-out-of-the-loop) is the target, not the current state.

## 3. Live operational card (what fleet.qnfo.org renders today)

| Dimension | Framework | Level | Top of scale |
|---|---|---|---|
| Decision authority | Sheridan-Verplanck LoA | LoA 5 or 8 (autonomous ops; novel/high-blast-radius still gated A6/A7) | LoA 10 |
| Intelligence | OpenAI/DeepMind levels | L3 Agents | L5 Organization |
| Organizational viability | Beer VSM | S1-S3 present, S4 partial, S5 external | S1-S5 closed, S5 internalized |
| Decision cycle | OODA | closed loop, 15-min cadence | closed, real-time |

Supporting chips (live): human-gated ops = 0 (or N open); self-heal actions; open agent issues; drift
divergence = ghost + unregistered + unversioned.

## 4. Detailed analysis (10 + 3 dimensions)

For each: level, evidence, claim / evidence / confidence / status.

### A. Autonomy — SAE L3/L4 (conditional-to-high)
Claim: recurring execution fully automated (L4); novel/high-blast-radius decisions self-verified with
human-on-exception (L3). Evidence: 52 scheduled workers on cloud cron; guard suite exit 0 (2026-09-10);
USER-FREE-RESOLUTION-1; v_waiting_on_human=0. Counter-evidence (not L5): outreach ACTIVATION_AT
2026-09-15 dated gate; container-cluster retirement blocked on evaluation rows 92/96/97/99. High confidence.

### B. Closed-loop completeness (MAPE-K) — ~5/8 loops
Claim: of the AF-1 eight self-loops (census/heal/improve/audit/govern/publish/promote/optimize), ~5 are
closed with receipts; 3 open/partial (improve = kaizen disposition gap; govern = register human rows;
optimize = calibrator receipts). Evidence: fleet-manifest-sweep, qnfo-error-selfheal + fleet-deploy,
guard suite, paper-reviser + research-exec drain. Medium confidence (receipt-count inferred).

### C. Self-healing — B+/A-
Claim: deterministic failures self-correct without a human. Evidence: 5-guard suite; qnfo-error-selfheal
(deduped agent_issues, re-arms fixed errata classes); deploy-verify-version; this session's in-session
fix of the stale-repo hybrid landmine (qnfo-ops v2.9.3). Limit: cannot heal ~65 unversioned workers (no
contract to heal against). High confidence.

### D. Self-improvement — C+
Claim: closed improvement loop (idea intake -> triage -> exec -> publish -> revise) exists; the
meta-loop (improving the improver) is partial. Evidence: multi-source idea intake; paper-reviser
auto-revision (>=2 versions); kaizen weekly report. Gap: kaizen candidates can sit proposed past due.

### E. Independent decision-making — C+ (horizon hours-to-days)
Claim: operational decisions autonomous; strategic/reversible decisions dated-gated or human-anchored.
Evidence: OUTREACH-ENGINE-LIVE-1 (8/day cap, per-domain 3/day, warm-up to 09-15); autonomous disposition.
METR horizon: hours-to-days, not weeks.

### E2. Independent thinking (sub-metrics) — C (the explicit gap)
Claim: independent EXECUTION is high; independent THINKING (self-directed hypothesis generation,
self-initiated exploration beyond the current task, long-horizon self-directed projects) is low.
Evidence: no loop currently generates NEW research questions or self-initiates projects beyond the
radar/idea intake triggers; the idea intake is external-fuel (radar/edge-form/auto-miner), not the
fleet asking its own novel questions. This is the axis most distant from the top band. Medium confidence.

### F. Self-model / situational awareness — C
Claim: registry-as-truth self-model exists but is incomplete. Evidence: service_registry 80 vs 79 live
(1 ghost qnfo-wrangler-test); ~65/80 unversioned; FLEET-MANIFEST stale (65 vs 79). Multiple ledgers
disagree (A3). High confidence (direct D1 reads).

### G. Verification & safety — A
Claim: verify-before-trust + blast radius + kill switches + cost ceilings + adversarial checks are
best-in-class. Evidence: 5-guard suite exit 0; axioms A5/A7/A9; SERVER-SIDE-EXEC-100-1 (no client code
execution); AI cost $9.596/30d vs $90 cap (live qnfo-ops /cost, 2026-09-10). High confidence.

### G2. Security — A (dedicated axis)
Claim: a strong security posture across the surface. Evidence: bearer auth (OPS_ROUTER_AUTH_KEY, SHA-256
compare); secrets referenced by name, never echoed; 100% server-side execution (no client code); blast
radius + kill switches; TOKEN-DISCOVERY redundancy; MCP auto-approve file as source of truth. High
confidence. (Folded into G in the prior draft; split here for completeness.)

### H. Drift control (Lyapunov / attractor distance) — D+
Claim: drift is the weakest signal; it is under-damped (positive-Lyapunov on version discipline).
Evidence: ~65/80 unversioned; 1 ghost; mirror + repo-vs-deploy drift found/fixed this session. High.

### I. Integration (graph + contract) — D+
Claim: sparse near-star graph; most workers are un-integrated leaves; declared wiring incomplete.
Evidence (live /api/integration): 80 registered / 49 edges / density 0.0078 / 42 islands / 16 sinks.
High.

### J. Availability / reliability — B (dedicated axis, added for completeness)
Claim: the fleet is up and low-error, but availability is sampled, not continuously SLA-measured.
Evidence: 14,622 req / 12 err in 24h (~0.08% error rate, live /api/state); 81 probes up; 9 D1 bound.
Caveat: no per-worker uptime SLO ledger yet — this axis is the least instrumented of the strong ones.
Medium confidence.

### K. Objective function — C+ (was C-, improving)
Claim: the objective function is now WIRED, not just proposed. Evidence: qnfo-observability v1.1.0 writes
a composite integration score to qnfo-audit.integration_state; the dashboard renders the Watchmaker
objective (human -> 0, drift -> 0, self-heal -> 1). Gap: the full 6-term F (section 5) is specified here
but not yet a single computed scalar feeding every loop. Medium confidence.

## 5. Objective function (canonical + expansion)

CANONICAL (operational, what AF-1 defines and the dashboard renders) — the Watchmaker metric:
  human-gated ops -> 0 ; drift divergence -> 0 ; self-heal -> active (>=1, no silent failures).
A cycle is "good" iff it moves the Watchmaker triad toward (0, 0, active).

EXPANSION (full 6-term scalar, drives continuous improvement):
  F = w1*loop_closure_rate - w2*drift_count - w3*human_interventions - w4*cost_overrun - w5*integration_gap + w6*throughput
  loop_closure_rate = closed/8 loops (B); drift_count = unversioned+ghost+mirror-drift (H);
  human_interventions = v_waiting_on_human + dated-gated migrations (E); cost_overrun = max(0, spend-$90/30d) (G);
  integration_gap = islands + unregistered + declared-vs-actual mismatch (I); throughput = publications+deploys+ideas (D).
Each loop reports its contribution with a receipt; the kaizen loop reviews F weekly and takes the
next-highest-marginal-improvement action (gradient ascent). STATUS: canonical Watchmaker is live; the
6-term F is specified, weights uncalibrated, not yet a single ledger scalar — top next action.

## 6. Roadmap to the top band (LoA 10 / AGI L5 / VSM S5 internalized)

1. Normalize service_registry.version to semver (closes ~65 blind spots) — highest leverage (H, B, F).
2. Wire the full 6-term F as a single computed ledger scalar (extend integration_state.score) + dashboard
   card (K).
3. Wire the static binding matrix into the dashboard so declared-vs-actual integration drift is computable (I).
4. Close the 3 open loops (kaizen disposition, govern register, calibrator receipts) (B).
5. Convert dated-gated items (outreach ACTIVATION_AT, retirement rows) to autonomous triggers with kill
   switches (A -> L4/L5).
6. Add an independent-thinking loop: a "question-asker" that proposes NEW research questions / self-directed
   projects from the corpus (E2 — the furthest axis from the top band).

## 7. Claim sheet (FRAMEWORK-DOGFOOD-1)

| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| Overall B- ; SAE L3/L4 ; LoA 5-8 ; AGI L3 ; VSM S1-S3 | dashboard card + detailed analysis, live reads | medium (self-measured) | current |
| 5-guard suite exit 0 | same-turn runs 2026-09-10 | high | current |
| AI cost $9.596/30d vs $90 cap | live qnfo-ops /cost 2026-09-10 | high | current (supersedes $18.08 memory) |
| 80 reg / 79 live / 1 ghost / 0 unregistered | D1 + live list | high | current |
| ~65 unversioned (drifting 65-67) | service_registry.version not semver | high | current |
| density 0.0078 / 42 islands / 16 sinks | /api/integration live | high | current |
| 14,622 req / 12 err / 24h (~0.08%) | /api/state live | high | current |
| observability v1.1.0 writes integration_state score | qnfo-observability/worker.js | high | current |
| dashboard card renders + references THIS doc | fleet.qnfo.org + worker.js | high | current (after this merge) |
| ~5/8 loops closed | crons + logs, inferred | medium | current |
| 6-term F not yet a single scalar | absence-of-evidence | medium | current gap |

## 8. Adversarial / failure modes

- Self-measurement bias: the system grades itself (A6); a third-party audit could differ. Mitigated by
  same-turn reads + confidence labels, not eliminated.
- Rubric mismatch: SAE (vehicles), LoA (human-factors), VSM (organizations), AGI levels (general AI) were
  designed for other domains; mapping them to a Cloudflare fleet is analogy, not a validated instrument.
- "~5/8 loops closed" and "0.08% error rate" are inferred/sampled, not exhaustively measured; there is no
  per-worker uptime SLO ledger (J caveat).
- Evidence is point-in-time; this card drifts unless F is computed continuously (K).
- The 6-term F weights (w1..w6) are uncalibrated; the Watchmaker triad is the only operational objective.
- This document is still self-authored; it has not been independently audited by a human.
