# QNFO Autonomous Fleet Architecture (AF-1)

Status: **PROPOSED (design)** · Version: 1.0 · Date: 2026-09-10 · Owner: QNFO ops
Canonical: `qnfo-ops/docs/AUTONOMOUS-FLEET-ARCHITECTURE.md`

> **Two-architecture note (2026-09-12):** AF-1 governs fleet *operations* — how the fleet runs,
> heals, audits, improves, and publishes itself (L0–L7 below). The companion doc
> `SIGNAL-ORGANISM-ARCHITECTURE.md` governs the *research organism* — how signals become artifacts
> and re-enter as signals (an 8-layer loop L0–L8). They are orthogonal and complementary: AF-1 is
> the substrate, the signal-organism is the payload. The research pipeline (AUTONOMOUS-RESEARCH-
> PIPELINE.md L0–L6) maps onto the signal-organism's L0–L7; its missing L8 (artifact→signal
> re-entry) is specified there and implemented by `qnfo-signal-loop`.

## 0. Abstract

The target operating model for a fully server-side, fully AI-driven fleet. The goal is a
system that senses, decides, acts, verifies, records, and proposes its own improvements with
**no human and no client in the loop**. Humans set policy, limits, and values; the fleet runs
the loops. The measure of success is the **Watchmaker Index** — the share of recurring
operations that require a human or an ad-hoc agent session — driven to approximately zero.

This document is the blueprint. The current fleet is the scaffold. The migration plan (Section 7)
is the bridge.

---

## 1. Mission & Axioms

### 1.1 Mission
Every recurring function runs in the cloud. The fleet operates, heals, audits, improves,
publishes, and promotes itself. The human role narrows to policy-setting and exception handling.

### 1.2 Axioms (non-negotiable design invariants)

- **A1 SERVER-SIDE-ONLY** — no recurring function may depend on a client or workstation;
  clients are lenses, not organs. (Thin-client mandate.)
- **A2 EVERYTHING VERSIONED & CONTRACTED** — every unit of code carries a `VERSION`
  constant, a `/health` endpoint, a self-doc header, a canonical repo path, and
  byte-parity between repo and deployment.
- **A3 SINGLE SOURCE OF TRUTH** — one ledger per domain; all sensors reconcile to it. No
  parallel truths (this is what "three sources disagree on worker count" violates).
- **A4 CLOSED LOOPS WITH RECEIPTS** — every loop emits a run record:
  trigger → decision → action → verification → evidence.
- **A5 VERIFICATION BEFORE TRUST** — no mutation is "done" without read-back proof; no claim
  without an evidence pointer.
- **A6 SEPARATION OF POWERS** — the observer is not the observed; the auditor is not the
  audited; no worker redeploys itself (`NO_SELF`).
- **A7 BLAST-RADIUS LIMITS & KILL SWITCHES** — every autonomous action class carries caps and a
  switch (global / subsystem / per-worker).
- **A8 HONESTY & ADVERSARIAL CHECKS** — claims carry confidence; decisions are tested against
  the strongest counter-case; fabrication is prohibited.
- **A9 COST CEILINGS** — spend guards at the gateway; degradation policies under budget pressure.
- **A10 IDEMPOTENCE** — every action is retry-safe (dedupe keys), because retries are inevitable.

---

## 2. Reference Architecture (Layers L0–L7)

``
L6  SURFACES        public sites, digests, ops console, thin client lenses
L5  ACTION FABRIC   gated tools: deploy, email, publish, social, DNS, GitHub
L4  INTELLIGENCE    routing, memory, reasoning, conductor (Workflows)
L3  CONTROL LOOPS   the eight selves (census/heal/improve/audit/govern/publish/promote/optimize)
L2  TELEMETRY       run ledger, probes, telemetry sink, registries, ledgers
L1  FLEET FABRIC    worker contract, registry-as-truth, version discipline, config flags
L0  SUBSTRATE       Workers, D1, R2, KV, Vectorize, Queues, Workflows, AI Gateway, Cron, Logpush, Email
``

Each layer is specified below. The rule of thumb: **L0–L2 are the body, L3 is the nervous system,
L4 is the brain, L5–L6 are the hands and face, L7 is the immune memory.**

### 2.1 L0 — Substrate
Cloudflare account primitives only. No workstation. No long-lived VMs. Every component is a
managed service with a declarative config in the canonical repo.

