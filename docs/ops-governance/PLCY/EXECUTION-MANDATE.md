# PLCY — Decide-Implement-Deploy Mandate (DID)

> Version 1.0 (2026-10-17) · Owner: QNFO · Status: ACTIVE
> Policy ID: QNFO-POL-DID-004 · KG node: policy-decide-implement-deploy
> Amends: QNFO-POL-PROD-IMMUTABLE-002 (per-action "explicit user authorization" for the DID loop only)
> Amends: docs/SLA.md (adds per-step SLA + multi-path Definition of Done)
> Amends: AUTONOMOUS-FLEET-ARCHITECTURE.md §4 (autonomy ladder default)
> Source: user mandate 2026-10-17 — "THE SYSTEM SHALL ALWAYS DECIDE, IMPLEMENT, AND
> DEPLOY SYSTEMWIDE ACROSS THE FLEET. ALL STEPS, ALL PROCESSES SHALL HAVE SLA AND
> MULTIPLE EXECUTION/REMEDIATION/WORKAROUND PATHS TO SUCCESSFUL DEFINITION OF DONE."

## 1. The DID imperative

Every accepted work item proceeds through four stages without stalling:

    DECIDE → IMPLEMENT → DEPLOY → VERIFY

- A task is "in progress" only if it is moving toward DEPLOY. A task parked at
  "decided" or "implemented locally" is a DID violation.
- "Deploy" means the change is live **systemwide** — across all affected fleet
  workers, repos, ledgers, and surfaces — not present on one host or one branch.
- No stage may be skipped and no stage may be a dead end.

## 2. Universal SLA (every step, every process)

The severity tiers in `docs/SLA.md` (P0 <4h, P1 <24h, P2 <72h, P3 <7d or
defer-with-rationale) remain canonical for item-level resolution. This policy adds:

- **Per-step SLA**: each stage of a process carries its own time budget. A step
  with no budget is undefined; define one before executing.
- **Breach → escalate**: step-SLO breach → auto-file an `agent_issue`; 2x breach →
  a single blocking question to the operator.
- **No step exempt**: intake, triage, research, review, publish, deploy, verify,
  disseminate — every one carries an SLO.

## 3. Multi-path Definition of Done

Each process defines its DoD **once** — falsifiable and evidence-backed (per the
qnfo-core `close_evidence` discipline) — then maps at least two independent
execution paths to that same DoD:

| Path | Role |
|------|------|
| Primary | canonical tool/method; first attempt |
| Remediation | retry/fix when the primary fails (idempotent, same DoD) |
| Workaround | alternate tool/route when remediation fails (same DoD) |

- All paths terminate in the SAME DoD at the SAME evidence bar. A path is not
  "done" until the DoD is met and the evidence is logged.
- No single point of failure may block success: a step with exactly one path is a
  gap to close, not a completed design.

## 4. Reconciliation with the Production Immutability Gate

- `QNFO-POL-PROD-IMMUTABLE-002` is RETAINED for its safety intent (no surprise
  production damage; verification-before-trust) but AMENDED: the per-action
  "explicit user authorization" block is removed for the DID loop, which now runs
  autonomously by default.
- Unchanged hard gates (still require approval; never auto-executed):
  - destructive / irreversible actions (delete, drop, data loss);
  - external sends and paid calls;
  - account-level, DNS, and secret mutations;
  - blast-radius caps (AF-1 A7), cost ceilings (A9), and kill-switches.
- The surprise test is retained as a **post-hoc audit** ("would the user be
  surprised this changed?") — not as a pre-action block. Every autonomous mutation
  still writes a run-ledger receipt and read-back verification (AF-1 A5).

## 5. Falsifiability & limits

- Failure mode this policy must not produce: rapid low-visibility mutations that
  compound before detection — the exact damage the immutability gate was built to
  prevent. Compensation: mandatory receipts + read-back on every path (A5),
  kill-switch drills, and 2x-SLO escalation as the detection floor.
- Success metric: Watchmaker Index → ~0 (recurring ops needing a human per week),
  with zero unverified mutations (AF-1 ALVE-1).
