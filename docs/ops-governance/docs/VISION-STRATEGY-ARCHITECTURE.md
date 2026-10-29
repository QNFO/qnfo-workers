# QNFO — Vision, Strategy, Architecture (the big picture)

Date: 2026-09-13 · Author: qnfo-ops / ops-exec · Status: synthesis (no new policy)
Companions: `AUTONOMOUS-FLEET-ARCHITECTURE.md` (AF-1, substrate), `SIGNAL-ORGANISM-ARCHITECTURE.md` (payload),
`INTEGRATION-DEFECTS-2026-09-13.md` (defect list D1–D17). Every figure below is a live tool return
from this session; nothing is restated from a doc without re-measurement.

## 0. Term caveat

"Quniverse" matches no row, node, or table in any bound store. The real entities are **QNFO**
(the fleet + organisation) and **QWAV** (legacy research API, worker `qnfo-qwav`). This document
describes those.

## 1. Vision

QNFO is a **fully server-side, self-operating research organism** with a single human principal
who sets policy and handles exceptions — nothing else. Two architectures, orthogonal:

- **AF-1 (operations substrate).** Every recurring function runs in the cloud; the fleet senses,
  decides, acts, verifies, records and proposes its own improvements with no human and no client
  in the loop. Success metric: the **Watchmaker Index** — the share of recurring operations still
  needing a human or an ad-hoc agent session — driven to ~0. Clients are **lenses, not organs**.
- **Signal-organism (research payload).** Every artifact is a response to a *detected signal*;
  every signal is audited for what it does **not** establish; refinement is unsupervised; every
  output is deposited as a citable, attributable object (ADR-014: attribution is always the
  individual). Fitness function: **JPCUB** (energy per correct computation). The platform's
  intelligence is not generation — it is **signal triage under a falsifiability constraint**.

The unifying claim: *self-improvement = the artifact's ignorance set shrinking, verifiably* —
not the model getting better. Formally `R(a) = a′` is accepted only when `U(a′) ⊊ U(a)`.

## 2. Strategy

**The real bet (falsifiable, P5).** A solo-run system sustains the loop `Φ = R ∘ U ∘ B ∘ T`
across ≥3 domains for 12 months without collapsing into self-referential content generation.
Everything else is scaffolding around that bet.

**The autonomy ladder** (promotion requires N verified cycles, zero unverified mutations, tested
kill-switch and rollback; demotion on any harm or unverified mutation):

| L0 observing | L1 proposing | L2 acting-with-receipts (internal, reversible, auto+verified) | L3 extended (external, capped, kill-switched) |
|---|---|---|---|

**Phase plan** (AF-1 §6): P0 version sweep + telemetry sink + registry truth → P1 Worker Contract
enforced + 100% probe coverage + policy engine + kill-switch registry → P2 kaizen auto-execution +
audit calendar → P3 publish/promote to L2/L3 + drills → P4 the fleet proposes its own roadmap.

**Two strategy invariants that must not be optimised away.** A6 (separation of powers): the
observer is never merged into the observed — the dashboard stays separate from the deployer, the
auditor separate from the audited. A3 (one ledger per domain): the entire D14 defect exists
because this was allowed to lapse.

## 3. Architecture

### 3.1 Operations substrate (AF-1, L0–L7)

| Layer | Content |
|---|---|
| L0 Substrate | Workers, D1, R2, KV, Vectorize, Queues, Workflows, AI Gateway, Cron, Email — no workstation, no VM |
| L1 Fleet Fabric | **Worker Contract v1**: `VERSION` const, `/health`, self-doc header, canonical repo path + byte parity, `service_registry` row, secret names, autonomy flags. Registry-as-truth |
| L2 Telemetry | Run ledger `fleet_runs` (trigger→decision→action→verification→evidence); Tier-1 service-binding writes, Tier-2 Logpush→R2, Tier-3 external probes |
| L3 Control Loops | the eight selves: **census, heal, improve, audit, govern, publish, promote, optimise** |
| L4 Intelligence | router (`qnfo-ai`), memory (D1+R2+Vectorize), conductor (Workflows/Queues), ops agent (this endpoint) |
| L5 Action Fabric | risk-classed tools: READ → INTERNAL → REVERSIBLE (auto+read-back) → EXTERNAL COMMS (caps) → PUBLISH (gates) → IRREVERSIBLE (approval) |
| L6 Surfaces | qnfo.org, papers.qnfo.org, digests, fleet dashboard; DeepChat/ChatBox as read/control lenses |
| L7 Continuity | backups, DR runbook, ledgers as time-travel; cold-restart invariant: rebuild from canonical + ledgers alone |

### 3.2 Research organism (L0–L8)

L0 signal intake → L1 triage (assign ε) → L2 **boundary confinement** `B ⊆ W × Σ`, default-deny →
L3 synthesis → L4 **ignorance audit** (15-question `U`) → L5 refinement (accept iff `|U|` shrinks)
→ L6 JPCUB fitness → L7 deposit/attribution (DOI) → **L8 re-entry** (artifact → signal, payload =
the *ignorance* not the result). A8 is the anti-content-farm guard.

### 3.3 Data plane (bound to this endpoint)

- **D1 ×8**: `qnfo-audit` (**209 tables**, 20,312 cloud_ops_events, 21,027 probe rows, 11,503
  calibration rows, 2,423 ai_queries), `living-paper` (**904 papers**, 504 clusters),
  `qnfo-graph` (**8,346 nodes / 8,493 edges / 539 agent_memories**), portfolio, outreach, cms,
  ipatent, personal.