### 2.2 L1 — Fleet Fabric
The **Worker Contract v1** — every worker satisfies all of:
1. `VERSION` constant (semver; bump per deploy).
2. `GET /health` → `{status, worker, version, enabled, bindings_ok}`.
3. Self-doc header (purpose / capabilities / deploy method / canonical source).
4. Canonical repo dir + `deployed-current.worker.js` byte parity.
5. A `service_registry` row (name, purpose, kind, status, crons, deps, health_url,
   autonomy_level, owner).
6. Secrets listed (names only) in the registry.
7. Autonomy/kill-switch flags readable from KV or D1.

**Registry-as-truth:** `service_registry` is the only census authority. Deployed
reality reconciles to it hourly. Ghosts are auto-flagged; duplicates merged. Per-worker state
machine: `live | drifted | degraded | paused | retired`.

**Version discipline:** the 27 workers reporting `noVERSION` (scan 2026-09-09) are
invisible to drift management. The version sweep gives each a `VERSION` + `/health`
+ registry row, after which the existing drift scan can manage them. This was unblocked on
2026-09-09 when fleet-deploy v0.4.11 fixed module-worker redeploys (multipart metadata) and
demonstrated the first worker→worker mutation (fleet-advisor 0.3.2 → 0.3.3).

### 2.3 L2 — Telemetry & Ledgers
The spine is the **Run Ledger** — a single table `fleet_runs` in `qnfo-audit`:

`run_id · worker · trigger (cron|http|event|manual) · ts_start · ts_end · status ·
error_class · summary · evidence_refs · parent_run · cost`

**Instrumentation tiers:**
- **Tier 1 (critical paths):** direct writes via a **service binding** to a `qnfo-telemetry`
  worker (same-colo, no network hop), which persists to D1. This is the same worker→worker
  mechanism already proven for deploys.
- **Tier 2 (bulk):** Logpush → R2 → ingest job, for anything not Tier-1 instrumented.
- **Tier 3 (baseline):** external `/health` probes at 15-min cadence — universal, cheap,
  and the floor for every worker (today ~10 endpoints; target 100%).

**The three-questions test** — L2 alone must answer: (1) which worker failed, and why?
(2) what ran in the last hour? (3) what is scheduled next hour? Today it answers only
"is /health 200 for 10 endpoints."

Registries and ledgers (all D1): `service_registry`, `fleet_improvements`
(kaizen), `fleet_deploys` + `deployment_history` (mutations),
`fleet_drift_report`, `fleet_runs` (new), `policies` (new),
`incidents` (new).

### 2.4 L3 — Control Loops (the eight selves)
Each loop is defined by: Purpose / Trigger / Sensors / Decision / Action / Verification / Record /
Escalation. Today's status and gap are noted.

1. **SELF-AWARE (census & reconciliation).** Answers "what exists?" from one read model.
   _Today:_ three sources disagree (79 probe vs 78 dashboard vs 85 registry). _Gap:_ make the
   registry authoritative and reconcile everything to it.

2. **SELF-HEALING (heal battery).** Generalize fleet-deploy beyond version drift into a catalog
   of heal classes, each with a reversibility class and an auto policy:
   | Class | Example | Auto |
   |---|---|---|
   | Drift | deployed ≠ canonical | L2 (redeploy + verify) |
   | Liveness | /health non-200 | L2 (redeploy/restart) |
   | Queue stuck | pipeline backpressure | L2 (recover/requeue) |
   | Silent cron | missed fires | L1 (alert → L2 once trusted) |
   | Data drift | stale index/mirror | L2 (rebuild) |
   | Config drift | flag mismatch | L2 (reset) |
   _Today:_ fleet-deploy (scan/heal/NO_SELF) + error-selfheal + backlog-exec. _Gap:_ heal battery is
   redeploy-only; 27 noVERSION workers were invisible.

3. **SELF-IMPROVING (kaizen loop).** Observations → `fleet_improvements` → rank
   (severity × effort × reversibility) → execution (config auto; code via canonical→deploy;
   external via gates) → verification → ledger. Metric: **kaizen velocity** (improvements
   closed/week). _Today:_ register exists (364+ rows), weekly report exists; auto-execution
   classes are partial.

4. **SELF-AUDITING (audit calendar).** Hourly drift; daily integrity (schema/parity/secret-age);
   weekly adversarial (publications + security); monthly deep review. **Separation of powers:**
   qnfo-auditor and qnfo-fleet-calibrator stay distinct from the things they audit.
   _Today:_ auditor + calibrator exist; schedule is partial.

