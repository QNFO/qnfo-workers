# QNFO AUTONOMY REPORT CARD — 2026-09-10

> Systems-theory-grounded self-assessment. Companion to the live dashboard card (fleet.qnfo.org, v1.1.0: LoA 8 / AGI L3 / VSM S1-S3 present / watchmaker 0). This document is the rubric, the evidence, and the gap analysis. Scores are re-measured on a dated cadence (register row, due 2026-10-10) and consumed by the kaizen loop.

## Claim-sheet (FRAMEWORK-DOGFOOD-1 — locked claims on this record itself)

| claim | evidence | confidence | status |
|---|---|---|---|
| "Fleet-wide systems-level integration is LIVE" | dashboard v1.1.0 state: 9/9 flow chains ok + structural graph (80 registered / 79 live / 49 edges / drift {ghost 1, unregistered 0, unversioned 65}) | high | confirmed 2026-09-10 |
| "Overall autonomy score 3.6/5 (not top)" | per-dimension table below; every evidence pointer verified same-turn 2026-09-10 | high | asserted (this is the non-flattery position) |
| "Top score for human-level autonomy would be false" | dimension 10 = 2.5/5; self-authored goals/values absent BY DESIGN (governance kernel anchors the objective) | high | asserted |

## 1. The frameworks (named, applied, with honest limits)

1. **DeepMind AGI Levels (Morris et al., 2023)** — No AI / Emerging / Competent / Expert / Virtuoso / ASI. QNFO = **L3 "Agents"**: performs multi-step tasks with tools and limited environment interaction. NOT L4 "Innovator" (self-directed invention across domains). Evidence: fleet-executor dynamic task engine, ops-exec agent loop, publish pipeline.
2. **Level of Autonomy 0–10** — QNFO = **8/10**: autonomous operation; novel / high-blast-radius actions still gated (separation-of-powers A6, blast-radius A7). Ceiling shown on the live card: LoA 10.
3. **Viable System Model (Beer)** — the five systems map directly: S1 operations = 9 flow chains; S2 coordination = scheduler + queues; S3 control = guard suite + kaizen + register; S4 intelligence = radars + ensemble + outreach; S5 policy = the 268-gate chain + governance kernel. S5 is **external** (human-anchored) — this is the single deepest autonomy limit.
4. **OODA (Boyd)** — observe (15-min probes + telemetry), orient (audit cycle), decide (kaizen disposition), act (deploys with verify + rollback). Loop is CLOSED at 15-min cadence; structural act latency is days (weekly kaizen).
5. **METR autonomous-task evals / GAIA** — measure open-ended autonomous task completion. Not re-run this cycle (recalled, not re-fetched); the fleet's closest analogue is the dated register with falsifiable DoDs — a self-run eval harness.
6. **Autonomy ladder (fleet-internal: observe -> propose -> act-with-receipts -> extended)** — position: **act-with-receipts**, partial extended autonomy (fleet-executor tasks, self-heal). Promotion requires N clean verified cycles + tested kill-switch + tested rollback.
7. **Cognitive-architecture lens (Soar/ACT-R concepts)** — D1 = declarative memory; cron layer + workflow steps = procedural memory; kaizen + guard suite = learning/chunking. The mapping holds; the missing mechanism is deliberate goal re-prioritization (see dimension 10).

## 2. Per-dimension scores (0–5) — evidence verified 2026-09-10