- **Vectorize ×5**: research corpus (qwav-research-v2), notes, tasks, handoffs, ai-log.
- **R2 ×4 bound** (releases, audit, backups, skills) + `qnfo-canonical` (deploy source of truth).
- **KV**: equation-cache.
- **Governance**: `governance_kernel` v2026-09-01.1 **ACTIVE**, **13 ratified gates**, boundary
  "propose → gate → commit (versioned write + rollback)"; 9 ADRs; WBS
  `PORTFOLIO.PROGRAM.PROJECT.PHASE.TASK.SUBTASK` across 3 programs / 45 phases / 21 projects /
  191 tasks (149 WBS-keyed).

## 4. Live state vs target (measured 2026-09-13)

- Fleet: **55 deployed workers**; deploy scan at 13:03Z = **33 clean, 8 drifted, 10 ahead, 4
  staleCanon, 0 errors**; `errKinds {version-format:17, stale-canon:4, health-ver:10}`.
- Reliability (30d, CF analytics): **279,282 requests / 187 errors = 0.067%**; Workers AI
  **1.13M neurons ≈ $12.43/30d** against a $90 guard → A9 has ~7× headroom.
- Run ledger: **482 runs, 477 ok / 5 failed**.
- Self-heal: 1,372 actions (528 healed, **445 deferred**, **50 failed**); 117 improvements.
- L8 loop: **262 signals, 100% `source='artifact_reentry'`**; boundary matrix **37 rows** (seeded,
  migration step 2 done).
- Governance exercised: **3 gate-log entries ever**, including 2 live `BLOCK` decisions by
  `qnfo-research-exec`.

## 5. What is wrong, ranked (delta from the defect list)

1. **D14 split-brain ledgers** — `issue_ledger` **303 open** vs `agent_issues` **12** visible to
   ops tooling: ~25× under-report. A3 violated at the governance layer.
2. **D16 SAI has no time series** — `report_card_history` 1 row, `sai`/`grade` NULL; the weekly
   writer fails on a schema mismatch (`no column named source`). The headline metric is
   unvalidatable.
3. **NEW — VERSION comparator misparses `v`-prefixed versions.** `newer("v1.1.0","1.0.0")` parses
   the leading `v` as `NaN→0`, so `v1.1.0` reads as *older* than `1.0.0`. Consequence:
   `personal-companion` is misclassified "canonical-ahead" and the healer attempts a **downgrade
   every hour** — 26 consecutive `HTTP 400` failures (09-12 09:01Z → 09-13 13:01Z) because the
   canonical body cannot export its Workflow. An unbounded retry with no backoff (A7/A10 unmet).
4. **NEW — the `stale-canon` class is 4 workers, not 7** (`obsidian-writer`,
   `osf-integrity-check`, `personal-life-maintain`, `qnfo-arxiv-radar`). Their canonical lacks a
   `VERSION` marker, so the scanner **overwrites canonical with the deployed body and `continue`s**
   — skipping drift detection. These four are structurally unable to receive updates. (An earlier
   figure of 7 in this session was not reproducible on the live scan; 4 is the measured value.)
5. **NEW — heal is skipped whenever the version was read from `/health`** (`if (heal && !usedHealth)`),
   so the 10 `health-ver` workers can be diagnosed but never auto-repaired.
6. **L0 intake is nearly empty.** All 262 signals are self-re-entry; there are **zero** signals from
   arxiv / zenodo / telemetry / email. L8 was closed, but the organism is currently
   **single-source** — it consumes its own ignorance, not the world's. D6 compounds this: 496
   untriaged `idea_proposals` and 110/262 signals carry an empty `U` (ε=0 by their own rule).
7. **D15 209 tables, no declared owner per domain** (6 issue stores, 8 task stores, 6 project
   stores) — the structural cause of integration difficulty.
8. **D1 probe coverage 14.5%** (10 targets / 55 workers); **D5** `integration_state` frozen ~47h;
   **D10** ~59k cumulative gateway failures (embedding model alone 37k).

## 6. Honest limits and the strongest counter-argument

- **Counter-argument that stands:** the system is *partially instrumented, not broken*. 0.067%
  invocation error rate, 477/482 runs ok, governance actively blocking bad publications, chat
  canary 12/12, intent queue drained to zero. The gap is **sensing and coordination**, not
  capability — and D14 is a wiring defect, not a workload defect.
- The `stale-canon` and comparator findings are read from one hourly scan and one log table;
  `deployed_version` for wrangler-deployed workers is inferred from `/health` text, not bytes.
- AF-1 is **PROPOSED**, not ratified; the autonomy ladder's promotion thresholds (the value of N)
  are unspecified.
- The signal-organism's central risk is **unclosed**: `R ∘ U` can shrink `U` by *narrowing a
  claim* rather than discovering anything (Goodhart on the ignorance operator). No proof exists
  that the 15 external questions cannot themselves be gamed.
- `fleet_crons.last_fired` may be registry-seeded; weekly-cron conclusions carry a bootstrap
  caveat (all records cluster in one 15-minute window on 09-10).

## 7. Priority order

1. Unify the issue ledgers (A3) — 303 open rows are invisible to every ops tool.
2. Fix the `report_card_history` schema so SAI has a trend (D16).
3. Fix the `v`-prefix comparator + add backoff/breaker so the hourly downgrade loop stops.
4. Give the 4 `stale-canon` workers a real `VERSION` marker + `/health`, and let `usedHealth` rows
   heal.
5. Extend probes 10 → 55 via service bindings; add `health_url`/`owner`/`autonomy_level`/`crons`
   to `service_registry` (4 of 7 Worker-Contract fields missing).
6. Wire at least one **external** signal source into `signals` so L0 stops being self-referential.
7. Consolidate autonomy/kill-switch state behind one evaluator consulted before every L5 action.