5. **SELF-GOVERNING (policy engine).** A `policies` table + a shared policy evaluator;
   every action tool checks policy before acting; violations → deny + `incidents` row.
   Encodes: cost ceiling, send caps, kill switches, autonomy levels, honesty rules. The
   "constitution" (values/limits) is versioned in this repo. _Today:_ policy is implicit; the
   autonomy ladder (Section 5) makes it explicit.

6. **SELF-PUBLISHING (research production line).** A D1 state machine:
   `idea → draft → computational-verify → adversarial-review → format → deposit (Zenodo) →
   mirror (R2) → index (KG/Vectorize) → announce`, with the revision loop (paper-reviser)
   and the errata loop (inbound email → errata queue → respond → new version). Gates are code
   (frontmatter, PDF page-1, citation-audit, website-sync). _Today:_ most of this exists and
   has drained to published DOIs; the loop is bursty, not continuous.

7. **SELF-PROMOTING (distribution loop).** Social threads queue → cross-post (Buffer) → outreach
   (warm-up, caps, kill switch) → engagement metrics → feed next content selection, gated by
   no-fabrication and experiment registry. _Today:_ social + outreach live; in warm-up.

8. **SELF-OPTIMIZING (cost & shape).** AI Gateway budget guard; cheap-first model routing;
   degrade under budget pressure; consolidation of redundant workers — **subject to A6** (never
   merge the observer into the observed). _Today:_ $90/30d guard exists; consolidation is proposed.

### 2.5 L4 — Intelligence Core
- **Router:** qnfo-ai gateway; model roster; cost-aware routing; ensemble for uncertainty;
  single-model for tool calls; degrade-to-cheap on budget pressure.
- **Memory:** R2 + D1 + Vectorize; run memory; recall; corpus index; personal vs research
  separation (PERSONAL-QNFO-SEPARATION).
- **Conductor:** Workflows for durable multi-step processes (publish, heal escalations, audits);
  Queues for backpressure; human-gate steps only where policy demands.
- **Ops Agent (qnfo-ops):** the fleet's hands-on maintenance intelligence — code read/write,
  workspace, web, and deploy orchestration, all server-side.

### 2.6 L5 — Action Fabric
Tool classes with risk and default autonomy:
| Class | Gate |
|---|---|
| READ | none |
| INTERNAL STATE | log + receipt |
| REVERSIBLE MUTATION | auto with read-back verify |
| EXTERNAL COMMS | caps + kill switch + warm-up |
| PUBLISH | gates + immutable artifacts |
| IRREVERSIBLE | policy/manual approval |

The **deploy engine** (canonical → build → wrangler deploy → /health poll → ledger → registry)
is now proven. Every tool call writes to the run ledger.

### 2.7 L6 — Surfaces
Public: qnfo.org, papers.qnfo.org, ideas, ipatent, RFC. Ops console: fleet dashboard + ops
gateway (the human window). Digests: daily brief (state), weekly watchtower (trends +
improvements), publication announcements. Client lenses (DeepChat/ChatBox) are read/control
lenses only — server holds truth.

### 2.8 L7 — Continuity & Recovery
Backups (chunked agent.db → R2; D1 exports; canonical sources in git; secrets in 3 stores);
DR runbook + restore drills; time-travel via ledgers; token rotation protocol. Cold-restart
invariant: **the fleet can rebuild from canonical sources + ledgers alone.**

---

## 3. Cross-Cutting Mechanisms

- **Scheduling fabric:** stagger offsets (fix 201 collisions/day; worst 15 @ 06:00 UTC); apply the
  already-set `cron_offset`; missed-fire detection with catch-up policy; dead-man alert
  for silent crons (arxiv-radar, twin-maintain, job-market-watch).
- **Run ledger** (as L2).
- **Policy & kill switches:** one table, one evaluator.
- **Cost guard:** gateway budget + alerts + auto-degrade.
- **Security & least privilege:** scoped tokens per purpose (evidence: the execute token could not
  read `/content` — scope by need), rotation, access audit.
- **Idempotency & dedupe.**
- **Adversarial verification** (already a standing standard).

---

## 4. The Autonomy Ladder

| Level | Name | Scope |
|---|---|---|
| L0 | Observing | telemetry only |
| L1 | Proposing | system proposes; human/agent approves |
| L2 | Acting-with-receipts | internal, reversible actions, auto + verified |
| L3 | Extended autonomy | external actions within caps, kill-switched |

**Promotion criteria:** ≥N consecutive successful verified cycles; zero unverified mutations;
kill-switch tested; rollback tested. **Demotion:** any harm incident or unverified mutation.