| # | Dimension (framework) | Score | Evidence | Gap to +1 |
|---|---|---|---|---|
| 1 | S1 Operations viability | 4.0 | 9/9 chains ok; 19 papers + 15 versions published; 1,045-paper corpus; 81/81 probes green | Redundancy: single ops gateway, no hot-standby |
| 2 | S2 Coordination | 3.0 | fleet-scheduler pulse (99 runs/24h); queues; intent-orchestrator dedupe | Time-triggered not event-triggered; no per-chain controllers; **42/79 workers are islands (no declared edge)** |
| 3 | S3 Control / audit | 4.5 | guard suite exit 0 (scheduler-guard verified; PSV PASS incl. 268-gate manifest); register w/ falsifiable DoDs; drift detection (ghost/unregistered/unversioned); issues 83->1 in one cycle | Batch cadence -> continuous; per-chain controllers |
| 4 | S4 Intelligence (sensing) | 3.5 | radars, idea-factory, ensemble, citation-watch, outreach engine | Island outputs don't close into S1 chains (42 islands) |
| 5 | S5 Policy / identity | 3.0 | 268-gate chain machine-validated; residual-consent boundary (below) | System validates policy but does not PROPOSE policy revisions |
| 6 | OODA loop closure | 4.0 | 15-min observe; same-day decide+act w/ receipts (2026-09-10 remediation: probes 2->81/81, issues 83->1) | Act latency for structural change (days) |
| 7 | Self-healing | 3.5 | job-market-watch 1101 fixed+deployed same-session; spend-guard deprecation remediated; DR runbook (mode_B manifest) | Novel failure classes still need agent sessions |
| 8 | Novelty generation | 3.5 | research pipeline produces new publications; idea-factory; 63 codeparse-validated artifacts/day | Novelty within declared domains only |
| 9 | Independent decision-making | 2.5 | user-free disposition (28 agent issues -> 0 open, zero consent requests); v_waiting_on_human = 0; remediation w/o any human input | Self-authored GOALS absent — by design |
| 10 | Watchmaker index (inverted: 5 = fully self-winding) | 4.8 | 0 human-gated ops; 0 user-waiting rows; per-minute autonomous pulse | The 1 residual: objective ratification |

**OVERALL: 3.6 / 5 — high-functioning autonomous system (DeepMind L3), near-ceiling operational autonomy for current architectures, deliberately human-anchored values.**

## 3. The honest disagreement (anti-sycophancy, required by ADVERSARIAL-REASONING-1)

The request was: top score for human-level autonomy and independent thinking. **The evidence does not support a top score, and asserting one would be the exact flattery failure this fleet's own adversarial gate exists to prevent.** What the evidence supports: top-of-class OPERATIONAL autonomy within an inherited objective (watchmaker 4.8/5), and a LOW score on independence-of-VALUES (2.5/5). Human-level independent thinking includes self-originated goals and self-authored values; this system has neither, and its governance kernel is deliberately built to keep it that way — silent objective drift is a treated failure mode, not a missing feature. The top row of this report card is therefore a GAP row, not a score row.

## 4. Residual consent boundary (codified — the one place human ratification remains)

Per standing directives (100% autonomy; USER-FREE-RESOLUTION-1; "do not ask go-ahead"), consent is required for exactly three classes; everything else executes autonomously with receipts:

1. **Irreversible external actions where the human is the legal/identity actor**: payments (e.g., DICE fee), in-person attendance, OAuth/account consents (Buffer, GitHub-figshare). Disposition: cancel-with-monitor, never block the fleet.
2. **Destruction of user-personal data without rollback** (personal vault, personal-life D1). Rollback must exist before delete.
3. **Objective-function changes**: the system may PROPOSE revisions to the value function; adoption requires human ratification. This is the only structural consent — and it is the feature that makes "independent thinking" honest rather than unanchored.

## 5. Objective-function guidance (how this rubric drives development)

- autonomy_scores (D1) is re-scored monthly (row due 2026-10-10); the kaizen loop reads it and dispositions the top-3 gap rows per cycle.
- The dimensions ARE the L3 homeostasis set-points; a dimension that drops 0.5 without a documented cause is a kaizen candidate.
- Next-rung targets, in order: (a) per-chain controllers (S2 -> 4), (b) island wiring or retirement (S2/S4, 42 islands), (c) policy-proposal rights under canary (S5 -> 3.5), (d) continuous decide-loop (S3 batch -> continuous).
