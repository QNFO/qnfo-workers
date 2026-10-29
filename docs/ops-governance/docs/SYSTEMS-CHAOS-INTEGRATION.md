# Systems & Chaos Theory Applied to QNFO Integration
Canonical date: 2026-09-10. Companion to the fleet dashboard integration view (fleet.qnfo.org) and qnfo-observability /integration.

## Why this exists
A worker can be alive while the system it belongs to is broken. Per-component dashboards answer
"is each part up?"; they cannot answer "do the parts compose?" The integration view is the difference:
chains (producer -> consumer -> medium), coupling (who declares edges on whom), entropy (how fast the
system's own bookkeeping decays), and opportunities (where a closed loop is missing).

## Systems theory -> QNFO

| Principle | Meaning | QNFO artifact | Metric in the dashboard |
|---|---|---|---|
| Ashby's Law of Requisite Variety | A controller needs at least as much variety as the system it controls | 79 workers vs a handful of probes = variety deficit = blindness | coverage: probed/traced/invocated counts + gaps |
| Closed loops with receipts | Every action returns evidence; open loops drift | errata queue -> respond -> publish; scheduler -> executor -> fleet_runs | chain state + fleet-pulse (min activity) |
| Coupling & buffers | Tight coupling propagates failure instantly; loose coupling (queues) buffers it | service bindings (tight) vs D1 queues (loose) | edge density, islands, hubs, sinks |
| Entropy / negentropy | Unattended systems decay; maintenance jobs are the negentropy | self-heal actions, archive sweep, drift audit | decay signals (age of bookkeeping tables) |
| Emergence | System properties invisible at component level | queue backpressure, mode-locked cron pile | opportunities list (backpressure, stale-item) |
| Hierarchy (near-decomposability) | Layers L0-L7 with cross-layer edges | substrate/fabric/telemetry/loops/core/action/surfaces/continuity | integration view = the cross-layer lens |

## Chaos theory -> QNFO

| Principle | Meaning | QNFO artifact | Metric / action |
|---|---|---|---|
| Sensitive dependence | Tiny schedule offsets interact into deterministic but complex interference | 201 daily cron collisions (worst 15 at 06:00) | phase-decoupling: unique minutes (stagger executed 2026-09-10) |
| Self-organized criticality | Unbounded queues self-organize to a critical state; avalanches of any size | duplicate express waves, errata bursts | dedup/idempotency + explicit caps (grain removal); subcritical regime |
| Bifurcation parameter | A queue flips from stable drain to runaway when arrival > drain | research backlog, outreach backlog | monitor the DERIVATIVE of depth, not depth alone |
| Attractors | Fixed point = dead; limit cycle = healthy rhythm; strange attractor = unmanaged turbulence | heartbeat pulse (fleet-scheduler, per-minute) | fleet-pulse min-activity check |
| Lyapunov-style divergence | Non-deterministic dependencies make reruns diverge | idempotent re-runs of the same task | candidate metric (needs 30d of integration_state history) |
| OGY chaos control | Operate near the edge of chaos: enough coupling for emergence, enough damping to avoid turbulence | caps + kill switches + stagger behind autonomy | score weights: chains 50 / coverage 30 / freshness 20 |

## Where the analogy breaks (honest limits)
1. A deterministic digital system has no true chaos; the turbulence comes from the NONDETERMINISTIC
   environment (network, external APIs, humans). Treat "chaos" as a model of environmental interaction, not of the code.
2. Queue dynamics here are stochastic, not chaotic; bifurcation language is a useful alarm metaphor,
   not a claim about nonlinear dynamics. Falsifiable test: if arrival rate is capped and drain is
   monotonic, depth must be bounded - that is a stability proof, not chaos.
3. Lyapunov exponents require time series; we have ~1 day of integration_state. No numeric claim is
   made until 30 days exist.
4. The integration score (0-100) is a weighted heuristic, not a measurement with units. Its value is
   trend + component decomposition, never a single-point verdict.

## The dashboard integration surface
- "System integration (fleet-wide)": coupling map from service_registry deps - edges, density, hubs,
  sinks, islands, ghost/unregistered/unversioned drift.
- "Flow chains": REGISTRY.chains checks (thresholds on queue depths per chain).
- "System integration at a glance": qnfo-observability assessment - score, per-chain state/pending/oldest,
  coverage, decay (entropy), and dynamic opportunities (backpressure, stale items, trace gap, zero-signal workers).
- Reading the score: total 93 = chains 100 + coverage 92 + freshness 77 (weighted 50/30/20). Degrade the
  component, not the total.

## Future work
- Coupling-graph enrichment: edges from actual binding reads, not declared deps only.
- Predictive drain alerts: queue-depth derivative with a 72h horizon.
- Per-chain Lyapunov-style divergence after 30 days of history.
- Wire the score into the Watchmaker Index (share of ops needing humans), the north-star metric.