Current levels (approximate): heal = L2 (redeploy, now unblocked for module workers);
improve = L1→L2; audit = L2; publish = L2 (gated); promote = L1 (warm-up); govern = L0.
Target: publish / promote / govern → L2/L3 through the ladder.

---

## 5. Metrics of Aliveness (ALVE-1)

- **Watchmaker Index** — recurring ops needing human/agent per week → target ~0.
- **MTTH** — mean time to heal; heal success rate.
- **Iteration velocity** — deploys/week, revisions/week, improvements closed/week.
- **Drift** — % workers drifted at scan; detection latency.
- **Coverage** — % workers with VERSION / /health / registry / telemetry / probes → target 100%.
- **Integrity** — unverified mutations → target 0.
- **Cost** — $/30d vs guard; cost per artifact.
- **Output** — publication versions, citations, engagement; queue depths.
- **Human load** — open items waiting on the user → target low.

---

## 6. Migration Plan (today → AF-1)

- **Phase 0 (this week):** version sweep of 27 noVERSION workers; telemetry sink v1
  (qnfo-telemetry + fleet_runs + Tier-1 hooks on top-N workers); registry truth (purge 6 ghosts,
  register unregistered workers incl. qnfo-observability, resolve the 3-source disagreement);
  cron stagger + dead-man; ledger unification (one census query).
- **Phase 1 (2–4 weeks):** Worker Contract v1 enforced by fleet-deploy checks; probe coverage to
  100%; policy engine v1 + kill-switch registry; autonomy levels recorded per worker; heal battery
  to 5 classes.
- **Phase 2 (loops):** kaizen auto-execution classes; workflow-backed improvement runs; audit
  calendar + adversarial weekly; publish-gate hardening.
- **Phase 3 (autonomy):** flip publish/promote to L2/L3 with caps; kill-switch drills; DR drill.
- **Phase 4 (evolution):** the fleet proposes its own quarterly roadmap; humans ratify; watchmaker
  index tracked as the primary health metric.

---

## 7. Failure Modes & Honest Limits

1. **Telemetry is the hard part.** Cloudflare invocation logs are Logpush/tail territory; per-request
   D1 writes cost money and contend on writes. The tiered design (service-binding Tier-1, Logpush
   Tier-2, probes Tier-3) trades coverage for cost; expect sampling.
2. **Cron granularity and per-worker limits** are real; staggering mitigates but does not remove
   boundary collisions.
3. **Autonomy without receipts amplifies drift.** A4/A5 are the guardrails; they are what make
   self-healing safe rather than self-replicating errors.
4. **Separation of powers costs redundancy.** Keeping qnfo-fleet-dashboard separate from
   qnfo-fleet-deploy is deliberate: the probe data is trustworthy *because* an independent worker
   collected it. Do not merge them.
5. **Single-user systems** (personal vs research separation) remain split; do not collapse.
6. **Account-level features assumed.** Logpush-to-R2 needs verification; the fallback is
   service-binding-only instrumentation.
7. **Numbers in this doc will rot.** The registry and dashboards hold current numbers; this doc
   holds shapes and contracts, not live counts.

---

## 8. Open Questions

1. Logpush vs service-binding instrumentation mix (cost/coverage tradeoff).
2. Where the policy engine lives (standalone worker vs inside qnfo-ops).
3. Autonomy promotion thresholds (the value of N).
4. How far to consolidate workers vs keep independent observers.

---

## Appendix A — Fleet Snapshot (2026-09-10, sources cited)

- 79 deployed workers; 48 with crons; 31 fetch-only; ~12 dead/ghost/shell (census 2026-09-10).
- Telemetry coverage: worker_logs 1/79; worker_invocations ~5/79 (census 2026-09-10).
- 27 noVERSION workers; scan errKinds {noVERSION:27, nocanon:1, health-ver:1} (scan id 122).
- Cron collisions: 201/day, worst 15 @ 06:00 UTC (census expansion).
- service_registry 85 rows incl 6 retired ghosts (census 2026-09-10).
- This session: fleet-deploy v0.4.11 (module multipart fix), commit 55e3043; first worker→worker
  mutation fleet-advisor 0.3.2 → 0.3.3 (fleet_deploys 19:39:57Z).

## Appendix B — Glossary

- **Watchmaker Index:** share of recurring operations requiring human/agent intervention.
- **Run ledger:** the `fleet_runs` table — the audit spine.
- **Heal battery:** the catalog of autonomous repair actions.
- **Autonomy ladder:** L0–L3 promotion/demotion model.
- **Worker Contract:** the A2 checklist every worker must satisfy.
